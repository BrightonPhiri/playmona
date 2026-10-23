# PlayMona — Development Contract (READ ME FIRST)

You are implementing part of **PlayMona**, a game hub for everyone. The app already has a
complete engine (shell, scoring, timers, audio, themes, TV navigation, accounts).
Your job is to add content data and/or games that plug into that engine.

## Hard constraints (violating these breaks the app)

1. **Classic scripts only.** No `import`, no `export`, no ES modules, no `require`.
2. **No network in games.** No `fetch`, no `XMLHttpRequest`, no `<link>`/`<img>` to remote URLs.
   Games must work offline and from `file://` (`play.html`). Only `js/net/`, `auth.js` and
   `sync.js` talk to Firebase.
3. **Global namespace `window.FF`.** Everything you define lives under `FF.data` (data)
   or registers via `FF.registerGame(...)` (games).
4. **ES2017 or older.** No optional chaining `?.`, no nullish coalescing `??`, no
   `Array.prototype.flat/flatMap/at`, no `String.replaceAll`, no BigInt, no top-level await.
   `const/let`, arrow functions, template literals, `Array.from`, `Object.assign`,
   `Array.prototype.find/filter/map/reduce/some/every/includes` are all fine.
5. **Every file is an IIFE**: `(function(){ 'use strict'; ... })();` and sets
   `window.FF = window.FF || {};` at the top if it defines a new `FF.*` namespace.
6. **No external libraries.** Only vanilla JS + the existing `FF.*` helpers.
7. **No placeholders.** Every game must be fully playable start-to-finish. No "coming soon".

## File you are producing

Write exactly ONE file (see your task). Do not touch other files.

---

## PART A — DATA FILES (`js/data/*.js`)

Data files attach to `window.FF.data`. Use this pattern:

```js
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};
  FF.data.quiz = { ... };
})();
```

Use `FF.data` exactly — other files depend on these exact property names.

---

## PART B — GAME FILES (`js/games/*.js`)

A game file registers one or more games:

```js
window.FF = window.FF || {};
(function () {
  'use strict';

  FF.registerGame({
    id: 'letterRush',            // unique, camelCase
    name: 'Letter Rush',         // display name
    description: 'Make as many words as you can before time runs out.',
    category: 'words',           // words | quiz | bible | visual | memory | reaction | creative | numbers | party | world
    icon: '🔤',                  // legacy fallback only; the UI uses FF.Icons.game[id]
    players: [1, 8],             // [min, max] players
    difficulty: 'Easy',          // Easy | Normal | Hard (label shown on cards)
    duration: 5,                 // approximate minutes (number)
    tags: ['quick'],             // optional
    modes: ['solo', 'turn', 'team', 'everyone', 'host'], // supported modes
    defaultMode: 'turn',
    howToPlay: [
      'Look at the letters on screen.',
      'Make as many words as you can.',
      'Each valid word earns points.',
      'Highest score wins.'
    ],
    start: function (api) { /* your game logic */ }
  });
})();
```

### The `api` object passed to `start(api)`

- `api.def` — the game definition above.
- `api.config` — `{ players: [player...], teams: [team...]|null, scorers: [entity...], mode,
  difficulty ('easy'|'normal'|'hard'), length, timer (0|10|20|30|60), sound, music,
  animations, randomOrder, randomQuestions, round, tournament }`.
  - `api.config.scorers` are the entities that receive points (players, or teams in team mode).
  - `api.config.players` are the individual players (always present).
  - A `team` entity looks like `{ id, name, avatar:'👥', color, players:[playerId...] }`.
- `api.shell` — the game chrome:
  - `api.shell.root` — the content `<div>` you render your game into.
  - `api.shell.setTimer(seconds, onFinish)` — start the shared header countdown (0/omitted hides it).
  - `api.shell.hideTimer()`, `api.shell.pauseTimer()`, `api.shell.resumeTimer()`.
  - `api.shell.updateScores(activeId?)` — refresh the score chips (pass the active entity id to highlight it).
  - `api.shell.setTitle(text)`, `api.shell.toast(msg, cls?)`.
- `api.ui` — DOM helpers (see below).
- `api.scoring` — `FF.Scoring` (see below).
- `api.audio` — `FF.Audio`; call `api.audio.play('click'|'select'|'countdown'|'correct'|'wrong'|'roundStart'|'roundEnd'|'winner'|'warning'|'tap'|'flip'|'streak')`.
- `api.util` — `FF.util` (shuffle, sample, pick, int, clamp, formatTime, formatNumber, normalize, lettersOnly, plural, uid, escapeHtml).
- `api.random` — `FF.Random`; use `new api.random.Bag(items)` for an anti-repeat random source with `.next()`.
- `api.timer` — `FF.Timer`; use `api.timer.create({onTick, onFinish, onWarning, warningAt})` for local timers (start/pause/resume/stop).
- `api.assets` — `FF.Assets` (`illustration(svg, cls, alt)` renders an inline SVG; `img({src, svg, alt, cls})`).
- `api.flags` — `FF.Flags` (`render(flag, {cls, alt})` returns a DOM node for a flag svg; `svg(flag)`).
- `api.end(results)` — **call exactly once when the game finishes.** See "Ending a game".

### DOM building with `api.ui`

- `api.ui.el(tag, attrs, children)` — create element. `attrs` supports `class`, `html`, `text`,
  `value`, `checked`, `disabled`, `style` (object), `dataset`, `onclick`/`oninput`/etc (functions),
  and any string attribute. `children` is a string, node, or array (nested arrays allowed).
- `api.ui.div(cls, children)`, `api.ui.span(cls, children)`, `api.ui.button(label, {class, primary, onClick, dataset, ariaLabel})`.
- `api.ui.clear(node)`.
- Interactive elements: use real `<button>` so keyboard/Enter and the TV focus system work.
  For a clickable `<div>`, add `tabindex: 0` and `'data-focusable': 'true'`.
- Common CSS classes already exist: `btn`, `btn-primary`, `btn-lg`, `icon-btn`, `seg`, `seg__btn`,
  `seg__btn active`, `panel`, `meta-chip`, `results__row`, `score-chip`, `hint`.

### Building game screens with `FF.GameUI` (js/gameUI.js, css/games.css)

Every game builds its screens from these helpers. **Do not hand-style
games with inline `style` objects or hex colours**, and never inject
`<style>` tags. Inline styles are only for values computed at run time
(positions, sizes, colours that come from data).

- `FF.GameUI.stage({ wide, center })`: the centred column for one screen.
- `FF.GameUI.turnBar(entity, roundText)`: whose turn plus the round pill. It shows
  "Everyone races" automatically in online rooms and hides the turn pill in solo play.
- `FF.GameUI.prompt(text, 'sm'|'md'|'xl')`, `kicker(text)`, `sub(text)`, `note(text)`.
- `FF.GameUI.options({ columns: 1|2|'auto' })` plus `option(label, onClick, index)`:
  answer buttons with A/B/C/D markers. `markOption(btn, 'correct'|'wrong'|'dim')`
  adds a ✓/✗ icon and screen-reader text, so results never rely on colour alone.
- `FF.GameUI.duo()` plus `duoButton(label, onClick, 'yes'|'no'|'up'|'down', iconKey)`:
  big two-way choices.
- `FF.GameUI.feedback('good'|'bad'|'info'|'tip', text)`: an announced result line.
  `FF.GameUI.correctText(points)` gives the standard "Correct! +N points".
- `FF.GameUI.inputRow({ placeholder, onSubmit })`, `tiles(letters)`, `meter(fraction)`,
  `media(node)`, `action(label, onClick, { icon })`.
- `FF.GameUI.exitCard(api, title, text)`: the friendly screen when data is missing.
- Text goes through `FF.t(key, 'English fallback', { vars })`, in sentence case.
  Never write ALL CAPS, and never put emoji in buttons. Pass an icon instead:
  `FF.UI.button(label, { icon: 'check', class: 'btn-lg btn-primary', onClick })`.
- Never label an image with the answer (`alt`/`aria-label`); use a neutral label
  such as `FF.t('pictureToGuess', 'Picture to guess')`.

### App-level components (`FF.UI`, js/ui-kit.js)

`FF.UI.dialog/sheet/confirm` (focus-trapped, Esc to close), `FF.UI.toast`,
`FF.UI.announce` (screen readers), `FF.UI.switchRow`, `FF.UI.segmented`,
`FF.UI.settingRow`, `FF.UI.chip`, `FF.UI.iconButton(icon, label, onClick)` and
`FF.UI.emptyState`. Design tokens (colour, type, spacing, motion) live in
`css/tokens.css`. After changing colours, run `node tools/contrast-check.js`.
After adding cover or category art, run `node tools/gen-asset-manifest.js`.

### Scoring (`api.scoring`)

- Already initialised with `api.config.scorers`. `api.scoring.record(id)` returns `{ points, correct,
  wrong, streak, bestStreak, fastest, ... }`.
- `api.scoring.add(id, points, {correct:true|false, fastest:ms})` — award points (handles streaks when `correct`).
- `api.scoring.subtract(id, points)`, `api.scoring.get(id)`, `api.scoring.set(id, points)`.
- `api.scoring.markAnswer(id, correct, timeMs)` — record a correct/wrong answer (updates streak & fastest).
- `api.scoring.resetStreak(id)`.
- `api.scoring.leaderboard()` — entities sorted by points.
- Apply a difficulty bonus: `easy ×1`, `normal ×1.5`, `hard ×2` (round the result). Example base points:
  quiz correct = 100, plus a speed bonus up to +50 when fast.

### Ending a game

```js
api.end({
  results: [ { id, name, avatar, color, points, correct, bestStreak, fastest } ], // sorted best-first
  winnerId: 'p1',
  bestStreak: 7,          // optional, number
  fastest: 0.382,         // optional, seconds (number)
  mostWords: 12,          // optional
  quizCorrect: 9,         // optional
  quizAnswered: 10,       // optional
  achievements: ['wordMaster'] // optional array of achievement ids
});
```

If you call `api.end({})`, results are built automatically from scoring. Always call `api.end`
when done — never leave the game stuck. Provide the full ranked `results` array when a game has
custom scoring (e.g. per-round totals) so the winner screen shows correct numbers.

Always call `api.shell.updateScores()` after any score change, and call `api.audio.play(...)` for feedback.

### Robustness

- Wrap fragile code in `FF.safe(fn, fallbackFn)`.
- If required data is missing/empty (e.g. `FF.data.quiz` not loaded), show a friendly message and an
  "Exit" button rather than throwing.
- Support 1 player (solo) gracefully and multiplayer. Honour `api.config.timer` when the game has a timer.

---

## Content data contracts (exact shapes — DO NOT rename these)

These are the shapes the games will read. Match them exactly.

### `FF.data.quiz` (js/data/quiz.js)
```js
FF.data.quiz = {
  questions: [ { q, options:[4 strings], answer: index, explanation, difficulty:'easy'|'normal'|'hard', category } ],  // aim 400+ total
  trueFalse: [ { q, answer: true|false, explanation, difficulty } ],  // 120+
  guessWho:  [ { answer, clues:[3-4 strings], category, difficulty } ],  // 60+
  pictureQuiz: [ { q, options:[4], answer: index, explanation, imageKey } ]  // 40+ (imageKey references FF.data.visual)
};
```
Categories for `questions` should include at least: General Knowledge, Geography, Science,
History, Animals, Sports, Food, Movies, Music, Technology, Kids, Africa, Zimbabwe, Everyday Life.
Include many `kids` + `easy` questions.

### `FF.data.words` (js/data/words.js)
```js
FF.data.words = {
  dictionary: [ 'apple', 'banana', ... ],  // 2000+ common English words, 3-9 letters, lowercase, deduplicated, no proper nouns
  scramble:   [ { word, clue, difficulty } ],  // 120+
  categories: [ { category, items:[...] , difficulty } ],  // 15+ categories, 8-20 items each
  missingLetters: [ { word, hint, difficulty } ],  // 60+
  crosswords: [ { size, grid: [ [letter|null, ...], ... ], clues: { across:[{num,row,col,clue}], down:[{num,row,col,clue}] } } ]  // 3+ puzzles (5x5/7x7/9x9)
};
```
`grid` is a 2D array of lowercase letters or `null` for blocked cells. `num` starts at 1 and
increments per starting square; clue objects reference the number at their start cell. Crosswords
must be internally consistent (shared letters match) and solvable.

### `FF.data.countries` (js/data/countries.js)
```js
FF.data.countries = [
  { id, name, capital, continent, region, flag: { svg: '<svg ...>' }, facts: [..], neighbors:[country names], landmarks:[landmark names], food:[food names] }
  // 60+ countries. Each flag.svg is a complete, valid SVG string with viewBox="0 0 300 200".
];
```
Flags: accurate colours and layout, sharp at 4K. Use simple shapes (rects/circles/polygons). For
complex emblems approximate recognisably (e.g. Zimbabwe's star + bird simplified, USA stripes + canton
with stars, UK Union Jack simplified, South Africa's Y-shape, etc.). Include a broad world set PLUS
strong coverage of Africa and Zimbabwe. NO external image references — inline SVG only.
Also include `FF.data.capitals = [ { country, capital, options:[4], answer } ]` (80+) if convenient,
else capital data can be derived from `countries` (each has name + capital). `neighbors` enables the
"Country Neighbours" game.

### `FF.data.party` (js/data/party.js)
```js
FF.data.party = {
  charades: [ { word, category } ],  // 150+
  dontSayIt: [ { word, forbidden:[4 strings], category } ],  // 80+
  drawingPrompts: [ 'bicycle', ... ],  // 120+ (simple nouns, easy to draw)
  pictionary: [ { word, category, hint } ],  // 120+
  wouldYouRather: [ { a, b, aIcon:'🏝️', bIcon:'🏔️' } ],  // 120+ (aIcon/bIcon are emoji)
  thisOrThat: [ { a, b, aIcon, bIcon } ],  // 100+
  whoIsMostLikely: [ 'Forget where they put their phone?', ... ],  // 80+
  finishSentence: [ 'The best thing about weekends is...', ... ],  // 60+
  describeIt: [ { word, category } ]  // 80+
};
```

### `FF.data.visual` (js/data/visual.js)
```js
FF.data.visual = {
  animals: [ { name, svg, fact, category } ],   // 30+ (category: Mammals/Birds/Reptiles/Fish/Insects/Marine)
  food: [ { name, svg, origin, fact } ],        // 30+ (include Sadza, Jollof rice, etc.)
  landmarks: [ { name, country, city, fact, svg } ],  // 20+ (Victoria Falls, Eiffel Tower, Pyramids, Taj Mahal, ...)
  objects: [ { name, svg, fact } ],             // 30+ (household objects)
  sports: [ { name, svg } ],                    // 16+
  vehicles: [ { name, svg } ],                  // 20+
  visualRiddles: [ { type, question, options:[4], answer, svg } ],  // 30+ (what comes next / odd one out / which completes pattern / which shadow / which doesn't belong)
  visualCharades: [ { name, svg } ]             // 40+
};
```
SVG illustrations: viewBox `"0 0 200 200"`, flat vector style, suitable for all ages, high contrast,
recognisable silhouette, 2-6 colours, NO text, NO watermark. Keep each SVG under ~2KB. A
simple-but-clear illustration is better than an elaborate broken one. Example skeleton:
`'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e0f2fe"/>...shapes...</svg>'`.
Prefer a light rounded background so illustrations look good in dark mode.

---

## Checklist before you finish

- [ ] File parses (`node --check`), uses only the global `FF` namespace.
- [ ] No fetch/import/export/require, no remote URLs, no `?.`/`??`.
- [ ] Data shapes match the contracts above exactly (property names and casing).
- [ ] Games register with a valid `start` and call `api.end(...)`.
- [ ] Family-friendly, non-explicit content throughout.
- [ ] No "TODO"/"placeholder"/"coming soon" text.
- [ ] Screens use `FF.GameUI` and design tokens: no hardcoded hex colours, no injected `<style>`,
      no emoji in buttons, no ALL CAPS, and every user-facing string goes through `FF.t()`.
- [ ] Works at 360 px wide with no horizontal scrolling, and every control is at least 44 px.

Write the file now. Be complete and generous with content — quality and quantity both matter.

## Players, avatars and accounts (for game code)

- Read players with `api.config.players` (the people **in** this game, as `FF.Players.get()`). Never
  call `FF.Players.save()` with that list: it is a subset of the saved roster.
- Show a player's picture with `FF.Players.avatarEl(player, 'your-class')`, and give that
  class a size in CSS. Never print `player.avatar` as text: it is a character id like `fox`.
- No emoji in UI text (status lines, buttons, banners). Use `FF.Icons.icon(name)`.
- Account data is per user: `FF.Storage.get/set` is already scoped to the signed-in account.
