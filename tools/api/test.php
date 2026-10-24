<?php
/*
 * Tests for the PlayMona API (no network, no MariaDB: SQLite in memory and fakes).
 * Usage: php tools/api/test.php
 */
declare(strict_types=1);

require __DIR__ . '/../../api/lib/bootstrap.php';

use PlayMona\{App, AuthUser, Catalog, Config, Db, FirebaseAuth, HttpError, Jwt, PaymentGateway, Payments, Photos, RealtimeDb, Request, Routes, Store};

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

    public function createLink(array $order, string $name, string $returnUrl, ?string $imageUrl = null): array
    {
        if ($this->down) throw new RuntimeException('gateway down');
        $this->n++;
        $this->links['link' . $this->n] = $order + ['return' => $returnUrl, 'name' => $name, 'image' => $imageUrl];
        return ['checkout_url' => 'https://sandbox.test/pay/s' . $this->n, 'link_id' => 'link' . $this->n, 'short_url' => 's' . $this->n];
    }

    public function status(string $shortUrl, string $reference): array
    {
        if ($this->down) throw new RuntimeException('gateway down');
        return $this->statuses["$shortUrl|$reference"] ?? ['status' => 'PENDING'];
    }

    public function recentPayments(int $perPage = 50): array { return $this->statement; }

    public string $mode = 'sandbox';
    public function mode(): string { return $this->mode; }
    public function balance(): array { return [['currency' => 'USD', 'available' => 12.5, 'pending' => 1.0]]; }

    public function pay(string $short, string $ref, float $amount, string $status = 'COMPLETED', string $currency = 'USD'): void
    {
        $this->statuses["$short|$ref"] = ['status' => $status, 'amount' => $amount, 'currency_code' => $currency, 'short_url' => $short, 'payment_reference' => $ref];
    }
}

/* ---------- a test world ---------- */
function world(bool $oldPrices = true): array
{
    $db = new Db('sqlite::memory:');
    $db->migrate();
    // Most tests were written when a week was $1 and a month $3, so those prices are
    // saved the way an admin would save them (this also covers reading saved prices).
    if ($oldPrices) {
        $db->run("INSERT INTO settings (name, value, updated_at) VALUES ('plans', ?, 0)", [json_encode(['plus_week' => ['cents' => 100], 'plus_month' => ['cents' => 300]])]);
    }
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
    $photoDir = sys_get_temp_dir() . '/playmona-test-avatars-' . bin2hex(random_bytes(4));
    $app = new App($config, ['db' => $db, 'rtdb' => $rtdb, 'gateway' => $gateway, 'auth' => $auth, 'photos' => new Photos($photoDir)]);
    return ['app' => $app, 'db' => $db, 'rtdb' => $rtdb, 'gw' => $gateway, 'routes' => new Routes($app), 'pay' => $app->payments(), 'store' => $app->store(), 'photoDir' => $photoDir];
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
    return new Request($method, $path, $opts['query'] ?? [], isset($opts['json']) ? json_encode($opts['json']) : ($opts['raw'] ?? ''), $headers, $opts['ip'] ?? '');
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
    eq(['plus_day', 'plus_week', 'plus_month', 'plus_year', 'plus_lifetime', 'game_imposter'], array_column($items, 'id'));
    eq('https://playmona.test/assets/images/plus/plus_day.jpg', $items[0]['imageUrl']);
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

/* ---------- Visitors ---------- */
test('visits: IPs are shortened and countries come from Cloudflare', function () {
    eq('41.216.x.x', PlayMona\Visits::maskIp('41.216.88.7'));
    eq('2c0f:fe38:2101::/48', PlayMona\Visits::maskIp('2c0f:fe38:2101:a::1'));
    eq(null, PlayMona\Visits::maskIp('not an ip'));
    eq('ZM', PlayMona\Visits::country('zm'));
    eq(null, PlayMona\Visits::country('XX'), 'XX is unknown');
    eq('T1', PlayMona\Visits::country('T1'), 'Tor');
    eq(null, PlayMona\Visits::country(''));

    $w = world();
    $id = str_repeat('ab', 12);
    $res = $w['routes']->handle(req('POST', '/visit', ['json' => ['id' => $id, 'page' => 'a'], 'ip' => '172.68.1.1',
        'headers' => ['cf-connecting-ip' => '41.216.88.7', 'cf-ipcountry' => 'ZM']]));
    eq(200, $res->status);
    $row = $w['db']->one('SELECT * FROM visits');
    eq('41.216.x.x', $row['ip_masked'], 'the visitor address, not Cloudflare\'s');
    eq('ZM', $row['country']);
    eq('a', $row['page']);
    $raw = $w['db']->one("SELECT COUNT(*) AS n FROM visits WHERE ip_masked LIKE '%88.7%'");
    eq(0, (int) $raw['n'], 'the full address is never stored');

    // Without Cloudflare (local), the connection address is used.
    $w['routes']->handle(req('POST', '/visit', ['json' => ['id' => str_repeat('cd', 12)], 'ip' => '10.1.2.3']));
    eq('10.1.x.x', $w['db']->one("SELECT ip_masked FROM visits WHERE visitor_id = ?", [str_repeat('cd', 12)])['ip_masked']);
    eq(400, $w['routes']->handle(req('POST', '/visit', ['json' => ['id' => 'nope']]))->status);
});

test('visits: once per device per day, first page kept', function () {
    $w = world();
    $v = $w['app']->visits();
    $id = str_repeat('ef', 12);
    $day = strtotime('2026-10-24 09:00:00 UTC') * 1000;
    eq(true, $v->record($id, 'l', '41.216.1.1', 'ZM', $day));
    eq(false, $v->record($id, 'a', '41.216.1.1', 'ZM', $day + 3600000), 'second visit the same day is ignored');
    eq(true, $v->record($id, 'a', '41.216.1.1', 'ZM', $day + 86400000), 'next day counts again');
    $r = $v->report('2026-10-24', '2026-10-25');
    eq(1, $r['total']);
    eq('list', $r['view']);
    eq(2, $r['visitors'][0]['days']);
    eq('l', $r['visitors'][0]['firstPage']);
    eq(true, $r['visitors'][0]['reachedApp']);
    eq('efefef', $r['visitors'][0]['id'], 'only a short id goes to the browser');
});

test('visits: many visitors are grouped by country; one country can still be listed', function () {
    $w = world();
    $v = $w['app']->visits();
    $t = strtotime('2026-10-24 12:00:00 UTC') * 1000;
    for ($i = 0; $i < PlayMona\Visits::LIST_LIMIT + 5; $i++) {
        $v->record(str_pad(dechex($i), 24, '0', STR_PAD_LEFT), $i % 3 ? 'l' : 'a', '41.216.0.' . ($i % 250), $i < 70 ? 'ZM' : ($i < 100 ? 'ZA' : null), $t + $i);
    }
    $r = $v->report('2026-10-24', '2026-10-24');
    eq(105, $r['total']);
    eq('countries', $r['view']);
    eq(false, isset($r['visitors']));
    eq(['ZM', 70], [$r['countries'][0]['country'], $r['countries'][0]['visitors']]);
    eq(['ZA', 30], [$r['countries'][1]['country'], $r['countries'][1]['visitors']]);
    eq([null, 5], [$r['countries'][2]['country'], $r['countries'][2]['visitors']], 'unknown country');
    eq(24, $r['countries'][0]['reachedApp']);

    $zm = $v->report('2026-10-24', '2026-10-24', null, 'zm');
    eq('list', $zm['view']);
    eq(70, count($zm['visitors']));
    eq('ZM', $zm['country']);
    eq(5, count($v->report('2026-10-24', '2026-10-24', null, 'unknown')['visitors']));
    eq('list', $v->report('2026-10-24', '2026-10-24', 'list')['view'], 'admins can ask for the list anyway');
    throwsHttp(400, fn () => $v->report('yesterday', '2026-10-24'));
});

test('visits: admins only, and old rows are pruned', function () {
    $w = world();
    eq(401, $w['routes']->handle(req('GET', '/admin/visitors', ['query' => ['from' => '2026-10-01', 'to' => '2026-10-24']]))->status);
    eq(403, $w['routes']->handle(req('GET', '/admin/visitors', ['token' => idToken(), 'query' => ['from' => '2026-10-01', 'to' => '2026-10-24']]))->status);
    $w['rtdb']->data['admins/user1'] = true;
    $ok = $w['routes']->handle(req('GET', '/admin/visitors', ['token' => idToken(), 'query' => ['from' => '2026-10-01', 'to' => '2026-10-24']]));
    eq(200, $ok->status);
    eq(0, $ok->body['total']);

    $v = $w['app']->visits();
    $now = strtotime('2026-10-24 12:00:00 UTC') * 1000;
    $v->record(str_repeat('a', 24), 'l', '1.2.3.4', null, $now - 400 * 86400000);
    $v->record(str_repeat('b', 24), 'l', '1.2.3.4', null, $now - 10 * 86400000);
    eq(1, $v->prune($now));
    eq(1, (int) $w['db']->one('SELECT COUNT(*) AS n FROM visits')['n']);
});

echo "\nInvoices, premium and finances\n";

/** Checks out and pays one product for $user through the return page. Returns the order row. */
function buy(array $w, AuthUser $user, string $product): array
{
    $o = $w['pay']->checkout($user, $product)['order'];
    $order = $w['pay']->order($o);
    $w['gw']->pay($order['short_url'], 'ref-' . $o, $order['amount_cents'] / 100);
    eq('paid', $w['pay']->confirmReturn($o, $order['short_url'], 'ref-' . $o));
    return $w['pay']->order($o);
}

test('paid orders get gap-free invoice numbers, with test and live kept apart', function () use ($alice) {
    $w = world();
    $y = gmdate('Y');
    $a = buy($w, $alice, 'plus_week');
    $b = buy($w, $alice, 'plus_month');
    eq("TEST-$y-000001", $a['invoice_no']);
    eq("TEST-$y-000002", $b['invoice_no']);
    eq('sandbox', $a['mode']);
    $w['gw']->mode = 'live';
    $c = buy($w, $alice, 'plus_week');
    eq("PM-$y-000001", $c['invoice_no']);
    eq('live', $c['mode']);
    $w['pay']->confirmReturn($a['id'], $a['short_url'], 'ref-' . $a['id']);   // again: same number
    eq("TEST-$y-000001", $w['pay']->order($a['id'])['invoice_no']);
    $pending = $w['pay']->checkout($alice, 'plus_week')['order'];
    eq(null, $w['pay']->order($pending)['invoice_no']);
});
test('older orders get their mode and invoice numbers filled in once', function () use ($alice) {
    $w = world();
    $a = buy($w, $alice, 'plus_week');
    $w['db']->run('UPDATE orders SET mode = NULL, invoice_no = NULL');
    $w['db']->run('DELETE FROM counters');
    eq(1, $w['pay']->backfill());
    eq(0, $w['pay']->backfill());
    $row = $w['pay']->order($a['id']);
    eq('sandbox', $row['mode']);
    eq('TEST-' . gmdate('Y') . '-000001', $row['invoice_no']);
});
test('orders remember who bought them for the invoice', function () {
    $w = world();
    $o = $w['routes']->handle(req('POST', '/checkout', ['token' => idToken(['name' => 'Alice Moyo', 'email' => 'alice@example.com']), 'json' => ['product' => 'plus_week']]))->body['order'];
    $row = $w['pay']->order($o);
    eq('Alice Moyo', $row['buyer_name']);
    eq('alice@example.com', $row['buyer_email']);
    $w['rtdb']->data['userIndex/user2/displayName'] = 'Tendai';
    $o2 = $w['routes']->handle(req('POST', '/checkout', ['token' => idToken(['sub' => 'user2']), 'json' => ['product' => 'plus_week']]))->body['order'];
    eq('Tendai', $w['pay']->order($o2)['buyer_name']);
});
test('removing an admin gift takes its days away; paid premium cannot be removed', function () use ($alice) {
    $w = world();
    buy($w, $alice, 'plus_week');
    $w['db']->transaction(fn () => $w['store']->grant('alice', ['kind' => 'plus', 'days' => 30], 'admin', null, 'boss', 'prize'));
    $w['db']->transaction(fn () => $w['store']->grant('alice', ['kind' => 'game', 'game' => 'imposter'], 'admin', null, 'boss', 'tester'));
    $days = fn () => round(($w['store']->get('alice')['plusUntil'] - PlayMona\nowMs()) / 86400000);
    eq(37.0, $days());
    $grants = $w['store']->history('alice');
    $byKind = [];
    foreach ($grants as $g) $byKind[$g['source'] . ':' . $g['kind']] = $g;
    $w['store']->revoke($byKind['admin:plus']['id'], 'boss');
    eq(7.0, $days());
    $w['store']->revoke($byKind['admin:game']['id'], 'boss');
    eq([], $w['store']->get('alice')['games']);
    throwsHttp(403, fn () => $w['store']->revoke($byKind['purchase:plus']['id'], 'boss'));
    eq(7.0, $days());
    eq(1, $w['store']->revoke($byKind['admin:plus']['id'], 'boss') === 'alice' ? 1 : 0);   // twice is fine
});
test('admins can remove anything on their own account, then buy again', function () {
    $w = world();
    $boss = new AuthUser('boss', 'password', null, null);
    $first = buy($w, $boss, 'plus_week');
    eq(1, $w['store']->resetOwn('boss'));
    eq(0, $w['store']->get('boss')['plusUntil']);
    eq('paid', $w['pay']->order($first['id'])['status']);            // the record stays
    buy($w, $boss, 'plus_week');
    $days = ($w['store']->get('boss')['plusUntil'] - PlayMona\nowMs()) / 86400000;
    eq(true, $days > 6.99 && $days <= 7.0, '7 fresh days, got ' . $days);
    eq(true, $w['rtdb']->data['entitlements/boss']['plusUntil'] > 0, 'copied to Firebase');
});
test('admin routes: grant, see what can be removed, remove, reset own', function () use ($alice) {
    $w = world();
    $w['rtdb']->data['admins/user1'] = true;
    buy($w, $alice, 'plus_week');
    $tok = idToken();
    eq(200, $w['routes']->handle(req('POST', '/admin/grant', ['token' => $tok, 'json' => ['uid' => 'alice', 'kind' => 'plus', 'days' => 7, 'note' => 'prize']]))->status);
    $info = $w['routes']->handle(req('GET', '/admin/access', ['token' => $tok, 'query' => ['uid' => 'alice']]))->body;
    eq(false, $info['isSelf']);
    $removable = array_values(array_filter($info['grants'], fn ($g) => $g['canRevoke']));
    eq(1, count($removable));
    eq('admin', $removable[0]['source']);
    $paid = array_values(array_filter($info['grants'], fn ($g) => $g['source'] === 'purchase'))[0];
    eq(403, $w['routes']->handle(req('POST', '/admin/revoke', ['token' => $tok, 'json' => ['grantId' => $paid['id']]]))->status);
    $after = $w['routes']->handle(req('POST', '/admin/revoke', ['token' => $tok, 'json' => ['grantId' => $removable[0]['id']]]));
    eq(200, $after->status);
    eq(true, $after->body['grants'][0]['revokedAt'] > 0);
    eq(403, $w['routes']->handle(req('POST', '/admin/reset-own', ['token' => idToken(['sub' => 'mallory'])]))->status);
    $own = $w['routes']->handle(req('POST', '/admin/reset-own', ['token' => $tok]));
    eq(200, $own->status);
    eq(true, $own->body['isSelf']);
});
test('invoices: the buyer and admins can see and download them, nobody else', function () {
    $w = world();
    $tok = idToken(['name' => 'Alice Moyo']);
    $o = $w['routes']->handle(req('POST', '/checkout', ['token' => $tok, 'json' => ['product' => 'plus_month']]))->body['order'];
    eq(404, $w['routes']->handle(req('GET', "/orders/$o/invoice", ['token' => $tok]))->status, 'unpaid');
    $w['gw']->pay('s1', 'r1', 3.00);
    $w['pay']->confirmReturn($o, 's1', 'r1');
    $view = $w['routes']->handle(req('GET', "/orders/$o", ['token' => $tok]))->body;
    eq('TEST-' . gmdate('Y') . '-000001', $view['invoice']['number']);
    eq(true, $view['invoice']['test']);
    eq('Alice Moyo', $view['invoice']['buyer']['name']);
    eq(300, $view['invoice']['totalCents']);
    $pdf = $w['routes']->handle(req('GET', "/orders/$o/invoice", ['token' => $tok]));
    eq(200, $pdf->status);
    eq('application/pdf', $pdf->contentType);
    eq(true, str_starts_with((string) $pdf->file, '%PDF-1.4'));
    eq(true, str_contains((string) $pdf->file, 'TEST-' . gmdate('Y') . '-000001'), 'number in the PDF');
    eq(true, str_contains((string) $pdf->file, '%%EOF'));
    eq('PlayMona-invoice-TEST-' . gmdate('Y') . '-000001.pdf', $pdf->filename);
    eq(404, $w['routes']->handle(req('GET', "/orders/$o/invoice", ['token' => idToken(['sub' => 'mallory'])]))->status);
    $w['rtdb']->data['admins/boss'] = true;
    eq(200, $w['routes']->handle(req('GET', "/orders/$o/invoice", ['token' => idToken(['sub' => 'boss'])]))->status);
    eq('user1', $w['routes']->handle(req('GET', "/orders/$o", ['token' => idToken(['sub' => 'boss'])]))->body['order']['uid']);
});
test('the PDF writer makes a valid file with every object listed', function () {
    $pdf = new PlayMona\Pdf();
    $pdf->text(48, 60, 'Hello (PlayMona) \\ caf' . "\u{e9}", 12, true, '#000', 'right');
    $out = $pdf->output();
    eq(true, str_starts_with($out, '%PDF-1.4'));
    preg_match('/startxref\n(\d+)/', $out, $m);
    eq('xref', substr($out, (int) $m[1], 4), 'startxref points at the table');
    eq(500.0, round($pdf->width('MM', 10) * 1000 / 10 / 2 * (500 / 833)), 'M is 833 units wide');
});
test('finances count live money only, and the order list filters and searches', function () use ($alice) {
    $w = world();
    $w['rtdb']->data['admins/user1'] = true;
    buy($w, $alice, 'plus_week');                 // test payment
    $w['gw']->mode = 'live';
    $live = buy($w, $alice, 'plus_month');       // real payment
    $w['pay']->checkout($alice, 'plus_year');     // still pending
    $sum = $w['routes']->handle(req('GET', '/admin/finance/summary', ['token' => idToken(), 'query' => ['mode' => 'live']]))->body;
    eq(300, $sum['all']['cents']);
    eq(1, $sum['all']['orders']);
    eq(300, $sum['today']['cents']);
    eq(1, $sum['pending']);
    eq(30, count($sum['days']));
    eq(300, end($sum['days'])['cents']);
    eq('plus_month', $sum['byProduct'][0]['product']);
    eq(12.5, $sum['balance'][0]['available']);
    $test = $w['routes']->handle(req('GET', '/admin/finance/summary', ['token' => idToken(), 'query' => ['mode' => 'sandbox']]))->body;
    eq(100, $test['all']['cents']);
    eq(null, $test['balance'], 'the key is for live, so no sandbox balance');
    $list = $w['routes']->handle(req('GET', '/admin/finance/orders', ['token' => idToken(), 'query' => ['mode' => 'live', 'status' => 'all']]))->body;
    eq(2, $list['total']);
    $found = $w['routes']->handle(req('GET', '/admin/finance/orders', ['token' => idToken(), 'query' => ['mode' => 'live', 'q' => $live['invoice_no']]]))->body;
    eq(1, $found['total']);
    eq($live['id'], $found['orders'][0]['id']);
    $none = $w['routes']->handle(req('GET', '/admin/finance/orders', ['token' => idToken(), 'query' => ['mode' => 'live', 'q' => '100%_!']]))->body;
    eq(0, $none['total']);
    eq(403, $w['routes']->handle(req('GET', '/admin/finance/summary', ['token' => idToken(['sub' => 'mallory'])]))->status);
});

echo "\nPlus plans\n";

test('five plans at the standard prices, lifetime is 100 years and the year is best value', function () {
    $items = (new Catalog())->all();
    eq(['plus_day' => 99, 'plus_week' => 299, 'plus_month' => 499, 'plus_year' => 4999, 'plus_lifetime' => 9999], array_map(fn ($i) => $i['cents'], $items));
    eq(Catalog::LIFETIME_DAYS, $items['plus_lifetime']['days']);
    eq(true, $items['plus_lifetime']['lifetime']);
    eq(true, $items['plus_year']['best']);
    eq('/assets/images/plus/plus_week.jpg', $items['plus_week']['image']);
});
test('checkout sends the plan picture to Linkwa as a full address', function () use ($alice) {
    $w = world(false);
    $w['pay']->checkout($alice, 'plus_month');
    eq('https://playmona.test/assets/images/plus/plus_month.jpg', $w['gw']->links['link1']['image']);
    eq(499, $w['gw']->links['link1']['amount_cents']);
    $w['pay']->checkout($alice, 'game_imposter');
    eq(null, $w['gw']->links['link2']['image'], 'no picture set for the game');
});
test('admins change prices, take plans off sale and change pictures; others cannot', function () use ($alice) {
    $w = world(false);
    $r = $w['routes'];
    $save = fn (array $body, string $sub = 'user1') => $r->handle(req('POST', '/admin/plans', ['token' => idToken(['sub' => $sub]), 'json' => $body]));
    eq(403, $save(['id' => 'plus_week', 'cents' => 1])->status);
    eq(403, $r->handle(req('GET', '/admin/plans', ['token' => idToken()]))->status);
    $w['rtdb']->data['admins/user1'] = true;

    $res = $save(['id' => 'plus_week', 'cents' => 349]);
    eq(200, $res->status);
    eq(349, $res->body['plans'][1]['cents']);
    eq(5, count($res->body['plans']));
    foreach ([['cents' => 5], ['cents' => 100001], ['cents' => 'abc'], ['cents' => 2.5]] as $bad) eq(400, $save(['id' => 'plus_week'] + $bad)->status);
    eq(404, $save(['id' => 'plus_forever', 'cents' => 100])->status);

    // A fresh request (new App) sees the saved price, and checkout charges it.
    $w2 = ['app' => new App($w['app']->config, ['db' => $w['db'], 'rtdb' => $w['rtdb'], 'gateway' => $w['gw'], 'auth' => $w['app']->auth()])];
    eq(349, $w2['app']->catalog()->find('plus_week')['cents']);
    $o = $w2['app']->payments()->checkout($alice, 'plus_week');
    eq(349, (int) $w2['app']->payments()->order($o['order'])['amount_cents']);

    // Off sale: hidden from the Plus page and cannot be bought, but still known for old orders.
    eq(200, $save(['id' => 'plus_day', 'enabled' => false])->status);
    $fresh = new Routes(new App($w['app']->config, ['db' => $w['db'], 'rtdb' => $w['rtdb'], 'gateway' => $w['gw'], 'auth' => $w['app']->auth()]));
    $ids = array_column($fresh->handle(req('GET', '/catalog'))->body['items'], 'id');
    eq(false, in_array('plus_day', $ids, true));
    eq(404, $fresh->handle(req('POST', '/checkout', ['token' => idToken(), 'json' => ['product' => 'plus_day']]))->status);
    eq('PlayMona Plus: 1 day', $w['app']->catalog()->find('plus_day')['name']);

    // Pictures: site files or https only; empty puts the standard one back.
    eq(400, $save(['id' => 'plus_year', 'image' => 'javascript:alert(1)'])->status);
    eq(400, $save(['id' => 'plus_year', 'image' => '/assets/../api/config.php'])->status);
    eq(400, $save(['id' => 'plus_year', 'image' => 'http://example.com/a.jpg'])->status);
    $res = $save(['id' => 'plus_year', 'image' => 'https://cdn.example.com/plans/year.png', 'best' => false]);
    eq('https://cdn.example.com/plans/year.png', $res->body['plans'][3]['imageUrl']);
    eq(false, $res->body['plans'][3]['best']);
    eq(true, $res->body['plans'][3]['customImage']);
    $res = $save(['id' => 'plus_year', 'image' => '']);
    eq('https://playmona.test/assets/images/plus/plus_year.jpg', $res->body['plans'][3]['imageUrl']);
    eq(349, $res->body['plans'][1]['cents'], 'other plans keep their changes');
});
test('lifetime Plus lasts 100 years and says so on the invoice', function () use ($alice) {
    $w = world(false);
    $order = buy($w, $alice, 'plus_lifetime');
    $years = ($w['store']->get('alice')['plusUntil'] - PlayMona\nowMs()) / 86400000 / 365;
    eq(true, $years > 99.9, 'about 100 years, got ' . $years);
    $inv = PlayMona\Invoice::data($order, $w['app']->catalog()->find('plus_lifetime'), []);
    eq('PlayMona Plus: lifetime', $inv['lines'][0]['description']);
    eq(true, str_contains($inv['lines'][0]['detail'], 'for life'));
    eq(9999, $inv['totalCents']);
});

echo "\nProfile pictures\n";
// The tests draw their pictures with GD. Without it (some CI machines) they are skipped.
if (!function_exists('imagecreatetruecolor')) {
    echo "  skip (no GD image library here)\n";
} else {

/** A JPEG made with GD, with a fake EXIF block (where phones keep the location) put in after the start. */
function photoJpeg(int $w = 640, int $h = 480): string
{
    $im = imagecreatetruecolor($w, $h);
    imagefill($im, 0, 0, imagecolorallocate($im, 30, 120, 255));
    ob_start();
    imagejpeg($im);
    $jpg = (string) ob_get_clean();
    $exif = "Exif\0\0" . 'GPS 17.8292 S 31.0522 E secret-place';
    $app1 = "\xFF\xE1" . pack('n', strlen($exif) + 2) . $exif;
    return substr($jpg, 0, 2) . $app1 . substr($jpg, 2);
}
function photoFiles(array $w): array { return glob($w['photoDir'] . '/*') ?: []; }

test('a photo is checked, cropped to 256 px, saved without its hidden data and returned as an avatar', function () {
    $w = world();
    $res = $w['routes']->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => photoJpeg()]));
    eq(200, $res->status, json_encode($res->body));
    eq(true, Photos::isValue($res->body['avatar']), 'avatar value ' . $res->body['avatar']);
    eq('/uploads/avatars/' . substr($res->body['avatar'], 6), $res->body['url']);
    $files = photoFiles($w);
    eq(1, count($files));
    $saved = file_get_contents($files[0]);
    $info = getimagesizefromstring($saved);
    eq([256, 256], [$info[0], $info[1]]);
    eq(false, str_contains($saved, 'secret-place'), 'location data is gone');
    eq(true, strlen($saved) <= strlen(photoJpeg()));
});
test('a new photo replaces the old file; removing it deletes the file', function () {
    $w = world();
    $first = $w['routes']->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => photoJpeg()]))->body['avatar'];
    $second = $w['routes']->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => photoJpeg(300, 900)]))->body['avatar'];
    eq(true, $first !== $second, 'a new name, so phones do not show the old one from their cache');
    eq([substr($second, 6)], array_map('basename', photoFiles($w)));
    // Another player's picture is left alone.
    $w['routes']->handle(req('POST', '/avatar', ['token' => idToken(['sub' => 'bob']), 'raw' => photoJpeg()]));
    eq(2, count(photoFiles($w)));
    eq(1, $w['routes']->handle(req('POST', '/avatar/remove', ['token' => idToken()]))->body['removed']);
    eq(1, count(photoFiles($w)), "only bob's is left");
});
test('photo uploads refuse non-pictures, huge files, guests, suspended players and no sign-in', function () {
    $w = world();
    $r = $w['routes'];
    eq(401, $r->handle(req('POST', '/avatar', ['raw' => photoJpeg()]))->status);
    eq(403, $r->handle(req('POST', '/avatar', ['token' => idToken(['firebase' => ['sign_in_provider' => 'anonymous']]), 'raw' => photoJpeg()]))->status);
    eq(415, $r->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => '<?php echo 1; ?>']))->status);
    eq(415, $r->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => "GIF89a\x01\x00\x01\x00\x00\x00\x00;"]))->status);
    eq(400, $r->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => '']))->status);
    eq(413, $r->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => str_repeat('x', Photos::MAX_BYTES + 1)]))->status);
    eq(400, $r->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => photoJpeg(20, 20)]))->status, 'too small');
    $w['rtdb']->data['bans/user1'] = ['by' => 'admin'];
    eq(403, $r->handle(req('POST', '/avatar', ['token' => idToken(), 'raw' => photoJpeg()]))->status);
    eq(0, count(photoFiles($w)), 'nothing was saved');
});
test('without the GD library only small pictures made by the app are taken, as they are', function () {
    $dir = sys_get_temp_dir() . '/playmona-test-avatars-' . bin2hex(random_bytes(4));
    $plain = new Photos($dir, false);
    $small = photoJpeg(256, 256);
    $value = $plain->save('alice', $small);
    eq(true, Photos::isValue($value) && str_ends_with($value, '.jpg'));
    throwsHttp(415, fn () => $plain->save('alice', photoJpeg(1200, 900)));
    $im = imagecreatetruecolor(64, 64);
    ob_start(); imagepng($im); $png = (string) ob_get_clean();
    throwsHttp(415, fn () => $plain->save('alice', $png));
});
test('admins remove a player photo and the player gets a character back; others cannot', function () {
    $w = world();
    $r = $w['routes'];
    $value = $r->handle(req('POST', '/avatar', ['token' => idToken(['sub' => 'bob']), 'raw' => photoJpeg()]))->body['avatar'];
    $w['rtdb']->data['users/bob/profile/avatar'] = $value;
    $w['rtdb']->data['userIndex/bob/avatar'] = $value;
    eq(403, $r->handle(req('POST', '/admin/avatar/remove', ['token' => idToken(), 'json' => ['uid' => 'bob']]))->status);
    eq(1, count(photoFiles($w)));
    $w['rtdb']->data['admins/user1'] = true;
    eq(400, $r->handle(req('POST', '/admin/avatar/remove', ['token' => idToken(), 'json' => ['uid' => '../x']]))->status);
    $res = $r->handle(req('POST', '/admin/avatar/remove', ['token' => idToken(), 'json' => ['uid' => 'bob']]));
    eq(200, $res->status);
    eq(1, $res->body['removed']);
    eq(0, count(photoFiles($w)));
    eq(Photos::fallbackCharacter('bob'), $w['rtdb']->data['users/bob/profile/avatar']);
    eq(Photos::fallbackCharacter('bob'), $w['rtdb']->data['userIndex/bob/avatar']);
    // A player who already uses a character keeps it.
    $w['rtdb']->data['users/cara/profile/avatar'] = 'unicorn';
    $r->handle(req('POST', '/admin/avatar/remove', ['token' => idToken(), 'json' => ['uid' => 'cara']]));
    eq('unicorn', $w['rtdb']->data['users/cara/profile/avatar']);
});
}

echo "\n" . ($GLOBALS['count'] - $GLOBALS['failures']) . '/' . $GLOBALS['count'] . " passed\n";
exit($GLOBALS['failures'] ? 1 : 0);
