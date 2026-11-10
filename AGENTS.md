# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state: screen navigation (main menu, test chambers list, Chamber 1) and the first movement test in Chamber 1: a player that is always at the center of the screen and moves. The collision grid (cells and window) exists and is not used by the collision yet; the avatar collides with rocks (by seed and formula); the only combat is the damage of those collisions (see "Damage formula"). See "Code layout".

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
- The nine parts of the old project are the starter kit (see "The kit of parts"); do not invent others before the user asks. They are: shoulder R and L, arm R and L, head, torso, legs, generator and booster.
- **What each part is for (the user's decisions):** the **Legs** are the primary source of speed; the **Booster** is the dash; the **Generator** is the shield; the four **arms and shoulders** carry the automatic weapons; the **Torso** (the name stays "torso"; "core" was only a nickname) is the physical case: **a tough case with a motherboard that holds the processor**, with the weight capacity (see "Open items") and a small contribution to speed. The **processor** is what holds the **skill tree**, and the player can own several, a box of processors: **each processor is a build** the player has (the user's idea; he first said the core was the skill tree, then refined it). So the torso is the hardware and the processor is the software. **Swapping the processor does not swap the parts** (the user's rule). Planned, **for the future and not developed** (the user's idea): a dialog on installing a processor that asks which parts the player wants to bring from that processor's **last installation**, and a check of which of those parts are available (for example not already used elsewhere). The **Head** is the primary source of the **Radar** (the user's decision): the circle around the avatar that says who can be targeted by the automatic weapons. The **Torso** is the primary source of the **Magnet**: the radius within which things that fall on the ground are pulled to the avatar, as in Vampire Survivors. (In the old project the Generator also gave a little Magnet, so any part can add to it.) Any part can add to speed and to the dash strength. **Health (the user's decision):** the `Armor.Max` of the old project was the part's contribution to the maximum health. The code keeps the name **health**, because it is universal (every actor has it), and "armor" is only how it is **presented to the player** (a label in one place in the library). So the maximum health of the avatar is the sum of the Health specs of its parts (in the old project: Head 20, Torso 80, Legs 40, on the old scale). The old project had **no Defense spec**: where the defense of each part comes from is still to be decided.

### Screens

Keep everything simple. Screens are HTML and CSS, and only one is shown at a time.

- **Entry screen** with 3 buttons: NEW GAME, CONTINUE and TEST CHAMBERS. NEW GAME and CONTINUE do nothing yet (they are disabled).
- **TEST CHAMBERS** is another screen, where the user picks which test map to run. More tests will come. **Chamber 1: Movement** is only for testing movement. Nothing else goes in it. The user checked it in the browser (Chromium on Linux, 60 Hz and 100 Hz monitors) and everything looked and behaved as described (circle, ground grid, collision window overlay and movement). That check was made before the manual aim was removed, which also removed the aim arrow.
- Every chamber has a name after its number, shown on the list and as its title: **Chamber 1: Movement**, **Chamber 2: Diagnostics** (the user's rule; give a name to each new chamber).
- Chambers are not necessarily places in the game. **Chamber 2: Diagnostics** is a test bench: buttons that run something in the real browser and print plain text into a box, with a COPY button, so the user can paste the output to the agent. Current buttons: ENVIRONMENT (browser, screen, gamepads, how many frame callbacks per second the browser gives), SIMULATION CHECK (a 600-frame scripted run played twice, the history and the cross-check, including a snap changed on purpose to see that the check notices it, and the final state) and DATA (the definitions, the build with the arithmetic of each final value, and the initial state). The scripted run uses no trigonometry, so every browser must print the same final position; compare outputs between machines or against a Node run.

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
- **Build:** what the player chose for this run (allocated skill tree, equipped mecha parts). It is an **input** of the run, like the seed and the map, not a state: it does not evolve. It is kept with the run, not in the snaps. Only the avatar has a build; other actors read their definition directly. Implemented: `createRun(id)` returns `{ id, build: { parts: [...] } }`, a copy of `DEFINITIONS.starterBuild` (the nine parts of the old project, 5000 kg), and refuses an invalid build (`assertValidBuild`). The build is the **third argument of `step`**, and of every `final...` function that needs it; `createHistory(state, build)` keeps it for the replay. (The agent first called this a "pre-run state" and proposed an avatar "already prepared" with the build applied. The user found it confusing and it was dropped: nothing is pre-resolved.)
- **Effects: recipe versus result.** Take a torso that gives +1 armor per enemy within radius X. What it does (the recipe) is in the definitions, in the part. Whether the player uses it is in the build. How much armor it gives *now* is **not stored**: a function like `finalSpeed` (for example `finalArmor(actor)`) computes it every frame from the recipe, the build and the state (the enemy positions). Only something with memory goes into the state, such as "this buff lasts 3 more seconds". The terms of `(X + Y + Z) * W` in the damage trace each come from one part of the build.
- Agent's warning: do not store derived values (such as `finalSpeed` or total damage) in actors for convenience, and keep an eye on lists of active effects (buffs, poison, slow), which are the fields that grow the most.
- **Rules (code):** `step`, `finalSpeed`, etc. The order of the phases is written in `step`, is the same in every run, and is not stored anywhere.
- The state carries the **version of the definitions** it was made with (`state.definitionsVersion`, from `DEFINITIONS_VERSION`, a number raised by hand on any change; nothing refuses a mismatched state yet), so a test can refuse a photo from another version (a photo alone is not self-contained: it only makes sense with the right definitions).
- **Speed:** the function `finalSpeed(actor, build)` (code, pure, no clock or randomness) returns the top speed in the current frame, and movement aims at that value (see "Movement and input" for the inertia). For the avatar it is the **sum of the `speed` specs of its parts minus `totalWeight x weightSpeedPenalty`**, never below 0; a definition may also give a `baseSpeed` (the avatar has none now). Buffs will be applied inside it, in order. `finalSpeed` is not stored in the actor (it would be derived data that can go stale). When buffs arrive it will probably return the value and the steps of the calculation, which the audit page will want. Chamber 2, button DATA, prints the build and each of these sums as plain arithmetic.

### The world: seed and rocks

The user's decisions (and the agent's first implementation, with provisional values). **Rocks are actors** (static, no `move`, circles), so in the future actors will not pass through actors (see "Collision grid"). They exist by **seed and formula**, so they are not stored in the state.

- The seed is `state.seed` (a whole number, 1 in Chamber 1 for now). It is in the state so a snap alone is enough to replay: the rules read it from there.
- The rocks are a pure function of the seed and the position: `rocksInArea(seed, left, top, right, bottom)` in `src/sim.js` returns `{ type, position: { x, y } }` for every rock whose center is in the area, in a fixed order. The world is cut into squares of 256 px (`DEFINITIONS.terrain.rocks`), each with at most one rock (35% chance), placed with a margin of 20 px from the edges of its square, so rocks of neighbor squares never overlap. No rock within 200 px of the starting point (0, 0). The type is picked from `kinds`. Looking at a bigger area never changes a rock. Positions are whole numbers.
- `hashInts(seed, x, y, salt)` makes the numbers: only `Math.imul`, xor and shifts, so it is exact in every browser (no trigonometry, no `Math.random`). **Known answer** (test 39, and the ROCKS lines of DATA in Chamber 2): seed 1 gives 12 rocks on the first screen, the first a boulder at 172,-435.
- Rock types are actor types in the definitions: `stone` (radius 16, bounce 0), `boulder` (radius 20, bounce 0.5) and `rubber` (radius 12, bounce 1). **Bounce** (the user's idea): how much of the speed of whoever hits the rock comes back, 0 = none, 1 = all. **Not used yet**: there is no collision yet. The margin (20) must be at least the largest rock radius, and `cellSize` of the collision grid at least 2 x (largest radius + largest speed) = 64 now.
- Chamber 1 draws the rocks as gray circles. (It also drew their world position `x,y` above each, so the user could check the formula; the user checked it against the DATA text of Chamber 2 in his Chrome, the results were identical, and the labels were removed.) Chamber 2, button DATA, prints the rocks of the first screen as text.
- **Collision of the avatar with rocks** is implemented (`collideWithRocks` in `src/sim.js`, called in `step` right after the movement of each actor that has `move`). For each rock that overlaps, circle against circle: the *normal* is the unit vector from the rock to the actor; the actor is pushed along the normal until it just touches the rock; its velocity is split into the part going **into** the rock (along the normal) and the part going **along** it; the part going in becomes `-bounce x (what was going in)`, and the part along is **not changed**. So bounce 0 cancels the reflection only and the avatar **slides** (the user's definition: "bounce 0 is not friction 1, it does not stop movement, it only cancels the reflection"), and the angle matters (a glancing blow loses little, a head-on hit loses all of it). Example, head-on at 3 px/frame: stone 0, boulder -1.5, rubber -3. A dash at 12 into the rubber rock comes back at -12, and the overspeed decay slows it down by itself. Friction (a loss of the part along the rock) does not exist; it could become another value per rock later. Only rocks that can touch are looked at (found by the formula, no collision grid yet; the grid arrives with moving actors). The rocks are tested in the fixed order of `rocksInArea`; a corner between two rocks is resolved over the next frames. The avatar cannot cross a rock between two frames while its speed is below `radius + the smallest rock radius` (28 px/frame); a stronger dash or the blink will need smaller steps. Tests 41 to 46.
- Planned (the user's ideas, **not implemented**, in this order): collision between moving actors with **mass** (the avatar's mass would be the total weight of its build, so a 5 t mecha pushes light enemies), the user wants the **dash force to push enemies a little and open space** when surrounded (the user wants the tension of being surrounded); later three kinds of dash: normal, **blink** (goes through rocks) and **charge** (breaks rocks; broken rocks would be a small list in the state). Agent's cautions: pushes in a chain need a fixed order and a limit of iterations; the formula must be reviewed if rocks are ever generated outside the collision window (see "Collision grid").

### Parts made by seed (the user's idea, **not implemented**)

Parts are not all identical: a part is **generated by a seed, with slightly randomized values**. In the library a part model gives a **range** for a value (for example attack `[6, 8]`, from 6 to 8), and each part the player gets rolls its own values inside the ranges. So the player can have several parts of the same model, and all of them are slightly different. This is the same idea as the rocks (seed and formula, with the integer hash `hashInts`, exact in every browser), and it must stay deterministic.

Agent's notes for whoever continues (the user asked that this be left written for the next session):
- A part the player owns is an **instance**: the address of its model (for example `master:parts:some-arm`) and its rolled values. The build points to instances, not to models.
- **Decided by the user: once a part is generated, it stays as generated.** The instance stores its **rolled values**, plus the seed and the version of the library it was created with (for debugging, and to know which parts a later change could affect on purpose). He prefers an item that stays unchanged over an update that silently changes a weapon the player owns. The difference with the rocks is on purpose: the **terrain** is derived again from the seed every time (a formula, nothing stored), while **what the player owns** is a stored record.
- Rolled values should be whole numbers or exact fractions (for example eighths), so they add exactly in floating point, like the acceleration and the decay.
- The audit page should show both the rolled value and its range (for example "attack 7, range 6 to 8"), so the player can tell a lucky part from an average one.
- Weight is also a value of the part. If it can be rolled, it changes the build budget (the torso capacity). Not decided.

### The kit of parts (implemented, provisional values)

The user asked for the kit with **only what is used now**: weight, speed, health, defense and the dash. Radar, Magnet, the shield and the weapons are not in the code yet. The parts live in `DEFINITIONS.parts` (`src/data.js`), each with a `weight` (kg) and `specs`; `DEFINITIONS.starterBuild` lists the nine ids the run starts with. The avatar's final values are the **sum of the specs of its parts** (`sumSpec`), and only the avatar has a build.

| Value | Rule | Starter build |
|---|---|---|
| top speed | sum of `speed` - total weight x 0.0002, never below 0 | 3.5 + 0.5 - 5000 x 0.0002 = **3** |
| maximum health | sum of `health` | 15 + 55 + 30 = **100** |
| defense | sum of `defense` | 2 + 1 = **3** |
| dash speed | sum of `dashSpeed` (without any, no dash) | **12** (Booster) |
| capacity | sum of `capacity`; the weight above it is refused | 6000 kg for 5000 kg |

The weights are the old project's proportions scaled to 5000 kg. The values were chosen to keep what the avatar already had (speed 3, health 100, defense 3, dash 12), so nothing felt changes; the reason of each is next to it in `src/data.js`. A 650 kg arm costs 0.13 px/frame, a 200 kg head 0.04. The attack of a **body slam** will have the **weight** as its base, plus modifiers that do not exist yet (the user's decision; not implemented, the rock still attacks with `impact x 2`).

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
- **Dash** (the Booster of the user's old project; keys: Space or the gamepad A button, the user's choice). Implemented in `updateDash` in `src/sim.js`. Pressing it spends one charge and sets `move.velocity` to `direction x dash speed` at once (the direction is always taken at full length, so a half-tilted stick dashes just as hard). While the actor is faster than its top speed, the speed falls by the **constant** `DEFINITIONS.constants.overspeedDecay` (0.5 pixels per frame, every frame) instead of the acceleration or deceleration, down to the top speed, and then normal movement takes over. The frame of the dash already moves at the full dash speed. With dash 12 and top speed 3 that is 18 frames (0.3 s), about 142 px. The dash strength comes from `finalDashSpeed(actor)`, a pure function like `finalSpeed`: **any mecha part may add to it** (the user's decision), but the decay is a constant, never changed by parts or buffs. So a stronger dash is also a longer dash: (strength - top speed) / decay frames. Dash without a direction does nothing and keeps the charge: this is only a stand-in. **The user's plan (not developed yet, "we will get there"): a dash without a direction becomes an EMP that destroys projectiles**, on the same button and the **same charge** (the user's decision; the lore: the overflow of the dash charge leaking out of the mecha's exhaust). The dash state is `actor.dash = { charges, recharge }` (`recharge` counts frames while below the maximum, and a charge returns at `rechargeFrames`); the maximum and the recharge time are in the definition (provisional values 1 charge, 240 frames = 4 s); the dash speed is the sum of the `dashSpeed` of the parts (the Booster gives 12), and **without any part giving it there is no dash** (the charge is kept). `OVERSPEED_TOLERANCE` (1e-9) keeps the rounding error of a diagonal from counting as "faster than the top speed". The input is `{ move, dash }`, where `dash` means "pressed in this frame" and is kept in the history with the move. **The primary source of the dash is the Booster part** (the user's decision, as in his old project; the thrusters, like Genos from One Punch Man). Every other part may add to the strength. The dash strength already comes from the parts; the charges and the recharge will come from them later.
- **Top speed is dynamic** (the user's requirement): it is read again every frame. `finalSpeed(actor, build)` gives the top speed used each frame (see "State, definitions and rules"): it comes from the parts, mostly the Legs.
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

### Numbers and why

The user wants every chosen number to have a reason, to understand how the numbers relate. The reason sits next to each value in `src/data.js` (and `src/sim.js` for the grid), with its kind: **target** (computed from a feel, in plain units), **anchor** (a real-world reference), **rule** (forced by another number) or **guess** (a placeholder, tuned by playing). No value was changed when the reasons were written.

| Value | Kind | Reason |
|---|---|---|
| top speed 3 px/frame = Legs 3.5 + Torso 0.5 - 5000 kg x 0.0002 | target | 180 px/s: the 1920 px screen is crossed in about 10.7 s |
| `weightSpeedPenalty` 0.0002 px/frame per kg | target and anchor | 5000 kg takes 1 px/frame; a 500 kg arm takes 0.1 (the user's example) |
| part weights (450 / 650 / 200 / 900 / 1300 / 200 / 200 kg) | anchor | the old project's proportions scaled to 5000 kg |
| part health 15 / 55 / 30 (Head, Torso, Legs) | target | the old proportions 1 : 4 : 2 scaled to a total of 100 |
| part defense 2 / 1 (Torso, Legs) | guess | the old project had none; a total of 3 keeps the rock damage |
| `acceleration` 0.25 | target | top speed in 0.2 s: 3 / 0.25 = 12 frames |
| `deceleration` 0.125 | target | stops in 0.4 s, twice the time of speeding up (it slides): 3 / 0.125 = 24 frames |
| Booster `dashSpeed` 12 | target and rule | 4 x the top speed; about 4.4 avatar widths of distance; must stay below 28 |
| `overspeedDecay` 0.5 | target | a dash of 12 lasts (12 - 3) / 0.5 = 18 frames = 0.3 s |
| `dash.maxCharges` 1, `rechargeFrames` 240 | anchor | the user's old project (1 charge, 4 s) |
| `radius` 16 (avatar) | guess | 32 px wide, 1/60 of the screen width; the rocks are measured against it |
| rock radii 16 / 20 / 12 | guess | the avatar's size, 1.25 x and 0.75 x |
| rock `bounce` 0 / 0.5 / 1 | guess | none, half and all, to compare the three feels |
| `rocks.cellSize` 256 | guess | 4 cells of the collision grid |
| `rocks.chancePercent` 35 | target | about 11 rocks on a screen (seed 1 gives 12): enough to dodge, too few to wall you in |
| `rocks.margin` 20 | rule | the largest rock radius |
| `rocks.safeRadius` 200 | guess | larger than the first dash (142 px) |
| `grid.cellSize` 64 | rule | 2 x (largest radius 20 + largest speed 12) = 64, exactly at the limit |
| `grid.windowWidth` x `windowHeight` 61 x 35 | rule | twice the screen: 3904 x 2240 px |
| robot 5 t, Torso `capacity` 6000 kg | anchor and rule | two large cars; 20% of room to grow, as a build budget (a build over it is refused) |
| `impactAttack` 2 | guess | walking head-on (impact 3) hurts 6 - 3 = 3, a dash (12) hurts 24 - 3 = 21, a graze hurts about 0 |
| `attack` 10 (avatar) | guess | not used yet; the attack of a body slam will come from the weight |

**Relations** (if one number changes, check the ones it is tied to):
- Time to top speed = top speed / `acceleration` frames. Time to stop = top speed / `deceleration`. The top speed depends on the build, so a heavier build also takes longer to get to it.
- Dash duration = `(dash speed - top speed) / overspeedDecay` frames. A stronger dash (from parts) lasts longer, because the decay is a constant.
- `dash.speed` (and any future blink or charge speed) must stay below `radius + smallest rock radius` = 28, or a rock can be crossed in one frame.
- `grid.cellSize >= 2 x (largest radius + largest speed)`: a dash above 12, or a rock above radius 20, needs a bigger cell (and then fewer cells for the same area).
- `rocks.margin >= largest rock radius`, or neighbor rocks can overlap (tests 38 and 40).
- `rocks.safeRadius` should stay above the dash distance, or the first dash can hit a rock.

### Damage formula (initial version, no buffs)

```
DAMAGE = max(0, ATTACK - DEFENSE)
HEALTH = HEALTH - DAMAGE
```

- If DEFENSE >= ATTACK, damage is 0. Defending never heals the target.
- The first case to simulate is a hit without a weapon, with no buffs of any kind.
- ATTACK and DEFENSE are not defined yet (what they are, where they come from).
- **Decided by the user (not implemented):** the damage is `finalAttack - finalDefense`, with the floor at 0. Both are pure functions, like `finalSpeed`: the recipe is in the library, what is equipped is in the build, and the value is computed every time. `finalDefense(actor, build)` is the **sum of the `defense` specs of the parts** (implemented, see "The kit of parts"). `finalAttack(attacker, hit)` also receives the hit (for a rock, the impact speed), and stays pure.
- **Shield (the user's decision, to be tested later):** it is essentially **a health that regenerates**, and it comes primarily from the **Generator**. Order (the agent's suggestion, the user agreed): the damage is calculated first (attack minus defense), **the shield absorbs it first, and what is left goes to health**. The shield has memory (current value and regeneration), so it is state, like the dash. The regeneration rule is not defined yet.
- **First combat test (the user's idea, implemented with provisional values):** colliding with rocks while moving, in Chamber 1 (so Chamber 1 is no longer only about movement). `finalAttack`, `finalDefense`, `damageOf` and `applyDamage` are in `src/sim.js`; `collideWithRocks` applies the damage right before it changes the velocity. The rock's ATTACK is `impact x 2` (`constants.impactAttack`, a guess), the defense of the avatar is the sum of its parts (3 with the starter build), health stops at 0 (no death) and there is no shield yet. The HUD shows `HEALTH 97.0/100` above the dash. Tests 47 to 52. The numbers, where the impact is the part of the velocity going into the rock. Walking head-on (3): 6 - 3 = 3 damage; dash head-on (12): 24 - 3 = 21; a glancing blow or pressing against a still rock: 0.
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
  name: "Player", attack: 10, radius: 16,
  acceleration: 0.25, deceleration: 0.125,
  dash: { maxCharges: 1, rechargeFrames: 240 },
  initial: { health: { current: 100 }, position: { x: 0, y: 0 }, cell: { x: 0, y: 0 },
             move: { direction: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
             dash: { charges: 1, recharge: 0 } },
}
// and next to "actors", for every actor: constants: { overspeedDecay: 0.5 }
```

Notes: `attack` is a loose number, not used yet; there are no skills or buffs because they do not exist yet. The maximum health, the defense, the top speed (pixels per frame) and the dash speed of the avatar are not in the definition: they are sums over the parts of its build (`finalMaxHealth`, `finalDefense`, `finalSpeed`, `finalDashSpeed`). `acceleration` and `deceleration` are provisional (see "Movement and input"). `radius` exists because every actor is a circle. `cell` is recalculated every frame (see "Collision grid"). The initial `health.current` repeats the maximum health of the starter build on purpose (the initial state is written out in full), and a test checks that they are equal.

## Code layout

- `index.html`, `style.css`: the screens.
- `src/data.js`: the definitions (`DEFINITIONS`, `DEFINITIONS_VERSION`), frozen.
- `src/sim.js`: the rules. No DOM access. `finalAttack`, `finalDefense`, `finalMaxHealth`, `damageOf`, `applyDamage`, the build helpers (`partsOf`, `totalWeight`, `sumSpec`, `assertValidBuild`), `createRun`, `createChamber1State(runId, seed)`, `createActor`, `hashInts`, `rockInSquare`, `rocksInArea`, `collideWithRocks`, `definitionOf`, `finalSpeed`, `finalDashSpeed`, `updateDash`, `approach`, `step(state, input, build)` and the grid helpers `cellIndex`, `isInWindow` and `assertValidGrid`. `step` changes the state in place (the agent's choice, to avoid copying the state every frame).
- `src/history.js`: the run history: `createHistory(state, build)`, `recordFrame`, `stateFromSnap`, `discardAfter`, `crossCheck`. No DOM access.
- `src/input.js`: reads keyboard and gamepad, and returns `{ move, dash }` for the frame.
- `src/render.js`: draws the state (the reference grid, the rocks, the player and, in the bottom-left corner, the dash numbers as plain text: charges and the recharge count in frames, with READY when a charge is available; and the health above it). It never changes it. The user asked for the numbers only, no visual work for now.
- `src/chamber-2.js`: the test bench of Chamber 2. The text builders (`environmentText`, `simulationCheckText`, `dataText`) do not touch the page; only the end of the file does.
- `src/main.js`: screen navigation and the Chamber 1 loop (it also records the history every frame).
- `tests/agent/`: tests **written and defined by the agent**, not by the user. `sim.test.js` has 60 tests of the rules, and `README.md` explains each one in plain words. Any other kind of test the user writes later should go in its own folder.
- These are plain scripts, loaded in order by `index.html`, and they share globals. They will become modules when the simulation also needs to run in Node.

## Ideas (agent proposals, not decided)

They only become decisions when the user approves.

- **Damage pipeline with recorded stages:** each stage notes what it did. It serves the audit page and testing synergies.
- **Step as a list of named phases**, for example: inputs, spawn, movement, collision, damage, remove the dead. No phase calls another, and the order is written in one place only.
- **Machine learning:** the source is the collection of snaps (the user's decision). The JSON state is already structured. Agent proposal: a separate export module that only reads the state and produces numeric data (for example, a CSV with one row per actor per frame: frame, id, position, health and so on, or a fixed-size numeric vector), and that never changes the simulation. Values ML will want (damage dealt in the frame, kills) should be numeric counters in the state, instead of having to be extracted from text. The reward definition and the observation format are left for when ML enters the project.
- **Practical requirements for determinism:** a pseudo-random generator with its seed stored in the state (`Math.random` cannot be seeded); no `Date.now` or `performance.now` inside the simulation; actors always processed in a fixed order; avoid `Math.sin`, `Math.cos` and `Math.pow` if replays must match across different browsers; state without `NaN`, `Infinity` or `undefined` (JSON cannot represent them).
- **One run = seed + map + inputs per frame.** A test can play the same run twice and compare the final states.

## Open items

- Define ATTACK and DEFENSE for real (what they are, where they come from). The formula runs for rock collisions only, with provisional values (see "Damage formula"). Not done: the damage trace for the audit page, the shield, death, and the attack of weapons.
- Parts still to come in the code: Radar (Head), Magnet (Torso), the shield (Generator), the weapons (arms and shoulders), and the charges and recharge of the dash (Booster). The speed has a floor of 0 (the agent's choice, so the controls never reverse); whether there is a real minimum speed is open.
- (Done, see "The kit of parts".) Where the dynamic speed comes from. Material from the user's old project, kept for reference: each mecha part has `Specs` as `[path, value]` pairs that add up (for example `Armor.Max`), `Mods` that look like multipliers, and `Weight`, which **affects the final speed**. Decided by the user: the effect must be **direct and easy to perceive**. In the old project the weight was simply subtracted from the speed. Here, a part with `-0.1` speed takes away `0.1` pixels per frame, and each term of the final speed should be shown as such in the audit. A unit label such as kg or lb is only flavor for the player. Not decided: what happens when the sum goes to zero or below (a minimum speed?). The old numbers (total weight 2.3, legs `Speed: 8`) were forces in a physics engine, so they do not convert directly and will be rescaled to pixels per frame. Not recorded in detail until the user confirms the list of parts and the formula.
- Decisions about parts and speed (the user's; the sum of speed, the weight effect, the capacity limit and the kit are **implemented**, see "The kit of parts"). Any part may have a `Speed` spec; at first the legs give most of it and the core (the user's word; it is the torso, confirmed) a small part. The generator handles the shield. The final speed becomes a sum: the `Speed` specs of the parts, minus the weight effect (weight in kg, times a fixed constant in px/frame per kg). The first motor carries at most 6 t, as a hard limit on the build (not a speed penalty), and the "knight" build starts with about 5 t equipped. The capacity belongs to the **torso** (the user's decision): it is a real limit of the part, since it is not technologically able to carry more (wiring, structure), and it is a hard limit so weight cannot be stacked without limit. Static builds (standing still on auto attack) are **welcome**, not something to prevent: the user finds them fun and still challenging to make work. The limit only bounds how much gear a build can carry. **Justification of the numbers (the user's):** a mecha is about the size of two large cars, which is about 5 t, and the 6 t of the first motor leaves a little room to grow. **The agent's reading:** the capacity works as a **build budget**: the knight starts with about 1 t of room, so every upgrade has to fit, which creates real choices (a heavier, stronger part against a lighter one). That is a gameplay need, and it is more than taste; the in-fiction reason (wiring and structure of the torso) is taste, and a good one. A speed penalty alone would not make a budget, only a trade. Open: whether other parts, such as the generator, add to the capacity (the user said the generator "can give a bit"), and the numbers (weights per part, the constant, the speed specs). The agent's example numbers were illustrations only and are not recorded.
- Tune `acceleration` and `deceleration` by feel (the user will describe what he sees in Chamber 1).
- The dash exists (see "Movement and input") with provisional values. The strength comes from the parts now; still to do: take the charges and recharge from the Booster too; tune the values by feel; the Chamber 2 scripted run has no dash yet, so a dash is only tested in Node (adding one changes the final position, to be re-confirmed in the user's Chrome).
- Move `src/data.js` to the library structure (shelves, books, addresses, version per shelf). See "The library".
- Collision between moving actors (not implemented yet): who tests against whom (the user wants actors not to pass through actors, with masses and the dash opening space, see "The world"), whether it pushes actors apart or only detects contact, using the collision grid. Collision with rocks exists (see "The world: seed and rocks").
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
- Always comment briefly on whether you like something the user proposes or something the agent did. This is important to the user. He wants an honest signal of whether it looks sound (sound / sound with a cost / fragile or premature / not sure), with the reason and what would change the agent's mind, not agreement for its own sake. The agent can judge the soundness of a design, but not the feel of the game: the user describes what he sees.
- **Every number that is chosen needs a reason, and the agent suggests one.** The user knows some values are guesses, but a number has to be picked at some point, and he wants the reasoning behind a pick, with suggestions from the agent, for any value of this kind. Method: (1) a value for the feel of the game is derived from a **target experience** written in plain units (for example "from rest to top speed in 0.2 s", "a dash covers about 4 avatar widths"), and the number is computed from it; (2) a value for the flavor of the world is tied to a real-world **anchor** (for example two large cars, about 5 t); (3) the rest is a **guess**, said to be a guess, and tuned by playing; (4) keep the reason next to the number (a comment in `src/data.js`) and say whether it is a guess, derived from a target, or anchored. This is also what the transparency axis asks of the game itself.
- **Say when a decision rests mostly on the user's preference.** The user asked (explicitly, as a standing request) to be told when the agent senses that his preference is the main force behind a decision and there is no plausible justification built on a real need. Say it briefly and plainly (for example "this is your taste, not a need"), and keep going: the game is his, so a preference is a valid reason to decide, but he wants to know which decisions are preference and which are need. The same goes for the agent's own preferences. **Filter (the user's rule):** do not raise a suggestion unless it has the potential for a positive change to the game. Do not challenge a choice of taste only to offer alternatives (the user's example: "you chose cats, but what about dogs, or squirrels?"). Taste is the user's. Technical choices are discussed by nature. A taste choice is worth a remark only when it carries a concrete cost or risk into the structure (for example a rule that makes another screen harder to build), and then the agent says the cost and, if it has one, a specific alternative that would likely improve the game. Otherwise the agent accepts it and goes on. The same applies to numbers: suggest a different value only if it would measurably change the experience, never as a list of options for its own sake.
- The agent cannot see the screen. After changing something visual, ask the user to open it and describe what appears. For anything that can be printed as text, add a button to Chamber 2 and ask the user to paste its output.
