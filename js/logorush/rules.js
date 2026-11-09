/* ============================================================
   PLAYMONA — logorush/rules.js
   Logo Rush's pure rules, shared by phones and the server referee
   (js/logorush/referee.js, run by the crew runner): settings,
   which brands a game deals, the letter tiles or answers to pick
   from each round, answer checking (FF.AnswerMatch over every
   brand's names) and points. No DOM, no Math.random: one seed
   decides a game.

     var R = FF.LogoRushRules;
     var round = R.roundAt(settings, seed, k);   // { id, name, target, cells, tiles?, choices?, ... }
     var res = R.check('coca cola', round.id);    // FF.AnswerMatch result
     var pts = R.points({ level, ok, ms, secs, mode, twist });

   Tests: tools/test/logoRush.test.js. Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'normal', 'hard'];
  var MODES = ['tiles', 'choice', 'type', 'say'];   // spell with tiles, pick a name, type it (Expert), say it out loud
  var ROOM_MODES = ['tiles', 'choice'];
  var CATS = ['tech', 'social', 'food', 'fashion', 'cars', 'shops', 'fun', 'travel', 'money', 'football', 'africa'];
  var TIMES = ['quick', 'normal', 'relaxed', 'none'];
  var SECONDS = { choice: { quick: 5, normal: 8, relaxed: 12 }, tiles: { quick: 12, normal: 20, relaxed: 30 } };
  var TYPE_EXTRA = 6;             // typing with no tiles gets a little longer
  var TWISTS = ['none', 'zoom', 'flash', 'grey'];
  var ROUNDS = [10, 15, 20];
  var CHOICES = { easy: 4, normal: 6, hard: 8 };
  var BASE = { easy: 100, normal: 200, hard: 300 };
  var SPEED = 50;                 // an instant answer earns this much more
  var ZOOM_SPEED = 100;           // ...and twice that while the logo is still zoomed in
  var BONUS = { type: 50, flash: 25, grey: 25 };
  var STANDARD = { level: 'normal', cats: 'mixed', mode: 'tiles', time: 'normal', twist: 'none', rounds: 10 };
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var FLASH_MS = 1500;            // Flash: the symbol hides after this
  var REVEAL_MS = 6000;           // the full logo, the name and a fact, then the next logo
  var MIN_POOL = 6;
  var LONG_NAME = 16;             // longer names are spelled by a shorter accepted name

  /* ---------- data ---------- */

  var byId = null;
  function all() { return (FF.data && FF.data.logos && FF.data.logos.brands) || []; }
  /* Not dealt while its symbol shows its name, until it has a crop that hides it. */
  function playable(b) { return !b.named || !!b.crop; }
  function brand(id) {
    if (!byId) { byId = {}; all().forEach(function (b) { byId[b.id] = b; }); }
    return byId[id] || null;
  }

  /* ---------- settings ---------- */

  function sanitizeCats(cats) {
    if (!Array.isArray(cats)) return 'mixed';
    var out = [];
    cats.forEach(function (c) { if (CATS.indexOf(c) !== -1 && out.indexOf(c) === -1) out.push(c); });
    return out.length ? out.sort() : 'mixed';
  }

  function sanitize(s) {
    s = s || {};
    var rounds = Number(s.rounds);
    return {
      level: LEVELS.indexOf(s.level) !== -1 ? s.level : STANDARD.level,
      cats: sanitizeCats(s.cats),
      mode: MODES.indexOf(s.mode) !== -1 ? s.mode : STANDARD.mode,
      time: TIMES.indexOf(s.time) !== -1 ? s.time : STANDARD.time,
      twist: TWISTS.indexOf(s.twist) !== -1 ? s.twist : STANDARD.twist,
      rounds: ROUNDS.indexOf(rounds) !== -1 ? rounds : STANDARD.rounds
    };
  }

  /* Online: no shouting (one screen only) and always a clock. */
  function sanitizeRoom(s) {
    var c = sanitize(s);
    if (ROOM_MODES.indexOf(c.mode) === -1) c.mode = STANDARD.mode;
    if (c.time === 'none') c.time = STANDARD.time;
    return c;
  }

  /* Rounds are the platform's game length when playing alone, so they never count. */
  function isStandard(s) {
    var c = sanitize(s);
    return c.level === STANDARD.level && c.cats === 'mixed' && c.mode === STANDARD.mode &&
      c.time === STANDARD.time && c.twist === STANDARD.twist;
  }

  function secondsFor(s) {
    var c = sanitize(s);
    if (c.time === 'none') return null;
    if (c.mode === 'choice' || c.mode === 'say') return SECONDS.choice[c.time];
    return SECONDS.tiles[c.time] + (c.mode === 'type' ? TYPE_EXTRA : 0);
  }

  /* Easy: household names; Normal adds the well known; Hard: the well known and the
     expert ones. Too few (a small category): widen, as GeoSpin does. */
  function pool(cfg) {
    var c = sanitize(cfg);
    var base = all().filter(playable).filter(function (b) {
      return c.cats === 'mixed' || c.cats.indexOf(b.cat) !== -1 || (b.africa && c.cats.indexOf('africa') !== -1);
    });
    var steps = c.level === 'easy' ? [function (b) { return b.tier === 1; }, function (b) { return b.tier <= 2; }]
      : c.level === 'normal' ? [function (b) { return b.tier <= 2; }]
      : [function (b) { return b.tier >= 2; }];
    for (var i = 0; i < steps.length; i++) {
      var at = base.filter(steps[i]);
      if (at.length >= MIN_POOL * 2) return at;
    }
    return base;
  }

  /* ---------- seeded random ---------- */

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

  /* The brands of a game, in order: categories take turns so none crowds out the rest.
     No brand comes twice until every one in the pool has been dealt. */
  function deal(cfg, seed, count) {
    var rand = rng(hash('deal|' + seed));
    var list = pool(cfg);
    var byCat = {};
    list.forEach(function (b) { (byCat[b.cat] = byCat[b.cat] || []).push(b); });
    var order = shuffle(Object.keys(byCat).sort(), rand);
    var bags = {};
    order.forEach(function (id) { bags[id] = shuffle(byCat[id], rand); });
    var out = [];
    var left = true;
    while (out.length < count && left) {
      left = false;
      for (var i = 0; i < order.length && out.length < count; i++) {
        var bag = bags[order[i]];
        if (bag.length) { out.push(bag.shift().id); left = true; }
      }
    }
    var lap = 1;
    while (out.length < count && list.length) {
      shuffle(list, rng(hash('lap' + lap++ + '|' + seed))).forEach(function (b) { if (out.length < count) out.push(b.id); });
    }
    return out;
  }

  /* A brand in the pool that this game has not shown (for a logo that failed to load). */
  function nextUnused(cfg, dealt, used) {
    var skip = {};
    (dealt || []).concat(used || []).forEach(function (id) { skip[id] = true; });
    var list = pool(cfg);
    for (var i = 0; i < list.length; i++) if (!skip[list[i].id]) return list[i].id;
    return null;
  }

  /* ---------- names and tiles ---------- */

  function lettersOf(name) { return FF.SpellTiles.lettersOf(name); }

  /* The name to spell: the brand's own, or for a very long one a shorter accepted name. */
  function target(id) {
    var b = brand(id);
    if (!b) return '';
    if (lettersOf(b.name).length <= LONG_NAME) return b.name;
    var alt = b.aliases.filter(function (a) {
      var n = lettersOf(a).length;
      return n >= 5 && n <= 14 && a !== a.toUpperCase();
    });
    return alt.length ? alt[0] : b.name;
  }

  /* Names whose letters make good decoys: look-alikes first, then the same category. */
  function relatedNames(id, rand) {
    var b = brand(id);
    if (!b) return [];
    var out = b.alike.map(function (x) { var o = brand(x); return o ? o.name : ''; }).filter(Boolean);
    shuffle(all().filter(function (o) { return o.cat === b.cat && o.id !== id; }), rand).slice(0, 4)
      .forEach(function (o) { out.push(o.name); });
    return out;
  }

  function tilesFor(id, level, rand) {
    return FF.SpellTiles.deal(target(id), rand, { difficulty: level, related: relatedNames(id, rand) });
  }

  /* ---------- checking ---------- */

  var matcher = null;
  function checker() {
    if (!matcher) {
      matcher = FF.AnswerMatch.create({ answers: all().map(function (b) { return { id: b.id, names: [b.name].concat(b.aliases) }; }) });
    }
    return matcher;
  }

  /* Is a spelled or typed answer this brand? Small slips pass; another brand's name does not. */
  function check(text, id) {
    return checker().check(String(text == null ? '' : text).slice(0, 60), id);
  }

  /* ---------- multiple choice ---------- */

  /* The names to pick from: the brand and CHOICES[level] - 1 others, shuffled. Hard
     starts with look-alikes; then the same category, then anything. No two answers
     share a name. Brand ids, in the order shown. */
  function choices(id, level, rand) {
    level = LEVELS.indexOf(level) !== -1 ? level : 'normal';
    var want = CHOICES[level];
    var me = brand(id);
    if (!me) return [id];
    var out = [id];
    var names = {};
    names[FF.AnswerMatch.normalise(me.name)] = true;
    function add(b) {
      if (out.length >= want || !b || out.indexOf(b.id) !== -1) return;
      var key = FF.AnswerMatch.normalise(b.name);
      if (names[key]) return;
      names[key] = true;
      out.push(b.id);
    }
    if (level === 'hard') shuffle(me.alike, rand).slice(0, Math.ceil(want / 3)).forEach(function (x) { add(brand(x)); });
    var maxTier = level === 'easy' ? 1 : level === 'normal' ? 2 : 3;
    shuffle(all().filter(function (b) { return b.cat === me.cat && b.tier <= maxTier; }), rand).forEach(add);
    shuffle(all().filter(function (b) { return b.cat === me.cat; }), rand).forEach(add);
    shuffle(all(), rand).forEach(add);
    return shuffle(out, rand);
  }

  /* A picked answer: right only when it is the round's brand and on its list. */
  function checkChoice(round, pick) {
    pick = String(pick || '');
    if ((round.choices || []).indexOf(pick) === -1) return { ok: false, near: '' };
    if (pick === round.id) return { ok: true, exact: true };
    var b = brand(pick);
    return { ok: false, near: b ? b.name : '' };
  }

  /* ---------- rounds ---------- */

  /* Everything a round needs, the same on every phone and on the referee. */
  function roundAt(cfg, seed, k, ids) {
    var c = sanitize(cfg);
    ids = ids || deal(c, seed, c.rounds);
    var id = ids[k % ids.length];
    var b = brand(id) || { name: id };
    var name = target(id);
    var out = {
      k: k, id: id, name: b.name, target: name, cells: FF.SpellTiles.layout(name), letters: lettersOf(name),
      seconds: secondsFor(c), mode: c.mode, twist: c.twist, zoom: null, flashMs: null
    };
    if (c.mode === 'tiles') out.tiles = tilesFor(id, c.level, rng(hash('round|' + seed + '|' + k))).tiles;
    // Their own randoms, so a setting never changes what another one deals.
    if (c.mode === 'choice') out.choices = choices(id, c.level, rng(hash('choice|' + seed + '|' + k)));
    if (c.twist === 'zoom') {
      var z = rng(hash('zoom|' + seed + '|' + k));
      out.zoom = { x: 25 + Math.round(z() * 50), y: 25 + Math.round(z() * 50) };
    }
    if (c.twist === 'flash') out.flashMs = FLASH_MS;
    return out;
  }

  /* ---------- points ---------- */

  /* A round's points. Wrong or too late: nothing. secs null = no clock, so no speed bonus. */
  function points(o) {
    o = o || {};
    var level = LEVELS.indexOf(o.level) !== -1 ? o.level : 'normal';
    var out = { base: 0, speed: 0, bonus: 0, total: 0 };
    if (!o.ok) return out;
    out.base = BASE[level];
    if (o.secs) {
      var left = Math.max(0, Math.min(1, 1 - (o.ms || 0) / (o.secs * 1000)));
      out.speed = Math.round((o.twist === 'zoom' ? ZOOM_SPEED : SPEED) * left);
    }
    out.bonus = (BONUS[o.mode] || 0) + (BONUS[o.twist] || 0);
    out.total = out.base + out.speed + out.bonus;
    return out;
  }

  FF.LogoRushRules = {
    LEVELS: LEVELS, MODES: MODES, ROOM_MODES: ROOM_MODES, CATS: CATS, TIMES: TIMES, SECONDS: SECONDS,
    TYPE_EXTRA: TYPE_EXTRA, TWISTS: TWISTS, ROUNDS: ROUNDS, CHOICES: CHOICES, BASE: BASE, BONUS: BONUS,
    STANDARD: STANDARD, MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, FLASH_MS: FLASH_MS,
    REVEAL_MS: REVEAL_MS, MIN_POOL: MIN_POOL, LONG_NAME: LONG_NAME,
    brand: brand, sanitize: sanitize, sanitizeRoom: sanitizeRoom, isStandard: isStandard, secondsFor: secondsFor,
    pool: pool, hash: hash, rng: rng, shuffle: shuffle, deal: deal, nextUnused: nextUnused, target: target,
    relatedNames: relatedNames, tilesFor: tilesFor, check: check, choices: choices, checkChoice: checkChoice,
    roundAt: roundAt, points: points
  };
})();
