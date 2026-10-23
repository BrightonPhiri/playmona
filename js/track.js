/* ============================================================
   PLAYMONA — track.js
   Usage counters for the admin portal. Counts only, no personal
   details: games played per day, sign-ups, installs, rooms, and
   who was active today (by account id, so a person counts once).

   Days are UTC dates (YYYY-MM-DD), like the daily challenge.
   Everything here is fire-and-forget: a failed write never gets
   in the way of playing.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var COUNTERS = ['plays', 'onlinePlays', 'guestPlays', 'signups', 'installs', 'rooms'];

  function day(d) { return (d || new Date()).toISOString().slice(0, 10); }
  function plusOne(n) { return (typeof n === 'number' ? n : 0) + 1; }
  // +1 on the server: players cannot read the stats, so a read-then-write would be refused.
  function bump(w, path) { return w.increment(path); }
  // +1 on the player's own entry, only once that entry exists (see seen()).
  function bumpOwn(w, path) { return w.transaction(path, function (n) { return n == null ? undefined : plusOne(n); }); }

  // "Guest001": the name a guest has until they choose one.
  function guestName(n) { return 'Guest' + (n < 1000 ? ('00' + n).slice(-3) : String(n)); }

  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function isGuest() { return !!(FF.Auth && FF.Auth.isGuest && FF.Auth.isGuest()); }

  // Paths a counter event writes to: today's count and the all-time total.
  function counterPaths(name) {
    return ['stats/days/' + day() + '/' + name, 'stats/totals/' + name];
  }

  FF.Track = {
    COUNTERS: COUNTERS,
    day: day,
    counterPaths: counterPaths,

    /* Add one to a named counter (see COUNTERS). */
    count: function (name) {
      if (COUNTERS.indexOf(name) === -1 || !FF.Cloud || !FF.Cloud.track) return Promise.resolve(false);
      return FF.Cloud.track(function (w) {
        return Promise.all(counterPaths(name).map(function (p) { return bump(w, p); }));
      });
    },

    /* A game started. Online games also count separately. */
    play: function (gameId, online) {
      if (!gameId || !FF.Cloud || !FF.Cloud.track) return Promise.resolve(false);
      var guest = isGuest();
      return FF.Cloud.track(function (w, uid) {
        var d = 'stats/days/' + day();
        var jobs = [bump(w, d + '/games/' + gameId)];
        countersForPlay(online, guest).forEach(function (name) {
          counterPaths(name).forEach(function (p) { jobs.push(bump(w, p)); });
        });
        if (online) jobs.push(bump(w, d + '/onlineGames/' + gameId));
        if (uid) jobs.push(bumpOwn(w, (guest ? 'guestIndex/' : 'userIndex/') + uid + '/plays'));
        return Promise.all(jobs);
      });
    },

    guestName: guestName,

    /* A guest's number (Guest001, Guest002, …), given once per device. */
    guestNumber: function (w) {
      var n = FF.Storage.get('guestNumber', null);
      if (typeof n === 'number') return Promise.resolve(n);
      return w.transaction('stats/guestSeq', plusOne).then(function (r) {
        if (!r || !r.committed || typeof r.value !== 'number') return null;
        FF.Storage.set('guestNumber', r.value);
        return r.value;
      });
    },

    /* Mark this account (or guest) active today and refresh its entry in the
       admin portal's player list. At most once per day per device. */
    seen: function () {
      var s = FF.Auth && FF.Auth.user && FF.Auth.user();
      if (!s || s.needsProfile || !FF.Cloud || !FF.Cloud.track) return Promise.resolve(false);
      var today = day();
      var mark = s.uid + '|' + today;
      if (FF.Storage.get('trackSeen', null) === mark) return Promise.resolve(false);
      var guest = isGuest();
      return FF.Cloud.track(function (w, uid) {
        if (!uid) return null;
        var jobs = [w.set('stats/days/' + today + '/active/' + uid, guest ? 'g' : 'u')];
        if (guest) {
          jobs.push(Promise.all([FF.Track.guestNumber(w), w.get('guestIndex/' + uid)]).then(function (res) {
            var num = res[0], old = res[1] || {};
            var chosen = s.displayName && !/^Guest\d*$/.test(s.displayName) ? String(s.displayName).slice(0, 40) : '';
            var entry = {
              name: chosen || (num ? guestName(num) : 'Guest'),
              firstSeen: typeof old.firstSeen === 'number' ? old.firstSeen : Date.now(),
              lastSeen: Date.now(),
              plays: typeof old.plays === 'number' ? old.plays : 0,
              installed: standalone() || !!FF.Storage.get('installTracked', false)
            };
            if (num) entry.number = num;
            if (s.avatar) entry.avatar = String(s.avatar).slice(0, 60);
            return w.set('guestIndex/' + uid, entry);
          }));
        } else {
          jobs.push(w.get('userIndex/' + uid + '/plays').then(function (plays) {
            var entry = {
              displayName: String(s.displayName || '').slice(0, 40),
              lastSeen: Date.now(),
              createdAt: s.createdAt || Date.now(),
              plays: typeof plays === 'number' ? plays : 0,
              installed: standalone() || !!FF.Storage.get('installTracked', false),
              provider: String(s.provider || s.mode || '').slice(0, 20)
            };
            if (s.username) entry.username = String(s.username).slice(0, 20);
            if (s.avatar) entry.avatar = String(s.avatar).slice(0, 60);
            return w.set('userIndex/' + uid, entry);
          }));
        }
        return Promise.all(jobs);
      }).then(function (ok) {
        if (ok) FF.Storage.set('trackSeen', mark);
        return ok;
      });
    },

    /* Count an install once per device: either the browser told us
       (install.js leaves a note) or this is the first launch as an app. */
    checkInstall: function () {
      if (FF.Storage.get('installTracked', false)) return Promise.resolve(false);
      var pending = FF.Storage.get('installPending', false);
      if (!pending && !standalone()) return Promise.resolve(false);
      return this.count('installs').then(function (ok) {
        if (ok) { FF.Storage.set('installTracked', true); FF.Storage.remove('installPending'); }
        return ok;
      });
    },

    /* Called once the app has a session. */
    start: function () {
      var self = this;
      if (this._started) return;
      this._started = true;
      if (FF.Auth && FF.Auth.onChange) {
        FF.Auth.onChange(function (s) { if (s && !s.needsProfile) { self.seen(); self.checkInstall(); } });
      }
      this.seen();
      this.checkInstall();
    }
  };

  // Which day/total counters a game start adds to.
  function countersForPlay(online, guest) {
    var list = ['plays'];
    if (online) list.push('onlinePlays');
    if (guest) list.push('guestPlays');
    return list;
  }
})();
