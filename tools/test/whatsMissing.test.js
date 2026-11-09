'use strict';
/* What's Missing? (js/whatsmissing/rules.js): settings, the seeded boards, the
   twist plan, answer choices, checks, points and Expert names; and that the game
   is registered everywhere it must be. The referee has its own file. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const RULES = ['js/core.js', 'js/data/memoryDecks.js', 'js/answerMatch.js', 'js/data/memoryAliases.js', 'js/whatsmissing/rules.js'];
let cached = null;
const app = () => cached || (cached = loadFF(RULES));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const LEVELS = ['easy', 'normal', 'hard', 'expert'];
function filled(board) { return board.filter((x) => x != null); }
function unique(list) { return new Set(list).size === list.length; }

/* ---------- settings and the board shape ---------- */

test('wm settings: sanitize falls back to the standard; only rounds stay standard', function () {
  const R = app().WhatsMissingRules;
  assertEqual(JSON.stringify(R.sanitize({ level: 'x', theme: 'mars', seconds: 7 })), JSON.stringify(R.STANDARD));
  assertEqual(JSON.stringify(R.STANDARD), JSON.stringify({ level: 'normal', theme: 'mix', seconds: 5, choices: 6, twists: 'gone', rounds: 8 }));
  assert(!R.isStandard({ twists: 'mix' }), 'all twists is a custom game');
  assert(R.isStandard({ rounds: 5 }), 'rounds are the game length');
  assert(!R.isStandard({ choices: 4 }));
  assert(!R.isStandard({ level: 'endless' }));
  assert(!R.isStandard({ theme: 'sea' }));
  assertEqual(R.sanitize({ seconds: '12', choices: '8' }).seconds, 12);
});

test('wm grid: exactly the tiles a board needs, the last row may be short', function () {
  const R = app().WhatsMissingRules;
  const want = { 3: '3x1', 4: '2x2', 5: '3x2', 6: '3x2', 7: '4x2', 8: '4x2', 9: '3x3', 10: '4x3', 12: '4x3', 13: '4x4', 16: '4x4', 17: '5x4', 20: '5x4', 24: '6x4', 25: '6x5' };
  Object.keys(want).forEach((n) => {
    const g = R.grid(Number(n));
    assertEqual(g.cols + 'x' + g.rows, want[n], 'n=' + n);
    assert(g.cols * g.rows >= Number(n) && g.cols * (g.rows - 1) < Number(n), 'no empty row at n=' + n);
  });
});

test('wm deal: no empty places, except the one spot an Added picture lands in', function () {
  const R = app().WhatsMissingRules;
  let added = 0;
  ['easy', 'normal', 'hard', 'expert'].forEach((level) => {
    for (let k = 0; k < 12; k++) {
      const r = R.deal({ level, twists: 'mix' }, 'e' + k, k);
      const empty = r.before.filter((x) => x == null).length;
      if (r.twist === 'added') { added++; assertEqual(r.slots, r.n + 1, level + ' added slots'); assertEqual(empty, 1, level + ' one free spot'); }
      else { assertEqual(r.slots, r.n, level + ' ' + r.twist + ' slots'); assertEqual(empty, 0, level + ' no empty place'); }
    }
  });
  assert(added > 0, 'some Added rounds were dealt');
  const easy = R.deal({ level: 'easy', twists: 'gone' }, 'x', 0);
  assertEqual(easy.slots + ':' + easy.cols + 'x' + easy.rows, '4:2x2', 'Easy shows just its 4 pictures');
});

test('wm pictures: 4, 6, 8 by level; Expert starts at 10 and grows to 16', function () {
  const R = app().WhatsMissingRules;
  assertEqual([R.picturesAt('easy', 0), R.picturesAt('normal', 5), R.picturesAt('hard', 2)].join(), '4,6,8');
  assertEqual([R.picturesAt('expert', 0), R.picturesAt('expert', 3), R.picturesAt('expert', 9)].join(), '10,13,16');
});

/* ---------- the deal ---------- */

test('wm deal: the same seed deals the same rounds; another seed differs', function () {
  const R = app().WhatsMissingRules;
  const S = R.sanitize({});
  let differs = false;
  for (let k = 0; k < 8; k++) {
    assertEqual(JSON.stringify(R.deal(S, 'abc', k)), JSON.stringify(R.deal(S, 'abc', k)), 'k=' + k);
    if (JSON.stringify(R.deal(S, 'abc', k)) !== JSON.stringify(R.deal(S, 'abd', k))) differs = true;
  }
  assert(differs, 'another seed deals other boards');
});

function checkBoard(R, r, label) {
  assert(r.slots <= r.cols * r.rows && r.slots > r.cols * (r.rows - 1), label + ' slots fill the rows');
  assertEqual(r.before.length, r.slots, label + ' before length');
  assertEqual(r.after.length, r.slots, label + ' after length');
  const b = filled(r.before);
  assertEqual(b.length, r.n, label + ' pictures');
  assert(unique(b), label + ' unique pictures');
  const a = filled(r.after);
  if (r.twist === 'gone') {
    assertEqual(a.length, r.n - 1, label);
    assertEqual(r.after[r.answer.slots[0]], null, label + ' gap');
    assertEqual(r.before[r.answer.slots[0]], r.answer.ids[0], label + ' gap held the answer');
    assertEqual(r.gaps, 1, label);
  } else if (r.twist === 'added') {
    assertEqual(a.length, r.n + 1, label);
    const s = r.answer.slots[0];
    assertEqual(r.before[s], null, label + ' newcomer slot was empty');
    assertEqual(r.after[s], r.answer.ids[0], label);
    assert(b.indexOf(r.answer.ids[0]) === -1, label + ' newcomer is new');
  } else if (r.twist === 'swapped') {
    const [x, y] = r.answer.slots;
    assert(x < y, label + ' slots ascending');
    const diff = [];
    for (let i = 0; i < r.slots; i++) if (r.before[i] !== r.after[i]) diff.push(i);
    assertEqual(diff.join(), x + ',' + y, label + ' only the two differ');
    assertEqual(r.after[x], r.before[y], label);
    assertEqual(r.after[y], r.before[x], label);
  } else if (r.twist === 'several') {
    assert(r.gaps >= 2 && r.gaps <= 3, label + ' gaps');
    assertEqual(a.length, r.n - r.gaps, label);
    assertEqual(r.answer.slots.length, r.gaps, label);
    assertEqual(r.answer.slots.slice().sort((p, q) => p - q).join(), r.answer.slots.join(), label + ' ascending');
    r.answer.slots.forEach((s, i) => { assertEqual(r.after[s], null, label); assertEqual(r.before[s], r.answer.ids[i], label); });
  } else {
    assert(false, label + ' unknown twist ' + r.twist);
  }
}

test('wm deal: every level deals a fair board and a true change', function () {
  const R = app().WhatsMissingRules;
  LEVELS.forEach((level) => {
    const S = R.sanitize({ twists: 'mix', level });
    ['s1', 's2', 's3', 's4', 's5'].forEach((seed) => {
      for (let k = 0; k < 8; k++) {
        const r = R.deal(S, seed, k);
        assertEqual(r.n, R.picturesAt(level, k), level + ' n');
        checkBoard(R, r, level + ' ' + seed + ' k' + k);
      }
    });
  });
});

test('wm twists: round 1 is Gone, never three alike, only allowed ones, Gone only works', function () {
  const R = app().WhatsMissingRules;
  for (let i = 0; i < 200; i++) {
    LEVELS.forEach((level) => {
      const S = R.sanitize({ twists: 'mix', level });
      const plan = R.twistPlan(S, 'seed' + i, 12);
      assertEqual(plan[0], 'gone');
      for (let k = 2; k < plan.length; k++) assert(!(plan[k] === plan[k - 1] && plan[k] === plan[k - 2]), 'no triple at ' + k);
      plan.forEach((t, k) => assert(R.twistsAllowed(level, R.picturesAt(level, k)).indexOf(t) !== -1, level + ' allows ' + t));
    });
  }
  assertEqual(R.twistPlan(R.sanitize({ twists: 'gone', level: 'hard' }), 'x', 10).filter((t) => t !== 'gone').length, 0);
  assertEqual(R.twistsAllowed('easy', 4).join(), 'gone,added');
  assertEqual(R.twistsAllowed('normal', 6).join(), 'gone,added,swapped');
  assertEqual(R.twistsAllowed('hard', 8).join(), 'gone,added,swapped,several');
  const gapsHard = new Set(), gapsExpert = new Set();
  for (let i = 0; i < 60; i++) {
    for (let k = 0; k < 8; k++) {
      const h = R.deal(R.sanitize({ twists: 'mix', level: 'hard' }), 'g' + i, k);
      if (h.twist === 'several') gapsHard.add(h.gaps);
      const e = R.deal(R.sanitize({ twists: 'mix', level: 'expert' }), 'g' + i, k);
      if (e.twist === 'several') gapsExpert.add(e.gaps);
    }
  }
  assertEqual(Array.from(gapsHard).join(), '2');
  assertEqual(Array.from(gapsExpert).sort().join(), '2,3');
});

test('wm choices: the setting count, every answer in, nothing else from the board, same decks', function () {
  const FF = app();
  const R = FF.WhatsMissingRules;
  [4, 6, 8].forEach((choices) => {
    LEVELS.filter((l) => l !== 'expert').forEach((level) => {
      for (let i = 0; i < 20; i++) {
        for (let k = 0; k < 8; k++) {
          const r = R.deal(R.sanitize({ twists: 'mix', level, choices }), 'c' + i, k);
          if (r.twist !== 'gone' && r.twist !== 'several') { assertEqual(r.choices, null); continue; }
          assertEqual(r.choices.length, choices, 'count');
          assert(unique(r.choices), 'no repeats');
          r.answer.ids.forEach((id) => assert(r.choices.indexOf(id) !== -1, 'answer listed'));
          r.choices.forEach((id) => {
            if (r.answer.ids.indexOf(id) !== -1) return;
            assert(r.before.indexOf(id) === -1, 'a decoy is never a board picture');
            const decks = filled(r.before).map((x) => R.cardOf(x).deck);
            assert(decks.indexOf(R.cardOf(id).deck) !== -1, 'decoys share a deck with the board');
          });
        }
      }
    });
  });
});

test('wm theme: one deck only, and a small theme still deals Expert and Endless boards', function () {
  const R = app().WhatsMissingRules;
  for (let k = 0; k < 8; k++) filled(R.deal(R.sanitize({ theme: 'sea' }), 't', k).before).forEach((id) => assertEqual(R.cardOf(id).deck, 'sea'));
  for (let k = 0; k <= 12; k++) {
    const r = R.deal(R.sanitize({ twists: 'mix', level: 'expert', theme: 'sea', choices: 8 }), 'tiny', k);
    checkBoard(R, r, 'expert sea k' + k);
    if (r.choices) { assertEqual(r.choices.length, 8); assert(unique(r.choices)); }
  }
  for (let k = 0; k < 10; k++) {
    const r = R.deal(R.sanitize({ twists: 'mix', level: 'endless', theme: 'sea', choices: 8 }), 'big', k, { n: 24, prev: [] });
    checkBoard(R, r, 'endless sea k' + k);
    if (r.choices) assertEqual(r.choices.length, 8);
  }
});

test('wm expert: only spellable pictures on the board, and gaps are spelled', function () {
  const R = app().WhatsMissingRules;
  for (let i = 0; i < 20; i++) {
    for (let k = 0; k < 8; k++) {
      const r = R.deal(R.sanitize({ twists: 'mix', level: 'expert' }), 'e' + i, k);
      filled(r.before).concat(filled(r.after)).forEach((id) => assert(R.spellable(R.cardOf(id).name), id + ' spellable'));
      assertEqual(r.spell, r.twist === 'gone' || r.twist === 'several', 'spell on gaps only');
      if (r.spell) assertEqual(r.choices, null);
    }
  }
  assert(R.spellable('Hot dog') && R.spellable('Sea-urchin') && !R.spellable('X') && !R.spellable('A very long picture name'));
});

test('wm secs: 20 seconds, +6 on Expert, +5 for each extra gap', function () {
  const R = app().WhatsMissingRules;
  for (let k = 0; k < 8; k++) {
    const r = R.deal(R.sanitize({ twists: 'mix', level: 'hard' }), 'z', k);
    assertEqual(r.secs, 20 + 5 * (r.gaps - 1));
    const e = R.deal(R.sanitize({ twists: 'mix', level: 'expert' }), 'z', k);
    assertEqual(e.secs, 26 + 5 * (e.gaps - 1));
  }
});

/* ---------- checks, points and Expert names ---------- */

/* The first round of a seed with the wanted twist. */
function findRound(R, settings, twist, gaps) {
  for (let i = 0; i < 400; i++) {
    for (let k = 0; k < 10; k++) {
      const r = R.deal(R.sanitize(Object.assign({ twists: 'mix' }, settings)), 'f' + i, k);
      if (r.twist === twist && (!gaps || r.gaps === gaps)) return r;
    }
  }
  throw new Error('no ' + twist + ' round found');
}
function wrongPick(r) { return r.choices.filter((id) => r.answer.ids.indexOf(id) === -1)[0]; }

test('wm check: Gone takes the right pick; Added takes the newcomer slot only', function () {
  const R = app().WhatsMissingRules;
  const g = findRound(R, { level: 'normal' }, 'gone');
  assert(R.check(g, { picks: g.answer.ids }).ok);
  const bad = R.check(g, { picks: [wrongPick(g)] });
  assert(!bad.ok && bad.rightGaps === 0);
  const a = findRound(R, { level: 'normal' }, 'added');
  assert(R.check(a, { slots: a.answer.slots }).ok);
  const other = a.after.findIndex((id, s) => id != null && s !== a.answer.slots[0]);
  assert(!R.check(a, { slots: [other] }).ok, 'another picture');
  const blank = a.after.indexOf(null);
  assert(!R.check(a, { slots: [blank] }).ok, 'an empty slot');
});

test('wm check: Swapped in either order; anything else is wrong and never throws', function () {
  const R = app().WhatsMissingRules;
  const r = findRound(R, { level: 'normal' }, 'swapped');
  const [a, b] = r.answer.slots;
  assert(R.check(r, { slots: [a, b] }).ok);
  assert(R.check(r, { slots: [b, a] }).ok);
  const c = r.after.findIndex((id, s) => id != null && s !== a && s !== b);
  const half = R.check(r, { slots: [a, c] });
  assert(!half.ok && half.rightGaps === 0, 'all or nothing');
  [[a, a], [a, 99], [], [-1, a], null].forEach((slots) => {
    const res = R.check(r, { slots });
    assert(!res.ok, 'not ok: ' + JSON.stringify(slots));
  });
  assert(!R.check(r, null).ok, 'no answer at all');
});

test('wm check: Several gone scores each gap; missing gaps are wrong', function () {
  const R = app().WhatsMissingRules;
  const r = findRound(R, { level: 'expert', theme: 'mix' }, 'several', 3);
  const r6 = findRound(R, { level: 'hard', choices: 6 }, 'several', 2);
  assert(R.check(r6, { picks: r6.answer.ids }).ok);
  const ids = r.answer.ids;
  const names = ids.map((id) => R.cardOf(id).name);
  const two = R.check(r, { text: [names[0], names[1], 'zzzz'] });
  assertEqual(JSON.stringify(two.right), '[true,true,false]');
  assertEqual(two.rightGaps, 2);
  assert(!two.ok);
  const short = R.check(r, { text: [names[0]] });
  assertEqual(JSON.stringify(short.right), '[true,false,false]');
  assertEqual(short.rightGaps, 1);
  const swappedOrder = R.check(r6, { picks: [r6.answer.ids[1], r6.answer.ids[0]] });
  assertEqual(swappedOrder.rightGaps, 0, 'each gap has its own picture');
});

test('wm check: Expert names forgive spaces, other names and small mistakes', function () {
  const R = app().WhatsMissingRules;
  assert(R.checkName('hotdog', 'hot-dog').ok);
  assert(R.checkName('Ice-Cream', 'ice-cream').ok);
  assert(R.checkName('dougnut', 'donut').ok, 'Doughnut with a slip');
  assert(R.checkName('Aeroplane', 'airplane').ok);
  assert(R.checkName('Football', 'soccer-ball').ok);
  assert(!R.checkName('cat', 'dog').ok);
  assert(!R.checkName('car', 'cat').ok, 'another picture never counts');
  assert(!R.checkName('', 'cat').ok);
});

test('wm aliases: every alias is a known card, unique, and never another card\'s name', function () {
  const FF = app();
  const R = FF.WhatsMissingRules;
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const own = {};
  R.cards().forEach((c) => { own[norm(c.name)] = c.id; });
  const seen = {};
  Object.keys(FF.data.memoryAliases).forEach((id) => {
    assert(R.cardOf(id), id + ' is a card');
    FF.data.memoryAliases[id].forEach((name) => {
      const n = norm(name);
      assert(!own[n] || own[n] === id, name + ' is another card\'s name');
      assert(!seen[n] || seen[n] === id, name + ' belongs to two cards');
      seen[n] = id;
    });
  });
  assert(Object.keys(FF.data.memoryAliases).length >= 10, 'a useful list');
});

test('wm points: base, speed, streaks, partial gaps and the Expert bonus', function () {
  const R = app().WhatsMissingRules;
  const gone = findRound(R, { level: 'normal' }, 'gone');
  const sw = findRound(R, { level: 'normal' }, 'swapped');
  const sev = findRound(R, { level: 'expert' }, 'several', 3);
  const eg = findRound(R, { level: 'expert' }, 'gone');
  const ok1 = { ok: true, right: [true], rightGaps: 1 };
  assertEqual(R.points({ round: gone, res: ok1, ms: 0, secs: 20, streak: 1 }).total, 150);
  assertEqual(R.points({ round: gone, res: ok1, ms: 20000, secs: 20, streak: 1 }).total, 100);
  assertEqual(R.points({ round: gone, res: ok1, ms: 10000, secs: 20, streak: 1 }).total, 125);
  assertEqual(R.points({ round: sw, res: { ok: true, right: [true, true], rightGaps: 2 }, ms: 0, secs: 20, streak: 3 }).total, 240);
  const part = R.points({ round: findRound(R, { level: 'hard' }, 'several', 2), res: { ok: false, right: [true, false], rightGaps: 1 }, ms: 0, secs: 25, streak: 0 });
  assertEqual(JSON.stringify([part.base, part.speed, part.mult, part.total]), '[100,0,1,100]');
  const sevPart = R.points({ round: sev, res: { ok: false, right: [true, true, false], rightGaps: 2 }, ms: 0, secs: 36, streak: 0 });
  assertEqual(JSON.stringify([sevPart.base, sevPart.bonus, sevPart.total]), '[200,100,300]', 'Expert bonus per right gap');
  assertEqual(R.points({ round: eg, res: ok1, ms: 0, secs: 26, streak: 5 }).total, 300);
  assertEqual(R.points({ round: gone, res: { ok: false, right: [false], rightGaps: 0 }, ms: 0, secs: 20, streak: 0 }).total, 0);
  assertEqual([R.streakMult(1), R.streakMult(3), R.streakMult(4), R.streakMult(5), R.streakMult(9)].join(), '1,1.2,1.2,1.5,1.5');
});

test('wm deal: pass and play grows Expert boards by lap (opts.step), each turn its own board', function () {
  const R = app().WhatsMissingRules;
  const S = R.sanitize({ twists: 'mix', level: 'expert' });
  assertEqual(R.deal(S, 'p', 5, { step: 0 }).n, 10);
  assertEqual(R.deal(S, 'p', 5, { step: 2 }).n, 12);
  assert(JSON.stringify(R.deal(S, 'p', 4, { step: 2 }).before) !== JSON.stringify(R.deal(S, 'p', 5, { step: 2 }).before), 'another turn, another board');
});

/* ---------- registration ---------- */

test('wm registered: its own file, listed everywhere, the old emoji game gone', function () {
  assert(/id:\s*'whatsMissing'/.test(read('js/games/whatsMissing.js')), 'registered in whatsMissing.js');
  assert(!/id:\s*'whatsMissing'/.test(read('js/games/memoryGames.js')), 'no longer in memoryGames.js');
  assert(/leaderboard:\s*true/.test(read('js/games/whatsMissing.js')), 'on the leaderboards');
  assert(/'whatsMissing'/.test(read('js/net/roomUI.js')), 'listed in ONLINE_GAMES');
  assert(/'whatsMissing'/.test(read('api/lib/Crew.php')), 'the crew list');
  assert(/'whatsMissing'/.test(read('api/lib/Leaderboards.php')), 'the server leaderboard list');
  assert(/"whatsMissing"/.test(read('js/icons.js')), 'has an icon');
  assert(/"whatsMissing"/.test(read('js/data/assetManifest.js')), 'has a cover');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach((f) => {
    const s = read(f);
    ['js/data/memoryAliases.js', 'js/whatsmissing/rules.js', 'js/games/whatsMissing.js'].forEach((js) => {
      assert(s.indexOf(js) !== -1, f + ' loads ' + js);
    });
    assert(s.indexOf('js/whatsmissing/rules.js') < s.indexOf('js/games/whatsMissing.js'), f + ': rules before the game');
  });
});

test('wm endless: boards grow from 3 to 24, twists unlock with size, never three alike', function () {
  const R = app().WhatsMissingRules;
  ['mix', 'animals'].forEach((theme) => {
    for (let s = 0; s < 15; s++) {
      const S = R.sanitize({ twists: 'mix', level: 'endless', theme });
      const prev = [];
      for (let k = 0, n = 3; n <= 24; k++, n++) {
        const r = R.deal(S, 'run' + s, k, { n, prev: prev.slice() });
        assertEqual(r.n, Math.min(n, theme === 'mix' ? 24 : 23), 'board size ' + n);
        checkBoard(R, r, theme + ' endless n' + n);
        assert(R.twistsAllowed('endless', r.n).indexOf(r.twist) !== -1, r.twist + ' allowed at ' + r.n);
        if (k === 0) assertEqual(r.twist, 'gone');
        if (prev.length >= 2) assert(!(prev[prev.length - 1] === r.twist && prev[prev.length - 2] === r.twist), 'no triple');
        assertEqual(r.spell, false, 'Endless never spells');
        prev.push(r.twist);
      }
    }
  });
  assertEqual(R.twistsAllowed('endless', 5).join(), 'gone,added');
  assertEqual(R.twistsAllowed('endless', 7).join(), 'gone,added,swapped');
  assertEqual(R.twistsAllowed('endless', 8).join(), 'gone,added,swapped,several');
});
