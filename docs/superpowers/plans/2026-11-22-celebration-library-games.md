# Celebrations: games from the library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisers add any eligible library game (e.g. Verse Rush) to a celebration; at the party every group plays the same seeded run on their phones and the result counts on the event leaderboard.

**Architecture:** A new celebration template `library` with a crew-runner referee like the Quiz's. Phones play the game on the normal game page (`play.html`, launched with a `celebration` override that works like a friend challenge's seed) and send one `score` command to the event inbox; the referee ranks teams by best score and gives place points.

**Tech Stack:** Classic browser JS (ES2017), PHP 8 API on MariaDB/SQLite, Firebase RTDB (dev transport locally), node test harness (`tools/test`).

**Spec:** `docs/superpowers/specs/2026-11-22-celebration-library-games-design.md`

## Global Constraints

- Config `{ game, minutes, prize }`; `minutes` in `[5, 10, 15, 20]` default 10; `prize` in `[1000, 2000, 3000, 5000]` default 3000.
- Allowed games: `Leaderboards::GAMES` on the server; in the browser also `FF.Leaderboards.active(def)` and present in `FF.Games`.
- Place points: `round(prize × (n − place + 1) / n / 10) × 10`, n = teams with a score; no score = 0.
- First score per uid counts; a team's score is its best member's; equal scores share a place.
- Celebration runs never count on PlayMona leaderboards and never become friend challenges.
- Classic scripts, ES2017 or older; strings through `t()`; clean URLs.

## Review Focus

- A guest who was signed out / a guest-only browser opens Play: no paywall, guest gate, or sign-up screen (Task 4 test on `_checksAccess`).
- Two phones in one team both send: best one counts, not the last (Task 1 test).
- A score arriving after the end (or for an old run) changes nothing (Task 1 test).
- The run ends by itself when the time is up even if nobody plays (Task 1 test).
- A game removed from `FF.Games` (old page) shows "reload" rather than a broken Play button (Task 5, manual).

---

### Task 1: Rules and referee

**Files:**
- Create: `js/celebrate/library/rules.js`, `js/celebrate/library/referee.js`
- Modify: `api/crew/lib/loader.js` (after the quiz files), `js/celebrate/livePanel.js:37` (dev referee list), `database.rules.json` (inbox `score`, `ms`)
- Test: `tools/test/celebrate.library.test.js`

**Interfaces:**
- Produces `FF.LibraryRules = { MINUTES, PRIZES, DEFAULTS, sanitize(raw) -> {game, minutes, prize}, placePoints(prize, place, n) -> int, ranked(scores, teamIds) -> [{teamId, score, at, place, points}] }`.
  `scores = { teamId: { score, at, by } }`.
- Produces `FF.CelebrateReferees.library.create(opts)` with the Quiz referee's opts and return shape.
- Run view at `celebrations/<cid>/run`: `{ v:1, runId, gameId, template:'library', game, name, instructions, phase:'starting'|'playing'|'ended', startAt, waitReady, ready, seed, minutes, prize, endsAt, teams, order, finished:{teamId:{score, by}}, mine:{uid:score}, total, result }`.
- Phone command: `inbox/<uid>/<id> = { type:'score', runId, n, t, score, ms }`.

- [ ] Tests: sanitize (unknown game kept as string ≤ 40 chars of `[A-Za-z0-9]`, minutes/prize fall back), placePoints(3000, 1..5, 5) = 3000,2400,1800,1200,600, ranked shares places and breaks ties by earlier `at`; referee: starting → playing after countdown with a seed string; first score per uid counts; best of team; all teams scored ends with ranked points and one report; time up ends; End control ends; late/old-run scores ignored; restart resumes; loader/livePanel/rules include the files and fields; PHP `LIBRARY` consts match.
- [ ] Implement rules and referee (copy the Quiz referee's members/ready/control/save/publish structure; no pause).
- [ ] `node tools/test/one.js celebrate.library` passes; commit.

### Task 2: Server template

**Files:** Modify `api/lib/CelebrationGames.php`

- [ ] `TEMPLATES` gains `library`; `LIBRARY = ['minutes' => [5, 10, 15, 20], 'prize' => [1000, 2000, 3000, 5000]]`, `LIBRARY_DEFAULTS = ['minutes' => 10, 'prize' => 3000]`.
- [ ] `sanitize('library')`: `game` must be in `Leaderboards::GAMES` else `''`; `ready()` refuses with "Choose a game from the library first." when empty.
- [ ] Create accepts `config.game` for library (`POST /games {template:'library', game}`) and names it from `in.name`; instructions default: "Every group plays {name} on their phone. Same questions for everyone, one go each. Best score wins."
- [ ] `view`/`lineup` also return `game` and `minutes`.
- [ ] Task 1's PHP-consts test passes; `php -l`; commit.

### Task 3: Organiser picker and covers

**Files:** Modify `js/celebrate/games.js`, `js/celebrate/common.js`, `css/celebrate.css`

- [ ] `FF.Celebrate.gameArt(template, cls, game)` / `gameCover(template, game)`: for `library` use the game's cover via the asset manifest (`assets/images/covers/<game>.webp`), else the game's icon.
- [ ] Add-a-game list: a "From the game library" section listing eligible games (cover, name, short line), with a search box when > 8. Picking posts `{ template:'library', game, name: def.name }`.
- [ ] Library game editor: game name shown (not changeable), Time to play and Points for first place selects.
- [ ] Manual check in preview; commit.

### Task 4: Game page hook

**Files:** Create `js/celebrate/libraryRun.js` (loaded by `play.html`); Modify `js/registry.js`, `play.html`
- Test: `tools/test/celebrate.library.test.js` (encode/decode, access)

**Interfaces:**
- `FF.CelebrateLibraryRun = { link(o) -> url, decode(hash) -> {cid, runId, game, seed, back} | null, boot(), send(cel, score, ms) -> Promise }`.
- `GameFlow.launch(game, { celebration: {cid, runId, seed, back}, skipIntro:true })`.

- [ ] registry.js: `celebration` treated like `challenge` for standard settings (`mode:'solo'`), sharedDeal, `_checksAccess` false, seed `roundSeed('cel|'+seed, id, 'init')`, no restart, no `usePlay`; at the end skips Leaderboards/Challenge, calls `FF.CelebrateLibraryRun.finish(cur, points)` and results show "Score sent" status plus **Back to the party**.
- [ ] `boot()` on load reads `#celebrate=`, clears the hash, launches the game; `send` opens `FF.Transport` on `celebrations/<cid>`, writes the score command, closes; retries 3 times.
- [ ] Tests pass; commit.

### Task 5: Guest phone

**Files:** Create `js/celebrate/library/play.js`; Modify `event.html`, `js/celebrate/event.js` (PLAYERS, lineup facts)

- [ ] `FF.LibraryPlay.mount(host, {transport, uid, onClose})`: Get ready (FF.CelebrateReady), then Play button (link from `FF.CelebrateLibraryRun.link`-equivalent built here: `/play#celebrate=…`), "Your score is in" with the team's best and standings, ended results. Unknown game on this page → reload message.
- [ ] Manual check; commit.

### Task 6: TV and MC

**Files:** Modify `js/celebrate/tv.js`, `js/celebrate/mc.js`

- [ ] TV `library` scene: cover, name, "Playing on your phones", time left, "{n} of {total} groups finished", best scores so far.
- [ ] MC list subtitle "On phones · {n} min"; live panel shows finished count.
- [ ] Manual check; commit.

### Task 7: End-to-end in the preview

- [ ] Dev servers, organiser adds Verse Rush, two guest tabs, MC starts, both play, scores land on TV/leaderboard; full test suite passes (ignoring the 3 CRLF failures).
