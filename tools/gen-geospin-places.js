#!/usr/bin/env node
'use strict';
/* GeoSpin: matches every game country (js/data/worldFlags.js) to its shapes in
   assets/geospin/countries-50m.json (Natural Earth via world-atlas, public domain)
   and writes js/geospin/places.js:

     code: [shapes, lat, lon, span, neighbours]
       shapes      indexes into the topology's geometries (Somalia also takes Somaliland,
                   Cyprus the north, so the whole internationally recognised country lights up)
       lat, lon    where the globe stops: the middle of the country's biggest piece
       span        degrees from that point to the far edge of the biggest piece (how far to zoom)
       neighbours  codes of countries sharing a border

   Countries too small for this map (Tuvalu) get a point and no shapes; the game shows a
   locator ring there. Run: node tools/gen-geospin-places.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/geospin/countries-50m.json'), 'utf8'));
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/worldFlags.js'), 'utf8'), sandbox);
const countries = sandbox.FF.data.worldFlags.countries;

// Natural Earth's short names that differ from the game's names.
const RENAME = {
  'United States of America': 'us', 'eSwatini': 'sz', 'S. Sudan': 'ss', 'Solomon Is.': 'sb',
  'São Tomé and Principe': 'st', 'St. Vin. and Gren.': 'vc', 'St. Kitts and Nevis': 'kn',
  'Macedonia': 'mk', 'Marshall Is.': 'mh', 'Eq. Guinea': 'gq', 'Dominican Rep.': 'do',
  'Dem. Rep. Congo': 'cd', 'Congo': 'cg', "Côte d'Ivoire": 'ci', 'Central African Rep.': 'cf',
  'Bosnia and Herz.': 'ba', 'Antigua and Barb.': 'ag', 'Vatican': 'va', 'Micronesia': 'fm'
};
// Parts drawn separately that belong to a recognised country.
const JOIN = { 'Somaliland': 'so', 'N. Cyprus': 'cy' };
// Too small for the 1:50m map: [lat, lon].
const POINTS = { tv: [-8.52, 179.2] };

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const byName = {};
countries.forEach((c) => { byName[norm(c.name)] = c.code; });

const geoms = topo.objects.countries.geometries;
const shapes = {};
geoms.forEach((g, i) => {
  const name = g.properties.name;
  const code = RENAME[name] || JOIN[name] || byName[norm(name)];
  if (!code) return;
  (shapes[code] = shapes[code] || []).push(i);
});

/* Decode the arcs (delta-encoded, quantised) into [lon, lat] points. */
const tf = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map((p) => { x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; });
});
function ring(ids) {
  const pts = [];
  ids.forEach((id) => {
    const a = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
    a.forEach((p, k) => { if (k > 0 || !pts.length) pts.push(p); });
  });
  return pts;
}
function polygons(g) {
  if (g.type === 'Polygon') return [g.arcs.map(ring)];
  if (g.type === 'MultiPolygon') return g.arcs.map((poly) => poly.map(ring));
  return [];
}

const rad = Math.PI / 180;
function vec(p) { const lo = p[0] * rad, la = p[1] * rad; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }
function angle(a, b) { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / rad; }
/* Area on the sphere of a ring, roughly (planar, longitude unwrapped, scaled by cos lat). */
function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    let dq = q[0] - p[0];
    if (dq > 180) dq -= 360; else if (dq < -180) dq += 360;
    s += dq * Math.cos(((p[1] + q[1]) / 2) * rad) * ((p[1] + q[1]) / 2 + 90);
  }
  return Math.abs(s);
}
/* The middle of a ring: its edge points weighted by edge length, as unit vectors. */
function middle(pts) {
  const sum = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = vec(pts[i]), b = vec(pts[(i + 1) % pts.length]);
    const w = angle(a, b) || 1e-6;
    for (let k = 0; k < 3; k++) sum[k] += (a[k] + b[k]) * w;
  }
  const len = Math.hypot(sum[0], sum[1], sum[2]) || 1;
  const v = sum.map((x) => x / len);
  return [Math.asin(v[2]) / rad, Math.atan2(v[1], v[0]) / rad, v];
}

// Neighbours: countries whose shapes use the same arc.
const arcOwners = {};
Object.keys(shapes).forEach((code) => shapes[code].forEach((i) => {
  const g = geoms[i];
  const all = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  all.forEach((poly) => poly.forEach((r) => r.forEach((id) => {
    const a = id < 0 ? ~id : id;
    (arcOwners[a] = arcOwners[a] || new Set()).add(code);
  })));
}));
const neighbours = {};
Object.values(arcOwners).forEach((set) => {
  if (set.size < 2) return;
  set.forEach((a) => set.forEach((b) => { if (a !== b) (neighbours[a] = neighbours[a] || new Set()).add(b); }));
});

const out = {};
const missing = [];
countries.forEach((c) => {
  if (POINTS[c.code]) { out[c.code] = [[], POINTS[c.code][0], POINTS[c.code][1], 0.3, []]; return; }
  const ids = shapes[c.code];
  if (!ids) { missing.push(c.code + ' ' + c.name); return; }
  let best = null;
  ids.forEach((i) => polygons(geoms[i]).forEach((poly) => {
    const a = area(poly[0]);
    if (!best || a > best.a) best = { a, ring: poly[0] };
  }));
  const m = middle(best.ring);
  let span = 0;
  best.ring.forEach((p) => { span = Math.max(span, angle(m[2], vec(p))); });
  out[c.code] = [ids, +m[0].toFixed(2), +m[1].toFixed(2), +span.toFixed(2), Array.from(neighbours[c.code] || []).sort()];
});
if (missing.length) { console.error('No shapes for: ' + missing.join(', ')); process.exit(1); }

const lines = Object.keys(out).sort().map((code) => '    ' + code + ': ' + JSON.stringify(out[code]));
const file = `/* ============================================================
   PLAYMONA — geospin/places.js   (made by tools/gen-geospin-places.js; do not edit)
   Where each GeoSpin country is on assets/geospin/countries-50m.json:
     code: [shapes, lat, lon, span, neighbours]
   shapes index the topology's geometries; lat/lon is where the globe
   stops; span is how many degrees the biggest piece reaches from there;
   neighbours share a border. No shapes: too small for the map, a locator ring shows.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};
  FF.data.geoSpinPlaces = {
${lines.join(',\n')}
  };
})();
`;
fs.mkdirSync(path.join(ROOT, 'js/geospin'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'js/geospin/places.js'), file);
console.log('Wrote js/geospin/places.js: ' + Object.keys(out).length + ' countries.');
