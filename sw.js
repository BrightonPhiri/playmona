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
        var urls = ['./', 'privacy', 'css/landing.css', 'js/install.js',
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

  event.respondWith((sameOrigin ? fetchFresh(req) : fetch(req)).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') {
        // Offline and never cached: the app for app links, else the home page.
        var path = new URL(req.url).pathname;
        return caches.match(/\/play(\.html)?$/.test(path) ? 'play' : './').then(function (page) {
          return page || Response.error();
        });
      }
      return Response.error();
    });
  }));
});
