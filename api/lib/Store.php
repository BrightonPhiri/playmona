<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Who has Plus and which games they own. MariaDB is the record; the server copies
 * each player's row to Firebase /entitlements/<uid> so the app can read it.
 */
class Store
{
    public function __construct(private Db $db, private RealtimeDb $rtdb) {}

    /** The player's access: ['plusUntil' => ms, 'games' => [id => true]]. */
    public function get(string $uid): array
    {
        $row = $this->db->one('SELECT plus_until, games FROM entitlements WHERE uid = ?', [$uid]);
        return self::shape($row);
    }

    /**
     * Adds Plus days or a game. Must run inside a transaction (Payments::markPaid and
     * the admin grant both do). Plus time stacks: buying again adds to what is left.
     */
    public function grant(string $uid, array $grant, string $source, ?string $orderId = null, ?string $adminUid = null, ?string $note = null): void
    {
        $db = $this->db;
        $now = nowMs();
        $row = $db->one('SELECT plus_until, games FROM entitlements WHERE uid = ?' . $db->forUpdate(), [$uid]);
        $current = self::shape($row);

        $plusUntil = $current['plusUntil'];
        $games = $current['games'];
        if ($grant['kind'] === 'plus') {
            $days = (int) $grant['days'];
            if ($days < 1 || $days > 3660) throw new HttpError(400, 'Days must be between 1 and 3660.', 'bad-days');
            $plusUntil = max($plusUntil, $now) + $days * 86400000;
        } elseif ($grant['kind'] === 'game') {
            $games[(string) $grant['game']] = true;
        } else {
            throw new \InvalidArgumentException('Unknown grant kind.');
        }

        $gamesJson = json_encode((object) $games);
        if ($row) {
            $db->run('UPDATE entitlements SET plus_until = ?, games = ?, synced = 0, updated_at = ? WHERE uid = ?', [$plusUntil, $gamesJson, $now, $uid]);
        } else {
            $db->run('INSERT INTO entitlements (uid, plus_until, games, synced, updated_at) VALUES (?, ?, ?, 0, ?)', [$uid, $plusUntil, $gamesJson, $now]);
        }
        $db->run(
            'INSERT INTO grants (id, uid, kind, game, days, source, order_id, admin_uid, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newId('g'), $uid, $grant['kind'], $grant['game'] ?? null, $grant['days'] ?? null, $source, $orderId, $adminUid, $note !== null ? mb_substr($note, 0, 200) : null, $now]
        );
    }

    /**
     * Copies a player's access to Firebase. Called after the transaction commits.
     * If Firebase is unreachable the row stays unsynced and the cron job retries.
     */
    public function sync(string $uid): bool
    {
        $access = $this->get($uid);
        try {
            $this->rtdb->set('entitlements/' . $uid, [
                'plusUntil' => $access['plusUntil'],
                'games' => $access['games'] ?: null,
                'updatedAt' => nowMs(),
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona: entitlement sync failed for ' . $uid . ': ' . $e->getMessage());
            return false;
        }
        $this->db->run('UPDATE entitlements SET synced = 1 WHERE uid = ?', [$uid]);
        return true;
    }

    /** Retries every row Firebase has not got yet. Returns how many were synced. */
    public function syncPending(): int
    {
        $count = 0;
        foreach ($this->db->all('SELECT uid FROM entitlements WHERE synced = 0') as $row) {
            if ($this->sync($row['uid'])) $count++;
        }
        return $count;
    }

    public function history(string $uid, int $limit = 20): array
    {
        return $this->db->all('SELECT kind, game, days, source, note, created_at FROM grants WHERE uid = ? ORDER BY created_at DESC LIMIT ' . max(1, min(100, $limit)), [$uid]);
    }

    private static function shape(?array $row): array
    {
        $games = $row ? json_decode((string) $row['games'], true) : [];
        return [
            'plusUntil' => $row ? (int) $row['plus_until'] : 0,
            'games' => is_array($games) ? $games : [],
        ];
    }
}
