/* ============================================================
   PLAYMONA — geospin/rules.js
   GeoSpin's pure rules, shared by phones and the server referee
   (js/geospin/referee.js, run by the crew runner): settings, which
   countries a level deals, the answer to spell each round (a name
   or a recognised other name), the letter bank, answer checking
   (the shared FF.CountryNames checker, built on FF.AnswerMatch)
   and points. No DOM, no Math.random: one seed decides a game.

     var R = FF.GeoSpinRules;
     var round = R.roundAt(settings, seed, k);   // { code, target, cells, letters, tiles, choices?, ... }
     var res = R.check('zimbabwe', round.code);   // FF.AnswerMatch result
     var pts = R.points({ level, ok, ms, secs, streak, hints });

   Tests: tools/test/geoSpin.test.js. Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'normal', 'hard', 'expert'];
  var MODES = ['write', 'choice'];  // spell the name with tiles, or pick it from a list
  var CHOICES = { easy: 4, normal: 6, hard: 8, expert: 10 };      // answers to pick from
  var MULT = { easy: 1.5, normal: 1.75, hard: 2, expert: 2 };     // tiles per letter of the answer
  var SECONDS = { easy: 30, normal: 25, hard: 20, expert: 15 };
  var BASE = { easy: 100, normal: 150, hard: 200, expert: 300 };
  var SPEED_SHARE = 0.5;          // an instant answer earns half the base again
  var STREAKS = [[10, 1.3], [5, 1.2], [3, 1.1]];
  var HINTS = { letter: 30, remove: 20, continent: 15 };
  var REMOVE_N = 2;               // letters the "remove" hint takes away
  var MAX_TILES = 36;             // very long names cap here, so the tray still fits a phone
  var LONG_NAME = 16;             // longer names are spelled by a shorter accepted name
  var ROUNDS = [5, 10, 15];
  var REGIONS = ['world', 'africa', 'europe', 'asia', 'americas', 'oceania'];
  var STANDARD = { level: 'normal', region: 'world', rounds: 10, mode: 'write' };
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var SPIN_MS = 3200;             // the globe spins, slows and lands
  var REVEAL_MS = 7000;           // the answer, the flag and a fact, then the next spin
  var MIN_POOL = 6;
  // Too small to spot on Easy and Normal (degrees the country reaches from its middle).
  var MIN_SPAN = { easy: 0.5, normal: 0.2, hard: 0, expert: 0 };

  var COMMON = 'AEIOURSTLNMDCBGHKPY';
  var SOUTH_AMERICA = { ar: 1, bo: 1, br: 1, cl: 1, co: 1, ec: 1, gy: 1, py: 1, pe: 1, sr: 1, uy: 1, ve: 1 };
  var TWO_CONTINENTS = { ru: 'Europe and Asia', tr: 'Asia and Europe', kz: 'Asia and Europe' };

  /* Shown names other than the country's own: a round may ask for either.
     Every one is also an accepted name (js/data/countryAliases.js) or the game name. */
  var FORMATS = {
    cz: ['Czech Republic'], tl: ['East Timor'], cv: ['Cape Verde'], mm: ['Burma'],
    va: ['Vatican'], ci: ['Côte d’Ivoire'], cg: ['Congo'], tr: ['Türkiye'], mk: ['Macedonia']
  };

  /* ---------- data ---------- */

  function world() { return (FF.data && FF.data.worldFlags) || { regions: [], countries: [] }; }
  function places() { return (FF.data && FF.data.geoSpinPlaces) || {}; }
  function countryOf(code) {
    var list = world().countries;
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }

  /* ---------- settings ---------- */

  function sanitize(s) {
    s = s || {};
    var rounds = Number(s.rounds);
    return {
      level: LEVELS.indexOf(s.level) !== -1 ? s.level : STANDARD.level,
      region: REGIONS.indexOf(s.region) !== -1 ? s.region : STANDARD.region,
      rounds: ROUNDS.indexOf(rounds) !== -1 ? rounds : STANDARD.rounds,
      mode: MODES.indexOf(s.mode) !== -1 ? s.mode : STANDARD.mode
    };
  }

  /* Rounds are the platform's game length when playing alone, so only level, region and mode count.
     Multiple choice is easier than spelling, so it never counts for the leaderboards. */
  function isStandard(s) {
    var c = sanitize(s);
    return c.level === STANDARD.level && c.region === STANDARD.region && c.mode === STANDARD.mode;
  }

  function secondsFor(level) { return SECONDS[level] || SECONDS.normal; }

  /* Easy: the famous countries; Normal adds the well known; Hard and Expert: all of them.
     Tiny countries only from Hard up. Too few (a small region): widen it. */
  function pool(cfg, list) {
    var c = sanitize(cfg);
    list = list || world().countries;
    var pl = places();
    var base = list.filter(function (x) { return pl[x.code] && (c.region === 'world' || x.region === c.region); });
    function fits(x) { return (pl[x.code][3] || 0) >= MIN_SPAN[c.level]; }
    var want = c.level === 'easy' ? function (x) { return x.tier === 1 && fits(x); }
      : c.level === 'normal' ? function (x) { return x.tier <= 2 && fits(x); }
      : function () { return true; };
    var at = base.filter(want);
    if (at.length >= MIN_POOL * 2) return at;
    var wider = base.filter(function (x) { return x.tier <= 2 && fits(x); });
    if (wider.length >= MIN_POOL * 2) return wider;
    var any = base.filter(fits);
    return any.length >= MIN_POOL ? any : base;
  }

  /* ---------- seeded random ---------- */

  /* A seed may be a number or a string (the referee's is a string). */
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

  /* The countries of a game, in order: regions take turns so none crowds out the rest. */
  function deal(cfg, seed, count, list) {
    var rand = rng(hash('deal|' + seed));
    var all = pool(cfg, list);
    var byRegion = {};
    all.forEach(function (x) { (byRegion[x.region] = byRegion[x.region] || []).push(x); });
    var order = shuffle(Object.keys(byRegion).sort(), rand);
    var bags = {};
    order.forEach(function (id) { bags[id] = shuffle(byRegion[id], rand); });
    var out = [];
    var left = true;
    while (out.length < count && left) {
      left = false;
      for (var i = 0; i < order.length && out.length < count; i++) {
        var bag = bags[order[i]];
        if (bag.length) { out.push(bag.shift().code); left = true; }
      }
    }
    // More rounds than countries: go round again, reshuffled.
    var lap = 1;
    while (out.length < count && all.length) {
      shuffle(all, rng(hash('lap' + lap++ + '|' + seed))).forEach(function (x) { if (out.length < count) out.push(x.code); });
    }
    return out;
  }

  /* ---------- names, cells and letters ---------- */

  function plainUpper(s) {
    var x = String(s || '');
    if (x.normalize) x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return x.toUpperCase();
  }

  /* A name as cells: letters to spell, gaps between words, and marks
     (hyphens, apostrophes) that are shown for you. */
  function layout(name) {
    var cells = [];
    plainUpper(name).split('').forEach(function (ch) {
      if (/[A-Z]/.test(ch)) cells.push({ ch: ch, letter: true });
      else if (/\s/.test(ch)) { if (cells.length && !cells[cells.length - 1].gap) cells.push({ ch: ' ', gap: true }); }
      else cells.push({ ch: ch, fixed: true });
    });
    return cells;
  }
  /* What the slots spell, with the name's own gaps and marks between letters. Empty slots are skipped,
     so a shorter accepted name (USA in the slots of United States) reads as itself. */
  function spelled(cells, chars) {
    var i = 0, out = '';
    cells.forEach(function (c) {
      if (c.letter) out += chars[i++] || '';
      else out += c.ch;
    });
    return out.replace(/\s+/g, ' ').trim();
  }
  function lettersOf(name) { return layout(name).filter(function (c) { return c.letter; }).map(function (c) { return c.ch; }); }

  /* The names a round may ask for: the country's own (or, when that is very
     long, a shorter accepted name of 5 to 14 letters) and any shown other name. */
  function formats(code) {
    var c = countryOf(code);
    if (!c) return [];
    var main = c.name;
    if (lettersOf(main).length > LONG_NAME) {
      var alt = (FF.CountryNames ? FF.CountryNames.aliases(code) : []).filter(function (a) {
        var n = lettersOf(a).length;
        return n >= 5 && n <= 14 && a !== a.toUpperCase();
      });
      if (alt.length) main = alt[0];
    }
    return [main].concat(FORMATS[code] || []);
  }
  /* Mostly the usual name; now and then a recognised other one. */
  function pickFormat(code, rand) {
    var f = formats(code);
    if (f.length < 2 || rand() < 0.7) return f[0];
    return f[1 + Math.floor(rand() * (f.length - 1))];
  }

  /* Names whose letters make the hardest decoys: neighbours, then names that
     look alike (a few letters apart, or one inside the other: Niger, Nigeria). */
  function relatedNames(code, rand) {
    var c = countryOf(code);
    if (!c) return [];
    var pl = places()[code];
    var out = [];
    (pl && pl[4] || []).forEach(function (n) { var x = countryOf(n); if (x) out.push(x.name); });
    var me = plainUpper(c.name).replace(/[^A-Z]/g, '');
    var alike = world().countries.filter(function (x) {
      if (x.code === code) return false;
      var o = plainUpper(x.name).replace(/[^A-Z]/g, '');
      if (o.indexOf(me) !== -1 || me.indexOf(o) !== -1) return true;
      return FF.AnswerMatch && Math.abs(o.length - me.length) <= 2 && FF.AnswerMatch.distance(o, me) <= 3;
    }).map(function (x) { return x.name; });
    out = alike.concat(out);
    var same = shuffle(world().countries.filter(function (x) { return x.region === c.region && x.code !== code; }), rand)
      .slice(0, 4).map(function (x) { return x.name; });
    return out.concat(same).filter(function (n, i, a) { return a.indexOf(n) === i; });
  }

  function countLetters(list) {
    var m = {};
    list.forEach(function (ch) { m[ch] = (m[ch] || 0) + 1; });
    return m;
  }

  /* The letter bank for one answer: every letter it needs (repeats too), plus decoys.
     The total follows the level (1.5x, 1.75x, 2x, 2x the letters, at least 2 decoys,
     at most MAX_TILES). Decoys mix the answer's own letters again, letters of
     related names and common letters; Hard tries to hide the whole of one look-alike
     name in the bank and Expert two, so the right name is never the only one you can make. */
  function bank(target, level, rand, related) {
    level = LEVELS.indexOf(level) !== -1 ? level : 'normal';
    var cells = layout(target);
    var letters = cells.filter(function (c) { return c.letter; }).map(function (c) { return c.ch; });
    var n = letters.length;
    var total = Math.max(n + 2, Math.round(n * MULT[level]));
    total = Math.min(total, Math.max(MAX_TILES, n));
    var room = total - n;
    var decoys = [];
    related = related || [];

    // Hide look-alike names (only their letters missing from the answer are added).
    var hide = level === 'expert' ? 2 : level === 'hard' ? 1 : 0;
    var have = countLetters(letters);
    for (var r = 0; r < related.length && hide > 0; r++) {
      var need = [];
      var got = {};
      lettersOf(related[r]).forEach(function (ch) {
        got[ch] = (got[ch] || 0) + 1;
        if (got[ch] > (have[ch] || 0)) need.push(ch);
      });
      if (!need.length || need.length > room - decoys.length) continue;
      need.forEach(function (ch) { decoys.push(ch); have[ch] = (have[ch] || 0) + 1; });
      hide--;
    }

    var rel = [];
    related.forEach(function (name) { rel = rel.concat(lettersOf(name)); });
    var share = level === 'easy' ? [0.25, 0.5] : level === 'normal' ? [0.35, 0.7] : level === 'hard' ? [0.4, 0.8] : [0.5, 0.95];
    var need0 = countLetters(letters);
    var inBank = countLetters(letters.concat(decoys));
    function fits(ch) { return (inBank[ch] || 0) < (need0[ch] || 0) + 1; }
    var guard = 0;
    while (decoys.length < room) {
      var x = rand();
      var from = x < share[0] ? letters : (x < share[1] && rel.length ? rel : COMMON.split(''));
      var ch = from[Math.floor(rand() * from.length)];
      if (!fits(ch) && guard++ < 400) continue;
      decoys.push(ch);
      inBank[ch] = (inBank[ch] || 0) + 1;
    }
    var tiles = shuffle(letters.concat(decoys), rand);
    // Never deal the answer already spelled out in a row.
    var joined = tiles.join('');
    if (n > 2 && joined.indexOf(letters.join('')) !== -1) tiles = tiles.slice(1).concat(tiles[0]);
    return { target: target, cells: cells, letters: letters, tiles: tiles };
  }

  /* ---------- multiple choice ---------- */

  /* The answers to pick from: the country and CHOICES[level] - 1 others, shuffled.
     Easy and Normal pick others from the same region (neighbours first); Hard and
     Expert start with names that look alike (Niger, Nigeria) so reading matters.
     No two answers share a name. Country codes, in the order shown. */
  function choices(code, level, rand) {
    level = LEVELS.indexOf(level) !== -1 ? level : 'normal';
    var want = CHOICES[level];
    var me = countryOf(code);
    if (!me) return [code];
    var all = world().countries;
    var out = [code], names = {};
    names[plainUpper(me.name)] = true;
    function add(c) {
      if (out.length >= want || !c || out.indexOf(c.code) !== -1) return;
      var key = plainUpper(c.name);
      if (names[key]) return;
      names[key] = true;
      out.push(c.code);
    }
    var stripped = plainUpper(me.name).replace(/[^A-Z]/g, '');
    if (level === 'hard' || level === 'expert') {
      shuffle(all.filter(function (x) {
        if (x.code === code) return false;
        var o = plainUpper(x.name).replace(/[^A-Z]/g, '');
        if (o.indexOf(stripped) !== -1 || stripped.indexOf(o) !== -1) return true;
        return FF.AnswerMatch && Math.abs(o.length - stripped.length) <= 2 && FF.AnswerMatch.distance(o, stripped) <= 3;
      }), rand).slice(0, Math.ceil(want / 3)).forEach(add);
    }
    var pl = places()[code];
    shuffle((pl && pl[4]) || [], rand).slice(0, Math.ceil(want / 2)).forEach(function (n) { add(countryOf(n)); });
    shuffle(all.filter(function (x) { return x.region === me.region; }), rand).forEach(add);
    shuffle(all, rand).forEach(add);
    return shuffle(out, rand);
  }

  /* A picked answer: right only when it is the round's country and one of its answers. */
  function checkChoice(round, pick) {
    pick = String(pick || '');
    var list = round.choices || [];
    if (list.indexOf(pick) === -1) return { ok: false, near: '' };
    if (pick === round.code) return { ok: true, exact: true };
    var c = countryOf(pick);
    return { ok: false, near: c ? c.name : '' };
  }

  /* Everything a round needs, the same on every phone and on the referee. */
  function roundAt(cfg, seed, k, codes) {
    var c = sanitize(cfg);
    codes = codes || deal(c, seed, c.rounds);
    var code = codes[k % codes.length];
    var rand = rng(hash('round|' + seed + '|' + k));
    var target = pickFormat(code, rand);
    var b = bank(target, c.level, rand, relatedNames(code, rand));
    var country = countryOf(code) || { name: code };
    var out = {
      k: k, code: code, name: country.name, target: target, cells: b.cells, letters: b.letters, tiles: b.tiles,
      seconds: secondsFor(c.level), continent: continentOf(code), mode: c.mode
    };
    // Its own random, so adding the answers never changes the letters a seed deals.
    if (c.mode === 'choice') out.choices = choices(code, c.level, rng(hash('choice|' + seed + '|' + k)));
    return out;
  }

  function continentOf(code) {
    if (TWO_CONTINENTS[code]) return TWO_CONTINENTS[code];
    var c = countryOf(code);
    if (!c) return '';
    if (c.region === 'americas') return SOUTH_AMERICA[code] ? 'South America' : 'North America';
    var r = world().regions.filter(function (x) { return x.id === c.region; })[0];
    return r ? r.name : '';
  }

  /* ---------- checking ---------- */

  /* Is a spelled answer this country? Exact names, other accepted names and
     small spelling mistakes pass; a name that is (or is as close to) another country does not. */
  function check(text, code) {
    var res = FF.CountryNames.checker().check(String(text || '').slice(0, 60), code);
    return res;
  }

  /* ---------- hints ---------- */

  /* Letters on the tray that the answer does not need (spares of a needed letter count too). */
  function spareTiles(tiles, letters) {
    var need = countLetters(letters);
    var out = [];
    tiles.forEach(function (ch, i) {
      if (need[ch] > 0) need[ch]--;
      else out.push(i);
    });
    return out;
  }
  /* The "remove" hint: which tray positions go (seeded, so it is the same each time). */
  function removable(tiles, letters, rand) {
    return shuffle(spareTiles(tiles, letters), rand).slice(0, REMOVE_N);
  }
  function hintCost(used) {
    var cost = 0;
    Object.keys(used || {}).forEach(function (k) { if (HINTS[k]) cost += HINTS[k] * (used[k] === true ? 1 : Number(used[k]) || 0); });
    return cost;
  }

  /* ---------- points ---------- */

  function streakMult(streak) {
    for (var i = 0; i < STREAKS.length; i++) if (streak >= STREAKS[i][0]) return STREAKS[i][1];
    return 1;
  }

  /* A round's points. streak counts this answer too. Wrong or too late: nothing.
     Hints come off the round's own points, never below zero. */
  function points(o) {
    o = o || {};
    var level = LEVELS.indexOf(o.level) !== -1 ? o.level : 'normal';
    var out = { base: 0, speed: 0, mult: 1, cost: 0, total: 0 };
    if (!o.ok) return out;
    var secs = o.secs || secondsFor(level);
    var left = Math.max(0, Math.min(1, 1 - (o.ms || 0) / (secs * 1000)));
    out.base = BASE[level];
    out.speed = Math.round(out.base * SPEED_SHARE * left);
    out.mult = streakMult(o.streak || 0);
    out.cost = hintCost(o.hints);
    out.total = Math.max(0, Math.round((out.base + out.speed) * out.mult) - out.cost);
    return out;
  }

  FF.GeoSpinRules = {
    LEVELS: LEVELS, MODES: MODES, CHOICES: CHOICES, MULT: MULT, SECONDS: SECONDS, BASE: BASE, STREAKS: STREAKS, HINTS: HINTS, REMOVE_N: REMOVE_N,
    MAX_TILES: MAX_TILES, ROUNDS: ROUNDS, REGIONS: REGIONS, STANDARD: STANDARD, MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS, SPIN_MS: SPIN_MS, REVEAL_MS: REVEAL_MS, MIN_POOL: MIN_POOL, FORMATS: FORMATS,
    sanitize: sanitize, isStandard: isStandard, secondsFor: secondsFor, pool: pool, hash: hash, rng: rng,
    shuffle: shuffle, deal: deal, layout: layout, spelled: spelled, lettersOf: lettersOf, formats: formats,
    pickFormat: pickFormat, relatedNames: relatedNames, bank: bank, roundAt: roundAt, continentOf: continentOf,
    countryOf: countryOf, check: check, choices: choices, checkChoice: checkChoice, spareTiles: spareTiles, removable: removable, hintCost: hintCost,
    streakMult: streakMult, points: points
  };
})();
