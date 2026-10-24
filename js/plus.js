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

  // Prices are set on the server (admins change them in the portal). These standard
  // plans only draw the page until /api/catalog answers, or when it cannot.
  var LIFETIME_DAYS = 36500;
  var PLANS = [
    { id: 'plus_day', cents: 99, days: 1 },
    { id: 'plus_week', cents: 299, days: 7 },
    { id: 'plus_month', cents: 499, days: 30 },
    { id: 'plus_year', cents: 4999, days: 365, best: true },
    { id: 'plus_lifetime', cents: 9999, days: LIFETIME_DAYS, lifetime: true }
  ].map(function (p) { p.image = '/assets/images/plus/' + p.id + '.jpg'; return p; });

  function planLabel(p) {
    return {
      plus_day: t('plusDay', '1 day'), plus_week: t('plusWeek', '1 week'), plus_month: t('plusMonth', '1 month'),
      plus_year: t('plusYear', '1 year'), plus_lifetime: t('plusLifetime', 'Lifetime')
    }[p.id] || p.label || p.name;
  }

  function planNote(p) {
    if (p.lifetime) return t('plusForever', 'Pay once, keep it forever');
    if (p.days <= 1) return t('plusOneDay', '24 hours of everything');
    if (p.days <= 7) return t('plusOneOff', 'One payment');
    return t('plusPerWeek', 'About {price} a week', { price: money(Math.round(p.cents / (p.days / 7))) });
  }

  // Everything on sale, from the server. Resolves null when it cannot answer.
  var catalogPromise = null;
  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch('/api/catalog', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('catalog ' + r.status);
        return r.json();
      }).then(function (data) {
        var items = data.items || [];
        if (FF.Billing) {
          var names = {};
          items.forEach(function (it) { names[it.id] = it.name; });
          FF.Billing.setProductNames(names);
        }
        return items;
      }).catch(function () { catalogPromise = null; return null; });
    }
    return catalogPromise;
  }

  // Plans on sale. Resolves with the standard plans if the server cannot answer.
  function loadPlans() {
    return loadCatalog().then(function (items) {
      return items ? items.filter(function (it) { return it.kind === 'plus'; }) : PLANS;
    });
  }

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
    // Lifetime Plus is stored as 100 years; anything past 50 years from now is "for life".
    isLifetime: function () { return access.plusUntil > Date.now() + 50 * 365 * 86400000; },
    ownsGame: function (id) { return this.hasPlus() || !!access.games[id]; },
    isAdmin: function () { return isAdmin; },
    money: money,

    // The pay-once item for one game (from the server's catalog), or null when it is not sold alone.
    gameOffer: function (id) {
      if (!online()) return Promise.resolve(null);
      return loadCatalog().then(function (items) {
        return (items || []).filter(function (it) { return it.kind === 'game' && it.game === id; })[0] || null;
      });
    },

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

    /* "By buying you agree to the Terms and Refund policy", with links. */
    agreeLine: function () {
      var p = FF.ui.el('p', { class: 'plus-agree' });
      var parts = t('plusAgree', 'By buying you agree to the {terms} and the {refunds}.').split(/(\{terms\}|\{refunds\})/);
      parts.forEach(function (part) {
        if (part === '{terms}') p.appendChild(FF.Reader.link('terms', t('termsOfService', 'Terms of Service')));
        else if (part === '{refunds}') p.appendChild(FF.Reader.link('refunds', t('refundPolicy', 'Refund policy')));
        else if (part) p.appendChild(document.createTextNode(part));
      });
      return p;
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
      body.appendChild(FF.UI.loading(t('loadingPayments', 'Loading your payments…'), { compact: true }));
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
          if (on && FF.Plus.isLifetime()) {
            words.appendChild(FF.ui.el('strong', {}, t('plusLifetimeOn', 'Plus is yours for life')));
            words.appendChild(FF.ui.el('span', {}, t('plusLifetimeSub', 'Nothing more to pay. Thank you for supporting PlayMona!')));
          } else if (on) {
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

        // Plans (hidden once the player has Plus for life: there is nothing more to buy)
        var plansHead = FF.App.sectionHead(t('plusChoose', 'Choose your time'));
        main.appendChild(plansHead);
        var grid = FF.ui.div('plus-plans');
        main.appendChild(grid);
        function drawPlans(plans) {
          FF.ui.clear(grid);
          var life = FF.Plus.isLifetime();
          plansHead.hidden = life;
          grid.hidden = life;
          plans.forEach(function (p) {
            var card = FF.ui.el('section', { class: 'plus-plan' + (p.best ? ' plus-plan--best' : '') + (p.lifetime ? ' plus-plan--lifetime' : '') });
            if (p.best) card.appendChild(FF.ui.span('plus-plan__badge', t('bestValue', 'Best value')));
            if (p.imageUrl || p.image) {
              var img = FF.ui.el('img', { class: 'plus-plan__img', src: p.imageUrl || p.image, alt: '', loading: 'lazy', decoding: 'async', width: 800, height: 800 });
              img.addEventListener('error', function () { img.remove(); });
              card.appendChild(img);
            }
            card.appendChild(FF.ui.el('h2', { class: 'plus-plan__name' }, planLabel(p)));
            card.appendChild(FF.ui.el('p', { class: 'plus-plan__price' }, money(p.cents)));
            card.appendChild(FF.ui.el('p', { class: 'plus-plan__note' }, planNote(p)));
            var btn = FF.UI.button(t('buyFor', 'Buy for {price}', { price: money(p.cents) }), {
              class: 'btn-primary btn-block',
              onClick: function () { FF.Plus.buy(p.id, btn); }
            });
            card.appendChild(btn);
            grid.appendChild(card);
          });
        }
        var shownPlans = PLANS;
        drawPlans(shownPlans);
        loadPlans().then(function (plans) {
          if (!grid.isConnected || plans === PLANS) return;
          shownPlans = plans;
          drawPlans(plans);
        });
        var offPlans = FF.Plus.onChange(function () {
          if (!grid.isConnected) { offPlans(); return; }
          if (grid.hidden !== FF.Plus.isLifetime()) drawPlans(shownPlans);
        });

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
        how.appendChild(FF.Plus.agreeLine());
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
