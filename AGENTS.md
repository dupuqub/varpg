# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

**This file has no game values (the user's rule).** It says what was decided, why, and **where each number lives**. The values, each with its reason and who chose it, are in `src/data.js` (and in the few named constants listed in "Where the numbers are"). Do not copy a value into this file: write the rule with the **name** of the number (for example `attack = weight x attackPerKg`). The only numbers allowed here are the fixed decisions of the concept (steps per second, the canvas size, the length of a map). Worked examples with numbers belong in `tests/agent/README.md`, where a test fails if they drift.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state: screen navigation (main menu, test chambers list, two chambers). In Chamber 1 the avatar is always at the center of the screen, moves with inertia, dashes, collides with the objects of the seed (rocks and Shrooms, all placed by seed and formula, none by hand), and collisions hurt (the body slam). The avatar's values are sums over the mecha parts of its blueprint. The collision grid (cells and window) exists and is not used by any collision yet. See "Code layout".

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
| Values equal for everyone (`overspeedDecay`, `collision.minImpact`, `bodySlam.attackPerKg`, `bodySlam.referenceImpact`, `bodySlam.minDamage`, `weightSpeedPenalty`) | `DEFINITIONS.constants` |
| How the ground is filled with objects (`cellSize`, `chancePercent`, `safeRadius`, `kinds`) | `DEFINITIONS.terrain.objects` |
| Objects (rock, Shroom: each entry is a set of ranges, `size` `{ min, max }`, `healthRange`, and `weightPerRadius`; the Shroom also has `bounce`) | `DEFINITIONS.objects` |
| The Dummy (`size`, `healthRange`, `weightPerRadius`, `speed`) | `DEFINITIONS.actors.dummy` in `src/data.js` |
| How many Dummies, how far from the avatar they start, how many places are tried (`count`, `safeRadius`, `placementTries`) | `DEFINITIONS.terrain.dummies` in `src/data.js` |
| Collision grid (`cellSize`, `windowWidth`, `windowHeight`) | `state.grid`, set in `createChamber1State` in `src/sim.js` |
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
- The margin of an object square is the largest `size.max` among the kinds the seed places (`objectMargin()` in `src/sim.js`, computed, never stored), or objects of neighbor squares can overlap.
- `terrain.objects.safeRadius` should stay above the distance of a dash plus the avatar radius plus the largest object radius, or the first dash can hit an object.
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
- Chambers are not necessarily places in the game. **Chamber 2: Diagnostics** is a test bench: buttons that run something in the real browser and print plain text into a box, with a COPY button, so the user can paste the output to the agent. Buttons: ENVIRONMENT (browser, screen, gamepads, frame callbacks per second), SIMULATION CHECK (a scripted run played twice, the history and the cross-check, including a snap changed on purpose to see that the check notices it, and the final state) and DATA (the definitions, the blueprint with the arithmetic of each final value of the avatar, the rocks of the first screen and the initial state). The scripted run uses no trigonometry, so every browser must print the same final position; compare outputs between machines or against a Node run.

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

The user wants the smallest possible state. The state is a **photo** of how the game is now, not of what is done in it. Rule of thumb: if it can change during a run, it is state; if it never changes, it is a definition; if the player chose it before the run, it is the blueprint.

- **Definitions (the "db", to be called the library, see "The library"):** what the game *is*. They never change during a run. They live in `src/data.js`, a plain object `DEFINITIONS` that is deep-frozen, loaded by `<script>` so `index.html` still opens directly. There are exactly three things in it today: the avatar (`DEFINITIONS.actors`, the only actor, created by hand with its **initial state**, which `createActor` only copies, so no number about how an actor is born is hidden in code) and two objects (`DEFINITIONS.objects`: the rock and the Shroom, created only by the seed, from ranges). A thing points to its definition by id (`type`), and `definitionOf(thing)` returns it. **Cleanliness rule (the user's, strong):** every value in the definitions is defined and used by something; what is not used is deleted and comes back when something needs it. No placeholder: a value of a non-avatar thing comes from the seed (a range), and a value of the avatar comes from its definition or its parts. Exceptions the user has not decided yet are listed in the next steps (the `name` fields are used by nothing today).
- **State:** only what changes: positions, velocities, health of the avatar (`{ now, max }`), dash charges, the frame, the seed, the objects that were hurt, the grid settings, the version of the definitions.
- **Blueprint (the user's name, chosen on 2026-11-10):** the structure of the mecha the player chose for the run: for now the list of mecha parts. The word **build** is kept for the ordinary meaning (the process of building something, and the genre word for a combination of skills and parts), so the code never uses it as a name for this list. The skill tree (the processor) is a separate thing and has no name in the code yet. It is an **input** of the run, like the seed and the inputs, not a state: it does not evolve, and it is not inside the snaps. Only the avatar has a blueprint; other actors read their definition directly. `createRun(id)` returns `{ id, blueprint }` with a copy of the starter blueprint and refuses an invalid one (`assertValidBlueprint`). The blueprint is the **third argument of `step`** and of every `final...` function that needs it, and `createHistory(state, blueprint)` keeps it for the replay. (The agent once proposed an avatar "already prepared" with the blueprint applied. The user found it confusing and it was dropped: nothing is pre-resolved.)
- **Effects: recipe versus result.** Take a torso that gives armor per enemy within a radius. What it does (the recipe) is in the definitions, in the part. Whether the player uses it is in the blueprint. How much it gives *now* is **not stored**: a pure function (like `finalSpeed`) computes it every frame from the recipe, the blueprint and the state. Only something with memory goes into the state, such as a buff that lasts some more time.
- Agent's warning: do not store derived values (a final speed, a total damage) in actors for convenience, and keep an eye on lists of active effects, which are the fields that grow the most.
- **Rules (code):** `step` and the `final...` functions. The order of the phases is written in `step`, is the same in every run, and is not stored anywhere.
- The state carries the **version of the definitions** it was made with (`state.definitionsVersion`, from `DEFINITIONS_VERSION`, raised by hand on any change). Nothing refuses a mismatched state yet.

### The kit of parts

The user asked for the kit with **only what is used now**: weight, speed, health, defense, the dash strength and the capacity. Radar, Magnet, the shield and the weapons are not in the code yet.

- Each part in `DEFINITIONS.parts` has a `weight` and `specs`. The avatar's final values are the **sum of the specs of the parts of its blueprint** (`sumSpec`):
  - top speed (`finalSpeed`) = sum of `speed` - total weight x `weightSpeedPenalty`, never below zero (the agent's floor, so the controls never reverse; whether there is a real minimum speed is open);
  - maximum health (`finalMaxHealth`) = sum of `health`;
  - defense (`finalDefense`) = sum of `defense`;
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

**Objects (rocks, Shrooms) are made by the seed and the formula, and are not stored in the state** (the user's decisions). They are not actors in the code: only the avatar is an actor (`createAvatar`). **One function makes everything that exists in a run (the user's idea, 2026-11-10):** `finalizeObject(type, rolls, blueprint, id)` takes the recipe (the entry of `src/data.js`), what the seed rolled and the blueprint, and returns the complete object; the avatar and every object from the seed come out of it.

- The seed is `state.seed` (a whole number). It is in the state so a snap alone is enough to replay.
- `objectsInArea(seed, left, top, right, bottom)` in `src/sim.js` is a pure function: it returns `{ type, position, square, radius, health: { now, max }, weight, bounce }` for every object whose center is in the area, in a fixed order. The world is cut into squares (`terrain.objects.cellSize`), each with at most one object (`chancePercent`), kept away from the edges of its square by `objectMargin()`, so objects never overlap. No object within `safeRadius` of the starting point. The type is picked from `kinds`, and the radius and the health are rolled inside the `size` and the `healthRange` of that type (`rollInRange`; every roll has its own salt, listed in `objectInSquare`). Looking at a bigger area never changes an object. `square` says which object it is.
- `hashInts(seed, x, y, salt)` makes the numbers: only `Math.imul`, xor and shifts, so it is exact in every browser (no trigonometry, no `Math.random`). A **known answer** for one seed is fixed by a test, and DATA in Chamber 2 prints the same objects; the user compared them in his Chrome and they were identical.
- The kinds are entries of `DEFINITIONS.objects` (the **rock** and the **Shroom**), each an independent set of ranges. The definitions have exactly three things, the avatar, the rock and the Shroom: stone, boulder, rubber rock and the training dummy were the agent's inventions and were **removed**, and so was every hand-placed object and every fixed value of an object (the user's rule: no leftovers, no placeholders).
- **Objects have health (the user's decision):** each object rolls a whole number inside the `healthRange` of its type from the seed. An object comes from the formula at full health and carries it as `health: { now, max }` (the user's mold: everything with a variable amount has a now and a max: health, shield, ammunition...), both equal at creation; only a **hurt** object is in the state, in `state.damagedObjects`, a plain object from `"squareX,squareY"` to its current health (the `now` of a hurt object; the object itself is made again from the seed and so keeps its full values). An object at zero is **broken** (the agent's choice; the user did not say what happens at zero): it is not drawn and nothing collides with it. The hit that breaks it has no collision response (the actor is not pushed or bounced and keeps its speed), but still hurts the actor. Health numbers are drawn above any hurt object.
- Planned (the user's ideas, **not implemented**, in this order): collision between moving actors with **mass** (the avatar's mass is the total weight of its blueprint, so a heavy mecha pushes light enemies); the user wants the **dash force to push enemies a little and open space** when surrounded, and he wants the tension of being surrounded; later three kinds of dash: normal, **blink** (goes through rocks) and **charge** (breaks rocks). Agent's cautions: pushes in a chain need a fixed order and a limit of iterations; the rock formula must be reviewed if rocks are ever generated outside the collision window.

### Collision with still things

`collideWithObjects` in `src/sim.js`, called in `step` right after the movement of each actor that has `move`. The things it tests are the objects near the actor (found by the formula, not the broken ones).

- Circle against circle. The *normal* is the unit vector from the thing to the actor. The actor is pushed along the normal until it just touches the thing.
- The velocity is split into the part going **into** the thing (along the normal) and the part going **along** it. The part going in becomes `-bounce x` itself, and the part along is **not changed**. So no bounce cancels the reflection only and the actor **slides** (the user's definition: "bounce 0 is not friction 1, it does not stop movement, it only cancels the reflection"), and the angle matters. Friction does not exist; it could become another value per thing later.
- **Bounce (the user's decisions):** only the **Shroom** has a bounce for now; everything else has none (the rock). A bounce is **never above 1**, or the thing would eject whoever hits it, like a spring (`assertValidDefinitions` fails above 1). The Shroom's bounce grows **in a straight line with its radius**, from a minimum at the smallest radius to 1 at the largest (`finalBounce` in `src/sim.js`, made into the object at its creation; the two ends are `bounce` in the definition). The user's first idea was a bounce from 1 up, and he dropped it: it ejects.
- **Collision threshold (the user's decision):** the collision only happens when the speed going into the thing (the impact) is at least `collision.minImpact` ("1 for now", to be found by playing). Below it **nothing triggers**: no hit and no bounce, and the actor just stops against the thing (the part going in is removed). Its purpose is to avoid several contacts in a row. Bounce and weight are properties of the still actor and have nothing to do with each other: any still actor (a block in its nature, not a "rock" with sizes) has a weight (and, if it has one, a bounce).
- When the collision happens, the **body slam** hurts both sides before the bounce (see "Damage").
- The objects are tested in the fixed order of `objectsInArea`; a corner between two objects is resolved over the next frames. See "Relations" for the speed above which an object could be crossed in one frame.

### Damage

```
DAMAGE = max(0, finalAttack - finalDefense)
HEALTH = HEALTH - DAMAGE
```

- A hit by something that has an attack (a weight above 0) always costs at least `bodySlam.minDamage`: the defense never makes the target immune and never heals it. Health stops at zero; there is no death yet.
- `finalAttack` and `finalDefense` are pure functions, like `finalSpeed` (the user's decision): the recipe is in the library, what is equipped is in the blueprint, and the value is computed every time. The functions are `finalAttack`, `finalDefense`, `damageOf` and `applyDamage` in `src/sim.js`.
- **Body slam (the user's decisions, with his first numbers, "to begin with", not validated by play):** a collision hurts **both sides**, each with **its own weight**. Every **collision** is a hit (the user's decision: modular, because speeds will change). There is **no `doesDamage` flag** (the user removed it as a relic of an idea that died): what is harmless is decided by the weight alone, a weight of 0 has an attack of 0 (see "Weight 0"). **Only the moment of the collision hurts, friction does not** (the user's decision): a pair that was already touching in the last frame is friction, and `state.contacts` keeps the pairs of the last frame to tell them apart. Pressing and sliding still push and bounce, but are not new hits. The attack grows with the weight and the impact: `finalAttack = weight of the attacker x bodySlam.attackPerKg x impact / bodySlam.referenceImpact` (**the formula is the agent's provisional proposal, to be discussed with the user**; the two constants are his first numbers). The impact is the part of the speed going into the other thing, so a graze is a weak hit. The weight of the avatar is the total weight of its blueprint; of anything else, `weightPerRadius` x radius of its definition. Later modifiers of the body slam do not exist yet.
- **Weights are whole numbers (the user's rule):** the `weight` of a part, and for an object the `weightPerRadius` and the radii of its `size`, are whole numbers, zero or more, so the weight is whole by construction. `assertValidDefinitions` in `src/sim.js` checks it when the file loads and fails loudly, so a float cannot get into the sums.
- **Weight 0 (the user's idea):** a still thing with weight 0 (a `weightPerRadius` of 0) is harmless and **breaks easily** (a branch, a box). In reality nothing weighs 0, but for a mecha it is the same. It follows from the rules above with no special case: the attack is 0, so it does no damage (the minimum damage only applies when there is an attack); and it breaks with the first hit when its health is not above the minimum damage. A thing that breaks gives no push or bounce, so the mecha goes through it. There is no weight "almost 0": any positive weight hurts at least the minimum damage, so **no actor may have a tiny positive weight** (the user's note: as long as none does, this is fine). The rule is tested with a patched definition; there is no weight 0 type in the game yet.
- **The list of objects (the user's idea):** boxes, rocks, logs, houses and so on are all the same kind of thing, listed in the library as `DEFINITIONS.objects`. **Each entry is complete and has its own numbers; nothing is shared between entries (the user's rule, critical):** there are many objects and every one must be unique, so no value may come from a constant that serves two entries (the agent once did that with a shared size and the user rejected it). **Each entry is only ranges (the user's rule):** `size: { min, max }` (the radius range), `healthRange: { min, max }`, `weightPerRadius`, and what is its own (the Shroom has a `bounce` `{ min, max }`). The entries are the **creation parameters** that the seed rolls for each object placed; an object has no fixed number and no initial state. **Weight follows the radius (the user's decision; first changed from the area to the radius on his idea, because it is easier to read and to balance, and the range of weights is as wide as the range of health):** `weight = weightPerRadius x radius`, both whole numbers, nothing rounded; the weight is computed once, by `finalWeight` inside `finalizeObject`, and stored on the object (`object.weight`). Every object has its own `radius` and carries its own `weight` and `bounce`.
- **The Shroom (the user's idea, a test item):** the object `shroom`: like the rock in the numbers the user gave (the same values, but written in its own entry, not shared), with a bounce that grows with the radius. The seed places it like the rock (`kinds` has both, with the same chance: a guess). Its `healthRange` is a guess, to be tuned by playing. The avatar's body slam hurts it and it hits back with its own weight; it bounces the avatar back by its own `bounce` (made by `finalBounce`).
- **Shield (the user's decision, not implemented):** it is essentially **a health that regenerates**, and it comes primarily from the Generator. Order (the agent's suggestion, the user agreed): the damage is calculated first, **the shield absorbs it first, and what is left goes to health**. It has memory, so it is state. The regeneration rule is not defined.
- **Damage trace (the user's requirement, not implemented):** any change to health must be explainable. The damage is shown as a formula such as `(X + Y + Z) * W`, and every term says where it came from (which skill, part or buff). It feeds the damage audit page. The structure of the trace is not defined.
- The formula will be developed little by little, one piece at a time.
- **Known weaknesses (for the user to decide):**
  - Subtracting the defense is still a flat subtraction: with small numbers a little defense is a large part of a hit, and anything below the defense costs the same `minDamage`.
  - Hits come in whole steps of the attack, so a fine health range for the rocks shows up in play as only a few different numbers of hits.

### Movement and input

The user approved this and noted that everything may change.

- The canvas is **1920 x 1080** (the user's requirement), and world units are canvas pixels. **Chamber 1 is a full-window game view** (the user's requirement: the whole screen is playable): the canvas fills the window and keeps its shape, with black bars if the window has another shape. A small faint label in the top-left corner shows the title, the controls and a BACK button; Esc also goes back.
- The avatar is always at the center of the screen (the camera follows it), drawn as a white circle.
- Move with WASD or the left analog stick. **There is no manual aim** (the user's decision, no mouse and no right stick): the weapons aim by themselves. So the avatar has no `aim` field; a weapon's target will be data of the weapon, later.
- `move.direction` is a vector with length from zero to one. On the keyboard, diagonals are normalized so they are not faster (not confirmed by the user; his old project used another factor).
- Vectors are used instead of angles, so the simulation needs no trigonometry, which can differ between browsers.
- **Movement has inertia** (the user's requirement): the avatar speeds up and slides to a stop. `move.direction` is what the actor *wants*, and `move.velocity` is how it is *really* moving; the velocity has memory, so it is state. Every frame `approach(velocity, target, rate)` moves the velocity in a straight line toward `direction x finalSpeed`, by at most `rate`, and lands exactly on the target when it is within reach. `rate` is the `acceleration` of the actor while it wants to move and its `deceleration` when it does not. Turning around passes through zero, with no jump. Only arithmetic and `Math.sqrt`, so it stays deterministic. The values are exact binary fractions on purpose, so the sums are exact.
- **Top speed is dynamic** (the user's requirement): `finalSpeed(actor, blueprint)` is asked again every frame.
- **Dash** (Space or the gamepad A button, the user's choice), in `updateDash`. It spends one charge and sets the velocity to the direction (always at full length, so a half-tilted stick dashes just as hard) times `finalDashSpeed`. The frame of the dash already moves at the full dash speed. While an actor is faster than its top speed, its speed falls by the **constant** `overspeedDecay` every frame, down to the top speed, and then normal movement takes over. **Any part may add to the dash strength, but the decay is a constant** (the user's decisions), so a stronger dash is also a longer dash. The dash state is `actor.dash = { charges, recharge }`; the maximum and the recharge time are in the actor definition for now. `OVERSPEED_TOLERANCE` keeps the rounding error of a diagonal from counting as "faster than the top speed".
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
- Cell size and window size are **dev settings**, kept in `state.grid` so a run is reproducible. Do not hard-code them elsewhere. Agent's note: a bigger window costs almost nothing, because what costs is the number of actors tested, not the area; so err on the larger side.
- Every actor **stores the cells it covers** in `actor.cells`: `{ from: { x, y }, to: { x, y } }`, a rectangle of cells with both corners included (the user's decision, 2026-11-10: any actor can have several cells, there is no separate list for big ones). It is the rectangle that the square around its circle reaches, so a small actor has one cell (up to four over a border) and a huge one has many. `step` writes it for every actor **after the movement** and before the collisions (`setCells`), and the collision reads it from the actor (the user's rule: read from the object). Whenever a collision pushes a Dummy, its cells are written again at once, so at the end of the step the stored cells are always right (a test checks it).
- Agent's choices, not yet confirmed by the user: cells are counted **relative to the avatar** (it is always in cell zero, and the window stays fixed on screen while the world moves under it); a cell is always a pair of integers, even outside the window, and `isInWindow` says whether one is inside (nothing in the game calls `isInWindow` yet, only the tests).
- Consequences (the agent's reading, to be confirmed). **Not implemented:** nothing enforces the invariant or moves actors back today.
  1. Every actor must always be inside the window, so `isInWindow` becomes an invariant to check (fail loudly), not a filter.
  2. An actor that would leave the window reappears on the opposite side of it. The window is centered on the avatar, so the rule is on the offset from the avatar, and it must match `cellIndex`.
  3. Nobody crosses the seam: actors on opposite edges are not neighbors. It is invisible, because the seam is off screen.
  4. The ground is infinite. Only the population is bounded.
  5. To see the limits of the universe, a debug zoom-out is the way; drawing every cell only produces noise. (The user no longer wants to see the collision boxes, and the overlay was removed.)
- **Who uses the grid:** the collision between Dummies, and between a Dummy and the avatar (`collideDummies`). Two actors are tested only if they share a cell. The index (cell to the Dummies that cover it) is made again every step from `actor.cells`; it is not state. The result is **exactly** the one of testing every pair in list order (tests compare the whole state), including a Dummy pushed into a third one in the same step: that is why the cells are written again after every push and the next Dummy to test is asked again after every test (`nextInCells`). Keep that property: the grid is a faster way to the same result, never a different rule. The collision with **objects** still finds them by the formula of the seed (`objectsNear`), not by the grid; with many Dummies that search is now the largest cost of a step.
- The wrap exists for the Dummies only (`wrapIntoWindow`): the window is the real area of the game, and a Dummy that leaves it on one side comes back on the opposite side. The invariant for every actor is still not checked.

### The Dummy

The user's idea (2026-11-10): a test actor that does not attack, made to see many things colliding. Numbers are in `src/data.js` (`DEFINITIONS.actors.dummy` and `DEFINITIONS.terrain.dummies`), with their reasons; nothing is repeated here.

- **Made by the seed, lives in the state.** `createDummies` (called by `createChamber1State`) makes `count` Dummies through `finalizeObject("dummy", …)`, the same function as everything else. The seed rolls radius, health, first angle and position (the salts 11 to 15 are in the code, with the number of the Dummy and the try). Its speed comes from its recipe through `finalSpeed`, and the Dummy carries it. Ids are `dummy_0`, `dummy_1`, and so on.
- **Where:** inside the window of the collision grid around the avatar (the real area of the game, the user's decision). A place that is taken (another Dummy, an object, too close to the avatar) is refused and the seed tries another; after `placementTries` the game fails loudly.
- **How it moves:** it walks in a straight line at its speed (no acceleration), pointing at `wander.angle`, in whole degrees. `wander` is `{ index, angle, turns }`. At every **new** collision (with an object that is still whole, with the avatar, or with another Dummy) it gets a new angle, `hash(seed, index, turns) % 360` (the user's `rand(360)`, but from the seed, so the run is reproducible). A pair that was already touching in the last frame still pushes it out, but does not turn it (the same contact rule as the avatar's hits).
- **Sine and cosine** come from our own series (`sinDegrees`, `cosDegrees`), with additions and multiplications only, because `Math.sin` may differ in the last digits between browsers.
- **Wrap:** a Dummy that leaves the window comes back on the opposite side (`wrapIntoWindow`), around the avatar wherever it is.
- **Collisions hurt both sides (the user's decision, 2026-11-10) with the same body slam as the avatar's** (`damageOf`, see "Damage"): at a new contact whose impact reaches the minimum, the Dummy and the other thing (an object, the avatar or another Dummy) each hurt the other with their own weight. The impact is the speed at which the two close in on each other (the difference of their velocities along the line between the centers); an object does not move. The Dummy weighs by the same rule as the objects (weight per radius times radius), from its own recipe. Health stops at 0: there is no death yet, so a Dummy at 0 goes on walking. An object that breaks in the hit has no collision: the Dummy is not pushed and does not turn. A contact below the minimum impact turns the Dummy but hurts no one. The avatar is not pushed by a Dummy (not decided).
- **Drawn** as blue circles by `drawDummies` in `src/render.js`. The window is twice the screen, so about a quarter of the Dummies are on screen at a time.
- Tests: 80 to 101 in `tests/agent/README.md`. Most tests play in a game with no Dummies (`count` 0 in a patched copy of the data), because a wandering Dummy also hurts rocks; the Dummy tests use the real data (with 100 Dummies, to stay fast).

### Actor

An actor is any entity that can act in combat. Today the avatar and the Dummy are the only ones. A thing without `move` (a trap, for example) would be a static actor, but none exists, so nothing in the game handles it.

An actor **in the state** holds **its own value for everything it uses** (the user's rule, 2026-11-10: "always check the object itself", everything can change in a run: a druid that becomes a giant bear, a bigger mecha): `id`, `type`, `radius`, `position`, `cells` (see "Collision grid"), `health` (`{ now, max }`, the user's mold: almost everything has a now and a max), and, if it has them, `move` (`direction`, `velocity`), `acceleration`, `deceleration` and `dash` (`charges: { now, max }`, `recharge`, `rechargeFrames`). The avatar does not read its definition while it plays (a test proves it): `createAvatar` gives it a copy of each value, made by a final function (`finalRadius`, `finalAcceleration`, `finalDeceleration`, `finalDashRechargeFrames`, `finalDashMaxCharges`, `finalMaxHealth`), and the rest of the code reads the actor. The definitions only hold the base (and the parameters of creation); the shape of each type is its `initial` in `src/data.js`. The maximum health, defense, top speed and dash speed of the avatar come from the parts of its blueprint. An object (rock, Shroom) also holds its own `weight` and `bounce` (the user's decision, 2026-11-10: "use the formula when making the object, and then it becomes the reference"): `finalizeObject` computes them from its own radius with `finalWeight` and `finalBounce`, and the collision reads `object.weight` and `object.bounce`, never the definition. The avatar holds its `weight` too (the total weight of its blueprint) and a `bounce` of 0. The attack (`finalAttack`) reads the `weight` of the attacker. What the avatar still computes every frame from the blueprint (not stored): top speed, dash speed, defense.

## Code layout

- `index.html`, `style.css`: the screens.
- `src/data.js`: the definitions (`DEFINITIONS`, `DEFINITIONS_VERSION`), frozen. Every value has its reason beside it.
- `src/sim.js`: the rules. No DOM access. Things (`definitionOf`, `findDefinition`, `finalizeObject`, `createAvatar`); the blueprint (`partsOf`, `totalWeight`, `sumSpec`, `assertValidBlueprint`, `createRun`); the final values (`finalRadius`, `finalAcceleration`, `finalDeceleration`, `finalDashRechargeFrames`, `finalWeight`, `finalBounce`, `finalSpeed`, `finalDashSpeed`, `finalDashMaxCharges`, `finalMaxHealth`, `finalDefense`, `finalAttack`); damage (`damageOf`, `applyDamage`); movement (`updateDash`, `approach`); objects (`hashInts`, `rollInRange`, `objectMargin`, `objectInSquare`, `objectsInArea`, `objectHealth`, `isObjectBroken`, `damageObject`); collision (`objectsNear`, `collideWithObjects`); the Dummies (`sinDegrees`, `cosDegrees`, `setHeading`, `turnDummy`, `wrapIntoWindow`, `isPlaceTaken`, `createDummies`, `moveDummy`, `touchDummy`, `collideDummies`); the grid (`cellIndex`, `isInWindow`, `assertValidGrid`, and the cells of an actor: `setCells`, `shareCell`, `addToCells`, `removeFromCells`, `nextInCells`); `createChamber1State(runId, seed, blueprint)` and `step(state, input, blueprint)`. `step` changes the state in place (the agent's choice, to avoid copying the state every frame).
- `src/history.js`: the run history: `createHistory(state, blueprint)`, `recordFrame`, `stateFromSnap`, `discardAfter`, `crossCheck`. No DOM access.
- `src/input.js`: reads keyboard and gamepad, and returns `{ move, dash }` for the frame.
- `src/render.js`: draws the state and never changes it.
- `src/chamber-2.js`: the test bench of Chamber 2. The text builders do not touch the page; only the end of the file does.
- `src/main.js`: screen navigation and the Chamber 1 loop (it also records the history every frame).
- `tests/agent/`: tests **written and defined by the agent**, not by the user. `sim.test.js` tests the rules, and `README.md` explains each test in plain words, with the worked numbers. `benchmark-grid.js` measures the collision grid (it is not a test). Any other kind of test the user writes later should go in its own folder.
- These are plain scripts, loaded in order by `index.html`, and they share globals. They will become modules when the simulation also needs to run in Node outside the tests.

## Ideas (agent proposals, not decided)

They only become decisions when the user approves.

- **Damage pipeline with recorded stages:** each stage notes what it did. It serves the audit page and testing synergies.
- **Step as a list of named phases**, for example: inputs, spawn, movement, collision, damage, remove the dead. No phase calls another, and the order is written in one place only.
- **Machine learning:** the source is the collection of snaps (the user's decision). Agent proposal: a separate export module that only reads the state and produces numeric data, and that never changes the simulation. Values ML will want (damage dealt in the frame, kills) should be numeric counters in the state. The reward definition and the observation format are left for when ML enters the project.
- **Practical requirements for determinism:** randomness only from a seed stored in the state; no `Date.now` or `performance.now` inside the simulation; actors always processed in a fixed order; avoid `Math.sin`, `Math.cos` and `Math.pow`; state without `NaN`, `Infinity` or `undefined`.

## Open items

- **Agreed order of work (critical review of 2026-11-10):**
  1. Stop adding rules until the user has played Chamber 1 and said how inertia, dash, collision and body slam feel. None of these layers was validated by play, and each was tuned on top of the one before.
  2. Pause and one-frame advance (the history already exists, there are no buttons yet).
  3. A **damage trace** of real hits on screen, each hit written as its own arithmetic, coming from the simulation itself. This replaces the idea of printing static arithmetic of the body slam in DATA, which would be one more copy of the numbers.
  4. Only then decide the known weaknesses listed in "Damage", "The kit of parts" and "Collision with still things".
- The user has not yet confirmed in his Chrome the final position of the SIMULATION CHECK since inertia was added. The scripted run has no dash and never releases the keys, so the dash and the deceleration are only tested in Node; changing the script changes the final position.
- Parts still to come in the code: Radar, Magnet, the shield, the weapons, and the recharge of the dash.
- The attack of weapons, death, and the shield.
- Collision between moving actors with mass and the dash opening space (the Dummies only turn and hurt; the avatar is not pushed by them); and the window as the universe for every actor (the invariant; the wrap exists for the Dummies only).
- **Huge actors (the user wants them: radii several times a cell, or more).** The grid already handles any radius (several cells per actor, tested with huge Dummies). Still open, and the user has not decided them: (1) an object of the seed cannot be huge, because each one is placed inside one square of `terrain.objects.cellSize` with a margin of the largest radius; (2) the search of objects near each Dummy (`objectsNear`) is the largest cost left in a step. **Decided by the user (2026-11-10):** a huge actor never shows on both sides of the window. Every actor, whatever its size, wraps only when its **center** leaves the window (what `wrapIntoWindow` already does), and no actor will ever be larger than the space between what is on the screen and the edge of the window, so the jump always happens off screen. That makes the smallest margin between the screen and the edge of the window the limit of the radius of an actor. A test (101) reads every actor recipe in the definitions and fails if one allows a larger radius (the user asked for a test on the definitions, so such an actor cannot be made in the first place). It does not look at the objects, which do not wrap, and nothing stops code from writing a larger radius on an actor during a run. A new actor type, a change of the canvas or of the window must keep that test passing. A consequence to know: an actor that wraps can land on top of another one on the other side; the collision pushes them apart there, off screen, like any other overlap.
- A Dummy at zero health goes on walking (there is no death yet).
- Move `src/data.js` to the library structure.
- Running the cross-check automatically.
- The user's second monitor is stuck near 60 Hz (parked; not a problem of the game).

## Handoff (2026-11-10, written by one agent for the next)

What changed last, and what to keep in mind when picking the work up. Remove or rewrite this section when it is stale.

**What was done**

- The Dummies (see "The Dummy"), their damage, the stress setting (count and size are in `src/data.js`), the fps counter.
- The collision grid is in use between Dummies and between a Dummy and the avatar, with **several cells per actor** (`actor.cells`, see "Collision grid"). The earlier design (one cell per actor, looking at the neighbor cells) and its rule of a minimum cell size are gone; so are the `dash` and `pair` scenarios of the benchmark, which only measured that rule.

**Properties to keep (tests guard them)**

- The grid gives exactly the state of testing every pair in list order (tests 95 and 98 compare the whole state; 99 builds the case of a Dummy pushed into a third one). If a change breaks that, it changed a rule, not only the speed: stop and tell the user.
- `actor.cells` is always right at the end of a step (test 100), because the collision reads it from the actor.
- Most tests play in a game without Dummies (`withDummies(0)` in `tests/agent/sim.test.js`); a wandering Dummy hurts rocks and would change their counts.

**Open, for the user to decide (raise one at a time, when it comes up)**

- The two open points under "Huge actors" in "Open items" (the wrap of a huge actor is decided, see there).
- The avatar is not pushed by a Dummy, and a Dummy at zero health goes on walking.
- `isInWindow` is called by nothing in the game (only by tests). By the user's rule that what is not used dies, it is a candidate to remove; it was left because the invariant "every actor is inside the window" is still planned.

**Mistakes made in this stretch, so they are not repeated**

- A patch of the data by `text.replace` stopped matching after the data changed, silently, and every test played with the full number of Dummies. `withDummies` now fails loudly; the other patches passed to `loadGame` still do not check that they matched. Check the match when writing a new one.
- An edit of `tests/agent/README.md` replaced a heading by accident. Read the diff of the docs before committing.
- A claim was made from a random run that never met the worst case ("this cell size holds"). Only a case built on purpose, or a proof, shows a limit. Say which of the two a statement rests on.
- When a test is meant to guard something, break that thing once and see the test fail (it was done for the rewriting of the cells: tests 99 and 100 fail without it).

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
- After changing something visual, ask the user to open it and describe what he sees and feels. For anything that can be printed as text, add a button to Chamber 2 and ask the user to paste its output.
