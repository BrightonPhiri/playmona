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
}
