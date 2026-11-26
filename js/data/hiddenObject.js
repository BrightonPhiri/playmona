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
      id: "attic",
      name: "Cluttered Attic",
      objects: [
        { n: "teapot", b: [0.172, 0.125, 0.07, 0.06] },
        { n: "golden key", b: [0.793, 0.103, 0.065, 0.04] },
        { n: "violin", b: [0.168, 0.345, 0.06, 0.16] },
        { n: "rubber duck", b: [0.55, 0.175, 0.045, 0.05] },
        { n: "toy sailboat", b: [0.776, 0.44, 0.046, 0.06] },
        { n: "umbrella", b: [0.822, 0.288, 0.058, 0.245] },
        { n: "banana", b: [0.095, 0.68, 0.068, 0.08] },
        { n: "red mitten", b: [0.292, 0.572, 0.07, 0.085] },
        { n: "crown", b: [0.472, 0.725, 0.09, 0.065] },
        { n: "sea shell", b: [0.498, 0.672, 0.054, 0.04] },
        { n: "horseshoe", b: [0.415, 0.893, 0.085, 0.065] },
        { n: "roller skate", b: [0.833, 0.852, 0.093, 0.093] }
      ]
    },
    {
      id: "wizard-library",
      name: "Wizard Library",
      objects: [
        { n: "carrot", b: [0.222, 0.112, 0.07, 0.035] },
        { n: "bell", b: [0.226, 0.322, 0.04, 0.065] },
        { n: "lemon", b: [0.452, 0.385, 0.046, 0.035] },
        { n: "tennis racket", b: [0.838, 0.04, 0.045, 0.09] },
        { n: "toy car", b: [0.903, 0.083, 0.058, 0.035] },
        { n: "frog", b: [0.212, 0.553, 0.06, 0.055] },
        { n: "glasses", b: [0.568, 0.512, 0.08, 0.035] },
        { n: "ice cream cone", b: [0.562, 0.432, 0.036, 0.07] },
        { n: "sock", b: [0.838, 0.362, 0.05, 0.085] },
        { n: "toothbrush", b: [0.308, 0.788, 0.04, 0.065] },
        { n: "hammer", b: [0.367, 0.657, 0.08, 0.035] },
        { n: "paintbrush", b: [0.703, 0.842, 0.104, 0.036] }
      ]
    },
    {
      id: "pirate-ship",
      name: "Pirate Ship",
      objects: [
        { n: "teddy bear", b: [0.105, 0.05, 0.07, 0.095] },
        { n: "paper aeroplane", b: [0.268, 0.118, 0.062, 0.04] },
        { n: "trumpet", b: [0.555, 0.12, 0.055, 0.135] },
        { n: "guitar", b: [0.918, 0.21, 0.04, 0.078] },
        { n: "butterfly", b: [0.912, 0.082, 0.035, 0.035] },
        { n: "cupcake", b: [0.198, 0.325, 0.045, 0.06] },
        { n: "pencil", b: [0.443, 0.555, 0.075, 0.035] },
        { n: "spoon", b: [0.402, 0.398, 0.025, 0.078] },
        { n: "light bulb", b: [0.735, 0.452, 0.045, 0.06] },
        { n: "slipper", b: [0.252, 0.838, 0.075, 0.055] },
        { n: "snail", b: [0.543, 0.758, 0.06, 0.045] },
        { n: "mushroom", b: [0.93, 0.503, 0.04, 0.03] }
      ]
    },
    {
      id: "greenhouse",
      name: "Greenhouse",
      objects: [
        { n: "sunglasses", b: [0.05, 0.06, 0.09, 0.035] },
        { n: "paper boat", b: [0.178, 0.033, 0.055, 0.035] },
        { n: "crayon", b: [0.57, 0.102, 0.024, 0.05] },
        { n: "bow tie", b: [0.838, 0.105, 0.045, 0.035] },
        { n: "whistle", b: [0.93, 0.25, 0.03, 0.045] },
        { n: "pear", b: [0.162, 0.36, 0.036, 0.05] },
        { n: "kettle", b: [0.613, 0.4, 0.085, 0.09] },
        { n: "comb", b: [0.418, 0.478, 0.08, 0.04] },
        { n: "toy dinosaur", b: [0.778, 0.338, 0.065, 0.05] },
        { n: "doughnut", b: [0.052, 0.822, 0.08, 0.06] },
        { n: "lollipop", b: [0.537, 0.818, 0.04, 0.065] },
        { n: "football", b: [0.74, 0.838, 0.056, 0.05] }
      ]
    },
    {
      id: "inventor-workshop",
      name: "Inventor's Workshop",
      objects: [
        { n: "feather", b: [0.092, 0.165, 0.038, 0.065] },
        { n: "cherries", b: [0.02, 0.385, 0.035, 0.035] },
        { n: "kite", b: [0.582, 0.04, 0.068, 0.075] },
        { n: "strawberry", b: [0.872, 0.162, 0.038, 0.038] },
        { n: "ballet shoe", b: [0.823, 0.282, 0.115, 0.058] },
        { n: "pineapple", b: [0.032, 0.428, 0.046, 0.065] },
        { n: "sandwich", b: [0.392, 0.512, 0.075, 0.042] },
        { n: "cactus", b: [0.468, 0.432, 0.045, 0.09] },
        { n: "flip-flop", b: [0.832, 0.545, 0.04, 0.115] },
        { n: "hedgehog", b: [0.062, 0.83, 0.09, 0.065] },
        { n: "toothbrush", b: [0.428, 0.663, 0.095, 0.028] },
        { n: "slice of cake", b: [0.727, 0.59, 0.052, 0.05] }
      ]
    },
    {
      id: "bakery",
      name: "Bakery",
      objects: [
        { n: "toy train", b: [0.152, 0.062, 0.1, 0.06] },
        { n: "oven glove", b: [0.128, 0.122, 0.056, 0.062] },
        { n: "kite", b: [0.615, 0.105, 0.078, 0.13] },
        { n: "torch", b: [0.962, 0.372, 0.034, 0.08] },
        { n: "toy sailboat", b: [0.866, 0.212, 0.048, 0.05] },
        { n: "snail", b: [0.188, 0.418, 0.05, 0.032] },
        { n: "hairbrush", b: [0.548, 0.552, 0.095, 0.045] },
        { n: "keys", b: [0.508, 0.367, 0.045, 0.05] },
        { n: "toy frog", b: [0.848, 0.552, 0.04, 0.045] },
        { n: "sock", b: [0.058, 0.706, 0.07, 0.078] },
        { n: "toy bucket", b: [0.522, 0.882, 0.056, 0.085] },
        { n: "headphones", b: [0.862, 0.756, 0.115, 0.072] }
      ]
    },
    {
      id: "moon-base",
      name: "Moon Base",
      objects: [
        { n: "broom", b: [0.022, 0.058, 0.06, 0.075] },
        { n: "apple", b: [0.318, 0.078, 0.045, 0.052] },
        { n: "scarf", b: [0.555, 0.052, 0.08, 0.16] },
        { n: "fishing rod", b: [0.787, 0.062, 0.075, 0.15] },
        { n: "cowboy hat", b: [0.882, 0.137, 0.065, 0.042] },
        { n: "sunflower", b: [0.2, 0.285, 0.065, 0.1] },
        { n: "hot dog", b: [0.597, 0.502, 0.06, 0.032] },
        { n: "rubber boot", b: [0.502, 0.502, 0.042, 0.06] },
        { n: "birdcage", b: [0.842, 0.357, 0.052, 0.077] },
        { n: "watering can", b: [0.072, 0.592, 0.1, 0.07] },
        { n: "rolling pin", b: [0.462, 0.832, 0.11, 0.04] },
        { n: "bucket", b: [0.818, 0.627, 0.05, 0.046] }
      ]
    },
    {
      id: "castle-kitchen",
      name: "Castle Kitchen",
      objects: [
        { n: "headphones", b: [0.132, 0.062, 0.066, 0.095] },
        { n: "toy aeroplane", b: [0.218, 0.008, 0.095, 0.05] },
        { n: "camera", b: [0.567, 0.082, 0.06, 0.04] },
        { n: "toy dinosaur", b: [0.867, 0.137, 0.055, 0.042] },
        { n: "skateboard", b: [0.807, 0.227, 0.125, 0.05] },
        { n: "lollipop", b: [0.06, 0.352, 0.03, 0.045] },
        { n: "toy robot", b: [0.462, 0.472, 0.07, 0.105] },
        { n: "sunglasses", b: [0.682, 0.517, 0.08, 0.035] },
        { n: "bicycle helmet", b: [0.807, 0.332, 0.09, 0.06] },
        { n: "flip-flop", b: [0.247, 0.797, 0.07, 0.085] },
        { n: "tennis ball", b: [0.668, 0.842, 0.04, 0.04] },
        { n: "umbrella", b: [0.828, 0.612, 0.075, 0.22] }
      ]
    },
    {
      id: "fairy-forest",
      name: "Fairy Forest",
      objects: [
        { n: "teacup", b: [0.132, 0.057, 0.046, 0.032] },
        { n: "pencil", b: [0.198, 0.218, 0.06, 0.022] },
        { n: "trumpet", b: [0.402, 0.092, 0.092, 0.05] },
        { n: "sock", b: [0.888, 0.098, 0.05, 0.08] },
        { n: "spoon", b: [0.592, 0.262, 0.076, 0.022] },
        { n: "toy car", b: [0.202, 0.482, 0.07, 0.04] },
        { n: "light bulb", b: [0.388, 0.697, 0.055, 0.04] },
        { n: "glasses", b: [0.512, 0.332, 0.056, 0.025] },
        { n: "toothbrush", b: [0.868, 0.477, 0.04, 0.056] },
        { n: "key", b: [0.083, 0.637, 0.05, 0.056] },
        { n: "bell", b: [0.538, 0.817, 0.04, 0.055] },
        { n: "slipper", b: [0.807, 0.857, 0.08, 0.04] }
      ]
    },
    {
      id: "jungle-temple",
      name: "Jungle Temple",
      objects: [
        { n: "teapot", b: [0.102, 0.068, 0.066, 0.05] },
        { n: "wooden spoon", b: [0.228, 0.122, 0.025, 0.126] },
        { n: "crown", b: [0.487, 0.022, 0.056, 0.04] },
        { n: "umbrella", b: [0.728, 0.022, 0.075, 0.06] },
        { n: "book", b: [0.898, 0.157, 0.08, 0.04] },
        { n: "toy rocket", b: [0.022, 0.317, 0.05, 0.08] },
        { n: "bow tie", b: [0.682, 0.367, 0.05, 0.03] },
        { n: "sock", b: [0.727, 0.502, 0.042, 0.066] },
        { n: "rubber duck", b: [0.812, 0.307, 0.046, 0.04] },
        { n: "roller skate", b: [0.122, 0.662, 0.07, 0.07] },
        { n: "scissors", b: [0.28, 0.634, 0.044, 0.04] },
        { n: "red ball", b: [0.797, 0.852, 0.05, 0.045] }
      ]
    },
    {
      id: "kids-bedroom",
      name: "Kid's Bedroom",
      objects: [
        { n: "carrot", b: [0.045, 0.175, 0.052, 0.05] },
        { n: "garden trowel", b: [0.175, 0.16, 0.035, 0.062] },
        { n: "goldfish", b: [0.458, 0.158, 0.045, 0.035] },
        { n: "banana", b: [0.683, 0.097, 0.06, 0.03] },
        { n: "corn cob", b: [0.832, 0.077, 0.06, 0.036] },
        { n: "lemon", b: [0.098, 0.402, 0.045, 0.04] },
        { n: "mushroom", b: [0.261, 0.57, 0.033, 0.034] },
        { n: "toothbrush", b: [0.567, 0.642, 0.06, 0.025] },
        { n: "pineapple", b: [0.728, 0.312, 0.045, 0.075] },
        { n: "hammer", b: [0.098, 0.752, 0.095, 0.055] },
        { n: "sea shell", b: [0.297, 0.872, 0.045, 0.03] },
        { n: "watering can", b: [0.912, 0.732, 0.06, 0.055] }
      ]
    }
  ]
};
