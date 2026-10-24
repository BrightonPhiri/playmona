'use strict';
/* Voice chat signalling: two players' FF.Voice talking through a fake
   Firebase. The fake saves only an object's own fields, like Firebase does,
   which is what silently emptied every offer and answer before. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

// Firebase keeps own enumerable fields only and drops empty objects.
function fbClone(v) {
  if (v === null || typeof v !== 'object') return v;
  const out = {};
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    const c = fbClone(v[k]);
    if (c !== undefined && c !== null) out[k] = c;
  }
  return Object.keys(out).length ? out : null;
}

function makeDb() {
  const root = {};
  const watchers = [];
  function parts(p) { return p.split('/').filter(Boolean); }
  function read(p) {
    let n = root;
    for (const k of parts(p)) { if (!n || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : JSON.parse(JSON.stringify(n));
  }
  function write(p, v) {
    const ks = parts(p);
    let n = root;
    ks.slice(0, -1).forEach(function (k) { if (!n[k] || typeof n[k] !== 'object') n[k] = {}; n = n[k]; });
    const last = ks[ks.length - 1];
    const val = fbClone(v);
    if (val === null) delete n[last]; else n[last] = val;
    Promise.resolve().then(function () { watchers.slice().forEach(function (w) { w.check(); }); });
  }
  return {
    transport: function () {
      return {
        serverNow: function () { return Date.now(); },
        set: function (p, v) { write(p, v); return Promise.resolve(); },
        update: function (p, obj) {
          Object.keys(obj).forEach(function (k) { write(p + '/' + k, obj[k]); });
          return Promise.resolve();
        },
        watch: function (p, cb) {
          const w = { last: undefined, check: function () {
            const s = JSON.stringify(read(p));
            if (s === w.last) return;
            w.last = s;
            cb(read(p));
          } };
          watchers.push(w);
          Promise.resolve().then(function () { w.check(); });
          return function () { const i = watchers.indexOf(w); if (i !== -1) watchers.splice(i, 1); };
        },
        onDisconnectSet: function () { return Promise.resolve(); }
      };
    }
  };
}

// A browser-like description: type and sdp live on the prototype.
class FakeDesc {
  constructor(init) { this._t = init.type; this._s = init.sdp; }
  get type() { return this._t; }
  get sdp() { return this._s; }
  toJSON() { return { type: this._t, sdp: this._s }; }
}

function player(db, uid) {
  const FF = loadFF(['js/core.js']);
  const sb = FF.__sandbox;
  const pcs = [];
  sb.document.getElementById = function (id) {
    return sb.document.body.children.find(function (c) { return c.id === id; }) || null;
  };
  const track = { enabled: true, stop: function () {} };
  const stream = { getTracks: function () { return [track]; }, getAudioTracks: function () { return [track]; } };
  sb.navigator.mediaDevices = { getUserMedia: function () { return Promise.resolve(stream); } };
  sb.RTCSessionDescription = function (init) {
    if (!init || !init.type || !init.sdp) throw new TypeError('RTCSessionDescription needs type and sdp');
    return new FakeDesc(init);
  };
  sb.RTCIceCandidate = function (c) { return c; };
  sb.Audio = function () { return sb.document.createElement('audio'); };
  sb.RTCPeerConnection = function () {
    const pc = this;
    pcs.push(pc);
    pc.localDescription = null;
    pc.remoteDescription = null;
    pc.addTrack = function () {};
    pc.close = function () {};
    pc.addIceCandidate = function () { return Promise.resolve(); };
    pc.createOffer = function () { return Promise.resolve({ type: 'offer', sdp: 'v=0 offer-from-' + uid }); };
    pc.createAnswer = function () { return Promise.resolve({ type: 'answer', sdp: 'v=0 answer-from-' + uid }); };
    pc.setLocalDescription = function (d) { pc.localDescription = new FakeDesc(d); return Promise.resolve(); };
    pc.setRemoteDescription = function (d) { pc.remoteDescription = d; return Promise.resolve(); };
  };
  FF.t = FF.t || function (k, f) { return f || k; };
  const transport = db.transport();
  FF.Room = { current: function () { return { transport: transport, uid: uid }; } };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/net/voice.js'), 'utf8'), sb, { filename: 'js/net/voice.js' });
  return { FF: FF, pcs: pcs };
}

function settle() { return new Promise(function (r) { setTimeout(r, 30); }); }

test('voice: the offer and answer keep their sdp through Firebase', async function () {
  const db = makeDb();
  const a = player(db, 'aaa');   // lower uid makes the offer
  const b = player(db, 'bbb');
  await a.FF.Voice.join();
  await b.FF.Voice.join();
  for (let i = 0; i < 5; i++) await settle();

  assertEqual(a.pcs.length, 1, 'player A has one call');
  assertEqual(b.pcs.length, 1, 'player B has one call');
  const atB = b.pcs[0].remoteDescription;
  const atA = a.pcs[0].remoteDescription;
  assert(atB && atB.sdp === 'v=0 offer-from-aaa', 'B got the offer with its sdp, got ' + JSON.stringify(atB));
  assert(atA && atA.sdp === 'v=0 answer-from-bbb', 'A got the answer with its sdp, got ' + JSON.stringify(atA));
});

test('voice: a blocked microphone is reported with code "blocked"', async function () {
  const db = makeDb();
  const a = player(db, 'aaa');
  a.FF.__sandbox.navigator.mediaDevices.getUserMedia = function () {
    const e = new Error('Permission denied'); e.name = 'NotAllowedError'; return Promise.reject(e);
  };
  let caught = null;
  try { await a.FF.Voice.join(); } catch (e) { caught = e; }
  assert(caught, 'join rejects');
  assertEqual(caught.code, 'blocked');
  assertEqual(a.FF.Voice.isActive(), false);
});

test('voice: everyone talking at once is highlighted, including you', async function () {
  const db = makeDb();
  const a = player(db, 'aaa');
  const b = player(db, 'bbb');
  const sb = a.FF.__sandbox;
  // A fake audio context: each stream carries a loudness level we control.
  let gumCalled = false, ctxMade = null;
  const mic = { level: 0.001, getTracks: () => [{ enabled: true, stop() {} }], getAudioTracks: () => [{ enabled: true }] };
  sb.navigator.mediaDevices.getUserMedia = function () { gumCalled = true; return Promise.resolve(mic); };
  sb.AudioContext = function () {
    ctxMade = gumCalled ? 'after' : 'before';
    this.state = 'running';
    this.close = function () {};
    this.createMediaStreamSource = function (stream) {
      return { connect: function (an) { an.stream = stream; }, disconnect: function () {} };
    };
    this.createAnalyser = function () {
      return { fftSize: 0, getFloatTimeDomainData: function (buf) { buf.fill(this.stream ? this.stream.level : 0); } };
    };
  };
  sb.Float32Array = Float32Array;
  sb.document.addEventListener = function () {};
  sb.document.removeEventListener = function () {};

  await a.FF.Voice.join();
  await b.FF.Voice.join();
  for (let i = 0; i < 5; i++) await settle();
  assertEqual(ctxMade, 'before', 'the meter is made during the tap, before the microphone answers');

  // Ben's audio arrives on Ana's phone.
  const benVoice = { level: 0.001 };
  a.pcs[0].ontrack({ streams: [benVoice] });
  await new Promise(r => setTimeout(r, 400));   // learn the quiet room
  mic.level = 0.2; benVoice.level = 0.15;      // both talk
  await new Promise(r => setTimeout(r, 400));
  assert(a.FF.Voice.isSpeaking(), 'Ana sees herself speaking');
  assert(a.FF.Voice.isSpeaking('bbb'), 'Ana sees Ben speaking at the same time');

  a.FF.Voice.setMute(true);
  await new Promise(r => setTimeout(r, 900));
  assert(!a.FF.Voice.isSpeaking(), 'muted means not speaking');
  a.FF.Voice.leave(); b.FF.Voice.leave();
});
