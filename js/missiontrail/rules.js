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
    return CLOCKWISE[(i + (side === 'left' ? 3 : 1)) % 4];
  }

  function thingFrom(def, kind) {
    return {
      key: def.key,
      kind: kind,
      look: def.look,
      x: def.x,
      y: def.y,
      w: def.w || 1,
      h: def.h || 1,
      check: kind === 'building' ? true : !!def.check
    };
  }

  /* A map ready for play: ground, walkability and the things on it. */
  function buildMap(def) {
    var rows = def.rows || [];
    var h = rows.length;
    var w = rows.reduce(function (n, r) { return Math.max(n, r.length); }, 0);
    var things = (def.buildings || []).map(function (b) { return thingFrom(b, 'building'); })
      .concat((def.props || []).map(function (p) { return thingFrom(p, 'prop'); }));
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
      thingAt: function (x, y) { return inside(x, y) ? (cover[y * w + x] || null) : null; },
      walkable: function (x, y) {
        var g = ground(x, y);
        return g !== null && WALK.indexOf(g) !== -1 && !cover[y * w + x];
      }
    };
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
  function routeCells(map, start, route) {
    var pos = { x: start.x, y: start.y, facing: start.facing || 'up' };
    var cells = [[pos.x, pos.y]];
    var items = route || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.turn) {
        pos.facing = turn(pos.facing, it.turn);
      } else if (it.go) {
        for (var n = 0; n < it.go; n++) {
          var next = move(map, pos, pos.facing);
          if (!next.moved) {
            return { ok: false, cells: cells, end: pos, error: 'route item ' + (i + 1) + ' is blocked at step ' + (n + 1) + ' from (' + pos.x + ',' + pos.y + ')' };
          }
          pos = { x: next.x, y: next.y, facing: pos.facing };
          cells.push([pos.x, pos.y]);
        }
      } else {
        return { ok: false, cells: cells, end: pos, error: 'route item ' + (i + 1) + ' is not a go or a turn' };
      }
    }
    return { ok: true, cells: cells, end: pos, error: null };
  }

  /* The numbered direction lines of the letter. */
  function directions(route) {
    return (route || []).map(function (it) {
      if (it.turn === 'left') return t('mtTurnLeft', 'Turn left.');
      if (it.turn === 'right') return t('mtTurnRight', 'Turn right.');
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
    move: move,
    routeCells: routeCells,
    directions: directions,
    inReach: inReach,
    visibleCells: visibleCells,
    roadMask: roadMask
  };
})();
