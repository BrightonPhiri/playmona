/* ============================================================
   PLAYMONA — crew/brains/imposters.js
   How PlayMona-run players play Imposters. Two parts, kept apart:

   FF.CrewImposters.strategy   pure decisions (a clue, a vote, a stop
                               time, when to call a vote), per mode and
                               level, so more levels or an AI-provider
                               strategy can be added without touching
                               the referee or the seat player.
   FF.CrewImposters.create     plays one room's crew seats through the
                               same inbox a phone uses, so the referee
                               checks a crew command like any other.

   A crew player only ever sees the public view and its OWN secret:
   its word (or target) and the hints its word brings to mind. It is
   never told the other word, the other side, or anyone's ballot.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.ImpostersRules;
  var FALLBACK_CLUES = ['everyday', 'common', 'popular', 'useful', 'familiar', 'classic', 'simple', 'normal', 'ordinary', 'regular'];
  var NOISE = { easy: 0.45, medium: 0.22, hard: 0.08 };           // chance a vote is a guess
  var STOP_SIGMA = { easy: 900, medium: 500, hard: 250 };          // ms of timing error

  function low(s) { return String(s || '').toLowerCase(); }
  function stemOf(w) { return low(w).replace(/(ings|ing|ers|er|ies|es|ed|s)$/, ''); }
  function pickOne(list, random) { return list.length ? list[Math.floor(random() * list.length)] : null; }
  function shuffle(list, random) { return R.shuffle(list, function (n) { return Math.floor(random() * n); }); }

  function gauss(random) {
    var u = Math.max(1e-9, random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  }

  /* The board as [{ uid: value }] oldest first. */
  function rounds(imp) {
    return FF.ImpostersClient ? FF.ImpostersClient.boardRounds(imp).map(function (r) { return r.values; })
      : Object.keys((imp && imp.board) || {}).sort().map(function (k) { return imp.board[k]; });
  }

  /* ---------- Word Imposter ---------- */

  function knows(secret) {
    var set = {};
    (secret.hints || []).concat(secret.shared || []).forEach(function (h) { set[stemOf(h)] = true; });
    return set;
  }

  function cluesBy(imp, uid) {
    return rounds(imp).map(function (r) { return r[uid]; }).filter(function (c) { return c; });
  }

  /* How well someone's clues fit what this player's word brings to mind (0..1, 0.5 if unknown). */
  function fit(imp, uid, secret) {
    var mine = knows(secret);
    var cs = cluesBy(imp, uid);
    if (!cs.length) return 0.5;
    return cs.filter(function (c) { return mine[stemOf(c)]; }).length / cs.length;
  }

  /* Do the others' clues fit my word? If hardly any do, I may be the odd one out. */
  function suspectSelf(imp, me, secret) {
    var others = (imp.order || []).filter(function (u) { return u !== me; });
    var cs = 0, hits = 0;
    var mine = knows(secret);
    others.forEach(function (u) {
      cluesBy(imp, u).forEach(function (c) { cs++; if (mine[stemOf(c)]) hits++; });
    });
    return cs >= 2 && hits / cs < 0.25;
  }

  var word = {
    clue: function (ctx) {
      var secret = ctx.secret;
      var used = {};
      rounds(ctx.imp).forEach(function (r) { Object.keys(r).forEach(function (u) { if (r[u]) used[low(r[u])] = true; }); });
      var hints = (secret.hints || []).slice();
      var shared = (secret.shared || []).slice();
      // Careful players who suspect they are the odd one out lean on clues that fit both words.
      var hiding = ctx.level !== 'easy' && suspectSelf(ctx.imp, ctx.uid, secret);
      var order = hiding ? shuffle(shared, ctx.random).concat(shuffle(hints, ctx.random))
        : shuffle(hints, ctx.random).concat(shuffle(shared, ctx.random));
      order = order.concat(shuffle(FALLBACK_CLUES, ctx.random));
      for (var i = 0; i < order.length; i++) {
        var c = order[i];
        if (used[low(c)]) continue;
        var v = R.validateClue(c, { secret: secret.word, used: ctx.myClues || [], isQuiet: ctx.isQuiet });
        if (v.ok) return v.value;
      }
      return null;
    },

    suspicion: function (ctx, uid) { return 1 - fit(ctx.imp, uid, ctx.secret); }
  };

  /* ---------- Number Imposter ---------- */

  function median(list) {
    var a = list.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return 0;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  var number = {
    stopAt: function (ctx) {
      var sigma = STOP_SIGMA[ctx.level] || STOP_SIGMA.medium;
      return Math.max(300, Math.round(ctx.secret.target + gauss(ctx.random) * sigma));
    },

    // Far from the others' typical time, round after round, looks suspicious.
    suspicion: function (ctx, uid) {
      var total = 0, n = 0;
      rounds(ctx.imp).forEach(function (r) {
        var times = Object.keys(r).map(function (u) { return r[u]; }).filter(function (v) { return v >= 0; });
        if (times.length < 2 || !(r[uid] >= 0)) return;
        total += Math.abs(r[uid] - median(times));
        n++;
      });
      return n ? total / n / 1000 : 0.5;
    }
  };

  /* ---------- shared ---------- */

  var strategy = {
    word: word,
    number: number,

    vote: function (ctx) {
      var mode = ctx.imp.mode === 'number' ? number : word;
      var candidates = (ctx.imp.candidates || []).filter(function (u) { return u !== ctx.uid && ctx.imp.seats[u] && ctx.imp.seats[u].alive; });
      if (!candidates.length) return null;
      if (ctx.random() < (NOISE[ctx.level] || NOISE.medium)) return pickOne(candidates, ctx.random);
      var best = null, score = -1;
      shuffle(candidates, ctx.random).forEach(function (u) {
        var s = mode.suspicion(ctx, u);
        if (s > score) { score = s; best = u; }
      });
      return best;
    },

    /* When in the discussion to press Vote now (a fraction of it), or never (-1). */
    callVoteAt: function (ctx) {
      var patience = ((ctx.persona && ctx.persona.patience) || 50) / 100;
      if (ctx.imp.final) return 0.35 + ctx.random() * 0.3;
      if (ctx.random() < 0.25 * patience) return -1;
      return 0.3 + patience * 0.4 + ctx.random() * 0.2;
    },

    /* Which way out of the talk to back: { type: 'callVote' | 'moreClues', at } or null.
       Patient players want another clue round more often, most of all after round 1. */
    discuss: function (ctx) {
      var patience = ((ctx.persona && ctx.persona.patience) || 50) / 100;
      if (!ctx.imp.final && ctx.random() < (ctx.imp.round <= 1 ? 0.35 : 0.15) + patience * 0.3) {
        return { type: 'moreClues', at: 0.2 + ctx.random() * 0.4 };
      }
      var at = strategy.callVoteAt(ctx);
      return at < 0 ? null : { type: 'callVote', at: at };
    }
  };

  /* ---------- playing the seats ---------- */

  function cmdId() {
    var s = 'c';
    for (var i = 0; i < 24; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* opts: { transport (room), uids (array, or a function returning the seats now), crew (run sheets), secretOf(uid) -> Promise<secret|null>,
     later(fn, ms), log, random, isQuiet } */
  function create(opts) {
    var T = opts.transport;
    var random = opts.random || Math.random;
    var log = opts.log || function () {};
    var done = {};
    var clues = {};
    var off = null;

    function now() { return T.serverNow(); }

    /* This seat's own secret for the match. One retry: the referee may still be writing it, and
       a read that fails must never pass silently (a crew player would just never clue). */
    function secretFor(uid, matchId) {
      function read() {
        return Promise.resolve().then(function () { return opts.secretOf(uid); }).then(function (s) {
          return s && s.matchId === matchId ? s : null;
        });
      }
      return read().catch(function (e) { log('imposters secret read failed for ' + uid + ': ' + (e && e.message)); return null; }).then(function (s) {
        if (s) return s;
        return new Promise(function (resolve) { opts.later(resolve, 1200); }).then(read).catch(function (e) {
          log('imposters secret read failed again for ' + uid + ': ' + (e && e.message));
          return null;
        });
      });
    }

    function level(uid) {
      var sheet = opts.crew[uid] || {};
      var k = sheet.skills && sheet.skills.imposters;
      return (k && k.level) || 'medium';
    }

    function send(uid, imp, type, extra) {
      var cmd = { type: type, matchId: imp.matchId, phaseId: imp.phaseId, t: now() };
      Object.keys(extra || {}).forEach(function (k) { cmd[k] = extra[k]; });
      return T.set('impInbox/' + uid + '/' + cmdId(), cmd).catch(function (e) { log('imposters ' + type + ' failed: ' + e.message); });
    }

    // Act once per seat per phase, a human-like moment later, and only if still current.
    function act(uid, imp, ms, fn) {
      var key = uid + ':' + imp.matchId + ':' + imp.phaseId;
      if (done[key]) return;
      done[key] = true;
      var due = Math.min(ms, Math.max(0, imp.deadline - now() - 1500));
      opts.later(function () {
        var cur = latest;
        if (!cur || cur.matchId !== imp.matchId || cur.phaseId !== imp.phaseId) return;
        fn(cur);
      }, due);
    }

    var latest = null;

    function onImp(imp) {
      latest = imp;
      if (!imp || imp.phase === 'ended') return;
      // Asked each time: the room's player list can arrive after the game starts.
      (typeof opts.uids === 'function' ? opts.uids() : opts.uids).forEach(function (uid) {
        var seat = imp.seats && imp.seats[uid];
        if (!seat || !seat.alive) return;
        var lv = level(uid);
        var sheet = opts.crew[uid] || {};
        if (imp.phase === 'reveal' && !seat.ready) {
          act(uid, imp, 1500 + random() * 3500, function (cur) { send(uid, cur, 'ready'); });
        } else if (imp.phase === 'clues' && !seat.submitted) {
          act(uid, imp, 4000 + random() * 9000, function (cur) {
            secretFor(uid, cur.matchId).then(function (secret) {
              if (!secret) { log('imposters: ' + uid + ' has no secret, so no clue'); return; }
              if (!latest || latest.phaseId !== cur.phaseId) return;
              var c = strategy.word.clue({ imp: cur, uid: uid, secret: secret, level: lv, random: random, myClues: clues[uid] || [], isQuiet: opts.isQuiet });
              if (!c) { log('imposters: ' + uid + ' found no clue to give'); return; }
              clues[uid] = (clues[uid] || []).concat([c.toLowerCase()]);
              send(uid, cur, 'clue', { clue: c });
            }).catch(function (e) { log('imposters clue failed for ' + uid + ': ' + (e && e.message)); });
          });
        } else if (imp.phase === 'challenge' && !seat.submitted) {
          var key = uid + ':' + imp.matchId + ':' + imp.phaseId;
          if (done[key]) return;
          done[key] = true;
          secretFor(uid, imp.matchId).then(function (secret) {
            if (!secret) { log('imposters: ' + uid + ' has no target, so no stop'); return; }
            var aim = strategy.number.stopAt({ secret: secret, level: lv, random: random });
            opts.later(function () {
              if (!latest || latest.phaseId !== imp.phaseId) return;
              send(uid, latest, 'stop', { ms: aim });
            }, imp.goAt + aim - now());
          });
        } else if (imp.phase === 'discuss' && !seat.wantsVote && !seat.wantsClues) {
          var key2 = uid + ':' + imp.matchId + ':' + imp.phaseId;
          if (done[key2]) return;
          var pick = strategy.discuss({ imp: imp, random: random, persona: sheet.persona });
          if (!pick) { done[key2] = true; return; }
          var span = Math.max(0, imp.deadline - now());
          act(uid, imp, span * pick.at, function (cur) { send(uid, cur, pick.type); });
        } else if (imp.phase === 'vote' && !seat.voted) {
          act(uid, imp, 3000 + random() * 9000, function (cur) {
            secretFor(uid, cur.matchId).then(function (secret) {
              if (!secret) return;
              var target = strategy.vote({ imp: cur, uid: uid, secret: secret, level: lv, random: random });
              if (target) send(uid, cur, 'vote', { target: target });
            }).catch(function (e) { log('imposters vote failed for ' + uid + ': ' + (e && e.message)); });
          });
        }
      });
    }

    return {
      start: function () { off = T.watch('imp', onImp); },
      stop: function () { if (off) off(); off = null; latest = null; }
    };
  }

  FF.CrewImposters = { strategy: strategy, create: create };

  // Imposters has no seeded rounds to plan; the seats play through FF.CrewImposters instead.
  if (FF.CrewBrains) FF.CrewBrains.register(['imposters'], { plan: function () { return null; } });
})();
