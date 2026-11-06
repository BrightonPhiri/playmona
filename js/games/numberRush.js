/* ============================================================
   PLAYMONA — games/numberRush.js
   Number Rush: find the numbers in order on spinning neon rings.

   - Solo, or pass and play (everyone gets the same board in turn).
   - Online rooms: a parallel challenge (js/net/parallel.js). Every phone
     builds the same board from the round seed, and the rings turn from the
     shared open instant, so all players chase the same thing at the same
     time. Each player keeps their own progress, mistakes and elimination.

   The board lives in a 1000 x 1000 unit square, whatever the screen, so
   ring sizes, positions and speeds never depend on the device. Ring angles
   are a pure function of game time (FF.NumberRush.ringAngle), never of
   frames, so a slow phone sees the same rings as a fast one.

   Looks: css/games.css (.nr-*), colours in css/tokens.css (--nr-*).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules (pure, tested) ================= */

  var RANGES = [20, 30, 50, 100];
  var SECONDS = [30, 60, 90, 120];
  var MISTAKES = [1, 3, 5, 0];            // 0 = unlimited
  var SPEEDS = ['slow', 'normal', 'fast', 'dynamic'];
  var ORDERS = ['up', 'down', 'random'];
  var MODES = ['race', 'score', 'survival'];
  var COUNTDOWN_MS = 3000;
  var MAX_SLOTS = 50;                      // numbers on the board at once
  var HINT_MS = 8000;                      // stuck this long: the target glows
  var HUB_R = 112;                         // the centre disc, in board units
  var BASE_DEG = { slow: 10, normal: 16, fast: 26, dynamic: 14 };
  var DYNAMIC_GAIN = 1.5;                  // dynamic ends at 2.5x its starting speed
  var RING_MULTS = [1, 1.3, 0.8, 1.55, 1.15, 0.9, 1.4];
  var REV_S = 2.4;                         // a swing back lasts this long (s)
  var REV_BACK = 0.8;                      // and peaks at this share of full speed

  function pickOf(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  function defaults(difficulty) {
    return {
      range: difficulty === 'easy' ? 20 : difficulty === 'hard' ? 50 : 30,
      seconds: 60,
      mistakes: 3,
      speed: 'normal',
      order: 'up',
      mode: 'race'
    };
  }

  /* Settings as the game uses them: only known values. Survival needs a
     mistake limit, so unlimited becomes 3 there. */
  function sanitize(s) {
    s = s || {};
    var d = defaults(s.difficulty);
    var out = {
      range: pickOf(RANGES, Number(s.range), d.range),
      seconds: pickOf(SECONDS, Number(s.seconds), d.seconds),
      mistakes: pickOf(MISTAKES, Number(s.mistakes), d.mistakes),
      speed: pickOf(SPEEDS, s.speed, d.speed),
      order: pickOf(ORDERS, s.order, d.order),
      mode: pickOf(MODES, s.mode, d.mode)
    };
    if (out.mode === 'survival' && out.mistakes === 0) out.mistakes = 3;
    if (s.difficulty) out.difficulty = String(s.difficulty);
    return out;
  }

  var STANDARD = defaults('normal');
  function isStandard(s) {
    var c = sanitize(s);
    return Object.keys(STANDARD).every(function (k) { return c[k] === STANDARD[k]; });
  }
  function key(s) { return [s.range, s.seconds, s.mistakes, s.speed, s.order, s.mode].join('|'); }

  /* The numbers to find, in the order to find them. rand() is the room's
     seeded random in a room, so every phone gets the same order. */
  function sequence(max, order, rand) {
    var list = [];
    for (var i = 0; i <= max; i++) list.push(i);
    if (order === 'down') list.reverse();
    else if (order === 'random') {
      for (var j = list.length - 1; j > 0; j--) {
        var k = Math.floor(rand() * (j + 1));
        var x = list[j]; list[j] = list[k]; list[k] = x;
      }
    }
    return list;
  }

  /* Rings for n numbers in the 1000-unit board: the biggest buttons that
     fit, rings from the outside in, numbers spread evenly on each ring.
     Returns { d, spacing, rings: [{ r, count, offset, dir, mult, rev, period }],
     slots: [{ ring, angle }] } with angles in radians. */
  function layout(n, speed, rand) {
    var best = null;
    for (var d = 156; d >= 64; d -= 2) {
      var gap = d * 1.24;
      var rings = [];
      var r = 500 - d / 2 - 10;
      while (r - d / 2 >= HUB_R + 6) {
        rings.push({ r: Math.round(r), cap: Math.max(1, Math.floor(2 * Math.PI * r / gap)) });
        r -= gap;
      }
      var cap = rings.reduce(function (s, x) { return s + x.cap; }, 0);
      best = { d: d, spacing: gap, rings: rings, cap: cap };
      if (cap >= n) break;
    }
    var total = best.cap;
    var rings2 = best.rings.map(function (x) { return { r: x.r, cap: x.cap, count: Math.min(x.cap, Math.round(n * x.cap / total)) }; });
    // Put back what rounding lost (or took too many) on the roomiest rings.
    var sum = rings2.reduce(function (s, x) { return s + x.count; }, 0);
    var guard = 0;
    while (sum !== n && guard++ < 500) {
      var pick = null;
      rings2.forEach(function (x) {
        if (sum < n && x.count < x.cap && (!pick || x.cap - x.count > pick.cap - pick.count)) pick = x;
        if (sum > n && x.count > 0 && (!pick || x.count > pick.count)) pick = x;
      });
      if (!pick) break;
      pick.count += sum < n ? 1 : -1;
      sum += sum < n ? 1 : -1;
    }
    rings2 = rings2.filter(function (x) { return x.count > 0; });

    var fastish = speed === 'fast' || speed === 'dynamic';
    var firstDir = rand() < 0.5 ? 1 : -1;
    var mults = RING_MULTS.slice();
    for (var m = mults.length - 1; m > 0; m--) {
      var q = Math.floor(rand() * (m + 1));
      var tmp = mults[m]; mults[m] = mults[q]; mults[q] = tmp;
    }
    var slots = [];
    var out = rings2.map(function (x, i) {
      var ring = {
        r: x.r,
        count: x.count,
        offset: Math.round(rand() * 360),
        dir: i % 2 ? -firstDir : firstDir,
        mult: mults[i % mults.length],
        // Fast rings sometimes swing back for a moment: every other ring,
        // on a slow, steady beat, so it can be read and planned for.
        rev: fastish && i % 2 === 1,
        period: 11 + i * 3
      };
      for (var s = 0; s < x.count; s++) slots.push({ ring: i, angle: (s / x.count) * Math.PI * 2 });
      return ring;
    });
    return { d: best.d, spacing: best.spacing, rings: out, slots: slots };
  }

  /* Where a ring is (degrees) at game time g ms, for a game of limitMs.
     Pure: every phone that agrees on g sees the same angle. */
  function ringAngle(ring, g, speed, limitMs) {
    var tau = g;
    if (speed === 'dynamic' && g > 0 && limitMs > 0) tau = g + DYNAMIC_GAIN * g * g / (2 * limitMs);
    var s = tau / 1000;
    var w = (BASE_DEG[speed] || BASE_DEG.normal) * ring.mult;
    var turned;
    if (ring.rev) {
      // Full speed for most of each period, then a short swing back: over the
      // last REV_S seconds the speed is 1 - (1 + REV_BACK) sin^2(pi x / REV_S),
      // which eases from forward to backward and back with no jolt.
      var P = ring.period;
      var k = Math.floor(s / P);
      var u = s - k * P;
      var fwd = P - REV_S;
      var perPeriod = P - (1 + REV_BACK) * REV_S / 2;
      var part;
      if (u < fwd) part = u;
      else {
        var x = u - fwd;
        part = fwd + x - (1 + REV_BACK) * (x / 2 - REV_S / (4 * Math.PI) * Math.sin(2 * Math.PI * x / REV_S));
      }
      turned = w * (k * perPeriod + part);
    } else {
      turned = w * s;
    }
    var a = (ring.offset + ring.dir * turned) % 360;
    return a < 0 ? a + 360 : a;
  }

  /* Which sequence position sits in each slot at the start. With more
     numbers than slots, the first MAX_SLOTS go on the board and each find
     brings on the next number in its place. */
  function deal(n, slotCount, rand) {
    var shown = Math.min(n, slotCount);
    var positions = [];
    for (var i = 0; i < shown; i++) positions.push(i);
    for (var j = positions.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = positions[j]; positions[j] = positions[k]; positions[k] = x;
    }
    return positions;
  }

  /* Points for a run. st: { found, total, mistakes, elim, full, used, combo }.
     Race: finishing first matters most. Score: quick finds in a row earn
     extra. Survival: still standing at the end counts most. */
  function points(st, cfg) {
    var limit = cfg.seconds * 1000;
    var v = (st.found || 0) * 10;
    var left = st.full ? Math.max(0, Math.min(1, 1 - (st.used || 0) / limit)) : 0;
    if (cfg.mode === 'race') {
      if (st.full) v += 300 + Math.round(300 * left);
    } else if (cfg.mode === 'score') {
      v += st.combo || 0;
      if (st.full) v += 200 + Math.round(200 * left);
    } else {
      if (!st.elim) v += 500;
      else v += Math.floor((st.used || 0) / 1000) * 2;
    }
    if (st.full && !st.mistakes) v += 100;    // a clean run
    return Math.max(0, Math.round(v));
  }

  /* Extra points in Score mode for a quick find after the last one. */
  function comboBonus(gapMs) {
    if (gapMs <= 800) return 10;
    if (gapMs <= 1500) return 5;
    return 0;
  }

  function clock(ms) {
    var s = Math.max(0, Math.floor((ms || 0) / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function rangeLabel(n) {
    var names = { 20: t('nrBeginner', 'Beginner'), 30: t('nrEasy', 'Easy'), 50: t('nrHard', 'Hard'), 100: t('nrExtreme', 'Extreme') };
    return '0–' + n + (names[n] ? ' · ' + names[n] : '');
  }
  function modeLabel(m) {
    return m === 'score' ? t('nrModeScore', 'Highest score') : m === 'survival' ? t('nrModeSurvival', 'Survival') : t('nrModeRace', 'Race');
  }
  function speedLabel(s) {
    return { slow: t('nrSlow', 'Slow'), normal: t('nrNormal', 'Normal'), fast: t('nrFast', 'Fast'), dynamic: t('nrDynamic', 'Speeds up') }[s];
  }
  function orderLabel(o) {
    return o === 'down' ? t('nrDown', 'Count down') : o === 'random' ? t('nrRandom', 'Random') : t('nrUp', 'Count up');
  }
  function mistakesLabel(m) { return m ? String(m) : t('nrUnlimited', 'Unlimited'); }

  function summary(s) {
    s = sanitize(s);
    return [
      modeLabel(s.mode),
      t('nrSummaryRange', 'numbers {range}', { range: '0–' + s.range }),
      t('nrSummarySecs', '{n}s', { n: s.seconds }),
      s.mistakes === 1 ? t('nrSummaryOneMistake', '1 mistake allowed')
        : s.mistakes ? t('nrSummaryMistakes', '{n} mistakes allowed', { n: s.mistakes }) : t('nrSummaryNoLimit', 'no mistake limit'),
      speedLabel(s.speed).toLowerCase(),
      orderLabel(s.order).toLowerCase()
    ].join(' · ');
  }

  /* The setting rows, for the room lobby and the solo setup screen. */
  function fields(gs) {
    function opt(label, value) { return { label: label, value: value }; }
    var out = [
      { key: 'mode', label: t('nrMode', 'Mode'), redraw: true, options: MODES.map(function (m) { return opt(modeLabel(m), m); }) },
      { key: 'range', label: t('nrNumbers', 'Numbers'), options: RANGES.map(function (r) { return opt('0–' + r, r); }) },
      { key: 'seconds', label: t('nrTime', 'Time'), options: SECONDS.map(function (s) { return opt(s + 's', s); }) },
      { key: 'mistakes', label: t('nrMistakesAllowed', 'Mistakes allowed'), options: MISTAKES.filter(function (m) {
        return !(gs && gs.mode === 'survival' && m === 0);
      }).map(function (m) { return opt(mistakesLabel(m), m); }) },
      { key: 'speed', label: t('nrSpeed', 'Ring speed'), options: SPEEDS.map(function (s) { return opt(speedLabel(s), s); }) },
      { key: 'order', label: t('nrOrder', 'Order'), options: ORDERS.map(function (o) { return opt(orderLabel(o), o); }) }
    ];
    if (gs && gs.mode === 'survival') out.push({ note: t('nrSurvivalNote', 'Survival: run out of mistakes and you are out. Whoever is still in at the end wins.') });
    return out;
  }

  var ROOM = {
    defaults: STANDARD,
    fields: function (gs) {
      if (gs.mode === 'survival' && gs.mistakes === 0) gs.mistakes = 3;
      return fields(gs);
    },
    sanitize: function (s) { return sanitize(s); },
    summary: function (s) { return summary(s); }
  };

  FF.NumberRush = {
    RANGES: RANGES, SECONDS: SECONDS, MISTAKES: MISTAKES, SPEEDS: SPEEDS, ORDERS: ORDERS, MODES: MODES,
    COUNTDOWN_MS: COUNTDOWN_MS, MAX_SLOTS: MAX_SLOTS, HUB_R: HUB_R, STANDARD: STANDARD,
    defaults: defaults, sanitize: sanitize, isStandard: isStandard, key: key,
    sequence: sequence, layout: layout, ringAngle: ringAngle, deal: deal,
    points: points, comboBonus: comboBonus, summary: summary, fields: fields, clock: clock,
    ROOM: ROOM
  };

  /* ================= device helpers ================= */

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

  /* ================= the board =================
     opts: { cfg, seq, lay, deal, turnEntity, roundText, live,
             room: { n, elapsed }, onDone(stats) }
     Returns { start, stop } (stop returns the stats so far). */
  function board(api, opts) {
    var cfg = opts.cfg;
    var seq = opts.seq;
    var lay = opts.lay;
    var total = seq.length;
    var limitMs = cfg.seconds * 1000;
    var calm = reduceMotion();
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();

    // ---------- state ----------
    var slotPos = opts.deal.slice();                     // sequence position in each slot, -1 empty
    var slotOf = {};                                     // sequence position -> slot
    slotPos.forEach(function (p, s) { slotOf[p] = s; });
    var nextFeed = slotPos.length;
    var cur = 0;                // the position being looked for
    var mistakes = 0;
    var combo = 0;
    var lastFindAt = 0;
    var started = false;
    var playing = false;        // countdown over, taps count
    var ended = false;
    var result = null;
    var g = -COUNTDOWN_MS;      // game time (ms); negative during the countdown
    var lastFrame = 0;
    var raf = 0, tick = 0;
    var timers = [];
    var shownCount = null, shownSecond = null;
    var shellTimerSet = false;
    var liveTimer = null, liveDirty = false, lastLive = 0;
    var offRounds = null;
    var rivalsDone = {};

    // ---------- DOM ----------
    var stage = FF.GameUI.stage({ wide: true, className: 'nr' });
    if (opts.live) {
      // The room's own chips (done or playing) stay out of sight: the rivals bar shows more.
      var keep = FF.ui.div('nr-keep');
      keep.appendChild(opts.live);
      stage.appendChild(keep);
    }
    if (opts.turnEntity || opts.roundText) stage.appendChild(FF.GameUI.turnBar(opts.turnEntity || null, opts.roundText || null));

    var hud = FF.ui.div('nr-hud');
    var timeStat = stat('timer', t('nrTimeLeft', 'Time left'), clock(limitMs));
    var foundStat = stat('target', t('nrFound', 'Found'), '0/' + total);
    var lives = FF.ui.div('nr-lives');
    lives.setAttribute('role', 'status');
    hud.appendChild(timeStat.el);
    hud.appendChild(foundStat.el);
    hud.appendChild(lives);
    stage.appendChild(hud);

    var rivals = null;
    if (opts.room) {
      rivals = FF.ui.div('nr-rivals');
      rivals.setAttribute('aria-label', t('nrRivals', 'The other players'));
      stage.appendChild(rivals);
    }

    var arena = FF.ui.div('nr-arena is-waiting');
    arena.setAttribute('role', 'application');
    arena.setAttribute('aria-label', t('nrBoardLabel', 'Spinning rings of numbers'));
    var bg = FF.ui.div('nr-bg' + (calm ? '' : ' is-alive'));
    arena.appendChild(bg);

    var ringEls = lay.rings.map(function (ring) {
      var el = FF.ui.div('nr-ring');
      var track = FF.ui.div('nr-track');
      var size = (ring.r * 2) / 10;
      track.style.width = size + '%';
      track.style.height = size + '%';
      el.appendChild(track);
      arena.appendChild(el);
      return el;
    });

    var buttons = lay.slots.map(function (slot, s) {
      var ring = lay.rings[slot.ring];
      var b = FF.ui.el('button', { type: 'button', class: 'nr-num' });
      b.style.left = (50 + (ring.r / 10) * Math.cos(slot.angle)) + '%';
      b.style.top = (50 + (ring.r / 10) * Math.sin(slot.angle)) + '%';
      b.style.width = (lay.d / 10) + '%';
      b.style.height = (lay.d / 10) + '%';
      var label = FF.ui.span('nr-num__label');
      b.appendChild(label);
      b.addEventListener('click', function (e) {
        // Taps are read from the board (pointerdown); this is the keyboard path.
        if (e.detail === 0) tap(s);
      });
      b._label = label;
      ringEls[slot.ring].appendChild(b);
      paintSlot(s, b);
      return b;
    });

    var hub = FF.ui.div('nr-hub');
    var hubSvg = '<svg viewBox="0 0 100 100" aria-hidden="true" class="nr-hub__ring">' +
      '<circle cx="50" cy="50" r="45" class="nr-hub__track"/>' +
      '<circle cx="50" cy="50" r="45" class="nr-hub__fill" pathLength="100" stroke-dasharray="0 100"/></svg>';
    hub.appendChild(FF.ui.el('div', { class: 'nr-hub__svg', html: hubSvg }));
    var hubKicker = FF.ui.span('nr-hub__kicker', t('nrFind', 'Find'));
    var hubNum = FF.ui.span('nr-hub__num', String(seq[0]));
    var hubNext = FF.ui.span('nr-hub__next', '');
    hub.appendChild(hubKicker);
    hub.appendChild(hubNum);
    hub.appendChild(hubNext);
    hub.setAttribute('aria-live', 'polite');
    arena.appendChild(hub);
    var hubFill = null;

    var fx = FF.ui.div('nr-fx');
    arena.appendChild(fx);
    var overlay = FF.ui.div('nr-overlay');
    var overlayText = FF.ui.div('nr-overlay__big', t('nrGetReady', 'Get ready'));
    overlay.appendChild(overlayText);
    arena.appendChild(overlay);

    stage.appendChild(arena);
    stage.appendChild(FF.GameUI.note(rulesLine()));
    root.appendChild(stage);
    hubFill = hub.querySelector ? hub.querySelector('.nr-hub__fill') : null;

    function stat(iconKey, label, value) {
      var el = FF.ui.div('nr-stat');
      el.appendChild(FF.Icons.icon(iconKey));
      var txt = FF.ui.span('nr-stat__text');
      txt.appendChild(FF.ui.span('nr-stat__label', label));
      var v = FF.ui.span('nr-stat__value', value);
      txt.appendChild(v);
      el.appendChild(txt);
      return { el: el, value: v };
    }

    function rulesLine() {
      var bits = [modeLabel(cfg.mode)];
      if (cfg.order === 'down') bits.push(t('nrRuleDown', 'Count down from {n} to 0', { n: seq[0] }));
      else if (cfg.order === 'random') bits.push(t('nrRuleRandom', 'Find the number in the middle'));
      else bits.push(t('nrRuleUp', 'Count up from 0 to {n}', { n: seq[total - 1] }));
      bits.push(cfg.mistakes === 1 ? t('nrRuleOneMistake', 'One mistake and you are out')
        : cfg.mistakes ? t('nrRuleMistakes', '{n} mistakes and you are out', { n: cfg.mistakes }) : t('nrRuleNoLimit', 'No mistake limit'));
      return bits.join(' · ');
    }

    function paintSlot(s, b) {
      b = b || buttons[s];
      var p = slotPos[s];
      if (p < 0 || p == null) {
        b.classList.add('is-gone');
        b.disabled = true;
        b._label.textContent = '';
        b.setAttribute('aria-hidden', 'true');
        return;
      }
      b.classList.remove('is-gone');
      b.disabled = false;
      b.removeAttribute('aria-hidden');
      b._label.textContent = String(seq[p]);
      b.setAttribute('aria-label', String(seq[p]));
      b.setAttribute('data-c', String(seq[p] % 6));
    }

    function renderLives() {
      FF.ui.clear(lives);
      if (!cfg.mistakes) {
        lives.appendChild(FF.ui.span('nr-lives__label', t('nrMistakesNoLimit', 'Mistakes: {n}', { n: mistakes })));
        return;
      }
      lives.appendChild(FF.ui.span('nr-lives__label', t('nrMistakesOf', 'Mistakes: {n}/{max}', { n: mistakes, max: cfg.mistakes })));
      var pips = FF.ui.span('nr-lives__pips');
      for (var i = 0; i < cfg.mistakes; i++) {
        var pip = FF.ui.span('nr-pip' + (i < mistakes ? ' is-used' : ''));
        pip.appendChild(FF.Icons.icon(i < mistakes ? 'x' : 'heart-fill'));
        pips.appendChild(pip);
      }
      lives.appendChild(pips);
    }
    renderLives();

    function renderTarget(bump) {
      if (cur >= total) return;
      hubNum.textContent = String(seq[cur]);
      hubNext.textContent = cur + 1 < total ? t('nrThen', 'then {n}', { n: seq[cur + 1] }) : t('nrLastOne', 'last one!');
      if (bump && !calm) {
        hub.classList.remove('is-bump');
        void hub.offsetWidth;
        hub.classList.add('is-bump');
      }
    }
    renderTarget(false);

    function renderFound(bump) {
      foundStat.value.textContent = cur + '/' + total;
      if (hubFill) hubFill.setAttribute('stroke-dasharray', (cur / total * 100).toFixed(1) + ' 100');
      if (bump && !calm) {
        foundStat.el.classList.remove('is-bump');
        void foundStat.el.offsetWidth;
        foundStat.el.classList.add('is-bump');
      }
    }

    // ---------- sizing ----------
    var ro = null;
    function fit() {
      if (!arena.isConnected) return;
      var w = stage.clientWidth || root.clientWidth || 360;
      var top = arena.getBoundingClientRect ? arena.getBoundingClientRect().top : 0;
      var room = (window.innerHeight || 640) - Math.max(0, top) - 56;
      var size = Math.max(260, Math.min(w, room, 640));
      arena.style.width = size + 'px';
      arena.style.height = size + 'px';
      arena.style.setProperty('--nr-d', (lay.d * size / 1000).toFixed(1) + 'px');
    }
    function onResize() { fit(); }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { fit(); });
      ro.observe(stage);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // ---------- rendering ----------
    var angles = lay.rings.map(function () { return 0; });
    function draw() {
      for (var i = 0; i < lay.rings.length; i++) {
        var a = ringAngle(lay.rings[i], g, cfg.speed, limitMs);
        angles[i] = a;
        var el = ringEls[i];
        el.style.transform = 'rotate(' + a.toFixed(2) + 'deg)';
        el.style.setProperty('--nr-rot', a.toFixed(2));
      }
    }

    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    function paused() {
      var screen = document.getElementById ? document.getElementById('game-screen') : null;
      return !!(screen && screen.querySelector && screen.querySelector('.pause-overlay'));
    }

    /* Advance game time. In a room it is read from the shared clock; on
       this device it moves with real time, except while paused. */
    function advance() {
      var t0 = now();
      if (opts.room) {
        g = (opts.room.elapsed() || 0) - COUNTDOWN_MS;
      } else if (started && lastFrame && !paused()) {
        g += Math.min(250, t0 - lastFrame);
      }
      lastFrame = t0;
    }

    var lastCount = null;
    function frame() {
      if (!arena.isConnected) { teardown(); return; }
      if (ended) return;
      advance();
      draw();
      if (!started) return;
      // the countdown
      if (g < 0) {
        var c = Math.ceil(-g / 1000);
        if (c !== lastCount) {
          lastCount = c;
          overlayText.textContent = String(c);
          overlay.classList.remove('is-tick');
          void overlay.offsetWidth;
          overlay.classList.add('is-tick');
          api.audio.play('countdown');
        }
        return;
      }
      if (!playing) beginPlay();
      // time
      var left = limitMs - g;
      var sec = Math.ceil(left / 1000);
      if (sec !== shownSecond) {
        shownSecond = sec;
        timeStat.value.textContent = clock(Math.max(0, left) + 999);
        timeStat.el.classList.toggle('is-low', left <= 10000);
      }
      if (left <= 0) { finish('time'); return; }
      // a nudge when stuck
      if (g - lastFindAt > HINT_MS) {
        var s = slotOf[cur];
        if (s != null && buttons[s] && !buttons[s].classList.contains('is-hint')) buttons[s].classList.add('is-hint');
      }
    }

    function loop() {
      if (ended) return;
      frame();
      raf = window.requestAnimationFrame ? requestAnimationFrame(loop) : 0;
    }

    function beginPlay() {
      playing = true;
      lastFindAt = 0;
      arena.classList.remove('is-waiting');
      overlayText.textContent = t('nrGo', 'Go!');
      overlay.classList.add('is-go');
      api.audio.play('roundStart');
      later(function () { overlay.classList.add('hidden'); overlay.classList.remove('is-go'); }, 650);
      var secs = Math.max(1, Math.ceil((limitMs - g) / 1000));
      if (!shellTimerSet) {
        shellTimerSet = true;
        api.shell.setTimer(secs, function () { finish('time'); });
      }
    }

    function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }

    // ---------- taps ----------
    function slotAt(clientX, clientY) {
      var rect = arena.getBoundingClientRect();
      if (!rect.width) return -1;
      var u = (clientX - rect.left) / rect.width * 1000 - 500;
      var v = (clientY - rect.top) / rect.height * 1000 - 500;
      var bestS = -1, bestD = lay.d * 0.78;
      for (var s = 0; s < lay.slots.length; s++) {
        if (slotPos[s] < 0) continue;
        var slot = lay.slots[s];
        var ring = lay.rings[slot.ring];
        var a = slot.angle + angles[slot.ring] * Math.PI / 180;
        var dx = u - ring.r * Math.cos(a);
        var dy = v - ring.r * Math.sin(a);
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestD) { bestD = dist; bestS = s; }
      }
      return bestS;
    }

    function onPointer(e) {
      if (e.button != null && e.button > 0) return;
      if (e.cancelable) e.preventDefault();
      if (!playing || ended) return;
      advance();
      draw();
      var s = slotAt(e.clientX, e.clientY);
      if (s >= 0) tap(s);
    }
    arena.addEventListener('pointerdown', onPointer);

    function tap(s) {
      if (!playing || ended) return;
      var p = slotPos[s];
      if (p == null || p < 0) return;
      var b = buttons[s];
      if (p === cur) hit(s, b);
      else miss(b);
    }

    function hit(s, b) {
      var gap = g - lastFindAt;
      if (cfg.mode === 'score' && cur > 0) combo += comboBonus(gap);
      lastFindAt = g;
      cur++;
      api.audio.play(cur % 10 === 0 ? 'streak' : 'correct');
      sparks(s);
      b.classList.remove('is-hint');
      b.classList.add('is-hit');
      // The slot is empty at once (it cannot be tapped twice); the next
      // number in line comes on after the pop.
      var feed = nextFeed < total ? nextFeed++ : -1;
      slotPos[s] = -1;
      if (feed >= 0) slotOf[feed] = s;
      later(function () {
        b.classList.remove('is-hit');
        slotPos[s] = feed;
        paintSlot(s, b);
        if (feed >= 0 && !calm) {
          b.classList.add('is-new');
          later(function () { b.classList.remove('is-new'); }, 420);
        }
        if (feed >= 0 && feed === cur && g - lastFindAt > HINT_MS) b.classList.add('is-hint');
      }, calm ? 120 : 320);
      if (feed < 0) b.disabled = true;
      renderFound(true);
      renderTarget(true);
      shareLive();
      if (cur >= total) finish('full');
    }

    function miss(b) {
      mistakes++;
      api.audio.play('wrong');
      buzz(70);
      b.classList.remove('is-wrong');
      void b.offsetWidth;
      b.classList.add('is-wrong');
      later(function () { b.classList.remove('is-wrong'); }, 460);
      if (!calm) {
        arena.classList.remove('is-shake');
        void arena.offsetWidth;
        arena.classList.add('is-shake');
        later(function () { arena.classList.remove('is-shake'); }, 360);
      }
      renderLives();
      lives.classList.remove('is-bump');
      void lives.offsetWidth;
      lives.classList.add('is-bump');
      shareLive();
      if (cfg.mistakes && mistakes >= cfg.mistakes) finish('out');
    }

    function sparks(s) {
      if (calm) return;
      var slot = lay.slots[s];
      var ring = lay.rings[slot.ring];
      var a = slot.angle + angles[slot.ring] * Math.PI / 180;
      var x = 50 + ring.r / 10 * Math.cos(a);
      var y = 50 + ring.r / 10 * Math.sin(a);
      var burst = FF.ui.span('nr-burst');
      burst.style.left = x + '%';
      burst.style.top = y + '%';
      fx.appendChild(burst);
      var nodes = [burst];
      for (var i = 0; i < 10; i++) {
        var sp = FF.ui.span('nr-spark');
        var ang = (i / 10) * Math.PI * 2 + 0.3;
        var dist = 40 + (i % 3) * 18;
        sp.style.left = x + '%';
        sp.style.top = y + '%';
        sp.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
        sp.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(0) + 'px');
        sp.setAttribute('data-c', String((i + cur) % 6));
        fx.appendChild(sp);
        nodes.push(sp);
      }
      later(function () { nodes.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); }, 700);
    }

    // ---------- the room: live progress ----------
    function liveValue() {
      return { c: cur, m: mistakes, x: result && result.elim ? 1 : 0, f: result && result.full ? 1 : 0 };
    }
    function pushLive() {
      liveTimer = null;
      if (!liveDirty || !opts.room) return;
      liveDirty = false;
      lastLive = now();
      var r = FF.Room && FF.Room.current();
      if (!r || !r.transport) return;
      r.transport.set('rounds/' + opts.room.n + '/live/' + r.uid, liveValue()).catch(function () {});
    }
    // At most one write every 600 ms; the last change always goes out.
    function shareLive(force) {
      if (!opts.room) return;
      liveDirty = true;
      if (force) { if (liveTimer) clearTimeout(liveTimer); pushLive(); return; }
      if (liveTimer) return;
      var wait = Math.max(0, 600 - (now() - lastLive));
      liveTimer = setTimeout(pushLive, wait);
    }

    function renderRivals(all) {
      if (!rivals) return;
      var node = (all || {})[opts.room.n] || {};
      var live = node.live || {};
      var answers = node.answers || {};
      var meUid = FF.Room.current() ? FF.Room.current().uid : null;
      var people = FF.Room.racePlayers().filter(function (p) { return p.uid !== meUid; });
      FF.ui.clear(rivals);
      people.forEach(function (p) {
        var l = live[p.uid] || {};
        var a = answers[p.uid] || null;
        var found = a && typeof a.found === 'number' ? a.found : (l.c || 0);
        var out = (a && a.elim) || l.x;
        var full = (a && a.full) || l.f;
        var chip = FF.ui.div('nr-rival' + (out ? ' is-out' : '') + (full ? ' is-full' : ''));
        chip.appendChild(FF.Players.avatarEl(p, 'nr-rival__ava'));
        var body = FF.ui.span('nr-rival__body');
        body.appendChild(FF.ui.span('nr-rival__name', p.name));
        var bar = FF.ui.span('nr-rival__bar');
        var fill = FF.ui.span('nr-rival__fill');
        fill.style.width = Math.round(found / total * 100) + '%';
        bar.appendChild(fill);
        body.appendChild(bar);
        chip.appendChild(body);
        var st = FF.ui.span('nr-rival__state');
        if (out) { st.appendChild(FF.Icons.icon('x-circle')); st.appendChild(document.createTextNode(t('nrOut', 'Out'))); }
        else if (full) { st.appendChild(FF.Icons.icon('check')); st.appendChild(document.createTextNode(t('nrDone', 'Done'))); }
        else st.textContent = found + '/' + total;
        chip.appendChild(st);
        rivals.appendChild(chip);
        if (full && !rivalsDone[p.uid] && !ended && cfg.mode === 'race') {
          rivalsDone[p.uid] = true;
          api.shell.toast(t('nrRivalFinished', '{name} finished!', { name: p.name }));
        }
      });
      rivals.classList.toggle('hidden', !people.length);
    }
    if (opts.room) {
      offRounds = FF.Room.on('rounds', function (all) { if (!ended || rivals.isConnected) renderRivals(all); });
      var r0 = FF.Room.current();
      renderRivals(r0 && r0.rounds);
    }

    // ---------- the end ----------
    function stats(kind) {
      var used = Math.max(0, Math.min(limitMs, g));
      var st = {
        found: cur,
        total: total,
        mistakes: mistakes,
        elim: kind === 'out',
        full: kind === 'full',
        used: used,
        combo: combo,
        range: cfg.range
      };
      st.value = points(st, cfg);
      return st;
    }

    function finish(kind) {
      if (ended) return result;
      ended = true;
      playing = false;
      result = stats(kind);
      api.shell.hideTimer();
      shareLive(true);
      buttons.forEach(function (b) { b.disabled = true; b.classList.remove('is-hint'); });
      arena.classList.add('is-over');
      overlay.classList.remove('hidden', 'is-tick', 'is-go');
      FF.ui.clear(overlay);
      var title, cls;
      if (kind === 'full') {
        title = t('nrComplete', 'Complete!');
        cls = 'is-full';
        api.audio.play('winner');
        if (!calm && FF.Confetti) FF.Confetti.burst(90);
      } else if (kind === 'out') {
        title = t('nrEliminated', 'Eliminated');
        cls = 'is-out';
        api.audio.play('wrong');
        buzz([90, 60, 140]);
      } else {
        title = t('timesUp', 'Time’s up!');
        cls = 'is-time';
        api.audio.play('roundEnd');
      }
      overlay.classList.add(cls);
      overlay.appendChild(FF.ui.div('nr-overlay__big', title));
      overlay.appendChild(FF.ui.div('nr-overlay__line', t('nrFoundOf', '{n} of {total} found', { n: result.found, total: total })));
      if (kind === 'full') overlay.appendChild(FF.ui.div('nr-overlay__line', t('nrInTime', 'in {time}', { time: clock(result.used) })));
      overlay.appendChild(FF.ui.div('nr-overlay__pts', t('plusPoints', '+{n} points', { n: FF.util.formatNumber(result.value) })));
      FF.UI.announce && FF.UI.announce(title);
      teardown(true);
      var done = result;
      later(function () { if (opts.onDone) opts.onDone(done); }, 1500);
      return result;
    }

    function teardown(keepTimers) {
      if (raf && window.cancelAnimationFrame) cancelAnimationFrame(raf);
      raf = 0;
      if (tick) clearInterval(tick);
      tick = 0;
      if (ro) { ro.disconnect(); ro = null; }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      arena.removeEventListener('pointerdown', onPointer);
      if (!keepTimers) {
        timers.forEach(clearTimeout);
        timers = [];
        if (offRounds) { offRounds(); offRounds = null; }
        if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
      }
    }

    fit();
    draw();
    // rAF draws; the interval keeps time and the end on track when frames are throttled.
    loop();
    tick = setInterval(frame, 200);
    later(fit, 50);

    return {
      start: function () {
        if (started) return;
        started = true;
        lastFrame = now();
        overlay.classList.remove('hidden');
        frame();
      },
      stop: function () {
        if (!ended) finish(cur >= total ? 'full' : 'time');
        if (offRounds) { offRounds(); offRounds = null; }
        return result;
      },
      teardown: function () { ended = true; teardown(); }
    };
  }

  /* ================= solo and pass and play ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = (FF.Storage && FF.Storage.get('numberRush:setup', null)) || null;
    var gs = sanitize(Object.assign({}, defaults(api.config.difficulty), saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'nr nr-setup' });
    stage.appendChild(FF.GameUI.kicker(t('nrSetupKicker', 'Number Rush')));
    stage.appendChild(FF.GameUI.prompt(t('nrSetupTitle', 'Set up your rush'), 'md'));
    var box = FF.ui.el('section', { class: 'settings-section nr-setup__rows' });
    var note = FF.ui.el('p', { class: 'gm-note nr-setup__note', 'aria-live': 'polite' });

    function render() {
      FF.ui.clear(box);
      fields(gs).forEach(function (f) {
        if (f.note) { box.appendChild(FF.ui.el('p', { class: 'gm-note' }, f.note)); return; }
        box.appendChild(FF.UI.settingRow(f.label, FF.UI.segmented({
          label: f.label, value: gs[f.key], options: f.options,
          onChange: function (v) {
            gs[f.key] = v;
            if (f.key === 'mode' && v === 'survival' && !gs.mistakes) gs.mistakes = 3;
            if (f.redraw) render(); else renote();
          }
        })));
      });
      renote();
    }
    function renote() {
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = summary(gs) + (ranked && !isStandard(gs) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    render();
    stage.appendChild(box);
    stage.appendChild(note);
    var row = FF.ui.div('nr-setup__actions');
    row.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () { api.audio.play('click'); gs = sanitize(STANDARD); render(); }
    }));
    row.appendChild(FF.GameUI.action(t('nrStart', 'Start the rush'), function () {
      api.audio.play('select');
      var cfg = sanitize(gs);
      try { if (FF.Storage) FF.Storage.set('numberRush:setup', cfg); } catch (e) { /* storage full */ }
      onGo(cfg);
    }, { icon: 'play' }));
    stage.appendChild(row);
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function bests() { return (FF.Storage && FF.Storage.get('numberRush:best', {})) || {}; }
  function saveBest(entityId, cfg, st) {
    var all = bests();
    var k = entityId + '|' + key(cfg);
    var old = all[k];
    if (old && old.value >= st.value) return;
    all[k] = { value: st.value, used: st.used, found: st.found };
    try { FF.Storage.set('numberRush:best', all); } catch (e) { /* storage full */ }
  }

  function playLocal(api, cfg) {
    // Rules that differ from the standard ones keep the run off the leaderboards.
    if (!isStandard(cfg)) api.config.customRules = true;
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var seq = sequence(cfg.range, cfg.order, rand);
    var lay = layout(Math.min(seq.length, MAX_SLOTS), cfg.speed, rand);
    // One deal for everybody: in pass and play each player gets the same board.
    var dealt = deal(seq.length, lay.slots.length, rand);
    var runs = [];
    var i = 0;

    function next() {
      if (!stillShown()) return;
      if (i >= list.length) { results(api, cfg, list, runs); return; }
      var who = list[i];
      if (list.length > 1) passScreen(who, function () { go(who); });
      else go(who);
    }

    function stillShown() { return !!(api.shell.root && (!document.body || !document.body.contains || document.body.contains(api.shell.root))); }

    function go(who) {
      api.shell.updateScores(who.id);
      var current = board(api, {
        cfg: cfg, seq: seq, lay: lay, deal: dealt,
        turnEntity: list.length > 1 ? who : null,
        roundText: list.length > 1 ? t('nrPlayerOf', 'Player {n} of {total}', { n: i + 1, total: list.length }) : null,
        onDone: function (st) {
          runs.push({ who: who, st: st });
          api.scoring.set(who.id, st.value);
          api.shell.updateScores(who.id);
          i++;
          next();
        }
      });
      current.start();
    }

    function passScreen(who, onReady) {
      var root = api.shell.root;
      api.shell.hideTimer();
      FF.ui.clear(root);
      var stage = FF.GameUI.stage({ center: true, className: 'nr nr-pass' });
      stage.appendChild(FF.GameUI.turnBar(who, t('nrPlayerOf', 'Player {n} of {total}', { n: i + 1, total: list.length })));
      var ava = FF.ui.div('nr-pass__ava');
      ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
      stage.appendChild(ava);
      stage.appendChild(FF.GameUI.prompt(t('nrPassTo', 'Pass to {name}', { name: who.name }), 'md'));
      stage.appendChild(FF.GameUI.sub(t('nrPassSub', 'Same rings, same numbers. Beat the others!')));
      stage.appendChild(FF.GameUI.action(t('nrReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
      root.appendChild(stage);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
    }

    next();
  }

  function rankRuns(runs) {
    var sorted = runs.slice().sort(function (a, b) {
      return b.st.value - a.st.value || (a.st.full && b.st.full ? a.st.used - b.st.used : 0);
    });
    var place = 0, prev = null;
    sorted.forEach(function (r, i) {
      if (!prev || prev.st.value !== r.st.value || (r.st.full && prev.st.full && prev.st.used !== r.st.used)) place = i + 1;
      r.place = place;
      prev = r;
    });
    return sorted;
  }

  function statusText(st) {
    if (st.full) return t('nrStatusFull', 'Completed');
    if (st.elim) return t('nrStatusOut', 'Eliminated');
    return t('nrStatusTime', 'Out of time');
  }

  function results(api, cfg, list, runs) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var ranked = rankRuns(runs);
    var top = ranked[0];
    var tie = ranked.length > 1 && ranked[1].place === 1;
    var solo = ranked.length === 1;
    var newBest = {};
    ranked.forEach(function (r) {
      var had = bests()[r.who.id + '|' + key(cfg)];
      if (!had || r.st.value > had.value) { newBest[r.who.id] = !!had; saveBest(r.who.id, cfg, r.st); }
    });

    var stage = FF.GameUI.stage({ center: true, className: 'nr nr-results' });
    var title;
    if (solo) title = top.st.full ? t('nrSoloFull', 'Sequence complete!') : top.st.elim ? t('nrSoloOut', 'Eliminated') : t('timesUp', 'Time’s up!');
    else if (tie) title = t('nrTie', 'It’s a tie!');
    else title = t('nrWins', '{name} wins!', { name: top.who.name });
    stage.appendChild(FF.GameUI.kicker(modeLabel(cfg.mode) + ' · 0–' + cfg.range));
    stage.appendChild(FF.GameUI.prompt(title, 'xl'));
    if (solo) {
      stage.appendChild(FF.ui.div('nr-results__score', FF.util.formatNumber(top.st.value)));
      if (newBest[top.who.id] === true) stage.appendChild(FF.GameUI.feedback('good', t('nrNewBest', 'New personal best!')));
      else {
        var b = bests()[top.who.id + '|' + key(cfg)];
        if (b && b.value > top.st.value) stage.appendChild(FF.GameUI.note(t('nrYourBest', 'Your best on these settings: {n}', { n: FF.util.formatNumber(b.value) })));
      }
    }
    var table = FF.ui.el('ol', { class: 'nr-table' });
    ranked.forEach(function (r) {
      var st = r.st;
      var li = FF.ui.el('li', { class: 'nr-row' + (r.place === 1 ? ' is-winner' : '') + (st.elim ? ' is-out' : '') });
      if (!solo) li.appendChild(FF.ui.span('nr-row__rank', String(r.place)));
      li.appendChild(FF.Players.avatarEl(r.who, 'nr-row__ava'));
      var who = FF.ui.span('nr-row__who');
      who.appendChild(FF.ui.span('nr-row__name', r.who.name));
      who.appendChild(FF.ui.span('nr-row__status', statusText(st) + (newBest[r.who.id] === true && !solo ? ' · ' + t('nrBestShort', 'personal best') : '')));
      li.appendChild(who);
      var nums = FF.ui.span('nr-row__nums');
      nums.appendChild(cell(t('nrFound', 'Found'), st.found + '/' + st.total + ' · ' + Math.round(st.found / st.total * 100) + '%'));
      nums.appendChild(cell(t('nrTimeTaken', 'Time'), clock(st.used)));
      nums.appendChild(cell(t('nrMistakes', 'Mistakes'), String(st.mistakes)));
      li.appendChild(nums);
      li.appendChild(FF.ui.span('nr-row__pts', FF.util.formatNumber(st.value)));
      table.appendChild(li);
    });
    stage.appendChild(table);
    stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
      api.audio.play('select');
      api.end({
        results: ranked.map(function (r) {
          return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.st.value, correct: r.st.found };
        }),
        winnerId: tie ? null : top.who.id
      });
    }, { icon: 'trophy' }));
    root.appendChild(stage);
    if (!calmNow() && FF.Confetti && (solo ? top.st.full : true)) setTimeout(function () { if (stage.isConnected) FF.Confetti.rain(100); }, 300);
    api.audio.play(solo && !top.st.full ? 'roundEnd' : 'winner');
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);

    function cell(label, value) {
      var c = FF.ui.span('nr-cell');
      c.appendChild(FF.ui.span('nr-cell__label', label));
      c.appendChild(FF.ui.span('nr-cell__value', value));
      return c;
    }
  }
  function calmNow() { return reduceMotion(); }

  /* ================= online room ================= */

  function roomSettings() {
    var r = FF.Room && FF.Room.current();
    return (r && r.meta && r.meta.settings) || {};
  }

  function online(api) {
    var cfg = sanitize(roomSettings());
    FF.Parallel.run(api, {
      rounds: 1,
      seconds: cfg.seconds + COUNTDOWN_MS / 1000,
      gate: '.nr-num',
      play: function (n, ctx) {
        // Seeded for this round: every phone draws the same order, rings and deal.
        var seq = sequence(cfg.range, cfg.order, rand);
        var lay = layout(Math.min(seq.length, MAX_SLOTS), cfg.speed, rand);
        var h = board(api, {
          cfg: cfg, seq: seq, lay: lay, deal: deal(seq.length, lay.slots.length, rand),
          live: ctx.live,
          roundText: null,
          room: { n: n, elapsed: ctx.elapsed },
          onDone: function (st) { ctx.done(st); }
        });
        return { start: h.start, stop: h.stop };
      },
      describe: function () {
        return { kind: 'card', text: t('nrWatch', 'Everyone is hunting the same spinning numbers: {s}', { s: summary(cfg) }) };
      },
      detail: function (a) {
        var bits = [t('nrFoundShort', '{n}/{total} found', { n: a.found || 0, total: a.total || (cfg.range + 1) })];
        if (a.full) bits.push(t('nrInTime', 'in {time}', { time: clock(a.used) }));
        if (a.elim) bits.push(t('nrEliminated', 'Eliminated'));
        if (a.mistakes) bits.push(a.mistakes === 1 ? t('nrOneMistake', '1 mistake') : t('nrNMistakes', '{n} mistakes', { n: a.mistakes }));
        return bits.join(' · ');
      }
    });
  }

  /* ================= registration ================= */

  FF.registerGame({
    id: 'numberRush',
    name: 'Number Rush',
    description: 'Neon rings spin both ways. Tap the numbers in order before the clock runs out, alone or against everyone.',
    category: 'numbers',
    icon: '🎯',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 2,
    tags: ['quick', 'reaction', 'numbers'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    howToPlay: [
      'Numbers ride on rings that spin, some one way and some the other.',
      'Tap them in order: 0, then 1, then 2, all the way up. The middle shows the one to find.',
      'A wrong tap is a mistake. Run out of mistakes and you are out.',
      'Finish the whole sequence first to win. Online, everyone gets the same rings at the same time.'
    ],
    room: ROOM,
    start: function (api) {
      if (FF.Parallel && FF.Parallel.active()) { online(api); return; }
      // The daily challenge and a friend's challenge play the standard rules on the shared deal.
      // (Any standard solo run is a shared deal too, so it can become a challenge: that one
      // still gets the setup screen, and changing the rules takes it off the boards.)
      if (api.config.daily || api.config.challenge) {
        playLocal(api, sanitize(STANDARD));
        return;
      }
      setupScreen(api, function (cfg) { playLocal(api, cfg); });
    }
  });
})();
