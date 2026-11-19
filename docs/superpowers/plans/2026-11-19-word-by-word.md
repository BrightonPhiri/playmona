# Word by Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second celebration game, Word by Word: all groups take strict turns adding one word each to one
message for the celebrant (open or blind), scoring a point per letter, ending on a reveal and a Wall message.

**Architecture:** A new template `wordByWord` on the existing celebrations game engine, built like Picture
Rush: shared rules (`FF.WordByWordRules`), a server referee (`FF.CelebrateReferees.wordByWord`) run by the
crew runner on the `celebrationRuns` path, phones that write only the inbox, PHP for settings, start,
controls and the result. Blind mode keeps the message off every guest-readable path.

**Tech Stack:** ES2017 classic scripts on `window.FF`, PHP 8 (`PlayMona` namespace, `Db`, `HttpError`),
MariaDB/SQLite, Firebase RTDB (rules in `database.rules.json`), node test harness (`tools/test/harness`),
PHP test runner (`tools/api/test.php`).

**Spec:** `docs/superpowers/specs/2026-11-19-word-by-word-design.md`

## Global Constraints

- Work in the scratchpad worktree on branch `feat/celebrations-word-by-word`; never git stash in the OneDrive checkout.
- Classic scripts, ES2017 or older, no DOM in rules/referee files; every string through `FF.t(key, English)`.
- Plain, short British English copy. Works at 360 px and in dark mode; TV at 720p and 1080p.
- RTDB is written only by the server/referee; phones write only `celebrations/<cid>/inbox/<uid>/<id>`.
- Blind mode: earlier words never on `celebrations/<cid>/run` or any path guests or the TV can read before the reveal.
- Picture Rush and WordFlow behaviour unchanged (their existing tests stay green).
- Settings (spec table): `mode` open|blind (open); `rounds` 1–10 (3); `minUnit` rounds|words (rounds);
  `minCount` 0–rounds or 0–100 (2, cut down to the game's size); `seconds` 10,15,20,30,45,60 (20);
  `opening` ≤ 60 chars (''); `names` ≤ 20 words each ≤ 24 chars ([]).
- Points: letters only (not `'` `-` or ending); bank words full; names full only if the celebrant's or in
  `names` (case-free, `'s` dropped), else 1; opening/skipped/struck 0.
- Wall message: `uid 'game:<runId>'`, name "From everyone", category `wish`, status by `approveMessages`,
  only with ≥ 2 added words; a missing end mark becomes `.`.
- Tests: `node tools/test/run.js` (3 known Windows CRLF failures: 2 Charades, 1 WordShift) and
  `php tools/api/test.php` (224/224 before this work). Single node file: `node tools/test/one.js <file>`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A word sent just as the turn times out (arrives after the deadline but before the referee's timer runs) → refused as late; the next team's turn isn't touched.
2. A guest moved to another team mid-game, or a team whose only member left → the referee follows `members` like Picture Rush; a team with nobody left is skipped at once.
3. The referee restarting mid-turn (runner restart on deploy) → it loads `celebrationState`, keeps the deadline, the words and the staff copy.
4. The MC striking the word that is the current last word in blind mode → `run.last` falls back to the previous remaining word (or the opening), never shows the struck word.
5. Words with odd input: `"Vicky's!"`, `"well-done"`, all-caps `"LOVE"`, a digit word `"40"` → all allowed; `"40"` (Vicky's age) is kept in the message and scores 0, since points count letters.

Each line has its test in the owning task (Tasks 1 and 2).

---

### Task 1: Shared rules

**Files:**
- Create: `js/celebrate/wordByWord/rules.js`
- Modify: `js/wordflow/rules.js` (parseWord options only)
- Test: `tools/test/celebrate.wordByWord.test.js` (new; rules part)

**Interfaces:**
- Produces `FF.WordByWordRules`:
  - `MODES = ['open','blind']`, `ROUNDS_MAX = 10`, `WORDS_MIN_MAX = 100`, `SECONDS = [10,15,20,30,45,60]`, `MAX_NAMES = 20`, `MAX_OPENING = 60`, `MAX_INPUT = 26`
  - `sanitize(raw) -> {mode, rounds, minUnit, minCount, seconds, opening, names}`
  - `letters(text) -> int` (letters only)
  - `known(names: string[], celebrant: string) -> object` (set of lower-case name keys, `'s` dropped; celebrant split on spaces)
  - `points(parsed: {text, name}, knownSet) -> int`
  - `parse(raw, {isWord, isQuiet, capital: bool}) -> {ok, text, name, ends, error}` (wraps WordFlow parseWord with `marks: '.,!'`, `maxWords: 0`; `name` = typed with a capital and not at a forced-capital spot)
  - `minReached(config, added: int, teams: int) -> bool` (rounds: `added >= minCount * teams`; words: `added >= minCount`)
  - `finalText(opening, words: [{w}]) -> string` (joins, adds `.` if last has no `.`/`!`)
  - `list(v)` (same as Picture Rush's)
- Modifies `FF.WordFlowRules.parseWord(raw, opts)`: new `opts.marks` (string of allowed endings, default `'.,'`) and `opts.maxWords` (default `MAX_WORDS`; `0` = no limit). Return gains `name: isName`.

- [ ] **Step 1: Write the failing tests** in `tools/test/celebrate.wordByWord.test.js` (loads `js/core.js`, `js/wordflow/rules.js`, `js/celebrate/wordByWord/rules.js`):
  - `word by word rules: settings keep to the offered values` — `sanitize({})` → `{mode:'open', rounds:3, minUnit:'rounds', minCount:2, seconds:20, opening:'', names:[]}`; `sanitize({mode:'x', rounds:50, seconds:7, minUnit:'words', minCount:500, opening:'Dear Vicky,'+'x'.repeat(80), names:['Vics', '', 'a b', 'x'.repeat(30), ...25 more]})` → mode open, rounds 10, seconds 20, minCount 100, opening length 60, names length ≤ 20 with no empty, no spaced, none over 24; `sanitize({rounds:3, minCount:5})` → minCount 3; strings `'15'` accepted as 15.
  - `word by word rules: letters and points` — `letters("Vicky's")===6`, `letters('well-done!')===8`, `letters('40')===0`; with `known(['Vics'], 'Vicky Banda')`: `points({text:'Vicky', name:true})===5`, `points({text:"Vicky's", name:true})===6`, `points({text:'Vics', name:true})===4`, `points({text:'Zzzzzzzzzz', name:true})===1`, `points({text:'love', name:false})===4`.
  - `word by word rules: parse allows ! and has no sentence limit` — `parse('amazing!').text==='amazing!'`, `parse('LOVE').text==='love'` (with `capital:false`), `parse('love',{capital:true}).text==='Love'` and `.name===false`, `parse('Harare').name===true`, `parse('two words').error==='spaces'`, `parse("Vicky's!").ok`, `parse('40').ok`; a rude word with `isQuiet: w => w==='rudeword'` → `error 'rude'`; an unknown lower-case word with `isWord: () => false` → `'unknown'`.
  - `wordflow rules: parseWord keeps its old endings and sentence limit` — `FF.WordFlowRules.parseWord('wow!').error==='punct'`; `parseWord('cat',{position:29}).error==='tooLong'`.
  - `word by word rules: minimum and final text` — `minReached({minUnit:'rounds',minCount:2}, 9, 5)===false`, `(…, 10, 5)===true`; `minReached({minUnit:'words',minCount:0}, 0, 3)===true`; `finalText('Dear Vicky,', [{w:'we'},{w:'love'},{w:'you'}])==='Dear Vicky, we love you.'`; ending `'you!'` stays.

- [ ] **Step 2: Run** `node tools/test/one.js tools/test/celebrate.wordByWord.test.js` — Expected: FAIL (`WordByWordRules` undefined).

- [ ] **Step 3: Implement** the `parseWord` options in `js/wordflow/rules.js` (no behaviour change when the options are absent) and `js/celebrate/wordByWord/rules.js`. `parse` passes `position: capital ? 0 : 1` so WordFlow's position-0 capitalising does the forced capital; `name` is the parser's `isName` except when the capital was forced.

- [ ] **Step 4: Run** the file again, then the WordFlow tests (`node tools/test/one.js tools/test/wordflow.rules.test.js` and `wordflow.referee.test.js`) — Expected: PASS both.

- [ ] **Step 5: Commit** `feat(wordByWord): shared rules, and parseWord endings and length options`

### Task 2: The referee, runner wiring and database rules

**Files:**
- Create: `js/celebrate/wordByWord/referee.js`
- Modify: `api/crew/lib/loader.js` (add the two files after Picture Rush's), `api/crew/runner.js` (`startCelebration` passes `isWord, isQuiet`), `js/celebrate/dev.js` (passes `isWord`/`isQuiet` from `FF.Words` when loaded and ready, else none), `database.rules.json` (inbox `word`/`end`/`turn`; `staff`, `staffers`)
- Test: `tools/test/celebrate.wordByWord.test.js` (referee part), `tools/test/celebrations.rules.test.js` (staff paths)

**Interfaces:**
- Consumes Task 1's `FF.WordByWordRules`.
- Produces `FF.CelebrateReferees.wordByWord = { create(opts), LOST_MS, REVEAL_MS_PER_WORD: 600 }`; `create` takes Picture Rush's opts plus `isWord`, `isQuiet`; `run` gains `celebrant` (string).
- Inbox command: `{type:'word', runId, n, t, word, end, turn}`.
- Control: `{runId, id, action: next|pause|resume|end|strike, index?}` — `next` skips the current turn; `strike` removes word `index` (0-based among added words).
- `run` view (guest-readable): `{runId, template:'wordByWord', name, instructions, mode, phase: starting|playing|reveal|ended, startAt, order:[tid], teams:{tid:{name,color,players}}, round, rounds, turn:{id, teamId, endsAt, leftMs?}, paused, minReached, count, opening, words?:[{w, teamId}] (open only), last?:{w, teamId} (blind only), totals:{tid:{points}}, said:{uid:{n, error?}}, result?:{why, rows, winners, words:[{w,teamId}], text}}`.
- `staff` view (blind only): `{runId, words:[{w, teamId, points}]}`; cleared to null at the end.
- Report: `report('celebration', {runId, cid, gameId, template:'wordByWord', why, rounds:[{round, teams:{tid:{points, usedMs}}}], ranked, message:{text, words}})`.

- [ ] **Step 1: Write the failing referee tests**, reusing Picture Rush's `makeBus`/`makeClock`/`game()` shape (copy the helpers into the new file; `FILES` adds `js/wordflow/rules.js` and the two new files; default run `config: {mode:'open', rounds:2, minUnit:'rounds', minCount:1, seconds:20}`, `celebrant:'Vicky Banda'`, teams Gold (g1,g2), Ruby (r1), Jade (no members); `isWord: w => w !== 'zzz'`, `isQuiet: w => w === 'rudeword'`):
  - `word by word referee: the order is shuffled from teams with members, and seeded` — after the countdown `view().order` has Gold and Ruby only, the same for the same seed; `view().turn.teamId === order[0]`.
  - `word by word referee: only the team on its turn can send, first word wins` — the other team's word → `said[r1].error==='notYourTurn'`, no word added; two teammates send for the same turn → one word added, the second gets `'late'`.
  - `word by word referee: a late word for a past turn is refused` — send with `turn: view().turn.id - 1` → `'late'`; a word arriving after `endsAt` (clock moved past, before the timer job ran) → `'late'` and the turn is skipped, not filled (Review Focus 1).
  - `word by word referee: a refused word keeps the turn` — `'rudeword'` → `error 'rude'`, same turn id still current; then `'love'` lands.
  - `word by word referee: time running out skips the turn and scores nothing` — advance 20 s → next team's turn; skipped team's `usedMs` includes 20000.
  - `word by word referee: points are letters, names by the known list` — `'Vicky'` 5, `'Zork'` (name) 1, `'love'` 4, `'40'` 0; totals match. After a word ending `.` the next word `'we'` is stored as `'We'` and is not a name (scores 2).
  - `word by word referee: ending early only after the minimum` — `end:true` before `minReached` → refused with `'tooSoon'`, nothing added, the turn kept; after → the word lands, phase `reveal`, then `ended`, one report, `message.text` ends with `.`.
  - `word by word referee: the game ends after the last round and reports once` — 2 rounds × 2 teams → 4 turns → ended; `reports.length===1`; `rounds` rows hold each team's points and `usedMs`; `ranked` by points.
  - `word by word referee: the MC strikes a word and its points go back` — strike index 0 → word gone from `words`, team points down; in blind mode striking the last word makes `last` the previous word (Review Focus 4).
  - `word by word referee: blind mode never shows earlier words` — mode blind: after 3 words `view()` has no `words`, `last` is the third, `count===3`; `bus.read('celebrations/'+CID).staff.words.length===3`; after the end `staff` is null and `result.words` has all 3.
  - `word by word referee: pause keeps the time left; next skips the turn` — pause with 12 s left, advance 60 s → same turn; resume → `endsAt` ≈ now + 12 s; control `next` → next team, 0 points.
  - `word by word referee: a replayed command lands once` — same `n` twice → one word.
  - `word by word referee: members follow moves and empty teams are skipped` — move r1 to Gold via `members`; Ruby's turn is skipped at once (Review Focus 2).
  - `word by word referee: a restarted referee carries on` — stop mid-turn, create a new referee with the same `saved` → same turn id, deadline, words and `staff` (Review Focus 3).
  - `word by word: the runner loads it; the inbox rule takes word, end and turn` — loader lists the two files; runner passes `isWord` to `startCelebration`'s create; inbox rule has `word` (string, ≤ 26), `end` (boolean), `turn` (number) validators.
  - In `celebrations.rules.test.js`: `staff` read needs `staffers/<auth.uid>`; `staffers/$uid` readable only by that uid; neither writable by clients.

- [ ] **Step 2: Run** `node tools/test/one.js tools/test/celebrate.wordByWord.test.js` — Expected: FAIL (referee undefined).

- [ ] **Step 3: Implement** `referee.js` following Picture Rush's structure (start/load/fresh, `watch('members'|'inbox'|'control')`, per-sender `n` with `LOST_MS`, `later()` write queue, `save()` to `store`, `publishAll`/partial `update('run', …)`, `finish` with one report and `onEnd`). Turn flow: `starting` until `startAt`, then `playing` turns; on the last word or end → `reveal` for `max(3000, count × 600)` ms, then `ended`. The capital for the next word: forced when it is the first added word with no opening, or the previous word (or the opening) ends in `.` or `!`. Strike: recompute totals from the remaining words. Then the loader, runner, dev.js and rules edits.

- [ ] **Step 4: Run** the file, `node tools/test/one.js tools/test/celebrations.rules.test.js` and `node tools/test/one.js tools/test/celebrate.pictureRush.test.js` — Expected: PASS all.

- [ ] **Step 5: Commit** `feat(wordByWord): the referee, runner wiring and database rules`

### Task 3: The server (settings, start, strike, staff, the Wall message)

**Files:**
- Modify: `api/lib/CelebrationGames.php`, `api/lib/CelebrationWall.php`, `api/lib/CelebrationStage.php`, `api/lib/CelebrationRoutes.php` (control routes pass `index`)
- Test: `tools/api/celebrationGames.test.php`, and the settings-match test in `tools/test/celebrate.wordByWord.test.js`

**Interfaces:**
- `CelebrationGames::TEMPLATES = ['pictureRush', 'wordByWord']`; `public const WORD_BY_WORD = ['mode' => ['open', 'blind'], 'seconds' => [10, 15, 20, 30, 45, 60], 'minUnit' => ['rounds', 'words']]` (the JS test checks these strings appear in the PHP file).
- `sanitize('wordByWord', $raw, $cid)` returns the same shape as `FF.WordByWordRules.sanitize`.
- `create()` instructions per template: Word by Word → `"Write a message to {celebrant} together, one word per turn. Every letter is a point."` with the event's celebrant name (or "the celebrant").
- `ready()` needs nothing for Word by Word. `startAs` adds the photo urls only for Picture Rush, adds `'celebrant' => celebrant_name` to the run, and sets `'staffers/' . $actor => true`.
- `ACTIONS` gains `'strike'`; `control($cid, $user, $action, $now, ?int $index = null)` and `controlAs($ev, $actor, $action, $now, ?int $index = null)`: `strike` needs a Word by Word run and `0 ≤ index ≤ 1000` (400 `bad-index` otherwise), puts `index` in the control, audits `game.strike` with `['runId', 'index']`.
- `live()` and `CelebrationStage::panel()` also set `celebrations/<cid>/staffers/<uid>`; `screen()` does not.
- `CelebrationWall::fromGame(string $cid, string $runId, string $text, int $added): ?string` — inserts the Wall message (spec values, body cut to `MAX_BODY`) and returns its id; returns null and inserts nothing when `$added < 2` (`$added` = `count(message.words)` from the report).
- `recordResult`: for a `wordByWord` run with `message.text`, calls `fromGame` inside the same "once only" path (after the transaction succeeds).

- [ ] **Step 1: Write the failing PHP tests** in `tools/api/celebrationGames.test.php`:
  - `word by word: the organiser adds one, settings are cleaned, it publishes with no content` — POST template `wordByWord` → 200, config equals the defaults; save with `{mode:'blind', rounds:99, seconds:7}` → blind, 10, 20; publish → `published`; instructions mention the celebrant's name.
  - `word by word: starting sends the celebrant and makes the organiser staff` — the fake RTDB has `celebrationRuns/<runId>.celebrant` and `celebrations/<cid>/staffers/<owner uid> === true`.
  - `word by word: the MC strikes a word` — POST `/play/control` `{action:'strike', index:2}` → control has `index 2`, audit row `game.strike`; `index:-1` → 400 `bad-index`; strike during a Picture Rush run → 400 `bad-action`.
  - `word by word: the finished message goes to the Wall once` — report `celebration` with `message.text 'Dear Vicky, we love you.'` → one `celebration_messages` row, name `From everyone`, uid `game:<runId>`, status `pending` with `approveMessages` on (and `approved` with it off); the same report again → still one row; leaderboard points equal the reported points.
  - `word by word: a one-word message is not kept` — `message.text 'Love.'` → no row.
  - JS side (in the node test file): `word by word: the server offers the same settings` — PHP source contains `'mode' => ['open', 'blind']` and `'seconds' => [10, 15, 20, 30, 45, 60]`.

- [ ] **Step 2: Run** `php tools/api/test.php` — Expected: the new tests FAIL, the rest pass.

- [ ] **Step 3: Implement** the PHP changes above.

- [ ] **Step 4: Run** `php tools/api/test.php` and `node tools/test/one.js tools/test/celebrate.wordByWord.test.js` — Expected: all PASS (224 + new).

- [ ] **Step 5: Commit** `feat(wordByWord): the server side — settings, start, strike, staff and the Wall message`

### Task 4: The organiser's editor and the live panel (organiser + MC)

**Files:**
- Modify: `js/celebrate/games.js` (template choice when adding, Word by Word fields, list meta), `js/celebrate/livePanel.js` (Word by Word view, Strike, staff watch, `loadDev` files), `js/celebrate/mc.js` only if it passes `control` without the extra argument, `play.html` (load `js/wordflow/rules.js`, `js/celebrate/wordByWord/rules.js`), `css/celebrate.css`
- Test: browser check (local dev), plus `node tools/test/run.js` stays green

**Interfaces:**
- Consumes `FF.WordByWordRules` (settings lists), the `run` and `staff` views and the `strike` control from Tasks 2–3.
- `TEMPLATES` in games.js gains `{ id: 'wordByWord', icon: 'chat-text' (or the nearest icon `FF.Icons` has), name: ['celWbwName', 'Word by Word'], text: ['celWbwText', 'All the groups write one message to the celebrant together, one word per turn. Every letter is a point.'] }`. "Add a game" asks which template (sheet listing `TEMPLATES`) when there is more than one.
- Editor fields (existing controls): Version (segmented Open / Blind, with one line each: "Everyone sees the message grow." / "Each group sees only the last word. The whole message is revealed at the end."), Turns per group (1–10), Turn timer (seconds list), "Groups can end the message after" (number + Rounds/Words), Opening words (text, 60), Names that score in full (comma-separated, shown as chips; hint "{celebrant} is always included.").
- Live panel for Word by Word: status line (`'{team}'s turn · round {n} of {total}'`), Next labelled "Skip turn", the message (open: from `run.words`; blind: from `staff.words`, watched at `staff`) as a list of word chips with a Strike button each (confirm "Strike "{word}"? It leaves the message and its points go back."), team totals. `opts.control(action, extra)` sends `{action, index}`.
- `loadDev()` loads the referee files for both templates plus `js/wordflow/rules.js` if missing.

- [ ] **Step 1: Implement** the editor and live panel changes and the CSS (`.cel-wbw*`).
- [ ] **Step 2: Browser check** (launch configs `playmona-celebrations-9511` + `-api-9512`, devRooms + devAuth, device-only account): add Word by Word, change every setting, save, reload → settings kept; list meta shows "Word by Word · Blind · 3 turns each"; phone width 360 and dark mode look right. Expected: no console errors.
- [ ] **Step 3: Run** `node tools/test/run.js` — Expected: only the 3 known CRLF failures.
- [ ] **Step 4: Commit** `feat(wordByWord): the organiser's editor and the live panel`

### Task 5: The phone

**Files:**
- Create: `js/celebrate/wordByWord/play.js`
- Modify: `event.html` (scripts: `js/wordflow/rules.js`, `js/celebrate/wordByWord/rules.js`, `js/celebrate/wordByWord/play.js`), `js/celebrate/event.js` (`PLAYERS.wordByWord`, lineup facts label "Word by Word"), `css/celebrate.css`
- Test: browser check with two guest tabs

**Interfaces:**
- `FF.WordByWordPlay.mount(host, { transport, uid, onClose }) -> { view(), destroy() }` (same as `FF.PictureRushPlay`).
- Sends `{type:'word', runId, n, t: transport's server time marker as Picture Rush does, word, end, turn}` to `inbox/<uid>/<cmdId()>`; counts `n` per phone like Picture Rush's play.js.
- Refused reasons shown from `run.said[uid].error`: `rude` "Let's keep it kind. Try another word.", `unknown` "We don't know that word. Check the spelling, or use a capital for a name.", `spaces` "Just one word, please.", `long` "That word is too long.", `punct`/`letters` "Letters only, with . , or ! at the end.", `late` "Too late, the turn has moved on.", `notYourTurn` "Wait for your group's turn.", `tooSoon` "You can end the message after {n} more words." (n from the minimum).

- [ ] **Step 1: Implement** the phone screens from the spec (my turn: "Your turn", countdown, message or last word, word box + Send, the end tick box when `minReached`; waiting: "Waiting for {team}", countdown, order with my group marked, my points, message or "{n} words so far"; reveal: word by word, faster than the TV (300 ms), then the results; ended: "Your message is on the Wall of Love" + Close).
- [ ] **Step 2: Browser check:** two guest tabs (separate `playmona:devApiUid`) on two teams; the off-turn tab has no word box; a word lands on both; a rude word shows the kind reason and keeps the turn; waiting out the timer skips; end tick appears only after the minimum; blind shows only the last word; 360 px + dark.
- [ ] **Step 3: Run** `node tools/test/run.js` — Expected: only the 3 known CRLF failures.
- [ ] **Step 4: Commit** `feat(wordByWord): playing on the phone`

### Task 6: The TV

**Files:**
- Modify: `js/celebrate/tv.js` (`game()` routes `wordByWord` to a new `wordByWord(v)` scene; `dataKey` includes the word count and turn id so it doesn't re-fade on every update), `css/celebrate.css` (`.tv-wbw*`)
- Test: browser check on the TV link

**Interfaces:**
- Consumes the `run` view only (never `staff`).

- [ ] **Step 1: Implement:** playing (open: the message large and centred, the newest word animating in, each word in its team colour; blind: the last word big and "{n} words so far"); a strip with the turn order, whose turn it is and the countdown; reveal: words appear one by one every 600 ms in team colours, then the results table (this game's points per team); the corner QR rule stays as today (shown, since there are no panels).
- [ ] **Step 2: Browser check** at 1280×720 and 1920×1080: open and blind, a long message (40 words) still fits (font steps down), reveal timing, no fade on each new word.
- [ ] **Step 3: Commit** `feat(wordByWord): the TV`

### Task 7: The whole flow and notes

**Files:**
- Modify: memory `playmona-celebrations.md` (outside the repo), nothing else unless the check finds a bug.

- [ ] **Step 1: Full local run:** organiser makes an open game and a blind game; MC tab, TV tab, two guest tabs; play each to the end (one by the last round, one by a group ending early); MC strikes a word; the message shows on the Wall (pending, then approved) and in the memory book; leaderboard moves.
- [ ] **Step 2: Run** `node tools/test/run.js` and `php tools/api/test.php` — Expected: only the 3 known node failures; PHP all pass.
- [ ] **Step 3: Commit** any fixes; push the branch and open the PR (body ends with the Claude Code line).
