<?php
/* PlayMona Celebrations: the TV display and the MC panel (CelebrationStage).
   Loaded by test.php after celebrationGames.test.php and celebrationWall.test.php
   (uses celWorld, celCall, organiser, guestToken, newEvent, readyGame, wallJoin, wallPost). */
declare(strict_types=1);

echo "\nCelebrations: TV display and MC panel\n";

function stageKey(array $ev, string $kind): array { return ['x-celebration-key' => $ev['tokens'][$kind]]; }

test('stage: the TV and MC links open their pages; other secrets, guests and old links do not', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    $tv = celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')]);
    eq(200, $tv[0], json_encode($tv[1]));
    eq('vicky-birthday', $tv[1]['event']['slug']);
    eq($ev['joinCode'], $tv[1]['join']['code']);
    eq(['layout' => 'auto', 'showQr' => true, 'messageId' => null, 'at' => 0], $tv[1]['display']);
    eq(4, count($tv[1]['scores']));
    eq(true, $w['rtdb']->get("celebrations/$id/viewers/tv1"), 'the TV may watch the game');
    eq(false, isset($tv[1]['event']['tokens']), 'no secrets on the TV');
    // The MC link opens the TV page too (to check it), but the TV link never opens the MC panel.
    eq(200, celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('mc1'), 'headers' => stageKey($ev, 'mc')])[0]);
    eq(403, celCall($w, 'GET', "/c/$id/mc", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')])[0]);
    eq(403, celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('x'), 'headers' => stageKey($ev, 'celebrant')])[0]);
    eq(403, celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('x')])[0], 'no secret');
    eq(403, celCall($w, 'GET', "/c/$id/mc", ['token' => organiser(), 'headers' => ['x-celebration-key' => str_repeat('a', 43)]])[0]);
    eq(401, celCall($w, 'GET', "/c/$id/mc", ['headers' => stageKey($ev, 'mc')])[0], 'a sign-in is needed');
    $mc = celCall($w, 'GET', "/c/$id/mc", ['token' => guestToken('mc1'), 'headers' => stageKey($ev, 'mc')]);
    eq(200, $mc[0], json_encode($mc[1]));
    eq([], $mc[1]['games']);
    eq(null, $mc[1]['active']);
    eq([], $mc[1]['waiting']);
    // A new link stops the old one at once.
    $fresh = celCall($w, 'POST', "/c/$id/links/mc/regenerate", ['token' => organiser()])[1];
    eq(403, celCall($w, 'GET', "/c/$id/mc", ['token' => guestToken('mc1'), 'headers' => stageKey($ev, 'mc')])[0]);
    eq(200, celCall($w, 'GET', "/c/$id/mc", ['token' => guestToken('mc1'), 'headers' => stageKey($fresh, 'mc')])[0]);
});

test('stage: the MC picks what the TV shows; only approved messages go on it', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    $mc = fn (string $method, string $path, array $json = []) => celCall($w, $method, "/c/$id$path", ['token' => guestToken('mc1'), 'headers' => stageKey($ev, 'mc'), 'json' => $json]);
    [$s, $b] = $mc('POST', '/mc/display', ['layout' => 'scores', 'showQr' => false]);
    eq(200, $s, json_encode($b));
    eq('scores', $b['display']['layout']);
    eq(false, $b['display']['showQr']);
    eq('scores', $w['rtdb']->get("celebrations/$id/live/display/layout"), 'the TV hears at once');
    eq(400, $mc('POST', '/mc/display', ['layout' => 'disco'])[0]);
    eq(false, $mc('POST', '/mc/display', ['layout' => 'wall'])[1]['display']['showQr'], 'only the fields sent change');
    // The TV link cannot change the TV.
    eq(403, celCall($w, 'POST', "/c/$id/mc/display", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display'), 'json' => ['layout' => 'welcome']])[0]);

    wallJoin($w, $id, 'g1', 'Tendai');
    wallJoin($w, $id, 'g2', 'Rudo');
    $named = wallPost($w, $id, 'g1', ['body' => 'Happy birthday Vicky!', 'category' => 'wish'])[1]['message']['id'];
    $secret = wallPost($w, $id, 'g2', ['body' => 'You inspire me.', 'category' => 'thanks', 'anonymous' => true])[1]['message']['id'];
    $panel = $mc('GET', '/mc')[1];
    eq(2, count($panel['waiting']), 'the MC sees what is waiting');
    eq([], $panel['messages']);
    eq(null, $panel['waiting'][1]['name'], 'the MC does not see who sent an unnamed message');
    eq([], celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')])[1]['messages'], 'the TV never gets waiting messages');
    eq(409, $mc('POST', '/mc/display', ['messageId' => $named])[0], 'approve before showing');
    [$s, $b] = $mc('POST', "/mc/messages/$named/approve");
    eq(200, $s, json_encode($b));
    eq(1, count($b['messages']));
    eq(1, count($b['waiting']));
    $mc('POST', "/mc/messages/$secret/approve");
    eq(404, $mc('POST', "/mc/messages/$secret/delete")[0], 'deleting stays with the organiser');
    $tv = celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')])[1];
    eq(2, count($tv['messages']));
    eq(null, $tv['messages'][0]['name'], 'newest first, and no name on the unnamed one');
    eq('Tendai', $tv['messages'][1]['name']);
    // Show one message on its own; holding it back takes it off the TV.
    $d = $mc('POST', '/mc/display', ['messageId' => $named])[1]['display'];
    eq(['wall', $named], [$d['layout'], $d['messageId']]);
    eq($named, $w['rtdb']->get("celebrations/$id/live/display/messageId"));
    $b = $mc('POST', "/mc/messages/$named/reject")[1];
    eq(null, $b['display']['messageId']);
    eq(null, $w['rtdb']->get("celebrations/$id/live/display/messageId"));
    eq(1, count(celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')])[1]['messages']));
    $audit = array_column($w['db']->all("SELECT actor, action FROM celebration_audit WHERE cid = ? AND (action LIKE 'mc.%' OR action LIKE 'message.%') ORDER BY created_at", [$id]), 'actor');
    eq(true, count($audit) >= 5 && count(array_filter($audit, fn ($a) => $a !== 'mc:mc1')) === 0, 'the MC\'s actions are audited as the MC');
});

test('stage: the MC starts, steers and ends a game; the TV may watch it', function () {
    $w = celWorld();
    $r = readyGame($w);
    $cid = $r['cid'];
    $ev = $r['ev'];
    $mc = fn (string $method, string $path, array $json = []) => celCall($w, $method, "/c/$cid$path", ['token' => guestToken('mc1'), 'headers' => stageKey($ev, 'mc'), 'json' => $json]);
    $panel = $mc('GET', '/mc')[1];
    eq([$r['game']['id']], array_column($panel['games'], 'id'), 'published games to start');
    eq(409, $mc('POST', '/mc/control', ['action' => 'pause'])[0], 'nothing to pause yet');
    eq(404, $mc('POST', '/mc/start', ['gameId' => 'g_' . str_repeat('0', 24)])[0]);
    [$s, $b] = $mc('POST', '/mc/start', ['gameId' => $r['game']['id']]);
    eq(200, $s, json_encode($b));
    eq(true, $w['rtdb']->get("celebrations/$cid/viewers/mc1"), 'the MC may watch');
    eq($b['runId'], $mc('GET', '/mc')[1]['active']['runId']);
    eq(409, $mc('POST', '/mc/start', ['gameId' => $r['game']['id']])[0], 'one game at a time');
    eq('mc:mc1', $w['db']->one('SELECT started_by FROM celebration_runs WHERE id = ?', [$b['runId']])['started_by']);
    $tv = celCall($w, 'GET', "/c/$cid/screen", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')])[1];
    eq($b['runId'], $tv['active']['runId']);
    eq(400, $mc('POST', '/mc/control', ['action' => 'explode'])[0]);
    [$s, $c] = $mc('POST', '/mc/control', ['action' => 'pause']);
    eq(200, $s, json_encode($c));
    eq('pause', $w['rtdb']->get("celebrations/$cid/control/action"));
    // The referee reports the end; the winner screen knows the last game.
    $w['app']->celebrationGames()->recordResult(['runId' => $b['runId'], 'why' => 'done',
        'rounds' => [['round' => 0, 'teams' => [$r['gold'] => ['points' => 1400, 'solved' => true, 'usedMs' => 30000], $r['ruby'] => ['points' => 300]]]],
        'ranked' => [['teamId' => $r['gold'], 'place' => 1, 'points' => 1400], ['teamId' => $r['ruby'], 'place' => 2, 'points' => 300]]], \PlayMona\nowMs());
    $tv = celCall($w, 'GET', "/c/$cid/screen", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')])[1];
    eq(null, $tv['active']);
    eq('Baby photos', $tv['last']['name']);
    eq($r['gold'], $tv['last']['ranked'][0]['teamId']);
    eq(1400, $tv['scores'][0]['points']);
    eq($r['gold'], $tv['scores'][0]['teamId']);
});

test('stage: the organiser can hide the TV QR code; nobody else can that way', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    eq(['showQr' => true], celCall($w, 'GET', "/c/$id/display", ['token' => organiser()])[1]);
    [$s, $b] = celCall($w, 'POST', "/c/$id/display", ['token' => organiser(), 'json' => ['showQr' => false, 'layout' => 'wall']]);
    eq(200, $s, json_encode($b));
    eq(['showQr' => false], $b);
    $tv = celCall($w, 'GET', "/c/$id/screen", ['token' => guestToken('tv1'), 'headers' => stageKey($ev, 'display')])[1]['display'];
    eq(false, $tv['showQr']);
    eq('auto', $tv['layout'], 'the organiser route only changes the QR');
    eq(false, $w['rtdb']->get("celebrations/$id/live/display/showQr"));
    eq(403, celCall($w, 'POST', "/c/$id/display", ['token' => guestToken('g1'), 'json' => ['showQr' => true]])[0], 'a guest');
    eq(403, celCall($w, 'POST', "/c/$id/display", ['token' => organiser('someone'), 'json' => ['showQr' => true]])[0], 'another account');
    // The MC still turns it back on.
    celCall($w, 'POST', "/c/$id/mc/display", ['token' => guestToken('mc1'), 'headers' => stageKey($ev, 'mc'), 'json' => ['showQr' => true]]);
    eq(['showQr' => true], celCall($w, 'GET', "/c/$id/display", ['token' => organiser()])[1]);
});
