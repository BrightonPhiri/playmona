<?php
declare(strict_types=1);

namespace PlayMona;

/** Read-only settings from the config file (see api/config.example.php). */
class Config
{
    public function __construct(private array $values) {}

    public static function load(?string $path): self
    {
        if ($path === null) throw new \RuntimeException('No PlayMona config file found.');
        $values = require $path;
        if (!is_array($values)) throw new \RuntimeException('The config file must return an array.');
        return new self($values);
    }

    /** Reads a setting by dotted name, e.g. get('linkwa.api_base'). */
    public function get(string $key, mixed $default = null): mixed
    {
        $value = $this->values;
        foreach (explode('.', $key) as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) return $default;
            $value = $value[$part];
        }
        return $value;
    }

    public function require(string $key): mixed
    {
        $value = $this->get($key);
        if ($value === null || $value === '') throw new \RuntimeException("Config setting '$key' is missing.");
        return $value;
    }
}
