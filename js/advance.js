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

  FF.Advance = {
    DEFAULT_MS: DEFAULT_MS,
    controller: controller
  };
})();
