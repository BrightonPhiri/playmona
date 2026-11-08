/* Block patterns for Mini Crossword grids (used by tools/gen-crossword.js).
   A template is an array of row strings, '.' white and '#' black. Every template is
   rotationally symmetric, connected, has no word shorter than 3 and meets the density
   rule of its kind:
     dense - at least 85% of white squares are in an Across and a Down word
             (in practice 5x5 dense grids are fully checked)
     open  - at least 40% of white squares are checked and every word crosses another
*/
'use strict';

function slotsOf(rows) {
  const n = rows.length;
  const white = (r, c) => r >= 0 && c >= 0 && r < n && c < n && rows[r][c] !== '#';
  const slots = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!white(r, c)) continue;
      if (!white(r, c - 1) && white(r, c + 1)) {
        const cells = []; let cc = c;
        while (white(r, cc)) cells.push([r, cc++]);
        slots.push({ dir: 'across', cells });
      }
      if (!white(r - 1, c) && white(r + 1, c)) {
        const cells = []; let rr = r;
        while (white(rr, c)) cells.push([rr++, c]);
        slots.push({ dir: 'down', cells });
      }
    }
  }
  return slots;
}

/* Problems with a template, or [] when it is fine. */
function check(rows, kind) {
  const n = rows.length;
  const out = [];
  let whites = 0;
  const count = {};
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (rows[r][c] !== '#') { whites++; count[r + ',' + c] = 0; }
    if ((rows[r][c] === '#') !== (rows[n - 1 - r][n - 1 - c] === '#')) { out.push('not symmetric'); return out; }
  }
  if (!whites) return ['empty'];
  const slots = slotsOf(rows);
  slots.forEach((s) => { if (s.cells.length < 3) out.push('short word'); s.cells.forEach(([r, c]) => count[r + ',' + c]++); });
  // A white square in no word at all (a lone square) is not allowed either.
  Object.keys(count).forEach((k) => { if (!count[k]) out.push('lone square ' + k); });
  const checked = Object.keys(count).filter((k) => count[k] >= 2).length;
  if (kind === 'dense') {
    if (checked / whites < 0.85) out.push('not fully checked');
  }
  if (kind === 'open') {
    if (checked / whites < 0.4) out.push('too few crossings');
    slots.forEach((s) => { if (!s.cells.some(([r, c]) => count[r + ',' + c] >= 2)) out.push('word crosses nothing'); });
  }
  // connected
  const start = Object.keys(count)[0].split(',').map(Number);
  const seen = new Set([start.join(',')]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
      const k = (r + dr) + ',' + (c + dc);
      if (k in count && !seen.has(k)) { seen.add(k); stack.push([r + dr, c + dc]); }
    });
  }
  if (seen.size !== whites) out.push('not connected');
  return out;
}

function blank(n, ch) { const g = []; for (let r = 0; r < n; r++) g.push(new Array(n).fill(ch)); return g; }
function setSym(g, r, c, ch) { const n = g.length; g[r][c] = ch; g[n - 1 - r][n - 1 - c] = ch; }
function rowsOfGrid(g) { return g.map((row) => row.join('')); }

/* Hand-picked layouts that look like real puzzles and fill well from everyday words
   (found with a search over random layouts, then chosen by eye). Every mirror and
   rotation of each is used too. */
const PICKED = {
  'dense5': [
    ['##...', '#....', '.....', '....#', '...##'],
    ['#....', '#....', '.....', '....#', '....#'],
    ['#...#', '.....', '.....', '.....', '#...#']
  ],
  'dense7': [
    ['...#...', '...#...', '.......', '###.###', '.......', '...#...', '...#...'],
    ['#.....#', '...#...', '...#...', '.#...#.', '...#...', '...#...', '#.....#'],
    ['.#.#...', '...#...', '...#...', '#.....#', '...#...', '...#...', '...#.#.'],
    ['......#', '...#...', '...#...', '.#####.', '...#...', '...#...', '#......']
  ],
  'open5': [
    ['.....', '.#.#.', '.....', '.#.#.', '.....'],
    ['#....', '.#.#.', '.....', '.#.#.', '....#'],
    ['##...', '.#.#.', '.....', '.#.#.', '...##']
  ],
  'open9': [
    ['...#.....', '.#.#...#.', '...#.....', '.#.#.#.#.', '...#.#...', '.#.#.#.#.', '.....#...', '.#...#.#.', '.....#...'],
    ['.........', '.#.#.#.#.', '.........', '.#.#.#.##', '.........', '##.#.#.#.', '.........', '.#.#.#.#.', '.........'],
    ['#.......#', '.###.#...', '...#....#', '.#.#.#.#.', '.........', '.#.#.#.#.', '#....#...', '...#.###.', '#.......#'],
    ['.....#...', '.#.#.#.#.', '.........', '#.##.#.#.', '.........', '.#.#.##.#', '.........', '.#.#.#.#.', '...#.....'],
    ['#........', '.#.#.#.#.', '.........', '.#.#...#.', '###...###', '.#...#.#.', '.........', '.#.#.#.#.', '........#'],
    ['#........', '...#.#.#.', '.........', '.#.###.##', '.........', '##.###.#.', '.........', '.#.#.#...', '........#'],
    ['.........', '.#.#.#.#.', '...#.....', '.###.#.#.', '.........', '.#.#.###.', '.....#...', '.#.#.#.#.', '.........']
  ]
};

function variants(rows) {
  const n = rows.length;
  const tr = (g) => g[0].split('').map((_, c) => g.map((r) => r[c]).join(''));
  const mir = (g) => g.map((r) => r.split('').reverse().join(''));
  const out = new Map();
  let g = rows;
  for (let k = 0; k < 4; k++) {
    [g, mir(g)].forEach((x) => out.set(x.join('/'), x));
    g = mir(tr(g));    // rotate a quarter turn
  }
  return Array.from(out.values()).filter((x) => x.length === n);
}
const LISTS = {};
Object.keys(PICKED).forEach((k) => {
  const kind = k.slice(0, -1);
  const all = new Map();
  PICKED[k].forEach((t) => variants(t).forEach((v) => { if (!check(v, kind).length) all.set(v.join('/'), v); }));
  LISTS[k] = Array.from(all.values());
});

/* Open 7x7 grids: the classic lattice (black on odd row and odd column), a few extra
   symmetric blocks to break long words, and sometimes one lattice block opened up. */
function lattice(n, rng) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const g = blank(n, '.');
    for (let r = 1; r < n; r += 2) for (let c = 1; c < n; c += 2) g[r][c] = '#';
    const extra = Math.floor(rng() * 3);
    for (let i = 0; i < extra; i++) setSym(g, Math.floor(rng() * n), Math.floor(rng() * n), '#');
    if (rng() < 0.5) {
      const r = 1 + 2 * Math.floor(rng() * ((n - 1) / 2)), c = 1 + 2 * Math.floor(rng() * ((n - 1) / 2));
      setSym(g, r, c, '.');
    }
    const rows = rowsOfGrid(g);
    if (!check(rows, 'open').length) return rows;
  }
  return null;
}

function make(n, kind, rng) {
  const list = LISTS[kind + n];
  if (list && list.length) return list[Math.floor(rng() * list.length)];
  return kind === 'open' ? lattice(n, rng) : null;
}

module.exports = { make, check, slotsOf, LISTS };
