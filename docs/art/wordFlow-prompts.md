# WordFlow: Codex prompt pack

One cover for **WordFlow**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py wordFlow`.

The raw file lands in `assets/playmona_assets/wordFlow/`, which git ignores.
Until it exists the game shows its pencil icon on the words-coloured wash.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "WordFlow" word party game on the Playmona gaming platform.

THE GAME

Two or more friends build sentences and stories together, one word each, taking turns. Word by word, a sentence grows into something funny, surprising or beautiful. There are two ways to play: make sentences, or make one long story together.

LOOK

* Joyful, creative and warm. A polished modern game key art style, like a premium mobile party game: crisp stylised 3D shapes and characters with soft studio lighting, not a photo and not a painting.
* It must look completely different from the platform's other covers. Those are dark, painterly living-room scenes lit by a warm lamp, a realistic wildlife photograph, a neon arena with a glowing button, and a row of characters holding cards under a spotlight. So: no room, no lamp, no animals, no neon button, no cards, no spotlight.
* Scene: three or four friendly cartoon characters, diverse in skin tone, hair and clothing, standing on a winding path made of smooth rounded tiles, like a ribbon flowing from the lower left to the upper right. Each character is gently placing or carrying one tile into the path. The tiles are blank (no letters on them), each in a different soft colour, so the path reads as a sentence being built tile by tile. Where the path reaches the far end, it opens up into a small dreamy storybook scene: a tiny castle, a little dragon silhouette and a crescent moon made of soft paper-craft shapes, hinting at a story coming to life.
* Small floating sparkles and soft round dots drift up from the tiles.
* Palette: a fresh sunrise background from soft sky blue (#8FD3FF) to warm peach (#FFD8B0). The tiles are teal (#22C7B8), coral (#FF6B5B), sunflower yellow (#FFC94D), lavender (#B69CFF) and mint (#7FE0B0), with a deep navy (#1E2A4A) for outlines and shadows. Friendly, expressive faces, mid-action, smiling.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the game's banner shows an even thinner slice. So the characters and the main part of the tile path must sit in the middle 40 percent of the height. The top and bottom quarters should be just sky, soft gradient and a few sparkles.
* No text, letters, numbers, logos, watermarks, frames or UI elements anywhere. The tiles must be blank.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/wordFlow/

Save it as:

assets/playmona_assets/wordFlow/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any face or hand looks malformed, if any letters or text appear (including on the tiles), if the path does not read as a row of tiles, or if the characters are not in the vertical middle.
* Verify the file exists and is a valid image.
```
