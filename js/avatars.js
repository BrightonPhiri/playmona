/* ============================================================
   PLAYMORA — avatars.js
   The character avatar set (assets/avatars/*.webp, listed in
   js/data/avatars.js by tools/gen-brand-assets.py).

   Players store an avatar id such as 'fox'. Values saved before the
   character set existed (emoji like '😀') map to a stable character,
   so nobody's picture changes at random between visits.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function list() { return FF.AVATAR_LIST || []; }

  function hash(str) {
    var h = 2166136261;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 16777619) : (h * 16777619) | 0;
    }
    return h >>> 0;
  }

  FF.Avatars = {
    GROUPS: ['people', 'animals', 'fantasy'],

    all: function () { return list(); },

    has: function (id) {
      return list().some(function (a) { return a.id === id; });
    },

    get: function (id) {
      return list().filter(function (a) { return a.id === id; })[0] || null;
    },

    url: function (id) { return 'assets/avatars/' + id + '.webp'; },

    // Any stored value -> a valid avatar id (stable for the same input).
    normalize: function (value, seed) {
      if (value && this.has(value)) return value;
      var items = list();
      if (!items.length) return value || '';
      return items[hash(value || seed || 'player') % items.length].id;
    },

    // A random id, avoiding ones already in use where possible.
    random: function (exclude) {
      exclude = exclude || [];
      var pool = list().filter(function (a) { return exclude.indexOf(a.id) === -1; });
      if (!pool.length) pool = list();
      if (!pool.length) return '';
      return pool[Math.floor(Math.random() * pool.length)].id;
    },

    // <img> for an avatar id. Decorative by default (names sit next to it).
    img: function (id, cls, alt) {
      return FF.ui.el('img', {
        class: (cls ? cls + ' ' : '') + 'avatar-img',
        src: this.url(this.normalize(id)),
        alt: alt || '',
        loading: 'lazy',
        decoding: 'async',
        draggable: 'false',
        width: 96,
        height: 96
      });
    }
  };
})();
