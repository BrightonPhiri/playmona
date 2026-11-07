/* ============================================================
   PLAYMONA — games/sortRush.js
   SortRush: mixed-colour objects in holders. Move them until every
   holder holds one colour. Four looks on one engine: nuts on bolts,
   balls in tubes, rings on pegs and blocks in trays; three board
   themes (Workshop, Candy, Neon), each player's own choice.

   - Race: everyone gets the same puzzle; first to sort it wins.
   - Timed Score: clear as many puzzles as you can before time runs
     out (100 a holder, 200 a puzzle, plus a bounded efficiency bonus).

   Solo and pass-and-play run the shared rules (FF.SortRushRules)
   here. Online rooms are refereed on the server
   (js/sortrush/referee.js): this file draws, takes taps, drags and
   keys, predicts each move to animate it at once, and shows the
   referee's view (FF.SortRushClient). The referee always wins.

   Controls: tap a holder to lift its top object (or group), tap
   another to drop it there; tap the same holder to put it back.
   Or drag. Keyboard: arrows move between holders, Enter or Space
   picks, Esc puts back, U undoes. Nothing ever hints where an
   object should go.

   Looks: css/games.css (.srt-*), colours in css/tokens.css (--srt-*).
   (Not .sr-*: .sr-only is the app's screen-reader class.)
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SortRushRules;
  var COUNT_MS = 3000;            // the 3-2-1
  var NUDGE_MS = 8000;
  var RENUDGE_MS = 15000;
  var STUCK_MS = 30000;
  var AUTO_SCORES_MS = 90000;
  var DRAG_PX = 8;
  var FLY_MS = 430;
  var LAND_MS = 260;
  var STAGGER_MS = 46;

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }
  function icon(key) { return FF.Icons.icon(key); }

  function reduceMotion() {
    var setting = FF.Settings && FF.Settings.get && FF.Settings.get('reduceMotion');
    var os = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!(setting || os);
  }
  function animationsOn() { return !reduceMotion() && (!FF.Settings || !FF.Settings.get || FF.Settings.get('animations') !== false); }

  function buzz(pattern) {
    // Only after a touch (browsers refuse before), and only with sound effects on.
    if (FF.Audio && FF.Audio.effectsEnabled === false) return;
    var touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    try { if (touched && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ }
  }

  function rand() { return FF._rand ? FF._rand() : Math.random(); }
  function newSeed() { return 'L' + Math.floor(rand() * 1e9).toString(36) + Math.floor(rand() * 1e9).toString(36); }

  /* ---------- words ---------- */

  var COLOUR_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Cyan', 'Lime', 'Brown'];
  function colourName(c) { return t('srtColour' + c, COLOUR_NAMES[c] || '?'); }
  function modeLabel(m) { return m === 'score' ? t('srtModeScore', 'Timed Score') : t('srtModeRace', 'Race'); }
  function styleLabel(s) { return { nuts: t('srtNuts', 'Nuts'), balls: t('srtBalls', 'Balls'), rings: t('srtRings', 'Rings'), blocks: t('srtBlocks', 'Blocks') }[s]; }
  function styleThing(s, n) {
    var one = { nuts: t('srtNut', 'nut'), balls: t('srtBall', 'ball'), rings: t('srtRing', 'ring'), blocks: t('srtBlock', 'block') }[s];
    var many = { nuts: t('srtNutsLc', 'nuts'), balls: t('srtBallsLc', 'balls'), rings: t('srtRingsLc', 'rings'), blocks: t('srtBlocksLc', 'blocks') }[s];
    return n === 1 ? one : many;
  }
  function holderThing(s) { return { nuts: t('srtBolt', 'bolt'), balls: t('srtTube', 'tube'), rings: t('srtPeg', 'peg'), blocks: t('srtTray', 'tray') }[s]; }
  function levelLabel(l) { return { easy: t('srtEasy', 'Easy'), medium: t('srtMedium', 'Medium'), hard: t('srtHard', 'Hard'), expert: t('srtExpert', 'Expert'), custom: t('srtCustom', 'Custom') }[l]; }
  function moveLabel(m) { return m === 'group' ? t('srtGroup', 'Matching group') : t('srtSingle', 'One at a time'); }
  function limitLabel(l) { return { off: t('srtLimitOff', 'No limit'), relaxed: t('srtLimitRelaxed', 'Relaxed'), tight: t('srtLimitTight', 'Tight') }[l]; }
  function themeLabel(th) { return { workshop: t('srtWorkshop', 'Workshop'), candy: t('srtCandy', 'Candy'), neon: t('srtNeon', 'Neon') }[th]; }

  function summary(s) {
    s = R.sanitize(s);
    return [
      modeLabel(s.mode), styleLabel(s.style),
      levelLabel(s.level) + ' · ' + t('srtNColours', '{n} colours', { n: s.colours }) + ' × ' + s.size,
      t('srtNEmpty', '{n} empty', { n: s.empty }),
      moveLabel(s.move),
      s.seconds + 's',
      s.limit === 'off' ? t('srtNoMoveLimit', 'no move limit') : t('srtMoveLimitSum', '{l} move limit', { l: limitLabel(s.limit).toLowerCase() })
    ].join(' · ');
  }

  /* The setting rows, for the room lobby and the solo setup screen. Colours,
     size and empty holders show only for Custom (a level decides them otherwise). */
  function fields(gs) {
    gs = gs || {};
    function opt(label, value) { return { label: label, value: value }; }
    var out = [
      { key: 'mode', label: t('srtMode', 'Mode'), options: R.MODES.map(function (m) { return opt(modeLabel(m), m); }) },
      { key: 'style', label: t('srtStyle', 'Objects'), options: R.STYLES.map(function (s) { return opt(styleLabel(s), s); }) },
      { key: 'level', label: t('srtLevel', 'Difficulty'), redraw: true, options: R.LEVELS.map(function (l) { return opt(levelLabel(l), l); }) }
    ];
    if (gs.level === 'custom') {
      out.push({ key: 'colours', label: t('srtColours', 'Colours'), options: R.COLOURS.map(function (c) { return opt(String(c), c); }) });
      out.push({ key: 'size', label: t('srtSize', 'Per colour (holder size)'), options: R.SIZES.map(function (c) { return opt(String(c), c); }) });
      out.push({ key: 'empty', label: t('srtEmpty', 'Empty holders'), options: R.EMPTIES.map(function (c) { return opt(String(c), c); }) });
      out.push({ note: t('srtCustomNote', 'Each holder holds exactly one colour when sorted, so objects per colour and holder size are the same number. One empty holder is only offered up to {n} objects; bigger boards get two.', { n: R.ONE_EMPTY_MAX }) });
    }
    out.push({ key: 'move', label: t('srtMoveRule', 'Moves'), options: R.MOVES.map(function (m) { return opt(moveLabel(m), m); }) });
    out.push({ key: 'seconds', label: t('srtTime', 'Time'), options: R.SECONDS.map(function (s) { return opt(s >= 60 && s % 60 === 0 ? (s / 60) + 'm' : s + 's', s); }) });
    out.push({ key: 'limit', label: t('srtLimit', 'Move limit'), options: R.LIMITS.map(function (l) { return opt(limitLabel(l), l); }) });
    return out;
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function (gs) { return fields(gs); },
    sanitize: function (s) { return R.sanitize(s); },
    summary: function (s) { return summary(s); },
    start: function (room, pick) { return FF.SortRushApi.start(room, pick); }
  };

  /* ---------- this player's preferences ---------- */

  function pref(key, fallback) {
    var v = FF.Storage ? FF.Storage.get('sortRush:' + key, null) : null;
    return v == null ? fallback : v;
  }
  function setPref(key, v) { try { if (FF.Storage) FF.Storage.set('sortRush:' + key, v); } catch (e) { /* storage full */ } }
  function theme() { var th = pref('theme', 'workshop'); return R.THEMES.indexOf(th) !== -1 ? th : 'workshop'; }

  /* ---------- drawing ---------- */

  var GLYPHS = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/>'
  };
  function glyph(name) {
    var s = FF.ui.span('srt-glyph');
    s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[name] + '</svg>';
    return s;
  }

  /* Each style's shape: object width as a share of the holder, height per width,
     the holder's base and the gap above the stack, and how objects land. */
  var STYLE = {
    nuts:   { wf: 0.92, aspect: 0.40, base: 0.44, pad: 0.9, maxW: 108, land: 'screw' },
    balls:  { wf: 0.74, aspect: 1.00, base: 0.27, pad: 0.30, maxW: 92,  land: 'drop' },
    rings:  { wf: 0.96, aspect: 0.25, base: 0.48, pad: 1.4, maxW: 112, land: 'slide' },
    blocks: { wf: 0.80, aspect: 0.74, base: 0.42, pad: 0.30, maxW: 100, land: 'thud' }
  };

  function objectEl(style, c) {
    var o = FF.ui.span('srt-obj srt-obj--' + style);
    o.setAttribute('data-c', String(c));
    o.setAttribute('aria-hidden', 'true');
    // The inner wrapper bobs and lands as one piece; the outer element lifts and flies.
    var inner = FF.ui.span('srt-obj__in');
    inner.appendChild(FF.ui.span('srt-obj__body'));
    inner.appendChild(FF.ui.span('srt-obj__shine'));
    o.appendChild(inner);
    return o;
  }

  /* A holder's drawn parts, back to front: the shelf it stands on, the glow
     when it is finished, its post or glass (back), its foot, the stack of
     objects, then anything that sits in front (glass shine, the tray wall). */
  function holderParts(el) {
    el.appendChild(FF.ui.span('srt-holder__shelf'));
    var capEl = FF.ui.span('srt-holder__cap');
    el.appendChild(capEl);
    el.appendChild(FF.ui.span('srt-holder__back'));
    el.appendChild(FF.ui.span('srt-holder__foot'));
    var stack = FF.ui.span('srt-holder__stack');
    el.appendChild(stack);
    el.appendChild(FF.ui.span('srt-holder__front'));
    return { stack: stack, cap: capEl };
  }

  /* ================= the board =================
     opts: { settings, board: [holders], room (bool), turnText, startCopy,
             onMove(from, to) -> { res, board } | null,
             onCommand(type) -> { res, board } | null }
     Returns { stage, rivals, mount, setBoard(board, how), setPlaying, setTime, setStats,
               overlay, banner, lock, celebrate, destroy, alive } */
  function board(api, opts) {
    var cfg = R.sanitize(opts.settings);
    var style = cfg.style, cap = cfg.size, S = STYLE[style];
    var calm = reduceMotion();
    var vis = opts.board.slice();          // what is drawn
    var target = opts.board.slice();       // what the rules say (drawn once the animations catch up)
    var H = [];                            // per holder: { el, stack, objs: [el], cap }
    var selected = -1;
    var ops = [];                          // animations waiting their turn
    var running = false;
    var queuedTap = -1;
    var playing = false, locked = false, dead = false;
    var drag = null;
    var timers = [];
    var M = { ow: 40, oh: 40, base: 8, pad: 8, head: 40 };
    var focusIdx = 0;
    var ro = null;

    var stage = FF.GameUI.stage({ wide: true, className: 'srt srt--' + style });
    stage.setAttribute('data-srt-theme', theme());
    if (opts.turnText) stage.appendChild(FF.GameUI.kicker(opts.turnText));

    /* ---------- HUD ---------- */
    var hud = FF.ui.div('srt-hud');
    var modeChip = FF.ui.span('srt-chip', modeLabel(cfg.mode));
    var timeStat = stat('timer', t('srtTimeLeft', 'Time left'), R.clock(cfg.seconds * 1000));
    var moveStat = stat(null, t('srtMoves', 'Moves'), '0');
    var progStat = cfg.mode === 'score' ? stat('trophy', t('srtScore', 'Score'), '0') : stat('check', t('srtSorted', 'Sorted'), '0/' + cfg.colours);
    hud.appendChild(modeChip);
    hud.appendChild(timeStat.el);
    hud.appendChild(moveStat.el);
    hud.appendChild(progStat.el);
    var tools = FF.ui.div('srt-tools');
    var undoBtn = tool('undo', t('srtUndo', 'Undo'), function () { command('undo'); });
    var restartBtn = tool('restart', t('srtRestart', 'Restart'), function () { command('restart'); });
    tools.appendChild(undoBtn);
    tools.appendChild(restartBtn);
    if (cfg.mode === 'score') tools.appendChild(tool('skip', t('srtSkip', 'Skip'), function () { command('skip'); }));
    tools.appendChild(tool('palette', t('srtLook', 'Look'), function () { pickTheme(api, function (th) { stage.setAttribute('data-srt-theme', th); }); }));
    hud.appendChild(tools);
    stage.appendChild(hud);

    /* ---------- board + side panel ---------- */
    var main = FF.ui.div('srt-main');
    var wrap = FF.ui.div('srt-boardwrap');
    var boardEl = FF.ui.div('srt-board');
    boardEl.setAttribute('role', 'group');
    boardEl.setAttribute('aria-label', t('srtBoardLabel', '{n} {holders}. Sort every colour into a holder of its own.', { n: vis.length, holders: holderThing(style) + 's' }));
    wrap.appendChild(boardEl);
    var overlay = FF.ui.div('srt-overlay hidden');
    overlay.setAttribute('aria-live', 'polite');
    wrap.appendChild(overlay);
    var bannerEl = FF.ui.div('srt-banner hidden');
    bannerEl.setAttribute('role', 'status');
    wrap.appendChild(bannerEl);
    main.appendChild(wrap);
    var rivals = null;
    if (opts.room) {
      rivals = FF.ui.div('srt-rivals hidden');
      rivals.setAttribute('aria-label', t('srtRivals', 'The other players'));
      main.appendChild(rivals);
    }
    stage.appendChild(main);
    var how = FF.GameUI.note(t('srtHowShort', 'Tap a {holder} to lift, tap another to drop. Or drag.', { holder: holderThing(style) }));
    how.classList.add('srt-how');
    stage.appendChild(how);

    function stat(iconKey, label, value) {
      var el = FF.ui.div('srt-stat');
      if (iconKey) el.appendChild(icon(iconKey));
      var txt = FF.ui.span('srt-stat__text');
      txt.appendChild(FF.ui.span('srt-stat__label', label));
      var v = FF.ui.span('srt-stat__value', value);
      txt.appendChild(v);
      el.appendChild(txt);
      return { el: el, value: v };
    }
    function tool(g, label, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'srt-tool', 'aria-label': label, title: label });
      b.appendChild(glyph(g));
      b.appendChild(FF.ui.span('srt-tool__text', label));
      b.addEventListener('click', function () { if (!dead) fn(); });
      return b;
    }

    /* ---------- building the holders ---------- */

    function build(how) {
      FF.ui.clear(boardEl);
      H = [];
      selected = -1;
      vis.forEach(function (h, i) {
        var el = FF.ui.el('button', { type: 'button', class: 'srt-holder srt-holder--' + style });
        el._i = i;
        var parts = holderParts(el);
        var stack = parts.stack, capEl = parts.cap;
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('click', function (e) {
          // Taps and drags come in as pointer events; this is the keyboard path.
          if (e.detail === 0) tap(i);
        });
        el.addEventListener('focus', function () { focusIdx = i; });
        var objs = [];
        for (var k = 0; k < h.length; k++) {
          var o = objectEl(style, R.colourOf(h[k]));
          o.style.setProperty('--i', String(k));
          stack.appendChild(o);
          objs.push(o);
        }
        H.push({ el: el, stack: stack, objs: objs, cap: capEl });
        boardEl.appendChild(el);
        markDone(i, false);
      });
      layout();
      label();
      if (how === 'deal' && !calm) {
        var n = 0;
        H.forEach(function (hh) {
          hh.objs.forEach(function (o) {
            var delay = Math.min(900, n++ * 22);
            animate(o, [{ transform: 'translateY(-' + Math.round(M.head + M.oh * 2) + 'px) scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }],
              { duration: 380, delay: delay, easing: 'cubic-bezier(.2,.9,.3,1.25)', fill: 'backwards' });
          });
        });
      }
    }

    function markDone(i, celebrate) {
      var done = R.complete(vis[i], cap);
      var hh = H[i];
      if (!hh) return;
      var was = hh.el.classList.contains('is-done');
      hh.el.classList.toggle('is-done', done);
      if (done && !was && celebrate) sparkle(i);
    }

    /* Names say what is in a holder, never where it should go. */
    function label() {
      H.forEach(function (hh, i) {
        var h = vis[i];
        var parts = [];
        for (var k = 0; k < h.length; k++) parts.push(colourName(R.colourOf(h[k])));
        var txt = t('srtHolderLabel', '{thing} {n} of {total}', { thing: holderThing(style), n: i + 1, total: vis.length }) + ': ' +
          (parts.length ? parts.join(', ') + ' ' + t('srtTopLast', '(top last)') : t('srtEmptyHolder', 'empty'));
        if (R.complete(h, cap)) txt += ', ' + t('srtComplete', 'complete');
        if (selected === i) txt += ', ' + t('srtLifted', 'lifted');
        hh.el.setAttribute('aria-label', txt);
        hh.el.setAttribute('aria-pressed', selected === i ? 'true' : 'false');
        hh.el.tabIndex = i === focusIdx ? 0 : -1;
      });
    }

    /* ---------- sizing ---------- */

    function layout() {
      if (dead || !boardEl.isConnected) return;
      // The content width: clientWidth counts the wrapper's own side padding.
      var wcs = window.getComputedStyle(wrap);
      var w = Math.max(220, wrap.clientWidth - (parseFloat(wcs.paddingLeft) || 0) - (parseFloat(wcs.paddingRight) || 0) - 2 - 24);   // 24: the shelf's rounded ends overhang 12px a side
      var top = wrap.getBoundingClientRect().top;
      var availH = Math.max(150, (window.innerHeight || 640) - Math.max(0, top) - (window.innerHeight < 520 ? 24 : 64));
      var n = vis.length;
      var best = null;
      for (var rows = 1; rows <= 3; rows++) {
        var per = Math.ceil(n / rows);
        var gap = Math.floor(Math.max(6, Math.min(18, w * 0.02)));
        var hw = Math.min(S.maxW, (w - gap * (per - 1)) / per);
        var ow = hw * S.wf, oh = ow * S.aspect;
        var rowGap = 18;   // matches the board's row gap in CSS
        var fixed = function (o) { return o * (1.25) + 12; };     // the lift space above each holder
        var need = function (o) { return rows * (fixed(o) + hw * S.base + cap * o + o * S.pad) + (rows - 1) * rowGap; };
        if (need(oh) > availH) {
          // Shrink the objects (not the holders' spacing) to fit the height.
          var per1 = (availH - (rows - 1) * rowGap) / rows - 12 - hw * S.base;
          oh = Math.max(14, per1 / (cap + S.pad + 1.25));
          ow = Math.min(ow, oh / S.aspect);
        }
        var score = Math.min(ow, oh / S.aspect * 1) + (hw >= 46 ? 0 : -100);
        if (!best || score > best.score + 0.5) best = { rows: rows, per: per, hw: hw, ow: ow, oh: oh, gap: gap, score: score };
      }
      M.ow = Math.round(best.ow);
      M.oh = Math.round(best.oh);
      M.base = Math.round(best.hw * S.base);
      M.pad = Math.round(M.oh * S.pad);
      M.head = Math.round(M.oh * 1.25 + 12);
      var st = boardEl.style;
      st.setProperty('--srt-hw', Math.floor(best.hw) + 'px');
      st.setProperty('--srt-ow', M.ow + 'px');
      st.setProperty('--srt-oh', M.oh + 'px');
      st.setProperty('--srt-base', M.base + 'px');
      st.setProperty('--srt-pad', M.pad + 'px');
      st.setProperty('--srt-head', M.head + 'px');
      st.setProperty('--srt-cap', String(cap));
      st.setProperty('--srt-gap', Math.round(best.gap) + 'px');
      st.setProperty('--srt-per', String(best.per));
      st.setProperty('--srt-shelf', Math.max(9, Math.round(best.hw * 0.21)) + 'px');
      // Each row of holders stands on one shelf: mark where the rows begin and end.
      H.forEach(function (hh, i) {
        hh.el.classList.toggle('is-row-start', i % best.per === 0);
        hh.el.classList.toggle('is-row-end', i % best.per === best.per - 1 || i === H.length - 1);
      });
      boardEl.classList.toggle('is-rows', best.rows > 1);
      // Keep lifted objects at the right height.
      if (selected !== -1) lift(selected, false);
    }

    /* ---------- selection ---------- */

    function movable(i) {
      var h = vis[i];
      if (!h || !h.length || R.complete(h, cap)) return 0;
      return cfg.move === 'group' ? R.topRun(h) : 1;
    }

    /* The top object (or run) rises clear of the holder's mouth. */
    function lift(i, sound) {
      var hh = H[i], h = vis[i], m = movable(i);
      var low = h.length - m;
      var dist = (cap - low) * M.oh + M.pad + 6;
      for (var k = low; k < h.length; k++) {
        var o = hh.objs[k];
        o.style.setProperty('--lift', dist + 'px');
        o.classList.add('is-lifted');
        if (style === 'nuts' && !calm) o.classList.add('is-spin');
      }
      hh.el.classList.add('is-source');
      if (sound) { api.audio.play('tap'); buzz(8); }
    }
    function drop(i) {
      var hh = H[i];
      if (!hh) return;
      hh.objs.forEach(function (o) { o.classList.remove('is-lifted', 'is-spin'); o.style.removeProperty('--lift'); });
      hh.el.classList.remove('is-source');
    }
    function select(i) {
      if (selected !== -1) drop(selected);
      selected = i;
      if (i !== -1) lift(i, true);
      label();
    }

    /* ---------- input ---------- */

    function tap(i) {
      if (dead || locked || !playing) return;
      if (running || ops.length) { queuedTap = i; return; }
      if (selected === -1) {
        if (movable(i)) select(i);
        else { shake(i); api.audio.play('wrong'); }
        return;
      }
      if (selected === i) { select(-1); api.audio.play('tap'); return; }
      var from = selected;
      tryMove(from, i);
    }

    function tryMove(from, to) {
      var out = opts.onMove ? opts.onMove(from, to) : null;
      if (!out) { select(-1); return false; }
      if (!out.res.ok) {
        invalid(from, to);
        return false;
      }
      selected = -1;
      H[from].el.classList.remove('is-source');
      enqueue({ kind: 'move', res: out.res, board: out.board });
      return true;
    }

    function invalid(from, to) {
      api.audio.play('wrong');
      buzz(30);
      shake(to);
      // Back where it came from, smoothly.
      if (H[from]) {
        H[from].objs.forEach(function (o) { o.classList.add('is-return'); });
        later(function () { if (H[from]) H[from].objs.forEach(function (o) { o.classList.remove('is-return'); }); }, 320);
      }
      select(-1);
      if (FF.UI.announce) FF.UI.announce(t('srtCannot', 'That cannot go there.'));
    }

    function shake(i) {
      var hh = H[i];
      if (!hh) return;
      hh.el.classList.remove('is-shake');
      void hh.el.offsetWidth;
      hh.el.classList.add('is-shake');
      later(function () { hh.el.classList.remove('is-shake'); }, 420);
    }

    function command(type) {
      if (dead || locked || !playing || running || ops.length) return;
      var out = opts.onCommand ? opts.onCommand(type) : null;
      if (!out) return;
      if (!out.res.ok) {
        api.audio.play('wrong');
        if (out.res.why === 'locked') api.shell.toast(t('srtUndoLocked', 'A finished holder stays finished.'));
        return;
      }
      select(-1);
      api.audio.play('click');
      if (type === 'undo') enqueue({ kind: 'move', res: out.res, board: out.board, undo: true });
      else enqueue({ kind: 'deal', board: out.board });
    }

    function holderAt(x, y) {
      var el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      while (el && el !== boardEl && !(el.classList && el.classList.contains('srt-holder'))) el = el.parentNode;
      return el && el !== boardEl && el._i != null ? el._i : -1;
    }

    function onDown(e) {
      if (dead || locked || !playing) return;
      if (e.button != null && e.button !== 0) return;
      var i = e.currentTarget._i;
      drag = { i: i, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, over: -1 };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* old browser */ }
      e.currentTarget.addEventListener('pointermove', onMove);
      e.currentTarget.addEventListener('pointerup', onUp);
      e.currentTarget.addEventListener('pointercancel', onCancel);
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < DRAG_PX) return;
        if (running || ops.length || !movable(drag.i)) { drag.dead = true; return; }
        drag.moved = true;
        if (selected !== drag.i) select(drag.i);
        H[drag.i].el.classList.add('is-dragging');
      }
      if (drag.dead) return;
      var hh = H[drag.i], m = movable(drag.i);
      for (var k = vis[drag.i].length - m; k < vis[drag.i].length; k++) {
        hh.objs[k].style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + Math.max(-8, Math.min(8, dx / 18)) + 'deg)';
      }
      var over = holderAt(e.clientX, e.clientY);
      if (over !== drag.over) {
        if (drag.over !== -1 && H[drag.over]) H[drag.over].el.classList.remove('is-over');
        drag.over = over;
        if (over !== -1 && over !== drag.i) H[over].el.classList.add('is-over');
      }
    }
    function release(el) {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    }
    function endDrag(el) {
      if (!drag) return;
      if (drag.over !== -1 && H[drag.over]) H[drag.over].el.classList.remove('is-over');
      if (H[drag.i]) H[drag.i].el.classList.remove('is-dragging');
      if (el) release(el);
      drag = null;
    }
    function clearDragTransforms(i) {
      if (!H[i]) return;
      H[i].objs.forEach(function (o) { o.style.transform = ''; });
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      var el = e.currentTarget;
      endDrag(el);
      if (!d.moved) { tap(d.i); return; }
      if (d.dead) return;
      var to = holderAt(e.clientX, e.clientY);
      if (to === -1 || to === d.i) {
        // Dropped nowhere: spring back.
        springBack(d.i);
        select(-1);
        return;
      }
      // The flight starts from where the finger let go.
      var ok = tryMove(d.i, to);
      if (!ok) springBack(d.i);
    }
    function onCancel(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var i = drag.i;
      endDrag(e.currentTarget);
      springBack(i);
      select(-1);
    }
    function springBack(i) {
      var hh = H[i];
      if (!hh) return;
      hh.objs.forEach(function (o) {
        if (!o.style.transform) return;
        var from = o.style.transform;
        o.style.transform = '';
        animate(o, [{ transform: from }, { transform: 'none' }], { duration: calm ? 1 : 300, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      });
    }

    boardEl.addEventListener('keydown', function (e) {
      if (dead) return;
      var k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
        e.preventDefault();
        var step = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
        focusIdx = (focusIdx + step + H.length) % H.length;
        label();
        H[focusIdx].el.focus();
      } else if (k === 'Escape') {
        if (selected !== -1) { select(-1); e.preventDefault(); }
      } else if (k === 'u' || k === 'U') {
        command('undo');
      }
    });

    /* ---------- animation ---------- */

    function later(fn, ms) { var id = setTimeout(function () { if (!dead) fn(); }, ms); timers.push(id); return id; }
    function animate(el, frames, o) {
      if (!el.animate) return null;
      try { return el.animate(frames, o); } catch (e) { return null; }
    }

    function enqueue(op) {
      ops.push(op);
      if (op.board) target = op.board.slice();
      if (!running) next();
    }

    function next() {
      if (dead) return;
      var op = ops.shift();
      if (!op) {
        running = false;
        // Anything the referee changed under us: draw the board the rules have.
        if (vis.join(',') !== target.join(',')) { vis = target.slice(); build('sync'); }
        stuckCheck();
        if (queuedTap !== -1) { var q = queuedTap; queuedTap = -1; tap(q); }
        return;
      }
      running = true;
      var speed = ops.length ? 0.55 : 1;
      if (op.kind === 'move') flyMove(op, speed, next);
      else if (op.kind === 'deal') {
        vis = op.board.slice();
        build(op.quiet ? 'sync' : 'deal');
        later(next, calm ? 60 : 420);
      } else next();
    }

    function flyMove(op, speed, done) {
      var r = op.res;
      var from = r.from, to = r.to, count = r.count;
      var src = H[from], dst = H[to];
      if (!src || !dst || src.objs.length < count) { vis = (op.board || target).slice(); build('sync'); done(); return; }
      var moving = src.objs.splice(src.objs.length - count, count);
      var starts = moving.map(function (o) { return o.getBoundingClientRect(); });
      var base = dst.objs.length;
      moving.forEach(function (o, j) {
        o.classList.remove('is-lifted', 'is-spin', 'is-return');
        o.style.removeProperty('--lift');
        o.style.transform = '';
        o.style.setProperty('--i', String(base + j));
        dst.stack.appendChild(o);
      });
      dst.objs = dst.objs.concat(moving);
      src.el.classList.remove('is-source');
      vis = R.apply(vis, from, to, count);
      var ends = moving.map(function (o) { return o.getBoundingClientRect(); });
      var dr = dst.el.getBoundingClientRect();
      var mouth = dr.bottom - (M.base + cap * M.oh + M.pad);
      var travelTop = Math.min(starts[starts.length - 1].top, mouth - M.oh - 8);
      var dur = calm ? 120 : Math.round(FLY_MS * speed);
      dst.el.classList.add('is-receiving');
      moving.forEach(function (o, j) {
        var s = starts[j], e = ends[j];
        var dx = s.left - e.left, dy = s.top - e.top;
        if (calm) {
          animate(o, [{ opacity: 0.3, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: dur, easing: 'ease-out' });
          return;
        }
        var ty = travelTop + (moving.length - 1 - j) * M.oh - e.top;
        var tilt = (dx > 0 ? -1 : 1) * (style === 'balls' ? 70 : 7);
        var spin = style === 'balls' ? 'rotate(' + tilt + 'deg)' : 'rotate(' + tilt + 'deg)';
        var frames = [
          { transform: 'translate(' + dx + 'px,' + dy + 'px)', offset: 0 },
          { transform: 'translate(' + dx + 'px,' + Math.min(dy, ty) + 'px)', offset: 0.28, easing: 'cubic-bezier(.3,0,.4,1)' },
          { transform: 'translate(' + (dx / 2) + 'px,' + (Math.min(dy, ty) - 16) + 'px) ' + spin, offset: 0.5 },
          { transform: 'translate(0px,' + ty + 'px)', offset: 0.72, easing: 'cubic-bezier(.55,0,.8,.6)' },
          { transform: 'translate(0,0)', offset: 1 }
        ];
        o.classList.add('is-flying');
        animate(o, frames, { duration: dur, delay: (moving.length - 1 - j) * STAGGER_MS * speed, easing: 'linear', fill: 'backwards' });
      });
      var total = dur + (moving.length - 1) * STAGGER_MS * speed;
      later(function () {
        dst.el.classList.remove('is-receiving');
        moving.forEach(function (o) {
          o.classList.remove('is-flying');
          if (!calm) {
            o.classList.add('is-land', 'is-land--' + S.land);
            later(function () { o.classList.remove('is-land', 'is-land--' + S.land); }, LAND_MS + 40);
          }
        });
        api.audio.note ? api.audio.note(Math.min(7, dst.objs.length - 1), 0.12) : api.audio.play('tap');
        buzz(10);
        markDone(to, true);
        markDone(from, false);
        label();
        if (r.completed && !op.undo) {
          api.audio.play(r.cleared || r.finished ? 'streak' : 'correct');
          buzz([18, 40, 18]);
        }
        if (r.next) {
          // Timed Score: a short cheer, then the next puzzle.
          celebrate(false);
          later(function () { ops.unshift({ kind: 'deal', board: op.board }); done(); }, calm ? 200 : 700);
          return;
        }
        later(done, calm ? 20 : Math.round(LAND_MS * 0.6 * speed));
      }, total + 10);
    }

    function sparkle(i) {
      var hh = H[i];
      if (!hh || !animationsOn()) { if (hh) hh.el.classList.add('is-glow'); return; }
      hh.el.classList.remove('is-glow');
      void hh.el.offsetWidth;
      hh.el.classList.add('is-glow');
      for (var k = 0; k < 10; k++) {
        var s = FF.ui.span('srt-spark');
        var a = (k / 10) * Math.PI * 2 + rand() * 0.5;
        var d = 26 + rand() * 30;
        s.style.setProperty('--dx', Math.round(Math.cos(a) * d) + 'px');
        s.style.setProperty('--dy', Math.round(Math.sin(a) * d - 24) + 'px');
        s.style.setProperty('--d', Math.round(rand() * 120) + 'ms');
        hh.el.appendChild(s);
        (function (sp) { later(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 1000); })(s);
      }
    }

    /* The whole board does a small wave: a solved puzzle or a win. */
    function celebrate(big) {
      if (!animationsOn()) return;
      H.forEach(function (hh, i) {
        hh.el.classList.remove('is-wave');
        void hh.el.offsetWidth;
        hh.el.style.setProperty('--wave', (i * 55) + 'ms');
        hh.el.classList.add('is-wave');
      });
      if (big && FF.Confetti) FF.Confetti.burst(70);
    }

    function stuckCheck() {
      if (!playing || locked) { banner(false); return; }
      banner(!R.hasAnyMove(vis, cap, cfg.move) && !R.solved(vis, cap));
    }

    function banner(on) {
      FF.ui.clear(bannerEl);
      bannerEl.classList.toggle('hidden', !on);
      if (!on) return;
      bannerEl.appendChild(FF.ui.span('srt-banner__text', t('srtStuckMsg', 'No moves left.')));
      var b1 = FF.UI.button(t('srtUndo', 'Undo'), { class: 'btn-soft', onClick: function () { command('undo'); } });
      var b2 = FF.UI.button(t('srtRestart', 'Restart'), { class: 'btn-soft', onClick: function () { command('restart'); } });
      bannerEl.appendChild(b1);
      bannerEl.appendChild(b2);
      if (cfg.mode === 'score') bannerEl.appendChild(FF.UI.button(t('srtSkip', 'Skip'), { class: 'btn-soft', onClick: function () { command('skip'); } }));
    }

    /* ---------- the view ---------- */

    function onResize() { layout(); }
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { layout(); }); }

    function teardown() {
      if (dead) return;
      dead = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    }

    return {
      stage: stage,
      rivals: rivals,
      mount: function (root) {
        root.appendChild(stage);
        build('deal');
        if (ro) ro.observe(wrap);
        later(layout, 60);
      },
      /* A new board from the rules: 'deal' animates it in, 'sync' just draws it. */
      setBoard: function (b, how) {
        target = b.slice();
        if (running || ops.length) { if (how === 'deal') enqueue({ kind: 'deal', board: b }); return; }
        if (vis.join(',') === target.join(',')) return;
        vis = target.slice();
        build(how || 'sync');
        stuckCheck();
      },
      setPlaying: function (on) {
        playing = !!on && !locked;
        stage.classList.toggle('is-live', playing);
        if (!playing && selected !== -1) select(-1);
        stuckCheck();
      },
      setTime: function (left) {
        timeStat.value.textContent = R.clock(left);
        timeStat.el.classList.toggle('is-low', left <= 10000 && left > 0);
      },
      setStats: function (st) {
        moveStat.value.textContent = st.limit ? st.pm + '/' + st.limit : String(st.moves);
        moveStat.el.classList.toggle('is-low', !!st.limit && st.limit - st.pm <= 3);
        if (cfg.mode === 'score') progStat.value.textContent = FF.util.formatNumber(st.score) + (st.cleared ? ' · ' + st.cleared + '✓' : '');
        else progStat.value.textContent = R.completedCount(st.board || vis, cap) + '/' + cfg.colours;
        undoBtn.disabled = !st.canUndo;
        restartBtn.disabled = !st.canRestart;
      },
      overlay: function (kind, big, lines, extra) {
        overlay.className = 'srt-overlay' + (kind ? ' is-' + kind : ' hidden');
        if (!kind) return;
        FF.ui.clear(overlay);
        var card = FF.ui.div('srt-overlay__card');
        if (big) card.appendChild(FF.ui.div('srt-overlay__big', big));
        (lines || []).forEach(function (l) { if (l) card.appendChild(FF.ui.div('srt-overlay__line', l)); });
        if (extra) card.appendChild(extra);
        overlay.appendChild(card);
        if (kind === 'count' && !calm) { void overlay.offsetWidth; overlay.classList.add('is-tick'); }
      },
      banner: banner,
      lock: function () {
        locked = true;
        playing = false;
        if (selected !== -1) select(-1);
        stage.classList.remove('is-live');
        stage.classList.add('is-over');
        banner(false);
      },
      celebrate: celebrate,
      busy: function () { return running || ops.length > 0; },
      destroy: teardown,
      alive: function () { return !dead && stage.isConnected; }
    };
  }

  /* The three board looks, as a sheet of cards. */
  function pickTheme(api, onPick) {
    var body = FF.ui.div('srt-themes');
    var dlg = null;
    R.THEMES.forEach(function (th) {
      var b = FF.ui.el('button', { type: 'button', class: 'srt-themecard' + (th === theme() ? ' is-on' : ''), 'aria-pressed': th === theme() ? 'true' : 'false' });
      var sw = FF.ui.span('srt-themecard__swatch');
      sw.setAttribute('data-srt-theme', th);
      for (var c = 0; c < 5; c++) { var dot = FF.ui.span('srt-themecard__dot'); dot.setAttribute('data-c', String(c)); sw.appendChild(dot); }
      b.appendChild(sw);
      b.appendChild(FF.ui.span('srt-themecard__name', themeLabel(th)));
      b.addEventListener('click', function () {
        setPref('theme', th);
        api.audio.play('select');
        onPick(th);
        if (dlg) dlg.close();
      });
      body.appendChild(b);
    });
    dlg = FF.UI.dialog({ kind: 'sheet', title: t('srtLookTitle', 'Board look'), body: body });
  }

  /* ================= how to play ================= */

  function howLines(cfg) {
    var s = R.sanitize(cfg);
    var thing = styleThing(s.style, 2);
    var lines = [
      t('srtHow1', 'Move the {things} until each {holder} holds one colour.', { things: thing, holder: holderThing(s.style) }),
      s.move === 'group'
        ? t('srtHowGroup', 'The top run of one colour moves together, as much as fits.')
        : t('srtHowSingle', 'Only the top {thing} moves, one at a time.', { thing: styleThing(s.style, 1) }),
      t('srtHow3', 'It can go on an empty {holder} or on the same colour, if there is room.', { holder: holderThing(s.style) })
    ];
    lines.push(s.mode === 'score'
      ? t('srtHowScore', 'Timed Score: 100 for each finished {holder}, 200 for each cleared puzzle, plus a bonus for few moves.', { holder: holderThing(s.style) })
      : t('srtHowRace', 'Race: sort it before time runs out. Online, the first to finish wins.'));
    if (s.limit !== 'off') lines.push(t('srtHowLimit', 'Watch your moves: there is a limit.'));
    return lines;
  }

  function howCard(cfg, extra) {
    var box = FF.ui.div('srt-howcard');
    var ul = FF.ui.el('ul', { class: 'srt-howcard__list' });
    howLines(cfg).forEach(function (l) { ul.appendChild(FF.ui.el('li', {}, l)); });
    box.appendChild(ul);
    if (extra) box.appendChild(extra);
    return box;
  }

  /* ================= results (solo, pass and play, online) =================
     rows: [{ who, place, points, moves, done, out, used, score, cleared, completed (peakC), me }] */
  function resultsTable(rows, cfg) {
    var table = FF.ui.el('ol', { class: 'srt-table' });
    var score = cfg.mode === 'score';
    rows.forEach(function (r) {
      var li = FF.ui.el('li', { class: 'srt-row' + (r.place === 1 && r.moves ? ' is-winner' : '') + (r.out ? ' is-out' : '') + (r.me ? ' is-me' : '') });
      if (rows.length > 1) li.appendChild(FF.ui.span('srt-row__rank', String(r.place)));
      li.appendChild(FF.Players.avatarEl(r.who, 'srt-row__ava'));
      var who = FF.ui.span('srt-row__who');
      who.appendChild(FF.ui.span('srt-row__name', r.who.name + (r.me && rows.length > 1 ? ' ' + t('youTag', '(you)') : '')));
      var status = score ? t('srtStatusCleared', '{n} puzzles cleared', { n: r.cleared || 0 })
        : r.done ? t('srtStatusDone', 'Sorted in {time}', { time: R.exactTime(r.used) })
          : r.out ? t('srtStatusOut', 'Out of moves') : t('srtStatusTime', 'Out of time');
      who.appendChild(FF.ui.span('srt-row__status', status));
      li.appendChild(who);
      var nums = FF.ui.span('srt-row__nums');
      nums.appendChild(cell(t('srtMoves', 'Moves'), String(r.moves || 0)));
      if (!score) nums.appendChild(cell(t('srtHolders', 'Holders'), (r.done ? cfg.colours : (r.completed || 0)) + '/' + cfg.colours));
      li.appendChild(nums);
      li.appendChild(FF.ui.span('srt-row__pts', FF.util.formatNumber(r.points)));
      table.appendChild(li);
    });
    return table;

    function cell(lbl, value) {
      var c = FF.ui.span('srt-cell');
      c.appendChild(FF.ui.span('srt-cell__label', lbl));
      c.appendChild(FF.ui.span('srt-cell__value', value));
      return c;
    }
  }

  function headline(rows, cfg, solo) {
    if (solo) {
      var r = rows[0];
      if (cfg.mode === 'score') return t('srtTimeUpScore', 'Time’s up! {n} points', { n: FF.util.formatNumber(r.points) });
      return r.done ? t('srtSoloDone', 'All sorted!') : r.out ? t('srtStatusOut', 'Out of moves') : t('timesUp', 'Time’s up!');
    }
    var top = rows.filter(function (x) { return x.place === 1 && x.moves; });
    if (!top.length) return t('srtNobody', 'Nobody made a move');
    if (top.length > 1) return t('srtDraw', 'It’s a draw!');
    return top[0].me ? t('srtYouWin', 'You win!') : t('srtWins', '{name} wins!', { name: top[0].who.name });
  }

  /* ================= setup ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = pref('setup', null);
    var gs = R.sanitize(Object.assign({}, R.STANDARD, saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'srt srt-setup' });
    stage.setAttribute('data-srt-theme', theme());
    stage.appendChild(FF.GameUI.kicker(t('srtName', 'SortRush')));
    stage.appendChild(FF.GameUI.prompt(t('srtSetupTitle', 'Set up your sort'), 'md'));
    var preview = FF.ui.div('srt-preview');
    stage.appendChild(preview);
    var box = FF.ui.el('section', { class: 'settings-section srt-setup__rows' });
    var note = FF.ui.el('p', { class: 'gm-note', 'aria-live': 'polite' });
    var lbNote = FF.ui.el('p', { class: 'gm-note srt-setup__lb' });
    function drawPreview() {
      FF.ui.clear(preview);
      preview.setAttribute('data-style', gs.style);
      var demo = ['aab', 'bc', 'cca'];
      demo.forEach(function (h, n) {
        var col = FF.ui.span('srt-holder srt-preview__holder srt-holder--' + gs.style + (n === 0 ? ' is-row-start' : '') + (n === demo.length - 1 ? ' is-row-end' : ''));
        var stack = holderParts(col).stack;
        for (var k = 0; k < h.length; k++) {
          var o = objectEl(gs.style, R.colourOf(h[k]));
          o.style.setProperty('--i', String(k));
          stack.appendChild(o);
        }
        preview.appendChild(col);
      });
    }
    function resum() {
      note.textContent = summary(gs);
      var off = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def) && !R.isStandard(gs);
      lbNote.textContent = off ? t('srtLbNote', 'Leaderboards use the standard settings.') : '';
    }
    function render() {
      FF.ui.clear(box);
      // The look is this player's own choice, not a game rule.
      box.appendChild(FF.UI.settingRow(t('srtLook', 'Look'), FF.UI.segmented({
        label: t('srtLook', 'Look'), value: theme(),
        options: R.THEMES.map(function (th) { return { label: themeLabel(th), value: th }; }),
        onChange: function (v) { setPref('theme', v); stage.setAttribute('data-srt-theme', v); }
      })));
      fields(gs).forEach(function (f) {
        if (f.note) { box.appendChild(FF.ui.el('p', { class: 'gm-note' }, f.note)); return; }
        box.appendChild(FF.UI.settingRow(f.label, FF.UI.segmented({
          label: f.label, value: gs[f.key], options: f.options,
          onChange: function (v) {
            gs[f.key] = v;
            if (f.key === 'level' && v === 'custom') {
              // Start Custom from what the last level dealt.
              var cur = R.sanitize(Object.assign({}, gs, { level: 'medium' }));
              ['colours', 'size', 'empty'].forEach(function (k) { if (gs[k] == null) gs[k] = cur[k]; });
            }
            gs = Object.assign(gs, R.sanitize(gs));
            if (f.key === 'style') drawPreview();
            if (f.redraw) render(); else resum();
          }
        })));
      });
      resum();
    }
    drawPreview();
    render();
    stage.appendChild(box);
    stage.appendChild(note);
    stage.appendChild(lbNote);
    var row = FF.ui.div('srt-setup__actions');
    row.appendChild(FF.UI.button(t('srtStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost',
      onClick: function () { api.audio.play('click'); gs = R.sanitize(Object.assign({}, R.STANDARD, { style: gs.style })); render(); }
    }));
    row.appendChild(FF.GameUI.action(t('srtStart', 'Start sorting'), function () {
      api.audio.play('select');
      var cfg = R.sanitize(gs);
      setPref('setup', cfg);
      onGo(cfg);
    }, { icon: 'play' }));
    stage.appendChild(row);
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= solo and pass and play ================= */

  function playAll(api, cfg) {
    if (!R.isStandard(cfg)) api.config.customRules = true;
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var seed = newSeed();             // one seed: everybody gets the same puzzles
    var runs = [];
    var i = 0;

    function nextPlayer() {
      if (i >= list.length) { results(); return; }
      var who = list[i];
      if (list.length > 1) passScreen(who, function () { go(who); });
      else go(who);
    }
    function go(who) {
      playLocal(api, cfg, seed, list.length > 1 ? who : null, function (p) {
        runs.push({ who: who, p: p });
        i++;
        nextPlayer();
      });
    }

    function passScreen(who, onReady) {
      var root = api.shell.root;
      api.shell.hideTimer();
      FF.ui.clear(root);
      var stage = FF.GameUI.stage({ center: true, className: 'nr nr-pass' });
      stage.appendChild(FF.GameUI.turnBar(who, t('srtPlayerOf', 'Player {n} of {total}', { n: i + 1, total: list.length })));
      var ava = FF.ui.div('nr-pass__ava');
      ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
      stage.appendChild(ava);
      stage.appendChild(FF.GameUI.prompt(t('srtPassTo', 'Pass to {name}', { name: who.name }), 'md'));
      stage.appendChild(FF.GameUI.sub(t('srtPassSub', 'Same puzzle for everyone. Sort it faster!')));
      stage.appendChild(FF.GameUI.action(t('srtReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
      root.appendChild(stage);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
    }

    function results() {
      var stats = {}, ids = [];
      runs.forEach(function (r) { stats[r.who.id] = r.p; ids.push(r.who.id); });
      var ranked = R.ranked(stats, ids, cfg);
      var byId = {};
      runs.forEach(function (r) { byId[r.who.id] = r.who; });
      var rows = ranked.map(function (r) {
        return Object.assign({}, r, { who: byId[r.uid], completed: r.peakC, me: runs.length === 1 });
      });
      var root = api.shell.root;
      FF.ui.clear(root);
      var solo = runs.length === 1;
      var stage = FF.GameUI.stage({ center: true, className: 'srt srt-results' });
      stage.setAttribute('data-srt-theme', theme());
      stage.appendChild(FF.GameUI.kicker(t('srtName', 'SortRush') + ' · ' + modeLabel(cfg.mode) + ' · ' + levelLabel(cfg.level)));
      stage.appendChild(FF.GameUI.prompt(headline(rows, cfg, solo), 'xl'));
      if (solo) {
        var r0 = rows[0];
        stage.appendChild(FF.ui.div('srt-results__score', FF.util.formatNumber(r0.points)));
        var key = (r0.who.id || 'me') + '|' + R.key(cfg);
        var bests = pref('best', {}) || {};
        var had = bests[key];
        var isBest = had == null || r0.points > had;
        if (isBest) { bests[key] = r0.points; setPref('best', bests); }
        if (isBest && had != null) stage.appendChild(FF.GameUI.feedback('good', t('srtNewBest', 'New personal best!')));
        else if (had != null && !isBest) stage.appendChild(FF.GameUI.note(t('srtYourBest', 'Your best on these settings: {n}', { n: FF.util.formatNumber(had) })));
      }
      stage.appendChild(resultsTable(rows, cfg));
      var actions = FF.ui.div('srt-setup__actions');
      actions.appendChild(FF.UI.button(t('srtPlayAgain', 'Play again'), {
        class: 'btn-lg btn-ghost',
        onClick: function () { api.audio.play('select'); playAll(api, cfg); }
      }));
      actions.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
        api.audio.play('select');
        rows.forEach(function (r) { api.scoring.set(r.who.id, r.points); if (api.shell.updateScores) api.shell.updateScores(r.who.id); });
        var win = rows.filter(function (r) { return r.place === 1 && r.moves; });
        api.end({
          results: rows.map(function (r) { return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.points, correct: r.peakC }; }),
          winnerId: win.length === 1 ? win[0].who.id : (solo ? rows[0].who.id : null)
        });
      }, { icon: 'trophy' }));
      stage.appendChild(actions);
      root.appendChild(stage);
      var good = solo ? (rows[0].done || (cfg.mode === 'score' && rows[0].points > 0)) : true;
      if (good && animationsOn() && FF.Confetti) setTimeout(function () { if (stage.isConnected) FF.Confetti.burst(80); }, 250);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
    }

    nextPlayer();
  }

  /* One player's run on this phone. onDone(playerState). */
  function playLocal(api, cfg, seed, who, onDone) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var deal = function (k) { return R.deal(cfg, seed, k); };
    var p = R.newPlayer(cfg, deal(0));
    var limit = cfg.seconds * 1000;
    var g = -COUNT_MS;            // game time; negative during the 3-2-1
    var started = false, ended = false, liveShown = false;
    var last = 0, tick = 0, lastCount = null;

    function result(res) { return { res: res, board: p.b.slice() }; }
    function stats() {
      view.setStats({ moves: p.moves, pm: p.pm, limit: p.limit, score: p.score, cleared: p.cleared, board: p.b, canUndo: p.hist.length > 0, canRestart: p.hist.length > 0 });
    }
    function after(res) {
      stats();
      if (res.finished) later(function () { end('done'); }, FLY_MS + 200);
      else if (res.out) later(function () { end('out'); }, FLY_MS + 200);
    }
    var view = board(api, {
      settings: cfg, board: p.b,
      turnText: who ? t('srtTurnOf', '{name}’s turn', { name: who.name }) : '',
      onMove: function (from, to) {
        if (ended || g < 0) return null;
        var res = R.step(cfg, p, { type: 'move', from: from, to: to, k: p.k }, Math.max(0, g), 0, deal);
        if (res.ok) after(res);
        return result(res);
      },
      onCommand: function (type) {
        if (ended || g < 0) return null;
        var res = R.step(cfg, p, { type: type, k: p.k }, Math.max(0, g), 0, deal);
        if (res.ok) after(res);
        return result(res);
      }
    });
    view.mount(root);
    view.setTime(limit);
    stats();

    var go = FF.GameUI.action(t('srtGo', 'Start'), function () {
      if (started) return;
      started = true;
      api.audio.play('select');
      last = Date.now();
      tick = setInterval(frame, 100);
      frame();
    }, { icon: 'play' });
    go.classList.add('srt-startbtn');
    view.overlay('how', t('srtHowTitle', 'How to play'), [], howCard(cfg, go));
    try { go.focus({ preventScroll: true }); } catch (e) { /* old browser */ }

    var pending = [];
    function later(fn, ms) { pending.push(setTimeout(fn, ms)); }

    function paused() {
      var screen = document.getElementById ? document.getElementById('game-screen') : null;
      return !!(screen && screen.querySelector && screen.querySelector('.pause-overlay'));
    }

    function frame() {
      if (ended) return;
      if (!view.alive()) { stopAll(); return; }
      var now = Date.now();
      if (!paused()) g += Math.min(250, now - last);
      last = now;
      if (g < 0) {
        var c = Math.ceil(-g / 1000);
        if (c !== lastCount) { lastCount = c; view.overlay('count', String(c)); api.audio.play('countdown'); }
        return;
      }
      if (!liveShown) {
        liveShown = true;
        view.overlay('go', t('srtGoBig', 'Sort!'));
        later(function () { if (!ended) view.overlay(null); }, 600);
        api.audio.play('roundStart');
        view.setPlaying(true);
      }
      view.setTime(limit - g);
      if (g >= limit) end('time');
    }

    function stopAll() {
      clearInterval(tick);
      pending.forEach(clearTimeout);
      view.destroy();
    }

    function end(kind) {
      if (ended) return;
      ended = true;
      clearInterval(tick);
      view.lock();
      if (kind === 'done') {
        api.audio.play('winner');
        view.celebrate(true);
        view.overlay('done', t('srtSolved', 'Sorted!'), [R.exactTime(p.used), t('srtInMoves', 'in {n} moves', { n: p.moves })]);
      } else if (kind === 'out') {
        api.audio.play('wrong');
        buzz([90, 60, 140]);
        view.overlay('out', t('srtStatusOut', 'Out of moves'), [t('srtSortedOf', '{n} of {total} holders sorted', { n: p.peakC, total: cfg.colours })]);
      } else {
        api.audio.play('roundEnd');
        view.overlay('time', t('timesUp', 'Time’s up!'), cfg.mode === 'score'
          ? [t('srtPoints', '{n} points', { n: FF.util.formatNumber(p.score) }), t('srtCleared', '{n} puzzles cleared', { n: p.cleared })]
          : [t('srtSortedOf', '{n} of {total} holders sorted', { n: p.peakC, total: cfg.colours })]);
      }
      if (FF.UI.announce) FF.UI.announce(kind === 'done' ? t('srtSolved', 'Sorted!') : kind === 'out' ? t('srtStatusOut', 'Out of moves') : t('timesUp', 'Time’s up!'));
      later(function () {
        stopAll();
        if (!api.shell.root.isConnected) return;
        onDone(p);
      }, 2000);
    }
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
    var lastResets = -1;
    var client = FF.SortRushClient.create({ room: room, onChange: schedule });
    var ticker = setInterval(tick, 150);

    function expectedMatch() { return room.meta && room.meta.srMatch; }
    function nameOf(uid) { var p = (room.players || {})[uid]; return (p && p.name) || t('srtPlayer', 'Player'); }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('srtPlayer', 'Player'), avatar: p.avatar || null, color: p.color || null, photo: p.photo || null };
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

    function notHere(sr) { return !sr || (expectedMatch() && sr.matchId !== expectedMatch()); }

    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.SortRushApi.nudge(room.code);
    }

    function waitingScreen(title, sub) {
      var stage = FF.GameUI.stage({ center: true, className: 'srt srt-wait' });
      stage.appendChild(FF.ui.div('srt-wait__spin'));
      stage.appendChild(FF.GameUI.prompt(title, 'md'));
      if (sub) stage.appendChild(FF.GameUI.sub(sub));
      if (stuck && room.isHost) {
        stage.appendChild(FF.UI.button(t('srtBackToRoom', 'Back to the room'), {
          class: 'btn-soft',
          onClick: function () { FF.Room.playAgain().catch(function () { /* not the host any more */ }); }
        }));
      }
      return stage;
    }

    function render() {
      if (ended) return;
      if (!root.isConnected) { cleanup(); return; }
      var v = client.view();
      var sr = v.sr;
      if (notHere(sr)) {
        if (view) { view.destroy(); view = null; viewMatch = null; }
        FF.ui.clear(root);
        root.appendChild(stuck
          ? waitingScreen(t('srtStuck', 'Still waiting for the game server…'), room.isHost
            ? t('srtStuckHost', 'It is taking longer than it should. Keep waiting, or go back to the room and start again.')
            : t('srtStuckGuest', 'It is taking longer than it should. The host can go back to the room and start again.'))
          : waitingScreen(t('srtGettingReady', 'Mixing the colours…'), t('srtGettingReadySub', 'Everyone gets the same puzzle and starts at the same moment.')));
        return;
      }
      if (sr.phase === 'ended') { if (!finishedShown) showEnd(sr, v); return; }
      if (!v.seated) {
        if (view) { view.destroy(); view = null; }
        FF.ui.clear(root);
        root.appendChild(waitingScreen(t('srtWatching', 'This game started without you'), t('srtWatchingSub', 'You can join the next one. Here is how everyone is doing:')));
        root.firstChild.appendChild(rivalList(sr, null));
        return;
      }
      if (!view || viewMatch !== sr.matchId) build(sr, v);
      update(sr, v);
    }

    function result(res) { var p = client.view().player; return { res: res, board: p ? p.b.slice() : [] }; }

    function build(sr, v) {
      if (view) view.destroy();
      FF.ui.clear(root);
      viewMatch = sr.matchId;
      lastCount = null;
      rivalDone = {};
      lastResets = v.resets;
      view = board(api, {
        settings: sr.settings, board: v.player.b, room: true,
        onMove: function (from, to) {
          var res = client.send({ type: 'move', from: from, to: to });
          if (!res) return null;
          if (res.ok) stats();
          return result(res);
        },
        onCommand: function (type) {
          var res = client.send({ type: type });
          if (!res) return null;
          if (res.ok) stats();
          return result(res);
        }
      });
      view.mount(root);
      if (FF.Race && FF.Race.describe) FF.Race.describe({ kind: 'card', text: t('srtTv', 'Everyone is sorting the same puzzle: {s}', { s: summary(sr.settings) }) }, null);
    }

    function stats() {
      var p = client.view().player;
      if (!view || !p) return;
      view.setStats({ moves: p.moves, pm: p.pm, limit: p.limit, score: p.score, cleared: p.cleared, board: p.b, canUndo: p.hist.length > 0, canRestart: p.hist.length > 0 });
    }

    function update(sr, v) {
      var me = v.me;
      // The referee replaced this phone's guess: draw its board.
      if (v.resets !== lastResets && !v.pending && v.player) {
        lastResets = v.resets;
        view.setBoard(v.player.b, 'sync');
      }
      stats();
      renderRivals(sr, v);
      if (me && (me.done || me.out)) {
        view.lock();
        if (!view._ended) {
          view._ended = true;
          if (me.done) {
            view.overlay('done', t('srtSolved', 'Sorted!'), [R.exactTime(me.used), placeLine(sr, v.uid)]);
            api.audio.play('winner');
            view.celebrate(sr.first === v.uid);
          } else {
            view.overlay('out', t('srtStatusOut', 'Out of moves'), [t('srtWatchOthers', 'Watch the others finish')]);
            api.audio.play('wrong');
            buzz([90, 60, 140]);
          }
        }
      }
      tick();
    }

    function placeLine(sr, uid) {
      var done = sr.order.filter(function (u) { return sr.p[u] && sr.p[u].done; })
        .sort(function (x, y) { return sr.p[x].doneAt - sr.p[y].doneAt; });
      var i = done.indexOf(uid);
      if (i === 0) return t('srtFirst', 'You finished first!');
      return i > 0 ? t('srtPlaceN', 'You finished #{n}', { n: i + 1 }) : '';
    }

    /* Progress only: never the other players' boards. */
    function rivalList(sr, meUid) {
      var wrap = FF.ui.div('srt-rivals__list');
      var score = sr.settings.mode === 'score';
      var best = 1;
      if (score) sr.order.forEach(function (u) { best = Math.max(best, (sr.p[u] || {}).score || 0); });
      sr.order.forEach(function (uid) {
        if (uid === meUid) return;
        var r = sr.p[uid] || {};
        var chip = FF.ui.div('srt-rival' + (r.out ? ' is-out' : '') + (r.done ? ' is-done' : ''));
        chip.appendChild(FF.Players.avatarEl(who(uid), 'srt-rival__ava'));
        var body = FF.ui.span('srt-rival__body');
        body.appendChild(FF.ui.span('srt-rival__name', nameOf(uid)));
        var bar = FF.ui.span('srt-rival__bar');
        var fill = FF.ui.span('srt-rival__fill');
        var share = score ? (r.score || 0) / best : (r.done ? 1 : (r.sorted || 0) / Math.max(1, sr.total || 1));
        fill.style.width = Math.round(Math.max(0, Math.min(1, share)) * 100) + '%';
        bar.appendChild(fill);
        body.appendChild(bar);
        chip.appendChild(body);
        var stt = FF.ui.span('srt-rival__state');
        if (r.out) stt.textContent = t('srtOut', 'Out');
        else if (r.done) { stt.appendChild(icon('check')); stt.appendChild(document.createTextNode(R.exactTime(r.used))); }
        else if (score) stt.textContent = FF.util.formatNumber(r.score || 0);
        else stt.textContent = (r.completed || 0) + '/' + sr.settings.colours;
        chip.appendChild(stt);
        wrap.appendChild(chip);
      });
      return wrap;
    }

    function renderRivals(sr, v) {
      if (!view || !view.rivals) return;
      FF.ui.clear(view.rivals);
      var list = rivalList(sr, v.uid);
      if (list.children.length) {
        view.rivals.appendChild(FF.ui.div('srt-rivals__title', t('srtRivals', 'The other players')));
        view.rivals.appendChild(list);
      }
      view.rivals.classList.toggle('hidden', !list.children.length);
      sr.order.forEach(function (uid) {
        var r = sr.p[uid];
        if (uid === v.uid || !r || !r.done || rivalDone[uid]) return;
        rivalDone[uid] = true;
        api.shell.toast(sr.first === uid ? t('srtRivalFirst', '{name} finished first!', { name: nameOf(uid) }) : t('srtRivalDone', '{name} finished', { name: nameOf(uid) }));
      });
    }

    /* The clock, the briefing, the countdown and the last call, from the server's time. */
    function tick() {
      if (ended) return;
      var sr = client.view().sr;
      if (notHere(sr)) {
        var due = (room.meta && room.meta.startAt) || 0;
        if (!due) return;
        var late = client.serverNow() - due;
        if (late >= NUDGE_MS) maybeNudge('start' + Math.floor((late - NUDGE_MS) / RENUDGE_MS), due);
        if ((late >= STUCK_MS) !== stuck) { stuck = late >= STUCK_MS; schedule(); }
        return;
      }
      if (!view || sr.phase === 'ended') return;
      var now = client.serverNow();
      var me = sr.p[client.view().uid] || {};
      if (sr.phase === 'starting') {
        var toGo = (sr.openAt || sr.startAt) - now;
        view.setPlaying(false);
        view.setTime(sr.settings.seconds * 1000);
        if (toGo > COUNT_MS) {
          var s = Math.ceil(toGo / 1000);
          if (lastCount !== 'w' + s) {
            var first = lastCount === null || String(lastCount).charAt(0) !== 'w';
            lastCount = 'w' + s;
            if (first) view.overlay('how', t('srtGetReady', 'Get ready'), [], howCard(sr.settings, FF.ui.div('srt-howcard__count', '')));
            var cnt = view.stage.querySelector('.srt-howcard__count');
            if (cnt) cnt.textContent = t('srtStartingIn', 'Starting in {n}s', { n: s });
          }
        } else {
          var c = Math.max(1, Math.ceil(toGo / 1000));
          if (lastCount !== c) { lastCount = c; view.overlay('count', String(c)); api.audio.play('countdown'); }
        }
        maybeNudge('s', sr.openAt || sr.startAt);
        return;
      }
      // playing
      var close = sr.closeAt ? Math.min(sr.closeAt, sr.deadline) : sr.deadline;
      if (lastCount !== 0) {
        lastCount = 0;
        if (!me.done && !me.out) {
          view.overlay('go', t('srtGoBig', 'Sort!'));
          setTimeout(function () { if (view && !view._ended) view.overlay(null); }, 600);
          api.audio.play('roundStart');
        }
      }
      if (!me.done && !me.out) {
        view.setPlaying(now < close);
        if (sr.closeAt && sr.closeAt < sr.deadline && !view._lastCall) {
          view._lastCall = true;
          view.stage.classList.add('is-lastcall');
        }
      }
      view.setTime(close - now);
      maybeNudge('c', close);
    }

    /* ---------- the end ---------- */

    function showEnd(sr, v) {
      finishedShown = true;
      if (view) { view.destroy(); view = null; }
      FF.ui.clear(root);
      var res = sr.result || { rows: [] };
      var cfg = sr.settings;
      var rows = (res.rows || []).map(function (r) { return Object.assign({}, r, { who: who(r.uid), me: r.uid === v.uid }); });
      var stage = FF.GameUI.stage({ center: true, className: 'srt srt-results' });
      stage.setAttribute('data-srt-theme', theme());
      stage.appendChild(FF.GameUI.kicker(t('srtName', 'SortRush') + ' · ' + modeLabel(cfg.mode)));
      stage.appendChild(FF.GameUI.prompt(headline(rows, cfg, false), 'xl'));
      var winners = rows.filter(function (r) { return r.place === 1 && r.moves; });
      var second = rows.filter(function (r) { return r.place === 2; })[0];
      if (winners.length === 1 && second) stage.appendChild(FF.GameUI.sub(t('srtRunnerUp', 'Runner-up: {name}', { name: second.me ? t('you', 'You') : second.who.name })));
      var why = cfg.mode === 'score' ? t('srtWhyScore', 'The most points when time ran out wins.')
        : res.why === 'time' ? t('srtWhyTime', 'Time ran out, so the most sorted holders counted.')
          : res.why === 'lastCall' ? t('srtWhyLast', 'The last call ran out after the first finish.') : '';
      if (why) stage.appendChild(FF.GameUI.note(why));
      stage.appendChild(resultsTable(rows, cfg));
      stage.appendChild(FF.GameUI.action(t('srtSeeScores', 'See scores'), function () { api.audio.play('click'); finish(); }, { icon: 'trophy' }));
      root.appendChild(stage);
      var mine = rows.filter(function (r) { return r.me; })[0];
      var won = mine && winners.length === 1 && winners[0].me;
      api.audio.play(won ? 'winner' : 'roundEnd');
      if (won && animationsOn() && FF.Confetti) FF.Confetti.burst(90);
      if (FF.UI.announce) FF.UI.announce(headline(rows, cfg, false));
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  /* ================= registration ================= */

  FF.registerGame({
    id: 'sortRush',
    name: 'SortRush',
    description: 'Sort the colours: nuts on bolts, balls in tubes, rings on pegs or blocks in trays. Race to finish first, or score the most before time runs out.',
    category: 'visual',
    icon: '🧪',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 3,
    tags: ['puzzle', 'colours', 'online', 'race'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    leaderboard: true,
    howToPlay: [
      'Holders are filled with mixed colours. Move them until every holder holds just one colour.',
      'Tap a holder to lift the top colour (every matching piece on top moves together), then tap another holder to drop it there. Or drag it.',
      'An object can go on an empty holder, or on top of the same colour, if there is room. A full holder of one colour is finished and locked.',
      'Race: sort it first. Timed Score: clear as many puzzles as you can before time runs out.',
      'Pick Nuts, Balls, Rings or Blocks, and a board look: Workshop, Candy or Neon.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (api.config.room && room) { online(api, room); return; }
      if (api.config.daily || api.config.challenge) {
        var saved = pref('setup', null) || {};
        playAll(api, R.sanitize(Object.assign({}, R.STANDARD, { style: saved.style || R.STANDARD.style })));
        return;
      }
      setupScreen(api, function (cfg) { playAll(api, cfg); });
    }
  });

  FF.SortRushGame = { summary: summary, fields: fields, howLines: howLines, STYLE: STYLE };
})();
