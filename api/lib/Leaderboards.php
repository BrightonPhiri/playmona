<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Leaderboard jobs for cron.php (js/leaderboards.js does the rest):
 * - picks the daily challenge's game for today and tomorrow, ahead of time, so every phone
 *   agrees (dailyMeta/<day>/game); a game is not repeated within REPEAT_DAYS days
 * - writes the 10 most played games of the last 7 days (leaderboards/featured)
 *
 * Both are written with the service account. A device only picks a daily game itself when
 * this has not run, using the same rule.
 */
class Leaderboards
{
    /**
     * Games that can be on leaderboards: solo games except party and creative ones.
     * Must match FF.Leaderboards.eligible in js/leaderboards.js (a test compares them).
     */
    public const GAMES = [
        'bibleQuiz', 'bibleWhoAmI', 'bibleVerseRush', 'bibleBooks',
        'letterRush', 'memoryMatch', 'pictureMemory', 'whatsMissing', 'rememberSequence', 'blinkRemember',
        'numberChallenge', 'higherOrLower', 'numberRush',
        'picturePuzzle', 'spotDifference', 'hiddenObject', 'visualRiddle', 'sortRush',
        'trueOrFalse', 'brainBattle', 'guessWho', 'pictureQuiz', 'familyQuiz',
        'quickTap', 'colorReaction',
        'guessCountry', 'geoSpin', 'logoRush', 'guessLandmark', 'guessAnimal', 'guessFood', 'guessObject', 'guessSport', 'guessVehicle',
        'wordScramble', 'wordBuilder', 'stacoend', 'wordChain', 'miniCrossword',
        'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag',
    ];
    public const REPEAT_DAYS = 14;
    public const FEATURED = 10;

    public function __construct(private RealtimeDb $rtdb) {}

    /** Games on leaderboards right now: switched on, and not taken off them in the admin portal. */
    public function activeGames(?array $config = null): array
    {
        $games = is_array($config) ? $config : (array) ($this->rtdb->get('config/games') ?? []);
        return array_values(array_filter(self::GAMES, function ($id) use ($games) {
            $c = is_array($games[$id] ?? null) ? $games[$id] : [];
            return ($c['enabled'] ?? true) !== false && ($c['ranked'] ?? true) !== false;
        }));
    }

    /** The same pick as FF.Leaderboards.pickDaily: FNV-1a of "daily|<day>" over the sorted games not used lately. */
    public static function pickDaily(string $day, array $ids, array $recent): ?string
    {
        $all = $ids;
        sort($all, SORT_STRING);
        if (!$all) return null;
        $fresh = array_values(array_filter($all, fn ($id) => !in_array($id, $recent, true)));
        $pool = $fresh ?: $all;
        return $pool[self::fnv('daily|' . $day) % count($pool)];
    }

    public static function fnv(string $s): int
    {
        $h = 2166136261;
        for ($i = 0, $n = strlen($s); $i < $n; $i++) {
            $h ^= ord($s[$i]);
            $h = ($h * 16777619) & 0xFFFFFFFF;
        }
        return $h;
    }

    /** Games used in the REPEAT_DAYS days before $day. */
    public static function recent(array $meta, string $day): array
    {
        $out = [];
        $t = strtotime($day . ' 00:00:00 UTC');
        for ($i = 1; $i <= self::REPEAT_DAYS; $i++) {
            $d = gmdate('Y-m-d', $t - $i * 86400);
            if (!empty($meta[$d]['game'])) $out[] = (string) $meta[$d]['game'];
        }
        return $out;
    }

    /** Picks today's and tomorrow's game when they are missing. Returns [day => game] for what it wrote. */
    public function scheduleDaily(int $nowMs): array
    {
        $meta = (array) ($this->rtdb->get('dailyMeta') ?? []);
        $ids = $this->activeGames();
        $wrote = [];
        foreach ([0, 1] as $ahead) {
            $day = gmdate('Y-m-d', intdiv($nowMs, 1000) + $ahead * 86400);
            if (!empty($meta[$day]['game'])) continue;
            $game = self::pickDaily($day, $ids, self::recent($meta, $day));
            if ($game === null) continue;
            $this->rtdb->set('dailyMeta/' . $day, ['game' => $game, 'by' => 'server', 't' => $nowMs]);
            $meta[$day] = ['game' => $game];
            $wrote[$day] = $game;
        }
        return $wrote;
    }

    /** The most played leaderboard games over the last 7 days (UTC), best first. */
    public function featured(int $nowMs): array
    {
        $ids = $this->activeGames();
        $plays = [];
        for ($i = 0; $i < 7; $i++) {
            $day = gmdate('Y-m-d', intdiv($nowMs, 1000) - $i * 86400);
            foreach ((array) ($this->rtdb->get('stats/days/' . $day . '/games') ?? []) as $id => $n) {
                if (in_array($id, $ids, true) && is_numeric($n)) $plays[$id] = ($plays[$id] ?? 0) + (int) $n;
            }
        }
        arsort($plays);
        return array_slice(array_keys($plays), 0, self::FEATURED);
    }

    /** Writes leaderboards/featured when it changed. Returns the list, or null when unchanged. */
    public function updateFeatured(int $nowMs): ?array
    {
        $list = $this->featured($nowMs);
        if (!$list) return null;
        $old = $this->rtdb->get('leaderboards/featured');
        if (is_array($old) && array_values($old) === $list) return null;
        $this->rtdb->set('leaderboards/featured', $list);
        return $list;
    }
}
