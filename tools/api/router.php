<?php
/* Router for PHP's built-in server, doing what api/.htaccess does on the live site.
   Run from the repo folder:  php -S 127.0.0.1:8961 tools/api/router.php */
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!str_starts_with($path, '/api/')) {
    http_response_code(404);
    exit;
}
if (preg_match('#^/api/(lib|tests)(/|$)|^/api/(cron\.php|config.*\.php)$#', $path)) {
    http_response_code(403);
    exit;
}
require __DIR__ . '/../../api/index.php';
