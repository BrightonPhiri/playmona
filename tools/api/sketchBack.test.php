<?php
/* SketchBack online: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\SketchBack;

echo "\nSketchBack\n";

/** A lobby room with $n players who all said ready for a SketchBack pick. */
function skbRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'sketchBack', 'settings' => $settings]],
        'players' => $players,
    ];
}

function skbStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/sketchback/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function skbInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('sketchback: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    skbRoom($w, 'SKAA', 3);
    eq(403, skbStart($w, 'SKAA', [], 'guest2')->status, 'not the host');
    eq(400, skbStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['SKAA']['meta']['pick']['gameId'] = 'logoRush';
    eq('no-pick', skbStart($w, 'SKAA')->body['error'], 'a different game was picked');
    skbRoom($w, 'SKAB', 1);
    eq('too-few', skbStart($w, 'SKAB')->body['error']);
    skbRoom($w, 'SKAC', 9);
    eq('too-many', skbStart($w, 'SKAC')->body['error']);
    skbRoom($w, 'SKAD', 3);
    $w['rtdb']->data['rooms']['SKAD']['players']['guest3']['ready'] = null;
    eq('not-ready', skbStart($w, 'SKAD')->body['error']);
    $w['rtdb']->data['rooms']['SKAD']['players']['guest3']['ready'] = 'pick1';
    $w['rtdb']->data['rooms']['SKAD']['meta']['status'] = 'playing';
    eq('room-busy', skbStart($w, 'SKAD')->body['error']);
});

test('sketchback: settings out of range are refused; the PHP lists match FF.SketchBackRules', function () {
    $w = crewWorld();
    skbRoom($w, 'SKAE', 2);
    foreach ([['level' => 'expert'], ['count' => 7], ['count' => 'many'], ['level' => 3]] as $bad) {
        eq('bad-settings', skbStart($w, 'SKAE', ['settings' => $bad])->body['error'] ?? null, json_encode($bad));
    }
    eq(['count' => 10, 'level' => 'normal'], SketchBack::settings([]));
    eq(['count' => 15, 'level' => 'hard'], SketchBack::settings(['count' => '15', 'level' => 'hard']));
    eq(['count' => 5, 'level' => 'normal'], SketchBack::settings(['count' => 5, 'other' => 'x']), 'unknown keys are dropped');
    $js = file_get_contents(__DIR__ . '/../../js/sketchback/rules.js');
    $words = function (string $name) use ($js) {
        eq(1, preg_match('/var ' . $name . " = \\[([^\\]]+)\\]/", $js, $m), $name);
        return array_map(fn ($s) => trim($s, " '"), explode(',', $m[1]));
    };
    eq(SketchBack::LEVELS, $words('LEVELS'));
    eq(SketchBack::COUNTS, array_map('intval', $words('COUNTS')));
    eq(1, preg_match('/var MAX_PLAYERS = (\d+)/', $js, $mx));
    eq(SketchBack::MAX_PLAYERS, (int) $mx[1]);
    eq(1, preg_match('/var MIN_PLAYERS = (\d+)/', $js, $mn));
    eq(SketchBack::MIN_PLAYERS, (int) $mn[1]);
});

test('sketchback: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    skbRoom($w, 'SKAF', 3, ['count' => 15, 'level' => 'easy']);
    $w['rtdb']->data['rooms']['SKAF']['skb'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['SKAF']['skbInbox'] = ['host1' => ['x' => 1]];
    $res = skbStart($w, 'SKAF');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^k_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('sketchbackRuns/' . $id);
    eq('SKAF', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['count' => 15, 'level' => 'easy'], $run['settings']);
    eq(1, preg_match('/^[0-9a-f]{24}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/SKAF');
    eq('playing', $room['meta']['status']);
    eq('sketchBack', $room['meta']['gameId']);
    eq($id, $room['meta']['skbMatch']);
    eq(false, isset($room['skb']), 'the old view is cleared');
    eq(false, isset($room['skbInbox']));
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    $row = $w['db']->one('SELECT status, level, sketches, players FROM sketchback_matches WHERE id = ?', [$id]);
    eq(['active', 'easy', 15, 3], [$row['status'], $row['level'], (int) $row['sketches'], (int) $row['players']]);
});

test('sketchback: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    skbRoom($w, 'SKAG', 2);
    $id = skbStart($w, 'SKAG')->body['matchId'];
    $w['rtdb']->set('sketchbackState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'sketchback', 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'correct' => 9, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 400, 'correct' => 4, 'won' => false],
    ]];
    eq(200, skbInternal($w, 'report', $body)->status);
    eq(200, skbInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM sketchback_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, correct, won FROM sketchback_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 900, 9, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['correct'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('sketchbackRuns/' . $id));
    eq(null, $w['rtdb']->get('sketchbackState/' . $id));
    $hb = skbInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'sketchback' => [$id, 'k_unknown']]);
    eq([$id, 'k_unknown'], $hb->body['dropSketchback'], 'the runner lets go of finished matches');

    skbRoom($w, 'SKAH', 2);
    $id2 = skbStart($w, 'SKAH')->body['matchId'];
    skbInternal($w, 'report', ['matchId' => $id2, 'event' => 'sketchback', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 500, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 500, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM sketchback_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('sketchback: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    skbRoom($w, 'SKAJ', 2);
    $id = skbStart($w, 'SKAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->sketchback()->nudge(human('host1'), ['roomCode' => 'SKAJ'], $now);
    $w['rtdb']->data['rooms']['SKAJ']['skb'] = ['phase' => 'draw', 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['rtdb']->data['rooms']['SKAJ']['skb'] = ['phase' => 'recall', 'recallEnd' => 5000];
    eq(false, $nudge(6000)['started'], 'naming is a phase too');
    $w['rtdb']->data['rooms']['SKAJ']['skb'] = ['phase' => 'gap', 'drawAt' => 0, 'recallAt' => 5000];
    eq(false, $nudge(6000)['started'], 'a gap before naming');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/sketchback/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'SKAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->sketchback()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM sketchback_matches WHERE id = ?', [$id])['status']);
});
