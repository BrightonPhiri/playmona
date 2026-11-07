<?php
/* Ball Swap: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\BallSwap;

echo "\nBall Swap\n";

/** A lobby room with $n players who all said ready for a Ball Swap pick. */
function bsRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'ballSwap', 'settings' => $settings]],
        'players' => $players,
    ];
}

function bsStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/ballswap/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function bsInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('ballswap: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    bsRoom($w, 'BSAA', 3);
    eq(403, bsStart($w, 'BSAA', [], 'guest2')->status, 'not the host');
    eq(400, bsStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['BSAA']['meta']['status'] = 'playing';
    eq(409, bsStart($w, 'BSAA')->status, 'already playing');
    $w['rtdb']->data['rooms']['BSAA']['meta']['status'] = 'lobby';
    $w['rtdb']->data['rooms']['BSAA']['meta']['pick']['gameId'] = 'wordFlow';
    eq('no-pick', bsStart($w, 'BSAA')->body['error'], 'a different game was picked');
});

test('ballswap: one player, nine, or someone not ready, cannot start', function () {
    $w = crewWorld();
    bsRoom($w, 'BSAB', 1);
    eq('too-few', bsStart($w, 'BSAB')->body['error']);
    bsRoom($w, 'BSAG', 9);
    eq('too-many', bsStart($w, 'BSAG')->body['error']);
    bsRoom($w, 'BSAC', 3);
    $w['rtdb']->data['rooms']['BSAC']['players']['guest3']['ready'] = null;
    eq('not-ready', bsStart($w, 'BSAC')->body['error']);
});

test('ballswap: settings out of range are refused; good ones are kept', function () {
    $w = crewWorld();
    bsRoom($w, 'BSAD', 2);
    foreach ([['level' => 'insane'], ['colours' => 9], ['seconds' => 7], ['mistakes' => 2], ['show' => 'never']] as $bad) {
        eq(400, bsStart($w, 'BSAD', ['settings' => $bad])->status, json_encode($bad));
    }
    eq(['level' => 'medium', 'colours' => 2, 'seconds' => 90, 'mistakes' => 3, 'show' => 'always'], BallSwap::settings([]));
    eq(['level' => 'expert', 'colours' => 5, 'seconds' => 180, 'mistakes' => -1, 'show' => 'start'],
        BallSwap::settings(['level' => 'expert', 'colours' => '5', 'seconds' => 180, 'mistakes' => '-1', 'show' => 'start']));
});

test('ballswap: a start hands the match to the runner and opens the room', function () {
    $w = crewWorld();
    bsRoom($w, 'BSAE', 3, ['level' => 'hard', 'colours' => 3]);
    $w['rtdb']->data['rooms']['BSAE']['bs'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['BSAE']['bsInbox'] = ['host1' => ['x' => 1]];
    $res = bsStart($w, 'BSAE');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^b_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('ballswapRuns/' . $id);
    eq('BSAE', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq('hard', $run['settings']['level']);
    eq(3, $run['settings']['colours']);
    $room = $w['rtdb']->get('rooms/BSAE');
    eq('playing', $room['meta']['status']);
    eq('ballSwap', $room['meta']['gameId']);
    eq($id, $room['meta']['bsMatch']);
    eq(false, isset($room['bs']), 'the old view is cleared');
    eq(false, isset($room['bsInbox']));
    eq(1, count($w['spawns']), 'the runner is started');
    eq('active', $w['db']->one('SELECT status FROM ballswap_matches WHERE id = ?', [$id])['status']);
});

test('ballswap: the result is kept once, and the run is cleared', function () {
    $w = crewWorld();
    bsRoom($w, 'BSAF', 2);
    $id = bsStart($w, 'BSAF')->body['matchId'];
    $w['rtdb']->set('ballswapState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'ballswap', 'need' => 6, 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 700, 'swaps' => 6, 'mistakes' => 0, 'done' => true, 'out' => false, 'used' => 21000, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 80, 'swaps' => 4, 'mistakes' => 4, 'done' => false, 'out' => true, 'used' => 0, 'won' => false],
    ]];
    eq(200, bsInternal($w, 'report', $body)->status);
    eq(200, bsInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM ballswap_matches WHERE id = ?', [$id]);
    eq(['ended', 6, 'host1', 0], [$m['status'], (int) $m['need'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, knocked_out, used_ms, won FROM ballswap_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['guest2', 2, 1, 0], [$seats[0]['uid'], (int) $seats[0]['place'], (int) $seats[0]['knocked_out'], (int) $seats[0]['won']]);
    eq(21000, (int) $seats[1]['used_ms']);
    eq(null, $w['rtdb']->get('ballswapRuns/' . $id));
    eq(null, $w['rtdb']->get('ballswapState/' . $id));
    $hb = bsInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'ballswap' => [$id, 'b_unknown']]);
    eq([$id, 'b_unknown'], $hb->body['dropBallswap'], 'the runner lets go of finished matches');
});

test('ballswap: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    bsRoom($w, 'BSAJ', 2);
    $id = bsStart($w, 'BSAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->ballswap()->nudge(human('host1'), ['roomCode' => 'BSAJ'], $now);
    $w['rtdb']->data['rooms']['BSAJ']['bs'] = ['phase' => 'playing', 'deadline' => 90000, 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/ballswap/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'BSAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->ballswap()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM ballswap_matches WHERE id = ?', [$id])['status']);
});
