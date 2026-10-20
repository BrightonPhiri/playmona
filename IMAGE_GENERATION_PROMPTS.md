# IMAGE GENERATION PROMPT LIST — Family Fun

Hub UI (heroes, posters, category tiles) has a dedicated prompt list: **`AI_ART_PROMPTS.md`**. Use that for the new look.

The prompts below are for **in-game illustrations** (animals, food, landmarks, etc.).

---

The shipped illustrations are original, flat, family-friendly **SVG** artwork. If you regenerate
any of them (or want raster versions), use these prompts. All images must be: family-friendly,
high contrast, clear, recognisable, TV-suitable, **no text**, **no watermark**.

Recommended style (for any generator): *flat vector illustration, clean bold shapes, soft
rounded background, 4–6 colours, centred composition, simple and instantly recognisable.*

| Filename | Game | Prompt |
|---|---|---|
| `animal-<name>.svg` (lion, elephant, giraffe, zebra, tiger, panda, penguin, dolphin, etc.) | Guess the Animal / Picture Memory | "Flat vector illustration of a [ANIMAL], centred, simple rounded light-blue background, bold friendly shapes, no text, no watermark, instantly recognisable silhouette, family-friendly." |
| `food-<name>.svg` (pizza, sushi, tacos, sadza, jollof-rice, dumplings, paella…) | Guess the Food | "Flat vector illustration of [FOOD DISH] on a plate, centred, simple rounded light background, appetising colours, no text, no watermark, clearly recognisable, family-friendly." |
| `landmark-<name>.svg` (victoria-falls, eiffel-tower, pyramids, taj-mahal, kilimanjaro…) | Guess the Landmark / Where in the World | "Flat vector illustration of [LANDMARK], iconic silhouette, centred, simple rounded sky background, no text, no watermark, instantly recognisable, family-friendly." |
| `object-<name>.svg` (ball, clock, umbrella, guitar, bicycle…) | Guess the Object | "Flat vector illustration of a [OBJECT], centred on a simple rounded background, bold shapes, no text, no watermark, easily recognisable, family-friendly." |
| `sport-<name>.svg` (football, tennis, cricket, boxing, swimming…) | Guess the Sport | "Flat vector illustration of [SPORT] in action, simple athlete silhouette with equipment, centred, rounded background, no text, no watermark, family-friendly." |
| `vehicle-<name>.svg` (car, train, airplane, submarine, rocket…) | Guess the Vehicle | "Flat vector illustration of a [VEHICLE], side view, centred, rounded background, bold shapes, no text, no watermark, family-friendly." |
| `charade-<name>.svg` (riding-bicycle, brushing-teeth, taking-selfie…) | Visual Charades | "Flat vector illustration of a person [ACTION], clear exaggerated pose, centred, rounded background, no text, no watermark, family-friendly, suitable for a party game." |
| `riddle-<name>.svg` | Visual Riddle | "Flat vector illustration of a simple visual logic puzzle: [DESCRIBE PUZZLE — e.g. a row of shapes with one missing], clean shapes, no text, no watermark, high contrast, family-friendly." |

## Guidance for raster (WebP/PNG) versions

- Max dimension **1280px** for gameplay photos (see `IMAGE_DOWNLOAD_LIST.md`); illustrations can
  be 512–1024px.
- Export WebP (photos) or SVG/PNG (illustrations). PNG only where transparency is needed.
- Keep each asset small; the whole app should stay easy to copy to a USB drive.

> The app never depends on a missing image: `js/assets.js` falls back from a real image file to
> an SVG illustration to plain text, so partial asset sets are safe.
