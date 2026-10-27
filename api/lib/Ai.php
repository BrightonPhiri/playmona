<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * AI providers that admins add in the portal (DeepSeek, OpenAI, any OpenAI-compatible service,
 * and voice, image or other services for later). Keys are encrypted with libsodium using
 * ai.secret_key from the server config, are never sent back to a browser and never logged.
 *
 * Nothing in a game depends on this. Every caller has a deterministic fallback, so PlayMona
 * works the same with AI switched off, out of credit, slow or returning nonsense.
 */
class Ai
{
    public const KINDS = ['text', 'voice', 'image', 'other'];

    /** Presets. 'chat' vendors speak the OpenAI-style POST {base}/chat/completions. */
    public const VENDORS = [
        'deepseek' => ['name' => 'DeepSeek', 'baseUrl' => 'https://api.deepseek.com', 'model' => 'deepseek-flash', 'api' => 'chat'],
        'openai' => ['name' => 'OpenAI', 'baseUrl' => 'https://api.openai.com/v1', 'model' => '', 'api' => 'chat'],
        'openai_compatible' => ['name' => 'OpenAI-compatible', 'baseUrl' => '', 'model' => '', 'api' => 'chat'],
        'other' => ['name' => 'Other service', 'baseUrl' => '', 'model' => '', 'api' => 'none'],
    ];

    public function __construct(private Db $db, private Config $config, private HttpClient $http = new HttpClient()) {}

    /* ---------- providers ---------- */

    public function canEncrypt(): bool
    {
        return function_exists('sodium_crypto_secretbox') && $this->key() !== null;
    }

    public function providers(): array
    {
        $day = gmdate('Y-m-d');
        return array_map(function ($r) use ($day) {
            $use = $this->db->one('SELECT requests, tokens, failures FROM ai_usage WHERE provider_id = ? AND day = ?', [$r['id'], $day]);
            return [
                'id' => $r['id'], 'kind' => $r['kind'], 'vendor' => $r['vendor'], 'name' => $r['name'],
                'baseUrl' => $r['base_url'], 'model' => $r['model'], 'hasKey' => $r['api_key_enc'] !== null && $r['api_key_enc'] !== '',
                'enabled' => (bool) (int) $r['enabled'], 'dailyLimit' => (int) $r['daily_limit'], 'timeoutMs' => (int) $r['timeout_ms'],
                'today' => ['requests' => (int) ($use['requests'] ?? 0), 'tokens' => (int) ($use['tokens'] ?? 0), 'failures' => (int) ($use['failures'] ?? 0)],
                'updatedAt' => (int) $r['updated_at'],
            ];
        }, $this->db->all('SELECT * FROM ai_providers ORDER BY created_at, id'));
    }

    /** Adds or changes a provider. An empty or missing key keeps the one already saved. */
    public function saveProvider(array $b, int $now): string
    {
        $id = (string) ($b['id'] ?? '');
        $old = $id !== '' ? $this->db->one('SELECT * FROM ai_providers WHERE id = ?', [$id]) : null;
        if ($id !== '' && !$old) throw new HttpError(404, 'That provider does not exist.', 'no-provider');
        $vendor = (string) ($b['vendor'] ?? ($old['vendor'] ?? ''));
        if (!isset(self::VENDORS[$vendor])) throw new HttpError(400, 'Choose a provider type.', 'bad-vendor');
        $preset = self::VENDORS[$vendor];
        $kind = (string) ($b['kind'] ?? ($old['kind'] ?? 'text'));
        if (!in_array($kind, self::KINDS, true)) throw new HttpError(400, 'Choose what it is for.', 'bad-kind');
        $name = trim((string) ($b['name'] ?? ($old['name'] ?? $preset['name'])));
        if ($name === '' || mb_strlen($name) > 60) throw new HttpError(400, 'Give it a name (up to 60 characters).', 'bad-name');
        $base = rtrim(trim((string) ($b['baseUrl'] ?? ($old['base_url'] ?? $preset['baseUrl']))), '/');
        if (!preg_match('#^https://[A-Za-z0-9.-]+(:\d+)?(/[A-Za-z0-9._~/-]*)?$#', $base)) throw new HttpError(400, 'The address must start with https://', 'bad-url');
        $model = trim((string) ($b['model'] ?? ($old['model'] ?? $preset['model'])));
        if (mb_strlen($model) > 80 || ($model !== '' && !preg_match('/^[A-Za-z0-9._:\/-]+$/', $model))) throw new HttpError(400, 'Check the model name.', 'bad-model');
        if ($preset['api'] === 'chat' && $kind === 'text' && $model === '') throw new HttpError(400, 'Enter the model name from the provider\'s documentation.', 'bad-model');
        $limit = (int) ($b['dailyLimit'] ?? ($old['daily_limit'] ?? 200));
        $timeout = (int) ($b['timeoutMs'] ?? ($old['timeout_ms'] ?? 8000));
        if ($limit < 0 || $limit > 100000) throw new HttpError(400, 'Daily limit: 0 to 100000.', 'bad-limit');
        if ($timeout < 1000 || $timeout > 30000) throw new HttpError(400, 'Timeout: 1 to 30 seconds.', 'bad-timeout');
        $enabled = array_key_exists('enabled', $b) ? (bool) $b['enabled'] : (bool) (int) ($old['enabled'] ?? 1);

        $enc = $old['api_key_enc'] ?? null;
        $key = isset($b['apiKey']) ? trim((string) $b['apiKey']) : '';
        if ($key !== '') {
            if (strlen($key) > 500) throw new HttpError(400, 'That key is too long.', 'bad-key');
            $enc = $this->encrypt($key);
        }
        if (!empty($b['clearKey'])) $enc = null;

        if ($old) {
            $this->db->run(
                'UPDATE ai_providers SET kind = ?, vendor = ?, name = ?, base_url = ?, model = ?, api_key_enc = ?, enabled = ?, daily_limit = ?, timeout_ms = ?, updated_at = ? WHERE id = ?',
                [$kind, $vendor, $name, $base, $model, $enc, $enabled ? 1 : 0, $limit, $timeout, $now, $id]
            );
            return $id;
        }
        $id = newId('ai');
        $this->db->run(
            'INSERT INTO ai_providers (id, kind, vendor, name, base_url, model, api_key_enc, enabled, daily_limit, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $kind, $vendor, $name, $base, $model, $enc, $enabled ? 1 : 0, $limit, $timeout, $now, $now]
        );
        return $id;
    }

    public function deleteProvider(string $id): void
    {
        $this->db->run('DELETE FROM ai_providers WHERE id = ?', [$id]);
    }

    /** Checks a provider answers. Never returns the key, only whether it worked and how fast. */
    public function test(string $id): array
    {
        $row = $this->db->one('SELECT * FROM ai_providers WHERE id = ?', [$id]);
        if (!$row) throw new HttpError(404, 'That provider does not exist.', 'no-provider');
        $start = microtime(true);
        try {
            if ((self::VENDORS[$row['vendor']]['api'] ?? 'none') === 'chat' && $row['model'] !== '') {
                $out = $this->call($row, [['role' => 'user', 'content' => 'Reply with this json only: {"ok": true}']], 30);
                $ok = is_array($out) && ($out['ok'] ?? null) === true;
                return ['ok' => $ok, 'ms' => (int) ((microtime(true) - $start) * 1000), 'message' => $ok ? 'It answered.' : 'It answered, but not as expected.'];
            }
            [$status] = $this->http->request('GET', $row['base_url'], $this->authHeaders($row), null, (int) ceil($row['timeout_ms'] / 1000));
            return ['ok' => $status > 0 && $status < 500, 'ms' => (int) ((microtime(true) - $start) * 1000), 'message' => "It replied with status $status."];
        } catch (\Throwable $e) {
            return ['ok' => false, 'ms' => (int) ((microtime(true) - $start) * 1000), 'message' => $this->safeError($e, $row)];
        }
    }

    /* ---------- using it ---------- */

    /**
     * Asks the first working text provider for JSON. $check(array $json): ?array cleans the answer
     * and returns null if it breaks the rules. Returns null when AI is off, over its limit, slow,
     * failing or wrong: the caller then uses its own fallback.
     */
    public function complete(string $task, array $messages, callable $check, int $maxTokens = 600, bool $cache = true): ?array
    {
        $rows = $this->db->all("SELECT * FROM ai_providers WHERE kind = 'text' AND enabled = 1 AND model <> '' ORDER BY created_at, id");
        foreach ($rows as $row) {
            if ((self::VENDORS[$row['vendor']]['api'] ?? 'none') !== 'chat' || !$row['api_key_enc']) continue;
            $hash = hash('sha256', $task . "\n" . $row['id'] . "\n" . $row['model'] . "\n" . json_encode($messages));
            $cached = $cache ? $this->db->one('SELECT output FROM ai_cache WHERE hash = ?', [$hash]) : null;
            if ($cached) {
                $clean = $check(json_decode((string) $cached['output'], true) ?: []);
                if ($clean !== null) return $clean;
            }
            if (!$this->underLimit($row)) continue;
            try {
                $out = $this->call($row, $messages, $maxTokens);
                $clean = is_array($out) ? $check($out) : null;
                if ($clean === null) { $this->count($row['id'], 0, true, false); continue; }
                if ($cache) {
                    try {
                        $this->db->run('INSERT INTO ai_cache (hash, output, created_at) VALUES (?, ?, ?)', [$hash, json_encode($clean), nowMs()]);
                    } catch (\PDOException $e) { /* cached by a parallel request */ }
                }
                return $clean;
            } catch (\Throwable $e) {
                $this->count($row['id'], 0, true, true);
                error_log('PlayMona AI (' . $task . '): ' . $this->safeError($e, $row));
            }
        }
        return null;
    }

    /**
     * A new crew player for the admin form, not saved yet. The built-in generator (Crew::draft)
     * always works; AI, when a provider is set up, adds a fresher name, bio and personality.
     */
    public function draftPlayer(array $hint, Crew $crew): array
    {
        $kind = isset(Crew::ARCHETYPES[$hint['archetype'] ?? '']) ? $hint['archetype'] : null;
        $draft = Crew::draft($kind);
        $vibe = mb_substr(trim((string) ($hint['idea'] ?? '')), 0, 200);
        $prompt = 'Invent one friendly casual-game player profile for a family-friendly game site in Zimbabwe and beyond. '
            . 'Their style: ' . $draft['archetype'] . '. ' . ($vibe !== '' ? 'Idea from the admin: ' . $vibe . '. ' : '')
            . 'Return json only, shaped like {"displayName":"Tariro M","username":"tariro_m","bio":"one short line in first person",'
            . '"personality":{' . implode(',', array_map(fn ($t) => "\"$t\":50", Crew::TRAITS)) . '}}. Traits are whole numbers 0-100.';
        $ai = $this->complete('draftPlayer', [['role' => 'user', 'content' => $prompt]], function (array $j) {
            $name = trim((string) ($j['displayName'] ?? ''));
            $user = strtolower(trim((string) ($j['username'] ?? '')));
            if ($name === '' || mb_strlen($name) > 40 || !preg_match('/^[a-z0-9_.]{3,20}$/', $user)) return null;
            $traits = [];
            foreach (Crew::TRAITS as $t) {
                $v = $j['personality'][$t] ?? null;
                if (!is_numeric($v)) return null;
                $traits[$t] = max(0, min(100, (int) $v));
            }
            return ['displayName' => $name, 'username' => $user, 'bio' => mb_substr(trim((string) ($j['bio'] ?? '')), 0, 300), 'personality' => $traits];
        }, 600, false);
        if ($ai) $draft = array_merge($draft, $ai);
        $draft['source'] = $ai ? 'ai' : 'built-in';
        // A username already in use gets a number on the end.
        $base = $draft['username'];
        for ($i = 2; $i < 50 && $this->db->one('SELECT id FROM crew_players WHERE username = ?', [$draft['username']]); $i++) {
            $draft['username'] = substr($base, 0, 17) . $i;
        }
        return $draft;
    }

    /* ---------- internals ---------- */

    private function call(array $row, array $messages, int $maxTokens): ?array
    {
        $body = json_encode([
            'model' => $row['model'], 'messages' => $messages, 'response_format' => ['type' => 'json_object'],
            'max_tokens' => $maxTokens, 'temperature' => 0.9,
        ]);
        [$status, $data] = $this->http->request('POST', rtrim($row['base_url'], '/') . '/chat/completions', $this->authHeaders($row), $body, (int) ceil($row['timeout_ms'] / 1000));
        if ($status !== 200 || !is_array($data)) throw new \RuntimeException("status $status");
        $this->count($row['id'], (int) ($data['usage']['total_tokens'] ?? 0), false, true);
        $content = $data['choices'][0]['message']['content'] ?? null;
        if (!is_string($content) || trim($content) === '') return null;
        $json = json_decode($content, true);
        return is_array($json) ? $json : null;
    }

    private function authHeaders(array $row): array
    {
        $headers = ['Content-Type: application/json'];
        $key = $row['api_key_enc'] ? $this->decrypt((string) $row['api_key_enc']) : null;
        if ($key) $headers[] = 'Authorization: Bearer ' . $key;
        return $headers;
    }

    private function underLimit(array $row): bool
    {
        $use = $this->db->one('SELECT requests FROM ai_usage WHERE provider_id = ? AND day = ?', [$row['id'], gmdate('Y-m-d')]);
        return (int) ($use['requests'] ?? 0) < (int) $row['daily_limit'];
    }

    /** Today's usage. Every request sent counts toward the daily limit, failed or not. */
    private function count(string $id, int $tokens, bool $failed, bool $sent): void
    {
        $day = gmdate('Y-m-d');
        $f = $failed ? 1 : 0;
        $r = $sent ? 1 : 0;
        if ($this->db->run('UPDATE ai_usage SET requests = requests + ?, tokens = tokens + ?, failures = failures + ? WHERE provider_id = ? AND day = ?', [$r, $tokens, $f, $id, $day])) return;
        try {
            $this->db->run('INSERT INTO ai_usage (provider_id, day, requests, tokens, failures) VALUES (?, ?, ?, ?, ?)', [$id, $day, $r, $tokens, $f]);
        } catch (\PDOException $e) {
            $this->db->run('UPDATE ai_usage SET requests = requests + ?, tokens = tokens + ?, failures = failures + ? WHERE provider_id = ? AND day = ?', [$r, $tokens, $f, $id, $day]);
        }
    }

    /** An error message safe to show admins and logs: the key never appears in it. */
    private function safeError(\Throwable $e, array $row): string
    {
        $msg = $e->getMessage();
        $key = $row['api_key_enc'] ? $this->decrypt((string) $row['api_key_enc']) : null;
        if ($key) $msg = str_replace($key, '***', $msg);
        return mb_substr($msg, 0, 200);
    }

    private function key(): ?string
    {
        $raw = base64_decode((string) $this->config->get('ai.secret_key', ''), true);
        return is_string($raw) && strlen($raw) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES ? $raw : null;
    }

    private function encrypt(string $plain): string
    {
        $key = $this->key();
        if ($key === null) throw new HttpError(503, 'Add ai.secret_key to the server config before saving keys.', 'no-secret');
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return 'v1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $key));
    }

    private function decrypt(string $stored): ?string
    {
        $key = $this->key();
        if ($key === null || !str_starts_with($stored, 'v1:')) return null;
        $raw = base64_decode(substr($stored, 3), true);
        if (!is_string($raw) || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) return null;
        $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $key);
        return $plain === false ? null : $plain;
    }
}
