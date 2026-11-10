<?php
/* Say What? online: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\SayWhat;

echo "\nSay What?\n";

/** A lobby room with $n players who all said ready for a Say What? pick. */
function swRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'sayWhat', 'settings' => $settings]],
        'players' => $players,
    ];
}

function swStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/saywhat/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function swInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('saywhat: only the host of a lobby room with a ready check can start, 2 to 8 players', function () {
    $w = crewWorld();
    swRoom($w, 'SWAA', 3);
    eq(403, swStart($w, 'SWAA', [], 'guest2')->status, 'not the host');
    eq(400, swStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['SWAA']['meta']['pick']['gameId'] = 'logoRush';
    eq('no-pick', swStart($w, 'SWAA')->body['error'], 'a different game was picked');
    swRoom($w, 'SWAB', 1);
    eq('too-few', swStart($w, 'SWAB')->body['error']);
    swRoom($w, 'SWAC', 9);
    eq('too-many', swStart($w, 'SWAC')->body['error']);
    swRoom($w, 'SWAD', 3);
    $w['rtdb']->data['rooms']['SWAD']['players']['guest3']['ready'] = null;
    eq('not-ready', swStart($w, 'SWAD')->body['error']);
});

test('saywhat: settings out of range are refused; the PHP lists match FF.SayWhatRules', function () {
    $w = crewWorld();
    swRoom($w, 'SWAE', 2);
    foreach ([['level' => 'easy'], ['level' => 'expert'], ['answer' => 'type'], ['time' => 'none'], ['rounds' => 5],
        ['packs' => ['kids']], ['packs' => 'bible'], ['packs' => []]] as $bad) {
        eq('bad-settings', swStart($w, 'SWAE', ['settings' => $bad])->body['error'] ?? null, json_encode($bad));
    }
    eq(['level' => 'normal', 'packs' => 'mixed', 'answer' => 'tiles', 'time' => 'normal', 'rounds' => 10], SayWhat::settings([]));
    eq('choice', SayWhat::settings(['answer' => 'choice'])['answer']);
    eq('hard', SayWhat::settings(['level' => 'hard'])['level']);
    eq(15, SayWhat::settings(['rounds' => '15'])['rounds']);
    $js = file_get_contents(__DIR__ . '/../../js/saywhat/rules.js');
    $words = function (string $name) use ($js) {
        eq(1, preg_match('/var ' . $name . " = \\[([^\\]]+)\\]/", $js, $m), $name);
        return array_map(fn ($s) => trim($s, " '"), explode(',', $m[1]));
    };
    eq(SayWhat::LEVELS, array_values(array_diff($words('LEVELS'), ['easy'])));
    eq(SayWhat::ANSWERS, $words('ANSWERS'));
    eq(SayWhat::TIMES, array_values(array_diff($words('TIMES'), ['none'])));
    eq(SayWhat::ROUNDS, array_map('intval', $words('ROUNDS')));
    eq(1, preg_match('/MAX_PLAYERS: (\d+)/', $js, $mx));
    eq(SayWhat::MAX_PLAYERS, (int) $mx[1]);
    eq(1, preg_match('/MIN_PLAYERS: (\d+)/', $js, $mn));
    eq(SayWhat::MIN_PLAYERS, (int) $mn[1]);
});

test('saywhat: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    swRoom($w, 'SWAF', 3, ['level' => 'hard', 'answer' => 'choice', 'rounds' => 15]);
    $w['rtdb']->data['rooms']['SWAF']['sw'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['SWAF']['swInbox'] = ['host1' => ['x' => 1]];
    $res = swStart($w, 'SWAF');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^y_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('saywhatRuns/' . $id);
    eq('SWAF', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['level' => 'hard', 'packs' => 'mixed', 'answer' => 'choice', 'time' => 'normal', 'rounds' => 15], $run['settings']);
    eq(1, preg_match('/^[0-9a-f]{24}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/SWAF');
    eq('playing', $room['meta']['status']);
    eq('sayWhat', $room['meta']['gameId']);
    eq($id, $room['meta']['swMatch']);
    eq(false, isset($room['sw']), 'the old view is cleared');
    eq(false, isset($room['swInbox']));
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    $row = $w['db']->one('SELECT status, level, answer, rounds FROM saywhat_matches WHERE id = ?', [$id]);
    eq(['active', 'hard', 'choice', 15], [$row['status'], $row['level'], $row['answer'], (int) $row['rounds']]);
});

test('saywhat: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    swRoom($w, 'SWAG', 2);
    $id = swStart($w, 'SWAG')->body['matchId'];
    $w['rtdb']->set('saywhatState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'saywhat', 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 2400, 'correct' => 9, 'best' => 7, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 800, 'correct' => 4, 'best' => 2, 'won' => false],
    ]];
    eq(200, swInternal($w, 'report', $body)->status);
    eq(200, swInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM saywhat_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, correct, best_streak, won FROM saywhat_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 2400, 9, 7, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['correct'], (int) $seats[1]['best_streak'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('saywhatRuns/' . $id));
    eq(null, $w['rtdb']->get('saywhatState/' . $id));
    $hb = swInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'saywhat' => [$id, 'y_unknown']]);
    eq([$id, 'y_unknown'], $hb->body['dropSaywhat'], 'the runner lets go of finished matches');

    swRoom($w, 'SWAH', 2);
    $id2 = swStart($w, 'SWAH')->body['matchId'];
    swInternal($w, 'report', ['matchId' => $id2, 'event' => 'saywhat', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 900, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM saywhat_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('saywhat: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    swRoom($w, 'SWAJ', 2);
    $id = swStart($w, 'SWAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->saywhat()->nudge(human('host1'), ['roomCode' => 'SWAJ'], $now);
    $w['rtdb']->data['rooms']['SWAJ']['sw'] = ['phase' => 'open', 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['rtdb']->data['rooms']['SWAJ']['sw'] = ['phase' => 'ready', 'openAt' => 5000];
    eq(false, $nudge(6000)['started'], 'ready is a phase too');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/saywhat/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'SWAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->saywhat()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM saywhat_matches WHERE id = ?', [$id])['status']);
});
