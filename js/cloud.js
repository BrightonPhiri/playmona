/* ============================================================
   PLAYMONA — cloud.js
   Small shared-data layer for leaderboards and challenges.

   - Firebase accounts: the Realtime Database.
   - Device-only accounts (development, file://): a tree kept in
     this browser, so the same screens work and can be tested
     without touching the live project.
   - Guests have no cloud: mode() is null.

   Every call returns a Promise and gives up after 8 seconds, so an
   offline device gets an answer instead of waiting forever.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var TIMEOUT = 8000;

  function timeout(p) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        var e = new Error(FF.t ? FF.t('cloudOffline', 'Could not reach PlayMona. Check your connection.') : 'Offline');
        e.code = 'cloud/timeout';
        reject(e);
      }, TIMEOUT);
      p.then(function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
        function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    });
  }

  function parts(path) { return String(path).split('/').filter(Boolean); }

  /* ---------- On-device tree (device-only accounts) ---------- */
  var Local = {
    _read: function () { return FF.Storage.get('devCloud', {}) || {}; },
    _write: function (tree) { FF.Storage.set('devCloud', tree); },
    get: function (path) {
      var node = this._read();
      var p = parts(path);
      for (var i = 0; i < p.length; i++) {
        if (node == null || typeof node !== 'object') return Promise.resolve(null);
        node = node[p[i]];
      }
      return Promise.resolve(node === undefined ? null : JSON.parse(JSON.stringify(node)));
    },
    set: function (path, val) {
      var tree = this._read();
      var p = parts(path);
      var node = tree;
      for (var i = 0; i < p.length - 1; i++) {
        if (!node[p[i]] || typeof node[p[i]] !== 'object') node[p[i]] = {};
        node = node[p[i]];
      }
      if (val === null || val === undefined) delete node[p[p.length - 1]];
      else node[p[p.length - 1]] = JSON.parse(JSON.stringify(val));
      this._write(tree);
      return Promise.resolve();
    },
    transaction: function (path, fn) {
      var self = this;
      return this.get(path).then(function (cur) {
        var next = fn(cur);
        if (next === undefined) return { committed: false, value: cur };
        return self.set(path, next).then(function () { return { committed: true, value: next }; });
      });
    },
    top: function (path, child, n) {
      return this.get(path).then(function (obj) {
        var rows = Object.keys(obj || {}).map(function (k) { return Object.assign({ key: k }, obj[k]); });
        rows.sort(function (a, b) { return (b[child] || 0) - (a[child] || 0); });
        return rows.slice(0, n);
      });
    }
  };

  /* ---------- Firebase ---------- */
  var Remote = {
    _db: function () {
      return FF.Net.ensureFirebase().then(function (firebase) {
        var auth = firebase.auth();
        if (auth.currentUser && !auth.currentUser.isAnonymous) return firebase.database();
        // Right after a reload Firebase restores the user a moment later.
        return new Promise(function (resolve, reject) {
          var off = auth.onAuthStateChanged(function (u) {
            off();
            if (u && !u.isAnonymous) resolve(firebase.database());
            else reject(Object.assign(new Error('Not signed in'), { code: 'cloud/no-user' }));
          });
        });
      });
    },
    get: function (path) {
      return this._db().then(function (db) { return db.ref(path).once('value'); }).then(function (s) { return s.val(); });
    },
    set: function (path, val) {
      return this._db().then(function (db) { return db.ref(path).set(val); });
    },
    transaction: function (path, fn) {
      return this._db().then(function (db) { return db.ref(path).transaction(fn); }).then(function (r) {
        return { committed: r.committed, value: r.snapshot && r.snapshot.val() };
      });
    },
    top: function (path, child, n) {
      return this._db().then(function (db) {
        return db.ref(path).orderByChild(child).limitToLast(n).once('value');
      }).then(function (snap) {
        var rows = [];
        snap.forEach(function (c) { rows.push(Object.assign({ key: c.key }, c.val())); });
        return rows.reverse();
      });
    }
  };

  FF.Cloud = {
    // 'firebase' | 'local' | null (guests and signed-out users have no cloud).
    mode: function () {
      if (!FF.Auth || !FF.Auth.signedIn() || FF.Auth.isGuest() || FF.Auth.needsProfile()) return null;
      return FF.Auth.isLocal() ? 'local' : 'firebase';
    },
    available: function () { return !!this.mode(); },
    _backend: function () {
      var m = this.mode();
      if (!m) return null;
      return m === 'local' ? Local : Remote;
    },
    _call: function (name, args) {
      var b = this._backend();
      if (!b) return Promise.reject(Object.assign(new Error('No account'), { code: 'cloud/no-account' }));
      return timeout(b[name].apply(b, args));
    },
    get: function (path) { return this._call('get', [path]); },
    set: function (path, val) { return this._call('set', [path, val]); },
    transaction: function (path, fn) { return this._call('transaction', [path, fn]); },
    // Rows under path, highest `child` first.
    top: function (path, child, n) { return this._call('top', [path, child, n || 50]); }
  };
})();
