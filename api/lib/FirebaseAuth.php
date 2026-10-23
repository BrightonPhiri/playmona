<?php
declare(strict_types=1);

namespace PlayMona;

/** A signed-in player, taken from a checked Firebase ID token. */
class AuthUser
{
    public function __construct(
        public readonly string $uid,
        public readonly string $provider,
        public readonly ?string $email,
        public readonly ?string $name
    ) {}

    public function isAnonymous(): bool { return $this->provider === 'anonymous'; }
}

/**
 * Checks Firebase ID tokens the way Firebase's own Admin SDK does:
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
class FirebaseAuth
{
    public const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
    private const SKEW = 300; // seconds of clock difference allowed

    /** @var callable(): array<string,string> */
    private $certs;

    public function __construct(private string $projectId, ?callable $certs = null, private ?\Closure $now = null)
    {
        $this->certs = $certs ?? fn () => self::fetchCerts();
    }

    public function verify(string $token): AuthUser
    {
        $payload = Jwt::verifyRs256($token, ($this->certs)());
        $now = $this->now ? ($this->now)() : time();
        $sub = $payload['sub'] ?? null;
        $ok = ($payload['aud'] ?? null) === $this->projectId
            && ($payload['iss'] ?? null) === 'https://securetoken.google.com/' . $this->projectId
            && is_string($sub) && $sub !== '' && strlen($sub) <= 128
            && is_numeric($payload['exp'] ?? null) && $payload['exp'] > $now - self::SKEW
            && is_numeric($payload['iat'] ?? null) && $payload['iat'] <= $now + self::SKEW
            && is_numeric($payload['auth_time'] ?? null) && $payload['auth_time'] <= $now + self::SKEW;
        if (!$ok) throw new HttpError(401, 'Please sign in again.', 'bad-token');
        return new AuthUser(
            $sub,
            (string) ($payload['firebase']['sign_in_provider'] ?? ''),
            isset($payload['email']) ? (string) $payload['email'] : null,
            isset($payload['name']) ? (string) $payload['name'] : null
        );
    }

    /** Google's signing certificates, cached on disk for as long as Google says (max-age). */
    public static function fetchCerts(): array
    {
        $cache = sys_get_temp_dir() . '/playmona-firebase-certs.json';
        $cached = is_file($cache) ? json_decode((string) file_get_contents($cache), true) : null;
        if (is_array($cached) && ($cached['until'] ?? 0) > time() && is_array($cached['certs'] ?? null)) {
            return $cached['certs'];
        }
        $headers = [];
        $ch = curl_init(self::CERTS_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$headers) {
                $headers[] = $line;
                return strlen($line);
            },
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $certs = $raw !== false ? json_decode((string) $raw, true) : null;
        if ($status !== 200 || !is_array($certs) || !$certs) {
            if (is_array($cached['certs'] ?? null)) return $cached['certs']; // Google unreachable: use the last copy
            throw new \RuntimeException('Could not load Firebase signing certificates.');
        }
        $maxAge = 3600;
        foreach ($headers as $line) {
            if (preg_match('/^cache-control:.*max-age=(\d+)/i', $line, $m)) $maxAge = (int) $m[1];
        }
        @file_put_contents($cache, json_encode(['until' => time() + $maxAge, 'certs' => $certs]), LOCK_EX);
        return $certs;
    }
}
