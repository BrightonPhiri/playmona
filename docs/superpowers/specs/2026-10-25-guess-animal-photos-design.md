# Guess the Animal: realistic wildlife photos and a richer game

## Context

The games were added to test the platform and still look like it. Only 9 of the ~45 games have a cover. All 9 share one look: a painterly, dark living room lit by a warm lamp. The other games show a plain colour wash. Picture games draw their subjects from a few SVG circles (`js/data/visual.js`), and some games use emoji. We are upgrading the games **one at a time**, and **Guess the Animal** is first (it is in the guest set). Brighton chose:

- **Realistic wildlife-photo** pictures.
- **Pictures + a richer game:** about 60 animals, difficulty that really changes play, and better facts.
- **Brighton generates every image in Codex.** My job is to write the prompts and descriptions, then crop, resize and compress the results and wire them into the game. No OpenAI or DeepSeek API calls.

This sets the pattern for every later game: **prompt pack → Brighton generates in Codex → I process the files → I wire them in and improve the game.**

## Constraints found in the code

- `FF.data.visual.animals` (the 31 SVGs) is also used by Memory Match (`js/games/memoryGames.js:200`), Picture Puzzle (`puzzleGames.js:314`) and Picture Quiz (`quizGames.js:215`). **Leave that data alone.** The new roster goes in a new file, `js/data/animals.js` (`FF.data.animals`), that only Guess the Animal reads. The other games move over when their turn comes.
- The watch/TV view and race mode already accept `image: { src }` when the path matches `^assets/[A-Za-z0-9_/.-]+\.webp$` and is at most 200 characters (`js/watch/tv.js:17`, `js/net/race.js:57`, `database.rules.json:411`). So filenames use lowercase kebab-case ids.
- Design-system rules (DEV_GUIDE.md): colours come from `css/tokens.css` only, and the looks go in `css/games.css` with `FF.GameUI`. No inline style objects and no `<style>` injection. Strings go through `FF.t`. **Alt text never names the animal.**
- Cover art goes in `assets/images/covers/<gameId>.webp` at **1086×1448**, about 170–240 KB like the existing covers. Then run `node tools/gen-asset-manifest.js`.
- Codex saves **1254×1254 PNGs of about 2.5 MB** (seen in `assets/playmona_assets/avatars/`). These raw originals are too big for the repo. Add `assets/playmona_assets/` to `.gitignore`, matching the existing "source art is untracked" rule.
- Pillow 12.3 is installed. The processing tool is Python, like `tools/gen-plan-images.py`.

## Step 1: Spec and prompt pack (what Brighton runs in Codex)

1. Save this design as `docs/superpowers/specs/2026-10-25-guess-animal-photos-design.md`.
2. Write `docs/art/guessAnimal-prompts.md`. It is ready to paste into Codex, in the same shape as Brighton's avatar prompt (REQUIREMENTS / FILE ORGANISATION / WORKFLOW). It is split into **4 batches of 16 animals**. Each animal gets 2 images, so each batch is 32 images. One cover prompt comes at the end.
   - **Shared style block, full photo:** an award-winning wildlife photograph, photorealistic and not an illustration. Natural daylight, telephoto lens, shallow depth of field. The animal is in its own natural habitat, and the habitats vary so the set doesn't look alike. The whole animal, or its head and shoulders, is clearly identifiable and centred with room around it for a square crop. No text, watermark, people, frame or logo. One image per file, never a collage. Square, at least 1024 px.
   - **Shared style block, close-up:** an extreme close-up of one distinctive detail that fills the frame. The whole animal is *not* visible, but an attentive player can still tell what it is. Same photographic realism.
   - **Per-animal line:** id, common name, habitat to show, and the close-up detail. Example: `tiger`, a Bengal tiger in a misty Indian forest; close-up of orange-and-black striped fur beside one amber eye.
   - **File organisation:** `assets/playmona_assets/guess-animal/photos/<id>.png`, `.../closeups/<id>.png`, and `.../cover.png`.
   - **Cover prompt:** a portrait at least 1024×1536 in a deliberately new look that is not the lamp-lit room. A bright, golden-hour wildlife photograph full of life, for example a curious meerkat upright in the foreground with zebra and an elephant softly blurred behind. The subject sits in the vertical middle band: game cards crop the cover to 4:3 and featured cards to 16:9, both centred (`.gcard__art`, `css/styles.css:551`), and the title is drawn below the art, not on it.
3. **Roster (64 animals, my call; grouped so lookalikes can be used as wrong answers):**
   - Big cats: lion, tiger, leopard, cheetah, snow leopard
   - Bears: brown bear, polar bear, giant panda
   - Apes and lemurs: gorilla, chimpanzee, orangutan, ring-tailed lemur
   - Savanna: elephant, giraffe, zebra, hippopotamus, rhinoceros, meerkat
   - Farm: horse, cow, pig, sheep, goat, camel
   - Wild mammals: wolf, fox, deer, raccoon, squirrel, hedgehog, sloth, otter
   - Pets: dog, cat, rabbit
   - Australian: kangaroo, koala, platypus
   - Birds: eagle, owl, parrot, penguin, flamingo, peacock, toucan, ostrich, hummingbird
   - Reptiles: crocodile, snake, turtle, chameleon
   - Amphibians: frog
   - Ocean: shark, dolphin, whale, octopus, seal, jellyfish, clownfish, seahorse
   - Insects: butterfly, bee, ant, ladybug

   The old roster's mistakes are fixed: the frog is an amphibian, and dolphin, whale and seal are mammals, not "Marine".

## Step 2: Process the images (after Brighton generates them)

Write `tools/process-game-art.py <gameId>`, which reads `tools/art/<gameId>.json` (ids, output folder, sizes, and an optional per-image crop focus `[x, y]` from 0 to 1 when the subject is off-centre). It:
- Checks every expected file exists and lists any missing, so Brighton can regenerate only those.
- Crops each image to a square around its focus, resizes to **720×720**, and saves WebP at about quality 80, aiming for 60–110 KB. Outputs go to `assets/images/games/guessAnimal/<id>.webp` and `<id>-closeup.webp`.
- Crops the cover to 3:4 and saves it as `assets/images/covers/guessAnimal.webp` at 1086×1448, about 200 KB.
- Builds a contact sheet in the scratchpad so Brighton and I can reject bad images: the wrong animal, a giveaway, text, or a close-up too hard to read. Rejected ids are listed back as a short Codex prompt to redo just those.
- Then runs `node tools/gen-asset-manifest.js`.

## Step 3: Data and game changes

- **`js/data/animals.js`** (new, loaded in `play.html` next to `visual.js`): `FF.data.animals = [{ id, name, group, kind, fact }]`. `name` is sentence case ("Snow leopard"). `kind` is the class shown after answering (Mammal, Bird, Reptile, Amphibian, Fish, Insect, or Invertebrate for octopus and jellyfish). `fact` is one new, accurate, kid-friendly line.
- **`js/games/visualGames.js`, `guessAnimal` (~line 425):** switch it to `FF.data.animals` and photos.
  - **Easy:** full photo, and the wrong answers come from *other* groups.
  - **Normal:** full photo, with at least 2 wrong answers from the *same* group when the group has enough members.
  - **Hard:** the close-up photo with same-group wrong answers. After answering, the close-up **fades into the full photo** as the reveal.
  - Photo element: `<img class="ffv-photo">` with alt `FF.t('pictureToGuess')`, `decoding="async"`, and the upcoming rounds' photos preloaded so no round opens on a blank frame. Keep the existing `FF.Assets.img` fallback.
  - Race/watch: `image: { src: 'assets/images/games/guessAnimal/<id>[-closeup].webp' }`, so watchers see what players see.
  - Fact box: a class chip plus the fact, reusing `.ffv-fact`.
  - Update the description and howToPlay text to match.
  - Reuse `runVisualGame`, `visualRound`, `makeOptions` (extend it to take a smarter pool), `FF.util.sample` and `FF.GameUI`. Don't fork the engine.
- **`css/games.css`:** add `.ffv-photo` (square, `min(360px, 86vw)`, `max-height: 42vh`, `object-fit: cover`, `--r-md` corners, `--shadow-1`), the close-up-to-full crossfade (respecting `prefers-reduced-motion`), and the class chip. Tokens only.
- **`.gitignore`:** add `assets/playmona_assets/`.
- **Test:** `tools/test/animalArt.test.js`, following the existing harness. Every roster entry has its fields. Ids are unique kebab-case and fit the watch path regex. Both WebP files exist for every id, and each is under 150 KB. Each animal yields 4 distinct options on every difficulty.

## Verification

1. `node tools/test/run.js`: the whole suite passes, including the new test and the existing watch/race tests.
2. `node tools/contrast-check.js` if any colour token changes.
3. In the preview (`preview_start` from `.claude/launch.json`), play Guess the Animal on easy, normal and hard, at mobile (375) and desktop widths, in light and dark. Check that photos load with no 404s (`read_network_requests`), the hard-mode reveal crossfades, wrong answers are lookalikes on normal and hard, and the alt text never names the animal.
4. Open the watch view during a room game and confirm watchers see the same photo.
5. Check that the hub card shows the new cover and that it clearly doesn't look like the lamp-lit covers.
6. Check that Memory Match, Picture Puzzle and Picture Quiz still play with their old SVG animals.
7. Share screenshots and the contact sheet with Brighton.

## Order of work

Step 1 ships first, so Brighton can start generating. Step 3's code can be written while Codex runs, and it's verified once Step 2 has processed the real photos. Commit after each step, on a branch.
