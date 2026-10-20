# Family Fun — AI art prompts

Drop generated files into the folders below. The app already looks for them. Missing files are fine: each card and banner falls back to a coloured wash so nothing looks broken.

| Kind | Folder | Size | Format |
|---|---|---|---|
| Hub backgrounds | `assets/images/ui/` | 1920×1080 | WebP |
| Category tiles / banners | `assets/images/categories/cat-{name}.webp` | 1600×900 | WebP |
| Game posters | `assets/images/covers/` | 1024×1365 (3:4) | WebP |
| App / nav / game icons | `assets/images/icons/` | 1024×1024, **transparent PNG** | PNG or WebP |
| Logo | `assets/images/logo.webp` | 512×512, transparent | WebP |

**No text, no letters, no logos, no watermarks, no UI chrome in any image.** Family-friendly. TV-safe (readable from a sofa).

---

## Shared style lock

Paste this at the start of **every** prompt so the set matches:

```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration, not photoreal, not anime, not flat corporate vector. Warm lamp light, ink-navy shadows, coral #ff6b4a and antique-gold highlights, cream paper accents. Slight film grain. Cozy, cinematic, inviting. One clear subject filling the frame. No text, no letters, no watermark, no logo.
```

**Icon extra line** (add after the style lock for every icon):

```
Friendly 3D clay-render app icon, soft studio lighting, rounded forms, slight plastic sheen, centered on a transparent background, square composition, readable at 64 pixels.
```

---

## 1. Hub backgrounds

Save in `assets/images/ui/`. Size **1920×1080**. Leave a darker lower third so white titles stay readable.

### `hero-home.webp` — Home hero
```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration, not photoreal, not anime, not flat corporate vector. Warm lamp light, ink-navy shadows, coral #ff6b4a and antique-gold highlights, cream paper accents. Slight film grain. Cozy, cinematic, inviting. One clear subject filling the frame. No text, no letters, no watermark, no logo.

Wide cinematic living-room scene at dusk: a big television glowing in the dark, a sofa with colourful cushions, a coffee table covered in board-game boxes, popcorn and fizzy drinks, fairy lights, a window with evening blue outside. Empty lower-left third for a title overlay. Shot as if sitting on the sofa looking toward the TV.
```

### `app-bg.webp` — Soft page wallpaper
```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration, not photoreal, not anime. Warm lamp light, ink-navy shadows, coral and antique-gold highlights. Slight film grain. No text, no watermark.

Very abstract, out-of-focus living-room at night: bokeh lamp globes, deep navy walls, a hint of a TV glow. Extremely soft and dark so UI can sit on top. Almost a texture, not a scene.
```

### `hero-games.webp` — Games library banner
```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration. Warm lamp light, ink-navy shadows, coral and gold. No text, no watermark.

A wall of colourful board-game boxes on wooden shelves, slightly tilted like a game cafe, spotlight on the middle shelf, cinematic wide crop, darker lower third for a title.
```

### `gamenight.webp` — Game Night banner
```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration. Warm lamp light, ink-navy shadows, coral and antique gold. No text, no watermark.

A round table from above at night: six hands reaching toward a glowing trophy cup in the centre, snack bowls, cards, a string of bistro lights, celebratory confetti in the air, cinematic and festive, darker edges.
```

### `favorites.webp` — Favorites banner
```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration. Warm lamp light, ink-navy shadows. No text, no watermark.

A cork pinboard in a cozy den, gold stars and polaroid-style game snapshots pinned with colourful tacks, fairy lights around the frame, cinematic, darker lower third.
```

### `scores.webp` — Stats banner
```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration. Warm lamp light, ink-navy shadows, antique gold. No text, no watermark.

A mantelpiece trophy shelf in a family living room: gold cups, medals, a small crown, lamplight catching the metal, cinematic still life, darker lower third.
```

### `players.webp` — Players banner
```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration. Warm lamp light, ink-navy shadows, coral. No text, no watermark.

Four empty colourful game-night chairs around a coffee table, each chair a different colour (coral, teal, gold, violet), cushions and controllers waiting, cozy den, cinematic wide crop.
```

### Category images (`cat-*.webp`)
Save in `assets/images/categories/`. Size **1600×900**. The same file is used for the Browse-by-vibe tile and the Games page banner.

| File | Prompt subject |
|---|---|
| `cat-words.webp` | A heap of wooden letter tiles and a dictionary on a lamp-lit table |
| `cat-quiz.webp` | A glowing quiz-show buzzer and a thinking-brain silhouette in lamplight |
| `cat-visual.webp` | A picture frame on an easel, colourful illustrations spilling out |
| `cat-memory.webp` | Face-down playing cards in a neat grid on walnut, one card flipping |
| `cat-reaction.webp` | A hand about to tap a glowing red button, motion blur, sparks |
| `cat-creative.webp` | Paintbrushes, crayons and a sketchbook on a craft table |
| `cat-numbers.webp` | Chalk numbers and a calculator on a dark school-desk still life |
| `cat-party.webp` | Party hats, confetti burst, string lights, living-room celebration |
| `cat-world.webp` | A vintage globe, folded map and travel stamps on a desk at night |

Use this full prompt, swapping the subject:

```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration, not photoreal, not anime. Warm lamp light, ink-navy shadows, coral #ff6b4a and antique-gold highlights. Slight film grain. Cozy, cinematic. No text, no letters, no watermark, no logo.

Cinematic wide still life: [SUBJECT]. Darker lower third for a title overlay. Family-friendly, TV-safe.
```

---

## 2. Category tiles

These reuse the same files as above: `assets/images/categories/cat-{name}.webp`. You do not need a second set.

---

## 3. Game posters (covers)

Save in `assets/images/covers/{id}.webp`. Size **1024×1365** (portrait 3:4). Darken the bottom third so the game name can sit on it.

Full prompt template — replace `[SUBJECT]`:

```
Family Fun visual style: Saturday living-room game night. Painterly digital illustration, not photoreal, not anime, not flat corporate vector. Warm lamp light, ink-navy shadows, coral #ff6b4a and antique-gold highlights, cream paper accents. Slight film grain. Cozy, cinematic, inviting. No text, no letters, no watermark, no logo.

Portrait game-box poster, 3:4, one clear subject filling the frame: [SUBJECT]. Darker bottom third for a title overlay. Family-friendly, TV-safe, rich colour.
```

### Words
| File | Subject |
|---|---|
| `letterRush.webp` | Alphabet tiles racing across a table, motion blur, a timer hourglass |
| `wordScramble.webp` | Scrambled wooden letters mid-air, about to snap into a word |
| `wordBuilder.webp` | Letter blocks stacking into a colourful tower |
| `wordChain.webp` | A chain of linked letter beads glowing gold |
| `miniCrossword.webp` | A tiny crossword grid with a pencil and a mug of tea |

### Quiz
| File | Subject |
|---|---|
| `familyQuiz.webp` | A family quiz-night podium with a glowing question-mark lamp |
| `trueOrFalse.webp` | A golden balance scale weighing a tick against a cross, no letters |
| `brainBattle.webp` | Two stylised brains duelling with lightning between them |
| `guessWho.webp` | A detective hat and magnifying glass over a row of mystery silhouettes |
| `pictureQuiz.webp` | Polaroid photos fanned out on a coffee table |

### Visual / puzzles
| File | Subject |
|---|---|
| `picturePuzzle.webp` | A jigsaw of a living-room scene with one piece hovering |
| `spotDifference.webp` | Twin illustrated rooms, a magnifying glass hovering over a tiny difference |
| `hiddenObject.webp` | A busy toy-strewn living room, a single golden key hidden in the clutter |
| `visualRiddle.webp` | Geometric shapes arranged as a glowing night-time puzzle |
| `guessLandmark.webp` | Famous world landmarks as toys on a living-room rug |
| `guessAnimal.webp` | Friendly illustrated safari animals peeking from behind a sofa |
| `guessFood.webp` | A feast of world dishes on a family dinner table, overhead |
| `guessObject.webp` | Everyday objects (clock, umbrella, bicycle) arranged as a still life |
| `guessSport.webp` | Sports kit (ball, racket, medal) in a sunbeam on a wooden floor |
| `guessVehicle.webp` | Toy cars, a train and a rocket on a playroom runway |

### Memory
| File | Subject |
|---|---|
| `memoryMatch.webp` | Face-down illustrated cards in a neat grid, two matching cards flipping |
| `pictureMemory.webp` | A swirl of picture cards flying into pairs |
| `whatsMissing.webp` | A tray of colourful objects with one obvious empty silhouette |
| `rememberSequence.webp` | Four glowing coloured pads lighting in sequence, Simon-style |

### Reaction
| File | Subject |
|---|---|
| `quickTap.webp` | A hand about to tap a glowing coral button, sparks, freeze-frame |
| `colorReaction.webp` | Colour droplets splashing onto a dark table, one droplet highlighted |

### Creative / party
| File | Subject |
|---|---|
| `charades.webp` | A person mid-charade, arms wide, spotlight, living-room audience silhouettes |
| `visualCharades.webp` | A picture card held up, someone acting it out in shadow |
| `dontSayIt.webp` | A person with a playful taped-mouth gesture, forbidden-word cards face down (no readable words) |
| `drawingChallenge.webp` | A sketchbook and pencils, a drawing coming to life off the page |
| `pictionary.webp` | An easel in the living room, colourful crayon strokes, guessing family silhouettes |
| `wouldYouRather.webp` | A forked glowing path splitting left and right through a night garden |
| `thisOrThat.webp` | Two glowing doorways, coral vs teal, a person choosing |
| `whoIsMostLikely.webp` | A playful target dartboard of cartoon family portraits (no real faces) |

### Numbers
| File | Subject |
|---|---|
| `numberChallenge.webp` | Floating gold numerals and a chalkboard, lamplight |
| `higherOrLower.webp` | A rising gold line-chart made of wooden blocks |

### World
| File | Subject |
|---|---|
| `guessCountry.webp` | A glowing globe with a flag-like ribbon (abstract, no real flag text) |
| `whereInWorld.webp` | A map, compass and suitcase on a midnight desk |
| `mapChallenge.webp` | A painted world map on the floor, game pieces as travellers |
| `capitalChallenge.webp` | A stylised city skyline of famous capitals at dusk |
| `guessFlag.webp` | Colourful abstract flag-like banners on poles, no real national flags, festive |

---

## 4. Icons (full set)

These replace or sit alongside the bundled SVG glyphs. Save as **1024×1024 PNG with transparency** in `assets/images/icons/{key}.png` (or `.webp`).

If you generate SVG instead, paste each into `js/icons-custom.js` using the same keys (see `ICON_GENERATION_PROMPTS.md`).

**Master icon prompt** (then the subject line):

```
Family Fun visual style: Saturday living-room game night colours (ink navy, coral #ff6b4a, antique gold, cream). Friendly 3D clay-render app icon, soft studio lighting, rounded forms, slight plastic sheen, centered on a transparent background, square 1:1 composition, high detail but readable at 64px. Single object, no text, no letters, no watermark, no background scene, no drop shadow outside the object.
```

### Navigation
| File / key | Subject line to append |
|---|---|
| `house` | A cozy house with a round door and a warm window glow |
| `game-controller` | A rounded gamepad with a D-pad and two candy-coloured buttons |
| `users-three` | Three friendly clay people, two large and one small, standing together |
| `trophy` | A shiny gold cup trophy with small handles |
| `star` | A plump five-point star, antique gold |
| `gear` | A rounded settings cog, coral and cream |

### Categories
| File / key | Subject line |
|---|---|
| `text-aa` | Two chunky letter-block shapes (abstract, not readable letters) stacked |
| `brain` | A friendly stylised brain, coral and cream |
| `eye` | A simple open eye with a gold iris |
| `puzzle-piece` | One plump jigsaw piece, coral |
| `lightning` | A chunky lightning bolt, gold |
| `paint-brush` | A round paintbrush with a coral paint blob |
| `calculator` | A cute rounded calculator |
| `confetti` | A burst of confetti shards and a tiny star |
| `globe-hemisphere-west` | A small desk globe, teal oceans, gold stand |

### Game icons
| File / key | Subject line |
|---|---|
| `keyboard` | A single chunky keyboard key, cream |
| `shuffle` | Two crossed rounded arrows |
| `stack` | Three stacked rounded layers / tiles |
| `link` | Two plump chain links |
| `squares-four` | A 2×2 grid of rounded tiles |
| `scales` | A tiny balance scale |
| `detective` | A magnifying glass over a question-mark blob (the blob is a shape, not a glyph) |
| `image` | A tiny picture frame with a mountain scene |
| `magnifying-glass` | A classic magnifying glass, gold rim |
| `binoculars` | Compact binoculars |
| `question` | A round badge with a raised question-mark shape |
| `buildings` | A tiny landmark building / tower |
| `paw-print` | A friendly animal paw print |
| `fork-knife` | A fork and knife, rounded clay |
| `cube` | A 3D cube, coral |
| `medal` | A medal on a ribbon with a star |
| `car` | A cute rounded car, side view |
| `cards` | Two overlapping playing cards, backs only |
| `images` | A small stack of photos |
| `eye-slash` | An eye with a soft diagonal bar |
| `list-numbers` | Three stacked rounded bars suggesting a list |
| `hand-tap` | A hand tapping a button |
| `drop` | A water droplet, teal |
| `person-arms-spread` | A clay person with arms out, acting |
| `image-square` | A square picture frame |
| `x-circle` | A circle with a raised X, coral |
| `pencil` | A short plump pencil |
| `chalkboard` | A tiny easel chalkboard |
| `hash` | A chunky hash / number-sign block |
| `chart-line` | A tiny rising 3D line chart |
| `arrows-left-right` | Left and right arrows |
| `split-horizontal` | A vertical divider with arrows pointing out |
| `target` | A bullseye target |
| `globe` | A full globe |
| `map-pin` | A map pin, coral |
| `map-trifold` | A folded paper map |
| `city` | A tiny city skyline |
| `flag` | A waving triangular pennant, no real flag |

### UI chrome
| File / key | Subject line |
|---|---|
| `play` | A play triangle in a rounded square |
| `moon` | A crescent moon |
| `sun` | A friendly sun with rounded rays |
| `monitor` | A small TV / monitor |
| `arrows-out` | Four outward arrows (fullscreen) |
| `x` | A chunky X |
| `check` | A chunky checkmark |
| `info` | An i-mark in a circle (the i is a shape, keep it tiny and bold) |
| `heart` | A plump heart |
| `fire` | A small flame |
| `sparkle` | A four-point sparkle |
| `timer` | A stopwatch |
| `city` | (see world) |

### Logo
**Save as** `assets/images/logo.webp` (also used in the header).

```
Family Fun visual style: Saturday living-room game night colours (ink navy, coral #ff6b4a, antique gold, cream). Friendly 3D clay-render app icon, soft studio lighting, rounded forms, slight plastic sheen, centered on a transparent background, square 1:1.

A rounded-square app icon: a gamepad hugging a little house, coral-to-gold gradient body, warm window glow, no text, no letters, no watermark. Looks great at 48px and 512px.
```

Also export a 64×64 favicon-friendly version if your generator allows.

---

## 5. How to install

1. Generate each image with the matching prompt.
2. Crop to the size in the table (covers must stay **portrait 3:4**).
3. Export **WebP** for photos/covers (smaller) and **PNG** for icons if you need transparency.
4. Save using the **exact filenames** above. The app looks up files by those names.
5. Reload `index.html`. New art appears automatically. Anything you skip stays on the colour wash.

Optional SVG path for chrome icons: keep generating with the icon style, convert to SVG, and paste into `FF.Icons.custom` in `js/icons-custom.js` using the same keys.
