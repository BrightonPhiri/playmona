/* ============================================================
   PLAYMONA — games/bibleGames.js
   Three Bible games (Bible Quiz lives in bibleQuiz.js), reading
   js/data/bible.js (KJV wording):
     bibleWhoAmI    — Who Am I? Four clues, hardest first; guess early for more.
     bibleVerseRush — Verse Rush: build a verse from its pieces, or find where it is.
     bibleBooks     — Books of the Bible: testament, part of the Bible,
                      what comes next, and putting books in order.

   - Local play: a setup screen (level and options), then solo or
     pass and play, a verse card after every answer and a recap.
   - Daily and friend challenges: the standard rules on a shared deal.
   - Online rooms: Who Am I and Verse Rush race with FF.Race; Books of
     the Bible runs testament sprints with FF.Parallel. Room points are
     the same as before (they are tested).
   Pure rules are FF.BibleGames (tests: tools/test/bibleGames.test.js).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= shared rules (pure, tested) ================= */

  var LEVELS = ['kids', 'family', 'scholar', 'expert'];
  // Expert plays the Family people, verses and books, and has you spell
  // the names (letter tiles, js/spellTiles.js) instead of picking them.
  var SPELL_BONUS = 50;
  var SPELL_EXTRA_SECS = 6;

  function bible() {
    return (FF.data && FF.data.bible) || { whoAmI: [], verses: [], books: [], divisions: [] };
  }
  function setOf(list) { var s = {}; (list || []).forEach(function (k) { s[k] = true; }); return s; }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function levelOf(l) { return LEVELS.indexOf(l) !== -1 ? l : 'family'; }

  /* A small seeded random source, so one number decides a whole deal. */
  function rng(seed) {
    var a = (Number(seed) || 0) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  /* Kids plays kids items; Family adds the family ones; Scholar drops the kids ones. */
  function levelOk(level, itemLevel) {
    if (level === 'expert') level = 'family';
    if (level === 'kids') return itemLevel === 'kids';
    if (level === 'scholar') return itemLevel !== 'kids';
    return itemLevel !== 'scholar';
  }

  /* The items for a level; with too few, take in the nearest level too. */
  function atLevel(items, level, min) {
    var exact = items.filter(function (x) { return levelOk(level, x.level); });
    if (exact.length >= min) return exact;
    var wider = level === 'kids' ? items.filter(function (x) { return x.level !== 'scholar'; }) : items;
    return wider.length >= min ? wider : items;
  }

  /* Keep only known kinds, in their own order; "all of them" is stored as []. */
  function kindsOf(list, all) {
    var want = setOf(Array.isArray(list) ? list : []);
    var kinds = all.filter(function (k) { return want[k]; });
    return kinds.length === all.length ? [] : kinds;
  }

  /* Shuffled so the first item never stays first: for puzzles to put in order. */
  function scramble(n, rand, same) {
    var idx = shuffle(range(n), rand);
    var tries = 0;
    while (n > 1 && same(idx) && tries++ < 5) idx = shuffle(idx, rand);
    if (n > 1 && same(idx)) idx = idx.slice(1).concat(idx[0]);
    return idx;
  }

  /* ---------- Who Am I? ---------- */

  var WHO_STANDARD = { level: 'family', testament: 'all', pace: 'auto' };
  var WHO_MIN_POOL = 10;
  var WHO_CLUE_MS = 8000;

  function whoSanitize(s) {
    s = s || {};
    return {
      level: levelOf(s.level),
      testament: s.testament === 'OT' || s.testament === 'NT' ? s.testament : 'all',
      pace: s.pace === 'tap' ? 'tap' : 'auto'
    };
  }
  function whoIsStandard(s) {
    var c = whoSanitize(s);
    return c.level === WHO_STANDARD.level && c.testament === WHO_STANDARD.testament && c.pace === WHO_STANDARD.pace;
  }
  function whoPool(items, cfg) {
    var c = whoSanitize(cfg);
    var base = items.filter(function (x) { return c.testament === 'all' || x.testament === c.testament; });
    return atLevel(base, c.level, WHO_MIN_POOL);
  }

  /* Four names: the answer and three others of the same sort (men with men,
     women with women, and from the same testament above the Kids level, so
     the testament never gives it away). Nobody the clues name is offered. */
  function whoChoices(item, items, level, rand) {
    var clueText = item.clues.join(' ');
    var others = items.filter(function (x) { return x.answer !== item.answer && clueText.indexOf(x.answer) === -1; });
    function near(x) { return x.gender === item.gender && (level === 'kids' || x.testament === item.testament); }
    var tiers = [
      others.filter(function (x) { return near(x) && levelOk(level, x.level); }),
      others.filter(near),
      others.filter(function (x) { return x.gender === item.gender; }),
      others
    ];
    var from = tiers.filter(function (tier) { return tier.length >= 3; })[0] || others;
    var names = shuffle(from, rand).slice(0, 3).map(function (x) { return x.answer; });
    return shuffle([item.answer].concat(names), rand);
  }

  /* `count` people, each with four names to choose from. `seen` (optional)
     is a set of ids to leave out while enough are fresh. */
  function whoDeal(items, cfg, rand, count, seen) {
    var c = whoSanitize(cfg);
    var list = whoPool(items, c);
    if (seen) {
      var fresh = list.filter(function (x) { return !seen[x.id]; });
      if (fresh.length >= count) list = fresh;
    }
    return shuffle(list, rand).slice(0, count).map(function (x) {
      return {
        id: x.id, answer: x.answer, level: x.level, testament: x.testament,
        clues: x.clues.slice(), story: x.story, ref: x.ref, verse: x.verse,
        choices: whoChoices(x, items, c.level, rand)
      };
    });
  }

  /* 300 on the first clue, then 225, 150 and 75 (the same in rooms). */
  function whoPoints(clue) { return (5 - Math.max(1, Math.min(4, clue))) * 75; }

  /* ---------- Verse Rush ---------- */

  var VERSE_KINDS = ['build', 'where'];
  var VERSE_STANDARD = { level: 'family', kinds: [] };
  var VERSE_MIN_POOL = 12;
  var MAX_TILES = { kids: 6, family: 8, scholar: 12 };
  var WHERE_EVERY = 3;        // with both kinds, every third verse asks where it is

  function verseSanitize(s) {
    s = s || {};
    return { level: levelOf(s.level), kinds: kindsOf(s.kinds, VERSE_KINDS) };
  }
  function verseIsStandard(s) {
    var c = verseSanitize(s);
    return c.level === VERSE_STANDARD.level && !c.kinds.length;
  }
  function versePool(items, cfg) { return atLevel(items, verseSanitize(cfg).level, VERSE_MIN_POOL); }

  /* The pieces to build: one word each for a short verse; for a longer one
     the words are grouped into `max` pieces, breaking after punctuation
     where one is a word away. Nothing is cut off. */
  function tiles(text, max) {
    var words = String(text).trim().split(/\s+/);
    var n = words.length;
    if (n <= max) return words;
    var punct = /[,;:.?!]$/;
    var cuts = [];
    var i;
    for (i = 1; i < max; i++) cuts.push(Math.round(i * n / max));
    for (i = 0; i < cuts.length; i++) {
      var b = cuts[i];
      var lo = (i ? cuts[i - 1] : 0) + 1;
      var hi = (i + 1 < cuts.length ? cuts[i + 1] : n) - 1;
      if (punct.test(words[b - 1])) continue;
      if (b - 1 >= lo && punct.test(words[b - 2])) cuts[i] = b - 1;
      else if (b + 1 <= hi && punct.test(words[b])) cuts[i] = b + 1;
    }
    var out = [];
    var start = 0;
    cuts.concat([n]).forEach(function (c) { out.push(words.slice(start, c).join(' ')); start = c; });
    return out;
  }

  function verseKind(round, kinds) {
    if (kinds.length === 1) return kinds[0];
    return (round + 1) % WHERE_EVERY === 0 ? 'where' : 'build';
  }

  function bookOfRef(ref) { return String(ref).replace(/\s+\d+:[\d\-,]+$/, ''); }

  /* A verse ready to play. Build: the pieces, scrambled (never already in
     order). Where: four references, the right one among them. */
  function versePrepare(v, kind, level, items, rand) {
    var at = v.text.indexOf(v.part);
    var after = v.text.slice(at + v.part.length).trim();
    var q = {
      id: v.id, ref: v.reference, text: v.text, part: v.part, kind: kind, level: v.level,
      before: v.text.slice(0, at).trim(), after: /[A-Za-z]/.test(after) ? after : ''
    };
    if (kind === 'build') {
      q.tiles = tiles(v.part, MAX_TILES[level] || MAX_TILES.family);
      var order = scramble(q.tiles.length, rand, function (idx) {
        return idx.every(function (x, i) { return q.tiles[x] === q.tiles[i]; });
      });
      q.pool = order.map(function (i) { return q.tiles[i]; });
      return q;
    }
    var book = bookOfRef(v.reference);
    var others = items.filter(function (x) {
      return bookOfRef(x.reference) !== book && (level !== 'scholar' || x.testament === v.testament);
    });
    var seenBook = {};
    var refs = [];
    shuffle(others, rand).forEach(function (x) {
      var b = bookOfRef(x.reference);
      if (refs.length < 3 && !seenBook[b]) { seenBook[b] = true; refs.push(x.reference); }
    });
    q.options = shuffle([v.reference].concat(refs), rand);
    q.answer = q.options.indexOf(v.reference);
    return q;
  }

  function verseDeal(items, cfg, rand, count, seen, racing) {
    var c = verseSanitize(cfg);
    var kinds = racing ? ['build'] : (c.kinds.length ? c.kinds : VERSE_KINDS);
    var list = versePool(items, c);
    if (seen) {
      var fresh = list.filter(function (x) { return !seen[x.id]; });
      if (fresh.length >= count) list = fresh;
    }
    return shuffle(list, rand).slice(0, count).map(function (v, r) {
      return versePrepare(v, verseKind(r, kinds), c.level, items, rand);
    });
  }

  function isRightBuild(q, placed) {
    if (!placed || placed.length !== q.tiles.length) return false;
    for (var i = 0; i < placed.length; i++) if (placed[i] !== q.tiles[i]) return false;
    return true;
  }
  /* How many pieces from the start are already right. */
  function rightSoFar(q, placed) {
    var n = 0;
    while (n < placed.length && placed[n] === q.tiles[n]) n++;
    return n;
  }

  /* Local points. Building: 100 plus up to 50 for speed, less 20 a wrong
     try and 25 a hint, never under 25. Where is it: 100 plus up to 50. */
  function buildPoints(ms, limitMs, mistakes, hints) {
    var speed = limitMs > 0 ? Math.round(50 * Math.max(0, 1 - ms / limitMs)) : Math.max(0, Math.round(50 - (ms / 1000) * 2));
    return Math.max(25, 100 + speed - 20 * (mistakes || 0) - 25 * (hints || 0));
  }
  function wherePoints(correct, ms) {
    return correct ? 100 + Math.max(0, Math.round((20 - (ms || 0) / 1000) * 2.5)) : 0;
  }
  // Online, every finished verse scores; the quickest two earn more.
  function versePlacePoints(place) {
    return 150 + Math.max(0, 3 - (place || 1)) * 50;
  }

  /* ---------- Books of the Bible ---------- */

  var BOOK_KINDS = ['testament', 'division', 'next', 'order'];
  var BOOKS_STANDARD = { level: 'family', kinds: [] };
  var BOOK_BASE = { testament: 80, division: 100, next: 100, order: 120 };
  // Parts whose names could fairly fit each other's books are never offered together.
  var DIV_CLASH = { prophecy: ['major', 'minor'], major: ['prophecy'], minor: ['prophecy'], acts: ['history'], history: ['acts'] };

  function booksSanitize(s) {
    s = s || {};
    return { level: levelOf(s.level), kinds: kindsOf(s.kinds, BOOK_KINDS) };
  }
  function booksIsStandard(s) {
    var c = booksSanitize(s);
    return c.level === BOOKS_STANDARD.level && !c.kinds.length;
  }
  /* Kids: the best-known books. Family adds most of the rest. Scholar plays all 66. */
  function booksPool(books, level) {
    level = levelOf(level);
    if (level === 'expert') level = 'family';
    if (level === 'scholar') return books.slice();
    return books.filter(function (b) { return level === 'kids' ? b.level === 'kids' : b.level !== 'scholar'; });
  }

  function bookQuestion(kind, book, ctx) {
    var books = ctx.books;
    var rand = ctx.rand;
    var level = ctx.level;
    if (kind === 'testament') {
      return { kind: kind, book: book, options: ['OT', 'NT'], answer: book.testament === 'OT' ? 0 : 1 };
    }
    if (kind === 'division') {
      var divs = shuffle(ctx.divisions.filter(function (d) {
        return d.id !== book.divisionId && (level !== 'scholar' || d.testament === book.testament);
      }), rand);
      var picked = [book.divisionId];
      divs.forEach(function (d) {
        var clash = picked.some(function (p) { return (DIV_CLASH[p] || []).indexOf(d.id) !== -1; });
        if (picked.length < 4 && !clash) picked.push(d.id);
      });
      var opts = shuffle(picked, rand);
      return { kind: kind, book: book, options: opts, answer: opts.indexOf(book.divisionId) };
    }
    if (kind === 'next') {
      var nxt = books[book.order];          // order is 1-based, so this is the next book
      var span = level === 'scholar' ? 4 : 8;
      var near = books.filter(function (b) {
        return b !== book && b !== nxt && Math.abs(b.order - book.order) <= span &&
          (level !== 'kids' || ctx.inPool[b.name]);
      });
      if (near.length < 3) near = ctx.pool.filter(function (b) { return b !== book && b !== nxt; });
      var names = shuffle([nxt.name].concat(shuffle(near, rand).slice(0, 3).map(function (b) { return b.name; })), rand);
      return { kind: kind, book: book, next: nxt, options: names, answer: names.indexOf(nxt.name) };
    }
    // order: kids take 3 from anywhere; others take 4 from a run of nearby books
    var n = level === 'kids' ? 3 : 4;
    var picks;
    if (level === 'kids') {
      picks = shuffle(ctx.pool.filter(function (b) { return b !== book; }), rand).slice(0, n - 1).concat([book]);
    } else {
      var width = level === 'scholar' ? 6 : 12;
      var nearest = shuffle(ctx.pool.filter(function (b) { return b !== book; }), rand)
        .sort(function (a, b) { return Math.abs(a.order - book.order) - Math.abs(b.order - book.order); })
        .slice(0, width);
      picks = shuffle(nearest, rand).slice(0, n - 1).concat([book]);
    }
    picks.sort(function (a, b) { return a.order - b.order; });
    var correct = picks.map(function (b) { return b.name; });
    var idx = scramble(correct.length, rand, function (ix) { return ix.every(function (x, i) { return x === i; }); });
    return { kind: 'order', book: book, books: picks, options: idx.map(function (i) { return correct[i]; }), correct: correct, answer: -1 };
  }

  /* `count` questions. The kinds take turns in a shuffled order; each book
     is used once before any comes round again. */
  function booksDeal(books, divisions, cfg, rand, count) {
    var c = booksSanitize(cfg);
    var kinds = shuffle(c.kinds.length ? c.kinds : BOOK_KINDS, rand);
    var pool = booksPool(books, c.level);
    var inPool = {};
    pool.forEach(function (b) { inPool[b.name] = true; });
    var ctx = { books: books, divisions: divisions, rand: rand, level: c.level, pool: pool, inPool: inPool };
    function fits(kind, b) {
      if (kind !== 'next') return true;
      var nxt = books[b.order];
      return !!nxt && (c.level !== 'kids' || inPool[nxt.name]);
    }
    var bag = [];
    var out = [];
    for (var r = 0; r < count; r++) {
      var kind = kinds[r % kinds.length];
      if (!bag.length) bag = shuffle(pool, rand);
      var at = -1;
      for (var i = 0; i < bag.length; i++) if (fits(kind, bag[i])) { at = i; break; }
      if (at === -1) {
        // Nothing left in this bag fits: take any book that does.
        var fitting = pool.filter(function (b) { return fits(kind, b); });
        if (fitting.length) { out.push(bookQuestion(kind, fitting[Math.floor(rand() * fitting.length)], ctx)); continue; }
        kind = 'testament';
        at = 0;
      }
      out.push(bookQuestion(kind, bag.splice(at, 1)[0], ctx));
    }
    return out;
  }

  function isRightOrder(q, placed) {
    if (!q.correct || !placed || placed.length !== q.correct.length) return false;
    for (var i = 0; i < placed.length; i++) if (q.options[placed[i]] !== q.correct[i]) return false;
    return true;
  }

  /* Local points: by kind, plus 10 a streak step (up to 50). */
  function bookPoints(kind, streak) {
    return (BOOK_BASE[kind] || 80) + Math.min(5, Math.max(0, streak || 0)) * 10;
  }

  /* ---------- Expert: spelled names ---------- */

  function isSpelled(cfg) { return !!cfg && cfg.level === 'expert'; }

  // One checker per list (FF.AnswerMatch), built the first time it is needed.
  var checkers = { who: null, whoList: null, books: null, booksList: null };
  function whoChecker(items) {
    if (checkers.whoList !== items) {
      checkers.whoList = items;
      checkers.who = FF.AnswerMatch.create({ answers: items.map(function (x) { return { id: x.answer, names: FF.BibleNames.person(x.answer) }; }) });
    }
    return checkers.who;
  }
  function booksChecker(books) {
    if (checkers.booksList !== books) {
      checkers.booksList = books;
      checkers.books = FF.AnswerMatch.create({ answers: books.map(function (b) { return { id: b.name, names: FF.BibleNames.book(b.name) }; }) });
    }
    return checkers.books;
  }
  /* Is a spelled name this person? Other names count (Abram, Simon Peter);
     another person, or a name as close to one, never does. */
  function whoCheck(guess, answer, items) { return whoChecker(items || bible().whoAmI).check(guess, answer); }
  /* Is a spelled name this book? First Kings, I Kings and Song of Songs count. */
  function bookCheck(guess, name, books) { return booksChecker(books || bible().books).check(guess, name); }

  /* The book a reference is in, by its name in the books list (Psalm 23:1 is in Psalms). */
  function bookNameOfRef(ref, books) {
    var b = bookOfRef(ref);
    var hit = (books || bible().books).filter(function (x) { return FF.BibleNames.book(x.name).indexOf(b) !== -1; })[0];
    return hit ? hit.name : b;
  }

  /* Spelled points: the usual points plus a bonus for spelling it. */
  function spellPoints(pts, correct) { return correct ? pts + SPELL_BONUS : 0; }

  /* ================= labels ================= */

  function levelName(l) {
    return l === 'kids' ? t('bqKids', 'Kids') : l === 'scholar' ? t('bqScholar', 'Bible scholar') : l === 'expert' ? t('expert', 'Expert') : t('bqFamily', 'Family');
  }
  function testamentName(id) {
    return id === 'OT' ? t('oldTestament', 'Old Testament') : id === 'NT' ? t('newTestament', 'New Testament') : t('bgBoth', 'Both testaments');
  }
  function divisionName(id) {
    var d = bible().divisions.filter(function (x) { return x.id === id; })[0];
    return d ? t('bbDiv_' + id, d.name) : id;
  }
  function verseKindName(k) {
    return k === 'where' ? t('bvWhere', 'Where is it?') : t('bvBuild', 'Build the verse');
  }
  function bookKindName(k) {
    return {
      testament: t('bbKindTestament', 'Which testament?'),
      division: t('bbKindDivision', 'Which part?'),
      next: t('bbKindNext', 'What comes next?'),
      order: t('bbKindOrder', 'Put in order')
    }[k] || k;
  }
  function bookKindIcon(k) {
    return { testament: 'scales', division: 'squares-four', next: 'arrow-right', order: 'list-numbers' }[k] || 'book-open';
  }

  /* ================= device helpers ================= */

  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
  function racingNow() { return !!(FF.Race && FF.Race.active && FF.Race.active() && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function sharedRun(config) { return racingNow() || !!config.sharedDeal || !!config.daily || !!config.challenge; }

  function scorerList(config) {
    if (config && config.scorers && config.scorers.length) return config.scorers.slice();
    if (config && config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }

  // The scorer this device plays in a room (scores come from the race).
  function myScorer(scorers) {
    var room = FF.Room && FF.Room.current();
    var uid = room ? room.uid : null;
    return scorers.filter(function (s) { return s.id === uid; })[0] || scorers[0];
  }

  var SEEN_MAX = 600;
  // Ids this device has played. Starts a pool over once nearly all of it is seen.
  function seenFor(key, list, need) {
    var arr = store().get(key, []) || [];
    var s = setOf(arr);
    var fresh = list.filter(function (x) { return !s[x.id]; }).length;
    if (fresh >= Math.max(need, 1)) return s;
    var ids = setOf(list.map(function (x) { return x.id; }));
    try { store().set(key, arr.filter(function (id) { return !ids[id]; })); } catch (e) { /* storage full */ }
    return {};
  }
  function markSeen(key, id) {
    var arr = store().get(key, []) || [];
    arr.push(id);
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    try { store().set(key, arr); } catch (e) { /* storage full */ }
  }

  function levelDots(l) {
    var n = l === 'scholar' ? 3 : l === 'family' ? 2 : 1;
    var box = FF.ui.el('span', { class: 'qm-diff', 'aria-label': levelName(l), title: levelName(l) });
    for (var i = 0; i < 3; i++) box.appendChild(FF.ui.span('qm-diff__dot' + (i < n ? ' is-on' : '')));
    return box;
  }

  function badge(icon, text) {
    var b = FF.ui.span('qm-topic');
    var ic = FF.ui.span('qm-topic__icon');
    ic.style.setProperty('--tc', 'var(--cat-bible)');
    ic.appendChild(FF.Icons.icon(icon));
    b.appendChild(ic);
    b.appendChild(FF.ui.span('', text));
    return b;
  }

  /* The verse card shown after every answer: an optional title, the
     reference, the KJV text and a note. */
  function verseCard(o) {
    var card = FF.ui.div('bq-verse');
    if (o.title) card.appendChild(FF.ui.el('h3', { class: 'bg-card__title' }, o.title));
    if (o.facts) {
      var facts = FF.ui.el('ul', { class: 'bb-facts' });
      o.facts.forEach(function (f) { facts.appendChild(FF.ui.el('li', {}, f)); });
      card.appendChild(facts);
    }
    var head = FF.ui.div('bq-verse__head');
    head.appendChild(FF.Icons.icon('book-open'));
    head.appendChild(FF.ui.span('bq-verse__ref', o.ref));
    card.appendChild(head);
    if (o.text) card.appendChild(FF.ui.el('blockquote', { class: 'bq-verse__text' }, '“' + o.text + '”'));
    if (o.note) card.appendChild(FF.ui.el('p', { class: 'bq-verse__note' }, o.note));
    return card;
  }

  /* One number decides the whole deal. It is drawn first, before anything
     else uses the random source, so a challenge or a room deals the same
     everywhere. Daily, challenge and room runs skip the setup screen. */
  function begin(api, spec, play) {
    if (racingNow()) FF.Random.seed(FF.Random.roundSeed(FF.Room.current().meta.seed, api.def.id, 'deck'));
    var seed = Math.floor(rand0() * 4294967296);
    if (racingNow() || api.config.daily || api.config.challenge) { play(spec.standard, seed); return; }
    setupScreen(api, spec, function (cfg) {
      if (!stillShown(api)) return;
      if (!spec.isStandard(cfg)) api.config.customRules = true;
      play(cfg, seed);
    });
  }

  /* ================= setup screen =================
     spec: { key, name, title, standard, sanitize, isStandard,
             rows: [{ field, label, desc, options: [{ value, label, icon }] }],
             chips: { field, label, all, name(k), icon(k) } or null,
             count(cfg), min, ready(n), start } */
  function setupScreen(api, spec, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var cfg = spec.sanitize(store().get(spec.key, null) || spec.standard);
    var chosen = spec.chips ? setOf(cfg[spec.chips.field].length ? cfg[spec.chips.field] : spec.chips.all) : null;

    var stage = FF.GameUI.stage({ wide: true, className: 'bq bq-setup bg-setup' });
    stage.appendChild(FF.GameUI.kicker(spec.name));
    stage.appendChild(FF.GameUI.prompt(spec.title, 'xl'));

    var rowsBox = FF.ui.el('section', { class: 'settings-section bq-setup__rows' });
    spec.rows.forEach(function (row) {
      rowsBox.appendChild(FF.UI.settingRow(row.label, FF.UI.segmented({
        label: row.label, value: cfg[row.field],
        options: row.options,
        onChange: function (v) { cfg[row.field] = v; api.audio.play('tap'); sync(); }
      }), row.desc));
    });
    stage.appendChild(rowsBox);

    var chipEls = [];
    if (spec.chips) {
      stage.appendChild(FF.ui.el('h3', { class: 'bq-setup__h' }, spec.chips.label));
      var chipRow = FF.ui.el('div', { class: 'bq-types', role: 'group', 'aria-label': spec.chips.label });
      spec.chips.all.forEach(function (k) {
        var chip = FF.UI.chip({
          label: spec.chips.name(k), icon: spec.chips.icon(k), active: !!chosen[k],
          onClick: function () {
            var on = spec.chips.all.filter(function (x) { return chosen[x]; });
            if (chosen[k] && on.length <= 1) { api.audio.play('wrong'); return; }   // keep at least one
            chosen[k] = !chosen[k];
            api.audio.play('tap');
            sync();
          }
        });
        chipRow.appendChild(chip);
        chipEls.push({ el: chip, id: k });
      });
      stage.appendChild(chipRow);
    }

    var foot = FF.ui.div('qm-pick__foot bq-setup__foot');
    var note = FF.ui.el('p', { class: 'qm-pick__summary', 'aria-live': 'polite' });
    foot.appendChild(note);
    var actions = FF.ui.div('nr-setup__actions');
    actions.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () {
        api.audio.play('click');
        try { store().set(spec.key, spec.sanitize(spec.standard)); } catch (e) { /* storage full */ }
        setupScreen(api, spec, onGo);     // redraw, so every control shows the standard choice
      }
    }));
    var startBtn = FF.GameUI.action(spec.start, function () {
      var c = current();
      if (spec.count(c) < spec.min) return;
      api.audio.play('roundStart');
      try { store().set(spec.key, c); } catch (e) { /* storage full */ }
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(c);
    }, { icon: 'play' });
    actions.appendChild(startBtn);
    foot.appendChild(actions);
    stage.appendChild(foot);
    root.appendChild(stage);

    function current() {
      var c = {};
      Object.keys(cfg).forEach(function (k) { c[k] = cfg[k]; });
      if (spec.chips) c[spec.chips.field] = spec.chips.all.filter(function (k) { return chosen[k]; });
      return spec.sanitize(c);
    }

    function sync() {
      var c = current();
      chipEls.forEach(function (x) {
        var on = !!chosen[x.id];
        x.el.classList.toggle('active', on);
        x.el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var n = spec.count(c);
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = n < spec.min
        ? t('bgTooFew', 'Not enough for that mix. Try another level.')
        : spec.ready(n) + ' · ' + spec.summary(c) +
          (ranked && !spec.isStandard(c) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
      startBtn.disabled = n < spec.min;
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= shared game loop pieces ================= */

  /* Expert: a letter-tile board for one name. Decoys come from the other
     choices; the tiles follow the app's difficulty. */
  function spellBoard(api, name, related, seed, round, onSubmit) {
    var set = FF.SpellTiles.deal(name, rng((seed + (round + 1) * 7919) >>> 0), {
      difficulty: api.config.difficulty, related: (related || []).filter(function (r) { return r !== name; })
    });
    return FF.SpellTiles.board(set, { audio: api.audio, onSubmit: onSubmit });
  }
  /* After a spelled answer: how it was read, or why it did not count. */
  function spellNote(spell, right, rightName) {
    if (!spell) return '';
    var x = FF.SpellTiles.feedbackText(spell.text, spell.res, rightName);
    return x ? ' ' + x : '';
  }

  /* Per-player tallies for the recap. */
  function tallies(scorers) {
    var stats = {};
    scorers.forEach(function (e) { stats[e.id] = { c: 0, a: 0 }; });
    return { stats: stats, c: 0, a: 0, add: function (id, right) {
      var s = stats[id] || (stats[id] = { c: 0, a: 0 });
      s.a++; this.a++;
      if (right) { s.c++; this.c++; }
    } };
  }

  function finishGame(api, totals) {
    var res = api.scoring.results ? api.scoring.results() : null;
    var ranked = (res && res.results) || [];
    var best = 0;
    ranked.forEach(function (r) { if (r.bestStreak > best) best = r.bestStreak; });
    api.audio.play('winner');
    api.end({
      results: ranked, winnerId: res ? res.winnerId : null, bestStreak: best,
      quizCorrect: totals.c, quizAnswered: totals.a
    });
  }

  /* How everyone did, and what the game met, before the results. */
  function recap(api, o) {
    var root = api.shell.root;
    FF.ui.clear(root);
    var totals = o.totals;
    var stage = FF.GameUI.stage({ className: 'qm-recap bq-recap bg-recap' });
    var pct = totals.a ? Math.round(totals.c / totals.a * 100) : 0;
    var ring = FF.ui.div('qm-ring');
    ring.style.setProperty('--p', String(pct));
    ring.appendChild(FF.ui.span('qm-ring__num', pct + '%'));
    stage.appendChild(ring);
    stage.appendChild(FF.GameUI.kicker(o.kicker));
    stage.appendChild(FF.GameUI.prompt(t('qmRecapTitle', '{c} of {a} right', { c: totals.c, a: totals.a }), 'xl'));

    var people = FF.ui.el('ul', { class: 'qm-people' });
    o.scorers.slice().sort(function (a, b) {
      return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0);
    }).forEach(function (e) {
      var s = totals.stats[e.id] || { c: 0, a: 0 };
      var li = FF.ui.el('li', { class: 'qm-person' });
      var ava = FF.ui.span('qm-person__ava');
      if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
      li.appendChild(ava);
      var who = FF.ui.div('qm-person__who');
      who.appendChild(FF.ui.span('qm-person__name', e.name || t('playerLabel', 'Player')));
      var rec = (api.scoring.record && api.scoring.record(e.id)) || {};
      var bits = [t('qmRightOf', '{c}/{a} right', { c: s.c, a: s.a })];
      if (rec.bestStreak > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: rec.bestStreak }));
      who.appendChild(FF.ui.span('qm-person__meta', bits.join(' · ')));
      li.appendChild(who);
      li.appendChild(FF.ui.span('qm-person__score', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
      people.appendChild(li);
    });
    stage.appendChild(people);
    if (o.extra) o.extra(stage);
    stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () { finishGame(api, totals); }, { icon: 'trophy' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* The bar at the top of a round, with a streak pill in local play. */
  function roundBar(api, entity, showEntity, round, rounds, racing) {
    var bar = FF.GameUI.turnBar(showEntity ? entity : null, FF.GameUI.roundText(round + 1, rounds));
    var rec = api.scoring.record ? api.scoring.record(entity.id) : null;
    if (!racing && rec && rec.streak >= 2) bar.appendChild(FF.GameUI.pill(t('streakN', 'Streak {n}', { n: rec.streak }), 'flame', 'streak'));
    return bar;
  }

  /* Tap the items in order: each tap fills the next slot; tap a filled slot to
     undo. The last tap calls onDone with the placed option indexes. */
  function orderBoard(api, q, onDone, optClass) {
    var el = FF.ui.div('bq-order');
    var slots = FF.ui.el('ol', { class: 'bq-order__slots', 'aria-label': t('bqYourOrder', 'Your order') });
    var poolBox = FF.ui.el('div', { class: 'bq-order__pool', role: 'group', 'aria-label': t('bgToPlace', 'To place') });
    el.appendChild(slots);
    el.appendChild(poolBox);
    var placed = [];
    var locked = false;
    var slotEls = q.options.map(function (o, i) {
      var li = FF.ui.el('li', { class: 'bq-slot' });
      li.appendChild(FF.ui.span('bq-slot__n', String(i + 1)));
      var b = FF.ui.el('button', { type: 'button', class: 'bq-slot__btn ' + optClass, disabled: true });
      b.addEventListener('click', function () {
        if (locked || i >= placed.length) return;
        placed.splice(i, 1);
        api.audio.play('tap');
        draw();
      });
      li.appendChild(b);
      slots.appendChild(li);
      return { li: li, btn: b };
    });
    var buttons = q.options.map(function (label, i) {
      var b = FF.ui.el('button', { type: 'button', class: 'word-chip bq-event ' + optClass }, label);
      b.addEventListener('click', function () {
        if (locked || placed.indexOf(i) !== -1) return;
        placed.push(i);
        api.audio.play('tap');
        draw();
        if (placed.length === q.options.length) { locked = true; onDone(placed.slice()); }
      });
      poolBox.appendChild(b);
      return b;
    });
    function draw() {
      slotEls.forEach(function (s, i) {
        var has = i < placed.length;
        s.btn.textContent = has ? q.options[placed[i]] : '';
        s.btn.disabled = locked || !has;
        s.btn.setAttribute('aria-label', has ? t('bqTakeBack', 'Take back {w}', { w: q.options[placed[i]] }) : t('bqEmptySlot', 'Empty'));
        s.li.classList.toggle('is-filled', has);
      });
      buttons.forEach(function (b, i) { b.hidden = placed.indexOf(i) !== -1; });
    }
    draw();
    return {
      el: el,
      buttons: buttons,
      lock: function () { locked = true; draw(); buttons.forEach(function (b) { b.disabled = true; }); },
      // Mark each slot, then list the right order underneath.
      reveal: function (placedNow) {
        locked = true;
        if (placedNow) placed = placedNow;
        draw();
        buttons.forEach(function (b) { b.disabled = true; });
        slotEls.forEach(function (s, i) {
          var ok = i < placed.length && q.options[placed[i]] === q.correct[i];
          s.li.classList.add(ok ? 'is-right' : 'is-wrong');
          s.li.appendChild(FF.ui.span('sr-only', ok ? t('correctAnswer', 'Correct answer') : t('wrongAnswer', 'Wrong answer')));
        });
        if (!isRightOrder(q, placed)) {
          var right = FF.ui.el('ol', { class: 'bq-order__right', 'aria-label': t('bqRightOrder', 'Here is the right order.') });
          q.correct.forEach(function (c) { right.appendChild(FF.ui.el('li', {}, c)); });
          el.appendChild(right);
        }
        poolBox.hidden = true;
      }
    };
  }

  /* ================= Books of the Bible in a room =================
     A sprint of books per round, the same books on every phone (FF.Parallel).
     Right answers score 80 plus 10 a streak; a finished sprint adds a speed
     bonus, scaled by how many were right. */
  var BOOKS_PER_SPRINT = 6;

  function booksPoints(st, ms, limitMs) {
    var speed = st.total ? FF.Parallel.speedBonus(ms, limitMs, 100) * st.right / st.total : 0;
    return Math.round(st.points + speed);
  }

  function bibleBooksOnline(api, books) {
    FF.Parallel.seed(api, 'books');
    var deck = api.util.shuffle(books.slice());
    var per = Math.min(BOOKS_PER_SPRINT, deck.length);
    FF.Parallel.run(api, {
      rounds: 3,
      available: Math.floor(deck.length / per),
      seconds: 30,
      gate: '.gm-duo-btn',
      play: function (n, ctx) {
        var sprint = [];
        for (var k = 0; k < per; k++) sprint.push(deck[(n * per + k) % deck.length]);
        var idx = 0;
        var st = { points: 0, right: 0, total: per };
        var streak = 0;
        var open = false;
        var over = false;

        var wrap = FF.GameUI.stage({ className: 'bq bb' });
        wrap.appendChild(ctx.live);
        var slot = FF.ui.div('');
        wrap.appendChild(slot);
        api.shell.root.appendChild(wrap);

        function result(ms) {
          return { value: booksPoints(st, ms, ctx.limitMs), right: st.right, total: st.total };
        }

        function card() {
          FF.ui.clear(slot);
          var book = sprint[idx];
          slot.appendChild(FF.GameUI.turnBar(null, ctx.roundText + ' · ' + t('bookOf', 'Book {n} of {total}', { n: idx + 1, total: per })));
          var c = FF.ui.div('qm-card bq-card bb-card');
          c.appendChild(FF.GameUI.kicker(t('whichTestament', 'Which testament?')));
          c.appendChild(FF.ui.el('h2', { class: 'bb-book' }, book.name));
          c.appendChild(FF.GameUI.note(t('chaptersN', '{n} chapters', { n: book.chapters })));
          slot.appendChild(c);
          var row = FF.GameUI.duo();
          var ot = FF.GameUI.duoButton(t('oldTestament', 'Old Testament'), function () { pick('OT', ot); }, 'up', 'scroll');
          var nt = FF.GameUI.duoButton(t('newTestament', 'New Testament'), function () { pick('NT', nt); }, 'down', 'book-open');
          row.appendChild(ot);
          row.appendChild(nt);
          slot.appendChild(row);
          var picked = false;
          function pick(choice, btn) {
            if (picked || !open || over) return;
            picked = true;
            var right = choice === book.testament;
            ot.disabled = true;
            nt.disabled = true;
            FF.GameUI.markOption(book.testament === 'OT' ? ot : nt, 'correct');
            if (!right) FF.GameUI.markOption(btn, 'wrong');
            if (right) {
              streak++;
              st.right++;
              st.points += 80 + streak * 10;
              api.audio.play('correct');
            } else {
              streak = 0;
              api.audio.play('wrong');
            }
            setTimeout(function () {
              if (over || !slot.isConnected) return;
              idx++;
              if (idx < per) { card(); return; }
              over = true;
              ctx.done(result(ctx.elapsed()));
            }, right ? 450 : 1000);
          }
        }
        card();

        return {
          start: function () { open = true; },
          stop: function () { over = true; return result(null); }
        };
      },
      describe: function () {
        return { kind: 'card', text: t('booksWatch', 'Old or New Testament? Everyone sorts the same {n} books', { n: per }) };
      },
      detail: function (a) {
        var line = t('booksRight', '{c} of {n} right', { c: a.right || 0, n: a.total || 0 });
        return a.out ? line : line + ' · ' + FF.Parallel.clock(a.ms);
      }
    });
  }

  /* ============================================================
     WHO AM I? (BIBLE EDITION)
     ============================================================ */
  // A new clue every 8 s, so four clues need about 32 s to read.
  var WHO_ONLINE_MIN_SECS = 40;
  var WHO_SEEN = 'bibleWhoSeen';
  var STREAK_EVERY = 3;
  var STREAK_BONUS = 50;

  function levelOptions() { return LEVELS.map(function (l) { return { value: l, label: levelName(l) }; }); }

  function whoSpec() {
    return {
      key: 'bibleWhoAmI:setup', name: t('bwName', 'Who Am I?'), title: t('bwSetupTitle', 'Set up Who Am I?'),
      standard: WHO_STANDARD, sanitize: whoSanitize, isStandard: whoIsStandard,
      rows: [
        { field: 'level', label: t('bqLevel', 'Level'), desc: t('bwLevelDesc2', 'Kids meets the best-known people. Bible scholar meets the ones you have to dig for. Expert: spell the name with letter tiles (other names like Abram or Simon Peter count too).'), options: levelOptions() },
        { field: 'testament', label: t('bgTestament', 'Testament'), options: [
          { value: 'all', label: t('bgBoth', 'Both') }, { value: 'OT', label: t('bgOld', 'Old') }, { value: 'NT', label: t('bgNew', 'New') }
        ] },
        { field: 'pace', label: t('bwClues', 'Clues'), desc: t('bwCluesDesc', 'A new clue every 8 seconds, or only when you ask. Each clue lowers the points.'), options: [
          { value: 'auto', label: t('bwAuto', 'Every 8 seconds'), icon: 'timer' }, { value: 'tap', label: t('bwTap', 'When I ask'), icon: 'hand-tap' }
        ] }
      ],
      chips: null,
      count: function (c) { return whoPool(bible().whoAmI, c).length; },
      min: 4,
      ready: function (n) { return t('bwNReady', '{n} people of the Bible', { n: n }); },
      summary: function (c) { return levelName(c.level) + ' · ' + testamentName(c.testament); },
      start: t('bgStart', 'Start')
    };
  }

  function playWho(api) {
    return function (chosen, seed) {
      var config = api.config;
      var data = bible();
      var all = scorerList(config);
      var racing = racingNow();
      var scorers = racing ? [myScorer(all)] : all;
      var n = scorers.length;
      var c = whoSanitize(chosen);
      var list = whoPool(data.whoAmI, c);
      var timed = FF.GameLength.timed(config);
      var rounds = FF.GameLength.rounds(api, 6, list.length);
      if (!racing && !timed && n > 1) rounds = Math.ceil(rounds / n) * n;
      var shared = sharedRun(config);
      var want = Math.min(rounds, list.length);
      var deck = whoDeal(data.whoAmI, c, rng(seed), want, shared ? null : seenFor(WHO_SEEN, list, want));
      var spelling = isSpelled(c) && !racing;
      if (timed) FF.GameLength.manual();
      var autoClues = racing || c.pace === 'auto';
      var totals = tallies(scorers);
      var met = [];          // { name, right, clue } for the recap

      // A room's answer clock leaves time to read every clue.
      var timerSecs = config.timer > 0 ? Math.max(config.timer, WHO_ONLINE_MIN_SECS) : 0;
      var race = racing ? FF.Race.forGame(api, {
        rounds: rounds,
        timerMs: timerSecs * 1000,
        // 'button' gates the Another clue button too.
        optionSelector: 'button',
        pointsFor: function (answer) { return answer.value || 0; }
      }) : null;

      var round = 0;
      var clueLevel = 1;
      var clueTimer = null;
      var resolved = false;
      var settled = false;
      var current = null;

      var offSettle = race ? race.onSettle(function (payload) {
        if (settled) return;
        settled = true;
        resolved = true;
        stopClues();
        api.shell.hideTimer();
        totals.a++;
        if (payload && payload.winnerId) totals.c++;
        race.showResult(payload, {
          answerText: current ? current.answer : null,
          isLast: race.isLastRound(round, rounds),
          onNext: function () { next(); }
        });
      }) : null;

      function over() {
        if (round >= rounds) return true;
        if (race && race.over && race.over(round)) return true;
        return timed && FF.GameLength.timeUp() && round % n === 0;
      }
      function next() {
        round++;
        if (over()) { finish(); return; }
        render();
      }
      function stopClues() { if (clueTimer) { clearInterval(clueTimer); clueTimer = null; } }

      function render() {
        var item = deck[round % deck.length];
        current = item;
        if (!shared) markSeen(WHO_SEEN, item.id);
        resolved = false;
        settled = false;
        clueLevel = 1;
        var entity = scorers[round % n];
        // Begun first, so every device opens the round together.
        var opening = race ? race.beginRound(round) : null;
        api.shell.updateScores(entity.id);
        // For people watching: the first clue and the names (the answer is shared after the round).
        if (race) race.describe({ kind: 'choice', text: t('whoAmIBible', 'Who am I?') + ' ' + item.clues[0], options: item.choices }, item.choices.indexOf(item.answer));

        var root = api.shell.root;
        FF.ui.clear(root);
        var stage = FF.GameUI.stage({ className: 'qm bq bw' });
        stage.appendChild(roundBar(api, entity, !racing && n > 1, round, rounds, racing));

        var card = FF.ui.div('qm-card bq-card bw-card');
        var head = FF.ui.div('qm-card__head');
        head.appendChild(badge('detective', t('whoAmIBible', 'Who am I?')));
        head.appendChild(levelDots(item.level));
        card.appendChild(head);
        var clueList = FF.ui.el('ol', { class: 'bw-clues', 'aria-live': 'polite', 'aria-label': t('clues', 'Clues') });
        card.appendChild(clueList);
        var tools = FF.ui.div('bw-tools');
        var worth = FF.ui.span('bw-worth', '');
        tools.appendChild(worth);
        var clueBtn = FF.UI.button(t('nextClue', 'Another clue'), { class: 'btn-sm', icon: 'plus', onClick: function () { advanceClue(); } });
        tools.appendChild(clueBtn);
        card.appendChild(tools);
        stage.appendChild(card);

        var grid, btns = [], board = null;
        if (spelling) {
          board = spellBoard(api, item.answer, item.choices, seed, round, function (text) {
            if (resolved) return;
            var res = whoCheck(text, item.answer, data.whoAmI);
            guess(res.ok ? item.answer : null, null, { text: text, res: res });
          });
          grid = board.el;
        } else {
          grid = FF.GameUI.options({ columns: 'auto' });
          btns = item.choices.map(function (name, ci) {
            var b = FF.GameUI.option(name, function () { if (!resolved) guess(name, b); }, ci, { className: 'bible-who-option qm-opt' });
            b.dataset.answer = name;
            grid.appendChild(b);
            return b;
          });
        }
        stage.appendChild(grid);
        var after = FF.ui.div('qm-after');
        stage.appendChild(after);
        root.appendChild(stage);

        // Every clue has its row from the start (locked until it opens), so the
        // names never move under a finger when a clue arrives.
        function drawClues(all) {
          FF.ui.clear(clueList);
          item.clues.forEach(function (text, i) {
            var shown = all || i < clueLevel;
            var li = FF.ui.el('li', { class: 'bw-clue' + (i === clueLevel - 1 && !all ? ' bw-clue--new' : '') +
              (all && i >= clueLevel ? ' bw-clue--later' : '') + (shown ? '' : ' bw-clue--locked') });
            li.appendChild(FF.ui.span('bw-clue__n', String(i + 1)));
            if (shown) li.appendChild(FF.ui.span('bw-clue__text', text));
            else {
              li.appendChild(FF.ui.span('bw-clue__text', t('bwLocked', 'Clue {n}, worth {p}', { n: i + 1, p: whoPoints(i + 1) })));
              li.setAttribute('aria-hidden', 'true');
            }
            clueList.appendChild(li);
          });
          worth.textContent = all ? '' : t('bwWorth', 'Worth {n}', { n: whoPoints(clueLevel) });
          clueBtn.disabled = all || resolved || clueLevel >= item.clues.length;
          clueBtn.hidden = !!all;
        }

        function advanceClue() {
          if (resolved || clueLevel >= item.clues.length || current !== item) return;
          clueLevel++;
          api.audio.play('select');
          drawClues(false);
          if (clueLevel >= item.clues.length) stopClues();
        }

        function startClues() {
          stopClues();
          if (!autoClues) return;
          clueTimer = setInterval(function () {
            if (resolved || current !== item || clueList.isConnected === false) { stopClues(); return; }
            advanceClue();
          }, WHO_CLUE_MS);
        }

        drawClues(false);
        if (race) {
          // Nobody can guess, or open a clue, before the round opens for everyone.
          var buttons = FF.ui.$$('button', stage);
          buttons.forEach(function (b) { b.disabled = true; });
          var thisRound = round;
          opening.then(function () {
            race.gate(function () {
              if (resolved || round !== thisRound) return;
              buttons.forEach(function (b) { b.disabled = false; });
              drawClues(false);
              startClues();
              if (timerSecs > 0) api.shell.setTimer(timerSecs, function () { lockOut(); });
            });
          });
        } else {
          startClues();
          if (board) board.open();
        }
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(grid);

        // Out of time in a room: stop here and let the round settle for everyone.
        function lockOut() {
          if (resolved) return;
          resolved = true;
          stopClues();
          FF.ui.$$('button', stage).forEach(function (b) { b.disabled = true; });
        }

        function guess(chosenName, btn, spell) {
          resolved = true;
          stopClues();
          if (board) board.finish(chosenName === item.answer);
          clueBtn.disabled = true;
          var isCorrect = chosenName === item.answer;
          if (race) {
            // Worth what it was on THIS device's clue count, so send it along.
            // A wrong name locks this player out while the others play on.
            race.submit(chosenName, isCorrect, null, { value: isCorrect ? whoPoints(clueLevel) : 0 });
            btns.forEach(function (b) { b.disabled = true; if (b === btn) FF.GameUI.markOption(b, 'picked'); });
            clueBtn.disabled = true;
            after.appendChild(FF.GameUI.feedback('info', t('bqLockedIn', 'Answer locked in. Waiting for everyone…')));
            return;
          }
          btns.forEach(function (b) {
            b.disabled = true;
            if (b.dataset.answer === item.answer) FF.GameUI.markOption(b, 'correct');
            else if (b === btn) FF.GameUI.markOption(b, 'wrong');
            else FF.GameUI.markOption(b, 'dim');
          });
          totals.add(entity.id, isCorrect);
          met.push({ name: item.answer, right: isCorrect, clue: clueLevel });
          if (isCorrect) {
            var pts = spell ? spellPoints(whoPoints(clueLevel), true) : whoPoints(clueLevel);
            api.scoring.add(entity.id, pts, { correct: true });
            var r = api.scoring.record ? api.scoring.record(entity.id) : null;
            var streak = !!(r && r.streak > 0 && r.streak % STREAK_EVERY === 0);
            if (streak) api.scoring.add(entity.id, STREAK_BONUS);
            api.audio.play(streak ? 'streak' : 'correct');
            after.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts + (streak ? STREAK_BONUS : 0)) +
              ' ' + t('bwOnClue', 'on clue {n}.', { n: clueLevel }) + (streak ? ' ' + t('streakBonus', 'Streak bonus!') : '') + spellNote(spell, true, item.answer)));
          } else {
            api.scoring.add(entity.id, 0, { wrong: true });
            if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
            api.audio.play('wrong');
            after.appendChild(FF.GameUI.feedback('bad', t('itWasName', 'It was {name}.', { name: item.answer }) + spellNote(spell, false, item.answer)));
          }
          drawClues(true);
          after.appendChild(verseCard({
            title: item.answer, ref: item.ref, text: item.verse,
            note: t('bwReadStory', 'Read the story: {where}', { where: item.story })
          }));
          var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
          var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('next', 'Next'), function () { api.audio.play('click'); next(); }, { class: 'btn-lg' });
          after.appendChild(nextBtn);
          api.shell.updateScores(entity.id);
          if (FF.Nav && FF.Nav.focus) FF.Nav.focus(nextBtn);
        }
      }

      function finish() {
        stopClues();
        if (offSettle) offSettle();
        api.shell.hideTimer();
        if (race) { race.end(); finishGame(api, totals); return; }
        recap(api, {
          kicker: t('bwRecapKicker', 'Who Am I? recap'), scorers: scorers, totals: totals,
          extra: function (stage) {
            if (!met.length) return;
            stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('bwMet', 'People you met')));
            var ul = FF.ui.el('ul', { class: 'bw-met' });
            met.forEach(function (m) {
              var li = FF.ui.el('li', { class: m.right ? 'is-right' : 'is-wrong' });
              li.appendChild(FF.Icons.icon(m.right ? 'check' : 'x'));
              li.appendChild(FF.ui.span('', m.name));
              if (m.right) li.appendChild(FF.ui.span('bw-met__clue', t('bwClueN', 'clue {n}', { n: m.clue })));
              ul.appendChild(li);
            });
            stage.appendChild(ul);
          }
        });
      }

      render();
    };
  }

  FF.registerGame({
    id: 'bibleWhoAmI',
    name: 'Who Am I? (Bible)',
    description: 'Four clues, hardest first, about one of 68 people of the Bible. Guess early for the most points.',
    category: 'bible',
    icon: '🔍',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['mystery', 'faith', 'riddle', 'characters'],
    modes: ['solo', 'turn', 'team', 'everyone'],
    defaultMode: 'turn',
    howToPlay: [
      'Pick a level (Kids, Family, Bible scholar or Expert), a testament, and whether clues come by themselves.',
      'Clues appear one at a time, hardest first. Pick the person from four names, or on Expert spell the name with letter tiles (50 bonus points).',
      'The first clue is worth 300 points, then 225, 150 and 75. Three right in a row earns a bonus.',
      'A wrong name ends that person. After each answer, read a verse about them and where their story is.'
    ],
    start: function (api) {
      var data = bible();
      if (!data.whoAmI || !data.whoAmI.length) {
        FF.GameUI.exitCard(api, t('noPeople', 'People not loaded'));
        return;
      }
      begin(api, whoSpec(), playWho(api));
    }
  });

  /* ============================================================
     VERSE RUSH
     ============================================================ */
  var VERSE_SEEN = 'bibleVerseSeen';
  var EXTRA_SECS_PER_TILE = 2;    // longer builds get more time (local play)

  function verseSpec() {
    return {
      key: 'bibleVerseRush:setup', name: t('bvName', 'Verse Rush'), title: t('bvSetupTitle', 'Set up Verse Rush'),
      standard: VERSE_STANDARD, sanitize: verseSanitize, isStandard: verseIsStandard,
      rows: [
        { field: 'level', label: t('bqLevel', 'Level'), desc: t('bvLevelDesc2', 'Kids builds short, well-known verses in a few pieces. Bible scholar builds long ones in more pieces. Expert: spell the book for Where is it? with letter tiles.'), options: levelOptions() }
      ],
      chips: { field: 'kinds', label: t('bvKinds', 'Kinds of round'), all: VERSE_KINDS, name: verseKindName, icon: function (k) { return k === 'where' ? 'map-pin' : 'puzzle-piece'; } },
      count: function (c) { return versePool(bible().verses, c).length; },
      min: 4,
      ready: function (n) { return t('bvNReady', '{n} verses ready', { n: n }); },
      summary: function (c) { return levelName(c.level) + ' · ' + (c.kinds.length ? c.kinds.map(verseKindName).join(', ') : t('bvBoth', 'Build and where is it')); },
      start: t('bgStart', 'Start')
    };
  }

  function playVerse(api) {
    return function (chosen, seed) {
      var config = api.config;
      var data = bible();
      var all = scorerList(config);
      var racing = racingNow();
      var scorers = racing ? [myScorer(all)] : all;
      var n = scorers.length;
      var c = verseSanitize(chosen);
      var list = versePool(data.verses, c);
      var timed = FF.GameLength.timed(config);
      var rounds = FF.GameLength.rounds(api, 6, list.length);
      if (!racing && !timed && n > 1) rounds = Math.ceil(rounds / n) * n;
      var shared = sharedRun(config);
      var want = Math.min(rounds, list.length);
      var deck = verseDeal(data.verses, c, rng(seed), want, shared ? null : seenFor(VERSE_SEEN, list, want), racing);
      var spelling = isSpelled(c) && !racing;
      if (timed) FF.GameLength.manual();
      var base = config.timer != null ? Number(config.timer) : 20;
      var timerSecs = config.timer != null ? config.timer : 30;   // in a room, as before
      var totals = tallies(scorers);
      var learnt = [];

      // ---- Race support: everyone builds the same verse at once, and every
      // finished verse scores by its place. ----
      var race = racing ? FF.Race.forGame(api, {
        rounds: rounds,
        mode: 'ranked',
        timerMs: timerSecs * 1000,
        optionSelector: '.verse-play',
        pointsFor: function (answer, place) { return versePlacePoints(place); }
      }) : null;

      var round = 0;
      var current = null;
      var settled = false;

      var offSettle = race ? race.onSettle(function (payload) {
        if (settled) return;
        settled = true;
        api.shell.hideTimer();
        api.shell.setOnTick(null);
        totals.a++;
        if (payload && payload.winnerId) totals.c++;
        race.showResult(payload, {
          answerText: current ? current.part : null,
          isLast: race.isLastRound(round, rounds),
          onNext: function () { next(); }
        });
      }) : null;

      function over() {
        if (round >= rounds) return true;
        if (race && race.over && race.over(round)) return true;
        return timed && FF.GameLength.timeUp() && round % n === 0;
      }
      function next() {
        round++;
        if (over()) { finish(); return; }
        render();
      }

      function render() {
        var q = deck[round % deck.length];
        current = q;
        settled = false;
        if (!shared) markSeen(VERSE_SEEN, q.id);
        if (learnt.length < 6 && !learnt.some(function (v) { return v.ref === q.ref; })) learnt.push(q);
        var entity = scorers[round % n];
        // Begun first, so every device opens the round together.
        var opening = race ? race.beginRound(round) : null;
        api.shell.updateScores(entity.id);
        api.shell.hideTimer();
        // For people watching: the reference and the scattered pieces.
        if (race) race.describe({ kind: 'card', text: q.ref + ': ' + q.pool.join(' · ') }, null);

        var root = api.shell.root;
        FF.ui.clear(root);
        var stage = FF.GameUI.stage({ className: 'qm bq bv' });
        stage.appendChild(roundBar(api, entity, !racing && n > 1, round, rounds, racing));
        var card = FF.ui.div('qm-card bq-card bv-card');
        var head = FF.ui.div('qm-card__head');
        head.appendChild(badge(q.kind === 'where' ? 'map-pin' : 'puzzle-piece', verseKindName(q.kind)));
        head.appendChild(levelDots(q.level));
        card.appendChild(head);
        stage.appendChild(card);
        var after = FF.ui.div('qm-after');
        if (q.kind === 'where') renderWhere(q, entity, stage, card, after, opening);
        else renderBuild(q, entity, stage, card, after, opening);
        stage.appendChild(after);
        root.appendChild(stage);
      }

      /* After an answer in local play: the verse, then Next. */
      function afterAnswer(after, entity, q) {
        after.appendChild(verseCard({ ref: q.ref, text: q.text }));
        var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('next', 'Next'), function () { api.audio.play('click'); next(); }, { class: 'btn-lg' });
        after.appendChild(nextBtn);
        api.shell.updateScores(entity.id);
        if (FF.Nav && FF.Nav.focus) FF.Nav.focus(nextBtn);
      }

      function score(entity, right, pts, after, okText, badText) {
        totals.add(entity.id, right);
        if (right) {
          api.scoring.add(entity.id, pts, { correct: true });
          api.audio.play('correct');
          after.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts) + (okText ? ' ' + okText : '')));
        } else {
          api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          after.appendChild(FF.GameUI.feedback('bad', badText));
        }
      }

      function renderWhere(q, entity, stage, card, after, opening) {
        card.appendChild(FF.GameUI.prompt(t('bvWhereQ', 'Where is this verse?'), 'md'));
        card.appendChild(FF.ui.el('blockquote', { class: 'bq-quote' }, '“' + q.text + '”'));
        var book = bookNameOfRef(q.ref, data.books);
        if (spelling) card.appendChild(FF.GameUI.sub(t('bvSpellBook', 'Spell the book it is in.')));
        var seconds = base > 0 ? base + (spelling ? SPELL_EXTRA_SECS : 0) : 0;
        var meter = null;
        if (seconds) {
          meter = FF.GameUI.meter(1);
          meter.classList.add('qm-time');
          meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
          card.appendChild(meter);
        }
        var group, btns = [], board = null;
        var done = false;
        var started = Date.now();
        if (spelling) {
          board = spellBoard(api, book, q.options.map(function (r) { return bookNameOfRef(r, data.books); }), seed, round, function (text) {
            answer(-1, false, { text: text, res: bookCheck(text, book, data.books) });
          });
          group = board.el;
        } else {
          group = FF.GameUI.options({ columns: 2 });
          btns = q.options.map(function (label, i) {
            var b = FF.GameUI.option(label, function () { answer(i); }, i, { className: 'verse-play qm-opt' });
            group.appendChild(b);
            return b;
          });
        }
        stage.appendChild(group);
        if (board) board.open();
        if (seconds) {
          api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
          api.shell.setTimer(seconds, function () { answer(-1, true); });
        }
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(group);
        function answer(i, timeout, spell) {
          if (done) return;
          done = true;
          api.shell.setOnTick(null);
          api.shell.hideTimer();
          var ms = Date.now() - started;
          var right = !timeout && (spell ? spell.res.ok : i === q.answer);
          if (board) board.finish(right);
          btns.forEach(function (b, k) {
            b.disabled = true;
            if (k === q.answer) FF.GameUI.markOption(b, 'correct');
            else if (k === i) FF.GameUI.markOption(b, 'wrong');
            else FF.GameUI.markOption(b, 'dim');
          });
          score(entity, right, board ? spellPoints(wherePoints(right, ms), right) : wherePoints(right, ms), after,
            spellNote(spell, true, book).trim(),
            (timeout ? t('timesUp', 'Time’s up!') : t('notQuite', 'Not quite.')) + ' ' + t('bvItIs', 'It is {ref}.', { ref: q.ref }) + spellNote(spell, false, book));
          afterAnswer(after, entity, q);
        }
      }

      function renderBuild(q, entity, stage, card, after, opening) {
        card.appendChild(FF.ui.el('h2', { class: 'bv-ref' }, q.ref));
        card.appendChild(FF.GameUI.sub(q.before || q.after
          ? t('bvRulePart', 'Tap the pieces in order to finish the verse.')
          : t('bvRule', 'Tap the pieces in order to build the verse.')));
        if (q.before) card.appendChild(FF.ui.el('p', { class: 'bv-context' }, '“' + q.before + ' …'));
        var seconds = racing ? timerSecs : (base > 0 ? base + EXTRA_SECS_PER_TILE * Math.max(0, q.tiles.length - 4) : 0);
        var meter = null;
        if (seconds && !racing) {
          meter = FF.GameUI.meter(1);
          meter.classList.add('qm-time');
          meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
          card.appendChild(meter);
        }

        var buildBox = FF.ui.el('div', { class: 'verse-build', 'aria-live': 'polite', 'aria-label': t('yourVerse', 'Your verse') });
        stage.appendChild(buildBox);
        if (q.after) stage.appendChild(FF.ui.el('p', { class: 'bv-context' }, '… ' + q.after + '”'));
        var poolBox = FF.ui.el('div', { class: 'verse-pool', role: 'group', 'aria-label': t('wordsToUse', 'Words to use') });
        stage.appendChild(poolBox);
        var actionRow = FF.ui.div('gm-row bv-tools');
        stage.appendChild(actionRow);

        // In a room nothing can be tapped before the round opens for everyone.
        var open = !race;
        var solved = false;
        var placed = [];                  // tile texts, in the order tapped
        var pool = q.pool.slice();
        var keep = 0;                     // pieces from the start known to be right
        var mistakes = 0;
        var hints = 0;
        var started = Date.now();

        actionRow.appendChild(FF.UI.button(t('startOver', 'Start over'), {
          icon: 'restart', class: 'verse-play',
          onClick: function () {
            if (solved || !open) return;
            pool = pool.concat(placed.slice(keep));
            placed = placed.slice(0, keep);
            draw();
          }
        }));
        if (!race) {
          actionRow.appendChild(FF.UI.button(t('bvHint', 'Hint'), {
            icon: 'lightbulb', class: 'verse-play',
            onClick: function () {
              if (solved || !open) return;
              // Put back anything after the right start, then place the next right piece.
              keep = rightSoFar(q, placed);
              pool = pool.concat(placed.slice(keep));
              placed = placed.slice(0, keep);
              var want = q.tiles[placed.length];
              var at = pool.indexOf(want);
              if (at === -1) return;
              pool.splice(at, 1);
              placed.push(want);
              keep = placed.length;
              hints++;
              api.audio.play('flip');
              draw();
              if (placed.length === q.tiles.length) check();
            }
          }));
        }
        actionRow.appendChild(FF.UI.button(race ? t('giveUp', 'Give up') : t('bvShowMe', 'Show me'), {
          icon: 'flag', class: 'verse-play',
          onClick: function () {
            if (solved || !open) return;
            solved = true;
            lockBoard();
            if (race) { race.submit(null, false, null); return; }
            stopTimer();
            reveal();
            score(entity, false, 0, after, '', t('bvHereItIs', 'Here is the verse.'));
            afterAnswer(after, entity, q);
          }
        }));

        function lockBoard() { FF.ui.$$('.verse-play', stage).forEach(function (b) { b.disabled = true; }); }
        function stopTimer() { api.shell.setOnTick(null); api.shell.hideTimer(); }
        function reveal() {
          placed = q.tiles.slice();
          pool = [];
          draw();
          buildBox.classList.add('verse-build--shown');
        }

        function draw() {
          FF.ui.clear(buildBox);
          FF.ui.clear(poolBox);
          if (!placed.length) buildBox.appendChild(FF.ui.span('verse-build__empty', t('tapWordsInOrder', 'Tap the words below in order…')));
          placed.forEach(function (word, idx) {
            buildBox.appendChild(FF.ui.el('button', {
              type: 'button',
              class: 'word-chip word-chip--placed verse-play' + (idx < keep ? ' is-right' : ''),
              disabled: !open || solved || idx < keep,
              'aria-label': t('removeWord', 'Remove {w}', { w: word }),
              onclick: function () {
                if (solved || !open || idx < keep) return;
                placed.splice(idx, 1);
                pool.push(word);
                api.audio.play('tap');
                draw();
              }
            }, word));
          });
          pool.forEach(function (word, idx) {
            poolBox.appendChild(FF.ui.el('button', {
              type: 'button',
              class: 'word-chip verse-play',
              disabled: !open || solved,
              onclick: function () {
                if (solved || !open) return;
                pool.splice(idx, 1);
                placed.push(word);
                api.audio.play('tap');
                draw();
                if (placed.length === q.tiles.length) check();
              }
            }, word));
          });
        }

        function check() {
          if (isRightBuild(q, placed)) {
            solved = true;
            stopTimer();
            buildBox.classList.add('verse-build--good');
            keep = placed.length;
            draw();
            lockBoard();
            if (race) {
              // Scored by finishing place once everyone is done.
              api.audio.play('correct');
              after.appendChild(FF.GameUI.feedback('good', t('verseDoneWait', 'Verse complete! Waiting for everyone else.')));
              race.submit(placed.join(' '), true, null);
              return;
            }
            var pts = buildPoints(Date.now() - started, seconds * 1000, mistakes, hints);
            score(entity, true, pts, after, mistakes || hints ? '' : t('bvClean', 'No mistakes!'), '');
            afterAnswer(after, entity, q);
            return;
          }
          // Keep the right start, send the rest back to try again.
          mistakes++;
          keep = rightSoFar(q, placed);
          pool = pool.concat(placed.slice(keep));
          placed = placed.slice(0, keep);
          api.audio.play('wrong');
          buildBox.classList.add('verse-build--bad');
          setTimeout(function () { buildBox.classList.remove('verse-build--bad'); }, 600);
          FF.UI.announce(keep
            ? t('bvKeptN', 'The first {n} are right. Try the rest again.', { n: keep })
            : t('notRightOrder', 'Not in the right order yet. Tap a word to take it back.'));
          draw();
        }

        draw();
        if (race) {
          lockBoard();
          var thisRound = round;
          opening.then(function () {
            race.gate(function () {
              if (solved || round !== thisRound) return;
              open = true;
              started = Date.now();
              draw();
              FF.ui.$$('.verse-play', stage).forEach(function (b) { if (!b.classList.contains('is-right')) b.disabled = false; });
              if (timerSecs > 0) {
                // Out of time: stop here; the round settles for everyone.
                api.shell.setTimer(timerSecs, function () {
                  if (solved) return;
                  solved = true;
                  api.audio.play('wrong');
                  lockBoard();
                });
              }
            });
          });
        } else if (seconds > 0) {
          api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
          // Out of time: show the whole verse, then move on when the player is ready.
          api.shell.setTimer(seconds, function () {
            if (solved) return;
            solved = true;
            stopTimer();
            lockBoard();
            reveal();
            score(entity, false, 0, after, '', t('timesUp', 'Time’s up!') + ' ' + t('bvHereItIs', 'Here is the verse.'));
            afterAnswer(after, entity, q);
          });
        }
      }

      function finish() {
        if (offSettle) offSettle();
        api.shell.hideTimer();
        api.shell.setOnTick(null);
        if (race) { race.end(); finishGame(api, totals); return; }
        recap(api, {
          kicker: t('bvRecapKicker', 'Verse Rush recap'), scorers: scorers, totals: totals,
          extra: function (stage) {
            if (!learnt.length) return;
            stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('bqVersesMet', 'Verses from this game')));
            var box = FF.ui.div('bq-verses');
            learnt.forEach(function (q) { box.appendChild(verseCard({ ref: q.ref, text: q.text })); });
            stage.appendChild(box);
          }
        });
      }

      render();
    };
  }

  FF.registerGame({
    id: 'bibleVerseRush',
    name: 'Verse Rush',
    description: 'Build 95 well-known King James verses from their pieces, or find where a verse is. Quick and tidy scores most.',
    category: 'bible',
    icon: '📜',
    players: [1, 6],
    difficulty: 'Normal',
    duration: 4,
    tags: ['verse', 'scripture', 'memory', 'words'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Pick a level and the kinds of round: build the verse, where is it, or both.',
      'Build: tap the pieces in order. A wrong try keeps the right start and sends the rest back.',
      'Where is it: read the verse and pick its reference from four, or on Expert spell the book with letter tiles (50 bonus points).',
      'Faster scores more; mistakes and hints cost a little. Read each verse in full after every round.'
    ],
    start: function (api) {
      var data = bible();
      if (!data.verses || !data.verses.length) {
        FF.GameUI.exitCard(api, t('noVerses', 'Verses not loaded'));
        return;
      }
      begin(api, verseSpec(), playVerse(api));
    }
  });

  /* ============================================================
     BOOKS OF THE BIBLE
     ============================================================ */
  var ORDER_EXTRA_SECS = 10;

  function booksSpec() {
    return {
      key: 'bibleBooks:setup', name: t('bbName', 'Books of the Bible'), title: t('bbSetupTitle', 'Set up Books of the Bible'),
      standard: BOOKS_STANDARD, sanitize: booksSanitize, isStandard: booksIsStandard,
      rows: [
        { field: 'level', label: t('bqLevel', 'Level'), desc: t('bbLevelDesc2', 'Kids plays the best-known books. Bible scholar plays all 66, with closer choices. Expert: spell the book for What comes next? with letter tiles.'), options: levelOptions() }
      ],
      chips: { field: 'kinds', label: t('bvKinds', 'Kinds of round'), all: BOOK_KINDS, name: bookKindName, icon: bookKindIcon },
      count: function (c) { return booksPool(bible().books, c.level).length; },
      min: 6,
      ready: function (n) { return t('bbNReady', '{n} books in play', { n: n }); },
      summary: function (c) { return levelName(c.level) + ' · ' + (c.kinds.length ? c.kinds.map(bookKindName).join(', ') : t('bbAllKinds', 'Every kind')); },
      start: t('bgStart', 'Start')
    };
  }

  function playBooks(api) {
    return function (chosen, seed) {
      var config = api.config;
      var data = bible();
      var scorers = scorerList(config);
      var n = scorers.length;
      var c = booksSanitize(chosen);
      var timed = FF.GameLength.timed(config);
      var rounds = FF.GameLength.rounds(api, 12, 0);
      if (!timed && n > 1) rounds = Math.ceil(rounds / n) * n;
      var deck = booksDeal(data.books, data.divisions, c, rng(seed), Math.min(rounds, 200));
      var spelling = isSpelled(c);
      if (timed) FF.GameLength.manual();
      var base = config.timer != null ? Number(config.timer) : 20;
      var totals = tallies(scorers);
      var byKind = {};
      var streaks = {};
      scorers.forEach(function (e) { streaks[e.id] = 0; });
      var round = 0;

      function over() {
        if (round >= rounds) return true;
        return timed && FF.GameLength.timeUp() && round % n === 0;
      }
      function next() {
        round++;
        if (over()) { finish(); return; }
        render();
      }

      function render() {
        var q = deck[round % deck.length];
        var book = q.book;
        var entity = scorers[round % n];
        api.shell.updateScores(entity.id);
        api.shell.hideTimer();
        var root = api.shell.root;
        FF.ui.clear(root);
        var stage = FF.GameUI.stage({ className: 'qm bq bb' });
        stage.appendChild(roundBar(api, entity, n > 1, round, rounds, false));
        var card = FF.ui.div('qm-card bq-card bb-card');
        var head = FF.ui.div('qm-card__head');
        head.appendChild(badge(bookKindIcon(q.kind), bookKindName(q.kind)));
        head.appendChild(levelDots(book.level));
        card.appendChild(head);
        if (q.kind === 'next') {
          card.appendChild(FF.GameUI.sub(spelling ? t('bbAfterSpell', 'Spell the book that comes right after') : t('bbAfter', 'Which book comes right after')));
          card.appendChild(FF.ui.el('h2', { class: 'bb-book' }, book.name));
        } else if (q.kind === 'order') {
          card.appendChild(FF.GameUI.prompt(t('bbOrderQ', 'Put these books in Bible order.'), 'md'));
        } else {
          card.appendChild(FF.ui.el('h2', { class: 'bb-book' }, book.name));
          card.appendChild(FF.GameUI.note(t('chaptersN', '{n} chapters', { n: book.chapters })));
        }
        var spellNow = spelling && q.kind === 'next';
        var seconds = base > 0 ? base + (q.kind === 'order' ? ORDER_EXTRA_SECS : 0) + (spellNow ? SPELL_EXTRA_SECS : 0) : 0;
        var meter = null;
        if (seconds) {
          meter = FF.GameUI.meter(1);
          meter.classList.add('qm-time');
          meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
          card.appendChild(meter);
        }
        stage.appendChild(card);

        var done = false;
        var btns = [];
        var group;
        var board = null;
        var spellB = null;
        if (q.kind === 'testament') {
          group = FF.GameUI.duo();
          var ot = FF.GameUI.duoButton(t('oldTestament', 'Old Testament'), function () { answer(0); }, 'up', 'scroll');
          var nt = FF.GameUI.duoButton(t('newTestament', 'New Testament'), function () { answer(1); }, 'down', 'book-open');
          group.appendChild(ot);
          group.appendChild(nt);
          btns = [ot, nt];
        } else if (spellNow) {
          spellB = spellBoard(api, q.next.name, q.options, seed, round, function (text) {
            answer(-1, null, false, { text: text, res: bookCheck(text, q.next.name, data.books) });
          });
          group = spellB.el;
        } else if (q.kind === 'order') {
          board = orderBoard(api, q, function (placed) { answer(-1, placed); }, 'bible-books-option');
          group = board.el;
          btns = board.buttons;
        } else {
          group = FF.GameUI.options({ columns: 2 });
          btns = q.options.map(function (o, i) {
            var label = q.kind === 'division' ? divisionName(o) : o;
            var b = FF.GameUI.option(label, function () { answer(i); }, i, { className: 'bible-books-option qm-opt' });
            group.appendChild(b);
            return b;
          });
        }
        stage.appendChild(group);
        var after = FF.ui.div('qm-after');
        stage.appendChild(after);
        root.appendChild(stage);
        if (seconds) {
          api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
          api.shell.setTimer(seconds, function () { answer(-1, null, true); });
        }
        if (spellB) spellB.open();
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(group);

        function answer(i, placed, timeout, spell) {
          if (done) return;
          done = true;
          api.shell.setOnTick(null);
          api.shell.hideTimer();
          var right = !timeout && (spell ? spell.res.ok : q.kind === 'order' ? isRightOrder(q, placed) : i === q.answer);
          if (spellB) spellB.finish(right);
          else if (board) board.reveal(placed || []);
          else {
            btns.forEach(function (b, k) {
              b.disabled = true;
              if (k === q.answer) FF.GameUI.markOption(b, 'correct');
              else if (k === i) FF.GameUI.markOption(b, 'wrong');
              else FF.GameUI.markOption(b, 'dim');
            });
          }
          totals.add(entity.id, right);
          var k = byKind[q.kind] || (byKind[q.kind] = { c: 0, a: 0 });
          k.a++;
          if (right) k.c++;
          if (right) {
            streaks[entity.id]++;
            var pts = spellB ? spellPoints(bookPoints(q.kind, streaks[entity.id]), true) : bookPoints(q.kind, streaks[entity.id]);
            api.scoring.add(entity.id, pts, { correct: true });
            api.audio.play(streaks[entity.id] >= 3 ? 'streak' : 'correct');
            after.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts) + spellNote(spell, true, q.kind === 'next' ? q.next.name : '')));
          } else {
            streaks[entity.id] = 0;
            api.scoring.add(entity.id, 0, { wrong: true });
            if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
            api.audio.play('wrong');
            var lead = timeout ? t('timesUp', 'Time’s up!') : t('notQuite', 'Not quite.');
            after.appendChild(FF.GameUI.feedback('bad', lead + ' ' + rightText(q) + spellNote(spell, false, q.kind === 'next' ? q.next.name : '')));
          }
          after.appendChild(bookCard(q.kind === 'next' ? q.next : book, q));
          var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
          var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('next', 'Next'), function () { api.audio.play('click'); next(); }, { class: 'btn-lg' });
          after.appendChild(nextBtn);
          api.shell.updateScores(entity.id);
          if (FF.Nav && FF.Nav.focus) FF.Nav.focus(nextBtn);
        }
      }

      function rightText(q) {
        if (q.kind === 'testament') return t('bookIn', '{book} is in the {t}.', { book: q.book.name, t: testamentName(q.book.testament) });
        if (q.kind === 'division') return t('bbDivIs', '{book} is in {d}.', { book: q.book.name, d: divisionName(q.book.divisionId) });
        if (q.kind === 'next') return t('bbNextIs', '{next} comes after {book}.', { next: q.next.name, book: q.book.name });
        return t('bqRightOrder', 'Here is the right order.');
      }

      /* What a book is: its place, part, chapters, what it is about and a key verse. */
      function bookCard(b) {
        return verseCard({
          title: b.name, ref: b.ref, text: b.verse, note: b.about,
          facts: [t('bbBookN', 'Book {n} of 66', { n: b.order }), testamentName(b.testament), divisionName(b.divisionId), t('chaptersN', '{n} chapters', { n: b.chapters })]
        });
      }

      function finish() {
        api.shell.hideTimer();
        api.shell.setOnTick(null);
        recap(api, {
          kicker: t('bbRecapKicker', 'Books of the Bible recap'), scorers: scorers, totals: totals,
          extra: function (stage) {
            var ids = BOOK_KINDS.filter(function (k) { return byKind[k]; });
            if (ids.length < 2) return;
            stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('bbByKind', 'By kind of round')));
            var box = FF.ui.div('qm-bytopic');
            ids.forEach(function (k) {
              var x = byKind[k];
              var row = FF.ui.div('qm-bytopic__row');
              row.appendChild(badge(bookKindIcon(k), bookKindName(k)));
              var m = FF.GameUI.meter(x.a ? x.c / x.a : 0);
              m.classList.add('qm-bytopic__meter');
              m.setAttribute('aria-label', bookKindName(k));
              row.appendChild(m);
              row.appendChild(FF.ui.span('qm-bytopic__n', x.c + '/' + x.a));
              box.appendChild(row);
            });
            stage.appendChild(box);
          }
        });
      }

      render();
    };
  }

  FF.registerGame({
    id: 'bibleBooks',
    name: 'Books of the Bible',
    description: 'All 66 books: which testament, which part of the Bible, what comes next, and putting them in order.',
    category: 'bible',
    icon: '📚',
    players: [1, 6],
    difficulty: 'Easy',
    duration: 3,
    tags: ['books', 'canon', 'speed', 'testament'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Pick a level and the kinds of round you want.',
      'Say which testament a book is in, which part of the Bible it belongs to, or which book comes next (on Expert, spell it with letter tiles for 50 bonus points).',
      'Put three or four books in Bible order by tapping them into the slots.',
      'Answer streaks add points. After each answer, see the book’s place, its chapters and a key verse.'
    ],
    start: function (api) {
      var data = bible();
      if (!data.books || !data.books.length) {
        FF.GameUI.exitCard(api, t('noBooks', 'Books data not loaded'));
        return;
      }
      if (FF.Parallel && FF.Parallel.active()) { bibleBooksOnline(api, data.books); return; }
      begin(api, booksSpec(), playBooks(api));
    }
  });

  /* ================= pure rules, for the tests ================= */

  FF.BibleGames = {
    LEVELS: LEVELS, rng: rng, levelOk: levelOk,
    SPELL_BONUS: SPELL_BONUS, SPELL_EXTRA_SECS: SPELL_EXTRA_SECS, isSpelled: isSpelled,
    whoCheck: whoCheck, bookCheck: bookCheck, bookNameOfRef: bookNameOfRef, spellPoints: spellPoints,
    who: {
      STANDARD: WHO_STANDARD, sanitize: whoSanitize, isStandard: whoIsStandard,
      pool: whoPool, deal: whoDeal, points: whoPoints
    },
    verse: {
      KINDS: VERSE_KINDS, STANDARD: VERSE_STANDARD, MAX_TILES: MAX_TILES,
      sanitize: verseSanitize, isStandard: verseIsStandard, pool: versePool, tiles: tiles,
      deal: verseDeal, kindFor: verseKind, isRightBuild: isRightBuild, rightSoFar: rightSoFar,
      buildPoints: buildPoints, wherePoints: wherePoints, placePoints: versePlacePoints
    },
    books: {
      KINDS: BOOK_KINDS, STANDARD: BOOKS_STANDARD, sanitize: booksSanitize, isStandard: booksIsStandard,
      pool: booksPool, deal: booksDeal, isRightOrder: isRightOrder, points: bookPoints
    }
  };

})();
