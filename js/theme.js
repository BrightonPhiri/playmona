/* ============================================================
   PLAYMORA — theme.js
   Light / Dark / System theme + accent colours.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.Theme = {
    themes: ['light', 'dark', 'system'],
    // Swatch colours are the vivid accent; css/tokens.css holds the
    // text-safe shades actually used for text and filled buttons.
    accents: [
      { id: 'purple', name: 'Purple', color: '#8b5cf6' },
      { id: 'blue', name: 'Blue', color: '#3b82f6' },
      { id: 'green', name: 'Green', color: '#10b981' },
      { id: 'orange', name: 'Orange', color: '#f97316' },
      { id: 'red', name: 'Red', color: '#ef4444' },
      { id: 'pink', name: 'Pink', color: '#ec4899' },
      { id: 'gold', name: 'Gold', color: '#eab308' }
    ],

    // Bundled fonts (see css/fonts.css + assets/fonts/). Each option sets a
    // display face (headings, buttons) and a body face (reading text).
    fonts: [
      { id: 'fredoka', name: 'Playful', display: '"Fredoka", var(--font-system)', body: '"Nunito", var(--font-system)' },
      { id: 'atkinson', name: 'Easy-read', display: '"Atkinson Hyperlegible", var(--font-system)', body: '"Atkinson Hyperlegible", var(--font-system)' },
      { id: 'nunito', name: 'Rounded', display: '"Nunito", var(--font-system)', body: '"Nunito", var(--font-system)' },
      { id: 'baloo', name: 'Bubbly', display: '"Baloo 2", var(--font-system)', body: '"Nunito", var(--font-system)' },
      { id: 'quicksand', name: 'Light', display: '"Quicksand", var(--font-system)', body: '"Nunito", var(--font-system)' },
      { id: 'system', name: 'System', display: 'var(--font-system)', body: 'var(--font-system)' }
    ],

    textSizes: [
      { id: 'standard', name: 'Standard' },
      { id: 'large', name: 'Large' },
      { id: 'xl', name: 'Extra large' }
    ],

    init: function () {
      this.apply();
      this._watchSystem();
    },

    getTheme: function () { return FF.Storage.get('theme', 'system'); },
    setTheme: function (t) {
      if (this.themes.indexOf(t) === -1) t = 'system';
      FF.Storage.set('theme', t);
      this.apply();
    },
    resolvedTheme: function () {
      const t = this.getTheme();
      if (t === 'system') {
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      }
      return t;
    },

    getAccent: function () { return FF.Storage.get('accent', 'blue'); },
    setAccent: function (a) {
      if (!this.accents.some(function (x) { return x.id === a; })) a = 'blue';
      FF.Storage.set('accent', a);
      this.apply();
    },

    getFont: function () { return FF.Storage.get('font', 'fredoka'); },
    setFont: function (f) {
      if (!this.fonts.some(function (x) { return x.id === f; })) f = 'fredoka';
      FF.Storage.set('font', f);
      this.apply();
    },
    _fontDef: function () {
      const id = this.getFont();
      for (let i = 0; i < this.fonts.length; i++) {
        if (this.fonts[i].id === id) return this.fonts[i];
      }
      return this.fonts[0];
    },
    getFontFamily: function () { return this._fontDef().body; },

    getTextSize: function () { return FF.Storage.get('textSize', 'standard'); },
    setTextSize: function (size) {
      if (!this.textSizes.some(function (x) { return x.id === size; })) size = 'standard';
      FF.Storage.set('textSize', size);
      this.apply();
    },

    // Category colours on by default: they help younger players find a
    // kind of game by colour before they can read its name.
    getMixAccents: function () { return !!FF.Storage.get('mixAccents', true); },
    setMixAccents: function (on) {
      FF.Storage.set('mixAccents', !!on);
      this.apply();
    },

    apply: function () {
      const resolved = this.resolvedTheme();
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.setAttribute('data-accent', this.getAccent());
      document.documentElement.setAttribute('data-font', this.getFont());
      document.documentElement.setAttribute('data-mix-accents', this.getMixAccents() ? '1' : '0');
      const font = this._fontDef();
      document.documentElement.setAttribute('data-text-size', this.getTextSize());
      document.documentElement.style.setProperty('--font-display', font.display);
      document.documentElement.style.setProperty('--font-body', font.body);
      document.documentElement.style.setProperty('--font-ui', font.body);
      if (typeof FF.Settings !== 'undefined') {
        document.documentElement.setAttribute('data-reduce', FF.Settings.get('reduceMotion') ? '1' : '0');
      }
      if (document.body) document.body.setAttribute('data-theme', resolved);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#080c26' : '#f5f7ff');
      this._notify();
    },

    _notify: function () {
      if (typeof FF.App !== 'undefined' && FF.App.onThemeChange) FF.App.onThemeChange();
    },

    _watchSystem: function () {
      if (!window.matchMedia) return;
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const self = this;
      const handler = function () { if (self.getTheme() === 'system') self.apply(); };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  };
})();
