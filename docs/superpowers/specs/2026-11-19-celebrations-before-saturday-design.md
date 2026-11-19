# Celebrations: before Saturday (types, guest teams, join early, TV boards)

Approved with Brighton on 2026-11-19 ("Option A", "Yes, fair grids").

## Why

Vicky's celebration is on Sat 22 Nov 2026 (rehearsal Fri 21 Nov on playmona.com). Brighton asked for six
changes; these four are the ones guests will notice at the party, so they ship first, in one PR, so the
rehearsal runs on a single deploy. Word by Word (two versions) and the public list with code entry come
straight after the event.

## Goals

1. **Up to 3 things to celebrate.** An event can be e.g. Birthday + Graduation. One stays the default.
2. **Groups name their own team.** A group (often 5 people on one phone) makes its own team with its own name.
3. **Join early.** Guests can join before the start, see the details and the games planned (locked), and a
   countdown to the start time.
4. **TV split screen.** While a Picture Rush round is played, the TV shows a panel per team.

## Non-goals (this PR)

- Word by Word, the public list / search, voice notes, more templates.
- A separate "open the games" switch: a game opens when the MC or organiser starts it (as today).

## Anti-goals

- Spoiling a puzzle: the guest page never shows a game's photos before it is played; the TV never shows a
  team's picture while it is being solved (teams could copy from the screen).
- Breaking events made before this change (single `type`, organiser-only teams).

## Design (as decided)

### 1. Types (up to 3)
- New `types` (JSON list, 1–3 distinct values from `Celebrations::TYPES`) beside the existing `type`
  column; `type` stays the first one (the main kind: icon, suggested title wording, slug). Old rows read as
  `[type]`.
- API accepts `types` (list) on create/update; `type` alone still works. Views return both `type` and `types`.
- Create/settings form: the kind picker becomes a multi-select (tap to add, tap again to remove, at most 3,
  order of tapping = order shown; at least 1).
- Labels: "Birthday · Graduation" on the hero kicker, the TV welcome kicker and the organiser list.

### 2. Guest-made teams
- New setting `guestMakeTeams` (default **on**): "Guests can make their own team". Only meaningful when
  `guestTeams` is on and teams are not locked.
- `POST /c/<cid>/teams/new {name}` (a joined guest): checks the setting, team limit (`teamsPerEvent`),
  a name (1–30 chars, cleaned like other names, unique in the event ignoring case), and a short server block
  list of the worst words (Brighton's call: block list + organiser rename/remove covers the rest). Colour:
  the first of `TEAM_COLOURS` no team uses (else cycles). The guest moves into the new team. Audited
  `team.guest-made`.
- Event page: under "Pick your team", a **"Make our own team"** button opens a small form (name). The join
  name label becomes "Your name, or your group's name".
- Organiser Teams tab: guest-made teams appear like any other (rename/remove already exist); a small
  "made by a guest" note.

### 3. Join early
- Countdown on the event page while now < start (event date + start time in the event's time zone):
  "Starts in 2 days 4 h" / "Starts in 12 min 30 s"; gone once it starts. No date or time → no countdown.
- A **Games** card on the guest page lists published games: name, kind (Picture Rush), instructions,
  number of pictures, level — never photos or thumbnails — each with "Locked: opens when the MC starts it".
  Served by the guest API (`/me` or `/find` gains `games: [...]` without media).
- Joining, picking/making a team and the Wall of Love are open in advance (already true).

### 4. TV split screen ("fair grids")
- During `reveal`/`playing` of Picture Rush with ≤ 8 teams the TV game screen shows one panel per team:
  2 → side by side, 3–4 → 2×2, 5–6 → 3×2, 7–8 → 4×2. More than 8 → today's progress bars.
- Each panel: team name and colour, a grid of `size × size` squares where squares holding their correct
  tile are lit in the team colour and the rest are plain, "n / total in place", and once the team has
  solved it the grid is fully lit with a check mark and "Done in 36 s". The picture never shows on a
  panel (Brighton, 2026-11-19: teams still solving could copy it); it comes with the round's results.
- Data: the run view the TV already watches (`run/boards/<tid>.tiles`, `.solved`, `.usedMs`, `size`,
  `photo.url`). No new server data.

## Approaches considered

- Types: a second column (`types` JSON) vs. replacing `type`: keep `type` so every existing reader and old
  row works; `types` adds the list. Chosen.
- Guest teams: let guests type a free team name on join vs. a separate "make our own team" action: the
  action keeps team picking as it is and reuses team rules (limit, lock, colours). Chosen.
- TV panels: real pictures vs. fair grids: Brighton chose fair grids (no copying from the screen).

## Left to the builder

- Exact copy/wording beyond what is quoted here; CSS sizes for the panels on 16:9.
- Where the countdown sits (under the hero is the natural place).
- The block list's contents (short, worst words only, case-insensitive whole-word match).

## Testing

- PHP: types round-trip and limits; guest team creation (setting off, locked, limit, duplicate name,
  blocked word, colour choice, moves the guest); guest games list has no media URLs.
- Node: none new (TV is DOM).
- Browser: create/edit with 2 types; a guest makes a team; countdown on an event in the future; locked
  games card; TV split panels with 2 and 4 teams during a round, solved panel shows the photo.
