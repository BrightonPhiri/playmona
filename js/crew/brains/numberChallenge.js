/* ============================================================
   PLAYMONA — crew/brains/numberChallenge.js
   How PlayMona-run players play Number Challenge online. Two parts:

   FF.CrewNumberChallenge.strategy   pure decisions: the answer,
                             worked out like a person would (the sum
                             on screen through R.solveText, a running
                             total of the chain steps it saw, the best
                             way to the target through R.solveTarget),
                             a miss on purpose by the seat's accuracy,
                             and how long to take.
   FF.CrewNumberChallenge.create     plays one room's crew seats through
                             the same inbox a phone uses
                             (rooms/<code>/ncInbox), so the referee
                             judges a crew answer like any other.

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.NumberChallengeRules;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pickOne(list, random) { return list[Math.floor(random() * list.length)]; }
  function choicesOf(v) {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') return v ? v.split('|') : [];
    return [];
  }
  function listOf(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }
  function roomBand(level) { return level === 'hard' || level === 'expert' ? 'hard' : level === 'easy' ? 'easy' : 'normal'; }

  /* Chance of a right answer, 0.04 to 0.97, from the seat's level, skill and persona (as quiz.js). */
  function accuracy(ctx, roomLevel) {
    var lv = FF.CrewLevels.of(ctx.level);
    var room = FF.CrewLevels.room[roomBand(roomLevel)] || { accuracy: 0 };
    var persona = ctx.persona || {};
    var skill = (ctx.skill && typeof ctx.skill.skill === 'number') ? ctx.skill.skill : 50;
    var p = 0.45 * lv.accuracy + 0.4 * (skill / 100) + 0.15 * ((persona.accuracy != null ? persona.accuracy : 50) / 100) + room.accuracy;
    return clamp(p, 0.04, 0.97);
  }

  /* A near miss someone might type: one or ten off, never below zero. */
  function slip(answer, random) {
    var offs = [1, -1, 10, -10, 2, -2].filter(function (d) { return answer + d >= 0; });
    return String(answer + pickOne(offs, random));
  }

  /* A number answer (quick, sprint, chain): right is the worked-out number or null when it lost track. */
  function numberAnswer(right, choices, p, random) {
    var hit = right != null && random() < p;
    if (choices.length) {
      var good = choices.filter(function (c) { return right != null && Number(c) === right; });
      var bad = choices.filter(function (c) { return right == null || Number(c) !== right; });
      if (hit && good.length) return good[0];
      return bad.length ? pickOne(bad, random) : good[0];
    }
    if (hit) return String(right);
    return slip(right == null ? 10 : right, random);
  }

  /* The text to send for a round as the view shows it. A chain's round carries total, the running
     total from the steps the seat saw (null: it lost track). p is the chance of getting it right. */
  function answer(round, mode, p, random) {
    if (!round) return null;
    if (mode === 'target') {
      var tiles = typeof round.tiles === 'string' ? round.tiles.split(',').map(Number) : listOf(round.tiles).map(Number);
      var ops = typeof round.ops === 'string' ? round.ops.split('') : listOf(round.ops);
      var goal = Number(round.target);
      if (!tiles.length || !goal) return null;
      if (random() < p) {
        var best = R.solveTarget(tiles, goal, ops, { allTiles: round.level === 'expert' });
        if (best) return R.submitText(best.steps, best.value);
      }
      // Ran out of ideas: the tile nearest the target (a real attempt, but never exact).
      var near = tiles.filter(function (t) { return t !== goal; }).sort(function (a, b) { return Math.abs(a - goal) - Math.abs(b - goal); })[0];
      return R.submitText('', near == null ? tiles[0] : near);
    }
    var right = mode === 'chain' ? (typeof round.total === 'number' ? round.total : null) : R.solveText(round.text);
    return numberAnswer(right, choicesOf(round.choices), p, random);
  }

  /* How long to think, in ms, never past the clock. Sprint: the pace from one sum to the next. */
  function delayMs(round, mode, ctx, random) {
    var lv = FF.CrewLevels.of(ctx.level);
    var persona = ctx.persona || {};
    var table = FF.CrewLevels.answerMs || {};
    var base = table.numberChallenge || 4800;
    var pad = round && round.choices == null;
    var ms = mode === 'sprint' ? base * 0.45 * (1 + 0.12 * ((round && round.tier) || 1))
      : mode === 'chain' ? base * 0.7                  // added up while the steps were showing
        : mode === 'target' ? ((round && round.seconds) || 60) * 1000 * 0.45
          : base;
    if (pad) ms *= 1.4;
    var quick = 1.35 - 0.7 * ((persona.reaction != null ? persona.reaction : 50) / 100);
    var spread = (lv.spread || 0.3) * (1.3 - 0.6 * ((persona.consistency != null ? persona.consistency : 50) / 100));
    ms *= lv.speed * quick * Math.exp(spread * (random() * 2 - 1));
    if (mode === 'sprint') return Math.round(clamp(ms, 500, 15000));
    return Math.round(clamp(ms, 700, Math.max(700, ((round && round.seconds) || 20) * 1000 - 1500)));
  }

  var strategy = { accuracy: accuracy, answer: answer, delayMs: delayMs };

  /* As the phones make them: a send counter first so one seat's commands sort in send order. */
  var seq = 0;
  function cmdId() {
    seq = (seq + 1) % 1000000;
    var s = 'c' + ('00000' + seq).slice(-6);
    for (var i = 0; i < 16; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* opts: { transport (room), uids (array or function), crew (run sheets), later(fn, ms), log, random } */
  function create(opts) {
    var T = opts.transport;
    var random = opts.random || Math.random;
    var log = opts.log || function () {};
    var done = {};
    var chains = {};   // matchId|k -> { start, steps: { shown: step } }
    var latest = null;
    var off = null;

    function now() { return T.serverNow(); }
    function seats() { return typeof opts.uids === 'function' ? opts.uids() : (opts.uids || []); }
    function ctxOf(uid) {
      var sheet = (opts.crew || {})[uid] || {};
      var skill = (sheet.skills && sheet.skills.numberChallenge) || { skill: 50, level: 'medium' };
      return { level: skill.level, skill: skill, persona: sheet.persona || {} };
    }
    function sameRound(a, b) { return a && b && a.matchId === b.matchId && a.k === b.k && a.phase === 'open'; }

    function send(uid, nc, text) {
      var cmd = { matchId: nc.matchId, k: nc.k, text: String(text).slice(0, 80), t: T.serverTimestamp ? T.serverTimestamp() : now() };
      return T.set('ncInbox/' + uid + '/' + cmdId(), cmd).catch(function (e) { log('number challenge answer failed: ' + e.message); });
    }

    /* The chain steps go by one at a time: remember each, as a person keeps the total in their head. */
    function noteChain(nc) {
      var rd = nc.round;
      if (!rd || rd.start == null || typeof rd.shown !== 'number') return;
      var key = nc.matchId + '|' + nc.k;
      var c = chains[key] || (chains[key] = { start: Number(rd.start), steps: {} });
      if (rd.shown > 0 && rd.step) c.steps[rd.shown] = { op: rd.step.op, n: rd.step.n == null ? null : Number(rd.step.n) };
    }
    function chainTotal(nc) {
      var c = chains[nc.matchId + '|' + nc.k];
      if (!c) return null;
      var v = c.start;
      for (var i = 1; i <= nc.round.steps; i++) {
        if (!c.steps[i]) return null;   // missed a step: lost track
        v = R.applyStep(v, c.steps[i]);
      }
      return v;
    }

    function roundFor(nc) {
      var rd = Object.assign({}, nc.round, { level: nc.settings && nc.settings.level });
      if (nc.settings && nc.settings.mode === 'chain') rd.total = chainTotal(nc);
      return rd;
    }

    function answerOne(uid, nc) {
      var ctx = ctxOf(uid);
      var rd = roundFor(nc);
      var mode = nc.settings.mode;
      var ms = Math.min(delayMs(rd, mode, ctx, random), Math.max(300, (nc.closeAt || 0) - now() - 800));
      opts.later(function () {
        var cur = latest;
        if (!sameRound(cur, nc)) return;
        var me = (cur.p || {})[uid];
        if (!me || me.inK === cur.k) return;
        var text = answer(rd, mode, accuracy(ctx, nc.settings.level), random);
        if (text) send(uid, cur, text);
      }, ms);
    }

    /* Sprint: down the list in order at the seat's pace until its clock (with penalties) ends. */
    function sprintRun(uid, nc) {
      var ctx = ctxOf(uid);
      var list = listOf(nc.round.list);
      var i = ((nc.p || {})[uid] || {}).at || 0;
      var p = accuracy(ctx, nc.settings.level);
      function step() {
        var cur = latest;
        if (!sameRound(cur, nc)) return;
        var me = (cur.p || {})[uid] || {};
        if (me.done || (typeof me.end === 'number' && now() > me.end) || i >= list.length) return;
        var item = Object.assign({}, list[i], { level: nc.settings.level });
        var text = answer(item, 'sprint', p, random);
        if (text != null) send(uid, cur, i + ':' + String(text).replace(/\D/g, ''));
        i++;
        if (i < list.length) opts.later(step, delayMs(list[i], 'sprint', ctx, random));
      }
      opts.later(step, delayMs(list[i] || {}, 'sprint', ctx, random));
    }

    function onNc(nc) {
      latest = nc;
      if (!nc || !nc.round || nc.round.k !== nc.k || !nc.settings) return;
      var mode = nc.settings.mode;
      if (mode === 'chain') noteChain(nc);
      if (nc.phase !== 'open') return;
      if (mode === 'target' && !nc.round.tiles) return;
      if (mode === 'sprint' && !nc.round.list) return;
      seats().forEach(function (uid) {
        var row = (nc.p || {})[uid];
        var dk = nc.matchId + '|' + nc.k + '|' + uid;
        if (!row || row.inK === nc.k || done[dk]) return;
        done[dk] = true;
        if (mode === 'sprint') sprintRun(uid, nc);
        else answerOne(uid, nc);
      });
    }

    return {
      start: function () { off = T.watch('nc', onNc); },
      stop: function () { if (off) off(); off = null; latest = null; chains = {}; }
    };
  }

  FF.CrewNumberChallenge = { strategy: strategy, create: create };

  // The referee deals the rounds; the seats play through FF.CrewNumberChallenge instead.
  if (FF.CrewBrains) FF.CrewBrains.register(['numberChallenge'], { plan: function () { return null; } });
})();
