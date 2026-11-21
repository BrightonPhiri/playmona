# Celebrations TV: Programme slide and a new Welcome screen

Date: 2026-11-21 (Vicky's event is tomorrow, 22 Nov; ship today, before the rehearsal).

## Why

- On the TV's Welcome (How to join) screen, the event photo is a small circle. Brighton uploads wide pictures, so most of each one is cut off.
- When the programme opens, Brighton wants a big, moving welcome slide on the TV. Example: Vicky's banner, a ready-made 16:9 picture. Later, when the games are about to start, the MC switches to the Welcome (How to join) screen.

## Goals

1. Redesign the Welcome (How to join) screen. The photo becomes a large rectangle that keeps its shape (`object-fit: contain` over a blurred copy of itself, so no picture is ever cropped). The name, title and facts sit beside it, and the QR card is clean. It should look modern and work with every event theme.
2. Add a new TV screen, **Programme**. The organiser chooses the kind of welcome slide:
   - **Picture**: one uploaded image (separate from the event cover), shown full screen;
   - **Slideshow**: several uploaded images (up to 12) that fade from one to the next every few seconds (4 to 30, default 8); or
   - **Built**: a text slide with a small line ("Welcome to"), a title (defaults to the event title), a subtitle (for example, "40, Fortified and Qualified") and an optional line with date · time · venue. The background is the event theme or a blurred cover photo.
3. **Picture movement** (applies to both kinds): none, slow zoom in, slow zoom out, slow pan.
4. **Effect over the slide**: none, gold sparkles & stars, confetti, snow, leaves, rose petals, balloons, hearts. All are drawn on one canvas, with no library.
5. The Programme screen is full screen: no header, no QR, no full-screen button once the mouse rests.
6. **Who sets it up:** the organiser's dashboard (Games tab, "On the day", with a preview), and the MC panel (switch kind, effect and movement; upload from the phone).
7. **MC panel:** a new "Programme" button next to Welcome. Automatic is unchanged: Programme shows only when the MC (or organiser) picks it.

## Not doing (non-goals)

- A deck of several different slides (text slides mixed with pictures). A slideshow is pictures only.
- Showing Programme in the Automatic rotation.
- Effects on any screen other than Programme.

## Approaches

- **One slide + effects (picked).** A new display layout, `programme`, with the slide settings kept in the display state the MC already controls (`celebrations.display` → `live/display`), so the TV changes at once.
- Reuse the cover photo: rejected. A banner with text in it would also become the phones' event picture.
- A slide deck: rejected for now. It is too big to build and test before tomorrow.

## How (decided)

- `CelebrationStage::LAYOUTS` gains `programme`. Display gains a `slide` object: `{ kind: picture|slideshow|built, mediaIds: [up to 12], seconds: 4–30, kicker, title, subtitle, showFacts, background: theme|cover, motion: none|zoomIn|zoomOut|pan, effect: none|sparkles|confetti|snow|leaves|petals|balloons|hearts }`. It is cleaned on the server: allowed values only, text trimmed to sensible lengths, and every id in `mediaIds` must be one of this event's `slide` pictures. Uploading only stores a picture; the page then saves the new `mediaIds` list.
- Uploads: the organiser upload accepts `purpose=slide`. The MC gets its own upload route, `/c/<cid>/mc/upload`, which also accepts only `slide`. `/screen` and `/mc` return the slide pictures (`slideImages`, in order) as signed URLs (the `full` 2048 px size).
- Organiser: GET/POST `/c/<cid>/slide` (owner only), next to the QR switch.
- TV: `programme()` screen; the picture layer animates with CSS keyframes (40 s, alternating); the effect runs on a canvas with rAF plus a timer fallback (preview tabs throttle rAF) and respects `prefers-reduced-motion` (fewer, slower particles).

## Left to the builder

The exact look of the redesigned Welcome screen within the theme tokens; particle counts and shapes; wording of labels.
