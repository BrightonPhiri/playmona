# Celebrations Quiz (Who Knows {name} Best?) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third Celebrations game, `quiz`, with one kind, `whoKnows`. The organiser writes questions with
the right answer and 1–3 wrong ones, starting from ready-made ideas. Teams share one pick per question, lock
it in with "We're sure", and score flat points. It must be playable at Vicky's party on Sat 22 Nov 2026.

**Architecture:** The quiz copies Word by Word's shape. `js/celebrate/quiz/rules.js` holds the settings and
choice shuffling, shared by every side. `referee.js` runs in the crew runner (or in the organiser's or MC's
tab in dev): it reads `celebrations/<cid>/inbox`, writes `celebrations/<cid>/run`, and writes the right
answer only to the staff-only `celebrations/<cid>/staff` until the reveal. `play.js` is the phone screen,
`tv.js` gains a quiz scene, `livePanel.js` gains a quiz view, and `games.js` gains the editor.
`api/lib/CelebrationGames.php` accepts the template.

**Tech Stack:** ES2017 classic scripts on `window.FF`, PHP 8 (`PlayMona` namespace), Firebase RTDB rules,
node test harness (`tools/test/harness.js`), PHP tests (`tools/api/test.php`).

**Spec:** `docs/superpowers/specs/2026-11-21-celebration-quiz-design.md`

## Global Constraints

- Classic scripts, ES2017 or older, on `window.FF`. No modules, no build step.
- Every guest-visible string goes through `FF.t(key, 'English fallback', vars)`. Copy is plain, short British English.
- Phones write only to `celebrations/<cid>/inbox`. Only the referee writes `run` and `staff`.
- The right choice's index must never be in `celebrations/<cid>/run` before the `reveal` phase.
- The TV never shows a team's pick before the reveal, only "thinking…" or "sure ✓".
- Settings: `kind` ∈ [`whoKnows`], standard `whoKnows`; `seconds` ∈ [10, 15, 20, 30, 45, 60], standard 20; `points` 100–5000 in steps of 100, standard 500; 1–30 questions; question text ≤ 140 characters; each answer ≤ 60; 1–3 wrong answers.
- The reveal lasts 6000 ms. The start countdown is the existing `COUNTDOWN_MS` (10 s, from `run.startAt`).
- Report rows carry `usedMs: 0` (speed is not part of this game).
- Works at 360 px phone width and in dark mode, using the existing `pr-*` (phone) and `tv-*` (TV) styles.
- Picture Rush, Word by Word, the Wall, the TV's other screens and the leaderboard must not change behaviour.
- Ship as one PR on `feat/celebrations-quiz`. Don't merge without Brighton's OK. No push to main from 1 pm on 22 Nov until the event ends. Never add ssh commands to `deploy.yml`. Keep `js/net/firebase-config.js` out of the repo.
- Windows worktree: 3 node tests fail only because of CRLF line endings (2 Charades regexes, 1 WordShift word-list check). Ignore those three.

## Review Focus

1. **A team's pick changes after "We're sure", or after time-up.** Expect it to be refused, with the earlier pick standing. *Test: Task 3, `quiz referee: sure locks the pick; late picks are refused`.*
2. **A guest moves team mid-question, or joins late.** Expect their next tap to count for their new team. The old team's pick is kept. *Test: Task 3, `quiz referee: a guest who joins or moves team mid-game picks for their new team`.*
3. **Every team's players leave.** Expect a team with nobody in it not to block the all-sure early reveal. *Test: Task 3, `quiz referee: an empty team does not hold up the early reveal`.*
4. **A referee restart mid-question** (crew restart or deploy). Expect the same question, the same shuffled order, the picks kept and the right answer still hidden. *Test: Task 3, `quiz referee: a restarted referee carries on with the same order`.*
5. **An organiser saves a question with two identical answers**, such as "Paris" and " paris ". Expect a clear refusal, not a silently broken question. *Test: Task 2, `quiz: two answers that are the same are refused`.*

---

### Task 1: Quiz rules and ready-made ideas

**Files:**
- Create: `js/celebrate/quiz/rules.js`
- Create: `js/celebrate/quiz/questions.js`
- Test: `tools/test/celebrate.quiz.test.js` (new; later tasks add to it)

**Interfaces:**
- Produces `FF.QuizRules`:
  - constants `KINDS = ['whoKnows']`, `SECONDS = [10, 15, 20, 30, 45, 60]`, `POINTS_MIN = 100`, `POINTS_MAX = 5000`, `POINTS_STEP = 100`, `MAX_QUESTIONS = 30`, `MAX_TEXT = 140`, `MAX_ANSWER = 60`, `MAX_WRONG = 3`, `REVEAL_MS = 6000`, `DEFAULTS = { kind: 'whoKnows', seconds: 20, points: 500 }`
  - `sanitize(raw) -> { kind, seconds, points, questions: [{ id, text, right, wrong: [string] }] }`. Keeps incomplete questions (drafts may hold them). Trims and collapses whitespace (reuse Word by Word's `cleanText` approach), cuts text and answers to their limits, drops empty wrong answers, keeps at most 3 wrong answers and at most 30 questions. `points` is rounded to the nearest 100 and clamped. An `id` must match `/^[A-Za-z0-9_-]{1,24}$/`, or it becomes `'q' + index`.
  - `problem(q) -> '' | 'noText' | 'noRight' | 'noWrong' | 'same'`. `same` means two of the question's choices are equal ignoring case and spaces.
  - `playable(config) -> [question]`: the questions where `problem(q) === ''`, in order.
  - `deal(q, randomInt) -> { choices: [string], right: number }`: the right answer and the wrong ones, shuffled with Fisher–Yates using `randomInt(n)`.
  - `ranked(totals, teamIds) -> [{ teamId, points, usedMs: 0, place }]`: points descending, then team id. Equal points share a place.
  - `list(v)`, the same as `FF.WordByWordRules.list` (an array, or an object with number keys, becomes an array).
- Produces `FF.QuizQuestions.forKind(kind, name) -> [{ key, text }]`: about 30 ideas for `whoKnows`, with `{name}` replaced (the first word of the celebrant's name, falling back to "them"). Each text goes through `FF.t('quizIdea_' + key, …)`.

- [ ] **Step 1: Write the failing tests**

In `tools/test/celebrate.quiz.test.js` (same header style as `celebrate.wordByWord.test.js`, `const RULES = ['js/core.js', 'js/celebrate/quiz/rules.js', 'js/celebrate/quiz/questions.js']`):

```js
test('quiz rules: settings keep to the offered values', function () {
  const R = loadFF(RULES).QuizRules;
  assertEqual(JSON.stringify(R.sanitize({})), JSON.stringify({ kind: 'whoKnows', seconds: 20, points: 500, questions: [] }));
  const s = R.sanitize({ kind: 'x', seconds: 7, points: 99999, questions: [
    { id: 'a1', text: '  What was\u0000 her first job? ', right: ' Waitress ', wrong: ['Nurse', '', 'Teacher', 'Pilot', 'Chef'] },
    { id: 'bad id!', text: 'x'.repeat(200), right: 'y'.repeat(90), wrong: [] }
  ] });
  assertEqual(s.kind, 'whoKnows'); assertEqual(s.seconds, 20); assertEqual(s.points, 5000);
  assertEqual(s.questions[0].text, 'What was her first job?');
  assertEqual(s.questions[0].right, 'Waitress');
  assertEqual(JSON.stringify(s.questions[0].wrong), JSON.stringify(['Nurse', 'Teacher', 'Pilot']));
  assertEqual(s.questions[1].id, 'q1');
  assertEqual(s.questions[1].text.length, 140); assertEqual(s.questions[1].right.length, 60);
  assertEqual(R.sanitize({ points: '450', seconds: '15' }).points, 500, 'nearest 100, numbers arrive as strings');
  assertEqual(R.sanitize({ seconds: '15' }).seconds, 15);
  assertEqual(R.sanitize({ points: 10 }).points, 100);
  const many = []; for (let i = 0; i < 40; i++) many.push({ text: 'Q' + i, right: 'a', wrong: ['b'] });
  assertEqual(R.sanitize({ questions: many }).questions.length, 30);
});

test('quiz rules: a question needs text, a right answer, a wrong one and no repeats', function () {
  const R = loadFF(RULES).QuizRules;
  assertEqual(R.problem({ text: '', right: 'a', wrong: ['b'] }), 'noText');
  assertEqual(R.problem({ text: 'Q', right: '', wrong: ['b'] }), 'noRight');
  assertEqual(R.problem({ text: 'Q', right: 'a', wrong: [] }), 'noWrong');
  assertEqual(R.problem({ text: 'Q', right: 'Paris', wrong: [' paris '] }), 'same');
  assertEqual(R.problem({ text: 'Q', right: 'a', wrong: ['b', 'B'] }), 'same');
  assertEqual(R.problem({ text: 'Q', right: 'a', wrong: ['b'] }), '');
  const c = R.sanitize({ questions: [{ text: 'Q1', right: 'a', wrong: ['b'] }, { text: '', right: 'a', wrong: ['b'] }, { text: 'Q3', right: 'a', wrong: ['b', 'c'] }] });
  assertEqual(R.playable(c).map((q) => q.text).join(','), 'Q1,Q3');
});

test('quiz rules: deal shuffles the choices and knows where the right one went', function () {
  const R = loadFF(RULES).QuizRules;
  const q = { text: 'Q', right: 'Right', wrong: ['W1', 'W2', 'W3'] };
  const seen = {};
  for (let s = 1; s < 40; s++) {
    let x = s; const rnd = (n) => { x = (x * 1664525 + 1013904223) >>> 0; return x % n; };
    const d = R.deal(q, rnd);
    assertEqual(d.choices.length, 4);
    assertEqual(d.choices[d.right], 'Right');
    assertEqual(d.choices.slice().sort().join(','), 'Right,W1,W2,W3');
    seen[d.right] = true;
  }
  assert(seen[0] && seen[1] && seen[2] && seen[3], 'the right answer can land anywhere');
  assertEqual(R.deal({ text: 'Q', right: 'Yes', wrong: ['No'] }, () => 0).choices.length, 2, 'true or false works');
});

test('quiz rules: ranking shares places on equal points', function () {
  const R = loadFF(RULES).QuizRules;
  const rows = R.ranked({ t_a: { points: 500 }, t_b: { points: 1000 }, t_c: { points: 500 } }, ['t_a', 't_b', 't_c']);
  assertEqual(rows.map((r) => r.teamId + ':' + r.place).join(','), 't_b:1,t_a:2,t_c:2');
  rows.forEach((r) => assertEqual(r.usedMs, 0));
});

test('quiz ideas: about 30 questions about a person, with the name filled in', function () {
  const Q = loadFF(RULES).QuizQuestions;
  const ideas = Q.forKind('whoKnows', 'Vicky Banda');
  assert(ideas.length >= 25 && ideas.length <= 35, 'about 30, got ' + ideas.length);
  ideas.forEach((i) => {
    assert(/^[a-zA-Z0-9]+$/.test(i.key), 'key ' + i.key);
    assert(i.text.indexOf('{name}') === -1 && i.text.length <= 140, i.text);
  });
  assert(ideas.some((i) => i.text.indexOf('Vicky') !== -1) && !ideas.some((i) => i.text.indexOf('Banda') !== -1), 'the first name only');
  assertEqual(new Set(ideas.map((i) => i.key)).size, ideas.length, 'keys are unique');
  assertEqual(Q.forKind('nope', 'Vicky').length, 0);
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `node -e "require('./tools/test/celebrate.quiz.test.js'); require('./tools/test/harness').run().then(f => process.exit(f ? 1 : 0))"`
Expected: FAIL (`QuizRules` is undefined).

- [ ] **Step 3: Write `js/celebrate/quiz/rules.js` and `js/celebrate/quiz/questions.js`**

Give both the same header comment shape as `js/celebrate/wordByWord/rules.js`, and say in it that `api/lib/CelebrationGames.php` must stay in step. The ideas follow the spec's brief: first job, favourite food, the dish they always order, first holiday abroad, what they wanted to be as a child, first car, a hidden talent, the song they always sing along to, where they'd live anywhere in the world, what they're like before their morning coffee, and about 20 more. They must suit both birthdays and graduations and must not assume an age or gender. Questions end with "?".

- [ ] **Step 4: Run the tests and check they pass**

Same command. Expected: PASS for the five quiz tests.

- [ ] **Step 5: Commit**

```bash
git add js/celebrate/quiz/rules.js js/celebrate/quiz/questions.js tools/test/celebrate.quiz.test.js
git commit -m "feat(quiz): rules, choice dealing and ready-made Who Knows questions"
```

---

### Task 2: The server accepts the quiz

**Files:**
- Modify: `api/lib/CelebrationGames.php`: `TEMPLATES`, `NAMES`, the new `QUIZ` constants, `sanitize()`, a new `sanitizeQuiz()`, `save()`, `create()`, `instructionsFor()`, `ready()`, `startAs()`, `view()`, `lineup()`
- Test: `tools/api/celebrationGames.test.php` (add tests); `tools/test/celebrate.quiz.test.js` (parity test)

**Interfaces:**
- Consumes: `FF.QuizRules` constants (Task 1) for the parity test.
- Produces:
  - `CelebrationGames::TEMPLATES` gains `'quiz'`, and `NAMES` gains `'quiz' => 'Quiz'`.
  - `public const QUIZ = ['kind' => ['whoKnows'], 'seconds' => [10, 15, 20, 30, 45, 60]];` and `private const QUIZ_DEFAULTS = ['kind' => 'whoKnows', 'seconds' => 20, 'points' => 500];`, `QUIZ_MAX_QUESTIONS = 30`, `QUIZ_MAX_TEXT = 140`, `QUIZ_MAX_ANSWER = 60`, `QUIZ_POINTS_MAX = 5000`. These are the exact strings the parity test looks for.
  - `sanitizeQuiz(array $raw): array`, matching `FF.QuizRules.sanitize` field for field.
  - `save()`: for `quiz`, a question whose choices repeat (the same rule as `problem() === 'same'`) throws `HttpError(400, 'Two answers are the same.', 'same-answers')`.
  - `create()`: for `quiz` with no name given, the name is `'Who Knows ' . <first word of celebrant_name, or 'the celebrant'> . ' Best?'`.
  - `instructionsFor('quiz')`: `"Pick your team's answer together. Anyone in the team can change it until the time runs out. {who}, sit this one out: you know them all!"` If there's no celebrant name, the last sentence is left out.
  - `ready('quiz')`: needs at least one complete question, otherwise `HttpError(409, 'Add at least one question with its answers.', 'no-questions')`.
  - `startAs()`: for `quiz`, `$config['questions']` holds only complete questions before it goes into `celebrationRuns`.
  - `view()` and `lineup()` gain `'questions' => <number of complete questions>` and `'kind' => $config['kind'] ?? null`. Nothing else from the quiz config leaves `view(…, false)` or `lineup()`.

- [ ] **Step 1: Write the failing tests**

PHP, in `tools/api/celebrationGames.test.php`, using the existing `celWorld`, `newEvent`, `celCall`, `organiser`, `guestToken`, `eq` helpers:

- `quiz: the organiser adds one with the standard settings and a Who Knows name`: POST `/c/$cid/games` `{template: 'quiz'}` → 200; `config` = `['kind' => 'whoKnows', 'seconds' => 20, 'points' => 500, 'questions' => []]`; `name` = `'Who Knows Vicky Best?'`; `instructions` contains `'Vicky, sit this one out'`.
- `quiz: publishing needs one complete question`: publish → 409 `no-questions`. Save `questions: [['text' => 'First job?', 'right' => 'Waitress', 'wrong' => ['']]]` → publish still 409. Save with `'wrong' => ['Nurse']` → publish 200.
- `quiz: two answers that are the same are refused`: save `['text' => 'Q', 'right' => 'Paris', 'wrong' => [' paris ']]` → 400 `same-answers`.
- `quiz: start sends only complete questions; guests never see answers`: save one complete question and one with no text, publish, join `g1` to a team, then start. `celebrationRuns/<runId>.config.questions` has 1 item. `GET /c/$cid/lineup` as `g1` gives `questions = 1` and its JSON has no `Waitress`. `GET /c/$cid/games` as the organiser (list, not full) has no `Waitress` either.

Node, in `tools/test/celebrate.quiz.test.js`:

```js
test('quiz: the server offers the same settings', function () {
  const R = loadFF(RULES).QuizRules;
  const php = fs.readFileSync(path.join(ROOT, 'api/lib/CelebrationGames.php'), 'utf8');
  assert(php.indexOf("'kind' => ['" + R.KINDS.join("', '") + "']") !== -1, 'kinds');
  assert(php.indexOf("QUIZ = ['kind' => ['whoKnows'], 'seconds' => [" + R.SECONDS.join(', ') + ']]') !== -1, 'seconds');
  const d = R.DEFAULTS;
  assert(php.indexOf("QUIZ_DEFAULTS = ['kind' => '" + d.kind + "', 'seconds' => " + d.seconds + ", 'points' => " + d.points + ']') !== -1, 'standards');
  ['QUIZ_MAX_QUESTIONS = ' + R.MAX_QUESTIONS, 'QUIZ_MAX_TEXT = ' + R.MAX_TEXT, 'QUIZ_MAX_ANSWER = ' + R.MAX_ANSWER, 'QUIZ_POINTS_MAX = ' + R.POINTS_MAX]
    .forEach((s) => assert(php.indexOf(s + ';') !== -1, s));
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `php tools/api/test.php` → the four quiz tests FAIL (`bad-template`). Run the node command from Task 1 → the parity test FAILS.

- [ ] **Step 3: Implement the PHP changes listed under Interfaces**

Copy `sanitizeWords`'s helpers (`$int`, `$pick`, `$this->events->cleanText`). Cut text and answers by `mb_substr` after cleaning, as `cleanText` does.

- [ ] **Step 4: Run both suites and check they pass**

`php tools/api/test.php`: all pass, including the existing Picture Rush and Word by Word tests. Node: the quiz tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/lib/CelebrationGames.php tools/api/celebrationGames.test.php tools/test/celebrate.quiz.test.js
git commit -m "feat(quiz): the server accepts, checks and starts quizzes"
```

---

### Task 3: The referee

**Files:**
- Create: `js/celebrate/quiz/referee.js`
- Modify: `database.rules.json` (inbox fields `q`, `choice`)
- Modify: `api/crew/lib/loader.js` (add `'js/celebrate/quiz/rules.js'`, `'js/celebrate/quiz/referee.js'` after Word by Word's)
- Modify: `js/celebrate/livePanel.js:33-36` `loadDev()` (load the quiz rules if `!FF.QuizRules`, and `js/celebrate/quiz/referee.js`)
- Test: `tools/test/celebrate.quiz.test.js`

**Interfaces:**
- Consumes: `FF.QuizRules` (Task 1). The `run` object from `startAs` (Task 2): `{ runId, cid, gameId, template: 'quiz', name, instructions, config, teams: { tid: { name, color, members: [{ uid, name }] } }, startAt, celebrant }`.
- Produces: `FF.CelebrateReferees.quiz = { create(opts), REVEAL_MS }`, with the same `opts` as Word by Word (`run, room, store, randomInt, timers, log, report, onEnd`, ignoring `isWord`/`isQuiet`). It returns `{ start, stop, state, flush }`.
- **Inbox commands:** `{ type: 'pick', runId, n, t, q, choice }` and `{ type: 'sure', runId, n, t, q }`. Errors recorded in `said[uid] = { n, error }`: `''`, `'late'` (wrong phase or `q`), `'paused'`, `'noTeam'`, `'locked'` (the team is already sure), `'badChoice'`, `'noPick'` (sure with no pick).
- **`run` view** (the contract for Tasks 4 and 5):
  ```
  { v: 1, runId, gameId, template: 'quiz', kind, name, instructions, phase: 'starting'|'question'|'reveal'|'ended',
    startAt, paused, q (-1 before the first), total, seconds, points,
    question: { text, choices: [string] } | null,          // in question and reveal
    deadline, leftMs (only while paused in question), revealUntil,
    teams: { tid: { name, color, players: { uid: name } } }, order: [tid] (teams with players at the start, sorted by id),
    picks: { tid: { choice, by, sure } },                   // in question and reveal; a team with no pick is absent
    right: number, got: { tid: boolean },                   // ONLY in reveal and ended
    totals: { tid: { points } }, said, n,
    result: { why, rows: ranked(), winners: [tid] } | null }   // only in ended
  ```
- **`staff`:** `{ runId, q, right }` in `question` and `reveal`. `null` when the run ends.
- **Report:** `report('celebration', { runId, cid, gameId, template: 'quiz', why, rounds: [{ round: q, teams: { tid: { points, solved: got, usedMs: 0 } } }], ranked: [{ teamId, place, points }] })`, once.

Behaviour to copy from `js/celebrate/wordByWord/referee.js`: `fresh`/`revive`/`start`/`stop`, `onMembers` (late joiners and moves), `schedule`/`onClock`, `onControl` with `pause`/`resume`/`next`/`end` and the `resumeAt` gap, `onInbox` + `drainWaiting` (per-sender `n`, `LOST_MS` gap, ordered by sent time), `save`, `publish`, and leaving the inbox alone once ended. New:

- At `fresh()`, `deck = R.playable(config).map((q) => R.deal(q, randomInt))` and `rights` are held in the state only. The view's `question` comes from `deck[q].choices`.
- `question` ends when `t >= deadline`, on `next`, or when every team in `order` that still has players has `sure`. A team whose players have all gone doesn't count. If no team has players, it waits for the clock.
- At the reveal, every team in `order` with a pick equal to `right` gets `config.points`.
- `next` during `starting` → question 0. During `question` → reveal now. During `reveal` → the next question, or `ended` after the last.
- `end` → `ended` with the points so far, `why: 'stopped'`. The natural end has `why: 'done'`.

- [ ] **Step 1: Write the failing tests**

Copy `seeded`, `makeBus`, `makeClock`, `flush` and a `game(opts)` helper from `celebrate.wordByWord.test.js`. Use `FILES = RULES.concat(['js/net/transport.js', 'js/celebrate/quiz/referee.js'])`, teams Gold (`g1`, `g2`), Ruby (`r1`) and Jade (empty), `config: { seconds: 20, points: 500, questions: [3 complete questions] }`, and helpers `g.pick(uid, choice)`, `g.sure(uid)`, `g.right()` (from `bus.read('celebrations/<CID>/staff').right`). Tests:

- `quiz referee: the answer is hidden until the reveal`: after `toPlay()`, phase is `question`, `q` is 0, and `JSON.stringify(view)` has no `right` key and no `got`. `staff.right` is a number with `view.question.choices[staff.right]` equal to the question's right answer. After 20 s the phase is `reveal`, and `view.right === staff.right`.
- `quiz referee: one shared pick, the last one counts`: `g1` picks 0, then `g2` picks 2 → `picks.t_gold` = `{ choice: 2, by: 'Ben', sure: false }`. `r1` picks the right answer. After the clock runs out, Ruby has 500, and Gold has 500 only if 2 is right (pick the indices from `g.right()` to make each case certain).
- `quiz referee: sure locks the pick; late picks are refused`: `sure` with no pick → `said.g1.error === 'noPick'`. Pick, sure, then pick again → `'locked'`, and the pick is unchanged. A pick with `q: 1` during question 0 → `'late'`. A pick during `reveal` → `'late'`. `choice: 3` on a 2-choice question → `'badChoice'`.
- `quiz referee: everyone sure reveals early`: Gold and Ruby both pick and are sure at t+5 s → phase `reveal` at once, with `revealUntil` = now + 6000.
- `quiz referee: an empty team does not hold up the early reveal`: remove `r1` from `members` (the same tree shape as Word by Word's move test), then Gold is sure → reveal.
- `quiz referee: no pick scores nothing`: nobody picks → after the clock everyone has 0, and `got` is all false.
- `quiz referee: a guest who joins or moves team mid-game picks for their new team`: add `j1` to `t_ruby` in `members` mid-question → `j1`'s pick sets `picks.t_ruby` with `by` = their name. Move `g2` to Ruby → `g2`'s next pick changes Ruby's pick, not Gold's.
- `quiz referee: next, pause and resume`: `next` in question → reveal. `next` in reveal → `q` + 1. Pause at 5 s, advance 60 s, resume → still `question` with about 15 s left (`deadline - now` within 100 ms of 15000).
- `quiz referee: the game ends after the last question and reports once`: play 3 questions → `ended`, one report with `template: 'quiz'`, 3 `rounds`, `ranked` places, `usedMs: 0` everywhere, and `staff` null.
- `quiz referee: end stops with the points so far`: end during question 1 → `ended`, `why: 'stopped'`, totals as they were.
- `quiz referee: a restarted referee carries on with the same order`: stop mid-question, start a new referee with the same `saved` → same `q`, same `question.choices`, picks kept, `right` still absent from `run`.
- `quiz referee: a replayed command lands once`: the same `n` sent twice gives one pick event (check `n.g1`).
- `quiz: the runner loads it; the inbox rule takes q and choice`: `loader.js` contains both quiz files. `database.rules.json` inbox has `q` (`isNumber`, `<= 100`) and `choice` (`isNumber`, `<= 3`).

- [ ] **Step 2: Run them and check they fail**

Same node command. Expected: the referee tests fail (`FF.CelebrateReferees.quiz` is undefined).

- [ ] **Step 3: Write `js/celebrate/quiz/referee.js`, add the two inbox rules and the loader lines**

Rules JSON, beside `turn`:
`"q": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" }`,
`"choice": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 3" }`.

- [ ] **Step 4: Run the whole node suite and check it passes**

Run: `node tools/test/run.js`. Expected: every test passes apart from the 3 known CRLF failures. `celebrations.rules.test.js` still passes.

- [ ] **Step 5: Commit**

```bash
git add js/celebrate/quiz/referee.js database.rules.json api/crew/lib/loader.js js/celebrate/livePanel.js tools/test/celebrate.quiz.test.js
git commit -m "feat(quiz): the referee: shared picks, We're sure, hidden answers, flat points"
```

---

### Task 4: The phone screen

**Files:**
- Create: `js/celebrate/quiz/play.js`
- Modify: `js/celebrate/event.js`: `PLAYERS` gains `quiz: function () { return FF.QuizPlay; }`. `drawLineup()` facts for `quiz`: `t(n === 1 ? 'celQuizOne' : 'celQuizMany', n === 1 ? '1 question' : '{n} questions', { n: g.questions })`, and the label `t('celTplQuiz', 'Quiz')`.
- Modify: `event.html` (after the Word by Word scripts: `js/celebrate/quiz/rules.js`, `js/celebrate/quiz/play.js`)
- Modify: `css/celebrate.css` (only what the `pr-*` classes don't already give: the choice buttons and the team strip; quiz classes prefixed `qz-`)

**Interfaces:**
- Consumes: the `run` view and the inbox commands from Task 3.
- Produces: `FF.QuizPlay.mount(host, { transport, uid, onClose }) -> { view(), destroy() }`, the same contract as `FF.WordByWordPlay`.

The screens are as in the spec ("Phone, question / reveal / ended"). Copy from `wordByWord/play.js`: `cmdId`, `myTeam()` (from `v.teams[tid].players[uid]`), the `once()` sounds, the header, the countdown from `T.serverNow()`, the paused note, the ended table with confetti (bigger for the winning team), and the "watching" screen for a guest with no team. Showing the tap at once: when the guest taps, light their choice straight away (a prediction), and settle it on the referee's `picks` when it arrives, as Picture Rush does with swaps. If `said[uid].error` is `'locked'` or `'late'`, show the referee's pick.

- [ ] **Step 1: Write `play.js`, the `event.js` lines, the script tags and the CSS**

- [ ] **Step 2: Check it locally in the browser**

Start the `playmona-celebrations-api-9512` launch config with devRooms on, as in the dev notes. Create an event and a quiz with 2 questions from ideas (Task 5's editor; until Task 5 lands, save the config through `POST /c/<cid>/games/<gid>/save`). Join two guest tabs to one team and a third to another, each with its own `sessionStorage playmona:devApiUid`. Start the quiz from the organiser tab. Check:
- Both teammates see the same lit pick with the picker's name.
- The third tab never shows the first team's pick.
- **We're sure** is disabled until there's a pick and locks the buttons after.
- The reveal marks right and wrong and shows "+500".
- The end table shows confetti.
- The console has no errors.
- At 360 px width nothing overflows.

- [ ] **Step 3: Commit**

```bash
git add js/celebrate/quiz/play.js js/celebrate/event.js event.html css/celebrate.css
git commit -m "feat(quiz): the phone screen: shared pick, We're sure, reveal"
```

---

### Task 5: Editor, TV and MC panel

**Files:**
- Modify: `js/celebrate/games.js`:
  - `TEMPLATES` gains `{ id: 'quiz', icon: 'question', name: ['celQuizName', 'Quiz'], text: ['celQuizText', 'Teams answer questions about the celebrant together. Every right answer scores.'] }`.
  - `newGame()` sends no name for `quiz`, so the server's "Who Knows {name} Best?" applies.
  - `gameCard` bits for `quiz`: "{n} questions" and "{time} a question".
  - `render()` calls `quizFields()`.
  - `save()` sends `cfg.questions` as `{ id, text, right, wrong }`.
- Modify: `js/celebrate/tv.js`:
  - `game()` routes `v.template === 'quiz'` to `quiz(v)`.
  - `dataKey()` adds `v.q`, the picks' `sure` and `picked` flags (never `choice` before the reveal) and `v.right`.
  - `updateClock()` handles `quiz` (`question` → `deadline`, `reveal` → `revealUntil`, paused → `leftMs`).
- Modify: `js/celebrate/livePanel.js`:
  - `draw()` routes `quiz` to `drawQuiz()`.
  - `drawQuiz()` shows "Question {n} of {total}", the question, the right answer from `staff` (watch `staff` for `quiz` as for `wordByWord`), each team's pick with `by` and sure, Pause/Resume, and **Next** labelled "Show the answer" in `question` and "Next question" or "Final results" in `reveal`, plus End.
  - `tick()` handles `quiz`.
- Modify: `play.html` (after `wordByWord/rules.js`: `js/celebrate/quiz/rules.js`, `js/celebrate/quiz/questions.js`)
- Modify: `css/celebrate.css` (`.cel-quiz-*` for the editor and live panel, `.tv-qz-*` for the TV)

**Interfaces:**
- Consumes: `FF.QuizRules`, `FF.QuizQuestions.forKind(kind, name)` (Task 1); the `run` view and `staff` (Task 3); `g.questions`, `g.kind` from `view()` (Task 2).
- Produces: nothing new for later tasks.

The editor (spec: "Organiser's editor"):
- "Time for each question" uses `select` over `R.SECONDS`. "Points for a right answer" is a number field with min 100, max 5000, step 100.
- Each question card has the text, "Right answer", 1–3 "Wrong answer" fields with **Add a wrong answer** (hidden at 3) and remove, ↑/↓ reorder and Remove. An incomplete card shows the reason from `R.problem()`: "Add the question", "Add the right answer", "Add a wrong answer" or "Two answers are the same".
- Below the list: **Add from ideas** opens `FF.UI.sheet` with a checkbox list from `FF.QuizQuestions.forKind(cfg.kind, ev.celebrantName)`. Ideas already in the quiz (same text) are marked "Added", and confirming appends the ticked ones. **Write my own** appends an empty question.
- New ids are `'q' + Date.now().toString(36) + random`.
- Over 30 questions, both buttons are disabled with "That's the most a quiz can have."

The TV scene (spec: "TV during a question / TV reveal"): reuse `tv-game__head`, `tv-chip` ("Question {n} of {total}"), `tv-timer` and the Word by Word strip styles for teams. Each team shows "thinking…" or "sure ✓" only. The reveal lights the right choice and shows ✓ or ✗ per team. `ended` uses the existing `finalTable(v)`.

- [ ] **Step 1: Write the editor, TV and live panel code, the script tags and the CSS**

- [ ] **Step 2: Check it locally in the browser**

With the same setup as Task 4, check:
- Building a quiz with **Add from ideas** (5 ticked) and **Write my own**: the name reads "Who Knows {name} Best?", incomplete cards show their reason, and a duplicate answer shows the server's "Two answers are the same." toast on save.
- Reorder works. Publish works.
- Open the TV link and the MC link. During a question, the TV shows only thinking/sure. The MC panel shows the right answer and each team's pick.
- **Show the answer**, **Next question** and **Final results** work, and Pause holds the clock on every screen.
- After the game the leaderboard on the event page and the TV includes the quiz points.
- A Picture Rush and a Word by Word game still start and end normally (one quick round each).
- Dark mode on the editor and phone, 360 px width.

- [ ] **Step 3: Commit**

```bash
git add js/celebrate/games.js js/celebrate/tv.js js/celebrate/livePanel.js play.html css/celebrate.css
git commit -m "feat(quiz): editor with ready-made ideas, TV scene and MC panel"
```

---

### Task 6: Ship for Saturday

**Files:**
- Modify: `C:\Users\Brighton\.claude\projects\C--Users-Brighton-OneDrive-Documents-miscellaneous-playmona\memory\playmona-celebrations.md` (one progress line) and a new memory `playmona-quiz.md` with its `MEMORY.md` pointer.

- [ ] **Step 1: Run every suite**

`node tools/test/run.js` (only the 3 known CRLF failures) and `php tools/api/test.php` (all pass).

- [ ] **Step 2: Open the PR**

`git push -u origin feat/celebrations-quiz`, then `gh pr create` titled "Celebrations Quiz: Who Knows {name} Best?". The body covers what's in, what's left for after the party (from the spec's Timing section), and the freeze. **Don't merge.** Ask Brighton for the OK.

- [ ] **Step 3: After Brighton's OK: merge, check the deploy, rehearse**

Merge, then watch the deploy workflow go green (it publishes `database.rules.json` and restarts the crew). Then on playmona.com, run one real quiz with real phones on two teams, the TV and the MC link. Check that the picks are shared, the TV hides them, the MC panel shows the answer and the points land on the leaderboard.

- [ ] **Step 4: Record it**

Update the memory files with the merge commit, the `run` view contract, the inbox fields (`pick`/`sure` with `q`/`choice`), and the freeze from 1 pm on 22 Nov.
