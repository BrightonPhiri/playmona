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

  function key(item) { return item.topic + '/' + item.id; }

  /* seen (key -> true, or null): pictures this phone showed lately go after the fresh ones. */
  function deal(cfg, rand, count, seen) {
    var c = sanitize(cfg);
    var pool = itemsFor(c.topic);
    var mixed = shuffle(pool, rand);
    if (seen) {
      mixed = mixed.filter(function (i) { return !seen[key(i)]; })
        .concat(mixed.filter(function (i) { return seen[key(i)]; }));
    }
    var picked = mixed.slice(0, Math.max(0, Math.min(count, pool.length)));
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

  /* The topic a shared run plays (a room, the daily or a challenge), or null when the player picks. */
  function sharedTopic(config, roomSettings) {
    config = config || {};
    if (roomSettings) return sanitize(roomSettings).topic;
    if (config.daily) return 'mix';
    if (config.challenge) {
      var topics = (config.challenge.opts && config.challenge.opts.topics) || [];
      return sanitize({ topic: topics[0] }).topic;
    }
    return null;
  }

  FF.GuessIt = {
    TOPICS: TOPICS, PHOTO_TOPICS: PHOTO_TOPICS, LEVELS: LEVELS, TIMES: TIMES, TWISTS: TWISTS, STANDARD: STANDARD,
    OPTIONS: OPTIONS, FLASH_MS: FLASH_MS, TYPE_EXTRA_SECS: TYPE_EXTRA_SECS,
    sanitize: sanitize, isStandard: isStandard, itemsFor: itemsFor, rng: rng, shuffle: shuffle,
    options: options, spellName: spellName, key: key, deal: deal, checker: checker, sharedTopic: sharedTopic,
    points: points, roomPoints: roomPoints, photoSrc: photoSrc, closeupSrc: closeupSrc, legacyTopic: legacyTopic
  };

  /* ================= screen helpers ================= */

  var SETUP_KEY = 'guessIt:setup';
  var TOPIC_KEY = 'guessIt:topic';
  var SEEN_KEY = 'guessIt:seen';
  var SEEN_MAX = 300;
  var PHOTO_WAIT_MS = 3000;    // longest a round waits for its photo before the clock starts
  var ZOOM_START = 2.6;        // Zoom out: how close the photo starts
  var CLOSEUP = 1.8;           // Normal and Hard: how close the browser zooms a photo without its own close-up

  // Topic tiles show one of their own photos.
  var TILE_PHOTO = {
    animals: 'lion', food: 'pizza', landmarks: 'eiffel-tower', objects: 'alarm-clock', sports: 'football',
    vehicles: 'hot-air-balloon', jobs: 'chef', instruments: 'violin'
  };
  var MIX_PHOTOS = ['animals/lion', 'food/pizza', 'landmarks/eiffel-tower', 'instruments/violin'];
  var TOPIC_ICON = { mix: 'shuffle', animals: 'paw-print', flags: 'flag' };

  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
  function save(k, v) { try { store().set(k, v); } catch (e) { /* storage full */ } }
  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function racingNow() { return !!(FF.Race && FF.Race.active && FF.Race.active() && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && api.shell.root.isConnected); }
  function roomSettings() {
    var r = FF.Room && FF.Room.current();
    return (r && r.meta && r.meta.settings) || {};
  }
  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }
  function reducedMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function topicMeta(id) {
    return (data().topics || []).filter(function (x) { return x.id === id; })[0] || null;
  }
  function topicName(id) {
    var fallback = { mix: 'Mix', animals: 'Animals', flags: 'Flags' }[id] || (topicMeta(id) || {}).name || id;
    return t('giTopic_' + id, fallback);
  }
  function topicIcon(id) { return TOPIC_ICON[id] || (topicMeta(id) || {}).icon || 'images'; }
  function topicCount(id) {
    if (id === 'flags') return ((FF.data && FF.data.worldFlags && FF.data.worldFlags.countries) || []).length;
    return itemsFor(id).length;
  }
  function askFor(topic) {
    var asks = {
      animals: t('giAskAnimals', 'What animal is this?'), food: t('giAskFood', 'What food is this?'),
      landmarks: t('giAskLandmarks', 'Which landmark is this?'), objects: t('giAskObjects', 'What is this?'),
      sports: t('giAskSports', 'Which sport is this?'), vehicles: t('giAskVehicles', 'What vehicle is this?'),
      jobs: t('giAskJobs', 'What job is this?'), instruments: t('giAskInstruments', 'Which instrument is this?')
    };
    return asks[topic] || t('giAskAny', 'What is this?');
  }
  function levelName(l) {
    return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : l === 'expert' ? t('expert', 'Expert') : t('normal', 'Normal');
  }
  function timeName(s) { return s ? t('gcNSecs', '{n} s', { n: s }) : t('gcNoLimit', 'No limit'); }
  function twistName(x) {
    return x === 'flash' ? t('giTwistFlash', 'Flash') : x === 'zoom' ? t('giTwistZoom', 'Zoom out') : t('giTwistNone', 'None');
  }
  function summary(cfg) {
    var bits = [topicName(cfg.topic), levelName(cfg.level), timeName(cfg.time)];
    if (cfg.twist !== 'none') bits.push(twistName(cfg.twist));
    return bits.join(' · ');
  }

  function seenSet(topic, need) {
    var arr = store().get(SEEN_KEY, []) || [];
    var s = {};
    arr.forEach(function (k) { s[k] = true; });
    var list = itemsFor(topic);
    var fresh = list.filter(function (i) { return !s[key(i)]; }).length;
    if (fresh >= Math.max(need, 1)) return s;
    // Nearly everything seen: start this topic afresh.
    var mine = {};
    list.forEach(function (i) { mine[key(i)] = true; });
    save(SEEN_KEY, arr.filter(function (k) { return !mine[k]; }));
    return {};
  }
  function markSeen(item) {
    var arr = store().get(SEEN_KEY, []) || [];
    arr.push(key(item));
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    save(SEEN_KEY, arr);
  }

  /* An <img> that marks its holder when it fails, so a missing photo shows the topic icon instead. */
  function photoImg(src, cls, holder) {
    var img = FF.ui.el('img', { class: cls, src: src, alt: '', draggable: 'false', decoding: 'async' });
    img.addEventListener('error', function () { holder.classList.add('is-noart'); });
    img.addEventListener('load', function () { holder.classList.add('is-loaded'); });
    return img;
  }

  var photoCache = {};
  function loadPhoto(src) {
    if (!src) return Promise.resolve();
    if (photoCache[src]) return photoCache[src];
    photoCache[src] = typeof Image !== 'function' ? Promise.resolve() : new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { var d = img.decode ? img.decode() : null; if (d && d.then) d.then(resolve, resolve); else resolve(); };
      img.onerror = function () { resolve(); };
      img.src = src;
    });
    return photoCache[src];
  }
  function photoReady(src) {
    return Promise.race([loadPhoto(src), new Promise(function (r) { setTimeout(r, PHOTO_WAIT_MS); })]);
  }

  /* Mix: four photos side by side, each cell copes with its own missing photo. */
  function mixCells(holder, imgCls) {
    MIX_PHOTOS.forEach(function (k) {
      var parts = k.split('/');
      var cell = FF.ui.div('gi-cell');
      cell.appendChild(photoImg(photoSrc({ topic: parts[0], id: parts[1] }), imgCls, cell));
      holder.appendChild(cell);
    });
    holder.classList.add('is-loaded');
  }

  /* The Guess It! look stays on the shell root for every screen, Flags included. */
  function themed(api) {
    if (api.shell.root) api.shell.root.classList.add('gi-theme');
  }

  /* ================= topic picker ================= */

  function topicTile(id, onPick, last) {
    var b = FF.ui.el('button', { type: 'button', class: 'gi-tile gi-tile--' + id });
    var art = FF.ui.div('gi-tile__art');
    if (id === 'mix') {
      art.classList.add('gi-tile__art--mix');
      mixCells(art, 'gi-tile__img');
    } else if (id === 'flags') {
      art.classList.add('gi-tile__art--flags');
      ['br', 'jp', 'za', 'ca'].forEach(function (code) {
        art.appendChild(FF.ui.el('img', { class: 'gi-tile__flag', src: 'assets/flags/' + code + '.svg', alt: '', draggable: 'false' }));
      });
      art.classList.add('is-loaded');
    } else {
      art.appendChild(photoImg(photoSrc({ topic: id, id: TILE_PHOTO[id] }), 'gi-tile__img', art));
    }
    var badge = FF.ui.span('gi-tile__icon');
    badge.appendChild(FF.Icons.icon(topicIcon(id)));
    art.appendChild(badge);
    b.appendChild(art);
    var txt = FF.ui.div('gi-tile__text');
    txt.appendChild(FF.ui.span('gi-tile__name', topicName(id)));
    txt.appendChild(FF.ui.span('gi-tile__count', id === 'mix'
      ? t('giMixAll', 'A bit of everything')
      : (id === 'flags' ? t('gcNFlags', '{n} flags', { n: topicCount(id) }) : t('giNPictures', '{n} pictures', { n: topicCount(id) }))));
    b.appendChild(txt);
    if (last) b.appendChild(FF.ui.span('gi-tile__last', t('giLastPlayed', 'Last played')));
    b.addEventListener('click', function () { FF.Audio && FF.Audio.play && FF.Audio.play('select'); onPick(id); });
    return b;
  }

  function topicPicker(api, onPick) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    themed(api);
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var last = store().get(TOPIC_KEY, null);
    var stage = FF.GameUI.stage({ wide: true, className: 'gi gi-pick' });
    var head = FF.ui.div('gi-hero');
    head.appendChild(FF.ui.span('gi-hero__mark', t('giName', 'Guess It!')));
    head.appendChild(FF.GameUI.prompt(t('giPickTitle', 'What do you want to guess?'), 'xl'));
    head.appendChild(FF.ui.el('p', { class: 'gi-hero__sub' }, t('giPickSub', 'Pick a topic. A photo pops up, and you name it before the clock runs out.')));
    stage.appendChild(head);
    stage.appendChild(topicTile('mix', onPick, last === 'mix'));
    var grid = FF.ui.el('div', { class: 'gi-grid', role: 'group', 'aria-label': t('giTopics', 'Topics') });
    TOPICS.filter(function (id) { return id !== 'mix'; }).forEach(function (id) {
      grid.appendChild(topicTile(id, onPick, last === id));
    });
    stage.appendChild(grid);
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= settings ================= */

  function settingsScreen(api, topic, onBack, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    themed(api);
    var saved = sanitize(Object.assign({}, store().get(SETUP_KEY, null) || STANDARD, { topic: topic }));
    var level = saved.level, time = saved.time, twist = saved.twist;

    var stage = FF.GameUI.stage({ wide: true, className: 'gi gi-setup' });
    var banner = FF.ui.div('gi-banner');
    var art = FF.ui.div('gi-banner__art');
    if (topic === 'mix') mixCells(art, 'gi-banner__img');
    else art.appendChild(photoImg(photoSrc({ topic: topic, id: TILE_PHOTO[topic] }), 'gi-banner__img', art));
    var badge = FF.ui.span('gi-tile__icon');
    badge.appendChild(FF.Icons.icon(topicIcon(topic)));
    art.appendChild(badge);
    banner.appendChild(art);
    var words = FF.ui.div('gi-banner__words');
    words.appendChild(FF.GameUI.kicker(t('giName', 'Guess It!') + ' · ' + topicName(topic)));
    words.appendChild(FF.GameUI.prompt(t('giSetupTitle', 'How do you want to play?'), 'lg'));
    banner.appendChild(words);
    stage.appendChild(banner);

    var rows = FF.ui.el('section', { class: 'settings-section gi-setup__rows' });
    rows.appendChild(FF.UI.settingRow(t('gcLevel', 'Level'), FF.UI.segmented({
      label: t('gcLevel', 'Level'), value: level,
      options: LEVELS.map(function (l) { return { label: levelName(l), value: l }; }),
      onChange: function (v) { level = v; sync(); }
    }), t('giLevelDesc', 'Easy: the whole photo, 4 answers. Normal: a close-up, with answers that look alike. Hard: a blurred close-up and 6 answers. Expert: spell the name with letter tiles (6 extra seconds).')));
    rows.appendChild(FF.UI.settingRow(t('giTime', 'Time for each picture'), FF.UI.segmented({
      label: t('giTime', 'Time for each picture'), value: String(time),
      options: TIMES.map(function (s) { return { label: timeName(s), value: String(s) }; }),
      onChange: function (v) { time = Number(v); sync(); }
    }), t('giTimeDesc', 'Not answered in time? It counts as wrong.')));
    rows.appendChild(FF.UI.settingRow(t('giTwist', 'Twist'), FF.UI.segmented({
      label: t('giTwist', 'Twist'), value: twist,
      options: TWISTS.map(function (x) { return { label: twistName(x), value: x }; }),
      onChange: function (v) { twist = v; sync(); }
    }), t('giTwistDesc', 'Flash hides the photo after a second and a half (+25). Zoom out starts close up and slowly shows the whole photo.')));
    stage.appendChild(rows);

    var foot = FF.ui.div('qm-pick__foot gi-setup__foot');
    var note = FF.ui.el('p', { class: 'qm-pick__summary', 'aria-live': 'polite' });
    foot.appendChild(note);
    var actions = FF.ui.div('nr-setup__actions');
    actions.appendChild(FF.UI.button(t('giChangeTopic', 'Change topic'), {
      class: 'btn-lg btn-ghost', icon: 'arrow-left',
      onClick: function () { api.audio.play('click'); onBack(); }
    }));
    actions.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () {
        api.audio.play('click');
        save(SETUP_KEY, sanitize(STANDARD));
        settingsScreen(api, topic, onBack, onGo);
      }
    }));
    actions.appendChild(FF.GameUI.action(t('gcStart', 'Start'), function () {
      var cfg = current();
      api.audio.play('roundStart');
      save(SETUP_KEY, cfg);
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    }, { icon: 'play' }));
    foot.appendChild(actions);
    stage.appendChild(foot);
    root.appendChild(stage);

    function current() { return sanitize({ topic: topic, level: level, time: time, twist: twist }); }
    function sync() {
      var cfg = current();
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = summary(cfg) + (ranked && !isStandard(cfg) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= the photo ================= */

  /* A framed photo. Close-ups use the animal's own close-up file, or zoom
     the photo in at its focus point; reveal() shows the whole picture. */
  function photoFrame(item, look) {
    var box = FF.ui.el('div', { class: 'gi-photo is-loading', role: 'img', 'aria-label': t('pictureToGuess', 'Picture to guess') });
    var zoom = FF.ui.div('gi-photo__zoom');
    var f = item.focus || [50, 50];
    zoom.style.setProperty('--fx', f[0] + '%');
    zoom.style.setProperty('--fy', f[1] + '%');
    var closeFile = look.closeup ? closeupSrc(item) : null;
    var main = photoImg(closeFile || photoSrc(item), 'gi-photo__img', box);
    zoom.appendChild(main);
    var full = null;
    if (closeFile) {
      full = photoImg(photoSrc(item), 'gi-photo__img gi-photo__full', FF.ui.div(''));
      full.setAttribute('aria-hidden', 'true');
      zoom.appendChild(full);
    }
    box.appendChild(zoom);
    if (look.closeup && !closeFile) box.classList.add('is-close');
    if (look.blur) box.classList.add('is-blur');
    if (look.zoom) { box.classList.add('is-zoom-start'); zoom.style.setProperty('--zs', String(ZOOM_START)); }
    zoom.style.setProperty('--zc', String(CLOSEUP));
    ['tl', 'tr', 'bl', 'br'].forEach(function (c) { box.appendChild(FF.ui.span('gi-photo__corner gi-photo__corner--' + c)); });
    var cover = FF.ui.div('gi-photo__cover');
    cover.appendChild(FF.Icons.icon('eye-slash'));
    cover.appendChild(FF.ui.span('', t('giPhotoGone', 'Photo hidden')));
    box.appendChild(cover);
    var missing = FF.ui.div('gi-photo__missing');
    missing.appendChild(FF.Icons.icon(topicIcon(item.topic)));
    box.appendChild(missing);
    return {
      el: box,
      src: closeFile || photoSrc(item),
      open: function (secs) {
        box.classList.remove('is-loading');
        if (look.zoom) {
          // Zoom out over the round; with no limit, over 10 seconds.
          zoom.style.setProperty('--zoom-ms', ((secs || 10) * 1000) + 'ms');
          // Next frame, so the start scale is drawn before it eases out.
          requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add('is-zooming'); }); });
        }
      },
      hide: function () { box.classList.add('is-hidden'); },
      reveal: function (kind) {
        box.classList.remove('is-hidden', 'is-loading');
        box.classList.add('is-revealed');
        if (kind) box.classList.add(kind);
      }
    };
  }

  function factCard(item) {
    var card = FF.ui.div('gi-fact');
    var thumb = FF.ui.div('gi-fact__thumb');
    thumb.appendChild(photoImg(photoSrc(item), 'gi-fact__img', thumb));
    card.appendChild(thumb);
    var body = FF.ui.div('gi-fact__body');
    var tag = FF.ui.span('gi-chip');
    tag.appendChild(FF.Icons.icon(topicIcon(item.topic)));
    tag.appendChild(FF.ui.span('', item.kind ? t('kind' + item.kind, item.kind) : topicName(item.topic)));
    body.appendChild(tag);
    body.appendChild(FF.ui.el('p', { class: 'gi-fact__name' }, String(item.name).replace(/­/g, '')));
    if (item.fact) body.appendChild(FF.ui.el('p', { class: 'gi-fact__note' }, item.fact));
    card.appendChild(body);
    return card;
  }

  /* ================= the game ================= */

  function play(api, cfg, seed) {
    cfg = sanitize(cfg);
    themed(api);
    var config = api.config;
    var scorers = scorerList(config);
    var racing = racingNow();
    if (racing) {
      var me = FF.Room.current();
      var mine = scorers.filter(function (e) { return e.id === me.uid; });
      scorers = mine.length ? mine : scorers.slice(0, 1);
      if (cfg.level === 'expert') cfg.level = 'normal';
      cfg.twist = 'none';
    }
    var pool = itemsFor(cfg.topic);
    if (pool.length < 4) {
      FF.GameUI.exitCard(api, t('giNoPictures', 'No pictures yet'), t('giTooFew', 'This topic has no pictures yet.'));
      return;
    }
    var n = scorers.length;
    var timed = FF.GameLength.timed(config);
    var rounds = FF.GameLength.rounds(api, 10, pool.length);
    if (!racing && !timed && n > 1) rounds = Math.ceil(rounds / n) * n;
    var shared = racing || !!config.sharedDeal || !!config.daily || !!config.challenge;
    var want = Math.min(rounds, pool.length);
    var deck = deal(cfg, rng(seed), want, shared ? null : seenSet(cfg.topic, want));
    if (timed) FF.GameLength.manual();
    var typed = !racing && cfg.level === 'expert';
    var check = typed ? checker(pool) : null;
    var seconds = racing ? 0 : (cfg.time ? cfg.time + (typed ? TYPE_EXTRA_SECS : 0) : 0);
    var still = reducedMotion();

    var round = 0;
    var current = null;
    var stats = {};
    var totals = { c: 0, a: 0, topics: {} };
    var missed = [];
    var timers = [];
    scorers.forEach(function (e) { stats[e.id] = { c: 0, a: 0, fastest: null }; });
    // Fetch the first photos now so the opening rounds show at once.
    deck.slice(0, 3).forEach(function (r) { loadPhoto(r.item.topic === 'animals' && cfg.level !== 'easy' && cfg.level !== 'expert' ? closeupSrc(r.item) : photoSrc(r.item)); });

    function later(fn, ms) {
      var id = setTimeout(function () { if (stillShown(api)) fn(); }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    var race = racing ? FF.Race.forGame(api, {
      rounds: rounds,
      optionSelector: '.gi-opt',
      timerMs: (sanitize(roomSettings()).time || 0) * 1000,
      pointsFor: function (answer) { return answer.value != null ? answer.value : roomPoints(answer.ms, cfg.level); }
    }) : null;
    var offSettle = race ? race.onSettle(function (payload) {
      clearTimers();
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      totals.a++;
      if (payload && payload.winnerId) totals.c++;
      race.showResult(payload, {
        answerText: current ? String(current.item.name).replace(/­/g, '') : null,
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
      clearTimers();
      round++;
      if (over()) { finish(); return; }
      render();
    }

    function tally(entityId, item, correct, secs) {
      var s = stats[entityId];
      s.a++; totals.a++;
      var tp = totals.topics[item.topic] || (totals.topics[item.topic] = { c: 0, a: 0 });
      tp.a++;
      if (correct) {
        s.c++; totals.c++; tp.c++;
        if (secs != null && (s.fastest == null || secs < s.fastest)) s.fastest = secs;
      } else if (missed.indexOf(item) === -1) {
        missed.push(item);
      }
    }

    function render() {
      var r = deck[round % deck.length];
      var item = r.item;
      current = r;
      if (!shared) markSeen(item);
      var entity = racing ? scorers[0] : scorers[round % n];
      var opening = race ? race.beginRound(round) : null;
      var flash = !racing && cfg.twist === 'flash';
      var started = Date.now();
      var done = false;

      var root = api.shell.root;
      FF.ui.clear(root);
      api.shell.hideTimer();
      api.shell.updateScores(entity.id);

      var stage = FF.GameUI.stage({ className: 'gi gi-round' });
      var bar = FF.GameUI.turnBar(racing ? null : entity, FF.GameUI.roundText(round + 1, rounds));
      var rec = api.scoring.record ? api.scoring.record(entity.id) : null;
      if (!racing && rec && rec.streak >= 2) bar.appendChild(FF.GameUI.pill(t('streakN', 'Streak {n}', { n: rec.streak }), 'flame', 'streak'));
      stage.appendChild(bar);

      var card = FF.ui.div('gi-card');
      var chip = FF.ui.span('gi-chip gi-card__topic');
      chip.appendChild(FF.Icons.icon(topicIcon(item.topic)));
      chip.appendChild(FF.ui.span('', topicName(item.topic)));
      card.appendChild(chip);
      var look = {
        closeup: cfg.level === 'normal' || cfg.level === 'hard',
        blur: cfg.level === 'hard',
        zoom: !racing && cfg.twist === 'zoom' && !still
      };
      var photo = photoFrame(item, look);
      card.appendChild(photo.el);
      var meter = null;
      if (seconds) {
        meter = FF.GameUI.meter(1);
        meter.classList.add('qm-time', 'gi-time');
        meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
        card.appendChild(meter);
      }
      stage.appendChild(card);
      stage.appendChild(FF.GameUI.prompt(askFor(item.topic), 'md'));

      var group, btns = [], board = null;
      if (typed) {
        var tileRand = rng((seed + (round + 1) * 7919) >>> 0);
        var related = pool.filter(function (i) { return i.topic === item.topic && i.group === item.group && i.id !== item.id; })
          .slice(0, 3).map(function (i) { return spellName(i); });
        var set = FF.SpellTiles.deal(r.spellName, tileRand, { difficulty: config.difficulty, related: related });
        board = FF.SpellTiles.board(set, {
          audio: api.audio,
          onSubmit: function (text) {
            if (done) return;
            var res = check(text, item);
            answer(res.ok, false, { text: text, res: res });
          }
        });
        group = board.el;
      } else {
        group = FF.GameUI.options({ columns: 2, className: 'gi-options gi-options--n' + r.options.length });
        btns = r.options.map(function (label, i) {
          var b = FF.GameUI.option(label, function () { answer(label === item.name, false, null, i); }, i, { className: 'gi-opt' });
          group.appendChild(b);
          return b;
        });
      }
      stage.appendChild(group);
      var after = FF.ui.div('qm-after gi-after');
      stage.appendChild(after);
      root.appendChild(stage);

      // The clock starts when the photo is on screen, not before.
      var ready = photoReady(photo.src);
      if (race) {
        race.describe({ kind: 'choice', text: askFor(item.topic), options: r.options.map(function (o) { return String(o).replace(/­/g, ''); }), image: { src: photo.src } }, r.options.indexOf(item.name));
      }
      var thisRound = round;
      function openQuestion() {
        if (done || round !== thisRound || !stillShown(api)) return;
        started = Date.now();
        photo.open(seconds);
        if (seconds) {
          api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
          api.shell.setTimer(seconds, function () { answer(false, true); });
        }
        if (flash) later(function () { if (!done) photo.hide(); }, FLASH_MS);
        if (board) board.open();
      }
      if (race) Promise.all([opening, ready]).then(function () { race.gate(openQuestion); });
      else ready.then(openQuestion);
      // Fetch the next photo while this one is played.
      var up = deck[round + 1];
      if (up) loadPhoto(look.closeup && up.item.topic === 'animals' ? closeupSrc(up.item) : photoSrc(up.item));
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(group);

      function answer(correct, timeout, typing, idx) {
        if (done) return;
        done = true;
        clearTimers();
        var ms = Date.now() - started;
        var secs = ms / 1000;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
        if (meter && timeout) meter.set(0);
        if (board) board.finish(!!correct);

        if (race) {
          btns.forEach(function (b, i) { b.disabled = true; if (i === idx) FF.GameUI.markOption(b, 'picked'); });
          race.submit(idx, !!correct, ms, { value: correct ? roomPoints(FF.Race.msSinceOpen ? FF.Race.msSinceOpen() : ms, cfg.level) : 0 });
          after.appendChild(FF.GameUI.feedback('info', t('bqLockedIn', 'Answer locked in. Waiting for everyone…')));
          return;
        }

        btns.forEach(function (b, i) {
          b.disabled = true;
          if (r.options[i] === item.name) FF.GameUI.markOption(b, 'correct');
          else if (i === idx) FF.GameUI.markOption(b, 'wrong');
          else FF.GameUI.markOption(b, 'dim');
        });
        photo.reveal(correct ? 'is-right' : (timeout ? 'is-timeout' : 'is-wrong'));
        tally(entity.id, item, correct, timeout ? null : secs);
        var name = String(item.name).replace(/­/g, '');

        if (correct) {
          var before = api.scoring.record ? (api.scoring.record(entity.id) || {}).streak || 0 : 0;
          var pts = points({ level: cfg.level, correct: true, msLeft: seconds ? Math.max(0, seconds * 1000 - ms) : 0, secs: seconds, streak: before + 1, flash: flash, typed: typed });
          api.scoring.add(entity.id, pts, { correct: true, fastest: secs });
          var streak = (before + 1) % STREAK_EVERY === 0;
          api.audio.play(streak ? 'streak' : 'correct');
          after.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts) +
            (streak ? ' ' + t('streakBonus', 'Streak bonus!') : '') +
            (typing && !typing.res.exact ? ' ' + t('spSpelt', 'It is spelt {c}.', { c: typing.res.matched || name }) : '')));
        } else {
          api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          var lead = timeout ? t('gcTooSlow', 'Time’s up! That counts as wrong.') : t('notQuite', 'Not quite.');
          var said = typing && typing.text && FF.SpellTiles.feedbackText ? ' ' + FF.SpellTiles.feedbackText(typing.text, typing.res, name) : '';
          after.appendChild(FF.GameUI.feedback('bad', lead + ' ' + t('giItWas', 'It was {c}.', { c: name }) + said));
        }
        after.appendChild(factCard(item));
        var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('next', 'Next'), function () { api.audio.play('click'); next(); }, { class: 'btn-lg' });
        after.appendChild(nextBtn);
        api.shell.updateScores(entity.id);
        // After Enter on the tiles, wait a moment so the same key press cannot also press Next.
        if (FF.Nav && FF.Nav.focus) {
          if (typed) later(function () { if (document.body.contains(nextBtn)) FF.Nav.focus(nextBtn); }, 400);
          else FF.Nav.focus(nextBtn);
        }
      }
    }

    function finish() {
      clearTimers();
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
      ranked.forEach(function (x) {
        if (x.bestStreak > best) best = x.bestStreak;
        if (x.fastest != null && (fastest == null || x.fastest < fastest)) fastest = x.fastest;
      });
      api.audio.play('winner');
      api.end({
        results: ranked, winnerId: res ? res.winnerId : null,
        bestStreak: best, fastest: fastest,
        quizCorrect: totals.c, quizAnswered: totals.a
      });
    }

    function recap() {
      var root = api.shell.root;
      FF.ui.clear(root);
      var stage = FF.GameUI.stage({ className: 'gi qm-recap gi-recap' });
      var pct = totals.a ? Math.round(totals.c / totals.a * 100) : 0;
      var ring = FF.ui.div('qm-ring');
      ring.style.setProperty('--p', String(pct));
      ring.appendChild(FF.ui.span('qm-ring__num', pct + '%'));
      stage.appendChild(ring);
      stage.appendChild(FF.GameUI.kicker(t('giRecapKicker', 'Guess It! recap')));
      stage.appendChild(FF.GameUI.prompt(t('giRecapTitle', '{c} of {a} right', { c: totals.c, a: totals.a }), 'xl'));
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
        var rc = (api.scoring.record && api.scoring.record(e.id)) || {};
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.c, a: s.a })];
        if (rc.bestStreak > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: rc.bestStreak }));
        if (s.fastest != null) bits.push(t('qmFastest', 'fastest {s}s', { s: s.fastest.toFixed(1) }));
        who.appendChild(FF.ui.span('qm-person__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('qm-person__score', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      stage.appendChild(people);

      var ids = Object.keys(totals.topics);
      if (ids.length > 1) {
        stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('giByTopic', 'By topic')));
        var listBox = FF.ui.div('qm-bytopic');
        ids.sort(function (a, b) { return totals.topics[b].a - totals.topics[a].a; }).forEach(function (id) {
          var x = totals.topics[id];
          var row = FF.ui.div('qm-bytopic__row');
          var badge = FF.ui.span('gi-chip');
          badge.appendChild(FF.Icons.icon(topicIcon(id)));
          badge.appendChild(FF.ui.span('', topicName(id)));
          row.appendChild(badge);
          var m = FF.GameUI.meter(x.a ? x.c / x.a : 0);
          m.classList.add('qm-bytopic__meter');
          m.setAttribute('aria-label', topicName(id));
          row.appendChild(m);
          row.appendChild(FF.ui.span('qm-bytopic__n', x.c + '/' + x.a));
          listBox.appendChild(row);
        });
        stage.appendChild(listBox);
      }

      if (missed.length) {
        stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('giToLearn', 'Pictures to learn')));
        var learn = FF.ui.el('ul', { class: 'gi-learn' });
        missed.slice(0, 12).forEach(function (item) {
          var li = FF.ui.el('li', { class: 'gi-learn__item' });
          var th = FF.ui.div('gi-learn__thumb');
          th.appendChild(photoImg(photoSrc(item), 'gi-learn__img', th));
          li.appendChild(th);
          li.appendChild(FF.ui.span('gi-learn__name', String(item.name).replace(/­/g, '')));
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

  /* ================= start ================= */

  function flags(api, onBack) {
    if (!FF.GuessCountry || !FF.GuessCountry.startFlags) {
      FF.GameUI.exitCard(api, t('giNoFlags', 'Flags are not loaded'), t('noDataText', 'This content has not loaded. Check the data files and try again.'));
      return;
    }
    themed(api);
    FF.GuessCountry.startFlags(api, onBack ? { kicker: t('giName', 'Guess It!') + ' · ' + topicName('flags'), onBack: onBack } : null);
  }

  function start(api) {
    themed(api);
    var racing = racingNow();
    var fixed = sharedTopic(api.config, racing ? roomSettings() : null);
    if (fixed === 'flags') { flags(api, null); return; }
    // One number decides the whole deal. It is drawn first, before anything
    // else uses the random source, so a room or a challenge deals the same everywhere.
    if (racing) FF.Random.seed(FF.Random.roundSeed(FF.Room.current().meta.seed, api.def.id, 'deck'));
    var seed = Math.floor(rand0() * 4294967296);
    if (fixed) {
      var cfg = racing ? roomSanitize(roomSettings()) : sanitize({ topic: fixed });
      if (!racing) { cfg.level = STANDARD.level; cfg.time = STANDARD.time; cfg.twist = STANDARD.twist; }
      play(api, cfg, seed);
      return;
    }
    function pickAgain() {
      topicPicker(api, function (topic) {
        save(TOPIC_KEY, topic);
        // A challenge-ready run sends its topic with the challenge.
        if (api.config.challengeSeed) api.config.dealOptions = { topics: [topic] };
        if (topic === 'flags') { flags(api, pickAgain); return; }
        settingsScreen(api, topic, pickAgain, function (cfg) {
          if (!stillShown(api)) return;
          if (!isStandard(cfg)) api.config.customRules = true;
          play(api, cfg, seed);
        });
      });
    }
    pickAgain();
  }
  FF.GuessIt.start = start;

  if (FF.Games && FF.Games.alias) {
    Object.keys(LEGACY).forEach(function (old) { FF.Games.alias(old, 'guessIt', { topics: [LEGACY[old]] }); });
  }

  /* ================= rooms ================= */

  // A race has no Expert (spelling is solo) and no open clock (every round must end).
  var ROOM_TIMES = [5, 8, 12];
  var ROOM_COUNTS = [5, 10, 15, 20];
  var ROOM_DEFAULTS = { topic: 'mix', level: 'normal', time: 8, questions: 10 };

  function roomSanitize(s) {
    s = s || {};
    var c = sanitize({ topic: s.topic, level: s.level, time: s.time });
    var level = c.level === 'expert' ? ROOM_DEFAULTS.level : c.level;
    return {
      topic: c.topic, level: level, difficulty: level, twist: 'none',
      time: pick(ROOM_TIMES, Number(s.time), ROOM_DEFAULTS.time),
      questions: pick(ROOM_COUNTS, Number(s.questions), ROOM_DEFAULTS.questions)
    };
  }

  function roomFields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'topic', label: t('giWhatToGuess', 'What to guess'), options: TOPICS.map(function (x) { return opt(topicName(x), x); }) },
      { key: 'level', label: t('gcLevel', 'Level'), options: ['easy', 'normal', 'hard'].map(function (l) { return opt(levelName(l), l); }) },
      { key: 'time', label: t('giTimeEach', 'Time for each picture'), options: ROOM_TIMES.map(function (s) { return opt(timeName(s), s); }) },
      { key: 'questions', label: t('giPictures', 'Pictures'), options: ROOM_COUNTS.map(function (n) { return opt(String(n), n); }) }
    ];
  }

  var ROOM = {
    defaults: ROOM_DEFAULTS,
    fields: function () { return roomFields(); },
    sanitize: function (s) { return roomSanitize(s); },
    summary: function (s) {
      var c = roomSanitize(s);
      return summary(c) + ' · ' + t('giNPictures', '{n} pictures', { n: c.questions });
    }
  };
  FF.GuessIt.roomSanitize = roomSanitize;

  /* ================= registration ================= */

  FF.registerGame({
    id: 'guessIt',
    featured: true,
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
    room: ROOM,
    start: function (api) { FF.GuessIt.start(api); }
  });
})();
