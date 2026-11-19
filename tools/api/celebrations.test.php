<?php
/* PlayMona Celebrations: events, teams, guests, private links and pictures.
   Loaded by test.php (uses its harness: world, idToken, req, photoJpeg). */
declare(strict_types=1);

use PlayMona\App;
use PlayMona\CelebrationMedia;
use PlayMona\Routes;
use PlayMona\Runner;

echo "\nCelebrations\n";

function celWorld(): array
{
    $w = world();
    $dir = sys_get_temp_dir() . '/playmona-test-cel-' . bin2hex(random_bytes(4));
    // Runner starts are counted, never run.
    $spawns = new ArrayObject();
    $runner = new Runner($w['db'], $w['app']->config, function (array $c) use ($spawns) { $spawns[] = $c; return true; });
    $app = new App($w['app']->config, [
        'db' => $w['db'], 'rtdb' => $w['rtdb'], 'auth' => $w['app']->auth(),
        'celebrationMedia' => new CelebrationMedia($dir, 'test-secret'),
        'runner' => $runner,
    ]);
    $w['spawns'] = $spawns;
    $w['runner'] = $runner;
    $w['app'] = $app;
    $w['routes'] = new Routes($app);
    $w['celDir'] = $dir;
    return $w;
}

/** Calls the API and returns [status, body]. */
function celCall(array $w, string $method, string $path, array $opts = []): array
{
    $res = $w['routes']->handle(req($method, $path, $opts));
    return [$res->status, $res->body, $res];
}

function organiser(string $uid = 'org1'): string { return idToken(['sub' => $uid]); }
function guestToken(string $uid): string { return idToken(['sub' => $uid, 'firebase' => ['sign_in_provider' => 'anonymous']]); }

function vickyInput(array $over = []): array
{
    return array_merge([
        'title' => "Vicky's Birthday & Graduation Celebration",
        'celebrantName' => 'Vicky',
        'type' => 'birthday',
        'description' => "40, Fortified and Qualified.",
        'date' => '2026-11-22',
        'startTime' => '14:00',
        'endTime' => '18:00',
        'timezone' => 'Africa/Harare',
        'venue' => 'Tea Room, Trade Fair',
        'welcome' => "Welcome! Join a team and play.",
        'theme' => ['look' => 'gala', 'font' => 'elegant', 'primary' => '#d4a017'],
        'settings' => ['approveMessages' => true],
        'teamCount' => 4,
    ], $over);
}

function newEvent(array $w, array $over = [], string $uid = 'org1'): array
{
    [$s, $b] = celCall($w, 'POST', '/c', ['token' => organiser($uid), 'json' => vickyInput($over)]);
    eq(200, $s, json_encode($b));
    return $b;
}

test('celebrations: an organiser creates an event with teams, a code, an address and private links', function () {
    $w = celWorld();
    $ev = newEvent($w);
    eq(true, str_starts_with($ev['id'], 'cel_'));
    eq('vicky-birthday', $ev['slug']);
    eq(1, preg_match('/^[A-HJ-NP-Z2-9]{6}$/', $ev['joinCode']), 'join code ' . $ev['joinCode']);
    eq(4, count($ev['teams']));
    eq('Gold', $ev['teams'][0]['name']);
    eq('#D4A017', $ev['theme']['primary']);
    eq('elegant', $ev['theme']['font']);
    foreach (['celebrant', 'mc', 'display'] as $k) eq(true, strlen($ev['tokens'][$k]) >= 40, "$k token");
    eq(true, $ev['tokens']['celebrant'] !== $ev['tokens']['mc']);
    eq(true, $ev['settings']['approveMessages']);
    eq(false, $ev['settings']['private']);
    // The live summary for phones and the TV is written to Firebase.
    eq(4, count($w['rtdb']->get('celebrations/' . $ev['id'] . '/live/teams')));
    eq("Vicky's Birthday & Graduation Celebration", $w['rtdb']->get('celebrations/' . $ev['id'] . '/live/info/title'));
    // A second Vicky gets the next free address.
    eq('vicky-birthday-2', newEvent($w)['slug']);
});

test('celebrations: guests and anonymous accounts cannot organise; bad input is refused', function () {
    $w = celWorld();
    eq(401, celCall($w, 'POST', '/c', ['json' => vickyInput()])[0]);
    eq(403, celCall($w, 'POST', '/c', ['token' => guestToken('g1'), 'json' => vickyInput()])[0]);
    eq(400, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput(['title' => '  '])])[0]);
    eq(400, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput(['celebrantName' => ''])])[0]);
    eq(400, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput(['type' => 'party'])])[0]);
    eq(400, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput(['date' => '22/11/2026'])])[0]);
    eq(400, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput(['startTime' => '25:00'])])[0]);
    // Unknown looks and colours fall back instead of breaking the page.
    $ev = newEvent($w, ['theme' => ['look' => 'neon', 'primary' => 'red; background:url(x)']]);
    eq('gala', $ev['theme']['look']);
    eq(false, isset($ev['theme']['primary']));
});

test('celebrations: a chosen address must be free and valid', function () {
    $w = celWorld();
    newEvent($w, ['slug' => 'vicky40']);
    eq(409, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput(['slug' => 'vicky40'])])[0]);
    eq(400, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput(['slug' => 'tv'])])[0]);
    eq(false, celCall($w, 'GET', '/c/slug', ['token' => organiser(), 'query' => ['s' => 'vicky40']])[1]['free']);
    eq(true, celCall($w, 'GET', '/c/slug', ['token' => organiser(), 'query' => ['s' => 'vicky-41']])[1]['free']);
});

test('celebrations: only the organiser manages, edits and deletes', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    eq(403, celCall($w, 'GET', "/c/$id/manage", ['token' => organiser('someone')])[0]);
    eq(403, celCall($w, 'POST', "/c/$id/update", ['token' => organiser('someone'), 'json' => ['title' => 'Mine now']])[0]);
    eq(403, celCall($w, 'POST', "/c/$id/delete", ['token' => guestToken('g1')])[0]);
    [$s, $b] = celCall($w, 'POST', "/c/$id/update", ['token' => organiser(), 'json' => ['venue' => 'Garden', 'settings' => ['private' => true]]]);
    eq(200, $s, json_encode($b));
    eq('Garden', $b['venue']);
    eq(true, $b['settings']['private']);
    eq(true, $b['settings']['approveMessages'], 'other settings are kept');
    eq("Vicky's Birthday & Graduation Celebration", $b['title'], 'other details are kept');
    eq(1, count(celCall($w, 'GET', '/c/mine', ['token' => organiser()])[1]['celebrations']));
    eq(0, count(celCall($w, 'GET', '/c/mine', ['token' => organiser('someone')])[1]['celebrations']));
    eq(200, celCall($w, 'POST', "/c/$id/delete", ['token' => organiser()])[0]);
    eq(404, celCall($w, 'GET', "/c/$id/manage", ['token' => organiser()])[0]);
    eq(404, celCall($w, 'GET', '/c/find', ['query' => ['slug' => 'vicky-birthday']])[0]);
    eq(null, $w['rtdb']->get("celebrations/$id"));
    eq(true, newEvent($w)['slug'] === 'vicky-birthday', 'the address is free again');
});

test('celebrations: the public page shows the event but never the links, code or guest list', function () {
    $w = celWorld();
    $ev = newEvent($w);
    [$s, $pub] = celCall($w, 'GET', '/c/find', ['query' => ['slug' => $ev['slug']]]);
    eq(200, $s);
    eq('Vicky', $pub['celebrantName']);
    eq('Tea Room, Trade Fair', $pub['venue']);
    $json = json_encode($pub);
    foreach ($ev['tokens'] as $token) eq(false, str_contains($json, $token), 'no private link');
    eq(false, str_contains($json, $ev['joinCode']), 'no join code');
    eq(false, isset($pub['guests']));
    // The short code finds it too, in any case.
    eq($ev['id'], celCall($w, 'GET', '/c/find', ['query' => ['code' => strtolower($ev['joinCode'])]])[1]['id']);
    eq(404, celCall($w, 'GET', '/c/find', ['query' => ['code' => 'ZZZZZZ']])[0]);
});

test('celebrations: a private event needs its code before the page or joining works', function () {
    $w = celWorld();
    $ev = newEvent($w, ['settings' => ['private' => true]]);
    $pub = celCall($w, 'GET', '/c/find', ['query' => ['slug' => $ev['slug']]])[1];
    eq(true, $pub['needsCode']);
    eq(false, isset($pub['title']));
    eq($ev['id'], celCall($w, 'GET', '/c/find', ['query' => ['slug' => $ev['slug'], 'code' => $ev['joinCode']]])[1]['id']);
    eq(403, celCall($w, 'POST', "/c/{$ev['id']}/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Tracey']])[0]);
    eq(200, celCall($w, 'POST', "/c/{$ev['id']}/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Tracey', 'code' => $ev['joinCode']]])[0]);
});

test('celebrations: guests join with a name, pick a team, and rejoin after a refresh', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    $gold = $ev['teams'][0]['id'];
    [$s, $b] = celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => '  Tracey  ', 'teamId' => $gold]]);
    eq(200, $s, json_encode($b));
    eq('Tracey', $b['me']['name']);
    eq($gold, $b['me']['teamId']);
    eq(['name' => 'Tracey', 'team' => $gold], $w['rtdb']->get("celebrations/$id/members/g1"));
    eq(1, $w['rtdb']->get("celebrations/$id/live/teams/$gold/members"));
    // Joining again (a refresh) keeps the same guest and team.
    celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Tracey']]);
    $me = celCall($w, 'GET', "/c/$id/me", ['token' => guestToken('g1')])[1];
    eq($gold, $me['me']['teamId']);
    eq(1, celCall($w, 'GET', "/c/$id/manage", ['token' => organiser()])[1]['stats']['guests']);
    eq(400, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g2'), 'json' => ['name' => ' ']])[0]);
    eq(false, celCall($w, 'GET', "/c/$id/me", ['token' => guestToken('nobody')])[1]['joined']);
    // Switching team.
    $silver = $ev['teams'][1]['id'];
    eq($silver, celCall($w, 'POST', "/c/$id/team", ['token' => guestToken('g1'), 'json' => ['teamId' => $silver]])[1]['me']['teamId']);
});

test('celebrations: team rules — capacity, locked teams and organiser-only teams', function () {
    $w = celWorld();
    $ev = newEvent($w, ['teamCount' => 0]);
    $id = $ev['id'];
    $b = celCall($w, 'POST', "/c/$id/teams", ['token' => organiser(), 'json' => ['name' => 'Team Diamond', 'color' => '#00aaff', 'capacity' => 1]])[1];
    $tid = $b['teams'][0]['id'];
    eq('Team Diamond', $b['teams'][0]['name']);
    eq('#00AAFF', $b['teams'][0]['color']);
    eq(200, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'A', 'teamId' => $tid]])[0]);
    eq(409, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g2'), 'json' => ['name' => 'B', 'teamId' => $tid]])[0], 'full');
    eq(null, celCall($w, 'GET', "/c/$id/me", ['token' => guestToken('g2')])[1]['me']['teamId'], 'joined without the full team');
    celCall($w, 'POST', "/c/$id/teams/$tid/update", ['token' => organiser(), 'json' => ['capacity' => 0]]);
    celCall($w, 'POST', "/c/$id/teams/lock", ['token' => organiser(), 'json' => ['locked' => true]]);
    eq(403, celCall($w, 'POST', "/c/$id/team", ['token' => guestToken('g2'), 'json' => ['teamId' => $tid]])[0], 'locked');
    eq(true, $w['rtdb']->get("celebrations/$id/live/info/teamsLocked"));
    // The organiser still moves people while teams are locked.
    eq($tid, celCall($w, 'POST', "/c/$id/guests/g2/move", ['token' => organiser(), 'json' => ['teamId' => $tid]])[1]['guests'][1]['teamId']);
    celCall($w, 'POST', "/c/$id/teams/lock", ['token' => organiser(), 'json' => ['locked' => false]]);
    celCall($w, 'POST', "/c/$id/update", ['token' => organiser(), 'json' => ['settings' => ['guestTeams' => false]]]);
    eq(403, celCall($w, 'POST', "/c/$id/team", ['token' => guestToken('g1'), 'json' => ['teamId' => $tid]])[0], 'organiser picks teams');
});

test('celebrations: shuffle into teams fills the smallest team with room', function () {
    $w = celWorld();
    $ev = newEvent($w, ['teamCount' => 3]);
    $id = $ev['id'];
    [$a, $b, $c] = array_column($ev['teams'], 'id');
    celCall($w, 'POST', "/c/$id/teams/$c/update", ['token' => organiser(), 'json' => ['capacity' => 1]]);
    celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g0'), 'json' => ['name' => 'G0', 'teamId' => $a]]);
    for ($i = 1; $i <= 6; $i++) celCall($w, 'POST', "/c/$id/join", ['token' => guestToken("g$i"), 'json' => ['name' => "G$i"]]);
    $m = celCall($w, 'POST', "/c/$id/teams/auto", ['token' => organiser()])[1];
    $sizes = array_column($m['teams'], 'members', 'id');
    eq(3, $sizes[$a]);
    eq(3, $sizes[$b]);
    eq(1, $sizes[$c], 'capacity respected');
    eq(0, $m['stats']['withoutTeam']);
    // Removing a team sends its guests back to "no team yet".
    $m = celCall($w, 'POST', "/c/$id/teams/$a/delete", ['token' => organiser()])[1];
    eq(2, count($m['teams']));
    eq(3, $m['stats']['withoutTeam']);
    eq(null, $w['rtdb']->get("celebrations/$id/members/g0/team"));
});

test('celebrations: a removed guest cannot come back; settings can require accounts', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Spammer']]);
    eq(0, celCall($w, 'POST', "/c/$id/guests/g1/remove", ['token' => organiser()])[1]['stats']['guests']);
    eq(null, $w['rtdb']->get("celebrations/$id/members/g1"));
    eq(403, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Again']])[0]);
    celCall($w, 'POST', "/c/$id/update", ['token' => organiser(), 'json' => ['settings' => ['requireAccount' => true]]]);
    eq(403, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g2'), 'json' => ['name' => 'Anon']])[0]);
    eq(200, celCall($w, 'POST', "/c/$id/join", ['token' => idToken(['sub' => 'member1']), 'json' => ['name' => 'Member']])[0]);
});

test('celebrations: guest numbers and joins per connection are limited', function () {
    $w = celWorld();
    $w['db']->run("INSERT INTO settings (name, value, updated_at) VALUES ('celebrations_limits', ?, 0)", [json_encode(['guestsPerEvent' => 2, 'joinsPerIpHour' => 3])]);
    $ev = newEvent($w);
    $id = $ev['id'];
    eq(200, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'A'], 'ip' => '1.2.3.4'])[0]);
    eq(200, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g2'), 'json' => ['name' => 'B'], 'ip' => '1.2.3.4'])[0]);
    eq(403, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g3'), 'json' => ['name' => 'C'], 'ip' => '5.6.7.8'])[0], 'full');
    $ev2 = newEvent($w);
    eq(200, celCall($w, 'POST', "/c/{$ev2['id']}/join", ['token' => guestToken('g4'), 'json' => ['name' => 'D'], 'ip' => '1.2.3.4'])[0]);
    eq(429, celCall($w, 'POST', "/c/{$ev2['id']}/join", ['token' => guestToken('g5'), 'json' => ['name' => 'E'], 'ip' => '1.2.3.4'])[0], 'per connection');
    eq(200, celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'A again'], 'ip' => '1.2.3.4'])[0], 'rejoining is not a new join');
});

test('celebrations: private links open with their secret, and a new link kills the old one', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    $open = fn ($key) => celCall($w, 'GET', "/c/$id/link", ['headers' => ['x-celebration-key' => $key]]);
    eq('celebrant', $open($ev['tokens']['celebrant'])[1]['role']);
    eq('mc', $open($ev['tokens']['mc'])[1]['role']);
    eq('display', $open($ev['tokens']['display'])[1]['role']);
    eq(403, $open('wrong-wrong-wrong-wrong-wrong')[0]);
    eq(403, $open('')[0]);
    $fresh = celCall($w, 'POST', "/c/$id/links/celebrant/regenerate", ['token' => organiser()])[1];
    eq(403, $open($ev['tokens']['celebrant'])[0], 'old link is dead');
    eq('celebrant', $open($fresh['tokens']['celebrant'])[1]['role']);
    eq($ev['tokens']['mc'], $fresh['tokens']['mc'], 'other links unchanged');
    eq(403, celCall($w, 'POST', "/c/$id/links/mc/regenerate", ['token' => organiser('someone')])[0]);
    $audit = $w['db']->all("SELECT action FROM celebration_audit WHERE cid = ? AND action = 'regenerate'", [$id]);
    eq(1, count($audit), 'regenerating is audited');
});

test('celebrations: pictures are redrawn without hidden data, kept privately and served only by signed links', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    [$s, $m] = celCall($w, 'POST', "/c/$id/media", ['token' => organiser(), 'query' => ['purpose' => 'cover'], 'raw' => photoJpeg(3000, 2000)]);
    eq(200, $s, json_encode($m));
    eq([2048, 1365], [$m['width'], $m['height']], 'full size is capped');
    $files = glob($w['celDir'] . '/' . $id . '/*');
    eq(3, count($files), 'full, play and thumb');
    foreach ($files as $f) eq(false, str_contains((string) file_get_contents($f), 'secret-place'), 'no location data');
    // The cover appears on the public page through a signed link.
    $pub = celCall($w, 'GET', '/c/find', ['query' => ['slug' => $ev['slug']]])[1];
    eq($m['id'], $pub['cover']['id']);
    $url = parse_url($pub['cover']['play']);
    parse_str($url['query'], $q);
    $path = substr($url['path'], 4);
    [$s, , $res] = celCall($w, 'GET', $path, ['query' => $q]);
    eq(200, $s);
    eq(1080, getimagesizefromstring($res->file)[0]);
    eq(true, str_starts_with($res->cache, 'private'), 'never cached by shared caches');
    eq(null, $res->filename, 'shown, not downloaded');
    // Tampering, a different size or an old expiry are refused.
    eq(403, celCall($w, 'GET', $path, ['query' => ['e' => $q['e'], 's' => str_repeat('0', 32)]])[0]);
    eq(403, celCall($w, 'GET', str_replace('/play', '/full', $path), ['query' => $q])[0]);
    eq(403, celCall($w, 'GET', $path, ['query' => ['e' => time() - 10, 's' => $q['s']]])[0]);
    // Only the organiser uploads; non-pictures are refused.
    eq(403, celCall($w, 'POST', "/c/$id/media", ['token' => guestToken('g1'), 'query' => ['purpose' => 'cover'], 'raw' => photoJpeg()])[0]);
    eq(415, celCall($w, 'POST', "/c/$id/media", ['token' => organiser(), 'query' => ['purpose' => 'cover'], 'raw' => '<?php echo 1;'])[0]);
    eq(400, celCall($w, 'POST', "/c/$id/media", ['token' => organiser(), 'query' => ['purpose' => 'secret'], 'raw' => photoJpeg()])[0]);
    // Deleting the event erases its pictures.
    celCall($w, 'POST', "/c/$id/delete", ['token' => organiser()]);
    eq([], glob($w['celDir'] . '/' . $id . '/*') ?: []);
    eq(404, celCall($w, 'GET', $path, ['query' => $q])[0]);
});

test('celebrations: too many events per account and the admin limits page', function () {
    $w = celWorld();
    $w['rtdb']->data['admins'] = ['boss' => true];
    eq(403, celCall($w, 'POST', '/admin/celebrations/limits', ['token' => organiser(), 'json' => ['eventsPerOwner' => 1]])[0]);
    eq(1, celCall($w, 'POST', '/admin/celebrations/limits', ['token' => idToken(['sub' => 'boss']), 'json' => ['eventsPerOwner' => 1, 'nonsense' => 5]])[1]['limits']['eventsPerOwner']);
    newEvent($w);
    eq(403, celCall($w, 'POST', '/c', ['token' => organiser(), 'json' => vickyInput()])[0]);
    eq(200, celCall($w, 'POST', '/c', ['token' => organiser('other'), 'json' => vickyInput()])[0], 'per account');
    celCall($w, 'POST', '/admin/celebrations/limits', ['token' => idToken(['sub' => 'boss']), 'json' => ['enabled' => false]]);
    eq(403, celCall($w, 'POST', '/c', ['token' => organiser('third'), 'json' => vickyInput()])[0], 'paused');
});

test('celebrations: an event celebrates up to three things', function () {
    $w = celWorld();
    $ev = newEvent($w, ['types' => ['birthday', 'graduation']]);
    eq(['birthday', 'graduation'], $ev['types']);
    eq('birthday', $ev['type']);
    $id = $ev['id'];
    $org = ['token' => organiser()];
    eq(['graduation'], celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['types' => ['graduation', 'graduation']]])[1]['types'], 'duplicates dropped');
    eq('graduation', celCall($w, 'GET', "/c/$id/manage", $org)[1]['type']);
    eq(400, celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['types' => ['birthday', 'wedding', 'farewell', 'reunion']]])[0], 'more than 3');
    eq(400, celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['types' => []]])[0], 'none');
    eq(400, celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['types' => ['party']]])[0], 'unknown');
    // Sending only "type" replaces the list.
    eq(['wedding'], celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['type' => 'wedding']])[1]['types'], 'type alone');
    // Old style: one type only still works, and an old row without a list reads as [type].
    $old = newEvent($w, ['type' => 'wedding', 'title' => 'Old one']);
    eq(['wedding'], $old['types']);
    $w['db']->run('UPDATE celebrations SET types = NULL WHERE id = ?', [$old['id']]);
    eq(['wedding'], celCall($w, 'GET', '/c/find', ['query' => ['slug' => $old['slug']]])[1]['types']);
    eq(['wedding'], celCall($w, 'GET', '/c/mine', $org)[1]['celebrations'][0]['types']);
});

function teamOf(array $view): array
{
    return array_values(array_filter($view['event']['teams'], fn ($t) => $t['id'] === $view['me']['teamId']))[0];
}

test('celebrations: a group makes its own team', function () {
    $w = celWorld();
    $ev = newEvent($w, ['teamCount' => 2]);
    $id = $ev['id'];
    eq(true, $ev['settings']['guestMakeTeams']);
    eq(false, $ev['teams'][0]['madeByGuest']);
    celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Table 4']]);
    [$s, $b] = celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g1'), 'json' => ['name' => '  The Aunties ']]);
    eq(200, $s, json_encode($b));
    $mine = teamOf($b);
    eq('The Aunties', $mine['name']);
    eq('#C0392B', $mine['color'], 'first unused colour (Gold and Silver are taken)');
    eq(true, $mine['madeByGuest']);
    eq(1, $mine['members']);
    eq(['name' => 'Table 4', 'team' => $mine['id']], $w['rtdb']->get("celebrations/$id/members/g1"));
    eq('The Aunties', $w['rtdb']->get("celebrations/$id/live/teams/{$mine['id']}/name"));
    eq(404, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('stranger'), 'json' => ['name' => 'X']])[0], 'not joined');
    celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g2'), 'json' => ['name' => 'B']]);
    eq(409, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => 'the AUNTIES']])[0], 'name taken, any case');
    eq(400, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => '   ']])[0], 'no name');
    eq(400, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => 'Team Fuck']])[0], 'blocked word');
    eq(400, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => 'Sh1t Squad']])[0], 'blocked with a number');
    eq(200, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => 'Scunthorpe Stars']])[0], 'whole words only');
    // The organiser removes the aunties' team: its colour is free again and g1 has no team.
    celCall($w, 'POST', "/c/$id/teams/{$mine['id']}/delete", ['token' => organiser()]);
    eq(null, celCall($w, 'GET', "/c/$id/me", ['token' => guestToken('g1')])[1]['me']['teamId']);
    $again = celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g1'), 'json' => ['name' => 'Cousins']])[1];
    eq('#C0392B', teamOf($again)['color']);
});

test('celebrations: guest-made teams follow the team rules', function () {
    $w = celWorld();
    $ev = newEvent($w, ['teamCount' => 11]);
    $id = $ev['id'];
    $org = ['token' => organiser()];
    $g = ['token' => guestToken('g1')];
    celCall($w, 'POST', "/c/$id/join", $g + ['json' => ['name' => 'A']]);
    celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['settings' => ['guestMakeTeams' => false]]]);
    eq(403, celCall($w, 'POST', "/c/$id/team/new", $g + ['json' => ['name' => 'Us']])[0], 'setting off');
    celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['settings' => ['guestMakeTeams' => true, 'guestTeams' => false]]]);
    eq(403, celCall($w, 'POST', "/c/$id/team/new", $g + ['json' => ['name' => 'Us']])[0], 'organiser picks teams');
    celCall($w, 'POST', "/c/$id/update", $org + ['json' => ['settings' => ['guestTeams' => true]]]);
    celCall($w, 'POST', "/c/$id/teams/lock", $org + ['json' => ['locked' => true]]);
    eq(403, celCall($w, 'POST', "/c/$id/team/new", $g + ['json' => ['name' => 'Us']])[0], 'locked');
    celCall($w, 'POST', "/c/$id/teams/lock", $org + ['json' => ['locked' => false]]);
    eq(200, celCall($w, 'POST', "/c/$id/team/new", $g + ['json' => ['name' => 'Us']])[0], 'the 12th team');
    [$s, $b] = celCall($w, 'POST', "/c/$id/team/new", $g + ['json' => ['name' => 'Them']]);
    eq(403, $s, 'over the limit');
    eq('limit', $b['error'], json_encode($b));
});
