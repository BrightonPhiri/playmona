/* ============================================================
   PLAYMONA — games/geoSpin.js
   GeoSpin: spin the world, spot the country, claim the crown.
   A 3D globe spins, slows and lands on a country, which lights up
   in gold. Spell its name with letter tiles before the time runs out.

   - Rules: js/geospin/rules.js (FF.GeoSpinRules), shared with the referee.
   - Globe: js/geospin/globe.js (Three.js, or a canvas globe without WebGL).
   - Solo and pass and play: a setup screen (level, region), hints that
     cost points, a reveal after every country and a recap at the end.
   - Daily and friend challenges: the standard settings on a shared deal.
   - Online rooms: the server's referee (js/geospin/referee.js) picks the
     countries, checks every answer and scores; this phone shows its view
     (FF.GeoSpinClient) and never decides a result. No hints online.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.GeoSpinRules;
  var SETUP_KEY = 'geoSpin:setup';
  var SEEN_KEY = 'geoSpinSeen';
  var SEEN_MAX = 300;
  var AUTO_SCORES_MS = 90000;
  var NUDGE_MS = 8000;

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }
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
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function flagPath(code) { return 'assets/flags/' + code + '.svg'; }

  function levelName(l) {
    return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : l === 'expert' ? t('expert', 'Expert') : t('normal', 'Normal');
  }
  function regionName(id) {
    if (id === 'world') return t('gsWorld', 'Whole world');
    var r = (FF.data.worldFlags.regions || []).filter(function (x) { return x.id === id; })[0];
    return t('gcRegion_' + id, r ? r.name : id);
  }
  function summary(s) {
    var c = R.sanitize(s);
    return [levelName(c.level), regionName(c.region), t('gsSecs', '{n} s a country', { n: R.secondsFor(c.level) })].join(' · ');
  }

  /* Small inline drawings for the arcade buttons (stroke uses currentColor). */
  var GLYPHS = {
    soundOn: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    soundOff: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    musicOn: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    musicOff: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/><path d="M3 3l18 18"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    clear: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
    letter: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 16l3-8 3 8M10 13.5h4"/>',
    minus2: '<rect x="3" y="6" width="8" height="12" rx="2"/><rect x="13" y="6" width="8" height="12" rx="2"/><path d="M5 12h4M15 12h4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  };
  function glyph(name, cls) {
    var s = document.createElement('span');
    s.className = 'gs-glyph' + (cls ? ' ' + cls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[name] + '</svg>';
    return s;
  }

  /* ================= the globe, kept for the whole game ================= */

  var globeRun = null;   // { api, globe }
  function globeFor(api, host) {
    if (globeRun && globeRun.api !== api) { try { globeRun.globe.destroy(); } catch (e) { /* gone */ } globeRun = null; }
    if (!globeRun) globeRun = { api: api, globe: FF.GeoSpinGlobe.create(host) };
    else { host.appendChild(globeRun.globe.el); globeRun.globe.resume(); }
    watchGone(api);
    return globeRun.globe;
  }
  /* Let the GPU go once the game screen is gone (left, ended, another game). */
  var goneTimer = null;
  function watchGone(api) {
    if (goneTimer) return;
    var misses = 0;
    goneTimer = setInterval(function () {
      if (!globeRun) { clearInterval(goneTimer); goneTimer = null; return; }
      if (globeRun.globe.el.isConnected) { misses = 0; return; }
      if (++misses >= 2) {
        try { globeRun.globe.destroy(); } catch (e) { /* gone */ }
        globeRun = null;
        clearInterval(goneTimer); goneTimer = null;
      }
    }, 1500);
  }

  /* ================= arcade frame ================= */

  function soundButtons(api) {
    var wrap = FF.ui.div('gs-sound');
    function make(kind) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-iconbtn' });
      function sync() {
        var on = kind === 'fx' ? FF.Audio.effectsEnabled !== false : FF.Audio.musicEnabled !== false;
        FF.ui.clear(b);
        b.appendChild(glyph(kind === 'fx' ? (on ? 'soundOn' : 'soundOff') : (on ? 'musicOn' : 'musicOff')));
        var label = kind === 'fx' ? (on ? t('gsFxOff', 'Turn sound effects off') : t('gsFxOn', 'Turn sound effects on'))
          : (on ? t('gsMusicOff', 'Turn music off') : t('gsMusicOn', 'Turn music on'));
        b.setAttribute('aria-label', label);
        b.title = label;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('is-off', !on);
      }
      b.addEventListener('click', function () {
        if (kind === 'fx') { FF.Audio.setEffects(FF.Audio.effectsEnabled === false); if (FF.Audio.effectsEnabled) FF.Audio.play('tap'); }
        else FF.Audio.setMusic(FF.Audio.musicEnabled === false);
        sync();
      });
      sync();
      return b;
    }
    wrap.appendChild(make('fx'));
    wrap.appendChild(make('music'));
    return wrap;
  }

  /* The countdown ring (seconds in the middle, a draining gold arc). */
  function timerRing() {
    var el = FF.ui.div('gs-timer');
    el.setAttribute('role', 'timer');
    el.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="gs-timer__track" cx="50" cy="50" r="44"/>' +
      '<circle class="gs-timer__arc" cx="50" cy="50" r="44" pathLength="100"/></svg>';
    var num = FF.ui.span('gs-timer__num', '');
    el.appendChild(num);
    var arc = el.querySelector('.gs-timer__arc');
    return {
      el: el,
      set: function (rem, total) {
        var r = Math.max(0, rem);
        var s = Math.ceil(r);
        num.textContent = '00:' + (s < 10 ? '0' : '') + s;
        var p = total ? Math.max(0, Math.min(1, r / total)) : 0;
        if (arc) arc.style.strokeDashoffset = String(100 - p * 100);
        el.classList.toggle('is-low', r <= 5 && r > 0);
        el.setAttribute('aria-label', t('secondsLeft', '{n} seconds left', { n: s }));
      },
      idle: function () { num.textContent = '--'; if (arc) arc.style.strokeDashoffset = '0'; el.classList.remove('is-low'); }
    };
  }

  /* The screen: brand and controls on top, side panel, the globe, and the answer panel. */
  function frame(api, opts) {
    opts = opts || {};
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('gs-shell');
    var gs = FF.ui.div('gs' + (opts.className ? ' ' + opts.className : ''));
    var top = FF.ui.div('gs-top');
    var brand = FF.ui.div('gs-brand');
    brand.appendChild(FF.ui.span('gs-brand__geo', 'Geo'));
    brand.appendChild(FF.ui.span('gs-brand__spin', 'Spin'));
    top.appendChild(brand);
    var chips = FF.ui.div('gs-chips');
    top.appendChild(chips);
    top.appendChild(soundButtons(api));
    gs.appendChild(top);

    var main = FF.ui.div('gs-main');
    var side = FF.ui.div('gs-side');
    var stage = FF.ui.div('gs-stage');
    var globeHost = FF.ui.div('gs-globe-host');
    stage.appendChild(globeHost);
    var pedestal = FF.ui.div('gs-pedestal');
    pedestal.setAttribute('aria-hidden', 'true');
    stage.appendChild(pedestal);
    var panel = FF.ui.div('gs-panel');
    main.appendChild(side);
    main.appendChild(stage);
    main.appendChild(panel);
    gs.appendChild(main);
    root.appendChild(gs);
    var globe = globeFor(api, globeHost);
    return { root: gs, top: top, chips: chips, side: side, stage: stage, panel: panel, globe: globe };
  }

  function chip(text, cls, icon) {
    var c = FF.ui.span('gs-chip' + (cls ? ' ' + cls : ''));
    if (icon) c.appendChild(glyph(icon));
    c.appendChild(FF.ui.span('', text));
    return c;
  }
  function levelChip(level) {
    var c = FF.ui.span('gs-chip gs-chip--level gs-lv-' + level);
    var bars = FF.ui.span('gs-bars');
    bars.setAttribute('aria-hidden', 'true');
    var n = R.LEVELS.indexOf(level) + 1;
    for (var i = 1; i <= 4; i++) bars.appendChild(FF.ui.span(i <= n ? 'is-on' : ''));
    c.appendChild(bars);
    c.appendChild(FF.ui.span('', levelName(level)));
    return c;
  }

  /* Animated number (score counters, points earned). */
  function countUp(el, from, to, ms) {
    if (!animationsOn() || from === to) { el.textContent = FF.util.formatNumber(to); return; }
    var start = Date.now();
    function tick() {
      var p = Math.min(1, (Date.now() - start) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = FF.util.formatNumber(Math.round(from + (to - from) * e));
      if (p < 1 && el.isConnected) setTimeout(tick, 30);
    }
    tick();
  }

  /* ================= the letter board ================= */

  /* Answer slots and a tray of 3D letter tiles. Tap a tile to send it to the next
     empty slot; tap a filled slot to send it back. Undo, Clear and Submit; Submit
     works with letters missing (the checker forgives small mistakes). Hints (solo
     only) can lock a right letter in place or take two spare letters away.
     Keyboard: type the letters, Backspace undoes, Enter submits. */
  function letterBoard(api, round, opts) {
    opts = opts || {};
    var el = FF.ui.div('gs-board is-waiting');
    var slotsRow = FF.ui.el('div', { class: 'gs-slots', role: 'group', 'aria-label': t('gcYourAnswer', 'Your answer') });
    var word = FF.ui.div('gs-word');
    slotsRow.appendChild(word);
    var slots = [];
    var wantAt = round.letters;
    round.cells.forEach(function (c) {
      if (c.gap) { word = FF.ui.div('gs-word'); slotsRow.appendChild(word); return; }
      if (c.fixed) { word.appendChild(FF.ui.span('gs-slot gs-slot--mark', c.ch)); return; }
      var b = FF.ui.el('button', { type: 'button', class: 'gs-slot', 'aria-label': t('gcEmptySlot', 'Empty') });
      var s = { el: b, tile: null, want: c.ch, i: slots.length, locked: false };
      b.addEventListener('click', function () { unplace(s, true); });
      word.appendChild(b);
      slots.push(s);
    });
    var longest = 0;
    round.cells.reduce(function (n, c) { var m = c.gap ? 0 : n + 1; longest = Math.max(longest, m); return m; }, 0);
    slotsRow.style.setProperty('--gs-longest', String(Math.max(longest, 7)));
    el.appendChild(slotsRow);

    var tray = FF.ui.el('div', { class: 'gs-tiles', role: 'group', 'aria-label': t('gcLetters', 'Letters') });
    var perRow = round.tiles.length <= 10 ? 5 : round.tiles.length <= 18 ? 6 : round.tiles.length <= 28 ? 7 : 8;
    tray.style.setProperty('--gs-cols', String(perRow));
    var tiles = round.tiles.map(function (ch, i) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-tile' });
      b.appendChild(FF.ui.span('gs-tile__face', ch));
      if (!reduceMotion()) b.style.animationDelay = (i * 0.025).toFixed(3) + 's';
      var tile = { el: b, ch: ch, i: i, used: false, gone: false };
      b.addEventListener('click', function () { place(tile); });
      tray.appendChild(b);
      return tile;
    });
    el.appendChild(tray);

    var tools = FF.ui.div('gs-actions');
    function actionBtn(label, icon, cls, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-btn ' + cls });
      b.appendChild(glyph(icon));
      b.appendChild(FF.ui.span('', label));
      b.addEventListener('click', fn);
      return b;
    }
    var undoBtn = actionBtn(t('gcUndo', 'Undo'), 'undo', 'gs-btn--blue', function () { undo(); });
    var clearBtn = actionBtn(t('gcClear', 'Clear'), 'clear', 'gs-btn--blue', function () { clear(); });
    var submitBtn = actionBtn(t('gsSubmit', 'Submit'), 'check', 'gs-btn--go', function () { submit(); });
    tools.appendChild(undoBtn);
    tools.appendChild(clearBtn);
    tools.appendChild(submitBtn);
    el.appendChild(tools);

    var history = [];
    var locked = false, open = false;
    var still = reduceMotion();
    var used = { letter: 0, remove: 0, continent: 0 };

    function firstEmpty() {
      for (var i = 0; i < slots.length; i++) if (!slots[i].tile) return slots[i];
      return null;
    }
    function place(tile, into, quiet) {
      if (locked || !open || tile.used || tile.gone) return;
      var s = into || firstEmpty();
      if (!s) { shake(slotsRow); return; }
      tile.used = true;
      s.tile = tile;
      if (!into) history.push(s);
      fly(tile.el, s);
      draw();
      if (!quiet) api.audio.play('tap');
      if (opts.onChange) opts.onChange();
    }
    function unplace(s, sound) {
      if (locked || !s.tile || s.locked) return;
      s.tile.used = false;
      var back = s.tile.el;
      s.tile = null;
      history = history.filter(function (x) { return x !== s; });
      draw();
      if (!still) { back.classList.remove('is-back'); void back.offsetWidth; back.classList.add('is-back'); }
      if (sound) api.audio.play('flip');
      if (opts.onChange) opts.onChange();
    }
    function undo() {
      for (var i = history.length - 1; i >= 0; i--) if (!history[i].locked) { unplace(history[i], true); return; }
    }
    function clear() {
      if (locked) return;
      var any = false;
      slots.forEach(function (s) { if (s.tile && !s.locked) { unplace(s, false); any = true; } });
      if (any) api.audio.play('flip');
    }
    function text() { return R.spelled(round.cells, slots.map(function (s) { return s.tile ? s.tile.ch : ''; })); }
    function filled() { return slots.filter(function (s) { return s.tile; }).length; }
    function submit() {
      if (locked || !open) return;
      if (!filled()) { shake(slotsRow); return; }
      if (opts.onSubmit) opts.onSubmit(text());
    }
    function shake(node) { node.classList.remove('is-shake'); void node.offsetWidth; node.classList.add('is-shake'); }

    /* The letter flies from its tile to its slot. */
    function fly(from, s) {
      if (still || !from.getBoundingClientRect) { s.el.classList.add('is-landed'); return; }
      var a = from.getBoundingClientRect(), b = s.el.getBoundingClientRect();
      if (!a.width || !b.width) { s.el.classList.add('is-landed'); return; }
      var ghost = FF.ui.span('gs-ghost', s.tile.ch);
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
        s.el.classList.remove('is-incoming', 'is-landed');
        void s.el.offsetWidth;
        s.el.classList.add('is-landed');
      }, 240);
    }

    function draw() {
      slots.forEach(function (s) {
        s.el.textContent = s.tile ? s.tile.ch : '';
        s.el.classList.toggle('is-filled', !!s.tile);
        s.el.classList.toggle('is-locked', s.locked);
        if (!s.tile) s.el.classList.remove('is-incoming', 'is-landed');
        s.el.disabled = locked || !s.tile || s.locked;
        s.el.setAttribute('aria-label', s.locked ? t('gsHintLetter', 'Hint: {l}', { l: s.tile.ch })
          : s.tile ? t('gcTakeBack', 'Take back {l}', { l: s.tile.ch }) : t('gcEmptySlot', 'Empty'));
      });
      var next = firstEmpty();
      slots.forEach(function (s) { s.el.classList.toggle('is-next', open && !locked && s === next); });
      tiles.forEach(function (tl) {
        tl.el.classList.toggle('is-used', tl.used);
        tl.el.classList.toggle('is-gone', tl.gone);
        tl.el.disabled = locked || tl.used || tl.gone || !open;
        tl.el.setAttribute('aria-label', tl.gone ? t('gsRemoved', 'Removed') : tl.ch);
      });
      var free = history.some(function (s) { return !s.locked; });
      undoBtn.disabled = locked || !open || !free;
      clearBtn.disabled = locked || !open || !free;
      submitBtn.disabled = locked || !open || !filled();
      submitBtn.classList.toggle('is-ready', open && !locked && !firstEmpty());
    }

    function onKey(e) {
      if (locked || !document.body.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
      if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key || '';
      var mine = true;
      if (/^[a-z]$/i.test(k)) {
        var ch = k.toUpperCase(), hit = null;
        for (var i = 0; i < tiles.length && !hit; i++) if (!tiles[i].used && !tiles[i].gone && tiles[i].ch === ch) hit = tiles[i];
        if (hit) place(hit); else shake(tray);
      } else if (k === 'Backspace') undo();
      else if (k === 'Enter') submit();
      else mine = false;
      if (mine) { e.preventDefault(); e.stopPropagation(); }
    }
    // Capture phase: these keys belong to the tiles (Backspace is "back" everywhere else in the app).
    document.addEventListener('keydown', onKey, true);
    draw();

    /* ---- hints ---- */
    function hintLetter() {
      if (locked || !open) return false;
      var s = null;
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].locked) continue;
        if (!slots[i].tile || slots[i].tile.ch !== slots[i].want) { s = slots[i]; break; }
      }
      if (!s) return false;
      if (s.tile) unplace(s, false);
      var pick = null;
      tiles.forEach(function (tl) { if (!pick && !tl.used && !tl.gone && tl.ch === s.want) pick = tl; });
      if (!pick) {
        // The letter is sitting in a wrong slot: take it from there.
        slots.forEach(function (o) {
          if (!pick && o.tile && !o.locked && o.tile.ch === s.want && o.tile.ch !== o.want) { pick = o.tile; unplace(o, false); }
        });
      }
      if (!pick) return false;
      place(pick, s, true);
      s.locked = true;
      history = history.filter(function (x) { return x !== s; });
      used.letter++;
      draw();
      return true;
    }
    function hintRemove(rand) {
      if (locked || !open || used.remove) return false;
      var spare = R.spareTiles(round.tiles, round.letters).filter(function (i) { return !tiles[i].gone; });
      var go = R.shuffle(spare, rand).slice(0, R.REMOVE_N);
      if (!go.length) return false;
      go.forEach(function (i) {
        var tl = tiles[i];
        if (tl.used) slots.forEach(function (s) { if (s.tile === tl && !s.locked) unplace(s, false); });
        tl.gone = true;
      });
      used.remove = 1;
      draw();
      return true;
    }

    return {
      el: el,
      text: text,
      used: used,
      wantAt: wantAt,
      canHint: function (kind) {
        if (locked || !open) return false;
        if (kind === 'remove') return !used.remove && R.spareTiles(round.tiles, round.letters).some(function (i) { return !tiles[i].gone; });
        if (kind === 'letter') return slots.some(function (s) { return !s.locked && (!s.tile || s.tile.ch !== s.want); });
        return !used.continent;
      },
      hint: function (kind, rand) {
        if (kind === 'letter') return hintLetter();
        if (kind === 'remove') return hintRemove(rand);
        if (kind === 'continent' && !used.continent) { used.continent = 1; return true; }
        return false;
      },
      open: function () { open = true; el.classList.remove('is-waiting'); draw(); },
      lock: function () { locked = true; draw(); document.removeEventListener('keydown', onKey, true); },
      /* Show the right name in the slots: green where they had it right. */
      finish: function (correct) {
        locked = true; open = true;
        el.classList.remove('is-waiting');
        document.removeEventListener('keydown', onKey, true);
        draw();
        slots.forEach(function (s, i) {
          var had = s.tile ? s.tile.ch : '';
          s.el.textContent = s.want;
          s.el.classList.remove('is-incoming', 'is-next');
          s.el.classList.add(correct || had === s.want ? 'is-right' : 'is-wrong');
          if (!still) s.el.style.animationDelay = (i * 0.035).toFixed(3) + 's';
        });
        el.classList.add(correct ? 'is-correct' : 'is-missed');
      },
      destroy: function () { document.removeEventListener('keydown', onKey, true); }
    };
  }

  /* ================= the reveal card ================= */

  function revealCard(info) {
    var card = FF.ui.div('gs-reveal gs-reveal--' + info.state);
    var stamp = FF.ui.div('gs-stamp');
    stamp.textContent = info.state === 'good' ? t('gsCorrect', 'Correct!') : info.state === 'late' ? t('gsTimesUp', 'Time’s up!') : t('gsIncorrect', 'Incorrect');
    card.appendChild(stamp);
    var head = FF.ui.div('gs-reveal__head');
    head.appendChild(FF.ui.el('img', { class: 'gs-reveal__flag', src: flagPath(info.code), alt: t('gsFlagOf', 'Flag of {c}', { c: info.name }) }));
    var who = FF.ui.div('gs-reveal__who');
    who.appendChild(FF.ui.el('p', { class: 'gs-reveal__name' }, info.name));
    var c = R.countryOf(info.code) || {};
    who.appendChild(FF.ui.el('p', { class: 'gs-reveal__meta' }, [t('gcCapital', 'Capital: {c}', { c: c.capital || '' }), R.continentOf(info.code)].filter(Boolean).join(' · ')));
    head.appendChild(who);
    var pts = FF.ui.div('gs-reveal__pts');
    var num = FF.ui.span('gs-reveal__num', '0');
    pts.appendChild(FF.ui.span('gs-reveal__plus', '+'));
    pts.appendChild(num);
    pts.appendChild(FF.ui.span('gs-reveal__unit', t('gsPts', 'pts')));
    head.appendChild(pts);
    card.appendChild(head);
    if (info.said) card.appendChild(FF.ui.el('p', { class: 'gs-reveal__said' }, info.said));
    if (info.breakdown && info.points > 0) {
      var b = info.breakdown;
      var bits = [t('gsBase', '{n} for the country', { n: b.base })];
      if (b.speed) bits.push(t('gsSpeed', '+{n} speed', { n: b.speed }));
      if (b.mult > 1) bits.push(t('gsStreakX', '×{m} streak', { m: b.mult }));
      if (b.cost) bits.push(t('gsHintCost', '−{n} hints', { n: b.cost }));
      card.appendChild(FF.ui.el('p', { class: 'gs-reveal__break' }, bits.join(' · ')));
    }
    var fact = FF.data.geoSpinFacts && FF.data.geoSpinFacts[info.code];
    if (fact) {
      var f = FF.ui.div('gs-fact');
      f.appendChild(glyph('bulb'));
      f.appendChild(FF.ui.el('p', {}, fact));
      card.appendChild(f);
    }
    setTimeout(function () { countUp(num, 0, info.points || 0, 700); }, 250);
    return card;
  }

  /* What the player spelled, when it was wrong. */
  function saidLine(text, res) {
    if (!text) return '';
    if (res && res.near && FF.AnswerMatch.normalise(text) === FF.AnswerMatch.normalise(res.near)) return t('gcOtherCountry', '{o} is a different country.', { o: res.near });
    if (res && res.near) return t('gcTooNear', 'You spelled “{x}”, which is closer to {o}.', { x: text, o: res.near });
    return t('gcYouTyped', 'You spelled “{x}”.', { x: text });
  }

  /* ================= setup ================= */

  function setupScreen(api, onGo) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var saved = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var level = saved.level, region = saved.region;
    var f = frame(api, { className: 'gs--setup' });
    f.globe.idle();

    f.side.appendChild(FF.ui.el('p', { class: 'gs-tagline' }, [
      FF.ui.span('', t('gsTag1', 'Spin the world. ')), FF.ui.span('', t('gsTag2', 'Spot the country. ')), FF.ui.span('gs-gold', t('gsTag3', 'Claim the crown!'))
    ]));
    var how = FF.ui.el('ul', { class: 'gs-how' });
    [t('gsHow1', 'The globe spins and lands on a country.'), t('gsHow2', 'Spell its name with the letter tiles.'), t('gsHow3', 'Faster answers and streaks score more.')].forEach(function (x, i) {
      var li = FF.ui.el('li', {});
      li.appendChild(FF.ui.span('gs-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    f.side.appendChild(how);

    var p = f.panel;
    p.appendChild(FF.ui.el('h2', { class: 'gs-h' }, t('gsChooseLevel', 'Choose your level')));
    var levels = FF.ui.el('div', { class: 'gs-levels', role: 'group', 'aria-label': t('gcLevel', 'Level') });
    var levelBtns = R.LEVELS.map(function (l) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-level gs-lv-' + l });
      b.appendChild(levelChip(l));
      b.appendChild(FF.ui.span('gs-level__meta', t('gsLevelMeta', '{s} s · {m}× letters', { s: R.SECONDS[l], m: R.MULT[l] })));
      b.appendChild(FF.ui.span('gs-level__pts', t('gsLevelPts', '{n} pts', { n: R.BASE[l] })));
      b.addEventListener('click', function () { level = l; api.audio.play('select'); sync(); });
      levels.appendChild(b);
      return { el: b, id: l };
    });
    p.appendChild(levels);
    var levelNote = FF.ui.el('p', { class: 'gs-note' });
    p.appendChild(levelNote);

    p.appendChild(FF.ui.el('h2', { class: 'gs-h' }, t('gcRegions', 'Regions')));
    var regions = FF.ui.el('div', { class: 'gs-regions', role: 'group', 'aria-label': t('gcRegions', 'Regions') });
    var regionBtns = R.REGIONS.map(function (id) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-region' }, regionName(id));
      b.addEventListener('click', function () { region = id; api.audio.play('tap'); sync(); });
      regions.appendChild(b);
      return { el: b, id: id };
    });
    p.appendChild(regions);

    var foot = FF.ui.div('gs-setup__foot');
    var info = FF.ui.el('p', { class: 'gs-note', 'aria-live': 'polite' });
    foot.appendChild(info);
    var go = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big' });
    go.appendChild(glyph('globe'));
    go.appendChild(FF.ui.span('', t('gsSpin', 'Spin the globe')));
    go.addEventListener('click', function () {
      var cfg = R.sanitize({ level: level, region: region });
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    });
    foot.appendChild(go);
    p.appendChild(foot);

    function sync() {
      levelBtns.forEach(function (x) { x.el.classList.toggle('is-on', x.id === level); x.el.setAttribute('aria-pressed', x.id === level ? 'true' : 'false'); });
      regionBtns.forEach(function (x) { x.el.classList.toggle('is-on', x.id === region); x.el.setAttribute('aria-pressed', x.id === region ? 'true' : 'false'); });
      levelNote.textContent = level === 'expert' ? t('gsExpertNote', 'Expert: 15 seconds, every country, and decoy letters that spell other countries too.')
        : level === 'hard' ? t('gsHardNote', 'Hard: every country in the world, tiny ones too, with a locator ring.')
        : level === 'easy' ? t('gsEasyNote', 'Easy: famous countries and plenty of time.')
        : t('gsNormalNote', 'Normal: well-known countries, 25 seconds each.');
      var cfg = R.sanitize({ level: level, region: region });
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      info.textContent = t('gsNReady', '{n} countries ready', { n: R.pool(cfg).length }) + ' · ' + t('gsHintsNote', 'Hints cost points') +
        (ranked && !R.isStandard(cfg) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(p);
  }

  /* ================= solo and pass and play ================= */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }

  function seenSet(list, need) {
    var arr = store().get(SEEN_KEY, []) || [];
    var s = {};
    arr.forEach(function (c) { s[c] = true; });
    var fresh = list.filter(function (x) { return !s[x.code]; }).length;
    if (fresh >= need) return s;
    var codes = {};
    list.forEach(function (x) { codes[x.code] = true; });
    try { store().set(SEEN_KEY, arr.filter(function (c) { return !codes[c]; })); } catch (e) { /* storage full */ }
    return {};
  }
  function markSeen(code) {
    var arr = store().get(SEEN_KEY, []) || [];
    arr.push(code);
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    try { store().set(SEEN_KEY, arr); } catch (e) { /* storage full */ }
  }

  function play(api, cfg, seed) {
    cfg = R.sanitize(cfg);
    var config = api.config;
    var scorers = scorerList(config);
    var n = scorers.length;
    var list = R.pool(cfg);
    var timed = FF.GameLength.timed(config);
    var rounds = FF.GameLength.rounds(api, 10, list.length);
    if (!timed && n > 1) rounds = Math.ceil(rounds / n) * n;
    if (timed) FF.GameLength.manual();
    var shared = !!config.sharedDeal || !!config.daily || !!config.challenge;
    // A fresh run skips countries seen lately (a shared deal must not: everyone gets the same).
    var codes = R.deal(cfg, seed, Math.max(rounds, 1));
    if (!shared) {
      var seen = seenSet(list, rounds);
      var fresh = codes.filter(function (c) { return !seen[c]; });
      if (fresh.length < codes.length) {
        var more = R.deal(cfg, seed, list.length).filter(function (c) { return !seen[c] && fresh.indexOf(c) === -1; });
        codes = fresh.concat(more).concat(codes).filter(function (c, i, a) { return a.indexOf(c) === i; }).slice(0, rounds);
      }
    }
    var f = frame(api, { className: 'gs--play' });
    var globe = f.globe;
    var round = -1;
    var stats = {};
    scorers.forEach(function (e) { stats[e.id] = { right: 0, played: 0, fastest: null, streak: 0, best: 0 }; });
    var missed = [];
    var totals = { right: 0, played: 0 };

    // Side panel: score, streak (and everyone's scores in pass and play).
    var scoreBox = FF.ui.div('gs-card gs-score');
    f.side.appendChild(scoreBox);
    var roundChip = chip('', 'gs-chip--round');
    f.chips.appendChild(roundChip);
    f.chips.appendChild(levelChip(cfg.level));
    var ring = timerRing();
    f.stage.appendChild(ring.el);
    var regionChip = chip(regionName(cfg.region), 'gs-chip--cat', 'globe');
    f.side.appendChild(regionChip);

    function drawScores(activeId, bump) {
      FF.ui.clear(scoreBox);
      scoreBox.appendChild(FF.ui.el('p', { class: 'gs-card__title' }, n > 1 ? t('gsPassPlay', 'Pass and play') : t('gsYourScore', 'Your score')));
      var rows = FF.ui.el('ol', { class: 'gs-board-list' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var li = FF.ui.el('li', { class: 'gs-row' + (e.id === activeId && n > 1 ? ' is-active' : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(i + 1)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('gs-row__name', e.name || t('playerLabel', 'Player')));
        var pts = FF.ui.span('gs-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0));
        li.appendChild(pts);
        if (bump && bump.id === e.id) countUp(pts, bump.from, bump.to, 800);
        rows.appendChild(li);
      });
      scoreBox.appendChild(rows);
      var st = stats[activeId] || { streak: 0, best: 0 };
      var meta = FF.ui.div('gs-streak');
      meta.appendChild(FF.ui.span('gs-streak__flame' + (st.streak >= 3 ? ' is-hot' : ''), t('gsStreakN', 'Streak {n}', { n: st.streak })));
      var mult = R.streakMult(st.streak + 1);
      if (mult > 1) meta.appendChild(FF.ui.span('gs-streak__mult', t('gsNextX', 'Next ×{m}', { m: mult })));
      scoreBox.appendChild(meta);
    }

    function over() {
      if (round >= rounds) return true;
      return timed && FF.GameLength.timeUp() && round % n === 0;
    }
    function next() {
      round++;
      if (over() || !codes.length) { recap(); return; }
      render();
    }

    function render() {
      var k = round;
      var entity = scorers[k % n];
      var info = R.roundAt(cfg, seed, k, codes);
      if (!shared) markSeen(info.code);
      api.shell.hideTimer();
      api.shell.updateScores(entity.id);
      roundChip.lastChild.textContent = (n > 1 ? (entity.name || '') + ' · ' : '') + t('gsRoundOf', 'Round {r} of {n}', { r: k + 1, n: rounds });
      drawScores(entity.id);
      ring.idle();
      FF.ui.clear(f.panel);
      var q = FF.ui.el('h2', { class: 'gs-question' }, [
        FF.ui.span('', t('gsWhich1', 'Which ')), FF.ui.span('gs-gold', t('gsWhich2', 'country')), FF.ui.span('', t('gsWhich3', ' is highlighted?'))
      ]);
      f.panel.appendChild(q);
      var cont = FF.ui.div('gs-continent');
      f.panel.appendChild(cont);
      var done = false, started = 0;
      var hintRand = R.rng(R.hash('hint|' + seed + '|' + k));
      var board = letterBoard(api, info, { onSubmit: function (text) { answer(text, false); }, onChange: syncHints });
      f.panel.appendChild(board.el);
      var hints = FF.ui.div('gs-hints');
      function hintBtn(kind, icon, label) {
        var b = FF.ui.el('button', { type: 'button', class: 'gs-hint' });
        b.appendChild(glyph(icon));
        b.appendChild(FF.ui.span('gs-hint__label', label));
        b.appendChild(FF.ui.span('gs-hint__cost', '−' + R.HINTS[kind]));
        b.setAttribute('aria-label', label + ', ' + t('gsCostsN', 'costs {n} points', { n: R.HINTS[kind] }));
        b.addEventListener('click', function () {
          if (!board.hint(kind, hintRand)) return;
          api.audio.play('select');
          if (kind === 'continent') { cont.textContent = t('gsContinentIs', 'Continent: {c}', { c: info.continent }); cont.classList.add('is-on'); }
          syncHints();
        });
        hints.appendChild(b);
        return { el: b, kind: kind };
      }
      var hb = [hintBtn('letter', 'letter', t('gsHintReveal', 'Reveal a letter')), hintBtn('remove', 'minus2', t('gsHintRemove', 'Remove 2 letters')), hintBtn('continent', 'globe', t('gsHintContinent', 'Show continent'))];
      f.panel.appendChild(hints);
      function syncHints() { hb.forEach(function (h) { h.el.disabled = done || !board.canHint(h.kind); }); }
      syncHints();
      var after = FF.ui.div('gs-after');
      f.panel.appendChild(after);

      api.audio.play('whoosh');
      f.root.classList.add('is-spinning');
      globe.spin(info.code, { duration: reduceMotion() ? 1200 : R.SPIN_MS }).then(function () {
        if (round !== k || !stillShown(api)) return;
        f.root.classList.remove('is-spinning');
        api.audio.play('land');
        started = Date.now();
        board.open();
        syncHints();
        api.shell.setOnTick(function (rem) { ring.set(rem, info.seconds); });
        api.shell.setTimer(info.seconds, function () { answer('', true); });
        ring.set(info.seconds, info.seconds);
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);
      });

      function answer(text, timeout) {
        if (done) return;
        done = true;
        var ms = started ? Date.now() - started : info.seconds * 1000;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
        if (timeout) ring.set(0, info.seconds);
        var res = timeout || !text ? { ok: false } : R.check(text, info.code);
        var st = stats[entity.id];
        st.played++; totals.played++;
        var streak = res.ok ? st.streak + 1 : 0;
        var pts = R.points({ level: cfg.level, ok: res.ok, ms: ms, secs: info.seconds, streak: streak, hints: board.used });
        var before = api.scoring.get(entity.id) || 0;
        if (res.ok) {
          st.right++; totals.right++;
          st.streak = streak;
          st.best = Math.max(st.best, streak);
          if (st.fastest == null || ms < st.fastest) st.fastest = ms;
          api.scoring.add(entity.id, pts.total, { correct: true, fastest: ms / 1000 });
          api.audio.play(R.streakMult(streak) > R.streakMult(streak - 1) ? 'streak' : 'correct');
          if (animationsOn() && FF.Confetti) FF.Confetti.burst(streak >= 3 ? 70 : 40);
        } else {
          st.streak = 0;
          api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          if (missed.indexOf(info.code) === -1) missed.push(info.code);
        }
        board.finish(res.ok);
        syncHints();
        globe.show(info.code, res.ok ? 'good' : 'gold');
        drawScores(entity.id, { id: entity.id, from: before, to: api.scoring.get(entity.id) || 0 });
        api.shell.updateScores(entity.id);
        after.appendChild(revealCard({
          state: res.ok ? 'good' : timeout ? 'late' : 'bad', code: info.code, name: info.name, points: pts.total, breakdown: pts,
          said: res.ok ? (res.exact ? '' : t('gcSpelt', 'It is spelt {c}.', { c: res.matched || info.name })) : saidLine(text, res)
        }));
        f.root.classList.add('is-revealed');
        var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('gsNextCountry', 'Next country'), function () {
          api.audio.play('click');
          board.destroy();
          f.root.classList.remove('is-revealed');
          next();
        }, { class: 'gs-btn gs-btn--go gs-next' });
        after.appendChild(nextBtn);
        if (after.scrollIntoView && window.innerWidth < 900) { try { after.scrollIntoView({ behavior: animationsOn() ? 'smooth' : 'auto', block: 'nearest' }); } catch (e) { /* old browser */ } }
        if (FF.Nav && FF.Nav.focus) setTimeout(function () { if (document.body.contains(nextBtn)) FF.Nav.focus(nextBtn); }, 400);
      }
    }

    function recap() {
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      globe.idle();
      FF.ui.clear(f.panel);
      FF.ui.clear(f.chips);
      f.root.classList.add('is-recap');
      var box = FF.ui.div('gs-recap');
      var pct = totals.played ? Math.round(totals.right / totals.played * 100) : 0;
      var ringEl = FF.ui.div('gs-recap__ring');
      ringEl.style.setProperty('--p', String(pct));
      ringEl.appendChild(FF.ui.span('', pct + '%'));
      box.appendChild(ringEl);
      box.appendChild(FF.ui.el('h2', { class: 'gs-h gs-h--xl' }, t('gsRecapTitle', '{c} of {a} countries spotted', { c: totals.right, a: totals.played })));
      box.appendChild(FF.ui.el('p', { class: 'gs-note' }, summary(cfg)));
      var people = FF.ui.el('ol', { class: 'gs-board-list gs-board-list--big' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var s = stats[e.id];
        var li = FF.ui.el('li', { class: 'gs-row' + (i === 0 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(i + 1)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.span('gs-row__name');
        who.appendChild(FF.ui.span('', e.name || t('playerLabel', 'Player')));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.right, a: s.played })];
        if (s.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: s.best }));
        if (s.fastest != null) bits.push(t('qmFastest', 'fastest {s}s', { s: (s.fastest / 1000).toFixed(1) }));
        who.appendChild(FF.ui.span('gs-row__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('gs-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      box.appendChild(people);
      if (missed.length) {
        box.appendChild(FF.ui.el('h3', { class: 'gs-h' }, t('gsToLearn', 'Countries to learn')));
        var learn = FF.ui.el('ul', { class: 'gs-learn' });
        missed.slice(0, 12).forEach(function (code) {
          var li = FF.ui.el('li', {});
          li.appendChild(FF.ui.el('img', { src: flagPath(code), alt: '' }));
          li.appendChild(FF.ui.span('', (R.countryOf(code) || {}).name || code));
          learn.appendChild(li);
        });
        box.appendChild(learn);
      }
      var go = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big' });
      go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('seeResults', 'See results')));
      go.addEventListener('click', end);
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play('winner');
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
    }

    function end() {
      var res = api.scoring.results ? api.scoring.results() : null;
      var ranked = (res && res.results) || [];
      var best = 0, fastest = null;
      Object.keys(stats).forEach(function (id) {
        best = Math.max(best, stats[id].best);
        if (stats[id].fastest != null && (fastest == null || stats[id].fastest < fastest)) fastest = stats[id].fastest / 1000;
      });
      api.end({ results: ranked, winnerId: res ? res.winnerId : null, bestStreak: best, fastest: fastest, quizCorrect: totals.right, quizAnswered: totals.played });
    }

    next();
  }

  /* ================= online ================= */

  function online(api, room) {
    var f = frame(api, { className: 'gs--play gs--online' });
    var globe = f.globe;
    api.shell.hideTimer();
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });
    var client = FF.GeoSpinClient.create({ room: room, onChange: schedule });
    var ended = false, pending = null, nudged = {}, autoScores = null;
    var shownRound = null;     // matchId|k of the round on screen
    var board = null, ring = timerRing(), sentText = null, revealShown = null, finishedShown = false;
    var lastScores = {};
    f.stage.appendChild(ring.el);
    var roundChip = chip('', 'gs-chip--round');
    f.chips.appendChild(roundChip);
    var levelHolder = FF.ui.span('');
    f.chips.appendChild(levelHolder);
    var boardBox = FF.ui.div('gs-card gs-leader');
    f.side.appendChild(boardBox);
    var ticker = setInterval(tick, 200);

    function expected() { return room.meta && room.meta.gsMatch; }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('playerLabel', 'Player'), avatar: p.avatar || null, color: p.color || null };
    }
    function schedule() { if (!pending) pending = setTimeout(function () { pending = null; render(); }, 0); }
    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      if (board) board.destroy();
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }
    function finish() { if (ended) return; cleanup(); api.end({}); }

    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.GeoSpinApi.nudge(room.code);
    }

    function drawLeader(gs, reveal) {
      FF.ui.clear(boardBox);
      var head = FF.ui.div('gs-card__head');
      head.appendChild(FF.Icons.icon('trophy'));
      var ht = FF.ui.div('');
      ht.appendChild(FF.ui.el('p', { class: 'gs-card__title' }, t('gsBattle', 'Multiplayer battle')));
      if (gs.k >= 0) ht.appendChild(FF.ui.el('p', { class: 'gs-card__sub' }, t('gsRoundOf', 'Round {r} of {n}', { r: gs.k + 1, n: gs.total })));
      head.appendChild(ht);
      boardBox.appendChild(head);
      var rows = FF.ui.el('ol', { class: 'gs-board-list' });
      var order = (gs.order || []).slice().sort(function (a, b) { return ((gs.p[b] || {}).score || 0) - ((gs.p[a] || {}).score || 0); });
      order.forEach(function (uid, i) {
        var row = gs.p[uid] || {};
        var li = FF.ui.el('li', { class: 'gs-row' + (uid === client.uid ? ' is-me' : '') + (i < 3 ? ' is-p' + (i + 1) : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(i + 1)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(who(uid), ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('gs-row__name', who(uid).name + (uid === client.uid ? ' ' + t('youTag', '(you)') : '')));
        var pts = FF.ui.span('gs-row__pts', FF.util.formatNumber(row.score || 0));
        li.appendChild(pts);
        if (gs.phase === 'open' && row.inK === gs.k) li.appendChild(FF.ui.span('gs-row__in', '✓'));
        if (reveal && row.last && row.last.k === gs.k) {
          li.classList.add(row.last.ok ? 'is-good' : 'is-bad');
          var before = lastScores[uid] != null ? lastScores[uid] : (row.score || 0) - (row.last.pts || 0);
          countUp(pts, before, row.score || 0, 900);
        }
        lastScores[uid] = row.score || 0;
        rows.appendChild(li);
      });
      boardBox.appendChild(rows);
    }

    function waiting(title, sub) {
      FF.ui.clear(f.panel);
      var w = FF.ui.div('gs-wait');
      w.appendChild(FF.ui.div('gs-wait__spin'));
      w.appendChild(FF.ui.el('h2', { class: 'gs-h' }, title));
      if (sub) w.appendChild(FF.ui.el('p', { class: 'gs-note' }, sub));
      f.panel.appendChild(w);
    }

    function tick() {
      if (ended) return;
      var v = client.view();
      var gs = v.gs;
      if (!gs || gs.matchId !== expected()) return;
      var now = client.serverNow();
      if (gs.phase === 'open') ring.set((gs.closeAt - now) / 1000, gs.settings ? R.secondsFor(gs.settings.level) : 25);
      // The referee is late: ask the server to make sure it is running.
      var due = gs.phase === 'starting' ? gs.spinAt : gs.phase === 'spin' ? gs.openAt : gs.phase === 'open' ? gs.closeAt : gs.phase === 'reveal' ? gs.nextAt : 0;
      if (due) maybeNudge(gs.phase + gs.k, due);
    }

    function render() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = client.view();
      var gs = v.gs;
      if (!gs || (expected() && gs.matchId !== expected())) {
        waiting(t('gsGettingReady', 'Warming up the globe…'), t('gsGettingReadySub', 'Everyone gets the same countries at the same moment.'));
        globe.idle();
        return;
      }
      FF.ui.clear(levelHolder);
      levelHolder.appendChild(levelChip(gs.settings.level));
      roundChip.lastChild.textContent = gs.k >= 0 ? t('gsRoundOf', 'Round {r} of {n}', { r: gs.k + 1, n: gs.total }) : t('gsGetReady', 'Get ready');
      drawLeader(gs, gs.phase === 'reveal');
      if (gs.phase === 'ended') { if (!finishedShown) showEnd(gs, v); return; }
      if (gs.phase === 'starting') {
        globe.idle();
        ring.idle();
        waiting(t('gsBrief', 'Spin the world. Spot the country.'), t('gsBriefSub', 'Spell each highlighted country with the letter tiles. Faster right answers score more, and streaks multiply your points. No hints online.'));
        return;
      }
      if (!v.seated) {
        waiting(t('gsWatching', 'This game started without you'), t('gsWatchingSub', 'You can join the next one.'));
        if (gs.round) globe.show(gs.round.code);
        return;
      }
      var key = gs.matchId + '|' + gs.k;
      if (shownRound !== key && gs.round && gs.round.k === gs.k) buildRound(gs, key);
      if (gs.phase === 'open' && board && !board.opened) {
        board.opened = true;
        board.open();
        f.root.classList.remove('is-spinning');
      }
      var me = gs.p[v.uid] || {};
      if ((gs.phase === 'open' || gs.phase === 'spin') && me.inK === gs.k && board && !board.sent) {
        board.sent = true;
        board.lock();
      }
      if (gs.phase === 'reveal' && revealShown !== key) showReveal(gs, v, key);
    }

    function buildRound(gs, key) {
      shownRound = key;
      revealShown = null;
      sentText = null;
      if (board) board.destroy();
      FF.ui.clear(f.panel);
      f.root.classList.remove('is-revealed');
      var info = {
        code: gs.round.code, cells: R.layout(gs.round.target), tiles: String(gs.round.tiles || '').split(''),
        letters: R.lettersOf(gs.round.target)
      };
      f.panel.appendChild(FF.ui.el('h2', { class: 'gs-question' }, [
        FF.ui.span('', t('gsWhich1', 'Which ')), FF.ui.span('gs-gold', t('gsWhich2', 'country')), FF.ui.span('', t('gsWhich3', ' is highlighted?'))
      ]));
      board = letterBoard(api, info, {
        onSubmit: function (text) {
          if (board.sent) return;
          var ok = client.send(text);
          if (!ok) return;
          board.sent = true;
          sentText = text;
          board.lock();
          api.audio.play('select');
          lock.textContent = t('bqLockedIn', 'Answer locked in. Waiting for everyone…');
          lock.classList.add('is-on');
        }
      });
      f.panel.appendChild(board.el);
      var lock = FF.ui.el('p', { class: 'gs-locked', 'aria-live': 'polite' });
      f.panel.appendChild(lock);
      f.panel.appendChild(FF.ui.div('gs-after'));
      var now = client.serverNow();
      var elapsed = Math.max(0, now - gs.spinAt);
      var spinMs = gs.openAt - gs.spinAt;
      if (elapsed < spinMs) {
        f.root.classList.add('is-spinning');
        api.audio.play('whoosh');
        ring.idle();
        globe.spin(gs.round.code, { duration: spinMs, elapsed: elapsed }).then(function () { if (shownRound === key && !ended) api.audio.play('land'); });
      } else {
        globe.show(gs.round.code);
      }
    }

    function showReveal(gs, v, key) {
      revealShown = key;
      var rv = gs.reveal || {};
      var me = (gs.p[v.uid] || {}).last || {};
      var mine = me.k === gs.k ? me : { ok: false, pts: 0 };
      if (board) board.finish(!!mine.ok);
      ring.set(0, 1);
      f.root.classList.remove('is-spinning');
      f.root.classList.add('is-revealed');
      globe.show(rv.code || (gs.round && gs.round.code), mine.ok ? 'good' : 'gold');
      api.audio.play(mine.ok ? 'correct' : 'wrong');
      if (mine.ok && animationsOn() && FF.Confetti) FF.Confetti.burst(40);
      var lock = f.panel.querySelector('.gs-locked');
      if (lock) lock.classList.remove('is-on');
      var after = f.panel.querySelector('.gs-after') || f.panel.appendChild(FF.ui.div('gs-after'));
      FF.ui.clear(after);
      var text = mine.text != null ? mine.text : sentText;
      after.appendChild(revealCard({
        state: mine.ok ? 'good' : (mine.text || sentText) ? 'bad' : 'late', code: rv.code, name: rv.name, points: mine.pts || 0,
        breakdown: mine.ok ? { base: mine.base || 0, speed: mine.speed || 0, mult: mine.mult || 1, cost: 0 } : null,
        said: mine.ok ? '' : saidLine(text, mine.near ? { near: mine.near } : null)
      }));
      var nextIn = FF.ui.el('p', { class: 'gs-note gs-nextin' }, gs.k + 1 >= gs.total ? t('gsFinalSoon', 'Final results coming up…') : t('gsNextSoon', 'Next spin in a moment…'));
      after.appendChild(nextIn);
    }

    function showEnd(gs, v) {
      finishedShown = true;
      if (board) board.destroy();
      board = null;
      globe.idle();
      ring.idle();
      FF.ui.clear(f.panel);
      f.root.classList.add('is-recap');
      var res = gs.result || { rows: [] };
      var rows = res.rows || [];
      var box = FF.ui.div('gs-recap gs-recap--room');
      var top = rows[0];
      var meWon = top && top.uid === v.uid && !(rows[1] && rows[1].place === 1);
      box.appendChild(FF.ui.el('h2', { class: 'gs-h gs-h--xl' }, meWon ? t('gsYouWin', 'You claimed the crown!') : top ? t('gsWinner', '{name} claims the crown!', { name: who(top.uid).name }) : t('gsOver', 'Game over')));
      var podium = FF.ui.div('gs-podium');
      [1, 0, 2].forEach(function (i) {
        var r = rows[i];
        if (!r) return;
        var col = FF.ui.div('gs-podium__col gs-podium__col--' + (i + 1));
        var ava = FF.ui.span('gs-podium__ava');
        ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        col.appendChild(ava);
        col.appendChild(FF.ui.span('gs-podium__name', who(r.uid).name));
        col.appendChild(FF.ui.span('gs-podium__pts', FF.util.formatNumber(r.points || 0)));
        var step = FF.ui.div('gs-podium__step');
        step.appendChild(FF.ui.span('', String(r.place || i + 1)));
        col.appendChild(step);
        podium.appendChild(col);
      });
      box.appendChild(podium);
      var list = FF.ui.el('ol', { class: 'gs-board-list gs-board-list--big' });
      rows.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'gs-row' + (r.uid === v.uid ? ' is-me' : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(r.place)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        li.appendChild(ava);
        var nm = FF.ui.span('gs-row__name');
        nm.appendChild(FF.ui.span('', who(r.uid).name));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: r.right || 0, a: gs.total })];
        if (r.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: r.best }));
        nm.appendChild(FF.ui.span('gs-row__meta', bits.join(' · ')));
        li.appendChild(nm);
        li.appendChild(FF.ui.span('gs-row__pts', FF.util.formatNumber(r.points || 0)));
        list.appendChild(li);
      });
      box.appendChild(list);
      var go = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big' });
      go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('srtSeeScores', 'See scores')));
      go.addEventListener('click', function () { api.audio.play('click'); finish(); });
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play(meWon ? 'winner' : 'roundEnd');
      if (meWon && animationsOn() && FF.Confetti) FF.Confetti.burst(100);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  /* ================= room settings ================= */

  function fields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'level', label: t('gcLevel', 'Level'), options: R.LEVELS.map(function (l) { return opt(levelName(l) + ' · ' + R.SECONDS[l] + 's', l); }) },
      { key: 'region', label: t('gcRegions', 'Regions'), options: R.REGIONS.map(function (r) { return opt(regionName(r), r); }) },
      { key: 'rounds', label: t('gsRounds', 'Countries'), options: R.ROUNDS.map(function (n) { return opt(String(n), n); }) }
    ];
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function () { return fields(); },
    sanitize: function (s) { return R.sanitize(s); },
    summary: function (s) { var c = R.sanitize(s); return summary(c) + ' · ' + t('gsNCountries', '{n} countries', { n: c.rounds }); },
    start: function (room, pick) { return FF.GeoSpinApi.start(room, pick); }
  };

  /* ================= registration ================= */

  FF.registerGame({
    id: 'geoSpin',
    featured: true,
    name: 'GeoSpin',
    description: 'Spin the world, spot the country, claim the crown. Spell the highlighted country with letter tiles before time runs out.',
    category: 'world',
    icon: '🌍',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 5,
    tags: ['quiz', 'geography', 'online', 'race'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    leaderboard: true,
    howToPlay: [
      'The globe spins, slows down and lands on a country, which lights up in gold.',
      'Spell the country’s name with the letter tiles: tap a tile to place it, tap a placed letter to send it back. Undo, Clear, then Submit.',
      'Small spelling mistakes are forgiven, and other recognised names count (USA, UK, Holland…).',
      'Easy gives you 30 seconds and Expert only 15, with tricky decoy letters. Faster answers score more, and 3, 5 or 10 right in a row multiply your points.',
      'Stuck? Hints reveal a letter, remove two wrong ones or show the continent, for a few points.'
    ],
    room: ROOM,
    start: function (api) {
      if (FF.GeoSpinGlobe) FF.GeoSpinGlobe.preload();
      var room = FF.Room && FF.Room.current();
      if (racingRoom(api) && room) { online(api, room); return; }
      // One number decides the whole deal, drawn first so a challenge deals the same everywhere.
      var seed = Math.floor(rand0() * 4294967296);
      if (api.config.daily || api.config.challenge) { play(api, R.STANDARD, seed); return; }
      setupScreen(api, function (cfg) {
        if (!stillShown(api)) return;
        if (!R.isStandard(cfg)) api.config.customRules = true;
        play(api, cfg, seed);
      });
    }
  });

  FF.GeoSpinGame = { summary: summary, fields: fields, letterBoard: letterBoard };
})();
