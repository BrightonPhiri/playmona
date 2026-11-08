/* ============================================================
   PLAYMONA — crew/brains/whatsMissing.js
   How PlayMona-run players play What's Missing? online. Two parts:

   FF.CrewWhatsMissing.strategy   pure decisions: what changed, worked
                                  out from the study board the seat saw
                                  and the changed board (like a person,
                                  it never sees the answer), a miss on
                                  purpose by the seat's accuracy, and
                                  how long to take.
   FF.CrewWhatsMissing.create     plays one room's crew seats through
                                  the same inbox a phone uses
                                  (rooms/<code>/wmInbox), so the referee
                                  checks a crew answer like any other.

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WhatsMissingRules;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pickOne(list, random) { return list[Math.floor(random() * list.length)]; }
  function filled(list) { var out = []; (list || []).forEach(function (id, i) { if (id) out.push(i); }); return out; }

  /* The room's level for the crew's level table: Expert plays like Hard. */
  var ROOM = { easy: 'easy', normal: 'normal', hard: 'hard', expert: 'hard' };

  /* Chance of a right answer, 0.04 to 0.97, from the seat's level, skill and persona (as quiz.js). */
  function accuracy(ctx, roomLevel) {
    var lv = FF.CrewLevels.of(ctx.level);
    var room = FF.CrewLevels.room[ROOM[roomLevel] || 'normal'] || { accuracy: 0 };
    var persona = ctx.persona || {};
    var skill = (ctx.skill && typeof ctx.skill.skill === 'number') ? ctx.skill.skill : 50;
    var p = 0.45 * lv.accuracy + 0.4 * (skill / 100) + 0.15 * ((persona.accuracy != null ? persona.accuracy : 50) / 100) + room.accuracy;
    return clamp(p, 0.04, 0.97);
  }

  /* A name that is not this picture's, for a wrong spelled answer. */
  function wrongName(id, random) {
    var all = R.cards();
    for (var i = 0; i < 40; i++) {
      var c = pickOne(all, random);
      if (c.id !== id && R.spellable(c.name) && !R.checkName(c.name, id).ok) return c.name;
    }
    return 'Zebra';
  }

  /* The answer for a round, from the study board (before) and the changed board (round.after).
     p is the chance of getting it right (each gap on its own in Several gone). null: nothing seen. */
  function answer(round, before, p, random) {
    if (!round || !before || !round.after) return null;
    var after = round.after;
    var right = function () { return random() < p; };
    if (round.twist === 'added') {
      var news = filled(after).filter(function (s) { return !before[s]; });
      if (!news.length) return null;
      if (right()) return { slots: [news[0]] };
      return { slots: [pickOne(filled(after).filter(function (s) { return s !== news[0]; }), random)] };
    }
    if (round.twist === 'swapped') {
      var moved = filled(after).filter(function (s) { return before[s] && before[s] !== after[s]; });
      if (moved.length !== 2) return null;
      if (right()) return { slots: moved };
      var rest = filled(after).filter(function (s) { return moved.indexOf(s) === -1; });
      var one = pickOne(rest, random);
      // Half the time one of the pair and a wrong one; otherwise two wrong ones.
      var two = random() < 0.5 ? moved[0] : pickOne(rest.filter(function (s) { return s !== one; }), random);
      return { slots: [one, two] };
    }
    // Gone and Several gone: what was in each gap, in gap order.
    var holes = (round.holes && round.holes.length) ? round.holes
      : filled(before).filter(function (s) { return !after[s]; });
    var ids = holes.map(function (s) { return before[s]; });
    if (!ids.length || ids.some(function (x) { return !x; })) return null;
    if (round.spell) {
      return { text: ids.map(function (id) { return right() ? R.cardOf(id).name : wrongName(id, random); }) };
    }
    var decoys = (round.choices || []).filter(function (c) { return ids.indexOf(c) === -1; });
    return {
      picks: ids.map(function (id, i) {
        if (right() || !decoys.length) return id;
        // A wrong pick: a decoy, or another gap's picture in the wrong gap.
        var others = ids.filter(function (x, j) { return j !== i; });
        return others.length && random() < 0.3 ? others[0] : pickOne(decoys, random);
      })
    };
  }

  /* How long to think, in ms: more pictures and more gaps take longer; never past the clock. */
  function delay(round, ctx, random) {
    var lv = FF.CrewLevels.of(ctx.level);
    var persona = ctx.persona || {};
    var base = (FF.CrewLevels.answerMs && FF.CrewLevels.answerMs.whatsMissing) || 3600;
    var ms = base * (0.6 + 0.4 * (round.n || 6) / 6) * (round.gaps > 1 ? 1.2 + 0.25 * round.gaps : 1) * (round.spell ? 1.8 : 1);
    var quick = 1.35 - 0.7 * ((persona.reaction != null ? persona.reaction : 50) / 100);
    var spread = (lv.spread || 0.3) * (1.3 - 0.6 * ((persona.consistency != null ? persona.consistency : 50) / 100));
    ms *= lv.speed * quick * Math.exp(spread * (random() * 2 - 1));
    return Math.round(clamp(ms, 900, Math.max(900, (round.secs || 20) * 1000 - 1500)));
  }

  var strategy = { accuracy: accuracy, answer: answer, delay: delay };

  function cmdId() {
    var s = 'c';
    for (var i = 0; i < 24; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* As FF.WhatsMissingClient.encode: one string per answer, so it never arrives in pieces. */
  function encode(a) {
    var clean = function (s) { return String(s == null ? '' : s).replace(/[|,]/g, ' ').slice(0, 40); };
    if (a.slots) return { slots: a.slots.map(String).join(',') };
    if (a.text) return { text: a.text.map(clean).join('|') };
    return { picks: (a.picks || []).map(clean).join(',') };
  }

  /* opts: { transport (room), uids (array or function), crew (run sheets), later(fn, ms), log, random } */
  function create(opts) {
    var T = opts.transport;
    var random = opts.random || Math.random;
    var log = opts.log || function () {};
    var boards = {};      // matchId|k -> the study board this seat saw
    var done = {};
    var latest = null;
    var off = null;

    function now() { return T.serverNow(); }
    function seats() { return typeof opts.uids === 'function' ? opts.uids() : (opts.uids || []); }
    function ctxOf(uid) {
      var sheet = (opts.crew || {})[uid] || {};
      var skill = (sheet.skills && sheet.skills.whatsMissing) || { skill: 50, level: 'medium' };
      return { level: skill.level, skill: skill, persona: sheet.persona || {} };
    }

    function send(uid, wm, a) {
      var cmd = { type: 'answer', matchId: wm.matchId, k: wm.k, t: T.serverTimestamp ? T.serverTimestamp() : now() };
      var enc = encode(a);
      Object.keys(enc).forEach(function (key) { cmd[key] = enc[key]; });
      return T.set('wmInbox/' + uid + '/' + cmdId(), cmd).catch(function (e) { log('whatsmissing answer failed: ' + e.message); });
    }

    function onWm(v) {
      var wm = v && FF.WhatsMissingClient ? FF.WhatsMissingClient.tidy(v) : v;
      latest = wm;
      if (!wm || !wm.round || wm.round.k !== wm.k) return;
      var key = wm.matchId + '|' + wm.k;
      if (wm.phase === 'study' && wm.round.before) { boards[key] = wm.round.before.map(function (x) { return x || null; }); return; }
      if (wm.phase !== 'open' || !wm.round.after) return;
      var rd = wm.round;
      rd.after = rd.after.map(function (x) { return x || null; });
      seats().forEach(function (uid) {
        var row = (wm.p || {})[uid];
        var dk = key + '|' + uid;
        if (!row || row.inK === wm.k || done[dk]) return;
        done[dk] = true;
        var ctx = ctxOf(uid);
        var ms = Math.min(delay(rd, ctx, random), Math.max(300, wm.closeAt - now() - 800));
        opts.later(function () {
          var cur = latest;
          if (!cur || cur.matchId !== wm.matchId || cur.k !== wm.k || cur.phase !== 'open') return;
          var a = answer(rd, boards[key], accuracy(ctx, wm.settings && wm.settings.level), random);
          if (a) send(uid, cur, a);
        }, ms);
      });
    }

    return {
      start: function () { off = T.watch('wm', onWm); },
      stop: function () { if (off) off(); off = null; latest = null; }
    };
  }

  FF.CrewWhatsMissing = { strategy: strategy, create: create };

  // The referee deals the rounds; the seats play through FF.CrewWhatsMissing instead.
  if (FF.CrewBrains) FF.CrewBrains.register(['whatsMissing'], { plan: function () { return null; } });
})();
