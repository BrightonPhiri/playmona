/* ============================================================
   PLAYMONA — watch/page.js
   Watching (phase 3). The watch page: /watch shows the Watch live
   list, /watch/<code> shows one game. Before joining a game it asks
   the server whether there is room (viewer limits), then signs in
   quietly (anonymous Firebase sign-in, no account needed), adds
   this viewer to watchers/<code> and follows broadcasts/<code>.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/;

  function t(key, fallback, vars) {
    if (FF.t) return FF.t(key, fallback, vars);
    var s = fallback;
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  function route(pathname) {
    var m = /\/watch\/([A-Za-z0-9]+)\/?$/.exec(String(pathname || ''));
    if (m) {
      var code = m[1].toUpperCase();
      if (CODE.test(code)) return { view: 'tv', code: code };
    }
    return { view: 'list' };
  }

  // JSON from the API as { status, body }; a network failure rejects.
  function fetchJson(url) {
    return window.fetch(url, { cache: 'no-store', credentials: 'same-origin' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; });
    });
  }

  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  function devList() {
    return FF.Transport.open('', true).then(function (tr) {
      return Promise.all([tr.get('broadcasts'), tr.get('watchers')]).then(function (both) {
        return FF.WatchList.fromBroadcasts(both[0] || {}, both[1] || {}, tr.serverNow());
      });
    });
  }

  function start(opts) {
    opts = opts || {};
    var main = opts.root || document.getElementById('main');
    var getJson = opts.fetch || fetchJson;
    var where = route(opts.pathname != null ? opts.pathname : location.pathname);
    var parts = [];             // things to tear down
    var stopped = false;

    function teardown() {
      parts.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
    }

    function showList(note) {
      teardown();
      FF.ui.clear(main);
      if (note) main.appendChild(note);
      var list = FF.WatchList.mount(main, { fetch: getJson, devList: devMode() ? devList : null });
      parts.push(function () { list.destroy(); });
    }

    function message(title, extra) {
      var box = FF.ui.div('wl-message', [FF.ui.el('h1', { class: 'wl-message__title' }, title)]);
      if (extra) box.appendChild(FF.ui.el('p', { class: 'wl-message__text' }, extra));
      return box;
    }

    // The game is over or gone: say so, then show what else is live.
    function finish(title, extra) {
      if (stopped) return;
      stopped = true;
      showList(message(title, extra));
    }

    function watch(code) {
      var tr = null;
      var uid = null;
      var seen = false;
      var last = null;
      var tv = null;
      var gone = false;

      parts.push(function () {
        gone = true;
        if (tv) tv.destroy();
        if (tr && uid) {
          tr.set('watchers/' + code + '/' + uid, null).catch(function () {});
          if (tr.onDisconnectCancel) tr.onDisconnectCancel('watchers/' + code + '/' + uid).catch(function () {});
        }
      });

      FF.Transport.open('', devMode()).then(function (transport) {
        tr = transport;
        return tr.connect();
      }).then(function (res) {
        if (gone) return;
        uid = res.uid;
        var mine = 'watchers/' + code + '/' + uid;
        tr.set(mine, tr.serverNow()).catch(function () {});
        tr.onDisconnectSet(mine, null).catch(function () {});

        FF.ui.clear(main);
        tv = FF.WatchTV.mount(main, { now: function () { return tr.serverNow(); }, stopHref: 'watch' });

        // Keep listening after a game stops or goes quiet: when the host turns
        // watching back on, or another player takes over as host, it comes back.
        var offB = tr.watch('broadcasts/' + code, function (b) {
          if (gone) return;
          last = b || null;
          if (!b) {
            if (seen) tv.showMessage(t('hostStopped', 'The host stopped sharing this game.'), t('hostStoppedWait', 'If they share it again, it will show here.'));
            else finish(t('notLive', 'This game isn’t live right now.'), t('notLiveText', 'Check the link, or pick another game.'));
            return;
          }
          seen = true;
          tv.update(FF.WatchView.model(b, tr.serverNow()));
        });
        var offW = tr.watch('watchers/' + code, function (v) {
          if (tv && !gone) tv.setViewers(v && typeof v === 'object' ? Object.keys(v).length : 0);
        });
        // A host whose phone died stops writing: notice it without any new data.
        var staleCheck = setInterval(function () {
          if (!last || gone) return;
          var m = FF.WatchView.model(last, tr.serverNow());
          if (m.state === 'ended') tv.update(m);
        }, 5000);
        // Check in, so people who left without saying so stop counting as viewers.
        var checkIn = setInterval(function () {
          if (!gone) tr.set(mine, tr.serverNow()).catch(function () {});
        }, opts.heartbeatMs || 30000);
        parts.push(function () { offB(); offW(); clearInterval(staleCheck); clearInterval(checkIn); });
      }).catch(function () {
        if (!gone) finish(t('watchFailed', 'This game could not be opened.'), t('watchFailedText', 'Check your connection and try again.'));
      });
    }

    function openGame(code) {
      FF.ui.clear(main);
      main.appendChild(FF.ui.el('p', { class: 'wl-note' }, t('openingGame', 'Opening the game…')));
      getJson('/api/live/' + code + '?open=1').then(function (res) {
        if (res.status === 404) {
          finish(t('notLive', 'This game isn’t live right now.'), t('notLiveText', 'Check the link, or pick another game.'));
          return;
        }
        if (res.status === 200 && res.body && res.body.full) {
          finish(t('gameFull', 'This game is full right now.'), t('gameFullText', 'Try again in a little while, or watch another game.'));
          return;
        }
        watch(code);
      }, function () {
        // No server answer (local copy without PHP): watch without the limit check.
        watch(code);
      });
    }

    if (where.view === 'tv') openGame(where.code);
    else showList(null);

    var onHide = function () { teardown(); };
    if (window.addEventListener) window.addEventListener('pagehide', onHide);

    return {
      route: where,
      destroy: function () {
        if (window.removeEventListener) window.removeEventListener('pagehide', onHide);
        teardown();
      }
    };
  }

  FF.WatchPage = { route: route, start: start };
})();
