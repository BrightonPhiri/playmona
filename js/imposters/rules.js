/* ============================================================
   PLAYMONA — imposters/rules.js
   The rules of Imposters as pure functions, shared by the phone,
   the referee (in the Node crew runner) and the tests. Nothing in
   here is secret: the secrets live on the server, not in the code.

     FF.ImpostersRules.imposterCount(players, requested) -> 1 | 2 | 0
     FF.ImpostersRules.sanitizeSettings(raw, players)
     FF.ImpostersRules.validateClue(text, { secret, used, isQuiet })
     FF.ImpostersRules.tally(ballots, candidates)
     FF.ImpostersRules.winner(minority, alive, finalVote)
     FF.ImpostersRules.clampStop(clientMs, serverMs)
     FF.ImpostersRules.makeTargets(difficulty, randomInt)

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MIN_PLAYERS = 3;
  var MAX_PLAYERS = 12;
  var CHOOSE_FROM = 6;            // with this many players or more, the host picks 1 or 2
  var MODES = ['word', 'number'];
  var DIFFICULTIES = ['easy', 'normal', 'hard'];
  var ROUNDS = [3, 4, 5, 6];
  var CLUE_SECONDS = [30, 45, 60];
  var DISCUSS_SECONDS = [60, 90, 120, 180];
  var MAX_CLUE = 20;
  var STOP_LATENCY_MS = 1000;     // the most network delay a stop time may claim
  var GAP_MS = { easy: 3000, normal: 2000, hard: 1000 };
  var TARGET_MIN_MS = 3000;
  var TARGET_MAX_MS = 10000;

  var DEFAULTS = { mode: 'word', imposters: 1, difficulty: 'normal', rounds: 4, clueSeconds: 45, discussSeconds: 90 };

  /* How many players get the other word. 0 means the game cannot start. */
  function imposterCount(players, requested) {
    players = players | 0;
    if (players < MIN_PLAYERS || players > MAX_PLAYERS) return 0;
    if (players < CHOOSE_FROM) return 1;
    return Number(requested) === 2 ? 2 : 1;
  }

  /* Whether the host gets the 1-or-2 choice with this many players. */
  function canChoose(players) { return (players | 0) >= CHOOSE_FROM; }

  function pick(list, value, fallback) {
    for (var i = 0; i < list.length; i++) if (list[i] === value) return value;
    return fallback;
  }

  /* Any settings object in, a valid one out: unknown values fall back to
     the defaults and the imposter count always fits the player count. */
  function sanitizeSettings(raw, players) {
    raw = raw || {};
    var n = Number(raw.rounds);
    return {
      mode: pick(MODES, raw.mode, DEFAULTS.mode),
      imposters: imposterCount(Math.max(MIN_PLAYERS, players | 0), raw.imposters) || 1,
      difficulty: pick(DIFFICULTIES, raw.difficulty, DEFAULTS.difficulty),
      rounds: pick(ROUNDS, n, DEFAULTS.rounds),
      clueSeconds: pick(CLUE_SECONDS, Number(raw.clueSeconds), DEFAULTS.clueSeconds),
      discussSeconds: pick(DISCUSS_SECONDS, Number(raw.discussSeconds), DEFAULTS.discussSeconds)
    };
  }

  /* ---------- clues ---------- */

  function isLetter(ch) { return ch.toLowerCase() !== ch.toUpperCase(); }

  // "Waters", "watery", "watering" all lean on "water": strip the common endings.
  function stem(word) {
    var w = word.toLowerCase().replace(/['’-]/g, '');
    var ends = ['ings', 'ing', 'ers', 'er', 'ies', 'es', 'ed', 'y', 's'];
    for (var i = 0; i < ends.length; i++) {
      var e = ends[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) return w.slice(0, -e.length);
    }
    return w;
  }

  /* The parts of a secret worth protecting: "Swimming Pool" -> swimming, pool. */
  function secretParts(secret) {
    return String(secret || '').toLowerCase().split(/[^a-zÀ-ɏ]+/).filter(function (p) { return p.length >= 3; });
  }

  /* Too close to the player's own word: the word itself, a form of it, or a part of it. */
  function leaksSecret(clue, secret) {
    var c = clue.toLowerCase().replace(/['’-]/g, '');
    var cs = stem(c);
    var parts = secretParts(secret);
    var joined = parts.join('');
    if (parts.length > 1 && c.indexOf(joined) !== -1) return true;
    return parts.some(function (p) {
      var ps = stem(p);
      if (cs === ps) return true;
      if (c.length >= 4 && p.indexOf(c) !== -1) return true;
      // Short words only count at the start: "teapot" leans on tea, "steam" does not.
      if (p.length < 4) return c.indexOf(p) === 0;
      return c.indexOf(p) !== -1 || (ps.length >= 4 && c.indexOf(ps) !== -1);
    });
  }

  /* One word, letters only (apostrophes and hyphens allowed inside it).
     Returns { ok: true, value } or { ok: false, error } where error is
     empty | spaces | long | letters | secret | repeat | rude. */
  function validateClue(text, opts) {
    opts = opts || {};
    var raw = String(text == null ? '' : text).replace(/^\s+|\s+$/g, '');
    if (!raw) return { ok: false, error: 'empty' };
    if (/\s/.test(raw)) return { ok: false, error: 'spaces' };
    if (raw.length > MAX_CLUE) return { ok: false, error: 'long' };
    var chars = raw.split('');
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var inner = i > 0 && i < chars.length - 1;
      if (isLetter(ch)) continue;
      if (inner && (ch === "'" || ch === '’' || ch === '-')) continue;
      return { ok: false, error: 'letters' };
    }
    if (opts.secret && leaksSecret(raw, opts.secret)) return { ok: false, error: 'secret' };
    var low = raw.toLowerCase();
    if ((opts.used || []).some(function (u) { return String(u).toLowerCase() === low; })) return { ok: false, error: 'repeat' };
    if (typeof opts.isQuiet === 'function' && opts.isQuiet(low)) return { ok: false, error: 'rude' };
    // Tidy capitals: "WATER" and "water" are the same clue, shown as "Water".
    return { ok: true, value: low.charAt(0).toUpperCase() + low.slice(1) };
  }

  /* ---------- voting ---------- */

  /* ballots: { voter: target }. candidates: who may be voted for.
     Returns { counts, top: [uid...], votes } - top has one uid for a
     clear result, several for a tie, none when nobody voted. */
  function tally(ballots, candidates) {
    var counts = {};
    var ok = {};
    (candidates || []).forEach(function (uid) { ok[uid] = true; });
    var votes = 0;
    Object.keys(ballots || {}).forEach(function (voter) {
      var target = ballots[voter];
      if (!ok[target] || target === voter) return;
      counts[target] = (counts[target] || 0) + 1;
      votes++;
    });
    var best = 0;
    Object.keys(counts).forEach(function (uid) { if (counts[uid] > best) best = counts[uid]; });
    var top = best ? Object.keys(counts).filter(function (uid) { return counts[uid] === best; }).sort() : [];
    return { counts: counts, top: top, votes: votes };
  }

  /* More than half of the players still in. */
  function votesNeeded(aliveCount) { return Math.floor(aliveCount / 2) + 1; }

  /* minority: [uid]. alive: { uid: true|false }. finalVote: the last
     vote of the match has just been resolved.
     Returns 'majority' | 'minority' | null (play on). */
  function winner(minority, alive, finalVote) {
    var minIn = 0, majIn = 0;
    var isMin = {};
    (minority || []).forEach(function (uid) { isMin[uid] = true; });
    Object.keys(alive || {}).forEach(function (uid) {
      if (!alive[uid]) return;
      if (isMin[uid]) minIn++; else majIn++;
    });
    if (minIn === 0) return 'majority';
    if (minIn >= majIn) return 'minority';
    if (finalVote) return 'minority';
    return null;
  }

  /* ---------- Number Imposter ---------- */

  /* The phone's own measurement, trusted only inside what the server saw:
     never later than the stop arrived, never more than a second earlier. */
  function clampStop(clientMs, serverMs) {
    serverMs = Math.max(0, Math.round(Number(serverMs) || 0));
    var lo = Math.max(0, serverMs - STOP_LATENCY_MS);
    var c = Number(clientMs);
    if (!isFinite(c)) return lo;
    return Math.round(Math.min(serverMs, Math.max(lo, c)));
  }

  /* Two target times, half-second steps, a difficulty-sized gap apart.
     randomInt(n) -> 0..n-1 (crypto on the server). */
  function makeTargets(difficulty, randomInt) {
    var gap = GAP_MS[difficulty] || GAP_MS.normal;
    var steps = Math.floor((TARGET_MAX_MS - gap - TARGET_MIN_MS) / 500) + 1;
    var low = TARGET_MIN_MS + randomInt(steps) * 500;
    var high = low + gap;
    return randomInt(2) ? { majority: low, minority: high } : { majority: high, minority: low };
  }

  /* ---------- dealing ---------- */

  /* Fisher-Yates over a copy, with the caller's random source. */
  function shuffle(list, randomInt) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Who gets the other word: k players chosen uniformly at random. */
  function chooseMinority(seats, k, randomInt) {
    return shuffle(seats, randomInt).slice(0, k);
  }

  /* ---------- points ---------- */

  /* 100 for the winning side, 25 for each vote that found a minority
     player, 50 for a minority player still in at the end. */
  function points(opts) {
    var p = 0;
    if (opts.won) p += 100;
    p += 25 * (opts.correctVotes || 0);
    if (opts.minority && opts.survived) p += 50;
    return p;
  }

  FF.ImpostersRules = {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    CHOOSE_FROM: CHOOSE_FROM,
    MODES: MODES,
    DIFFICULTIES: DIFFICULTIES,
    ROUNDS: ROUNDS,
    CLUE_SECONDS: CLUE_SECONDS,
    DISCUSS_SECONDS: DISCUSS_SECONDS,
    DEFAULTS: DEFAULTS,
    MAX_CLUE: MAX_CLUE,
    STOP_LATENCY_MS: STOP_LATENCY_MS,
    GAP_MS: GAP_MS,
    imposterCount: imposterCount,
    canChoose: canChoose,
    sanitizeSettings: sanitizeSettings,
    validateClue: validateClue,
    leaksSecret: leaksSecret,
    tally: tally,
    votesNeeded: votesNeeded,
    winner: winner,
    clampStop: clampStop,
    makeTargets: makeTargets,
    shuffle: shuffle,
    chooseMinority: chooseMinority,
    points: points
  };
})();
