# CREDITS & SOURCES — PlayMona

PlayMona is designed to be fully offline and self-contained. All bundled assets are original
creations or legally redistributable content.

## Original assets

- **Logo, app icon, favicon** — original SVG artwork created for this project.
- **Flag library** — original, simplified vector flag artwork (inline SVG), created from public
  flag specifications (colours and layouts are facts, not copyrightable expression). These remain
  as a built-in fallback. The app now prefers the real-world flag SVGs in `assets/flags/`
  (user-supplied); keep their source attribution alongside the files if you redistribute.
- **Illustrations** (animals, food, landmarks, objects, sports, vehicles, charades, riddles) —
  original flat-vector SVG artwork created for this project.
- **Sound effects & music** — synthesised at runtime via the Web Audio API; no audio files.

## Fonts

Bundled font files live in `assets/fonts/` (WOFF2, latin subset) and are declared in `css/fonts.css`.
All are licensed under the **SIL Open Font License 1.1** (distributed via Google Fonts):

- **Nunito** — designed by Vernon Adams, Cyreal.
- **Fredoka** — designed by Ben Nathan, Hafontia.
- **Baloo 2** — designed by Ek Type.
- **Quicksand** — designed by Andrew Paglinawan.
- **Atkinson Hyperlegible** — designed by the Braille Institute.

## Icons

- **Custom icon set** (default) — original 24×24 monochrome line icons, hand-drawn for this project.
  Defined in `js/icons-custom.js` (`FF.Icons.custom`) and coloured via `currentColor` so they
  inherit the selected accent colour.
- **Phosphor Icons** (bold weight) — the original app-shell icon set, kept as an optional second
  style (switch in Settings → Appearance → Icon style). Bundled in `assets/icons/phosphor/` and
  inlined into `js/icons.js`. Licensed under the **MIT License**. https://phosphoricons.com
- Unicode emoji remain in use for in-game content and decorative text, rendered by the OS.

## Third-party content

- Bundled fonts (SIL OFL 1.1) and Phosphor Icons (MIT) as listed above.
- **qrcode-generator** by Kazuhiko Arase — renders the join QR code for online play.
  Bundled at `js/vendor/qrcode.js`, unmodified. Licensed under the **MIT License**.
  https://github.com/kazuhikoarase/qrcode-generator
  ("QR Code" is a registered trademark of DENSO WAVE INCORPORATED.)
- If you add photographs, record their attribution here and keep the license with the file.

## Notes

- Flags, capital cities, and general facts are factual data.
- The app does not make any network requests and does not collect any data.

*Thank you for playing PlayMona!*
