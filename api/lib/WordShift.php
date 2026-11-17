<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * WordShift: change one letter at a time from a start word to a target word.
 *
 * Solo, Time Challenge and the daily puzzles are scored here, never by the phone:
 * - begin() hands out a ticket for one puzzle, kept server-side at wordshiftTickets/<id> with the
 *   server's start time;
 * - finish() replays the player's moves against the server's word list (api/data/wordshift-words.txt,
 *   made by tools/gen-wordshift.js), times the run by the server clock, scores it with SCORING
 *   (the same numbers as js/wordshift/rules.js; a test compares them) and writes the boards itself:
 *   leaderboards/wordShift (week + all time), wordshiftDaily/<day> for WordShift's own daily puzzle,
 *   and daily/<day> when WordShift is the platform's daily game. Phones may not write those.
 */
class WordShift
{
    public const GAME = 'wordShift';
    public const MODES = ['classic', 'timed'];
    public const CLOCKS = [60, 90, 120, 180];
    public const SCORING = [
        'finish' => 100, 'efficiency' => 100, 'perExtra' => 15, 'perSecond' => 2, 'perInvalid' => 5,
        'race' => [100, 70, 50, 30],
    ];
    public const MAX_MOVES = 200;
    private const GRACE_MS = 5_000;               // a Time Challenge finish this late still counts
    private const TICKET_TTL_MS = 6 * 3600 * 1000;
    private const MAX_SCORE = 1_000_000;          // as FF.Leaderboards.MAX_SCORE

    private static ?array $bank = null;
    private static ?array $words = null;

    public function __construct(private Db $db, private RealtimeDb $rtdb, private Runner $runner) {}

    /* ---------- the bank and the word list ---------- */

    /** id => puzzle {id, s, t, n, lv}. */
    public static function bank(): array
    {
        if (self::$bank === null) {
            $raw = json_decode((string) file_get_contents(__DIR__ . '/../data/wordshift-puzzles.json'), true);
            self::$bank = [];
            foreach ((array) ($raw['puzzles'] ?? []) as $p) self::$bank[$p['id']] = $p;
        }
        return self::$bank;
    }

    public static function puzzle(string $id): ?array { return self::bank()[$id] ?? null; }

    /** word => true for every word a player may use. */
    public static function words(): array
    {
        if (self::$words === null) {
            $lines = file(__DIR__ . '/../data/wordshift-words.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            self::$words = array_fill_keys(array_map('rtrim', $lines), true);
        }
        return self::$words;
    }

    /** As FF.WordShiftRules.fnv / Leaderboards::fnv. */
    public static function dailyPuzzle(string $day): ?array
    {
        $normals = array_values(array_filter(self::bank(), fn ($p) => $p['lv'] === 'normal'));
        return $normals ? $normals[Leaderboards::fnv('wordshift|' . $day) % count($normals)] : null;
    }

    /**
     * Plays the moves from the start word. Returns ['finished' => bool, 'moves' => int] or,
     * for a bad move, ['reason' => 'length'|'same'|'many'|'word'|'used', 'at' => index].
     */
    public static function replay(array $p, array $moves): array
    {
        $words = self::words();
        $cur = $p['s'];
        $used = [$cur => true];
        foreach (array_values($moves) as $i => $next) {
            $next = is_string($next) ? strtolower($next) : '';
            $reason = null;
            if (strlen($next) !== strlen($cur) || !preg_match('/^[a-z]+$/', $next)) $reason = 'length';
            else {
                $diff = 0;
                for ($k = 0; $k < strlen($cur); $k++) if ($cur[$k] !== $next[$k]) $diff++;
                if ($diff === 0) $reason = 'same';
                elseif ($diff > 1) $reason = 'many';
                elseif (!isset($words[$next])) $reason = 'word';
                elseif (isset($used[$next])) $reason = 'used';
            }
            if ($reason !== null) return ['reason' => $reason, 'at' => $i];
            $used[$next] = true;
            $cur = $next;
            if ($cur === $p['t']) return ['finished' => $i === count($moves) - 1, 'moves' => $i + 1];
        }
        return ['finished' => false, 'moves' => count($moves)];
    }

    /** As FF.WordShiftRules.score. */
    public static function score(int $moves, int $shortest, int $invalid, bool $timed, int $secondsLeft): int
    {
        $s = self::SCORING;
        $pts = $s['finish'] + max(0, $s['efficiency'] - $s['perExtra'] * max(0, $moves - $shortest));
        if ($timed) $pts += $s['perSecond'] * max(0, $secondsLeft);
        $pts -= $s['perInvalid'] * max(0, $invalid);
        return min(self::MAX_SCORE, max(0, $pts));
    }

    /* ---------- solo runs ---------- */

    public function begin(AuthUser $user, array $body, int $now): array
    {
        if ($user->isAnonymous()) throw new HttpError(403, 'Sign in to put WordShift scores on the boards.', 'guest');
        $p = self::puzzle((string) ($body['puzzleId'] ?? ''));
        if (!$p) throw new HttpError(400, 'That puzzle is not available.', 'bad-puzzle');
        $mode = $body['mode'] ?? null;
        if (!in_array($mode, self::MODES, true)) throw new HttpError(400, 'That mode is not available.', 'bad-settings');
        $seconds = 0;
        if ($mode === 'timed') {
            $seconds = is_numeric($body['seconds'] ?? null) ? (int) $body['seconds'] : 0;
            if (!in_array($seconds, self::CLOCKS, true)) throw new HttpError(400, 'That clock is not available.', 'bad-settings');
        }
        $daily = $body['daily'] ?? null;
        if ($daily !== null && !in_array($daily, ['ws', 'platform'], true)) throw new HttpError(400, 'That daily is not available.', 'bad-settings');
        $day = gmdate('Y-m-d', intdiv($now, 1000));
        if ($daily !== null) {
            $want = self::dailyPuzzle($day);
            if (!$want || $want['id'] !== $p['id'] || $mode !== 'classic') throw new HttpError(400, 'That is not today’s puzzle.', 'bad-puzzle');
            if ($daily === 'platform' && ($this->rtdb->get('dailyMeta/' . $day . '/game') ?? null) !== self::GAME) {
                throw new HttpError(409, 'WordShift is not today’s daily game.', 'not-daily');
            }
        }
        $id = bin2hex(random_bytes(12));
        $this->rtdb->set('wordshiftTickets/' . $id, [
            'uid' => $user->uid, 'puzzle' => $p['id'], 'mode' => $mode, 'seconds' => $seconds,
            'daily' => $daily, 'day' => $day, 't' => $now,
        ]);
        return ['ticket' => $id, 'puzzle' => $p, 'serverNow' => $now];
    }

    public function finish(AuthUser $user, array $body, int $now): array
    {
        $id = (string) ($body['ticket'] ?? '');
        if (!preg_match('/^[a-f0-9]{24}$/', $id)) throw new HttpError(400, 'That run is not known.', 'bad-ticket');
        $t = $this->rtdb->get('wordshiftTickets/' . $id);
        if (!is_array($t)) throw new HttpError(409, 'That run was already scored.', 'used-ticket');
        if (($t['uid'] ?? null) !== $user->uid) throw new HttpError(403, 'That run is someone else’s.', 'not-yours');
        $moves = $body['moves'] ?? null;
        if (!is_array($moves) || count($moves) > self::MAX_MOVES) throw new HttpError(400, 'Those moves cannot be read.', 'bad-moves');
        $p = self::puzzle((string) $t['puzzle']);
        $r = self::replay($p, $moves);
        if (isset($r['reason'])) throw new HttpError(422, 'One of those moves is not allowed.', 'bad-move');
        $this->rtdb->set('wordshiftTickets/' . $id, null);

        $ms = max(0, $now - (int) $t['t']);
        $timed = $t['mode'] === 'timed';
        $invalid = max(0, min(10_000, (int) ($body['invalid'] ?? 0)));
        $late = $timed && $ms > (int) $t['seconds'] * 1000 + self::GRACE_MS;
        $expired = $ms > self::TICKET_TTL_MS;
        $out = ['ok' => true, 'finished' => $r['finished'], 'score' => 0, 'ms' => $ms, 'shortest' => (int) $p['n'], 'moves' => $r['moves'], 'ranked' => false, 'places' => []];
        if (!$r['finished'] || $late || $expired) return $out;

        $left = $timed ? max(0, intdiv((int) $t['seconds'] * 1000 - $ms, 1000)) : 0;
        $out['score'] = self::score($r['moves'], (int) $p['n'], $invalid, $timed, $left);
        $who = $this->who($user);
        $daily = $t['daily'] ?? null;
        if ($daily === 'ws') {
            $at = 'wordshiftDaily/' . $t['day'] . '/' . $user->uid;
            if ($this->rtdb->get($at) !== null) return $out;   // one ranked try a day
            $this->rtdb->set($at, $who + ['score' => $out['score'], 'moves' => $r['moves'], 'ms' => $ms, 't' => $now]);
            $out['ranked'] = true;
            return $out;
        }
        if ($daily === 'platform') {
            $at = 'daily/' . $t['day'] . '/' . $user->uid;
            if ($this->rtdb->get($at) !== null) return $out;
            $this->rtdb->set($at, $who + ['score' => $out['score'], 'ms' => $ms, 't' => $now, 'game' => self::GAME]);
            $out['ranked'] = true;
            return $out;
        }
        $week = gmdate('o-\WW', intdiv($now, 1000));
        foreach (['week' => 'leaderboards/' . self::GAME . '/week/' . $week . '/' . $user->uid, 'all' => 'leaderboards/' . self::GAME . '/all/' . $user->uid] as $period => $at) {
            $cur = $this->rtdb->get($at);
            if (is_array($cur) && is_numeric($cur['score'] ?? null) && $cur['score'] >= $out['score']) continue;
            $this->rtdb->set($at, $who + ['score' => $out['score'], 't' => $now]);
            $out['places'][] = ['period' => $period, 'best' => $out['score']];
        }
        $out['ranked'] = true;
        return $out;
    }

    /** The name and picture the boards show, from the player's profile. */
    private function who(AuthUser $user): array
    {
        $p = $this->rtdb->get('users/' . $user->uid . '/profile');
        $p = is_array($p) ? $p : [];
        $name = is_string($p['displayName'] ?? null) && $p['displayName'] !== '' ? $p['displayName'] : ($user->name ?: 'Player');
        $out = ['name' => mb_substr($name, 0, 40)];
        if (is_string($p['avatar'] ?? null) && strlen($p['avatar']) <= 60) $out['avatar'] = $p['avatar'];
        return $out;
    }

    /** Drops tickets nobody finished (cron). */
    public function sweepTickets(int $now): int
    {
        $all = (array) ($this->rtdb->get('wordshiftTickets') ?? []);
        $n = 0;
        foreach ($all as $id => $t) {
            if (!is_array($t) || $now - (int) ($t['t'] ?? 0) > self::TICKET_TTL_MS) { $this->rtdb->set('wordshiftTickets/' . $id, null); $n++; }
        }
        return $n;
    }

    /* ================= the online Race =================
     * The server starts it instead of the host's phone: start() checks the caller hosts the room,
     * that everyone there said ready, the player count and settings, and hands the match to the
     * referee in the crew runner through wordshiftRuns/<matchId>, which only the server can read.
     * The referee (js/wordshift/referee.js) deals the puzzles from a secret seed and checks every
     * move, so no phone can claim a finish it did not make. */

    public const MIN_PLAYERS = 2;
    public const MAX_PLAYERS = 8;
    public const COUNTDOWN_MS = 10_000;        // as FF.Room's countdown
    private const PRESENCE_STALE_MS = 20_000;  // as FF.Room's presence
    private const ROOM_TTL_MS = 30 * 24 * 3600 * 1000;
    private const NUDGE_AFTER_MS = 6_000;      // this late means the referee is not running
    public const LEVELS = ['easy', 'normal', 'hard', 'expert'];
    public const ROUNDS = [1, 3, 5];
    public const RACE_CLOCKS = [90, 120, 180];

    /** Checks the host's settings strictly (as FF.WordShiftRules.sanitizeRoom, but refusing unknown values). */
    public static function settings(array $raw): array
    {
        return [
            'level' => self::allowed($raw, 'level', self::LEVELS, 'normal'),
            'rounds' => self::allowed($raw, 'rounds', self::ROUNDS, 3),
            'clock' => self::allowed($raw, 'clock', self::RACE_CLOCKS, 120),
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
            throw new HttpError(409, 'Pick WordShift and do the ready check first.', 'no-pick');
        }

        $present = $this->present((array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []), $now);
        $n = count($present);
        if ($n < self::MIN_PLAYERS) throw new HttpError(409, 'WordShift online needs at least 2 players.', 'too-few');
        if ($n > self::MAX_PLAYERS) throw new HttpError(409, 'WordShift takes at most 8 players.', 'too-many');
        foreach ($present as $p) {
            if (($p['ready'] ?? null) !== $pick['id']) throw new HttpError(409, 'Not everyone is ready yet.', 'not-ready');
        }

        $settings = self::settings(is_array($body['settings'] ?? null) ? $body['settings'] : (array) ($pick['settings'] ?? []));
        $seats = array_map('strval', array_keys($present));
        $matchId = newId('w');
        $startAt = $now + self::COUNTDOWN_MS;
        $seed = bin2hex(random_bytes(12));

        $this->db->run(
            "INSERT INTO wordshift_matches (id, room_code, host_uid, level, rounds, clock, players, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
            [$matchId, $room, $user->uid, $settings['level'], $settings['rounds'], $settings['clock'], $n, $now]
        );
        try {
            $this->rtdb->set('wordshiftRuns/' . $matchId, [
                'matchId' => $matchId, 'roomCode' => $room, 'hostUid' => $user->uid, 'seats' => $seats,
                'settings' => $settings, 'startAt' => $startAt, 'seed' => $seed, 'createdAt' => $now,
            ]);
            // Each player's own words live outside the room (rooms are readable by any signed-in player).
            $this->rtdb->set('wordshiftMine/' . $room, null);
            // As FF.Room.startGame, plus the match id phones use to know the view is this game's.
            $this->rtdb->update('rooms/' . $room, [
                'rounds' => null, 'ws' => null, 'wsInbox' => null,
                'meta/seed' => bin2hex(random_bytes(8)), 'meta/gameId' => self::GAME, 'meta/status' => 'playing',
                'meta/startAt' => $startAt, 'meta/endedAt' => null, 'meta/results' => null, 'meta/pick' => null,
                'meta/expiresAt' => $now + self::ROOM_TTL_MS, 'meta/settings' => $settings, 'meta/wsMatch' => $matchId,
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona WordShift: could not start ' . $matchId . ': ' . $e->getMessage());
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
        $matchId = is_array($meta) ? (string) ($meta['wsMatch'] ?? '') : '';
        if ($matchId === '' || ($meta['status'] ?? '') !== 'playing') return ['ok' => true, 'started' => false];
        $players = (array) ($this->rtdb->get('rooms/' . $room . '/players') ?? []);
        if (!array_key_exists($user->uid, $players)) throw new HttpError(403, 'You are not in that room.', 'not-in-room');
        $match = $this->db->one('SELECT status FROM wordshift_matches WHERE id = ?', [$matchId]);
        if (!$match || $match['status'] !== 'active') return ['ok' => true, 'started' => false];
        $sw = $this->rtdb->get('rooms/' . $room . '/ws');
        if (!is_array($sw)) {
            $late = $now > (int) ($meta['startAt'] ?? 0) - self::COUNTDOWN_MS + self::NUDGE_AFTER_MS;
        } else {
            $phase = (string) ($sw['phase'] ?? '');
            $due = match ($phase) {
                'starting' => (int) ($sw['readyAt'] ?? 0),
                'ready' => (int) ($sw['openAt'] ?? 0),
                'open' => (int) ($sw['closeAt'] ?? 0),
                'reveal' => (int) ($sw['nextAt'] ?? 0),
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
            $m = $db->one('SELECT status FROM wordshift_matches WHERE id = ?' . $db->forUpdate(), [$matchId]);
            if (!$m || $m['status'] !== 'active') return false;
            $winners = array_values(array_map(fn ($s) => $s['uid'], array_filter($seats, fn ($s) => !empty($s['won']))));
            $db->run(
                "UPDATE wordshift_matches SET status = 'ended', winner_uid = ?, is_draw = ?, ended_at = ? WHERE id = ?",
                [count($winners) === 1 ? $winners[0] : null, count($winners) > 1 ? 1 : 0, $now, $matchId]
            );
            foreach ($seats as $s) {
                $db->run(
                    'INSERT INTO wordshift_seats (match_id, uid, place, points, wins, won) VALUES (?, ?, ?, ?, ?, ?)',
                    [$matchId, $s['uid'], max(0, (int) ($s['place'] ?? 0)), max(0, (int) ($s['points'] ?? 0)),
                        max(0, (int) ($s['wins'] ?? 0)), !empty($s['won']) ? 1 : 0]
                );
            }
            return true;
        });
        if ($done) { $this->clearRun($matchId); $this->clearMine($matchId); }
    }

    /** The runner is refereeing these matches; returns the ones it should drop. */
    public function stillActive(array $matchIds): array
    {
        $matchIds = array_values(array_filter($matchIds, 'is_string'));
        if (!$matchIds) return [];
        $marks = implode(',', array_fill(0, count($matchIds), '?'));
        $live = array_column($this->db->all("SELECT id FROM wordshift_matches WHERE status = 'active' AND id IN ($marks)", $matchIds), 'id');
        return array_values(array_diff($matchIds, $live));
    }

    /** Matches nobody finished within a day: end them so the runner lets go. */
    public function sweep(int $now): int
    {
        $old = $this->db->all("SELECT id FROM wordshift_matches WHERE status = 'active' AND created_at < ?", [$now - 24 * 3600 * 1000]);
        foreach ($old as $m) $this->end($m['id'], 'abandoned', $now);
        return count($old);
    }

    public function end(string $matchId, string $status, int $now): void
    {
        $this->db->run("UPDATE wordshift_matches SET status = ?, ended_at = ? WHERE id = ? AND status = 'active'", [$status, $now, $matchId]);
        $this->clearRun($matchId);
        $this->clearMine($matchId);
    }

    /* ---------- helpers ---------- */

    private function clearRun(string $matchId): void
    {
        try {
            $this->rtdb->set('wordshiftRuns/' . $matchId, null);
            $this->rtdb->set('wordshiftState/' . $matchId, null);
        } catch (\Throwable $e) {
            error_log('PlayMona WordShift: could not clear ' . $matchId . ': ' . $e->getMessage());
        }
    }

    /* The players' own words for the match's room, once the match is over. A newer match in the
       same room keeps its words: they are only cleared while the room still points at this one. */
    private function clearMine(string $matchId): void
    {
        try {
            $row = $this->db->one('SELECT room_code FROM wordshift_matches WHERE id = ?', [$matchId]);
            $code = $row ? (string) $row['room_code'] : '';
            if ($code === '') return;
            $current = $this->rtdb->get('rooms/' . $code . '/meta/wsMatch');
            if ($current !== null && $current !== $matchId) return;
            $this->rtdb->set('wordshiftMine/' . $code, null);
        } catch (Throwable $e) {
            error_log('PlayMona WordShift: could not clear the words of ' . $matchId . ': ' . $e->getMessage());
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
