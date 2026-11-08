/* ============================================================
   PLAYMONA — crossword/cursor.js
   Where the cursor goes in Mini Crossword, and whose turn it is
   when a family shares one device. Pure helpers (no DOM) so the
   tests can check them.

   built = FF.CrosswordRules.build(puzzle); filled = { 'r,c': 'A' };
   sel = { r, c }; positions come back as { r, c, dir }.

     C.order(built)                      clue-list order: Across, then Down
     C.next(built, filled, sel, dir)     after typing a letter
     C.prev(built, filled, sel, dir)     backspace on an empty square
     C.nextClue(built, filled, id, step) the clue arrows (+1 / -1)

     FF.CrosswordTurns.afterWord(state, wordId, byId, points)
     FF.CrosswordTurns.afterWrong(state)
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function key(rc) { return rc[0] + ',' + rc[1]; }
  function byId(built) {
    var m = {};
    built.words.forEach(function (w) { m[w.id] = w; });
    return m;
  }
  function order(built) {
    var a = built.words.filter(function (w) { return w.dir === 'across'; });
    var d = built.words.filter(function (w) { return w.dir === 'down'; });
    return a.concat(d).map(function (w) { return w.id; });
  }
  function wordAt(built, sel, dir) {
    var at = built.at[sel.r + ',' + sel.c];
    if (!at) return null;
    var id = at[dir] || at[dir === 'across' ? 'down' : 'across'];
    return id ? byId(built)[id] : null;
  }
  function empties(w, filled) { return w.cells.filter(function (rc) { return !filled[key(rc)]; }); }
  function pos(rc, dir) { return { r: rc[0], c: rc[1], dir: dir }; }
  function startOf(w, filled) {
    var e = empties(w, filled);
    return pos(e.length ? e[0] : w.cells[0], w.dir);
  }

  function nextClue(built, filled, id, step) {
    var ids = order(built), words = byId(built);
    var i = ids.indexOf(id);
    if (i < 0) i = 0;
    var open = ids.filter(function (x) { return empties(words[x], filled).length; });
    for (var k = 1; k <= ids.length; k++) {
      var j = ((i + step * k) % ids.length + ids.length) % ids.length;
      var w = words[ids[j]];
      if (!open.length || open.indexOf(w.id) >= 0) return startOf(w, filled);
    }
    return startOf(words[ids[i]], filled);
  }

  function next(built, filled, sel, dir) {
    var w = wordAt(built, sel, dir);
    if (!w) return { r: sel.r, c: sel.c, dir: dir };
    var here = -1;
    w.cells.forEach(function (rc, k) { if (rc[0] === sel.r && rc[1] === sel.c) here = k; });
    var k;
    for (k = here + 1; k < w.cells.length; k++) if (!filled[key(w.cells[k])]) return pos(w.cells[k], w.dir);
    for (k = 0; k < here; k++) if (!filled[key(w.cells[k])]) return pos(w.cells[k], w.dir);
    var ids = order(built), words = byId(built);
    var i = ids.indexOf(w.id);
    for (k = 1; k < ids.length; k++) {
      var o = words[ids[(i + k) % ids.length]];
      if (empties(o, filled).length) return startOf(o, filled);
    }
    return { r: sel.r, c: sel.c, dir: w.dir };
  }

  function prev(built, filled, sel, dir) {
    var w = wordAt(built, sel, dir);
    if (!w) return { r: sel.r, c: sel.c, dir: dir };
    var here = -1;
    w.cells.forEach(function (rc, k) { if (rc[0] === sel.r && rc[1] === sel.c) here = k; });
    if (here > 0) return pos(w.cells[here - 1], w.dir);
    var ids = order(built), words = byId(built);
    var o = words[ids[(ids.indexOf(w.id) - 1 + ids.length) % ids.length]];
    return pos(o.cells[o.cells.length - 1], o.dir);
  }

  FF.CrosswordCursor = { order: order, next: next, prev: prev, nextClue: nextClue, wordAt: wordAt };

  /* Take turns on one device: a turn is one word. state = { order: [ids], cur, points: { id: n } } */
  function afterWord(state, wordId, who, points) {
    var p = Object.assign({}, state.points);
    p[who] = (p[who] || 0) + (points || 0);
    return { order: state.order, cur: (state.cur + 1) % state.order.length, points: p };
  }
  function afterWrong(state) {
    return { order: state.order, cur: (state.cur + 1) % state.order.length, points: state.points };
  }
  FF.CrosswordTurns = { afterWord: afterWord, afterWrong: afterWrong };
})();
