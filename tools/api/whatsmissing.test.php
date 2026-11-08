<?php
/* What's Missing?: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\WhatsMissing;

echo "\nWhat's Missing?\n";

/** A lobby room with $n players who all said ready for a What's Missing? pick. */
function wmRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'whatsMissing', 'settings' => $settings]],
        'players' => $players,
    ];
}

function wmStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/whatsmissing/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function wmInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('whatsmissing: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    wmRoom($w, 'WMAA', 3);
    eq(403, wmStart($w, 'WMAA', [], 'guest2')->status, 'not the host');
    eq(400, wmStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['WMAA']['meta']['pick']['gameId'] = 'geoSpin';
    eq('no-pick', wmStart($w, 'WMAA')->body['error'], 'a different game was picked');
    wmRoom($w, 'WMAB', 1);
    eq('too-few', wmStart($w, 'WMAB')->body['error']);
    wmRoom($w, 'WMAC', 9);
    eq('too-many', wmStart($w, 'WMAC')->body['error']);
    wmRoom($w, 'WMAD', 3);
    $w['rtdb']->data['rooms']['WMAD']['players']['guest3']['ready'] = null;
    eq('not-ready', wmStart($w, 'WMAD')->body['error']);
});

test('whatsmissing: settings out of range are refused; Endless is solo only; the PHP lists match FF.WhatsMissingRules', function () {
    $w = crewWorld();
    wmRoom($w, 'WMAE', 2);
    foreach ([['level' => 'endless'], ['level' => 'insane'], ['theme' => 'mars'], ['seconds' => 4], ['choices' => 5], ['twists' => 'all'], ['rounds' => 7]] as $bad) {
        eq(400, wmStart($w, 'WMAE', ['settings' => $bad])->status, json_encode($bad));
    }
    eq(['level' => 'normal', 'theme' => 'mix', 'seconds' => 5, 'choices' => 6, 'twists' => 'mix', 'rounds' => 8], WhatsMissing::settings([]));
    eq(12, WhatsMissing::settings(['rounds' => '12'])['rounds']);
    eq('expert', WhatsMissing::settings(['level' => 'expert'])['level']);
    $js = file_get_contents(__DIR__ . '/../../js/whatsmissing/rules.js');
    $words = function (string $name) use ($js) {
        eq(1, preg_match('/var ' . $name . " = \\[([^\\]]+)\\]/", $js, $m), $name);
        return array_map(fn ($s) => trim($s, " '"), explode(',', $m[1]));
    };
    eq(WhatsMissing::LEVELS, $words('ROOM_LEVELS'));
    eq(WhatsMissing::THEMES, $words('THEMES'));
    eq(WhatsMissing::TWISTS, $words('TWISTS'));
    eq(WhatsMissing::SECONDS, array_map('intval', $words('SECONDS')));
    eq(WhatsMissing::CHOICES, array_map('intval', $words('CHOICES')));
    eq(WhatsMissing::ROUNDS, array_map('intval', $words('ROUNDS')));
});

test('whatsmissing: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    wmRoom($w, 'WMAF', 3, ['level' => 'hard', 'theme' => 'animals', 'rounds' => 5]);
    $w['rtdb']->data['rooms']['WMAF']['wm'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['WMAF']['wmInbox'] = ['host1' => ['x' => 1]];
    $res = wmStart($w, 'WMAF');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^m_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('whatsmissingRuns/' . $id);
    eq('WMAF', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['level' => 'hard', 'theme' => 'animals', 'seconds' => 5, 'choices' => 6, 'twists' => 'mix', 'rounds' => 5], $run['settings']);
    eq(1, preg_match('/^[0-9a-f]{24}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/WMAF');
    eq('playing', $room['meta']['status']);
    eq('whatsMissing', $room['meta']['gameId']);
    eq($id, $room['meta']['wmMatch']);
    eq(false, isset($room['wm']), 'the old view is cleared');
    eq(false, isset($room['wmInbox']));
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    eq('active', $w['db']->one('SELECT status FROM whatsmissing_matches WHERE id = ?', [$id])['status']);
});

test('whatsmissing: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    wmRoom($w, 'WMAG', 2);
    $id = wmStart($w, 'WMAG')->body['matchId'];
    $w['rtdb']->set('whatsmissingState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'whatsmissing', 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 2400, 'correct' => 9, 'best' => 7, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 800, 'correct' => 4, 'best' => 2, 'won' => false],
    ]];
    eq(200, wmInternal($w, 'report', $body)->status);
    eq(200, wmInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM whatsmissing_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, correct, best_streak, won FROM whatsmissing_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 2400, 9, 7, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['correct'], (int) $seats[1]['best_streak'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('whatsmissingRuns/' . $id));
    eq(null, $w['rtdb']->get('whatsmissingState/' . $id));
    $hb = wmInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'whatsmissing' => [$id, 'm_unknown']]);
    eq([$id, 'm_unknown'], $hb->body['dropWhatsmissing'], 'the runner lets go of finished matches');

    wmRoom($w, 'WMAH', 2);
    $id2 = wmStart($w, 'WMAH')->body['matchId'];
    wmInternal($w, 'report', ['matchId' => $id2, 'event' => 'whatsmissing', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 900, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM whatsmissing_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('whatsmissing: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    wmRoom($w, 'WMAJ', 2);
    $id = wmStart($w, 'WMAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->whatsmissing()->nudge(human('host1'), ['roomCode' => 'WMAJ'], $now);
    $w['rtdb']->data['rooms']['WMAJ']['wm'] = ['phase' => 'open', 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/whatsmissing/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'WMAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->whatsmissing()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM whatsmissing_matches WHERE id = ?', [$id])['status']);
});
