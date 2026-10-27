<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * API addresses for Quick Match, friends, the Players Engine admin pages, AI providers and the
 * crew runner. Routes hands each request here before giving up with a 404.
 */
class EngineRoutes
{
    /** @param callable $user fn(Request): AuthUser   @param callable $admin fn(Request): AuthUser */
    public function __construct(private App $app, private $user, private $admin) {}

    public function route(Request $req): ?Response
    {
        $m = $req->method;
        $p = $req->path;
        $now = nowMs();

        // Quick Match and presence
        if ($m === 'POST' && $p === '/presence') {
            $this->app->matchmaker()->touch($this->user($req)->uid, $now);
            return Response::json(['ok' => true]);
        }
        if ($m === 'POST' && $p === '/match/queue') {
            $u = $this->user($req);
            return Response::json($this->app->matchmaker()->queue($u, $this->isAdmin($u), $req->json(), $now));
        }
        if (preg_match('#^/match/ticket/([A-Za-z0-9_]{3,40})(/cancel)?$#', $p, $mm)) {
            $u = $this->user($req);
            if ($m === 'POST' && !empty($mm[2])) {
                $this->app->matchmaker()->cancel($u, $mm[1]);
                return Response::json(['ok' => true]);
            }
            if ($m === 'GET') return Response::json($this->app->matchmaker()->ticket($u, $mm[1], $this->isAdmin($u), $now));
        }

        // Friends
        if ($m === 'GET' && $p === '/friends') return Response::json($this->app->friends()->overview($this->user($req)->uid, $now));
        if ($m === 'POST' && str_starts_with($p, '/friends/')) return $this->friendAction($req, substr($p, 9), $now);
        if ($m === 'POST' && $p === '/played') {
            $n = $this->app->friends()->played($this->user($req), (string) ($req->json()['roomCode'] ?? ''), $now);
            return Response::json(['ok' => true, 'players' => $n]);
        }
        if ($m === 'GET' && $p === '/players/search') {
            return Response::json(['players' => $this->app->friends()->search($this->user($req)->uid, (string) ($req->query['q'] ?? ''), $now)]);
        }
        if ($m === 'GET' && preg_match('#^/players/([A-Za-z0-9_-]{3,128})$#', $p, $mm)) {
            return Response::json($this->app->friends()->profile($this->user($req)->uid, $mm[1], $now));
        }

        // Admin: the Players Engine
        if ($m === 'GET' && $p === '/admin/crew') { $this->admin($req); return $this->crewOverview($now); }
        if ($m === 'POST' && $p === '/admin/crew/settings') {
            $a = $this->admin($req);
            $this->app->crew()->saveSettings($req->json(), $a->uid);
            return $this->crewOverview($now);
        }
        if ($m === 'POST' && $p === '/admin/crew/player') {
            $a = $this->admin($req);
            $body = $req->json();
            $id = (string) ($body['id'] ?? '');
            $data = array_intersect_key($body, array_flip(['displayName', 'username', 'avatar', 'color', 'bio', 'personality', 'skills']));
            $player = $id === '' ? $this->app->crew()->create($data, $a->uid) : $this->app->crew()->update($id, $data);
            return Response::json(['player' => $player]);
        }
        if ($m === 'POST' && $p === '/admin/crew/player/enable') {
            $this->admin($req);
            $body = $req->json();
            return Response::json(['player' => $this->app->crew()->setEnabled((string) ($body['id'] ?? ''), (bool) ($body['enabled'] ?? false))]);
        }
        if ($m === 'POST' && $p === '/admin/crew/release') {
            $this->admin($req);
            $this->app->matchmaker()->endMatch((string) ($req->json()['matchId'] ?? ''), 'cancelled', $now);
            return $this->crewOverview($now);
        }
        if ($m === 'POST' && $p === '/admin/crew/draft') {
            $this->admin($req);
            return Response::json(['draft' => $this->app->ai()->draftPlayer((array) $req->json(), $this->app->crew())]);
        }

        // Admin: AI providers
        if ($m === 'GET' && $p === '/admin/ai') { $this->admin($req); return $this->aiOverview(); }
        if ($m === 'POST' && $p === '/admin/ai/provider') {
            $this->admin($req);
            $this->app->ai()->saveProvider($req->json(), $now);
            return $this->aiOverview();
        }
        if ($m === 'POST' && $p === '/admin/ai/provider/delete') {
            $this->admin($req);
            $this->app->ai()->deleteProvider((string) ($req->json()['id'] ?? ''));
            return $this->aiOverview();
        }
        if ($m === 'POST' && $p === '/admin/ai/test') {
            $this->admin($req);
            return Response::json($this->app->ai()->test((string) ($req->json()['id'] ?? '')));
        }

        // The crew runner (shared secret, never a player's token)
        if ($m === 'POST' && str_starts_with($p, '/internal/crew/')) return $this->internal($req, substr($p, 15), $now);

        return null;
    }

    private function friendAction(Request $req, string $action, int $now): Response
    {
        $u = $this->user($req);
        $body = $req->json();
        $f = $this->app->friends();
        $other = (string) ($body['uid'] ?? '');
        switch ($action) {
            case 'request': return Response::json(['result' => $f->request($u, $body, $now)]);
            case 'respond': $f->respond($u, $other, (bool) ($body['accept'] ?? false), $now); break;
            case 'cancel': $f->cancel($u, $other); break;
            case 'remove': $f->remove($u, $other); break;
            case 'block': $f->block($u, $other, $now); break;
            case 'unblock': $f->unblock($u, $other); break;
            case 'invite': $f->invite($u, $other, (string) ($body['roomCode'] ?? ''), $now); break;
            case 'invite/dismiss': $f->dismissInvite($u, (string) ($body['id'] ?? '')); break;
            default: throw new HttpError(404, 'Not found.', 'not-found');
        }
        return Response::json(['ok' => true]);
    }

    private function internal(Request $req, string $action, int $now): Response
    {
        $secret = (string) $this->app->config->get('crew.runner_secret', '');
        $given = (string) $req->header('x-crew-secret');
        if (strlen($secret) < 24 || !hash_equals($secret, $given)) throw new HttpError(403, 'Forbidden.', 'forbidden');
        $body = $req->json();
        $mm = $this->app->matchmaker();
        switch ($action) {
            case 'heartbeat':
                $drop = $mm->heartbeat((int) ($body['pid'] ?? 0), (array) ($body['matches'] ?? []), $now);
                $s = $this->app->crew()->settings();
                return Response::json(['drop' => $drop, 'settings' => ['mode' => $s['mode'], 'stopNew' => $s['stopNew']]]);
            case 'report':
                $matchId = (string) ($body['matchId'] ?? '');
                $event = (string) ($body['event'] ?? '');
                if ($event === 'game') {
                    $stay = $mm->gameEnded($matchId, (string) ($body['gameId'] ?? ''), (array) ($body['ranked'] ?? []), $now);
                    return Response::json(['stay' => $stay]);
                }
                if (!in_array($event, ['leave', 'failed'], true)) throw new HttpError(400, 'Unknown event.', 'bad-event');
                $mm->endMatch($matchId, $event === 'failed' ? 'failed' : 'ended', $now);
                return Response::json(['stay' => false]);
            case 'stopped':
                $this->app->runner()->stopped((int) ($body['pid'] ?? 0));
                return Response::json(['ok' => true]);
        }
        throw new HttpError(404, 'Not found.', 'not-found');
    }

    private function crewOverview(int $now): Response
    {
        $runner = $this->app->runner();
        return Response::json([
            'settings' => $this->app->crew()->settings(),
            'players' => array_map(fn ($p) => $p + ['totals' => $this->app->crew()->totals($p['id'])], $this->app->crew()->all()),
            'matches' => $this->app->matchmaker()->activeCrewMatches(),
            'runner' => ['alive' => $runner->alive($now)] + array_intersect_key($runner->state(), array_flip(['beatAt', 'startedAt', 'matches', 'spawnAt', 'stoppedAt'])),
            'games' => Crew::GAMES, 'traits' => Crew::TRAITS,
            'humansOnline' => $this->app->matchmaker()->humansOnline('', $now),
        ]);
    }

    private function aiOverview(): Response
    {
        return Response::json(['providers' => $this->app->ai()->providers(), 'vendors' => Ai::VENDORS, 'kinds' => Ai::KINDS, 'ready' => $this->app->ai()->canEncrypt()]);
    }

    private function isAdmin(AuthUser $u): bool
    {
        // Only needed while crew are limited to admins; saves a Firebase read otherwise.
        if ($this->app->crew()->settings()['mode'] !== 'admins') return false;
        try {
            return $this->app->rtdb()->get('admins/' . $u->uid) === true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function user(Request $req): AuthUser { return ($this->user)($req); }
    private function admin(Request $req): AuthUser { return ($this->admin)($req); }
}
