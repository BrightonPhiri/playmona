/* ============================================================
   FAMILY FUN — storage.js
   Safe localStorage wrapper with in-memory fallback.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  const PREFIX = 'familyfun:';

  FF.Storage = {
    available: false,
    _mem: {},

    init: function () {
      try {
        const k = PREFIX + '__test';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        this.available = true;
      } catch (e) {
        this.available = false;
      }
    },

    get: function (key, def) {
      if (!this.available) return (key in this._mem) ? this._mem[key] : def;
      try {
        const raw = window.localStorage.getItem(PREFIX + key);
        if (raw == null) return def;
        return JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },

    set: function (key, val) {
      if (!this.available) { this._mem[key] = val; return; }
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(val));
      } catch (e) {
        /* storage may be full or blocked — fail silently */
      }
    },

    remove: function (key) {
      if (!this.available) { delete this._mem[key]; return; }
      try { window.localStorage.removeItem(PREFIX + key); } catch (e) {}
    },

    clear: function () {
      if (!this.available) { this._mem = {}; return; }
      try {
        const keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) keys.push(k);
        }
        keys.forEach(function (k) { window.localStorage.removeItem(k); });
      } catch (e) {}
    }
  };
})();
