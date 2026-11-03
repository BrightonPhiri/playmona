/* ============================================================
   PLAYMONA — leaderboards.js
   Global leaderboards and the "you're in the top 20" moment.

   - Which games count: every game that can be played solo, except
     party and creative games (people judge those). A game opts in
     or out with  leaderboard: true / false  in registerGame, and the
     admin portal can switch one out (config/games/<id>/ranked).
   - Which results count: solo, on the standard settings (normal
     difficulty and length, the usual timer, no game clock), by the
     signed-in account. Rooms and Game Night do not count.
   - Boards: the daily challenge (daily/<date>) and, per game, this
     week and all time (leaderboards/<game>/week/<week>, /all). Each
     keeps a player's best score.
   - After a counted result, a player in the top N (Site >
     Leaderboards in the admin portal, 20 by default) gets confetti
     and a link to their place on the Leaderboard page.

   FF.Leaderboards.views.leaderboard is the Leaderboard page.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  };
  var icon = function (k) { return FF.Icons.icon(k); };
  var fmt = function (n) { return FF.util.formatNumber(n || 0); };

  var EXCLUDED = ['party', 'creative'];
  var MAX_SCORE = 1000000;
  var BOARD_SIZE = 50;
  var FEATURED_SIZE = 10;
  var REPEAT_DAYS = 14;
  var CELEBRATE_DEFAULT = 20;
  // Shown until the server has counted a week of plays (api/cron.php).
  var DEFAULT_FEATURED = ['familyQuiz', 'guessFlag', 'wordScramble', 'quickTap', 'memoryMatch',
    'trueOrFalse', 'guessAnimal', 'capitalChallenge', 'letterRush', 'higherOrLower'];

  function utcKey(d) { return (d || new Date()).toISOString().slice(0, 10); }

  // ISO week (Monday start, UTC): "2026-W45". 29 Dec 2025 is in 2026-W01.
  function weekKey(d) {
    d = d || new Date();
    var day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var dow = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() + 4 - dow);
    var yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
    return day.getUTCFullYear() + '-W' + (week < 10 ? '0' : '') + week;
  }

  // Small string hash (FNV-1a), so a date always picks the same game.
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function me() {
    var p = (FF.Auth && FF.Auth.profile && FF.Auth.profile()) || {};
    var u = FF.Auth && FF.Auth.user && FF.Auth.user();
    return { uid: u ? u.uid : null, name: p.displayName || t('player', 'Player'), avatar: p.avatar || null };
  }

  function gameName(id) {
    var g = FF.Games.get(id);
    return g ? (FF.t ? FF.t('game_' + id, g.name) : g.name) : id;
  }

  function sortRows(rows) {
    return rows.filter(function (r) { return r && typeof r.score === 'number'; }).sort(function (a, b) {
      return (b.score - a.score) || ((a.ms || 0) - (b.ms || 0)) || ((a.t || 0) - (b.t || 0));
    });
  }

  /* Ranked list: rows [{ key, name, avatar, score, meta }]. opts: { meta(row), highlight } */
  function board(rows, myUid, opts) {
    opts = opts || {};
    var list = FF.ui.el('ol', { class: 'lb' });
    rows.forEach(function (r, i) {
      var mine = r.key === myUid;
      var li = FF.ui.el('li', { class: 'lb__row' + (mine ? ' is-me' : '') + (i < 3 ? ' lb__row--top' : '') + (mine && opts.highlight ? ' is-highlight' : '') });
      if (mine) li.id = 'lb-me';
      var rank = FF.ui.span('lb__rank');
      if (i < 3) { rank.classList.add('rank-medal', 'rank-medal--' + (i + 1)); rank.appendChild(icon('medal')); rank.appendChild(FF.ui.span('sr-only', String(i + 1))); }
      else rank.textContent = String(i + 1);
      li.appendChild(rank);
      li.appendChild(FF.Players.avatarEl({ name: r.name, avatar: r.avatar }, 'lb__ava'));
      var who = FF.ui.span('lb__name', r.name || t('player', 'Player'));
      if (mine) who.appendChild(FF.ui.span('lb__you', t('you', 'You')));
      li.appendChild(who);
      var meta = opts.meta ? opts.meta(r) : null;
      if (meta) li.appendChild(FF.ui.span('lb__meta', meta));
      li.appendChild(FF.ui.span('lb__score', fmt(r.score)));
      list.appendChild(li);
    });
    return list;
  }

  var LB = {
    MAX_SCORE: MAX_SCORE,
    BOARD_SIZE: BOARD_SIZE,
    DEFAULT_FEATURED: DEFAULT_FEATURED,
    REPEAT_DAYS: REPEAT_DAYS,
    utcKey: utcKey,
    weekKey: weekKey,
    sortRows: sortRows,
    board: board,
    gameName: gameName,

    /* ---------- Which games and results count ---------- */

    // The game itself can be on leaderboards (ignores admin switches).
    eligible: function (def) {
      if (!def || def.leaderboard === false) return false;
      if (def.leaderboard === true) return true;
      if (EXCLUDED.indexOf(def.category) !== -1) return false;
      return FF.Games.allowsSolo(def);
    },

    // Eligible, switched on, and not taken off leaderboards in the admin portal.
    active: function (def) {
      if (!this.eligible(def)) return false;
      if (!FF.GameConfig) return true;
      var c = FF.GameConfig.game(def.id);
      return c.enabled !== false && c.ranked !== false;
    },

    games: function () {
      var self = this;
      return FF.Games.all().filter(function (g) { return self.active(g); });
    },

    // The standard settings: what everyone on a board played with.
    standard: function () {
      var d = FF.Settings.defaults;
      return { difficulty: d.difficulty, length: d.length, timer: d.timer, clock: 0 };
    },

    /* Why this result does not count, or null when it counts. */
    unrankedReason: function (config) {
      if (!config || !config.def) return 'none';
      if (!this.active(config.def)) return 'game';
      if (config.room || config.tournament || config.variation === 'display') return 'mode';
      var s = this.standard();
      if (config.difficulty !== s.difficulty || config.length !== s.length || Number(config.timer) !== s.timer || config.clock) return 'settings';
      var scorers = config.scorers || [];
      if (scorers.length !== 1 || !(scorers[0].isMe || scorers[0].id === 'me')) return 'players';
      if (!FF.Cloud || !FF.Cloud.available()) return 'account';
      return null;
    },
    ranked: function (config) { return this.unrankedReason(config) === null; },

    /* A run that can become a friend challenge: the same fair settings as the boards.
       No account needed here; sending one checks the account separately. */
    challengeable: function (config) {
      var why = this.unrankedReason(config);
      return why === null || why === 'account';
    },

    // One line for the game details screen, or null for games that never count.
    detailsNote: function (def, config) {
      if (!this.active(def)) return null;
      var why = this.unrankedReason(config);
      if (!why) return t('lbCounts', 'This game counts for the leaderboard.');
      if (why === 'account') return t('lbNeedsAccount', 'Sign up free to get your scores on the leaderboard.');
      return t('lbStandardOnly', 'Solo games on the standard settings count for the leaderboard.');
    },

    /* ---------- Settings from the admin portal ---------- */

    threshold: function () {
      var s = (FF.GameConfig && FF.GameConfig.site().leaderboard) || {};
      var n = Math.round(Number(s.celebrateTop));
      return isFinite(n) && n >= 3 ? Math.min(100, n) : CELEBRATE_DEFAULT;
    },

    // "top 10" up to 10th place, otherwise "top N" (N is the admin's number).
    tier: function (rank, n) {
      n = n || this.threshold();
      if (!rank || rank > n) return 0;
      return rank <= 10 && n > 10 ? 10 : n;
    },

    /* The 10 games with the most plays this week (the server counts them), admin picks first. */
    featured: function () {
      var self = this;
      var pinned = ((FF.GameConfig && FF.GameConfig.site().leaderboard) || {}).pinned || [];
      var load = FF.Cloud && FF.Cloud.shared && FF.Cloud.shared()
        ? FF.Cloud.publicGet('leaderboards/featured').catch(function () { return null; })
        : Promise.resolve(null);
      return load.then(function (list) {
        var out = [];
        function add(id) {
          if (out.length >= FEATURED_SIZE || out.indexOf(id) !== -1) return;
          var def = FF.Games.get(id);
          if (def && self.active(def)) out.push(id);
        }
        pinned.forEach(add);
        (Array.isArray(list) ? list : []).forEach(add);
        DEFAULT_FEATURED.forEach(add);
        self.games().forEach(function (g) { add(g.id); });
        return out;
      });
    },

    /* ---------- The daily challenge's game ---------- */

    /* The same game for a date on every device: not one of `recent`, from `ids`. */
    pickDaily: function (dateKey, ids, recent) {
      var all = ids.slice().sort();
      if (!all.length) return null;
      var fresh = all.filter(function (id) { return (recent || []).indexOf(id) === -1; });
      var pool = fresh.length ? fresh : all;
      return pool[hash('daily|' + dateKey) % pool.length];
    },

    // Games used in the REPEAT_DAYS days before dateKey, from dailyMeta.
    recentDaily: function (meta, dateKey) {
      var out = [];
      var d = new Date(dateKey + 'T00:00:00Z');
      for (var i = 1; i <= REPEAT_DAYS; i++) {
        d.setUTCDate(d.getUTCDate() - 1);
        var m = meta && meta[utcKey(d)];
        if (m && m.game) out.push(m.game);
      }
      return out;
    },

    /* Today's game: the server picks it ahead (api/cron.php); if it has not, the first
       device picks with the same rule and saves it once, so everyone agrees. */
    dailyGame: function (dateKey) {
      var self = this;
      var cached = FF.Storage.get('dailyGame', null);
      if (cached && cached.day === dateKey && FF.Games.get(cached.game)) return Promise.resolve(cached.game);
      function keep(id) {
        if (id) FF.Storage.set('dailyGame', { day: dateKey, game: id });
        return id;
      }
      if (!FF.Cloud || !FF.Cloud.shared || !FF.Cloud.shared()) {
        return Promise.resolve(self.pickDaily(dateKey, self.games().map(function (g) { return g.id; }), []));
      }
      return FF.Cloud.publicGet('dailyMeta').catch(function () { return null; }).then(function (meta) {
        var saved = meta && meta[dateKey] && meta[dateKey].game;
        if (saved) return keep(saved);
        var pick = self.pickDaily(dateKey, self.games().map(function (g) { return g.id; }), self.recentDaily(meta, dateKey));
        if (!pick || !FF.Cloud.available()) return pick;
        return FF.Cloud.transaction('dailyMeta/' + dateKey, function (cur) {
          if (cur && cur.game) return undefined;   // someone saved it first: use theirs
          return { game: pick, by: 'device', t: Date.now() };
        }).then(function (r) {
          return keep((r.value && r.value.game) || pick);
        }, function () {
          // Lost the race to another device, or offline: read what is saved.
          return FF.Cloud.publicGet('dailyMeta/' + dateKey).then(function (m) { return keep((m && m.game) || pick); }, function () { return pick; });
        });
      });
    },

    // What was played on other days (for "Yesterday: ...").
    dailyGameOn: function (dateKey) {
      if (!FF.Cloud || !FF.Cloud.shared || !FF.Cloud.shared()) return Promise.resolve(null);
      return FF.Cloud.publicGet('dailyMeta/' + dateKey).then(function (m) { return (m && m.game) || null; }, function () { return null; });
    },

    /* ---------- Per-game boards ---------- */

    path: function (gameId, period, week) {
      return 'leaderboards/' + gameId + '/' + (period === 'all' ? 'all' : 'week/' + (week || weekKey()));
    },

    top: function (path, n) {
      return FF.Cloud.top(path, 'score', n || BOARD_SIZE).then(sortRows);
    },

    // 1-based place of uid in the top n of a board, or 0.
    rankIn: function (path, uid, n) {
      return this.top(path, n).then(function (rows) {
        for (var i = 0; i < rows.length; i++) if (rows[i].key === uid) return i + 1;
        return 0;
      });
    },

    /* Saves a counted score on the game's week and all-time boards when it beats the player's best.
       Resolves [{ period, rank, best }] for each board it improved. */
    submitGame: function (gameId, score) {
      var self = this;
      var who = me();
      score = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(score) || 0)));
      if (!who.uid || !score) return Promise.resolve([]);
      var n = this.threshold();
      var week = weekKey();
      var jobs = ['week', 'all'].map(function (period) {
        var at = self.path(gameId, period, week) + '/' + who.uid;
        return FF.Cloud.get(at).catch(function () { return null; }).then(function (cur) {
          if (cur && typeof cur.score === 'number' && cur.score >= score) return null;
          return FF.Cloud.set(at, { name: who.name, avatar: who.avatar, score: score, t: Date.now() }).then(function () {
            return self.rankIn(self.path(gameId, period, week), who.uid, n).then(function (rank) {
              return { period: period, rank: rank, best: score };
            });
          });
        }).catch(function () { return null; });
      });
      return Promise.all(jobs).then(function (r) { return r.filter(Boolean); });
    },

    /* Called by GameFlow.end for every finished game outside rooms. */
    afterGame: function (cur, results) {
      if (!cur || !cur.config || cur.config.daily || !this.ranked(cur.config)) return Promise.resolve([]);
      var mine = (results.results || []).filter(function (r) { return r.isMe || r.id === 'me'; })[0] || (results.results || [])[0];
      if (!mine) return Promise.resolve([]);
      var self = this;
      var id = cur.def.id;
      return this.submitGame(id, mine.points).then(function (places) {
        var lines = places.filter(function (p) { return p.rank; }).sort(function (a, b) { return a.period === 'all' ? -1 : b.period === 'all' ? 1 : 0; });
        lines.forEach(function (p) { self.remember(id + ':' + p.period, { rank: p.rank, game: id, period: p.period }); });
        if (lines.length) self.celebrate({ game: id, places: lines });
        return places;
      });
    },

    /* ---------- My placings (for the strip on the Leaderboard page) ---------- */

    remember: function (boardKey, place) {
      var all = FF.Storage.get('lbPlaces', {}) || {};
      all[boardKey] = Object.assign({ t: Date.now(), week: weekKey(), day: utcKey() }, place);
      FF.Storage.set('lbPlaces', all);
    },
    places: function () {
      var all = FF.Storage.get('lbPlaces', {}) || {};
      var week = weekKey(), day = utcKey();
      return Object.keys(all).map(function (k) { return all[k]; }).filter(function (p) {
        if (p.period === 'week') return p.week === week;
        if (p.period === 'daily') return p.day === day;
        return true;
      }).sort(function (a, b) { return a.rank - b.rank; });
    },

    /* ---------- The celebration ---------- */

    // The words for one board: "You're in the top 10 globally for Quick Tap this week."
    placeLine: function (p, gameId, n) {
      var tier = this.tier(p.rank, n);
      var game = gameName(gameId);
      if (p.period === 'daily') return t('lbTierDaily', 'You’re in the top {n} globally in today’s daily challenge ({game}).', { n: tier, game: game });
      if (p.period === 'all') return t('lbTierAll', 'You’re in the top {n} globally of all time for {game}.', { n: tier, game: game });
      return t('lbTierWeek', 'You’re in the top {n} globally for {game} this week.', { n: tier, game: game });
    },

    /* opts: { game, places: [{ period, rank }] } — best board first. */
    celebrate: function (opts) {
      var self = this;
      var n = this.threshold();
      var first = opts.places[0];
      if (!first || !first.rank) return null;
      var body = FF.ui.div('lb-celebrate');
      var badge = FF.ui.div('lb-celebrate__badge');
      badge.appendChild(icon('trophy'));
      body.appendChild(badge);
      body.appendChild(FF.ui.el('p', { class: 'lb-celebrate__rank' }, t('lbYoureRank', 'You’re #{n} in the world.', { n: first.rank })));
      opts.places.forEach(function (p) {
        body.appendChild(FF.ui.el('p', { class: 'lb-celebrate__line' }, self.placeLine(p, opts.game, n)));
      });
      if (FF.Audio) FF.Audio.play('winner');
      if (FF.Confetti && FF.Settings.get('animations') && !FF.Settings.get('reduceMotion')) {
        FF.Confetti.burst(200);
        if (FF.Confetti.sideCannons) FF.Confetti.sideCannons();
      }
      FF.UI.announce(t('lbYoureRank', 'You’re #{n} in the world.', { n: first.rank }));
      var dlg = FF.UI.dialog({
        title: t('lbCongrats', 'Congratulations!'),
        body: body,
        actions: [
          { label: t('lbNotNow', 'Not now') },
          { label: t('lbSeePosition', 'See my position'), primary: true, icon: 'trophy', onClick: function () {
            var params = { tab: first.period === 'daily' ? 'daily' : 'games', game: opts.game, period: first.period === 'all' ? 'all' : 'week', highlight: true };
            if (FF.GameFlow && FF.GameFlow.current) FF.GameFlow.close('leaderboard', params);
            else FF.Nav.go('leaderboard', params);
          } }
        ]
      });
      return dlg;
    }
  };

  /* =======================================================
     The Leaderboard page
     ======================================================= */
  var state = { tab: 'daily', game: null, period: 'week', day: 'today' };

  function comingSoon(iconKey, title, text) {
    var c = FF.ui.el('section', { class: 'social-card lb-soon' });
    var ic = FF.ui.span('lb-soon__icon');
    ic.appendChild(icon(iconKey));
    c.appendChild(ic);
    c.appendChild(FF.ui.el('h2', { class: 'lb-soon__title' }, title));
    c.appendChild(FF.ui.el('p', { class: 'lb-soon__text' }, text));
    c.appendChild(FF.ui.span('lb-soon__badge', t('comingSoon', 'Coming soon')));
    return c;
  }

  function guestNote() {
    var n = FF.ui.div('social-note');
    n.appendChild(icon('user'));
    n.appendChild(FF.ui.span('social-note__text', t('lbGuest', 'Create a free account to see the leaderboard and get your name on it.')));
    n.appendChild(FF.UI.button(t('createAccount', 'Create account'), { class: 'btn-sm btn-primary', onClick: function () { FF.App.openAccount('signup'); } }));
    return n;
  }

  function offlineNote() {
    var n = FF.ui.div('social-note');
    n.appendChild(icon('wifi'));
    n.appendChild(FF.ui.span('social-note__text', t('lbOffline', 'The leaderboard could not load. Check your connection and try again.')));
    return n;
  }

  function scrollToMe(holder) {
    var row = holder.querySelector('#lb-me');
    if (row && row.scrollIntoView) setTimeout(function () { try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(); } }, 60);
  }

  // A board with a loading row, then the rows, or a note. `mine` is the player's own entry path.
  function drawBoard(holder, path, opts) {
    FF.ui.clear(holder);
    holder.appendChild(FF.UI.loading(t('loading', 'Loading…')));
    var who = me();
    return LB.top(path, BOARD_SIZE).then(function (rows) {
      FF.ui.clear(holder);
      if (!rows.length) {
        holder.appendChild(FF.ui.el('p', { class: 'social-empty' }, opts.empty));
        return;
      }
      holder.appendChild(board(rows, who.uid, { meta: opts.meta, highlight: opts.highlight }));
      var mine = rows.some(function (r) { return r.key === who.uid; });
      if (mine) { if (opts.highlight) scrollToMe(holder); return; }
      FF.Cloud.get(path + '/' + who.uid).then(function (own) {
        if (!own || typeof own.score !== 'number') return;
        var you = FF.ui.div('lb-you');
        you.appendChild(FF.ui.span('lb-you__label', t('lbYou', 'You')));
        you.appendChild(FF.ui.span('lb-you__score', fmt(own.score)));
        you.appendChild(FF.ui.span('lb-you__note', t('lbNotTopN', 'Not in the top {n} yet. Keep going!', { n: BOARD_SIZE })));
        holder.appendChild(you);
      }).catch(function () {});
    }).catch(function () {
      FF.ui.clear(holder);
      holder.appendChild(offlineNote());
    });
  }

  function placesStrip() {
    var places = LB.places();
    if (!places.length) return null;
    var strip = FF.ui.el('ul', { class: 'lb-places', 'aria-label': t('lbYourPlaces', 'Your places') });
    places.slice(0, 6).forEach(function (p) {
      var li = FF.ui.el('li', {});
      var b = FF.ui.el('button', { type: 'button', class: 'lb-place' });
      b.appendChild(FF.ui.el('strong', { class: 'lb-place__rank' }, '#' + p.rank));
      var label = p.period === 'daily' ? t('lbDailyToday', 'Daily challenge') : gameName(p.game);
      var when = p.period === 'all' ? t('lbAllTime', 'All time') : p.period === 'daily' ? t('today', 'Today') : t('lbThisWeek', 'This week');
      b.appendChild(FF.ui.span('lb-place__text', label + ' · ' + when));
      b.addEventListener('click', function () {
        FF.Nav.go('leaderboard', { tab: p.period === 'daily' ? 'daily' : 'games', game: p.game, period: p.period === 'all' ? 'all' : 'week', highlight: true });
      });
      li.appendChild(b);
      strip.appendChild(li);
    });
    return strip;
  }

  function dailyTab(box, highlight) {
    var D = FF.Daily;
    var tools = FF.ui.div('lb-tools');
    tools.appendChild(FF.UI.segmented({
      label: t('lbWhichDay', 'Which day'), value: state.day, compact: true,
      options: [{ label: t('today', 'Today'), value: 'today' }, { label: t('yesterday', 'Yesterday'), value: 'yesterday' }],
      onChange: function (v) { state.day = v; draw(false); }
    }));
    box.appendChild(tools);
    var title = FF.ui.el('p', { class: 'lb-caption' }, '');
    box.appendChild(title);
    var holder = FF.ui.div('social-board');
    box.appendChild(holder);
    function draw(hl) {
      var d = new Date();
      if (state.day === 'yesterday') d.setUTCDate(d.getUTCDate() - 1);
      var key = utcKey(d);
      title.textContent = '';
      (state.day === 'today' ? LB.dailyGame(key) : LB.dailyGameOn(key)).then(function (id) {
        title.textContent = id ? t('lbDailyGame', 'Game: {game}', { game: gameName(id) }) : (state.day === 'today' ? '' : t('lbDailyQuiz', 'Game: daily quiz'));
      });
      var after = state.day === 'today' && D ? D.submit().catch(function () {}) : Promise.resolve();
      after.then(function () {
        drawBoard(holder, 'daily/' + key, {
          highlight: hl,
          empty: state.day === 'today' ? t('lbEmpty', 'No scores yet today. Be the first.') : t('lbEmptyDay', 'Nobody played that day.')
        });
      });
    }
    var cta = D && !D.played() ? FF.UI.button(t('startDaily', 'Start today’s challenge'), { class: 'btn-primary', icon: 'play', onClick: function () { D.start(); } }) : null;
    if (cta) tools.appendChild(cta);
    draw(highlight);
  }

  function gamesTab(box, highlight) {
    var holder = FF.ui.div('social-board');
    var chips = FF.ui.el('div', { class: 'lb-chips', role: 'group', 'aria-label': t('lbPickGame', 'Pick a game') });
    var tools = FF.ui.div('lb-tools');
    var picker = FF.ui.el('select', { class: 'input lb-picker', 'aria-label': t('lbAllGames', 'All games') });
    picker.appendChild(FF.ui.el('option', { value: '' }, t('lbAllGamesPick', 'All games…')));
    LB.games().slice().sort(function (a, b) { return gameName(a.id).localeCompare(gameName(b.id)); }).forEach(function (g) {
      picker.appendChild(FF.ui.el('option', { value: g.id }, gameName(g.id)));
    });
    tools.appendChild(FF.UI.segmented({
      label: t('lbPeriod', 'Period'), value: state.period, compact: true,
      options: [{ label: t('lbThisWeek', 'This week'), value: 'week' }, { label: t('lbAllTime', 'All time'), value: 'all' }],
      onChange: function (v) { state.period = v; draw(false); }
    }));
    tools.appendChild(picker);
    box.appendChild(FF.ui.el('p', { class: 'lb-caption' }, t('lbMostPlayed', 'The most played games this week. Solo games on the standard settings count.')));
    box.appendChild(chips);
    box.appendChild(tools);
    box.appendChild(holder);

    var featured = [];
    function drawChips() {
      FF.ui.clear(chips);
      var list = featured.slice();
      if (state.game && list.indexOf(state.game) === -1) list.unshift(state.game);
      list.forEach(function (id) {
        var on = id === state.game;
        var b = FF.ui.el('button', { type: 'button', class: 'chip lb-chip' + (on ? ' active' : ''), 'aria-pressed': on ? 'true' : 'false' }, gameName(id));
        b.addEventListener('click', function () { state.game = id; picker.value = ''; drawChips(); draw(false); });
        chips.appendChild(b);
      });
    }
    function draw(hl) {
      if (!state.game) return;
      drawBoard(holder, LB.path(state.game, state.period), {
        highlight: hl,
        empty: state.period === 'week' ? t('lbEmptyWeek', 'No scores this week yet. Be the first.') : t('lbEmptyAll', 'No scores yet. Be the first.')
      });
    }
    picker.addEventListener('change', function () {
      if (!picker.value) return;
      state.game = picker.value;
      drawChips();
      draw(false);
    });
    LB.featured().then(function (ids) {
      featured = ids;
      if (!state.game || !FF.Games.get(state.game)) state.game = ids[0] || null;
      drawChips();
      draw(highlight);
    });
  }

  LB.views = {
    leaderboard: function (main, params) {
      params = params || {};
      if (params.tab) state.tab = params.tab;
      if (params.game) state.game = params.game;
      if (params.period) state.period = params.period;
      if (params.tab === 'daily') state.day = 'today';
      var highlight = !!params.highlight;
      if (FF.App._currentParams) FF.App._currentParams = {};   // a refresh should not scroll again

      main.appendChild(FF.App.pageBanner(t('leaderboards', 'Leaderboards'),
        t('lbLead', 'See how you rank against players everywhere: the daily challenge, the most played games, and soon leagues and tournaments.'),
        FF.Assets.artUrl('ui', 'gamenight')));

      if (!FF.Cloud.available()) { main.appendChild(guestNote()); return; }

      var strip = placesStrip();
      if (strip) {
        main.appendChild(FF.App.sectionHead(t('lbYourPlaces', 'Your places')));
        main.appendChild(strip);
      }

      var tabs = FF.ui.div('lb-tabs');
      tabs.appendChild(FF.UI.segmented({
        label: t('leaderboards', 'Leaderboards'), value: state.tab,
        options: [
          { label: t('lbDailyToday', 'Daily challenge'), value: 'daily', icon: 'calendar' },
          { label: t('lbGames', 'Games'), value: 'games', icon: 'game-controller' },
          { label: t('leagues', 'Leagues'), value: 'leagues', icon: 'shield' },
          { label: t('tournaments', 'Tournaments'), value: 'tournaments', icon: 'trophy' }
        ],
        onChange: function (v) { state.tab = v; drawTab(false); }
      }));
      main.appendChild(tabs);
      var box = FF.ui.div('lb-panel');
      main.appendChild(box);

      function drawTab(hl) {
        FF.ui.clear(box);
        if (state.tab === 'daily') dailyTab(box, hl);
        else if (state.tab === 'games') gamesTab(box, hl);
        else if (state.tab === 'leagues') box.appendChild(comingSoon('shield', t('leagues', 'Leagues'), t('lbLeaguesSoon', 'Play through the season, move up a division, and see where you finish.')));
        else box.appendChild(comingSoon('trophy', t('tournaments', 'Tournaments'), t('lbTournamentsSoon', 'Timed events with their own leaderboard and a champion at the end.')));
      }
      drawTab(highlight);
    }
  };

  FF.Leaderboards = LB;
})();
