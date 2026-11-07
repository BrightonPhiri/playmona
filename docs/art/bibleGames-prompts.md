# Who Am I?, Verse Rush, Books of the Bible: Codex prompt pack

Three covers, one per game. Paste each prompt into Codex, opened in the
`playmona` folder (one prompt per request). Then tell Claude they are ready,
and Claude crops and compresses them with

```
python tools/process-game-art.py bibleWhoAmI
python tools/process-game-art.py bibleVerseRush
python tools/process-game-art.py bibleBooks
node tools/gen-asset-manifest.js
```

so the game cards pick them up.

The raw files land in `assets/playmona_assets/bible-who-am-i/`,
`assets/playmona_assets/verse-rush/` and `assets/playmona_assets/books-of-the-bible/`,
which git ignores.

The games themselves need no art: the clues, verse pieces and book cards are
drawn in code. If a cover needs another go, use the **Redo** prompt at the end.

---

## 1. Who Am I? (Bible)

```
Use the image generation capability to generate ONE cover image for the "Who Am I?" Bible game on the Playmona gaming platform.

THE GAME

A family guessing game about people of the Bible. Four clues appear one at a time, hardest first, and players guess who it is from four names: Joseph, David, Moses, Ruth, Peter and many more. Guessing on an early clue scores the most. Warm, curious and reverent, for kids and grown-ups together.

LOOK

* Premium glossy 3D key art, like a top family mobile game: soft toy-like shapes, crisp highlights, gentle reflections, warm cinematic light. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's question mark on a podium, Bible Quiz's glowing open book on royal purple, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes, SortRush's wooden shelf). So: no question mark, no open glowing book, no podium, no stage spotlights, no answer buttons, no purple background.
* Scene: a large brass magnifying glass, tilted toward the viewer in the centre, its lens glinting. Seen through the lens, slightly magnified: a neatly folded coat of many colours with bold stripes of red, gold, green and blue.
* Around the magnifying glass, like clues laid out on a sunlit stone table, small chunky glossy 3D objects, each in its own colour: a leather shepherd's sling with five smooth round stones, a small woven reed basket floating on a little ripple of blue water, a fishing net with two silver fish, a wooden harp, a clay water jar, and a rolled scroll tied with a red cord.
* Background: a clear warm sky gradient from deep teal (#0F766E) at the top to sandy gold (#F2C46D) behind the table, with a soft sun glow, a few gentle sparkles and drifting golden dust.
* Respectful and family friendly: no people, no faces, no figures of Jesus, God or angels, no hands, no silhouettes of people.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the magnifying glass, the coat and most of the objects inside the middle 40 percent of the height, centred left to right. The top and bottom quarters should be mostly sky glow and soft table surface.
* No text, letters, numbers, logos, watermarks, frames or UI elements anywhere, including on the scroll.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/bible-who-am-i/

Save it as:

assets/playmona_assets/bible-who-am-i/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letters or numerals (check the scroll closely), if any person, face, hand or silhouette appears, if there is a question mark, or if the magnifying glass is not near the vertical middle.
* Verify the file exists and is a valid image.
```

---

## 2. Verse Rush

```
Use the image generation capability to generate ONE cover image for the "Verse Rush" Bible game on the Playmona gaming platform.

THE GAME

Players race to build a well-known Bible verse by tapping its pieces in the right order, and sometimes say where a verse is found. Fast, bright and joyful, for families learning verses together.

LOOK

* Premium glossy 3D key art, like a top family mobile word game: soft toy-like shapes, crisp highlights, gentle reflections, bright light. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's question mark on a podium, Bible Quiz's glowing open book on royal purple, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes, SortRush's wooden shelf, Who Am I's magnifying glass). So: no question mark, no open book, no magnifying glass, no podium, no purple background.
* Scene: a long cream parchment scroll unrolling in a sweeping S-curve across the middle of the picture, its wooden end handles polished and rounded. Rushing along the scroll, like a speeding ribbon, a line of chunky glossy rounded word tiles in warm colours (coral, gold, sky blue, mint, ivory), some already snapped into a neat row on the scroll, others still flying in from the right and clicking into place.
* The tiles are BLANK: smooth rounded rectangles with a soft bevel and a faint embossed line, never any letters.
* Motion: soft speed streaks and a few small bursts of golden sparkle where tiles land, giving a feeling of a happy race. A small glossy hourglass with golden sand sits at one end of the scroll.
* Background: a fresh sunrise gradient from deep navy blue (#1E3A8A) at the top through bright sky blue (#38BDF8) to warm peach (#FDBA74) near the bottom, with gentle light rays and a few drifting sparkles.
* Respectful and family friendly: no people, no faces, no hands.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the scroll and the tiles inside the middle 40 percent of the height, spanning most of the width. The top and bottom quarters should be mostly sky gradient, light rays and sparkles.
* No text, letters, numbers, logos, watermarks, frames or UI elements anywhere, including on the tiles and the scroll.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/verse-rush/

Save it as:

assets/playmona_assets/verse-rush/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any tile or the scroll shows letters, words or numerals (check every tile closely), if any person, face or hand appears, or if the scroll is not near the vertical middle.
* Verify the file exists and is a valid image.
```

---

## 3. Books of the Bible

```
Use the image generation capability to generate ONE cover image for the "Books of the Bible" game on the Playmona gaming platform.

THE GAME

A quick family game about the 66 books of the Bible: which testament a book is in, which part of the Bible it belongs to (the Law, History, Poetry, the Prophets, the Gospels, the Letters), which book comes next, and putting books in order. Tidy, colourful and satisfying.

LOOK

* Premium glossy 3D key art, like a top family mobile puzzle game: soft toy-like shapes, crisp highlights, gentle reflections, warm light. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's question mark on a podium, Bible Quiz's single glowing open book on royal purple, SortRush's honey wooden shelf with nuts and tubes, Who Am I's magnifying glass, Verse Rush's flying scroll). So: no question mark, no open glowing book, no magnifying glass, no scroll, no purple background, no test tubes.
* Scene: a small, chunky, rounded white-and-sage bookcase seen from the front and slightly from above, filled with many slim hardback books standing upright in neat colour bands, like a rainbow: deep red, orange, gold, green, teal, blue, indigo and rose. The books have smooth plain spines with a thin gold band near the top and bottom, and NO writing.
* One shelf is split in two by a small rounded divider: the left part with warm-coloured books, the right part with cool-coloured books, as if Old and New Testament.
* In front of the bookcase, three or four books are floating in the air in a gentle arc, sliding back into the gaps where they belong, with a soft golden glow and little sparkles trailing behind them.
* Background: a soft warm gradient from cream (#FFF7E6) at the top to fresh sage green (#9BD3AE) at the bottom, with gentle light, a few floating sparkles and a soft shadow under the bookcase.
* Respectful and family friendly: no people, no faces, no hands.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the bookcase's book-filled shelves and the floating books inside the middle 40 percent of the height, centred left to right. The top and bottom quarters should be mostly soft background, the top of the bookcase and its shadow.
* No text, letters, numbers, logos, watermarks, frames or UI elements anywhere, especially on the book spines.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/books-of-the-bible/

Save it as:

assets/playmona_assets/books-of-the-bible/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any book spine shows letters, words or numerals (check every spine closely), if any person, face or hand appears, or if the shelves are not near the vertical middle.
* Verify the file exists and is a valid image.
```

---

## Redo

```
Regenerate assets/playmona_assets/<FOLDER>/cover.png using the same <GAME NAME> cover brief from docs/art/bibleGames-prompts.md, and fix this: <WHAT TO FIX>.
Keep the main subject in the middle 40 percent of the height, no text, letters or numerals anywhere, and no people, faces or hands. Overwrite the same file.
```

Folders: `bible-who-am-i` (Who Am I?), `verse-rush` (Verse Rush), `books-of-the-bible` (Books of the Bible).
