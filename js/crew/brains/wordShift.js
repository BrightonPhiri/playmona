/* ============================================================
   PLAYMONA — crew/brains/wordShift.js
   How PlayMona-run players play the WordShift Race online. Two parts:

   FF.CrewWordShift.strategy   pure decisions: a way from the word a
                               seat is on to the target, found by
                               searching real words (it never sees the
                               referee's answer); slips like a person's
                               (a longer way round, a non-word); and
                               how long each move takes.
   FF.CrewWordShift.create     plays one room's crew seats through the
                               same inbox a phone uses
                               (wordshiftInbox/<code>), one move at a
                               time, so the referee checks a crew move
                               like any other. Each seat reads only its
                               own words (opts.mineOf -> wordshiftMine).

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordShiftRules;
  var ABC = 'abcdefghijklmnopqrstuvwxyz';
  var MAX_NODES = 40000;   // a search this big gives up (no puzzle needs it)

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function list(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }

  function neighbours(w, isWord) {
    var out = [];
    for (var i = 0; i < w.length; i++) {
      for (var c = 0; c < 26; c++) {
        var ch = ABC.charAt(c);
        if (ch === w.charAt(i)) continue;
        var n = w.slice(0, i) + ch + w.slice(i + 1);
        if (isWord(n)) out.push(n);
      }
    }
    return out;
  }

  /* The words after `from` on a shortest way to `to`, never through a used word.
     [] when already there, null when there is no way. */
  function route(from, to, used, isWord) {
    if (from === to) return [];
    if (!from || !to || from.length !== to.length) return null;
    var blocked = {};
    (used || []).forEach(function (w) { blocked[w] = true; });
    var prev = {};
    prev[from] = '';
    var queue = [from], head = 0, seen = 1;
    while (head < queue.length) {
      var w = queue[head++];
      var next = neighbours(w, isWord);
      for (var i = 0; i < next.length; i++) {
        var n = next[i];
        if (prev[n] !== undefined || (blocked[n] && n !== to)) continue;
        prev[n] = w;
        if (n === to) {
          var path = [n];
          while (prev[path[0]] !== from) path.unshift(prev[path[0]]);
          return path;
        }
        if (++seen > MAX_NODES) return null;
        queue.push(n);
      }
    }
    return null;
  }

  /* The next word to send from `from`; p is the chance of a sure, shortest step.
     null: stuck, nothing worth sending. */
  function move(from, to, used, p, random, isWord) {
    var miss = 1 - clamp(p, 0, 1);
    var r = random();
    if (r < miss * 0.25) {
      // A slip of the finger: one letter changed into something that is not a word.
      for (var tries = 0; tries < 40; tries++) {
        var i = Math.floor(random() * from.length);
        var ch = ABC.charAt(Math.floor(random() * 26));
        var w = from.slice(0, i) + ch + from.slice(i + 1);
        if (w !== from && !isWord(w)) return w;
      }
    }
    var path = route(from, to, used, isWord);
    var best = path && path.length ? path[0] : null;
    var free = neighbours(from, isWord).filter(function (n) { return (used || []).indexOf(n) === -1; });
    if (!free.length) return null;
    if (best && r >= miss * 0.65) return best;
    // A longer way round: a real word, just not the best one.
    var others = free.filter(function (n) { return n !== best; });
    var pool = others.length ? others : free;
    return pool[Math.floor(random() * pool.length)];
  }

  /* Chance of a sure step, 0.04 to 0.97, from the seat's level, skill and persona (as quiz.js). */
  function accuracy(ctx, roomLevel) {
    var lv = FF.CrewLevels.of(ctx.level);
    var rooms = FF.CrewLevels.room || {};
    var room = rooms[roomLevel] || rooms[roomLevel === 'easy' ? 'normal' : 'hard'] || { accuracy: 0 };
    var persona = ctx.persona || {};
    var skill = (ctx.skill && typeof ctx.skill.skill === 'number') ? ctx.skill.skill : 50;
    var p = 0.45 * lv.accuracy + 0.4 * (skill / 100) + 0.15 * ((persona.accuracy != null ? persona.accuracy : 50) / 100) + room.accuracy;
    if (roomLevel === 'expert') p -= 0.08;
    return clamp(p, 0.04, 0.97);
  }

  /* How long one move takes, in ms: longer words take longer to read and change. */
  function delay(len, ctx, random) {
    var lv = FF.CrewLevels.of(ctx.level);
    var persona = ctx.persona || {};
    var table = FF.CrewLevels.answerMs || {};
    var ms = (table.wordShift || 5200) * (0.6 + 0.1 * (len || 4));
    var quick = 1.35 - 0.7 * ((persona.reaction != null ? persona.reaction : 50) / 100);
    var spread = (lv.spread || 0.3) * (1.3 - 0.6 * ((persona.consistency != null ? persona.consistency : 50) / 100));
    ms *= lv.speed * quick * Math.exp(spread * (random() * 2 - 1));
    return Math.round(clamp(ms, 1500, 30000));
  }

  var strategy = { route: route, move: move, accuracy: accuracy, delay: delay, neighbours: neighbours };

  function cmdId() {
    var s = 'c';
    for (var i = 0; i < 24; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  var AVOID = {};
  (R.AVOID || []).forEach(function (w) { AVOID[w] = true; });
  function clean(isWord) { return function (w) { return !AVOID[w] && isWord(w); }; }
  function commonWord(w) { return !!(FF.Words && /^[a-z]+$/.test(w) && FF.Words.tier(w) > 0 && FF.Words.tier(w) <= 2); }
  function anyWord(w) { return !!(FF.Words && /^[a-z]+$/.test(w) && FF.Words.tier(w) > 0); }

  /* opts: { transport (room), uids (array or function), crew (run sheets), later(fn, ms),
             mineOf(uid) -> Promise<own words>, inbox { set(uid/id, cmd) } at wordshiftInbox/<code>,
             log, random, isWord? } */
  function create(opts) {
    var T = opts.transport;
    var random = opts.random || Math.random;
    var log = opts.log || function () {};
    // Crew never play the words the puzzles leave out (R.AVOID).
    var common = clean(opts.isWord || commonWord);
    var any = clean(opts.isWord || anyWord);
    var planned = {};
    var latest = null;
    var off = null;

    function now() { return T.serverNow(); }
    function seats() { return typeof opts.uids === 'function' ? opts.uids() : (opts.uids || []); }
    function ctxOf(uid) {
      var sheet = (opts.crew || {})[uid] || {};
      var skill = (sheet.skills && sheet.skills.wordShift) || { skill: 50, level: 'medium' };
      return { level: skill.level, skill: skill, persona: sheet.persona || {} };
    }
    function stepOf(row) { return (row.moves || 0) + (row.invalid || 0); }

    function send(uid, ws, word) {
      var cmd = { matchId: ws.matchId, k: ws.k, word: word, t: T.serverTimestamp ? T.serverTimestamp() : now() };
      if (!opts.inbox) return Promise.resolve();
      return opts.inbox.set(uid + '/' + cmdId(), cmd).catch(function (e) { log('wordshift move failed: ' + e.message); });
    }

    function play(uid, ws, step) {
      var cur = latest;
      if (!cur || cur.matchId !== ws.matchId || cur.k !== ws.k || cur.phase !== 'open') return;
      var row = (cur.p || {})[uid];
      if (!row || row.done || stepOf(row) !== step || !opts.mineOf) return;
      Promise.resolve(opts.mineOf(uid)).then(function (mine) {
        if (!mine || mine.matchId !== cur.matchId || mine.k !== cur.k || mine.done || typeof mine.word !== 'string') return;
        var p = accuracy(ctxOf(uid), cur.settings && cur.settings.level);
        var used = list(mine.used);
        var word = move(mine.word, cur.puzzle.t, used, p, random, common) || move(mine.word, cur.puzzle.t, used, p, random, any);
        if (word) send(uid, cur, word);
      }).catch(function (e) { log('wordshift words failed: ' + (e && e.message)); });
    }

    function onWs(ws) {
      latest = ws;
      if (!ws || ws.phase !== 'open' || !ws.puzzle || typeof ws.puzzle.t !== 'string') return;
      seats().forEach(function (uid) {
        var row = (ws.p || {})[uid];
        if (!row || row.done) return;
        var step = stepOf(row);
        var key = ws.matchId + '|' + ws.k + '|' + uid + '|' + step;
        if (planned[key]) return;
        planned[key] = true;
        var room = Math.max(0, (ws.closeAt || 0) - now() - 500);
        var ms = Math.min(delay(ws.puzzle.t.length, ctxOf(uid), random), room);
        if (ms <= 0) return;
        opts.later(function () { play(uid, ws, step); }, ms);
      });
    }

    return {
      start: function () { off = T.watch('ws', onWs); },
      stop: function () { if (off) off(); off = null; latest = null; }
    };
  }

  FF.CrewWordShift = { strategy: strategy, create: create };

  // The referee deals the puzzles; the seats play through FF.CrewWordShift instead.
  if (FF.CrewBrains) FF.CrewBrains.register(['wordShift'], { plan: function () { return null; } });
})();
