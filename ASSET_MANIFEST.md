# ASSET MANIFEST — Family Fun

Every runtime asset is bundled locally. The app has **no remote dependencies** (no CDN, fonts,
scripts, or images). Vector artwork is inline SVG so it stays sharp on 4K TVs and loads instantly.

## App branding (original)

| Filename | Type | Purpose | Source |
|---|---|---|---|
| `assets/icons/favicon.svg` | SVG | Browser tab icon | Original |
| `assets/icons/app-icon.svg` | SVG (512×512) | App icon / Android-ready artwork | Original |
| `assets/images/logo.webp` | WebP | In-app logo (header, hero, about) | Original |
| `js/app.js` → `FF.Brand.logoSvg` | inline SVG | Logo fallback if the WebP is unavailable | Original |

## Flag library (file-based, with original vector fallback)

The game now prefers **real-world flag files** in `assets/flags/` (one SVG per ISO 3166-1
alpha-2 code, e.g. `assets/flags/za.svg`). `js/data/flagcodes.js` maps each country id to its
code, and `js/flagrenderer.js` loads the file via `<img>` with the original vector artwork as an
automatic fallback if a file is missing (keeps `file://` offline safe).

The original simplified flags remain in `js/data/countries.js` (each country has `flag.svg` or
`flag.spec`, viewBox `0 0 300 200`) and render instantly with zero network/file access.

| Group | Example countries | File flags | Fallback |
|---|---|---|---|
| Africa (25+) | Zimbabwe, South Africa, Nigeria, Kenya, Ghana, Egypt… | `assets/flags/<code>.svg` | inline SVG/spec in `js/data/countries.js` |
| World | USA, UK, Japan, Brazil, India, France, Germany… | `assets/flags/<code>.svg` | inline SVG/spec in `js/data/countries.js` |

## Original SVG illustration library

Inline SVG illustrations (viewBox `0 0 200 200`, flat vector, family-friendly) drive the visual
games. Stored in the data files listed below.

| Category | Count | File | Used by |
|---|---|---|---|
| Animals | 28+ | `js/data/visual.js` | Guess the Animal, Picture Memory, Picture Quiz, Picture Puzzle |
| Food | 28+ | `js/data/visual.js` | Guess the Food, Picture Quiz, Where in the World |
| Landmarks | 18+ | `js/data/visual.js` | Guess the Landmark, Where in the World, Picture Puzzle |
| Objects | 28+ | `js/data/visual.js` | Guess the Object, Picture Quiz, Picture Puzzle |
| Sports | 16+ | `js/data/visual2.js` | Guess the Sport |
| Vehicles | 20+ | `js/data/visual2.js` | Guess the Vehicle |
| Visual charades | 40+ | `js/data/visual2.js` | Visual Charades |
| Visual riddles | 26+ | `js/data/visual2.js` | Visual Riddle |

## Sound & music

No audio files — all sound effects and background music are synthesised at runtime with the
**Web Audio API** (`js/audio.js`). This keeps the package tiny and avoids licensing.

## Fonts

Bundled locally in `assets/fonts/` (WOFF2, latin subset), declared in `css/fonts.css`, and
selectable in **Settings → Appearance → Font**. No remote fonts at runtime. **Default: Fredoka.**

| Font | Weights | File |
|---|---|---|
| Nunito | 200–1000 (variable) | `assets/fonts/nunito.woff2` |
| Fredoka | 300–700 (variable) | `assets/fonts/fredoka.woff2` |
| Baloo 2 | 400–800 (variable) | `assets/fonts/baloo.woff2` |
| Quicksand | 300–700 (variable) | `assets/fonts/quicksand.woff2` |
| Atkinson Hyperlegible | 400, 700 | `assets/fonts/atkinson-400.woff2`, `assets/fonts/atkinson-700.woff2` |

All are SIL Open Font License 1.1. Regenerate with `node tools/download-assets.js`.

## Icons

Two icon styles ship with the app and are switchable in **Settings → Appearance → Icon style**:

- **Custom** (default) — original 24×24 monochrome line icons in `js/icons-custom.js`
  (`FF.Icons.custom`). They use `currentColor`, so they take the selected accent colour.
- **Phosphor** (optional) — MIT, bold weight. Raw SVGs are in `assets/icons/phosphor/`; the
  runtime copies are inlined into `js/icons.js` so the app works offline from `file://`.

Both sets are keyed identically (`js/icons.js` maps nav/category/game ids → keys). Unicode emoji
remain in use for in-game content (e.g. memory cards, charades prompts).

Regenerate the Phosphor set with `node tools/download-assets.js`. See
`ICON_GENERATION_PROMPTS.md` to regenerate/replace the custom set.

## Optional user-supplied photos

Photorealistic upgrades (not required — the SVG illustrations already power every game) can be
added under:

```text
assets/images/
├── animals/
├── food/
├── landmarks/
├── objects/
├── sports/
└── vehicles/
```

See `IMAGE_DOWNLOAD_LIST.md` for license-safe sources and required attribution.
