# MASTER DEVELOPMENT PROMPT
# FAMILY FUN — OFFLINE FAMILY GAME HUB

Build a complete, polished, modern **Family Fun** game application for families, children, teenagers, parents and friends.

This is not a simple demo or collection of small HTML games.

The goal is to create a **proper family entertainment/game hub** that can be used on a TV during family gatherings, game nights, parties or casual play.

The application should feel like a small:

**TV Game Console + Family Board Game Collection + Quiz Show + Party Game Hub**

It must be fun, visually attractive, highly replayable and extremely easy to use.

---

# 1. CORE REQUIREMENT

Create a complete web-based application that is:

- Offline-first
- Fully functional without internet
- Usable without a backend
- Usable without a database
- Usable without an account
- Usable without login
- Usable without APIs
- Usable without cloud services
- Suitable for Android TV
- Suitable for desktop browsers
- Suitable for tablets
- Suitable for mobile phones
- Suitable for packaging into an Android APK later

The application should be capable of running from:

```text
index.html
```

or from a simple static folder.

It must NOT require:

- PHP
- Node.js server
- Python server
- MySQL
- PostgreSQL
- Firebase
- Supabase
- REST APIs
- WebSockets
- Cloud storage
- Authentication
- Internet access

---

# 2. SELF-CONTAINED DOES NOT MEAN TEXT-ONLY

This is extremely important.

Do NOT artificially restrict the application to text, emoji or CSS-generated graphics.

Some games are significantly better when they use real images.

Examples:

- Guess the Country
- Guess the Flag
- Guess the Landmark
- Guess the Animal
- Guess the Food
- Picture Quiz
- Where in the World?
- Spot the Difference
- Memory Picture Match
- Guess the Object
- Famous Places
- Visual Charades
- Pictionary
- Picture Puzzles
- Hidden Objects
- Map Games
- Visual Riddles

These games SHOULD be included.

The application must remain offline after the required assets have been bundled locally.

---

# 3. OFFLINE ASSET ARCHITECTURE

Use a self-contained local application structure.

Recommended:

```text
FamilyFun/
│
├── index.html
│
├── assets/
│   ├── images/
│   │   ├── animals/
│   │   ├── food/
│   │   ├── landmarks/
│   │   ├── objects/
│   │   ├── countries/
│   │   ├── puzzles/
│   │   └── generated/
│   │
│   ├── flags/
│   │
│   ├── icons/
│   │
│   └── sounds/
│
└── README.md
```

The application should still be simple enough to copy to a USB drive or static web hosting.

Do NOT require a development server just to run the finished application.

The preferred architecture is:

**HTML + CSS + JavaScript + local assets**

If the application can reasonably remain a single `index.html`, that is acceptable.

However, do NOT sacrifice quality or maintainability merely to force everything into one file.

A small local structure such as:

```text
index.html
assets/
```

is preferred over creating a huge unmaintainable HTML file.

---

# 4. NO REMOTE RUNTIME DEPENDENCIES

At runtime, the application must not require:

- CDN resources
- Remote fonts
- Remote JavaScript
- Remote CSS
- Remote images
- Online APIs
- Online databases

Everything required for gameplay must be local.

The user should be able to turn off Wi-Fi and continue playing.

---

# 5. DESIGN GOAL

The application should feel polished enough to be a real consumer application.

Do NOT create:

- Plain HTML forms
- Generic Bootstrap-looking interfaces
- Basic boxes with text
- Unstyled buttons
- Developer-looking screens
- Empty dashboards
- Placeholder cards
- "Coming Soon" games

Instead create:

- Large game cards
- Attractive backgrounds
- Smooth transitions
- Modern typography
- Large buttons
- Strong visual hierarchy
- Animated scores
- Game-show-style countdowns
- Winner celebrations
- Confetti
- Visual feedback
- Sound effects
- Responsive layouts
- Beautiful light and dark themes

---

# 6. BRAND

Application name:

# FAMILY FUN

Tagline:

**Games for everyone. Play together. Laugh together.**

Create an original app logo.

Possible visual concept:

- Game controller
- Star
- Dice
- Smiling face
- Letters
- Trophy

Create a clean custom SVG logo.

Also create:

- Favicon
- App icon
- Android-friendly icon artwork

Do not depend on an external logo.

---

# 7. LIGHT AND DARK MODE

The application MUST support:

### Light Mode

Bright, warm, colourful and friendly.

### Dark Mode

Dark background with vibrant accents and excellent contrast.

### System Mode

Follow the operating system/browser preference where supported.

Provide a clear theme selector:

```text
☀ Light
🌙 Dark
⚙ System
```

Save the user's preference in `localStorage`.

The application should remember the selected theme after closing and reopening.

Ensure every game works correctly in both themes.

Do not create a dark mode where images, cards or text become unreadable.

---

# 8. ACCENT THEMES

Allow users to select an accent colour.

Suggested choices:

- Purple
- Blue
- Green
- Orange
- Pink
- Gold

Use CSS variables so the accent affects:

- Buttons
- Highlights
- Focus states
- Progress bars
- Selected cards
- Game indicators
- Scores

Save the preference locally.

---

# 9. HOME SCREEN

Create a beautiful home dashboard.

Header:

# FAMILY FUN

Subtitle:

**Games for everyone. Play together. Laugh together.**

Main actions:

### 🎮 Quick Play

Immediately start a random suitable game.

### 🌙 Game Night

Start a multi-round tournament.

### 🎮 Games

Open the complete game library.

### 👥 Players

Manage players and teams.

### 🏆 Scores

View current session rankings.

### ⭐ Favorites

View favorite games.

### ⚙ Settings

Application configuration.

---

# 10. HOME SCREEN CONTENT

Show sections such as:

### Featured Games

Large visual cards.

### Recently Played

Show recently played games.

### Favorites

Show games marked as favorites.

### Quick Games

Games that can be played in under 5 minutes.

### Family Favorites

Popular/fun games.

### Game Night

Prominent tournament shortcut.

---

# 11. GAME LIBRARY

Create a dedicated Games page.

Display games using attractive cards.

Each card should include:

- Icon/image
- Game name
- Description
- Category
- Number of players
- Difficulty
- Approximate duration
- Favorite button

Example:

```text
┌──────────────────────────────┐
│             🔤              │
│                              │
│        LETTER RUSH           │
│                              │
│ Make as many words as you    │
│ can before time runs out.    │
│                              │
│ 👥 1–8    ⭐ Easy    ⏱ 5 min │
└──────────────────────────────┘
```

---

# 12. GAME CATEGORIES

Organise games into:

## WORDS

- Letter Rush
- Word Scramble
- Word Builder
- Missing Letters
- Word Chain
- Word Categories
- Mini Crossword

## QUIZ

- Family Quiz
- General Knowledge
- True or False
- Speed Quiz
- Picture Quiz
- Brain Battle
- Kids Quiz

## VISUAL

- Guess the Country
- Guess the Flag
- Guess the Landmark
- Guess the Animal
- Guess the Food
- Guess the Object
- Where in the World?
- Spot the Difference
- Picture Puzzle
- What's Missing?

## MEMORY

- Memory Match
- Picture Memory
- Remember the Sequence
- What's Missing?
- Remember the Items

## REACTION

- Quick Tap
- Fastest Finger
- Color Reaction
- Stop the Timer

## CREATIVE

- Charades
- Visual Charades
- Drawing Challenge
- Family Pictionary
- Don't Say It
- Describe It

## NUMBERS

- Number Challenge
- Mental Math
- Number Sequence
- Closest Wins
- Higher or Lower

## PARTY

- Would You Rather?
- This or That
- Who Is Most Likely?
- Guess Who
- Finish the Sentence
- Family Challenge

## WORLD

- Guess the Country
- Guess the Flag
- Capital Challenge
- World Landmarks
- Country Neighbours
- Where in the World?

---

# 13. PLAYER MANAGEMENT

Support up to:

# 8 PLAYERS

Allow:

- Add player
- Remove player
- Rename player
- Change avatar
- Change colour
- Reorder players

Use built-in emoji/SVG avatars.

Examples:

😀 😎 🤓 🥳 🦊 🐼 🦁 🐸

No image upload should be required.

---

# 14. TEAMS

Support team play.

Allow:

- 2 teams
- 3 teams
- 4 teams

Players can be assigned to teams.

Example:

```text
TEAM A
Sarah
James

TEAM B
Daniel
Emma
```

Allow custom team names.

---

# 15. PLAYER MODES

Games should support appropriate combinations of:

### Solo

One player.

### Multiplayer

Players take turns.

### Teams

Teams compete.

### Everyone

All players answer.

### Host Mode

The TV displays the game while players respond verbally or through simple controls.

The game engine should automatically choose appropriate behaviour depending on the game.

---

# 16. UNIVERSAL GAME SETTINGS

Before starting a game, allow configuration where appropriate.

### Players

1–8

### Difficulty

- Easy
- Normal
- Hard

### Game length

- Quick
- Short
- Normal
- Long

### Timer

- Off
- 10 seconds
- 20 seconds
- 30 seconds
- 60 seconds

### Sound

On/Off

### Music

On/Off

### Animations

On/Off

### Random player order

On/Off

### Random questions

On/Off

---

# 17. UNIVERSAL SCORING SYSTEM

Create a reusable scoring engine.

Players can receive:

- Base points
- Speed bonus
- Streak bonus
- Perfect round bonus
- Difficulty bonus

Example:

Correct:

+100

Fast:

+50

Three-answer streak:

+100

Perfect round:

+250

Show animated score changes.

---

# 18. LEADERBOARD

Create a polished leaderboard.

Example:

```text
🏆 CURRENT LEADER

1    Sarah       1,250
2    Daniel        980
3    Emma          850
4    James         720
```

Animate changes.

Include player avatars.

---

# 19. FINAL RESULTS

At the end of a game or tournament show:

- Winner
- Second
- Third
- Scores
- Correct answers
- Best streak
- Fastest response
- Other game-specific achievements

Example:

# 🏆 FAMILY FUN CHAMPION

**SARAH**

**1,450 POINTS**

🎉 🎊 🎉

---

# 20. GAME 1 — LETTER RUSH

Display 7–10 letters.

Example:

```text
A   R   T   E   N   O   L   P   S
```

Give players 30 seconds by default.

Players create as many words as possible.

Support:

- Player turns
- Direct word entry where appropriate
- Host entry
- Word validation
- Duplicate prevention
- Scoring

Suggested scoring:

3 letters = 10  
4 letters = 20  
5 letters = 40  
6 letters = 70  
7+ letters = 100

Allow difficulty to control letter combinations.

At the end show all submitted words.

---

# 21. GAME 2 — WORD SCRAMBLE

Display a scrambled word.

Example:

```text
R E T U P M O C
```

Show a clue.

Allow:

- Answer
- Hint
- Skip
- Timer

Provide multiple difficulty levels.

Ensure every puzzle has a valid answer.

---

# 22. GAME 3 — WORD BUILDER

Provide letters.

Players build words using them.

Include:

- Timer
- Score
- Word validation
- Duplicate prevention
- Streaks

---

# 23. GAME 4 — WORD CHAIN

Start with:

APPLE

Next player must provide a word beginning with:

E

Example:

ELEPHANT

Then:

T

Continue until someone fails.

Support:

- Timer
- Categories
- Elimination
- Score mode
- Lives mode

---

# 24. GAME 5 — FAMILY QUIZ

Create a substantial built-in question database.

Categories:

- General Knowledge
- Geography
- Science
- History
- Animals
- Sports
- Food
- Movies
- Music
- Technology
- Kids
- Africa
- Zimbabwe
- Everyday Life

Each question should contain:

- Question
- Options
- Correct answer
- Explanation
- Difficulty
- Category

Example:

```text
Which planet is known as the Red Planet?

A. Earth
B. Mars
C. Venus
D. Jupiter
```

After answering:

Show:

**Correct answer: Mars**

Then show a short interesting fact.

---

# 25. GAME 6 — TRUE OR FALSE

Display statements.

Example:

**Sharks are mammals.**

TRUE / FALSE

Show the correct answer and explanation.

Use fast-paced rounds.

---

# 26. GAME 7 — BRAIN BATTLE

Rapid-fire questions.

Players have a short amount of time.

Correct answers build a streak.

Wrong answers reset the streak.

Create escalating difficulty.

---

# 27. GAME 8 — MEMORY MATCH

Create a card grid.

Support:

4×3  
4×4  
6×4

Cards can use:

- Emoji
- SVG icons
- Local images

Matching pairs score points.

Animate card flipping.

---

# 28. GAME 9 — PICTURE MEMORY

Use actual local images.

Categories:

- Animals
- Food
- Vehicles
- Nature
- Sports
- Objects

Cards flip over.

Players must remember positions.

---

# 29. GAME 10 — QUICK TAP

Show:

# GET READY...

Wait for a random period.

Then:

# TAP!

Measure reaction time.

Display:

**0.382 seconds**

Track:

- Best time
- Average time
- Ranking

Prevent false starts.

---

# 30. GAME 11 — COLOR REACTION

Create a colour recognition challenge.

Sometimes the written colour and displayed colour intentionally conflict.

Example:

Text says:

RED

but appears in blue.

Increase difficulty.

---

# 31. GAME 12 — NUMBER CHALLENGE

Generate:

- Addition
- Subtraction
- Multiplication
- Division
- Missing numbers
- Number sequences
- Mental maths
- Closest number

Difficulty controls complexity.

---

# 32. GAME 13 — CHARADES

The active player sees a prompt.

Other players do not.

Categories:

- Animals
- Jobs
- Sports
- Activities
- Objects
- Movies
- Places
- Everyday actions

Use timers.

---

# 33. GAME 14 — VISUAL CHARADES

Instead of only showing text, display a local image/illustration to the active player.

Example:

A picture showing:

**Someone riding a bicycle**

The active player acts it out.

The other players guess.

Use generated family-friendly illustrations where appropriate.

---

# 34. GAME 15 — DON'T SAY IT

Display:

WORD:

PIZZA

FORBIDDEN:

- Food
- Cheese
- Tomato
- Italian

The player describes the word without saying the forbidden words.

Support:

- Correct
- Pass
- Skip
- Timer

---

# 35. GAME 16 — DRAWING CHALLENGE

Display a drawing prompt.

Example:

# DRAW A BICYCLE

The player draws on a canvas.

Controls:

- Pencil
- Eraser
- Undo
- Clear
- Brush size

Other players vote on the drawing.

Voting:

👍 Great

🙂 Good

😂 Funny

Highest score wins.

---

# 36. GAME 17 — FAMILY PICTIONARY

Create a proper Pictionary-style game.

The active player receives a word/image prompt.

Other players see:

# GUESS THE DRAWING!

Include:

- Timer
- Team mode
- Scoring
- Pass
- New prompt

---

# 37. GAME 18 — MINI CROSSWORD

Generate small family-friendly crossword puzzles.

Support:

5×5  
7×7  
9×9

Provide:

- Across clues
- Down clues
- Selected-cell highlighting
- Keyboard input
- Hints
- Reveal letter
- Reveal word
- Reveal puzzle

---

# 38. GAME 19 — WOULD YOU RATHER?

Display two choices.

Example:

Would you rather:

🏝️ Live on a tropical island

OR

🏔️ Live in the mountains?

Allow all players to vote.

Display animated percentages.

Include many family-friendly questions.

---

# 39. GAME 20 — THIS OR THAT

Examples:

🍕 Pizza / 🍔 Burger

🐶 Dogs / 🐱 Cats

🌞 Summer / ❄️ Winter

Allow everyone to vote.

Show results visually.

---

# 40. GAME 21 — WHO IS MOST LIKELY?

Example:

Who is most likely to...

**Forget where they put their phone?**

Players vote for another player.

Reveal results.

Keep prompts funny and family-friendly.

---

# 41. GAME 22 — WHAT'S MISSING?

Show several objects.

Example:

🍎 🧸 🚗 🎸 📚 🥎

Hide the display.

Remove one object.

Show the remaining objects.

Players identify the missing item.

Increase difficulty.

---

# 42. GAME 23 — REMEMBER THE SEQUENCE

Display:

🟦 🟨 🟥 🟩

Hide it.

Players reproduce the sequence.

Increase length.

Use:

- Colours
- Shapes
- Icons
- Images

---

# 43. GAME 24 — GUESS WHO / WHAT

Provide progressive clues.

Example:

CLUE 1:

I am an animal.

CLUE 2:

I live in Africa.

CLUE 3:

I have a long neck.

Answer:

GIRAFFE

Earlier answers receive more points.

---

# 44. GAME 25 — HIGHER OR LOWER

Display:

47

Ask:

Is the next number higher or lower?

Track streaks.

---

# 45. GAME 26 — GUESS THE COUNTRY

This must be a proper visual game.

Display a large country flag.

Example:

🇿🇼

Question:

# WHICH COUNTRY?

A. Zimbabwe  
B. Zambia  
C. Botswana  
D. Malawi

After answering show:

# ZIMBABWE

Capital:

Harare

Continent:

Africa

Include country facts.

Support:

- Easy
- Normal
- Hard

Include countries from around the world.

---

# 46. FLAG ASSETS

Prefer SVG flags.

They should:

- Be sharp on 4K TVs
- Be lightweight
- Scale cleanly
- Work offline

Create a comprehensive country flag library.

Organise:

```text
assets/flags/
```

Use descriptive filenames.

---

# 47. GAME 27 — GUESS THE LANDMARK

Display a local photograph or illustration.

Examples:

- Victoria Falls
- Eiffel Tower
- Great Wall of China
- Pyramids of Giza
- Statue of Liberty
- Taj Mahal
- Sydney Opera House
- Big Ben

Ask:

# WHERE IS THIS?

Provide multiple-choice answers.

After answering show:

- Landmark
- Country
- City/region where appropriate
- Short interesting fact

---

# 48. GAME 28 — GUESS THE ANIMAL

Display a local animal image.

Ask:

# WHAT ANIMAL IS THIS?

Use:

- Mammals
- Birds
- Reptiles
- Fish
- Insects
- Marine animals

After answering show an interesting fact.

---

# 49. GAME 29 — GUESS THE FOOD

Display food imagery.

Examples:

- Pizza
- Sushi
- Tacos
- Pasta
- Curry
- Sadza
- Jollof rice
- Dumplings
- Paella
- Burgers

Use food from different cultures.

---

# 50. GAME 30 — GUESS THE OBJECT

Display a photograph or illustration.

Ask:

# WHAT IS THIS?

Difficulty can change the presentation:

Easy:

Full object.

Normal:

Partially obscured.

Hard:

Close-up.

---

# 51. GAME 31 — PICTURE QUIZ

Display an image and ask questions about it.

Examples:

- What animal is shown?
- What country is this?
- How many objects are visible?
- What colour is the car?
- What is the person doing?
- Which item does not belong?

Create multiple visual question types.

---

# 52. GAME 32 — WHERE IN THE WORLD?

Use:

- Flags
- Landmarks
- Landscapes
- Food
- Cultural objects
- Maps

Ask players to identify the country or region.

---

# 53. GAME 33 — MAP CHALLENGE

Use lightweight offline SVG maps.

Examples:

### FIND THE COUNTRY

Highlight a country.

Ask:

Which country is highlighted?

### CAPITAL CHALLENGE

Show a country.

Ask:

What is its capital?

### COUNTRY NEIGHBOURS

Show a country.

Ask:

Which country borders it?

Prefer simplified vector maps rather than huge photographic maps.

---

# 54. GAME 34 — SPOT THE DIFFERENCE

Display two similar images.

Players identify differences.

Support:

- 3 differences
- 5 differences
- 7 differences

Use generated illustrations where practical.

Allow players to click/tap the differences.

Provide visual feedback.

---

# 55. GAME 35 — PICTURE PUZZLES

Display an image divided into tiles.

Players reconstruct the image.

Difficulty:

Easy:

3×3

Normal:

4×4

Hard:

5×5

Support:

- Timer
- Moves
- Score
- Hint

---

# 56. GAME 36 — HIDDEN OBJECT

Display a detailed family-friendly scene.

Give players an item to find.

Example:

# FIND THE RED BALL

Players select the object.

Create multiple hidden-object scenes using generated artwork.

---

# 57. GAME 37 — VISUAL RIDDLE

Display a visual puzzle.

Examples:

- What comes next?
- Which object is different?
- Which shape completes the pattern?
- Which shadow belongs to the object?
- Which item does not belong?

Use images, SVG and CSS graphics where appropriate.

---

# 58. GAME 38 — GUESS THE SPORT

Display a sports-related image or illustration.

Ask:

Which sport is this?

Include:

- Football
- Basketball
- Tennis
- Cricket
- Rugby
- Athletics
- Swimming
- Golf
- Volleyball
- Boxing
- Cycling
- Hockey

---

# 59. GAME 39 — GUESS THE VEHICLE

Display an image.

Ask:

What vehicle is this?

Include:

- Cars
- Trucks
- Buses
- Trains
- Aircraft
- Boats
- Motorcycles
- Construction vehicles

---

# 60. GAME 40 — CAPITAL CITY CHALLENGE

Display:

# ZIMBABWE

Which is the capital?

A. Bulawayo  
B. Harare  
C. Mutare  
D. Gweru

Include countries worldwide.

---

# 61. CONTENT DATABASE

Make the application content-driven.

Do not hard-code everything directly into game logic.

Use structured JavaScript data.

Example:

```javascript
const quizQuestions = [
    {
        category: "geography",
        difficulty: "easy",
        question: "What is the capital of Zimbabwe?",
        options: [
            "Harare",
            "Bulawayo",
            "Mutare",
            "Gweru"
        ],
        answer: 0,
        explanation: "Harare is the capital city of Zimbabwe."
    }
];
```

Visual content should use a similar structure:

```javascript
const visualQuestions = [
    {
        type: "flag",
        image: "assets/flags/zimbabwe.svg",
        question: "Which country does this flag belong to?",
        options: [
            "Zimbabwe",
            "Zambia",
            "Botswana",
            "Malawi"
        ],
        answer: 0,
        difficulty: "easy"
    }
];
```

---

# 62. LARGE CONTENT LIBRARY

Do not build games containing only 5–10 examples.

Create meaningful content.

The initial application should have enough content that users can replay games without immediately seeing the same questions.

Provide substantial built-in libraries for:

- Quiz
- Trivia
- Flags
- Countries
- Animals
- Food
- Landmarks
- Charades
- Would You Rather
- This or That
- Who Is Most Likely
- Drawing prompts
- Word games
- Visual puzzles

---

# 63. RANDOMISATION

Implement proper randomisation.

Avoid:

- Immediate duplicate questions
- Repeated words
- Repeated images
- Same player always starting
- Predictable sequences

Maintain recently-used pools during a session.

---

# 64. CONTENT PACKS

Organise content into packs.

Examples:

### WORLD PACK

Countries, flags, landmarks and geography.

### AFRICA PACK

African countries, animals, landmarks, food and culture.

### ZIMBABWE PACK

Zimbabwean geography, landmarks, wildlife, history, culture and general knowledge.

### ANIMAL PACK

Wildlife and domestic animals.

### FOOD PACK

Foods from around the world.

### FAMILY PACK

General family trivia.

### KIDS PACK

Child-friendly content.

### CHALLENGE PACK

Harder questions.

The system should be designed so additional packs can be added later.

---

# 65. IMAGE ASSETS

Images are allowed and encouraged when they improve gameplay.

Use the appropriate format:

### SVG

For:

- Flags
- Maps
- Icons
- Simple illustrations
- Shapes

### WebP/JPEG

For:

- Photographs
- Landscapes
- Animals
- Food
- Landmarks

### PNG

Only where transparency is required.

---

# 66. IMAGE SOURCING

Do NOT scrape random images from Google Images.

For real-world images, use appropriately licensed/public-domain sources such as:

- Wikimedia Commons
- Openverse
- Unsplash
- Pexels
- Government/public sources
- Other sources that explicitly allow redistribution

Verify licensing before bundling assets.

Keep attribution where required.

---

# 67. GENERATED IMAGES

For assets better suited to generated artwork, create original illustrations.

Examples:

- Pictionary prompts
- Spot-the-difference scenes
- Hidden-object scenes
- Visual riddles
- Cartoon objects
- Family-friendly characters
- Visual charades

The generated artwork should be:

- Family-friendly
- Clear
- Recognisable
- High contrast
- Suitable for television
- Free of unnecessary text
- Free of watermarks

---

# 68. IMAGE GENERATION PROMPT LIST

If the development environment cannot directly create required images, provide a complete:

# IMAGE GENERATION PROMPT LIST

For every required generated asset include:

- Filename
- Game
- Description
- Recommended dimensions
- Image style
- Exact generation prompt

Example:

```text
Filename:
bicycle-charades-01.webp

Game:
Visual Charades

Prompt:
Create a clean, colourful, family-friendly illustration of a person riding a bicycle, centered on a simple background, no text, no watermark, highly recognizable silhouette, suitable for a television party game.
```

---

# 69. IMAGE DOWNLOAD LIST

For externally sourced images provide:

- Filename
- Description
- Game
- Recommended dimensions
- Suggested source
- Required license
- Attribution requirements
- Destination folder

Do not leave this information vague.

---

# 70. ASSET MANIFEST

Maintain a central asset manifest.

Example:

```javascript
const assets = {
    flags: {
        zimbabwe: "assets/flags/zimbabwe.svg",
        southAfrica: "assets/flags/south-africa.svg"
    },

    animals: {
        lion: "assets/images/animals/lion.webp",
        elephant: "assets/images/animals/elephant.webp"
    }
};
```

Do not scatter unexplained paths throughout the application.

---

# 71. IMAGE FALLBACK SYSTEM

If an image fails:

1. Attempt a local fallback.
2. If unavailable, use an SVG placeholder.
3. If still unavailable, use text.

Never allow one missing image to crash the game.

---

# 72. IMAGE LOADING

Do not load the entire asset library into memory at startup.

Load/preload only what the current game needs.

Show:

**Preparing your game...**

when necessary.

Optimise for Android TV hardware.

---

# 73. IMAGE OPTIMISATION

Keep the application reasonably small.

Use:

- SVG for vector assets
- WebP for many images
- JPEG for photographs when appropriate
- Compressed images
- Sensible dimensions

Do not bundle enormous 4K photographs when a smaller image is sufficient.

Target approximately:

**1280px maximum dimension**

for most gameplay photographs unless higher resolution is genuinely necessary.

---

# 74. COPYRIGHT AND TRADEMARKS

Do not bundle copyrighted material simply because it can be found online.

Be particularly careful with:

- Celebrity photographs
- Movie posters
- TV characters
- Cartoon characters
- Company logos
- Brand marks

Where licensing is uncertain:

Use original generated alternatives.

For example, instead of using a copyrighted cartoon character, create an original family-friendly character.

For brand/logo games, only use assets that are legally suitable for redistribution, otherwise replace the game with a generic visual recognition game.

---

# 75. CREDITS PAGE

Create:

# CREDITS & SOURCES

Include attribution for externally sourced assets where required.

Keep the page separate from gameplay.

---

# 76. SOUND SYSTEM

Use the Web Audio API where practical.

Do not require external audio files unless bundled locally.

Sounds:

- Button click
- Countdown
- Correct answer
- Wrong answer
- Round start
- Round finish
- Winner
- Timer warning

Allow:

🔊 Sound Effects

🎵 Music

Volume slider.

The game must work perfectly without sound.

---

# 77. MUSIC

Optionally provide simple procedural background music using Web Audio API.

Do not autoplay until the user has interacted with the application.

Provide:

- Off
- Calm
- Fun

Keep music subtle.

---

# 78. TIMER SYSTEM

Create a reusable timer.

Support:

- Start
- Pause
- Resume
- Reset
- Finish
- Warning state
- Final countdown

Display:

```text
00:30
```

At the end:

```text
TIME!
```

---

# 79. ANIMATIONS

Use tasteful animations:

- Card transitions
- Score changes
- Card flips
- Countdown
- Progress bars
- Correct/wrong feedback
- Winner celebration
- Confetti

Do not overuse animations.

Provide:

### Reduce Motion

setting.

---

# 80. CONFETTI

Create CSS/JavaScript-generated confetti.

Use it for:

- Winners
- Perfect rounds
- Tournament completion

No external library.

---

# 81. GAME NIGHT MODE

Create a full tournament mode.

User chooses:

- Number of players
- Number of rounds
- Categories
- Difficulty

Example:

```text
GAME NIGHT

ROUND 1
Letter Rush

ROUND 2
Guess the Country

ROUND 3
Family Quiz

ROUND 4
Quick Tap

ROUND 5
Memory Match

FINAL ROUND
Brain Battle
```

Automatically maintain overall scores.

---

# 82. TOURNAMENT MODE

Support:

- 3 rounds
- 5 rounds
- 10 rounds
- Custom

At the end show the overall winner.

If there is a tie:

Automatically start:

# TIE BREAKER

---

# 83. QUICK PLAY

Create a large:

# 🎮 QUICK PLAY

button.

When pressed:

1. Select a random suitable game.
2. Use the current players.
3. Use default settings.
4. Start immediately.

Also provide:

# QUICK ROUND

Random game designed to last approximately 2–5 minutes.

---

# 84. FAVORITES

Every game should have:

⭐ Favorite

Save favorites using `localStorage`.

Show:

# MY FAVORITES

on the home screen.

---

# 85. RECENT GAMES

Track recently played games locally.

Show:

# RECENTLY PLAYED

Do not store sensitive information.

---

# 86. HOST CONTROLS

Provide host controls behind a clearly identifiable button.

Controls:

- Pause
- Resume
- Restart
- Next round
- Previous
- Skip
- Reveal answer
- Add points
- Remove points
- End game

Keep the gameplay interface clean.

---

# 87. PAUSE SCREEN

Display:

# GAME PAUSED

Buttons:

▶ Resume

🔄 Restart

🏠 Exit Game

---

# 88. GAME INTRO SCREEN

Before every game display:

# GAME NAME

Short description.

Players.

Difficulty.

Duration.

Example:

```text
LETTER RUSH

Make as many words as possible from
the letters shown.

👥 4 Players
⭐ Easy
⏱ 5 minutes

[ START GAME ]

[ HOW TO PLAY ]

[ SETTINGS ]
```

---

# 89. HOW TO PLAY

Every game needs a simple explanation.

Use 3–5 steps.

Example:

1. Look at the letters.
2. Make as many words as possible.
3. Each valid word earns points.
4. Highest score wins.

Button:

# GOT IT

---

# 90. ROUND RESULTS

After each round:

```text
ROUND COMPLETE!

Sarah       +250
Daniel      +180
Emma        +120
James        +90
```

Buttons:

### NEXT ROUND

### FINAL RESULTS

---

# 91. TV REMOTE / D-PAD SUPPORT

This is extremely important.

The application must work well with an Android TV remote.

Support:

- Up
- Down
- Left
- Right
- Enter
- Back

Create obvious focus states.

The selected control should be visually prominent.

Do not rely on mouse hover.

Keyboard arrow keys should behave similarly so the application can be tested on desktop.

---

# 92. ANDROID TV DESIGN

Primary target resolution:

**1920 × 1080**

Also support:

**3840 × 2160**

Use:

- Large text
- Large controls
- High contrast
- Large cards
- Large timers
- Large scores

Design for viewing from several metres away.

---

# 93. RESPONSIVE DESIGN

Support:

- 320px phones
- 768px tablets
- 1366px laptops
- 1920px TVs
- 4K TVs

Use responsive CSS.

Do not hard-code the application to a single resolution.

---

# 94. LANDSCAPE

Optimise primarily for landscape.

Especially:

**16:9**

For TV.

Still provide reasonable portrait support for mobile devices.

---

# 95. FULLSCREEN

Provide:

⛶ Fullscreen

Use the Fullscreen API where available.

If unsupported, continue normally.

Never crash because fullscreen is unavailable.

---

# 96. LOCAL STORAGE

Use `localStorage` for:

- Theme
- Accent colour
- Sound settings
- Music settings
- Player setup
- Favorites
- Recent games
- Default settings

Do not store sensitive data.

Provide:

# RESET ALL DATA

with confirmation.

---

# 97. SETTINGS

Create a polished Settings page.

## Appearance

- Light
- Dark
- System
- Accent colour

## Sound

- Effects
- Music
- Volume

## Gameplay

- Default difficulty
- Default timer
- Animations
- Reduce motion

## Players

- Manage players
- Reset players

## Data

- Clear favorites
- Clear recent games
- Reset all settings

## Credits

Asset sources and attribution.

## About

Family Fun

Version:

1.0.0

---

# 98. PRIVACY

Include:

# PRIVATE & OFFLINE

Text:

"Family Fun does not require an account or internet connection. Your game settings and scores stay on this device."

---

# 99. DEMO MODE

Include an optional Demo Mode.

It should:

- Create sample players
- Start games automatically
- Demonstrate navigation
- Demonstrate scores
- Demonstrate timers
- Demonstrate winner screen

Useful for testing the application on a TV.

---

# 100. GAME ENGINE ARCHITECTURE

Even though this is an offline application, structure the code properly.

Create reusable systems such as:

```text
App
GameManager
PlayerManager
TeamManager
ScoreManager
TimerManager
AudioManager
ThemeManager
StorageManager
NavigationManager
AssetManager
QuestionManager
RandomManager
```

Avoid one giant function.

Each game should have its own logic.

---

# 101. GAME REGISTRY

Use a central game registry.

Example:

```javascript
const games = {
    letterRush: {...},
    wordScramble: {...},
    familyQuiz: {...},
    memoryMatch: {...},
    guessCountry: {...},
    guessAnimal: {...}
};
```

Each game should define:

- ID
- Name
- Description
- Category
- Icon
- Players
- Difficulty
- Duration
- Instructions
- Start function

This makes it easy to add games later.

---

# 102. ERROR HANDLING

The application must fail gracefully.

Handle:

- localStorage unavailable
- Audio unavailable
- Fullscreen unavailable
- Canvas unavailable
- Image unavailable
- Browser limitations

Never expose raw JavaScript errors to the user.

---

# 103. PERFORMANCE

Optimise for modest Android TV hardware.

Avoid:

- Large unnecessary libraries
- Huge images
- Excessive DOM manipulation
- Continuous CPU-heavy animations
- Unnecessary background processing

Application startup should be fast.

---

# 104. ACCESSIBILITY

Support:

- Keyboard navigation
- TV remote navigation
- Visible focus states
- Large text
- High contrast
- Reduced motion
- Clear button labels
- Logical navigation order

---

# 105. OFFLINE TEST

The final application must be tested with:

```text
Internet = OFF
Wi-Fi = OFF
```

Every game must continue working.

There must be no unexpected network requests.

---

# 106. FILE STRUCTURE

Prefer:

```text
FamilyFun/
│
├── index.html
│
├── assets/
│   ├── flags/
│   ├── images/
│   ├── icons/
│   └── sounds/
│
└── README.md
```

If additional local files improve maintainability, they may be used, but do not introduce unnecessary complexity.

Do not introduce:

- Build pipelines
- Node dependency installation
- Server requirements
- Frameworks that require compilation

unless there is an extremely strong reason.

---

# 107. ASSET MANIFEST

Include a clear asset inventory.

For each asset specify:

- Filename
- Type
- Game
- Purpose
- Source/generated
- License where applicable

---

# 108. DEVELOPMENT ASSET OUTPUT

If the AI cannot directly supply all required assets, it must NOT silently leave broken references.

Instead provide:

## ASSETS TO GENERATE

and:

## ASSETS TO DOWNLOAD

and clearly identify every required asset.

Provide exact generation prompts and sourcing instructions.

---

# 109. DO NOT REDUCE GAME QUALITY BECAUSE OF ASSETS

This is a critical instruction.

If an excellent game requires images:

**USE IMAGES.**

If it requires flags:

**USE FLAGS.**

If it requires photographs:

**USE APPROPRIATELY LICENSED PHOTOGRAPHS.**

If it requires illustrations:

**GENERATE ORIGINAL ILLUSTRATIONS.**

If it requires maps:

**USE LOCAL SVG MAPS.**

If it can be done better with CSS/SVG:

**USE CSS/SVG.**

The application is:

# OFFLINE-FIRST

It is NOT:

# TEXT-ONLY

---

# 110. CONTENT QUALITY

All content must be:

- Family-friendly
- Non-explicit
- Suitable for mixed ages
- Fun
- Varied
- Culturally diverse
- Appropriate for children where the game is marked Kids

Avoid controversial or inappropriate material.

---

# 111. REPLAYABILITY

The application should encourage repeat play.

Use:

- Random questions
- Random player order
- Random images
- Difficulty levels
- Game Night
- Favorites
- Streaks
- Achievements
- Different categories
- Different round lengths

---

# 112. ACHIEVEMENTS

Implement lightweight local achievements.

Examples:

🏆 First Win

🔥 5 Answer Streak

⚡ Fastest Finger

🔤 Word Master

🧠 Brain Box

🌍 World Explorer

🎨 Creative Genius

🎯 Perfect Round

👑 Game Night Champion

Achievements should be stored locally.

---

# 113. SESSION STATISTICS

For the current device/session, optionally track:

- Games played
- Wins
- Total points
- Best streak
- Fastest reaction
- Most words
- Quiz accuracy

Display:

# FAMILY STATS

Do not require an account.

---

# 114. FAMILY-FRIENDLY LANGUAGE

Use simple language.

Avoid technical terminology in the user interface.

Instead of:

"Configuration"

use:

"Game Settings"

Instead of:

"Initialise"

use:

"Start"

Instead of:

"Terminate Session"

use:

"Exit Game"

---

# 115. USER EXPERIENCE GOAL

A family should be able to:

1. Turn on the TV.
2. Open Family Fun.
3. Add 2–8 players.
4. Choose Quick Play or Game Night.
5. Start playing within approximately 30 seconds.

The interface should require very little explanation.

---

# 116. FINAL WINNER EXPERIENCE

The final screen should feel rewarding.

Example:

```text
🎉 🎊 🎉

GAME NIGHT COMPLETE!

🏆

SARAH

FAMILY FUN CHAMPION

1,850 POINTS

────────────────

2. Daniel      1,620
3. Emma         1,410
4. James        1,250

────────────────

🏆 3 Games Won
🔥 8 Answer Streak
⚡ Fastest Answer

[ PLAY AGAIN ]

[ NEW GAME NIGHT ]

[ HOME ]
```

---

# 117. FINAL TESTING

Before delivery, test every game completely.

Test:

### Navigation

- Home
- Games
- Players
- Favorites
- Game Night
- Settings
- Back

### Players

- 1 player
- 2 players
- 4 players
- 8 players
- Teams

### Games

Every game must start, play and finish correctly.

### Timers

- Start
- Pause
- Resume
- Finish
- Reset

### Scores

Verify score calculations.

### Themes

Test:

- Light
- Dark
- System

### Storage

Close/reopen application and verify settings persist.

### Offline

Disable internet and test every game.

### TV

Test arrow keys and Enter as simulated D-pad.

### Mobile

Test responsive layout.

### Fullscreen

Test supported and unsupported environments.

### Images

Test missing-image fallback.

### Audio

Test audio enabled and disabled.

---

# 118. FINAL DELIVERABLES

The final project should include:

### 1. Complete playable application

Not a prototype.

### 2. All implemented games

Every game should actually work.

### 3. Local asset structure

All bundled assets stored locally.

### 4. Asset manifest

Document all assets.

### 5. Image generation prompts

For generated assets.

### 6. Image download/source list

For externally sourced assets.

### 7. Credits

Where required.

### 8. README

Explain:

- How to run
- How to add assets
- How to add games
- How to modify questions
- How to package for Android later

---

# 119. IMPORTANT — DO NOT LEAVE PLACEHOLDERS

Do not create buttons that do nothing.

Do not create:

"Coming Soon"

"Under Construction"

"TODO"

"Placeholder"

"Game Coming Soon"

Every visible game should be playable.

Every visible button should perform an action.

If a planned feature cannot reasonably be implemented offline, replace it with another fully functional offline feature.

---

# 120. FINAL PRODUCT STANDARD

The finished application should feel like:

**A real family game console.**

Not:

**A webpage containing mini-games.**

Prioritise:

1. Fun
2. Ease of use
3. Variety
4. Replayability
5. Visual quality
6. TV usability
7. Offline reliability
8. Performance
9. Accessibility
10. Maintainability

Use images whenever they make a game substantially better.

Use generated artwork where appropriate.

Use legally redistributable external assets where appropriate.

Use SVG/CSS/canvas where appropriate.

Keep all runtime assets local.

---

# 121. FINAL PRINCIPLE

The most important architectural rule is:

> **SELF-CONTAINED DOES NOT MEAN EVERYTHING MUST BE INSIDE ONE HTML FILE.**

The finished application should be a **self-contained offline package**.

This means:

```text
No internet
No server
No database
No account
No API
No cloud
```

but it MAY contain:

```text
index.html
assets/
    images/
    flags/
    icons/
    sounds/
```

All required resources must be bundled locally.

The application should work when copied to another computer or Android device without requiring anything else.

Build the complete application now.

Do not stop at the interface.

Do not create a prototype.

Implement the actual games, game engine, player system, scoring, timers, assets architecture, offline functionality, themes, TV navigation, Game Night mode and complete user experience.