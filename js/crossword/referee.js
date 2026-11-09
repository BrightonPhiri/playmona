/* ============================================================
   PLAYMONA — crossword/referee.js
   The one authority for an online Mini Crossword match. It runs on
   the server (inside the Node crew runner), never on a player's phone
   except in dev rooms.

   It picks the puzzle with the server's random and keeps the answers
   in memory: the room only ever sees the grid's shape, the clues and
   everyone's progress. Two ways to play:

     Race  - everyone solves their own copy. With letters checked a
             phone sends one finished word at a time; in Expert it
             sends the whole grid and hears only how many squares are
             wrong (each wrong check costs 20 seconds). First to
             finish wins; at the time limit the rest rank by words.
     Co-op - one shared grid, letter by letter. When a word's squares
             are all filled it is checked; a right word locks and
             scores for whoever placed its last letter.

   Phones read rooms/<code>/cw and send commands through
   rooms/<code>/cwInbox/<uid>/<cmdId>:
     { type:'word', word:'1A', text, matchId, t }       race, checked
     { type:'grid', text:'ROW1/ROW2/...', matchId, t }  race, Expert
     { type:'fill', r, c, ch, matchId, t }              co-op ('' clears)

     var ref = FF.CrosswordReferee.create({
       run,        // { matchId, roomCode, seats, settings, startAt, seed? }
       room,       // transport scoped to rooms/<code>
       store,      // { load() -> Promise<state|null>, save(state) -> Promise }
       randomInt, timers, log, report(event, payload), onEnd
     });
     ref.start(); ... ref.stop();

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.CrosswordRules;

  var PRESENCE_STALE_MS = 20000;   // as js/net/room.js
  var BRIEF_MS = 5000;             // after the room's countdown: read how to play
  var GRACE_MS = 600;              // a command sent this soon after the clock still counts
  var WRONG_MS = 20000;            // Expert race: each wrong grid check adds this to your time
  var WORD_PTS = { easy: 10, normal: 15, hard: 20 };   // per letter, as one-device take turns

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }
  function cellKey(r, c) { return r + '_' + c; }

  function create(opts) {
    var run = opts.run;
    var room = opts.room;
    var store = opts.store || { load: function () { return Promise.resolve(null); }, save: function () { return Promise.resolve(); } };
    var randomInt = opts.randomInt;
    var timers = opts.timers || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); }
    };
    var log = opts.log || function () {};
    var report = opts.report || function () { return Promise.resolve(); };

    var state = null;
    var players = {};
    var offs = [];
    var timer = null;
    var stopped = false;
    var writes = Promise.resolve();
    var puzzle = null, built = null;   // the answers: memory only, never saved to the room

    function now() { return room.serverNow(); }
    function later(fn) {
      writes = writes.then(fn).catch(function (e) { log('write failed: ' + (e && e.message)); });
      return writes;
    }
    function expert() { return state.settings.checking === 'expert'; }
    function coop() { return state.settings.play === 'coop'; }
    function wordById(id) {
      for (var i = 0; i < built.words.length; i++) if (built.words[i].id === id) return built.words[i];
      return null;
    }
    function wordPoints(w) { return Math.round(w.len * WORD_PTS[state.settings.level] * (expert() ? 1.5 : 1)); }
    function deal() {
      puzzle = R.pick(FF.data.crosswords, Object.assign({}, state.settings, { sharedDeal: true }), state.seed);
      if (!puzzle) throw new Error('No crossword for ' + state.settings.level + ' / ' + state.settings.pack + '.');
      built = R.build(puzzle);
    }

    /* ---------- the start ---------- */

    function blankPlayer() { return { done: 0, solved: {}, finishedAt: null, wrong: null, penalty: 0, last: 0, points: 0 }; }

    function fresh() {
      var seats = list(run.seats);
      if (seats.length < 1 || seats.length > R.MAX_PLAYERS) throw new Error('Mini Crossword takes 1 to ' + R.MAX_PLAYERS + ' players.');
      var startAt = run.startAt || 0;
      state = {
        v: 1, matchId: run.matchId, roomCode: run.roomCode, startAt: startAt,
        settings: R.sanitize(run.settings), seed: run.seed != null ? run.seed : randomInt(2147483647), seats: seats, players: {},
        status: 'brief', playAt: startAt + BRIEF_MS, endsAt: 0,
        cells: {}, locked: {}, bad: {}, gridWrong: null, result: null
      };
      state.endsAt = state.playAt + R.RACE_MS[state.settings.level];
      seats.forEach(function (uid) { state.players[uid] = blankPlayer(); });
      return state;
    }

    function revive(s) {
      s.seats = list(s.seats);
      s.players = s.players || {};
      s.cells = s.cells || {};
      s.locked = s.locked || {};
      s.bad = s.bad || {};
      s.settings = R.sanitize(s.settings);
      s.seats.forEach(function (uid) {
        var p = s.players[uid] = s.players[uid] || blankPlayer();
        p.solved = p.solved || {};
      });
      return s;
    }

    function start() {
      return store.load().then(function (saved) {
        if (stopped) return;
        if (saved && saved.matchId === run.matchId) {
          state = revive(saved);
          log('resuming ' + run.matchId + ' at ' + state.status);
        } else {
          fresh();
          later(function () { return room.set('cwInbox', null); });
        }
        deal();
        offs.push(room.watch('players', function (v) { players = v || {}; if (state && state.status === 'play') checkDone(); }));
        offs.push(room.watch('cwInbox', onInbox));
        save();
        publish();
        schedule();
      });
    }

    function stop() {
      stopped = true;
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    /* ---------- the clock ---------- */

    var tickNo = 0;
    function schedule() {
      if (timer != null) timers.clearTimeout(timer);
      timer = null;
      if (!state || state.status === 'over' || stopped) return;
      var due = state.status === 'brief' ? state.playAt : state.endsAt + GRACE_MS;
      var id = ++tickNo;
      timer = timers.setTimeout(function () {
        timer = null;
        if (!stopped && id === tickNo) onClock();
      }, Math.max(0, due - now()));
    }

    function onClock() {
      var t = now();
      if (state.status === 'brief') {
        if (t < state.playAt) { schedule(); return; }
        state.status = 'play';
        save();
        publish();
        schedule();
        return;
      }
      if (state.status === 'play') { if (t >= state.endsAt + GRACE_MS) finish('time'); else schedule(); }
    }

    /* Race: everyone still here has finished. Co-op: every word is locked. */
    function checkDone() {
      if (state.status !== 'play') return false;
      if (coop()) {
        if (Object.keys(state.locked).length >= built.words.length) { finish('done'); return true; }
        return false;
      }
      var t = now();
      var known = Object.keys(players).length > 0;
      var waiting = state.seats.some(function (uid) {
        if (state.players[uid].finishedAt) return false;
        return !known || online(players[uid], t);
      });
      if (!waiting) { finish('done'); return true; }
      return false;
    }

    /* ---------- commands ---------- */

    function complete(cmd) {
      if (!cmd || typeof cmd.matchId !== 'string' || typeof cmd.t !== 'number') return false;
      if (cmd.type === 'word') return typeof cmd.word === 'string' && typeof cmd.text === 'string';
      if (cmd.type === 'grid') return typeof cmd.text === 'string';
      if (cmd.type === 'fill') return typeof cmd.r === 'number' && typeof cmd.c === 'number' && typeof cmd.ch === 'string';
      return false;
    }

    function onInbox(tree) {
      if (!state || stopped || !tree) return;
      var clear = {};
      var batch = [];
      Object.keys(tree).forEach(function (uid) {
        var cmds = tree[uid] || {};
        Object.keys(cmds).forEach(function (id) {
          var cmd = cmds[id];
          // The dev transport delivers a command one field at a time: wait for all of it.
          if (!complete(cmd)) return;
          clear[uid + '/' + id] = null;
          batch.push({ uid: uid, cmd: cmd });
        });
      });
      if (Object.keys(clear).length) later(function () { return room.update('cwInbox', clear); });
      // Oldest first; at the same moment, the later uid wins (so every phone agrees).
      batch.sort(function (a, b) { return a.cmd.t - b.cmd.t || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0); });
      var changed = false;
      batch.forEach(function (x) { if (take(x.uid, x.cmd)) changed = true; });
      if (changed) {
        save();
        publish();
        checkDone();
      }
    }

    function take(uid, cmd) {
      var p = state.players[uid];
      if (!p || cmd.matchId !== state.matchId || state.status !== 'play') return false;
      var sentAt = Math.min(cmd.t, now());
      if (sentAt < state.playAt || sentAt > state.endsAt + GRACE_MS) return false;
      if (coop()) return cmd.type === 'fill' && fill(uid, cmd, sentAt);
      if (p.finishedAt) return false;
      if (cmd.type === 'word' && !expert()) return raceWord(uid, p, cmd, sentAt);
      if (cmd.type === 'grid' && expert()) return raceGrid(uid, p, cmd, sentAt);
      return false;
    }

    function raceWord(uid, p, cmd, sentAt) {
      var w = wordById(cmd.word);
      if (!w || p.solved[w.id]) return false;
      if (!R.checkWord(puzzle, w.id, String(cmd.text).slice(0, 12))) return false;
      p.solved[w.id] = true;
      p.done++;
      p.last = sentAt;
      p.points += wordPoints(w);
      if (p.done >= built.words.length) p.finishedAt = sentAt;
      return true;
    }

    function raceGrid(uid, p, cmd, sentAt) {
      var rows = String(cmd.text).slice(0, 120).toUpperCase().split('/');
      var bad = R.wrongCells(puzzle, rows);
      if (bad.length) {
        p.wrong = bad.length;
        p.penalty += WRONG_MS;
        return true;
      }
      p.wrong = 0;
      built.words.forEach(function (w) { p.solved[w.id] = true; });
      p.done = built.words.length;
      p.last = sentAt;
      p.finishedAt = sentAt;
      return true;
    }

    function wordsAt(r, c) {
      return built.words.filter(function (w) { return w.cells.some(function (rc) { return rc[0] === r && rc[1] === c; }); });
    }

    function fill(uid, cmd, sentAt) {
      var r = cmd.r, c = cmd.c;
      if (r < 0 || c < 0 || r >= built.size || c >= built.size || built.block[r][c]) return false;
      var ch = String(cmd.ch).toUpperCase();
      if (ch && !/^[A-Z]$/.test(ch)) return false;
      var words = wordsAt(r, c);
      if (words.some(function (w) { return state.locked[w.id]; })) return false;
      var k = cellKey(r, c);
      var was = state.cells[k];
      if (was && (cmd.t < was.t || (cmd.t === was.t && uid < was.by))) return false;
      if (ch) state.cells[k] = { ch: ch, by: uid, t: cmd.t };
      else delete state.cells[k];
      words.forEach(function (w) { delete state.bad[w.id]; });
      if (expert()) {
        state.gridWrong = null;
        var all = built.words.every(full);
        if (all) checkWords(built.words, true);
      } else {
        checkWords(words.filter(full), false);
      }
      return true;
    }

    function full(w) { return w.cells.every(function (rc) { return !!state.cells[cellKey(rc[0], rc[1])]; }); }

    /* Right words lock and score for whoever placed their last letter. */
    function checkWords(words, whole) {
      var wrongSquares = 0;
      words.forEach(function (w) {
        if (state.locked[w.id]) return;
        var text = w.cells.map(function (rc) { return state.cells[cellKey(rc[0], rc[1])].ch; }).join('');
        if (R.checkWord(puzzle, w.id, text)) {
          var by = null, t = -1;
          w.cells.forEach(function (rc) { var x = state.cells[cellKey(rc[0], rc[1])]; if (x.t > t || (x.t === t && x.by > by)) { t = x.t; by = x.by; } });
          state.locked[w.id] = by;
          if (state.players[by]) { state.players[by].points += wordPoints(w); state.players[by].done++; state.players[by].last = t; }
        } else if (!whole) {
          state.bad[w.id] = true;
        }
      });
      if (whole) {
        var grid = [];
        for (var r = 0; r < built.size; r++) {
          var row = '';
          for (var c = 0; c < built.size; c++) row += built.block[r][c] ? '#' : ((state.cells[cellKey(r, c)] || {}).ch || '.');
          grid.push(row);
        }
        wrongSquares = R.wrongCells(puzzle, grid).length;
        state.gridWrong = wrongSquares || null;
      }
    }

    /* ---------- the end ---------- */

    function ranked() {
      var rows = state.seats.map(function (uid) {
        var p = state.players[uid];
        var ms = p.finishedAt ? p.finishedAt - state.playAt + p.penalty : null;
        var points = p.points;
        if (!coop() && p.finishedAt) {
          points = Math.max(points, R.score({ level: state.settings.level, ms: ms, help: {}, expert: expert() }).points);
        }
        return { uid: uid, points: points, words: p.done, ms: ms, last: p.last, finished: !!p.finishedAt };
      });
      if (coop()) {
        rows.sort(function (a, b) { return b.points - a.points || b.words - a.words || a.last - b.last; });
      } else {
        rows.sort(function (a, b) {
          if (a.finished !== b.finished) return a.finished ? -1 : 1;
          if (a.finished) return a.ms - b.ms;
          return b.words - a.words || a.last - b.last;
        });
      }
      rows.forEach(function (r, i) {
        var prev = rows[i - 1];
        var tie = prev && (coop() ? prev.points === r.points && prev.words === r.words
          : prev.finished === r.finished && (r.finished ? prev.ms === r.ms : prev.words === r.words && prev.last === r.last));
        r.place = tie ? prev.place : i + 1;
      });
      return rows;
    }

    function finish(why) {
      if (state.status === 'over') return;
      var rows = ranked();
      var top = rows.filter(function (r) { return r.place === 1; }).map(function (r) { return r.uid; });
      var t = now();
      var solvedAll = coop() && Object.keys(state.locked).length >= built.words.length;
      state.result = {
        why: why, winners: top, draw: top.length > 1, solved: solvedAll,
        rows: rows.map(function (r) { return { uid: r.uid, place: r.place, points: r.points, words: r.words, ms: r.ms }; }),
        answers: puzzle.rows.join('/')   // the match is over: show the solution
      };
      state.status = 'over';
      state.endedAt = t;
      var platform = state.result.rows.map(function (r) {
        var pl = players[r.uid] || {};
        return { id: r.uid, uid: r.uid, name: pl.name || 'Player', avatar: pl.avatar || '', color: pl.color || '', points: r.points, correct: r.words };
      });
      later(function () {
        return room.update('meta', { status: 'ended', endedAt: t, results: { gameId: 'miniCrossword', startAt: state.startAt, createdAt: t, ranked: platform } });
      });
      save();
      publish();
      schedule();
      Promise.resolve(report('crossword', {
        matchId: state.matchId, roomCode: state.roomCode, settings: state.settings, why: why,
        seats: state.result.rows.map(function (r) { return { uid: r.uid, place: r.place, points: r.points, correct: r.words, won: top.indexOf(r.uid) !== -1 }; })
      })).catch(function (e) { log('report failed: ' + (e && e.message)); });
      if (typeof opts.onEnd === 'function') opts.onEnd(state.result);
    }

    /* ---------- writing ---------- */

    function save() {
      if (!state) return;
      var copy = JSON.parse(JSON.stringify(state));
      later(function () { return store.save(copy); });
    }

    /* The public view: the shape and clues, never the rows (until the end) or the seed. */
    function view() {
      var shape = R.shape(puzzle);
      delete shape.id;
      var v = {
        v: 1, matchId: state.matchId, status: state.status, settings: state.settings, shape: shape,
        order: state.seats, startAt: state.startAt, playAt: state.playAt, endsAt: state.endsAt, total: built.words.length, p: {}
      };
      state.seats.forEach(function (uid) {
        var p = state.players[uid];
        var row = { done: p.done, total: built.words.length, finishedAt: p.finishedAt || null, wrong: p.wrong, points: p.points };
        if (Object.keys(p.solved).length) row.solved = p.solved;
        v.p[uid] = row;
      });
      if (coop()) {
        var grid = {};
        Object.keys(state.cells).forEach(function (k) { grid[k] = { ch: state.cells[k].ch, by: state.cells[k].by }; });
        if (Object.keys(grid).length) v.grid = grid;
        if (Object.keys(state.locked).length) v.locked = state.locked;
        if (Object.keys(state.bad).length) v.bad = state.bad;
        if (state.gridWrong) v.wrong = state.gridWrong;
      }
      if (state.status === 'over') v.result = state.result;
      return v;
    }

    function publish() {
      var copy = JSON.parse(JSON.stringify(view()));
      return later(function () { return room.set('cw', copy); });
    }

    return {
      start: start,
      stop: stop,
      state: function () { return state; },
      flush: function () { return writes; }
    };
  }

  FF.CrosswordReferee = { create: create, BRIEF_MS: BRIEF_MS, GRACE_MS: GRACE_MS, WRONG_MS: WRONG_MS, WORD_PTS: WORD_PTS };
})();
