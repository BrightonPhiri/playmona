<?php
/*
 * PlayMona API settings. Copy this file and fill it in:
 *   - On the server: /home/user/web/playmona.com/private/config.php (outside the web root)
 *   - On your computer: api/config.local.php (git ignores it)
 * Never commit the filled-in copy.
 */
return [
    // The public address of the site, no trailing slash.
    'site_url' => 'https://playmona.com',

    'db' => [
        // Server: 'mysql:host=localhost;dbname=user_playmona;charset=utf8mb4'
        // Local tests: 'sqlite:' . __DIR__ . '/../tools/api/local.sqlite'
        'dsn' => 'mysql:host=localhost;dbname=user_playmona;charset=utf8mb4',
        'user' => 'user_playmona',
        'password' => '',
    ],

    'firebase' => [
        'project_id' => 'play-mona',
        'database_url' => 'https://play-mona-default-rtdb.firebaseio.com',
        // Firebase console > Project settings > Service accounts > Generate new private key.
        'service_account' => '/home/user/web/playmona.com/private/firebase-service-account.json',
    ],

    'linkwa' => [
        // Sandbox while testing; the live address once real payments start.
        'api_base' => 'https://linkwa-linkwa-staging-sandbox-lf00iz.laravel.cloud/api/v1/third-party',
        'api_key' => '',
        // Webhook signing secret from the Linkwa dashboard (webhook URL: https://playmona.com/api/linkwa/webhook).
        'signing_secret' => '',
    ],

    // Who the invoices are from. address and tax_id are optional (leave them out to hide them).
    'business' => [
        'name' => 'PlayMona',
        'site' => 'playmona.com',
        'email' => 'support@playmona.com',
        // 'address' => '',
        // 'tax_id' => '',
    ],
    // Dates on invoices are shown in this time zone.
    'timezone' => 'Africa/Harare',

    // Games sold one at a time: id => name and price in cents.
    'premium_games' => [
        // 'imposter' => ['name' => 'Imposter', 'cents' => 199],
    ],
];
