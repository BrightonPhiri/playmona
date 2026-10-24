<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * A small PDF writer: A4 pages, the built-in Helvetica fonts, filled and stroked
 * shapes, text with alignment, and JPEG images. Enough for invoices, with no
 * libraries to install. Coordinates are in points from the TOP-left corner.
 */
class Pdf
{
    public const W = 595.28;
    public const H = 841.89;

    /** Helvetica and Helvetica-Bold character widths (per 1000 units) for ASCII 32-126, from the Adobe AFM files. */
    private const WIDTHS = [
        false => [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
        true => [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
    ];
    /** Widths of the few non-ASCII WinAnsi characters invoices use. */
    private const EXTRA = [0x95 => 350, 0x96 => 556, 0x97 => 1000, 0xB7 => 278, 0x92 => 222, 0x93 => 333, 0x94 => 333, 0xA9 => 737];

    private array $pages = [];
    private int $page = -1;
    private array $images = [];   // name => [jpeg bytes, width px, height px]

    public function addPage(): void
    {
        $this->pages[] = '';
        $this->page = count($this->pages) - 1;
    }

    /* ---------- drawing ---------- */

    public function fill(string $hex): void { $this->out(self::rgb($hex) . ' rg'); }
    public function stroke(string $hex): void { $this->out(self::rgb($hex) . ' RG'); }

    public function rect(float $x, float $y, float $w, float $h, string $mode = 'f'): void
    {
        $this->out(sprintf('%.2F %.2F %.2F %.2F re %s', $x, self::H - $y - $h, $w, $h, $mode));
    }

    /** A rectangle with rounded corners. $mode: 'f' fill, 'S' stroke, 'B' both. */
    public function roundRect(float $x, float $y, float $w, float $h, float $r, string $mode = 'f'): void
    {
        $r = min($r, $w / 2, $h / 2);
        $k = 0.5523 * $r; // bezier handle for a quarter circle
        $top = self::H - $y;
        $bottom = $top - $h;
        $ops = [
            sprintf('%.2F %.2F m', $x + $r, $top),
            sprintf('%.2F %.2F l', $x + $w - $r, $top),
            sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c', $x + $w - $r + $k, $top, $x + $w, $top - $r + $k, $x + $w, $top - $r),
            sprintf('%.2F %.2F l', $x + $w, $bottom + $r),
            sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c', $x + $w, $bottom + $r - $k, $x + $w - $r + $k, $bottom, $x + $w - $r, $bottom),
            sprintf('%.2F %.2F l', $x + $r, $bottom),
            sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c', $x + $r - $k, $bottom, $x, $bottom + $r - $k, $x, $bottom + $r),
            sprintf('%.2F %.2F l', $x, $top - $r),
            sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c', $x, $top - $r + $k, $x + $r - $k, $top, $x + $r, $top),
            $mode,
        ];
        $this->out(implode(' ', $ops));
    }

    public function line(float $x1, float $y1, float $x2, float $y2, float $width = 0.75): void
    {
        $this->out(sprintf('%.2F w %.2F %.2F m %.2F %.2F l S', $width, $x1, self::H - $y1, $x2, self::H - $y2));
    }

    /**
     * Writes one line of text. $y is the baseline. $align: 'left' (x is the start),
     * 'right' (x is the end) or 'center' (x is the middle).
     */
    public function text(float $x, float $y, string $text, float $size = 10, bool $bold = false, string $color = '#0b1030', string $align = 'left'): void
    {
        $encoded = self::encode($text);
        $w = self::widthOf($encoded, $size, $bold);
        if ($align === 'right') $x -= $w;
        elseif ($align === 'center') $x -= $w / 2;
        $this->out(sprintf(
            'BT %s rg /%s %.2F Tf %.2F %.2F Td (%s) Tj ET',
            self::rgb($color), $bold ? 'F2' : 'F1', $size, $x, self::H - $y, self::escape($encoded)
        ));
    }

    /** Width of a UTF-8 string in points. */
    public function width(string $text, float $size, bool $bold = false): float
    {
        return self::widthOf(self::encode($text), $size, $bold);
    }

    /** Shortens text with "..." so it fits in $max points. */
    public function fit(string $text, float $size, bool $bold, float $max): string
    {
        if ($this->width($text, $size, $bold) <= $max) return $text;
        while (mb_strlen($text) > 1 && $this->width($text . '...', $size, $bold) > $max) {
            $text = mb_substr($text, 0, -1);
        }
        return rtrim($text) . '...';
    }

    /** Registers a JPEG under $name, to draw with image(). */
    public function addJpeg(string $name, string $jpeg): void
    {
        $info = @getimagesizefromstring($jpeg);
        if (!$info || ($info[2] ?? 0) !== IMAGETYPE_JPEG) throw new \InvalidArgumentException('Not a JPEG image.');
        $this->images[$name] = [$jpeg, (int) $info[0], (int) $info[1], ($info['channels'] ?? 3) === 1 ? 'DeviceGray' : 'DeviceRGB'];
    }

    public function hasImage(string $name): bool { return isset($this->images[$name]); }

    /** Draws a registered image. Give $w or $h as 0 to keep the aspect ratio from the other. */
    public function image(string $name, float $x, float $y, float $w, float $h = 0): void
    {
        [, $pw, $ph] = $this->images[$name];
        if ($w <= 0 && $h <= 0) throw new \InvalidArgumentException('Give a width or a height.');
        if ($h <= 0) $h = $w * $ph / $pw;
        if ($w <= 0) $w = $h * $pw / $ph;
        $this->out(sprintf('q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q', $w, $h, $x, self::H - $y - $h, self::imageId($name)));
    }

    /* ---------- output ---------- */

    public function output(string $title = 'PlayMona'): string
    {
        $objects = [];   // index => body (object numbers are index + 1)
        $objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[1] = null; // pages, filled in below
        $objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        $objects[4] = '<< /Title (' . self::escape(self::encode($title)) . ') /Producer (PlayMona) >>';

        $xobjects = [];
        foreach ($this->images as $name => [$jpeg, $w, $h, $space]) {
            $objects[] = "<< /Type /XObject /Subtype /Image /Width $w /Height $h /ColorSpace /$space /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($jpeg) . " >>\nstream\n" . $jpeg . "\nendstream";
            $xobjects[] = '/' . self::imageId($name) . ' ' . count($objects) . ' 0 R';
        }
        $resources = '<< /Font << /F1 3 0 R /F2 4 0 R >>' . ($xobjects ? ' /XObject << ' . implode(' ', $xobjects) . ' >>' : '') . ' >>';

        $kids = [];
        foreach ($this->pages as $content) {
            $filter = '';
            if (function_exists('gzcompress')) {
                $content = gzcompress($content, 6);
                $filter = ' /Filter /FlateDecode';
            }
            $objects[] = '<< /Length ' . strlen($content) . $filter . " >>\nstream\n" . $content . "\nendstream";
            $contentId = count($objects);
            $objects[] = sprintf('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources %s /Contents %d 0 R >>', self::W, self::H, $resources, $contentId);
            $kids[] = count($objects) . ' 0 R';
        }
        $objects[1] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . count($kids) . ' >>';

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objects as $i => $body) {
            $offsets[$i] = strlen($pdf);
            $pdf .= ($i + 1) . " 0 obj\n" . $body . "\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $off) $pdf .= sprintf("%010d 00000 n \n", $off);
        $pdf .= 'trailer << /Size ' . (count($objects) + 1) . " /Root 1 0 R /Info 5 0 R >>\nstartxref\n$xref\n%%EOF\n";
        return $pdf;
    }

    /* ---------- helpers ---------- */

    private function out(string $op): void
    {
        if ($this->page < 0) $this->addPage();
        $this->pages[$this->page] .= $op . "\n";
    }

    private static function imageId(string $name): string
    {
        return 'Im' . preg_replace('/[^A-Za-z0-9]/', '', $name);
    }

    private static function rgb(string $hex): string
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        $n = hexdec(substr(str_pad($hex, 6, '0'), 0, 6));
        return sprintf('%.3F %.3F %.3F', (($n >> 16) & 255) / 255, (($n >> 8) & 255) / 255, ($n & 255) / 255);
    }

    /** UTF-8 to the PDF's WinAnsi (Windows-1252) bytes; anything else becomes "?". */
    private static function encode(string $text): string
    {
        $text = str_replace(["\r", "\n", "\t"], ' ', $text);
        $out = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $text);
        if ($out === false) $out = preg_replace('/[^\x20-\x7E]/', '?', $text) ?? '';
        return $out;
    }

    private static function escape(string $bytes): string
    {
        return strtr($bytes, ['\\' => '\\\\', '(' => '\\(', ')' => '\\)']);
    }

    private static function widthOf(string $bytes, float $size, bool $bold): float
    {
        $table = self::WIDTHS[$bold];
        $units = 0;
        $len = strlen($bytes);
        for ($i = 0; $i < $len; $i++) {
            $c = ord($bytes[$i]);
            $units += ($c >= 32 && $c <= 126) ? $table[$c - 32] : (self::EXTRA[$c] ?? 556);
        }
        return $units * $size / 1000;
    }
}
