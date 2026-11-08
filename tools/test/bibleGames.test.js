'use strict';
/* Who Am I?, Verse Rush and Books of the Bible (js/games/bibleGames.js,
   js/data/bible.js): the content is well formed and in KJV wording, settings
   keep to what is offered, deals are fair and repeatable from a seed, room
   points are unchanged, and a daily run plays a round headless. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const BASE = ['js/core.js', 'js/i18n.js', 'js/icons.js', 'js/ui-kit.js', 'js/gameUI.js', 'js/gameLength.js', 'js/data/bible.js'];

function load() {
  const FF = loadFF(BASE);
  FF.__defs = {};
  FF.registerGame = function (def) { FF.__defs[def.id] = def; };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/games/bibleGames.js'), 'utf8'), FF.__sandbox, { filename: 'bibleGames.js' });
  return FF;
}

const FF = load();
const G = FF.BibleGames;
const DATA = FF.data.bible;
const WHO = DATA.whoAmI;
const VERSES = DATA.verses;
const BOOKS = DATA.books;
const SRC = fs.readFileSync(path.join(ROOT, 'js/games/bibleGames.js'), 'utf8');

function plainApostrophes(s) { return /'/.test(s); }

/* ---------------- content ---------------- */

test('who am I: about 60 people, four clues each, a level and a KJV verse', function () {
  assert(WHO.length >= 60, 'about 60 people (' + WHO.length + ')');
  assertEqual(new Set(WHO.map(function (x) { return x.answer; })).size, WHO.length, 'every name is unique');
  assertEqual(new Set(WHO.map(function (x) { return x.id; })).size, WHO.length, 'every id is unique');
  WHO.forEach(function (x) {
    assert(G.LEVELS.indexOf(x.level) !== -1, x.answer + ' has a level');
    assert(x.testament === 'OT' || x.testament === 'NT', x.answer + ' has a testament');
    assert(x.gender === 'm' || x.gender === 'f', x.answer + ' is a man or a woman');
    assertEqual(x.clues.length, 4, x.answer + ' has four clues');
    x.clues.forEach(function (c) {
      assert(c.length > 10 && /[.?!]$/.test(c), x.answer + ' clue is a sentence: ' + c);
      assert(c.indexOf(x.answer) === -1, x.answer + ' is not named in a clue');
    });
    assert(/\d/.test(x.story), x.answer + ' says where the story is');
    assert(/^[1-3]? ?[A-Z][a-z]+( [A-Za-z]+)* \d+:\d/.test(x.ref), x.answer + ' verse has a reference: ' + x.ref);
    assert(x.verse && x.verse.length > 10, x.answer + ' has a verse');
    assert(!plainApostrophes(x.clues.join('') + x.verse + x.story), x.answer + ' uses typographic apostrophes');
  });
  ['kids', 'family', 'scholar'].forEach(function (l) {
    assert(WHO.filter(function (x) { return x.level === l; }).length >= 12, 'plenty of ' + l + ' people');
  });
  assert(WHO.filter(function (x) { return x.gender === 'f'; }).length >= 15, 'plenty of women');
});

test('verse rush: about 60 well-known verses, word for word, each with a real reference', function () {
  assert(VERSES.length >= 60, 'about 60 verses (' + VERSES.length + ')');
  assertEqual(new Set(VERSES.map(function (v) { return v.reference; })).size, VERSES.length, 'every reference is unique');
  const names = new Set(BOOKS.map(function (b) { return b.name; }));
  VERSES.forEach(function (v) {
    const book = v.reference.replace(/\s+\d+:[\d\-,]+$/, '').replace(/^Psalm$/, 'Psalms');
    assert(names.has(book), v.reference + ' names a book of the Bible');
    assert(/\d+:\d+(-\d+)?$/.test(v.reference), v.reference + ' has chapter and verse');
    assertEqual(v.testament, BOOKS.filter(function (b) { return b.name === book; })[0].testament, v.reference + ' testament');
    assert(v.text.indexOf(v.part) !== -1, v.reference + ': the part to build is in the verse');
    assert(v.part.split(/\s+/).length >= 6, v.reference + ': the part to build is a long phrase');
    assert(!plainApostrophes(v.text), v.reference + ' uses typographic apostrophes');
    // KJV, not a modern translation.
    assert(!/\b(you'?re|don’t|won’t|can’t|everyone who|Holy Spirit)\b/.test(v.text), v.reference + ' reads as the KJV');
  });
  ['kids', 'family', 'scholar'].forEach(function (l) {
    assert(VERSES.filter(function (v) { return v.level === l; }).length >= 15, 'plenty of ' + l + ' verses');
  });
  const john = VERSES.filter(function (v) { return v.reference === 'John 3:16'; })[0];
  assertEqual(john.text, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.');
});

test('books: all 66 in order, with their parts, chapters and a key verse', function () {
  assertEqual(BOOKS.length, 66);
  BOOKS.forEach(function (b, i) {
    assertEqual(b.order, i + 1, b.name + ' is in its place');
    assert(DATA.divisions.some(function (d) { return d.id === b.divisionId && d.testament === b.testament; }), b.name + ' has a part of its own testament');
    assert(b.chapters > 0, b.name + ' has chapters');
    assert(b.about && /[.!?]$/.test(b.about), b.name + ' says what it is about');
    assert(/\d+:\d/.test(b.ref) && b.verse.length > 5, b.name + ' has a key verse');
    assert(G.LEVELS.indexOf(b.level) !== -1, b.name + ' has a level');
    assert(!plainApostrophes(b.about + b.verse), b.name + ' uses typographic apostrophes');
  });
  assertEqual(BOOKS.filter(function (b) { return b.testament === 'OT'; }).length, 39, '39 in the Old Testament');
  assertEqual(BOOKS.reduce(function (s, b) { return s + b.chapters; }, 0), 1189, '1,189 chapters in all');
  assertEqual(BOOKS[0].name + '|' + BOOKS[38].name + '|' + BOOKS[39].name + '|' + BOOKS[65].name, 'Genesis|Malachi|Matthew|Revelation');
  assert(G.books.pool(BOOKS, 'kids').length >= 15, 'kids have enough books');
  assertEqual(G.books.pool(BOOKS, 'scholar').length, 66, 'scholars play all 66');
});

/* ---------------- settings ---------------- */

test('settings keep to the offered values and know the standard', function () {
  assertEqual(JSON.stringify(G.who.sanitize({})), JSON.stringify(G.who.STANDARD));
  assertEqual(JSON.stringify(G.who.sanitize({ level: 'master', testament: 'apocrypha', pace: 'fast' })), JSON.stringify(G.who.STANDARD));
  assert(!G.who.isStandard({ pace: 'tap' }) && !G.who.isStandard({ testament: 'NT' }) && G.who.isStandard({ level: 'family' }));
  assertEqual(G.verse.sanitize({ kinds: ['where', 'nope'] }).kinds, ['where']);
  assertEqual(G.verse.sanitize({ kinds: ['where', 'build'] }).kinds, [], 'every kind is the same as all');
  assert(G.verse.isStandard({}) && !G.verse.isStandard({ kinds: ['build'] }) && !G.verse.isStandard({ level: 'kids' }));
  assertEqual(G.books.sanitize({ kinds: ['order', 'testament'] }).kinds, ['testament', 'order'], 'kinds in their own order');
  assert(G.books.isStandard({ kinds: G.books.KINDS.slice() }) && !G.books.isStandard({ level: 'scholar' }));
  // Every level and testament still has enough people to play.
  ['kids', 'family', 'scholar'].forEach(function (level) {
    ['all', 'OT', 'NT'].forEach(function (testament) {
      const pool = G.who.pool(WHO, { level: level, testament: testament });
      assert(pool.length >= 10, level + '/' + testament + ' has people (' + pool.length + ')');
      assert(pool.every(function (x) { return testament === 'all' || x.testament === testament; }), 'keeps to the testament');
    });
    assert(G.verse.pool(VERSES, { level: level }).length >= 12, level + ' has verses');
  });
  assert(G.who.pool(WHO, { level: 'kids' }).every(function (x) { return x.level === 'kids'; }), 'kids meet kids-level people');
  assert(G.who.pool(WHO, { level: 'scholar' }).every(function (x) { return x.level !== 'kids'; }), 'scholars skip the kids ones');
});

/* ---------------- deals ---------------- */

test('who am I: a seed deals the same people and names; the names are fair', function () {
  const a = G.who.deal(WHO, G.who.STANDARD, G.rng(42), 6);
  assertEqual(JSON.stringify(a), JSON.stringify(G.who.deal(WHO, G.who.STANDARD, G.rng(42), 6)), 'same seed, same deal');
  assert(JSON.stringify(a) !== JSON.stringify(G.who.deal(WHO, G.who.STANDARD, G.rng(43), 6)), 'another seed deals differently');
  assertEqual(new Set(a.map(function (x) { return x.answer; })).size, 6, 'no repeats in a game');
  let first = 0;
  let total = 0;
  for (let seed = 1; seed <= 30; seed++) {
    G.who.deal(WHO, { level: seed % 3 === 0 ? 'scholar' : 'family' }, G.rng(seed), 6).forEach(function (x) {
      total++;
      assertEqual(x.choices.length, 4, 'four names');
      assertEqual(new Set(x.choices).size, 4, 'four different names');
      assert(x.choices.indexOf(x.answer) !== -1, 'the answer is offered');
      if (x.choices[0] === x.answer) first++;
      const clues = x.clues.join(' ');
      x.choices.forEach(function (name) {
        if (name !== x.answer) assert(clues.indexOf(name) === -1, x.answer + ': ' + name + ' is named in the clues');
      });
      const people = x.choices.map(function (n) { return WHO.filter(function (w) { return w.answer === n; })[0]; });
      assert(people.every(function (p) { return p.gender === people[0].gender; }), x.answer + ': names of the same sort (' + x.choices.join(', ') + ')');
      assert(people.every(function (p) { return p.testament === x.testament; }), x.answer + ': the testament does not give it away (' + x.choices.join(', ') + ')');
    });
  }
  assert(first / total < 0.45, 'the answer is not always first (' + first + '/' + total + ')');
});

test('who am I: what this phone has seen is skipped while enough are fresh', function () {
  const pool = G.who.pool(WHO, G.who.STANDARD);
  const seen = {};
  pool.slice(0, pool.length - 8).forEach(function (x) { seen[x.id] = true; });
  assert(G.who.deal(WHO, G.who.STANDARD, G.rng(5), 6, seen).every(function (x) { return !seen[x.id]; }), 'only fresh people');
});

test('verse rush: pieces rebuild the whole verse and never start in order', function () {
  VERSES.forEach(function (v) {
    ['kids', 'family', 'scholar'].forEach(function (level) {
      const max = G.verse.MAX_TILES[level];
      const pieces = G.verse.tiles(v.part, max);
      assertEqual(pieces.join(' '), v.part.trim().split(/\s+/).join(' '), v.reference + ': nothing is cut off');
      assert(pieces.length <= max && pieces.length >= Math.min(max, v.part.split(/\s+/).length), v.reference + ' (' + level + '): ' + pieces.length + ' pieces');
      assert(pieces.every(function (p) { return p.length; }), 'no empty pieces');
    });
  });
  assertEqual(G.verse.tiles('Jesus Christ the same yesterday', 8), ['Jesus', 'Christ', 'the', 'same', 'yesterday'], 'a short verse is one word a piece');
  const long = G.verse.tiles('For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', 6);
  assert(long.filter(function (p) { return /[,.]$/.test(p); }).length >= 3, 'long verses break after commas: ' + long.join(' | '));
  for (let seed = 1; seed <= 20; seed++) {
    G.verse.deal(VERSES, { kinds: ['build'] }, G.rng(seed), 6).forEach(function (q) {
      assertEqual(q.pool.slice().sort().join('|'), q.tiles.slice().sort().join('|'), 'the pool holds every piece');
      assert(!G.verse.isRightBuild(q, q.pool), q.ref + ': pieces never start in order');
      assert(G.verse.isRightBuild(q, q.tiles), 'the pieces in order are right');
      assert(q.text.indexOf(q.before + (q.before ? ' ' : '') + q.part) === 0 || (!q.before && q.text.indexOf(q.part) === 0), q.ref + ': the words before and the part make up the verse');
    });
  }
  const q = G.verse.deal(VERSES, { kinds: ['build'] }, G.rng(9), 1)[0];
  assertEqual(G.verse.rightSoFar(q, q.tiles.slice(0, 2).concat(['nope'])), 2, 'counts the right start');
});

test('verse rush: a seed deals the same rounds; where is it offers four books', function () {
  const a = G.verse.deal(VERSES, G.verse.STANDARD, G.rng(77), 6);
  assertEqual(JSON.stringify(a), JSON.stringify(G.verse.deal(VERSES, G.verse.STANDARD, G.rng(77), 6)), 'same seed, same deal');
  assertEqual(a.map(function (q) { return q.kind; }), ['build', 'build', 'where', 'build', 'build', 'where'], 'every third verse asks where it is');
  assert(G.verse.deal(VERSES, G.verse.STANDARD, G.rng(77), 6, null, true).every(function (q) { return q.kind === 'build'; }), 'rooms only build');
  assert(G.verse.deal(VERSES, { kinds: ['where'] }, G.rng(1), 5).every(function (q) { return q.kind === 'where'; }), 'where only');
  for (let seed = 1; seed <= 20; seed++) {
    G.verse.deal(VERSES, { kinds: ['where'], level: seed % 2 ? 'scholar' : 'kids' }, G.rng(seed), 6).forEach(function (q) {
      assertEqual(q.options.length, 4);
      assertEqual(q.options[q.answer], q.ref, 'the answer index points at the reference');
      const books = q.options.map(function (r) { return r.replace(/\s+\d+:[\d\-,]+$/, ''); });
      assertEqual(new Set(books).size, 4, q.ref + ': four different books');
    });
  }
});

test('books: a seed deals the same rounds, the kinds take turns, every answer is right', function () {
  const a = G.books.deal(BOOKS, DATA.divisions, G.books.STANDARD, G.rng(11), 12);
  assertEqual(JSON.stringify(a), JSON.stringify(G.books.deal(BOOKS, DATA.divisions, G.books.STANDARD, G.rng(11), 12)), 'same seed, same deal');
  assert(JSON.stringify(a) !== JSON.stringify(G.books.deal(BOOKS, DATA.divisions, G.books.STANDARD, G.rng(12), 12)), 'another seed deals differently');
  const kinds = {};
  a.forEach(function (q) { kinds[q.kind] = (kinds[q.kind] || 0) + 1; });
  assertEqual(Object.keys(kinds).sort(), G.books.KINDS.slice().sort(), 'every kind comes up');
  G.books.KINDS.forEach(function (k) { assertEqual(kinds[k], 3, k + ' takes its turn'); });
  for (let seed = 1; seed <= 25; seed++) {
    ['kids', 'family', 'scholar'].forEach(function (level) {
      const deck = G.books.deal(BOOKS, DATA.divisions, { level: level }, G.rng(seed), 12);
      const inPool = new Set(G.books.pool(BOOKS, level).map(function (b) { return b.name; }));
      deck.forEach(function (q) {
        assert(inPool.has(q.book.name), level + ': ' + q.book.name + ' is in play');
        if (q.kind === 'testament') assertEqual(q.options[q.answer], q.book.testament);
        if (q.kind === 'division') {
          assertEqual(q.options.length, 4);
          assertEqual(q.options[q.answer], q.book.divisionId, 'the right part');
          assertEqual(new Set(q.options).size, 4);
          const prophet = q.options.includes('major') || q.options.includes('minor');
          assert(!(prophet && q.options.includes('prophecy')), q.book.name + ': Prophecy is not offered beside the prophets');
          assert(!(q.options.includes('history') && q.options.includes('acts')), q.book.name + ': History and Church history are not offered together');
        }
        if (q.kind === 'next') {
          assertEqual(q.next.order, q.book.order + 1, q.book.name + ': the next book');
          assertEqual(q.options[q.answer], q.next.name);
          assertEqual(new Set(q.options).size, 4, 'four different books');
          assert(q.options.indexOf(q.book.name) === -1, 'the book itself is not offered');
          if (level === 'kids') assert(q.options.every(function (n) { return inPool.has(n); }), 'kids see well-known names');
        }
        if (q.kind === 'order') {
          assertEqual(q.correct.length, level === 'kids' ? 3 : 4, 'kids order three, others four');
          const orders = q.correct.map(function (n) { return BOOKS.filter(function (b) { return b.name === n; })[0].order; });
          assert(orders.every(function (o, i) { return !i || o > orders[i - 1]; }), 'the right order is Bible order');
          assert(!G.books.isRightOrder(q, q.options.map(function (o, i) { return i; })), 'never starts in order');
          assert(G.books.isRightOrder(q, q.correct.map(function (c) { return q.options.indexOf(c); })), 'tapping Bible order is right');
          if (level === 'scholar') assert(orders[orders.length - 1] - orders[0] <= 12, 'scholars order close books');
        }
      });
      const names = deck.map(function (q) { return q.book.name; });
      if (level !== 'kids') assertEqual(new Set(names).size, names.length, level + ': no book twice in a short game');
    });
  }
  const only = G.books.deal(BOOKS, DATA.divisions, { kinds: ['next'], level: 'kids' }, G.rng(3), 30);
  assert(only.every(function (q) { return q.kind === 'next' && q.book.name !== 'Revelation'; }), 'next never asks after Revelation');
});

/* ---------------- points ---------------- */

test('points: who am I by clue, verse building, and the room points are unchanged', function () {
  assertEqual([1, 2, 3, 4].map(G.who.points), [300, 225, 150, 75]);
  assert(/race\.submit\(chosenName, isCorrect, null, \{ value: isCorrect \? whoPoints\(clueLevel\) : 0 \}\)/.test(SRC), 'a room guess sends its clue value');
  assertEqual([1, 2, 3, 4].map(G.verse.placePoints), [250, 200, 150, 150], 'verse rush rooms score by place');
  assertEqual(G.verse.buildPoints(0, 30000, 0, 0), 150, 'instant and clean');
  assertEqual(G.verse.buildPoints(15000, 30000, 0, 0), 125, 'half the time');
  assertEqual(G.verse.buildPoints(30000, 30000, 1, 1), 55, 'a mistake and a hint cost');
  assertEqual(G.verse.buildPoints(30000, 30000, 9, 9), 25, 'never under 25');
  assertEqual(G.verse.wherePoints(true, 0), 150);
  assertEqual(G.verse.wherePoints(false, 0), 0);
  assertEqual([G.books.points('testament', 1), G.books.points('order', 2), G.books.points('next', 9)], [90, 140, 150]);
  assert(/st\.points \+= 80 \+ streak \* 10;/.test(SRC), 'books rooms still score 80 plus 10 a streak');
});

/* ---------------- registration and a headless round ---------------- */

test('three games registered, daily and challenge play the standard rules', function () {
  assertEqual(Object.keys(FF.__defs).sort(), ['bibleBooks', 'bibleVerseRush', 'bibleWhoAmI']);
  Object.keys(FF.__defs).forEach(function (id) { assertEqual(FF.__defs[id].category, 'bible'); });
  assert(/api\.config\.daily \|\| api\.config\.challenge\) \{ play\(spec\.standard, seed\); return; \}/.test(SRC), 'daily and challenge skip setup');
  assert(/if \(!spec\.isStandard\(cfg\)\) api\.config\.customRules = true;/.test(SRC), 'other settings are marked as custom rules');
  assert(/config\.sharedDeal/.test(SRC), 'a shared deal ignores the seen lists');
  assert(!/Math\.random\(\)(?! *;\s*\})/.test(SRC.replace(/function rand0\(\)[^\n]*\n/, '')), 'deals only use the seeded random source');
});

/* One phone playing a daily run: no setup screen, the first round on screen. */
function phone(id) {
  const P = load();
  P.Audio = { play: function () {} };
  P.Nav = { focusFirst: function () {}, focus: function () {} };
  P.Advance = { button: function (label, fn) { return P.ui.button(label, { onClick: fn }); } };
  P.Players = { avatarEl: function () { return P.ui.span('ava'); } };
  P.GameFlow = { current: true };
  const root = P.ui.div('root');
  P.__sandbox.document.body.appendChild(root);
  const log = { added: [], ended: null };
  const scores = {};
  const api = {
    def: P.__defs[id],
    config: { players: [{ id: 'p1', name: 'Ann' }], scorers: [{ id: 'p1', name: 'Ann' }], mode: 'solo', difficulty: 'normal', timer: 0, daily: '2026-11-07', sharedDeal: true },
    shell: { root: root, setTimer: function () {}, hideTimer: function () {}, updateScores: function () {}, setTitle: function () {}, toast: function () {}, setOnTick: function () {} },
    ui: P.ui, util: P.util, random: P.Random, audio: P.Audio,
    scoring: {
      add: function (eid, pts, o) { log.added.push({ id: eid, pts: pts, o: o || null }); scores[eid] = (scores[eid] || 0) + pts; },
      get: function (eid) { return scores[eid] || 0; },
      markAnswer: function () {}, resetStreak: function () {},
      record: function () { return { streak: 0, bestStreak: 0 }; },
      results: function () { return { results: [], winnerId: null }; }
    },
    end: function (res) { log.ended = res; }
  };
  P.Random.seed('daily|2026-11-07|' + id + '|init');
  P.__defs[id].start(api);
  return { P: P, api: api, root: root, log: log };
}

function all(node, pred, out) {
  out = out || [];
  (node.children || []).forEach(function (c) { if (c && c.tagName) { if (pred(c)) out.push(c); all(c, pred, out); } });
  return out;
}
function cls(c, name) { return (' ' + (c.className || '') + ' ').indexOf(' ' + name + ' ') !== -1; }
function text(n) { return n.nodeType === 3 ? n.textContent : (n.textContent || '') + (n.children || []).map(text).join(''); }
function nextButton(root) {
  return all(root, function (c) { return c.tagName === 'BUTTON' && /Next|See results/.test(text(c)); })[0];
}

test('who am I: a daily run deals the same people every time and scores a first-clue guess', function () {
  const a = phone('bibleWhoAmI');
  const b = phone('bibleWhoAmI');
  const clue = function (d) { return text(all(d.root, function (c) { return cls(c, 'bw-clue__text'); })[0]); };
  assertEqual(clue(a), clue(b), 'everyone gets the same first person');
  const person = WHO.filter(function (x) { return x.clues[0] === clue(a); })[0];
  assert(person, 'the clue belongs to a person');
  const right = all(a.root, function (c) { return c.tagName === 'BUTTON' && c.dataset && c.dataset.answer === person.answer; })[0];
  right.dispatch('click');
  assertEqual(a.log.added[0].pts, 300, 'first clue is worth 300');
  assert(all(a.root, function (c) { return cls(c, 'bq-verse'); }).length === 1, 'the verse card shows');
  assertEqual(all(a.root, function (c) { return cls(c, 'bw-clue'); }).length, 4, 'four clue rows');
  assertEqual(all(a.root, function (c) { return cls(c, 'bw-clue--locked'); }).length, 0, 'every clue is shown after the answer');
  nextButton(a.root).dispatch('click');
  assert(clue(a) !== person.clues[0], 'the next person');
});

test('verse rush: a daily run builds a verse piece by piece', function () {
  const d = phone('bibleVerseRush');
  const ref = text(all(d.root, function (c) { return cls(c, 'bv-ref'); })[0]);
  const verse = VERSES.filter(function (v) { return v.reference === ref; })[0];
  assert(verse, 'shows a reference: ' + ref);
  const pieces = G.verse.tiles(verse.part, G.verse.MAX_TILES.family);
  // A wrong first piece: everything goes back.
  const poolChips = function () { return all(d.root, function (c) { return c.tagName === 'BUTTON' && cls(c, 'word-chip') && !cls(c, 'word-chip--placed'); }); };
  pieces.forEach(function (p) {
    const chip = poolChips().filter(function (c) { return text(c) === p; })[0];
    assert(chip, 'piece in the pool: ' + p);
    chip.dispatch('click');
  });
  assertEqual(d.log.added.length, 1, 'scored once');
  assert(d.log.added[0].pts >= 100 && d.log.added[0].pts <= 150, 'a clean build scores 100 to 150');
  assert(all(d.root, function (c) { return cls(c, 'bq-verse'); }).length === 1, 'the verse card shows');
});

test('books: a daily run answers a round and moves on to the next', function () {
  const d = phone('bibleBooks');
  const first = all(d.root, function (c) { return c.tagName === 'BUTTON' && (cls(c, 'bible-books-option') || cls(c, 'gm-duo-btn')); });
  assert(first.length >= 2, 'answers to tap');
  first.forEach(function (b) { if (!b.hidden) b.dispatch('click'); });
  assertEqual(d.log.added.length, 1, 'one answer scored');
  assert(all(d.root, function (c) { return cls(c, 'bb-facts'); }).length === 1, 'the book card shows');
  nextButton(d.root).dispatch('click');
  assert(all(d.root, function (c) { return cls(c, 'bq-verse'); }).length === 0, 'a fresh round');
});
