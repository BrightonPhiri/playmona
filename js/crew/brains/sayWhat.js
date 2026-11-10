/* ============================================================
   PLAYMONA — crew/brains/sayWhat.js
   How PlayMona-run players play Say What? online. Two parts:

   FF.CrewSayWhat.strategy   pure decisions: the missing word(s),
                             worked out like a person who knows the
                             saying (FF.SayWhatRules.solve reads the
                             masked saying; it never sees the seed),
                             a miss on purpose by the seat's accuracy,
                             and how long to take.
   FF.CrewSayWhat.create     plays one room's crew seats through the
                             same inbox a phone uses
                             (rooms/<code>/swInbox), so the referee
                             checks a crew answer like any other.

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SayWhatRules;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pickOne(list, random) { return list[Math.floor(random() * list.length)]; }
  function list(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v ? v.split('|') : [];
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }

  /* Chance of a right answer, 0.04 to 0.97, from the seat's level, skill and persona (as quiz.js). */
  function accuracy(ctx, roomLevel) {
    var lv = FF.CrewLevels.of(ctx.level);
    var room = FF.CrewLevels.room[roomLevel === 'hard' ? 'hard' : 'normal'] || { accuracy: 0 };
    var persona = ctx.persona || {};
    var skill = (ctx.skill && typeof ctx.skill.skill === 'number') ? ctx.skill.skill : 50;
    var p = 0.45 * lv.accuracy + 0.4 * (skill / 100) + 0.15 * ((persona.accuracy != null ? persona.accuracy : 50) / 100) + room.accuracy;
    return clamp(p, 0.04, 0.97);
  }

  /* The text to send for a round as the view shows it ({ words, choices? }); p is the chance of
     getting it right. null: the saying is not one it knows. */
  function answer(round, p, random) {
    if (!round) return null;
    var found = R.solve(round.words);
    if (!found) return null;
    var row = R.row(found.id);
    if (!row) return null;
    var item = { id: found.id, gaps: found.gaps };
    var right = random() < p;
    var choices = list(round.choices);
    if (choices.length) {
      var good = choices.filter(function (c) { return R.check(item, c).ok; });
      var bad = choices.filter(function (c) { return !R.check(item, c).ok; });
      if (right && good.length) return good[0];
      return bad.length ? pickOne(bad, random) : good[0] || null;
    }
    if (right) return found.gaps.join(' ');
    // A wrong spelling: a decoy in one gap (or both), the way people mix sayings up.
    var miss = Math.floor(random() * found.gaps.length);
    var words = found.gaps.map(function (g, i) {
      var decoys = row.decoys[g] || [];
      if ((i === miss || random() < 0.3) && decoys.length) return pickOne(decoys, random);
      return g;
    });
    var text = words.join(' ');
    return R.check(item, text).ok ? (row.decoys[found.gaps[0]] || ['zebra']).concat(found.gaps.slice(1)).join(' ') : text;
  }

  /* How long to think, in ms: spelling takes longer than picking, two gaps longer still; never past the clock. */
  function delay(round, ctx, random, mode) {
    var lv = FF.CrewLevels.of(ctx.level);
    var persona = ctx.persona || {};
    var choice = mode === 'choice' || (round && list(round.choices).length > 0);
    var table = FF.CrewLevels.answerMs || {};
    var base = choice ? (table.sayWhatChoice || 3500) : (table.sayWhat || 6000);
    var ms = base * (round && round.two ? 1.4 : 1);
    var quick = 1.35 - 0.7 * ((persona.reaction != null ? persona.reaction : 50) / 100);
    var spread = (lv.spread || 0.3) * (1.3 - 0.6 * ((persona.consistency != null ? persona.consistency : 50) / 100));
    ms *= lv.speed * quick * Math.exp(spread * (random() * 2 - 1));
    return Math.round(clamp(ms, 900, Math.max(900, ((round && round.seconds) || 20) * 1000 - 1500)));
  }

  var strategy = { accuracy: accuracy, answer: answer, delay: delay };

  function cmdId() {
    var s = 'c';
    for (var i = 0; i < 24; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* opts: { transport (room), uids (array or function), crew (run sheets), later(fn, ms), log, random } */
  function create(opts) {
    var T = opts.transport;
    var random = opts.random || Math.random;
    var log = opts.log || function () {};
    var done = {};
    var latest = null;
    var off = null;

    function now() { return T.serverNow(); }
    function seats() { return typeof opts.uids === 'function' ? opts.uids() : (opts.uids || []); }
    function ctxOf(uid) {
      var sheet = (opts.crew || {})[uid] || {};
      var skill = (sheet.skills && sheet.skills.sayWhat) || { skill: 50, level: 'medium' };
      return { level: skill.level, skill: skill, persona: sheet.persona || {} };
    }

    function send(uid, sw, text) {
      var cmd = { matchId: sw.matchId, k: sw.k, text: String(text).slice(0, 60), t: T.serverTimestamp ? T.serverTimestamp() : now() };
      return T.set('swInbox/' + uid + '/' + cmdId(), cmd).catch(function (e) { log('saywhat answer failed: ' + e.message); });
    }

    function onSw(sw) {
      latest = sw;
      if (!sw || sw.phase !== 'open' || !sw.round || sw.round.k !== sw.k) return;
      var rd = sw.round;
      var mode = sw.settings && sw.settings.answer;
      seats().forEach(function (uid) {
        var row = (sw.p || {})[uid];
        var dk = sw.matchId + '|' + sw.k + '|' + uid;
        if (!row || row.inK === sw.k || done[dk]) return;
        done[dk] = true;
        var ctx = ctxOf(uid);
        var ms = Math.min(delay(rd, ctx, random, mode), Math.max(300, (sw.closeAt || 0) - now() - 800));
        opts.later(function () {
          var cur = latest;
          if (!cur || cur.matchId !== sw.matchId || cur.k !== sw.k || cur.phase !== 'open') return;
          var text = answer(rd, accuracy(ctx, sw.settings && sw.settings.level), random);
          if (text) send(uid, cur, text);
        }, ms);
      });
    }

    return {
      start: function () { off = T.watch('sw', onSw); },
      stop: function () { if (off) off(); off = null; latest = null; }
    };
  }

  FF.CrewSayWhat = { strategy: strategy, create: create };

  // The referee deals the rounds; the seats play through FF.CrewSayWhat instead.
  if (FF.CrewBrains) FF.CrewBrains.register(['sayWhat'], { plan: function () { return null; } });
})();
