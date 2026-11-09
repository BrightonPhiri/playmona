<?php
/* Mini Crossword online: the server-run start, settings, nudges, results and the runner's heartbeat.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\Crossword;

echo "\nMini Crossword\n";

/** A lobby room with $n players who all said ready for a Mini Crossword pick. */
function cwRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'miniCrossword', 'settings' => $settings]],
        'players' => $players,
    ];
}

function cwStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/crossword/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function cwInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('crossword: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    cwRoom($w, 'CWAA', 3);
    eq(403, cwStart($w, 'CWAA', [], 'guest2')->status, 'not the host');
    eq(400, cwStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['CWAA']['meta']['pick']['gameId'] = 'geoSpin';
    eq('no-pick', cwStart($w, 'CWAA')->body['error'], 'a different game was picked');
    cwRoom($w, 'CWAB', 1);
    eq('too-few', cwStart($w, 'CWAB')->body['error']);
    cwRoom($w, 'CWAC', 9);
    eq('too-many', cwStart($w, 'CWAC')->body['error']);
    cwRoom($w, 'CWAD', 3);
    $w['rtdb']->data['rooms']['CWAD']['players']['guest3']['ready'] = null;
    eq('not-ready', cwStart($w, 'CWAD')->body['error']);
});

test('crossword: settings out of range are refused; the PHP lists match FF.CrosswordRules', function () {
    $w = crewWorld();
    cwRoom($w, 'CWAE', 2);
    foreach ([['level' => 'expert'], ['pack' => 'mars'], ['checking' => 'off'], ['play' => 'turns']] as $bad) {
        eq(400, cwStart($w, 'CWAE', ['settings' => $bad])->status, json_encode($bad));
    }
    eq(['level' => 'normal', 'pack' => 'mixed', 'checking' => 'on', 'play' => 'race'], Crossword::settings([]));
    eq('coop', Crossword::settings(['play' => 'coop'])['play']);
    $js = file_get_contents(__DIR__ . '/../../js/crossword/rules.js');
    $words = function (string $name) use ($js) {
        eq(1, preg_match('/var ' . $name . " = \\[([^\\]]+)\\]/", $js, $m), $name);
        $l = array_map(fn ($s) => trim($s, " '"), explode(',', $m[1]));
        sort($l);
        return $l;
    };
    $sorted = function (array $l) { sort($l); return $l; };
    eq($sorted(Crossword::LEVELS), $words('LEVELS'));
    eq($sorted(Crossword::PACKS), $words('PACKS'));
    eq($sorted(Crossword::CHECKING), $words('CHECKING'));
    eq($sorted(Crossword::PLAYS), $words('PLAYS'));
});

test('crossword: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    cwRoom($w, 'CWAF', 3, ['level' => 'hard', 'pack' => 'animals', 'play' => 'coop']);
    $w['rtdb']->data['rooms']['CWAF']['cw'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['CWAF']['cwInbox'] = ['host1' => ['x' => 1]];
    $res = cwStart($w, 'CWAF');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^x_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('crosswordRuns/' . $id);
    eq('CWAF', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['level' => 'hard', 'pack' => 'animals', 'checking' => 'on', 'play' => 'coop'], $run['settings']);
    eq(true, is_int($run['seed']) && $run['seed'] >= 0, 'a whole-number seed from the server random');
    $room = $w['rtdb']->get('rooms/CWAF');
    eq('playing', $room['meta']['status']);
    eq('miniCrossword', $room['meta']['gameId']);
    eq($id, $room['meta']['cwMatch']);
    eq(false, isset($room['cw']), 'the old view is cleared');
    eq(false, isset($room['cwInbox']));
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    eq('active', $w['db']->one('SELECT status FROM crossword_matches WHERE id = ?', [$id])['status']);
});

test('crossword: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    cwRoom($w, 'CWAG', 2);
    $id = cwStart($w, 'CWAG')->body['matchId'];
    $w['rtdb']->set('crosswordState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'crossword', 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 240, 'correct' => 10, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 80, 'correct' => 4, 'won' => false],
    ]];
    eq(200, cwInternal($w, 'report', $body)->status);
    eq(200, cwInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM crossword_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, correct, won FROM crossword_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 240, 10, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['correct'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('crosswordRuns/' . $id));
    eq(null, $w['rtdb']->get('crosswordState/' . $id));
    $hb = cwInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'crossword' => [$id, 'x_unknown']]);
    eq([$id, 'x_unknown'], $hb->body['dropCrossword'], 'the runner lets go of finished matches');

    cwRoom($w, 'CWAH', 2);
    $id2 = cwStart($w, 'CWAH')->body['matchId'];
    cwInternal($w, 'report', ['matchId' => $id2, 'event' => 'crossword', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 90, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 90, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM crossword_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('crossword: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    cwRoom($w, 'CWAJ', 2);
    $id = cwStart($w, 'CWAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->crossword()->nudge(human('host1'), ['roomCode' => 'CWAJ'], $now);
    $w['rtdb']->data['rooms']['CWAJ']['cw'] = ['status' => 'play', 'endsAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/crossword/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'CWAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->crossword()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM crossword_matches WHERE id = ?', [$id])['status']);
});
