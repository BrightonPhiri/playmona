<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Quick Match. A player opens a room as usual (they are its host) and asks for a match. If
 * another real player is waiting for a compatible game, the newer one joins the older one's
 * room. If nobody comes within the admins' fallback time and the crew rules allow it, crew
 * players are seated in the room instead and the runner plays them.
 *
 * Turning crew off only skips the fallback; pairing real players works the same either way.
 */
class Matchmaker
{
    public const DIFFICULTIES = ['easy', 'normal', 'hard'];
    private const TICKET_STALE_MS = 15_000;   // a waiting phone polls every 2 s
    private const PRESENCE_MS = 60_000;       // "online" for Quick Match purposes

    public function __construct(private Db $db, private RealtimeDb $rtdb, private Crew $crew, private Runner $runner) {}

    /** Joins the queue. Returns the ticket as ticket() does. */
    public function queue(AuthUser $user, bool $isAdmin, array $body, int $now): array
    {
        $game = $body['gameId'] ?? null;
        if ($game === 'any' || $game === '') $game = null;
        if ($game !== null && !in_array($game, Crew::GAMES, true)) throw new HttpError(400, 'That game cannot be played online.', 'bad-game');
        $difficulty = (string) ($body['difficulty'] ?? 'normal');
        if (!in_array($difficulty, self::DIFFICULTIES, true)) throw new HttpError(400, 'Choose easy, normal or hard.', 'bad-difficulty');
        $room = strtoupper((string) ($body['roomCode'] ?? ''));
        if (!preg_match('/^[A-Z0-9]{4,12}$/', $room)) throw new HttpError(400, 'Open a room first.', 'bad-room');
        $meta = $this->rtdb->get('rooms/' . $room . '/meta');
        if (!is_array($meta) || ($meta['hostUid'] ?? null) !== $user->uid) throw new HttpError(403, 'You can only match from a room you host.', 'not-host');
        if (($meta['status'] ?? 'lobby') !== 'lobby') throw new HttpError(409, 'That room is already playing.', 'room-busy');

        $this->touch($user->uid, $now);
        $id = newId('t');
        $this->db->transaction(function (Db $db) use ($user, $game, $difficulty, $room, $now, $id) {
            $db->run("UPDATE match_tickets SET status = 'cancelled' WHERE uid = ? AND status = 'waiting'", [$user->uid]);
            $db->run("UPDATE match_tickets SET status = 'expired' WHERE status = 'waiting' AND last_seen < ?", [$now - self::TICKET_STALE_MS]);

            $partner = null;
            $waiting = $db->all(
                "SELECT * FROM match_tickets WHERE status = 'waiting' AND uid <> ? AND (game_id IS NULL OR ? IS NULL OR game_id = ?)
                 ORDER BY created_at LIMIT 20" . $db->forUpdate(),
                [$user->uid, $game, $game]
            );
            foreach ($waiting as $t) {
                if (!$this->blockedEitherWay($db, $user->uid, $t['uid'])) { $partner = $t; break; }
            }
            if (!$partner) {
                $db->run(
                    "INSERT INTO match_tickets (id, uid, game_id, difficulty, room_code, status, last_seen, created_at) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)",
                    [$id, $user->uid, $game, $difficulty, $room, $now, $now]
                );
                return;
            }
            // The older ticket's room hosts the match; its owner keeps their difficulty.
            $matchGame = $partner['game_id'] ?? $game ?? Crew::GAMES[random_int(0, count(Crew::GAMES) - 1)];
            $matchId = newId('m');
            $db->run(
                "INSERT INTO matches (id, game_id, difficulty, room_code, host_uid, crew_count, status, created_at) VALUES (?, ?, ?, ?, ?, 0, 'active', ?)",
                [$matchId, $matchGame, $partner['difficulty'], $partner['room_code'], $partner['uid'], $now]
            );
            foreach ([$partner['uid'], $user->uid] as $uid) {
                $db->run('INSERT INTO match_seats (match_id, uid, joined_at) VALUES (?, ?, ?)', [$matchId, $uid, $now]);
            }
            $db->run(
                "UPDATE match_tickets SET status = 'matched', match_id = ?, match_room = ?, match_game = ? WHERE id = ?",
                [$matchId, $partner['room_code'], $matchGame, $partner['id']]
            );
            $db->run(
                "INSERT INTO match_tickets (id, uid, game_id, difficulty, room_code, status, match_id, match_room, match_game, last_seen, created_at)
                 VALUES (?, ?, ?, ?, ?, 'matched', ?, ?, ?, ?, ?)",
                [$id, $user->uid, $game, $difficulty, $room, $matchId, $partner['room_code'], $matchGame, $now, $now]
            );
        });
        return $this->ticket($user, $id, $isAdmin, $now);
    }

    /** A waiting phone checks in. Seats crew here once the fallback time has passed. */
    public function ticket(AuthUser $user, string $id, bool $isAdmin, int $now): array
    {
        $t = $this->db->one('SELECT * FROM match_tickets WHERE id = ? AND uid = ?', [$id, $user->uid]);
        if (!$t) throw new HttpError(404, 'That search has ended.', 'no-ticket');
        if ($t['status'] === 'waiting') {
            $this->db->run('UPDATE match_tickets SET last_seen = ? WHERE id = ?', [$now, $id]);
            $this->touch($user->uid, $now);
            if ($this->crewFallback($t, $isAdmin, $now)) {
                $t = $this->db->one('SELECT * FROM match_tickets WHERE id = ?', [$id]);
            }
        }
        return $this->view($t, $now);
    }

    public function cancel(AuthUser $user, string $id): void
    {
        $this->db->run("UPDATE match_tickets SET status = 'cancelled' WHERE id = ? AND uid = ? AND status = 'waiting'", [$id, $user->uid]);
    }

    /** The app is open on this player's phone. One cheap write. */
    public function touch(string $uid, int $now): void
    {
        if ($this->db->run('UPDATE presence SET last_seen = ? WHERE uid = ?', [$now, $uid])) return;
        try {
            $this->db->run('INSERT INTO presence (uid, last_seen) VALUES (?, ?)', [$uid, $now]);
        } catch (\PDOException $e) {
            $this->db->run('UPDATE presence SET last_seen = ? WHERE uid = ?', [$now, $uid]);   // raced with another request
        }
    }

    /** Real players (not $exceptUid) who had the app open in the last minute. */
    public function humansOnline(string $exceptUid, int $now): int
    {
        $row = $this->db->one(
            'SELECT COUNT(*) AS n FROM presence WHERE last_seen > ? AND uid <> ? AND uid NOT IN (SELECT uid FROM crew_players)',
            [$now - self::PRESENCE_MS, $exceptUid]
        );
        return (int) $row['n'];
    }

    /* ---------- crew ---------- */

    private function crewFallback(array $t, bool $isAdmin, int $now): bool
    {
        $s = $this->crew->settings();
        $game = $t['game_id'];
        if ($game === null) {
            $open = array_values(array_filter(Crew::GAMES, fn ($g) => ($s['games'][$g] ?? true) !== false));
            if (!$open) return false;
            $game = $open[random_int(0, count($open) - 1)];
        }
        if (!$this->crew->allowedFor($isAdmin, $game)) return false;
        if ($now - (int) $t['created_at'] < $s['fallbackSeconds'] * 1000) return false;
        if ($s['onlyWhenNoHumans'] && $this->humansOnline($t['uid'], $now) > 0) return false;
        $busy = $this->db->one("SELECT COUNT(*) AS n FROM matches WHERE crew_count > 0 AND status = 'active'");
        if ((int) $busy['n'] >= $s['maxConcurrentMatches']) return false;

        [$lo, $hi] = $s['crewPerMatch'];
        $want = random_int($lo, $hi);
        $seated = $this->seatCrew($t['room_code'], $t['uid'], $game, $t['difficulty'], $want, $now,
            function (Db $db, string $matchId) use ($t, $game) {
                $fresh = $db->one("SELECT status FROM match_tickets WHERE id = ?" . $db->forUpdate(), [$t['id']]);
                if (!$fresh || $fresh['status'] !== 'waiting') return false;
                $db->run(
                    "UPDATE match_tickets SET status = 'matched', match_id = ?, match_room = room_code, match_game = ? WHERE id = ?",
                    [$matchId, $game, $t['id']]
                );
                return true;
            },
            function () use ($t) {
                $this->db->run("UPDATE match_tickets SET status = 'waiting', match_id = NULL, match_room = NULL, match_game = NULL WHERE id = ?", [$t['id']]);
            }
        );
        return (bool) $seated;
    }

    /**
     * Seats up to $count crew players in a room as a match of their own, which the runner plays.
     * Used by the Quick Match fallback and by "Find PlayMona players" in a room.
     * $claim(Db, matchId) runs inside the transaction and may return false to call it all off;
     * $undo() runs if the room could not be written. Returns the players seated ([] for none).
     */
    public function seatCrew(string $room, string $hostUid, string $game, string $difficulty, int $count, int $now, ?callable $claim = null, ?callable $undo = null): array
    {
        if ($count < 1) return [];
        $matchId = newId('m');
        try {
            $seated = $this->db->transaction(function (Db $db) use ($room, $hostUid, $game, $difficulty, $count, $matchId, $now, $claim) {
                $db->run(
                    "INSERT INTO matches (id, game_id, difficulty, room_code, host_uid, crew_count, status, created_at) VALUES (?, ?, ?, ?, ?, 0, 'active', ?)",
                    [$matchId, $game, $difficulty, $room, $hostUid, $now]
                );
                $players = $this->crew->reserve($db, $matchId, $game, $difficulty, $count, $now);
                if (!$players) {
                    $db->run("UPDATE matches SET status = 'failed', ended_at = ? WHERE id = ?", [$now, $matchId]);
                    return [];
                }
                $db->run('INSERT INTO match_seats (match_id, uid, joined_at) VALUES (?, ?, ?)', [$matchId, $hostUid, $now]);
                foreach ($players as $p) {
                    $db->run('INSERT INTO match_seats (match_id, uid, crew_id, joined_at) VALUES (?, ?, ?, ?)', [$matchId, $p['uid'], $p['id'], $now]);
                }
                $db->run('UPDATE matches SET crew_count = ? WHERE id = ?', [count($players), $matchId]);
                if ($claim && !$claim($db, $matchId)) throw new CallOff();
                return $players;
            });
        } catch (CallOff $e) {
            return [];
        }
        if (!$seated) return [];

        // Seat them in the room the way a phone joining would, a moment after the host.
        try {
            $values = [];
            foreach ($seated as $i => $p) {
                $values['players/' . $p['uid']] = [
                    'name' => $p['displayName'], 'avatar' => $p['avatar'], 'color' => $p['color'], 'teamId' => null,
                    'joinedAt' => $now + $i + 1, 'lastSeen' => $now, 'online' => true, 'away' => false,
                ];
            }
            $this->rtdb->update('rooms/' . $room, $values);
            $this->rtdb->set('crewRuns/' . $matchId, [
                'roomCode' => $room, 'gameId' => $game, 'difficulty' => $difficulty,
                'hostUid' => $hostUid, 'createdAt' => $now, 'maxGames' => $this->crew->settings()['maxGamesPerMatch'],
                'crew' => array_combine(array_column($seated, 'uid'), array_map(fn ($p) => $this->crew->runSheet($p), $seated)),
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona Quick Match: could not seat crew: ' . $e->getMessage());
            $this->endMatch($matchId, 'failed', $now);
            if ($undo) $undo();
            return [];
        }
        $this->runner->ensure($now);
        return $seated;
    }

    /* ---------- reports from the runner ---------- */

    /** The runner is alive and still playing these matches. Returns the ones it should drop. */
    public function heartbeat(int $pid, array $matchIds, int $now): array
    {
        $matchIds = array_values(array_filter($matchIds, 'is_string'));
        $this->runner->beat($pid, $matchIds, $now);
        $this->crew->renew($matchIds, $now);
        foreach ($this->crew->sweep($now) as $stale) $this->endMatch($stale, 'cancelled', $now);
        if (!$matchIds) return [];
        $marks = implode(',', array_fill(0, count($matchIds), '?'));
        $live = array_column($this->db->all("SELECT id FROM matches WHERE status = 'active' AND id IN ($marks)", $matchIds), 'id');
        return array_values(array_diff($matchIds, $live));
    }

    /**
     * A game in the match ended: records the crew's results. $ranked is meta.results.ranked
     * from the room ([{uid, points}], best first). Returns whether the crew stay for another game.
     */
    public function gameEnded(string $matchId, string $gameId, array $ranked, int $now): bool
    {
        $match = $this->db->one("SELECT * FROM matches WHERE id = ? AND status = 'active'", [$matchId]);
        if (!$match) return false;
        $points = [];
        foreach ($ranked as $r) {
            if (is_array($r) && is_string($r['uid'] ?? null)) $points[$r['uid']] = (int) ($r['points'] ?? 0);
        }
        $places = self::places($points);
        $top = $points ? max($points) : 0;
        $tiedTop = count(array_filter($points, fn ($p) => $p === $top)) > 1;
        foreach ($this->db->all('SELECT uid, crew_id FROM match_seats WHERE match_id = ?', [$matchId]) as $seat) {
            if (!array_key_exists($seat['uid'], $points)) continue;
            $this->db->run('UPDATE match_seats SET place = ?, score = ? WHERE match_id = ? AND uid = ?', [$places[$seat['uid']], $points[$seat['uid']], $matchId, $seat['uid']]);
            if ($seat['crew_id']) {
                $outcome = $places[$seat['uid']] === 1 ? ($tiedTop ? 'draw' : 'win') : 'loss';
                $this->crew->recordResult($seat['crew_id'], $gameId, $outcome, $points[$seat['uid']], $now);
            }
        }
        $this->db->run('UPDATE matches SET games_played = games_played + 1, started_at = COALESCE(started_at, ?) WHERE id = ?', [$now, $matchId]);
        $played = (int) $match['games_played'] + 1;
        if ($played >= $this->crew->settings()['maxGamesPerMatch']) {
            $this->endMatch($matchId, 'ended', $now);
            return false;
        }
        return true;
    }

    /** Ends a match: frees its crew, takes them out of the room and stops the runner playing it. */
    public function endMatch(string $matchId, string $status, int $now): void
    {
        $match = $this->db->one('SELECT * FROM matches WHERE id = ?', [$matchId]);
        if (!$match) return;
        if ($match['status'] === 'active') {
            $this->db->run('UPDATE matches SET status = ?, ended_at = ? WHERE id = ?', [$status, $now, $matchId]);
        }
        $uids = $this->crew->release($matchId, $now);
        $crewSeats = array_column($this->db->all('SELECT uid FROM match_seats WHERE match_id = ? AND crew_id IS NOT NULL', [$matchId]), 'uid');
        try {
            $gone = [];
            foreach (array_unique(array_merge($uids, $crewSeats)) as $uid) $gone['players/' . $uid] = null;
            if ($gone) $this->rtdb->update('rooms/' . $match['room_code'], $gone);
            $this->rtdb->set('crewRuns/' . $matchId, null);
        } catch (\Throwable $e) {
            error_log('PlayMona Quick Match: could not clear match ' . $matchId . ': ' . $e->getMessage());
        }
    }

    /** Matches with crew in them, for the admin portal. */
    public function activeCrewMatches(): array
    {
        $rows = $this->db->all("SELECT * FROM matches WHERE crew_count > 0 AND status = 'active' ORDER BY created_at DESC LIMIT 100");
        return array_map(fn ($m) => [
            'id' => $m['id'], 'gameId' => $m['game_id'], 'difficulty' => $m['difficulty'], 'roomCode' => $m['room_code'],
            'hostUid' => $m['host_uid'], 'crew' => (int) $m['crew_count'], 'gamesPlayed' => (int) $m['games_played'],
            'createdAt' => (int) $m['created_at'],
        ], $rows);
    }

    /* ---------- helpers ---------- */

    private function view(array $t, int $now): array
    {
        $out = ['ticket' => $t['id'], 'status' => $t['status'], 'waitedMs' => $now - (int) $t['created_at']];
        if ($t['status'] === 'matched') {
            $out['roomCode'] = $t['match_room'];
            $out['gameId'] = $t['match_game'];
            $out['host'] = $t['match_room'] === $t['room_code'];
        }
        return $out;
    }

    private function blockedEitherWay(Db $db, string $a, string $b): bool
    {
        return (bool) $db->one('SELECT 1 AS x FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)', [$a, $b, $b, $a]);
    }

    /** Places by points, ties sharing a place and the next skipped (1, 1, 3), as RaceRules does. */
    public static function places(array $points): array
    {
        $out = [];
        foreach ($points as $uid => $p) {
            $out[$uid] = 1 + count(array_filter($points, fn ($q) => $q > $p));
        }
        return $out;
    }
}

/** Thrown inside seatCrew's transaction when the caller's claim fails, so it all rolls back. */
final class CallOff extends \RuntimeException {}
