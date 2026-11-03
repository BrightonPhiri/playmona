# Challenge a friend, on any game — design

Date: 2026-11-03. Branch: `feat/challenge-any-game` (from `origin/main` at 5777b30).
Mockups: [mockups/invite-screen.html](mockups/invite-screen.html) (option C chosen) and
[mockups/share-card.html](mockups/share-card.html). They were shown inside the brainstorm frame, so the cover
images load from `/files/`; open them next to the `.webp` files in `mockups/` (or fix the URLs) to view.

## Intent

Today "Challenge a friend" only plays 10 quiz questions by topic. Brighton wants
**any game he plays** to be challengeable, and the experience to look so good
that people who see it want to play PlayMona too. The friend must get a lovely,
catchy invite ("Brighton has challenged you!"), and either side can download a
brag image to post to a WhatsApp status, Instagram story or group chat.

Success: someone finishes a game, taps "Challenge a friend", sends a link; the
friend opens it, sees a golden-ticket invite, plays the exact same game content,
sees a winner reveal, and shares an image whose QR code pulls new people in.

## Goals

1. Every **challenge-eligible game** can be challenged (definition below).
2. Two ways to start: from the **results screen** of any eligible game (main
   path: play first, decide after), and from a **game picker** on the Challenge
   a friend page (pick, play, send).
3. The friend's **invite screen** in the golden-ticket style (mockup C).
4. Rotating catchy **taglines** and **main-button labels**.
5. A **winner reveal** after the friend plays, with "Challenge them back".
6. A **brag image** (download or share), story and square sizes, with a QR code
   into the same challenge. Built as a reusable card maker.
7. Old quiz challenge links keep working.

## Non-goals (this project)

- Using the card maker for the daily challenge, leaderboard places, personal
  bests, badges or Imposters wins. The card maker must make those easy later;
  each is a small follow-up.
- Party, creative/drawing and live-only games (Imposters, room-only games).
- Challenges between more than "you vs. one score" on the invite. A link can be
  played by many friends; the sender's list shows them all, but each friend's
  invite and reveal compare only against the sender.
- Anti-cheat beyond what exists (score caps, one result per player per challenge).

## Anti-goals (a failure even if it works)

- The friend gets **different content** than the sender, so the scores are not
  a fair fight.
- A "Challenge a friend" button that appears and then says "this doesn't count".
  If a run can't be a fair challenge, the button is simply not there.
- A plain, generic-looking invite or image. Looks are the point.
- Breaking challenge links people have already sent.

## Decided with Brighton

- Invite style: **golden ticket** (mockup C). The game's cover art at the top,
  its name on a yellow chip; sender avatar + tagline + short line; a dashed tear
  line with notches; stub with "Score to beat" and when it was sent; one big
  primary button and a ghost "Not now".
- Taglines and button labels are **interchangeable**, drawn from sets:
  - Taglines (examples): "{name} has challenged you!", "{name} dares you to
    beat this", "You've been called out by {name}", "{name} thinks they can
    beat you". Add a few more in the same playful voice.
  - Buttons: "Accept the challenge", "Take them on", "I'm in".
- "Any game" = the games the daily challenge / leaderboards already treat as
  fair: solo-capable, not party/creative (`FF.Leaderboards.eligible`), switched
  on in admin. Played on **standard settings**, one player.
- Entry points: results screen button (next to Play again) + game picker on the
  Challenge a friend page + "Challenge them back" after a reveal.
- Winner reveal: both avatars side by side, scores count up; a win gets confetti
  and a line like "You beat Brighton!"; a loss "Brighton holds the crown" with a
  rematch button; account holders see results in their challenges list.
- Brag image with: PlayMona logo and dots, game cover + name chip, verdict
  headline with the margin ("Kuda beat Brighton by 320 points!"), both avatars
  with a crown on the winner, VS badge, 2–3 game stats, and a white footer strip
  with a **QR code to that exact challenge**, a hook line ("Think you can beat
  1,560?") and playmona.com. Variants: won (confetti), sent/dare (sender vs
  "?"), close result line ("Only 20 points in it"). Story 1080×1920 by default,
  square 1080×1080 option. "Save image" downloads; "Share" uses the share sheet
  with the file where the browser supports it.

## How it works

### Fair content: seed every eligible solo run

The daily challenge already seeds a run with
`FF.Random.roundSeed('daily|' + date, gameId, 'init')` in `FF.GameFlow.start`
(js/registry.js), and eligible games already use `FF.Random`, not Math.random.

- In `GameFlow.start`, when the run is a **challenge-candidate** (not room, not
  daily, not tournament, eligible game, solo, standard settings), pick a fresh
  seed with `FF.Random.newSeed()`, store it on `config.challengeSeed`, and seed
  with `roundSeed('ch|' + seed, gameId, 'init')`. Unseed at the end as the daily
  does. This is what lets "play first, challenge after" work.
- A challenge run (`overrides.challenge = { id, seed, ... }`) forces standard
  settings like `overrides.daily` does in `buildConfig`, and seeds from the
  challenge's seed the same way.
- **Not every game deals from the seed alone yet** (builder check). Some read
  per-device state: js/games/memoryGames.js (`mmSurpriseDeck` uses Math.random
  and the last deck; `mmDeal` pushes this phone's recent cards back unless
  `shared`), js/games/quizMix.js (seen-questions list `SEEN_KEY`, saved topics
  `TOPICS_KEY`). *Claude's call:* add one flag, `config.sharedDeal`, true for
  room, daily and challenge runs and for every challenge-candidate run, and make
  each eligible game skip per-device history, saved choices and Math.random when
  it is set (memory's existing `shared` path is the model). Audit every eligible
  game in this project, since Brighton asked for any game; this also fixes the
  daily. Add a test that deals each eligible game twice from the same seed, with
  different device storage, and compares the content. A game that can't pass is
  kept off challenges (and noted) rather than shipped unfair.
- **Per-game choices** (quizMix topics, memory deck, and the like) use the
  game's defaults on a shared deal. *Claude's call:* not recorded in the link.
- **Content drift.** *Claude's call:* the link carries no content version. A
  link opened after a question bank changes may deal slightly different
  content. That is rare and acceptable for now.
- Whether a finished run can become a challenge reuses
  `FF.Leaderboards.unrankedReason(config)` minus the account check (a separate
  check gates the feature for guests, below).

### The link

Keep `#challenge=<code>`, base64url JSON. New version `v: 2` adds `g` (game id)
and optional stats. `v: 1` codes are decoded as quiz-topic challenges and still
play through `FF.QuizRun`, so old links work. The tagline/button variant is
derived from a hash of the challenge id, so the same link always reads the same
on every device.

Unknown or disabled game id in a link → the friendly "not in this version yet /
not available" message, like the daily's. *Claude's call:* "eligible" means
`FF.Leaderboards.active()` (enabled and not taken off leaderboards in admin),
and the admin `challenge` feature switch turns the whole feature off.

### Screens

- **Results screen** (`GameFlow.showResults`, non-room, non-daily branch): a
  "Challenge a friend" button (icon `swords`) when the run is challenge-ready.
  Tapping it saves the challenge record and goes to the send screen.
- **Challenge a friend page** (`challenges` view in js/social.js): the topic
  grid becomes a game picker using the same cover cards as the Games page, with
  "Quiz by topic" as one entry that opens the existing topic choice. Below it,
  "Your challenges" as tickets (game, your score, who has played).
- **Send screen** (`challenge` view, role `sent`): your own golden ticket as a
  preview, a Send button (share sheet / copy), WhatsApp, the copy-link box, and
  "Save image".
- **Invite screen** (`challenge` view, received and unplayed): the golden
  ticket. The button launches the game with `overrides.challenge`.
- **Reveal** (`challenge` view, received and played; also the sender's view of
  a friend's result): avatars, count-up scores, verdict, confetti on a win,
  "Challenge them back", "Save image".
- Leaving a challenge game early counts the points so far, like the daily.
- **Access (Brighton's decision):** a received link **unlocks its game once**,
  like the daily's game is free that day. Accepting a challenge skips
  `FF.Access.canPlay` and does not use up a free play (`usePlay`), whatever the
  game's tier or the friend's remaining plays. Only that one accepted run;
  "Play again" afterwards goes through the normal access checks. Sending a
  challenge from the picker still needs normal access to the game.

### Results stored

`challenges/<id>/<uid>` keeps working, but the rules change: score cap
1,000,000 (the leaderboard `SCORE` check) instead of 1500, `correct` optional,
new `game` string. Edit `tools/gen-rules.js` and splice only the changed key
into `database.rules.json` (it holds hand-added Imposters/chat rules). The
local challenges list stores `game`, `seed`, `me`, `from`, and stats.

### Brag image: `FF.ShareCard`

A new module (js/shareCard.js) that draws onto a `<canvas>` and returns a
Blob/data URL. Input: `{ size: 'story'|'square', game, verdict, sub, players:
[{name, avatar, score, winner}], stats: [{value, label}], footer: {hook, url} }`.
It draws the brand background, cover art (`FF.Assets` cover, falling back to a
category wash), avatars (preset avatar images or initials), the QR code
(`FF.QR` / js/vendor/qrcode.js, drawn as modules onto the canvas), and waits for
fonts (Fredoka/Nunito) before drawing. Same-origin images only, so the canvas is
never tainted. Stats come from the game's results (`bestStreak`, `fastest`,
`mostWords`, `quizCorrect`, plus anything a game adds); none → score only.

## Constraints

- Vanilla ES5-style classic scripts, no build step (see DEV_GUIDE.md).
- Colours only from css/tokens.css; app screens use `FF.UI`; strings via
  `FF.t(key, fallback)`; sentence case; icons, not emoji, in buttons. Run
  `node tools/contrast-check.js` after colour changes.
- New scripts go in index.html/play.html and `tools/test-seed.html`.
- Guests: the challenge feature stays account-only as today
  (`GUEST_FEATURES.challenge = false`). The results-screen button for a guest
  opens the existing "create a free account" lock message. A guest can still
  open and play a received link (as today) but results aren't posted.
- Reduce-motion: no count-up or confetti, show the final state.
- Works at phone width; the invite fits one phone screen without scrolling.

## Left to the builder

- Exact copy beyond the examples, and the full tagline set.
- Per-game stat labels and which 2–3 to show.
- Layout details of the picker and challenges list, within the design system.
- Tests: decode v1/v2 links, eligibility of a run, seeded runs dealing the same
  content twice, rules for the new result shape, share card renders without
  throwing.
