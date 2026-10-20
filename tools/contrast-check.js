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

console.log('\n' + (failures ? failures + ' failing pair(s)' : 'All pairs pass WCAG AA.'));
process.exit(failures ? 1 : 0);
