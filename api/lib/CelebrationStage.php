<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * The room at a celebration: the TV display and the MC panel (PlayMona Celebrations).
 *
 * Both open with a private link (/c/<slug>/tv#k=... and /c/<slug>/mc#k=...); the secret travels in
 * the x-celebration-key header. The phone or laptop signs in anonymously, and opening the page lets
 * that sign-in read the game being played (celebrations/<cid>/viewers/<uid>).
 *
 * What the TV shows is the MC's choice, kept with the event (celebrations.display) and copied to
 * celebrations/<cid>/live/display so the TV changes at once:
 *   { layout: auto|welcome|game|scores|wall|winner, showQr: bool, messageId: w_... or null, at }
 * "auto" follows the evening: the game while one is played, otherwise the welcome screen, the
 * scores and the wall in turn. The TV only ever receives approved messages.
 */
class CelebrationStage
{
    public const LAYOUTS = ['auto', 'welcome', 'game', 'scores', 'wall', 'winner'];
    private const DEFAULT_DISPLAY = ['layout' => 'auto', 'showQr' => true, 'messageId' => null, 'at' => 0];

    public function __construct(
        private Db $db,
        private RealtimeDb $rtdb,
        private Celebrations $events,
        private CelebrationGames $games,
        private CelebrationWall $wall,
    ) {}

    public static function migrate(Db $db, string $engine): void
    {
        try { $db->pdo->exec('ALTER TABLE celebrations ADD COLUMN display TEXT NULL'); } catch (\PDOException $e) { /* already there */ }
    }

    /** The event behind a private link, if the secret is one of these roles. Wrong secrets all look the same. */
    public function open(string $cid, ?string $key, array $roles): array
    {
        $ev = $this->events->event($cid);
        $role = $this->events->roleFor($ev, $key);
        if (!$role || !in_array($role, $roles, true) || $ev['status'] !== 'active') {
            throw new HttpError(403, 'This link does not work any more. Ask the organiser for a new one.', 'bad-link');
        }
        return $ev;
    }

    /** Everything the TV needs that is not live: the event, how to join, the scores, approved messages. */
    public function screen(array $ev, AuthUser $viewer): array
    {
        $this->games->allowViewer($ev['id'], $viewer->uid);
        $stage = $this->games->forStage($ev['id']);
        return [
            'event' => $this->events->publicView($ev),
            'join' => $this->join($ev),
            'display' => $this->display($ev),
            'scores' => $this->games->scores($ev['id']),
            'active' => $stage['active'],
            'last' => $stage['last'],
            'messages' => $this->wall->forStage($ev['id'], false)['approved'],
        ];
    }

    /** The MC's panel: the TV's state, the games to start, the scores and the messages to read. */
    public function panel(array $ev, AuthUser $mc): array
    {
        $this->games->allowViewer($ev['id'], $mc->uid);
        $this->games->allowStaff($ev['id'], $mc->uid);
        $stage = $this->games->forStage($ev['id']);
        $messages = $this->wall->forStage($ev['id'], true);
        return [
            'event' => $this->events->publicView($ev),
            'join' => $this->join($ev),
            'display' => $this->display($ev),
            'scores' => $this->games->scores($ev['id']),
            'games' => $stage['games'],
            'active' => $stage['active'],
            'last' => $stage['last'],
            'messages' => $messages['approved'],
            'waiting' => $messages['waiting'],
        ];
    }

    /** The MC changes what the TV shows. Only the fields sent change. */
    public function setDisplay(array $ev, AuthUser $mc, array $in): array
    {
        return $this->saveDisplay($ev, 'mc:' . $mc->uid, $in);
    }

    /** The organiser's own switch for the TV's "Scan to join" QR code (the MC has the full controls). */
    public function ownerQr(string $cid, AuthUser $user): array
    {
        return ['showQr' => $this->display($this->events->owned($cid, $user))['showQr']];
    }

    public function setOwnerQr(string $cid, AuthUser $user, array $in): array
    {
        $ev = $this->events->owned($cid, $user);
        $d = $this->saveDisplay($ev, $user->uid, ['showQr' => !empty($in['showQr'])])['display'];
        return ['showQr' => $d['showQr']];
    }

    private function saveDisplay(array $ev, string $actor, array $in): array
    {
        $d = $this->display($ev);
        if (array_key_exists('layout', $in)) {
            if (!in_array($in['layout'], self::LAYOUTS, true)) throw new HttpError(400, 'Unknown screen.', 'bad-layout');
            $d['layout'] = $in['layout'];
            // Picking a screen lets go of a message shown on its own.
            if (!array_key_exists('messageId', $in)) $d['messageId'] = null;
        }
        if (array_key_exists('showQr', $in)) $d['showQr'] = (bool) $in['showQr'];
        if (array_key_exists('messageId', $in)) {
            $mid = $in['messageId'];
            if ($mid === null || $mid === '') {
                $d['messageId'] = null;
            } else {
                // Only an approved message can go on the TV.
                if (!is_string($mid) || !$this->wall->approvedOne($ev['id'], $mid)) {
                    throw new HttpError(409, 'Put the message on the wall first.', 'not-approved');
                }
                $d['messageId'] = $mid;
                $d['layout'] = 'wall';
            }
        }
        $d['at'] = nowMs();
        $this->db->run('UPDATE celebrations SET display = ? WHERE id = ?', [json_encode($d), $ev['id']]);
        try {
            $this->rtdb->set('celebrations/' . $ev['id'] . '/live/display', $d);
        } catch (\Throwable $e) {
            error_log('PlayMona Celebrations stage: ' . $e->getMessage());
        }
        $this->events->audit($ev['id'], $actor, 'mc.display', ['layout' => $d['layout'], 'showQr' => $d['showQr'], 'messageId' => $d['messageId']]);
        return ['display' => $d];
    }

    public function start(array $ev, AuthUser $mc, string $gid, int $now): array
    {
        return $this->games->startAs($ev, $gid, 'mc:' . $mc->uid, $now) + ['viewer' => $mc->uid];
    }

    public function control(array $ev, AuthUser $mc, string $action, int $now, mixed $index = null, mixed $word = null): array
    {
        return $this->games->controlAs($ev, 'mc:' . $mc->uid, $action, $now, $index, $word);
    }

    /** The MC approves or holds back a message; the organiser's Wall tab can do more (delete, names). */
    public function moderate(array $ev, AuthUser $mc, string $mid, string $action): array
    {
        if (!in_array($action, ['approve', 'reject'], true)) throw new HttpError(404, 'Not found.', 'not-found');
        $this->wall->moderateAs($ev, $mid, 'mc:' . $mc->uid, $action);
        if ($action === 'reject') {
            // A message taken off the wall leaves the TV too.
            $d = $this->display($ev);
            if ($d['messageId'] === $mid) $this->setDisplay($this->events->event($ev['id']), $mc, ['messageId' => null]);
        }
        $messages = $this->wall->forStage($ev['id'], true);
        return ['messages' => $messages['approved'], 'waiting' => $messages['waiting'], 'display' => $this->display($this->events->event($ev['id']))];
    }

    /* ---------------------------------------------------------------- helpers */

    public function display(array $ev): array
    {
        $d = json_decode((string) ($ev['display'] ?? ''), true);
        $d = is_array($d) ? array_merge(self::DEFAULT_DISPLAY, array_intersect_key($d, self::DEFAULT_DISPLAY)) : self::DEFAULT_DISPLAY;
        if (!in_array($d['layout'], self::LAYOUTS, true)) $d['layout'] = 'auto';
        $d['showQr'] = (bool) $d['showQr'];
        return $d;
    }

    /** How guests join: the address (with the code for a private event) and the code to type. */
    private function join(array $ev): array
    {
        $settings = json_decode($ev['settings'], true) ?: [];
        return ['code' => $ev['join_code'], 'private' => !empty($settings['private'])];
    }
}
