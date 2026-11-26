/* ============================================================
   PLAYMONA — data/hiddenObject.js
   Hidden Object scenes. Each scene hides 12 objects; each object is a
   name and a box [x, y, width, height] in 0..1 picture coordinates.
   The picture is assets/images/games/hiddenObject/<id>.webp; a scene is
   used only once it is in the asset manifest.
   Boxes come from comparing the empty and hidden pictures
   (tools/art/spot-diff-find.py --game hiddenObject), then tightened by eye.
   ============================================================ */
window.FF = window.FF || {};
FF.data = FF.data || {};

FF.data.hiddenObject = {
  scenes: [
    {
      id: 'attic',
      name: 'Cluttered Attic',
      objects: [
        { n: 'teapot', b: [0.172, 0.125, 0.07, 0.06] },
        { n: 'golden key', b: [0.793, 0.103, 0.065, 0.04] },
        { n: 'violin', b: [0.168, 0.345, 0.06, 0.16] },
        { n: 'rubber duck', b: [0.55, 0.175, 0.045, 0.05] },
        { n: 'toy sailboat', b: [0.776, 0.44, 0.046, 0.06] },
        { n: 'umbrella', b: [0.822, 0.288, 0.058, 0.245] },
        { n: 'banana', b: [0.095, 0.68, 0.068, 0.08] },
        { n: 'red mitten', b: [0.292, 0.572, 0.07, 0.085] },
        { n: 'crown', b: [0.472, 0.725, 0.09, 0.065] },
        { n: 'sea shell', b: [0.498, 0.672, 0.054, 0.04] },
        { n: 'horseshoe', b: [0.415, 0.893, 0.085, 0.065] },
        { n: 'roller skate', b: [0.833, 0.852, 0.093, 0.093] }
      ]
    }
  ]
};
