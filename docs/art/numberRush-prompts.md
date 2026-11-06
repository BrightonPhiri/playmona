# Number Rush: Codex prompt pack

One cover for **Number Rush**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py numberRush`.

The raw file lands in `assets/playmona_assets/number-rush/`, which git ignores.
Until then the game shows the Numbers category wash.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Number Rush" arcade game on the Playmona gaming platform.

THE GAME

Glowing numbered buttons ride on concentric neon rings that spin, some clockwise and some anticlockwise. Players race to tap the numbers in order (0, 1, 2, 3...) before the clock runs out. Online, everyone chases the same spinning rings at the same moment.

LOOK

* Premium neon arcade key art: crisp, glossy 3D rendering with glowing light, like a top mobile arcade title. Not a photo, not a painting.
* It must look different from the platform's other covers (dark painterly living rooms with a warm lamp, wildlife photos, and Quick Tap's single green button). So: no room, no lamp, no animals, no hand, no single big button.
* Scene: seen from slightly above, three or four concentric glowing rings float over a deep navy-to-black space (#070A22) with a soft violet glow (#1A1060) at the centre. Round glossy dark-blue discs sit evenly spaced along each ring, each rimmed with a neon edge in cyan (#22D3EE), violet (#A78BFA), pink (#F472B6), yellow (#FACC15), green (#4ADE80) or orange (#FB923C). Motion trails curve along the rings in opposite directions to show them spinning both ways.
* One disc near the middle is popping in a bright burst of green sparks (#2EE86B). A golden glow (#FFC83D) sits at the very centre, like a target.
* The discs are blank: plain glowing faces with NO digits on them.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the game's banner shows an even thinner slice. Centre the rings so the golden centre and the popping disc sit in the middle 40 percent of the height. The top and bottom quarters should be mostly dark space with a few drifting sparks and ring edges.
* No text, letters, numbers, digits, logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/number-rush/

Save it as:

assets/playmona_assets/number-rush/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if any disc shows digits or text, if the rings are not round and concentric, or if the burst is not near the vertical middle.
* Verify the file exists and is a valid image.
```
