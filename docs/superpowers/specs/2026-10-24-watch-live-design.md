# Phase 3: Watch live (design)

Agreed with Brighton on 2026-10-24. Recording moved out of this phase into its own phase
("it has to be perfect"), so Phase 3 is only watching.

## Why

Brighton wants anyone to be able to watch a PlayMona room game: friends far away, and strangers
who browse games that the room marked as public. Watching makes rooms feel like a show, brings
new people to the site (a stranger watching a fun game is one tap from playing), and sets up the
later phases: player cameras in each tile (video phase) and social clips (recording phase).

## Goals

1. **Public or Private rooms.** Every room has a Public / Private switch in the lobby. Private
   is the default *(my call: nobody ends up on show by accident)*. Public rooms appear on the
   Watch live page.
2. **Watch link.** Any room, public or private, can share a watch link. Anyone with the link
   can watch. The host can turn watching off; viewers watching then see "The host stopped
   sharing this game" and go back to Watch live.
3. **Watch live page.** A new page that lists public rooms that are playing or waiting in the
   lobby. Reached from the Online tab and from the landing page.
4. **TV view.** What viewers see, built from room data (no screen streaming), so it is smooth on
   slow connections.
5. **Viewers only watch.** No answering, chat or reactions. The only thing viewers add is the
   **viewer count**, which viewers and players both see *(players seeing it: my call)*.
6. **Watching is free** for everyone (Brighton). No Plus perk, no upgrade prompt.
7. **Viewer limits** while Firebase is on the free plan (100 connections for the whole site):
   **20 viewers per room** and **50 viewers across the site** by default, both editable in the
   admin portal (Site) so they can be raised after moving to Blaze. A viewer over a limit sees
   "This game is full right now" with other live games to watch. Players are never refused
   because of viewers. *(numbers suggested by me, limits agreed by Brighton)*
8. **Photo privacy setting.** A player can choose not to show their profile photo to viewers;
   viewers then see their character instead.

## Non-goals (this phase)

- Recording or saving clips (its own later phase).
- Video or camera tiles (video phase; tiles are designed so a camera can replace the avatar).
- Chat, reactions, comments, following a player, notifications when a room goes live.
- Watching single-device games (only online rooms).

## Anti-goals (would make this a failure even if it works)

- A private room showing up on Watch live, or a viewer being able to join and play.
- Viewers slowing the game down for the players.
- A player's photo shown to strangers after they turned that off.
- Viewers being asked to sign up or sign in just to watch.

## What it looks like

Mockups that Brighton approved: layout C on big screens, the Watch live page, and the phone
view (`.superpowers/brainstorm/*/content/tv-view-v2.html` and `watch-live.html`, choice C).

### Watch live page

- Title "Watch live", one line: "Public rooms playing right now. Tap one to watch."
- Filter chips: All, then game categories (Quiz, Words, Bible, Party, ...), and "Most watched".
- A card per public room: the game's picture as card art, a **LIVE** tag (or **IN LOBBY**
  while picking a game), "N watching", room name, game name and "Question X of Y" (or "Picking
  the next game"), the players' photos/characters in a row, and a Watch button.
- Updates by itself. Rooms drop off when they close or switch to private.
- Empty or last row: "That's every public game right now. Start your own room and make it public
  to appear here." with a button that opens Play with friends.

### TV view (big screens, landscape): layout C

- Top bar: LIVE tag, room name, game name, question X of Y; on the right, "N watching" and a
  Stop watching control.
- **Left (larger):** the current question as players see it: the question text, its picture
  (flag, landmark, animal...), the four answers with the same colour and shape markers as the
  game (▲ ◆ ● ■), and the timer bar.
- **Right:** a leaderboard, one tile per player, sorted by score, re-sorting with animation as
  scores change. Each tile: photo or character, name, score, a tick once they have answered this
  question (green outline), and a blue glow while they are talking on voice chat. Holds up to 12
  players without shrinking.
- After each question: the right answer lights up, points fly onto the winners' tiles.
- End of game: a podium. Then the room goes back to the lobby view.
- **Lobby view:** room name, players in the room, "Waiting for the host to pick a game" /
  "Starting World Flags...", with the countdown when a game starts.

### Phone (upright)

Same content stacked: top bar, question card, then the leaderboard tiles, then Stop watching.

### Games that are not "question with four answers"

Most of the 22 room games are picture or text questions with four answers. For the others
(Quick Tap, Colour Reaction, Letter Rush, What's Missing, Number Challenge, Visual Riddle) the
left side shows whatever that game shows its players in a simple read-only form, or, where that
is not practical, a big game card with the round number and the leaderboard doing the work.
*(Builder's call per game; the leaderboard and answered ticks must work for every room game.)*

## In the room (players' side)

- Lobby: a **Public / Private** switch for the host, a **Watching** on/off switch (default on),
  and **Invite viewers**, which shares the watch link with the same share sheet and QR code the
  room invite uses, with wording that makes clear it is for watching, not playing.
- An "N watching" badge in the lobby and during the game.
- Switching to Private removes the room from Watch live but keeps the watch link working.
  Turning Watching off ends watching for everyone.

## Settings

Settings > Edit profile gets **"Show my photo to people watching"** (default on). Off means
viewers see the player's character. Only matters when the player has a photo.

## Decided by Brighton

- Rooms can be public or private; any room can share a watch link.
- A separate page lists public games so anyone can choose one to watch.
- Viewers only watch; they see how many people are watching.
- Layout C on big screens; the phone view and Watch live page as mocked up.
- Photos show (or characters where there is no photo), with a setting to hide the photo from
  viewers. In the video phase, tiles show the player's camera.
- Recording is its own phase.
- Watching is free; there is a viewer limit (numbers editable by admins).

## Technical shape (builder may refine)

These are my calls, written so the builder can plan; they fit the existing code.

- **Viewers never read the room itself.** The host's device publishes a small **broadcast** for
  the room under its own watch code (separate from the room code, so a watch link cannot be used
  to join and play). The broadcast holds what the TV view needs: room name, game, status,
  question number, the current question's display (text, picture key, answers, and after the
  round, the right answer), players (name, character or photo when allowed, score, answered
  this round, talking), and `public: true/false`. When host duty moves (`claimHost`), the new host
  keeps publishing. Database rules: anyone signed in (including anonymous) can read broadcasts;
  only the room's host can write one.
- **Each game describes its screen.** Questions are built on every device from the room's seed,
  so the host already has the current question. Each room game gives the broadcast a small
  description of what is on screen (the race layer is the natural place to collect it). Games
  without one fall back to the game card.
- **Watch live list** reads the public broadcasts. Rooms with no update for a while (host gone)
  are hidden.
- **Viewers** sign in anonymously in the background (as rooms already do through
  `firebaseTransport`), add themselves to the broadcast's viewer list with a remove-on-disconnect,
  and the count comes from that list.
- **Addresses:** `/watch` for the Watch live page and `/watch/<code>` for a watch link, served by
  the app. New clean addresses need the root `.htaccess` rule on the live server, as `/terms`
  did. Guests and visitors who are not signed in can open both.
- **Watch Live list from the PHP API** *(my call)*: `/api/live` reads the public broadcasts with
  the service account, caches for about 10 seconds, and the page polls it. People browsing the
  list then hold no Firebase connection; only people inside a TV view do. This protects the
  connection limit (see open questions).
- **Watch link lifetime** *(my call)*: the watch code belongs to the room, so a saved room keeps
  its link for its 30-day life and a link shared last week still works. The lobby has **New
  watch link**, which replaces the code (old links stop working) for when a link leaks.
  Turning Watching off and on keeps the same code.
- **Admin:** the Live rooms page shows whether a room is public and its viewer count, and an
  admin can take a public room off Watch live (room names are typed by players, so someone may
  need to remove a bad one). *(my call)* The takedown is an admin-only flag on the room that the
  host cannot overwrite (rules and the list both obey it) and lasts for the room's life. The
  host cannot switch that room back to Public and sees "An admin removed this room from Watch
  live." The private watch link keeps working.
- **Enforcing limits:** a viewer adds themselves to the viewer list only if the room and the
  site are under the limits (a transaction on the counts, or rules that check them). Limits live
  with the other admin site settings. Builder picks the mechanism; players must never be blocked.
- Counters: add `watchers` (viewers who opened a watch view) to the daily counters for the admin
  Overview. *(my call)*

## Open questions for Brighton

None left. Builder check done on 2026-10-24; its three questions were answered (limits and
Plus by Brighton, watch link lifetime and admin takedown as my calls above).

## Left to the builder

- Exact broadcast fields, write frequency (throttle so viewers never slow the host), and how the
  host's device mirrors without extra work for players.
- Per-game screen descriptions and the fallback.
- Animations for the leaderboard re-sort, points and podium, following the design system
  (FF.UI / FF.GameUI, tokens, contrast checks).
- Tests in the existing style.
