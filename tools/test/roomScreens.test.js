'use strict';
/* The room screens: the countdown survives redraws, old lobby listeners
   are dropped, and the Online page is not redrawn over a room screen. */
const { loadFF, test, assert, assertEqual } = require('./harness');

function makeBus() {
  const store = {};
  const listeners = [];
  return {
    read: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
    write: function (k, v) {
      if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v));
      listeners.slice().forEach(function (fn) { fn(k); });
    },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    }
  };
}

function find(node, cls) {
  if (!node) return null;
  if (typeof node.className === 'string' && node.className.split(' ').indexOf(cls) !== -1) return node;
  if (node.classList && node.classList.contains && node.classList.contains(cls)) return node;
  for (const c of node.children || []) { const hit = find(c, cls); if (hit) return hit; }
  return null;
}
function text(node) {
  if (!node) return '';
  return (node.textContent || '') + (node.children || []).map(text).join('');
}

function phone(bus, name) {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/ui-kit.js', 'js/net/transport.js', 'js/net/room.js', 'js/net/raceRules.js', 'js/net/race.js']);
  const sb = FF.__sandbox;
  sb.Node = { [Symbol.hasInstance]: function (o) { return !!(o && o.tagName); } };
  sb.getComputedStyle = function () { return { visibility: 'visible', display: 'block' }; };
  FF.Storage.init();
  FF.t = function (k, f, v) { let s = f || k; Object.keys(v || {}).forEach(function (x) { s = s.split('{' + x + '}').join(v[x]); }); return s; };
  FF.Players = {
    AVATARS: ['fox'], COLORS: ['#8b5cf6'],
    get: function () { return [{ name: name, avatar: 'fox', color: '#8b5cf6' }]; },
    avatarEl: function () { return sb.document.createElement('img'); }
  };
  FF.Avatars = { img: function () { return sb.document.createElement('img'); }, url: function () { return ''; } };
  FF.Icons = { icon: function () { return sb.document.createElement('i'); }, game: {} };
  FF.Nav = { focusFirst: function () {}, modality: 'pointer' };
  FF.Audio = { play: function () {} };
  FF.Games = { get: function (id) { return { id: id, name: 'Family quiz', category: 'quiz', description: '' }; } };
  FF.Categories = { quiz: { name: 'Quiz', color: '#8b5cf6' } };
  FF.SettingsUI = { duration: function () { return sb.document.createElement('div'); }, count: function () { return sb.document.createElement('div'); } };
  FF.launched = [];
  FF.GameFlow = { launch: function (id) { FF.launched.push(id); } };
  // A voice chat that only counts its listeners.
  const voiceListeners = { change: [], speaking: [] };
  FF.Voice = {
    isSupported: function () { return true; }, isActive: function () { return false; }, isSpeaking: function () { return false; },
    peers: function () { return []; }, leave: function () {},
    on: function (ev, fn) { voiceListeners[ev].push(fn); return function () { const i = voiceListeners[ev].indexOf(fn); if (i !== -1) voiceListeners[ev].splice(i, 1); }; },
    emit: function (ev, p) { voiceListeners[ev].slice().forEach(function (fn) { fn(p); }); },
    listeners: voiceListeners
  };
  FF.Net = { devMode: function () { return true; }, configured: function () { return true; } };
  sb.window.FF = FF;
  require('vm').runInContext(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'js/net/roomUI.js'), 'utf8'), sb, { filename: 'roomUI.js' });
  const dev = FF.Transport.dev;
  FF.Transport.dev = function (o) { return dev(Object.assign({}, o, { bus: bus })); };
  const main = sb.document.createElement('main');
  sb.document.body.appendChild(main);
  return { FF: FF, main: main };
}
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 10); }); }

test('room screens: the countdown stays up through redraws and voice changes', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana'), guest = phone(bus, 'Ben');
  const room = await host.FF.Room.create({ dev: true });
  await guest.FF.Room.join(room.code, {}, { dev: true });
  guest.FF.RoomUI.showLobby(guest.main);
  await tick(20);
  assert(find(guest.main, 'rm-roomhead'), 'guest sees the lobby');
  assertEqual(guest.FF.Voice.listeners.change.length, 1, 'one voice listener for the lobby');

  await host.FF.Room.startGame('familyQuiz', {});
  await tick(250);
  assert(find(guest.main, 'rm-count'), 'guest sees the countdown');

  // The app redraws the Online page in the background (config, Plus, sync)...
  guest.FF.RoomUI.showLobby(guest.main);
  await tick(150);
  assert(find(guest.main, 'rm-count'), 'countdown is back after a lobby redraw');
  // ...and someone in voice chat starts talking.
  guest.FF.Voice.emit('change', { active: true, muted: false, deafened: false, peerCount: 1, speaking: true });
  await tick(150);
  assert(find(guest.main, 'rm-count'), 'countdown is still up after a voice change');
  assertEqual(guest.FF.Voice.listeners.change.length, 0, 'the lobby voice listener is gone during the countdown');
  assert(guest.FF.RoomUI.busy(), 'the app knows a room screen is showing');
  assertEqual(guest.FF.launched.length, 0, 'the game has not started early');

  host.FF.Room.leave(); guest.FF.Room.leave();
});

test('room screens: a room link opens the room, not the join form', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana'), guest = phone(bus, 'Ben');
  const room = await host.FF.Room.create({ dev: true });
  // Ben has played before, so this device knows his name.
  guest.FF.Room.saveIdentity({ name: 'Ben' });
  guest.FF.RoomUI.joinCode(guest.main, room.code);
  await tick(60);
  assert(guest.FF.Room.current(), 'Ben is in the room');
  assert(find(guest.main, 'rm-roomhead'), 'and on the lobby');
  assert(!find(guest.main, 'rm-input'), 'not on the join form');
  host.FF.Room.leave(); guest.FF.Room.leave();
});

test('room screens: the lobby shows the room name, Save and Leave', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana');
  await host.FF.Room.create({ dev: true, name: 'Friday quiz' });
  host.FF.RoomUI.showLobby(host.main);
  await tick(20);
  const head = find(host.main, 'rm-roomhead');
  assert(/Friday quiz/.test(text(head)), 'room name shown');
  assert(/Save room/.test(text(head)) && /Leave room/.test(text(head)), 'save and leave buttons');

  host.FF.RoomUI.leaveRoom(host.main);   // nobody else here: no confirmation
  await tick(20);
  assertEqual(host.FF.Room.current(), null, 'left the room');
  assert(!host.FF.RoomUI.busy() || find(host.main, 'mode-grid') || /Play with friends/.test(text(host.main)), 'back on Play with friends');
});

test('room screens: the host picks a game, then the list folds away and settings appear', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana');
  await host.FF.Room.create({ dev: true });
  host.FF.RoomUI._lastGame = undefined;
  host.FF.RoomUI._pickingGame = null;
  host.FF.RoomUI.showLobby(host.main);
  await tick(20);
  assert(find(host.main, 'rm-games'), 'the game list shows first');
  assert(!find(host.main, 'settings-section'), 'no settings before a game is picked');

  find(host.main, 'rm-game').dispatch('click');
  await tick(20);
  assert(!find(host.main, 'rm-games'), 'the list is hidden after picking');
  assert(find(host.main, 'rm-picked'), 'the chosen game is shown');
  assert(find(host.main, 'settings-section'), 'the settings appear');

  // Change game opens the list again.
  const change = find(host.main, 'rm-picked').children.filter(function (c) { return c.tagName === 'BUTTON'; })[0];
  change.dispatch('click');
  await tick(20);
  assert(find(host.main, 'rm-games'), 'Change game shows the list again');
  host.FF.Room.leave();
});

/* ---------- Watching (phase 3): lobby controls, viewer chip, Watch live card ---------- */
function stubBroadcast(FF, opts) {
  opts = opts || {};
  const calls = [];
  const cbs = [];
  FF.Broadcast = {
    calls: calls,
    start: function () {},
    stop: function () { return Promise.resolve(); },
    delisted: function () { return !!opts.delisted; },
    isPublic: function () { return false; },
    isWatching: function () { return true; },
    code: function () { return 'ABCDEFGH'; },
    watchUrl: function (c) { return 'https://playmona.com/watch/' + c; },
    ensureCode: function () { return Promise.resolve('ABCDEFGH'); },
    setPublic: function (v) { calls.push(['setPublic', v]); return Promise.resolve(); },
    setWatching: function (v) { calls.push(['setWatching', v]); return Promise.resolve(); },
    newLink: function () { calls.push(['newLink']); return Promise.resolve('HGFEDCBA'); },
    onViewers: function (cb) { cbs.push(cb); return function () { const i = cbs.indexOf(cb); if (i !== -1) cbs.splice(i, 1); }; },
    emitViewers: function (n) { cbs.slice().forEach(function (fn) { fn(n); }); }
  };
  return FF.Broadcast;
}
function findAll(node, cls, out) {
  out = out || [];
  if (!node) return out;
  if (typeof node.className === 'string' && node.className.split(' ').indexOf(cls) !== -1) out.push(node);
  (node.children || []).forEach(function (c) { findAll(c, cls, out); });
  return out;
}

test('room screens: the host sees the Watching panel; other players do not', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana'), guest = phone(bus, 'Ben');
  stubBroadcast(host.FF); stubBroadcast(guest.FF);
  const room = await host.FF.Room.create({ dev: true });
  await guest.FF.Room.join(room.code, {}, { dev: true });
  host.FF.RoomUI.showLobby(host.main);
  guest.FF.RoomUI.showLobby(guest.main);
  await tick(20);
  const panelEl = find(host.main, 'rm-watch');
  assert(panelEl, 'host has the panel');
  assert(/Watching/.test(text(panelEl)) && /Public/.test(text(panelEl)) && /Let people watch/.test(text(panelEl)), 'switches');
  assert(/Invite viewers/.test(text(panelEl)) && /New watch link/.test(text(panelEl)), 'buttons');
  assert(!find(guest.main, 'rm-watch'), 'guest has no panel');
  host.FF.Room.leave(); guest.FF.Room.leave();
});

test('room screens: switching Public calls setPublic', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana');
  const b = stubBroadcast(host.FF);
  await host.FF.Room.create({ dev: true });
  host.FF.RoomUI.showLobby(host.main);
  await tick(20);
  const sw = findAll(find(host.main, 'rm-watch'), 'switch')[0];
  sw.dispatch('click');
  await tick(10);
  assertEqual(JSON.stringify(b.calls[0]), JSON.stringify(['setPublic', true]));
  host.FF.Room.leave();
});

test('room screens: a delisted room shows the note and a disabled Public switch', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana');
  stubBroadcast(host.FF, { delisted: true });
  await host.FF.Room.create({ dev: true });
  host.FF.RoomUI.showLobby(host.main);
  await tick(20);
  const panelEl = find(host.main, 'rm-watch');
  assert(/An admin removed this room from Watch live\./.test(text(panelEl)), 'note shown');
  assertEqual(findAll(panelEl, 'switch')[0].disabled, true, 'Public switch disabled');
  host.FF.Room.leave();
});

test('room screens: the viewer chip shows the count and hides at zero', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana');
  const b = stubBroadcast(host.FF);
  await host.FF.Room.create({ dev: true });
  host.FF.RoomUI.showLobby(host.main);
  await tick(20);
  b.emitViewers(3);
  const chip = find(host.FF.__sandbox.document.body, 'rm-viewers');
  assert(chip && !chip.hidden, 'chip shown');
  assert(/3 watching/.test(text(chip)), 'count');
  b.emitViewers(1);
  assert(/1 watching/.test(text(chip)), 'one');
  b.emitViewers(0);
  assertEqual(chip.hidden, true, 'hidden at zero');
  host.FF.Room.leave();
});

test('room screens: the Online page has a Watch live card that is open to guests', async function () {
  const bus = makeBus();
  const p = phone(bus, 'Ana');
  stubBroadcast(p.FF);
  const gated = [];
  p.FF.Access = { gate: function (what, fn) { gated.push(what); } };
  let opened = 0;
  p.FF.RoomUI.showHome(p.main);
  await tick(10);
  p.FF.RoomUI.openWatch = function () { opened++; };
  const card = find(p.main, 'mode-card--teal');
  assert(card && /Watch live/.test(text(card)), 'card shown');
  card.dispatch('click');
  assertEqual(opened, 1, 'opens Watch live');
  assertEqual(gated.length, 0, 'no sign-up gate');
});

test('room screens: the Public switch follows the room itself, not the broadcaster', async function () {
  const bus = makeBus();
  const host = phone(bus, 'Ana');
  stubBroadcast(host.FF);   // the stub's isPublic() is always false (it has not caught up)
  await host.FF.Room.create({ dev: true });
  await host.FF.Room.setMeta({ public: true, watching: false });
  await tick(20);
  host.FF.RoomUI.showLobby(host.main);
  await tick(20);
  const sws = findAll(find(host.main, 'rm-watch'), 'switch');
  assertEqual(sws[0].getAttribute('aria-checked'), 'true', 'Public is on');
  assertEqual(sws[1].getAttribute('aria-checked'), 'false', 'watching is off');
  host.FF.Room.leave();
});
