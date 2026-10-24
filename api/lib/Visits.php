<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Visitor details for the admin portal: the country and a shortened IP address
 * of each device, once a day. js/visit.js sends the same random device id it
 * writes to Firebase, so the two counts line up.
 *
 * The site is served through Cloudflare, which passes the visitor's address in
 * CF-Connecting-IP and their country in CF-IPCountry. Only the shortened address
 * is stored (41.216.x.x, or the first three blocks of an IPv6 address).
 */
class Visits
{
    /** Above this many visitors, the admin view groups by country instead of listing each one. */
    public const LIST_LIMIT = 100;
    /** The most visitors one list returns (newest first). */
    public const SHOW_LIMIT = 200;
    /** Rows kept, in days (about 13 months). The cron job deletes older ones. */
    public const KEEP_DAYS = 395;

    public function __construct(private Db $db) {}

    /** Records one device's visit today. Repeats on the same day are ignored. */
    public function record(string $visitorId, string $page, string $ip, ?string $country, ?int $now = null): bool
    {
        if (!preg_match('/^[a-f0-9]{24}$/', $visitorId)) throw new HttpError(400, 'Bad visitor id.', 'bad-id');
        if (!in_array($page, ['l', 'a', 'p'], true)) $page = 'l';
        $now ??= nowMs();
        $ignore = $this->db->mysql ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
        return $this->db->run(
            "$ignore INTO visits (day, visitor_id, page, ip_masked, country, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [gmdate('Y-m-d', intdiv($now, 1000)), $visitorId, $page, self::maskIp($ip), self::country($country), $now]
        ) > 0;
    }

    /**
     * Visitors from one UTC day to another (inclusive). Always returns the country
     * summary; returns each visitor too when there are few enough, when $view is
     * 'list', or for one country.
     */
    public function report(string $from, string $to, ?string $view = null, ?string $country = null): array
    {
        foreach ([$from, $to] as $d) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) throw new HttpError(400, 'Dates look like 2026-10-24.', 'bad-date');
        }
        if ($from > $to) [$from, $to] = [$to, $from];
        $range = [$from, $to];

        $total = (int) ($this->db->one('SELECT COUNT(DISTINCT visitor_id) AS n FROM visits WHERE day BETWEEN ? AND ?', $range)['n'] ?? 0);
        $countries = array_map(fn ($r) => [
            'country' => $r['cc'] === '' ? null : $r['cc'],
            'visitors' => (int) $r['visitors'],
            'reachedApp' => (int) $r['reached_app'],
        ], $this->db->all(
            "SELECT COALESCE(country, '') AS cc, COUNT(DISTINCT visitor_id) AS visitors,
                    COUNT(DISTINCT CASE WHEN page = 'a' THEN visitor_id END) AS reached_app
             FROM visits WHERE day BETWEEN ? AND ? GROUP BY COALESCE(country, '') ORDER BY visitors DESC",
            $range
        ));

        $filter = null;
        if ($country !== null && $country !== '') {
            $filter = $country === 'unknown' ? '' : self::country($country);
            if ($filter === null) throw new HttpError(400, 'Choose a country.', 'bad-country');
        }
        $view = $filter !== null ? 'list' : ($view === 'list' || $view === 'countries' ? $view : ($total <= self::LIST_LIMIT ? 'list' : 'countries'));

        $out = ['from' => $from, 'to' => $to, 'total' => $total, 'view' => $view, 'countries' => $countries, 'listLimit' => self::LIST_LIMIT];
        if ($view === 'list') {
            $where = 'v.day BETWEEN ? AND ?';
            $params = $range;
            if ($filter !== null) { $where .= " AND COALESCE(v.country, '') = ?"; $params[] = $filter; }
            // The page each visitor saw first in the range, for at most SHOW_LIMIT visitors.
            $rows = $this->db->all(
                "SELECT v.visitor_id, MAX(v.ip_masked) AS ip, MAX(v.country) AS country, COUNT(*) AS days,
                        MAX(CASE WHEN v.page = 'a' THEN 1 ELSE 0 END) AS reached_app,
                        MIN(v.created_at) AS first_at, MAX(v.created_at) AS last_at,
                        (SELECT f.page FROM visits f WHERE f.visitor_id = v.visitor_id AND f.day BETWEEN ? AND ?
                         ORDER BY f.created_at LIMIT 1) AS first_page
                 FROM visits v WHERE $where
                 GROUP BY v.visitor_id ORDER BY last_at DESC LIMIT " . self::SHOW_LIMIT,
                array_merge($range, $params)
            );
            $out['country'] = $filter === null ? null : ($filter === '' ? 'unknown' : $filter);
            $out['showLimit'] = self::SHOW_LIMIT;
            $out['visitors'] = array_map(fn ($r) => [
                'id' => substr($r['visitor_id'], 0, 6),
                'ip' => $r['ip'],
                'country' => $r['country'],
                'firstPage' => $r['first_page'],
                'reachedApp' => (bool) $r['reached_app'],
                'days' => (int) $r['days'],
                'firstAt' => (int) $r['first_at'],
                'lastAt' => (int) $r['last_at'],
            ], $rows);
        }
        return $out;
    }

    /** Deletes rows older than KEEP_DAYS. Returns how many went. */
    public function prune(?int $now = null): int
    {
        $now ??= nowMs();
        return $this->db->run('DELETE FROM visits WHERE day < ?', [gmdate('Y-m-d', intdiv($now, 1000) - self::KEEP_DAYS * 86400)]);
    }

    /** 41.216.88.7 -> 41.216.x.x; 2c0f:fe38:2101:a::1 -> 2c0f:fe38:2101::/48. Anything else -> null. */
    public static function maskIp(string $ip): ?string
    {
        $ip = trim($ip);
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $p = explode('.', $ip);
            return $p[0] . '.' . $p[1] . '.x.x';
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $bin = inet_pton($ip);
            if ($bin === false) return null;
            $groups = array_slice(unpack('n*', $bin), 0, 3);
            return implode(':', array_map(fn ($g) => dechex($g), $groups)) . '::/48';
        }
        return null;
    }

    /** Cloudflare's country header: two letters (ZM), or T1 for Tor. XX and blanks are unknown (null). */
    public static function country(?string $code): ?string
    {
        $code = strtoupper(trim((string) $code));
        if ($code === 'T1') return 'T1';
        return preg_match('/^[A-Z]{2}$/', $code) && $code !== 'XX' ? $code : null;
    }
}
