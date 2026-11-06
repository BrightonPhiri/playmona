<?php
/* WordFlow: the server-run start, settings, "Find PlayMona players", nudges, results, and the AI
   judge and crew word (with their no-AI fallbacks). Loaded by test.php after crew.test.php
   (uses its harness and crewWorld). */
declare(strict_types=1);

use PlayMona\{WordFlow, WordFlowJudge};

echo "\nWordFlow\n";

/** A lobby room with $n players who all said ready for a WordFlow pick. */
function wfRoom(array $w, string $code, int $n, array $settings = []): void
{
    $players = [];
    for ($i = 1; $i <= $n; $i++) {
        $uid = $i === 1 ? 'host1' : 'guest' . $i;
        $players[$uid] = ['name' => 'P' . $i, 'joinedAt' => $i, 'online' => true, 'ready' => 'pick1'];
    }
    $w['rtdb']->data['rooms'][$code] = [
        'meta' => ['seed' => 1, 'status' => 'lobby', 'appVersion' => '2.0.0', 'hostUid' => 'host1', 'ownerUid' => 'host1',
            'pick' => ['id' => 'pick1', 'gameId' => 'wordFlow', 'settings' => $settings + ['mode' => 'sentences']]],
        'players' => $players,
    ];
}

function wfStart(array $w, string $code, array $body = [], string $uid = 'host1')
{
    return $w['routes']->handle(req('POST', '/wordflow/start', ['token' => idToken(['sub' => $uid, 'user_id' => $uid]), 'json' => ['roomCode' => $code] + $body]));
}

function wfInternal(array $w, string $action, array $body)
{
    return $w['routes']->handle(req('POST', '/internal/crew/' . $action, ['json' => $body, 'headers' => ['x-crew-secret' => CREW_SECRET]]));
}

test('wordflow: only the host of a lobby room with a ready check can start', function () {
    $w = crewWorld();
    wfRoom($w, 'WFAA', 3);
    eq(403, wfStart($w, 'WFAA', [], 'guest2')->status, 'not the host');
    eq(400, wfStart($w, 'bad!')->status, 'bad room code');
    $w['rtdb']->data['rooms']['WFAA']['meta']['status'] = 'playing';
    eq(409, wfStart($w, 'WFAA')->status, 'already playing');
    $w['rtdb']->data['rooms']['WFAA']['meta']['status'] = 'lobby';
    $w['rtdb']->data['rooms']['WFAA']['meta']['pick']['gameId'] = 'imposters';
    eq('no-pick', wfStart($w, 'WFAA')->body['error'], 'a different game was picked');
});

test('wordflow: one player, or someone not ready, cannot start', function () {
    $w = crewWorld();
    wfRoom($w, 'WFAB', 1);
    eq('too-few', wfStart($w, 'WFAB')->body['error']);
    wfRoom($w, 'WFAC', 3);
    $w['rtdb']->data['rooms']['WFAC']['players']['guest3']['ready'] = null;
    eq('not-ready', wfStart($w, 'WFAC')->body['error']);
});

test('wordflow: settings out of range are refused; good ones are kept', function () {
    $w = crewWorld();
    wfRoom($w, 'WFAD', 2);
    foreach ([['mode' => 'novel'], ['gameSeconds' => 1], ['turnSeconds' => 99]] as $bad) {
        eq(400, wfStart($w, 'WFAD', ['settings' => $bad])->status, json_encode($bad));
    }
    eq(['mode' => 'sentences', 'gameSeconds' => 180, 'turnSeconds' => 20], WordFlow::settings([]));
    eq(['mode' => 'story', 'gameSeconds' => 300, 'turnSeconds' => 10], WordFlow::settings(['mode' => 'story', 'gameSeconds' => '300', 'turnSeconds' => 10]));
});

test('wordflow: a start hands the match to the runner and opens the room', function () {
    $w = crewWorld();
    wfRoom($w, 'WFAE', 3, ['mode' => 'story', 'gameSeconds' => 120, 'turnSeconds' => 30]);
    $w['rtdb']->data['rooms']['WFAE']['wf'] = ['matchId' => 'old'];
    $w['rtdb']->data['rooms']['WFAE']['wfInbox'] = ['host1' => ['x' => 1]];
    $res = wfStart($w, 'WFAE');
    eq(200, $res->status);
    $id = $res->body['matchId'];
    eq(1, preg_match('/^w_[0-9a-f]{24}$/', $id));
    $run = $w['rtdb']->get('wordflowRuns/' . $id);
    eq('WFAE', $run['roomCode']);
    eq(['host1', 'guest2', 'guest3'], $run['seats']);
    eq('story', $run['settings']['mode']);
    $room = $w['rtdb']->get('rooms/WFAE');
    eq('playing', $room['meta']['status']);
    eq('wordFlow', $room['meta']['gameId']);
    eq($id, $room['meta']['wfMatch']);
    eq(false, isset($room['wf']), 'the old view is cleared');
    eq(false, isset($room['wfInbox']));
    eq(1, count($w['spawns']), 'the runner is started');
    eq('active', $w['db']->one('SELECT status FROM wordflow_matches WHERE id = ?', [$id])['status']);
});

test('wordflow: the result is kept once, and the run is cleared', function () {
    $w = crewWorld();
    wfRoom($w, 'WFAF', 2);
    $id = wfStart($w, 'WFAF')->body['matchId'];
    $w['rtdb']->set('wordflowState/' . $id, ['v' => 1]);
    $body = ['matchId' => $id, 'event' => 'wordflow', 'accepted' => 2, 'rejected' => 1, 'totalWords' => 9,
        'seats' => [['uid' => 'host1', 'words' => 5, 'points' => 5, 'won' => true], ['uid' => 'guest2', 'words' => 4, 'points' => 4, 'won' => false]]];
    eq(200, wfInternal($w, 'report', $body)->status);
    eq(200, wfInternal($w, 'report', $body)->status, 'a repeat is fine');
    $m = $w['db']->one('SELECT * FROM wordflow_matches WHERE id = ?', [$id]);
    eq(['ended', 2, 1, 9], [$m['status'], (int) $m['sentences_accepted'], (int) $m['sentences_rejected'], (int) $m['total_words']]);
    $seats = $w['db']->all('SELECT uid, points, won FROM wordflow_seats WHERE match_id = ? ORDER BY uid', [$id]);
    eq(2, count($seats), 'no duplicate rows');
    eq(['guest2', 4, 0], [$seats[0]['uid'], (int) $seats[0]['points'], (int) $seats[0]['won']]);
    eq(null, $w['rtdb']->get('wordflowRuns/' . $id));
    eq(null, $w['rtdb']->get('wordflowState/' . $id));
    $hb = wfInternal($w, 'heartbeat', ['pid' => 5, 'matches' => [], 'wordflow' => [$id, 'w_unknown']]);
    eq([$id, 'w_unknown'], $hb->body['dropWordflow'], 'the runner lets go of finished matches');
});

test('wordflow: the internal routes need the runner secret', function () {
    $w = crewWorld();
    $res = $w['routes']->handle(req('POST', '/internal/crew/wordflow/judge', ['json' => ['sentence' => 'Hi.'], 'headers' => ['x-crew-secret' => 'wrong-wrong-wrong-wrong-wrong']]));
    eq(403, $res->status);
});

test('wordflow: with no AI the judge answers null, so the referee uses its rules', function () {
    $w = crewWorld();
    wfRoom($w, 'WFAG', 2);
    $id = wfStart($w, 'WFAG')->body['matchId'];
    $res = wfInternal($w, 'wordflow/judge', ['matchId' => $id, 'mode' => 'sentences', 'sentence' => 'The cat sat.']);
    eq(200, $res->status);
    eq(null, $res->body['verdict']);
    eq(null, wfInternal($w, 'wordflow/word', ['matchId' => $id, 'current' => 'The'])->body['suggestion']);
    eq(400, wfInternal($w, 'wordflow/judge', ['matchId' => $id, 'sentence' => '  '])->status);
});

test('wordflow: the AI judge is asked steadily, with the story, and its answer checked', function () {
    $w = crewWorld();
    $w['ai']->saveProvider(['vendor' => 'deepseek', 'apiKey' => 'sk-abc'], 1);
    wfRoom($w, 'WFAH', 2, ['mode' => 'story']);
    $id = wfStart($w, 'WFAH')->body['matchId'];
    $w['http']->replies[] = FakeHttp::chat(['ok' => false, 'reason' => 'This has nothing to do with the dragon.']);
    $res = wfInternal($w, 'wordflow/judge', ['matchId' => $id, 'mode' => 'story', 'sentence' => 'Bananas are yellow.', 'story' => ['A dragon lived in a cave.']]);
    eq(['ok' => false, 'reason' => 'This has nothing to do with the dragon.'], $res->body['verdict']);
    $sent = json_decode($w['http']->calls[0]['body'], true);
    eq(0.2, $sent['temperature']);
    eq(true, str_contains($sent['messages'][0]['content'], 'follow on from the story'));
    eq(true, str_contains($sent['messages'][1]['content'], 'A dragon lived in a cave.'));
    // A nonsense answer is not used.
    $w['http']->replies[] = FakeHttp::chat(['verdict' => 'maybe']);
    eq(null, wfInternal($w, 'wordflow/judge', ['matchId' => $id, 'mode' => 'story', 'sentence' => 'The dragon slept.'])->body['verdict']);
    // The same sentence is judged the same way again, from the cache.
    $before = count($w['http']->calls);
    $again = wfInternal($w, 'wordflow/judge', ['matchId' => $id, 'mode' => 'story', 'sentence' => 'Bananas are yellow.', 'story' => ['A dragon lived in a cave.']]);
    eq(false, $again->body['verdict']['ok']);
    eq($before, count($w['http']->calls));
    // Finished matches spend nothing.
    wfInternal($w, 'report', ['matchId' => $id, 'event' => 'wordflow', 'seats' => []]);
    eq(null, wfInternal($w, 'wordflow/judge', ['matchId' => $id, 'sentence' => 'The end.'])->body['verdict']);
});

test('wordflow: crew words from the AI are one word, and capped per match', function () {
    $w = crewWorld();
    $w['ai']->saveProvider(['vendor' => 'deepseek', 'apiKey' => 'sk-abc'], 1);
    wfRoom($w, 'WFAI', 2);
    $id = wfStart($w, 'WFAI')->body['matchId'];
    $w['http']->replies[] = FakeHttp::chat(['word' => 'castle.']);
    eq(['word' => 'castle.'], wfInternal($w, 'wordflow/word', ['matchId' => $id, 'current' => 'The dragon flew to the'])->body['suggestion']);
    $w['http']->replies[] = FakeHttp::chat(['word' => 'two words']);
    eq(null, wfInternal($w, 'wordflow/word', ['matchId' => $id, 'current' => 'The'])->body['suggestion']);
    $w['db']->run('UPDATE wordflow_matches SET ai_words = ? WHERE id = ?', [WordFlowJudge::CREW_AI_WORDS, $id]);
    $calls = count($w['http']->calls);
    eq(null, wfInternal($w, 'wordflow/word', ['matchId' => $id, 'current' => 'The'])->body['suggestion']);
    eq($calls, count($w['http']->calls), 'over the cap: no AI call');
});

test('wordflow: a stuck match wakes the runner; abandoned ones are swept', function () {
    $w = crewWorld();
    wfRoom($w, 'WFAJ', 2);
    $res = wfStart($w, 'WFAJ');
    $id = $res->body['matchId'];
    $nudge = fn (int $now) => $w['app']->wordflow()->nudge(human('host1'), ['roomCode' => 'WFAJ'], $now);
    $w['rtdb']->data['rooms']['WFAJ']['wf'] = ['phase' => 'playing', 'turnDeadline' => 5000, 'gameDeadline' => 90000];
    eq(false, $nudge(6000)['started'], 'not late yet');
    $w['runner']->stopped(0);
    eq(true, is_bool($nudge(20000)['started']));
    eq(1, $w['app']->wordflow()->sweep(PlayMona\nowMs() + 25 * 3600 * 1000));
    eq('abandoned', $w['db']->one('SELECT status FROM wordflow_matches WHERE id = ?', [$id])['status']);
});
