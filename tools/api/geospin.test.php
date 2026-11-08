<?php
/* GeoSpin: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\GeoSpin;

echo "\nGeoSpin\n";

/** A lobby room with $n players who all said ready for a GeoSpin pick. */
function gsRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'geoSpin', 'settings' => $settings]],
        'players' => $players,
    ];
}

function gsStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/geospin/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function gsInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('geospin: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    gsRoom($w, 'GSAA', 3);
    eq(403, gsStart($w, 'GSAA', [], 'guest2')->status, 'not the host');
    eq(400, gsStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['GSAA']['meta']['pick']['gameId'] = 'sortRush';
    eq('no-pick', gsStart($w, 'GSAA')->body['error'], 'a different game was picked');
    gsRoom($w, 'GSAB', 1);
    eq('too-few', gsStart($w, 'GSAB')->body['error']);
    gsRoom($w, 'GSAC', 9);
    eq('too-many', gsStart($w, 'GSAC')->body['error']);
    gsRoom($w, 'GSAD', 3);
    $w['rtdb']->data['rooms']['GSAD']['players']['guest3']['ready'] = null;
    eq('not-ready', gsStart($w, 'GSAD')->body['error']);
});

test('geospin: settings out of range are refused; the PHP lists match FF.GeoSpinRules', function () {
    $w = crewWorld();
    gsRoom($w, 'GSAE', 2);
    foreach ([['level' => 'insane'], ['region' => 'mars'], ['rounds' => 7], ['mode' => 'guess']] as $bad) {
        eq(400, gsStart($w, 'GSAE', ['settings' => $bad])->status, json_encode($bad));
    }
    eq(['level' => 'normal', 'region' => 'world', 'rounds' => 10, 'mode' => 'write'], GeoSpin::settings([]));
    eq('choice', GeoSpin::settings(['mode' => 'choice'])['mode']);
    eq(15, GeoSpin::settings(['rounds' => '15'])['rounds']);
    $js = file_get_contents(__DIR__ . '/../../js/geospin/rules.js');
    eq(1, preg_match("/var LEVELS = \\[([^\\]]+)\\]/", $js, $l));
    eq(GeoSpin::LEVELS, array_map(fn ($s) => trim($s, " '"), explode(',', $l[1])));
    eq(1, preg_match("/var REGIONS = \\[([^\\]]+)\\]/", $js, $r));
    eq(GeoSpin::REGIONS, array_map(fn ($s) => trim($s, " '"), explode(',', $r[1])));
    eq(1, preg_match('/var ROUNDS = \\[([0-9, ]+)\\]/', $js, $n));
    eq(GeoSpin::ROUNDS, array_map('intval', explode(',', $n[1])));
    eq(1, preg_match("/var MODES = \\[([^\\]]+)\\]/", $js, $m));
    eq(GeoSpin::MODES, array_map(fn ($s) => trim($s, " '"), explode(',', $m[1])));
});

test('geospin: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    gsRoom($w, 'GSAF', 3, ['level' => 'hard', 'region' => 'africa', 'rounds' => 5]);
    $w['rtdb']->data['rooms']['GSAF']['gs'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['GSAF']['gsInbox'] = ['host1' => ['x' => 1]];
    $res = gsStart($w, 'GSAF');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^g_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('geospinRuns/' . $id);
    eq('GSAF', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['level' => 'hard', 'region' => 'africa', 'rounds' => 5, 'mode' => 'write'], $run['settings']);
    eq(1, preg_match('/^[0-9a-f]{24}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/GSAF');
    eq('playing', $room['meta']['status']);
    eq('geoSpin', $room['meta']['gameId']);
    eq($id, $room['meta']['gsMatch']);
    eq(false, isset($room['gs']), 'the old view is cleared');
    eq(false, isset($room['gsInbox']));
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    eq('active', $w['db']->one('SELECT status FROM geospin_matches WHERE id = ?', [$id])['status']);
});

test('geospin: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    gsRoom($w, 'GSAG', 2);
    $id = gsStart($w, 'GSAG')->body['matchId'];
    $w['rtdb']->set('geospinState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'geospin', 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 2400, 'correct' => 9, 'best' => 7, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 800, 'correct' => 4, 'best' => 2, 'won' => false],
    ]];
    eq(200, gsInternal($w, 'report', $body)->status);
    eq(200, gsInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM geospin_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, correct, best_streak, won FROM geospin_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 2400, 9, 7, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['correct'], (int) $seats[1]['best_streak'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('geospinRuns/' . $id));
    eq(null, $w['rtdb']->get('geospinState/' . $id));
    $hb = gsInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'geospin' => [$id, 'g_unknown']]);
    eq([$id, 'g_unknown'], $hb->body['dropGeospin'], 'the runner lets go of finished matches');

    gsRoom($w, 'GSAH', 2);
    $id2 = gsStart($w, 'GSAH')->body['matchId'];
    gsInternal($w, 'report', ['matchId' => $id2, 'event' => 'geospin', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 900, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM geospin_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('geospin: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    gsRoom($w, 'GSAJ', 2);
    $id = gsStart($w, 'GSAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->geospin()->nudge(human('host1'), ['roomCode' => 'GSAJ'], $now);
    $w['rtdb']->data['rooms']['GSAJ']['gs'] = ['phase' => 'open', 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/geospin/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'GSAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->geospin()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM geospin_matches WHERE id = ?', [$id])['status']);
});
