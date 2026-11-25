<?php
/* Number Challenge online: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\NumberChallenge;

echo "\nNumber Challenge\n";

/** A lobby room with $n players who all said ready for a Number Challenge pick. */
function ncRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'numberChallenge', 'settings' => $settings]],
        'players' => $players,
    ];
}

function ncStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/numberchallenge/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function ncInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('numberchallenge: only the host of a lobby room with a ready check can start, 2 to 8 players', function () {
    $w = crewWorld();
    ncRoom($w, 'NCAA', 3);
    eq(403, ncStart($w, 'NCAA', [], 'guest2')->status, 'not the host');
    eq(400, ncStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['NCAA']['meta']['pick']['gameId'] = 'sayWhat';
    eq('no-pick', ncStart($w, 'NCAA')->body['error'], 'a different game was picked');
    ncRoom($w, 'NCAB', 1);
    eq('too-few', ncStart($w, 'NCAB')->body['error']);
    ncRoom($w, 'NCAC', 9);
    eq('too-many', ncStart($w, 'NCAC')->body['error']);
    ncRoom($w, 'NCAD', 3);
    $w['rtdb']->data['rooms']['NCAD']['players']['guest3']['ready'] = null;
    eq('not-ready', ncStart($w, 'NCAD')->body['error']);
    ncRoom($w, 'NCAE', 2);
    $w['rtdb']->data['rooms']['NCAE']['meta']['status'] = 'playing';
    eq('room-busy', ncStart($w, 'NCAE')->body['error']);
});

test('numberchallenge: settings out of range are refused; the PHP lists match FF.NumberChallengeRules', function () {
    $w = crewWorld();
    ncRoom($w, 'NCAF', 2);
    foreach ([['mode' => 'race'], ['level' => 'impossible'], ['time' => 'none'], ['rounds' => 7], ['mode' => 'quick', 'rounds' => 5],
        ['mode' => 'chain', 'rounds' => 15], ['mode' => 'target', 'rounds' => 10], ['mode' => 'sprint', 'rounds' => 10],
        ['sprint' => 45], ['speed' => 'slow'], ['level' => ['easy']]] as $bad) {
        eq('bad-settings', ncStart($w, 'NCAF', ['settings' => $bad])->body['error'] ?? null, json_encode($bad));
    }
    eq(['mode' => 'quick', 'level' => 'normal', 'time' => 'normal', 'rounds' => 10, 'sprint' => 60, 'speed' => 'steady'], NumberChallenge::settings([]));
    eq(['mode' => 'chain', 'level' => 'normal', 'time' => 'normal', 'rounds' => 5, 'sprint' => 60, 'speed' => 'steady'], NumberChallenge::settings(['mode' => 'chain']));
    eq(['mode' => 'sprint', 'level' => 'expert', 'time' => 'quick', 'rounds' => 1, 'sprint' => 90, 'speed' => 'fast'],
        NumberChallenge::settings(['mode' => 'sprint', 'level' => 'expert', 'time' => 'quick', 'rounds' => 1, 'sprint' => '90', 'speed' => 'fast']));
    eq(8, NumberChallenge::settings(['mode' => 'target', 'rounds' => '8'])['rounds']);
    eq(20, NumberChallenge::settings(['mode' => 'quick', 'rounds' => 20])['rounds']);

    $js = file_get_contents(__DIR__ . '/../../js/numberchallenge/rules.js');
    $words = function (string $name) use ($js) {
        eq(1, preg_match('/var ' . $name . " = \\[([^\\]]+)\\]/", $js, $m), $name);
        return array_map(fn ($s) => trim($s, " '"), explode(',', $m[1]));
    };
    eq(NumberChallenge::MODES, $words('MODES'));
    eq(NumberChallenge::LEVELS, $words('LEVELS'));
    eq(NumberChallenge::TIMES, array_values(array_diff($words('TIMES'), ['none'])));
    eq(NumberChallenge::SPRINTS, array_map('intval', $words('SPRINTS')));
    eq(NumberChallenge::SPEEDS, $words('SPEEDS'));
    eq(1, preg_match('/var ROUNDS = \{([^}]+)\}/', $js, $r), 'ROUNDS');
    preg_match_all('/(\w+): \[([^\]]+)\]/', $r[1], $pairs, PREG_SET_ORDER);
    $rounds = [];
    foreach ($pairs as $p) $rounds[$p[1]] = array_map('intval', explode(',', $p[2]));
    eq(NumberChallenge::ROUNDS, $rounds);
    eq(1, preg_match('/var ROUNDS_DEFAULT = \{([^}]+)\}/', $js, $rd), 'ROUNDS_DEFAULT');
    preg_match_all('/(\w+): (\d+)/', $rd[1], $dp, PREG_SET_ORDER);
    $defaults = [];
    foreach ($dp as $p) $defaults[$p[1]] = (int) $p[2];
    eq(NumberChallenge::ROUNDS_DEFAULT, $defaults);
    eq(1, preg_match('/var MAX_PLAYERS = (\d+)/', $js, $mx));
    eq(NumberChallenge::MAX_PLAYERS, (int) $mx[1]);
    eq(1, preg_match('/var MIN_PLAYERS = (\d+)/', $js, $mn));
    eq(NumberChallenge::MIN_PLAYERS, (int) $mn[1]);
});

test('numberchallenge: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    ncRoom($w, 'NCAG', 3, ['mode' => 'target', 'level' => 'hard', 'rounds' => 8, 'time' => 'relaxed']);
    $w['rtdb']->data['rooms']['NCAG']['nc'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['NCAG']['ncInbox'] = ['host1' => ['x' => 1]];
    $res = ncStart($w, 'NCAG');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^n_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('numberchallengeRuns/' . $id);
    eq('NCAG', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['mode' => 'target', 'level' => 'hard', 'time' => 'relaxed', 'rounds' => 8, 'sprint' => 60, 'speed' => 'steady'], $run['settings']);
    eq(1, preg_match('/^[0-9a-f]{24}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/NCAG');
    eq('playing', $room['meta']['status']);
    eq('numberChallenge', $room['meta']['gameId']);
    eq($id, $room['meta']['ncMatch']);
    eq(false, isset($room['nc']), 'the old view is cleared');
    eq(false, isset($room['ncInbox']));
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    $row = $w['db']->one('SELECT status, mode, level, rounds FROM numberchallenge_matches WHERE id = ?', [$id]);
    eq(['active', 'target', 'hard', 8], [$row['status'], $row['mode'], $row['level'], (int) $row['rounds']]);
});

test('numberchallenge: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    ncRoom($w, 'NCAH', 2);
    $id = ncStart($w, 'NCAH')->body['matchId'];
    $w['rtdb']->set('numberchallengeState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'numberchallenge', 'why' => 'done', 'mode' => 'quick', 'level' => 'normal', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 2400, 'correct' => 9, 'best' => 7, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 800, 'correct' => 4, 'best' => 2, 'won' => false],
    ]];
    eq(200, ncInternal($w, 'report', $body)->status);
    eq(200, ncInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM numberchallenge_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, correct, best_streak, won FROM numberchallenge_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 2400, 9, 7, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['correct'], (int) $seats[1]['best_streak'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('numberchallengeRuns/' . $id));
    eq(null, $w['rtdb']->get('numberchallengeState/' . $id));
    $hb = ncInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'numberchallenge' => [$id, 'n_unknown']]);
    eq([$id, 'n_unknown'], $hb->body['dropNumberchallenge'], 'the runner lets go of finished matches');

    ncRoom($w, 'NCAJ', 2);
    $id2 = ncStart($w, 'NCAJ')->body['matchId'];
    ncInternal($w, 'report', ['matchId' => $id2, 'event' => 'numberchallenge', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 900, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM numberchallenge_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('numberchallenge: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    ncRoom($w, 'NCAK', 2);
    $id = ncStart($w, 'NCAK')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->numberchallenge()->nudge(human('host1'), ['roomCode' => 'NCAK'], $now);
    $w['rtdb']->data['rooms']['NCAK']['nc'] = ['phase' => 'open', 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['rtdb']->data['rooms']['NCAK']['nc'] = ['phase' => 'steps', 'openAt' => 5000];
    eq(false, $nudge(6000)['started'], 'a chain showing its steps is not late');
    $w['rtdb']->data['rooms']['NCAK']['nc'] = ['phase' => 'ended'];
    eq(false, $nudge(PHP_INT_MAX - 100)['started'], 'an ended match is never late');
    $w['runner']->stopped(0);
    $w['rtdb']->data['rooms']['NCAK']['nc'] = ['phase' => 'reveal', 'nextAt' => 5000];
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/numberchallenge/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'NCAK']]))->status, 'only players in the room');
    eq(1, $w['app']->numberchallenge()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM numberchallenge_matches WHERE id = ?', [$id])['status']);
});
