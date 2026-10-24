/* ============================================================
   PLAYMONA — billing.js
   Shared by the app (Plus page, Settings > Account) and the admin
   portal: talking to the PlayMona server (api/), money and dates,
   the payment history list, the invoice view and the PDF download.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  };
  var el = function (tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); };

  // The signed-in Firebase user, waiting for Firebase to restore the sign-in if needed.
  function currentUser() {
    return FF.Net.ensureFirebase().then(function (firebase) {
      var auth = firebase.auth();
      if (auth.currentUser) return auth.currentUser;
      return new Promise(function (resolve) {
        var off = auth.onAuthStateChanged(function (u) { off(); resolve(u); });
      });
    });
  }

  function token() {
    return currentUser().then(function (u) {
      if (!u || u.isAnonymous) {
        var e = new Error(t('payNeedsSignIn', 'Please sign in again.'));
        e.code = 'signed-out';
        throw e;
      }
      return u.getIdToken();
    });
  }

  function failure(res, data) {
    var e = new Error((data && data.message) || t('serverDown', 'The server did not answer. Please try again.'));
    e.code = (data && data.error) || 'http-' + res.status;
    e.status = res.status;
    return e;
  }

  var Billing = {
    // The server only exists on the website (not file:// or device-only accounts).
    available: function () {
      return typeof location !== 'undefined' && /^https?:$/.test(location.protocol) &&
        !!(FF.Net && FF.Net.sdkConfigured && FF.Net.sdkConfigured()) &&
        !FF.Storage.get('devAuth', false);
    },

    /* Calls the PlayMona server as the signed-in player. Resolves with the JSON reply. */
    api: function (method, path, body) {
      return token().then(function (tok) {
        return fetch('/api' + path, {
          method: method,
          headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          cache: 'no-store'
        });
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw failure(res, data);
          return data;
        });
      });
    },

    money: function (cents, currency) {
      var v = (Number(cents) || 0) / 100;
      var text = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (!currency || String(currency).toUpperCase() === 'USD') ? '$' + text : String(currency).toUpperCase() + ' ' + text;
    },

    date: function (ms) {
      if (!ms) return '—';
      var lang = FF.i18n && FF.i18n.getLang ? FF.i18n.getLang() : undefined;
      try {
        return new Date(ms).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { return new Date(ms).toDateString(); }
    },

    statusLabel: function (status) {
      return status === 'paid' ? t('statusPaid', 'Paid')
        : status === 'pending' ? t('statusPending', 'Waiting for payment')
        : status === 'failed' ? t('statusFailed', 'Not completed')
        : status;
    },

    statusBadge: function (order) {
      var wrap = el('span', { class: 'bill-badges' });
      var cls = order.status === 'paid' ? 'bill-badge--paid' : order.status === 'pending' ? 'bill-badge--pending' : 'bill-badge--failed';
      wrap.appendChild(el('span', { class: 'bill-badge ' + cls }, Billing.statusLabel(order.status)));
      if (order.test) wrap.appendChild(el('span', { class: 'bill-badge bill-badge--test', title: t('testPaymentHint', 'Sandbox payment: no real money') }, t('testBadge', 'Test')));
      return wrap;
    },

    /* Saves the invoice PDF. The request needs the sign-in, so it is fetched, then saved from memory. */
    downloadInvoice: function (orderId, button) {
      if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
      var done = function () { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } };
      return token().then(function (tok) {
        return fetch('/api/orders/' + encodeURIComponent(orderId) + '/invoice', { headers: { 'Authorization': 'Bearer ' + tok }, cache: 'no-store' });
      }).then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (data) { throw failure(res, data); });
        var name = 'PlayMona-invoice.pdf';
        var m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
        if (m) name = m[1];
        return res.blob().then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = el('a', { href: url, download: name, style: { display: 'none' } });
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); a.parentNode.removeChild(a); }, 4000);
          FF.UI.toast(t('invoiceSaved', 'Invoice downloaded'), { type: 'success' });
        });
      }).then(done, function (e) {
        done();
        FF.UI.toast(e.message, { type: 'error' });
      });
    },

    /* The invoice as a page, from the facts the server sends (same as the PDF). */
    invoiceView: function (inv) {
      var money = function (c) { return Billing.money(c, inv.currency); };
      var box = el('article', { class: 'invoice', 'aria-label': t('invoiceN', 'Invoice {n}', { n: inv.number || inv.orderId }) });

      var top = el('header', { class: 'invoice__top' });
      var brand = el('div', { class: 'invoice__brand' });
      brand.appendChild(el('img', { class: 'invoice__mark', src: 'assets/brand/mark-256.webp', alt: '', width: 40, height: 40 }));
      brand.appendChild(el('span', { class: 'invoice__name' }, inv.seller.name || 'PlayMona'));
      top.appendChild(brand);
      var title = el('div', { class: 'invoice__title' });
      title.appendChild(el('strong', {}, t('invoice', 'Invoice')));
      title.appendChild(el('span', { class: 'invoice__number' }, inv.number || inv.orderId));
      title.appendChild(el('span', { class: 'bill-badge ' + (inv.status === 'paid' ? 'bill-badge--paid' : 'bill-badge--failed') }, Billing.statusLabel(inv.status)));
      top.appendChild(title);
      box.appendChild(top);

      if (inv.test) {
        box.appendChild(el('p', { class: 'invoice__test' }, t('invoiceTest', 'Test payment: sandbox only, no real money was charged.')));
      }

      var parties = el('div', { class: 'invoice__parties' });
      function party(label, lines) {
        var p = el('div', { class: 'invoice__party' });
        p.appendChild(el('span', { class: 'invoice__label' }, label));
        lines.filter(Boolean).forEach(function (line, i) {
          p.appendChild(el(i === 0 ? 'strong' : 'span', {}, line));
        });
        parties.appendChild(p);
      }
      party(t('invoiceFrom', 'From'), [inv.seller.name, inv.seller.site, inv.seller.email, inv.seller.address, inv.seller.taxId ? t('taxId', 'Tax ID {id}', { id: inv.seller.taxId }) : null]);
      party(t('invoiceTo', 'Billed to'), [inv.buyer.name, inv.buyer.email]);
      party(t('invoiceDetails', 'Details'), [inv.issuedText, t('orderId', 'Order {id}', { id: inv.orderId })]);
      box.appendChild(parties);

      var tbl = el('table', { class: 'invoice__lines' });
      tbl.appendChild(el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col' }, t('invItem', 'Description')),
        el('th', { scope: 'col', class: 'num' }, t('invQty', 'Qty')),
        el('th', { scope: 'col', class: 'num' }, t('invAmount', 'Amount'))
      ])]));
      var body = el('tbody');
      inv.lines.forEach(function (l) {
        var d = el('td', {}, [el('strong', {}, l.description)]);
        if (l.detail) d.appendChild(el('span', { class: 'invoice__detail' }, l.detail));
        body.appendChild(el('tr', {}, [d, el('td', { class: 'num' }, String(l.qty)), el('td', { class: 'num' }, money(l.amountCents))]));
      });
      tbl.appendChild(body);
      box.appendChild(tbl);

      var totals = el('dl', { class: 'invoice__totals' });
      [
        [t('invTotal', 'Total ({cur})', { cur: inv.currency }), money(inv.totalCents), true],
        [t('invPaid', 'Amount paid'), money(inv.paidCents), false],
        [t('invDue', 'Balance due'), money(inv.totalCents - inv.paidCents), true]
      ].forEach(function (r) {
        totals.appendChild(el('dt', { class: r[2] ? 'is-strong' : '' }, r[0]));
        totals.appendChild(el('dd', { class: r[2] ? 'is-strong' : '' }, r[1]));
      });
      box.appendChild(totals);

      if (inv.payment && inv.payment.paidText) {
        var pay = el('p', { class: 'invoice__payment' });
        pay.appendChild(el('strong', {}, t('paidWith', 'Paid with {via} on {date}', { via: inv.payment.via, date: inv.payment.paidText })));
        if (inv.payment.reference) pay.appendChild(el('span', {}, t('payRef', 'Reference {ref}', { ref: inv.payment.reference })));
        box.appendChild(pay);
      }
      return box;
    },

    /* Opens an order's invoice in a window, with a Download PDF button. */
    openInvoice: function (orderId) {
      var body = el('div', { class: 'invoice-dialog' });
      body.appendChild(el('p', { class: 'bill-loading' }, t('loading', 'Loading…')));
      var dlg = FF.UI.dialog({
        title: t('invoice', 'Invoice'), body: body, wide: true, className: 'invoice-dialog-wrap',
        actions: [
          { label: t('downloadPdf', 'Download PDF'), icon: 'download', primary: true, keepOpen: true, onClick: function () { Billing.downloadInvoice(orderId); } },
          { label: t('close', 'Close') }
        ]
      });
      Billing.api('GET', '/orders/' + encodeURIComponent(orderId)).then(function (data) {
        FF.ui.clear(body);
        if (!data.invoice) {
          body.appendChild(el('p', {}, t('noInvoiceYet', 'This order is not paid, so it has no invoice yet.')));
          return;
        }
        body.appendChild(Billing.invoiceView(data.invoice));
      }).catch(function (e) {
        FF.ui.clear(body);
        body.appendChild(el('p', { class: 'bill-error' }, e.message));
      });
      return dlg;
    },

    /*
     * The payment history list. orders: from GET /api/me (newest first).
     * Each paid order can be viewed and downloaded.
     */
    historyList: function (orders) {
      var shown = (orders || []).filter(function (o) { return o.status === 'paid' || o.status === 'pending'; });
      if (!shown.length) {
        return el('p', { class: 'bill-empty' }, t('noPayments', 'No payments yet. Your receipts will show here.'));
      }
      var list = el('ul', { class: 'bill-list' });
      shown.forEach(function (o) {
        var li = el('li', { class: 'bill-row' });
        var main = el('div', { class: 'bill-row__main' });
        main.appendChild(el('strong', { class: 'bill-row__item' }, Billing.productName(o.product)));
        var meta = el('span', { class: 'bill-row__meta' }, Billing.date(o.paidAt || o.createdAt) + (o.invoiceNo ? ' · ' + o.invoiceNo : ''));
        main.appendChild(meta);
        li.appendChild(main);
        var side = el('div', { class: 'bill-row__side' });
        side.appendChild(el('span', { class: 'bill-row__amount' }, Billing.money(o.amountCents != null ? o.amountCents : Math.round(o.amount * 100), o.currency)));
        side.appendChild(Billing.statusBadge(o));
        li.appendChild(side);
        if (o.status === 'paid') {
          var acts = el('div', { class: 'bill-row__actions' });
          acts.appendChild(FF.UI.button(t('view', 'View'), { class: 'btn-sm btn-ghost', icon: 'eye', onClick: function () { Billing.openInvoice(o.id); } }));
          var dl = FF.UI.button(t('downloadPdf', 'Download PDF'), { class: 'btn-sm', icon: 'download', onClick: function () { Billing.downloadInvoice(o.id, dl); } });
          acts.appendChild(dl);
          li.appendChild(acts);
        }
        list.appendChild(li);
      });
      return list;
    },

    // Names for products (the server's catalog), with fallbacks for older items.
    _names: {},
    productName: function (id) {
      if (Billing._names[id]) return Billing._names[id];
      var known = {
        plus_day: t('plusDayName', 'PlayMona Plus: 1 day'),
        plus_week: t('plusWeekName', 'PlayMona Plus: 1 week'),
        plus_month: t('plusMonthName', 'PlayMona Plus: 1 month'),
        plus_year: t('plusYearName', 'PlayMona Plus: 1 year'),
        plus_lifetime: t('plusLifetimeName', 'PlayMona Plus: lifetime')
      };
      return known[id] || (/^game_/.test(id) ? t('unlockGame', 'Unlock {game}', { game: id.slice(5) }) : id);
    },
    setProductNames: function (map) { Object.keys(map || {}).forEach(function (k) { Billing._names[k] = map[k]; }); }
  };

  FF.Billing = Billing;
})();
