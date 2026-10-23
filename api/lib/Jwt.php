<?php
declare(strict_types=1);

namespace PlayMona;

/** The two JWT jobs the API needs: check a Firebase sign-in token, and sign a Google service-account request. */
class Jwt
{
    public static function b64urlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function b64urlDecode(string $data): string|false
    {
        if (!preg_match('/^[A-Za-z0-9_-]*$/', $data)) return false;
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4), true);
    }

    /** Signs a payload with RS256 (for the Google OAuth token request). */
    public static function signRs256(array $payload, string $privateKeyPem, ?string $kid = null): string
    {
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        if ($kid) $header['kid'] = $kid;
        $input = self::b64urlEncode(json_encode($header)) . '.' . self::b64urlEncode(json_encode($payload));
        $key = openssl_pkey_get_private($privateKeyPem);
        if ($key === false || !openssl_sign($input, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('Could not sign with the service account key.');
        }
        return $input . '.' . self::b64urlEncode($signature);
    }

    /**
     * Splits a token and checks its RS256 signature against one of $certs (kid => PEM certificate).
     * Returns the payload. Throws HttpError(401) for anything wrong.
     */
    public static function verifyRs256(string $token, array $certs): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) throw self::invalid();
        [$h, $p, $s] = $parts;
        $header = json_decode((string) self::b64urlDecode($h), true);
        $payload = json_decode((string) self::b64urlDecode($p), true);
        $signature = self::b64urlDecode($s);
        if (!is_array($header) || !is_array($payload) || $signature === false) throw self::invalid();
        // Only RS256 is accepted, so a token cannot pick a weaker algorithm (or "none").
        if (($header['alg'] ?? '') !== 'RS256' || !is_string($header['kid'] ?? null)) throw self::invalid();
        $cert = $certs[$header['kid']] ?? null;
        if (!is_string($cert)) throw self::invalid();
        $key = openssl_pkey_get_public($cert);
        if ($key === false || openssl_verify($h . '.' . $p, $signature, $key, OPENSSL_ALGO_SHA256) !== 1) {
            throw self::invalid();
        }
        return $payload;
    }

    private static function invalid(): HttpError
    {
        return new HttpError(401, 'Please sign in again.', 'bad-token');
    }
}
