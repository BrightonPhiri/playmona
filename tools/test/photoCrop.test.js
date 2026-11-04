'use strict';
/* The sums behind the photo crop step (js/photoCrop.js). */
const { loadFF, test, assert, assertEqual } = require('./harness');

function M() { return loadFF(['js/core.js', 'js/photoCrop.js']).PhotoCrop.math; }
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6, (msg || '') + ' ' + a + ' vs ' + b);

test('photo crop: at zoom 1 with no move, the crop is the middle square', function () {
  const m = M();
  const r = m.rect(m.clamp({ w: 1200, h: 800, d: 300, zoom: 1, x: 0, y: 0 }));
  near(r.size, 800); near(r.sx, 200); near(r.sy, 0);
  const c = m.centre(1200, 800);
  near(c.sx, r.sx); near(c.size, r.size);
});

test('photo crop: the photo can never leave a gap in the circle', function () {
  const m = M();
  const v = m.clamp({ w: 1200, h: 800, d: 300, zoom: 1, x: 9999, y: -9999 });
  assertEqual(v.y, 0, 'the short side fills the circle, so no up/down room');
  const r = m.rect(v);
  near(r.sx, 0, 'dragged right shows the left edge');
  const z = m.clamp({ w: 1200, h: 800, d: 300, zoom: 99, x: 0, y: 0 });
  assertEqual(z.zoom, m.MAX_ZOOM);
  assertEqual(m.clamp({ w: 10, h: 10, d: 300, zoom: 0.2, x: 0, y: 0 }).zoom, 1);
});

test('photo crop: zooming shrinks the square and keeps the point under the finger', function () {
  const m = M();
  const v = m.clamp({ w: 1000, h: 1000, d: 200, zoom: 1, x: 0, y: 0 });
  const z = m.zoomAt(v, 2, 50, 50);
  near(m.rect(z).size, 500);
  // The photo point under (50, 50) before and after is the same.
  const before = 500 + 50 / m.scale(v), after = 500 + (50 - z.x) / m.scale(z);
  near(before, after);
});

test('photo crop: moving the photo left frames more of its right side', function () {
  const m = M();
  const v = m.clamp({ w: 1000, h: 1000, d: 200, zoom: 2, x: -40, y: 0 });
  const r = m.rect(v);
  near(r.size, 500);
  near(r.sx, 250 + 40 / m.scale(v));
  assert(r.sx + r.size <= 1000);
});
