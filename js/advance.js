/* ============================================================
   FAMILY FUN — advance.js
   Auto-advance: a countdown that moves the game to the next
   round without a manual tap, with a visible progress bar and
   tap-to-skip. Split into a DOM-free controller (unit tested)
   and a DOM button wrapper.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var DEFAULT_MS = 2000;

  /* ---------- Pure countdown controller ----------
     States: idle -> running -> done
                     running <-> paused
             any -> cancelled
     onDone fires at most once, ever. */
  function controller(opts) {
    opts = opts || {};
    var ms = Math.max(0, opts.ms == null ? DEFAULT_MS : opts.ms);
    var now = opts.now || function () { return Date.now(); };
    var onDone = opts.onDone || function () {};
    var onTick = opts.onTick || null;

    var state = 'idle';
    var elapsed = 0;        // accumulated running time, excluding pauses
    var startedAt = 0;      // clock reading when the current run leg began

    function runningElapsed() {
      return state === 'running' ? elapsed + (now() - startedAt) : elapsed;
    }

    function finish() {
      if (state === 'done' || state === 'cancelled') return;
      elapsed = ms;
      state = 'done';
      onDone();
    }

    var api = {
      start: function () {
        if (state !== 'idle') return api;
        state = 'running';
        startedAt = now();
        return api;
      },

      tick: function () {
        if (state !== 'running') return api;
        if (onTick) onTick(api.progress());
        if (runningElapsed() >= ms) finish();
        return api;
      },

      pause: function () {
        if (state !== 'running') return api;
        elapsed += now() - startedAt;
        state = 'paused';
        return api;
      },

      resume: function () {
        if (state !== 'paused') return api;
        state = 'running';
        startedAt = now();
        return api;
      },

      skip: function () {
        if (state === 'cancelled') return api;
        finish();
        return api;
      },

      cancel: function () {
        if (state === 'done') return api;
        state = 'cancelled';
        return api;
      },

      state: function () { return state; },

      progress: function () {
        if (ms <= 0) return 1;
        var p = runningElapsed() / ms;
        return p < 0 ? 0 : (p > 1 ? 1 : p);
      },

      remaining: function () {
        var r = ms - runningElapsed();
        return r < 0 ? 0 : r;
      }
    };

    return api;
  }

  /* ---------- Live controller registry ----------
     GameFlow pause/resume/exit drive these so a paused game
     never advances behind the overlay. */
  var live = [];

  function register(ctrl) {
    live.push(ctrl);
    return ctrl;
  }

  function forget(ctrl) {
    var i = live.indexOf(ctrl);
    if (i !== -1) live.splice(i, 1);
  }

  /* ---------- Styles (injected once, matching the app's pattern) ---------- */
  var STYLE_READY = false;
  function ensureStyles() {
    if (STYLE_READY) return;
    STYLE_READY = true;
    if (!document || !document.head) return;
    var style = document.createElement('style');
    style.id = 'ff-advance-style';
    style.textContent = [
      '.ff-adv{position:relative;overflow:hidden;}',
      '.ff-adv__fill{position:absolute;left:0;top:0;bottom:0;width:0%;',
      'background:currentColor;opacity:0.18;pointer-events:none;border-radius:inherit;}',
      '.ff-adv__label{position:relative;z-index:1;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function defaultMs() {
    var v = (FF.Settings && typeof FF.Settings.get === 'function')
      ? FF.Settings.get('autoAdvanceMs')
      : DEFAULT_MS;
    v = parseInt(v, 10);
    if (isNaN(v) || v < 0) v = DEFAULT_MS;
    return v;
  }

  function reduceMotion() {
    return !!(FF.Settings && typeof FF.Settings.get === 'function' && FF.Settings.get('reduceMotion'));
  }

  /* Build a button that fires `fn` on click OR when the countdown ends. */
  function button(label, fn, opts) {
    opts = opts || {};
    ensureStyles();

    var ms = opts.ms == null ? defaultMs() : Math.max(0, opts.ms);
    var fired = false;
    var raf = null;
    var safety = null;

    var btn = FF.ui.button('', {
      class: 'ff-adv ' + (opts.class || 'btn btn-lg'),
      primary: opts.primary !== false,
      ariaLabel: String(label)
    });

    var fill = FF.ui.el('span', { class: 'ff-adv__fill', 'aria-hidden': 'true' });
    var text = FF.ui.el('span', { class: 'ff-adv__label' }, String(label));
    btn.appendChild(fill);
    btn.appendChild(text);

    function stopLoop() {
      if (raf != null) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(raf);
        else clearTimeout(raf);
        raf = null;
      }
      if (safety != null) { clearInterval(safety); safety = null; }
    }

    function done() {
      if (fired) return;
      fired = true;
      stopLoop();
      forget(ctrl);
      fn();
    }

    var ctrl = controller({
      ms: ms,
      onDone: done,
      onTick: function (p) {
        if (!reduceMotion()) fill.style.width = Math.round(p * 100) + '%';
      }
    });

    btn.advance = ctrl;

    btn.addEventListener('click', function () {
      ctrl.skip();
    });

    // ms of 0 means "stay manual" - no countdown, click only.
    if (ms > 0) {
      register(ctrl);
      ctrl.start();
      var loop = function () {
        if (ctrl.state() === 'done' || ctrl.state() === 'cancelled') { stopLoop(); return; }
        ctrl.tick();
        raf = window.requestAnimationFrame ? window.requestAnimationFrame(loop) : setTimeout(loop, 50);
      };
      raf = window.requestAnimationFrame ? window.requestAnimationFrame(loop) : setTimeout(loop, 50);

      // requestAnimationFrame is throttled or suspended in a background
      // tab, which would strand the countdown. The controller measures
      // wall-clock time and onDone is idempotent, so a coarse interval
      // is a safe net: whichever notices first finishes the round.
      safety = setInterval(function () {
        if (ctrl.state() === 'done' || ctrl.state() === 'cancelled') { stopLoop(); return; }
        ctrl.tick();
      }, 200);
    }

    return btn;
  }

  FF.Advance = {
    DEFAULT_MS: DEFAULT_MS,
    controller: controller,
    button: button,
    defaultMs: defaultMs,
    pauseAll: function () { live.slice().forEach(function (c) { c.pause(); }); },
    resumeAll: function () { live.slice().forEach(function (c) { c.resume(); }); },
    cancelAll: function () { live.slice().forEach(function (c) { c.cancel(); }); live.length = 0; }
  };
})();
