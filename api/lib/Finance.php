<?php
declare(strict_types=1);

namespace PlayMona;

/** Money numbers for the admin portal. Test (sandbox) and live payments are never mixed. */
class Finance
{
    private const DAY = 86400000;

    public function __construct(private Db $db) {}

    /** Totals, best sellers and a 30-day series (UTC days) for one mode ('live' or 'sandbox'). */
    public function summary(string $mode, ?int $now = null): array
    {
        $mode = $mode === 'live' ? 'live' : 'sandbox';
        $now ??= nowMs();
        $today = intdiv($now, self::DAY) * self::DAY;

        $sum = function (int $since) use ($mode): array {
            $r = $this->db->one("SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM orders WHERE status = 'paid' AND mode = ? AND paid_at >= ?", [$mode, $since]);
            return ['orders' => (int) $r['n'], 'cents' => (int) $r['cents']];
        };

        $pending = $this->db->one("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending' AND mode = ? AND created_at > ?", [$mode, $now - 3 * self::DAY]);
        $failed = $this->db->one("SELECT COUNT(*) AS n FROM orders WHERE status = 'failed' AND mode = ? AND created_at > ?", [$mode, $now - 30 * self::DAY]);
        $buyers = $this->db->one("SELECT COUNT(DISTINCT uid) AS n FROM orders WHERE status = 'paid' AND mode = ?", [$mode]);

        $byProduct = [];
        foreach ($this->db->all("SELECT product, COUNT(*) AS n, SUM(amount_cents) AS cents FROM orders WHERE status = 'paid' AND mode = ? GROUP BY product ORDER BY cents DESC", [$mode]) as $r) {
            $byProduct[] = ['product' => $r['product'], 'orders' => (int) $r['n'], 'cents' => (int) $r['cents']];
        }

        $days = [];
        $start = $today - 29 * self::DAY;
        for ($i = 0; $i < 30; $i++) {
            $days[gmdate('Y-m-d', intdiv($start + $i * self::DAY, 1000))] = ['cents' => 0, 'orders' => 0];
        }
        foreach ($this->db->all("SELECT paid_at, amount_cents FROM orders WHERE status = 'paid' AND mode = ? AND paid_at >= ?", [$mode, $start]) as $r) {
            $key = gmdate('Y-m-d', intdiv((int) $r['paid_at'], 1000));
            if (isset($days[$key])) {
                $days[$key]['cents'] += (int) $r['amount_cents'];
                $days[$key]['orders']++;
            }
        }
        $series = [];
        foreach ($days as $day => $v) $series[] = ['day' => $day] + $v;

        $plus = $this->db->one('SELECT COUNT(*) AS n FROM entitlements WHERE plus_until > ?', [$now]);

        return [
            'mode' => $mode,
            'currency' => 'USD',
            'today' => $sum($today),
            'week' => $sum($today - 6 * self::DAY),
            'month' => $sum($today - 29 * self::DAY),
            'all' => $sum(0),
            'pending' => (int) $pending['n'],
            'failed30' => (int) $failed['n'],
            'buyers' => (int) $buyers['n'],
            'activePlus' => (int) $plus['n'],
            'byProduct' => $byProduct,
            'days' => $series,
        ];
    }

    /**
     * Orders for the admin list, newest first. Filters: mode, status (paid, pending,
     * failed or all), q (matches order id, invoice number, name, email or account id).
     */
    public function orders(array $f): array
    {
        $where = ['mode = ?'];
        $args = [($f['mode'] ?? 'live') === 'live' ? 'live' : 'sandbox'];
        $status = (string) ($f['status'] ?? 'all');
        if (in_array($status, ['paid', 'pending', 'failed'], true)) {
            $where[] = 'status = ?';
            $args[] = $status;
        }
        $q = trim((string) ($f['q'] ?? ''));
        if ($q !== '') {
            // "!" escapes % and _ in what the admin typed (a backslash differs between MariaDB and SQLite).
            $like = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_substr($q, 0, 80)) . '%';
            $where[] = "(id LIKE ? ESCAPE '!' OR invoice_no LIKE ? ESCAPE '!' OR buyer_name LIKE ? ESCAPE '!' OR buyer_email LIKE ? ESCAPE '!' OR uid LIKE ? ESCAPE '!')";
            array_push($args, $like, $like, $like, $like, $like);
        }
        $page = max(1, (int) ($f['page'] ?? 1));
        $per = 50;
        $sqlWhere = implode(' AND ', $where);
        $total = (int) $this->db->one("SELECT COUNT(*) AS n FROM orders WHERE $sqlWhere", $args)['n'];
        $rows = $this->db->all(
            "SELECT * FROM orders WHERE $sqlWhere ORDER BY created_at DESC, id DESC LIMIT $per OFFSET " . (($page - 1) * $per),
            $args
        );
        return [
            'total' => $total,
            'page' => $page,
            'pages' => max(1, (int) ceil($total / $per)),
            'orders' => array_map([self::class, 'adminOrder'], $rows),
        ];
    }

    /** An order as the admin portal sees it (with the buyer). */
    public static function adminOrder(array $o): array
    {
        return Payments::publicOrder($o) + [
            'uid' => $o['uid'],
            'buyerName' => $o['buyer_name'] ?? null,
            'buyerEmail' => $o['buyer_email'] ?? null,
            'paidVia' => $o['paid_via'] ?? null,
            'lastStatus' => $o['last_status'] ?? null,
            'reference' => $o['payment_reference'] ?? null,
        ];
    }
}
