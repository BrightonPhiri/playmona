/* ============================================================
   FAMILY FUN — app.js
   Application shell and screens: home, games library, online,
   family (players, teams, stats), settings, game night, credits,
   about. Components come from FF.UI (js/ui-kit.js); styling
   from css/tokens.css + css/styles.css.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var VERSION = '2.0.0';

  /* ================= Brand ================= */
  FF.Brand = {
    name: 'Family Fun',
    version: VERSION,
    tagline: 'Games for everyone. Play together. Laugh together.',
    logoSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Family Fun logo">' +
      '<defs><linearGradient id="fflg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>' +
      '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#fflg)"/>' +
      '<rect x="8" y="20" width="48" height="26" rx="13" fill="#ffffff" opacity="0.95"/>' +
      '<g fill="#8b5cf6"><path d="M16 26h6v6h4v6h-4v6h-6v-6h-4v-6h4z"/></g>' +
      '<g fill="#ec4899"><circle cx="40" cy="31" r="3.2"/><circle cx="47" cy="38" r="3.2"/></g>' +
      '<path d="M40 46c3 0 5-2 5-4" stroke="#22d3ee" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M52 10l1.2 2.8 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#eab308"/>' +
      '</svg>',
    logoImg: 'assets/images/logo.webp',

    // Render the logo as an <img> (file first, inline SVG fallback).
    logo: function (cls, decorative) {
      return FF.Assets.img({
        cls: cls || 'brand-logo',
        alt: decorative ? '' : FF.Brand.name,
        src: FF.Brand.logoImg,
        svg: FF.Brand.logoSvg
      });
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
    players: { view: 'family', params: { tab: 'players' } },
    scores: { view: 'family', params: { tab: 'stats' } },
    favorites: { view: 'games', params: { favorites: true } }
  };
  // Which main destination a view belongs to (for nav highlighting).
  var NAV_OF = { home: 'home', gamenight: 'home', games: 'games', online: 'online', family: 'family', settings: 'settings', credits: 'settings', about: 'settings' };

  FF.App = {
    session: { games: 0, wins: {}, totalPoints: 0, players: {} },
    _currentView: 'home',
    _currentParams: {},
    _lib: null,

    init: function () {
      FF.Storage.init();
      if (FF.i18n) FF.i18n.init();
      FF.Theme.init();
      FF.Audio.init();
      this.resetLibrary();
      this.buildShell();
      FF.Nav.init();
      var self = this;
      if (FF.i18n) {
        FF.i18n.onChange(function () {
          self.buildShell();
          self.render(self._currentView || 'home', self._currentParams || {});
        });
      }
      this.render('home');

      // A shared link like .../familygame/#room=ABC123 goes straight to join.
      var joinCode = (FF.Room && FF.Room.codeFromUrl) ? FF.Room.codeFromUrl() : null;
      if (joinCode && onlineEnabled()) {
        FF.Nav.go('online');
        FF.RoomUI.showJoin(this.root(), joinCode);
      }
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
      // Re-render so "Play again" and favourites are fresh.
      this.render(this._currentView || 'home', this._currentParams || {});
    },

    /* ================= Shell ================= */
    navItems: function () {
      var items = [
        { view: 'home', icon: 'house', label: t('navHome', 'Home') },
        { view: 'games', icon: 'game-controller', label: t('navGames', 'Games') }
      ];
      if (onlineEnabled()) items.push({ view: 'online', icon: 'wifi', label: t('navOnline', 'Online') });
      items.push({ view: 'family', icon: 'users', label: t('navFamily', 'Family') });
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
        type: 'button', class: 'topbar__brand', 'aria-label': t('homeLabel', 'Family Fun, home'),
        onclick: function () { self._navTo('home'); }
      });
      brand.appendChild(FF.Brand.logo('brand-logo', true));
      brand.appendChild(FF.ui.span('topbar__name', FF.Brand.name));
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
        tools.appendChild(FF.UI.iconButton('arrows-out', t('fullscreen', 'Full screen'), function () { self.toggleFullscreen(); }));
      }
      header.appendChild(tools);
      app.appendChild(header);

      var main = FF.ui.el('main', { class: 'app-main', id: 'app-main', tabindex: -1 });
      app.appendChild(main);

      var footer = FF.ui.el('footer', { class: 'app-footer' });
      var privacy = FF.ui.span('app-footer__privacy');
      privacy.appendChild(icon('shield'));
      privacy.appendChild(document.createTextNode(t('privacyLine', 'Private by design: no accounts, no ads, and everything stays on this device.')));
      footer.appendChild(privacy);
      footer.appendChild(FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('credits'); } }, t('credits', 'Credits')));
      footer.appendChild(FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('about'); } }, t('about', 'About')));
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
      var renderer = this.views[view] || this.views.home;
      FF.safe(function () { renderer.call(FF.App, main, FF.App._currentParams); });
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

      if (isOnlineGame(def.id) && onlineEnabled()) {
        var badges = FF.ui.div('gcard__badges');
        var bd = FF.ui.span('badge badge--online');
        bd.appendChild(icon('wifi'));
        bd.appendChild(document.createTextNode(t('online', 'Online')));
        badges.appendChild(bd);
        card.appendChild(badges);
      }

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
        var players = FF.Players.get();
        var hour = new Date().getHours();
        var greet = hour < 12 ? t('goodMorning', 'Good morning') : (hour < 18 ? t('goodAfternoon', 'Good afternoon') : t('goodEvening', 'Good evening'));

        var hero = FF.ui.el('section', { class: 'home-hero on-art', 'aria-labelledby': 'home-title' });
        hero.style.setProperty('--art', FF.Assets.artUrl('ui', 'hero-home'));
        var body = FF.ui.div('home-hero__body');
        body.appendChild(FF.ui.el('p', { class: 'home-hero__eyebrow' }, greet));
        body.appendChild(FF.ui.el('h1', { class: 'home-hero__title', id: 'home-title' }, t('homeTitle', 'What are we playing today?')));
        var roster = FF.ui.div('home-hero__roster');
        roster.appendChild(FF.App.avatarStack(players));
        roster.appendChild(FF.ui.span('home-hero__sub', players.length <= 1
          ? t('playingSolo', 'Playing solo')
          : t('playersReady', '{n} players ready', { n: players.length })));
        var edit = FF.ui.el('button', { type: 'button', class: 'link-btn', style: { color: '#fcd34d' }, onclick: function () { FF.Nav.go('family'); } }, t('editPlayers', 'Edit players'));
        roster.appendChild(edit);
        body.appendChild(roster);
        hero.appendChild(body);

        var actions = FF.ui.div('home-hero__actions');
        actions.appendChild(FF.UI.button(t('quickPlay', 'Quick play'), { class: 'btn-lg btn-primary', icon: 'play', onClick: function () { FF.App.quickPlay(); } }));
        actions.appendChild(FF.UI.button(t('gameNight', 'Game night'), { class: 'btn-glass', icon: 'moon', onClick: function () { FF.Nav.go('gamenight'); } }));
        if (onlineEnabled()) {
          actions.appendChild(FF.UI.button(t('playTogether', 'Play together'), { class: 'btn-glass', icon: 'wifi', onClick: function () { FF.Nav.go('online'); } }));
        } else {
          actions.appendChild(FF.UI.button(t('quickRound', 'Quick round'), { class: 'btn-glass', icon: 'lightning', onClick: function () { FF.App.quickRound(); } }));
        }
        hero.appendChild(actions);
        main.appendChild(hero);

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
          style: { '--art': FF.Assets.artUrl('ui', 'gamenight') },
          onclick: function () { FF.Nav.go('gamenight'); }
        });
        var gnIcon = FF.ui.div('gamenight-promo__icon');
        gnIcon.appendChild(icon('trophy'));
        gn.appendChild(gnIcon);
        gn.appendChild(FF.ui.div('gamenight-promo__text', [
          FF.ui.el('strong', {}, t('gameNight', 'Game night')),
          FF.ui.el('span', {}, t('gameNightPromo', 'A tournament of 3 to 10 random games. Crown the family champion.'))
        ]));
        var cta = FF.ui.span('gamenight-promo__cta', t('start', 'Start'));
        cta.appendChild(icon('arrow-right'));
        gn.appendChild(cta);
        main.appendChild(gn);
      },

      games: function (main, params) {
        var l = FF.App._lib;
        if (params.category) { l.cat = params.category; }
        if (params.favorites) { l.fav = true; l.cat = null; }

        main.appendChild(FF.App.pageHead(t('navGames', 'Games'), t('libSub', '{n} games for every age. Search, filter, then tap one to play.', { n: FF.Games.all().length })));

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

      family: function (main, params) {
        var tab = params.tab || 'players';
        main.appendChild(FF.App.pageHead(t('navFamily', 'Family'), t('familySub', 'Who is playing, teams, and the medals you have won together.')));
        var tabs = FF.UI.segmented({
          label: t('familySections', 'Family sections'),
          value: tab,
          options: [
            { label: t('navPlayers', 'Players'), value: 'players', icon: 'user' },
            { label: t('teams', 'Teams'), value: 'teams', icon: 'users' },
            { label: t('stats', 'Stats'), value: 'stats', icon: 'trophy' }
          ],
          onChange: function (v) { FF.Nav.replace('family', { tab: v }); }
        });
        tabs.style.marginBottom = 'var(--sp-4)';
        main.appendChild(tabs);
        if (tab === 'teams') FF.App.renderTeams(main);
        else if (tab === 'stats') FF.App.renderStats(main);
        else FF.App.renderPlayers(main);
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
        who.appendChild(FF.ui.el('button', { type: 'button', class: 'link-btn', onclick: function () { FF.Nav.go('family'); } }, t('editPlayers', 'Edit players')));
        main.appendChild(who);
        function summary() {
          whoText.textContent = t('gnSummary', '{p} will play {r} random games.', { p: players.length === 1 ? t('onePlayer', '1 player') : t('playersCount', '{n} players', { n: players.length }), r: cfg.rounds });
        }
        summary();

        var start = FF.UI.button(t('startGameNight', 'Start game night'), { class: 'btn-lg btn-primary', icon: 'play', onClick: function () { FF.Audio.play('roundStart'); FF.GameNight.start(cfg); } });
        start.style.marginTop = 'var(--sp-5)';
        main.appendChild(start);
      },

      settings: function (main) {
        main.appendChild(FF.App.pageHead(t('navSettings', 'Settings')));

        function section(iconKey, title, children, cls) {
          main.appendChild(FF.App.iconHeading(iconKey, title));
          var s = FF.ui.el('section', { class: 'settings-section' + (cls ? ' ' + cls : '') });
          children.forEach(function (c) { if (c) s.appendChild(c); });
          main.appendChild(s);
          return s;
        }

        // Appearance
        var accent = FF.ui.el('div', { class: 'accent-picker', role: 'radiogroup', 'aria-label': t('accentColour', 'Accent colour') });
        FF.Theme.accents.forEach(function (a) {
          var on = FF.Theme.getAccent() === a.id;
          var b = FF.ui.el('button', {
            type: 'button', class: 'accent-swatch' + (on ? ' active' : ''), role: 'radio',
            'aria-checked': on ? 'true' : 'false', 'aria-label': a.name, title: a.name,
            style: { background: a.color },
            onclick: function () { FF.Theme.setAccent(a.id); FF.Nav.replace('settings'); }
          });
          if (on) b.appendChild(icon('check'));
          accent.appendChild(b);
        });
        section('palette', t('appearance', 'Appearance'), [
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
          }),
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

        // Language
        var langNote = FF.ui.el('p', { class: 'setting__desc', style: { padding: '0 0 var(--sp-3)' } }, t('langBetaNote', 'Menus are translated. Game questions and words are in English for now.'));
        section('globe', t('language', 'Language'), [FF.App.languageControl(), langNote]);

        // Sound
        var vol = FF.ui.el('input', { type: 'range', min: 0, max: 100, value: Math.round(FF.Audio.volume * 100), 'aria-label': t('volume', 'Volume'),
          oninput: function (e) { FF.Audio.setVolume(e.target.value / 100); FF.Settings.set('volume', FF.Audio.volume); } });
        section('speaker', t('sound', 'Sound'), [
          FF.UI.switchRow({ label: t('soundEffects', 'Sound effects'), checked: !!FF.Settings.get('sound'), onChange: function (on) { FF.Audio.setEffects(on); FF.Settings.set('sound', on); } }),
          FF.UI.switchRow({ label: t('music', 'Music'), checked: !!FF.Settings.get('music'), onChange: function (on) { FF.Audio.setMusic(on); FF.Settings.set('music', on); } }),
          FF.UI.settingRow(t('volume', 'Volume'), vol)
        ]);

        // Gameplay
        section('game-controller', t('gameplay', 'Gameplay'), [
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

        // Privacy & data
        var privacy = FF.ui.div('about-privacy');
        privacy.appendChild(icon('shield'));
        privacy.appendChild(FF.ui.el('div', {}, [
          FF.ui.el('strong', {}, t('privacyTitle', 'Private by design')),
          FF.ui.el('p', { class: 'setting__desc' }, t('privacyBody', 'No accounts, no ads, no tracking. Names, photos, scores and settings stay on this device. Online rooms share only names and emoji pictures, and only while you are in a room.'))
        ]));
        var dataBtns = FF.ui.div('btn-stack');
        dataBtns.appendChild(FF.UI.button(t('clearFavorites', 'Clear favourites'), { icon: 'star', onClick: function () { FF.Favorites.clear(); FF.UI.toast(t('favoritesCleared', 'Favourites cleared')); } }));
        dataBtns.appendChild(FF.UI.button(t('clearRecents', 'Clear recently played'), { icon: 'clock', onClick: function () { FF.Recents.clear(); FF.UI.toast(t('recentsCleared', 'Recently played cleared')); } }));
        section('shield', t('privacyData', 'Privacy and data'), [privacy, dataBtns]);

        // Advanced
        section('sliders', t('advanced', 'Advanced'), [
          FF.UI.settingRow(t('iconStyle', 'Icon style'), FF.UI.segmented({
            label: t('iconStyle', 'Icon style'), value: FF.Icons.getStyle(),
            options: [{ label: t('iconsHand', 'Hand-drawn'), value: 'custom' }, { label: t('iconsBold', 'Bold'), value: 'phosphor' }],
            onChange: function (v) { FF.Icons.setStyle(v); FF.App.buildShell(); FF.Nav.replace('settings'); }
          })),
          FF.UI.settingRow(t('demoMode', 'Demo mode'), FF.UI.button(t('runDemo', 'Add 4 sample players and play'), { icon: 'dice', onClick: function () { FF.App.demo(); } }), t('demoDesc', 'Handy for trying games quickly.'))
        ]);

        // Danger zone
        section('alert', t('resetTitle', 'Start over'), [
          FF.UI.settingRow(t('resetAll', 'Reset everything'),
            FF.UI.button(t('resetAllBtn', 'Reset all data'), { class: 'btn-danger', icon: 'trash', onClick: function () { FF.App.confirmReset(); } }),
            t('resetDesc', 'Removes players, teams, favourites, stats and settings from this device.'))
        ], 'settings-section--danger');

        var info = FF.ui.div('btn-stack');
        info.appendChild(FF.UI.button(t('credits', 'Credits'), { class: 'btn-ghost', icon: 'info', onClick: function () { FF.Nav.go('credits'); } }));
        info.appendChild(FF.UI.button(t('aboutFF', 'About Family Fun'), { class: 'btn-ghost', icon: 'heart', onClick: function () { FF.Nav.go('about'); } }));
        main.appendChild(info);
      },

      credits: function (main) {
        main.appendChild(FF.App.pageHead(t('credits', 'Credits'), t('creditsSub', 'Everything bundled with Family Fun and where it comes from.')));
        var box = FF.ui.div('panel');
        [
          ['Original assets', 'Logo, app icon, favicon, illustrations, flag artwork, sound effects and music are original creations made for this project.'],
          ['Fonts', 'Nunito, Fredoka, Baloo 2, Quicksand and Atkinson Hyperlegible are bundled in assets/fonts/ under the SIL Open Font License.'],
          ['Icons', 'Interface icons are hand-drawn for Family Fun. The optional Bold style uses Phosphor Icons (MIT license), bundled in assets/icons/phosphor/.'],
          ['Word list', 'Word games use a bundled list of common English words (google-10000-english-usa-no-swears, MIT license) plus everyday family words.'],
          ['Photographs', 'Real-world photos for the Guess games can be added to assets/images/. See the README "Image Download List" for public-domain sources and attribution.'],
          ['Attribution', 'Keep attribution for any third-party images you add next to the files, for example a credits.txt in the same folder.']
        ].forEach(function (row) {
          box.appendChild(FF.ui.el('h2', { style: { fontSize: 'var(--fs-lg)', marginTop: 'var(--sp-4)' } }, row[0]));
          box.appendChild(FF.ui.el('p', {}, row[1]));
        });
        main.appendChild(box);
      },

      about: function (main) {
        main.appendChild(FF.App.pageHead(t('about', 'About')));
        var box = FF.ui.div('panel panel--center');
        box.appendChild(FF.Brand.logo('brand-logo brand-logo--hero', true));
        box.appendChild(FF.ui.el('h2', { style: { fontSize: 'var(--fs-2xl)' } }, FF.Brand.name));
        box.appendChild(FF.ui.el('p', {}, FF.Brand.tagline));
        box.appendChild(FF.ui.el('p', {}, t('aboutBody', 'A family game hub: quizzes, word games, party games and more, for one player or a whole room. Play on one screen, on the TV, or on everyone’s phones.')));
        var privacy = FF.ui.div('about-privacy');
        privacy.appendChild(icon('shield'));
        privacy.appendChild(FF.ui.el('div', {}, [
          FF.ui.el('strong', {}, t('privacyTitle', 'Private by design')),
          FF.ui.el('p', { class: 'setting__desc' }, t('privacyAbout', 'Family Fun needs no account and works offline. Your settings and scores stay on this device.'))
        ]));
        box.appendChild(privacy);
        box.appendChild(FF.ui.el('p', { class: 'about-ver' }, t('version', 'Version {v}', { v: VERSION })));
        main.appendChild(box);
      }
    },

    /* ================= Family sub-views ================= */
    renderPlayers: function (main) {
      var players = FF.Players.get();
      var addBtn = FF.UI.button(t('addPlayer', 'Add player'), { class: 'btn-primary', icon: 'plus', onClick: function () { FF.App.addPlayer(); } });
      if (players.length >= FF.Players.MAX) addBtn.disabled = true;
      main.appendChild(FF.App.sectionHead(t('playersOf', 'Players ({n} of {max})', { n: players.length, max: FF.Players.MAX }), addBtn));

      var list = FF.ui.el('ul', { class: 'player-list', role: 'list', style: { listStyle: 'none' } });
      players.forEach(function (p, i) {
        var row = FF.ui.el('li', { class: 'player-row', style: { '--p-color': p.color } });
        var avaBtn = FF.ui.el('button', { type: 'button', class: 'player-row__avatar', onclick: function () { FF.App.pickAvatar(p.id); }, 'aria-label': t('changePictureFor', 'Change picture for {name}', { name: p.name }) });
        avaBtn.appendChild(FF.Players.avatarEl(p, 'player-row__face'));
        row.appendChild(avaBtn);
        var name = FF.ui.el('input', {
          type: 'text', class: 'player-row__name-input', value: p.name, maxlength: 24,
          placeholder: t('playerName', 'Player name'), 'aria-label': t('nameOfPlayer', 'Name of player {n}', { n: i + 1 }), autocomplete: 'off'
        });
        name.addEventListener('input', function () {
          var next = name.value.trim();
          if (next) FF.Players.rename(p.id, next);
        });
        name.addEventListener('blur', function () { if (!name.value.trim()) name.value = p.name; });
        row.appendChild(name);
        row.appendChild(FF.ui.el('button', {
          type: 'button', class: 'player-row__color', style: { background: p.color },
          'aria-label': t('changeColourFor', 'Change colour for {name}', { name: p.name }),
          onclick: function () { FF.App.pickColor(p.id); }
        }));
        var controls = FF.ui.div('player-row__controls');
        if (i > 0) controls.appendChild(FF.UI.iconButton('arrow-up', t('moveUp', 'Move {name} up', { name: p.name }), function () { FF.App.movePlayer(i, -1); }));
        if (i < players.length - 1) controls.appendChild(FF.UI.iconButton('arrow-down', t('moveDown', 'Move {name} down', { name: p.name }), function () { FF.App.movePlayer(i, 1); }));
        if (players.length > FF.Players.MIN) controls.appendChild(FF.UI.iconButton('trash', t('removePlayer', 'Remove {name}', { name: p.name }), function () { FF.App.removePlayer(p.id); }, 'icon-btn--danger'));
        row.appendChild(controls);
        list.appendChild(row);
      });
      main.appendChild(list);

      main.appendChild(FF.ui.div('hint', players.length < 2
        ? t('soloHint', 'One player is enough for most games. Add another name when you want a match.')
        : t('rosterHint', 'Tap a picture to choose an emoji or a photo. Names save as you type.')));
      main.appendChild(FF.UI.button(t('resetPlayers', 'Reset players'), { class: 'btn-ghost', icon: 'restart', onClick: function () {
        FF.UI.confirm({
          title: t('resetPlayersQ', 'Reset players?'),
          body: t('resetPlayersBody', 'This goes back to a single "Player 1".'),
          confirmLabel: t('resetPlayers', 'Reset players'), danger: true,
          onConfirm: function () { FF.Players.reset(); FF.Nav.replace('family', { tab: 'players' }); }
        });
      } }));
    },

    renderTeams: function (main) {
      var players = FF.Players.get();
      var teams = FF.Teams.get();
      var box = FF.ui.el('section', { class: 'settings-section' });
      box.appendChild(FF.UI.switchRow({
        label: t('teamPlay', 'Team play'),
        description: t('teamPlayDesc', 'Split into teams for games that support it.'),
        checked: teams.enabled,
        onChange: function (on) { FF.Teams.setEnabled(on); FF.Nav.replace('family', { tab: 'teams' }); }
      }));
      if (teams.enabled) {
        box.appendChild(FF.UI.settingRow(t('numTeams', 'Number of teams'), FF.UI.segmented({
          label: t('numTeams', 'Number of teams'), value: teams.count,
          options: [{ label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 }],
          onChange: function (n) { FF.Teams.setCount(n); FF.Nav.replace('family', { tab: 'teams' }); }
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
          onclick: function () { FF.Players.pickLook(tm.id, { kind: 'team', onDone: function () { FF.Nav.replace('family', { tab: 'teams' }); } }); }
        });
        ava.appendChild(FF.Players.avatarEl({ name: tm.name, avatar: tm.avatar || '👥', photo: tm.photo }, 'team-col__face'));
        head.appendChild(ava);
        var nm = FF.ui.el('input', { type: 'text', class: 'team-col__name-input', value: tm.name, maxlength: 24, 'aria-label': t('teamName', 'Team name'), autocomplete: 'off' });
        nm.addEventListener('input', function () { var n = nm.value.trim(); if (n) FF.Teams.rename(tm.id, n); });
        head.appendChild(nm);
        col.appendChild(head);

        var members = FF.ui.el('ul', { class: 'team-col__members', style: { listStyle: 'none' } });
        tm.playerIds.forEach(function (pid) {
          var p = FF.Players.byId(pid);
          if (!p) return;
          var m = FF.ui.el('li', { class: 'team-member' });
          m.appendChild(FF.Players.avatarEl(p, 'team-member__face'));
          m.appendChild(FF.ui.span('', p.name));
          members.appendChild(m);
        });
        if (!tm.playerIds.length) members.appendChild(FF.ui.el('li', { class: 'details__note' }, t('noMembers', 'No one yet')));
        col.appendChild(members);

        var others = players.filter(function (p) { return tm.playerIds.indexOf(p.id) === -1; });
        if (others.length) {
          var add = FF.ui.div('team-col__add');
          others.forEach(function (p) {
            var b = FF.ui.el('button', { type: 'button', class: 'mini-btn', 'aria-label': t('moveToTeam', 'Move {name} to {team}', { name: p.name, team: tm.name }),
              onclick: function () { FF.Teams.assign(tm.id, p.id); FF.Nav.replace('family', { tab: 'teams' }); } });
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
        var tt = FF.Teams.get(); FF.Teams.autoAssign(tt); FF.Teams.save(tt); FF.Nav.replace('family', { tab: 'teams' });
      } }));
    },

    renderStats: function (main) {
      var session = FF.App.session;
      var stats = FF.Stats.get();
      var cards = FF.ui.div('stat-grid');
      function statCard(iconKey, label, value) {
        var c = FF.ui.div('stat-card');
        var ic = FF.ui.div('stat-card__icon');
        ic.appendChild(icon(iconKey));
        c.appendChild(ic);
        c.appendChild(FF.ui.div('stat-card__value', String(value)));
        c.appendChild(FF.ui.div('stat-card__label', label));
        cards.appendChild(c);
      }
      statCard('game-controller', t('statSession', 'Games today'), FF.util.formatNumber(session.games));
      statCard('trophy', t('statAllTime', 'Games played'), FF.util.formatNumber(stats.gamesPlayed));
      statCard('flame', t('statStreak', 'Best streak'), FF.util.formatNumber(stats.bestStreak || 0));
      statCard('lightning', t('statFastest', 'Fastest answer'), stats.fastest != null ? stats.fastest.toFixed(2) + ' s' : '—');
      statCard('text-aa', t('statWords', 'Most words'), FF.util.formatNumber(stats.mostWords || 0));
      statCard('brain', t('statAccuracy', 'Quiz accuracy'), stats.quizAnswered ? Math.round(stats.quizCorrect / stats.quizAnswered * 100) + '%' : '—');
      main.appendChild(cards);

      var names = Object.keys(session.wins);
      if (names.length) {
        main.appendChild(FF.App.sectionHead(t('sessionWinners', 'Winners today')));
        var lb = FF.ui.el('ol', { class: 'results__leaderboard', style: { listStyle: 'none', margin: '0' } });
        names.sort(function (a, b) { return session.wins[b] - session.wins[a]; }).forEach(function (name, i) {
          var row = FF.ui.el('li', { class: 'results__row' });
          row.appendChild(FF.ui.el('span', { class: 'results__rank' }, String(i + 1)));
          row.appendChild(FF.ui.el('span', { class: 'results__name' }, name));
          var w = session.wins[name];
          row.appendChild(FF.ui.el('span', { class: 'results__pts' }, w === 1 ? t('oneWin', '1 win') : t('nWins', '{n} wins', { n: w })));
          lb.appendChild(row);
        });
        main.appendChild(lb);
      }

      var unlocked = FF.Stats.ACHIEVEMENTS.filter(function (a) { return FF.Stats.isUnlocked(a.id); }).length;
      main.appendChild(FF.App.sectionHead(t('medalsOf', 'Medals ({n} of {max})', { n: unlocked, max: FF.Stats.ACHIEVEMENTS.length })));
      var grid = FF.ui.el('ul', { class: 'achievement-grid', style: { listStyle: 'none' } });
      FF.Stats.ACHIEVEMENTS.forEach(function (a) {
        var on = FF.Stats.isUnlocked(a.id);
        var c = FF.ui.el('li', { class: 'achievement' + (on ? ' unlocked' : ' locked') });
        c.appendChild(FF.ui.el('span', { class: 'achievement__icon', 'aria-hidden': 'true' }, a.icon));
        c.appendChild(FF.ui.el('div', {}, [
          FF.ui.div('achievement__name', a.name),
          FF.ui.div('achievement__desc', a.desc),
          FF.ui.div('achievement__state', on ? t('unlocked', 'Unlocked') : t('locked', 'Not yet'))
        ]));
        grid.appendChild(c);
      });
      main.appendChild(grid);
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

    /* ================= Player/team editing ================= */
    addPlayer: function () {
      var used = FF.Players.get().map(function (p) { return p.name; });
      var pool = ['Alex', 'Sam', 'Jo', 'Max', 'Mia', 'Leo', 'Zoe', 'Kai', 'Ava', 'Ben'].filter(function (n) { return used.indexOf(n) === -1; });
      FF.Players.add(pool.length ? FF.util.pick(pool) : null);
      FF.Audio.play('select');
      FF.Nav.replace('family', { tab: 'players' });
      setTimeout(function () {
        var inputs = FF.ui.$$('.player-row__name-input');
        var last = inputs[inputs.length - 1];
        if (last && FF.Nav.modality === 'keyboard') { last.focus(); last.select(); }
      }, 30);
    },

    removePlayer: function (id) {
      var p = FF.Players.byId(id);
      if (FF.Players.get().length <= FF.Players.MIN) {
        FF.UI.toast(t('keepOne', 'Keep at least one player.'));
        return;
      }
      FF.Players.remove(id);
      FF.Audio.play('click');
      FF.Nav.replace('family', { tab: 'players' });
      if (p) FF.UI.announce(t('playerRemoved', '{name} removed', { name: p.name }));
    },

    pickAvatar: function (id) {
      FF.Players.pickLook(id, { onDone: function () { FF.Nav.replace('family', { tab: 'players' }); } });
    },

    pickColor: function (id) {
      FF.Players.pickColor(id, function () { FF.Nav.replace('family', { tab: 'players' }); });
    },

    movePlayer: function (index, delta) {
      var list = FF.Players.get();
      var j = index + delta;
      if (j < 0 || j >= list.length) return;
      var tmp = list[index]; list[index] = list[j]; list[j] = tmp;
      FF.Players.save(list);
      FF.Nav.replace('family', { tab: 'players' });
    },

    /* ================= Quick play / demo ================= */
    quickPlay: function () {
      var pool = FF.Games.all().filter(function (g) { return g.id !== 'drawingChallenge'; });
      var def = FF.util.pick(pool);
      FF.Audio.play('roundStart');
      FF.GameFlow.launch(def.id, { skipIntro: true });
    },

    quickRound: function () {
      var pool = FF.Games.all().filter(function (g) { return g.duration <= 5; });
      var def = FF.util.pick(pool);
      FF.Audio.play('roundStart');
      FF.GameFlow.launch(def.id, { skipIntro: true, length: 'quick', timer: 20 });
    },

    demo: function () {
      var samples = [
        ['Sarah', '🥳', '#ec4899'], ['Daniel', '😎', '#3b82f6'],
        ['Emma', '🦊', '#10b981'], ['James', '🤓', '#f97316']
      ];
      FF.Storage.set('players', samples.map(function (s, i) {
        return { id: 'demo' + i, name: s[0], avatar: s[1], color: s[2] };
      }));
      FF.Teams.setEnabled(false);
      FF.UI.toast(t('demoStarted', 'Sample players added. Starting a game…'));
      setTimeout(function () { FF.App.quickPlay(); }, 700);
    },

    confirmReset: function () {
      FF.UI.confirm({
        title: t('resetQ', 'Reset all data?'),
        body: t('resetBody', 'This removes your players, teams, favourites, stats and settings from this device. It cannot be undone.'),
        confirmLabel: t('resetAllBtn', 'Reset all data'),
        danger: true,
        icon: 'trash',
        onConfirm: function () {
          FF.Storage.clear();
          FF.App.session = { games: 0, wins: {}, totalPoints: 0, players: {} };
          location.reload();
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
