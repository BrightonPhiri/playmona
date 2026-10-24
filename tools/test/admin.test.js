'use strict';
/* Admin switches (gameConfig.js), guest access, usage counters (track.js) and the database rules. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js',
  'js/registry.js', 'js/auth.js', 'js/cloud.js', 'js/gameConfig.js', 'js/track.js'];

function boot() {
  const FF = loadFF(FILES);
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Storage.set('devAuth', true);
  FF.Games.register({ id: 'familyQuiz', name: 'Quiz Mix', category: 'quiz' });
  FF.Games.register({ id: 'mapChallenge', name: 'Map Challenge', category: 'world' });
  FF.Games.register({ id: 'wordBuilder', name: 'Word Builder', category: 'words' });
  return FF;
}

function tree(FF) { return FF.Storage.get('devCloud', {}) || {}; }
function today(FF) { return FF.Track.day(); }

/* ---------- Game switches ---------- */
test('game config: every game is on by default, with a guest starter set', function () {
  const FF = boot();
  assertEqual(FF.Games.all().length, 3);
  assertEqual(FF.GameConfig.game('familyQuiz').guest, true, 'Quiz Mix is a starter game');
  assertEqual(FF.GameConfig.game('mapChallenge').guest, false);
  assertEqual(FF.GameConfig.game('mapChallenge').tier, 'free');
});

test('game config: a game switched off leaves every list but can still be looked up', function () {
  const FF = boot();
  FF.GameConfig._set({ games: { wordBuilder: { enabled: false } }, site: {} });
  assertEqual(FF.Games.all().map(function (g) { return g.id; }), ['familyQuiz', 'mapChallenge']);
  assert(FF.Games.get('wordBuilder'), 'get() still finds it, for rooms already playing it');
});

test('game config: load() reads /config and keeps a copy for offline use', async function () {
  const FF = boot();
  await FF.Auth.init();
  await FF.Auth.playAsGuest();
  await FF.Cloud._local.set('config', { games: { mapChallenge: { enabled: true, guest: true, badge: 'new' } }, site: { announcement: 'Hi' } });
  const changed = await FF.GameConfig.load();
  assertEqual(changed, true);
  assertEqual(FF.GameConfig.game('mapChallenge').badge, 'new');
  assertEqual(FF.GameConfig.site().announcement, 'Hi');
  assertEqual(FF.Storage.get('gameConfig', null).site.announcement, 'Hi', 'cached on the device');
  assertEqual(await FF.GameConfig.load(), false, 'no change the second time');
});

/* ---------- Guest access ---------- */
test('access: guests play only guest games; accounts play every game that is on', async function () {
  const FF = boot();
  await FF.Auth.init();
  await FF.Auth.playAsGuest();
  assertEqual(FF.Access.canPlay('familyQuiz'), true);
  assertEqual(FF.Access.canPlay('mapChallenge'), false);
  assertEqual(FF.Access.canUse('online'), false);
  assertEqual(FF.Access.canUse('daily'), false);

  FF.GameConfig._set({ games: {}, site: { guest: { online: true } } });
  assertEqual(FF.Access.canUse('online'), true, 'the admin portal can open a feature to guests');

  await FF.Auth.signOut();
  await FF.Auth.signUp({ email: 'b@example.com', username: 'bea', password: 'password1', displayName: 'Bea', avatar: 'nia' });
  FF.GameConfig._set({ games: { wordBuilder: { enabled: false } }, site: {} });
  assertEqual(FF.Access.canPlay('mapChallenge'), true);
  assertEqual(FF.Access.canPlay('wordBuilder'), false, 'switched off for everyone');
  assertEqual(FF.Access.canUse('daily'), true);
});

/* ---------- Usage counters ---------- */
test('track: a guest game adds to today, the totals and the game, and marks the guest active', async function () {
  const FF = boot();
  await FF.Auth.init();
  await FF.Auth.playAsGuest();
  await FF.Track.seen();
  await FF.Track.play('familyQuiz', false);
  await FF.Track.play('familyQuiz', true);
  const d = tree(FF).stats.days[today(FF)];
  assertEqual(d.plays, 2);
  assertEqual(d.guestPlays, 2);
  assertEqual(d.onlinePlays, 1);
  assertEqual(d.games.familyQuiz, 2);
  assertEqual(d.onlineGames.familyQuiz, 1);
  assertEqual(tree(FF).stats.totals.plays, 2);
  assertEqual(Object.values(d.active), ['g']);
});

test('track: accounts get an index entry, and their plays are counted on it', async function () {
  const FF = boot();
  await FF.Auth.init();
  await FF.Auth.signUp({ email: 'c@example.com', username: 'cal', password: 'password1', displayName: 'Cal', avatar: 'fox' });
  const uid = FF.Auth.user().uid;
  await FF.Track.seen();
  await FF.Track.play('mapChallenge', false);
  const entry = tree(FF).userIndex[uid];
  assertEqual(entry.username, 'cal');
  assertEqual(entry.plays, 1);
  assertEqual(tree(FF).stats.days[today(FF)].active[uid], 'u');
  assertEqual(tree(FF).stats.days[today(FF)].guestPlays, undefined, 'not a guest play');
  assertEqual(await FF.Track.seen(), false, 'only once a day per device');
});

test('track: an install is counted once per device', async function () {
  const FF = boot();
  await FF.Auth.init();
  await FF.Auth.playAsGuest();
  FF.Storage.set('installPending', true);
  assertEqual(await FF.Track.checkInstall(), true);
  assertEqual(await FF.Track.checkInstall(), false);
  assertEqual(tree(FF).stats.totals.installs, 1);
});

test('track: unknown counter names are ignored', async function () {
  const FF = boot();
  await FF.Auth.init();
  await FF.Auth.playAsGuest();
  assertEqual(await FF.Track.count('nonsense'), false);
});

/* ---------- Database rules ---------- */
const RULES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'database.rules.json'), 'utf8')).rules;

test('rules: every counter the app writes is allowed by name', function () {
  const FF = boot();
  const day = RULES.stats.days.$day.$counter['.validate'];
  const total = RULES.stats.totals.$counter['.validate'];
  FF.Track.COUNTERS.forEach(function (name) {
    assert(day.indexOf(name) !== -1, 'day counter ' + name);
    assert(total.indexOf(name) !== -1, 'total counter ' + name);
  });
});

test('rules: no room-level write, and voice chat has its own paths', function () {
  const room = RULES.rooms.$code;
  assert(!room['.write'], 'a write at the room level would grant everything below it');
  assert(room.voice && room.voice.$uid['.write'], 'voice presence');
  assert(room.signals && room.signals.$to.$from.$id['.write'], 'voice signalling messages');
});

test('rules: only admins write config and bans; everyone reads config', function () {
  assertEqual(RULES.config['.read'], true);
  assert(/admins/.test(RULES.config['.write']), 'config write needs the admin flag');
  assert(/admins/.test(RULES.bans.$uid['.write']), 'bans write needs the admin flag');
  assert(/admins/.test(RULES.userIndex['.read']), 'the player list is admin-only');
  assert(!RULES.admins.$uid['.write'], 'nobody can make themselves an admin');
});

/* ---------- Guests, the full player list, visitors (added 2026-10-23) ---------- */
test('track: guests get a number (Guest001) once per device and a guest list entry', async function () {
  const FF = boot();
  await FF.Auth.init();
  await FF.Auth.playAsGuest();
  const uid = FF.Auth.user().uid;
  await FF.Track.seen();
  await FF.Track.play('familyQuiz', false);
  assertEqual(FF.Storage.get('guestNumber', null), 1);
  const entry = tree(FF).guestIndex[uid];
  assertEqual(entry.name, 'Guest001');
  assertEqual(entry.number, 1);
  assertEqual(entry.plays, 1);
  assertEqual(FF.Track.guestName(42), 'Guest042');
  assertEqual(FF.Track.guestName(1234), 'Guest1234');
});

test('auth: an unnamed guest is shown as their guest number', async function () {
  const FF = boot();
  FF.Storage.set('guestNumber', 7);
  await FF.Auth.init();
  await FF.Auth.playAsGuest();
  assertEqual(FF.Auth.user().displayName, 'Guest007');
});

test('admin: the player list fills in accounts made before it existed', async function () {
  const FF = loadFF(FILES.concat(['js/admin/data.js']));
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Storage.set('devAuth', true);
  await FF.Auth.init();
  await FF.Auth.signUp({ email: 'd@example.com', username: 'dee', password: 'password1', displayName: 'Dee', avatar: 'nia' });
  await FF.Auth.signOut();
  await FF.Auth.signUp({ email: 'e@example.com', username: 'eli', password: 'password1', displayName: 'Eli', avatar: 'fox' });
  assertEqual(await FF.AdminData.connect(), 'ok');
  assertEqual(await FF.AdminData.fillPlayerList(), 2);
  const rows = await FF.AdminData.usersBy('lastSeen', 50);
  assertEqual(rows.map(function (r) { return r.username; }).sort(), ['dee', 'eli']);
  assert(rows.every(function (r) { return r.lastSeen === 0 && !r.hash; }), 'not seen since; no password data copied');
});

test('rules: visitors can be added once without signing in; guests and usernames lists are admin-only', function () {
  const v = RULES.stats.days.$day.visitors.$vid;
  assertEqual(v['.write'], '!data.exists()');
  assert(/a-f0-9/.test(v['.validate']), 'visitor ids are random hex');
  assert(/admins/.test(RULES.guestIndex['.read']), 'guest list is admin-only');
  assert(/admins/.test(RULES.usernames['.read']), 'only admins can list usernames');
  assertEqual(RULES.usernames.$name['.read'], true, 'one name can still be looked up for sign-in');
  assert(/auth.uid === \$uid/.test(RULES.userIndex.$uid['.read']), 'a player can read their own entry');
});

/* ---------- Watching (phase 3) ---------- */
async function adminBoot() {
  const FF = loadFF(FILES.concat(['js/admin/data.js']));
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Storage.set('devAuth', true);
  await FF.Auth.init();
  await FF.Auth.signUp({ email: 'a@example.com', username: 'ada', password: 'password1', displayName: 'Ada', avatar: 'nia' });
  assertEqual(await FF.AdminData.connect(), 'ok');
  return FF;
}

test('admin: taking a room off Watch live sets delisted and switches public off', async function () {
  const FF = await adminBoot();
  await FF.AdminData.set('broadcasts/WATCHCD2', { v: 1, status: 'lobby', public: true, updatedAt: 1 });
  await FF.AdminData.delistRoom('ABC234', 'WATCHCD2');
  assertEqual(await FF.AdminData.get('rooms/ABC234/admin/delisted'), true);
  assertEqual(await FF.AdminData.get('broadcasts/WATCHCD2/public'), false);
  // No broadcast yet: only the room is marked (a lone 'public' would break the broadcast's rules).
  await FF.AdminData.delistRoom('DEF567', 'WATCHCD3');
  assertEqual(await FF.AdminData.get('rooms/DEF567/admin/delisted'), true);
  assertEqual(await FF.AdminData.get('broadcasts/WATCHCD3'), null);
});

test('admin: viewer limits save to config/site/watch with defaults 20 and 50', async function () {
  const FF = await adminBoot();
  assertEqual(JSON.stringify(FF.AdminData.WATCH_DEFAULTS), JSON.stringify({ room: 20, site: 50 }));
  await FF.AdminData.saveWatchLimits(30, 80);
  assertEqual(JSON.stringify(await FF.AdminData.get('config/site/watch')), JSON.stringify({ room: 30, site: 80 }));
  await FF.AdminData.saveWatchLimits(0, 999999);
  assertEqual(JSON.stringify(await FF.AdminData.get('config/site/watch')), JSON.stringify({ room: 1, site: 100000 }), 'kept within the allowed range');
  const pages = fs.readFileSync(path.join(__dirname, '..', '..', 'js/admin/pages.js'), 'utf8');
  assert(/clean\.watch = site\.watch|watch: site\.watch/.test(pages), 'saving other site settings keeps the limits');
});

test('admin: viewer counts are read one room at a time', async function () {
  const FF = await adminBoot();
  await FF.AdminData.set('watchers/WATCHCD2', { v1: 1, v2: 2 });
  const counts = await FF.AdminData.watcherCounts(['WATCHCD2', 'WATCHCD3']);
  assertEqual(JSON.stringify(counts), JSON.stringify({ WATCHCD2: 2, WATCHCD3: 0 }));
});

test('admin: the overview lists watch views', function () {
  const pages = fs.readFileSync(path.join(__dirname, '..', '..', 'js/admin/pages.js'), 'utf8');
  assert(/var COUNTERS = \[[^\]]*'watchers'/.test(pages), 'counted');
  assert(/Watch views/.test(pages), 'shown');
});
