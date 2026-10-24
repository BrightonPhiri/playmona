<?php
declare(strict_types=1);

namespace PlayMona;

/** Builds the services from the config, once each. Tests pass their own fakes in $overrides. */
class App
{
    private array $made = [];

    public function __construct(public readonly Config $config, private array $overrides = []) {}

    private function make(string $name, callable $build): mixed
    {
        return $this->made[$name] ??= ($this->overrides[$name] ?? $build());
    }

    public function db(): Db { return $this->make('db', fn () => Db::fromConfig($this->config)); }

    public function auth(): FirebaseAuth
    {
        return $this->make('auth', fn () => new FirebaseAuth((string) $this->config->require('firebase.project_id')));
    }

    public function rtdb(): RealtimeDb
    {
        return $this->make('rtdb', fn () => new FirebaseDb(
            (string) $this->config->require('firebase.database_url'),
            (string) $this->config->require('firebase.service_account')
        ));
    }

    public function gateway(): PaymentGateway
    {
        return $this->make('gateway', fn () => new Linkwa(
            (string) $this->config->require('linkwa.api_base'),
            (string) $this->config->require('linkwa.api_key')
        ));
    }

    public function catalog(): Catalog { return $this->make('catalog', fn () => new Catalog((array) $this->config->get('premium_games', []))); }
    public function store(): Store { return $this->make('store', fn () => new Store($this->db(), $this->rtdb())); }
    public function visits(): Visits { return $this->make('visits', fn () => new Visits($this->db())); }

    public function payments(): Payments
    {
        return $this->make('payments', fn () => new Payments(
            $this->db(), $this->store(), $this->catalog(), $this->gateway(),
            (string) $this->config->require('site_url')
        ));
    }
}

/** Every API address. index.php sends each request through handle(). */
class Routes
{
    public function __construct(private App $app) {}

    public function handle(Request $req): Response
    {
        try {
            return $this->route($req);
        } catch (HttpError $e) {
            return Response::json(['error' => $e->reason, 'message' => $e->getMessage()], $e->status);
        } catch (\Throwable $e) {
            error_log('PlayMona API: ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine());
            return Response::json(['error' => 'server', 'message' => 'Something went wrong. Please try again.'], 500);
        }
    }

    private function route(Request $req): Response
    {
        $m = $req->method;
        $p = $req->path;

        if ($m === 'GET' && $p === '/health') return $this->health();
        if ($m === 'GET' && $p === '/catalog') return Response::json(['items' => array_values($this->app->catalog()->all())]);
        if ($m === 'POST' && $p === '/checkout') return $this->checkout($req);
        if ($m === 'GET' && $p === '/checkout/return') return $this->checkoutReturn($req);
        if ($m === 'GET' && preg_match('#^/orders/([A-Za-z0-9_]+)$#', $p, $mm)) return $this->order($req, $mm[1]);
        if ($m === 'GET' && $p === '/me') return $this->me($req);
        if ($m === 'POST' && $p === '/linkwa/webhook') return $this->webhook($req);
        if ($m === 'POST' && $p === '/admin/grant') return $this->adminGrant($req);
        if ($m === 'GET' && $p === '/admin/access') return $this->adminAccess($req);
        if ($m === 'POST' && $p === '/visit') return $this->visit($req);
        if ($m === 'GET' && $p === '/admin/visitors') return $this->adminVisitors($req);

        throw new HttpError(404, 'Not found.', 'not-found');
    }

    private function health(): Response
    {
        $this->app->db()->one('SELECT 1 AS ok');
        return Response::json(['ok' => true, 'time' => nowMs()]);
    }

    private function user(Request $req): AuthUser
    {
        $token = $req->bearer();
        if (!$token) throw new HttpError(401, 'Please sign in.', 'no-token');
        return $this->app->auth()->verify($token);
    }

    private function admin(Request $req): AuthUser
    {
        $user = $this->user($req);
        if ($this->app->rtdb()->get('admins/' . $user->uid) !== true) throw new HttpError(403, 'Admins only.', 'not-admin');
        return $user;
    }

    private function checkout(Request $req): Response
    {
        $user = $this->user($req);
        $product = (string) ($req->json()['product'] ?? '');
        return Response::json($this->app->payments()->checkout($user, $product, $this->origin($req)));
    }

    /**
     * The site address the request came from, if it is one of ours: site_url, its www or
     * non-www twin, or anything in the allowed_origins setting. Otherwise site_url.
     */
    private function origin(Request $req): string
    {
        $site = rtrim((string) $this->app->config->require('site_url'), '/');
        $allowed = array_map(fn ($o) => rtrim((string) $o, '/'), (array) $this->app->config->get('allowed_origins', []));
        $allowed[] = $site;
        $parts = parse_url($site);
        if (isset($parts['scheme'], $parts['host'])) {
            $host = $parts['host'];
            $twin = str_starts_with($host, 'www.') ? substr($host, 4) : 'www.' . $host;
            $allowed[] = $parts['scheme'] . '://' . $twin . (isset($parts['port']) ? ':' . $parts['port'] : '');
        }
        $origin = rtrim((string) $req->header('origin'), '/');
        return in_array($origin, $allowed, true) ? $origin : $site;
    }

    private function checkoutReturn(Request $req): Response
    {
        $order = (string) ($req->query['order'] ?? '');
        $outcome = $this->app->payments()->confirmReturn(
            $order,
            (string) ($req->query['short_url'] ?? ''),
            (string) ($req->query['payment_reference'] ?? '')
        );
        // A relative address keeps the player on the host Linkwa sent them to, which is
        // the one they started on (see origin()), so they are still signed in.
        return Response::redirect('/play?payment=' . $outcome . '&order=' . rawurlencode(preg_replace('/[^A-Za-z0-9_]/', '', $order)));
    }

    private function order(Request $req, string $id): Response
    {
        $user = $this->user($req);
        $order = $this->app->payments()->order($id);
        if (!$order || $order['uid'] !== $user->uid) throw new HttpError(404, 'Order not found.', 'no-order');
        return Response::json(['order' => Payments::publicOrder($order)]);
    }

    private function me(Request $req): Response
    {
        $user = $this->user($req);
        $orders = $this->app->db()->all('SELECT * FROM orders WHERE uid = ? ORDER BY created_at DESC LIMIT 20', [$user->uid]);
        return Response::json([
            'uid' => $user->uid,
            'access' => $this->app->store()->get($user->uid),
            'orders' => array_map([Payments::class, 'publicOrder'], $orders),
        ]);
    }

    private function webhook(Request $req): Response
    {
        $status = $this->app->payments()->webhook(
            $req->rawBody,
            $req->header('x-linkwa-signature'),
            (string) $this->app->config->get('linkwa.signing_secret', '')
        );
        return Response::json(['ok' => $status === 200], $status);
    }

    private function adminGrant(Request $req): Response
    {
        $admin = $this->admin($req);
        $body = $req->json();
        $uid = (string) ($body['uid'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $uid)) throw new HttpError(400, 'Choose a player.', 'bad-uid');
        $kind = (string) ($body['kind'] ?? '');
        if ($kind === 'plus') {
            $grant = ['kind' => 'plus', 'days' => (int) ($body['days'] ?? 0)];
        } elseif ($kind === 'game' && preg_match('/^[A-Za-z0-9_-]{1,40}$/', (string) ($body['game'] ?? ''))) {
            $grant = ['kind' => 'game', 'game' => (string) $body['game']];
        } else {
            throw new HttpError(400, 'Choose Plus days or a game.', 'bad-grant');
        }
        $note = trim((string) ($body['note'] ?? ''));
        if ($note === '') throw new HttpError(400, 'Add a note saying why.', 'no-note');

        $store = $this->app->store();
        $this->app->db()->transaction(fn () => $store->grant($uid, $grant, 'admin', null, $admin->uid, $note));
        $store->sync($uid);
        return Response::json(['access' => $store->get($uid)]);
    }

    /** js/visit.js, once a day per device. No sign-in. */
    private function visit(Request $req): Response
    {
        $body = $req->json();
        $this->app->visits()->record(
            (string) ($body['id'] ?? ''),
            (string) ($body['page'] ?? 'l'),
            $req->clientIp(),
            $req->header('cf-ipcountry')
        );
        return Response::json(['ok' => true]);
    }

    private function adminVisitors(Request $req): Response
    {
        $this->admin($req);
        $q = $req->query;
        return Response::json($this->app->visits()->report(
            (string) ($q['from'] ?? ''),
            (string) ($q['to'] ?? ''),
            isset($q['view']) ? (string) $q['view'] : null,
            isset($q['country']) ? (string) $q['country'] : null
        ));
    }

    private function adminAccess(Request $req): Response
    {
        $this->admin($req);
        $uid = (string) ($req->query['uid'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $uid)) throw new HttpError(400, 'Choose a player.', 'bad-uid');
        $orders = $this->app->db()->all('SELECT * FROM orders WHERE uid = ? ORDER BY created_at DESC LIMIT 20', [$uid]);
        return Response::json([
            'access' => $this->app->store()->get($uid),
            'grants' => $this->app->store()->history($uid),
            'orders' => array_map([Payments::class, 'publicOrder'], $orders),
        ]);
    }
}
