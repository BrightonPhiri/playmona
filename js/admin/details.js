/* ============================================================
   PLAYMONA — admin/details.js
   The windows that open from the Overview stat tiles.

   Each one shows the people or games behind a number. While
   PlayMona is small they list everyone; once a list gets long
   they switch to a summary (visitors group by country, players
   by how many days they came back) and keep the top of the list.

   ctx (from the Overview page): { range, keys, prevKeys, days, now, prev }
   where days is stats/days for both periods and now/prev are the
   sums from summarise().
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var K = function () { return FF.AdminKit; };
  var D = function () { return FF.AdminData; };
  var C = function () { return FF.AdminCharts; };
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }

  var PEOPLE_LIMIT = 100;   // people listed before a window shows "the most active 100"
  var PAGE_NAMES = { l: 'Landing page', a: 'The app', p: 'Privacy, Terms or Refunds' };

  /* ---------- Shared pieces ---------- */
  function rangeText(ctx) {
    return 'Last ' + ctx.range + ' days, ' + K().shortDate(ctx.keys[0]) + ' – ' + K().shortDate(ctx.keys[ctx.keys.length - 1]) + ' (UTC).';
  }

  function openWindow(title, ctx) {
    var body = el('div', { class: 'admin-detail' });
    body.appendChild(el('p', { class: 'admin-card__sub' }, rangeText(ctx)));
    var dlg = FF.UI.dialog({ title: title, body: body, wide: true, className: 'admin-detail-dialog' });
    body.close = dlg.close;
    return body;
  }

  function stats(items) {
    var row = el('div', { class: 'kpi-grid kpi-grid--quiet admin-detail__stats' });
    items.forEach(function (it) { row.appendChild(K().tile(it[0], it[1], null, it[2])); });
    return row;
  }

  function section(title, sub) {
    var s = el('section', { class: 'admin-detail__section' });
    s.appendChild(el('h3', { class: 'admin-detail__title' }, title));
    if (sub) s.appendChild(el('p', { class: 'admin-card__sub' }, sub));
    return s;
  }

  function table(cols, rows, numeric) {
    var wrap = el('div', { class: 'admin-table-wrap' });
    var tbl = el('table', { class: 'admin-table' });
    tbl.appendChild(el('thead', {}, [el('tr', {}, cols.map(function (h, i) {
      return el('th', { scope: 'col', class: numeric && numeric.indexOf(i) !== -1 ? 'num' : '' }, h);
    }))]));
    var body = el('tbody');
    rows.forEach(function (cells) {
      body.appendChild(el('tr', {}, cells.map(function (c, i) {
        var tag = i === 0 ? 'th' : 'td';
        var attrs = i === 0 ? { scope: 'row' } : {};
        if (numeric && numeric.indexOf(i) !== -1) attrs.class = 'num';
        return el(tag, attrs, c == null ? '—' : (typeof c === 'object' ? [c] : String(c)));
      })));
    });
    tbl.appendChild(body);
    wrap.appendChild(tbl);
    return wrap;
  }

  function perDay(ctx, field) {
    return ctx.keys.map(function (k) { return { key: k, label: K().shortDate(k), value: (ctx.days[k] || {})[field] || 0 }; });
  }

  function columnsChart(ctx, field, label) {
    var box = el('div', { class: 'chart-box' });
    // Drawn after the window is on screen, so the chart knows its width.
    setTimeout(function () { C().columns(box, perDay(ctx, field), { label: label }); }, 0);
    return box;
  }

  function note(text) { return el('p', { class: 'admin-card__sub admin-detail__note' }, text); }

  function person(entry, kind) {
    var who = el('span', { class: 'admin-user' });
    if (entry && entry.avatar && FF.Avatars) who.appendChild(FF.Avatars.img(entry.avatar, 'admin-user__ava'));
    var names = el('span', { class: 'admin-user__names' });
    if (kind === 'g') {
      var label = (entry && entry.name) || 'Guest';
      var numbered = entry && entry.number && FF.Track ? FF.Track.guestName(entry.number) : '';
      names.appendChild(el('span', { class: 'admin-user__name' }, label));
      names.appendChild(el('span', { class: 'admin-user__handle' }, numbered && numbered !== label ? numbered : 'Guest'));
    } else {
      names.appendChild(el('span', { class: 'admin-user__name' }, (entry && entry.displayName) || 'Player'));
      names.appendChild(el('span', { class: 'admin-user__handle' }, entry && entry.username ? '@' + entry.username : 'Account'));
    }
    who.appendChild(names);
    return who;
  }

  /* ---------- Countries ---------- */
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}

  function countryName(code) {
    if (!code || code === 'unknown') return 'Unknown';
    if (code === 'T1') return 'Tor network';
    try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
  }

  function country(code) {
    var wrap = el('span', { class: 'admin-country' });
    if (code && code !== 'unknown' && code !== 'T1') {
      var img = el('img', { class: 'admin-country__flag', src: 'assets/flags/' + code.toLowerCase() + '.svg', alt: '', width: 20, height: 15, loading: 'lazy' });
      img.addEventListener('error', function () { img.remove(); });
      wrap.appendChild(img);
    } else {
      wrap.appendChild(FF.Icons.icon('globe'));
    }
    wrap.appendChild(el('span', {}, countryName(code)));
    return wrap;
  }

  function share(n, total) {
    var pct = total ? Math.round((n / total) * 100) : 0;
    var w = el('span', { class: 'admin-share' });
    var bar = el('span', { class: 'admin-share__bar' });
    bar.style.width = Math.max(2, pct) + '%';
    w.appendChild(el('span', { class: 'admin-share__track' }, [bar]));
    w.appendChild(el('span', { class: 'admin-share__pct' }, pct + '%'));
    return w;
  }

  /* ================= Visitors ================= */
  function visitors(ctx) {
    var body = openWindow('Visitors', ctx);

    // From Firebase: every device counted, and where it landed.
    var seen = {};
    ctx.keys.forEach(function (k) {
      var v = (ctx.days[k] || {}).visitors || {};
      Object.keys(v).forEach(function (id) {
        var s = seen[id] || (seen[id] = { pages: {}, days: 0 });
        s.pages[v[id]] = true;
        s.days++;
      });
    });
    var ids = Object.keys(seen);
    var app = ids.filter(function (id) { return seen[id].pages.a; }).length;
    var back = ids.filter(function (id) { return seen[id].days > 1; }).length;
    body.appendChild(stats([
      ['Unique visitors', ids.length],
      ['Opened the app', app, ids.length ? Math.round((app / ids.length) * 100) + '% of visitors' : null],
      ['Only saw the landing page', ids.length - app],
      ['Came back another day', back]
    ]));

    var where = section('Where visitors are', null);
    body.appendChild(where);
    var tools = el('div', { class: 'admin-tools' });
    var box = el('div');
    where.appendChild(tools);
    where.appendChild(box);
    where.appendChild(note('Countries come from Cloudflare. IP addresses are shortened (41.216.x.x) before they are saved, and kept for about 13 months. Recording started on 24 Oct 2026, so earlier days are missing here.'));

    var from = ctx.keys[0], to = ctx.keys[ctx.keys.length - 1];
    var view = null;   // the server picks: a list for few visitors, countries for many

    function load(opts) {
      FF.ui.clear(box);
      K().loading(box);
      D().visitorDetails(from, to, opts).then(function (res) {
        view = res.view;
        draw(res);
      }).catch(function (e) {
        FF.ui.clear(box);
        FF.ui.clear(tools);
        if (e && e.code === 'local') {
          box.appendChild(el('p', { class: 'admin-empty' }, 'Countries and IP addresses come from the live site\'s server, so they are not shown while developing.'));
        } else {
          box.appendChild(el('p', { class: 'admin-error' }, 'Could not load visitor details. ' + ((e && e.message) || '')));
          box.appendChild(note('If this keeps happening, check that Cloudflare is not blocking or caching /api/ on playmona.com.'));
        }
      });
    }

    function draw(res) {
      FF.ui.clear(tools);
      FF.ui.clear(box);
      if (res.country) {
        tools.appendChild(FF.UI.button('All countries', { class: 'btn-sm', icon: 'chevron-left', onClick: function () { load({ view: 'countries' }); } }));
        tools.appendChild(el('span', { class: 'admin-tools__note' }, [country(res.country)]));
      } else {
        tools.appendChild(FF.UI.segmented({
          label: 'Show visitors', value: res.view, compact: true,
          options: [{ label: 'By country', value: 'countries' }, { label: 'Each visitor', value: 'list' }],
          onChange: function (v) { load({ view: v }); }
        }));
        tools.appendChild(el('span', { class: 'admin-tools__note' }, K().num(res.total) + ' with details'));
      }
      if (!res.total) {
        box.appendChild(el('p', { class: 'admin-empty' }, 'No visitor details for these days yet.'));
        return;
      }
      if (res.view === 'countries') drawCountries(res); else drawList(res);
      // The control that was clicked has been redrawn; keep focus (and Escape) in the window.
      if (!body.contains(document.activeElement)) {
        var first = tools.querySelector('button.active, button[aria-checked="true"], button');
        if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
      }
    }

    function drawCountries(res) {
      var rows = res.countries.map(function (c) {
        var code = c.country || 'unknown';
        var pick = el('button', { type: 'button', class: 'admin-linkbtn', title: 'Show visitors from ' + countryName(code) }, [country(code)]);
        pick.addEventListener('click', function () { load({ country: code }); });
        return [pick, K().num(c.visitors), share(c.visitors, res.total), K().num(c.reachedApp)];
      });
      box.appendChild(table(['Country', 'Visitors', 'Share', 'Opened the app'], rows, [1, 3]));
      box.appendChild(note('Choose a country to see its visitors.'));
    }

    function drawList(res) {
      var list = res.visitors || [];
      var rows = list.map(function (v) {
        return [
          el('span', { class: 'admin-mono' }, '#' + v.id),
          country(v.country),
          el('span', { class: 'admin-mono' }, v.ip || '—'),
          PAGE_NAMES[v.firstPage] || '—',
          v.reachedApp ? 'Yes' : 'No',
          K().num(v.days),
          K().ago(v.lastAt)
        ];
      });
      box.appendChild(table(['Visitor', 'Country', 'IP address', 'First page', 'Opened the app', 'Days', 'Last visit'], rows, [5]));
      if (list.length < res.total && list.length >= (res.showLimit || 200)) {
        box.appendChild(note('Showing the ' + list.length + ' most recent of ' + K().num(res.total) + '. Group by country to see everyone.'));
      }
      if (!res.country && res.total > res.listLimit) box.appendChild(note('With more than ' + res.listLimit + ' visitors this window opens grouped by country.'));
    }

    load(null);
  }

  /* ================= Active players ================= */
  function active(ctx) {
    var body = openWindow('Active players', ctx);
    var people = {};
    ctx.keys.forEach(function (k) {
      var a = (ctx.days[k] || {}).active || {};
      Object.keys(a).forEach(function (id) {
        var p = people[id] || (people[id] = { id: id, kind: a[id], days: 0, last: k });
        p.days++;
        if (k > p.last) p.last = k;
      });
    });
    var all = Object.keys(people).map(function (id) { return people[id]; });
    var back = all.filter(function (p) { return p.days > 1; }).length;
    body.appendChild(stats([
      ['Active players', all.length],
      ['With accounts', all.filter(function (p) { return p.kind === 'u'; }).length],
      ['Guests', all.filter(function (p) { return p.kind === 'g'; }).length],
      ['Came back another day', back, all.length ? Math.round((back / all.length) * 100) + '% of players' : null]
    ]));
    if (!all.length) { body.appendChild(el('p', { class: 'admin-empty' }, 'Nobody played in these days.')); return; }

    // How often people came back.
    var buckets = [['1 day', 1, 1], ['2–3 days', 2, 3], ['4–7 days', 4, 7], ['8–14 days', 8, 14], ['15–30 days', 15, 30], ['More than 30 days', 31, 999]]
      .filter(function (b) { return b[1] <= ctx.range; })
      .map(function (b) { return { label: b[0], value: all.filter(function (p) { return p.days >= b[1] && p.days <= b[2]; }).length }; });
    var freq = section('How many days they played');
    var bars = el('div');
    freq.appendChild(bars);
    body.appendChild(freq);
    C().bars(bars, buckets, { unit: 'players' });

    all.sort(function (a, b) { return b.days - a.days || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0); });
    var top = all.slice(0, PEOPLE_LIMIT);
    var list = section(all.length > PEOPLE_LIMIT ? 'The ' + PEOPLE_LIMIT + ' most active' : 'Everyone who played');
    var box = el('div');
    list.appendChild(box);
    body.appendChild(list);
    K().loading(box);
    Promise.all(top.map(function (p) {
      return D().get((p.kind === 'g' ? 'guestIndex/' : 'userIndex/') + p.id).catch(function () { return null; });
    })).then(function (entries) {
      FF.ui.clear(box);
      box.appendChild(table(['Player', 'Type', 'Days active', 'Games (all time)', 'Last seen'], top.map(function (p, i) {
        var e = entries[i] || {};
        return [person(e, p.kind), p.kind === 'g' ? 'Guest' : 'Account', K().num(p.days), K().num(e.plays), e.lastSeen ? K().ago(e.lastSeen) : K().shortDate(p.last)];
      }), [2, 3]));
      if (all.length > PEOPLE_LIMIT) box.appendChild(note('Showing ' + PEOPLE_LIMIT + ' of ' + K().num(all.length) + '. The Players page lists everyone.'));
    }).catch(function (e) { K().failed(box, e); });
  }

  /* ================= Games played ================= */
  function games(ctx) {
    var body = openWindow('Games played', ctx);
    function sums(keys) {
      var out = {};
      keys.forEach(function (k) {
        var d = ctx.days[k] || {};
        Object.keys(d.games || {}).forEach(function (g) { (out[g] = out[g] || { plays: 0, online: 0 }).plays += d.games[g] || 0; });
        Object.keys(d.onlineGames || {}).forEach(function (g) { (out[g] = out[g] || { plays: 0, online: 0 }).online += d.onlineGames[g] || 0; });
      });
      return out;
    }
    var now = sums(ctx.keys), prev = sums(ctx.prevKeys);
    var ids = Object.keys(now).filter(function (id) { return now[id].plays; });
    body.appendChild(stats([
      ['Games played', ctx.now.plays],
      ['Online', ctx.now.onlinePlays],
      ['By guests', ctx.now.guestPlays],
      ['Different games', ids.length]
    ]));
    if (!ids.length) { body.appendChild(el('p', { class: 'admin-empty' }, 'No games played in these days.')); return; }

    var cats = {};
    ids.forEach(function (id) {
      var g = FF.Games.get(id);
      var c = g ? K().catName(g.category) : 'Other';
      cats[c] = (cats[c] || 0) + now[id].plays;
    });
    var bySec = section('By category');
    var bars = el('div');
    bySec.appendChild(bars);
    body.appendChild(bySec);
    C().bars(bars, Object.keys(cats).map(function (c) { return { label: c, value: cats[c] }; }).sort(function (a, b) { return b.value - a.value; }), { unit: 'plays' });

    ids.sort(function (a, b) { return now[b].plays - now[a].plays; });
    var total = ctx.now.plays || ids.reduce(function (s, id) { return s + now[id].plays; }, 0);
    var list = section('Every game played');
    list.appendChild(table(['Game', 'Category', 'Plays', 'Online', 'Share', 'Vs previous ' + ctx.range + ' days'], ids.map(function (id) {
      var g = FF.Games.get(id);
      var p = (prev[id] || {}).plays || 0, n = now[id].plays;
      var change = !p ? el('span', { class: 'kpi-tile__delta is-up' }, 'New') :
        el('span', { class: 'kpi-tile__delta ' + (n > p ? 'is-up' : n < p ? 'is-down' : '') }, (n > p ? '▲ +' : n < p ? '▼ ' : '') + Math.round(((n - p) / p) * 100) + '%');
      return [K().gameName(id), g ? K().catName(g.category) : '—', K().num(n), K().num(now[id].online), share(n, total), change];
    }), [2, 3]));
    body.appendChild(list);
  }

  /* ================= New sign-ups ================= */
  function signups(ctx) {
    var body = openWindow('New sign-ups', ctx);
    var chart = section('Sign-ups per day');
    chart.appendChild(columnsChart(ctx, 'signups', 'Sign-ups per day'));
    body.appendChild(chart);

    var list = section('New accounts');
    var box = el('div');
    list.appendChild(box);
    body.appendChild(list);
    K().loading(box);
    var start = Date.parse(ctx.keys[0] + 'T00:00:00Z');
    D().usersBy('createdAt', PEOPLE_LIMIT, 'userIndex').then(function (rows) {
      rows = (rows || []).filter(function (r) { return (r.createdAt || 0) >= start; });
      FF.ui.clear(box);
      if (!rows.length) { box.appendChild(el('p', { class: 'admin-empty' }, 'No new accounts in these days.')); return; }
      var played = rows.filter(function (r) { return r.plays > 0; }).length;
      box.appendChild(stats([
        ['New accounts', rows.length],
        ['Played a game', played, Math.round((played / rows.length) * 100) + '% of new accounts'],
        ['Never played', rows.length - played]
      ]));
      box.appendChild(table(['Player', 'Joined', 'Games played', 'Last seen'], rows.map(function (r) {
        return [person(r, 'u'), K().longDate(r.createdAt), K().num(r.plays), r.lastSeen ? K().ago(r.lastSeen) : '—'];
      }), [2]));
      if (rows.length >= PEOPLE_LIMIT) box.appendChild(note('Showing the newest ' + PEOPLE_LIMIT + '. The Players page lists everyone.'));
      if (rows.length < ctx.now.signups) box.appendChild(note('The tile counts every sign-up; accounts deleted since are not listed.'));
    }).catch(function (e) { K().failed(box, e); });
  }

  /* ================= App installs ================= */
  function installs(ctx) {
    var body = openWindow('App installs', ctx);
    body.appendChild(stats([
      ['Installs', ctx.now.installs],
      ['Previous ' + ctx.range + ' days', ctx.prev.installs],
      ['Per day', Math.round((ctx.now.installs / ctx.range) * 10) / 10]
    ]));
    var chart = section('Installs per day', 'Counted when someone adds PlayMona to their home screen or desktop.');
    chart.appendChild(columnsChart(ctx, 'installs', 'Installs per day'));
    body.appendChild(chart);
  }

  /* ================= Rooms ================= */
  function rooms(ctx) {
    var body = openWindow('Rooms created', ctx);
    var live = el('div');
    body.appendChild(live);
    var chart = section('Rooms per day', 'Online rooms opened for a game with other devices.');
    chart.appendChild(columnsChart(ctx, 'rooms', 'Rooms per day'));
    body.appendChild(chart);

    D().rooms().then(function (all) {
      var n = Object.keys(all || {}).length;
      live.appendChild(stats([
        ['Rooms created', ctx.now.rooms],
        ['Online games played', ctx.now.onlinePlays],
        ['Open right now', n]
      ]));
      live.appendChild(FF.UI.button('See live rooms', { class: 'btn-sm', icon: 'arrow-right', onClick: function () {
        body.close();
        window.location.hash = 'rooms';
      } }));
    }).catch(function () {
      live.appendChild(stats([['Rooms created', ctx.now.rooms], ['Online games played', ctx.now.onlinePlays]]));
    });
  }

  var WINDOWS = { visitors: visitors, active: active, games: games, signups: signups, installs: installs, rooms: rooms };

  FF.AdminDetails = {
    open: function (kind, ctx) { if (WINDOWS[kind]) FF.safe(function () { WINDOWS[kind](ctx); }); }
  };
})();
