# Celebrations: Quiz (first kind: Who Knows {name} Best?)

Agreed with Brighton on 2026-11-21 ("Who Knows first", "Organiser, in advance", "One shared pick",
"No, flat points", "Just the answer", "Yes, suggestions", "One Quiz, kinds later"). Milestone B step 2,
the quiz family from the Celebrations plan, after Picture Rush and Word by Word.

## Why

The Celebrations plan lists a quiz family: Birthday Trivia, Who Knows the Celebrant Best and Who Said It?.
Brighton chose **Who Knows the Celebrant Best** first: it is the most personal, and Celebrations is about
the person. The questions themselves tell the room stories about them ("What was Vicky's first job?").

Success: before the party the organiser writes about ten questions in a few minutes, mostly by tapping
ready-made ones and typing the answers. On the night the MC starts the game, every team argues over its
answer on its phones, the answer is revealed on every phone and the TV, the leaderboard moves, and the game
runs by itself from start to finish.

## Goals

1. **The organiser writes the questions in advance** (Brighton). Each question has its text, the right
   answer and 1–3 wrong answers (2–4 choices in all). The game runs by itself on the night.
2. **Ready-made questions** (Brighton). The editor offers a list of about 30 good questions about a person,
   with the celebrant's name filled in. The organiser taps the ones they want, then types the answers. They
   can also write their own and reorder or remove any.
3. **One shared pick per team** (Brighton). Any member's tap sets the team's answer, which lights up on every
   phone in that team with who picked it. Anyone on the team can change it until the time runs out. The
   pick that stands then is the team's answer.
4. **"We're sure."** A team can lock its pick in. Once every playing team is sure, the answer is revealed
   straight away instead of waiting for the clock.
5. **Flat points** (Brighton). Every right answer scores the same points (organiser setting). No speed
   bonus, no points off for wrong answers. Points go on the event leaderboard like the other games'.
6. **The reveal shows just the answer** (Brighton): the right answer, which teams got it and the points.
   No story line, no photo.
7. **One Quiz game with kinds** (Brighton). The template is `quiz`, and each quiz has a `kind`. This build
   has one kind, `whoKnows`. Birthday Trivia (questions from the site's trivia bank) and Who Said It? come
   later as new kinds on the same template, so the timer, shared pick, reveal and scoring are written once.

## Non-goals

- Birthday Trivia and Who Said It? themselves (later kinds). This build only has to leave room for them:
  the `kind` field, and the ready-made list and editor chosen by kind.
- A story line or a photo on the reveal (Brighton said no).
- Typed answers, speed bonuses, a celebrant-reveals-it-live mode.
- Changing Picture Rush, Word by Word or the site's own quiz games.

## Anti-goals (a failure even if it "works")

- **The answer leaking:** no guest phone and no TV may be able to read which choice is right before the
  reveal, including by reading the database directly. The right answer reaches `celebrations/<cid>/run`
  only in the reveal.
- **The fastest finger deciding for the team:** a tap that can't be changed, or one member's pick not
  showing on the team's other phones.
- **Copying from the TV:** the TV never shows a team's pick before the reveal, only "thinking…" or "sure".
- **A page of typing:** an organiser facing a blank form with nothing to start from.
- Breaking existing games, events, scores or the Wall.

## Constraints

- Same stack and patterns as Picture Rush and Word by Word: ES2017 classic scripts on `window.FF`, PHP
  `PlayMona` namespace, MariaDB + SQLite migrations, RTDB written only by the server or referee, phones
  write only to `celebrations/<cid>/inbox`. Game config reaches the referee through `celebrationRuns/<runId>`
  (server-only), as today.
- Firebase Spark: no new always-on connections. Phones connect only while a game is on (as today).
- Copy is plain, short British English. Every string goes through `FF.t` with an English fallback.
- Works at 360 px phone width and in dark mode. The TV works at 720p and 1080p.
- Events, teams, games and scores made before this change keep working.
- The "No big screen" design (a separate session, branch `claude/no-big-screen-design-2`) will change
  `tv.js` and the event page's takeovers. Keep the quiz's TV scene inside its own function, as Word by Word
  does, so the two changes merge cleanly.

## Timing: ready for Saturday

Brighton (2026-11-21): the quiz must be playable at Vicky's party on **Sat 22 Nov 2026, 2–6 pm**. Today is
the rehearsal day. So this build is a slice that can ship today, not the full polish:

- **In:** rules and settings (JS and PHP), the ready-made ideas, the referee, the phone screen, the TV scene
  (plain, no animation), the editor, the MC and organiser panel (picks, right answer, controls), the inbox
  fields in `database.rules.json`, wiring. Tests: the referee tests that guard the anti-goals (the right
  answer never in `run` before the reveal, pick and sure rules, time-up, all-sure reveal, Next, pause), the
  PHP sanitize/publish tests, the database rules test for the new inbox fields, and one local two-tab run
  (two phones on one team, one on another, the TV and the MC panel).
- **Left for after the party:** reveal animations, extra sounds, the full browser matrix (every screen at
  phone width and in dark mode beyond a quick look), and merging with the No big screen branch.
- **Ship:** one PR. Merge only with Brighton's OK (a push to main deploys and restarts the crew). Then run
  one real quiz on playmona.com with real phones as part of the rehearsal.
- **Freeze:** no push to main from 1 pm on 22 Nov until the event has ended, because a deploy restarts the
  crew and would cut off a game in play. If the quiz misbehaves on the night, the organiser simply doesn't
  start it (or switches it off on the Games tab); the other games are unaffected.
- **Nothing else changes:** Picture Rush, Word by Word, the Wall, the TV's other screens and the leaderboard
  must behave exactly as they did at the rehearsal.

## Approaches

1. **One `quiz` template with kinds (chosen by Brighton).** A third template on the Celebrations game engine
   next to `pictureRush` and `wordByWord`: the Games tab, publish and start, the MC and organiser controls,
   the crew runner (`celebrationRuns`, `FF.CelebrateReferees[template]`), inbox commands with per-sender
   `n`, the result report, the leaderboard and the TV and MC links are all reused. New: rules, referee,
   phone screen, TV scene, editor. A `kind` field picks the ready-made list and the editor's wording, so
   later quizzes are new kinds, not new games.
2. **A `whoKnows` template with no kinds.** Slightly simpler today. Birthday Trivia would then need either a
   copy of the whole game (two referees, two phone screens) or a rework into approach 1. Not chosen.
3. **Reusing the site's quiz games (Quiz Mix and others).** These are built for rooms of individual players
   with their own scoring. They know nothing of Celebrations teams, the shared pick or the event
   leaderboard. Ruled out.

## Design

### Template, kind and settings

Template id **`quiz`** (added to `CelebrationGames::TEMPLATES` and `NAMES`, "Quiz"). Settings live in
`js/celebrate/quiz/rules.js` (`FF.QuizRules.sanitize`) and are mirrored in PHP `sanitize`. Tests check that
the two lists match, as for the other games. Anything unknown goes back to the standard value.

| Setting | Values | Standard |
|---|---|---|
| `kind` | `whoKnows` (later: `trivia`, `whoSaid`) | `whoKnows` |
| `seconds` (per question) | 10, 15, 20, 30, 45, 60 | 20 |
| `points` (per right answer) | 100–5000, steps of 100 | 500 |
| `questions` | 1–30 items | empty |

Each question: `{ id, text, right, wrong: [1–3 strings] }`. `text` is up to 140 characters, and each answer
up to 60. Answers are trimmed. Empty wrong answers are dropped. Two choices that are the same, ignoring case
and spaces, are refused when saving ("Two answers are the same."). `id` is a short random id made by the
editor, kept so reordering doesn't confuse anything.

Publishing needs at least one complete question: text, a right answer and at least one wrong answer
(`ready()`: "Add at least one question with its answers."). A draft may hold incomplete questions. The
editor marks each incomplete one, and start skips them.

New quiz names: "Who Knows {celebrant} Best?". Standard instructions (`instructionsFor`): "Pick your team's
answer together. Anyone in the team can change it until the time runs out. {celebrant}, sit this one out:
you know them all!" The site can't tell which guest is the celebrant, so nothing enforces this.

### Ready-made questions

`js/celebrate/quiz/questions.js` (`FF.QuizQuestions.forKind('whoKnows')`) is a list of about 30 questions
with `{name}` in them, for example: first job, favourite food, the dish they always order, their first
holiday abroad, what they wanted to be as a child, their first car, a hidden talent, the song they can't
help singing to, where they'd live if they could live anywhere, what they're like before their morning
coffee. Each is translated with `FF.t`. They are written to suit both birthdays and graduations. None needs
the celebrant to be a particular age or gender ("they", or the name again).

In the editor, **Add from ideas** opens a sheet listing the ideas with `{name}` filled in. Ticking several
adds them to the end as questions with empty answers. Ideas already in the quiz are shown as added.
**Write my own** adds an empty question.

### One question, step by step (referee phases)

`starting` (the existing start countdown) → for each question: `question` → `reveal` → … → `ended`.

- **At the start** the referee drops incomplete questions and shuffles each question's choices once, with
  `randomInt`. Every phone and the TV see the same order, so the MC can say "B". The right choice's index
  is kept only in the referee's state, never in `run`.
- **`question`:** the deadline is server time + `seconds`. Teams pick and lock in (below). It ends when the
  deadline passes, when every playing team is sure, or on MC **Next**.
- **`reveal`:** `run` gets the right choice's index, each team's final pick and whether it was right, and
  the points given. The reveal lasts 6 s (my call), then the next question. The last question's reveal
  goes to `ended`.
- **`ended`:** the result table (points per team for this quiz). The report rows go to `recordResult` as
  for the other games.
- **Pause** freezes the time left and **Resume** gives it back. **Next** during `question` reveals now.
  **Next** during `reveal` moves on now. **End** finishes with the points so far.
- **Playing teams** are teams with at least one member, as in the other games. A guest who joins a team
  mid-game plays from the next tap (the referee watches `members`, as Picture Rush does). Guests with no
  team watch.

### The shared pick and "We're sure"

- Inbox commands: `pick { q, choice }` and `sure { q }`, with the usual `type`, `runId`, `n`, `t`. `q` is
  the question's place in the run (0–29) and `choice` the choice's place in the shuffled order (0–3).
  `database.rules.json` gains `q` (number 0–100) and `choice` (number 0–3) on the inbox item. `type`
  already allows short lowercase words.
- The referee accepts a `pick` only in `question`, for the current `q`, from a member of a playing team,
  and only if that team isn't sure yet. It sets the team's pick to `{ choice, by: <member name> }`.
- `sure` locks the team's current pick. A team with no pick can't be sure (the button stays disabled). Once
  sure, the team's pick can't change. When every playing team is sure, the referee reveals.
- When time runs out, the team's pick stands whether or not it was locked. A team with no pick scores 0.
- **What `run` shows during `question`:** for each team, `picked` (true or false) and `sure`, plus its pick
  `{ choice, by }`. Every phone shows only its own team's pick, and the TV shows only "thinking…" or
  "sure ✓". Picture Rush already keeps every team's board in `run`, so another team's pick could be read
  by poking the database. That's accepted at a family party (my call), and it can't give away the *right*
  answer. If that changes, picks can move to a per-team path later.

### Points and ties

- Right answer: `points` (standard 500). Wrong or no answer: 0. Same for every team, whatever its size.
- Ties share a place. Report rows carry `usedMs: 0`, so the event leaderboard's time tie-break leaves quiz
  ties as they are (my call: speed isn't part of this game).

### Screens

- **Phone, question:** the quiz name, "Question {n} of {total}" and the countdown, then the question large,
  then 2–4 big choice buttons lettered A–D. The team's pick is lit in the team's colour with "{name}
  picked this". Below that, **We're sure** (disabled until there's a pick) and a short line for each team,
  such as "The Aunties: sure ✓" or "Table 4: thinking…". After **We're sure** the buttons lock, with "Locked
  in. Waiting for the other teams…".
- **Phone, reveal:** the right choice marked, the team's pick marked right or wrong, "+500" or "No points
  this time", and the other teams' results in a small list. A short sound for right or wrong
  (`FF.Audio`).
- **Phone, ended:** the result table with confetti, like the other games (bigger for the winning team).
- **TV during a question:** the question large, the choices with their letters, the countdown, and a strip
  of teams showing "thinking…" or "sure ✓". Never a team's pick.
- **TV reveal:** the right choice lit, each team's result (✓ or ✗), and the points. Then the scores after the
  last question, as the other games' final table does.
- **MC panel and organiser live panel (`livePanel.js`):** question n of total, the right answer (staff
  only: see below), each team's pick and whether it's sure, and Pause, Resume, Next and End.
- **Event page lineup:** "Quiz · {n} questions".
- **Organiser's editor:** the template sheet gains **Quiz** (icon `question` or nearest existing). The editor
  has the time per question and the points per right answer as the existing segmented controls and
  fields, then the question list. Each question card holds the text, "Right answer", up to 3 "Wrong answer"
  fields with an add/remove control, up/down reorder buttons and remove. Below the list: **Add from ideas**
  and **Write my own**.

### Who may see the right answer

The right answer is in `celebrationRuns/<runId>` (server-only) and in the referee's state. During a
question the referee writes `{ runId, q, right }` to the existing staff-only path `celebrations/<cid>/staff`
(already readable only by `staffers/<uid>`, which PHP fills for the MC and the owner, never for the TV or
guests), so the MC and organiser panels can show it. The referee clears `staff` when the run ends, as Word
by Word does.

### Tests

- **Rules (node):** sanitize both ways; PHP and JS settings lists match; duplicate choices refused; the
  incomplete-question rule; `forKind('whoKnows')` fills the name.
- **Referee (node, fake clock + dev transport):** choices shuffled the same for everyone; `run` never holds
  the right index before the reveal; picks from non-members, wrong `q` or after sure refused; the last pick
  stands at time-up; all sure → early reveal; no pick → 0; Next in both phases; pause and resume keep time
  left; a late joiner can pick; replays land once; report rows and points.
- **PHP:** template accepted and sanitized; publish refused with no complete question; start skips
  incomplete questions; the leaderboard gets the points.
- **Browser (local dev):** the organiser builds a quiz from ideas; two guest tabs on one team see each
  other's pick and its name; a third tab on another team doesn't; We're sure on both teams reveals early;
  the TV shows only thinking/sure, then the reveal; the MC panel shows the right answer; phone width and
  dark mode.

## Left to the builder

- The exact file split inside `js/celebrate/quiz/` (follow Word by Word: rules, questions, referee, play).
- The exact wording of the ~30 ready-made questions, within the brief above.
- How the TV and phone reveal animate, within the design tokens and the existing TV styles.
- Wiring: crew `api/crew/lib/loader.js` and the dev loader (`js/celebrate/dev.js`) list the new files, the
  event page and the TV and MC pages load them, and `event.js` `PLAYERS` gains `quiz`.
- Whether the team strip on phones and the TV reuses Word by Word's strip styles.
- A cover image: none in this build. Celebrations game cards show the template icon.
