'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

const BASE = ['js/core.js', 'js/i18n.js', 'js/icons.js', 'js/ui-kit.js', 'js/gameUI.js', 'js/endScreen.js'];

function textOf(el) {
  if (!el) return '';
  let s = el.textContent || '';
  (el.children || []).forEach(function (c) { s += ' ' + textOf(c); });
  return s;
}
function findClass(el, cls) {
  if (!el) return null;
  if (String(el.className || '').split(/\s+/).indexOf(cls) !== -1) return el;
  const kids = el.children || [];
  for (let i = 0; i < kids.length; i++) {
    const f = findClass(kids[i], cls);
    if (f) return f;
  }
  return null;
}
function allTag(el, tag, out) {
  out = out || [];
  if (!el) return out;
  if (el.tagName === tag) out.push(el);
  (el.children || []).forEach(function (c) { allTag(c, tag, out); });
  return out;
}
function setup() {
  const FF = loadFF(BASE);
  const root = document_(FF);
  return { FF: FF, root: root };
}
// A container that is on the page (its parents reach the document).
function document_(FF) {
  const doc = FF.__sandbox.document;
  const c = doc.createElement('div');
  (doc.body || doc).appendChild(c);
  return c;
}
const ME = { id: 'me', name: 'Ben', points: 142, isMe: true };

test('endScreen: trim keeps 6 stats, 3 with a ring, and panel over rounds', function () {
  const { FF } = setup();
  const s8 = []; for (let i = 0; i < 8; i++) s8.push({ label: 'L' + i, value: String(i) });
  assertEqual(FF.EndScreen.trim({ stats: s8 }).stats.length, 6);
  assertEqual(FF.EndScreen.trim({ stats: s8.slice(0, 5), ring: { value: 0.5, label: 'Accuracy' } }).stats.length, 3);
  const both = FF.EndScreen.trim({ rounds: [{ label: 'a' }], panel: { title: 'P', draw: function () {} } });
  assertEqual(both.rounds, undefined);
  assertEqual(both.panel.title, 'P');
  assertEqual(JSON.stringify(FF.EndScreen.trim(null)), '{}');
});

test('endScreen: solo shows the score, the headline and a new best', function () {
  const { FF, root } = setup();
  FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], summary: { headline: '18 words found!', kicker: 'Mixed · 4 rounds', best: { isNew: true } }, actions: [] });
  const txt = textOf(root);
  ['142', '18 words found!', 'Mixed · 4 rounds', 'New personal best!'].forEach(function (s) { assert(txt.indexOf(s) !== -1, 'shows ' + s); });
  assertEqual(findClass(root, 'end-podium'), null);
  assert(findClass(root, 'end-score'), 'one big score');
});

test('endScreen: an older best shows the best value', function () {
  const { FF, root } = setup();
  FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], summary: { best: { value: 160 } }, actions: [] });
  assert(textOf(root).indexOf('160') !== -1, 'shows the best');
});

test('endScreen: 2+ players show a podium and a table row each, lines optional', function () {
  const { FF, root } = setup();
  const ranked = [{ id: 'a', name: 'Amy', points: 96 }, { id: 'b', name: 'Ben', points: 80 }, { id: 'c', name: 'Cat', points: 12 }];
  FF.EndScreen.render(root, { kind: 'normal', ranked: ranked, summary: { lines: { a: '12 words · 75%' } }, actions: [] });
  assert(findClass(root, 'end-podium'), 'podium');
  const table = findClass(root, 'end-table');
  assertEqual(table.children.length, 3);
  const txt = textOf(table);
  ['Amy', 'Ben', 'Cat', '96', '80', '12 words · 75%'].forEach(function (s) { assert(txt.indexOf(s) !== -1, 'table shows ' + s); });
  assert(textOf(table.children[2]).indexOf('12') !== -1, 'a row with no line still shows its points');
});

test('endScreen: stats tiles and the ring draw their label and value', function () {
  const { FF, root } = setup();
  FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], summary: { stats: [{ icon: 'text-aa', label: 'Words', value: '18' }], ring: { value: 0.82, label: 'Accuracy' } }, actions: [] });
  const txt = textOf(findClass(root, 'end-stats'));
  ['Words', '18', 'Accuracy', '82%'].forEach(function (s) { assert(txt.indexOf(s) !== -1, 'stats show ' + s); });
});

test('endScreen: rounds become the panel list; a panel draw function fills the frame', function () {
  const { FF, root } = setup();
  FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], summary: { rounds: [{ label: 'START BR', mark: 'right', points: 24, note: '4 words' }, { label: 'END ING', mark: 'wrong', points: 0 }] }, actions: [] });
  const panel = findClass(root, 'end-panel');
  assert(panel, 'panel frame');
  assertEqual(allTag(panel, 'LI').length, 2);
  assert(textOf(panel).indexOf('START BR') !== -1 && textOf(panel).indexOf('4 words') !== -1, 'round rows');

  const r2 = setup();
  r2.FF.EndScreen.render(r2.root, { kind: 'normal', ranked: [ME], summary: { panel: { title: 'Your cards', draw: function (el) { el.appendChild(r2.FF.ui.div('x', 'hi')); } } }, actions: [] });
  const t2 = textOf(findClass(r2.root, 'end-panel'));
  assert(t2.indexOf('Your cards') !== -1 && t2.indexOf('hi') !== -1, 'panel drawn by the game');
});

test('endScreen: XP shows +N XP and the level', function () {
  const { FF, root } = setup();
  FF.Stats = { level: function () { return { level: 2, into: 20, need: 150, progress: 0.13 }; } };
  FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], xp: { gained: 16, total: 120 }, actions: [] });
  const txt = textOf(findClass(root, 'end-earned'));
  assert(txt.indexOf('+16 XP') !== -1, 'xp gained: ' + txt);
  assert(txt.indexOf('Level 2') !== -1, 'level');
});

test('endScreen: places arrive late, replace the checking line, and are ignored once detached', function () {
  const { FF, root } = setup();
  FF.Leaderboards = { threshold: function () { return 10; }, placeLine: function () { return 'Top 10 this week'; } };
  const view = FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], placesPending: true, gameId: 'stacoend', actions: [] });
  assert(textOf(root).indexOf('Checking the leaderboard') !== -1, 'checking line');
  view.setPlaces([{ period: 'week', rank: 3 }]);
  assert(textOf(root).indexOf('Top 10 this week') !== -1, 'place line');
  assertEqual(textOf(root).indexOf('Checking the leaderboard'), -1);

  const r2 = setup();
  r2.FF.Leaderboards = FF.Leaderboards;
  const v2 = r2.FF.EndScreen.render(r2.root, { kind: 'normal', ranked: [ME], placesPending: true, gameId: 'stacoend', actions: [] });
  v2.setPlaces([]);
  assertEqual(textOf(r2.root).indexOf('Checking the leaderboard'), -1);

  const r3 = setup();
  r3.FF.Leaderboards = FF.Leaderboards;
  const v3 = r3.FF.EndScreen.render(r3.root, { kind: 'normal', ranked: [ME], placesPending: true, gameId: 'stacoend', actions: [] });
  r3.root.parentNode.removeChild(r3.root);
  v3.setPlaces([{ period: 'week', rank: 1 }]);   // must not throw
});

test('endScreen: actions are one size, and the first primary is marked', function () {
  const { FF, root } = setup();
  let clicked = 0;
  FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], actions: [
    { id: 'playAgain', label: 'Play again', icon: 'restart', primary: true, onClick: function () { clicked++; } },
    { id: 'home', label: 'Home', icon: 'house', onClick: function () {} }
  ] });
  const btns = allTag(findClass(root, 'end-actions'), 'BUTTON');
  assertEqual(btns.length, 2);
  btns.forEach(function (b) { assert(b.className.indexOf('btn-lg') !== -1, 'one size: ' + b.className); });
  assert(btns[0].className.indexOf('btn-primary') !== -1, 'primary marked');
  assertEqual(btns[1].className.indexOf('btn-primary'), -1);
  btns[0].dispatch('click');
  assertEqual(clicked, 1);
});

test('endScreen: a game can word its own best (a length, not points)', function () {
  const { FF, root } = setup();
  FF.EndScreen.render(root, { kind: 'normal', ranked: [ME], summary: { best: { text: 'Your best on these settings: 9 long' } }, actions: [] });
  assert(textOf(root).indexOf('Your best on these settings: 9 long') !== -1, 'own best text');
});
