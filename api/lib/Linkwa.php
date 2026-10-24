<?php
declare(strict_types=1);

namespace PlayMona;

/** What the payment code needs from Linkwa. The tests swap in a fake. */
interface PaymentGateway
{
    /** Returns ['checkout_url' => ..., 'link_id' => ..., 'short_url' => ...]. */
    public function createLink(array $order, string $name, string $returnUrl): array;

    /** Returns Linkwa's status reply: status, amount, currency_code, short_url, payment_reference. */
    public function status(string $shortUrl, string $reference): array;

    /** Recent incoming payments: list of ['id', 'link_id', 'amount', 'currency']. */
    public function recentPayments(int $perPage = 50): array;

    /** 'sandbox' while testing, 'live' for real money. */
    public function mode(): string;

    /** Money held at the gateway: list of ['currency', 'available', 'pending']. */
    public function balance(): array;
}

/**
 * Linkwa Developer API client. Docs: https://linkwa.co.zw/developer-apps/docs.md
 * The sandbox and live servers only differ by api_base and key.
 */
class Linkwa implements PaymentGateway
{
    public function __construct(
        private string $apiBase,
        private string $apiKey,
        private HttpClient $http = new HttpClient()
    ) {}

    public function createLink(array $order, string $name, string $returnUrl): array
    {
        $data = $this->call('POST', '/payment-links', [
            'amount' => round($order['amount_cents'] / 100, 2),
            'currency_code' => $order['currency'],
            'payment_link_name' => $name,
            'description' => 'PlayMona order ' . $order['id'],
            'return_url' => $returnUrl,
            'stock' => 1,
        ]);
        // The sandbox replies with "product"; older docs say "payment_link".
        $link = $data['product'] ?? $data['payment_link'] ?? null;
        if (!is_array($link) || empty($link['checkout_url'])) {
            throw new \RuntimeException('Linkwa did not return a checkout address.');
        }
        return [
            'checkout_url' => (string) $link['checkout_url'],
            'link_id' => isset($link['external_payment_link_id']) ? (string) $link['external_payment_link_id'] : null,
            'short_url' => self::shortUrlOf((string) $link['checkout_url']),
        ];
    }

    public function status(string $shortUrl, string $reference): array
    {
        return $this->call('GET', '/payment-links/' . rawurlencode($shortUrl) . '/payments/' . rawurlencode($reference) . '/status');
    }

    public function recentPayments(int $perPage = 50): array
    {
        $data = $this->call('GET', '/statement?currency_code=USD&per_page=' . $perPage);
        $out = [];
        foreach ($data['data'] ?? [] as $row) {
            if (($row['type'] ?? '') !== 'credit' || ($row['recipient']['type'] ?? '') !== 'payment_received') continue;
            $out[] = [
                'id' => (string) ($row['id'] ?? ''),
                'link_id' => (string) ($row['recipient']['external_payment_link_id'] ?? ''),
                'amount' => (float) ($row['amount'] ?? 0),
                'currency' => (string) ($row['currency'] ?? ''),
            ];
        }
        return $out;
    }

    public function mode(): string
    {
        return preg_match('/sandbox|staging/i', $this->apiBase) ? 'sandbox' : 'live';
    }

    public function balance(): array
    {
        $data = $this->call('GET', '/balance');
        $out = [];
        foreach ($data['balances'] ?? [] as $b) {
            $out[] = [
                'currency' => (string) ($b['currency'] ?? ''),
                'available' => (float) ($b['available_balance'] ?? 0),
                'pending' => (float) ($b['pending_balance'] ?? 0),
            ];
        }
        return $out;
    }

    /** The last part of a checkout address: https://linkwa.com/pay/b01jxYz -> b01jxYz */
    public static function shortUrlOf(string $checkoutUrl): ?string
    {
        $path = trim((string) parse_url($checkoutUrl, PHP_URL_PATH), '/');
        if ($path === '') return null;
        $parts = explode('/', $path);
        return end($parts) ?: null;
    }

    private function call(string $method, string $path, ?array $body = null): array
    {
        [$status, $data] = $this->http->request(
            $method,
            rtrim($this->apiBase, '/') . $path,
            [
                'Authorization: Bearer ' . $this->apiKey,
                'Accept: application/json',
                'Content-Type: application/json',
            ],
            $body === null ? null : json_encode($body),
            30
        );
        if ($status !== 200 || !is_array($data)) {
            $message = is_array($data) ? (string) ($data['message'] ?? '') : '';
            throw new \RuntimeException("Linkwa $method $path failed ($status) $message");
        }
        return $data;
    }
}
