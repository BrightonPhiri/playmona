/* ============================================================
   PLAYMONA — celebrate/pictureRush/play.js
   Picture Rush on a guest's phone. It reads the referee's view at
   celebrations/<cid>/run and sends commands to
   celebrations/<cid>/inbox/<uid>/<id>. Swaps show at once on this
   phone (prediction) and settle on the referee's board when it
   arrives; the referee decides everything that counts.

     var p = FF.PictureRushPlay.mount(host, { transport, uid, onClose });
     p.destroy();
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.PictureRushRules;
  var list = R.list;

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(name) { return FF.Icons && FF.Icons.icon ? FF.Icons.icon(name) : document.createTextNode(''); }
  function sfx(name) { if (FF.Audio && FF.Audio.play) FF.safe ? FF.safe(function () { FF.Audio.play(name); }) : FF.Audio.play(name); }

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
  function took(ms) {
    var s = Math.round(ms / 1000);
    return s < 60 ? t('prSeconds', '{n} s', { n: s }) : clock(ms);
  }
  function initial(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }

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
    var root = el('section', 'pr');
    root.setAttribute('aria-live', 'polite');
    host.appendChild(root);

    var v = null;              // the referee's view
    var pending = [];          // swaps sent, not yet seen in the referee's count
    var nextN = -1;
    var sel = -1;
    var board = null, boardKey = '';
    var screenKey = '';
    var ticker = null;
    var celebrated = {};
    var stopped = false;
    var parts = {};            // the live bits of the current screen

    /* A sound that plays once per moment, however often the screen is redrawn. */
    function once(key, name) {
      if (celebrated[v.runId + ':' + key]) return;
      celebrated[v.runId + ':' + key] = true;
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

    function send(type, extra) {
      if (!v || stopped) return null;
      if (nextN < serverN()) nextN = serverN();
      var cmd = { type: type, runId: v.runId, n: nextN++, t: stamp() };
      Object.keys(extra || {}).forEach(function (k) { cmd[k] = extra[k]; });
      T.set('inbox/' + uid + '/' + cmdId(), cmd).catch(function () {
        // It never reached the referee: show the referee's board again.
        pending = [];
        sel = -1;
        draw();
      });
      return cmd;
    }

    /* The referee's board with this phone's not-yet-confirmed swaps on top. */
    function predicted(tid) {
      var b = v.boards && v.boards[tid];
      if (!b) return null;
      var tiles = list(b.tiles).slice();
      var seen = serverN();
      pending = pending.filter(function (p) { return p.n >= seen; });
      pending.forEach(function (p) {
        if (tiles[p.a] === p.pa && tiles[p.b] === p.pb) tiles = R.swap(tiles, p.a, p.b);
      });
      return tiles;
    }

    function heldMap(tid) {
      var b = v.boards[tid];
      var out = {};
      var players = (v.teams[tid] && v.teams[tid].players) || {};
      var color = (v.teams[tid] && v.teams[tid].color) || '';
      Object.keys(b.held || {}).forEach(function (who) {
        if (who === uid) return;
        var name = players[who] || '';
        out[b.held[who]] = { color: color, initial: initial(name), name: name || t('prTeammate', 'a teammate') };
      });
      return out;
    }

    /* ---------- screens ---------- */

    function clear() {
      if (board) { board.destroy(); board = null; boardKey = ''; }
      while (root.firstChild) root.removeChild(root.firstChild);
      parts = {};
    }

    function header() {
      var top = el('header', 'pr-top');
      var title = el('div', 'pr-top__title');
      title.appendChild(el('strong', '', v.name || t('prName', 'Picture Rush')));
      if (v.round >= 0) title.appendChild(el('span', 'pr-top__round', t('prRoundOf', 'Picture {n} of {total}', { n: v.round + 1, total: v.rounds })));
      top.appendChild(title);
      parts.timer = el('span', 'pr-timer');
      parts.timer.setAttribute('role', 'timer');
      top.appendChild(parts.timer);
      var mute = el('button', 'pr-mute');
      mute.type = 'button';
      var setMute = function () {
        var on = !(FF.Audio && FF.Audio.effectsEnabled === false);
        while (mute.firstChild) mute.removeChild(mute.firstChild);
        mute.appendChild(icon(on ? 'speaker' : 'music-off'));
        mute.setAttribute('aria-label', on ? t('prSoundOff', 'Turn sound off') : t('prSoundOn', 'Turn sound on'));
      };
      mute.addEventListener('click', function () {
        if (FF.Audio && FF.Audio.setEffects) FF.Audio.setEffects(FF.Audio.effectsEnabled === false);
        setMute();
      });
      setMute();
      top.appendChild(mute);
      root.appendChild(top);
      var tid = myTeam();
      if (tid) root.appendChild(teamChip(v.teams[tid]));
    }

    function pausedNote() {
      parts.paused = el('p', 'pr-paused', t('prPaused', 'Paused by the organiser. Hold on…'));
      parts.paused.hidden = !v.paused;
      root.appendChild(parts.paused);
    }

    function screenStarting() {
      header();
      var card = el('div', 'pr-card pr-ready');
      card.appendChild(el('p', 'pr-ready__kicker', t('prGetReady', 'Get ready')));
      parts.big = el('p', 'pr-ready__count');
      card.appendChild(parts.big);
      if (v.instructions) card.appendChild(el('p', 'pr-ready__how', v.instructions));
      card.appendChild(el('p', 'pr-ready__tip', t('prTip', 'Tap a tile, then tap where it goes. Or drag it there.')));
      if (!myTeam()) card.appendChild(el('p', 'pr-note', t('prNoTeam', 'You are not in a team for this game, so you can watch along.')));
      root.appendChild(card);
      pausedNote();
    }

    function photo(cls) {
      var img = el('img', cls);
      img.alt = v.photo && v.photo.title ? v.photo.title : t('prPhotoAlt', 'The picture to rebuild');
      img.src = v.photo ? v.photo.url : '';
      img.decoding = 'async';
      return img;
    }

    function screenReveal() {
      header();
      var card = el('div', 'pr-card pr-reveal');
      card.appendChild(el('p', 'pr-reveal__say', t('prRemember', 'Remember this picture!')));
      card.appendChild(photo('pr-reveal__img'));
      root.appendChild(card);
      pausedNote();
    }

    function screenPlaying() {
      header();
      var tid = myTeam();
      if (!tid) { spectate(); pausedNote(); return; }
      var stage = el('div', 'pr-stage');
      root.appendChild(stage);
      var key = v.runId + ':' + v.round + ':' + v.size;
      if (boardKey !== key) {
        board = FF.PictureRushBoard.create(stage, {
          size: v.size, url: v.photo ? v.photo.url : '',
          canTake: function (p) { return !heldMap(myTeam())[p]; },
          onPick: function (a) { sel = a; send('pick', { a: a }); sfx('tap'); draw(); },
          onDrop: function () { if (sel >= 0) send('drop'); sel = -1; draw(); },
          onSwap: function (a, b) {
            var tiles = predicted(myTeam());
            if (!tiles) return;
            var cmd = send('swap', { a: a, b: b, pa: tiles[a], pb: tiles[b] });
            if (cmd) pending.push({ n: cmd.n, a: a, b: b, pa: tiles[a], pb: tiles[b] });
            sel = -1;
            var after = R.swap(tiles, a, b);
            sfx(after[a] === a || after[b] === b ? 'correct' : 'flip');
            draw();
          }
        });
        boardKey = key;
      }
      parts.status = el('p', 'pr-status');
      root.appendChild(parts.status);
      var foot = el('div', 'pr-foot');
      parts.progress = el('div', 'pr-progress');
      parts.progress.setAttribute('role', 'progressbar');
      parts.progress.setAttribute('aria-label', t('prProgress', 'Tiles in place'));
      parts.bar = el('span', 'pr-progress__bar');
      parts.progress.appendChild(parts.bar);
      foot.appendChild(parts.progress);
      parts.hint = el('button', 'ev-btn ev-btn--ghost pr-hint');
      parts.hint.type = 'button';
      parts.hint.addEventListener('click', function () { send('hint'); sfx('whoosh'); });
      foot.appendChild(parts.hint);
      root.appendChild(foot);
      parts.clue = el('p', 'pr-clue');
      root.appendChild(parts.clue);
      parts.others = el('ul', 'pr-others');
      parts.others.setAttribute('aria-label', t('prOtherTeams', 'How the other teams are doing'));
      root.appendChild(parts.others);
      pausedNote();
    }

    function spectate() {
      parts.others = el('ul', 'pr-others pr-others--big');
      root.appendChild(el('p', 'pr-note', t('prWatching', 'You are watching. Here is how the teams are doing.')));
      root.appendChild(parts.others);
    }

    function roundTable(row, withTotals) {
      var ids = Object.keys(row.teams || {});
      ids.sort(function (a, b) { return row.teams[b].points - row.teams[a].points || row.teams[a].usedMs - row.teams[b].usedMs; });
      var table = el('table', 'pr-table');
      var head = el('tr');
      [t('prTeamCol', 'Team'), t('prResultCol', 'Picture'), t('prPointsCol', 'Points')].concat(withTotals ? [t('prTotalCol', 'Total')] : []).forEach(function (h) {
        var th = el('th', '', h);
        th.scope = 'col';
        head.appendChild(th);
      });
      var thead = el('thead');
      thead.appendChild(head);
      table.appendChild(thead);
      var body = el('tbody');
      ids.forEach(function (tid) {
        var r = row.teams[tid];
        var tr = el('tr', tid === myTeam() ? 'is-mine' : '');
        var td = el('td');
        td.appendChild(teamChip(v.teams[tid] || { name: '?' }));
        tr.appendChild(td);
        tr.appendChild(el('td', '', r.solved ? t('prSolvedIn', 'Done in {time}', { time: took(r.usedMs) }) : t('prTilesOf', '{n} of {total} tiles', { n: r.correct, total: r.total })));
        tr.appendChild(el('td', 'pr-num', '+' + r.points));
        if (withTotals) tr.appendChild(el('td', 'pr-num', String((v.totals && v.totals[tid] && v.totals[tid].points) || 0)));
        body.appendChild(tr);
      });
      table.appendChild(body);
      return table;
    }

    function screenRoundEnd() {
      header();
      var row = list(v.results)[v.round];
      var card = el('div', 'pr-card pr-roundend');
      card.appendChild(photo('pr-roundend__img'));
      if (v.photo && v.photo.title) card.appendChild(el('p', 'pr-roundend__title', v.photo.title));
      root.appendChild(card);
      if (row) root.appendChild(roundTable(row, true));
      parts.next = el('p', 'pr-next');
      root.appendChild(parts.next);
      pausedNote();
      if (row && myTeam() && row.teams[myTeam()] && row.teams[myTeam()].solved) once('end:' + v.round, 'roundEnd');
    }

    function screenEnded() {
      var res = v.result || { rows: [], winners: [] };
      var rows = list(res.rows);
      var winners = list(res.winners);
      var card = el('div', 'pr-card pr-final');
      var trophy = el('div', 'pr-final__trophy');
      trophy.appendChild(icon('trophy'));
      card.appendChild(trophy);
      card.appendChild(el('p', 'pr-final__kicker', v.name || t('prName', 'Picture Rush')));
      var names = winners.map(function (id) { return (v.teams[id] || {}).name || ''; }).filter(Boolean);
      var scored = rows.some(function (r) { return r.points > 0; });
      if (!scored) { names = []; winners = []; }
      card.appendChild(el('h2', 'pr-final__win', !scored ? t('prNoScore', 'Nobody scored this time') : names.length > 1
        ? t('prWinnersTie', 'A tie! {names} win', { names: names.join(' & ') })
        : t('prWinner', '{name} wins!', { name: names[0] || '' })));
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
      if (!celebrated[v.runId]) {
        celebrated[v.runId] = true;
        sfx('winner');
        if (FF.Confetti && FF.Confetti.burst) FF.safe(function () { FF.Confetti.burst(winners.indexOf(myTeam()) !== -1 ? 220 : 90); });
      }
    }

    /* ---------- the live parts ---------- */

    function draw() {
      if (!v || stopped) return;
      var key = v.runId + ':' + v.phase + ':' + v.round + ':' + (myTeam() || '-');
      // The referee's writes can land a moment apart: redraw the results screens when their data arrives.
      if (v.phase === 'roundEnd') key += ':' + JSON.stringify([list(v.results)[v.round] || null, v.totals || null, v.photo && v.photo.title]);
      if (v.phase === 'ended') key += ':' + JSON.stringify(v.result || null);
      if (key !== screenKey) {
        screenKey = key;
        clear();
        if (v.phase === 'starting') screenStarting();
        else if (v.phase === 'reveal') { screenReveal(); once('start:' + v.round, 'roundStart'); }
        else if (v.phase === 'playing') screenPlaying();
        else if (v.phase === 'roundEnd') screenRoundEnd();
        else if (v.phase === 'ended') screenEnded();
        if (v.phase !== 'playing') sel = -1;
      }
      if (parts.paused) parts.paused.hidden = !v.paused;
      if (v.phase === 'playing') drawPlay();
      tick();
    }

    function drawPlay() {
      var tid = myTeam();
      if (tid && board) {
        var b = v.boards[tid];
        var tiles = predicted(tid);
        var held = heldMap(tid);
        if (sel >= 0 && held[sel]) sel = -1;           // a teammate got there first
        var solvedNow = b.solved || R.solved(tiles);
        board.update({ tiles: tiles, selected: sel, held: held, locked: !!(b.solved || v.paused), solved: b.solved, peek: b.hintUntil > now() });
        var right = R.correct(tiles);
        parts.bar.style.width = Math.round(100 * right / tiles.length) + '%';
        parts.progress.setAttribute('aria-valuenow', String(right));
        parts.progress.setAttribute('aria-valuemax', String(tiles.length));
        parts.status.textContent = b.solved
          ? t('prSolved', 'Solved in {time}! Waiting for the other teams…', { time: took(b.usedMs) })
          : (solvedNow ? t('prChecking', 'Checking…') : t('prInPlace', '{n} of {total} tiles in place', { n: right, total: tiles.length }));
        root.classList.toggle('is-solved', !!b.solved);
        var left = Math.max(0, (v.settings.hints || 0) - (b.hints || 0));
        parts.hint.hidden = !(v.settings.hints > 0) || b.solved;
        parts.hint.disabled = left <= 0 || v.paused;
        parts.hint.textContent = t('prHint', 'Peek at the picture ({n} left)', { n: left });
        parts.clue.textContent = b.hints > 0 && v.photo && v.photo.hint ? t('prClue', 'Clue: {hint}', { hint: v.photo.hint }) : '';
        parts.clue.hidden = !parts.clue.textContent;
        if (b.solved && !celebrated[v.runId + ':' + v.round]) {
          celebrated[v.runId + ':' + v.round] = true;
          sfx('streak');
          if (FF.Confetti && FF.Confetti.burst) FF.safe(function () { FF.Confetti.burst(70); });
        }
      }
      drawOthers(tid);
    }

    function drawOthers(mine) {
      if (!parts.others) return;
      while (parts.others.firstChild) parts.others.removeChild(parts.others.firstChild);
      Object.keys(v.boards || {}).filter(function (id) { return id !== mine; }).forEach(function (id) {
        var b = v.boards[id];
        var team = v.teams[id] || { name: '?' };
        var li = el('li', 'pr-other' + (b.solved ? ' is-done' : ''));
        li.appendChild(teamChip(team));
        var bar = el('span', 'pr-mini');
        var fill = el('span', 'pr-mini__bar');
        fill.style.width = Math.round(100 * (b.correct || 0) / list(b.tiles).length) + '%';
        fill.style.background = team.color || '';
        bar.appendChild(fill);
        li.appendChild(bar);
        li.appendChild(el('span', 'pr-num', b.solved ? t('prDone', 'Done') : (b.correct + '/' + list(b.tiles).length)));
        parts.others.appendChild(li);
      });
    }

    var lastBeep = -1;
    function tick() {
      if (!v) return;
      var t0 = v.paused ? v.pausedAt : now();
      var due = 0;
      if (v.phase === 'starting') due = v.startAt;
      else if (v.phase === 'reveal') due = v.revealUntil;
      else if (v.phase === 'playing') due = v.deadline;
      else if (v.phase === 'roundEnd') due = v.nextAt;
      var left = Math.max(0, due - t0);
      if (parts.timer) {
        parts.timer.textContent = v.phase === 'ended' ? '' : clock(left);
        parts.timer.classList.toggle('is-low', v.phase === 'playing' && left <= 10000);
      }
      if (parts.big) parts.big.textContent = String(Math.max(0, Math.ceil(left / 1000)));
      if (parts.next) {
        var last = v.round + 1 >= v.rounds;
        parts.next.textContent = (last ? t('prFinalIn', 'Final results in {n} s') : t('prNextIn', 'Next picture in {n} s')).replace('{n}', String(Math.ceil(left / 1000)));
      }
      var s = Math.ceil(left / 1000);
      if (!v.paused && s !== lastBeep && s > 0 && s <= 3 && (v.phase === 'starting' || v.phase === 'reveal')) { lastBeep = s; sfx('countdown'); }
      if (v.phase === 'playing' && board && v.boards[myTeam()]) {
        var peek = v.boards[myTeam()].hintUntil > now();
        if (peek !== board.el.classList.contains('is-peek')) board.update({ peek: peek });
      }
    }

    var off = T.watch('run', function (val) {
      if (stopped) return;
      if (!val) return;
      if (v && val.runId !== v.runId) { pending = []; nextN = -1; sel = -1; screenKey = ''; }
      v = val;
      v.boards = v.boards || {};
      v.teams = v.teams || {};
      v.settings = v.settings || {};
      draw();
    });
    ticker = setInterval(tick, 250);

    return {
      view: function () { return v; },
      destroy: function () {
        stopped = true;
        if (ticker) clearInterval(ticker);
        if (typeof off === 'function') off();
        if (board) board.destroy();
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  FF.PictureRushPlay = { mount: mount };
})();
