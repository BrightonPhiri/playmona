/* PlayMona Celebrations: a guest phone's live connection (FF.CelebrateLive).
   The guest page holds a Firebase connection only while the guest is in the lobby or a
   game (the free plan allows 100 at once). It watches two server-written things:
     live/run      the game being played now: { runId, gameId, template, name, startAt } or nothing
     live/scores   the event leaderboard: { teamId: { points, place, games } }
   and hands the transport to the game screen, which reads run/ and writes inbox/<uid>/.

     FF.CelebrateLive.start({ cid, uid, onRun(pointer), onScores(scores) })
       -> Promise of { transport, uid, stop() }
   Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  function start(opts) {
    return FF.Transport.open('celebrations/' + opts.cid).then(function (T) {
      var offs = [];
      var stopped = false;
      // Commands go to inbox/<uid>: the database rule wants the signed-in uid, which is
      // the uid the API knows the guest by (both come from the same sign-in).
      var uid = devMode() ? opts.uid : ((T.uid && T.uid()) || opts.uid);
      offs.push(T.watch('live/run', function (p) { if (!stopped && opts.onRun) opts.onRun(p && p.runId ? p : null); }));
      if (opts.onScores) offs.push(T.watch('live/scores', function (s) { if (!stopped) opts.onScores(s || {}); }));
      return {
        transport: T,
        uid: uid,
        stop: function () {
          if (stopped) return;
          stopped = true;
          offs.forEach(function (off) { if (typeof off === 'function') off(); });
          if (T.close) T.close();
        }
      };
    });
  }

  FF.CelebrateLive = { start: start };
})();
