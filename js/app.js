/* ============================================================
   PLAYMONA — app.js
   Application shell and screens: home (dashboard), games library,
   online, profile (you, players, teams), settings (tabbed), game
   night, credits, about. The app starts after sign-in (js/auth.js,
   js/authUI.js). Components come from FF.UI (js/ui-kit.js).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var VERSION = '3.0.0';

  /* ================= Brand ================= */
  FF.Brand = {
    name: 'PlayMona',
    version: VERSION,
    tagline: 'Games for everyone. Everywhere.',
    site: 'https://playmona.com',
    markImg: 'assets/brand/mark-256.webp',

    // The logo mark (the gradient "P").
    logo: function (cls, decorative) {
      return FF.ui.el('img', {
        class: cls || 'brand-logo', src: FF.Brand.markImg,
        alt: decorative ? '' : 'PlayMona', width: 64, height: 64, decoding: 'async'
      });
    },

    // Mark + "PlayMona" wordmark, as used in the top bar.
    lockup: function (size) {
      var wrap = FF.ui.span('brand-lockup' + (size ? ' brand-lockup--' + size : ''));
      wrap.appendChild(FF.Brand.logo('brand-logo', true));
      wrap.appendChild(FF.AuthUI ? FF.AuthUI.wordmark() : FF.ui.span('', 'PlayMona'));
      return wrap;
    }
  };

  /* ================= Categories =================
     One place for a category's name, colour and icon. */
  FF.Categories = {
    words:    { name: 'Words',    icon: '🔤', iconKey: 'text-aa',               color: '#8b5cf6', tKey: 'catWords' },
    quiz:     { name: 'Quiz',     icon: '🧠', iconKey: 'brain',                 color: '#3b82f6', tKey: 'catQuiz' },
    bible:    { name: 'Bible',    icon: '📖', iconKey: 'book-open',             color: '#9333ea', tKey: 'catBibleShort' },
    visual:   { name: 'Visual',   icon: '🖼️', iconKey: 'eye',                   color: '#10b981', tKey: 'catVisual' },
    memory:   { name: 'Memory',   icon: '🧩', iconKey: 'puzzle-piece',          color: '#f97316', tKey: 'catMemory' },
    reaction: { name: 'Reaction', icon: '⚡', iconKey: 'lightning',             color: '#ef4444', tKey: 'catReaction' },
    creative: { name: 'Creative', icon: '🎨', iconKey: 'paint-brush',           color: '#ec4899', tKey: 'catCreative' },
    numbers:  { name: 'Numbers',  icon: '🔢', iconKey: 'calculator',            color: '#06b6d4', tKey: 'catNumbers' },
    party:    { name: 'Party',    icon: '🎉', iconKey: 'confetti',              color: '#eab308', tKey: 'catParty' },
    world:    { name: 'World',    icon: '🌍', iconKey: 'globe-hemisphere-west', color: '#14b8a6', tKey: 'catWorld' }
  };
  // Keep the icon map in sync for older callers of FF.Icons.category.
  if (FF.Icons && FF.Icons.category) {
    Object.keys(FF.Categories).forEach(function (id) { FF.Icons.category[id] = FF.Categories[id].iconKey; });
  }
  FF.Categories.meta = function (id) {
    var c = FF.Categories[id] || { name: id, icon: '🎮', iconKey: 'game-controller', color: '#8b5cf6' };
    return { id: id, name: c.tKey ? FF.t(c.tKey, c.name) : c.name, icon: c.icon, iconKey: c.iconKey, color: c.color };
  };

  function t(key, fallback, vars) { return FF.t(key, fallback, vars); }
  function icon(key, fallback) { return FF.Icons.icon(key, fallback); }
  function onlineEnabled() { return !!(FF.Net && FF.Net.configured && FF.Net.configured()); }
  function onlineIds() { return (FF.RoomUI && FF.RoomUI.ONLINE_GAMES) || []; }
  function isOnlineGame(id) { return onlineIds().indexOf(id) !== -1; }

  // View aliases kept so older links and code paths still land somewhere sensible.
  var ALIASES = {
    family: { view: 'profile', params: {} },
    players: { view: 'profile', params: { tab: 'players' } },
    scores: { view: 'profile', params: { tab: 'overview' } },
    favorites: { view: 'games', params: { favorites: true } }
  };
  // Screens a guest may be locked out of (see FF.Access, js/gameConfig.js).
  var VIEW_FEATURE = { daily: 'daily', challenges: 'challenge', challenge: 'challenge', gamenight: 'gameNight' };
  // Which main destination a view belongs to (for nav highlighting).
  var NAV_OF = { home: 'home', gamenight: 'home', games: 'games', online: 'online', daily: 'online', challenges: 'online', challenge: 'online', plus: 'profile', profile: 'profile', settings: 'settings', credits: 'settings', about: 'settings' };

  FF.App = {
    session: { games: 0, wins: {}, totalPoints: 0, players: {} },
    _currentView: 'home',
    _currentParams: {},
    _lib: null,
    _started: false,
    _navReady: false,

    /* Boot: device settings first, then the account decides what shows. */
    init: function () {
      FF.Storage.init();
      if (FF.i18n) FF.i18n.init();
      FF.Theme.init();
      FF.Audio.init();
      this.resetLibrary();
      var self = this;
      if (FF.i18n) {
        FF.i18n.onChange(function () {
          if (self._started) {
            self.buildShell();
            self.render(self._currentView || 'home', self._currentParams || {});
          } else if (FF.AuthUI && FF.AuthUI.isOpen()) {
            FF.AuthUI.show('signin');
          }
        });
      }
      FF.Auth.onChange(function (s) { self._route(s); });
      this._splash();
      FF.Auth.init().then(function (s) { self._route(s); });
    },

    // A brief branded screen while the account loads.
    _splash: function () {
      FF.ui.clear(document.body);
      var s = FF.ui.el('div', { class: 'splash', id: 'splash', role: 'status', 'aria-label': t('loading', 'Loading') });
      s.appendChild(FF.Brand.logo('splash__mark', true));
      document.body.appendChild(s);
    },

    // Show sign-in, the "make it yours" step, or the app.
    _route: function (s) {
      var splash = document.getElementById('splash');
      if (!s) {
        if (splash) splash.parentNode.removeChild(splash);
        this.stop();
        // The landing page links to play?view=signup for new players.
        var wantsSignup = /[?&]view=signup\b/.test(window.location.search);
        if (/[?&]view=guest\b/.test(window.location.search) && !this._guestTried) {
          this._guestTried = true;
          FF.Auth.playAsGuest();
          return;
        }
        var cur = FF.AuthUI.current();
        if (cur === 'personalize') cur = null;
        FF.AuthUI.show(wantsSignup && !cur ? 'signup' : (cur || 'signin'));
        return;
      }
      if (s.needsProfile || FF.AuthUI._justJoined) {
        if (splash) splash.parentNode.removeChild(splash);
        if (FF.AuthUI.current() === 'personalize') return;   // already showing
        this.stop();
        FF.AuthUI.show('personalize');
        return;
      }
      if (splash) splash.parentNode.removeChild(splash);
      FF.AuthUI.hide();
      if (this._started && this._uid !== s.uid) this.stop();
      if (!this._started) this.start();
      else this._refreshAccount();
    },

    start: function () {
      if (this._started) return;
      this._started = true;
      this._uid = FF.Auth.user() ? FF.Auth.user().uid : null;
      if (FF.Track) FF.Track.start();
      if (FF.GameConfig) {
        if (!this._configHooked) {
          this._configHooked = true;
          // New switches from the admin portal: redraw, unless a game is running.
          FF.GameConfig.onChange(function () {
            if (!FF.App._started || (FF.GameFlow && FF.GameFlow.current)) return;
            FF.App.render(FF.App._currentView || 'home', FF.App._currentParams || {});
          });
          // Coming back to the app picks up changes made since (at most every 5 minutes).
          var lastLoad = Date.now();
          document.addEventListener('visibilitychange', function () {
            if (document.hidden || Date.now() - lastLoad < 5 * 60 * 1000) return;
            lastLoad = Date.now();
            FF.GameConfig.load();
          });
        }
        FF.GameConfig.load();
      }
      // The browser may offer installing after Home has drawn: add the card then.
      if (FF.Install && !this._installHooked) {
        this._installHooked = true;
        FF.Install.onChange(function () {
          var card = document.getElementById('install-card');
          if (card && !FF.Install.available()) { card.parentNode.removeChild(card); return; }
          if (card || FF.App._currentView !== 'home' || (FF.GameFlow && FF.GameFlow.current)) return;
          var c = FF.App.installCard();
          var r = FF.App.root();
          if (c && r) r.appendChild(c);
        });
      }
      FF.AuthUI.hide();
      // Drop ?view=signup so signing out later shows the sign-in screen.
      if (window.location.search && window.history && history.replaceState) {
        try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (e) {}
      }
      FF.Players.clearTemporary();
      this.resetLibrary();
      this.buildShell();
      if (!this._navReady) { FF.Nav.init(); this._navReady = true; }
      this.render('home');
      if (FF.Plus) {
        FF.Plus.init();
        FF.Plus.handleReturn();   // back from a Linkwa checkout
      }

      // A shared link like .../play#room=ABC123 goes straight to join.
      var challengeCode = FF.Challenge && FF.Challenge.codeFromUrl();
      if (challengeCode) { FF.Challenge.openCode(challengeCode); return; }
      var joinCode = (FF.Room && FF.Room.codeFromUrl) ? FF.Room.codeFromUrl() : null;
      if (joinCode && onlineEnabled()) {
        FF.Nav.go('online');
        var root = this.root();
        FF.Access.gate('online', function () { FF.RoomUI.showJoin(root, joinCode); });
      }
    },

    // Signed out: take the app off screen (a running game is closed).
    stop: function () {
      if (!this._started) return;
      this._started = false;
      if (FF.GameFlow && FF.GameFlow.current) FF.GameFlow.close('home');
      if (FF.Room && FF.Room.current && FF.Room.current()) { try { FF.Room.leave(); } catch (e) {} }
      var app = document.getElementById('app');
      if (app) app.parentNode.removeChild(app);
      FF.ui.$$('.ff-dialog').forEach(function (d) { d.parentNode.removeChild(d); });
    },

    _refreshAccount: function () {
      var chip = document.getElementById('topbar-account');
      if (chip) chip.parentNode.replaceChild(this.accountButton(), chip);
      if (this._currentView === 'home' || this._currentView === 'profile') this.render(this._currentView, this._currentParams);
    },

    // Another device's changes arrived: redraw what is on screen.
    onSynced: function () {
      if (!this._started || (FF.GameFlow && FF.GameFlow.current)) return;
      this.render(this._currentView || 'home', this._currentParams || {});
    },

    root: function () { return FF.ui.$('#app-main'); },

    onThemeChange: function () { this._syncNav(); },

    onGameEnded: function (results) {
      var w = results.results && results.results[0];
      this.session.games++;
      if (w) {
        this.session.wins[w.name] = (this.session.wins[w.name] || 0) + 1;
        this.session.totalPoints += w.points || 0;
      }
      if (results.results) {
        results.results.forEach(function (r) { FF.App.session.players[r.name] = true; });
      }
    },

    onGameExit: function () {
      // Re-render so the dashboard, "Play again" and favourites are fresh.
      this.render(this._currentView || 'home', this._currentParams || {});
    },

    // The signed-in player's avatar in the top bar (opens Profile).
    accountButton: function () {
      var p = FF.Auth.profile();
      var b = FF.ui.el('button', {
        type: 'button', class: 'account-chip', id: 'topbar-account',
        'aria-label': t('accountMenu', 'Account menu: {name}', { name: p ? p.displayName : '' }),
        'aria-haspopup': 'menu', 'aria-expanded': 'false',
        onclick: function () { FF.App.toggleAccountMenu(b); }
      });
      if (p) b.appendChild(FF.Avatars.img(p.avatar, 'account-chip__ava'));
      return b;
    },

    /* ================= Account menu ================= */
    toggleAccountMenu: function (anchor) {
      if (document.getElementById('account-menu')) { this.closeAccountMenu(); return; }
      this.openAccountMenu(anchor);
    },

    closeAccountMenu: function (returnFocus) {
      var m = document.getElementById('account-menu');
      if (!m) return;
      if (m._cleanup) m._cleanup();
      m.parentNode.removeChild(m);
      var chip = document.getElementById('topbar-account');
      if (chip) {
        chip.setAttribute('aria-expanded', 'false');
        if (returnFocus) chip.focus();
      }
    },

    openAccountMenu: function (anchor) {
      var self = this;
      var p = FF.Auth.profile() || {};
      var guest = FF.Auth.isGuest();
      var lvl = FF.Stats.level(FF.Stats.get().xp);
      var menu = FF.ui.el('div', { class: 'acct-menu', id: 'account-menu', 'data-own-arrows': 'true' });

      // Who is signed in, with their level.
      var head = FF.ui.div('acct-menu__head');
      var ava = FF.ui.div('acct-menu__ava');
      ava.appendChild(FF.Avatars.img(p.avatar, 'acct-menu__img'));
      head.appendChild(ava);
      var who = FF.ui.div('acct-menu__who');
      who.appendChild(FF.ui.el('strong', { class: 'acct-menu__name' }, p.displayName || ''));
      who.appendChild(FF.ui.span('acct-menu__user', guest ? t('playingAsGuest', 'Playing as a guest') : '@' + (p.username || '')));
      var lv = FF.ui.div('acct-menu__level');
      lv.appendChild(FF.ui.span('acct-menu__lvl', t('levelN', 'Level {n}', { n: lvl.level })));
      var bar = FF.ui.el('span', { class: 'acct-menu__bar', role: 'img', 'aria-label': t('xpOf', '{a} of {b} XP', { a: lvl.into, b: lvl.need }) });
      var fill = FF.ui.span('acct-menu__fill');
      fill.style.width = Math.round(lvl.progress * 100) + '%';
      bar.appendChild(fill);
      lv.appendChild(bar);
      who.appendChild(lv);
      head.appendChild(who);
      menu.appendChild(head);

      if (guest) {
        var up = FF.UI.button(t('createAccount', 'Create account'), { class: 'btn-primary btn-block acct-menu__cta', icon: 'user', onClick: function () { self.closeAccountMenu(); FF.App.openAccount('signup'); } });
        up.setAttribute('role', 'menuitem');
        menu.appendChild(up);
      }

      var list = FF.ui.el('div', { class: 'acct-menu__list', role: 'menu', 'aria-label': t('account', 'Account') });
      function item(iconKey, label, onClick, opts) {
        opts = opts || {};
        var b = FF.ui.el('button', { type: 'button', class: 'acct-menu__item' + (opts.cls ? ' ' + opts.cls : ''), role: opts.role || 'menuitem' });
        if (opts.checked != null) b.setAttribute('aria-checked', opts.checked ? 'true' : 'false');
        b.appendChild(FF.Icons.icon(iconKey));
        b.appendChild(FF.ui.span('acct-menu__label', label));
        if (opts.hint) b.appendChild(FF.ui.span('acct-menu__hint', opts.hint));
        b.addEventListener('click', function () {
          if (!opts.keepOpen) self.closeAccountMenu();
          onClick(b);
        });
        list.appendChild(b);
        return b;
      }
      function divider() { list.appendChild(FF.ui.el('div', { class: 'acct-menu__sep', role: 'separator' })); }

      item('user', t('myProfile', 'My profile'), function () { FF.App._navTo('profile'); });
      item('users', t('savedPlayers', 'Saved players'), function () { FF.Nav.go('profile', { tab: 'players' }); },
        { hint: String(FF.Players.all().length) });
      item('chart-line', t('myStats', 'My stats'), function () { FF.Nav.go('profile', { tab: 'overview' }); });
      item('sliders', t('navSettings', 'Settings'), function () { FF.App._navTo('settings'); });
      if (FF.Plus && FF.Plus.visible()) {
        item('crown', t('plusTitle', 'PlayMona Plus'), function () { FF.Nav.go('plus'); },
          { hint: FF.Plus.hasPlus() ? t('plusOnShort', 'On') : null });
      }
      divider();
      var dark = FF.Theme.resolvedTheme() === 'dark';
      item(dark ? 'moon' : 'sun', t('darkMode', 'Dark mode'), function (b) {
        var nowDark = FF.Theme.resolvedTheme() !== 'dark';
        FF.Theme.setTheme(nowDark ? 'dark' : 'light');
        b.setAttribute('aria-checked', nowDark ? 'true' : 'false');
        FF.ui.clear(b);
        b.appendChild(FF.Icons.icon(nowDark ? 'moon' : 'sun'));
        b.appendChild(FF.ui.span('acct-menu__label', t('darkMode', 'Dark mode')));
        b.appendChild(FF.ui.span('acct-menu__switch'));
      }, { role: 'menuitemcheckbox', checked: dark, keepOpen: true, cls: 'acct-menu__item--toggle' });
      list.lastChild.appendChild(FF.ui.span('acct-menu__switch'));
      if (FF.Install && FF.Install.available()) item('download', t('installApp', 'Install the app'), function () { FF.App.install(); });
      item('info', t('privacyNotice', 'Privacy notice'), function () { window.open(FF.page('privacy'), '_blank', 'noopener'); });
      divider();
      item('sign-out', guest ? t('leaveGuest', 'Stop guest play') : t('signOut', 'Log out'), function () { FF.App.confirmSignOut(); }, { cls: 'acct-menu__item--danger' });
      menu.appendChild(list);

      document.body.appendChild(menu);
      anchor.setAttribute('aria-expanded', 'true');

      // Sit under the avatar, right-aligned with it.
      function place() {
        var r = anchor.getBoundingClientRect();
        menu.style.top = Math.round(r.bottom + 8) + 'px';
        menu.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
      }
      place();

      var items = function () { return FF.ui.$$('.acct-menu__cta, .acct-menu__item', menu); };
      menu.addEventListener('keydown', function (e) {
        var all = items();
        var i = all.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); self.closeAccountMenu(true); return; }
        if (e.key === 'Tab') { self.closeAccountMenu(); return; }
        var next = null;
        if (e.key === 'ArrowDown') next = all[(i + 1) % all.length];
        else if (e.key === 'ArrowUp') next = all[(i - 1 + all.length) % all.length];
        else if (e.key === 'Home') next = all[0];
        else if (e.key === 'End') next = all[all.length - 1];
        if (next) { e.preventDefault(); e.stopPropagation(); next.focus(); }
      });
      var outside = function (e) { if (!menu.contains(e.target) && !anchor.contains(e.target)) self.closeAccountMenu(); };
      var onResize = function () { self.closeAccountMenu(); };
      setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0);
      window.addEventListener('resize', onResize);
      menu._cleanup = function () {
        document.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('resize', onResize);
      };
      var first = items()[0];
      if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 0);
    },

    // Views that live in other modules (daily challenge, challenges).
    _mountExtraViews: function () {
      if (this._extraViews || !FF.Social) return;
      this._extraViews = true;
      var views = this.views;
      Object.keys(FF.Social.views).forEach(function (k) { views[k] = FF.Social.views[k]; });
      if (FF.Plus) Object.keys(FF.Plus.views).forEach(function (k) { views[k] = FF.Plus.views[k]; });
    },

    /* ================= Shell ================= */
    navItems: function () {
      var items = [
        { view: 'home', icon: 'house', label: t('navHome', 'Home') },
        { view: 'games', icon: 'game-controller', label: t('navGames', 'Games') }
      ];
      if (onlineEnabled()) items.push({ view: 'online', icon: 'wifi', label: t('navOnline', 'Online') });
      items.push({ view: 'profile', icon: 'user', label: t('navProfile', 'Profile') });
      items.push({ view: 'settings', icon: 'sliders', label: t('navSettings', 'Settings') });
      return items;
    },

    buildShell: function () {
      var existingGame = document.getElementById('game-screen');
      var gameWasOpen = existingGame && !existingGame.classList.contains('hidden');
      var oldApp = document.getElementById('app');
      if (oldApp) oldApp.parentNode.removeChild(oldApp);
      if (!existingGame) {
        // First build: drop the boot <script> tags so body holds only the app.
        FF.ui.clear(document.body);
      }

      var self = this;
      var skip = FF.ui.el('a', { class: 'skip-link', href: '#app-main' }, t('skipToContent', 'Skip to content'));
      skip.addEventListener('click', function (e) {
        e.preventDefault();
        var m = self.root();
        if (m) { m.focus(); }
      });

      var app = FF.ui.div('app');
      app.id = 'app';
      app.style.setProperty('--app-art', FF.Assets.artUrl('ui', 'app-bg'));
      app.appendChild(skip);

      // Top bar
      var header = FF.ui.el('header', { class: 'topbar' });
      var brand = FF.ui.el('button', {
        type: 'button', class: 'topbar__brand', 'aria-label': t('homeLabel', 'PlayMona, home'),
        onclick: function () { self._navTo('home'); }
      });
      brand.appendChild(FF.Brand.lockup());
      header.appendChild(brand);

      var topnav = FF.ui.el('nav', { class: 'topnav', 'aria-label': t('mainNav', 'Main') });
      var tabbar = FF.ui.el('nav', { class: 'tabbar', 'aria-label': t('mainNav', 'Main') });
      this.navItems().forEach(function (item) {
        var a = FF.ui.el('button', { type: 'button', class: 'topnav__link', dataset: { view: item.view }, onclick: function () { self._navTo(item.view); } });
        a.appendChild(icon(item.icon));
        a.appendChild(FF.ui.span('', item.label));
        topnav.appendChild(a);

        var b = FF.ui.el('button', { type: 'button', class: 'tabbar__item', dataset: { view: item.view }, onclick: function () { self._navTo(item.view); } });
        var ic = FF.ui.span('tabbar__icon');
        ic.appendChild(icon(item.icon));
        b.appendChild(ic);
        b.appendChild(FF.ui.span('tabbar__label', item.label));
        tabbar.appendChild(b);
      });
      header.appendChild(topnav);

      var tools = FF.ui.div('topbar__tools');
      tools.appendChild(FF.UI.iconButton('search', t('searchGames', 'Search games'), function () {
        FF.App._navTo('games', { focusSearch: true });
      }));
      if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        tools.appendChild(FF.UI.iconButton('arrows-out', t('fullscreen', 'Full screen'), function () { self.toggleFullscreen(); }, 'topbar__fs'));
      }
      tools.appendChild(this.accountButton());
      header.appendChild(tools);
      app.appendChild(header);

      var main = FF.ui.el('main', { class: 'app-main', id: 'app-main', tabindex: -1 });
      app.appendChild(main);

      var footer = FF.ui.el('footer', { class: 'app-footer' });
      var privacy = FF.ui.span('app-footer__privacy');
      privacy.appendChild(icon('shield'));
      privacy.appendChild(document.createTextNode(t('privacyLine2', 'No ads, no tracking. Your data stays yours.')));
      footer.appendChild(privacy);
      footer.appendChild(FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('credits'); } }, t('credits', 'Credits')));
      footer.appendChild(FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('about'); } }, t('about', 'About')));
      footer.appendChild(FF.ui.el('a', { class: 'link-btn', href: FF.page('privacy'), target: '_blank', rel: 'noopener' }, t('privacy', 'Privacy')));
      footer.appendChild(FF.ui.span('app-footer__ver', 'v' + VERSION));
      app.appendChild(footer);
      app.appendChild(tabbar);

      if (existingGame) document.body.insertBefore(app, existingGame);
      else document.body.appendChild(app);

      if (!existingGame) {
        var gameScreen = FF.ui.div('game-screen hidden');
        gameScreen.id = 'game-screen';
        gameScreen.setAttribute('role', 'region');
        gameScreen.setAttribute('aria-label', t('gameArea', 'Game'));
        document.body.appendChild(gameScreen);
      } else if (gameWasOpen) {
        document.body.classList.add('game-active');
      }
      if (!document.getElementById('ff-live')) {
        document.body.appendChild(FF.ui.el('div', { id: 'ff-live', class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' }));
      }
      this._syncNav();
    },

    _navTo: function (view, params) {
      FF.Audio.play('select');
      FF.Nav.replace(view, params || {});
    },

    _syncNav: function () {
      var current = NAV_OF[this._currentView] || this._currentView;
      FF.ui.$$('.topnav__link, .tabbar__item').forEach(function (n) {
        if (n.dataset.view === current) n.setAttribute('aria-current', 'page');
        else n.removeAttribute('aria-current');
      });
    },

    showLanguagePicker: function () {
      if (!FF.i18n) return;
      var list = FF.ui.div('');
      list.appendChild(FF.App.languageControl(function (sheet) { if (sheet) sheet.close(); }));
      var sheet = FF.UI.sheet({ title: t('selectLanguage', 'Choose your language'), body: list });
      return sheet;
    },

    toggleFullscreen: function () {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function () {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    },

    /* ================= Render router ================= */
    render: function (view, params) {
      this.closeAccountMenu();
      this._mountExtraViews();
      params = params || {};
      if (ALIASES[view]) {
        var alias = ALIASES[view];
        params = Object.assign({}, alias.params, params);
        view = alias.view;
      }
      if (view === 'online' && !onlineEnabled()) view = 'home';
      this._currentView = view;
      this._currentParams = params;
      var main = this.root();
      if (!main) return;
      FF.ui.clear(main);
      var site = FF.GameConfig ? FF.GameConfig.site() : {};
      var feature = VIEW_FEATURE[view];
      if (site.maintenance) {
        main.appendChild(FF.App.maintenancePanel());
      } else if (feature && FF.Access && !FF.Access.canUse(feature)) {
        main.appendChild(FF.Access.lockedPanel(feature));
      } else {
        if (site.announcement && view === 'home') main.appendChild(FF.App.announcement(site.announcement));
        var renderer = this.views[view] || this.views.home;
        FF.safe(function () { renderer.call(FF.App, main, FF.App._currentParams); });
      }
      this._syncNav();
      var heading = main.querySelector('h1');
      document.title = (view === 'home' || !heading) ? FF.Brand.name + ' — ' + t('titleTag', 'Games for everyone') : heading.textContent + ' · ' + FF.Brand.name;
      FF.Nav.focusFirst(main);
    },

    /* ================= Shared components ================= */
    sectionHead: function (text, action, tag) {
      var h = FF.ui.div('section-head');
      h.appendChild(FF.ui.el(tag || 'h2', { class: 'section-title' }, text));
      if (action) h.appendChild(action);
      return h;
    },
    // Legacy name used by older code.
    sectionTitle: function (text, action) { return this.sectionHead(text, action); },

    iconHeading: function (iconKey, text, tag) {
      var h = FF.ui.el(tag || 'h2', { class: 'settings-section__title' });
      h.appendChild(icon(iconKey));
      h.appendChild(document.createTextNode(text));
      return h;
    },

    pageHead: function (title, sub) {
      var head = FF.ui.div('page-head');
      head.appendChild(FF.ui.el('h1', { class: 'page-title' }, title));
      if (sub) head.appendChild(FF.ui.el('p', { class: 'page-sub' }, sub));
      return head;
    },

    pageBanner: function (title, sub, art, extra) {
      var banner = FF.ui.div('page-banner');
      if (art) banner.style.setProperty('--art', art);
      if (extra && extra.category) {
        banner.dataset.cat = extra.category;
        banner.style.setProperty('--wash', FF.Assets.wash(extra.category));
      }
      banner.appendChild(FF.ui.el('h1', {}, title));
      if (sub) banner.appendChild(FF.ui.el('p', {}, sub));
      return banner;
    },

    avatarStack: function (people, max) {
      max = max || 5;
      var wrap = FF.ui.el('span', { class: 'avatar-stack', 'aria-hidden': 'true' });
      people.slice(0, max).forEach(function (p) {
        var item = FF.ui.span('avatar-stack__item');
        item.appendChild(FF.Players.avatarEl(p, ''));
        wrap.appendChild(item);
      });
      if (people.length > max) wrap.appendChild(FF.ui.span('avatar-stack__item avatar-stack__more', '+' + (people.length - max)));
      return wrap;
    },

    playersLabel: function (def) {
      var a = FF.Games.minPlayers(def), b = FF.Games.maxPlayers(def);
      return a === b ? String(a) : a + '–' + b;
    },

    gameCard: function (def, opts) {
      opts = opts || {};
      var cat = FF.Categories.meta(def.category);
      var hasArt = FF.Assets.has('covers', def.id);
      var card = FF.ui.el('article', {
        class: 'gcard' + (hasArt ? ' gcard--art' : '') + (opts.feature ? ' gcard--feature' : ''),
        dataset: { cat: def.category, game: def.id },
        style: {
          '--card-color': cat.color,
          '--art': FF.Assets.artUrl('covers', def.id),
          '--wash': FF.Assets.wash(def.category)
        }
      });

      var art = FF.ui.div('gcard__art');
      var mark = FF.ui.span('gcard__mark');
      mark.appendChild(icon(FF.Icons.game[def.id] || cat.iconKey, def.icon));
      art.appendChild(mark);
      card.appendChild(art);

      var minutes = (def.duration || 5);
      var label = def.name + '. ' + cat.name + '. ' +
        t('playersCount', '{n} players', { n: FF.App.playersLabel(def) }) + '. ' +
        t('minutesCount', '{n} minutes', { n: minutes }) + (isOnlineGame(def.id) && onlineEnabled() ? '. ' + t('playsOnline', 'Plays online') : '');
      var link = FF.ui.el('button', {
        type: 'button', class: 'gcard__link', 'aria-label': label,
        onclick: function () { FF.Audio.play('select'); FF.GameFlow.launch(def.id); }
      }, def.name);
      var name = FF.ui.el('h3', { class: 'gcard__name' }, [link]);
      var desc = FF.ui.el('p', { class: 'gcard__desc' }, def.description);
      var meta = FF.ui.div('gcard__meta');
      var pc = FF.ui.span('meta-chip');
      pc.appendChild(icon('users'));
      pc.appendChild(document.createTextNode(FF.App.playersLabel(def)));
      meta.appendChild(pc);
      var tc = FF.ui.span('meta-chip');
      tc.appendChild(icon('clock'));
      tc.appendChild(document.createTextNode(t('minShort', '{n} min', { n: minutes })));
      meta.appendChild(tc);

      if (opts.feature) {
        var overlay = FF.ui.div('gcard__overlay');
        overlay.appendChild(name);
        overlay.appendChild(desc);
        art.appendChild(overlay);
        var body = FF.ui.div('gcard__body');
        var catChip = FF.ui.span('meta-chip meta-chip--cat');
        catChip.appendChild(icon(cat.iconKey));
        catChip.appendChild(document.createTextNode(cat.name));
        meta.insertBefore(catChip, meta.firstChild);
        body.appendChild(meta);
        card.appendChild(body);
      } else {
        var body2 = FF.ui.div('gcard__body');
        body2.appendChild(name);
        body2.appendChild(desc);
        body2.appendChild(meta);
        card.appendChild(body2);
      }

      var badges = FF.ui.div('gcard__badges');
      var locked = FF.Access && FF.Access.isGuest() && !FF.Access.canPlay(def.id);
      if (locked) {
        card.classList.add('gcard--locked');
        var lk = FF.ui.span('badge badge--locked');
        lk.appendChild(icon('lock'));
        lk.appendChild(document.createTextNode(t('membersBadge', 'Sign up')));
        badges.appendChild(lk);
        link.setAttribute('aria-label', label + '. ' + t('membersOnly', 'Free account needed'));
      }
      var flag = FF.GameConfig ? FF.GameConfig.game(def.id).badge : null;
      if (flag === 'new' || flag === 'hot') {
        var nb = FF.ui.span('badge badge--' + flag);
        nb.appendChild(icon(flag === 'hot' ? 'flame' : 'sparkle'));
        nb.appendChild(document.createTextNode(flag === 'hot' ? t('hotBadge', 'Hot') : t('newBadge', 'New')));
        badges.appendChild(nb);
      }
      if (isOnlineGame(def.id) && onlineEnabled()) {
        var bd = FF.ui.span('badge badge--online');
        bd.appendChild(icon('wifi'));
        bd.appendChild(document.createTextNode(t('online', 'Online')));
        badges.appendChild(bd);
      }
      if (badges.firstChild) card.appendChild(badges);

      var fav = FF.ui.el('button', { type: 'button', class: 'fav-toggle' });
      function syncFav() {
        var on = FF.Favorites.has(def.id);
        fav.setAttribute('aria-pressed', on ? 'true' : 'false');
        fav.setAttribute('aria-label', on ? t('removeFavorite', 'Remove {name} from favourites', { name: def.name }) : t('addFavorite', 'Add {name} to favourites', { name: def.name }));
        FF.ui.clear(fav);
        fav.appendChild(icon(on ? 'star-fill' : 'star'));
      }
      syncFav();
      fav.addEventListener('click', function (e) {
        e.stopPropagation();
        FF.Favorites.toggle(def.id);
        syncFav();
        FF.Audio.play('click');
        FF.UI.announce(FF.Favorites.has(def.id) ? t('favAdded', 'Added to favourites') : t('favRemoved', 'Removed from favourites'));
        if (opts.onFav) opts.onFav();
      });
      card.appendChild(fav);
      return card;
    },

    rail: function (title, games, opts) {
      opts = opts || {};
      if (!games || !games.length) return null;
      var titleId = FF.UI.uid('rail');
      var wrap = FF.ui.el('section', { class: 'rail', 'aria-labelledby': titleId });
      var head = FF.ui.div('rail__head');
      head.appendChild(FF.ui.el('h2', { class: 'rail__title', id: titleId }, title));
      var track = FF.ui.div('rail__track');
      games.forEach(function (g) {
        track.appendChild(FF.App.gameCard(g, { feature: !!opts.feature, onFav: opts.onFav }));
      });
      if (opts.action) head.appendChild(opts.action);
      var controls = FF.ui.el('div', { class: 'rail__controls' });
      function scroll(dir) {
        var amount = Math.max(240, Math.round(track.clientWidth * 0.8)) * dir;
        if (track.scrollBy) track.scrollBy({ left: amount, behavior: 'smooth' });
        else track.scrollLeft += amount;
      }
      controls.appendChild(FF.UI.iconButton('chevron-left', t('scrollBack', 'Scroll back'), function () { scroll(-1); }, 'rail__btn'));
      controls.appendChild(FF.UI.iconButton('chevron-right', t('scrollMore', 'Scroll for more'), function () { scroll(1); }, 'rail__btn'));
      head.appendChild(controls);
      wrap.appendChild(head);
      wrap.appendChild(track);
      return wrap;
    },

    categoryRow: function () {
      var row = FF.ui.el('div', { class: 'cat-row', role: 'list' });
      FF.Games.categories().forEach(function (id) {
        var meta = FF.Categories.meta(id);
        var count = FF.Games.byCategory(id).length;
        var tile = FF.ui.el('button', {
          type: 'button', class: 'cat-tile', role: 'listitem',
          dataset: { cat: id },
          'aria-label': meta.name + ', ' + t('gamesCount', '{n} games', { n: count }),
          style: { '--art': FF.Assets.artUrl('categories', 'cat-' + id), '--wash': FF.Assets.wash(id), '--card-color': meta.color },
          onclick: function () {
            FF.Audio.play('select');
            FF.App.resetLibrary();
            FF.App._lib.cat = id;
            FF.Nav.go('games');
          }
        });
        var ic = FF.ui.div('cat-tile__icon');
        ic.appendChild(icon(meta.iconKey, meta.icon));
        tile.appendChild(ic);
        tile.appendChild(FF.ui.div('cat-tile__name', meta.name));
        tile.appendChild(FF.ui.div('cat-tile__count', t('gamesCount', '{n} games', { n: count })));
        row.appendChild(tile);
      });
      return row;
    },
    // Legacy name.
    categoryRail: function () { return this.categoryRow(); },

    gameGrid: function (games, opts) {
      var grid = FF.ui.div('game-grid');
      games.forEach(function (g) { grid.appendChild(FF.App.gameCard(g, opts)); });
      return grid;
    },

    /* ================= Library state ================= */
    resetLibrary: function () {
      this._lib = { q: '', cat: null, fav: false, players: 'any', time: 'any', diff: 'any', online: false, sort: 'recommended' };
    },

    filterCount: function () {
      var l = this._lib;
      return (l.players !== 'any' ? 1 : 0) + (l.time !== 'any' ? 1 : 0) + (l.diff !== 'any' ? 1 : 0) + (l.online ? 1 : 0);
    },

    filteredGames: function () {
      var l = this._lib;
      var q = FF.util.normalize(l.q || '');
      var roster = FF.Players.get().length;
      var list = FF.Games.all().filter(function (g) {
        if (l.cat && g.category !== l.cat) return false;
        if (l.fav && !FF.Favorites.has(g.id)) return false;
        if (l.online && !isOnlineGame(g.id)) return false;
        if (l.players === 'fits' && !(FF.Games.minPlayers(g) <= roster && FF.Games.maxPlayers(g) >= roster)) return false;
        if (l.players === 'solo' && !FF.Games.allowsSolo(g)) return false;
        if (l.players === 'group' && FF.Games.maxPlayers(g) < 5) return false;
        if (l.time === '3' && (g.duration || 5) > 3) return false;
        if (l.time === '5' && (g.duration || 5) > 5) return false;
        if (l.diff !== 'any' && String(g.difficulty || 'Normal').toLowerCase() !== l.diff) return false;
        if (q) {
          var hay = FF.util.normalize([g.name, g.description, FF.Categories.meta(g.category).name, (g.tags || []).join(' ')].join(' '));
          var words = q.split(' ').filter(Boolean);
          for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
        }
        return true;
      });
      if (l.sort === 'az') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      else if (l.sort === 'short') list.sort(function (a, b) { return (a.duration || 5) - (b.duration || 5); });
      else if (l.sort === 'recent') {
        var order = FF.Recents.get().map(function (r) { return r.id; });
        list.sort(function (a, b) {
          var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
          return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });
      } else {
        list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
      }
      return list;
    },

    openFilters: function (onChange) {
      var l = this._lib;
      var roster = FF.Players.get().length;
      var body = FF.ui.div('');
      body.appendChild(FF.UI.settingRow(t('filterPlayers', 'Players'), FF.UI.segmented({
        label: t('filterPlayers', 'Players'),
        value: l.players,
        options: [
          { label: t('any', 'Any'), value: 'any' },
          { label: t('fitsOurN', 'Fits our {n}', { n: roster }), value: 'fits' },
          { label: t('solo', 'Solo'), value: 'solo' },
          { label: t('bigGroup', '5 or more'), value: 'group' }
        ],
        onChange: function (v) { l.players = v; onChange(); }
      })));
      body.appendChild(FF.UI.settingRow(t('filterTime', 'Time'), FF.UI.segmented({
        label: t('filterTime', 'Time'),
        value: l.time,
        options: [
          { label: t('any', 'Any'), value: 'any' },
          { label: t('upToMin', 'Up to {n} min', { n: 3 }), value: '3' },
          { label: t('upToMin', 'Up to {n} min', { n: 5 }), value: '5' }
        ],
        onChange: function (v) { l.time = v; onChange(); }
      })));
      body.appendChild(FF.UI.settingRow(t('difficulty', 'Difficulty'), FF.UI.segmented({
        label: t('difficulty', 'Difficulty'),
        value: l.diff,
        options: [
          { label: t('any', 'Any'), value: 'any' },
          { label: t('easy', 'Easy'), value: 'easy' },
          { label: t('normal', 'Normal'), value: 'normal' },
          { label: t('hard', 'Hard'), value: 'hard' }
        ],
        onChange: function (v) { l.diff = v; onChange(); }
      })));
      if (onlineEnabled()) {
        body.appendChild(FF.UI.switchRow({
          label: t('onlineReady', 'Plays online'),
          description: t('onlineReadyDesc', 'Games you can play together on different devices.'),
          checked: l.online,
          onChange: function (on) { l.online = on; onChange(); }
        }));
      }
      FF.UI.sheet({
        title: t('filters', 'Filters'),
        body: body,
        actions: [
          { label: t('clearFilters', 'Clear filters'), onClick: function () { l.players = 'any'; l.time = 'any'; l.diff = 'any'; l.online = false; onChange(); } },
          { label: t('showGames', 'Show games'), primary: true }
        ]
      });
    },

    /* ================= Views ================= */
    views: {

      online: function (main) {
        // Already in a room (for example after a game ends and the shell
        // re-renders this view): go back to the lobby, not the create /
        // join chooser - otherwise the room's live listeners are dropped
        // and this device stops following the host.
        if (FF.Room && FF.Room.current()) { FF.RoomUI.showLobby(main); return; }
        FF.RoomUI.showHome(main);
      },

      home: function (main) {
        var me = FF.Auth.profile() || {};
        var hour = new Date().getHours();
        var greet = hour < 12 ? t('goodMorning', 'Good morning') : (hour < 18 ? t('goodAfternoon', 'Good afternoon') : t('goodEvening', 'Good evening'));

        if (FF.Players.isTemporary()) main.appendChild(FF.App.demoBanner());
        else if (FF.Auth.isGuest()) main.appendChild(FF.App.guestBanner());

        var top = FF.ui.div('home-top');
        var hero = FF.ui.el('section', { class: 'home-hero on-art', 'aria-labelledby': 'home-title' });
        hero.style.setProperty('--art', FF.Assets.cssUrl(window.innerWidth < 700 ? 'assets/images/ui/hero-cosmic-sm.webp' : 'assets/images/ui/hero-cosmic.webp'));
        var body = FF.ui.div('home-hero__body');
        body.appendChild(FF.ui.el('p', { class: 'home-hero__eyebrow' }, greet + (me.displayName ? ', ' + me.displayName : '')));
        body.appendChild(FF.ui.el('h1', { class: 'home-hero__title', id: 'home-title' }, t('homeTitle', 'What are we playing today?')));
        body.appendChild(FF.ui.el('p', { class: 'home-hero__sub' }, t('homeSub', 'Games for every age, solo or together. New ones added all the time.')));
        hero.appendChild(body);

        var actions = FF.ui.div('home-hero__actions');
        actions.appendChild(FF.UI.button(t('quickPlay', 'Quick play'), { class: 'btn-lg btn-primary', icon: 'play', onClick: function () { FF.App.quickPlay(); } }));
        actions.appendChild(FF.UI.button(t('gameNight', 'Game night'), { class: 'btn-glass', icon: 'trophy', onClick: function () { FF.Nav.go('gamenight'); } }));
        if (onlineEnabled()) {
          actions.appendChild(FF.UI.button(t('playOnline', 'Play online'), { class: 'btn-glass', icon: 'wifi', onClick: function () { FF.Nav.go('online'); } }));
        } else {
          actions.appendChild(FF.UI.button(t('quickRound', 'Quick round'), { class: 'btn-glass', icon: 'lightning', onClick: function () { FF.App.quickRound(); } }));
        }
        hero.appendChild(actions);
        top.appendChild(hero);
        top.appendChild(FF.App.crewCard());
        main.appendChild(top);

        // Stats dashboard, before the game rails.
        if (FF.Social) main.appendChild(FF.Social.homeCards());
        main.appendChild(FF.App.dashboard({ compact: true }));

        var allLink = FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.App.resetLibrary(); FF.Nav.go('games'); } }, t('seeAll', 'See all'));

        var recents = FF.Recents.get();
        if (recents.length) {
          var seen = {};
          var recentGames = recents.filter(function (r) {
            if (seen[r.id]) return false;
            seen[r.id] = true;
            return true;
          }).map(function (r) { return FF.Games.get(r.id); }).filter(Boolean).slice(0, 10);
          var recentRail = FF.App.rail(t('playAgain', 'Play again'), recentGames);
          if (recentRail) main.appendChild(recentRail);
        }

        var featured = FF.Games.all().filter(function (g) { return g.featured; });
        var featuredRail = FF.App.rail(t('featuredTonight', 'Featured'), featured, { feature: true, action: allLink });
        if (featuredRail) main.appendChild(featuredRail);

        main.appendChild(FF.App.sectionHead(t('browseCategories', 'Browse by category')));
        main.appendChild(FF.App.categoryRow());

        var quick = FF.Games.all().filter(function (g) { return (g.duration || 5) <= 3; }).slice(0, 10);
        var quickRail = FF.App.rail(t('quickGames', 'Quick games'), quick);
        if (quickRail) main.appendChild(quickRail);

        if (onlineEnabled()) {
          var online = onlineIds().map(FF.Games.get).filter(Boolean).slice(0, 10);
          var onlineRail = FF.App.rail(t('playOnlineRail', 'Play on different devices'), online, {
            action: FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('online'); } }, t('startRoom', 'Start a room'))
          });
          if (onlineRail) main.appendChild(onlineRail);
        }

        var favs = FF.Favorites.get().map(FF.Games.get).filter(Boolean).slice(0, 10);
        if (favs.length) {
          var favRail = FF.App.rail(t('yourFavorites', 'Your favourites'), favs, {
            onFav: function () { FF.Nav.replace('home'); }
          });
          if (favRail) main.appendChild(favRail);
        }

        var gn = FF.ui.el('button', {
          type: 'button', class: 'gamenight-promo',
          style: { '--art': FF.Assets.cssUrl('assets/images/ui/bg-islands.webp') },
          onclick: function () { FF.Nav.go('gamenight'); }
        });
        var gnIcon = FF.ui.div('gamenight-promo__icon');
        gnIcon.appendChild(icon('trophy'));
        gn.appendChild(gnIcon);
        gn.appendChild(FF.ui.div('gamenight-promo__text', [
          FF.ui.el('strong', {}, t('gameNight', 'Game night')),
          FF.ui.el('span', {}, t('gameNightPromo', 'A tournament of 3 to 10 random games. Crown the champion.'))
        ]));
        var cta = FF.ui.span('gamenight-promo__cta', t('start', 'Start'));
        cta.appendChild(icon('arrow-right'));
        gn.appendChild(cta);
        main.appendChild(gn);
        var inst = FF.App.installCard();
        if (inst) main.appendChild(inst);
      },

      games: function (main, params) {
        var l = FF.App._lib;
        if (params.category) { l.cat = params.category; }
        if (params.favorites) { l.fav = true; l.cat = null; }

        main.appendChild(FF.App.pageHead(t('navGames', 'Games'), t('libSub', 'Games for every age. Search, filter, then tap one to play.')));

        // Toolbar: search + filters
        var toolbar = FF.ui.el('div', { class: 'lib-toolbar', role: 'search' });
        var box = FF.ui.div('searchbox');
        var sIcon = FF.ui.span('searchbox__icon');
        sIcon.appendChild(icon('search'));
        box.appendChild(sIcon);
        var input = FF.ui.el('input', {
          type: 'search', class: 'input searchbox__input', id: 'lib-search',
          placeholder: t('searchPlaceholder', 'Search games'), 'aria-label': t('searchGames', 'Search games'),
          autocomplete: 'off', enterkeyhint: 'search', value: l.q || ''
        });
        box.appendChild(input);
        var clear = FF.UI.iconButton('close', t('clearSearch', 'Clear search'), function () {
          input.value = ''; l.q = ''; refresh(); input.focus();
        }, 'searchbox__clear');
        clear.hidden = !l.q;
        box.appendChild(clear);
        toolbar.appendChild(box);

        var filterBtn = FF.ui.el('button', { type: 'button', class: 'chip lib-filter-btn', 'aria-haspopup': 'dialog' });
        toolbar.appendChild(filterBtn);
        main.appendChild(toolbar);

        // Category chips
        var chips = FF.ui.el('div', { class: 'chip-row', role: 'group', 'aria-label': t('categories', 'Categories') });
        main.appendChild(chips);

        var activeRow = FF.ui.div('active-filters');
        main.appendChild(activeRow);

        var metaRow = FF.ui.div('lib-meta');
        var count = FF.ui.el('span', { 'aria-live': 'polite' });
        metaRow.appendChild(count);
        var sortLabel = FF.ui.el('label', {});
        sortLabel.appendChild(icon('sort'));
        sortLabel.appendChild(FF.ui.span('sr-only', t('sortBy', 'Sort by')));
        var sort = FF.ui.el('select', { class: 'select', 'aria-label': t('sortBy', 'Sort by') });
        [['recommended', t('sortRecommended', 'Recommended')], ['az', t('sortAZ', 'A to Z')], ['short', t('sortShortest', 'Shortest first')], ['recent', t('sortRecent', 'Recently played')]].forEach(function (o) {
          var opt = FF.ui.el('option', { value: o[0] }, o[1]);
          if (l.sort === o[0]) opt.selected = true;
          sort.appendChild(opt);
        });
        sort.addEventListener('change', function () { l.sort = sort.value; refresh(); });
        sortLabel.appendChild(sort);
        metaRow.appendChild(sortLabel);
        main.appendChild(metaRow);

        var results = FF.ui.div('lib-results');
        main.appendChild(results);

        function renderChips() {
          FF.ui.clear(chips);
          chips.appendChild(FF.UI.chip({ label: t('all', 'All'), active: !l.cat && !l.fav, onClick: function () { l.cat = null; l.fav = false; refresh(); } }));
          chips.appendChild(FF.UI.chip({ label: t('navFavorites', 'Favourites'), icon: 'star', active: l.fav, onClick: function () { l.fav = !l.fav; if (l.fav) l.cat = null; refresh(); } }));
          FF.Games.categories().forEach(function (c) {
            var m = FF.Categories.meta(c);
            chips.appendChild(FF.UI.chip({ label: m.name, icon: m.iconKey, fallback: m.icon, active: l.cat === c, onClick: function () { l.cat = l.cat === c ? null : c; l.fav = false; refresh(); } }));
          });
        }

        function renderFilterBtn() {
          FF.ui.clear(filterBtn);
          filterBtn.appendChild(icon('filter'));
          filterBtn.appendChild(FF.ui.span('chip__label', t('filters', 'Filters')));
          var n = FF.App.filterCount();
          if (n) filterBtn.appendChild(FF.ui.span('chip__count', String(n)));
          filterBtn.setAttribute('aria-label', n ? t('filtersActive', 'Filters, {n} active', { n: n }) : t('filters', 'Filters'));
        }

        function renderActive() {
          FF.ui.clear(activeRow);
          var roster = FF.Players.get().length;
          var defs = [
            ['players', { fits: t('fitsOurN', 'Fits our {n}', { n: roster }), solo: t('solo', 'Solo'), group: t('bigGroup', '5 or more') }],
            ['time', { '3': t('upToMin', 'Up to {n} min', { n: 3 }), '5': t('upToMin', 'Up to {n} min', { n: 5 }) }],
            ['diff', { easy: t('easy', 'Easy'), normal: t('normal', 'Normal'), hard: t('hard', 'Hard') }]
          ];
          defs.forEach(function (d) {
            var val = l[d[0]];
            if (val === 'any') return;
            activeRow.appendChild(FF.UI.chip({ label: d[1][val], icon: 'close', active: true, onClick: function () { l[d[0]] = 'any'; refresh(); } }));
          });
          if (l.online) activeRow.appendChild(FF.UI.chip({ label: t('onlineReady', 'Plays online'), icon: 'close', active: true, onClick: function () { l.online = false; refresh(); } }));
          activeRow.hidden = !activeRow.childNodes.length;
        }

        function refresh() {
          renderChips();
          renderFilterBtn();
          renderActive();
          clear.hidden = !l.q;
          var list = FF.App.filteredGames();
          count.textContent = t('gamesCount', '{n} games', { n: list.length });
          FF.ui.clear(results);
          if (list.length) {
            results.appendChild(FF.App.gameGrid(list, { onFav: function () { if (l.fav) refresh(); } }));
          } else {
            results.appendChild(FF.UI.emptyState({
              icon: 'search',
              title: t('noMatches', 'No games match'),
              text: l.fav && !FF.Favorites.get().length
                ? t('noFavsYet', 'Tap the star on any game to save it here.')
                : t('noMatchesText', 'Try a different word or clear some filters.'),
              action: { label: t('clearAll', 'Clear search and filters'), icon: 'close', onClick: function () { FF.App.resetLibrary(); l = FF.App._lib; input.value = ''; refresh(); } }
            }));
          }
        }

        var debounce = null;
        input.addEventListener('input', function () {
          clearTimeout(debounce);
          debounce = setTimeout(function () { l.q = input.value; refresh(); }, 120);
        });
        filterBtn.addEventListener('click', function () { FF.App.openFilters(refresh); });

        refresh();
        if (params.focusSearch) setTimeout(function () { input.focus(); }, 30);
      },

      profile: function (main, params) {
        var tab = params.tab || 'overview';
        main.appendChild(FF.App.profileHeader());
        main.appendChild(FF.App.tabs({
          label: t('profileSections', 'Profile sections'),
          value: tab,
          tabs: [
            { id: 'overview', label: t('overview', 'Overview'), icon: 'trophy' },
            { id: 'players', label: t('navPlayers', 'Players'), icon: 'users' },
            { id: 'teams', label: t('teams', 'Teams'), icon: 'shield' }
          ],
          onChange: function (v) { FF.Nav.replace('profile', { tab: v }); }
        }));
        var panel = FF.ui.el('div', { class: 'tabpanel', role: 'tabpanel', id: 'tabpanel-' + tab, 'aria-labelledby': 'tab-' + tab });
        main.appendChild(panel);
        if (tab === 'teams') FF.App.renderTeams(panel);
        else if (tab === 'players') FF.App.renderPlayers(panel);
        else FF.App.renderOverview(panel);
      },

      gamenight: function (main) {
        main.appendChild(FF.App.pageBanner(t('gameNight', 'Game night'), t('gameNightLead', 'A tournament of random games. Points carry over, and the top scorer is crowned champion.'), FF.Assets.artUrl('ui', 'gamenight')));

        var cfg = { rounds: 5, difficulty: FF.Settings.get('difficulty'), timer: FF.Settings.get('timer') };
        var box = FF.ui.el('section', { class: 'settings-section' });
        box.appendChild(FF.UI.settingRow(t('rounds', 'Rounds'), FF.UI.segmented({
          label: t('rounds', 'Rounds'), value: cfg.rounds,
          options: [{ label: '3', value: 3 }, { label: '5', value: 5 }, { label: '10', value: 10 }],
          onChange: function (v) { cfg.rounds = v; summary(); }
        })));
        box.appendChild(FF.UI.settingRow(t('difficulty', 'Difficulty'), FF.UI.segmented({
          label: t('difficulty', 'Difficulty'), value: cfg.difficulty,
          options: [{ label: t('easy', 'Easy'), value: 'easy' }, { label: t('normal', 'Normal'), value: 'normal' }, { label: t('hard', 'Hard'), value: 'hard' }],
          onChange: function (v) { cfg.difficulty = v; }
        })));
        box.appendChild(FF.UI.settingRow(t('roundTimer', 'Timer for each round'), FF.SettingsUI.duration(cfg.timer, function (s) { cfg.timer = s; }, { allowOff: true })));
        main.appendChild(box);

        var players = FF.Players.get();
        var who = FF.ui.div('details__roster-summary');
        who.appendChild(FF.App.avatarStack(players, 8));
        var whoText = FF.ui.span('details__note');
        who.appendChild(whoText);
        who.appendChild(FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('profile', { tab: 'players' }); } }, t('editPlayers', 'Edit players')));
        main.appendChild(who);
        function summary() {
          whoText.textContent = t('gnSummary', '{p} will play {r} random games.', { p: players.length === 1 ? t('onePlayer', '1 player') : t('playersCount', '{n} players', { n: players.length }), r: cfg.rounds });
        }
        summary();

        var start = FF.UI.button(t('startGameNight', 'Start game night'), { class: 'btn-lg btn-primary', icon: 'play', onClick: function () { FF.Audio.play('roundStart'); FF.GameNight.start(cfg); } });
        start.style.marginTop = 'var(--sp-5)';
        main.appendChild(start);
      },

      settings: function (main, params) {
        var tab = params.tab || FF.Storage.get('lastTab', 'account') || 'account';
        main.appendChild(FF.App.pageHead(t('navSettings', 'Settings')));
        main.appendChild(FF.App.tabs({
          label: t('settingsSections', 'Settings sections'),
          value: tab,
          scroll: true,
          tabs: [
            { id: 'account', label: t('account', 'Account'), icon: 'user' },
            { id: 'appearance', label: t('appearance', 'Appearance'), icon: 'palette' },
            { id: 'sound', label: t('sound', 'Sound'), icon: 'speaker' },
            { id: 'gameplay', label: t('gameplay', 'Gameplay'), icon: 'game-controller' },
            { id: 'privacy', label: t('privacyData', 'Privacy and data'), icon: 'shield' },
            { id: 'about', label: t('about', 'About'), icon: 'info' }
          ],
          onChange: function (v) { FF.Storage.set('lastTab', v); FF.Nav.replace('settings', { tab: v }); }
        }));
        var panel = FF.ui.el('div', { class: 'tabpanel', role: 'tabpanel', id: 'tabpanel-' + tab, 'aria-labelledby': 'tab-' + tab });
        main.appendChild(panel);
        var builder = FF.App.settingsTabs[tab] || FF.App.settingsTabs.account;
        builder(panel);
      },

      credits: function (main) {
        main.appendChild(FF.App.pageHead(t('credits', 'Credits'), t('creditsSub', 'Everything bundled with PlayMona and where it comes from.')));
        var box = FF.ui.div('panel');
        [
          ['Brand and characters', 'The PlayMona logo, character avatars and background artwork were made for PlayMona.'],
          ['Original assets', 'Illustrations, flag artwork, sound effects and music are original creations made for this project.'],
          ['Fonts', 'Nunito, Fredoka, Baloo 2, Quicksand and Atkinson Hyperlegible are bundled in assets/fonts/ under the SIL Open Font License.'],
          ['Icons', 'Interface icons are hand-drawn for PlayMona. The optional Bold style uses Phosphor Icons (MIT license), bundled in assets/icons/phosphor/.'],
          ['Word list', 'Word games use a bundled list of common English words (google-10000-english-usa-no-swears, MIT license) plus everyday words.'],
          ['Photographs', 'Real-world photos for the Guess games can be added to assets/images/. See the README "Image Download List" for public-domain sources and attribution.']
        ].forEach(function (row) {
          box.appendChild(FF.ui.el('h2', { class: 'panel__heading' }, row[0]));
          box.appendChild(FF.ui.el('p', {}, row[1]));
        });
        main.appendChild(box);
      },

      about: function (main) {
        main.appendChild(FF.App.pageHead(t('about', 'About')));
        main.appendChild(FF.App.aboutCard());
      }
    },

    /* ================= Settings tabs ================= */
    settingsTabs: {
      account: function (panel) {
        if (FF.Auth.isGuest()) { FF.App.guestAccount(panel); return; }
        var p = FF.Auth.profile() || {};
        var card = FF.ui.el('section', { class: 'settings-section account-card' });
        var head = FF.ui.div('account-card__head');
        head.appendChild(FF.Avatars.img(p.avatar, 'account-card__ava'));
        var who = FF.ui.div('account-card__who');
        who.appendChild(FF.ui.el('strong', { class: 'account-card__name' }, p.displayName || ''));
        who.appendChild(FF.ui.span('account-card__user', '@' + (p.username || '')));
        if (p.email) who.appendChild(FF.ui.span('account-card__email', p.email));
        head.appendChild(who);
        card.appendChild(head);
        var acts = FF.ui.div('btn-stack');
        acts.appendChild(FF.UI.button(t('editProfile', 'Edit profile'), { icon: 'pencil', onClick: function () { FF.App.editProfile(); } }));
        if (!FF.Auth.isLocal() && p.provider === 'password') {
          acts.appendChild(FF.UI.button(t('changePassword', 'Change password'), { icon: 'shield', onClick: function () {
            FF.Auth.resetPassword(p.email).then(function () {
              FF.UI.toast(t('passwordEmailSent', 'We emailed you a link to choose a new password.'), { type: 'success' });
            }).catch(function (e) { FF.UI.toast(e.message, { type: 'error' }); });
          } }));
        }
        acts.appendChild(FF.UI.button(t('signOut', 'Sign out'), { class: 'btn-ghost', icon: 'arrow-right', onClick: function () { FF.App.confirmSignOut(); } }));
        card.appendChild(acts);
        panel.appendChild(card);

        var sync = FF.ui.div('about-privacy');
        sync.appendChild(icon(FF.Auth.isLocal() ? 'monitor' : 'wifi'));
        sync.appendChild(FF.ui.el('div', {}, [
          FF.ui.el('strong', {}, FF.Auth.isLocal() ? t('onThisDevice', 'Saved on this device') : t('syncedTitle', 'Synced to your account')),
          FF.ui.el('p', { class: 'setting__desc' }, FF.Auth.isLocal()
            ? t('localDesc', 'This account lives on this device only. Your players and stats do not move to other devices.')
            : t('syncedDesc', 'Your players, stats, favourites and game settings follow you to any device you sign in on. Photos stay on the device that took them.'))
        ]));
        panel.appendChild(sync);

        FF.App.settingsSection(panel, 'alert', t('dangerZone', 'Danger zone'), [
          FF.UI.settingRow(t('deleteAccount', 'Delete account'),
            FF.UI.button(t('deleteAccountBtn', 'Delete my account'), { class: 'btn-danger', icon: 'trash', onClick: function () { FF.App.confirmDeleteAccount(); } }),
            t('deleteAccountDesc', 'Permanently removes your account, profile, players and stats. This cannot be undone.'))
        ], 'settings-section--danger');
      },

      appearance: function (panel) {
        var accent = FF.ui.el('div', { class: 'accent-picker', role: 'radiogroup', 'aria-label': t('accentColour', 'Accent colour') });
        FF.Theme.accents.forEach(function (a) {
          var on = FF.Theme.getAccent() === a.id;
          var b = FF.ui.el('button', {
            type: 'button', class: 'accent-swatch' + (on ? ' active' : ''), role: 'radio',
            'aria-checked': on ? 'true' : 'false', 'aria-label': a.name, title: a.name,
            style: { background: a.color },
            onclick: function () { FF.Theme.setAccent(a.id); FF.Nav.replace('settings', { tab: 'appearance' }); }
          });
          if (on) b.appendChild(icon('check'));
          accent.appendChild(b);
        });
        FF.App.settingsSection(panel, 'palette', t('lookAndFeel', 'Look and feel'), [
          FF.UI.settingRow(t('theme', 'Theme'), FF.UI.segmented({
            label: t('theme', 'Theme'), value: FF.Theme.getTheme(),
            options: [
              { label: t('themeLight', 'Light'), value: 'light', icon: 'sun' },
              { label: t('themeDark', 'Dark'), value: 'dark', icon: 'moon' },
              { label: t('themeSystem', 'Automatic'), value: 'system', icon: 'monitor' }
            ],
            onChange: function (v) { FF.Theme.setTheme(v); }
          })),
          FF.UI.settingRow(t('accentColour', 'Accent colour'), accent),
          FF.UI.switchRow({
            label: t('categoryColours', 'Colour-code categories'),
            description: t('categoryColoursDesc', 'Each kind of game keeps its own colour, which helps younger players find them.'),
            checked: FF.Theme.getMixAccents(),
            onChange: function (on) { FF.Theme.setMixAccents(on); }
          })
        ]);
        FF.App.settingsSection(panel, 'text-size', t('reading', 'Reading and motion'), [
          FF.UI.settingRow(t('textSize', 'Text size'), FF.UI.segmented({
            label: t('textSize', 'Text size'), value: FF.Theme.getTextSize(),
            options: FF.Theme.textSizes.map(function (s) { return { label: t('textSize_' + s.id, s.name), value: s.id }; }),
            onChange: function (v) { FF.Theme.setTextSize(v); }
          })),
          FF.UI.settingRow(t('font', 'Font'), FF.UI.segmented({
            label: t('font', 'Font'), value: FF.Theme.getFont(),
            options: FF.Theme.fonts.map(function (f) { return { label: t('font_' + f.id, f.name), value: f.id }; }),
            onChange: function (v) { FF.Theme.setFont(v); }
          }), t('fontDesc', 'Easy-read uses Atkinson Hyperlegible, designed for low vision.')),
          FF.UI.switchRow({
            label: t('reduceMotion', 'Reduce motion'),
            description: t('reduceMotionDesc', 'Turns off animations and moving effects.'),
            checked: !!FF.Settings.get('reduceMotion'),
            onChange: function (on) { FF.Settings.set('reduceMotion', on); FF.Theme.apply(); }
          }),
          FF.UI.switchRow({
            label: t('celebrations', 'Confetti and celebrations'),
            checked: !!FF.Settings.get('animations'),
            onChange: function (on) { FF.Settings.set('animations', on); }
          })
        ]);
        var langNote = FF.ui.el('p', { class: 'setting__desc settings-note' }, t('langBetaNote', 'Menus are translated. Game questions and words are in English for now.'));
        FF.App.settingsSection(panel, 'globe', t('language', 'Language'), [FF.App.languageControl(), langNote]);
        FF.App.settingsSection(panel, 'sliders', t('icons', 'Icons'), [
          FF.UI.settingRow(t('iconStyle', 'Icon style'), FF.UI.segmented({
            label: t('iconStyle', 'Icon style'), value: FF.Icons.getStyle(),
            options: [{ label: t('iconsHand', 'Hand-drawn'), value: 'custom' }, { label: t('iconsBold', 'Bold'), value: 'phosphor' }],
            onChange: function (v) { FF.Icons.setStyle(v); FF.App.buildShell(); FF.Nav.replace('settings', { tab: 'appearance' }); }
          }))
        ]);
      },

      sound: function (panel) {
        var vol = FF.ui.el('input', { type: 'range', min: 0, max: 100, value: Math.round(FF.Audio.volume * 100), 'aria-label': t('volume', 'Volume'),
          oninput: function (e) { FF.Audio.setVolume(e.target.value / 100); FF.Settings.set('volume', FF.Audio.volume); } });
        FF.App.settingsSection(panel, 'speaker', t('sound', 'Sound'), [
          FF.UI.switchRow({ label: t('soundEffects', 'Sound effects'), checked: !!FF.Settings.get('sound'), onChange: function (on) { FF.Audio.setEffects(on); FF.Settings.set('sound', on); } }),
          FF.UI.switchRow({ label: t('music', 'Music'), checked: !!FF.Settings.get('music'), onChange: function (on) { FF.Audio.setMusic(on); FF.Settings.set('music', on); } }),
          FF.UI.settingRow(t('volume', 'Volume'), vol)
        ]);
      },

      gameplay: function (panel) {
        FF.App.settingsSection(panel, 'game-controller', t('gameplay', 'Gameplay'), [
          FF.UI.settingRow(t('defaultDifficulty', 'Default difficulty'), FF.UI.segmented({
            label: t('defaultDifficulty', 'Default difficulty'), value: FF.Settings.get('difficulty'),
            options: [{ label: t('easy', 'Easy'), value: 'easy' }, { label: t('normal', 'Normal'), value: 'normal' }, { label: t('hard', 'Hard'), value: 'hard' }],
            onChange: function (v) { FF.Settings.set('difficulty', v); }
          })),
          FF.UI.settingRow(t('defaultTimer', 'Time limit per turn'), FF.SettingsUI.duration(FF.Settings.get('timer'), function (s) { FF.Settings.set('timer', s); }, { allowOff: true })),
          FF.UI.settingRow(t('tvTimer', 'TV display timer'), FF.SettingsUI.duration(FF.Settings.get('displaySeconds') || 60, function (s) { FF.Settings.set('displaySeconds', s); })),
          FF.UI.switchRow({ label: t('randomOrder', 'Random player order'), checked: !!FF.Settings.get('randomOrder'), onChange: function (on) { FF.Settings.set('randomOrder', on); } }),
          FF.UI.switchRow({ label: t('randomQuestions', 'Shuffle questions'), checked: !!FF.Settings.get('randomQuestions'), onChange: function (on) { FF.Settings.set('randomQuestions', on); } })
        ]);
        FF.App.settingsSection(panel, 'dice', t('tryItOut', 'Try it out'), [
          FF.UI.settingRow(t('demoMode', 'Sample players'),
            FF.UI.button(FF.Players.isTemporary() ? t('endDemo', 'End sample players') : t('runDemo', 'Play with 4 sample players'), {
              icon: 'dice',
              onClick: function () { if (FF.Players.isTemporary()) FF.App.endDemo(); else FF.App.demo(); }
            }),
            t('demoDesc', 'Try a game with four sample players. Your saved players are not changed.'))
        ]);
      },

      privacy: function (panel) {
        var privacy = FF.ui.div('about-privacy');
        privacy.appendChild(icon('shield'));
        privacy.appendChild(FF.ui.el('div', {}, [
          FF.ui.el('strong', {}, t('privacyTitle', 'Your data, kept simple')),
          FF.ui.el('p', { class: 'setting__desc' }, (FF.Auth.isLocal() || FF.Auth.isGuest())
            ? t('privacyBodyLocal', 'No ads and no tracking. Everything is saved on this device. Online rooms share only your display name and character, and only while you are in a room.')
            : t('privacyBodyCloud', 'No ads and no tracking. Your account keeps your profile, players, stats and settings so they follow you between devices. Photos never leave the device that took them. Online rooms share only your display name and character.'))
        ]));
        panel.appendChild(privacy);
        var link = FF.ui.el('a', { class: 'link-btn', href: FF.page('privacy'), target: '_blank', rel: 'noopener' }, t('readPrivacy', 'Read the privacy notice'));
        panel.appendChild(link);
        FF.App.settingsSection(panel, 'stack', t('yourData', 'Your data'), [
          FF.UI.settingRow(t('clearFavorites', 'Clear favourites'), FF.UI.button(t('clear', 'Clear'), { icon: 'star', onClick: function () { FF.Favorites.clear(); FF.UI.toast(t('favoritesCleared', 'Favourites cleared')); } })),
          FF.UI.settingRow(t('clearRecents', 'Clear recently played'), FF.UI.button(t('clear', 'Clear'), { icon: 'clock', onClick: function () { FF.Recents.clear(); FF.UI.toast(t('recentsCleared', 'Recently played cleared')); } })),
          FF.UI.settingRow(t('resetAll', 'Reset stats and players'),
            FF.UI.button(t('resetAllBtn', 'Reset'), { class: 'btn-danger', icon: 'trash', onClick: function () { FF.App.confirmReset(); } }),
            t('resetDesc', 'Clears your saved players, teams, favourites and stats. Your account stays.'))
        ]);
      },

      about: function (panel) {
        panel.appendChild(FF.App.aboutCard());
        if (FF.Install && FF.Install.available()) {
          FF.App.settingsSection(panel, 'download', t('installApp', 'Install the app'), [
            FF.UI.settingRow(t('installPlayMona', 'Install PlayMona'),
              FF.UI.button(t('install', 'Install'), { class: 'btn-primary', icon: 'download', onClick: function () { FF.App.install(); } }),
              t('installDesc', 'Opens full screen from your home screen and works offline.'))
          ]);
        }
        var info = FF.ui.div('btn-stack');
        info.appendChild(FF.UI.button(t('credits', 'Credits'), { class: 'btn-ghost', icon: 'info', onClick: function () { FF.Nav.go('credits'); } }));
        info.appendChild(FF.ui.el('a', { class: 'btn btn-ghost', href: FF.page('privacy'), target: '_blank', rel: 'noopener' }, t('privacyNotice', 'Privacy notice')));
        panel.appendChild(info);
      }
    },

    settingsSection: function (panel, iconKey, title, children, cls) {
      panel.appendChild(FF.App.iconHeading(iconKey, title));
      var s = FF.ui.el('section', { class: 'settings-section' + (cls ? ' ' + cls : '') });
      children.forEach(function (c) { if (c) s.appendChild(c); });
      panel.appendChild(s);
      return s;
    },

    aboutCard: function () {
      var box = FF.ui.div('panel panel--center about-card');
      box.appendChild(FF.Brand.logo('brand-logo brand-logo--hero', true));
      box.appendChild(FF.AuthUI.wordmark('wordmark--lg'));
      box.appendChild(FF.ui.el('p', { class: 'about-card__tag' }, t('tagline', FF.Brand.tagline)));
      box.appendChild(FF.ui.el('p', {}, t('aboutBody', 'Quizzes, word games, party games and more for one player or a whole room. Play on one screen, on the TV, or on everyone’s phones, online or offline.')));
      box.appendChild(FF.ui.el('p', { class: 'about-ver' }, t('version', 'Version {v}', { v: VERSION }) + ' · playmona.com'));
      return box;
    },

    // Accessible tab bar (role=tablist, arrow keys). opts: { label, value, tabs:[{id,label,icon}], onChange, scroll }
    tabs: function (opts) {
      var bar = FF.ui.el('div', { class: 'tabs' + (opts.scroll ? ' tabs--scroll' : ''), role: 'tablist', 'aria-label': opts.label });
      var buttons = [];
      opts.tabs.forEach(function (tb) {
        var on = tb.id === opts.value;
        var b = FF.ui.el('button', {
          type: 'button', class: 'tabs__tab' + (on ? ' active' : ''), role: 'tab', id: 'tab-' + tb.id,
          'aria-selected': on ? 'true' : 'false', 'aria-controls': 'tabpanel-' + tb.id, tabindex: on ? 0 : -1
        });
        if (tb.icon) b.appendChild(icon(tb.icon));
        b.appendChild(FF.ui.span('', tb.label));
        b.addEventListener('click', function () { if (!on) opts.onChange(tb.id); });
        buttons.push(b);
        bar.appendChild(b);
      });
      bar.addEventListener('keydown', function (e) {
        var i = buttons.indexOf(document.activeElement);
        if (i === -1) return;
        var n = null;
        if (e.key === 'ArrowRight') n = (i + 1) % buttons.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + buttons.length) % buttons.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = buttons.length - 1;
        if (n == null) return;
        e.preventDefault();
        opts.onChange(opts.tabs[n].id);
        setTimeout(function () { var el = document.getElementById('tab-' + opts.tabs[n].id); if (el) el.focus(); }, 0);
      });
      // Keep the chosen tab in view on narrow screens.
      setTimeout(function () {
        var act = bar.querySelector('.active');
        if (act && act.scrollIntoView && opts.scroll) { try { act.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} }
      }, 0);
      return bar;
    },

    /* ================= Who's playing ================= */
    /* The saved roster as tappable avatars: tap to bring someone in or
       let them sit out. Nobody is deleted to play solo. */
    crewCard: function (opts) {
      opts = opts || {};
      var changed = function () { if (opts.onChange) opts.onChange(); else FF.App.refreshCrew(); };
      var all = FF.Players.all();
      var temp = FF.Players.isTemporary();
      var playing = FF.Players.get();
      var card = FF.ui.el('section', { class: 'crew' + (opts.embedded ? ' crew--embedded' : ''), 'aria-labelledby': 'crew-title' });
      var head = FF.ui.div('crew__head');
      head.appendChild(FF.ui.el('h2', { class: 'crew__title', id: 'crew-title' }, t('whosPlaying', 'Who’s playing')));
      head.appendChild(FF.ui.span('crew__count', playing.length === 1
        ? t('soloNow', 'Solo')
        : t('nPlaying', '{n} playing', { n: playing.length })));
      card.appendChild(head);

      var list = FF.ui.el('div', { class: 'crew__list', role: 'group', 'aria-label': t('tapToToggle', 'Tap someone to bring them in or let them sit out') });
      (temp ? playing : all).forEach(function (p) {
        var inGame = temp || p.active;
        var b = FF.ui.el('button', {
          type: 'button', class: 'crew__member' + (inGame ? ' is-in' : ''),
          'aria-pressed': inGame ? 'true' : 'false',
          'aria-label': p.name + (p.isMe ? ' (' + t('you', 'You') + ')' : '') + ', ' + (inGame ? t('isPlaying', 'playing') : t('sittingOut', 'sitting out')),
          disabled: temp
        });
        var ava = FF.ui.span('crew__ava');
        ava.appendChild(FF.Players.avatarEl(p, 'crew__img'));
        var badge = FF.ui.span('crew__badge');
        badge.appendChild(icon(inGame ? 'check' : 'plus'));
        ava.appendChild(badge);
        b.appendChild(ava);
        b.appendChild(FF.ui.span('crew__name', p.isMe ? t('you', 'You') : p.name));
        b.addEventListener('click', function () {
          var before = FF.Players.get().length;
          FF.Players.setActive(p.id, !p.active);
          if (p.active && before <= 1) FF.UI.toast(t('keepOneIn', 'At least one player stays in the game.'));
          FF.Audio.play('click');
          changed();
        });
        list.appendChild(b);
      });
      if (!temp && all.length < FF.Players.MAX_SAVED) {
        var add = FF.ui.el('button', { type: 'button', class: 'crew__member crew__add', 'aria-label': t('addPlayer', 'Add player') });
        var addAva = FF.ui.span('crew__ava crew__ava--add');
        addAva.appendChild(icon('plus'));
        add.appendChild(addAva);
        add.appendChild(FF.ui.span('crew__name', t('add', 'Add')));
        add.addEventListener('click', function () { FF.App.quickAddPlayer(opts.onChange); });
        list.appendChild(add);
      }
      card.appendChild(list);

      var acts = FF.ui.div('crew__actions');
      if (!temp) {
        var me = FF.Players.me();
        if (me && !(playing.length === 1 && playing[0].isMe)) {
          acts.appendChild(FF.UI.button(t('justMe', 'Just me'), { class: 'btn-sm', icon: 'user', onClick: function () { FF.Players.only(me.id); changed(); } }));
        }
        if (!opts.embedded) acts.appendChild(FF.UI.button(t('managePlayers', 'Manage players'), { class: 'btn-sm btn-ghost', icon: 'sliders', onClick: function () { FF.Nav.go('profile', { tab: 'players' }); } }));
      }
      card.appendChild(acts);
      return card;
    },

    refreshCrew: function () {
      var old = document.querySelector('.crew');
      if (old) {
        var fresh = FF.App.crewCard();
        old.parentNode.replaceChild(fresh, old);
        var region = document.getElementById('ff-live');
        if (region) FF.UI.announce(FF.Players.get().map(function (p) { return p.isMe ? t('you', 'You') : p.name; }).join(', '));
      }
    },

    // Add a player from the home screen: name + character in one sheet.
    quickAddPlayer: function (onDone) {
      var body = FF.ui.div('');
      var nameId = FF.UI.uid('name');
      body.appendChild(FF.ui.el('label', { class: 'field__label', for: nameId }, t('playerName', 'Player name')));
      var input = FF.ui.el('input', { id: nameId, type: 'text', class: 'input', maxlength: 24, autocomplete: 'off', placeholder: t('namePlaceholder', 'Name') });
      body.appendChild(input);
      var chosen = FF.Avatars.random(FF.Players.all().map(function (p) { return p.avatar; }));
      var grid = FF.ui.el('div', { class: 'avatar-grid avatar-grid--compact', role: 'radiogroup', 'aria-label': t('characters', 'Characters') });
      FF.Avatars.all().forEach(function (a) {
        var on = a.id === chosen;
        var b = FF.ui.el('button', { type: 'button', class: 'avatar-btn' + (on ? ' active' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false', 'aria-label': a.name, dataset: { avatar: a.id } });
        b.appendChild(FF.Avatars.img(a.id, 'avatar-btn__img'));
        b.addEventListener('click', function () {
          chosen = a.id;
          FF.ui.$$('.avatar-btn', grid).forEach(function (x) { var s = x.dataset.avatar === a.id; x.classList.toggle('active', s); x.setAttribute('aria-checked', s ? 'true' : 'false'); });
        });
        grid.appendChild(b);
      });
      body.appendChild(grid);
      var sheet = FF.UI.sheet({
        title: t('addPlayer', 'Add player'),
        body: body,
        wide: true,
        actions: [
          { label: t('cancel', 'Cancel') },
          { label: t('addAndPlay', 'Add to the game'), primary: true, icon: 'plus', onClick: function () {
            FF.Players.add(input.value, chosen);
            FF.Audio.play('select');
            if (onDone) onDone(); else FF.App.refreshCrew();
          } }
        ]
      });
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      return sheet;
    },

    // Install PlayMona as an app (browser prompt, or steps on iPhone/iPad).
    install: function () {
      if (!FF.Install) return;
      if (FF.Install.kind() === 'ios') {
        FF.UI.dialog({
          title: t('installApp', 'Install the app'),
          body: FF.ui.el('ol', { class: 'install-steps' }, [
            FF.ui.el('li', {}, t('iosStep1', 'Tap the Share button in Safari.')),
            FF.ui.el('li', {}, t('iosStep2', 'Choose Add to Home Screen.')),
            FF.ui.el('li', {}, t('iosStep3', 'Tap Add. PlayMona appears with your other apps.'))
          ]),
          actions: [{ label: t('gotIt', 'Got it'), primary: true }]
        });
        return;
      }
      FF.Install.prompt().then(function (outcome) {
        if (outcome === 'accepted') FF.UI.toast(t('installed', 'PlayMona is installing'), { type: 'success' });
        var card = document.getElementById('install-card');
        if (card && !FF.Install.available()) card.parentNode.removeChild(card);
      });
    },

    // A card at the bottom of Home offering to install the app.
    installCard: function () {
      if (!FF.Install || !FF.Install.available() || FF.Install.dismissed()) return null;
      var card = FF.ui.el('section', { class: 'install-card', id: 'install-card', 'aria-labelledby': 'install-card-title' });
      card.appendChild(FF.ui.el('img', { class: 'install-card__icon', src: 'assets/brand/icon-192.png', alt: '', width: 56, height: 56 }));
      card.appendChild(FF.ui.div('install-card__text', [
        FF.ui.el('strong', { id: 'install-card-title' }, t('installTitle', 'Get the PlayMona app')),
        FF.ui.el('span', {}, FF.Install.kind() === 'ios'
          ? t('installIosSub', 'Add it to your home screen from Safari’s Share menu.')
          : t('installSub', 'Opens full screen and works offline. Free, no app store needed.'))
      ]));
      card.appendChild(FF.UI.button(FF.Install.kind() === 'ios' ? t('showMe', 'Show me how') : t('install', 'Install'), { class: 'btn-primary', icon: 'download', onClick: function () { FF.App.install(); } }));
      card.appendChild(FF.UI.iconButton('close', t('notNow', 'Not now'), function () {
        FF.Install.dismiss();
        if (card.parentNode) card.parentNode.removeChild(card);
      }, 'install-card__close icon-btn--ghost'));
      return card;
    },

    // A message from the admin portal (Site > Announcement).
    announcement: function (text) {
      var b = FF.ui.el('div', { class: 'notice notice--info notice--announce', role: 'status' });
      b.appendChild(icon('megaphone'));
      b.appendChild(FF.ui.span('notice__text', text));
      return b;
    },

    // Shown in place of every screen while the admin portal has maintenance on.
    maintenancePanel: function () {
      var box = FF.ui.el('section', { class: 'locked-panel' });
      var ic = FF.ui.span('locked-panel__icon');
      ic.appendChild(icon('gear'));
      box.appendChild(ic);
      box.appendChild(FF.ui.el('h1', { class: 'page-title' }, t('maintenanceTitle', 'Back in a moment')));
      box.appendChild(FF.ui.el('p', { class: 'page-sub' }, t('maintenanceBody', 'PlayMona is getting an upgrade. Please check back shortly.')));
      box.appendChild(FF.UI.button(t('tryAgain', 'Try again'), { class: 'btn-lg btn-primary', icon: 'arrow-right', onClick: function () {
        FF.GameConfig.load().then(function () { FF.App.render(FF.App._currentView || 'home', FF.App._currentParams || {}); });
      } }));
      return box;
    },

    // Guests: one tap to an account that keeps their progress.
    guestBanner: function () {
      var b = FF.ui.el('div', { class: 'notice notice--info', role: 'status' });
      b.appendChild(icon('user'));
      b.appendChild(FF.ui.span('notice__text', t('guestNotice', 'You are playing as a guest. Create a free account to keep your progress on every device.')));
      b.appendChild(FF.UI.button(t('createAccount', 'Create account'), { class: 'btn-sm btn-primary', onClick: function () { FF.App.openAccount('signup'); } }));
      return b;
    },

    // Show the sign-in screens over the app (guests upgrading).
    openAccount: function (view) {
      if (FF.GameFlow && FF.GameFlow.current) FF.GameFlow.close('home');
      FF.AuthUI.show(view || 'signup');
      window.scrollTo(0, 0);
    },

    // Settings > Account while playing as a guest.
    guestAccount: function (panel) {
      var p = FF.Auth.profile() || {};
      var card = FF.ui.el('section', { class: 'settings-section account-card' });
      var head = FF.ui.div('account-card__head');
      head.appendChild(FF.Avatars.img(p.avatar, 'account-card__ava'));
      var who = FF.ui.div('account-card__who');
      who.appendChild(FF.ui.el('strong', { class: 'account-card__name' }, p.displayName || t('guest', 'Guest')));
      who.appendChild(FF.ui.span('account-card__user', t('playingAsGuest', 'Playing as a guest')));
      head.appendChild(who);
      card.appendChild(head);
      var acts = FF.ui.div('btn-stack');
      acts.appendChild(FF.UI.button(t('createAccount', 'Create account'), { class: 'btn-primary', icon: 'user', onClick: function () { FF.App.openAccount('signup'); } }));
      acts.appendChild(FF.UI.button(t('signIn', 'Sign in'), { icon: 'arrow-right', onClick: function () { FF.App.openAccount('signin'); } }));
      acts.appendChild(FF.UI.button(t('editProfile', 'Edit profile'), { class: 'btn-ghost', icon: 'pencil', onClick: function () { FF.App.editProfile(); } }));
      card.appendChild(acts);
      panel.appendChild(card);

      var info = FF.ui.div('about-privacy');
      info.appendChild(icon('monitor'));
      info.appendChild(FF.ui.el('div', {}, [
        FF.ui.el('strong', {}, t('guestSavedTitle', 'Saved on this device')),
        FF.ui.el('p', { class: 'setting__desc' }, t('guestSavedDesc', 'As a guest, your players and stats stay in this browser. Create an account and they come with you, to every device.'))
      ]));
      panel.appendChild(info);
      FF.App.settingsSection(panel, 'arrow-right', t('guestLeave', 'Guest play'), [
        FF.UI.settingRow(t('leaveGuest', 'Stop guest play'),
          FF.UI.button(t('leaveGuestBtn', 'Stop'), { class: 'btn-ghost', icon: 'arrow-right', onClick: function () { FF.App.confirmSignOut(); } }),
          t('leaveGuestDesc', 'Back to the sign-in screen. Your guest progress stays on this device.'))
      ]);
    },

    demoBanner: function () {
      var b = FF.ui.el('div', { class: 'notice', role: 'status' });
      b.appendChild(icon('dice'));
      b.appendChild(FF.ui.span('notice__text', t('demoOn', 'Sample players are on. Your saved players are safe.')));
      b.appendChild(FF.UI.button(t('endDemo', 'End sample players'), { class: 'btn-sm', onClick: function () { FF.App.endDemo(); } }));
      return b;
    },

    /* ================= Dashboard ================= */
    dashboard: function (opts) {
      opts = opts || {};
      var s = FF.Stats.get();
      var me = FF.Auth.profile() || {};
      var lvl = FF.Stats.level(s.xp);
      var section = FF.ui.el('section', { class: 'dash', 'aria-labelledby': 'dash-title' });
      var head = FF.ui.div('section-head');
      head.appendChild(FF.ui.el('h2', { class: 'section-title', id: 'dash-title' }, t('yourStats', 'Your stats')));
      if (opts.compact) head.appendChild(FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('profile'); } }, t('viewProfile', 'View profile')));
      section.appendChild(head);
      var grid = FF.ui.div('dash__grid');

      // Level card: avatar inside an XP ring.
      var level = FF.ui.el('article', { class: 'dash-card dash-level' });
      var ring = FF.ui.div('xp-ring');
      ring.style.setProperty('--p', Math.round(lvl.progress * 100));
      ring.setAttribute('role', 'img');
      ring.setAttribute('aria-label', t('levelProgress', 'Level {l}: {x} of {n} XP to the next level', { l: lvl.level, x: lvl.into, n: lvl.need }));
      ring.appendChild(FF.Avatars.img(me.avatar, 'xp-ring__ava'));
      ring.appendChild(FF.ui.span('xp-ring__level', String(lvl.level)));
      level.appendChild(ring);
      var lvlText = FF.ui.div('dash-level__text');
      lvlText.appendChild(FF.ui.el('span', { class: 'dash-card__label' }, t('level', 'Level')));
      lvlText.appendChild(FF.ui.el('strong', { class: 'dash-level__num' }, t('levelN', 'Level {n}', { n: lvl.level })));
      var bar = FF.ui.div('xp-bar');
      var fill = FF.ui.div('xp-bar__fill');
      fill.style.width = Math.round(lvl.progress * 100) + '%';
      bar.appendChild(fill);
      lvlText.appendChild(bar);
      lvlText.appendChild(FF.ui.el('span', { class: 'dash-card__note' }, t('xpToNext', '{x} / {n} XP to level {l}', { x: FF.util.formatNumber(lvl.into), n: FF.util.formatNumber(lvl.need), l: lvl.level + 1 })));
      var streak = FF.Stats.dayStreak();
      var chip = FF.ui.span('dash-streak' + (streak ? ' is-on' : ''));
      chip.appendChild(icon('flame'));
      chip.appendChild(document.createTextNode(streak === 1 ? t('dayStreak1', '1 day streak') : t('dayStreakN', '{n} day streak', { n: streak })));
      lvlText.appendChild(chip);
      level.appendChild(lvlText);
      grid.appendChild(level);

      // Four headline numbers.
      var acc = s.quizAnswered ? Math.round(s.quizCorrect / s.quizAnswered * 100) : null;
      [
        { key: 'played', iconKey: 'game-controller', value: FF.util.formatNumber(s.gamesPlayed), label: t('statAllTime', 'Games played'), tone: 'blue' },
        { key: 'wins', iconKey: 'trophy', value: FF.util.formatNumber(s.myWins || 0), label: t('statWins', 'Wins'), tone: 'yellow' },
        { key: 'streak', iconKey: 'flame', value: FF.util.formatNumber(s.bestStreak || 0), label: t('statStreak', 'Best answer streak'), tone: 'orange' },
        { key: 'acc', iconKey: 'target', value: acc == null ? '—' : acc + '%', label: t('statAccuracy', 'Quiz accuracy'), tone: 'green', ring: acc }
      ].forEach(function (k) {
        var c = FF.ui.el('article', { class: 'dash-card dash-kpi dash-kpi--' + k.tone });
        var ic = FF.ui.span('dash-kpi__icon');
        ic.appendChild(icon(k.iconKey));
        c.appendChild(ic);
        c.appendChild(FF.ui.el('strong', { class: 'dash-kpi__value' }, k.value));
        c.appendChild(FF.ui.el('span', { class: 'dash-card__label' }, k.label));
        grid.appendChild(c);
      });

      // This week: games per day (single series, one hue).
      var days = FF.Stats.lastDays(7);
      var weekTotal = days.reduce(function (a, d) { return a + d.count; }, 0);
      var max = Math.max(1, days.reduce(function (a, d) { return Math.max(a, d.count); }, 0));
      var week = FF.ui.el('article', { class: 'dash-card dash-week' });
      var wh = FF.ui.div('dash-card__head');
      wh.appendChild(FF.ui.el('h3', { class: 'dash-card__title' }, t('thisWeek', 'This week')));
      wh.appendChild(FF.ui.span('dash-card__note', weekTotal === 1 ? t('oneGame', '1 game') : t('gamesCount', '{n} games', { n: weekTotal })));
      week.appendChild(wh);
      var lang = FF.i18n ? FF.i18n.getLang() : 'en';
      var chart = FF.ui.el('div', { class: 'bars', 'aria-hidden': 'true' });
      var table = FF.ui.el('table', { class: 'sr-only' });
      table.appendChild(FF.ui.el('caption', {}, t('gamesPerDay', 'Games played per day this week')));
      days.forEach(function (d, i) {
        var dayName;
        try { dayName = d.date.toLocaleDateString(lang, { weekday: 'short' }); } catch (e) { dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.date.getDay()]; }
        var col = FF.ui.div('bars__col' + (i === days.length - 1 ? ' is-today' : ''));
        col.title = dayName + ': ' + d.count;
        var track = FF.ui.div('bars__track');
        var b = FF.ui.div('bars__bar' + (d.count ? '' : ' is-zero'));
        b.style.height = (d.count ? Math.max(8, Math.round(d.count / max * 100)) : 0) + '%';
        track.appendChild(b);
        if (d.count) col.appendChild(FF.ui.span('bars__val', String(d.count)));
        col.appendChild(track);
        col.appendChild(FF.ui.span('bars__day', dayName));
        chart.appendChild(col);
        var tr = FF.ui.el('tr', {});
        tr.appendChild(FF.ui.el('th', { scope: 'row' }, dayName));
        tr.appendChild(FF.ui.el('td', {}, String(d.count)));
        table.appendChild(tr);
      });
      week.appendChild(chart);
      week.appendChild(table);
      if (!weekTotal) week.appendChild(FF.ui.el('p', { class: 'dash-card__note dash-week__empty' }, t('weekEmpty', 'Play a game to start this week’s chart.')));
      grid.appendChild(week);

      // Favourite kinds of game.
      var cats = Object.keys(s.byCategory || {}).map(function (id) { return { id: id, n: s.byCategory[id] }; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 4);
      var catCard = FF.ui.el('article', { class: 'dash-card dash-cats' });
      catCard.appendChild(FF.ui.el('h3', { class: 'dash-card__title' }, t('topCategories', 'Favourite kinds')));
      if (cats.length) {
        var topN = cats[0].n;
        var ul = FF.ui.el('ul', { class: 'hbars' });
        cats.forEach(function (c) {
          var m = FF.Categories.meta(c.id);
          var li = FF.ui.el('li', { class: 'hbars__row', dataset: { cat: c.id } });
          var lab = FF.ui.span('hbars__label');
          lab.appendChild(icon(m.iconKey));
          lab.appendChild(document.createTextNode(m.name));
          li.appendChild(lab);
          var track = FF.ui.span('hbars__track');
          var fillEl = FF.ui.span('hbars__fill');
          fillEl.style.width = Math.max(6, Math.round(c.n / topN * 100)) + '%';
          track.appendChild(fillEl);
          li.appendChild(track);
          li.appendChild(FF.ui.span('hbars__val', String(c.n)));
          ul.appendChild(li);
        });
        catCard.appendChild(ul);
      } else {
        catCard.appendChild(FF.ui.el('p', { class: 'dash-card__note' }, t('catsEmpty', 'Your most-played kinds of game will show here.')));
      }
      grid.appendChild(catCard);

      // Medals.
      var unlocked = FF.Stats.ACHIEVEMENTS.filter(function (a) { return FF.Stats.isUnlocked(a.id); });
      var medals = FF.ui.el('article', { class: 'dash-card dash-medals' });
      var mh = FF.ui.div('dash-card__head');
      mh.appendChild(FF.ui.el('h3', { class: 'dash-card__title' }, t('medals', 'Medals')));
      mh.appendChild(FF.ui.span('dash-card__note', t('nOfMax', '{n} of {max}', { n: unlocked.length, max: FF.Stats.ACHIEVEMENTS.length })));
      medals.appendChild(mh);
      var row = FF.ui.el('ul', { class: 'medal-row' });
      FF.Stats.ACHIEVEMENTS.forEach(function (a) {
        var on = FF.Stats.isUnlocked(a.id);
        var li = FF.ui.el('li', { class: 'medal' + (on ? ' is-on' : ''), style: { '--medal': a.color }, title: a.name + (on ? '' : ' · ' + t('locked', 'Not yet')) });
        li.appendChild(icon(a.iconKey));
        li.appendChild(FF.ui.span('sr-only', a.name + ', ' + (on ? t('unlocked', 'Unlocked') : t('locked', 'Not yet'))));
        row.appendChild(li);
      });
      medals.appendChild(row);
      grid.appendChild(medals);

      section.appendChild(grid);
      return section;
    },

    /* ================= Profile ================= */
    profileHeader: function () {
      var p = FF.Auth.profile() || {};
      var lvl = FF.Stats.level(FF.Stats.get().xp);
      var head = FF.ui.el('section', { class: 'profile-head on-art' });
      head.style.setProperty('--art', FF.Assets.cssUrl('assets/images/ui/bg-islands.webp'));
      var ava = FF.ui.div('profile-head__ava');
      ava.appendChild(FF.Avatars.img(p.avatar, 'profile-head__img'));
      head.appendChild(ava);
      var info = FF.ui.div('profile-head__info');
      info.appendChild(FF.ui.el('h1', { class: 'profile-head__name' }, p.displayName || ''));
      info.appendChild(FF.ui.el('p', { class: 'profile-head__user' }, p.username ? '@' + p.username : t('playingAsGuest', 'Playing as a guest')));
      var chips = FF.ui.div('profile-head__chips');
      var lv = FF.ui.span('badge badge--level');
      lv.appendChild(icon('star-fill'));
      lv.appendChild(document.createTextNode(t('levelN', 'Level {n}', { n: lvl.level })));
      chips.appendChild(lv);
      info.appendChild(chips);
      head.appendChild(info);
      head.appendChild(FF.UI.button(t('editProfile', 'Edit profile'), { class: 'btn-glass profile-head__edit', icon: 'pencil', onClick: function () { FF.App.editProfile(); } }));
      return head;
    },

    renderOverview: function (panel) {
      panel.appendChild(FF.App.dashboard());
      var session = FF.App.session;
      var names = Object.keys(session.wins);
      if (names.length) {
        panel.appendChild(FF.App.sectionHead(t('sessionWinners', 'Winners today')));
        var lb = FF.ui.el('ol', { class: 'results__leaderboard' });
        names.sort(function (a, b) { return session.wins[b] - session.wins[a]; }).forEach(function (name, i) {
          var row = FF.ui.el('li', { class: 'results__row' });
          row.appendChild(FF.ui.el('span', { class: 'results__rank' }, String(i + 1)));
          row.appendChild(FF.ui.el('span', { class: 'results__name' }, name));
          var w = session.wins[name];
          row.appendChild(FF.ui.el('span', { class: 'results__pts' }, w === 1 ? t('oneWin', '1 win') : t('nWins', '{n} wins', { n: w })));
          lb.appendChild(row);
        });
        panel.appendChild(lb);
      }
      var unlocked = FF.Stats.ACHIEVEMENTS.filter(function (a) { return FF.Stats.isUnlocked(a.id); }).length;
      panel.appendChild(FF.App.sectionHead(t('medalsOf', 'Medals ({n} of {max})', { n: unlocked, max: FF.Stats.ACHIEVEMENTS.length })));
      var grid = FF.ui.el('ul', { class: 'achievement-grid' });
      FF.Stats.ACHIEVEMENTS.forEach(function (a) {
        var on = FF.Stats.isUnlocked(a.id);
        var c = FF.ui.el('li', { class: 'achievement' + (on ? ' unlocked' : ' locked'), style: { '--medal': a.color } });
        var ic = FF.ui.span('achievement__icon');
        ic.appendChild(icon(a.iconKey));
        c.appendChild(ic);
        c.appendChild(FF.ui.el('div', {}, [
          FF.ui.div('achievement__name', a.name),
          FF.ui.div('achievement__desc', a.desc),
          FF.ui.div('achievement__state', on ? t('unlocked', 'Unlocked') : t('locked', 'Not yet'))
        ]));
        grid.appendChild(c);
      });
      panel.appendChild(grid);
    },

    // Edit name, username and character.
    editProfile: function () {
      var p = FF.Auth.profile() || {};
      var chosen = p.avatar;
      var body = FF.ui.div('edit-profile');
      var pick = FF.ui.el('button', { type: 'button', class: 'edit-profile__ava', 'aria-label': t('changeCharacter', 'Change character') });
      var img = FF.Avatars.img(chosen, 'edit-profile__img');
      pick.appendChild(img);
      var badge = FF.ui.span('edit-profile__badge');
      badge.appendChild(icon('pencil'));
      pick.appendChild(badge);
      body.appendChild(pick);
      function field(label, value, max, hint) {
        var id = FF.UI.uid('f');
        var wrap = FF.ui.div('field');
        wrap.appendChild(FF.ui.el('label', { class: 'field__label', for: id }, label));
        var input = FF.ui.el('input', { id: id, type: 'text', class: 'input field__input', value: value || '', maxlength: max, autocomplete: 'off', spellcheck: 'false' });
        wrap.appendChild(input);
        if (hint) wrap.appendChild(FF.ui.el('p', { class: 'field__hint' }, hint));
        var err = FF.ui.el('p', { class: 'field__error', 'aria-live': 'polite' });
        wrap.appendChild(err);
        body.appendChild(wrap);
        return { input: input, error: function (m) { err.textContent = m || ''; input.setAttribute('aria-invalid', m ? 'true' : 'false'); } };
      }
      var name = field(t('displayName', 'Display name'), p.displayName, 24);
      var isGuest = FF.Auth.isGuest();
      var user = isGuest ? null : field(t('username', 'Username'), p.username, 20, t('usernameHint', '3 to 20 letters, numbers, dots or underscores. Shown to other players.'));
      pick.addEventListener('click', function () {
        FF.Players.pickLook(null, { kind: 'profile', current: chosen, name: name.input.value, onDone: function (aid) {
          if (aid) { chosen = aid; img.src = FF.Avatars.url(aid); }
        } });
      });
      FF.UI.sheet({
        title: t('editProfile', 'Edit profile'),
        body: body,
        actions: [
          { label: t('cancel', 'Cancel') },
          { label: t('save', 'Save'), primary: true, keepOpen: true, onClick: function (api) {
            name.error(''); if (user) user.error('');
            if (!name.input.value.trim()) { name.error(t('enterName', 'Enter a name.')); return; }
            var problem = user ? FF.Auth.usernameError(user.input.value) : null;
            if (problem) { user.error(problem); return; }
            (user ? FF.Auth.usernameAvailable(user.input.value) : Promise.resolve(true)).then(function (ok) {
              if (!ok) { user.error(t('usernameTaken', 'That username is taken. Try another.')); return; }
              var patchP = { displayName: name.input.value, avatar: chosen };
              if (user) patchP.username = user.input.value;
              return FF.Auth.updateProfile(patchP).then(function () {
                api.close();
                FF.UI.toast(t('profileSaved', 'Profile saved'), { type: 'success' });
                FF.App.buildShell();
                FF.App.render(FF.App._currentView, FF.App._currentParams);
              });
            }).catch(function (e) { FF.UI.toast(e.message, { type: 'error' }); });
          } }
        ]
      });
    },

    // Saved players: who's in the next game, names, characters, order.
    renderPlayers: function (main) {
      var all = FF.Players.all();
      var playing = all.filter(function (p) { return p.active; }).length;
      var addBtn = FF.UI.button(t('addPlayer', 'Add player'), { class: 'btn-primary', icon: 'plus', onClick: function () {
        FF.App.quickAddPlayer(function () { FF.Nav.replace('profile', { tab: 'players' }); });
      } });
      if (all.length >= FF.Players.MAX_SAVED) addBtn.disabled = true;
      main.appendChild(FF.App.sectionHead(t('savedPlayers', 'Saved players'), addBtn));
      main.appendChild(FF.ui.el('p', { class: 'page-sub' }, t('savedPlayersSub', 'Switch people in or out of the next game. They stay saved for next time. {n} playing.', { n: playing })));

      var list = FF.ui.el('ul', { class: 'player-list' });
      all.forEach(function (p, i) {
        var row = FF.ui.el('li', { class: 'player-row' + (p.active ? '' : ' is-out'), style: { '--p-color': p.color } });
        var avaBtn = FF.ui.el('button', { type: 'button', class: 'player-row__avatar', 'aria-label': t('changePictureFor', 'Change picture for {name}', { name: p.name }),
          onclick: function () {
            if (p.isMe) { FF.App.editProfile(); return; }
            FF.Players.pickLook(p.id, { onDone: function () { FF.Nav.replace('profile', { tab: 'players' }); } });
          } });
        avaBtn.appendChild(FF.Players.avatarEl(p, 'player-row__face'));
        row.appendChild(avaBtn);
        var nameWrap = FF.ui.div('player-row__name');
        if (p.isMe) {
          nameWrap.appendChild(FF.ui.el('strong', {}, p.name));
          nameWrap.appendChild(FF.ui.span('badge', t('you', 'You')));
        } else {
          var name = FF.ui.el('input', {
            type: 'text', class: 'player-row__name-input', value: p.name, maxlength: 24,
            placeholder: t('playerName', 'Player name'), 'aria-label': t('nameOfPlayer', 'Name of player {n}', { n: i + 1 }), autocomplete: 'off'
          });
          name.addEventListener('input', function () { var next = name.value.trim(); if (next) FF.Players.rename(p.id, next); });
          name.addEventListener('blur', function () { if (!name.value.trim()) name.value = p.name; });
          nameWrap.appendChild(name);
        }
        row.appendChild(nameWrap);
        var sw = FF.ui.el('button', {
          type: 'button', class: 'switch' + (p.active ? ' on' : ''), role: 'switch',
          'aria-checked': p.active ? 'true' : 'false', 'aria-label': t('playingNext', '{name} plays in the next game', { name: p.name })
        });
        sw.appendChild(FF.ui.div('switch__knob', ''));
        sw.addEventListener('click', function () {
          FF.Players.setActive(p.id, !p.active);
          if (p.active && FF.Players.get().length === 1 && FF.Players.isActive(p.id)) FF.UI.toast(t('keepOneIn', 'At least one player stays in the game.'));
          FF.Nav.replace('profile', { tab: 'players' });
        });
        var swWrap = FF.ui.el('label', { class: 'player-row__playing' });
        swWrap.appendChild(FF.ui.span('player-row__playing-label', p.active ? t('isPlayingCap', 'Playing') : t('sittingOutCap', 'Sitting out')));
        swWrap.appendChild(sw);
        row.appendChild(swWrap);
        var controls = FF.ui.div('player-row__controls');
        controls.appendChild(FF.ui.el('button', {
          type: 'button', class: 'player-row__color', style: { background: p.color },
          'aria-label': t('changeColourFor', 'Change colour for {name}', { name: p.name }),
          onclick: function () { FF.Players.pickColor(p.id, function () { FF.Nav.replace('profile', { tab: 'players' }); }); }
        }));
        if (i > 0) controls.appendChild(FF.UI.iconButton('arrow-up', t('moveUp', 'Move {name} up', { name: p.name }), function () { FF.Players.move(p.id, -1); FF.Nav.replace('profile', { tab: 'players' }); }));
        if (i < all.length - 1) controls.appendChild(FF.UI.iconButton('arrow-down', t('moveDown', 'Move {name} down', { name: p.name }), function () { FF.Players.move(p.id, 1); FF.Nav.replace('profile', { tab: 'players' }); }));
        if (!p.isMe) controls.appendChild(FF.UI.iconButton('trash', t('removePlayer', 'Remove {name}', { name: p.name }), function () { FF.App.removePlayer(p.id); }, 'icon-btn--danger'));
        row.appendChild(controls);
        list.appendChild(row);
      });
      main.appendChild(list);
    },

    renderTeams: function (main) {
      var players = FF.Players.get();
      var teams = FF.Teams.get();
      var box = FF.ui.el('section', { class: 'settings-section' });
      box.appendChild(FF.UI.switchRow({
        label: t('teamPlay', 'Team play'),
        description: t('teamPlayDesc', 'Split the players in the next game into teams, for games that support it.'),
        checked: teams.enabled,
        onChange: function (on) { FF.Teams.setEnabled(on); FF.Nav.replace('profile', { tab: 'teams' }); }
      }));
      if (teams.enabled) {
        box.appendChild(FF.UI.settingRow(t('numTeams', 'Number of teams'), FF.UI.segmented({
          label: t('numTeams', 'Number of teams'), value: teams.count,
          options: [{ label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 }],
          onChange: function (n) { FF.Teams.setCount(n); FF.Nav.replace('profile', { tab: 'teams' }); }
        })));
      }
      main.appendChild(box);
      if (!teams.enabled) {
        main.appendChild(FF.UI.emptyState({ icon: 'users', title: t('teamsOff', 'Teams are off'), text: t('teamsOffText', 'Turn on team play to split your players into teams.') }));
        return;
      }

      var grid = FF.ui.div('team-grid');
      teams.teams.forEach(function (tm) {
        var col = FF.ui.el('section', { class: 'team-col', style: { '--team-color': tm.color } });
        var head = FF.ui.div('team-col__head');
        var ava = FF.ui.el('button', {
          type: 'button', class: 'team-col__photo', 'aria-label': t('changePictureFor', 'Change picture for {name}', { name: tm.name }),
          onclick: function () { FF.Players.pickLook(tm.id, { kind: 'team', onDone: function () { FF.Nav.replace('profile', { tab: 'teams' }); } }); }
        });
        ava.appendChild(FF.Players.avatarEl({ name: tm.name, avatar: tm.avatar, photo: tm.photo, isTeam: !tm.avatar, color: tm.color }, 'team-col__face'));
        head.appendChild(ava);
        var nm = FF.ui.el('input', { type: 'text', class: 'team-col__name-input', value: tm.name, maxlength: 24, 'aria-label': t('teamName', 'Team name'), autocomplete: 'off' });
        nm.addEventListener('input', function () { var n = nm.value.trim(); if (n) FF.Teams.rename(tm.id, n); });
        head.appendChild(nm);
        col.appendChild(head);

        var members = FF.ui.el('ul', { class: 'team-col__members' });
        tm.playerIds.forEach(function (pid) {
          var p = FF.Players.byId(pid);
          if (!p || !p.active) return;
          var m = FF.ui.el('li', { class: 'team-member' });
          m.appendChild(FF.Players.avatarEl(p, 'team-member__face'));
          m.appendChild(FF.ui.span('', p.name));
          members.appendChild(m);
        });
        if (!members.childNodes.length) members.appendChild(FF.ui.el('li', { class: 'details__note' }, t('noMembers', 'No one yet')));
        col.appendChild(members);

        var others = players.filter(function (p) { return tm.playerIds.indexOf(p.id) === -1; });
        if (others.length) {
          var add = FF.ui.div('team-col__add');
          others.forEach(function (p) {
            var b = FF.ui.el('button', { type: 'button', class: 'mini-btn', 'aria-label': t('moveToTeam', 'Move {name} to {team}', { name: p.name, team: tm.name }),
              onclick: function () { FF.Teams.assign(tm.id, p.id); FF.Nav.replace('profile', { tab: 'teams' }); } });
            b.appendChild(icon('plus'));
            b.appendChild(document.createTextNode(p.name));
            add.appendChild(b);
          });
          col.appendChild(add);
        }
        grid.appendChild(col);
      });
      main.appendChild(grid);
      main.appendChild(FF.UI.button(t('autoAssign', 'Shuffle into even teams'), { icon: 'shuffle', onClick: function () {
        var tt = FF.Teams.get(); FF.Teams.autoAssign(tt); FF.Teams.save(tt); FF.Nav.replace('profile', { tab: 'teams' });
      } }));
    },

    languageControl: function (onPicked) {
      var wrap = FF.ui.el('div', { class: 'seg', role: 'radiogroup', 'aria-label': t('language', 'Language') });
      FF.i18n.languages.forEach(function (lang) {
        var on = FF.i18n.getLang() === lang.code;
        var b = FF.ui.el('button', {
          type: 'button', class: 'seg__btn' + (on ? ' active' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false',
          lang: lang.code,
          onclick: function () {
            FF.i18n.setLang(lang.code);
            if (onPicked) onPicked();
          }
        });
        b.appendChild(FF.ui.span('', lang.name));
        if (lang.code !== 'en') b.appendChild(FF.ui.span('badge badge--beta', t('beta', 'Beta')));
        wrap.appendChild(b);
      });
      return wrap;
    },

    // Legacy helpers kept for older callers.
    toggleRow: function (label, initial, onChange) {
      return FF.UI.switchRow({ label: label, checked: initial, onChange: onChange });
    },
    toast: function (msg, type) { return FF.UI.toast(msg, { type: type }); },

    /* ================= Player editing ================= */
    removePlayer: function (id) {
      var p = FF.Players.byId(id);
      if (!p || p.isMe) return;
      FF.UI.confirm({
        title: t('removePlayerQ', 'Remove {name}?', { name: p.name }),
        body: t('removePlayerBody', 'They will be removed from your saved players. To skip them for one game, switch them to "Sitting out" instead.'),
        confirmLabel: t('remove', 'Remove'), danger: true, icon: 'trash',
        onConfirm: function () {
          FF.Players.remove(id);
          FF.Audio.play('click');
          FF.Nav.replace('profile', { tab: 'players' });
          FF.UI.announce(t('playerRemoved', '{name} removed', { name: p.name }));
        }
      });
    },

    /* ================= Quick play / demo ================= */
    quickPlay: function () {
      var pool = FF.Games.all().filter(function (g) { return g.id !== 'drawingChallenge' && FF.Access.canPlay(g.id); });
      var def = FF.util.pick(pool);
      FF.Audio.play('roundStart');
      FF.GameFlow.launch(def.id, { skipIntro: true });
    },

    quickRound: function () {
      var pool = FF.Games.all().filter(function (g) { return g.duration <= 5 && FF.Access.canPlay(g.id); });
      var def = FF.util.pick(pool);
      FF.Audio.play('roundStart');
      FF.GameFlow.launch(def.id, { skipIntro: true, length: 'quick', timer: 20 });
    },

    // Four sample players for this visit only. Saved players are untouched.
    demo: function () {
      var samples = [
        ['Sarah', 'nia', '#ec4899'], ['Daniel', 'kenji', '#3b82f6'],
        ['Emma', 'fox', '#10b981'], ['James', 'bolt', '#f97316']
      ];
      FF.Players.useTemporary(samples.map(function (s, i) {
        return { id: 'demo' + i, name: s[0], avatar: s[1], color: s[2], active: true };
      }));
      FF.UI.toast(t('demoStarted', 'Sample players are on. Starting a game…'));
      clearTimeout(this._demoTimer);
      this._demoTimer = setTimeout(function () { if (FF.Players.isTemporary()) FF.App.quickPlay(); }, 700);
    },

    endDemo: function () {
      clearTimeout(this._demoTimer);
      FF.Players.clearTemporary();
      FF.UI.toast(t('demoEnded', 'Back to your saved players'));
      this.render(this._currentView || 'home', this._currentParams || {});
    },

    confirmSignOut: function () {
      if (FF.Auth.isGuest()) {
        FF.UI.confirm({
          title: t('leaveGuestQ', 'Stop playing as a guest?'),
          body: t('leaveGuestBody', 'Your guest progress stays on this device. Play as a guest again to pick it up, or create an account to keep it for good.'),
          confirmLabel: t('leaveGuest', 'Stop guest play'),
          onConfirm: function () { FF.Auth.signOut(); }
        });
        return;
      }
      FF.UI.confirm({
        title: t('signOutQ', 'Sign out of PlayMona?'),
        body: FF.Auth.isLocal()
          ? t('signOutLocal', 'Your players and stats stay saved on this device for when you sign back in.')
          : t('signOutBody', 'Your players and stats are saved to your account. Sign in again on any device to pick up where you left off.'),
        confirmLabel: t('signOut', 'Sign out'),
        onConfirm: function () { FF.Auth.signOut(); }
      });
    },

    confirmDeleteAccount: function () {
      var p = FF.Auth.profile() || {};
      var body = FF.ui.div('');
      body.appendChild(FF.ui.el('p', {}, t('deleteBody', 'This permanently deletes your account, profile, saved players, stats and favourites. It cannot be undone.')));
      var id = FF.UI.uid('confirm');
      body.appendChild(FF.ui.el('label', { class: 'field__label', for: id }, t('typeUsername', 'Type your username ({u}) to confirm', { u: p.username })));
      var input = FF.ui.el('input', { id: id, type: 'text', class: 'input', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
      body.appendChild(input);
      FF.UI.dialog({
        title: t('deleteAccountQ', 'Delete your account?'),
        body: body,
        role: 'alertdialog',
        actions: [
          { label: t('cancel', 'Cancel') },
          { label: t('deleteAccountBtn', 'Delete my account'), danger: true, icon: 'trash', keepOpen: true, onClick: function (api) {
            if (FF.Auth.normalizeUsername(input.value) !== p.username) {
              FF.UI.toast(t('usernameMismatch', 'That does not match your username.'), { type: 'error' });
              return;
            }
            FF.Auth.deleteAccount().then(function () {
              api.close();
              FF.UI.toast(t('accountDeleted', 'Your account has been deleted.'));
            }).catch(function (e) {
              FF.UI.toast(e.message || t('authFailed', 'Something went wrong. Please try again.'), { type: 'error' });
            });
          } }
        ]
      });
    },

    confirmReset: function () {
      FF.UI.confirm({
        title: t('resetQ', 'Reset stats and players?'),
        body: t('resetBody', 'This clears your saved players, teams, favourites, recently played and stats on every device. Your account and settings stay. It cannot be undone.'),
        confirmLabel: t('resetAllBtn', 'Reset'),
        danger: true,
        icon: 'trash',
        onConfirm: function () {
          ['teams', 'favorites', 'recents'].forEach(function (k) { FF.Storage.set(k, k === 'teams' ? { enabled: false, count: 2, teams: FF.Teams.build(2) } : []); });
          FF.Storage.set('stats', FF.Stats.defaultStats());
          FF.Players.reset();
          FF.App.session = { games: 0, wins: {}, totalPoints: 0, players: {} };
          FF.UI.toast(t('resetDone', 'Stats and players reset'));
          FF.App.render('home');
        }
      });
    }
  };

  // Boot the app once the DOM is ready.
  function boot() { FF.App.init(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
