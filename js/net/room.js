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
  // A room lasts 30 days after it was last used, so a saved room keeps
  // working week after week. Every game the host starts renews it.
  var TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var NAME_MAX = 30;
  var APP_VERSION = '2.0.0';
  // How long everyone gets to look up from their phone before round one.
  var COUNTDOWN_MS = 10000;
  var HEARTBEAT_MS = 10000;
  var PRESENCE_STALE_MS = 20000;

  var state = null;
  var heartbeat = null;
  var offVisibility = null;
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
    return FF.Transport.open(FF.Transport.roomPath(code), useDev);
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
      watchVisibility();
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

  // "Show my photo to people watching" is off: viewers see the character instead.
  function hidesPhoto() { return !!(FF.Storage && FF.Storage.get('hidePhotoPublic', false)); }

  function registerPresence(transport, uid, profile) {
    var now = transport.serverNow();
    var record = {
      name: profile.name,
      avatar: profile.avatar,
      color: profile.color,
      teamId: profile.teamId || null,
      joinedAt: now,
      lastSeen: now,
      online: true,
      away: isHidden()
    };
    if (hidesPhoto()) record.hidePhoto = true;
    return transport.set('players/' + uid, record).then(function () {
      return transport.onDisconnectSet('players/' + uid + '/online', false);
    });
  }

  function isHidden() { return !!(typeof document !== 'undefined' && document.hidden); }

  /* A player who switches to another app is marked away at once, so a round
     never waits for someone who is not looking at the game. */
  function watchVisibility() {
    if (offVisibility) offVisibility();
    if (typeof document === 'undefined' || !document.addEventListener) return;
    var onChange = function () {
      if (!state) return;
      var patch = { away: isHidden() };
      if (!patch.away) { patch.online = true; patch.lastSeen = state.transport.serverNow(); }
      state.transport.update('players/' + state.uid, patch).catch(function () {});
    };
    document.addEventListener('visibilitychange', onChange);
    offVisibility = function () { document.removeEventListener('visibilitychange', onChange); offVisibility = null; };
  }

  /* Opening a room nobody else is in: take it over as host and clear any game
     left from last time, so a saved room always opens on its lobby. The owner
     who made the room also gets the host role back when they return. */
  function settleIn(transport, uid, meta, players) {
    var now = transport.serverNow();
    var othersHere = Object.keys(players || {}).some(function (u) {
      return u !== uid && playerIsOnline(players[u], now);
    });
    var patch = null;
    if (!othersHere) {
      patch = { hostUid: uid, expiresAt: now + TTL_MS };
      if ((meta.status || 'lobby') !== 'lobby') {
        patch.status = 'lobby'; patch.gameId = null; patch.startAt = null; patch.endedAt = null; patch.results = null;
      }
    } else if (meta.ownerUid === uid && meta.hostUid !== uid && (meta.status || 'lobby') === 'lobby') {
      patch = { hostUid: uid };
    }
    if (!patch) return Promise.resolve(meta);
    return transport.update('meta', patch).then(function () {
      var next = Object.assign({}, meta, patch);
      if (!patch.status) return next;
      return transport.set('rounds', null).catch(function () {}).then(function () { return next; });
    }).catch(function () { return meta; });
  }

  /* ---------- Saved rooms (kept on this device, and on the account) ---------- */
  function savedList() {
    var list = FF.Storage.get('savedRooms', []);
    return Array.isArray(list) ? list.filter(function (r) { return r && r.code; }) : [];
  }
  function writeSaved(list) { FF.Storage.set('savedRooms', list); }

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
    NAME_MAX: NAME_MAX,
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

    /* A room code from anything a QR code or a paste might hold: a share
       link, a bare code, or a code with spaces. */
    codeFromText: function (text) {
      text = String(text || '').trim();
      var m = /[#&?]room=([A-Za-z0-9]{6})\b/.exec(text);
      if (m) return m[1].toUpperCase();
      var bare = text.replace(/[\s-]/g, '').toUpperCase();
      return /^[A-Z0-9]{6}$/.test(bare) ? bare : null;
    },

    /* Take the room code out of the address bar (after leaving), so a
       reload does not join the room again. */
    clearUrlCode: function () {
      if (!this.codeFromUrl() || !window.history || !history.replaceState) return;
      try { history.replaceState(history.state, '', window.location.pathname + window.location.search); } catch (e) {}
    },

    /* Players to show in the lobby: everyone here now. Old visitors to a
       saved room stay in its records but are not listed. */
    presentPlayers: function () {
      return this.racePlayers().filter(function (p) { return p.online || (state && p.uid === state.uid); });
    },

    /* The room's name, or a friendly default. */
    displayName: function (meta, players) {
      meta = meta || (state && state.meta) || {};
      if (meta.name) return meta.name;
      var host = (players || (state && state.players) || {})[meta.ownerUid || meta.hostUid];
      return host && host.name ? FF.t('roomOf', '{name}\u2019s room', { name: host.name }) : FF.t('yourRoom', 'Your room');
    },

    rename: function (name) {
      if (!state) return Promise.reject(new Error('Not in a room.'));
      if (!state.isHost) return Promise.reject(new Error('Only the room host can rename the room.'));
      name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
      var code = state.code;
      return state.transport.update('meta', { name: name || null }).then(function () {
        FF.Room.saved.touch(code, { name: name });
      });
    },

    /* Rooms this player saved to come back to, newest first. */
    saved: {
      list: function () {
        return savedList().sort(function (a, b) { return (b.lastUsed || 0) - (a.lastUsed || 0); });
      },
      has: function (code) {
        return savedList().some(function (r) { return r.code === code; });
      },
      add: function (code, info) {
        var list = savedList().filter(function (r) { return r.code !== code; });
        info = info || {};
        list.push({ code: code, name: info.name || '', mode: info.mode || 'players', lastUsed: Date.now() });
        writeSaved(list.slice(-20));
      },
      remove: function (code) {
        writeSaved(savedList().filter(function (r) { return r.code !== code; }));
      },
      // Keep a saved room's name and last-used time up to date.
      touch: function (code, info) {
        var list = savedList();
        var hit = list.filter(function (r) { return r.code === code; })[0];
        if (!hit) return;
        if (info && info.name != null) hit.name = info.name;
        if (info && info.mode) hit.mode = info.mode;
        hit.lastUsed = Date.now();
        writeSaved(list);
      }
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
            ownerUid: uid,
            createdAt: now,
            expiresAt: now + TTL_MS
          };
          if (opts.name) meta.name = String(opts.name).trim().slice(0, NAME_MAX);

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
              // Only people here now count: a saved room remembers past visitors.
              var now = transport.serverNow();
              var count = Object.keys(players || {}).filter(function (u) {
                return u !== uid && playerIsOnline(players[u], now);
              }).length;
              if (count >= MAX_PLAYERS) {
                throw new Error('That room is full (' + MAX_PLAYERS + ' devices).');
              }
              return registerPresence(transport, uid, merged).then(function () {
                return settleIn(transport, uid, meta, players);
              }).then(function (settled) {
                state = {
                  code: code, uid: uid, isHost: settled.hostUid === uid,
                  meta: settled, players: players || {}, rounds: {}, transport: transport
                };
                watchAll(transport);
                FF.Room.saved.touch(code, { name: settled.name || '' });
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
          lastSeen: p.lastSeen == null ? null : p.lastSeen,
          away: !!p.away,
          leftGame: p.leftGame == null ? null : p.leftGame
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
        results: null,
        expiresAt: transport.serverNow() + TTL_MS
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

    /* The photo setting changed: tell the room straight away, so the next
       broadcast to viewers already uses the character. */
    setHidePhoto: function (hide) {
      if (!state) return Promise.resolve();
      return state.transport.update('players/' + state.uid, { hidePhoto: hide ? true : null }).catch(function () {});
    },

    /* Paused or otherwise not looking: rounds do not wait for this player. */
    setAway: function (away) {
      if (!state) return Promise.resolve();
      return state.transport.update('players/' + state.uid, { away: !!away || isHidden() }).catch(function () {});
    },

    /* This player stopped playing the running game but stays in the room.
       Rounds stop waiting for them. */
    markLeftGame: function (startAt) {
      if (!state || startAt == null) return Promise.resolve();
      return state.transport.update('players/' + state.uid, { leftGame: startAt }).catch(function () {});
    },

    /* Leave for good: hand the host role to someone still here, then take
       this player out of the room's list. */
    leave: function () {
      if (!state) return Promise.resolve();
      var s = state;
      var transport = s.transport;
      var now = transport.serverNow();
      var next = null;
      if (s.meta && s.meta.hostUid === s.uid) {
        next = this.racePlayers().filter(function (p) {
          return p.uid !== s.uid && playerIsOnline(s.players[p.uid], now);
        }).sort(function (a, b) { return (a.joinedAt || 0) - (b.joinedAt || 0); })[0] || null;
      }
      stopHeartbeat();
      if (offVisibility) offVisibility();
      unsubs.slice().forEach(function (off) { try { off(); } catch (e) {} });
      unsubs = [];
      this.offAll();
      state = null;
      FF.Random.unseed();
      var handOff = next ? transport.update('meta', { hostUid: next.uid }) : Promise.resolve();
      return handOff.catch(function () {}).then(function () {
        // The "went offline" write registered on joining must not bring this
        // player back into the list after they are removed.
        if (transport.onDisconnectCancel) return transport.onDisconnectCancel('players/' + s.uid + '/online');
      }).catch(function () {}).then(function () {
        try { transport.close(); } catch (e) {}
        return transport.set('players/' + s.uid, null);
      }).catch(function () {
        return transport.set('players/' + s.uid + '/online', false);
      }).catch(function () {});
    }
  };
})();
