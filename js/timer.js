/* ============================================================
   FAMILY FUN — timer.js
   Reusable countdown timers with pause/resume/warning/finish.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.Timer = {
    create: function (opts) {
      opts = opts || {};
      const t = {
        duration: 0,
        remaining: 0,
        running: false,
        finished: false,
        _interval: null,
        _last: 0,
        onTick: opts.onTick || null,
        onFinish: opts.onFinish || null,
        onWarning: opts.onWarning || null,
        warningAt: opts.warningAt || 5,   // seconds remaining that triggers warning
        _warned: false,
        countdownAt: (opts.countdownAt !== undefined) ? opts.countdownAt : 10, // beep each second from here down
        countdownSound: opts.countdownSound || 'countdown',
        onCountdown: opts.onCountdown || null,
        _beepSec: null,

        start: function (seconds) {
          this.stop();
          this.duration = seconds;
          this.remaining = seconds;
          this.finished = false;
          this.running = true;
          this._warned = false;
          this._beepSec = null;
          this._last = Date.now();
          this._emitTick();
          const self = this;
          this._interval = setInterval(function () { self._step(); }, 100);
        },

        _step: function () {
          if (!this.running) return;
          const now = Date.now();
          const delta = (now - this._last) / 1000;
          this._last = now;
          this.remaining = Math.max(0, this.remaining - delta);
          this._emitTick();
          this._checkCountdown();
          if (!this._warned && this.warningAt > 0 && this.remaining <= this.warningAt && this.remaining > 0) {
            this._warned = true;
            if (this.onWarning) this.onWarning(this.remaining);
          }
          if (this.remaining <= 0) {
            this.remaining = 0;
            this.finished = true;
            this.running = false;
            this.stop();
            if (this.onFinish) this.onFinish();
          }
        },

        pause: function () {
          if (!this.running) return;
          this.running = false;
          if (this._interval) clearInterval(this._interval);
          this._interval = null;
        },

        resume: function () {
          if (this.running || this.finished) return;
          this.running = true;
          this._last = Date.now();
          const self = this;
          this._interval = setInterval(function () { self._step(); }, 100);
        },

        stop: function () {
          this.running = false;
          if (this._interval) { clearInterval(this._interval); this._interval = null; }
        },

        reset: function () {
          this.stop();
          this.remaining = this.duration;
          this.finished = false;
          this._warned = false;
          this._beepSec = null;
        },

        add: function (seconds) { this.remaining += seconds; this._emitTick(); },
        setRemaining: function (s) { this.remaining = Math.max(0, s); this._emitTick(); },
        getRemaining: function () { return this.remaining; },
        isRunning: function () { return this.running; },
        isFinished: function () { return this.finished; },

        _emitTick: function () {
          if (this.onTick) this.onTick(this.remaining);
        },

        _checkCountdown: function () {
          if (this.countdownAt <= 0) return;
          // Only beep when the timer is actually long enough to count
          // down through the threshold (skips quick reaction-round timers).
          if (this.duration < this.countdownAt) return;
          const sec = Math.ceil(this.remaining);
          if (sec >= 1 && sec <= this.countdownAt && sec !== this._beepSec) {
            this._beepSec = sec;
            if (this.onCountdown) this.onCountdown(sec);
            if (FF.Audio && FF.Audio.play) FF.Audio.play(this.countdownSound);
          }
        }
      };
      return t;
    }
  };
})();
