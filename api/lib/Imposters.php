<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Imposters: the first game with secrets, so the server starts it instead of the host's phone.
 *
 * start() checks the caller hosts the room, that everyone there said ready, the player count and
 * settings, picks the word pair (ImposterWords never leaves the server) and hands the match to the
 * referee in the crew runner through imposterRuns/<matchId>, which only the server can read.
 * The referee (js/imposters/referee.js) deals the secrets and runs every phase from there.
 *
 * The imposter count rule is the same as FF.ImpostersRules.imposterCount: 3 to 5 players always
 * play with 1, 6 to 12 choose 1 or 2.
 */
class Imposters
{
    public const GAME = 'imposters';
    public const MIN_PLAYERS = 3;
    public const MAX_PLAYERS = 12;
    public const CHOOSE_FROM = 6;
    public const COUNTDOWN_MS = 10_000;        // as FF.Room's countdown
    private const PRESENCE_STALE_MS = 20_000;  // as FF.Room's presence
    private const ROOM_TTL_MS = 30 * 24 * 3600 * 1000;
    private const NUDGE_AFTER_MS = 6_000;      // a phase this late means the referee is not running
    private const RECENT_PAIRS = 30;

    public const MODES = ['word', 'number'];
    public const DIFFICULTIES = ['easy', 'normal', 'hard'];
    public const ROUNDS = [3, 4, 5, 6];
    public const CLUE_SECONDS = [30, 45, 60];
    public const DISCUSS_SECONDS = [60, 90, 120, 180];

    public function __construct(private Db $db, private RealtimeDb $rtdb, private Matchmaker $matchmaker, private Crew $crew, private Runner $runner) {}

    /** How many players get the other word. 0: this many players cannot play. */
    public static function imposterCount(int $players, mixed $requested): int
    {
        if ($players < self::MIN_PLAYERS || $players > self::MAX_PLAYERS) return 0;
        if ($players < self::CHOOSE_FROM) return 1;
        return (int) $requested === 2 ? 2 : 1;
    }

    /** Checks the host's settings strictly and fits the imposter count to the players. */
    public static function settings(array $raw, int $players): array
    {
        $want = fn (string $key, array $allowed, mixed $default) => self::allowed($raw, $key, $allowed, $default);
        $imposters = $want('imposters', [1, 2], 1);
        return [
            'mode' => $want('mode', self::MODES, 'word'),
            'imposters' => self::imposterCount($players, $imposters) ?: 1,
            'difficulty' => $want('difficulty', self::DIFFICULTIES, 'normal'),
            'rounds' => $want('rounds', self::ROUNDS, 4),
            'clueSeconds' => $want('clueSeconds', self::CLUE_SECONDS, 45),
            'discussSeconds' => $want('discussSeconds', self::DISCUSS_SECONDS, 90),
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
            throw new HttpError(409, 'Pick Imposters and do the ready check first.', 'no-pick');
        }

        $present = $this->present((array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []), $now);
        $n = count($present);
        if ($n < self::MIN_PLAYERS) throw new HttpError(409, 'Imposters needs at least 3 players.', 'too-few');
        if ($n > self::MAX_PLAYERS) throw new HttpError(409, 'Imposters takes at most 12 players.', 'too-many');
        foreach ($present as $uid => $p) {
            if (($p['ready'] ?? null) !== $pick['id']) throw new HttpError(409, 'Not everyone is ready yet.', 'not-ready');
        }

        $settings = self::settings(is_array($body['settings'] ?? null) ? $body['settings'] : (array) ($pick['settings'] ?? []), $n);
        $seats = array_keys($present);
        $crewUids = $this->crewUids($seats);
        $matchId = newId('i');
        $startAt = $now + self::COUNTDOWN_MS;
        $pair = $settings['mode'] === 'word' ? ImposterWords::pick($settings['difficulty'], $this->recentPairs($room)) : null;

        $this->db->run(
            "INSERT INTO imposter_matches (id, room_code, host_uid, mode, difficulty, players, imposters, rounds, pair_id, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)",
            [$matchId, $room, $user->uid, $settings['mode'], $settings['difficulty'], $n, $settings['imposters'], $settings['rounds'], $pair['id'] ?? null, $now]
        );
        try {
            $this->rtdb->set('imposterRuns/' . $matchId, [
                'matchId' => $matchId, 'roomCode' => $room, 'hostUid' => $user->uid, 'seats' => $seats,
                'crew' => $crewUids ? array_fill_keys($crewUids, true) : null,
                'settings' => $settings, 'pair' => $pair, 'startAt' => $startAt, 'createdAt' => $now,
            ]);
            // As FF.Room.startGame, plus the match id phones use to find their secret.
            $this->rtdb->update('rooms/' . $room, [
                'rounds' => null, 'imp' => null, 'impInbox' => null, 'chat' => null,
                'meta/seed' => bin2hex(random_bytes(8)), 'meta/gameId' => self::GAME, 'meta/status' => 'playing',
                'meta/startAt' => $startAt, 'meta/endedAt' => null, 'meta/results' => null, 'meta/pick' => null,
                'meta/expiresAt' => $now + self::ROOM_TTL_MS, 'meta/settings' => $settings, 'meta/impMatch' => $matchId,
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona Imposters: could not start ' . $matchId . ': ' . $e->getMessage());
            $this->end($matchId, 'failed', $now);
            throw new HttpError(503, 'The game could not be started. Please try again.', 'start-failed');
        }
        $this->runner->ensure($now);
        return ['matchId' => $matchId, 'startAt' => $startAt, 'settings' => $settings, 'players' => $n];
    }

    /** "Find PlayMona players": crew fill the room up to 5 players, or one more after that. */
    public function findPlayers(AuthUser $user, bool $isAdmin, array $body, int $now): array
    {
        $room = $this->roomCode($body);
        $meta = $this->rtdb->get('rooms/' . $room . '/meta');
        if (!is_array($meta) || ($meta['hostUid'] ?? null) !== $user->uid) throw new HttpError(403, 'Only the room host can add players.', 'not-host');
        if (($meta['status'] ?? 'lobby') !== 'lobby') throw new HttpError(409, 'That room is already playing.', 'room-busy');
        if (!$this->crew->allowedFor($isAdmin, self::GAME)) throw new HttpError(403, 'PlayMona players are not available right now.', 'no-crew');
        $n = count($this->present((array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []), $now));
        if ($n >= self::MAX_PLAYERS) throw new HttpError(409, 'The room is full.', 'room-full');
        $want = $n < 5 ? 5 - $n : 1;
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
        $matchId = is_array($meta) ? (string) ($meta['impMatch'] ?? '') : '';
        if ($matchId === '' || ($meta['status'] ?? '') !== 'playing') return ['ok' => true, 'started' => false];
        $players = (array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []);
        if (!array_key_exists($user->uid, $players)) throw new HttpError(403, 'You are not in that room.', 'not-in-room');
        $match = $this->db->one("SELECT status FROM imposter_matches WHERE id = ?", [$matchId]);
        if (!$match || $match['status'] !== 'active') return ['ok' => true, 'started' => false];
        $imp = $this->rtdb->get('rooms/' . $room . '/imp');
        $late = !is_array($imp)
            ? $now > (int) ($meta['startAt'] ?? 0)
            : (($imp['phase'] ?? '') !== 'ended' && $now > (int) ($imp['deadline'] ?? 0) + self::NUDGE_AFTER_MS);
        return ['ok' => true, 'started' => $late && $this->runner->ensure($now)];
    }

    /* ---------- reports from the referee ---------- */

    /** A match finished: keep the result and each seat's record. Repeats change nothing. */
    public function recordResult(array $r, int $now): void
    {
        $matchId = (string) ($r['matchId'] ?? '');
        $winner = (string) ($r['winner'] ?? '');
        if (!in_array($winner, ['majority', 'minority'], true)) throw new HttpError(400, 'Bad result.', 'bad-result');
        $seats = array_values(array_filter((array) ($r['seats'] ?? []), fn ($s) => is_array($s) && is_string($s['uid'] ?? null)));
        // Crew records (crew_stats) come from the crew controller's own game report, not from here.
        $done = $this->db->transaction(function (Db $db) use ($matchId, $winner, $r, $seats, $now) {
            $m = $db->one('SELECT status FROM imposter_matches WHERE id = ?' . $db->forUpdate(), [$matchId]);
            if (!$m || $m['status'] !== 'active') return false;
            $words = is_array($r['words'] ?? null) ? $r['words'] : null;
            $db->run(
                "UPDATE imposter_matches SET status = 'ended', winner = ?, rounds_played = ?, majority_word = ?, minority_word = ?, ended_at = ? WHERE id = ?",
                [$winner, (int) ($r['rounds'] ?? 0), $words['majority'] ?? null, $words['minority'] ?? null, $now, $matchId]
            );
            foreach ($seats as $s) {
                $crewId = null;
                if (!empty($s['crew'])) {
                    $row = $db->one('SELECT id FROM crew_players WHERE uid = ?', [$s['uid']]);
                    $crewId = $row['id'] ?? null;
                }
                $side = ($s['side'] ?? '') === 'minority' ? 'minority' : 'majority';
                $db->run(
                    'INSERT INTO imposter_seats (match_id, uid, crew_id, side, out_round, correct_votes, clues, points, won) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$matchId, $s['uid'], $crewId, $side, (int) ($s['out'] ?? 0), (int) ($s['correctVotes'] ?? 0), (int) ($s['clues'] ?? 0), (int) ($s['points'] ?? 0), $side === $winner ? 1 : 0]
                );
            }
            return true;
        });
        if ($done) $this->clearRun($matchId);
    }

    /** The runner is playing these matches; returns the ones it should drop. */
    public function stillActive(array $matchIds): array
    {
        $matchIds = array_values(array_filter($matchIds, 'is_string'));
        if (!$matchIds) return [];
        $marks = implode(',', array_fill(0, count($matchIds), '?'));
        $live = array_column($this->db->all("SELECT id FROM imposter_matches WHERE status = 'active' AND id IN ($marks)", $matchIds), 'id');
        return array_values(array_diff($matchIds, $live));
    }

    /** Matches nobody finished within a day: end them so the runner lets go. */
    public function sweep(int $now): int
    {
        $old = $this->db->all("SELECT id FROM imposter_matches WHERE status = 'active' AND created_at < ?", [$now - 24 * 3600 * 1000]);
        foreach ($old as $m) $this->end($m['id'], 'abandoned', $now);
        return count($old);
    }

    public function end(string $matchId, string $status, int $now): void
    {
        $this->db->run("UPDATE imposter_matches SET status = ?, ended_at = ? WHERE id = ? AND status = 'active'", [$status, $now, $matchId]);
        $this->clearRun($matchId);
    }

    /* ---------- helpers ---------- */

    private function clearRun(string $matchId): void
    {
        try {
            $this->rtdb->set('imposterRuns/' . $matchId, null);
            $this->rtdb->set('imposterState/' . $matchId, null);
        } catch (\Throwable $e) {
            error_log('PlayMona Imposters: could not clear ' . $matchId . ': ' . $e->getMessage());
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

    private function recentPairs(string $room): array
    {
        $rows = $this->db->all(
            'SELECT pair_id FROM imposter_matches WHERE room_code = ? AND pair_id IS NOT NULL ORDER BY created_at DESC LIMIT ' . self::RECENT_PAIRS,
            [$room]
        );
        return array_column($rows, 'pair_id');
    }
}
