/* ============================================================
   PLAYMONA — admin/finance.js
   - The Finances page: money taken through Linkwa, with test
     (sandbox) payments kept apart from real ones, every order, and
     the Plus plans (price, on sale, best value badge, picture).
   - The Premium window (from Players or an order): give Plus or a
     game, remove what an admin gave, and on your own account
     remove everything so payments can be tested again.
   Data comes from the PlayMona server (api/) via FF.Billing.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var K = function () { return FF.AdminKit; };
  var C = function () { return FF.AdminCharts; };
  var B = function () { return FF.Billing; };
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }

  var state = { mode: 'live', status: 'all', q: '', page: 1 };
  var LIFETIME_MS = 50 * 365 * 86400000;   // Plus past this is lifetime (stored as 100 years)

  function isLifetimeUntil(ms) { return ms > Date.now() + LIFETIME_MS; }
  function plusDaysText(days) { return days >= 36500 ? 'Plus: lifetime' : 'Plus: ' + days + (days === 1 ? ' day' : ' days'); }
  var premiumGames = null;   // from /api/catalog

  function head(title, sub, actions) {
    var h = el('div', { class: 'admin-page-head' });
    var text = el('div', {});
    text.appendChild(el('h1', { class: 'page-title' }, title));
    if (sub) text.appendChild(el('p', { class: 'page-sub' }, sub));
    h.appendChild(text);
    if (actions) h.appendChild(actions);
    return h;
  }

  function moneyTile(label, cents, note) {
    var tile = el('div', { class: 'kpi-tile' });
    tile.appendChild(el('span', { class: 'kpi-tile__label' }, label));
    tile.appendChild(el('strong', { class: 'kpi-tile__value' }, B().money(cents)));
    if (note) tile.appendChild(el('span', { class: 'kpi-tile__note' }, note));
    return tile;
  }

  function serverMissing(target) {
    target.appendChild(el('p', { class: 'notice notice--info' }, 'Finances come from the PlayMona server, so they only show on playmona.com, not with device-only test accounts.'));
  }

  function failed(target, e) {
    FF.ui.clear(target);
    target.appendChild(el('p', { class: 'admin-error' }, (e && e.message) || 'Could not load this. Check the connection and try again.'));
  }

  function loadCatalog() {
    if (premiumGames) return Promise.resolve(premiumGames);
    return fetch('/api/catalog', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      var names = {};
      premiumGames = [];
      (data.items || []).forEach(function (it) {
        names[it.id] = it.name;
        if (it.kind === 'game') premiumGames.push({ id: it.game, name: it.name.replace(/^Unlock /, '') });
      });
      B().setProductNames(names);
      return premiumGames;
    }).catch(function () { premiumGames = []; return premiumGames; });
  }

  /* ================= Finances page ================= */
  function finance(main) {
    var resetBtn = FF.UI.button('Reset my premium', { class: 'btn-sm btn-ghost', icon: 'restart', onClick: function () { Premium.resetOwn(); } });
    main.appendChild(head('Finances', 'Money taken through Linkwa. Test payments (sandbox) are kept apart from real money.', resetBtn));
    if (!B().available() || FF.AdminData.mode() !== 'firebase') { serverMissing(main); return; }

    main.appendChild(el('div', { class: 'admin-tools' }, [FF.UI.segmented({
      label: 'Which payments', value: state.mode,
      options: [{ label: 'Real money', value: 'live', icon: 'check-circle' }, { label: 'Test payments', value: 'sandbox', icon: 'info' }],
      onChange: function (v) { state.mode = v; state.page = 1; finance(FF.ui.clear(main)); }
    })]));

    var top = el('div', { class: 'admin-stack' });
    main.appendChild(top);
    K().loading(top);

    loadCatalog().then(function () {
      return B().api('GET', '/admin/finance/summary?mode=' + state.mode);
    }).then(function (s) {
      FF.ui.clear(top);
      if (s.productNames) B().setProductNames(s.productNames);
      if (s.gatewayMode && s.gatewayMode !== 'live') {
        top.appendChild(el('p', { class: 'notice notice--info fin-note' }, 'The server uses the Linkwa sandbox, so no real payments are being taken yet. Switch the server settings to the live Linkwa key to start taking money.'));
      }

      var tiles = el('div', { class: 'kpi-grid' });
      tiles.appendChild(moneyTile('Today', s.today.cents, s.today.orders + ' paid'));
      tiles.appendChild(moneyTile('Last 7 days', s.week.cents, s.week.orders + ' paid'));
      tiles.appendChild(moneyTile('Last 30 days', s.month.cents, s.month.orders + ' paid'));
      tiles.appendChild(moneyTile('All time', s.all.cents, s.all.orders + ' paid by ' + s.buyers + (s.buyers === 1 ? ' player' : ' players')));
      top.appendChild(tiles);

      var quiet = el('div', { class: 'kpi-grid kpi-grid--quiet' });
      quiet.appendChild(K().tile('Players with Plus now', s.activePlus, null, 'Paid or given, test and real'));
      quiet.appendChild(K().tile('Waiting for payment', s.pending, null, 'Started in the last 3 days'));
      quiet.appendChild(K().tile('Not completed', s.failed30, null, 'Last 30 days'));
      top.appendChild(quiet);

      var bal = K().card('Linkwa balance', 'Money held by Linkwa for PlayMona. Card payments stay pending for 3 to 4 working days.');
      if (s.balance && s.balance.length) {
        var bt = el('div', { class: 'kpi-grid kpi-grid--quiet' });
        s.balance.forEach(function (b) {
          bt.appendChild(moneyTile('Available (' + b.currency + ')', Math.round(b.available * 100)));
          bt.appendChild(moneyTile('Pending (' + b.currency + ')', Math.round(b.pending * 100)));
        });
        bal.appendChild(bt);
      } else if (s.balanceError) {
        bal.appendChild(el('p', { class: 'admin-error' }, s.balanceError));
      } else {
        bal.appendChild(el('p', { class: 'admin-card__sub' }, 'The server\'s Linkwa key is for ' + (s.gatewayMode === 'live' ? 'real money' : 'the sandbox') + ', so its balance shows under ' + (s.gatewayMode === 'live' ? 'Real money' : 'Test payments') + '.'));
      }
      top.appendChild(bal);

      var chartCard = K().card('Money in, last 30 days', 'By day the payment was confirmed (UTC).');
      var chart = el('div', { class: 'chart-box' });
      chartCard.appendChild(chart);
      top.appendChild(chartCard);
      C().columns(chart, s.days.map(function (d) {
        return { label: K().shortDate(d.day), title: K().shortDate(d.day) + ' · ' + d.orders + ' paid', value: d.cents / 100 };
      }), { label: 'Money in per day', format: function (v) { return B().money(Math.round(v * 100)); } });

      var prod = K().card('Best sellers', 'All time: how many sold, and the money each brought in.');
      if (s.byProduct.length) {
        var bars = el('div', {});
        prod.appendChild(bars);
        C().bars(bars, s.byProduct.map(function (p) {
          return { label: B().productName(p.product) + ' · ' + B().money(p.cents), value: p.orders };
        }), { unit: 'paid' });
      } else {
        prod.appendChild(el('p', { class: 'admin-card__sub' }, 'Nothing sold yet.'));
      }
      top.appendChild(prod);
    }).catch(function (e) { failed(top, e); });

    main.appendChild(plansCard());

    // Orders
    var ordersCard = K().card('Orders', 'Every checkout. Open one to see its invoice.');
    var tools = el('div', { class: 'admin-tools' });
    var search = el('input', { class: 'input', type: 'search', placeholder: 'Search orders', 'aria-label': 'Search orders by invoice, order, name or email', title: 'Invoice number, order, name or email', value: state.q });
    tools.appendChild(search);
    tools.appendChild(FF.UI.segmented({
      label: 'Order status', value: state.status, compact: true,
      options: [{ label: 'All', value: 'all' }, { label: 'Paid', value: 'paid' }, { label: 'Waiting', value: 'pending' }, { label: 'Not completed', value: 'failed' }],
      onChange: function (v) { state.status = v; state.page = 1; list(); }
    }));
    ordersCard.appendChild(tools);
    var box = el('div', {});
    ordersCard.appendChild(box);
    main.appendChild(ordersCard);

    function list() {
      FF.ui.clear(box);
      K().loading(box);
      var q = 'mode=' + state.mode + '&status=' + state.status + '&page=' + state.page + (state.q ? '&q=' + encodeURIComponent(state.q) : '');
      B().api('GET', '/admin/finance/orders?' + q).then(function (r) {
        FF.ui.clear(box);
        if (!r.orders.length) {
          box.appendChild(el('p', { class: 'admin-empty' }, state.q ? 'No orders match that.' : 'No orders yet.'));
          return;
        }
        var wrap = el('div', { class: 'admin-table-wrap' });
        var tbl = el('table', { class: 'admin-table' });
        tbl.appendChild(el('thead', {}, [el('tr', {}, ['Date', 'Invoice', 'Player', 'Item', 'Amount', 'Status', ''].map(function (h, i) {
          return el('th', { scope: 'col', class: i === 4 ? 'num' : '' }, h);
        }))]));
        var tbody = el('tbody');
        r.orders.forEach(function (o) {
          var who = el('td', { class: 'admin-user' });
          var names = el('span', { class: 'admin-user__names' });
          names.appendChild(el('span', { class: 'admin-user__name' }, o.buyerName || 'Player'));
          names.appendChild(el('span', { class: 'admin-user__handle' }, o.buyerEmail || o.uid.slice(0, 12)));
          who.appendChild(names);
          tbody.appendChild(el('tr', {}, [
            el('td', {}, B().date(o.paidAt || o.createdAt)),
            el('td', {}, o.invoiceNo || '—'),
            who,
            el('td', {}, B().productName(o.product)),
            el('td', { class: 'num' }, B().money(o.amountCents, o.currency)),
            el('td', {}, [B().statusBadge(o)]),
            el('td', {}, [FF.UI.button('Open', { class: 'btn-sm btn-ghost', onClick: function () { openOrder(o); } })])
          ]));
        });
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
        box.appendChild(wrap);
        if (r.pages > 1) {
          var pager = el('div', { class: 'admin-tools admin-pager' });
          pager.appendChild(el('span', { class: 'admin-tools__note' }, 'Page ' + r.page + ' of ' + r.pages + ' · ' + r.total + ' orders'));
          if (r.page > 1) pager.appendChild(FF.UI.button('Newer', { class: 'btn-sm btn-ghost', icon: 'arrow-left', onClick: function () { state.page--; list(); } }));
          if (r.page < r.pages) pager.appendChild(FF.UI.button('Older', { class: 'btn-sm btn-ghost', icon: 'arrow-right', onClick: function () { state.page++; list(); } }));
          box.appendChild(pager);
        }
      }).catch(function (e) { failed(box, e); });
    }
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = search.value.trim(); state.page = 1; list(); }, 300);
    });
    list();
  }

  /* ================= Plus plans ================= */
  function plansCard() {
    var card = K().card('Plus plans', 'What players can buy on the Plus page. A new price applies to the next checkout. The picture also shows on Linkwa\'s payment page.');
    var box = el('div', {});
    card.appendChild(box);
    function draw(data) {
      FF.ui.clear(box);
      var list = el('ul', { class: 'plan-list' });
      data.plans.forEach(function (p) {
        var li = el('li', { class: 'plan-row' + (p.enabled ? '' : ' is-off') });
        var img = el('img', { class: 'plan-row__img', src: p.imageUrl, alt: '', loading: 'lazy', width: 56, height: 56 });
        img.addEventListener('error', function () { img.classList.add('is-broken'); });
        li.appendChild(img);
        var w = el('div', { class: 'plan-row__text' });
        w.appendChild(el('strong', {}, p.label + ' · ' + B().money(p.cents)));
        var bits = [p.lifetime ? 'Never runs out' : p.days + (p.days === 1 ? ' day' : ' days')];
        if (p.cents !== p.defaultCents) bits.push('standard price ' + B().money(p.defaultCents));
        if (p.customImage) bits.push('own picture');
        w.appendChild(el('span', {}, bits.join(' · ')));
        li.appendChild(w);
        var badges = el('span', { class: 'bill-badges' });
        badges.appendChild(el('span', { class: 'bill-badge ' + (p.enabled ? 'bill-badge--paid' : 'bill-badge--test') }, p.enabled ? 'On sale' : 'Off sale'));
        if (p.best) badges.appendChild(el('span', { class: 'bill-badge bill-badge--pending' }, 'Best value'));
        li.appendChild(badges);
        li.appendChild(FF.UI.button('Edit', { class: 'btn-sm btn-ghost', icon: 'pencil', onClick: function () { editPlan(p, data, draw); } }));
        list.appendChild(li);
      });
      box.appendChild(list);
    }
    K().loading(box);
    B().api('GET', '/admin/plans').then(draw).catch(function (e) { failed(box, e); });
    return card;
  }

  /* The edit window for one plan: price, on sale, best value badge and picture. */
  function editPlan(p, data, redraw) {
    var form = { enabled: p.enabled, best: p.best };
    var body = el('div', { class: 'admin-detail plan-edit' });

    var priceId = 'plan-price-' + p.id;
    var price = el('input', { class: 'input field__input', id: priceId, type: 'number', inputmode: 'decimal', step: '0.01',
      min: (data.minCents / 100).toFixed(2), max: (data.maxCents / 100).toFixed(2), value: (p.cents / 100).toFixed(2) });
    body.appendChild(el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: priceId }, 'Price in US dollars'),
      price,
      el('span', { class: 'field__hint' }, 'Standard price ' + B().money(p.defaultCents) + '. Players who already started paying keep the price they saw.')
    ]));

    body.appendChild(FF.UI.switchRow({
      label: 'On sale', description: 'Off hides this plan from the Plus page. Past payments and invoices are not affected.',
      checked: form.enabled, onChange: function (on) { form.enabled = on; }
    }));
    body.appendChild(FF.UI.switchRow({
      label: 'Best value badge', description: 'Highlights this plan on the Plus page.',
      checked: form.best, onChange: function (on) { form.best = on; }
    }));

    var imgId = 'plan-img-' + p.id;
    var preview = el('img', { class: 'plan-edit__preview', src: p.imageUrl, alt: 'Picture for ' + p.label, width: 160, height: 160 });
    var image = el('input', { class: 'input field__input', id: imgId, type: 'text', spellcheck: 'false',
      placeholder: '/assets/images/plans/' + p.id + '.jpg', value: p.customImage ? p.image : '' });
    image.addEventListener('change', function () {
      var v = image.value.trim();
      preview.src = v || '/assets/images/plans/' + p.id + '.jpg';
    });
    body.appendChild(el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: imgId }, 'Picture'),
      preview,
      image,
      el('span', { class: 'field__hint' }, 'Leave empty for the standard picture. Otherwise a file on the site (/assets/…) or an https:// address ending in .jpg, .png or .webp. Square pictures work best.')
    ]));

    var dlg = FF.UI.dialog({
      title: 'Edit plan: ' + p.label, body: body,
      actions: [
        { label: 'Save', icon: 'check', primary: true, keepOpen: true, onClick: function () {
          var cents = Math.round(parseFloat(price.value) * 100);
          if (!isFinite(cents) || cents < data.minCents || cents > data.maxCents) {
            FF.UI.toast('Enter a price between ' + B().money(data.minCents) + ' and ' + B().money(data.maxCents) + '.', { type: 'error' });
            price.focus();
            return;
          }
          B().api('POST', '/admin/plans', { id: p.id, cents: cents, enabled: form.enabled, best: form.best, image: image.value.trim() }).then(function (fresh) {
            FF.UI.toast('Saved', { type: 'success' });
            dlg.close();
            redraw(fresh);
          }).catch(function (e) { FF.UI.toast(e.message, { type: 'error' }); });
        } },
        { label: 'Cancel' }
      ]
    });
  }

  /* An order's details, its invoice and a link to the buyer's premium. */
  function openOrder(o) {
    var body = el('div', { class: 'admin-detail' });
    var facts = el('dl', { class: 'admin-facts' });
    [
      ['Status', B().statusLabel(o.status) + (o.test ? ' (test)' : '')],
      ['Item', B().productName(o.product)],
      ['Amount', B().money(o.amountCents, o.currency)],
      ['Started', B().date(o.createdAt)],
      ['Paid', o.paidAt ? B().date(o.paidAt) + (o.paidVia ? ' (confirmed by ' + ({ 'return': 'the return page', webhook: 'the Linkwa webhook', statement: 'the statement check' }[o.paidVia] || o.paidVia) + ')' : '') : '—'],
      ['Linkwa status', o.lastStatus || '—'],
      ['Payment reference', o.reference || '—'],
      ['Order', o.id],
      ['Player', (o.buyerName || 'Player') + (o.buyerEmail ? ' · ' + o.buyerEmail : '') + ' · ' + o.uid]
    ].forEach(function (r) {
      facts.appendChild(el('dt', {}, r[0]));
      facts.appendChild(el('dd', {}, r[1]));
    });
    body.appendChild(facts);
    var inv = el('div', {});
    body.appendChild(inv);
    var actions = [{ label: 'Premium for this player', icon: 'crown', onClick: function () { Premium.open(o.uid, o.buyerName || 'this player'); } }];
    if (o.status === 'paid') actions.unshift({ label: 'Download PDF', icon: 'download', primary: true, keepOpen: true, onClick: function () { B().downloadInvoice(o.id); } });
    actions.push({ label: 'Close' });
    FF.UI.dialog({ title: o.invoiceNo ? 'Invoice ' + o.invoiceNo : 'Order', body: body, wide: true, actions: actions });
    // A failed order: show why Linkwa refused it (saved by the server when checkout failed).
    if (o.status === 'failed') {
      B().api('GET', '/orders/' + encodeURIComponent(o.id)).then(function (d) {
        var why = d.order && d.order.problem;
        if (!why) return;
        facts.appendChild(el('dt', {}, 'Why it failed'));
        facts.appendChild(el('dd', {}, why));
      }).catch(function () {});
      return;
    }
    if (o.status !== 'paid') return;
    K().loading(inv);
    B().api('GET', '/orders/' + encodeURIComponent(o.id)).then(function (d) {
      FF.ui.clear(inv);
      if (d.invoice) inv.appendChild(B().invoiceView(d.invoice));
    }).catch(function (e) { failed(inv, e); });
  }

  /* ================= Premium window ================= */
  var Premium = {
    open: function (uid, label) {
      var body = el('div', { class: 'admin-detail' });
      var dlg = FF.UI.dialog({ title: 'Premium: ' + label, body: body, wide: true });
      body.close = dlg.close;
      if (!B().available() || FF.AdminData.mode() !== 'firebase') { serverMissing(body); return dlg; }
      K().loading(body);
      Promise.all([loadCatalog(), B().api('GET', '/admin/access?uid=' + encodeURIComponent(uid))]).then(function (res) {
        Premium.draw(body, res[1], label);
      }).catch(function (e) { failed(body, e); });
      return dlg;
    },

    draw: function (body, info, label) {
      FF.ui.clear(body);
      var a = info.access || {};
      var plusOn = a.plusUntil > Date.now();
      var forLife = isLifetimeUntil(a.plusUntil);

      // What they have now
      var now = el('section', { class: 'admin-detail__section' });
      now.appendChild(el('h3', { class: 'admin-detail__title' }, 'What they have now'));
      var row = el('div', { class: 'prem-access' });
      row.appendChild(el('span', { class: 'bill-badge ' + (plusOn ? 'bill-badge--paid' : 'bill-badge--test') },
        forLife ? 'Plus for life' : plusOn ? 'Plus until ' + B().date(a.plusUntil) : 'No Plus'));
      Object.keys(a.games || {}).forEach(function (g) { row.appendChild(el('span', { class: 'bill-badge bill-badge--paid' }, K().gameName(g))); });
      now.appendChild(row);
      body.appendChild(now);

      // Give premium
      var give = el('section', { class: 'admin-detail__section' });
      give.appendChild(el('h3', { class: 'admin-detail__title' }, 'Give premium'));
      give.appendChild(el('p', { class: 'admin-card__sub' }, 'Plus time adds to what they already have. Write why, for example "Quiz night prize" or "Tester".'));
      var form = el('div', { class: 'prem-grant' });
      var whatOpts = [
        { value: 'plus:1', label: 'Plus: 1 day' }, { value: 'plus:7', label: 'Plus: 1 week' },
        { value: 'plus:30', label: 'Plus: 1 month' }, { value: 'plus:365', label: 'Plus: 1 year' },
        { value: 'plus:36500', label: 'Plus: lifetime' }, { value: 'plus:custom', label: 'Plus: other number of days' }
      ];
      (premiumGames || []).forEach(function (g) { whatOpts.push({ value: 'game:' + g.id, label: 'Unlock ' + g.name }); });
      var what = el('select', { class: 'input admin-select', 'aria-label': 'What to give' });
      whatOpts.forEach(function (o) { what.appendChild(el('option', { value: o.value }, o.label)); });
      var days = el('input', { class: 'input', type: 'number', min: 1, max: 3660, value: 14, 'aria-label': 'Days of Plus', hidden: true, style: { width: '7em' } });
      what.addEventListener('change', function () { days.hidden = what.value !== 'plus:custom'; });
      var note = el('input', { class: 'input prem-note', type: 'text', maxlength: 200, placeholder: 'Why (required)', 'aria-label': 'Why you are giving this' });
      var giveBtn = FF.UI.button('Give', { class: 'btn-primary', icon: 'crown', onClick: function () {
        var parts = what.value.split(':');
        var payload = { uid: info.uid, note: note.value.trim() };
        if (parts[0] === 'plus') { payload.kind = 'plus'; payload.days = parts[1] === 'custom' ? Number(days.value) : Number(parts[1]); }
        else { payload.kind = 'game'; payload.game = parts[1]; }
        if (!payload.note) { FF.UI.toast('Write why you are giving this.', { type: 'error' }); note.focus(); return; }
        giveBtn.disabled = true;
        B().api('POST', '/admin/grant', payload).then(function () {
          return B().api('GET', '/admin/access?uid=' + encodeURIComponent(info.uid));
        }).then(function (fresh) {
          FF.UI.toast('Given', { type: 'success' });
          Premium.draw(body, fresh, label);
        }).catch(function (e) { giveBtn.disabled = false; FF.UI.toast(e.message, { type: 'error' }); });
      } });
      form.appendChild(what);
      form.appendChild(days);
      form.appendChild(note);
      form.appendChild(giveBtn);
      give.appendChild(form);
      body.appendChild(give);

      // History
      var hist = el('section', { class: 'admin-detail__section' });
      hist.appendChild(el('h3', { class: 'admin-detail__title' }, 'History'));
      hist.appendChild(el('p', { class: 'admin-card__sub' }, info.isSelf
        ? 'This is your own account, so you can remove anything, including what you paid for. The payment stays in Finances.'
        : 'You can remove what an admin gave. What a player paid for stays.'));
      if (!info.grants.length) {
        hist.appendChild(el('p', { class: 'admin-empty' }, 'No premium yet.'));
      } else {
        var ul = el('ul', { class: 'prem-list' });
        info.grants.forEach(function (g) {
          var li = el('li', { class: g.revokedAt ? 'is-revoked' : '' });
          var w = el('div', { class: 'prem-what' });
          w.appendChild(el('strong', {}, g.kind === 'plus' ? plusDaysText(g.days) : 'Unlock ' + K().gameName(g.game)));
          var src = g.source === 'purchase' ? 'Paid' : 'Given by an admin';
          w.appendChild(el('span', {}, src + ' · ' + B().date(g.createdAt) + (g.note ? ' · ' + g.note : '') + (g.revokedAt ? ' · Removed ' + B().date(g.revokedAt) : '')));
          li.appendChild(w);
          if (g.canRevoke) {
            li.appendChild(FF.UI.button('Remove', { class: 'btn-sm btn-ghost', icon: 'trash', onClick: function () {
              FF.UI.confirm({
                title: 'Remove this premium?',
                body: g.source === 'purchase'
                  ? 'This takes away premium you paid for on your own account, so you can test buying again. The payment stays in Finances.'
                  : 'They lose ' + (g.kind === 'plus' ? (g.days >= 36500 ? 'lifetime Plus' : 'these ' + g.days + ' days of Plus') : 'this game') + ' straight away.',
                confirmLabel: 'Remove', danger: true,
                onConfirm: function () {
                  B().api('POST', '/admin/revoke', { grantId: g.id }).then(function (fresh) {
                    FF.UI.toast('Removed', { type: 'success' });
                    Premium.draw(body, fresh, label);
                  }).catch(function (e) { FF.UI.toast(e.message, { type: 'error' }); });
                }
              });
            } }));
          } else if (!g.revokedAt && g.source === 'purchase') {
            li.appendChild(el('span', { class: 'bill-badge bill-badge--paid' }, 'Paid'));
          }
          ul.appendChild(li);
        });
        hist.appendChild(ul);
      }
      body.appendChild(hist);

      // Orders
      if (info.orders.length) {
        var ord = el('section', { class: 'admin-detail__section' });
        ord.appendChild(el('h3', { class: 'admin-detail__title' }, 'Payments'));
        ord.appendChild(B().historyList(info.orders));
        body.appendChild(ord);
      }

      // Own account: remove everything at once
      if (info.isSelf) {
        var reset = el('section', { class: 'admin-detail__section prem-reset' });
        reset.appendChild(el('p', { class: 'admin-card__sub' }, 'Testing payments? Remove all premium from your account, then buy again.'));
        reset.appendChild(FF.UI.button('Remove all my premium', { class: 'btn-danger', icon: 'restart', onClick: function () { Premium.resetOwn(function (fresh) { Premium.draw(body, fresh, label); }); } }));
        body.appendChild(reset);
      }
    },

    /* Removes every grant on the admin's own account, after asking. */
    resetOwn: function (after) {
      if (!B().available() || FF.AdminData.mode() !== 'firebase') {
        FF.UI.toast('This needs the PlayMona server (playmona.com).', { type: 'error' });
        return;
      }
      FF.UI.confirm({
        title: 'Remove all your premium?',
        body: 'Your Plus and any games you own are removed from your own account, including ones you paid for, so you can test buying again. Your payments and invoices stay in Finances.',
        confirmLabel: 'Remove all', danger: true,
        onConfirm: function () {
          B().api('POST', '/admin/reset-own').then(function (fresh) {
            FF.UI.toast('Your premium was removed', { type: 'success' });
            if (after) after(fresh);
          }).catch(function (e) { FF.UI.toast(e.message, { type: 'error' }); });
        }
      });
    }
  };

  FF.AdminPages = FF.AdminPages || {};
  FF.AdminPages.finance = finance;
  FF.AdminPremium = Premium;
})();
