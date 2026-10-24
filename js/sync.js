/* ============================================================
   PLAYMONA — sync.js
   Keeps account data the same on every device the player signs in on.

   Local first: every change is saved on the device immediately (so
   play works offline) and pushed to /users/{uid}/data when online.
   On sign-in the newer copy of each item wins (last write wins).

   Never synced: photos (they stay on the device that took them) and
   device settings such as theme and language.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var SYNC_KEYS = [
    'players', 'teams', 'favorites', 'recents', 'stats',
    'difficulty', 'length', 'timer', 'sound', 'music', 'volume', 'animations',
    'randomOrder', 'randomQuestions', 'displaySeconds', 'autoAdvanceMs',
    'dailyLog', 'challenges', 'savedRooms', 'hidePhotoPublic'
  ];
  var PUSH_DELAY = 1500;

  var state = { uid: null, db: null, dirty: {}, timer: null, off: null, onlineHandler: null };

  function meta() { return FF.Storage.get('syncMeta', {}) || {}; }
  function saveMeta(m) { FF.Storage.set('syncMeta', m, { silent: true }); }

  // Photos are data URLs: keep them on this device only.
  function outgoing(key, value) {
    if (key === 'players' && Array.isArray(value)) {
      return value.map(function (p) { var c = Object.assign({}, p); delete c.photo; return c; });
    }
    if (key === 'teams' && value && Array.isArray(value.teams)) {
      return Object.assign({}, value, { teams: value.teams.map(function (tm) { var c = Object.assign({}, tm); delete c.photo; return c; }) });
    }
    return value;
  }

  // Keep this device's photos when another device's roster arrives.
  function incoming(key, value) {
    if (key === 'players' && Array.isArray(value)) {
      var local = FF.Storage.get('players', []) || [];
      var photos = {};
      local.forEach(function (p) { if (p && p.photo) photos[p.id] = p.photo; });
      return value.map(function (p) { return photos[p.id] ? Object.assign({}, p, { photo: photos[p.id] }) : p; });
    }
    return value;
  }

  function ref(key) { return state.db.ref('users/' + state.uid + '/data' + (key ? '/' + key : '')); }

  function push() {
    state.timer = null;
    if (!state.db || !state.uid || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    var keys = Object.keys(state.dirty);
    if (!keys.length) return;
    var m = meta();
    var update = {};
    keys.forEach(function (key) {
      update[key] = { v: JSON.stringify(outgoing(key, FF.Storage.get(key, null))), t: m[key] || Date.now() };
    });
    state.dirty = {};
    ref().update(update).catch(function () {
      keys.forEach(function (k) { state.dirty[k] = true; });   // retry later
    });
  }

  function schedule(key) {
    if (SYNC_KEYS.indexOf(key) === -1) return;
    var m = meta();
    m[key] = Date.now();
    saveMeta(m);
    state.dirty[key] = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(push, PUSH_DELAY);
  }

  FF.Sync = {
    KEYS: SYNC_KEYS,

    start: function (uid, firebase) {
      if (state.uid === uid && state.db) return Promise.resolve();
      this.stop();
      state.uid = uid;
      state.db = firebase.database();
      state.off = FF.Storage.onChange(function (key, val, scopeUid) {
        if (scopeUid === state.uid) schedule(key);
      });
      state.onlineHandler = function () { push(); };
      window.addEventListener('online', state.onlineHandler);
      return this.pull();
    },

    // Merge the server copy with this device's copy, newest item wins.
    pull: function () {
      if (!state.db) return Promise.resolve();
      var uid = state.uid;
      return ref().once('value').then(function (snap) {
        if (uid !== state.uid) return;
        var remote = snap.val() || {};
        var m = meta();
        var changed = false;
        SYNC_KEYS.forEach(function (key) {
          var r = remote[key];
          var localT = m[key] || 0;
          var hasLocal = FF.Storage.get(key, undefined) !== undefined;
          if (r && r.t > localT) {
            try {
              FF.Storage.set(key, incoming(key, JSON.parse(r.v)), { silent: true });
              m[key] = r.t;
              changed = true;
            } catch (e) { /* ignore a damaged item */ }
          } else if (hasLocal && (!r || localT > r.t)) {
            if (!m[key]) m[key] = Date.now();
            state.dirty[key] = true;
          }
        });
        saveMeta(m);
        push();
        if (changed && FF.App && FF.App.onSynced) FF.App.onSynced();
      }).catch(function () { /* offline: try again next sign-in */ });
    },

    flush: function () { if (state.timer) { clearTimeout(state.timer); } push(); },

    stop: function () {
      if (state.timer) { clearTimeout(state.timer); push(); }
      if (state.off) state.off();
      if (state.onlineHandler) window.removeEventListener('online', state.onlineHandler);
      state = { uid: null, db: null, dirty: {}, timer: null, off: null, onlineHandler: null };
    }
  };
})();
