<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * The Players Engine registry: PlayMona-run players ("crew") who fill empty seats in Quick Match
 * when no real player is free. One engine for every crew member; each has a lasting identity,
 * a personality and a skill per game. Players never see the word "crew": in rooms, search and
 * profiles they look like anyone else. Only this server knows who is crew.
 *
 * Status: available -> reserved (seat held for a match) -> playing -> available.
 * Reservations are leases: if the runner stops renewing one, the next reservation or the
 * cron sweep frees it, so a crashed match can never hold a player forever.
 */
class Crew
{
    public const SETTING = 'crew';

    /** Every game playable online: must match ONLINE_GAMES in js/net/roomUI.js (a test compares them). Live match pairs people on any of these. */
    public const ONLINE_GAMES = [
        'bibleQuiz', 'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag',
        'guessCountry', 'guessLandmark', 'guessAnimal', 'guessFood', 'guessObject', 'guessSport',
        'guessVehicle', 'familyQuiz', 'trueOrFalse', 'guessWho', 'pictureQuiz', 'quickTap',
        'colorReaction', 'letterRush', 'whatsMissing', 'numberChallenge', 'visualRiddle',
        'higherOrLower', 'wordScramble', 'bibleWhoAmI', 'bibleVerseRush', 'memoryMatch', 'pictureMemory',
        'rememberSequence', 'picturePuzzle', 'spotDifference', 'hiddenObject', 'wordBuilder', 'bibleBooks',
        'wouldYouRather', 'thisOrThat', 'whoIsMostLikely', 'imposters',
    ];

    /** The online games crew can play (each has a brain in js/crew/brains). Crew are only seated in these. */
    public const GAMES = [
        'bibleQuiz', 'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag',
        'guessCountry', 'guessLandmark', 'guessAnimal', 'guessFood', 'guessObject', 'guessSport',
        'guessVehicle', 'familyQuiz', 'trueOrFalse', 'guessWho', 'pictureQuiz', 'quickTap',
        'colorReaction', 'letterRush', 'whatsMissing', 'numberChallenge', 'visualRiddle', 'imposters',
    ];

    public const TRAITS = ['competitiveness', 'friendliness', 'reaction', 'accuracy', 'risk', 'strategy', 'patience', 'consistency', 'social'];
    public const LEVELS = ['easy', 'medium', 'hard'];

    /** Every setting an admin can change, with its default. Nothing else in the app hard-codes these. */
    public const DEFAULTS = [
        'mode' => 'admins',              // off | admins (only admins get crew: for testing) | everyone
        'stopNew' => false,              // finish current matches, start no new ones
        'onlyWhenNoHumans' => true,      // crew only when no other real player is online
        'fallbackSeconds' => 6,          // how long Quick Match looks for a real player first
        'maxConcurrentMatches' => 5,
        'crewPerMatch' => [1, 3],
        'games' => [],                   // gameId => false switches a game off for crew
        'difficultyMix' => ['easy' => 30, 'medium' => 50, 'hard' => 20],
        'leaseSeconds' => 90,
        'maxGamesPerMatch' => 4,         // crew leave after this many games in one room
        'declineHours' => [2, 30],       // friend requests to crew fade after this long
        'population' => 20,              // the seed's size; admins can add more
    ];

    public function __construct(private Db $db, private RealtimeDb $rtdb) {}

    /* ---------- settings ---------- */

    public function settings(): array
    {
        try {
            $row = $this->db->one('SELECT value FROM settings WHERE name = ?', [self::SETTING]);
        } catch (\Throwable $e) {
            $row = null;   // the table arrives with the next cron migrate
        }
        $saved = $row ? json_decode((string) $row['value'], true) : null;
        return array_replace(self::DEFAULTS, is_array($saved) ? array_intersect_key($saved, self::DEFAULTS) : []);
    }

    public function saveSettings(array $change, string $adminUid): array
    {
        $s = $this->settings();
        if (array_key_exists('mode', $change)) {
            if (!in_array($change['mode'], ['off', 'admins', 'everyone'], true)) throw new HttpError(400, 'Choose off, admins only or everyone.', 'bad-mode');
            $s['mode'] = $change['mode'];
        }
        foreach (['stopNew', 'onlyWhenNoHumans'] as $flag) {
            if (array_key_exists($flag, $change)) $s[$flag] = (bool) $change[$flag];
        }
        foreach (['fallbackSeconds' => [0, 120], 'maxConcurrentMatches' => [0, 500], 'leaseSeconds' => [30, 600], 'maxGamesPerMatch' => [1, 20], 'population' => [0, 1000]] as $key => [$lo, $hi]) {
            if (!array_key_exists($key, $change)) continue;
            $s[$key] = self::intIn($change[$key], $lo, $hi, $key);
        }
        foreach (['crewPerMatch' => [1, 11], 'declineHours' => [0, 720]] as $key => [$lo, $hi]) {
            if (!array_key_exists($key, $change)) continue;
            $v = $change[$key];
            if (!is_array($v) || count($v) !== 2) throw new HttpError(400, "$key needs a lowest and highest value.", 'bad-range');
            $a = self::intIn($v[0], $lo, $hi, $key);
            $b = self::intIn($v[1], $lo, $hi, $key);
            if ($a > $b) throw new HttpError(400, "$key: the lowest value is above the highest.", 'bad-range');
            $s[$key] = [$a, $b];
        }
        if (array_key_exists('games', $change)) {
            if (!is_array($change['games'])) throw new HttpError(400, 'Bad game switches.', 'bad-games');
            $games = [];
            foreach ($change['games'] as $id => $on) {
                if (in_array($id, self::GAMES, true) && !$on) $games[$id] = false;
            }
            $s['games'] = $games;
        }
        if (array_key_exists('difficultyMix', $change)) {
            $mix = [];
            foreach (self::LEVELS as $level) $mix[$level] = self::intIn($change['difficultyMix'][$level] ?? 0, 0, 100, 'difficultyMix');
            if (array_sum($mix) === 0) throw new HttpError(400, 'At least one difficulty needs a share.', 'bad-mix');
            $s['difficultyMix'] = $mix;
        }
        $now = nowMs();
        $value = json_encode($s + ['updatedAt' => $now, 'updatedBy' => $adminUid]);
        $this->db->transaction(function (Db $db) use ($value, $now) {
            $exists = $db->one('SELECT name FROM settings WHERE name = ?' . $db->forUpdate(), [self::SETTING]);
            if ($exists) $db->run('UPDATE settings SET value = ?, updated_at = ? WHERE name = ?', [$value, $now, self::SETTING]);
            else $db->run('INSERT INTO settings (name, value, updated_at) VALUES (?, ?, ?)', [self::SETTING, $value, $now]);
        });
        return $this->settings();
    }

    /** Whether this player may be matched with crew right now (mode, stop switch, game switch). */
    public function allowedFor(bool $isAdmin, ?string $gameId): bool
    {
        $s = $this->settings();
        if ($s['stopNew'] || $s['mode'] === 'off') return false;
        if ($s['mode'] === 'admins' && !$isAdmin) return false;
        if ($gameId !== null && ($s['games'][$gameId] ?? true) === false) return false;
        return true;
    }

    /* ---------- the players ---------- */

    public function all(): array
    {
        $rows = $this->db->all('SELECT * FROM crew_players ORDER BY created_at, id');
        return array_map(fn ($r) => $this->shape($r, true), $rows);
    }

    public function get(string $id): ?array
    {
        $row = $this->db->one('SELECT * FROM crew_players WHERE id = ?', [$id]);
        return $row ? $this->shape($row, true) : null;
    }

    public function byUid(string $uid): ?array
    {
        $row = $this->db->one('SELECT * FROM crew_players WHERE uid = ?', [$uid]);
        return $row ? $this->shape($row, true) : null;
    }

    public function isCrew(string $uid): bool
    {
        return (bool) $this->db->one('SELECT id FROM crew_players WHERE uid = ?', [$uid]);
    }

    /** Creates a player. $data: displayName, username, avatar, color?, bio?, personality?, skills? */
    public function create(array $data, ?string $adminUid, ?int $now = null): array
    {
        $now ??= nowMs();
        $clean = $this->validate($data, null);
        $id = newId('cr');
        $uid = self::newUid();
        $this->db->transaction(function (Db $db) use ($clean, $id, $uid, $adminUid, $now) {
            $db->run(
                'INSERT INTO crew_players (id, uid, username, display_name, avatar, color, bio, personality, enabled, status, created_at, created_by, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
                [$id, $uid, $clean['username'], $clean['displayName'], $clean['avatar'], $clean['color'], $clean['bio'],
                 json_encode($clean['personality']), 'available', $now, $adminUid, $now]
            );
            $this->writeSkills($db, $id, $clean['skills']);
        });
        // Hold the username so a real player can't take it later (no email: it can't sign in).
        try { $this->rtdb->set('usernames/' . $clean['username'], ['uid' => $uid]); } catch (\Throwable $e) { /* held in MariaDB anyway */ }
        return $this->get($id);
    }

    public function update(string $id, array $data): array
    {
        $current = $this->get($id);
        if (!$current) throw new HttpError(404, 'That player does not exist.', 'no-player');
        $clean = $this->validate($data + [
            'displayName' => $current['displayName'], 'username' => $current['username'], 'avatar' => $current['avatar'],
            'color' => $current['color'], 'bio' => $current['bio'], 'personality' => $current['personality'],
        ], $id);
        $this->db->transaction(function (Db $db) use ($id, $clean, $data) {
            $db->run(
                'UPDATE crew_players SET username = ?, display_name = ?, avatar = ?, color = ?, bio = ?, personality = ?, updated_at = ? WHERE id = ?',
                [$clean['username'], $clean['displayName'], $clean['avatar'], $clean['color'], $clean['bio'], json_encode($clean['personality']), nowMs(), $id]
            );
            if (array_key_exists('skills', $data)) $this->writeSkills($db, $id, $clean['skills']);
        });
        if ($clean['username'] !== $current['username']) {
            try {
                $this->rtdb->set('usernames/' . $clean['username'], ['uid' => $current['uid']]);
                $this->rtdb->set('usernames/' . $current['username'], null);
            } catch (\Throwable $e) { /* best effort */ }
        }
        return $this->get($id);
    }

    /** Switching a player off takes them out of matchmaking; a match they are in finishes first. */
    public function setEnabled(string $id, bool $on): array
    {
        $n = $this->db->run('UPDATE crew_players SET enabled = ?, updated_at = ? WHERE id = ?', [$on ? 1 : 0, nowMs(), $id]);
        if (!$n) throw new HttpError(404, 'That player does not exist.', 'no-player');
        $this->db->run("UPDATE crew_players SET status = ? WHERE id = ? AND match_id IS NULL", [$on ? 'available' : 'disabled', $id]);
        return $this->get($id);
    }

    /**
     * Tops the population up to $target players, made from the archetypes and name pools below.
     * The players themselves are made on the server and never written to the (public) repo.
     */
    public function seed(int $target, ?int $now = null): int
    {
        $have = (int) $this->db->one('SELECT COUNT(*) AS n FROM crew_players')['n'];
        $made = 0;
        $kinds = array_keys(self::ARCHETYPES);
        for ($i = $have; $i < $target; $i++) {
            $draft = self::draft($kinds[$i % count($kinds)]);
            for ($try = 0; $try < 20; $try++) {
                try {
                    $this->create($draft, null, $now);
                    $made++;
                    break;
                } catch (HttpError $e) {
                    if ($e->reason !== 'username-taken') throw $e;
                    $draft['username'] = substr($draft['username'], 0, 16) . random_int(10, 999);
                }
            }
        }
        return $made;
    }

    /** Kinds of player: a base skill, the games they shine at, and leanings in personality. */
    public const ARCHETYPES = [
        'quizzer' => ['base' => [45, 60], 'strong' => ['familyQuiz', 'trueOrFalse', 'guessWho', 'bibleQuiz'], 'traits' => ['accuracy' => 20, 'patience' => 10]],
        'speedster' => ['base' => [40, 55], 'strong' => ['quickTap', 'colorReaction'], 'traits' => ['reaction' => 30, 'risk' => 15, 'patience' => -15]],
        'wordsmith' => ['base' => [45, 60], 'strong' => ['letterRush', 'guessWho', 'visualRiddle'], 'traits' => ['strategy' => 20, 'patience' => 15]],
        'traveller' => ['base' => [40, 55], 'strong' => ['capitalChallenge', 'guessFlag', 'whereInWorld', 'mapChallenge', 'guessCountry', 'guessLandmark'], 'traits' => ['accuracy' => 15]],
        'casual' => ['base' => [30, 45], 'strong' => ['guessAnimal', 'guessFood', 'pictureQuiz'], 'traits' => ['friendliness' => 20, 'competitiveness' => -20, 'consistency' => -10]],
        'thinker' => ['base' => [45, 60], 'strong' => ['numberChallenge', 'visualRiddle', 'whatsMissing'], 'traits' => ['strategy' => 25, 'reaction' => -10]],
        'allrounder' => ['base' => [50, 65], 'strong' => [], 'traits' => ['consistency' => 15, 'competitiveness' => 15]],
        'sporty' => ['base' => [38, 52], 'strong' => ['guessSport', 'guessVehicle', 'quickTap'], 'traits' => ['social' => 15, 'risk' => 10]],
        'pictures' => ['base' => [40, 55], 'strong' => ['pictureQuiz', 'guessObject', 'guessLandmark', 'whatsMissing'], 'traits' => ['patience' => 10]],
        'learner' => ['base' => [25, 40], 'strong' => ['bibleQuiz', 'guessAnimal'], 'traits' => ['friendliness' => 15, 'accuracy' => -10, 'patience' => 15]],
    ];

    private const FIRST = ['Tariro', 'Tendai', 'Rudo', 'Farai', 'Nyasha', 'Chipo', 'Tatenda', 'Kuda', 'Thandi', 'Sipho', 'Rumbi', 'Tinashe',
        'Vimbai', 'Takudzwa', 'Ruvimbo', 'Simba', 'Nokuthula', 'Themba', 'Lindiwe', 'Amara', 'Leo', 'Maya', 'Noah', 'Zara', 'Eli', 'Lina',
        'Omar', 'Ivy', 'Jonah', 'Kenji', 'Ana', 'Musa', 'Ayo', 'Grace', 'Joy', 'Blessing', 'Mercy', 'Tanaka', 'Panashe', 'Kudzai'];
    private const INITIALS = ['M', 'K', 'N', 'D', 'C', 'S', 'B', 'T', 'R', 'G', 'P', 'Z'];
    private const BIOS = ['Here for the quick rounds.', 'Word games before bed.', 'Trying to beat my own best.', 'Quiz nights are my thing.',
        'Fast fingers, slow mornings.', 'Playing with the family most evenings.', 'One more round. Always one more.', 'Lucky guesses, mostly.',
        'Learning something new every game.', 'Strategy over speed.', 'Snacks and quizzes.', ''];
    public const AVATARS = ['nia', 'kenji', 'amara', 'ravi', 'layla', 'ruby', 'malik', 'nova', 'leo', 'zuri', 'bao', 'sofia', 'jay', 'mika',
        'finn', 'tunde', 'rosa', 'kai', 'imani', 'ollie', 'mei', 'sam', 'fox', 'panda', 'lion', 'otter', 'koala', 'penguin', 'husky', 'capybara'];

    /** A new player made from an archetype (random when null): ready for create(). */
    public static function draft(?string $kind = null): array
    {
        $kinds = array_keys(self::ARCHETYPES);
        $kind = isset(self::ARCHETYPES[$kind]) ? $kind : $kinds[random_int(0, count($kinds) - 1)];
        $a = self::ARCHETYPES[$kind];
        $first = self::FIRST[random_int(0, count(self::FIRST) - 1)];
        $initial = self::INITIALS[random_int(0, count(self::INITIALS) - 1)];
        $style = random_int(0, 3);
        $display = $style === 0 ? $first : "$first $initial";
        $sep = ['_', '.', '', '_'][random_int(0, 3)];
        $username = strtolower($first) . $sep . strtolower($initial) . ($style > 1 ? random_int(1, 99) : '');
        $traits = [];
        foreach (self::TRAITS as $t) $traits[$t] = max(5, min(95, random_int(35, 70) + ($a['traits'][$t] ?? 0)));
        $base = random_int($a['base'][0], $a['base'][1]);
        $skills = [];
        foreach (self::GAMES as $g) {
            $skill = max(10, min(95, $base + random_int(-12, 12) + (in_array($g, $a['strong'], true) ? random_int(18, 30) : 0)));
            $skills[$g] = ['skill' => $skill, 'level' => self::levelFor($skill)];
        }
        return ['displayName' => $display, 'username' => $username, 'avatar' => self::AVATARS[random_int(0, count(self::AVATARS) - 1)],
                'bio' => self::BIOS[random_int(0, count(self::BIOS) - 1)], 'personality' => $traits, 'skills' => $skills, 'archetype' => $kind];
    }

    /* ---------- matches: reserve, renew, release ---------- */

    /**
     * Reserves up to $count players for a match, best fit first. Atomic: a player is only taken
     * when the conditional UPDATE changes exactly one row, so two matches can never get the same
     * player even when requests race. Call inside the match's transaction.
     */
    public function reserve(Db $db, string $matchId, string $gameId, string $difficulty, int $count, int $now): array
    {
        $s = $this->settings();
        $lease = $now + $s['leaseSeconds'] * 1000;
        $target = $this->targetSkill($difficulty, $s['difficultyMix']);
        $rows = $db->all(
            "SELECT p.*, COALESCE(k.skill, 50) AS game_skill FROM crew_players p
             LEFT JOIN crew_skills k ON k.crew_id = p.id AND k.game_id = ?
             WHERE p.enabled = 1 AND (p.status = 'available' OR (p.status IN ('reserved', 'playing') AND p.lease_until < ?))",
            [$gameId, $now]
        );
        // Closest skill first, with personality and chance mixed in so the same faces don't always come.
        foreach ($rows as &$r) {
            $traits = json_decode((string) $r['personality'], true) ?: [];
            $r['_rank'] = abs((int) $r['game_skill'] - $target) - ((int) ($traits['social'] ?? 50)) / 10 + random_int(0, 25);
        }
        unset($r);
        usort($rows, fn ($a, $b) => $a['_rank'] <=> $b['_rank']);

        $taken = [];
        foreach ($rows as $r) {
            if (count($taken) >= $count) break;
            $n = $db->run(
                "UPDATE crew_players SET status = 'reserved', match_id = ?, lease_until = ?, updated_at = ?
                 WHERE id = ? AND enabled = 1 AND (status = 'available' OR (status IN ('reserved', 'playing') AND lease_until < ?))",
                [$matchId, $lease, $now, $r['id'], $now]
            );
            if ($n === 1) $taken[] = $this->shape($r, true);
        }
        return $taken;
    }

    /** The runner is still playing these matches: keep their players for another lease. */
    public function renew(array $matchIds, int $now): int
    {
        if (!$matchIds) return 0;
        $lease = $now + $this->settings()['leaseSeconds'] * 1000;
        $marks = implode(',', array_fill(0, count($matchIds), '?'));
        return $this->db->run(
            "UPDATE crew_players SET status = 'playing', lease_until = ? WHERE match_id IN ($marks) AND status IN ('reserved', 'playing')",
            array_merge([$lease], array_values($matchIds))
        );
    }

    /** Frees a match's players (the match ended, was cancelled or failed to start). */
    public function release(string $matchId, int $now): array
    {
        $uids = array_column($this->db->all('SELECT uid FROM crew_players WHERE match_id = ?', [$matchId]), 'uid');
        $this->db->run(
            "UPDATE crew_players SET status = CASE WHEN enabled = 1 THEN 'available' ELSE 'disabled' END,
             match_id = NULL, lease_until = NULL, updated_at = ? WHERE match_id = ?",
            [$now, $matchId]
        );
        return $uids;
    }

    /** Leases nobody renewed: free those players. Returns the match ids they belonged to. */
    public function sweep(int $now): array
    {
        $stale = array_values(array_unique(array_column(
            $this->db->all("SELECT match_id FROM crew_players WHERE match_id IS NOT NULL AND lease_until < ?", [$now]),
            'match_id'
        )));
        foreach ($stale as $matchId) $this->release($matchId, $now);
        return $stale;
    }

    /** Adds one finished game to a player's record. $outcome: win | loss | draw */
    public function recordResult(string $crewId, string $gameId, string $outcome, int $score, int $now): void
    {
        if (!in_array($gameId, self::GAMES, true) || !in_array($outcome, ['win', 'loss', 'draw'], true)) return;
        $this->db->transaction(function (Db $db) use ($crewId, $gameId, $outcome, $score, $now) {
            $row = $db->one('SELECT * FROM crew_stats WHERE crew_id = ? AND game_id = ?' . $db->forUpdate(), [$crewId, $gameId]);
            if (!$row) {
                $db->run('INSERT INTO crew_stats (crew_id, game_id, played, wins, losses, draws, total_score, best_score, last_played_at) VALUES (?, ?, 0, 0, 0, 0, 0, 0, ?)', [$crewId, $gameId, $now]);
            }
            $col = ['win' => 'wins', 'loss' => 'losses', 'draw' => 'draws'][$outcome];
            $db->run(
                "UPDATE crew_stats SET played = played + 1, $col = $col + 1, total_score = total_score + ?,
                 best_score = CASE WHEN best_score < ? THEN ? ELSE best_score END, last_played_at = ? WHERE crew_id = ? AND game_id = ?",
                [$score, $score, $score, $now, $crewId, $gameId]
            );
        });
    }

    /** Totals across games, as a profile shows them. */
    public function totals(string $crewId): array
    {
        $row = $this->db->one('SELECT COALESCE(SUM(played), 0) AS played, COALESCE(SUM(wins), 0) AS wins, MAX(last_played_at) AS last FROM crew_stats WHERE crew_id = ?', [$crewId]);
        return ['played' => (int) $row['played'], 'wins' => (int) $row['wins'], 'lastPlayedAt' => $row['last'] !== null ? (int) $row['last'] : null];
    }

    /** What the runner needs to play this player: identity, personality and skills (never sent to players). */
    public function runSheet(array $player): array
    {
        return [
            'crewId' => $player['id'], 'uid' => $player['uid'], 'name' => $player['displayName'],
            'avatar' => $player['avatar'], 'color' => $player['color'],
            'persona' => $player['personality'], 'skills' => $player['skills'],
        ];
    }

    /* ---------- helpers ---------- */

    /** The skill to aim for: the room's difficulty, blended with the admins' difficulty mix. */
    private function targetSkill(string $difficulty, array $mix): int
    {
        $centre = ['easy' => 30, 'medium' => 55, 'hard' => 80];
        $wanted = ['easy' => 'easy', 'normal' => 'medium', 'hard' => 'hard'][$difficulty] ?? 'medium';
        $weights = $mix;
        $weights[$wanted] = ($weights[$wanted] ?? 0) + 100;
        $pick = random_int(1, max(1, array_sum($weights)));
        foreach ($weights as $level => $w) {
            $pick -= $w;
            if ($pick <= 0) return $centre[$level] ?? 55;
        }
        return $centre[$wanted];
    }

    private function writeSkills(Db $db, string $id, array $skills): void
    {
        $db->run('DELETE FROM crew_skills WHERE crew_id = ?', [$id]);
        foreach ($skills as $game => $k) {
            $db->run('INSERT INTO crew_skills (crew_id, game_id, skill, level) VALUES (?, ?, ?, ?)', [$id, $game, $k['skill'], $k['level']]);
        }
    }

    private function validate(array $data, ?string $selfId): array
    {
        $name = trim((string) ($data['displayName'] ?? ''));
        if ($name === '' || mb_strlen($name) > 40) throw new HttpError(400, 'Enter a display name (up to 40 characters).', 'bad-name');
        $username = strtolower(trim((string) ($data['username'] ?? '')));
        if (!preg_match('/^[a-z0-9_.]{3,20}$/', $username)) throw new HttpError(400, 'Usernames are 3 to 20 letters, numbers, dots or underscores.', 'bad-username');
        $clash = $this->db->one('SELECT id FROM crew_players WHERE username = ?', [$username]);
        if ($clash && $clash['id'] !== $selfId) throw new HttpError(409, 'That username is taken.', 'username-taken');
        if (!$clash || $clash['id'] !== $selfId) {
            $owner = null;
            try { $owner = $this->rtdb->get('usernames/' . $username); } catch (\Throwable $e) { /* checked again by MariaDB's unique key */ }
            if ($owner !== null) throw new HttpError(409, 'That username is taken.', 'username-taken');
        }
        $avatar = (string) ($data['avatar'] ?? '');
        if (!preg_match('/^[a-z0-9-]{2,30}$/', $avatar)) throw new HttpError(400, 'Choose a character.', 'bad-avatar');
        $color = (string) ($data['color'] ?? '');
        if ($color !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $color)) throw new HttpError(400, 'Colours look like #3366ff.', 'bad-color');
        $bio = trim((string) ($data['bio'] ?? ''));
        if (mb_strlen($bio) > 300) throw new HttpError(400, 'Keep the description under 300 characters.', 'bad-bio');

        $traits = [];
        $given = is_array($data['personality'] ?? null) ? $data['personality'] : [];
        foreach (self::TRAITS as $t) $traits[$t] = array_key_exists($t, $given) ? self::intIn($given[$t], 0, 100, $t) : 50;

        $skills = [];
        $givenSkills = is_array($data['skills'] ?? null) ? $data['skills'] : [];
        foreach (self::GAMES as $game) {
            $k = $givenSkills[$game] ?? null;
            $skill = is_array($k) && array_key_exists('skill', $k) ? self::intIn($k['skill'], 0, 100, $game) : (is_numeric($k) ? self::intIn($k, 0, 100, $game) : 50);
            $level = is_array($k) && in_array($k['level'] ?? null, self::LEVELS, true) ? $k['level'] : self::levelFor($skill);
            $skills[$game] = ['skill' => $skill, 'level' => $level];
        }
        return ['displayName' => $name, 'username' => $username, 'avatar' => $avatar, 'color' => $color ?: self::colorFor($username),
                'bio' => $bio, 'personality' => $traits, 'skills' => $skills];
    }

    public static function levelFor(int $skill): string
    {
        return $skill < 40 ? 'easy' : ($skill < 70 ? 'medium' : 'hard');
    }

    private static function colorFor(string $seed): string
    {
        $palette = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#8e44ad', '#16a085', '#d35400', '#2e86de', '#c0392b', '#27ae60'];
        return $palette[hexdec(substr(md5($seed), 0, 4)) % count($palette)];
    }

    private static function intIn(mixed $v, int $lo, int $hi, string $what): int
    {
        if (!is_int($v) && !(is_string($v) && preg_match('/^-?\d+$/', $v)) && !(is_float($v) && floor($v) === $v)) {
            throw new HttpError(400, "$what needs a whole number.", 'bad-number');
        }
        $v = (int) $v;
        if ($v < $lo || $v > $hi) throw new HttpError(400, "$what must be between $lo and $hi.", 'bad-number');
        return $v;
    }

    /** A uid shaped like Firebase's (28 letters and digits), so room data looks the same for everyone. */
    public static function newUid(): string
    {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        $out = '';
        for ($i = 0; $i < 28; $i++) $out .= $chars[random_int(0, 61)];
        return $out;
    }

    private function shape(array $r, bool $full): array
    {
        $out = [
            'id' => $r['id'], 'uid' => $r['uid'], 'username' => $r['username'], 'displayName' => $r['display_name'],
            'avatar' => $r['avatar'], 'color' => $r['color'], 'bio' => (string) $r['bio'],
            'enabled' => (bool) (int) $r['enabled'], 'status' => $r['status'], 'matchId' => $r['match_id'],
            'leaseUntil' => $r['lease_until'] !== null ? (int) $r['lease_until'] : null,
            'createdAt' => (int) $r['created_at'],
            'personality' => json_decode((string) $r['personality'], true) ?: [],
        ];
        if ($full) {
            $skills = [];
            foreach ($this->db->all('SELECT game_id, skill, level FROM crew_skills WHERE crew_id = ?', [$r['id']]) as $k) {
                $skills[$k['game_id']] = ['skill' => (int) $k['skill'], 'level' => $k['level']];
            }
            $out['skills'] = $skills;
        }
        return $out;
    }
}
