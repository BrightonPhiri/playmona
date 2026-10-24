/* ============================================================
   PLAYMONA — plus.js
   PlayMona Plus and paid games.

   - What the player owns comes from Firebase /entitlements/<uid>.
     Only the server writes it (api/, after a Linkwa payment or an
     admin grant), so the app can read it but never change it.
   - Buying: POST /api/checkout -> Linkwa checkout page -> back to
     /play?payment=paid|pending|failed&order=... -> a toast here.
   - The Plus page is shown to admins, and to everyone once the
     admin portal's Site > Payments switch is on.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  };

  // Linkwa sends the player back to /play?payment=…&order=…, and app.js clears the
  // address when it starts, so read it now while the script loads.
  var returned = (function () {
    var q = (typeof location !== 'undefined' && location.search) || '';
    var m = /[?&]payment=(paid|pending|failed)\b/.exec(q);
    var o = /[?&]order=(o_[a-f0-9]{24})\b/.exec(q);
    return m ? { outcome: m[1], order: o ? o[1] : null } : null;
  })();

  var EMPTY = { plusUntil: 0, games: {} };
  var access = EMPTY;
  var isAdmin = false;
  var listeners = [];
  var watching = null;      // { uid, ref, fn }
  var authHooked = false;

  function changed() {
    listeners.slice().forEach(function (fn) { FF.safe ? FF.safe(fn) : fn(); });
  }

  function setAccess(v) {
    access = {
      plusUntil: Math.max(0, Number(v && v.plusUntil) || 0),
      games: (v && v.games && typeof v.games === 'object') ? v.games : {}
    };
    FF.Storage.set('plusAccess', access);
    changed();
  }

  // Payments need a real Firebase account on the live site (not file:// or a device-only account).
  function online() {
    return typeof location !== 'undefined' && /^https?:$/.test(location.protocol) &&
      FF.Auth && FF.Auth.mode() === 'firebase' && !FF.Auth.isGuest();
  }

  function idToken() {
    return FF.Net.ensureFirebase().then(function (firebase) {
      var u = firebase.auth().currentUser;
      if (!u || u.isAnonymous) throw new Error(t('payNeedsSignIn', 'Please sign in again to buy.'));
      return u.getIdToken();
    });
  }

  function api(method, path, body) {
    return idToken().then(function (tok) {
      return fetch('/api' + path, {
        method: method,
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store'
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var e = new Error(data.message || t('payDown', 'Payments are not available right now. Please try again soon.'));
          e.code = data.error || 'http-' + res.status;
          throw e;
        }
        return data;
      });
    });
  }

  // Follow /entitlements/<uid> and /admins/<uid> for whoever is signed in to Firebase.
  function watch() {
    if (authHooked || !online()) return;
    authHooked = true;
    FF.Net.ensureFirebase().then(function (firebase) {
      firebase.auth().onAuthStateChanged(function (u) {
        if (watching) { watching.ref.off('value', watching.fn); watching = null; }
        isAdmin = false;
        if (!u || u.isAnonymous) { setAccess(EMPTY); return; }
        var db = firebase.database();
        var ref = db.ref('entitlements/' + u.uid);
        var fn = function (snap) { setAccess(snap.val()); };
        ref.on('value', fn, function () {});
        watching = { uid: u.uid, ref: ref, fn: fn };
        db.ref('admins/' + u.uid).once('value').then(function (snap) {
          isAdmin = snap.val() === true;
          if (isAdmin) changed();
        }).catch(function () {});
      });
    }).catch(function () { authHooked = false; });
  }

  function money(cents) {
    var d = cents / 100;
    return '$' + (d % 1 ? d.toFixed(2) : String(d));
  }

  function dateText(ms) {
    try {
      return new Date(ms).toLocaleDateString(FF.i18n && FF.i18n.getLang ? FF.i18n.getLang() : undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return new Date(ms).toDateString(); }
  }

  // Prices are set on the server; these are only for drawing the page before it answers.
  var PLANS = [
    { id: 'plus_week', cents: 100, days: 7, label: function () { return t('plusWeek', '1 week'); } },
    { id: 'plus_month', cents: 300, days: 30, label: function () { return t('plusMonth', '1 month'); } },
    { id: 'plus_year', cents: 2500, days: 365, label: function () { return t('plusYear', '1 year'); }, best: true }
  ];

  FF.Plus = {
    init: function () {
      var saved = FF.Storage.get('plusAccess', null);
      if (saved) access = { plusUntil: Number(saved.plusUntil) || 0, games: saved.games || {} };
      watch();
    },

    onChange: function (fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    },

    access: function () { return access; },
    hasPlus: function () { return access.plusUntil > Date.now(); },
    ownsGame: function (id) { return this.hasPlus() || !!access.games[id]; },
    isAdmin: function () { return isAdmin; },

    // The Plus page shows for admins (testing) and for everyone once payments are switched on.
    visible: function () {
      if (FF.Auth && FF.Auth.isGuest && FF.Auth.isGuest()) return false;
      var site = FF.GameConfig ? FF.GameConfig.site() : {};
      return !!site.payments || isAdmin;
    },

    buy: function (productId, button) {
      if (!online()) {
        FF.UI.toast(t('payOffline', 'Buying needs an account on playmona.com.'), { type: 'error' });
        return Promise.resolve();
      }
      if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
      return api('POST', '/checkout', { product: productId }).then(function (data) {
        FF.Storage.set('plusPendingOrder', data.order);
        window.location.assign(data.checkoutUrl);
      }).catch(function (e) {
        if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
        FF.UI.toast(e.message, { type: 'error' });
      });
    },

    order: function (id) { return api('GET', '/orders/' + encodeURIComponent(id)); },
    me: function () { return api('GET', '/me'); },

    /*
     * Fills target with the player's payments (FF.Billing.historyList): View and
     * Download PDF on each paid one. opts.hideWhenEmpty hides target when there are none.
     */
    history: function (target, opts) {
      opts = opts || {};
      if (!online()) { target.hidden = !!opts.hideWhenEmpty; return; }
      var body = opts.body || target;
      FF.ui.clear(body);
      body.appendChild(FF.ui.el('p', { class: 'bill-loading' }, t('loading', 'Loading…')));
      this.me().then(function (data) {
        FF.ui.clear(body);
        var orders = (data.orders || []).filter(function (o) { return o.status === 'paid' || o.status === 'pending'; });
        if (!orders.length && opts.hideWhenEmpty) { target.hidden = true; return; }
        target.hidden = false;
        body.appendChild(FF.Billing.historyList(orders));
      }).catch(function () {
        FF.ui.clear(body);
        if (opts.hideWhenEmpty) { target.hidden = true; return; }
        body.appendChild(FF.ui.el('p', { class: 'bill-error' }, t('historyDown', 'Your payments could not be loaded. Check the connection and try again.')));
      });
    },

    /* Called by app.js once the app has drawn: says how the payment went. */
    handleReturn: function () {
      if (!returned) return;
      var r = returned;
      returned = null;
      FF.Storage.set('plusPendingOrder', null);
      if (r.outcome === 'paid') {
        FF.UI.toast(t('payThanks', 'Payment received. Thank you!'), { type: 'success' });
        if (FF.Confetti && FF.Confetti.burst) FF.safe(function () { FF.Confetti.burst(); });
      } else if (r.outcome === 'failed') {
        FF.UI.toast(t('payFailed', 'The payment did not go through. You have not been charged.'), { type: 'error' });
      } else {
        FF.UI.toast(t('payPending', 'We are confirming your payment. This can take a few minutes.'), { type: 'info' });
        if (r.order) this._pollOrder(r.order, 0);
      }
      FF.Nav.go('plus');
    },

    _pollOrder: function (id, tries) {
      var self = this;
      if (tries >= 12) return;
      setTimeout(function () {
        self.order(id).then(function (data) {
          if (data.order && data.order.status === 'paid') {
            FF.UI.toast(t('payThanks', 'Payment received. Thank you!'), { type: 'success' });
          } else if (data.order && data.order.status === 'pending') {
            self._pollOrder(id, tries + 1);
          }
        }).catch(function () { self._pollOrder(id, tries + 1); });
      }, 10000);
    },

    /* ---------------- The Plus page ---------------- */
    views: {
      plus: function (main) {
        var head = FF.ui.div('social-head social-head--blue plus-head');
        var ic = FF.ui.span('social-head__icon');
        ic.appendChild(FF.Icons.icon('crown'));
        head.appendChild(ic);
        var txt = FF.ui.div('social-head__text');
        txt.appendChild(FF.ui.el('h1', { class: 'social-head__title' }, t('plusTitle', 'PlayMona Plus')));
        txt.appendChild(FF.ui.el('p', { class: 'social-head__sub' }, t('plusSub', 'Support PlayMona and unlock more. Pay once for the time you want. Nothing renews by itself.')));
        head.appendChild(txt);
        main.appendChild(head);

        // Status
        var status = FF.ui.el('section', { class: 'social-card plus-status', 'aria-live': 'polite' });
        main.appendChild(status);
        var off = null;
        function drawStatus() {
          if (off && !status.isConnected) { off(); return; }   // the page was left
          FF.ui.clear(status);
          var on = FF.Plus.hasPlus();
          var row = FF.ui.div('plus-status__row');
          row.appendChild(FF.Icons.icon(on ? 'check-circle' : 'crown', null, 'plus-status__icon' + (on ? ' is-on' : '')));
          var words = FF.ui.div('plus-status__text');
          if (on) {
            var days = Math.ceil((access.plusUntil - Date.now()) / 86400000);
            words.appendChild(FF.ui.el('strong', {}, t('plusActive', 'Plus is on')));
            words.appendChild(FF.ui.el('span', {}, t('plusUntil', 'Until {date} ({n} days left). Buying again adds more time.', { date: dateText(access.plusUntil), n: days })));
          } else {
            words.appendChild(FF.ui.el('strong', {}, t('plusOff', 'You do not have Plus yet')));
            words.appendChild(FF.ui.el('span', {}, t('plusOffSub', 'Choose how long you want it below.')));
          }
          row.appendChild(words);
          status.appendChild(row);
          var owned = Object.keys(access.games || {});
          if (owned.length) {
            status.appendChild(FF.ui.el('p', { class: 'plus-status__games' }, t('plusOwned', 'Games you own: {list}', {
              list: owned.map(function (id) { var g = FF.Games && FF.Games.get ? FF.Games.get(id) : null; return g ? g.name : id; }).join(', ')
            })));
          }
        }
        drawStatus();
        off = FF.Plus.onChange(drawStatus);

        // Plans
        main.appendChild(FF.App.sectionHead(t('plusChoose', 'Choose your time')));
        var grid = FF.ui.div('plus-plans');
        PLANS.forEach(function (p) {
          var card = FF.ui.el('section', { class: 'plus-plan' + (p.best ? ' plus-plan--best' : '') });
          if (p.best) card.appendChild(FF.ui.span('plus-plan__badge', t('bestValue', 'Best value')));
          card.appendChild(FF.ui.el('h2', { class: 'plus-plan__name' }, p.label()));
          card.appendChild(FF.ui.el('p', { class: 'plus-plan__price' }, money(p.cents)));
          var perWeek = Math.round(p.cents / (p.days / 7));
          card.appendChild(FF.ui.el('p', { class: 'plus-plan__note' }, p.days === 7 ? t('plusOneOff', 'One payment') : t('plusPerWeek', 'About {price} a week', { price: money(perWeek) })));
          var btn = FF.UI.button(t('buyFor', 'Buy for {price}', { price: money(p.cents) }), {
            class: 'btn-primary btn-block',
            onClick: function () { FF.Plus.buy(p.id, btn); }
          });
          card.appendChild(btn);
          grid.appendChild(card);
        });
        main.appendChild(grid);

        // How paying works
        var how = FF.ui.el('section', { class: 'social-card' });
        how.appendChild(FF.ui.el('h2', { class: 'panel__heading' }, t('plusHow', 'How paying works')));
        var list = FF.ui.el('ul', { class: 'social-rules' });
        [
          t('plusHow1', 'Pay with EcoCash, InnBucks, OneMoney, Omari, SmileCash, Visa or Mastercard on Linkwa’s secure page.'),
          t('plusHow2', 'Prices are in US dollars. You pay once; nothing is charged again unless you buy again.'),
          t('plusHow3', 'Plus starts as soon as the payment is confirmed, on every device you sign in on.')
        ].forEach(function (line) {
          var li = FF.ui.el('li');
          li.appendChild(FF.Icons.icon('check'));
          li.appendChild(FF.ui.span('', line));
          list.appendChild(li);
        });
        how.appendChild(list);
        main.appendChild(how);

        // Payment history, with invoices
        var hist = FF.ui.el('section', { class: 'social-card plus-history' });
        hist.appendChild(FF.ui.el('h2', { class: 'panel__heading' }, t('paymentHistory', 'Payment history')));
        var histBody = FF.ui.div('');
        hist.appendChild(histBody);
        main.appendChild(hist);
        if (online()) FF.Plus.history(hist, { body: histBody });
        else histBody.appendChild(FF.ui.el('p', { class: 'bill-empty' }, t('historyOnline', 'Your payments show here when you are signed in on playmona.com.')));

        if (!FF.GameConfig || !FF.GameConfig.site().payments) {
          main.appendChild(FF.ui.el('p', { class: 'plus-admin-note' }, t('plusAdminOnly', 'Only admins can see this page. Turn on Payments in the admin portal (Site) to show it to everyone.')));
        }
      }
    }
  };
})();
