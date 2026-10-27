/* ============================================================
   PLAYMONA — net/race.js
   The only multiplayer surface a game touches. When no room is
   active every call is inert and games fall through to their
   normal single-device behaviour.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // How far in the future a round is scheduled to open. Every device waits
  // for this shared instant before revealing the question, so nobody can
  // answer early. Without it the host answers first every time: Firebase
  // applies a device's own write optimistically, so the host's watcher
  // fires immediately while everyone else waits a network round trip.
  var LEAD_MS = 1200;

  var session = null;         // { gameId, rounds, timerMs, pointsFor, index, settled }
  // Set just before a player joins a game already under way: the next game
  // started skips the rounds that are already over (see catchingUp).
  var rejoinPending = false;
  // Kept after end() so the final results screen can still derive scores;
  // scoring needs the game's pointsFor, and the session is gone by then.
  var lastSession = null;
  var settleHandlers = [];
  var offRounds = null;
  var timeoutPoll = null;
  // What the current round shows, for people watching (FF.Broadcast). The
  // answer is kept back until the round settles, so a watch link opened on a
  // second phone can never give it away.
  var described = null;        // { n, screen, answer, revealed }
  // Unlike settle handlers these outlive a game: the broadcaster listens once per room.
  var screenListeners = [];

  function room() { return FF.Room ? FF.Room.current() : null; }

  /* ---------- Game length: number of questions and/or a game clock ----------
     The host picks them in the lobby (meta.settings.questions / .clock, in
     seconds). The game ends after that many questions, or after the round
     that is in progress when the clock runs out, whichever comes first. */
  var UNTIL_TIME_UP = 200;   // rounds to plan when only the clock limits the game
  function roomSettings() {
    var r = room();
    return (r && r.meta && r.meta.settings) || {};
  }
  function clockDeadline() {
    var r = room();
    var secs = Number(roomSettings().clock) || 0;
    if (!r || !r.meta || !r.meta.startAt || secs <= 0) return null;
    return r.meta.startAt + secs * 1000;
  }

  function clip(text, max) { return String(text == null ? '' : text).slice(0, max); }

  // Pictures people watching can draw. Anything else, or a drawing too big to
  // send every round, is left out. Viewers show svg only through <img>.
  var IMAGE_LIMITS = { flag: 12, src: 200, emoji: 16, svg: 30000 };
  function cleanImage(image) {
    if (!image || typeof image !== 'object') return null;
    var kinds = Object.keys(IMAGE_LIMITS);
    for (var i = 0; i < kinds.length; i++) {
      var v = image[kinds[i]];
      if (typeof v === 'string' && v && v.length <= IMAGE_LIMITS[kinds[i]]) {
        var out = {};
        out[kinds[i]] = v;
        return out;
      }
    }
    return null;
  }

  function screenInfo() {
    if (!described) return null;
    return { n: described.n, screen: described.screen, answer: described.revealed ? described.answer : null };
  }

  function emitScreen() {
    var info = screenInfo();
    screenListeners.slice().forEach(function (fn) {
      try { fn(info); } catch (e) { if (window.console) console.error('[FF.Race]', e); }
    });
  }

  function emitSettle(payload) {
    if (described && session && described.n === session.index && !described.revealed) {
      described.revealed = true;
      emitScreen();
    }
    settleHandlers.slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { if (window.console) console.error('[FF.Race]', e); }
    });
  }

  function currentRound() {
    var r = room();
    if (!r || !session) return null;
    var node = (r.rounds || {})[session.index];
    return node || { startedAt: null, answers: {}, winner: null };
  }

  function nameOf(uid) {
    var r = room();
    var p = r && r.players ? r.players[uid] : null;
    return p ? p.name : 'Someone';
  }

  /* Who a round waits for: players here and looking at this game. Someone
     who left the game for the lobby, or switched to another app, is skipped,
     so one absent phone can no longer hold up (freeze) every round. */
  function playersInGame() {
    var r = room();
    var startAt = r && r.meta ? r.meta.startAt : null;
    return FF.Room.racePlayers().filter(function (p) {
      if (p.away) return false;
      return !(startAt != null && p.leftGame === startAt);
    });
  }

  /* Re-evaluate the current round whenever round data changes, and
     on a slow poll so a pure timeout still settles with no writes. */
  function finalise(winnerId, reason) {
    if (!session || session.settled) return;
    var r = room();
    if (!r) return;
    session.settled = true;
    stopPoll();
    var n = session.index;
    var scoreFor = session.pointsFor;

    // Read the winning answer rather than trusting the local snapshot: the
    // winner slot is claimed before the answer is written, so the answer
    // may not have reached this device yet and the points would read zero.
    var answerP = winnerId
      ? r.transport.get('rounds/' + n + '/answers/' + winnerId)
      : Promise.resolve(null);

    // With a game clock, the first device to settle this round records
    // whether time is up; everyone reads that one answer, so every phone
    // ends the game after the same round.
    var deadline = clockDeadline();
    var lastP = !deadline ? Promise.resolve(false) : r.transport.transaction('rounds/' + n + '/last', function (current) {
      return current == null ? (r.transport.serverNow() >= deadline) : undefined;
    }).then(function () {
      return r.transport.get('rounds/' + n + '/last');
    }).catch(function () {
      return r.transport.serverNow() >= deadline;
    });

    Promise.all([answerP.catch(function () { return null; }), lastP]).then(function (both) {
      var answer = both[0];
      var last = both[1] === true;
      if (last && session && session.index === n) session.lastRound = n;
      emitSettle({
        winnerId: winnerId || null,
        winnerName: winnerId ? nameOf(winnerId) : null,
        correct: winnerId === r.uid,
        points: answer ? scoreFor(answer, 1) : 0,
        reason: reason,
        timeUp: last
      });
    });
  }

  function evaluate() {
    if (!session || session.settled || session.claiming) return;
    var r = room();
    if (!r) return;

    var node = currentRound();
    var verdict = FF.RaceRules.settle(
      node,
      playersInGame(),
      session.timerMs,
      r.transport.serverNow(),
      session.mode
    );
    if (!verdict.settled) return;

    // A winner already recorded in the room is a shared fact - settle on it.
    if (node && node.winner && node.winner !== FF.RaceRules.NOBODY) {
      finalise(node.winner, 'winner');
      return;
    }
    // In 'first' mode the verdict's winner IS the stored slot.
    if (session.mode === 'first' && verdict.winnerId) {
      finalise(verdict.winnerId, 'winner');
      return;
    }

    // Publish this device's conclusion so every device ends the round the
    // same way. Devices judge timeouts from their own clock, and in
    // 'fastest' mode each derives the winner from the recorded times, so
    // the first write wins and everyone else defers to it.
    session.claiming = true;
    var n = session.index;
    var localReason = verdict.reason;
    var proposal = verdict.winnerId || FF.RaceRules.NOBODY;
    r.transport.transaction('rounds/' + n + '/winner', function (current) {
      return current == null ? proposal : undefined;
    }).then(function () {
      return r.transport.get('rounds/' + n + '/winner');
    }).then(function (stored) {
      session.claiming = false;
      if (stored && stored !== FF.RaceRules.NOBODY) finalise(stored, 'winner');
      else finalise(null, localReason);
    }).catch(function () {
      session.claiming = false;
    });
  }

  function startPoll() {
    stopPoll();
    // A timeout produces no database write, so nothing would wake the
    // round watcher. Poll slowly to notice the clock running out.
    timeoutPoll = setInterval(evaluate, 250);
  }

  function stopPoll() {
    if (timeoutPoll != null) { clearInterval(timeoutPoll); timeoutPoll = null; }
  }

  FF.Race = {
    /* True whenever this device is playing inside a room. Games check
       this BEFORE calling begin(), so it must not depend on a session
       having been created - that would never become true. */
    active: function () { return !!room(); },

    /* True once begin() has opened a race session for a game. */
    running: function () { return !!(session && room()); },

    /* How many rounds to play. fallback is the game's usual number;
       available caps it so questions are not repeated. Offline the game's
       own number is returned unchanged. */
    plan: function (fallback, available) {
      if (!this.active()) return fallback;
      var s = roomSettings();
      var cap = available > 0 ? available : UNTIL_TIME_UP;
      var n = fallback;
      if (Number(s.questions) > 0) n = Number(s.questions);
      else if (Number(s.clock) > 0) n = UNTIL_TIME_UP;
      return Math.max(1, Math.min(n, cap));
    },

    /* The game clock ran out (this device's reading). Settle-based games use
       the shared per-round answer instead; see isLastRound. */
    timeUp: function () {
      var r = room();
      var d = clockDeadline();
      return !!(r && d && r.transport.serverNow() >= d);
    },

    /* Milliseconds left on the game clock, or null without one. */
    clockLeft: function () {
      var r = room();
      var d = clockDeadline();
      if (!r || !d) return null;
      return Math.max(0, d - r.transport.serverNow());
    },

    /* Round n (0-based) is the game's last: the planned count is reached,
       or the clock ran out while it was being played. */
    isLastRound: function (n, total) {
      var s = session || lastSession;
      return (n + 1) >= total || !!(s && s.lastRound === n);
    },

    /* The game is over before round n (0-based) starts. */
    over: function (n) {
      var s = session || lastSession;
      return !!(s && s.lastRound != null && n > s.lastRound);
    },

    /* "Round 3 of 10", with the time left when there is a game clock. */
    roundText: function (n, total) {
      var left = this.active() ? this.clockLeft() : null;
      var unbounded = total >= UNTIL_TIME_UP;
      var base = unbounded
        ? FF.t('roundN', 'Round {n}', { n: n })
        : FF.t('roundOf', 'Round {n} of {total}', { n: n, total: total });
      if (left == null) return base;
      var secs = Math.ceil(left / 1000);
      var clock = Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
      return base + ' \u00b7 ' + FF.t('timeLeftShort', '{time} left', { time: clock });
    },

    begin: function (gameId, opts) {
      opts = opts || {};
      var r = room();
      if (!r) return;
      session = {
        gameId: gameId,
        rounds: opts.rounds || 8,
        timerMs: opts.timerMs || 0,
        pointsFor: opts.pointsFor || function () { return 100; },
        // 'first'    - first correct answer claims the winner slot
        // 'fastest'  - quickest correct answer wins once everyone has gone
        // 'ranked'   - like 'fastest', but every correct answer scores by
        //              its place (pointsFor(answer, place))
        // 'parallel' - everyone plays the same challenge and keeps their
        //              own score; the winner is only for the headline
        // 'vote'     - everyone votes (answer.choice) and each settled round
        //              is scored from all the votes: pointsFor(answers, tally)
        //              returns { uid: points }
        mode: (opts.mode === 'fastest' || opts.mode === 'ranked' || opts.mode === 'parallel' || opts.mode === 'vote') ? opts.mode : 'first',
        index: 0,
        settled: false,
        claiming: false
      };
      lastSession = null;
      session.lastRound = null;
      session.catchUp = rejoinPending;
      rejoinPending = false;
      described = null;   // a new game: nothing from the last one on screen
      if (offRounds) offRounds();
      offRounds = FF.Room.on('rounds', evaluate);
    },

    /* Seed this round's RNG and claim its start time.
       Resolves once the round is open on this device. */
    beginRound: function (n) {
      var r = room();
      if (!r || !session) return Promise.resolve();

      session.index = n;
      session.settled = false;
      session.claiming = false;
      if (described && described.n !== n) described = null;

      FF.Random.seed(FF.Random.roundSeed(r.meta.seed, session.gameId, n));
      // Catching up ends at the first round nobody has finished yet.
      if (session.catchUp) {
        var already = (r.rounds || {})[n];
        if (!(already && already.winner != null)) session.catchUp = false;
      }

      // The first device here schedules when the round OPENS - a moment in
      // the near future, not now - and everyone else reads that same
      // instant. This is what keeps the reveal simultaneous.
      return r.transport.transaction('rounds/' + n + '/startedAt', function (current) {
        return current == null ? (r.transport.serverNow() + LEAD_MS) : undefined;
      }).then(function () {
        startPoll();
        evaluate();
      }).catch(function () { /* a lost race for startedAt is harmless */ });
    },

    /* Say what this round shows, for people watching. screen is
       { kind: 'choice', text, image?, options } or { kind: 'card', text, image? };
       image is { flag } | { src } | { emoji }. answer is the right option's
       index (or null); it is only shared once the round has settled. */
    describe: function (screen, answer) {
      if (!room() || !session || !screen) return;
      var clean = { kind: screen.kind === 'card' ? 'card' : 'choice', text: clip(screen.text, 200) };
      var image = cleanImage(screen.image);
      if (image) clean.image = image;
      if (clean.kind === 'choice') {
        clean.options = (screen.options || []).slice(0, 6).map(function (o) { return clip(o, 80); });
      }
      described = {
        n: session.index,
        screen: clean,
        answer: (typeof answer === 'number' && answer >= 0) ? answer : null,
        revealed: !!session.settled
      };
      emitScreen();
    },

    /* { n, screen, answer } for the current round (answer null until it settles), or null. */
    screen: function () { return screenInfo(); },

    onScreen: function (cb) {
      screenListeners.push(cb);
      return function () {
        var i = screenListeners.indexOf(cb);
        if (i !== -1) screenListeners.splice(i, 1);
      };
    },

    /* The next game this device starts is one already under way. */
    rejoinNext: function () { rejoinPending = true; },

    /* True while a rejoining player is passing rounds the others already finished. */
    catchingUp: function () { return !!(session && session.catchUp); },

    /* How many rounds the current (or last) game plans, or null. */
    planned: function () {
      var s = session || lastSession;
      return s ? s.rounds : null;
    },

    /* The server-aligned instant this round opens for answers, or null. */
    opensAt: function () {
      var node = currentRound();
      return (node && node.startedAt != null) ? node.startedAt : null;
    },

    /* Milliseconds until the round opens; 0 once it is open. */
    msUntilOpen: function () {
      var r = room();
      var at = this.opensAt();
      if (!r || at == null) return 0;
      var left = at - r.transport.serverNow();
      return left > 0 ? left : 0;
    },

    /* Time since the round opened, measured from the SHARED instant rather
       than from when this device happened to render. That makes the
       recorded answer time comparable across devices. */
    msSinceOpen: function () {
      var r = room();
      var at = this.opensAt();
      if (!r || at == null) return null;
      var since = r.transport.serverNow() - at;
      return since > 0 ? Math.round(since) : 0;
    },

    /* Run cb at the shared open instant (immediately if already open).
       Returns a cancel function. */
    whenOpen: function (cb) {
      var self = this;
      var cancelled = false;
      var timer = null;
      function tick() {
        if (cancelled) return;
        var left = self.msUntilOpen();
        // Re-check rather than trusting one reading: startedAt may not have
        // arrived from the server yet when this is first called.
        if (left <= 0 && self.opensAt() != null) { cb(); return; }
        timer = setTimeout(tick, left > 0 ? Math.min(left, 120) : 60);
      }
      tick();
      return function () { cancelled = true; if (timer) clearTimeout(timer); };
    },

    lockedOut: function () {
      var r = room();
      if (!r || !session) return false;
      return FF.RaceRules.lockedOut(currentRound(), r.uid);
    },

    /* Record an answer. A correct one contests the winner slot.
       `extra` carries game-specific fields onto the stored answer - for
       example Guess Who, where the points depend on how many clues were
       revealed and so cannot be derived from the answer time. */
    submit: function (choice, correct, ms, extra) {
      var r = room();
      if (!r || !session) return Promise.resolve();
      var n = session.index;

      // Write the answer BEFORE claiming the winner slot, so a recorded
      // winner always has a readable answer behind it and the points are
      // never reported as zero. The window this opens - everyone has
      // answered but no winner is recorded yet - is handled in
      // FF.RaceRules.settle, which does not treat a round holding a
      // correct answer as exhausted.
      var record = {
        choice: choice == null ? null : choice,
        correct: !!correct,
        ms: ms == null ? null : Math.round(ms)
      };
      if (extra) {
        Object.keys(extra).forEach(function (k) {
          if (extra[k] !== undefined) record[k] = extra[k];
        });
      }

      return r.transport.set('rounds/' + n + '/answers/' + r.uid, record).then(function () {
        // In 'fastest' mode nobody claims on answering - the winner is
        // derived from the recorded times once the round closes.
        if (!correct || session.mode === 'fastest' || session.mode === 'ranked' || session.mode === 'parallel' || session.mode === 'vote') return null;
        return r.transport.transaction('rounds/' + n + '/winner', function (current) {
          return current == null ? r.uid : undefined;   // first correct answer wins
        });
      }).then(function () {
        evaluate();
      });
    },

    onSettle: function (cb) {
      settleHandlers.push(cb);
      return function () {
        var i = settleHandlers.indexOf(cb);
        if (i !== -1) settleHandlers.splice(i, 1);
      };
    },

    scores: function (rounds) {
      var r = room();
      var s = session || lastSession;
      if (!r || !s) return {};
      return FF.RaceRules.scores(rounds || r.rounds || {}, FF.Room.racePlayers(), s.pointsFor, s.mode);
    },

    /* Push the derived scores into FF.Scoring so the shell's header
       scoreboard shows the race standings instead of local zeroes. */
    /* One helper any game file can use to join the race, so the wiring is
       written once rather than per engine. Returns null offline, letting
       each game keep its single-device path untouched:

         var race = FF.Race.forGame(api, { rounds: 6, optionSelector: '.x' });
         if (race) race.beginRound(n);   ... race.submit(i, correct, ms)

       opts: { rounds, optionSelector, mode, pointsFor, timerMs } */
    forGame: function (api, opts) {
      if (!this.active()) return null;
      opts = opts || {};
      var self = this;
      var sel = opts.optionSelector || 'button';

      this.begin(api.def.id, {
        rounds: opts.rounds || 8,
        mode: opts.mode,
        timerMs: opts.timerMs != null ? opts.timerMs : (api.config.timer || 0) * 1000,
        pointsFor: opts.pointsFor || function (answer) {
          if (answer.value != null) return answer.value;
          return (answer.ms != null && answer.ms <= 2500) ? 150 : 100;
        }
      });

      return {
        beginRound: function (n) { return self.beginRound(n); },

        /* What this round shows, for people watching. */
        describe: function (screen, answer) { return self.describe(screen, answer); },

        /* Hold the options until the round's shared open instant. */
        gate: function (onOpen) {
          return FF.RaceUI.gate(api.shell.root, sel, onOpen);
        },

        /* Times are measured from the shared instant so they compare
           across devices, not from when each one rendered. */
        submit: function (choice, correct, fallbackMs, extra) {
          var shared = self.msSinceOpen();
          var p = self.submit(choice, correct, shared != null ? shared : fallbackMs, extra);
          if (!correct && opts.mode !== 'parallel') FF.RaceUI.lockOut(api.shell.root, sel);
          return p;
        },

        onSettle: function (cb) { return self.onSettle(cb); },

        /* The shared result screen every racing game uses. */
        plan: function (fallback, available) { return self.plan(fallback, available); },
        isLastRound: function (n, total) { return self.isLastRound(n, total); },
        over: function (n) { return self.over(n); },

        showResult: function (payload, o) {
          o = o || {};
          self.syncScoring();
          api.shell.updateScores();
          FF.RaceUI.result(api.shell.root, {
            payload: payload,
            answerText: o.answerText != null ? o.answerText : null,
            isLast: !!o.isLast,
            onNext: o.onNext || function () {}
          });
        },

        end: function () { self.end(); }
      };
    },

    syncScoring: function () {
      var s = session || lastSession;
      var r = room();
      if (!s || !r) return;
      var scores = this.scores();
      if (r.meta && r.meta.mode === 'teams') {
        FF.Room.scorers().forEach(function (team) {
          scores[team.id] = (team.players || []).reduce(function (total, uid) {
            return total + (scores[uid] || 0);
          }, 0);
        });
      }
      Object.keys(scores).forEach(function (id) {
        if (FF.Scoring && typeof FF.Scoring.set === 'function') {
          FF.Scoring.set(id, scores[id]);
        }
      });
    },

    playersInGame: playersInGame,

    roster: function () {
      return FF.Room ? FF.Room.scorers() : [];
    },

    end: function () {
      stopPoll();
      if (offRounds) { offRounds(); offRounds = null; }
      lastSession = session;
      session = null;
      settleHandlers.length = 0;
      described = null;
      FF.Random.unseed();
    }
  };
})();
