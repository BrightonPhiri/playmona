/* ============================================================
   FAMILY FUN — app.js
   Application shell and all screens: home, library, players,
   teams, scores, favorites, settings, credits, stats, game night.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ================= Brand ================= */
  FF.Brand = {
    name: 'FAMILY FUN',
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
    logo: function (cls) {
      return FF.Assets.img({
        cls: cls || 'brand-logo',
        alt: FF.Brand.name + ' logo',
        src: FF.Brand.logoImg,
        svg: FF.Brand.logoSvg
      });
    }
  };

  FF.Categories = {
    words:   { name: 'Words',    icon: '🔤', color: '#8b5cf6' },
    quiz:    { name: 'Quiz',     icon: '🧠', color: '#3b82f6' },
    visual:  { name: 'Visual',   icon: '🖼️', color: '#10b981' },
    memory:  { name: 'Memory',   icon: '🧩', color: '#f97316' },
    reaction:{ name: 'Reaction', icon: '⚡', color: '#ef4444' },
    creative:{ name: 'Creative', icon: '🎨', color: '#ec4899' },
    numbers: { name: 'Numbers',  icon: '🔢', color: '#22d3ee' },
    party:   { name: 'Party',    icon: '🎉', color: '#eab308' },
    world:   { name: 'World',    icon: '🌍', color: '#14b8a6' }
  };

  FF.App = {
    session: { games: 0, wins: {}, totalPoints: 0, players: {} },
    _filter: null,

    init: function () {
      FF.Storage.init();
      FF.Theme.init();
      FF.Audio.init();
      this.buildShell();
      FF.Nav.init();
      this.render('home');

      // A shared link like .../familygame/#room=ABC123 goes straight to join.
      var joinCode = (FF.Room && FF.Room.codeFromUrl) ? FF.Room.codeFromUrl() : null;
      if (joinCode && FF.Net && FF.Net.configured()) {
        FF.Nav.go('online');
        FF.RoomUI.showJoin(this.root(), joinCode);
      }
    },

    root: function () { return FF.ui.$('#app-main'); },

    onThemeChange: function () { this._syncThemeUI(); },

    onGameEnded: function (results) {
      const w = results.results && results.results[0];
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
      // re-render home to refresh recently-played etc.
      this.render(this._currentView || 'home', this._currentParams || {});
    },

    _currentView: 'home',
    _currentParams: {},

    /* ================= Shell ================= */
    buildShell: function () {
      document.body.innerHTML = '';

      const app = FF.ui.div('app');
      app.id = 'app';

      // Header
      const header = FF.ui.el('header', { class: 'app-header' });
      const brand = FF.ui.el('div', { class: 'app-header__brand', 'data-focusable': 'true', tabindex: 0, onclick: function () { FF.Nav.go('home'); } });
      brand.appendChild(FF.Brand.logo('brand-logo'));
      brand.appendChild(FF.ui.div('brand-text', [
        FF.ui.el('span', { class: 'brand-name' }, 'FAMILY FUN'),
        FF.ui.el('span', { class: 'brand-tag' }, FF.Brand.tagline)
      ]));
      header.appendChild(brand);

      const nav = FF.ui.el('nav', { class: 'app-nav' });
      const navItems = [
        ['home', '🏠', 'Home'],
        ['games', '🎮', 'Games'],
        ['players', '👥', 'Players'],
        ['scores', '🏆', 'Scores'],
        ['favorites', '⭐', 'Favorites'],
        ['settings', '⚙', 'Settings']
      ];
      const self = this;
      navItems.forEach(function (item) {
        const b = FF.ui.button('', {
          class: 'nav-link', dataset: { view: item[0], icon: FF.Icons.nav[item[0]], fallback: item[1] }, ariaLabel: item[2],
          onClick: function () { self._navTo(item[0]); }
        });
        b.appendChild(FF.Icons.icon(FF.Icons.nav[item[0]], item[1]));
        b.appendChild(FF.ui.span('nav-link__label', item[2]));
        nav.appendChild(b);
      });
      header.appendChild(nav);

      const tools = FF.ui.div('app-header__tools');
      const themeBtn = FF.ui.button('🌙', { class: 'tool-btn', ariaLabel: 'Theme', onClick: function () { self._cycleTheme(); } });
      themeBtn.id = 'theme-toggle';
      const fsBtn = FF.ui.button('⛶', { class: 'tool-btn', ariaLabel: 'Fullscreen', onClick: function () { self.toggleFullscreen(); } });
      tools.appendChild(themeBtn);
      tools.appendChild(fsBtn);
      header.appendChild(tools);

      const main = FF.ui.el('main', { class: 'app-main', id: 'app-main' });
      const footer = FF.ui.el('footer', { class: 'app-footer' });
      footer.appendChild(FF.ui.div('app-footer__brand', FF.Brand.name + '  ·  ' + FF.Brand.tagline));
      footer.appendChild(FF.ui.el('button', { class: 'link-btn', onclick: function () { FF.Nav.go('credits'); } }, 'Credits & Sources'));
      footer.appendChild(FF.ui.el('button', { class: 'link-btn', onclick: function () { FF.Nav.go('about'); } }, 'About'));
      footer.appendChild(FF.ui.div('app-footer__privacy', '🔒 Private & offline — no account, no internet.'));
      footer.appendChild(FF.ui.div('app-footer__ver', 'v1.1.0'));

      app.appendChild(header);
      app.appendChild(main);
      app.appendChild(footer);
      document.body.appendChild(app);

      const gameScreen = FF.ui.div('game-screen hidden');
      gameScreen.id = 'game-screen';
      document.body.appendChild(gameScreen);

      this._syncThemeUI();
    },

    _navTo: function (view) {
      FF.Audio.play('select');
      FF.Nav.replace(view);
    },

    _syncThemeUI: function () {
      const btn = FF.ui.$('#theme-toggle');
      if (btn) {
        const t = FF.Theme.getTheme();
        btn.textContent = t === 'light' ? '☀️' : (t === 'dark' ? '🌙' : '⚙');
      }
      const navs = FF.ui.$$('.nav-link');
      navs.forEach(function (n) { n.classList.toggle('active', n.dataset.view === FF.Nav.current); });

      // Rebuild nav icons if the icon style changed.
      const style = (typeof FF.Icons.getStyle === 'function') ? FF.Icons.getStyle() : 'custom';
      if (style !== this._iconStyle) {
        this._iconStyle = style;
        this._refreshNavIcons();
      }
    },

    _refreshNavIcons: function () {
      FF.ui.$$('.nav-link').forEach(function (b) {
        const old = b.querySelector('.icon-svg');
        if (!old) return;
        const fresh = FF.Icons.icon(b.dataset.icon, b.dataset.fallback);
        b.replaceChild(fresh, old);
      });
    },

    _cycleTheme: function () {
      const order = ['light', 'dark', 'system'];
      const cur = FF.Theme.getTheme();
      const next = order[(order.indexOf(cur) + 1) % order.length];
      FF.Theme.setTheme(next);
      this._syncThemeUI();
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
      this._currentView = view;
      this._currentParams = params || {};
      const main = this.root();
      if (!main) return;
      FF.ui.clear(main);
      const renderer = this.views[view] || this.views.home;
      FF.safe(function () { renderer.call(FF.App, main, FF.App._currentParams); });
      this._syncThemeUI();
      FF.Nav.focusFirst(main);
    },

    /* ================= Shared components ================= */
    sectionTitle: function (text, action) {
      const h = FF.ui.div('section-head');
      h.appendChild(FF.ui.el('h2', { class: 'section-title' }, text));
      if (action) h.appendChild(action);
      return h;
    },

    gameCard: function (def, opts) {
      opts = opts || {};
      const cat = FF.Categories[def.category] || { name: def.category, icon: '🎮', color: '#888' };
      const card = FF.ui.el('div', {
        class: 'game-card' + (opts.large ? ' game-card--large' : ''),
        tabindex: 0, 'data-focusable': 'true',
        style: { '--card-color': cat.color },
        onclick: function (e) {
          if (e.target.closest('.fav-btn')) return;
          FF.Audio.play('select');
          FF.GameFlow.launch(def.id);
        }
      });

      const top = FF.ui.div('game-card__top');
      top.appendChild(FF.Icons.icon(FF.Icons.game[def.id], def.icon, 'game-card__icon'));
      const fav = FF.ui.button(FF.Favorites.has(def.id) ? '⭐' : '☆', {
        class: 'fav-btn' + (FF.Favorites.has(def.id) ? ' active' : ''),
        ariaLabel: 'Toggle favorite',
        onClick: function (e) {
          e.stopPropagation();
          FF.Favorites.toggle(def.id);
          fav.textContent = FF.Favorites.has(def.id) ? '⭐' : '☆';
          fav.classList.toggle('active', FF.Favorites.has(def.id));
          FF.Audio.play('click');
          if (opts.onFav) opts.onFav();
        }
      });
      top.appendChild(fav);

      card.appendChild(top);
      card.appendChild(FF.ui.el('h3', { class: 'game-card__name' }, def.name));
      card.appendChild(FF.ui.el('p', { class: 'game-card__desc' }, def.description));

      const meta = FF.ui.div('game-card__meta');
      meta.appendChild(FF.ui.el('span', { class: 'meta-chip' }, '👥 ' + def.players[0] + '–' + def.players[1]));
      meta.appendChild(FF.ui.el('span', { class: 'meta-chip' }, '⭐ ' + (def.difficulty || 'Easy')));
      meta.appendChild(FF.ui.el('span', { class: 'meta-chip' }, '⏱ ' + (def.duration || 5) + 'm'));
      const catChip = FF.ui.el('span', { class: 'meta-chip meta-chip--cat' });
      catChip.appendChild(FF.Icons.icon(FF.Icons.category[def.category], cat.icon));
      catChip.appendChild(document.createTextNode(' ' + cat.name));
      meta.appendChild(catChip);
      card.appendChild(meta);
      return card;
    },

    gameGrid: function (games, opts) {
      const grid = FF.ui.div('game-grid');
      games.forEach(function (g) { grid.appendChild(FF.App.gameCard(g, opts)); });
      return grid;
    },

    heroButton: function (iconKey, fallback, label, sub, onClick, primary) {
      const b = FF.ui.el('button', {
        class: 'hero-btn' + (primary ? ' hero-btn--primary' : ''),
        onclick: onClick, tabindex: 0
      });
      const ic = FF.ui.div('hero-btn__icon');
      ic.appendChild(FF.Icons.icon(iconKey, fallback));
      b.appendChild(ic);
      b.appendChild(FF.ui.div('hero-btn__label', label));
      if (sub) b.appendChild(FF.ui.div('hero-btn__sub', sub));
      return b;
    },

    /* ================= Views ================= */
    views: {

      online: function (main) {
        if (!FF.Net || !FF.Net.configured()) { FF.Nav.go('home'); return; }
        FF.RoomUI.showHome(main);
      },

      home: function (main) {
        const hero = FF.ui.div('home-hero');
        const heroText = FF.ui.div('home-hero__text');
        heroText.appendChild(FF.Brand.logo('brand-logo brand-logo--hero'));
        heroText.appendChild(FF.ui.el('h1', { class: 'home-hero__title' }, FF.Brand.name));
        heroText.appendChild(FF.ui.el('p', { class: 'home-hero__tag' }, FF.Brand.tagline));
        hero.appendChild(heroText);

        const actions = FF.ui.div('home-hero__actions');
        actions.appendChild(FF.App.heroButton('play', '🎮', 'QUICK PLAY', 'Random game, right now', function () { FF.App.quickPlay(); }, true));
        actions.appendChild(FF.App.heroButton('moon', '🌙', 'GAME NIGHT', 'Multi-round tournament', function () { FF.Nav.go('gamenight'); }));
        actions.appendChild(FF.App.heroButton('lightning', '⚡', 'QUICK ROUND', '2–5 minute game', function () { FF.App.quickRound(); }));
        // Only shown when online play is configured, so an offline copy
        // of the app has no trace of it and makes no network requests.
        if (FF.Net && FF.Net.configured()) {
          actions.appendChild(FF.App.heroButton('globe', '🌐', 'PLAY TOGETHER', 'Same game, different devices', function () { FF.Nav.go('online'); }));
        }
        hero.appendChild(actions);
        main.appendChild(hero);

        // Featured games
        const featuredIds = ['familyQuiz', 'guessCountry', 'memoryMatch', 'letterRush', 'charades', 'quickTap'];
        const featured = featuredIds.map(FF.Games.get).filter(Boolean);
        main.appendChild(FF.App.sectionTitle('⭐ Featured Games', FF.ui.button('All Games →', { class: 'link-btn', onClick: function () { FF.Nav.go('games'); } })));
        main.appendChild(FF.App.gameGrid(featured, { large: true }));

        // Game Night promo
        const gn = FF.ui.el('button', { class: 'gamenight-promo', onclick: function () { FF.Nav.go('gamenight'); } });
        gn.appendChild(FF.ui.div('gamenight-promo__icon', '🌙'));
        gn.appendChild(FF.ui.div('gamenight-promo__text', [
          FF.ui.el('strong', {}, 'GAME NIGHT MODE'),
          FF.ui.el('span', {}, 'A multi-round tournament for the whole family. Play 3–10 rounds and crown a champion.')
        ]));
        gn.appendChild(FF.ui.div('gamenight-promo__cta', 'START →'));
        main.appendChild(gn);

        // Quick games
        const quick = FF.Games.all().filter(function (g) { return g.duration <= 3; }).slice(0, 6);
        main.appendChild(FF.App.sectionTitle('⚡ Quick Games'));
        main.appendChild(FF.App.gameGrid(quick));

        // Recently played
        const recents = FF.Recents.get();
        if (recents.length) {
          const recentGames = recents.map(function (r) { return FF.Games.get(r.id); }).filter(Boolean).slice(0, 6);
          main.appendChild(FF.App.sectionTitle('🕐 Recently Played'));
          main.appendChild(FF.App.gameGrid(recentGames));
        }

        // Favorites
        const favs = FF.Favorites.get().map(FF.Games.get).filter(Boolean).slice(0, 6);
        if (favs.length) {
          main.appendChild(FF.App.sectionTitle('💛 My Favorites'));
          main.appendChild(FF.App.gameGrid(favs));
        }
      },

      games: function (main, params) {
        const cats = FF.Games.categories();
        const all = FF.Games.all();
        const filter = params.category || FF.App._filter || null;

        const filterBar = FF.ui.div('filter-bar');
        const allBtn = FF.ui.button('All', { class: 'filter-chip' + (!filter ? ' active' : ''), onClick: function () { FF.App._filter = null; FF.Nav.replace('games'); } });
        filterBar.appendChild(allBtn);
        cats.forEach(function (c) {
          const meta = FF.Categories[c] || { name: c, icon: '🎮' };
          const chip = FF.ui.button('', {
            class: 'filter-chip' + (filter === c ? ' active' : ''),
            ariaLabel: meta.name,
            onClick: function () { FF.App._filter = c; FF.Nav.replace('games', { category: c }); }
          });
          chip.appendChild(FF.Icons.icon(FF.Icons.category[c], meta.icon));
          chip.appendChild(FF.ui.span('filter-chip__label', meta.name));
          filterBar.appendChild(chip);
        });
        main.appendChild(filterBar);

        const list = filter ? all.filter(function (g) { return g.category === filter; }) : all;
        main.appendChild(FF.App.sectionTitle('🎮 ' + (filter ? (FF.Categories[filter] || {}).name || filter : 'All Games') + ' (' + list.length + ')'));
        main.appendChild(FF.App.gameGrid(list));
      },

      players: function (main) {
        const players = FF.Players.get();
        const teams = FF.Teams.get();

        // Player list
        main.appendChild(FF.App.sectionTitle('👥 Players (' + players.length + '/' + FF.Players.MAX + ')', FF.ui.button('＋ Add Player', { primary: true, onClick: function () { FF.App.addPlayer(); } })));

        const list = FF.ui.div('player-list');
        players.forEach(function (p, i) {
          const row = FF.ui.el('div', { class: 'player-row', style: { '--p-color': p.color } });
          row.appendChild(FF.ui.el('button', { class: 'player-row__avatar', onclick: function () { FF.App.pickAvatar(p.id); }, 'aria-label': 'Change avatar' }, p.avatar));
          const nameBtn = FF.ui.el('button', { class: 'player-row__name', onclick: function () { FF.App.renamePlayer(p.id); } }, p.name + ' ✏️');
          row.appendChild(nameBtn);
          row.appendChild(FF.ui.el('button', { class: 'player-row__color', onclick: function () { FF.App.pickColor(p.id); }, 'aria-label': 'Change colour', style: { background: p.color } }, ''));
          const controls = FF.ui.div('player-row__controls');
          if (i > 0) controls.appendChild(FF.ui.button('↑', { class: 'icon-btn', ariaLabel: 'Move up', onClick: function () { FF.App.movePlayer(i, -1); } }));
          if (i < players.length - 1) controls.appendChild(FF.ui.button('↓', { class: 'icon-btn', ariaLabel: 'Move down', onClick: function () { FF.App.movePlayer(i, 1); } }));
          controls.appendChild(FF.ui.button('🗑️', { class: 'icon-btn danger', ariaLabel: 'Remove player', onClick: function () { FF.App.removePlayer(p.id); } }));
          row.appendChild(controls);
          list.appendChild(row);
        });
        main.appendChild(list);

        if (players.length < 2) main.appendChild(FF.ui.div('hint', 'Add at least 2 players for multiplayer fun.'));
        main.appendChild(FF.ui.button('↺ Reset Players', { class: 'btn', onClick: function () { FF.Players.reset(); FF.Nav.replace('players'); } }));

        // Teams
        main.appendChild(FF.App.sectionTitle('👥 Teams'));
        const teamToggle = FF.ui.div('settings-row');
        teamToggle.appendChild(FF.ui.div('settings-row__label', 'Team play'));
        const tt = FF.ui.div('seg');
        [['Off', false], ['On', true]].forEach(function (opt) {
          tt.appendChild(FF.ui.button(opt[0], { class: 'seg__btn' + (teams.enabled === opt[1] ? ' active' : ''), onClick: function () { FF.Teams.setEnabled(opt[1]); FF.Nav.replace('players'); } }));
        });
        teamToggle.appendChild(tt);
        main.appendChild(teamToggle);

        if (teams.enabled) {
          const countRow = FF.ui.div('settings-row');
          countRow.appendChild(FF.ui.div('settings-row__label', 'Number of teams'));
          const cs = FF.ui.div('seg');
          [2, 3, 4].forEach(function (n) {
            cs.appendChild(FF.ui.button(n + '', { class: 'seg__btn' + (teams.count === n ? ' active' : ''), onClick: function () { FF.Teams.setCount(n); FF.Nav.replace('players'); } }));
          });
          countRow.appendChild(cs);
          main.appendChild(countRow);

          const teamGrid = FF.ui.div('team-grid');
          teams.teams.forEach(function (tm) {
            const col = FF.ui.el('div', { class: 'team-col', style: { '--team-color': tm.color } });
            const head = FF.ui.div('team-col__head');
            head.appendChild(FF.ui.el('button', { class: 'team-col__name', onclick: function () { FF.App.renameTeam(tm.id); } }, tm.name + ' ✏️'));
            head.appendChild(FF.ui.el('div', { class: 'team-col__dot', style: { background: tm.color } }));
            col.appendChild(head);

            const members = FF.ui.div('team-col__members');
            tm.playerIds.forEach(function (pid) {
              const p = FF.Players.byId(pid);
              if (!p) return;
              members.appendChild(FF.ui.el('div', { class: 'team-member' }, p.avatar + ' ' + p.name));
            });
            col.appendChild(members);

            // assignment: choose which player to add
            const unassigned = players.filter(function (p) { return tm.playerIds.indexOf(p.id) === -1; });
            if (unassigned.length) {
              const addWrap = FF.ui.div('team-col__add');
              unassigned.forEach(function (p) {
                addWrap.appendChild(FF.ui.button(p.avatar + ' ' + p.name, { class: 'mini-btn', onClick: function () { FF.Teams.assign(tm.id, p.id); FF.Nav.replace('players'); } }));
              });
              col.appendChild(addWrap);
            }
            teamGrid.appendChild(col);
          });
          main.appendChild(teamGrid);
          main.appendChild(FF.ui.button('↺ Auto-assign evenly', { class: 'btn', onClick: function () { FF.Teams.autoAssign(FF.Teams.get()); FF.Teams.save(FF.Teams.get()); FF.Nav.replace('players'); } }));
        }
      },

      scores: function (main) {
        main.appendChild(FF.App.sectionTitle('🏆 Family Stats'));

        const session = FF.App.session;
        const stats = FF.Stats.get();

        const cards = FF.ui.div('stat-grid');
        function statCard(icon, label, value) {
          const c = FF.ui.div('stat-card');
          c.appendChild(FF.ui.div('stat-card__icon', icon));
          c.appendChild(FF.ui.div('stat-card__value', value));
          c.appendChild(FF.ui.div('stat-card__label', label));
          cards.appendChild(c);
        }
        statCard('🎮', 'Games played (session)', session.games);
        statCard('🏆', 'Games played (all time)', stats.gamesPlayed);
        statCard('🔥', 'Best streak', stats.bestStreak || 0);
        statCard('⚡', 'Fastest answer', stats.fastest != null ? stats.fastest.toFixed(3) + 's' : '—');
        statCard('🔤', 'Most words', stats.mostWords || 0);
        statCard('🧠', 'Quiz accuracy', stats.quizAnswered ? Math.round(stats.quizCorrect / stats.quizAnswered * 100) + '%' : '—');
        main.appendChild(cards);

        // Session leaderboard (wins)
        const names = Object.keys(session.wins);
        if (names.length) {
          main.appendChild(FF.App.sectionTitle('👑 Session Winners'));
          const lb = FF.ui.div('results__leaderboard');
          names.sort(function (a, b) { return session.wins[b] - session.wins[a]; }).forEach(function (name, i) {
            const row = FF.ui.div('results__row');
            row.appendChild(FF.ui.el('span', { class: 'results__rank' }, (i + 1) + '.'));
            row.appendChild(FF.ui.el('span', { class: 'results__avatar' }, '🏅'));
            row.appendChild(FF.ui.el('span', { class: 'results__name' }, name));
            row.appendChild(FF.ui.el('span', { class: 'results__pts' }, session.wins[name] + ' win' + (session.wins[name] === 1 ? '' : 's')));
            lb.appendChild(row);
          });
          main.appendChild(lb);
        }

        // Achievements
        main.appendChild(FF.App.sectionTitle('🎖️ Achievements'));
        const grid = FF.ui.div('achievement-grid');
        FF.Stats.ACHIEVEMENTS.forEach(function (a) {
          const unlocked = FF.Stats.isUnlocked(a.id);
          const c = FF.ui.div('achievement' + (unlocked ? ' unlocked' : ' locked'));
          c.appendChild(FF.ui.div('achievement__icon', a.icon));
          c.appendChild(FF.ui.div('achievement__name', a.name));
          c.appendChild(FF.ui.div('achievement__desc', a.desc));
          grid.appendChild(c);
        });
        main.appendChild(grid);
      },

      favorites: function (main) {
        const favs = FF.Favorites.get().map(FF.Games.get).filter(Boolean);
        main.appendChild(FF.App.sectionTitle('⭐ My Favorites (' + favs.length + ')'));
        if (!favs.length) {
          main.appendChild(FF.ui.div('empty', 'No favorites yet. Tap the ⭐ on any game card to add it here.'));
          main.appendChild(FF.ui.button('🎮 Browse Games', { primary: true, onClick: function () { FF.Nav.go('games'); } }));
        } else {
          main.appendChild(FF.App.gameGrid(favs));
          main.appendChild(FF.ui.button('🗑️ Clear Favorites', { class: 'btn', onClick: function () { FF.Favorites.clear(); FF.Nav.replace('favorites'); } }));
        }
      },

      gamenight: function (main) {
        main.appendChild(FF.App.sectionTitle('🌙 Game Night Setup'));
        const box = FF.ui.div('panel');
        box.appendChild(FF.ui.el('h3', {}, 'Build your tournament'));

        const cfg = { rounds: 5, difficulty: FF.Settings.get('difficulty'), timer: FF.Settings.get('timer') };

        function row(label, build) {
          const r = FF.ui.div('settings-row');
          r.appendChild(FF.ui.div('settings-row__label', label));
          r.appendChild(build());
          return r;
        }
        function seg(values, current, key) {
          const wrap = FF.ui.div('seg');
          values.forEach(function (v) {
            const b = FF.ui.button(v.label, { class: 'seg__btn' + (v.value === current ? ' active' : ''), onClick: function () {
              cfg[key] = v.value;
              FF.ui.$$('.seg__btn', wrap).forEach(function (x) { x.classList.remove('active'); });
              b.classList.add('active');
            } });
            wrap.appendChild(b);
          });
          return wrap;
        }

        box.appendChild(row('Rounds', function () {
          return seg([{ label: '3', value: 3 }, { label: '5', value: 5 }, { label: '10', value: 10 }], cfg.rounds, 'rounds');
        }));
        box.appendChild(row('Difficulty', function () {
          return seg([{ label: 'Easy', value: 'easy' }, { label: 'Normal', value: 'normal' }, { label: 'Hard', value: 'hard' }], cfg.difficulty, 'difficulty');
        }));
        box.appendChild(row('Per-round timer', function () {
          return seg([{ label: '10s', value: 10 }, { label: '20s', value: 20 }, { label: '30s', value: 30 }, { label: '60s', value: 60 }], cfg.timer, 'timer');
        }));

        const players = FF.Players.get();
        box.appendChild(FF.ui.div('hint', '👥 ' + FF.util.plural(players.length, 'player') + ' will compete across ' + cfg.rounds + ' random games.'));

        box.appendChild(FF.ui.button('🌙 START GAME NIGHT', { primary: true, class: 'btn-lg', onClick: function () { FF.Audio.play('roundStart'); FF.GameNight.start(cfg); } }));
        main.appendChild(box);
      },

      settings: function (main) {
        main.appendChild(FF.App.sectionTitle('⚙ Settings'));

        // Appearance
        main.appendChild(FF.ui.el('h3', { class: 'settings-group' }, '🎨 Appearance'));
        const themeRow = FF.ui.div('settings-row');
        themeRow.appendChild(FF.ui.div('settings-row__label', 'Theme'));
        const ts = FF.ui.div('seg');
        [['☀️ Light', 'light'], ['🌙 Dark', 'dark'], ['⚙ System', 'system']].forEach(function (opt) {
          ts.appendChild(FF.ui.button(opt[0], { class: 'seg__btn' + (FF.Theme.getTheme() === opt[1] ? ' active' : ''), onClick: function () { FF.Theme.setTheme(opt[1]); FF.Nav.replace('settings'); } }));
        });
        themeRow.appendChild(ts);
        main.appendChild(themeRow);

        const accentRow = FF.ui.div('settings-row');
        accentRow.appendChild(FF.ui.div('settings-row__label', 'Accent colour'));
        const acc = FF.ui.div('accent-picker');
        FF.Theme.accents.forEach(function (a) {
          acc.appendChild(FF.ui.el('button', {
            class: 'accent-swatch' + (FF.Theme.getAccent() === a.id ? ' active' : ''),
            style: { background: a.color }, ariaLabel: a.name, title: a.name,
            onClick: function () { FF.Theme.setAccent(a.id); FF.Nav.replace('settings'); }
          }));
        });
        accentRow.appendChild(acc);
        main.appendChild(accentRow);

        const fontRow = FF.ui.div('settings-row');
        fontRow.appendChild(FF.ui.div('settings-row__label', 'Font'));
        const fp = FF.ui.div('font-picker');
        FF.Theme.fonts.forEach(function (f) {
          fp.appendChild(FF.ui.el('button', {
            class: 'font-option' + (FF.Theme.getFont() === f.id ? ' active' : ''),
            style: { fontFamily: f.family }, text: f.name, title: f.name, ariaLabel: f.name,
            onClick: function () { FF.Theme.setFont(f.id); FF.Nav.replace('settings'); }
          }));
        });
        fontRow.appendChild(fp);
        main.appendChild(fontRow);

        const iconRow = FF.ui.div('settings-row');
        iconRow.appendChild(FF.ui.div('settings-row__label', 'Icon style'));
        const is = FF.ui.div('seg');
        [['✨ Custom', 'custom'], ['Phosphor', 'phosphor']].forEach(function (opt) {
          is.appendChild(FF.ui.button(opt[0], {
            class: 'seg__btn' + (FF.Icons.getStyle() === opt[1] ? ' active' : ''),
            onClick: function () { FF.Icons.setStyle(opt[1]); FF.Nav.replace('settings'); }
          }));
        });
        iconRow.appendChild(is);
        main.appendChild(iconRow);

        // Sound
        main.appendChild(FF.ui.el('h3', { class: 'settings-group' }, '🔊 Sound'));
        main.appendChild(FF.App.toggleRow('Sound effects', FF.Settings.get('sound'), function (on) { FF.Audio.setEffects(on); FF.Settings.set('sound', on); }));
        main.appendChild(FF.App.toggleRow('Music', FF.Settings.get('music'), function (on) { FF.Audio.setMusic(on); FF.Settings.set('music', on); }));
        const volRow = FF.ui.div('settings-row');
        volRow.appendChild(FF.ui.div('settings-row__label', 'Volume'));
        const vol = FF.ui.el('input', { type: 'range', min: 0, max: 100, value: Math.round(FF.Audio.volume * 100), oninput: function (e) { FF.Audio.setVolume(e.target.value / 100); FF.Settings.set('volume', FF.Audio.volume); } });
        volRow.appendChild(vol);
        main.appendChild(volRow);

        // Gameplay
        main.appendChild(FF.ui.el('h3', { class: 'settings-group' }, '🎮 Gameplay'));
        const diffRow = FF.ui.div('settings-row');
        diffRow.appendChild(FF.ui.div('settings-row__label', 'Default difficulty'));
        const ds = FF.ui.div('seg');
        [['Easy', 'easy'], ['Normal', 'normal'], ['Hard', 'hard']].forEach(function (opt) {
          ds.appendChild(FF.ui.button(opt[0], { class: 'seg__btn' + (FF.Settings.get('difficulty') === opt[1] ? ' active' : ''), onClick: function () { FF.Settings.set('difficulty', opt[1]); FF.Nav.replace('settings'); } }));
        });
        diffRow.appendChild(ds);
        main.appendChild(diffRow);

        const timerRow = FF.ui.div('settings-row');
        timerRow.appendChild(FF.ui.div('settings-row__label', 'Default timer'));
        const tsr = FF.ui.div('seg');
        [['Off', 0], ['10s', 10], ['20s', 20], ['30s', 30], ['60s', 60]].forEach(function (opt) {
          tsr.appendChild(FF.ui.button(opt[0], { class: 'seg__btn' + (FF.Settings.get('timer') === opt[1] ? ' active' : ''), onClick: function () { FF.Settings.set('timer', opt[1]); FF.Nav.replace('settings'); } }));
        });
        timerRow.appendChild(tsr);
        main.appendChild(timerRow);

        const dspRow = FF.ui.div('settings-row');
        dspRow.appendChild(FF.ui.div('settings-row__label', 'TV Display timer'));
        dspRow.appendChild(FF.SettingsUI.duration(FF.Settings.get('displaySeconds') || 60, function (s) { FF.Settings.set('displaySeconds', s); }));
        main.appendChild(dspRow);

        main.appendChild(FF.App.toggleRow('Animations', FF.Settings.get('animations'), function (on) { FF.Settings.set('animations', on); }));
        main.appendChild(FF.App.toggleRow('Reduce motion', FF.Settings.get('reduceMotion'), function (on) { FF.Settings.set('reduceMotion', on); FF.Theme.apply(); }));
        main.appendChild(FF.App.toggleRow('Random player order', FF.Settings.get('randomOrder'), function (on) { FF.Settings.set('randomOrder', on); }));
        main.appendChild(FF.App.toggleRow('Random questions', FF.Settings.get('randomQuestions'), function (on) { FF.Settings.set('randomQuestions', on); }));

        // Data
        main.appendChild(FF.ui.el('h3', { class: 'settings-group' }, '🗂️ Data'));
        main.appendChild(FF.ui.button('Clear favorites', { class: 'btn', onClick: function () { FF.Favorites.clear(); FF.App.toast('Favorites cleared'); } }));
        main.appendChild(FF.ui.button('Clear recent games', { class: 'btn', onClick: function () { FF.Recents.clear(); FF.App.toast('Recent games cleared'); } }));
        main.appendChild(FF.ui.button('🎬 Run Demo Mode', { class: 'btn', onClick: function () { FF.App.demo(); } }));
        main.appendChild(FF.ui.button('🗑️ Reset All Data', { class: 'btn danger', onClick: function () { FF.App.confirmReset(); } }));

        // Credits / About
        main.appendChild(FF.ui.el('h3', { class: 'settings-group' }, 'ℹ️ Info'));
        main.appendChild(FF.ui.button('📜 Credits & Sources', { class: 'btn', onClick: function () { FF.Nav.go('credits'); } }));
        main.appendChild(FF.ui.button('ℹ️ About Family Fun', { class: 'btn', onClick: function () { FF.Nav.go('about'); } }));
      },

      credits: function (main) {
        main.appendChild(FF.App.sectionTitle('📜 Credits & Sources'));
        const box = FF.ui.div('panel');
        box.appendChild(FF.ui.el('h3', {}, 'Family Fun — Asset Credits'));
        box.appendChild(FF.ui.el('p', {}, 'Family Fun is designed to be fully offline. All bundled assets are either original creations or legally redistributable content.'));
        box.appendChild(FF.ui.el('h4', {}, 'Original assets'));
        box.appendChild(FF.ui.el('p', {}, 'Logo, app icon, favicon, all SVG illustrations, flag artwork, sound effects and music are original creations generated for this project.'));
        box.appendChild(FF.ui.el('h4', {}, 'Fonts'));
        box.appendChild(FF.ui.el('p', {}, 'Bundled fonts (Nunito, Fredoka, Baloo 2, Quicksand, Atkinson Hyperlegible) are stored locally in assets/fonts/ and licensed under the SIL Open Font License.'));
        box.appendChild(FF.ui.el('h4', {}, 'Icons'));
        box.appendChild(FF.ui.el('p', {}, 'Menu and game icons use Phosphor Icons (MIT license), bundled in assets/icons/phosphor/ and inlined in js/icons.js. Unicode emoji remain for in-game content.'));
        box.appendChild(FF.ui.el('h4', {}, 'Photographs'));
        box.appendChild(FF.ui.el('p', {}, 'Real-world photographs for Guess the Landmark, Guess the Animal, Guess the Food and similar games can be dropped into assets/images/. See the README "Image Download List" for recommended public-domain sources (Wikimedia Commons, Openverse, Unsplash, Pexels) and required attribution.'));
        box.appendChild(FF.ui.el('h4', {}, 'Attribution'));
        box.appendChild(FF.ui.el('p', {}, 'Where third-party images are added by the user, keep their attribution alongside the files (e.g. a credits.txt in the relevant folder).'));
        main.appendChild(box);
      },

      about: function (main) {
        main.appendChild(FF.App.sectionTitle('ℹ️ About'));
        const box = FF.ui.div('panel panel--center');
        box.appendChild(FF.Brand.logo('brand-logo brand-logo--hero'));
        box.appendChild(FF.ui.el('h2', {}, FF.Brand.name));
        box.appendChild(FF.ui.el('p', {}, FF.Brand.tagline));
        box.appendChild(FF.ui.el('p', {}, 'Family Fun is an offline family game hub — a TV game console, board game collection, quiz show and party game hub in one.'));
        box.appendChild(FF.ui.div('about-privacy', '🔒 PRIVATE & OFFLINE\nFamily Fun does not require an account or internet connection. Your game settings and scores stay on this device.'));
        box.appendChild(FF.ui.el('p', { class: 'about-ver' }, 'Version 1.0.0'));
        main.appendChild(box);
      }
    },

    toggleRow: function (label, initial, onChange) {
      const row = FF.ui.div('settings-row');
      row.appendChild(FF.ui.div('settings-row__label', label));
      const sw = FF.ui.el('button', { class: 'switch' + (initial ? ' on' : ''), onclick: function () {
        const on = !sw.classList.contains('on');
        sw.classList.toggle('on', on);
        onChange(on);
        FF.Audio.play('click');
      }, 'aria-label': label });
      sw.appendChild(FF.ui.div('switch__knob', ''));
      row.appendChild(sw);
      return row;
    },

    toast: function (msg) {
      const t = FF.ui.div('toast', msg);
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
    },

    /* ================= Player/team editing ================= */
    addPlayer: function () {
      const name = FF.util.pick(['Alex', 'Sam', 'Jo', 'Max', 'Mia', 'Leo', 'Zoe', 'Kai', 'Ava', 'Ben']);
      FF.Players.add(name);
      FF.Audio.play('select');
      FF.Nav.replace('players');
    },

    removePlayer: function (id) {
      FF.Players.remove(id);
      FF.Audio.play('click');
      FF.Nav.replace('players');
    },

    renamePlayer: function (id) {
      const p = FF.Players.byId(id);
      const name = window.prompt('Player name:', p ? p.name : '');
      if (name) { FF.Players.rename(id, name.trim() || p.name); FF.Nav.replace('players'); }
    },

    pickAvatar: function (id) {
      const current = FF.Players.byId(id).avatar;
      const overlay = FF.ui.div('modal');
      const box = FF.ui.div('modal__box');
      box.appendChild(FF.ui.el('h2', {}, 'Choose Avatar'));
      const grid = FF.ui.div('avatar-grid');
      FF.Players.AVATARS.forEach(function (a) {
        grid.appendChild(FF.ui.button(a, { class: 'avatar-btn' + (a === current ? ' active' : ''), onClick: function () { FF.Players.setAvatar(id, a); FF.Nav.replace('players'); } }));
      });
      box.appendChild(grid);
      box.appendChild(FF.ui.button('Done', { class: 'btn', onClick: function () { FF.Nav.replace('players'); } }));
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    },

    pickColor: function (id) {
      const overlay = FF.ui.div('modal');
      const box = FF.ui.div('modal__box');
      box.appendChild(FF.ui.el('h2', {}, 'Choose Colour'));
      const grid = FF.ui.div('avatar-grid');
      FF.Players.COLORS.forEach(function (c) {
        grid.appendChild(FF.ui.el('button', { class: 'avatar-btn color-btn', style: { background: c }, onClick: function () { FF.Players.setColor(id, c); FF.Nav.replace('players'); } }, ''));
      });
      box.appendChild(grid);
      box.appendChild(FF.ui.button('Done', { class: 'btn', onClick: function () { FF.Nav.replace('players'); } }));
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    },

    movePlayer: function (index, delta) {
      const list = FF.Players.get();
      const j = index + delta;
      if (j < 0 || j >= list.length) return;
      const t = list[index]; list[index] = list[j]; list[j] = t;
      FF.Players.save(list);
      FF.Nav.replace('players');
    },

    renameTeam: function (id) {
      const t = FF.Teams.get();
      const team = t.teams.find(function (x) { return x.id === id; });
      const name = window.prompt('Team name:', team ? team.name : '');
      if (name) { FF.Teams.rename(id, name.trim() || team.name); FF.Nav.replace('players'); }
    },

    /* ================= Quick play / demo ================= */
    quickPlay: function () {
      const pool = FF.Games.all().filter(function (g) { return g.category !== 'creative' || g.id !== 'drawing'; });
      const def = FF.util.pick(pool);
      FF.Audio.play('roundStart');
      FF.GameFlow.launch(def.id, { skipIntro: true });
    },

    quickRound: function () {
      const pool = FF.Games.all().filter(function (g) { return g.duration <= 5; });
      const def = FF.util.pick(pool);
      FF.Audio.play('roundStart');
      FF.GameFlow.launch(def.id, { skipIntro: true, length: 'quick', timer: 20 });
    },

    demo: function () {
      const samples = [
        ['Sarah', '🥳', '#ec4899'], ['Daniel', '😎', '#3b82f6'],
        ['Emma', '🦊', '#10b981'], ['James', '🤓', '#f97316']
      ];
      FF.Storage.set('players', samples.map(function (s, i) {
        return { id: 'demo' + i, name: s[0], avatar: s[1], color: s[2] };
      }));
      FF.Teams.setEnabled(false);
      this.toast('Demo players added — starting a quick game!');
      setTimeout(function () { FF.App.quickPlay(); }, 600);
    },

    confirmReset: function () {
      const overlay = FF.ui.div('modal');
      const box = FF.ui.div('modal__box');
      box.appendChild(FF.ui.el('h2', {}, 'Reset All Data?'));
      box.appendChild(FF.ui.el('p', {}, 'This clears your settings, players, favorites and stats.'));
      const actions = FF.ui.div('pause-actions');
      actions.appendChild(FF.ui.button('↺ Reset Everything', { class: 'btn danger', onClick: function () {
        FF.Storage.clear();
        FF.Audio.init();
        FF.Theme.init();
        FF.Players.reset();
        FF.Teams.save({ enabled: false, count: 2, teams: FF.Teams.build(2) });
        FF.App.session = { games: 0, wins: {}, totalPoints: 0, players: {} };
        location.reload();
      } }));
      actions.appendChild(FF.ui.button('Cancel', { class: 'btn', primary: true, onClick: function () { overlay.parentNode.removeChild(overlay); } }));
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
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
