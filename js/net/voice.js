/* ============================================================
   PLAYMONA — net/voice.js
   Optional real-time audio conversation (WebRTC voice chat).
   Zero external server costs: P2P audio mesh with Firebase /
   BroadcastChannel signaling, Voice Activity Detection (VAD),
   mute/deafen controls, and speaking indicator state.
   Classic script (no ES modules) running safely from file://
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  var state = {
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection),
    active: false,
    muted: false,
    deafened: false,
    speaking: false,
    localStream: null,
    audioContext: null,
    analyser: null,
    vadInterval: null,
    peers: {},              // uid -> { pc, audio, speaking, connected, pending }
    seenSignals: {},        // signal id -> true, so each message is handled once
    remoteSpeaking: {},     // uid -> boolean (heard here OR reported by them)
    remoteFlag: {},         // uid -> what their own phone reports (via the room)
    remoteHeard: {},        // uid -> what this phone hears in their audio
    meters: {},             // uid ('me' for this phone) -> level meter
    unsubs: [],
    listeners: { change: [], speaking: [], error: [] }
  };

  function emit(event, payload) {
    (state.listeners[event] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { if (window.console) console.error('[FF.Voice]', e); }
    });
  }

  function notifyChange() {
    emit('change', {
      active: state.active,
      muted: state.muted,
      deafened: state.deafened,
      speaking: state.speaking,
      peerCount: Object.keys(state.peers).length
    });
  }

  function getTransport() {
    var r = FF.Room && FF.Room.current();
    return r ? r.transport : null;
  }

  function getMyUid() {
    var r = FF.Room && FF.Room.current();
    return r ? r.uid : null;
  }

  /* ---------------- Who is speaking ----------------
     Every voice gets a level meter on this phone: your own microphone, and
     each other player's audio as it arrives. So everyone you can hear lights
     up at once, without waiting for their phone to report it (an iPhone that
     could not start its own meter used to never show as speaking).

     The audio context must be created during the tap that joins voice chat:
     iPhones keep a context made later paused, and a paused meter hears
     nothing. A later tap resumes it if needed. */
  var LOCAL = 'me';

  function ensureAudioContext() {
    if (state.audioContext) return state.audioContext;
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try { state.audioContext = new AudioCtx(); } catch (e) { return null; }
    resumeAudio();
    return state.audioContext;
  }

  function resumeAudio() {
    var ctx = state.audioContext;
    if (!ctx || ctx.state !== 'suspended') return;
    try { ctx.resume().catch(function () {}); } catch (e) {}
    // Still paused (no tap yet): try again on the next tap anywhere.
    if (!resumeAudio.armed) {
      resumeAudio.armed = true;
      var retry = function () {
        resumeAudio.armed = false;
        document.removeEventListener('pointerdown', retry, true);
        document.removeEventListener('keydown', retry, true);
        if (state.audioContext && state.audioContext.state === 'suspended') {
          try { state.audioContext.resume().catch(function () {}); } catch (e) {}
        }
      };
      document.addEventListener('pointerdown', retry, true);
      document.addEventListener('keydown', retry, true);
    }
  }

  function addMeter(key, stream) {
    removeMeter(key);
    var ctx = ensureAudioContext();
    if (!ctx || !stream) return;
    try {
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      state.meters[key] = {
        source: source, analyser: analyser,
        buf: analyser.getFloatTimeDomainData ? new Float32Array(analyser.fftSize) : new Uint8Array(analyser.fftSize),
        floor: 0, on: false, above: 0, below: 0
      };
    } catch (e) {
      if (window.console) console.warn('[FF.Voice] Could not measure', key, e);
    }
  }

  function removeMeter(key) {
    var m = state.meters[key];
    if (!m) return;
    try { m.source.disconnect(); } catch (e) {}
    delete state.meters[key];
  }

  // Loudness of the last few milliseconds (RMS, 0..1).
  function levelOf(m) {
    var buf = m.buf, sum = 0, i, v;
    if (buf instanceof Float32Array) {
      m.analyser.getFloatTimeDomainData(buf);
      for (i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    } else {
      m.analyser.getByteTimeDomainData(buf);
      for (i = 0; i < buf.length; i++) { v = (buf[i] - 128) / 128; sum += v * v; }
    }
    return Math.sqrt(sum / buf.length);
  }

  /* Speech is louder than the room's background: the threshold follows a
     slowly-learnt noise floor, so quiet and loud microphones both work. */
  function updateMeter(m, level) {
    // The floor drops at once in quiet moments and creeps up slowly, capped
    // so a long sentence or a noisy room never hides real speech.
    m.floor = m.floor ? (level < m.floor ? level : Math.min(0.04, m.floor + (level - m.floor) * 0.005)) : Math.min(0.04, level);
    var threshold = Math.max(0.012, m.floor * 2.5);
    if (level > threshold) {
      m.above++; m.below = 0;
      if (!m.on && m.above >= 2) { m.on = true; return true; }
    } else {
      m.below++; m.above = 0;
      if (m.on && m.below >= 6) { m.on = false; return true; }
    }
    return false;
  }

  function startVAD(stream) {
    // Keep the audio context made during the tap; only restart the loop.
    if (state.vadInterval) { clearInterval(state.vadInterval); state.vadInterval = null; }
    addMeter(LOCAL, stream);
    state.vadInterval = setInterval(function () {
      Object.keys(state.meters).forEach(function (key) {
        var m = state.meters[key];
        var silent = key === LOCAL && (!state.active || state.muted);
        if (!updateMeter(m, silent ? 0 : levelOf(m))) return;
        if (key === LOCAL) setSpeaking(m.on);
        else { state.remoteHeard[key] = m.on; refreshRemote(key); }
      });
    }, 100);
  }

  // A player shows as speaking if this phone hears them OR their phone says so.
  function refreshRemote(uid) {
    var now = !!(state.remoteHeard[uid] || state.remoteFlag[uid]);
    if (!!state.remoteSpeaking[uid] === now) return;
    state.remoteSpeaking[uid] = now;
    emit('speaking', { uid: uid, speaking: now, local: false });
  }

  function setSpeaking(speaking) {
    if (state.speaking === speaking) return;
    state.speaking = speaking;
    emit('speaking', { uid: getMyUid(), speaking: speaking, local: true });
    notifyChange();

    var transport = getTransport();
    var myUid = getMyUid();
    if (transport && myUid) {
      transport.update('voice/' + myUid, { speaking: speaking }).catch(function () {});
    }
  }

  function stopVAD() {
    if (state.vadInterval) {
      clearInterval(state.vadInterval);
      state.vadInterval = null;
    }
    Object.keys(state.meters).forEach(removeMeter);
    if (state.audioContext) {
      try { state.audioContext.close(); } catch (e) {}
      state.audioContext = null;
    }
    state.analyser = null;
    state.speaking = false;
  }

  /* ---------------- WebRTC Peer Connection ---------------- */

  /* Firebase saves only an object's own fields. A browser's RTCSessionDescription
     keeps type and sdp on its prototype, so saving it as-is stored an offer with
     no sdp: the other side could never answer and no audio flowed (the speaking
     light still worked, because it travels through the room, not the call). */
  function plainDesc(d) {
    return d ? { type: d.type, sdp: d.sdp } : null;
  }

  // Remote voices play through <audio> elements kept in the page (iOS Safari is
  // more reliable with attached elements than with detached ones).
  function audioHost() {
    var host = document.getElementById('ff-voice-audio');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ff-voice-audio';
      host.hidden = true;
      document.body.appendChild(host);
    }
    return host;
  }

  // If the browser refuses to start a voice without a tap, the next tap starts it.
  var blockedAudio = [];
  function playVoice(audio) {
    var p;
    try { p = audio.play(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).catch(function (e) {
      if (e && e.name === 'NotAllowedError' && blockedAudio.indexOf(audio) === -1) {
        blockedAudio.push(audio);
        document.addEventListener('pointerdown', retryBlockedAudio, true);
        document.addEventListener('keydown', retryBlockedAudio, true);
      }
    });
  }
  function retryBlockedAudio() {
    document.removeEventListener('pointerdown', retryBlockedAudio, true);
    document.removeEventListener('keydown', retryBlockedAudio, true);
    var list = blockedAudio;
    blockedAudio = [];
    list.forEach(function (a) { if (a.srcObject) playVoice(a); });
  }

  function createPeer(targetUid, isOfferer) {
    if (state.peers[targetUid]) return state.peers[targetUid];

    var pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    var audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.muted = state.deafened;
    audioHost().appendChild(audio);

    var peerRecord = {
      pc: pc,
      audio: audio,
      uid: targetUid,
      connected: false
    };
    state.peers[targetUid] = peerRecord;

    // Attach local microphone tracks
    if (state.localStream) {
      state.localStream.getTracks().forEach(function (track) {
        pc.addTrack(track, state.localStream);
      });
    }

    pc.ontrack = function (ev) {
      if (ev.streams && ev.streams[0]) {
        audio.srcObject = ev.streams[0];
        playVoice(audio);
        addMeter(targetUid, ev.streams[0]);   // light them up when this phone hears them
      }
    };

    pc.onicecandidate = function (ev) {
      if (!ev.candidate) return;
      sendSignal(targetUid, {
        type: 'candidate',
        candidate: JSON.parse(JSON.stringify(ev.candidate))
      });
    };

    pc.onconnectionstatechange = function () {
      peerRecord.connected = (pc.connectionState === 'connected');
      notifyChange();
    };

    if (isOfferer) {
      pc.createOffer({ offerToReceiveAudio: true })
        .then(function (offer) { return pc.setLocalDescription(offer); })
        .then(function () {
          sendSignal(targetUid, {
            type: 'offer',
            sdp: plainDesc(pc.localDescription)
          });
        })
        .catch(function (e) {
          if (window.console) console.error('[FF.Voice] Error creating offer for', targetUid, e);
        });
    }

    return peerRecord;
  }

  function closePeer(uid) {
    var p = state.peers[uid];
    if (!p) return;
    try {
      if (p.audio) {
        p.audio.pause();
        p.audio.srcObject = null;
        if (p.audio.parentNode) p.audio.parentNode.removeChild(p.audio);
      }
      if (p.pc) { p.pc.close(); }
    } catch (e) {}
    delete state.peers[uid];
    removeMeter(uid);
    delete state.remoteSpeaking[uid];
    delete state.remoteFlag[uid];
    delete state.remoteHeard[uid];
    emit('speaking', { uid: uid, speaking: false, local: false });
    notifyChange();
  }

  var signalSeq = 0;

  /* Every message gets its own slot (signals/<to>/<from>/<id>). One shared slot let
     ICE candidates overwrite the offer before the other side read it. */
  function sendSignal(targetUid, data) {
    var transport = getTransport();
    var myUid = getMyUid();
    if (!transport || !myUid) return;
    signalSeq += 1;
    var id = Date.now().toString(36) + '-' + ('000' + signalSeq).slice(-4) + '-' + Math.random().toString(36).slice(2, 6);
    var path = 'signals/' + targetUid + '/' + myUid + '/' + id;
    transport.set(path, {
      from: myUid,
      to: targetUid,
      data: data,
      ts: transport.serverNow()
    }).catch(function () {});
  }

  /* All unread messages from one sender, oldest first; each is deleted once handled. */
  function handleSignalsFrom(senderUid, messages) {
    if (!messages || typeof messages !== 'object') return;
    var transport = getTransport();
    var myUid = getMyUid();
    Object.keys(messages).sort().forEach(function (id) {
      if (state.seenSignals[id]) return;
      state.seenSignals[id] = true;
      handleIncomingSignal(senderUid, messages[id]);
      if (transport && myUid) {
        try { transport.set('signals/' + myUid + '/' + senderUid + '/' + id, null); } catch (e) {}
      }
    });
  }

  function addCandidate(peer, candidate) {
    if (!peer || !peer.pc) return;
    if (!peer.pc.remoteDescription) { (peer.pending = peer.pending || []).push(candidate); return; }
    peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(function () {});
  }

  function flushCandidates(peer) {
    var list = (peer && peer.pending) || [];
    peer.pending = [];
    list.forEach(function (c) { addCandidate(peer, c); });
  }

  function handleIncomingSignal(senderUid, payload) {
    if (!state.active || !payload || !payload.data) return;
    var data = payload.data;
    var myUid = getMyUid();
    if (!myUid || senderUid === myUid) return;

    if ((data.type === 'offer' || data.type === 'answer') && !(data.sdp && data.sdp.sdp)) {
      if (window.console) console.warn('[FF.Voice] Ignored an empty ' + data.type + ' from', senderUid);
      return;
    }

    if (data.type === 'offer') {
      var peer = createPeer(senderUid, false);
      peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        .then(function () { flushCandidates(peer); return peer.pc.createAnswer(); })
        .then(function (answer) { return peer.pc.setLocalDescription(answer); })
        .then(function () {
          sendSignal(senderUid, { type: 'answer', sdp: plainDesc(peer.pc.localDescription) });
        })
        .catch(function (e) {
          if (window.console) console.error('[FF.Voice] Error handling offer:', e);
        });
    } else if (data.type === 'answer') {
      var p = state.peers[senderUid];
      if (p && p.pc) {
        p.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(function () { flushCandidates(p); }).catch(function (e) {
          if (window.console) console.error('[FF.Voice] Error setting remote description for answer:', e);
        });
      }
    } else if (data.type === 'candidate' && data.candidate) {
      addCandidate(state.peers[senderUid], data.candidate);
    }
  }

  function syncVoiceRoster(voiceData) {
    if (!state.active) return;
    voiceData = voiceData || {};
    var myUid = getMyUid();
    if (!myUid) return;

    var currentUids = Object.keys(voiceData);

    currentUids.forEach(function (uid) {
      if (uid === myUid) return;
      var p = voiceData[uid];
      if (p && p.joined) {
        // What their phone reports; combined with what this phone hears.
        state.remoteFlag[uid] = !!p.speaking && !p.muted;
        refreshRemote(uid);

        // Establish connection if not already created.
        // Deterministic offerer: lower UID initiates offer.
        if (!state.peers[uid]) {
          var isOfferer = (myUid < uid);
          createPeer(uid, isOfferer);
        }
      } else {
        if (state.peers[uid]) closePeer(uid);
      }
    });

    // Remove any peers that left the roster
    Object.keys(state.peers).forEach(function (uid) {
      if (!voiceData[uid] || !voiceData[uid].joined) {
        closePeer(uid);
      }
    });
  }

  /* ---------------- Public API ---------------- */
  FF.Voice = {
    isSupported: function () {
      return state.supported;
    },

    isActive: function () {
      return state.active;
    },

    isMuted: function () {
      return state.muted;
    },

    isDeafened: function () {
      return state.deafened;
    },

    isSpeaking: function (uid) {
      var myUid = getMyUid();
      if (!uid || uid === myUid) return state.speaking;
      return !!state.remoteSpeaking[uid];
    },

    peers: function () {
      return Object.keys(state.peers);
    },

    on: function (event, cb) {
      (state.listeners[event] = state.listeners[event] || []).push(cb);
      return function () {
        var list = state.listeners[event] || [];
        var i = list.indexOf(cb);
        if (i !== -1) list.splice(i, 1);
      };
    },

    join: function () {
      if (!state.supported) {
        return Promise.reject(new Error(FF.t('micNotSupported', 'Voice chat requires a modern browser with WebRTC.')));
      }
      var transport = getTransport();
      var myUid = getMyUid();
      if (!transport || !myUid) {
        return Promise.reject(new Error('You must be in a room to join voice chat.'));
      }
      if (state.active) return Promise.resolve();

      // Now, inside the tap that joins: see "Who is speaking" above.
      ensureAudioContext();

      return navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      }).then(function (stream) {
        state.active = true;
        state.seenSignals = {};
        state.localStream = stream;
        state.muted = false;
        state.deafened = false;

        startVAD(stream);

        // Register voice presence
        transport.set('voice/' + myUid, {
          joined: true,
          muted: false,
          speaking: false,
          joinedAt: transport.serverNow()
        });

        if (transport.onDisconnectSet) {
          transport.onDisconnectSet('voice/' + myUid, null);
          transport.onDisconnectSet('signals/' + myUid, null);
        }

        // Watch voice participants
        var unVoice = transport.watch('voice', function (val) {
          syncVoiceRoster(val);
        });
        state.unsubs.push(unVoice);

        // Watch direct incoming signals
        var unSignal = transport.watch('signals/' + myUid, function (signals) {
          if (!signals) return;
          Object.keys(signals).forEach(function (senderUid) {
            handleSignalsFrom(senderUid, signals[senderUid]);
          });
        });
        state.unsubs.push(unSignal);

        notifyChange();
        return state;
      }).catch(function (err) {
        state.active = false;
        stopVAD();
        var name = (err && err.name) || '';
        var code = /NotAllowed|PermissionDenied|Security/.test(name) ? 'blocked'
          : /NotFound|DevicesNotFound|Overconstrained/.test(name) ? 'nomic'
          : /NotReadable|TrackStart|Abort/.test(name) ? 'busy' : 'other';
        var msg = code === 'blocked' ? FF.t('micBlocked', 'Microphone access blocked. Check browser permissions.')
          : code === 'nomic' ? FF.t('micNone', 'No microphone was found on this device.')
          : code === 'busy' ? FF.t('micBusy', 'Another app is using the microphone.')
          : ((err && err.message) || 'Microphone could not be accessed.');
        var out = new Error(msg);
        out.code = code;
        emit('error', out);
        throw out;
      });
    },

    leave: function () {
      if (!state.active) return;
      var transport = getTransport();
      var myUid = getMyUid();

      if (transport && myUid) {
        try { transport.set('voice/' + myUid, null); } catch (e) {}
        try { transport.set('signals/' + myUid, null); } catch (e) {}
      }

      state.unsubs.forEach(function (u) { try { u(); } catch (e) {} });
      state.unsubs = [];

      Object.keys(state.peers).forEach(function (uid) { closePeer(uid); });
      state.peers = {};
      state.remoteSpeaking = {};
      state.remoteFlag = {};
      state.remoteHeard = {};

      if (state.localStream) {
        state.localStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        state.localStream = null;
      }

      stopVAD();
      state.active = false;
      state.muted = false;
      state.deafened = false;

      notifyChange();
    },

    toggleMute: function () {
      return this.setMute(!state.muted);
    },

    setMute: function (muted) {
      if (!state.active) return false;
      state.muted = !!muted;
      if (state.localStream) {
        state.localStream.getAudioTracks().forEach(function (t) {
          t.enabled = !state.muted;
        });
      }
      if (state.muted && state.speaking) {
        setSpeaking(false);
      }
      var transport = getTransport();
      var myUid = getMyUid();
      if (transport && myUid) {
        transport.update('voice/' + myUid, { muted: state.muted }).catch(function () {});
      }
      notifyChange();
      return state.muted;
    },

    toggleDeafen: function () {
      return this.setDeafen(!state.deafened);
    },

    setDeafen: function (deafened) {
      if (!state.active) return false;
      state.deafened = !!deafened;
      Object.keys(state.peers).forEach(function (uid) {
        var p = state.peers[uid];
        if (p && p.audio) p.audio.muted = state.deafened;
      });
      notifyChange();
      return state.deafened;
    }
  };
})();
