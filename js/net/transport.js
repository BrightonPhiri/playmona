/* ============================================================
   PLAYMONA — net/transport.js
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

  /* How deep a document is split into separate keys. Anything deeper stays
     whole in one key, so a reader in another tab never sees half of it.
     rounds/<n>/answers/<uid> is the deepest record the room writes in one
     go: split into fields, another tab could see an answer's choice before
     its "correct" flag and end the round as if nobody got it right. */
  var SPLIT_DEPTH = 4;

  /* A document as { 'a/b/c': value }, split down to SPLIT_DEPTH. Arrays
     are kept whole; empty objects vanish, as they do in Firebase. */
  function flatten(value, prefix, out, depth) {
    out = out || {};
    depth = depth || 0;
    var isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
    if (isObject && !Object.keys(value).length) return out;
    if (isObject && depth < SPLIT_DEPTH) {
      Object.keys(value).forEach(function (k) {
        flatten(value[k], prefix ? prefix + '/' + k : k, out, depth + 1);
      });
    } else if (value !== null && value !== undefined) {
      out[prefix] = value;
    }
    return out;
  }

  /* A bus backed by localStorage + BroadcastChannel, shared by
     every tab of the same origin. Swappable for tests.

     Each part of a document is its own localStorage key (see SPLIT_DEPTH),
     and a write touches only the keys it changes. Tabs see each other's localStorage writes a moment
     late (Chromium syncs them between processes asynchronously), so when
     a document was one key, a tab writing from a slightly old copy erased
     whatever another tab had just written: a presence heartbeat could wipe
     a round's winner. Now a write can only change what the writer changed.
     storage: optional, for tests; defaults to window.localStorage. */
  function browserBus(namespace, storage) {
    var KEY = 'ff-dev-bus:' + (namespace || 'default');
    var channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(KEY) : null;
    var listeners = [];

    function store() { return storage || window.localStorage; }
    function prefixOf(k) { return KEY + '|' + k + '|'; }

    // { 'a/b': value } for document k, as this tab sees it.
    function leaves(k) {
      var s = store();
      var prefix = prefixOf(k);
      var out = {};
      for (var i = 0; i < s.length; i++) {
        var name = s.key(i);
        if (!name || name.indexOf(prefix) !== 0) continue;
        try { out[name.slice(prefix.length)] = JSON.parse(s.getItem(name)); } catch (e) { /* skip a bad entry */ }
      }
      return out;
    }

    function fire(k) {
      listeners.slice().forEach(function (fn) { fn(k); });
    }

    if (channel) channel.onmessage = function (ev) { fire(ev && ev.data); };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('storage', function (ev) {
        if (ev.key && ev.key.indexOf(KEY + '|') === 0) fire(null);
      });
    }

    return {
      read: function (k) {
        try {
          var flat = leaves(k);
          var paths = Object.keys(flat);
          if (!paths.length) return null;
          if (paths.length === 1 && paths[0] === '') return flat[''];
          var doc = {};
          paths.forEach(function (p) { plant(doc, splitPath(p), flat[p]); });
          return doc;
        } catch (e) { return null; }
      },
      write: function (k, v) {
        var changed = false;
        try {
          var s = store();
          var prefix = prefixOf(k);
          var before = leaves(k);
          var after = flatten(v, '', {});
          Object.keys(after).forEach(function (p) {
            var json = JSON.stringify(after[p]);
            if (Object.prototype.hasOwnProperty.call(before, p) && JSON.stringify(before[p]) === json) return;
            s.setItem(prefix + p, json);
            changed = true;
          });
          // Only what this tab saw and dropped is removed. A value another
          // tab added that has not reached this tab yet is not in `before`,
          // so it survives.
          Object.keys(before).forEach(function (p) {
            if (Object.prototype.hasOwnProperty.call(after, p)) return;
            s.removeItem(prefix + p);
            changed = true;
          });
        } catch (e) { /* storage full or blocked */ }
        if (!changed) return;
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
     It reads and writes the room as one document; the browser bus stores
     each value separately, so a write only changes what it changed. */
  function dev(opts) {
    opts = opts || {};
    var bus = opts.bus || browserBus(opts.namespace);
    // '' is the database root (used by watching); only a missing root gets the default.
    var root = opts.root != null ? opts.root : 'rooms/DEV';
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
        // Like Firebase, a null in an update removes that child, and a key with
        // slashes ('players/u1') changes only that deeper child.
        Object.keys(obj || {}).forEach(function (k) {
          if (k.indexOf('/') !== -1) plant(merged, splitPath(k), obj[k] === undefined ? null : obj[k]);
          else if (obj[k] === null) delete merged[k];
          else merged[k] = obj[k];
        });
        writePath(path, merged);
        return Promise.resolve();
      },

      /* Synchronous read-modify-write. Single-threaded JavaScript makes
         this genuinely atomic within a tab; across tabs two writes to the
         SAME value at the same moment are last-write-wins, which is why the
         Firebase transport's real transaction is what ships. Good enough
         for development. */
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

        // Firebase's on('value') fires immediately with the current value.
        // Match that here, or a caller that subscribes after writing will
        // never see its own write and will sit on a stale snapshot.
        Promise.resolve().then(function () {
          if (!closed) cb(readPath(path));
        });

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

      onDisconnectCancel: function (path) {
        disconnects = disconnects.filter(function (d) { return d.path !== path; });
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
    },

    /* A transport for any part of the database: the development one in dev
       rooms mode (or when asked), otherwise Firebase. root '' is the top. */
    open: function (root, useDev) {
      if (useDev || (FF.Net && FF.Net.devMode && FF.Net.devMode())) {
        return Promise.resolve(FF.Transport.dev({ root: root, namespace: 'familyfun' }));
      }
      if (!FF.Net || !FF.Net.configured || !FF.Net.configured()) {
        return Promise.reject(new Error('Online play is not configured on this copy of the app.'));
      }
      return FF.Net.firebase({ root: root });
    }
  };
})();
