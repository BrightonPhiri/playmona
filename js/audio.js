/* ============================================================
   PLAYMORA — audio.js
   Web Audio API sound effects + light procedural music.
   No external audio files required. Works silently if unavailable.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  const SFX = {
    click:     { f: 480,  d: 0.05, type: 'triangle', v: 0.12 },
    select:    { f: 620,  d: 0.06, type: 'triangle', v: 0.12 },
    countdown: { f: 880,  d: 0.09, type: 'square',   v: 0.10 },
    correct:   { f: 660,  d: 0.12, type: 'triangle', v: 0.16, chord: [660, 880] },
    wrong:     { f: 220,  d: 0.20, type: 'sawtooth', v: 0.12, slide: 160 },
    roundStart:{ f: 523,  d: 0.18, type: 'triangle', v: 0.14, chord: [523, 659, 784] },
    roundEnd:  { f: 784,  d: 0.25, type: 'triangle', v: 0.14, chord: [523, 659, 784] },
    winner:    { f: 523,  d: 0.5,  type: 'triangle', v: 0.16, chord: [523, 659, 784, 1047] },
    warning:   { f: 740,  d: 0.10, type: 'square',   v: 0.10 },
    tap:       { f: 1000, d: 0.04, type: 'square',   v: 0.10 },
    flip:      { f: 520,  d: 0.05, type: 'triangle', v: 0.08 },
    tick:      { f: 1000, d: 0.03, type: 'square',   v: 0.05 },
    streak:    { f: 900,  d: 0.1,  type: 'triangle', v: 0.12, chord: [900, 1200] }
  };

  FF.Audio = {
    ctx: null,
    effectsEnabled: true,
    musicEnabled: true,
    volume: 0.7,
    musicMode: 'off', // off | calm | fun
    _musicTimer: null,
    _step: 0,

    init: function () {
      this.effectsEnabled = FF.Storage.get('sound', true);
      this.musicEnabled = FF.Storage.get('music', true);
      this.volume = FF.Storage.get('volume', 0.7);
      this.musicMode = FF.Storage.get('musicMode', 'off');
    },

    _ensureCtx: function () {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    unlock: function () {
      const ctx = this._ensureCtx();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    },

    setEffects: function (on) { this.effectsEnabled = !!on; FF.Storage.set('sound', !!on); },
    setMusic: function (on) {
      this.musicEnabled = !!on; FF.Storage.set('music', !!on);
      if (!on) this.stopMusic(); else if (this.musicMode !== 'off') this.startMusic(this.musicMode);
    },
    setVolume: function (v) { this.volume = FF.util.clamp(v, 0, 1); FF.Storage.set('volume', this.volume); },
    setMusicMode: function (mode) {
      this.musicMode = mode; FF.Storage.set('musicMode', mode);
      if (mode === 'off' || !this.musicEnabled) this.stopMusic(); else this.startMusic(mode);
    },

    _osc: function (freq, start, dur, type, vol, slideTo) {
      const ctx = this.ctx;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(vol * this.volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    },

    play: function (name) {
      if (!this.effectsEnabled) return;
      const s = SFX[name];
      if (!s) return;
      const ctx = this._ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      this._osc(s.f, now, s.d, s.type, s.v, s.slide);
      if (s.chord) {
        for (let i = 0; i < s.chord.length; i++) {
          this._osc(s.chord[i], now + 0.03 * i, s.d + 0.1, 'sine', s.v * 0.6);
        }
      }
    },

    /* ---------- light procedural music ---------- */
    startMusic: function (mode) {
      this.stopMusic();
      if (mode === 'off' || !this.musicEnabled) return;
      const ctx = this._ensureCtx();
      if (!ctx) return;
      this._step = 0;
      const self = this;
      const patterns = {
        calm: { bpm: 70, notes: [261.63, 329.63, 392.00, 329.63, 293.66, 329.63], type: 'sine', v: 0.05, dur: 0.9 },
        fun:  { bpm: 120, notes: [261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 349.23, 293.66], type: 'triangle', v: 0.05, dur: 0.5 }
      };
      const p = patterns[mode] || patterns.calm;
      const beat = 60000 / p.bpm;
      function tick() {
        if (!self.musicEnabled) return;
        const ctx = self.ctx;
        if (!ctx || ctx.state === 'closed') return;
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
        const note = p.notes[self._step % p.notes.length];
        self._osc(note, ctx.currentTime, p.dur, p.type, p.v);
        if (self._step % 2 === 0) self._osc(note / 2, ctx.currentTime, p.dur, 'sine', p.v * 0.5);
        self._step++;
      }
      tick();
      this._musicTimer = setInterval(tick, beat);
    },

    stopMusic: function () {
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    }
  };
})();
