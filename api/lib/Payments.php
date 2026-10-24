<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Orders and payments. A payment can be confirmed three ways: the player coming back
 * from Linkwa (return page), Linkwa's webhook, or the cron job reading the statement.
 * Any of them may happen, in any order, more than once. markPaid() makes sure the
 * player is credited exactly once.
 */
class Payments
{
    private const PAID = ['PAID', 'COMPLETED', 'SUCCESS', 'SUCCESSFUL'];
    private const FAILED = ['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'DECLINED'];
    private const MAX_ORDERS_PER_HOUR = 10;

    public function __construct(
        private Db $db,
        private Store $store,
        private Catalog $catalog,
        private PaymentGateway $gateway,
        private string $siteUrl
    ) {}

    /**
     * Starts a purchase: saves the order and asks Linkwa for a checkout address.
     * $origin is the address the player is on (already checked by Routes), so Linkwa
     * sends them back to the same one: sign-ins are kept per address (www or not).
     */
    public function checkout(AuthUser $user, string $productId, ?string $origin = null): array
    {
        if ($user->isAnonymous()) throw new HttpError(403, 'Create a free account to buy.', 'needs-account');
        $product = $this->catalog->find($productId);
        if (!$product) throw new HttpError(404, 'That item is not for sale.', 'no-product');

        $recent = $this->db->one('SELECT COUNT(*) AS n FROM orders WHERE uid = ? AND created_at > ?', [$user->uid, nowMs() - 3600000]);
        if ((int) $recent['n'] >= self::MAX_ORDERS_PER_HOUR) {
            throw new HttpError(429, 'Too many checkouts. Please try again in an hour.', 'rate-limit');
        }

        $order = [
            'id' => newId('o'),
            'uid' => $user->uid,
            'product' => $productId,
            'amount_cents' => (int) $product['cents'],
            'currency' => $product['currency'],
        ];
        $this->db->run(
            'INSERT INTO orders (id, uid, product, amount_cents, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$order['id'], $order['uid'], $order['product'], $order['amount_cents'], $order['currency'], 'pending', nowMs()]
        );

        $returnUrl = rtrim($origin ?? $this->siteUrl, '/') . '/api/checkout/return?order=' . $order['id'];
        try {
            $link = $this->gateway->createLink($order, $product['name'], $returnUrl);
        } catch (\Throwable $e) {
            $this->db->run("UPDATE orders SET status = 'failed', last_status = 'LINK_ERROR' WHERE id = ?", [$order['id']]);
            $this->log($order['id'], 'checkout', 'link-error', ['error' => $e->getMessage()]);
            throw new HttpError(502, 'Payments are not available right now. Please try again soon.', 'gateway');
        }
        $this->db->run(
            'UPDATE orders SET link_id = ?, short_url = ?, checkout_url = ? WHERE id = ?',
            [$link['link_id'], $link['short_url'], $link['checkout_url'], $order['id']]
        );
        return ['order' => $order['id'], 'checkoutUrl' => $link['checkout_url']];
    }

    /**
     * The player is back from Linkwa: ?order=…&short_url=…&payment_reference=….
     * Nothing in the address is trusted; Linkwa is asked for the real status.
     * Returns 'paid', 'pending' or 'failed' for the redirect back to the app.
     */
    public function confirmReturn(string $orderId, string $shortUrl, string $reference): string
    {
        $order = $this->order($orderId);
        if (!$order) return 'failed';
        if ($order['status'] === 'paid') return 'paid';
        if ($shortUrl === '' || $reference === '' || $order['short_url'] === null || !hash_equals((string) $order['short_url'], $shortUrl)) {
            $this->log($orderId, 'return', 'mismatch', ['short_url' => $shortUrl, 'reference' => $reference]);
            return 'pending';
        }
        try {
            $status = $this->gateway->status($shortUrl, $reference);
        } catch (\Throwable $e) {
            $this->log($orderId, 'return', 'status-error', ['error' => $e->getMessage()]);
            return 'pending'; // the webhook or cron job will finish it
        }
        $state = strtoupper((string) ($status['status'] ?? ''));
        $this->log($orderId, 'return', $state ?: 'unknown', $status);
        $this->db->run("UPDATE orders SET last_status = ? WHERE id = ? AND status <> 'paid'", [substr($state, 0, 32), $orderId]);

        if (in_array($state, self::PAID, true)) {
            if (!$this->amountMatches($order, $status['amount'] ?? null, $status['currency_code'] ?? null)) {
                $this->log($orderId, 'return', 'amount-mismatch', $status);
                return 'failed';
            }
            $this->markPaid($order, (string) ($status['payment_reference'] ?? $reference), 'return');
            return 'paid';
        }
        return in_array($state, self::FAILED, true) ? 'failed' : 'pending';
    }

    /**
     * Linkwa's payment.completed webhook. Returns the HTTP status to answer with:
     * 401 for a bad signature (Linkwa retries), 200 otherwise (so Linkwa stops retrying).
     */
    public function webhook(string $rawBody, ?string $signature, string $secret): int
    {
        $expected = hash_hmac('sha256', $rawBody, $secret);
        if ($secret === '' || !$signature || !hash_equals($expected, trim($signature))) {
            $this->log(null, 'webhook', 'bad-signature', null);
            return 401;
        }
        $event = json_decode($rawBody, true);
        if (!is_array($event)) return 400;

        $linkId = (string) ($event['external_payment_link_id'] ?? '');
        $order = $linkId !== '' ? $this->db->one('SELECT * FROM orders WHERE link_id = ?', [$linkId]) : null;
        $state = strtoupper((string) ($event['status'] ?? ''));
        $this->log($order['id'] ?? null, 'webhook', $order ? ($state ?: 'unknown') : 'unknown-order', $event);
        if (!$order || !in_array($state, self::PAID, true)) return 200;

        if (!$this->amountMatches($order, $event['amount'] ?? null, $event['currency'] ?? null)) {
            $this->log($order['id'], 'webhook', 'amount-mismatch', $event);
            return 200;
        }
        $reference = (string) ($event['reference'] ?? $event['receipt_id'] ?? ('wh:' . $linkId));
        $this->markPaid($order, $reference, 'webhook');
        return 200;
    }

    /**
     * Cron fallback when there is no webhook and the player never came back:
     * matches Linkwa's recent incoming payments to orders still pending.
     */
    public function reconcile(): int
    {
        $pending = $this->db->all(
            "SELECT * FROM orders WHERE status = 'pending' AND link_id IS NOT NULL AND created_at > ?",
            [nowMs() - 3 * 86400000]
        );
        if (!$pending) return 0;
        $byLink = [];
        foreach ($pending as $order) $byLink[$order['link_id']] = $order;

        $credited = 0;
        foreach ($this->gateway->recentPayments(100) as $payment) {
            $order = $byLink[$payment['link_id']] ?? null;
            if (!$order || !$this->amountMatches($order, $payment['amount'], $payment['currency'])) continue;
            $this->log($order['id'], 'statement', 'PAID', $payment);
            if ($this->markPaid($order, 'stmt:' . $payment['id'], 'statement')) $credited++;
        }
        return $credited;
    }

    /** Marks the order paid and grants what was bought, once. Returns true if this call did it. */
    public function markPaid(array $order, string $reference, string $via): bool
    {
        $product = $this->catalog->find($order['product']);
        $done = $this->db->transaction(function (Db $db) use ($order, $reference, $via, $product) {
            // Only one caller can flip pending -> paid; everyone else changes 0 rows.
            $changed = $db->run(
                "UPDATE orders SET status = 'paid', paid_at = ?, payment_reference = ?, paid_via = ?, last_status = 'PAID' WHERE id = ? AND status <> 'paid'",
                [nowMs(), substr($reference, 0, 80), $via, $order['id']]
            );
            if ($changed !== 1) return false;
            if (!$product) throw new \RuntimeException('Paid order ' . $order['id'] . ' has an unknown product.');
            $grant = $product['kind'] === 'plus'
                ? ['kind' => 'plus', 'days' => $product['days']]
                : ['kind' => 'game', 'game' => $product['game']];
            $this->store->grant($order['uid'], $grant, 'purchase', $order['id']);
            return true;
        });
        if ($done) $this->store->sync($order['uid']);
        return $done;
    }

    public function order(string $id): ?array
    {
        if (!preg_match('/^o_[a-f0-9]{24}$/', $id)) return null;
        return $this->db->one('SELECT * FROM orders WHERE id = ?', [$id]);
    }

    /** What the app may see about one of its own orders. */
    public static function publicOrder(array $order): array
    {
        return [
            'id' => $order['id'],
            'product' => $order['product'],
            'amount' => $order['amount_cents'] / 100,
            'currency' => $order['currency'],
            'status' => $order['status'],
            'createdAt' => (int) $order['created_at'],
            'paidAt' => $order['paid_at'] !== null ? (int) $order['paid_at'] : null,
        ];
    }

    private function amountMatches(array $order, mixed $amount, mixed $currency): bool
    {
        return is_numeric($amount)
            && abs((float) $amount * 100 - (int) $order['amount_cents']) < 0.5
            && strtoupper((string) $currency) === strtoupper((string) $order['currency']);
    }

    private function log(?string $orderId, string $source, string $outcome, mixed $payload): void
    {
        try {
            $this->db->run(
                'INSERT INTO payment_events (id, order_id, source, outcome, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [newId('e'), $orderId, $source, substr($outcome, 0, 32), $payload === null ? null : substr((string) json_encode($payload), 0, 8000), nowMs()]
            );
        } catch (\Throwable $e) {
            error_log('PlayMona: could not log payment event: ' . $e->getMessage());
        }
    }
}
