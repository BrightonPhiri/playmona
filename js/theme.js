/* ============================================================
   FAMILY FUN — theme.js
   Light / Dark / System theme + accent colours.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.Theme = {
    themes: ['light', 'dark', 'system'],
    accents: [
      { id: 'purple', name: 'Purple', color: '#8b5cf6' },
      { id: 'blue', name: 'Blue', color: '#3b82f6' },
      { id: 'green', name: 'Green', color: '#10b981' },
      { id: 'orange', name: 'Orange', color: '#f97316' },
      { id: 'red', name: 'Red', color: '#ef4444' },
      { id: 'pink', name: 'Pink', color: '#ec4899' },
      { id: 'gold', name: 'Gold', color: '#eab308' }
    ],

    // Bundled fonts (see css/fonts.css + assets/fonts/). "system" uses the OS stack.
    fonts: [
      { id: 'system', name: 'System', family: 'var(--font-system)' },
      { id: 'nunito', name: 'Nunito', family: '"Nunito", var(--font-system)' },
      { id: 'fredoka', name: 'Fredoka', family: '"Fredoka", var(--font-system)' },
      { id: 'baloo', name: 'Baloo 2', family: '"Baloo 2", var(--font-system)' },
      { id: 'quicksand', name: 'Quicksand', family: '"Quicksand", var(--font-system)' },
      { id: 'atkinson', name: 'Atkinson Hyperlegible', family: '"Atkinson Hyperlegible", var(--font-system)' }
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

    getAccent: function () { return FF.Storage.get('accent', 'purple'); },
    setAccent: function (a) {
      if (!this.accents.some(function (x) { return x.id === a; })) a = 'purple';
      FF.Storage.set('accent', a);
      this.apply();
    },

    getFont: function () { return FF.Storage.get('font', 'fredoka'); },
    setFont: function (f) {
      if (!this.fonts.some(function (x) { return x.id === f; })) f = 'fredoka';
      FF.Storage.set('font', f);
      this.apply();
    },
    getFontFamily: function () {
      const id = this.getFont();
      for (let i = 0; i < this.fonts.length; i++) {
        if (this.fonts[i].id === id) return this.fonts[i].family;
      }
      return this.fonts[0].family;
    },

    apply: function () {
      const resolved = this.resolvedTheme();
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.setAttribute('data-accent', this.getAccent());
      document.documentElement.setAttribute('data-font', this.getFont());
      document.documentElement.style.setProperty('--font-ui', this.getFontFamily());
      if (typeof FF.Settings !== 'undefined') {
        document.documentElement.setAttribute('data-reduce', FF.Settings.get('reduceMotion') ? '1' : '0');
      }
      if (document.body) document.body.setAttribute('data-theme', resolved);
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
