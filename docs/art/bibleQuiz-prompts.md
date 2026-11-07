# Bible Quiz: Codex prompt pack

One cover for **Bible Quiz**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py bibleQuiz`, then runs
`node tools/gen-asset-manifest.js` so the game card picks it up.

The raw file lands in `assets/playmona_assets/bible-quiz/`, which git ignores.

If it needs another go, use the **Redo** prompt at the end.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Bible Quiz" game on the Playmona gaming platform.

THE GAME

A family Bible quiz from Genesis to Revelation: finish the verse, who said it, true or false, and put the story in order. Joyful, warm and reverent, for kids and grown-ups together.

LOOK

* Premium glossy 3D key art, like a top family mobile game: soft toy-like shapes, crisp highlights, gentle reflections, warm cinematic light. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's giant question mark on a game-show podium with spotlights, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes). So: no question mark, no podium, no stage spotlights, no answer buttons, no game-show look.
* Scene: in the centre, a large open book, seen slightly from above, its pages fanning gently. A warm golden light rises out of the pages like sunrise. The pages show only soft blank lines and a faint glow, never readable words.
* Floating up out of the light in a gentle spiral, small chunky glossy 3D story objects, each in its own colour: Noah's wooden ark with a tiny rainbow over it, a white dove carrying an olive branch, a bright eight-pointed star, a shepherd's crook, a small leather sling with a round stone, a basket with five loaves and two fish, a rolled scroll with a red ribbon, two blank rounded stone tablets, a small golden crown, and an oil lamp with a little flame.
* Background: deep royal purple (#3B1260) at the edges, warming to violet (#9333EA) and soft gold (#F6C453) behind the book, with gentle light rays, floating golden dust motes and a few small twinkling sparkles.
* Respectful and family friendly: no people, no faces, no figures of Jesus, God or angels, no hands.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the open book and most of the floating objects inside the middle 40 percent of the height, centred left to right. The top and bottom quarters should be mostly purple glow, light rays and dust motes.
* No text, letters, numbers, Roman numerals, verse numbers, logos, watermarks, frames or UI elements anywhere, including on the book pages, the scroll and the stone tablets.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/bible-quiz/

Save it as:

assets/playmona_assets/bible-quiz/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letters or numerals (check the pages, scroll and tablets closely), if any person, face or angel appears, or if the book is not near the vertical middle.
* Verify the file exists and is a valid image.
```

---

## Redo

```
Regenerate assets/playmona_assets/bible-quiz/cover.png using the same Bible Quiz cover brief, and fix this: <WHAT TO FIX>.
Keep the open glowing book in the middle 40 percent of the height, no text or numerals anywhere, and no people or faces. Overwrite the same file.
```
