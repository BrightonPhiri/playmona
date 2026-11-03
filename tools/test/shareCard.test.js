'use strict';
/* The brag image (js/shareCard.js): sizes, everything inside the picture, and drawing
   that survives pictures that fail to load. */
const { loadFF, test, assert, assertEqual } = require('./harness');

function boot() {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/data/avatars.js', 'js/avatars.js', 'js/vendor/qrcode.js', 'js/shareCard.js']);
  return FF;
}

function spec(extra) {
  return Object.assign({
    size: 'story', game: 'Memory Match', cover: null, tint: '#f97316',
    verdict: 'Kuda beat Brighton by 320 points!', sub: 'Same Memory Match. One go. No excuses.',
    players: [{ name: 'Kuda', avatar: 'nia', score: 1560, winner: true }, { name: 'Brighton', avatar: 'tafara', score: 1240 }],
    stats: [{ value: '0:48', label: 'Time' }, { value: '12', label: 'Pairs' }, { value: '6', label: 'Best streak' }],
    confetti: true, footer: { hook: 'Think you can beat 1,560?', cta: 'Scan to play', url: 'https://playmona.com/play#challenge=abc' }
  }, extra || {});
}

function inside(L) {
  L.items.forEach(function (it) {
    assert(it.x >= 0 && it.y >= 0 && it.x + it.w <= L.w + 0.5 && it.y + it.h <= L.h + 0.5,
      it.type + ' is inside the picture: ' + JSON.stringify([it.x, it.y, it.w, it.h]));
  });
}

test('share card: story is 1080×1920 and square is 1080×1080, with everything inside', function () {
  const FF = boot();
  const story = FF.ShareCard.layout(spec());
  assertEqual([story.w, story.h], [1080, 1920]);
  inside(story);
  const square = FF.ShareCard.layout(spec({ size: 'square' }));
  assertEqual([square.w, square.h], [1080, 1080]);
  inside(square);
  assertEqual(square.items.filter(function (i) { return i.type === 'stat'; }).length, 0, 'no stats on the small card');
});

test('share card: the dare (one player and a "?") with no stats lays out', function () {
  const FF = boot();
  const L = FF.ShareCard.layout(spec({ players: [{ name: 'Brighton', score: 1240 }, { name: 'You', mystery: true, score: null }], stats: [], confetti: false }));
  inside(L);
  assertEqual(L.items.filter(function (i) { return i.type === 'player'; }).length, 2);
  assert(!L.items.some(function (i) { return i.type === 'confetti'; }), 'no confetti on a dare');
  const solo = FF.ShareCard.layout(spec({ players: [{ name: 'Brighton', score: 1240 }] }));
  inside(solo);
});

test('share card: drawing survives pictures that fail to load', async function () {
  const FF = boot();
  const sb = FF.__sandbox;
  const calls = [];
  const ctx = new Proxy({}, {
    get: function (o, k) {
      if (k === 'measureText') return function (s) { return { width: String(s).length * 20 }; };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
      if (k in o) return o[k];
      return function () { calls.push(k); };
    },
    set: function (o, k, v) { o[k] = v; return true; }
  });
  const make = sb.document.createElement.bind(sb.document);
  sb.document.createElement = function (tag) {
    if (tag === 'canvas') return { width: 0, height: 0, getContext: function () { return ctx; } };
    return make(tag);
  };
  sb.Image = function () { const img = this; setTimeout(function () { img.onerror && img.onerror(); }, 0); };
  const canvas = await FF.ShareCard.render(spec());
  assertEqual([canvas.width, canvas.height], [1080, 1920]);
  assert(calls.indexOf('fillText') !== -1, 'text was drawn');
  assert(calls.filter(function (c) { return c === 'fillRect'; }).length > 100, 'the QR code was drawn');
});
