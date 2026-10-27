/* ============================================================
   PLAYMONA — crew/controller.js
   Plays the crew seats in ONE room, through the same room paths a
   phone uses: keeps their player records fresh, says ready when the
   host picks a game, answers each round at the time its brain chose,
   and reports each finished game. Each match gets its own
   controller, so no state is shared between rooms.

     var c = FF.CrewController.create({ transport, run, matchId, report });
     c.start(); ... c.stop();

   transport: the room-scoped interface js/net/transport.js defines
   (get, set, update, transaction, watch, serverNow). The Node runner
   passes a Firebase REST one; the dev runner passes FF.Transport.dev.
   report(event, payload) -> Promise<{ stay }>: 'game' | 'leave'.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var HEARTBEAT_MS = 8000;
  var PRESENCE_STALE_MS = 20000;     // as js/net/room.js
  var ALONE_MS = 30000;              // no real player for this long: leave

  // Each online game's race mode and round timer (as the games call FF.Race.begin).
  var MODES = { quickTap: 'ranked', colorReaction: 'fastest', letterRush: 'parallel' };

  function online(p, now) {
    return !!p && p.online !== false && (p.lastSeen == null || now - p.lastSeen <= PRESENCE_STALE_MS);
  }

  function create(opts) {
    var T = opts.transport;
    var run = opts.run;
    var crew = run.crew || {};
    var uids = Object.keys(crew);
    var timers = opts.timers || { setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval };
    var log = opts.log || function () {};
    var meta = null, players = {}, rounds = {};
    var offs = [], pending = [], planned = {}, answered = {}, readied = {};
    var reported = {}, aloneSince = null, beat = null, stopped = false;
    var gamesPlayed = 0;

    function now() { return T.serverNow(); }
    function later(fn, ms) {
      var id = timers.setTimeout(function () {
        var i = pending.indexOf(id);
        if (i >= 0) pending.splice(i, 1);
        if (!stopped) fn();
      }, Math.max(0, ms));
      pending.push(id);
      return id;
    }
    function mine(uid) { return Object.prototype.hasOwnProperty.call(crew, uid); }
    function present(uid) { return !!players[uid]; }

    /* ---------- presence ---------- */

    function heartbeat() {
      var t = now();
      var values = {};
      uids.forEach(function (uid) {
        if (!present(uid)) return;
        values['players/' + uid + '/lastSeen'] = t;
        values['players/' + uid + '/online'] = true;
      });
      if (Object.keys(values).length) T.update('', values).catch(function (e) { log('heartbeat failed: ' + e.message); });
      checkAlone();
    }

    function checkAlone() {
      var t = now();
      var humans = Object.keys(players).filter(function (uid) { return !mine(uid) && online(players[uid], t); });
      if (humans.length) { aloneSince = null; return; }
      if (aloneSince == null) aloneSince = t;
      if (t - aloneSince >= ALONE_MS) leave('alone');
    }

    function leave(why) {
      if (stopped) return;
      log('leaving ' + run.roomCode + ' (' + why + ')');
      stop();
      Promise.resolve(opts.report('leave', { why: why })).catch(function () {});
    }

    /* ---------- lobby ---------- */

    function onLobby() {
      var pick = meta.pick;
      if (!pick || !pick.id) return;
      // Join a team once the host picks a game: by then the people here have chosen theirs.
      if (meta.mode === 'teams') assignTeams();
      uids.forEach(function (uid, i) {
        if (!present(uid) || players[uid].ready === pick.id || readied[uid] === pick.id) return;
        readied[uid] = pick.id;
        var p = crew[uid].persona || {};
        // Friendly, patient players say ready quickly; everyone takes a moment.
        var wait = 900 + i * 450 + (100 - (p.friendliness || 50)) * 18 + Math.random() * 1200;
        later(function () {
          if (!meta || (meta.status || 'lobby') !== 'lobby' || !meta.pick || meta.pick.id !== pick.id) return;
          T.set('players/' + uid + '/ready', pick.id).catch(function (e) { log('ready failed: ' + e.message); });
        }, wait);
      });
    }

    // Team rooms: each crew player joins the smallest team.
    function assignTeams() {
      var counts = { team1: 0, team2: 0 };
      Object.keys(players).forEach(function (uid) {
        var team = players[uid].teamId;
        if (team) counts[team] = (counts[team] || 0) + 1;
      });
      uids.forEach(function (uid) {
        if (!present(uid) || players[uid].teamId) return;
        var best = Object.keys(counts).sort(function (a, b) { return counts[a] - counts[b]; })[0];
        counts[best]++;
        T.set('players/' + uid + '/teamId', best).catch(function () {});
      });
    }

    /* ---------- playing ---------- */

    function gameKey() { return String(meta.startAt || 0) + ':' + String(meta.gameId || ''); }

    function timerMs(gameId, settings) {
      if (gameId === 'quickTap') return (FF.QuickTap && FF.QuickTap.ONLINE_TIMER_MS) || 12000;
      if (gameId === 'letterRush') return ((FF.LetterRush ? FF.LetterRush.roundSeconds(settings) : 0) || 120) * 1000 + 25000;
      return settings.timer ? settings.timer * 1000 : 0;
    }

    function onRounds() {
      if (!meta || meta.status !== 'playing' || !FF.CrewBrains.forGame(meta.gameId)) return;
      var key = gameKey();
      var settings = meta.settings || {};
      var difficulty = settings.difficulty || 'normal';
      Object.keys(rounds || {}).forEach(function (n) {
        var node = rounds[n] || {};
        if (!node.startedAt) return;
        uids.forEach(function (uid) {
          var slot = key + '|' + n + '|' + uid;
          if (planned[slot] || !present(uid)) return;
          planned[slot] = true;
          if (node.answers && node.answers[uid]) return;
          var sheet = crew[uid];
          var skill = (sheet.skills && sheet.skills[meta.gameId]) || { skill: 50, level: 'medium' };
          var input = {
            gameId: meta.gameId, uid: uid, seed: meta.seed, round: Number(n), difficulty: difficulty,
            mode: MODES[meta.gameId] || 'first', timerMs: timerMs(meta.gameId, settings),
            persona: sheet.persona, skill: skill.skill, level: skill.level, nonce: key
          };
          input.view = FF.CrewBrains.view(meta.gameId, { seed: meta.seed, round: Number(n), difficulty: difficulty, config: settings });
          var plan = FF.CrewBrains.plan(input);
          if (!plan) return;
          later(function () { answer(key, n, uid, plan, input.mode); }, node.startedAt + plan.atMs - now());
        });
      });
    }

    function answer(key, n, uid, plan, mode) {
      var node = (rounds || {})[n] || {};
      // Never after the game moved on, the round settled, or this seat already answered.
      if (!meta || meta.status !== 'playing' || gameKey() !== key || !present(uid)) return;
      if (node.winner || (node.answers && node.answers[uid]) || answered[key + '|' + n + '|' + uid]) return;
      if (players[uid].away || players[uid].leftGame === meta.startAt) return;
      answered[key + '|' + n + '|' + uid] = true;
      T.set('rounds/' + n + '/answers/' + uid, plan.answer).then(function () {
        if (mode === 'first' && plan.answer.correct) {
          return T.transaction('rounds/' + n + '/winner', function (cur) { return cur ? undefined : uid; });
        }
      }).catch(function (e) { log('answer failed: ' + e.message); });
    }

    function onEnded() {
      var key = gameKey();
      var results = meta.results;
      if (reported[key] || !results || results.startAt !== meta.startAt) return;
      reported[key] = true;
      gamesPlayed++;
      Promise.resolve(opts.report('game', { gameId: meta.gameId, ranked: results.ranked || [] })).then(function (res) {
        if (res && res.stay === false) stop();
      }).catch(function (e) { log('report failed: ' + e.message); });
    }

    /* Imposters has no rounds to plan: its seats play the referee's phases
       (js/crew/brains/imposters.js), each reading only its own secret. */
    var impSeats = null, impKey = null;
    function onImposters() {
      var playing = meta && meta.status === 'playing' && meta.gameId === 'imposters' && FF.CrewImposters && opts.secretOf;
      var key = playing ? gameKey() : null;
      if (impSeats && impKey !== key) { impSeats.stop(); impSeats = null; }
      if (!playing || impSeats) return;
      impKey = key;
      impSeats = FF.CrewImposters.create({
        transport: T, uids: function () { return uids.filter(present); }, crew: crew, later: later, log: log,
        secretOf: opts.secretOf, isQuiet: opts.isQuiet
      });
      impSeats.start();
    }

    function onMeta(v) {
      meta = v;
      if (!meta) { stop(); return; }
      var status = meta.status || 'lobby';
      if (status === 'lobby') onLobby();
      else if (status === 'playing') onRounds();
      else if (status === 'ended') onEnded();
      onImposters();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (impSeats) { impSeats.stop(); impSeats = null; }
      offs.forEach(function (off) { try { off(); } catch (e) { /* already closed */ } });
      offs = [];
      pending.forEach(function (id) { timers.clearTimeout(id); });
      pending = [];
      if (beat) timers.clearInterval(beat);
      if (opts.onStop) opts.onStop();
    }

    return {
      matchId: opts.matchId,
      start: function () {
        offs.push(T.watch('players', function (v) {
          players = v || {};
          if (!uids.some(present) && meta) { stop(); return; }   // the server took them out
          if (meta && (meta.status || 'lobby') === 'lobby') onLobby();
        }));
        offs.push(T.watch('meta', onMeta));
        offs.push(T.watch('rounds', function (v) { rounds = v || {}; onRounds(); }));
        beat = timers.setInterval(heartbeat, HEARTBEAT_MS);
        heartbeat();
      },
      stop: stop,
      stopped: function () { return stopped; },
      gamesPlayed: function () { return gamesPlayed; }
    };
  }

  FF.CrewController = { create: create, MODES: MODES, HEARTBEAT_MS: HEARTBEAT_MS, ALONE_MS: ALONE_MS };
})();
