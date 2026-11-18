<?php
/* PlayMona Celebrations: the Wall of Love, the celebrant's private page and the memory book.
   Loaded by test.php after celebrations.test.php (uses celWorld, celCall, newEvent, organiser, guestToken). */
declare(strict_types=1);

echo "\nCelebrations: Wall of Love\n";

function wallJoin(array $w, string $id, string $uid, string $name): void
{
    [$s, $b] = celCall($w, 'POST', "/c/$id/join", ['token' => guestToken($uid), 'json' => ['name' => $name]]);
    eq(200, $s, json_encode($b));
}

function wallPost(array $w, string $id, string $uid, array $msg): array
{
    return celCall($w, 'POST', "/c/$id/wall", ['token' => guestToken($uid), 'json' => $msg]);
}

test('wall: messages wait for the organiser, guests see their own, approved ones reach the wall', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    wallJoin($w, $id, 'g1', 'Tendai');
    wallJoin($w, $id, 'g2', 'Rudo');
    [$s, $b] = wallPost($w, $id, 'g1', ['body' => "Happy 40th Vicky!\nSo proud of you.", 'category' => 'wish']);
    eq(200, $s, json_encode($b));
    eq('pending', $b['message']['status']);
    eq("Happy 40th Vicky!\nSo proud of you.", $b['message']['body'], 'new lines kept');
    $mid = $b['message']['id'];
    $g1 = celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g1')])[1];
    eq(1, count($g1['mine']));
    eq([], $g1['wall'], 'not on the wall yet');
    eq([], celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g2')])[1]['mine']);
    // The organiser sees it waiting, and approves it.
    $org = celCall($w, 'GET', "/c/$id/messages", ['token' => organiser()])[1];
    eq(['pending' => 1, 'approved' => 0, 'rejected' => 0], $org['counts']);
    $org = celCall($w, 'POST', "/c/$id/messages/$mid/approve", ['token' => organiser()])[1];
    eq('approved', $org['messages'][0]['status']);
    $g2 = celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g2')])[1];
    eq('Tendai', $g2['wall'][0]['name']);
    eq(false, $g2['wall'][0]['mine']);
    eq(false, isset($g2['wall'][0]['status']), 'no status on the public wall');
    // Rejecting takes it off again; only the organiser moderates.
    eq(403, celCall($w, 'POST', "/c/$id/messages/$mid/reject", ['token' => guestToken('g2')])[0]);
    eq(403, celCall($w, 'POST', "/c/$id/messages/$mid/reject", ['token' => organiser('other')])[0]);
    celCall($w, 'POST', "/c/$id/messages/$mid/reject", ['token' => organiser()]);
    eq([], celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g2')])[1]['wall']);
    $audit = $w['db']->all("SELECT action FROM celebration_audit WHERE cid = ? AND action LIKE 'message.%' ORDER BY created_at", [$id]);
    eq(['message.approve', 'message.reject'], array_column($audit, 'action'), 'moderation is audited');
});

test('wall: only guests write; empty, anonymous-when-off and bad categories are handled', function () {
    $w = celWorld();
    $ev = newEvent($w, ['settings' => ['approveMessages' => true, 'anonymousMessages' => false]]);
    $id = $ev['id'];
    eq(403, wallPost($w, $id, 'stranger', ['body' => 'Hello'])[0], 'join first');
    wallJoin($w, $id, 'g1', 'Tendai');
    eq(400, wallPost($w, $id, 'g1', ['body' => '  '])[0]);
    eq(403, wallPost($w, $id, 'g1', ['body' => 'Hi', 'anonymous' => true])[0], 'anonymous not allowed here');
    $b = wallPost($w, $id, 'g1', ['body' => str_repeat('x', 1500), 'category' => 'nonsense', 'name' => 'Auntie T'])[1]['message'];
    eq(1000, mb_strlen($b['body']), 'long messages are cut');
    eq('wish', $b['category'], 'unknown categories fall back');
    eq('Auntie T', $b['name'], 'a guest may sign with another name');
    // A removed guest cannot write.
    celCall($w, 'POST', "/c/$id/guests/g1/remove", ['token' => organiser()]);
    eq(403, wallPost($w, $id, 'g1', ['body' => 'Back again'])[0]);
});

test('wall: anonymous messages hide the name from everyone but the organiser', function () {
    $w = celWorld();
    $ev = newEvent($w, ['settings' => ['approveMessages' => false, 'anonymousMessages' => true]]);
    $id = $ev['id'];
    wallJoin($w, $id, 'g1', 'Tendai');
    wallJoin($w, $id, 'g2', 'Rudo');
    $b = wallPost($w, $id, 'g1', ['body' => 'Guess who!', 'anonymous' => true])[1]['message'];
    eq('approved', $b['status'], 'no approval needed at this event');
    eq('Tendai', $b['name'], 'the writer still sees their name');
    $wall = celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g2')])[1]['wall'];
    eq(null, $wall[0]['name']);
    eq(true, $wall[0]['anonymous']);
    $for = celCall($w, 'GET', "/c/$id/for", ['headers' => ['x-celebration-key' => $ev['tokens']['celebrant']]])[1];
    eq(null, $for['messages'][0]['name'], 'the celebrant does not see it either');
    $org = celCall($w, 'GET', "/c/$id/messages", ['token' => organiser()])[1];
    eq('Tendai', $org['messages'][0]['name'], 'the organiser does, to moderate');
    eq(false, str_contains(json_encode($wall), 'g1'), 'no uid on the public wall');
});

test('wall: a photo is uploaded first, belongs to its writer and is used once', function () {
    $w = celWorld();
    $ev = newEvent($w, ['settings' => ['approveMessages' => false]]);
    $id = $ev['id'];
    wallJoin($w, $id, 'g1', 'Tendai');
    wallJoin($w, $id, 'g2', 'Rudo');
    [$s, $m] = celCall($w, 'POST', "/c/$id/wall/photo", ['token' => guestToken('g1'), 'raw' => photoJpeg(1600, 1200)]);
    eq(200, $s, json_encode($m));
    eq(400, wallPost($w, $id, 'g2', ['body' => 'Mine now', 'mediaId' => $m['id']])[0], 'not someone else\'s photo');
    $b = wallPost($w, $id, 'g1', ['body' => 'Us at the lake', 'mediaId' => $m['id']])[1]['message'];
    eq(true, str_contains($b['photo']['thumb'], $m['id']));
    eq(false, isset($b['photo']['full']), 'guests get the smaller sizes');
    eq(400, wallPost($w, $id, 'g1', ['body' => 'Again', 'mediaId' => $m['id']])[0], 'a photo goes with one message');
    $for = celCall($w, 'GET', "/c/$id/for", ['headers' => ['x-celebration-key' => $ev['tokens']['celebrant']]])[1];
    eq(true, isset($for['messages'][0]['photo']['full']), 'the celebrant gets the full photo to keep');
    eq(403, celCall($w, 'POST', "/c/$id/wall/photo", ['token' => guestToken('stranger'), 'raw' => photoJpeg()])[0]);
    // An event without photo uploads refuses them.
    $ev2 = newEvent($w, ['title' => 'No photos', 'settings' => ['photoUploads' => false]]);
    wallJoin($w, $ev2['id'], 'g1', 'Tendai');
    eq(403, celCall($w, 'POST', "/c/{$ev2['id']}/wall/photo", ['token' => guestToken('g1'), 'raw' => photoJpeg()])[0]);
});

test('wall: reports take a message down after three guests, and approving again clears them', function () {
    $w = celWorld();
    $ev = newEvent($w, ['settings' => ['approveMessages' => false]]);
    $id = $ev['id'];
    foreach (['g1', 'g2', 'g3', 'g4'] as $g) wallJoin($w, $id, $g, strtoupper($g));
    $mid = wallPost($w, $id, 'g1', ['body' => 'Something unkind'])[1]['message']['id'];
    eq(400, celCall($w, 'POST', "/c/$id/wall/$mid/report", ['token' => guestToken('g1')])[0], 'not your own');
    celCall($w, 'POST', "/c/$id/wall/$mid/report", ['token' => guestToken('g2')]);
    celCall($w, 'POST', "/c/$id/wall/$mid/report", ['token' => guestToken('g2')]);
    eq(true, celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g2')])[1]['wall'][0]['reported']);
    celCall($w, 'POST', "/c/$id/wall/$mid/report", ['token' => guestToken('g3')]);
    eq(1, count(celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g4')])[1]['wall']), 'two reports (one counted twice) are not enough');
    celCall($w, 'POST', "/c/$id/wall/$mid/report", ['token' => guestToken('g4')]);
    eq([], celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g4')])[1]['wall'], 'three take it down');
    $org = celCall($w, 'GET', "/c/$id/messages", ['token' => organiser()])[1];
    eq(['pending', 3], [$org['messages'][0]['status'], $org['messages'][0]['reports']]);
    celCall($w, 'POST', "/c/$id/messages/$mid/approve", ['token' => organiser()]);
    $org = celCall($w, 'GET', "/c/$id/messages", ['token' => organiser()])[1];
    eq(0, $org['messages'][0]['reports'], 'the organiser looked: reports cleared');
});

test('wall: guests take back their own messages; the organiser deletes any, with its photo', function () {
    $w = celWorld();
    $ev = newEvent($w, ['settings' => ['approveMessages' => false]]);
    $id = $ev['id'];
    wallJoin($w, $id, 'g1', 'Tendai');
    wallJoin($w, $id, 'g2', 'Rudo');
    $a = wallPost($w, $id, 'g1', ['body' => 'Oops, typo'])[1]['message']['id'];
    eq(403, celCall($w, 'POST', "/c/$id/wall/$a/remove", ['token' => guestToken('g2')])[0]);
    eq(200, celCall($w, 'POST', "/c/$id/wall/$a/remove", ['token' => guestToken('g1')])[0]);
    eq([], celCall($w, 'GET', "/c/$id/wall", ['token' => guestToken('g1')])[1]['mine']);
    $m = celCall($w, 'POST', "/c/$id/wall/photo", ['token' => guestToken('g2'), 'raw' => photoJpeg()])[1];
    $b = wallPost($w, $id, 'g2', ['body' => 'With a photo', 'mediaId' => $m['id']])[1]['message']['id'];
    celCall($w, 'POST', "/c/$id/messages/$b/delete", ['token' => organiser()]);
    eq([], celCall($w, 'GET', "/c/$id/messages", ['token' => organiser()])[1]['messages']);
    eq(true, $w['db']->one('SELECT deleted_at FROM celebration_media WHERE id = ?', [$m['id']])['deleted_at'] !== null, 'its photo goes too');
});

test('wall: a guest can send at most 20 messages an hour', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    wallJoin($w, $id, 'g1', 'Tendai');
    for ($i = 0; $i < 20; $i++) eq(200, wallPost($w, $id, 'g1', ['body' => "Message $i"])[0]);
    eq(429, wallPost($w, $id, 'g1', ['body' => 'One more'])[0]);
});

test('celebrant: the private page opens by address with its secret, lists approved messages oldest first, keeps favourites', function () {
    $w = celWorld();
    $ev = newEvent($w);
    $id = $ev['id'];
    $key = $ev['tokens']['celebrant'];
    $open = fn ($k) => celCall($w, 'GET', '/c/private', ['query' => ['slug' => $ev['slug']], 'headers' => ['x-celebration-key' => $k]]);
    [$s, $b] = $open($key);
    eq([200, 'celebrant', $id], [$s, $b['role'], $b['id']]);
    eq(false, isset($b['event']['tokens']), 'never the other links');
    eq(403, $open('wrong-wrong-wrong-wrong-wrong')[0]);
    eq(403, celCall($w, 'GET', '/c/private', ['query' => ['slug' => 'no-such-party'], 'headers' => ['x-celebration-key' => $key]])[0], 'the same answer for an unknown address');
    wallJoin($w, $id, 'g1', 'Tendai');
    $first = wallPost($w, $id, 'g1', ['body' => 'First', 'category' => 'memory'])[1]['message']['id'];
    $second = wallPost($w, $id, 'g1', ['body' => 'Second'])[1]['message']['id'];
    $waiting = wallPost($w, $id, 'g1', ['body' => 'Not approved'])[1]['message']['id'];
    celCall($w, 'POST', "/c/$id/messages/$second/approve", ['token' => organiser()]);
    celCall($w, 'POST', "/c/$id/messages/$first/approve", ['token' => organiser()]);
    $for = fn ($k) => celCall($w, 'GET', "/c/$id/for", ['headers' => ['x-celebration-key' => $k]]);
    $list = $for($key)[1]['messages'];
    eq(['First', 'Second'], array_column($list, 'body'), 'approved only, oldest first');
    eq(403, $for($ev['tokens']['mc'])[0], 'the MC link is not the celebrant link');
    eq(403, $for('')[0]);
    // Favourites.
    $fav = fn ($mid, $on, $k) => celCall($w, 'POST', "/c/$id/for/$mid/favourite", ['headers' => ['x-celebration-key' => $k], 'json' => ['on' => $on]]);
    eq(200, $fav($first, true, $key)[0]);
    eq([true, false], array_column($for($key)[1]['messages'], 'favourite'));
    eq(404, $fav($waiting, true, $key)[0], 'only approved messages');
    eq(403, $fav($first, false, $ev['tokens']['display'])[0]);
    // The organiser opens the same memory book.
    eq(['First', 'Second'], array_column(celCall($w, 'GET', "/c/$id/book", ['token' => organiser()])[1]['messages'], 'body'));
    eq(403, celCall($w, 'GET', "/c/$id/book", ['token' => guestToken('g1')])[0]);
    // A new celebrant link stops the old one.
    celCall($w, 'POST', "/c/$id/links/celebrant/regenerate", ['token' => organiser()]);
    eq(403, $for($key)[0]);
});
