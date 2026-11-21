# Word by Word: Codex prompt pack

One cover for **Word by Word**, the Celebrations team message game. Paste the
prompt into Codex, opened in the `playmona` folder. Then tell Claude it's ready,
and Claude crops and compresses it with `python tools/process-game-art.py wordByWord`.

The raw file lands in `assets/playmona_assets/word-by-word/`, which git ignores.

The cover shows on the organiser's game card (a small square) and in the
"Choose a game" list, so the middle of the picture must read at thumbnail size.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Word by Word" party game on the Playmona gaming platform.

THE GAME

At a birthday or graduation party, teams of guests write one message to the person being celebrated, together, one word at a time. Each team adds a single word on its turn from its own phone, the message grows across the room, and at the end it is revealed word by word and goes on the Wall of Love as a keepsake.

LOOK

* Premium glossy 3D key art, like a top mobile party game: chunky soft toy-like shapes, crisp highlights, gentle reflections, soft studio light. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Word Flow's characters on a winding path of tiles, Say What's single teal speech bubble on a cream-to-apricot glow, Blink & Remember's gift boxes on yellow-to-coral, Charades' red theatre curtains, Logo Rush's floating app badges). So: no people or hands, no winding path, no speech bubble, no gift boxes, no curtains, no app badges.
* Background: a soft party gradient from pale lilac (#D9C8FF) at the top to rose pink (#FFB3C7) at the bottom, with drifting gold confetti (#F5B82E), a few curled paper streamers and two or three small balloons near the edges.
* Scene: in the centre, a large open greeting card stands upright, slightly turned towards the viewer, cream (#FFF8EC) inside with a deep plum (#3B1F5C) cover and a small glossy red heart seal (#FF4D6D) on the fold. Across the inside of the card runs ONE line of six chunky rounded word blocks of different lengths, like a sentence. The blocks carry NO letters or marks. Each block is a different team colour: tangerine (#FF9A3C), sky blue (#4DA8FF), mint (#3ED6A0), sunflower yellow (#FFC93D), grape purple (#9B5CFF) and hot pink (#FF5FA2). The last place in the line is EMPTY: a glowing dashed outline.
* Around the bottom of the card, four small glossy 3D phones float at different angles, each with a case in one of the team colours. From one phone, a seventh word block in tangerine (#FF9A3C) is flying up along a sparkling dotted arc into the empty place, with a short motion trail and a small burst of gold sparkles where it is about to click in. The other phones glow softly, waiting their turn.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture, sometimes as a small square. Keep the card, the line of blocks and the flying block inside the middle 40 percent of the height and the middle 70 percent of the width. The top and bottom quarters should be mostly gradient with confetti, streamers and balloons.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements. The phone screens show only soft colour, never text or icons.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/word-by-word/

Save it as:

assets/playmona_assets/word-by-word/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letters or digits (on the card, the blocks or the phones), if there are people or hands, if the line does not end in one empty glowing place with one block flying into it, or if the card is not near the middle of the picture.
* Verify the file exists and is a valid image.
```

## Redo

If one thing is wrong, paste this with the problem filled in:

```
Regenerate assets/playmona_assets/word-by-word/cover.png from the same brief. Keep everything else the same, but fix this: <what was wrong>. Still no text, letters, digits, people or hands, and keep the card in the middle 40 percent of the height.
```
