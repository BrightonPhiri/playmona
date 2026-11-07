# Ball Swap: Codex prompt pack

One cover for **Ball Swap**. Paste the prompt into Codex, opened in the
`playmona` folder. Then tell Claude it's ready, and Claude crops and compresses
it with `python tools/process-game-art.py ballSwap`.

The raw file lands in `assets/playmona_assets/ball-swap/`, which git ignores.
Until then the game shows the Reaction category wash.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Ball Swap" puzzle game on the Playmona gaming platform.

THE GAME

Two clear glass bowls, A and B, sit side by side, each full of glossy coloured balls. Players race to put every ball in the bowl its colour belongs in, but every move is a swap: one ball from bowl A and one from bowl B leap across and trade places at the same moment. Online, everyone gets the same bowls and the first to finish wins.

LOOK

* Premium glossy 3D key art, like a top mobile puzzle title: crisp, clean, bright highlights, soft reflections. Not a photo, not a painting, not cartoon-flat.
* It must look different from the platform's other covers (dark painterly living rooms with a warm lamp, wildlife photos, Quick Tap's single green button, and Number Rush's neon rings). So: no room, no lamp, no table, no animals, no hands or people, no rings or numbers.
* Background: a deep navy space (#0B1430) with a soft blue glow (#1B2A63) behind the bowls, a few tiny floating sparkles.
* Two identical wide, round, transparent glass bowls sit side by side on an invisible surface, with soft pale-blue glass edges, a bright highlight streak on each, and gentle reflections of the balls inside. Leave a clear gap between them.
* The left bowl is filled mostly with glossy red balls (#F43F5E), the right bowl mostly with glossy blue balls (#3B82F6). A few yellow (#FACC15), green (#22C55E) and purple (#A855F7) balls are mixed in. Every ball is a perfect shiny sphere with a white specular highlight and a darker shade underneath, like a polished billiard or gumball. The balls are plain: NO symbols, numbers, letters or patterns on them.
* The hero moment: exactly TWO balls in mid-air above the gap between the bowls, crossing each other in a smooth arc, a red ball flying from the left bowl to the right and a blue ball flying from the right bowl to the left at the same moment. Short glowing motion trails follow each ball along its arc, red-tinted and blue-tinted. A soft burst of light where their paths cross.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* Game cards show only the MIDDLE of the picture (a wide band across the centre), and the game's banner shows an even thinner slice. Keep both bowls AND the two crossing balls inside the middle 45 percent of the height, with the crossing point at the exact centre. Both bowls must be fully visible side by side across the width, not cut off at the edges.
* The top and bottom quarters should be mostly dark space with a few sparkles and soft glow.
* No text, letters, numbers, labels (do NOT write "A" or "B"), logos, watermarks, frames or UI elements.

FILE ORGANISATION

Create the directory if it does not exist:

assets/playmona_assets/ball-swap/

Save it as:

assets/playmona_assets/ball-swap/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text or letters, if the balls are not round and glossy, if more or fewer than two balls are flying between the bowls, if the two flying balls are not going in opposite directions, or if the bowls and the crossing point are not in the vertical middle.
* Verify the file exists and is a valid image.
```
