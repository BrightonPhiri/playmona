/* ============================================================
   PLAYMONA — data/missionTrailMaps.js
   Town maps for Mission Trail. A map is reused by many stages.

   rows: one string per row, one character per cell (x = column, y = row):
     g grass   = road   p pavement   - path   ~ water   f garden
     Only road, pavement and path are walkable.
   buildings / props: { key, look, x, y, w, h } (w, h default 1); a
     building is always checkable, a prop only with check: true.
     `look` is an asset id (FF.MissionTrail.Assets); nothing here says
     what a building IS: each stage gives identities to keys.
   sign (props only): a street name the renderer writes on that signpost.
   streets: [{ name, from: [x, y], to: [x, y] }] names straight runs of road
     for "Take Dave Street" in a letter; each named street needs a signpost.
   start: where the walker stands and which way it faces.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.data = FF.data || {};

  FF.data.missionTrailMaps = [
    {
      id: 'village-1',
      name: 'Small village',
      rows: [
        'ggggggggggg',
        'g=========g',
        'g=ggg=ggg=g',
        'g=ggg=ggg=g',
        'g=ggg=ggg=g',
        'g=========g',
        'ggggg=ggg=g',
        'ggggg=====g',
        'ggggg=ggggg',
        'ggggg=ggggg',
        'ggggg=ggggg',
        'ggggg=ggggg'
      ],
      buildings: [
        { key: 'b1', look: 'house-red', x: 2, y: 2, w: 2, h: 2 },
        { key: 'b2', look: 'shop-red', x: 6, y: 2, w: 2, h: 2 },
        { key: 'b3', look: 'house-blue', x: 3, y: 6, w: 2, h: 2 },
        { key: 'b4', look: 'house-green', x: 3, y: 9, w: 2, h: 2 },
        { key: 'b5', look: 'shop-green', x: 6, y: 9, w: 2, h: 2 },
        { key: 'b6', look: 'house-orange', x: 9, y: 9, w: 2, h: 2 }
      ],
      props: [
        { key: 'stopA', look: 'bus-stop', x: 2, y: 4, check: true },
        { key: 'stopB', look: 'bus-stop', x: 8, y: 4, check: true },
        { key: 'stopC', look: 'bus-stop', x: 8, y: 8, check: true },
        { key: 'tree1', look: 'tree-round', x: 4, y: 2 },
        { key: 'tree2', look: 'tree-round', x: 8, y: 2 },
        { key: 'tree3', look: 'tree-pine', x: 0, y: 0 },
        { key: 'tree4', look: 'tree-pine', x: 10, y: 3 },
        { key: 'bench1', look: 'bench', x: 6, y: 4 },
        { key: 'flowers1', look: 'flower-bed', x: 7, y: 6 },
        { key: 'lamp1', look: 'street-lamp', x: 4, y: 4 },
        { key: 'bush1', look: 'bush', x: 6, y: 6 },
        { key: 'bin1', look: 'bin', x: 6, y: 8 }
      ],
      start: { x: 5, y: 10, facing: 'up' }
    },
    {
      id: 'town-1',
      name: 'Market town',
      rows: [
        'ggggggggggggggg',
        'g=============g',
        'g=ggg=ggg=ggg=g',
        'g=ggg=ggg=ggg=g',
        'g=ggg=ggg=ggg=g',
        'g=============g',
        'g=ggg=ggg=ggg=g',
        'g=ggg=ggg=ggg=g',
        'g=ggg=ggg=ggg=g',
        'g=========ggg=g',
        'g=ggg=ggg=ggg=g',
        'g=ggg=ggg=ggg=g',
        'g=ggg=ggg=ggg=g',
        'g=============g',
        'ggggggggggggggg'
      ],
      buildings: [
        { key: 'a1', look: 'shop-red', x: 2, y: 3, w: 2, h: 2 },
        { key: 'b1', look: 'shop-blue', x: 7, y: 3, w: 2, h: 2 },
        { key: 'c1', look: 'house-purple', x: 10, y: 3, w: 2, h: 2 },
        { key: 'a2', look: 'shop-green', x: 3, y: 7, w: 2, h: 2 },
        { key: 'b2', look: 'house-green', x: 7, y: 7, w: 2, h: 2 },
        { key: 'c2', look: 'hall-stone', x: 10, y: 7, w: 2, h: 2 },
        { key: 'a3', look: 'house-orange', x: 2, y: 11, w: 2, h: 2 },
        { key: 'b3', look: 'hall-brick', x: 7, y: 11, w: 2, h: 2 },
        { key: 'c3', look: 'block-glass', x: 11, y: 11, w: 2, h: 2 }
      ],
      props: [
        { key: 'fountain1', look: 'fountain', x: 6, y: 4 },
        { key: 'tree1', look: 'tree-round', x: 4, y: 2 },
        { key: 'tree2', look: 'tree-round', x: 6, y: 2 },
        { key: 'tree3', look: 'tree-pine', x: 12, y: 2 },
        { key: 'tree4', look: 'tree-pine', x: 0, y: 0 },
        { key: 'tree5', look: 'tree-pine', x: 14, y: 0 },
        { key: 'tree6', look: 'tree-round', x: 12, y: 7 },
        { key: 'tree7', look: 'tree-round', x: 6, y: 10 },
        { key: 'lamp1', look: 'street-lamp', x: 4, y: 4 },
        { key: 'bush1', look: 'bush', x: 2, y: 8 },
        { key: 'bench1', look: 'bench', x: 6, y: 6 },
        { key: 'flowers1', look: 'flower-bed', x: 12, y: 6 },
        { key: 'post1', look: 'postbox', x: 10, y: 10 },
        { key: 'lights1', look: 'traffic-light', x: 12, y: 9 },
        { key: 'bin1', look: 'bin', x: 2, y: 10 },
        { key: 'signDave', look: 'signpost', x: 4, y: 12, sign: 'Dave Street' },
        { key: 'signMill', look: 'signpost', x: 6, y: 14, sign: 'Mill Road' }
      ],
      streets: [
        { name: 'Dave Street', from: [5, 1], to: [5, 12] },
        { name: 'Mill Road', from: [6, 13], to: [13, 13] }
      ],
      start: { x: 9, y: 12, facing: 'up' }
    }
  ];
})();
