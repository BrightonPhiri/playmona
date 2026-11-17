/* ============================================================
   PLAYMONA — wordshift/online.js
   The online WordShift Race screen. Everyone gets the same puzzle;
   the server's referee checks every move (FF.WordShiftClient talks
   to it). Other players show only as counts — moves, how many
   letters are in place, done — never their words.

     FF.WordShiftOnline.start(room, pick)   the host starts a match
     FF.WordShiftOnline.play(api, room)     every phone's screen

   Uses the solo screen's helpers (FF.WordShiftGame). Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordShiftRules;
  var NUDGE_MS = 8000;          // the referee is this late: ask the server to wake it
  var AUTO_SCORES_MS = 20000;   // the final board moves on to the scores by itself

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
  function G() { return FF.WordShiftGame; }
  function ordinal(n) { return t('wsPlace' + n, ['', '1st', '2nd', '3rd'][n] || n + 'th'); }

  function play(api, room) {
    var g = G();
    var f = g.frame(api, 'ws--play ws--online');
    api.shell.hideTimer();
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });
    var client = FF.WordShiftClient.create({ room: room, onChange: schedule });
    var ended = false, pendingDraw = null, nudged = {}, autoScores = null, finishedShown = false;
    var shownKey = null, revealKey = null, lastSeen = null, board = null, built = null;

    var roundChip = g.chip('', 'ws-chip--round');
    f.chips.appendChild(roundChip);
    var levelHolder = FF.ui.span('');
    f.chips.appendChild(levelHolder);
    var clock = g.chip('', 'ws-chip--clock');
    f.chips.appendChild(clock);
    var race = FF.ui.el('ol', { class: 'ws-race', 'aria-label': t('wsRaceBoard', 'The race') });
    f.main.appendChild(race);
    var stage = FF.ui.div('ws-stage');
    f.main.appendChild(stage);
    var ticker = setInterval(tick, 250);

    function expected() { return room.meta && room.meta.wsMatch; }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('playerLabel', 'Player'), avatar: p.avatar || null, color: p.color || null };
    }
    function schedule() { if (!pendingDraw) pendingDraw = setTimeout(function () { pendingDraw = null; render(); }, 0); }
    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pendingDraw) clearTimeout(pendingDraw);
      if (autoScores) clearTimeout(autoScores);
      document.removeEventListener('keydown', onKey, true);
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }
    function finish() { if (ended) return; cleanup(); api.end({}); }
    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.WordShiftOnlineApi.nudge(room.code);
    }

    /* The race: points, letters in place as dots, moves, done. Never anyone's words. */
    function drawRace(ws) {
      FF.ui.clear(race);
      var n = ws.puzzle ? ws.puzzle.t.length : 0;
      var order = (ws.order || []).slice().sort(function (a, b) { return ((ws.p[b] || {}).score || 0) - ((ws.p[a] || {}).score || 0); });
      order.forEach(function (uid) {
        var row = ws.p[uid] || {};
        var li = FF.ui.el('li', { class: 'ws-race__row' + (uid === client.uid ? ' is-me' : '') + (row.done ? ' is-done' : '') });
        var ava = FF.ui.span('ws-race__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(uid), ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('ws-race__name', who(uid).name + (uid === client.uid ? ' ' + t('youTag', '(you)') : '')));
        if (n && ws.phase !== 'starting') {
          var dots = FF.ui.span('ws-race__dots');
          dots.setAttribute('aria-label', t('wsInPlaceN', '{n} of {m} letters in place', { n: row.greens || 0, m: n }));
          for (var i = 0; i < n; i++) dots.appendChild(FF.ui.span('ws-race__dot' + (i < (row.greens || 0) ? ' is-green' : '')));
          li.appendChild(dots);
          li.appendChild(FF.ui.span('ws-race__meta', row.done ? ordinal(row.place || 1) : t('wsMovesN', '{n} moves', { n: row.moves || 0 })));
        }
        li.appendChild(FF.ui.span('ws-race__pts', FF.util.formatNumber(row.score || 0)));
        race.appendChild(li);
      });
    }

    function waiting(title, sub) {
      board = null; built = null; shownKey = null;
      FF.ui.clear(stage);
      var w = FF.ui.div('ws-wait');
      w.appendChild(FF.ui.div('ws-wait__spin'));
      w.appendChild(FF.ui.el('h2', { class: 'ws-h' }, title));
      if (sub) w.appendChild(FF.ui.el('p', { class: 'ws-note' }, sub));
      stage.appendChild(w);
    }

    function tick() {
      if (ended) return;
      var ws = client.view().ws;
      if (!ws || ws.matchId !== expected()) return;
      var now = client.serverNow();
      if (ws.phase === 'open') {
        var left = ws.closeAt - now;
        clock.textContent = g.clockText(Math.max(0, left));
        clock.classList.toggle('is-low', left <= 10000);
      } else clock.textContent = '';
      var due = ws.phase === 'starting' ? ws.readyAt : ws.phase === 'ready' ? ws.openAt : ws.phase === 'open' ? ws.closeAt : ws.phase === 'reveal' ? ws.nextAt : 0;
      if (due) maybeNudge(ws.phase + ws.k, due);
    }

    function render() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = client.view();
      var ws = v.ws;
      if (!ws || (expected() && ws.matchId !== expected()) || !FF.WordShiftClient.ready(ws)) {
        if (!ws || ws.matchId !== expected()) waiting(t('wsGettingReady', 'Picking the puzzles…'), t('wsGettingReadySub', 'Everyone gets the same words at the same moment.'));
        return;
      }
      FF.ui.clear(levelHolder);
      levelHolder.appendChild(g.chip(g.levelName(ws.settings.level), 'ws-chip--lv ws-lv-' + ws.settings.level));
      roundChip.textContent = ws.k >= 0 ? t('wsRoundOf', 'Puzzle {r} of {n}', { r: ws.k + 1, n: ws.total }) : t('gsGetReady', 'Get ready');
      drawRace(ws);
      if (ws.phase === 'ended') { if (!finishedShown) showEnd(ws, v); return; }
      if (ws.phase === 'starting') {
        waiting(t('wsBrief', 'Race to the target word.'), t('wsBriefSub', 'Change one letter each move, and every word must be real. Finish first, in the fewest moves. No hints!'));
        return;
      }
      if (!v.seated) { waiting(t('gsWatching', 'This game started without you'), t('gsWatchingSub', 'You can join the next one.')); return; }
      var key = ws.matchId + '|' + ws.k;
      if (ws.phase === 'reveal') { if (revealKey !== key) showReveal(ws, v, key); return; }
      if (shownKey !== key) buildRound(ws, key);
      update(ws, v);
    }

    /* ---------- a round ---------- */

    function buildRound(ws, roundKey) {
      shownKey = roundKey;
      lastSeen = null;
      FF.ui.clear(stage);
      var p = ws.puzzle;
      var b = built = { p: p };
      var goal = FF.ui.div('ws-goal');
      var startBox = FF.ui.div('ws-goal__start');
      startBox.appendChild(FF.ui.span('ws-label', t('wsStart', 'Start')));
      startBox.appendChild(g.tileRow(p.s, 'ws-row--mini ws-row--start').el);
      goal.appendChild(startBox);
      var targetBox = FF.ui.div('ws-goal__target');
      targetBox.appendChild(FF.ui.span('ws-label', t('wsTarget', 'Target')));
      targetBox.appendChild(g.tileRow(p.t, 'ws-row--target').el);
      goal.appendChild(targetBox);
      stage.appendChild(goal);
      b.ladder = FF.ui.el('ol', { class: 'ws-ladder', 'aria-label': t('wsYourWords', 'Your words') });
      stage.appendChild(b.ladder);
      var wrap = FF.ui.div('ws-board');
      b.tilesEl = FF.ui.div('ws-row ws-row--board');
      b.tilesEl.style.setProperty('--n', String(p.s.length));
      b.tilesEl.setAttribute('role', 'group');
      b.tilesEl.setAttribute('aria-label', t('wsCurrent', 'Your word. Pick a letter, then type.'));
      wrap.appendChild(b.tilesEl);
      b.msg = FF.ui.el('p', { class: 'ws-msg', role: 'status', 'aria-live': 'polite' }, '');
      wrap.appendChild(b.msg);
      stage.appendChild(wrap);
      b.kb = FF.ui.div('ws-kb');
      g.KEYS.forEach(function (row, r) {
        var line = FF.ui.div('ws-kb__row');
        if (r === 2) line.appendChild(key('enter', t('wsEnter', 'Enter'), 'ws-key--wide ws-key--enter'));
        row.split('').forEach(function (ch) { line.appendChild(key(ch, ch.toUpperCase())); });
        if (r === 2) line.appendChild(key('back', '⌫', 'ws-key--wide', t('wsBack', 'Undo letter')));
        b.kb.appendChild(line);
      });
      stage.appendChild(b.kb);
      b.tileEls = [];
      for (var i = 0; i < p.s.length; i++) {
        (function (idx) {
          var el = FF.ui.el('button', { type: 'button', class: 'ws-tile ws-tile--big' });
          el.addEventListener('click', function () { if (!canMove()) return; api.audio.play('tap'); board.select(idx); draw(); });
          b.tilesEl.appendChild(el);
          b.tileEls.push(el);
        })(i);
      }
      board = FF.WordShiftBoard.create(p.s);
      b.word = p.s;
      b.steps = 0;
      b.opened = false;
      draw();
    }
    function key(k, label, cls, aria) {
      var el = FF.ui.el('button', { type: 'button', class: 'ws-key' + (cls ? ' ' + cls : '') }, label);
      if (aria) el.setAttribute('aria-label', aria);
      el.addEventListener('click', function () { press(k); });
      return el;
    }

    function canMove() {
      var v = client.view();
      return !!(board && built && v.ws && v.ws.phase === 'open' && v.mine && !v.mine.done);
    }

    function say(text, kind) {
      if (!built) return;
      built.msg.textContent = text;
      built.msg.className = 'ws-msg' + (kind ? ' ws-msg--' + kind : '');
    }

    function draw() {
      if (!built || !board) return;
      var letters = board.letters();
      var edited = board.edited();
      var sel = board.selected();
      var greens = R.greens(built.word, built.p.t);
      built.tileEls.forEach(function (el, i) {
        el.textContent = letters[i].toUpperCase();
        el.classList.toggle('ws-tile--green', !!greens[i] && edited.indexOf(i) === -1);
        el.classList.toggle('ws-tile--edited', edited.indexOf(i) !== -1);
        el.classList.toggle('is-selected', i === sel);
        el.setAttribute('aria-pressed', i === sel ? 'true' : 'false');
        el.setAttribute('aria-label', t('wsTileAria', 'Letter {n}: {l}', { n: i + 1, l: letters[i].toUpperCase() }) + (greens[i] ? ' · ' + t('wsInPlace', 'in place') : ''));
      });
    }

    /* What the referee said since the last draw: my word, my ladder, a refused move. */
    function update(ws, v) {
      var b = built;
      var mine = v.mine;
      var open = ws.phase === 'open';
      if (open && !b.opened) {
        b.opened = true;
        api.audio.play('land');
        say(t('wsGo', 'Go! Tap a letter, then type its new letter.'), '');
      } else if (!open && !b.opened) say(t('wsReady', 'Get ready…'), '');
      b.kb.classList.toggle('is-off', !open || !mine || mine.done);
      if (!mine) return;
      var answered = (mine.moves || 0) + (mine.invalid || 0) + '|' + (mine.last ? mine.last.word + (mine.last.ok ? '+' : '-') : '');
      if (answered === lastSeen) return;
      lastSeen = answered;
      var steps = mine.used.slice(1);
      if (steps.length !== b.steps) {
        FF.ui.clear(b.ladder);
        steps.forEach(function (w) {
          var li = FF.ui.el('li', { class: 'ws-ladder__step' });
          li.appendChild(g.tileRow(w, 'ws-row--mini', R.greens(w, b.p.t)).el);
          b.ladder.appendChild(li);
        });
        if (b.ladder.scrollTo) b.ladder.scrollTop = b.ladder.scrollHeight;
      }
      var grew = steps.length > b.steps;
      var before = R.greens(b.word, b.p.t);
      var changedAt = -1;
      if (grew) for (var i = 0; i < mine.word.length; i++) if (mine.word[i] !== b.word[i]) changedAt = i;
      b.steps = steps.length;
      if (mine.word !== b.word || (mine.last && !mine.last.ok)) { b.word = mine.word; board.reset(mine.word); }
      draw();
      if (mine.done) {
        b.tileEls.forEach(function (el, i) { el.classList.add('ws-tile--green'); el.style.animationDelay = (i * 90) + 'ms'; g.retrigger(el, 'is-wave'); });
        say(t('wsDoneRace', 'You reached {w}! Waiting for the others…', { w: b.p.t.toUpperCase() }), 'good');
        api.audio.play('winner');
        return;
      }
      if (mine.last && !mine.last.ok) {
        api.audio.play('wrong');
        say((g.REASONS[mine.last.reason] || g.REASONS.word)(), 'bad');
        g.retrigger(b.tilesEl, 'is-shake');
        return;
      }
      if (grew && changedAt >= 0) {
        g.retrigger(b.tileEls[changedAt], 'is-flip');
        var nowGreen = R.greens(mine.word, b.p.t);
        var newGreen = nowGreen[changedAt] && !before[changedAt];
        if (newGreen) g.retrigger(b.tileEls[changedAt], 'is-pop');
        api.audio.play(newGreen ? 'correct' : 'land');
        say(newGreen ? t('wsInPlaceNow', 'That letter is in place.') : t('wsNice', '{w} works.', { w: mine.word.toUpperCase() }), newGreen ? 'good' : '');
      }
    }

    function onKey(e) {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = FF.WordShiftBoard.keyFilter(e);
      if (!k || !board) return;
      if (k === 'enter' && e.target && e.target.tagName === 'BUTTON' && !e.target.classList.contains('ws-tile')) return;
      e.preventDefault();
      e.stopPropagation();
      press(k);
    }
    document.addEventListener('keydown', onKey, true);

    function press(k) {
      if (!canMove()) return;
      if (k === 'enter') { submit(); return; }
      if (k === 'back') { if (board.back()) api.audio.play('tap'); draw(); return; }
      if (k === 'left') { board.move(-1); draw(); return; }
      if (k === 'right') { board.move(1); draw(); return; }
      if (board.selected() < 0) { say(t('wsPickFirst', 'Tap the letter you want to change first.'), 'warn'); return; }
      if (board.type(k)) { api.audio.play('tap'); draw(); g.retrigger(built.tileEls[board.selected()], 'is-typed'); }
    }

    function submit() {
      var word = board.word();
      if (word === built.word) { api.audio.play('wrong'); say(g.REASONS.same(), 'bad'); g.retrigger(built.tilesEl, 'is-shake'); return; }
      if (client.view().pending) { say(t('wsChecking', 'Checking your last word…'), 'warn'); return; }
      if (client.send(word)) say(t('wsChecking', 'Checking your last word…'), '');
      else say(t('wsNotNow', 'That move could not be sent. Try again.'), 'warn');
    }

    /* ---------- between rounds and the end ---------- */

    function showReveal(ws, v, key) {
      revealKey = key;
      shownKey = null; board = null; built = null;
      FF.ui.clear(stage);
      var last = ws.last;
      var mineR = last.results[v.uid] || {};
      var card = FF.ui.div('ws-done ws-reveal' + (mineR.done ? ' is-solved' : ''));
      card.appendChild(FF.ui.el('h2', { class: 'ws-h ws-h--xl' }, mineR.done ? t('wsDoneTitle', 'Shifted!') : t('wsTimeUp', 'Time’s up')));
      var pair = FF.ui.div('ws-reveal__pair');
      pair.appendChild(g.tileRow(last.s, 'ws-row--mini').el);
      pair.appendChild(FF.ui.span('ws-reveal__arrow', '→'));
      pair.appendChild(g.tileRow(last.t, 'ws-row--mini', R.greens(last.t, last.t)).el);
      card.appendChild(pair);
      card.appendChild(FF.ui.el('p', { class: 'ws-note' }, t('wsShortestWas', 'The shortest path was {n} moves.', { n: last.n })));
      var rows = FF.ui.el('ol', { class: 'ws-race ws-race--reveal' });
      (ws.order || []).slice().sort(function (a, b) {
        var ra = last.results[a] || {}, rb = last.results[b] || {};
        return (rb.points || 0) - (ra.points || 0);
      }).forEach(function (uid) {
        var r = last.results[uid] || {};
        var li = FF.ui.el('li', { class: 'ws-race__row' + (uid === v.uid ? ' is-me' : '') + (r.done ? ' is-done' : '') });
        li.appendChild(FF.ui.span('ws-race__name', who(uid).name));
        li.appendChild(FF.ui.span('ws-race__meta', r.done ? ordinal(r.place) + ' · ' + t('wsMovesN', '{n} moves', { n: r.moves }) : t('wsNotThere', 'not there')));
        li.appendChild(FF.ui.span('ws-race__pts', '+' + FF.util.formatNumber(r.points || 0)));
        rows.appendChild(li);
      });
      card.appendChild(rows);
      stage.appendChild(card);
      api.audio.play(mineR.done ? 'correct' : 'roundEnd');
    }

    function showEnd(ws, v) {
      finishedShown = true;
      board = null; built = null;
      FF.ui.clear(stage);
      clock.textContent = '';
      var rows = (ws.result && ws.result.rows) || [];
      var top = rows[0];
      var meWon = !!top && top.uid === v.uid && !(rows[1] && rows[1].place === 1);
      var box = FF.ui.div('ws-done ws-recap is-solved');
      box.appendChild(FF.ui.el('h2', { class: 'ws-h ws-h--xl' }, meWon ? t('wsYouWin', 'You win the race!')
        : top ? t('wsWinner', '{name} wins the race!', { name: who(top.uid).name }) : t('gsOver', 'Game over')));
      var list = FF.ui.el('ol', { class: 'ws-race ws-race--final' });
      rows.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'ws-race__row' + (r.uid === v.uid ? ' is-me' : '') + (r.place === 1 ? ' is-done' : '') });
        li.appendChild(FF.ui.span('ws-race__place', String(r.place)));
        li.appendChild(FF.ui.span('ws-race__name', who(r.uid).name));
        li.appendChild(FF.ui.span('ws-race__meta', t('wsWinsN', '{n} won', { n: r.wins || 0 })));
        li.appendChild(FF.ui.span('ws-race__pts', FF.util.formatNumber(r.points || 0)));
        list.appendChild(li);
      });
      box.appendChild(list);
      var go = FF.ui.el('button', { type: 'button', class: 'ws-btn ws-btn--go' });
      if (FF.Icons && FF.Icons.icon) go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('srtSeeScores', 'See scores')));
      go.addEventListener('click', function () { api.audio.play('click'); finish(); });
      box.appendChild(go);
      stage.appendChild(box);
      api.audio.play(meWon ? 'winner' : 'roundEnd');
      if (meWon && g.animationsOn() && FF.Confetti) FF.Confetti.burst(100);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  FF.WordShiftOnline = {
    start: function (room, pick) { return FF.WordShiftOnlineApi.start(room, pick); },
    play: play
  };
})();
