/* ============================================================
   FAMILY FUN — net/transport.js
   The storage interface every network backend implements, plus
   the development adapter (BroadcastChannel + localStorage) so
   the whole multiplayer flow can be built and tested across two
   browser tabs with no Firebase account and no internet.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function splitPath(path) {
    return String(path || '').split('/').filter(function (s) { return s.length; });
  }

  /* Walk a nested object by path segments. */
  function dig(obj, parts) {
    var node = obj;
    for (var i = 0; i < parts.length; i++) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  /* Set a nested value by path segments, creating objects on the way. */
  function plant(obj, parts, value) {
    if (!parts.length) return value;
    var node = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    if (value === null) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = value;
    return obj;
  }

  function clone(v) {
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }

  /* A bus backed by localStorage + BroadcastChannel, shared by
     every tab of the same origin. Swappable for tests. */
  function browserBus(namespace) {
    var KEY = 'ff-dev-bus:' + (namespace || 'default');
    var channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(KEY) : null;
    var listeners = [];

    function fire(k) {
      listeners.slice().forEach(function (fn) { fn(k); });
    }

    if (channel) channel.onmessage = function (ev) { fire(ev && ev.data); };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('storage', function (ev) { if (ev.key === KEY) fire(null); });
    }

    return {
      read: function (k) {
        try {
          var all = JSON.parse(window.localStorage.getItem(KEY) || '{}');
          return all[k] === undefined ? null : all[k];
        } catch (e) { return null; }
      },
      write: function (k, v) {
        try {
          var all = JSON.parse(window.localStorage.getItem(KEY) || '{}');
          if (v === null) delete all[k]; else all[k] = v;
          window.localStorage.setItem(KEY, JSON.stringify(all));
        } catch (e) { /* storage full or blocked */ }
        if (channel) channel.postMessage(k);
        fire(k);
      },
      subscribe: function (fn) {
        listeners.push(fn);
        return function () {
          var i = listeners.indexOf(fn);
          if (i !== -1) listeners.splice(i, 1);
        };
      }
    };
  }

  /* Development transport. Same interface as the Firebase one.
     The whole room lives under a single bus key as one document,
     which keeps reads and writes trivially consistent. */
  function dev(opts) {
    opts = opts || {};
    var bus = opts.bus || browserBus(opts.namespace);
    var root = opts.root || 'rooms/DEV';
    var uid = null;
    var disconnects = [];
    var unsubs = [];
    var closed = false;

    function readRoom() {
      var doc = bus.read(root);
      return (doc && typeof doc === 'object') ? doc : {};
    }

    function writeRoom(doc) {
      bus.write(root, doc);
    }

    function readPath(path) {
      var parts = splitPath(path);
      if (!parts.length) return clone(readRoom());
      return clone(dig(readRoom(), parts));
    }

    function writePath(path, value) {
      var parts = splitPath(path);
      var doc = readRoom();
      if (!parts.length) { writeRoom(value == null ? {} : value); return; }
      plant(doc, parts, value);
      writeRoom(doc);
    }

    var api = {
      connect: function () {
        uid = 'dev-' + FF.util.uid() + FF.util.uid();
        return Promise.resolve({ uid: uid });
      },

      uid: function () { return uid; },

      serverNow: function () { return Date.now(); },

      get: function (path) { return Promise.resolve(readPath(path)); },

      set: function (path, value) {
        writePath(path, value);
        return Promise.resolve();
      },

      update: function (path, obj) {
        var current = readPath(path);
        var merged = (current && typeof current === 'object') ? current : {};
        Object.keys(obj || {}).forEach(function (k) { merged[k] = obj[k]; });
        writePath(path, merged);
        return Promise.resolve();
      },

      /* Synchronous read-modify-write. Single-threaded JavaScript makes
         this genuinely atomic within a tab; across tabs the localStorage
         write is last-write-wins, which is why the Firebase transport's
         real transaction is what ships. Good enough for development. */
      transaction: function (path, fn) {
        var current = readPath(path);
        var next = fn(current);
        if (next === undefined) {
          return Promise.resolve({ committed: false, value: current });
        }
        writePath(path, next);
        return Promise.resolve({ committed: true, value: next });
      },

      watch: function (path, cb) {
        var last = JSON.stringify(readPath(path));
        var off = bus.subscribe(function () {
          var value = readPath(path);
          var snapshot = JSON.stringify(value);
          if (snapshot === last) return;
          last = snapshot;
          cb(value);
        });
        unsubs.push(off);
        return function () {
          off();
          var i = unsubs.indexOf(off);
          if (i !== -1) unsubs.splice(i, 1);
        };
      },

      onDisconnectSet: function (path, value) {
        disconnects.push({ path: path, value: value });
        return Promise.resolve();
      },

      close: function () {
        if (closed) return;
        closed = true;
        disconnects.forEach(function (d) { writePath(d.path, d.value); });
        disconnects = [];
        unsubs.slice().forEach(function (off) { off(); });
        unsubs = [];
      }
    };

    return api;
  }

  FF.Transport = {
    dev: dev,
    browserBus: browserBus,
    roomPath: function (code, sub) {
      return 'rooms/' + code + (sub ? '/' + sub : '');
    }
  };
})();
