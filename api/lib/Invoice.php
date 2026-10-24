<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Invoices for paid orders. data() gives the facts (the app draws its own view from
 * these); pdf() draws the same facts as a one-page A4 PDF.
 */
class Invoice
{
    private const TEXT = '#0b1030';
    private const MUTED = '#4f587e';
    private const BORDER = '#dde2f2';
    private const TINT = '#f3f4fb';
    private const ACCENT = '#6d4dea';

    /**
     * @param array $order    a row from the orders table (must be paid)
     * @param ?array $product the catalog item, if it still exists
     * @param array $seller   ['name', 'site', 'email', 'address'?, 'tax_id'?]
     */
    public static function data(array $order, ?array $product, array $seller, string $timezone = 'Africa/Harare'): array
    {
        $name = $product['name'] ?? $order['product'];
        if (($product['kind'] ?? '') === 'plus') {
            $detail = $product['days'] . ' days of PlayMona Plus. Paid once; it does not renew by itself.';
        } elseif (($product['kind'] ?? '') === 'game') {
            $detail = 'Yours to keep on every device you sign in on.';
        } else {
            $detail = '';
        }
        $cents = (int) $order['amount_cents'];
        $paidAt = (int) ($order['paid_at'] ?? $order['created_at']);
        return [
            'number' => (string) ($order['invoice_no'] ?? ''),
            'orderId' => (string) $order['id'],
            'status' => (string) $order['status'],
            'test' => ($order['mode'] ?? 'sandbox') !== 'live',
            'issuedAt' => $paidAt,
            'issuedText' => self::date($paidAt, $timezone),
            'currency' => (string) $order['currency'],
            'seller' => array_filter([
                'name' => (string) ($seller['name'] ?? 'PlayMona'),
                'site' => (string) ($seller['site'] ?? 'playmona.com'),
                'email' => (string) ($seller['email'] ?? 'support@playmona.com'),
                'address' => (string) ($seller['address'] ?? ''),
                'taxId' => (string) ($seller['tax_id'] ?? ''),
            ], fn ($v) => $v !== ''),
            'buyer' => array_filter([
                'name' => trim((string) ($order['buyer_name'] ?? '')) ?: 'PlayMona player',
                'email' => trim((string) ($order['buyer_email'] ?? '')),
                'account' => (string) $order['uid'],
            ], fn ($v) => $v !== ''),
            'lines' => [[
                'description' => $name,
                'detail' => $detail,
                'qty' => 1,
                'unitCents' => $cents,
                'amountCents' => $cents,
            ]],
            'totalCents' => $cents,
            'paidCents' => $order['status'] === 'paid' ? $cents : 0,
            'payment' => [
                'via' => 'Linkwa',
                'reference' => (string) ($order['payment_reference'] ?? ''),
                'paidText' => $order['paid_at'] ? self::date((int) $order['paid_at'], $timezone) : '',
            ],
        ];
    }

    public static function money(int $cents, string $currency): string
    {
        $amount = number_format($cents / 100, 2);
        return strtoupper($currency) === 'USD' ? '$' . $amount : strtoupper($currency) . ' ' . $amount;
    }

    public static function filename(array $data): string
    {
        return 'PlayMona-invoice-' . preg_replace('/[^A-Za-z0-9-]/', '', $data['number'] ?: $data['orderId']) . '.pdf';
    }

    /** Draws the invoice. $logoJpeg is the PlayMona logo on white (see logoJpeg()). */
    public static function pdf(array $d, ?string $logoJpeg = null): string
    {
        $pdf = new Pdf();
        $pdf->addPage();
        $L = 48.0;
        $R = Pdf::W - 48.0;
        $cur = $d['currency'];

        // Brand bar along the top.
        $pdf->fill(self::ACCENT);
        $pdf->rect(0, 0, Pdf::W, 6);

        // Logo (or the name if the image is missing) and the title.
        if ($logoJpeg) {
            try {
                $pdf->addJpeg('logo', $logoJpeg);
                $pdf->image('logo', $L, 34, 0, 58);
            } catch (\Throwable $e) {
                $logoJpeg = null;
            }
        }
        if (!$logoJpeg) $pdf->text($L, 70, $d['seller']['name'], 24, true, self::ACCENT);

        $pdf->text($R, 62, 'INVOICE', 24, true, self::TEXT, 'right');
        $pdf->text($R, 80, $d['number'] ?: $d['orderId'], 10.5, false, self::MUTED, 'right');

        $paid = $d['status'] === 'paid';
        $pill = $paid ? 'PAID' : strtoupper($d['status']);
        $pw = $pdf->width($pill, 9, true) + 20;
        $pdf->fill($paid ? '#e3f6ea' : '#fdecec');
        $pdf->roundRect($R - $pw, 88, $pw, 18, 9);
        $pdf->text($R - $pw / 2, 100.5, $pill, 9, true, $paid ? '#15803d' : '#b42318', 'center');

        $y = 128;
        if ($d['test']) {
            $pdf->fill('#fff4e0');
            $pdf->stroke('#f59e0b');
            $pdf->roundRect($L, $y, $R - $L, 30, 8, 'B');
            $pdf->text(($L + $R) / 2, $y + 19.5, 'TEST PAYMENT  -  sandbox only, no real money was charged', 10, true, '#9a5b00', 'center');
            $y += 46;
        } else {
            $y += 8;
        }

        // From / Billed to / Details
        $colW = ($R - $L) / 3;
        $cols = [
            ['FROM', array_values(array_filter([
                $d['seller']['name'], $d['seller']['site'], $d['seller']['email'],
                $d['seller']['address'] ?? null,
                isset($d['seller']['taxId']) ? 'Tax ID ' . $d['seller']['taxId'] : null,
            ]))],
            ['BILLED TO', array_values(array_filter([
                $d['buyer']['name'], $d['buyer']['email'] ?? null,
                isset($d['buyer']['account']) ? 'Account ' . substr($d['buyer']['account'], 0, 12) : null,
            ]))],
            ['DETAILS', [
                'Date: ' . $d['issuedText'],
                'Order ID',
                $d['orderId'],
            ]],
        ];
        foreach ($cols as $i => [$label, $lines]) {
            $x = $L + $i * $colW;
            $pdf->text($x, $y + 10, $label, 8, true, self::MUTED);
            $ly = $y + 28;
            foreach ($lines as $j => $line) {
                $size = strlen((string) $line) > 24 && !str_contains((string) $line, ' ') ? 8.5 : 10;   // long ids
                $pdf->text($x, $ly, $pdf->fit((string) $line, $size, $j === 0, $colW - 8), $size, $j === 0, $j === 0 ? self::TEXT : self::MUTED);
                $ly += 15;
            }
        }
        $y += 110;

        // Items table
        $cQty = $R - 190;
        $cUnit = $R - 95;
        $pdf->fill(self::TINT);
        $pdf->roundRect($L, $y, $R - $L, 28, 6);
        $pdf->text($L + 12, $y + 18, 'Description', 9, true, self::MUTED);
        $pdf->text($cQty, $y + 18, 'Qty', 9, true, self::MUTED, 'right');
        $pdf->text($cUnit, $y + 18, 'Unit price', 9, true, self::MUTED, 'right');
        $pdf->text($R - 12, $y + 18, 'Amount', 9, true, self::MUTED, 'right');
        $y += 28;
        $pdf->stroke(self::BORDER);
        foreach ($d['lines'] as $line) {
            $pdf->text($L + 12, $y + 22, $pdf->fit($line['description'], 11, true, $cQty - $L - 60), 11, true);
            if ($line['detail'] !== '') $pdf->text($L + 12, $y + 38, $pdf->fit($line['detail'], 9, false, $R - $L - 24), 9, false, self::MUTED);
            $pdf->text($cQty, $y + 22, (string) $line['qty'], 10.5, false, self::TEXT, 'right');
            $pdf->text($cUnit, $y + 22, self::money($line['unitCents'], $cur), 10.5, false, self::TEXT, 'right');
            $pdf->text($R - 12, $y + 22, self::money($line['amountCents'], $cur), 10.5, true, self::TEXT, 'right');
            $y += 52;
            $pdf->line($L, $y, $R, $y);
        }

        // Totals
        $y += 22;
        $labelX = $R - 170;
        $rows = [
            ['Subtotal', self::money($d['totalCents'], $cur), false],
            ['Total (' . strtoupper($cur) . ')', self::money($d['totalCents'], $cur), true],
            ['Amount paid', self::money($d['paidCents'], $cur), false],
            ['Balance due', self::money($d['totalCents'] - $d['paidCents'], $cur), true],
        ];
        foreach ($rows as $i => [$label, $value, $strong]) {
            if ($i === 1 || $i === 3) {
                $pdf->line($labelX, $y - 13, $R, $y - 13);
            }
            $size = $strong ? 11.5 : 10;
            $pdf->text($labelX, $y, $label, $size, $strong, $strong ? self::TEXT : self::MUTED);
            $pdf->text($R - 12, $y, $value, $size, $strong, self::TEXT, 'right');
            $y += 24;
        }

        // Payment note
        $y += 20;
        $pdf->fill(self::TINT);
        $pdf->roundRect($L, $y, $R - $L, 60, 10);
        $pdf->text($L + 16, $y + 22, $paid ? 'Paid with ' . $d['payment']['via'] . ' on ' . $d['payment']['paidText'] : 'Not paid', 10.5, true);
        $pdf->text($L + 16, $y + 40, $pdf->fit('Payment reference: ' . ($d['payment']['reference'] ?: '-'), 9, false, $R - $L - 32), 9, false, self::MUTED);
        $y += 60;

        // Footer
        $fy = Pdf::H - 64;
        $pdf->stroke(self::BORDER);
        $pdf->line($L, $fy, $R, $fy);
        $pdf->text(($L + $R) / 2, $fy + 20, 'Thank you for playing PlayMona!', 10.5, true, self::ACCENT, 'center');
        $pdf->text(($L + $R) / 2, $fy + 36, 'Questions about this invoice? Email ' . $d['seller']['email'] . ' and quote ' . ($d['number'] ?: $d['orderId']) . '.', 8.5, false, self::MUTED, 'center');

        return $pdf->output('PlayMona invoice ' . ($d['number'] ?: $d['orderId']));
    }

    /** The PlayMona logo flattened onto white as a JPEG (PDFs show JPEGs without extra work). Cached in tmp. */
    public static function logoJpeg(?string $png = null): ?string
    {
        $png ??= dirname(__DIR__, 2) . '/assets/brand/lockup-on-light.png';
        if (!is_file($png) || !function_exists('imagecreatefrompng')) return null;
        $cache = sys_get_temp_dir() . '/playmona-invoice-logo-' . filemtime($png) . '.jpg';
        if (is_file($cache)) return (string) file_get_contents($cache);
        $src = @imagecreatefrompng($png);
        if (!$src) return null;
        $w = imagesx($src);
        $h = imagesy($src);
        $out = imagecreatetruecolor($w, $h);
        imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
        imagealphablending($out, true);
        imagecopy($out, $src, 0, 0, 0, 0, $w, $h);
        ob_start();
        imagejpeg($out, null, 92);
        $jpeg = (string) ob_get_clean();
        @file_put_contents($cache, $jpeg, LOCK_EX);
        return $jpeg;
    }

    private static function date(int $ms, string $timezone): string
    {
        try {
            $tz = new \DateTimeZone($timezone);
        } catch (\Throwable $e) {
            $tz = new \DateTimeZone('UTC');
        }
        return (new \DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone($tz)->format('j M Y');
    }
}
