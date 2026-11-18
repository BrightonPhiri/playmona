<?php
/*
 * Local testing only (never deployed: tools/ is excluded from the upload).
 *
 * Started by router.php when PLAYMONA_DEV_AUTH=1 and the request comes from this computer.
 * It runs the real API with:
 *   - SQLite in tools/api/.dev/playmona.sqlite instead of MariaDB,
 *   - sign-in tokens of the form "dev.<uid>.<provider>" (sent by js/net/api.js in devRooms mode),
 *   - Firebase writes kept in tools/api/.dev/rtdb.json, readable at GET /api/dev/rtdb?path=...
 * so Celebrations can be tried in two browser tabs with no Firebase project and no live data.
 */
declare(strict_types=1);

namespace PlayMona;

require_once __DIR__ . '/../../api/lib/bootstrap.php';

final class DevAuth extends FirebaseAuth
{
    public function __construct() { parent::__construct('dev'); }

    public function verify(string $token): AuthUser
    {
        if (!preg_match('/^dev\.([A-Za-z0-9_-]{1,64})\.(password|anonymous)$/', $token, $m)) {
            throw new HttpError(401, 'Dev sign-in expected (dev.<uid>.<provider>).', 'bad-token');
        }
        return new AuthUser($m[1], $m[2], null, null);
    }
}

/** Firebase stand-in: one JSON file, the same path rules as MemoryRtdb in the tests. */
final class FileRtdb implements RealtimeDb
{
    public function __construct(private string $file) {}

    private function load(): array
    {
        $raw = is_file($this->file) ? (string) file_get_contents($this->file) : '';
        $data = $raw === '' ? [] : json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function save(array $data): void
    {
        file_put_contents($this->file, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
    }

    private static function parts(string $path): array
    {
        return array_values(array_filter(explode('/', trim($path, '/')), fn ($p) => $p !== ''));
    }

    public function get(string $path): mixed
    {
        $node = $this->load();
        foreach (self::parts($path) as $p) {
            if (!is_array($node) || !array_key_exists($p, $node)) return null;
            $node = $node[$p];
        }
        return $node;
    }

    public function set(string $path, mixed $value): void
    {
        $data = $this->load();
        $parts = self::parts($path);
        if (!$parts) {
            $this->save(is_array($value) ? $value : []);
            return;
        }
        $node = &$data;
        $last = array_pop($parts);
        foreach ($parts as $p) {
            if (!isset($node[$p]) || !is_array($node[$p])) $node[$p] = [];
            $node = &$node[$p];
        }
        if ($value === null) unset($node[$last]); else $node[$last] = $value;
        unset($node);
        $this->save($data);
    }

    public function update(string $path, array $values): void
    {
        foreach ($values as $k => $v) $this->set(trim($path . '/' . $k, '/'), $v);
    }

    public function query(string $path, array $params): mixed
    {
        return $this->get($path);
    }
}

function devApp(): App
{
    $dir = __DIR__ . '/.dev';
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    $config = new Config([
        'site_url' => 'http://localhost:8960',
        'db' => ['dsn' => 'sqlite:' . $dir . '/playmona.sqlite'],
        'firebase' => ['project_id' => 'dev'],
        'uploads' => ['celebrations_dir' => $dir . '/celebrations'],
        'celebrations' => ['media_secret' => 'dev-only-secret'],
    ]);
    $db = Db::fromConfig($config);
    static $migrated = false;
    if (!$migrated) {
        $db->migrate();
        $migrated = true;
    }
    return new App($config, ['db' => $db, 'auth' => new DevAuth(), 'rtdb' => new FileRtdb($dir . '/rtdb.json')]);
}

function devHandle(): void
{
    $req = Request::fromGlobals();
    $app = devApp();
    // The dev pages read "Firebase" from here instead of a live connection.
    if ($req->method === 'GET' && $req->path === '/dev/rtdb') {
        Response::json(['value' => $app->rtdb()->get((string) ($req->query['path'] ?? ''))])->send();
        return;
    }
    if ($req->method === 'GET' && $req->path === '/dev/admin') {
        // Lets a dev uid act as an admin: GET /api/dev/admin?uid=...
        $app->rtdb()->set('admins/' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($req->query['uid'] ?? '')), true);
        Response::json(['ok' => true])->send();
        return;
    }
    if ($req->method === 'POST' && $req->path === '/dev/celebration-report') {
        // In dev the organiser's tab referees a celebration game and reports here, as the runner would.
        $app->celebrationGames()->recordResult($req->json(), nowMs());
        Response::json(['ok' => true])->send();
        return;
    }
    (new Routes($app))->handle($req)->send();
}
