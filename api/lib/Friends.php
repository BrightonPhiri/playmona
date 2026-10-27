<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Friends, requests, blocking, invites and "recently played". One row per pair of players
 * (user_a < user_b), so duplicate requests can't happen. Crew players look like anyone else
 * here, but they never become friends: a request to one simply fades after a while, exactly
 * as a request a real player ignores or declines does.
 */
class Friends
{
    private const ONLINE_MS = 90_000;
    private const INVITE_MS = 10 * 60_000;
    private const MAX_FRIENDS = 200;

    private array $people = [];

    public function __construct(private Db $db, private RealtimeDb $rtdb, private Crew $crew) {}

    /** Everything the Friends page shows. */
    public function overview(string $uid, int $now): array
    {
        $this->sweep($now);
        $rows = $this->db->all('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?', [$uid, $uid]);
        $friends = $incoming = $sent = [];
        foreach ($rows as $r) {
            $other = $r['user_a'] === $uid ? $r['user_b'] : $r['user_a'];
            $person = $this->person($other, $now);
            if (!$person) continue;
            $person['since'] = (int) $r['updated_at'];
            if ($r['status'] === 'accepted') $friends[] = $person;
            elseif ($r['requested_by'] === $uid) $sent[] = $person;
            else $incoming[] = $person;
        }
        usort($friends, fn ($a, $b) => [$b['online'], $a['displayName']] <=> [$a['online'], $b['displayName']]);

        $recent = [];
        foreach ($this->db->all('SELECT * FROM recent_players WHERE owner_uid = ? ORDER BY last_played_at DESC LIMIT 20', [$uid]) as $r) {
            if ($this->blocked($uid, $r['other_uid'])) continue;
            $person = $this->person($r['other_uid'], $now);
            if (!$person) continue;
            $person['gameId'] = $r['game_id'];
            $person['playedAt'] = (int) $r['last_played_at'];
            $person['relation'] = $this->relation($uid, $r['other_uid']);
            $recent[] = $person;
        }

        $invites = [];
        foreach ($this->db->all('SELECT * FROM friend_invites WHERE to_uid = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 10', [$uid, $now]) as $i) {
            $from = $this->person($i['from_uid'], $now);
            if ($from) $invites[] = ['id' => $i['id'], 'from' => $from, 'roomCode' => $i['room_code'], 'createdAt' => (int) $i['created_at']];
        }
        $blocked = [];
        foreach ($this->db->all('SELECT blocked FROM blocks WHERE blocker = ?', [$uid]) as $b) {
            $person = $this->person($b['blocked'], $now);
            if ($person) $blocked[] = $person;
        }
        return compact('friends', 'incoming', 'sent', 'recent', 'invites', 'blocked');
    }

    /** Sends a request (by uid or username). A request back to someone who asked you accepts it. */
    public function request(AuthUser $user, array $body, int $now): string
    {
        $this->requireAccount($user);
        $to = $this->target($body);
        if ($to === $user->uid) throw new HttpError(400, 'That is you.', 'self');
        if ($this->blocked($user->uid, $to)) throw new HttpError(403, 'You cannot send a request to this player.', 'blocked');
        [$a, $b] = self::pair($user->uid, $to);
        return $this->db->transaction(function (Db $db) use ($user, $to, $a, $b, $now) {
            $row = $db->one('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?' . $db->forUpdate(), [$a, $b]);
            if ($row && $row['status'] === 'accepted') throw new HttpError(409, 'You are already friends.', 'already-friends');
            if ($row && $row['requested_by'] === $user->uid) throw new HttpError(409, 'You already sent a request.', 'already-sent');
            if ($row) {
                $db->run("UPDATE friendships SET status = 'accepted', decline_at = NULL, updated_at = ? WHERE user_a = ? AND user_b = ?", [$now, $a, $b]);
                return 'accepted';
            }
            $count = $db->one("SELECT COUNT(*) AS n FROM friendships WHERE (user_a = ? OR user_b = ?)", [$user->uid, $user->uid]);
            if ((int) $count['n'] >= self::MAX_FRIENDS) throw new HttpError(409, 'Your friends list is full.', 'too-many');
            $declineAt = null;
            if ($this->crew->isCrew($to)) {
                [$lo, $hi] = $this->crew->settings()['declineHours'];
                $declineAt = $now + random_int($lo * 3600, max($lo, $hi) * 3600) * 1000;
            }
            $db->run(
                "INSERT INTO friendships (user_a, user_b, status, requested_by, decline_at, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, ?, ?)",
                [$a, $b, $user->uid, $declineAt, $now, $now]
            );
            return 'sent';
        });
    }

    public function respond(AuthUser $user, string $other, bool $accept, int $now): void
    {
        [$a, $b] = self::pair($user->uid, $other);
        if ($accept) {
            $n = $this->db->run(
                "UPDATE friendships SET status = 'accepted', updated_at = ? WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by = ?",
                [$now, $a, $b, $other]
            );
        } else {
            $n = $this->db->run("DELETE FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by = ?", [$a, $b, $other]);
        }
        if (!$n) throw new HttpError(404, 'That request is no longer there.', 'no-request');
    }

    public function cancel(AuthUser $user, string $other): void
    {
        [$a, $b] = self::pair($user->uid, $other);
        $this->db->run("DELETE FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by = ?", [$a, $b, $user->uid]);
    }

    public function remove(AuthUser $user, string $other): void
    {
        [$a, $b] = self::pair($user->uid, $other);
        $this->db->run("DELETE FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'", [$a, $b]);
    }

    public function block(AuthUser $user, string $other, int $now): void
    {
        if ($other === $user->uid || !preg_match('/^[A-Za-z0-9_-]{3,128}$/', $other)) throw new HttpError(400, 'Choose a player.', 'bad-player');
        [$a, $b] = self::pair($user->uid, $other);
        $this->db->transaction(function (Db $db) use ($user, $other, $a, $b, $now) {
            $db->run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', [$a, $b]);
            $db->run('DELETE FROM friend_invites WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)', [$user->uid, $other, $other, $user->uid]);
            if (!$db->one('SELECT 1 AS x FROM blocks WHERE blocker = ? AND blocked = ?', [$user->uid, $other])) {
                $db->run('INSERT INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)', [$user->uid, $other, $now]);
            }
        });
    }

    public function unblock(AuthUser $user, string $other): void
    {
        $this->db->run('DELETE FROM blocks WHERE blocker = ? AND blocked = ?', [$user->uid, $other]);
    }

    /** Invites a friend to the room you are in. */
    public function invite(AuthUser $user, string $to, string $roomCode, int $now): void
    {
        $this->requireAccount($user);
        [$a, $b] = self::pair($user->uid, $to);
        if (!$this->db->one("SELECT 1 AS x FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'", [$a, $b])) {
            throw new HttpError(403, 'You can only invite friends.', 'not-friends');
        }
        $roomCode = strtoupper($roomCode);
        if (!preg_match('/^[A-Z0-9]{4,12}$/', $roomCode)) throw new HttpError(400, 'Open a room first.', 'bad-room');
        $players = $this->rtdb->get('rooms/' . $roomCode . '/players');
        if (!is_array($players) || !isset($players[$user->uid])) throw new HttpError(403, 'Join the room before inviting.', 'not-in-room');
        $this->db->run('DELETE FROM friend_invites WHERE from_uid = ? AND to_uid = ?', [$user->uid, $to]);
        $this->db->run(
            'INSERT INTO friend_invites (id, from_uid, to_uid, room_code, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [newId('i'), $user->uid, $to, $roomCode, $now, $now + self::INVITE_MS]
        );
    }

    public function dismissInvite(AuthUser $user, string $id): void
    {
        $this->db->run('DELETE FROM friend_invites WHERE id = ? AND to_uid = ?', [$id, $user->uid]);
    }

    /** A room game ended: remember who you played with. Only counts if you were in the room. */
    public function played(AuthUser $user, string $roomCode, int $now): int
    {
        $roomCode = strtoupper($roomCode);
        if (!preg_match('/^[A-Z0-9]{4,12}$/', $roomCode)) throw new HttpError(400, 'Bad room.', 'bad-room');
        $players = $this->rtdb->get('rooms/' . $roomCode . '/players');
        if (!is_array($players) || !isset($players[$user->uid])) throw new HttpError(403, 'You were not in that room.', 'not-in-room');
        $game = $this->rtdb->get('rooms/' . $roomCode . '/meta/gameId');
        $game = is_string($game) && preg_match('/^[A-Za-z0-9]{1,40}$/', $game) ? $game : null;
        $n = 0;
        foreach (array_keys($players) as $other) {
            $other = (string) $other;
            if ($other === $user->uid || !preg_match('/^[A-Za-z0-9_-]{3,128}$/', $other)) continue;
            if (!$this->db->run('UPDATE recent_players SET last_played_at = ?, game_id = ? WHERE owner_uid = ? AND other_uid = ?', [$now, $game, $user->uid, $other])) {
                try {
                    $this->db->run('INSERT INTO recent_players (owner_uid, other_uid, game_id, last_played_at) VALUES (?, ?, ?, ?)', [$user->uid, $other, $game, $now]);
                } catch (\PDOException $e) { /* the same game reported twice at once */ }
            }
            $n++;
            if ($n >= 12) break;
        }
        return $n;
    }

    /** Finds players by the start of their username. Real players and crew come back the same way. */
    public function search(string $uid, string $q, int $now): array
    {
        $q = strtolower(trim($q));
        if (!preg_match('/^[a-z0-9_.]{2,20}$/', $q)) return [];
        $uids = [];
        try {
            $found = $this->rtdb->query('usernames', ['orderBy' => '$key', 'startAt' => $q, 'endAt' => $q . "\u{f8ff}", 'limitToFirst' => 10]);
            foreach ((array) $found as $entry) if (is_array($entry) && is_string($entry['uid'] ?? null)) $uids[] = $entry['uid'];
        } catch (\Throwable $e) { /* Firebase is down: crew still come back from MariaDB */ }
        foreach ($this->db->all('SELECT uid FROM crew_players WHERE enabled = 1 AND username LIKE ? LIMIT 10', [$q . '%']) as $r) $uids[] = $r['uid'];
        $out = [];
        foreach (array_unique($uids) as $other) {
            if ($other === $uid || $this->blocked($uid, $other)) continue;
            $p = $this->person($other, $now);
            if (!$p) continue;
            $p['relation'] = $this->relation($uid, $other);
            $out[] = $p;
        }
        usort($out, fn ($a, $b) => strcmp($a['username'], $b['username']));
        return array_slice($out, 0, 10);
    }

    /** A player's public profile. Nothing private, and nothing that tells crew apart. */
    public function profile(string $viewer, string $uid, int $now): array
    {
        if (!preg_match('/^[A-Za-z0-9_-]{3,128}$/', $uid)) throw new HttpError(404, 'Player not found.', 'no-player');
        if ($viewer !== $uid && $this->db->one('SELECT 1 AS x FROM blocks WHERE blocker = ? AND blocked = ?', [$uid, $viewer])) {
            throw new HttpError(404, 'Player not found.', 'no-player');
        }
        $p = $this->person($uid, $now);
        if (!$p) throw new HttpError(404, 'Player not found.', 'no-player');
        $p['relation'] = $viewer === $uid ? 'self' : $this->relation($viewer, $uid);
        return $p;
    }

    /** Crew requests that have run their time quietly go away. */
    public function sweep(int $now): int
    {
        return $this->db->run("DELETE FROM friendships WHERE status = 'pending' AND decline_at IS NOT NULL AND decline_at < ?", [$now]);
    }

    /* ---------- helpers ---------- */

    /** The public card for a player: name, username, avatar, member since, games, online. */
    private function person(string $uid, int $now): ?array
    {
        if (array_key_exists($uid, $this->people)) return $this->people[$uid];
        $crew = $this->crew->byUid($uid);
        if ($crew) {
            if (!$crew['enabled']) return $this->people[$uid] = null;
            $totals = $this->crew->totals($crew['id']);
            return $this->people[$uid] = [
                'uid' => $uid, 'displayName' => $crew['displayName'], 'username' => $crew['username'], 'avatar' => $crew['avatar'],
                'memberSince' => $crew['createdAt'], 'gamesPlayed' => $totals['played'],
                'online' => in_array($crew['status'], ['reserved', 'playing'], true),
            ];
        }
        try {
            $entry = $this->rtdb->get('userIndex/' . $uid);
        } catch (\Throwable $e) {
            $entry = null;
        }
        if (!is_array($entry) || !is_string($entry['displayName'] ?? null)) return $this->people[$uid] = null;
        $seen = $this->db->one('SELECT last_seen FROM presence WHERE uid = ?', [$uid]);
        return $this->people[$uid] = [
            'uid' => $uid, 'displayName' => $entry['displayName'], 'username' => (string) ($entry['username'] ?? ''),
            'avatar' => (string) ($entry['avatar'] ?? ''), 'memberSince' => isset($entry['createdAt']) ? (int) $entry['createdAt'] : null,
            'gamesPlayed' => (int) ($entry['plays'] ?? 0),
            'online' => $seen && (int) $seen['last_seen'] > $now - self::ONLINE_MS,
        ];
    }

    private function relation(string $uid, string $other): string
    {
        if ($this->db->one('SELECT 1 AS x FROM blocks WHERE blocker = ? AND blocked = ?', [$uid, $other])) return 'blocked';
        [$a, $b] = self::pair($uid, $other);
        $row = $this->db->one('SELECT status, requested_by FROM friendships WHERE user_a = ? AND user_b = ?', [$a, $b]);
        if (!$row) return 'none';
        if ($row['status'] === 'accepted') return 'friends';
        return $row['requested_by'] === $uid ? 'sent' : 'incoming';
    }

    private function target(array $body): string
    {
        $uid = (string) ($body['uid'] ?? '');
        if ($uid === '' && isset($body['username'])) {
            $name = strtolower(trim((string) $body['username']));
            if (preg_match('/^[a-z0-9_.]{3,20}$/', $name)) {
                $crew = $this->db->one('SELECT uid FROM crew_players WHERE username = ? AND enabled = 1', [$name]);
                if ($crew) $uid = $crew['uid'];
                else {
                    $entry = $this->rtdb->get('usernames/' . $name);
                    $uid = is_array($entry) ? (string) ($entry['uid'] ?? '') : '';
                }
            }
        }
        if (!preg_match('/^[A-Za-z0-9_-]{3,128}$/', $uid) || !$this->person($uid, nowMs())) throw new HttpError(404, 'Player not found.', 'no-player');
        return $uid;
    }

    private function blocked(string $a, string $b): bool
    {
        return (bool) $this->db->one('SELECT 1 AS x FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)', [$a, $b, $b, $a]);
    }

    private function requireAccount(AuthUser $user): void
    {
        if ($user->isAnonymous()) throw new HttpError(403, 'Create a free account to add friends.', 'guest');
    }

    private static function pair(string $x, string $y): array
    {
        return strcmp($x, $y) < 0 ? [$x, $y] : [$y, $x];
    }
}
