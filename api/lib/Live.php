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
    /** Viewers check in every 30 s; an entry older than this is someone who left without saying so. */
    public const VIEWER_MS = 90000;
    /** Broadcasts silent for this long are deleted by the cron job, with their viewer lists. */
    public const PRUNE_MS = 600000;

    public function __construct(private RealtimeDb $db, private string $cacheDir) {}

    /** Public games playing now, busiest first, plus the site's viewer count and limits. */
    public function list(int $now): array
    {
        $cached = $this->readCache($now);
        if ($cached !== null) return $cached;
        $fresh = $this->freshBroadcasts($now);
        $out = self::summarize($fresh, $this->watchersFor(array_keys($fresh)), $this->limits(), $now);
        $result = ['rooms' => $out['rooms'], 'viewers' => $out['viewers'], 'limits' => $out['limits'], 'time' => $now];
        $this->writeCache($now, $result);
        return $result;
    }

    /** One game by its watch code (public or private), and whether one more viewer fits. */
    public function room(string $wc, int $now, bool $open): array
    {
        if (!preg_match(self::CODE, $wc)) throw new HttpError(404, 'This game is not live right now.', 'not-live');
        // Only this game is read; the site total comes from the (cached) list.
        $b = $this->db->get('broadcasts/' . $wc);
        if (!is_array($b) || !self::fresh($b, $now)) throw new HttpError(404, 'This game is not live right now.', 'not-live');

        $limits = $this->limits();
        $viewers = self::countViewers($this->db->get('watchers/' . $wc), $now);
        $room = self::liveRoom($wc, $b, $viewers);
        $site = max((int) $this->list($now)['viewers'], $viewers);
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
            $viewers = self::countViewers($watchers[$code] ?? null, $now);
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

    /** Deletes broadcasts nobody has written for PRUNE_MS (abandoned rooms), and their viewer lists. Cron. */
    public function prune(int $now): int
    {
        $old = $this->db->query('broadcasts', ['orderBy' => 'updatedAt', 'endAt' => $now - self::PRUNE_MS, 'limitToFirst' => 100]);
        $n = 0;
        foreach (array_keys(is_array($old) ? $old : []) as $code) {
            $code = (string) $code;
            if (!preg_match(self::CODE, $code)) continue;
            $this->db->set('broadcasts/' . $code, null);
            $this->db->set('watchers/' . $code, null);
            $n++;
        }
        return $n;
    }

    /** People watching now: entries that checked in within VIEWER_MS. */
    private static function countViewers(mixed $entries, int $now): int
    {
        if (!is_array($entries)) return 0;
        $n = 0;
        foreach ($entries as $t) if (is_numeric($t) && ($now - (int) $t) <= self::VIEWER_MS) $n++;
        return $n;
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

    /** Broadcasts written in the last STALE_MS (needs .indexOn updatedAt on broadcasts). */
    private function freshBroadcasts(int $now): array
    {
        $v = $this->db->query('broadcasts', ['orderBy' => 'updatedAt', 'startAt' => $now - self::STALE_MS]);
        return is_array($v) ? $v : [];
    }

    /** Viewer lists for these watch codes only. */
    private function watchersFor(array $codes): array
    {
        $out = [];
        foreach ($codes as $code) {
            $code = (string) $code;
            if (preg_match(self::CODE, $code)) $out[$code] = $this->db->get('watchers/' . $code);
        }
        return $out;
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
