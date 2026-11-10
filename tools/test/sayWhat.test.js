'use strict';
/* Say What?: the sayings (js/data/sayings.js) and their check (tools/saywhat/check.js),
   the pure rules (js/saywhat/rules.js) and the game's registration. */
const { loadFF, test, assert, assertEqual } = require('./harness');
const { checkSayings } = require('../saywhat/check.js');

const DATA = ['js/core.js', 'js/answerMatch.js', 'js/data/sayings.js'];
let cached = null;
const data = () => cached || (cached = loadFF(DATA));
const S = () => data().data.sayings;

/* ---------- data ---------- */

test('sayings data: the check finds no problems', function () {
  assertEqual(checkSayings(S()), []);
});

test('sayings data: packs and coverage', function () {
  const s = S();
  assertEqual(s.packs.map((p) => p.id).join(','), 'everyday,african,bible,kids');
  const count = (pack, level) => s.rows.filter((r) => r.pack === pack && (!level || r.level === level)).length;
  assert(count('everyday') >= 130, 'everyday ' + count('everyday'));
  assert(count('african') >= 50, 'african ' + count('african'));
  assert(count('bible') >= 40, 'bible ' + count('bible'));
  assert(count('kids') >= 40, 'kids ' + count('kids'));
  s.rows.filter((r) => r.pack === 'kids').forEach((r) => assertEqual(r.level, 'easy', r.id + ' in kids'));
  ['everyday', 'african', 'kids'].forEach((p) => assert(count(p, 'easy') >= 10, p + ' easy ' + count(p, 'easy')));
  assert(count('bible', 'easy') >= 6, 'bible easy ' + count('bible', 'easy'));
  const twos = s.rows.filter((r) => r.two);
  assert(twos.length >= 15, 'only ' + twos.length + ' two-gap rows');
  twos.forEach((r) => assertEqual(r.level, 'hard', r.id + ' two-gap level'));
  const multi = s.rows.filter((r) => s.gapsOf(r.text).length >= 2).length;
  assert(multi / s.rows.length >= 0.4, 'only ' + multi + ' rows with 2+ gaps');
});

test('sayings data: gap helpers', function () {
  const s = S();
  assertEqual(s.gapsOf("{Rome} wasn't {built} in a day"), ['Rome', 'built']);
  assertEqual(s.plain("{Rome} wasn't {built} in a day"), "Rome wasn't built in a day");
});

test('sayings data: gaps with marks and capitals exist', function () {
  const gaps = [];
  S().rows.forEach((r) => S().gapsOf(r.text).forEach((g) => gaps.push(g)));
  assert(gaps.some((g) => /'/.test(g)), 'no gap with an apostrophe');
  assert(gaps.some((g) => /^[A-Z]/.test(g)), 'no capitalised gap');
});

test('sayings data: meanings are short plain lines', function () {
  S().rows.forEach((r) => {
    assert(typeof r.meaning === 'string' && r.meaning.length > 0, r.id + ' has no meaning');
    assert(r.meaning.length <= 80, r.id + ' meaning is ' + r.meaning.length + ' chars');
    assert(/\.$/.test(r.meaning), r.id + ' meaning does not end with a full stop');
  });
});

test('sayings check: catches bad rows', function () {
  const s = S();
  const ok = { id: 'a', pack: 'everyday', level: 'easy', text: 'A {stitch} in time saves {nine}', meaning: 'Fix it early.',
    decoys: { stitch: ['pin', 'patch', 'knot', 'button'], nine: ['ten', 'five', 'all', 'lives'] } };
  const run = (rows) => checkSayings({ packs: s.packs, rows: rows, gapsOf: s.gapsOf, plain: s.plain });
  assertEqual(run([ok]), []);
  const bad = (patch) => Object.assign({}, ok, patch);
  assert(run([bad({ decoys: { stitch: ['pin', 'patch', 'knot', 'button'] } })]).length > 0, 'gap without decoys');
  assert(run([bad({ decoys: { stitch: ['pin', 'patch', 'knot'], nine: ok.decoys.nine } })]).length > 0, 'three decoys');
  assert(run([bad({ decoys: { stitch: ['Stitch', 'patch', 'knot', 'button'], nine: ok.decoys.nine } })]).length > 0, 'decoy equals gap');
  assert(run([bad({ also: { stitch: ['pin'] } })]).length > 0, 'decoy is an also word');
  assert(run([ok, bad({ text: 'A {stitch} in time saves {ten}', decoys: { stitch: ok.decoys.stitch, ten: ['six', 'five', 'all', 'lives'] } })]).length > 0, 'duplicate id');
  assert(run([ok, bad({ id: 'b' })]).length > 0, 'duplicate text');
  assert(run([bad({ level: 'hard', two: ['stitch', 'time'] })]).length > 0, 'two names a non-gap');
  assert(run([bad({ text: 'A {big stitch} in time saves {nine}', decoys: { 'big stitch': ok.decoys.stitch, nine: ok.decoys.nine } })]).length > 0, 'gap with a space');
  assert(run([bad({ text: 'A {stitch} in time saves {99}', decoys: { stitch: ok.decoys.stitch, 99: ok.decoys.nine } })]).length > 0, 'digit-only gap');
  assert(run([bad({ pack: 'kids', level: 'normal' })]).length > 0, 'kids row not easy');
  assert(run([bad({ decoys: { stitch: ok.decoys.stitch, nine: ok.decoys.nine, time: ok.decoys.nine } })]).length > 0, 'decoys for a word that is not a gap');
});

/* ---------- SpellTiles onChange (shared board) ---------- */

test('spellTiles board: onChange reports the slot letters after each change', function () {
  const FF = loadFF(['js/core.js', 'js/ui-kit.js', 'js/spellTiles.js']);
  const set = { target: 'ROME', cells: FF.SpellTiles.layout ? FF.SpellTiles.layout('ROME') : null, letters: ['R', 'O', 'M', 'E'], tiles: ['R', 'X', 'O', 'M', 'E', 'Q'] };
  if (!set.cells) set.cells = 'ROME'.split('').map((ch) => ({ ch: ch, letter: true }));
  const seen = [];
  const b = FF.SpellTiles.board(set, { onChange: (chars) => seen.push(chars.slice()), onSubmit: function () {} });
  b.open();
  const tray = b.el.children.filter((c) => c.className.indexOf('spell-tiles') !== -1)[0];
  tray.children[0].dispatch('click');
  tray.children[2].dispatch('click');
  assertEqual(seen[seen.length - 1], ['R', 'O', null, null]);
  const tools = b.el.children.filter((c) => c.className.indexOf('spell-tools') !== -1)[0];
  tools.children[0].dispatch('click'); // Undo
  assertEqual(seen[seen.length - 1], ['R', null, null, null]);
});

/* ---------- rules ---------- */

const RULES = ['js/core.js', 'js/answerMatch.js', 'js/spellTiles.js', 'js/data/sayings.js', 'js/saywhat/rules.js'];
let rcached = null;
const rff = () => rcached || (rcached = loadFF(RULES));
const R = () => rff().SayWhatRules;
const PACK_IDS = ['everyday', 'african', 'bible', 'kids'];
const LEVEL_IDS = ['easy', 'normal', 'hard'];

test('rules: sanitize falls back to the standard', function () {
  const s = R().sanitize({ level: 'master', packs: ['kids', 'nope'], answer: 'type', time: 'slow', rounds: 7 });
  assertEqual(s.level, 'normal');
  assertEqual(s.packs, ['kids']);
  assertEqual(s.answer, 'tiles');
  assertEqual(s.time, 'normal');
  assertEqual(s.rounds, 10);
  assertEqual(R().sanitize({ packs: [] }).packs, 'mixed');
  assert(R().isStandard(R().sanitize({})), 'empty settings are the standard');
  const room = R().sanitizeRoom({ packs: ['kids'], level: 'easy', time: 'none', answer: 'choice', rounds: 15 });
  assertEqual(room.packs, 'mixed');
  assertEqual(room.level, 'normal');
  assertEqual(room.time, 'normal');
  assertEqual(room.answer, 'choice');
  assertEqual(room.rounds, 15);
});

test('rules: Kids plays at every level', function () {
  LEVEL_IDS.forEach((level) => assert(R().items({ packs: ['kids'], level: level }).length > 0, 'kids at ' + level));
  const counts = R().levelCounts(['kids']);
  assert(counts.easy > 0 && counts.normal > 0 && counts.hard > 0, 'kids counts ' + JSON.stringify(counts));
});

test('rules: Mixed Hard holds no easy sayings and has two-gap items', function () {
  const items = R().items({ packs: 'mixed', level: 'hard' });
  items.forEach((it) => assert(it.level !== 'easy', it.key + ' is easy'));
  assert(items.some((it) => it.gaps.length === 2), 'no two-gap items on hard');
  assert(!R().items({ packs: 'mixed', level: 'normal' }).some((it) => it.gaps.length === 2), 'two-gap items on normal');
});

test('rules: no saying twice in a round', function () {
  const packsList = PACK_IDS.map((p) => [p]).concat(['mixed']);
  for (let seed = 0; seed < 200; seed++) {
    packsList.forEach((packs) => LEVEL_IDS.forEach((level) => {
      const d = R().deal({ packs: packs, level: level }, 'n' + seed, 20);
      const ids = d.items.map((it) => it.id);
      assertEqual(new Set(ids).size, ids.length, 'repeat in ' + JSON.stringify(packs) + ' ' + level + ' seed ' + seed);
    }));
  }
});

test('rules: a round bigger than the pool is capped at the pool', function () {
  const kids = S().rows.filter((r) => r.pack === 'kids').length;
  const d = R().deal({ packs: ['kids'], level: 'normal' }, 's', 80);
  assertEqual(d.items.length, kids);
  assertEqual(new Set(d.items.map((it) => it.id)).size, kids);
  assert(d.capped, 'capped flag');
  assert(!R().deal({ packs: ['kids'] }, 's', 10).capped, 'a small round is not capped');
});

test('rules: history plays every gap once before any repeats', function () {
  const settings = { packs: ['everyday'], level: 'hard' };
  const gapCount = {};
  S().rows.forEach((r) => { gapCount[r.id] = S().gapsOf(r.text).length; });
  let seen = {};
  const keys = {};
  const timesById = {};
  const gapsById = {};
  let resetAt = -1;
  for (let round = 0; round < 80; round++) {
    const d = R().deal(settings, 'h' + round, 10, seen);
    if (d.reset) { resetAt = round; assertEqual(d.items.length, 10, 'reset round is full'); break; }
    assertEqual(d.items.length, 10);
    d.items.forEach((it) => {
      it.gaps.forEach((g) => {
        const k = it.id + '#' + g;
        assert(!keys[k], 'repeat of ' + k + ' in round ' + round);
        keys[k] = true;
        (gapsById[it.id] = gapsById[it.id] || []).push(g);
      });
      timesById[it.id] = (timesById[it.id] || 0) + 1;
    });
    seen = R().markSeen(seen, d.items);
  }
  assert(resetAt > 0, 'the pool never ran dry');
  Object.keys(timesById).forEach((id) => {
    if (gapCount[id] === 1) assertEqual(timesById[id], 1, id + ' has one gap and came back');
    const g = gapsById[id];
    assertEqual(new Set(g).size, g.length, id + ' replayed a gap');
  });
  assert(Object.keys(timesById).some((id) => timesById[id] > 1), 'no multi-gap saying came back with a new gap');
});

test('rules: deals and rounds are seeded and ignore history when none is passed', function () {
  const a = loadFF(RULES).SayWhatRules;
  const b = loadFF(RULES).SayWhatRules;
  const s = { packs: 'mixed', level: 'hard' };
  const da = a.deal(s, 'abc', 10);
  const db = b.deal(s, 'abc', 10);
  assertEqual(JSON.stringify(da), JSON.stringify(db));
  da.items.forEach((it, k) => assertEqual(JSON.stringify(a.roundAt(s, 'abc', k, it)), JSON.stringify(b.roundAt(s, 'abc', k, db.items[k]))));
  const firsts = new Set();
  for (let i = 0; i < 50; i++) firsts.add(a.deal(s, 'x' + i, 1).items[0].key);
  assert(firsts.size >= 20, 'only ' + firsts.size + ' different first sayings');
});

test('rules: every item is spellable from its own tiles', function () {
  LEVEL_IDS.forEach((level) => R().items({ packs: 'mixed', level: level }).forEach((it, k) => {
    const rd = R().roundAt({ packs: 'mixed', level: level }, 'sp', k, it);
    assert(rd.tiles.length <= 30, it.key + ' has ' + rd.tiles.length + ' tiles');
    const pool = rd.tiles.slice();
    rd.letters.forEach((ch) => {
      const i = pool.indexOf(ch);
      assert(i !== -1, it.key + ' cannot spell ' + ch);
      pool.splice(i, 1);
    });
    rd.cells.forEach((c) => { if (/['’-]/.test(c.ch)) assert(c.fixed, it.key + ' mark ' + c.ch + ' is not laid out'); });
  }));
});

test('rules: round words hide only the gap', function () {
  const it = R().items({ packs: 'mixed', level: 'easy' })[0];
  const rd = R().roundAt({ packs: 'mixed', level: 'easy' }, 'w', 0, it);
  const hidden = rd.words.filter((w) => typeof w !== 'string');
  assertEqual(hidden.length, it.gaps.length);
  hidden.forEach((h, i) => assertEqual(h.len, it.gaps[i].replace(/[^A-Za-z0-9]/g, '').length));
  const shown = rd.words.filter((w) => typeof w === 'string').join('');
  assert(shown.indexOf('{') === -1, 'braces left in ' + shown);
  assert(rd.meaning.length > 0, 'meaning');
});

test('rules: choices hold the answer once and never an also word', function () {
  LEVEL_IDS.forEach((level) => R().items({ packs: 'mixed', level: level }).forEach((it, k) => {
    const rd = R().roundAt({ packs: 'mixed', level: level, answer: 'choice' }, 'c', k, it);
    assertEqual(rd.choices.length, 4, it.key);
    assertEqual(new Set(rd.choices.map((c) => c.toLowerCase())).size, 4, it.key + ' duplicate choice');
    assertEqual(rd.choices.filter((c) => R().check(rd, c).ok).length, 1, it.key + ' right choices');
    assertEqual(rd.choices.filter((c) => c === rd.target).length, 1, it.key + ' answer once');
  }));
});

test('rules: check takes the gap in any case and also words, never a decoy', function () {
  const all = R().items({ packs: 'mixed', level: 'hard' }).concat(R().items({ packs: 'mixed', level: 'easy' }));
  all.filter((it) => it.gaps.length === 1).forEach((it, n) => {
    const r = S().rows.filter((x) => x.id === it.id)[0];
    const g = it.gaps[0];
    const rd = R().roundAt({ packs: 'mixed', level: 'hard' }, 'k', n, it);
    assert(R().check(rd, g.toUpperCase()).ok, r.id + ' ' + g + ' upper');
    assert(R().check(rd, g.toLowerCase()).ok, r.id + ' ' + g + ' lower');
    ((r.also || {})[g] || []).forEach((a) => assert(R().check(rd, a).ok, r.id + ' also ' + a));
    r.decoys[g].forEach((d) => assert(!R().check(rd, d).ok, r.id + ' decoy ' + d + ' accepted'));
  });
});

test('rules: two gaps need both words right', function () {
  const it = R().items({ packs: 'mixed', level: 'hard' }).filter((x) => x.gaps.length === 2)[0];
  const rd = R().roundAt({ packs: 'mixed', level: 'hard' }, 't', 0, it);
  const row = S().rows.filter((r) => r.id === it.id)[0];
  assert(R().check(rd, it.gaps.join(' ')).ok, 'both right');
  assert(!R().check(rd, it.gaps[0] + ' ' + row.decoys[it.gaps[1]][0]).ok, 'second wrong');
  assert(!R().check(rd, row.decoys[it.gaps[0]][0] + ' ' + it.gaps[1]).ok, 'first wrong');
  assert(!R().check(rd, it.gaps[0]).ok, 'only one word');
  assertEqual(rd.target, it.gaps.join(' '));
  assertEqual(R().secondsFor({ answer: 'tiles', time: 'normal' }, rd), 35);
});

test('rules: points and the streak table', function () {
  const P = R().points;
  assertEqual(P({ level: 'hard', ok: false, ms: 1000, secs: 25, streak: 5 }).total, 0);
  const at = (level) => P({ level: level, ok: true, ms: 5000, secs: 25, streak: 1 }).total;
  assert(at('hard') > at('normal') && at('normal') > at('easy'), 'level weights');
  assertEqual(P({ level: 'easy', ok: true, ms: 0, secs: 25, streak: 1 }).speed, 50);
  assertEqual(P({ level: 'easy', ok: true, ms: 25000, secs: 25, streak: 1 }).speed, 0);
  assertEqual(P({ level: 'easy', ok: true, ms: 1000, secs: null, streak: 1 }).speed, 0);
  assertEqual(P({ level: 'easy', ok: true, ms: 1000, secs: null, streak: 1, two: true }).two, 50);
  assertEqual(P({ level: 'easy', ok: true, ms: 1000, secs: null, streak: 1 }).base, 100);
  assertEqual([1, 2, 3, 4, 5, 6, 9].map((n) => P({ level: 'easy', ok: true, ms: 0, secs: null, streak: n }).streak), [0, 0, 25, 50, 75, 100, 100]);
  assertEqual(R().secondsFor({ answer: 'choice', time: 'quick' }, { gaps: ['x'] }), 8);
  assertEqual(R().secondsFor({ answer: 'tiles', time: 'relaxed' }, { gaps: ['x'] }), 40);
  assertEqual(R().secondsFor({ answer: 'tiles', time: 'none' }, { gaps: ['x'] }), null);
});

/* ---------- screen and registration ---------- */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('sayWhat registered: solo and turns, on the leaderboards, listed in every page', function () {
  const src = read('js/games/sayWhat.js');
  assert(/id:\s*'sayWhat'/.test(src), 'registered');
  assert(/modes:\s*\['solo', 'turn'\]/.test(src), 'modes');
  assert(/leaderboard:\s*true/.test(src), 'on the leaderboards');
  assert(/"sayWhat"/.test(read('js/icons.js')), 'has an icon');
  ['play.html', 'admin.html', 'tools/load-check.js', 'tools/test-seed.html'].forEach((f) => {
    const s = read(f);
    let at = -1;
    ['js/spellTiles.js', 'js/games/geoSpin.js', 'js/data/sayings.js', 'js/saywhat/rules.js', 'js/games/sayWhat.js'].forEach((js) => {
      const i = s.indexOf(js);
      assert(i !== -1, f + ' loads ' + js);
      assert(i > at, f + ': ' + js + ' in order');
      at = i;
    });
  });
});

test('sayWhat looks: tokens for the speech bubble and the chalkboard, and a self-hosted chalk font', function () {
  const tokens = read('css/tokens.css');
  ['--sw-bubble', '--sw-cream', '--sw-gold', '--sw-chalk-board', '--sw-chalk-ink', '--sw-chalk-yellow'].forEach((tk) => assert(tokens.indexOf(tk + ':') !== -1, 'token ' + tk));
  const css = read('css/games.css');
  assert(css.indexOf('[data-sw-look="chalk"]') !== -1, 'chalk look rules');
  const fonts = read('css/fonts.css');
  const m = /font-family:\s*['"]Patrick Hand['"][\s\S]*?url\(['"]?([^'")]+)['"]?\)/.exec(fonts);
  assert(m, 'Patrick Hand listed in css/fonts.css');
  assert(fs.existsSync(path.join(ROOT, 'css', m[1])) || fs.existsSync(path.join(ROOT, m[1].replace(/^\.\.\//, ''))), 'font file exists: ' + m[1]);
  assert(/Patrick Hand/.test(read('tools/download-assets.js')), 'font in the download list');
});

/* ---------- turns on one device ---------- */

const GAME = RULES.concat(['js/registry.js', 'js/games/sayWhat.js']);

test('turns: points and streak go to the player who answered', function () {
  const T = loadFF(GAME).SayWhatTurns;
  let s = T.create(['a', 'b', 'c']);
  s = T.award(s, 'a', 150, true);
  s = T.award(s, 'a', 200, true);
  assertEqual(s.points, { a: 350, b: 0, c: 0 });
  assertEqual(s.streak, { a: 2, b: 0, c: 0 });
  s = T.award(s, 'b', 0, false);
  assertEqual(s.streak.a, 2, 'a wrong answer by b leaves a alone');
  s = T.award(s, 'a', 0, false);
  assertEqual(s.streak.a, 0, 'a wrong answer resets only that player');
  assertEqual(s.best.a, 2, 'best streak kept');
});

test('turns: next goes round the players and wraps', function () {
  const T = loadFF(GAME).SayWhatTurns;
  let s = T.create(['a', 'b', 'c']);
  const seen = [];
  for (let i = 0; i < 5; i++) { seen.push(s.order[s.cur]); s = T.next(s); }
  assertEqual(seen, ['a', 'b', 'c', 'a', 'b']);
});

test('daily and challenge: the standard round, the same for everyone, with no history read or written', function () {
  const FF = loadFF(GAME);
  const S = FF.SayWhatGame;
  const R = FF.SayWhatRules;
  const seen = {};
  R.items(R.STANDARD).slice(0, 200).forEach((it) => { seen[it.key] = 1; });
  const mine = { level: 'hard', packs: ['kids'], answer: 'choice', time: 'quick', rounds: 20 };
  ['daily', 'challenge'].forEach((kind) => {
    const config = {}; config[kind] = kind === 'daily' ? '2026-11-10' : { seed: 1 };
    const a = S.dealFor(config, mine, 12345, 1, seen);
    const b = S.dealFor(config, mine, 12345, 1, {});
    assertEqual(JSON.stringify(a.cfg), JSON.stringify(R.sanitize(R.STANDARD)), kind + ' plays the standard');
    assertEqual(a.items.map((i) => i.key).join(), b.items.map((i) => i.key).join(), kind + ' ignores history');
    assertEqual(a.seen, null, kind + ' writes no history');
    assertEqual(a.items.length, 10);
  });
  const solo = S.dealFor({}, mine, 12345, 1, {});
  assertEqual(solo.cfg.answer, 'choice', 'a solo run plays the player\'s own settings');
  assert(solo.seen && Object.keys(solo.seen).length === solo.items.length, 'and remembers what it dealt');
  const turns = S.dealFor({}, R.STANDARD, 7, 3, {});
  assertEqual(turns.items.length, 30, 'turns deal sayings x players');
});

test('sayWhat cover: processed and in the asset manifest', function () {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '..', '..');
  assert(fs.existsSync(path.join(ROOT, 'assets/images/covers/sayWhat.webp')), 'cover file');
  assert(/"sayWhat"/.test(fs.readFileSync(path.join(ROOT, 'js/data/assetManifest.js'), 'utf8')), 'has a cover');
});
