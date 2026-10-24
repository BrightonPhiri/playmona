'use strict';
/* The TV view people watching see: FF.WatchView.model turns a broadcast into
   what to draw, FF.WatchTV draws it (layout C, phone stack). */
const { loadFF, test, assert, assertEqual } = require('./harness');

function boot() {
  const FF = loadFF(['js/core.js', 'js/watch/view.js', 'js/watch/tv.js']);
  const doc = FF.__sandbox.document;
  FF.__sandbox.Node = { [Symbol.hasInstance]: function (o) { return !!(o && o.tagName); } };
  FF.Avatars = { img: function () { return doc.createElement('img'); }, url: function () { return ''; } };
  FF.Icons = { icon: function () { return doc.createElement('i'); }, game: {} };
  return FF;
}
function find(node, cls, out) {
  out = out || [];
  if (!node) return out;
  if (typeof node.className === 'string' && node.className.split(' ').indexOf(cls) !== -1) out.push(node);
  (node.children || []).forEach(function (c) { find(c, cls, out); });
  return out;
}
function text(node) {
  if (!node) return '';
  return (node.textContent || '') + (node.children || []).map(text).join('');
}

const NOW = 2000000;
function broadcast(over) {
  return Object.assign({
    v: 1, name: 'Friday quiz', public: true, status: 'playing', mode: 'players',
    game: { id: 'guessFlag', name: 'World Flags', category: 'world' },
    startAt: NOW - 60000,
    round: { n: 4, total: 10, opensAt: NOW - 2000, timerMs: 20000, screen: { kind: 'choice', text: 'Which flag?', options: ['Zambia', 'Zimbabwe', 'Malawi', 'Kenya'] }, answer: null },
    players: {
      u1: { name: 'Tari', avatar: 'fox', score: 300, answered: true, correct: null, talking: false },
      u2: { name: 'Ana', avatar: 'owl', score: 400, answered: false, correct: null, talking: true },
      u3: { name: 'Ben', avatar: 'cat', score: 300, answered: false, correct: null, talking: false }
    },
    results: null,
    updatedAt: NOW - 1000
  }, over || {});
}

test('tv model: leaderboard sorted by score with ranks', function () {
  const FF = boot();
  const m = FF.WatchView.model(broadcast(), NOW);
  assertEqual(m.leaderboard.map(function (p) { return p.name; }).join(','), 'Ana,Ben,Tari', 'score, then name');
  assertEqual(m.leaderboard.map(function (p) { return p.rank; }).join(','), '1,2,2', 'ties share a place');
  assertEqual(m.leaderboard[0].talking, true);
  assertEqual(m.leaderboard[2].answered, true);
});

test('tv model: the answer shows only in the reveal state', function () {
  const FF = boot();
  const q = FF.WatchView.model(broadcast(), NOW);
  assertEqual(q.state, 'question');
  assertEqual(q.answer, null);
  const b = broadcast();
  b.round.answer = 1;
  const r = FF.WatchView.model(b, NOW);
  assertEqual(r.state, 'reveal');
  assertEqual(r.answer, 1);
});

test('tv model: countdown before startAt, podium after the game', function () {
  const FF = boot();
  const c = FF.WatchView.model(broadcast({ startAt: NOW + 4200, round: null }), NOW);
  assertEqual(c.state, 'countdown');
  assertEqual(c.countdownMs, 4200);
  const ended = FF.WatchView.model(broadcast({
    status: 'ended', round: null,
    results: [{ id: 'u2', name: 'Ana', score: 900 }, { id: 'u1', name: 'Tari', score: 500 }, { id: 'u3', name: 'Ben', score: 200 }, { id: 'u4', name: 'Dee', score: 100 }]
  }), NOW);
  assertEqual(ended.state, 'podium');
  assertEqual(ended.podium.length, 3, 'top three');
  assertEqual(ended.podium.map(function (p) { return p.place; }).join(','), '1,2,3');
  assertEqual(FF.WatchView.model(broadcast({ status: 'lobby', round: null }), NOW).state, 'lobby');
});

test('tv model: a stale broadcast reads as ended', function () {
  const FF = boot();
  assertEqual(FF.WatchView.model(broadcast({ updatedAt: NOW - 46000 }), NOW).state, 'ended');
  assertEqual(FF.WatchView.model(null, NOW).state, 'ended');
});

test('tv model: clock-only games say "Question 5" without a total', function () {
  const FF = boot();
  assertEqual(FF.WatchView.model(broadcast(), NOW).roundText, 'Question 5 of 10');
  const b = broadcast();
  b.round.total = null;
  assertEqual(FF.WatchView.model(b, NOW).roundText, 'Question 5');
});

test('tv model: teams mode shows one tile per team with summed scores', function () {
  const FF = boot();
  const m = FF.WatchView.model(broadcast({
    mode: 'teams',
    players: {
      u1: { name: 'Tari', avatar: 'fox', score: 300, answered: true, teamId: 'team1' },
      u2: { name: 'Ana', avatar: 'owl', score: 100, answered: true, teamId: 'team1' },
      u3: { name: 'Ben', avatar: 'cat', score: 250, answered: false, teamId: 'team2' }
    }
  }), NOW);
  assertEqual(m.leaderboard.length, 2);
  assertEqual(m.leaderboard[0].name, 'Team 1');
  assertEqual(m.leaderboard[0].score, 400);
  assertEqual(m.leaderboard[0].answered, true, 'every member answered');
  assertEqual(m.leaderboard[1].answered, false);
});

test('tv render: twelve players fit and the four answers carry their shapes', function () {
  const FF = boot();
  const doc = FF.__sandbox.document;
  const box = doc.createElement('div');
  const tv = FF.WatchTV.mount(box, { now: function () { return NOW; } });
  const b = broadcast();
  b.players = {};
  for (let i = 0; i < 12; i++) b.players['u' + i] = { name: 'P' + i, avatar: 'fox', score: i * 10, answered: false };
  tv.update(FF.WatchView.model(b, NOW));
  assertEqual(find(box, 'tv-tile').length, 12, 'twelve tiles');
  const labels = find(box, 'tv-opt').map(text);
  assertEqual(labels.length, 4);
  ['▲', '◆', '●', '■'].forEach(function (shape, i) { assert(labels[i].indexOf(shape) === 0, 'option ' + i + ' starts with ' + shape); });
  tv.destroy();
});

test('tv render: pictures are drawn safely', function () {
  const FF = boot();
  const doc = FF.__sandbox.document;
  const box = doc.createElement('div');
  const tv = FF.WatchTV.mount(box, { now: function () { return NOW; } });
  function imgSrc(image) {
    const b = broadcast();
    b.round.screen = { kind: 'choice', text: 'q', options: ['a', 'b'], image: image };
    tv.update(FF.WatchView.model(b, NOW));
    const pic = find(box, 'tv-q__img')[0];
    return pic ? (pic.src || pic.getAttribute('src') || '') : null;
  }
  assertEqual(imgSrc({ flag: 'zw' }), 'assets/flags/zw.svg');
  assertEqual(imgSrc({ flag: '../x' }), null, 'bad flag code dropped');
  assertEqual(imgSrc({ src: 'assets/images/covers/familyQuiz.webp' }), 'assets/images/covers/familyQuiz.webp');
  assertEqual(imgSrc({ src: 'https://evil.example/x.png' }), null, 'outside pictures dropped');
  assertEqual(imgSrc({ src: 'assets/../api/x.png' }), null, 'no climbing out');
  assert(/^data:image\/svg\+xml/.test(imgSrc({ svg: '<svg><script>alert(1)</script></svg>' })), 'drawings only as an image');
  tv.destroy();
});
