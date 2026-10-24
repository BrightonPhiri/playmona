<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Who has Plus and which games they own.
 *
 * The grants table is the record: one row per purchase or admin gift, never deleted.
 * Removing premium marks a grant revoked. A player's access is always rebuilt from
 * their grants that are still in force (recompute), saved in the entitlements table,
 * and copied to Firebase /entitlements/<uid> so the app can read it.
 */
class Store
{
    public function __construct(private Db $db, private RealtimeDb $rtdb) {}

    /** The player's access: ['plusUntil' => ms, 'games' => [id => true]]. */
    public function get(string $uid): array
    {
        $row = $this->db->one('SELECT plus_until, games FROM entitlements WHERE uid = ?', [$uid]);
        $games = $row ? json_decode((string) $row['games'], true) : [];
        return [
            'plusUntil' => $row ? (int) $row['plus_until'] : 0,
            'games' => is_array($games) ? $games : [],
        ];
    }

    /**
     * Records a purchase or gift of Plus days or a game. Must run inside a transaction
     * (Payments::markPaid and the admin grant both do). Plus time stacks.
     * Returns the new grant's id.
     */
    public function grant(string $uid, array $grant, string $source, ?string $orderId = null, ?string $adminUid = null, ?string $note = null): string
    {
        if ($grant['kind'] === 'plus') {
            $days = (int) $grant['days'];
            if ($days < 1 || $days > Catalog::LIFETIME_DAYS) throw new HttpError(400, 'Days must be between 1 and ' . Catalog::LIFETIME_DAYS . ' (lifetime).', 'bad-days');
        } elseif ($grant['kind'] !== 'game' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', (string) ($grant['game'] ?? ''))) {
            throw new \InvalidArgumentException('Unknown grant kind.');
        }
        $id = newId('g');
        $this->db->run(
            'INSERT INTO grants (id, uid, kind, game, days, source, order_id, admin_uid, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $uid, $grant['kind'], $grant['game'] ?? null, $grant['kind'] === 'plus' ? (int) $grant['days'] : null, $source, $orderId, $adminUid, $note !== null ? mb_substr($note, 0, 200) : null, nowMs()]
        );
        $this->recompute($uid);
        return $id;
    }

    /**
     * Whether $adminUid may remove this grant: anything an admin gave, and anything at all
     * on the admin's own account (so payments can be tested again). Never someone else's purchase.
     */
    public static function canRevoke(array $grant, string $adminUid): bool
    {
        if (!empty($grant['revoked_at'])) return false;
        return $grant['source'] === 'admin' || $grant['uid'] === $adminUid;
    }

    /** Removes one grant. Returns the player's uid. The order (if any) stays paid for the records. */
    public function revoke(string $grantId, string $adminUid): string
    {
        return $this->db->transaction(function (Db $db) use ($grantId, $adminUid) {
            $grant = $db->one('SELECT * FROM grants WHERE id = ?' . $db->forUpdate(), [$grantId]);
            if (!$grant) throw new HttpError(404, 'That premium was not found.', 'no-grant');
            if (!empty($grant['revoked_at'])) return (string) $grant['uid'];
            if (!self::canRevoke($grant, $adminUid)) {
                throw new HttpError(403, 'Premium a player paid for cannot be removed.', 'paid-grant');
            }
            $db->run('UPDATE grants SET revoked_at = ?, revoked_by = ? WHERE id = ?', [nowMs(), $adminUid, $grantId]);
            $this->recompute((string) $grant['uid']);
            return (string) $grant['uid'];
        });
    }

    /** Removes all premium from the admin's own account, paid or not (for testing payments). */
    public function resetOwn(string $adminUid): int
    {
        return $this->db->transaction(function (Db $db) use ($adminUid) {
            $n = $db->run('UPDATE grants SET revoked_at = ?, revoked_by = ? WHERE uid = ? AND revoked_at IS NULL', [nowMs(), $adminUid, $adminUid]);
            $this->recompute($adminUid);
            return $n;
        });
    }

    /**
     * Rebuilds a player's access from their grants in force, oldest first.
     * Plus: each grant adds its days from whichever is later, its own date or the
     * end of the time before it. Call inside a transaction; sync() afterwards.
     */
    public function recompute(string $uid): array
    {
        $db = $this->db;
        $existing = $db->one('SELECT uid FROM entitlements WHERE uid = ?' . $db->forUpdate(), [$uid]);
        $plusUntil = 0;
        $games = [];
        foreach ($db->all('SELECT kind, game, days, created_at FROM grants WHERE uid = ? AND revoked_at IS NULL ORDER BY created_at, id', [$uid]) as $g) {
            if ($g['kind'] === 'plus') {
                $plusUntil = max($plusUntil, (int) $g['created_at']) + (int) $g['days'] * 86400000;
            } elseif ($g['kind'] === 'game' && $g['game'] !== null) {
                $games[(string) $g['game']] = true;
            }
        }
        $gamesJson = json_encode((object) $games);
        $now = nowMs();
        if ($existing) {
            $db->run('UPDATE entitlements SET plus_until = ?, games = ?, synced = 0, updated_at = ? WHERE uid = ?', [$plusUntil, $gamesJson, $now, $uid]);
        } else {
            $db->run('INSERT INTO entitlements (uid, plus_until, games, synced, updated_at) VALUES (?, ?, ?, 0, ?)', [$uid, $plusUntil, $gamesJson, $now]);
        }
        return ['plusUntil' => $plusUntil, 'games' => $games];
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

    /** A player's grants, newest first, including removed ones. */
    public function history(string $uid, int $limit = 50): array
    {
        return $this->db->all(
            'SELECT id, uid, kind, game, days, source, order_id, admin_uid, note, created_at, revoked_at, revoked_by FROM grants WHERE uid = ? ORDER BY created_at DESC, id DESC LIMIT ' . max(1, min(200, $limit)),
            [$uid]
        );
    }
}
