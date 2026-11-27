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
};
