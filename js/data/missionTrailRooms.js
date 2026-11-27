/* ============================================================
   PLAYMONA — data/missionTrailRooms.js
   Mission Trail's busy rooms: the picture a pick scene is searched in,
   and where each thing is hidden in it. A scene that names a room
   ({ room: 'kitchen' }) becomes a search of that picture once both the
   picture (assets/images/games/missionTrail/rooms/<id>.webp) and its
   entry here are in; until then it shows its plain backdrop and options
   (if it has them) or its stage waits.

   <room id>: { objects: [{ id: <objects picture id>, b: [x, y, w, h] }] }
   b is the thing's box in the picture, as shares (0..1) of its width and
   height. Written by tools/art/missiontrail-rooms.py from the spots
   tools/art/spot-diff-find.py finds (tools/art/missionTrail-spots/).
   ============================================================ */
window.FF = window.FF || {};
FF.data = FF.data || {};
FF.data.missionTrailRooms = {
  "bedroom": { "objects": [
    {"id": "book-blue", "b": [0.472, 0.085, 0.093, 0.065]},
    {"id": "watch", "b": [0.601, 0.06, 0.111, 0.124]},
    {"id": "red-cap", "b": [0.029, 0.291, 0.118, 0.099]},
    {"id": "teddy-bear", "b": [0.079, 0.394, 0.168, 0.143]},
    {"id": "blue-cap", "b": [0.254, 0.326, 0.115, 0.099]},
    {"id": "umbrella", "b": [0.61, 0.407, 0.087, 0.18]},
    {"id": "green-cap", "b": [0.732, 0.326, 0.118, 0.099]},
    {"id": "sunglasses", "b": [0.869, 0.135, 0.131, 0.087]},
    {"id": "pink-slippers", "b": [0.101, 0.872, 0.155, 0.118]},
    {"id": "toy-car", "b": [0.297, 0.81, 0.152, 0.124]},
    {"id": "book-red", "b": [0.529, 0.822, 0.155, 0.115]},
    {"id": "football", "b": [0.782, 0.813, 0.127, 0.121]}
  ] },
  "hallway": { "objects": [
    {"id": "watch", "b": [0.647, 0.088, 0.068, 0.083]},
    {"id": "torch", "b": [0.8, 0.075, 0.115, 0.09]},
    {"id": "blue-cap", "b": [0.051, 0.172, 0.127, 0.127]},
    {"id": "red-scarf", "b": [0.282, 0.188, 0.111, 0.193]},
    {"id": "newspaper", "b": [0.635, 0.388, 0.152, 0.102]},
    {"id": "umbrella", "b": [0.035, 0.435, 0.102, 0.233]},
    {"id": "keys", "b": [0.432, 0.479, 0.127, 0.099]},
    {"id": "phone", "b": [0.916, 0.46, 0.084, 0.083]},
    {"id": "medical-bag", "b": [0.035, 0.757, 0.186, 0.171]},
    {"id": "water-bottle", "b": [0.279, 0.766, 0.102, 0.158]},
    {"id": "wallet", "b": [0.529, 0.797, 0.165, 0.13]},
    {"id": "book-red", "b": [0.735, 0.797, 0.165, 0.13]}
  ] },
  "kitchen": { "objects": [
    {"id": "reading-glasses", "b": [0.579, 0.104, 0.118, 0.077]},
    {"id": "book-blue", "b": [0.75, 0.035, 0.118, 0.09]},
    {"id": "keys", "b": [0.029, 0.341, 0.143, 0.14]},
    {"id": "yellow-mug", "b": [0.182, 0.21, 0.093, 0.083]},
    {"id": "watch", "b": [0.188, 0.122, 0.083, 0.112]},
    {"id": "phone", "b": [0.607, 0.341, 0.105, 0.087]},
    {"id": "water-bottle", "b": [0.919, 0.291, 0.081, 0.13]},
    {"id": "umbrella", "b": [0.085, 0.701, 0.115, 0.246]},
    {"id": "newspaper", "b": [0.238, 0.66, 0.165, 0.099]},
    {"id": "green-apple", "b": [0.391, 0.563, 0.096, 0.09]},
    {"id": "lunchbox", "b": [0.519, 0.722, 0.14, 0.127]},
    {"id": "wallet", "b": [0.769, 0.879, 0.14, 0.112]}
  ] },
  "library": { "objects": [
    {"id": "torch", "b": [0.172, 0.057, 0.102, 0.108]},
    {"id": "sunglasses", "b": [0.251, 0.057, 0.127, 0.105]},
    {"id": "red-scarf", "b": [0.544, 0.057, 0.152, 0.124]},
    {"id": "watch", "b": [0.888, 0.082, 0.077, 0.096]},
    {"id": "book-blue", "b": [0.035, 0.451, 0.118, 0.074]},
    {"id": "yellow-mug", "b": [0.347, 0.407, 0.077, 0.077]},
    {"id": "reading-glasses", "b": [0.675, 0.41, 0.105, 0.068]},
    {"id": "newspaper", "b": [0.788, 0.397, 0.152, 0.087]},
    {"id": "umbrella", "b": [0.294, 0.685, 0.105, 0.218]},
    {"id": "book-red", "b": [0.454, 0.638, 0.127, 0.087]},
    {"id": "phone", "b": [0.822, 0.669, 0.108, 0.118]},
    {"id": "keys", "b": [0.088, 0.888, 0.149, 0.112]}
  ] },
  "living-room": { "objects": [
    {"id": "watch", "b": [0.413, 0.038, 0.177, 0.108]},
    {"id": "yellow-mug", "b": [0.744, 0.035, 0.105, 0.086]},
    {"id": "teddy-bear", "b": [0.144, 0.41, 0.14, 0.152]},
    {"id": "book-blue", "b": [0.16, 0.294, 0.137, 0.099]},
    {"id": "reading-glasses", "b": [0.566, 0.31, 0.09, 0.052]},
    {"id": "phone", "b": [0.794, 0.391, 0.143, 0.105]},
    {"id": "newspaper", "b": [0.244, 0.625, 0.174, 0.115]},
    {"id": "keys", "b": [0.544, 0.622, 0.171, 0.118]},
    {"id": "umbrella", "b": [0.735, 0.71, 0.165, 0.218]},
    {"id": "pink-slippers", "b": [0.147, 0.826, 0.158, 0.136]},
    {"id": "wallet", "b": [0.297, 0.847, 0.143, 0.115]},
    {"id": "football", "b": [0.557, 0.829, 0.133, 0.13]}
  ] }
};
