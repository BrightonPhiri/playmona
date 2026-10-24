/* ============================================================
   PLAYMONA — gameConfig.js
   Switches the admin portal controls, and what guests can do.

   FF.GameConfig  reads /config from the database (anyone can read
                  it), keeps a copy on the device for offline use,
                  and answers "is this game on?".
   FF.Access      decides what the current player may open. Guests
                  get a starter set of games; everything else asks
                  them to create a free account. Signed-in players
                  meet the paywall: 'premium' games need Plus (or
                  that game bought), 'limited' games give a few free
                  plays a day first. The paywall is off until the
                  admin portal's Site > Payments switch is on, except
                  for admins, who see it early to test it.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  }

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

    // Nobody meets a paywall they cannot pay through: it waits for the Payments switch.
    paywallOn: function () {
      if (this.isGuest()) return false;
      if (FF.GameConfig.site().payments) return true;
      return !!(FF.Plus && FF.Plus.isAdmin && FF.Plus.isAdmin());
    },

    owns: function (id) { return !!(FF.Plus && FF.Plus.ownsGame && FF.Plus.ownsGame(id)); },

    // 'free' | 'limited' | 'premium' for this player right now ('free' once they own it).
    tier: function (id) {
      var tier = FF.GameConfig.game(id).tier;
      if (tier !== 'limited' && tier !== 'premium') return 'free';
      if (!this.paywallOn() || this.owns(id)) return 'free';
      return tier;
    },

    // Free plays are counted per account per day (UTC, like the admin counters).
    _plays: function () {
      var today = new Date().toISOString().slice(0, 10);
      var saved = FF.Storage.get('freePlays', null);
      if (!saved || saved.day !== today || typeof saved.counts !== 'object' || !saved.counts) {
        saved = { day: today, counts: {} };
      }
      return saved;
    },

    playsUsed: function (id) { return Number(this._plays().counts[id]) || 0; },

    // Free plays left today for a 'limited' game, or null when the game has no limit.
    playsLeft: function (id) {
      if (this.tier(id) !== 'limited') return null;
      return Math.max(0, (Number(FF.GameConfig.game(id).freePlays) || 0) - this.playsUsed(id));
    },

    // Called when a game really starts. Only limited games count.
    usePlay: function (id) {
      if (this.tier(id) !== 'limited') return;
      var saved = this._plays();
      saved.counts[id] = (Number(saved.counts[id]) || 0) + 1;
      FF.Storage.set('freePlays', saved);
    },

    /* Why this game cannot be opened now: null (it can), 'off', 'guest', 'premium' or 'limit'. */
    lock: function (id) {
      if (!FF.GameConfig.enabled(id)) return 'off';
      if (this.isGuest()) return FF.GameConfig.game(id).guest ? null : 'guest';
      var tier = this.tier(id);
      if (tier === 'premium') return 'premium';
      if (tier === 'limited' && this.playsLeft(id) <= 0) return 'limit';
      return null;
    },

    canPlay: function (id) { return !this.lock(id); },

    /* Tell the player why a game will not open, with the way forward. */
    explain: function (id) {
      var why = this.lock(id);
      if (why === 'off') FF.UI.toast(t('gameResting', 'This game is taking a break. Try another one.'));
      else if (why === 'guest') this.prompt('game');
      else if (why) this.upgrade(id);
    },

    /* "Upgrade to play": Plus, or buying just this game when it is on sale. */
    upgrade: function (id) {
      if (!FF.UI || !FF.UI.dialog) return;
      var def = FF.Games && FF.Games.get ? FF.Games.get(id) : null;
      var name = def ? def.name : id;
      var why = this.lock(id);
      var lines = [];
      if (why === 'limit') {
        var n = Number(FF.GameConfig.game(id).freePlays) || 0;
        lines.push(n === 1
          ? t('upgradeLimitOne', 'You have used your free play of {name} today.', { name: name })
          : t('upgradeLimit', 'You have used your {n} free plays of {name} today.', { name: name, n: n }));
        lines.push(n > 0
          ? t('upgradeLimitSub', 'Get PlayMona Plus to play as much as you like, or come back tomorrow for more free plays.')
          : t('upgradePlusSub', 'Get PlayMona Plus to play it, and every other Plus game, as much as you like.'));
      } else {
        lines.push(t('upgradePremium', '{name} is a PlayMona Plus game.', { name: name }));
        lines.push(t('upgradePlusSub', 'Get PlayMona Plus to play it, and every other Plus game, as much as you like.'));
      }
      var body = FF.ui.div('upgrade');
      var ic = FF.ui.span('upgrade__icon');
      ic.appendChild(FF.Icons.icon('crown'));
      body.appendChild(ic);
      lines.forEach(function (line) { body.appendChild(FF.ui.el('p', { class: 'upgrade__text' }, line)); });
      var offer = FF.ui.div('upgrade__offer');
      offer.hidden = true;
      body.appendChild(offer);

      var dlg = FF.UI.dialog({
        title: t('upgradeTitle', 'Upgrade to play'),
        body: body,
        className: 'upgrade-dialog',
        actions: [
          { label: t('notNow', 'Not now') },
          { label: t('getPlus', 'Get Plus'), primary: true, icon: 'crown', onClick: function () { if (FF.Nav) FF.Nav.go('plus'); } }
        ]
      });

      // Pay once for this game, when the server sells it on its own.
      if (FF.Plus && FF.Plus.gameOffer) {
        FF.Plus.gameOffer(id).then(function (item) {
          if (!item || !offer.isConnected) return;
          offer.hidden = false;
          offer.appendChild(FF.ui.el('p', { class: 'upgrade__or' }, t('upgradeOr', 'Or keep just this game, yours for good:')));
          var btn = FF.UI.button(t('unlockFor', 'Unlock {name} for {price}', { name: name, price: FF.Plus.money(item.cents) }), {
            class: 'btn-block', icon: 'lock',
            onClick: function () { FF.Plus.buy(item.id, btn); }
          });
          offer.appendChild(btn);
          if (FF.Plus.agreeLine) offer.appendChild(FF.Plus.agreeLine());
        });
      }
      return dlg;
    },

    /* A short line for a game card: 'Plus', or how many free plays are left today. */
    cardBadge: function (id) {
      var tier = this.tier(id);
      if (tier === 'premium') return { kind: 'plus', text: t('plusBadge', 'Plus') };
      if (tier === 'limited') {
        var left = this.playsLeft(id);
        return left > 0
          ? { kind: 'plays', text: t('freeLeft', '{n} free today', { n: left }) }
          : { kind: 'plus', text: t('plusBadge', 'Plus') };
      }
      return null;
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
