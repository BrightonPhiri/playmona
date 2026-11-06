/* ============================================================
   PLAYMONA — wordflow/client.js
   A phone's side of a WordFlow match: follows the public view
   (rooms/<code>/wf) and sends words to the referee through
   rooms/<code>/wfInbox/<uid>/<id>. The phone never decides
   anything: whose turn it is, whether a word counts, whether a
   sentence makes sense and the score all come from the referee.

     var c = FF.WordFlowClient.create({ room: FF.Room.current(), onChange });
     c.view()  -> { wf, uid, seated, myTurn, feedback }
     c.send('dragon.') -> Promise<cmdId | null>
     c.stop()

   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* Not FF.util.uid: in a room that draws from the room's seeded random,
     so every phone would make the same ids. */
  function cmdId() {
    var bytes = [];
    var c = window.crypto;
    if (c && c.getRandomValues) bytes = Array.prototype.slice.call(c.getRandomValues(new Uint8Array(12)));
    else for (var i = 0; i < 12; i++) bytes.push(Math.floor(Math.random() * 256));
    return 'c' + bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }

  /* Firebase turns arrays into objects and drops empty ones: put them back. */
  function tidy(wf) {
    if (!wf) return null;
    wf.order = list(wf.order);
    wf.current = list(wf.current);
    wf.unfinished = list(wf.unfinished);
    wf.sentences = list(wf.sentences).map(function (s) { s.words = list(s.words); return s; });
    wf.seats = wf.seats || {};
    wf.feedback = wf.feedback || {};
    return wf;
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var uid = room.uid;
    var onChange = opts.onChange || function () {};
    var wf = null;
    var offs = [];
    var sent = {};          // turnId -> true, so a double tap sends once
    var stopped = false;

    offs.push(T.watch('wf', function (v) { wf = tidy(v || null); if (!stopped) onChange(); }));

    function stamp() { return T.serverTimestamp ? T.serverTimestamp() : T.serverNow(); }

    /* Resolves with the command's id (the referee's feedback names it), or null if not sent. */
    function send(word) {
      if (!wf || stopped || wf.turnUid !== uid) return Promise.resolve(null);
      var key = wf.turnId + ':' + word;
      if (sent[key]) return Promise.resolve(null);
      sent[key] = true;
      var id = cmdId();
      var cmd = { type: 'word', matchId: wf.matchId, turnId: wf.turnId, word: String(word).slice(0, FF.WordFlowRules.MAX_INPUT), t: stamp() };
      return T.set('wfInbox/' + uid + '/' + id, cmd).then(function () { return id; }, function (e) {
        delete sent[key];
        throw e;
      });
    }

    function view() {
      return {
        wf: wf,
        uid: uid,
        seated: !!(wf && wf.seats && wf.seats[uid]),
        myTurn: !!(wf && wf.phase === 'playing' && wf.turnUid === uid),
        feedback: wf && wf.feedback ? wf.feedback[uid] || null : null
      };
    }

    function stop() {
      stopped = true;
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      offs = [];
    }

    return { view: view, send: send, stop: stop, serverNow: function () { return T.serverNow(); } };
  }

  /* ---------- helpers the screens share ---------- */

  function seats(wf, players) {
    if (!wf || !wf.order) return [];
    return wf.order.map(function (u) {
      var p = (players && players[u]) || {};
      var s = (wf.seats && wf.seats[u]) || {};
      return { uid: u, name: p.name || FF.t('wfPlayer', 'Player'), avatar: p.avatar || null, color: p.color || null, points: s.points || 0, online: p.online !== false };
    });
  }

  var FEEDBACK = {
    empty: ['wfErrEmpty', 'Type one word first.'],
    spaces: ['wfErrSpaces', 'Just one word, no spaces.'],
    long: ['wfErrLong', 'That word is too long.'],
    punct: ['wfErrPunct', 'Only a full stop (to end the sentence) or a comma can go on the end.'],
    letters: ['wfErrLetters', 'Use letters, or a number.'],
    rude: ['wfErrRude', 'Please pick a different word.'],
    unknown: ['wfErrUnknown', 'We don’t know that word. Check the spelling, or start a name with a capital.'],
    tooLong: ['wfErrTooLong', 'This sentence is long enough: end it with a full stop.'],
    turn: ['wfErrTurn', 'It’s not your turn.'],
    stale: ['wfErrStale', 'Too late: the turn moved on.'],
    late: ['wfErrLate', 'Too late: your turn ran out.'],
    early: ['wfErrEarly', 'Wait for the game to start.'],
    time: ['wfErrTime', 'Time is up.']
  };

  function feedbackText(code) {
    var f = FEEDBACK[code] || FEEDBACK.stale;
    return FF.t(f[0], f[1]);
  }

  /* The built-in judge's reasons, in words. The AI writes its own. */
  var REASONS = {
    short: ['wfWhyShort', 'Too short to be a sentence.'],
    repeat: ['wfWhyRepeat', 'Too many repeated words.'],
    meaning: ['wfWhyMeaning', 'That sentence does not make sense.']
  };

  function reasonText(reason) {
    if (!reason) return FF.t('wfWhyMeaning', 'That sentence does not make sense.');
    var r = REASONS[reason];
    return r ? FF.t(r[0], r[1]) : String(reason);
  }

  /* ---------- the server (POST /api/wordflow/*) ---------- */

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }

  function idToken() {
    if (!window.firebase || !firebase.auth) return Promise.reject(new Error(t('wfSignIn', 'Please sign in to play online.')));
    var u = firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error(t('wfSignIn', 'Please sign in to play online.')));
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
        if (!res.ok) throw new Error(data.message || t('wfServerDown', 'The game server is not answering. Please try again.'));
        return data;
      });
    });
  }

  function dev() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  /* Dev rooms have no server: the host tab plays it (js/wordflow/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.WordFlowDev) return Promise.resolve(FF.WordFlowDev);
    var files = ['js/wordflow/referee.js', 'js/wordflow/dev.js'];
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
    }, Promise.resolve()).then(function () { return FF.WordFlowDev; });
  }

  FF.WordFlowApi = {
    start: function (room, pick) {
      if (dev()) return loadDev().then(function (d) { return d.start(room, pick); });
      return api('/wordflow/start', { roomCode: room.code, settings: pick.settings || {} });
    },
    findPlayers: function (code, difficulty) {
      if (dev()) return Promise.reject(new Error(t('wfNoCrewDev', 'PlayMona players need the server; dev rooms do not have one.')));
      return api('/wordflow/crew', { roomCode: code, difficulty: difficulty }).then(function (r) { return (r.added || []).length; });
    },
    nudge: function (code) {
      if (dev()) return Promise.resolve({ started: false });
      return api('/wordflow/nudge', { roomCode: code }).catch(function () { return { started: false }; });
    }
  };

  FF.WordFlowClient = {
    create: create,
    seats: seats,
    tidy: tidy,
    feedbackText: feedbackText,
    reasonText: reasonText
  };
})();
