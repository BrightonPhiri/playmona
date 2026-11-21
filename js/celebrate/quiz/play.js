/* ============================================================
   PLAYMONA — celebrate/quiz/play.js
   The quiz on a guest's phone. It reads the referee's view at
   celebrations/<cid>/run and sends the team's pick to
   celebrations/<cid>/inbox/<uid>/<id>. A tap lights at once on
   this phone and settles on the referee's pick when it arrives;
   the referee decides everything that counts.

     var p = FF.QuizPlay.mount(host, { transport, uid, onClose });
     p.destroy();
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.QuizRules;
  var list = R.list;
  var LETTERS = ['A', 'B', 'C', 'D'];

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(name) { return FF.Icons && FF.Icons.icon ? FF.Icons.icon(name) : document.createTextNode(''); }
  function sfx(name) { if (FF.Audio && FF.Audio.play) { if (FF.safe) FF.safe(function () { FF.Audio.play(name); }); else FF.Audio.play(name); } }

  function cmdId() {
    var bytes = [];
    var c = window.crypto;
    if (c && c.getRandomValues) bytes = Array.prototype.slice.call(c.getRandomValues(new Uint8Array(12)));
    else for (var i = 0; i < 12; i++) bytes.push(Math.floor(Math.random() * 256));
    return 'c' + bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function teamChip(team) {
    var chip = el('span', 'pr-team');
    var dot = el('span', 'pr-team__dot');
    dot.style.background = team.color || 'currentColor';
    chip.appendChild(dot);
    chip.appendChild(el('span', '', team.name));
    return chip;
  }

  function mount(host, ctx) {
    var T = ctx.transport;
    var uid = ctx.uid;
    var root = el('section', 'pr qz');
    root.setAttribute('aria-live', 'polite');
    host.appendChild(root);

    var v = null;
    var nextN = -1;
    var sentN = -1;            // the number of the command this phone sent last
    var guess = null;          // { q, choice }: this phone's tap, shown until the referee answers
    var screenKey = '';
    var ticker = null;
    var stopped = false;
    var parts = {};
    var played = {};

    function once(key, name) {
      if (played[v.runId + ':' + key]) return;
      played[v.runId + ':' + key] = true;
      sfx(name);
    }

    function now() { return T.serverNow(); }
    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    function myTeam() {
      if (!v || !v.teams) return '';
      var ids = Object.keys(v.teams);
      for (var i = 0; i < ids.length; i++) {
        var p = v.teams[ids[i]].players || {};
        if (Object.prototype.hasOwnProperty.call(p, uid)) return ids[i];
      }
      return '';
    }
    function serverN() { return (v && v.n && typeof v.n[uid] === 'number') ? v.n[uid] : 0; }
    function mySaid() { return (v && v.said && v.said[uid]) || null; }
    function waitingForReply() { var s = mySaid(); return sentN >= 0 && (!s || s.n < sentN); }
    function teamPick() { return (v && v.picks && v.picks[myTeam()]) || null; }

    /* The choice lit on this phone: the tap still on its way, or the team's pick. */
    function shown() {
      if (guess && v && guess.q === v.q && waitingForReply()) return guess.choice;
      var p = teamPick();
      return p ? p.choice : -1;
    }

    function send(type, extra) {
      if (!v || stopped || v.phase !== 'question') return;
      if (nextN < serverN()) nextN = serverN();
      sentN = nextN;
      var cmd = { type: type, runId: v.runId, n: nextN++, t: stamp(), q: v.q };
      if (extra) Object.keys(extra).forEach(function (k) { cmd[k] = extra[k]; });
      T.set('inbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        sentN = -1;
        guess = null;
        // It never arrived: the next tap reuses its number, so the referee isn't left waiting for it.
        if (nextN === cmd.n + 1) nextN = cmd.n;
        if (parts.error) parts.error.textContent = t('qzNotSent', 'That did not send. Check your connection and try again.');
        refresh();
      });
      refresh();
    }

    function clear() {
      parts = {};
      while (root.firstChild) root.removeChild(root.firstChild);
    }

    function header() {
      var top = el('div', 'pr-top');
      var title = el('div', 'pr-top__title');
      title.appendChild(el('strong', '', v.name || t('celQuizName', 'Quiz')));
      if (v.phase === 'question' || v.phase === 'reveal') {
        title.appendChild(el('span', 'pr-top__round', t('qzQuestionOf', 'Question {n} of {total}', { n: v.q + 1, total: v.total })));
      }
      top.appendChild(title);
      parts.timer = el('span', 'pr-timer');
      parts.timer.setAttribute('role', 'timer');
      top.appendChild(parts.timer);
      root.appendChild(top);
      var tid = myTeam();
      if (tid) {
        var row = el('div', 'wbw-me');
        row.appendChild(teamChip(v.teams[tid]));
        parts.points = el('span', 'pr-num');
        row.appendChild(parts.points);
        root.appendChild(row);
      }
    }

    function pausedNote() {
      parts.paused = el('p', 'pr-paused', t('prPaused', 'Paused by the organiser. Hold on…'));
      parts.paused.hidden = !v.paused;
      root.appendChild(parts.paused);
    }

    /* Every team: still thinking or sure during a question; right or wrong at the reveal. Never their pick. */
    function strip() {
      var ol = el('ol', 'wbw-order qz-strip');
      parts.strip = ol;
      fillStrip();
      return ol;
    }
    function fillStrip() {
      var ol = parts.strip;
      if (!ol) return;
      while (ol.firstChild) ol.removeChild(ol.firstChild);
      list(v.order).forEach(function (tid) {
        var tm = v.teams[tid] || { name: '?' };
        var li = el('li', tid === myTeam() ? 'is-mine' : '');
        li.appendChild(teamChip(tm));
        var p = (v.picks || {})[tid];
        var note;
        if (v.phase === 'reveal') note = (v.got || {})[tid] ? t('qzGotIt', 'Right ✓') : t('qzMissed', 'Wrong ✗');
        else note = p && p.sure ? t('qzSure', 'Sure ✓') : t('qzThinking', 'Thinking…');
        li.appendChild(el('span', 'pr-num', note));
        ol.appendChild(li);
      });
    }

    /* ---------- screens ---------- */

    function screenStarting() {
      header();
      var card = el('div', 'pr-card pr-ready');
      card.appendChild(el('p', 'pr-ready__kicker', t('prGetReady', 'Get ready')));
      parts.big = el('p', 'pr-ready__count');
      card.appendChild(parts.big);
      if (v.instructions) card.appendChild(el('p', 'pr-ready__how', v.instructions));
      card.appendChild(el('p', 'pr-ready__tip', t('qzTip', 'Talk it over with your team. Anyone can tap an answer, and the one lit when time runs out counts.')));
      if (!myTeam()) card.appendChild(el('p', 'pr-note', t('prNoTeam', 'You are not in a team for this game, so you can watch along.')));
      root.appendChild(card);
      pausedNote();
    }

    function choiceList(reveal) {
      var ul = el('ul', 'qz-choices');
      parts.choices = [];
      list(v.question.choices).forEach(function (text, i) {
        var li = el('li', '');
        var b = el('button', 'qz-choice');
        b.type = 'button';
        b.appendChild(el('span', 'qz-choice__letter', LETTERS[i] || String(i + 1)));
        b.appendChild(el('span', 'qz-choice__text', text));
        var by = el('span', 'qz-choice__by');
        b.appendChild(by);
        if (!reveal) {
          b.addEventListener('click', function () {
            if (!myTeam() || v.paused) return;
            var p = teamPick();
            if (p && p.sure) return;
            if (shown() === i) return;
            guess = { q: v.q, choice: i };
            if (parts.error) parts.error.textContent = '';
            send('pick', { choice: i });
            sfx('tap');
          });
        }
        li.appendChild(b);
        ul.appendChild(li);
        parts.choices.push({ btn: b, by: by });
      });
      var tm = v.teams[myTeam()];
      if (tm) ul.style.setProperty('--team', tm.color || '');
      return ul;
    }

    function screenQuestion() {
      header();
      var card = el('div', 'pr-card qz-card');
      card.appendChild(el('h2', 'qz-question', v.question.text));
      card.appendChild(choiceList(false));
      if (myTeam()) {
        var sure = el('button', 'ev-btn qz-sure');
        sure.type = 'button';
        sure.appendChild(icon('check'));
        sure.appendChild(el('span', '', t('qzWereSure', 'We\'re sure')));
        sure.addEventListener('click', function () { send('sure'); sfx('tap'); });
        card.appendChild(sure);
        parts.sure = sure;
        parts.locked = el('p', 'pr-note qz-locked', t('qzLockedIn', 'Locked in. Waiting for the other teams…'));
        card.appendChild(parts.locked);
        parts.error = el('p', 'wbw-form__error');
        parts.error.setAttribute('role', 'alert');
        card.appendChild(parts.error);
      } else {
        card.appendChild(el('p', 'pr-note', t('prNoTeam', 'You are not in a team for this game, so you can watch along.')));
      }
      root.appendChild(card);
      root.appendChild(strip());
      pausedNote();
      refresh();
      once('q:' + v.q, 'roundStart');
    }

    function screenReveal() {
      header();
      var card = el('div', 'pr-card qz-card is-reveal');
      card.appendChild(el('h2', 'qz-question', v.question.text));
      card.appendChild(choiceList(true));
      var tid = myTeam();
      var mine = (v.picks || {})[tid];
      parts.choices.forEach(function (c, i) {
        c.btn.disabled = true;
        if (i === v.right) { c.btn.classList.add('is-right'); c.by.textContent = t('qzRightAnswer', 'The answer'); }
        else if (mine && mine.choice === i) c.btn.classList.add('is-wrong');
        if (mine && mine.choice === i) c.btn.classList.add('is-picked');
      });
      if (tid) {
        var got = !!(v.got || {})[tid];
        card.appendChild(el('p', 'qz-result ' + (got ? 'is-right' : 'is-wrong'), got
          ? t('qzPlusPoints', 'Right! +{n} points', { n: v.points })
          : mine ? t('qzNoPoints', 'Not this time. No points.') : t('qzNoAnswer', 'No answer this time. No points.')));
        once('r:' + v.q, got ? 'correct' : 'wrong');
      }
      root.appendChild(card);
      root.appendChild(strip());
      pausedNote();
    }

    function screenEnded() {
      var res = v.result || { rows: [], winners: [] };
      var rows = list(res.rows);
      var winners = list(res.winners);
      var card = el('div', 'pr-card pr-final');
      card.appendChild(el('p', 'pr-final__kicker', v.name || t('celQuizName', 'Quiz')));
      var names = winners.map(function (id) { return (v.teams[id] || {}).name || ''; }).filter(Boolean);
      card.appendChild(el('h2', 'pr-final__win', !names.length ? t('prNoScore', 'Nobody scored this time') : names.length > 1
        ? t('prWinnersTie', 'A tie! {names} win', { names: names.join(' & ') })
        : t('prWinner', '{name} wins!', { name: names[0] })));
      if (winners.indexOf(myTeam()) !== -1) card.appendChild(el('p', 'pr-final__you', t('prYouWon', 'That is your team. Well played!')));
      root.appendChild(card);
      var table = el('ol', 'pr-podium');
      rows.forEach(function (r) {
        var li = el('li', r.teamId === myTeam() ? 'is-mine' : '');
        li.appendChild(el('span', 'pr-podium__place', String(r.place)));
        li.appendChild(teamChip(v.teams[r.teamId] || { name: '?' }));
        li.appendChild(el('span', 'pr-num', t('prPoints', '{n} points', { n: r.points })));
        table.appendChild(li);
      });
      root.appendChild(table);
      if (ctx.onClose) {
        var back = el('button', 'ev-btn', t('prBack', 'Back to the celebration'));
        back.type = 'button';
        back.addEventListener('click', ctx.onClose);
        root.appendChild(back);
      }
      if (!played[v.runId + ':end']) {
        played[v.runId + ':end'] = true;
        sfx('winner');
        if (FF.Confetti && FF.Confetti.burst && FF.safe) FF.safe(function () { FF.Confetti.burst(winners.indexOf(myTeam()) !== -1 ? 220 : 90); });
      }
    }

    /* ---------- the live parts ---------- */

    function why(code) {
      if (code === 'locked') return t('qzErrLocked', 'Your team is sure, so the answer is locked.');
      if (code === 'late') return t('qzErrLate', 'Too late, time is up.');
      if (code === 'paused') return t('qzErrPaused', 'The game is paused. Try again when it carries on.');
      if (code === 'noPick') return t('qzErrNoPick', 'Pick an answer first.');
      if (code === 'noTeam') return t('qzErrNoTeam', 'You are not in a team for this game.');
      return t('qzErr', 'That did not count. Try again.');
    }

    /* The lit choice, who picked it, and the We're sure button. */
    function refresh() {
      if (!parts.choices || v.phase !== 'question') return;
      var lit = shown();
      var p = teamPick();
      var locked = !!(p && p.sure);
      parts.choices.forEach(function (c, i) {
        var on = i === lit;
        c.btn.classList.toggle('is-picked', on);
        c.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        c.btn.disabled = !myTeam() || locked || !!v.paused;
        c.by.textContent = on && p && p.choice === i && p.by ? t('qzPickedBy', '{name} picked this', { name: p.by }) : '';
      });
      if (parts.sure) {
        parts.sure.hidden = locked;
        parts.sure.disabled = !p || waitingForReply() || !!v.paused;
        parts.locked.hidden = !locked;
      }
      var s = mySaid();
      if (s && s.n === sentN && s.error && parts.error) {
        parts.error.textContent = why(s.error);
        guess = null;
        if (!played['err:' + s.n]) { played['err:' + s.n] = true; sfx('wrong'); }
      }
    }

    function draw() {
      if (!v || stopped) return;
      // The dev transport writes one field at a time: wait for the question.
      if ((v.phase === 'question' || v.phase === 'reveal') && !(v.question && list(v.question.choices).length)) return;
      // The question text too: fields can land one at a time, so q may move before the new question arrives.
      var key = v.runId + ':' + v.phase + ':' + v.q + ':' + (myTeam() || '-') + ':' + (v.question ? v.question.text + list(v.question.choices).join('|') : '');
      if (v.phase === 'reveal') key += ':' + v.right + ':' + JSON.stringify(v.got || null);
      if (v.phase === 'ended') key += ':' + JSON.stringify(v.result || null);
      if (key !== screenKey) {
        screenKey = key;
        if (v.phase !== 'question') guess = null;
        clear();
        if (v.phase === 'starting') screenStarting();
        else if (v.phase === 'question') screenQuestion();
        else if (v.phase === 'reveal') screenReveal();
        else if (v.phase === 'ended') screenEnded();
      } else {
        refresh();
        fillStrip();
      }
      if (parts.points) parts.points.textContent = t('prPoints', '{n} points', { n: ((v.totals || {})[myTeam()] || {}).points || 0 });
      if (parts.paused) parts.paused.hidden = !v.paused;
      tick();
    }

    var lastBeep = -1;
    function tick() {
      if (!v) return;
      var left = 0;
      if (v.phase === 'starting') left = v.startAt - now();
      else if (v.phase === 'question') left = v.paused ? (v.leftMs || 0) : v.deadline - now();
      left = Math.max(0, left);
      if (parts.timer) {
        parts.timer.textContent = v.phase === 'question' || v.phase === 'starting' ? clock(left) : '';
        parts.timer.classList.toggle('is-low', v.phase === 'question' && left <= 5000);
      }
      if (parts.big) parts.big.textContent = String(Math.ceil(left / 1000));
      var s = Math.ceil(left / 1000);
      if (!v.paused && s !== lastBeep && s > 0 && s <= 3 && (v.phase === 'starting' || v.phase === 'question')) { lastBeep = s; sfx('countdown'); }
    }

    var off = T.watch('run', function (val) {
      if (stopped || !val) return;
      if (v && val.runId !== v.runId) { nextN = -1; sentN = -1; screenKey = ''; guess = null; }
      v = val;
      v.teams = v.teams || {};
      draw();
    });
    ticker = setInterval(tick, 250);

    return {
      view: function () { return v; },
      destroy: function () {
        stopped = true;
        if (ticker) clearInterval(ticker);
        if (typeof off === 'function') off();
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  FF.QuizPlay = { mount: mount };
})();
