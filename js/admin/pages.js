/* ============================================================
   PLAYMONA — admin/pages.js
   The admin portal's pages: Overview, Games, Users, Live rooms
   and Site. Each page is a function (main) that draws into the
   main area and loads its own data.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var D = function () { return FF.AdminData; };
  var C = function () { return FF.AdminCharts; };
  var el = function (tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); };
  var icon = function (k) { return FF.Icons.icon(k); };

  /* ---------- Small helpers ---------- */
  function dayKey(d) { return d.toISOString().slice(0, 10); }
  function lastDays(n, offset) {
    var out = [];
    var now = new Date();
    for (var i = n - 1 + (offset || 0); i >= (offset || 0); i--) {
      var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      out.push(dayKey(d));
    }
    return out;
  }
  function shortDate(key) {
    var d = new Date(key + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  function longDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function ago(ts) {
    if (!ts) return '—';
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' days ago';
    return longDate(ts);
  }
  function num(n) { return (n || 0).toLocaleString(); }
  function catName(c) { return c ? c.charAt(0).toUpperCase() + c.slice(1) : ''; }
  function gameName(id) { var g = FF.Games.get(id); return g ? g.name : id; }
  function allGames() { return FF.Games._order.map(function (id) { return FF.Games.get(id); }); }

  function head(title, sub, actions) {
    var h = el('div', { class: 'admin-page-head' });
    var text = el('div', {});
    text.appendChild(el('h1', { class: 'page-title' }, title));
    if (sub) text.appendChild(el('p', { class: 'page-sub' }, sub));
    h.appendChild(text);
    if (actions) h.appendChild(actions);
    return h;
  }
  function card(title, sub) {
    var c = el('section', { class: 'admin-card' });
    if (title) c.appendChild(el('h2', { class: 'admin-card__title' }, title));
    if (sub) c.appendChild(el('p', { class: 'admin-card__sub' }, sub));
    return c;
  }
  function loading(target) { target.appendChild(el('p', { class: 'admin-loading' }, 'Loading…')); }
  function failed(target, e) {
    FF.ui.clear(target);
    var msg = (e && e.code === 'PERMISSION_DENIED') || /permission/i.test(e && e.message)
      ? 'The database refused this. Publish the latest database.rules.json, then try again.'
      : 'Could not load this. Check the connection and try again.';
    target.appendChild(el('p', { class: 'admin-error' }, msg));
  }
  function saved(ok) {
    FF.UI.toast(ok === false ? 'Not saved. Check the connection and try again.' : 'Saved', ok === false ? { type: 'error' } : null);
  }
  function selectBox(label, options, value, onChange) {
    var s = el('select', { class: 'input admin-select', 'aria-label': label });
    options.forEach(function (o) {
      var opt = el('option', { value: o.value }, o.label);
      if (String(o.value) === String(value)) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }
  function miniSwitch(label, on, onChange) {
    var sw = el('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label });
    sw.appendChild(FF.ui.div('switch__knob', ''));
    sw.addEventListener('click', function () {
      var next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      sw.classList.toggle('on', next);
      onChange(next, sw);
    });
    return sw;
  }
  function setSwitch(sw, on) { sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.classList.toggle('on', on); }

  /* ---------- Sums over a set of days ---------- */
  var COUNTERS = ['plays', 'onlinePlays', 'guestPlays', 'signups', 'installs', 'rooms'];
  function summarise(days, keys) {
    var sum = { accounts: {}, guests: {}, games: {}, visitors: {}, landingOnly: 0 };
    COUNTERS.forEach(function (c) { sum[c] = 0; });
    keys.forEach(function (k) {
      var d = days[k] || {};
      COUNTERS.forEach(function (c) { sum[c] += typeof d[c] === 'number' ? d[c] : 0; });
      Object.keys(d.active || {}).forEach(function (u) { (d.active[u] === 'g' ? sum.guests : sum.accounts)[u] = true; });
      Object.keys(d.games || {}).forEach(function (g) { sum.games[g] = (sum.games[g] || 0) + (d.games[g] || 0); });
      Object.keys(d.visitors || {}).forEach(function (v) { sum.visitors[v] = true; });
    });
    sum.visitorCount = Object.keys(sum.visitors).length;
    sum.activeAccounts = Object.keys(sum.accounts).length;
    sum.activeGuests = Object.keys(sum.guests).length;
    sum.active = sum.activeAccounts + sum.activeGuests;
    return sum;
  }
  function activeOn(days, k) { return Object.keys((days[k] || {}).active || {}).length; }
  function visitorsOn(days, k) { return Object.keys((days[k] || {}).visitors || {}).length; }

  function tile(label, value, prev, note) {
    var t = el('div', { class: 'kpi-tile' });
    t.appendChild(el('span', { class: 'kpi-tile__label' }, label));
    t.appendChild(el('strong', { class: 'kpi-tile__value' }, FF.AdminCharts.compact(value || 0)));
    if (prev != null) {
      var delta;
      if (!prev && !value) delta = el('span', { class: 'kpi-tile__delta' }, 'No change');
      else if (!prev) delta = el('span', { class: 'kpi-tile__delta is-up' }, 'New this period');
      else {
        var pct = Math.round(((value - prev) / prev) * 100);
        delta = el('span', { class: 'kpi-tile__delta ' + (pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : '') },
          (pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '') + pct + '% vs previous');
      }
      t.appendChild(delta);
    }
    if (note) t.appendChild(el('span', { class: 'kpi-tile__note' }, note));
    return t;
  }

  function dailyTable(keys, days) {
    var det = el('details', { class: 'admin-table-toggle' });
    det.appendChild(el('summary', {}, 'Show the numbers by day'));
    var wrap = el('div', { class: 'admin-table-wrap' });
    var tbl = el('table', { class: 'admin-table admin-table--num' });
    tbl.appendChild(el('thead', {}, [el('tr', {}, ['Day', 'Visitors', 'Active', 'Games played', 'Online', 'Guest plays', 'Sign-ups', 'Installs', 'Rooms'].map(function (h) { return el('th', { scope: 'col' }, h); }))]));
    var body = el('tbody');
    keys.slice().reverse().forEach(function (k) {
      var d = days[k] || {};
      body.appendChild(el('tr', {}, [
        el('th', { scope: 'row' }, shortDate(k)),
        el('td', {}, num(visitorsOn(days, k))),
        el('td', {}, num(activeOn(days, k))),
        el('td', {}, num(d.plays)), el('td', {}, num(d.onlinePlays)), el('td', {}, num(d.guestPlays)),
        el('td', {}, num(d.signups)), el('td', {}, num(d.installs)), el('td', {}, num(d.rooms))
      ]));
    });
    tbl.appendChild(body);
    wrap.appendChild(tbl);
    det.appendChild(wrap);
    return det;
  }

  var state = { range: 7, userSort: 'lastSeen', userKind: 'accounts' };

  FF.AdminPages = {
    /* ================= Overview ================= */
    overview: function (main) {
      var range = FF.UI.segmented({
        label: 'Time range', value: state.range,
        options: [{ label: '7 days', value: 7 }, { label: '30 days', value: 30 }, { label: '90 days', value: 90 }],
        onChange: function (v) { state.range = v; draw(); }
      });
      main.appendChild(head('Overview', 'How PlayMona is being used. Days are UTC dates.', range));
      var body = el('div', { class: 'admin-stack' });
      main.appendChild(body);

      function draw() {
        FF.ui.clear(body);
        loading(body);
        var n = state.range;
        var keys = lastDays(n);
        var prevKeys = lastDays(n, n);
        Promise.all([
          D().daysFrom(prevKeys[0]),
          D().get('stats/totals'),
          // Accounts that finished sign-up (each has a username). Not the public counter,
          // which only goes up, so deleted accounts would stay in it.
          D().accounts().then(function (a) { return a.length; })
        ]).then(function (res) {
          var days = res[0] || {}, totals = res[1] || {}, players = res[2] || 0;
          var now = summarise(days, keys), prev = summarise(days, prevKeys);
          FF.ui.clear(body);

          var tiles = el('div', { class: 'kpi-grid' });
          tiles.appendChild(tile('Visitors', now.visitorCount, prev.visitorCount, 'Devices that opened PlayMona, played or not'));
          tiles.appendChild(tile('Active players', now.active, prev.active, num(now.activeAccounts) + ' with accounts, ' + num(now.activeGuests) + ' guests'));
          tiles.appendChild(tile('Games played', now.plays, prev.plays, num(now.onlinePlays) + ' online, ' + num(now.guestPlays) + ' by guests'));
          tiles.appendChild(tile('New sign-ups', now.signups, prev.signups));
          tiles.appendChild(tile('App installs', now.installs, prev.installs));
          tiles.appendChild(tile('Rooms created', now.rooms, prev.rooms));
          body.appendChild(tiles);

          var all = card('All time');
          var allRow = el('div', { class: 'kpi-grid kpi-grid--quiet' });
          allRow.appendChild(tile('Registered players', players));
          allRow.appendChild(tile('Games played', totals.plays || 0));
          allRow.appendChild(tile('Online games', totals.onlinePlays || 0));
          allRow.appendChild(tile('App installs', totals.installs || 0));
          all.appendChild(allRow);
          all.appendChild(el('p', { class: 'admin-card__sub' }, 'Counting started on 23 Oct 2026 (visitors later that day); registered players are accounts that finished sign-up.'));

          var points = function (fn) { return keys.map(function (k) { return { key: k, label: shortDate(k), value: fn(k) }; }); };
          var visitCard = card('Visitors per day', 'Each device counts once a day, whether or not it played.');
          var c0 = el('div', { class: 'chart-box' });
          visitCard.appendChild(c0);
          var activeCard = card('Active players per day', 'Opened the app signed in or as a guest. Each person counts once a day.');
          var c2 = el('div', { class: 'chart-box' });
          activeCard.appendChild(c2);
          body.appendChild(el('div', { class: 'admin-grid-2' }, [visitCard, activeCard]));
          var playsCard = card('Games played per day');
          var c1 = el('div', { class: 'chart-box' });
          playsCard.appendChild(c1);
          C().line(c0, points(function (k) { return visitorsOn(days, k); }), { label: 'Visitors per day' });
          C().line(c2, points(function (k) { return activeOn(days, k); }), { label: 'Active players per day' });

          var top = card('Most played games', 'In the last ' + n + ' days.');
          var rows = Object.keys(now.games).map(function (id) {
            var g = FF.Games.get(id);
            return { label: gameName(id), sub: g ? catName(g.category) : '', value: now.games[id] };
          }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
          if (rows.length) { var c3 = el('div'); top.appendChild(c3); C().bars(c3, rows, { unit: 'plays' }); }
          else top.appendChild(el('p', { class: 'admin-empty' }, 'No games played in this period yet.'));

          body.appendChild(el('div', { class: 'admin-grid-2' }, [playsCard, top]));
          C().columns(c1, points(function (k) { return (days[k] || {}).plays || 0; }), { label: 'Games played per day' });
          body.appendChild(all);
          body.appendChild(dailyTable(keys, days));
        }).catch(function (e) { failed(body, e); });
      }
      draw();
    },

    /* ================= Games ================= */
    games: function (main) {
      main.appendChild(head('Games', 'Switch games on or off, choose what guests can play, and set badges. Players get changes the next time they open PlayMona.'));
      var tools = el('div', { class: 'admin-tools' });
      var search = el('input', { class: 'input', type: 'search', placeholder: 'Find a game', 'aria-label': 'Find a game' });
      tools.appendChild(search);
      var counts = el('span', { class: 'admin-tools__note' });
      tools.appendChild(counts);
      main.appendChild(tools);
      var box = el('div', { class: 'admin-table-wrap' });
      main.appendChild(box);
      loading(box);

      Promise.all([D().config(), D().daysFrom(lastDays(7)[0])]).then(function (res) {
        var games = (res[0] && res[0].games) || {};
        FF.GameConfig._set({ games: games, site: (res[0] && res[0].site) || {} });
        var week = summarise(res[1] || {}, lastDays(7));
        FF.ui.clear(box);

        var tbl = el('table', { class: 'admin-table admin-games' });
        tbl.appendChild(el('thead', {}, [el('tr', {}, ['Game', 'Plays (7 days)', 'On', 'Guests', 'Access', 'Free plays', 'Badge'].map(function (h) { return el('th', { scope: 'col' }, h); }))]));
        var tbody = el('tbody');
        var rows = [];

        function updateCounts() {
          var list = allGames();
          var on = list.filter(function (g) { return FF.GameConfig.game(g.id).enabled; }).length;
          var guest = list.filter(function (g) { var c = FF.GameConfig.game(g.id); return c.enabled && c.guest; }).length;
          counts.textContent = on + ' of ' + list.length + ' on · ' + guest + ' open to guests';
        }

        allGames().forEach(function (g) {
          var cfg = FF.GameConfig.game(g.id);
          var tr = el('tr', { dataset: { name: (g.name + ' ' + g.category).toLowerCase() } });
          function save(patch) {
            var cur = FF.GameConfig.game(g.id);
            var next = Object.assign({}, cur, patch);
            if (!next.badge) delete next.badge;
            games[g.id] = next;
            FF.GameConfig._set({ games: games, site: (res[0] && res[0].site) || {} });
            updateCounts();
            tr.classList.toggle('is-off', !next.enabled);
            return D().saveGame(g.id, next).then(function () { saved(); }, function () { saved(false); });
          }
          tr.classList.toggle('is-off', !cfg.enabled);
          var nameCell = el('th', { scope: 'row' });
          nameCell.appendChild(el('span', { class: 'admin-game__name' }, g.name));
          nameCell.appendChild(el('span', { class: 'admin-game__cat' }, catName(g.category)));
          tr.appendChild(nameCell);
          tr.appendChild(el('td', { class: 'num' }, num(week.games[g.id])));
          tr.appendChild(el('td', {}, [miniSwitch('Show ' + g.name + ' to players', cfg.enabled, function (on) { save({ enabled: on }); })]));
          tr.appendChild(el('td', {}, [miniSwitch('Guests can play ' + g.name, cfg.guest, function (on) { save({ guest: on }); })]));
          var free = el('input', { class: 'input admin-num', type: 'number', min: 0, max: 100, value: cfg.freePlays, 'aria-label': 'Free plays a day for ' + g.name });
          free.disabled = cfg.tier !== 'limited';
          free.addEventListener('change', function () { save({ freePlays: Math.max(0, Math.min(100, parseInt(free.value, 10) || 0)) }); });
          tr.appendChild(el('td', {}, [selectBox('Access for ' + g.name, [
            { label: 'Free', value: 'free' }, { label: 'Free plays, then Plus', value: 'limited' }, { label: 'Plus only', value: 'premium' }
          ], cfg.tier, function (v) { free.disabled = v !== 'limited'; save({ tier: v }); })]));
          tr.appendChild(el('td', {}, [free]));
          tr.appendChild(el('td', {}, [selectBox('Badge for ' + g.name, [
            { label: 'None', value: '' }, { label: 'New', value: 'new' }, { label: 'Hot', value: 'hot' }
          ], cfg.badge || '', function (v) { save({ badge: v || null }); })]));
          rows.push(tr);
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        box.appendChild(tbl);
        box.appendChild(el('p', { class: 'admin-card__sub' }, 'Access and free plays are saved now and take effect when payments arrive (phase 2). Guests can play only the games marked for guests.'));
        updateCounts();
        search.addEventListener('input', function () {
          var q = search.value.trim().toLowerCase();
          rows.forEach(function (r) { r.hidden = !!q && r.dataset.name.indexOf(q) === -1; });
        });
      }).catch(function (e) { failed(box, e); });
    },

    /* ================= Players: accounts and guests ================= */
    users: function (main) {
      main.appendChild(head('Players', 'Everyone with an account, and guests who play without one.'));
      var kindSwitch = FF.UI.segmented({
        label: 'Show', value: state.userKind,
        options: [{ label: 'Accounts', value: 'accounts', icon: 'user' }, { label: 'Guests', value: 'guests', icon: 'users' }],
        onChange: function (v) { state.userKind = v; state.userSort = 'lastSeen'; FF.AdminPages.users(FF.ui.clear(main)); }
      });
      main.appendChild(el('div', { class: 'admin-tools' }, [kindSwitch]));
      var guests = state.userKind === 'guests';
      var root = guests ? 'guestIndex' : 'userIndex';

      var summary = el('div', { class: 'kpi-grid kpi-grid--quiet' });
      main.appendChild(summary);
      var tools = el('div', { class: 'admin-tools' });
      var search = el('input', { class: 'input', type: 'search', placeholder: guests ? 'Search guests, e.g. Guest012' : 'Search by username', 'aria-label': guests ? 'Search guests' : 'Search by username' });
      tools.appendChild(search);
      tools.appendChild(FF.UI.segmented({
        label: 'Sort players', value: state.userSort, compact: true,
        options: [
          { label: 'Recently active', value: 'lastSeen' },
          { label: guests ? 'Newest' : 'Newest', value: guests ? 'firstSeen' : 'createdAt' },
          { label: 'Most games', value: 'plays' }
        ],
        onChange: function (v) { state.userSort = v; search.value = ''; list(); }
      }));
      main.appendChild(tools);
      var box = el('div', { class: 'admin-table-wrap' });
      main.appendChild(box);
      var bans = {};
      var todayKey = lastDays(1)[0];

      function activeToday(days, kind) {
        var a = ((days || {})[todayKey] || {}).active || {};
        return Object.keys(a).filter(function (u) { return a[u] === kind; }).length;
      }

      // Accounts from before the list existed are added first, so the list matches the total.
      var ready = guests ? Promise.resolve(null) : D().fillPlayerList().catch(function () { return null; });

      ready.then(function (accountCount) {
        return Promise.all([
          guests ? D().get('stats/guestSeq') : Promise.resolve(accountCount),
          D().daysFrom(todayKey)
        ]);
      }).then(function (res) {
        if (guests) {
          summary.appendChild(tile('Guests so far', res[0] || 0, null, 'Each device that played as a guest'));
          summary.appendChild(tile('Guests active today', activeToday(res[1], 'g')));
        } else {
          summary.appendChild(tile('Registered players', res[0] || 0));
          summary.appendChild(tile('Active today', activeToday(res[1], 'u')));
        }
      }).catch(function () {});

      function seen(ts) { return ts ? ago(ts) : 'Before 23 Oct'; }

      function suspendButton(r, label, rows) {
        var banned = !!bans[r.key];
        return FF.UI.button(banned ? 'Restore' : 'Suspend', { class: 'btn-sm ' + (banned ? '' : 'btn-ghost'), onClick: function () {
          if (banned) {
            D().unban(r.key).then(function () { delete bans[r.key]; saved(); render(rows); }, function () { saved(false); });
            return;
          }
          FF.UI.confirm({
            title: 'Suspend ' + label + '?',
            body: 'They can still open PlayMona, but cannot save progress, join rooms or post scores until you restore them.',
            confirmLabel: 'Suspend', danger: true,
            onConfirm: function () {
              D().ban(r.key, 'Suspended from the admin portal').then(function () { bans[r.key] = { t: Date.now() }; saved(); render(rows); }, function () { saved(false); });
            }
          });
        } });
      }

      function render(rows) {
        FF.ui.clear(box);
        if (!rows.length) {
          box.appendChild(el('p', { class: 'admin-empty' }, search.value ? 'Nobody matches that.' :
            (guests ? 'No guests yet. Guests appear here the first time they play without an account.' : 'No accounts yet.')));
          return;
        }
        var tbl = el('table', { class: 'admin-table' });
        var cols = guests ? ['Guest', 'First seen', 'Last seen', 'Games', 'App', 'Status', ''] : ['Player', 'Joined', 'Last seen', 'Games', 'App', 'Status', ''];
        tbl.appendChild(el('thead', {}, [el('tr', {}, cols.map(function (h) { return el('th', { scope: 'col' }, h); }))]));
        var tbody = el('tbody');
        rows.forEach(function (r) {
          var banned = !!bans[r.key];
          var who = el('th', { scope: 'row', class: 'admin-user' });
          if (r.avatar && FF.Avatars) who.appendChild(FF.Avatars.img(r.avatar, 'admin-user__ava'));
          var names = el('span', { class: 'admin-user__names' });
          var label;
          if (guests) {
            label = r.name || 'Guest';
            names.appendChild(el('span', { class: 'admin-user__name' }, label));
            var numberName = r.number ? FF.Track.guestName(r.number) : '';
            names.appendChild(el('span', { class: 'admin-user__handle' }, numberName && numberName !== label ? numberName : 'Guest'));
          } else {
            label = r.displayName || 'Player';
            names.appendChild(el('span', { class: 'admin-user__name' }, label));
            names.appendChild(el('span', { class: 'admin-user__handle' }, r.username ? '@' + r.username : (r.provider || '')));
          }
          who.appendChild(names);
          tbody.appendChild(el('tr', {}, [who,
            el('td', {}, guests ? longDate(r.firstSeen) : (r.createdAt ? longDate(r.createdAt) : '—')),
            el('td', {}, seen(r.lastSeen)),
            el('td', { class: 'num' }, num(r.plays)),
            el('td', {}, r.installed ? 'Installed' : '—'),
            el('td', {}, banned ? [el('span', { class: 'badge badge--danger' }, 'Suspended')] : '—'),
            el('td', {}, [suspendButton(r, label, rows)])
          ]));
        });
        tbl.appendChild(tbody);
        box.appendChild(tbl);
        if (rows.length >= 50 && !search.value) box.appendChild(el('p', { class: 'admin-card__sub admin-table-note' }, 'Showing 50. Search to find someone else.'));
      }

      function list() {
        FF.ui.clear(box);
        loading(box);
        var q = search.value.trim();
        // After the fill-in, so accounts from before the list existed are included.
        ready.then(function () {
          var rows = q ? (guests ? D().searchGuests(q) : D().searchUsers(q)) : D().usersBy(state.userSort, 50, root);
          return Promise.all([rows, D().bans()]);
        }).then(function (res) {
          bans = res[1] || {};
          render(res[0] || []);
        }).catch(function (e) { failed(box, e); });
      }
      var timer = null;
      search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(list, 300); });
      list();
    },

    /* ================= Live rooms ================= */
    rooms: function (main) {
      var refresh = FF.UI.button('Refresh', { class: 'btn-sm', icon: 'arrows-left-right', onClick: function () { draw(); } });
      main.appendChild(head('Live rooms', 'Online rooms open right now. Watching a room comes with watch links (phase 3).', refresh));
      var box = el('div', { class: 'admin-stack' });
      main.appendChild(box);

      function draw() {
        FF.ui.clear(box);
        loading(box);
        D().rooms().then(function (all) {
          FF.ui.clear(box);
          var now = Date.now();
          var codes = Object.keys(all || {});
          var live = codes.map(function (code) {
            var r = all[code] || {}, meta = r.meta || {}, players = r.players || {};
            var ids = Object.keys(players);
            return {
              code: code, meta: meta,
              total: ids.length,
              online: ids.filter(function (u) { return players[u] && players[u].online; }).length,
              host: (players[meta.hostUid] || {}).name || '—',
              voice: Object.keys(r.voice || {}).length
            };
          }).filter(function (r) { return r.online > 0 && (!r.meta.expiresAt || r.meta.expiresAt > now); })
            .sort(function (a, b) { return (b.meta.createdAt || 0) - (a.meta.createdAt || 0); });

          var tiles = el('div', { class: 'kpi-grid kpi-grid--quiet' });
          tiles.appendChild(tile('Open rooms', live.length));
          tiles.appendChild(tile('Players in rooms', live.reduce(function (s, r) { return s + r.online; }, 0)));
          tiles.appendChild(tile('Old rooms stored', codes.length - live.length, null, 'Finished or expired'));
          box.appendChild(tiles);

          if (!live.length) { box.appendChild(el('p', { class: 'admin-empty' }, 'No rooms are open right now.')); return; }
          var wrap = el('div', { class: 'admin-table-wrap' });
          var tbl = el('table', { class: 'admin-table' });
          tbl.appendChild(el('thead', {}, [el('tr', {}, ['Room', 'Game', 'Status', 'Players', 'Host', 'Voice', 'Opened'].map(function (h) { return el('th', { scope: 'col' }, h); }))]));
          var tbody = el('tbody');
          live.forEach(function (r) {
            tbody.appendChild(el('tr', {}, [
              el('th', { scope: 'row' }, [el('code', {}, r.code)]),
              el('td', {}, r.meta.gameId ? gameName(r.meta.gameId) : 'Choosing a game'),
              el('td', {}, catName(r.meta.status || '')),
              el('td', { class: 'num' }, r.online + (r.total > r.online ? ' of ' + r.total : '')),
              el('td', {}, r.host),
              el('td', { class: 'num' }, r.voice ? r.voice + ' talking' : '—'),
              el('td', {}, ago(r.meta.createdAt))
            ]));
          });
          tbl.appendChild(tbody);
          wrap.appendChild(tbl);
          box.appendChild(wrap);
        }).catch(function (e) { failed(box, e); });
      }
      draw();
    },

    /* ================= Site ================= */
    site: function (main) {
      main.appendChild(head('Site', 'Messages to players, maintenance, and what guests can use.'));
      var box = el('div', { class: 'admin-stack' });
      main.appendChild(box);
      loading(box);

      D().config().then(function (cfg) {
        FF.ui.clear(box);
        var site = Object.assign({ maintenance: false, announcement: '' }, cfg.site || {});
        site.guest = Object.assign({}, FF.GameConfig.GUEST_FEATURES, site.guest || {});
        function save() {
          var clean = { maintenance: !!site.maintenance, guest: site.guest };
          if (site.announcement) clean.announcement = site.announcement;
          return D().saveSite(clean).then(function () { saved(); }, function () { saved(false); });
        }

        var ann = card('Announcement', 'A short message at the top of the home screen, for news like a new game. Leave it empty to hide it.');
        var text = el('textarea', { class: 'input admin-textarea', maxlength: 200, rows: 3, 'aria-label': 'Announcement' });
        text.value = site.announcement || '';
        ann.appendChild(text);
        var annActs = el('div', { class: 'admin-actions' });
        annActs.appendChild(FF.UI.button('Save announcement', { class: 'btn-primary', icon: 'megaphone', onClick: function () { site.announcement = text.value.trim(); save(); } }));
        annActs.appendChild(FF.UI.button('Clear', { class: 'btn-ghost', onClick: function () { text.value = ''; site.announcement = ''; save(); } }));
        ann.appendChild(annActs);
        box.appendChild(ann);

        var maint = card('Maintenance');
        maint.appendChild(FF.UI.switchRow({
          label: 'Maintenance mode',
          description: 'Players see "Back in a moment" instead of the app. This portal keeps working, so you can switch it off here.',
          checked: !!site.maintenance,
          onChange: function (on) {
            if (!on) { site.maintenance = false; save(); return; }
            FF.UI.confirm({
              title: 'Turn on maintenance mode?', body: 'Everyone who opens PlayMona will see the maintenance screen until you turn it off.',
              confirmLabel: 'Turn on', danger: true,
              onConfirm: function () { site.maintenance = true; save(); },
              onCancel: function () { FF.AdminPages.site(FF.ui.clear(main)); }
            });
          }
        }));
        box.appendChild(maint);

        var guests = card('Guests', 'Guests play without an account. Each locked feature invites them to sign up free. Choose guest games on the Games page.');
        [
          { key: 'online', label: 'Play online with friends', desc: 'Create and join rooms.' },
          { key: 'daily', label: 'Daily challenge', desc: 'The daily 10 questions and leaderboard.' },
          { key: 'challenge', label: 'Challenge a friend', desc: 'Send and accept score challenges.' },
          { key: 'gameNight', label: 'Game night', desc: 'Tournaments of several games.' }
        ].forEach(function (f) {
          guests.appendChild(FF.UI.switchRow({
            label: f.label, description: f.desc, checked: !!site.guest[f.key],
            onChange: function (on) { site.guest[f.key] = on; save(); }
          }));
        });
        box.appendChild(guests);
      }).catch(function (e) { failed(box, e); });
    }
  };
})();
