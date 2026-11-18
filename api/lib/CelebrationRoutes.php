<?php
declare(strict_types=1);

namespace PlayMona;

/** Every /api/c/... address (PlayMona Celebrations). Routes::route() asks this first. */
class CelebrationRoutes
{
    /** @param callable(Request):AuthUser $user  @param callable(Request):AuthUser $admin */
    public function __construct(private App $app, private $user, private $admin) {}

    public function route(Request $req): ?Response
    {
        $m = $req->method;
        $p = $req->path;
        if ($p === '/admin/celebrations/limits') {
            ($this->admin)($req);
            if ($m === 'GET') return Response::json(['limits' => $this->c()->limits()]);
            if ($m === 'POST') return Response::json(['limits' => $this->c()->saveLimits($req->json(), ($this->admin)($req)->uid)]);
        }
        if (!str_starts_with($p, '/c/') && $p !== '/c') return null;

        if ($m === 'POST' && $p === '/c') return Response::json($this->c()->create($this->who($req), $req->json()));
        if ($m === 'GET' && $p === '/c/mine') return Response::json(['celebrations' => $this->c()->mine($this->who($req))]);
        if ($m === 'GET' && $p === '/c/find') {
            return Response::json($this->c()->find($this->q($req, 'slug'), $this->q($req, 'code')));
        }
        if ($m === 'GET' && $p === '/c/slug') {
            $this->who($req);
            return Response::json(['free' => $this->c()->slugFree((string) $this->q($req, 's'), $this->q($req, 'self'))]);
        }
        // The celebrant's private page knows only the address; the secret comes in a header.
        if ($m === 'GET' && $p === '/c/private') return Response::json($this->privateBySlug($req));
        if ($m === 'GET' && preg_match('#^/c/media/(m_[a-f0-9]{24})/(full|play|thumb)$#', $p, $mm)) {
            return $this->c()->mediaFile($mm[1], $mm[2], (int) ($req->query['e'] ?? 0), (string) ($req->query['s'] ?? ''));
        }

        if (!preg_match('#^/c/(cel_[a-f0-9]{24})(/.*)?$#', $p, $mm)) return null;
        $cid = $mm[1];
        $rest = $mm[2] ?? '';

        // Guests (any signed-in user, a Firebase anonymous sign-in is enough).
        if ($m === 'POST' && $rest === '/join') return Response::json($this->c()->join($cid, $this->who($req), $req->json(), $req->clientIp()));
        if ($m === 'GET' && $rest === '/me') return Response::json($this->c()->me($cid, $this->who($req)));
        if ($m === 'POST' && $rest === '/team') return Response::json($this->c()->chooseTeam($cid, $this->who($req), (string) ($req->json()['teamId'] ?? '')));
        // A private link (celebrant, MC or TV display): the secret travels in a header, never the address.
        if ($m === 'GET' && $rest === '/link') return Response::json($this->link($req, $cid));
        // The Wall of Love: guests write, the celebrant reads.
        if ($rest === '/wall') {
            if ($m === 'GET') return Response::json($this->w()->forGuest($cid, $this->who($req)));
            if ($m === 'POST') return Response::json($this->w()->post($cid, $this->who($req), $req->json()));
        }
        if ($m === 'POST' && $rest === '/wall/photo') return Response::json($this->w()->photo($cid, $this->who($req), $req->rawBody));
        if ($m === 'POST' && preg_match('#^/wall/(w_[a-f0-9]{24})/(remove|report)$#', $rest, $wm)) {
            return Response::json($wm[2] === 'remove' ? $this->w()->remove($cid, $this->who($req), $wm[1]) : $this->w()->report($cid, $this->who($req), $wm[1]));
        }
        if ($m === 'GET' && $rest === '/for') return Response::json($this->w()->forCelebrant($this->celebrant($req, $cid)));
        if ($m === 'POST' && preg_match('#^/for/(w_[a-f0-9]{24})/favourite$#', $rest, $wm)) {
            return Response::json($this->w()->favourite($this->celebrant($req, $cid), $wm[1], !empty($req->json()['on'])));
        }

        // The organiser.
        if ($m === 'GET' && $rest === '/manage') return Response::json($this->c()->manage($cid, $this->who($req)));
        if ($m === 'POST' && $rest === '/update') return Response::json($this->c()->update($cid, $this->who($req), $req->json()));
        if ($m === 'POST' && $rest === '/delete') {
            $this->c()->delete($cid, $this->who($req));
            return Response::json(['deleted' => true]);
        }
        if ($m === 'POST' && $rest === '/media') {
            return Response::json($this->c()->upload($cid, $this->who($req), (string) ($req->query['purpose'] ?? ''), $req->rawBody));
        }
        if ($m === 'POST' && $rest === '/teams') return Response::json($this->c()->addTeam($cid, $this->who($req), $req->json()));
        if ($m === 'POST' && $rest === '/teams/auto') return Response::json($this->c()->autoTeams($cid, $this->who($req)));
        if ($m === 'POST' && $rest === '/teams/lock') return Response::json($this->c()->lockTeams($cid, $this->who($req), !empty($req->json()['locked'])));
        if ($m === 'POST' && preg_match('#^/teams/(t_[a-f0-9]{24})/(update|delete)$#', $rest, $t)) {
            return Response::json($t[2] === 'update'
                ? $this->c()->updateTeam($cid, $t[1], $this->who($req), $req->json())
                : $this->c()->deleteTeam($cid, $t[1], $this->who($req)));
        }
        if ($m === 'POST' && preg_match('#^/guests/([A-Za-z0-9_-]{1,128})/(move|remove)$#', $rest, $g)) {
            if ($g[2] === 'remove') return Response::json($this->c()->removeGuest($cid, $g[1], $this->who($req)));
            $tid = $req->json()['teamId'] ?? null;
            return Response::json($this->c()->moveGuest($cid, $g[1], $this->who($req), $tid === null || $tid === '' ? null : (string) $tid));
        }
        if ($m === 'GET' && $rest === '/messages') return Response::json($this->w()->manage($cid, $this->who($req)));
        if ($m === 'POST' && preg_match('#^/messages/(w_[a-f0-9]{24})/(approve|reject|pending|delete)$#', $rest, $wm)) {
            return Response::json($this->w()->moderate($cid, $wm[1], $this->who($req), $wm[2]));
        }
        if ($m === 'GET' && $rest === '/book') return Response::json($this->w()->bookForOrganiser($cid, $this->who($req)));
        if ($m === 'POST' && preg_match('#^/links/(celebrant|mc|display)/regenerate$#', $rest, $k)) {
            return Response::json($this->c()->regenerate($cid, $this->who($req), $k[1]));
        }

        // Games: the organiser builds and runs them; phones play through Firebase.
        $now = nowMs();
        if ($rest === '/games') {
            if ($m === 'GET') return Response::json($this->g()->list($cid, $this->who($req)));
            if ($m === 'POST') return Response::json($this->g()->create($cid, $this->who($req), $req->json()));
        }
        if (preg_match('#^/games/(g_[a-f0-9]{24})(?:/(save|publish|unpublish|deactivate|duplicate|delete|start))?$#', $rest, $gm)) {
            $act = $gm[2] ?? '';
            if ($m === 'GET' && $act === '') return Response::json($this->g()->get($cid, $gm[1], $this->who($req)));
            if ($m === 'POST' && $act === 'save') return Response::json($this->g()->save($cid, $gm[1], $this->who($req), $req->json()));
            if ($m === 'POST' && $act === 'start') return Response::json($this->g()->start($cid, $gm[1], $this->who($req), $now));
            if ($m === 'POST' && $act !== '') return Response::json($this->g()->act($cid, $gm[1], $this->who($req), $act));
        }
        if ($m === 'GET' && $rest === '/play') return Response::json($this->g()->live($cid, $this->who($req)));
        if ($m === 'POST' && $rest === '/play/control') {
            return Response::json($this->g()->control($cid, $this->who($req), (string) ($req->json()['action'] ?? ''), $now));
        }
        if ($m === 'POST' && $rest === '/play/nudge') return Response::json($this->g()->nudge($cid, $this->who($req), $now));
        return null;
    }

    /** Opens a private link: which role the secret gives, and the event. Wrong secrets all look the same. */
    private function link(Request $req, string $cid): array
    {
        $ev = $this->c()->event($cid);
        $role = $this->c()->roleFor($ev, $req->header('x-celebration-key'));
        if (!$role || $ev['status'] !== 'active') throw new HttpError(403, 'This link does not work any more. Ask the organiser for a new one.', 'bad-link');
        return ['role' => $role, 'event' => $this->c()->publicView($ev)];
    }

    /** A private link opened by the event's address: { id, role, event }. */
    private function privateBySlug(Request $req): array
    {
        $ev = $this->c()->bySlug((string) $this->q($req, 'slug'));
        $role = $ev ? $this->c()->roleFor($ev, $req->header('x-celebration-key')) : null;
        if (!$ev || !$role || $ev['status'] !== 'active') throw new HttpError(403, 'This link does not work any more. Ask the organiser for a new one.', 'bad-link');
        return ['id' => $ev['id'], 'role' => $role, 'event' => $this->c()->publicView($ev)];
    }

    /** The celebrant's secret, or a refusal that looks the same for every wrong secret. */
    private function celebrant(Request $req, string $cid): array
    {
        $ev = $this->c()->event($cid);
        if ($ev['status'] !== 'active' || $this->c()->roleFor($ev, $req->header('x-celebration-key')) !== 'celebrant') {
            throw new HttpError(403, 'This link does not work any more. Ask the organiser for a new one.', 'bad-link');
        }
        return $ev;
    }

    private function c(): Celebrations { return $this->app->celebrations(); }
    private function w(): CelebrationWall { return $this->app->celebrationWall(); }
    private function g(): CelebrationGames { return $this->app->celebrationGames(); }
    private function who(Request $req): AuthUser { return ($this->user)($req); }

    private function q(Request $req, string $k): ?string
    {
        $v = $req->query[$k] ?? null;
        return is_string($v) && $v !== '' ? substr($v, 0, 64) : null;
    }
}
