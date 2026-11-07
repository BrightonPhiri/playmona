/* ============================================================
   PLAYMONA — games/ballSwap.js
   Ball Swap: two glass bowls, A and B, full of coloured balls.
   The instructions say which colours belong in which bowl. Every
   move is a swap: pick one ball in A and one in B and they trade
   places at once. They should both be heading home: anything
   else still swaps, but it is a mistake and has to be undone.

   - Solo, with its own setup screen.
   - Online rooms: the server deals one board for everybody and
     its referee (js/ballswap/referee.js) checks every swap, the
     mistakes, the knock-outs and the finishing order. This file
     draws, takes taps and drags, and shows the referee's view
     (FF.BallSwapClient). The phone runs the same rules only to
     animate a swap at once; the referee's answer always wins.

   Controls: tap a ball in one bowl, then a ball in the other; or
   drag a ball onto a ball in the other bowl. Tapping the selected
   ball again lets it go; tapping another ball in the same bowl
   picks that one instead. Nothing ever hints where a ball goes:
   both bowls look the same whatever is selected.

   Looks: css/games.css (.bs-*), colours in css/tokens.css (--bs-*).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.BallSwapRules;
  var COUNT_MS = 3000;            // the 3-2-1 at the end of the countdown
  var NUDGE_MS = 8000;
  var RENUDGE_MS = 15000;
  var STUCK_MS = 30000;
  var AUTO_SCORES_MS = 90000;
  var SWAP_MS = 460;
  var DRAG_PX = 8;

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }
  function icon(key) { return FF.Icons.icon(key); }

  function reduceMotion() {
    var setting = FF.Settings && FF.Settings.get && FF.Settings.get('reduceMotion');
    var os = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!(setting || os);
  }

  function buzz(pattern) {
    // Only after a touch (browsers refuse before), and only with sound effects on.
    if (FF.Audio && FF.Audio.effectsEnabled === false) return;
    var touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    try { if (touched && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ }
  }

  function rand() { return FF._rand ? FF._rand() : Math.random(); }
  function randInt(n) { return Math.min(n - 1, Math.floor(rand() * n)); }

  /* ---------- words ---------- */

  function colourName(c) {
    return {
      red: t('bsRed', 'Red'), blue: t('bsBlue', 'Blue'), green: t('bsGreen', 'Green'),
      yellow: t('bsYellow', 'Yellow'), purple: t('bsPurple', 'Purple')
    }[c] || c;
  }
  function levelLabel(l) {
    var r = R.SIZES[l];
    return { easy: t('bsEasy', 'Easy'), medium: t('bsMedium', 'Medium'), hard: t('bsHard', 'Hard'), expert: t('bsExpert', 'Expert') }[l] + ' · ' + r[0] + '–' + r[1];
  }
  function mistakesLabel(m) { return m < 0 ? t('bsNoLimit', 'No limit') : m === 0 ? t('bsNone', 'None') : String(m); }
  function lineText(line) {
    var c = colourName(line.colour);
    if (!line.from) return t('bsLineStay', 'Leave the {colour} balls in {to}', { colour: c.toLowerCase(), to: line.to });
    return t('bsLineMove', 'Move all {colour} balls from {from} to {to}', { colour: c.toLowerCase(), from: line.from, to: line.to });
  }

  function summary(s) {
    s = R.sanitize(s);
    return [
      levelLabel(s.level) + ' ' + t('bsBallsEach', 'balls each'),
      t('bsNColours', '{n} colours', { n: s.colours }),
      t('bsNSecs', '{n}s', { n: s.seconds }),
      s.mistakes < 0 ? t('bsSumNoLimit', 'no mistake limit') : s.mistakes === 0 ? t('bsSumNone', 'no mistakes allowed')
        : s.mistakes === 1 ? t('bsSumOne', '1 mistake allowed') : t('bsSumN', '{n} mistakes allowed', { n: s.mistakes }),
      s.show === 'start' ? t('bsSumMemory', 'memorise the rules') : t('bsSumShown', 'rules on screen')
    ].join(' · ');
  }

  /* The setting rows, for the room lobby and the solo setup screen. */
  function fields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'level', label: t('bsLevel', 'Balls per bowl'), options: R.LEVELS.map(function (l) { return opt(levelLabel(l), l); }) },
      { key: 'colours', label: t('bsColours', 'Colours'), options: R.COLOURS.map(function (c) { return opt(String(c), c); }) },
      { key: 'seconds', label: t('bsTime', 'Time'), options: R.SECONDS.map(function (s) { return opt(s + 's', s); }) },
      { key: 'mistakes', label: t('bsMistakesAllowed', 'Mistakes allowed'), options: R.MISTAKES.map(function (m) { return opt(mistakesLabel(m), m); }) },
      { key: 'show', label: t('bsShow', 'Instructions'), options: [opt(t('bsShowAlways', 'On screen'), 'always'), opt(t('bsShowStart', 'Memorise'), 'start')] },
      { note: t('bsSettingsNote', 'Two colours: the balls trade places completely. Three or more: some balls are already home, and touching them is a mistake.') }
    ];
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function () { return fields(); },
    sanitize: function (s) { return R.sanitize(s); },
    summary: function (s) { return summary(s); },
    start: function (room, pick) { return FF.BallSwapApi.start(room, pick); }
  };

  /* ---------- symbols, so colour is never the only difference ---------- */

  var SYMBOLS = {
    red: '<circle cx="12" cy="12" r="6"/>',
    blue: '<path d="M12 4.5 20 19H4z"/>',
    green: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
    yellow: '<path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/>',
    purple: '<path d="M12 3 21 12 12 21 3 12z"/>'
  };
  function symbol(c) {
    var s = FF.ui.span('bs-sym');
    s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (SYMBOLS[c] || '') + '</svg>';
    return s;
  }
  function swatch(c) {
    var b = FF.ui.span('bs-swatch');
    b.setAttribute('data-colour', c);
    b.appendChild(symbol(c));
    return b;
  }
  function symbolsOn() {
    var v = FF.Storage ? FF.Storage.get('ballSwap:symbols', null) : null;
    return v !== false;
  }

  /* ================= the board =================
     opts: { puzzle, settings, board: { a, b }, lines, room (bool), turnText,
             onSwap(aId, bId) -> 'ok' | 'wrong' | 'stale' | null,
             onToggleSymbols }
     Returns { stage, rivals, sync(board), setPlaying(bool), setTime(leftMs), setCounts(swaps, mistakes),
               overlay(kind, lines), countdown(n | null, text), hideRules(bool), lock(), destroy() } */
  function board(api, opts) {
    var pz = opts.puzzle;
    var cfg = R.sanitize(opts.settings);
    var calm = reduceMotion();
    var bd = { a: opts.board.a.slice(), b: opts.board.b.slice() };
    var playing = false;
    var locked = false;
    var selected = null;          // ball id
    var drag = null;              // { id, pointerId, x0, y0, moved }
    var D = 40;                   // ball size in px
    var slots = { A: [], B: [] }; // centre of each slot, in layer px
    var balls = {};               // id -> button
    var timers = [];
    var dead = false;

    var stage = FF.GameUI.stage({ wide: true, className: 'bs' + (symbolsOn() ? '' : ' bs--plain') });
    if (opts.turnText) stage.appendChild(FF.GameUI.kicker(opts.turnText));

    // HUD: time, swaps, mistakes, symbols.
    var hud = FF.ui.div('bs-hud');
    var timeStat = stat('timer', t('bsTimeLeft', 'Time left'), R.clock(cfg.seconds * 1000));
    var swapStat = stat('arrows-left-right', t('bsSwaps', 'Swaps'), '0/' + pz.need);
    var lives = FF.ui.div('bs-lives');
    lives.setAttribute('role', 'status');
    hud.appendChild(timeStat.el);
    hud.appendChild(swapStat.el);
    hud.appendChild(lives);
    var symBtn = FF.ui.el('button', { type: 'button', class: 'bs-symbtn', 'aria-pressed': symbolsOn() ? 'true' : 'false', 'aria-label': t('bsSymbolsLong', 'Symbols on the balls') });
    symBtn.appendChild(symbol('purple'));
    symBtn.appendChild(FF.ui.span('bs-symbtn__text', t('bsSymbols', 'Symbols')));
    symBtn.addEventListener('click', function () {
      var on = !symbolsOn();
      try { if (FF.Storage) FF.Storage.set('ballSwap:symbols', on); } catch (e) { /* storage full */ }
      symBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      stage.classList.toggle('bs--plain', !on);
      api.audio.play('click');
    });
    hud.appendChild(symBtn);
    stage.appendChild(hud);

    var rivals = null;
    if (opts.room) {
      rivals = FF.ui.div('bs-rivals hidden');
      rivals.setAttribute('aria-label', t('bsRivals', 'The other players'));
      stage.appendChild(rivals);
    }

    // The instructions.
    var rules = FF.ui.el('section', { class: 'bs-rules', 'aria-label': t('bsInstructions', 'Instructions') });
    var rulesList = FF.ui.el('ul', { class: 'bs-rules__list' });
    opts.lines.forEach(function (line) {
      // Short on screen ("Purple · B → A"); the whole sentence for screen readers.
      var li = FF.ui.el('li', { class: 'bs-rule', 'aria-label': lineText(line) });
      li.appendChild(swatch(line.colour));
      var txt = FF.ui.span('bs-rule__text');
      txt.setAttribute('aria-hidden', 'true');
      txt.appendChild(FF.ui.span('bs-rule__name', colourName(line.colour)));
      txt.appendChild(FF.ui.span('bs-rule__move', line.from ? line.from + ' → ' + line.to : t('bsStaysIn', 'stays in {to}', { to: line.to })));
      li.appendChild(txt);
      rulesList.appendChild(li);
    });
    rules.appendChild(rulesList);
    var rulesHidden = FF.ui.el('p', { class: 'bs-rules__hidden hidden' }, t('bsRulesHidden', 'The instructions are hidden. Play from memory!'));
    rules.appendChild(rulesHidden);
    stage.appendChild(rules);

    // The arena: two bowls and a layer of balls over both.
    var arena = FF.ui.div('bs-arena');
    arena.setAttribute('role', 'group');
    arena.setAttribute('aria-label', t('bsArenaLabel', 'Two bowls of balls, A and B'));
    var bowls = {};
    ['A', 'B'].forEach(function (side) {
      var bowl = FF.ui.div('bs-bowl');
      bowl.setAttribute('data-side', side);
      var label = FF.ui.span('bs-bowl__label', side);
      label.setAttribute('aria-hidden', 'true');
      bowl.appendChild(label);
      bowl.appendChild(FF.ui.span('bs-bowl__shine'));
      arena.appendChild(bowl);
      bowls[side] = bowl;
    });
    var layer = FF.ui.div('bs-layer');
    arena.appendChild(layer);
    var overlay = FF.ui.div('bs-overlay hidden');
    overlay.setAttribute('aria-live', 'polite');
    arena.appendChild(overlay);
    stage.appendChild(arena);
    stage.appendChild(FF.GameUI.note(t('bsHow', 'Tap a ball in A, then a ball in B, to swap them. Or drag one onto the other.')));

    pz.balls.forEach(function (c, id) {
      var b = FF.ui.el('button', { type: 'button', class: 'bs-ball' });
      b.setAttribute('data-colour', c);
      b.appendChild(FF.ui.span('bs-ball__shade'));
      b.appendChild(symbol(c));
      b._id = id;
      b.addEventListener('click', function (e) {
        // Taps and drags come in as pointer events; this is the keyboard path.
        if (e.detail === 0) tap(id);
      });
      b.addEventListener('pointerdown', onDown);
      layer.appendChild(b);
      balls[id] = b;
    });
    label();

    function stat(iconKey, text, value) {
      var el = FF.ui.div('bs-stat');
      el.appendChild(icon(iconKey));
      var txt = FF.ui.span('bs-stat__text');
      txt.appendChild(FF.ui.span('bs-stat__label', text));
      var v = FF.ui.span('bs-stat__value', value);
      txt.appendChild(v);
      el.appendChild(txt);
      return { el: el, value: v };
    }

    function sideOf(id) { return bd.a.indexOf(id) !== -1 ? 'A' : 'B'; }

    /* Names say what a ball is and where it is, never where it should go. */
    function label() {
      pz.balls.forEach(function (c, id) {
        balls[id].setAttribute('aria-label', t('bsBallLabel', '{colour} ball in {side}', { colour: colourName(c), side: sideOf(id) }) +
          (selected === id ? ', ' + t('bsSelected', 'selected') : ''));
        balls[id].setAttribute('aria-pressed', selected === id ? 'true' : 'false');
      });
    }

    /* ---------- sizing ---------- */

    /* Hex-packed rows from the bottom of a bowl up: the biggest balls that fit. */
    function pack(w, h, n) {
      var best = null;
      for (var cols = 1; cols <= n; cols++) {
        var rows = Math.ceil(n / cols);
        var d = Math.min(w / (cols + (rows > 1 ? 0.5 : 0)), h / (1 + (rows - 1) * 0.87));
        if (!best || d > best.d) best = { d: d, cols: cols, rows: rows };
      }
      return best;
    }

    var MIN_BALL = 38;      // a comfortable finger on a phone
    function measure() {
      var ar = arena.getBoundingClientRect();
      var inner = {};
      ['A', 'B'].forEach(function (side) {
        var r = bowls[side].getBoundingClientRect();
        var padX = r.width * 0.09, padTop = Math.max(48, r.height * 0.14), padBottom = r.height * 0.08;
        inner[side] = { x: r.left - ar.left + padX, y: r.top - ar.top + padTop, w: r.width - padX * 2, h: r.height - padTop - padBottom };
      });
      return { inner: inner, p: pack(Math.min(inner.A.w, inner.B.w), Math.min(inner.A.h, inner.B.h), pz.n) };
    }

    function fit() {
      if (dead || !arena.isConnected) return;
      var w = stage.clientWidth || 360;
      var top = arena.getBoundingClientRect().top + (window.scrollY || 0);
      var avail = Math.max(300, (window.innerHeight || 640) - Math.max(0, top) - 48);
      var stack = w < 560;
      arena.classList.toggle('is-stacked', stack);
      var h = Math.round(stack ? Math.min(avail, w * 1.6) : Math.min(avail, w * 0.62, 560));
      arena.style.height = h + 'px';
      var m = measure();
      // Too small to tap comfortably: let the bowls grow (the page scrolls a little instead).
      var cap = stack ? w * 2.2 : 720;
      for (var k = 0; k < 24 && m.p.d * 0.94 < MIN_BALL && h < cap; k++) {
        h += 24;
        arena.style.height = h + 'px';
        m = measure();
      }
      var inner = m.inner, p = m.p;
      D = Math.max(22, Math.min(72, Math.floor(p.d * 0.94)));
      var step = p.d;
      ['A', 'B'].forEach(function (side) {
        var box = inner[side];
        var list = [];
        for (var i = 0; i < pz.n; i++) {
          var row = Math.floor(i / p.cols);
          var inRow = Math.min(p.cols, pz.n - row * p.cols);
          var col = i % p.cols;
          var shift = row % 2 ? step / 2 : 0;
          var rowW = inRow * step + (p.rows > 1 ? step / 2 : 0);
          var x0 = box.x + (box.w - rowW) / 2 + step / 2 + (p.rows > 1 ? shift : 0);
          // A little wobble, the same every time, so the balls look dropped in, not printed.
          var jx = (((i * 37 + (side === 'A' ? 11 : 23)) % 9) - 4) / 4 * step * 0.035;
          var jy = (((i * 53 + 7) % 7) - 3) / 3 * step * 0.03;
          list.push({ x: x0 + col * step + jx, y: box.y + box.h - step / 2 - row * step * 0.87 + jy });
        }
        slots[side] = list;
      });
      layer.style.setProperty('--bs-d', D + 'px');
      place(false);
    }

    /* Where each ball has settled around its slot, as a fraction of a ball
       (so it survives resizing). Landings knock these about. */
    var rest = {};
    function slotOf(id) {
      var i = bd.a.indexOf(id);
      if (i !== -1) return slots.A[i];
      return slots.B[bd.b.indexOf(id)];
    }
    function posOf(id) {
      var p = slotOf(id);
      var r = rest[id];
      if (!p || !r) return p;
      return { x: p.x + r.x * D, y: p.y + r.y * D };
    }
    function xf(p, lift) { return 'translate(' + (p.x - D / 2).toFixed(1) + 'px,' + (p.y - D / 2 - (lift || 0)).toFixed(1) + 'px)'; }

    function place(animate) {
      pz.balls.forEach(function (c, id) {
        var p = posOf(id);
        if (!p) return;
        var b = balls[id];
        var to = xf(p, selected === id ? D * 0.12 : 0);
        if (animate && !calm && b._at && b._at !== to && b.animate) {
          b.animate([{ transform: b._at }, { transform: to }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
        }
        b.style.transform = to;
        b._at = to;
      });
    }

    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { fit(); }); ro.observe(stage); }
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);

    /* ---------- choosing ---------- */

    function select(id) {
      selected = id;
      Object.keys(balls).forEach(function (k) { balls[k].classList.toggle('is-picked', Number(k) === id); });
      place(false);
      label();
    }

    function tap(id) {
      if (!playing || locked) return;
      if (selected == null) { select(id); api.audio.play('select'); return; }
      if (selected === id) { select(null); api.audio.play('click'); return; }
      if (sideOf(selected) === sideOf(id)) { select(id); api.audio.play('select'); return; }
      attempt(selected, id);
    }

    function attempt(x, y) {
      var aId = sideOf(x) === 'A' ? x : y;
      var bId = aId === x ? y : x;
      select(null);
      var verdict = opts.onSwap(aId, bId);
      if (verdict === 'ok' || verdict === 'wrong') {
        // Right or wrong, the pair trades places; a wrong one also shakes.
        var from = { a: posOf(aId), b: posOf(bId) };
        bd = R.apply(bd, aId, bId);
        swapAnim(aId, from.a, posOf(aId), 1);
        swapAnim(bId, from.b, posOf(bId), -1);
        if (verdict === 'ok') api.audio.play('correct');
        else wrong([aId, bId], true);
      } else {
        place(true);
      }
      label();
    }

    /* Both balls set off together and cross in the air, one over the other. */
    function swapAnim(id, from, to, way) {
      var b = balls[id];
      var end = xf(to, 0);
      b.style.transform = end;
      b._at = end;
      if (calm || !b.animate || !from) { land(b, to, id); return; }
      var mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - way * D * 0.9 };
      b.classList.add('is-flying');
      var anim = b.animate([
        { transform: xf(from, 0) },
        { transform: xf(mid, 0) + ' scale(1.12)', offset: 0.5 },
        { transform: end }
      ], { duration: SWAP_MS, easing: 'cubic-bezier(.45,.05,.35,1)' });
      anim.onfinish = function () { b.classList.remove('is-flying'); land(b, to, id); };
    }

    /* The balls near a landing get bumped away from it, bounce back, and
       settle a little differently than before, like real balls in a bowl.
       They never leave their own slot by more than a fraction of a ball,
       so taps and drags still find them. */
    var JOSTLE_REACH = 2.6;   // in balls
    var JOSTLE_PUSH = 0.24;   // the biggest bump, in balls
    var REST_MAX = 0.09;      // how far a settled ball may sit from its slot
    function jostle(landed, at) {
      var side = sideOf(landed);
      var ids = side === 'A' ? bd.a : bd.b;
      ids.forEach(function (id) {
        if (id === landed || id === selected) return;
        var b = balls[id];
        if (!b || !b.animate || b.classList.contains('is-flying')) return;
        var p = posOf(id);
        if (!p) return;
        var dx = p.x - at.x, dy = p.y - at.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var near = 1 - dist / (JOSTLE_REACH * D);
        if (near <= 0) return;
        var push = JOSTLE_PUSH * near * D;
        var bump = { x: p.x + dx / dist * push, y: p.y + dy / dist * push * 0.6 };
        // A new resting spot: drift the way it was pushed, plus a little chance.
        var old = rest[id] || { x: 0, y: 0 };
        var nx = old.x + (dx / dist) * near * 0.05 + (Math.random() - 0.5) * 0.06;
        var ny = old.y + (dy / dist) * near * 0.03 + (Math.random() - 0.5) * 0.04;
        rest[id] = {
          x: Math.max(-REST_MAX, Math.min(REST_MAX, nx)),
          y: Math.max(-REST_MAX, Math.min(REST_MAX, ny))
        };
        var to = xf(posOf(id), 0);
        b.style.transform = to;
        b._at = to;
        b.animate([
          { transform: xf(p, 0) },
          { transform: xf(bump, 0), offset: 0.35 },
          { transform: to }
        ], { duration: 420 + Math.round(near * 140), easing: 'cubic-bezier(.25,.8,.3,1.15)' });
      });
    }

    /* A little squash and a ripple as a ball drops into its new bowl. */
    function land(b, at, id) {
      if (calm) return;
      if (id != null) jostle(id, at);
      b.classList.remove('is-land');
      void b.offsetWidth;
      b.classList.add('is-land');
      later(function () { b.classList.remove('is-land'); }, 380);
      var ring = FF.ui.span('bs-ripple');
      ring.style.left = at.x + 'px';
      ring.style.top = (at.y + D * 0.35) + 'px';
      layer.appendChild(ring);
      later(function () { if (ring.parentNode) ring.parentNode.removeChild(ring); }, 600);
    }

    /* A mistake: both balls shake the same, so nothing says which was wrong. */
    function wrong(ids, swapped) {
      api.audio.play('wrong');
      buzz(70);
      if (!swapped) place(true);
      // After a swap, the balls shake once they have landed.
      later(function () {
        ids.forEach(function (id) {
          var b = balls[id];
          if (!b) return;
          b.classList.remove('is-wrong');
          void b.offsetWidth;
          b.classList.add('is-wrong');
          later(function () { b.classList.remove('is-wrong'); }, 480);
        });
      }, swapped && !calm ? SWAP_MS : 0);
      if (!calm) {
        arena.classList.remove('is-shake');
        void arena.offsetWidth;
        arena.classList.add('is-shake');
        later(function () { arena.classList.remove('is-shake'); }, 380);
      }
      lives.classList.remove('is-bump');
      void lives.offsetWidth;
      lives.classList.add('is-bump');
    }

    /* ---------- dragging ---------- */

    function local(e) {
      var r = layer.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onDown(e) {
      if (e.button != null && e.button > 0) return;
      if (!playing || locked || drag) return;
      var id = e.currentTarget._id;
      if (e.cancelable) e.preventDefault();
      drag = { id: id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved && dx * dx + dy * dy < DRAG_PX * DRAG_PX) return;
      var b = balls[drag.id];
      if (!drag.moved) {
        drag.moved = true;
        if (selected != null && selected !== drag.id) select(null);
        b.classList.add('is-drag');
      }
      var p = local(e);
      b.style.transform = xf(p, 0) + ' scale(1.15)';
    }

    function endDrag() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      var d = drag;
      drag = null;
      if (d) balls[d.id].classList.remove('is-drag');
      return d;
    }

    /* The ball under a point, in the other bowl only. */
    function ballAt(p, side) {
      var ids = side === 'A' ? bd.a : bd.b;
      var hit = null, bestD = D * 0.75;
      ids.forEach(function (id, i) {
        var s = slots[side][i];
        var dist = Math.sqrt((s.x - p.x) * (s.x - p.x) + (s.y - p.y) * (s.y - p.y));
        if (dist < bestD) { bestD = dist; hit = id; }
      });
      return hit;
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      var d = endDrag();
      if (!d.moved) { tap(d.id); return; }
      if (!playing || locked) { place(true); return; }
      var other = sideOf(d.id) === 'A' ? 'B' : 'A';
      var target = ballAt(local(e), other);
      // Dropped anywhere but on a ball in the other bowl: it goes back, and that is no mistake.
      if (target == null) { place(true); return; }
      attempt(d.id, target);
    }

    function onCancel() { endDrag(); place(true); }

    /* ---------- the rest ---------- */

    function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }

    function renderLives(mistakes) {
      FF.ui.clear(lives);
      if (cfg.mistakes < 0) {
        lives.appendChild(FF.ui.span('bs-lives__label', t('bsMistakesN', 'Mistakes: {n}', { n: mistakes })));
        return;
      }
      var leftN = Math.max(0, cfg.mistakes - mistakes);
      lives.appendChild(FF.ui.span('bs-lives__label', t('bsMistakesOf', 'Mistakes: {n}/{max}', { n: Math.min(mistakes, cfg.mistakes), max: cfg.mistakes })));
      var pips = FF.ui.span('bs-lives__pips');
      for (var i = 0; i < cfg.mistakes; i++) {
        var pip = FF.ui.span('bs-pip' + (i < mistakes ? ' is-used' : ''));
        pip.appendChild(icon(i < mistakes ? 'x' : 'heart-fill'));
        pips.appendChild(pip);
      }
      if (cfg.mistakes) lives.appendChild(pips);
      lives.appendChild(FF.ui.span('bs-lives__left', cfg.mistakes === 0 ? t('bsNoneAllowed', 'one and you are out')
        : leftN === 0 ? t('bsLastChance', 'next one is out') : t('bsLeft', '{n} left', { n: leftN })));
    }
    renderLives(0);

    function teardown() {
      dead = true;
      timers.forEach(clearTimeout);
      timers = [];
      if (ro) { ro.disconnect(); ro = null; }
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      endDrag();
    }

    var shownSwaps = 0;
    return {
      stage: stage,
      arena: arena,
      rivals: rivals,
      mount: function (root) {
        root.appendChild(stage);
        fit();
        later(fit, 60);
      },
      /* The board as it really is (the referee's, or after a correction). */
      sync: function (next) {
        if (!next) return;
        if (JSON.stringify(next.a) === JSON.stringify(bd.a) && JSON.stringify(next.b) === JSON.stringify(bd.b)) return;
        bd = { a: next.a.slice(), b: next.b.slice() };
        if (selected != null && !drag) select(null);
        place(true);
        label();
      },
      setPlaying: function (on) {
        playing = !!on;
        arena.classList.toggle('is-live', playing);
        if (!playing && selected != null) select(null);
      },
      setTime: function (leftMs) {
        timeStat.value.textContent = R.clock(Math.max(0, leftMs) + 999);
        timeStat.el.classList.toggle('is-low', playing && leftMs <= 10000);
      },
      setCounts: function (swaps, mistakes) {   // swaps = pairs home now
        swapStat.value.textContent = swaps + '/' + pz.need;
        if (swaps !== shownSwaps && !calm) {
          swapStat.el.classList.remove('is-bump');
          void swapStat.el.offsetWidth;
          swapStat.el.classList.add('is-bump');
        }
        shownSwaps = swaps;
        renderLives(mistakes);
      },
      hideRules: function (hide) {
        rulesList.classList.toggle('hidden', !!hide);
        rulesHidden.classList.toggle('hidden', !hide);
      },
      /* Big centred text over the bowls: the countdown or the end. kind: count | go | done | out | time | wait | null */
      overlay: function (kind, big, lines, extra) {
        if (!kind) { overlay.classList.add('hidden'); overlay.className = 'bs-overlay hidden'; return; }
        overlay.className = 'bs-overlay is-' + kind;
        FF.ui.clear(overlay);
        overlay.appendChild(FF.ui.div('bs-overlay__big', big));
        (lines || []).forEach(function (l) { if (l) overlay.appendChild(FF.ui.div('bs-overlay__line', l)); });
        if (extra) overlay.appendChild(extra);
        if (kind === 'count' && !calm) { void overlay.offsetWidth; overlay.classList.add('is-tick'); }
      },
      lock: function () {
        locked = true;
        playing = false;
        select(null);
        endDrag();
        arena.classList.add('is-over');
        arena.classList.remove('is-live');
        place(false);
      },
      wrong: wrong,
      destroy: teardown,
      alive: function () { return !dead && arena.isConnected; }
    };
  }

  /* ================= results (solo and online) =================
     rows: [{ who: { id, name, avatar, color, photo }, place, points, swaps, mistakes, done, out, used, accuracy, me }] */
  function resultsTable(rows) {
    var table = FF.ui.el('ol', { class: 'bs-table' });
    rows.forEach(function (r) {
      var li = FF.ui.el('li', { class: 'bs-row' + (r.place === 1 && (r.done || r.placed) ? ' is-winner' : '') + (r.out ? ' is-out' : '') + (r.me ? ' is-me' : '') });
      if (rows.length > 1) li.appendChild(FF.ui.span('bs-row__rank', String(r.place)));
      li.appendChild(FF.Players.avatarEl(r.who, 'bs-row__ava'));
      var who = FF.ui.span('bs-row__who');
      who.appendChild(FF.ui.span('bs-row__name', r.who.name + (r.me && rows.length > 1 ? ' ' + t('youTag', '(you)') : '')));
      var status = r.done ? t('bsStatusDone', 'Finished in {time}', { time: R.exactTime(r.used) })
        : r.out ? t('bsStatusOut', 'Eliminated') : t('bsStatusTime', 'Out of time');
      who.appendChild(FF.ui.span('bs-row__status', status));
      li.appendChild(who);
      var nums = FF.ui.span('bs-row__nums');
      nums.appendChild(cell(t('bsBallsMoved', 'Balls moved'), String(((r.swaps || 0) + (r.mistakes || 0)) * 2)));
      nums.appendChild(cell(t('bsMistakes', 'Mistakes'), String(r.mistakes)));
      nums.appendChild(cell(t('bsAccuracy', 'Accuracy'), r.accuracy + '%'));
      li.appendChild(nums);
      li.appendChild(FF.ui.span('bs-row__pts', FF.util.formatNumber(r.points)));
      table.appendChild(li);
    });
    return table;

    function cell(lbl, value) {
      var c = FF.ui.span('bs-cell');
      c.appendChild(FF.ui.span('bs-cell__label', lbl));
      c.appendChild(FF.ui.span('bs-cell__value', value));
      return c;
    }
  }

  function headline(rows, solo) {
    if (solo) {
      var r = rows[0];
      return r.done ? t('bsSoloDone', 'All swapped!') : r.out ? t('bsSoloOut', 'Eliminated') : t('timesUp', 'Time’s up!');
    }
    var top = rows.filter(function (x) { return x.place === 1 && (x.done || x.placed); });
    if (!top.length) return t('bsNobody', 'Nobody swapped a ball');
    if (top.length > 1) return t('bsDraw', 'It’s a draw!');
    return top[0].me ? t('bsYouWin', 'You win!') : t('bsWins', '{name} wins!', { name: top[0].who.name });
  }

  /* ================= solo ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = (FF.Storage && FF.Storage.get('ballSwap:setup', null)) || null;
    var gs = R.sanitize(Object.assign({}, R.STANDARD, saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'bs bs-setup' });
    stage.appendChild(FF.GameUI.kicker(t('bsName', 'Ball Swap')));
    stage.appendChild(FF.GameUI.prompt(t('bsSetupTitle', 'Set up your swap'), 'md'));
    var box = FF.ui.el('section', { class: 'settings-section bs-setup__rows' });
    var note = FF.ui.el('p', { class: 'gm-note', 'aria-live': 'polite' });
    function render() {
      FF.ui.clear(box);
      fields().forEach(function (f) {
        if (f.note) { box.appendChild(FF.ui.el('p', { class: 'gm-note' }, f.note)); return; }
        box.appendChild(FF.UI.settingRow(f.label, FF.UI.segmented({
          label: f.label, value: gs[f.key], options: f.options,
          onChange: function (v) { gs[f.key] = v; note.textContent = summary(gs); }
        })));
      });
      note.textContent = summary(gs);
    }
    render();
    stage.appendChild(box);
    stage.appendChild(note);
    var row = FF.ui.div('bs-setup__actions');
    row.appendChild(FF.UI.button(t('bsStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () { api.audio.play('click'); gs = R.sanitize(R.STANDARD); render(); }
    }));
    row.appendChild(FF.GameUI.action(t('bsStart', 'Start swapping'), function () {
      api.audio.play('select');
      var cfg = R.sanitize(gs);
      try { if (FF.Storage) FF.Storage.set('ballSwap:setup', cfg); } catch (e) { /* storage full */ }
      onGo(cfg);
    }, { icon: 'play' }));
    stage.appendChild(row);
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function playSolo(api, cfg) {
    if (!R.isStandard(cfg)) api.config.customRules = true;
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var pz = R.deal(cfg, randInt);
    var lines = R.instructions(pz);
    var bd = R.board(pz);
    var st = { swaps: 0, mistakes: 0, done: false, out: false, used: 0 };
    var limit = cfg.seconds * 1000;
    var g = -COUNT_MS;           // game time; negative during the 3-2-1
    var started = false, ended = false;
    var last = 0, tick = 0, lastCount = null;
    var me = (api.config.scorers || [])[0] || { id: 'me', name: t('you', 'You') };

    var view = board(api, {
      puzzle: pz, settings: cfg, board: bd, lines: lines,
      onSwap: function (aId, bId) {
        if (ended) return null;
        var v = R.check(pz, bd, aId, bId);
        if (v === 'ok' || v === 'wrong') bd = R.apply(bd, aId, bId);   // a wrong pair swaps too
        if (v === 'ok') {
          st.swaps++;
          if (R.solved(pz, bd)) { st.done = true; st.used = Math.max(0, g); setTimeout(function () { end('done'); }, SWAP_MS); }
        } else if (v === 'wrong') {
          st.mistakes++;
          if (R.knockedOut(cfg, st.mistakes)) { st.out = true; setTimeout(function () { end('out'); }, SWAP_MS + 300); }
        }
        st.placed = R.placed(pz, bd);
        view.setCounts(st.placed, st.mistakes);
        if (st.done || st.out) view.lock();
        return v;
      }
    });
    view.mount(root);
    view.setTime(limit);

    // The briefing: read the instructions, then start the clock yourself.
    var go = FF.GameUI.action(t('bsGo', 'Start'), function () {
      if (started) return;
      started = true;
      api.audio.play('select');
      last = Date.now();
      tick = setInterval(frame, 100);
      frame();
    }, { icon: 'play' });
    go.classList.add('bs-startbtn');
    view.overlay('wait', t('bsReady', 'Ready?'), [t('bsReadSolo', 'Read the instructions, then press Start.')], go);
    try { go.focus({ preventScroll: true }); } catch (e) { /* old browser */ }

    function paused() {
      var screen = document.getElementById ? document.getElementById('game-screen') : null;
      return !!(screen && screen.querySelector && screen.querySelector('.pause-overlay'));
    }

    function frame() {
      if (ended) return;
      if (!view.alive()) { clearInterval(tick); view.destroy(); return; }
      var now = Date.now();
      if (!paused()) g += Math.min(250, now - last);
      last = now;
      if (g < 0) {
        var c = Math.ceil(-g / 1000);
        if (c !== lastCount) { lastCount = c; view.overlay('count', String(c)); api.audio.play('countdown'); }
        return;
      }
      if (lastCount !== 0) {
        lastCount = 0;
        view.overlay('go', t('bsGoBig', 'Swap!'));
        setTimeout(function () { if (!ended) view.overlay(null); }, 600);
        api.audio.play('roundStart');
        view.setPlaying(true);
        if (cfg.show === 'start') view.hideRules(true);
      }
      view.setTime(limit - g);
      if (g >= limit && !st.done && !st.out) end('time');
    }

    function end(kind) {
      if (ended) return;
      ended = true;
      clearInterval(tick);
      view.lock();
      if (kind === 'done') {
        api.audio.play('winner');
        view.overlay('done', t('bsComplete', 'Complete!'), [R.exactTime(st.used)]);
        if (!reduceMotion() && FF.Confetti) FF.Confetti.burst(90);
      } else if (kind === 'out') {
        api.audio.play('wrong');
        buzz([90, 60, 140]);
        view.overlay('out', t('bsEliminated', 'Eliminated'), [t('bsTooMany', 'Too many mistakes')]);
      } else {
        api.audio.play('roundEnd');
        view.overlay('time', t('timesUp', 'Time’s up!'), [t('bsSwapsOf', '{n} of {total} swaps', { n: st.placed || 0, total: pz.need })]);
      }
      if (FF.UI.announce) FF.UI.announce(kind === 'done' ? t('bsComplete', 'Complete!') : kind === 'out' ? t('bsEliminated', 'Eliminated') : t('timesUp', 'Time’s up!'));
      setTimeout(function () {
        view.destroy();
        if (!api.shell.root.isConnected) return;
        soloResults(api, cfg, pz, me, st);
      }, 1700);
    }
  }

  function soloResults(api, cfg, pz, me, st) {
    var root = api.shell.root;
    FF.ui.clear(root);
    var rows = R.ranked({ me: st }, ['me'], pz.need, cfg).map(function (r) {
      return Object.assign(r, { who: me, me: true });
    });
    var r = rows[0];
    var key = [cfg.level, cfg.colours, cfg.seconds, cfg.mistakes, cfg.show].join('|');
    var bests = (FF.Storage && FF.Storage.get('ballSwap:best', {})) || {};
    var had = bests[key];
    var isBest = !had || r.points > had;
    if (isBest) { bests[key] = r.points; try { FF.Storage.set('ballSwap:best', bests); } catch (e) { /* storage full */ } }

    var stage = FF.GameUI.stage({ center: true, className: 'bs bs-results' });
    stage.appendChild(FF.GameUI.kicker(t('bsName', 'Ball Swap') + ' · ' + levelLabel(cfg.level)));
    stage.appendChild(FF.GameUI.prompt(headline(rows, true), 'xl'));
    stage.appendChild(FF.ui.div('bs-results__score', FF.util.formatNumber(r.points)));
    if (isBest && had != null) stage.appendChild(FF.GameUI.feedback('good', t('bsNewBest', 'New personal best!')));
    else if (had != null && !isBest) stage.appendChild(FF.GameUI.note(t('bsYourBest', 'Your best on these settings: {n}', { n: FF.util.formatNumber(had) })));
    stage.appendChild(resultsTable(rows));
    var actions = FF.ui.div('bs-setup__actions');
    actions.appendChild(FF.UI.button(t('bsPlayAgain', 'Play again'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () { api.audio.play('select'); playSolo(api, cfg); }
    }));
    actions.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
      api.audio.play('select');
      api.scoring.set(me.id, r.points);
      api.end({
        results: [{ id: me.id, name: me.name, avatar: me.avatar, color: me.color, photo: me.photo, points: r.points, correct: r.swaps }],
        winnerId: me.id
      });
    }, { icon: 'trophy' }));
    stage.appendChild(actions);
    root.appendChild(stage);
    if (r.done && !reduceMotion() && FF.Confetti) setTimeout(function () { if (stage.isConnected) FF.Confetti.rain(100); }, 300);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= online ================= */

  function online(api, room) {
    var root = api.shell.root;
    api.shell.hideTimer();
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });

    var ended = false;
    var view = null;          // the board for the match on screen
    var viewMatch = null;
    var finishedShown = false;
    var lastCount = null;
    var nudged = {};
    var stuck = false;
    var autoScores = null;
    var pending = null;
    var rivalDone = {};
    var client = FF.BallSwapClient.create({ room: room, onChange: schedule });
    var ticker = setInterval(tick, 150);

    function expectedMatch() { return room.meta && room.meta.bsMatch; }
    function nameOf(uid) { var p = (room.players || {})[uid]; return (p && p.name) || t('bsPlayer', 'Player'); }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('bsPlayer', 'Player'), avatar: p.avatar || null, color: p.color || null, photo: p.photo || null };
    }

    function schedule() {
      if (pending) return;
      pending = setTimeout(function () { pending = null; render(); }, 0);
    }

    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      if (view) view.destroy();
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }

    function finish() {
      if (ended) return;
      cleanup();
      api.end({});
    }

    function notHere(bs) { return !bs || (expectedMatch() && bs.matchId !== expectedMatch()); }

    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.BallSwapApi.nudge(room.code);
    }

    function waitingScreen(title, sub) {
      var stage = FF.GameUI.stage({ center: true, className: 'bs bs-wait' });
      stage.appendChild(FF.ui.div('bs-wait__spin'));
      stage.appendChild(FF.GameUI.prompt(title, 'md'));
      if (sub) stage.appendChild(FF.GameUI.sub(sub));
      if (stuck && room.isHost) {
        stage.appendChild(FF.UI.button(t('bsBackToRoom', 'Back to the room'), {
          class: 'btn-soft', icon: 'arrow-left',
          onClick: function () { FF.Room.playAgain().catch(function () { /* not the host any more */ }); }
        }));
      }
      return stage;
    }

    function render() {
      if (ended) return;
      if (!root.isConnected) { cleanup(); return; }
      var v = client.view();
      var bs = v.bs;
      if (notHere(bs)) {
        if (view) { view.destroy(); view = null; viewMatch = null; }
        FF.ui.clear(root);
        root.appendChild(stuck
          ? waitingScreen(t('bsStuck', 'Still waiting for the game server…'), room.isHost
            ? t('bsStuckHost', 'It is taking longer than it should. Keep waiting, or go back to the room and start again.')
            : t('bsStuckGuest', 'It is taking longer than it should. The host can go back to the room and start again.'))
          : waitingScreen(t('bsGettingReady', 'Dealing the balls…'), t('bsGettingReadySub', 'Everyone gets the same bowls, and starts at the same moment.')));
        return;
      }
      if (bs.phase === 'ended') { if (!finishedShown) showEnd(bs, v); return; }
      if (!v.seated) {
        if (view) { view.destroy(); view = null; }
        FF.ui.clear(root);
        root.appendChild(waitingScreen(t('bsWatching', 'This game started without you'), t('bsWatchingSub', 'You can join the next one. Here is how everyone is doing:')));
        root.firstChild.appendChild(rivalList(bs, null));
        return;
      }
      if (!view || viewMatch !== bs.matchId) build(bs, v);
      update(bs, v);
    }

    function build(bs, v) {
      if (view) view.destroy();
      FF.ui.clear(root);
      viewMatch = bs.matchId;
      lastCount = null;
      rivalDone = {};
      view = board(api, {
        puzzle: bs.puzzle, settings: bs.settings, board: v.board || bs.p[v.uid], lines: R.instructions(bs.puzzle), room: true,
        onSwap: function (aId, bId) {
          var verdict = client.swap(aId, bId);
          var now = client.view();
          view.setCounts(now.placed, now.mistakes);
          return verdict;
        }
      });
      view.mount(root);
      if (FF.Race && FF.Race.describe) FF.Race.describe({ kind: 'card', text: t('bsTv', 'Everyone is swapping the same balls: {s}', { s: summary(bs.settings) }) }, null);
    }

    function update(bs, v) {
      var me = v.me;
      if (!v.pending && v.board) view.sync(v.board);
      view.setCounts(v.placed, v.mistakes);
      renderRivals(bs, v);
      if (me && (me.done || me.out)) {
        view.lock();
        if (me.done) view.overlay('done', t('bsComplete', 'Complete!'), [R.exactTime(me.used), placeLine(bs, v.uid)]);
        else view.overlay('out', t('bsEliminated', 'Eliminated'), [t('bsTooMany', 'Too many mistakes'), t('bsWatchOthers', 'Watch the others finish')]);
        if (!view._ended) {
          view._ended = true;
          if (me.done) { api.audio.play('winner'); if (!reduceMotion() && FF.Confetti && bs.first === v.uid) FF.Confetti.burst(90); }
          else { api.audio.play('wrong'); buzz([90, 60, 140]); }
        }
      }
      tick();
    }

    function placeLine(bs, uid) {
      var done = bs.order.filter(function (u) { return bs.p[u] && bs.p[u].done; })
        .sort(function (x, y) { return bs.p[x].doneAt - bs.p[y].doneAt; });
      var i = done.indexOf(uid);
      if (i === 0) return t('bsFirst', 'You finished first!');
      return i > 0 ? t('bsPlaceN', 'You finished #{n}', { n: i + 1 }) : '';
    }

    function rivalList(bs, meUid) {
      var wrap = FF.ui.div('bs-rivals');
      bs.order.forEach(function (uid) {
        if (uid === meUid) return;
        var r = bs.p[uid] || {};
        var chip = FF.ui.div('bs-rival' + (r.out ? ' is-out' : '') + (r.done ? ' is-done' : ''));
        chip.appendChild(FF.Players.avatarEl(who(uid), 'bs-rival__ava'));
        var body = FF.ui.span('bs-rival__body');
        body.appendChild(FF.ui.span('bs-rival__name', nameOf(uid)));
        var bar = FF.ui.span('bs-rival__bar');
        var fill = FF.ui.span('bs-rival__fill');
        fill.style.width = Math.round((r.placed || 0) / Math.max(1, bs.puzzle.need) * 100) + '%';
        bar.appendChild(fill);
        body.appendChild(bar);
        chip.appendChild(body);
        var stt = FF.ui.span('bs-rival__state');
        if (r.out) { stt.appendChild(icon('x-circle')); stt.appendChild(document.createTextNode(t('bsOut', 'Out'))); }
        else if (r.done) { stt.appendChild(icon('check')); stt.appendChild(document.createTextNode(R.exactTime(r.used))); }
        else stt.textContent = (r.placed || 0) + '/' + bs.puzzle.need + (r.mistakes ? ' · ' + r.mistakes + '✕' : '');
        chip.appendChild(stt);
        wrap.appendChild(chip);
      });
      return wrap;
    }

    function renderRivals(bs, v) {
      if (!view || !view.rivals) return;
      var fresh = rivalList(bs, v.uid);
      FF.ui.clear(view.rivals);
      while (fresh.firstChild) view.rivals.appendChild(fresh.firstChild);
      view.rivals.classList.toggle('hidden', !view.rivals.children.length);
      bs.order.forEach(function (uid) {
        var r = bs.p[uid];
        if (uid === v.uid || !r || !r.done || rivalDone[uid]) return;
        rivalDone[uid] = true;
        api.shell.toast(bs.first === uid ? t('bsRivalFirst', '{name} finished first!', { name: nameOf(uid) }) : t('bsRivalDone', '{name} finished', { name: nameOf(uid) }));
      });
    }

    /* The clock, the countdown and the last call, from the server's time. */
    function tick() {
      if (ended) return;
      var bs = client.view().bs;
      if (notHere(bs)) {
        var due = (room.meta && room.meta.startAt) || 0;
        if (!due) return;
        var late = client.serverNow() - due;
        if (late >= NUDGE_MS) maybeNudge('start' + Math.floor((late - NUDGE_MS) / RENUDGE_MS), due);
        if ((late >= STUCK_MS) !== stuck) { stuck = late >= STUCK_MS; schedule(); }
        return;
      }
      if (!view || bs.phase === 'ended') return;
      var now = client.serverNow();
      var me = bs.p[client.view().uid] || {};
      if (bs.phase === 'starting') {
        var toGo = (bs.openAt || bs.startAt) - now;
        view.setPlaying(false);
        view.setTime(bs.settings.seconds * 1000);
        if (toGo > COUNT_MS) {
          var s = Math.ceil(toGo / 1000);
          if (lastCount !== 'w' + s) {
            lastCount = 'w' + s;
            view.overlay('wait', t('bsGetReady', 'Get ready'), [t('bsStudy', 'Learn the instructions above. Starting in {n}s', { n: s })]);
          }
        } else {
          var c = Math.max(1, Math.ceil(toGo / 1000));
          if (lastCount !== c) { lastCount = c; view.overlay('count', String(c)); api.audio.play('countdown'); }
        }
        maybeNudge('s', bs.openAt || bs.startAt);
        return;
      }
      // playing
      var close = bs.closeAt ? Math.min(bs.closeAt, bs.deadline) : bs.deadline;
      if (lastCount !== 0) {
        lastCount = 0;
        if (!me.done && !me.out) {
          view.overlay('go', t('bsGoBig', 'Swap!'));
          setTimeout(function () { if (view && !view._ended) view.overlay(null); }, 600);
          api.audio.play('roundStart');
        }
        if (bs.settings.show === 'start') view.hideRules(true);
      }
      if (!me.done && !me.out) {
        view.setPlaying(now < close);
        if (bs.closeAt && bs.closeAt < bs.deadline && !view._lastCall) {
          view._lastCall = true;
          view.stage.classList.add('is-lastcall');
        }
      }
      view.setTime(close - now);
      maybeNudge('c', close);
    }

    /* ---------- the end ---------- */

    function showEnd(bs, v) {
      finishedShown = true;
      if (view) { view.destroy(); view = null; }
      FF.ui.clear(root);
      var res = bs.result || { rows: [] };
      var rows = (res.rows || []).map(function (r) { return Object.assign({}, r, { who: who(r.uid), me: r.uid === v.uid }); });
      var stage = FF.GameUI.stage({ center: true, className: 'bs bs-results' });
      stage.appendChild(FF.GameUI.kicker(t('bsName', 'Ball Swap') + ' · ' + summary(bs.settings)));
      stage.appendChild(FF.GameUI.prompt(headline(rows, false), 'xl'));
      var winners = rows.filter(function (r) { return r.place === 1 && (r.done || r.placed); });
      var second = rows.filter(function (r) { return r.place === 2; })[0];
      if (winners.length === 1 && second) stage.appendChild(FF.GameUI.sub(t('bsRunnerUp', 'Runner-up: {name}', { name: second.me ? t('you', 'You') : second.who.name })));
      var why = res.why === 'time' ? t('bsWhyTime', 'Time ran out, so the most swaps counted.')
        : res.why === 'lastCall' ? t('bsWhyLast', 'The last call ran out after the first finish.') : '';
      if (why) stage.appendChild(FF.GameUI.note(why));
      stage.appendChild(resultsTable(rows));
      stage.appendChild(FF.GameUI.action(t('bsSeeScores', 'See scores'), function () { api.audio.play('click'); finish(); }, { icon: 'trophy' }));
      root.appendChild(stage);
      var mine = rows.filter(function (r) { return r.me; })[0];
      var won = mine && winners.length === 1 && winners[0].me;
      api.audio.play(won ? 'winner' : 'roundEnd');
      if (won && !reduceMotion() && FF.Confetti) FF.Confetti.rain(140);
      if (FF.UI.announce) FF.UI.announce(headline(rows, false));
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  /* ================= registration ================= */

  FF.registerGame({
    id: 'ballSwap',
    name: 'Ball Swap',
    description: 'Two bowls of coloured balls. Swap them two at a time into the bowl each colour belongs in. One wrong pair is a mistake. First to finish wins.',
    category: 'reaction',
    icon: '🔴',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 2,
    tags: ['quick', 'reaction', 'puzzle', 'online'],
    modes: ['solo'],
    defaultMode: 'solo',
    // Not on the leaderboards yet: the server would need to list it too (Leaderboards::GAMES).
    leaderboard: false,
    howToPlay: [
      'There are two bowls, A and B. The instructions say which colours belong in which bowl.',
      'Every move is a swap: tap a ball in A, then a ball in B (or drag one onto the other). Both trade places at once.',
      'Both balls should be heading home. A wrong pair still swaps, but it is one mistake and you have to swap them back.',
      'Too many mistakes and you are out. Online, everyone gets the same bowls and the first to finish wins.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (api.config.room && room) { online(api, room); return; }
      if (api.config.daily || api.config.challenge) { playSolo(api, R.sanitize(R.STANDARD)); return; }
      setupScreen(api, function (cfg) { playSolo(api, cfg); });
    }
  });

  FF.BallSwapGame = { summary: summary, fields: fields, lineText: lineText };
})();
