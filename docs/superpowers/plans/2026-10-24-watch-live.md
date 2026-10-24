# Watch Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can watch a PlayMona room game: rooms are Public or Private, every room has a watch link, a new Watch live page lists public games, and viewers see a TV view (question + live leaderboard) built from room data.

**Architecture:** The room host's device publishes a small **broadcast** document per room under a separate 8-character watch code (`broadcasts/<wc>`), so viewers never read the room and cannot join it. A standalone page `watch.html` (served at `/watch` and `/watch/<code>`) shows the list (from a new cached PHP endpoint `/api/live`, so browsing holds no Firebase connection) and the TV view (anonymous Firebase sign-in, reads one broadcast, registers itself in `watchers/<wc>`). Games tell the race layer what is on screen (`FF.Race.describe`); the right answer is published only after the round settles.

**Tech Stack:** Vanilla ES5 classic scripts on `window.FF` (no build step), Firebase Realtime Database (compat SDK via `js/net/firebaseTransport.js`), PHP 8.2 API in `api/` (no Composer), Node test harness `tools/test/*.test.js`, PHP tests `tools/api/test.php`.

**Spec:** `docs/superpowers/specs/2026-10-24-watch-live-design.md`

## Global Constraints

- ES5 classic scripts only (`var`, `function`, no modules, no arrow functions in `js/`), everything hangs off `window.FF`. Tests in `tools/test` may use modern Node.
- Clean addresses only: `/watch`, `/watch/<code>`, `/api/live`. Never `.html` or `.php` in a link. Use `FF.page('watch')` for in-app links (it adds `.html` on `file://`).
- No emoji in UI copy. Every user-facing string goes through `FF.t(key, 'Default text')` where `FF.t` is loaded; plain words for everyone (not families only).
- UI follows the design system: tokens from `css/tokens.css`, `FF.UI` / `FF.GameUI` components, answer markers ▲ ◆ ● ■ with `--opt-a..d`, both light and dark themes, text contrast 4.5:1 (`node tools/contrast-check.js`).
- Watching is free: no Plus check, no upgrade prompt anywhere in this feature.
- Rooms are Private by default (`meta.public` absent or `false`). Watching is on by default (`meta.watching` absent or `true`).
- Viewer limits default **20 per room** and **50 across the site**, stored at `config/site/watch/{room,site}`, editable by admins. Players are never refused because of viewers.
- Viewers only watch: no answering, chat or reactions. The only thing they add is the viewer count.
- A player whose setting "Show my photo to people watching" is off never has a `photo:` avatar in any broadcast or `/api/live` reply; they appear as `FF.Avatars.fallback(value)`.
- The watch code is 8 characters from the room alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, separate from the 6-character room code. The room code never appears in a broadcast, a watch link or an `/api/live` reply.
- Editing files: write patch scripts with the Write tool and run them with node (exact-match `rep()` that throws on a miss); strip `\r` before matching (repo uses autocrlf). After editing JS, run `node --check <file>`.
- Firebase rules are edited only in `tools/gen-rules.js`, then `node tools/gen-rules.js` regenerates `database.rules.json`.
- Test locally with `localStorage['playmona:devAuth']='true'` and `FF.Storage.set('devRooms', true)` so nothing touches live data. Preview server: `.claude/launch.json` (`node tools/serve.js`, port 8960).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A player opens the watch link on a second device mid-round.** They must not see the right answer before the round settles. Pinned in Task 2 (`screen().answer` is null until settle) and Task 4 (`build()` never puts `answer` in an unsettled round).
2. **The host's phone drops or the host leaves mid-game.** The next host keeps publishing the same broadcast; viewers keep watching without a gap longer than one heartbeat. Pinned in Task 4.
3. **A player with a photo turns "Show my photo to people watching" off, before or during a game.** No broadcast or list reply carries `photo:` for them from the next publish on. Pinned in Tasks 4, 5 and 6.
4. **The room goes Private, or Watching is turned off, while people watch.** Private: drops off `/api/live` but the watch link keeps working. Watching off: the broadcast is removed and viewers see "The host stopped sharing this game". Pinned in Tasks 4, 6 and 8.
5. **A room is abandoned (host's phone dies, everyone closes the app).** Its broadcast goes stale: hidden from `/api/live` after 45 s, and the TV view shows "This game has ended". Also: a viewer arriving at a full room or full site sees "This game is full right now". Pinned in Tasks 6, 7 and 8.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `tools/gen-rules.js` → `database.rules.json` | Rules for `broadcasts`, `watchRooms`, `watchers`, `rooms/$code/admin`, `rooms/$code/meta/public`, `config/site/watch`, `watchers` counter | 1 |
| `.gitignore`, `.github/workflows/deploy.yml`, `docs/roadmap.md` | Housekeeping: ignore `.superpowers/`, renumber phases | 1 |
| `js/net/transport.js`, `js/net/room.js` | `FF.Transport.open(root, useDev)` shared by rooms and broadcasts; `hidePhoto` in presence; `FF.Room.setHidePhoto` | 3 |
| `js/net/race.js` | `describe` / `screen` / `onScreen` | 2 |
| `js/games/{bible,world,visual,quiz,reaction,word,memory,number,puzzle}Games.js` | Each room game describes its screen | 3 |
| `js/net/broadcast.js` (new) | Host publishes the broadcast; watch code; public/watching switches; viewer count | 4 |
| `js/net/roomUI.js`, `js/app.js`, `js/sync.js`, `css/room.css` | Lobby controls, viewer chip, Watch live card, profile setting | 5 |
| `api/lib/Live.php` (new), `api/lib/Routes.php`, `api/lib/bootstrap.php`, `tools/api/test.php` | `/api/live`, `/api/live/<wc>`, counter | 6 |
| `js/watch/view.js`, `js/watch/tv.js` (new), `css/watch.css` (new) | TV view model and rendering | 7 |
| `watch.html`, `js/watch/list.js`, `js/watch/page.js` (new), `.htaccess`, `tools/serve.js`, `index.html` | The page, list, routing, limits, viewer presence, entry points | 8 |
| `js/admin/pages.js`, `js/admin/data.js` | Live rooms: public, viewers, take off Watch live; Site: viewer limits | 9 |

---

### Task 1: Database rules and housekeeping

**Files:**
- Modify: `tools/gen-rules.js` (then regenerate `database.rules.json`)
- Modify: `.gitignore`, `.github/workflows/deploy.yml` (rsync excludes), `docs/roadmap.md`
- Test: `tools/test/watchRules.test.js` (new)

**Interfaces:**
- Produces (database paths every later task uses):
  - `watchRooms/<wc>` = room code (string). Not readable by anyone but admins. Writable only by the host of the room it points to (both when creating and when deleting).
  - `broadcasts/<wc>` = broadcast document (shape in Task 4). Readable by anyone signed in (anonymous included) **at `$wc` only**: no read on `broadcasts` itself, so private rooms cannot be listed. Writable by the host of `watchRooms/<wc>`; `public` may only be `true` when the room is not delisted; admins may write `public: false`.
  - `watchers/<wc>/<uid>` = number (server time). Readable at `$wc` by anyone signed in; each uid writes only its own entry.
  - `rooms/<code>/admin/delisted` = boolean, admin-only write.
  - `rooms/<code>/meta/public` boolean, refused as `true` while `admin/delisted` is true. `meta/watching` boolean, `meta/watchCode` string matching the watch-code pattern.
  - `config/site/watch/room` number 1–1000, `config/site/watch/site` number 1–100000, nothing else under `watch`.
  - Counter name `watchers` added to both counter regexes (`stats/totals/$counter`, `stats/days/$day/$counter`).

- [ ] **Step 1: Write the failing test** `tools/test/watchRules.test.js`, loading `database.rules.json` the way `admin.test.js` does (`RULES = JSON.parse(...).rules`):

```js
test('watch rules: broadcasts are read one at a time, never listed', function () {
  assert(!RULES.broadcasts['.read'], 'no read on the whole list');
  assertEqual(RULES.broadcasts.$wc['.read'], 'auth != null');
  assert(/watchRooms/.test(RULES.broadcasts.$wc['.write']) && /hostUid/.test(RULES.broadcasts.$wc['.write']), 'only the room host writes');
  assert(/delisted/.test(RULES.broadcasts.$wc['.validate']), 'public is refused while delisted');
  assert(/admins/.test(RULES.broadcasts.$wc.public['.write']), 'admins can switch public off');
});
test('watch rules: the room behind a watch code stays hidden', function () {
  assert(/admins/.test(RULES.watchRooms['.read']), 'admin-only read');
  assert(!RULES.watchRooms.$wc['.read'], 'nobody else reads it');
  assert(/hostUid/.test(RULES.watchRooms.$wc['.write']));
});
test('watch rules: viewers write only their own entry', function () {
  assertEqual(RULES.watchers.$wc['.read'], 'auth != null');
  assert(/\$uid === auth\.uid|auth\.uid === \$uid/.test(RULES.watchers.$wc.$uid['.write']));
});
test('watch rules: delisting is admin-only and blocks public', function () {
  assert(/admins/.test(RULES.rooms.$code.admin['.write']));
  assert(/delisted/.test(RULES.rooms.$code.meta.public['.validate']));
});
test('watch rules: limits and the watchers counter', function () {
  const w = RULES.config.site.watch;
  assert(w.room && w.site && w.$other['.validate'] === false);
  assert(RULES.stats.totals.$counter['.validate'].indexOf('watchers') !== -1);
  assert(RULES.stats.days.$day.$counter['.validate'].indexOf('watchers') !== -1);
});
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: the five `watch rules:` tests FAIL (undefined properties).

- [ ] **Step 3: Add the rules to `tools/gen-rules.js`.** Name the shared expression once:

```js
const WC = "/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/";
const ROOM_OF = (wc) => "root.child('rooms').child(root.child('watchRooms').child(" + wc + ").val())";
const HOST_OF = (wc) => ROOM_OF(wc) + ".child('meta').child('hostUid').val() === auth.uid";
```

`watchRooms.$wc['.write']`: `auth != null && $wc.matches(WC) && (data.exists() ? root.child('rooms').child(data.val()).child('meta').child('hostUid').val() === auth.uid : root.child('rooms').child(newData.val()).child('meta').child('hostUid').val() === auth.uid)`; `.validate`: `newData.isString() && newData.val().matches(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/)`. `broadcasts.$wc['.validate']`: `newData.hasChildren(['v', 'status', 'updatedAt']) && (newData.child('public').val() !== true || ROOM_OF('$wc').child('admin').child('delisted').val() !== true)`. Add `'watchers'` to both counter regexes and the `config.site` block. Regenerate: `node tools/gen-rules.js`.

- [ ] **Step 4: Run** `node tools/test/run.js` — Expected: all tests PASS, including the existing `rules:` tests in `admin.test.js`.

- [ ] **Step 5: Housekeeping.** Add `.superpowers/` to `.gitignore` and `--exclude='.superpowers/'` to the rsync line in `deploy.yml`. In `docs/roadmap.md`: Phase 3 becomes "Watch live" (link to the spec), new Phase 4 "Recording (admins first, social clips)", Phase 5 video (was 4), Phase 6+ games and extras (was 5+); update the table and headings; remove "watch links for more than 2 viewers" from the Plus perks.

- [ ] **Step 6: Commit**

```bash
git add tools/gen-rules.js database.rules.json tools/test/watchRules.test.js .gitignore .github/workflows/deploy.yml docs/roadmap.md
git commit -m "feat(watch): database rules for broadcasts, watch codes and viewers"
```

---

### Task 2: Games tell the race layer what is on screen

**Files:**
- Modify: `js/net/race.js`
- Test: `tools/test/watchRace.test.js` (new; set up two phones like `roomFeatures.test.js`)

**Interfaces:**
- Produces:
  - `FF.Race.describe(screen, answer)` — `screen` is a **Screen** (below), `answer` the 0-based index of the right option or `null`. Records it for the current round (`session.index`). No-op when not in a room.
  - `FF.Race.screen()` → `{ n: number, screen: Screen, answer: number|null } | null`. `answer` stays `null` until the round has settled (the moment `onSettle` handlers fire); after that it is the recorded answer. `null` when nothing was described for the current round.
  - `FF.Race.onScreen(cb)` → `off()`. `cb(FF.Race.screen())` on every `describe` and when the round settles. Listeners survive `FF.Race.end()` (the broadcaster registers once per room).
  - **Screen** = `{ kind: 'choice', text: string, image?: Image, options: string[] }` or `{ kind: 'card', text: string, image?: Image }`. **Image** = `{ flag: '<iso code>' }` | `{ src: '<site-relative asset path>' }` | `{ emoji: '<emoji>' }`. `describe` trims `text` to 200 characters, keeps at most 6 options, each trimmed to 80.

- [ ] **Step 1: Write the failing tests**

```js
test('race screen: a described question shows without its answer until the round settles', async function () {
  // host + one player in a dev room, game started, FF.Race.begin('familyQuiz', { rounds: 3 }), beginRound(0)
  A.Race.describe({ kind: 'choice', text: 'Capital of Zimbabwe?', options: ['Harare', 'Lusaka', 'Gaborone', 'Maputo'] }, 0);
  assertEqual(A.Race.screen().n, 0);
  assertEqual(A.Race.screen().answer, null, 'hidden before settle');
  // both players submit correct/incorrect so the round settles
  await tick(50);
  assertEqual(A.Race.screen().answer, 0, 'revealed after settle');
});
test('race screen: onScreen fires on describe and on settle, and survives end()', ...);   // count calls: 1 after describe, 2 after settle; A.Race.end(); listener still registered for the next game
test('race screen: long text and extra options are trimmed', ...);   // 250-char text -> 200; 8 options -> 6; 100-char option -> 80
test('race screen: describing offline does nothing', ...);           // no room: screen() stays null
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: FAIL (`describe is not a function`).
- [ ] **Step 3: Implement** in `js/net/race.js`: a module-level `described = { n, screen, answer, revealed }` reset by `beginRound`; set `revealed = true` inside `emitSettle` before calling handlers; a persistent `screenListeners` array not touched by `end()`.
- [ ] **Step 4: Run** `node tools/test/run.js` — Expected: PASS, and `raceRules.test.js` / `roomFeatures.test.js` still pass.
- [ ] **Step 5: Commit** `git commit -m "feat(watch): race layer records what each round shows"`

---

### Task 3: Every room game describes its screen; shared transport; photo privacy in presence

**Files:**
- Modify: `js/games/bibleGames.js` (bibleQuiz), `js/games/worldGames.js` (whereInWorld, mapChallenge, capitalChallenge, guessFlag — one shared round renderer near line 236), `js/games/visualGames.js` (guessCountry, guessLandmark, guessAnimal, guessFood, guessObject, guessSport, guessVehicle), `js/games/quizGames.js` (familyQuiz, trueOrFalse, guessWho, pictureQuiz), `js/games/reactionGames.js` (quickTap, colorReaction), `js/games/wordGames.js` (letterRush), `js/games/memoryGames.js` (whatsMissing), `js/games/numberGames.js` (numberChallenge), `js/games/puzzleGames.js` (visualRiddle)
- Modify: `js/net/transport.js`, `js/net/firebaseTransport.js`, `js/net/room.js`
- Test: `tools/test/watchGames.test.js` (new), additions to `tools/test/roomFeatures.test.js`, `tools/test/transport.test.js`

**Interfaces:**
- Consumes: `FF.Race.describe(screen, answer)` (Task 2).
- Produces:
  - `FF.Transport.open(root, useDev)` → `Promise<transport>`: the body of today's private `makeTransport` in `room.js` (dev transport with `namespace: 'familyfun'` when `useDev` or `FF.Net.devMode()`, else `FF.Net.firebase({ root })`). `room.js` calls `FF.Transport.open(FF.Transport.roomPath(code), useDev)`.
  - Root `''` means the database root in both transports. Today both use `opts.root || 'rooms/...'`, which turns `''` into a room path: change `dev()` and `firebaseTransport()` to use the default only when `opts.root == null`.
  - Room presence (`registerPresence`) adds `hidePhoto: true` when `FF.Storage.get('hidePhotoPublic', false)` is true (field omitted otherwise).
  - `FF.Room.setHidePhoto(hide: boolean)` → `Promise`: updates `players/<uid>/hidePhoto` to `true` or `null` in the current room; resolves immediately when not in a room.

- [ ] **Step 1: Write the failing tests**

```js
// watchGames.test.js: source check, because games need the full shell to run headless.
test('every room game describes its screen', function () {
  const files = { bibleGames: 1, worldGames: 1, visualGames: 1, quizGames: 4, reactionGames: 1, wordGames: 1, memoryGames: 1, numberGames: 1, puzzleGames: 1 };
  // value = minimum number of describe calls (quizGames has four separate engines)
  Object.keys(files).forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, 'js/games/' + f + '.js'), 'utf8');
    const n = (src.match(/Race\.describe\(/g) || []).length;
    assert(n >= files[f], f + ' describes its rounds (' + n + ')');
  });
});
// roomFeatures.test.js
test('rooms: a player who hides their photo is marked in the room', ...);   // Storage hidePhotoPublic=true, join -> players[uid].hidePhoto === true
test('rooms: setHidePhoto updates the room right away', ...);               // setHidePhoto(true) then (false): field true, then absent
// transport.test.js
test('dev transport: an empty root is the database root', ...);              // dev({ root: '', bus }).set('broadcasts/X', 1) -> bus.read('') deep-equals { broadcasts: { X: 1 } }
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: FAIL.
- [ ] **Step 3: Implement the transport and presence changes** in `transport.js` / `room.js`.
- [ ] **Step 4: Add one `FF.Race.describe` call per round renderer**, right after the question is built and only when racing (`FF.Race.active()`). Choice games: `{ kind: 'choice', text: <prompt>, options: <option labels>, image }` with `answer` = the correct index. Images: flag questions `{ flag: code }` (the code `renderFlagNode` already uses); picture questions `{ src: <asset path> }` or `{ emoji }` matching what the game shows. Games with no fixed options (quickTap, colorReaction, letterRush, whatsMissing, numberChallenge where it is typed, Guess Who before "Guess now") use `{ kind: 'card', text: <the instruction the player sees, e.g. "Tap when the screen turns green"> }` and `answer` `null`.
- [ ] **Step 5: Run** `node tools/test/run.js` and `node --check` on each edited file — Expected: PASS.
- [ ] **Step 6: Commit** `git commit -m "feat(watch): room games describe their rounds; hide-photo flag in room presence"`

---

### Task 4: The host publishes the broadcast

**Files:**
- Create: `js/net/broadcast.js`; add `<script src="js/net/broadcast.js">` to `play.html` after `js/net/race.js`
- Modify: `js/net/room.js` (start/stop the broadcaster on create/join/leave)
- Test: `tools/test/broadcast.test.js` (new; dev bus with two phones, as in `roomFeatures.test.js`)

**Interfaces:**
- Consumes: `FF.Transport.open('', useDev)` (Task 3) for a "watch transport" whose paths are `broadcasts/<wc>`, `watchRooms/<wc>`, `watchers/<wc>`; `FF.Race.screen()` / `onScreen()` / `scores()` (Task 2); room state from `FF.Room.current()`; `rooms/<code>/admin/delisted` read through the room transport (`admin/delisted`); voice flags at room path `voice/<uid>/speaking`.
- Produces `FF.Broadcast`:
  - Constants: `CODE_LENGTH = 8`, `PUBLISH_MS = 500` (at most one write per half second), `HEARTBEAT_MS = 15000` (rewrite `updatedAt` while idle), `STALE_MS = 45000`.
  - `build(input)` → **Broadcast**, pure. `input = { meta, players, rounds, scores, screen, voice, delisted, roomName, game: { id, name, category }, now }`.
  - **Broadcast** = `{ v: 1, name, public: boolean, status: 'lobby'|'playing'|'ended', mode: 'players'|'teams', game: { id, name, category } | null, startAt: number|null, round: { n, total: number|null, opensAt: number|null, screen: Screen|null, answer: number|null } | null, players: { <uid>: { name, avatar, color, score, answered: boolean, correct: boolean|null, talking: boolean, online: boolean, teamId: string|null } }, results: [{ id, name, avatar, score }] | null, updatedAt }`. Only players online now (the same test `FF.Room.presentPlayers` uses) are included. `public` is `false` whenever `delisted`. `total` is `null` when the game is clock-only (`plan` returned the 200 cap). `answer` is copied from `screen.answer` only (already null before settle).
  - `start()` / `stop()`: called by `room.js` after create/join and on leave. Publishes only while `FF.Room.current().isHost`; when host duty moves to this device it starts publishing with the existing `meta.watchCode`.
  - `ensureCode()` → `Promise<string>`: host only; when `meta.watchCode` is missing, writes `watchRooms/<new>` = room code, then `meta.watchCode`. Old saved rooms get one on first host visit.
  - `newLink()` → `Promise<string>`: removes `broadcasts/<old>`, then `watchRooms/<old>` (this order, so rules still see the old mapping), then creates a new code as `ensureCode` does.
  - `setPublic(on)` → `Promise`; rejects with `Error('DELISTED')` when the room is delisted. `setWatching(on)` → `Promise`; off removes `broadcasts/<wc>`, on republishes.
  - `delisted()` → boolean. `watchUrl(code)` → `location.origin + '/watch/' + code`. `onViewers(cb)` → `off()`; `cb(count)` from `watchers/<wc>` (number of children).
  - Leaving as the last person in the room removes `broadcasts/<wc>`.

- [ ] **Step 1: Write the failing tests**

```js
test('broadcast: answer is never published before the round settles', function () {
  const b = FF.Broadcast.build(input({ screen: { n: 2, screen: choice, answer: null } }));
  assertEqual(b.round.answer, null);
  assert(JSON.stringify(b).indexOf('"answer":0') === -1);
});
test('broadcast: a hidden photo is replaced by the character', function () {
  const b = FF.Broadcast.build(input({ players: { u1: { name: 'Tari', avatar: 'photo:0123456789abcdef-01234567.webp', hidePhoto: true, online: true } } }));
  assertEqual(b.players.u1.avatar, FF.Avatars.fallback('photo:0123456789abcdef-01234567.webp'));
});
test('broadcast: a delisted room is never public', ...);       // meta.public true + delisted true -> b.public === false
test('broadcast: scores, answered ticks and talking come from the room', ...); // rounds[2].answers.u1 -> answered true, correct true; voice.u2.speaking -> talking true
test('broadcast: the host publishes under the watch code, not the room code', async ...); // create room; bus has broadcasts/<8 chars>; no value in it equals the room code
test('broadcast: the next host keeps publishing when the host leaves', async ...);        // A hosts, B joins, A.Room.leave(); after tick, broadcast updatedAt advances and is written by B
test('broadcast: watching off removes the broadcast; on brings it back', async ...);
test('broadcast: a new watch link retires the old code', async ...);    // old broadcasts/<wc> and watchRooms/<wc> gone, meta.watchCode changed
test('broadcast: setHidePhoto takes effect on the next publish', async ...);
test('broadcast: teams mode keeps each player\'s teamId', ...);
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: FAIL (`FF.Broadcast` undefined).
- [ ] **Step 3: Implement `js/net/broadcast.js`.** Publish on room `meta`/`players`/`rounds` events, on `FF.Race.onScreen`, and on voice changes, throttled to `PUBLISH_MS`; heartbeat every `HEARTBEAT_MS`; `updatedAt` = `transport.serverTimestamp()` when available, else `serverNow()`. Game name/category: `FF.Games.get(meta.gameId)` and `FF.Categories`.
- [ ] **Step 4: Run** `node tools/test/run.js` — Expected: PASS, existing room tests unchanged.
- [ ] **Step 5: Commit** `git commit -m "feat(watch): host publishes a broadcast under a separate watch code"`

---

### Task 5: Lobby controls, viewer chip, Watch live card, photo setting

**Files:**
- Modify: `js/net/roomUI.js` (lobby panel, Online page card, viewer chip), `css/room.css`
- Modify: `js/app.js` (`editProfile`), `js/sync.js` (`SYNC_KEYS` gains `'hidePhotoPublic'`)
- Test: `tools/test/roomScreens.test.js` (add tests; stub `FF.Broadcast` in `phone()` with call recording)

**Interfaces:**
- Consumes: `FF.Broadcast.setPublic/setWatching/newLink/ensureCode/watchUrl/onViewers/delisted` (Task 4); `FF.Room.setHidePhoto` (Task 3); the existing QR helper `js/net/qr.js` and share code the room invite uses.
- Produces (copy, exactly):
  - Host lobby panel heading **"Watching"** with two switches: **"Public"** — hint on: "Anyone can find this game on Watch live." / off: "Only people with the watch link can watch." — and **"Let people watch"** (hint off: "Nobody can watch this room."). Buttons **"Invite viewers"** and **"New watch link"**.
  - Invite viewers sheet: title "Invite viewers", text "This link is for watching. Viewers see the game but can't play.", the link, Copy and Share buttons, and the QR code.
  - New watch link confirm: "Make a new watch link? The old link will stop working."
  - Delisted: Public switch disabled, note "An admin removed this room from Watch live."
  - Everyone in the room: **"N watching"** chip ("1 watching", "12 watching"), in the lobby and as a fixed chip during the game; hidden at 0.
  - Online page card after "Play with friends": title **"Watch live"**, text "Watch public games being played right now.", opens `FF.page('watch')`. Not gated for guests.
  - Edit profile, shown when the profile avatar is a photo: switch **"Show my photo to people watching"** (default on), hint "When off, people watching see your character." Saving writes `FF.Storage.set('hidePhotoPublic', !on)` and calls `FF.Room.setHidePhoto(!on)`.

- [ ] **Step 1: Write the failing tests**

```js
test('room screens: the host sees the Watching panel; other players do not', ...);  // find 'rm-watch' in host main; absent for guest phone
test('room screens: switching Public calls setPublic', ...);                         // click -> FF.Broadcast.calls includes ['setPublic', true]
test('room screens: a delisted room shows the note and a disabled Public switch', ...);
test('room screens: the viewer chip shows the count and hides at zero', ...);        // emit onViewers(3) -> text '3 watching'; onViewers(0) -> chip hidden
test('room screens: the Online page has a Watch live card that is open to guests', ...);
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the panel (host only, `rm-watch` class), chip, card, and profile switch using `FF.UI` components; styles in `css/room.css` with tokens only.
- [ ] **Step 4: Run** `node tools/test/run.js` and `node tools/contrast-check.js` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(watch): lobby watching controls, viewer count and photo setting"`

---

### Task 6: `/api/live` — the list and the limit check

**Files:**
- Create: `api/lib/Live.php`
- Modify: `api/lib/Routes.php` (two routes, `App::live()`), `api/lib/bootstrap.php` (require the file if it lists classes)
- Test: `tools/api/test.php` (add tests using `MemoryRtdb`)

**Interfaces:**
- Consumes: `RealtimeDb::get('broadcasts')`, `get('watchers')`, `get('config/site/watch')`. No delisted lookup: Task 4 forces `public: false` for delisted rooms and the admin takedown writes `public: false` itself.
- Produces:
  - `final class Live { const DEFAULT_LIMITS = ['room' => 20, 'site' => 50]; const STALE_MS = 45000; const CACHE_SECONDS = 10; public function __construct(private RealtimeDb $db, private string $cacheDir) {} public function list(int $now): array; public function room(string $wc, int $now, bool $open): array; public static function summarize(array $broadcasts, array $watchers, array $limits, int $now): array; }`
  - **LiveRoom** = `['code' => wc, 'name', 'game' => ['id','name','category'], 'status', 'round' => n+1|null, 'total' => int|null, 'players' => [['name','avatar']], 'viewers' => int, 'updatedAt' => int]`. Avatars pass through as broadcast holds them (already photo-safe).
  - `GET /api/live` → `{ rooms: LiveRoom[] (public, fresh; sorted by viewers desc, then updatedAt desc), viewers: <site total>, limits: { room, site }, time }`. Result cached as JSON in `$cacheDir/live.json` for `CACHE_SECONDS`; `Cache-Control: no-store` on the response (Cloudflare must not cache it).
  - `GET /api/live/<wc>` (`#^/live/([ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8})$#`) → `{ room: LiveRoom (public or private), viewers, siteViewers, limits, full: bool, reason: 'room'|'site'|null }`; 404 `not-live` when missing or stale. `?open=1` adds one to `stats/days/<UTC day>/watchers` and `stats/totals/watchers` (read then write; skipped when `full`).
  - `$cacheDir`: config key `cache_dir` if set, else `sys_get_temp_dir() . '/playmona-live'` (created if missing).

- [ ] **Step 1: Write the failing tests**

```php
test('live: only fresh public rooms are listed, busiest first', function () { /* 3 broadcasts: public fresh (2 watchers), public fresh (5), private fresh, public stale -> codes [B, A] */ });
test('live: a private room opens by its watch code but is never listed', function () { ... });
test('live: a stale broadcast is not live', function () { throwsHttp(404, fn () => $live->room('STALECDE', $now, false)); });
test('live: full when the room or the site is at its limit', function () { /* limits room 2 site 3: room with 2 watchers -> full, reason room; site total 3 -> reason site */ });
test('live: limits come from config/site/watch, defaults 20 and 50', function () { ... });
test('live: opening a watch view counts a watcher once, not when full', function () { ... });
test('live: no room code or photo of a hidden player leaks into the reply', function () { /* json_encode(reply) has no 6-char room code from watchRooms and no "photo:" for players whose broadcast avatar is a character */ });
test('live: the list is cached for ten seconds', function () { /* two list() calls 5 s apart -> one rtdb read set; 11 s apart -> two */ });
```

- [ ] **Step 2: Run** `php tools/api/test.php` — Expected: FAIL (class `Live` not found).
- [ ] **Step 3: Implement** `Live.php` and the two routes.
- [ ] **Step 4: Run** `php tools/api/test.php` — Expected: PASS (all old tests too).
- [ ] **Step 5: Commit** `git commit -m "feat(watch): /api/live lists public games and checks viewer limits"`

---

### Task 7: TV view model and rendering

**Files:**
- Create: `js/watch/view.js`, `js/watch/tv.js`, `css/watch.css`
- Test: `tools/test/watchView.test.js` (new)

**Interfaces:**
- Consumes: **Broadcast** (Task 4); `FF.Flags.render(null, { code })`, `FF.Avatars.img/url/fallback`, `FF.Icons`.
- Produces:
  - `FF.WatchView.model(broadcast, now)` → **ViewModel** `{ state: 'lobby'|'countdown'|'question'|'reveal'|'podium'|'ended', roomName, gameName, roundText ('Question 5 of 10' or 'Question 5' when total is null), countdownMs, screen, answer, leaderboard: [{ id, name, avatar, score, answered, correct, talking, rank }], podium: [{ id, name, avatar, score, place }] }`. `ended` when the broadcast is stale: `now - updatedAt > 45000` (`FF.Broadcast` is not loaded on the watch page, so `view.js` keeps its own `STALE_MS = 45000`). `now` is server-aligned time from the caller. `countdown` while `status === 'playing'` and `now < startAt`. `reveal` when `round.answer != null`. `podium` when `status === 'ended'` (top 3 of `results`). Leaderboard sorted by score desc, then name. In teams mode one entry per team (summed score, `answered` true when every member answered, `avatar` of the first member).
  - `FF.WatchTV.mount(container)` → `{ update(model), destroy() }`. Layout C: question card left (text, image, four answers with ▲ ◆ ● ■ and `--opt-a..d`, timer bar from `opensAt`), leaderboard right (tiles re-sort with a FLIP animation, green outline when answered, `--brand-cyan` glow when talking, points pop on reveal). Lobby view: room name, players, "Waiting for the host to pick a game" or "Starting <game>..." with the countdown. Podium at the end. CSS: landscape side by side; `@media (orientation: portrait), (max-width: 720px)` stacks question then leaderboard. Holds 12 tiles without shrinking (leaderboard column scrolls only beyond 12). Respects `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing tests**

```js
test('tv model: leaderboard sorted by score with ranks', ...);
test('tv model: the answer shows only in the reveal state', ...);        // round.answer null -> state 'question', answer null; 1 -> 'reveal'
test('tv model: countdown before startAt, podium after the game', ...);
test('tv model: a stale broadcast reads as ended', ...);                 // updatedAt now-46000 -> 'ended'
test('tv model: clock-only games say "Question 5" without a total', ...);
test('tv model: teams mode shows one tile per team with summed scores', ...);
test('tv render: twelve players fit and the four answers carry their shapes', ...); // mount on stub DOM, update(model with 12 players) -> 12 tiles; option labels start with ▲ ◆ ● ■
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `view.js` (pure), then `tv.js` and `css/watch.css` (tokens from `css/tokens.css`, both themes).
- [ ] **Step 4: Run** `node tools/test/run.js` and `node tools/contrast-check.js` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(watch): TV view with live leaderboard, layout C and phone stack"`

---

### Task 8: The watch page, list, routing and entry points

**Files:**
- Create: `watch.html`, `js/watch/list.js`, `js/watch/page.js`
- Modify: `.htaccess`, `tools/serve.js`, `index.html` (header and footer links)
- Test: `tools/test/watchPage.test.js` (new)

**Interfaces:**
- Consumes: `/api/live`, `/api/live/<wc>?open=1` (Task 6); `FF.WatchView` / `FF.WatchTV` (Task 7); `FF.Transport.open('', useDev)` (Task 3); `FF.Net.firebase` signs in anonymously when nobody is signed in (existing behaviour).
- Produces:
  - `watch.html`: standalone page like `terms.html` (own `<head>`, theme from storage, fonts, `css/tokens.css`, `css/styles.css` as needed, `css/watch.css`), `<base href="/">` so assets load at `/watch/<code>`; scripts: `core.js`, `storage.js`, `i18n.js`, `icons.js`, `avatars.js`, `assets.js`, `flagrenderer.js`, `net/firebase-config.js`, `net/firebaseTransport.js`, `net/transport.js`, `watch/view.js`, `watch/tv.js`, `watch/list.js`, `watch/page.js`. Header: PlayMona lockup linking home, and "Play" linking `/play`.
  - `FF.WatchPage.route(pathname)` → `{ view: 'list' } | { view: 'tv', code }` (`/watch`, `/watch/`, `/watch.html` → list; `/watch/<8 valid chars>` → tv; anything else → list).
  - `FF.WatchList.mount(container, { fetch })` → `{ destroy() }`. Polls `/api/live` every 10 s. Copy: title "Watch live", "Public rooms playing right now. Tap one to watch."; chips All, the categories present in the list, Most watched; cards as in the mockup (LIVE or IN LOBBY tag, "N watching", room name, game name and "Question X of Y" or "Picking the next game", player avatars, Watch button linking `/watch/<code>`); card art = category colour wash with the game icon; empty/last row "That's every public game right now. Start your own room and make it public to appear here." with a button to `/play`.
  - TV flow in `page.js`: GET `/api/live/<wc>?open=1` → 404: "This game isn't live right now." + the list; `full`: "This game is full right now." + the list; otherwise open the watch transport, set `watchers/<wc>/<uid>` = server time with `onDisconnectSet(..., null)`, watch `broadcasts/<wc>`. Broadcast becomes null → "The host stopped sharing this game." + link back to Watch live. Model `ended` → "This game has ended." + link. `now` for the model is the watch transport's `serverNow()`, not the device clock. Top bar shows "N watching" from `watchers/<wc>` and a "Stop watching" link to `/watch`. If the API is unreachable (local dev without PHP) skip the limit check and, in dev rooms mode, build the list from the dev bus doc at root `''` → `broadcasts` filtered by `public`.
  - `.htaccess`: before the generic rule, `RewriteRule ^watch/([A-Za-z0-9]{8})/?$ watch.html [L]` (the generic rule already maps `/watch`). `tools/serve.js`: serve `watch.html` for `/watch` and `/watch/<code>`, redirect `/watch.html` to `/watch`.
  - `index.html`: "Watch live" link in the header nav and footer, `href="watch"`.

- [ ] **Step 1: Write the failing tests**

```js
test('watch page: routes the list and watch links', function () {
  assertEqual(FF.WatchPage.route('/watch').view, 'list');
  assertEqual(FF.WatchPage.route('/watch/K7P2QXAB').code, 'K7P2QXAB');
  assertEqual(FF.WatchPage.route('/watch/K7P2').view, 'list');
  assertEqual(FF.WatchPage.route('/watch/K7P2QXA0').view, 'list', '0 is not in the alphabet');
});
test('watch page: a full room shows the full screen and never joins the viewers', async ...);   // fetch stub returns full:true -> text 'This game is full right now.'; bus has no watchers entry
test('watch page: a viewer adds and removes their entry', async ...);                         // open -> watchers/<wc>/<uid> set; destroy/close -> removed
test('watch page: the host stopping shows the stopped message', async ...);                    // delete broadcasts/<wc> on the bus -> 'The host stopped sharing this game.'
test('watch list: only cards from the API, with LIVE or IN LOBBY', ...);
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `watch.html`, `list.js`, `page.js`, the `.htaccess` and `serve.js` routes, and the landing links.
- [ ] **Step 4: Run** `node tools/test/run.js` — Expected: PASS.
- [ ] **Step 5: Check in the browser** (preview server, dev rooms on): tab 1 creates a room, makes it Public and starts World Flags; tab 2 joins; tab 3 opens `/watch`, sees the card, opens it, sees layout C update through a full game, the reveal, and the podium; resize tab 3 to 375×812 for the stacked view. Expected: no console errors (`read_console_messages`), screenshot of each state.
- [ ] **Step 6: Commit** `git commit -m "feat(watch): Watch live page, watch links and viewer presence"`

---

### Task 9: Admin portal

**Files:**
- Modify: `js/admin/pages.js` (`rooms`, `site`, overview `COUNTERS`), `js/admin/data.js`
- Test: `tools/test/admin.test.js` (add tests)

**Interfaces:**
- Consumes: room data under `rooms/<code>` (`meta.public`, `meta.watchCode`, `admin.delisted`), `watchers/<wc>` counts, `config/site/watch`.
- Produces:
  - Live rooms table gains columns **Public** ("Public" / "Private" / "Removed") and **Watching** (viewer count), and a **"Take off Watch live"** button on public rooms. Confirm text: "Take this room off Watch live? The host can't make it public again. Its watch link keeps working." It writes `rooms/<code>/admin/delisted = true` and `broadcasts/<wc>/public = false`. Page subtitle loses "(phase 3)".
  - `FF.AdminData.delistRoom(code, watchCode)` → `Promise`; `FF.AdminData.watcherCounts()` → `Promise<{ [wc]: number }>`.
  - Site page: "Viewer limits" section with two number fields, **"Viewers per room"** (1–1000, default 20) and **"Viewers across the site"** (1–100000, default 50), hint "Firebase's free plan allows 100 connections in total. Raise these after moving to the Blaze plan." Saves to `config/site/watch`.
  - Overview counters include `watchers` ("Watch views").

- [ ] **Step 1: Write the failing tests**

```js
test('admin: taking a room off Watch live sets delisted and switches public off', async ...);
test('admin: viewer limits save to config/site/watch with defaults 20 and 50', async ...);
test('admin: the overview lists watch views', ...);
```

- [ ] **Step 2: Run** `node tools/test/run.js` — Expected: FAIL.
- [ ] **Step 3: Implement** in `pages.js` / `data.js`.
- [ ] **Step 4: Run** `node tools/test/run.js` and `php tools/api/test.php` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(watch): admin controls for public rooms and viewer limits"`

---

### Task 10: Whole-feature check

- [ ] **Step 1: Run** `node tools/test/run.js`, `php tools/api/test.php`, `node tools/contrast-check.js` — Expected: all PASS.
- [ ] **Step 2: Browser pass** (dev rooms): every room game once with a viewer tab open; for each, the left side shows the question or the game card, ticks appear, scores move, the answer appears only after the round settles. Turn the hide-photo setting off and on mid-game; switch Private mid-game (card leaves the list, TV keeps working); turn Watching off (viewer sees the stopped message); close the host tab (another player takes over, TV continues); close every player tab (TV shows "This game has ended" within 45 s).
- [ ] **Step 3: Live checklist for Brighton** (written into the final report, not run by the agent; changes to the live server need his OK): rules publish on deploy (needs `FIREBASE_SERVICE_ACCOUNT`), `/watch/<code>` served through `.htaccess`, Cloudflare not caching `/api/live`, purge Cloudflare cache after deploy, a two-phone test with a third device watching.
