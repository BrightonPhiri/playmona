/* ============================================================
   PLAYMONA — gameConfig.js
   Switches the admin portal controls, and what guests can do.

   FF.GameConfig  reads /config from the database (anyone can read
                  it), keeps a copy on the device for offline use,
                  and answers "is this game on?".
   FF.Access      decides what the current player may open. Guests
                  get a starter set of games; everything else asks
                  them to create a free account.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }

  // Games a guest can play until the admin portal says otherwise.
  // One or two from each kind of game, so guests get a real taste.
  var GUEST_GAMES = [
    'familyQuiz', 'trueOrFalse', 'wordScramble', 'guessFlag', 'memoryMatch',
    'quickTap', 'higherOrLower', 'wouldYouRather', 'guessAnimal', 'bibleQuiz'
  ];

  // Features a guest can use until the admin portal says otherwise.
  var GUEST_FEATURES = { online: false, daily: false, challenge: false, gameNight: false };

  var GAME_DEFAULTS = { enabled: true, tier: 'free', freePlays: 3, badge: null };

  var cfg = null;          // { games: {}, site: {} } from the database
  var listeners = [];
  var loading = null;

  function cached() {
    if (cfg) return cfg;
    var saved = FF.Storage ? FF.Storage.get('gameConfig', null) : null;
    cfg = (saved && typeof saved === 'object') ? saved : { games: {}, site: {} };
    return cfg;
  }

  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  FF.GameConfig = {
    GUEST_GAMES: GUEST_GAMES,
    GUEST_FEATURES: GUEST_FEATURES,

    /* Fetch the latest switches. Resolves true when anything changed. */
    load: function () {
      if (loading) return loading;
      if (!FF.Cloud || !FF.Cloud.shared || !FF.Cloud.shared()) return Promise.resolve(false);
      var before = cached();
      loading = FF.Cloud.publicGet('config').then(function (val) {
        loading = null;
        var next = { games: (val && val.games) || {}, site: (val && val.site) || {} };
        if (same(next, before)) return false;
        cfg = next;
        if (FF.Storage) FF.Storage.set('gameConfig', next);
        listeners.slice().forEach(function (fn) { try { fn(next); } catch (e) {} });
        return true;
      }, function () { loading = null; return false; });
      return loading;
    },

    onChange: function (fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    },

    // Used by tests and the admin portal preview.
    _set: function (next) { cfg = next || { games: {}, site: {} }; },

    /* Settings for one game, with defaults filled in. */
    game: function (id) {
      var saved = cached().games[id] || {};
      var out = {};
      for (var k in GAME_DEFAULTS) out[k] = saved[k] != null ? saved[k] : GAME_DEFAULTS[k];
      out.guest = saved.guest != null ? !!saved.guest : GUEST_GAMES.indexOf(id) !== -1;
      return out;
    },
    enabled: function (id) { return this.game(id).enabled !== false; },

    site: function () {
      var s = cached().site || {};
      var guest = {};
      for (var k in GUEST_FEATURES) guest[k] = s.guest && s.guest[k] != null ? !!s.guest[k] : GUEST_FEATURES[k];
      return { maintenance: !!s.maintenance, payments: !!s.payments, announcement: s.announcement || '', guest: guest };
    }
  };

  FF.Access = {
    isGuest: function () { return !!(FF.Auth && FF.Auth.isGuest && FF.Auth.isGuest()); },

    canPlay: function (id) {
      if (!FF.GameConfig.enabled(id)) return false;
      return !this.isGuest() || FF.GameConfig.game(id).guest;
    },

    // feature: 'online' | 'daily' | 'challenge' | 'gameNight'
    canUse: function (feature) {
      return !this.isGuest() || !!FF.GameConfig.site().guest[feature];
    },

    /* Run fn when allowed; otherwise invite the guest to sign up. */
    gate: function (feature, fn) {
      if (this.canUse(feature)) return fn();
      this.prompt(feature);
    },

    copy: function (what) {
      var lines = {
        game: t('lockedGame', 'This game is for PlayMona members. Create a free account to unlock every game.'),
        online: t('lockedOnline', 'Create a free account to play online with friends on their own phones.'),
        daily: t('lockedDaily', 'Create a free account to take the daily challenge and get on the leaderboard.'),
        challenge: t('lockedChallenge', 'Create a free account to challenge friends and see their scores.'),
        gameNight: t('lockedGameNight', 'Create a free account to host a Game Night tournament.')
      };
      return lines[what] || lines.game;
    },

    prompt: function (what) {
      if (!FF.UI || !FF.UI.confirm) return;
      FF.UI.confirm({
        title: t('lockedTitle', 'Sign up free to unlock this'),
        body: this.copy(what),
        cancelLabel: t('notNow', 'Not now'),
        confirmLabel: t('createFreeAccount', 'Create free account'),
        onConfirm: function () { if (FF.App && FF.App.openAccount) FF.App.openAccount('signup'); }
      });
    },

    /* A full-page invitation, used in place of a locked screen. */
    lockedPanel: function (what, title) {
      var box = FF.ui.el('section', { class: 'locked-panel' });
      var ic = FF.ui.span('locked-panel__icon');
      ic.appendChild(FF.Icons.icon('lock'));
      box.appendChild(ic);
      box.appendChild(FF.ui.el('h1', { class: 'page-title' }, title || t('lockedTitle', 'Sign up free to unlock this')));
      box.appendChild(FF.ui.el('p', { class: 'page-sub' }, this.copy(what)));
      var acts = FF.ui.div('btn-stack locked-panel__actions');
      acts.appendChild(FF.UI.button(t('createFreeAccount', 'Create free account'), { class: 'btn-lg btn-primary', icon: 'user', onClick: function () { FF.App.openAccount('signup'); } }));
      acts.appendChild(FF.UI.button(t('signIn', 'Sign in'), { class: 'btn-lg', icon: 'arrow-right', onClick: function () { FF.App.openAccount('signin'); } }));
      box.appendChild(acts);
      return box;
    }
  };
})();
