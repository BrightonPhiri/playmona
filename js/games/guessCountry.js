/* ============================================================
   PLAYMONA — games/guessCountry.js
   Guess the Country: a flag waves on screen, pick its country
   before the time runs out. Every country in the world (data in
   js/data/worldFlags.js, flags in assets/flags/<code>.svg).

   Setup: regions, level (Easy, Normal, Hard), seconds per flag
   (3, 5, 8, 12 or no limit), Flash (the flag hides after a
   moment) and the flag look (waving or flat). When the time runs
   out the flag counts as wrong.

   - Local play: setup screen, then solo or pass and play.
   - Daily and friend challenges: the standard rules on a shared deal.
   - Online rooms: FF.Race, everyone answers the same flag; a round
     scores as it always has for this game (100 x difficulty, plus
     50 inside 3 seconds), which the crew brain plays from.
   Pure rules are FF.GuessCountry (tests: tools/test/guessCountry.test.js).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules (pure, tested) ================= */

  var LEVELS = ['easy', 'normal', 'hard', 'expert'];
  var TIMES = [3, 5, 8, 12, 0];          // seconds per flag; 0 = no limit
  var LOOKS = ['wave', 'flat'];
  var OPTIONS = { easy: 4, normal: 6, hard: 8, expert: 1 };   // answers to choose from (Expert types it)
  var TYPE_EXTRA_SECS = 6;               // Expert: extra seconds to type
  var TYPE_BONUS = 50;                   // Expert: points for typing it
  var FLAG_WAIT_MS = 3000;               // longest a round waits for its flag to load
  var STANDARD = { regions: [], level: 'normal', time: 8, flash: false };   // empty list = whole world
  var FLASH_MS = 1500;                   // Flash: how long the flag shows
  var FLASH_BONUS = 25;
  var STREAK_EVERY = 3;
  var STREAK_BONUS = 50;
  var MIN_LEVEL_POOL = 8;                // fewer than this at a level: widen it
  var MIN_POOL = 4;
  var SEEN_KEY = 'guessCountrySeen';
  var SEEN_MAX = 400;
  var SETUP_KEY = 'guessCountry:setup';
  var LOOK_KEY = 'guessCountry:look';

  function data() { return (FF.data && FF.data.worldFlags) || { regions: [], alike: [], countries: [] }; }
  function regionIds() { return data().regions.map(function (r) { return r.id; }); }
  function setOf(list) { var s = {}; (list || []).forEach(function (k) { s[k] = true; }); return s; }

  /* Keep only what is offered; "the whole world" is stored as []. */
  function sanitize(s) {
    s = s || {};
    var all = regionIds();
    var want = setOf(Array.isArray(s.regions) ? s.regions : []);
    var regions = all.filter(function (id) { return want[id]; });
    if (regions.length === all.length) regions = [];
    var time = Number(s.time);
    return {
      regions: regions,
      level: LEVELS.indexOf(s.level) !== -1 ? s.level : STANDARD.level,
      time: TIMES.indexOf(time) !== -1 ? time : STANDARD.time,
      flash: !!s.flash
    };
  }

  function isStandard(s) {
    var c = sanitize(s);
    return !c.regions.length && c.level === STANDARD.level && c.time === STANDARD.time && c.flash === STANDARD.flash;
  }

  /* Easy: the famous flags. Normal adds the well known ones. Hard leaves
     out the famous ones. Expert: every flag, typed. Too few at a level
     (a small region): widen it. */
  function levelOk(level, c) {
    if (level === 'expert') return true;
    if (level === 'easy') return c.tier === 1;
    if (level === 'hard') return c.tier >= 2;
    return c.tier <= 2;
  }

  function pool(countries, cfg) {
    var c = sanitize(cfg);
    var rg = setOf(c.regions);
    var base = countries.filter(function (x) { return !c.regions.length || rg[x.region]; });
    var atLevel = base.filter(function (x) { return levelOk(c.level, x); });
    if (atLevel.length >= MIN_LEVEL_POOL) return atLevel;
    if (c.level === 'easy') {
      var wider = base.filter(function (x) { return x.tier <= 2; });
      if (wider.length >= MIN_LEVEL_POOL) return wider;
    }
    return base;
  }

  /* A small seeded random source, so one number decides a whole deal. */
  function rng(seed) {
    var a = (Number(seed) || 0) >>> 0;
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

  function alikeOf(code) {
    var out = [];
    data().alike.forEach(function (group) {
      if (group.indexOf(code) === -1) return;
      group.forEach(function (c) { if (c !== code && out.indexOf(c) === -1) out.push(c); });
    });
    return out;
  }

  function optionCount(level) { return OPTIONS[level] || OPTIONS.normal; }

  /* The wrong answers: 3 on Easy, 5 on Normal, 7 on Hard. Easy: other
     well-known countries. Normal: up to two flags that look alike, the rest
     from the same region. Hard: every lookalike there is, then the same region. */
  function decoys(country, countries, level, rand) {
    var want = optionCount(level) - 1;
    var byCode = {};
    countries.forEach(function (c) { byCode[c.code] = c; });
    var picked = [];
    function take(list, max) {
      for (var i = 0; i < list.length && picked.length < max; i++) {
        var c = list[i];
        if (c && c.code !== country.code && picked.indexOf(c) === -1) picked.push(c);
      }
    }
    var alike = shuffle(alikeOf(country.code), rand).map(function (code) { return byCode[code]; });
    var sameRegion = shuffle(countries.filter(function (c) { return c.region === country.region; }), rand);
    if (level === 'easy') {
      take(shuffle(countries.filter(function (c) { return c.tier <= 2; }), rand), want);
    } else if (level === 'hard') {
      take(alike, want);
      take(sameRegion, want);
    } else {
      take(alike, 2);
      take(sameRegion, want);
    }
    take(shuffle(countries, rand), want);
    return picked;
  }

  /* A flag ready to show: its names (4, 6 or 8 by level), shuffled, and which one is right. */
  function prepare(country, countries, level, rand) {
    var opts = shuffle([country].concat(decoys(country, countries, level, rand)), rand);
    return {
      code: country.code, name: country.name, capital: country.capital,
      region: country.region, tier: country.tier, note: country.note,
      options: opts.map(function (c) { return c.name; }),
      answer: opts.indexOf(country)
    };
  }

  /* Deal `count` flags: regions take turns so none crowds out the rest.
     `seen` (optional) is a set of codes to leave out while enough are fresh. */
  function deal(countries, cfg, rand, count, seen) {
    var c = sanitize(cfg);
    var list = pool(countries, c);
    if (seen) {
      var fresh = list.filter(function (x) { return !seen[x.code]; });
      if (fresh.length >= count) list = fresh;
    }
    var byRegion = {};
    list.forEach(function (x) { (byRegion[x.region] = byRegion[x.region] || []).push(x); });
    var order = shuffle(regionIds().filter(function (id) { return byRegion[id]; }), rand);
    var bags = {};
    order.forEach(function (id) { bags[id] = shuffle(byRegion[id], rand); });
    var out = [];
    var left = true;
    while (out.length < count && left) {
      left = false;
      for (var i = 0; i < order.length && out.length < count; i++) {
        var bag = bags[order[i]];
        if (bag.length) { out.push(bag.shift()); left = true; }
      }
    }
    return out.map(function (x) { return prepare(x, countries, c.level, rand); });
  }

  function isTyped(level) { return level === 'expert'; }

  /* Other accepted names, from the central list (js/data/countryAliases.js). */
  function aliasesOf(code) {
    var a = FF.data && FF.data.countryAliases;
    return (a && a[code]) || [];
  }

  /* Every accepted name of every country, checked by the shared
     FF.AnswerMatch (built once per country list). */
  var checkerCache = { list: null, checker: null };
  function checkerFor(countries) {
    if (checkerCache.list !== countries) {
      checkerCache.list = countries;
      checkerCache.checker = FF.AnswerMatch.create({
        answers: countries.map(function (c) { return { id: c.code, names: [c.name].concat(aliasesOf(c.code)) }; })
      });
    }
    return checkerCache.checker;
  }

  /* Expert: is a spelled name right? Small spelling mistakes pass; a name
     that is another country, or as close to one, does not. */
  function checkTyped(guess, country, countries) {
    return checkerFor(countries).check(guess, country.code);
  }

  /* ---- Expert letter tiles ---- */
  var TILE_MULT = { easy: 1.5, normal: 1.75, hard: 2 };   // tiles per answer letter, by the app's difficulty
  var MAX_TILES = 30;
  var LONG_NAME = 16;          // longer names are spelled by a shorter accepted name
  var COMMON = 'AEIOURSTLNMDCBGHKPY';

  function plainUpper(s) {
    var x = String(s || '');
    if (x.normalize) x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return x.toUpperCase();
  }

  /* A name as cells: letters to spell, gaps between words, and marks
     (hyphens, apostrophes, full stops) that are shown for you. */
  function layout(name) {
    var cells = [];
    plainUpper(name).split('').forEach(function (ch) {
      if (/[A-Z]/.test(ch)) cells.push({ ch: ch, letter: true });
      else if (/\s/.test(ch)) { if (cells.length && !cells[cells.length - 1].gap) cells.push({ ch: ' ', gap: true }); }
      else cells.push({ ch: ch, fixed: true });
    });
    return cells;
  }
  /* What the slots spell, with the name's own gaps and marks between the
     letters (so SAINT KITTS reads as Saint Kitts, not SAINTKITTS). */
  function spelled(cells, chars) {
    var i = 0, out = '';
    cells.forEach(function (c) {
      if (c.letter) out += chars[i++] || '';
      else out += c.ch;
    });
    return out.replace(/s+/g, ' ').trim();
  }
  function lettersOf(name) { return layout(name).filter(function (c) { return c.letter; }).map(function (c) { return c.ch; }); }

  /* The name to spell: the country's own name, or for a very long one
     (Saint Vincent and the Grenadines) a shorter accepted name of 5 to 14 letters. */
  function targetName(country) {
    if (lettersOf(country.name).length <= LONG_NAME) return country.name;
    var alt = aliasesOf(country.code).filter(function (a) {
      var n = lettersOf(a).length;
      return n >= 5 && n <= 14 && a !== a.toUpperCase();
    });
    return alt.length ? alt[0] : country.name;
  }

  /* The tiles for one name: every letter it needs, plus decoys. The count
     follows the difficulty (1.5x, 1.75x, 2x the letters, at most 30).
     Decoys are hard on purpose: extra copies of the name's own letters,
     letters from flags that look alike or from the same region, then
     common letters. */
  function tileSet(target, rand, opts) {
    opts = opts || {};
    var cells = layout(target);
    var letters = cells.filter(function (c) { return c.letter; }).map(function (c) { return c.ch; });
    var n = letters.length;
    var mult = TILE_MULT[opts.difficulty] || TILE_MULT.normal;
    var total = Math.max(n + 2, Math.round(n * mult));
    total = Math.min(total, Math.max(MAX_TILES, n));
    var related = [];
    (opts.related || []).forEach(function (name) { related = related.concat(lettersOf(name)); });
    var decoys = [];
    for (var i = n; i < total; i++) {
      var r = rand();
      var from = r < 0.4 ? letters : (r < 0.8 && related.length ? related : COMMON.split(''));
      decoys.push(from[Math.floor(rand() * from.length)]);
    }
    var tiles = shuffle(letters.concat(decoys), rand);
    // Never deal the answer already spelled out at the start.
    if (tiles.slice(0, n).join('') === letters.join('') && tiles.length > 1) tiles.push(tiles.shift());
    return { target: target, cells: cells, letters: letters, tiles: tiles };
  }

  /* Names whose letters make the hardest decoys for this country. */
  function relatedNames(country, countries, rand) {
    var byCode = {};
    countries.forEach(function (c) { byCode[c.code] = c; });
    var out = alikeOf(country.code).map(function (code) { return byCode[code] && byCode[code].name; }).filter(Boolean);
    shuffle(countries.filter(function (c) { return c.region === country.region && c.code !== country.code; }), rand)
      .slice(0, 4).forEach(function (c) { out.push(c.name); });
    return out;
  }

  /* Local points: 100 for a right answer plus up to 100 for the time
     left (no limit: 50 inside 3 seconds), 25 more in Flash and 50 more
     when it was spelled (Expert). */
  function points(correct, ms, secs, flash, typed) {
    if (!correct) return 0;
    var pts = 100;
    if (secs > 0) pts += Math.round(100 * Math.max(0, 1 - (ms || 0) / (secs * 1000)));
    else if ((ms || 0) <= (typed ? 6000 : 3000)) pts += 50;
    return pts + (flash ? FLASH_BONUS : 0) + (typed ? TYPE_BONUS : 0);
  }

  /* Seconds a flag gets: Expert adds time to type. */
  function secondsFor(cfg) {
    var c = sanitize(cfg);
    return c.time ? c.time + (isTyped(c.level) ? TYPE_EXTRA_SECS : 0) : 0;
  }

  /* Room points, unchanged from before the rebuild (the crew brain relies on them). */
  function roomPoints(ms, difficulty) {
    var mult = difficulty === 'easy' ? 1 : difficulty === 'hard' ? 2 : 1.5;
    var pts = Math.round(100 * mult);
    if (ms != null && ms <= 3000) pts += 50;
    return pts;
  }

  /* ================= labels ================= */

  function regionOf(id) {
    var list = data().regions;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, name: id, icon: 'globe', colour: '--cat-world' };
  }
  function regionName(id) { return t('gcRegion_' + id, regionOf(id).name); }
  function levelName(l) {
    return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : l === 'expert' ? t('expert', 'Expert') : t('normal', 'Normal');
  }
  function timeName(s) { return s ? t('gcNSecs', '{n} s', { n: s }) : t('gcNoLimit', 'No limit'); }

  function summary(cfg) {
    var c = sanitize(cfg);
    var bits = [levelName(c.level)];
    bits.push(c.regions.length ? c.regions.map(regionName).join(', ') : t('gcWholeWorld', 'Whole world'));
    bits.push(c.time ? t('gcSecsEach', '{n} seconds a flag', { n: secondsFor(c) }) : t('gcNoLimit', 'No limit'));
    if (c.flash) bits.push(t('gcFlash', 'Flash'));
    return bits.join(' · ');
  }

  /* ================= device helpers ================= */

  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }

  function seenFor(list, need) {
    var arr = store().get(SEEN_KEY, []) || [];
    var s = setOf(arr);
    var fresh = list.filter(function (x) { return !s[x.code]; }).length;
    if (fresh >= Math.max(need, 1)) return s;
    var codes = setOf(list.map(function (x) { return x.code; }));
    store().set(SEEN_KEY, arr.filter(function (c) { return !codes[c]; }));
    return {};
  }
  function markSeen(code) {
    var arr = store().get(SEEN_KEY, []) || [];
    arr.push(code);
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    try { store().set(SEEN_KEY, arr); } catch (e) { /* storage full */ }
  }

  function lookPref() { var l = store().get(LOOK_KEY, 'wave'); return LOOKS.indexOf(l) !== -1 ? l : 'wave'; }
  function reducedMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }

  function racingNow() { return !!(FF.Race && FF.Race.active && FF.Race.active() && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }

  function flagPath(code) { return 'assets/flags/' + code + '.svg'; }

  /* ================= the flag ================= */

  var STRIPS = 40;
  var flagCache = {};   // code -> { ready: Promise, ratio }

  /* Fetch and decode a flag once; the promise settles when it can be drawn. */
  function loadFlag(code) {
    if (flagCache[code]) return flagCache[code].ready;
    var entry = { ratio: 0, ready: null };
    flagCache[code] = entry;
    if (typeof Image !== 'function') { entry.ready = Promise.resolve(); return entry.ready; }
    entry.ready = new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        if (img.naturalWidth && img.naturalHeight) entry.ratio = img.naturalWidth / img.naturalHeight;
        var d = img.decode ? img.decode() : null;
        if (d && d.then) d.then(resolve, resolve); else resolve();
      };
      img.onerror = function () { resolve(); };
      img.src = flagPath(code);
    });
    return entry.ready;
  }

  /* Wait for a flag, but never longer than FLAG_WAIT_MS. */
  function flagReady(code) {
    return Promise.race([loadFlag(code), new Promise(function (r) { setTimeout(r, FLAG_WAIT_MS); })]);
  }

  /* A flag as cloth. "wave": thin slices of the flag ripple and catch
     the light in turn, like fabric in a breeze (a still curve when
     motion is reduced). "flat": the plain flag. Nepal's flag is not a
     rectangle, so it always shows flat. */
  function clothFlag(code, look, alt) {
    var wave = look === 'wave' && code !== 'np';
    var box = FF.ui.el('div', { class: 'gc-flag' + (wave ? ' gc-flag--wave' : ' gc-flag--flat'), role: 'img', 'aria-label': alt });
    var cloth = FF.ui.div('gc-flag__cloth');
    box.appendChild(cloth);
    var src = flagPath(code);
    // Size the cloth to the flag's own shape (known once the file has loaded).
    function setRatio() {
      var e = flagCache[code];
      if (e && e.ratio) box.style.setProperty('--ratio', String(e.ratio));
    }
    setRatio();
    loadFlag(code).then(setRatio);
    if (!wave) {
      var img = FF.ui.el('img', { class: 'gc-flag__img', src: src, alt: '', draggable: 'false' });
      cloth.appendChild(img);
    } else {
      var still = reducedMotion();
      for (var i = 0; i < STRIPS; i++) {
        var s = FF.ui.span('gc-flag__strip');
        var part = FF.ui.el('img', { class: 'gc-flag__part', src: src, alt: '', draggable: 'false' });
        part.style.width = (STRIPS * 100) + '%';
        part.style.left = (-i * 100) + '%';
        s.appendChild(part);
        if (still) {
          var a = Math.sin(i / STRIPS * Math.PI * 2);
          s.style.transform = 'translateY(' + (a * 2.2).toFixed(2) + '%)';
          s.style.filter = 'brightness(' + (1 + a * 0.1).toFixed(3) + ')';
        } else {
          s.style.animationDelay = (-i * 0.055).toFixed(3) + 's';
        }
        cloth.appendChild(s);
      }
    }
    var cover = FF.ui.div('gc-flag__cover');
    cover.appendChild(FF.Icons.icon('eye-slash'));
    cover.appendChild(FF.ui.span('', t('gcFlagGone', 'Flag hidden')));
    box.appendChild(cover);
    return box;
  }

  function regionIcon(id) {
    var r = regionOf(id);
    var ic = FF.ui.span('qm-topic__icon');
    ic.style.setProperty('--tc', 'var(' + r.colour + ')');
    ic.appendChild(FF.Icons.icon(r.icon));
    return ic;
  }
  function regionBadge(id) {
    var b = FF.ui.span('qm-topic');
    b.appendChild(regionIcon(id));
    b.appendChild(FF.ui.span('', regionName(id)));
    return b;
  }

  /* After an answer: the country, its capital and what is on the flag. */
  function factCard(q) {
    var card = FF.ui.div('gc-fact');
    var mini = FF.ui.el('img', { class: 'gc-fact__flag', src: flagPath(q.code), alt: '' });
    card.appendChild(mini);
    var body = FF.ui.div('gc-fact__body');
    body.appendChild(FF.ui.el('p', { class: 'gc-fact__name' }, q.name));
    body.appendChild(FF.ui.el('p', { class: 'gc-fact__meta' }, t('gcCapital', 'Capital: {c}', { c: q.capital }) + ' · ' + regionName(q.region)));
    if (q.note) body.appendChild(FF.ui.el('p', { class: 'gc-fact__note' }, q.note));
    card.appendChild(body);
    return card;
  }

  /* ================= setup screen ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var countries = data().countries;
    var gs = sanitize(store().get(SETUP_KEY, null) || STANDARD);
    var chosen = setOf(gs.regions);
    var level = gs.level;
    var time = gs.time;
    var flash = gs.flash;
    var look = lookPref();

    var stage = FF.GameUI.stage({ wide: true, className: 'gc gc-setup qm-pick' });
    stage.appendChild(FF.GameUI.kicker(t('gcName', 'Guess the Country')));
    stage.appendChild(FF.GameUI.prompt(t('gcSetupTitle', 'Set up your flags'), 'xl'));

    var rows = FF.ui.el('section', { class: 'settings-section gc-setup__rows' });
    rows.appendChild(FF.UI.settingRow(t('gcLevel', 'Level'), FF.UI.segmented({
      label: t('gcLevel', 'Level'), value: level,
      options: LEVELS.map(function (l) { return { label: levelName(l), value: l }; }),
      onChange: function (v) { level = v; sync(); }
    }), t('gcLevelDesc', 'Easy: famous flags, 4 answers. Normal: 6 answers. Hard: lesser-known flags, 8 answers with lookalikes. Expert: spell the name with letter tiles (6 extra seconds; other names like USA or Holland count too).')));
    rows.appendChild(FF.UI.settingRow(t('gcTime', 'Time per flag'), FF.UI.segmented({
      label: t('gcTime', 'Time per flag'), value: String(time),
      options: TIMES.map(function (s) { return { label: timeName(s), value: String(s) }; }),
      onChange: function (v) { time = Number(v); sync(); }
    }), t('gcTimeDesc', 'Not picked in time? The flag counts as wrong.')));
    rows.appendChild(FF.UI.settingRow(t('gcShow', 'Flag shows'), FF.UI.segmented({
      label: t('gcShow', 'Flag shows'), value: flash ? 'flash' : 'all',
      options: [{ label: t('gcShowAll', 'The whole time'), value: 'all' }, { label: t('gcShowFlash', 'Flash'), value: 'flash' }],
      onChange: function (v) { flash = v === 'flash'; sync(); }
    }), t('gcShowDesc', 'Flash hides the flag after a second and a half. Worth 25 more points.')));
    rows.appendChild(FF.UI.settingRow(t('gcLook', 'Flag look'), FF.UI.segmented({
      label: t('gcLook', 'Flag look'), value: look,
      options: [{ label: t('gcLookWave', 'Waving'), value: 'wave' }, { label: t('gcLookFlat', 'Flat'), value: 'flat' }],
      onChange: function (v) { look = v; try { store().set(LOOK_KEY, v); } catch (e) { /* storage full */ } }
    })));
    stage.appendChild(rows);

    stage.appendChild(FF.ui.el('h3', { class: 'bq-setup__h' }, t('gcRegions', 'Regions')));
    var everything = FF.ui.el('button', { type: 'button', class: 'qm-every' });
    everything.appendChild(FF.Icons.icon('globe'));
    everything.appendChild(FF.ui.span('qm-every__label', t('gcWholeWorld', 'Whole world')));
    var everyCount = FF.ui.span('qm-every__count', '');
    everything.appendChild(everyCount);
    everything.addEventListener('click', function () { chosen = {}; FF.Audio.play('select'); sync(); });
    stage.appendChild(everything);

    var grid = FF.ui.el('div', { class: 'qm-grid', role: 'group', 'aria-label': t('gcRegions', 'Regions') });
    var tiles = data().regions.map(function (r) {
      var b = FF.ui.el('button', { type: 'button', class: 'qm-tile' });
      b.appendChild(regionIcon(r.id));
      var txt = FF.ui.span('qm-tile__text');
      txt.appendChild(FF.ui.span('qm-tile__name', regionName(r.id)));
      var count = FF.ui.span('qm-tile__count', '');
      txt.appendChild(count);
      b.appendChild(txt);
      b.appendChild(FF.ui.span('qm-tile__check', FF.Icons.icon('check')));
      b.addEventListener('click', function () {
        if (chosen[r.id]) delete chosen[r.id]; else chosen[r.id] = true;
        FF.Audio.play('tap');
        sync();
      });
      grid.appendChild(b);
      return { el: b, id: r.id, count: count };
    });
    stage.appendChild(grid);

    var foot = FF.ui.div('qm-pick__foot bq-setup__foot');
    var note = FF.ui.el('p', { class: 'qm-pick__summary', 'aria-live': 'polite' });
    foot.appendChild(note);
    var actions = FF.ui.div('nr-setup__actions');
    actions.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () {
        api.audio.play('click');
        try { store().set(SETUP_KEY, sanitize(STANDARD)); } catch (e) { /* storage full */ }
        setupScreen(api, onGo);
      }
    }));
    var startBtn = FF.GameUI.action(t('gcStart', 'Start'), function () {
      var cfg = current();
      if (pool(countries, cfg).length < MIN_POOL) return;
      api.audio.play('roundStart');
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    }, { icon: 'play' });
    actions.appendChild(startBtn);
    foot.appendChild(actions);
    stage.appendChild(foot);
    root.appendChild(stage);

    function current() {
      return sanitize({ regions: Object.keys(chosen), level: level, time: time, flash: flash });
    }

    function sync() {
      var cfg = current();
      var all = !cfg.regions.length;
      everything.classList.toggle('is-on', all);
      everything.setAttribute('aria-pressed', all ? 'true' : 'false');
      everyCount.textContent = t('gcNFlags', '{n} flags', { n: pool(countries, { level: cfg.level }).length });
      tiles.forEach(function (x) {
        var on = !!chosen[x.id];
        x.el.classList.toggle('is-on', on);
        x.el.setAttribute('aria-pressed', on ? 'true' : 'false');
        x.count.textContent = t('gcNFlags', '{n} flags', { n: pool(countries, { level: cfg.level, regions: [x.id] }).length });
      });
      var n = pool(countries, cfg).length;
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = t('gcNReady', '{n} flags ready', { n: n }) + ' · ' + summary(cfg) +
        (ranked && !isStandard(cfg) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
      startBtn.disabled = n < MIN_POOL;
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= the game ================= */

  function play(api, cfg, seed) {
    cfg = sanitize(cfg);
    var config = api.config;
    var scorers = scorerList(config);
    var racing = racingNow();
    if (racing) {
      var me = FF.Room.current();
      var mine = scorers.filter(function (e) { return e.id === me.uid; });
      scorers = mine.length ? mine : scorers.slice(0, 1);
    }
    var countries = data().countries;
    var list = pool(countries, cfg);
    if (list.length < MIN_POOL) {
      FF.GameUI.exitCard(api, t('gcNoFlags', 'No flags yet'), t('gcTooFew', 'Not enough flags for that mix.'));
      return;
    }
    var look = racing ? 'wave' : lookPref();
    var n = scorers.length;
    var timed = FF.GameLength.timed(config);
    var rounds = FF.GameLength.rounds(api, 10, list.length);
    if (!racing && !timed && n > 1) rounds = Math.ceil(rounds / n) * n;
    var shared = racing || !!config.sharedDeal || !!config.daily || !!config.challenge;
    var want = Math.min(rounds, list.length);
    var deck = deal(countries, cfg, rng(seed), want, shared ? null : seenFor(list, want));
    if (timed) FF.GameLength.manual();
    // Fetch every flag of the game now, so later rounds show at once.
    deck.forEach(function (q) { loadFlag(q.code); });

    var round = 0;
    var current = null;
    var stats = {};      // entityId -> { c, a, fastest }
    var totals = { c: 0, a: 0, regions: {} };
    var missed = [];     // flags to learn, for the recap
    scorers.forEach(function (e) { stats[e.id] = { c: 0, a: 0, fastest: null }; });

    var race = racing ? FF.Race.forGame(api, {
      rounds: rounds,
      optionSelector: '.gc-opt',
      pointsFor: function (answer) {
        return answer.value != null ? answer.value : roomPoints(answer.ms, config.difficulty);
      }
    }) : null;
    var offSettle = race ? race.onSettle(function (payload) {
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      totals.a++;
      if (payload && payload.winnerId) totals.c++;
      race.showResult(payload, {
        answerText: current ? current.name : null,
        isLast: race.isLastRound(round, rounds),
        onNext: function () { next(); }
      });
    }) : null;

    function over() {
      if (round >= rounds) return true;
      if (race && race.over && race.over(round)) return true;
      return timed && FF.GameLength.timeUp() && round % n === 0;
    }

    function next() {
      round++;
      if (over()) { finish(); return; }
      render();
    }

    function tally(entityId, q, correct, secs) {
      var s = stats[entityId];
      s.a++; totals.a++;
      var rg = totals.regions[q.region] || (totals.regions[q.region] = { c: 0, a: 0 });
      rg.a++;
      if (correct) {
        s.c++; totals.c++; rg.c++;
        if (secs != null && (s.fastest == null || secs < s.fastest)) s.fastest = secs;
      } else if (!missed.some(function (m) { return m.code === q.code; })) {
        missed.push(q);
      }
    }

    function render() {
      var q = deck[round % deck.length];
      current = q;
      if (!shared) markSeen(q.code);
      var entity = racing ? scorers[0] : scorers[round % n];
      var opening = race ? race.beginRound(round) : null;
      var typed = !racing && isTyped(cfg.level);
      var seconds = racing ? 0 : secondsFor(cfg);
      var flash = !racing && cfg.flash;
      var started = Date.now();
      var done = false;
      var flashTimer = null;

      var root = api.shell.root;
      FF.ui.clear(root);
      api.shell.hideTimer();
      api.shell.updateScores(entity.id);

      var stage = FF.GameUI.stage({ className: 'gc' });
      var bar = FF.GameUI.turnBar(racing ? null : entity, FF.GameUI.roundText(round + 1, rounds));
      var rec = api.scoring.record ? api.scoring.record(entity.id) : null;
      if (!racing && rec && rec.streak >= 2) bar.appendChild(FF.GameUI.pill(t('streakN', 'Streak {n}', { n: rec.streak }), 'flame', 'streak'));
      stage.appendChild(bar);

      var card = FF.ui.div('gc-card');
      var flag = clothFlag(q.code, look, t('aFlag', 'A country flag'));
      flag.classList.add('is-loading');
      card.appendChild(flag);
      var meter = null;
      if (seconds) {
        meter = FF.GameUI.meter(1);
        meter.classList.add('qm-time', 'gc-time');
        meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
        card.appendChild(meter);
      }
      stage.appendChild(card);
      stage.appendChild(FF.GameUI.prompt(t('whichCountry', 'Which country is this?'), 'md'));

      var group, btns = [], board = null;
      if (typed) {
        var full = countries.filter(function (c) { return c.code === q.code; })[0] || q;
        var tileRand = rng((seed + (round + 1) * 7919) >>> 0);
        var set = tileSet(targetName(full), tileRand, { difficulty: config.difficulty, related: relatedNames(full, countries, tileRand) });
        board = tileBoard(set, function (text) {
          if (done) return;
          var res = checkTyped(text, full, countries);
          answer(res.ok ? q.answer : -1, false, { text: text, res: res });
        });
        group = board.el;
      } else {
        group = FF.GameUI.options({ columns: 2, className: 'gc-options gc-options--n' + q.options.length });
        btns = q.options.map(function (label, i) {
          var b = FF.GameUI.option(label, function () { answer(i); }, i, { className: 'gc-opt' });
          group.appendChild(b);
          return b;
        });
      }
      stage.appendChild(group);
      var after = FF.ui.div('qm-after gc-after');
      stage.appendChild(after);
      root.appendChild(stage);

      // The clock starts when the flag is on screen, not before.
      var ready = flagReady(q.code).then(function () { flag.classList.remove('is-loading'); });

      function openQuestion() {
        if (done) return;
        flag.classList.remove('is-loading');
        started = Date.now();
        if (seconds) {
          api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
          api.shell.setTimer(seconds, function () { answer(-1, true); });
        }
        if (flash) flashTimer = setTimeout(function () { if (!done) flag.classList.add('is-hidden'); }, FLASH_MS);
        if (board) board.open();
      }

      var thisRound = round;
      if (race) {
        // For people watching: the flag and the four names (the answer is shared after the round).
        race.describe({ kind: 'choice', text: t('whichCountry', 'Which country is this?'), options: q.options.slice(), image: { flag: q.code } }, q.answer);
        Promise.all([opening, ready]).then(function () { race.gate(function () { if (round === thisRound) openQuestion(); }); });
      } else {
        ready.then(function () { if (round === thisRound) openQuestion(); });
      }
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(group);

      function answer(idx, timeout, typing) {
        if (done) return;
        done = true;
        if (flashTimer) clearTimeout(flashTimer);
        var ms = Date.now() - started;
        var secs = ms / 1000;
        var correct = !timeout && idx === q.answer;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
        flag.classList.remove('is-hidden');
        if (meter && timeout) meter.set(0);
        if (board) board.finish(correct);

        if (race) {
          btns.forEach(function (b, i) { b.disabled = true; if (i === idx) FF.GameUI.markOption(b, 'picked'); });
          race.submit(idx, correct, ms, { value: correct ? roomPoints(FF.Race.msSinceOpen ? FF.Race.msSinceOpen() : ms, config.difficulty) : 0 });
          after.appendChild(FF.GameUI.feedback('info', t('bqLockedIn', 'Answer locked in. Waiting for everyone…')));
          return;
        }

        btns.forEach(function (b, i) {
          b.disabled = true;
          if (i === q.answer) FF.GameUI.markOption(b, 'correct');
          else if (i === idx) FF.GameUI.markOption(b, 'wrong');
          else FF.GameUI.markOption(b, 'dim');
        });
        tally(entity.id, q, correct, timeout ? null : secs);

        if (correct) {
          var pts = points(true, ms, seconds, flash, typed);
          api.scoring.add(entity.id, pts, { correct: true, fastest: secs });
          var r = api.scoring.record ? api.scoring.record(entity.id) : null;
          var streak = !!(r && r.streak > 0 && r.streak % STREAK_EVERY === 0);
          if (streak) api.scoring.add(entity.id, STREAK_BONUS);
          api.audio.play(streak ? 'streak' : 'correct');
          after.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts + (streak ? STREAK_BONUS : 0)) +
            (streak ? ' ' + t('streakBonus', 'Streak bonus!') : '') +
            (typing && !typing.res.exact ? ' ' + t('gcSpelt', 'It is spelt {c}.', { c: typing.res.matched || q.name }) : '')));
        } else {
          api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          flag.classList.add(timeout ? 'is-timeout' : 'is-wrong');
          var lead = timeout ? t('gcTooSlow', 'Time’s up! That counts as wrong.') : t('notQuite', 'Not quite.');
          var said = '';
          if (typing && typing.text) {
            var other = typing.res.near && FF.AnswerMatch.normalise(typing.text) === FF.AnswerMatch.normalise(typing.res.near);
            said = other
              ? ' ' + t('gcOtherCountry', '{o} is a different country.', { o: typing.res.near })
              : typing.res.near
              ? ' ' + t('gcTooNear', 'You spelled “{x}”, which is closer to {o}.', { x: typing.text, o: typing.res.near })
              : ' ' + t('gcYouTyped', 'You spelled “{x}”.', { x: typing.text });
          }
          after.appendChild(FF.GameUI.feedback('bad', lead + ' ' + t('gcItWas', 'It was {c}.', { c: q.name }) + said));
        }
        after.appendChild(factCard(q));
        var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('next', 'Next'), function () { api.audio.play('click'); next(); }, { class: 'btn-lg' });
        after.appendChild(nextBtn);
        api.shell.updateScores(entity.id);
        // After Enter on the tiles, wait a moment so the same key press cannot also press Next.
        if (FF.Nav && FF.Nav.focus) {
          if (typed) setTimeout(function () { if (document.body.contains(nextBtn)) FF.Nav.focus(nextBtn); }, 400);
          else FF.Nav.focus(nextBtn);
        }
      }
    }

    /* Expert: answer slots for the name and a tray of letter tiles. Tap a
       tile to send it to the next empty slot, tap a filled slot to send its
       letter back; Undo and Clear. A full row is checked by itself; Check
       sends a shorter accepted name (USA from the tiles of United States).
       On a keyboard, type the letters, Backspace undoes, Enter checks. */
    function tileBoard(set, onSubmit) {
      var el = FF.ui.div('gc-spell is-waiting');
      var row = FF.ui.el('div', { class: 'gc-slots', role: 'group', 'aria-label': t('gcYourAnswer', 'Your answer') });
      var word = FF.ui.div('gc-word');
      row.appendChild(word);
      var slots = [];
      set.cells.forEach(function (c) {
        if (c.gap) { word = FF.ui.div('gc-word'); row.appendChild(word); return; }
        if (c.fixed) { word.appendChild(FF.ui.span('gc-slot gc-slot--mark', c.ch)); return; }
        var b = FF.ui.el('button', { type: 'button', class: 'gc-slot', 'aria-label': t('gcEmptySlot', 'Empty') });
        var s = { el: b, tile: null, want: c.ch };
        b.addEventListener('click', function () { unplace(s, true); });
        word.appendChild(b);
        slots.push(s);
      });
      // Slots shrink so the longest word stays on one line on a phone.
      var longest = 0;
      set.cells.reduce(function (n, c) { var m = c.gap ? 0 : n + 1; longest = Math.max(longest, m); return m; }, 0);
      row.style.setProperty('--gc-longest', String(Math.max(longest, 8)));
      el.appendChild(row);

      var tray = FF.ui.el('div', { class: 'gc-tiles', role: 'group', 'aria-label': t('gcLetters', 'Letters') });
      var tiles = set.tiles.map(function (ch) {
        var b = FF.ui.el('button', { type: 'button', class: 'gc-tile' }, ch);
        var tile = { el: b, ch: ch, used: false };
        b.addEventListener('click', function () { place(tile); });
        tray.appendChild(b);
        return tile;
      });
      el.appendChild(tray);

      var tools = FF.ui.div('gc-spell__tools');
      var undoBtn = FF.UI.button(t('gcUndo', 'Undo'), { class: 'btn btn-ghost', onClick: function () { undo(); } });
      var clearBtn = FF.UI.button(t('gcClear', 'Clear'), { icon: 'x', class: 'btn btn-ghost', onClick: function () { clear(); } });
      var checkBtn = FF.UI.button(t('gcCheck', 'Check'), { icon: 'check', primary: true, class: 'btn', onClick: function () { submit(); } });
      tools.appendChild(undoBtn);
      tools.appendChild(clearBtn);
      tools.appendChild(checkBtn);
      el.appendChild(tools);

      var history = [];
      var locked = false;
      var open = false;
      var still = reducedMotion();

      function firstEmpty() {
        for (var i = 0; i < slots.length; i++) if (!slots[i].tile) return slots[i];
        return null;
      }
      function place(tile) {
        if (locked || !open || tile.used) return;
        var s = firstEmpty();
        if (!s) return;
        tile.used = true;
        s.tile = tile;
        history.push(s);
        fly(tile.el, s);
        draw();
        api.audio.play('tap');
        if (!firstEmpty()) setTimeout(function () { if (!locked) submit(); }, still ? 60 : 280);
      }
      function unplace(s, sound) {
        if (locked || !s.tile) return;
        s.tile.used = false;
        var back = s.tile.el;
        s.tile = null;
        history = history.filter(function (x) { return x !== s; });
        draw();
        if (!still) { back.classList.remove('is-back'); void back.offsetWidth; back.classList.add('is-back'); }
        if (sound) api.audio.play('tap');
      }
      function undo() { var s = history[history.length - 1]; if (s) { unplace(s, true); } }
      function clear() {
        if (locked || !history.length) return;
        slots.forEach(function (s) { unplace(s, false); });
        api.audio.play('flip');
      }
      function text() { return spelled(set.cells, slots.map(function (s) { return s.tile ? s.tile.ch : ''; })); }
      function submit() {
        if (locked || !open) return;
        var x = text();
        if (!history.length) { row.classList.remove('is-shake'); void row.offsetWidth; row.classList.add('is-shake'); return; }
        onSubmit(x);
      }

      /* The letter flies from its tile to its slot. */
      function fly(from, s) {
        if (still || !from.getBoundingClientRect || !document.body.appendChild) { s.el.classList.add('is-landed'); return; }
        var a = from.getBoundingClientRect();
        var b = s.el.getBoundingClientRect();
        if (!a.width || !b.width) { s.el.classList.add('is-landed'); return; }
        var ghost = FF.ui.span('gc-ghost', s.tile.ch);
        ghost.style.left = a.left + 'px';
        ghost.style.top = a.top + 'px';
        ghost.style.width = a.width + 'px';
        ghost.style.height = a.height + 'px';
        document.body.appendChild(ghost);
        s.el.classList.add('is-incoming');
        void ghost.offsetWidth;
        ghost.style.transform = 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(' + (b.width / a.width).toFixed(3) + ',' + (b.height / a.height).toFixed(3) + ')';
        setTimeout(function () {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          s.el.classList.remove('is-incoming');
          s.el.classList.remove('is-landed');
          void s.el.offsetWidth;
          s.el.classList.add('is-landed');
        }, 230);
      }

      function draw() {
        slots.forEach(function (s) {
          s.el.textContent = s.tile ? s.tile.ch : '';
          s.el.classList.toggle('is-filled', !!s.tile);
          if (!s.tile) s.el.classList.remove('is-incoming', 'is-landed');
          s.el.disabled = locked || !s.tile;
          s.el.setAttribute('aria-label', s.tile ? t('gcTakeBack', 'Take back {l}', { l: s.tile.ch }) : t('gcEmptySlot', 'Empty'));
        });
        tiles.forEach(function (tl) {
          tl.el.classList.toggle('is-used', tl.used);
          tl.el.disabled = locked || tl.used;
        });
        undoBtn.disabled = locked || !history.length;
        clearBtn.disabled = locked || !history.length;
        checkBtn.disabled = locked || !history.length;
      }

      function onKey(e) {
        if (locked || !document.body.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
        if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
        var k = e.key || '';
        var mine = true;
        if (/^[a-z]$/i.test(k)) {
          var ch = plainUpper(k), hit = null;
          for (var i = 0; i < tiles.length && !hit; i++) if (!tiles[i].used && tiles[i].ch === ch) hit = tiles[i];
          if (hit) place(hit);
          else { tray.classList.remove('is-shake'); void tray.offsetWidth; tray.classList.add('is-shake'); }
        } else if (k === 'Backspace') undo();
        else if (k === 'Enter' && history.length) submit();
        else mine = false;
        if (mine) { e.preventDefault(); e.stopPropagation(); }
      }
      // Capture phase: these keys belong to the tiles, not the app's own
      // shortcuts (Backspace is "back" everywhere else).
      document.addEventListener('keydown', onKey, true);
      draw();

      return {
        el: el,
        text: text,
        /* The clock has started: show the tiles (hidden until the flag is up). */
        open: function () { open = true; el.classList.remove('is-waiting'); draw(); },
        /* Lock the board and show the name in the slots. */
        finish: function (correct) {
          locked = true;
          open = true;
          el.classList.remove('is-waiting');
          document.removeEventListener('keydown', onKey, true);
          slots.forEach(function (s) {
            var had = s.tile ? s.tile.ch : '';
            s.el.textContent = s.want;
            s.el.classList.remove('is-incoming');
            s.el.classList.add(correct || had === s.want ? 'is-right' : 'is-wrong');
          });
          draw();
          slots.forEach(function (s) { s.el.textContent = s.want; });
          el.classList.add(correct ? 'is-correct' : 'is-missed');
        }
      };
    }

    function finish() {
      if (offSettle) offSettle();
      api.shell.hideTimer();
      if (race) { race.end(); end(); return; }
      recap();
    }

    function end() {
      var res = api.scoring.results ? api.scoring.results() : null;
      var ranked = (res && res.results) || [];
      var best = 0;
      var fastest = null;
      ranked.forEach(function (r) {
        if (r.bestStreak > best) best = r.bestStreak;
        if (r.fastest != null && (fastest == null || r.fastest < fastest)) fastest = r.fastest;
      });
      api.audio.play('winner');
      api.end({
        results: ranked, winnerId: res ? res.winnerId : null,
        bestStreak: best, fastest: fastest,
        quizCorrect: totals.c, quizAnswered: totals.a
      });
    }

    // How everyone did, by region, and the flags to learn, before the results.
    function recap() {
      var root = api.shell.root;
      FF.ui.clear(root);
      var stage = FF.GameUI.stage({ className: 'qm-recap gc-recap' });
      var pct = totals.a ? Math.round(totals.c / totals.a * 100) : 0;
      var ring = FF.ui.div('qm-ring');
      ring.style.setProperty('--p', String(pct));
      ring.appendChild(FF.ui.span('qm-ring__num', pct + '%'));
      stage.appendChild(ring);
      stage.appendChild(FF.GameUI.kicker(t('gcRecapKicker', 'Guess the Country recap')));
      stage.appendChild(FF.GameUI.prompt(t('gcRecapTitle', '{c} of {a} flags right', { c: totals.c, a: totals.a }), 'xl'));
      stage.appendChild(FF.ui.el('p', { class: 'qm-pick__summary' }, summary(cfg)));

      var people = FF.ui.el('ul', { class: 'qm-people' });
      scorers.slice().sort(function (a, b) {
        return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0);
      }).forEach(function (e) {
        var s = stats[e.id];
        var li = FF.ui.el('li', { class: 'qm-person' });
        var ava = FF.ui.span('qm-person__ava');
        ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.div('qm-person__who');
        who.appendChild(FF.ui.span('qm-person__name', e.name || t('playerLabel', 'Player')));
        var rec = (api.scoring.record && api.scoring.record(e.id)) || {};
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.c, a: s.a })];
        if (rec.bestStreak > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: rec.bestStreak }));
        if (s.fastest != null) bits.push(t('qmFastest', 'fastest {s}s', { s: s.fastest.toFixed(1) }));
        who.appendChild(FF.ui.span('qm-person__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('qm-person__score', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      stage.appendChild(people);

      var ids = Object.keys(totals.regions);
      if (ids.length > 1) {
        stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('gcByRegion', 'By region')));
        var listBox = FF.ui.div('qm-bytopic');
        ids.sort(function (a, b) { return totals.regions[b].a - totals.regions[a].a; }).forEach(function (id) {
          var x = totals.regions[id];
          var row = FF.ui.div('qm-bytopic__row');
          row.appendChild(regionBadge(id));
          var m = FF.GameUI.meter(x.a ? x.c / x.a : 0);
          m.classList.add('qm-bytopic__meter');
          m.setAttribute('aria-label', regionName(id));
          row.appendChild(m);
          row.appendChild(FF.ui.span('qm-bytopic__n', x.c + '/' + x.a));
          listBox.appendChild(row);
        });
        stage.appendChild(listBox);
      }

      if (missed.length) {
        stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('gcToLearn', 'Flags to learn')));
        var learn = FF.ui.el('ul', { class: 'gc-learn' });
        missed.slice(0, 12).forEach(function (q) {
          var li = FF.ui.el('li', { class: 'gc-learn__item' });
          li.appendChild(FF.ui.el('img', { class: 'gc-learn__flag', src: flagPath(q.code), alt: '' }));
          li.appendChild(FF.ui.span('gc-learn__name', q.name));
          learn.appendChild(li);
        });
        stage.appendChild(learn);
      }
      stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () { end(); }, { icon: 'trophy' }));
      root.appendChild(stage);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
    }

    render();
  }

  /* ================= registration ================= */

  FF.GuessCountry = {
    LEVELS: LEVELS, TIMES: TIMES, OPTIONS: OPTIONS, STANDARD: STANDARD, optionCount: optionCount,
    TYPE_EXTRA_SECS: TYPE_EXTRA_SECS, TYPE_BONUS: TYPE_BONUS, isTyped: isTyped, checkTyped: checkTyped, secondsFor: secondsFor,
    TILE_MULT: TILE_MULT, MAX_TILES: MAX_TILES, aliasesOf: aliasesOf, layout: layout, spelled: spelled, targetName: targetName, tileSet: tileSet, relatedNames: relatedNames, MIN_POOL: MIN_POOL, FLASH_BONUS: FLASH_BONUS,
    sanitize: sanitize, isStandard: isStandard, pool: pool, rng: rng, decoys: decoys, alikeOf: alikeOf,
    prepare: prepare, deal: deal, points: points, roomPoints: roomPoints, summary: summary
  };

  FF.registerGame({
    id: 'guessCountry',
    featured: true,
    name: 'Guess the Country',
    description: 'Every flag in the world, waving on screen. Name the country before the time runs out.',
    category: 'world',
    icon: '🌍',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['visual', 'quiz', 'everyone'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Pick the regions, a level (4, 6 or 8 answers to choose from) and how many seconds you get for each flag.',
      'A flag waves on screen. Choose its country before the time runs out, or it counts as wrong.',
      'The quicker you answer, the more points. Three right in a row earns a bonus.',
      'Want it harder? Flash hides the flag after a second and a half, and Expert has you spell the name with letter tiles.'
    ],
    start: function (api) {
      // One number decides the whole deal. It is drawn first, before anything
      // else uses the random source, so a challenge or a room deals the same everywhere.
      if (racingNow()) FF.Random.seed(FF.Random.roundSeed(FF.Room.current().meta.seed, api.def.id, 'deck'));
      var seed = Math.floor(rand0() * 4294967296);
      if (racingNow() || api.config.daily || api.config.challenge) { play(api, STANDARD, seed); return; }
      setupScreen(api, function (cfg) {
        if (!stillShown(api)) return;
        if (!isStandard(cfg)) api.config.customRules = true;
        play(api, cfg, seed);
      });
    }
  });
})();
