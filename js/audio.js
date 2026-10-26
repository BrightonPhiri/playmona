/* ============================================================
   PLAYMONA — audio.js
   Web Audio API sound effects, plus the platform's music
   (songs in assets/music/). Works silently if unavailable.
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
    heartbeat: { f: 70,   d: 0.18, type: 'sine',     v: 0.16 },
    streak:    { f: 900,  d: 0.1,  type: 'triangle', v: 0.12, chord: [900, 1200] }
  };

  FF.Audio = {
    ctx: null,
    effectsEnabled: true,
    musicEnabled: true,
    volume: 0.7,        // sound effects
    musicVolume: 1,     // music: the song's own level unless the player lowers it

    init: function () {
      this.effectsEnabled = FF.Storage.get('sound', true);
      this.musicEnabled = FF.Storage.get('music', true);
      this.volume = FF.Storage.get('volume', 0.7);
      this.musicVolume = FF.Storage.get('musicVolume', 1);
      FF.Storage.remove('musicMode');   // the old built-in tunes are gone
    },

    _ensureCtx: function () {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    /* The tap sound for every button, link, tab and menu item (wired in navigation.js).
       It waits until the tap's own handlers have run: if one of them played a sound
       (a correct answer, a game starting), that sound wins and the tap stays quiet. */
    TAP_TARGETS: 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], ' +
      '[role="menuitemradio"], [role="switch"], [role="radio"], [role="option"], [role="checkbox"], summary, select, ' +
      'input[type="checkbox"], input[type="radio"]',
    _tapPending: false,
    tap: function (e) {
      if (this._tapPending) return;   // one sound per tap (a label also clicks its input)
      var t = e && e.target;
      var el = t && t.closest ? t.closest(this.TAP_TARGETS) : null;
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[data-no-tap-sound]')) return;
      var self = this;
      var before = this.plays;
      this._tapPending = true;
      setTimeout(function () {
        self._tapPending = false;
        if (self.plays === before) self.play('click');
      }, 0);
    },

    unlock: function () {
      const ctx = this._ensureCtx();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      // The browser refused to start the music without a tap: this is that tap.
      if (this._musicBlocked) this._playMusic();
    },

    setEffects: function (on) { this.effectsEnabled = !!on; FF.Storage.set('sound', !!on); },
    setMusic: function (on) {
      this.musicEnabled = !!on; FF.Storage.set('music', !!on);
      if (on) this._playMusic(); else this._pauseMusic();
      this._musicListeners.slice().forEach(function (fn) { try { fn(!!on); } catch (e) {} });
    },
    // Called with true/false whenever music is switched on or off.
    onMusicChange: function (fn) { this._musicListeners.push(fn); },
    _musicListeners: [],
    setVolume: function (v) {
      this.volume = FF.util.clamp(v, 0, 1); FF.Storage.set('volume', this.volume);
    },
    setMusicVolume: function (v) {
      this.musicVolume = FF.util.clamp(v, 0, 1); FF.Storage.set('musicVolume', this.musicVolume);
      this._duckMusic(0.2);
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

    // How many sounds have been asked for. The app-wide tap sound (FF.Audio.tap)
    // checks it, so a control that plays its own sound is not doubled.
    plays: 0,

    play: function (name) {
      this.plays++;
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

    /* ---------- Music ----------
       Plays on a loop at the Music volume setting while someone is in the app, signed in or as a
       guest (FF.App calls startAppMusic / stopAppMusic). Browsers only allow
       sound after a tap: if the first try is refused, the next tap starts it.
       It drops lower during a game, stops while a voice chat is on (so
       players hear each other), and pauses while the tab is hidden. To add a song, put the file in assets/music/ and its path in
       PLAYLIST; songs play in order and the list repeats. */
    PLAYLIST: ['assets/music/One_World_One_Game.mp3'],
    DUCK_SHARE: 0.4,    // during a game, this share of the music volume
    _music: null,       // { el, gain, target }
    _musicOn: false,    // the app is open
    _musicBlocked: false,
    _musicHidden: false,

    startAppMusic: function () {
      this._musicOn = true;
      this._watchMusic();
      this._playMusic();
    },

    stopAppMusic: function () {
      this._musicOn = false;
      this._pauseMusic();
    },

    musicPlaying: function () { return !!(this._music && !this._music.el.paused); },

    _inVoice: function () { return !!(FF.Voice && FF.Voice.isActive && FF.Voice.isActive()); },

    _playMusic: function () {
      if (!this._musicOn || !this.musicEnabled || this._musicHidden || this._inVoice() || !this.PLAYLIST.length) return;
      var m = this._musicPlayer();
      if (!m) return;
      var self = this;
      if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
      if (!m.el.paused) { this._fadeMusic(this._musicTarget(), 0.6); return; }   // was fading out
      this._fadeMusic(0, 0);
      var p;
      try { p = m.el.play(); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function () {
        self._musicBlocked = false;
        if (!self._musicOn || !self.musicEnabled || self._musicHidden || self._inVoice()) { m.el.pause(); return; }
        self._fadeMusic(self._musicTarget(), 2);
      }, function (e) {
        // Refused for want of a tap: try again on the next one. Other errors
        // (no connection, a missing file) are left alone.
        if (!e || e.name === 'NotAllowedError') self._musicBlocked = true;
      });
    },

    _pauseMusic: function (fast) {
      var m = this._music;
      this._musicBlocked = false;
      if (!m || m.el.paused) return;
      this._saveMusicSpot();
      this._fadeMusic(0, fast ? 0.15 : 0.6, function () { m.el.pause(); });
    },

    // Quieter during a game; back up on the menus.
    _musicTarget: function () {
      var duck = document.body.classList.contains('game-active');
      return (duck ? this.DUCK_SHARE : 1) * this.musicVolume;
    },

    _duckMusic: function (secs) {
      var m = this._music;
      if (!m || m.el.paused || !this._musicOn || !this.musicEnabled) return;
      var to = this._musicTarget();
      if (to !== m.target) this._fadeMusic(to, secs == null ? 0.8 : secs);
    },

    // Glide the music to a level. Phones ignore el.volume, so the level is a
    // Web Audio gain where possible; el.volume is the fallback.
    _fadeMusic: function (to, secs, done) {
      var m = this._music;
      if (!m) return;
      clearTimeout(m.fadeDone); clearInterval(m.fadeStep);
      m.target = to;
      if (m.gain) {
        var g = m.gain.gain, now = this.ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(secs ? g.value : to, now);
        if (secs) g.linearRampToValueAtTime(to, now + secs);
      } else if (!secs) {
        m.el.volume = to;
      } else {
        var from = m.el.volume, start = Date.now();
        m.fadeStep = setInterval(function () {
          var k = Math.min(1, (Date.now() - start) / (secs * 1000));
          m.el.volume = from + (to - from) * k;
          if (k >= 1) clearInterval(m.fadeStep);
        }, 50);
      }
      if (done) m.fadeDone = setTimeout(done, secs * 1000 + 30);
    },

    _musicPlayer: function () {
      if (this._music) return this._music;
      if (typeof Audio === 'undefined') return null;
      var self = this;
      var el = new Audio();
      el.preload = 'auto';
      el.loop = this.PLAYLIST.length === 1;
      var m = { el: el, gain: null, target: 0 };
      // From file:// the browser treats the song as another site's and the
      // Web Audio route plays silence, so el.volume is used there instead.
      var ctx = location.protocol !== 'file:' && this._ensureCtx();
      if (ctx && ctx.createMediaElementSource) {
        try {
          var src = ctx.createMediaElementSource(el);
          m.gain = ctx.createGain();
          m.gain.gain.value = 0;
          src.connect(m.gain);
          m.gain.connect(ctx.destination);
        } catch (e) { m.gain = null; }
      }
      el.addEventListener('ended', function () {   // only with 2+ songs (one song loops)
        var i = (self.PLAYLIST.indexOf(el.getAttribute('src')) + 1) % self.PLAYLIST.length;
        el.src = self.PLAYLIST[i];
        self._playMusic();
      });
      var lastSave = 0;
      el.addEventListener('timeupdate', function () {
        if (Date.now() - lastSave > 5000) { lastSave = Date.now(); self._saveMusicSpot(); }
      });
      // A reload carries on where this tab was in the song.
      var spot = null;
      try { spot = JSON.parse(sessionStorage.getItem('playmona:music') || 'null'); } catch (e) {}
      var known = spot && this.PLAYLIST.indexOf(spot.src) !== -1;
      el.src = known ? spot.src : this.PLAYLIST[0];
      if (known && spot.at > 0) {
        el.addEventListener('loadedmetadata', function () {
          try { if (spot.at < el.duration - 5) el.currentTime = spot.at; } catch (e) {}
        }, { once: true });
      }
      this._music = m;
      return m;
    },

    _saveMusicSpot: function () {
      var m = this._music;
      if (!m || !m.el.currentTime) return;
      try {
        sessionStorage.setItem('playmona:music', JSON.stringify({ src: m.el.getAttribute('src'), at: Math.floor(m.el.currentTime) }));
      } catch (e) {}
    },

    _watchMusic: function () {
      if (this._musicWatched) return;
      this._musicWatched = true;
      var self = this;
      // A game opening or closing toggles body.game-active.
      if (window.MutationObserver) {
        new MutationObserver(function () { self._duckMusic(); })
          .observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
      // Joining voice chat stops the music; leaving it brings the music back.
      if (FF.Voice && FF.Voice.on) {
        var wasInVoice = self._inVoice();
        FF.Voice.on('change', function (s) {
          var inVoice = !!(s && s.active);
          if (inVoice === wasInVoice) return;
          wasInVoice = inVoice;
          if (inVoice) self._pauseMusic(); else self._playMusic();
        });
      }
      document.addEventListener('visibilitychange', function () {
        self._musicHidden = document.hidden;
        if (document.hidden) self._pauseMusic(true); else self._playMusic();
      });
      window.addEventListener('pagehide', function () { self._saveMusicSpot(); });
    }
  };
})();
