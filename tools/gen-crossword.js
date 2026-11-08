/* Generates the Mini Crossword puzzles: js/data/crosswords.js (FF.data.crosswords).
     node tools/gen-crossword.js            build every puzzle in the recipe, write the file
     node tools/gen-crossword.js --show ID  print one puzzle with its clues
     node tools/gen-crossword.js --needs    list words (and levels) that still need a clue

   Words come from two places:
   - tools/crossword/bank/<pack>.txt: the theme words of each pack, with their clues;
   - tools/crossword/bank/general.txt: clues for everyday fill words. Which everyday words
     may fill a grid comes from the site's word lists (js/data/lexicon.js tier 1 and the
     frequency list js/data/wordlist.js), minus tools/crossword/bank/blocked.txt.
   Bank line: WORD|levels|easy clue|normal clue|hard clue   (levels: any of e n h)

   Each puzzle is generated on its own from a seed made from its id, so changing one word
   only changes the puzzles that used it. A puzzle whose words do not all have a clue for
   its level is left out (and listed by --needs). The file is only written when every
   puzzle passes tools/crossword/validate.js.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { loadFF } = require('./test/harness');
const T = require('./crossword/templates');
const V = require('./crossword/validate');

const ROOT = path.resolve(__dirname, '..');
const BANK = path.join(__dirname, 'crossword', 'bank');
const OUT = path.join(ROOT, 'js', 'data', 'crosswords.js');
const FF = loadFF(['js/core.js', 'js/crossword/rules.js', 'js/data/lexicon.js', 'js/data/wordlist.js', 'js/words.js']);
const R = FF.CrosswordRules;
FF.Words.ready();

const LEVEL_KEY = { easy: 'e', normal: 'n', hard: 'h' };
const PACK_CODE = { animals: 'an', food: 'fo', home: 'ho', sport: 'sp', music: 'mu', geography: 'ge', bible: 'bi', nature: 'na', mixed: 'mx' };
const THEMES = R.PACKS.filter((p) => p !== 'mixed');

/* How many puzzles of each kind per pack and level. Sizes follow R.SIZES. */
const RECIPE = {
  easy: [{ size: 5, kind: 'open', n: 4 }, { size: 5, kind: 'dense', n: 4 }],
  normal: [{ size: 5, kind: 'dense', n: 4 }, { size: 7, kind: 'open', n: 5 }],
  hard: [{ size: 7, kind: 'dense', n: 3 }, { size: 9, kind: 'open', n: 6 }]
};
const THEME_MIN = { 5: 2, 7: 3, 9: 4 };   // at least this many answers from the pack's own bank, by grid size
// Dense 5x5 and open 7x7 grids leave little room for pack words, so they need fewer.
function themeNeed(rc) { return rc.kind === 'dense' && rc.size === 5 ? 1 : rc.kind === 'open' && rc.size === 7 ? 2 : THEME_MIN[rc.size]; }
const REUSE_CAP = 4;                // an answer at most this often per pack and level

/* ---------- words ---------- */

function readBank(name) {
  const file = path.join(BANK, name + '.txt');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#').map((l) => {
    const [w, lv, e, n, h] = l.split('|');
    return { word: (w || '').trim().toUpperCase(), levels: (lv || '').trim(), clue: { easy: (e || '').trim(), normal: (n || '').trim(), hard: (h || '').trim() } };
  });
}

const blocked = new Set(readBank('blocked').map((b) => b.word));
const clues = {};                 // WORD -> { easy, normal, hard }
function addClues(entries) {
  entries.forEach((b) => {
    const c = clues[b.word] || (clues[b.word] = {});
    R.LEVELS.forEach((lv) => { if (b.clue[lv] && !c[lv]) c[lv] = b.clue[lv]; });
  });
}
const theme = {};
THEMES.forEach((pk) => { theme[pk] = readBank(pk).filter((b) => !blocked.has(b.word)); addClues(theme[pk]); });
addClues(readBank('general'));

const freq = FF.data.words.extra;
const rank = {};
(Array.isArray(freq) ? freq : String(freq).split(/\s+/)).forEach((w, i) => { if (!(w in rank)) rank[w] = i; });
const everyday = FF.Words.matching((w) => /^[a-z]{3,9}$/.test(w) && w in rank, { maxTier: 1 })
  .map((w) => w.toUpperCase()).filter((w) => !blocked.has(w));

function fillPool(level) {
  if (level === 'easy') return everyday.filter((w) => w.length <= 5 && rank[w.toLowerCase()] < 4500);
  if (level === 'normal') return everyday.filter((w) => w.length <= 7 && rank[w.toLowerCase()] < 6500);
  return everyday.slice();
}
function themeWords(pack, level) {
  return (theme[pack] || []).filter((b) => b.levels.indexOf(LEVEL_KEY[level]) >= 0 && /^[A-Z]{3,9}$/.test(b.word)).map((b) => b.word);
}

/* ---------- random ---------- */

function rngFrom(str) {
  let a = R.hash(str, 0x9e3779b9);
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- filling ---------- */

function makeIndex(words) {
  const byLen = {};
  words.forEach((w) => { (byLen[w.length] = byLen[w.length] || []).push(w); });
  const idx = {};
  Object.keys(byLen).forEach((len) => {
    const list = byLen[len];
    const pos = [];
    for (let i = 0; i < len; i++) {
      const m = {};
      list.forEach((w, k) => { (m[w[i]] = m[w[i]] || []).push(k); });
      pos.push(m);
    }
    idx[len] = { list, pos };
  });
  return idx;
}
function intersect(a, b) {
  const out = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { out.push(a[i]); i++; j++; } else if (a[i] < b[j]) i++; else j++; }
  return out;
}
function candidates(idx, pattern) {
  const e = idx[pattern.length];
  if (!e) return [];
  let ids = null;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '.') continue;
    const l = e.pos[i][pattern[i]] || [];
    ids = ids ? intersect(ids, l) : l;
    if (!ids.length) return [];
  }
  return ids ? ids.map((k) => e.list[k]) : e.list;
}

/* Fills the template; returns rows of letters or null. pref(word) -> number, higher first. */
function fill(template, idx, rng, pref, limit, seed) {
  // seed = { words: Set, need: n }: until n seed words are in, seed words get a bigger push.
  const n = template.length;
  const g = template.map((r) => r.split(''));
  const slots = T.slotsOf(template).map((s, i) => Object.assign({ i }, s));
  const used = new Set();
  let nodes = 0;
  const pat = (s) => s.cells.map(([r, c]) => g[r][c]).join('');
  const done = (s) => pat(s).indexOf('.') < 0;
  function step() {
    if (++nodes > limit) return false;
    let best = null, bestC = null;
    for (const s of slots) {
      if (done(s)) continue;
      const c = candidates(idx, pat(s)).filter((w) => !used.has(w));
      if (!c.length) return false;
      if (!best || c.length < bestC.length) { best = s; bestC = c; }
    }
    let boost = 0;
    if (best && seed) {
      let have = 0; used.forEach((w) => { if (seed.words.has(w)) have++; });
      if (have < seed.need) boost = 4;
    }
    if (!best) return true;
    // Look ahead: a word that leaves every crossing word many options goes first.
    const crossing = best.cells.map(([r, c], k) => {
      const other = slots.filter((s) => s !== best && !done(s) && s.cells.some(([rr, cc]) => rr === r && cc === c))[0];
      return other ? { s: other, at: other.cells.findIndex(([rr, cc]) => rr === r && cc === c), k } : null;
    }).filter(Boolean);
    const shortlist = bestC.map((w) => [w, pref(w) + (boost && seed.words.has(w) ? boost : 0) + rng()]).sort((a, b) => b[1] - a[1]).slice(0, 80);
    const order = shortlist.map(([w, p]) => {
      let room = 0;
      for (const x of crossing) {
        const pt = pat(x.s).split(''); pt[x.at] = w[x.k];
        const k = candidates(idx, pt.join('')).length;
        if (!k) return [w, -Infinity];
        room += Math.log(k + 1);
      }
      return [w, room + p * 4];
    }).filter((x) => x[1] > -Infinity).sort((a, b) => b[1] - a[1]).slice(0, 30).map((x) => x[0]);
    for (const w of order) {
      const before = best.cells.map(([r, c]) => g[r][c]);
      const wasDone = slots.filter((s) => s !== best && done(s));
      best.cells.forEach(([r, c], k) => { g[r][c] = w[k]; });
      used.add(w);
      // Every crossing this word completes must be a real word, and a new one: no answer twice.
      const newly = slots.filter((s) => s !== best && done(s) && wasDone.indexOf(s) < 0);
      const words = newly.map(pat);
      const ok = words.every((x, k) => !used.has(x) && words.indexOf(x) === k && candidates(idx, x).length);
      if (ok) {
        words.forEach((x) => used.add(x));
        if (step()) return true;
        newly.forEach((s) => used.delete(pat(s)));
      }
      used.delete(w);
      best.cells.forEach(([r, c], k) => { g[r][c] = before[k]; });
    }
    return false;
  }
  return step() ? g.map((r) => r.join('')) : null;
}

/* ---------- puzzles ---------- */

function cluesFor(rows, level) {
  const p = { size: rows.length, rows, clues: {} };
  const out = {};
  const missing = [];
  R.build(p).words.forEach((w) => {
    const a = R.answer(p, w.id);
    const c = clues[a] && clues[a][level];
    if (c) out[w.id] = c; else missing.push(a);
  });
  return { clues: out, missing };
}

function generate() {
  const puzzles = [];
  const needs = {};          // WORD -> Set(levels)
  const usage = {};          // pack|level|WORD -> count
  const shortfall = [];
  const why = {};
  R.LEVELS.filter((l) => !process.env.CW_LEVEL || l === process.env.CW_LEVEL).forEach((level) => {
    const fillWords = fillPool(level);
    const packs = THEMES.concat(['mixed']).filter((p) => !process.env.CW_ONLY || process.env.CW_ONLY.split(',').indexOf(p) >= 0);
    packs.forEach((pack) => {
      const tw = pack === 'mixed' ? [] : themeWords(pack, level);
      const tset = new Set(tw);
      const all = Array.from(new Set(tw.concat(fillWords)));
      const idx = makeIndex(all);
      // Words that already have a clue at this level: tried first, so a puzzle rarely needs a new clue.
      const idxClued = makeIndex(all.filter((w) => clues[w] && clues[w][level]));
      const recipe = RECIPE[level];   // 'mixed' puzzles are general knowledge, from everyday words only
      let num = 0;
      recipe.forEach((rc) => {
        let made = 0;
        for (let attempt = 0; made < rc.n && attempt < rc.n * 30; attempt++) {
          const id = PACK_CODE[pack] + '-' + LEVEL_KEY[level] + '-' + String(num + 1).padStart(3, '0');
          const rng = rngFrom(id + '|' + rc.size + rc.kind + '|' + attempt);
          const tpl = T.make(rc.size, rc.kind, rng);
          if (!tpl) continue;
          const pref = (w) => {
            let s = 0;
            if (tset.has(w)) s += 3;
            if (clues[w] && clues[w][level]) s += 1.5;
            s -= (usage[pack + '|' + level + '|' + w] || 0) * 1.2;
            if (!tset.has(w) && /(S|ED)$/.test(w)) s -= 0.6;
            return s;
          };
          const seed = pack === 'mixed' ? null : { words: tset, need: themeNeed(rc) };
          const rows = fill(tpl, idxClued, rng, pref, 4000, seed) || fill(tpl, idx, rng, pref, 4000, seed);
          if (!rows) { why.nofill = (why.nofill || 0) + 1; continue; }
          const words = R.build({ size: rows.length, rows, clues: {} }).words.map((w) => R.answer({ rows }, w.id));
          if (words.some((w) => (usage[pack + '|' + level + '|' + w] || 0) >= REUSE_CAP)) { why.reuse = (why.reuse || 0) + 1; continue; }
          const themed = words.filter((w) => tset.has(w)).length;
          if (process.env.CW_DEBUG) (why.shares = why.shares || []).push(themed + "/" + words.length);
          if (pack !== 'mixed' && themed < (themeNeed(rc))) { why.theme = (why.theme || 0) + 1; continue; }
          words.forEach((w) => { usage[pack + '|' + level + '|' + w] = (usage[pack + '|' + level + '|' + w] || 0) + 1; });
          num++; made++;
          const c = cluesFor(rows, level);
          c.missing.forEach((w) => { (needs[w] = needs[w] || new Set()).add(level); });
          if (c.missing.length) continue;
          puzzles.push({ id, level, pack, size: rc.size, kind: rc.kind, rows, clues: c.clues });
        }
        if (made < rc.n) shortfall.push(pack + '/' + level + ' ' + rc.size + rc.kind + ': ' + made + ' of ' + rc.n);
      });
    });
  });
  if (process.env.CW_DEBUG) console.log('rejected:', JSON.stringify(why));
  return { puzzles, needs, shortfall };
}

function write(puzzles) {
  const lines = puzzles.map((p) => '    ' + JSON.stringify(p));
  const body = '/* ============================================================\n' +
    '   PLAYMONA — crosswords.js (generated by tools/gen-crossword.js; do not edit)\n' +
    '   ' + puzzles.length + ' Mini Crossword puzzles. Edit the clue banks in\n' +
    '   tools/crossword/bank/ and run: node tools/gen-crossword.js\n' +
    '   ============================================================ */\n' +
    'window.FF = window.FF || {};\nFF.data = FF.data || {};\nFF.data.crosswords = [\n' + lines.join(',\n') + '\n];\n';
  fs.writeFileSync(OUT, body);
}

function show(p) {
  console.log(p.id + '  ' + p.level + ' / ' + p.pack + ' / ' + p.size + 'x' + p.size + ' ' + p.kind);
  p.rows.forEach((r) => console.log('   ' + r.split('').join(' ')));
  R.build(p).words.forEach((w) => console.log('   ' + w.id.padEnd(4) + R.answer(p, w.id).padEnd(10) + p.clues[w.id]));
}

if (require.main === module) {
  const arg = process.argv[2];
  const t0 = Date.now();
  const { puzzles, needs, shortfall } = generate();
  if (arg === '--show') {
    const p = puzzles.filter((x) => x.id === process.argv[3])[0];
    if (p) show(p); else console.log('No puzzle ' + process.argv[3]);
    process.exit(0);
  }
  if (arg === '--needs') {
    Object.keys(needs).sort().forEach((w) => console.log(w + '|' + Array.from(needs[w]).map((l) => LEVEL_KEY[l]).sort().join('')));
    process.exit(0);
  }
  const problems = [];
  puzzles.forEach((p) => V.validatePuzzle(p, R).forEach((m) => problems.push(p.id + ': ' + m)));
  console.log(puzzles.length + ' puzzles in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's; ' + Object.keys(needs).length + ' words still need a clue');
  R.LEVELS.forEach((lv) => console.log('  ' + lv + ': ' + puzzles.filter((p) => p.level === lv).length));
  if (shortfall.length) console.log('Could not make:\n  ' + shortfall.join('\n  '));
  const gaps = V.coverage(puzzles, R);
  gaps.forEach((m) => console.log('coverage: ' + m));
  if (gaps.length && !process.env.CW_ONLY && !process.env.CW_LEVEL) { console.log('Not written: coverage gaps.'); process.exit(1); }
  if (problems.length) { console.log('Not written, problems:\n  ' + problems.slice(0, 30).join('\n  ')); process.exit(1); }
  write(puzzles);
  console.log('Wrote ' + path.relative(ROOT, OUT));
}

module.exports = { generate, fill, makeIndex, rngFrom };
