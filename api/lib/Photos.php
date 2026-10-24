<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Profile pictures. The app shrinks the photo to a 256 px square before sending it;
 * the server checks it is really a picture, draws it again at 256 px (which also drops
 * hidden photo data such as the place it was taken) and keeps one file per player in
 * uploads/avatars/. A player's avatar value is then "photo:<file name>".
 */
class Photos
{
    public const MAX_BYTES = 2 * 1024 * 1024;
    public const SIZE = 256;
    // Pictures bigger than this are refused before decoding, so a tiny file cannot unpack into gigabytes.
    private const MAX_PIXELS = 40_000_000;
    // Without the GD image library the server cannot redraw, so it only takes what the app already made.
    private const MAX_PLAIN_BYTES = 300 * 1024;
    private const MAX_PLAIN_SIDE = 512;

    public function __construct(private string $dir, private ?bool $canRedraw = null) {}

    /** Where the pictures live: uploads/avatars/ in the web root, unless the config says otherwise. */
    public static function defaultDir(): string
    {
        return dirname(__DIR__, 2) . '/uploads/avatars';
    }

    public static function isValue(mixed $value): bool
    {
        return is_string($value) && (bool) preg_match('/^photo:[a-f0-9]{16}-[a-f0-9]{8}\.(webp|jpg)$/', $value);
    }

    public static function url(string $name): string
    {
        return '/uploads/avatars/' . $name;
    }

    /** Characters a removed picture falls back to (each is in assets/avatars/). */
    public static function fallbackCharacter(string $uid): string
    {
        $cast = ['fox', 'nia', 'kenji', 'unicorn'];
        return $cast[crc32($uid) % count($cast)];
    }

    private function redraws(): bool
    {
        return $this->canRedraw ?? (function_exists('imagecreatefromstring') && (function_exists('imagewebp') || function_exists('imagejpeg')));
    }

    /** Every file name starts with this, so the player's old picture can be found and removed. */
    private function prefix(string $uid): string
    {
        return substr(hash('sha256', 'playmona-avatar:' . $uid), 0, 16);
    }

    /** Saves a new picture for the player, removes the old one, and returns the avatar value. */
    public function save(string $uid, string $bytes): string
    {
        if ($bytes === '') throw new HttpError(400, 'Choose a picture.', 'no-photo');
        if (strlen($bytes) > self::MAX_BYTES) throw new HttpError(413, 'That picture is too big. Choose one under 2 MB.', 'too-big');
        $info = @getimagesizefromstring($bytes);
        $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
        if (!$info || !isset($types[$info[2]])) {
            throw new HttpError(415, 'Use a JPG, PNG or WebP picture.', 'not-a-photo');
        }
        [$w, $h] = $info;
        if ($w < 32 || $h < 32) throw new HttpError(400, 'That picture is too small.', 'too-small');
        if ($w * $h > self::MAX_PIXELS) throw new HttpError(413, 'That picture is too big. Choose a smaller one.', 'too-big');

        if ($this->redraws()) {
            [$out, $ext] = $this->redraw($bytes, $w, $h);
        } else {
            $ext = $types[$info[2]];
            if ($ext === 'png' || strlen($bytes) > self::MAX_PLAIN_BYTES || $w > self::MAX_PLAIN_SIDE || $h > self::MAX_PLAIN_SIDE) {
                throw new HttpError(415, 'Please upload the picture from the PlayMona app.', 'needs-app');
            }
            $out = $bytes;
        }

        if (!is_dir($this->dir) && !@mkdir($this->dir, 0755, true) && !is_dir($this->dir)) {
            throw new \RuntimeException('Cannot create ' . $this->dir);
        }
        $name = $this->prefix($uid) . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        $tmp = $this->dir . '/.' . $name . '.tmp';
        if (file_put_contents($tmp, $out) === false || !rename($tmp, $this->dir . '/' . $name)) {
            @unlink($tmp);
            throw new \RuntimeException('Cannot save the picture.');
        }
        @chmod($this->dir . '/' . $name, 0644);
        $this->remove($uid, $name);
        return 'photo:' . $name;
    }

    /** Deletes the player's pictures (except $keep). Returns how many went. */
    public function remove(string $uid, ?string $keep = null): int
    {
        $n = 0;
        foreach (glob($this->dir . '/' . $this->prefix($uid) . '-*') ?: [] as $file) {
            if ($keep !== null && basename($file) === $keep) continue;
            if (@unlink($file)) $n++;
        }
        return $n;
    }

    /** Crops to the middle square and draws it at 256 px. Returns [bytes, extension]. */
    private function redraw(string $bytes, int $w, int $h): array
    {
        $src = @imagecreatefromstring($bytes);
        if (!$src) throw new HttpError(415, 'That picture could not be opened. Try another one.', 'not-a-photo');
        $side = min($w, $h);
        $dst = imagecreatetruecolor(self::SIZE, self::SIZE);
        // Transparent parts of a PNG become white rather than black.
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $src, 0, 0, intdiv($w - $side, 2), intdiv($h - $side, 2), self::SIZE, self::SIZE, $side, $side);
        imagedestroy($src);
        ob_start();
        if (function_exists('imagewebp')) {
            imagewebp($dst, null, 82);
            $ext = 'webp';
        } else {
            imagejpeg($dst, null, 85);
            $ext = 'jpg';
        }
        $out = (string) ob_get_clean();
        imagedestroy($dst);
        if ($out === '') throw new \RuntimeException('The picture could not be redrawn.');
        return [$out, $ext];
    }
}
