<?php
/* Players Engine, Quick Match, friends and AI providers. Loaded by test.php (uses its harness). */
declare(strict_types=1);

use PlayMona\{Ai, App, AuthUser, Config, Crew, Db, FirebaseAuth, HttpClient, Matchmaker, Photos, Routes, Runner};

const CREW_SECRET = 'test-runner-secret-0123456789abcdef';

class FakeHttp extends HttpClient
{
    public array $replies = [];
    public array $calls = [];
    public function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 20): array
    {
        $this->calls[] = compact('method', 'url', 'headers', 'body', 'timeout');
        $r = array_shift($this->replies) ?? new RuntimeException('no reply queued');
        if ($r instanceof Throwable) throw $r;
        return $r;
    }
    public static function chat(array $json): array
    {
        $raw = json_encode(['choices' => [['message' => ['content' => json_encode($json)]]], 'usage' => ['total_tokens' => 42]]);
        return [200, json_decode($raw, true), $raw];
    }
}

/** A world with the engine wired in: runner spawns are counted, never run. */
function crewWorld(array $config = [], ?string $dbFile = null): array
{
    $db = new Db($dbFile ? 'sqlite:' . $dbFile : 'sqlite::memory:');
    $db->migrate();
    $rtdb = new MemoryRtdb();
    $rtdb->data['rooms'] = [];
    $rtdb->data['usernames'] = [];
    $rtdb->data['admins'] = ['admin1' => true];
    $rtdb->data['userIndex'] = [];
    $rtdb->data['crewRuns'] = [];
    $cfg = new Config(array_replace_recursive([
        'site_url' => 'https://playmona.test',
        'firebase' => ['project_id' => 'play-mona'],
        'crew' => ['runner_secret' => CREW_SECRET],
        'ai' => ['secret_key' => base64_encode(str_repeat('k', 32))],
    ], $config));
    $key = testKey();
    $spawns = new ArrayObject();
    $runner = new Runner($db, $cfg, function (array $c) use ($spawns) { $spawns[] = $c; return true; });
    $http = new FakeHttp();
    $app = new App($cfg, ['db' => $db, 'rtdb' => $rtdb, 'auth' => new FirebaseAuth('play-mona', fn () => ['kid1' => $key['public']]),
        'runner' => $runner, 'aiHttp' => $http, 'photos' => new Photos(sys_get_temp_dir())]);
    return ['app' => $app, 'db' => $db, 'rtdb' => $rtdb, 'routes' => new Routes($app), 'crew' => $app->crew(), 'mm' => $app->matchmaker(),
            'friends' => $app->friends(), 'ai' => $app->ai(), 'http' => $http, 'spawns' => $spawns, 'runner' => $runner];
}

function human(string $uid, array $extra = []): AuthUser { return new AuthUser($uid, $extra['provider'] ?? 'password', null, null); }

/** A lobby room hosted by $uid, as FF.Room.create leaves it. */
function openRoom(array $w, string $code, string $uid, int $joinedAt = 1000): void
{
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => $uid, 'ownerUid' => $uid],
        'players' => [$uid => ['name' => $uid, 'joinedAt' => $joinedAt, 'online' => true]],
    ];
}

function indexHuman(array $w, string $uid, string $username): void
{
    $w['rtdb']->data['userIndex'][$uid] = ['displayName' => ucfirst($username), 'username' => $username, 'avatar' => 'fox', 'createdAt' => 5, 'plays' => 3];
    $w['rtdb']->data['usernames'][$username] = ['uid' => $uid, 'email' => $username . '@example.com'];
}

function crewSettings(array $w, array $change): void { $w['crew']->saveSettings($change, 'admin1'); }

echo "\nPlayers Engine\n";

test('crew: migrate twice keeps the data', function () {
    $w = crewWorld();
    $w['crew']->seed(3);
    $w['db']->migrate();
    eq(3, count($w['crew']->all()));
});

test('crew: the game list matches the online games in roomUI.js', function () {
    preg_match('/var ONLINE_GAMES = \[(.*?)\];/s', (string) file_get_contents(__DIR__ . '/../../js/net/roomUI.js'), $m);
    preg_match_all("/'([A-Za-z]+)'/", preg_replace('#//.*#', '', $m[1]), $ids);
    $a = $ids[1]; $b = Crew::GAMES; sort($a); sort($b);
    eq($a, $b);
});

test('crew: a created player persists with a lasting identity, personality and skills', function () {
    $w = crewWorld();
    $p = $w['crew']->create(['displayName' => 'Tariro M', 'username' => 'Tariro_M', 'avatar' => 'amara',
        'personality' => ['reaction' => 90], 'skills' => ['quickTap' => 85, 'letterRush' => ['skill' => 30, 'level' => 'hard']]], 'admin1');
    eq('tariro_m', $p['username']);
    eq(28, strlen($p['uid']), 'uid looks like a Firebase uid');
    eq(1, preg_match('/^[A-Za-z0-9]{28}$/', $p['uid']));
    eq('available', $p['status']);
    eq(90, $p['personality']['reaction']);
    eq(50, $p['personality']['patience'], 'missing traits default to 50');
    eq(['skill' => 85, 'level' => 'hard'], $p['skills']['quickTap']);
    eq(['skill' => 30, 'level' => 'hard'], $p['skills']['letterRush'], 'an admin may set the level by hand');
    eq(['skill' => 50, 'level' => 'medium'], $p['skills']['bibleQuiz']);
    eq(count(Crew::GAMES), count($p['skills']));
    eq(['uid' => $p['uid']], $w['rtdb']->data['usernames']['tariro_m'], 'the username is held in Firebase too');
    eq($p, $w['crew']->byUid($p['uid']));
    eq(true, $w['crew']->isCrew($p['uid']));
    eq(false, $w['crew']->isCrew('someone'));
});

test('crew: usernames are unique against crew and real players, and input is checked', function () {
    $w = crewWorld();
    indexHuman($w, 'human1', 'kuda');
    $w['crew']->create(['displayName' => 'A', 'username' => 'abc', 'avatar' => 'fox'], null);
    throwsHttp(409, fn () => $w['crew']->create(['displayName' => 'B', 'username' => 'abc', 'avatar' => 'fox'], null));
    throwsHttp(409, fn () => $w['crew']->create(['displayName' => 'B', 'username' => 'kuda', 'avatar' => 'fox'], null));
    throwsHttp(400, fn () => $w['crew']->create(['displayName' => '', 'username' => 'xyz', 'avatar' => 'fox'], null));
    throwsHttp(400, fn () => $w['crew']->create(['displayName' => 'B', 'username' => 'a b', 'avatar' => 'fox'], null));
    throwsHttp(400, fn () => $w['crew']->create(['displayName' => 'B', 'username' => 'bcd', 'avatar' => 'fox', 'personality' => ['risk' => 101]], null));
    throwsHttp(400, fn () => $w['crew']->create(['displayName' => 'B', 'username' => 'bcd', 'avatar' => '<b>'], null));
});

test('crew: seeding tops up to the population, varied, and is safe to repeat', function () {
    $w = crewWorld();
    eq(20, $w['crew']->seed(20));
    eq(0, $w['crew']->seed(20));
    $all = $w['crew']->all();
    eq(20, count(array_unique(array_column($all, 'username'))));
    eq(true, count(array_unique(array_column($all, 'avatar'))) > 5, 'varied avatars');
    $quick = array_map(fn ($p) => $p['skills']['quickTap']['skill'], $all);
    eq(true, max($quick) - min($quick) >= 20, 'skills differ between players');
    eq(25, 20 + $w['crew']->seed(25), 'admins can grow the population');
});

test('crew: settings have defaults, are validated, and gate who gets crew', function () {
    $w = crewWorld();
    $s = $w['crew']->settings();
    eq('admins', $s['mode']);
    eq(true, $s['onlyWhenNoHumans']);
    throwsHttp(400, fn () => crewSettings($w, ['mode' => 'nobody']));
    throwsHttp(400, fn () => crewSettings($w, ['crewPerMatch' => [3, 1]]));
    throwsHttp(400, fn () => crewSettings($w, ['difficultyMix' => ['easy' => 0, 'medium' => 0, 'hard' => 0]]));
    eq(true, $w['crew']->allowedFor(true, 'quickTap'));
    eq(false, $w['crew']->allowedFor(false, 'quickTap'), 'admins only');
    crewSettings($w, ['mode' => 'everyone', 'games' => ['quickTap' => false, 'notAGame' => false]]);
    eq(true, $w['crew']->allowedFor(false, 'letterRush'));
    eq(false, $w['crew']->allowedFor(false, 'quickTap'), 'game switched off');
    eq(['quickTap' => false], $w['crew']->settings()['games'], 'unknown games are dropped');
    crewSettings($w, ['stopNew' => true]);
    eq(false, $w['crew']->allowedFor(true, 'letterRush'), 'stop new matches');
    crewSettings($w, ['stopNew' => false, 'mode' => 'off']);
    eq(false, $w['crew']->allowedFor(true, 'letterRush'), 'off');
});

test('crew: a reservation is atomic: a reserved player is never taken twice', function () {
    $file = sys_get_temp_dir() . '/playmona-crew-race-' . bin2hex(random_bytes(4)) . '.sqlite';
    $a = crewWorld([], $file);
    $a['crew']->seed(4);
    $b = crewWorld([], $file);   // a second server process on the same database
    $now = 10_000;
    $first = $a['db']->transaction(fn (Db $db) => $a['crew']->reserve($db, 'm_a', 'quickTap', 'normal', 3, $now));
    $second = $b['db']->transaction(fn (Db $db) => $b['crew']->reserve($db, 'm_b', 'quickTap', 'normal', 3, $now));
    eq(3, count($first));
    eq(1, count($second), 'only the one free player is left');
    eq([], array_intersect(array_column($first, 'id'), array_column($second, 'id')));
    // The guard itself: the same conditional update a racing request would run changes nothing.
    $id = $first[0]['id'];
    eq(0, $b['db']->run("UPDATE crew_players SET status = 'reserved', match_id = 'm_c' WHERE id = ? AND enabled = 1 AND (status = 'available' OR (status IN ('reserved', 'playing') AND lease_until < ?))", [$id, $now]));
    @unlink($file);
});

test('crew: leases expire, renew and release', function () {
    $w = crewWorld();
    $w['crew']->seed(2);
    $lease = $w['crew']->settings()['leaseSeconds'] * 1000;
    $got = $w['db']->transaction(fn (Db $db) => $w['crew']->reserve($db, 'm1', 'letterRush', 'easy', 2, 0));
    eq(2, count($got));
    eq([], $w['db']->transaction(fn (Db $db) => $w['crew']->reserve($db, 'm2', 'letterRush', 'easy', 2, $lease - 1)));
    eq(2, $w['crew']->renew(['m1'], 1000));
    eq('playing', $w['crew']->get($got[0]['id'])['status']);
    eq([], $w['db']->transaction(fn (Db $db) => $w['crew']->reserve($db, 'm2', 'letterRush', 'easy', 2, $lease + 500)), 'renewed lease holds');
    eq(['m1'], $w['crew']->sweep(1000 + $lease + 1), 'the sweep frees a lease nobody renewed');
    eq('available', $w['crew']->get($got[0]['id'])['status']);
    eq(null, $w['crew']->get($got[0]['id'])['matchId']);
    $w['db']->transaction(fn (Db $db) => $w['crew']->reserve($db, 'm3', 'letterRush', 'easy', 2, 5000));
    $w['crew']->setEnabled($got[0]['id'], false);
    eq('reserved', $w['crew']->get($got[0]['id'])['status'], 'switching off lets the current match finish');
    $w['crew']->release('m3', 6000);
    eq('disabled', $w['crew']->get($got[0]['id'])['status']);
    eq('available', $w['crew']->get($got[1]['id'])['status']);
    eq([], $w['db']->transaction(fn (Db $db) => array_filter($w['crew']->reserve($db, 'm4', 'letterRush', 'easy', 2, 7000), fn ($p) => $p['id'] === $got[0]['id'])), 'disabled players are not matched');
});

test('crew: results build each player\'s record per game', function () {
    $w = crewWorld();
    $p = $w['crew']->create(['displayName' => 'A', 'username' => 'abc', 'avatar' => 'fox'], null);
    $w['crew']->recordResult($p['id'], 'quickTap', 'win', 900, 1);
    $w['crew']->recordResult($p['id'], 'quickTap', 'loss', 400, 2);
    $w['crew']->recordResult($p['id'], 'letterRush', 'draw', 50, 3);
    $w['crew']->recordResult($p['id'], 'notAGame', 'win', 5, 4);
    $row = $w['db']->one("SELECT * FROM crew_stats WHERE crew_id = ? AND game_id = 'quickTap'", [$p['id']]);
    eq([2, 1, 1, 1300, 900], [(int) $row['played'], (int) $row['wins'], (int) $row['losses'], (int) $row['total_score'], (int) $row['best_score']]);
    eq(['played' => 3, 'wins' => 1, 'lastPlayedAt' => 3], $w['crew']->totals($p['id']));
});

echo "\nQuick Match\n";

function poll(array $w, string $uid, string $ticket, int $now, bool $admin = false): array
{
    return $w['mm']->ticket(human($uid), $ticket, $admin, $now);
}

test('match: only the host of a lobby room can queue, with an online game', function () {
    $w = crewWorld();
    openRoom($w, 'ABC234', 'alice');
    throwsHttp(403, fn () => $w['mm']->queue(human('bob'), false, ['gameId' => 'quickTap', 'roomCode' => 'ABC234'], 1));
    throwsHttp(400, fn () => $w['mm']->queue(human('alice'), false, ['gameId' => 'memoryMatch', 'roomCode' => 'ABC234'], 1));
    throwsHttp(400, fn () => $w['mm']->queue(human('alice'), false, ['gameId' => 'quickTap', 'roomCode' => 'ABC234', 'difficulty' => 'insane'], 1));
    $w['rtdb']->data['rooms']['ABC234']['meta']['status'] = 'playing';
    throwsHttp(409, fn () => $w['mm']->queue(human('alice'), false, ['gameId' => 'quickTap', 'roomCode' => 'ABC234'], 1));
});

test('match: two real players are paired into the older room', function () {
    $w = crewWorld();
    crewSettings($w, ['mode' => 'off']);
    openRoom($w, 'AAAAAA', 'alice');
    openRoom($w, 'BBBBBB', 'bob');
    $a = $w['mm']->queue(human('alice'), false, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1000);
    eq('waiting', $a['status']);
    $b = $w['mm']->queue(human('bob'), false, ['gameId' => 'any', 'roomCode' => 'BBBBBB'], 2000);
    eq(['matched', 'AAAAAA', 'quickTap', false], [$b['status'], $b['roomCode'], $b['gameId'], $b['host']]);
    $a = poll($w, 'alice', $a['ticket'], 2500);
    eq(['matched', 'AAAAAA', true], [$a['status'], $a['roomCode'], $a['host']]);
    eq(0, (int) $w['db']->one("SELECT crew_count FROM matches")['crew_count']);
});

test('match: different games, stale tickets and blocked players are not paired', function () {
    $w = crewWorld();
    openRoom($w, 'AAAAAA', 'alice');
    openRoom($w, 'BBBBBB', 'bob');
    openRoom($w, 'CCCCCC', 'cara');
    $w['mm']->queue(human('alice'), false, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1000);
    eq('waiting', $w['mm']->queue(human('bob'), false, ['gameId' => 'letterRush', 'roomCode' => 'BBBBBB'], 2000)['status']);
    eq('waiting', $w['mm']->queue(human('cara'), false, ['gameId' => 'quickTap', 'roomCode' => 'CCCCCC'], 60_000)['status'], 'alice stopped checking in');
    $w['friends']->block(human('dan'), 'cara', 1);
    openRoom($w, 'DDDDDD', 'dan');
    eq('waiting', $w['mm']->queue(human('dan'), false, ['gameId' => 'quickTap', 'roomCode' => 'DDDDDD'], 61_000)['status']);
});

test('match: asking again replaces the old search (one ticket per player)', function () {
    $w = crewWorld();
    openRoom($w, 'AAAAAA', 'alice');
    $one = $w['mm']->queue(human('alice'), false, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1000);
    $two = $w['mm']->queue(human('alice'), false, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1100);
    eq('cancelled', poll($w, 'alice', $one['ticket'], 1200)['status']);
    eq(1, (int) $w['db']->one("SELECT COUNT(*) AS n FROM match_tickets WHERE uid = 'alice' AND status = 'waiting'")['n']);
    $w['mm']->cancel(human('alice'), $two['ticket']);
    eq('cancelled', poll($w, 'alice', $two['ticket'], 1300)['status']);
    throwsHttp(404, fn () => poll($w, 'bob', $two['ticket'], 1300));
});

test('match: crew fill the seats after the fallback time, through the same room records', function () {
    $w = crewWorld();
    $w['crew']->seed(6);
    crewSettings($w, ['fallbackSeconds' => 5, 'crewPerMatch' => [2, 2]]);
    openRoom($w, 'AAAAAA', 'admin1', 900);
    $t = $w['mm']->queue(human('admin1'), true, ['gameId' => 'quickTap', 'difficulty' => 'hard', 'roomCode' => 'AAAAAA'], 1000);
    eq('waiting', poll($w, 'admin1', $t['ticket'], 4000, true)['status'], 'still looking for a real player');
    $r = poll($w, 'admin1', $t['ticket'], 6100, true);
    eq(['matched', 'AAAAAA', 'quickTap', true], [$r['status'], $r['roomCode'], $r['gameId'], $r['host']]);
    $players = $w['rtdb']->data['rooms']['AAAAAA']['players'];
    eq(3, count($players));
    $crewUids = array_values(array_diff(array_keys($players), ['admin1']));
    foreach ($crewUids as $uid) {
        eq(['name', 'avatar', 'color', 'teamId', 'joinedAt', 'lastSeen', 'online', 'away'], array_keys($players[$uid]), 'a crew record has exactly the fields a phone writes');
        eq(true, $players[$uid]['joinedAt'] > 900, 'seated after the host, so never host');
        eq('reserved', $w['crew']->byUid($uid)['status']);
    }
    $run = array_values($w['rtdb']->data['crewRuns'])[0];
    eq(['AAAAAA', 'quickTap', 'hard'], [$run['roomCode'], $run['gameId'], $run['difficulty']]);
    eq($crewUids, array_keys($run['crew']));
    eq(1, count($w['spawns']), 'the runner was started');
    eq(CREW_SECRET, $w['spawns'][0]['secret']);
});

test('match: crew stay away when switched off, not allowed, or a real player is online', function () {
    $cases = [
        'off' => [['mode' => 'off'], true, null],
        'stop new' => [['stopNew' => true], true, null],
        'not an admin' => [[], false, null],
        'game off' => [['games' => ['quickTap' => false]], true, null],
        'someone online' => [[], true, 'bob'],
        'max matches' => [['maxConcurrentMatches' => 0], true, null],
    ];
    foreach ($cases as $why => [$settings, $isAdmin, $other]) {
        $w = crewWorld();
        $w['crew']->seed(3);
        crewSettings($w, ['fallbackSeconds' => 0] + $settings);
        openRoom($w, 'AAAAAA', 'admin1');
        if ($other) $w['mm']->touch($other, 1000);
        $t = $w['mm']->queue(human('admin1'), $isAdmin, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1000);
        eq('waiting', poll($w, 'admin1', $t['ticket'], 20_000, $isAdmin)['status'], $why);
        eq(0, count($w['spawns']), $why);
    }
    // ...and with onlyWhenNoHumans off, someone else being online doesn't stop them.
    $w = crewWorld();
    $w['crew']->seed(3);
    crewSettings($w, ['fallbackSeconds' => 0, 'onlyWhenNoHumans' => false]);
    openRoom($w, 'AAAAAA', 'admin1');
    $w['mm']->touch('bob', 1000);
    $t = $w['mm']->queue(human('admin1'), true, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1000);
    eq('matched', poll($w, 'admin1', $t['ticket'], 2000, true)['status']);
});

test('match: with crew switched off, real players still pair as normal', function () {
    $w = crewWorld();
    $w['crew']->seed(3);
    crewSettings($w, ['mode' => 'off', 'fallbackSeconds' => 0]);
    openRoom($w, 'AAAAAA', 'alice');
    openRoom($w, 'BBBBBB', 'bob');
    $w['mm']->queue(human('alice'), true, ['gameId' => 'letterRush', 'roomCode' => 'AAAAAA'], 1000);
    eq('matched', $w['mm']->queue(human('bob'), true, ['gameId' => 'letterRush', 'roomCode' => 'BBBBBB'], 1500)['status']);
    eq(3, count(array_filter($w['crew']->all(), fn ($p) => $p['status'] === 'available')));
});

test('match: if Firebase fails while seating, the crew are released and the search goes on', function () {
    $w = crewWorld();
    $w['crew']->seed(2);
    crewSettings($w, ['fallbackSeconds' => 0]);
    openRoom($w, 'AAAAAA', 'admin1');
    $w['rtdb']->down = true;   // reads still work; the writes that seat crew fail
    $t = $w['mm']->queue(human('admin1'), true, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1000);
    eq('waiting', $t['status']);
    eq('waiting', poll($w, 'admin1', $t['ticket'], 2000, true)['status']);
    eq(2, count(array_filter($w['crew']->all(), fn ($p) => $p['status'] === 'available' && $p['matchId'] === null)));
    eq('failed', $w['db']->one("SELECT status FROM matches WHERE crew_count > 0")['status']);
    $w['rtdb']->down = false;
    eq('matched', poll($w, 'admin1', $t['ticket'], 3000, true)['status'], 'the next check-in tries again');
});

test('match: runner heartbeats, game results and the end of a match', function () {
    $w = crewWorld();
    $w['crew']->seed(4);
    crewSettings($w, ['fallbackSeconds' => 0, 'crewPerMatch' => [2, 2], 'maxGamesPerMatch' => 2]);
    openRoom($w, 'AAAAAA', 'admin1');
    $t = $w['mm']->queue(human('admin1'), true, ['gameId' => 'quickTap', 'roomCode' => 'AAAAAA'], 1000);
    poll($w, 'admin1', $t['ticket'], 1500, true);
    $matchId = array_keys($w['rtdb']->data['crewRuns'])[0];
    $crewUids = array_keys($w['rtdb']->data['crewRuns'][$matchId]['crew']);
    eq([], $w['mm']->heartbeat(77, [$matchId], 2000));
    eq(true, $w['runner']->alive(2000));
    eq(['m_gone'], $w['mm']->heartbeat(77, [$matchId, 'm_gone'], 2100), 'unknown matches are dropped');
    eq('playing', $w['crew']->byUid($crewUids[0])['status']);

    $ranked = [['uid' => $crewUids[0], 'points' => 900], ['uid' => 'admin1', 'points' => 900], ['uid' => $crewUids[1], 'points' => 100]];
    eq(true, $w['mm']->gameEnded($matchId, 'quickTap', $ranked, 3000), 'stays for another game');
    $c0 = $w['crew']->byUid($crewUids[0]);
    eq('1/0/1', implode('/', array_map('intval', array_values($w['db']->one("SELECT played, wins, draws FROM crew_stats WHERE crew_id = ? AND game_id = 'quickTap'", [$c0['id']])))), 'a shared first place is a draw');
    eq(false, $w['mm']->gameEnded($matchId, 'quickTap', $ranked, 4000), 'after the last game they leave');
    eq('ended', $w['db']->one('SELECT status FROM matches WHERE id = ?', [$matchId])['status']);
    eq(['admin1'], array_keys($w['rtdb']->data['rooms']['AAAAAA']['players']), 'crew are taken out of the room');
    eq(false, isset($w['rtdb']->data['crewRuns'][$matchId]));
    eq('available', $w['crew']->byUid($crewUids[0])['status']);
    eq([$matchId], $w['mm']->heartbeat(77, [$matchId], 5000));
    eq(false, $w['mm']->gameEnded($matchId, 'quickTap', $ranked, 5000), 'nothing is recorded after the end');
});

test('match: the internal runner addresses need the shared secret', function () {
    $w = crewWorld();
    $hb = fn (string $s) => $w['routes']->handle(req('POST', '/internal/crew/heartbeat', ['json' => ['pid' => 5, 'matches' => []], 'headers' => ['x-crew-secret' => $s]]));
    eq(403, $hb('wrong')->status);
    eq(403, $hb('')->status);
    $ok = $hb(CREW_SECRET);
    eq(200, $ok->status);
    eq('admins', $ok->body['settings']['mode']);
    $short = crewWorld(['crew' => ['runner_secret' => 'short']]);
    eq(403, $short['routes']->handle(req('POST', '/internal/crew/heartbeat', ['json' => [], 'headers' => ['x-crew-secret' => 'short']]))->status, 'a weak secret is refused');
});

test('match: the runner is started once, and not while it is alive', function () {
    $w = crewWorld();
    eq(true, $w['runner']->ensure(1000));
    eq(false, $w['runner']->ensure(2000), 'still starting');
    eq(true, $w['runner']->ensure(1000 + 16_000), 'it never checked in: try again');
    $w['runner']->beat(9, [], 20_000);
    eq(false, $w['runner']->ensure(25_000), 'alive');
    $w['runner']->stopped(9);
    eq(true, $w['runner']->ensure(40_000));
    eq(3, count($w['spawns']));
});

test('match: the Quick Match addresses work end to end', function () {
    $w = crewWorld();
    $w['crew']->seed(2);
    crewSettings($w, ['fallbackSeconds' => 0]);
    openRoom($w, 'AAAAAA', 'admin1');
    $tok = idToken(['sub' => 'admin1']);
    eq(401, $w['routes']->handle(req('POST', '/match/queue', ['json' => []]))->status);
    $q = $w['routes']->handle(req('POST', '/match/queue', ['token' => $tok, 'json' => ['gameId' => 'letterRush', 'roomCode' => 'AAAAAA']]));
    eq(200, $q->status);
    $id = $q->body['ticket'];
    $p = $w['routes']->handle(req('GET', '/match/ticket/' . $id, ['token' => $tok]));
    eq('matched', $p->body['status'], 'an admin gets crew in admins-only mode');
    eq(200, $w['routes']->handle(req('POST', '/match/ticket/' . $id . '/cancel', ['token' => $tok]))->status);
    eq(200, $w['routes']->handle(req('POST', '/presence', ['token' => $tok]))->status);
});

echo "\nFriends\n";

function friendsWorld(): array
{
    $w = crewWorld();
    foreach (['alice', 'bobby', 'carol'] as $n) indexHuman($w, $n . '_uid', $n);
    $w['tariro'] = $w['crew']->create(['displayName' => 'Tariro', 'username' => 'tariro', 'avatar' => 'amara'], null);
    return $w;
}

test('friends: request, duplicate, accept, remove', function () {
    $w = friendsWorld();
    $f = $w['friends'];
    eq('sent', $f->request(human('alice_uid'), ['username' => 'bobby'], 1));
    throwsHttp(409, fn () => $f->request(human('alice_uid'), ['uid' => 'bobby_uid'], 2));
    eq('sent', $f->overview('alice_uid', 3)['sent'][0]['username'] === 'bobby' ? 'sent' : 'no');
    eq('bobby', $f->overview('bobby_uid', 3)['incoming'] ? 'bobby' : 'none');
    $f->respond(human('bobby_uid'), 'alice_uid', true, 4);
    eq('bobby', $f->overview('alice_uid', 5)['friends'][0]['username']);
    throwsHttp(409, fn () => $f->request(human('bobby_uid'), ['uid' => 'alice_uid'], 6));
    $f->remove(human('bobby_uid'), 'alice_uid');
    eq([], $f->overview('alice_uid', 7)['friends']);
    throwsHttp(400, fn () => $f->request(human('alice_uid'), ['uid' => 'alice_uid'], 8));
    throwsHttp(404, fn () => $f->request(human('alice_uid'), ['uid' => 'nobody_here'], 8));
    throwsHttp(403, fn () => $f->request(human('anon_uid1', ['provider' => 'anonymous']), ['uid' => 'alice_uid'], 8));
});

test('friends: asking someone who already asked you makes you friends; declining removes it', function () {
    $w = friendsWorld();
    $f = $w['friends'];
    $f->request(human('alice_uid'), ['uid' => 'bobby_uid'], 1);
    eq('accepted', $f->request(human('bobby_uid'), ['uid' => 'alice_uid'], 2));
    $f->request(human('carol_uid'), ['uid' => 'alice_uid'], 3);
    $f->respond(human('alice_uid'), 'carol_uid', false, 4);
    eq([], $f->overview('carol_uid', 5)['sent'], 'a decline just disappears');
    throwsHttp(404, fn () => $f->respond(human('alice_uid'), 'carol_uid', true, 6));
});

test('friends: a request to a crew player looks normal, then quietly fades, never accepted', function () {
    $w = friendsWorld();
    $f = $w['friends'];
    $tid = $w['tariro']['uid'];
    eq('sent', $f->request(human('alice_uid'), ['username' => 'tariro'], 1000));
    $f->request(human('alice_uid'), ['uid' => 'bobby_uid'], 1000);
    $sent = $f->overview('alice_uid', 2000)['sent'];
    eq(2, count($sent));
    eq(array_keys($sent[0]), array_keys($sent[1]), 'crew and real players have the same fields');
    $row = $w['db']->one('SELECT decline_at FROM friendships WHERE requested_by = ? AND (user_a = ? OR user_b = ?)', ['alice_uid', $tid, $tid]);
    $hours = $w['crew']->settings()['declineHours'];
    eq(true, (int) $row['decline_at'] >= 1000 + $hours[0] * 3_600_000 && (int) $row['decline_at'] <= 1000 + $hours[1] * 3_600_000);
    eq(['bobby'], array_column($f->overview('alice_uid', 1000 + $hours[1] * 3_600_000 + 1)['sent'], 'username'));
    eq('sent', $f->request(human('alice_uid'), ['uid' => $tid], 2), 'asking again is allowed, like any player');
});

test('friends: blocking removes the friendship and stops requests, invites and profiles', function () {
    $w = friendsWorld();
    $f = $w['friends'];
    $f->request(human('alice_uid'), ['uid' => 'bobby_uid'], 1);
    $f->respond(human('bobby_uid'), 'alice_uid', true, 2);
    $f->block(human('bobby_uid'), 'alice_uid', 3);
    eq([], $f->overview('alice_uid', 4)['friends']);
    throwsHttp(403, fn () => $f->request(human('alice_uid'), ['uid' => 'bobby_uid'], 5));
    throwsHttp(403, fn () => $f->request(human('bobby_uid'), ['uid' => 'alice_uid'], 5));
    throwsHttp(404, fn () => $f->profile('alice_uid', 'bobby_uid', 5));
    eq('blocked', $f->profile('bobby_uid', 'alice_uid', 5)['relation']);
    eq(['alice'], array_column($f->overview('bobby_uid', 6)['blocked'], 'username'));
    $f->unblock(human('bobby_uid'), 'alice_uid');
    eq('sent', $f->request(human('alice_uid'), ['uid' => 'bobby_uid'], 7));
});

test('friends: recently played only counts rooms you were in, and lists crew like anyone', function () {
    $w = friendsWorld();
    $f = $w['friends'];
    $tid = $w['tariro']['uid'];
    $w['rtdb']->data['rooms']['ROOM22'] = ['meta' => ['gameId' => 'quickTap'], 'players' => ['alice_uid' => ['name' => 'A'], 'bobby_uid' => ['name' => 'B'], $tid => ['name' => 'T']]];
    throwsHttp(403, fn () => $f->played(human('carol_uid'), 'ROOM22', 1));
    eq(2, $f->played(human('alice_uid'), 'room22', 10));
    eq(2, $f->played(human('alice_uid'), 'ROOM22', 20), 'a repeat updates, never duplicates');
    $recent = $f->overview('alice_uid', 30)['recent'];
    eq(2, count($recent));
    eq(['quickTap', 20, 'none'], [$recent[0]['gameId'], $recent[0]['playedAt'], $recent[0]['relation']]);
    eq(array_keys($recent[0]), array_keys($recent[1]));
});

test('friends: search and profiles treat crew and real players the same and hide private data', function () {
    $w = friendsWorld();
    $f = $w['friends'];
    $w['crew']->create(['displayName' => 'Bobbie', 'username' => 'bobbie', 'avatar' => 'fox'], null);
    $found = $f->search('alice_uid', 'bob', 1);
    eq(['bobbie', 'bobby'], array_column($found, 'username'));
    eq(array_keys($found[0]), array_keys($found[1]));
    $json = json_encode($found);
    eq(false, str_contains($json, '@example.com'), 'no emails');
    foreach (['crew', 'persona', 'personality', 'skill', 'status'] as $word) eq(false, str_contains($json, $word), "no '$word' in search results");
    $human = $f->profile('alice_uid', 'bobby_uid', 1);
    $crew = $f->profile('alice_uid', $w['tariro']['uid'], 1);
    eq(array_keys($human), array_keys($crew));
    eq([], $f->search('alice_uid', 'b', 1), 'too short');
});

test('friends: invites only between friends, into a room you are in', function () {
    $w = friendsWorld();
    $f = $w['friends'];
    $w['rtdb']->data['rooms']['ROOM22'] = ['meta' => [], 'players' => ['alice_uid' => ['name' => 'A']]];
    throwsHttp(403, fn () => $f->invite(human('alice_uid'), 'bobby_uid', 'ROOM22', 1));
    $f->request(human('alice_uid'), ['uid' => 'bobby_uid'], 1);
    $f->respond(human('bobby_uid'), 'alice_uid', true, 2);
    throwsHttp(403, fn () => $f->invite(human('bobby_uid'), 'alice_uid', 'ROOM22', 3));
    $f->invite(human('alice_uid'), 'bobby_uid', 'ROOM22', 3);
    $inv = $f->overview('bobby_uid', 4)['invites'];
    eq(['ROOM22', 'alice'], [$inv[0]['roomCode'], $inv[0]['from']['username']]);
    eq([], $f->overview('bobby_uid', 3 + 11 * 60_000)['invites'], 'invites expire');
});

test('friends: the addresses need a sign-in and answer with the lists', function () {
    $w = friendsWorld();
    eq(401, $w['routes']->handle(req('GET', '/friends'))->status);
    $tok = idToken(['sub' => 'alice_uid']);
    eq('sent', $w['routes']->handle(req('POST', '/friends/request', ['token' => $tok, 'json' => ['username' => 'bobby']]))->body['result']);
    $o = $w['routes']->handle(req('GET', '/friends', ['token' => $tok]));
    eq(['friends', 'incoming', 'sent', 'recent', 'invites', 'blocked'], array_keys($o->body));
    eq(1, count($w['routes']->handle(req('GET', '/players/search', ['token' => $tok, 'query' => ['q' => 'tar']]))->body['players']));
    eq(404, $w['routes']->handle(req('POST', '/friends/nope', ['token' => $tok, 'json' => []]))->status);
});

echo "\nAI providers\n";

test('ai: with no provider, drafting a player still works (built-in)', function () {
    $w = crewWorld();
    $d = $w['ai']->draftPlayer([], $w['crew']);
    eq('built-in', $d['source']);
    eq(0, count($w['http']->calls));
    $p = $w['crew']->create($d, 'admin1');
    eq($d['username'], $p['username'], 'a draft can be saved as it is');
});

test('ai: keys are encrypted, never returned, and need the server secret', function () {
    $w = crewWorld();
    $id = $w['ai']->saveProvider(['vendor' => 'deepseek', 'kind' => 'text', 'apiKey' => 'sk-super-secret-123'], 1);
    $row = $w['db']->one('SELECT api_key_enc, model, base_url FROM ai_providers WHERE id = ?', [$id]);
    eq(false, str_contains((string) $row['api_key_enc'], 'sk-super-secret-123'));
    eq(['deepseek-flash', 'https://api.deepseek.com'], [$row['model'], $row['base_url']]);
    $tok = idToken(['sub' => 'admin1']);
    $res = $w['routes']->handle(req('GET', '/admin/ai', ['token' => $tok]));
    eq(true, $res->body['providers'][0]['hasKey']);
    eq(false, str_contains(json_encode($res->body), 'sk-super-secret'));
    eq(403, $w['routes']->handle(req('GET', '/admin/ai', ['token' => idToken(['sub' => 'alice'])]))->status);
    $w['ai']->saveProvider(['id' => $id, 'name' => 'Main'], 2);
    eq(true, $w['ai']->providers()[0]['hasKey'], 'editing without a key keeps it');
    throwsHttp(400, fn () => $w['ai']->saveProvider(['vendor' => 'openai', 'kind' => 'text', 'apiKey' => 'x'], 3));
    throwsHttp(400, fn () => $w['ai']->saveProvider(['vendor' => 'openai_compatible', 'baseUrl' => 'http://insecure.test', 'model' => 'm'], 3));
    $noSecret = crewWorld(['ai' => ['secret_key' => '']]);
    throwsHttp(503, fn () => $noSecret['ai']->saveProvider(['vendor' => 'deepseek', 'apiKey' => 'k'], 1));
    eq('vx', $w['ai']->saveProvider(['vendor' => 'other', 'kind' => 'voice', 'name' => 'Voice', 'baseUrl' => 'https://voice.example'], 4) ? 'vx' : '');
});

test('ai: a good answer is used, sent with the key and counted', function () {
    $w = crewWorld();
    $w['ai']->saveProvider(['vendor' => 'deepseek', 'apiKey' => 'sk-abc'], 1);
    $traits = array_fill_keys(Crew::TRAITS, 60);
    $w['http']->replies[] = FakeHttp::chat(['displayName' => 'Rumbi K', 'username' => 'rumbi_k', 'bio' => 'Hi.', 'personality' => $traits]);
    $d = $w['ai']->draftPlayer(['idea' => 'loves quizzes'], $w['crew']);
    eq(['ai', 'Rumbi K', 'rumbi_k'], [$d['source'], $d['displayName'], $d['username']]);
    $call = $w['http']->calls[0];
    eq('https://api.deepseek.com/chat/completions', $call['url']);
    eq(true, in_array('Authorization: Bearer sk-abc', $call['headers'], true));
    eq('json_object', json_decode($call['body'], true)['response_format']['type']);
    eq(['requests' => 1, 'tokens' => 42, 'failures' => 0], $w['ai']->providers()[0]['today']);
});

test('ai: slow, failing, wrong or over-limit answers fall back without breaking anything', function () {
    $w = crewWorld();
    $id = $w['ai']->saveProvider(['vendor' => 'deepseek', 'apiKey' => 'sk-abc', 'dailyLimit' => 3], 1);
    $w['http']->replies[] = new RuntimeException('Request to api.deepseek.com failed: Operation timed out');
    eq('built-in', $w['ai']->draftPlayer([], $w['crew'])['source'], 'timeout');
    $w['http']->replies[] = FakeHttp::chat(['displayName' => '', 'username' => 'BAD NAME']);
    eq('built-in', $w['ai']->draftPlayer([], $w['crew'])['source'], 'invalid output');
    $w['http']->replies[] = [500, null, 'oops'];
    eq('built-in', $w['ai']->draftPlayer([], $w['crew'])['source'], 'server error');
    eq(3, count($w['http']->calls));
    eq('built-in', $w['ai']->draftPlayer([], $w['crew'])['source'], 'over the daily limit: not even asked');
    eq(3, count($w['http']->calls));
    eq(['requests' => 3, 'tokens' => 42, 'failures' => 3], $w['ai']->providers()[0]['today']);
    $w['ai']->saveProvider(['id' => $id, 'enabled' => false, 'dailyLimit' => 100], 2);
    eq('built-in', $w['ai']->draftPlayer([], $w['crew'])['source'], 'switched off');
    eq(3, count($w['http']->calls));
});

test('ai: test connection reports without leaking the key', function () {
    $w = crewWorld();
    $id = $w['ai']->saveProvider(['vendor' => 'deepseek', 'apiKey' => 'sk-leaky'], 1);
    $w['http']->replies[] = new RuntimeException('bad things with sk-leaky inside');
    $r = $w['ai']->test($id);
    eq(false, $r['ok']);
    eq(false, str_contains($r['message'], 'sk-leaky'));
    $w['http']->replies[] = FakeHttp::chat(['ok' => true]);
    eq(true, $w['ai']->test($id)['ok']);
});

test('admin: the crew page needs an admin and shows players, settings and the runner', function () {
    $w = crewWorld();
    $w['crew']->seed(2);
    eq(403, $w['routes']->handle(req('GET', '/admin/crew', ['token' => idToken(['sub' => 'alice'])]))->status);
    $tok = idToken(['sub' => 'admin1']);
    $o = $w['routes']->handle(req('GET', '/admin/crew', ['token' => $tok]));
    eq(2, count($o->body['players']));
    eq(false, $o->body['runner']['alive']);
    $s = $w['routes']->handle(req('POST', '/admin/crew/settings', ['token' => $tok, 'json' => ['mode' => 'everyone']]));
    eq('everyone', $s->body['settings']['mode']);
    $made = $w['routes']->handle(req('POST', '/admin/crew/player', ['token' => $tok, 'json' => ['displayName' => 'New One', 'username' => 'new_one', 'avatar' => 'fox']]));
    eq('new_one', $made->body['player']['username']);
    $id = $made->body['player']['id'];
    eq('Renamed', $w['routes']->handle(req('POST', '/admin/crew/player', ['token' => $tok, 'json' => ['id' => $id, 'displayName' => 'Renamed']]))->body['player']['displayName']);
    eq(false, $w['routes']->handle(req('POST', '/admin/crew/player/enable', ['token' => $tok, 'json' => ['id' => $id, 'enabled' => false]]))->body['player']['enabled']);
    eq('built-in', $w['routes']->handle(req('POST', '/admin/crew/draft', ['token' => $tok, 'json' => []]))->body['draft']['source']);
});
