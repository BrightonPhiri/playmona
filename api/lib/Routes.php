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

    public function catalog(): Catalog
    {
        return $this->make('catalog', fn () => new Catalog(
            (array) $this->config->get('premium_games', []),
            Catalog::loadPlanSettings($this->db())
        ));
    }
    public function store(): Store { return $this->make('store', fn () => new Store($this->db(), $this->rtdb())); }
    public function visits(): Visits { return $this->make('visits', fn () => new Visits($this->db())); }
    public function finance(): Finance { return $this->make('finance', fn () => new Finance($this->db())); }
    public function photos(): Photos
    {
        return $this->make('photos', fn () => new Photos((string) ($this->config->get('uploads.avatars_dir') ?: Photos::defaultDir())));
    }

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
        if ($m === 'GET' && $p === '/catalog') return $this->publicCatalog();
        if ($m === 'POST' && $p === '/checkout') return $this->checkout($req);
        if ($m === 'GET' && $p === '/checkout/return') return $this->checkoutReturn($req);
        if ($m === 'GET' && preg_match('#^/orders/([A-Za-z0-9_]+)$#', $p, $mm)) return $this->order($req, $mm[1]);
        if ($m === 'GET' && preg_match('#^/orders/([A-Za-z0-9_]+)/invoice$#', $p, $mm)) return $this->invoicePdf($req, $mm[1]);
        if ($m === 'GET' && $p === '/me') return $this->me($req);
        if ($m === 'POST' && $p === '/linkwa/webhook') return $this->webhook($req);
        if ($m === 'POST' && $p === '/admin/grant') return $this->adminGrant($req);
        if ($m === 'GET' && $p === '/admin/access') return $this->adminAccess($req);
        if ($m === 'POST' && $p === '/admin/revoke') return $this->adminRevoke($req);
        if ($m === 'POST' && $p === '/admin/reset-own') return $this->adminResetOwn($req);
        if ($m === 'GET' && $p === '/admin/plans') return $this->adminPlans($req);
        if ($m === 'POST' && $p === '/admin/plans') return $this->adminSavePlan($req);
        if ($m === 'GET' && $p === '/admin/finance/summary') return $this->financeSummary($req);
        if ($m === 'GET' && $p === '/admin/finance/orders') return $this->financeOrders($req);
        if ($m === 'POST' && $p === '/visit') return $this->visit($req);
        if ($m === 'POST' && $p === '/avatar') return $this->uploadAvatar($req);
        if ($m === 'POST' && $p === '/avatar/remove') return $this->removeAvatar($req);
        if ($m === 'POST' && $p === '/admin/avatar/remove') return $this->adminRemoveAvatar($req);
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

    /** What is on sale, for the Plus page. Pictures as full addresses so they work anywhere. */
    private function publicCatalog(): Response
    {
        $site = (string) $this->app->config->require('site_url');
        $items = [];
        foreach ($this->app->catalog()->forSale() as $item) {
            unset($item['customImage'], $item['defaultCents'], $item['enabled']);
            $item['imageUrl'] = Catalog::imageUrl($item['image'] ?? null, $site);
            $items[] = $item;
        }
        return Response::json(['items' => $items]);
    }

    /** Every Plus plan, on sale or not, for the admin portal. */
    private function adminPlans(Request $req): Response
    {
        $this->admin($req);
        $site = (string) $this->app->config->require('site_url');
        $plans = [];
        foreach ($this->app->catalog()->all() as $item) {
            if ($item['kind'] !== 'plus') continue;
            $item['imageUrl'] = Catalog::imageUrl($item['image'], $site);
            $plans[] = $item;
        }
        return Response::json(['plans' => $plans, 'minCents' => Catalog::MIN_CENTS, 'maxCents' => Catalog::MAX_CENTS]);
    }

    private function adminSavePlan(Request $req): Response
    {
        $admin = $this->admin($req);
        $body = $req->json();
        $change = array_intersect_key($body, array_flip(['cents', 'enabled', 'best', 'image']));
        $this->app->catalog()->savePlan($this->app->db(), (string) ($body['id'] ?? ''), $change, $admin->uid);
        return $this->adminPlans($req);
    }

    private function checkout(Request $req): Response
    {
        $user = $this->user($req);
        $product = (string) ($req->json()['product'] ?? '');
        return Response::json($this->app->payments()->checkout($user, $product, $this->origin($req), $this->displayName($user)));
    }

    /** The player's PlayMona display name, for their invoices. */
    private function displayName(AuthUser $user): ?string
    {
        if ($user->name) return $user->name;
        try {
            $name = $this->app->rtdb()->get('userIndex/' . $user->uid . '/displayName');
            return is_string($name) && trim($name) !== '' ? $name : null;
        } catch (\Throwable $e) {
            return null;
        }
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
        [$order, $asAdmin] = $this->viewableOrder($req, $id);
        $view = $asAdmin ? Finance::adminOrder($order) : Payments::publicOrder($order);
        if ($asAdmin && $order['status'] === 'failed') $view['problem'] = $this->app->payments()->problem($order['id']);
        return Response::json([
            'order' => $view,
            'invoice' => $order['status'] === 'paid' ? $this->invoiceData($order) : null,
        ]);
    }

    private function invoicePdf(Request $req, string $id): Response
    {
        [$order] = $this->viewableOrder($req, $id);
        if ($order['status'] !== 'paid') throw new HttpError(404, 'This order has no invoice yet.', 'no-invoice');
        $data = $this->invoiceData($order);
        return Response::file(Invoice::pdf($data, Invoice::logoJpeg()), 'application/pdf', Invoice::filename($data));
    }

    /** The player's own order, or any order for an admin. Returns [order, seen as admin]. */
    private function viewableOrder(Request $req, string $id): array
    {
        $user = $this->user($req);
        $order = $this->app->payments()->order($id);
        if ($order && $order['uid'] === $user->uid) return [$order, false];
        if ($order && $this->app->rtdb()->get('admins/' . $user->uid) === true) return [$order, true];
        throw new HttpError(404, 'Order not found.', 'no-order');
    }

    private function invoiceData(array $order): array
    {
        return Invoice::data(
            $order,
            $this->app->catalog()->find($order['product']),
            (array) $this->app->config->get('business', []),
            (string) $this->app->config->get('timezone', 'Africa/Harare')
        );
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

    /** A player's own profile picture: the body is the picture itself. The app then saves the returned avatar. */
    private function uploadAvatar(Request $req): Response
    {
        $user = $this->user($req);
        if ($user->isAnonymous()) throw new HttpError(403, 'Create a free account to add a photo.', 'anonymous');
        if ($this->app->rtdb()->get('bans/' . $user->uid) !== null) throw new HttpError(403, 'This account is suspended.', 'banned');
        $avatar = $this->app->photos()->save($user->uid, $req->rawBody);
        return Response::json(['avatar' => $avatar, 'url' => Photos::url(substr($avatar, 6))]);
    }

    /** The player went back to a character: their picture file goes. */
    private function removeAvatar(Request $req): Response
    {
        $user = $this->user($req);
        return Response::json(['removed' => $this->app->photos()->remove($user->uid)]);
    }

    /** Admins take down a player's picture; the player gets a character instead. */
    private function adminRemoveAvatar(Request $req): Response
    {
        $this->admin($req);
        $uid = (string) ($req->json()['uid'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $uid)) throw new HttpError(400, 'Choose a player.', 'bad-uid');
        $removed = $this->app->photos()->remove($uid);
        $character = Photos::fallbackCharacter($uid);
        $rtdb = $this->app->rtdb();
        if (Photos::isValue($rtdb->get('users/' . $uid . '/profile/avatar'))) $rtdb->set('users/' . $uid . '/profile/avatar', $character);
        if (Photos::isValue($rtdb->get('userIndex/' . $uid . '/avatar'))) $rtdb->set('userIndex/' . $uid . '/avatar', $character);
        return Response::json(['removed' => $removed, 'avatar' => $character]);
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
        $admin = $this->admin($req);
        $uid = (string) ($req->query['uid'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $uid)) throw new HttpError(400, 'Choose a player.', 'bad-uid');
        return Response::json($this->accessReport($uid, $admin->uid));
    }

    /** A player's access, every grant (with whether this admin may remove it) and their orders. */
    private function accessReport(string $uid, string $adminUid): array
    {
        $orders = $this->app->db()->all('SELECT * FROM orders WHERE uid = ? ORDER BY created_at DESC LIMIT 20', [$uid]);
        $grants = array_map(fn ($g) => [
            'id' => $g['id'],
            'kind' => $g['kind'],
            'game' => $g['game'],
            'days' => $g['days'] !== null ? (int) $g['days'] : null,
            'source' => $g['source'],
            'orderId' => $g['order_id'],
            'adminUid' => $g['admin_uid'],
            'note' => $g['note'],
            'createdAt' => (int) $g['created_at'],
            'revokedAt' => $g['revoked_at'] !== null ? (int) $g['revoked_at'] : null,
            'canRevoke' => Store::canRevoke($g, $adminUid),
        ], $this->app->store()->history($uid));
        return [
            'uid' => $uid,
            'isSelf' => $uid === $adminUid,
            'access' => $this->app->store()->get($uid),
            'grants' => $grants,
            'orders' => array_map([Finance::class, 'adminOrder'], $orders),
        ];
    }

    private function adminRevoke(Request $req): Response
    {
        $admin = $this->admin($req);
        $id = (string) ($req->json()['grantId'] ?? '');
        if (!preg_match('/^g_[a-f0-9]{24}$/', $id)) throw new HttpError(400, 'Choose what to remove.', 'bad-grant');
        $uid = $this->app->store()->revoke($id, $admin->uid);
        $this->app->store()->sync($uid);
        return Response::json($this->accessReport($uid, $admin->uid));
    }

    /** Testing payments: an admin removes all premium from their own account, paid or not. */
    private function adminResetOwn(Request $req): Response
    {
        $admin = $this->admin($req);
        $this->app->store()->resetOwn($admin->uid);
        $this->app->store()->sync($admin->uid);
        return Response::json($this->accessReport($admin->uid, $admin->uid));
    }

    private function financeSummary(Request $req): Response
    {
        $this->admin($req);
        $mode = ($req->query['mode'] ?? 'live') === 'live' ? 'live' : 'sandbox';
        $summary = $this->app->finance()->summary($mode);
        $summary['gatewayMode'] = null;
        $summary['balance'] = null;
        try {
            $gateway = $this->app->gateway();
            $summary['gatewayMode'] = $gateway->mode();
            // The Linkwa balance belongs to whichever server the key is for (sandbox or live).
            if ($gateway->mode() === $mode) $summary['balance'] = $gateway->balance();
        } catch (\Throwable $e) {
            $summary['balanceError'] = 'Linkwa did not answer.';
        }
        $names = [];
        foreach ($this->app->catalog()->all() as $id => $item) $names[$id] = $item['name'];
        $summary['productNames'] = $names;
        return Response::json($summary);
    }

    private function financeOrders(Request $req): Response
    {
        $this->admin($req);
        return Response::json($this->app->finance()->orders($req->query));
    }
}
