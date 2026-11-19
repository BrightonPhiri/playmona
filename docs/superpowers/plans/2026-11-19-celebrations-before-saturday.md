# Celebrations: before Saturday Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Up to 3 celebration kinds, guest-made teams, a join-early page (countdown + locked games list) and a TV split screen of every team's board, in one PR before Vicky's event on 22 Nov 2026.

**Architecture:** Server changes live in `api/lib/Celebrations.php` (types, guest teams, a public guest check) and `api/lib/CelebrationGames.php` (a photo-free game list for guests), routed in `api/lib/CelebrationRoutes.php`. Client changes are in the existing classic-script files under `js/celebrate/`; the TV panels draw from the `run` view the TV already watches, so no new live data.

**Tech Stack:** PHP 8.3 (namespace PlayMona, `Db`, `HttpError`), MariaDB/SQLite, vanilla ES2017 IIFEs on `window.FF`, Firebase RTDB (unchanged rules).

**Spec:** `docs/superpowers/specs/2026-11-19-celebrations-before-saturday-design.md`

## Global Constraints

- Classic scripts, ES2017 or older, on `window.FF`; strings through `t(key, fallback, vars)`.
- Old events (single `type`, organiser-made teams) keep working unchanged.
- Never send a game's photos or thumbnails to guests before play; the TV never draws an unsolved team's picture.
- Teams count toward `teamsPerEvent` (12); names 1–30 chars via `cleanText`.
- No RTDB rule changes (guests still write only to `inbox`).
- Tests: `php tools/api/test.php` (all pass), `node tools/test/run.js` (only the 3 known Windows CRLF failures).
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; one PR; Brighton approves the merge.

## Review Focus

1. Two guests make teams with the same name at the same moment → only one team is made; the second gets 409 `team-taken` (name check inside the transaction).
2. An event with **zero** teams and guest-made teams on → the guest still sees "Make our own team" (today `needsTeamPick()` hides the card when there are no teams).
3. An event with a date but no start time, or a bad time zone → no countdown and no error.
4. A guest-made team removed by the organiser → its guests return to "no team yet" (existing `deleteTeam`), and the colour frees up for the next guest team.
5. TV with 9+ teams, or a run view whose `tiles` arrive as an RTDB object instead of an array → bars fall back / `list()` normalises; no blank screen.

---

### Task 1: Up to 3 kinds of celebration (server)

**Files:**
- Modify: `api/lib/Celebrations.php` (migrate, `create` INSERT, `cleanDetails`, `detailsOf`, `summary`, `publicView`)
- Test: `tools/api/celebrations.test.php`

**Interfaces:**
- Produces: views gain `types: string[]` (1–3, first equals `type`). Input accepts `types` (list) or `type` (string).

- [ ] **Step 1: Write the failing test** `celebrations: an event celebrates up to three things`
  ```php
  $w = celWorld();
  $ev = newEvent($w, ['types' => ['birthday', 'graduation']]);
  eq(['birthday', 'graduation'], $ev['types']);
  eq('birthday', $ev['type']);
  $id = $ev['id'];
  eq(['graduation'], celCall($w, 'POST', "/c/$id/update", ['token' => organiser(), 'json' => ['types' => ['graduation', 'graduation']]])[1]['types'], 'duplicates dropped');
  eq(400, celCall($w, 'POST', "/c/$id/update", ['token' => organiser(), 'json' => ['types' => ['birthday', 'wedding', 'farewell', 'reunion']]])[0], 'more than 3');
  eq(400, celCall($w, 'POST', "/c/$id/update", ['token' => organiser(), 'json' => ['types' => []]])[0], 'none');
  eq(400, celCall($w, 'POST', "/c/$id/update", ['token' => organiser(), 'json' => ['types' => ['party']]])[0], 'unknown');
  // Old style: one type only still works, and an old row with no types column value reads as [type].
  $old = newEvent($w, ['type' => 'wedding']);
  eq(['wedding'], $old['types']);
  $w['db']->run('UPDATE celebrations SET types = NULL WHERE id = ?', [$old['id']]);
  eq(['wedding'], celCall($w, 'GET', '/c/find?slug=' . $old['slug'], [])[1]['types']);
  ```
- [ ] **Step 2: Run** `php tools/api/test.php` — expected FAIL on `types`.
- [ ] **Step 3: Implement.** In `migrate`: `try { ALTER TABLE celebrations ADD COLUMN types TEXT NULL } catch`. `cleanDetails`: read `$in['types']` if it is an array else `[$in['type'] ?? 'birthday']`; keep string values, `array_values(array_unique())`; 400 `bad-type` "Pick one to three kinds of celebration." when empty, more than 3, or any not in `TYPES`; return `type => $types[0]`, `types => json_encode($types)`. `create` INSERT adds the `types` column. `detailsOf` passes `'types' => $this->typesOf($ev)`. Add `private function typesOf(array $ev): array` (decode `types`, fall back to `[$ev['type']]`) and add `'types' => $this->typesOf($ev)` to `summary` and `publicView`. Note: `update` merges `detailsOf` with `$in`, so an update sending only `type` must not be overridden by the stored `types` — when `$in` has `type` but no `types`, unset the merged `types`.
- [ ] **Step 4: Run** `php tools/api/test.php` — PASS.
- [ ] **Step 5: Commit** `feat(celebrations): an event can celebrate up to three things`

### Task 2: Up to 3 kinds (organiser form and labels)

**Files:**
- Modify: `js/celebrate/common.js` (add `typesOf`, `typesLabel`; hero kicker)
- Modify: `js/celebrate/organiser.js` (`detailsSection` picker, `draftFrom`, `draftAsEvent`, `payload`, wizard draft, list card meta)
- Modify: `js/celebrate/tv.js` (`welcome()` kicker)
- Modify: `css/celebrate.css` (order badge on `.cel-type`)
- Test: `tools/test/celebrate.common.test.js` (new)

**Interfaces:**
- Consumes: `ev.types` from Task 1.
- Produces: `FF.Celebrate.typesOf(ev) -> string[]` (falls back to `[ev.type]`), `FF.Celebrate.typesLabel(ev) -> string` joined with `' · '`.

- [ ] **Step 1: Write the failing test** `celebrate common: kinds read old and new events`
  ```js
  const C = loadFF(['js/core.js', 'js/celebrate/common.js']).Celebrate;
  assertEqual(C.typesOf({ type: 'wedding' }), ['wedding']);
  assertEqual(C.typesOf({ type: 'birthday', types: ['birthday', 'graduation'] }), ['birthday', 'graduation']);
  assertEqual(C.typesLabel({ types: ['birthday', 'graduation'] }), 'Birthday · Graduation');
  ```
- [ ] **Step 2: Run** `node tools/test/run.js celebrate.common` — FAIL (`typesOf` undefined).
- [ ] **Step 3: Implement** the two helpers and export them. Hero kicker uses `typesLabel(ev)` (icon stays the first kind's). Picker: role `group`, buttons `aria-pressed`; draft holds `types` (array); tap adds to the end (ignored with a toast "Pick up to 3" when 3 are chosen), tap again removes (not the last one); a small `.cel-type__n` badge shows 1/2/3; `draft.type` = `types[0]` and `autoTitle()` uses it. `payload` and `draftAsEvent` send `types`; `draftFrom` reads `C().typesOf(ev)`; wizard default `types: ['birthday']`. Organiser list meta and TV welcome kicker use `typesLabel`.
- [ ] **Step 4: Run** `node tools/test/run.js celebrate.common` — PASS.
- [ ] **Step 5: Commit** `feat(celebrations): pick up to three kinds in the form`

### Task 3: Guest-made teams (server)

**Files:**
- Modify: `api/lib/Celebrations.php` (`SETTINGS`, migrate, new `guestMakeTeam`, `teams()`, `publish`, block list const, `insertTeam` gains `?string $madeBy`)
- Modify: `api/lib/CelebrationRoutes.php` (guest route)
- Test: `tools/api/celebrations.test.php`

**Interfaces:**
- Produces: `POST /c/<cid>/team/new {name}` (guest) → guest view `{joined, me, event}` with `me.teamId` = the new team. Setting `guestMakeTeams` (default `true`). Team views gain `madeByGuest: bool`. Errors: 403 `teams-by-organiser` (`guestTeams` off), 403 `no-guest-teams` (`guestMakeTeams` off), 403 `teams-locked`, 403 `limit`, 400 `no-name`, 400 `bad-name` (block list), 409 `team-taken`, 404 `not-guest`.

- [ ] **Step 1: Write the failing test** `celebrations: a group makes its own team`
  ```php
  $w = celWorld();
  $ev = newEvent($w, ['teamCount' => 2]);
  $id = $ev['id'];
  eq(true, $ev['settings']['guestMakeTeams']);
  celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g1'), 'json' => ['name' => 'Table 4']]);
  [$s, $b] = celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g1'), 'json' => ['name' => '  The Aunties ']]);
  eq(200, $s, json_encode($b));
  $mine = array_values(array_filter($b['event']['teams'], fn ($t) => $t['id'] === $b['me']['teamId']))[0];
  eq('The Aunties', $mine['name']);
  eq('#C0392B', $mine['color'], 'first unused colour (Gold and Silver are taken)');
  eq(true, $mine['madeByGuest']);
  eq(1, $mine['members']);
  eq(404, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('stranger'), 'json' => ['name' => 'X']])[0]);
  celCall($w, 'POST', "/c/$id/join", ['token' => guestToken('g2'), 'json' => ['name' => 'B']]);
  eq(409, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => 'the aunties']])[0], 'name taken, any case');
  eq(400, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => '   ']])[0]);
  eq(400, celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => 'Team Fuck']])[0], 'blocked word');
  // Organiser removes it: colour is free again.
  celCall($w, 'POST', "/c/$id/teams/{$mine['id']}/delete", ['token' => organiser()]);
  $again = celCall($w, 'POST', "/c/$id/team/new", ['token' => guestToken('g2'), 'json' => ['name' => 'Cousins']])[1];
  eq('#C0392B', array_values(array_filter($again['event']['teams'], fn ($t) => $t['id'] === $again['me']['teamId']))[0]['color']);
  ```
  and `celebrations: guest-made teams follow the team rules`
  ```php
  // guestMakeTeams off → 403 no-guest-teams; guestTeams off → 403 teams-by-organiser;
  // locked → 403 teams-locked; at teamsPerEvent (12) → 403 limit. Each with eq(403, ...) on POST /team/new.
  ```
- [ ] **Step 2: Run** `php tools/api/test.php` — FAIL (404 route).
- [ ] **Step 3: Implement.** `SETTINGS['guestMakeTeams'] = true`. migrate: `ALTER TABLE celebration_teams ADD COLUMN made_by VARCHAR(128) NULL` (try/catch). `private const BLOCKED = [...]` — about 20 worst English slurs/obscenities, lower-case; `private function blocked(string $name): bool` matches whole words, case-insensitive, after replacing `0→o 1→i 3→e 4→a 5→s @→a $→s`. `public function guestMakeTeam(string $cid, AuthUser $user, array $in): array`: event active, `guestRow`, settings checks in the order of the errors above, clean name (30), blocked check; then in `$this->db->transaction` lock live teams (`forUpdate`), re-count against `teamsPerEvent`, refuse a same-name team (`LOWER(name) = LOWER(?)`), colour = first `TEAM_COLOURS` entry not used by a live team, else `TEAM_COLOURS[$count % 12]`; insert with `made_by = uid` and `sort = max(sort)+1`; move the guest. Then `publishMember`, `publish`, audit `team.guest-made`, return `guestView`. `teams()` selects `t.made_by` and returns `'madeByGuest' => $t['made_by'] !== null`. `publish()` info adds `'guestMakeTeams' => $settings['guestMakeTeams']`. Route: `if ($m === 'POST' && $rest === '/team/new')` before the `/team` line.
- [ ] **Step 4: Run** `php tools/api/test.php` — PASS (including the existing team-rule tests).
- [ ] **Step 5: Commit** `feat(celebrations): groups make and name their own team`

### Task 4: Guest-made teams (event page and organiser)

**Files:**
- Modify: `js/celebrate/event.js` (`joinCard` label, `needsTeamPick`, `teamCard`, `meCard` line)
- Modify: `js/celebrate/organiser.js` (settings `sw('guestMakeTeams', …)`, `DEFAULT_SETTINGS`, Teams tab note)
- Modify: `css/celebrate.css` (`.ev-maketeam` form)

**Interfaces:**
- Consumes: `POST /c/<cid>/team/new`, `ev.settings.guestMakeTeams`, `team.madeByGuest` (Task 3).

- [ ] **Step 1: Implement.** Join label "Your name, or your group's name" (`celWhatNameGroup`), placeholder "e.g. Tracey or Table 4". `needsTeamPick()` true when `guestTeams && !teamsLocked && (teams.length || guestMakeTeams)`. `teamCard()`: under the list (or alone when there are no teams), when `guestMakeTeams` is on, show the button. Guests do not know `teamsPerEvent`, so the server's `limit` error shows under the input. Button "Make our own team" (icon `users`) reveals an inline form: input (maxlength 30, label "Team name"), "Make the team" submit, Cancel; on success `state.me/state.ev = r`, `paint()`, toast "Welcome to {team}!"; on error show the message under the input. `meCard` with no teams and `guestMakeTeams`: "Pick or make your team below." Organiser settings: `sw('guestMakeTeams', 'Guests can make their own team', 'A group on one phone types its own team name. You can rename or remove any team.')` right after `guestTeams`; add `guestMakeTeams: true` to `DEFAULT_SETTINGS`. Teams tab rows with `madeByGuest` get a small muted "made by a guest" note.
- [ ] **Step 2: Browser check** (organiser tab and a guest tab at localhost:9511): guest joins as "Table 4", makes "The Aunties", sees "You are in The Aunties"; a second guest sees it in the list and joins it; organiser Teams tab shows it with the note and can rename it; with the setting off the button is gone.
- [ ] **Step 3: Commit** `feat(celebrations): make-our-own-team on the event page`

### Task 5: Join early — locked games list and countdown

**Files:**
- Modify: `api/lib/Celebrations.php` (public `guestOf(string $cid, string $uid): array` wrapping `guestRow`)
- Modify: `api/lib/CelebrationGames.php` (new `lineup`)
- Modify: `api/lib/CelebrationRoutes.php` (`GET /c/<cid>/lineup`)
- Modify: `js/celebrate/common.js` (`startsAt`, `countdownText`)
- Modify: `js/celebrate/event.js` (countdown under the hero, Games card after the lobby card, refreshed by the existing 20 s `refresh()`)
- Modify: `css/celebrate.css` (`.ev-countdown`, `.ev-games`)
- Test: `tools/api/celebrationGames.test.php`, `tools/test/celebrate.common.test.js`

**Interfaces:**
- Produces: `GET /c/<cid>/lineup` (joined guest or the organiser) → `{games: [{id, template, name, instructions, rounds, level, seconds, live: bool}]}` — published games only, no `thumb`, no `photos`, no `config`, no URLs. `live` true for the game being played now. `FF.Celebrate.startsAt(ev) -> number|null` (ms since epoch), `FF.Celebrate.countdownText(ms) -> string`.

- [ ] **Step 1: Write the failing PHP test** `celebration games: guests see the games planned, without any pictures`
  ```php
  // Using readyGame() (published Picture Rush with photos) plus one draft game:
  [$s, $b] = celCall($w, 'GET', "/c/$id/lineup", ['token' => guestToken('g1')]);   // g1 joined
  eq(200, $s);
  eq(1, count($b['games']), 'drafts hidden');
  eq(false, $b['games'][0]['live']);
  $json = json_encode($b);
  eq(false, str_contains($json, '/api/c/media'), 'no picture links');
  eq(false, array_key_exists('thumb', $b['games'][0]));
  eq(404, celCall($w, 'GET', "/c/$id/lineup", ['token' => guestToken('stranger')])[0]);
  eq(200, celCall($w, 'GET', "/c/$id/lineup", ['token' => organiser()])[0]);
  ```
- [ ] **Step 2: Write the failing node test** `celebrate common: start time in the event's time zone`
  ```js
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: '14:00', timezone: 'Africa/Harare' }), Date.UTC(2026, 10, 22, 12, 0));
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: '14:00', timezone: 'Europe/London' }), Date.UTC(2026, 10, 22, 14, 0));
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: null }), null);
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: '14:00', timezone: 'Not/AZone' }), new Date(2026, 10, 22, 14, 0).getTime(), 'bad zone: device time');
  assertEqual(C.countdownText((2 * 24 + 4) * 3600e3 + 59e3), 'Starts in 2 days 4 h');
  assertEqual(C.countdownText(3 * 3600e3 + 5 * 60e3), 'Starts in 3 h 5 min');
  assertEqual(C.countdownText(12 * 60e3 + 30e3), 'Starts in 12 min 30 s');
  assertEqual(C.countdownText(1 * 24 * 3600e3), 'Starts in 1 day 0 h');
  ```
- [ ] **Step 3: Run both suites** — FAIL.
- [ ] **Step 4: Implement.** `lineup(string $cid, AuthUser $user)`: if not the owner, `$this->events->guestOf($cid, $user->uid)` (404 `not-guest`); published games ordered like `forStage`; map to the fields above (`live` from `activeRun`). `startsAt`: parse date/time; guess = `Date.UTC(...)`; offset from `Intl.DateTimeFormat('en-US', {timeZone, hourCycle:'h23', year…second})` `formatToParts` at the guess (`asUtc - guess`); return `guess - offset`; try/catch → local `new Date(y, m-1, d, h, mi).getTime()`. `countdownText(ms)`: ≥1 day → "Starts in {d} day(s) {h} h"; ≥1 h → "{h} h {m} min"; else "{m} min {s} s"; via `t()` keys `celStartsInDays/Hours/Mins`. Event page: when `startsAt(ev) > Date.now()`, an `.ev-countdown` line (role `timer`) right under the hero, updated every second by one interval cleared when it is disconnected or the start passes (then removed). Games card ("Games tonight", after the lobby card, only when `games.length`): each row shows name, "Picture Rush", instructions, "{n} pictures · {level}", and a lock chip "Locked: opens when the MC starts it" (icon `lock` if it exists in `FF.Icons`, else `eye-slash`), or "On now" when `live`. Load the lineup in `paint()` after joining and in `refresh()`; redraw only when the JSON changes.
- [ ] **Step 5: Run both suites** — PASS.
- [ ] **Step 6: Browser check:** an event dated tomorrow shows the countdown ticking and the games card with the lock; starting a game from the MC opens it on the phone as before; after the start time passes the countdown disappears.
- [ ] **Step 7: Commit** `feat(celebrations): join early with a countdown and the games planned`

### Task 6: TV split screen ("fair grids")

**Files:**
- Modify: `js/celebrate/tv.js` (`pictureRush()`, new `panels(v)`, `dataKey()`)
- Modify: `css/celebrate.css` (`.tv-panels`, `.tv-panel*`)

**Interfaces:**
- Consumes: run view `v.size`, `v.photo.url`, `v.boards[tid].{tiles, solved, usedMs, correct}`, `teamsOf(v)`.
- Produces: `panels(v) -> HTMLElement` used when `v.phase === 'playing'` (and `reveal` shows the photo as today) and `teamsOf(v).length` is 1–8; otherwise `progress(v)`.

- [ ] **Step 1: Implement `panels(v)`.** Wrapper `div.tv-panels.is-n<count>`; CSS grid columns: n≤2 → n columns; 3–4 → 2; 5–6 → 3; 7–8 → 4 (rows follow). Each `.tv-panel` sets `--team`; head: team name + note (`n / total` or "Done in {time}!"); body when not solved: `.tv-grid` with `grid-template-columns: repeat(size, 1fr)`, `size*size` `span.tv-cell`, `is-ok` when `list(b.tiles)[i] === i` (lit in `--team`); body when solved: `img.tv-panel__photo` with `v.photo.url`, object-fit cover, plus a "Done in {time}!" ribbon. `aria-label` on the grid: "{n} of {total} tiles in place". `dataKey` already includes `[k, b.correct, b.solved]`; add a hash of each board's correct positions (`list(b.tiles).map((p,i)=>p===i?1:0).join('')`) so a swap that keeps the count but moves lit squares redraws.
- [ ] **Step 2: CSS** — panels fill `.tv-stage` height (16:9), gap 1vw, cells square (`aspect-ratio: 1`) inside a centred grid sized by `min(panel width, panel height − head)`; unlit cells `color-mix(in srgb, var(--ev-text) 10%, transparent)`; respect `.tv.has-qr` bottom padding.
- [ ] **Step 3: Browser check** (TV tab at 1280×720 with the MC tab and 2 then 4 guest teams): panels side by side for 2, 2×2 for 4; swapping a tile into place lights that square on the TV within a second; a solved board shows the photo and "Done in …"; 9 teams → bars; dark/gala look readable.
- [ ] **Step 4: Run** `node tools/test/run.js` — only the 3 known failures.
- [ ] **Step 5: Commit** `feat(celebrations): TV split screen with every team's board`

### Task 7: Ship

- [ ] **Step 1:** `php tools/api/test.php` all pass; `node tools/test/run.js` only the 3 known CRLF failures.
- [ ] **Step 2:** Phone-width (375) pass of the event page (countdown, games card, make-team form) and the organiser form (kind picker with 3 picked).
- [ ] **Step 3:** Push `feat/celebrations-saturday`, open one PR listing the four features and the browser checks; ask Brighton before merging. Update memory `playmona-celebrations.md`.
