# ICON GENERATION PROMPTS — Family Fun

Family Fun ships with **two** icon styles, both local SVG:

| Style | Default? | Where it lives | Look |
|---|---|---|---|
| **Custom** | ✅ yes | `js/icons-custom.js` → `FF.Icons.custom` | 24×24 line icons, `currentColor`, inherit the accent colour |
| **Phosphor** | optional | `js/icons.js` → `FF.Icons.set` | MIT, bold fill icons |

Users switch between them in **Settings → Appearance → Icon style**. The app never deletes
either set — both stay bundled.

> **These prompts are for regenerating or replacing the Custom set.** If you generate nicer
> icons with an AI image model, paste each SVG into `FF.Icons.custom` in `js/icons-custom.js`
> (keep the same keys — the whole app looks icons up by key, not by file).

---

## Exact style spec (feed this to any SVG generator)

```
Flat vector app icon, 24×24 viewBox, monochrome, stroke style.
- Use `fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round"`.
- Single colour only (currentColor) — NO gradients, NO fills, NO shadows, NO text.
- Rounded, friendly, clean glyph, centred with ~2px breathing room inside the 24×24 box.
- Recognisable at small sizes (game cards, nav bar) and large sizes (game intro).
- Family-friendly, modern game-hub aesthetic.
```

The icon MUST use `currentColor` (not a hard-coded hex) so it automatically takes the
**selected accent colour** everywhere it appears.

---

## Master prompt (generate the whole set at once)

> Create a cohesive set of 65 monochrome 24×24 line icons for a family game app. Every icon:
> `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
> stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">…</svg>`, single `currentColor`
> stroke, rounded, no fills, no gradients, no text. Return one icon per key using the exact keys
> and subjects below.

Then paste the list of keys + subjects from the tables below.

---

## Keys & subjects (65 total)

### Navigation / menu (6)
| Key | Subject |
|---|---|
| `house` | A cosy house with a door |
| `game-controller` | A rounded gamepad with a D-pad and two buttons |
| `users-three` | Three people (two large + one small) |
| `trophy` | A winner's trophy cup |
| `star` | A filled/outlined star |
| `gear` | A settings cog |

### Categories (9)
| Key | Subject |
|---|---|
| `text-aa` | The letters "A a" |
| `brain` | A brain |
| `eye` | An open eye |
| `puzzle-piece` | A jigsaw piece |
| `lightning` | A lightning bolt |
| `paint-brush` | A paintbrush |
| `calculator` | A calculator |
| `confetti` | Confetti and a star |
| `globe-hemisphere-west` | A globe with meridians |

### Games — Words (5)
| Key | Subject |
|---|---|
| `keyboard` | A keyboard key |
| `shuffle` | Two crossed arrows (shuffle) |
| `stack` | Stacked layers/blocks |
| `link` | Two chain links |
| `squares-four` | A 2×2 grid |

### Games — Quiz (5)
| Key | Subject |
|---|---|
| `brain` | A brain (see above) |
| `scales` | A balance scale |
| `lightning` | A lightning bolt (see above) |
| `detective` | A magnifying glass over a question mark |
| `image` | A picture frame with a mountain scene |

### Games — Visual (10)
| Key | Subject |
|---|---|
| `puzzle-piece` | A jigsaw piece (see above) |
| `magnifying-glass` | A magnifying glass |
| `binoculars` | Binoculars |
| `question` | A question mark in a circle |
| `buildings` | A landmark/building |
| `paw-print` | A paw print |
| `fork-knife` | A fork and knife |
| `cube` | A 3D cube |
| `medal` | A medal with a star |
| `car` | A car |

### Games — Memory (4)
| Key | Subject |
|---|---|
| `cards` | Two playing cards |
| `images` | A stack of photos |
| `eye-slash` | An eye with a slash |
| `list-numbers` | A numbered list |

### Games — Reaction (2)
| Key | Subject |
|---|---|
| `hand-tap` | A hand tapping |
| `drop` | A water drop |

### Games — Creative (5)
| Key | Subject |
|---|---|
| `person-arms-spread` | A person acting with arms out |
| `image-square` | A square picture frame |
| `x-circle` | A circle with an ✕ inside |
| `pencil` | A pencil |
| `chalkboard` | A chalkboard easel |

### Games — Numbers (2)
| Key | Subject |
|---|---|
| `hash` | A hash / number sign |
| `chart-line` | A rising line chart |

### Games — Party (3)
| Key | Subject |
|---|---|
| `arrows-left-right` | Left/right arrows |
| `split-horizontal` | A vertical divider with two arrows |
| `target` | A target / bullseye |

### Games — World (5)
| Key | Subject |
|---|---|
| `globe` | A globe |
| `map-pin` | A map pin |
| `map-trifold` | A folded map |
| `city` | A city skyline |
| `flag` | A waving flag |

### UI / shell (13)
| Key | Subject |
|---|---|
| `play` | A play triangle |
| `moon` | A crescent moon |
| `sun` | A sun |
| `monitor` | A monitor |
| `arrows-out` | Four outward arrows (expand) |
| `x` | An ✕ |
| `check` | A checkmark |
| `info` | An info circle |
| `heart` | A heart |
| `fire` | A flame |
| `sparkle` | A sparkle |
| `timer` | A stopwatch |

---

## How to install the generated icons

1. Generate each icon as a single-line `<svg>…</svg>` string.
2. Open `js/icons-custom.js`.
3. In `FF.Icons.custom`, replace the value for the matching key:

```js
'star': ico('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.2l5.9-.9L12 3Z"/>'),
```

   Keep the `ico('…')` wrapper (or paste the full `<svg>…</svg>` string directly).
4. **Do not change the keys** — `js/icons.js` maps game ids → keys, and the app looks icons up
   by key.
5. Save and reload `index.html`. Icons inherit the accent colour automatically.

> You can also add brand-new keys if a future game needs one — just add the key to
> `FF.Icons.custom` and reference it from the game's `FF.Icons.game`/`category` map.
