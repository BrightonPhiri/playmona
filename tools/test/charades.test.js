'use strict';
/* Charades (js/charades/rules.js and js/data/charadesDecks.js): setup, the card
   pool per level, dealing, twists, a turn's record, the turn order for teams
   and the decks themselves; and that the game is registered where it must be. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const RULES = ['js/core.js', 'js/charades/rules.js'];
let cached = null;
const app = () => cached || (cached = loadFF(RULES));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const json = (x) => JSON.stringify(x);

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

/* A small fake deck list in the decks file's shape. */
const FAKE = [
  { id: 'animals', name: 'Animals', kind: 'word', cards: [{ t: 'Cat', l: 'e' }, { t: 'Lynx', l: 'n' }, { t: 'Okapi', l: 'h' }] },
  { id: 'films', name: 'Films', kind: 'title', signal: 'film', cards: [{ t: 'Up', l: 'e' }, { t: 'Jaws', l: 'n' }, { t: 'Vertigo', l: 'h' }] }
];
function bigPool(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: 'card' + i, l: 'e', deck: 'x', kind: 'word', signal: null });
  return out;
}

/* ---------- setup ---------- */

test('ch sanitize: bad fields fall back one by one', function () {
  const R = app().CharadesRules;
  assertEqual(json(R.STANDARD), json({ decks: ['mix'], level: 'normal', seconds: 60, turns: 1, twists: false }));
  assertEqual(json(R.sanitize({ decks: ['nope'], level: 'x', seconds: 45, turns: 9, twists: 'yes' }, ['animals'])), json(R.STANDARD));
  const s = R.sanitize({ decks: ['animals'], seconds: 30 }, ['animals']);
  assertEqual(json(s.decks), json(['animals']));
  assertEqual(s.seconds, 30);
  assertEqual(s.level, 'normal');
  assertEqual(json(R.sanitize({ decks: ['animals', 'mix'] }, ['animals']).decks), json(['mix']));
  assertEqual(json(R.sanitize({ decks: [] }, ['animals']).decks), json(['mix']));
  assertEqual(R.sanitize({ twists: true }, []).twists, true);
  assertEqual(json(R.sanitize(null, ['animals'])), json(R.STANDARD));
});

/* ---------- the pool ---------- */

test('ch pool: level tags pick the cards, mix covers every deck', function () {
  const R = app().CharadesRules;
  const tags = (lv, decks) => R.pool(FAKE, { decks: decks || ['mix'], level: lv }).map((c) => c.l).sort().join('');
  assertEqual(tags('easy'), 'ee');
  assertEqual(tags('normal'), 'eenn');
  assertEqual(tags('hard'), 'hhnn');
  assertEqual(R.pool(FAKE, { decks: ['films'], level: 'normal' }).length, 2);
  const film = R.pool(FAKE, { decks: ['films'], level: 'easy' })[0];
  assertEqual(film.t, 'Up');
  assertEqual(film.deck, 'films');
  assertEqual(film.kind, 'title');
  assertEqual(film.signal, 'film');
  const cat = R.pool(FAKE, { decks: ['animals'], level: 'easy' })[0];
  assertEqual(cat.kind, 'word');
  assertEqual(cat.signal, null);
});

/* ---------- dealing ---------- */

test('ch dealer: no repeats until the pool runs out, then reshuffles', function () {
  const R = app().CharadesRules;
  const d = R.Dealer(bigPool(12), seeded(7));
  const first = [];
  for (let i = 0; i < 12; i++) first.push(d.next().t);
  assertEqual(new Set(first).size, 12, 'twelve different cards');
  const last5 = first.slice(-5);
  for (let s = 1; s < 40; s++) {
    const d2 = R.Dealer(bigPool(12), seeded(s));
    const seen = [];
    for (let i = 0; i < 12; i++) seen.push(d2.next().t);
    const thirteenth = d2.next();
    assert(thirteenth && thirteenth.t, 'the 13th card exists (seed ' + s + ')');
    assert(seen.slice(-5).indexOf(thirteenth.t) === -1, 'not one of the last 5 (seed ' + s + ')');
  }
  assert(last5.length === 5);
  const tiny = R.Dealer(bigPool(2), seeded(3));
  for (let i = 0; i < 9; i++) assert(tiny.next(), 'a tiny pool keeps dealing');
});

/* ---------- twists and a turn ---------- */

test('ch twists: about a quarter, never twice in a row', function () {
  const R = app().CharadesRules;
  assertEqual(R.TWISTS.length, 10);
  R.TWISTS.forEach((tw) => assert(tw.id && tw.text, 'twist has id and text'));
  assertEqual(R.twistFor(() => 0, true), null, 'never after a twist');
  assert(R.twistFor(() => 0.1, false), 'a low roll gives a twist');
  assertEqual(R.twistFor(() => 0.9, false), null, 'a high roll gives none');
  const turn = R.Turn(R.Dealer(bigPool(50), seeded(11)), { twists: true, rand: seeded(12) });
  for (let i = 0; i < 4000; i++) turn.got();
  const e = turn.entries();
  const rate = e.filter((x) => x.twist).length / e.length;
  assert(rate > 0.18 && rate < 0.27, 'twist rate ' + rate);
  for (let i = 1; i < e.length; i++) assert(!(e[i].twist && e[i - 1].twist), 'two twists in a row at ' + i);
  const plain = R.Turn(R.Dealer(bigPool(50), seeded(1)), { twists: false, rand: seeded(2) });
  for (let i = 0; i < 200; i++) plain.got();
  assert(plain.entries().every((x) => !x.twist), 'twists off means none');
});

test('ch turn: got, pass, time up and flip', function () {
  const R = app().CharadesRules;
  const turn = R.Turn(R.Dealer(bigPool(20), seeded(5)), { twists: false, rand: seeded(6) });
  const c1 = turn.card();
  assert(c1 && c1.t, 'a card to start');
  turn.got(); turn.got(); turn.pass();
  const before = turn.card();
  turn.timeUp();
  turn.got();
  const e = turn.entries();
  assertEqual(json(e.map((x) => x.got)), json([true, true, false, false]));
  assertEqual(e[0].card.t, c1.t, 'the first entry is the first card');
  assertEqual(e[3].card.t, before.t, 'the card on screen at time up counts as passed');
  assertEqual(turn.card(), null, 'no card after time up');
  assertEqual(turn.score(), 2);
  turn.flip(2);
  assertEqual(turn.score(), 3);
  assertEqual(R.points({ got: true, twist: { id: 'robot' } }), 2);
  assertEqual(R.points({ got: true, twist: null }), 1);
  assertEqual(R.points({ got: false, twist: { id: 'robot' } }), 0);
});

/* ---------- the turn order ---------- */

test('ch turnOrder: teams alternate, actors rotate, uneven teams wrap', function () {
  const R = app().CharadesRules;
  const A = { id: 'A', players: ['a1', 'a2', 'a3'] };
  const B = { id: 'B', players: ['b1', 'b2'] };
  const C = { id: 'C', players: [] };
  const o = R.turnOrder([A, B, C], 1);
  assertEqual(o.map((x) => x.scorerId).join(''), 'ABABAB');
  assertEqual(o.map((x) => x.actorId).join(','), 'a1,b1,a2,b2,a3,b1');
  assertEqual(json(o.map((x) => x.again)), json([false, false, false, false, false, true]));
  const two = R.turnOrder([A, B], 2);
  assertEqual(two.length, 12);
  assertEqual(two.filter((x) => x.scorerId === 'B').length, 6, 'equal turns per team');
  const solo = R.turnOrder([{ id: 'p1', name: 'Ama' }, { id: 'p2', name: 'Kofi' }], 2);
  assertEqual(solo.map((x) => x.actorId).join(','), 'p1,p2,p1,p2');
  assert(solo.every((x) => x.actorId === x.scorerId && !x.again));
  assertEqual(R.turnOrder([C], 1).length, 0, 'nobody to act');
});

test('ch wordCount: spaces split words, hyphens do not', function () {
  const R = app().CharadesRules;
  assertEqual(R.wordCount('The Lion King'), 3);
  assertEqual(R.wordCount('Spider-Man'), 1);
  assertEqual(R.wordCount('  Noah’s  Ark '), 2);
});

test('ch signals: 15 in order, each with a name and how', function () {
  const R = app().CharadesRules;
  assertEqual(R.SIGNALS.map((s) => s.id).join(','),
    'film,book,song,tv,play,saying,words,whichWord,syllables,soundsLike,smallWord,wholeIdea,plural,pastTense,onTheNose');
  R.SIGNALS.forEach((s) => assert(s.name && s.how, s.id + ' has name and how'));
});

/* ---------- the decks ---------- */

const DATA = ['js/core.js', 'js/data/charadesDecks.js', 'js/charades/rules.js'];
let dataCached = null;
const withDecks = () => dataCached || (dataCached = loadFF(DATA));
const fold = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

test('ch decks: 12 decks in order, each with enough cards at every level', function () {
  const D = withDecks().data.charadesDecks;
  assertEqual(D.map((d) => d.id).join(','), 'animals,actions,jobs,sports,food,home,feelings,films,songs,books,tv,bible');
  D.forEach(function (d) {
    const n = (l) => d.cards.filter((c) => c.l === l).length;
    assert(d.name && d.glyph, d.id + ' has a name and glyph');
    assert(d.cards.length >= 40, d.id + ' has ' + d.cards.length + ' cards');
    assert(n('e') >= 15, d.id + ' easy ' + n('e'));
    assert(n('n') >= 15, d.id + ' normal ' + n('n'));
    assert(n('h') >= 10, d.id + ' hard ' + n('h'));
    d.cards.forEach((c) => assert(['e', 'n', 'h'].indexOf(c.l) !== -1, d.id + ': bad level on ' + c.t));
  });
});

test('ch decks: about 600 cards in all', function () {
  const total = withDecks().data.charadesDecks.reduce((n, d) => n + d.cards.length, 0);
  assert(total >= 560 && total <= 700, 'total ' + total);
});

test('ch decks: no card appears twice', function () {
  const seen = {};
  withDecks().data.charadesDecks.forEach(function (d) {
    d.cards.forEach(function (c) {
      const k = fold(c.t);
      assert(!seen[k], 'duplicate: ' + c.t + ' in ' + d.id + ' and ' + seen[k]);
      seen[k] = d.id;
    });
  });
});

test('ch decks: title decks carry a known signal, word decks none', function () {
  const app2 = withDecks();
  const known = app2.CharadesRules.SIGNALS.map((s) => s.id);
  app2.data.charadesDecks.forEach(function (d) {
    if (d.kind === 'title') assert(known.indexOf(d.signal) !== -1, d.id + ' signal ' + d.signal);
    else { assertEqual(d.kind, 'word', d.id + ' kind'); assert(!d.signal, d.id + ' has no signal'); }
  });
  assertEqual(app2.data.charadesDecks.filter((d) => d.kind === 'title').map((d) => d.id).join(','), 'films,songs,books,tv,bible');
});

test('ch decks: every card is short enough to act and read', function () {
  const R = withDecks().CharadesRules;
  withDecks().data.charadesDecks.forEach(function (d) {
    d.cards.forEach(function (c) {
      assert(c.t.length >= 1 && c.t.length <= 40, d.id + ': length of ' + c.t);
      assert(R.wordCount(c.t) <= 7, d.id + ': too many words in ' + c.t);
    });
  });
});
