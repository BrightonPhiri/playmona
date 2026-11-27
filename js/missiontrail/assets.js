/* ============================================================
   PLAYMONA — missiontrail/assets.js
   Mission Trail's picture registry. Maps and stages name pictures by id
   ('bus-stop', 'house-red'); this turns an id into its file,
   assets/images/games/missionTrail/<category>/<id>.webp, using the
   generated asset manifest (FF.AssetManifest) for the cache-busting
   fingerprint. load() fetches only what a stage needs, once per visit.

   To add a picture: cut it into one of the category folders (see
   tools/art/missionTrail.json) and run node tools/gen-asset-manifest.js.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  var BASE = 'games/missionTrail/';
  var CATS = ['buildings', 'props', 'walker', 'ground', 'ui', 'characters', 'objects', 'vehicles', 'scenes'];
  // Art pack Batch 2 (docs/art/missionTrail-batch2-prompts.md, tools/art/missionTrail.json): pictures that are promised but
  // may not be cut yet. A stage that needs one stays hidden until it arrives; the validator
  // lists these as "waiting for art", not as mistakes.
  var PLANNED = {
    characters: ['librarian', 'teacher', 'doctor', 'nurse', 'mechanic', 'postman',
      'shopkeeper', 'gardener', 'grandma', 'grandpa', 'boy', 'girl'],
    objects: ['red-cap', 'blue-cap', 'green-cap', 'medical-bag', 'newspaper', 'keys',
      'book-blue', 'book-red', 'umbrella', 'teddy-bear', 'water-bottle', 'watch'],
    vehicles: ['car-red-down', 'car-red-left', 'car-red-right', 'car-red-up',
      'car-blue-down', 'car-blue-left', 'car-blue-right', 'car-blue-up',
      'car-green-down', 'car-green-left', 'car-green-right', 'car-green-up'],
    scenes: ['bedroom', 'hallway', 'kitchen', 'library', 'classroom', 'hospital', 'post-office', 'garage']
  };
  // Which picture folder a step's scene options come from.
  var OPTION_CAT = { collect: 'objects', give: 'characters', meet: 'characters' };
  var CAR_DIRS = ['down', 'left', 'right', 'up'];
  // The ground texture for each map character; roads also need the pavement (kerbs).
  var GROUND = { g: 'grass', '=': 'asphalt', p: 'pavement', '-': 'park-path', '~': 'water', f: 'garden' };
  var WALKER_DIRS = ['down', 'left', 'right', 'up'];
  var cache = {};

  function known(category, id) {
    var m = FF.AssetManifest && FF.AssetManifest[BASE + category];
    return !!(m && typeof m[id] === 'string');
  }

  function path(category, id) {
    if (FF.Assets && FF.Assets.artPath) return FF.Assets.artPath(BASE + category, id);
    return 'assets/images/' + BASE + category + '/' + id + '.webp';
  }

  function catOf(th) {
    return th.kind === 'building' ? 'buildings' : (th.kind === 'vehicle' ? 'vehicles' : 'props');
  }

  function planned(category, id) {
    return !!(PLANNED[category] && PLANNED[category].indexOf(id) !== -1);
  }

  function lister() {
    var seen = {};
    var out = [];
    out.add = function (category, id) {
      var k = category + '/' + id;
      if (seen[k]) return;
      seen[k] = true;
      out.push({ category: category, id: id });
    };
    return out;
  }

  function forMap(map, into) {
    var out = into || lister();
    var add = out.add;
    for (var y = 0; y < map.h; y++) {
      for (var x = 0; x < map.w; x++) {
        var g = map.ground(x, y);
        if (GROUND[g]) add('ground', GROUND[g]);
        if (g === '=') add('ground', 'pavement');
      }
    }
    map.things.forEach(function (th) {
      // A car the player may drive needs every direction.
      if (th.kind === 'vehicle') CAR_DIRS.forEach(function (d) { add('vehicles', th.car + '-' + d); });
      else add(catOf(th), th.look);
    });
    WALKER_DIRS.forEach(function (d) { for (var f = 0; f < 3; f++) add('walker', 'walker-' + d + '-' + f); });
    return out;
  }

  /* Every picture a stage needs: its map (with the stage's cars) plus the scenes its steps open. */
  function forStage(stage, map) {
    var out = forMap(map);
    ((stage && stage.steps) || []).forEach(function (step) {
      var sc = step.scene;
      if (!sc) return;
      if (sc.backdrop) out.add('scenes', sc.backdrop);
      var cat = OPTION_CAT[step.do];
      if (cat) (sc.options || []).forEach(function (id) { out.add(cat, id); });
    });
    return out;
  }

  /* The pictures in the list that have not been cut yet. */
  function missing(list) {
    return list.filter(function (it) { return !known(it.category, it.id); });
  }

  function loadOne(category, id) {
    var k = category + '/' + id;
    if (!cache[k]) {
      cache[k] = new Promise(function (resolve, reject) {
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () { resolve(img); };
        img.onerror = function () { delete cache[k]; reject(new Error('Mission Trail picture missing: ' + k)); };
        img.src = path(category, id);
      });
    }
    return cache[k];
  }

  /* Resolves to { 'category/id': HTMLImageElement } for every item in the list. */
  function load(list) {
    return Promise.all(list.map(function (it) { return loadOne(it.category, it.id); })).then(function (imgs) {
      var out = {};
      list.forEach(function (it, i) { out[it.category + '/' + it.id] = imgs[i]; });
      return out;
    });
  }

  FF.MissionTrail.Assets = {
    CATS: CATS,
    GROUND: GROUND,
    PLANNED: PLANNED,
    OPTION_CAT: OPTION_CAT,
    known: known,
    planned: planned,
    catOf: catOf,
    path: path,
    forMap: forMap,
    forStage: forStage,
    missing: missing,
    load: load
  };
})();
