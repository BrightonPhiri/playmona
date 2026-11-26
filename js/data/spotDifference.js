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
     g  spots that overlap (a canoe and the rod lying across it) share a
        group: the game makes them live together or paints them back together
   Found by tools/art/spot-diff-find.py (the command for each pair is in
   tools/art/spotDifference-spots/commands.txt); the labels are by hand.
   A pair is used only once both pictures are in the asset manifest.
   ============================================================ */
window.FF = window.FF || {};
FF.data = FF.data || {};

FF.data.spotDifference = {
  pairs: [
    { id: 'market-day', name: 'Market Day', spots: [
      { l: 'A bunting flag turned green', b: [0.119, 0.029, 0.083, 0.105], p: [0.075, 0, 0.172, 0.188] },
      { l: 'The bird on the lamp post', b: [0.722, 0.016, 0.077, 0.071], p: [0.684, 0, 0.153, 0.125] },
      { l: 'The kite turned orange', b: [0.879, 0, 0.09, 0.081], p: [0.834, 0, 0.166, 0.122] },
      { l: 'The bananas on the awning', b: [0.029, 0.182, 0.158, 0.155], p: [0, 0.113, 0.269, 0.303] },
      { l: 'A watermelon became a pumpkin', b: [0.472, 0.385, 0.099, 0.074], p: [0.422, 0.347, 0.2, 0.15] },
      { l: 'The oranges became limes', b: [0, 0.566, 0.178, 0.158], p: [0, 0.484, 0.266, 0.322] },
      { l: 'A red ball by the dog', b: [0.41, 0.572, 0.061, 0.065], p: [0.378, 0.541, 0.125, 0.128] },
      { l: 'The flowers in the bike basket', b: [0.638, 0.582, 0.193, 0.13], p: [0.541, 0.516, 0.387, 0.262], g: 1 },
      { l: 'The cat turned black', b: [0.779, 0.497, 0.212, 0.115], p: [0.672, 0.441, 0.328, 0.228], g: 1 },
      { l: 'A potted plant by the bread', b: [0.332, 0.807, 0.146, 0.152], p: [0.256, 0.731, 0.297, 0.269] }
    ] },
    { id: 'family-kitchen', name: 'Family Kitchen', spots: [
      { l: 'A jar of sweets is gone', b: [0.272, 0.079, 0.102, 0.127], p: [0.222, 0.016, 0.203, 0.253] },
      { l: 'The curtain stripes turned green', b: [0.507, 0, 0.208, 0.334], p: [0.4, 0, 0.412, 0.5], g: 1 },
      { l: 'A teacup turned blue', b: [0.147, 0.197, 0.09, 0.093], p: [0.103, 0.15, 0.178, 0.188] },
      { l: 'The herb became a cactus', b: [0.588, 0.144, 0.152, 0.186], p: [0.512, 0.05, 0.3, 0.375], g: 1 },
      { l: 'The kettle turned yellow', b: [0.794, 0.347, 0.13, 0.105], p: [0.728, 0.294, 0.262, 0.212] },
      { l: 'The cat turned grey', b: [0.022, 0.563, 0.146, 0.215], p: [0, 0.456, 0.237, 0.369] },
      { l: 'The rolling pin is gone', b: [0.222, 0.594, 0.237, 0.108], p: [0.156, 0.537, 0.325, 0.222] },
      { l: 'An egg is missing', b: [0.469, 0.607, 0.105, 0.061], p: [0.441, 0.575, 0.188, 0.125] },
      { l: 'A cupcake lost its cherry', b: [0.557, 0.482, 0.071, 0.071], p: [0.519, 0.444, 0.147, 0.147] },
      { l: 'A banana on the apples', b: [0.051, 0.804, 0.118, 0.071], p: [0, 0.766, 0.228, 0.147] }
    ] },
    { id: 'beach-day', name: 'Beach Day', spots: [
      { l: 'The sail turned red', b: [0.097, 0.072, 0.168, 0.158], p: [0.013, 0, 0.337, 0.312] },
      { l: 'A seagull flew off', b: [0.338, 0.032, 0.093, 0.09], p: [0.291, 0, 0.188, 0.166] },
      { l: 'The balloon got spots', b: [0.569, 0, 0.136, 0.124], p: [0.5, 0, 0.275, 0.188] },
      { l: 'The flag on the sandcastle', b: [0.516, 0.332, 0.058, 0.055], p: [0.484, 0.303, 0.122, 0.113] },
      { l: 'A little boat by the rocks', b: [0.51, 0.204, 0.155, 0.074], p: [0.431, 0.166, 0.278, 0.15] },
      { l: 'The beach ball turned blue and yellow', b: [0.644, 0.407, 0.102, 0.099], p: [0.594, 0.356, 0.203, 0.2] },
      { l: 'An umbrella turned purple', b: [0.682, 0.269, 0.177, 0.093], p: [0.647, 0.222, 0.3, 0.188] },
      { l: 'The bucket turned green', b: [0.254, 0.679, 0.143, 0.13], p: [0.181, 0.613, 0.287, 0.262], g: 1 },
      { l: 'A sandal is missing', b: [0.247, 0.785, 0.133, 0.108], p: [0.178, 0.728, 0.272, 0.222], g: 1 },
      { l: 'The starfish in the rock pool', b: [0.691, 0.844, 0.268, 0.121], p: [0.556, 0.781, 0.444, 0.219] }
    ] },
    { id: 'farm-yard', name: 'Farm Yard', spots: [
      { l: 'The rooster weathervane', b: [0.166, 0, 0.121, 0.081], p: [0.103, 0, 0.247, 0.122] },
      { l: 'A windmill sail is missing', b: [0.726, 0.094, 0.083, 0.077], p: [0.681, 0.056, 0.172, 0.153] },
      { l: 'The barn doors turned blue', b: [0.144, 0.21, 0.249, 0.221], p: [0.019, 0.097, 0.491, 0.447] },
      { l: "The farmer's bucket", b: [0.563, 0.279, 0.062, 0.058], p: [0.531, 0.247, 0.125, 0.122] },
      { l: 'The tractor turned green', b: [0.775, 0.21, 0.149, 0.102], p: [0.7, 0.159, 0.3, 0.203] },
      { l: 'A black patch on the pig', b: [0.866, 0.347, 0.074, 0.071], p: [0.828, 0.309, 0.15, 0.147] },
      { l: 'A pumpkin became a watermelon', b: [0.244, 0.638, 0.115, 0.083], p: [0.188, 0.594, 0.228, 0.172] },
      { l: 'A chicken is gone', b: [0.491, 0.479, 0.077, 0.083], p: [0.453, 0.434, 0.153, 0.172] },
      { l: 'The basket of eggs', b: [0.851, 0.572, 0.149, 0.133], p: [0.775, 0.503, 0.225, 0.272] },
      { l: 'A new duckling', b: [0.894, 0.788, 0.087, 0.09], p: [0.85, 0.744, 0.15, 0.178] }
    ] },
    { id: 'toy-shop', name: 'Toy Shop', spots: [
      { l: 'A teddy bear turned pink', b: [0.097, 0.029, 0.143, 0.158], p: [0.025, 0, 0.287, 0.269] },
      { l: 'A model aeroplane is gone', b: [0.694, 0.007, 0.196, 0.146], p: [0.594, 0, 0.344, 0.2] },
      { l: 'The lollipop jar is empty', b: [0.31, 0.36, 0.137, 0.137], p: [0.241, 0.306, 0.275, 0.259] },
      { l: 'A train carriage is gone', b: [0.347, 0.219, 0.161, 0.108], p: [0.266, 0.163, 0.325, 0.209] },
      { l: 'The spinning top turned purple', b: [0.635, 0.372, 0.115, 0.124], p: [0.578, 0.309, 0.228, 0.25] },
      { l: 'A balloon turned green', b: [0.885, 0.172, 0.115, 0.133], p: [0.828, 0.103, 0.172, 0.272] },
      { l: 'The saddle turned blue', b: [0.063, 0.597, 0.218, 0.168], p: [0, 0.512, 0.391, 0.338] },
      { l: 'The toy robot is gone', b: [0.822, 0.685, 0.178, 0.283], p: [0.734, 0.675, 0.266, 0.325] },
      { l: "A cat in the dolls' house", b: [0.885, 0.563, 0.102, 0.124], p: [0.834, 0.5, 0.166, 0.197] },
      { l: 'A toy duck by the drum', b: [0.472, 0.847, 0.096, 0.108], p: [0.422, 0.791, 0.197, 0.209] }
    ] },
    { id: 'city-park', name: 'City Park', spots: [
      { l: 'A bird in the nest', b: [0.085, 0.054, 0.08, 0.058], p: [0.044, 0.022, 0.162, 0.122] },
      { l: 'The kite in the tree', b: [0.26, 0, 0.149, 0.215], p: [0.184, 0, 0.275, 0.272] },
      { l: 'The slide turned orange', b: [0.219, 0.266, 0.212, 0.183], p: [0.113, 0.203, 0.344, 0.281] },
      { l: 'An empty swing', b: [0.444, 0.235, 0.102, 0.115], p: [0.397, 0.178, 0.2, 0.219] },
      { l: 'A bucket in the sandpit', b: [0.769, 0.41, 0.105, 0.052], p: [0.716, 0.384, 0.213, 0.103], g: 1 },
      { l: 'The cart umbrella turned yellow', b: [0.819, 0.16, 0.181, 0.083], p: [0.728, 0.116, 0.272, 0.172] },
      { l: 'The bicycle is gone', b: [0.032, 0.463, 0.233, 0.183], p: [0, 0.409, 0.322, 0.331] },
      { l: 'Fewer pigeons', b: [0.204, 0.685, 0.265, 0.149], p: [0.134, 0.616, 0.466, 0.294] },
      { l: 'The bridge turned brown', b: [0.669, 0.41, 0.331, 0.186], p: [0.525, 0.316, 0.475, 0.375], g: 1 },
      { l: "The dog's red ball", b: [0.75, 0.854, 0.071, 0.074], p: [0.713, 0.816, 0.147, 0.15] }
    ] },
    { id: 'coral-reef', name: 'Coral Reef', spots: [
      { l: "The turtle's shell turned blue", b: [0.072, 0.032, 0.246, 0.13], p: [0, 0, 0.444, 0.228] },
      { l: 'A silver fish turned gold', b: [0.694, 0.025, 0.096, 0.065], p: [0.644, 0, 0.172, 0.122] },
      { l: 'The jellyfish is gone', b: [0.794, 0.025, 0.206, 0.258], p: [0.775, 0, 0.225, 0.338] },
      { l: 'The clownfish is gone', b: [0.182, 0.366, 0.168, 0.13], p: [0.131, 0.3, 0.225, 0.25] },
      { l: 'A pink coral turned blue', b: [0.338, 0.285, 0.208, 0.146], p: [0.331, 0.209, 0.294, 0.297] },
      { l: 'The octopus turned purple', b: [0.607, 0.319, 0.39, 0.255], p: [0.528, 0.266, 0.472, 0.431] },
      { l: 'The anchor is gone', b: [0.01, 0.491, 0.396, 0.433], p: [0, 0.478, 0.594, 0.522], g: 1 },
      { l: 'The treasure chest is shut', b: [0.119, 0.588, 0.349, 0.324], p: [0, 0.478, 0.594, 0.522], g: 1 },
      { l: 'The crab is gone', b: [0.582, 0.679, 0.299, 0.171], p: [0.456, 0.591, 0.544, 0.347], g: 2 },
      { l: 'A new starfish', b: [0.65, 0.804, 0.133, 0.083], p: [0.581, 0.759, 0.272, 0.172], g: 2 }
    ] },
    { id: 'snowy-village', name: 'Snowy Village', spots: [
      { l: 'A window is lit up', b: [0.175, 0.235, 0.052, 0.052], p: [0.15, 0.209, 0.103, 0.103] },
      { l: 'Smoke from a chimney', b: [0.254, 0.129, 0.08, 0.083], p: [0.212, 0.084, 0.163, 0.172] },
      { l: 'The star on the tree', b: [0.519, 0.141, 0.083, 0.083], p: [0.475, 0.097, 0.172, 0.172] },
      { l: 'A sledge turned blue', b: [0.744, 0.207, 0.071, 0.058], p: [0.706, 0.175, 0.147, 0.122] },
      { l: 'A mug turned blue', b: [0.132, 0.722, 0.068, 0.068], p: [0.097, 0.716, 0.119, 0.109] },
      { l: 'The stall lantern', b: [0.169, 0.576, 0.127, 0.161], p: [0.106, 0.494, 0.253, 0.25] },
      { l: "The snowman's scarf turned green", b: [0.454, 0.516, 0.105, 0.105], p: [0.4, 0.463, 0.213, 0.213], g: 1 },
      { l: "The snowman's carrot nose", b: [0.491, 0.494, 0.071, 0.046], p: [0.453, 0.469, 0.147, 0.097], g: 1 },
      { l: "The dog's coat turned red", b: [0.547, 0.791, 0.118, 0.09], p: [0.487, 0.747, 0.237, 0.178] },
      { l: 'A new present', b: [0.819, 0.885, 0.133, 0.108], p: [0.75, 0.828, 0.25, 0.172] }
    ] },
    { id: 'birthday-party', name: 'Birthday Party', spots: [
      { l: 'A balloon turned purple', b: [0.01, 0.057, 0.115, 0.137], p: [0, 0, 0.181, 0.263] },
      { l: 'The birdhouse is gone', b: [0.172, 0.072, 0.121, 0.158], p: [0.109, 0, 0.247, 0.312] },
      { l: 'The bouncy castle roof turned blue', b: [0.691, 0.094, 0.293, 0.14], p: [0.544, 0.025, 0.456, 0.278] },
      { l: 'A candle is missing', b: [0.469, 0.319, 0.093, 0.087], p: [0.422, 0.275, 0.162, 0.169] },
      { l: 'The jug of juice', b: [0.563, 0.354, 0.121, 0.18], p: [0.55, 0.263, 0.197, 0.362] },
      { l: 'A purple present is gone', b: [0, 0.675, 0.087, 0.137], p: [0, 0.606, 0.131, 0.275], g: 1 },
      { l: 'A yellow present is gone', b: [0, 0.691, 0.231, 0.221], p: [0, 0.578, 0.266, 0.422], g: 1 },
      { l: "The puppy's bow turned blue", b: [0.244, 0.763, 0.108, 0.09], p: [0.216, 0.719, 0.194, 0.178] },
      { l: 'A cupcake on a plate', b: [0.479, 0.488, 0.071, 0.077], p: [0.441, 0.45, 0.147, 0.153] },
      { l: "The gnome's hat turned green", b: [0.882, 0.601, 0.118, 0.124], p: [0.822, 0.537, 0.178, 0.25] }
    ] },
    { id: 'lakeside-camp', name: 'Lakeside Camp', spots: [
      { l: 'The eagle is gone', b: [0.247, 0, 0.146, 0.109], p: [0.172, 0, 0.297, 0.166] },
      { l: 'A pine tree turned orange', b: [0.538, 0.019, 0.143, 0.236], p: [0.466, 0, 0.288, 0.322] },
      { l: 'The tent turned blue', b: [0.001, 0.238, 0.321, 0.215], p: [0, 0.131, 0.453, 0.4] },
      { l: 'The pot over the fire', b: [0.435, 0.3, 0.099, 0.124], p: [0.384, 0.237, 0.2, 0.25] },
      { l: 'A chair turned purple', b: [0.613, 0.354, 0.112, 0.102], p: [0.556, 0.303, 0.225, 0.203] },
      { l: 'The deer is gone', b: [0.822, 0.135, 0.121, 0.133], p: [0.759, 0.066, 0.241, 0.272] },
      { l: 'The canoe turned yellow', b: [0, 0.554, 0.415, 0.283], p: [0, 0.434, 0.622, 0.547], g: 1 },
      { l: 'The fishing rod is gone', b: [0.285, 0.519, 0.096, 0.171], p: [0.234, 0.431, 0.197, 0.347], g: 1 },
      { l: 'A duck on the lake', b: [0.791, 0.632, 0.115, 0.068], p: [0.734, 0.597, 0.228, 0.137] },
      { l: 'The frog on the lily pad', b: [0.772, 0.819, 0.127, 0.124], p: [0.709, 0.756, 0.253, 0.244] }
    ] },
    { id: 'train-station', name: 'Train Station', spots: [
      { l: 'Pigeons left the beam', b: [0.197, 0.025, 0.177, 0.112], p: [0.109, 0, 0.353, 0.194] },
      { l: 'The signal turned green', b: [0.929, 0.107, 0.068, 0.071], p: [0.894, 0.069, 0.106, 0.147] },
      { l: 'The red flowers turned yellow', b: [0.113, 0.407, 0.133, 0.09], p: [0.044, 0.362, 0.272, 0.178] },
      { l: 'A red balloon', b: [0.491, 0.36, 0.061, 0.105], p: [0.459, 0.306, 0.113, 0.178] },
      { l: 'A suitcase is gone', b: [0.544, 0.425, 0.174, 0.108], p: [0.534, 0.369, 0.272, 0.219] },
      { l: 'The train turned blue', b: [0.613, 0.21, 0.212, 0.143], p: [0.531, 0.138, 0.4, 0.287] },
      { l: 'The umbrella is gone', b: [0.063, 0.657, 0.127, 0.308], p: [0, 0.5, 0.253, 0.5] },
      { l: 'The hat box turned blue', b: [0.266, 0.666, 0.137, 0.121], p: [0.197, 0.603, 0.275, 0.247] },
      { l: 'The palm became sunflowers', b: [0.507, 0.569, 0.296, 0.28], p: [0.384, 0.512, 0.569, 0.478], g: 1 },
      { l: 'The cat on the suitcase', b: [0.704, 0.726, 0.124, 0.133], p: [0.641, 0.656, 0.25, 0.272], g: 1 }
    ] },
    { id: 'art-class', name: 'Art Class', spots: [
      { l: 'The sun became a moon', b: [0.082, 0.082, 0.09, 0.087], p: [0.037, 0.05, 0.163, 0.162] },
      { l: 'A paper lantern is gone', b: [0.175, 0, 0.112, 0.124], p: [0.15, 0, 0.194, 0.188] },
      { l: 'A flower on the windowsill', b: [0.757, 0.197, 0.061, 0.058], p: [0.725, 0.166, 0.125, 0.122] },
      { l: 'The goldfish is gone', b: [0.851, 0.213, 0.111, 0.09], p: [0.803, 0.169, 0.197, 0.178] },
      { l: 'The apron turned green', b: [0.141, 0.55, 0.152, 0.402], p: [0.066, 0.35, 0.303, 0.65] },
      { l: 'The scissors are gone', b: [0.36, 0.547, 0.115, 0.071], p: [0.303, 0.509, 0.216, 0.147] },
      { l: 'The clay snail is gone', b: [0.5, 0.482, 0.124, 0.105], p: [0.463, 0.428, 0.225, 0.213], g: 1 },
      { l: 'A paint pot turned red', b: [0.61, 0.479, 0.077, 0.083], p: [0.572, 0.434, 0.153, 0.172], g: 1 },
      { l: 'A paint splash on the floor', b: [0.75, 0.929, 0.152, 0.061], p: [0.675, 0.897, 0.303, 0.103], g: 2 },
      { l: 'The bucket is gone', b: [0.741, 0.779, 0.174, 0.174], p: [0.653, 0.691, 0.347, 0.309], g: 2 }
    ] },
    { id: 'safari-waterhole', name: 'Safari Waterhole', spots: [
      { l: 'A weaver nest is gone', b: [0.416, 0.107, 0.115, 0.108], p: [0.359, 0.05, 0.228, 0.222] },
      { l: 'The leopard is gone', b: [0.041, 0.032, 0.333, 0.296], p: [0, 0, 0.428, 0.478] },
      { l: 'A white egret', b: [0.579, 0.429, 0.08, 0.09], p: [0.537, 0.384, 0.162, 0.169], g: 1 },
      { l: 'A zebra is gone', b: [0.554, 0.326, 0.174, 0.193], p: [0.487, 0.228, 0.319, 0.322], g: 1 },
      { l: 'The jeep turned white', b: [0.788, 0.257, 0.121, 0.071], p: [0.725, 0.219, 0.247, 0.147] },
      { l: 'A meerkat is gone', b: [0.113, 0.582, 0.137, 0.168], p: [0.044, 0.497, 0.275, 0.337] },
      { l: 'The hippo is gone', b: [0.31, 0.532, 0.346, 0.152], p: [0.231, 0.503, 0.6, 0.256] },
      { l: 'The crocodile is gone', b: [0.601, 0.754, 0.399, 0.146], p: [0.4, 0.719, 0.6, 0.256] },
      { l: 'A flamingo turned white', b: [0.822, 0.557, 0.13, 0.177], p: [0.756, 0.469, 0.244, 0.3] },
      { l: 'A blue bird on a rock', b: [0.219, 0.822, 0.13, 0.124], p: [0.153, 0.759, 0.263, 0.241] }
    ] }
  ]
};
