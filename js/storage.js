/* ============================================================
   PLAYMONA — storage.js
   Safe localStorage wrapper with in-memory fallback.

   Keys are either DEVICE keys (appearance, language, the signed-in
   session) or ACCOUNT keys (players, stats, favourites, gameplay
   settings). Account keys are stored per signed-in user, so two
   accounts on one device never see each other's data:

     playmona:<key>              device key
     playmona:u:<uid>:<key>      account key

   FF.Storage.onChange(fn) lets the sync layer push account changes.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var PREFIX = 'playmona:';
  var PLAYMORA_PREFIX = 'playmora:'; // the brand before PlayMona
  var LEGACY_PREFIX = 'familyfun:';

  // Everything not listed here belongs to the signed-in account.
  var DEVICE_KEYS = [
    'session', 'language', 'theme', 'accent', 'font', 'textSize', 'mixAccents',
    'reduceMotion', 'iconStyle', 'devRooms', 'devAuth', 'devAccounts',
    'roomIdentity', 'migratedFromFamilyFun', 'migratedFromPlayMora', 'legacyClaimedBy', 'lastTab',
    'guestId', 'guestProfile', 'guestUpgrade', 'playerCount', 'installDismissed', 'devCloud',
    'gameConfig', 'installTracked', 'installPending', 'trackSeen', 'guestNumber', 'visitorId', 'visitDay'
  ];

  FF.Storage = {
    available: false,
    _mem: {},
    _uid: null,
    _listeners: [],

    DEVICE_KEYS: DEVICE_KEYS,

    init: function () {
      try {
        var k = PREFIX + '__test';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        this.available = true;
      } catch (e) {
        this.available = false;
      }
      this._migrateBrand();
    },

    isDeviceKey: function (key) { return DEVICE_KEYS.indexOf(key) !== -1; },

    // Which account's data reads and writes go to (null = none signed in).
    setScope: function (uid) { this._uid = uid || null; },
    scope: function () { return this._uid; },

    _full: function (key, raw) {
      if (raw || this.isDeviceKey(key) || !this._uid) return PREFIX + key;
      return PREFIX + 'u:' + this._uid + ':' + key;
    },

    _read: function (fullKey, def) {
      if (!this.available) return (fullKey in this._mem) ? this._mem[fullKey] : def;
      try {
        var raw = window.localStorage.getItem(fullKey);
        if (raw == null) return def;
        return JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },

    _write: function (fullKey, val) {
      if (!this.available) { this._mem[fullKey] = val; return; }
      try {
        window.localStorage.setItem(fullKey, JSON.stringify(val));
      } catch (e) {
        /* storage may be full or blocked - fail silently */
      }
    },

    get: function (key, def) { return this._read(this._full(key), def); },

    set: function (key, val, opts) {
      this._write(this._full(key), val);
      if (!(opts && opts.silent) && this._uid && !this.isDeviceKey(key)) {
        var self = this;
        this._listeners.forEach(function (fn) { try { fn(key, val, self._uid); } catch (e) {} });
      }
    },

    remove: function (key) {
      var full = this._full(key);
      if (!this.available) { delete this._mem[full]; return; }
      try { window.localStorage.removeItem(full); } catch (e) {}
    },

    onChange: function (fn) {
      this._listeners.push(fn);
      var list = this._listeners;
      return function () { var i = list.indexOf(fn); if (i !== -1) list.splice(i, 1); };
    },

    // All account keys currently stored for the signed-in user.
    accountKeys: function () {
      if (!this._uid) return [];
      var pre = PREFIX + 'u:' + this._uid + ':';
      var out = [];
      if (!this.available) {
        Object.keys(this._mem).forEach(function (k) { if (k.indexOf(pre) === 0) out.push(k.slice(pre.length)); });
        return out;
      }
      try {
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k && k.indexOf(pre) === 0) out.push(k.slice(pre.length));
        }
      } catch (e) {}
      return out;
    },

    /* Data saved before accounts existed sits in unscoped keys. The first
       account to sign in on this device adopts it, so nobody loses their
       players, stats and favourites when accounts arrive. */
    claimLegacy: function (uid) {
      if (!uid || this._read(PREFIX + 'legacyClaimedBy', null)) return false;
      var self = this;
      var moved = 0;
      this._allRawKeys().forEach(function (k) {
        if (k.indexOf(PREFIX) !== 0 || k.indexOf(PREFIX + 'u:') === 0) return;
        var key = k.slice(PREFIX.length);
        if (self.isDeviceKey(key) || key === '__test') return;
        var target = PREFIX + 'u:' + uid + ':' + key;
        if (self._read(target, undefined) === undefined) {
          self._write(target, self._read(k, null));
          moved++;
        }
      });
      this._write(PREFIX + 'legacyClaimedBy', uid);
      return moved > 0;
    },

    /* Move one account's data to another (guest -> new account). Keys the
       target already has are kept; the source is emptied. */
    moveScope: function (fromUid, toUid) {
      if (!fromUid || !toUid || fromUid === toUid) return 0;
      var self = this;
      var from = PREFIX + 'u:' + fromUid + ':';
      var moved = 0;
      this._allRawKeys().forEach(function (k) {
        if (!k || k.indexOf(from) !== 0) return;
        var target = PREFIX + 'u:' + toUid + ':' + k.slice(from.length);
        if (self._read(target, undefined) === undefined) { self._write(target, self._read(k, null)); moved++; }
        if (self.available) { try { window.localStorage.removeItem(k); } catch (e) {} } else { delete self._mem[k]; }
      });
      return moved;
    },

    _allRawKeys: function () {
      if (!this.available) return Object.keys(this._mem);
      var out = [];
      try {
        for (var i = 0; i < window.localStorage.length; i++) out.push(window.localStorage.key(i));
      } catch (e) {}
      return out;
    },

    // One-time copies of older brands' data to the PlayMona prefix.
    // PlayMora first: its data already includes anything copied from Family Fun.
    _migrateBrand: function () {
      if (!this.available) return;
      this._copyPrefix(PLAYMORA_PREFIX, 'migratedFromPlayMora');
      this._copyPrefix(LEGACY_PREFIX, 'migratedFromFamilyFun');
    },

    _copyPrefix: function (from, flag) {
      if (this._read(PREFIX + flag, false)) return;
      this._allRawKeys().forEach(function (k) {
        if (k && k.indexOf(from) === 0) {
          var key = k.slice(from.length);
          try {
            if (window.localStorage.getItem(PREFIX + key) == null) {
              window.localStorage.setItem(PREFIX + key, window.localStorage.getItem(k));
            }
          } catch (e) {}
        }
      });
      this._write(PREFIX + flag, true);
    },

    // Remove this account's data from the device (or everything when no account).
    clear: function () {
      var pre = this._uid ? PREFIX + 'u:' + this._uid + ':' : PREFIX;
      if (!this.available) {
        var mem = this._mem;
        Object.keys(mem).forEach(function (k) { if (k.indexOf(pre) === 0) delete mem[k]; });
        return;
      }
      try {
        var keys = [];
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k && k.indexOf(pre) === 0) keys.push(k);
        }
        keys.forEach(function (k) { window.localStorage.removeItem(k); });
      } catch (e) {}
    }
  };
})();
