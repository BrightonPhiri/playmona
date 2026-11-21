<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Games at a celebration: the organiser builds them from templates (Picture Rush first), starts
 * one at a time, and the crew runner referees it.
 *
 * A game is a template plus the organiser's content and settings (celebration_games). Starting one
 * makes a run (celebration_runs) and hands it to the crew runner through celebrationRuns/<runId>,
 * which only the server can read; FF.CelebrateReferees[template] (js/celebrate/<template>/referee.js)
 * plays it under celebrations/<cid>/run and reports each team's points per round when it ends.
 * Scores are kept per run, team and round (celebration_scores), and the event's leaderboard is
 * always worked out again from them, so a repeated report can never count twice.
 *
 * Each template's settings lists here must match its rules file (tests check this).
 */
class CelebrationGames
{
    public const TEMPLATES = ['pictureRush', 'wordByWord', 'quiz'];
    public const STATUSES = ['draft', 'published', 'inactive'];
    public const ACTIONS = ['next', 'pause', 'resume', 'end', 'strike'];
    public const COUNTDOWN_MS = 10_000;
    private const MAX_GAMES = 30;
    private const PHOTO_TTL = 12 * 3600;
    private const NUDGE_AFTER_MS = 8_000;

    /** Picture Rush, as FF.PictureRushRules. */
    public const PICTURE_RUSH = [
        'level' => ['easy', 'medium', 'hard', 'expert'],
        'seconds' => [60, 90, 120, 180, 240, 300],
        'reveal' => [0, 3, 5],
        'hints' => [0, 1, 2, 3],
    ];
    private const PR_DEFAULTS = ['level' => 'medium', 'seconds' => 120, 'reveal' => 3, 'hints' => 1];
    private const PR_SCORING = ['base' => 1000, 'speed' => 500, 'hintCost' => 100, 'partial' => 500];
    private const PR_SCORING_MAX = ['base' => 5000, 'speed' => 5000, 'hintCost' => 1000, 'partial' => 5000];
    private const PR_MAX_PHOTOS = 20;

    /** Word by Word, as FF.WordByWordRules. */
    public const WORD_BY_WORD = [
        'mode' => ['open', 'blind'],
        'seconds' => [10, 15, 20, 30, 45, 60],
        'minUnit' => ['rounds', 'words'],
    ];
    private const WBW_DEFAULTS = ['mode' => 'open', 'rounds' => 3, 'minUnit' => 'rounds', 'minCount' => 2, 'seconds' => 20];
    private const WBW_ROUNDS_MAX = 10;
    private const WBW_WORDS_MIN_MAX = 100;
    private const WBW_MAX_NAMES = 20;
    private const WBW_MAX_NAME = 24;
    private const WBW_MAX_OPENING = 60;

    /** Quiz, as FF.QuizRules. */
    public const QUIZ = ['kind' => ['whoKnows'], 'seconds' => [10, 15, 20, 30, 45, 60]];
    private const QUIZ_DEFAULTS = ['kind' => 'whoKnows', 'seconds' => 20, 'points' => 500];
    private const QUIZ_MAX_QUESTIONS = 30;
    private const QUIZ_MAX_TEXT = 140;
    private const QUIZ_MAX_ANSWER = 60;
    private const QUIZ_MAX_WRONG = 3;
    private const QUIZ_POINTS_MIN = 100;
    private const QUIZ_POINTS_MAX = 5000;
    private const NAMES = ['pictureRush' => 'Picture Rush', 'wordByWord' => 'Word by Word', 'quiz' => 'Quiz'];

    public function __construct(
        private Db $db,
        private RealtimeDb $rtdb,
        private Celebrations $events,
        private CelebrationMedia $media,
        private Runner $runner,
        private ?CelebrationWall $wall = null,
    ) {}

    public static function migrate(Db $db, string $engine): void
    {
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_games (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            cid VARCHAR(32) NOT NULL,
            template VARCHAR(24) NOT NULL,
            name VARCHAR(80) NOT NULL,
            instructions TEXT NULL,
            config TEXT NOT NULL,
            status VARCHAR(12) NOT NULL,
            sort INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            deleted_at BIGINT NULL,
            FOREIGN KEY (cid) REFERENCES celebrations (id)
        )$engine");
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_runs (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            cid VARCHAR(32) NOT NULL,
            game_id VARCHAR(32) NOT NULL,
            template VARCHAR(24) NOT NULL,
            name VARCHAR(80) NOT NULL,
            status VARCHAR(12) NOT NULL,
            started_by VARCHAR(140) NOT NULL,
            start_at BIGINT NOT NULL,
            result TEXT NULL,
            created_at BIGINT NOT NULL,
            ended_at BIGINT NULL,
            FOREIGN KEY (cid) REFERENCES celebrations (id)
        )$engine");
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_scores (
            run_id VARCHAR(32) NOT NULL,
            team_id VARCHAR(32) NOT NULL,
            round INTEGER NOT NULL,
            points INTEGER NOT NULL,
            solved INTEGER NOT NULL DEFAULT 0,
            time_ms INTEGER NOT NULL DEFAULT 0,
            moves INTEGER NOT NULL DEFAULT 0,
            hints INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (run_id, team_id, round),
            FOREIGN KEY (run_id) REFERENCES celebration_runs (id)
        )$engine");
        foreach ([
            'CREATE INDEX celebration_games_cid ON celebration_games (cid, sort)',
            'CREATE INDEX celebration_runs_cid ON celebration_runs (cid, status)',
            'CREATE INDEX celebration_runs_status ON celebration_runs (status, created_at)',
        ] as $sql) {
            try { $db->pdo->exec($sql); } catch (\PDOException $e) { /* already there */ }
        }
    }

    /* ---------------------------------------------------------------- the organiser's games */

    public function list(string $cid, AuthUser $user): array
    {
        $this->events->owned($cid, $user);
        $rows = $this->db->all('SELECT * FROM celebration_games WHERE cid = ? AND deleted_at IS NULL ORDER BY sort, created_at', [$cid]);
        return ['games' => array_map(fn ($g) => $this->view($g, false), $rows), 'active' => $this->activeView($cid)];
    }

    public function get(string $cid, string $gid, AuthUser $user): array
    {
        $ev = $this->events->owned($cid, $user);
        // The editor fills the celebrant's name into the quiz's ready-made questions.
        return $this->view($this->game($cid, $gid), true) + ['celebrantName' => (string) ($ev['celebrant_name'] ?? '')];
    }

    public function create(string $cid, AuthUser $user, array $in): array
    {
        $ev = $this->events->owned($cid, $user);
        $template = (string) ($in['template'] ?? '');
        if (!in_array($template, self::TEMPLATES, true)) throw new HttpError(400, 'That game is not available yet.', 'bad-template');
        $n = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_games WHERE cid = ? AND deleted_at IS NULL', [$cid])['n'];
        if ($n >= self::MAX_GAMES) throw new HttpError(429, 'That is a lot of games. Delete one you will not play first.', 'too-many-games');
        $name = $this->events->cleanText($in['name'] ?? '', 80) ?: $this->defaultName($template, $ev);
        $id = newId('g');
        $now = nowMs();
        $this->db->run('INSERT INTO celebration_games (id, cid, template, name, instructions, config, status, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $cid, $template, $name, $this->instructionsFor($template, $ev),
            json_encode($this->sanitize($template, [], $cid)), 'draft', $n, $now, $now,
        ]);
        return $this->view($this->game($cid, $id), true);
    }

    public function save(string $cid, string $gid, AuthUser $user, array $in): array
    {
        $this->events->owned($cid, $user);
        $g = $this->game($cid, $gid);
        $name = $this->events->cleanText($in['name'] ?? $g['name'], 80);
        if ($name === '') throw new HttpError(400, 'Give the game a name.', 'no-name');
        $instructions = $this->events->cleanText($in['instructions'] ?? $g['instructions'], 400, true);
        $config = $this->sanitize($g['template'], is_array($in['config'] ?? null) ? $in['config'] : json_decode($g['config'], true), $cid);
        if ($g['template'] === 'quiz') {
            foreach ($config['questions'] as $q) {
                if ($this->quizProblem($q) === 'same') throw new HttpError(400, 'Two answers are the same.', 'same-answers');
            }
        }
        if ($g['status'] === 'published') $this->ready($g['template'], $config);
        $this->db->run('UPDATE celebration_games SET name = ?, instructions = ?, config = ?, updated_at = ? WHERE id = ?', [
            $name, $instructions, json_encode($config), nowMs(), $gid,
        ]);
        return $this->view($this->game($cid, $gid), true);
    }

    /** publish, unpublish (back to draft), deactivate, duplicate or delete. */
    public function act(string $cid, string $gid, AuthUser $user, string $action): array
    {
        $this->events->owned($cid, $user);
        $g = $this->game($cid, $gid);
        $now = nowMs();
        switch ($action) {
            case 'publish':
                $this->ready($g['template'], json_decode($g['config'], true));
                $this->db->run("UPDATE celebration_games SET status = 'published', updated_at = ? WHERE id = ?", [$now, $gid]);
                break;
            case 'unpublish':
            case 'deactivate':
                if ($this->activeRun($cid, $gid)) throw new HttpError(409, 'This game is being played. End it first.', 'game-live');
                $this->db->run('UPDATE celebration_games SET status = ?, updated_at = ? WHERE id = ?', [$action === 'unpublish' ? 'draft' : 'inactive', $now, $gid]);
                break;
            case 'duplicate':
                $n = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_games WHERE cid = ? AND deleted_at IS NULL', [$cid])['n'];
                if ($n >= self::MAX_GAMES) throw new HttpError(429, 'That is a lot of games. Delete one you will not play first.', 'too-many-games');
                $id = newId('g');
                $this->db->run('INSERT INTO celebration_games (id, cid, template, name, instructions, config, status, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                    $id, $cid, $g['template'], mb_substr('Copy of ' . $g['name'], 0, 80), $g['instructions'], $g['config'], 'draft', $n, $now, $now,
                ]);
                return $this->view($this->game($cid, $id), true);
            case 'delete':
                if ($this->activeRun($cid, $gid)) throw new HttpError(409, 'This game is being played. End it first.', 'game-live');
                $this->db->run('UPDATE celebration_games SET deleted_at = ? WHERE id = ?', [$now, $gid]);
                return ['deleted' => true];
            default:
                throw new HttpError(404, 'Not found.', 'not-found');
        }
        return $this->view($this->game($cid, $gid), true);
    }

    /* ---------------------------------------------------------------- playing */

    /** The organiser starts a published game. Returns the run (the organiser's dev tab referees it). */
    public function start(string $cid, string $gid, AuthUser $user, int $now): array
    {
        return $this->startAs($this->events->owned($cid, $user), $gid, $user->uid, $now);
    }

    /** Starts a game for someone already let in (the organiser, or the MC's private link). */
    public function startAs(array $ev, string $gid, string $actor, int $now): array
    {
        $cid = $ev['id'];
        if ($ev['status'] !== 'active') throw new HttpError(403, 'This celebration is not active.', 'not-active');
        $g = $this->game($cid, $gid);
        if ($g['status'] !== 'published') throw new HttpError(409, 'Publish the game before you start it.', 'not-published');
        $config = $this->sanitize($g['template'], json_decode($g['config'], true), $cid);
        $this->ready($g['template'], $config);

        $teams = [];
        foreach ($this->events->teams($cid) as $t) $teams[$t['id']] = ['name' => $t['name'], 'color' => $t['color'], 'members' => []];
        foreach ($this->db->all('SELECT uid, name, team_id FROM celebration_guests WHERE cid = ? AND removed_at IS NULL AND team_id IS NOT NULL ORDER BY joined_at', [$cid]) as $m) {
            if (isset($teams[$m['team_id']])) $teams[$m['team_id']]['members'][] = ['uid' => $m['uid'], 'name' => $m['name']];
        }
        $teams = array_filter($teams, fn ($t) => count($t['members']) > 0);
        if (!$teams) throw new HttpError(409, 'Nobody is in a team yet. Put guests into teams first.', 'no-players');

        // The picture links the phones will load; the referee shows each one only in its round.
        if ($g['template'] === 'pictureRush') {
            foreach ($config['photos'] as $i => $p) $config['photos'][$i]['url'] = $this->media->url($p['id'], 'play', self::PHOTO_TTL);
        }
        // A draft may hold questions still being written: only the finished ones are played.
        if ($g['template'] === 'quiz') $config['questions'] = $this->quizPlayable($config);

        $runId = newId('r');
        $startAt = $now + self::COUNTDOWN_MS;
        $this->db->transaction(function (Db $db) use ($cid, $runId, $g, $actor, $startAt, $now) {
            $busy = $db->one("SELECT id FROM celebration_runs WHERE cid = ? AND status = 'active'" . $db->forUpdate(), [$cid]);
            if ($busy) throw new HttpError(409, 'Another game is being played. End it first.', 'game-live');
            $db->run('INSERT INTO celebration_runs (id, cid, game_id, template, name, status, started_by, start_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $runId, $cid, $g['id'], $g['template'], $g['name'], 'active', $actor, $startAt, $now,
            ]);
        });
        $run = [
            'runId' => $runId, 'cid' => $cid, 'gameId' => $g['id'], 'template' => $g['template'], 'name' => $g['name'],
            'instructions' => (string) $g['instructions'], 'config' => $config, 'teams' => $teams, 'startAt' => $startAt, 'createdAt' => $now,
            'celebrant' => (string) $ev['celebrant_name'],
            // The countdown waits until every team has pressed "We're ready" (or the MC presses Start now).
            'waitReady' => true,
        ];
        $who = str_starts_with($actor, 'mc:') ? substr($actor, 3) : $actor;
        try {
            $this->rtdb->set('celebrationRuns/' . $runId, $run);
            $this->rtdb->update('celebrations/' . $cid, [
                'run' => null, 'inbox' => null, 'control' => null, 'ready' => null,
                // The MC acts as "mc:<uid>" in the audit, but database keys cannot hold a colon.
                'viewers/' . $who => true,
                'staffers/' . $who => true,
                'live/run' => $this->pointer($runId, $g, $startAt),
            ]);
        } catch (\Throwable $e) {
            error_log('PlayMona Celebrations: could not start ' . $runId . ': ' . $e->getMessage());
            $this->end($runId, 'failed', $now);
            throw new HttpError(503, 'The game could not be started. Please try again.', 'start-failed');
        }
        $this->events->audit($cid, $actor, 'game.start', ['runId' => $runId, 'gameId' => $g['id']]);
        $this->runner->ensure($now);
        return ['runId' => $runId, 'startAt' => $startAt, 'run' => $run];
    }

    /** What is on now and the leaderboard, for the organiser's screen (it may watch the game). */
    public function live(string $cid, AuthUser $user): array
    {
        $this->events->owned($cid, $user);
        $active = $this->activeView($cid);
        if ($active) $this->quiet(fn () => $this->rtdb->update('celebrations/' . $cid, ['viewers/' . $user->uid => true, 'staffers/' . $user->uid => true]));
        return ['active' => $active, 'scores' => $this->scores($cid)];
    }

    /** next, pause, resume, end or (Word by Word) strike a word, for the referee. */
    public function control(string $cid, AuthUser $user, string $action, int $now, mixed $index = null, mixed $word = null): array
    {
        return $this->controlAs($this->events->owned($cid, $user), $user->uid, $action, $now, $index, $word);
    }

    /** A strike names the word as well as its place, so a second strike of the same word cannot take the next one. */
    public function controlAs(array $ev, string $actor, string $action, int $now, mixed $index = null, mixed $word = null): array
    {
        $cid = $ev['id'];
        if (!in_array($action, self::ACTIONS, true)) throw new HttpError(400, 'Unknown action.', 'bad-action');
        $run = $this->db->one("SELECT * FROM celebration_runs WHERE cid = ? AND status = 'active'", [$cid]);
        if (!$run) throw new HttpError(409, 'No game is being played.', 'no-game');
        $control = ['runId' => $run['id'], 'id' => newId('k'), 'action' => $action, 'at' => $now];
        $detail = ['runId' => $run['id']];
        if ($action === 'strike') {
            // Only Word by Word has words to take out.
            if ($run['template'] !== 'wordByWord') throw new HttpError(400, 'Unknown action.', 'bad-action');
            if (!is_int($index) && !(is_string($index) && ctype_digit($index))) throw new HttpError(400, 'Pick the word to strike.', 'bad-index');
            $index = (int) $index;
            if ($index < 0 || $index > 1000) throw new HttpError(400, 'Pick the word to strike.', 'bad-index');
            if (!is_string($word) || trim($word) === '' || mb_strlen($word) > 26) throw new HttpError(400, 'Pick the word to strike.', 'bad-word');
            $control['index'] = $index;
            $control['word'] = $word;
            $detail['index'] = $index;
            $detail['word'] = $word;
        }
        try {
            $this->rtdb->set('celebrations/' . $cid . '/control', $control);
        } catch (\Throwable $e) {
            throw new HttpError(503, 'That did not reach the game. Please try again.', 'control-failed');
        }
        $this->events->audit($cid, $actor, 'game.' . $action, $detail);
        if (!$this->runner->ensure($now) && $action === 'end' && !$this->runner->alive($now) && !$this->devHosted($run)) {
            // Nobody is refereeing: end it here so the event is not stuck.
            $this->end($run['id'], 'abandoned', $now);
        }
        return ['control' => $control];
    }

    /** A phone sees the game stuck: start the runner if it is not running. */
    public function nudge(string $cid, AuthUser $user, int $now): array
    {
        $run = $this->db->one("SELECT * FROM celebration_runs WHERE cid = ? AND status = 'active'", [$cid]);
        if (!$run) return ['ok' => true, 'started' => false];
        $late = $now > (int) $run['start_at'] + self::NUDGE_AFTER_MS;
        return ['ok' => true, 'started' => $late && $this->runner->ensure($now)];
    }

    /** The games the MC may start (published ones), and what is on now. */
    public function forStage(string $cid): array
    {
        $rows = $this->db->all("SELECT * FROM celebration_games WHERE cid = ? AND status = 'published' AND deleted_at IS NULL ORDER BY sort, created_at", [$cid]);
        return ['games' => array_map(fn ($g) => $this->view($g, false), $rows), 'active' => $this->activeView($cid), 'last' => $this->lastResult($cid)];
    }

    /** The games planned, for guests who joined early: names and rules only, never a photo, a title or a link. */
    public function lineup(string $cid, AuthUser $user): array
    {
        $ev = $this->events->event($cid);
        if (!hash_equals((string) $ev['owner_uid'], $user->uid)) $this->events->guestOf($cid, $user->uid);
        $active = $this->db->one("SELECT game_id FROM celebration_runs WHERE cid = ? AND status = 'active'", [$cid]);
        $rows = $this->db->all("SELECT * FROM celebration_games WHERE cid = ? AND status = 'published' AND deleted_at IS NULL ORDER BY sort, created_at", [$cid]);
        return ['games' => array_map(function ($g) use ($active) {
            $config = json_decode($g['config'], true) ?: [];
            return [
                'id' => $g['id'], 'template' => $g['template'], 'name' => $g['name'], 'instructions' => (string) $g['instructions'],
                'rounds' => (int) ($config['rounds'] ?? 0), 'level' => $config['level'] ?? null, 'seconds' => (int) ($config['seconds'] ?? 0),
                'questions' => count($this->quizPlayable($config)), 'kind' => $config['kind'] ?? null,
                'live' => $active !== null && $active['game_id'] === $g['id'],
            ];
        }, $rows)];
    }

    /** The last game that finished: its name and the teams' places, for the winner screen. */
    public function lastResult(string $cid): ?array
    {
        $run = $this->db->one("SELECT id, name, result, ended_at FROM celebration_runs WHERE cid = ? AND status = 'ended' ORDER BY ended_at DESC", [$cid]);
        if (!$run) return null;
        $result = json_decode((string) $run['result'], true) ?: [];
        return ['runId' => $run['id'], 'name' => $run['name'], 'ranked' => $result['ranked'] ?? [], 'endedAt' => (int) $run['ended_at']];
    }

    /** Lets this signed-in phone read the game being played (celebrations/<cid>/run). */
    public function allowViewer(string $cid, string $uid): void
    {
        $this->quiet(fn () => $this->rtdb->set('celebrations/' . $cid . '/viewers/' . $uid, true));
    }

    /** The MC and the organiser may read what guests may not (a blind Word by Word message). Never the TV. */
    public function allowStaff(string $cid, string $uid): void
    {
        $this->quiet(fn () => $this->rtdb->set('celebrations/' . $cid . '/staffers/' . $uid, true));
    }

    /* ---------------------------------------------------------------- reports from the referee */

    /** A run finished: keep every team's points per round, then the leaderboard. Repeats change nothing. */
    public function recordResult(array $r, int $now): void
    {
        $runId = (string) ($r['runId'] ?? $r['matchId'] ?? '');
        $cid = null;
        $done = $this->db->transaction(function (Db $db) use ($runId, $r, $now, &$cid) {
            $run = $db->one('SELECT * FROM celebration_runs WHERE id = ?' . $db->forUpdate(), [$runId]);
            if (!$run || $run['status'] !== 'active') return false;
            $cid = $run['cid'];
            $teams = array_column($this->events->teams($cid), 'id');
            foreach ((array) ($r['rounds'] ?? []) as $row) {
                if (!is_array($row)) continue;
                $round = max(0, min(100, (int) ($row['round'] ?? 0)));
                foreach ((array) ($row['teams'] ?? []) as $tid => $s) {
                    if (!in_array($tid, $teams, true) || !is_array($s)) continue;
                    $db->run('INSERT INTO celebration_scores (run_id, team_id, round, points, solved, time_ms, moves, hints) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                        $runId, $tid, $round, max(0, min(100000, (int) ($s['points'] ?? 0))), !empty($s['solved']) ? 1 : 0,
                        max(0, min(86_400_000, (int) ($s['usedMs'] ?? 0))), max(0, min(100000, (int) ($s['moves'] ?? 0))), max(0, min(100, (int) ($s['hints'] ?? 0))),
                    ]);
                }
            }
            $ranked = array_values(array_filter((array) ($r['ranked'] ?? []), fn ($x) => is_array($x) && in_array($x['teamId'] ?? null, $teams, true)));
            $ranked = array_map(fn ($x) => ['teamId' => $x['teamId'], 'place' => (int) ($x['place'] ?? 0), 'points' => (int) ($x['points'] ?? 0)], $ranked);
            $db->run("UPDATE celebration_runs SET status = 'ended', result = ?, ended_at = ? WHERE id = ?", [
                json_encode(['why' => (string) ($r['why'] ?? ''), 'ranked' => $ranked]), $now, $runId,
            ]);
            return $run['template'];
        });
        if (!$done) return;
        if ($done === 'wordByWord' && $this->wall && is_array($r['message'] ?? null)) {
            // The message everyone wrote goes to the Wall of Love (and from there into the memory book).
            // If that fails, the game still ends: phones, the TV and the runner must hear of it.
            $msg = $r['message'];
            $this->quiet(fn () => $this->wall->fromGame($cid, $runId, (string) ($msg['text'] ?? ''), count(array_filter((array) ($msg['words'] ?? []), 'is_array'))));
        }
        $this->clearRun($runId);
        $this->publishScores($cid);
        $this->quiet(fn () => $this->rtdb->set('celebrations/' . $cid . '/live/run', null));
    }

    /** The runner is refereeing these runs; returns the ones it should drop. */
    public function stillActive(array $ids): array
    {
        $ids = array_values(array_filter($ids, 'is_string'));
        if (!$ids) return [];
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $live = array_column($this->db->all("SELECT id FROM celebration_runs WHERE status = 'active' AND id IN ($marks)", $ids), 'id');
        return array_values(array_diff($ids, $live));
    }

    /** Runs nobody finished within a day: end them so the runner lets go. */
    public function sweep(int $now): int
    {
        $old = $this->db->all("SELECT id FROM celebration_runs WHERE status = 'active' AND created_at < ?", [$now - 24 * 3600 * 1000]);
        foreach ($old as $r) $this->end($r['id'], 'abandoned', $now);
        return count($old);
    }

    public function end(string $runId, string $status, int $now): void
    {
        $run = $this->db->one('SELECT cid FROM celebration_runs WHERE id = ?', [$runId]);
        $this->db->run("UPDATE celebration_runs SET status = ?, ended_at = ? WHERE id = ? AND status = 'active'", [$status, $now, $runId]);
        $this->clearRun($runId);
        if ($run) $this->quiet(fn () => $this->rtdb->set('celebrations/' . $run['cid'] . '/live/run', null));
    }

    /* ---------------------------------------------------------------- the leaderboard */

    /** Every team's total over the games played, best first. Ties: less time, then name order. */
    public function scores(string $cid): array
    {
        $totals = [];
        foreach ($this->events->teams($cid) as $t) {
            $totals[$t['id']] = ['teamId' => $t['id'], 'name' => $t['name'], 'color' => $t['color'], 'points' => 0, 'timeMs' => 0, 'games' => 0];
        }
        $rows = $this->db->all("SELECT s.team_id, SUM(s.points) AS points, SUM(s.time_ms) AS time_ms, COUNT(DISTINCT s.run_id) AS games
            FROM celebration_scores s JOIN celebration_runs r ON r.id = s.run_id
            WHERE r.cid = ? AND r.status = 'ended' GROUP BY s.team_id", [$cid]);
        foreach ($rows as $row) {
            if (!isset($totals[$row['team_id']])) continue;
            $totals[$row['team_id']]['points'] = (int) $row['points'];
            $totals[$row['team_id']]['timeMs'] = (int) $row['time_ms'];
            $totals[$row['team_id']]['games'] = (int) $row['games'];
        }
        $list = array_values($totals);
        usort($list, fn ($a, $b) => [$b['points'], $a['timeMs'], $a['name']] <=> [$a['points'], $b['timeMs'], $b['name']]);
        foreach ($list as $i => &$t) {
            $prev = $list[$i - 1] ?? null;
            $t['place'] = $prev && $prev['points'] === $t['points'] && $prev['timeMs'] === $t['timeMs'] ? $prev['place'] : $i + 1;
        }
        return $list;
    }

    public function publishScores(string $cid): void
    {
        $out = [];
        foreach ($this->scores($cid) as $t) $out[$t['teamId']] = ['points' => $t['points'], 'place' => $t['place'], 'games' => $t['games']];
        $this->quiet(fn () => $this->rtdb->set('celebrations/' . $cid . '/live/scores', $out ?: null));
    }

    /* ---------------------------------------------------------------- settings */

    /** A template's settings and content, strictly: unknown values go back to the standard. */
    public function sanitize(string $template, mixed $raw, string $cid): array
    {
        $raw = is_array($raw) ? $raw : [];
        if ($template === 'wordByWord') return $this->sanitizeWords($raw);
        if ($template === 'quiz') return $this->sanitizeQuiz($raw);
        if ($template !== 'pictureRush') throw new HttpError(400, 'That game is not available yet.', 'bad-template');
        $pick = function (string $k) use ($raw) {
            $v = $raw[$k] ?? null;
            $allowed = self::PICTURE_RUSH[$k];
            if (is_int($allowed[0]) && is_numeric($v)) $v = (int) $v;
            return in_array($v, $allowed, true) ? $v : self::PR_DEFAULTS[$k];
        };
        $photos = [];
        $ids = [];
        foreach (array_slice(array_values(array_filter((array) ($raw['photos'] ?? []), 'is_array')), 0, self::PR_MAX_PHOTOS) as $p) {
            $id = (string) ($p['id'] ?? '');
            if (!preg_match('/^m_[a-f0-9]{24}$/', $id) || isset($ids[$id])) continue;
            $ids[$id] = true;
            $photos[] = ['id' => $id, 'title' => $this->events->cleanText($p['title'] ?? '', 60), 'hint' => $this->events->cleanText($p['hint'] ?? '', 120)];
        }
        if ($photos) {
            // Only this celebration's own puzzle pictures.
            $marks = implode(',', array_fill(0, count($photos), '?'));
            $mine = array_column($this->db->all("SELECT id FROM celebration_media WHERE cid = ? AND purpose = 'puzzle' AND deleted_at IS NULL AND id IN ($marks)", array_merge([$cid], array_column($photos, 'id'))), 'id');
            $photos = array_values(array_filter($photos, fn ($p) => in_array($p['id'], $mine, true)));
        }
        $scoring = [];
        $s = is_array($raw['scoring'] ?? null) ? $raw['scoring'] : [];
        foreach (self::PR_SCORING as $k => $d) {
            $scoring[$k] = isset($s[$k]) && is_numeric($s[$k]) ? max(0, min(self::PR_SCORING_MAX[$k], (int) round((float) $s[$k]))) : $d;
        }
        $rounds = isset($raw['rounds']) && is_numeric($raw['rounds']) ? max(1, min(self::PR_MAX_PHOTOS, (int) $raw['rounds'])) : max(1, count($photos));
        return [
            'level' => $pick('level'), 'seconds' => $pick('seconds'), 'reveal' => $pick('reveal'), 'hints' => $pick('hints'),
            'rounds' => $photos ? min($rounds, count($photos)) : $rounds,
            'scoring' => $scoring,
            'photos' => $photos,
        ];
    }

    /** Word by Word's settings, as FF.WordByWordRules.sanitize. */
    private function sanitizeWords(array $raw): array
    {
        $int = function ($v, int $lo, int $hi, int $fallback): int {
            if ($v === null || $v === '' || !is_numeric($v)) return $fallback;
            return max($lo, min($hi, (int) round((float) $v)));
        };
        $pick = function (string $k) use ($raw) {
            $v = $raw[$k] ?? null;
            $allowed = self::WORD_BY_WORD[$k];
            if (is_int($allowed[0]) && is_numeric($v)) $v = (int) $v;
            return in_array($v, $allowed, true) ? $v : self::WBW_DEFAULTS[$k];
        };
        $rounds = $int($raw['rounds'] ?? null, 1, self::WBW_ROUNDS_MAX, self::WBW_DEFAULTS['rounds']);
        $minUnit = $pick('minUnit');
        $minCount = $int($raw['minCount'] ?? null, 0, $minUnit === 'rounds' ? $rounds : self::WBW_WORDS_MIN_MAX, min(self::WBW_DEFAULTS['minCount'], $rounds));
        $names = [];
        $seen = [];
        foreach ((array) ($raw['names'] ?? []) as $n) {
            if (!is_string($n) || count($names) >= self::WBW_MAX_NAMES) continue;
            $n = $this->events->cleanText($n, 100);
            if ($n === '' || preg_match('/\s/u', $n) || mb_strlen($n) > self::WBW_MAX_NAME) continue;
            $key = mb_strtolower($n);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $names[] = $n;
        }
        return [
            'mode' => $pick('mode'), 'rounds' => $rounds, 'minUnit' => $minUnit, 'minCount' => $minCount,
            'seconds' => $pick('seconds'), 'opening' => $this->events->cleanText($raw['opening'] ?? '', self::WBW_MAX_OPENING), 'names' => $names,
        ];
    }

    /** The quiz's settings, as FF.QuizRules.sanitize. Incomplete questions are kept: a draft may hold them. */
    private function sanitizeQuiz(array $raw): array
    {
        $pick = function (string $k) use ($raw) {
            $v = $raw[$k] ?? null;
            $allowed = self::QUIZ[$k];
            if (is_int($allowed[0]) && is_numeric($v)) $v = (int) $v;
            return in_array($v, $allowed, true) ? $v : self::QUIZ_DEFAULTS[$k];
        };
        $p = $raw['points'] ?? null;
        $points = $p === null || $p === '' || !is_numeric($p) ? self::QUIZ_DEFAULTS['points']
            : max(self::QUIZ_POINTS_MIN, min(self::QUIZ_POINTS_MAX, (int) (round((float) $p / 100) * 100)));
        $questions = [];
        $rows = array_values(array_filter((array) ($raw['questions'] ?? []), 'is_array'));
        foreach (array_slice($rows, 0, self::QUIZ_MAX_QUESTIONS) as $i => $q) {
            $id = is_string($q['id'] ?? null) && preg_match('/^[A-Za-z0-9_-]{1,24}$/', $q['id']) ? $q['id'] : 'q' . $i;
            $wrong = [];
            foreach ((array) ($q['wrong'] ?? []) as $w) {
                $w = $this->events->cleanText($w, self::QUIZ_MAX_ANSWER);
                if ($w !== '' && count($wrong) < self::QUIZ_MAX_WRONG) $wrong[] = $w;
            }
            $questions[] = [
                'id' => $id, 'text' => $this->events->cleanText($q['text'] ?? '', self::QUIZ_MAX_TEXT),
                'right' => $this->events->cleanText($q['right'] ?? '', self::QUIZ_MAX_ANSWER), 'wrong' => $wrong,
            ];
        }
        return ['kind' => $pick('kind'), 'seconds' => $pick('seconds'), 'points' => $points, 'questions' => $questions];
    }

    /** Why a quiz question can't be played yet, or '' when it can (as FF.QuizRules.problem). */
    private function quizProblem(array $q): string
    {
        if (($q['text'] ?? '') === '') return 'noText';
        if (($q['right'] ?? '') === '') return 'noRight';
        if (!($q['wrong'] ?? [])) return 'noWrong';
        $seen = [];
        foreach (array_merge([$q['right']], $q['wrong']) as $a) {
            $k = mb_strtolower((string) preg_replace('/\s+/u', '', (string) $a));
            if (isset($seen[$k])) return 'same';
            $seen[$k] = true;
        }
        return '';
    }

    /** The quiz questions that can be played, in order (none for other templates). */
    private function quizPlayable(array $config): array
    {
        if (!isset($config['questions']) || !is_array($config['questions'])) return [];
        return array_values(array_filter($config['questions'], fn ($q) => is_array($q) && $this->quizProblem($q) === ''));
    }

    /** A new game's name when the organiser gives none. */
    private function defaultName(string $template, array $ev): string
    {
        if ($template === 'quiz') {
            $first = preg_split('/\s+/u', trim((string) ($ev['celebrant_name'] ?? '')))[0] ?? '';
            return 'Who Knows ' . ($first !== '' ? $first : 'the celebrant') . ' Best?';
        }
        return self::NAMES[$template];
    }

    /** What the guests read first, by template. */
    private function instructionsFor(string $template, array $ev): string
    {
        if ($template === 'quiz') {
            $who = trim((string) ($ev['celebrant_name'] ?? ''));
            $first = $who !== '' ? (preg_split('/\s+/u', $who)[0] ?? '') : '';
            return "Pick your team's answer together. Anyone in the team can change it until the time runs out."
                . ($first !== '' ? ' ' . $first . ', sit this one out: you know them all!' : '');
        }
        if ($template === 'wordByWord') {
            $who = trim((string) ($ev['celebrant_name'] ?? '')) ?: 'the celebrant';
            return 'Write a message to ' . $who . ' together, one word per turn. Every letter is a point.';
        }
        return 'Rebuild the photo with your team: swap two tiles at a time until the picture is whole.';
    }

    /** Can this be played? */
    private function ready(string $template, mixed $config): void
    {
        if ($template === 'pictureRush' && empty($config['photos'])) {
            throw new HttpError(409, 'Add at least one photo first.', 'no-photos');
        }
        if ($template === 'quiz' && !$this->quizPlayable(is_array($config) ? $config : [])) {
            throw new HttpError(409, 'Add at least one question with its answers.', 'no-questions');
        }
    }

    /* ---------------------------------------------------------------- helpers */

    private function view(array $g, bool $full): array
    {
        $config = json_decode($g['config'], true) ?: [];
        $out = [
            'id' => $g['id'], 'template' => $g['template'], 'name' => $g['name'], 'instructions' => (string) $g['instructions'],
            'status' => $g['status'], 'photos' => count($config['photos'] ?? []), 'rounds' => (int) ($config['rounds'] ?? 0),
            'level' => $config['level'] ?? null, 'seconds' => (int) ($config['seconds'] ?? 0), 'updatedAt' => (int) $g['updated_at'],
            'mode' => $config['mode'] ?? null,
            'questions' => count($this->quizPlayable($config)), 'kind' => $config['kind'] ?? null,
        ];
        $first = $config['photos'][0]['id'] ?? null;
        if ($first) $out['thumb'] = $this->media->url($first, 'thumb', 6 * 3600);
        if ($full) {
            foreach ($config['photos'] ?? [] as $i => $p) {
                $config['photos'][$i]['thumb'] = $this->media->url($p['id'], 'thumb', 6 * 3600);
                $config['photos'][$i]['play'] = $this->media->url($p['id'], 'play', 6 * 3600);
            }
            $out['config'] = $config;
        }
        return $out;
    }

    private function activeView(string $cid): ?array
    {
        $run = $this->db->one("SELECT * FROM celebration_runs WHERE cid = ? AND status = 'active' ORDER BY created_at DESC", [$cid]);
        return $run ? ['runId' => $run['id'], 'gameId' => $run['game_id'], 'template' => $run['template'], 'name' => $run['name'], 'startAt' => (int) $run['start_at']] : null;
    }

    private function pointer(string $runId, array $g, int $startAt): array
    {
        return ['runId' => $runId, 'gameId' => $g['id'], 'template' => $g['template'], 'name' => $g['name'], 'startAt' => $startAt];
    }

    private function activeRun(string $cid, string $gid): bool
    {
        return (bool) $this->db->one("SELECT id FROM celebration_runs WHERE cid = ? AND game_id = ? AND status = 'active'", [$cid, $gid]);
    }

    /** A dev run (local testing) is refereed in the organiser's tab, not the runner. */
    private function devHosted(array $run): bool
    {
        return $this->rtdb instanceof \PlayMona\FileRtdb;
    }

    private function game(string $cid, string $gid): array
    {
        $g = $this->db->one('SELECT * FROM celebration_games WHERE id = ? AND cid = ? AND deleted_at IS NULL', [$gid, $cid]);
        if (!$g) throw new HttpError(404, 'That game was not found.', 'no-game');
        return $g;
    }

    private function clearRun(string $runId): void
    {
        $this->quiet(function () use ($runId) {
            $this->rtdb->set('celebrationRuns/' . $runId, null);
            $this->rtdb->set('celebrationState/' . $runId, null);
        });
    }

    private function quiet(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('PlayMona Celebrations games: ' . $e->getMessage());
        }
    }
}
