<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Pictures for Celebrations (event covers, puzzle photos, guestbook photos).
 *
 * They are personal, so they never go in the public uploads/ folder. Each upload is checked,
 * drawn again with GD (which also drops hidden photo data such as where it was taken) in three
 * sizes, and kept outside the web root:
 *   full  - up to 2048 px, the private master (organiser and celebrant downloads)
 *   play  - up to 1080 px, what guests see in games and on the wall
 *   thumb - up to 360 px, lists and previews
 * Files are read back only through /api/c/media/<id>/<size>?e=<expiry>&s=<signature>. The
 * server signs a link only for someone allowed to see that picture, and the link expires.
 */
class CelebrationMedia
{
    public const SIZES = ['full' => 2048, 'play' => 1080, 'thumb' => 360];
    private const MAX_PIXELS = 50_000_000;

    public function __construct(private string $dir, private string $secret) {}

    /** Outside the web root: /home/user/web/playmona.com/private/celebrations on the server. */
    public static function defaultDir(): string
    {
        return dirname(__DIR__, 3) . '/private/celebrations';
    }

    /**
     * The signing key: from the config, or made once and kept in the settings table,
     * so links keep working across deploys without anyone setting it up.
     */
    public static function secretFrom(Config $config, Db $db): string
    {
        $fixed = (string) $config->get('celebrations.media_secret', '');
        if ($fixed !== '') return $fixed;
        $row = $db->one("SELECT value FROM settings WHERE name = 'celebrations_secret'");
        if ($row) return (string) json_decode((string) $row['value'], true);
        $secret = bin2hex(random_bytes(32));
        try {
            $db->run("INSERT INTO settings (name, value, updated_at) VALUES ('celebrations_secret', ?, ?)", [json_encode($secret), nowMs()]);
        } catch (\PDOException $e) {
            // Another request made it first: use theirs.
            $row = $db->one("SELECT value FROM settings WHERE name = 'celebrations_secret'");
            if ($row) return (string) json_decode((string) $row['value'], true);
        }
        return $secret;
    }

    /**
     * Checks and stores a picture. Returns [ext, width, height, bytes] of the full size.
     * $maxBytes comes from the Celebrations limits.
     */
    public function save(string $cid, string $mediaId, string $bytes, int $maxBytes): array
    {
        if ($bytes === '') throw new HttpError(400, 'Choose a picture.', 'no-photo');
        if (strlen($bytes) > $maxBytes) {
            throw new HttpError(413, 'That picture is too big. Choose one under ' . max(1, intdiv($maxBytes, 1024 * 1024)) . ' MB.', 'too-big');
        }
        $info = @getimagesizefromstring($bytes);
        $types = [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP];
        if (!$info || !in_array($info[2], $types, true)) throw new HttpError(415, 'Use a JPG, PNG or WebP picture.', 'not-a-photo');
        [$w, $h] = $info;
        if ($w < 64 || $h < 64) throw new HttpError(400, 'That picture is too small.', 'too-small');
        if ($w * $h > self::MAX_PIXELS) throw new HttpError(413, 'That picture is too big. Choose a smaller one.', 'too-big');
        if (!function_exists('imagecreatefromstring')) throw new \RuntimeException('GD is needed for Celebrations pictures.');

        $src = @imagecreatefromstring($bytes);
        if (!$src) throw new HttpError(415, 'That picture could not be opened. Try another one.', 'not-a-photo');
        $src = $this->upright($src, $bytes, $info[2]);
        $w = imagesx($src);
        $h = imagesy($src);

        $folder = $this->folder($cid);
        if (!is_dir($folder) && !@mkdir($folder, 0750, true) && !is_dir($folder)) {
            imagedestroy($src);
            throw new \RuntimeException('Cannot create ' . $folder);
        }
        $ext = function_exists('imagewebp') ? 'webp' : 'jpg';
        $out = [];
        foreach (self::SIZES as $size => $max) {
            $scale = min(1, $max / max($w, $h));
            $tw = max(1, (int) round($w * $scale));
            $th = max(1, (int) round($h * $scale));
            $dst = imagecreatetruecolor($tw, $th);
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
            ob_start();
            if ($ext === 'webp') imagewebp($dst, null, $size === 'full' ? 88 : 80);
            else imagejpeg($dst, null, $size === 'full' ? 90 : 82);
            $data = (string) ob_get_clean();
            imagedestroy($dst);
            if ($data === '') throw new \RuntimeException('The picture could not be redrawn.');
            $this->write($folder . '/' . $mediaId . '-' . $size . '.' . $ext, $data);
            if ($size === 'full') $out = [$ext, $tw, $th, strlen($data)];
        }
        imagedestroy($src);
        return $out;
    }

    /** Phone photos are often stored sideways with an "orientation" note; turn them upright. */
    private function upright(\GdImage $img, string $bytes, int $type): \GdImage
    {
        if ($type !== IMAGETYPE_JPEG || !function_exists('exif_read_data')) return $img;
        $exif = @exif_read_data('data://image/jpeg;base64,' . base64_encode($bytes));
        $o = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        $angle = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
        if (!$angle) return $img;
        $turned = imagerotate($img, $angle, 0);
        if (!$turned) return $img;
        imagedestroy($img);
        return $turned;
    }

    private function write(string $path, string $data): void
    {
        $tmp = $path . '.' . bin2hex(random_bytes(3)) . '.tmp';
        if (file_put_contents($tmp, $data) === false || !rename($tmp, $path)) {
            @unlink($tmp);
            throw new \RuntimeException('Cannot save the picture.');
        }
        @chmod($path, 0640);
    }

    private function folder(string $cid): string
    {
        return $this->dir . '/' . preg_replace('/[^a-z0-9_]/', '', $cid);
    }

    public function path(string $cid, string $mediaId, string $size, string $ext): string
    {
        return $this->folder($cid) . '/' . preg_replace('/[^a-z0-9_]/', '', $mediaId) . '-' . $size . '.' . ($ext === 'jpg' ? 'jpg' : 'webp');
    }

    public function read(string $cid, string $mediaId, string $size, string $ext): ?string
    {
        $file = $this->path($cid, $mediaId, $size, $ext);
        return is_file($file) ? (string) file_get_contents($file) : null;
    }

    /** Deletes every size of one picture. */
    public function delete(string $cid, string $mediaId, string $ext): void
    {
        foreach (array_keys(self::SIZES) as $size) @unlink($this->path($cid, $mediaId, $size, $ext));
    }

    /** Deletes a whole event's pictures (event deleted). */
    public function deleteAll(string $cid): void
    {
        $folder = $this->folder($cid);
        foreach (glob($folder . '/*') ?: [] as $file) @unlink($file);
        @rmdir($folder);
    }

    /**
     * A signed address for one size of one picture. Expiry is rounded up to whole hours so the
     * same picture keeps the same address for a while (browsers can reuse their copy).
     */
    public function url(string $mediaId, string $size, int $ttlSeconds, ?int $nowSec = null): string
    {
        $now = $nowSec ?? time();
        $exp = (int) (ceil(($now + $ttlSeconds) / 3600) * 3600);
        return '/api/c/media/' . $mediaId . '/' . $size . '?e=' . $exp . '&s=' . $this->sign($mediaId, $size, $exp);
    }

    public function sign(string $mediaId, string $size, int $exp): string
    {
        return substr(hash_hmac('sha256', $mediaId . '|' . $size . '|' . $exp, $this->secret), 0, 32);
    }

    public function verify(string $mediaId, string $size, int $exp, string $sig, ?int $nowSec = null): bool
    {
        if ($exp < ($nowSec ?? time())) return false;
        return hash_equals($this->sign($mediaId, $size, $exp), $sig);
    }
}
