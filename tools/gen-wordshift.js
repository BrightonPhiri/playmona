#!/usr/bin/env node
/* ============================================================
   PLAYMONA — tools/gen-wordshift.js
   Builds WordShift's puzzle bank from the shared word bank:
     js/data/wordshiftPuzzles.js   (the phone)
     api/data/wordshift-puzzles.json (the server)
     api/data/wordshift-words.txt    (every word the server accepts)

   A puzzle's path only uses everyday and common words (tiers 1-2),
   so a familiar route always exists; players may still use any real
   word. Each puzzle's shortest path must sit in its level's range,
   and Easy/Normal ones need at least two routes of length <= n + 1.
   Deterministic: the same lexicon gives the same bank.
   Usage: node tools/gen-wordshift.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const LEVELS = [
  // lv, length, shortest range, how many, start/target max tier
  { lv: 'easy', len: 3, min: 3, max: 5, want: 700, tier: 1, prefix: 'e' },
  { lv: 'normal', len: 4, min: 4, max: 6, want: 1300, tier: 1, prefix: 'n' },
  { lv: 'hard', len: 5, min: 4, max: 7, want: 1000, tier: 1, prefix: 'h' },
  { lv: 'expert', len: 6, min: 4, max: 8, want: 450, tier: 1, prefix: 'x' },
  { lv: 'expert', len: 7, min: 4, max: 8, want: 120, tier: 1, prefix: 'x' },
  { lv: 'expert', len: 8, min: 4, max: 8, want: 60, tier: 1, prefix: 'x' }
];
// Never in a puzzle at all (real words, but not for a family game). One list, in the rules,
// so crew players skip the same words (js/crew/brains/wordShift.js).
const AVOID = new Set(require('./test/harness').loadFF(['js/core.js', 'js/wordshift/rules.js']).WordShiftRules.AVOID);
// Fine to pass through, but too odd to be a start or a target (archaic, technical or stilted).
const ODD = new Set(('sic thy thee ken nay per via huh mod con cam bob don nil ion err ' +
  'baud buss saki wive lain rend vend sine ' +
  'inter leach prise parse ' +
  'livest extant congest assort terming flawing cabling coining rending porting nicking fining deeming manning suing').split(' '));
// Starts and targets read better as plain words: no plurals or -ed forms.
function plainEnd(w) { return !/[^s]s$/.test(w) && !/ed$/.test(w); }
const MAX_USES = 3;          // a word is a start (or a target) at most this often per level
const PER_START = 2;         // targets kept per start word, so starts vary

/* ---------- the graph ---------- */

// The words a puzzle's path may use: tiers 1-2 of one length, a-z only.
function graphWords(Words, len) {
  const words = Words.matching(function (w) { return w.length === len && /^[a-z]+$/.test(w) && !AVOID.has(w); }, { min: len, maxTier: 2 });
  const set = new Set(words);
  const buckets = new Map();
  words.forEach(function (w) {
    for (let i = 0; i < len; i++) {
      const k = w.slice(0, i) + '_' + w.slice(i + 1);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(w);
    }
  });
  return { len: len, words: words, set: set, buckets: buckets };
}

function neighbours(g, w) {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const list = g.buckets.get(w.slice(0, i) + '_' + w.slice(i + 1)) || [];
    for (let j = 0; j < list.length; j++) if (list[j] !== w) out.push(list[j]);
  }
  return out;
}

// Distances from one word to every word it can reach.
function distances(g, from) {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const w = queue[q];
    const d = dist.get(w);
    neighbours(g, w).forEach(function (n) { if (!dist.has(n)) { dist.set(n, d + 1); queue.push(n); } });
  }
  return dist;
}

// One shortest path start..target (inclusive), or null.
function bfs(start, target, g) {
  if (!g.set.has(start) || !g.set.has(target)) return null;
  const prev = new Map([[start, null]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const w = queue[q];
    if (w === target) break;
    neighbours(g, w).forEach(function (n) { if (!prev.has(n)) { prev.set(n, w); queue.push(n); } });
  }
  if (!prev.has(target)) return null;
  const route = [];
  for (let w = target; w !== null; w = prev.get(w)) route.unshift(w);
  return route;
}

// How many different routes of at most maxLen moves, without repeating a word (counting stops at 2).
function pathsWithin(start, target, g, maxLen) {
  const toT = distances(g, target);
  if (!toT.has(start)) return 0;
  let found = 0;
  const seen = new Set([start]);
  (function walk(w, depth) {
    if (found >= 2) return;
    if (w === target) { found++; return; }
    neighbours(g, w).forEach(function (n) {
      if (found >= 2 || seen.has(n)) return;
      const left = toT.get(n);
      if (left === undefined || depth + 1 + left > maxLen) return;
      seen.add(n);
      walk(n, depth + 1);
      seen.delete(n);
    });
  })(start, 0);
  return found;
}

/* ---------- deterministic shuffling ---------- */

function fnv(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}

/* ---------- building ---------- */

function build(Words) {
  const puzzles = [];
  const counters = {};
  LEVELS.forEach(function (L) {
    const g = graphWords(Words, L.len);
    const rand = mulberry(fnv('wordshift|' + L.lv + '|' + L.len));
    const ends = shuffle(g.words.filter(function (w) { return Words.tier(w) <= L.tier && plainEnd(w) && !ODD.has(w); }), rand);
    const endSet = new Set(ends);
    const asStart = new Map();
    const asTarget = new Map();
    const pairs = new Set();
    let made = 0;
    for (let i = 0; i < ends.length && made < L.want; i++) {
      const s = ends[i];
      if ((asStart.get(s) || 0) >= MAX_USES) continue;
      const dist = distances(g, s);
      const options = [];
      dist.forEach(function (d, t) {
        if (d >= L.min && d <= L.max && endSet.has(t)) options.push([t, d]);
      });
      if (!options.length) continue;
      let kept = 0;
      const picks = shuffle(options, rand);
      for (let k = 0; k < picks.length && kept < PER_START && made < L.want; k++) {
        const t = picks[k][0];
        const n = picks[k][1];
        if ((asTarget.get(t) || 0) >= MAX_USES || pairs.has(s + '|' + t) || pairs.has(t + '|' + s)) continue;
        if ((L.lv === 'easy' || L.lv === 'normal') && pathsWithin(s, t, g, n + 1) < 2) continue;
        pairs.add(s + '|' + t);
        asStart.set(s, (asStart.get(s) || 0) + 1);
        asTarget.set(t, (asTarget.get(t) || 0) + 1);
        counters[L.prefix] = (counters[L.prefix] || 0) + 1;
        const route = bfs(s, t, g);
        puzzles.push({ id: L.prefix + counters[L.prefix], s: s, t: t, n: n, lv: L.lv, p: route.slice(1, -1) });
        kept++;
        made++;
      }
    }
    console.log(L.lv + ' ' + L.len + ' letters: ' + made + ' puzzles (graph ' + g.words.length + ' words)');
  });
  return puzzles;
}

// Every word the server accepts: tiers 1-4 (never quiet), 3-8 letters, a-z.
function acceptedWords(Words) {
  return Words.matching(function (w) { return w.length <= 8 && /^[a-z]+$/.test(w); }, { min: 3, maxTier: 4 }).sort();
}

function loadWords() {
  const { loadFF } = require('./test/harness');
  const FF = loadFF(['js/core.js', 'js/data/words.js', 'js/data/wordlist.js', 'js/words.js', 'js/data/lexicon.js']);
  FF.Words.ready();
  return FF.Words;
}

function main() {
  const Words = loadWords();
  const puzzles = build(Words);
  const bank = { v: 1, puzzles: puzzles };
  const head = '/* ============================================================\n' +
    '   PLAYMONA — wordshiftPuzzles.js (generated by tools/gen-wordshift.js; do not edit)\n' +
    '   ' + puzzles.length + ' WordShift puzzles: s = start, t = target, n = shortest moves, lv = level,\n' +
    '   p = the words in between on one shortest path (shown only when a player gives up).\n' +
    '   ============================================================ */\n';
  const rows = puzzles.map(function (p) { return JSON.stringify(p); }).join(',\n');
  fs.writeFileSync(path.join(ROOT, 'js/data/wordshiftPuzzles.js'), head +
    'window.FF = window.FF || {};\nFF.data = FF.data || {};\nFF.data.wordshift = { v: 1, puzzles: [\n' + rows + '\n] };\n');
  fs.mkdirSync(path.join(ROOT, 'api/data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'api/data/wordshift-puzzles.json'), JSON.stringify(bank));
  const words = acceptedWords(Words);
  fs.writeFileSync(path.join(ROOT, 'api/data/wordshift-words.txt'), words.join('\n') + '\n');
  console.log('total ' + puzzles.length + ' puzzles, ' + words.length + ' accepted words');
}

module.exports = { AVOID, ODD, plainEnd, graphWords, neighbours, distances, bfs, pathsWithin, fnv, build, acceptedWords };

if (require.main === module) main();
