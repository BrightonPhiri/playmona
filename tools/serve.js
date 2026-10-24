#!/usr/bin/env node
/* Local preview server that behaves like the live nginx setup:
   /play serves play.html, and /play.html redirects to /play.
   Usage: node tools/serve.js [port]   (default 8960)
   Every response is sent with no-store so edits show on reload.
   /api/... is passed to PHP's own server on port+1, if it is running:
     php -S 127.0.0.1:8961 tools/api/router.php   (settings: api/config.local.php) */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var PORT = Number(process.argv[2]) || 8960;
var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8'
};

// Range requests are answered like nginx does, so songs can be streamed and skipped through.
function send(res, file, req) {
  var head = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  var size = fs.statSync(file).size;
  var r = /^bytes=(\d*)-(\d*)$/.exec((req && req.headers.range) || '');
  if (r && (r[1] || r[2])) {
    var start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2]));
    var end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    head['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
    head['Content-Length'] = end - start + 1;
    res.writeHead(206, head);
    return fs.createReadStream(file, { start: start, end: end }).pipe(res);
  }
  head['Content-Length'] = size;
  res.writeHead(200, head);
  fs.createReadStream(file).pipe(res);
}

function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }

function proxyApi(req, res) {
  var up = http.request({ host: '127.0.0.1', port: PORT + 1, path: req.url, method: req.method, headers: req.headers }, function (r) {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', function () {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end('{"error":"server","message":"The local API is not running (php -S 127.0.0.1:' + (PORT + 1) + ' tools/api/router.php)."}');
  });
  req.pipe(up);
}

http.createServer(function (req, res) {
  if (req.url.indexOf('/api/') === 0) return proxyApi(req, res);
  var parts = req.url.split('?');
  var pathname = decodeURIComponent(parts[0]);
  var query = parts.length > 1 ? '?' + parts.slice(1).join('?') : '';

  // Old .html links move to their clean address, like the live site.
  var m = /^\/(.+)\.html$/.exec(pathname);
  if (m) {
    res.writeHead(301, { Location: (m[1] === 'index' ? '/' : '/' + m[1]) + query });
    return res.end();
  }

  var file = path.join(ROOT, pathname);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end(); }
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');

  if (isFile(file)) return send(res, file, req);
  if (isFile(file + '.html')) return send(res, file + '.html', req);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}).listen(PORT, function () {
  console.log('PlayMona preview on http://localhost:' + PORT);
});
