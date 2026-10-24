<?php
declare(strict_types=1);

namespace PlayMona;

/** What the API reads and writes in Firebase. The tests swap in an in-memory version. */
interface RealtimeDb
{
    public function get(string $path): mixed;
    public function set(string $path, mixed $value): void;
    /** A filtered read: orderBy (a child), startAt, endAt, limitToFirst, shallow. */
    public function query(string $path, array $params): mixed;
}

/**
 * Firebase Realtime Database over REST, signed in as the service account.
 * The service account skips the security rules, so this is how the server writes
 * paths players cannot (such as /entitlements).
 */
class FirebaseDb implements RealtimeDb
{
    private const SCOPES = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

    private ?array $account = null;

    public function __construct(
        private string $databaseUrl,
        private string $serviceAccountPath,
        private HttpClient $http = new HttpClient()
    ) {}

    public function get(string $path): mixed
    {
        [$status, , $raw] = $this->http->request('GET', $this->url($path), $this->headers());
        if ($status !== 200) throw new \RuntimeException("Firebase read failed ($status).");
        return json_decode($raw, true);
    }

    public function set(string $path, mixed $value): void
    {
        [$status] = $this->http->request('PUT', $this->url($path), $this->headers(), json_encode($value));
        if ($status !== 200) throw new \RuntimeException("Firebase write failed ($status).");
    }

    public function query(string $path, array $params): mixed
    {
        $q = [];
        foreach (['orderBy', 'startAt', 'endAt'] as $k) if (array_key_exists($k, $params)) $q[$k] = json_encode($params[$k]);
        if (isset($params['limitToFirst'])) $q['limitToFirst'] = (int) $params['limitToFirst'];
        if (!empty($params['shallow'])) $q['shallow'] = 'true';
        [$status, , $raw] = $this->http->request('GET', $this->url($path) . '?' . http_build_query($q), $this->headers());
        if ($status !== 200) throw new \RuntimeException("Firebase query failed ($status).");
        return json_decode($raw, true);
    }

    private function url(string $path): string
    {
        if (!preg_match('#^[A-Za-z0-9_/-]+$#', $path)) throw new \InvalidArgumentException('Bad database path.');
        return rtrim($this->databaseUrl, '/') . '/' . trim($path, '/') . '.json';
    }

    private function headers(): array
    {
        return ['Authorization: Bearer ' . $this->accessToken(), 'Content-Type: application/json'];
    }

    /** A Google access token for the service account, cached until a minute before it expires. */
    private function accessToken(): string
    {
        $account = $this->account();
        $cache = sys_get_temp_dir() . '/playmona-google-token-' . substr(hash('sha256', $account['client_email']), 0, 12) . '.json';
        $cached = is_file($cache) ? json_decode((string) file_get_contents($cache), true) : null;
        if (is_array($cached) && ($cached['until'] ?? 0) > time() + 60) return (string) $cached['token'];

        $now = time();
        $assertion = Jwt::signRs256([
            'iss' => $account['client_email'],
            'scope' => self::SCOPES,
            'aud' => $account['token_uri'] ?? 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ], $account['private_key'], $account['private_key_id'] ?? null);

        [$status, $data] = $this->http->request(
            'POST',
            $account['token_uri'] ?? 'https://oauth2.googleapis.com/token',
            ['Content-Type: application/x-www-form-urlencoded'],
            http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $assertion])
        );
        if ($status !== 200 || !is_string($data['access_token'] ?? null)) {
            throw new \RuntimeException('Google sign-in for the service account failed (' . $status . ').');
        }
        $until = $now + (int) ($data['expires_in'] ?? 3600);
        @file_put_contents($cache, json_encode(['until' => $until, 'token' => $data['access_token']]), LOCK_EX);
        @chmod($cache, 0600);
        return $data['access_token'];
    }

    private function account(): array
    {
        if ($this->account === null) {
            $data = is_file($this->serviceAccountPath) ? json_decode((string) file_get_contents($this->serviceAccountPath), true) : null;
            if (!is_array($data) || empty($data['client_email']) || empty($data['private_key'])) {
                throw new \RuntimeException('The Firebase service account file is missing or invalid.');
            }
            $this->account = $data;
        }
        return $this->account;
    }
}
