<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * SortRush: everyone gets the same colour-sort puzzle (in Timed Score, the same run of
 * puzzles) and races to sort it, or to score the most before time runs out.
 *
 * Like Ball Swap, the server starts it instead of the host's phone: start() checks the caller
 * hosts the room, that everyone there said ready, the player count and settings, and hands the
 * match to the referee in the crew runner through sortrushRuns/<matchId>, which only the server
 * can read. The referee (js/sortrush/referee.js) picks the puzzle seed with the server's random,
 * checks every move with the shared rules, scores, and decides the winner, so no phone can
 * claim a result it did not earn.
 *
 * The settings lists are the same as FF.SortRushRules; so is the levels table.
 */
class SortRush
{
    public const GAME = 'sortRush';
    public const MIN_PLAYERS = 2;
    public const MAX_PLAYERS = 8;
    public const COUNTDOWN_MS = 10_000;        // as FF.Room's countdown
    private const PRESENCE_STALE_MS = 20_000;  // as FF.Room's presence
    private const ROOM_TTL_MS = 30 * 24 * 3600 * 1000;
    private const NUDGE_AFTER_MS = 6_000;      // this late means the referee is not running

    public const MODES = ['race', 'score'];
    public const STYLES = ['nuts', 'balls', 'rings', 'blocks'];
    public const MOVES = ['single', 'group'];
    public const LEVELS = ['easy', 'medium', 'hard', 'expert', 'custom'];
    public const PRESETS = [
        'easy' => [4, 3, 2], 'medium' => [6, 4, 2], 'hard' => [8, 4, 2], 'expert' => [10, 5, 2],
    ];
    public const COLOURS = [3, 4, 5, 6, 7, 8, 9, 10];
    public const SIZES = [3, 4, 5, 6];
    public const EMPTIES = [1, 2, 3];
    public const SECONDS = [60, 90, 120, 180, 300];
    public const LIMITS = ['off', 'relaxed', 'tight'];
    private const MAX_HOLDERS = 12;
    private const ONE_EMPTY_MAX = 24;

    public function __construct(private Db $db, private RealtimeDb $rtdb, private Runner $runner) {}

    /** Checks the host's settings strictly, then fixes the board as FF.SortRushRules.sanitize does. */
    public static function settings(array $raw): array
    {
        $want = fn (string $key, array $allowed, mixed $default) => self::allowed($raw, $key, $allowed, $default);
        $s = [
            'mode' => $want('mode', self::MODES, 'race'),
            'style' => $want('style', self::STYLES, 'balls'),
            'move' => $want('move', self::MOVES, 'group'),
            'level' => $want('level', self::LEVELS, 'medium'),
            'colours' => $want('colours', self::COLOURS, 6),
            'size' => $want('size', self::SIZES, 4),
            'empty' => $want('empty', self::EMPTIES, 2),
            'seconds' => $want('seconds', self::SECONDS, 120),
            'limit' => $want('limit', self::LIMITS, 'off'),
        ];
        if ($s['level'] !== 'custom') {
            [$s['colours'], $s['size'], $s['empty']] = self::PRESETS[$s['level']];
        }
        if ($s['empty'] === 1 && $s['colours'] * $s['size'] > self::ONE_EMPTY_MAX) $s['empty'] = 2;
        if ($s['colours'] + $s['empty'] > self::MAX_HOLDERS) $s['empty'] = max(1, self::MAX_HOLDERS - $s['colours']);
        return $s;
    }

    private static function allowed(array $raw, string $key, array $allowed, mixed $default): mixed
    {
        if (!array_key_exists($key, $raw) || $raw[$key] === null) return $default;
        $v = $raw[$key];
        if (is_int($allowed[0]) && is_numeric($v) && (int) $v == $v) $v = (int) $v;
        if (!in_array($v, $allowed, true)) throw new HttpError(400, 'Those settings are not available.', 'bad-settings');
        return $v;
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
            throw new HttpError(409, 'Pick SortRush and do the ready check first.', 'no-pick');
        }

        $present = $this->present((array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []), $now);
        $n = count($present);
        if ($n < self::MIN_PLAYERS) throw new HttpError(409, 'SortRush online needs at least 2 players.', 'too-few');
        if ($n > self::MAX_PLAYERS) throw new HttpError(409, 'SortRush takes at most 8 players.', 'too-many');
        foreach ($present as $p) {
            if (($p['ready'] ?? null) !== $pick['id']) throw new HttpError(409, 'Not everyone is ready yet.', 'not-ready');
        }

        $settings = self::settings(is_array($body['settings'] ?? null) ? $body['settings'] : (array) ($pick['settings'] ?? []));
        $seats = array_map('strval', array_keys($present));
        $matchId = newId('s');
        $startAt = $now + self::COUNTDOWN_MS;
        $seed = bin2hex(random_bytes(10));

        $this->db->run(
            "INSERT INTO sortrush_matches (id, room_code, host_uid, mode, style, move_rule, level, colours, size, empties, seconds, move_limit, players, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)",
            [$matchId, $room, $user->uid, $settings['mode'], $settings['style'], $settings['move'], $settings['level'], $settings['colours'],
                $settings['size'], $settings['empty'], $settings['seconds'], $settings['limit'], $n, $now]
        );
        try {
            $this->rtdb->set('sortrushRuns/' . $matchId, [
                'matchId' => $matchId, 'roomCode' => $room, 'hostUid' => $user->uid, 'seats' => $seats,
                'settings' => $settings, 'startAt' => $startAt, 'seed' => $seed, 'createdAt' => $now,
            ]);
            // As FF.Room.startGame, plus the match id phones use to know the view is this game's.
            $this->rtdb->update('rooms/' . $room, [
                'rounds' => null, 'sr' => null, 'srInbox' => null,
                'meta/seed' => bin2hex(random_bytes(8)), 'meta/gameId' => self::GAME, 'meta/status' => 'playing',
                'meta/startAt' => $startAt, 'meta/endedAt' => null, 'meta/results' => null, 'meta/pick' => null,
                'meta/expiresAt' => $now + self::ROOM_TTL_MS, 'meta/settings' => $settings, 'meta/srMatch' => $matchId,
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona SortRush: could not start ' . $matchId . ': ' . $e->getMessage());
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
        $matchId = is_array($meta) ? (string) ($meta['srMatch'] ?? '') : '';
        if ($matchId === '' || ($meta['status'] ?? '') !== 'playing') return ['ok' => true, 'started' => false];
        $players = (array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []);
        if (!array_key_exists($user->uid, $players)) throw new HttpError(403, 'You are not in that room.', 'not-in-room');
        $match = $this->db->one('SELECT status FROM sortrush_matches WHERE id = ?', [$matchId]);
        if (!$match || $match['status'] !== 'active') return ['ok' => true, 'started' => false];
        $sr = $this->rtdb->get('rooms/' . $room . '/sr');
        if (!is_array($sr)) {
            $late = $now > (int) ($meta['startAt'] ?? 0) - self::COUNTDOWN_MS + self::NUDGE_AFTER_MS;
        } else {
            $phase = (string) ($sr['phase'] ?? '');
            $close = (int) ($sr['deadline'] ?? 0);
            if ((int) ($sr['closeAt'] ?? 0) > 0) $close = min($close, (int) $sr['closeAt']);
            $due = $phase === 'starting' ? (int) ($sr['openAt'] ?? $sr['startAt'] ?? 0) : $close;
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
            $m = $db->one('SELECT status FROM sortrush_matches WHERE id = ?' . $db->forUpdate(), [$matchId]);
            if (!$m || $m['status'] !== 'active') return false;
            $winners = array_values(array_map(fn ($s) => $s['uid'], array_filter($seats, fn ($s) => !empty($s['won']))));
            $db->run(
                "UPDATE sortrush_matches SET status = 'ended', winner_uid = ?, is_draw = ?, ended_at = ? WHERE id = ?",
                [count($winners) === 1 ? $winners[0] : null, count($winners) > 1 ? 1 : 0, $now, $matchId]
            );
            foreach ($seats as $s) {
                $db->run(
                    'INSERT INTO sortrush_seats (match_id, uid, place, moves, finished, out_of_moves, used_ms, score, cleared, completed, points, won) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$matchId, $s['uid'], max(0, (int) ($s['place'] ?? 0)), max(0, (int) ($s['moves'] ?? 0)),
                        !empty($s['done']) ? 1 : 0, !empty($s['out']) ? 1 : 0, max(0, (int) ($s['used'] ?? 0)),
                        max(0, (int) ($s['score'] ?? 0)), max(0, (int) ($s['cleared'] ?? 0)), max(0, (int) ($s['completed'] ?? 0)),
                        max(0, (int) ($s['points'] ?? 0)), !empty($s['won']) ? 1 : 0]
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
        $live = array_column($this->db->all("SELECT id FROM sortrush_matches WHERE status = 'active' AND id IN ($marks)", $matchIds), 'id');
        return array_values(array_diff($matchIds, $live));
    }

    /** Matches nobody finished within a day: end them so the runner lets go. */
    public function sweep(int $now): int
    {
        $old = $this->db->all("SELECT id FROM sortrush_matches WHERE status = 'active' AND created_at < ?", [$now - 24 * 3600 * 1000]);
        foreach ($old as $m) $this->end($m['id'], 'abandoned', $now);
        return count($old);
    }

    public function end(string $matchId, string $status, int $now): void
    {
        $this->db->run("UPDATE sortrush_matches SET status = ?, ended_at = ? WHERE id = ? AND status = 'active'", [$status, $now, $matchId]);
        $this->clearRun($matchId);
    }

    /* ---------- helpers ---------- */

    private function clearRun(string $matchId): void
    {
        try {
            $this->rtdb->set('sortrushRuns/' . $matchId, null);
            $this->rtdb->set('sortrushState/' . $matchId, null);
        } catch (\Throwable $e) {
            error_log('PlayMona SortRush: could not clear ' . $matchId . ': ' . $e->getMessage());
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
