/* ============================================================
   PLAYMONA — celebrate/wordByWord/play.js
   Word by Word on a guest's phone. It reads the referee's view at
   celebrations/<cid>/run and sends the group's word to
   celebrations/<cid>/inbox/<uid>/<id> on its turn. The referee
   decides everything that counts: whose turn it is, whether the
   word is allowed and what it scores.

     var p = FF.WordByWordPlay.mount(host, { transport, uid, onClose });
     p.destroy();
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordByWordRules;
  var list = R.list;
  var REVEAL_MS = 300;       // the phone's reveal is quicker than the TV's

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

  function soFar(n) {
    n = n || 0;
    return n === 1 ? t('wbwOneWordSoFar', '1 word so far') : t('wbwWordsSoFar', '{n} words so far', { n: n });
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

  /* Why the referee did not take a word, in the guest's words. */
  function reason(code, v) {
    if (code === 'rude') return t('wbwRude', 'Let\'s keep it kind. Try another word.');
    if (code === 'unknown') return t('wbwUnknown', 'We don\'t know that word. Check the spelling, or use a capital for a name.');
    if (code === 'spaces') return t('wbwSpaces', 'Just one word, please.');
    if (code === 'long') return t('wbwLong', 'That word is too long.');
    if (code === 'punct' || code === 'letters') return t('wbwLetters', 'Letters only, with . , or ! at the end.');
    if (code === 'empty') return t('wbwEmpty', 'Type a word first.');
    if (code === 'late') return t('wbwLate', 'Too late, the turn has moved on.');
    if (code === 'notYourTurn') return t('wbwNotYourTurn', 'Wait for your group\'s turn.');
    if (code === 'paused') return t('wbwPausedNow', 'The game is paused. Send it when it carries on.');
    if (code === 'tooSoon') {
      var teams = list(v.order).length || 1;
      var need = v.minUnit === 'words' ? v.minCount : v.minCount * teams;
      return t('wbwTooSoon', 'You can end the message after {n} more words.', { n: Math.max(1, need - (v.count || 0)) });
    }
    return t('wbwRefused', 'That word was not taken. Try another.');
  }

  function mount(host, ctx) {
    var T = ctx.transport;
    var uid = ctx.uid;
    var root = el('section', 'pr wbw');
    root.setAttribute('aria-live', 'polite');
    host.appendChild(root);

    var v = null;
    var nextN = -1;
    var sentN = -1;            // the number of the word this phone sent last
    var screenKey = '';
    var ticker = null;
    var stopped = false;
    var parts = {};
    var draftWord = '';        // what was typed, kept if the screen redraws
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
    function myTurn() { return !!(v && v.phase === 'playing' && v.turn && v.turn.teamId === myTeam()); }
    function serverN() { return (v && v.n && typeof v.n[uid] === 'number') ? v.n[uid] : 0; }
    function mySaid() { return (v && v.said && v.said[uid]) || null; }
    function waitingForReply() { var s = mySaid(); return sentN >= 0 && (!s || s.n < sentN); }

    function send(word, end) {
      if (!v || stopped || !v.turn) return;
      if (nextN < serverN()) nextN = serverN();
      sentN = nextN;
      var cmd = { type: 'word', runId: v.runId, n: nextN++, t: stamp(), word: word, end: !!end, turn: v.turn.id };
      T.set('inbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        sentN = -1;
        // It never arrived: the next word reuses its number, so the referee isn't left waiting for it.
        if (nextN === cmd.n + 1) nextN = cmd.n;
        if (parts.error) parts.error.textContent = t('wbwNotSent', 'That did not send. Check your connection and try again.');
        refreshForm();
      });
      refreshForm();
    }

    function clear() {
      parts = {};
      while (root.firstChild) root.removeChild(root.firstChild);
    }

    function header() {
      var top = el('div', 'pr-top');
      var title = el('div', 'pr-top__title');
      title.appendChild(el('strong', '', v.name || t('celWbwName', 'Word by Word')));
      if (v.phase === 'playing') title.appendChild(el('span', 'pr-top__round', t('wbwRoundOf', 'Round {n} of {total}', { n: (v.round || 0) + 1, total: v.rounds })));
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

    /* The message so far (open), or only the word before yours (blind). */
    function messageBox() {
      var box = el('div', 'wbw-msg');
      parts.msg = box;
      fillMessage();
      return box;
    }
    function fillMessage() {
      var box = parts.msg;
      if (!box) return;
      while (box.firstChild) box.removeChild(box.firstChild);
      if (v.mode === 'open') {
        var p = el('p', 'wbw-msg__text');
        if (v.opening) p.appendChild(el('span', 'wbw-w is-opening', v.opening));
        list(v.words).forEach(function (x) {
          var w = el('span', 'wbw-w', x.w);
          w.style.setProperty('--team', (v.teams[x.teamId] || {}).color || 'currentColor');
          p.appendChild(document.createTextNode(' '));
          p.appendChild(w);
        });
        if (!list(v.words).length && !v.opening) p.appendChild(el('span', 'wbw-msg__empty', t('wbwFirstWord', 'No words yet. The first word starts the message.')));
        box.appendChild(p);
      } else {
        var last = v.last ? v.last.w : v.opening;
        box.appendChild(el('p', 'wbw-msg__kicker', last ? t('wbwLastWord', 'The word before yours') : t('wbwNoWordYet', 'Nobody has added a word yet')));
        if (last) box.appendChild(el('p', 'wbw-msg__last', last));
        box.appendChild(el('p', 'wbw-msg__count', soFar(v.count)));
      }
    }

    function orderList() {
      var ol = el('ol', 'wbw-order');
      parts.order = ol;
      fillOrder();
      return ol;
    }
    function fillOrder() {
      var ol = parts.order;
      if (!ol) return;
      while (ol.firstChild) ol.removeChild(ol.firstChild);
      list(v.order).forEach(function (tid) {
        var tm = v.teams[tid] || { name: '?' };
        var li = el('li', (v.turn && v.turn.teamId === tid ? 'is-turn' : '') + (tid === myTeam() ? ' is-mine' : ''));
        li.appendChild(teamChip(tm));
        li.appendChild(el('span', 'pr-num', t('prPoints', '{n} points', { n: ((v.totals || {})[tid] || {}).points || 0 })));
        ol.appendChild(li);
      });
    }

    /* ---------- screens ---------- */

    function screenStarting() {
      header();
      var card = el('div', 'pr-card pr-ready');
      card.appendChild(FF.Celebrate.gameArt('wordByWord', 'pr-ready__art'));
      card.appendChild(el('p', 'pr-ready__kicker', t('prGetReady', 'Get ready')));
      // Before the countdown each team presses "We're ready" (js/celebrate/ready.js).
      if (v.waitReady) card.appendChild(FF.CelebrateReady.block(v, { uid: uid, team: myTeam(), T: T }));
      else { parts.big = el('p', 'pr-ready__count'); card.appendChild(parts.big); }
      if (v.instructions) card.appendChild(el('p', 'pr-ready__how', v.instructions));
      card.appendChild(el('p', 'pr-ready__tip', v.mode === 'blind'
        ? t('wbwTipBlind', 'On your group\'s turn, add one word. You only see the word before yours, so keep the message going!')
        : t('wbwTipOpen', 'On your group\'s turn, add one word to the message. Longer words score more.')));
      if (!myTeam()) card.appendChild(el('p', 'pr-note', t('prNoTeam', 'You are not in a team for this game, so you can watch along.')));
      root.appendChild(card);
      pausedNote();
    }

    function screenMyTurn() {
      header();
      var card = el('div', 'pr-card wbw-turn');
      card.appendChild(el('h2', 'wbw-turn__say', t('wbwYourTurn', 'Your turn!')));
      card.appendChild(messageBox());
      var form = el('form', 'wbw-form');
      form.setAttribute('novalidate', '');
      var input = el('input', 'input wbw-form__input');
      input.type = 'text';
      input.maxLength = R.MAX_INPUT;
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('enterkeyhint', 'send');
      input.setAttribute('aria-label', t('wbwYourWord', 'Your word'));
      input.placeholder = t('wbwTypeWord', 'Type one word');
      input.value = draftWord;
      input.addEventListener('input', function () { draftWord = input.value; if (parts.error) parts.error.textContent = ''; });
      var btn = el('button', 'ev-btn wbw-form__send');
      btn.type = 'submit';
      btn.appendChild(icon('check'));
      btn.appendChild(el('span', '', t('wbwSend', 'Send')));
      var row = el('div', 'wbw-form__row');
      row.appendChild(input);
      row.appendChild(btn);
      form.appendChild(row);
      var endLabel = el('label', 'wbw-form__end');
      var endBox = el('input');
      endBox.type = 'checkbox';
      endLabel.appendChild(endBox);
      endLabel.appendChild(el('span', '', t('wbwEndHere', 'End the message here')));
      form.appendChild(endLabel);
      parts.error = el('p', 'wbw-form__error');
      parts.error.setAttribute('role', 'alert');
      form.appendChild(parts.error);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var word = input.value.trim();
        if (!word) { parts.error.textContent = reason('empty', v); input.focus(); return; }
        if (/\s/.test(word)) { parts.error.textContent = reason('spaces', v); input.focus(); return; }
        parts.error.textContent = '';
        send(word, endBox.checked);
        sfx('tap');
      });
      card.appendChild(form);
      parts.input = input;
      parts.send = btn;
      parts.end = endLabel;
      parts.endBox = endBox;
      root.appendChild(card);
      root.appendChild(orderList());
      pausedNote();
      refreshForm();
      setTimeout(function () { if (!stopped && parts.input === input) input.focus(); }, 50);
      once('turn:' + v.turn.id, 'roundStart');
    }

    function screenWaiting() {
      header();
      var card = el('div', 'pr-card wbw-wait');
      var cur = v.turn && v.teams[v.turn.teamId];
      var say = el('p', 'wbw-wait__who');
      say.appendChild(el('span', '', t('wbwWaitingFor', 'Waiting for')));
      if (cur) say.appendChild(teamChip(cur));
      card.appendChild(say);
      if (v.mode === 'open') card.appendChild(messageBox());
      else card.appendChild(el('p', 'wbw-msg__count', soFar(v.count)));
      if (!myTeam()) card.appendChild(el('p', 'pr-note', t('prNoTeam', 'You are not in a team for this game, so you can watch along.')));
      root.appendChild(card);
      root.appendChild(orderList());
      pausedNote();
    }

    /* The whole message, a word at a time, in each team's colour. */
    function screenReveal() {
      header();
      var card = el('div', 'pr-card wbw-reveal');
      card.appendChild(el('p', 'pr-ready__kicker', t('wbwTheMessage', 'The message')));
      var p = el('p', 'wbw-reveal__text');
      card.appendChild(p);
      root.appendChild(card);
      var bits = [];
      if (v.opening) bits.push({ w: v.opening, opening: true });
      list(v.words).forEach(function (x) { bits.push(x); });
      bits.forEach(function (x, i) {
        var w = el('span', 'wbw-w is-hidden' + (x.opening ? ' is-opening' : ''), x.w);
        if (!x.opening) w.style.setProperty('--team', (v.teams[x.teamId] || {}).color || 'currentColor');
        p.appendChild(w);
        p.appendChild(document.createTextNode(' '));
        setTimeout(function () { if (!stopped) w.classList.remove('is-hidden'); }, i * REVEAL_MS);
      });
      once('reveal', 'roundEnd');
    }

    function screenEnded() {
      var res = v.result || { rows: [], winners: [] };
      var rows = list(res.rows);
      var winners = list(res.winners);
      var card = el('div', 'pr-card pr-final');
      card.appendChild(el('p', 'pr-final__kicker', v.name || t('celWbwName', 'Word by Word')));
      if (res.text) card.appendChild(el('blockquote', 'wbw-final__text', res.text));
      var names = winners.map(function (id) { return (v.teams[id] || {}).name || ''; }).filter(Boolean);
      card.appendChild(el('h2', 'pr-final__win', !names.length ? t('prNoScore', 'Nobody scored this time') : names.length > 1
        ? t('prWinnersTie', 'A tie! {names} win', { names: names.join(' & ') })
        : t('prWinner', '{name} wins!', { name: names[0] })));
      if (winners.indexOf(myTeam()) !== -1) card.appendChild(el('p', 'pr-final__you', t('prYouWon', 'That is your team. Well played!')));
      if (list(res.words).length >= 2) card.appendChild(el('p', 'pr-note', t('wbwOnWall', 'Your message is going on the Wall of Love.')));
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

    /* The word box: off while a word is on its way or the game is paused; the end box once allowed. */
    function refreshForm() {
      if (!parts.send) return;
      var busy = waitingForReply();
      parts.send.disabled = busy || !!v.paused;
      parts.input.disabled = !!v.paused;
      parts.end.hidden = !v.minReached;
      if (!v.minReached) parts.endBox.checked = false;
      var s = mySaid();
      if (s && s.n === sentN && s.error && parts.error) {
        parts.error.textContent = reason(s.error, v);
        if (!played['err:' + s.n]) { played['err:' + s.n] = true; sfx('wrong'); }
      }
    }

    function draw() {
      if (!v || stopped) return;
      var mine = myTurn();
      var key = v.runId + ':' + v.phase + ':' + (v.turn ? v.turn.id + '/' + v.turn.teamId : '-') + ':' + (myTeam() || '-') + ':' + mine + (v.phase === 'starting' ? ':' + (v.waitReady ? 'w' + Object.keys(v.ready || {}).sort().join(',') : 'c') : '');
      if (v.phase === 'ended') key += ':' + JSON.stringify(v.result || null);
      if (key !== screenKey) {
        var wasMine = parts.input && screenKey.split(':')[0] === v.runId;
        if (!mine) draftWord = '';
        screenKey = key;
        clear();
        if (v.phase === 'starting') screenStarting();
        else if (v.phase === 'playing') { if (mine) screenMyTurn(); else screenWaiting(); }
        else if (v.phase === 'reveal') screenReveal();
        else if (v.phase === 'ended') screenEnded();
        if (wasMine && !mine && v.phase === 'playing') sfx('correct');
      } else {
        fillMessage();
        fillOrder();
        refreshForm();
      }
      if (parts.points) parts.points.textContent = t('prPoints', '{n} points', { n: ((v.totals || {})[myTeam()] || {}).points || 0 });
      if (parts.paused) parts.paused.hidden = !v.paused;
      tick();
    }

    var lastBeep = -1;
    function tick() {
      if (!v) return;
      if (v.phase === 'starting' && v.waitReady) { if (parts.timer) parts.timer.textContent = ''; return; }
      var left = 0;
      if (v.phase === 'starting') left = v.startAt - now();
      else if (v.phase === 'playing' && v.turn) left = v.paused ? (v.turn.leftMs || 0) : v.turn.endsAt - now();
      left = Math.max(0, left);
      if (parts.timer) {
        parts.timer.textContent = v.phase === 'playing' || v.phase === 'starting' ? clock(left) : '';
        parts.timer.classList.toggle('is-low', myTurn() && left <= 5000);
      }
      if (parts.big) parts.big.textContent = String(Math.ceil(left / 1000));
      var s = Math.ceil(left / 1000);
      if (!v.paused && s !== lastBeep && s > 0 && s <= 3 && (v.phase === 'starting' || myTurn())) { lastBeep = s; sfx('countdown'); }
    }

    var off = T.watch('run', function (val) {
      if (stopped || !val) return;
      if (v && val.runId !== v.runId) { nextN = -1; sentN = -1; screenKey = ''; draftWord = ''; }
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

  FF.WordByWordPlay = { mount: mount };
})();
