'use strict';
const fs = require('fs');
const path = require('path');

const src = path.join(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-Brighton-OneDrive-Documents-miscellaneous-familygame/agent-tools/46c0b721-d02f-47b0-8b1f-75243a72d161.txt'
);
const dest = path.join(__dirname, '..', 'js', 'data', 'wordlist.js');

const raw = fs.readFileSync(src, 'utf8');
const words = raw.split(/\r?\n/)
  .map(function (w) { return w.trim().toLowerCase().replace(/[^a-z]/g, ''); })
  .filter(function (w) { return w.length >= 3 && w.length <= 16; });
const uniq = Array.from(new Set(words));

const chunks = [];
for (let i = 0; i < uniq.length; i += 12) {
  chunks.push(uniq.slice(i, i + 12).join(' '));
}

const out = [
  '/* ============================================================',
  '   PLAYMONA — wordlist.js',
  '   Common English words (3–16 letters) used to accept real words',
  '   in Letter Rush, Word Builder and Word Chain.',
  '   Source: google-10000-english-usa-no-swears (MIT, first20hours).',
  '   ============================================================ */',
  'window.FF = window.FF || {};',
  '(function () {',
  "  'use strict';",
  '  FF.data = FF.data || {};',
  '  FF.data.words = FF.data.words || {};',
  "  FF.data.words.extra = ('" + chunks.join(" ' +\n    '") + "').split(' ');",
  '})();',
  ''
].join('\n');

// Rebuild the merged dictionary once the extra list is attached.
out = out.replace(
  '})();',
  '  if (FF.data.words && typeof FF.data.words.rebuild === \'function\') FF.data.words.rebuild();\n})();'
);

fs.writeFileSync(dest, out);
console.log('words:', uniq.length, 'bytes:', Buffer.byteLength(out));
console.log('family', uniq.indexOf('family') !== -1, 'games', uniq.indexOf('games') !== -1, 'player', uniq.indexOf('player') !== -1, 'cats', uniq.indexOf('cats') !== -1);
