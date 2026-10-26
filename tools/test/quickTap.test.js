'use strict';
/* Quick Tap: ratings, points, the round schedule and the online wiring
   (js/games/reactionGames.js). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

function load() {
  const FF = loadFF(['js/core.js']);
  FF.registerGame = function () {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/reactionGames.js'), 'utf8'), FF.__sandbox, { filename: 'reactionGames.js' });
  return FF;
}

test('quick tap: speed ratings and offline points', function () {
  const QT = load().QuickTap;
  assertEqual(QT.tier(150).id, 'lightning');
  assertEqual(QT.tier(180).id, 'rocket', '180 is not under 180');
  assertEqual(QT.tier(279).id, 'quick');
  assertEqual(QT.tier(349).id, 'steady');
  assertEqual(QT.tier(900).id, 'sleepy');
  assertEqual(QT.tierPoints(150, 1.5), 450);
  assertEqual(QT.tierPoints(null, 2), 0, 'a false start scores nothing');
});

test('quick tap: online place points', function () {
  const QT = load().QuickTap;
  assertEqual(QT.placePoints(1, 1), 300);
  assertEqual(QT.placePoints(2, 1), 200);
  assertEqual(QT.placePoints(3, 2), 300);
  assertEqual(QT.placePoints(7, 1), 100);
});

test('quick tap: the same seed draws the same round on every device', function () {
  const FF = load();
  ['easy', 'normal', 'hard'].forEach(function (d) {
    FF.Random.seed('room|quickTap|3');
    const a = JSON.stringify(FF.QuickTap.schedule(d, FF._rand));
    FF.Random.seed('room|quickTap|3');
    const b = JSON.stringify(FF.QuickTap.schedule(d, FF._rand));
    assertEqual(a, b, d + ' schedule');
  });
  FF.Random.unseed();
});

test('quick tap: waits stay in range and decoys never crowd the signal', function () {
  const FF = load();
  const QT = FF.QuickTap;
  for (let i = 0; i < 400; i++) {
    const e = QT.schedule('easy', Math.random);
    assert(e.signal >= 2000 && e.signal <= 4000 && e.decoys.length === 0, 'easy ' + e.signal);
    const n = QT.schedule('normal', Math.random);
    assert(n.signal >= 1200 && n.signal <= 5500 && n.decoys.length === 0, 'normal ' + n.signal);
    const h = QT.schedule('hard', Math.random);
    assert(h.decoys.length >= 1 && h.decoys.length <= 2, 'hard has one or two decoys');
    h.decoys.forEach(function (d, k) {
      assert(d.at >= 700, 'decoy not at the very start');
      assert(h.signal - (d.at + QT.DECOY_MS) >= 400, 'a clear gap before the signal');
      if (k) assert(d.at - h.decoys[k - 1].at >= QT.DECOY_MS + 400, 'decoys do not overlap');
    });
    assert(h.signal + QT.MISS_MS < QT.ONLINE_TIMER_MS, 'the room timer outlasts the longest round');
  }
});

test('quick tap: timing is touch minus signal, and stats ignore false starts', function () {
  const QT = load().QuickTap;
  assertEqual(QT.reaction(1000.2, 1213.7), 214);
  assertEqual(QT.reaction(1000, 990), 0);
  const st = QT.stats([210, null, 250, 290]);
  assertEqual(st.best, 210);
  assertEqual(st.avg, 250);
  assertEqual(st.valid, 3);
  assertEqual(QT.meterPct(50), 0);
  assertEqual(QT.meterPct(350), 50);
  assertEqual(QT.meterPct(900), 100);
});

test('quick tap: online uses the ranked race, times the touch and describes rounds', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/games/reactionGames.js'), 'utf8');
  const qt = src.slice(src.indexOf('Game 1: Quick Tap'), src.indexOf('Game 2: Color Reaction'));
  assert(/mode: 'ranked'/.test(qt), 'ranked race mode');
  assert(/addEventListener\('pointerdown'/.test(qt) && !/onclick|onClick: onTap/.test(qt), 'times the touch, not the click');
  assert(/FF\.Race\.describe\(/.test(qt), 'people watching see each round');
  assert(/FF\.Race\.whenOpen\(/.test(qt) && /msSinceOpen\(\)/.test(qt), 'the wait runs from the shared open instant');
  assert(!/<style|\.style\.(color|background)/.test(qt), 'looks live in css/games.css');
});
