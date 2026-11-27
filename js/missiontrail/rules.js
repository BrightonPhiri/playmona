/* ============================================================
   PLAYMONA — missiontrail/rules.js
   Mission Trail's grid rules, with no DOM: building a map from its
   data, which cells can be walked, a move, the cells a letter's route
   covers, the letter's direction lines, what is in reach, fog of war
   and which way each road cell joins its neighbours.

   Coordinates: x is the column, y the row; up is y - 1. Maps are always
   drawn north-up. Tests: tools/test/missionTrail.test.js.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  function t(key, fallback, vars) {
    if (FF.t) return FF.t(key, fallback, vars);
    var s = String(fallback);
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var CLOCKWISE = ['up', 'right', 'down', 'left'];
  var WALK = '=p-';

  function turn(facing, side) {
    var i = CLOCKWISE.indexOf(facing);
    if (i === -1) i = 0;
    return CLOCKWISE[(i + (side === 'left' ? 3 : side === 'around' ? 2 : 1)) % 4];
  }

  function thingFrom(def, kind) {
    // A car's picture depends on which way it is parked: look 'car-green' + facing 'down'.
    var vehicle = kind === 'vehicle';
    return {
      key: def.key,
      kind: kind,
      look: vehicle ? def.look + '-' + (def.facing || 'down') : def.look,
      car: vehicle ? def.look : null,
      x: def.x,
      y: def.y,
      w: def.w || 1,
      h: def.h || 1,
      check: kind === 'prop' ? !!def.check : true,
      sign: typeof def.sign === 'string' ? def.sign : null
    };
  }

  /* A map ready for play: ground, walkability and the things on it. */
  function buildMap(def) {
    var rows = def.rows || [];
    var h = rows.length;
    var w = rows.reduce(function (n, r) { return Math.max(n, r.length); }, 0);
    var things = (def.buildings || []).map(function (b) { return thingFrom(b, 'building'); })
      .concat((def.props || []).map(function (p) { return thingFrom(p, 'prop'); }))
      .concat((def.vehicles || []).map(function (v) { return thingFrom(v, 'vehicle'); }));
    var byKey = {};
    var cover = new Array(w * h);
    things.forEach(function (th) {
      byKey[th.key] = th;
      for (var y = th.y; y < th.y + th.h; y++) {
        for (var x = th.x; x < th.x + th.w; x++) {
          if (x >= 0 && y >= 0 && x < w && y < h) cover[y * w + x] = th;
        }
      }
    });
    function inside(x, y) { return x >= 0 && y >= 0 && x < w && y < h; }
    function ground(x, y) { return inside(x, y) ? (rows[y].charAt(x) || 'g') : null; }
    var start = def.start || { x: 0, y: 0, facing: 'up' };
    // Street names: straight segments { name, from: [x, y], to: [x, y] } (or cells: [[x, y]...]).
    var street = {};
    (def.streets || []).forEach(function (st) {
      var cells = st.cells || [];
      if (st.from && st.to) {
        var x0 = st.from[0], y0 = st.from[1], x1 = st.to[0], y1 = st.to[1];
        var sx = x1 > x0 ? 1 : (x1 < x0 ? -1 : 0);
        var sy = y1 > y0 ? 1 : (y1 < y0 ? -1 : 0);
        var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        cells = cells.slice();
        for (var k = 0; k <= n; k++) cells.push([x0 + sx * k, y0 + sy * k]);
      }
      cells.forEach(function (c) { street[c[0] + ',' + c[1]] = st.name; });
    });
    var streetNames = (def.streets || []).map(function (st) { return st.name; });
    return {
      id: def.id,
      name: def.name,
      w: w,
      h: h,
      rows: rows,
      things: things,
      start: { x: start.x, y: start.y, facing: start.facing || 'up' },
      ground: ground,
      thing: function (key) { return byKey[key] || null; },
      streets: streetNames,
      streetAt: function (x, y) { return street[x + ',' + y] || null; },
      thingAt: function (x, y) { return inside(x, y) ? (cover[y * w + x] || null) : null; },
      walkable: function (x, y) {
        var g = ground(x, y);
        return g !== null && WALK.indexOf(g) !== -1 && !cover[y * w + x];
      }
    };
  }

  /* The map a stage plays on: the shared town plus the cars this stage parks on it. */
  function mapFor(def, stage) {
    var copy = {};
    Object.keys(def || {}).forEach(function (k) { copy[k] = def[k]; });
    copy.vehicles = (def.vehicles || []).concat((stage && stage.vehicles) || []);
    return buildMap(copy);
  }

  /* One arrow press: face that way, then step if the cell ahead is free. */
  function move(map, pos, dir) {
    var d = DIRS[dir];
    if (!d) return { x: pos.x, y: pos.y, facing: pos.facing, moved: false };
    var nx = pos.x + d[0];
    var ny = pos.y + d[1];
    if (map.walkable(nx, ny)) return { x: nx, y: ny, facing: dir, moved: true };
    return { x: pos.x, y: pos.y, facing: dir, moved: false };
  }

  /* The cells a route covers, the start included. */
  /* A cell with three or more ways to go: where a turn is a real choice. */
  function isJunction(map, x, y) {
    var m = roadMask(map, x, y);
    return ((m & 1 ? 1 : 0) + (m & 2 ? 1 : 0) + (m & 4 ? 1 : 0) + (m & 8 ? 1 : 0)) >= 3;
  }

  /* Route items: { go: n }, { turn: 'left'|'right'|'around' }, { go: 'until', at: key } (straight on
     until that landmark is in reach), { go: 'junction', n } (straight on to the nth
     intersection) and { take: street, turn } (face onto that named street). */
  function routeCells(map, start, route) {
    var pos = { x: start.x, y: start.y, facing: start.facing || 'up' };
    var cells = [[pos.x, pos.y]];
    var items = route || [];
    var limit = map.w * map.h;
    function fail(i, msg) { return { ok: false, cells: cells, end: pos, error: 'route item ' + (i + 1) + ' ' + msg }; }
    function step() {
      var next = move(map, pos, pos.facing);
      if (!next.moved) return false;
      pos = { x: next.x, y: next.y, facing: pos.facing };
      cells.push([pos.x, pos.y]);
      return true;
    }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.take) {
        var f = it.turn ? turn(pos.facing, it.turn) : pos.facing;
        var d = DIRS[f];
        if (map.streetAt(pos.x + d[0], pos.y + d[1]) !== it.take) return fail(i, 'does not face onto ' + it.take + ' from (' + pos.x + ',' + pos.y + ')');
        pos.facing = f;
      } else if (it.turn) {
        pos.facing = turn(pos.facing, it.turn);
      } else if (it.go === 'until') {
        var mark = map.thing(it.at);
        if (!mark) return fail(i, 'names the landmark "' + it.at + '", which is not on the map');
        if (inReach(pos, mark)) return fail(i, 'starts already beside "' + it.at + '"');
        var got = false;
        for (var u = 0; u < limit && !got; u++) {
          if (!step()) return fail(i, 'is blocked before reaching "' + it.at + '"');
          got = inReach(pos, mark);
        }
        if (!got) return fail(i, 'never reaches "' + it.at + '"');
      } else if (it.go === 'junction') {
        var want = it.n || 1;
        var seen = 0;
        for (var j = 0; j < limit && seen < want; j++) {
          if (!step()) return fail(i, 'is blocked before intersection ' + (seen + 1));
          if (isJunction(map, pos.x, pos.y)) seen += 1;
        }
        if (seen < want) return fail(i, 'never reaches intersection ' + want);
      } else if (typeof it.go === 'number' && it.go > 0) {
        for (var n = 0; n < it.go; n++) {
          var next = move(map, pos, pos.facing);
          if (!next.moved) {
            return { ok: false, cells: cells, end: pos, error: 'route item ' + (i + 1) + ' is blocked at step ' + (n + 1) + ' from (' + pos.x + ',' + pos.y + ')' };
          }
          pos = { x: next.x, y: next.y, facing: pos.facing };
          cells.push([pos.x, pos.y]);
        }
      } else {
        return fail(i, 'is not a go, a turn or a take');
      }
    }
    return { ok: true, cells: cells, end: pos, error: null };
  }

  var NTH = ['next', 'second', 'third', 'fourth', 'fifth'];

  /* The numbered direction lines of the letter. opts.name(key) names a landmark. */
  function directions(route, opts) {
    var name = opts && opts.name ? opts.name : function (k) { return k; };
    return (route || []).map(function (it) {
      if (it.take) return t('mtTake', 'Take {street}.', { street: it.take });
      if (it.go === 'until') return t('mtUntil', 'Go straight until you reach the {name}.', { name: String(name(it.at)).toLowerCase() });
      if (it.go === 'junction') {
        var n = it.n || 1;
        if (n === 1) return t('mtNextJunction', 'Continue to the next intersection.');
        return t('mtNthJunction', 'Continue until the {nth} intersection.', { nth: t('mtNth' + n, NTH[n - 1] || String(n)) });
      }
      if (it.turn === 'left') return t('mtTurnLeft', 'Turn left.');
      if (it.turn === 'right') return t('mtTurnRight', 'Turn right.');
      if (it.turn === 'around') return t('mtTurnAround', 'Turn around.');
      if (it.go === 1) return t('mtGoOne', 'Go straight for 1 step.');
      return t('mtGoMany', 'Go straight for {n} steps.', { n: it.go });
    });
  }

  /* Within one cell of the thing's rectangle, diagonals included. */
  function inReach(pos, thing) {
    if (!thing) return false;
    var dx = pos.x < thing.x ? thing.x - pos.x : (pos.x > thing.x + thing.w - 1 ? pos.x - (thing.x + thing.w - 1) : 0);
    var dy = pos.y < thing.y ? thing.y - pos.y : (pos.y > thing.y + thing.h - 1 ? pos.y - (thing.y + thing.h - 1) : 0);
    return Math.max(dx, dy) <= 1;
  }

  /* Cells the walker can see: a rounded circle of `radius` cells. */
  function visibleCells(map, pos, radius) {
    var out = [];
    var r = Math.max(0, radius | 0);
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var x = pos.x + dx;
        var y = pos.y + dy;
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
        if (dx * dx + dy * dy <= r * r + r) out.push(y * map.w + x);
      }
    }
    return out;
  }

  /* Which neighbours of a walkable cell are walkable ground: 1 up, 2 right, 4 down, 8 left. */
  function roadMask(map, x, y) {
    function road(cx, cy) { var g = map.ground(cx, cy); return g !== null && WALK.indexOf(g) !== -1; }
    if (!road(x, y)) return 0;
    return (road(x, y - 1) ? 1 : 0) | (road(x + 1, y) ? 2 : 0) | (road(x, y + 1) ? 4 : 0) | (road(x - 1, y) ? 8 : 0);
  }

  FF.MissionTrail.Rules = {
    DIRS: DIRS,
    WALK: WALK,
    turn: turn,
    buildMap: buildMap,
    mapFor: mapFor,
    move: move,
    routeCells: routeCells,
    isJunction: isJunction,
    directions: directions,
    inReach: inReach,
    visibleCells: visibleCells,
    roadMask: roadMask
  };
})();
