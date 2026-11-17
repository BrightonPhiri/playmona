/* ============================================================
   PLAYMONA — guessIt.js
   Guess It!: pick what to guess (Animals, Flags, Food, Landmarks,
   Objects, Sports, Vehicles, Jobs, Instruments or a Mix), then name each
   photo before the time runs out. Flags run Guess the Country's engine
   (js/games/guessCountry.js); every other topic plays here.
   Pure rules are on FF.GuessIt (tools/test/guessIt.test.js).
   Classic script (no ES modules) so the app runs from file://.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules ================= */

  var TOPICS = ['mix', 'animals', 'flags', 'food', 'landmarks', 'objects', 'sports', 'vehicles', 'jobs', 'instruments'];
  var PHOTO_TOPICS = ['animals', 'food', 'landmarks', 'objects', 'sports', 'vehicles', 'jobs', 'instruments'];
  var LEVELS = ['easy', 'normal', 'hard', 'expert'];
  var TIMES = [5, 8, 12, 0];                         // seconds per picture; 0 = no limit
  var TWISTS = ['none', 'flash', 'zoom'];
  var STANDARD = { topic: 'mix', level: 'normal', time: 8, twist: 'none' };
  var OPTIONS = { easy: 4, normal: 4, hard: 6 };     // Expert spells instead
  var LOOKALIKES = { easy: 0, normal: 2, hard: 5 };  // most same-group wrong answers
  var LEVEL_MULT = { easy: 1, normal: 1.5, hard: 2, expert: 2 };
  var SPEED_BONUS = 50;
  var STREAK_EVERY = 3;
  var STREAK_BONUS = 50;
  var FLASH_BONUS = 25;
  var TYPE_BONUS = 50;
  var TYPE_EXTRA_SECS = 6;
  var FLASH_MS = 1500;
  var ROOM_FAST_MS = 3000;
  var ROOM_FAST_BONUS = 50;
  var LONG_NAME = 16;                                // longer names spell a shorter accepted name
  var ANIMAL_ART = 'assets/images/games/guessAnimal/';
  var PHOTO_ART = 'assets/images/games/guessIt/';
  var LEGACY = {
    guessAnimal: 'animals', guessCountry: 'flags', guessFood: 'food', guessLandmark: 'landmarks',
    guessObject: 'objects', guessSport: 'sports', guessVehicle: 'vehicles'
  };

  function data() { return (FF.data && FF.data.guessIt) || { topics: [], items: {} }; }

  function pick(list, value, fallback) { return list.indexOf(value) !== -1 ? value : fallback; }

  function sanitize(cfg) {
    cfg = cfg || {};
    var out = {
      topic: pick(TOPICS, cfg.topic, STANDARD.topic),
      level: pick(LEVELS, cfg.level, STANDARD.level),
      time: pick(TIMES, Number(cfg.time), STANDARD.time),
      twist: pick(TWISTS, cfg.twist, STANDARD.twist)
    };
    if (out.topic === 'flags' && out.twist === 'zoom') out.twist = 'none';
    return out;
  }

  // The topic does not make a run custom: every topic shares one board.
  function isStandard(cfg) {
    var c = sanitize(cfg);
    return c.level === STANDARD.level && c.time === STANDARD.time && c.twist === STANDARD.twist;
  }

  function withTopic(list, topic) {
    return (list || []).map(function (i) {
      var o = {};
      Object.keys(i).forEach(function (k) { o[k] = i[k]; });
      o.topic = topic;
      return o;
    });
  }

  function itemsFor(topic) {
    if (topic === 'mix') {
      var all = [];
      PHOTO_TOPICS.forEach(function (tp) { all = all.concat(itemsFor(tp)); });
      return all;
    }
    if (topic === 'animals') return withTopic(FF.data && FF.data.animals, 'animals');
    return withTopic(data().items[topic], topic);
  }

  function rng(seed) {
    var s = (Number(seed) >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // Animals list groups that look alike from afar (js/data/animals.js).
  function nearGroups(item) {
    if (item.topic !== 'animals') return [];
    return ((FF.data && FF.data.animalNearGroups) || {})[item.group] || [];
  }

  /* Answer names for one picture, from its own topic only. */
  function options(item, pool, level, rand) {
    var count = OPTIONS[level];
    if (!count) return [];
    var others = pool.filter(function (i) { return i.topic === item.topic && i.id !== item.id && i.name !== item.name; });
    var near = nearGroups(item);
    var same = shuffle(others.filter(function (i) { return i.group === item.group; }), rand);
    var close = shuffle(others.filter(function (i) { return i.group !== item.group && near.indexOf(i.group) !== -1; }), rand);
    var far = shuffle(others.filter(function (i) { return i.group !== item.group && near.indexOf(i.group) === -1; }), rand);
    var want = Math.min(LOOKALIKES[level], count - 1);
    var picks = same.slice(0, want);
    var rest = level === 'easy' ? far.concat(close) : close.concat(far, same.slice(want));
    picks = picks.concat(rest.slice(0, count - 1 - picks.length));
    return shuffle([item.name].concat(picks.map(function (i) { return i.name; })), rand);
  }

  function letterCount(name) { return String(name).normalize('NFD').replace(/[^A-Za-z]/g, '').length; }

  /* The name Expert spells: the real one, or a shorter accepted name when it is long. */
  function spellName(item) {
    var name = String(item.name).replace(/­/g, '');
    if (letterCount(name) <= LONG_NAME) return name;
    var short = (item.aka || []).filter(function (a) { return letterCount(a) >= 2 && letterCount(a) <= LONG_NAME; })[0];
    return short || name;
  }

  function deal(cfg, rand, count) {
    var c = sanitize(cfg);
    var pool = itemsFor(c.topic);
    var picked = shuffle(pool, rand).slice(0, Math.max(0, Math.min(count, pool.length)));
    return picked.map(function (item) {
      return { item: item, options: options(item, pool, c.level, rand), spellName: spellName(item) };
    });
  }

  /* Expert: is this spelling the picture? Other names count; another picture never does. */
  function checker(pool) {
    var m = FF.AnswerMatch.create({
      answers: pool.map(function (i) {
        return { id: i.topic + '/' + i.id, names: [String(i.name).replace(/­/g, '')].concat(i.aka || []) };
      })
    });
    return function (guess, item) { return m.check(guess, item.topic + '/' + item.id); };
  }

  function points(p) {
    if (!p || !p.correct) return 0;
    var pts = Math.round(100 * (LEVEL_MULT[p.level] || LEVEL_MULT.normal));
    if (p.secs > 0) pts += Math.round(SPEED_BONUS * Math.max(0, Math.min(1, (p.msLeft || 0) / (p.secs * 1000))));
    if (p.streak > 0 && p.streak % STREAK_EVERY === 0) pts += STREAK_BONUS;
    if (p.flash) pts += FLASH_BONUS;
    if (p.typed) pts += TYPE_BONUS;
    return pts;
  }

  // Rooms keep the old picture games' race points.
  function roomPoints(ms, difficulty) {
    var pts = Math.round(100 * (LEVEL_MULT[difficulty] || LEVEL_MULT.normal));
    if (ms != null && ms <= ROOM_FAST_MS) pts += ROOM_FAST_BONUS;
    return pts;
  }

  function photoSrc(item) {
    if (item.topic === 'animals') return ANIMAL_ART + item.id + '.webp';
    return PHOTO_ART + item.topic + '/' + item.id + '.webp';
  }

  function closeupSrc(item) {
    return item.topic === 'animals' ? ANIMAL_ART + item.id + '-closeup.webp' : null;
  }

  function legacyTopic(id) { return LEGACY[id] || null; }

  FF.GuessIt = {
    TOPICS: TOPICS, PHOTO_TOPICS: PHOTO_TOPICS, LEVELS: LEVELS, TIMES: TIMES, TWISTS: TWISTS, STANDARD: STANDARD,
    OPTIONS: OPTIONS, FLASH_MS: FLASH_MS, TYPE_EXTRA_SECS: TYPE_EXTRA_SECS,
    sanitize: sanitize, isStandard: isStandard, itemsFor: itemsFor, rng: rng, shuffle: shuffle,
    options: options, spellName: spellName, deal: deal, checker: checker,
    points: points, roomPoints: roomPoints, photoSrc: photoSrc, closeupSrc: closeupSrc, legacyTopic: legacyTopic
  };

  /* ================= registration ================= */

  FF.registerGame({
    id: 'guessIt',
    name: 'Guess It!',
    description: 'Pick what to guess, from animals and flags to food, landmarks and instruments, then name each photo before time runs out.',
    category: 'visual',
    icon: '📸',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['visual', 'quiz', 'everyone'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Choose what to guess: animals, flags, food, landmarks, objects, sports, vehicles, jobs, instruments, or a mix of them.',
      'A photo appears. Pick its name before the time runs out, or it counts as wrong.',
      'Normal shows a close-up and Hard blurs it too, with answers that look alike. Expert has you spell the name with letter tiles.',
      'Quicker right answers score more, and three in a row earns a bonus.',
      'Twists: Flash hides the photo after a moment, Zoom out starts close up and slowly shows more.'
    ],
    start: function (api) { FF.GuessIt.start(api); }
  });
})();
