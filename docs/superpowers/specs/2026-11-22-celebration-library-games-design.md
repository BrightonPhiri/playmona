# Celebrations: games from the library — design

Date: 2026-11-22. Branch `feat/celebrations-library-games`.

## Why

Organisers want more games at a celebration than the three made for it (Picture Rush, Word by Word,
Quiz). PlayMona already has a library of finished games (Verse Rush, Bible Quiz, Guess It!, …).
Brighton: "if I want users to play Verse Rush I should be able to pick it and add it to the list of
games that we will play during the function. Good thing is the games are already built."

Success: an organiser adds Verse Rush to the event's Games list in a few taps; at the party the MC
starts it, every group plays the same Verse Rush on their phones, and the result lands on the event
leaderboard and the TV like any other celebration game.

## Goals

- Organiser Games tab: "Add a game" also offers **From the game library**, a list of eligible
  library games with their covers. Picking one adds it to the event's games like any template.
- Played on **phones, scored** (Brighton's pick): when the MC starts it, every group plays the same
  seeded run of that game on their own phones at the same time.
- The result counts on the event leaderboard and shows on the TV and the MC panel.
- One generic piece serves every eligible library game; the games themselves stay unchanged.

## Non-goals

- No change to how library games play, look or score.
- No game-specific options at first (Guess It! topic, Quiz Mix topics): a game plays its standard
  deal. Can come later through the existing challenge `dealOptions`.
- Celebration runs do not count on PlayMona's daily/weekly leaderboards or stats.
- Party/"everyone" games (Imposters, WordFlow, Charades …) are not offered.

## Anti-goals

- Anything that makes the existing three templates, the TV or the MC less reliable.
- Guests hitting the paywall, guest limits or a sign-up screen when they tap Play.
- Groups getting different questions.

## Approaches (picked: A)

- **A. Hand off to the game page (picked).** The guest phone shows a Get ready card with Play;
  it opens `play.html` with the run attached; the game plays as in the library from the shared
  seed (the challenge machinery); the results screen sends the score and offers "Back to the party".
  One piece for every game, games untouched; costs one page switch and one tap back.
- B. Load the game inside the event page. No page switch, but pulls the whole game shell (163 vs 36
  scripts, menus, access checks) into a page not built for it. Fragile.
- C. play.html in a frame on the event page. No switch, but phone scrolling, keyboard and
  full-screen trouble, and every game would need checking inside a frame.

## How it works

### The template

A new celebration template `library`. Its config: `{ game, minutes, prize }`.

- `game`: a library game id. The server accepts only ids on its leaderboard list
  (`Leaderboards.php`), and the organiser's picker shows only games that are on that list, solo,
  switched on (`FF.Leaderboards.active`) and not excluded below.
- `minutes`: time to play, `[5, 10, 15, 20]`, default 10. *(Claude's call.)*
- `prize`: points for first place, `[1000, 2000, 3000, 5000]`, default 3000. *(Claude's call: the
  Quiz gives 500 a question and Picture Rush about 1500 a round, so 3000 keeps a library game in
  line with them.)*
- Name defaults to the game's own name; instructions default to a line such as
  "Every group plays {game} on their phone. Same questions for everyone. Best score wins."
- Ready to publish as soon as a game is chosen.
- Cover: the game's own cover (`assets/images/covers/<id>.webp`) wherever celebration covers show
  (`FF.Celebrate.gameArt/gameCover` take the game id for library games).

### Running it (referee)

Same pattern as the other templates: `FF.CelebrateReferees.library` in
`js/celebrate/library/{rules,referee}.js`, run by the crew runner (in dev, the organiser/MC tab).

- At start the referee makes the shared seed and writes `celebrations/<cid>/run`:
  `{ runId, template:'library', game, phase, startAt, endsAt, finished: { teamId: {score, by} }, total }`
  where `total` is the number of teams playing. The ready gate and 10 s countdown work as today.
- Phones send one command to `inbox/<uid>`: `score { score, ms }`. The referee keeps the **first**
  score per uid; a team's score is its **best** member score. *(Claude's call.)* The score is the
  phone's own report; the server cannot check it, which is fine for a party.
- It ends when every team has a score, when `endsAt` passes, or when the MC presses End.
- Ranking: by best score, then by who finished first; equal scores share a place. Points by place
  *(Claude's call)*: `round(prize × (n − place + 1) / n)` to the nearest 10, where n is the number
  of teams that finished; teams with no score get 0. Reported through the existing
  `recordResult` (`rounds` = one round, `ranked`), so the leaderboard and last-result work unchanged.

### The guest phone

- Event page: a `library` player for the run shows the Get ready card (cover, name, instructions,
  "Same questions for every group. One go each.", time to play) and a **Play** button once the
  countdown ends. After the guest's score is in it shows "Your score is in" and the live standings;
  when the run ends, the usual results.
- Play opens the game page with the run in the URL fragment (cid, runId, game, seed, uid, return
  link). The game page starts that game with `config.celebration`: deals from the run's seed like a
  challenge (`sharedDeal`, standard settings), skips access checks, guest limits and the paywall
  (as `_checksAccess` does for challenges), and is not recorded on leaderboards or as a
  friend challenge (the phone's own play stats still count it). Games see it as a challenge
  (`config.challenge.celebration`), so they skip their own setup screens and play the standard deal.
- On the results screen it sends `score` to `inbox/<uid>` through `FF.Transport` on
  `celebrations/<cid>`, shows "Score sent", and a **Back to the party** button to the event page.
  If sending fails it retries and keeps the button.
- One go each: once that uid has sent a score, Play is gone. Coming back to the event page
  mid-run without a score shows Play again. Restarting before sending is not blocked.
- If the run has ended by the time the results show, the phone says the time is up and offers
  Back to the party.

### TV and MC

- TV scene for `library`: the game's cover and name, "Playing on your phones", the time left,
  "3 of 5 groups finished", and the groups' best scores as they arrive. The end and winner screens
  are the existing ones.
- MC panel: library games in the start list with their cover and "On phones · {minutes} min";
  while live, the finished count and End.

## Constraints

- Firebase Spark, 100 connections: the game page opens its RTDB connection only to send the score
  and closes it after.
- Only the crew runner and phones' inbox writes touch RTDB, as today. The crew runner's script list
  and the database rules generator must include the new template (see how quiz was added).
- Classic scripts, ES2017 or older; FF.UI/FF.GameUI styling; strings through `t()`.
- Clean URLs (no `.html` in links people see).

## Left to the builder

- Exact eligibility filter (which categories to exclude) beyond "on the leaderboard list, solo".
- Where the celebration hook sits in `GameFlow` (seed, access, results) and how results expose the
  player's score for each game.
- TV and phone layout details, within the existing celebration look.
- Tests: rules (ranking, place points, best-of-team, first-score-only), server sanitize/ready for
  `library`, and a two-tab dev run.
