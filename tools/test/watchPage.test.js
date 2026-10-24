'use strict';
/* The Watch live page (watch.html): routing, the list, the limit check, viewer
   presence and the messages when a game stops. Runs on the dev bus. */
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
function boot(bus) {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/net/transport.js', 'js/watch/view.js', 'js/watch/tv.js', 'js/watch/list.js', 'js/watch/page.js']);
  const sb = FF.__sandbox;
  sb.Node = { [Symbol.hasInstance]: function (o) { return !!(o && o.tagName); } };
  FF.Storage.init();
  FF.Avatars = { img: function () { return sb.document.createElement('img'); } };
  FF.Icons = { icon: function () { return sb.document.createElement('i'); }, game: {} };
  FF.Net = { devMode: function () { return true; }, configured: function () { return true; } };
  const dev = FF.Transport.dev;
  FF.Transport.dev = function (o) { return dev(Object.assign({}, o, { bus: bus })); };
  const main = sb.document.createElement('main');
  sb.document.body.appendChild(main);
  return { FF: FF, main: main };
}
function text(node) {
  if (!node) return '';
  return (node.textContent || '') + (node.children || []).map(text).join('');
}
function find(node, cls, out) {
  out = out || [];
  if (!node) return out;
  if (typeof node.className === 'string' && node.className.split(' ').indexOf(cls) !== -1) out.push(node);
  (node.children || []).forEach(function (c) { find(c, cls, out); });
  return out;
}
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 10); }); }
function reply(status, body) { return function () { return Promise.resolve({ status: status, body: body }); }; }

const CODE = 'K7P2QXAB';
function liveDoc(over) {
  return Object.assign({
    v: 1, name: 'Friday quiz', public: true, status: 'lobby', mode: 'players', game: null, startAt: null, round: null,
    players: { u1: { name: 'Ana', avatar: 'fox', score: 0, answered: false } }, results: null, updatedAt: Date.now()
  }, over || {});
}
function putBroadcast(bus, doc) {
  const root = bus.read('') || {};
  root.broadcasts = root.broadcasts || {};
  if (doc) root.broadcasts[CODE] = doc; else delete root.broadcasts[CODE];
  bus.write('', root);
}

test('watch page: routes the list and watch links', function () {
  const { FF } = boot(makeBus());
  assertEqual(FF.WatchPage.route('/watch').view, 'list');
  assertEqual(FF.WatchPage.route('/watch/').view, 'list');
  assertEqual(FF.WatchPage.route('/watch.html').view, 'list');
  assertEqual(FF.WatchPage.route('/watch/K7P2QXAB').code, 'K7P2QXAB');
  assertEqual(FF.WatchPage.route('/watch/k7p2qxab').code, 'K7P2QXAB', 'lower case still works');
  assertEqual(FF.WatchPage.route('/watch/K7P2').view, 'list');
  assertEqual(FF.WatchPage.route('/watch/K7P2QXA0').view, 'list', '0 is not in the alphabet');
});

test('watch page: a full room shows the full screen and never joins the viewers', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  putBroadcast(bus, liveDoc());
  const calls = [];
  const page = FF.WatchPage.start({ root: main, pathname: '/watch/' + CODE, fetch: function (url) {
    calls.push(url);
    if (url.indexOf('/api/live/') !== -1) return Promise.resolve({ status: 200, body: { full: true, reason: 'room', room: null } });
    return Promise.resolve({ status: 200, body: { rooms: [], viewers: 0 } });
  } });
  await tick(40);
  assert(/This game is full right now\./.test(text(main)), 'full message');
  assert(calls[0].indexOf('/api/live/' + CODE + '?open=1') !== -1, 'asked the server first');
  assert(!((bus.read('') || {}).watchers), 'did not join the viewers');
  page.destroy();
});

test('watch page: a viewer adds and removes their entry', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  putBroadcast(bus, liveDoc());
  const page = FF.WatchPage.start({ root: main, pathname: '/watch/' + CODE, fetch: reply(200, { full: false }) });
  await tick(40);
  const w = ((bus.read('') || {}).watchers || {})[CODE] || {};
  assertEqual(Object.keys(w).length, 1, 'one viewer entry');
  assert(/Friday quiz/.test(text(main)), 'the room is on screen');
  page.destroy();
  await tick(10);
  const after = ((bus.read('') || {}).watchers || {})[CODE] || {};
  assertEqual(Object.keys(after).length, 0, 'removed on leaving');
});

test('watch page: the host stopping shows the stopped message', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  putBroadcast(bus, liveDoc());
  const page = FF.WatchPage.start({ root: main, pathname: '/watch/' + CODE, fetch: reply(200, { full: false }) });
  await tick(40);
  putBroadcast(bus, null);
  await tick(20);
  assert(/The host stopped sharing this game\./.test(text(main)), 'stopped message');
  page.destroy();
});

test('watch page: a game that is not live says so', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  const page = FF.WatchPage.start({ root: main, pathname: '/watch/' + CODE, fetch: reply(404, { error: 'not-live' }) });
  await tick(40);
  assert(/This game isn’t live right now\./.test(text(main)), 'not live message');
  page.destroy();
});

test('watch list: only cards from the API, with LIVE or IN LOBBY', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  const rooms = [
    { code: 'AAAAAAAA', name: 'Busy room', status: 'playing', round: 5, total: 10, viewers: 12, game: { id: 'guessFlag', name: 'World Flags', category: 'world' }, players: [{ name: 'Ana', avatar: 'fox' }] },
    { code: 'BBBBBBBB', name: 'Word Nerds', status: 'lobby', round: null, total: null, viewers: 1, game: null, players: [] }
  ];
  const list = FF.WatchList.mount(main, { fetch: reply(200, { rooms: rooms, viewers: 13 }) });
  await tick(30);
  const cards = find(main, 'wl-card');
  assertEqual(cards.length, 2);
  assert(/LIVE/.test(text(cards[0])) && /12 watching/.test(text(cards[0])) && /Question 5 of 10/.test(text(cards[0])), 'live card');
  assert(/IN LOBBY/.test(text(cards[1])) && /Picking the next game/.test(text(cards[1])), 'lobby card');
  assertEqual(cards[0].getAttribute('href'), 'watch/AAAAAAAA');
  assert(/That’s every public game right now/.test(text(main)), 'last row invites people to make a public room');
  list.destroy();
});

test('watch list: an empty list still invites people to start a room', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  const list = FF.WatchList.mount(main, { fetch: reply(200, { rooms: [], viewers: 0 }) });
  await tick(30);
  assertEqual(find(main, 'wl-card').length, 0);
  assert(/Start your own room and make it public/.test(text(main)));
  list.destroy();
});

test('watch page: viewers come back when the broadcast returns', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  putBroadcast(bus, liveDoc());
  const page = FF.WatchPage.start({ root: main, pathname: '/watch/' + CODE, fetch: reply(200, { full: false }) });
  await tick(40);
  putBroadcast(bus, null);
  await tick(20);
  assert(/The host stopped sharing this game\./.test(text(main)), 'stopped');
  putBroadcast(bus, liveDoc({ name: 'Back again' }));
  await tick(20);
  assert(/Back again/.test(text(main)), 'watching again');
  assert(!/stopped sharing/.test(text(main)), 'message gone');
  assertEqual(Object.keys((((bus.read('') || {}).watchers || {})[CODE]) || {}).length, 1, 'still counted as a viewer');
  page.destroy();
});

test('watch page: a quiet game reads as ended, and comes back when the new host carries on', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  putBroadcast(bus, liveDoc());
  const page = FF.WatchPage.start({ root: main, pathname: '/watch/' + CODE, fetch: reply(200, { full: false }) });
  await tick(40);
  putBroadcast(bus, liveDoc({ updatedAt: Date.now() - 60000 }));
  await tick(20);
  assert(/This game has ended\./.test(text(main)), 'ended');
  putBroadcast(bus, liveDoc({ name: 'New host' }));
  await tick(20);
  assert(/New host/.test(text(main)) && !/has ended/.test(text(main)), 'back');
  page.destroy();
});

test('watch page: viewers check in so the count only includes people still here', async function () {
  const bus = makeBus();
  const { FF, main } = boot(bus);
  putBroadcast(bus, liveDoc());
  const page = FF.WatchPage.start({ root: main, pathname: '/watch/' + CODE, fetch: reply(200, { full: false }), heartbeatMs: 30 });
  await tick(40);
  const first = Object.values(((bus.read('') || {}).watchers || {})[CODE])[0];
  await tick(60);
  const later = Object.values(((bus.read('') || {}).watchers || {})[CODE])[0];
  assert(later > first, 'the entry is refreshed');
  page.destroy();
});
