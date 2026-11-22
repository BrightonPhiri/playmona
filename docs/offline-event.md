# Offline Event Mode (Vicky's celebration)

A backup for the night if the internet fails. It runs on the laptop alone. Guests need no
phones or accounts: teams answer out loud or on paper, and the MC enters everything.

## Start

1. Double-click `tools\offline-event.cmd`. It starts the local server on port 8970 and opens
   the MC panel at `http://localhost:8970/offline`. Keep its black window open.
2. In the MC panel, click **Open projector window**. Drag that window onto the projector (HDMI)
   and click it once. It goes full screen and turns on sound. Double-click toggles full screen.
3. The top bar says **Projector connected** when both windows are talking.

Always use the same browser and the same address (port 8970). The event is saved in that
browser for that address, so a different port starts empty.

## Before the guests arrive

- **Setup tab**: check the title, rename the five teams, add photos (Vicky, family, graduation,
  friends), and star one as the Welcome photo. The Welcome screen then shows that photo on its own (tick the box under the photos to put the title on top).
- **Who Knows Vicky Best?**: type the answers into the 20 questions. Use one line per question:
  `Question | option | *right option | option | option`. With no options, `Question | = answer`
  makes an open question for paper answers.
- **Save a backup file** (Setup tab) once everything is in.

## During the event

- **On screen** (top bar) picks what the projector shows: Welcome, the game, Leaderboard,
  Winners or Blank. **Pause** freezes the game's clock.
- **Picture Rush**: pick a photo, a size (3×3 to 6×6) and the seconds per move (5, 10, 15,
  20, 30, 45, 60 or any other number; you can change it during the round too). A team says
  "move A1 to B4": on your board click A1, then B4, or drag A1 onto B4. Esc or **Put back**
  drops a tile you picked up. Typing the move is still there under **Or type the move**.
  Right: the tiles swap, the tile locks gold and the team gets 1 point. If the swapped-out tile
  also lands on its own square, that's a bonus point. Wrong: nothing moves. The turn passes after
  every try, or when time runs out. When every tile is in place, the full photo and the round
  scores appear.
- **Who Knows Vicky Best?**: choose turns (out loud) or all at once (paper). Start the timer,
  reveal the answer, mark the teams that got it right, then go to the next question.
- **Word by Word**: type each word the team says and press Enter. A turn passes after 10 seconds (change it with the time buttons).
  **Finish** shows the message full screen.
- **Memory**: Get ready, Show objects (20 seconds, then they hide), the writing timer, Reveal.
  Then type how many each team remembered.
- **Points tab**: give or take points, undo any entry, and see every game's scores.
  **Announce winners** shows the podium.

Keep the MC window open while games run. Its clock passes the turns on.

## If something goes wrong

- A window refreshed or closed: open it again. Everything comes back where it was.
- The projector shows the wrong thing: click the right **On screen** button.
- New laptop: copy the code, run the `.cmd`, then **Load a backup file**.
