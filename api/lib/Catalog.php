<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * What can be bought, and for how much. Prices live on the server only,
 * so the app can never choose its own price.
 *
 * Plus plans have defaults here. Admins change the price, whether a plan is on sale,
 * the "best value" badge and the picture in the admin portal (Finances > Plus plans);
 * those changes are saved in the settings table (see savePlan) and laid over the defaults.
 */
class Catalog
{
    /** Lifetime Plus is stored as 100 years, so it works with the same date maths. */
    public const LIFETIME_DAYS = 36500;

    /** The plans, cheapest first. Ids never change: orders and invoices refer to them. */
    public const PLANS = [
        'plus_day' => ['label' => '1 day', 'days' => 1, 'cents' => 99],
        'plus_week' => ['label' => '1 week', 'days' => 7, 'cents' => 299],
        'plus_month' => ['label' => '1 month', 'days' => 30, 'cents' => 499],
        'plus_year' => ['label' => '1 year', 'days' => 365, 'cents' => 4999, 'best' => true],
        'plus_lifetime' => ['label' => 'Lifetime', 'days' => self::LIFETIME_DAYS, 'cents' => 9999],
    ];

    public const MIN_CENTS = 10;
    public const MAX_CENTS = 100000;
    private const SETTING = 'plans';

    /**
     * @param array $premiumGames game id => ['name' => ..., 'cents' => ..., 'image' => ...] from the config
     * @param array $planSettings plan id => ['cents', 'enabled', 'best', 'image'] saved by admins
     */
    public function __construct(private array $premiumGames = [], private array $planSettings = []) {}

    /** The admins' plan changes from the settings table; none if it cannot be read yet. */
    public static function loadPlanSettings(Db $db): array
    {
        try {
            $row = $db->one('SELECT value FROM settings WHERE name = ?', [self::SETTING]);
        } catch (\Throwable $e) {
            return [];   // the table arrives with the next cron migrate
        }
        $value = $row ? json_decode((string) $row['value'], true) : null;
        return is_array($value) ? $value : [];
    }

    /**
     * Saves an admin's change to one plan and returns the plan as it now is.
     * $change may hold cents, enabled, best and image ('' puts the standard picture back).
     */
    public function savePlan(Db $db, string $id, array $change, string $adminUid): array
    {
        if (!isset(self::PLANS[$id])) throw new HttpError(404, 'That plan does not exist.', 'no-plan');
        $current = $this->planSettings[$id] ?? [];
        if (array_key_exists('cents', $change)) {
            $cents = $change['cents'];
            if (!is_int($cents) && !(is_string($cents) && ctype_digit($cents))) throw new HttpError(400, 'Enter a price.', 'bad-price');
            $cents = (int) $cents;
            if ($cents < self::MIN_CENTS || $cents > self::MAX_CENTS) {
                throw new HttpError(400, sprintf('The price must be between $%.2f and $%.2f.', self::MIN_CENTS / 100, self::MAX_CENTS / 100), 'bad-price');
            }
            $current['cents'] = $cents;
        }
        foreach (['enabled', 'best'] as $flag) {
            if (array_key_exists($flag, $change)) $current[$flag] = (bool) $change[$flag];
        }
        if (array_key_exists('image', $change)) {
            $image = trim((string) $change['image']);
            if ($image !== '' && !self::validImage($image)) {
                throw new HttpError(400, 'Use a picture from /assets/ or an https:// address ending in .jpg, .png or .webp.', 'bad-image');
            }
            if ($image === '') unset($current['image']); else $current['image'] = $image;
        }
        $current['updatedAt'] = nowMs();
        $current['updatedBy'] = $adminUid;

        $db->transaction(function (Db $db) use ($id, $current) {
            $row = $db->one('SELECT value FROM settings WHERE name = ?' . $db->forUpdate(), [self::SETTING]);
            $all = $row ? (json_decode((string) $row['value'], true) ?: []) : [];
            $all[$id] = $current;
            $json = json_encode($all);
            if ($row) {
                $db->run('UPDATE settings SET value = ?, updated_at = ? WHERE name = ?', [$json, nowMs(), self::SETTING]);
            } else {
                $db->run('INSERT INTO settings (name, value, updated_at) VALUES (?, ?, ?)', [self::SETTING, $json, nowMs()]);
            }
            $this->planSettings = $all;
        });
        return $this->find($id);
    }

    /** A site picture (/assets/…) or an https address, ending in a picture type. */
    public static function validImage(string $image): bool
    {
        if (strlen($image) > 300) return false;
        if (preg_match('#^/assets/[A-Za-z0-9_./-]+\.(jpe?g|png|webp)$#i', $image)) return !str_contains($image, '..');
        return (bool) preg_match('#^https://[A-Za-z0-9.-]+(:\d+)?/[^\s"\'<>?\#]*\.(jpe?g|png|webp)(\?[^\s"\'<>]*)?$#i', $image);
    }

    /** Every item, including plans taken off sale (old orders and invoices still need them). */
    public function all(): array
    {
        $items = [];
        foreach (self::PLANS as $id => $plan) {
            $saved = $this->planSettings[$id] ?? [];
            $lifetime = $plan['days'] === self::LIFETIME_DAYS;
            $items[$id] = [
                'kind' => 'plus',
                'name' => 'PlayMona Plus: ' . ($lifetime ? 'lifetime' : $plan['label']),
                'label' => $plan['label'],
                'cents' => (int) ($saved['cents'] ?? $plan['cents']),
                'days' => $plan['days'],
                'lifetime' => $lifetime,
                'enabled' => (bool) ($saved['enabled'] ?? true),
                'best' => (bool) ($saved['best'] ?? ($plan['best'] ?? false)),
                'image' => (string) ($saved['image'] ?? '/assets/images/plans/' . $id . '.jpg'),
                'customImage' => isset($saved['image']),
                'defaultCents' => $plan['cents'],
            ];
        }
        foreach ($this->premiumGames as $id => $game) {
            if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', (string) $id)) continue;
            $image = (string) ($game['image'] ?? '');
            $items['game_' . $id] = [
                'kind' => 'game',
                'game' => (string) $id,
                'name' => 'Unlock ' . ($game['name'] ?? $id),
                'cents' => (int) ($game['cents'] ?? 199),
                'enabled' => true,
                'image' => self::validImage($image) ? $image : null,
            ];
        }
        foreach ($items as $id => &$item) {
            $item['id'] = $id;
            $item['currency'] = 'USD';
        }
        unset($item);
        return $items;
    }

    /** What players can buy now. */
    public function forSale(): array
    {
        return array_filter($this->all(), fn ($item) => $item['enabled']);
    }

    public function find(string $id): ?array
    {
        return $this->all()[$id] ?? null;
    }

    /** The picture as a full address, for Linkwa's checkout page. */
    public static function imageUrl(?string $image, string $siteUrl): ?string
    {
        if ($image === null || $image === '') return null;
        return str_starts_with($image, '/') ? rtrim($siteUrl, '/') . $image : $image;
    }
}
