/* ============================================================
   PLAYMONA — wordshift/api.js
   FF.WordShiftApi: the server calls that make a WordShift run count.
   begin(body) gets a ticket before the first move; finish(ticket,
   moves, invalid) sends the moves for the server to replay, time and
   score (api/lib/WordShift.php). The server writes the boards.

   Both resolve null when the run cannot be ranked (a guest, offline,
   the dev preview with no API): the game then scores it on the
   phone with the same rules and says it was not ranked.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function signedIn() {
    if (!window.firebase || !firebase.auth) return null;
    var u = firebase.auth().currentUser;
    return u && !u.isAnonymous ? u : null;
  }

  function post(path, body) {
    var u = signedIn();
    if (!u || typeof fetch !== 'function') return Promise.resolve(null);
    return u.getIdToken().then(function (tok) {
      return fetch('/api' + path, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        cache: 'no-store'
      });
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        return res.ok && data && typeof data === 'object' ? data : null;
      });
    }).catch(function () { return null; });
  }

  FF.WordShiftApi = {
    canRank: function () { return !!signedIn(); },
    /* { puzzleId, mode, seconds?, daily?: 'ws' | 'platform' } -> { ticket, puzzle, serverNow } | null */
    begin: function (body) { return post('/wordshift/begin', body); },
    /* -> { ok, finished, score, ms, shortest, moves, ranked, places } | null */
    finish: function (ticket, moves, invalid) {
      if (!ticket) return Promise.resolve(null);
      return post('/wordshift/finish', { ticket: ticket, moves: moves, invalid: invalid });
    }
  };
})();
