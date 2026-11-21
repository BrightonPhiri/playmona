# Programme Slide + Welcome Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Celebrations TV a wide, modern Welcome screen and a new full-screen "Programme" slide (picture or built text, with movement and an animated effect) that the organiser and the MC set up and the MC switches on.

**Architecture:** `programme` becomes a new display layout. The slide settings live in the display state (`celebrations.display` → RTDB `live/display`), so a change reaches the TV at once. The slide picture is a `slide`-purpose celebration media item, served signed through `/screen` and `/mc`. The TV draws effects on one canvas (`js/celebrate/effects.js`).

**Tech Stack:** PHP 8.3 API (tests: `php tools/api/test.php`), vanilla ES2017 classic scripts, CSS in `css/celebrate.css`.

**Spec:** `docs/superpowers/specs/2026-11-21-programme-slide-design.md`

## Global Constraints

- Ships today (2026-11-21); Automatic rotation unchanged; Programme only when picked.
- Slide fields: `kind` picture|slideshow|built, `mediaIds` (≤12, this event's slide pictures), `seconds` 4–30, `kicker` (≤40), `title` (≤80), `subtitle` (≤120), `showFacts` bool, `background` theme|cover, `motion` none|zoomIn|zoomOut|pan, `effect` none|sparkles|confetti|snow|leaves|petals|balloons|hearts.
- Classic scripts, no new libraries; never add ssh steps to deploy.yml (migrations only via cron; none needed here since `display` is a TEXT column).

## Review Focus

- Picture/slideshow kind chosen but no picture uploaded yet → TV shows the built slide instead, never a blank screen.
- A non-16:9 slide picture (portrait phone photo) → contained over its own blurred copy, never cropped.
- Old events with stored display JSON lacking `slide` → defaults fill in (test in Task 1).
- Preview/hidden tabs throttle rAF → effect loop has a timer fallback; `prefers-reduced-motion` → fewer, slower particles.
- MC uploading a `cover` or `puzzle` through the MC route → refused (test in Task 1).

---

### Task 1: Server: layout, slide settings, uploads

**Files:**
- Modify: `api/lib/CelebrationStage.php`, `api/lib/Celebrations.php` (`upload` purposes), `api/lib/CelebrationRoutes.php`
- Test: `tools/api/celebrationStage.test.php`

**Interfaces:**
- Produces: `display.slide` object (fields above, defaults `kind:'built', mediaIds:[], seconds:8, kicker:'Welcome to', title:'', subtitle:'', showFacts:true, background:'theme', motion:'zoomIn', effect:'sparkles'`); `/screen` and `/mc` add `slideImages: mediaView[]` (signed, full size, in mediaIds order); `POST /c/<cid>/mc/display` accepts `{slide:{...partial}}` (merged); `POST /c/<cid>/mc/upload` (raw body, purpose slide only) returns the media view only; owner `GET/POST /c/<cid>/slide` → `{display, slideImages}`; owner `POST /c/<cid>/media?purpose=slide` allowed.

- [ ] Step 1: Tests `stage: the programme slide` — `layout:'programme'` accepted; default slide equals the defaults above; partial `slide` update merges and mirrors to `live/display/slide/effect`; bad `effect:'disco'` → 400; a cover picture in `mediaIds` → 400; 13 ids → 400; MC upload of `photoJpeg(1920,1080)` → 200 then saving `mediaIds:[id]` makes `slideImages[0].full` appear in `/screen`; owner GET/POST `/slide` works, guest token → 403. Update the existing `eq([...4 keys], $tv[1]['display'])` to include the default slide.
- [ ] Step 2: Run `php tools/api/test.php` → new tests FAIL.
- [ ] Step 3: Implement `cleanSlide(array $old, array $in, string $cid): array` in CelebrationStage, wire layout + routes, add `slide` purpose.
- [ ] Step 4: Run `php tools/api/test.php` → PASS.
- [ ] Step 5: Commit.

### Task 2: TV: Welcome redesign + Programme screen + effects

**Files:**
- Create: `js/celebrate/effects.js` (`FF.CelebrateEffects.start(canvas, kind, colors) → { stop() }`)
- Modify: `js/celebrate/tv.js` (`welcome()`, new `programme()`, layout names, dataKey, render hides head/QR on programme), `css/celebrate.css`, the page that loads tv.js (add effects.js script tag)

- [ ] Step 1: Welcome: `.tv-welcome__media` wide rectangle (16:9 box, radius ~1.2em, contain over blurred copy); info + QR card beside it.
- [ ] Step 2: `programme()`: picture layer (picture: slideImages[0]; slideshow: all slideImages crossfading every `seconds`; each contained over blur; built: kicker/title/subtitle/facts on theme or blurred cover) with `.is-motion-<motion>` keyframes; canvas overlay running the effect; stop the previous effect on re-render.
- [ ] Step 3: Verify in the browser (dev servers `playmona-celebrations-api-9512`): each effect, each motion, picture and built, Welcome with a wide cover. No console errors.
- [ ] Step 4: Commit.

### Task 3: Dashboard and MC controls

**Files:**
- Create: `js/celebrate/slideEditor.js` (`FF.CelebrateSlide.editor(opts) → Element`; opts `{ get(): Promise<{display, slideImage}>, save(partial): Promise, upload(file): Promise, ev }`), shared by both pages
- Modify: `js/celebrate/games.js` ("On the day"), `js/celebrate/mc.js` (LAYOUTS gets `['programme','presentation',...]`, editor below the layout grid), script tags

- [ ] Step 1: Editor: Picture/Slideshow/Built switch, upload (several for slideshow), reorder/remove thumbnails, seconds, text fields (built), background, movement and effect pickers, live mini preview using effects.js.
- [ ] Step 2: Verify in the browser: organiser saves a built slide → TV changes; MC picks Programme, changes effect from the MC tab → TV changes at once; upload the banner → TV shows it full screen.
- [ ] Step 3: Run `php tools/api/test.php` and `node --check` on changed JS; commit; push; open PR.
