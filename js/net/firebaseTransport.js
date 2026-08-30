/* ============================================================
   FAMILY FUN — net/firebaseTransport.js
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

  function firebaseTransport(opts) {
    opts = opts || {};
    var root = opts.root || 'rooms/UNKNOWN';

    if (!configured()) {
      return Promise.reject(new Error('Online play is not configured on this copy of the app.'));
    }

    return loadSdk().then(function (firebase) {
      if (!app) app = firebase.initializeApp(FF.FirebaseConfig);
      return firebase.auth().signInAnonymously().then(function (cred) {
        var db = firebase.database();
        var uid = cred.user.uid;

        // Align to server time so round timers agree across devices.
        db.ref('.info/serverTimeOffset').on('value', function (snap) {
          serverOffset = snap.val() || 0;
        });

        function ref(path) {
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
  FF.Net.SDK_VERSION = SDK_VERSION;
})();
