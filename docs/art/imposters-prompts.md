# Imposters: Codex prompt pack

One cover for **Imposters**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py imposters`.

The raw file lands in `assets/playmona_assets/imposters/`, which git ignores.
Until it exists the game shows its detective icon on a party-coloured wash.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Imposters" social deduction party game on the Playmona gaming platform.

THE GAME

A group of friends each secretly gets a word. Most get the same word, but one or two get a different one, and nobody knows which side they are on. They give one-word clues, eye each other, and vote out whoever seems off.

LOOK

* Playful, mischievous and a little mysterious. A polished modern game key art style, like a premium mobile party game: crisp stylised 3D characters with soft studio lighting, not a photo and not a painting.
* It must look completely different from the platform's other covers. Those are dark, painterly living-room scenes lit by a warm lamp, a realistic wildlife photograph, and a neon arena with a glowing button. So: no room, no lamp, no animals, no neon button.
* Scene: a row of five friendly cartoon characters seen from the chest up, each holding a small face-down card to their chest. Four of them hold matching cards with a teal back; one, slightly off-centre, holds a card with a different coral back and glances sideways with a sly half-smile. The others look at each other suspiciously, one raising an eyebrow, one with a hand on their chin.
* Behind them, a big soft spotlight circle and floating question-mark shapes made of light (shapes only, not letters).
* Palette: deep plum and midnight purple background (#2A1446 to #120A24), teal (#22C7B8) and coral (#FF6B5B) for the two card colours, warm gold (#FFC94D) rim light. Characters are diverse in skin tone, hair and clothing, with friendly, expressive, non-scary faces.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the game's banner shows an even thinner slice. So the five faces and their cards must sit in the middle 40 percent of the height. The top and bottom quarters should be just background and soft light.
* No text, letters, numbers, logos, watermarks, frames or UI elements. The question marks are glowing abstract shapes, not typography.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/imposters/

Save it as:

assets/playmona_assets/imposters/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any face or hand looks malformed, if there is any text, if all five cards are the same colour, or if the group is not in the vertical middle.
* Verify the file exists and is a valid image.
```
