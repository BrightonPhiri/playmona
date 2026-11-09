# Logo Rush — a new "name that brand" game

## Context
Brighton wants a game where players see a company/brand logo and name it (YouTube, Google, Airbnb, Amazon, Nike…).
No logo game exists on main (checked `origin/main` aa87d46), so this is a new game, built to the GeoSpin / Mini
Crossword standard: same look, solo + local + online rooms with a server referee, daily game, challenges,
leaderboards, Expert spelling level.

Decisions Brighton made (2026-11-09):
- **Symbol first:** show the brand's symbol with no name (Nike swoosh, YouTube play button, Google "G",
  Amazon smile). The full logo (with the name) appears at the reveal. Brands that only have a wordmark
  get a zoomed-in crop that hides most letters, or are left out.
- **All four answer styles:** pick from choices, letter tiles, type it (Expert), say it out loud (party).
- **Brands:** global + African + football clubs, in categories.
- **Online rooms from the start.**

Working name: **Logo Rush** (id `logoRush`). My call; easy to rename before launch.

## How it plays

### Setup screen (GeoSpin-style setup card)
- **Answer style:** Choices · Letter tiles (standard) · Type it (Expert) · Say it out loud (everyone mode only).
- **Categories (multi-pick, default Mixed):**
  Tech & apps · Social & media · Food & drink · Fashion & sportswear · Cars & motoring ·
  Shops & retail · Entertainment & games · Travel & airlines · Banks & money · African brands ·
  Football clubs. Each button shows its logo count (like crossword packs).
- **Level:** Easy (tier 1, household names, 4 choices) · Normal (tiers 1–2, standard, 6 choices) · Hard (tiers 2–3,
  look-alike decoys, 8 choices). Expert is the Type it answer style (+6 s, +50). *(Claude's call: choice count follows
  the level, as in GeoSpin.)*
- **Time per logo:** Quick / Normal / Relaxed / No limit = 5 / 8 / 12 s for choices, 12 / 20 / 30 s for tiles and
  typing (standard Normal). Timeout = wrong. *(Claude's call: spelling needs longer than picking.)*
- **Twists (optional, one at a time):** Zoom out (starts zoomed into a corner and pulls back; faster = more
  points) · Flash (symbol hides after 1.5 s, +25) · Colourless (shown as a grey silhouette, +25).
- Rounds: 10 / 15 / 20 (standard 10).

### In play (GeoSpin layout)
Top bar (round, timer ring, score) → stage card with the logo on a soft tile (white or dark backdrop per logo
so it reads) → answer panel below (choice buttons, letter tiles, or text box). On phones the stage shrinks to
fit, like GeoSpin `fitPhone()`. Desktop from 900 px: stage left, panel right.

### Reveal
The symbol animates into the full logo (wordmark), with the brand name, category, and a one-line fact
("Founded 1998 in a garage in California"). Right/wrong colouring, points pop.

### Say it out loud (party mode, one screen)
Logo shows big; everyone shouts; the host taps the player who got it first (or "Nobody"). Then reveal.
No microphone. Reuses the host-judges pattern from the existing party games (see Reuse).

### Points
100 × level (1/2/3) + up to 50 speed bonus; twist bonuses as above. Daily, challenge and leaderboards play
STANDARD only (Letter tiles, Normal level, Normal time, Mixed, no twist). Choice and Say-it-out-loud never count for
leaderboards (same rule as GeoSpin choice mode).

### Online rooms
Race (everyone answers the same logo, fastest right answer scores most), with a server referee like GeoSpin
and What's Missing. Rooms allow Choices or Letter tiles. Say it out loud stays local only.

## Logo assets
Downloaded once by a script into the repo (never hot-linked), so the game works offline and loads fast.

Sources, in order:
1. **theSVG** (github.com/glincker/thesvg, npm `thesvg`) — full-colour SVGs, 5,000+ brands, variants
   `default` (usually the symbol), `wordmark`, `mono`, `dark`. Free, no attribution required. Main source.
2. **Wikimedia Commons** — for African brands and football crests theSVG lacks; licence recorded per file.
3. **FootyLogos.com / companieslogo.com / 1000logos.net** — last resort for gaps (PNG → WebP).
   1000logos is fine to browse but its files are PNGs, often wordmarks, so it is a fallback, not the main source.

Per brand we keep two files in `assets/images/games/logoRush/`: `<id>.svg` (symbol, no name) and `<id>-full.svg`
(full logo for the reveal). Raster fallbacks become `.webp`. A brand with no clean symbol gets a
`crop` box in its data row instead.

Data file `js/data/logos.js`, row format like worldFlags:
`[id, name, category, tier 1-3, note/fact, aliases[], alike[], symbolBg]`
Aliases feed FF.AnswerMatch (e.g. "McDonalds", "Maccas"; "Man Utd", "Manchester United").
`alike` lists easily confused brands for Hard decoys (Pepsi/Korean Air, Puma/Jaguar, Audi/Olympics…).

Target size: ~320 brands — ~230 global, ~45 African (MTN, Shoprite, Safaricom, Econet, Nando's, Pick n Pay,
Dangote, Ethiopian Airlines, Jumia, Vodacom, Standard Bank…), ~45 football clubs (Premier League big six,
Barcelona, Real Madrid, Bayern, Juventus, PSG, Kaizer Chiefs, Orlando Pirates, Al Ahly, TP Mazembe…).

Tooling: `tools/logos/fetch.js` (download + record source/licence in `tools/logos/sources.json`),
`tools/logos/check.js` (every row has both files, symbol SVG contains no `<text>`, sizes under a cap,
no duplicate ids). A contact sheet HTML (`tools/logos/sheet.html`) to eyeball every symbol for name leaks.

Trademark note: logos stay their owners' trademarks. The credits section in js/app.js gets a line naming
the sources and saying brands can ask for removal.

## Answer styles in detail
- **Choices** (4 / 6 / 8 names; Hard uses `alike` decoys). Unranked, like GeoSpin choice mode.
- **Letter tiles** = standard. Slots + scrambled tiles with decoy letters; the keyboard picks tiles.
- **Type it** = Expert. A plain text box, no tiles, checked by `FF.AnswerMatch` (forgives small typos),
  +6 s, +50. Added to the Done list in `docs/expert-levels.md` in the same commit.
- **Say it out loud** = local "everyone" mode only. Logo shows big, a short countdown, then the host taps the
  avatar of whoever said it first, or "Nobody". Then the reveal. New small piece (nothing in the app does
  "tap who got it" yet), built in the Logo Rush file.

## Build

Work in a scratchpad worktree off `origin/main`, branch `feat/logo-rush` (the OneDrive checkout is behind and
git there fails on `js`). First step after approval: save this design as
`docs/superpowers/specs/2026-11-09-logo-rush-design.md`, then write the task plan with superpowers:writing-plans
in `docs/superpowers/plans/2026-11-09-logo-rush.md`, following the crossword plan's Task 7–8 online checklist.

### 1. Brands and data
- `js/data/logos.js` → `FF.data.logos` (rows as above, `CATEGORIES`, `ALIKE` groups), and aliases in the row.
- Facts written per brand, one line each, checked for accuracy.
- Never list one alias under two brands (AnswerMatch rule).

### 2. Logo files
- `tools/logos/fetch.js`: reads the brand list, pulls theSVG (`default` → `<id>.svg`, `wordmark` →
  `<id>-full.svg`) via npm/jsDelivr, then Wikimedia Commons for the rest; records URL + licence in
  `tools/logos/sources.json`. Downloads go to their own folder in the scratchpad, are checked, then copied in.
- SVGs cleaned (strip scripts, comments, `<text>` in symbols) and size-capped; PNG fallbacks → WebP.
- `tools/logos/check.js` + `tools/logos/sheet.html` contact sheet. **Brighton reviews the sheet** for any
  symbol that still shows the name or looks wrong, before the game screen is built on it.
- Files in `assets/images/games/logoRush/`; preload the next logo like `visualGames.js` `preloadImage()`.

### 3. Rules — `js/logorush/rules.js` (`FF.LogoRushRules`)
Pure and shared with the server: `MODES`, `LEVELS`, `CHOICES`, `STANDARD`, seeded `deal(settings, seed, k)`,
`choices(...)`, `tiles(...)`, `check(...)` (via `FF.AnswerMatch`), `points(...)`, twist settings, `sanitizeRoom`.

### 4. Game screen — `js/games/logoRush.js`
Copy GeoSpin's structure, not its globe: `frame()` with `lr-shell`, two-tone brand "Logo / Rush" in the top
bar, chips, sound; `setupScreen()` with `.is-on` toggle groups and the big gold Go button, saved to
`logoRush:setup`; `play()` with the timer ring, stage card, answer panel (reuse
`FF.GeoSpinGame.letterBoard` / `choiceBoard`, which already match this look), reveal card (symbol → full logo,
name, category, fact, points count-up), recap ring + "to learn" list + confetti; phone fit like `fitPhone()`.
CSS in `css/games.css` with an `lr-` prefix that re-points the `--gs-*` tokens, like Letter Rush does.
Modes: solo, turn, everyone (party). Key handler in the capture phase (Backspace is the app's back key).

### 5. Online rooms (server referee, mirror GeoSpin)
- JS: `js/logorush/referee.js`, `client.js`, `dev.js`; view `rooms/<code>/lr`, inbox `lrInbox`; answers as
  strings. Screen draws a phase only when `ready(view)`.
- PHP: `api/lib/LogoRush.php` (constants match `rules.js`, a PHP test compares them), wired in `bootstrap.php`,
  `Routes.php`, `EngineRoutes.php`, `Db.php`, `api/cron.php`.
- `Crew::ONLINE_GAMES` + `roomUI.js ONLINE_GAMES` (no crew brain), `api/crew/lib/loader.js`,
  `api/crew/runner.js` (`logorushRuns` / `logorushState`), `database.rules.json` `lrInbox` rule **added by hand**
  after `cwInbox`.

### 6. Wiring
- `FF.registerGame` entry (category `quiz`, `leaderboard: true`, `room: ROOM`), icon in `js/icons.js`, scripts in
  `play.html`, `admin.html`, `tools/test-seed.html`, `tools/load-check.js`.
- Daily/challenge play `R.STANDARD`; `api/lib/Leaderboards.php::GAMES` + `FF.Leaderboards.eligible`.
- Credits line in `js/app.js` (near "Brand and characters"): logo sources, trademarks belong to their owners,
  brands can ask for removal.
- Cover: prompt pack `docs/art/logoRush-prompts.md` + `tools/art/logoRush.json` (made-up logos only; image
  models garble real ones). Brighton makes it in Codex; then `node tools/gen-asset-manifest.js`.

### 7. Tests
`tools/test/logoRush.test.js` (data rows, every file exists, no alias clash, every answer spellable from its
tiles, deals seeded and repeatable, choices never repeat the answer, cover exists), `logoRush.referee.test.js`,
`tools/api/logoRush.test.php` (required from `tools/api/test.php`).

## Verification
- `node tools/test/run.js` and `php tools/api/test.php` pass.
- `node tools/logos/check.js` clean; contact sheet reviewed by Brighton.
- Preview `/play` (not `/play.html`): each answer style, each twist, Expert typos, party mode with 3 players,
  daily run, a challenge link, phone width 375 px and desktop 1280 px, light and dark.
- Two-tab dev room Race game (see two-tab testing notes): both tabs see the same logo, server scores right.
- Then PR → merge to main deploys and publishes rules.
