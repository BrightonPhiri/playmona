<?php
declare(strict_types=1);

namespace PlayMona;

/** An error that becomes a JSON reply with this status code. The message is shown to the player. */
class HttpError extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly string $reason = 'error')
    {
        parent::__construct($message);
    }
}

/** What a route returns: a JSON body, a redirect, or a file to download. */
class Response
{
    public function __construct(
        public readonly int $status = 200,
        public readonly array $body = [],
        public readonly ?string $location = null,
        public readonly ?string $file = null,
        public readonly string $contentType = 'application/json; charset=utf-8',
        public readonly ?string $filename = null
    ) {}

    public static function json(array $body, int $status = 200): self { return new self($status, $body); }
    public static function redirect(string $to): self { return new self(302, [], $to); }

    /** A download, e.g. an invoice PDF. */
    public static function file(string $bytes, string $contentType, string $filename): self
    {
        return new self(200, [], null, $bytes, $contentType, preg_replace('/[^A-Za-z0-9._-]/', '', $filename));
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        if ($this->location !== null) {
            header('Location: ' . $this->location);
            return;
        }
        if ($this->file !== null) {
            header('Content-Type: ' . $this->contentType);
            header('Content-Length: ' . strlen($this->file));
            if ($this->filename) header('Content-Disposition: attachment; filename="' . $this->filename . '"');
            echo $this->file;
            return;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($this->body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}

/** The parts of an HTTP request the routes need, so tests can build one without a web server. */
class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query = [],
        public readonly string $rawBody = '',
        public readonly array $headers = [],
        public readonly string $remoteAddr = ''
    ) {}

    public static function fromGlobals(): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $path = preg_replace('#^/api#', '', $path) ?: '/';
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = (string) $value;
            }
        }
        if (!isset($headers['authorization']) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['authorization'] = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            rtrim($path, '/') ?: '/',
            $_GET,
            (string) file_get_contents('php://input'),
            $headers,
            (string) ($_SERVER['REMOTE_ADDR'] ?? '')
        );
    }

    public function header(string $name): ?string { return $this->headers[strtolower($name)] ?? null; }

    /**
     * The visitor's address. The site is behind Cloudflare, so the connection comes
     * from a Cloudflare server and the visitor's own address is in CF-Connecting-IP.
     */
    public function clientIp(): string
    {
        $cf = trim((string) $this->header('cf-connecting-ip'));
        return filter_var($cf, FILTER_VALIDATE_IP) ? $cf : $this->remoteAddr;
    }

    public function bearer(): ?string
    {
        $h = $this->header('authorization');
        return ($h && preg_match('/^Bearer\s+(\S+)$/i', $h, $m)) ? $m[1] : null;
    }

    /** The JSON body as an array. Bad JSON is a 400. */
    public function json(): array
    {
        if (trim($this->rawBody) === '') return [];
        $data = json_decode($this->rawBody, true);
        if (!is_array($data)) throw new HttpError(400, 'The request body is not valid JSON.', 'bad-json');
        return $data;
    }
}

/** Small curl wrapper. Returns [status, decoded JSON or null, raw body]. */
class HttpClient
{
    public function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 20): array
    {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
        ];
        if ($body !== null) $opts[CURLOPT_POSTFIELDS] = $body;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($raw === false) throw new \RuntimeException('Request to ' . parse_url($url, PHP_URL_HOST) . ' failed: ' . $error);
        $data = json_decode((string) $raw, true);
        return [$status, is_array($data) ? $data : null, (string) $raw];
    }
}
