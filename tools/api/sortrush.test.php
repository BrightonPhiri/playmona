<?php
/* SortRush: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\SortRush;

echo "\nSortRush\n";

/** A lobby room with $n players who all said ready for a SortRush pick. */
function srRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'sortRush', 'settings' => $settings]],
        'players' => $players,
    ];
}

function srStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/sortrush/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function srInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('sortrush: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    srRoom($w, 'SRAA', 3);
    eq(403, srStart($w, 'SRAA', [], 'guest2')->status, 'not the host');
    eq(400, srStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['SRAA']['meta']['status'] = 'playing';
    eq(409, srStart($w, 'SRAA')->status, 'already playing');
    $w['rtdb']->data['rooms']['SRAA']['meta']['status'] = 'lobby';
    $w['rtdb']->data['rooms']['SRAA']['meta']['pick']['gameId'] = 'ballSwap';
    eq('no-pick', srStart($w, 'SRAA')->body['error'], 'a different game was picked');
});

test('sortrush: one player, nine, or someone not ready, cannot start', function () {
    $w = crewWorld();
    srRoom($w, 'SRAB', 1);
    eq('too-few', srStart($w, 'SRAB')->body['error']);
    srRoom($w, 'SRAG', 9);
    eq('too-many', srStart($w, 'SRAG')->body['error']);
    srRoom($w, 'SRAC', 3);
    $w['rtdb']->data['rooms']['SRAC']['players']['guest3']['ready'] = null;
    eq('not-ready', srStart($w, 'SRAC')->body['error']);
});

test('sortrush: settings out of range are refused; good ones are kept and fixed like the rules do', function () {
    $w = crewWorld();
    srRoom($w, 'SRAD', 2);
    foreach ([['mode' => 'chaos'], ['style' => 'cups'], ['move' => 'all'], ['level' => 'insane'], ['colours' => 11], ['size' => 9], ['empty' => 0], ['seconds' => 7], ['limit' => 'none']] as $bad) {
        eq(400, srStart($w, 'SRAD', ['settings' => $bad])->status, json_encode($bad));
    }
    eq(['mode' => 'race', 'style' => 'balls', 'move' => 'single', 'level' => 'medium', 'colours' => 6, 'size' => 4, 'empty' => 2, 'seconds' => 120, 'limit' => 'off'], SortRush::settings([]));
    $hard = SortRush::settings(['level' => 'hard', 'colours' => 3]);
    eq([8, 4, 2], [$hard['colours'], $hard['size'], $hard['empty']], 'a level decides the board');
    $big = SortRush::settings(['level' => 'custom', 'colours' => '10', 'size' => 6, 'empty' => 1, 'mode' => 'score', 'limit' => 'tight']);
    eq([10, 6, 2, 'score', 'tight'], [$big['colours'], $big['size'], $big['empty'], $big['mode'], $big['limit']], 'one empty holder only on small boards');
    eq(1, SortRush::settings(['level' => 'custom', 'colours' => 4, 'size' => 4, 'empty' => 1])['empty']);
});

test('sortrush: the PHP settings agree with FF.SortRushRules on every combination', function () {
    $js = file_get_contents(__DIR__ . '/../../js/sortrush/rules.js');
    eq(1, preg_match('/ONE_EMPTY_MAX = (\d+)/', $js, $m));
    eq(24, (int) $m[1], 'same single-empty limit');
    eq(1, preg_match("/easy: \{ colours: (\d+), size: (\d+), empty: (\d+) \}/", $js, $e));
    eq(SortRush::PRESETS['easy'], [(int) $e[1], (int) $e[2], (int) $e[3]]);
    eq(1, preg_match("/expert: \{ colours: (\d+), size: (\d+), empty: (\d+) \}/", $js, $x));
    eq(SortRush::PRESETS['expert'], [(int) $x[1], (int) $x[2], (int) $x[3]]);
    eq(1, preg_match('/var SECONDS = \[([0-9, ]+)\]/', $js, $s));
    eq(SortRush::SECONDS, array_map('intval', explode(',', $s[1])));
});

test('sortrush: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    srRoom($w, 'SRAE', 3, ['level' => 'hard', 'mode' => 'score', 'style' => 'nuts']);
    $w['rtdb']->data['rooms']['SRAE']['sr'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['SRAE']['srInbox'] = ['host1' => ['x' => 1]];
    $res = srStart($w, 'SRAE');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^s_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('sortrushRuns/' . $id);
    eq('SRAE', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq('score', $run['settings']['mode']);
    eq('nuts', $run['settings']['style']);
    eq(1, preg_match('/^[0-9a-f]{20}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/SRAE');
    eq('playing', $room['meta']['status']);
    eq('sortRush', $room['meta']['gameId']);
    eq($id, $room['meta']['srMatch']);
    eq(false, isset($room['sr']), 'the old view is cleared');
    eq(false, isset($room['srInbox']));
    eq(1, count($w['spawns']), 'the runner is started');
    eq('active', $w['db']->one('SELECT status FROM sortrush_matches WHERE id = ?', [$id])['status']);
});

test('sortrush: the result is kept once, and the run is cleared', function () {
    $w = crewWorld();
    srRoom($w, 'SRAF', 2);
    $id = srStart($w, 'SRAF')->body['matchId'];
    $w['rtdb']->set('sortrushState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'sortrush', 'why' => 'lastCall', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 1400, 'moves' => 22, 'done' => true, 'out' => false, 'used' => 41000, 'score' => 0, 'cleared' => 0, 'completed' => 6, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 320, 'moves' => 30, 'done' => false, 'out' => true, 'used' => 0, 'score' => 0, 'cleared' => 0, 'completed' => 2, 'won' => false],
    ]];
    eq(200, srInternal($w, 'report', $body)->status);
    eq(200, srInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM sortrush_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, out_of_moves, used_ms, completed, won FROM sortrush_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['guest2', 2, 1, 2, 0], [$seats[0]['uid'], (int) $seats[0]['place'], (int) $seats[0]['out_of_moves'], (int) $seats[0]['completed'], (int) $seats[0]['won']]);
    eq(41000, (int) $seats[1]['used_ms']);
    eq(null, $w['rtdb']->get('sortrushRuns/' . $id));
    eq(null, $w['rtdb']->get('sortrushState/' . $id));
    $hb = srInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'sortrush' => [$id, 's_unknown']]);
    eq([$id, 's_unknown'], $hb->body['dropSortrush'], 'the runner lets go of finished matches');
});

test('sortrush: a draw is recorded as a draw', function () {
    $w = crewWorld();
    srRoom($w, 'SRAH', 2);
    $id = srStart($w, 'SRAH')->body['matchId'];
    srInternal($w, 'report', ['matchId' => $id, 'event' => 'sortrush', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'moves' => 20, 'done' => true, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 900, 'moves' => 20, 'done' => true, 'won' => true],
    ]]);
    $m = $w['db']->one('SELECT winner_uid, is_draw FROM sortrush_matches WHERE id = ?', [$id]);
    eq([null, 1], [$m['winner_uid'], (int) $m['is_draw']]);
});

test('sortrush: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    srRoom($w, 'SRAJ', 2);
    $id = srStart($w, 'SRAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->sortrush()->nudge(human('host1'), ['roomCode' => 'SRAJ'], $now);
    $w['rtdb']->data['rooms']['SRAJ']['sr'] = ['phase' => 'playing', 'deadline' => 90000, 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/sortrush/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'SRAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->sortrush()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM sortrush_matches WHERE id = ?', [$id])['status']);
});
