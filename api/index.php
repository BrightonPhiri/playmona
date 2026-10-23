<?php
/* PlayMona API entry point. .htaccess sends every /api/... address here. */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

use PlayMona\{App, Config, Request, Response, Routes};

ini_set('display_errors', '0');

try {
    $app = new App(Config::load(PlayMona\configPath()));
} catch (Throwable $e) {
    error_log('PlayMona API config: ' . $e->getMessage());
    Response::json(['error' => 'server', 'message' => 'The server is not set up yet.'], 503)->send();
    exit;
}

(new Routes($app))->handle(Request::fromGlobals())->send();
