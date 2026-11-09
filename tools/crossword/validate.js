/* Checks Mini Crossword puzzles and clue banks. Used by tools/test/crosswordData.test.js and
   by tools/gen-crossword.js (which refuses to write a file with problems).
     validatePuzzle(p, R) -> [problem, ...]   R = FF.CrosswordRules
     coverage(list, R)    -> [problem, ...]
   Run on its own to lint the clue banks:  node tools/crossword/validate.js [--bank <name>]
*/
'use strict';
const T = require('./templates');

const CLUE_MAX = 90;
const MIN_PER_PACK_LEVEL = 2;
const MIN_PER_LEVEL = 40;
const MIN_TOTAL = 200;

function validatePuzzle(p, R) {
  const out = [];
  if (!p || typeof p !== 'object') return ['not an object'];
  if (!/^[a-z]{2}-[enh]-\d{3}$/.test(p.id || '')) out.push('bad id');
  if (R.LEVELS.indexOf(p.level) < 0) out.push('bad level');
  if (R.PACKS.indexOf(p.pack) < 0) out.push('bad pack');
  if (['dense', 'open'].indexOf(p.kind) < 0) out.push('bad kind');
  const rows = p.rows || [];
  if (rows.length !== p.size || rows.some((r) => typeof r !== 'string' || r.length !== p.size || !/^[A-Z#]+$/.test(r))) {
    out.push('rows do not match size');
    return out;
  }
  if ((R.SIZES[p.level] || []).indexOf(p.size) < 0) out.push('size ' + p.size + ' not allowed for ' + p.level);
  const shape = rows.map((r) => r.replace(/[A-Z]/g, '.'));
  T.check(shape, p.kind).forEach((m) => out.push(m === 'not fully checked' ? 'dense grid not fully checked' : m));
  const b = R.build(p);
  const ids = b.words.map((w) => w.id).sort();
  const keys = Object.keys(p.clues || {}).sort();
  if (JSON.stringify(ids) !== JSON.stringify(keys)) out.push('clue keys do not match words');
  const answers = {};
  const clues = {};
  b.words.forEach((w) => {
    if (w.len < 3) out.push(w.id + ': short word');
    const a = R.answer(p, w.id);
    if (answers[a]) out.push(w.id + ': answer ' + a + ' repeated');
    answers[a] = true;
    const clue = (p.clues || {})[w.id];
    if (typeof clue !== 'string' || !clue.trim()) { out.push(w.id + ': no clue'); return; }
    if (!/^["'‘“(0-9A-Z]/.test(clue)) out.push(w.id + ': clue must start with a capital');
    if (clue.length > CLUE_MAX) out.push(w.id + ': clue too long');
    if (new RegExp('\\b' + a + '\\b', 'i').test(clue)) out.push(w.id + ': answer in clue');
    if (clues[clue]) out.push(w.id + ': same clue twice');
    clues[clue] = true;
  });
  return out;
}

function coverage(list, R) {
  const out = [];
  if (list.length < MIN_TOTAL) out.push('only ' + list.length + ' puzzles (need ' + MIN_TOTAL + ')');
  R.LEVELS.forEach((lv) => {
    const n = list.filter((p) => p.level === lv).length;
    if (n < MIN_PER_LEVEL) out.push(lv + ': only ' + n + ' puzzles (need ' + MIN_PER_LEVEL + ')');
    R.PACKS.filter((pk) => pk !== 'mixed').forEach((pk) => {
      const k = list.filter((p) => p.level === lv && p.pack === pk).length;
      if (k < MIN_PER_PACK_LEVEL) out.push(pk + '/' + lv + ': only ' + k);
    });
  });
  return out;
}

/* Keeps the set fresh: no repeated grid, no two puzzles at a level sharing half their answers,
   no answer used too often at a level, and no answer with the same clue more than twice.
   Returns [problem, ...]. */
const MAX_USES = (word) => (word.length <= 3 ? 4 : 3);
const MAX_SAME_CLUE = 2;
const NEAR_SHARE = 0.5;
function variety(list, R) {
  const out = [];
  const grids = {};
  const info = list.map((p) => {
    const words = R.build(p).words.map((w) => ({ a: R.answer(p, w.id), clue: p.clues[w.id] }));
    return { p, set: new Set(words.map((w) => w.a)), words };
  });
  info.forEach(({ p }) => {
    const k = p.rows.join('/');
    if (grids[k]) out.push(p.id + ': same grid as ' + grids[k]); else grids[k] = p.id;
  });
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i], b = info[j];
      if (a.p.level !== b.p.level || a.p.rows.join() === b.p.rows.join()) continue;
      let same = 0;
      a.set.forEach((w) => { if (b.set.has(w)) same++; });
      if (same / Math.min(a.set.size, b.set.size) >= NEAR_SHARE) out.push(a.p.id + ' and ' + b.p.id + ': share ' + same + ' answers');
    }
  }
  const uses = {}, clued = {};
  info.forEach(({ p, words }) => words.forEach((w) => {
    const u = p.level + '|' + w.a, c = u + '|' + w.clue;
    uses[u] = (uses[u] || 0) + 1;
    clued[c] = (clued[c] || 0) + 1;
  }));
  Object.keys(uses).forEach((u) => { const [lv, w] = u.split('|'); if (uses[u] > MAX_USES(w)) out.push(lv + ': ' + w + ' used ' + uses[u] + ' times'); });
  Object.keys(clued).forEach((c) => { const [lv, w] = c.split('|'); if (clued[c] > MAX_SAME_CLUE) out.push(lv + ': the same clue for ' + w + ' ' + clued[c] + ' times'); });
  return out;
}

/* Lints one clue bank file's text. Returns [problem, ...] with line numbers. */
function lintBank(text, name) {
  const out = [];
  const seen = {};
  const blockedFile = name === 'blocked';
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || l[0] === '#') return;
    const at = 'line ' + (i + 1) + ': ';
    const parts = l.split('|');
    const word = (parts[0] || '').trim();
    if (!/^[A-Z]{3,9}$/.test(word)) out.push(at + 'word must be 3-9 capital letters A-Z: ' + word);
    if (seen[word]) out.push(at + word + ' listed twice (also line ' + seen[word] + ')');
    seen[word] = i + 1;
    if (blockedFile) return;
    if (parts.length !== 5) { out.push(at + 'needs 5 fields WORD|levels|easy|normal|hard'); return; }
    const levels = parts[1].trim();
    if (!/^e?n?h?$/.test(levels) || !levels) out.push(at + 'levels must be some of "enh" in that order');
    ['e', 'n', 'h'].forEach((k, j) => {
      const clue = parts[2 + j].trim();
      const want = levels.indexOf(k) >= 0;
      if (want && !clue) out.push(at + word + ': missing ' + ['easy', 'normal', 'hard'][j] + ' clue');
      if (!clue) return;
      // A field may hold alternatives, "First clue ~ Second clue", used in turn when a word repeats.
      const alts = clue.split('~').map((x) => x.trim());
      if (alts.some((x, n) => alts.indexOf(x) !== n)) out.push(at + word + ': same clue twice');
      alts.forEach((c) => {
        if (!c) { out.push(at + word + ': empty alternative'); return; }
        if (!/^["'‘“(0-9A-Z]/.test(c)) out.push(at + word + ': clue must start with a capital');
        if (c.length > CLUE_MAX) out.push(at + word + ': clue longer than ' + CLUE_MAX);
        if (new RegExp('\\b' + word + '\\b', 'i').test(c)) out.push(at + word + ': answer in clue');
      });
    });
    if (levels.indexOf('e') >= 0 && word.length > 5) out.push(at + word + ': easy words are 5 letters or fewer');
  });
  return out;
}

module.exports = { validatePuzzle, coverage, variety, lintBank, CLUE_MAX, MAX_USES, MAX_SAME_CLUE, NEAR_SHARE };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, 'bank');
  const i = process.argv.indexOf('--bank');
  const names = i > 0 ? [process.argv[i + 1]] : fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4));
  let bad = 0;
  names.forEach((n) => {
    const file = path.join(dir, n + '.txt');
    if (!fs.existsSync(file)) { console.log(n + ': no such bank'); bad++; return; }
    const text = fs.readFileSync(file, 'utf8');
    const problems = lintBank(text, n);
    const count = text.split(/\r?\n/).filter((l) => l.trim() && l.trim()[0] !== '#').length;
    console.log(n + ': ' + count + ' words, ' + problems.length + ' problems');
    problems.slice(0, 40).forEach((p) => console.log('  ' + p));
    bad += problems.length;
  });
  process.exit(bad ? 1 : 0);
}
