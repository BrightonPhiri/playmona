# Charades: Codex prompt pack

One cover for **Charades**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py charades`.

The raw file lands in `assets/playmona_assets/charades/`, which git ignores.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Charades" party game on the Playmona gaming platform.

THE GAME
One player secretly reads a card and acts it out in silence, on a little theatre stage, while their team shouts guesses before the timer runs out.

LOOK
* Premium glossy 3D key art, like a top mobile party game: soft toy-like shapes, rich materials (velvet, polished gold, warm light bulbs), crisp highlights. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms, wildlife photos, Quiz Mix's question mark on a podium, Bible Quiz's glowing open book on royal purple, Number Rush's neon rings, Ball Swap's glass bowls, Remember the Sequence's glass pads, Blink & Remember's gift boxes, SortRush's wooden shelf, Who Am I's magnifying glass, Guess the Country's globe with flags, What's Missing's tile grid on magenta). So: no question mark, no book, no globe, no tiles, no purple or magenta background.
* Background: a small theatre stage. Deep crimson velvet curtains (#9F1239 to #4C0519) hang in heavy folds at the left and right and across the top, pulled open. The back wall is near-black warm plum (#1A0B12). A soft golden spotlight (#FCD34D) falls from above onto the centre of the stage, with gentle dust in the beam. An arch of round warm marquee bulbs runs along the top edge of the opening. A polished wooden stage floor catches the light.
* Scene: in the spotlight, one cheerful chunky 3D cartoon child (about 8 years old, warm brown skin, curly hair, bright yellow hoodie, sneakers; friendly, toy-like proportions) is acting out an ELEPHANT with big, funny body language: one arm swinging in front of the nose like a trunk, the other hand flapping beside the head like a big ear, one knee lifted mid-stomp, mouth closed in a huge grin. Floating just above one shoulder: a glowing playing card seen from the BACK only (deep red with a gold star pattern), tilted, so the secret stays secret. To one side on the stage floor: a small golden hourglass with glowing sand. A few gold confetti pieces and sparkles drift in the beam.

COMPOSITION (important: the picture is cropped)
* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the banner an even thinner slice. Keep the child's head, both arms, the floating card and the hourglass inside the middle 45 percent of the height. The top quarter should be mostly curtains and bulbs, the bottom quarter mostly stage floor.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements. The card shows its back only, never a word or picture on its face.

FILE ORGANISATION
Create the directory if it does not exist:
assets/playmona_assets/charades/
Save it as:
assets/playmona_assets/charades/cover.png

WORKFLOW
* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or digits, if the card shows a face with a word or picture, if there is more than one character, if the pose doesn't read clearly as an elephant, or if the child is not near the vertical middle.
* Verify the file exists and is a valid image.
```
