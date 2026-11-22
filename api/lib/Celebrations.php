<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * PlayMona Celebrations: events an organiser creates for a birthday, wedding, graduation...
 *
 * MariaDB is the record (events, teams, guests, pictures, audit). Firebase only carries the
 * live summary guests' phones and the TV watch: celebrations/<cid>/live (written here) and
 * celebrations/<cid>/members/<uid> (who is in, and their team; written here, read by its owner).
 *
 * Who may do what:
 *   organiser  - the signed-in account that created it (never a guest account)
 *   guest      - anyone who joined with a name (Firebase anonymous sign-in is enough)
 *   celebrant / mc / display - whoever holds that private link's secret token
 */
class Celebrations
{
    public const TYPES = ['birthday', 'graduation', 'wedding', 'anniversary', 'babyShower', 'engagement', 'retirement', 'corporate', 'reunion', 'farewell', 'custom'];
    public const LOOKS = ['gala', 'rose', 'ocean', 'garden', 'confetti', 'ivory'];
    public const FONTS = ['classic', 'modern', 'elegant', 'playful'];
    public const SETTINGS = [
        'private' => false,          // the event page needs the join code before it shows anything
        'requireAccount' => false,   // guests must have a PlayMona account to join
        'guestTeams' => true,        // guests pick their own team
        'guestMakeTeams' => true,    // a group on one phone may make its own team (needs guestTeams)
        'anonymousMessages' => true,
        'photoUploads' => true,
        'leaderboard' => true,       // the live leaderboard shows on guests' phones
        'approveMessages' => true,   // messages wait for the organiser before anyone else sees them
        'hasMc' => false,            // a separate MC runs the event with the MC link
        'individuals' => false,      // games are played by each guest on their own (a team of one each), not by groups
    ];
    public const LIMITS = [
        'enabled' => true,
        'eventsPerOwner' => 20,
        'guestsPerEvent' => 300,
        'teamsPerEvent' => 12,
        'uploadMb' => 8,
        'uploadsPerHour' => 120,
        'joinsPerIpHour' => 300,   // a whole party often shares one venue Wi-Fi address
    ];
    public const TOKEN_KINDS = ['celebrant', 'mc', 'display'];
    /** Team colours, picked in order for new teams (organisers can change them). */
    public const TEAM_COLOURS = ['#D4A017', '#7C8A9E', '#C0392B', '#1E8449', '#2E86C1', '#8E44AD', '#E67E22', '#17A589', '#34495E', '#D35400', '#C2185B', '#5D6D7E'];
    public const TEAM_NAMES = ['Gold', 'Silver', 'Ruby', 'Emerald', 'Sapphire', 'Amethyst', 'Amber', 'Jade', 'Onyx', 'Copper', 'Rose', 'Pearl'];
    private const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    /** Words a guest-made team name may not use (whole words, any case). The organiser can rename or remove the rest. */
    private const BLOCKED = ['fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'shitty', 'bullshit', 'cunt', 'bitch', 'bitches', 'bastard',
        'asshole', 'arsehole', 'dick', 'dickhead', 'cock', 'pussy', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape', 'porn', 'sex', 'nazi', 'hitler'];
    private const RESERVED = ['play', 'join', 'new', 'admin', 'api', 'tv', 'mc', 'for', 'watch', 'c', 'www', 'help'];

    public function __construct(private Db $db, private RealtimeDb $rtdb, private CelebrationMedia $media) {}

    /* ---------------------------------------------------------------- tables */

    public static function migrate(Db $db, string $engine): void
    {
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebrations (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            slug VARCHAR(40) NOT NULL,
            join_code VARCHAR(8) NOT NULL,
            owner_uid VARCHAR(128) NOT NULL,
            title VARCHAR(120) NOT NULL,
            celebrant_name VARCHAR(80) NOT NULL,
            type VARCHAR(16) NOT NULL,
            description TEXT NULL,
            event_date VARCHAR(10) NULL,
            start_time VARCHAR(5) NULL,
            end_time VARCHAR(5) NULL,
            timezone VARCHAR(48) NULL,
            venue VARCHAR(160) NULL,
            welcome TEXT NULL,
            theme TEXT NOT NULL,
            settings TEXT NOT NULL,
            cover_media_id VARCHAR(32) NULL,
            status VARCHAR(12) NOT NULL,
            celebrant_token VARCHAR(64) NOT NULL,
            mc_token VARCHAR(64) NOT NULL,
            display_token VARCHAR(64) NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            deleted_at BIGINT NULL,
            UNIQUE (slug),
            UNIQUE (join_code)
        )$engine");
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_teams (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            cid VARCHAR(32) NOT NULL,
            name VARCHAR(40) NOT NULL,
            color VARCHAR(7) NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 0,
            sort INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            deleted_at BIGINT NULL,
            FOREIGN KEY (cid) REFERENCES celebrations (id)
        )$engine");
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_guests (
            cid VARCHAR(32) NOT NULL,
            uid VARCHAR(128) NOT NULL,
            name VARCHAR(40) NOT NULL,
            team_id VARCHAR(32) NULL,
            has_account INTEGER NOT NULL DEFAULT 0,
            ip_hash VARCHAR(16) NULL,
            joined_at BIGINT NOT NULL,
            last_seen BIGINT NOT NULL,
            removed_at BIGINT NULL,
            PRIMARY KEY (cid, uid),
            FOREIGN KEY (cid) REFERENCES celebrations (id)
        )$engine");
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_media (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            cid VARCHAR(32) NOT NULL,
            uid VARCHAR(128) NOT NULL,
            purpose VARCHAR(12) NOT NULL,
            ext VARCHAR(4) NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            bytes INTEGER NOT NULL,
            created_at BIGINT NOT NULL,
            deleted_at BIGINT NULL,
            FOREIGN KEY (cid) REFERENCES celebrations (id)
        )$engine");
        $db->pdo->exec("CREATE TABLE IF NOT EXISTS celebration_audit (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            cid VARCHAR(32) NOT NULL,
            actor VARCHAR(140) NOT NULL,
            action VARCHAR(32) NOT NULL,
            detail TEXT NULL,
            created_at BIGINT NOT NULL
        )$engine");
        foreach ([
            'ALTER TABLE celebrations ADD COLUMN types TEXT NULL',
            'ALTER TABLE celebration_teams ADD COLUMN made_by VARCHAR(128) NULL',
            'CREATE INDEX celebrations_owner ON celebrations (owner_uid, created_at)',
            'CREATE INDEX celebration_teams_cid ON celebration_teams (cid, sort)',
            'CREATE INDEX celebration_guests_team ON celebration_guests (cid, team_id)',
            'CREATE INDEX celebration_guests_ip ON celebration_guests (ip_hash, joined_at)',
            'CREATE INDEX celebration_media_cid ON celebration_media (cid, purpose)',
            'CREATE INDEX celebration_media_uid ON celebration_media (uid, created_at)',
            'CREATE INDEX celebration_audit_cid ON celebration_audit (cid, created_at)',
        ] as $sql) {
            try { $db->pdo->exec($sql); } catch (\PDOException $e) { /* already there */ }
        }
    }

    /* ---------------------------------------------------------------- limits */

    /** Admin-set limits (settings row "celebrations_limits") over the defaults. Ready for future plans. */
    public function limits(): array
    {
        $row = $this->db->one("SELECT value FROM settings WHERE name = 'celebrations_limits'");
        $saved = $row ? json_decode((string) $row['value'], true) : [];
        $out = self::LIMITS;
        foreach (self::LIMITS as $k => $default) {
            if (!is_array($saved) || !array_key_exists($k, $saved)) continue;
            $out[$k] = is_bool($default) ? (bool) $saved[$k] : max(0, (int) $saved[$k]);
        }
        return $out;
    }

    public function saveLimits(array $change, string $adminUid): array
    {
        $next = $this->limits();
        foreach ($change as $k => $v) {
            if (!array_key_exists($k, self::LIMITS)) continue;
            $next[$k] = is_bool(self::LIMITS[$k]) ? (bool) $v : max(0, min(100000, (int) $v));
        }
        $json = json_encode($next);
        if ($this->db->run('UPDATE settings SET value = ?, updated_at = ? WHERE name = ?', [$json, nowMs(), 'celebrations_limits']) === 0) {
            $this->db->run('INSERT INTO settings (name, value, updated_at) VALUES (?, ?, ?)', ['celebrations_limits', $json, nowMs()]);
        }
        $this->audit('-', 'admin:' . $adminUid, 'limits', $next);
        return $next;
    }

    /* ---------------------------------------------------------------- organiser */

    public function create(AuthUser $user, array $in): array
    {
        $this->needAccount($user);
        $limits = $this->limits();
        if (!$limits['enabled']) throw new HttpError(403, 'Celebrations are paused right now. Please try again later.', 'disabled');
        $count = (int) ($this->db->one('SELECT COUNT(*) AS n FROM celebrations WHERE owner_uid = ? AND deleted_at IS NULL', [$user->uid])['n'] ?? 0);
        if ($count >= $limits['eventsPerOwner']) {
            throw new HttpError(403, 'You have reached the most celebrations one account can have. Delete an old one first.', 'limit');
        }

        $fields = $this->cleanDetails($in, true);
        $theme = $this->cleanTheme($in['theme'] ?? []);
        $settings = $this->cleanSettings($in['settings'] ?? []);
        $now = nowMs();
        $id = newId('cel');
        $slug = $this->pickSlug(isset($in['slug']) && $in['slug'] !== '' ? (string) $in['slug'] : $fields['celebrant_name'] . ' ' . $fields['type'], isset($in['slug']) && $in['slug'] !== '');

        $this->db->transaction(function (Db $db) use ($id, $slug, $user, $fields, $theme, $settings, $now, $in, $limits) {
            $db->run('INSERT INTO celebrations (id, slug, join_code, owner_uid, title, celebrant_name, type, types, description, event_date, start_time, end_time, timezone, venue, welcome, theme, settings, status, celebrant_token, mc_token, display_token, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $id, $slug, $this->newJoinCode(), $user->uid, $fields['title'], $fields['celebrant_name'], $fields['type'], $fields['types'],
                $fields['description'], $fields['event_date'], $fields['start_time'], $fields['end_time'], $fields['timezone'],
                $fields['venue'], $fields['welcome'], json_encode($theme), json_encode($settings), 'active',
                self::newToken(), self::newToken(), self::newToken(), $now, $now,
            ]);
            $teams = max(0, min((int) ($in['teamCount'] ?? 0), $limits['teamsPerEvent']));
            for ($i = 0; $i < $teams; $i++) $this->insertTeam($db, $id, self::TEAM_NAMES[$i % 12], self::TEAM_COLOURS[$i % 12], 0, $i);
        });
        $this->audit($id, $user->uid, 'create', ['slug' => $slug]);
        $this->publish($id);
        return $this->manageView($this->event($id));
    }

    public function update(string $cid, AuthUser $user, array $in): array
    {
        $ev = $this->owned($cid, $user);
        $sets = [];
        $vals = [];
        $merged = array_merge($this->detailsOf($ev), $in);
        if (array_key_exists('type', $in) && !array_key_exists('types', $in)) unset($merged['types']);   // "type" alone replaces the list
        $details = $this->cleanDetails($merged, false);
        foreach ($details as $col => $v) {
            $sets[] = "$col = ?";
            $vals[] = $v;
        }
        if (isset($in['theme']) && is_array($in['theme'])) {
            $sets[] = 'theme = ?';
            $vals[] = json_encode($this->cleanTheme(array_merge(json_decode($ev['theme'], true) ?: [], $in['theme'])));
        }
        if (isset($in['settings']) && is_array($in['settings'])) {
            $sets[] = 'settings = ?';
            $vals[] = json_encode($this->cleanSettings(array_merge(json_decode($ev['settings'], true) ?: [], $in['settings'])));
        }
        if (isset($in['slug']) && (string) $in['slug'] !== $ev['slug']) {
            $sets[] = 'slug = ?';
            $vals[] = $this->pickSlug((string) $in['slug'], true, $cid);
        }
        if (array_key_exists('coverMediaId', $in)) {
            $mid = $in['coverMediaId'];
            if ($mid !== null && !$this->db->one("SELECT id FROM celebration_media WHERE id = ? AND cid = ? AND purpose = 'cover' AND deleted_at IS NULL", [(string) $mid, $cid])) {
                throw new HttpError(400, 'That cover picture was not found.', 'bad-media');
            }
            $sets[] = 'cover_media_id = ?';
            $vals[] = $mid === null ? null : (string) $mid;
        }
        $sets[] = 'updated_at = ?';
        $vals[] = nowMs();
        $vals[] = $cid;
        $this->db->run('UPDATE celebrations SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
        $this->audit($cid, $user->uid, 'update', array_keys($in));
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    /** Deletes the event for good from guests' view: pictures are erased, the live data goes, the row is kept (soft) for the audit trail. */
    public function delete(string $cid, AuthUser $user): void
    {
        $this->owned($cid, $user);
        $now = nowMs();
        $this->db->transaction(function (Db $db) use ($cid, $now) {
            $db->run('UPDATE celebrations SET deleted_at = ?, status = ?, slug = ?, join_code = ? WHERE id = ?', [$now, 'deleted', 'x-' . substr($cid, -20), '#' . substr(bin2hex(random_bytes(4)), 0, 7), $cid]);
            $db->run('UPDATE celebration_media SET deleted_at = ? WHERE cid = ? AND deleted_at IS NULL', [$now, $cid]);
        });
        $this->media->deleteAll($cid);
        $this->audit($cid, $user->uid, 'delete', null);
        $this->live(fn () => $this->rtdb->set('celebrations/' . $cid, null));
    }

    public function mine(AuthUser $user): array
    {
        $this->needAccount($user);
        $rows = $this->db->all('SELECT * FROM celebrations WHERE owner_uid = ? AND deleted_at IS NULL ORDER BY created_at DESC', [$user->uid]);
        return array_map(fn ($ev) => $this->summary($ev), $rows);
    }

    public function manage(string $cid, AuthUser $user): array
    {
        return $this->manageView($this->owned($cid, $user));
    }

    /** A new secret link; the old one stops working at once. */
    public function regenerate(string $cid, AuthUser $user, string $kind): array
    {
        $this->owned($cid, $user);
        if (!in_array($kind, self::TOKEN_KINDS, true)) throw new HttpError(400, 'Unknown link.', 'bad-kind');
        $this->db->run("UPDATE celebrations SET {$kind}_token = ?, updated_at = ? WHERE id = ?", [self::newToken(), nowMs(), $cid]);
        $this->audit($cid, $user->uid, 'regenerate', ['kind' => $kind]);
        return $this->manageView($this->event($cid));
    }

    /* ---------------------------------------------------------------- teams */

    public function addTeam(string $cid, AuthUser $user, array $in): array
    {
        $this->owned($cid, $user);
        $count = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_teams WHERE cid = ? AND deleted_at IS NULL', [$cid])['n'];
        if ($count >= $this->limits()['teamsPerEvent']) throw new HttpError(403, 'This celebration has the most teams it can have.', 'limit');
        $name = $this->cleanText($in['name'] ?? '', 30) ?: 'Team ' . self::TEAM_NAMES[$count % 12];
        $color = $this->cleanColor($in['color'] ?? null) ?? self::TEAM_COLOURS[$count % 12];
        $this->insertTeam($this->db, $cid, $name, $color, $this->capacity($in['capacity'] ?? 0), $count);
        $this->audit($cid, $user->uid, 'team-add', ['name' => $name]);
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    public function updateTeam(string $cid, string $tid, AuthUser $user, array $in): array
    {
        $this->owned($cid, $user);
        $team = $this->team($cid, $tid);
        $name = array_key_exists('name', $in) ? ($this->cleanText($in['name'], 30) ?: $team['name']) : $team['name'];
        $color = array_key_exists('color', $in) ? ($this->cleanColor($in['color']) ?? $team['color']) : $team['color'];
        $cap = array_key_exists('capacity', $in) ? $this->capacity($in['capacity']) : (int) $team['capacity'];
        $this->db->run('UPDATE celebration_teams SET name = ?, color = ?, capacity = ? WHERE id = ?', [$name, $color, $cap, $tid]);
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    /** Removes a team; its guests go back to "no team yet". */
    public function deleteTeam(string $cid, string $tid, AuthUser $user): array
    {
        $this->owned($cid, $user);
        $this->team($cid, $tid);
        $moved = $this->db->all('SELECT uid FROM celebration_guests WHERE cid = ? AND team_id = ?', [$cid, $tid]);
        $this->db->transaction(function (Db $db) use ($cid, $tid) {
            $db->run('UPDATE celebration_teams SET deleted_at = ? WHERE id = ?', [nowMs(), $tid]);
            $db->run('UPDATE celebration_guests SET team_id = NULL WHERE cid = ? AND team_id = ?', [$cid, $tid]);
        });
        foreach ($moved as $g) $this->publishMember($cid, $g['uid']);
        $this->audit($cid, $user->uid, 'team-delete', ['team' => $tid]);
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    /** Puts every guest without a team into the smallest team that still has room. */
    public function autoTeams(string $cid, AuthUser $user): array
    {
        $this->owned($cid, $user);
        $teams = $this->teams($cid);
        if (!$teams) throw new HttpError(400, 'Add a team first.', 'no-teams');
        $waiting = $this->db->all('SELECT uid FROM celebration_guests WHERE cid = ? AND team_id IS NULL AND removed_at IS NULL ORDER BY joined_at', [$cid]);
        $sizes = [];
        foreach ($teams as $t) $sizes[$t['id']] = $t['members'];
        $placed = [];
        foreach ($waiting as $g) {
            $best = null;
            foreach ($teams as $t) {
                if ($t['capacity'] > 0 && $sizes[$t['id']] >= $t['capacity']) continue;
                if ($best === null || $sizes[$t['id']] < $sizes[$best]) $best = $t['id'];
            }
            if ($best === null) break;
            $sizes[$best]++;
            $placed[$g['uid']] = $best;
        }
        $this->db->transaction(function (Db $db) use ($cid, $placed) {
            foreach ($placed as $uid => $tid) $db->run('UPDATE celebration_guests SET team_id = ? WHERE cid = ? AND uid = ?', [$tid, $cid, $uid]);
        });
        foreach (array_keys($placed) as $uid) $this->publishMember($cid, (string) $uid);
        $this->audit($cid, $user->uid, 'team-auto', ['placed' => count($placed)]);
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    /** Locked teams: guests can no longer pick or change team (the organiser still can). */
    public function lockTeams(string $cid, AuthUser $user, bool $locked): array
    {
        $ev = $this->owned($cid, $user);
        $settings = json_decode($ev['settings'], true) ?: [];
        $settings['teamsLocked'] = $locked;
        $this->db->run('UPDATE celebrations SET settings = ?, updated_at = ? WHERE id = ?', [json_encode($settings), nowMs(), $cid]);
        $this->audit($cid, $user->uid, $locked ? 'teams-lock' : 'teams-unlock', null);
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    public function moveGuest(string $cid, string $uid, AuthUser $user, ?string $tid): array
    {
        $this->owned($cid, $user);
        $this->guestRow($cid, $uid);
        if ($tid !== null) $this->team($cid, $tid);
        $this->db->run('UPDATE celebration_guests SET team_id = ? WHERE cid = ? AND uid = ?', [$tid, $cid, $uid]);
        $this->publishMember($cid, $uid);
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    /** Removes a guest from the event. They may join again from the event page. */
    public function removeGuest(string $cid, string $uid, AuthUser $user): array
    {
        $this->owned($cid, $user);
        $this->guestRow($cid, $uid);
        $this->db->run('UPDATE celebration_guests SET removed_at = ?, team_id = NULL WHERE cid = ? AND uid = ?', [nowMs(), $cid, $uid]);
        $this->live(fn () => $this->rtdb->set('celebrations/' . $cid . '/members/' . $uid, null));
        $this->audit($cid, $user->uid, 'guest-remove', ['uid' => $uid]);
        $this->publish($cid);
        return $this->manageView($this->event($cid));
    }

    /**
     * Clearing test data: everyone who joined leaves, removed guests too, so every phone may join
     * again. The teams guests made go with them; the organiser's own teams stay (now empty).
     */
    public function clearGuests(string $cid): array
    {
        $uids = array_column($this->db->all('SELECT uid FROM celebration_guests WHERE cid = ?', [$cid]), 'uid');
        $now = nowMs();
        $teams = 0;
        $this->db->transaction(function (Db $db) use ($cid, $now, &$teams) {
            $teams = (int) $db->one('SELECT COUNT(*) AS n FROM celebration_teams WHERE cid = ? AND made_by IS NOT NULL AND deleted_at IS NULL', [$cid])['n'];
            $db->run('UPDATE celebration_teams SET deleted_at = ? WHERE cid = ? AND made_by IS NOT NULL AND deleted_at IS NULL', [$now, $cid]);
            $db->run('DELETE FROM celebration_guests WHERE cid = ?', [$cid]);
        });
        $this->live(function () use ($cid, $uids) {
            $this->rtdb->set('celebrations/' . $cid . '/members', null);
            foreach ($uids as $uid) $this->rtdb->set('celebrations/' . $cid . '/viewers/' . $uid, null);
        });
        return ['guests' => count($uids), 'teams' => $teams];
    }

    /* ---------------------------------------------------------------- guests */

    /** The event page: by its address (slug) or the short join code. Private events need the code. */
    public function find(?string $slug, ?string $code): array
    {
        $ev = null;
        $byCode = false;
        if ($code !== null && $code !== '') {
            $ev = $this->db->one('SELECT * FROM celebrations WHERE join_code = ? AND deleted_at IS NULL', [strtoupper(trim($code))]);
            $byCode = (bool) $ev;
            if ($ev && $slug && $ev['slug'] !== strtolower($slug)) $ev = null;
        } elseif ($slug !== null && $slug !== '') {
            $ev = $this->db->one('SELECT * FROM celebrations WHERE slug = ? AND deleted_at IS NULL', [strtolower(trim($slug))]);
        }
        if (!$ev) throw new HttpError(404, 'We could not find that celebration. Check the link or code.', 'not-found');
        if ($ev['status'] === 'suspended') throw new HttpError(403, 'This celebration is not available.', 'suspended');
        $settings = $this->settingsOf($ev);
        if ($settings['private'] && !$byCode) {
            return ['needsCode' => true, 'slug' => $ev['slug']];
        }
        return $this->publicView($ev);
    }

    public function join(string $cid, AuthUser $user, array $in, string $ip): array
    {
        $ev = $this->event($cid);
        if ($ev['status'] !== 'active') throw new HttpError(403, 'This celebration is not available.', 'suspended');
        $settings = $this->settingsOf($ev);
        if ($settings['private'] && strtoupper(trim((string) ($in['code'] ?? ''))) !== $ev['join_code']) {
            throw new HttpError(403, 'Enter the join code from the invitation.', 'needs-code');
        }
        if ($settings['requireAccount'] && $user->isAnonymous()) {
            throw new HttpError(403, 'This celebration asks guests to sign in with a PlayMona account.', 'needs-account');
        }
        $name = $this->cleanText($in['name'] ?? '', 24);
        if (mb_strlen($name) < 1) throw new HttpError(400, 'Type your name.', 'no-name');
        $limits = $this->limits();
        $now = nowMs();
        $ipHash = substr(hash('sha256', 'cel-ip:' . $ip), 0, 16);

        $existing = $this->db->one('SELECT * FROM celebration_guests WHERE cid = ? AND uid = ?', [$cid, $user->uid]);
        // A guest the organiser removed may join again, as someone new (blocking comes later).
        $back = $existing && $existing['removed_at'] !== null;
        if ($back) {
            $guests = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE cid = ? AND removed_at IS NULL', [$cid])['n'];
            if ($guests >= $limits['guestsPerEvent']) throw new HttpError(403, 'This celebration is full.', 'full');
            $this->db->run('UPDATE celebration_guests SET name = ?, team_id = NULL, removed_at = NULL, joined_at = ?, last_seen = ? WHERE cid = ? AND uid = ?', [$name, $now, $now, $cid, $user->uid]);
        } elseif (!$existing) {
            $guests = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE cid = ? AND removed_at IS NULL', [$cid])['n'];
            if ($guests >= $limits['guestsPerEvent']) throw new HttpError(403, 'This celebration is full.', 'full');
            $recent = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE ip_hash = ? AND joined_at > ?', [$ipHash, $now - 3600_000])['n'];
            if ($recent >= $limits['joinsPerIpHour']) throw new HttpError(429, 'Too many people joined from this connection. Please wait a little.', 'rate-limit');
            $this->db->run('INSERT INTO celebration_guests (cid, uid, name, team_id, has_account, ip_hash, joined_at, last_seen) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)', [
                $cid, $user->uid, $name, $user->isAnonymous() ? 0 : 1, $ipHash, $now, $now,
            ]);
        } else {
            $this->db->run('UPDATE celebration_guests SET name = ?, last_seen = ? WHERE cid = ? AND uid = ?', [$name, $now, $cid, $user->uid]);
        }
        $teamError = null;
        if (!empty($in['teamId'])) {
            $this->assignOwnTeam($ev, $settings, $user->uid, (string) $in['teamId']);
        } else {
            // The guest is in either way; a team that cannot be made is only a note for the page.
            try {
                $this->placeOnJoin($ev, $settings, $user->uid, $name, ($in['as'] ?? null) === 'group');
            } catch (HttpError $e) {
                $teamError = $e->getMessage();
            }
        }
        $this->publishMember($cid, $user->uid);
        $this->publish($cid);
        $out = $this->guestView($ev, $user->uid);
        if ($teamError !== null) $out['teamError'] = $teamError;
        return $out;
    }

    /**
     * Where a guest goes when they join.
     * - Games played by individuals: everyone plays as a team of one (their own name).
     * - Games played by groups, joining as a group: the team with that name when there is one
     *   (a second phone of the same group, or a team the organiser made), else a new team.
     * - Games played by groups, joining on their own: nowhere yet; they pick their group on the page.
     * Groups are left alone when the organiser puts guests into teams or the teams are locked.
     */
    private function placeOnJoin(array $ev, array $settings, string $uid, string $name, bool $group): void
    {
        $cid = $ev['id'];
        $row = $this->db->one('SELECT team_id FROM celebration_guests WHERE cid = ? AND uid = ?', [$cid, $uid]);
        if ($settings['individuals']) {
            if ($row['team_id'] === null) $this->makeOwnTeam($cid, $uid, $name, true);
            return;
        }
        if (!$group || !$settings['guestTeams'] || !empty($settings['teamsLocked'])) return;
        foreach ($this->teams($cid) as $t) {
            if (!$t['solo'] && mb_strtolower($t['name']) === mb_strtolower($name)) {
                if ($row['team_id'] !== $t['id']) $this->assignOwnTeam($ev, $settings, $uid, $t['id']);
                return;
            }
        }
        if ($settings['guestMakeTeams']) $this->makeOwnTeam($cid, $uid, $name, false);
    }

    public function me(string $cid, AuthUser $user): array
    {
        $ev = $this->event($cid);
        $row = $this->db->one('SELECT * FROM celebration_guests WHERE cid = ? AND uid = ?', [$cid, $user->uid]);
        if (!$row || $row['removed_at'] !== null) return ['joined' => false, 'removed' => (bool) ($row['removed_at'] ?? null)];
        $this->db->run('UPDATE celebration_guests SET last_seen = ? WHERE cid = ? AND uid = ?', [nowMs(), $cid, $user->uid]);
        if ($row['team_id'] === null && $ev['status'] === 'active' && $this->settingsOf($ev)['individuals']) {
            try {
                $this->makeOwnTeam($cid, $user->uid, (string) $row['name'], true);
                $this->publishMember($cid, $user->uid);
                $this->publish($cid);
            } catch (HttpError $e) { /* a name that is not allowed: the organiser can place them */ }
        }
        return $this->guestView($ev, $user->uid);
    }

    public function chooseTeam(string $cid, AuthUser $user, string $tid): array
    {
        $ev = $this->event($cid);
        $this->guestRow($cid, $user->uid);
        $this->assignOwnTeam($ev, $this->settingsOf($ev), $user->uid, $tid);
        $this->publishMember($cid, $user->uid);
        $this->publish($cid);
        return $this->guestView($ev, $user->uid);
    }

    /** A group makes its own team (often 5 people on one phone) and moves into it. Same rules as picking a team. */
    public function guestMakeTeam(string $cid, AuthUser $user, array $in): array
    {
        $ev = $this->event($cid);
        if ($ev['status'] !== 'active') throw new HttpError(403, 'This celebration is not available.', 'suspended');
        $this->guestRow($cid, $user->uid);
        $settings = $this->settingsOf($ev);
        if (!$settings['guestTeams']) throw new HttpError(403, 'The organiser puts guests into teams.', 'teams-by-organiser');
        if (!$settings['guestMakeTeams']) throw new HttpError(403, 'The organiser makes the teams for this celebration.', 'no-guest-teams');
        if ($settings['teamsLocked']) throw new HttpError(403, 'Teams are locked now.', 'teams-locked');
        $this->makeOwnTeam($cid, $user->uid, (string) ($in['name'] ?? ''), false);
        $this->publishMember($cid, $user->uid);
        $this->publish($cid);
        return $this->guestView($ev, $user->uid);
    }

    /**
     * Makes a team for this guest and moves them into it. A solo team (games played by individuals)
     * holds one person, takes the guest's name, with a number when that name is taken, and does not
     * count towards the team limit: there is one per guest, and the guest limit caps those.
     */
    private function makeOwnTeam(string $cid, string $uid, string $rawName, bool $solo): string
    {
        $name = $this->cleanText($rawName, 30);
        if ($name === '') throw new HttpError(400, 'Type a name for your team.', 'no-name');
        if ($this->blocked($name)) throw new HttpError(400, $solo ? 'Please use a different name.' : 'Please pick a different team name.', 'bad-name');
        $limit = $this->limits()['teamsPerEvent'];
        $tid = $this->db->transaction(function (Db $db) use ($cid, $name, $limit, $uid, $solo) {
            // The event row is the lock, so two groups making teams at once take turns (no doubled name or colour).
            // Keep it the first statement: MariaDB takes the read snapshot at the first plain read.
            $db->one('SELECT id FROM celebrations WHERE id = ?' . $db->forUpdate(), [$cid]);
            // A team this guest made and is alone in goes when they make another, so one phone cannot use up the limit.
            $leaving = $this->ownEmptyAfterLeaving($db, $cid, $uid);
            $live = array_values(array_filter(
                $db->all('SELECT id, name, color, sort, capacity, made_by FROM celebration_teams WHERE cid = ? AND deleted_at IS NULL', [$cid]),
                fn ($t) => $t['id'] !== $leaving
            ));
            $groups = array_filter($live, fn ($t) => !self::isSolo($t));
            if (!$solo && count($groups) >= $limit) throw new HttpError(403, 'This celebration has the most teams it can have. Pick one of the teams.', 'limit');
            $taken = array_map(fn ($t) => mb_strtolower((string) $t['name']), $live);
            if ($solo) {
                $base = $name;
                for ($i = 2; in_array(mb_strtolower($name), $taken, true); $i++) $name = mb_substr($base, 0, 26) . ' ' . $i;
            } elseif (in_array(mb_strtolower($name), $taken, true)) {
                throw new HttpError(409, 'There is already a team with that name. Pick it, or try another name.', 'team-taken');
            }
            $used = array_map('strtoupper', array_column($live, 'color'));
            $free = array_values(array_diff(self::TEAM_COLOURS, $used));
            $color = $free[0] ?? self::TEAM_COLOURS[count($live) % 12];
            $sort = $live ? max(array_map('intval', array_column($live, 'sort'))) + 1 : 0;
            $tid = $this->insertTeam($db, $cid, $name, $color, $solo ? 1 : 0, $sort, $uid);
            $db->run('UPDATE celebration_guests SET team_id = ? WHERE cid = ? AND uid = ?', [$tid, $cid, $uid]);
            if ($leaving) $db->run('UPDATE celebration_teams SET deleted_at = ? WHERE id = ?', [nowMs(), $leaving]);
            return $tid;
        });
        $this->audit($cid, $uid, $solo ? 'team.solo' : 'team.guest-made', ['team' => $tid, 'name' => $name]);
        return $tid;
    }

    /** A guest playing on their own: a team of one that the guest made. */
    private static function isSolo(array $t): bool
    {
        return $t['made_by'] !== null && (int) $t['capacity'] === 1;
    }

    /** True when a team name uses a blocked word (also spelled with numbers or symbols, like "sh1t"). */
    private function blocked(string $name): bool
    {
        $plain = strtr(mb_strtolower($name), ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '@' => 'a', '$' => 's', '!' => 'i']);
        foreach (preg_split('/[^\p{L}]+/u', $plain, -1, PREG_SPLIT_NO_EMPTY) as $word) {
            if (in_array($word, self::BLOCKED, true)) return true;
        }
        return false;
    }

    private function assignOwnTeam(array $ev, array $settings, string $uid, string $tid): void
    {
        if (!$settings['guestTeams']) throw new HttpError(403, 'The organiser puts guests into teams.', 'teams-by-organiser');
        if (!empty($settings['teamsLocked'])) throw new HttpError(403, 'Teams are locked now.', 'teams-locked');
        $this->db->transaction(function (Db $db) use ($ev, $uid, $tid) {
            $team = $db->one('SELECT * FROM celebration_teams WHERE id = ? AND cid = ? AND deleted_at IS NULL' . $db->forUpdate(), [$tid, $ev['id']]);
            if (!$team) throw new HttpError(404, 'That team was not found.', 'no-team');
            if ((int) $team['capacity'] > 0) {
                $n = (int) $db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE cid = ? AND team_id = ? AND uid <> ? AND removed_at IS NULL', [$ev['id'], $tid, $uid])['n'];
                if ($n >= (int) $team['capacity']) throw new HttpError(409, 'That team is full. Pick another one.', 'team-full');
            }
            $leaving = $this->ownEmptyAfterLeaving($db, $ev['id'], $uid);
            $db->run('UPDATE celebration_guests SET team_id = ? WHERE cid = ? AND uid = ?', [$tid, $ev['id'], $uid]);
            if ($leaving && $leaving !== $tid) $db->run('UPDATE celebration_teams SET deleted_at = ? WHERE id = ?', [nowMs(), $leaving]);
        });
    }

    /** The team this guest is in, when they made it and nobody else is in it (so it would be left empty), else null. */
    private function ownEmptyAfterLeaving(Db $db, string $cid, string $uid): ?string
    {
        $row = $db->one('SELECT g.team_id FROM celebration_guests g JOIN celebration_teams t ON t.id = g.team_id
            WHERE g.cid = ? AND g.uid = ? AND t.made_by = ? AND t.deleted_at IS NULL', [$cid, $uid, $uid]);
        if (!$row) return null;
        $others = (int) $db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE cid = ? AND team_id = ? AND uid <> ? AND removed_at IS NULL', [$cid, $row['team_id'], $uid])['n'];
        return $others === 0 ? (string) $row['team_id'] : null;
    }

    /* ---------------------------------------------------------------- private links */

    /** Which private link this token opens for the event, or null. */
    public function roleFor(array $ev, ?string $token): ?string
    {
        if (!$token || strlen($token) < 20) return null;
        foreach (self::TOKEN_KINDS as $kind) {
            if (hash_equals((string) $ev[$kind . '_token'], $token)) return $kind;
        }
        return null;
    }

    /* ---------------------------------------------------------------- pictures */

    /** Organiser pictures (event cover, puzzle photos, the TV's opening slide). Guests' wall photos arrive with their message. */
    public function upload(string $cid, AuthUser $user, string $purpose, string $bytes): array
    {
        $this->owned($cid, $user);
        if (!in_array($purpose, ['cover', 'puzzle', 'slide'], true)) throw new HttpError(400, 'Unknown picture use.', 'bad-purpose');
        $media = $this->storeMedia($cid, $user->uid, $purpose, $bytes);
        if ($purpose === 'cover') {
            $this->db->run('UPDATE celebrations SET cover_media_id = ?, updated_at = ? WHERE id = ?', [$media['id'], nowMs(), $cid]);
            $this->publish($cid);
        }
        return $media;
    }

    public function storeMedia(string $cid, string $uid, string $purpose, string $bytes): array
    {
        $limits = $this->limits();
        $recent = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_media WHERE uid = ? AND created_at > ?', [$uid, nowMs() - 3600_000])['n'];
        if ($recent >= $limits['uploadsPerHour']) throw new HttpError(429, 'That is a lot of pictures. Please wait a little before adding more.', 'rate-limit');
        $id = newId('m');
        [$ext, $w, $h, $size] = $this->media->save($cid, $id, $bytes, $limits['uploadMb'] * 1024 * 1024);
        $this->db->run('INSERT INTO celebration_media (id, cid, uid, purpose, ext, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $cid, $uid, $purpose, $ext, $w, $h, $size, nowMs(),
        ]);
        return $this->mediaView(['id' => $id, 'width' => $w, 'height' => $h], 6 * 3600);
    }

    /** One picture file, if the signature is right. */
    public function mediaFile(string $mid, string $size, int $exp, string $sig): Response
    {
        if (!isset(CelebrationMedia::SIZES[$size]) || !$this->media->verify($mid, $size, $exp, $sig)) {
            throw new HttpError(403, 'This picture link has expired. Reload the page.', 'bad-signature');
        }
        $row = $this->db->one('SELECT m.*, c.status FROM celebration_media m JOIN celebrations c ON c.id = m.cid WHERE m.id = ? AND m.deleted_at IS NULL', [$mid]);
        if (!$row || $row['status'] !== 'active') throw new HttpError(404, 'Picture not found.', 'not-found');
        $bytes = $this->media->read($row['cid'], $mid, $size, $row['ext']);
        if ($bytes === null) throw new HttpError(404, 'Picture not found.', 'not-found');
        return Response::image($bytes, $row['ext'] === 'jpg' ? 'image/jpeg' : 'image/webp', max(60, $exp - time()));
    }

    public function mediaView(array $m, int $ttl, bool $full = false): array
    {
        $out = [
            'id' => $m['id'],
            'width' => (int) $m['width'],
            'height' => (int) $m['height'],
            'play' => $this->media->url($m['id'], 'play', $ttl),
            'thumb' => $this->media->url($m['id'], 'thumb', $ttl),
        ];
        if ($full) $out['full'] = $this->media->url($m['id'], 'full', $ttl);
        return $out;
    }

    /* ---------------------------------------------------------------- views */

    private function summary(array $ev): array
    {
        $guests = (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE cid = ? AND removed_at IS NULL', [$ev['id']])['n'];
        return [
            'id' => $ev['id'],
            'slug' => $ev['slug'],
            'title' => $ev['title'],
            'celebrantName' => $ev['celebrant_name'],
            'type' => $ev['type'],
            'types' => $this->typesOf($ev),
            'date' => $ev['event_date'],
            'startTime' => $ev['start_time'],
            'status' => $ev['status'],
            'theme' => json_decode($ev['theme'], true),
            'cover' => $this->coverOf($ev),
            'guests' => $guests,
            'createdAt' => (int) $ev['created_at'],
        ];
    }

    /** Everything the organiser sees, including the private links. Never sent to guests. */
    public function manageView(array $ev): array
    {
        $guests = $this->db->all('SELECT uid, name, team_id, has_account, joined_at, last_seen FROM celebration_guests WHERE cid = ? AND removed_at IS NULL ORDER BY joined_at', [$ev['id']]);
        $media = $this->db->all("SELECT id, width, height FROM celebration_media WHERE cid = ? AND purpose = 'cover' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 6", [$ev['id']]);
        return array_merge($this->publicView($ev), [
            'joinCode' => $ev['join_code'],
            'ownerUid' => $ev['owner_uid'],
            'tokens' => [
                'celebrant' => $ev['celebrant_token'],
                'mc' => $ev['mc_token'],
                'display' => $ev['display_token'],
            ],
            'guests' => array_map(fn ($g) => [
                'uid' => $g['uid'],
                'name' => $g['name'],
                'teamId' => $g['team_id'],
                'hasAccount' => (bool) $g['has_account'],
                'joinedAt' => (int) $g['joined_at'],
                'lastSeen' => (int) $g['last_seen'],
            ], $guests),
            'covers' => array_map(fn ($m) => $this->mediaView($m, 6 * 3600), $media),
            'limits' => $this->limits(),
            'stats' => [
                'guests' => count($guests),
                'teams' => count($this->teams($ev['id'])),
                'withoutTeam' => count(array_filter($guests, fn ($g) => $g['team_id'] === null)),
                // Wall of Love messages waiting for the organiser (the Wall tab shows the number).
                'messagesWaiting' => (int) $this->db->one("SELECT COUNT(*) AS n FROM celebration_messages WHERE cid = ? AND status = 'pending' AND deleted_at IS NULL", [$ev['id']])['n'],
            ],
        ]);
    }

    /** What anyone with the link sees: no tokens, no guest list, no join code. */
    public function publicView(array $ev): array
    {
        $settings = $this->settingsOf($ev);
        return [
            'id' => $ev['id'],
            'slug' => $ev['slug'],
            'title' => $ev['title'],
            'celebrantName' => $ev['celebrant_name'],
            'type' => $ev['type'],
            'types' => $this->typesOf($ev),
            'description' => (string) $ev['description'],
            'date' => $ev['event_date'],
            'startTime' => $ev['start_time'],
            'endTime' => $ev['end_time'],
            'timezone' => $ev['timezone'],
            'venue' => (string) $ev['venue'],
            'welcome' => (string) $ev['welcome'],
            'theme' => json_decode($ev['theme'], true),
            'settings' => $settings,
            'status' => $ev['status'],
            'cover' => $this->coverOf($ev),
            'teams' => $this->teams($ev['id']),
            'guestCount' => (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE cid = ? AND removed_at IS NULL', [$ev['id']])['n'],
            // Groups with someone in them: "3 groups have joined" when games are played by groups.
            'groupCount' => (int) $this->db->one('SELECT COUNT(DISTINCT team_id) AS n FROM celebration_guests WHERE cid = ? AND removed_at IS NULL AND team_id IS NOT NULL', [$ev['id']])['n'],
        ];
    }

    private function guestView(array $ev, string $uid): array
    {
        $row = $this->db->one('SELECT * FROM celebration_guests WHERE cid = ? AND uid = ?', [$ev['id'], $uid]);
        $event = $this->publicView($this->event($ev['id']));
        $own = $row['team_id'] !== null && $this->db->one('SELECT id FROM celebration_teams WHERE id = ? AND made_by = ?', [$row['team_id'], $uid]);
        return ['joined' => true, 'me' => ['uid' => $uid, 'name' => $row['name'], 'teamId' => $row['team_id'], 'ownTeam' => (bool) $own], 'event' => $event];
    }

    private function coverOf(array $ev): ?array
    {
        if (!$ev['cover_media_id']) return null;
        $m = $this->db->one('SELECT id, width, height FROM celebration_media WHERE id = ? AND deleted_at IS NULL', [$ev['cover_media_id']]);
        return $m ? $this->mediaView($m, 7 * 86400) : null;
    }

    public function teams(string $cid): array
    {
        $rows = $this->db->all('SELECT t.id, t.name, t.color, t.capacity, t.sort, t.made_by,
                (SELECT COUNT(*) FROM celebration_guests g WHERE g.cid = t.cid AND g.team_id = t.id AND g.removed_at IS NULL) AS members
            FROM celebration_teams t WHERE t.cid = ? AND t.deleted_at IS NULL ORDER BY t.sort, t.created_at', [$cid]);
        return array_map(fn ($t) => [
            'id' => $t['id'], 'name' => $t['name'], 'color' => $t['color'],
            'capacity' => (int) $t['capacity'], 'members' => (int) $t['members'],
            'madeByGuest' => $t['made_by'] !== null,
            'solo' => self::isSolo($t),
        ], $rows);
    }

    /* ---------------------------------------------------------------- live data */

    /** The summary phones and the TV watch. Firebase trouble never fails the request: MariaDB is the record. */
    public function publish(string $cid): void
    {
        $ev = $this->db->one('SELECT * FROM celebrations WHERE id = ?', [$cid]);
        if (!$ev || $ev['deleted_at'] !== null) return;
        $teams = [];
        foreach ($this->teams($cid) as $i => $t) {
            $teams[$t['id']] = ['name' => $t['name'], 'color' => $t['color'], 'members' => $t['members'], 'sort' => $i];
        }
        $settings = $this->settingsOf($ev);
        $this->live(fn () => $this->rtdb->update('celebrations/' . $cid . '/live', [
            'info' => [
                'title' => $ev['title'],
                'status' => $ev['status'],
                'teamsLocked' => !empty($settings['teamsLocked']),
                'guestTeams' => $settings['guestTeams'],
                'guestMakeTeams' => $settings['guestMakeTeams'],
                'guests' => (int) $this->db->one('SELECT COUNT(*) AS n FROM celebration_guests WHERE cid = ? AND removed_at IS NULL', [$cid])['n'],
                'updatedAt' => nowMs(),
            ],
            'teams' => $teams ?: null,
        ]));
    }

    private function publishMember(string $cid, string $uid): void
    {
        $g = $this->db->one('SELECT name, team_id, removed_at FROM celebration_guests WHERE cid = ? AND uid = ?', [$cid, $uid]);
        $value = ($g && $g['removed_at'] === null) ? ['name' => $g['name'], 'team' => $g['team_id']] : null;
        $this->live(fn () => $this->rtdb->set('celebrations/' . $cid . '/members/' . $uid, $value));
    }

    private function live(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('PlayMona Celebrations live update: ' . $e->getMessage());
        }
    }

    public function audit(string $cid, string $actor, string $action, mixed $detail): void
    {
        $this->db->run('INSERT INTO celebration_audit (id, cid, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
            newId('ca'), $cid, $actor, $action, $detail === null ? null : json_encode($detail), nowMs(),
        ]);
    }

    /* ---------------------------------------------------------------- lookups */

    public function event(string $cid): array
    {
        $ev = $this->db->one('SELECT * FROM celebrations WHERE id = ? AND deleted_at IS NULL', [$cid]);
        if (!$ev) throw new HttpError(404, 'We could not find that celebration.', 'not-found');
        return $ev;
    }

    /** The event at this address, or null. */
    public function bySlug(string $slug): ?array
    {
        if (!preg_match('/^[a-z0-9-]{3,40}$/', $slug)) return null;
        return $this->db->one('SELECT * FROM celebrations WHERE slug = ? AND deleted_at IS NULL', [$slug]);
    }

    public function owned(string $cid, AuthUser $user): array
    {
        $this->needAccount($user);
        $ev = $this->event($cid);
        if (!hash_equals($ev['owner_uid'], $user->uid)) throw new HttpError(403, 'Only the organiser can do that.', 'not-owner');
        return $ev;
    }

    private function team(string $cid, string $tid): array
    {
        $t = $this->db->one('SELECT * FROM celebration_teams WHERE id = ? AND cid = ? AND deleted_at IS NULL', [$tid, $cid]);
        if (!$t) throw new HttpError(404, 'That team was not found.', 'no-team');
        return $t;
    }

    /** This person's guest row; 404 "not-guest" when they have not joined (or were removed). */
    public function guestOf(string $cid, string $uid): array
    {
        return $this->guestRow($cid, $uid);
    }

    private function guestRow(string $cid, string $uid): array
    {
        $g = $this->db->one('SELECT * FROM celebration_guests WHERE cid = ? AND uid = ? AND removed_at IS NULL', [$cid, $uid]);
        if (!$g) throw new HttpError(404, 'Join the celebration first.', 'not-guest');
        return $g;
    }

    public function settingsOf(array $ev): array
    {
        $saved = json_decode((string) $ev['settings'], true) ?: [];
        $out = self::SETTINGS;
        foreach (self::SETTINGS as $k => $_) if (array_key_exists($k, $saved)) $out[$k] = (bool) $saved[$k];
        $out['teamsLocked'] = !empty($saved['teamsLocked']);
        return $out;
    }

    private function needAccount(AuthUser $user): void
    {
        if ($user->isAnonymous()) throw new HttpError(403, 'Create a free PlayMona account to organise a celebration.', 'anonymous');
    }

    /* ---------------------------------------------------------------- cleaning input */

    private function detailsOf(array $ev): array
    {
        return [
            'title' => $ev['title'], 'celebrantName' => $ev['celebrant_name'], 'type' => $ev['type'], 'types' => $this->typesOf($ev),
            'description' => $ev['description'], 'date' => $ev['event_date'], 'startTime' => $ev['start_time'],
            'endTime' => $ev['end_time'], 'timezone' => $ev['timezone'], 'venue' => $ev['venue'], 'welcome' => $ev['welcome'],
        ];
    }

    private function cleanDetails(array $in, bool $creating): array
    {
        $title = $this->cleanText($in['title'] ?? '', 100);
        $celebrant = $this->cleanText($in['celebrantName'] ?? '', 60);
        if ($title === '') throw new HttpError(400, 'Give the celebration a title.', 'no-title');
        if ($celebrant === '') throw new HttpError(400, 'Who is being celebrated? Add their name.', 'no-celebrant');
        $types = isset($in['types']) && is_array($in['types']) ? $in['types'] : [$in['type'] ?? 'birthday'];
        $types = array_values(array_unique(array_map(fn ($x) => is_scalar($x) ? (string) $x : '', $types)));
        if (!$types || count($types) > 3 || array_diff($types, self::TYPES)) {
            throw new HttpError(400, 'Pick one to three kinds of celebration.', 'bad-type');
        }
        $date = $this->nullable($in['date'] ?? null);
        if ($date !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new HttpError(400, 'The date is not valid.', 'bad-date');
        $start = $this->nullable($in['startTime'] ?? null);
        $end = $this->nullable($in['endTime'] ?? null);
        foreach ([$start, $end] as $t) {
            if ($t !== null && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) throw new HttpError(400, 'A time is not valid.', 'bad-time');
        }
        $tz = $this->nullable($in['timezone'] ?? null);
        if ($tz !== null && !preg_match('#^[A-Za-z0-9_+\-/]{1,48}$#', $tz)) $tz = null;
        return [
            'title' => $title,
            'celebrant_name' => $celebrant,
            'type' => $types[0],
            'types' => json_encode($types),
            'description' => $this->cleanText($in['description'] ?? '', 800, true),
            'event_date' => $date,
            'start_time' => $start,
            'end_time' => $end,
            'timezone' => $tz,
            'venue' => $this->cleanText($in['venue'] ?? '', 140),
            'welcome' => $this->cleanText($in['welcome'] ?? '', 500, true),
        ];
    }

    /** What the event celebrates, main kind first (old events have only "type"). */
    private function typesOf(array $ev): array
    {
        $list = json_decode((string) ($ev['types'] ?? ''), true);
        return is_array($list) && $list ? array_values($list) : [$ev['type']];
    }

    private function cleanTheme(mixed $in): array
    {
        $in = is_array($in) ? $in : [];
        $look = in_array($in['look'] ?? '', self::LOOKS, true) ? $in['look'] : 'gala';
        $out = ['look' => $look, 'font' => in_array($in['font'] ?? '', self::FONTS, true) ? $in['font'] : 'classic'];
        foreach (['primary', 'secondary', 'background'] as $k) {
            $c = $this->cleanColor($in[$k] ?? null);
            if ($c) $out[$k] = $c;
        }
        return $out;
    }

    private function cleanSettings(mixed $in): array
    {
        $in = is_array($in) ? $in : [];
        $out = [];
        foreach (self::SETTINGS as $k => $default) $out[$k] = array_key_exists($k, $in) ? (bool) $in[$k] : $default;
        if (!empty($in['teamsLocked'])) $out['teamsLocked'] = true;
        return $out;
    }

    /** Trims, removes control characters (keeps new lines when $multiline) and limits the length. */
    public function cleanText(mixed $v, int $max, bool $multiline = false): string
    {
        $s = is_scalar($v) ? (string) $v : '';
        $s = $multiline ? preg_replace("/[^\P{C}\n]+/u", '', str_replace("\r\n", "\n", $s)) : preg_replace('/\p{C}+/u', ' ', $s);
        $s = trim((string) $s);
        if (!$multiline) $s = (string) preg_replace('/\s+/u', ' ', $s);
        else $s = (string) preg_replace("/\n{3,}/", "\n\n", $s);
        return mb_substr($s, 0, $max);
    }

    private function nullable(mixed $v): ?string
    {
        $s = is_scalar($v) ? trim((string) $v) : '';
        return $s === '' ? null : $s;
    }

    private function cleanColor(mixed $v): ?string
    {
        return (is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v)) ? strtoupper($v) : null;
    }

    private function capacity(mixed $v): int
    {
        return max(0, min(200, (int) $v));
    }

    private function insertTeam(Db $db, string $cid, string $name, string $color, int $capacity, int $sort, ?string $madeBy = null): string
    {
        $id = newId('t');
        $db->run('INSERT INTO celebration_teams (id, cid, name, color, capacity, sort, made_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $cid, $name, $color, $capacity, $sort, $madeBy, nowMs(),
        ]);
        return $id;
    }

    /** A free web address. $strict: the organiser typed it, so refuse a taken one instead of changing it. */
    private function pickSlug(string $wanted, bool $strict, ?string $self = null): string
    {
        $base = strtolower((string) preg_replace('/[^A-Za-z0-9]+/', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $wanted) ?: $wanted));
        $base = trim(substr(trim($base, '-'), 0, 36), '-');
        if ($strict) {
            if (strlen($base) < 3 || in_array($base, self::RESERVED, true)) throw new HttpError(400, 'Use at least 3 letters or numbers for the address.', 'bad-slug');
            $taken = $this->db->one('SELECT id FROM celebrations WHERE slug = ?', [$base]);
            if ($taken && $taken['id'] !== $self) throw new HttpError(409, 'That address is taken. Try another one.', 'slug-taken');
            return $base;
        }
        if (strlen($base) < 3 || in_array($base, self::RESERVED, true)) $base = 'celebration';
        for ($i = 0; $i < 50; $i++) {
            $slug = $i === 0 ? $base : $base . '-' . ($i < 10 ? $i + 1 : bin2hex(random_bytes(2)));
            if (!$this->db->one('SELECT id FROM celebrations WHERE slug = ?', [$slug])) return $slug;
        }
        throw new \RuntimeException('No free address found.');
    }

    public function slugFree(string $slug, ?string $self = null): bool
    {
        try {
            $this->pickSlug($slug, true, $self);
            return true;
        } catch (HttpError $e) {
            return false;
        }
    }

    private function newJoinCode(): string
    {
        for ($i = 0; $i < 50; $i++) {
            $code = '';
            for ($j = 0; $j < 6; $j++) $code .= self::CODE_CHARS[random_int(0, strlen(self::CODE_CHARS) - 1)];
            if (!$this->db->one('SELECT id FROM celebrations WHERE join_code = ?', [$code])) return $code;
        }
        throw new \RuntimeException('No free join code found.');
    }

    public static function newToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
