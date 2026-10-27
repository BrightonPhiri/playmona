/* ============================================================
   PLAYMONA — net/liveMatch.js
   Live match: play a live game with people who are online now.
   The phone opens a room it hosts, asks the server for a match
   (POST /api/match/queue) and checks its ticket every two seconds.
   The server pairs it with someone waiting for the same game, or,
   when nobody comes and the admins allow it, seats PlayMona
   players in the room instead (api/lib/Matchmaker.php).

     FF.LiveMatch.online()                  -> Promise<{ players }>
     FF.LiveMatch.find({ gameId, difficulty, roomCode })  -> Promise<ticket>
     FF.LiveMatch.ticket(id) / FF.LiveMatch.cancel(id)

   A ticket is { ticket, status: waiting | matched | cancelled | expired,
   waitedMs, roomCode?, gameId?, host? } (host: the match is in this
   phone's own room). Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var POLL_MS = 2000;    // the server forgets a ticket nobody checked for 15 s

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }

  function idToken() {
    if (!window.firebase || !firebase.auth || !firebase.auth().currentUser) {
      return Promise.reject(new Error(t('lmSignIn', 'Please sign in to play a live match.')));
    }
    return firebase.auth().currentUser.getIdToken();
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
          var e = new Error(data.message || t('lmServerDown', 'Live match is not answering right now. Please try again.'));
          e.code = data.error || 'http-' + res.status;
          throw e;
        }
        return data;
      });
    });
  }

  function available() { return !(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  FF.LiveMatch = {
    POLL_MS: POLL_MS,
    available: available,
    online: function () { return api('GET', '/match/online'); },
    find: function (opts) {
      return api('POST', '/match/queue', { gameId: opts.gameId || 'any', difficulty: opts.difficulty || 'normal', roomCode: opts.roomCode });
    },
    ticket: function (id) { return api('GET', '/match/ticket/' + encodeURIComponent(id)); },
    cancel: function (id) { return api('POST', '/match/ticket/' + encodeURIComponent(id) + '/cancel', {}); }
  };
})();
