<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Number Challenge online Race: everyone gets the same sums (Quick sums, Chain, Make the target)
 * or the same list (Sprint) and races to answer.
 *
 * Like Say What?, the server starts it instead of the host's phone: start() checks the caller
 * hosts the room, that everyone there said ready, the player count and settings, and hands the
 * match to the referee in the crew runner through numberchallengeRuns/<matchId>, which only the
 * server can read. The referee (js/numberchallenge/referee.js) deals the sums from a secret seed,
 * publishes one at a time (a chain's choices only once its steps are done), judges every answer,
 * times it by the database clock and scores it, so no phone can claim a result it did not earn.
 *
 * The settings lists are the same as FF.NumberChallengeRules (rooms: every mode and level, always a clock).
 */
class NumberChallenge
{
    public const GAME = 'numberChallenge';
    public const MIN_PLAYERS = 2;
    public const MAX_PLAYERS = 8;
    public const COUNTDOWN_MS = 10_000;        // as FF.Room's countdown
    private const PRESENCE_STALE_MS = 20_000;  // as FF.Room's presence
    private const ROOM_TTL_MS = 30 * 24 * 3600 * 1000;
    private const NUDGE_AFTER_MS = 6_000;      // this late means the referee is not running

    public const MODES = ['quick', 'sprint', 'chain', 'target'];
    public const LEVELS = ['easy', 'normal', 'hard', 'expert'];
    public const TIMES = ['quick', 'normal', 'relaxed'];
    public const ROUNDS = ['quick' => [10, 15, 20], 'chain' => [5, 8, 10], 'target' => [3, 5, 8]];
    public const ROUNDS_DEFAULT = ['quick' => 10, 'chain' => 5, 'target' => 5, 'sprint' => 1];
    public const SPRINTS = [30, 60, 90];
    public const SPEEDS = ['steady', 'fast'];

    public function __construct(private Db $db, private RealtimeDb $rtdb, private Runner $runner) {}

    /** Checks the host's settings strictly (as FF.NumberChallengeRules.sanitizeRoom, but refusing unknown values). */
    public static function settings(array $raw): array
    {
        $mode = self::allowed($raw, 'mode', self::MODES, 'quick');
        // A Sprint is one long round: its length is the sprint seconds, so rounds can only be 1.
        $rounds = self::allowed($raw, 'rounds', self::ROUNDS[$mode] ?? [self::ROUNDS_DEFAULT[$mode]], self::ROUNDS_DEFAULT[$mode]);
        return [
            'mode' => $mode,
            'level' => self::allowed($raw, 'level', self::LEVELS, 'normal'),
            'time' => self::allowed($raw, 'time', self::TIMES, 'normal'),
            'rounds' => $rounds,
            'sprint' => self::allowed($raw, 'sprint', self::SPRINTS, 60),
            'speed' => self::allowed($raw, 'speed', self::SPEEDS, 'steady'),
        ];
    }

    private static function allowed(array $raw, string $key, array $allowed, mixed $default): mixed
    {
        if (!array_key_exists($key, $raw) || $raw[$key] === null) return $default;
        $v = $raw[$key];
        if (is_int($allowed[0]) && is_numeric($v) && (int) $v == $v) $v = (int) $v;
        if (!in_array($v, $allowed, true)) self::bad();
        return $v;
    }

    private static function bad(): never
    {
        throw new HttpError(400, 'Those settings are not available.', 'bad-settings');
    }

    /* ---------- starting a match ---------- */

    /** The host's phone asks to start. Returns the match id and when the countdown ends. */
    public function start(AuthUser $user, array $body, int $now): array
    {
        $room = $this->roomCode($body);
        $meta = $this->rtdb->get('rooms/' . $room . '/meta');
        if (!is_array($meta) || ($meta['hostUid'] ?? null) !== $user->uid) throw new HttpError(403, 'Only the room host can start the game.', 'not-host');
        if (($meta['status'] ?? 'lobby') !== 'lobby') throw new HttpError(409, 'That room is already playing.', 'room-busy');
        $pick = is_array($meta['pick'] ?? null) ? $meta['pick'] : null;
        if (!$pick || ($pick['gameId'] ?? null) !== self::GAME || !is_string($pick['id'] ?? null)) {
            throw new HttpError(409, 'Pick Number Challenge and do the ready check first.', 'no-pick');
        }

        $present = $this->present((array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []), $now);
        $n = count($present);
        if ($n < self::MIN_PLAYERS) throw new HttpError(409, 'Number Challenge online needs at least 2 players.', 'too-few');
        if ($n > self::MAX_PLAYERS) throw new HttpError(409, 'Number Challenge takes at most 8 players.', 'too-many');
        foreach ($present as $p) {
            if (($p['ready'] ?? null) !== $pick['id']) throw new HttpError(409, 'Not everyone is ready yet.', 'not-ready');
        }

        $settings = self::settings(is_array($body['settings'] ?? null) ? $body['settings'] : (array) ($pick['settings'] ?? []));
        $seats = array_map('strval', array_keys($present));
        $matchId = newId('n');
        $startAt = $now + self::COUNTDOWN_MS;
        $seed = bin2hex(random_bytes(12));

        $this->db->run(
            "INSERT INTO numberchallenge_matches (id, room_code, host_uid, mode, level, rounds, players, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
            [$matchId, $room, $user->uid, $settings['mode'], $settings['level'], $settings['rounds'], $n, $now]
        );
        try {
            $this->rtdb->set('numberchallengeRuns/' . $matchId, [
                'matchId' => $matchId, 'roomCode' => $room, 'hostUid' => $user->uid, 'seats' => $seats,
                'settings' => $settings, 'startAt' => $startAt, 'seed' => $seed, 'createdAt' => $now,
            ]);
            // As FF.Room.startGame, plus the match id phones use to know the view is this game's.
            $this->rtdb->update('rooms/' . $room, [
                'rounds' => null, 'nc' => null, 'ncInbox' => null,
                'meta/seed' => bin2hex(random_bytes(8)), 'meta/gameId' => self::GAME, 'meta/status' => 'playing',
                'meta/startAt' => $startAt, 'meta/endedAt' => null, 'meta/results' => null, 'meta/pick' => null,
                'meta/expiresAt' => $now + self::ROOM_TTL_MS, 'meta/settings' => $settings, 'meta/ncMatch' => $matchId,
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona Number Challenge: could not start ' . $matchId . ': ' . $e->getMessage());
            $this->end($matchId, 'failed', $now);
            throw new HttpError(503, 'The game could not be started. Please try again.', 'start-failed');
        }
        $this->runner->ensure($now);
        return ['matchId' => $matchId, 'startAt' => $startAt, 'settings' => $settings, 'players' => $n];
    }

    /** A phone sees the game stuck: start the runner if it is not running. */
    public function nudge(AuthUser $user, array $body, int $now): array
    {
        $room = $this->roomCode($body);
        $meta = $this->rtdb->get('rooms/' . $room . '/meta');
        $matchId = is_array($meta) ? (string) ($meta['ncMatch'] ?? '') : '';
        if ($matchId === '' || ($meta['status'] ?? '') !== 'playing') return ['ok' => true, 'started' => false];
        $players = (array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []);
        if (!array_key_exists($user->uid, $players)) throw new HttpError(403, 'You are not in that room.', 'not-in-room');
        $match = $this->db->one('SELECT status FROM numberchallenge_matches WHERE id = ?', [$matchId]);
        if (!$match || $match['status'] !== 'active') return ['ok' => true, 'started' => false];
        $nc = $this->rtdb->get('rooms/' . $room . '/nc');
        if (!is_array($nc)) {
            $late = $now > (int) ($meta['startAt'] ?? 0) - self::COUNTDOWN_MS + self::NUDGE_AFTER_MS;
        } else {
            $phase = (string) ($nc['phase'] ?? '');
            $due = match ($phase) {
                'starting' => (int) ($nc['readyAt'] ?? 0),
                'ready', 'steps' => (int) ($nc['openAt'] ?? 0),
                'open' => (int) ($nc['closeAt'] ?? 0),
                'reveal' => (int) ($nc['nextAt'] ?? 0),
                default => PHP_INT_MAX - self::NUDGE_AFTER_MS,
            };
            $late = $phase !== 'ended' && $now > $due + self::NUDGE_AFTER_MS;
        }
        return ['ok' => true, 'started' => $late && $this->runner->ensure($now)];
    }

    /* ---------- reports from the referee ---------- */

    /** A match finished: keep the result and each seat's record. Repeats change nothing. */
    public function recordResult(array $r, int $now): void
    {
        $matchId = (string) ($r['matchId'] ?? '');
        $seats = array_values(array_filter((array) ($r['seats'] ?? []), fn ($s) => is_array($s) && is_string($s['uid'] ?? null)));
        $done = $this->db->transaction(function (Db $db) use ($matchId, $seats, $now) {
            $m = $db->one('SELECT status FROM numberchallenge_matches WHERE id = ?' . $db->forUpdate(), [$matchId]);
            if (!$m || $m['status'] !== 'active') return false;
            $winners = array_values(array_map(fn ($s) => $s['uid'], array_filter($seats, fn ($s) => !empty($s['won']))));
            $db->run(
                "UPDATE numberchallenge_matches SET status = 'ended', winner_uid = ?, is_draw = ?, ended_at = ? WHERE id = ?",
                [count($winners) === 1 ? $winners[0] : null, count($winners) > 1 ? 1 : 0, $now, $matchId]
            );
            foreach ($seats as $s) {
                $db->run(
                    'INSERT INTO numberchallenge_seats (match_id, uid, place, points, correct, best_streak, won) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$matchId, $s['uid'], max(0, (int) ($s['place'] ?? 0)), max(0, (int) ($s['points'] ?? 0)),
                        max(0, (int) ($s['correct'] ?? 0)), max(0, (int) ($s['best'] ?? 0)), !empty($s['won']) ? 1 : 0]
                );
            }
            return true;
        });
        if ($done) $this->clearRun($matchId);
    }

    /** The runner is refereeing these matches; returns the ones it should drop. */
    public function stillActive(array $matchIds): array
    {
        $matchIds = array_values(array_filter($matchIds, 'is_string'));
        if (!$matchIds) return [];
        $marks = implode(',', array_fill(0, count($matchIds), '?'));
        $live = array_column($this->db->all("SELECT id FROM numberchallenge_matches WHERE status = 'active' AND id IN ($marks)", $matchIds), 'id');
        return array_values(array_diff($matchIds, $live));
    }

    /** Matches nobody finished within a day: end them so the runner lets go. */
    public function sweep(int $now): int
    {
        $old = $this->db->all("SELECT id FROM numberchallenge_matches WHERE status = 'active' AND created_at < ?", [$now - 24 * 3600 * 1000]);
        foreach ($old as $m) $this->end($m['id'], 'abandoned', $now);
        return count($old);
    }

    public function end(string $matchId, string $status, int $now): void
    {
        $this->db->run("UPDATE numberchallenge_matches SET status = ?, ended_at = ? WHERE id = ? AND status = 'active'", [$status, $now, $matchId]);
        $this->clearRun($matchId);
    }

    /* ---------- helpers ---------- */

    private function clearRun(string $matchId): void
    {
        try {
            $this->rtdb->set('numberchallengeRuns/' . $matchId, null);
            $this->rtdb->set('numberchallengeState/' . $matchId, null);
        } catch (\Throwable $e) {
            error_log('PlayMona Number Challenge: could not clear ' . $matchId . ': ' . $e->getMessage());
        }
    }

    private function roomCode(array $body): string
    {
        $room = strtoupper((string) ($body['roomCode'] ?? ''));
        if (!preg_match('/^[A-Z0-9]{4,12}$/', $room)) throw new HttpError(400, 'Open a room first.', 'bad-room');
        return $room;
    }

    /** Players in the room now, as FF.Room.presentPlayers counts them. */
    private function present(array $players, int $now): array
    {
        return array_filter($players, function ($p) use ($now) {
            if (!is_array($p) || ($p['online'] ?? null) === false) return false;
            $seen = $p['lastSeen'] ?? null;
            return $seen === null || $now - (int) $seen <= self::PRESENCE_STALE_MS;
        });
    }
}
