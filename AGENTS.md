# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state: screen navigation (main menu, test chambers list, Chamber 1) and the first movement test in Chamber 1: a player that is always at the center of the screen, moves and aims. The collision grid (cells and window) exists, but collision itself and combat are not implemented yet. See "Code layout".

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
- **TEST CHAMBERS** is another screen, where the user picks which test map to run. More tests will come. **Chamber 1: Movement** is only for testing movement. Nothing else goes in it. The user checked it in the browser (Chromium on Linux, 60 Hz and 100 Hz monitors) and everything looks and behaves as described: circle, aim arrow, ground grid, collision window overlay and movement.
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
- **Speed:** the actor has `baseSpeed`. The function `finalSpeed(actor)` (code, pure, no clock or randomness) returns the speed used in the current frame, and movement uses that value. Buffs, mecha parts, etc. will be applied inside it, in order. `finalSpeed` is not stored in the actor (it would be derived data that can go stale). Implemented: for now it only returns the base speed. When buffs arrive it will probably return the value and the steps of the calculation, which the audit page will want.

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

- The player is always at the center of the screen (the camera follows the player).
- Move with WASD or the left analog stick. Aim with the mouse or the right analog stick.
- The player is drawn as a white circle plus a minimal arrow showing where it looks.
- `move.direction` is a vector with length 0 to 1. On the keyboard, diagonals are normalized so they are not faster.
- `aim` is a unit vector, not an angle, so the simulation needs no trigonometry (which can differ between browsers and hurt determinism).
- Movement stops instantly when input stops (no inertia for now).
- **Speed is dynamic** (the user's requirement): it is read again every frame. The actor has `baseSpeed` (in the definitions) and a `finalSpeed(actor)` function gives the value used each frame (see "State, definitions and rules"). Where the value comes from (for example the mecha legs) is not defined yet.
- Agent's addition: a faint grid on the ground. With the camera locked on the player, an empty background would make movement invisible.
- Gamepad: the browser only exposes it after a button is pressed. Sticks have a radial dead zone of 0.15.
- The loop in `src/main.js` runs at most one step per browser callback. On monitors above 60 Hz the extra callbacks are ignored (no step, no drawing), so the game does not speed up. On slow machines it runs in slow motion.

### Spawn

- Every X time, Y spawn. For each map, exactly what appears and when is known in advance.
- At first, all actors want to attack the player.
- An actor that leaves the screen reappears on the opposite side. So there is a limited number of actors always present, almost all on screen.
- Where collision is tested is limited by the collision grid (see "Collision grid").

### Collision grid

- Collision is only tested inside a **window** of cells around the avatar. Nothing outside the window needs a collision test (the user's decision).
- The window is `windowSize` x `windowSize` cells: odd, at least 3x3, and it can grow (for example 11x11), with the avatar in the center cell.
- Cell size and window size are **dev settings**, kept in `state.grid` (`cellSize`, `windowSize`) so a run is reproducible. Do not hard-code them elsewhere. Current values: 64 and 3.
- Every actor **stores its cell** in `actor.cell` (`{ x, y }`), recalculated every frame, after movement.
- Agent's choices, not yet confirmed by the user:
  - Cells are counted **relative to the avatar**. The avatar is always in cell `{ 0, 0 }`, and that cell covers `-cellSize / 2` up to `+cellSize / 2` around it. So the window stays fixed on screen while the world moves under it.
  - `cell` is always a pair of integers, even outside the window. `isInWindow(grid, cell)` says whether it is inside.
  - `cellSize` must be at least 2 x (largest radius + largest speed). Then two actors that can touch in a frame are in the same cell or in adjacent cells, so checking the 3x3 block around an actor is enough. Speed is dynamic, so this must be rechecked when speeds change. The code does not enforce it yet.
- Side effect to know: actors outside the window do not collide at all. If the window is smaller than the screen, actors near the screen edges can overlap each other until they enter the window.
- Collision itself is not implemented yet. Chamber 1 draws the window as an amber overlay fixed on the player. The faint grid that scrolls with the world is only a reference for seeing movement, and is unrelated.

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
  "aim": { "x": 1, "y": 0 },
  "cell": { "x": 0, "y": 0 },
  "move": { "direction": { "x": 0, "y": 0 } }
}
```

Its definition, in `src/data.js` (the fixed values, and the initial state that `createActor` copies):

```js
player: {
  name: "Player", maxHealth: 100, attack: 10, defense: 3, radius: 16, baseSpeed: 3,
  initial: { health: { current: 100 }, position: { x: 0, y: 0 }, aim: { x: 1, y: 0 },
             cell: { x: 0, y: 0 }, move: { direction: { x: 0, y: 0 } } },
}
```

Notes: `attack` and `defense` are loose numbers because they are not defined yet; there are no skills or buffs because they do not exist yet. `baseSpeed` is in pixels per frame, and the speed used in a frame comes from `finalSpeed(actor)`. `radius` exists because every actor is a circle. `cell` is recalculated every frame (see "Collision grid"). The initial `health.current` repeats `maxHealth` on purpose: the initial state is written out in full.

## Code layout

- `index.html`, `style.css`: the screens.
- `src/data.js`: the definitions (`DEFINITIONS`, `DEFINITIONS_VERSION`), frozen.
- `src/sim.js`: the rules. No DOM access. `createRun`, `createChamber1State(runId)`, `createActor`, `definitionOf`, `finalSpeed`, `step(state, input)` and the grid helpers `cellIndex`, `isInWindow` and `assertValidGrid`. `step` changes the state in place (the agent's choice, to avoid copying the state every frame).
- `src/history.js`: the run history: `createHistory`, `recordFrame`, `stateFromSnap`, `discardAfter`, `crossCheck`. No DOM access.
- `src/input.js`: reads keyboard, mouse and gamepad, and returns `{ move, aim }` for the frame.
- `src/render.js`: draws the state (reference grid, collision window overlay, player and aim arrow). It never changes it.
- `src/chamber-2.js`: the test bench of Chamber 2. The text builders (`environmentText`, `simulationCheckText`, `dataText`) do not touch the page; only the end of the file does.
- `src/main.js`: screen navigation and the Chamber 1 loop (it also records the history every frame).
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
- Where the dynamic speed comes from (the base value and the buffs).
- Move `src/data.js` to the library structure (shelves, books, addresses, version per shelf). See "The library".
- Collision itself (not implemented yet): who tests against whom (does enemy vs enemy exist?), whether it pushes actors apart or only detects contact, and a Chamber 2 to test it.
- Square window, or separate width and height (the screen is 16:9).
- Testing: Node only for tests (`node --test`, no npm dependencies) or a test page in the browser. The agent cannot run browser pages by itself, and the user questioned npm's security.
- Next steps suggested by the agent: pause, advance one frame and go back (the history already exists, there are no buttons yet); running the cross-check automatically.
- Folder structure beyond what already exists.

## How to run

Open `index.html` in the browser. For now the scripts are plain (no modules), so no server is needed. When the simulation logic becomes modules, to also run in Node, a local static server will be needed, for example `python3 -m http.server`.

## How to work on this project

- Solve one problem at a time. Short replies.
- Do not start work the user has not asked for. The user explains the concept and sets the decisions; the agent proposes and confirms.
- Do not assume the obvious: if a question already has an evident answer, decide and move on, and keep questions for real design decisions.
- Code prioritizes readability and transparency: clear names, no unnecessary cleverness.
- Language: chat with the user in Brazilian Portuguese (more comfortable for them; they are fluent in English). Everything else is en-US: code, identifiers, comments, docs and commit messages. Nothing should be in Portuguese.
- Record in this file every new decision that affects the direction of the project.
- Always comment briefly on whether you like something the user proposes or something the agent did. This is important to the user.
- The agent cannot see the screen. After changing something visual, ask the user to open it and describe what appears. For anything that can be printed as text, add a button to Chamber 2 and ask the user to paste its output.
