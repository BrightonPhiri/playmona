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

function ann(): AuthUser { return new AuthUser('ann', 'password', null, 'Ann'); }

test('wordshift: a finished run is replayed, scored and put on the boards', function () {
    $w = wsWorld();
    [$p, $route] = wsPuzzle('n1');
    $b = $w['ws']->begin(ann(), ['puzzleId' => 'n1', 'mode' => 'classic'], WS_T0);
    eq('n1', $b['puzzle']['id']);
    $r = $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 1], WS_T0 + 42_000);
    // The server's own word list can find a route shorter than the bank's (it accepts rarer words), never longer.
    $extra = max(0, count($route) - $p['n']);
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

test('wordshift: made-up words and repeats are refused, rare real words are fine', function () {
    $w = wsWorld();
    $words = WordShift::words();
    eq(true, isset($words['sing']) && isset($words['sang']));
    eq(false, isset($words['sinx']));
    $p = ['s' => 'sing', 't' => 'sang', 'n' => 1];
    eq('word', WordShift::replay($p, ['sinx'])['reason']);
    eq('used', WordShift::replay(['s' => 'sing', 't' => 'bear', 'n' => 6], ['sang', 'sing'])['reason']);
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
    $w['ws']->finish(ann(), ['ticket' => $b['ticket'], 'moves' => $route, 'invalid' => 10], WS_T0 + 5000);
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
