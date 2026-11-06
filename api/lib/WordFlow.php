<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * WordFlow: players take turns adding one word each to shared sentences (or one shared story).
 *
 * Like Imposters, the server starts it instead of the host's phone: start() checks the caller
 * hosts the room, that everyone there said ready, the player count and settings, and hands the
 * match to the referee in the crew runner through wordflowRuns/<matchId>, which only the server
 * can read. The referee (js/wordflow/referee.js) runs the turns, the clocks and the scoring, and
 * asks judge() (WordFlowJudge) whether each finished sentence makes sense.
 *
 * The settings lists are the same as FF.WordFlowRules.
 */
class WordFlow
{
    public const GAME = 'wordFlow';
    public const MIN_PLAYERS = 2;
    public const MAX_PLAYERS = 12;
    public const COUNTDOWN_MS = 10_000;        // as FF.Room's countdown
    private const PRESENCE_STALE_MS = 20_000;  // as FF.Room's presence
    private const ROOM_TTL_MS = 30 * 24 * 3600 * 1000;
    private const NUDGE_AFTER_MS = 6_000;      // a turn this late means the referee is not running

    public const MODES = ['sentences', 'story'];
    public const GAME_SECONDS = [120, 180, 300];
    public const TURN_SECONDS = [10, 20, 30];
    public const DIFFICULTIES = ['easy', 'normal', 'hard'];

    public function __construct(private Db $db, private RealtimeDb $rtdb, private Matchmaker $matchmaker, private Crew $crew, private Runner $runner) {}

    /** Checks the host's settings strictly. */
    public static function settings(array $raw): array
    {
        $want = fn (string $key, array $allowed, mixed $default) => self::allowed($raw, $key, $allowed, $default);
        return [
            'mode' => $want('mode', self::MODES, 'sentences'),
            'gameSeconds' => $want('gameSeconds', self::GAME_SECONDS, 180),
            'turnSeconds' => $want('turnSeconds', self::TURN_SECONDS, 20),
        ];
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
            throw new HttpError(409, 'Pick WordFlow and do the ready check first.', 'no-pick');
        }

        $present = $this->present((array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []), $now);
        $n = count($present);
        if ($n < self::MIN_PLAYERS) throw new HttpError(409, 'WordFlow needs at least 2 players.', 'too-few');
        if ($n > self::MAX_PLAYERS) throw new HttpError(409, 'WordFlow takes at most 12 players.', 'too-many');
        foreach ($present as $p) {
            if (($p['ready'] ?? null) !== $pick['id']) throw new HttpError(409, 'Not everyone is ready yet.', 'not-ready');
        }

        $settings = self::settings(is_array($body['settings'] ?? null) ? $body['settings'] : (array) ($pick['settings'] ?? []));
        $seats = array_map('strval', array_keys($present));
        $crewUids = $this->crewUids($seats);
        $matchId = newId('w');
        $startAt = $now + self::COUNTDOWN_MS;

        $this->db->run(
            "INSERT INTO wordflow_matches (id, room_code, host_uid, mode, game_seconds, turn_seconds, players, status, ai_words, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)",
            [$matchId, $room, $user->uid, $settings['mode'], $settings['gameSeconds'], $settings['turnSeconds'], $n, $now]
        );
        try {
            $this->rtdb->set('wordflowRuns/' . $matchId, [
                'matchId' => $matchId, 'roomCode' => $room, 'hostUid' => $user->uid, 'seats' => $seats,
                'crew' => $crewUids ? array_fill_keys($crewUids, true) : null,
                'settings' => $settings, 'startAt' => $startAt, 'createdAt' => $now,
            ]);
            // As FF.Room.startGame, plus the match id phones use to know the view is this game's.
            $this->rtdb->update('rooms/' . $room, [
                'rounds' => null, 'wf' => null, 'wfInbox' => null,
                'meta/seed' => bin2hex(random_bytes(8)), 'meta/gameId' => self::GAME, 'meta/status' => 'playing',
                'meta/startAt' => $startAt, 'meta/endedAt' => null, 'meta/results' => null, 'meta/pick' => null,
                'meta/expiresAt' => $now + self::ROOM_TTL_MS, 'meta/settings' => $settings, 'meta/wfMatch' => $matchId,
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona WordFlow: could not start ' . $matchId . ': ' . $e->getMessage());
            $this->end($matchId, 'failed', $now);
            throw new HttpError(503, 'The game could not be started. Please try again.', 'start-failed');
        }
        $this->runner->ensure($now);
        return ['matchId' => $matchId, 'startAt' => $startAt, 'settings' => $settings, 'players' => $n];
    }

    /** "Find PlayMona players": crew fill the room up to 4 players, or one more after that. */
    public function findPlayers(AuthUser $user, bool $isAdmin, array $body, int $now): array
    {
        $room = $this->roomCode($body);
        $meta = $this->rtdb->get('rooms/' . $room . '/meta');
        if (!is_array($meta) || ($meta['hostUid'] ?? null) !== $user->uid) throw new HttpError(403, 'Only the room host can add players.', 'not-host');
        if (($meta['status'] ?? 'lobby') !== 'lobby') throw new HttpError(409, 'That room is already playing.', 'room-busy');
        if (!$this->crew->allowedFor($isAdmin, self::GAME)) throw new HttpError(403, 'PlayMona players are not available right now.', 'no-crew');
        $n = count($this->present((array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []), $now));
        if ($n >= self::MAX_PLAYERS) throw new HttpError(409, 'The room is full.', 'room-full');
        $want = $n < 4 ? 4 - $n : 1;
        $difficulty = in_array($body['difficulty'] ?? null, self::DIFFICULTIES, true) ? $body['difficulty'] : 'normal';
        $seated = $this->matchmaker->seatCrew($room, $user->uid, self::GAME, $difficulty, min($want, self::MAX_PLAYERS - $n), $now);
        if (!$seated) throw new HttpError(409, 'Nobody is free to play right now. Try again in a minute.', 'none-free');
        return ['added' => array_map(fn ($p) => ['uid' => $p['uid'], 'name' => $p['displayName']], $seated)];
    }

    /** A phone sees the game stuck: start the runner if it is not running. */
    public function nudge(AuthUser $user, array $body, int $now): array
    {
        $room = $this->roomCode($body);
        $meta = $this->rtdb->get('rooms/' . $room . '/meta');
        $matchId = is_array($meta) ? (string) ($meta['wfMatch'] ?? '') : '';
        if ($matchId === '' || ($meta['status'] ?? '') !== 'playing') return ['ok' => true, 'started' => false];
        $players = (array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []);
        if (!array_key_exists($user->uid, $players)) throw new HttpError(403, 'You are not in that room.', 'not-in-room');
        $match = $this->db->one('SELECT status FROM wordflow_matches WHERE id = ?', [$matchId]);
        if (!$match || $match['status'] !== 'active') return ['ok' => true, 'started' => false];
        $wf = $this->rtdb->get('rooms/' . $room . '/wf');
        if (!is_array($wf)) {
            $late = $now > (int) ($meta['startAt'] ?? 0);
        } else {
            $phase = (string) ($wf['phase'] ?? '');
            $due = $phase === 'starting' ? (int) ($wf['startAt'] ?? 0)
                : ($phase === 'judging' ? (int) ($wf['wrapDeadline'] ?? 0) : min((int) ($wf['turnDeadline'] ?? 0), (int) ($wf['gameDeadline'] ?? 0)));
            $late = $phase !== 'ended' && $now > $due + self::NUDGE_AFTER_MS;
        }
        return ['ok' => true, 'started' => $late && $this->runner->ensure($now)];
    }

    /** The runner may only spend AI calls on matches that are still being played. */
    public function isActive(string $matchId): bool
    {
        $m = $this->db->one('SELECT status FROM wordflow_matches WHERE id = ?', [$matchId]);
        return $m !== null && $m['status'] === 'active';
    }

    /** Counts one crew word asked of the AI; false once the match has used its share. */
    public function spendAiWord(string $matchId, int $cap): bool
    {
        return $this->db->transaction(function (Db $db) use ($matchId, $cap) {
            $m = $db->one('SELECT status, ai_words FROM wordflow_matches WHERE id = ?' . $db->forUpdate(), [$matchId]);
            if (!$m || $m['status'] !== 'active' || (int) $m['ai_words'] >= $cap) return false;
            $db->run('UPDATE wordflow_matches SET ai_words = ai_words + 1 WHERE id = ?', [$matchId]);
            return true;
        });
    }

    /* ---------- reports from the referee ---------- */

    /** A match finished: keep the result and each seat's record. Repeats change nothing. */
    public function recordResult(array $r, int $now): void
    {
        $matchId = (string) ($r['matchId'] ?? '');
        $seats = array_values(array_filter((array) ($r['seats'] ?? []), fn ($s) => is_array($s) && is_string($s['uid'] ?? null)));
        // Crew records (crew_stats) come from the crew controller's own game report, not from here.
        $done = $this->db->transaction(function (Db $db) use ($matchId, $r, $seats, $now) {
            $m = $db->one('SELECT status FROM wordflow_matches WHERE id = ?' . $db->forUpdate(), [$matchId]);
            if (!$m || $m['status'] !== 'active') return false;
            $db->run(
                "UPDATE wordflow_matches SET status = 'ended', sentences_accepted = ?, sentences_rejected = ?, total_words = ?, ended_at = ? WHERE id = ?",
                [max(0, (int) ($r['accepted'] ?? 0)), max(0, (int) ($r['rejected'] ?? 0)), max(0, (int) ($r['totalWords'] ?? 0)), $now, $matchId]
            );
            foreach ($seats as $s) {
                $crewId = null;
                if (!empty($s['crew'])) {
                    $row = $db->one('SELECT id FROM crew_players WHERE uid = ?', [$s['uid']]);
                    $crewId = $row['id'] ?? null;
                }
                $db->run(
                    'INSERT INTO wordflow_seats (match_id, uid, crew_id, words, points, won) VALUES (?, ?, ?, ?, ?, ?)',
                    [$matchId, $s['uid'], $crewId, max(0, (int) ($s['words'] ?? 0)), max(0, (int) ($s['points'] ?? 0)), !empty($s['won']) ? 1 : 0]
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
        $live = array_column($this->db->all("SELECT id FROM wordflow_matches WHERE status = 'active' AND id IN ($marks)", $matchIds), 'id');
        return array_values(array_diff($matchIds, $live));
    }

    /** Matches nobody finished within a day: end them so the runner lets go. */
    public function sweep(int $now): int
    {
        $old = $this->db->all("SELECT id FROM wordflow_matches WHERE status = 'active' AND created_at < ?", [$now - 24 * 3600 * 1000]);
        foreach ($old as $m) $this->end($m['id'], 'abandoned', $now);
        return count($old);
    }

    public function end(string $matchId, string $status, int $now): void
    {
        $this->db->run("UPDATE wordflow_matches SET status = ?, ended_at = ? WHERE id = ? AND status = 'active'", [$status, $now, $matchId]);
        $this->clearRun($matchId);
    }

    /* ---------- helpers ---------- */

    private function clearRun(string $matchId): void
    {
        try {
            $this->rtdb->set('wordflowRuns/' . $matchId, null);
            $this->rtdb->set('wordflowState/' . $matchId, null);
        } catch (\Throwable $e) {
            error_log('PlayMona WordFlow: could not clear ' . $matchId . ': ' . $e->getMessage());
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

    private function crewUids(array $uids): array
    {
        if (!$uids) return [];
        $marks = implode(',', array_fill(0, count($uids), '?'));
        return array_column($this->db->all("SELECT uid FROM crew_players WHERE uid IN ($marks)", array_values($uids)), 'uid');
    }
}
