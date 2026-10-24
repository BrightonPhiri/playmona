<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Watch live (phase 3). Reads the broadcasts that room hosts' devices publish
 * (js/net/broadcast.js) and answers two questions:
 *  - which public games are playing now (the Watch live page), cached for ten
 *    seconds so people browsing the list hold no Firebase connection;
 *  - can one more person watch this game (the viewer limits).
 * Broadcasts are already safe to show: hidden photos were swapped for characters
 * by the host's device, and the room code is never in them.
 */
final class Live
{
    public const DEFAULT_LIMITS = ['room' => 20, 'site' => 50];
    public const STALE_MS = 45000;
    public const CACHE_SECONDS = 10;
    public const CODE = '/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/';

    public function __construct(private RealtimeDb $db, private string $cacheDir) {}

    /** Public games playing now, busiest first, plus the site's viewer count and limits. */
    public function list(int $now): array
    {
        $cached = $this->readCache($now);
        if ($cached !== null) return $cached;
        $out = self::summarize($this->broadcasts(), $this->watchers(), $this->limits(), $now);
        $result = ['rooms' => $out['rooms'], 'viewers' => $out['viewers'], 'limits' => $out['limits'], 'time' => $now];
        $this->writeCache($now, $result);
        return $result;
    }

    /** One game by its watch code (public or private), and whether one more viewer fits. */
    public function room(string $wc, int $now, bool $open): array
    {
        if (!preg_match(self::CODE, $wc)) throw new HttpError(404, 'This game is not live right now.', 'not-live');
        $broadcasts = $this->broadcasts();
        $b = $broadcasts[$wc] ?? null;
        if (!is_array($b) || !self::fresh($b, $now)) throw new HttpError(404, 'This game is not live right now.', 'not-live');

        $watchers = $this->watchers();
        $limits = $this->limits();
        $all = self::summarize($broadcasts, $watchers, $limits, $now, true);
        $room = $all['byCode'][$wc];
        $site = $all['viewers'];
        $reason = null;
        if ($room['viewers'] >= $limits['room']) $reason = 'room';
        elseif ($site >= $limits['site']) $reason = 'site';

        if ($open && $reason === null) $this->countWatcher($now);
        return [
            'room' => $room,
            'viewers' => $room['viewers'],
            'siteViewers' => $site,
            'limits' => $limits,
            'full' => $reason !== null,
            'reason' => $reason,
        ];
    }

    /** Viewer limits set by admins (config/site/watch), or the defaults. */
    public function limits(): array
    {
        $saved = $this->db->get('config/site/watch');
        $saved = is_array($saved) ? $saved : [];
        $room = $saved['room'] ?? null;
        $site = $saved['site'] ?? null;
        return [
            'room' => (is_int($room) && $room >= 1 && $room <= 1000) ? $room : self::DEFAULT_LIMITS['room'],
            'site' => (is_int($site) && $site >= 1 && $site <= 100000) ? $site : self::DEFAULT_LIMITS['site'],
        ];
    }

    /**
     * The list from raw data. Pure, for the tests. viewers counts everyone watching
     * a live game (private ones too: they use Firebase connections all the same).
     */
    public static function summarize(array $broadcasts, array $watchers, array $limits, int $now, bool $withAll = false): array
    {
        $rooms = [];
        $byCode = [];
        $site = 0;
        foreach ($broadcasts as $code => $b) {
            $code = (string) $code;
            if (!is_array($b) || !preg_match(self::CODE, $code) || !self::fresh($b, $now)) continue;
            $viewers = is_array($watchers[$code] ?? null) ? count($watchers[$code]) : 0;
            $site += $viewers;
            $room = self::liveRoom($code, $b, $viewers);
            $byCode[$code] = $room;
            if (($b['public'] ?? false) === true) $rooms[] = $room;
        }
        usort($rooms, fn ($a, $b) => [$b['viewers'], $b['updatedAt']] <=> [$a['viewers'], $a['updatedAt']]);
        $out = ['rooms' => $rooms, 'viewers' => $site, 'limits' => $limits];
        if ($withAll) $out['byCode'] = $byCode;
        return $out;
    }

    private static function fresh(array $b, int $now): bool
    {
        $at = $b['updatedAt'] ?? null;
        return is_numeric($at) && ($now - (int) $at) <= self::STALE_MS;
    }

    private static function liveRoom(string $code, array $b, int $viewers): array
    {
        $round = is_array($b['round'] ?? null) ? $b['round'] : null;
        $game = is_array($b['game'] ?? null) ? $b['game'] : null;
        $players = [];
        foreach ((array) ($b['players'] ?? []) as $p) {
            if (!is_array($p)) continue;
            $players[] = [
                'name' => mb_substr((string) ($p['name'] ?? 'Player'), 0, 40),
                'avatar' => isset($p['avatar']) && is_string($p['avatar']) ? mb_substr($p['avatar'], 0, 60) : null,
            ];
        }
        $status = in_array($b['status'] ?? '', ['lobby', 'playing', 'ended'], true) ? $b['status'] : 'lobby';
        return [
            'code' => $code,
            'name' => mb_substr((string) ($b['name'] ?? ''), 0, 40),
            'game' => $game ? [
                'id' => (string) ($game['id'] ?? ''),
                'name' => mb_substr((string) ($game['name'] ?? ''), 0, 60),
                'category' => isset($game['category']) ? (string) $game['category'] : null,
            ] : null,
            'status' => $status,
            'round' => $round && is_numeric($round['n'] ?? null) ? (int) $round['n'] + 1 : null,
            'total' => $round && is_numeric($round['total'] ?? null) ? (int) $round['total'] : null,
            'players' => $players,
            'viewers' => $viewers,
            'updatedAt' => (int) $b['updatedAt'],
        ];
    }

    private function broadcasts(): array
    {
        $v = $this->db->get('broadcasts');
        return is_array($v) ? $v : [];
    }

    private function watchers(): array
    {
        $v = $this->db->get('watchers');
        return is_array($v) ? $v : [];
    }

    /** +1 on today's and the all-time "watch views" counters (admin Overview). */
    private function countWatcher(int $now): void
    {
        $day = gmdate('Y-m-d', intdiv($now, 1000));
        foreach (["stats/days/$day/watchers", 'stats/totals/watchers'] as $path) {
            try {
                $n = $this->db->get($path);
                $this->db->set($path, (is_int($n) ? $n : 0) + 1);
            } catch (\Throwable $e) {
                error_log('PlayMona live counter: ' . $e->getMessage());
            }
        }
    }

    private function cacheFile(): string { return rtrim($this->cacheDir, '/\\') . '/live.json'; }

    private function readCache(int $now): ?array
    {
        $raw = @file_get_contents($this->cacheFile());
        if ($raw === false) return null;
        $data = json_decode($raw, true);
        if (!is_array($data) || !isset($data['at'], $data['result'])) return null;
        $age = $now - (int) $data['at'];
        return ($age >= 0 && $age < self::CACHE_SECONDS * 1000) ? $data['result'] : null;
    }

    private function writeCache(int $now, array $result): void
    {
        if (!is_dir($this->cacheDir)) @mkdir($this->cacheDir, 0775, true);
        @file_put_contents($this->cacheFile(), json_encode(['at' => $now, 'result' => $result]), LOCK_EX);
    }
}
