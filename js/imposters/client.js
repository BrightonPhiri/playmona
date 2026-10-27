/* ============================================================
   PLAYMONA — imposters/client.js
   A phone's side of an Imposters match: follows the public view
   (rooms/<code>/imp) and this player's own secret
   (imposterSecrets/<code>/<uid>), and sends commands to the
   referee through rooms/<code>/impInbox/<uid>/<id>.

     var c = FF.ImpostersClient.create({ room: FF.Room.current(), onChange });
     c.view()  -> { imp, secret, me, ... } (null fields while loading)
     c.send('clue', { clue: 'wet' })
     c.stop()

   The secret is held in memory only: never in storage, toasts,
   labels or the watch broadcast. Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj || {}, k); }

  /* Not FF.util.uid: in a room that draws from the room's seeded random,
     so every phone would make the same ids. */
  function cmdId() {
    var bytes = [];
    var c = window.crypto;
    if (c && c.getRandomValues) bytes = Array.prototype.slice.call(c.getRandomValues(new Uint8Array(12)));
    else for (var i = 0; i < 12; i++) bytes.push(Math.floor(Math.random() * 256));
    return 'c' + bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var imp = null;
    var secret = null;
    var secretT = null;
    var offs = [];
    var sent = {};          // type + phaseId -> true, so a double tap sends once
    var stopped = false;

    function changed() { if (!stopped) onChange(); }

    offs.push(T.watch('imp', function (v) { imp = v || null; changed(); }));

    // Rooted at the room's secrets but only ever reading this player's own key
    // (Firebase's rules refuse the rest; the dev transport keeps one document per root).
    var opener = opts.openSecret || function () {
      return FF.Transport.open('imposterSecrets/' + room.code);
    };
    Promise.resolve(opener()).then(function (t) {
      if (stopped) { if (t && t.close) t.close(); return; }
      secretT = t;
      offs.push(t.watch(uid, function (v) { secret = v || null; changed(); }));
    }).catch(function (e) {
      if (window.console) console.error('[Imposters] secret', e);
    });

    /* This match's secret only: a leftover from the room's last match is ignored. */
    function mySecret() {
      return secret && imp && secret.matchId === imp.matchId ? secret : null;
    }

    function stamp() {
      return T.serverTimestamp ? T.serverTimestamp() : T.serverNow();
    }

    /* Resolves with the command's id (the referee's feedback names it), or null if not sent. */
    function send(type, extra) {
      if (!imp || stopped) return Promise.resolve(null);
      var key = type + ':' + imp.phaseId + (type === 'clue' ? ':' + (extra && extra.clue) : '');
      if (sent[key]) return Promise.resolve(null);
      sent[key] = true;
      var cmd = { type: type, matchId: imp.matchId, phaseId: imp.phaseId, t: stamp() };
      Object.keys(extra || {}).forEach(function (k) { cmd[k] = extra[k]; });
      var id = cmdId();
      return T.set('impInbox/' + uid + '/' + id, cmd).then(function () { return id; }, function (e) {
        delete sent[key];
        throw e;
      });
    }

    function view() {
      var seat = imp && imp.seats ? imp.seats[uid] : null;
      return {
        imp: imp,
        secret: mySecret(),
        uid: uid,
        seated: !!seat,
        alive: !!(seat && seat.alive),
        me: seat || null,
        feedback: mySecret() && mySecret().feedback ? mySecret().feedback : null
      };
    }

    function stop() {
      stopped = true;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
      if (secretT && secretT.close) { try { secretT.close(); } catch (e) { /* gone */ } }
      secret = null;
    }

    return { view: view, send: send, stop: stop, serverNow: function () { return T.serverNow(); } };
  }

  /* ---------- helpers the screens share ---------- */

  /* Seats in a fixed order, with the room's names and avatars. */
  function seats(imp, players) {
    if (!imp || !imp.order) return [];
    return imp.order.map(function (uid) {
      var p = (players && players[uid]) || {};
      var s = (imp.seats && imp.seats[uid]) || {};
      return {
        uid: uid, name: p.name || FF.t('impPlayer', 'Player'), avatar: p.avatar || null, color: p.color || null,
        alive: !!s.alive, ready: !!s.ready, submitted: !!s.submitted, voted: !!s.voted, wantsVote: !!s.wantsVote,
        online: p.online !== false
      };
    });
  }

  function aliveCount(imp) {
    return (imp && imp.order ? imp.order : []).filter(function (u) { return imp.seats[u] && imp.seats[u].alive; }).length;
  }

  /* The rounds on the board, oldest first: [{ round, values: { uid: v } }]. */
  function boardRounds(imp) {
    var b = (imp && imp.board) || {};
    return Object.keys(b).map(function (k) { return { round: Number(k.slice(1)), values: b[k] || {} }; })
      .sort(function (a, c) { return a.round - c.round; });
  }

  var FEEDBACK = {
    empty: ['impErrEmpty', 'Type one word first.'],
    spaces: ['impErrSpaces', 'Just one word, no spaces.'],
    long: ['impErrLong', 'That word is too long.'],
    letters: ['impErrLetters', 'Use letters only.'],
    secret: ['impErrSecret', 'Too close to your own word. Try another.'],
    repeat: ['impErrRepeat', 'You already used that clue.'],
    rude: ['impErrRude', 'Please pick a different word.'],
    done: ['impErrDone', 'You already sent this round.'],
    voted: ['impErrVoted', 'You have already voted.'],
    self: ['impErrSelf', 'You cannot vote for yourself.'],
    target: ['impErrTarget', 'That player cannot be voted for now.'],
    out: ['impErrOut', 'You are out of this game. You can still watch.'],
    stale: ['impErrStale', 'Too late: the game moved on.'],
    early: ['impErrEarly', 'Wait for the clock to start.'],
    phase: ['impErrStale', 'Too late: the game moved on.'],
    bad: ['impErrStale', 'Too late: the game moved on.']
  };

  function feedbackText(code) {
    var f = FEEDBACK[code] || FEEDBACK.stale;
    return FF.t(f[0], f[1]);
  }

  /* ---------- the server (POST /api/imposters/*) ---------- */

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }

  function idToken() {
    if (!window.firebase || !firebase.auth) return Promise.reject(new Error(t('impSignIn', 'Please sign in to play online.')));
    var u = firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error(t('impSignIn', 'Please sign in to play online.')));
    return u.getIdToken();
  }

  function api(path, body) {
    return idToken().then(function (tok) {
      return fetch('/api' + path, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        cache: 'no-store'
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.message || t('impServerDown', 'The game server is not answering. Please try again.'));
        return data;
      });
    });
  }

  function dev() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  /* Dev rooms have no server: the host tab plays it (js/imposters/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.ImpostersDev) return Promise.resolve(FF.ImpostersDev);
    var files = ['js/imposters/modes/word.js', 'js/imposters/modes/number.js', 'js/imposters/referee.js', 'tools/dev/imposterPairs.js', 'js/imposters/dev.js'];
    return files.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.ImpostersDev; });
  }

  FF.ImpostersApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/imposters/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    findPlayers: function (code, difficulty) {
      if (dev()) return Promise.reject(new Error(t('impNoCrewDev', 'PlayMona players need the server; dev rooms do not have one.')));
      return api('/imposters/crew', { roomCode: code, difficulty: difficulty }).then(function (r) { return (r.added || []).length; });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/imposters/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.ImpostersClient = {
    create: create,
    seats: seats,
    aliveCount: aliveCount,
    boardRounds: boardRounds,
    feedbackText: feedbackText,
    has: has
  };
})();
