'use strict';
/* Music stops during voice chat, and the microphone help picks the right
   steps for each browser and phone. */
const { loadFF, test, assert, assertEqual } = require('./harness');

/* ---------- Music ---------- */
function musicApp() {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/audio.js']);
  const sb = FF.__sandbox;
  sb.Audio = function () {
    const el = sb.document.createElement('audio');
    el.paused = true;
    el.volume = 1;
    el.currentTime = 0;
    el.play = function () { el.paused = false; return Promise.resolve(); };
    el.pause = function () { el.paused = true; };
    return el;
  };
  const listeners = [];
  let active = false;
  FF.Voice = {
    isActive: function () { return active; },
    on: function (ev, fn) { if (ev === 'change') listeners.push(fn); }
  };
  const setVoice = function (on) {
    active = on;
    listeners.forEach(function (fn) { fn({ active: on }); });
  };
  FF.Audio.init();
  return { FF: FF, setVoice: setVoice };
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

test('music: joining voice chat stops the music, leaving brings it back', async function () {
  const app = musicApp();
  const A = app.FF.Audio;
  A.startAppMusic();
  await wait(20);
  assert(A.musicPlaying(), 'music plays on the menus');

  app.setVoice(true);
  await wait(700);
  assertEqual(A.musicPlaying(), false, 'music stopped in voice chat');

  A.setMusic(true);            // toggling music on while in voice keeps it quiet
  await wait(20);
  assertEqual(A.musicPlaying(), false, 'music stays off while in voice chat');

  app.setVoice(false);
  await wait(20);
  assert(A.musicPlaying(), 'music back after leaving voice chat');
});

/* ---------- Microphone help ---------- */
const UAS = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-A156B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36',
  facebook: 'Mozilla/5.0 (Linux; Android 14; SM-A156B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
};

function textOf(n) {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  return [n.textContent || ''].concat((n.children || []).map(textOf)).join(' ');
}

function helpFor(ua, code) {
  const FF = loadFF(['js/core.js', 'js/net/micHelp.js']);
  FF.__sandbox.navigator.userAgent = ua;
  // The harness's stub elements aren't Nodes; let FF.ui.el nest them anyway.
  FF.__sandbox.Node = { [Symbol.hasInstance]: function (o) { return !!(o && o.tagName); } };
  FF.t = function (k, f, v) {
    let s = f || k;
    Object.keys(v || {}).forEach(function (x) { s = s.split('{' + x + '}').join(v[x]); });
    return s;
  };
  let shown = null;
  FF.UI = { dialog: function (o) { shown = o; return o; }, toast: function () {} };
  let retried = false;
  FF.MicHelp.handle({ code: code || 'blocked', message: 'x' }, function () { retried = true; });
  const body = textOf({ children: [].concat(shown.body) });
  const tryAgain = shown.actions.find(function (a) { return a.primary; });
  return { title: shown.title, body: body, primary: tryAgain && tryAgain.label, retry: function () { tryAgain.onClick(); return retried; } };
}

test('mic help: iPhone Safari is sent to Website Settings', function () {
  const h = helpFor(UAS.iosSafari);
  assertEqual(h.title, 'Allow the microphone');
  assert(/Website Settings/.test(h.body), h.body);
  assert(h.retry(), 'Try again calls join again');
});

test('mic help: Chrome on iPhone is sent to the Settings app', function () {
  const h = helpFor(UAS.iosChrome);
  assert(/Settings app/.test(h.body) && /tap Chrome/.test(h.body), h.body);
});

test('mic help: Android Chrome gets site permissions and phone settings', function () {
  const h = helpFor(UAS.androidChrome);
  assert(/Permissions/.test(h.body) && /Apps, then Chrome/.test(h.body), h.body);
});

test('mic help: inside the Facebook app, open the page in a browser', function () {
  const h = helpFor(UAS.facebook);
  assertEqual(h.title, 'Open PlayMona in your browser');
  assertEqual(h.primary, 'Copy link');
});

test('mic help: computers get address-bar steps and system settings', function () {
  assert(/Site settings/.test(helpFor(UAS.winChrome).body) && /Windows Settings/.test(helpFor(UAS.winChrome).body));
  assert(/Settings for This Website/.test(helpFor(UAS.macSafari).body) && /System Settings/.test(helpFor(UAS.macSafari).body));
  assert(/clear Blocked/.test(helpFor(UAS.winFirefox).body));
});

test('mic help: missing and busy microphones get their own advice', function () {
  assertEqual(helpFor(UAS.androidChrome, 'nomic').title, 'No microphone found');
  assertEqual(helpFor(UAS.androidChrome, 'busy').title, 'The microphone is busy');
});
