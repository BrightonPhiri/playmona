/* ============================================================
   PLAYMONA — crossword/online.js
   Mini Crossword in an online room. The referee on the server
   (js/crossword/referee.js) picks the puzzle and keeps its
   answers; phones draw rooms/<code>/cw with the same board as
   one-device play (FF.CrosswordGame.board):

     Race   everyone solves their own copy. Letters checked: a
            finished word goes to the referee and comes back gold
            or red. Expert: nothing is checked until Check grid,
            and each wrong check costs 20 seconds.
     Co-op  one shared grid, letter by letter, in each player's
            colour. A right word locks and scores for whoever
            placed its last letter.

     FF.CrosswordOnline.start(api, room)
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.CrosswordRules;
  var C = FF.CrosswordCursor;
  var KB_KEY = 'crossword:keyboard';
  var NUDGE_MS = 8000;
  var AUTO_SCORES_MS = 90000;
  var PENDING_MS = 3000;   // co-op: our own letter wins on screen until the referee has it

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
  function keyOf(r, c) { return r + ',' + c; }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
  function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  function start(api, room) {
    var G = FF.CrosswordGame;
    var f = G.frame(api, 'cw--play cw--online');
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });
    var client = FF.CrosswordClient.create({ room: room, onChange: schedule });
    var timerChip = G.chip('0:00', 'cw-chip--time', 'clock');
    f.chips.appendChild(timerChip);
    var infoHolder = FF.ui.span('');
    f.chips.appendChild(infoHolder);
    var strip = FF.ui.el('div', { class: 'cw-turns cw-turns--room', role: 'list' });

    var ended = false, pending = null, nudged = {}, autoScores = null;
    var B = null, built = null, drawn = null, unkeys = null;
    var brief = null, waitCard = null, doneCard = null, endShown = false;
    var filled = {};        // 'r,c' -> letter on screen
    var fixed = {};         // 'r,c' -> true: part of a word that is right (yours, or the team's)
    var wrongShown = {};    // 'r,c' -> true: red on screen
    var sel = { r: 0, c: 0 }, dir = 'across';
    var sent = {};          // race: wordId -> the text sent
    var seenSolved = {}, lastMiss = 0, lastChecks = 0, checkWaiting = false;
    var mine = {};          // co-op: 'r,c' -> { ch, at } typed here, not yet in the view
    var lastWrong = null;
    var ticker = setInterval(tick, 250);

    function cw() { return client.view().cw; }
    function me() { return client.view().me; }
    function expected() { return room.meta && room.meta.cwMatch; }
    function coop() { var v = cw(); return !!v && v.settings.play === 'coop'; }
    function expert() { var v = cw(); return !!v && v.settings.checking === 'expert'; }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('playerLabel', 'Player'), avatar: p.avatar || null, color: p.color || null };
    }
    function schedule() { if (!pending) pending = setTimeout(function () { pending = null; render(); }, 0); }
    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      if (unkeys) unkeys();
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }
    function finish() { if (ended) return; cleanup(); api.end({}); }
    function canType() {
      var m = me();
      return !!B && !endShown && client.playing() && !!m && !(m.finishedAt && !coop());
    }

    /* ---------- the clock ---------- */

    function tick() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = cw();
      if (!v || v.matchId !== expected()) return;
      var now = client.serverNow();
      if (v.status === 'brief') {
        timerChip.text.textContent = G.clock(R.RACE_MS[v.settings.level]);
        if (brief) brief.count.textContent = String(Math.max(1, Math.ceil((v.playAt - now) / 1000)));
      } else if (v.status === 'play') {
        var left = Math.max(0, v.endsAt - now);
        timerChip.text.textContent = G.clock(left);
        timerChip.classList.toggle('is-low', left < 30000);
        if (left <= 0 && B) B.lock(true);
      }
      var due = v.status === 'brief' ? v.playAt : v.status === 'play' ? v.endsAt : 0;
      if (due && now - due > NUDGE_MS && !nudged[v.status]) { nudged[v.status] = true; FF.CrosswordApi.nudge(room.code); }
    }

    /* ---------- drawing ---------- */

    function waiting(title, sub) {
      if (waitCard) return;
      FF.ui.clear(f.main);
      waitCard = FF.ui.div('cw-wait');
      waitCard.appendChild(G.glyph('dice', 'cw-wait__icon'));
      waitCard.appendChild(FF.ui.el('h2', { class: 'cw-h' }, title));
      waitCard.appendChild(FF.ui.el('p', { class: 'cw-note' }, sub));
      f.main.appendChild(waitCard);
    }

    function draw(v) {
      drawn = v.matchId;
      waitCard = null;
      FF.ui.clear(f.main);
      FF.ui.clear(infoHolder);
      var s = v.settings;
      infoHolder.appendChild(G.chip((s.play === 'coop' ? t('cwCoop', 'Co-op') : t('cwRace', 'Race')) + ' · ' + G.levelName(s.level) + (s.checking === 'expert' ? ' · ' + t('cwExpert', 'Expert') : ''), 'cw-chip--pack', s.play === 'coop' ? 'word' : 'clock'));
      f.root.classList.toggle('cw--expert', s.checking === 'expert');
      f.main.appendChild(strip);
      var puzzle = { size: v.shape.size, blocks: v.shape.blocks, clues: v.shape.clues, level: v.shape.level, pack: v.shape.pack };
      B = G.board(api, f, puzzle, {
        keyboard: store().get(KB_KEY, 'builtin') === 'device' ? 'device' : 'builtin',
        onType: type,
        onBack: back,
        onClue: function (step) { clue(step); },
        onFlip: flip,
        onSelect: tapCell,
        onWord: function (id) { var w = B.words[id]; if (w) go(startOf(w)); }
      });
      built = B.built;
      var first = built.words[0];
      if (first) { sel = { r: first.r, c: first.c }; dir = first.dir; }
      B.setSelection(sel, dir);
      unkeys = G.keys(f.root, {
        type: type, back: back, flip: flip, clue: clue,
        arrow: function (dr, dc) { arrow(dr, dc); }
      });
      helpRow();
    }

    function drawStrip(v) {
      FF.ui.clear(strip);
      var rows = v.order.map(function (uid) { return { uid: uid, p: v.p[uid] || {} }; });
      if (coop()) rows.sort(function (a, b) { return (b.p.points || 0) - (a.p.points || 0); });
      rows.forEach(function (x) {
        var e = who(x.uid);
        var li = FF.ui.el('div', { class: 'cw-turn' + (x.uid === client.uid ? ' is-now' : '') + (x.p.finishedAt ? ' is-done' : ''), role: 'listitem' });
        if (coop() && e.color) li.style.setProperty('--you', e.color);
        var ava = FF.ui.span('cw-turn__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('cw-turn__name', x.uid === client.uid ? t('you', 'You') : e.name));
        var stat = coop() ? FF.util.formatNumber(x.p.points || 0)
          : x.p.finishedAt ? '✓ ' + G.clock(x.p.ms != null ? x.p.ms : x.p.finishedAt - v.playAt) : (x.p.done || 0) + '/' + v.total;
        li.appendChild(FF.ui.span('cw-turn__pts', stat));
        strip.appendChild(li);
      });
    }

    function showBrief(v) {
      if (brief) return;
      var card = FF.ui.div('cw-pass cw-brief');
      var box = FF.ui.div('cw-pass__box');
      var count = FF.ui.span('cw-brief__count', '5');
      box.appendChild(count);
      var race = v.settings.play !== 'coop';
      box.appendChild(FF.ui.el('p', { class: 'cw-pass__title' }, race ? t('cwRaceTitle', 'Race: first to finish wins') : t('cwCoopTitle', 'Co-op: solve it together')));
      box.appendChild(FF.ui.el('p', { class: 'cw-note' }, race
        ? (v.settings.checking === 'expert'
          ? t('cwRaceExpertSub', 'Everyone gets the same puzzle. Nothing is checked until you press Check grid, and each wrong check adds 20 seconds.')
          : t('cwRaceSub', 'Everyone gets the same puzzle. Finish a word and it is checked: gold is right, red is not.'))
        : t('cwCoopSub', 'One grid for everyone, in your own colours. A right word locks and scores for whoever typed its last letter.')));
      card.appendChild(box);
      f.root.appendChild(card);
      brief = { el: card, count: count };
      if (B) B.lock(true);
      api.audio.play('whoosh');
    }
    function hideBrief() {
      if (!brief) return;
      var el = brief.el;
      brief = null;
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      if (B) { B.lock(false); B.focusInput(); }
      api.audio.play('roundStart');
    }

    function helpRow() {
      if (!B) return;
      var list = [];
      if (!coop() && expert()) {
        var full = allFilled();
        list.push({
          label: t('cwCheckGrid', 'Check grid'), icon: 'check', cls: 'cw-helpbtn--check' + (full ? ' is-ready' : ''),
          cost: '+20s', aria: t('cwCheckGridRaceAria', 'Check the whole grid (a wrong check adds 20 seconds)'),
          fn: checkGrid, disabled: !full || checkWaiting
        });
      } else if (!coop()) {
        list.push({ label: t('cwClearWrong', 'Clear wrong'), icon: 'eraser', aria: t('cwClearWrongAria', 'Clear the red letters'), fn: clearWrong, disabled: !Object.keys(wrongShown).length });
      }
      B.setHelp(list);
    }

    /* ---------- the cursor (as one-device play) ---------- */

    function startOf(w) {
      for (var i = 0; i < w.cells.length; i++) if (!filled[keyOf(w.cells[i][0], w.cells[i][1])]) return { r: w.cells[i][0], c: w.cells[i][1], dir: w.dir };
      return { r: w.r, c: w.c, dir: w.dir };
    }
    function go(p) {
      if (!p || !B) return;
      sel = { r: p.r, c: p.c };
      if (p.dir) dir = p.dir;
      B.setSelection(sel, dir);
    }
    function clue(step) {
      if (!B) return;
      var w = C.wordAt(built, sel, dir);
      go(C.nextClue(built, filled, w ? w.id : null, step));
    }
    function flip() {
      if (!B) return;
      var other = dir === 'across' ? 'down' : 'across';
      var at = built.at[keyOf(sel.r, sel.c)];
      if (at && at[other]) { dir = other; api.audio.play('flip'); B.setSelection(sel, dir); }
    }
    function tapCell(r, c) {
      if (!B) return;
      if (r === sel.r && c === sel.c) flip();
      else {
        var at = built.at[keyOf(r, c)];
        sel = { r: r, c: c };
        if (at && !at[dir]) dir = dir === 'across' ? 'down' : 'across';
        api.audio.play('tap');
        B.setSelection(sel, dir);
      }
      B.focusInput();
    }
    function arrow(dr, dc) {
      if (!B) return;
      var want = dr ? 'down' : 'across';
      if (want !== dir) { var at = built.at[keyOf(sel.r, sel.c)]; if (at && at[want]) { dir = want; B.setSelection(sel, dir); return; } }
      var r = sel.r + dr, c = sel.c + dc;
      while (r >= 0 && c >= 0 && r < built.size && c < built.size) {
        if (!built.block[r][c]) { sel = { r: r, c: c }; B.setSelection(sel, dir); return; }
        r += dr; c += dc;
      }
    }
    function wordsAt(r, c) {
      var at = built.at[keyOf(r, c)] || {};
      return [at.across, at.down].filter(Boolean).map(function (id) { return B.words[id]; });
    }
    function textOf(w) { return w.cells.map(function (rc) { return filled[keyOf(rc[0], rc[1])] || ''; }).join(''); }
    function wordFull(w) { return textOf(w).length === w.len; }
    function allFilled() { return !!B && Object.keys(B.cells).every(function (k) { return filled[k]; }); }
    function setWrong(k, on, shake) {
      var p = k.split(',').map(Number);
      if (on) wrongShown[k] = true; else delete wrongShown[k];
      if (on && !shake) { B.cells[k].el.classList.add('is-wrong'); return; }
      B.setWrong(p[0], p[1], on);
    }

    /* ---------- typing ---------- */

    function type(ch) {
      if (!canType()) return;
      var k = keyOf(sel.r, sel.c);
      if (fixed[k]) { go(C.next(built, filled, sel, dir)); return; }
      var here = { r: sel.r, c: sel.c };
      filled[k] = ch;
      B.setLetter(here.r, here.c, ch);
      if (wrongShown[k]) setWrong(k, false);
      api.audio.play('tick');
      if (coop()) {
        mine[k] = { ch: ch, at: Date.now() };
        var col = who(client.uid).color;
        if (col) B.setTint(here.r, here.c, col);
        client.fill(here.r, here.c, ch);
      } else if (!expert()) {
        wordsAt(here.r, here.c).forEach(function (w) {
          if (seenSolved[w.id] || !wordFull(w)) return;
          var text = textOf(w);
          if (sent[w.id] === text) return;
          sent[w.id] = text;
          client.word(w.id, text);
        });
      }
      helpRow();
      go(C.next(built, filled, here, dir));
    }
    function clearCell(r, c) {
      var k = keyOf(r, c);
      delete filled[k];
      if (wrongShown[k]) setWrong(k, false);
      B.setLetter(r, c, '');
      if (coop()) { mine[k] = { ch: '', at: Date.now() }; client.fill(r, c, ''); }
      helpRow();
    }
    function back() {
      if (!canType()) return;
      var k = keyOf(sel.r, sel.c);
      if (filled[k] && !fixed[k]) { clearCell(sel.r, sel.c); api.audio.play('tap'); return; }
      var p = C.prev(built, filled, sel, dir);
      go(p);
      var k2 = keyOf(p.r, p.c);
      if (filled[k2] && !fixed[k2]) { clearCell(p.r, p.c); api.audio.play('tap'); }
    }
    function clearWrong() {
      Object.keys(wrongShown).forEach(function (k) { var p = k.split(',').map(Number); if (!fixed[k]) clearCell(p[0], p[1]); });
      api.audio.play('tap');
      helpRow();
    }
    function checkGrid() {
      if (!canType() || !allFilled() || checkWaiting) return;
      var rows = [];
      for (var r = 0; r < built.size; r++) {
        var row = '';
        for (var c = 0; c < built.size; c++) row += built.block[r][c] ? '#' : (filled[keyOf(r, c)] || '.');
        rows.push(row);
      }
      if (client.grid(rows)) { checkWaiting = true; api.audio.play('select'); helpRow(); }
    }

    function lockWord(w, sweep) {
      w.cells.forEach(function (rc) {
        var k = keyOf(rc[0], rc[1]);
        fixed[k] = true;
        if (wrongShown[k]) setWrong(k, false);
      });
      if (sweep) B.solveWord(w.id);
    }

    /* ---------- following the referee ---------- */

    function syncRace(v) {
      var m = v.p[client.uid];
      if (!m) return;
      Object.keys(m.solved).forEach(function (id) {
        if (seenSolved[id] || !B.words[id]) return;
        seenSolved[id] = true;
        lockWord(B.words[id], true);
        api.audio.play('correct');
      });
      if (m.miss && m.miss.n > lastMiss) {
        lastMiss = m.miss.n;
        var w = B.words[m.miss.w];
        // Still the letters that were checked? Then they are wrong: show it.
        if (w && !seenSolved[w.id] && textOf(w) === sent[w.id]) {
          w.cells.forEach(function (rc) { var k = keyOf(rc[0], rc[1]); if (!fixed[k]) setWrong(k, true, true); });
          api.audio.play('wrong');
        }
      }
      if ((m.checks || 0) > lastChecks) {
        lastChecks = m.checks;
        checkWaiting = false;
        if (!m.finishedAt) {
          api.audio.play('wrong');
          if (api.shell.toast) api.shell.toast(m.wrong === 1 ? t('cwOneWrongPenalty', '1 square is not right yet: +20 seconds') : t('cwNWrongPenalty', '{n} squares are not right yet: +20 seconds', { n: m.wrong || 0 }), 'hint');
          if (B.grid && FF.CrosswordGame.animationsOn()) restart(B.grid, 'is-shake');
        }
      }
      if (m.finishedAt && !doneCard && v.status !== 'over') {
        built.words.forEach(function (x) { if (!seenSolved[x.id]) { seenSolved[x.id] = true; lockWord(x, false); } });
        B.lock(true);
        B.ripple(sel);
        api.audio.play('winner');
        var card = FF.ui.div('cw-pass cw-done');
        var box = FF.ui.div('cw-pass__box');
        box.appendChild(FF.ui.el('p', { class: 'cw-pass__title' }, t('cwFinishedIn', 'Finished in {time}!', { time: G.clock(m.ms != null ? m.ms : m.finishedAt - v.playAt) })));
        box.appendChild(FF.ui.el('p', { class: 'cw-note' }, t('cwWaitOthers', 'Waiting for the others to finish…')));
        card.appendChild(box);
        f.root.appendChild(card);
        doneCard = card;
        if (FF.CrosswordGame.animationsOn() && FF.Confetti) FF.Confetti.burst(60);
      }
      helpRow();
    }

    function syncCoop(v) {
      var now = Date.now();
      Object.keys(B.cells).forEach(function (k) {
        var p = k.split(',').map(Number);
        var cell = v.grid[p[0] + '_' + p[1]];
        var server = cell ? cell.ch : '';
        var mineHere = mine[k];
        if (mineHere) {
          if (server === mineHere.ch || now - mineHere.at > PENDING_MS) delete mine[k];
          else return;   // our own letter, on its way
        }
        if ((filled[k] || '') === server) return;
        if (server) filled[k] = server; else delete filled[k];
        B.setLetter(p[0], p[1], server, cell && cell.by === client.uid ? 'quiet' : undefined);
        var col = cell ? who(cell.by).color : null;
        B.setTint(p[0], p[1], col);
      });
      Object.keys(v.locked).forEach(function (id) {
        if (seenSolved[id] || !B.words[id]) return;
        seenSolved[id] = true;
        lockWord(B.words[id], true);
        api.audio.play(v.locked[id] === client.uid ? 'correct' : 'tick');
      });
      // Red squares: the words the referee says are wrong, until someone changes them.
      var bad = {};
      Object.keys(v.bad).forEach(function (id) {
        var w = B.words[id];
        if (w) w.cells.forEach(function (rc) { var k = keyOf(rc[0], rc[1]); if (!fixed[k]) bad[k] = true; });
      });
      var fresh = false;
      Object.keys(bad).forEach(function (k) { if (!wrongShown[k]) { setWrong(k, true, true); fresh = true; } });
      Object.keys(wrongShown).forEach(function (k) { if (!bad[k]) setWrong(k, false); });
      if (fresh) api.audio.play('wrong');
      if (v.wrong && v.wrong !== lastWrong && allFilled()) {
        if (api.shell.toast) api.shell.toast(v.wrong === 1 ? t('cwOneWrong', '1 square is not right yet') : t('cwNWrong', '{n} squares are not right yet', { n: v.wrong }), 'hint');
        api.audio.play('wrong');
      }
      lastWrong = v.wrong || null;
    }

    /* ---------- the end ---------- */

    function showEnd(v) {
      endShown = true;
      if (doneCard && doneCard.parentNode) doneCard.parentNode.removeChild(doneCard);
      doneCard = null;
      if (unkeys) { unkeys(); unkeys = null; }
      B.lock(true);
      timerChip.text.textContent = '0:00';
      // The solution, now the match is over.
      var rows = String(v.result.answers || '').split('/');
      Object.keys(B.cells).forEach(function (k) {
        var p = k.split(',').map(Number);
        var want = (rows[p[0]] || '').charAt(p[1]);
        if (!want || want === '#') return;
        if (filled[k] !== want) { filled[k] = want; B.setLetter(p[0], p[1], want, 'reveal'); B.setRevealed(p[0], p[1]); }
        if (wrongShown[k]) setWrong(k, false);
      });
      built.words.forEach(function (w) { if (!seenSolved[w.id]) { seenSolved[w.id] = true; lockWord(w, false); } });
      B.ripple(sel);
      setTimeout(function () { resultCard(v); }, FF.CrosswordGame.animationsOn() ? 900 : 50);
    }

    function resultCard(v) {
      if (ended || !f.root.isConnected) return;
      var res = v.result;
      var isCoop = v.settings.play === 'coop';
      var winners = res.winners || [];
      var meWon = winners.indexOf(client.uid) >= 0 && !res.draw;
      var title;
      if (isCoop) title = res.solved ? t('cwSolvedTogether', 'Solved together!') : t('cwTimeUp', "Time's up!");
      else if (res.draw) title = t('cwDraw', "It's a draw!");
      else if (meWon) title = t('cwYouWin', 'You win!');
      else title = t('cwWins', '{name} wins!', { name: who(winners[0]).name });

      var card = FF.ui.div('cw-win');
      var box = FF.ui.el('div', { class: 'cw-win__box', role: 'dialog', 'aria-label': title });
      box.appendChild(FF.ui.el('p', { class: 'cw-win__kicker' }, (isCoop ? t('cwCoop', 'Co-op') : t('cwRace', 'Race')) + ' · ' + G.levelName(v.settings.level) + (v.settings.checking === 'expert' ? ' · ' + t('cwExpert', 'Expert') : '')));
      box.appendChild(FF.ui.el('h2', { class: 'cw-win__title' }, title));
      if (isCoop) {
        var team = res.rows.reduce(function (n, r) { return n + (r.words || 0); }, 0);
        box.appendChild(FF.ui.el('p', { class: 'cw-note' }, t('cwTeamWords', '{n} of {total} words solved', { n: team, total: v.total })));
      }
      var ol = FF.ui.el('ol', { class: 'cw-win__ranks' });
      res.rows.forEach(function (r) {
        var e = who(r.uid);
        var li = FF.ui.el('li', { class: (r.place === 1 ? 'is-top' : '') + (r.uid === client.uid ? ' is-me' : '') });
        li.appendChild(FF.ui.span('cw-rank__place', String(r.place)));
        var ava = FF.ui.span('cw-turn__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var nm = FF.ui.span('cw-turn__name');
        nm.appendChild(FF.ui.span('', r.uid === client.uid ? t('you', 'You') : e.name));
        var meta = r.ms != null ? G.clock(r.ms) : t('cwNWords', '{n} words', { n: r.words || 0 });
        nm.appendChild(FF.ui.span('cw-rank__meta', meta));
        li.appendChild(nm);
        li.appendChild(FF.ui.span('cw-turn__pts', FF.util.formatNumber(r.points || 0)));
        ol.appendChild(li);
      });
      box.appendChild(ol);
      var actions = FF.ui.div('cw-win__actions');
      var fin = G.btn('cw-btn cw-btn--go', t('srtSeeScores', 'See scores'), 'trophy', function () { api.audio.play('click'); finish(); });
      actions.appendChild(fin);
      box.appendChild(actions);
      card.appendChild(box);
      f.root.appendChild(card);
      api.audio.play(meWon || (isCoop && res.solved) ? 'winner' : 'roundEnd');
      if ((meWon || (isCoop && res.solved)) && FF.CrosswordGame.animationsOn() && FF.Confetti) FF.Confetti.burst(120);
      if (FF.Nav && FF.Nav.focus) setTimeout(function () { if (fin.isConnected) FF.Nav.focus(fin); }, 300);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    function render() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = cw();
      if (!v || (expected() && v.matchId !== expected()) || !FF.CrosswordClient.ready(v)) {
        if (!B) waiting(t('cwGettingReady', 'Shuffling the clues…'), t('cwGettingReadySub', 'Everyone gets the same puzzle at the same moment.'));
        return;
      }
      if (drawn !== v.matchId) draw(v);
      drawStrip(v);
      if (v.status === 'brief') { showBrief(v); return; }
      hideBrief();
      if (v.settings.play === 'coop') syncCoop(v); else syncRace(v);
      if (v.status === 'over' && !endShown) showEnd(v);
    }

    render();
  }

  FF.CrosswordOnline = { start: start };
})();
