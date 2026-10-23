<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * What can be bought, and for how much. Prices live here on the server only,
 * so the app can never choose its own price.
 */
class Catalog
{
    /** @param array $premiumGames game id => ['name' => ..., 'cents' => ...] from the config */
    public function __construct(private array $premiumGames = []) {}

    public function all(): array
    {
        $items = [
            'plus_week' => ['kind' => 'plus', 'name' => 'PlayMona Plus: 1 week', 'cents' => 100, 'days' => 7],
            'plus_month' => ['kind' => 'plus', 'name' => 'PlayMona Plus: 1 month', 'cents' => 300, 'days' => 30],
            'plus_year' => ['kind' => 'plus', 'name' => 'PlayMona Plus: 1 year', 'cents' => 2500, 'days' => 365],
        ];
        foreach ($this->premiumGames as $id => $game) {
            if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', (string) $id)) continue;
            $items['game_' . $id] = [
                'kind' => 'game',
                'game' => (string) $id,
                'name' => 'Unlock ' . ($game['name'] ?? $id),
                'cents' => (int) ($game['cents'] ?? 199),
            ];
        }
        foreach ($items as $id => &$item) {
            $item['id'] = $id;
            $item['currency'] = 'USD';
        }
        unset($item);
        return $items;
    }

    public function find(string $id): ?array
    {
        return $this->all()[$id] ?? null;
    }
}
