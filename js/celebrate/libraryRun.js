/* PlayMona Celebrations: a library game's run on the game page (FF.CelebrateLibraryRun).
   The guest's phone at a celebration opens play#celebrate=… (FF.LibraryRules.link) from the
   event page's Play button. This starts that game on the run's seed with the standard
   settings (GameFlow's `celebration` override), and when it ends sends the score once to
   celebrations/<cid>/inbox/<uid> for the referee (js/celebrate/library/referee.js), then
   offers "Back to the party". Leaving early goes back to the party too.
     FF.CelebrateLibraryRun.boot()                -> true when the page was opened for a run
     FF.CelebrateLibraryRun.finish(cel, score)    -> a sending record for the results screen
     FF.CelebrateLibraryRun.status(record)        -> an element that follows the sending
     FF.CelebrateLibraryRun.back(record | cel), .leave(cel)
   Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var R = function () { return FF.LibraryRules; };
  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }
  var startedAt = 0;
  var TRIES = 3;

  function cmdId() {
    var bytes = [];
    var c = window.crypto;
    if (c && c.getRandomValues) bytes = Array.prototype.slice.call(c.getRandomValues(new Uint8Array(12)));
    else for (var i = 0; i < 12; i++) bytes.push(Math.floor(Math.random() * 256));
    return 'c' + bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function boot() {
    if (!R()) return false;
    var cel = R().decode(window.location.hash);
    if (!cel) return false;
    // The link is used once: a reload or Back must not start the run again.
    try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* fine */ }
    if (!FF.Games || !FF.Games.get(cel.game)) {
      if (FF.UI && FF.UI.toast) FF.UI.toast(t('celLibNotHere', 'This game is not on this page yet. Reload to update.'), { type: 'error' });
      setTimeout(function () { window.location.assign(cel.back); }, 2500);
      return true;
    }
    startedAt = Date.now();
    FF.GameFlow.launch(cel.game, { celebration: cel, skipIntro: true });
    return true;
  }

  /* Sends the score; resolves 'sent', or 'late' when the game ended first. */
  function send(cel, score) {
    return FF.Transport.open('celebrations/' + cel.cid).then(function (T) {
      function done(v) { if (T.close) T.close(); return v; }
      // On the live site the database knows this phone by its signed-in uid; the dev bus by the event's.
      var uid = devMode() ? cel.uid : ((T.uid && T.uid()) || cel.uid);
      return T.get('run').then(function (run) {
        if (!run || run.runId !== cel.runId || run.phase !== 'playing') return done('late');
        var cmd = {
          type: 'score', runId: cel.runId, n: 0, t: T.serverTimestamp ? T.serverTimestamp() : T.serverNow(),
          score: Math.max(0, Math.min(R().MAX_SCORE, Math.round(Number(score) || 0))),
          ms: Math.max(0, Math.min(86400000, Date.now() - (startedAt || Date.now())))
        };
        return T.set('inbox/' + uid + '/' + cmdId(), cmd).then(function () { return done('sent'); });
      }, function (e) { done(); throw e; });
    });
  }

  function finish(cel, score) {
    var rec = { cel: cel, score: score, state: 'sending', listeners: [] };
    function set(s) { rec.state = s; rec.listeners.forEach(function (fn) { fn(); }); }
    function attempt(n) {
      send(cel, score).then(set, function () {
        if (n + 1 >= TRIES) { set('failed'); return; }
        setTimeout(function () { attempt(n + 1); }, 2000);
      });
    }
    rec.retry = function () { set('sending'); attempt(0); };
    attempt(0);
    return rec;
  }

  function status(rec) {
    var box = FF.ui.el('div', { class: 'cel-libsend', role: 'status' });
    function draw() {
      FF.ui.clear(box);
      box.className = 'cel-libsend is-' + rec.state;
      var text = rec.state === 'sent' ? t('celLibSent', 'Your score of {n} is in. Your group keeps its best score.', { n: rec.score })
        : rec.state === 'late' ? t('celLibLate', 'Time was up before your score arrived, so this one does not count.')
        : rec.state === 'failed' ? t('celLibFailed', 'Your score did not send. Check your connection and try again.')
        : t('celLibSending', 'Sending your score…');
      box.appendChild(FF.ui.el('p', {}, text));
      if (rec.state === 'failed') box.appendChild(FF.UI.button(t('tryAgain', 'Try again'), { class: 'btn-sm', icon: 'restart', onClick: rec.retry }));
    }
    rec.listeners.push(draw);
    draw();
    return box;
  }

  function back(rec) {
    var cel = rec && rec.cel ? rec.cel : rec;
    window.location.assign(cel && cel.back ? cel.back : '/');
  }

  FF.CelebrateLibraryRun = { boot: boot, finish: finish, status: status, back: back, leave: back, send: send };
})();
