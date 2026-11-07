'use strict';
/* Remember the Sequence (js/games/sequence.js): settings, the shared deal,
   the twists, scoring, pad faces, and its place in rooms and on
   leaderboards. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function load() {
  const FF = loadFF(['js/core.js', 'js/data/memoryDecks.js']);
  FF.__defs = [];
  FF.registerGame = function (def) { FF.__defs.push(def); };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/sequence.js'), 'utf8'), FF.__sandbox, { filename: 'sequence.js' });
  return FF;
}

function seeded(FF, seed, fn) {
  FF.Random.seed(seed);
  try { return fn(FF._rand); } finally { FF.Random.unseed(); }
}

test('sequence: settings keep to the offered values', function () {
  const S = load().Sequence;
  assertEqual(JSON.stringify(S.sanitize({})), JSON.stringify(S.STANDARD));
  const s = S.sanitize({ set: 'smells', twist: 'backwards', pads: '9', lives: 7, play: 'addone' });
  assertEqual(s.set, 'colours', 'unknown set falls back');
  assertEqual(s.twist, 'backwards');
  assertEqual(s.pads, 9, 'a string number is read');
  assertEqual(s.lives, 1);
  assertEqual(s.play, 'addone');
  assertEqual(S.sanitize({ difficulty: 'easy' }).pads, 4);
  assertEqual(S.sanitize({ difficulty: 'hard' }).pads, 9);
  assert(S.isStandard({}), 'defaults are standard');
  assertEqual(S.STANDARD.twist, 'fresh', 'a new sequence each round is the standard');
  assert(!S.isStandard({ set: 'pictures' }), 'another set is not standard');
  assert(!S.isStandard({ lives: 3 }), 'extra lives are not standard');
});

test('sequence: deals stay on the board and never repeat a pad three times', function () {
  const FF = load();
  const S = FF.Sequence;
  [4, 6, 9].forEach(function (pads) {
    for (let k = 0; k < 40; k++) {
      const d = S.deal(30, pads, Math.random);
      assertEqual(d.length, 30);
      d.forEach(function (v, i) {
        assert(v >= 0 && v < pads, 'pad in range');
        if (i >= 2) assert(!(d[i - 1] === v && d[i - 2] === v), 'no triple');
      });
    }
  });
});

test('sequence: Grow keeps the sequence and adds one; Fresh deals anew', function () {
  const FF = load();
  const S = FF.Sequence;
  const grow = S.script(S.sanitize({ twist: 'grow' }), Math.random);
  assertEqual(grow[0].seq.length, S.START_LEN);
  assertEqual(grow[grow.length - 1].seq.length, S.SOLO_MAX_LEN);
  for (let r = 1; r < grow.length; r++) {
    assertEqual(grow[r].seq.length, grow[r - 1].seq.length + 1, 'one longer');
    assertEqual(grow[r].seq.slice(0, -1).join(','), grow[r - 1].seq.join(','), 'same start');
    assertEqual(grow[r].perm, null, 'no shuffle');
  }
  const fresh = seeded(FF, 'x', function (r) { return S.script(S.sanitize({ twist: 'fresh' }), r); });
  const differs = fresh.slice(1).some(function (rd, i) { return rd.seq.slice(0, -1).join(',') !== fresh[i].seq.join(','); });
  assert(differs, 'fresh rounds are not one sequence growing');
});

test('sequence: Backwards asks for the reverse; Shuffle moves the pads', function () {
  const FF = load();
  const S = FF.Sequence;
  assertEqual(S.expected([1, 2, 3], 'backwards').join(','), '3,2,1');
  assertEqual(S.expected([1, 2, 3], 'grow').join(','), '1,2,3');
  const rounds = S.script(S.sanitize({ twist: 'shuffle', pads: 4 }), Math.random);
  rounds.forEach(function (rd) {
    assertEqual(rd.perm.slice().sort().join(','), '0,1,2,3', 'every pad once');
    assert(rd.perm.some(function (v, i) { return v !== i; }), 'something moves');
  });
  const slow = S.timing('grow', 10);
  const fast = S.timing('speedup', 10);
  assert(fast.on < slow.on && fast.gap < slow.gap, 'Speed up gets faster');
  assert(S.timing('speedup', 100).on >= 170, 'but never too fast to see');
});

test('sequence: the same seed deals the same game on every phone', function () {
  [{}, { set: 'pictures', twist: 'shuffle', pads: 9 }, { twist: 'fresh', pads: 4 }].forEach(function (s) {
    function deal(FF) {
      const S = FF.Sequence;
      const cfg = S.sanitize(s);
      return JSON.stringify(seeded(FF, 'room|rememberSequence|2', function (r) {
        return { faces: S.faces(cfg, r).map(function (f) { return f.id; }), rounds: S.script(cfg, r) };
      }));
    }
    assertEqual(deal(load()), deal(load()), JSON.stringify(s));
  });
});

test('sequence: every set gives one distinct pad face per pad', function () {
  const FF = load();
  const S = FF.Sequence;
  S.SETS.forEach(function (set) {
    S.PADS.forEach(function (pads) {
      const f = S.faces(S.sanitize({ set: set, pads: pads }), Math.random);
      assertEqual(f.length, pads, set + ' ' + pads);
      const ids = f.map(function (x) { return x.id; });
      assertEqual(new Set(ids).size, pads, set + ' faces are distinct');
      f.forEach(function (x) { assert(x.name, 'every pad has a name for screen readers'); });
    });
  });
  const pics = S.faces(S.sanitize({ set: 'pictures', pads: 9 }), Math.random);
  assert(pics.deckName, 'pictures name their deck');
  const deck = FF.MemoryDecks.filter(function (d) { return d.cards.some(function (c) { return c[0] === pics[0].id; }); })[0];
  assert(pics.every(function (p) { return deck.cards.some(function (c) { return c[0] === p.id; }); }), 'all from one deck');
  const cols = S.faces(S.sanitize({ pads: 4 }), Math.random).map(function (x) { return x.id; });
  assertEqual(cols.join(','), 'red,blue,green,yellow', 'the classic four');
});

test('sequence: longer and quicker sequences score more', function () {
  const S = load().Sequence;
  assert(S.roundPoints(8, 4000, 1) > S.roundPoints(5, 4000, 1), 'longer');
  assert(S.roundPoints(6, 1000, 1) > S.roundPoints(6, 8000, 1), 'quicker');
  assertEqual(S.roundPoints(5, null, 2), 100, 'difficulty bonus');
  assertEqual(S.rsLength(S.ONLINE_START, 0), 4);
  assertEqual(S.rsLength(S.ONLINE_START, 50), S.RS_MAX_LEN);
});

test('sequence: settings rows for solo, pass and play and the lobby', function () {
  const S = load().Sequence;
  function keys(gs, opts) { return S.fields(gs, opts).filter(function (f) { return f.key; }).map(function (f) { return f.key; }).join(','); }
  assertEqual(keys({}, {}), 'set,twist,pads,lives');
  assertEqual(keys({}, { multi: true }), 'play,set,twist,pads,lives');
  assertEqual(keys({ play: 'addone' }, { multi: true }), 'play,set,pads', 'Add one has no twist or lives');
  assertEqual(keys({ play: 'addone' }, { room: true }), 'set,twist,pads', 'the lobby never offers Add one');
  assert(S.fields({}, {}).some(function (f) { return f.note; }), 'explains the twist');
});

test('sequence: registers for solo, pass and play and rooms', function () {
  const FF = load();
  const def = FF.__defs.filter(function (d) { return d.id === 'rememberSequence'; })[0];
  assert(def, 'registered');
  assertEqual(def.category, 'memory');
  assert(def.modes.indexOf('solo') !== -1 && def.modes.indexOf('turn') !== -1, 'solo and pass and play');
  assert(def.room && def.room.fields && def.room.sanitize && def.room.summary, 'lobby settings');
  assert(!def.room.start, 'rooms start it like any shared game');
  assert(/·/.test(def.room.summary({ set: 'shapes' })), 'summary');
  const ui = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  assert(/'rememberSequence'/.test(ui), 'listed in ONLINE_GAMES');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach(function (f) {
    assert(fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('js/games/sequence.js') !== -1, f + ' loads the game');
  });
  const mem = fs.readFileSync(path.join(ROOT, 'js/games/memoryGames.js'), 'utf8');
  assert(mem.indexOf("id: 'rememberSequence'") === -1, 'registered once, not also in memoryGames.js');
});

test('sequence: every pad has its own note', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
  const notes = /NOTES: \[([^\]]*)\]/.exec(src);
  assert(notes, 'a scale');
  const list = notes[1].split(',').map(Number);
  assert(list.length >= 9, 'enough for nine pads');
  assertEqual(new Set(list).size, list.length, 'all different');
  assert(/note: function \(i, dur\)/.test(src), 'FF.Audio.note');
});
