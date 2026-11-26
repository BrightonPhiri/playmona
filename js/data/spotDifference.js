/* ============================================================
   PLAYMONA — data/spotDifference.js
   Spot the Difference picture pairs. Picture A is the original and
   picture B the same picture with 10 changes:
   assets/images/games/spotDifference/<id>-a.webp and <id>-b.webp, made in
   Codex from docs/art/spotDifference-prompts.md.

   Each spot is in 0..1 picture coordinates, [x, y, width, height]:
     b  the changed area (taps count here, the circle goes round it)
     p  a larger area that is safe to paint back from picture A when a
        level uses fewer than 10 differences (it never covers another spot)
   Found by tools/art/spot-diff-find.py <id>; the labels are by hand.
   A pair is used only once both pictures are in the asset manifest.
   ============================================================ */
window.FF = window.FF || {};
FF.data = FF.data || {};

FF.data.spotDifference = {
  pairs: [
    { id: 'market-day', name: 'Market Day', spots: [
      { l: 'A bunting flag turned green', b: [0.119, 0.029, 0.083, 0.105], p: [0.082, 0, 0.158, 0.181] },
      { l: 'The bird on the lamp post', b: [0.722, 0.016, 0.077, 0.071], p: [0.684, 0, 0.154, 0.122] },
      { l: 'The kite turned orange', b: [0.879, 0, 0.09, 0.081], p: [0.834, 0, 0.166, 0.121] },
      { l: 'The bananas on the awning', b: [0.029, 0.182, 0.158, 0.155], p: [0, 0.135, 0.235, 0.248] },
      { l: 'A watermelon became a pumpkin', b: [0.472, 0.385, 0.099, 0.074], p: [0.423, 0.348, 0.198, 0.148] },
      { l: 'The oranges became limes', b: [0, 0.566, 0.178, 0.158], p: [0, 0.487, 0.266, 0.317] },
      { l: 'A red ball by the dog', b: [0.41, 0.572, 0.061, 0.065], p: [0.379, 0.54, 0.123, 0.129] },
      { l: 'The flowers in the bike basket', b: [0.638, 0.582, 0.193, 0.13], p: [0.599, 0.556, 0.27, 0.182] },
      { l: 'The cat turned black', b: [0.779, 0.497, 0.212, 0.115], p: [0.736, 0.474, 0.264, 0.16] },
      { l: 'A potted plant by the bread', b: [0.332, 0.807, 0.146, 0.152], p: [0.259, 0.731, 0.292, 0.269] }
    ] }
  ]
};
