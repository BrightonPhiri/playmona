<?php
/*
 * PlayMona background jobs. Run from the server's cron every 10 minutes:
 *   php /home/user/web/playmona.com/public_html/api/cron.php
 * Also: php cron.php migrate   (creates the database tables; safe to repeat)
 *       php cron.php runner    (every minute: keeps the crew runner going)
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/lib/bootstrap.php';

use PlayMona\{App, Config};

$app = new App(Config::load(PlayMona\configPath()));
$task = $argv[1] ?? 'all';

// php cron.php runner, every minute: starts the crew runner (crew players and the Imposters
// referee) when it is not running. Cron starts it, so it does not depend on the web server
// being allowed to start programs. Cheap: it runs before the database and payment jobs.
// Silent when the runner is already up: cron emails any output, and this runs every minute.
if ($task === 'runner') {
    if ($app->runner()->ensure(PlayMona\nowMs())) echo "Runner started.\n";
    exit;
}

$app->db()->migrate();
// Older orders: test/live mode and invoice numbers (needs the gateway settings).
try {
    $filled = $app->payments()->backfill();
    if ($filled) echo "Numbered $filled older invoice(s).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Backfill failed: ' . $e->getMessage() . "\n");
}
if ($task === 'migrate') {
    echo "Tables are ready.\n";
    exit;
}
// php cron.php crew-seed [count]: tops the Players Engine up to its starting population.
if ($task === 'crew-seed') {
    $target = (int) ($argv[2] ?? $app->crew()->settings()['population']);
    echo 'Created ' . $app->crew()->seed($target) . " player(s).\n";
    exit;
}

// Orders still pending: look for them in Linkwa's statement.
try {
    $credited = $app->payments()->reconcile();
    if ($credited) echo "Credited $credited order(s) from the Linkwa statement.\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Reconcile failed: ' . $e->getMessage() . "\n");
}

// Access that has not reached Firebase yet.
try {
    $synced = $app->store()->syncPending();
    if ($synced) echo "Synced $synced player(s) to Firebase.\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Sync failed: ' . $e->getMessage() . "\n");
}

// Leaderboards: the daily challenge's game for today and tomorrow, and the most played games.
try {
    $now = PlayMona\nowMs();
    foreach ($app->leaderboards()->scheduleDaily($now) as $day => $game) echo "Daily challenge $day: $game.\n";
    $app->leaderboards()->updateFeatured($now);
} catch (Throwable $e) {
    fwrite(STDERR, 'Leaderboards failed: ' . $e->getMessage() . "\n");
}

// Watch live: broadcasts of rooms nobody has used for 10 minutes.
try {
    $gone = $app->live()->prune(PlayMona\nowMs());
    if ($gone) echo "Removed $gone old watch broadcast(s).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Watch cleanup failed: ' . $e->getMessage() . "\n");
}

// Players Engine: seats whose lease ran out (the runner stopped), and faded friend requests.
try {
    $now = PlayMona\nowMs();
    $stale = $app->crew()->sweep($now);
    foreach ($stale as $matchId) $app->matchmaker()->endMatch($matchId, 'cancelled', $now);
    $faded = $app->friends()->sweep($now);
    if ($stale || $faded) echo 'Freed ' . count($stale) . " stale match(es), faded $faded request(s).\n";
    $abandoned = $app->imposters()->sweep($now);
    if ($abandoned) echo "Ended $abandoned abandoned Imposters match(es).\n";
    $abandonedWf = $app->wordflow()->sweep($now);
    if ($abandonedWf) echo "Ended $abandonedWf abandoned WordFlow match(es).\n";
    $abandonedBs = $app->ballswap()->sweep($now);
    if ($abandonedBs) echo "Ended $abandonedBs abandoned Ball Swap match(es).\n";
    $abandonedSr = $app->sortrush()->sweep($now);
    if ($abandonedSr) echo "Ended $abandonedSr abandoned SortRush match(es).\n";
    $abandonedGs = $app->geospin()->sweep($now);
    if ($abandonedGs) echo "Ended $abandonedGs abandoned GeoSpin match(es).\n";
    $abandonedWm = $app->whatsmissing()->sweep($now);
    if ($abandonedWm) echo "Ended $abandonedWm abandoned What's Missing? match(es).\n";
    $abandonedCw = $app->crossword()->sweep($now);
    if ($abandonedCw) echo "Ended $abandonedCw abandoned Mini Crossword match(es).\n";
    $abandonedLr = $app->logorush()->sweep($now);
    if ($abandonedLr) echo "Ended $abandonedLr abandoned Logo Rush match(es).\n";
    $abandonedSkb = $app->sketchback()->sweep($now);
    if ($abandonedSkb) echo "Ended $abandonedSkb abandoned SketchBack match(es).\n";
    $abandonedSw = $app->saywhat()->sweep($now);
    if ($abandonedSw) echo "Ended $abandonedSw abandoned Say What? match(es).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Crew cleanup failed: ' . $e->getMessage() . "\n");
}

// Visitor details older than about 13 months.
try {
    $pruned = $app->visits()->prune();
    if ($pruned) echo "Removed $pruned old visit row(s).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Visit cleanup failed: ' . $e->getMessage() . "\n");
}
