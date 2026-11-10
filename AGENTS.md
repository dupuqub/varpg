# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state: screen navigation (main menu, test chambers list, Chamber 1) and the first movement test in Chamber 1: a player that is always at the center of the screen and moves. The collision grid (cells and window) exists, but collision itself and combat are not implemented yet. See "Code layout".

## Concept

The game is a constructive critique of the methods of some games. Axes, in priority order:

1. **Respect for the player's time.**
2. **Data transparency** (against data obfuscation).
3. **Reproducibility:** a run must be repeatable identically, including for machine learning.

The game is about **builds**: a massive skill tree, but also testing one thing at a time. The structure of the project and its process must let new skills appear without major problems, with automated tests that guarantee the synergies work.

### Game loop

Enter a map (Vampire Survivors style), run the build, collect resources, leave the map, improve the build, next map.

### Respect for time (design rules)

- 10-minute maps.
- Skill tree respec is always free and unlimited.
- The player must always be able to pivot builds between runs.

### Transparency (design rules)

- There must be a page that shows in detail how each hit of damage was calculated: an annotated formula that says where and when each buff is applied, and in what order.
- It is not didactic. It is an audit: the player needs full awareness of the build's real performance, to improve it effectively and to give feedback on the game's logic.

## Decisions

### Theme: mechas

- The game is about mechas. Instead of armor, as in Path of Exile and Diablo, the character has parts: left arm, right arm, left leg, right leg, etc.
- The user will provide the full list of parts later. Do not invent parts before that.

### Screens

Keep everything simple. Screens are HTML and CSS, and only one is shown at a time.

- **Entry screen** with 3 buttons: NEW GAME, CONTINUE and TEST CHAMBERS. NEW GAME and CONTINUE do nothing yet (they are disabled).
- **TEST CHAMBERS** is another screen, where the user picks which test map to run. More tests will come. **Chamber 1: Movement** is only for testing movement. Nothing else goes in it. The user checked it in the browser (Chromium on Linux, 60 Hz and 100 Hz monitors) and everything looked and behaved as described (circle, ground grid, collision window overlay and movement). That check was made before the manual aim was removed, which also removed the aim arrow.
- Every chamber has a name after its number, shown on the list and as its title: **Chamber 1: Movement**, **Chamber 2: Diagnostics** (the user's rule; give a name to each new chamber).
- Chambers are not necessarily places in the game. **Chamber 2: Diagnostics** is a test bench: buttons that run something in the real browser and print plain text into a box, with a COPY button, so the user can paste the output to the agent. Current buttons: ENVIRONMENT (browser, screen, gamepads, how many frame callbacks per second the browser gives), SIMULATION CHECK (a 600-frame scripted run played twice, the history and the cross-check, including a snap changed on purpose to see that the check notices it, and the final state) and DATA (the definitions and the initial state). The scripted run uses no trigonometry, so every browser must print the same final position; compare outputs between machines or against a Node run.

### Stack

- JavaScript, HTML and CSS for the UI; canvas 2D for sprites and tiles. The canvas only draws.
- Maximum simplicity: no game engine or library. Plain JavaScript (the user feared TypeScript would complicate the project).
- Own simple collision: absolutely everything is a circle for collision. There are no walls. If scenery is ever needed, it is made of static circle actors.

### Simulation

- **Deterministic:** the same initial state and the same inputs produce an identical run. One of the goals is to reproduce runs for machine learning.
- **60 steps per cycle** (1 s in the best case). All game values are based on 60 fps.
- Physics is calculated once per frame: **one step per displayed frame**. Steps are never skipped and frames that are not shown are not calculated ("calculate and show, always"). If the machine cannot keep 60 fps, the game runs in slow motion.
- **The game state is a single JSON object.**
- **Frame debug:** be able to pause and have a button that advances one frame at a time, to understand what happens at each moment.
- There are no internal intra-pause or intra-play tools: debugging uses only normal play and frame by frame.

### State, definitions and rules

The user wants the smallest possible state. The state is a **photo** of how the game is now, not of what is done in it.

- **Definitions (the "db", now to be called the **library**, see "The library" below):** what the game *is*, and it never changes during a run. For each actor type: the fixed values (base speed, radius, max health, ...) and its **initial state**, the complete state of a new actor of that type. `createActor` only copies it, so no number about how an actor is born is hidden in code. It lives in a read-only file, `src/data.js`, a plain object `DEFINITIONS` that is deep-frozen, loaded by `<script>` so `index.html` still opens directly (a `.json` would need `fetch` and a server). An actor points to its definition by id (`type: "player"`), and `definitionOf(actor)` returns it. A type without `move` in its initial state is static, like a trap. Implemented for the player.
- **State:** only what changes: position, current health, direction, frame, active buffs. Rule of thumb: if it can change during a run, it is state; if it never changes, it is a definition; if the player chose it before the run, it is the build.
- **Build:** what the player chose for this run (allocated skill tree, equipped mecha parts). It is an **input** of the run, like the seed and the map, not a state: it does not evolve. It is kept with the run, not in the snaps. Only the avatar has a build; other actors read their definition directly. Implemented as an **empty** object: `createRun(id)` returns `{ id, build: {} }`, and nothing reads the build yet. (The agent first called this a "pre-run state" and proposed an avatar "already prepared" with the build applied. The user found it confusing and it was dropped: nothing is pre-resolved.)
- **Effects: recipe versus result.** Take a torso that gives +1 armor per enemy within radius X. What it does (the recipe) is in the definitions, in the part. Whether the player uses it is in the build. How much armor it gives *now* is **not stored**: a function like `finalSpeed` (for example `finalArmor(actor)`) computes it every frame from the recipe, the build and the state (the enemy positions). Only something with memory goes into the state, such as "this buff lasts 3 more seconds". The terms of `(X + Y + Z) * W` in the damage trace each come from one part of the build.
- Agent's warning: do not store derived values (such as `finalSpeed` or total damage) in actors for convenience, and keep an eye on lists of active effects (buffs, poison, slow), which are the fields that grow the most.
- **Rules (code):** `step`, `finalSpeed`, etc. The order of the phases is written in `step`, is the same in every run, and is not stored anywhere.
- The state carries the **version of the definitions** it was made with (`state.definitionsVersion`, from `DEFINITIONS_VERSION`, a number raised by hand on any change; nothing refuses a mismatched state yet), so a test can refuse a photo from another version (a photo alone is not self-contained: it only makes sense with the right definitions).
- **Speed:** the actor has `baseSpeed`. The function `finalSpeed(actor)` (code, pure, no clock or randomness) returns the top speed in the current frame, and movement aims at that value (see "Movement and input" for the inertia). Buffs, mecha parts, etc. will be applied inside it, in order. `finalSpeed` is not stored in the actor (it would be derived data that can go stale). Implemented: for now it only returns the base speed. When buffs arrive it will probably return the value and the steps of the calculation, which the audit page will want.

### The world: seed and rocks

The user's decisions (and the agent's first implementation, with provisional values). **Rocks are actors** (static, no `move`, circles), so in the future actors will not pass through actors (see "Collision grid"). They exist by **seed and formula**, so they are not stored in the state.

- The seed is `state.seed` (a whole number, 1 in Chamber 1 for now). It is in the state so a snap alone is enough to replay: the rules read it from there.
- The rocks are a pure function of the seed and the position: `rocksInArea(seed, left, top, right, bottom)` in `src/sim.js` returns `{ type, position: { x, y } }` for every rock whose center is in the area, in a fixed order. The world is cut into squares of 256 px (`DEFINITIONS.terrain.rocks`), each with at most one rock (35% chance), placed with a margin of 20 px from the edges of its square, so rocks of neighbor squares never overlap. No rock within 200 px of the starting point (0, 0). The type is picked from `kinds`. Looking at a bigger area never changes a rock. Positions are whole numbers.
- `hashInts(seed, x, y, salt)` makes the numbers: only `Math.imul`, xor and shifts, so it is exact in every browser (no trigonometry, no `Math.random`). **Known answer** (test 39, and the ROCKS lines of DATA in Chamber 2): seed 1 gives 12 rocks on the first screen, the first a boulder at 172,-435.
- Rock types are actor types in the definitions: `stone` (radius 16, bounce 0), `boulder` (radius 20, bounce 0.5) and `rubber` (radius 12, bounce 1). **Bounce** (the user's idea): how much of the speed of whoever hits the rock comes back, 0 = none, 1 = all. **Not used yet**: there is no collision yet. The margin (20) must be at least the largest rock radius, and `cellSize` of the collision grid at least 2 x (largest radius + largest speed) = 64 now.
- Chamber 1 draws the rocks as gray circles with their world position (`x,y`) above each, so the user can check with the agent that they are in the right place. Chamber 2, button DATA, prints the rocks of the first screen as text.
- Planned (the user's ideas, **not implemented**, in this order): first collision of the avatar with rocks, one problem at a time (open question: with bounce 0, does the avatar stop completely, or lose only the part of the speed that hits the rock and slide along it? the agent recommends sliding); later collision between moving actors with **mass** (the avatar's mass would be the total weight of its build, so a 5 t mecha pushes light enemies), the user wants the **dash force to push enemies a little and open space** when surrounded (the user wants the tension of being surrounded); later three kinds of dash: normal, **blink** (goes through rocks) and **charge** (breaks rocks; broken rocks would be a small list in the state). Agent's cautions: pushes in a chain need a fixed order and a limit of iterations; the formula must be reviewed if rocks are ever generated outside the collision window (see "Collision grid").

### The library (names agreed with the user)

The "db" is called the **library**, because it must be modular: content that comes from the base game, a DLC or an update has to plug in.

```
library
  └─ shelf   one per pack: master (the base game), dlc1, ...
       └─ book   one per kind of content: monsters, heroes, skills, parts, ...
            └─ entry   goblin, a fire skill, a torso, ...
```

- A **shelf** is a pack. A DLC is a new shelf with its own books, and it does not touch `master`.
- A **book** is a kind of content. Heroes and monsters are both actors, so their books use the same actor structure, in separate books.
- The address of an entry is `shelf:book:entry`, for example `master:monsters:goblin`. Two packs can both have a goblin without a clash. Snaps and runs store this address.
- "All the monsters of the game" are the `monsters` book of every shelf. The library does that lookup and joins them when it loads, so the rest of the code does not need to know.
- The version is **per shelf** (not one number for the whole game). A snap made with a pack that is not installed must be refused with a clear message.
- The library is deep-frozen **once**, after all shelves are joined.
- Effects from pack content (for example a torso recipe) must be **data the game understands**, not loose code from the pack. With code, determinism and the synergy tests would be much harder to guarantee.
- The user asked for `master` for the base shelf. The agent only noted that some people avoid that word in software.
- **Not implemented yet.** The code still has a single flat object, `DEFINITIONS`, in `src/data.js`, with `actor.type` as a plain id (`"player"`) and `DEFINITIONS_VERSION` as a single number. Moving it to library, shelves and books (and `actor.type` to a full address) is a separate step.

### Run history (two logs)

Agreed with the user. Implemented in `src/history.js` and recorded by the Chamber 1 loop (no buttons, no automatic cross-check yet; from the browser console, `crossCheck(runHistory)` runs it).

- **Vocabulary:** a **snap** is a saved copy of the state at one frame (the user's word, because "json" is the file type used for many other things). "State" is the live one.
- Each snap carries `run` and `frame` (`state.run` is the id of the run, set by `createChamber1State(runId)`; the rules never read it), so a snap exported to disk can be identified (two runs both have a "frame 300").
- Agent's default, not yet confirmed: going back and pressing play discards the snaps and inputs after that frame together (`discardAfter`).
- The game keeps the **last 100 snaps** and the **last 100 inputs** (`HISTORY_SIZE`), in two lists where index 0 is the oldest. Every step appends the new state and input (`recordFrame`), and if there are more than 100, the oldest (index 0) is removed. The lists are **aligned**: same index = same frame, and `inputs[i]` is the input of the step that produced `snaps[i]`. The first snap has no input (`null`). Snaps and inputs are saved as copies.
- **Cross-check** (`crossCheck(history)`): take the oldest saved state, apply the saved inputs with `step`, and compare each result with the saved state of the same frame. It returns `null` if everything matches, or the first difference: `{ frame, path, expected, actual }` (for example `actors[3].position.x`: expected 120.5, got 120.6). A difference means something is not deterministic. Planned: run it continuously (for example every 100 frames), not only on demand.
- It proves **consistency**, not **correctness**: a wrong rule replays equally wrong. Correctness is the job of the synergy tests and the damage audit page.
- No hashes: with full states the comparison is state against state, and the states stay readable JSON.
- **Going back while paused:** the user can walk back through the 100 saved frames (about 1.7 s). Pressing play on a past frame discards the states **and inputs** after it, and the run continues from there with new inputs. Going back must load a **copy** of the saved state (`stateFromSnap`), because `step` changes the state in place.

### Movement and input (first test, Chamber 1)

The user approved this and noted that everything may change.

- The canvas is **1920 x 1080** (the user's requirement), and world units are canvas pixels. **Chamber 1 is a full-window game view** (the user's requirement: the whole screen is playable, no title or button taking space around it): the canvas fills the window and keeps its 16:9 shape, with black bars if the window has another shape. A small faint label in the top-left corner shows the title, the controls and a BACK button; Esc also goes back. At exactly 1920 x 1080 (for example the browser in full screen, F11) one canvas pixel is one screen pixel; in a smaller window the picture is scaled down, and the world shown is always the same 1920 x 1080 area.
- The player is always at the center of the screen (the camera follows the player).
- Move with WASD or the left analog stick. **There is no manual aim** (the user's decision, no mouse and no right stick): the weapons aim by themselves. The user described four automatic weapons, on the shoulders and on the arms, with ammunition, damage types and so on (the details do not matter yet). So the avatar has no `aim` field. A weapon's target will be data of the weapon, later.
- The player is drawn as a white circle. The arrow that showed where it looked was removed with the manual aim. If the avatar should show a facing direction (for example its movement direction), the user has not asked for it.
- `move.direction` is a vector with length 0 to 1. On the keyboard, diagonals are normalized so they are not faster.
- Vectors (for example `move.direction`) are used instead of angles, so the simulation needs no trigonometry (which can differ between browsers and hurt determinism).
- **Movement has inertia** (the user's requirement, from his earlier project, where movement felt more dynamic): the avatar speeds up and slides to a stop. `move.direction` is what the actor *wants* (the input), and `move.velocity` (`{ x, y }`, pixels per frame) is how it is *really* moving. The velocity is **state** (it has memory), so it is stored. Every frame, in `step`, `approach(velocity, target, rate)` moves the velocity in a straight line toward `target = direction x finalSpeed(actor)`, by at most `rate`, and lands exactly on the target when it is within reach. `rate` is `acceleration` while the actor wants to move (direction not zero) and `deceleration` when it does not. Turning around passes through zero, with no jump. Only arithmetic and `Math.sqrt` (exact in every browser), so it stays deterministic. Then `position += velocity`.
- `acceleration` and `deceleration` are fixed values in the definitions (pixels per frame, per frame). **Provisional, to be tuned by feel:** 0.25 and 0.125, which give 12 frames (0.2 s) from rest to the top speed 3 and 24 frames (0.4 s) to stop. They are powers of two on purpose, so the numbers add up exactly in floating point and the speed lands on the top speed at a round frame. Later, mecha parts (for example the legs) may change them, in a function like `finalSpeed`.
- Diagonals: the keyboard input is normalized (0.707), not 0.8 as in the user's old project. Not confirmed by the user.
- **Dash** (the Booster of the user's old project; keys: Space or the gamepad A button, the user's choice). Implemented in `updateDash` in `src/sim.js`. Pressing it spends one charge and sets `move.velocity` to `direction x dash speed` at once (the direction is always taken at full length, so a half-tilted stick dashes just as hard). While the actor is faster than its top speed, the speed falls by the **constant** `DEFINITIONS.constants.overspeedDecay` (0.5 pixels per frame, every frame) instead of the acceleration or deceleration, down to the top speed, and then normal movement takes over. The frame of the dash already moves at the full dash speed. With dash 12 and top speed 3 that is 18 frames (0.3 s), about 142 px. The dash strength comes from `finalDashSpeed(actor)`, a pure function like `finalSpeed`: **any mecha part may add to it** (the user's decision), but the decay is a constant, never changed by parts or buffs. So a stronger dash is also a longer dash: (strength - top speed) / decay frames. Dash without a direction does nothing and keeps the charge (agent's choice, the user did not object). The dash state is `actor.dash = { charges, recharge }` (`recharge` counts frames while below the maximum, and a charge returns at `rechargeFrames`); the maximum, the recharge time and the dash speed are in the definition: provisional values 1 charge, 240 frames (4 s), speed 12. `OVERSPEED_TOLERANCE` (1e-9) keeps the rounding error of a diagonal from counting as "faster than the top speed". The input is `{ move, dash }`, where `dash` means "pressed in this frame" and is kept in the history with the move. Later the Booster part supplies speed, charges and recharge.
- **Top speed is dynamic** (the user's requirement): it is read again every frame. The actor has `baseSpeed` (in the definitions) and a `finalSpeed(actor)` function gives the top speed used each frame (see "State, definitions and rules"). Where the value comes from (for example the mecha legs) is not defined yet.
- Agent's addition: a faint grid on the ground. With the camera locked on the player, an empty background would make movement invisible.
- Gamepad: the browser only exposes it after a button is pressed. The left stick has a radial dead zone of 0.15.
- The loop in `src/main.js` runs at most one step per browser callback. On monitors above 60 Hz the extra callbacks are ignored (no step, no drawing), so the game does not speed up. On slow machines it runs in slow motion.

### Spawn

- Every X time, Y spawn. For each map, exactly what appears and when is known in advance.
- At first, all actors want to attack the player.
- An actor that leaves the screen reappears on the opposite side. So there is a limited number of actors always present, almost all on screen. Since the collision window is the universe (see "Collision grid"), the "screen" of this rule is the window, and the jump happens off screen.
- Where collision is tested is limited by the collision grid (see "Collision grid").

### Collision grid

- The **window** of cells around the avatar is the **whole universe of the game** (the user's decision): nothing ever exists outside these cells. Every actor is always inside it, and collision is tested only between actors inside it.
- The cells come out of the avatar (the avatar is in the center cell), but the window must cover **all the ground where an actor can be**, including actors that are off screen (the user's requirement: at least twice the screen). It is a rectangle: `windowWidth` x `windowHeight` cells, each odd and at least 3.
- Current window: **61 x 35** cells of 64 px, which is 3904 x 2240 px, a little more than twice the 1920 x 1080 screen. How far outside the screen actors can be depends on where they spawn, which is not decided, so the size is a dev setting to adjust. Agent's note: a bigger window costs almost nothing, because what costs is the number of actors tested, not the area; too small a window makes actors overlap; so err on the larger side.
- Cell size and window size are **dev settings**, kept in `state.grid` (`cellSize`, `windowWidth`, `windowHeight`) so a run is reproducible. Do not hard-code them elsewhere. Current values: 64, 61 and 35.
- Every actor **stores its cell** in `actor.cell` (`{ x, y }`), recalculated every frame, after movement.
- Agent's choices, not yet confirmed by the user:
  - Cells are counted **relative to the avatar**. The avatar is always in cell `{ 0, 0 }`, and that cell covers `-cellSize / 2` up to `+cellSize / 2` around it. So the window stays fixed on screen while the world moves under it.
  - `cell` is always a pair of integers, even outside the window. `isInWindow(grid, cell)` says whether it is inside.
  - `cellSize` must be at least 2 x (largest radius + largest speed). Then two actors that can touch in a frame are in the same cell or in adjacent cells, so checking the 3x3 block around an actor is enough. Speed is dynamic, so this must be rechecked when speeds change. The code does not enforce it yet.
- Consequences (agent's reading of the rule above, to be confirmed by the user). **Not implemented yet:** nothing enforces the invariant or moves actors back today.
  1. Every actor must always be inside the window, so `isInWindow` becomes an invariant to check (fail loudly), not a filter.
  2. An actor that would leave the window reappears on the **opposite side** of it, which matches the spawn idea. The window is centered on the player, so the rule is on the offset from the player. The half extents are `windowWidth * cellSize / 2` (1952 px) and `windowHeight * cellSize / 2` (1120 px). An offset of `+half` or more moves back by one window size, and an offset below `-half` moves forward by one. This matches `cellIndex`, which maps offsets in `[-half, +half)` to the cells.
  3. Nobody crosses the seam: actors on opposite edges are not neighbors, so collision across the seam is ignored. It is invisible, because the seam is off screen (at least 992 px beyond the screen edge across, and 580 px up and down).
  4. The ground (the reference grid) is infinite. Only the population is bounded.
  5. To see the limits of the universe, a debug zoom-out is needed: at scale 0.5 the 1920 x 1080 canvas shows 3840 x 2160, almost the whole window. Drawing every cell of the window at scale 1 only produces visual noise.
- Collision itself is not implemented yet. The window is not drawn any more (the user no longer wants to see the collision boxes; the amber overlay was removed from `src/render.js`). The faint grid that scrolls with the world is only a reference for seeing movement, and is unrelated to the collision grid. If the window has to be seen again, a debug zoom-out is the better way (see the consequences above).

### Damage formula (initial version, no buffs)

```
DAMAGE = max(0, ATTACK - DEFENSE)
HEALTH = HEALTH - DAMAGE
```

- If DEFENSE >= ATTACK, damage is 0. Defending never heals the target.
- The first case to simulate is a hit without a weapon, with no buffs of any kind.
- ATTACK and DEFENSE are not defined yet (what they are, where they come from).
- The formula will be developed little by little, one piece at a time.
- **Damage trace (the user's requirement):** any change to health must be explainable. The damage value is shown as a formula such as `(X + Y + Z) * W`, and every term says where it came from (which skill, part or buff). This is the way to know *why* health changed. It feeds the damage audit page. The structure of the trace is not defined yet (see the "damage pipeline with recorded stages" idea).

### Actor

An actor is any entity that can act in combat. It includes traps, which are static actors. A static actor is simply an actor without `move`.

Format of an actor **in the state** (provisional, it will change, for example once the mecha parts are defined). It only holds what changes. The fixed values come from the definitions by `type`:

```json
{
  "id": "player_1",
  "type": "player",
  "health": { "current": 100 },
  "position": { "x": 0, "y": 0 },
  "cell": { "x": 0, "y": 0 },
  "move": {
    "direction": { "x": 0, "y": 0 },
    "velocity": { "x": 0, "y": 0 }
  },
  "dash": { "charges": 1, "recharge": 0 }
}
```

Its definition, in `src/data.js` (the fixed values, and the initial state that `createActor` copies):

```js
player: {
  name: "Player", maxHealth: 100, attack: 10, defense: 3, radius: 16, baseSpeed: 3,
  acceleration: 0.25, deceleration: 0.125,
  dash: { speed: 12, maxCharges: 1, rechargeFrames: 240 },
  initial: { health: { current: 100 }, position: { x: 0, y: 0 }, cell: { x: 0, y: 0 },
             move: { direction: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
             dash: { charges: 1, recharge: 0 } },
}
// and next to "actors", for every actor: constants: { overspeedDecay: 0.5 }
```

Notes: `attack` and `defense` are loose numbers because they are not defined yet; there are no skills or buffs because they do not exist yet. `baseSpeed` is the top speed in pixels per frame, and the top speed used in a frame comes from `finalSpeed(actor)`. `acceleration` and `deceleration` are provisional (see "Movement and input"). `radius` exists because every actor is a circle. `cell` is recalculated every frame (see "Collision grid"). The initial `health.current` repeats `maxHealth` on purpose: the initial state is written out in full.

## Code layout

- `index.html`, `style.css`: the screens.
- `src/data.js`: the definitions (`DEFINITIONS`, `DEFINITIONS_VERSION`), frozen.
- `src/sim.js`: the rules. No DOM access. `createRun`, `createChamber1State(runId, seed)`, `createActor`, `hashInts`, `rockInSquare`, `rocksInArea`, `definitionOf`, `finalSpeed`, `finalDashSpeed`, `updateDash`, `approach`, `step(state, input)` and the grid helpers `cellIndex`, `isInWindow` and `assertValidGrid`. `step` changes the state in place (the agent's choice, to avoid copying the state every frame).
- `src/history.js`: the run history: `createHistory`, `recordFrame`, `stateFromSnap`, `discardAfter`, `crossCheck`. No DOM access.
- `src/input.js`: reads keyboard and gamepad, and returns `{ move, dash }` for the frame.
- `src/render.js`: draws the state (the reference grid, the rocks with their positions, the player and, in the bottom-left corner, the dash numbers as plain text: charges and the recharge count in frames, with READY when a charge is available). It never changes it. The user asked for the numbers only, no visual work for now.
- `src/chamber-2.js`: the test bench of Chamber 2. The text builders (`environmentText`, `simulationCheckText`, `dataText`) do not touch the page; only the end of the file does.
- `src/main.js`: screen navigation and the Chamber 1 loop (it also records the history every frame).
- `tests/agent/`: tests **written and defined by the agent**, not by the user. `sim.test.js` has 40 tests of the rules, and `README.md` explains each one in plain words. Any other kind of test the user writes later should go in its own folder.
- These are plain scripts, loaded in order by `index.html`, and they share globals. They will become modules when the simulation also needs to run in Node.

## Ideas (agent proposals, not decided)

They only become decisions when the user approves.

- **Damage pipeline with recorded stages:** each stage notes what it did. It serves the audit page and testing synergies.
- **Step as a list of named phases**, for example: inputs, spawn, movement, collision, damage, remove the dead. No phase calls another, and the order is written in one place only.
- **Machine learning:** the source is the collection of snaps (the user's decision). The JSON state is already structured. Agent proposal: a separate export module that only reads the state and produces numeric data (for example, a CSV with one row per actor per frame: frame, id, position, health and so on, or a fixed-size numeric vector), and that never changes the simulation. Values ML will want (damage dealt in the frame, kills) should be numeric counters in the state, instead of having to be extracted from text. The reward definition and the observation format are left for when ML enters the project.
- **Practical requirements for determinism:** a pseudo-random generator with its seed stored in the state (`Math.random` cannot be seeded); no `Date.now` or `performance.now` inside the simulation; actors always processed in a fixed order; avoid `Math.sin`, `Math.cos` and `Math.pow` if replays must match across different browsers; state without `NaN`, `Infinity` or `undefined` (JSON cannot represent them).
- **One run = seed + map + inputs per frame.** A test can play the same run twice and compare the final states.

## Open items

- Define ATTACK and DEFENSE. First code step suggested by the agent: run the formula in a simple test, without a screen.
- The full list of mecha parts (the user will provide it).
- Where the dynamic speed comes from (the base value and the buffs). Material from the user's old project: each mecha part has `Specs` as `[path, value]` pairs that add up (for example `Armor.Max`), `Mods` that look like multipliers, and `Weight`, which **affects the final speed**. Decided by the user: the effect must be **direct and easy to perceive**. In the old project the weight was simply subtracted from the speed. Here, a part with `-0.1` speed takes away `0.1` pixels per frame, and each term of the final speed should be shown as such in the audit. A unit label such as kg or lb is only flavor for the player. Not decided: what happens when the sum goes to zero or below (a minimum speed?). The old numbers (total weight 2.3, legs `Speed: 8`) were forces in a physics engine, so they do not convert directly and will be rescaled to pixels per frame. Not recorded in detail until the user confirms the list of parts and the formula.
- Decisions about parts and speed (the user's, **not implemented**; the code keeps `baseSpeed: 3` until parts exist in the library). Any part may have a `Speed` spec; at first the legs give most of it and the core (the user's word; it is the torso, confirmed) a small part. The generator handles the shield. The final speed becomes a sum: the `Speed` specs of the parts, minus the weight effect (weight in kg, times a fixed constant in px/frame per kg). The first motor carries at most 6 t, as a hard limit on the build (not a speed penalty), and the "knight" build starts with about 5 t equipped. The capacity belongs to the **torso** (the user's decision): it is a real limit of the part, since it is not technologically able to carry more (wiring, structure), and it is a hard limit so weight cannot be stacked without limit. Static builds (standing still on auto attack) are **welcome**, not something to prevent: the user finds them fun and still challenging to make work. The limit only bounds how much gear a build can carry. Open: whether other parts, such as the generator, add to the capacity (the user said the generator "can give a bit"), and the numbers (weights per part, the constant, the speed specs). The agent's example numbers were illustrations only and are not recorded.
- Tune `acceleration` and `deceleration` by feel (the user will describe what he sees in Chamber 1).
- The dash exists (see "Movement and input") with provisional values on the player. Still to do: take the dash strength, charges and recharge from the Booster part (and from any other part that adds to the strength); tune the values by feel; the Chamber 2 scripted run has no dash yet, so a dash is only tested in Node (adding one changes the final position, to be re-confirmed in the user's Chrome).
- Move `src/data.js` to the library structure (shelves, books, addresses, version per shelf). See "The library".
- Collision itself (not implemented yet): who tests against whom (does enemy vs enemy exist?), whether it pushes actors apart or only detects contact, and a Chamber 2 to test it.
- Testing: decided. Automated tests run in Node with `node --test` (no npm dependencies, the user questioned npm's security) and live in `tests/agent/` (see "How to run"). What only a real browser can show goes to Chamber 2. Not covered yet: the Chamber 2 scripted run never releases the keys, so the deceleration branch is only tested in Node (the agent proposed adding idle frames to the script; the final position will change when that is done).
- Next steps suggested by the agent: pause, advance one frame and go back (the history already exists, there are no buttons yet); running the cross-check automatically.
- Folder structure beyond what already exists.

## How to run

Open `index.html` in the browser. For now the scripts are plain (no modules), so no server is needed. When the simulation logic becomes modules, to also run in Node, a local static server will be needed, for example `python3 -m http.server`.

### Tests

From the root of the repository: `node --test` (no path; Node finds the `*.test.js` files). A good run ends with `# fail 0`. The user can paste the whole output to the agent. The tests load `src/data.js`, `src/sim.js` and `src/history.js` into a `vm` context, so the browser scripts do not need to become modules. Whenever the rules change on purpose (for example the acceleration or the dash values), update the numbers in the tests and in `tests/agent/README.md`.

## How to work on this project

- Solve one problem at a time. Short replies.
- Do not start work the user has not asked for. The user explains the concept and sets the decisions; the agent proposes and confirms.
- Do not assume the obvious: if a question already has an evident answer, decide and move on, and keep questions for real design decisions.
- Code prioritizes readability and transparency: clear names, no unnecessary cleverness.
- Language: chat with the user in Brazilian Portuguese (more comfortable for them; they are fluent in English). Everything else is en-US: code, identifiers, comments, docs and commit messages. Nothing should be in Portuguese.
- Record in this file every new decision that affects the direction of the project.
- Always comment briefly on whether you like something the user proposes or something the agent did. This is important to the user.
- The agent cannot see the screen. After changing something visual, ask the user to open it and describe what appears. For anything that can be printed as text, add a button to Chamber 2 and ask the user to paste its output.
