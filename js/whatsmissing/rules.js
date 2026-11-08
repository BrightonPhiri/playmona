/* ============================================================
   PLAYMONA — whatsmissing/rules.js
   What's Missing?'s pure rules, shared by phones, the server
   referee (js/whatsmissing/referee.js, run by the crew runner)
   and the tests: settings, the picture board each round deals,
   the twist (Gone, Added, Swapped, Several gone), the answer
   choices, answer checking and points. No DOM, no Math.random:
   one seed and the round number decide a round.

     var R = FF.WhatsMissingRules;
     var round = R.deal(settings, seed, k);          // the board before and after, the answer, the choices
     var res = R.check(round, { picks: ['cat'] });  // { ok, right, rightGaps }
     var pts = R.points({ round, res, ms, secs, streak });

   Pictures are the Memory Match cards (js/data/memoryDecks.js).
   Tests: tools/test/whatsMissing.test.js. Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'normal', 'hard', 'expert', 'endless'];
  var ROOM_LEVELS = ['easy', 'normal', 'hard', 'expert'];
  var THEMES = ['mix', 'animals', 'sea', 'food', 'fruit', 'characters', 'toys', 'sports', 'vehicles'];
  var SECONDS = [3, 5, 8, 12];
  var CHOICES = [4, 6, 8];
  var TWISTS = ['mix', 'gone'];
  var ROUNDS = [5, 8, 12];
  var STANDARD = { level: 'normal', theme: 'mix', seconds: 5, choices: 6, twists: 'mix', rounds: 8 };
  var PICTURES = { easy: 4, normal: 6, hard: 8 };
  var EXPERT_START = 10;
  var EXPERT_MAX = 16;
  var ENDLESS_START = 3;
  var ENDLESS_MAX = 24;
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var ANSWER_SECS = 20;           // the answer clock; Expert adds EXPERT_SECS, each extra gap GAP_SECS
  var EXPERT_SECS = 6;
  var GAP_SECS = 5;
  var MAX_LETTERS = 14;           // longer names are left off Expert boards

  /* ---------- settings ---------- */

  function pickOf(list, v, fallback) {
    for (var i = 0; i < list.length; i++) if (String(list[i]) === String(v)) return list[i];
    return fallback;
  }
  function sanitize(s) {
    s = s || {};
    return {
      level: pickOf(LEVELS, s.level, STANDARD.level),
      theme: pickOf(THEMES, s.theme, STANDARD.theme),
      seconds: pickOf(SECONDS, s.seconds, STANDARD.seconds),
      choices: pickOf(CHOICES, s.choices, STANDARD.choices),
      twists: pickOf(TWISTS, s.twists, STANDARD.twists),
      rounds: pickOf(ROUNDS, s.rounds, STANDARD.rounds)
    };
  }
  /* Rooms play easy to expert: an endless room becomes normal. */
  function sanitizeRoom(s) {
    var c = sanitize(s);
    if (ROOM_LEVELS.indexOf(c.level) === -1) c.level = STANDARD.level;
    return c;
  }
  /* Rounds are the game length, so they never make a run non-standard. */
  function isStandard(s) {
    var c = sanitize(s);
    return c.level === STANDARD.level && c.theme === STANDARD.theme && c.seconds === STANDARD.seconds &&
      c.choices === STANDARD.choices && c.twists === STANDARD.twists;
  }

  /* ---------- seeded random (as GeoSpin) ---------- */

  function hash(s) {
    var str = String(s), h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }
  function pick(list, rand) { return list[Math.floor(rand() * list.length)]; }

  /* ---------- pictures ---------- */

  var cardList = null, byId = null;
  function cards() {
    if (cardList) return cardList;
    cardList = [];
    byId = {};
    (FF.MemoryDecks || []).forEach(function (deck) {
      deck.cards.forEach(function (c) {
        var card = { id: c[0], name: c[1], emoji: c[2], deck: deck.id };
        cardList.push(card);
        byId[card.id] = card;
      });
    });
    return cardList;
  }
  function cardOf(id) { cards(); return byId[id] || null; }

  /* Letters, spaces and hyphens only, 2 to 14 letters: the letter tiles can spell it. */
  function spellable(name) {
    var s = String(name || '');
    if (!/^[A-Za-z][A-Za-z \-]*$/.test(s)) return false;
    var letters = s.replace(/[^A-Za-z]/g, '').length;
    return letters >= 2 && letters <= MAX_LETTERS;
  }

  function poolFor(c) {
    var list = cards();
    if (c.theme !== 'mix') list = list.filter(function (x) { return x.deck === c.theme; });
    if (c.level === 'expert') list = list.filter(function (x) { return spellable(x.name); });
    return list;
  }

  /* ---------- board shape ---------- */

  function picturesAt(level, k) {
    if (level === 'expert') return Math.min(EXPERT_START + (k || 0), EXPERT_MAX);
    if (level === 'endless') return ENDLESS_START;
    return PICTURES[level] || PICTURES.normal;
  }

  /* A few more slots than pictures, so Added has somewhere to go and nothing moves. */
  function grid(n) {
    if (n <= 4) return { cols: 3, rows: 2 };
    if (n <= 6) return { cols: 3, rows: 3 };
    if (n <= 8) return { cols: 4, rows: 3 };
    if (n <= 12) return { cols: 4, rows: 4 };
    if (n <= 16) return { cols: 5, rows: 4 };
    if (n <= 20) return { cols: 5, rows: 5 };
    return { cols: 6, rows: 5 };
  }

  /* ---------- twists ---------- */

  function twistsAllowed(level, n) {
    if (level === 'easy') return ['gone', 'added'];
    if (level === 'normal') return ['gone', 'added', 'swapped'];
    if (level === 'endless') {
      var out = ['gone', 'added'];
      if (n >= 6) out.push('swapped');
      if (n >= 8) out.push('several');
      return out;
    }
    return ['gone', 'added', 'swapped', 'several'];
  }

  /* One twist from those allowed, never the same three times running. */
  function nextTwist(allowed, prev, rand) {
    var a = prev[prev.length - 1], b = prev[prev.length - 2];
    var ok = allowed.filter(function (t) { return !(t === a && t === b); });
    return pick(ok.length ? ok : allowed, rand);
  }

  /* The twists of a game (not Endless, whose boards grow by results): the first is always Gone. */
  function twistPlan(settings, seed, count) {
    var c = sanitize(settings);
    var rand = rng(hash('twist|' + seed));
    var plan = [];
    for (var k = 0; k < count; k++) {
      var allowed = c.twists === 'gone' ? ['gone'] : twistsAllowed(c.level, picturesAt(c.level, k));
      var r = nextTwist(allowed, plan, rand);   // drawn every round, so a plan never shifts
      plan.push(k === 0 ? 'gone' : r);
    }
    return plan;
  }

  function gapsFor(level, n, rand) {
    var three = level === 'expert' || (level === 'endless' && n >= 12);
    return three && rand() < 0.5 ? 3 : 2;
  }

  /* ---------- the deal ---------- */

  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  /* Round k of a game. Endless passes opts { n, prev: [twists so far] }. */
  function deal(settings, seed, k, opts) {
    var c = sanitize(settings);
    opts = opts || {};
    var level = c.level;
    var pool = poolFor(c);
    var n = level === 'endless'
      ? Math.max(ENDLESS_START, Math.min(opts.n || ENDLESS_START, ENDLESS_MAX))
      : picturesAt(level, k);
    n = Math.min(n, pool.length - 1);

    var twist;
    if (level === 'endless') {
      var allowed = c.twists === 'gone' ? ['gone'] : twistsAllowed(level, n);
      var tr = nextTwist(allowed, opts.prev || [], rng(hash('twist|' + seed + '|' + k)));
      twist = k === 0 ? 'gone' : tr;
    } else {
      twist = twistPlan(c, seed, k + 1)[k];
    }
    var gaps = twist === 'several' ? gapsFor(level, n, rng(hash('gaps|' + seed + '|' + k))) : 1;

    var rand = rng(hash('board|' + seed + '|' + k));
    var picked = shuffle(pool, rand).slice(0, n + 1);
    var onBoard = picked.slice(0, n).map(function (x) { return x.id; });
    var extra = picked[n].id;
    var g = grid(n);
    var slots = g.cols * g.rows;
    var places = shuffle(range(slots), rand);
    var before = range(slots).map(function () { return null; });
    onBoard.forEach(function (id, i) { before[places[i]] = id; });
    var after = before.slice();
    var full = places.slice(0, n);
    var empty = places.slice(n);
    var ans = { slots: [], ids: [] };

    if (twist === 'gone' || twist === 'several') {
      ans.slots = shuffle(full, rand).slice(0, gaps).sort(function (p, q) { return p - q; });
      ans.ids = ans.slots.map(function (s) { return before[s]; });
      ans.slots.forEach(function (s) { after[s] = null; });
    } else if (twist === 'added') {
      var s0 = pick(empty, rand);
      after[s0] = extra;
      ans.slots = [s0];
      ans.ids = [extra];
    } else {
      var two = shuffle(full, rand).slice(0, 2).sort(function (p, q) { return p - q; });
      after[two[0]] = before[two[1]];
      after[two[1]] = before[two[0]];
      ans.slots = two;
      ans.ids = [before[two[0]], before[two[1]]];
    }

    var spell = level === 'expert' && (twist === 'gone' || twist === 'several');
    var choices = null;
    if (!spell && (twist === 'gone' || twist === 'several')) choices = choicesFor(c, seed, k, before, ans.ids);

    return {
      k: k, n: n, cols: g.cols, rows: g.rows, slots: slots,
      before: before, after: after, twist: twist, gaps: gaps,
      answer: ans, choices: choices, spell: spell,
      secs: ANSWER_SECS + (level === 'expert' ? EXPERT_SECS : 0) + GAP_SECS * (gaps - 1)
    };
  }

  /* Decoys look like the answer: from the decks on the board, never a board picture. */
  function choicesFor(c, seed, k, before, answerIds) {
    var rand = rng(hash('choice|' + seed + '|' + k));
    var on = {};
    var decks = {};
    before.forEach(function (id) { if (id != null) { on[id] = true; decks[cardOf(id).deck] = true; } });
    var need = Math.max(0, c.choices - answerIds.length);
    var near = cards().filter(function (x) { return !on[x.id] && decks[x.deck]; });
    var decoys = shuffle(near, rand).slice(0, need);
    if (decoys.length < need) {
      var taken = {};
      decoys.forEach(function (x) { taken[x.id] = true; });
      var wider = cards().filter(function (x) { return !on[x.id] && !taken[x.id]; });
      decoys = decoys.concat(shuffle(wider, rand).slice(0, need - decoys.length));
    }
    return shuffle(answerIds.concat(decoys.map(function (x) { return x.id; })), rand);
  }

  /* ---------- checking ---------- */

  var matcher = null;
  /* Expert: a spelled name, with other names (js/data/memoryAliases.js) and small mistakes allowed. */
  function checkName(text, id) {
    if (!matcher) {
      var aliases = (FF.data && FF.data.memoryAliases) || {};
      matcher = FF.AnswerMatch.create({
        answers: cards().map(function (c) { return { id: c.id, names: [c.name].concat(aliases[c.id] || []) }; })
      });
    }
    return matcher.check(String(text == null ? '' : text), id);
  }

  function isSlot(round, s) { return typeof s === 'number' && s % 1 === 0 && s >= 0 && s < round.slots; }

  /* What was right. Gone and Several gone: each gap in order (picks or spelled text);
     Added: the newcomer's slot; Swapped: both slots, in either order. */
  function check(round, answer) {
    var a = answer || {};
    var want = round.answer;
    var right = [];
    if (round.twist === 'gone' || round.twist === 'several') {
      var text = Array.isArray(a.text) ? a.text : null;
      var picks = Array.isArray(a.picks) ? a.picks : [];
      right = want.ids.map(function (id, i) {
        if (text) return text[i] != null && checkName(text[i], id).ok;
        return picks[i] === id;
      });
    } else {
      var slots = Array.isArray(a.slots) ? a.slots : [];
      var ok;
      if (round.twist === 'added') {
        ok = slots.length === 1 && slots[0] === want.slots[0];
      } else {
        ok = slots.length === 2 && isSlot(round, slots[0]) && isSlot(round, slots[1]) && slots[0] !== slots[1] &&
          Math.min(slots[0], slots[1]) === want.slots[0] && Math.max(slots[0], slots[1]) === want.slots[1];
      }
      right = want.slots.map(function () { return ok; });
    }
    var n = right.filter(Boolean).length;
    return { ok: n === right.length && n > 0, right: right, rightGaps: n };
  }

  /* ---------- points ---------- */

  var BASE = { gone: 100, added: 100, swapped: 150, several: 100 };   // several: per right gap
  var SPEED_MAX = 50;
  var EXPERT_BONUS = 50;                                               // per right answer or gap
  var STREAKS = [[5, 1.5], [3, 1.2]];

  function streakMult(streak) {
    for (var i = 0; i < STREAKS.length; i++) if (streak >= STREAKS[i][0]) return STREAKS[i][1];
    return 1;
  }

  /* A round's points. streak counts this answer when it was right. Speed and the streak
     multiplier only for a fully right answer; Several gone still scores its right gaps. */
  function points(o) {
    o = o || {};
    var round = o.round, res = o.res || { ok: false, rightGaps: 0 };
    var out = { base: 0, speed: 0, bonus: 0, mult: 1, total: 0 };
    if (!round || !res.rightGaps) return out;
    out.base = round.twist === 'several' ? BASE.several * res.rightGaps : (res.ok ? BASE[round.twist] : 0);
    if (!out.base) return out;
    if (round.spell) out.bonus = EXPERT_BONUS * res.rightGaps;
    if (res.ok) {
      var secs = o.secs || round.secs || ANSWER_SECS;
      var left = Math.max(0, Math.min(1, 1 - (o.ms || 0) / (secs * 1000)));
      out.speed = Math.round(SPEED_MAX * left);
      out.mult = streakMult(o.streak || 0);
    }
    out.total = Math.round((out.base + out.speed + out.bonus) * out.mult);
    return out;
  }

  FF.WhatsMissingRules = {
    LEVELS: LEVELS, ROOM_LEVELS: ROOM_LEVELS, THEMES: THEMES, SECONDS: SECONDS, CHOICES: CHOICES, TWISTS: TWISTS,
    ROUNDS: ROUNDS, STANDARD: STANDARD, ENDLESS_START: ENDLESS_START, ENDLESS_MAX: ENDLESS_MAX,
    MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, ANSWER_SECS: ANSWER_SECS,
    sanitize: sanitize, sanitizeRoom: sanitizeRoom, isStandard: isStandard,
    hash: hash, rng: rng, shuffle: shuffle,
    cards: cards, cardOf: cardOf, spellable: spellable,
    picturesAt: picturesAt, grid: grid, twistsAllowed: twistsAllowed, twistPlan: twistPlan, deal: deal,
    BASE: BASE, SPEED_MAX: SPEED_MAX, EXPERT_BONUS: EXPERT_BONUS, STREAKS: STREAKS,
    checkName: checkName, check: check, streakMult: streakMult, points: points
  };
})();
