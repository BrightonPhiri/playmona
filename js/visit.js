/* ============================================================
   PLAYMONA — visit.js
   Counts visitors for the admin portal, including people who only
   look at the landing page. Self-contained: needs only the Firebase
   web config (js/net/firebase-config.js), no sign-in, no SDK.

   Each device gets a random id (no personal details). Once a day it
   writes stats/days/<UTC day>/visitors/<id> = the first page seen:
   'l' landing, 'a' app, 'p' privacy notice. The database rules let
   anyone add an id once and nobody read the list but admins.

   It also sends the same id and page to /api/visit. The server adds
   the country (from Cloudflare) and a shortened IP address, which
   the admin portal shows in the Visitors details.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'playmona:';

  function get(k) { try { return JSON.parse(window.localStorage.getItem(KEY + k)); } catch (e) { return null; } }
  function set(k, v) { try { window.localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} }

  function randomId() {
    var a = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function page() {
    var p = window.location.pathname;
    if (/\/play(\.html)?$/.test(p)) return 'a';
    if (/\/privacy(\.html)?$/.test(p)) return 'p';
    return 'l';
  }

  function count() {
    if (!window.fetch || window.location.protocol === 'file:') return;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) return;   // not while developing
    var today = new Date().toISOString().slice(0, 10);
    var id = get('visitorId');
    if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) { id = randomId(); set('visitorId', id); }
    var where = page();

    var cfg = window.FF && window.FF.FirebaseConfig;
    if (cfg && cfg.databaseURL && get('visitDay') !== today) {
      var url = cfg.databaseURL.replace(/\/$/, '') + '/stats/days/' + today + '/visitors/' + id + '.json';
      fetch(url, { method: 'PUT', body: JSON.stringify(where), keepalive: true })
        .then(function (r) {
          // 200: counted. 401: already counted today (another tab, or the rules refused it).
          if (r.ok || r.status === 401) set('visitDay', today);
        })
        .catch(function () {});
    }

    if (get('visitApiDay') !== today) {
      fetch('/api/visit', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, page: where })
      })
        .then(function (r) { if (r.ok) set('visitApiDay', today); })
        .catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', count);
  else count();
})();
