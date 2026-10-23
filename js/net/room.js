/* ============================================================
   PLAYMONA — net/room.js
   Room lifecycle: create, join, watch, leave. Talks to a
   transport; knows nothing about games or the DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no O, 0, I, 1
  var CODE_LENGTH = 6;
  var MAX_PLAYERS = 12;
  var TTL_MS = 6 * 60 * 60 * 1000;                     // 6 hours
  var APP_VERSION = '2.0.0';
  // How long everyone gets to look up from their phone before round one.
  var COUNTDOWN_MS = 10000;
  var HEARTBEAT_MS = 10000;
  var PRESENCE_STALE_MS = 20000;

  var state = null;
  var heartbeat = null;
  var handlers = { players: [], meta: [], rounds: [], error: [] };
  var unsubs = [];

  function emit(event, payload) {
    (handlers[event] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { if (window.console) console.error('[FF.Room]', e); }
    });
  }

  function newCode() {
    var out = '';
    for (var i = 0; i < CODE_LENGTH; i++) {
      out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return out;
  }

  /* Identity storage. Normally localStorage, so a device keeps its name
     and score across a browser restart. In dev-rooms mode it is per-tab
     sessionStorage instead, so two tabs of one browser act as two
     genuinely separate devices rather than sharing one identity. */
  function devIdentity(value) {
    try {
      if (value === undefined) {
        var raw = window.sessionStorage.getItem('ff-dev-identity');
        return raw ? JSON.parse(raw) : null;
      }
      window.sessionStorage.setItem('ff-dev-identity', JSON.stringify(value));
      return value;
    } catch (e) { return null; }
  }

  function usingDevIdentity() {
    return !!(FF.Net && FF.Net.devMode && FF.Net.devMode());
  }

  function readIdentity() {
    return usingDevIdentity() ? devIdentity() : FF.Storage.get('roomIdentity', null);
  }

  function writeIdentity(value) {
    if (usingDevIdentity()) devIdentity(value);
    else FF.Storage.set('roomIdentity', value);
    return value;
  }

  /* A stable per-device identity, reused across rooms and rejoins. */
  function identity() {
    var saved = readIdentity();
    // Signed-in players appear in rooms with their profile name and character.
    var profile = FF.Auth && FF.Auth.profile ? FF.Auth.profile() : null;
    if (saved && saved.uid) {
      if (profile && !usingDevIdentity()) { saved.name = profile.displayName; saved.avatar = profile.avatar; }
      return saved;
    }
    var players = FF.Players.get();
    var first = players && players.length ? players[0] : null;
    var fresh = {
      uid: 'd-' + FF.util.uid() + FF.util.uid(),
      name: profile ? profile.displayName : (first ? first.name : 'Player'),
      avatar: profile ? profile.avatar : (first ? first.avatar : (FF.Avatars ? FF.Avatars.random() : '')),
      color: first ? first.color : FF.Players.COLORS[0]
    };
    writeIdentity(fresh);
    return fresh;
  }

  function saveIdentity(patch) {
    var id = identity();
    Object.keys(patch || {}).forEach(function (k) {
      if (patch[k] != null && patch[k] !== '') id[k] = patch[k];
    });
    writeIdentity(id);
    return id;
  }

  function makeTransport(code, useDev) {
    var root = FF.Transport.roomPath(code);
    if (useDev || (FF.Net && FF.Net.devMode && FF.Net.devMode())) {
      return Promise.resolve(FF.Transport.dev({ root: root, namespace: 'familyfun' }));
    }
    if (!FF.Net || !FF.Net.configured()) {
      return Promise.reject(new Error('Online play is not configured on this copy of the app.'));
    }
    return FF.Net.firebase({ root: root });
  }

  function playersViewSignature(players, now) {
    return Object.keys(players || {}).sort().map(function (uid) {
      var p = players[uid] || {};
      return [
        uid, p.name || '', p.avatar || '', p.color || '',
        p.teamId || '', p.joinedAt || 0, playerIsOnline(p, now)
      ].join('|');
    }).join('~');
  }

  function playerIsOnline(player, now) {
    if (!player || player.online === false) return false;
    return player.lastSeen == null || (now - player.lastSeen) <= PRESENCE_STALE_MS;
  }

  function watchAll(transport) {
    unsubs.push(transport.watch('players', function (v) {
      if (!state) return;
      var now = transport.serverNow();
      var before = state._playersViewSignature || playersViewSignature(state.players, now);
      state.players = v || {};
      state._playersViewSignature = playersViewSignature(state.players, now);
      if (state._playersViewSignature !== before) emit('players', state.players);
      FF.Room.claimHost();
    }));
    unsubs.push(transport.watch('meta', function (v) {
      if (!state) return;
      state.meta = v || {};
      state.isHost = state.meta.hostUid === state.uid;
      emit('meta', state.meta);
    }));
    unsubs.push(transport.watch('rounds', function (v) {
      if (!state) return;
      state.rounds = v || {};
      emit('rounds', state.rounds);
    }));
    if (transport.watchConnection) {
      unsubs.push(transport.watchConnection(function (online) {
        if (online && state && state.transport === transport) {
          restorePresence(transport, state.uid);
        }
        if (FF.RoomUI && FF.RoomUI.banner) {
          FF.RoomUI.banner(online ? null : '📡 Reconnecting…');
        }
      }));
    }
    startHeartbeat();
  }

  function registerPresence(transport, uid, profile) {
    var now = transport.serverNow();
    return transport.set('players/' + uid, {
      name: profile.name,
      avatar: profile.avatar,
      color: profile.color,
      teamId: profile.teamId || null,
      joinedAt: now,
      lastSeen: now,
      online: true
    }).then(function () {
      return transport.onDisconnectSet('players/' + uid + '/online', false);
    });
  }

  function restorePresence(transport, uid) {
    return transport.update('players/' + uid, {
      online: true,
      lastSeen: transport.serverNow()
    }).then(function () {
      return transport.onDisconnectSet('players/' + uid + '/online', false);
    }).catch(function () {});
  }

  function stopHeartbeat() {
    if (heartbeat != null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeat = setInterval(function () {
      if (!state) return;
      state.transport.update('players/' + state.uid, {
        online: true,
        lastSeen: state.transport.serverNow()
      }).catch(function () {});
    }, HEARTBEAT_MS);
  }

  FF.Room = {
    CODE_ALPHABET: ALPHABET,
    CODE_LENGTH: CODE_LENGTH,
    MAX_PLAYERS: MAX_PLAYERS,
    TTL_MS: TTL_MS,
    APP_VERSION: APP_VERSION,
    COUNTDOWN_MS: COUNTDOWN_MS,
    newCode: newCode,
    identity: identity,
    saveIdentity: saveIdentity,

    current: function () { return state; },

    on: function (event, cb) {
      (handlers[event] = handlers[event] || []).push(cb);
      if (state && Object.prototype.hasOwnProperty.call(state, event)) {
        Promise.resolve().then(function () {
          if ((handlers[event] || []).indexOf(cb) !== -1 && state) cb(state[event]);
        });
      }
      return function () {
        var list = handlers[event] || [];
        var i = list.indexOf(cb);
        if (i !== -1) list.splice(i, 1);
      };
    },

    /* Drop every listener registered by a screen that is going away. */
    offAll: function () {
      Object.keys(handlers).forEach(function (k) { handlers[k] = []; });
    },

    shareUrl: function (code) {
      var base = window.location.href.split('#')[0];
      return base + '#room=' + code;
    },

    /* Read a room code from the URL hash, e.g. #room=ABC123 */
    codeFromUrl: function () {
      var m = /(?:^|[#&])room=([A-Za-z0-9]{6})/.exec(window.location.hash || '');
      return m ? m[1].toUpperCase() : null;
    },

    create: function (opts) {
      opts = opts || {};
      var profile = identity();
      var code = newCode();

      return makeTransport(code, opts.dev).then(function (transport) {
        return transport.connect().then(function (res) {
          var uid = res.uid;
          var now = transport.serverNow();
          var meta = {
            seed: FF.Random.newSeed(),
            gameId: null,
            status: 'lobby',
            mode: opts.mode === 'teams' ? 'teams' : 'players',
            appVersion: APP_VERSION,
            hostUid: uid,
            createdAt: now,
            expiresAt: now + TTL_MS
          };

          if (FF.Track) FF.Track.count('rooms');
          return transport.set('meta', meta)
            .then(function () { return registerPresence(transport, uid, profile); })
            .then(function () {
              state = {
                code: code, uid: uid, isHost: true,
                meta: meta, players: {}, rounds: {}, transport: transport
              };
              watchAll(transport);
              return state;
            });
        });
      });
    },

    join: function (code, profile, opts) {
      opts = opts || {};
      code = String(code || '').toUpperCase().trim();
      if (code.length !== CODE_LENGTH) {
        return Promise.reject(new Error('A room code is ' + CODE_LENGTH + ' characters.'));
      }

      var merged = saveIdentity(profile || {});

      return makeTransport(code, opts.dev).then(function (transport) {
        return transport.connect().then(function (res) {
          var uid = res.uid;
          return transport.get('meta').then(function (meta) {
            if (!meta) throw new Error('No room with the code ' + code + '. Check it and try again.');
            if (meta.expiresAt && transport.serverNow() > meta.expiresAt) {
              throw new Error('That room has expired. Ask the host to start a new one.');
            }
            if (meta.appVersion !== APP_VERSION) {
              throw new Error('VERSION_MISMATCH');
            }
            return transport.get('players').then(function (players) {
              var count = players ? Object.keys(players).length : 0;
              var alreadyIn = !!(players && players[uid]);
              if (count >= MAX_PLAYERS && !alreadyIn) {
                throw new Error('That room is full (' + MAX_PLAYERS + ' devices).');
              }
              return registerPresence(transport, uid, merged).then(function () {
                state = {
                  code: code, uid: uid, isHost: meta.hostUid === uid,
                  meta: meta, players: players || {}, rounds: {}, transport: transport
                };
                watchAll(transport);
                return state;
              });
            });
          });
        });
      });
    },

    setMeta: function (patch) {
      if (!state) return Promise.reject(new Error('Not in a room.'));
      return state.transport.update('meta', patch || {});
    },

    /* Players in the shape FF.RaceRules expects. */
    racePlayers: function () {
      if (!state) return [];
      var players = state.players || {};
      var now = state.transport.serverNow();
      return Object.keys(players).map(function (uid) {
        var p = players[uid] || {};
        return {
          uid: uid,
          online: playerIsOnline(p, now),
          name: p.name || 'Player',
          avatar: p.avatar || null,
          color: p.color || '#8b5cf6',
          teamId: p.teamId || null,
          joinedAt: p.joinedAt || 0,
          lastSeen: p.lastSeen == null ? null : p.lastSeen
        };
      });
    },

    /* Scorer entities in the shape FF.Scoring.init expects. */
    scorers: function () {
      if (!state) return [];
      var people = this.racePlayers();
      if (state.meta && state.meta.mode === 'teams') {
        var teams = {};
        var order = [];
        people.forEach(function (p) {
          var id = p.teamId || 'team1';
          if (!teams[id]) {
            teams[id] = { id: id, name: id, avatar: '👥', color: '#8b5cf6', players: [] };
            order.push(id);
          }
          teams[id].players.push(p.uid);
        });
        return order.map(function (k) { return teams[k]; });
      }
      return people.map(function (p) {
        return { id: p.uid, name: p.name, avatar: p.avatar, color: p.color };
      });
    },

    /* If the host goes offline, the longest-connected device takes over so
       the room keeps working. Every device runs this; the transaction
       guarantees only one of them wins. */
    claimHost: function () {
      if (!state || !state.meta) return Promise.resolve();
      var hostUid = state.meta.hostUid;
      var host = (state.players || {})[hostUid];
      var now = state.transport.serverNow();
      if (playerIsOnline(host, now)) return Promise.resolve();

      var online = this.racePlayers().filter(function (p) { return p.online !== false; });
      if (!online.length) return Promise.resolve();

      online.sort(function (a, b) { return (a.joinedAt || 0) - (b.joinedAt || 0); });
      if (online[0].uid !== state.uid) return Promise.resolve();

      var players = state.players || {};
      var myUid = state.uid;
      return state.transport.transaction('meta/hostUid', function (current) {
        var cur = players[current];
        // Only take over if the recorded host really is gone.
        return playerIsOnline(cur, now) ? undefined : myUid;
      }).then(function (res) {
        if (res.committed && state) state.isHost = true;
      });
    },

    /* Start a game in this room. Clearing the round history and taking a
       fresh seed is essential: leftover rounds from the previous game
       would settle the new one instantly, and a reused seed would deal
       the same questions again. */
    startGame: function (gameId, settings) {
      if (!state) return Promise.reject(new Error('Not in a room.'));
      if (!state.isHost) return Promise.reject(new Error('Only the room host can start a game.'));
      var transport = state.transport;
      var payload = {
        seed: FF.Random.newSeed(),
        gameId: gameId,
        status: 'playing',
        startAt: transport.serverNow() + COUNTDOWN_MS,
        endedAt: null,
        results: null
      };
      if (settings) payload.settings = settings;
      return transport.set('rounds', null).then(function () {
        return transport.update('meta', payload);
      });
    },

    endGame: function (results) {
      if (!state) return Promise.reject(new Error('Not in a room.'));
      if (!state.isHost) return Promise.resolve();
      var patch = {
        status: 'ended',
        endedAt: state.transport.serverNow()
      };
      if (results) patch.results = results;
      return state.transport.update('meta', patch);
    },

    playAgain: function () {
      if (!state) return Promise.reject(new Error('Not in a room.'));
      if (!state.isHost) return Promise.reject(new Error('Only the room host can restart a game.'));
      var transport = state.transport;
      return transport.set('rounds', null).then(function () {
        return transport.update('meta', {
          seed: FF.Random.newSeed(),
          status: 'lobby',
          gameId: null,
          startAt: null,
          endedAt: null,
          results: null
        });
      });
    },

    leave: function () {
      if (!state) return;
      var s = state;
      stopHeartbeat();
      unsubs.slice().forEach(function (off) { try { off(); } catch (e) {} });
      unsubs = [];
      this.offAll();
      try { s.transport.set('players/' + s.uid + '/online', false); } catch (e) {}
      try { s.transport.close(); } catch (e) {}
      state = null;
      FF.Random.unseed();
    }
  };
})();
