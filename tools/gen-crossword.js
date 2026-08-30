/* Generates internally-consistent crossword grids via backtracking + validation.
   Emits JSON for the FF.data.words.crosswords array.
   Run: node tools/gen-crossword.js
*/
'use strict';
var fs = require('fs');
var path = require('path');

var BANK = [
  ['CAT', 'A furry pet that says meow'], ['DOG', "Man's best friend"], ['SUN', 'The star that lights our day'],
  ['CAR', 'A four-wheeled vehicle'], ['BEE', 'An insect that makes honey'], ['ANT', 'A tiny hard-working insect'],
  ['COW', 'A farm animal that gives milk'], ['HAT', 'Worn on your head'], ['CUP', 'You drink tea from it'],
  ['PEN', 'You write with it'], ['BAG', 'You carry things in it'], ['MAP', 'Shows you where to go'],
  ['BOX', 'A container made of cardboard'], ['EGG', 'Comes from a chicken'], ['ICE', 'Frozen water'],
  ['KEY', 'Opens a lock'], ['LEG', 'You walk on it'], ['NUT', 'A hard snack in a shell'],
  ['OWL', 'A bird that stays up at night'], ['PIG', 'A pink farm animal'], ['SKY', 'Look up to see it'],
  ['TOY', 'Children play with it'], ['BALL', 'You throw and catch it'], ['FISH', 'Swims in water'],
  ['TREE', 'Tall with leaves and branches'], ['STAR', 'Twinkles in the night sky'], ['MOON', 'Glows in the night sky'],
  ['CAKE', 'Sweet treat for birthdays'], ['BOOK', 'You read it'], ['DESK', 'You write at it in school'],
  ['DOOR', 'You open it to enter'], ['FROG', 'Jumps and says ribbit'], ['GOAT', 'A farm animal with horns'],
  ['KITE', 'Flies in the wind on a string'], ['LION', 'The king of the jungle'], ['MILK', 'A white drink from cows'],
  ['NEST', 'A bird builds it'], ['RAIN', 'Falls from clouds'], ['SEED', 'Grows into a plant'],
  ['SHOE', 'You wear it on your foot'], ['SNOW', 'Cold white flakes in winter'], ['SOUP', 'A warm liquid meal'],
  ['WAVE', 'Rolls onto the beach'], ['WIND', 'Moves the leaves'], ['APPLE', 'A red or green fruit'],
  ['BEACH', 'Sand beside the sea'], ['BREAD', 'Baked from flour and yeast'], ['CHAIR', 'You sit on it'],
  ['CLOCK', 'Tells the time'], ['EARTH', 'Our home planet'], ['GLASS', 'You drink water from it'],
  ['HORSE', 'People ride this animal'], ['HOUSE', 'A building people live in'], ['MOUSE', 'A small animal with a tail'],
  ['OCEAN', 'A huge body of salt water'], ['PIANO', 'A musical instrument with keys'], ['PLANT', 'A living thing that grows'],
  ['RIVER', 'Flowing water'], ['TIGER', 'A big striped cat'], ['WATER', 'You drink it every day'],
  ['WORLD', 'Our planet and everyone on it'], ['ZEBRA', 'A horse with black and white stripes']
];

function clueFor(word) { var b = BANK.find(function (x) { return x[0] === word; }); return b ? b[1] : word; }

function canPlace(grid, word, r, c, dir) {
  var n = grid.length;
  var dr = dir === 'across' ? 0 : 1;
  var dc = dir === 'across' ? 1 : 0;
  var beforeR = r - dr, beforeC = c - dc;
  var afterR = r + dr * word.length, afterC = c + dc * word.length;
  if (beforeR >= 0 && beforeC >= 0 && beforeR < n && beforeC < n && grid[beforeR][beforeC] !== null) return false;
  if (afterR >= 0 && afterC >= 0 && afterR < n && afterC < n && grid[afterR][afterC] !== null) return false;
  if (r + dr * (word.length - 1) >= n || c + dc * (word.length - 1) >= n || r + dr * (word.length - 1) < 0 || c + dc * (word.length - 1) < 0) return false;
  var cross = 0;
  for (var i = 0; i < word.length; i++) {
    var rr = r + dr * i, cc = c + dc * i;
    if (grid[rr][cc] !== null) {
      if (grid[rr][cc] !== word[i]) return false;
      cross++;
    }
  }
  return cross > 0;
}

function placeWord(grid, word, r, c, dir) {
  var dr = dir === 'across' ? 0 : 1, dc = dir === 'across' ? 1 : 0;
  for (var i = 0; i < word.length; i++) grid[r + dr * i][c + dc * i] = word[i];
}

function runs(grid) {
  var n = grid.length, out = [];
  var r, c, s, rr, cc;
  for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
    if (grid[r][c] !== null && (c === 0 || grid[r][c - 1] === null)) {
      s = ''; cc = c;
      while (cc < n && grid[r][cc] !== null) { s += grid[r][cc]; cc++; }
      if (s.length > 1) out.push({ word: s, r: r, c: c, dir: 'across' });
    }
  }
  for (c = 0; c < n; c++) for (r = 0; r < n; r++) {
    if (grid[r][c] !== null && (r === 0 || grid[r - 1][c] === null)) {
      s = ''; rr = r;
      while (rr < n && grid[rr][c] !== null) { s += grid[rr][c]; rr++; }
      if (s.length > 1) out.push({ word: s, r: r, c: c, dir: 'down' });
    }
  }
  return out;
}

function sortKey(a) { return a.r + ',' + a.c + ',' + a.dir + ',' + a.word; }

function valid(grid, placed) {
  var rs = runs(grid);
  if (rs.length !== placed.length) return false;
  var rk = rs.map(sortKey).sort().join('|');
  var pk = placed.map(sortKey).sort().join('|');
  return rk === pk;
}

function build(size, words) {
  var n = size, i, r, c, di, dir, placedNow;
  var target = size === 5 ? 5 : (size === 7 ? 7 : 9);
  for (var attempt = 0; attempt < 20000; attempt++) {
    var grid = [];
    for (i = 0; i < n; i++) grid.push(new Array(n).fill(null));
    var shuffled = words.slice().sort(function () { return Math.random() - 0.5; });
    placeWord(grid, shuffled[0], 0, 0, 'across');
    var placed = [{ word: shuffled[0], r: 0, c: 0, dir: 'across' }];
    var ok = true;
    for (var w = 1; w < shuffled.length && placed.length < target; w++) {
      var word = shuffled[w];
      placedNow = false;
      for (r = 0; r < n && !placedNow; r++) for (c = 0; c < n && !placedNow; c++) {
        for (di = 0; di < 2 && !placedNow; di++) {
          dir = di === 0 ? 'across' : 'down';
          if (canPlace(grid, word, r, c, dir)) {
            placeWord(grid, word, r, c, dir);
            placed.push({ word: word, r: r, c: c, dir: dir });
            placedNow = true;
          }
        }
      }
    }
    if (placed.length >= target && valid(grid, placed)) {
      // number the cells
      var num = 0, cellNum = {};
      for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
        if (grid[r][c] === null) continue;
        var sa = grid[r][c] !== null && (c === 0 || grid[r][c - 1] === null);
        var sd = grid[r][c] !== null && (r === 0 || grid[r - 1][c] === null);
        if (sa || sd) { num++; cellNum[r + ',' + c] = num; }
      }
      var clues = { across: [], down: [] };
      placed.forEach(function (p) {
        clues[p.dir].push({ num: cellNum[p.r + ',' + p.c], row: p.r, col: p.c, clue: clueFor(p.word) });
      });
      clues.across.sort(function (a, b) { return a.num - b.num; });
      clues.down.sort(function (a, b) { return a.num - b.num; });
      return { size: n, grid: grid, clues: clues };
    }
  }
  return null;
}

var out = [];
[5, 7, 9].forEach(function (size) {
  var words = BANK.filter(function (b) { return b[0].length <= size; }).map(function (b) { return b[0]; });
  var p = build(size, words);
  if (p) out.push(p);
});

console.log(JSON.stringify(out));
fs.writeFileSync(path.join(__dirname, 'crosswords.json'), JSON.stringify(out), 'utf8');
console.log('\nGenerated ' + out.length + ' puzzles, sizes: ' + out.map(function (p) { return p.size; }).join(', '));
