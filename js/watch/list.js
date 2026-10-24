/* ============================================================
   PLAYMONA — watch/list.js
   Watching (phase 3). The Watch live list: public games playing
   now, from /api/live (cached on the server, so browsing holds no
   Firebase connection). Refreshes every 10 seconds.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var POLL_MS = 10000;
  var CATEGORIES = {
    quiz: 'Quiz', words: 'Words', bible: 'Bible', world: 'World', visual: 'Pictures',
    memory: 'Memory', reaction: 'Reaction', numbers: 'Numbers', party: 'Party', creative: 'Creative'
  };

  function t(key, fallback, vars) {
    if (FF.t) return FF.t(key, fallback, vars);
    var s = fallback;
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function span(cls, kids) { return FF.ui.span(cls, kids); }

  function catName(id) { return t('cat_' + id, CATEGORIES[id] || 'Games'); }

  function statusText(r) {
    if (r.status === 'lobby') return t('pickingNext', 'Picking the next game');
    if (r.status === 'ended') return t('finalScoresShowing', 'Showing the final scores');
    if (!r.round) return t('startingSoon', 'Starting');
    return r.total
      ? t('questionOf', 'Question {n} of {total}', { n: r.round, total: r.total })
      : t('questionN', 'Question {n}', { n: r.round });
  }

  function icon(name) {
    return FF.Icons && FF.Icons.icon ? FF.Icons.icon(name) : document.createElement('i');
  }

  function card(r) {
    var cat = r.game && r.game.category ? r.game.category : null;
    var art = div('wl-card__art', [
      span('wl-tag' + (r.status === 'lobby' ? ' wl-tag--lobby' : ''), r.status === 'lobby' ? t('inLobby', 'IN LOBBY') : t('live', 'LIVE')),
      span('wl-eye', t('nWatching', '{n} watching', { n: r.viewers || 0 }))
    ]);
    if (cat) art.style.setProperty('--wl-cat', 'var(--cat-' + cat + ')');
    var gameIcon = div('wl-card__icon');
    gameIcon.appendChild(icon((r.game && FF.Icons && FF.Icons.game && FF.Icons.game[r.game.id]) || 'play'));
    art.appendChild(gameIcon);

    var people = div('wl-card__people');
    (r.players || []).slice(0, 8).forEach(function (p) {
      var img = FF.Avatars && FF.Avatars.img ? FF.Avatars.img(p.avatar, 'wl-card__ava') : document.createElement('img');
      img.setAttribute('alt', '');
      people.appendChild(img);
    });

    var body = div('wl-card__body', [
      FF.ui.el('h2', { class: 'wl-card__name' }, r.name || t('aRoom', 'A room')),
      FF.ui.el('p', { class: 'wl-card__game' }, (r.game && r.game.name ? r.game.name + ' · ' : '') + statusText(r)),
      people,
      span('wl-card__watch', t('watch', 'Watch'))
    ]);
    return FF.ui.el('a', { class: 'wl-card', href: 'watch/' + r.code, 'data-cat': cat || '' }, [art, body]);
  }

  /* Dev rooms mode (no PHP server): the same list from the dev bus. */
  function fromBroadcasts(all, watchers, now) {
    var out = [];
    Object.keys(all || {}).forEach(function (code) {
      var b = all[code];
      if (!b || b.public !== true || typeof b.updatedAt !== 'number' || now - b.updatedAt > 45000) return;
      var w = watchers && watchers[code] ? Object.keys(watchers[code]).length : 0;
      out.push({
        code: code, name: b.name, game: b.game, status: b.status,
        round: b.round && typeof b.round.n === 'number' ? b.round.n + 1 : null,
        total: b.round && b.round.total ? b.round.total : null,
        players: Object.keys(b.players || {}).map(function (k) { return { name: b.players[k].name, avatar: b.players[k].avatar }; }),
        viewers: w, updatedAt: b.updatedAt
      });
    });
    return out.sort(function (a, b) { return (b.viewers - a.viewers) || (b.updatedAt - a.updatedAt); });
  }

  function mount(container, opts) {
    opts = opts || {};
    var fetchJson = opts.fetch;
    var filter = 'all';
    var rooms = [];
    var failed = false;
    var loaded = false;
    var timer = null;
    var gone = false;

    var wrap = div('wl');
    var head = div('wl-head', [
      FF.ui.el('h1', { class: 'wl-title' }, t('watchLive', 'Watch live')),
      FF.ui.el('p', { class: 'wl-sub' }, t('watchLiveSub', 'Public rooms playing right now. Tap one to watch.'))
    ]);
    var chips = div('wl-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', t('filterGames', 'Filter games'));
    var grid = div('wl-grid');
    grid.setAttribute('aria-live', 'polite');
    wrap.appendChild(head);
    wrap.appendChild(chips);
    wrap.appendChild(grid);
    container.appendChild(wrap);

    function chip(id, label) {
      var b = FF.ui.el('button', { type: 'button', class: 'wl-chip' + (filter === id ? ' is-on' : ''), 'aria-pressed': filter === id ? 'true' : 'false' }, label);
      b.addEventListener('click', function () { filter = id; draw(); });
      return b;
    }

    function shown() {
      if (filter === 'all') return rooms;
      if (filter === 'most') return rooms.filter(function (r) { return r.viewers > 0; }).slice().sort(function (a, b) { return b.viewers - a.viewers; });
      return rooms.filter(function (r) { return r.game && r.game.category === filter; });
    }

    function draw() {
      FF.ui.clear(chips);
      chips.appendChild(chip('all', t('all', 'All')));
      var cats = [];
      rooms.forEach(function (r) {
        var c = r.game && r.game.category;
        if (c && cats.indexOf(c) === -1) cats.push(c);
      });
      cats.forEach(function (c) { chips.appendChild(chip(c, catName(c))); });
      chips.appendChild(chip('most', t('mostWatched', 'Most watched')));

      FF.ui.clear(grid);
      if (!loaded && !failed) {
        grid.appendChild(FF.ui.el('p', { class: 'wl-note' }, t('lookingForGames', 'Looking for live games…')));
        return;
      }
      if (failed && !rooms.length) {
        grid.appendChild(FF.ui.el('p', { class: 'wl-note' }, t('watchUnavailable', 'Watch live is not available right now. Try again soon.')));
        return;
      }
      shown().forEach(function (r) { grid.appendChild(card(r)); });
      grid.appendChild(div('wl-end', [
        FF.ui.el('p', {}, t('everyPublicGame', 'That’s every public game right now. Start your own room and make it public to appear here.')),
        FF.ui.el('a', { class: 'btn btn-primary', href: 'play' }, t('startARoom', 'Start a room'))
      ]));
    }

    function load() {
      if (gone) return;
      fetchJson('/api/live').then(function (res) {
        if (gone) return;
        if (res && res.status === 200 && res.body && Array.isArray(res.body.rooms)) {
          rooms = res.body.rooms;
          failed = false;
          loaded = true;
          draw();
          return;
        }
        throw new Error('unavailable');
      }).catch(function () {
        if (gone) return;
        if (opts.devList) {
          opts.devList().then(function (list) { rooms = list; failed = false; loaded = true; draw(); }, function () { failed = true; draw(); });
          return;
        }
        failed = true;
        draw();
      });
    }

    draw();
    load();
    timer = setInterval(load, opts.pollMs || POLL_MS);

    return {
      refresh: load,
      destroy: function () {
        gone = true;
        clearInterval(timer);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  }

  FF.WatchList = { mount: mount, fromBroadcasts: fromBroadcasts, POLL_MS: POLL_MS };
})();
