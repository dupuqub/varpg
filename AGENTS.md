# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

**This file has no game values (the user's rule).** It says what was decided, why, and **where each number lives**. The values, each with its reason and who chose it, are in `src/data.js` (and in the few named constants listed in "Where the numbers are"). Do not copy a value into this file: write the rule with the **name** of the number (for example `attack = weight x attackPerKg`). The only numbers allowed here are the fixed decisions of the concept (steps per second, the canvas size, the length of a map). Worked examples with numbers belong in `tests/agent/README.md`, where a test fails if they drift.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state: screen navigation (main menu, test chambers list, Chamber 0 diagnostics and the played Chambers 1 and 2). In Chamber 1 the avatar is always at the center of the screen, moves with inertia, dashes, collides with the objects of the seed (rocks and Shrooms, all placed by seed and formula, in layers, none by hand) and with the Dummies (test actors made by the seed, born off the screen, wandering and wrapping around the window of the grid), and collisions with the avatar hurt (the body slam); actors push each other by weight. The avatar's values are sums over the mecha parts of its blueprint. The collision grid (several cells per actor) is used between actors. In Chamber 2 the Dummies are replaced by Biters, enemies that chase the avatar and bite with a hitbox; damage is a packet by type that the target resists by points. See "Code layout".

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

## Where the numbers are

| What | Where |
|---|---|
| The avatar (radius, acceleration, deceleration, dash recharge) | `DEFINITIONS.actors` in `src/data.js` |
| Dash charges and recharge time (sums of `dashCharges` and `rechargeFrames` of the parts; the Booster is the primary source) | `DEFINITIONS.parts` in `src/data.js`, computed by `finalDashMaxCharges` |
| Mecha parts (weight and specs) and the starter blueprint | `DEFINITIONS.parts`, `DEFINITIONS.starterBlueprint` |
| Values equal for everyone (`overspeedDecay`, `collision.minImpact`, `bodySlam.attackPerKg`, `bodySlam.referenceImpact`, `weightSpeedPenalty`) | `DEFINITIONS.constants` |
| Damage rules (`damage.resistanceScale`, `damage.minDamage`) and the types of damage (the order is the order of calculation) | `DEFINITIONS.constants.damage` and `DEFINITIONS.damageTypes` |
| The resistance of the avatar, by type | the `resistance` spec of each part in `DEFINITIONS.parts` |
| The Biter (`size`, `healthRange`, `weightPerRadius`, `speed`, `acceleration`, `deceleration`, its `attacks.bite`: damage, reach, freeze frames, hitbox) and how many (`count`) | `DEFINITIONS.actors.biter` and `DEFINITIONS.terrain.biters` in `src/data.js` |
| How the ground is filled with objects, one entry per layer (`cellSize`, `chancePercent`, `safeRadius`, `kinds`) | `DEFINITIONS.terrain.objects.layers` |
| Objects (rock, Shroom: each entry is a set of ranges, `size` `{ min, max }`, `healthRange`, and `weightPerRadius`; the Shroom also has `bounce`) | `DEFINITIONS.objects` |
| The Dummy (`size`, `healthRange`, `weightPerRadius`, `speed`, `acceleration`, `deceleration`) | `DEFINITIONS.actors.dummy` in `src/data.js` |
| How many Dummies (`count`) | `DEFINITIONS.terrain.dummies` in `src/data.js` |
| Collision grid and the size of the screen as the rules know it (`screenWidth`, `screenHeight`, `cellSize`, `windowWidth`, `windowHeight`) | `state.grid`, set in `createChamber1State` in `src/sim.js`; `src/main.js` fails loudly if the canvas has another size |
| `OVERSPEED_TOLERANCE` | `src/sim.js` |
| `HISTORY_SIZE` | `src/history.js` |
| `STICK_DEADZONE` | `src/input.js` |
| Steps per second (`STEP_MS`) | `src/main.js` |
| Canvas size | `index.html` |
| Worked examples and known answers (for example the rocks of seed 1) | `tests/agent/README.md` and `tests/agent/sim.test.js` |

**Every number needs a reason** (the user's rule), written as a comment next to the value in `src/data.js`, with its kind: **target** (computed from a feel we want, in plain units, with the formula), **anchor** (tied to something in the real world), **rule** (forced by another number or by a rule of the game) or **guess** (a placeholder, to be tuned by playing). The comment also says when a number is the user's own. The user does **not** want constants fitted only to keep an old result ("no normalization").

**Relations** (if one number changes, check the ones it is tied to):

- Time to reach the top speed = top speed / `acceleration`. Time to stop = top speed / `deceleration`. The top speed depends on the blueprint, so a heavier blueprint takes as long to reach a lower speed.
- Top speed of the avatar = sum of the `speed` of its parts - total weight x `weightSpeedPenalty`.
- Dash duration = (dash speed - top speed) / `overspeedDecay`. A stronger dash lasts longer, because the decay is a constant.
- Nothing about damage is specific to the dash: any contact is a hit, whatever gave the speed. The dash only sets a velocity, so the damage of a dash follows from its speed at the moment of contact.
- The dash speed (and any future blink or charge speed) must stay below the avatar radius + the smallest object radius, or an object can be crossed in one frame.
- `grid.cellSize` does **not** limit the size of an actor and there is no rule tying it to a radius or a speed: every actor covers all the cells its circle reaches (`actor.cells`), so two actors that touch always share a cell. The cell size is only a performance setting: much smaller than the actors and each one covers many cells; much larger and many actors share a cell. Measure with `tests/agent/benchmark-grid.js` when the sizes or the number of actors change. The current value is the user's "imaginary but reasonable" number. (History: an earlier grid looked at one cell per actor plus its neighbors, which needed a minimum cell size; the user asked for several cells per actor so huge actors can exist, and that rule is gone.)
- The margin of the squares of a layer is the largest `size.max` among its `kinds` (`objectMargin(layer)` in `src/sim.js`, computed, never stored), or objects of neighbor squares of the layer can overlap. The square of a layer must be larger than twice that margin: `assertValidDefinitions` refuses a layer where it is not, so such a layer cannot be made in the first place (test 102).
- The `safeRadius` of every layer should stay above the distance of a dash plus the avatar radius plus the largest object radius of that layer, or the first dash can hit an object.
- Total weight of a blueprint <= sum of the `capacity` of its parts.
- The weight of an object = `weightPerRadius` x radius (the user's decision: the radius, not the area, so twice as wide is twice as heavy and hits twice as hard).

## Decisions

### Theme: mechas

- The game is about mechas. Instead of armor, as in Path of Exile and Diablo, the character has parts.
- The parts of the user's old project are the starter kit: shoulder R and L, arm R and L, head, torso, legs, generator and booster. Do not invent others before the user asks.
- **What each part is for (the user's decisions):**
  - **Legs:** the primary source of speed.
  - **Booster:** the dash (the thrusters, like Genos from One Punch Man).
  - **Generator:** the shield.
  - **Arms and shoulders:** the four automatic weapons.
  - **Head:** the primary source of the **Radar**, the circle around the avatar that says who can be targeted by the automatic weapons.
  - **Torso** (the name stays "torso"; "core" was only a nickname): the physical case, **a tough case with a motherboard that holds the processor**. It has the weight capacity, a small contribution to speed, and is the primary source of the **Magnet**: the radius within which things that fall on the ground are pulled to the avatar, as in Vampire Survivors.
  - Any part can add to speed, to the dash strength and to the Magnet.
- **Processor:** it holds the **skill tree**, and the player can own several, a box of processors: **each processor is a build**. The torso is the hardware and the processor is the software. **Swapping the processor does not swap the parts** (the user's rule). Planned, **for the future and not developed**: a dialog on installing a processor that asks which parts the player wants to bring from that processor's last installation, and a check of which of those parts are available.
- **Health (the user's decision):** the `Armor.Max` of the old project was a part's contribution to the maximum health. The code keeps the name **health**, because it is universal (every actor has it), and "armor" is only how it is **presented to the player** (a label in one place in the library). The old project had no defense spec.

### Screens

Keep everything simple. Screens are HTML and CSS, and only one is shown at a time.

- **Entry screen** with three buttons: NEW GAME, CONTINUE and TEST CHAMBERS. NEW GAME and CONTINUE do nothing yet (they are disabled).
- **TEST CHAMBERS** is another screen, where the user picks which test map to run. Every chamber has a name after its number, shown on the list and as its title (the user's rule; give a name to each new chamber).
- **Chamber 1: Movement** started as a movement test only; the user later decided to use it for the first combat test too (colliding with the objects of the seed). It is a full-window game view (see "Movement and input").
- **Chamber 2: Combat** (the user, 2026-11-11): the same world as Chamber 1 (rocks and Shrooms from the seed) with no Dummies and with Biters instead, to test combat. No UI yet. It has its own canvas (`canvas-2`), the same size as the first, and `src/main.js` runs the chambers that are played from one table (screen id, canvas id, function that makes the state).
- Chambers are not necessarily places in the game. **Chamber 0: Diagnostics** is a test bench (numbered 0 because it is the base under the game chambers; the user renamed it from 2 on 2026-11-11, and it comes first in the list): buttons that run something in the real browser and print plain text into a box, with a COPY button, so the user can paste the output to the agent. Buttons: ENVIRONMENT (browser, screen, gamepads, frame callbacks per second), SIMULATION CHECK (a scripted run played twice, the history and the cross-check, including a snap changed on purpose to see that the check notices it, and the final state) and DATA (the definitions, the blueprint with the arithmetic of each final value of the avatar, the rocks of the first screen and the initial state). The scripted run uses no trigonometry, so every browser must print the same final position; compare outputs between machines or against a Node run.

### Stack

- JavaScript, HTML and CSS for the UI; canvas 2D for sprites and tiles. The canvas only draws.
- Maximum simplicity: no game engine or library. Plain JavaScript (the user feared TypeScript would complicate the project).
- Own simple collision: absolutely everything is a circle for collision. There are no walls. If scenery is ever needed, it is made of static circle actors.

### Simulation

- **Deterministic:** the same initial state, blueprint and inputs produce an identical run. One of the goals is to reproduce runs for machine learning.
- **60 steps per second.** All game values are based on 60 fps.
- Physics is calculated once per frame: **one step per displayed frame**. Steps are never skipped and frames that are not shown are not calculated ("calculate and show, always"). If the machine cannot keep 60 fps, the game runs in slow motion.
- **The game state is a single JSON object.**
- **Frame debug:** be able to pause and have a button that advances one frame at a time, to understand what happens at each moment. Not implemented yet.
- There are no internal intra-pause or intra-play tools: debugging uses only normal play and frame by frame.

### State, definitions, blueprint and rules

**The state is rich and small at the same time (the user's rule, 2026-11-11).** Everything the rules calculate is stored in the actor it belongs to (what is dynamic is calculated again every frame, what is static once, at the start of the run; see "Actor"), the rest of the code reads it from the actor, and the snap keeps what was true in that frame ("I do not know how to work another way; leaving things out of the state is not optimal"). And the state stays small: nothing goes in that does not say something about the game now. His image: a boat, and the work is not to fall off either side, neither bloating the state with information nor taking essential pieces out of it. The state is a **photo** of how the game is now, not of what is done in it. Rule of thumb: if it can change during a run, it is state; if it never changes, it is a definition; if the player chose it before the run, it is the blueprint.

- **Definitions (the "db", to be called the library, see "The library"):** what the game *is*. They never change during a run. They live in `src/data.js`, a plain object `DEFINITIONS` that is deep-frozen, loaded by `<script>` so `index.html` still opens directly. There are exactly four things in it today: two actors (`DEFINITIONS.actors`: the avatar, created by hand with its **initial state**, which `finalizeObject` only copies, so no number about how an actor is born is hidden in code; and the Dummy, made by the seed from ranges) and two objects (`DEFINITIONS.objects`: the rock and the Shroom, created only by the seed, from ranges). A thing points to its definition by id (`type`), and `definitionOf(thing)` returns it. **Cleanliness rule (the user's, strong):** every value in the definitions is defined and used by something; what is not used is deleted and comes back when something needs it. No placeholder: a value of a non-avatar thing comes from the seed (a range), and a value of the avatar comes from its definition or its parts. Exceptions the user has not decided yet are listed in the next steps (the `name` fields are used by nothing today).
- **State:** only what changes: positions, velocities, health of the avatar (`{ now, max }`), dash charges, the frame, the seed, the objects that were hurt, the grid settings, the version of the definitions.
- **Blueprint (the user's name, chosen on 2026-11-10):** the structure of the mecha the player chose for the run: for now the list of mecha parts. The word **build** is kept for the ordinary meaning (the process of building something, and the genre word for a combination of skills and parts), so the code never uses it as a name for this list. The skill tree (the processor) is a separate thing and has no name in the code yet. It is an **input** of the run, like the seed and the inputs, not a state: it does not evolve, and it is not inside the snaps. Only the avatar has a blueprint; other actors read their definition directly. `createRun(id)` returns `{ id, blueprint }` with a copy of the starter blueprint and refuses an invalid one (`assertValidBlueprint`). The blueprint is the **third argument of `step`** and of every `final...` function that needs it, and `createHistory(state, blueprint)` keeps it for the replay. (The agent once proposed an avatar "already prepared" with the blueprint applied. The user found it confusing and it was dropped: nothing is pre-resolved.)
- **Effects: recipe versus result.** Take a torso that gives armor per enemy within a radius. What it does (the recipe) is in the definitions, in the part. Whether the player uses it is in the blueprint. How much it gives *now*, being dynamic, is calculated every frame by a pure function (like `finalSpeed`) from the recipe, the blueprint and the state, **and written into the actor** (see the rule above), so anything that changes during a run reaches every rule that reads the value. (History: this file used to say the result is "not stored" and warned against storing derived values. That was an agent's reading, not the user's rule, and he corrected it on 2026-11-11.)
- Keep an eye on lists of active effects, which are the fields that grow the most.
- **Rules (code):** `step` and the `final...` functions. The order of the phases is written in `step`, is the same in every run, and is not stored anywhere.
- The state carries the **version of the definitions** it was made with (`state.definitionsVersion`, from `DEFINITIONS_VERSION`, raised by hand on any change). `stateFromSnap` refuses a snap of another version, and a test keeps a fingerprint of the data next to the version.

### The kit of parts

The user asked for the kit with **only what is used now**: weight, speed, health, resistance (by type of damage), the dash strength and the capacity. Radar, Magnet, the shield and the weapons are not in the code yet.

- Each part in `DEFINITIONS.parts` has a `weight` and `specs`. The avatar's final values are the **sum of the specs of the parts of its blueprint** (`sumSpec`):
  - top speed (`finalSpeed`) = sum of `speed` - total weight x `weightSpeedPenalty`, never below zero (the agent's floor, so the controls never reverse; whether there is a real minimum speed is open);
  - maximum health (`finalMaxHealth`) = sum of `health`;
  - resistance to each type of damage (`finalResistance(actor, blueprint, type)`) = sum of the `resistance` spec of that type, in **points** (see "Damage"); the part specs are checked against a list of names when the file loads, so a typo stops the game;
  - dash speed (`finalDashSpeed`) = sum of `dashSpeed`; without any part giving it there is no dash and the charge is kept;
  - maximum dash charges (`finalDashMaxCharges`) = sum of `dashCharges`; the state holds `dash.charges: { now, max }` (the user's structure), filled when the state is created, like the health; without any part giving it there is no charge and no dash;
  - frames to recharge a charge (`finalDashRechargeFrames`) = sum of `rechargeFrames` (the user's decision, 2026-11-10: at first every number of the dash comes from the Booster);
  - capacity = sum of `capacity`.
- **Weight (the user's decisions):** its effect on speed must be **direct and easy to perceive**: a fixed amount of speed per unit of weight, shown as such in the audit. The unit label is only flavor for the player.
- **Capacity (the user's decision):** it belongs to the **torso** and is a **hard limit** on the blueprint, not a speed penalty: the part is not technologically able to carry more (wiring, structure), and weight cannot be stacked without limit. The agent's reading: it works as a **blueprint budget**, so every upgrade has to fit, which creates real choices. Static builds (standing still on auto attack) are **welcome**: the user finds them fun and still challenging to make work.
- The avatar's starting health is not written by hand: `createChamber1State(runId, seed, blueprint)` sets it to `finalMaxHealth`.
- **Known weakness:** the values of the parts were chosen by the agent to reproduce what the avatar had before parts existed. They are not wrong, but they did not come from a goal of play, which is the opposite of the user's "no normalization". They are the first candidates to be redone.
- From the user's old project, for reference: each part had `Specs` that add up, `Mods` that look like multipliers (not used here yet), and `Weight`, which was simply subtracted from the speed.
- Open: whether other parts (the generator) add to the capacity; whether the recharge of the dash also comes from the Booster (the maximum of charges already does).

### Parts made by seed (the user's idea, not implemented)

Parts are not all identical: a part is **generated by a seed, with slightly randomized values**. In the library a part model gives a **range** for a value, and each part the player gets rolls its own values inside the ranges. So the player can have several parts of the same model, all slightly different. This is the same idea as the rocks (seed and formula, with the integer hash `hashInts`), and it must stay deterministic.

- A part the player owns is an **instance**: the address of its model and its rolled values. The blueprint points to instances, not to models.
- **Decided by the user: once a part is generated, it stays as generated.** The instance stores its rolled values, plus the seed and the version of the library it was created with. He prefers an item that stays unchanged over an update that silently changes a weapon the player owns. The difference with the rocks is on purpose: the **terrain** is derived again from the seed every time, while **what the player owns** is a stored record.
- Agent's notes: rolled values should be whole numbers or exact fractions, so they add exactly in floating point; the audit page should show both the rolled value and its range; whether weight can be rolled (it changes the blueprint budget) is not decided.

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
- "All the monsters of the game" are the `monsters` book of every shelf. The library joins them when it loads, so the rest of the code does not need to know.
- The version is **per shelf**. A snap made with a pack that is not installed must be refused with a clear message.
- The library is deep-frozen **once**, after all shelves are joined.
- Effects from pack content must be **data the game understands**, not loose code from the pack. With code, determinism and the synergy tests would be much harder to guarantee.
- The user asked for `master` for the base shelf. The agent only noted that some people avoid that word in software.
- **Not implemented yet.** The code still has a single flat object, `DEFINITIONS`, with `actor.type` as a plain id and one version number.

### The world: seed and objects

**Objects (rocks, Shrooms) are made by the seed and the formula, and are not stored in the state** (the user's decisions). They are not actors in the code (the actors are the avatar, `createAvatar`, and the Dummies, `createDummies`). **One function makes everything that exists in a run (the user's idea, 2026-11-10):** `finalizeObject(type, rolls, blueprint, id)` takes the recipe (the entry of `src/data.js`), what the seed rolled and the blueprint, and returns the complete object; the avatar and every object from the seed come out of it.

- The seed is `state.seed` (a whole number). It is in the state so a snap alone is enough to replay.
- `objectsInArea(seed, left, top, right, bottom)` in `src/sim.js` is a pure function: it returns `{ type, layer, position, square, radius, health: { now, max }, weight, bounce }` for every object whose center is in the area, in a fixed order (layer by layer, in the order of the definitions, row by row inside each). `objectsReaching` returns every object that may **touch** the area (its center can be outside, as far as the largest radius of its layer); the collision, the drawing and the placement of Dummies use it. **The ground is made of layers (the user's idea, 2026-11-10):** a thing that lives in the seed may one day be huge and rare, and it cannot share the squares of the small ones. Each layer in `terrain.objects.layers` is complete and has its own numbers: the world is cut into squares of the size of the layer, each with at most one object (`chancePercent`), kept away from the edges of its square by `objectMargin(layer)`, so objects of one layer never overlap; no object within the layer's `safeRadius` of the starting point. The place of the layer in the list goes into the salts (`100 x place + salt`), so layers do not roll the same numbers, and the first layer keeps the salts it always had. When objects of two layers overlap, **the layer with the larger square wins** and the other object is not placed (`isUnderBiggerLayer`; deterministic, and only the bigger layers are asked). Only one layer exists in the definitions; tests 103 to 105 build a layer of huge objects in a patched copy to prove the mechanism. The type is picked from `kinds` of the layer, and the radius and the health are rolled inside the `size` and the `healthRange` of that type (`rollInRange`; every roll has its own salt, listed in `objectInSquare`). Looking at a bigger area never changes an object. `layer` and `square` say which object it is.
- `hashInts(seed, x, y, salt)` makes the numbers: only `Math.imul`, xor and shifts, so it is exact in every browser (no trigonometry, no `Math.random`). A **known answer** for one seed is fixed by a test, and DATA in Chamber 0 prints the same objects; the user compared them in his Chrome and they were identical.
- The kinds are entries of `DEFINITIONS.objects` (the **rock** and the **Shroom**), each an independent set of ranges. Stone, boulder, rubber rock and a first "training dummy" were the agent's inventions and were **removed**, and so was every hand-placed object and every fixed value of an object (the user's rule: no leftovers, no placeholders).
- **Objects have health (the user's decision):** each object rolls a whole number inside the `healthRange` of its type from the seed. An object comes from the formula at full health and carries it as `health: { now, max }` (the user's mold: everything with a variable amount has a now and a max: health, shield, ammunition...), both equal at creation; only a **hurt** object is in the state, in `state.damagedObjects`, a plain object from `"layer:squareX,squareY"` to its current health (the `now` of a hurt object; the object itself is made again from the seed and so keeps its full values). An object at zero is **broken** (the agent's choice; the user did not say what happens at zero): it is not drawn and nothing collides with it. The hit that breaks it has no collision response (the actor is not pushed or bounced and keeps its speed), but still hurts the actor. Health numbers are drawn above any hurt object.
- **Push between actors by weight (the user's decision, 2026-11-11, `pushShare` in `src/sim.js`):** when two actors overlap (the avatar included), each is pushed back by the other's weight over the sum of the two, so the heavier moves less: the heavy mecha pushes light enemies and heavy enemies push it (the avatar's weight is the total weight of its blueprint). Two actors of weight 0 move half each. An object never moves: the actor takes the whole push. The avatar's cells are written again when it is pushed, like a Dummy's. A consequence: a Dummy can push the avatar into an object at the end of a step; the next step's collision with objects pushes it out (a standing avatar is pushed with no hit). Planned (the user's ideas, **not implemented**): the user wants the **dash force to push enemies a little and open space** when surrounded, and he wants the tension of being surrounded (the push by weight is the base of it); later three kinds of dash: normal, **blink** (goes through rocks) and **charge** (breaks rocks; `crushes` is the mechanism). Agent's cautions: pushes in a chain need a fixed order (they have one: list order) and the result of a step depends on it; the rock formula must be reviewed if rocks are ever generated outside the collision window.

### Collision with still things

`collideWithObjects` in `src/sim.js`, called in `step` right after the movement of each actor that has `move`: **one routine for every actor, the avatar and the Dummies alike (the user's rule, 2026-11-11: a Shroom bounces everyone, it only does not hurt everyone).** The things it tests are the objects near the actor (found by the formula, not the broken ones). It says whether the actor met an object it was not touching before, and the reaction to that is the actor's own (the Dummy picks a new angle). (History: the Dummy had its own, simpler meeting with objects, with no bounce and no change of velocity; nobody had decided that difference.)

- Circle against circle. The *normal* is the unit vector from the thing to the actor. The actor is pushed along the normal until it just touches the thing.
- The velocity is split into the part going **into** the thing (along the normal) and the part going **along** it. The part going in becomes `-bounce x` itself, and the part along is **not changed**. So no bounce cancels the reflection only and the actor **slides** (the user's definition: "bounce 0 is not friction 1, it does not stop movement, it only cancels the reflection"), and the angle matters. Friction does not exist; it could become another value per thing later.
- **Bounce (the user's decisions):** only the **Shroom** has a bounce for now; everything else has none (the rock). A bounce is **never above 1**, or the thing would eject whoever hits it, like a spring (`assertValidDefinitions` fails above 1). The Shroom's bounce grows **in a straight line with its radius**, from a minimum at the smallest radius to 1 at the largest (`finalBounce` in `src/sim.js`, made into the object at its creation; the two ends are `bounce` in the definition). The user's first idea was a bounce from 1 up, and he dropped it: it ejects.
- **Collision threshold (the user's decision):** the collision only happens when the speed going into the thing (the impact) is at least `collision.minImpact` ("1 for now", to be found by playing). Below it **nothing triggers**: no hit and no bounce, and the actor just stops against the thing (the part going in is removed). Its purpose is to avoid several contacts in a row. Bounce and weight are properties of the still actor and have nothing to do with each other: any still actor (a block in its nature, not a "rock" with sizes) has a weight (and, if it has one, a bounce).
- When the collision happens, the **body slam** hurts both sides before the bounce (see "Damage").
- The objects are tested in the fixed order of `objectsInArea` (`objectsNear` keeps that order); a corner between two objects is resolved over the next frames. See "Relations" for the speed above which an object could be crossed in one frame.

### Damage

```
packet     = { blunt: n, puncture: n }          (only the types above zero; the order of DEFINITIONS.damageTypes)
reduction  = points / (points + resistanceScale)  (per type, from the target's resistance)
after      = amount x (1 - reduction)             (per type)
DAMAGE     = sum of after, and at least minDamage when the packet is not empty (an empty packet is 0)
HEALTH     = HEALTH - DAMAGE
```

- **Damage is a packet by type (the user's design, 2026-11-11).** A hit carries one amount per type and the types stay independent all the way: a sword of fire against a creature resistant to fire is still a blade (the blunt or puncture part is resisted on its own). Only two types exist now (blunt and puncture); the list is `DEFINITIONS.damageTypes` and its order is the order of calculation.
- **Resistance is in points per type and the curve is hyperbolic (the user's decision: "a curve, no immortality, no hyper resistance", a ratio the agent proposed and the user accepted for now):** the share removed is `points / (points + resistanceScale)`. It never reaches 100%, and every extra point still helps, with diminishing returns. The user first thought of a fixed percentage and chose the curve; the numbers are to be seen in play.
- A hit with something in its packet always costs at least `damage.minDamage`: resistance never makes the target immune and never heals it. Health stops at zero; **an actor at zero health is removed from the scene at the end of the step by `removeDestroyed`, except the avatar, whose death is not decided** (see "Destruction" under "Actor").
- **`resolveDamage(packet, target)` returns the record of a hit** (`parts` with type, amount, points, reduction and the amount after; `total`; `minimumApplied`). It is the future damage trace; **nothing stores it yet.** `damageOf` is its total; `finalAttack` returns the packet of a body slam; `applyDamage` takes the health.
- **Who hurts whom (the user's rule, 2026-11-10, `bodySlamHurts` in `src/sim.js`): the body slam hurts only where the avatar is one of the two sides, in both directions.** (An actor that crushes is the exception for objects: see "Crushing" under "Actor".) The avatar hurts actors and objects, and actors and objects hurt the avatar. An actor against an object, an object against an actor, or two actors: a collision (push, bounce, turn) but no hit, nobody is hurt, and so an actor never breaks an object. The reason is the user's: the weight of the mecha is the center of the damage of contact, which makes the weight interesting; what else fights will be the weapons (and `crushes`, see "Actor"). Test 90 plays a long run and checks that nothing is hurt without the avatar.
- **Body slam (the user's decisions, with his first numbers, "to begin with", not validated by play):** a collision that hurts (see above) hurts **both sides**, each with **its own weight**. Every **collision** is a hit (the user's decision: modular, because speeds will change). There is **no `doesDamage` flag** (the user removed it as a relic of an idea that died): what is harmless is decided by the weight alone, a weight of 0 has an attack of 0 (see "Weight 0"). **Only the moment of the collision hurts, friction does not** (the user's decision): a pair that was already touching in the last frame is friction, and `state.contacts` keeps the pairs of the last frame to tell them apart. Pressing and sliding still push and bounce, but are not new hits. The attack grows with the weight and the impact: the **body slam is an attack like any other: a blunt packet** (the user, 2026-11-11: it is the foundation of why attacks are packets), `weight of the attacker x bodySlam.attackPerKg` as the base, scaled at the hit by `impact / bodySlam.referenceImpact` (**the formula is the agent's provisional proposal, to be discussed with the user**; the two constants are his first numbers). The impact is the part of the speed going into the other thing, so a graze is a weak hit. The weight of the avatar is the total weight of its blueprint; of anything else, `weightPerRadius` x radius of its definition. Later modifiers of the body slam do not exist yet.
- **Weights are whole numbers (the user's rule):** the `weight` of a part, and for an object the `weightPerRadius` and the radii of its `size`, are whole numbers, zero or more, so the weight is whole by construction. `assertValidDefinitions` in `src/sim.js` checks it when the file loads and fails loudly, so a float cannot get into the sums.
- **Weight 0 (the user's idea):** a still thing with weight 0 (a `weightPerRadius` of 0) is harmless and **breaks easily** (a branch, a box). In reality nothing weighs 0, but for a mecha it is the same. It follows from the rules above with no special case: the attack is 0, so it does no damage (the minimum damage only applies when there is an attack); and it breaks with the first hit when its health is not above the minimum damage. A thing that breaks gives no push or bounce, so the mecha goes through it. There is no weight "almost 0": any positive weight hurts at least the minimum damage, so **no actor may have a tiny positive weight** (the user's note: as long as none does, this is fine). The rule is tested with a patched definition; there is no weight 0 type in the game yet.
- **The list of objects (the user's idea):** boxes, rocks, logs, houses and so on are all the same kind of thing, listed in the library as `DEFINITIONS.objects`. **Each entry is complete and has its own numbers; nothing is shared between entries (the user's rule, critical):** there are many objects and every one must be unique, so no value may come from a constant that serves two entries (the agent once did that with a shared size and the user rejected it). **Each entry is only ranges (the user's rule):** `size: { min, max }` (the radius range), `healthRange: { min, max }`, `weightPerRadius`, and what is its own (the Shroom has a `bounce` `{ min, max }`). The entries are the **creation parameters** that the seed rolls for each object placed; an object has no fixed number and no initial state. **Weight follows the radius (the user's decision; first changed from the area to the radius on his idea, because it is easier to read and to balance, and the range of weights is as wide as the range of health):** `weight = weightPerRadius x radius`, both whole numbers, nothing rounded; the weight is computed once, by `finalWeight` inside `finalizeObject`, and stored on the object (`object.weight`). Every object has its own `radius` and carries its own `weight` and `bounce`.
- **The Shroom (the user's idea, a test item):** the object `shroom`: like the rock in the numbers the user gave (the same values, but written in its own entry, not shared), with a bounce that grows with the radius. The seed places it like the rock (`kinds` has both, with the same chance: a guess). Its `healthRange` is a guess, to be tuned by playing. The avatar's body slam hurts it and it hits back with its own weight; it bounces the avatar back by its own `bounce` (made by `finalBounce`).
- **Shield (the user's decision, not implemented):** it is essentially **a health that regenerates**, and it comes primarily from the Generator. Order (the agent's suggestion, the user agreed): the damage is calculated first, **the shield absorbs it first, and what is left goes to health**. It has memory, so it is state. The regeneration rule is not defined.
- **Damage trace (the user's requirement, not implemented):** any change to health must be explainable. The damage is shown as a formula such as `(X + Y + Z) * W`, and every term says where it came from (which skill, part or buff). It feeds the damage audit page. The structure of the trace is not defined.
- The formula will be developed little by little, one piece at a time.
- **Known weaknesses (for the user to decide):**
  - The numbers of resistance and of the Biter's bite are guesses, to be tuned by playing; with a very small packet the minimum damage decides the result.
  - Hits come in whole steps of the attack, so a fine health range for the rocks shows up in play as only a few different numbers of hits.

### Movement and input

The user approved this and noted that everything may change.

- The canvas is **1920 x 1080** (the user's requirement), and world units are canvas pixels. **Chamber 1 is a full-window game view** (the user's requirement: the whole screen is playable): the canvas fills the window and keeps its shape, with black bars if the window has another shape. A small faint label in the top-left corner shows the title, the controls and a BACK button; Esc also goes back.
- The avatar is always at the center of the screen (the camera follows it), drawn as a white circle.
- Move with WASD or the left analog stick. **There is no manual aim** (the user's decision, no mouse and no right stick): the weapons aim by themselves. So the avatar has no `aim` field; a weapon's target will be data of the weapon, later.
- `move.direction` is a vector with length from zero to one. On the keyboard, diagonals are normalized so they are not faster (not confirmed by the user; his old project used another factor).
- Vectors are used instead of angles, so the simulation needs no trigonometry, which can differ between browsers.
- **Movement has inertia** (the user's requirement): the avatar speeds up and slides to a stop. `move.direction` is what the actor *wants*, and `move.velocity` is how it is *really* moving; the velocity has memory, so it is state. Every frame `approach(velocity, target, rate)` moves the velocity in a straight line toward `direction x finalSpeed`, by at most `rate`, and lands exactly on the target when it is within reach. `rate` is the `acceleration` of the actor while it wants to move and its `deceleration` when it does not. Turning around passes through zero, with no jump. Only arithmetic and `Math.sqrt`, so it stays deterministic. The values are exact binary fractions on purpose, so the sums are exact.
- **Top speed is dynamic** (the user's requirement): `finalSpeed(actor, blueprint)` is asked again every frame and stored in the actor (`actor.speed`).
- **Dash** (Space or the gamepad A button, the user's choice), in `updateDash`. It spends one charge and sets the velocity to the direction (always at full length, so a half-tilted stick dashes just as hard) times `finalDashSpeed`. The frame of the dash already moves at the full dash speed. While an actor is faster than its top speed, its speed falls by the **constant** `overspeedDecay` every frame, down to the top speed, and then normal movement takes over. **Any part may add to the dash strength, but the decay is a constant** (the user's decisions), so a stronger dash is also a longer dash. The dash state is `actor.dash = { charges: { now, max }, recharge, rechargeFrames }`, carried by the actor; the maximum and the recharge time come from the parts (the Booster). `OVERSPEED_TOLERANCE` keeps the rounding error of a diagonal from counting as "faster than the top speed".
- A dash without a direction does nothing and keeps the charge. This is a stand-in: **the user's plan (not developed) is that a dash without a direction becomes an EMP that destroys projectiles**, on the same button and the **same charge** (the lore: the overflow of the dash charge leaking out of the mecha's exhaust).
- The input is `{ move, dash }`, where `dash` means "pressed in this frame", and it is kept in the history with the move.
- Gamepad: the browser only exposes it after a button is pressed. The left stick has a radial dead zone (`STICK_DEADZONE`).
- A faint grid on the ground (the agent's addition): with the camera locked on the avatar, an empty background would make movement invisible. It is unrelated to the collision grid.
- The loop in `src/main.js` runs at most one step per browser callback. On faster monitors the extra callbacks are ignored, so the game does not speed up. On slow machines it runs in slow motion.
- The HUD is plain text: the frames per second in the top-right corner (counted over one second in `src/main.js`, drawn by `drawFps`), and, in the bottom-left corner, the health and the dash (charges, the recharge count, READY). The user asked for numbers only, no visual work for now.

### Run history (two logs)

Agreed with the user. Implemented in `src/history.js` and recorded by the Chamber 1 loop (no buttons, no automatic cross-check yet; from the browser console, `crossCheck(runHistory)` runs it).

- **Vocabulary:** a **snap** is a saved copy of the state at one frame (the user's word). "State" is the live one.
- Each snap carries `run` and `frame`, so a snap exported to disk can be identified. The rules never read `state.run`.
- The game keeps the last `HISTORY_SIZE` snaps and inputs, in two lists where index 0 is the oldest. The lists are **aligned**: same index = same frame, and `inputs[i]` is the input of the step that produced `snaps[i]`. The first snap has no input. Snaps and inputs are saved as copies. The history also keeps the blueprint of the run.
- **Cross-check** (`crossCheck(history)`): take the oldest snap, apply the saved inputs with `step`, and compare each result with the snap of the same frame. It returns `null` or the first difference (`{ frame, path, expected, actual }`). A difference means something is not deterministic. Planned: run it continuously.
- It proves **consistency**, not **correctness**: a wrong rule replays equally wrong. Correctness is the job of the tests and of the damage audit.
- No hashes: the comparison is state against state, and the states stay readable JSON.
- **Going back while paused (planned):** the user can walk back through the saved frames. Pressing play on a past frame discards the snaps **and inputs** after it (`discardAfter`; the agent's default, not yet confirmed). Going back must load a **copy** (`stateFromSnap`), because `step` changes the state in place.

### Spawn

- Every X time, Y spawn. For each map, exactly what appears and when is known in advance.
- At first, all actors want to attack the player.
- An actor that leaves the window reappears on the opposite side. So there is a limited number of actors always present, almost all on screen. **Implemented for the Dummies** (see "The Dummy" below).

### Collision grid

- The **window** of cells around the avatar is the **whole universe of the game** (the user's decision): nothing ever exists outside these cells, and collision is tested only between actors inside it.
- The avatar is in the center cell. The window must cover **all the ground where an actor can be**, including actors that are off screen (the user's requirement: at least twice the screen). It is a rectangle of cells, odd on each side.
- Cell size, window size and the size of the screen are **dev settings**, kept in `state.grid` so a run is reproducible. Do not hard-code them elsewhere. The screen size is the canvas of `index.html` written once more in the rules, because the rules need to know what is off the screen (the birth of an actor); `src/main.js` refuses to start Chamber 1 if the canvas has another size, and test 101 checks the two agree. Agent's note: a bigger window costs almost nothing, because what costs is the number of actors tested, not the area; so err on the larger side.
- Every actor **stores the cells it covers** in `actor.cells`: `{ from: { x, y }, to: { x, y } }`, a rectangle of cells with both corners included (the user's decision, 2026-11-10: any actor can have several cells, there is no separate list for big ones). It is the rectangle that the square around its circle reaches, so a small actor has one cell (up to four over a border) and a huge one has many. `step` writes it for every actor **after the movement** and before the collisions (`setCells`), and the collision reads it from the actor (the user's rule: read from the object). The cells are counted in the world, not around the avatar (see below). Whenever a collision pushes a Dummy, its cells are written again at once, so at the end of the step the stored cells are always right (a test checks it).
- Cells are counted **in the world** (cell zero is around the origin of the world; `cellIndex`), so the cells of an actor change only when it moves. (History: they were first counted relative to the avatar, an agent's choice the user never confirmed; when the avatar became pushable by other actors, 2026-11-11, that choice would have moved everyone's cells at every push, so the agent changed it. `isInWindow`, which read a relative cell, was called by nothing in the game and died with it.) A cell is always a pair of integers. The window is a rectangle in pixels around the avatar (`windowWidth x cellSize` by `windowHeight x cellSize`), which `wrapIntoWindow` enforces; the cells only serve the collision.
- Consequences (the agent's reading, to be confirmed). **Not implemented:** nothing enforces the invariant or moves actors back today.
  1. Every actor must always be inside the window, an invariant to check (fail loudly), not a filter.
  2. An actor that would leave the window reappears on the opposite side of it. The window is centered on the avatar, so the rule is on the offset from the avatar, and it must match `cellIndex`.
  3. Nobody crosses the seam: actors on opposite edges are not neighbors. It is invisible, because the seam is off screen.
  4. The ground is infinite. Only the population is bounded.
  5. To see the limits of the universe, a debug zoom-out is the way; drawing every cell only produces noise. (The user no longer wants to see the collision boxes, and the overlay was removed.)
- **Who uses the grid:** the collision between actors: between Dummies, and between a Dummy and the avatar (`collideActors`; the objects are met earlier in the step, in the movement). Two actors are tested only if they share a cell. The index (cell to the Dummies that cover it) is made again every step from `actor.cells`; it is not state. The result is **exactly** the one of testing every pair in list order (tests compare the whole state), including a Dummy pushed into a third one in the same step: that is why the cells are written again after every push and the next Dummy to test is asked again after every test (`nextInCells`). Keep that property: the grid is a faster way to the same result, never a different rule. The collision with **objects** still finds them by the formula of the seed (`objectsNear`), not by the grid; with many Dummies that search is now the largest cost of a step.
- The wrap exists for the Dummies only (`wrapIntoWindow`): the window is the real area of the game, and a Dummy that leaves it on one side comes back on the opposite side. The invariant for every actor is still not checked.

### The Dummy

The user's idea (2026-11-10): a test actor that does not attack, made to see many things colliding. Numbers are in `src/data.js` (`DEFINITIONS.actors.dummy` and `DEFINITIONS.terrain.dummies`), with their reasons; nothing is repeated here.

- **Made by the seed, lives in the state.** `createDummies` (called by `createChamber1State`) makes `count` Dummies through `finalizeObject("dummy", …)`, the same function as everything else. The seed rolls radius, health, first angle and position (the salts are in the code, with the number of the Dummy). Its speed comes from its recipe through `finalSpeed`, and the Dummy carries it. Ids are `dummy_0`, `dummy_1`, and so on.
- **Where:** born like any actor (see "Birth" under "Actor"): anywhere off the screen and inside the window of the collision grid around the avatar, with no search for a free place (`birthOffset`, salts 17 and 18). (History: on its first day a taken place was refused and the seed tried another, up to a number of tries; the user replaced that with the birth rule the same night, and `safeRadius` and `placementTries` of the Dummies died with it.)
- **How it moves:** like any actor that moves (the user's decision, 2026-11-11: it has an `acceleration` and a `deceleration` in its recipe, and its velocity is calculated like anyone's): `wander.angle`, in whole degrees, gives the direction it wants, and its velocity goes there by its acceleration, in the same code as the avatar's. It is born still. A turn is therefore a curve, not a jump. Its deceleration is not used yet (a Dummy always wants to walk). `wander` is `{ index, angle, turns }`. At every **new** contact (with an object that is still whole, with the avatar, or with another Dummy) it gets a new angle, `hash(seed, index, turns) % 360` (the user's `rand(360)`, but from the seed, so the run is reproducible). A pair that was already touching in the last frame still pushes it out, but does not turn it (the same contact rule as the avatar's hits).
- **Sine and cosine** come from our own series (`sinDegrees`, `cosDegrees`), with additions and multiplications only, because `Math.sin` may differ in the last digits between browsers.
- **Wrap:** a Dummy that leaves the window comes back on the opposite side (`wrapIntoWindow`), around the avatar wherever it is.
- **Only the avatar hurts a Dummy and only the avatar is hurt by it (the user's rule, 2026-11-10, see "Who hurts whom" in "Damage"), with the same body slam as the avatar's** (`damageOf`): at a new contact with the avatar whose impact reaches the minimum, the Dummy and the avatar each hurt the other with their own weight. The impact is the speed at which the two close in on each other (the difference of their velocities along the line between the centers). Against an object the Dummy is pushed out, slides or bounces like the avatar (see "Collision with still things") and turns; against another Dummy the two are pushed apart and turn; nobody is hurt in either, so a Dummy never breaks an object. The Dummy weighs by the same rule as the objects (weight per radius times radius), from its own recipe. Health stops at 0: there is no death yet, so a Dummy at 0 goes on walking. A contact below the minimum impact turns the Dummy but hurts no one. The push between a Dummy and the avatar, or two Dummies, is split by weight (see "Push between actors by weight" in "The world: seed and objects"). (History: on its first day the Dummy hurt and was hurt by everything it touched, and the avatar was not pushed; the user changed both the same night.)
- **Drawn** as blue circles by `drawActors` in `src/render.js` (the same function draws every actor but the avatar, by the color of its type). The window is twice the screen, so about a quarter of the Dummies are on screen at a time.
- Tests: 80 to 101 and 106 to 110 in `tests/agent/README.md`. Most tests play in a game with no Dummies (`count` 0 in a patched copy of the data), because a wandering Dummy pushes and hurts the avatar and would change their results; the Dummy tests use the real data (with 100 Dummies, to stay fast).

### Actor

An actor is any entity that can act in combat. Today the avatar, the Dummy and the Biter are the only ones. A thing without `move` (a trap, for example) would be a static actor, but none exists, so nothing in the game handles it.

**Attacks (the user, 2026-11-11):** every thing has `attacks`, a table of `{ base, now }` packets by type. Everyone has `bodySlam`; a recipe may add more (the Biter's `bite`, with `reach`, `windupFrames`, `freezeFrames` and a `hitbox` that are copied into the actor). The **base is made once** (`finalizeStatic`; for an attack whose recipe says so, flat + per-weight x weight, so weight is a term only where the recipe asks); **`now` is rewritten from the base every frame** (`finalizeDynamic`, `finalAttackNow`), and that is the place where an aura that gives its neighbors more attack will enter. The avatar's `resistance` is a table by type, rewritten every frame from the blueprint.

**The Biter (the first enemy with AI):** `actor.ai = { attack, phase, frames }`. `think` runs before movement: in `chase` it walks straight at the avatar; when the space between the two bodies is within the reach of its attack it goes to `windup` (still for the frames the recipe says; the avatar can leave), then creates a hitbox and goes to `freeze` (still again for the frames the recipe says), and then chases again. A `windupFrames` of 0 strikes at once (the user, 2026-11-11: a pause before and one after, only to prove both can exist; the style is crowds, so seeing the attack is not a priority). More behaviors are planned (keeping a distance, standing still, a windup before a hit, a windup before a dash) and will be new phases.

**Hitboxes (the user, 2026-11-11):** `state.hitboxes`, separate from the actors (provisional: whether a hitbox is an actor is open). Each is `{ owner, attack, position, radius, framesLeft, damage, landed }`: a circle, born one body ahead of the attacker toward the avatar, where it stays; it keeps **the final packet of the attack as it was at birth**, hurts a target once and lives a few frames. `hitboxHurts` is the side rule (the avatar's hitboxes hurt everyone else, anyone else's hurt the avatar). The user chose to start with this basic hitbox and explore other behaviors (it follows the attacker, it travels like a projectile) later; the size of the radius is fixed per attack for now (whether it should follow the size of the attacker is open).

**Destruction (the user, 2026-11-11):** `destroyActor` and `removeDestroyed` take an actor with no health out of the scene and out of the state, and it is no longer drawn. It does nothing else yet (no drop, no effect). The avatar is not destroyed.

An actor **in the state** holds **its own value for everything it uses** (the user's rule, 2026-11-10: "always check the object itself", everything can change in a run: a druid that becomes a giant bear, a bigger mecha): `id`, `type`, `radius`, `position`, `cells` (see "Collision grid"), `health` (`{ now, max }`, the user's mold: almost everything has a now and a max), and, if it has them, `move` (`direction`, `velocity`), `acceleration`, `deceleration` and `dash` (`charges: { now, max }`, `recharge`, `rechargeFrames`). **Every final value is calculated by a final function and written into the actor, and the rest of the code reads the actor (the user's rules, 2026-11-11). When it is calculated depends on what it is: what is static, once, when the actor is made at the start of the run (`finalizeStatic`: radius, weight, bounce, acceleration, deceleration, the maximum health, the recharge time and the maximum of charges of the dash); what is dynamic, again every frame, at the start of `step` (`finalizeDynamic`: the top speed, the resistance, the attacks' `now`, the dash speed).** Which value is in which list is written in those two functions; a value moves to the dynamic list the day something makes it change during a run. The user confirmed the dynamic list (2026-11-11): the top speed must be calculated every frame, and the resistance and the dash speed are potentially dynamic, because items and other things can affect them. (History: for a few hours an agent recalculated everything every frame, the weight included, having read "everything calculated is stored" as "everything is recalculated". The user: dynamic things every frame, static things at the start of the run.) The definitions only hold the base (and the parameters of creation); the shape of each type is its `initial` in `src/data.js`. The maximum health, resistance, top speed and dash speed of the avatar come from the parts of its blueprint. An object (rock, Shroom) also holds its own `weight` and `bounce` (the user's decision, 2026-11-10: "use the formula when making the object, and then it becomes the reference"): `finalizeObject` computes them from its own radius with `finalWeight` and `finalBounce`, and the collision reads `object.weight` and `object.bounce`, never the definition. The avatar holds its `weight` too (the total weight of its blueprint) and a `bounce` of 0. The attack (`finalAttack`) reads the `weight` of the attacker.

**Birth (the user's rule, 2026-11-10, `birthOffset` in `src/sim.js`):** an actor is born anywhere **off the screen and inside the window** of the grid, with **no search for a free place**. The birth ground is the ring between the screen and the edge of the window: the whole body off the screen (the center at least its radius beyond the edge of the screen), the center inside the window (the same rule as the wrap: the body may stick out, the center may not). Every point of the ring is equally likely (the ring is four strips, one is picked with a chance equal to its area, then a point in it), and the numbers come from the seed and the number of the actor, so a run is reproducible. If it lands on something, the push of the collision separates them over the next steps, like an actor that wraps onto another; an object in the way is not removed (that is what `crushes` is for, when the actor has it). The ring always has room, because test 101 keeps every radius below the margin between the screen and the edge of the window. The order of birth the user gave: the things of the seed exist first (they are a formula, so they always do), the moving actors after. Today only the Dummies are born this way (`createDummies`); a stage that summons actors by frame does not exist yet.

**Crushing (the user's decision, 2026-11-11, `crushObject` in `src/sim.js`):** a **potential behavior of every actor**, on or off: every actor in the state carries `crushes`, a plain boolean (the same box for all, the user's rule: every actor can acquire a characteristic that other actors can). Today it is off for everyone (the avatar and the Dummy have it in their `initial`), and nothing switches it on; the user's picture is a **buff with a time**, like an aura, that turns it on and off, and that time belongs to the buff, not to this field. An actor that crushes **breaks every object it touches**: the object vanishes (`breakObject`, marked at zero in `damagedObjects`, exactly like an object that reached zero health; no new state, the user chose this over flinging it), no damage goes either way, the actor is not pushed, not bounced, not turned (a Dummy keeps its angle), and keeps going; it needs no minimum impact. It is a rule and not a huge damage in disguise, so the damage trace must show it as a rule. It concerns objects only: a crusher meets other actors like anyone. The first users will be the giants, to help them walk, but it is not theirs. Cost to know: every crushed object adds an entry to `damagedObjects`, so a crusher that crosses much ground grows the state (bounded by the ten minutes of a map). Tests 106 to 108.

### Weapons and equipment (the user, 2026-11-11; the full reference is `docs/weapons.md`)

Read `docs/weapons.md` before touching anything about weapons: it keeps the user's vision (which earlier summaries had lost), the old project's model, kept only as **relics, never as rules** (`docs/reference/`, read its `README.md`: `relic-old-project-state.json` and `relic-old-project-hud.jpg`) and the open questions. The decisions, short:

- **Four weapon slots (`ShoulderL`, `ShoulderR`, `ArmL`, `ArmR`), auto-aim, one part per slot.** There are armor-only parts that cannot take a weapon; a weapon comes as the arm or shoulder itself and replaces the armor-only part. Shoulders and arms need not be weapons (wings, shields): the same parts and specs.
- **Modularity is the business goal** (blueprints and mechas are what is sold): a weapon is a recipe in data made of a few pieces (trigger, what is born, how it behaves, its own trigger, effect and emissions), so a new weapon needs no new code. A grenade or a mine is an object, a bullet is a hitbox that moves, a cluster rocket emits on its end.
- **Ammunition has weight, so the avatar gets lighter as it fires** (the weight of the avatar becomes dynamic).
- The first weapon is a simple repeater of hitboxes: limited ammunition, a reload time, a cadence.
- Not built yet. Nothing about weapons is in the code.

## Code layout

- `index.html`, `style.css`: the screens.
- `src/data.js`: the definitions (`DEFINITIONS`, `DEFINITIONS_VERSION`), frozen. Every value has its reason beside it.
- `src/sim.js`: the rules. No DOM access. Things (`definitionOf`, `findDefinition`, `finalizeObject`, `createAvatar`); the blueprint (`partsOf`, `totalWeight`, `sumSpec`, `assertValidBlueprint`, `createRun`); the final values (`finalizeStatic` and `finalizeDynamic`, which write them into an actor; `finalRadius`, `finalAcceleration`, `finalDeceleration`, `finalDashRechargeFrames`, `finalWeight`, `finalBounce`, `finalSpeed`, `finalDashSpeed`, `finalDashMaxCharges`, `finalMaxHealth`, `finalResistance`, `finalAttacks`, `finalAttackNow`, `finalAttack`); damage (`resolveDamage`, `damageOf`, `applyDamage`, `packetOf`, `writeResistance`); the Biters and hitboxes (`createCrowd`, `createBiters`, `think`, `createHitbox`, `hitboxHurts`, `resolveHitboxes`, `destroyActor`, `removeDestroyed`, `reactToNewContact`); movement (`updateDash`, `approach`); objects (`hashInts`, `objectLayers`, `objectMargin`, `rollInRange`, `objectInSquare`, `isUnderBiggerLayer`, `objectsInLayer`, `objectsInArea`, `objectsReaching`, `objectHealth`, `isObjectBroken`, `damageObject`, `breakObject`, `crushObject`); collision (`contactBetween`, `objectsNear`, `collideWithObjects`); the Dummies (`sinDegrees`, `cosDegrees`, `setHeading`, `turnDummy`, `wrapIntoWindow`, `birthOffset`, `createDummies`, `pushShare`, `touchActors`, `collideActors`); the grid (`cellIndex`, `assertValidGrid`, and the cells of an actor: `setCells`, `shareCell`, `addToCells`, `removeFromCells`, `nextInCells`); `SALTS` (every salt of the seed has a name there; never write a bare number), `createChamberState` (the common part), `createChamber1State` (Dummies), `createChamber2State` (Biters) and `step(state, input, blueprint)`. `step` changes the state in place (the agent's choice, to avoid copying the state every frame).
- `src/history.js`: the run history: `createHistory(state, blueprint)`, `recordFrame`, `stateFromSnap`, `discardAfter`, `crossCheck`. No DOM access.
- `src/input.js`: reads keyboard and gamepad, and returns `{ move, dash }` for the frame.
- `src/render.js`: draws the state and never changes it.
- `src/chamber-0.js`: the test bench of Chamber 0. The text builders do not touch the page; only the end of the file does.
- `src/main.js`: screen navigation and the loop of the chambers that are played, 1 and 2 (it also records the history every frame).
- `tests/agent/`: tests **written and defined by the agent**, not by the user. `sim.test.js` tests the rules, and `README.md` explains each test in plain words, with the worked numbers (a test checks that every test has its row). `benchmark-grid.js` and `benchmark-layers.js` measure the collision grid and the layers of the ground (they are not tests). Any other kind of test the user writes later should go in its own folder.
- `docs/`: reviews written by an agent at the user's request. `docs/review-2026-11-11.md` is the map of the relations in the code, the fragile ones included, the tensions in the structure, the costs measured and what the direction of the game asks of today's code. **Read it before adding a rule.** Delete from it what gets solved.
- These are plain scripts, loaded in order by `index.html`, and they share globals. They will become modules when the simulation also needs to run in Node outside the tests.

## Ideas (agent proposals, not decided)

They only become decisions when the user approves.

- **Damage pipeline with recorded stages:** each stage notes what it did. It serves the audit page and testing synergies.
- **Step as a list of named phases**, for example: inputs, spawn, movement, collision, damage, remove the dead. No phase calls another, and the order is written in one place only.
- **Machine learning:** the source is the collection of snaps (the user's decision). Agent proposal: a separate export module that only reads the state and produces numeric data, and that never changes the simulation. Values ML will want (damage dealt in the frame, kills) should be numeric counters in the state. The reward definition and the observation format are left for when ML enters the project.
- **Practical requirements for determinism:** randomness only from a seed stored in the state; no `Date.now` or `performance.now` inside the simulation; actors always processed in a fixed order; avoid `Math.sin`, `Math.cos` and `Math.pow`; state without `NaN`, `Infinity` or `undefined`.

## Open items

- **Agreed order of work (critical review of 2026-11-10):**
  1. The user played Chamber 1 (2026-11-11) and said everything was very good: the swarm, the push by weight, the birth and the damage rules are validated by play. The combat of Chamber 2 is not played yet.
  2. Pause and one-frame advance (the history already exists, there are no buttons yet).
  3. A **damage trace** of real hits on screen, each hit written as its own arithmetic, coming from the simulation itself. This replaces the idea of printing static arithmetic of the body slam in DATA, which would be one more copy of the numbers.
  4. Only then decide the known weaknesses listed in "Damage", "The kit of parts" and "Collision with still things".
- The user has not yet confirmed in his Chrome the final position of the SIMULATION CHECK since inertia was added (the agent's Chromium value is in `tests/agent/README.md`, "Known answers in the browser"). The scripted run has no dash and never releases the keys, so the dash and the deceleration are only tested in Node; changing the script changes the final position.
- Parts still to come in the code: Radar, Magnet, the shield, the weapons (see `docs/weapons.md`), and the recharge of the dash.
- The attack of weapons, death, and the shield.
- The dash opening space (the push by weight exists; whether a dash pushes more is open); and the window as the universe for every actor (the invariant; the wrap exists for the Dummies only).
- **Huge actors (the user wants them: radii several times a cell, or more).** The grid already handles any radius (several cells per actor, tested with huge Dummies). Still open, and the user has not decided them: (1) the search of objects near each Dummy (`objectsNear`) is the largest cost left in a step, and every layer of the ground adds a search (measured in `tests/agent/README.md`, "Cost of the layers"). **Decided by the user (2026-11-10):** the things that live in the **seed** are the scenery, and they too may one day be huge, so the ground is made of **layers** (see "The world: seed and objects"); a huge layer has its own large squares and is rare. The rule of where a thing lives: what stays in place and is part of the scenery lives in the seed; what moves, or is summoned during a stage (each stage will have an array that says when, how many and which actors to summon, placed from the seed by `(seed, entry, try)` so the run is reproducible), lives outside the seed, in the state, as the Dummies do. The mechanism is built and tested, and **no huge object exists in the definitions yet**. **Decided by the user (2026-11-10):** a huge actor never shows on both sides of the window. Every actor, whatever its size, wraps only when its **center** leaves the window (what `wrapIntoWindow` already does), and no actor will ever be larger than the space between what is on the screen and the edge of the window, so the jump always happens off screen. That makes the smallest margin between the screen and the edge of the window the limit of the radius of an actor. A test (101) reads every actor recipe in the definitions and fails if one allows a larger radius (the user asked for a test on the definitions, so such an actor cannot be made in the first place). It does not look at the objects, which do not wrap, and nothing stops code from writing a larger radius on an actor during a run. A new actor type, a change of the canvas or of the window must keep that test passing. A consequence to know: an actor that wraps can land on top of another one on the other side; the collision pushes them apart there, off screen, like any other overlap.
- What the death of the avatar does (it stays in the scene at zero health today).
- Whether a hitbox is an actor (a projectile may need to be), and whether its radius follows the size of its owner.
- A minimum time between two hits of the same pair (review 3.8): with a Biter biting every few frames while the avatar stands still it becomes real; to be felt in play.
- More behaviors of the Biter and of hitboxes (keep a distance, stand still, windup, dash; hitbox that follows its owner or travels).
- The record of a hit (`resolveDamage`) is not stored yet; the damage trace is built on it.
- Move `src/data.js` to the library structure.
- Running the cross-check automatically.
- The user's second monitor is stuck near 60 Hz (parked; not a problem of the game).

## Handoff (2026-11-11, written by one agent for the next)

What changed last, and what to keep in mind when picking the work up. Remove or rewrite this section when it is stale.

**State of the work.** Everything the user asked for on the night of 2026-11-10 to 11 is done and pushed. Nothing is half made. The tests pass and the README table matches them (test 112 checks it).

**What was done in this stretch (each has its section above)**

- The Dummies, the collision grid with several cells per actor, the layers of the ground.
- Who hurts whom: the body slam hurts only where the avatar is one side ("Damage").
- Birth: off the screen, inside the window, no search for a free place ("Actor").
- Crushing: a potential behavior of every actor, off for everyone ("Actor").
- The push between actors by weight, the avatar included ("The world: seed and objects").
- Cells counted in the world and not around the avatar (the agent's change, forced by the push of the avatar; "Collision grid").
- Guards in the tests: a patch that changes nothing fails (111), the README table (112), nothing non-deterministic in the rules (113).
- The review of the code: `docs/review-2026-11-11.md`.

**Decided by the agent while the user was away, for him to confirm**

- The size of the screen is written once more in the rules (`state.grid`), with a loud check against the canvas.
- Cells in the world (above).
- Birth keeps the whole body off the screen and only the center inside the window.
- Two actors of weight 0 split a push half each.
- `crushes` is copied from the `initial` of each actor's recipe.

**Chamber 1 was played and approved by the user (2026-11-11). The combat of Chamber 2 (Biters, packets, resistance, hitboxes) was not played yet.** The first thing to ask him is to play Chamber 2 and say how the bite, the freeze and the numbers of resistance feel.

**Properties to keep (tests guard them)**

- The grid gives exactly the state of testing every pair in list order (95, 98, 99, 110). If a change breaks that, it changed a rule, not only the speed: stop and tell the user.
- `actor.cells` is always right at the end of a step (100, 110), because the collision reads it from the actor.
- Most tests play in a game without Dummies (`withDummies(0)` in `tests/agent/sim.test.js`).
- The final position of the SIMULATION CHECK (README, "Known answers in the browser") changes with any rule; record the new one when it does.

**Open, for the user to decide (raise one at a time, when it comes up)**

The list, in the order the agent would ask, is at the end of `docs/review-2026-11-11.md` ("Questions for the user"). The first after he plays: whether the rules may read every value through a final function, with the actor holding only the base (the review, 4.1). It shapes buffs, auras and transformations.

**Mistakes made in this stretch, so they are not repeated**

- The user said "let's try it, so I can see the feeling" and the agent started to build, when he only wanted the idea considered. When he says "try" or "see", say what would be built and confirm in one line before building; when he says he needs the implementation, build it.
- A patch of the data by `text.replace` stopped matching after the data changed, silently, and every test played with the full number of Dummies. `loadGame` now refuses any patch that changes nothing, and `patchOnce` refuses a text found zero or two times (test 111).
- An edit of `tests/agent/README.md` replaced a heading by accident, and once a commit went in before its docs. Read `git status` and the diff of the docs before committing.
- A claim was made from a random run that never met the worst case ("this cell size holds"). Only a case built on purpose, or a proof, shows a limit. Say which of the two a statement rests on.
- The user said "everything calculated is stored in its actor" and the agent built "everything is recalculated every frame", the weight included. Storing and recalculating are two questions; when a rule of his has two readings, say both in one line and ask which.
- A test said it checked the avatar's cells after a push, and it rewrote the cells before looking, so it could not fail. Breaking the code on purpose showed it. Always break the thing once and see the test fail.

## How to run

Open `index.html` in the browser. The scripts are plain (no modules), so no server is needed.

### Tests

From the root of the repository: `node --test` (no path; Node finds the `*.test.js` files). A good run ends with `# fail 0`. The user can paste the whole output to the agent. The tests load the browser scripts into a `vm` context, so they do not need to become modules; the test file passes the starter blueprint to `step` by default. Whenever a rule or a value changes on purpose, update the numbers in the tests and in `tests/agent/README.md`.

## How to work on this project

- Solve one problem at a time. Short replies. Do not over-explain.
- Do not start work the user has not asked for. The user explains the concept and sets the decisions; the agent proposes and confirms.
- Do not assume the obvious: if a question already has an evident answer, decide and move on, and keep questions for real design decisions.
- Code prioritizes readability and transparency: clear names, no unnecessary cleverness.
- Language: chat with the user in Brazilian Portuguese (he is fluent in English). Everything else is en-US: code, identifiers, comments, docs and commit messages.
- Record in this file every new decision that affects the direction of the project, **without values** (see the top of this file).
- **Gameplay formulas are the user's.** He cannot verify code or tests, but he needs full control of the formulas of the game. Present them as plain arithmetic with example numbers (in the chat, not in this file), and ask before choosing one for him.
- Always say briefly whether something the user proposes, or something the agent did, looks sound (sound / sound with a cost / fragile or premature / not sure), with the reason and what would change the agent's mind. No agreement for its own sake. The agent can judge the soundness of a design, but not the feel of the game: the user describes what he sees.
- **Every number that is chosen needs a reason, and the agent suggests one** (see "Where the numbers are").
- **Say when a decision rests mostly on the user's preference**, briefly and plainly, and keep going: the game is his, so a preference is a valid reason, but he wants to know which decisions are preference and which are need. The same goes for the agent's own preferences. **Filter (the user's rule):** do not raise a suggestion unless it has the potential for a positive change to the game. Do not challenge a choice of taste only to offer alternatives (the user's example: "you chose cats, but what about dogs, or squirrels?"). A taste choice is worth a remark only when it carries a concrete cost or risk into the structure. The same applies to numbers: suggest a different value only if it would measurably change the experience.
- Small corrections, not over-corrections: the user said the agent rushes, and then brakes too much when corrected.
- After changing something visual, ask the user to open it and describe what he sees and feels. For anything that can be printed as text, add a button to Chamber 0 and ask the user to paste its output.

### Patterns that work here (written by one agent for the next, 2026-11-11)

These are not new rules of the user. They are what the agent saw working, and failing, over many sessions. Use judgement; when one of them fights a rule of the user, the user's rule wins.

**Reading the user**

- He thinks while he types: fast, with typos, sometimes cut in the middle. Never remark on the typing. If a message is cut, say what you understood and ask him to finish; do not guess the rest.
- He often answers a question with a principle instead of a yes or no ("all actors are the same box", "everything has a now and a max", "names are useful"). That principle is worth more than the answer: it is a rule of the structure. Write it in this file in his words, and apply it to the cases he did not mention.
- When he decides something, say it back as **one rule in one sentence**, then the consequences he may not have seen, then stop. If the sentence is right he says so, and it becomes the comment above the function.
- **"Let's try", "I want to see", "consider"** are not requests to build. **"I need the implementation", "do it", "you can run it"** are. When in doubt, one line: what you would build, and wait.
- One open question per reply: the one that blocks. Park the others in "Open" and bring them when their turn comes. A list of questions reads to him as obstacles thrown in his path.
- When he will be away, list the choices you will make alone **before** starting, with your default for each, so he can overrule in one line. Mark them in this file as the agent's, for him to confirm.
- When he asks for the "effect" of something, he wants a before and an after with numbers, measured, in a small table, and one sentence of what it means.
- After a mistake: say what happened in one sentence, fix it, go on. No promises about the future and no swing to the opposite excess; he named both as failures.
- He cannot read the tests. The README table is how he reads them: one row per test, in plain words, with the worked numbers.

**Writing the rules**

- **A rule of the game is one small function with the user's sentence above it** (`bodySlamHurts`, `pushShare`, `crushObject`, `birthOffset`). A new rule is a new named function that the other code asks; never the same condition written in two places. When the user changes his mind, one function changes.
- **What must not exist cannot be made.** A limit is checked when the definitions load (`assertValidDefinitions`) or by a test on the definitions (101, 102), not by an `if` during play. The user asked for this twice.
- **A mechanism that has no content yet is proven with patched data in the tests** (`patchOnce`: the huge layer, the weightless Dummy), never with placeholder content in `src/data.js`. What is not used does not live in the data.
- **A faster way must give the same state as the plain way**, and the plain way stays in the tests as the reference (`EVERY_PAIR`). An optimization that changes a result is a change of rule and needs the user.
- **Before a refactor, say what must stay bit for bit the same and which test shows it** (the known answers of seed 1, the whole-state comparisons, the Chromium position). Keep the operations in the same order: floating point is not associative.
- **Name things for what they are today.** `collideActors` handles Dummies, so it is not called `collideActors`. An honest narrow name is a note to the future; a wide name over narrow code is a trap.
- **When a rule the user asked for forces a change he did not ask for** (the cells stopped being relative to the avatar because the avatar became pushable), make that change its own commit, say why in the message, and record it here as the agent's change.
- The seed answers questions through `hashInts` with a salt per question. A new question takes a new salt. The place of a layer in the list of layers, and the number of an actor, are part of the world: changing them changes every run.
- The result of a step depends on the order of `state.actors`. Never reorder it; add at the end; remove without reordering.

**Proving the work**

- Rule, tests, README row and the note in this file go in **the same commit**. Run `git status` and read the diff of the docs before committing; test 112 fails if a row is missing.
- **Break it once.** For every test that is meant to guard something, break that thing in the code, see the test fail, put it back, and say in the commit message which tests fail without the change. Twice a test was found that could not fail.
- Say what a claim rests on: **read** in the code, **measured** (and how), or **opinion**. A random run is not a worst case.
- Raise `DEFINITIONS_VERSION` when `src/data.js` changes, and update the pair (version and fingerprint) kept in `tests/agent/sim.test.js`; test 129 fails otherwise and prints the new values.
- After a change of the rules, open the game in a real browser (Chamber 0's SIMULATION CHECK: the cross-check must say none, and no error on the page), and record the new final position in the README when it moves.

**Thinking ahead**

- The run is `seed + blueprint + inputs`. Before adding anything to the state, ask whether it can be derived from those; before adding anything to the rules, ask whether it reads a clock, a random number or the order of a set. Test 113 guards the obvious cases only.
- New content will multiply whatever is written in two places. Before the second weapon, the second enemy, the second source of damage, look for the thing that should become one function or one table first (`docs/review-2026-11-11.md`, section 4, names them).
- The user's three axes are the tie-breakers, in order: the player's time, the transparency of the data, reproducibility. A design that hides how a number was made loses to one that shows it, even when it is shorter.
