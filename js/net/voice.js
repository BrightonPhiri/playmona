/* ============================================================
   FAMILY FUN — net/voice.js
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
    peers: {},              // uid -> { pc, audio, speaking, connected }
    remoteSpeaking: {},     // uid -> boolean
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

  /* ---------------- VAD (Voice Activity Detection) ---------------- */
  function startVAD(stream) {
    stopVAD();
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
      }
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      state.audioContext = ctx;
      state.analyser = analyser;

      var dataArray = new Uint8Array(analyser.frequencyBinCount);
      var speakingCount = 0;
      var silenceCount = 0;

      state.vadInterval = setInterval(function () {
        if (!state.active || state.muted) {
          if (state.speaking) setSpeaking(false);
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        var sum = 0;
        for (var i = 0; i < dataArray.length; i++) sum += dataArray[i];
        var avg = sum / dataArray.length;

        // Threshold for human speech activity
        if (avg > 18) {
          speakingCount++;
          silenceCount = 0;
          if (speakingCount >= 2 && !state.speaking) {
            setSpeaking(true);
          }
        } else {
          silenceCount++;
          if (silenceCount >= 4) {
            speakingCount = 0;
            if (state.speaking) {
              setSpeaking(false);
            }
          }
        }
      }, 100);
    } catch (e) {
      if (window.console) console.warn('[FF.Voice] VAD initialization failed:', e);
    }
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
    if (state.audioContext) {
      try { state.audioContext.close(); } catch (e) {}
      state.audioContext = null;
    }
    state.analyser = null;
    state.speaking = false;
  }

  /* ---------------- WebRTC Peer Connection ---------------- */
  function createPeer(targetUid, isOfferer) {
    if (state.peers[targetUid]) return state.peers[targetUid];

    var pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    var audio = new Audio();
    audio.autoplay = true;
    audio.muted = state.deafened;

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
        audio.play().catch(function () {});
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
            sdp: pc.localDescription
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
      if (p.audio) { p.audio.srcObject = null; p.audio.pause(); }
      if (p.pc) { p.pc.close(); }
    } catch (e) {}
    delete state.peers[uid];
    delete state.remoteSpeaking[uid];
    emit('speaking', { uid: uid, speaking: false, local: false });
    notifyChange();
  }

  function sendSignal(targetUid, data) {
    var transport = getTransport();
    var myUid = getMyUid();
    if (!transport || !myUid) return;
    var path = 'signals/' + targetUid + '/' + myUid;
    transport.set(path, {
      from: myUid,
      to: targetUid,
      data: data,
      ts: transport.serverNow()
    }).catch(function () {});
  }

  function handleIncomingSignal(senderUid, payload) {
    if (!state.active || !payload || !payload.data) return;
    var data = payload.data;
    var myUid = getMyUid();
    if (!myUid || senderUid === myUid) return;

    if (data.type === 'offer') {
      var peer = createPeer(senderUid, false);
      peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        .then(function () { return peer.pc.createAnswer(); })
        .then(function (answer) { return peer.pc.setLocalDescription(answer); })
        .then(function () {
          sendSignal(senderUid, { type: 'answer', sdp: peer.pc.localDescription });
        })
        .catch(function (e) {
          if (window.console) console.error('[FF.Voice] Error handling offer:', e);
        });
    } else if (data.type === 'answer') {
      var p = state.peers[senderUid];
      if (p && p.pc) {
        p.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).catch(function (e) {
          if (window.console) console.error('[FF.Voice] Error setting remote description for answer:', e);
        });
      }
    } else if (data.type === 'candidate' && data.candidate) {
      var targetPeer = state.peers[senderUid];
      if (targetPeer && targetPeer.pc) {
        targetPeer.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function () {});
      }
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
        // Track remote speaking state
        var isSpeaking = !!p.speaking;
        if (state.remoteSpeaking[uid] !== isSpeaking) {
          state.remoteSpeaking[uid] = isSpeaking;
          emit('speaking', { uid: uid, speaking: isSpeaking, local: false });
        }

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

      return navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      }).then(function (stream) {
        state.active = true;
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
            handleIncomingSignal(senderUid, signals[senderUid]);
          });
        });
        state.unsubs.push(unSignal);

        notifyChange();
        return state;
      }).catch(function (err) {
        state.active = false;
        var msg = (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
          ? FF.t('micBlocked', 'Microphone access blocked. Check browser permissions.')
          : (err.message || 'Microphone could not be accessed.');
        emit('error', new Error(msg));
        throw new Error(msg);
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
