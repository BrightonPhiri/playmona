/* ============================================================
   PLAYMORA — sw.js
   Offline support. Network first, so a new deploy shows up on
   the next load; the cache is the fallback when offline.
   On install it caches play.html and every file it links to.
   ============================================================ */
var CACHE = 'playmora-v3';
var SDK_HOST = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return fetch('play.html', { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) return;
      var copy = res.clone();
      return res.text().then(function (html) {
        var urls = ['./', 'index.html', 'manifest.webmanifest', 'assets/brand/mark-256.webp'];
        html.replace(/(?:src|href)="([^"#:]+)"/g, function (m, url) { urls.push(url); return m; });
        return cache.put('play.html', copy).then(function () {
          // One missing file must not stop the rest from caching.
          return Promise.all(urls.map(function (u) { return cache.add(u).catch(function () {}); }));
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

  event.respondWith(fetch(req).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('play.html');
      return Response.error();
    });
  }));
});
