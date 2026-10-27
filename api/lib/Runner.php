<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * The crew runner (api/crew/runner.js) is one Node process that plays every crew seat. It is not
 * kept running: Quick Match starts it when it reserves crew, and it exits by itself once it has
 * had no matches for a few minutes. It reports in every few seconds (beat), which is how we know
 * it is alive and which matches still need their players.
 */
class Runner
{
    private const ROW = 'crew_runner';
    public const ALIVE_MS = 20_000;     // no beat for this long: treat it as stopped
    private const SPAWN_GAP_MS = 15_000; // don't start a second copy while one is starting

    /** @param callable|null $spawn  fn(array $runnerConfig): bool  (tests pass their own) */
    public function __construct(private Db $db, private Config $config, private $spawn = null) {}

    public function state(): array
    {
        try {
            $row = $this->db->one('SELECT value FROM settings WHERE name = ?', [self::ROW]);
        } catch (\Throwable $e) {
            return [];
        }
        $v = $row ? json_decode((string) $row['value'], true) : null;
        return is_array($v) ? $v : [];
    }

    public function alive(int $now): bool
    {
        return self::fresh($this->state()['beatAt'] ?? null, $now, self::ALIVE_MS);
    }

    /** The runner checked in. */
    public function beat(int $pid, array $matchIds, int $now): void
    {
        $this->write(function (array $s) use ($pid, $matchIds, $now) {
            if (($s['pid'] ?? null) !== $pid) $s['startedAt'] = $now;
            return array_merge($s, ['pid' => $pid, 'beatAt' => $now, 'matches' => count($matchIds)]);
        });
    }

    /** The runner is stopping (no matches left). */
    public function stopped(int $pid): void
    {
        $this->write(fn (array $s) => ($s['pid'] ?? null) === $pid ? array_merge($s, ['beatAt' => 0, 'stoppedAt' => nowMs()]) : $s);
    }

    /** Starts the runner unless it is running or already starting. Returns true if it started one. */
    public function ensure(int $now): bool
    {
        $start = false;
        $this->write(function (array $s) use ($now, &$start) {
            if (self::fresh($s['beatAt'] ?? null, $now, self::ALIVE_MS)) return $s;
            if (self::fresh($s['spawnAt'] ?? null, $now, self::SPAWN_GAP_MS)) return $s;
            $start = true;
            return array_merge($s, ['spawnAt' => $now]);
        });
        if (!$start) return false;
        try {
            return (bool) ($this->spawn ?? [$this, 'spawnNode'])($this->runnerConfig());
        } catch (\Throwable $e) {
            error_log('PlayMona crew runner: could not start: ' . $e->getMessage());
            return false;
        }
    }

    /** What the runner reads at start: where the API and Firebase are, and the shared secret. */
    public function runnerConfig(): array
    {
        return [
            'apiBase' => rtrim((string) ($this->config->get('crew.api_base') ?: $this->config->get('site_url') . '/api'), '/'),
            'secret' => (string) $this->config->get('crew.runner_secret', ''),
            'databaseUrl' => (string) $this->config->get('firebase.database_url', ''),
            'serviceAccount' => (string) $this->config->get('firebase.service_account', ''),
            'idleMinutes' => (int) ($this->config->get('crew.idle_minutes') ?: 5),
        ];
    }

    /** Starts `node api/crew/runner.js <config>` in the background, detached from this request. */
    private function spawnNode(array $runnerConfig): bool
    {
        if ($runnerConfig['secret'] === '') throw new \RuntimeException('crew.runner_secret is not set');
        $node = (string) ($this->config->get('crew.node_path') ?: 'node');
        $dir = (string) ($this->config->get('crew.state_dir') ?: (($this->config->get('cache_dir') ?: sys_get_temp_dir()) . '/playmona-crew'));
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        $file = $dir . '/runner.json';
        file_put_contents($file, json_encode($runnerConfig), LOCK_EX);
        @chmod($file, 0600);
        $script = dirname(__DIR__) . '/crew/runner.js';
        $log = $dir . '/runner.log';
        if (DIRECTORY_SEPARATOR === '\\') {
            pclose(popen('start /B "" ' . escapeshellarg($node) . ' ' . escapeshellarg($script) . ' ' . escapeshellarg($file) . ' >> ' . escapeshellarg($log) . ' 2>&1', 'r'));
            return true;
        }
        $cmd = 'nohup setsid ' . escapeshellarg($node) . ' ' . escapeshellarg($script) . ' ' . escapeshellarg($file)
            . ' >> ' . escapeshellarg($log) . ' 2>&1 < /dev/null &';
        $proc = proc_open($cmd, [], $pipes);
        if (!is_resource($proc)) throw new \RuntimeException('proc_open failed (is it disabled in php.ini?)');
        proc_close($proc);
        return true;
    }

    private static function fresh(mixed $at, int $now, int $ms): bool
    {
        return is_int($at) && $at > 0 && $at > $now - $ms;
    }

    private function write(callable $change): void
    {
        $this->db->transaction(function (Db $db) use ($change) {
            $row = $db->one('SELECT value FROM settings WHERE name = ?' . $db->forUpdate(), [self::ROW]);
            $old = $row ? (json_decode((string) $row['value'], true) ?: []) : [];
            $new = json_encode($change($old));
            if ($row) $db->run('UPDATE settings SET value = ?, updated_at = ? WHERE name = ?', [$new, nowMs(), self::ROW]);
            else $db->run('INSERT INTO settings (name, value, updated_at) VALUES (?, ?, ?)', [self::ROW, $new, nowMs()]);
        });
    }
}
