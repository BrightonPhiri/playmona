<?php
/* PlayMona Celebrations games: the organiser's game builder, starting a game for the crew runner's
   referee, the organiser's controls, and scores into the leaderboard.
   Loaded by test.php after celebrations.test.php (uses its celWorld, celCall, organiser, guestToken, newEvent). */
declare(strict_types=1);

use function PlayMona\nowMs;

echo "\nCelebrations games\n";

function puzzlePhoto(array $w, string $cid, string $uid = 'org1'): string
{
    [$s, $m] = celCall($w, 'POST', "/c/$cid/media", ['token' => organiser($uid), 'query' => ['purpose' => 'puzzle'], 'raw' => photoJpeg(900, 900)]);
    eq(200, $s, json_encode($m));
    return $m['id'];
}

/** An event with a published Picture Rush game of two photos, and guests in two teams. */
function readyGame(array $w): array
{
    $ev = newEvent($w);
    $cid = $ev['id'];
    [$s, $g] = celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'pictureRush', 'name' => 'Baby photos']]);
    eq(200, $s, json_encode($g));
    $p1 = puzzlePhoto($w, $cid);
    $p2 = puzzlePhoto($w, $cid);
    [$s, $g] = celCall($w, 'POST', "/c/$cid/games/{$g['id']}/save", ['token' => organiser(), 'json' => ['config' => [
        'level' => 'easy', 'seconds' => 60, 'photos' => [['id' => $p1, 'title' => 'Vicky at 1', 'hint' => 'Cake'], ['id' => $p2, 'title' => 'Graduation']],
    ]]]);
    eq(200, $s, json_encode($g));
    eq(200, celCall($w, 'POST', "/c/$cid/games/{$g['id']}/publish", ['token' => organiser()])[0]);
    $gold = $ev['teams'][0]['id'];
    $ruby = $ev['teams'][2]['id'];
    foreach (['g1' => $gold, 'g2' => $gold, 'g3' => $ruby, 'g4' => null] as $uid => $team) {
        eq(200, celCall($w, 'POST', "/c/$cid/join", ['token' => guestToken($uid), 'json' => ['name' => strtoupper($uid)] + ($team ? ['teamId' => $team] : [])])[0]);
    }
    return ['ev' => $ev, 'cid' => $cid, 'game' => $g, 'gold' => $gold, 'ruby' => $ruby, 'photos' => [$p1, $p2]];
}

test('celebration games: the organiser builds a Picture Rush game; settings and photos are checked', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $cid = $ev['id'];
    eq(400, celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'pinball']])[0]);
    eq(403, celCall($w, 'POST', "/c/$cid/games", ['token' => organiser('someoneElse'), 'json' => ['template' => 'pictureRush']])[0]);
    eq(403, celCall($w, 'POST', "/c/$cid/games", ['token' => guestToken('g1'), 'json' => ['template' => 'pictureRush']])[0]);
    [$s, $g] = celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'pictureRush', 'name' => 'Baby photos']]);
    eq(200, $s);
    eq('draft', $g['status']);
    eq('medium', $g['config']['level']);
    $mine = puzzlePhoto($w, $cid);
    [, $cover] = celCall($w, 'POST', "/c/$cid/media", ['token' => organiser(), 'query' => ['purpose' => 'cover'], 'raw' => photoJpeg()]);
    $other = newEvent($w);
    $theirs = puzzlePhoto($w, $other['id']);
    [$s, $g] = celCall($w, 'POST', "/c/$cid/games/{$g['id']}/save", ['token' => organiser(), 'json' => [
        'name' => '  Baby   photos ', 'instructions' => "Swap tiles.\nHave fun.",
        'config' => ['level' => 'expert', 'seconds' => '90', 'reveal' => 7, 'hints' => 2, 'rounds' => 9,
            'scoring' => ['base' => 2000, 'speed' => 99999, 'hintCost' => -4],
            'photos' => [['id' => $mine, 'title' => 'Vicky at one', 'hint' => 'Cake'], ['id' => $cover['id']], ['id' => $theirs], ['id' => $mine], ['id' => 'x']]],
    ]]);
    eq(200, $s, json_encode($g));
    eq('Baby photos', $g['name']);
    eq('expert', $g['config']['level']);
    eq(90, $g['config']['seconds'], 'numbers from forms');
    eq(3, $g['config']['reveal'], 'not offered: the standard');
    eq(1, count($g['config']['photos']), 'only this event\'s own puzzle photos, once each');
    eq('Vicky at one', $g['config']['photos'][0]['title']);
    eq(true, str_contains($g['config']['photos'][0]['thumb'], '/api/c/media/' . $mine . '/thumb'), 'signed thumbnails for the editor');
    eq(1, $g['config']['rounds'], 'never more rounds than photos');
    eq([2000, 5000, 0, 500], array_values($g['config']['scoring']));
    // Duplicate, deactivate, delete.
    [$s, $copy] = celCall($w, 'POST', "/c/$cid/games/{$g['id']}/duplicate", ['token' => organiser()]);
    eq('Copy of Baby photos', $copy['name']);
    eq('draft', $copy['status']);
    eq(2, count(celCall($w, 'GET', "/c/$cid/games", ['token' => organiser()])[1]['games']));
    eq('published', celCall($w, 'POST', "/c/$cid/games/{$g['id']}/publish", ['token' => organiser()])[1]['status']);
    eq('inactive', celCall($w, 'POST', "/c/$cid/games/{$g['id']}/deactivate", ['token' => organiser()])[1]['status']);
    eq(200, celCall($w, 'POST', "/c/$cid/games/{$copy['id']}/delete", ['token' => organiser()])[0]);
    eq(1, count(celCall($w, 'GET', "/c/$cid/games", ['token' => organiser()])[1]['games']));
    eq(404, celCall($w, 'GET', "/c/$cid/games/{$copy['id']}", ['token' => organiser()])[0]);
    // A game with no photos cannot be published.
    [, $empty] = celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'pictureRush']]);
    eq(409, celCall($w, 'POST', "/c/$cid/games/{$empty['id']}/publish", ['token' => organiser()])[0]);
});

test('celebration games: starting hands the run to the referee with the teams that have players', function () {
    $w = celWorld();
    $r = readyGame($w);
    $cid = $r['cid'];
    $gid = $r['game']['id'];
    eq(403, celCall($w, 'POST', "/c/$cid/games/$gid/start", ['token' => guestToken('g1')])[0]);
    [$s, $out] = celCall($w, 'POST', "/c/$cid/games/$gid/start", ['token' => organiser()]);
    eq(200, $s, json_encode($out));
    $run = $w['rtdb']->get('celebrationRuns/' . $out['runId']);
    eq('pictureRush', $run['template']);
    eq($cid, $run['cid']);
    eq([$r['gold'], $r['ruby']], array_keys($run['teams']), 'only teams with players');
    eq(['g1', 'g2'], array_column($run['teams'][$r['gold']]['members'], 'uid'));
    eq(2, count($run['config']['photos']));
    eq(true, str_contains($run['config']['photos'][0]['url'], '/api/c/media/' . $r['photos'][0] . '/play'), 'the referee gets signed picture links');
    eq(true, $out['startAt'] > nowMs(), 'a countdown first');
    eq($out['runId'], $w['rtdb']->get("celebrations/$cid/live/run/runId"), 'phones learn a game started');
    eq(true, $w['rtdb']->get("celebrations/$cid/viewers/org1"), 'the organiser may watch the game');
    eq(1, count($w['spawns']), 'the runner is started');
    eq(409, celCall($w, 'POST', "/c/$cid/games/$gid/start", ['token' => organiser()])[0], 'one game at a time');
    eq(409, celCall($w, 'POST', "/c/$cid/games/$gid/delete", ['token' => organiser()])[0], 'a game being played stays');
    eq($out['runId'], celCall($w, 'GET', "/c/$cid/play", ['token' => organiser()])[1]['active']['runId']);
    eq(403, celCall($w, 'GET', "/c/$cid/play", ['token' => guestToken('g1')])[0]);
});

test('celebration games: a game needs players in teams and must be published', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $cid = $ev['id'];
    [, $g] = celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'pictureRush']]);
    $p = puzzlePhoto($w, $cid);
    celCall($w, 'POST', "/c/$cid/games/{$g['id']}/save", ['token' => organiser(), 'json' => ['config' => ['photos' => [['id' => $p]]]]]);
    eq(409, celCall($w, 'POST', "/c/$cid/games/{$g['id']}/start", ['token' => organiser()])[0], 'a draft');
    celCall($w, 'POST', "/c/$cid/games/{$g['id']}/publish", ['token' => organiser()]);
    celCall($w, 'POST', "/c/$cid/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Ann']]);
    [$s, $b] = celCall($w, 'POST', "/c/$cid/games/{$g['id']}/start", ['token' => organiser()]);
    eq(409, $s, 'nobody in a team');
    eq(true, str_contains(json_encode($b), 'no-players'), json_encode($b));
});

test('celebration games: the organiser\'s controls reach the referee', function () {
    $w = celWorld();
    $r = readyGame($w);
    $cid = $r['cid'];
    eq(409, celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'pause']])[0], 'nothing to control yet');
    [, $out] = celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()]);
    eq(400, celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'explode']])[0]);
    eq(403, celCall($w, 'POST', "/c/$cid/play/control", ['token' => guestToken('g1'), 'json' => ['action' => 'end']])[0]);
    [$s, $c] = celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'pause']]);
    eq(200, $s);
    $live = $w['rtdb']->get("celebrations/$cid/control");
    eq('pause', $live['action']);
    eq($out['runId'], $live['runId']);
    eq($c['control']['id'], $live['id']);
    $next = celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'resume']])[1];
    eq(true, $next['control']['id'] !== $c['control']['id'], 'every control is new');
});

test('celebration games: results become the leaderboard, once, and the runner lets go', function () {
    $w = celWorld();
    $r = readyGame($w);
    $cid = $r['cid'];
    [, $out] = celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()]);
    $runId = $out['runId'];
    $games = $w['app']->celebrationGames();
    eq([], $games->stillActive([$runId]), 'still playing');
    $report = [
        'runId' => $runId, 'why' => 'done',
        'rounds' => [
            ['round' => 0, 'teams' => [$r['gold'] => ['points' => 1300, 'solved' => true, 'usedMs' => 20000, 'moves' => 9], $r['ruby'] => ['points' => 200, 'solved' => false, 'usedMs' => 60000], 't_fake' => ['points' => 99999]]],
            ['round' => 1, 'teams' => [$r['gold'] => ['points' => 1100, 'solved' => true, 'usedMs' => 40000], $r['ruby'] => ['points' => 1400, 'solved' => true, 'usedMs' => 10000]]],
        ],
        'ranked' => [['teamId' => $r['gold'], 'place' => 1, 'points' => 2400], ['teamId' => $r['ruby'], 'place' => 2, 'points' => 1600]],
    ];
    $games->recordResult($report, nowMs());
    $games->recordResult($report, nowMs());
    $board = celCall($w, 'GET', "/c/$cid/play", ['token' => organiser()])[1];
    eq(null, $board['active']);
    eq($r['gold'], $board['scores'][0]['teamId']);
    eq(2400, $board['scores'][0]['points'], 'counted once');
    eq(1600, $board['scores'][1]['points']);
    eq(0, $board['scores'][2]['points'], 'teams that did not play are on the board with 0');
    eq(4, count($board['scores']), 'only real teams');
    eq(['points' => 2400, 'place' => 1, 'games' => 1], $w['rtdb']->get("celebrations/$cid/live/scores/{$r['gold']}"));
    eq(null, $w['rtdb']->get("celebrations/$cid/live/run"), 'phones learn the game is over');
    eq(null, $w['rtdb']->get("celebrationRuns/$runId"));
    eq([$runId], $games->stillActive([$runId]), 'the runner drops it');
    // A second game adds to the totals.
    [, $out2] = celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()]);
    $games->recordResult(['runId' => $out2['runId'], 'rounds' => [['round' => 0, 'teams' => [$r['ruby'] => ['points' => 1000, 'solved' => true, 'usedMs' => 5000]]]]], nowMs());
    $scores = $games->scores($cid);
    eq([$r['ruby'], 2600], [$scores[0]['teamId'], $scores[0]['points']]);
    eq(2, $w['rtdb']->get("celebrations/$cid/live/scores/{$r['ruby']}/games"));
});

test('celebration games: equal totals rank by time; abandoned runs are swept; ending with no referee frees the event', function () {
    $w = celWorld();
    $r = readyGame($w);
    $cid = $r['cid'];
    $games = $w['app']->celebrationGames();
    [, $out] = celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()]);
    $games->recordResult(['runId' => $out['runId'], 'rounds' => [['round' => 0, 'teams' => [
        $r['gold'] => ['points' => 1000, 'usedMs' => 30000], $r['ruby'] => ['points' => 1000, 'usedMs' => 20000],
    ]]]], nowMs());
    $s = $games->scores($cid);
    eq([$r['ruby'], 1], [$s[0]['teamId'], $s[0]['place']]);
    eq([$r['gold'], 2], [$s[1]['teamId'], $s[1]['place']]);
    // Old runs are ended by the cron sweep.
    celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()]);
    eq(0, $games->sweep(nowMs()));
    eq(1, $games->sweep(nowMs() + 25 * 3600 * 1000));
    eq(null, $w['rtdb']->get("celebrations/$cid/live/run"));
    // With no runner alive, "end" ends the run itself so a new game can start.
    celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()]);
    $w['runner']->stopped(0);
    celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'end']]);
    eq(200, celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()])[0], 'not stuck');
});

test('celebration games: guests see the games planned, without any pictures', function () {
    $w = celWorld();
    $r = readyGame($w);
    $cid = $r['cid'];
    celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'pictureRush', 'name' => 'Draft one']]);
    [$s, $b] = celCall($w, 'GET', "/c/$cid/lineup", ['token' => guestToken('g1')]);
    eq(200, $s, json_encode($b));
    eq(1, count($b['games']), 'drafts hidden');
    $g = $b['games'][0];
    eq('Baby photos', $g['name']);
    eq('pictureRush', $g['template']);
    eq(2, $g['rounds']);
    eq('easy', $g['level']);
    eq(false, $g['live']);
    eq(false, array_key_exists('thumb', $g));
    eq(false, array_key_exists('photos', $g));
    eq(false, str_contains(json_encode($b), '/api/c/media'), 'no picture links');
    eq(false, str_contains(json_encode($b), 'Vicky at 1'), 'no photo titles');
    eq(404, celCall($w, 'GET', "/c/$cid/lineup", ['token' => guestToken('stranger')])[0], 'not joined');
    eq(200, celCall($w, 'GET', "/c/$cid/lineup", ['token' => organiser()])[0], 'the organiser');
    // While it is being played it says so.
    eq(200, celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()])[0]);
    eq(true, celCall($w, 'GET', "/c/$cid/lineup", ['token' => guestToken('g1')])[1]['games'][0]['live']);
});

/** An event with a published Word by Word game, and guests in two teams. */
function wordGame(array $w, array $config = [], array $settings = ['approveMessages' => true]): array
{
    $ev = newEvent($w, ['settings' => $settings]);
    $cid = $ev['id'];
    [$s, $g] = celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'wordByWord', 'name' => 'For Vicky']]);
    eq(200, $s, json_encode($g));
    if ($config) celCall($w, 'POST', "/c/$cid/games/{$g['id']}/save", ['token' => organiser(), 'json' => ['config' => $config]]);
    eq(200, celCall($w, 'POST', "/c/$cid/games/{$g['id']}/publish", ['token' => organiser()])[0]);
    $gold = $ev['teams'][0]['id'];
    $ruby = $ev['teams'][2]['id'];
    foreach (['g1' => $gold, 'g3' => $ruby] as $uid => $team) {
        eq(200, celCall($w, 'POST', "/c/$cid/join", ['token' => guestToken($uid), 'json' => ['name' => strtoupper($uid), 'teamId' => $team]])[0]);
    }
    return ['ev' => $ev, 'cid' => $cid, 'game' => $g, 'gold' => $gold, 'ruby' => $ruby];
}

test('word by word: the organiser adds one, settings are cleaned, it publishes with no content', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $cid = $ev['id'];
    [$s, $g] = celCall($w, 'POST', "/c/$cid/games", ['token' => organiser(), 'json' => ['template' => 'wordByWord']]);
    eq(200, $s, json_encode($g));
    eq('wordByWord', $g['template']);
    eq(['mode' => 'open', 'rounds' => 3, 'minUnit' => 'rounds', 'minCount' => 2, 'seconds' => 20, 'opening' => '', 'names' => []], $g['config']);
    eq(true, str_contains($g['instructions'], 'Vicky'), 'the instructions name the celebrant: ' . $g['instructions']);
    [$s, $g] = celCall($w, 'POST', "/c/$cid/games/{$g['id']}/save", ['token' => organiser(), 'json' => ['config' => [
        'mode' => 'blind', 'rounds' => 99, 'seconds' => 7, 'minUnit' => 'words', 'minCount' => 500,
        'opening' => 'Dear Vicky,', 'names' => ['Vics', 'two words', '', str_repeat('x', 30), 'Vics'],
    ]]]);
    eq(200, $s, json_encode($g));
    eq('blind', $g['config']['mode']);
    eq(10, $g['config']['rounds']);
    eq(20, $g['config']['seconds']);
    eq(100, $g['config']['minCount']);
    eq('Dear Vicky,', $g['config']['opening']);
    eq(['Vics'], $g['config']['names']);
    eq(3, celCall($w, 'POST', "/c/$cid/games/{$g['id']}/save", ['token' => organiser(), 'json' => ['config' => ['rounds' => 3, 'minCount' => 9]]])[1]['config']['minCount'], 'never more rounds than the game');
    [$s, $p] = celCall($w, 'POST', "/c/$cid/games/{$g['id']}/publish", ['token' => organiser()]);
    eq(200, $s, json_encode($p));
    eq('published', $p['status']);
});

test('word by word: starting sends the celebrant and makes the organiser staff', function () {
    $w = celWorld();
    $r = wordGame($w);
    [$s, $out] = celCall($w, 'POST', "/c/{$r['cid']}/games/{$r['game']['id']}/start", ['token' => organiser()]);
    eq(200, $s, json_encode($out));
    $run = $w['rtdb']->get('celebrationRuns/' . $out['runId']);
    eq('wordByWord', $run['template']);
    eq('Vicky', $run['celebrant']);
    eq(true, $w['rtdb']->get("celebrations/{$r['cid']}/staffers/org1"), 'the organiser may read the blind message');
    eq(null, $w['rtdb']->get("celebrations/{$r['cid']}/staffers/g1"), 'a guest may not');
    $w['rtdb']->set("celebrations/{$r['cid']}/staffers/org1", null);
    celCall($w, 'GET', "/c/{$r['cid']}/play", ['token' => organiser()]);
    eq(true, $w['rtdb']->get("celebrations/{$r['cid']}/staffers/org1"), 'opening the live panel again makes them staff again');
});

test('word by word: the MC strikes a word', function () {
    $w = celWorld();
    $r = wordGame($w);
    $cid = $r['cid'];
    [, $out] = celCall($w, 'POST', "/c/$cid/games/{$r['game']['id']}/start", ['token' => organiser()]);
    [$s, $c] = celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'strike', 'index' => 2, 'word' => 'rubbish']]);
    eq(200, $s, json_encode($c));
    $live = $w['rtdb']->get("celebrations/$cid/control");
    eq('strike', $live['action']);
    eq(2, $live['index']);
    eq('rubbish', $live['word'], 'the referee checks it is still the word at that place');
    $audit = $w['db']->one("SELECT detail FROM celebration_audit WHERE cid = ? AND action = 'game.strike'", [$cid]);
    eq(2, json_decode($audit['detail'], true)['index']);
    eq('rubbish', json_decode($audit['detail'], true)['word'], 'the audit names the word');
    eq($out['runId'], json_decode($audit['detail'], true)['runId']);
    $bad = celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'strike', 'index' => -1, 'word' => 'x']]);
    eq(400, $bad[0]);
    eq('bad-index', $bad[1]['error']);
    eq(400, celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'strike', 'word' => 'x']])[0], 'an index is needed');
    $noWord = celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'strike', 'index' => 1]]);
    eq(400, $noWord[0], 'the word is needed');
    eq('bad-word', $noWord[1]['error']);
    eq(400, celCall($w, 'POST', "/c/$cid/play/control", ['token' => organiser(), 'json' => ['action' => 'strike', 'index' => 1, 'word' => str_repeat('a', 27)]])[0], 'too long');
    // Picture Rush has no words to strike.
    $pr = readyGame($w);
    celCall($w, 'POST', "/c/{$pr['cid']}/games/{$pr['game']['id']}/start", ['token' => organiser()]);
    $no = celCall($w, 'POST', "/c/{$pr['cid']}/play/control", ['token' => organiser(), 'json' => ['action' => 'strike', 'index' => 0, 'word' => 'x']]);
    eq(400, $no[0]);
    eq('bad-action', $no[1]['error']);
});

function wordReport(string $runId, array $r, string $text, int $added): array
{
    $words = [];
    for ($i = 0; $i < $added; $i++) $words[] = ['w' => 'w' . $i, 'teamId' => $i % 2 ? $r['ruby'] : $r['gold']];
    return [
        'runId' => $runId, 'template' => 'wordByWord', 'why' => 'done',
        'rounds' => [['round' => 0, 'teams' => [$r['gold'] => ['points' => 9, 'usedMs' => 8000], $r['ruby'] => ['points' => 13, 'usedMs' => 9000]]]],
        'ranked' => [['teamId' => $r['ruby'], 'place' => 1, 'points' => 13], ['teamId' => $r['gold'], 'place' => 2, 'points' => 9]],
        'message' => ['text' => $text, 'words' => $words],
    ];
}

test('word by word: the finished message goes to the Wall once', function () {
    foreach ([[true, 'pending'], [false, 'approved']] as [$approve, $status]) {
        $w = celWorld();
        $r = wordGame($w, [], ['approveMessages' => $approve]);
        [, $out] = celCall($w, 'POST', "/c/{$r['cid']}/games/{$r['game']['id']}/start", ['token' => organiser()]);
        $games = $w['app']->celebrationGames();
        $report = wordReport($out['runId'], $r, 'Dear Vicky, we love you.', 3);
        $games->recordResult($report, nowMs());
        $games->recordResult($report, nowMs());
        $rows = $w['db']->all('SELECT * FROM celebration_messages WHERE cid = ?', [$r['cid']]);
        eq(1, count($rows), 'once');
        eq('From everyone', $rows[0]['name']);
        eq('game:' . $out['runId'], $rows[0]['uid']);
        eq('wish', $rows[0]['category']);
        eq('Dear Vicky, we love you.', $rows[0]['body']);
        eq($status, $rows[0]['status']);
        $scores = $games->scores($r['cid']);
        eq([$r['ruby'], 13], [$scores[0]['teamId'], $scores[0]['points']]);
    }
});

test('word by word: a one-word message is not kept', function () {
    $w = celWorld();
    $r = wordGame($w);
    [, $out] = celCall($w, 'POST', "/c/{$r['cid']}/games/{$r['game']['id']}/start", ['token' => organiser()]);
    $w['app']->celebrationGames()->recordResult(wordReport($out['runId'], $r, 'Love.', 1), nowMs());
    eq(0, (int) $w['db']->one('SELECT COUNT(*) AS n FROM celebration_messages WHERE cid = ?', [$r['cid']])['n']);
    eq(13, $w['app']->celebrationGames()->scores($r['cid'])[0]['points'], 'the points still count');
});
