# IMAGE DOWNLOAD LIST — Family Fun (optional photographic upgrades)

The app ships with original SVG illustrations so **every game works offline immediately**. You do
**not** need these files. This list exists if you want to upgrade visual games with photographs.

## Rules before you add any image

- Verify the license allows **redistribution** (not just "free to view").
- Keep attribution alongside the file (a `credits.txt` in the folder, and update `CREDITS.md`).
- Never bundle copyrighted material — no celebrity photos, movie posters, cartoon characters,
  company logos or brand marks. If in doubt, keep the shipped SVG illustration instead.
- Target **≤1280px** on the longest side; WebP or JPEG.

## Recommended sources (allow redistribution — verify each file's license)

| Source | Best for | License note |
|---|---|---|
| [Wikimedia Commons](https://commons.wikimedia.org) | Landmarks, animals, food, flags | Check per-file license (many CC BY / CC BY-SA / public domain) |
| [Openverse](https://openverse.org) | Everything | Filter by license (CC0 / CC BY) |
| [Unsplash](https://unsplash.com) | Landscapes, food, objects | Unsplash License (no hotlinking; download and bundle) |
| [Pexels](https://www.pexels.com) | Food, objects, vehicles | Pexels License |
| Government / public sources | Flags, maps | Usually public domain — verify |

## Suggested downloads (optional)

| Filename | Game | Description | Suggested source | License required |
|---|---|---|---|---|
| `assets/images/landmarks/victoria-falls.webp` | Guess the Landmark | Victoria Falls panorama | Wikimedia Commons | CC BY / public domain |
| `assets/images/landmarks/eiffel-tower.webp` | Guess the Landmark | Eiffel Tower | Wikimedia Commons | CC BY / public domain |
| `assets/images/landmarks/pyramids-giza.webp` | Guess the Landmark | Pyramids of Giza | Wikimedia Commons | CC BY / public domain |
| `assets/images/landmarks/taj-mahal.webp` | Guess the Landmark | Taj Mahal | Wikimedia Commons | CC BY / public domain |
| `assets/images/landmarks/great-wall.webp` | Guess the Landmark | Great Wall of China | Wikimedia Commons | CC BY / public domain |
| `assets/images/animals/lion.webp` | Guess the Animal | Lion | Wikimedia Commons / Pexels | CC BY / public domain |
| `assets/images/animals/elephant.webp` | Guess the Animal | African elephant | Wikimedia Commons | CC BY / public domain |
| `assets/images/animals/giraffe.webp` | Guess the Animal | Giraffe | Wikimedia Commons | CC BY / public domain |
| `assets/images/food/sushi.webp` | Guess the Food | Sushi platter | Unsplash / Pexels | Unsplash / Pexels License |
| `assets/images/food/pizza.webp` | Guess the Food | Pizza | Unsplash / Pexels | Unsplash / Pexels License |
| `assets/images/food/sadza.webp` | Guess the Food | Sadza with relish | Wikimedia Commons | CC BY / public domain |

## How to wire an image in

1. Save the file to the matching folder above.
2. In `js/data/visual.js` (or `visual2.js`), add `image: 'assets/images/<folder>/<file>.webp'`
   to the item and keep its `svg` as the fallback.
3. In the game, render with `api.assets.img({ src: item.image, svg: item.svg, alt: item.name })`.

The built-in fallback chain (file → SVG → text) means a missing image never crashes a game.
