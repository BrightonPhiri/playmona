'use strict';
/* Say What?: checks every saying in js/data/sayings.js.

     node tools/saywhat/check.js        prints the problems, exit 1 when any

   Also used by tools/test/sayWhat.test.js (checkSayings). */

const LEVELS = ['easy', 'normal', 'hard'];
const GAP_WORD = /^[A-Za-z0-9'’-]+$/;

function low(s) { return String(s).toLowerCase().replace(/’/g, "'"); }

function checkSayings(data) {
  const problems = [];
  const packs = (data.packs || []).map((p) => p.id);
  const ids = {};
  const texts = {};
  (data.rows || []).forEach((r, i) => {
    const at = (r && r.id ? r.id : 'row ' + i) + ': ';
    const bad = (msg) => problems.push(at + msg);
    if (!r || typeof r.id !== 'string' || !/^[a-z0-9]+$/.test(r.id)) bad('id must be lowercase a-z0-9');
    else if (ids[r.id]) bad('duplicate id');
    else ids[r.id] = true;
    if (packs.indexOf(r.pack) === -1) bad('unknown pack ' + r.pack);
    if (LEVELS.indexOf(r.level) === -1) bad('unknown level ' + r.level);
    if (r.pack === 'kids' && r.level !== 'easy') bad('kids rows must be easy');
    if (typeof r.text !== 'string' || !r.text) { bad('no text'); return; }
    if (typeof r.meaning !== 'string' || !r.meaning) bad('no meaning');

    const plain = low(data.plain(r.text)).replace(/\s+/g, ' ').trim();
    if (texts[plain]) bad('same text as ' + texts[plain]);
    else texts[plain] = r.id;

    const gaps = data.gapsOf(r.text);
    if (!gaps.length) bad('no gap');
    if (gaps.length > 3) bad('more than 3 gaps');
    const seenGap = {};
    gaps.forEach((g) => {
      if (!GAP_WORD.test(g)) bad('gap "' + g + '" must be one word');
      else if (!/[A-Za-z]/.test(g)) bad('gap "' + g + '" has no letters');
      if (seenGap[low(g)]) bad('gap "' + g + '" twice');
      seenGap[low(g)] = true;
    });
    if ((r.text.match(/\{/g) || []).length !== (r.text.match(/\}/g) || []).length) bad('unbalanced braces');

    const decoys = r.decoys || {};
    Object.keys(decoys).forEach((k) => { if (gaps.indexOf(k) === -1) bad('decoys for "' + k + '", which is not a gap'); });
    const also = r.also || {};
    Object.keys(also).forEach((k) => { if (gaps.indexOf(k) === -1) bad('also for "' + k + '", which is not a gap'); });
    gaps.forEach((g) => {
      const list = decoys[g];
      if (!Array.isArray(list) || list.length < 4) { bad('gap "' + g + '" needs 4+ decoys'); return; }
      if (list.length > 6) bad('gap "' + g + '" has more than 6 decoys');
      const okWords = [low(g)].concat((also[g] || []).map(low));
      const seen = {};
      list.forEach((d) => {
        if (typeof d !== 'string' || !GAP_WORD.test(d)) bad('decoy "' + d + '" must be one word');
        if (okWords.indexOf(low(d)) !== -1) bad('decoy "' + d + '" is a right answer for "' + g + '"');
        if (seen[low(d)]) bad('decoy "' + d + '" twice');
        seen[low(d)] = true;
      });
    });

    if (r.two) {
      if (!Array.isArray(r.two) || r.two.length !== 2 || gaps.indexOf(r.two[0]) === -1 || gaps.indexOf(r.two[1]) === -1 || r.two[0] === r.two[1]) {
        bad('two must name two different gaps');
      }
      if (r.level !== 'hard') bad('two-gap rows must be hard');
    }
  });
  return problems;
}

module.exports = { checkSayings };

if (require.main === module) {
  const { loadFF } = require('../test/harness');
  const FF = loadFF(['js/core.js', 'js/data/sayings.js']);
  const problems = checkSayings(FF.data.sayings);
  problems.forEach((p) => console.log(p));
  const rows = FF.data.sayings.rows;
  console.log(problems.length ? problems.length + ' problems' : 'ok: ' + rows.length + ' sayings');
  process.exit(problems.length ? 1 : 0);
}
