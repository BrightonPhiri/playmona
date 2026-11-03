'use strict';
/* Leaderboards (js/leaderboards.js): which games and results count, the daily challenge's game,
   per-game boards, the "top N" wording, the server's copy of the rules, and the database rules. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

const FILES = ['js/core.js', 'js/storage.js', 'js/scoring.js', 'js/data/avatars.js', 'js/avatars.js', 'js/players.js',
  'js/registry.js', 'js/auth.js', 'js/cloud.js', 'js/gameConfig.js', 'js/leaderboards.js', 'js/social.js'];

function boot() {
  const FF = loadFF(FILES);
  FF.__sandbox.crypto = require('crypto').webcrypto;
  FF.__sandbox.TextEncoder = TextEncoder;
  FF.Storage.init();
  FF.Storage.set('devAuth', true);
  return FF;
}

async function signedIn(FF, name) {
  await FF.Auth.init();
  await FF.Auth.signUp({ email: name + '@example.com', username: name, password: 'password1', displayName: name, avatar: 'nia' });
  return FF;
}

/* Every game's metadata from js/games/*.js, without running the games. */
function realGames() {
  const dir = path.join(ROOT, 'js/games');
  const out = [];
  fs.readdirSync(dir).filter(function (f) { return f.endsWith('.js'); }).forEach(function (f) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    src.split(/registerGame\(\{/).slice(1).forEach(function (block) {
      const grab = function (re) { const m = block.match(re); return m ? m[1] : null; };
      const id = grab(/^\s*id: '([A-Za-z]+)'/m);
      if (!id) return;
      const players = grab(/^\s*players: \[([^\]]*)\]/m);
      const modes = grab(/^\s*modes: \[([^\]]*)\]/m);
      const lb = grab(/^\s*leaderboard: (true|false)/m);
      const first = players ? players.split(',')[0].trim() : '1';
      out.push({
        id: id, name: grab(/^\s*name: '([^']*)'/m) || id, category: grab(/^\s*category: '([a-z]+)'/m),
        players: [/^\d+$/.test(first) ? Number(first) : 3, 8],
        modes: modes ? modes.split(',').map(function (s) { return s.trim().replace(/'/g, ''); }) : ['turn'],
        leaderboard: lb == null ? undefined : lb === 'true'
      });
    });
  });
  return out;
}

function solo(def, extra) {
  return Object.assign({ def: def, mode: 'solo', difficulty: 'normal', length: 'normal', timer: 20, clock: 0, variation: 'standard',
    room: false, tournament: false, scorers: [{ id: 'me', isMe: true, name: 'Me' }] }, extra || {});
}

/* ---------- Which games count ---------- */
test('leaderboards: party and creative games are out; solo games, and new ones, are in', function () {
  const FF = boot();
  const LB = FF.Leaderboards;
  assertEqual(LB.eligible({ id: 'charades', category: 'creative', players: [1, 8], modes: ['solo'] }), false);
  assertEqual(LB.eligible({ id: 'imposters', category: 'party', players: [3, 12], modes: ['everyone'] }), false);
  assertEqual(LB.eligible({ id: 'brandNewGame', category: 'quiz', players: [1, 8], modes: ['solo', 'turn'] }), true, 'a new solo game joins by itself');
  assertEqual(LB.eligible({ id: 'groupOnly', category: 'quiz', players: [3, 8], modes: ['everyone'] }), false, 'needs a group');
  assertEqual(LB.eligible({ id: 'optOut', category: 'quiz', players: [1, 8], modes: ['solo'], leaderboard: false }), false);
  assertEqual(LB.eligible({ id: 'optIn', category: 'party', players: [1, 8], modes: ['solo'], leaderboard: true }), true);
});

test('leaderboards: a game switched off, or off the leaderboards, is not active', function () {
  const FF = boot();
  const def = { id: 'guessFlag', name: 'Guess the Flag', category: 'world', players: [1, 8], modes: ['solo'] };
  FF.Games.register(def);
  assertEqual(FF.Leaderboards.active(def), true);
  FF.GameConfig._set({ games: { guessFlag: { ranked: false } }, site: {} });
  assertEqual(FF.Leaderboards.active(def), false, 'ranked: false');
  FF.GameConfig._set({ games: { guessFlag: { enabled: false } }, site: {} });
  assertEqual(FF.Leaderboards.active(def), false, 'switched off');
});

test('leaderboards: the server\'s game list matches the app\'s rule (api/lib/Leaderboards.php)', function () {
  const FF = boot();
  const games = realGames();
  assert(games.length >= 40, 'found the games: ' + games.length);
  const app = games.filter(function (g) { return FF.Leaderboards.eligible(g); }).map(function (g) { return g.id; }).sort();
  const php = fs.readFileSync(path.join(ROOT, 'api/lib/Leaderboards.php'), 'utf8');
  const list = php.match(/public const GAMES = \[([\s\S]*?)\];/)[1].match(/'([A-Za-z]+)'/g).map(function (s) { return s.replace(/'/g, ''); }).sort();
  assertEqual(list, app, 'add new leaderboard games to Leaderboards::GAMES too');
});

/* ---------- Which results count ---------- */
test('leaderboards: only solo games on the standard settings, by the account holder, count', async function () {
  const FF = await signedIn(boot(), 'alice');
  const LB = FF.Leaderboards;
  const def = { id: 'quickTap', name: 'Quick Tap', category: 'reaction', players: [1, 8], modes: ['solo', 'turn'] };
  FF.Games.register(def);
  assertEqual(LB.unrankedReason(solo(def)), null, 'standard solo game counts');
  assertEqual(LB.unrankedReason(solo(def, { difficulty: 'easy' })), 'settings');
  assertEqual(LB.unrankedReason(solo(def, { length: 'short' })), 'settings');
  assertEqual(LB.unrankedReason(solo(def, { timer: 30 })), 'settings');
  assertEqual(LB.unrankedReason(solo(def, { clock: 120 })), 'settings');
  assertEqual(LB.unrankedReason(solo(def, { room: true })), 'mode');
  assertEqual(LB.unrankedReason(solo(def, { tournament: true })), 'mode');
  assertEqual(LB.unrankedReason(solo(def, { variation: 'display' })), 'mode');
  assertEqual(LB.unrankedReason(solo(def, { scorers: [{ id: 'me', isMe: true }, { id: 'p2' }] })), 'players');
  assertEqual(LB.unrankedReason(solo(def, { scorers: [{ id: 'p2', name: 'Gran' }] })), 'players', 'someone else on this device');
  await FF.Auth.signOut();
  await FF.Auth.playAsGuest();
  assertEqual(LB.unrankedReason(solo(def)), 'account', 'guests are not on boards');
});

/* ---------- Dates ---------- */
test('leaderboards: ISO weeks start on Monday (UTC) and cross the new year correctly', function () {
  const LB = boot().Leaderboards;
  const w = function (s) { return LB.weekKey(new Date(s + 'T12:00:00Z')); };
  assertEqual(w('2026-11-03'), '2026-W45');
  assertEqual(w('2026-11-01'), '2026-W44', 'Sunday belongs to the week before');
  assertEqual(w('2026-11-02'), '2026-W45', 'Monday starts the week');
  assertEqual(w('2025-12-29'), '2026-W01');
  assertEqual(w('2027-01-01'), '2026-W53');
  assertEqual(w('2027-01-04'), '2027-W01');
});

/* ---------- The daily challenge's game ---------- */
test('daily: a date always picks the same game, and avoids the last two weeks', function () {
  const LB = boot().Leaderboards;
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't'];
  const one = LB.pickDaily('2026-11-03', ids, []);
  assertEqual(LB.pickDaily('2026-11-03', ids.slice().reverse(), []), one, 'order of the list does not matter');
  assertEqual(LB.pickDaily('2026-11-03', ids, [one]) !== one, true, 'not a recent game');
  // 30 days in a row: no game twice within 14 days.
  const meta = {};
  const d = new Date('2026-11-01T00:00:00Z');
  for (let i = 0; i < 30; i++) {
    const key = d.toISOString().slice(0, 10);
    meta[key] = { game: LB.pickDaily(key, ids, LB.recentDaily(meta, key)) };
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const days = Object.keys(meta).sort();
  days.forEach(function (k, i) {
    const window = days.slice(Math.max(0, i - 13), i).map(function (x) { return meta[x].game; });
    assert(window.indexOf(meta[k].game) === -1, k + ' repeats ' + meta[k].game);
  });
  assertEqual(LB.pickDaily('2026-11-03', ['only'], ['only']), 'only', 'with one game it still picks it');
});

test('daily: the server picks exactly like the app (same hash, same order)', function () {
  let php = null;
  try { php = execFileSync('php', ['-v'], { stdio: ['ignore', 'pipe', 'ignore'] }) && 'php'; } catch (e) { php = null; }
  if (!php) { console.log('    (skipped: php not found)'); return; }
  const LB = boot().Leaderboards;
  const ids = ['guessFlag', 'quickTap', 'familyQuiz', 'letterRush', 'memoryMatch', 'wordScramble', 'bibleQuiz'];
  const days = ['2026-11-03', '2026-12-31', '2027-01-01', '2027-06-15'];
  const code = "require '" + path.join(ROOT, 'api/lib/Leaderboards.php').replace(/\\/g, '/') + "';" +
    "$ids = " + JSON.stringify(ids).replace(/\[/, '[').replace(/"/g, "'") + ";" +
    "foreach (" + JSON.stringify(days).replace(/"/g, "'") + " as $d) echo PlayMona\\Leaderboards::pickDaily($d, $ids, ['guessFlag']), ',';";
  const out = execFileSync('php', ['-r', code]).toString().split(',').filter(Boolean);
  assertEqual(out, days.map(function (d) { return LB.pickDaily(d, ids, ['guessFlag']); }));
});

test('daily: the first device saves the day\'s game once; later devices read it', async function () {
  const FF = await signedIn(boot(), 'alice');
  ['guessFlag', 'quickTap', 'familyQuiz'].forEach(function (id) { FF.Games.register({ id: id, name: id, category: 'quiz', players: [1, 8], modes: ['solo'] }); });
  const id = await FF.Leaderboards.dailyGame('2026-11-03');
  assert(['guessFlag', 'quickTap', 'familyQuiz'].indexOf(id) !== -1, 'picked a real game: ' + id);
  const saved = await FF.Cloud.get('dailyMeta/2026-11-03');
  assertEqual([saved.game, saved.by], [id, 'device']);
  // Someone (the server, an admin) already chose another game for the next day: everyone uses it.
  await FF.Cloud.set('dailyMeta/2026-11-04', { game: 'quickTap', by: 'server', t: 1 });
  assertEqual(await FF.Leaderboards.dailyGame('2026-11-04'), 'quickTap');
});

test('daily: the seeded run deals the same rounds on every device', function () {
  const FF = boot();
  const deal = function () {
    FF.Random.seed(FF.Random.roundSeed('daily|2026-11-03', 'guessFlag', 'init'));
    const bag = new FF.Random.Bag(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const out = [bag.next(), bag.next(), bag.next(), FF.Random.int(1, 1000)];
    FF.Random.unseed();
    return out;
  };
  assertEqual(deal(), deal());
});

test('daily: finishing saves one result with the game and reports the place', async function () {
  const FF = await signedIn(boot(), 'alice');
  FF.Games.register({ id: 'quickTap', name: 'Quick Tap', category: 'reaction', players: [1, 8], modes: ['solo'] });
  const key = FF.Daily.key();
  await FF.Cloud.set('dailyMeta/' + key, { game: 'quickTap', by: 'server', t: 1 });
  await FF.Cloud.set('daily/' + key + '/someoneElse', { name: 'Bo', score: 9000, t: 1, game: 'quickTap' });
  FF.Daily._save(key, { started: true, game: 'quickTap', score: 0, ms: 0, t: Date.now() });
  assertEqual(FF.Daily.played(), true, 'one try: started counts');
  const rank = await FF.Daily.finish(key, 'quickTap', 4200);
  assertEqual(rank, 2, 'second behind Bo');
  const uid = FF.Auth.user().uid;
  const row = await FF.Cloud.get('daily/' + key + '/' + uid);
  assertEqual([row.score, row.game], [4200, 'quickTap']);
  assertEqual(await FF.Daily.finish(key, 'quickTap', 99999), 0, 'a second finish changes nothing');
  assertEqual((await FF.Cloud.get('daily/' + key + '/' + uid)).score, 4200);
});

/* ---------- Game boards ---------- */
test('boards: a score is kept only when it beats the player\'s best, on both boards', async function () {
  const FF = await signedIn(boot(), 'alice');
  const LB = FF.Leaderboards;
  const uid = FF.Auth.user().uid;
  let places = await LB.submitGame('guessFlag', 500);
  assertEqual(places.map(function (p) { return [p.period, p.rank]; }), [['week', 1], ['all', 1]]);
  places = await LB.submitGame('guessFlag', 300);
  assertEqual(places.length, 0, 'lower score: nothing written, no celebration');
  assertEqual((await FF.Cloud.get(LB.path('guessFlag', 'all') + '/' + uid)).score, 500);
  places = await LB.submitGame('guessFlag', 800);
  assertEqual(places.length, 2);
  assertEqual((await FF.Cloud.get(LB.path('guessFlag', 'week') + '/' + uid)).score, 800);
});

test('boards: featured games put admin picks first, then the most played, then defaults', async function () {
  const FF = await signedIn(boot(), 'alice');
  ['familyQuiz', 'guessFlag', 'quickTap', 'letterRush', 'charades'].forEach(function (id) {
    FF.Games.register({ id: id, name: id, category: id === 'charades' ? 'creative' : 'quiz', players: [1, 8], modes: ['solo'] });
  });
  FF.GameConfig._set({ games: {}, site: { leaderboard: { pinned: ['letterRush'] } } });
  await FF.Cloud.set('leaderboards/featured', ['quickTap', 'charades', 'gone']);
  const list = await FF.Leaderboards.featured();
  assertEqual(list.slice(0, 2), ['letterRush', 'quickTap']);
  assert(list.indexOf('charades') === -1 && list.indexOf('gone') === -1, 'only active games');
  assertEqual(list.length, 4, 'every active game, up to 10');
});

/* ---------- The celebration ---------- */
test('celebration: places 1 to 10 are "top 10", the rest "top N", outside N nothing', function () {
  const FF = boot();
  const LB = FF.Leaderboards;
  assertEqual([LB.tier(1, 20), LB.tier(7, 20), LB.tier(10, 20), LB.tier(15, 20), LB.tier(20, 20), LB.tier(21, 20)], [10, 10, 10, 20, 20, 0]);
  assertEqual(LB.tier(4, 5), 5, 'a threshold under 10 says top 5');
  assertEqual(LB.threshold(), 20, 'default');
  FF.GameConfig._set({ games: {}, site: { leaderboard: { celebrateTop: 50 } } });
  assertEqual(LB.threshold(), 50);
  FF.GameConfig._set({ games: {}, site: { leaderboard: { celebrateTop: 1 } } });
  assertEqual(LB.threshold(), 20, 'out of range falls back');
  FF.Games.register({ id: 'quickTap', name: 'Quick Tap', category: 'reaction', players: [1, 8], modes: ['solo'] });
  assertEqual(LB.placeLine({ period: 'week', rank: 7 }, 'quickTap', 20), 'You’re in the top 10 globally for Quick Tap this week.');
  assertEqual(LB.placeLine({ period: 'all', rank: 15 }, 'quickTap', 20), 'You’re in the top 20 globally of all time for Quick Tap.');
});

/* ---------- Database rules ---------- */
test('rules: the daily board needs the day\'s game, and only one result per player', function () {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const row = rules.daily.$day.$uid;
  assert(/!data\.exists\(\)/.test(row['.write']), 'written once');
  assert(/root\.child\('dailyMeta'\)\.child\(\$day\)\.child\('game'\)/.test(row['.validate']), 'game must match the day');
  const meta = rules.dailyMeta;
  assertEqual(meta['.read'], true);
  assert(/!data\.exists\(\)/.test(meta.$day['.write']) && /admins/.test(meta.$day['.write']), 'players save once; admins change');
});

test('rules: game boards take a higher score only, and the featured list is server-only', function () {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
  const lb = rules.leaderboards;
  assertEqual(lb.featured['.write'], undefined);
  [lb.$game.week.$week.$uid, lb.$game.all.$uid].forEach(function (b) {
    assert(/auth\.uid === \$uid/.test(b['.write']), 'own row only');
    assert(/newData\.child\('score'\)\.val\(\) > data\.child\('score'\)\.val\(\)/.test(b['.validate']), 'only a better score');
  });
  assertEqual(lb.$game.week.$week['.indexOn'], ['score']);
  assert(rules.imposterSecrets, 'the hand-added Imposters rules are still there');
});
