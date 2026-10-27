<?php
declare(strict_types=1);

namespace PlayMona;

/** PDO connection plus the table setup. MariaDB on the server, SQLite for local tests. */
class Db
{
    public readonly \PDO $pdo;
    public readonly bool $mysql;

    public function __construct(string $dsn, ?string $user = null, ?string $password = null)
    {
        $this->pdo = new \PDO($dsn, $user, $password, [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $this->mysql = str_starts_with($dsn, 'mysql:');
        if ($this->mysql) $this->pdo->exec("SET time_zone = '+00:00'");
    }

    public static function fromConfig(Config $config): self
    {
        return new self((string) $config->require('db.dsn'), $config->get('db.user'), $config->get('db.password'));
    }

    public function one(string $sql, array $params = []): ?array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    public function all(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    /** Runs a statement and returns how many rows it changed. */
    public function run(string $sql, array $params = []): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }

    /** Runs $fn inside a transaction; rolls back if it throws. */
    public function transaction(callable $fn): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $fn($this);
            $this->pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** " FOR UPDATE" on MariaDB (locks the row until commit); SQLite locks the whole file anyway. */
    public function forUpdate(): string { return $this->mysql ? ' FOR UPDATE' : ''; }

    /** Creates the tables if they do not exist. Safe to run on every deploy. Times are Unix milliseconds. */
    public function migrate(): void
    {
        $engine = $this->mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS orders (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            uid VARCHAR(128) NOT NULL,
            product VARCHAR(40) NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency VARCHAR(3) NOT NULL,
            status VARCHAR(16) NOT NULL,
            last_status VARCHAR(32) NULL,
            link_id VARCHAR(64) NULL,
            short_url VARCHAR(64) NULL,
            checkout_url VARCHAR(255) NULL,
            payment_reference VARCHAR(80) NULL,
            paid_via VARCHAR(16) NULL,
            created_at BIGINT NOT NULL,
            paid_at BIGINT NULL,
            UNIQUE (link_id),
            UNIQUE (payment_reference)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS payment_events (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            order_id VARCHAR(32) NULL,
            source VARCHAR(16) NOT NULL,
            outcome VARCHAR(32) NOT NULL,
            payload TEXT NULL,
            created_at BIGINT NOT NULL
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS entitlements (
            uid VARCHAR(128) NOT NULL PRIMARY KEY,
            plus_until BIGINT NOT NULL DEFAULT 0,
            games TEXT NOT NULL,
            synced INTEGER NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS grants (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            uid VARCHAR(128) NOT NULL,
            kind VARCHAR(8) NOT NULL,
            game VARCHAR(40) NULL,
            days INTEGER NULL,
            source VARCHAR(16) NOT NULL,
            order_id VARCHAR(32) NULL,
            admin_uid VARCHAR(128) NULL,
            note VARCHAR(200) NULL,
            created_at BIGINT NOT NULL
        )$engine");
        // One row per device per UTC day (see Visits). ip_masked is already shortened.
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS visits (
            day CHAR(10) NOT NULL,
            visitor_id CHAR(24) NOT NULL,
            page CHAR(1) NOT NULL,
            ip_masked VARCHAR(40) NULL,
            country CHAR(2) NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (day, visitor_id)
        )$engine");
        // Invoice number series (PM-2026, TEST-2026): the last number used in each.
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS counters (
            name VARCHAR(32) NOT NULL PRIMARY KEY,
            value INTEGER NOT NULL
        )$engine");
        // Settings admins change in the portal (Plus plan prices), as JSON.
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS settings (
            name VARCHAR(40) NOT NULL PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at BIGINT NOT NULL
        )$engine");
        // Players Engine: PlayMona-run players, their skills and records (see Crew).
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS crew_players (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            uid VARCHAR(40) NOT NULL,
            username VARCHAR(20) NOT NULL,
            display_name VARCHAR(40) NOT NULL,
            avatar VARCHAR(40) NOT NULL,
            color VARCHAR(7) NOT NULL,
            bio VARCHAR(300) NULL,
            personality TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            status VARCHAR(12) NOT NULL,
            match_id VARCHAR(32) NULL,
            lease_until BIGINT NULL,
            created_at BIGINT NOT NULL,
            created_by VARCHAR(128) NULL,
            updated_at BIGINT NOT NULL,
            UNIQUE (uid),
            UNIQUE (username)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS crew_skills (
            crew_id VARCHAR(32) NOT NULL,
            game_id VARCHAR(40) NOT NULL,
            skill INTEGER NOT NULL,
            level VARCHAR(8) NOT NULL,
            PRIMARY KEY (crew_id, game_id),
            FOREIGN KEY (crew_id) REFERENCES crew_players (id)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS crew_stats (
            crew_id VARCHAR(32) NOT NULL,
            game_id VARCHAR(40) NOT NULL,
            played INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            draws INTEGER NOT NULL DEFAULT 0,
            total_score BIGINT NOT NULL DEFAULT 0,
            best_score BIGINT NOT NULL DEFAULT 0,
            last_played_at BIGINT NULL,
            PRIMARY KEY (crew_id, game_id),
            FOREIGN KEY (crew_id) REFERENCES crew_players (id)
        )$engine");
        // Quick Match: tickets wait for an opponent; a match is the room they end up in.
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS matches (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            game_id VARCHAR(40) NULL,
            difficulty VARCHAR(8) NOT NULL,
            room_code VARCHAR(12) NOT NULL,
            host_uid VARCHAR(128) NOT NULL,
            crew_count INTEGER NOT NULL DEFAULT 0,
            games_played INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(12) NOT NULL,
            created_at BIGINT NOT NULL,
            started_at BIGINT NULL,
            ended_at BIGINT NULL
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS match_seats (
            match_id VARCHAR(32) NOT NULL,
            uid VARCHAR(128) NOT NULL,
            crew_id VARCHAR(32) NULL,
            place INTEGER NULL,
            score BIGINT NULL,
            joined_at BIGINT NOT NULL,
            PRIMARY KEY (match_id, uid),
            FOREIGN KEY (match_id) REFERENCES matches (id)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS match_tickets (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            uid VARCHAR(128) NOT NULL,
            game_id VARCHAR(40) NULL,
            difficulty VARCHAR(8) NOT NULL,
            room_code VARCHAR(12) NOT NULL,
            status VARCHAR(12) NOT NULL,
            match_id VARCHAR(32) NULL,
            match_room VARCHAR(12) NULL,
            match_game VARCHAR(40) NULL,
            last_seen BIGINT NOT NULL,
            created_at BIGINT NOT NULL
        )$engine");
        // Who has the app open (signed-in players only), for "online" dots and Quick Match.
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS presence (
            uid VARCHAR(128) NOT NULL PRIMARY KEY,
            last_seen BIGINT NOT NULL
        )$engine");
        // Friends: one row per pair, user_a < user_b, so a pair can never have two rows.
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS friendships (
            user_a VARCHAR(128) NOT NULL,
            user_b VARCHAR(128) NOT NULL,
            status VARCHAR(10) NOT NULL,
            requested_by VARCHAR(128) NOT NULL,
            decline_at BIGINT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (user_a, user_b)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS blocks (
            blocker VARCHAR(128) NOT NULL,
            blocked VARCHAR(128) NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (blocker, blocked)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS recent_players (
            owner_uid VARCHAR(128) NOT NULL,
            other_uid VARCHAR(128) NOT NULL,
            game_id VARCHAR(40) NULL,
            last_played_at BIGINT NOT NULL,
            PRIMARY KEY (owner_uid, other_uid)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS friend_invites (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            from_uid VARCHAR(128) NOT NULL,
            to_uid VARCHAR(128) NOT NULL,
            room_code VARCHAR(12) NOT NULL,
            created_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL
        )$engine");
        // AI providers admins add (DeepSeek, OpenAI, ...). Keys are encrypted (see Ai).
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS ai_providers (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            kind VARCHAR(10) NOT NULL,
            vendor VARCHAR(24) NOT NULL,
            name VARCHAR(60) NOT NULL,
            base_url VARCHAR(255) NOT NULL,
            model VARCHAR(80) NOT NULL,
            api_key_enc TEXT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            daily_limit INTEGER NOT NULL DEFAULT 200,
            timeout_ms INTEGER NOT NULL DEFAULT 8000,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS ai_usage (
            provider_id VARCHAR(32) NOT NULL,
            day CHAR(10) NOT NULL,
            requests INTEGER NOT NULL DEFAULT 0,
            tokens INTEGER NOT NULL DEFAULT 0,
            failures INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (provider_id, day)
        )$engine");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS ai_cache (
            hash CHAR(64) NOT NULL PRIMARY KEY,
            output TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )$engine");
        // Columns added after the first release. Each fails harmlessly once it exists.
        foreach ([
            'ALTER TABLE orders ADD COLUMN mode VARCHAR(8) NULL',
            'ALTER TABLE orders ADD COLUMN invoice_no VARCHAR(24) NULL',
            'ALTER TABLE orders ADD COLUMN buyer_name VARCHAR(80) NULL',
            'ALTER TABLE orders ADD COLUMN buyer_email VARCHAR(120) NULL',
            'ALTER TABLE grants ADD COLUMN revoked_at BIGINT NULL',
            'ALTER TABLE grants ADD COLUMN revoked_by VARCHAR(128) NULL',
        ] as $sql) {
            try { $this->pdo->exec($sql); } catch (\PDOException $e) { /* already there */ }
        }
        foreach ([
            'CREATE UNIQUE INDEX orders_invoice ON orders (invoice_no)',
            'CREATE INDEX orders_mode ON orders (mode, status, paid_at)',
            'CREATE INDEX visits_country ON visits (day, country)',
            'CREATE INDEX visits_visitor ON visits (visitor_id, day)',
            'CREATE INDEX orders_uid ON orders (uid, created_at)',
            'CREATE INDEX orders_status ON orders (status, created_at)',
            'CREATE INDEX grants_uid ON grants (uid, created_at)',
            'CREATE INDEX events_order ON payment_events (order_id)',
            'CREATE INDEX crew_status ON crew_players (enabled, status)',
            'CREATE INDEX crew_match ON crew_players (match_id)',
            'CREATE INDEX matches_status ON matches (status, created_at)',
            'CREATE INDEX matches_room ON matches (room_code, status)',
            'CREATE INDEX tickets_wait ON match_tickets (status, game_id, created_at)',
            'CREATE INDEX tickets_uid ON match_tickets (uid, status)',
            'CREATE INDEX presence_seen ON presence (last_seen)',
            'CREATE INDEX friends_b ON friendships (user_b, status)',
            'CREATE INDEX blocks_blocked ON blocks (blocked)',
            'CREATE INDEX recent_owner ON recent_players (owner_uid, last_played_at)',
            'CREATE INDEX invites_to ON friend_invites (to_uid, expires_at)',
        ] as $sql) {
            try { $this->pdo->exec($sql); } catch (\PDOException $e) { /* already there */ }
        }
    }
}

/** Random ids like "o_3kq9..." for orders, events and grants. */
function newId(string $prefix): string
{
    return $prefix . '_' . bin2hex(random_bytes(12));
}

function nowMs(): int
{
    return (int) floor(microtime(true) * 1000);
}
