<?php
/* WordShift: the server-checked solo and daily scores (begin + finish), and the online Race start.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\AuthUser;
use PlayMona\HttpError;
use PlayMona\WordShift;

echo "\nWordShift\n";

const WS_T0 = 1_800_000_000_000;   // 2027-01-15 08:00 UTC

function wsWorld(): array
{
    $w = crewWorld();
    $w['rtdb']->data['users'] = ['ann' => ['profile' => ['displayName' => 'Ann', 'avatar' => 'fox']]];
    $w['ws'] = $w['app']->wordshift();
    return $w;
}

/** A puzzle from the bank and one shortest route through it (found here by BFS over the server's word list). */
function wsPuzzle(string $id): array
{
    $p = WordShift::puzzle($id);
    $words = WordShift::words();
    $len = strlen($p['s']);
    $prev = [$p['s'] => null];
    $queue = [$p['s']];
    for ($q = 0; $q < count($queue); $q++) {
        $cur = $queue[$q];
        if ($cur === $p['t']) break;
        for ($i = 0; $i < $len; $i++) {
            for ($c = 97; $c <= 122; $c++) {
                $n = substr($cur, 0, $i) . chr($c) . substr($cur, $i + 1);
                if ($n !== $cur && isset($words[$n]) && !array_key_exists($n, $prev)) { $prev[$n] = $cur; $queue[] = $n; }
            }
        }
    }
    $route = [];
    for ($x = $p['t']; $x !== null; $x = $prev[$x]) array_unshift($route, $x);
    array_shift($route);   // the moves, without the start word
    return [$p, $route];
}

/** A one-letter try from `$from` that is not a word: refused, but it counts as a move. */
function wsMiss(string $from): string
{
    $words = WordShift::words();
    foreach (str_split('qxzjvkw') as $ch) {
        $try = $ch . substr($from, 1);
        if ($try !== $from && !isset($words[$try])) return $try;
    }
    throw new RuntimeException('no miss for ' . $from);
}

function ann(): AuthUser { return new AuthUser('ann', 'password', null, 'Ann'); }

test('wordshift: a finished run is replayed, scored and put on the boards', function () {
    $w = wsWorld();
    [$p, $route] = wsPuzzle('n1');
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0);
    eq('n1', $b['puzzle']['id']);
    // One refused try first: it counts as a move and costs the invalid points. The phone's own
    // count is not trusted ('invalid' => 0): the server counts the refused tries it replays.
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => array_merge([wsMiss($p['s'])], $route), 'invalid' => 0], WS_T0 + 42_000);
    // The server's own word list can find a route shorter than the bank's (it accepts rarer words), never longer.
    $extra = max(0, count($route) + 1 - $p['n']);
    eq(count($route) + 1, $r['moves']);
    eq(true, $r['ok']);
    eq(true, $r['ranked']);
    eq(100 + max(0, 100 - 15 * $extra) - 5, $r['score']);
    eq(42_000, $r['ms']);
    eq($p['n'], $r['shortest']);
    $all = $w['rtdb']->get('leaderboards/wordShift/all/ann');
    eq($r['score'], $all['score']);
    eq('Ann', $all['name']);
    eq($r['score'], $w['rtdb']->get('leaderboards/wordShift/week/2027-W02/ann')['score']);
    eq(null, $w['rtdb']->get('wordshiftTickets/' . $b['ticket']), 'ticket used up');
});

test('wordshift: guests, unknown puzzles and bad settings cannot begin', function () {
    $w = wsWorld();
    throwsHttp(403, fn () => $w['ws']->begin(new AuthUser('g1', 'anonymous', null, null), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0));
    throwsHttp(400, fn () => $w['ws']->begin(ann(), ['puzzleId' => 'zz9', 'mode' => 'classic'], WS_T0));
    throwsHttp(400, fn () => $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'fast'], WS_T0));
    throwsHttp(400, fn () => $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'timed', 'seconds' => 45], WS_T0));
});

test('wordshift: a move that changes two letters is refused', function () {
    $w = wsWorld();
    $p = WordShift::puzzle('n1');
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0);
    throwsHttp(422, fn () => $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => [$p['t']], 'invalid' => 0], WS_T0 + 5000));
});

test('wordshift: made-up words and repeats are refused but counted, rare real words are fine', function () {
    $w = wsWorld();
    $words = WordShift::words();
    eq(true, isset($words['sing']) && isset($words['sang']));
    eq(false, isset($words['sinx']));
    $p = ['s' => 'sing', 't' => 'sang', 'n' => 1];
    $miss = WordShift::replay($p, ['sinx']);
    eq(false, $miss['finished']);
    eq(1, $miss['moves']);
    eq(1, $miss['invalid']);
    $again = WordShift::replay(['s' => 'sing', 't' => 'bear', 'n' => 6], ['sang', 'sing']);
    eq(2, $again['moves']);
    eq(0, $again['invalid'], 'going back to a used word is allowed (Word repeated)');
    eq(true, isset($words['dont']) && isset($words['went']), 'contractions and went are words');
    $after = WordShift::replay($p, ['sinx', 'sang']);
    eq(true, $after['finished']);
    eq(2, $after['moves']);
    eq(1, $after['invalid']);
    eq('many', WordShift::replay($p, ['bang'])['reason'], 'two letters at once cannot come from the screen');
    eq('same', WordShift::replay($p, ['sing'])['reason']);
    eq(true, WordShift::replay($p, ['sang'])['finished']);
    eq(false, WordShift::replay(['s' => 'sing', 't' => 'bear', 'n' => 6], ['sang'])['finished']);
});

test('wordshift: a ticket finishes once, and only for its player', function () {
    $w = wsWorld();
    [$p, $route] = wsPuzzle('n1');
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0);
    throwsHttp(403, fn () => $w['ws']->finish(new AuthUser('bob', 'password', null, null), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 5000));
    $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 5000);
    throwsHttp(409, fn () => $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 6000));
});

test('wordshift: late finish in Time Challenge is not ranked; time left adds points', function () {
    $w = wsWorld();
    [$p, $route] = wsPuzzle('n2');
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n2', 'mode' => 'timed', 'seconds' => 60], WS_T0);
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 66_000);
    eq(false, $r['ranked']);
    eq(0, $r['score']);
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n2', 'mode' => 'timed', 'seconds' => 60], WS_T0);
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 20_000);
    $extra = max(0, count($route) - $p['n']);
    eq(100 + max(0, 100 - 15 * $extra) + 2 * 40, $r['score']);
});

test('wordshift: a lower score does not replace the best', function () {
    $w = wsWorld();
    [$p, $route] = wsPuzzle('n1');
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0);
    $best = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 5000)['score'];
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0);
    $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => array_merge([wsMiss($p['s']), wsMiss($p['s'])], $route), 'invalid' => 0], WS_T0 + 5000);
    eq($best, $w['rtdb']->get('leaderboards/wordShift/all/ann')['score']);
});

test('wordshift: the WordShift daily is one ranked try a day, on its own board', function () {
    $w = wsWorld();
    $day = gmdate('Y-m-d', intdiv(WS_T0, 1000));
    $p = WordShift::dailyPuzzle($day);
    eq('normal', $p['lv']);
    throwsHttp(400, fn () => $w['ws']->begin(ann(), ['puzzleId' => 'n1' === $p['id'] ? 'n2' : 'n1', 'mode' => 'classic', 'daily' => 'ws'], WS_T0));
    [, $route] = wsPuzzle($p['id']);
    $b = $w['ws']->begin(ann(), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'ws'], WS_T0);
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 30_000);
    eq(true, $r['ranked']);
    $row = $w['rtdb']->get('wordshiftDaily/' . $day . '/ann');
    eq($r['score'], $row['score']);
    eq(count($route), $row['moves']);
    $b = $w['ws']->begin(ann(), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'ws'], WS_T0 + 60_000);
    eq(false, $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 70_000)['ranked']);
});

test('wordshift: as the platform daily game it writes the daily board too', function () {
    $w = wsWorld();
    $day = gmdate('Y-m-d', intdiv(WS_T0, 1000));
    $w['rtdb']->data['dailyMeta'] = [$day => ['game' => 'wordShift']];
    $p = WordShift::dailyPuzzle($day);
    [, $route] = wsPuzzle($p['id']);
    $b = $w['ws']->begin(ann(), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'platform'], WS_T0);
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 30_000);
    $row = $w['rtdb']->get('daily/' . $day . '/ann');
    eq('wordShift', $row['game']);
    eq($r['score'], $row['score']);
    eq(30_000, $row['ms']);
    // Another day's game: not on the daily board.
    $w['rtdb']->data['dailyMeta'][$day]['game'] = 'sayWhat';
    throwsHttp(409, fn () => $w['ws']->begin(new AuthUser('cy', 'password', null, null), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'platform'], WS_T0));
});

test('wordshift: a banned player cannot begin a run', function () {
    $w = wsWorld();
    $w['rtdb']->data['bans'] = ['ann' => ['at' => 1]];
    throwsHttp(403, fn () => $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0));
});

test('wordshift: giving up the daily and starting again does not get a second ranked try', function () {
    $w = wsWorld();
    $day = gmdate('Y-m-d', intdiv(WS_T0, 1000));
    $p = WordShift::dailyPuzzle($day);
    [, $route] = wsPuzzle($p['id']);
    // First try: begun, then given up (finish never called).
    $w['ws']->begin(ann(), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'ws'], WS_T0);
    $b = $w['ws']->begin(ann(), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'ws'], WS_T0 + 60_000);
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 70_000);
    eq(true, $r['finished']);
    eq(false, $r['ranked'], 'the second try plays, unranked');
    eq(null, $w['rtdb']->get('wordshiftDaily/' . $day . '/ann'));
    // The platform daily keeps its own one try.
    $w['rtdb']->data['dailyMeta'] = [$day => ['game' => 'wordShift']];
    $w['ws']->begin(ann(), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'platform'], WS_T0);
    $b = $w['ws']->begin(ann(), ['puzzleId' => $p['id'], 'mode' => 'classic', 'daily' => 'platform'], WS_T0 + 1000);
    eq(false, $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 9000)['ranked']);
    eq(null, $w['rtdb']->get('daily/' . $day . '/ann'));
});

test('wordshift: the sweep forgets daily tries from before yesterday', function () {
    $w = wsWorld();
    $w['rtdb']->data['wordshiftDailyTries'] = ['2027-01-12' => ['ann' => ['ws' => 1]], '2027-01-14' => ['ann' => ['ws' => 1]], '2027-01-15' => ['ann' => ['ws' => 1]]];
    $w['ws']->sweepTickets(WS_T0);
    eq(['2027-01-14', '2027-01-15'], array_keys((array) $w['rtdb']->get('wordshiftDailyTries')));
});

test('wordshift: only Classic on a Normal puzzle reaches the week and all-time boards', function () {
    $w = wsWorld();
    $easy = null;
    foreach (WordShift::bank() as $q) { if ($q['lv'] === 'easy') { $easy = $q['id']; break; } }
    [, $route] = wsPuzzle($easy);
    $b = $w['ws']->begin(ann(), ['puzzleId' => $easy, 'mode' => 'classic'], WS_T0);
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 0], WS_T0 + 5000);
    eq(true, $r['finished']);
    eq(false, $r['ranked'], 'an Easy puzzle is scored but not ranked');
    eq(true, $r['score'] > 0);
    [, $route2] = wsPuzzle('n2');
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n2', 'mode' => 'timed', 'seconds' => 180], WS_T0);
    eq(false, $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route2, 'invalid' => 0], WS_T0 + 5000)['ranked'], 'Time Challenge is not ranked');
    eq(null, $w['rtdb']->get('leaderboards/wordShift/all/ann'));
});

test('wordshift: the PHP scoring numbers match js/wordshift/rules.js', function () {
    $js = file_get_contents(__DIR__ . '/../../js/wordshift/rules.js');
    foreach (WordShift::SCORING as $k => $v) {
        if (is_array($v)) { eq(true, (bool) preg_match('/' . $k . ':\s*\[' . implode(',\s*', $v) . '\]/', $js), $k); continue; }
        eq(true, (bool) preg_match('/\b' . $k . ':\s*' . $v . '\b/', $js), $k);
    }
});

test('wordshift: routes need a signed-in player', function () {
    $w = wsWorld();
    eq(401, $w['routes']->handle(req('POST', '/wordshift/begin', ['json' => ['puzzleId' => 'n1', 'mode' => 'classic']]))->status);
    $res = $w['routes']->handle(req('POST', '/wordshift/begin', ['token' => idToken(['sub' => 'ann', 'user_id' => 'ann']), 'json' => ['puzzleId' => 'n1', 'mode' => 'classic']]));
    eq(200, $res->status);
});

/* ---------- the online Race ---------- */

/** A lobby room with $n players who all said ready for a WordShift pick. */
function wsRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'wordShift', 'settings' => $settings]],
        'players' => $players,
    ];
}

function wsStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/wordshift/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function wsInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('wordshift: only the host of a lobby room with a ready check can start, 2 to 8 players', function () {
    $w = crewWorld();
    wsRoom($w, 'WSAA', 3);
    eq(403, wsStart($w, 'WSAA', [], 'guest2')->status, 'not the host');
    eq(400, wsStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['WSAA']['meta']['pick']['gameId'] = 'logoRush';
    eq('no-pick', wsStart($w, 'WSAA')->body['error'], 'a different game was picked');
    wsRoom($w, 'WSAB', 1);
    eq('too-few', wsStart($w, 'WSAB')->body['error']);
    wsRoom($w, 'WSAC', 9);
    eq('too-many', wsStart($w, 'WSAC')->body['error']);
    wsRoom($w, 'WSAD', 3);
    $w['rtdb']->data['rooms']['WSAD']['players']['guest3']['ready'] = null;
    eq('not-ready', wsStart($w, 'WSAD')->body['error']);
});

test('wordshift: race settings out of range are refused; the PHP lists match FF.WordShiftRules', function () {
    $w = crewWorld();
    wsRoom($w, 'WSAE', 2);
    foreach ([['level' => 'master'], ['rounds' => 2], ['clock' => 60], ['clock' => 'x']] as $bad) {
        eq('bad-settings', wsStart($w, 'WSAE', ['settings' => $bad])->body['error'] ?? null, json_encode($bad));
    }
    eq(['level' => 'normal', 'rounds' => 3, 'clock' => 120], WordShift::settings([]));
    eq(5, WordShift::settings(['rounds' => '5'])['rounds']);
    $js = file_get_contents(__DIR__ . '/../../js/wordshift/rules.js');
    $words = function (string $name) use ($js) {
        eq(1, preg_match('/var ' . $name . " = \\[([^\\]]+)\\]/", $js, $m), $name);
        return array_map(fn ($s) => trim($s, " '"), explode(',', $m[1]));
    };
    eq(WordShift::LEVELS, $words('LEVELS'));
    eq(WordShift::ROUNDS, array_map('intval', $words('ROOM_ROUNDS')));
    eq(WordShift::RACE_CLOCKS, array_map('intval', $words('ROOM_CLOCKS')));
    eq(1, preg_match('/MAX_PLAYERS: (\d+)/', $js, $mx));
    eq(WordShift::MAX_PLAYERS, (int) $mx[1]);
});

test('wordshift: a start hands the match and its seed to the runner and opens the room', function () {
    $w = crewWorld();
    wsRoom($w, 'WSAF', 3, ['level' => 'hard', 'rounds' => 5, 'clock' => 180]);
    $w['rtdb']->data['rooms']['WSAF']['ws'] = ['matchId' => 'old'];
    $w['rtdb']->data['wordshiftInbox']['WSAF'] = ['host1' => ['x' => 1]];
    $w['rtdb']->data['wordshiftMine']['WSAF'] = ['host1' => ['word' => 'cold']];
    $res = wsStart($w, 'WSAF');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^w_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('wordshiftRuns/' . $id);
    eq('WSAF', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq(['level' => 'hard', 'rounds' => 5, 'clock' => 180], $run['settings']);
    eq(1, preg_match('/^[0-9a-f]{24}$/', $run['seed']), 'a seed from the server random');
    $room = $w['rtdb']->get('rooms/WSAF');
    eq('playing', $room['meta']['status']);
    eq('wordShift', $room['meta']['gameId']);
    eq($id, $room['meta']['wsMatch']);
    eq(false, isset($room['ws']), 'the old view is cleared');
    eq(null, $w['rtdb']->get('wordshiftInbox/WSAF'), 'old moves are gone');
    eq(null, $w['rtdb']->get('wordshiftMine/WSAF'), 'the last match private words are gone');
    eq(false, isset($room['meta']['pick']));
    eq(1, count($w['spawns']), 'the runner is started');
    $row = $w['db']->one('SELECT status, level, rounds, clock FROM wordshift_matches WHERE id = ?', [$id]);
    eq(['active', 'hard', 5, 180], [$row['status'], $row['level'], (int) $row['rounds'], (int) $row['clock']]);
});

test('wordshift: the result is kept once, draws are draws, and the run is cleared', function () {
    $w = crewWorld();
    wsRoom($w, 'WSAG', 2);
    $id = wsStart($w, 'WSAG')->body['matchId'];
    $w['rtdb']->set('wordshiftState/' . $id, ['v' => 1]);
    $w['rtdb']->set('wordshiftMine/WSAG', ['host1' => ['word' => 'cold']]);
    $body = ['matchId' => $id, 'event' => 'wordshift', 'why' => 'done', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 600, 'wins' => 3, 'won' => true],
        ['uid' => 'guest2', 'place' => 2, 'points' => 300, 'wins' => 0, 'won' => false],
    ]];
    eq(200, wsInternal($w, 'report', $body)->status);
    eq(200, wsInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM wordshift_matches WHERE id = ?', [$id]);
    eq(['ended', 'host1', 0], [$m['status'], $m['winner_uid'], (int) $m['is_draw']]);
    $seats = $w['db']->all('SELECT uid, place, points, wins, won FROM wordshift_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['host1', 1, 600, 3, 1], [$seats[1]['uid'], (int) $seats[1]['place'], (int) $seats[1]['points'], (int) $seats[1]['wins'], (int) $seats[1]['won']]);
    eq(null, $w['rtdb']->get('wordshiftRuns/' . $id));
    eq(null, $w['rtdb']->get('wordshiftState/' . $id));
    eq(null, $w['rtdb']->get('wordshiftMine/WSAG'), 'private words are cleared at the end');
    $hb = wsInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'wordshift' => [$id, 'w_unknown']]);
    eq([$id, 'w_unknown'], $hb->body['dropWordshift'], 'the runner lets go of finished matches');

    wsRoom($w, 'WSAH', 2);
    $id2 = wsStart($w, 'WSAH')->body['matchId'];
    wsInternal($w, 'report', ['matchId' => $id2, 'event' => 'wordshift', 'seats' => [
        ['uid' => 'host1', 'place' => 1, 'points' => 900, 'won' => true],
        ['uid' => 'guest2', 'place' => 1, 'points' => 900, 'won' => true],
    ]]);
    $d = $w['db']->one('SELECT winner_uid, is_draw FROM wordshift_matches WHERE id = ?', [$id2]);
    eq([null, 1], [$d['winner_uid'], (int) $d['is_draw']]);
});

test('wordshift: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    wsRoom($w, 'WSAJ', 2);
    $id = wsStart($w, 'WSAJ')->body['matchId'];
    $nudge = fn (int $now) => $w['app']->wordshift()->nudge(human('host1'), ['roomCode' => 'WSAJ'], $now);
    $w['rtdb']->data['rooms']['WSAJ']['ws'] = ['phase' => 'open', 'closeAt' => 5000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['rtdb']->data['rooms']['WSAJ']['ws'] = ['phase' => 'ready', 'openAt' => 5000];
    eq(false, $nudge(6000)['started'], 'ready is a phase too');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(403, $w['routes']->handle(req('POST', '/wordshift/nudge', ['token' => idToken(['sub' => 'stranger', 'user_id' => 'stranger']), 'json' => ['roomCode' => 'WSAJ']]))->status, 'only players in the room');
    eq(1, $w['app']->wordshift()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM wordshift_matches WHERE id = ?', [$id])['status']);
});
