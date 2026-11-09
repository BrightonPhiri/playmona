/* ============================================================
   PLAYMONA — charades/rules.js
   Charades rules with no screen in them (FF.CharadesRules):
   - the setup and its defaults, and cleaning a saved setup
   - the card pool for the chosen decks and level
   - a dealer that never repeats a card until the pool runs out
   - acting twists, a turn's record (got / passed / time up / flip)
   - the turn order: teams take turns, actors rotate inside a team
   - the standard charades signals, for the signals sheet
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var LEVELS = ['easy', 'normal', 'hard'];
  var SECONDS = [30, 60, 90];
  var TURNS = [1, 2, 3];
  var LEVEL_TAGS = { easy: ['e'], normal: ['e', 'n'], hard: ['n', 'h'] };
  var STANDARD = { decks: ['mix'], level: 'normal', seconds: 60, turns: 1, twists: false };
  var TWIST_RATE = 0.25;
  var RECENT = 5;

  var TWISTS = [
    { id: 'slow', text: 'In slow motion' },
    { id: 'oneHand', text: 'One hand only' },
    { id: 'robot', text: 'As a robot' },
    { id: 'eyesClosed', text: 'With your eyes closed' },
    { id: 'sitting', text: 'Sitting down' },
    { id: 'tiptoe', text: 'On tiptoe' },
    { id: 'mouse', text: 'As a tiny mouse' },
    { id: 'angry', text: 'Really angrily' },
    { id: 'underwater', text: 'Underwater' },
    { id: 'freezing', text: 'As if you’re freezing' }
  ];

  var SIGNALS = [
    { id: 'film', name: 'Film', how: 'Crank an old film camera beside your head.' },
    { id: 'book', name: 'Book', how: 'Open your hands like a book.' },
    { id: 'song', name: 'Song', how: 'Pretend to sing, one hand out from your mouth.' },
    { id: 'tv', name: 'TV show', how: 'Draw a screen in the air with two fingers.' },
    { id: 'play', name: 'Play', how: 'Pull a curtain rope, or take a bow.' },
    { id: 'saying', name: 'Saying', how: 'Make air quotes with your fingers.' },
    { id: 'words', name: 'Number of words', how: 'Hold up that many fingers at the start.' },
    { id: 'whichWord', name: 'Which word', how: 'Hold up fingers again for the word you are acting.' },
    { id: 'syllables', name: 'Syllables', how: 'Lay that many fingers on your forearm.' },
    { id: 'soundsLike', name: 'Sounds like', how: 'Cup a hand behind your ear.' },
    { id: 'smallWord', name: 'Small word', how: 'Hold finger and thumb close together.' },
    { id: 'wholeIdea', name: 'The whole thing', how: 'Sweep both arms in a big circle.' },
    { id: 'plural', name: 'Plural', how: 'Link your little fingers.' },
    { id: 'pastTense', name: 'Past tense', how: 'Wave a hand back over your shoulder.' },
    { id: 'onTheNose', name: 'On the nose', how: 'Touch your nose and point at whoever said it.' }
  ];

  function pick(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  /* A saved or passed-in setup, cleaned field by field. */
  function sanitize(setup, deckIds) {
    var s = setup || {};
    var known = deckIds || [];
    var decks = Array.isArray(s.decks) ? s.decks.filter(function (id) { return id === 'mix' || known.indexOf(id) !== -1; }) : [];
    if (!decks.length || decks.indexOf('mix') !== -1) decks = ['mix'];
    return {
      decks: decks,
      level: pick(LEVELS, s.level, STANDARD.level),
      seconds: pick(SECONDS, Number(s.seconds), STANDARD.seconds),
      turns: pick(TURNS, Number(s.turns), STANDARD.turns),
      twists: s.twists === true
    };
  }

  /* Every card from the chosen decks that fits the level. */
  function pool(decks, setup) {
    var want = setup && setup.decks ? setup.decks : ['mix'];
    var all = want.indexOf('mix') !== -1;
    var tags = LEVEL_TAGS[setup && setup.level] || LEVEL_TAGS.normal;
    var out = [];
    (decks || []).forEach(function (d) {
      if (!all && want.indexOf(d.id) === -1) return;
      (d.cards || []).forEach(function (c) {
        if (tags.indexOf(c.l) === -1) return;
        out.push({ t: c.t, l: c.l, deck: d.id, kind: d.kind || 'word', signal: d.signal || null });
      });
    });
    return out;
  }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* Deals the pool in a shuffled order. When it runs out it reshuffles, and the
     first card of the new order is never one of the last few dealt. */
  function Dealer(cards, rand) {
    var order = [];
    var recent = [];
    function refill() {
      order = shuffle(cards, rand);
      if (cards.length > RECENT && recent.length) {
        for (var i = 0; i < order.length; i++) {
          if (recent.indexOf(order[i]) === -1) {
            var x = order[0]; order[0] = order[i]; order[i] = x;
            break;
          }
        }
      }
    }
    return {
      next: function () {
        if (!cards.length) return null;
        if (!order.length) refill();
        var c = order.shift();
        recent.push(c);
        if (recent.length > RECENT) recent.shift();
        return c;
      }
    };
  }

  function twistFor(rand, prevHadTwist) {
    if (prevHadTwist) return null;
    if (rand() >= TWIST_RATE) return null;
    return TWISTS[Math.floor(rand() * TWISTS.length) % TWISTS.length];
  }

  function points(entry) {
    if (!entry || !entry.got) return 0;
    return entry.twist ? 2 : 1;
  }

  /* One actor's turn: the card on screen and everything got or passed. */
  function Turn(dealer, opts) {
    var o = opts || {};
    var rand = o.rand || Math.random;
    var entries = [];
    var current = null;
    var done = false;
    function deal() {
      var c = dealer.next();
      if (!c) { current = null; return; }
      var prev = entries.length ? entries[entries.length - 1].twist : null;
      current = { t: c.t, l: c.l, deck: c.deck, kind: c.kind, signal: c.signal, twist: o.twists ? twistFor(rand, !!prev) : null };
    }
    function record(got) {
      if (done || !current) return;
      entries.push({ card: current, got: got, twist: current.twist });
    }
    deal();
    return {
      card: function () { return done ? null : current; },
      got: function () { if (done) return; record(true); deal(); },
      pass: function () { if (done) return; record(false); deal(); },
      timeUp: function () { if (done) return; record(false); done = true; current = null; },
      over: function () { return done; },
      flip: function (i) { if (entries[i]) entries[i].got = !entries[i].got; },
      entries: function () { return entries; },
      score: function () { return entries.reduce(function (n, e) { return n + points(e); }, 0); }
    };
  }

  /* Who acts, in order. Teams (scorers with a players list) take turns and the
     actor rotates inside each team; every team gets the same number of turns,
     so a smaller team's first players act again. Individuals act as themselves. */
  function turnOrder(scorers, turnsEach) {
    var each = Math.max(1, Number(turnsEach) || 1);
    var live = (scorers || []).filter(function (s) { return !s.players || s.players.length > 0; });
    if (!live.length) return [];
    var size = function (s) { return s.players ? s.players.length : 1; };
    var biggest = live.reduce(function (m, s) { return Math.max(m, size(s)); }, 1);
    var per = biggest * each;
    var out = [];
    for (var r = 0; r < per; r++) {
      live.forEach(function (s) {
        var n = size(s);
        if (!s.players && r >= each) return;
        out.push({ scorerId: s.id, actorId: s.players ? s.players[r % n] : s.id, again: r >= n * each });
      });
    }
    return out;
  }

  function wordCount(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
  }

  FF.CharadesRules = {
    LEVELS: LEVELS,
    SECONDS: SECONDS,
    TURNS: TURNS,
    LEVEL_TAGS: LEVEL_TAGS,
    STANDARD: STANDARD,
    TWISTS: TWISTS,
    SIGNALS: SIGNALS,
    sanitize: sanitize,
    pool: pool,
    Dealer: Dealer,
    twistFor: twistFor,
    points: points,
    Turn: Turn,
    turnOrder: turnOrder,
    wordCount: wordCount
  };
})();
