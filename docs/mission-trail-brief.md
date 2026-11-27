# PLAYMONA GAME DEVELOPMENT BRIEF
## Game: MISSION TRAIL
### A Memory, Navigation & Instruction-Following Adventure

You are developing a new game for **Playmona (playmona.com)**, an online gaming platform with the tagline:

**"Games for Everyone. Everywhere."**

Your task is to design and implement a complete, polished, production-ready game called **Mission Trail**.

This is not a conventional puzzle game. It is a mission-based adventure that tests a player's ability to read, understand, remember and execute instructions under time pressure.

The player receives a written mission, reads it once, memorises the instructions, closes the message and then completes the mission without being able to refer back to the original instructions.

Missions involve collecting objects, navigating unfamiliar environments, identifying locations, recognising people, interacting with characters and completing tasks in the correct order.

The game must support more than 100 stages, with progressively increasing difficulty and new gameplay mechanics introduced as players advance.

---

# 1. CORE GAME CONCEPT

The fundamental gameplay loop is:

1. Receive a written mission.
2. Read and memorise the instructions.
3. Close the instructions permanently for that attempt.
4. Collect any required objects.
5. Navigate an unfamiliar environment using directional controls.
6. Discover and identify the correct destination.
7. Interact with the correct person, object or location.
8. Complete the mission before the countdown reaches zero.
9. Receive a score and earn up to three stars.

The game should test five primary abilities:

- Memory: Can the player remember the instructions?
- Comprehension: Can the player understand what they have been asked to do?
- Navigation: Can the player follow directions correctly?
- Observation: Can the player identify the correct objects, people and locations?
- Execution: Can the player complete everything accurately within the time limit?

The experience should be fun, challenging and accessible to both children and adults.

---

# 2. VISUAL DIRECTION AND ART STYLE

Create a colourful, attractive 2D illustrated adventure environment.

The game should feel like a polished mobile adventure/puzzle game, not a basic educational application.

Visual requirements:

- 2D top-down perspective for navigation.
- Colourful illustrated environments.
- Friendly characters with recognisable appearances.
- Distinctive buildings and environmental objects.
- Attractive roads, paths, intersections and landmarks.
- Smooth player movement.
- Subtle animations and visual feedback.
- Clear, large directional controls.
- Beautiful mission briefing screens.
- Consistent illustration style across all assets.

Avoid complicated 3D environments.

The game must remain lightweight and perform well on low-end Android devices, desktop browsers and mobile browsers.

Use sprite sheets, reusable illustrations and CSS animations wherever appropriate.

Do not use unnecessarily large images or load every game asset at once.

---

# 3. GAME FLOW

The game must have the following screens and gameplay phases.

## A. Game Landing Screen

Create an attractive landing screen showing:

- Game logo and name: Mission Trail.
- A short description: "Read. Remember. Explore. Complete!"
- Continue Playing button.
- Select Stage button.
- Player's current progress.
- Total stars earned.
- Highest stage reached.

The design should be visually engaging and consistent with Playmona's other games.

## B. Stage Selection

Create a stage-selection interface supporting at least 100 stages.

Organise stages into groups of 10.

For example:

- Stages 1–10: Beginner Missions
- Stages 11–20: Getting Around
- Stages 21–30: Exploring Town
- Stages 31–40: Street Navigator
- Stages 41–50: The Delivery Challenge
- Stages 51–60: Multiple Missions
- Stages 61–70: Advanced Navigation
- Stages 71–80: The Explorer
- Stages 81–90: Complex Missions
- Stages 91–100: Master Navigator

These are initial groupings and can be refined.

### Stage appearance and unlocking

Implement the following rules:

**Locked stages:**
- Appear greyed out.
- Have a lock icon.
- Cannot be selected.
- Display a small indication that the previous stage must be completed.

**Unlocked stages:**
- Appear in full colour.
- Can be selected.
- Have a clear visual distinction from locked stages.

**Completed stages:**
- Display the stars earned.
- Show 1, 2 or 3 stars.
- If completed without earning a star, clearly indicate completion.
- Allow replaying the stage.

A player should only unlock the next stage after completing the previous one.

For example:

Completing Stage 1 unlocks Stage 2.

Completing Stage 2 unlocks Stage 3.

This continues throughout the game.

A player can replay previously completed stages to improve their scores.

When a player improves their previous result, update the stored star rating if the new result is better.

Do not remove previously earned stars when a replay produces a worse result.

### Stage navigation

Provide:
- Previous group.
- Next group.
- Stage group indicator.
- Progress indicator.
- Total stars earned.

Do not display all 100 stages in one extremely long page. Use paginated stage groups or another mobile-friendly layout.

The architecture must support adding more stages without redesigning the interface.

---

# 4. MISSION BRIEFING SYSTEM

This is one of the most important parts of the game.

When a player starts a stage, display an illustrated letter, note, envelope or scroll.

The briefing should feel like receiving a real assignment.

Example:

MISSION 01: A DELIVERY TO THE LIBRARY

Dear Brighton,

I need your help!

Please collect my red cap and take it to the librarian at the library.

Here are the directions:

1. Go straight for 5 steps.
2. Turn right.
3. Continue straight for 3 steps.
4. You will find the library.

Please complete this task before your time runs out.

Good luck!

[ I UNDERSTAND ]

### Briefing rules

1. The entire mission must be visible before gameplay starts.
2. The player should be able to read comfortably.
3. Instructions must be clear and appropriately formatted.
4. Once the player clicks "I UNDERSTAND", close the letter.
5. The original instructions must not be accessible again during that attempt.
6. Do not provide a pause menu that reveals the instructions.
7. Do not display the correct route or a destination marker.
8. The mission briefing should be stored in memory for scoring and evaluation, but never exposed through the gameplay interface after closing.

The letter can be styled differently depending on the mission.

For example:
- Letters.
- Scrolls.
- Official assignments.
- Delivery notes.
- Personal messages.
- Handwritten instructions.

Use reusable templates rather than designing a completely different briefing interface for every stage.

### Important: Reading time

The countdown should start AFTER the player closes the instructions and confirms understanding.

This ensures players have enough time to read and memorise the mission without being unfairly penalised.

However, the game may have an optional reading-time challenge in advanced modes in the future.

---

# 5. PREPARATION AND OBJECT COLLECTION

Some missions require players to collect objects before navigating.

Example:

"Collect the red cap and take it to the librarian."

After closing the briefing, display a busy illustrated scene containing many objects.

The player must locate and click the correct item.

Example objects:

- Red cap.
- Blue cap.
- Green cap.
- Shoes.
- Books.
- Keys.
- Bags.
- Watches.
- Toys.
- Bottles.
- Food items.
- Tools.

### Object collection mechanics

- The player taps or clicks an object.
- The game checks whether it matches the required item.
- Correct selection adds it to the inventory.
- Incorrect selection produces visual feedback.
- Incorrect selections may attract a small penalty.
- Collected objects should have a visual indicator.
- The inventory should remain visible during navigation.

When multiple objects are required, the player must collect them according to the mission requirements.

Some missions should require collecting items in a particular order.

### Reusable object assets

Create a reusable object library.

Objects should be individual assets that can be placed into different scenes.

Avoid generating completely new object illustrations for every stage.

For example, the same red cap can appear in:
- A bedroom.
- A classroom.
- A shop.
- A garden.
- A busy storage room.

The environment and surrounding objects change, but the core object asset is reused.

---

# 6. NAVIGATION SYSTEM

Navigation is the heart of Mission Trail.

The player must navigate an unfamiliar environment using instructions remembered from the briefing.

The game must have THREE distinct navigation systems, introduced progressively.

## NAVIGATION SYSTEM 1: BASIC NAVIGATION

Used in beginner stages.

The player sees a simple 2D environment with roads, paths, buildings and intersections.

The player has four directional buttons:

UP
DOWN
LEFT
RIGHT

Each click moves the player exactly one grid step.

Interpretation:

- Go straight: Continue moving in the current direction.
- Turn left: Change direction to the left.
- Turn right: Change direction to the right.
- Go back: Move in the opposite direction.

Example:

"Go straight for 5 steps, turn right and continue for 3 steps."

The player must remember and execute these instructions.

### Movement rules

Use a grid-based movement system.

Every movement should correspond to one logical grid cell.

The player must not be able to walk through buildings, walls or other obstacles.

Provide:
- Smooth movement animations.
- Clear movement feedback.
- Directional orientation.
- Proper collision detection.
- Responsive controls.

The four directional buttons must be large enough for comfortable mobile use.

Keyboard arrow keys or WASD can also be supported on desktop.

IMPORTANT:

The directional controls should be relative to the player's current orientation.

For example, if the player is facing upwards:
- Left means turn towards the left.
- Right means turn towards the right.

However, distinguish between turning and moving.

I recommend having two types of control:

1. Directional movement: Up, Down, Left and Right.
2. Optional relative commands: Turn Left and Turn Right.

The player should not accidentally change orientation just because they are trying to move backwards.

Keep the control model consistent throughout the game.

---

## NAVIGATION SYSTEM 2: EXPLORATION MODE (FOG OF WAR)

Introduce this system in intermediate stages.

This is an essential gameplay feature.

The player must NOT see the complete map.

Implement a Fog of War system.

### How it works

- The player sees their current position.
- Only nearby roads, buildings and landmarks are visible.
- Areas outside the visibility radius remain hidden.
- As the player moves, new areas become visible.
- Previously explored areas may remain visible but slightly darkened.
- Unexplored areas must not reveal buildings, roads or destinations.

Use a visibility radius of approximately 3 grid cells initially, adjustable per stage.

The camera should follow the player.

### Hidden destinations

This is extremely important.

If the briefing says:

"Go to the library."

The player must NOT see a building labelled LIBRARY on the map.

Do not display:
- Destination markers.
- Highlighted routes.
- Directional arrows.
- Destination names.
- Special icons identifying the target.

Buildings should appear as ordinary buildings until the player interacts with them.

When the player reaches a building and clicks it, the game checks whether it is the correct destination.

If correct:
- Reveal the building's identity.
- Show a positive visual effect.
- Continue to the next mission phase.

If incorrect:
- Display an appropriate message.
- Deduct a small amount of time or accuracy points.
- Allow the player to continue.

The game engine knows the destination coordinates, but the player must not receive this information visually.

### Environmental landmarks

Include reusable landmarks to help players understand their surroundings.

Examples:
- Trees.
- Fountains.
- Benches.
- Streetlights.
- Bus shelters.
- Traffic lights.
- Road signs.
- Parks.
- Small bridges.
- Road intersections.

These landmarks can also be referenced in mission instructions.

Example:

"Walk straight until you reach the fountain. Turn left at the fountain and continue for four steps."

The player must recognise the fountain and follow the correct instruction.

### Fog of War implementation

Use a lightweight visibility calculation based on the player's current grid position.

Do not use a complicated 3D lighting engine.

Previously explored cells can be stored in a simple explored-cell set.

The system should be configurable per stage.

---

## NAVIGATION SYSTEM 3: ADVANCED STREET NAVIGATION

Introduce this system in advanced stages.

Players must navigate using:

- Street names.
- Road signs.
- Named avenues.
- Landmarks.
- Intersections.
- Conditional instructions.
- Multiple possible routes.

Example:

"Take Dave Street. Continue straight until you reach the second intersection. Turn right into Gails Avenue. Walk past the petrol station and look for the green building opposite the supermarket."

The player must:
- Identify the correct street.
- Follow the correct direction.
- Count intersections.
- Recognise landmarks.
- Identify the correct building.

### Advanced mechanics

Introduce these progressively:

**Street names**

Display street names on signs or roads when players discover them.

**Intersection counting**

Instructions may refer to the first, second or third intersection.

**Conditional instructions**

Example:

"If you see a blue house, turn right. If you see a red house, continue straight."

**Restricted routes**

Example:

"Go to the hospital, but do not pass through the market."

**Multiple landmarks**

Example:

"Continue until you pass the fountain, then turn left at the petrol station."

**Similar-looking locations**

Create several visually similar buildings that require careful identification.

Do not introduce every advanced mechanic at once.

---

# 7. ADDITIONAL MISSION MECHANICS

The mission engine must support combining different activities.

Implement the following reusable mechanics.

### A. Collect and Deliver

Collect an object and deliver it to a person or location.

### B. Find a Person

The player receives a description.

Example:

"Find Peter. He is wearing a white shirt, black trousers and a red tie."

A busy illustrated scene appears with several characters.

The player must select the correct person.

### C. Find a Vehicle

Example:

"Find the green car parked outside the supermarket."

Present several vehicles.

The player must identify the correct one.

### D. Enter a Vehicle

After identifying the correct vehicle, the player can enter it.

Movement controls remain available.

The movement speed may change.

### E. Multiple Deliveries

Example:

"Collect the newspaper and deliver it to John at the post office. Afterwards, collect the keys from Mary at the school and take them to the mechanic."

The player must remember the sequence.

### F. Conditional Instructions

Example:

"If you reach the fountain before seeing the traffic lights, turn left. Otherwise, continue straight."

### G. Avoid Certain Locations

Example:

"Take the road to the hospital, but do not pass through the market."

### H. Object Identification

Identify an object based on colour, shape, size or description.

### I. Follow a Person

Some missions may require following a character to another location.

### J. Multiple Locations

Visit several destinations in a specified order.

All these mechanics should be reusable components of the mission engine.

---

# 8. STAGE DIFFICULTY AND PROGRESSION

The game must support at least 100 stages from the beginning.

Do not hardcode 100 separate game implementations.

Create a data-driven stage system.

Each stage should be defined through structured configuration data.

For example:

{
    "id": 1,
    "title": "The Library Delivery",
    "difficulty": "easy",
    "navigation_mode": "basic",
    "time_limit": 60,
    "mission_type": "collect_navigate_deliver",
    "briefing": {
        "title": "A Delivery to the Library",
        "message": "Please collect the red cap and take it to the librarian.",
        "directions": [
            "Go straight for 5 steps.",
            "Turn right.",
            "Go straight for 3 steps."
        ]
    },
    "required_items": [
        {
            "item": "red_cap",
            "quantity": 1
        }
    ],
    "map_id": "town_map_01",
    "destination": "library",
    "destination_coordinates": {
        "x": 12,
        "y": 8
    },
    "target_character": "librarian",
    "scoring": {
        "accuracy": 50,
        "navigation": 25,
        "observation": 15,
        "speed": 10
    }
}

This is an illustrative schema. Improve it where necessary.

The actual architecture should support different mission sequences, not just a fixed collect-navigate-deliver pattern.

For example:

collect → navigate → interact

navigate → identify → interact

collect → navigate → enter_vehicle → drive → deliver

navigate → visit_location_A → collect → visit_location_B → deliver

Use reusable mission steps and configurable stage data.

### Suggested stage progression

Stages 1–10: Beginner Missions
- Simple directions.
- Short distances.
- One object.
- One destination.
- Basic navigation.

Stages 11–20: Getting Around
- More turns.
- More objects.
- Similar buildings.
- Simple exploration.

Stages 21–30: Exploring Town
- Fog of War.
- Landmarks.
- Hidden destinations.
- Longer routes.

Stages 31–40: Street Navigator
- Street names.
- Named avenues.
- Intersections.
- Road signs.

Stages 41–50: The Delivery Challenge
- Multiple deliveries.
- Multiple characters.
- Different objects.
- Task sequencing.

Stages 51–60: Vehicle Missions
- Identify vehicles.
- Enter vehicles.
- Drive to destinations.
- Navigate using road networks.

Stages 61–70: Advanced Navigation
- Conditional directions.
- Restricted routes.
- Multiple landmarks.
- More complicated maps.

Stages 71–80: Complex Missions
- Multiple destinations.
- Multiple objects.
- Multiple characters.
- Longer instruction sequences.

Stages 81–90: Expert Missions
- Complicated routes.
- Conditional tasks.
- Similar-looking objects and buildings.
- Tight time limits.

Stages 91–100: Master Navigator
- Combination of all mechanics.
- Complex instructions.
- Several locations.
- Multiple deliveries.
- Challenging time limits.

These are progression guidelines, not rigid restrictions.

Introduce mechanics gradually and ensure players have encountered a mechanic before being expected to master it.

The system should support unlimited additional stages.

---

# 9. TIMER SYSTEM

Every mission must have a countdown timer.

The timer starts when the player closes the briefing and begins gameplay.

Suggested initial time limits:

| Difficulty | Time |
|---|---:|
| Beginner | 60 seconds |
| Easy | 75 seconds |
| Normal | 90 seconds |
| Hard | 120 seconds |
| Expert | 150 seconds |
| Master | 180 seconds |

These values must be configurable per stage.

### Timer behaviour

- Display the timer prominently.
- Use a visual countdown.
- Change appearance when time is running low.
- Provide a subtle warning near the end.
- Stop the timer immediately when the mission ends.
- If time reaches zero, the mission fails.
- Do not allow players to pause the timer by opening other interfaces.
- Prevent background tab switching from creating unfair extra time.

The timer should use accurate elapsed-time calculations rather than relying exclusively on decrementing a JavaScript counter.

---

# 10. SCORING AND STAR SYSTEM

The game must evaluate how well the player followed instructions.

Use five scoring categories:

1. Memory and task completion.
2. Navigation accuracy.
3. Object and character identification.
4. Instruction sequence accuracy.
5. Completion speed.

Use a configurable scoring system.

Suggested weighting:

| Category | Weight |
|---|---:|
| Task completion and memory | 30% |
| Navigation accuracy | 25% |
| Observation | 20% |
| Correct task sequence | 15% |
| Time performance | 10% |

The exact scoring model should be adaptable to different mission types.

### Star ratings

Use three stars.

Suggested thresholds:

- 1 star: 50–69 points.
- 2 stars: 70–89 points.
- 3 stars: 90–100 points.

A completed mission below 50 points should show completion without stars.

A failed mission should not unlock the next stage.

### Mistake tracking

Track:
- Incorrect movements.
- Wrong turns.
- Incorrect building selections.
- Incorrect object selections.
- Incorrect character selections.
- Incorrect task sequence.
- Missed mission requirements.

Not every mistake should have the same penalty.

For example, a wrong turn should reduce navigation accuracy, while selecting the wrong person should reduce observation accuracy.

### Results screen

Display:

- Mission completed or failed.
- Total score.
- Stars earned.
- Time taken.
- Accuracy.
- Number of mistakes.
- Breakdown of scoring categories.
- Best previous score.
- Replay button.
- Next stage button, if unlocked.

Make the results screen celebratory and visually attractive.

---

# 11. ASSET MANAGEMENT AND SPRITE SHEETS

This is a very important requirement.

The game will contain numerous visual assets, but they must be designed for reuse.

I do not want hundreds of individually generated images where a single sprite sheet could have been used.

Most illustrations will be generated as sprite sheets containing multiple separate assets.

For example:

One image could contain eight different objects arranged in a clean 4 × 2 grid.

Claude should inspect the sprite sheet, identify the individual assets and cut them into separate transparent PNG files.

### Example asset sheets

**Sheet 1: Everyday Objects**

- Red cap.
- Blue cap.
- Green cap.
- Backpack.
- Book.
- Keys.
- Shoes.
- Water bottle.

**Sheet 2: Buildings**

- Library.
- School.
- Hospital.
- Supermarket.
- Bakery.
- Police station.
- Restaurant.
- Petrol station.

**Sheet 3: Characters**

- Librarian.
- Teacher.
- Doctor.
- Shopkeeper.
- Mechanic.
- Police officer.
- Student.
- Delivery person.

**Sheet 4: Vehicles**

- Green car.
- Red car.
- Blue car.
- Taxi.
- Bus.
- Truck.
- Motorcycle.
- Bicycle.

**Sheet 5: Environmental Objects**

- Tree.
- Fountain.
- Bench.
- Streetlight.
- Traffic light.
- Road sign.
- Bus shelter.
- Trash bin.

**Sheet 6: Road and Map Tiles**

- Straight road.
- Horizontal road.
- Vertical road.
- Left turn.
- Right turn.
- T-junction.
- Four-way intersection.
- Dead end.

**Sheet 7: Ground and Environment**

- Grass.
- Pavement.
- Road surface.
- Sidewalk.
- Garden.
- Water.
- Building ground.
- Road markings.

These are examples, not the complete asset list.

### Sprite sheet requirements

When generating or processing sprite sheets:

- Arrange assets in a clean grid.
- Keep assets separated.
- Avoid overlapping objects.
- Maintain consistent proportions.
- Use transparent backgrounds where appropriate.
- Avoid unnecessary margins.
- Ensure every asset can be cropped independently.
- Maintain a consistent illustration style.

Claude must create a sprite extraction workflow.

Use Python and Pillow if appropriate.

The extraction workflow should:
1. Load the original sprite sheet.
2. Identify the grid dimensions.
3. Crop each individual asset.
4. Remove or preserve the background as appropriate.
5. Export each asset as an individual PNG.
6. Use consistent file naming.
7. Generate a preview/contact sheet.
8. Save the extracted assets in the correct directories.

Do not assume every sprite sheet will have the same number of rows and columns.

Create a configurable extraction script that supports different layouts and manually adjustable crop boundaries.

For assets that do not fit a regular grid, support manual crop coordinates.

### Asset directory structure

Use an organised structure similar to:

assets/
    characters/
        librarian.png
        teacher.png
        doctor.png
    objects/
        red-cap.png
        blue-cap.png
        book.png
        keys.png
    vehicles/
        green-car.png
        red-car.png
        bus.png
    buildings/
        library.png
        school.png
        hospital.png
    environment/
        trees/
        landmarks/
        roads/
        ground/
    ui/
        icons/
        buttons/
        stars/
        inventory/
    spritesheets/
        original/
        extracted/

Adjust this to fit the existing Playmona project structure.

### Reusability

The same assets should be used across multiple stages.

A library building should not need a separate image for every stage.

A character can appear in different locations and missions.

Objects can be placed into different busy scenes.

Buildings and landmarks can be reused to create many different towns.

Create an asset registry or manifest so that stages reference assets by their identifiers rather than hardcoding image paths everywhere.

Example:

{
    "red_cap": "/assets/objects/red-cap.png",
    "library": "/assets/buildings/library.png",
    "librarian": "/assets/characters/librarian.png"
}

### Asset generation strategy

Do not generate all assets in one enormous sprite sheet.

Create manageable sheets grouped by category.

Maintain a consistent visual style across all sheets.

When an asset is missing, identify it and provide a clear asset-generation requirement rather than silently substituting an unrelated image.

---

# 12. MAP GENERATION AND REUSABILITY

Create a reusable map system.

Maps should be data-driven and support:

- Grid dimensions.
- Roads.
- Buildings.
- Walkable areas.
- Obstacles.
- Intersections.
- Landmarks.
- Street names.
- Hidden destinations.
- Starting coordinates.
- Player orientation.
- Vehicle routes.

A map should be reusable across multiple stages with different missions.

Create several town layouts rather than using one map for all 100 stages.

For example:

- Small village.
- Residential neighbourhood.
- Shopping district.
- School neighbourhood.
- Town centre.
- Industrial area.
- Suburban streets.

Maps should have logical road connections.

Ensure there is a valid path to the intended destination.

### Important map rules

1. The player must not be able to move through buildings.
2. Buildings should be clickable only when the player is sufficiently close.
3. Destinations must remain unidentified until interacted with.
4. Fog of War must hide unexplored areas.
5. The game must never reveal the correct route.
6. The player should be able to retrace their steps.
7. Wrong turns must be handled correctly.
8. Each stage should be tested for route validity.

Create a map validation system to detect impossible missions before they are published.

---

# 13. MISSION ENGINE ARCHITECTURE

Build a central mission engine.

This is critical for supporting 100+ stages.

Do not implement each stage as an independent collection of custom JavaScript functions.

The mission engine should support reusable actions such as:

- SHOW_BRIEFING
- COLLECT_OBJECT
- NAVIGATE
- DISCOVER_LOCATION
- IDENTIFY_CHARACTER
- IDENTIFY_OBJECT
- ENTER_VEHICLE
- DRIVE
- DELIVER_OBJECT
- INTERACT
- VISIT_LOCATION
- COMPLETE_MISSION

Stages should define a sequence of actions.

The engine should:
- Load stage configuration.
- Initialise the map.
- Initialise player position and orientation.
- Load the mission.
- Start the timer.
- Track completed actions.
- Validate player actions.
- Update inventory.
- Track mistakes.
- Calculate scores.
- Determine completion.
- Save progress.

The engine should be extensible so that new mechanics can be introduced without rewriting existing stages.

Separate the following concerns:

- Mission logic.
- Navigation logic.
- Map rendering.
- Asset management.
- User interface.
- Timer.
- Scoring.
- Progress persistence.

Use clean, maintainable and well-documented code.

---

# 14. PLAYER PROGRESS AND PERSISTENCE

Integrate with Playmona's existing player and game-progress systems.

Do not create an entirely separate authentication or player account system.

Use the existing Playmona architecture and conventions.

Persist:

- Highest unlocked stage.
- Completed stages.
- Stars earned per stage.
- Best score per stage.
- Best completion time.
- Total stars.
- Total missions completed.
- Overall progress.

The game must restore player progress when they return.

Progress should be stored securely using the existing Playmona backend and database architecture.

Do not rely exclusively on localStorage for permanent progress.

Temporary gameplay state can be maintained client-side.

If the player refreshes or leaves during an active mission, handle the interrupted attempt consistently with Playmona's existing game-session conventions.

Prevent duplicate or manipulated score submissions where possible.

---

# 15. LIGHTWEIGHT PERFORMANCE

Performance is a major requirement.

Mission Trail must remain lightweight.

Optimise for:

- Android devices.
- Low-memory devices.
- Mobile browsers.
- Desktop browsers.
- Different screen sizes.
- Touch and mouse interaction.

Implementation guidelines:

1. Use HTML, CSS and JavaScript unless the existing Playmona game architecture specifies otherwise.
2. Reuse assets.
3. Lazy-load stage-specific assets.
4. Do not preload all 100 stages' images.
5. Use sprite sheets where beneficial.
6. Cache reusable assets.
7. Avoid unnecessary DOM elements.
8. Avoid expensive rendering operations.
9. Use requestAnimationFrame where appropriate.
10. Optimise image dimensions and compression.
11. Avoid unnecessarily large background images.
12. Ensure smooth movement on low-end devices.

Do not introduce a heavy game engine without a compelling technical reason.

---

# 16. SOUND AND ANIMATIONS

Use subtle sound effects to improve the experience.

Suggested sounds:

- Opening a letter.
- Collecting an object.
- Correct selection.
- Incorrect selection.
- Player movement.
- Discovering a location.
- Successful delivery.
- Mission completed.
- Mission failed.
- Star earned.

Provide sound controls.

Sound must be optional.

Animations should include:

- Letter opening and closing.
- Object collection.
- Player movement.
- Building discovery.
- Character interaction.
- Vehicle entry.
- Mission completion.
- Star celebrations.

Avoid excessive animations that slow down gameplay.

---

# 17. MOBILE-FIRST USER EXPERIENCE

Mission Trail must be designed mobile-first.

The gameplay screen should prioritise the environment.

Suggested layout:

TOP:
- Stage number.
- Countdown timer.
- Mission progress indicator.
- Inventory.

MIDDLE:
- Main 2D navigation environment.

BOTTOM:
- Four directional movement buttons.
- Context-sensitive interaction button where necessary.

Controls should not obstruct important parts of the environment.

The game should adapt to:
- Portrait screens.
- Landscape screens.
- Tablets.
- Desktop browsers.

On smaller screens, ensure the player can comfortably operate the controls using one or both thumbs.

Prevent accidental browser scrolling while interacting with directional controls, without breaking normal page navigation outside the game.

---

# 18. SAMPLE INITIAL STAGES

Create at least the first 10 fully playable stages.

Do not just create placeholder stage cards.

The first 10 stages must introduce the mechanics progressively.

Suggested missions:

**STAGE 1: THE BUS STOP**

Instruction:

"Go straight for 5 steps. Turn right and go straight for 3 steps. You will reach the bus stop."

Mechanics:
- Basic navigation.
- One destination.
- No object collection.

**STAGE 2: THE BAKERY**

Instruction:

"Go straight for 3 steps. Turn left and continue for 4 steps. Find the bakery."

Mechanics:
- Basic navigation.
- First left turn.

**STAGE 3: THE SCHOOL**

Instruction:

"Go straight for 4 steps. Turn right and go straight for 2 steps. You will find the school."

Mechanics:
- Basic navigation.
- Different building identification.

**STAGE 4: THE RED CAP**

Instruction:

"Collect the red cap. Go straight for 4 steps, turn left and continue for 3 steps. Give the cap to the teacher at the school."

Mechanics:
- Object collection.
- Navigation.
- Character identification.
- Delivery.

**STAGE 5: THE LIBRARY DELIVERY**

Instruction:

"Collect the blue book. Go straight for 5 steps, turn right and continue for 3 steps. Find the library and give the book to the librarian."

Mechanics:
- Object collection.
- Navigation.
- Destination discovery.
- Character identification.

**STAGE 6: THE FOUNTAIN**

Instruction:

"Go straight until you reach the fountain. Turn left at the fountain and continue for 4 steps. You will find the supermarket."

Mechanics:
- Landmark recognition.
- Exploration navigation.
- Hidden destination.

**STAGE 7: THE RIGHT PERSON**

Instruction:

"Go to the hospital. Find the doctor wearing a white coat and give him the medical bag."

Mechanics:
- Navigation.
- Object collection.
- Character identification.

**STAGE 8: THE STREET CORNER**

Instruction:

"Take Dave Street. Continue until the second intersection. Turn right and find the bakery."

Mechanics:
- Street navigation.
- Intersection counting.
- Fog of War.

**STAGE 9: THE GREEN CAR**

Instruction:

"Find the green car parked outside the supermarket. Get inside and drive to the hospital."

Mechanics:
- Vehicle identification.
- Vehicle entry.
- Driving navigation.

**STAGE 10: THREE DELIVERIES**

Instruction:

"Collect the newspaper and deliver it to John at the post office. Afterwards, collect the keys from Mary at the school and take them to the mechanic."

Mechanics:
- Multiple objects.
- Multiple destinations.
- Multiple characters.
- Correct sequence.
- Memory challenge.

Ensure these missions are genuinely playable and their maps, objects, instructions and destinations are logically consistent.

You may adjust the routes and coordinates to suit the generated maps.

---

# 19. TESTING AND QUALITY ASSURANCE

Before considering the game complete, test:

### Navigation
- Correct movement in all four directions.
- Correct turn interpretation.
- Collision detection.
- Road connectivity.
- Player orientation.
- Fog of War visibility.
- Previously explored areas.
- Hidden destination behaviour.

### Missions
- Correct object collection.
- Correct character identification.
- Correct destination identification.
- Correct action sequence.
- Mission completion.
- Mission failure.

### Scoring
- Correct score calculation.
- Star thresholds.
- Time bonus.
- Mistake penalties.
- Replay improvements.
- Best score preservation.

### Progression
- Locked stages remain inaccessible.
- Completing a stage unlocks the next.
- Completed stages display stars.
- Replaying stages works.
- Progress survives page refreshes and new sessions.

### Performance
- Test on mobile-sized screens.
- Test on low-end devices where possible.
- Verify that assets load efficiently.
- Ensure no memory leaks from timers or animations.

---

# 20. DEVELOPMENT APPROACH

Before implementation, inspect the existing Playmona codebase.

Understand:

- Existing game architecture.
- Game registration and routing.
- Authentication and player identification.
- Existing progress persistence.
- Database conventions.
- API conventions.
- Asset loading mechanisms.
- Game UI standards.
- Existing responsive design patterns.

Do not create a parallel architecture that conflicts with Playmona.

Reuse existing components and conventions wherever possible.

### Development phases

**PHASE 1: Foundation**
- Create the game structure.
- Implement the landing screen.
- Implement stage selection.
- Implement locked, unlocked and completed stage states.
- Create the stage configuration system.

**PHASE 2: Mission Engine**
- Implement briefing.
- Implement timer.
- Implement mission state management.
- Implement object collection.
- Implement inventory.
- Implement scoring.

**PHASE 3: Navigation**
- Implement grid-based movement.
- Implement map rendering.
- Implement collision detection.
- Implement hidden destinations.
- Implement Fog of War.
- Implement basic navigation.

**PHASE 4: Advanced Mechanics**
- Implement street navigation.
- Implement landmarks.
- Implement characters.
- Implement vehicles.
- Implement conditional instructions.
- Implement multiple deliveries.

**PHASE 5: Assets**
- Create sprite sheets.
- Extract individual assets.
- Build the asset registry.
- Create reusable map tiles.
- Create reusable scenes.

**PHASE 6: Initial Stages**
- Implement and test the first 10 stages.
- Ensure difficulty progression is logical.
- Ensure every mission is completable.

**PHASE 7: Integration**
- Integrate with Playmona.
- Implement persistent player progress.
- Implement score submission.
- Test mobile and desktop behaviour.

---

# 21. IMPORTANT DEVELOPMENT RULES

Please follow these requirements throughout development:

1. Do not build a basic prototype and stop there. The goal is a production-quality game.
2. Do not hardcode every stage independently.
3. Use a reusable mission engine.
4. Keep assets reusable and organised.
5. Do not reveal destinations or correct routes.
6. Instructions must disappear after the player acknowledges them.
7. The timer must not start while the player is reading the mission.
8. Use Fog of War in appropriate stages.
9. Support more than 100 stages.
10. Make the stage system easy to expand.
11. Maintain consistency with Playmona's existing architecture.
12. Do not break existing games or platform functionality.
13. Prioritise mobile performance.
14. Do not use placeholder assets in the final implementation where actual assets are required.
15. Ensure all implemented mechanics are functional, not just visually represented.
16. Make all stages logically completable.
17. Document how to add new stages and register new assets.

When you encounter an architectural decision, choose the approach that provides the best long-term scalability and maintainability.

Do not unnecessarily ask for confirmation on ordinary implementation decisions. Make sensible professional decisions and proceed.

---

# 22. FINAL DELIVERABLE

At completion, I expect:

1. A fully integrated Mission Trail game inside Playmona.
2. An attractive landing screen.
3. A stage-selection system supporting 100+ stages.
4. Proper stage locking and unlocking.
5. Star-based stage completion indicators.
6. A reusable mission engine.
7. Three navigation systems.
8. Fog of War.
9. Hidden destinations.
10. Object collection and inventory.
11. Character and vehicle interactions.
12. A configurable countdown timer.
13. A comprehensive scoring system.
14. Reusable map layouts.
15. A reusable asset library.
16. Sprite sheet extraction tools.
17. At least 10 fully playable initial stages.
18. Persistent player progress.
19. Responsive mobile and desktop interfaces.

The most important architectural objective is this:

**Create a game engine where adding Stage 101, Stage 150 or Stage 200 is primarily a matter of defining mission data and selecting reusable assets, not writing a new game implementation.**

The game should feel like an adventure where the player receives secret instructions and must rely on their memory, observation and navigation skills to complete the mission.

Make Mission Trail one of Playmona's most engaging and distinctive games.

**READ THE EXISTING PROJECT FIRST, PLAN THE IMPLEMENTATION, THEN BUILD. WE CAN START BY BUILDING THE 1ST STAGE TO SEE IF IT WORKS PERFECTLY BEFORE BUILDING OTHERS**