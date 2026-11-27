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
  var CATS = ['buildings', 'props', 'walker', 'ground', 'ui'];
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

  function forMap(map) {
    var seen = {};
    var out = [];
    function add(category, id) {
      var k = category + '/' + id;
      if (seen[k]) return;
      seen[k] = true;
      out.push({ category: category, id: id });
    }
    for (var y = 0; y < map.h; y++) {
      for (var x = 0; x < map.w; x++) {
        var g = map.ground(x, y);
        if (GROUND[g]) add('ground', GROUND[g]);
        if (g === '=') add('ground', 'pavement');
      }
    }
    map.things.forEach(function (th) { add(th.kind === 'building' ? 'buildings' : 'props', th.look); });
    WALKER_DIRS.forEach(function (d) { for (var f = 0; f < 3; f++) add('walker', 'walker-' + d + '-' + f); });
    return out;
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
    known: known,
    path: path,
    forMap: forMap,
    load: load
  };
})();
