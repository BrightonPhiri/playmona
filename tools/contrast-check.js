/* Family Fun — WCAG contrast check for css/tokens.css.
   Reads the light and dark theme tokens and every accent, then checks the
   pairs the UI actually uses. Text needs 4.5:1 (AA); large display text
   and UI shapes need 3:1.
   Run:  node tools/contrast-check.js     (exit code 1 on any failure)
*/
'use strict';
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Collect "--name: #hex" declarations from every rule whose selector matches.
function block(selectorTest) {
  const out = {};
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (!selectorTest(m[1].trim())) continue;
    const decl = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g;
    let d;
    while ((d = decl.exec(m[2]))) out[d[1]] = d[2];
  }
  return out;
}

function lum(hex) {
  const c = [1, 3, 5].map(function (i) { return parseInt(hex.substr(i, 2), 16) / 255; })
    .map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const light = block(function (s) { return /^:root,\s*:root\[data-theme="light"\]$/.test(s); });
const dark = block(function (s) { return s === ':root[data-theme="dark"]'; });
const accents = ['purple', 'blue', 'green', 'orange', 'red', 'pink', 'gold'];

let failures = 0;
function check(label, fg, bg, min) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  console.log((ok ? 'pass ' : 'FAIL ') + r.toFixed(2).padStart(5) + ' (min ' + min + ')  ' + label);
}

[['light', light], ['dark', dark]].forEach(function (pair) {
  const name = pair[0], t = pair[1];
  console.log('\n== ' + name + ' theme ==');
  ['bg', 'surface', 'surface-2'].forEach(function (bg) {
    check(name + ' text on ' + bg, t.text, t[bg], 4.5);
    check(name + ' muted on ' + bg, t.muted, t[bg], 4.5);
  });
  check(name + ' success on surface', t.success, t.surface, 3);
  check(name + ' danger on surface', t.danger, t.surface, 3);
  check(name + ' on-status on danger', t['on-status'], t.danger, 4.5);
  check(name + ' on-status on success', t['on-status'], t.success, 4.5);

  accents.forEach(function (a) {
    const sel = name === 'light'
      ? function (s) { return s.indexOf(':root[data-accent="' + a + '"]') === 0; }
      : function (s) { return s.indexOf(':root[data-theme="dark"][data-accent="' + a + '"]') === 0; };
    let acc = block(sel);
    if (name === 'dark') acc = Object.assign({}, block(function (s) { return s.indexOf(':root[data-accent="' + a + '"]') === 0; }), acc);
    check(name + ' ' + a + ' accent text on surface', acc.accent, t.surface, 4.5);
    check(name + ' ' + a + ' accent text on bg', acc.accent, t.bg, 4.5);
    check(name + ' ' + a + ' button label on accent', acc['accent-text'], acc.accent, 4.5);
  });
});

// Number Rush arena: always dark, the same in both themes.
const base = block(function (s) { return s === ':root'; });
if (base['nr-arena']) {
  console.log('\n== Number Rush arena ==');
  check('nr text on arena', base['nr-text'], base['nr-arena'], 4.5);
  check('nr muted on arena', base['nr-muted'], base['nr-arena'], 4.5);
  ['nr-num', 'nr-num-hi', 'nr-hub', 'nr-bad-deep'].forEach(function (bg) { check('nr text on ' + bg, base['nr-text'], base[bg], 4.5); });
  check('nr gold on hub', base['nr-gold'], base['nr-hub'], 3);
  ['nr-good', 'nr-bad', 'nr-c0', 'nr-c1', 'nr-c2', 'nr-c3', 'nr-c4', 'nr-c5'].forEach(function (c) { check(c + ' edge on arena', base[c], base['nr-arena'], 3); });
}

// What's Missing?: the cover's magenta-to-tangerine sky, the same in both themes.
if (base['wm-sky-1']) {
  console.log(' '); console.log("== What's Missing? ==");
  ['wm-sky-1', 'wm-sky-2', 'wm-sky-3', 'wm-plum', 'wm-plum-2'].forEach(function (bg) { check('wm ink on ' + bg, base['wm-ink'], base[bg], 4.5); });
  ['wm-plum', 'wm-plum-2'].forEach(function (bg) {
    check('wm soft ink on ' + bg, base['wm-ink-soft'], base[bg], 4.5);
    check('wm gold on ' + bg, base['wm-gold'], base[bg], 4.5);
  });
  check('wm tile ink on cream', base['wm-tile-ink'], base['wm-cream'], 4.5);
  check('wm tile ink on cream-deep', base['wm-tile-ink'], base['wm-cream-deep'], 4.5);
  check('wm button ink on gold', base['wm-gold-ink'], base['wm-gold'], 4.5);
  check('wm button ink on glow', base['wm-gold-ink'], base['wm-glow'], 4.5);
  check('wm gold-ink on gold (step numbers)', base['wm-gold-ink'], base['wm-gold'], 4.5);
}

// GeoSpin night sky: always dark, the same in both themes.
if (base['skb-desk']) {
  ['skb-desk', 'skb-desk-2', 'skb-paper', 'skb-lilac', 'skb-sky'].forEach(function (bg) {
    check('skb ink on ' + bg, base['skb-ink'], base[bg], 4.5);
    check('skb soft ink on ' + bg, base['skb-ink-soft'], base[bg], 4.5);
    check('skb dim ink on ' + bg, base['skb-ink-dim'], base[bg], 4.5);
    check('skb violet on ' + bg, base['skb-violet'], base[bg], 4.5);
  });
  ['skb-violet', 'skb-blue', 'skb-violet-deep'].forEach(function (bg) {
    check('skb text on ' + bg, base['skb-on-accent'], base[bg], 4.5);
  });
  check('skb good on soft', base['skb-good'], base['skb-good-soft'], 4.5);
  check('skb bad on soft', base['skb-bad'], base['skb-bad-soft'], 4.5);
  check('skb warn on paper', base['skb-warn'], base['skb-paper'], 4.5);
}
if (base['cw-night']) {
  ['cw-night', 'cw-night-2', 'cw-walnut'].forEach(function (bg) {
    check('cw cream on ' + bg, base['cw-cream'], base[bg], 4.5);
    check('cw dim cream on ' + bg, base['cw-cream-dim'], base[bg], 4.5);
    check('cw gold on ' + bg, base['cw-gold'], base[bg], 4.5);
  });
  ['cw-paper', 'cw-paper-2', 'cw-paper-word', 'cw-paper-cross'].forEach(function (bg) {
    check('cw ink on ' + bg, base['cw-ink'], base[bg], 4.5);
    check('cw soft ink on ' + bg, base['cw-ink-soft'], base[bg], 4.5);
    check('cw reveal ink on ' + bg, base['cw-reveal-ink'], base[bg], 4.5);
  });
  check('cw solved ink on solved', base['cw-solved-ink'], base['cw-solved'], 4.5);
  check('cw wrong ink on wrong', base['cw-wrong-ink'], base['cw-wrong'], 4.5);
  check('cw cream on terra-deep', base['cw-cream'], base['cw-terra-deep'], 4.5);
  check('cw cream on green-deep', base['cw-cream'], base['cw-green-deep'], 4.5);
  check('cw ink on gold', base['cw-ink'], base['cw-gold'], 4.5);
}
if (base['chr-velvet']) {
  console.log(' '); console.log('== Charades ==');
  ['chr-velvet', 'chr-velvet-2', 'chr-plum'].forEach(function (bg) {
    check('chr ink on ' + bg, base['chr-ink'], base[bg], 4.5);
    check('chr soft ink on ' + bg, base['chr-ink-soft'], base[bg], 4.5);
    check('chr gold on ' + bg, base['chr-gold'], base[bg], 4.5);
  });
  check('chr dim ink on velvet-2', base['chr-ink-dim'], base['chr-velvet-2'], 4.5);
  check('chr card ink on card', base['chr-card-ink'], base['chr-card'], 4.5);
  check('chr card ink on card-2', base['chr-card-ink'], base['chr-card-2'], 4.5);
  check('chr soft card ink on card-2', base['chr-card-ink-soft'], base['chr-card-2'], 4.5);
  check('chr gold ink on gold', base['chr-gold-ink'], base['chr-gold'], 4.5);
  check('chr ink on curtain-deep', base['chr-ink'], base['chr-curtain-deep'], 4.5);
}
if (base['lgo-night']) {
  console.log(' '); console.log('== Logo Rush ==');
  ['lgo-night', 'lgo-night-2', 'lgo-dusk'].forEach(function (bg) {
    check('lgo ink on ' + bg, base['lgo-ink'], base[bg], 4.5);
    check('lgo soft ink on ' + bg, base['lgo-ink-soft'], base[bg], 4.5);
    check('lgo gold on ' + bg, base['gs-gold'], base[bg], 4.5);
  });
  check('lgo cyan on night-2', base['gs-cyan'], base['lgo-night-2'], 4.5);
  check('lgo dim ink on night-2', base['lgo-ink-dim'], base['lgo-night-2'], 4.5);
  check('lgo tile ink on tile', base['lgo-tile-ink'], base['lgo-tile'], 4.5);
  check('lgo tile ink on tile-2', base['lgo-tile-ink'], base['lgo-tile-2'], 4.5);
  check('lgo ink on bright-deep', base['lgo-ink'], base['lgo-bright-deep'], 4.5);
}
if (base['gs-night']) {
  console.log(' '); console.log('== GeoSpin ==');
  ['gs-night', 'gs-night-2', 'gs-dusk'].forEach(function (bg) {
    check('gs ink on ' + bg, base['gs-ink'], base[bg], 4.5);
    check('gs soft ink on ' + bg, base['gs-ink-soft'], base[bg], 4.5);
    check('gs gold on ' + bg, base['gs-gold'], base[bg], 4.5);
    check('gs cyan on ' + bg, base['gs-cyan'], base[bg], 4.5);
  });
  check('gs dim ink on night-2', base['gs-ink-dim'], base['gs-night-2'], 4.5);
  check('gs tile letter on gold', base['gs-gold-ink'], base['gs-gold'], 4.5);
  check('gs tile letter on gold-deep', base['gs-gold-ink'], base['gs-gold-deep'], 4.5);
  check('gs ink on green-deep', base['gs-ink'], base['gs-green-deep'], 4.5);
  check('gs ink on red-deep', base['gs-ink'], base['gs-red-deep'], 4.5);
  check('gs ink on blue-deep', base['gs-ink'], base['gs-blue-deep'], 4.5);
  check('gs ink on violet-deep', base['gs-ink'], base['gs-violet-deep'], 4.5);
}

// Ball Swap arena: always dark, the same in both themes.
if (base['bs-arena']) {
  console.log('\n== Ball Swap arena ==');
  check('bs text on arena', base['bs-text'], base['bs-arena'], 4.5);
  check('bs muted on arena', base['bs-muted'], base['bs-arena'], 4.5);
  check('bs text on glow', base['bs-text'], base['bs-arena-glow'], 4.5);
  ['bs-red', 'bs-blue', 'bs-green', 'bs-yellow', 'bs-purple', 'bs-good', 'bs-bad', 'bs-gold'].forEach(function (c) { check(c + ' on arena', base[c], base['bs-arena'], 3); });
}

console.log('\n' + (failures ? failures + ' failing pair(s)' : 'All pairs pass WCAG AA.'));
process.exit(failures ? 1 : 0);
