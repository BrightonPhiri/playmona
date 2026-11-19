# Celebrations: Word by Word

Agreed with Brighton on 2026-11-19 ("Keepsake + points", "Rounds per group", "Known names score",
"Yes, write it up"). Milestone B, the first game after Picture Rush.

## Why

Brighton's brief: "the message which all groups should create word by word", in two versions, "one where
players can see the whole message (previous words) typed and a second where groups see only the last word
entered by the previous group", and "groups/players do not type at the same time, they only type during
their turn". The point is a keepsake: one message from the whole party to the celebrant, which ends up on
the Wall of Love and in the memory book. Points make it a game at the party ("each letter is a point, group
with more or bigger words gets more points").

Success: at a party of ~5 groups (often one phone per group), the MC starts the game, groups take turns
without anyone typing over anyone, the TV shows the message grow (or stay hidden, then a reveal), the
leaderboard moves, and the finished message is on the Wall afterwards.

## Goals

1. **One shared message, word by word.** All groups take turns in a fixed order, one word per turn.
2. **Two versions** (the organiser picks per game):
   - **Open:** everyone sees the whole message as it grows (phones and TV).
   - **Blind:** a group on its turn sees only the last word. Nobody else sees the message (TV shows the word
     count). The whole message is revealed at the end.
3. **Strict turns.** Only the group whose turn it is can send a word, and the server decides that. A group
   that runs out of time is skipped and scores nothing for that turn.
4. **Length = rounds per group** (Brighton). The organiser picks how many turns each group gets.
5. **Any group can end the message** (Brighton) once a minimum the organiser sets has been reached: on its
   turn it ticks "End the message here" and its word becomes the last word. The MC can always end it.
6. **Points: 1 per letter** (Brighton). Bigger words score more. Points go on the event leaderboard like
   Picture Rush points.
7. **Known names score** (Brighton): the celebrant's name and the organiser's own words (nicknames, places)
   score full letters. Other names (capitalised words not in the word bank) are allowed but score 1 point.
8. **The message is kept:** it goes to the Wall of Love and from there into the memory book.

## Non-goals

- A judged "Message Battle" (each group writes its own message, then votes). Brighton chose the shared
  keepsake; the battle is a different game and is not built here.
- Golden-word bonuses, voice, emoji, pictures in the message.
- Changing Picture Rush or WordFlow behaviour.

## Anti-goals (a failure even if it "works")

- **Blind leaking:** in blind mode no guest phone and no TV may be able to read earlier words before the
  reveal, including by reading the database directly. The full message never goes to a path guests can read.
- **Typing over each other:** two words landing for one turn, or a word from the wrong group being accepted.
- **Cheap points:** long made-up words scoring big (names rule above, word bank check below).
- **A rude word on the TV or the Wall.**
- Breaking existing games, events, scores or the Wall.

## Constraints

- Same stack and patterns as Picture Rush (`api/lib/CelebrationGames.php`, `js/celebrate/pictureRush/*`):
  ES2017 classic scripts on `window.FF`, PHP `PlayMona` namespace, MariaDB + SQLite migrations,
  Firebase RTDB written only by the server/referee, phones write only `celebrations/<cid>/inbox`.
- Firebase Spark: no new always-on connections. Phones connect only while a game is on (as today).
- Copy is plain, short British English; every string through `FF.t` with an English fallback.
- Works at 360 px phone width and in dark mode; TV at 720p and 1080p.
- Events, teams, the Wall and the leaderboard made before this change keep working.

## Approaches

1. **A second template on the celebrations game engine (chosen).** `wordByWord` sits next to
   `pictureRush`: the organiser's Games tab, publish/start, the MC and organiser controls, the crew runner
   (`celebrationRuns` path, `FF.CelebrateReferees[template]`), inbox commands with per-sender `n`, result
   report, leaderboard and TV/MC links are all reused. New: rules, referee, phone screen, TV and MC views.
2. **WordFlow's own room game.** Already one word per turn, but rooms cap at 12 devices, know nothing of
   celebration teams, scores or the Wall. Ruled out.
3. **Turns run by the PHP API alone.** Words arrive rarely enough, but no running process would skip a group
   whose time is up, and the word bank exists only in JavaScript. Ruled out.

## Design

### Template id and settings

Template id **`wordByWord`** (added to `CelebrationGames::TEMPLATES`). Settings live in
`js/celebrate/wordByWord/rules.js` (`FF.WordByWordRules.sanitize`) and are mirrored in PHP `sanitize`
(tests check the two lists match, as for Picture Rush). Anything unknown goes back to the standard.

| Setting | Values | Standard |
|---|---|---|
| `mode` | `open`, `blind` | `open` |
| `rounds` (turns per group) | 1–10 | 3 |
| `minUnit` | `rounds`, `words` | `rounds` |
| `minCount` (end allowed after) | rounds: 0–`rounds`; words: 0–100 | 2 rounds |
| `seconds` (turn timer) | 10, 15, 20, 30, 45, 60 | 20 |
| `opening` (opening words, not scored) | text, up to 60 characters, may be empty | empty |
| `names` (organiser's own words that score full letters) | up to 20 words, each up to 24 characters | empty |

The celebrant's name (`celebrations.celebrant_name`, each word of it) is always a known name; the organiser
doesn't type it again. The default instructions text: "Write a message to {celebrant} together, one word
per turn. Every letter is a point." A game needs no content to be published (unlike Picture Rush's photos).

### Turns

- At the start the referee shuffles the teams that have at least one member (with `randomInt`) into the
  turn order, and every screen shows that order. A team with no members is not in the order. A team made
  after the start does not join this game.
- If no team has a member, the game can't start ("Nobody is in a team yet."). One team alone is fine: it writes the
  message by itself. Guests without a team watch, as in Picture Rush.
- `minCount` larger than the game allows is cut down to it (e.g. 5 rounds when `rounds` is 3 becomes 3).
- A turn has an id (`turn`, counting from 0), a team and a deadline (server time + `seconds`).
- **Any member of the team on its turn can send the word**; the first valid word wins the turn.
- When the deadline passes with no valid word, the turn is skipped (0 points) and play moves on.
- The game ends after the last turn of the last round, when a group ends it early, or when the MC ends it.
- Pause freezes the time left; resume gives it back. The MC/organiser **Next** action (existing control)
  skips the current group's turn, for a group that has walked away.

### Words

Reuse `FF.WordFlowRules.parseWord` (one word, letters with inner `'` or `-`, the word bank check through
`isWord`, the rude check through `isQuiet`, a capital means a name). Two changes, behind new options so
WordFlow is unchanged:

- `marks`: the endings allowed. Word by Word allows `.` `,` `!` (WordFlow stays `.` `,`).
- `maxWords`: off for Word by Word (WordFlow's 30-word sentence limit doesn't apply).

The word after the opening, a `.` or a `!` gets a capital first letter (as WordFlow does at position 0).
A refused word (`rude`, `unknown`, `spaces`, `long`, `punct`, `letters`, `empty`) does **not** use up the
turn: the group sees why and can try again while time is left. Refused words are not stored.

### Points

- A word scores its letters (not `'`, `-` or the ending): "Vicky's" = 6, "well-done!" = 8.
- A word from the word bank scores full letters. A capitalised name scores full letters only if it is the
  celebrant's name or in the organiser's `names` (compared without case and without `'s`). Any other name
  scores 1 point.
- Opening words, skipped turns and struck words score 0.
- Ties on the event leaderboard already break on less time: each team's `usedMs` is the time it took on its
  turns (a skipped turn counts its full time).

### Ending early

On its turn, once the minimum is reached (`minUnit`/`minCount` counted from words actually added, opening
words not counted), a group sees a tick box **"End the message here"**. Sending a word with it ticked makes
that word the last one and ends the game. Before the minimum the box isn't shown and the referee refuses an
`end` flag. If the last word has no `.` or `!`, the kept message gets a `.`.

### MC: strike a word

The MC panel and the organiser's live panel show the whole message (in both versions) with a **Strike**
button on each word. A struck word leaves the message and its points go back to 0; the turn is not replayed.
This needs a new control action `strike` carrying the word's index (`CelebrationGames::ACTIONS` gains
`strike`; the control payload gains `index`). Audited as `game.strike` with the word and the team.

### Live data and blind privacy

- `celebrations/<cid>/run` (guests can read it) carries: mode, turn order, current turn
  (`turn`, team, deadline or paused time left), rounds done, minimum reached, per-team points, and **in open
  mode** the words with their team; **in blind mode only the last word and the word count**.
- In blind mode the referee writes the full message to a new path `celebrations/<cid>/staff`
  (`{runId, words}`), which only "staff" can read: a new `celebrations/<cid>/staffers/<uid>` list that PHP
  fills for the MC (`CelebrationStage::panel`) and the owner (`CelebrationGames::live`), never for the TV
  (`screen`) or guests. Rules: `staff` readable when `staffers/<auth.uid>` exists; `staffers/$uid` readable
  by that uid only (like `viewers`). In open mode `staff` stays empty. The TV and phones get the whole
  blind message only at the reveal (the end result in `run`). The referee clears `staff` when the run ends.
- Per-sender command counts (`n`) dedupe replays, as Picture Rush does.

### Phone commands (inbox)

`word {word, end, turn}` with the usual `type`, `runId`, `n`, `t`. The referee accepts it only if the
sender's team is the current team, `turn` is the current turn (a late word for a past turn is refused) and
the word parses. `database.rules.json` (and the dev rules mirror, if there is one) gains `word` (string, up
to `MAX_INPUT` 26 characters), `end` (boolean) and `turn` (number 0–1000) on the inbox item.

### Screens

- **Phone, my turn:** big "Your turn", the countdown, the message so far (open) or just the last word
  (blind), a word box with Send, and after the minimum the "End the message here" tick box. A refused
  word shows a short reason under the box.
- **Phone, waiting:** "Waiting for {team}", the countdown, the turn order with my group marked, my group's
  points, and the message (open) or "{n} words so far" (blind).
- **TV during play:** the message large in the middle with each new word animating in, coloured by its
  team (open); blind shows the last word big and "{n} words so far". Around it: whose turn it is, the
  countdown and the turn order. The corner QR stays as today.
- **The reveal (both versions, TV and phones):** the whole message appears word by word (about 0.6 s a word,
  each in its team's colour), then the results table (points per team for this game). Phones show the
  same reveal, faster.
- **MC panel / organiser live panel:** current turn, Skip turn (Next), Pause/Resume, End, and the message
  with Strike buttons.
- **Organiser's game editor:** choosing the template when adding a game (Picture Rush or Word by Word),
  then the settings above as the existing editor controls (segmented choices, switch rows, text fields).

### Keeping the message

When the result is recorded (`CelebrationGames::recordResult`, already once only per run), a Word by Word
result with at least 2 added words saves the message to the Wall through a new `CelebrationWall` method:
`uid = 'game:<runId>'`, name "From everyone" (Brighton, 2026-11-19), category `wish`, status `pending` or `approved` by the
event's existing `approveMessages` setting, opening words included. The memory book shows approved Wall
messages already, so nothing more is needed there. Running the game again makes a new message.

### Tests

- **Rules (node):** settings sanitize both ways; PHP and JS settings lists match; `parseWord` with
  `marks`/`maxWords` and WordFlow's behaviour unchanged; letter counting; names rule.
- **Referee (node, fake clock + dev transport):** turn order shuffled, teams without members left out; a
  wrong team's word refused; a late word for a past turn refused; two words for one turn → first wins;
  timeout skips; refused word keeps the turn; end flag before/after the minimum (rounds and words); MC
  strike takes points back; pause/resume keeps time left; Next skips; replays land once; blind run state
  never holds earlier words; final report rows and message text.
- **PHP:** template accepted and sanitized; publish without content; `strike` control audited; result saves
  one Wall message (pending/approved by setting), none for under 2 words, and the leaderboard gets the points.
- **Browser (local dev):** organiser makes both versions; two guest tabs on two teams take turns; wrong-turn
  phone can't send; timeout skip; end early; blind shows only the last word on phones/TV; reveal on TV; MC
  strike; message on the Wall; phone width and dark mode.

## Left to the builder

- Exact file split inside `js/celebrate/wordByWord/` (follow Picture Rush: rules, referee, play, a TV view).
- How the TV word animation looks, within the tokens and the existing TV styles.
- How the editor shows the template choice (a sheet or a segmented control), following the Games tab.
- Wiring: crew `lib/loader.js` and the dev loader (`js/celebrate/dev.js`) list the new files; the event
  page and TV/MC pages load them.
- Exact copy for the refused-word reasons (reuse WordFlow's where they fit).
