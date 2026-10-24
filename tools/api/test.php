<?php
/*
 * Tests for the PlayMona API (no network, no MariaDB: SQLite in memory and fakes).
 * Usage: php tools/api/test.php
 */
declare(strict_types=1);

require __DIR__ . '/../../api/lib/bootstrap.php';

use PlayMona\{App, AuthUser, Catalog, Config, Db, FirebaseAuth, HttpError, Jwt, PaymentGateway, Payments, RealtimeDb, Request, Routes, Store};

/* ---------- tiny harness ---------- */
$GLOBALS['failures'] = 0;
$GLOBALS['count'] = 0;
function test(string $name, callable $fn): void
{
    $GLOBALS['count']++;
    try {
        $fn();
        echo "  ok   $name\n";
    } catch (Throwable $e) {
        $GLOBALS['failures']++;
        echo "  FAIL $name\n       " . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ")\n";
    }
}
function eq(mixed $expected, mixed $actual, string $what = ''): void
{
    if ($expected !== $actual) {
        throw new Exception(($what ? "$what: " : '') . 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}
function throwsHttp(int $status, callable $fn): void
{
    try {
        $fn();
    } catch (HttpError $e) {
        eq($status, $e->status, 'status');
        return;
    }
    throw new Exception("expected HTTP $status error");
}

/* ---------- fakes ---------- */
class MemoryRtdb implements RealtimeDb
{
    public array $data = [];
    public bool $down = false;
    public int $writes = 0;
    public function get(string $path): mixed { return $this->data[$path] ?? null; }
    public function set(string $path, mixed $value): void
    {
        if ($this->down) throw new RuntimeException('offline');
        $this->writes++;
        $this->data[$path] = $value;
    }
}

class FakeGateway implements PaymentGateway
{
    public array $links = [];      // link_id => order
    public array $statuses = [];   // "short|ref" => status reply
    public array $statement = [];
    public bool $down = false;
    private int $n = 0;

    public function createLink(array $order, string $name, string $returnUrl): array
    {
        if ($this->down) throw new RuntimeException('gateway down');
        $this->n++;
        $this->links['link' . $this->n] = $order + ['return' => $returnUrl, 'name' => $name];
        return ['checkout_url' => 'https://sandbox.test/pay/s' . $this->n, 'link_id' => 'link' . $this->n, 'short_url' => 's' . $this->n];
    }

    public function status(string $shortUrl, string $reference): array
    {
        if ($this->down) throw new RuntimeException('gateway down');
        return $this->statuses["$shortUrl|$reference"] ?? ['status' => 'PENDING'];
    }

    public function recentPayments(int $perPage = 50): array { return $this->statement; }

    public function pay(string $short, string $ref, float $amount, string $status = 'COMPLETED', string $currency = 'USD'): void
    {
        $this->statuses["$short|$ref"] = ['status' => $status, 'amount' => $amount, 'currency_code' => $currency, 'short_url' => $short, 'payment_reference' => $ref];
    }
}

/* ---------- a test world ---------- */
function world(): array
{
    $db = new Db('sqlite::memory:');
    $db->migrate();
    $rtdb = new MemoryRtdb();
    $gateway = new FakeGateway();
    $config = new Config([
        'site_url' => 'https://playmona.test',
        'firebase' => ['project_id' => 'play-mona'],
        'linkwa' => ['signing_secret' => 'whsec'],
        'premium_games' => ['imposter' => ['name' => 'Imposter', 'cents' => 199]],
    ]);
    $key = testKey();
    $auth = new FirebaseAuth('play-mona', fn () => ['kid1' => $key['public']]);
    $app = new App($config, ['db' => $db, 'rtdb' => $rtdb, 'gateway' => $gateway, 'auth' => $auth]);
    return ['app' => $app, 'db' => $db, 'rtdb' => $rtdb, 'gw' => $gateway, 'routes' => new Routes($app), 'pay' => $app->payments(), 'store' => $app->store()];
}

/** New RSA key. Windows PHP needs an openssl.cnf to make keys, so the tests bring a tiny one. */
function newKey()
{
    $cnf = sys_get_temp_dir() . '/playmona-test-openssl.cnf';
    if (!is_file($cnf)) file_put_contents($cnf, "[req]
distinguished_name = dn
[dn]
");
    return openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA, 'config' => $cnf]);
}

function testKey(): array
{
    static $key = null;
    if ($key === null) {
        $res = newKey();
        if ($res === false) throw new RuntimeException('openssl_pkey_new failed: ' . openssl_error_string());
        openssl_pkey_export($res, $private, null, ['config' => sys_get_temp_dir() . '/playmona-test-openssl.cnf']);
        $key = ['private' => $private, 'public' => openssl_pkey_get_details($res)['key']];
    }
    return $key;
}

function idToken(array $overrides = [], string $kid = 'kid1', ?string $privateKey = null): string
{
    $now = time();
    $payload = array_merge([
        'iss' => 'https://securetoken.google.com/play-mona',
        'aud' => 'play-mona',
        'auth_time' => $now - 60,
        'iat' => $now - 60,
        'exp' => $now + 3000,
        'sub' => 'user1',
        'firebase' => ['sign_in_provider' => 'password'],
    ], $overrides);
    return Jwt::signRs256($payload, $privateKey ?? testKey()['private'], $kid);
}

function req(string $method, string $path, array $opts = []): Request
{
    $headers = $opts['headers'] ?? [];
    if (isset($opts['token'])) $headers['authorization'] = 'Bearer ' . $opts['token'];
    return new Request($method, $path, $opts['query'] ?? [], isset($opts['json']) ? json_encode($opts['json']) : ($opts['raw'] ?? ''), $headers);
}

$alice = new AuthUser('alice', 'password', 'a@example.com', 'Alice');

echo "PlayMona API tests\n\nSign-in tokens\n";

test('a good token is accepted', function () {
    $user = (world()['app'])->auth()->verify(idToken());
    eq('user1', $user->uid);
    eq('password', $user->provider);
});
test('wrong project, issuer, expired or future tokens are refused', function () {
    $auth = world()['app']->auth();
    foreach ([['aud' => 'other'], ['iss' => 'https://securetoken.google.com/other'], ['exp' => time() - 1000], ['iat' => time() + 1000], ['sub' => ''], ['auth_time' => time() + 1000]] as $bad) {
        throwsHttp(401, fn () => $auth->verify(idToken($bad)));
    }
});
test('a token signed by another key is refused', function () {
    openssl_pkey_export(newKey(), $pem, null, ['config' => sys_get_temp_dir() . '/playmona-test-openssl.cnf']);
    throwsHttp(401, fn () => world()['app']->auth()->verify(idToken([], 'kid1', $pem)));
});
test('unknown key id, "none" algorithm and garbage are refused', function () {
    $auth = world()['app']->auth();
    throwsHttp(401, fn () => $auth->verify(idToken([], 'kid2')));
    $none = Jwt::b64urlEncode('{"alg":"none","kid":"kid1"}') . '.' . Jwt::b64urlEncode('{"sub":"x"}') . '.';
    throwsHttp(401, fn () => $auth->verify($none));
    throwsHttp(401, fn () => $auth->verify('not.a.token'));
});

echo "\nCheckout\n";

test('checkout saves an order at the server price and returns the Linkwa address', function () use ($alice) {
    $w = world();
    $out = $w['pay']->checkout($alice, 'plus_month');
    eq('https://sandbox.test/pay/s1', $out['checkoutUrl']);
    $order = $w['pay']->order($out['order']);
    eq(300, (int) $order['amount_cents']);
    eq('pending', $order['status']);
    eq('s1', $order['short_url']);
    eq('https://playmona.test/api/checkout/return?order=' . $out['order'], $w['gw']->links['link1']['return']);
});
test('unknown products, anonymous players and too many checkouts are refused', function () use ($alice) {
    $w = world();
    throwsHttp(404, fn () => $w['pay']->checkout($alice, 'plus_forever'));
    throwsHttp(403, fn () => $w['pay']->checkout(new AuthUser('anon', 'anonymous', null, null), 'plus_week'));
    for ($i = 0; $i < 10; $i++) $w['pay']->checkout($alice, 'plus_week');
    throwsHttp(429, fn () => $w['pay']->checkout($alice, 'plus_week'));
});
test('when Linkwa is down the order is marked failed and the player sees 502', function () use ($alice) {
    $w = world();
    $w['gw']->down = true;
    throwsHttp(502, fn () => $w['pay']->checkout($alice, 'plus_week'));
    eq('failed', $w['db']->one('SELECT status FROM orders')['status']);
});

echo "\nConfirming payments\n";

test('return page: a paid order grants Plus once, however often it is reloaded', function () use ($alice) {
    $w = world();
    $o = $w['pay']->checkout($alice, 'plus_week')['order'];
    $w['gw']->pay('s1', 'ref1', 1.00);
    eq('paid', $w['pay']->confirmReturn($o, 's1', 'ref1'));
    eq('paid', $w['pay']->confirmReturn($o, 's1', 'ref1'));
    $until = $w['store']->get('alice')['plusUntil'];
    $days = ($until - PlayMona\nowMs()) / 86400000;
    eq(true, $days > 6.99 && $days <= 7.0, 'about 7 days');
    eq(1, (int) $w['db']->one('SELECT COUNT(*) AS n FROM grants')['n']);
    eq($until, $w['rtdb']->data['entitlements/alice']['plusUntil'], 'copied to Firebase');
});
test('return page: a mismatched short url, wrong amount or currency grants nothing', function () use ($alice) {
    $w = world();
    $o = $w['pay']->checkout($alice, 'plus_month')['order'];
    $w['gw']->pay('s1', 'ref1', 1.00);              // paid $1 for a $3 item
    eq('pending', $w['pay']->confirmReturn($o, 's9', 'ref1'));
    eq('failed', $w['pay']->confirmReturn($o, 's1', 'ref1'));
    $w['gw']->pay('s1', 'ref2', 3.00, 'COMPLETED', 'ZWG');
    eq('failed', $w['pay']->confirmReturn($o, 's1', 'ref2'));
    eq(0, $w['store']->get('alice')['plusUntil']);
});
test('return page: someone else\'s paid link cannot complete my order', function () use ($alice) {
    $w = world();
    $bob = new AuthUser('bob', 'password', null, null);
    $mine = $w['pay']->checkout($alice, 'plus_week')['order'];   // s1
    $w['pay']->checkout($bob, 'plus_week');                     // s2
    $w['gw']->pay('s2', 'bobref', 1.00);
    eq('pending', $w['pay']->confirmReturn($mine, 's2', 'bobref'));
    eq(0, $w['store']->get('alice')['plusUntil']);
});
test('return page: pending, failed and gateway errors', function () use ($alice) {
    $w = world();
    $o = $w['pay']->checkout($alice, 'plus_week')['order'];
    eq('pending', $w['pay']->confirmReturn($o, 's1', 'r'));
    $w['gw']->pay('s1', 'r', 1.00, 'CANCELLED');
    eq('failed', $w['pay']->confirmReturn($o, 's1', 'r'));
    $w['gw']->down = true;
    eq('pending', $w['pay']->confirmReturn($o, 's1', 'r'));
    eq('failed', $w['pay']->confirmReturn('o_nope', 's1', 'r'));
});
test('webhook: bad signature is 401, good one grants, a repeat grants nothing more', function () use ($alice) {
    $w = world();
    $o = $w['pay']->checkout($alice, 'game_imposter')['order'];
    $body = json_encode(['status' => 'PAID', 'reference' => 'PAY-1', 'amount' => 1.99, 'currency' => 'USD', 'external_payment_link_id' => 'link1']);
    eq(401, $w['pay']->webhook($body, 'nope', 'whsec'));
    eq(401, $w['pay']->webhook($body, hash_hmac('sha256', $body, 'whsec'), ''));
    $sig = hash_hmac('sha256', $body, 'whsec');
    eq(200, $w['pay']->webhook($body, $sig, 'whsec'));
    eq(200, $w['pay']->webhook($body, $sig, 'whsec'));
    eq(['imposter' => true], $w['store']->get('alice')['games']);
    eq(1, (int) $w['db']->one('SELECT COUNT(*) AS n FROM grants')['n']);
    eq('webhook', $w['pay']->order($o)['paid_via']);
});
test('webhook then return page: still credited once', function () use ($alice) {
    $w = world();
    $o = $w['pay']->checkout($alice, 'plus_week')['order'];
    $body = json_encode(['status' => 'PAID', 'reference' => 'PAY-1', 'amount' => 1, 'currency' => 'USD', 'external_payment_link_id' => 'link1']);
    $w['pay']->webhook($body, hash_hmac('sha256', $body, 'whsec'), 'whsec');
    $w['gw']->pay('s1', 'uuid-1', 1.00);
    eq('paid', $w['pay']->confirmReturn($o, 's1', 'uuid-1'));
    eq(1, (int) $w['db']->one('SELECT COUNT(*) AS n FROM grants')['n']);
});
test('cron: statement payments credit pending orders once', function () use ($alice) {
    $w = world();
    $w['pay']->checkout($alice, 'plus_week');
    $w['pay']->checkout($alice, 'plus_month');
    $w['gw']->statement = [
        ['id' => 'st1', 'link_id' => 'link1', 'amount' => 1.0, 'currency' => 'USD'],
        ['id' => 'st2', 'link_id' => 'link2', 'amount' => 1.0, 'currency' => 'USD'], // wrong amount
        ['id' => 'st3', 'link_id' => 'other-app', 'amount' => 3.0, 'currency' => 'USD'],
    ];
    eq(1, $w['pay']->reconcile());
    eq(0, $w['pay']->reconcile());
});
test('Plus time stacks on what is left', function () use ($alice) {
    $w = world();
    $w['pay']->checkout($alice, 'plus_week');
    $w['pay']->checkout($alice, 'plus_month');
    $w['gw']->pay('s1', 'a', 1.00);
    $w['gw']->pay('s2', 'b', 3.00);
    $orders = $w['db']->all('SELECT id FROM orders ORDER BY created_at, short_url');
    $w['pay']->confirmReturn($orders[0]['id'], 's1', 'a');
    $w['pay']->confirmReturn($orders[1]['id'], 's2', 'b');
    $days = ($w['store']->get('alice')['plusUntil'] - PlayMona\nowMs()) / 86400000;
    eq(true, $days > 36.99 && $days <= 37.0, '37 days, got ' . $days);
});
test('when Firebase is down the grant is kept and synced later', function () use ($alice) {
    $w = world();
    $o = $w['pay']->checkout($alice, 'plus_week')['order'];
    $w['rtdb']->down = true;
    $w['gw']->pay('s1', 'r', 1.00);
    eq('paid', $w['pay']->confirmReturn($o, 's1', 'r'));
    eq(false, isset($w['rtdb']->data['entitlements/alice']));
    $w['rtdb']->down = false;
    eq(1, $w['store']->syncPending());
    eq(true, $w['rtdb']->data['entitlements/alice']['plusUntil'] > 0);
    eq(0, $w['store']->syncPending());
});

echo "\nRoutes\n";

test('health, catalog and 404', function () {
    $r = world()['routes'];
    eq(200, $r->handle(req('GET', '/health'))->status);
    $items = $r->handle(req('GET', '/catalog'))->body['items'];
    eq(['plus_week', 'plus_month', 'plus_year', 'game_imposter'], array_column($items, 'id'));
    eq(404, $r->handle(req('GET', '/nope'))->status);
});
test('checkout needs a sign-in; works with one', function () {
    $r = world()['routes'];
    eq(401, $r->handle(req('POST', '/checkout', ['json' => ['product' => 'plus_week']]))->status);
    eq(401, $r->handle(req('POST', '/checkout', ['token' => 'junk', 'json' => ['product' => 'plus_week']]))->status);
    $res = $r->handle(req('POST', '/checkout', ['token' => idToken(), 'json' => ['product' => 'plus_week']]));
    eq(200, $res->status);
    eq(true, str_starts_with($res->body['order'], 'o_'));
});
test('the return page redirects to the app with the outcome', function () {
    $w = world();
    $order = $w['routes']->handle(req('POST', '/checkout', ['token' => idToken(), 'json' => ['product' => 'plus_week']]))->body['order'];
    $w['gw']->pay('s1', 'r1', 1.00);
    $res = $w['routes']->handle(req('GET', '/checkout/return', ['query' => ['order' => $order, 'short_url' => 's1', 'payment_reference' => 'r1']]));
    eq(302, $res->status);
    eq("/play?payment=paid&order=$order", $res->location);
});
test('Linkwa sends players back to the address they started on (www or not)', function () {
    $w = world();
    $buy = fn ($origin) => $w['routes']->handle(req('POST', '/checkout', ['token' => idToken(), 'json' => ['product' => 'plus_week'], 'headers' => $origin ? ['origin' => $origin] : []]));
    $buy('https://www.playmona.test');
    $buy('https://playmona.test');
    $buy('https://evil.example');
    $buy(null);
    $returns = array_map(fn ($l) => strstr($l['return'], '/api/', true), array_values($w['gw']->links));
    eq(['https://www.playmona.test', 'https://playmona.test', 'https://playmona.test', 'https://playmona.test'], $returns);
});
test('players only see their own orders', function () {
    $w = world();
    $order = $w['routes']->handle(req('POST', '/checkout', ['token' => idToken(), 'json' => ['product' => 'plus_week']]))->body['order'];
    eq(200, $w['routes']->handle(req('GET', "/orders/$order", ['token' => idToken()]))->status);
    eq(404, $w['routes']->handle(req('GET', "/orders/$order", ['token' => idToken(['sub' => 'mallory'])]))->status);
    $me = $w['routes']->handle(req('GET', '/me', ['token' => idToken()]))->body;
    eq(1, count($me['orders']));
});
test('the webhook route checks the X-Linkwa-Signature header', function () {
    $w = world();
    $body = '{"status":"PAID"}';
    eq(401, $w['routes']->handle(req('POST', '/linkwa/webhook', ['raw' => $body]))->status);
    eq(200, $w['routes']->handle(req('POST', '/linkwa/webhook', ['raw' => $body, 'headers' => ['x-linkwa-signature' => hash_hmac('sha256', $body, 'whsec')]]))->status);
});
test('admin grants: only admins, a note is required, and it is recorded', function () {
    $w = world();
    $grant = ['uid' => 'bob', 'kind' => 'plus', 'days' => 30, 'note' => 'Quiz night prize'];
    eq(403, $w['routes']->handle(req('POST', '/admin/grant', ['token' => idToken(), 'json' => $grant]))->status);
    $w['rtdb']->data['admins/user1'] = true;
    eq(400, $w['routes']->handle(req('POST', '/admin/grant', ['token' => idToken(), 'json' => ['note' => ''] + $grant]))->status);
    eq(400, $w['routes']->handle(req('POST', '/admin/grant', ['token' => idToken(), 'json' => ['days' => 0] + $grant]))->status);
    eq(200, $w['routes']->handle(req('POST', '/admin/grant', ['token' => idToken(), 'json' => $grant]))->status);
    eq(200, $w['routes']->handle(req('POST', '/admin/grant', ['token' => idToken(), 'json' => ['uid' => 'bob', 'kind' => 'game', 'game' => 'imposter', 'note' => 'tester']]))->status);
    $info = $w['routes']->handle(req('GET', '/admin/access', ['token' => idToken(), 'query' => ['uid' => 'bob']]))->body;
    eq(['imposter' => true], $info['access']['games']);
    eq(2, count($info['grants']));
    eq('Quiz night prize', $info['grants'][1]['note']);
});
test('errors inside a route become a plain 500 without details', function () {
    $w = world();
    $w['db']->pdo->exec('DROP TABLE orders');
    $res = $w['routes']->handle(req('GET', '/me', ['token' => idToken()]));
    eq(500, $res->status);
    eq('server', $res->body['error']);
});

echo "\n" . ($GLOBALS['count'] - $GLOBALS['failures']) . '/' . $GLOBALS['count'] . " passed\n";
exit($GLOBALS['failures'] ? 1 : 0);
