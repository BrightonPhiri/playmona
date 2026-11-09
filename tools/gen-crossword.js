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
  easy: [{ size: 5, kind: 'open', n: 13 }, { size: 5, kind: 'dense', n: 4 }],
  normal: [{ size: 5, kind: 'dense', n: 4 }, { size: 7, kind: 'open', n: 13 }],
  hard: [{ size: 7, kind: 'dense', n: 2 }, { size: 9, kind: 'open', n: 15 }]
};
const THEME_MIN = { 5: 2, 7: 3, 9: 4 };   // at least this many answers from the pack's own bank, by grid size
// Dense 5x5 and open 7x7 grids leave little room for pack words, so they need fewer.
function themeNeed(rc) { return rc.kind === 'dense' && rc.size === 5 ? 1 : rc.kind === 'open' && rc.size === 7 ? 2 : THEME_MIN[rc.size]; }
// Variety across the whole level (every pack): answers, grids and clues follow V.variety's limits.

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
const clues = {};                 // WORD -> { easy: [clue, ...], normal: [...], hard: [...] }
function addClues(entries) {
  entries.forEach((b) => {
    const c = clues[b.word] || (clues[b.word] = {});
    R.LEVELS.forEach((lv) => {
      // "First clue ~ Second clue": alternatives, used in turn when a word comes back.
      (b.clue[lv] || '').split('~').map((x) => x.trim()).filter(Boolean).forEach((x) => {
        const list = c[lv] || (c[lv] = []);
        if (list.indexOf(x) < 0) list.push(x);
      });
    });
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
function fill(template, idx, rng, pref, limit, seed, ban) {
  // seed = { words: Set, need: n }: until n seed words are in, seed words get a bigger push.
  // ban = Set of words that may not be placed (used enough at this level already).
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
      const c = candidates(idx, pat(s)).filter((w) => !used.has(w) && !(ban && ban.has(w)));
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
      const ok = words.every((x, k) => !used.has(x) && !(ban && ban.has(x)) && words.indexOf(x) === k && candidates(idx, x).length);
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

/* The clue for each answer: the least-used alternative, never one already used V.MAX_SAME_CLUE
   times at this level. missing: answers with no clue; short: answers that need another alternative. */
function cluesFor(rows, level, clueUse) {
  const p = { size: rows.length, rows, clues: {} };
  const out = {};
  const missing = [];
  const short = [];
  R.build(p).words.forEach((w) => {
    const a = R.answer(p, w.id);
    const list = (clues[a] && clues[a][level]) || [];
    if (!list.length) { missing.push(a); return; }
    const fresh = list.filter((c) => (clueUse[level + '|' + a + '|' + c] || 0) < V.MAX_SAME_CLUE);
    if (!fresh.length) { short.push(a); return; }
    fresh.sort((x, y) => (clueUse[level + '|' + a + '|' + x] || 0) - (clueUse[level + '|' + a + '|' + y] || 0));
    out[w.id] = fresh[0];
  });
  return { clues: out, missing, short };
}

function generate() {
  const puzzles = [];
  const needs = {};          // WORD -> Set(levels): no clue at that level yet
  const more = {};           // level|WORD -> true: needs another clue alternative
  const usage = {};          // level|WORD -> times used at that level (every pack)
  const clueUse = {};        // level|WORD|clue -> times shown at that level
  const grids = new Set();   // every grid made, all levels
  const shortfall = [];
  const why = {};
  R.LEVELS.filter((l) => !process.env.CW_LEVEL || l === process.env.CW_LEVEL).forEach((level) => {
    const fillWords = fillPool(level);
    const sets = [];          // the answers of each puzzle at this level
    const ban = new Set();    // answers used V.MAX_USES times at this level
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
        for (let attempt = 0; made < rc.n && attempt < rc.n * 40; attempt++) {
          const id = PACK_CODE[pack] + '-' + LEVEL_KEY[level] + '-' + String(num + 1).padStart(3, '0');
          const rng = rngFrom(id + '|' + rc.size + rc.kind + '|' + attempt);
          const tpl = T.make(rc.size, rc.kind, rng);
          if (!tpl) continue;
          const pref = (w) => {
            let s = 0;
            if (tset.has(w)) s += 3;
            if (clues[w] && clues[w][level]) s += 1.5;
            s -= (usage[level + '|' + w] || 0) * 1.5;
            if (!tset.has(w) && /(S|ED)$/.test(w)) s -= 0.6;
            return s;
          };
          const seed = pack === 'mixed' ? null : { words: tset, need: themeNeed(rc) };
          const rows = fill(tpl, idxClued, rng, pref, 4000, seed, ban) || fill(tpl, idx, rng, pref, 4000, seed, ban);
          if (!rows) { why.nofill = (why.nofill || 0) + 1; continue; }
          if (grids.has(rows.join('/'))) { why.same = (why.same || 0) + 1; continue; }
          const words = R.build({ size: rows.length, rows, clues: {} }).words.map((w) => R.answer({ rows }, w.id));
          const themed = words.filter((w) => tset.has(w)).length;
          if (pack !== 'mixed' && themed < themeNeed(rc)) { why.theme = (why.theme || 0) + 1; continue; }
          const set = new Set(words);
          const near = sets.some((o) => { let k = 0; set.forEach((w) => { if (o.has(w)) k++; }); return k / Math.min(set.size, o.size) >= V.NEAR_SHARE; });
          if (near) { why.near = (why.near || 0) + 1; continue; }
          const c = cluesFor(rows, level, clueUse);
          // Counted even when it still needs a clue, so the next run deals the same grids.
          words.forEach((w) => {
            const k = level + '|' + w;
            usage[k] = (usage[k] || 0) + 1;
            if (usage[k] >= V.MAX_USES(w)) ban.add(w);
          });
          grids.add(rows.join('/'));
          sets.push(set);
          num++; made++;
          c.missing.forEach((w) => { (needs[w] = needs[w] || new Set()).add(level); });
          c.short.forEach((w) => { more[level + '|' + w] = true; });
          if (c.missing.length || c.short.length) continue;
          const p = { id, level, pack, size: rc.size, kind: rc.kind, rows, clues: c.clues };
          R.build(p).words.forEach((w) => {
            const k = level + '|' + R.answer(p, w.id) + '|' + c.clues[w.id];
            clueUse[k] = (clueUse[k] || 0) + 1;
          });
          puzzles.push(p);
        }
        if (made < rc.n) shortfall.push(pack + '/' + level + ' ' + rc.size + rc.kind + ': ' + made + ' of ' + rc.n);
        if (process.env.CW_DEBUG) process.stderr.write(level + ' ' + pack + ' ' + rc.size + rc.kind + ': ' + made + '/' + rc.n + ' (' + Math.round(process.uptime()) + 's)\n');
      });
    });
  });
  if (process.env.CW_DEBUG) console.log('rejected:', JSON.stringify(why));
  return { puzzles, needs, more, shortfall };
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
  // Levels can be made apart and joined: CW_LEVEL=easy node tools/gen-crossword.js --part easy.json,
  // then node tools/gen-crossword.js --merge easy.json normal.json hard.json [--needs|--variants]
  let made;
  if (arg === '--merge') {
    made = { puzzles: [], needs: {}, more: {}, shortfall: [] };
    process.argv.slice(3).filter((f) => !f.startsWith('--')).forEach((f) => {
      const part = JSON.parse(fs.readFileSync(f, 'utf8'));
      made.puzzles = made.puzzles.concat(part.puzzles);
      made.shortfall = made.shortfall.concat(part.shortfall);
      Object.assign(made.more, part.more);
      Object.keys(part.needs).forEach((w) => { made.needs[w] = new Set(Array.from(made.needs[w] || []).concat(part.needs[w])); });
    });
    const order = R.LEVELS;
    made.puzzles.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
    // A small grid can turn up in two levels' parts: keep the easier one.
    const seenGrid = new Set();
    made.puzzles = made.puzzles.filter((p) => { const k = p.rows.join('/'); if (seenGrid.has(k)) return false; seenGrid.add(k); return true; });
  } else made = generate();
  if (arg === '--part') {
    const needs = {};
    Object.keys(made.needs).forEach((w) => { needs[w] = Array.from(made.needs[w]); });
    fs.writeFileSync(process.argv[3], JSON.stringify(Object.assign({}, made, { needs })));
    console.log(made.puzzles.length + ' puzzles to ' + process.argv[3]);
    process.exit(0);
  }
  const mode = process.argv.indexOf('--needs') > 0 ? '--needs' : process.argv.indexOf('--variants') > 0 ? '--variants' : arg;
  const { puzzles, needs, more, shortfall } = made;
  if (arg === '--show') {
    const p = puzzles.filter((x) => x.id === process.argv[3])[0];
    if (p) show(p); else console.log('No puzzle ' + process.argv[3]);
    process.exit(0);
  }
  if (mode === '--variants') {
    // Words shown so often they need another clue: WORD|level|the clues it has now.
    Object.keys(more).sort().forEach((k) => { const [lv, w] = k.split('|'); console.log(w + '|' + LEVEL_KEY[lv] + '|' + clues[w][lv].join(' ~ ')); });
    process.exit(0);
  }
  if (mode === '--needs') {
    Object.keys(needs).sort().forEach((w) => console.log(w + '|' + Array.from(needs[w]).map((l) => LEVEL_KEY[l]).sort().join('')));
    process.exit(0);
  }
  const problems = [];
  puzzles.forEach((p) => V.validatePuzzle(p, R).forEach((m) => problems.push(p.id + ': ' + m)));
  console.log(puzzles.length + ' puzzles in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's; ' + Object.keys(needs).length + ' words still need a clue, ' + Object.keys(more).length + ' need another clue');
  R.LEVELS.forEach((lv) => console.log('  ' + lv + ': ' + puzzles.filter((p) => p.level === lv).length));
  if (shortfall.length) console.log('Could not make:\n  ' + shortfall.join('\n  '));
  const gaps = V.coverage(puzzles, R).concat(V.variety(puzzles, R));
  gaps.forEach((m) => console.log('coverage: ' + m));
  if (gaps.length && !process.env.CW_ONLY && !process.env.CW_LEVEL) { console.log('Not written: coverage gaps.'); process.exit(1); }
  if (problems.length) { console.log('Not written, problems:\n  ' + problems.slice(0, 30).join('\n  ')); process.exit(1); }
  write(puzzles);
  console.log('Wrote ' + path.relative(ROOT, OUT));
}

module.exports = { generate, fill, makeIndex, rngFrom };
