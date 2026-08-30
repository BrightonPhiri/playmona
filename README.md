# 🎮 FAMILY FUN

**Games for everyone. Play together. Laugh together.**

Family Fun is a complete, offline-first **family game hub** — a TV game console, board-game
collection, quiz show and party-game hub in one. It runs straight from a single folder with no
server, no build step, no account, and no internet connection.

---

## ✨ What's included

- **41 fully playable games** across 9 categories (Words, Quiz, Visual, Memory, Reaction,
  Creative, Numbers, Party, World).
- **Players & teams** — up to 8 players, 2–4 teams, custom avatars, colours and names.
- **Universal scoring engine** — base points, speed bonus, streak bonus, perfect-round bonus,
  difficulty bonus, animated score chips and a live leaderboard.
- **Game Night** — a multi-round tournament (3/5/10 rounds) with an overall champion and
  automatic tie-breaker.
- **Quick Play / Quick Round** — jump into a random game instantly.
- **Light / Dark / System themes** + 6 accent colours, saved locally.
- **TV / D-pad support** — arrow keys, Enter and Back behave like an Android TV remote with
  obvious focus states; works on desktops, tablets, phones and TVs.
- **Sound & music** — Web Audio API sound effects and light procedural music (no audio files).
- **Confetti, winner celebrations, achievements, stats, favourites and recently played.**
- **Fully offline** — no CDN, no remote fonts, no network requests. Turn off Wi-Fi and play.

---

## ▶️ How to run

1. Copy the whole `FamilyFun` folder anywhere (USB drive, desktop, static web host).
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari, Android TV WebView).

That's it. There is **no** build, `npm install`, or server required.

> **Optional:** if you prefer a URL, serve the folder with any static file server, e.g.
> `npx serve .` or `python -m http.server`. The app is identical either way.

Use the **⛶ Fullscreen** button (top-right) for TV play.

---

## 🗂️ File structure

```text
FamilyFun/
├── index.html                 # app entry point
├── README.md                  # this file
├── DEV_GUIDE.md               # contract for contributors
├── ASSET_MANIFEST.md          # inventory of every asset
├── IMAGE_GENERATION_PROMPTS.md# prompts to regenerate artwork
├── IMAGE_DOWNLOAD_LIST.md     # optional photo sources + licensing
├── CREDITS.md                 # attribution
├── css/
│   └── styles.css             # design system (themes, accents, TV focus, responsive)
├── js/
│   ├── core.js                # FF namespace, DOM helpers, utilities, Random
│   ├── storage.js             # safe localStorage wrapper
│   ├── theme.js               # light/dark/system + accents
│   ├── audio.js               # Web Audio SFX + procedural music
│   ├── timer.js               # reusable countdown timers
│   ├── confetti.js            # canvas confetti
│   ├── scoring.js             # scoring engine, stats, achievements, favourites
│   ├── players.js             # players + teams
│   ├── assets.js              # image fallback + inline SVG
│   ├── flagrenderer.js        # flag rendering (file flags + inline fallback)
│   ├── icons.js               # Phosphor icon set (optional style)
│   ├── icons-custom.js        # custom accent-coloured icon set (default)
│   ├── registry.js            # game registry, game shell, Game Night
│   ├── navigation.js          # view router + spatial focus (D-pad)
│   ├── app.js                 # home, library, players, settings, etc.
│   ├── data/                  # content libraries (quiz, words, countries, flagcodes, party, visual)
│   └── games/                 # one module per category of games
└── assets/
    ├── icons/                 # logo / favicon / app icon (SVG)
    ├── flags/                 # (optional) drop real flag files here — see ASSET_MANIFEST
    └── images/                # (optional) drop real photos here — see IMAGE_DOWNLOAD_LIST
```

The app is built with **plain HTML + CSS + JavaScript on a single global `FF` namespace**
(classic scripts, no ES modules, no `fetch`), so it works when opened directly from `file://`.

---

## 🎮 Adding a new game

1. Pick (or create) a file in `js/games/`.
2. Call `FF.registerGame({ ... })` with the game's metadata and a `start(api)` function:

```js
FF.registerGame({
  id: 'myGame',
  name: 'My Game',
  description: 'A short description.',
  category: 'words',                 // words|quiz|visual|memory|reaction|creative|numbers|party|world
  icon: '🎲',
  players: [1, 8],
  difficulty: 'Easy',
  duration: 3,
  modes: ['solo', 'turn', 'team'],
  defaultMode: 'turn',
  howToPlay: ['Step 1.', 'Step 2.', 'Step 3.', 'Step 4.'],
  start: function (api) {
    // Render into api.shell.root using api.ui.*
    // Score with api.scoring.add(id, points, { correct: true })
    // Finish with api.end({ results: api.scoring.results().results })
  }
});
```

3. Add `<script src="js/games/yourFile.js"></script>` to `index.html` (before `js/app.js`).

Read **`DEV_GUIDE.md`** for the complete `api` reference (shell, scoring, timers, audio, random,
assets, flags) and the hard constraints (classic scripts, no network, ES2017).

---

## ❓ Adding or editing questions

All content is data-driven in `js/data/`:

| File | What it holds |
|------|---------------|
| `js/data/quiz.js` | Quiz questions, true/false, guess-who clues, picture-quiz items |
| `js/data/words.js` | Word dictionary, scramble words, categories, missing letters, crosswords |
| `js/data/countries.js` | Countries with vector flags, capitals, facts, neighbours |
| `js/data/party.js` | Charades, Don't Say It, drawing prompts, Would You Rather, This or That, Who Is Most Likely |
| `js/data/visual.js` | SVG illustrations: animals, food, landmarks, objects |
| `js/data/visual2.js` | SVG illustrations: sports, vehicles, visual charades, visual riddles |

Edit the arrays directly — no other code changes are needed. Keep objects complete
(every required field) and remember the app is **family-friendly**.

---

## 🖼️ Adding real images (optional upgrades)

The visual games ship with original **SVG illustrations** so everything works offline out of the
box. If you want photographs for `Guess the Landmark`, `Guess the Animal`, `Guess the Food`, etc.:

1. Drop images into `assets/images/<animals|food|landmarks|objects|sports|vehicles>/`.
2. Add an entry to the asset manifest and reference the file path in the relevant `js/data/`
   entry (`svg` → keep it as a fallback, add `image: 'assets/images/...'`).

The built-in image system already handles **fallback**: real file → SVG illustration → text, so a
missing image never breaks a game. See `IMAGE_DOWNLOAD_LIST.md` for recommended, license-safe
sources and `IMAGE_GENERATION_PROMPTS.md` for regenerating artwork.

---

## 📦 Packaging for Android (later)

The app is intentionally a static web app, so it can be wrapped into an Android app / Android TV
app without changing any game code:

- **Capacitor** (recommended): `npx cap init "Family Fun" com.example.familyfun`, copy the folder
  into `www/`, then `npx cap add android`.
- **Trusted Web Activity (TWA)** via Bubblewrap, hosting the static folder.
- **Cordova** or a simple `WebView` wrapper pointed at `file:///android_asset/www/index.html`.

For Android TV, add a leanback manifest with `android.software.leanback` and map the remote's
D-pad (the app already handles arrow keys / Enter / Back).

---

## 🔒 Privacy & offline

Family Fun does **not** require an account or internet connection. Settings, players, favourites
and scores are stored in your browser's `localStorage` on this device only. No data is uploaded.

---

## ✅ Testing checklist

- [ ] Open `index.html` with Wi-Fi **off** — every game still plays.
- [ ] Theme: Light / Dark / System; accent colours apply everywhere.
- [ ] Players: add/remove/rename/recolour/reorder; teams on/off, 2–4 teams, assign.
- [ ] Every game starts, plays and reaches a results screen.
- [ ] Timers pause/resume/finish; host controls work.
- [ ] Arrow keys + Enter + Back (Esc) navigate like a TV remote.
- [ ] Resize: phone, tablet, laptop, 1920×1080.
- [ ] Fullscreen on/off; reduce-motion and sound-off still playable.
- [ ] Close and reopen — settings persist; "Reset All Data" clears them.

---

**Family Fun v1.0.0** — an offline-first family game console in a folder.
