<?php
/* Imposters: the server-run start, the word pairs, "Find PlayMona players", nudges and results.
   Loaded by test.php after crew.test.php (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\{ImposterWords, Imposters};

echo "\nImposters\n";

/** A lobby room with $n players who all said ready for an Imposters pick. */
function impRoom(array $w, string $code, int $n, array $settings = [], array $extra = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = array_replace_recursive([
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'imposters', 'settings' => $settings + ['mode' => 'word']]],
        'players' => $players,
    ], $extra);
}

function impStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/imposters/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

test('imposters: the imposter count rule matches the app (3-5 get one, 6+ choose)', function () {
    $table = [[2, 1, 0], [3, 2, 1], [4, 2, 1], [5, 2, 1], [5, 1, 1], [6, 1, 1], [6, 2, 2], [6, 3, 1], [12, 2, 2], [13, 1, 0]];
    foreach ($table as [$n, $asked, $want]) eq($want, Imposters::imposterCount($n, $asked), "$n players asked for $asked");
});

test('imposters: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    impRoom($w, 'ROOMAA', 4);
    eq(403, impStart($w, 'ROOMAA', [], 'guest2')->status, 'not the host');
    eq(400, impStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['ROOMAA']['meta']['status'] = 'playing';
    eq(409, impStart($w, 'ROOMAA')->status, 'already playing');
    $w['rtdb']->data['rooms']['ROOMAA']['meta']['status'] = 'lobby';
    $w['rtdb']->data['rooms']['ROOMAA']['meta']['pick']['gameId'] = 'quickTap';
    eq(409, impStart($w, 'ROOMAA')->status, 'a different game was picked');
});

test('imposters: fewer than 3 players, or someone not ready, cannot start', function () {
    $w = crewWorld();
    impRoom($w, 'ROOMAB', 2);
    $res = impStart($w, 'ROOMAB');
    eq(409, $res->status);
    eq('too-few', $res->body['error']);
    impRoom($w, 'ROOMAC', 4);
    $w['rtdb']->data['rooms']['ROOMAC']['players']['guest3']['ready'] = null;
    eq('not-ready', impStart($w, 'ROOMAC')->body['error']);
    // Someone who left the room does not count, and does not hold the others up.
    impRoom($w, 'ROOMAD', 4);
    $w['rtdb']->data['rooms']['ROOMAD']['players']['guest4'] = ['name' => 'Gone', 'online' => false];
    $w['rtdb']->data['rooms']['ROOMAD']['players']['guest3']['lastSeen'] = 1;   // stale
    eq('too-few', impStart($w, 'ROOMAD')->body['error']);
});

test('imposters: settings out of range are refused', function () {
    $w = crewWorld();
    impRoom($w, 'ROOMAE', 6);
    foreach ([['mode' => 'chess'], ['imposters' => 3], ['rounds' => 50], ['clueSeconds' => 1], ['difficulty' => 'brutal']] as $bad) {
        eq(400, impStart($w, 'ROOMAE', ['settings' => $bad + ['mode' => 'word']])->status, json_encode($bad));
    }
});

test('imposters: five players always get one imposter, six may have two', function () {
    $w = crewWorld();
    impRoom($w, 'ROOMAF', 5, ['imposters' => 2]);
    $res = impStart($w, 'ROOMAF');
    eq(200, $res->status);
    eq(1, $res->body['settings']['imposters']);
    impRoom($w, 'ROOMAG', 6, ['imposters' => 2]);
    eq(2, impStart($w, 'ROOMAG')->body['settings']['imposters']);
});

test('imposters: a start hands the match to the referee and starts the runner', function () {
    $w = crewWorld();
    impRoom($w, 'ROOMAH', 4, ['difficulty' => 'hard', 'rounds' => 5]);
    $res = impStart($w, 'ROOMAH');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    $run = $w['rtdb']->data['imposterRuns/' . $id] ?? $w['rtdb']->get('imposterRuns/' . $id);
    eq('ROOMAH', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3', 'guest4'], $run['seats']);
    eq(5, $run['settings']['rounds']);
    eq(true, in_array($run['pair']['id'], array_column(ImposterWords::all('hard'), 'id'), true), 'a hard pair');
    $meta = $w['rtdb']->get('rooms/ROOMAH/meta');
    eq('playing', $meta['status']);
    eq('imposters', $meta['gameId']);
    eq($id, $meta['impMatch']);
    eq($run['startAt'], $meta['startAt']);
    eq(null, $meta['pick'] ?? null);
    // Nothing a phone can read holds the words.
    $public = json_encode($w['rtdb']->get('rooms/ROOMAH'));
    eq(false, str_contains($public, $run['pair']['a']) || str_contains($public, $run['pair']['b']), 'words stay off the room');
    eq(1, count($w['spawns']));
    eq('active', $w['db']->one('SELECT status FROM imposter_matches WHERE id = ?', [$id])['status']);
});

test('imposters: word pairs are never two of the same word, and a room gets fresh pairs', function () {
    foreach (ImposterWords::LEVELS as $level) {
        $all = ImposterWords::all($level);
        eq(true, count($all) >= 30, $level);
        foreach ($all as $p) eq(true, strtolower($p['a']) !== strtolower($p['b']), $p['id']);
        eq(count($all), count(array_unique(array_column($all, 'id'))), "$level ids are unique");
    }
    $all = array_column(ImposterWords::all('easy'), 'id');
    $recent = array_slice($all, 1);
    eq($all[0], ImposterWords::pick('easy', $recent)['id'], 'the only unused pair');
    eq(true, in_array(ImposterWords::pick('easy', $all)['id'], $all, true), 'all used: any pair');
    eq('normal', ImposterWords::level('medium'));
});

test('imposters: Find PlayMona players follows the crew setting and fills to five', function () {
    $w = crewWorld();
    $w['crew']->seed(8);
    impRoom($w, 'ROOMAI', 2);
    $find = fn (string $uid) => $w['routes']->handle(req('POST', '/imposters/crew', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => 'ROOMAI']]));
    eq(403, $find('host1')->status, 'crew are admins-only for now');
    $w['rtdb']->data['admins']['host1'] = true;
    eq(403, $find('guest2')->status, 'not the host');
    $res = $find('host1');
    eq(200, $res->status);
    eq(3, count($res->body['added']));
    eq(5, count($w['rtdb']->get('rooms/ROOMAI/players')));
    $runs = array_values($w['rtdb']->get('crewRuns') ?? []);
    eq('imposters', $runs[0]['gameId']);
    crewSettings($w, ['mode' => 'off']);
    eq(403, $find('host1')->status, 'crew switched off');
});

test('imposters: the referee\'s result is kept once, with a record for each seat', function () {
    $w = crewWorld();
    $w['crew']->seed(2);
    $crew = $w['crew']->all()[0];
    impRoom($w, 'ROOMAJ', 3, [], ['players' => [$crew['uid'] => ['name' => $crew['displayName'], 'online' => true, 'ready' => 'pick1']]]);
    $id = impStart($w, 'ROOMAJ')->body['matchId'];
    $report = fn (array $body) => $w['routes']->handle(req('POST', '/internal/crew/report', ['json' => $body + ['matchId' => $id, 'event' => 'imposters'], 'headers' => ['x-crew-secret' => CREW_SECRET]]));
    eq(400, $report(['winner' => 'nobody'])->status);
    $body = ['winner' => 'majority', 'rounds' => 2, 'words' => ['majority' => 'Cat', 'minority' => 'Dog'], 'seats' => [
        ['uid' => 'host1', 'side' => 'majority', 'points' => 125, 'correctVotes' => 1, 'clues' => 2],
        ['uid' => 'guest2', 'side' => 'minority', 'out' => 2, 'points' => 0],
        ['uid' => $crew['uid'], 'crew' => true, 'side' => 'majority', 'points' => 100],
    ]];
    eq(200, $report($body)->status);
    eq(200, $report($body)->status, 'a repeat is harmless');
    eq(3, (int) $w['db']->one('SELECT COUNT(*) AS n FROM imposter_seats WHERE match_id = ?', [$id])['n']);
    $m = $w['db']->one('SELECT * FROM imposter_matches WHERE id = ?', [$id]);
    eq('ended', $m['status']);
    eq('majority', $m['winner']);
    eq('Dog', $m['minority_word']);
    eq($crew['id'], $w['db']->one('SELECT crew_id FROM imposter_seats WHERE match_id = ? AND uid = ?', [$id, $crew['uid']])['crew_id'], 'the crew seat is marked');
    eq(null, $w['rtdb']->get('imposterRuns/' . $id), 'the run is cleared');
    // The runner hears it should drop the finished match.
    $hb = $w['routes']->handle(req('POST', '/internal/crew/heartbeat', ['json' => ['pid' => 5, 'matches' => [], 'imposters' => [$id, 'i_unknown']], 'headers' => ['x-crew-secret' => CREW_SECRET]]));
    eq([$id, 'i_unknown'], $hb->body['dropImposters']);
});

test('imposters: a nudge restarts the runner only when the game is stuck', function () {
    $w = crewWorld();
    impRoom($w, 'ROOMAK', 3);
    $id = impStart($w, 'ROOMAK')->body['matchId'];
    $nudge = fn (string $uid) => $w['routes']->handle(req('POST', '/imposters/nudge', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => 'ROOMAK']]));
    eq(403, $nudge('stranger')->status);
    $w['rtdb']->data['rooms']['ROOMAK']['imp'] = ['matchId' => $id, 'phase' => 'clues', 'deadline' => PlayMona\nowMs() + 60_000];
    eq(false, $nudge('guest2')->body['started'], 'on time');
});
