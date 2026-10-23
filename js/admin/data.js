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

    /* List entries ordered by a field, highest first (lastSeen, createdAt, plays).
       root: 'userIndex' (accounts) or 'guestIndex' (guests). */
    usersBy: function (field, n, root) {
      n = n || 50;
      root = root || 'userIndex';
      if (mode === 'local') {
        return local().get(root).then(function (all) {
          return rowsOf(all).sort(function (a, b) { return (b[field] || 0) - (a[field] || 0); }).slice(0, n);
        });
      }
      return db.ref(root).orderByChild(field).limitToLast(n).once('value').then(function (snap) {
        var rows = [];
        snap.forEach(function (c) { rows.push(Object.assign({ key: c.key }, c.val())); });
        return rows.reverse();
      });
    },

    /* Guests whose name contains the text typed (Guest012, or a name they chose). */
    searchGuests: function (text) {
      var q = String(text || '').toLowerCase().trim();
      return this.get('guestIndex').then(function (all) {
        return rowsOf(all).filter(function (r) { return String(r.name || '').toLowerCase().indexOf(q) !== -1; })
          .sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); }).slice(0, 50);
      });
    },

    /* Every account, from the username list (each account has one).
       Resolves [{ uid, username }]. */
    accounts: function () {
      if (mode === 'local') {
        var all = FF.Storage.get('devAccounts', {}) || {};
        return Promise.resolve(Object.keys(all).map(function (k) { return { uid: all[k].uid, username: all[k].username, profile: all[k] }; }));
      }
      return this.get('usernames').then(function (names) {
        return Object.keys(names || {}).map(function (n) { return { uid: names[n].uid, username: n }; })
          .filter(function (a) { return !!a.uid; });
      });
    },

    /* Accounts made before the player list existed get an entry from their
       profile, marked as not seen since. Resolves the number of accounts. */
    fillPlayerList: function () {
      var self = this;
      return Promise.all([this.accounts(), this.get('userIndex')]).then(function (res) {
        var accounts = res[0], index = res[1] || {};
        var missing = accounts.filter(function (a) { return !index[a.uid]; }).slice(0, 200);
        return Promise.all(missing.map(function (a) {
          var profile = a.profile ? Promise.resolve(a.profile) : self.get('users/' + a.uid + '/profile');
          return profile.then(function (p) {
            p = p || {};
            var entry = {
              displayName: String(p.displayName || a.username || 'Player').slice(0, 40),
              username: String(p.username || a.username || '').slice(0, 20),
              createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
              lastSeen: 0,
              plays: 0
            };
            if (p.avatar) entry.avatar = String(p.avatar).slice(0, 60);
            return self.set('userIndex/' + a.uid, entry);
          }).catch(function () {});
        })).then(function () { return accounts.length; });
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
