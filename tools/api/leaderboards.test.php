<?php
/* Leaderboard cron jobs (api/lib/Leaderboards.php). Loaded by test.php (uses its harness). */
declare(strict_types=1);

use PlayMona\Leaderboards;

test('leaderboards: the daily game is picked ahead for today and tomorrow, once', function () {
    $db = new MemoryRtdb();
    $lb = new Leaderboards($db);
    $now = strtotime('2026-11-03 09:00:00 UTC') * 1000;
    $wrote = $lb->scheduleDaily($now);
    eq(['2026-11-03', '2026-11-04'], array_keys($wrote));
    eq('server', $db->get('dailyMeta/2026-11-03')['by']);
    eq(true, in_array($wrote['2026-11-03'], Leaderboards::GAMES, true));
    eq(true, $wrote['2026-11-03'] !== $wrote['2026-11-04'], 'tomorrow avoids today');
});

test('leaderboards: a day already picked (by a player or an admin) is left alone', function () {
    $db = new MemoryRtdb();
    $db->data['dailyMeta'] = ['2026-11-03' => ['game' => 'quickTap', 'by' => 'admin'], '2026-11-04' => ['game' => 'guessCountry', 'by' => 'device']];
    eq([], (new Leaderboards($db))->scheduleDaily(strtotime('2026-11-03 09:00:00 UTC') * 1000));
});

test('leaderboards: switched-off games and games off the leaderboards are never picked', function () {
    $db = new MemoryRtdb();
    $off = [];
    foreach (Leaderboards::GAMES as $i => $id) if ($id !== 'guessCountry' && $id !== 'quickTap') $off[$id] = $i % 2 ? ['enabled' => false] : ['ranked' => false];
    $db->data['config/games'] = $off;
    $lb = new Leaderboards($db);
    $active = $lb->activeGames();
    sort($active);
    eq(['guessCountry', 'quickTap'], $active);
    $wrote = array_values($lb->scheduleDaily(strtotime('2026-11-03 09:00:00 UTC') * 1000));
    sort($wrote);
    eq(['guessCountry', 'quickTap'], $wrote, 'two days, the only two games, no repeat');
});

test('leaderboards: party and creative games are not on the server list', function () {
    foreach (['charades', 'pictionary', 'imposters', 'wouldYouRather', 'whoIsMostLikely'] as $id) {
        eq(false, in_array($id, Leaderboards::GAMES, true), $id);
    }
});

test('leaderboards: featured is the 10 most played leaderboard games of the last 7 days', function () {
    $db = new MemoryRtdb();
    $now = strtotime('2026-11-03 09:00:00 UTC') * 1000;
    $db->data['stats/days/2026-11-03/games'] = ['quickTap' => 50, 'charades' => 999, 'guessCountry' => 10];
    $db->data['stats/days/2026-10-30/games'] = ['guessCountry' => 45, 'familyQuiz' => 30];
    $db->data['stats/days/2026-10-20/games'] = ['letterRush' => 500];   // older than a week
    $lb = new Leaderboards($db);
    eq(['guessCountry', 'quickTap', 'familyQuiz'], $lb->featured($now));
    eq(['guessCountry', 'quickTap', 'familyQuiz'], $lb->updateFeatured($now));
    eq(null, $lb->updateFeatured($now), 'unchanged: no write');
});
