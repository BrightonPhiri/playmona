# Quiz Mix: Codex prompt pack

One new cover for **Quiz Mix** (game id `familyQuiz`). It replaces the old
dark, lamp-lit family scene with a bright game-show look that shows the
game's 15 topics, matching the glossy style of the new Letter Rush cover.

How to use it:

1. Paste the **Cover** prompt into Codex, opened in the `playmona` folder.
2. Tell Claude the file is ready. Claude crops and compresses it to
   `assets/images/covers/familyQuiz.webp` with
   `python tools/process-game-art.py familyQuiz`, which also refreshes the
   asset manifest so the new cover shows at once.
3. If it needs another go, use the **Redo** prompt at the end.

The raw file lands in `assets/playmona_assets/quiz-mix/`. Git ignores it;
only the compressed copy ships.

---

## Cover

```
Use the image generation capability to generate ONE cover image for the "Quiz Mix" trivia game on the Playmona gaming platform.

LOOK

* A bright, high-energy 3D render, like premium key art for a hit TV quiz show or a top mobile trivia game. Glossy, tactile, playful and modern, with crisp studio lighting, rich colour and a shallow depth of field.
* It must feel completely different from the platform's old covers, which are dark, painterly living-room scenes lit by a warm lamp. No room, no sofa, no lamp, no people or hands, no painting style, no dark vignette.
* Scene: in the centre, a giant glossy 3D question mark made of smooth candy-like plastic in an electric-blue-to-purple gradient, rimmed with small glowing marquee bulbs, standing on a round, softly lit game-show podium.
* Around it, a ring of glossy 3D topic objects float and orbit like a prize wheel: a globe, a film clapperboard, a music note, a football, a stack of books, a game controller, a test tube with bubbles, a paw print, a slice of pizza, a painter's palette, a lightbulb, a trophy and a laptop. Each object is chunky and toy-like, in its own bright colour.
* Four large glossy answer tokens float in front at the four corners of the centre area: a red triangle, a blue diamond, a yellow circle and a green square, like the answer buttons of a quiz game, slightly blurred by motion.
* Background: a vivid stage. Deep violet at the edges, sweeping spotlight beams in cyan and pink, an electric blue and warm pink-orange glow behind the question mark, sparkles and a little falling confetti.
* Colour palette: navy #0b1030, electric blue #1e7bff, cyan #19c3f0, purple #8b3cf7, hot pink #ff2f8f, orange #ff8a1f, yellow #ffc83d, green #2ec84b.

COMPOSITION (important: the picture is cropped)

* Portrait image, 1024 x 1536 or larger.
* The game card and the wide banner show only the MIDDLE of the picture, so the question mark, the podium top and most of the topic ring must sit in the middle 50 percent of the height, centred left to right. The top and bottom quarters should hold only spotlight beams, confetti and a few blurred objects.
* No text, letters, numbers, logos, watermarks, frames, buttons or game interface. The question mark is the only symbol.

FILE ORGANISATION

Save it as:

assets/playmona_assets/quiz-mix/cover.png

WORKFLOW

* Generate it with a single request (not a collage).
* Look at it. Regenerate if there is any text, letter or number anywhere, if the question mark is malformed or mirrored, or if the objects melt into each other.
* Verify the file exists and is a valid image.
```

---

## Redo (if the cover is rejected after review)

Claude fills in what was wrong after review.

```
Use the image generation capability to regenerate the cover image for the "Quiz Mix" trivia game on the Playmona gaming platform, replacing assets/playmona_assets/quiz-mix/cover.png. Follow exactly the same LOOK and COMPOSITION rules as before: a bright, glossy 3D game-show render, a giant blue-to-purple question mark with marquee bulbs on a podium, a ring of glossy topic objects around it, four coloured answer-shape tokens, spotlights and confetti on a violet stage, portrait 1024 x 1536 or larger, the key subject in the middle 50 percent of the height, no text.

<what was wrong - what to change>

Generate it with a single request, look at it before saving, overwrite the old file, and verify the file exists.
```
