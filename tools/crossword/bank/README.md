# Mini Crossword clue banks

`node tools/gen-crossword.js` builds every puzzle from these files. Lint them with
`node tools/crossword/validate.js` (or `--bank animals` for one file).

One word per line:

```
WORD|levels|easy clue|normal clue|hard clue
```

- **WORD**: 3-9 capital letters A-Z, one word (no spaces, hyphens or accents).
- **levels**: which levels may use the word, any of `e` `n` `h` in that order (`enh`, `nh`, `h`).
  Easy words are 5 letters or fewer and known to a 7-year-old.
- A clue is required for each level listed; leave the others empty (`CAMEL|nh||Ship of the desert|…`).
- Lines starting with `#` are comments.

Files: one per theme pack (`animals food home sport music geography bible nature`), `general.txt`
for everyday fill words, and `blocked.txt` (one word per line, never used in a grid).

## How to write clues

The game is for a whole family. Every clue is proper English with British spelling (colour,
favourite, neighbour, metre) and reads like a clue in a good newspaper crossword.

- **Easy**: a plain, friendly definition a child knows. "Striped horse of Africa". "You wear it on your head".
- **Normal**: a clear definition, or fill-in-the-blank with `___`. "Once upon a ___". "Animal that carries its home on its back".
- **Hard**: a sharper definition, general knowledge, or gentle wordplay (never cryptic). "Ship of the desert". "It never forgets, they say".
- The clue must match the answer's part of speech and number: a plural answer gets a plural clue
  ("Farm birds that lay eggs" for HENS); a past tense gets a past tense ("Cooked in the oven" for BAKED).
- Never use the answer, or an obvious form of it, in its own clue.
- Start with a capital letter; no full stop at the end; 90 characters at most.
- Each clue should point to one answer; avoid clues that fit many words of that length.
- Nothing rude, scary or political. Bible clues use well-known King James names and facts.
