/* ============================================================
   PLAYMONA — games/crossword.js
   Mini Crossword: a proper crossword on a lamp-lit night stage.
   Glossy paper tiles, a big live clue bar, our own keyboard (or
   the phone's), and motion for every action: the grid deals in,
   letters pop, finished words sweep with light, a reveal flips,
   and a solved grid ripples into confetti.

   - Rules: js/crossword/rules.js (FF.CrosswordRules), shared with
     the online referee. Cursor and turns: js/crossword/cursor.js.
   - Puzzles: js/data/crosswords.js (tools/gen-crossword.js).
   - Solo, take turns (one word each) and everyone together on one
     device; daily and friend challenges play the standard settings
     on a shared deal. Online rooms: js/crossword/online.js.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.CrosswordRules;
  var C = FF.CrosswordCursor;
  var SETUP_KEY = 'crossword:setup';
  var BEST_KEY = 'crossword:best';
  var SEEN_KEY = 'crossword:seen';
  var KB_KEY = 'crossword:keyboard';
  var SEEN_MAX = 500;
  var WORD_PTS = { easy: 10, normal: 15, hard: 20 };   // per letter, take turns

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function animationsOn() { return !reduceMotion() && (!FF.Settings || !FF.Settings.get || FF.Settings.get('animations') !== false); }
  function racingRoom(api) { return !!(api.config.room && FF.Room && FF.Room.current()); }
  function keyOf(r, c) { return r + ',' + c; }
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function levelName(l) { return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : t('normal', 'Normal'); }
  function dirName(d) { return d === 'across' ? t('cwAcross', 'Across') : t('cwDown', 'Down'); }

  var PACK = {
    animals: ['cwPackAnimals', 'Animals', 'paw'],
    food: ['cwPackFood', 'Food & Drink', 'apple'],
    home: ['cwPackHome', 'Home & School', 'house'],
    sport: ['cwPackSport', 'Sport & Games', 'ball'],
    music: ['cwPackMusic', 'Music & Arts', 'note'],
    geography: ['cwPackGeo', 'Geography', 'globe'],
    bible: ['cwPackBible', 'Bible', 'book'],
    nature: ['cwPackNature', 'Nature & Weather', 'leaf'],
    mixed: ['cwPackMixed', 'Mixed', 'dice']
  };
  function packName(p) { var m = PACK[p] || PACK.mixed; return t(m[0], m[1]); }

  var GLYPHS = {
    paw: '<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 3-4 2-2 1-4 0-4-2z"/>',
    apple: '<path d="M12 7c-2-2-7-1-7 5s3 9 5 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-3 5-9s-5-7-7-5z"/><path d="M12 7c0-2 1-4 3-4"/>',
    house: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10l-5 0M17 20l-2.5-5.5M7 20l2.5-5.5M3 10h5"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M12 7v6M9.5 9.5h5"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15z"/><path d="M5 19l8-8"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
    letter: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 16l3-8 3 8M10 13.5h4"/>',
    word: '<rect x="2" y="7" width="6" height="10" rx="1.5"/><rect x="9" y="7" width="6" height="10" rx="1.5"/><rect x="16" y="7" width="6" height="10" rx="1.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    eraser: '<path d="M7 20h13"/><path d="M4 15l9-9 6 6-7 7H8z"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    soundOn: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    soundOff: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'
  };
  function glyph(name, cls) {
    var s = document.createElement('span');
    s.className = 'cw-glyph' + (cls ? ' ' + cls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (GLYPHS[name] || '') + '</svg>';
    return s;
  }
  function btn(cls, label, icon, fn, aria) {
    var b = FF.ui.el('button', { type: 'button', class: cls });
    if (icon) b.appendChild(glyph(icon));
    if (label) b.appendChild(FF.ui.span('', label));
    if (aria) { b.setAttribute('aria-label', aria); b.title = aria; }
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  function countUp(el, to, ms, fmt) {
    fmt = fmt || function (v) { return FF.util.formatNumber(v); };
    if (!animationsOn()) { el.textContent = fmt(to); return; }
    var start = Date.now(), seen = false;
    (function tick() {
      var p = Math.min(1, (Date.now() - start) / ms);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      // The number is often built before its card is on the page: keep going until it has
      // been shown, and stop only once it has been taken away again.
      if (el.isConnected) seen = true;
      if (p < 1 && (el.isConnected || !seen)) setTimeout(tick, 30);
    })();
  }

  function soundButton() {
    var b = FF.ui.el('button', { type: 'button', class: 'cw-iconbtn' });
    function sync() {
      var on = FF.Audio.effectsEnabled !== false;
      FF.ui.clear(b);
      b.appendChild(glyph(on ? 'soundOn' : 'soundOff'));
      var label = on ? t('gsFxOff', 'Turn sound effects off') : t('gsFxOn', 'Turn sound effects on');
      b.setAttribute('aria-label', label);
      b.title = label;
      b.classList.toggle('is-off', !on);
    }
    b.addEventListener('click', function () { FF.Audio.setEffects(FF.Audio.effectsEnabled === false); if (FF.Audio.effectsEnabled) FF.Audio.play('tap'); sync(); });
    sync();
    return b;
  }

  /* ================= the screen frame ================= */

  function frame(api, cls) {
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('cw-shell');
    api.shell.hideTimer();
    var cw = FF.ui.div('cw ' + (cls || ''));
    var lamp = FF.ui.div('cw-lamp');
    lamp.setAttribute('aria-hidden', 'true');
    cw.appendChild(lamp);
    var top = FF.ui.div('cw-top');
    var brand = FF.ui.div('cw-brand');
    brand.appendChild(FF.ui.span('cw-brand__mini', t('cwMini', 'Mini')));
    brand.appendChild(FF.ui.span('cw-brand__word', t('cwCrossword', 'Crossword')));
    top.appendChild(brand);
    var chips = FF.ui.div('cw-chips');
    top.appendChild(chips);
    var tools = FF.ui.div('cw-tools');
    top.appendChild(tools);
    tools.appendChild(soundButton());
    cw.appendChild(top);
    var main = FF.ui.div('cw-main');
    cw.appendChild(main);
    root.appendChild(cw);
    return { root: cw, top: top, chips: chips, tools: tools, main: main };
  }

  function chip(text, cls, icon) {
    var c = FF.ui.span('cw-chip' + (cls ? ' ' + cls : ''));
    if (icon) c.appendChild(glyph(icon));
    var s = FF.ui.span('cw-chip__text', text);
    c.appendChild(s);
    c.text = s;
    return c;
  }
  function starsChip() {
    var c = FF.ui.span('cw-chip cw-chip--stars');
    var stars = [0, 1, 2].map(function () { var s = glyph('star', 'cw-star is-on'); c.appendChild(s); return s; });
    c.setAttribute('role', 'img');
    return {
      el: c,
      set: function (n) {
        stars.forEach(function (s, i) {
          var on = i < n;
          if (!on && s.classList.contains('is-on')) restart(s, 'is-lost');
          s.classList.toggle('is-on', on);
        });
        c.setAttribute('aria-label', t('cwStarsN', '{n} of 3 stars', { n: n }));
      }
    };
  }

  /* A little crossword that deals itself in, for the setup screen. */
  function demoGrid() {
    var rows = ['PLAY#', 'U#M#M', 'ZESTY', 'Z#E#S', '#WORD'];
    var g = FF.ui.div('cw-demo');
    g.setAttribute('aria-hidden', 'true');
    rows.forEach(function (row, r) {
      row.split('').forEach(function (ch, c) {
        var cell = FF.ui.div('cw-demo__cell' + (ch === '#' ? ' is-block' : ''));
        if (ch !== '#') cell.appendChild(FF.ui.span('', ch));
        cell.style.setProperty('--d', String(r + c));
        g.appendChild(cell);
      });
    });
    return g;
  }

  /* ================= setup ================= */

  function setupScreen(api, onGo) {
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var saved = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var level = saved.level, pack = saved.pack, checking = saved.checking;
    var kb = store().get(KB_KEY, 'builtin') === 'device' ? 'device' : 'builtin';
    var f = frame(api, 'cw--setup');
    var hero = FF.ui.div('cw-hero');
    hero.appendChild(demoGrid());
    var tag = FF.ui.el('p', { class: 'cw-tagline' });
    tag.appendChild(FF.ui.span('', t('cwTag1', 'Read the clue. ')));
    tag.appendChild(FF.ui.span('', t('cwTag2', 'Fill the grid. ')));
    tag.appendChild(FF.ui.span('cw-gold', t('cwTag3', 'Beat the clock.')));
    hero.appendChild(tag);
    f.main.appendChild(hero);

    var panel = FF.ui.div('cw-setup');
    function section(title) {
      var s = FF.ui.div('cw-setup__sec');
      s.appendChild(FF.ui.el('h2', { class: 'cw-h' }, title));
      panel.appendChild(s);
      return s;
    }
    function group(host, label) {
      var g = FF.ui.el('div', { class: 'cw-choices', role: 'group', 'aria-label': label });
      host.appendChild(g);
      return g;
    }

    var lv = section(t('gsChooseLevel', 'Choose your level'));
    var lvGroup = group(lv, t('gcLevel', 'Level'));
    lvGroup.classList.add('cw-choices--levels');
    var levelBtns = R.LEVELS.map(function (l) {
      var b = FF.ui.el('button', { type: 'button', class: 'cw-choice cw-choice--level cw-lv-' + l });
      var sizes = R.SIZES[l].map(function (n) { return n + '×' + n; }).join(' · ');
      b.appendChild(FF.ui.span('cw-choice__name', levelName(l)));
      b.appendChild(FF.ui.span('cw-choice__meta', sizes));
      b.appendChild(FF.ui.span('cw-choice__note', l === 'easy' ? t('cwEasyNote', 'Friendly clues') : l === 'hard' ? t('cwHardNote', 'Wordplay and big grids') : t('cwNormalNote', 'Fill in the blanks')));
      b.addEventListener('click', function () { level = l; api.audio.play('select'); sync(); });
      lvGroup.appendChild(b);
      return { el: b, id: l };
    });

    var pk = section(t('cwChoosePack', 'Pick a theme'));
    var pkGroup = group(pk, t('cwTheme', 'Theme'));
    pkGroup.classList.add('cw-choices--packs');
    // Mixed (the default) first, then the themes.
    var packBtns = ['mixed'].concat(R.PACKS.filter(function (x) { return x !== 'mixed'; })).map(function (p) {
      var b = FF.ui.el('button', { type: 'button', class: 'cw-choice cw-choice--pack' });
      b.appendChild(glyph(PACK[p][2]));
      b.appendChild(FF.ui.span('cw-choice__name', packName(p)));
      var count = FF.ui.span('cw-choice__count', '');
      b.appendChild(count);
      b.addEventListener('click', function () { pack = p; api.audio.play('tap'); sync(); });
      pkGroup.appendChild(b);
      return { el: b, id: p, count: count };
    });

    var ck = section(t('cwHowToCheck', 'Checking'));
    var ckGroup = group(ck, t('cwHowToCheck', 'Checking'));
    var checkBtns = R.CHECKING.map(function (c) {
      var b = FF.ui.el('button', { type: 'button', class: 'cw-choice cw-choice--wide' });
      b.appendChild(glyph(c === 'expert' ? 'bulb' : 'check'));
      var txt = FF.ui.span('cw-choice__text');
      txt.appendChild(FF.ui.span('cw-choice__name', c === 'expert' ? t('cwExpert', 'Expert') : t('cwChecked', 'Letters checked')));
      txt.appendChild(FF.ui.span('cw-choice__note', c === 'expert' ? t('cwExpertNote', 'No help as you type. Check the grid at the end. +50% points') : t('cwCheckedNote', 'Right words glow, wrong letters turn red')));
      b.appendChild(txt);
      b.addEventListener('click', function () { checking = c; api.audio.play('select'); sync(); });
      ckGroup.appendChild(b);
      return { el: b, id: c };
    });

    var kk = section(t('cwTyping', 'Typing'));
    var kkGroup = group(kk, t('cwTyping', 'Typing'));
    var kbBtns = ['builtin', 'device'].map(function (k) {
      var b = FF.ui.el('button', { type: 'button', class: 'cw-choice cw-choice--wide' });
      b.appendChild(glyph(k === 'device' ? 'phone' : 'keyboard'));
      var txt = FF.ui.span('cw-choice__text');
      txt.appendChild(FF.ui.span('cw-choice__name', k === 'device' ? t('cwKbDevice', "Phone's keyboard") : t('cwKbBuiltin', 'Game keyboard')));
      txt.appendChild(FF.ui.span('cw-choice__note', k === 'device' ? t('cwKbDeviceNote', 'Uses your own keyboard and autocorrect is off') : t('cwKbBuiltinNote', 'Sits under the grid so nothing is covered')));
      b.appendChild(txt);
      b.addEventListener('click', function () { kb = k; api.audio.play('select'); sync(); });
      kkGroup.appendChild(b);
      return { el: b, id: k };
    });

    var foot = FF.ui.div('cw-setup__foot');
    var info = FF.ui.el('p', { class: 'cw-note', 'aria-live': 'polite' });
    foot.appendChild(info);
    var go = btn('cw-btn cw-btn--go cw-btn--big', t('cwStart', 'Start puzzle'), 'play', function () {
      var cfg = R.sanitize({ level: level, pack: pack, checking: checking });
      try { store().set(SETUP_KEY, cfg); store().set(KB_KEY, kb); } catch (e) { /* storage full */ }
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    });
    foot.appendChild(go);
    panel.appendChild(foot);
    f.main.appendChild(panel);

    function sync() {
      function mark(list, id) { list.forEach(function (x) { var on = x.id === id; x.el.classList.toggle('is-on', on); x.el.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
      mark(levelBtns, level); mark(packBtns, pack); mark(checkBtns, checking); mark(kbBtns, kb);
      packBtns.forEach(function (x) { x.count.textContent = String(R.pool(FF.data.crosswords, { level: level, pack: x.id }).length); });
      var n = R.pool(FF.data.crosswords, { level: level, pack: pack }).length;
      var best = (store().get(BEST_KEY, {}) || {})[level + '|' + pack];
      info.textContent = t('cwNReady', '{n} puzzles ready', { n: n }) + (best ? ' · ' + t('cwBestTime', 'Best time {t}', { t: clock(best) }) : '');
      go.disabled = !n;
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(panel);
  }

  /* ================= players ================= */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }
  function seenIds() { return store().get(SEEN_KEY, []) || []; }
  function markSeen(id) {
    var arr = seenIds().filter(function (x) { return x !== id; });
    arr.push(id);
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    try { store().set(SEEN_KEY, arr); } catch (e) { /* storage full */ }
  }

  /* ================= the board (shared with online play) ================= */

  /* Builds the clue bar, grid, help row, keyboard and clue list for a puzzle.
     The caller owns the rules: it gets onType/onBack/onSelect callbacks and
     drives the look with the returned methods. */
  function board(api, f, puzzle, opts) {
    var built = R.build(puzzle);
    var n = built.size;
    var words = {};
    built.words.forEach(function (w) { words[w.id] = w; });
    var play = FF.ui.div('cw-play');
    var side = FF.ui.div('cw-side');
    f.main.appendChild(play);
    f.main.appendChild(side);

    // Clue bar.
    var clue = FF.ui.div('cw-cluebar');
    var prevB = btn('cw-clue__arrow', '', 'prev', function () { api.audio.play('tap'); opts.onClue(-1); }, t('cwPrevClue', 'Previous clue'));
    var nextB = btn('cw-clue__arrow', '', 'next', function () { api.audio.play('tap'); opts.onClue(1); }, t('cwNextClue', 'Next clue'));
    var body = FF.ui.el('button', { type: 'button', class: 'cw-clue__body', 'aria-live': 'polite' });
    var tagEl = FF.ui.span('cw-clue__tag', '');
    var textEl = FF.ui.span('cw-clue__text', '');
    body.appendChild(tagEl);
    body.appendChild(textEl);
    body.addEventListener('click', function () { opts.onFlip(); });
    clue.appendChild(prevB);
    clue.appendChild(body);
    clue.appendChild(nextB);
    play.appendChild(clue);

    // Grid.
    var wrap = FF.ui.div('cw-boardwrap');
    var grid = FF.ui.el('div', { class: 'cw-board cw-board--' + n, role: 'grid', 'aria-label': t('cwGrid', 'Crossword grid') });
    grid.style.setProperty('--n', String(n));
    var cells = {};
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var cell = FF.ui.div('cw-cell');
        cell.style.setProperty('--d', String(r + c));
        if (built.block[r][c]) {
          cell.classList.add('is-block');
        } else {
          cell.setAttribute('role', 'gridcell');
          var tile = FF.ui.div('cw-tile');
          if (built.num[r][c]) tile.appendChild(FF.ui.span('cw-tile__num', String(built.num[r][c])));
          var ch = FF.ui.span('cw-tile__ch', '');
          tile.appendChild(ch);
          cell.appendChild(tile);
          (function (rr, cc, el) {
            el.addEventListener('pointerdown', function (e) { if (e.button && e.button !== 0) return; e.preventDefault(); opts.onSelect(rr, cc); });
          })(r, c, cell);
          cells[keyOf(r, c)] = { el: cell, tile: tile, ch: ch };
        }
        grid.appendChild(cell);
      }
    }
    var cursor = FF.ui.div('cw-cursor');
    cursor.setAttribute('aria-hidden', 'true');
    grid.appendChild(cursor);
    wrap.appendChild(grid);
    play.appendChild(wrap);
    if (animationsOn()) { grid.classList.add('is-dealing'); setTimeout(function () { grid.classList.remove('is-dealing'); }, 900 + n * 70); }

    // Help row.
    var help = FF.ui.div('cw-help');
    play.appendChild(help);

    // Typing: our keyboard, or a hidden input for the phone's.
    var input = null, kb = null;
    var device = opts.keyboard === 'device';
    var kbHost = FF.ui.div('cw-kbhost');
    play.appendChild(kbHost);
    if (device) {
      input = FF.ui.el('input', { type: 'text', class: 'cw-input', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', 'aria-label': t('cwTypeHere', 'Type a letter') });
      input.addEventListener('input', function () {
        var v = (input.value || '').toUpperCase().replace(/[^A-Z]/g, '');
        input.value = '';
        if (v) opts.onType(v.charAt(v.length - 1));
      });
      play.appendChild(input);
      kbHost.appendChild(FF.ui.el('p', { class: 'cw-note cw-note--tap' }, t('cwTapToType', 'Tap a square to bring up your keyboard')));
    } else {
      kb = FF.CrosswordKeyboard.create({
        onKey: function (ch) { opts.onType(ch); },
        onBack: function () { opts.onBack(); },
        onPrev: function () { api.audio.play('tap'); opts.onClue(-1); },
        onNext: function () { api.audio.play('tap'); opts.onClue(1); },
        onFlip: function () { opts.onFlip(); }
      });
      kbHost.appendChild(kb.el);
    }

    // Clue lists (beside the grid on wide screens, a sheet on phones).
    var lists = {};
    var sideHead = FF.ui.div('cw-side__head');
    sideHead.appendChild(FF.ui.el('h2', { class: 'cw-h' }, t('cwClues', 'Clues')));
    sideHead.appendChild(btn('cw-iconbtn cw-side__close', '', 'close', function () { side.classList.remove('is-open'); }, t('close', 'Close')));
    side.appendChild(sideHead);
    var cols = FF.ui.div('cw-side__cols');
    ['across', 'down'].forEach(function (dir) {
      var col = FF.ui.div('cw-list');
      col.appendChild(FF.ui.el('h3', { class: 'cw-list__h' }, dirName(dir)));
      var ol = FF.ui.el('ol', { class: 'cw-list__items' });
      built.words.filter(function (w) { return w.dir === dir; }).forEach(function (w) {
        var li = FF.ui.el('li', { class: 'cw-list__item' });
        var b = FF.ui.el('button', { type: 'button', class: 'cw-list__btn' });
        b.appendChild(FF.ui.span('cw-list__num', String(w.num)));
        b.appendChild(FF.ui.span('cw-list__clue', w.clue + ' (' + w.len + ')'));
        b.addEventListener('click', function () { api.audio.play('tap'); side.classList.remove('is-open'); opts.onWord(w.id); });
        li.appendChild(b);
        ol.appendChild(li);
        lists[w.id] = li;
      });
      col.appendChild(ol);
      cols.appendChild(col);
    });
    side.appendChild(cols);
    var cluesBtn = btn('cw-iconbtn cw-clues-btn', '', 'list', function () { api.audio.play('tap'); side.classList.add('is-open'); }, t('cwShowClues', 'Show all clues'));
    f.tools.insertBefore(cluesBtn, f.tools.firstChild);

    var shown = { sel: null, dir: null, word: null };
    function setSelection(sel, dir) {
      var w = C.wordAt(built, sel, dir);
      var cross = w ? C.wordAt(built, sel, w.dir === 'across' ? 'down' : 'across') : null;
      if (cross && cross.id === (w && w.id)) cross = null;
      Object.keys(cells).forEach(function (k) { cells[k].el.classList.remove('is-word', 'is-cross', 'is-sel'); });
      if (cross) cross.cells.forEach(function (rc) { cells[keyOf(rc[0], rc[1])].el.classList.add('is-cross'); });
      if (w) w.cells.forEach(function (rc) { cells[keyOf(rc[0], rc[1])].el.classList.add('is-word'); });
      var here = cells[keyOf(sel.r, sel.c)];
      if (here) here.el.classList.add('is-sel');
      cursor.style.transform = 'translate(' + (sel.c * 100) + '%, ' + (sel.r * 100) + '%)';
      grid.classList.add('has-cursor');
      if (w && (!shown.word || shown.word !== w.id)) {
        tagEl.textContent = w.num + ' ' + dirName(w.dir);
        textEl.textContent = '';
        textEl.appendChild(document.createTextNode(w.clue + ' '));
        textEl.appendChild(FF.ui.span('cw-clue__len', '(' + w.len + ')'));
        if (animationsOn()) restart(body, 'is-in');
        Object.keys(lists).forEach(function (id) { lists[id].classList.toggle('is-active', id === w.id); });
        if (lists[w.id] && lists[w.id].scrollIntoView && window.innerWidth >= 900) { try { lists[w.id].scrollIntoView({ block: 'nearest' }); } catch (e) { /* old browser */ } }
      }
      shown = { sel: sel, dir: dir, word: w ? w.id : null };
      return w;
    }

    function setLetter(r, c, ch, how) {
      var x = cells[keyOf(r, c)];
      if (!x) return;
      x.ch.textContent = ch || '';
      x.el.classList.toggle('is-filled', !!ch);
      if (!ch) { x.el.classList.remove('is-wrong', 'is-revealed'); return; }
      if (!animationsOn()) return;
      if (how === 'reveal') restart(x.tile, 'is-flip');
      else if (how !== 'quiet') restart(x.tile, 'is-pop');
    }
    function setWrong(r, c, on) {
      var x = cells[keyOf(r, c)];
      if (!x) return;
      x.el.classList.toggle('is-wrong', !!on);
      if (on && animationsOn()) restart(x.tile, 'is-shake');
    }
    function setRevealed(r, c) { var x = cells[keyOf(r, c)]; if (x) x.el.classList.add('is-revealed'); }
    function setTint(r, c, color) { var x = cells[keyOf(r, c)]; if (x) { if (color) x.tile.style.setProperty('--ink', color); else x.tile.style.removeProperty('--ink'); } }
    function solveWord(id) {
      var w = words[id];
      if (!w) return;
      if (lists[id]) lists[id].classList.add('is-done');
      w.cells.forEach(function (rc, i) {
        var x = cells[keyOf(rc[0], rc[1])];
        x.el.classList.add('is-solved');
        if (animationsOn()) { x.tile.style.setProperty('--i', String(i)); restart(x.tile, 'is-sweep'); }
      });
    }
    function unsolveWord(id) {
      var w = words[id];
      if (!w) return;
      if (lists[id]) lists[id].classList.remove('is-done');
      w.cells.forEach(function (rc) { cells[keyOf(rc[0], rc[1])].el.classList.remove('is-solved'); });
    }
    function ripple(from) {
      if (!animationsOn()) { grid.classList.add('is-done'); return; }
      Object.keys(cells).forEach(function (k) {
        var p = k.split(',').map(Number);
        var d = Math.abs(p[0] - from.r) + Math.abs(p[1] - from.c);
        cells[k].tile.style.setProperty('--rd', String(d));
        restart(cells[k].tile, 'is-ripple');
      });
      grid.classList.add('is-done');
    }
    function setHelp(list) {
      FF.ui.clear(help);
      list.forEach(function (h) {
        var b = btn('cw-helpbtn' + (h.cls ? ' ' + h.cls : ''), h.label, h.icon, h.fn, h.aria);
        if (h.cost) b.appendChild(FF.ui.span('cw-helpbtn__cost', h.cost));
        if (h.disabled) b.disabled = true;
        help.appendChild(b);
      });
    }

    // Phones: the grid takes the height the bars and keyboard leave.
    function fit() {
      if (!f.root.isConnected) return;
      var scroller = f.root.closest ? f.root.closest('.game-shell__content') : null;
      var rootTop = f.root.getBoundingClientRect().top + (scroller ? scroller.scrollTop : 0);
      var cs = window.getComputedStyle(f.root);
      var ps = window.getComputedStyle(play);
      var gap = parseFloat(ps.rowGap) || 0;
      var wide = window.innerWidth >= 900;
      var used = rootTop + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
        f.top.offsetHeight + (parseFloat(window.getComputedStyle(f.top).marginBottom) || 0) +
        clue.offsetHeight + help.offsetHeight + kbHost.offsetHeight + gap * 4;
      var byHeight = window.innerHeight - used;
      var size = Math.floor(Math.max(220, Math.min(play.clientWidth, byHeight, wide ? 620 : 560)));
      grid.style.setProperty('--size', size + 'px');
    }
    function onResize() { if (!f.root.isConnected) { window.removeEventListener('resize', onResize); return; } fit(); }
    window.addEventListener('resize', onResize);
    setTimeout(fit, 0);

    return {
      built: built, words: words, cells: cells, grid: grid, play: play, side: side, help: help, kb: kb,
      setSelection: setSelection, setLetter: setLetter, setWrong: setWrong, setRevealed: setRevealed, setTint: setTint,
      solveWord: solveWord, unsolveWord: unsolveWord, ripple: ripple, setHelp: setHelp, fit: fit,
      focusInput: function () { if (input) { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } } },
      lock: function (on) { f.root.classList.toggle('cw--locked', !!on); if (kb) kb.setDisabled(on); }
    };
  }

  /* Physical keyboard: letters, Backspace, arrows, Tab, Space, Enter. Returns a remover.
     Capture phase, and the keys we use stop there: Backspace and the arrows mean "back" and
     "move focus" everywhere else in the app. */
  function keys(root, h) {
    function onKey(e) {
      if (!root.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.ff-dialog')) return;
      var tag = e.target && e.target.tagName;
      var inOurInput = e.target && e.target.classList && e.target.classList.contains('cw-input');
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && !inOurInput) return;
      var k = e.key, mine = true;
      if (/^[a-zA-Z]$/.test(k)) h.type(k.toUpperCase());
      else if (k === 'Backspace' || k === 'Delete') h.back();
      else if (k === 'ArrowLeft') h.arrow(0, -1);
      else if (k === 'ArrowRight') h.arrow(0, 1);
      else if (k === 'ArrowUp') h.arrow(-1, 0);
      else if (k === 'ArrowDown') h.arrow(1, 0);
      else if (k === 'Tab') h.clue(e.shiftKey ? -1 : 1);
      else if (k === 'Enter' && !(tag === 'BUTTON')) h.clue(1);
      else if (k === ' ' && tag !== 'BUTTON') h.flip();
      else mine = false;
      if (mine) { e.preventDefault(); e.stopPropagation(); }
    }
    document.addEventListener('keydown', onKey, true);
    return function () { document.removeEventListener('keydown', onKey, true); };
  }

  /* ================= solo, take turns, everyone together ================= */

  /* fixedId: a friend's challenge names its exact puzzle. */
  function play(api, cfg, seed, run, fixedId) {
    cfg = R.sanitize(cfg);
    run = run || { solved: 0 };
    var config = api.config;
    // The daily puzzle is the same for everyone. Any other run gets a puzzle this device has not
    // seen yet; a run that may become a challenge records which one, so the friend gets it too.
    var fixed = !!config.daily || !!config.challenge;
    var shared = fixed || !!config.sharedDeal;   // no "Next puzzle": one puzzle is the whole run
    var puzzle = fixedId ? FF.data.crosswords.filter(function (p) { return p.id === fixedId; })[0] : null;
    if (puzzle) cfg = R.sanitize({ level: puzzle.level, pack: puzzle.pack, checking: cfg.checking });
    else puzzle = R.pick(FF.data.crosswords, Object.assign({}, cfg, { sharedDeal: fixed }), seed, fixed ? null : seenIds());
    if (!puzzle) { setupScreen(api, function (c) { play(api, c, Math.floor(rand0() * 4294967296), run); }); return; }
    if (!fixed) markSeen(puzzle.id);
    if (config.challengeSeed && !config.challenge) config.dealOptions = { puzzle: puzzle.id, checking: cfg.checking };
    var scorers = scorerList(config);
    var mode = config.mode === 'turn' && scorers.length > 1 ? 'turn' : (config.mode === 'everyone' && scorers.length > 1 ? 'everyone' : 'solo');
    var expert = cfg.checking === 'expert';
    var keyboard = store().get(KB_KEY, 'builtin') === 'device' ? 'device' : 'builtin';
    var rows = puzzle.rows;

    var f = frame(api, 'cw--play' + (expert ? ' cw--expert' : ''));
    var timerChip = chip('0:00', 'cw-chip--time', 'clock');
    var stars = starsChip();
    f.chips.appendChild(timerChip);
    f.chips.appendChild(stars.el);
    f.chips.appendChild(chip(packName(puzzle.pack) + ' · ' + levelName(cfg.level), 'cw-chip--pack', PACK[puzzle.pack] ? PACK[puzzle.pack][2] : 'dice'));

    var filled = {};          // 'r,c' -> letter
    var wrong = {};           // 'r,c' -> true (marked wrong)
    var fixed = {};           // 'r,c' -> true (part of a solved word or revealed)
    var solved = {};          // wordId -> true
    var completer = {};       // wordId -> player id (take turns, Expert)
    var help = { letter: 0, word: 0, check: 0 };
    var sel = { r: 0, c: 0 }, dir = 'across';
    var started = Date.now();
    var done = false, locked = false;
    var turns = mode === 'turn' ? { order: scorers.map(function (e) { return e.id; }), cur: 0, points: {} } : null;
    var strip = null;

    var B = board(api, f, puzzle, {
      keyboard: keyboard,
      onType: function (ch) { type(ch); },
      onBack: function () { back(); },
      onClue: function (step) { var w = C.wordAt(B.built, sel, dir); go(C.nextClue(B.built, filled, w ? w.id : null, step)); },
      onFlip: function () { flip(); },
      onSelect: function (r, c) { tapCell(r, c); },
      onWord: function (id) { var w = B.words[id]; go(startOf(w)); }
    });
    var built = B.built;
    var first = built.words[0];
    if (first) { sel = { r: first.r, c: first.c }; dir = first.dir; }
    if (mode === 'turn') { strip = turnStrip(); f.main.insertBefore(strip.el, f.main.firstChild); strip.draw(); }
    drawHelp();
    B.setSelection(sel, dir);
    var unkeys = keys(f.root, {
      type: function (ch) { type(ch); }, back: function () { back(); }, flip: function () { flip(); },
      clue: function (s) { var w = C.wordAt(built, sel, dir); go(C.nextClue(built, filled, w ? w.id : null, s)); },
      arrow: function (dr, dc) { arrow(dr, dc); }
    });
    var tick = setInterval(function () {
      if (!f.root.isConnected) { clearInterval(tick); unkeys(); return; }
      if (!done) timerChip.text.textContent = clock(Date.now() - started);
    }, 250);

    function entity() { return turns ? scorers[turns.cur] : scorers[0]; }
    function startOf(w) {
      for (var i = 0; i < w.cells.length; i++) if (!filled[keyOf(w.cells[i][0], w.cells[i][1])]) return { r: w.cells[i][0], c: w.cells[i][1], dir: w.dir };
      return { r: w.r, c: w.c, dir: w.dir };
    }
    function go(p) {
      if (!p) return;
      sel = { r: p.r, c: p.c };
      if (p.dir) dir = p.dir;
      B.setSelection(sel, dir);
    }
    function flip() {
      var other = dir === 'across' ? 'down' : 'across';
      var at = built.at[keyOf(sel.r, sel.c)];
      if (at && at[other]) { dir = other; api.audio.play('flip'); B.setSelection(sel, dir); }
    }
    function tapCell(r, c) {
      if (locked) return;
      if (r === sel.r && c === sel.c) flip();
      else {
        var at = built.at[keyOf(r, c)];
        sel = { r: r, c: c };
        if (at && !at[dir]) dir = dir === 'across' ? 'down' : 'across';
        api.audio.play('tap');
        B.setSelection(sel, dir);
      }
      B.focusInput();
    }
    function arrow(dr, dc) {
      var want = dr ? 'down' : 'across';
      if (want !== dir) { var at = built.at[keyOf(sel.r, sel.c)]; if (at && at[want]) { dir = want; B.setSelection(sel, dir); return; } }
      var r = sel.r + dr, c = sel.c + dc;
      while (r >= 0 && c >= 0 && r < built.size && c < built.size) {
        if (!built.block[r][c]) { sel = { r: r, c: c }; B.setSelection(sel, dir); return; }
        r += dr; c += dc;
      }
    }
    function wordsAt(r, c) {
      var at = built.at[keyOf(r, c)] || {};
      return [at.across, at.down].filter(Boolean).map(function (id) { return B.words[id]; });
    }
    function wordFull(w) { return w.cells.every(function (rc) { return filled[keyOf(rc[0], rc[1])]; }); }
    function wordRight(w) { return w.cells.every(function (rc) { return filled[keyOf(rc[0], rc[1])] === rows[rc[0]].charAt(rc[1]); }); }

    function type(ch) {
      if (done || locked) return;
      var k = keyOf(sel.r, sel.c);
      if (fixed[k]) { go(C.next(built, filled, sel, dir)); return; }
      filled[k] = ch;
      var right = rows[sel.r].charAt(sel.c) === ch;
      B.setLetter(sel.r, sel.c, ch);
      if (!expert) {
        if (wrong[k] && right) { delete wrong[k]; B.setWrong(sel.r, sel.c, false); }
        if (!right) { wrong[k] = true; B.setWrong(sel.r, sel.c, true); api.audio.play('wrong'); }
        else api.audio.play('tick');
      } else {
        // Expert: a new letter clears the old red mark, right or not (no hints until Check grid).
        if (wrong[k]) { delete wrong[k]; B.setWrong(sel.r, sel.c, false); }
        api.audio.play('tick');
      }
      var here = { r: sel.r, c: sel.c };
      var finishedWord = null;
      wordsAt(here.r, here.c).forEach(function (w) {
        if (solved[w.id] || !wordFull(w)) return;
        if (!expert && wordRight(w)) { markSolved(w); finishedWord = w; }
        if (expert && !completer[w.id]) { completer[w.id] = entity().id; finishedWord = finishedWord || w; }
      });
      if (!expert && !right && turns) { endTurn(null); }
      else if (turns && finishedWord) { endTurn(finishedWord); }
      if (!expert && allSolved()) { finish(here); return; }
      if (expert) drawHelp();
      go(C.next(built, filled, here, dir));
    }
    function back() {
      if (done || locked) return;
      var k = keyOf(sel.r, sel.c);
      if (filled[k] && !fixed[k]) { clearCell(sel.r, sel.c); api.audio.play('tap'); return; }
      var p = C.prev(built, filled, sel, dir);
      go(p);
      var k2 = keyOf(p.r, p.c);
      if (filled[k2] && !fixed[k2]) { clearCell(p.r, p.c); api.audio.play('tap'); }
    }
    function clearCell(r, c) {
      var k = keyOf(r, c);
      delete filled[k]; delete wrong[k];
      B.setLetter(r, c, '');
      wordsAt(r, c).forEach(function (w) { if (completer[w.id]) delete completer[w.id]; });
      if (expert) drawHelp();
    }
    function markSolved(w) {
      solved[w.id] = true;
      w.cells.forEach(function (rc) { fixed[keyOf(rc[0], rc[1])] = true; });
      B.solveWord(w.id);
      api.audio.play('correct');
    }
    function allSolved() { return built.words.every(function (w) { return solved[w.id]; }); }
    function allFilled() { return Object.keys(B.cells).every(function (k) { return filled[k]; }); }

    /* ---- take turns ---- */
    function wordPoints(w) { return w.len * WORD_PTS[cfg.level] * (expert ? 1.5 : 1); }
    function endTurn(w) {
      var who = entity();
      if (w && !expert) {
        var pts = Math.round(wordPoints(w));
        api.scoring.add(who.id, pts, { correct: true });
        api.shell.updateScores(who.id);
        turns = FF.CrosswordTurns.afterWord(turns, w.id, who.id, pts);
      } else turns = FF.CrosswordTurns.afterWrong(turns);
      if (done || allSolved()) return;
      strip.draw();
      passCard(entity());
    }
    function turnStrip() {
      var el = FF.ui.el('div', { class: 'cw-turns', role: 'list' });
      return {
        el: el,
        draw: function () {
          FF.ui.clear(el);
          scorers.forEach(function (e, i) {
            var li = FF.ui.el('div', { class: 'cw-turn' + (i === turns.cur ? ' is-now' : ''), role: 'listitem' });
            var ava = FF.ui.span('cw-turn__ava');
            ava.appendChild(FF.Players.avatarEl(e, ''));
            li.appendChild(ava);
            li.appendChild(FF.ui.span('cw-turn__name', e.name || t('playerLabel', 'Player')));
            li.appendChild(FF.ui.span('cw-turn__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
            el.appendChild(li);
          });
        }
      };
    }
    function passCard(next) {
      locked = true;
      B.lock(true);
      var card = FF.ui.div('cw-pass');
      var box = FF.ui.div('cw-pass__box');
      var ava = FF.ui.span('cw-pass__ava');
      ava.appendChild(FF.Players.avatarEl(next, ''));
      box.appendChild(ava);
      box.appendChild(FF.ui.el('p', { class: 'cw-pass__title' }, t('cwPassTo', 'Pass to {name}', { name: next.name || t('playerLabel', 'Player') })));
      box.appendChild(FF.ui.el('p', { class: 'cw-note' }, t('cwOneWord', 'Solve one word, then pass it on.')));
      var ok = btn('cw-btn cw-btn--go', t('cwReady', "I'm ready"), 'play', function () {
        api.audio.play('select');
        card.classList.add('is-leaving');
        setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 220);
        locked = false;
        B.lock(false);
        B.focusInput();
      });
      box.appendChild(ok);
      card.appendChild(box);
      f.root.appendChild(card);
      api.audio.play('whoosh');
      if (FF.Nav && FF.Nav.focus) setTimeout(function () { if (ok.isConnected) FF.Nav.focus(ok); }, 50);
    }

    /* ---- help ---- */
    function starsNow() { return R.score({ level: cfg.level, ms: 0, help: help, expert: expert }).stars; }
    function drawHelp() {
      var list = [
        { label: t('cwRevealLetter', 'Letter'), icon: 'letter', cost: '-10', aria: t('cwRevealLetterAria', 'Reveal this letter (costs 10 points)'), fn: revealLetter },
        { label: t('cwRevealWord', 'Word'), icon: 'word', cost: '-30', aria: t('cwRevealWordAria', 'Reveal this word (costs 30 points)'), fn: revealWord }
      ];
      if (expert) list.push({ label: t('cwCheckGrid', 'Check grid'), icon: 'check', cls: 'cw-helpbtn--check' + (allFilled() ? ' is-ready' : ''), cost: allFilled() ? '' : '-15', aria: t('cwCheckGridAria', 'Check the whole grid'), fn: checkGrid });
      else list.push({ label: t('cwClearWrong', 'Clear wrong'), icon: 'eraser', aria: t('cwClearWrongAria', 'Clear the red letters'), fn: clearWrong, disabled: !Object.keys(wrong).length });
      B.setHelp(list);
      stars.set(starsNow());
    }
    function revealAt(r, c) {
      var k = keyOf(r, c);
      var ch = rows[r].charAt(c);
      filled[k] = ch; delete wrong[k]; fixed[k] = true;
      B.setWrong(r, c, false);
      B.setLetter(r, c, ch, 'reveal');
      B.setRevealed(r, c);
    }
    function afterReveal(cellsDone) {
      api.audio.play('flip');
      cellsDone.forEach(function (rc) {
        wordsAt(rc[0], rc[1]).forEach(function (w) {
          if (!solved[w.id] && wordFull(w) && wordRight(w) && !expert) markSolved(w);
          if (expert && wordFull(w) && !completer[w.id]) completer[w.id] = entity().id;
        });
      });
      drawHelp();
      if (!expert && allSolved()) { finish(sel); return; }
      if (expert && allFilled() && !Object.keys(B.cells).some(function (k) { var p = k.split(','); return filled[k] !== rows[+p[0]].charAt(+p[1]); })) { finish(sel); return; }
      go(C.next(built, filled, sel, dir));
    }
    function revealLetter() {
      if (done || locked) return;
      var k = keyOf(sel.r, sel.c);
      if (fixed[k]) { go(C.next(built, filled, sel, dir)); return; }
      help.letter++;
      revealAt(sel.r, sel.c);
      afterReveal([[sel.r, sel.c]]);
    }
    function revealWord() {
      if (done || locked) return;
      var w = C.wordAt(built, sel, dir);
      if (!w || solved[w.id]) return;
      help.word++;
      var list = [];
      w.cells.forEach(function (rc) { if (!fixed[keyOf(rc[0], rc[1])]) { revealAt(rc[0], rc[1]); list.push(rc); } });
      afterReveal(list);
    }
    function clearWrong() {
      Object.keys(wrong).forEach(function (k) { var p = k.split(',').map(Number); clearCell(p[0], p[1]); });
      wrong = {};
      api.audio.play('tap');
      drawHelp();
    }
    function checkGrid() {
      if (done || locked) return;
      var grid = rows.map(function (row, r) { return row.split('').map(function (ch, c) { return ch === '#' ? '#' : (filled[keyOf(r, c)] || '.'); }).join(''); });
      var bad = R.wrongCells(puzzle, grid);
      if (!bad.length) { finish(sel); return; }
      if (!allFilled()) help.check++;
      else if (bad.length) help.check++;
      bad.forEach(function (rc) { if (filled[keyOf(rc[0], rc[1])]) { wrong[keyOf(rc[0], rc[1])] = true; B.setWrong(rc[0], rc[1], true); } });
      api.audio.play('wrong');
      api.shell.toast && api.shell.toast(bad.length === 1 ? t('cwOneWrong', '1 square is not right yet') : t('cwNWrong', '{n} squares are not right yet', { n: bad.length }), 'hint');
      drawHelp();
    }

    /* ---- the end ---- */
    function finish(from) {
      if (done) return;
      done = true;
      var ms = Date.now() - started;
      unkeys();
      B.lock(true);
      B.ripple(from || sel);
      api.audio.play('winner');
      var res = R.score({ level: cfg.level, ms: ms, help: help, expert: expert });
      if (mode === 'turn') {
        if (expert) {
          built.words.forEach(function (w) {
            var who = completer[w.id];
            if (who && wordRight(w)) api.scoring.add(who, Math.round(wordPoints(w)), { correct: true });
          });
        }
      } else {
        scorers.forEach(function (e) { api.scoring.add(e.id, res.points, { correct: true }); });
      }
      api.shell.updateScores(entity().id);
      run.solved++;
      var bestMap = store().get(BEST_KEY, {}) || {};
      var bk = cfg.level + '|' + cfg.pack;
      var newBest = !bestMap[bk] || ms < bestMap[bk];
      if (newBest) { bestMap[bk] = ms; try { store().set(BEST_KEY, bestMap); } catch (e) { /* storage full */ } }
      setTimeout(function () { winCard(ms, res, newBest); }, animationsOn() ? 900 : 50);
    }

    function winCard(ms, res, newBest) {
      if (!f.root.isConnected) return;
      var card = FF.ui.div('cw-win');
      var box = FF.ui.el('div', { class: 'cw-win__box', role: 'dialog', 'aria-label': t('cwSolved', 'Solved!') });
      box.appendChild(FF.ui.el('p', { class: 'cw-win__kicker' }, packName(puzzle.pack) + ' · ' + levelName(cfg.level) + (expert ? ' · ' + t('cwExpert', 'Expert') : '')));
      box.appendChild(FF.ui.el('h2', { class: 'cw-win__title' }, t('cwSolved', 'Solved!')));
      var st = FF.ui.div('cw-win__stars');
      for (var i = 0; i < 3; i++) {
        var s = glyph('star', 'cw-win__star' + (i < res.stars ? ' is-on' : ''));
        s.style.setProperty('--i', String(i));
        st.appendChild(s);
      }
      box.appendChild(st);
      var stats = FF.ui.div('cw-win__stats');
      function stat(label, val) {
        var d = FF.ui.div('cw-stat');
        d.appendChild(FF.ui.span('cw-stat__label', label));
        var v = FF.ui.span('cw-stat__val', '');
        d.appendChild(v);
        stats.appendChild(d);
        return v;
      }
      var timeV = stat(t('cwTime', 'Time'), '');
      countUp(timeV, ms, 900, function (v) { return clock(v); });
      if (mode !== 'turn') countUp(stat(t('points', 'Points'), ''), res.points, 1100);
      else countUp(stat(t('cwWords', 'Words'), ''), built.words.length, 600);
      box.appendChild(stats);
      if (newBest) box.appendChild(FF.ui.el('p', { class: 'cw-win__best' }, t('cwNewBest', 'New best time!')));
      if (mode === 'turn') {
        var ol = FF.ui.el('ol', { class: 'cw-win__ranks' });
        scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, k) {
          var li = FF.ui.el('li', { class: k === 0 ? 'is-top' : '' });
          var ava = FF.ui.span('cw-turn__ava');
          ava.appendChild(FF.Players.avatarEl(e, ''));
          li.appendChild(ava);
          li.appendChild(FF.ui.span('cw-turn__name', e.name || t('playerLabel', 'Player')));
          li.appendChild(FF.ui.span('cw-turn__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
          ol.appendChild(li);
        });
        box.appendChild(ol);
      }
      var actions = FF.ui.div('cw-win__actions');
      if (!shared) {
        actions.appendChild(btn('cw-btn cw-btn--ghost', t('cwNextPuzzle', 'Next puzzle'), 'next', function () {
          api.audio.play('roundStart');
          play(api, cfg, Math.floor(rand0() * 4294967296), run);
        }));
      }
      var fin = btn('cw-btn cw-btn--go', t('seeResults', 'See results'), 'trophy', function () { api.audio.play('click'); end(); });
      actions.appendChild(fin);
      box.appendChild(actions);
      card.appendChild(box);
      f.root.appendChild(card);
      if (animationsOn() && FF.Confetti) FF.Confetti.burst(res.stars === 3 ? 140 : 80);
      if (FF.Nav && FF.Nav.focus) setTimeout(function () { if (fin.isConnected) FF.Nav.focus(fin); }, 300);
    }

    function end() {
      var r = api.scoring.results ? api.scoring.results() : null;
      api.end({ results: (r && r.results) || [], winnerId: r ? r.winnerId : null, quizCorrect: run.solved, quizAnswered: run.solved });
    }
  }

  /* ================= registration ================= */

  /* Online rooms: the host picks Race or Co-op on the lobby's settings card, and the server
     starts it (js/crossword/client.js, js/crossword/online.js). */
  function roomFields() {
    function opt(label, value) { return { label: label, value: value }; }
    var packs = ['mixed'].concat(R.PACKS.filter(function (x) { return x !== 'mixed'; }));
    return [
      { key: 'play', label: t('cwPlay', 'How to play'), options: [opt(t('cwRace', 'Race'), 'race'), opt(t('cwCoop', 'Co-op'), 'coop')] },
      { key: 'level', label: t('gcLevel', 'Level'), options: R.LEVELS.map(function (l) { return opt(levelName(l), l); }) },
      { key: 'pack', label: t('cwTheme', 'Theme'), options: packs.map(function (p) { return opt(packName(p), p); }) },
      { key: 'checking', label: t('cwChecking', 'Checking'), options: [opt(t('cwCheckOn', 'Words checked'), 'on'), opt(t('cwExpert', 'Expert'), 'expert')] }
    ];
  }
  function roomSummary(s) {
    var c = R.sanitize(s);
    return (c.play === 'coop' ? t('cwCoop', 'Co-op') : t('cwRace', 'Race')) + ' · ' + levelName(c.level) + ' · ' + packName(c.pack) +
      (c.checking === 'expert' ? ' · ' + t('cwExpert', 'Expert') : '');
  }
  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function () { return roomFields(); },
    sanitize: function (s) { return R.sanitize(s); },
    summary: function (s) { return roomSummary(s); },
    start: function (room, pick) { return FF.CrosswordApi.start(room, pick); }
  };

  FF.CrosswordGame = { board: board, frame: frame, keys: keys, chip: chip, glyph: glyph, btn: btn, packName: packName, levelName: levelName, clock: clock, animationsOn: animationsOn };

  FF.registerGame({
    id: 'miniCrossword',
    name: 'Mini Crossword',
    description: 'A proper crossword for the whole family: 200+ puzzles in themed packs, three levels, an Expert mode and races against the clock.',
    category: 'words',
    icon: '🧩',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 6,
    tags: ['spelling', 'puzzle', 'online'],
    modes: ['solo', 'turn', 'everyone'],
    defaultMode: 'solo',
    leaderboard: true,
    room: ROOM,
    howToPlay: [
      'Tap a square or a clue to choose a word. Tap the same square again, or the clue bar, to switch between Across and Down.',
      'Type with the game keyboard under the grid (or your own keyboard). Filled squares are skipped and the next clue follows on.',
      'Letters checked: right words glow gold, wrong letters turn red. Expert: nothing is checked until you press Check grid.',
      'Stuck? Reveal a letter or a word, for a few points and a star.',
      'Solve it fast and without help for three stars and the most points. Take turns: one word each, then pass the phone.',
      'Online: race everyone to finish the same puzzle, or solve one grid together in Co-op.'
    ],
    start: function (api) {
      if (!FF.data.crosswords || !FF.data.crosswords.length) { api.end({}); return; }
      var room = FF.Room && FF.Room.current();
      if (racingRoom(api) && room && FF.CrosswordOnline) { FF.CrosswordOnline.start(api, room); return; }
      var seed = Math.floor(rand0() * 4294967296);
      var ch = api.config.challenge;
      if (ch && ch.opts && ch.opts.puzzle) { play(api, { checking: ch.opts.checking || 'on' }, seed, null, ch.opts.puzzle); return; }
      if (api.config.daily || ch) { play(api, R.STANDARD, seed); return; }
      setupScreen(api, function (cfg) { play(api, cfg, seed); });
    }
  });
})();
