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
        foreach ([
            'CREATE INDEX visits_country ON visits (day, country)',
            'CREATE INDEX visits_visitor ON visits (visitor_id, day)',
            'CREATE INDEX orders_uid ON orders (uid, created_at)',
            'CREATE INDEX orders_status ON orders (status, created_at)',
            'CREATE INDEX grants_uid ON grants (uid, created_at)',
            'CREATE INDEX events_order ON payment_events (order_id)',
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
