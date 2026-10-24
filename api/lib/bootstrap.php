<?php
/* Loads the config and the API classes. Used by index.php, cron.php and the tests. */
declare(strict_types=1);

namespace PlayMona;

foreach (['Http', 'Config', 'Db', 'Jwt', 'FirebaseAuth', 'FirebaseDb', 'Linkwa', 'Catalog', 'Store', 'Payments', 'Pdf', 'Invoice', 'Finance', 'Visits', 'Photos', 'Routes'] as $class) {
    require_once __DIR__ . '/' . $class . '.php';
}

/** Finds the config file: $PLAYMONA_CONFIG, then the server's private folder, then api/config.local.php. */
function configPath(): ?string
{
    $candidates = [
        getenv('PLAYMONA_CONFIG') ?: null,
        // On the VPS: /home/user/web/playmona.com/private/config.php (outside the web root).
        dirname(__DIR__, 3) . '/private/config.php',
        dirname(__DIR__) . '/config.local.php',
    ];
    foreach ($candidates as $path) {
        if ($path && is_file($path)) return $path;
    }
    return null;
}
