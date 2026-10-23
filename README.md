# PlayMona

**Games for everyone. Everywhere.** · [playmona.com](https://playmona.com)

PlayMona is a growing hub of casual games: quizzes, word games, party games, puzzles and more.
Play on your own, pass one screen around the room, or play online with everyone on their
own phone. It is a static web app with no build step.

---

## What's included

- **A growing library of games** across 10 categories (Words, Quiz, Visual, Memory, Reaction, Creative, Numbers,
  Party, World, Bible).
- **Accounts**: email or username + password, or Google. The profile holds your character,
  level, streak, medals and stats, and syncs between devices.
- **Guest play**: play without an account; progress stays on the device and moves into the
  account if the guest signs up later.
- **Install as an app** from the landing page banner or Settings › About (Chrome, Edge,
  Samsung Internet; step-by-step help on iPhone and iPad).
- **Saved players**: keep up to 24 regular players and tap who is in each game (1–8). Nobody is
  deleted to play alone. Teams of 2–4.
- **Dashboard**: level and XP, weekly activity, favourite kinds of game, medals.
- **Online rooms**: share a code or QR; everyone answers on their own phone (Firebase).
- **Daily challenge**: 10 questions a day, the same for everyone, one try, daily leaderboard.
- **Challenge a friend**: play 10 questions, send a link (or WhatsApp); your friend plays the
  same questions and tries to beat your score. Works for guests too.
- Quick match, Leagues and Tournaments are placeholders for now.
- **Game Night** tournaments, **Quick Play** and **Quick Round**.
- **48 characters** to pick from, light and dark themes, accent colours, larger text options.
- **TV and D-pad support**, sound effects and music, reduce-motion support.
- **Works offline** once you have signed in on a device (service worker + local copy of your data).
- **Guest limits**: guests play a starter set of games; other games, online play, the daily
  challenge, challenges and Game Night invite them to create a free account. The admin portal
  decides which games and features guests get (`js/gameConfig.js`).
- **Admin portal** at `/admin`: usage stats, game on/off switches, players (suspend/restore),
  live rooms, announcements and maintenance mode. See *Admin portal* below.

---

## Pages

| File | What it is |
|------|------------|
| `index.html` | Public landing page for playmona.com (`js/landing.js`): rotating hero pictures, live player count, install banner. |
| `play.html` | The app: sign-in, home, games, online rooms, profile, settings. |
| `privacy.html` | Privacy notice (draft, needs a legal review before launch). |
| `admin.html` | Admin portal (`js/admin/*`, `css/admin.css`). Admins only, not indexed. |
| `manifest.webmanifest`, `sw.js` | Install to home screen and offline support. |

The live site uses clean addresses without file extensions: `/play`, `/privacy`, `/admin`
(nginx maps them to the `.html` files and redirects old `.html` links; see `docs/deploy.md`).
`/play?view=signup` opens sign-up and `/play?view=guest` starts guest play.
Old shared room links (`index.html#room=ABC123`) are forwarded to `/play`.

---

## How to run

Serve the folder with the preview server, which has the same clean URLs as the live site:

```bash
node tools/serve.js
```

Then open <http://localhost:8960/>. Opening `play.html` straight from disk (`file://`) also works,
with device-only accounts and no offline cache.

### Accounts in development

With a Firebase config in `js/net/firebase-config.js`, accounts use Firebase Authentication.
To test without touching your Firebase project, switch on **device-only accounts** in the
browser console and reload:

```js
FF.Storage.set('devAuth', true)
```

Device-only accounts live in that browser only. They are also what the app uses when no
Firebase config is present.

Setting up Firebase (sign-in methods, authorised domains, database rules): see
**`FIREBASE_SETUP.md`** and **`database.rules.json`**.

---

## File structure

```text
├── index.html / play.html / privacy.html
├── manifest.webmanifest, sw.js
├── database.rules.json        # Firebase Realtime Database rules
├── css/
│   ├── tokens.css             # design tokens (brand navy, accents, light/dark)
│   ├── styles.css             # app shell and shared components
│   ├── games.css, room.css    # game screens, online rooms
│   ├── brand.css              # wordmark, sign-in, avatars, dashboard, profile, tabs
│   └── landing.css            # landing and privacy pages
├── js/
│   ├── core.js, ui-kit.js     # FF namespace, DOM helpers, dialogs, toasts
│   ├── storage.js             # localStorage, scoped per account (playmona:u:<uid>:key)
│   ├── auth.js, authUI.js     # accounts (Firebase or device-only) and sign-in screens
│   ├── sync.js                # syncs account data to /users/{uid}/data
│   ├── avatars.js             # the 48 characters
│   ├── players.js             # saved players, who is playing, teams
│   ├── scoring.js             # scoring, stats, XP and levels, medals
│   ├── registry.js            # game registry, game shell, results, Game Night
│   ├── app.js                 # home, dashboard, library, profile, settings
│   ├── net/                   # online rooms (Firebase transport, race mode, voice)
│   ├── data/                  # content (quiz, words, countries, party, visual, bible, avatars)
│   └── games/                 # one module per category
├── assets/
│   ├── brand/                 # logo mark, app icons, favicons, social image
│   ├── avatars/               # character art (generated by tools/gen-brand-assets.py)
│   └── images/                # covers, category art, backgrounds
└── tools/                     # tests, load check, contrast check, asset generators
```

Plain HTML, CSS and JavaScript on one global `FF` namespace (classic scripts, no ES modules).

---

## Deploying

Pushing to `main` on GitHub deploys playmona.com automatically. One-time setup (server user,
GitHub secrets, nginx clean URLs) is in [docs/deploy.md](docs/deploy.md). The plan for what comes
next is in [docs/roadmap.md](docs/roadmap.md).

---

## Admin portal

Open `playmona.com/admin` while signed in to PlayMona. Anyone who is not an admin sees only
"No access". To add an admin, they sign in and open `playmona.com/admin#setup`, which shows
their account id. In the Firebase console → Realtime Database, add `admins → <that id> → true`,
then press *Check again*. Only the Firebase console can make
admins; the rules stop anyone making themselves one.

- **Overview**: active players (accounts and guests), games played, sign-ups, installs, rooms,
  charts by day, top games. Counts are written by `js/track.js` (UTC days, counts only).
- **Games**: on/off, guest access, access tier and free plays (used once payments arrive), New/Hot badges.
- **Players**: search, recent and newest players, suspend and restore.
- **Live rooms**: rooms open right now.
- **Site**: home-screen announcement, maintenance mode, which features guests may use.

With device-only accounts (`devAuth`, or `file://`) the portal shows this browser's own test data.

---

## Adding a new game

1. Pick (or create) a file in `js/games/`.
2. Call `FF.registerGame({ ... })` with the game's metadata and a `start(api)` function.
3. Add `<script src="js/games/yourFile.js"></script>` to `play.html` (before `js/app.js`) and
   to the `ORDER` list in `tools/load-check.js`.

Read **`DEV_GUIDE.md`** for the complete `api` reference.

---

## Content

All content is data in `js/data/` (quiz, words, countries, party, visual, bible). Edit the arrays
directly. Keep content suitable for all ages.

---

## Checks

```bash
node tools/test/run.js
```

```bash
node tools/load-check.js
```

```bash
node tools/contrast-check.js
```

`tools/test-seed.html` (served) checks that online race games generate identical rounds on
every device.
