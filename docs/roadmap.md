# PlayMona roadmap

Agreed on 2026-10-23. We work in phases; each phase ships on its own.

| Phase | What ships | Status |
|---|---|---|
| 1 | New wording (no game count), clean URLs, GitHub auto-deploy, voice chat fix, guest limits, **admin portal v1** | Built, waiting for deploy setup |
| 2 | PHP API on the VPS, **profile pictures**, **payments** with Linkwa (Plus pass and pay-once), paywall, first premium game (**Imposter**), Terms and refund pages | Built (sandbox). Imposter moved to phase 5 with the other new games. Before real payments: legal review of Terms/Refunds/Privacy, live Linkwa keys, then switch on Payments |
| 3 | **Watch link** (viewers see a TV view of the game) and **admin recording** for social clips | Later |
| 4 | **Live video chat** (LiveKit) and a TURN relay (coturn); voice gets more reliable | Later |
| 5+ | More trending games, leagues and tournaments, and the extras below | Ongoing |

---

## Phase 1 (built)

- **Wording**: "Free to play · New games all the time · No ads". No game count anywhere.
- **Clean URLs**: `/play`, `/privacy`, `/admin`; no `.html` or `.php` in addresses. Old links redirect.
- **Auto-deploy**: push to `main` → tests → upload to the VPS. Setup: [deploy.md](deploy.md).
- **Voice chat**: database rules for `voice` and `signals`, and each signalling message now gets
  its own slot (before, ICE candidates could overwrite the offer). Still needs a two-phone test
  on the live site, and a TURN server (phase 4) for some mobile networks.
- **Guest limits**: guests get a starter set of 10 games; everything else (other games, online
  play, daily challenge, challenges, Game Night) invites them to create a free account. The admin
  portal can change both lists.
- **Admin portal** (`/admin`): Overview stats, Games switches, Players (suspend/restore), Live
  rooms, Site (announcement, maintenance, guest features).

### Before Phase 1 goes live

1. Publish `database.rules.json` (Firebase console, or the optional auto-publish in deploy.md).
2. Make yourself an admin: open `/admin`, copy your account id, add `admins/<id>: true` in the
   Firebase console.
3. Test voice chat between two phones in a room.

### Known limits

- Counters are written by players' devices. Someone determined could inflate them; fine for
  now, and phase 2's server can take over the important ones (revenue never comes from these).
- Active-player lists are kept per day. At tens of thousands of players a day, the Overview
  should read pre-added totals from a nightly job instead (phase 2 server).
- Maintenance mode also hides the app from admins (the portal itself keeps working).
- Visitors are counted without sign-in, so someone could add fake visitor ids. The phase 2
  server can rate-limit this if it is ever abused.
- The player list shows accounts made before 23 Oct as "Before 23 Oct" until they come back.
  The phase 2 server can fill in exact sign-in dates from Firebase Authentication.

---

## Phase 2: server, profile pictures, payments

**Server**: `api/` in this repo, PHP 8.2 on the VPS behind nginx at `/api/` with clean addresses
(`/api/checkout`, never `.php`). Secrets in `/etc/playmona/config.local.php`. Uses Composer,
`kreait/firebase-php` (Firebase Admin), MariaDB (orders, payment log), and the Linkwa PHP files
in `Documents\www\linkwa\includes`.

**Profile pictures**: `POST /api/avatar` checks the sign-in token, accepts up to 2 MB, re-encodes
to a 256 px WebP (also strips hidden photo data), saves to `/uploads/avatars/`. Admins can remove
pictures; players can report one.

**Payments (Linkwa)**: Linkwa has hosted checkout links, a status check and a signed
`payment.completed` webhook, but **no automatic monthly charging**. So:

- **PlayMona Plus pass**, prepaid: about $1 a week, $3 a month, $25 a year. Buying again adds time.
  Reminders 3 days before and on expiry.
- **Pay once**: unlock one premium game forever (about $1.50–$2), or a pack (about $5).
- Flow: app → `/api/checkout` → Linkwa checkout → webhook and return-page status check both grant
  access (safe if both happen) → `/entitlements/<uid>` written by the server only.
- Webhooks need Linkwa's Growth plan; without it, the return-page check plus a cron job covers it.

**Suggested free and paid split**

- Free forever: most quiz, word, world, number, memory, reaction and Bible games, most party
  games, daily challenge, challenge a friend, one-screen play, online rooms up to 4, voice chat,
  profile pictures.
- Free plays then Plus (3 a day): Pictionary, Drawing Challenge, Visual Charades, Spot the
  Difference, Hidden Object, Mini Crossword, Brain Battle.
- Premium (Plus or pay once): new trending games (Imposter first), Game Night tournaments.
- Plus perks: rooms up to 12, video chat, watch links for more than 2 viewers, extra avatars and
  themes, full stats history, leagues and tournaments.

**Admin grants premium**: on the Players page, admins can give any account (or guest) Plus for a
set time, or unlock a game for them: for prizes, testers, partners and support cases. Written by
the server to `/entitlements/<uid>` with a note of which admin granted it and why.

Also before taking money: Terms of Service, refund policy, privacy notice update.

### Built (24 Oct 2026)

- **Paywall**: game tiers from the admin portal now apply. Plus games show a Plus badge; limited
  games show "N free today" and count plays per account per UTC day. A locked game opens an
  "Upgrade to play" window (Get Plus, or unlock that game when the server sells it alone). The
  paywall stays off until Site > Payments is on, except for admins (so they can test it). Guests
  keep the sign-up invitation. In rooms the host needs the game; everyone else joins free.
- **Profile photos**: Settings > Edit profile > Upload photo. The app shrinks it to 256 px, the
  server (`POST /api/avatar`) checks and redraws it, keeping one file per player in
  `uploads/avatars/`. The avatar value becomes `photo:<file>`, so it shows everywhere a
  character does. Admins can remove a photo from the Players page. Reporting photos waits for
  moderation (phase 5).
- **Terms, Refunds, Privacy**: `/terms`, `/refunds` and an updated `/privacy` (drafts, need a
  legal review). Linked from the Plus page, the unlock offer, and the site and app footers.

## Phase 3: watch link and recording

- "Invite viewers" shares `/play?watch=CODE`. Viewers are read-only; the host can turn it off.
- Viewers see a **TV view**: the current question large, and a tile per player (2×2 for four)
  with avatar, score and answer state. Built from the room data, not screen streaming, so it is
  smooth on slow connections. Player cameras join the tiles in phase 4.
- **Recording** (admins first): a Record button on the watch view saves MP4/WebM, with a 9:16
  layout and watermark for TikTok and Reels.

## Phase 4: video and audio

LiveKit (self-hosted or LiveKit Cloud) for group video, tokens from the PHP API; coturn for
reliable voice. Video only in private rooms, host can mute and remove, report button.

## Phase 5+: games and extras

- Games: Imposter / Undercover, Who's the Spy, Heads Up, Two Truths and a Lie, Mafia/Werewolf,
  Emoji Decode, Rank It, a Wavelength-style game, Trivia Royale.
- Extras: promo codes and referrals, shareable result cards, push notifications, receipt and
  reminder emails, report/block and moderation, XP and achievements, friends list, Shona and
  Ndebele, error monitoring (Sentry), uptime alerts, nightly database backup, a staging site,
  Firebase App Check.
- Watch Firebase's free-plan limit of 100 simultaneous connections; move to Blaze when the
  admin portal shows it getting close.
