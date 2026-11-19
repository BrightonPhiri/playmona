/* PlayMona Celebrations: local development only (the devRooms flag).
   On this computer there is no crew runner, and the local API's database (FileRtdb) is not
   the browser's dev transport, so the organiser's tab does the runner's job: it puts the
   run on the dev transport and referees it with the same code the runner uses
   (FF.CelebrateReferees[template]). Results go to the local API, as the runner's would.
   Never used on the live site. Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var running = {};

  function randomInt(n) {
    var c = window.crypto;
    if (c && c.getRandomValues) {
      var max = Math.floor(4294967296 / n) * n;
      var buf = new Uint32Array(1);
      do { c.getRandomValues(buf); } while (buf[0] >= max);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /* start: what POST .../start returned ({ runId, startAt, run }).
     opts.scores(): -> Promise of the event's scores list after a game (the MC asks with its link). */
  function host(start, opts) {
    opts = opts || {};
    var run = start.run;
    var make = FF.CelebrateReferees && FF.CelebrateReferees[run.template];
    if (!make) return Promise.reject(new Error('No referee for ' + run.template));
    return FF.Transport.open('celebrations/' + run.cid, true).then(function (T) {
      var members = {};
      Object.keys(run.teams || {}).forEach(function (tid) {
        (run.teams[tid].members || []).forEach(function (m) { members[m.uid] = { name: m.name, team: tid }; });
      });
      if (running[run.cid]) running[run.cid].stop();
      return Promise.all([
        T.set('run', null), T.set('inbox', null), T.set('control', null), T.set('members', members),
        T.set('live/run', { runId: run.runId, gameId: run.gameId, template: run.template, name: run.name, startAt: run.startAt })
      ]).then(function () {
        var saved = null;
        var ref = make.create({
          run: run, room: T,
          store: { load: function () { return Promise.resolve(saved); }, save: function (s) { saved = s; return Promise.resolve(); } },
          randomInt: randomInt,
          // The word bank, when this page has it (Word by Word); without it every word is taken.
          isWord: FF.Words && FF.Words.isWord ? function (w) { return !FF.Words.ready() || FF.Words.isWord(w); } : null,
          isQuiet: FF.Words && FF.Words.isQuiet ? function (w) { return FF.Words.isQuiet(w); } : null,
          log: function (m) { if (window.console) console.log('[Celebrations dev referee] ' + m); },
          report: function (event, payload) {
            return FF.Api.call('POST', '/dev/celebration-report', payload).then(function () {
              return opts.scores ? opts.scores().then(function (list) { return { scores: list }; }) : FF.Api.call('GET', '/c/' + run.cid + '/play');
            }).then(function (r) {
              var scores = {};
              (r.scores || []).forEach(function (s) { scores[s.teamId] = { points: s.points, place: s.place, games: s.games }; });
              return Promise.all([T.set('live/scores', scores), T.set('live/run', null)]);
            });
          },
          onEnd: function () { delete running[run.cid]; }
        });
        running[run.cid] = ref;
        return ref.start();
      });
    });
  }

  FF.CelebrateDev = { host: host, running: function (cid) { return running[cid] || null; } };
})();
