<?php
/* Logo Rush online: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\LogoRush;

echo "\nLogo Rush\n";

/** A lobby room with $n players who all said ready for a Logo Rush pick. */
function lrRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'logoRush', 'settings' => $settings]],
        'players' => $players,
    ];
}

function lrStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/logorush/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function lrInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('logorush: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    lrRoom($w, 'LRAA', 3);
    eq(403, lrStart($w, 'LRAA', [], 'guest2')->status, 'not the host');
    eq(400, lrStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['LRAA']['meta']['pick']['gameId'] = 'geoSpin';
    eq('no-pick', lrStart($w, 'LRAA')->body['error'], 'a different game was picked');
    lrRoom($w, 'LRAB', 1);
    eq('too-few', lrStart($w, 'LRAB')->body['error']);
    lrRoom($w, 'LRAC', 9);
    eq('too-many', lrStart($w, 'LRAC')->body['error']);
    lrRoom($w, 'LRAD', 3);
    $w['rtdb']->data['rooms']['LRAD']['players']['guest3']['ready'] = null;
    eq('not-ready', lrStart($w, 'LRAD')->body['error']);
});

test('logorush: settings out of range are refused; the PHP lists match FF.LogoRushRules', function () {
    $w = crewWorld();
    lrRoom($w, 'LRAE', 2);
    foreach ([['level' => 'expert'], ['mode' => 'say'], ['mode' => 'type'], ['time' => 'none'], ['twist' => 'spin'], ['rounds' => 5],
        ['cats' => ['mars']], ['cats' => 'food'], ['cats' => []]] as $bad) {
        eq('bad-settings', lrStart($w, 'LRAE', ['settings' => $bad])->body['error'] ?? null, json_encode($bad));
    }
    eq(['level' => 'normal', 'cats' => 'mixed', 'mode' => 'tiles', 'time' => 'normal', 'twist' => 'none', 'rounds' => 10], LogoRush::settings([]));
    eq(['africa', 'cars'], LogoRush::settings(['cats' => ['cars', 'africa', 'cars']])['cats'], 'sorted, no repeats');
    eq('choice', LogoRush::settings(['mode' => 'choice'])['mode']);
    eq(15, LogoRush::settings(['rounds' => '15'])['rounds']);
    $js = file_get_contents(__DIR__ . '/../../js/logorush/rules.js');
    $words = function (string $name) use ($js) {
        eq(1, preg_match('/var ' . $name . " = \\[([^\\]]+)\\]/", $js, $m), $name);
        return array_map(fn ($s) => trim($s, " '"), explode(',', $m[1]));
    };
    eq(LogoRush::LEVELS, $words('LEVELS'));
    eq(LogoRush::MODES, $words('ROOM_MODES'));
    eq(LogoRush::CATS, $words('CATS'));
    eq(LogoRush::TIMES, array_values(array_diff($words('TIMES'), ['none'])));
    eq(LogoRush::TWISTS, $words('TWISTS'));
    eq(LogoRush::ROUNDS, array_map('intval', $words('ROUNDS')));
    eq(1, preg_match('/var MAX_PLAYERS = (\d+)/', $js, $mx));
    eq(LogoRush::MAX_PLAYERS, (int) $mx[1]);
    eq(1, preg_match('/var MIN_PLAYERS = (\d+)/', $js, $mn));
    eq(LogoRush::MIN_PLAYERS, (int) $mn[1]);
});

test('logorush: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    lrRoom($w, 'LRAF', 3, ['level' => 'hard', 'cats' => ['football'], 'mode' => 'choice', 'rounds' => 15]);
    $w['rtdb']->data['rooms']['LRAF']['lr'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['LRAF']['lrInbox'] = ['host1' => ['x' => 1]];
    $res = lrStart($w, 'LRAF');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^l_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('logorushRuns/' . $id);
    eq('LRAF', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['level' => 'hard', 'cats' => ['football'], 'mode' => 'choice', 'time' => 'normal', 'twist' => 'none', 'rounds' => 15], $run['settings']);
    eq(1, preg_match('/^[0-9a-f]{24}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/LRAF');
    eq('playing', $room['meta']['status']);
    eq('logoRush', $room['meta']['gameId']);
    eq($id, $room['meta']['lrMatch']);
    eq(false, isset($room['lr']), 'the old view is cleared');
    eq(false, isset($room['lrInbox']));
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    $row = $w['db']->one('SELECT status, cats, mode FROM logorush_matches WHERE id = ?', [$id]);
    eq(['active', 'football', 'choice'], [$row['status'], $row['cats'], $row['mode']]);
});

test('logorush: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    lrRoom($w, 'LRAG', 2);
    $id = lrStart($w, 'LRAG')->body['matchId'];
    $w['rtdb']->set('logorushState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'logorush', 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 2400, 'correct' => 9, 'best' => 7, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 800, 'correct' => 4, 'best' => 2, 'won' => false],
    ]];
    eq(200, lrInternal($w, 'report', $body)->status);
    eq(200, lrInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM logorush_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, correct, best_streak, won FROM logorush_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 2400, 9, 7, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['correct'], (int) $seats[1]['best_streak'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('logorushRuns/' . $id));
    eq(null, $w['rtdb']->get('logorushState/' . $id));
    $hb = lrInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'logorush' => [$id, 'l_unknown']]);
    eq([$id, 'l_unknown'], $hb->body['dropLogorush'], 'the runner lets go of finished matches');

    lrRoom($w, 'LRAH', 2);
    $id2 = lrStart($w, 'LRAH')->body['matchId'];
    lrInternal($w, 'report', ['matchId' => $id2, 'event' => 'logorush', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 900, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM logorush_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('logorush: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    lrRoom($w, 'LRAJ', 2);
    $id = lrStart($w, 'LRAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->logorush()->nudge(human('host1'), ['roomCode' => 'LRAJ'], $now);
    $w['rtdb']->data['rooms']['LRAJ']['lr'] = ['phase' => 'open', 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['rtdb']->data['rooms']['LRAJ']['lr'] = ['phase' => 'ready', 'openAt' => 5000];
    eq(false, $nudge(6000)['started'], 'ready is a phase too');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/logorush/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'LRAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->logorush()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM logorush_matches WHERE id = ?', [$id])['status']);
});
