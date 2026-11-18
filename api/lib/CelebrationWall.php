<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * The Wall of Love: guests' messages (with an optional photo) for the person being celebrated.
 *
 * Guests who joined write messages from the event page. When the event asks for approval (the
 * default), a message waits for the organiser before anyone else sees it; guests always see
 * their own. Approved messages show on the event page, and later on the TV. The celebrant reads
 * every approved message on their private link, marks favourites and makes the memory book.
 * Anonymous messages hide the writer's name from everyone but the organiser, who moderates.
 * Enough reports from guests take a message off the wall until the organiser looks again.
 *
 * Photos are stored like every celebration picture: redrawn without hidden data, kept outside
 * the web root, served only by signed links.
 */
class CelebrationWall
{
    public const CATEGORIES = ['wish', 'memory', 'advice', 'thanks', 'funny'];
    public const ACTIONS = ['approve', 'reject', 'pending', 'delete'];
    public const MAX_BODY = 1000;
    public const PER_HOUR = 20;            // messages one guest may send in an hour
    public const HIDE_AFTER_REPORTS = 3;
    private const LIST_MAX = 500;
    private const PHOTO_TTL = 6 * 3600;

    public function __construct(private Db $db, private Celebrations $events, private CelebrationMedia $media) {}

    public static function migrate(Db $db, string $engine): void
    {
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_messages (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            cid VARCHAR(32) NOT NULL,
            uid VARCHAR(128) NOT NULL,
            name VARCHAR(40) NOT NULL,
            anonymous INTEGER NOT NULL DEFAULT 0,
            category VARCHAR(12) NOT NULL,
            body TEXT NOT NULL,
            media_id VARCHAR(32) NULL,
            status VARCHAR(12) NOT NULL,
            favourite INTEGER NOT NULL DEFAULT 0,
            reports INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            moderated_at BIGINT NULL,
            deleted_at BIGINT NULL,
            FOREIGN KEY (cid) REFERENCES celebrations (id)
        )$engine");
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_reports (
            message_id VARCHAR(32) NOT NULL,
            uid VARCHAR(128) NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (message_id, uid)
        )$engine");
        foreach ([
            'CREATE INDEX celebration_messages_cid ON celebration_messages (cid, status, created_at)',
            'CREATE INDEX celebration_messages_uid ON celebration_messages (uid, created_at)',
        ] as $sql) {
            try { $db->pdo->exec($sql); } catch (\PDOException $e) { /* already there */ }
        }
    }

    /* ---------------------------------------------------------------- guests */

    /** A photo for a message, uploaded first; it is attached when the message is sent. */
    public function photo(string $cid, AuthUser $user, string $bytes): array
    {
        [$ev] = $this->member($cid, $user);
        if (!$this->events->settingsOf($ev)['photoUploads']) throw new HttpError(403, 'This celebration does not take photos with messages.', 'no-photos');
        return $this->events->storeMedia($cid, $user->uid, 'message', $bytes);
    }

    public function post(string $cid, AuthUser $user, array $in): array
    {
        [$ev, $guest] = $this->member($cid, $user);
        $settings = $this->events->settingsOf($ev);
        $body = $this->events->cleanText($in['body'] ?? '', self::MAX_BODY, true);
        if (mb_strlen($body) < 2) throw new HttpError(400, 'Write your message first.', 'no-message');
        $category = in_array($in['category'] ?? null, self::CATEGORIES, true) ? $in['category'] : 'wish';
        $anonymous = !empty($in['anonymous']);
        if ($anonymous && !$settings['anonymousMessages']) throw new HttpError(403, 'Messages at this celebration carry your name.', 'no-anonymous');
        $name = $this->events->cleanText($in['name'] ?? '', 40) ?: $guest['name'];
        $now = nowMs();

        $mediaId = null;
        if (!empty($in['mediaId'])) {
            if (!$settings['photoUploads']) throw new HttpError(403, 'This celebration does not take photos with messages.', 'no-photos');
            $mediaId = (string) $in['mediaId'];
            $m = $this->db->one("SELECT id FROM celebration_media WHERE id = ? AND cid = ? AND uid = ? AND purpose = 'message' AND deleted_at IS NULL", [$mediaId, $cid, $user->uid]);
            $used = $this->db->one('SELECT id FROM celebration_messages WHERE media_id = ?', [$mediaId]);
            if (!$m || $used) throw new HttpError(400, 'That photo did not upload. Add it again.', 'bad-photo');
        }
        $recent = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_messages WHERE cid = ? AND uid = ? AND created_at > ?', [$cid, $user->uid, $now - 3600_000])['n'];
        if ($recent >= self::PER_HOUR) throw new HttpError(429, 'That is a lot of messages. Please wait a little before sending more.', 'rate-limit');

        $id = newId('w');
        $this->db->run('INSERT INTO celebration_messages (id, cid, uid, name, anonymous, category, body, media_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $cid, $user->uid, $name, $anonymous ? 1 : 0, $category, $body, $mediaId, $settings['approveMessages'] ? 'pending' : 'approved', $now,
        ]);
        return ['message' => $this->view($this->row($cid, $id), 'own', $user->uid)];
    }

    /** The approved wall and the guest's own messages (whatever their status). */
    public function forGuest(string $cid, AuthUser $user): array
    {
        $this->member($cid, $user);
        $wall = $this->db->all("SELECT * FROM celebration_messages WHERE cid = ? AND status = 'approved' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT " . self::LIST_MAX, [$cid]);
        $mine = $this->db->all('SELECT * FROM celebration_messages WHERE cid = ? AND uid = ? AND deleted_at IS NULL ORDER BY created_at DESC', [$cid, $user->uid]);
        $reported = array_column($this->db->all('SELECT r.message_id FROM celebration_reports r JOIN celebration_messages m ON m.id = r.message_id WHERE m.cid = ? AND r.uid = ?', [$cid, $user->uid]), 'message_id');
        return [
            'wall' => array_map(function ($m) use ($user, $reported) {
                $v = $this->view($m, 'public', $user->uid);
                $v['reported'] = in_array($m['id'], $reported, true);
                return $v;
            }, $wall),
            'mine' => array_map(fn ($m) => $this->view($m, 'own', $user->uid), $mine),
        ];
    }

    /** A guest takes back their own message. */
    public function remove(string $cid, AuthUser $user, string $mid): array
    {
        $this->member($cid, $user);
        $m = $this->row($cid, $mid);
        if (!hash_equals($m['uid'], $user->uid)) throw new HttpError(403, 'You can only remove your own messages.', 'not-yours');
        $this->db->run('UPDATE celebration_messages SET deleted_at = ? WHERE id = ?', [nowMs(), $mid]);
        return ['deleted' => true];
    }

    /** A guest reports a message on the wall. Enough reports take it off until the organiser decides. */
    public function report(string $cid, AuthUser $user, string $mid): array
    {
        $this->member($cid, $user);
        $m = $this->row($cid, $mid);
        if ($m['status'] !== 'approved') throw new HttpError(404, 'That message is not on the wall.', 'not-found');
        if (hash_equals($m['uid'], $user->uid)) throw new HttpError(400, 'That is your own message. You can remove it instead.', 'own-message');
        if ($this->db->one('SELECT uid FROM celebration_reports WHERE message_id = ? AND uid = ?', [$mid, $user->uid])) return ['reported' => true];
        $this->db->run('INSERT INTO celebration_reports (message_id, uid, created_at) VALUES (?, ?, ?)', [$mid, $user->uid, nowMs()]);
        $n = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_reports WHERE message_id = ?', [$mid])['n'];
        $hide = $n >= self::HIDE_AFTER_REPORTS;
        $this->db->run('UPDATE celebration_messages SET reports = ?' . ($hide ? ", status = 'pending'" : '') . ' WHERE id = ?', [$n, $mid]);
        if ($hide) $this->events->audit($cid, 'guests', 'message.hidden', ['id' => $mid, 'reports' => $n]);
        return ['reported' => true];
    }

    /* ---------------------------------------------------------------- the organiser */

    public function manage(string $cid, AuthUser $user): array
    {
        $this->events->owned($cid, $user);
        $rows = $this->db->all('SELECT * FROM celebration_messages WHERE cid = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ' . self::LIST_MAX, [$cid]);
        $counts = ['pending' => 0, 'approved' => 0, 'rejected' => 0];
        foreach ($rows as $r) $counts[$r['status']] = ($counts[$r['status']] ?? 0) + 1;
        return ['messages' => array_map(fn ($m) => $this->view($m, 'organiser'), $rows), 'counts' => $counts];
    }

    /** approve, reject, pending (back to waiting) or delete. */
    public function moderate(string $cid, string $mid, AuthUser $user, string $action): array
    {
        $this->events->owned($cid, $user);
        if (!in_array($action, self::ACTIONS, true)) throw new HttpError(404, 'Not found.', 'not-found');
        $m = $this->row($cid, $mid);
        $now = nowMs();
        if ($action === 'delete') {
            $this->db->run('UPDATE celebration_messages SET deleted_at = ? WHERE id = ?', [$now, $mid]);
            if ($m['media_id']) $this->db->run('UPDATE celebration_media SET deleted_at = ? WHERE id = ?', [$now, $m['media_id']]);
        } else {
            $status = ['approve' => 'approved', 'reject' => 'rejected', 'pending' => 'pending'][$action];
            // Approving again clears the reports: the organiser has looked at it.
            $this->db->run('UPDATE celebration_messages SET status = ?, moderated_at = ?' . ($action === 'approve' ? ', reports = 0' : '') . ' WHERE id = ?', [$status, $now, $mid]);
            if ($action === 'approve') $this->db->run('DELETE FROM celebration_reports WHERE message_id = ?', [$mid]);
        }
        $this->events->audit($cid, $user->uid, 'message.' . $action, ['id' => $mid]);
        return $this->manage($cid, $user);
    }

    /** The memory book for the organiser: what the celebrant sees. */
    public function bookForOrganiser(string $cid, AuthUser $user): array
    {
        return $this->forCelebrant($this->events->owned($cid, $user));
    }

    /* ---------------------------------------------------------------- the celebrant */

    /** Every approved message, oldest first, with full-size photos to keep. */
    public function forCelebrant(array $ev): array
    {
        $rows = $this->db->all("SELECT * FROM celebration_messages WHERE cid = ? AND status = 'approved' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT " . self::LIST_MAX, [$ev['id']]);
        return ['event' => $this->events->publicView($ev), 'messages' => array_map(fn ($m) => $this->view($m, 'celebrant'), $rows)];
    }

    public function favourite(array $ev, string $mid, bool $on): array
    {
        $m = $this->row($ev['id'], $mid);
        if ($m['status'] !== 'approved') throw new HttpError(404, 'That message was not found.', 'not-found');
        $this->db->run('UPDATE celebration_messages SET favourite = ? WHERE id = ?', [$on ? 1 : 0, $mid]);
        return ['id' => $mid, 'favourite' => $on];
    }

    /* ---------------------------------------------------------------- helpers */

    /** The event and the guest's row; the guest must have joined and not been removed. */
    private function member(string $cid, AuthUser $user): array
    {
        $ev = $this->events->event($cid);
        if ($ev['status'] !== 'active') throw new HttpError(403, 'This celebration is not available.', 'suspended');
        $g = $this->db->one('SELECT * FROM celebration_guests WHERE cid = ? AND uid = ? AND removed_at IS NULL', [$cid, $user->uid]);
        if (!$g) throw new HttpError(403, 'Join the celebration first.', 'not-guest');
        return [$ev, $g];
    }

    private function row(string $cid, string $mid): array
    {
        $m = $this->db->one('SELECT * FROM celebration_messages WHERE id = ? AND cid = ? AND deleted_at IS NULL', [$mid, $cid]);
        if (!$m) throw new HttpError(404, 'That message was not found.', 'not-found');
        return $m;
    }

    /**
     * public    - anyone at the event: no writer name on anonymous messages, no status
     * own       - the writer: plus the status
     * organiser - plus the real name behind an anonymous message, reports and favourite
     * celebrant - public plus favourite and the full-size photo
     */
    private function view(array $m, string $as, ?string $viewer = null): array
    {
        $anon = (bool) $m['anonymous'];
        $out = [
            'id' => $m['id'],
            'name' => $anon && $as !== 'organiser' && $as !== 'own' ? null : $m['name'],
            'anonymous' => $anon,
            'category' => $m['category'],
            'body' => $m['body'],
            'createdAt' => (int) $m['created_at'],
            'photo' => null,
        ];
        if ($m['media_id']) {
            $out['photo'] = [
                'thumb' => $this->media->url($m['media_id'], 'thumb', self::PHOTO_TTL),
                'play' => $this->media->url($m['media_id'], 'play', self::PHOTO_TTL),
            ];
            if ($as === 'celebrant' || $as === 'organiser') $out['photo']['full'] = $this->media->url($m['media_id'], 'full', self::PHOTO_TTL);
        }
        if ($as === 'public') $out['mine'] = $viewer !== null && hash_equals($m['uid'], $viewer);
        if ($as === 'own' || $as === 'organiser') $out['status'] = $m['status'];
        if ($as === 'organiser') $out['reports'] = (int) $m['reports'];
        if ($as === 'organiser' || $as === 'celebrant') $out['favourite'] = (bool) $m['favourite'];
        return $out;
    }
}
