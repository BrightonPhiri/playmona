/* ============================================================
   PLAYMONA — admin/data.js
   Reads and writes for the admin portal.

   - Live site: the Firebase database, as the signed-in admin.
     The database rules decide what an admin may do; this file
     only asks.
   - Device-only accounts (development, file://): this browser's
     own test tree (the same one the app writes its counters to),
     and the person signed in counts as an admin.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var mode = null;   // 'firebase' | 'local'
  var db = null;
  var uid = null;

  function local() { return FF.Cloud._local; }

  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }

  function rowsOf(obj) {
    return Object.keys(obj || {}).map(function (k) { return Object.assign({ key: k }, obj[k]); });
  }

  // The signed-in Firebase user, waiting for Firebase to restore it after a reload.
  function firebaseUser(firebase) {
    var auth = firebase.auth();
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return new Promise(function (resolve) {
      var off = auth.onAuthStateChanged(function (u) { off(); resolve(u); });
    });
  }

  FF.AdminData = {
    mode: function () { return mode; },
    uid: function () { return uid; },

    /* Connect and check the admin flag. Resolves 'ok', 'signed-out' or 'not-admin'. */
    connect: function () {
      var s = FF.Auth.user();
      if (!s || s.needsProfile || FF.Auth.isGuest()) return Promise.resolve('signed-out');
      if (FF.Auth.isLocal()) {
        mode = 'local';
        uid = s.uid;
        return Promise.resolve('ok');
      }
      mode = 'firebase';
      return FF.Net.ensureFirebase().then(function (firebase) {
        return firebaseUser(firebase).then(function (u) {
          if (!u || u.isAnonymous) return 'signed-out';
          uid = u.uid;
          db = firebase.database();
          return db.ref('admins/' + u.uid).once('value').then(function (snap) {
            return snap.val() === true ? 'ok' : 'not-admin';
          }, function () { return 'not-admin'; });
        });
      });
    },

    get: function (path) {
      if (mode === 'local') return local().get(path);
      return db.ref(path).once('value').then(function (s) { return s.val(); });
    },

    set: function (path, val) {
      if (mode === 'local') return local().set(path, val);
      return db.ref(path).set(val);
    },

    /* stats/days from a UTC day key (YYYY-MM-DD) onwards. */
    daysFrom: function (fromKey) {
      if (mode === 'local') {
        return local().get('stats/days').then(function (all) {
          var out = {};
          Object.keys(all || {}).forEach(function (k) { if (k >= fromKey) out[k] = all[k]; });
          return out;
        });
      }
      return db.ref('stats/days').orderByKey().startAt(fromKey).once('value').then(function (s) { return s.val() || {}; });
    },

    /* Index entries ordered by a field, highest first (lastSeen, createdAt, plays). */
    usersBy: function (field, n) {
      n = n || 50;
      if (mode === 'local') {
        return local().get('userIndex').then(function (all) {
          return rowsOf(all).sort(function (a, b) { return (b[field] || 0) - (a[field] || 0); }).slice(0, n);
        });
      }
      return db.ref('userIndex').orderByChild(field).limitToLast(n).once('value').then(function (snap) {
        var rows = [];
        snap.forEach(function (c) { rows.push(Object.assign({ key: c.key }, c.val())); });
        return rows.reverse();
      });
    },

    /* Usernames that start with the text typed. */
    searchUsers: function (text) {
      var q = String(text || '').toLowerCase().replace(/^@/, '').trim();
      if (!q) return Promise.resolve([]);
      if (mode === 'local') {
        return local().get('userIndex').then(function (all) {
          return rowsOf(all).filter(function (r) {
            return String(r.username || '').toLowerCase().indexOf(q) === 0 ||
              String(r.displayName || '').toLowerCase().indexOf(q) !== -1;
          }).slice(0, 50);
        });
      }
      return db.ref('userIndex').orderByChild('username').startAt(q).endAt(q + '').limitToFirst(50).once('value').then(function (snap) {
        var rows = [];
        snap.forEach(function (c) { rows.push(Object.assign({ key: c.key }, c.val())); });
        return rows;
      });
    },

    bans: function () { return this.get('bans').then(function (v) { return v || {}; }); },
    ban: function (who, reason) {
      return this.set('bans/' + who, { t: Date.now(), by: uid, reason: String(reason || '').slice(0, 200) });
    },
    unban: function (who) { return this.set('bans/' + who, null); },

    config: function () { return this.get('config').then(function (v) { return clone(v) || {}; }); },
    saveGame: function (id, settings) {
      var clean = {};
      ['enabled', 'guest', 'tier', 'freePlays', 'badge'].forEach(function (k) {
        if (settings[k] != null && settings[k] !== '') clean[k] = settings[k];
      });
      return this.set('config/games/' + id, clean);
    },
    saveSite: function (site) { return this.set('config/site', site); },

    rooms: function () { return this.get('rooms').then(function (v) { return v || {}; }); }
  };
})();
