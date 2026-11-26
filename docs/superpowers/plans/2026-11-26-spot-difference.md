# Spot the Difference with real pictures: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the emoji Spot the Difference with picture pairs (A original, B with 10 changes), tap either picture, swipe between them on phones.

**Architecture:** A Python finder diffs A and B into 10 spot boxes (plus a larger "patch" box per spot that is safe to paint back). The game (`js/games/spotDifference.js`) deals a pair and N active spots from the seed, shows B with the unused spots painted back from A (CSS-masked divs), and hit-tests taps in 0–1 picture coordinates. Pure rules live on `FF.SpotDifference` and are unit tested.

**Tech Stack:** ES5 classic scripts, CSS scroll-snap for the phone swipe, Pillow + numpy for the finder, node test harness (`node tools/test/run.js`).

**Spec:** `docs/superpowers/specs/2026-11-26-spot-difference-design.md`

## Global Constraints

- Differences: Easy 5, Normal 7, Hard 10. Standard (leaderboards, daily, challenges): 7.
- Tap either picture; a hit circles the spot on both.
- Correct +100 × level bonus (1 / 1.5 / 2); wrong tap −20; never below 0; all found adds a speed bonus up to 200.
- Phones (< 720 px): one picture at a time, swipe or an Original / Changed switch; wider: side by side.
- Pictures ship as `assets/images/games/spotDifference/<id>-a.webp` and `-b.webp`, 1024 px; a pair counts only when both are in the asset manifest.
- Game id stays `spotDifference` (online lists, leaderboards, icons untouched).

## Review Focus

- A tap just outside a small spot on a phone should still count (finger margin 0.035 of the picture).
- Tapping a spot already found does nothing (no penalty); tapping a painted-back spot is a wrong tap.
- A patch painted back must never cover part of an active spot (the finder keeps patches clear of other spots' boxes).
- Two phones with the same round seed must see the same pair and the same active spots.
- The time running out ends the picture and banks what was found.

---

### Task 1: Spot finder and art

**Files:** Create `tools/art/spot-diff-find.py`, `tools/art/spotDifference.json`; modify `tools/gen-asset-manifest.js` (add `games/spotDifference`).

- [ ] `python tools/art/spot-diff-find.py market-day` writes `tools/art/spotDifference-spots/market-day.json` (`[{b:[x,y,w,h], p:[x,y,w,h]}]`, 0–1, 3 decimals) and a circled review image; exits non-zero unless it finds exactly 10 spots.
- [ ] `python tools/process-game-art.py spotDifference` makes both webps and the cover; `node tools/gen-asset-manifest.js` lists them.

### Task 2: Rules and data

**Files:** Create `js/data/spotDifference.js`, `js/games/spotDifference.js` (rules part), `tools/test/spotDifference.test.js`.

**Produces:** `FF.SpotDifference = { COUNTS, STANDARD, sanitize(s), pairs(), deal(cfg, rand) -> [{id, name, spots, active:[idx]}], hit(item, found, u, v) -> idx|-1, points(st, bonus, ms, limitMs), secondsFor(n), patchStyle(p) }`.

- [ ] Tests: sanitize keeps to 5/7/10; deal is the same for the same seed, picks `n` distinct active spots; `hit` finds a spot inside its box + margin, skips found and inactive ones; points match Global Constraints; no pair without both webps.

### Task 3: The game screen

**Files:** Modify `js/games/spotDifference.js` (UI, setup, pass-and-play, online), `css/games.css` (`.sdx-*`), remove the spot section from `js/games/puzzleGames.js`, add script tags in `play.html`, `admin.html`, `tools/load-check.js`, `tools/test-seed.html`; point `tools/test/parallel.test.js` at the new file.

- [ ] `node tools/test/run.js` passes.
- [ ] Preview: desktop side by side, phone swipe + switch, hit/miss marks, time-out, Easy shows 5 differences only.
