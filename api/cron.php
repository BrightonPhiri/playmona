<?php
/*
 * PlayMona background jobs. Run from the server's cron every 10 minutes:
 *   php /home/user/web/playmona.com/public_html/api/cron.php
 * Also: php cron.php migrate   (creates the database tables; safe to repeat)
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
