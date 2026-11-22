/* ============================================================
   PLAYMONA — celebrate/library/play.js
   A library game at a celebration, on a guest's phone (the event
   page). It reads the referee's view at celebrations/<cid>/run:
   Get ready (and "We're ready"), then a Play button that opens the
   game on the game page with the run's seed (FF.LibraryRules.link).
   The game page sends the score itself; back here the phone shows
   "Your score is in", the groups that have finished, and the end.

     var p = FF.LibraryPlay.mount(host, { transport, uid, onClose });
     p.destroy();
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.LibraryRules;

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(name) { return FF.Icons && FF.Icons.icon ? FF.Icons.icon(name) : document.createTextNode(''); }
  function sfx(name) { if (FF.Audio && FF.Audio.play) { if (FF.safe) FF.safe(function () { FF.Audio.play(name); }); else FF.Audio.play(name); } }
  function list(v) { return Array.isArray(v) ? v.filter(function (x) { return x != null; }) : v && typeof v === 'object' ? Object.keys(v).sort().map(function (k) { return v[k]; }) : []; }

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
    var root = el('section', 'pr lib');
    root.setAttribute('aria-live', 'polite');
    host.appendChild(root);

    var v = null;
    var screenKey = '';
    var ticker = null;
    var stopped = false;
    var parts = {};
    var played = {};

    function now() { return T.serverNow(); }

    function myTeam() {
      if (!v || !v.teams) return '';
      var ids = Object.keys(v.teams);
      for (var i = 0; i < ids.length; i++) {
        var p = v.teams[ids[i]].players || {};
        if (Object.prototype.hasOwnProperty.call(p, uid)) return ids[i];
      }
      return '';
    }
    function myScore() { return v && v.mine && Object.prototype.hasOwnProperty.call(v.mine, uid) ? v.mine[uid] : null; }

    function clear() {
      parts = {};
      while (root.firstChild) root.removeChild(root.firstChild);
    }

    function header() {
      var top = el('div', 'pr-top');
      var title = el('div', 'pr-top__title');
      title.appendChild(el('strong', '', v.name || t('celLibName', 'Library game')));
      if (v.phase === 'playing') title.appendChild(el('span', 'pr-top__round', t('celLibOnPhones', 'On phones')));
      top.appendChild(title);
      parts.timer = el('span', 'pr-timer');
      parts.timer.setAttribute('role', 'timer');
      top.appendChild(parts.timer);
      root.appendChild(top);
      var tid = myTeam();
      if (tid) {
        var row = el('div', 'wbw-me');
        row.appendChild(teamChip(v.teams[tid]));
        root.appendChild(row);
      }
    }

    /* The groups that have finished, best score first, and how many are still playing. */
    function finishedList() {
      var box = el('div', 'lib-board');
      var done = Object.keys(v.finished || {}).filter(function (tid) { return v.teams[tid]; });
      box.appendChild(el('p', 'lib-board__count', t('celLibFinishedOf', '{n} of {total} groups finished', { n: done.length, total: v.total || 0 })));
      if (!done.length) return box;
      done.sort(function (a, b) { return v.finished[b].score - v.finished[a].score; });
      var ol = el('ol', 'wbw-order lib-board__list');
      done.forEach(function (tid) {
        var li = el('li', tid === myTeam() ? 'is-mine' : '');
        li.appendChild(teamChip(v.teams[tid]));
        li.appendChild(el('span', 'pr-num', String(v.finished[tid].score)));
        ol.appendChild(li);
      });
      box.appendChild(ol);
      return box;
    }

    /* ---------- screens ---------- */

    function screenStarting() {
      header();
      var card = el('div', 'pr-card pr-ready');
      card.appendChild(FF.Celebrate.gameArt('library', 'pr-ready__art', v.game));
      card.appendChild(el('p', 'pr-ready__kicker', t('prGetReady', 'Get ready')));
      if (v.waitReady) card.appendChild(FF.CelebrateReady.block(v, { uid: uid, team: myTeam(), T: T }));
      else { parts.big = el('p', 'pr-ready__count'); card.appendChild(parts.big); }
      if (v.instructions) card.appendChild(el('p', 'pr-ready__how', v.instructions));
      card.appendChild(el('p', 'pr-ready__tip', t('celLibTip', '{n} minutes to play. Anyone in your group can have a go on their own phone; your best score counts.', { n: v.minutes })));
      if (!myTeam()) card.appendChild(el('p', 'pr-note', t('prNoTeam', 'You are not in a team for this game, so you can watch along.')));
      root.appendChild(card);
    }

    function screenPlaying() {
      header();
      var card = el('div', 'pr-card pr-ready lib-card');
      card.appendChild(FF.Celebrate.gameArt('library', 'pr-ready__art', v.game));
      var mine = myScore();
      if (mine != null) {
        card.appendChild(el('p', 'pr-ready__kicker', t('celLibIn', 'Your score is in')));
        card.appendChild(el('p', 'lib-card__score', String(mine)));
        var best = (v.finished || {})[myTeam()];
        if (best && best.score !== mine) card.appendChild(el('p', 'pr-note', t('celLibTeamBest', 'Your group\'s best: {n} by {name}', { n: best.score, name: best.by })));
        card.appendChild(el('p', 'pr-note', t('celLibWaitOthers', 'Waiting for the other groups…')));
      } else if (myTeam()) {
        card.appendChild(el('p', 'pr-ready__kicker', t('celLibGo', 'Your turn to play')));
        var go = el('a', 'ev-btn lib-play');
        go.href = R.link('/play?view=guest', { cid: v.cid, runId: v.runId, game: v.game, seed: v.seed, uid: uid, back: location.pathname + location.search });
        go.appendChild(icon('play'));
        go.appendChild(el('span', '', t('celLibPlay', 'Play {name}', { name: v.name })));
        card.appendChild(go);
        card.appendChild(el('p', 'pr-note', t('celLibOneGo', 'One go each. When you finish, your score comes back here by itself.')));
      } else {
        card.appendChild(el('p', 'pr-note', t('prNoTeam', 'You are not in a team for this game, so you can watch along.')));
      }
      root.appendChild(card);
      parts.board = el('div', '');
      parts.board.appendChild(finishedList());
      root.appendChild(parts.board);
      if (!played[v.runId + ':go']) { played[v.runId + ':go'] = true; sfx('roundStart'); }
    }

    function screenEnded() {
      header();
      var res = v.result || {};
      var rows = list(res.rows);
      var winners = list(res.winners);
      var card = el('div', 'pr-card pr-ready');
      card.appendChild(el('p', 'pr-ready__kicker', res.why === 'time' ? t('celLibTimeUp', 'Time is up!') : t('prGameOver', 'Game over')));
      if (winners.length && v.teams[winners[0]]) {
        card.appendChild(el('h2', 'pr-win', winners.length > 1 ? t('prTie', 'It\'s a tie!') : t('prWinner', '{name} wins!', { name: v.teams[winners[0]].name })));
      }
      root.appendChild(card);
      var table = el('ol', 'pr-podium');
      rows.forEach(function (r) {
        var li = el('li', r.teamId === myTeam() ? 'is-mine' : '');
        li.appendChild(el('span', 'pr-podium__place', r.place ? String(r.place) : '–'));
        li.appendChild(teamChip(v.teams[r.teamId] || { name: '?' }));
        li.appendChild(el('span', 'pr-num', r.place ? t('celLibScorePoints', '{score} → {n} points', { score: r.score, n: r.points }) : t('celLibNoScore', 'No score')));
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

    function draw() {
      if (!v || stopped) return;
      // The dev transport writes one field at a time: wait for the seed before showing Play.
      if (v.phase === 'playing' && !v.seed) return;
      var key = v.runId + ':' + v.phase + ':' + (myTeam() || '-') + ':' + myScore() + ':' + JSON.stringify((v.finished || {})[myTeam()] || null) +
        (v.phase === 'starting' ? ':' + (v.waitReady ? 'w' + Object.keys(v.ready || {}).sort().join(',') : 'c') : '');
      if (v.phase === 'ended') key += ':' + JSON.stringify(v.result || null);
      if (key !== screenKey) {
        screenKey = key;
        clear();
        if (v.phase === 'starting') screenStarting();
        else if (v.phase === 'playing') screenPlaying();
        else if (v.phase === 'ended') screenEnded();
      } else if (parts.board) {
        while (parts.board.firstChild) parts.board.removeChild(parts.board.firstChild);
        parts.board.appendChild(finishedList());
      }
      tick();
    }

    var lastBeep = -1;
    function tick() {
      if (!v) return;
      if (v.phase === 'starting' && v.waitReady) { if (parts.timer) parts.timer.textContent = ''; return; }
      var left = 0;
      if (v.phase === 'starting') left = v.startAt - now();
      else if (v.phase === 'playing') left = v.endsAt - now();
      left = Math.max(0, left);
      if (parts.timer) {
        parts.timer.textContent = v.phase === 'playing' || v.phase === 'starting' ? clock(left) : '';
        parts.timer.classList.toggle('is-low', v.phase === 'playing' && left <= 60000);
      }
      if (parts.big) parts.big.textContent = String(Math.ceil(left / 1000));
      var s = Math.ceil(left / 1000);
      if (s !== lastBeep && s > 0 && s <= 3 && v.phase === 'starting') { lastBeep = s; sfx('countdown'); }
    }

    var off = T.watch('run', function (val) {
      if (stopped || !val) return;
      if (v && val.runId !== v.runId) screenKey = '';
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

  FF.LibraryPlay = { mount: mount };
})();
