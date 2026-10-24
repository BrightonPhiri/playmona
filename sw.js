/* ============================================================
   PLAYMONA — sw.js
   Offline support. Network first, so a new deploy shows up on
   the next load; the cache is the fallback when offline.
   On install it caches the app page (/play) and every file it links to.
   Pages use clean URLs; the server maps /play to play.html.
   ============================================================ */
var CACHE = 'playmona-v5';
var SDK_HOST = 'https://www.gstatic.com/firebasejs/';

/* Our own files are always rechecked with the server (cheap when unchanged).
   The host once told browsers to keep files for years; without this a
   returning player could keep an old copy even after a deploy. */
function fresh(req) {
  if (typeof req === 'string') return new Request(req, { cache: 'no-cache' });
  if (req.mode === 'navigate') return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  return new Request(req, { cache: 'no-cache' });
}
function fetchFresh(req) {
  var r = fresh(req);
  return r instanceof Request ? fetch(r) : r;
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return fetch('play', { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) return;
      var copy = res.clone();
      return res.text().then(function (html) {
        // The public pages too, so each one opens offline as itself.
        var urls = ['./', 'privacy', 'terms', 'refunds', '404', 'error','css/landing.css', 'css/doc.css', 'js/doc.js', 'js/install.js',
          'manifest.webmanifest', 'assets/brand/mark-256.webp'];
        html.replace(/(?:src|href)="([^"#:]+)"/g, function (m, url) { urls.push(url); return m; });
        return cache.put('play', copy).then(function () {
          // One missing file must not stop the rest from caching.
          return Promise.all(urls.map(function (u) { return cache.add(fresh(u)).catch(function () {}); }));
        });
      });
    }).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  var sameOrigin = url.indexOf(self.location.origin) === 0;
  // Live data (Firebase database, auth) is never cached; only the SDK files are.
  if (!sameOrigin && url.indexOf(SDK_HOST) !== 0) return;
  // The API (payments, orders) always goes to the server.
  if (sameOrigin && url.indexOf(self.location.origin + '/api/') === 0) return;
  // Songs stream in pieces (range requests) that the cache cannot store: the browser fetches them itself.
  if (req.headers.has('range') || (sameOrigin && url.indexOf(self.location.origin + '/assets/music/') === 0)) return;

  event.respondWith((sameOrigin ? fetchFresh(req) : fetch(req)).then(function (res) {
    // The server (or Cloudflare in front of it) has a problem: use the saved copy,
    // so players keep playing instead of seeing an error.
    if (res.status >= 500) {
      return saved(req).then(function (hit) { return hit || res; });
    }
    if (res && (res.ok || res.type === 'opaque')) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return saved(req).then(function (hit) { return hit || Response.error(); });
  }));
});

/* The saved copy of a request. A page never saved falls back to the app (for app
   links) or the home page, and last of all to PlayMona's own "back soon" page. */
function saved(req) {
  var page = req.mode === 'navigate';
  return caches.match(req, { ignoreSearch: page }).then(function (hit) {
    if (hit || !page) return hit;
    var path = new URL(req.url).pathname;
    return caches.match(/\/play(\.html)?$/.test(path) ? 'play' : './').then(function (home) {
      return home || caches.match('error');
    });
  });
}
