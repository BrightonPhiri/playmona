/* ============================================================
   PLAYMONA — celebrate/pictureRush/rules.js
   Picture Rush: each team rebuilds the organiser's photos from
   scrambled tiles, swapping two tiles at a time, together on
   one shared board.

   The rules every side shares: the organiser's editor, the
   phones, the referee in the crew runner and (for the settings
   lists) api/lib/CelebrationGames.php, which must stay in step.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'medium', 'hard', 'expert'];
  var GRID = { easy: 3, medium: 4, hard: 5, expert: 6 };
  var SECONDS = [60, 90, 120, 180, 240, 300];
  var REVEAL = [0, 3, 5];
  var HINTS = [0, 1, 2, 3];
  var MAX_PHOTOS = 20;
  var HINT_SHOW_MS = 3000;
  var HOLD_MS = 10000;          // a picked-up tile is free again after this long
  // What a round is worth. The organiser can change each one within these limits.
  var SCORING = { base: 1000, speed: 500, hintCost: 100, partial: 500 };
  var SCORING_MAX = { base: 5000, speed: 5000, hintCost: 1000, partial: 5000 };

  function pick(v, allowed, fallback) {
    if (typeof allowed[0] === 'number') v = Number(v);
    return allowed.indexOf(v) !== -1 ? v : fallback;
  }

  function clampInt(v, lo, hi, fallback) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    n = Math.round(n);
    return Math.max(lo, Math.min(hi, n));
  }

  function cleanText(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }

  /* The organiser's settings, with anything unknown put back to the standard. */
  function sanitize(raw) {
    raw = raw || {};
    var photos = list(raw.photos).filter(function (p) {
      return p && typeof p.id === 'string' && /^m_[a-f0-9]{24}$/.test(p.id);
    }).slice(0, MAX_PHOTOS).map(function (p) {
      var out = { id: p.id, title: cleanText(p.title, 60), hint: cleanText(p.hint, 120) };
      if (typeof p.url === 'string') out.url = p.url;      // the referee's copy carries the picture link
      return out;
    });
    var scoring = {};
    var s = raw.scoring || {};
    Object.keys(SCORING).forEach(function (k) { scoring[k] = clampInt(s[k], 0, SCORING_MAX[k], SCORING[k]); });
    var rounds = clampInt(raw.rounds, 1, MAX_PHOTOS, photos.length || 1);
    return {
      level: pick(raw.level, LEVELS, 'medium'),
      seconds: pick(raw.seconds, SECONDS, 120),
      reveal: pick(raw.reveal, REVEAL, 3),
      hints: pick(raw.hints, HINTS, 1),
      rounds: photos.length ? Math.min(rounds, photos.length) : rounds,
      scoring: scoring,
      photos: photos
    };
  }

  function grid(settings) { return GRID[settings.level] || 4; }

  function correct(tiles) {
    var n = 0;
    for (var i = 0; i < tiles.length; i++) if (tiles[i] === i) n++;
    return n;
  }

  function solved(tiles) { return tiles.length > 0 && correct(tiles) === tiles.length; }

  /* A shuffled board where hardly any tile starts in its place. tiles[position] = piece. */
  function scramble(size, randomInt) {
    var total = size * size;
    var most = size <= 3 ? 1 : Math.floor(size / 2);
    var tiles = [];
    for (var tries = 0; tries < 60; tries++) {
      tiles = [];
      for (var i = 0; i < total; i++) tiles.push(i);
      for (var j = total - 1; j > 0; j--) {
        var k = randomInt(j + 1);
        var x = tiles[j]; tiles[j] = tiles[k]; tiles[k] = x;
      }
      if (correct(tiles) <= most) return tiles;
    }
    // Practically never: shift every tile one place, which leaves none home.
    tiles = [];
    for (var m = 0; m < total; m++) tiles.push((m + 1) % total);
    return tiles;
  }

  function swap(tiles, a, b) {
    var next = tiles.slice();
    var x = next[a]; next[a] = next[b]; next[b] = x;
    return next;
  }

  /* One team's points for one round. A team's score never depends on how many people are in it.
     r: { solved, usedMs, hints, correct, startCorrect, size } and the round's length in ms. */
  function roundPoints(scoring, r, roundMs) {
    var pts;
    if (r.solved) {
      var left = Math.max(0, roundMs - (r.usedMs || 0));
      pts = scoring.base + Math.round(scoring.speed * (roundMs > 0 ? left / roundMs : 0));
    } else {
      var total = r.size * r.size;
      var start = Math.min(r.startCorrect || 0, total - 1);
      var progress = Math.max(0, (r.correct || 0) - start) / (total - start);
      pts = Math.round(scoring.partial * progress);
    }
    return Math.max(0, pts - (r.hints || 0) * scoring.hintCost);
  }

  /* The standings: most points first, then the least total time, then whoever finished first.
     totals: { teamId: { points, usedMs, lastFinish } }. Exact ties share a place. */
  function ranked(totals) {
    var rows = Object.keys(totals).map(function (id) {
      var t = totals[id];
      return { teamId: id, points: t.points || 0, usedMs: t.usedMs || 0, lastFinish: t.lastFinish || 0, solvedRounds: t.solvedRounds || 0 };
    });
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (a.usedMs !== b.usedMs) return a.usedMs - b.usedMs;
      var fa = a.lastFinish || Infinity, fb = b.lastFinish || Infinity;
      if (fa !== fb) return fa - fb;
      return a.teamId < b.teamId ? -1 : 1;
    });
    rows.forEach(function (r, i) {
      var prev = rows[i - 1];
      r.place = prev && prev.points === r.points && prev.usedMs === r.usedMs && prev.lastFinish === r.lastFinish ? prev.place : i + 1;
    });
    return rows;
  }

  FF.PictureRushRules = {
    LEVELS: LEVELS, GRID: GRID, SECONDS: SECONDS, REVEAL: REVEAL, HINTS: HINTS, MAX_PHOTOS: MAX_PHOTOS,
    HINT_SHOW_MS: HINT_SHOW_MS, HOLD_MS: HOLD_MS, SCORING: SCORING, SCORING_MAX: SCORING_MAX,
    sanitize: sanitize, grid: grid, correct: correct, solved: solved, scramble: scramble, swap: swap,
    roundPoints: roundPoints, ranked: ranked, list: list
  };

  /* Every celebration game's referee registers here; the crew runner starts them by template. */
  FF.CelebrateReferees = FF.CelebrateReferees || {};
})();
