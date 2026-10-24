/* ============================================================
   PLAYMONA — avatars.js
   The character avatar set (assets/avatars/*.webp, listed in
   js/data/avatars.js by tools/gen-brand-assets.py).

   Players store an avatar id such as 'fox'. Values saved before the
   character set existed (emoji like '😀') map to a stable character,
   so nobody's picture changes at random between visits.

   A profile photo is stored the same way, as 'photo:<file>' (see
   js/photo.js and api/lib/Photos.php), so it shows everywhere a
   character does. If the file is gone (an admin removed it), the
   picture falls back to a character.
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

  var PHOTO = /^photo:([a-f0-9]{16}-[a-f0-9]{8}\.(?:webp|jpg))$/;

  FF.Avatars = {
    GROUPS: ['people', 'animals', 'fantasy'],

    all: function () { return list(); },

    isPhoto: function (value) { return typeof value === 'string' && PHOTO.test(value); },

    has: function (id) {
      if (this.isPhoto(id)) return true;
      return list().some(function (a) { return a.id === id; });
    },

    get: function (id) {
      return list().filter(function (a) { return a.id === id; })[0] || null;
    },

    url: function (id) {
      var m = typeof id === 'string' ? PHOTO.exec(id) : null;
      if (m) return '/uploads/avatars/' + m[1];
      return 'assets/avatars/' + id + '.webp';
    },

    // The character shown when a photo cannot load.
    fallback: function (value) {
      var items = list();
      return items.length ? items[hash(value || 'player') % items.length].id : '';
    },

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
      var value = this.normalize(id);
      var el = FF.ui.el('img', {
        class: (cls ? cls + ' ' : '') + 'avatar-img' + (this.isPhoto(value) ? ' avatar-img--photo' : ''),
        src: this.url(value),
        alt: alt || '',
        loading: 'lazy',
        decoding: 'async',
        draggable: 'false',
        width: 96,
        height: 96
      });
      this.guard(el);
      return el;
    },

    // A photo that will not load (removed, or offline and never seen) shows a character instead.
    guard: function (el) {
      var self = this;
      if (el._avatarGuard) return;
      el._avatarGuard = true;
      el.addEventListener('error', function () {
        var m = /\/uploads\/avatars\/([a-f0-9]{16}-[a-f0-9]{8}\.(?:webp|jpg))$/.exec(el.src || '');
        if (!m) return;
        el.classList.remove('avatar-img--photo');
        el.src = self.url(self.fallback('photo:' + m[1]));
      });
    }
  };
})();
