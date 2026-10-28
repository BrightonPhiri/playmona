'use strict';
/* Firebase Realtime Database over REST for the crew runner, signed in as the service account
   (Node built-ins only). Streams use Firebase's server-sent events. roomTransport() gives the
   same interface as js/net/transport.js, so js/crew/controller.js runs unchanged on it. */

const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

const SCOPES = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function request(method, url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ method, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: headers || {} }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 15000, () => req.destroy(new Error('timed out')));
    if (body != null) req.write(body);
    req.end();
  });
}

/** Google access tokens for a service account, renewed a minute before they expire. */
function tokenSource(account, post) {
  post = post || request;
  let token = null;
  let until = 0;
  return async function () {
    if (token && Date.now() < until - 60000) return token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: account.private_key_id }));
    const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPES, aud: account.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = b64url(crypto.createSign('RSA-SHA256').update(head + '.' + claims).sign(account.private_key));
    const body = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claims + '.' + sig;
    const res = await post('POST', account.token_uri || 'https://oauth2.googleapis.com/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
    if (res.status !== 200 || !res.json || !res.json.access_token) throw new Error('service account sign-in failed (' + res.status + ')');
    token = res.json.access_token;
    until = Date.now() + (res.json.expires_in || 3600) * 1000;
    return token;
  };
}

function checkPath(path) {
  if (!/^[A-Za-z0-9_\/-]*$/.test(path)) throw new Error('bad path ' + path);
  return path.replace(/^\/+|\/+$/g, '');
}

class Rtdb {
  constructor(databaseUrl, token) {
    this.base = databaseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  async call(method, path, value, extra) {
    const headers = Object.assign({ Authorization: 'Bearer ' + await this.token(), 'Content-Type': 'application/json' }, extra || {});
    const res = await request(method, this.base + '/' + checkPath(path) + '.json', headers, value === undefined ? null : JSON.stringify(value));
    return res;
  }

  async get(path) {
    const res = await this.call('GET', path);
    if (res.status !== 200) throw new Error('read ' + path + ' failed (' + res.status + ')');
    return res.json;
  }

  async set(path, value) {
    const res = await this.call(value === null ? 'DELETE' : 'PUT', path, value === null ? undefined : value);
    if (res.status !== 200) throw new Error('write ' + path + ' failed (' + res.status + ')');
    return res.json;
  }

  async update(path, values) {
    Object.keys(values).forEach(checkPath);
    const res = await this.call('PATCH', path, values);
    if (res.status !== 200) throw new Error('update ' + path + ' failed (' + res.status + ')');
  }

  /** Compare-and-set with Firebase ETags, retried a few times like a client transaction. */
  async transaction(path, fn) {
    for (let i = 0; i < 5; i++) {
      const cur = await this.call('GET', path, undefined, { 'X-Firebase-ETag': 'true' });
      if (cur.status !== 200) throw new Error('read ' + path + ' failed (' + cur.status + ')');
      const next = fn(cur.json);
      if (next === undefined) return { committed: false, value: cur.json };
      const put = await this.call('PUT', path, next, { 'if-match': cur.headers.etag });
      if (put.status === 200) return { committed: true, value: next };
      if (put.status !== 412) throw new Error('write ' + path + ' failed (' + put.status + ')');
    }
    return { committed: false, value: null };
  }

  /** Measures how far this machine's clock is from Firebase's (ms to add to Date.now()). */
  async clockOffset() {
    const t0 = Date.now();
    const at = await this.set('crewClock', { '.sv': 'timestamp' });
    const t1 = Date.now();
    return typeof at === 'number' ? Math.round(at - (t0 + t1) / 2) : 0;
  }

  /**
   * Streams a path: onTree(tree) after every change. Reconnects after drops and token expiry.
   * Returns { close }.
   */
  stream(path, onTree, log) {
    let tree = null;
    let closed = false;
    let req = null;
    let retry = null;
    const self = this;
    log = log || function () {};

    function apply(rel, data, merge) { tree = applyEvent(tree, rel, data, merge); }

    async function open(url) {
      if (closed) return;
      const target = new URL(url || self.base + '/' + checkPath(path) + '.json');
      const headers = { Accept: 'text/event-stream', Authorization: 'Bearer ' + await self.token() };
      req = https.request({ method: 'GET', hostname: target.hostname, path: target.pathname + target.search, headers }, (res) => {
        if (res.statusCode === 307 && res.headers.location) { res.resume(); open(res.headers.location); return; }
        if (res.statusCode !== 200) { res.resume(); log('stream ' + path + ' status ' + res.statusCode); again(); return; }
        res.setEncoding('utf8');
        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk;
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = (block.match(/^event: (.*)$/m) || [])[1];
            const dataLine = (block.match(/^data: (.*)$/m) || [])[1];
            if (ev === 'put' || ev === 'patch') {
              try {
                const msg = JSON.parse(dataLine);
                apply(msg.path, msg.data, ev === 'patch');
                onTree(tree);
              } catch (e) { log('stream parse: ' + e.message); }
            } else if (ev === 'auth_revoked' || ev === 'cancel') {
              req.destroy();
            }
          }
        });
        res.on('end', again);
        res.on('error', again);
      });
      req.on('error', again);
      req.end();
    }

    function again() {
      if (closed || retry) return;
      retry = setTimeout(() => { retry = null; open(); }, 2000);
    }

    open().catch((e) => { log('stream ' + path + ': ' + e.message); again(); });
    return {
      close() {
        closed = true;
        if (retry) clearTimeout(retry);
        if (req) req.destroy();
      }
    };
  }
}

/** Writes data at a path in the tree (null deletes it). Returns the tree, which may be a new object. */
function putAt(tree, rel, data) {
  const parts = String(rel || '').split('/').filter(Boolean);
  if (!parts.length) return data;
  if (!tree || typeof tree !== 'object') {
    if (data === null) return tree;
    tree = {};
  }
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') {
      if (data === null) return tree;        // deleting under something that is not there
      node[parts[i]] = {};
    }
    node = node[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (data === null) delete node[last];
  else node[last] = data;
  return tree;
}

/**
 * Applies one stream event to the cached tree. A put replaces the data at path. A patch's keys
 * are paths relative to it: a multi-path update such as { 'meta/status': 'playing' } arrives
 * like that, and must land in tree.meta.status, not in a key called "meta/status".
 */
function applyEvent(tree, path, data, merge) {
  if (!merge) return putAt(tree, path, data);
  const base = String(path || '').replace(/\/+$/, '');
  Object.keys(data || {}).forEach((k) => { tree = putAt(tree, base + '/' + k, data[k]); });
  return tree;
}

/** One room as the transport interface js/net/transport.js defines (paths relative to the room). */
function roomTransport(rtdb, code, serverNow, log) {
  const root = 'rooms/' + code;
  const watchers = [];
  let tree = {};
  let ready = false;
  const sub = (path) => path.split('/').filter(Boolean).reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), tree);
  const stream = rtdb.stream(root, (t) => {
    tree = t || {};
    ready = true;
    watchers.forEach((w) => {
      const v = sub(w.path);
      const s = JSON.stringify(v === undefined ? null : v);
      if (s !== w.last) { w.last = s; w.cb(v === undefined ? null : v); }
    });
  }, log);
  const join = (p) => (p ? root + '/' + p : root);
  return {
    serverNow,
    get: (p) => rtdb.get(join(p)),
    set: (p, v) => rtdb.set(join(p), v),
    update: (p, obj) => rtdb.update(join(p), obj),
    transaction: (p, fn) => rtdb.transaction(join(p), fn),
    watch(path, cb) {
      const w = { path, cb, last: undefined };
      watchers.push(w);
      if (ready) { const v = sub(path); w.last = JSON.stringify(v === undefined ? null : v); cb(v === undefined ? null : v); }
      return () => { const i = watchers.indexOf(w); if (i >= 0) watchers.splice(i, 1); };
    },
    close() { stream.close(); }
  };
}

module.exports = { Rtdb, tokenSource, roomTransport, request, applyEvent };
