/* ============================================================
   PLAYMONA — net/firebaseTransport.js
   Firebase Realtime Database transport. Implements exactly the
   interface in net/transport.js. The SDK is loaded lazily from
   the CDN the first time online play is opened, so the offline
   app never touches the network.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var SDK_VERSION = '10.12.2';
  var SDK_BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
  var SDK_FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js'];

  var sdkPromise = null;
  var app = null;
  var serverOffset = 0;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not reach Firebase. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }

  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = SDK_FILES.reduce(function (chain, file) {
      return chain.then(function () { return loadScript(SDK_BASE + file); });
    }, Promise.resolve()).then(function () {
      if (!window.firebase) throw new Error('Firebase SDK did not initialise.');
      return window.firebase;
    }).catch(function (e) {
      sdkPromise = null;          // allow a retry on the next attempt
      throw e;
    });
    return sdkPromise;
  }

  // Load the SDK and create the app once; shared by accounts and rooms.
  function ensureFirebase() {
    return loadSdk().then(function (firebase) {
      if (!app) app = firebase.initializeApp(FF.FirebaseConfig);
      return firebase;
    });
  }

  /* Local development only: with this flag set, online play runs on the
     BroadcastChannel transport across tabs of this browser, with no
     Firebase account and no internet. Turn it on from the console with
       FF.Storage.set('devRooms', true)
     It is opt-in and per-browser, so it never affects real users. */
  function devMode() {
    return !!(FF.Storage && FF.Storage.get('devRooms', false));
  }

  /* The gate for the whole online feature. False here means the
     PLAY TOGETHER button never renders and no network call is made. */
  function configured() {
    if (devMode()) return true;
    var c = FF.FirebaseConfig;
    return !!(c && c.apiKey && c.databaseURL && String(c.apiKey).indexOf('AIza') === 0);
  }

  /* The account to use for rooms and watching. Right after a page loads,
     Firebase restores a signed-in player a moment later, so wait for that
     first; only someone really signed out gets a quiet anonymous sign-in.
     If the project has anonymous sign-in switched off, the error says so. */
  function signInForRoom(auth) {
    var ready = auth.currentUser ? Promise.resolve(auth.currentUser) : new Promise(function (resolve) {
      var done = false;
      var off = auth.onAuthStateChanged(function (u) {
        if (done) return;
        done = true;
        if (typeof off === 'function') off();
        resolve(u || null);
      });
      // Never wait forever for a restore that does not come.
      setTimeout(function () { if (!done) { done = true; resolve(auth.currentUser || null); } }, 4000);
    });
    return ready.then(function (user) {
      if (user) return user;
      return auth.signInAnonymously().then(function (cred) { return cred.user; }, function (e) {
        var code = e && e.code;
        if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
          throw Object.assign(new Error('Watching without an account is not switched on yet.'), { code: 'anon-disabled' });
        }
        throw e;
      });
    });
  }

  function firebaseTransport(opts) {
    opts = opts || {};
    // '' is the database root (used by watching); only a missing root gets the default.
    var root = opts.root != null ? opts.root : 'rooms/UNKNOWN';

    if (!configured()) {
      return Promise.reject(new Error('Online play is not configured on this copy of the app.'));
    }

    return ensureFirebase().then(function (firebase) {
      // Signed-in players use their account; otherwise an anonymous session.
      return signInForRoom(firebase.auth()).then(function (user) {
        var db = firebase.database();
        var uid = user.uid;

        // Align to server time so round timers agree across devices.
        db.ref('.info/serverTimeOffset').on('value', function (snap) {
          serverOffset = snap.val() || 0;
        });

        function ref(path) {
          if (!root) return db.ref(path || '/');
          return db.ref(root + (path ? '/' + path : ''));
        }

        return {
          connect: function () { return Promise.resolve({ uid: uid }); },
          uid: function () { return uid; },
          serverNow: function () { return Date.now() + serverOffset; },

          get: function (path) {
            return ref(path).once('value').then(function (s) { return s.val(); });
          },

          set: function (path, value) { return ref(path).set(value); },

          update: function (path, obj) { return ref(path).update(obj); },

          transaction: function (path, fn) {
            return ref(path).transaction(function (current) {
              var next = fn(current);
              return next === undefined ? undefined : next;
            }).then(function (res) {
              return { committed: res.committed, value: res.snapshot ? res.snapshot.val() : null };
            });
          },

          watch: function (path, cb) {
            var r = ref(path);
            var handler = r.on('value', function (snap) { cb(snap.val()); });
            return function () { r.off('value', handler); };
          },

          watchConnection: function (cb) {
            var r = db.ref('.info/connected');
            var handler = r.on('value', function (snap) { cb(snap.val() === true); });
            return function () { r.off('value', handler); };
          },

          onDisconnectSet: function (path, value) {
            return ref(path).onDisconnect().set(value);
          },

          onDisconnectCancel: function (path) {
            return ref(path).onDisconnect().cancel();
          },

          serverTimestamp: function () {
            return window.firebase.database.ServerValue.TIMESTAMP;
          },

          close: function () { /* Firebase tears down with the page */ }
        };
      });
    });
  }

  FF.Net = FF.Net || {};
  FF.Net.configured = configured;
  FF.Net.devMode = devMode;
  FF.Net.firebase = firebaseTransport;
  FF.Net.ensureFirebase = ensureFirebase;
  FF.Net.signInForRoom = signInForRoom;
  FF.Net.sdkConfigured = function () {
    var c = FF.FirebaseConfig;
    return !!(c && c.apiKey && c.databaseURL && String(c.apiKey).indexOf('AIza') === 0);
  };
  FF.Net.SDK_VERSION = SDK_VERSION;
})();
