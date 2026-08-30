/* ============================================================
   FAMILY FUN — tools/download-assets.js
   One-shot fetcher for bundled third-party assets:
     • Google Fonts (OFL)  → assets/fonts/*.woff2
     • Phosphor Icons (MIT) → assets/icons/phosphor/*.svg
   Also regenerates css/fonts.css and js/icons.js from the
   downloaded files so the app stays fully offline (file:// safe).

   Run:  node tools/download-assets.js
   ============================================================ */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function httpsGet(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, function (res) {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        if (redirects > 5) { reject(new Error('too many redirects: ' + url)); return; }
        res.resume();
        resolve(httpsGet(res.headers.location, redirects + 1));
        return;
      }
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ code: code, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, function () { req.destroy(new Error('timeout: ' + url)); });
  });
}

function writeFile(rel, buf) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return rel;
}

/* ------------------------------------------------------------
   1. FONTS — parse the Google Fonts CSS2 response, keep the
   latin subset block(s) only, download the woff2 locally.
   ------------------------------------------------------------ */
const FONTS = [
  { id: 'nunito',    family: 'Nunito',                url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@200..1000&display=swap' },
  { id: 'fredoka',   family: 'Fredoka',               url: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@300..700&display=swap' },
  { id: 'baloo',     family: 'Baloo 2',               url: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@400..800&display=swap' },
  { id: 'quicksand', family: 'Quicksand',             url: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap' },
  { id: 'atkinson',  family: 'Atkinson Hyperlegible', url: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap' }
];

async function downloadFonts() {
  const manifest = [];
  for (const f of FONTS) {
    const res = await httpsGet(f.url);
    if (res.code !== 200) {
      console.log('  [FONT] skip ' + f.id + ' — HTTP ' + res.code);
      continue;
    }
    const css = res.body.toString('utf8');
    // capture "/* latin */ @font-face { ... }" blocks
    const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
    let m;
    const latinBlocks = [];
    while ((m = re.exec(css)) !== null) {
      if (m[1] !== 'latin') continue;
      const block = m[2];
      const w = /font-weight:\s*([^;]+);/.exec(block);
      const u = /src:\s*url\(([^)]+)\)/.exec(block);
      if (w && u) latinBlocks.push({ weight: w[1].trim(), url: u[1].trim() });
    }
    if (!latinBlocks.length) { console.log('  [FONT] skip ' + f.id + ' — no latin block'); continue; }

    const faces = [];
    for (const b of latinBlocks) {
      const dl = await httpsGet(b.url);
      if (dl.code !== 200) { console.log('  [FONT] fail ' + f.id + ' @ ' + b.weight + ' — HTTP ' + dl.code); continue; }
      const isRange = b.weight.indexOf(' ') !== -1 || b.weight.indexOf('..') !== -1;
      const file = isRange ? (f.id + '.woff2') : (f.id + '-' + b.weight.replace(/\D/g, '') + '.woff2');
      writeFile(path.join('assets', 'fonts', file), dl.body);
      faces.push({ weight: b.weight, file: file });
      console.log('  [FONT] ' + f.id + '  ' + b.weight + '  →  ' + file + '  (' + dl.body.length + ' bytes)');
    }
    manifest.push({ id: f.id, family: f.family, faces: faces });
  }
  return manifest;
}

/* ------------------------------------------------------------
   2. ICONS — Phosphor "bold" weight, downloaded to
   assets/icons/phosphor/ and inlined into js/icons.js.
   ------------------------------------------------------------ */
const PHOSPHOR_VERSION = '2.1.1';
const ICON_BASE = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/core@' + PHOSPHOR_VERSION + '/assets/bold/';

// semantic → phosphor base name (bold weight)
const NAV = {
  home: 'house', games: 'game-controller', players: 'users-three',
  scores: 'trophy', favorites: 'star', settings: 'gear'
};
const CATEGORY = {
  words: 'text-aa', quiz: 'brain', visual: 'eye', memory: 'puzzle-piece',
  reaction: 'lightning', creative: 'paint-brush', numbers: 'calculator',
  party: 'confetti', world: 'globe-hemisphere-west'
};
const GAME = {
  // words
  letterRush: 'keyboard', wordScramble: 'shuffle', wordBuilder: 'stack',
  wordChain: 'link', miniCrossword: 'squares-four',
  // quiz
  familyQuiz: 'brain', trueOrFalse: 'scales', brainBattle: 'lightning',
  guessWho: 'detective', pictureQuiz: 'image',
  // visual
  picturePuzzle: 'puzzle-piece', spotDifference: 'magnifying-glass',
  hiddenObject: 'binoculars', visualRiddle: 'question',
  guessLandmark: 'buildings', guessAnimal: 'paw-print', guessFood: 'fork-knife',
  guessObject: 'cube', guessSport: 'medal', guessVehicle: 'car',
  // memory
  memoryMatch: 'cards', pictureMemory: 'images', whatsMissing: 'eye-slash',
  rememberSequence: 'list-numbers',
  // reaction
  quickTap: 'hand-tap', colorReaction: 'drop',
  // creative
  charades: 'person-arms-spread', visualCharades: 'image-square',
  dontSayIt: 'x-circle', drawingChallenge: 'pencil', pictionary: 'chalkboard',
  // numbers
  numberChallenge: 'hash', higherOrLower: 'chart-line',
  // party
  wouldYouRather: 'arrows-left-right', thisOrThat: 'split-horizontal',
  whoIsMostLikely: 'target',
  // world
  guessCountry: 'globe', whereInWorld: 'map-pin', mapChallenge: 'map-trifold',
  capitalChallenge: 'city', guessFlag: 'flag'
};
// extra UI chrome icons used by the shell
const UI = {
  play: 'play', moon: 'moon', sun: 'sun', monitor: 'monitor',
  expand: 'arrows-out', close: 'x', check: 'check', info: 'info',
  heart: 'heart', fire: 'fire', sparkle: 'sparkle', timer: 'timer'
};

async function downloadIcons() {
  const all = Object.assign({}, NAV, CATEGORY, GAME, UI);
  const names = [];
  Object.keys(all).forEach(function (k) { if (names.indexOf(all[k]) === -1) names.push(all[k]); });
  names.sort();

  const svgs = {};
  const missing = [];
  for (const n of names) {
    const file = n + '-bold.svg';
    const res = await httpsGet(ICON_BASE + file);
    if (res.code !== 200) { missing.push(file); continue; }
    const text = res.body.toString('utf8');
    writeFile(path.join('assets', 'icons', 'phosphor', file), res.body);
    svgs[n] = text;
  }
  console.log('  [ICONS] downloaded ' + names.length - missing.length + '/' + names.length + ' (missing: ' + missing.join(', ') + ')');
  return { svgs: svgs, nav: NAV, category: CATEGORY, game: GAME, ui: UI };
}

/* ------------------------------------------------------------
   3. Generate css/fonts.css
   ------------------------------------------------------------ */
function generateFontsCss(manifest) {
  const lines = [
    '/* ============================================================',
    '   FAMILY FUN — fonts.css (generated by tools/download-assets.js)',
    '   Bundled local fonts (SIL Open Font License / Google Fonts).',
    '   No network requests at runtime.',
    '   ============================================================ */',
    ''
  ];
  manifest.forEach(function (f) {
    f.faces.forEach(function (face) {
      lines.push('@font-face {');
      lines.push("  font-family: '" + f.family + "';");
      lines.push('  font-style: normal;');
      lines.push('  font-weight: ' + face.weight + ';');
      lines.push('  font-display: swap;');
      lines.push("  src: url('../assets/fonts/" + face.file + "') format('woff2');");
      lines.push('}');
      lines.push('');
    });
  });
  return lines.join('\n');
}

/* ------------------------------------------------------------
   4. Generate js/icons.js
   ------------------------------------------------------------ */
function generateIconsJs(icons) {
  const svgLines = [];
  Object.keys(icons.svgs).sort().forEach(function (n) {
    svgLines.push('  ' + JSON.stringify(n) + ': ' + JSON.stringify(icons.svgs[n]) + ',');
  });

  const out = [];
  out.push('/* ============================================================');
  out.push('   FAMILY FUN — icons.js (generated by tools/download-assets.js)');
  out.push('   Phosphor Icons (MIT) "bold" weight, inlined so the app runs');
  out.push('   fully offline from file:// with no network requests.');
  out.push('   ============================================================ */');
  out.push('window.FF = window.FF || {};');
  out.push('');
  out.push('(function () {');
  out.push("  'use strict';");
  out.push('');
  out.push('  var set = {');
  out.push(svgLines.join('\n'));
  out.push('  };');
  out.push('');
  out.push('  var nav = ' + JSON.stringify(icons.nav, null, 2) + ';');
  out.push('  var category = ' + JSON.stringify(icons.category, null, 2) + ';');
  out.push('  var game = ' + JSON.stringify(icons.game, null, 2) + ';');
  out.push('  var ui = ' + JSON.stringify(icons.ui, null, 2) + ';');
  out.push('');
  out.push('  FF.Icons = {');
  out.push('    set: set, nav: nav, category: category, game: game, ui: ui,');
  out.push('');
  out.push('    // Return the raw inline SVG markup for a semantic key, or an empty string.');
  out.push('    svg: function (key) { return set[key] || \'\'; },');
  out.push('');
  out.push('    // Build a <span class="icon-svg"> wrapping an inline SVG icon.');
  out.push('    // fallback is used (as emoji) when the icon is unknown.');
  out.push('    icon: function (key, fallback, extraCls) {');
  out.push('      var span = document.createElement(\'span\');');
  out.push('      span.className = \'icon-svg\' + (extraCls ? \' \' + extraCls : \'\');');
  out.push('      span.setAttribute(\'aria-hidden\', \'true\');');
  out.push('      var markup = set[key];');
  out.push('      if (markup) span.innerHTML = markup;');
  out.push('      else if (fallback) span.textContent = fallback;');
  out.push('      return span;');
  out.push('    },');
  out.push('');
  out.push('    iconBy: function (map, key, fallback, extraCls) {');
  out.push('      return this.icon(map[key], fallback, extraCls);');
  out.push('    }');
  out.push('  };');
  out.push('})();');
  out.push('');
  return out.join('\n');
}

/* ------------------------------------------------------------
   Main
   ------------------------------------------------------------ */
(async function main() {
  console.log('FAMILY FUN — downloading bundled assets…\n');
  console.log('[1/2] Fonts (Google Fonts, OFL)');
  const manifest = await downloadFonts();
  const fontsCss = generateFontsCss(manifest);
  writeFile(path.join('css', 'fonts.css'), Buffer.from(fontsCss, 'utf8'));
  console.log('      → css/fonts.css (' + manifest.length + ' families)\n');

  console.log('[2/2] Icons (Phosphor, MIT)');
  const icons = await downloadIcons();
  const iconsJs = generateIconsJs(icons);
  writeFile(path.join('js', 'icons.js'), Buffer.from(iconsJs, 'utf8'));
  console.log('      → js/icons.js\n');

  console.log('DONE.');
})().catch(function (e) {
  console.error('FATAL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
