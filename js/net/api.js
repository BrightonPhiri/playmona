/* PlayMona API calls with the Firebase sign-in token (FF.Api).
 *
 *   FF.Api.call('GET', '/c/mine')                       -> Promise of the JSON reply
 *   FF.Api.call('POST', '/c', { title: ... })
 *   FF.Api.call('POST', '/c/<id>/join', body, { guest: true })   anonymous sign-in is fine
 *   FF.Api.call('GET', '/c/find?slug=x', null, { noAuth: true }) no sign-in at all
 *   FF.Api.upload('/c/<id>/media?purpose=cover', blob)
 *
 * Errors reject with an Error whose .message is safe to show and .code is the server's reason.
 *
 * Local development (FF.Net.devMode(), the devRooms flag): no Firebase. Requests carry
 * "dev.<uid>.<provider>", which only tools/api/router.php accepts, and only on this computer
 * with PLAYMONA_DEV_AUTH=1. The live site never sees that form.
 */
window.FF = window.FF || {};
(function () {
  'use strict';

  function t(k, f) { return FF.t ? FF.t(k, f) : f; }

  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  // One id per browser tab, so two tabs are two different guests while testing.
  function devUid() {
    var key = 'playmona:devApiUid';
    var id = null;
    try { id = sessionStorage.getItem(key); } catch (e) {}
    if (!id) {
      id = 'dev' + Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem(key, id); } catch (e) {}
    }
    return id;
  }

  /* The bearer token. guest: an anonymous Firebase sign-in is acceptable (made if needed). */
  function token(opts) {
    if (devMode()) {
      var acct = FF.Auth && FF.Auth.user && FF.Auth.user();
      var real = acct && !FF.Auth.isGuest() && !opts.guest;
      return Promise.resolve('dev.' + (real ? String(acct.uid).replace(/[^A-Za-z0-9_-]/g, '') : devUid()) + '.' + (real ? 'password' : 'anonymous'));
    }
    if (!FF.Net || !FF.Net.ensureFirebase) return Promise.reject(err(t('apiOffline', 'This needs an internet connection.'), 'offline'));
    return FF.Net.ensureFirebase().then(function (firebase) {
      var auth = firebase.auth();
      if (opts.guest) return FF.Net.signInForRoom(auth);
      var u = auth.currentUser;
      if (!u || u.isAnonymous) throw err(t('apiNeedsAccount', 'Please sign in to your PlayMona account.'), 'no-account');
      return u;
    }).then(function (u) { return u.getIdToken(); });
  }

  function err(message, code, status) {
    var e = new Error(message);
    e.code = code || 'error';
    e.status = status || 0;
    return e;
  }

  function send(method, path, body, opts, raw) {
    opts = opts || {};
    var ready = opts.noAuth ? Promise.resolve(null) : token(opts);
    return ready.then(function (tok) {
      var headers = {};
      if (tok) headers.Authorization = 'Bearer ' + tok;
      if (opts.headers) Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
      if (!raw && body) headers['Content-Type'] = 'application/json';
      if (raw) headers['Content-Type'] = raw.type || 'application/octet-stream';
      return fetch('/api' + path, {
        method: method,
        headers: headers,
        body: raw || (body ? JSON.stringify(body) : undefined),
        cache: 'no-store'
      });
    }, function (e) { throw e.code ? e : err(t('apiSignIn', 'We could not sign you in. Check your connection and try again.'), 'sign-in'); })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw err(data.message || t('apiDown', 'Something went wrong. Please try again.'), data.error || 'http-' + res.status, res.status);
          return data;
        });
      }, function (e) {
        if (e && e.code) throw e;
        throw err(t('apiOffline', 'We could not reach PlayMona. Check your connection and try again.'), 'offline');
      });
  }

  FF.Api = {
    call: function (method, path, body, opts) { return send(method, path, body, opts, null); },
    upload: function (path, blob, opts) { return send('POST', path, null, opts, blob); },
    devUid: devUid
  };
})();
