# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

Each paragraph here says the rule of today; how a rule changed (older versions, dates, parcels, the user's words at the time) is in `docs/decisions.md` (issue 66).

## The two foundations (read these first; the user: "the base of everything")

> **1. Go slowly and deliberately.** The goal is the calm making of a model project, not reaching the end. Clarity wins over speed.
> **2. Break every big task into small steps, each one closed before the next.** Tests green, committed, pushed and noted here, so the work can stop after any step.

The full text of each, with its reason:

- **1. The aim and the pace of the project (the user, 2026-11-13; it comes before the other rules of this section).** The problem here is often contemplative, not one of speed. The aim is not the end of the project but the calm making of it, pruning each branch without hurry: a project that can be a **model of how a game like this can be organized**, inclusive, so that people can take it apart and learn from every decision and every difficulty, and so that anyone who comes to work with him can walk in it knowing the ground is safe. The user may need to earn money from it someday, but that is not the measure. So: the agent does not optimize for a fast and efficient answer (it was trained to be rewarded for that, and it is not the goal here); it goes slowly, one thing at a time, says what each change is for, leaves no change half explained, and keeps the files, the tests, the reasons beside the numbers and the history readable by someone who was not there. When speed and clarity pull apart, clarity wins.

- **2. How to break a big feature into steps (the method that built the sword, 2026-11-13).** Split it into small steps, each one finished on its own: the smallest pure piece first (a helper with tests), then the data, then the rules, then the drawing, then the docs. Each step ends with the tests at `fail 0`, a row per test in the README, a commit, a push, and a line in `AGENTS.md` saying what is done and what comes next, so the work can stop after any step and anyone can resume. The user's usage can end at any moment, and a half-finished step is what makes work hard to resume. Do one step, close it, then the next; do not carry two open at once.


**This file has no game values (the user's rule).** It says what was decided, why, and **where each number lives**. The values, each with its reason and who chose it, are in `src/data.js` (and in the few named constants listed in "Where the numbers are"). Do not copy a value into this file: write the rule with the **name** of the number (for example `weight = weightPerRadius x radius`). The only numbers allowed here are the fixed decisions of the concept (steps per second, the canvas size, the length of a map). Worked examples with numbers belong in `tests/agent/README.md`, where a test fails if they drift.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state (2026-11-12): the game is **public and online** (`https://dupuqub.github.io/varpg/`, published from `main` by a workflow that runs the tests first; see "Publishing"). Screen navigation (main menu, test chambers list, Chamber 0 diagnostics and the played Chambers 1 and 2), with pause, one frame back and forward, fullscreen, and keyboard, gamepad and touch controls. In Chamber 1 the avatar is always at the center of the screen, moves with inertia, dashes, collides with the objects of the seed (rocks and Shrooms, all placed by seed and formula, in layers, none by hand) and with the Dummies (test actors made by the seed, born from the map's spawn events off the screen, wandering and wrapping around the window of the grid), and collisions with the avatar hurt (the body slam); actors push each other by weight. The avatar's values are sums over the mecha parts of its blueprint. The collision grid (several cells per actor) is used between actors. In Chamber 2 the Dummies are replaced by Biters, born from the map's spawn events (a crowd after the first step, then waves), enemies that chase the avatar and bite with a hitbox; damage is a packet by type that the target resists by points; the avatar has an auto-aiming repeater whose ammunition weighs, and a shield from the Generator whose ring is its radius. See "Code layout". **More than one agent may work here: read "Working with several agents" and `docs/desks.md` before the first change.**

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
| Values equal for everyone (`overspeedDecay`, `collision.minImpact`, `bodySlam.attack`, `bodySlam.referenceImpact`, `weightSpeedPenalty`) | `DEFINITIONS.constants` |
| Damage rules (`damage.resistanceScale`) and the types of damage (the order is the order of calculation) | `DEFINITIONS.constants.damage` and `DEFINITIONS.damageTypes` |
| The resistance of the avatar, by type | the `resistance` spec of each part in `DEFINITIONS.parts` |
| The shield (maximum, wait, rate, resistance while it lasts) and the size of its ring (`shield.ringScale`) | the Generator's specs in `DEFINITIONS.parts`, and `DEFINITIONS.constants.shield` |
| The Biter (`size`, `healthRange`, `weightPerRadius`, `speed`, `acceleration`, `deceleration`, its `attacks.bite`: damage, reach, freeze frames, hitbox) | `DEFINITIONS.actors.biter` in `src/data.js` |
| When, how many and which actors each map summons (the spawn events: `initialFrame`, `count`, `type`) | `DEFINITIONS.maps.<map>.spawns` in `src/data.js` (Chamber 2: `maps.chamber2`) |
| How the ground is filled with objects, one entry per layer (`cellSize`, `chancePercent`, `safeRadius`, `rareKinds`, `kinds`) | `DEFINITIONS.terrain.objects.layers` |
| Objects (rock, Shroom, Branch: each entry is a set of ranges, `size` `{ min, max }`, `healthRange`, and `weightPerRadius`; the Shroom also has `bounce`) | `DEFINITIONS.objects` |
| The Dummy (`size`, `healthRange`, `weightPerRadius`, `speed`, `acceleration`, `deceleration`) | `DEFINITIONS.actors.dummy` in `src/data.js` |
| How many Dummies (the `count` of the one spawn event of Chamber 1, at frame 0) | `DEFINITIONS.maps.chamber1.spawns` in `src/data.js` |
| Collision grid and the size of the screen as the rules know it (`screenWidth`, `screenHeight`, `cellSize`, `windowWidth`, `windowHeight`) | `constants.grid` in `src/data.js` (the state keeps a copy, `state.grid`, written by `createChamber1State`); `src/main.js` fails loudly if the canvas has another size |
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
- The `safeRadius` of every layer must stay above the distance of the first dash plus the avatar radius **at birth, with the shield full (the ring)** plus the largest object radius of that layer, **for every blueprint in the data** (a heavier blueprint has a lower top speed, so its dash lasts longer and goes farther), or the first dash can hit an object. Test 169 plays the dash of every blueprint and fails otherwise (review of 2026-11-13, point 1).
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
  - **Head:** the primary source of the **Radar**, the circle around the avatar that says who can be targeted by the automatic weapons. **Built (the user, 2026-11-13): the Radar is the only truth about what can be aimed at; a weapon has no range of its own.** The spec `radar` (px) is summed from the parts into `avatar.radar` (static), `pickTarget` uses it as the range of the avatar's weapons (a Radar of 0 sees nothing; test 154), and the screen draws it as a white circle with no fill.
  - **Torso** (the name stays "torso"; "core" was only a nickname): the physical case, **a tough case with a motherboard that holds the processor**. It has the weight capacity, a small contribution to speed, and is the primary source of the **Magnet**: the radius within which things that fall on the ground are pulled to the avatar, as in Vampire Survivors.
  - Any part can add to speed, to the dash strength and to the Magnet.
- **Processor:** it holds the **skill tree**, and the player can own several, a box of processors: **each processor is a build**. The torso is the hardware and the processor is the software. **Swapping the processor does not swap the parts** (the user's rule). Planned, **for the future and not developed**: a dialog on installing a processor that asks which parts the player wants to bring from that processor's last installation, and a check of which of those parts are available.
- **Health (the user's decision):** the `Armor.Max` of the old project was a part's contribution to the maximum health. The code keeps the name **health**, because it is universal (every actor has it), and "armor" is only how it is **presented to the player** (a label in one place in the library). The old project had no defense spec.

### Screens

Keep everything simple. Screens are HTML and CSS, and only one is shown at a time.

- **Entry screen** with three buttons: NEW GAME, CONTINUE and TEST CHAMBERS. NEW GAME and CONTINUE do nothing yet (they are disabled).
- **TEST CHAMBERS** is another screen, where the user picks which test map to run. Every chamber has a name after its number, shown on the list and as its title (the user's rule; give a name to each new chamber).
- **Chamber 1: Movement** is a movement test and, by the user's decision, the first combat test too (colliding with the objects of the seed). It is a full-window game view (see "Movement and input" in docs/rules/movement.md).
- **Chamber 2: Combat** (the user, 2026-11-11): the same world as Chamber 1 (rocks and Shrooms from the seed) with no Dummies and with Biters instead, to test combat. Its HUD is plain text (health, shield, weight, the weapon's rounds, the dash). It has its own canvas (`canvas-2`), the same size as the first, and `src/main.js` runs the chambers that are played from one table (screen id, canvas id, function that makes the state). **The death on the screen (the user, 2026-11-14, issues 25 and 42; built):** the shown state decides (`missionAborted()` in `src/main.js` reads `state.mission`, the same for every chamber). In Chamber 2 an alert, ABORT MISSION with one button back to the menu, appears over the game. The top-bar buttons stay and nothing replaces them: the frames stop (the frame of the death is drawn once), the pause/play toggle is disabled, forward is disabled on the frame of the death, and back and forward through the saved snaps still work. Play from an earlier frame goes on and undoes the death (the history is a debugger for now). Chamber 1 has no alert: its status text in the bar starts with ABORTED, which is enough for a movement test. A touch on the alert belongs to the page, like the bar.
- Chambers are not necessarily places in the game. **Chamber 0: Diagnostics** is a test bench (numbered 0 by the user because it is the base under the game chambers, and it comes first in the list): buttons that run something in the real browser and print plain text into a box, with a COPY button, so the user can paste the output to the agent. Buttons: ENVIRONMENT (browser, screen, gamepads, frame callbacks per second), SIMULATION CHECK (a scripted run played twice, the history and the cross-check, including a snap changed on purpose to see that the check notices it, and the final state), DATA (the definitions, the blueprint with the arithmetic of each final value of the avatar, the rocks of the first screen and the initial state) and COMBAT REPORT (a fight played with the journal on; it prints the totals by kind of hit, how many hits took nothing, every hit that broke the shield with both of its calculations, and the last hits). The scripted run uses no trigonometry, so every browser must print the same final position; compare outputs between machines or against a Node run.

### Stack

- JavaScript, HTML and CSS for the UI; canvas 2D for sprites and tiles. The canvas only draws.
- Maximum simplicity: no game engine or library. Plain JavaScript (the user feared TypeScript would complicate the project).
- Own simple collision: absolutely everything is a circle for collision. There are no walls. If scenery is ever needed, it is made of static circle actors.

### Simulation

Moved to docs/rules/state.md (summary pending).

### State, definitions, blueprint and rules

Moved to docs/rules/state.md (summary pending).

### The kit of parts

Moved to docs/rules/parts.md (summary pending).

### Parts made by seed (the user's idea, not implemented)

Moved to docs/rules/parts.md (summary pending).

### The library (names agreed with the user)

Moved to docs/rules/parts.md (summary pending).

### The world: seed and objects

Moved to docs/rules/world.md (summary pending), with "Collision with still things" and "Collision grid".

### Damage

Moved to docs/rules/damage.md (summary pending).

### Movement and input

Moved to docs/rules/movement.md (summary pending).

### Run history (two logs)

Moved to docs/rules/state.md (summary pending).

### Spawn

Moved to docs/rules/spawn.md (summary pending).

### Actor

Moved to docs/rules/actor.md (summary pending), with "The Dummy".

### Weapons and equipment (the user, 2026-11-11; the full reference is `docs/weapons.md`)

Moved to docs/rules/weapons.md, with "Shots and objects" (summary pending).

## Code layout

- `index.html`, `style.css`: the screens.
- `src/data.js`: the definitions (`DEFINITIONS`, `DEFINITIONS_VERSION`), frozen. Every value has its reason beside it.
- `src/version.js`: `BUILD` (the commit and the time of the publication; "local" when the files are opened on a computer). The publishing workflow stamps it in the copy it publishes; nothing in the game reads it. It is shown on the entry screen ("BUILD <commit> · <time> · data v<version>", made by `buildText` in `src/chamber-0.js`) and printed by ENVIRONMENT, so the user can tell which version he is playing.
- `src/sim.js`: the rules. No DOM access. Things (`definitionOf`, `findDefinition`, `finalizeObject`, `createAvatar`, `isAvatar`); the visual state (`createVisual`, `traceHitbox`, `ageVisual`); the tags (`tagsOf`, `ignoresTarget`, `bodyHurts`, `hitboxHurts`); the combat journal (`combatJournalHitLine`, `combatJournalResumeLine`, `combatJournalStartLine`, `combatJournalAbortedLine`, `combatJournalBirthLine`, `combatJournalSpawnErrorLine`, `combatJournalTotals`, `nameOf`); the journal of the hits (`createJournal`, `recordHit`, `landHit`, `canTakeHit`, `slamActor`, `slamObject`); the blueprint (`partsOf`, `totalWeight`, `sumSpec`, `sumResistance`, `sumShieldResistance`, `fromParts`, `assertValidBlueprint`, `createRun`); the checks of the definitions at load (`assertValidDefinitions`, `checkExit`, `checkTarget`, `checkNoWeight`, with the lists they read: `PART_SPECS`, `TARGET_PICKS`, `EXITS`, `HITS`, `ATTACK_KEYS`, `HITBOX_ATTACK_KEYS`, `CHECK_ATTACK_KEY`); the final values (`finalizeStatic` and `finalizeDynamic`, which write them into an actor; `finalRadius`, `finalAcceleration`, `finalDeceleration`, `finalDashRechargeFrames`, `finalWeight`, `finalBounce`, `finalSpeed`, `finalDashSpeed`, `finalDashMaxCharges`, `finalMaxHealth`, `finalResistance`, `finalAttacks`, `finalAttackNow`, `finalAttack`, `carriedWeight`, `loadedAmmoWeight`); the shield (`writeShield`, `shieldAlive`, `finalShieldRadius`, `regenerateShield`); damage (`resolveDamage`, `applyDamage`, `packetOf`, `writeResistance`); the attack records (`attackKeys`, `checkAttackKeys`, `checkHits`, `attackRecipes`); the weapons (`weaponStates`, `meleeStates`, `addWeaponAttacks`, `pickTarget`, `tagIndex`, `fireWeapons`, `swingMelees`); the spawn events (`spawnEvents`, `spawnActor`); the Biters and hitboxes (`think`, `emitStrikes`, `hitboxOrigin`, `exitGap`, `spawnHitbox`, `circleTouchesCone`, `hitboxTouches`, `hitboxHurts`, `firstTouchAt`, `hitsThisFrame`, `resolveHitboxes`, `destroyActor`, `worldStops`, `removeDestroyed`, `reactToNewContact`); movement (`updateDash`, `approach`); objects (`hashInts`, `objectLayers`, `objectMargin`, `layerKinds`, `kindInSquare`, `rollInRange`, `objectInSquare`, `isUnderBiggerLayer`, `objectsInLayer`, `objectsInArea`, `objectsReaching`, `objectKey`, `objectHealth`, `isObjectBroken`, `damageObject`, `breakObject`, `crushObject`, `breakWeightless`); collision (`contactBetween`, `objectsNear`, `collideWithObjects`); the Dummies (`sinDegrees`, `cosDegrees`, `setHeading`, `turnDummy`, `wrapIntoWindow`, `birthOffset`, `drawBirth`, `spawnedActorId`, `OWN_ROLLS`, `pushShare`, `touchActors`, `collideActors`); the grid (`cellIndex`, `assertValidGrid`, and the cells of an actor: `setCells`, `shareCell`, `addToCells`, `removeFromCells`, `nextInCells`); `SALTS` (every salt of the seed has a name there; never write a bare number), `createChamberState` (the common part), `createChamber1State` (no actor but the avatar at frame 0: its Dummies come from the spawn event of `maps.chamber1`), `createChamber2State` (no actor but the avatar at frame 0: its Biters come from the spawn events of `maps.chamber2`) and `step(state, input, blueprint, visual = null, journal = null)` (stages 0 to 5 are `playStages`, which returns early when the avatar dies; stage 7b is `spawnEvents`). `step` changes the state in place (the agent's choice, to avoid copying the state every frame).
- `src/history.js`: the run history: `createHistory(state, blueprint, visual)`, `recordFrame`, `stateFromSnap`, `visualFromSnap`, `discardAfter`, `crossCheck`. No DOM access.
- `src/input.js`: reads keyboard and gamepad, and returns `{ move, dash }` for the frame.
- `src/render.js`: draws the state and never changes it.
- `src/chamber-0.js`: the test bench of Chamber 0. The text builders do not touch the page; only the end of the file does.
- `src/main.js`: screen navigation and the loop of the chambers that are played, 1 and 2 (it also records the history every frame, and has the pause, back and forward buttons).
- `tests/agent/`: tests **written and defined by the agent**, not by the user. `sim.test.js` tests the rules, and `README.md` explains each test in plain words, with the worked numbers (a test checks that every test has its row). `benchmark-grid.js` and `benchmark-layers.js` measure the collision grid and the layers of the ground (they are not tests). Any other kind of test the user writes later should go in its own folder.
- `tests/screen/check.js`: the checks of the Screen desk, one per parcel of its work order (`docs/screen-plan.md`): T1 and T2 run in Node, T3 and T4 drive a real Chrome (puppeteer-core). They are not tests of the rules and `node --test` does not run them.
- `docs/screen-plan.md`: the Screen desk's work order (2026-11-15): its open issues cut into parcels, each with its model and its check, for a Haiku coordinator.
- `docs/desks.md`: which conversations (desks) to open, what each may change and how they stay out of each other's way.
- `docs/base-plan.md`: the plan for the base (2026-11-14): small parcels with a recipe and a model each, and the checklist a coordinator follows by calling helpers.
- `docs/issues-plan.md`: the open issues of 2026-11-14 (parcels I1 to I15) and of 2026-11-15 (I16 to I28) cut into parcels, each with its model (haiku, sonnet, opus), for a coordinator to follow (all the Rules parcels are marked done); the questions waiting for the user (none now) and the Screen desk's parcels are listed apart.
- `docs/decisions.md`: the history of the rules of this file (issue 66): when a rule changes, the older version moves there, with the section it came from.
- `docs/method.md`: the method of small parcels, a coordinator and helpers on the right model. `docs/step-order.md`: the order of a step, a contract. `docs/weapons.md` and `docs/weapon-families.md`: the user's vision of weapons, and the preparation of swords, spears and hammers. `docs/reference/`: relics of the old project, not rules.
- `docs/`: reviews written by an agent at the user's request (the later passes of the Review desk are `docs/review-2026-11-13.md`, `docs/review-2026-11-14.md` and `docs/review-2026-11-16.md`). `docs/review-2026-11-11.md` is the map of the relations in the code, the fragile ones included, the tensions in the structure, the costs measured and what the direction of the game asks of today's code. **Read it before adding a rule.** Delete from it what gets solved.
- These are plain scripts, loaded in order by `index.html`, and they share globals. They will become modules when the simulation also needs to run in Node outside the tests.

## Ideas (agent proposals, not decided)

They only become decisions when the user approves.

- **Damage pipeline with recorded stages:** each stage notes what it did. It serves the audit page and testing synergies.
- **Step as a list of named phases**, for example: inputs, spawn, movement, collision, damage, remove the dead. No phase calls another, and the order is written in one place only.
- **Machine learning:** the source is the collection of snaps (the user's decision). Agent proposal: a separate export module that only reads the state and produces numeric data, and that never changes the simulation. Values ML will want (damage dealt in the frame, kills) should be numeric counters in the state. The reward definition and the observation format are left for when ML enters the project.
- **A bot, then a small learned model that tells how to play (the user's idea, 2026-11-12; later, not started; he will say when).** First a **bot**: a function that reads the state and returns the input of each frame, with a few simple policies (stand still, run from the closest enemy, dash when surrounded), played in Node with no screen. A run is `seed + blueprint + inputs`, so every game it plays is reproducible and can be played again by anyone. Then, from the games of the bot, a **small model** (the user knows Python) that gives **real information and weights about how to play**: which signals (enemies close, shield left, ammunition, weight) the choice of moving, dashing or standing depends on, and how much. The agent's reading, to confirm with him when it starts:
  - **Order:** bot and a table of results first (survival time, shield time up, kills, ammunition spent, damage taken per second), then episodes written as plain numbers, then the model. Each step is useful alone, and the table is also the bench of weapons already planned.
  - **What it is for:** to measure whether a number of `src/data.js` meets the target written beside it, and to compare weapons and blueprints on equal terms. It does not replace the user's feel of the game: a bot is a bad player in a specific way, and a model learns to play **for the reward it is given**, so a weak weapon may only mean a weak policy, and a reward that forgets something (the user's axis of the player's time, for example) will be exploited.
  - **A separate module that only reads the state** and writes numeric data (the existing note on machine learning); it never changes the simulation. Values the model will want, such as damage dealt and taken in the frame and kills, should be numeric counters in the state (the combat journal records every hit now, as text outside the state; those counters in the state do not exist yet).
  - **Python and the simulation:** the rules run in JavaScript, so the first bridge is the simplest: Node plays and writes episodes (a file of plain numbers per run), Python reads and trains. Playing inside the training loop needs a process that Python can ask for the next state, a later step.
  - **A side benefit:** a model that tries everything finds the holes in the rules (an input that makes nobody hit it, a build that ignores the weight limit). A hole it finds is a bug report, not a result.
  - Signal: **sound, with a cost**: the cost is the work of choosing the reward and the observation, which are decisions about the game and belong to the user.
- **Practical requirements for determinism:** randomness only from a seed stored in the state; no `Date.now` or `performance.now` inside the simulation; actors always processed in a fixed order; avoid `Math.sin`, `Math.cos` and `Math.pow`; state without `NaN`, `Infinity` or `undefined`.

## Open items

- **Agreed order of work (critical review of 2026-11-10):**
  1. The user played Chamber 1 (2026-11-11) and said everything was very good: the swarm, the push by weight, the birth and the damage rules are validated by play. He also tested the combat of Chamber 2 up to the repeater (2026-11-12) and liked the results; the shield and the touch controls were built after that.
  2. ~~Pause and one-frame advance~~ (built, 2026-11-12; see "Simulation" (docs/rules/state.md)).
  3. A **damage trace** of real hits on screen, each hit written as its own arithmetic, coming from the simulation itself. This replaces the idea of printing static arithmetic of the body slam in DATA, which would be one more copy of the numbers.
  4. Only then decide the known weaknesses listed in "Damage" (docs/rules/damage.md), "The kit of parts" (docs/rules/parts.md) and "Collision with still things" (docs/rules/world.md).
- The user has not yet confirmed in his Chrome the final position of the SIMULATION CHECK since inertia was added (the agent's Chromium value is in `tests/agent/README.md`, "Known answers in the browser"). The scripted run has no dash and never releases the keys, so the dash and the deceleration are only tested in Node; changing the script changes the final position.
- Parts still to come in the code: Magnet (nothing uses it yet). The recharge of the dash is built (`finalDashRechargeFrames` and `updateDash`; tests 30 and 57).
- The dash opening space (the push by weight exists; whether a dash pushes more is open); and the window as the universe for every actor (the invariant; the wrap exists for every actor except the avatar).
- **Huge actors (the user wants them: radii several times a cell, or more).** The grid already handles any radius (several cells per actor, tested with huge Dummies). Still open, and the user has not decided them: (1) the search of objects near each actor that moves (`objectsNear`, asked by `collideWithObjects` for every actor that moves, the avatar included) is the largest cost left in a step, and every layer of the ground adds a search (measured in `tests/agent/README.md`, "Cost of the layers"). **Decided by the user (2026-11-10):** the things that live in the **seed** are the scenery, and they too may one day be huge, so the ground is made of **layers** (see "The world: seed and objects" (docs/rules/world.md)); a huge layer has its own large squares and is rare. The rule of where a thing lives: what stays in place and is part of the scenery lives in the seed; what moves, or is summoned during a stage (each map has an array of spawn events, `spawns` in `DEFINITIONS.maps`, that says when, how many and which actors to summon, placed from the seed by `(seed, event, nth)`, with no retry, so the run is reproducible: issues 60 and 61), lives outside the seed, in the state, as the Dummies do. The mechanism is built and tested, and **no huge object exists in the definitions yet**. **Decided by the user (2026-11-10):** a huge actor never shows on both sides of the window. Every actor, whatever its size, wraps only when its **center** leaves the window (what `wrapIntoWindow` already does), and no actor will ever be larger than the space between what is on the screen and the edge of the window, so the jump always happens off screen. That makes the smallest margin between the screen and the edge of the window the limit of the radius of an actor. A test (101) reads every actor recipe in the definitions and fails if one allows a larger radius (the user asked for a test on the definitions, so such an actor cannot be made in the first place). It does not look at the objects, which do not wrap, and nothing stops code from writing a larger radius on an actor during a run. A new actor type, a change of the canvas or of the window must keep that test passing. A consequence to know: an actor that wraps can land on top of another one on the other side; the collision pushes them apart there, off screen, like any other overlap.
- Whether the radius of a hitbox follows the size of its owner. (Whether a hitbox is an actor is decided: see "Hitboxes" under "Actor" (docs/rules/actor.md). A bullet that can be destroyed would be a target, so an actor, when it exists.)
- A minimum time between two hits of the same pair (review 3.8): with a Biter biting every few frames while the avatar stands still it becomes real; to be felt in play.
- More behaviors of the Biter and of hitboxes (keep a distance, stand still, dash; hitbox that follows its owner). Built: the windup and the freeze of the Biter, and the hitbox that travels (the bullet).
- Move `src/data.js` to the library structure.
- Running the cross-check automatically.
- The user's second monitor is stuck near 60 Hz (parked; not a problem of the game).

## Handoff (rewritten 2026-11-12, by one agent for the next; stale statements fixed 2026-11-16, issue 69)

What to keep in mind when picking the work up. Rewrite this section when it is stale; it is the first thing a new conversation reads after the top of the file.

**State of the work.** The tests pass (243 on 2026-11-16) and the README table matches them (test 112 checks it). The open issues are on GitHub (`gh api "repos/dupuqub/varpg/issues?state=open"`). The last things built, newest first: the tuning of Chamber 2, 48 Biters and a bite 20% stronger (issue 68); the spawn events of the maps, with the Dummies of Chamber 1 born through them (issues 60 to 62); the journal, the name of the combat log (issue 59); the weightless Branch, which breaks with anything (issues 47 and 51); the death of the avatar that stops the world, and the history past it (issues 28 and 42); the sword and the tags of exclusion; the Radar; fullscreen button; touch controls; the repository made public and published; pause, back and forward buttons with a history of two seconds; the shield of the Generator; the body slam as an attack recipe that follows the current weight; the repeater with ammunition that weighs; the Biter with windup and freeze. Each has its section above.

**What the user has tested and what he has not.** His rule (2026-11-12): **when he sends a message after something that needed testing, assume he tested it, unless he says otherwise.** By that rule Chamber 1 and the combat up to the repeater are tested and liked. Built after his last report and waiting for his word: the shield (its numbers are the agent's guesses), the touch controls on a real phone (stick radius, dead zone, whether fingers cover the game), fullscreen with the landscape lock, and the SIMULATION CHECK on his Android (the final position against the Node value in `tests/agent/README.md`; the ENVIRONMENT button already showed 60 callbacks per second there).

**Decided by an agent, for the user to confirm when it comes up (do not ask all at once)**

- Entering fullscreen on a phone also asks for the landscape orientation.
- The numbers of the shield, of the touch stick and of the repeater.
- The older ones: the size of the screen is written once more in the rules (`state.grid`), with a loud check against the canvas; cells are counted in the world; birth keeps the whole body off the screen and only the center inside the window; two actors of weight 0 split a push half each; `crushes` is copied from the `initial` of each actor's recipe.

**What the user said to wait for (do not build, do not push him):** nothing listed now (how enemies arrive, the array of a map, was decided and built in issue 61). **What he wants later and will ask for:** the bot and the small learned model ("Ideas"), options for left-handed players and accessibility, more desks (`docs/desks.md`).

**The agent's suggestion of what comes next, in order (his to choose):** (the record of a hit is stored now, in the journal); the bench of weapons with the simplest bot; then the melee families of `docs/weapon-families.md`.

**Properties to keep (tests guard them)**

- The grid gives exactly the state of testing every pair in list order (95, 98, 99, 110). If a change breaks that, it changed a rule, not only the speed: stop and tell the user.
- `actor.cells` is always right at the end of a step (100, 110), because the collision reads it from the actor.
- Most tests play in a game without Dummies (`withDummies(0)` in `tests/agent/sim.test.js`).
- The final position of the SIMULATION CHECK (README, "Known answers in the browser") changes with any rule; record the new one when it does.

**Open, for the user to decide (raise one at a time, when it comes up)**

The lists are in "Open items" above, in `docs/weapons.md` ("Open items") and in `docs/weapon-families.md` (six questions about melee). The question of the review about final functions (4.1) is answered: every calculated value is stored in its actor, static once and dynamic every frame (see "Actor" (docs/rules/actor.md)).

**Mistakes made in this stretch, so they are not repeated**

- The user said "let's try it, so I can see the feeling" and the agent started to build, when he only wanted the idea considered. When he says "try" or "see", say what would be built and confirm in one line before building; when he says he needs the implementation, build it.
- A patch of the data by `text.replace` stopped matching after the data changed, silently, and every test played with the full number of Dummies. `loadGame` now refuses any patch that changes nothing, and `patchOnce` refuses a text found zero or two times (test 111).
- An edit of `tests/agent/README.md` replaced a heading by accident, and once a commit went in before its docs. Read `git status` and the diff of the docs before committing.
- A claim was made from a random run that never met the worst case ("this cell size holds"). Only a case built on purpose, or a proof, shows a limit. Say which of the two a statement rests on.
- The user said "everything calculated is stored in its actor" and the agent built "everything is recalculated every frame", the weight included. Storing and recalculating are two questions; when a rule of his has two readings, say both in one line and ask which.
- A test said it checked the avatar's cells after a push, and it rewrote the cells before looking, so it could not fail. Breaking the code on purpose showed it. Always break the thing once and see the test fail.

## Working with several agents

The user may open more than one conversation, each one a **desk** with its own job; `docs/desks.md` says which desks exist, what each may touch and how to open one. Agents do not share memory: **the repository is the only thing all of them see**, so what is not written here (or in the docs it points to) does not exist for the next one. The rules that make it work:

- **Desks (the user, 2026-11-13: split the work into several conversations, each one a desk of a studio; built).** The user has little experience with modern methods of building with agents and asks for help in this point. What is wanted: a consistent method so the conversations can collaborate and help each other. Decided (the user, 2026-11-13): the desks talk through the **Issues of GitHub** (labels `desk:rules`, `desk:review`, `desk:screen`, `desk:bench`, `question-for-user`); the method is in `docs/desks.md`, "How desks talk". Three desks are open today: Review, Manager (called the Rules desk until 2026-11-16; its label is still `desk:rules`) and Screen; the Planner is out for now (the user, 2026-11-16, issue 65) and the Bench and Content desks are for later. `docs/desks.md` was revised on 2026-11-16 (issue 65).

- **Before the first change of a conversation, and again before every push: `git pull --rebase`.** Another desk may have pushed. Never force-push `main`, never rewrite its history.
- **A desk changes only the files of its job** (`docs/desks.md`). If the work needs a change in another desk's files, open an issue on GitHub with that desk's label (`docs/desks.md`, "How desks talk") and tell the user; do not make the change.
- **Only one desk writes the rules** (`src/sim.js`, `src/data.js`, `src/history.js`, the tests). Three things there exist once and collide when two agents touch them at the same time: the **numbers of the tests** (unique, test 112), **`DEFINITIONS_VERSION` with its fingerprint** (test 129), and the **order of the phases of `step`**. After a rebase that brings someone else's commits, run the tests again before pushing; if a test number or the fingerprint collided, take the next number or print the new fingerprint, never reuse or skip.
- **`AGENTS.md` is shared:** change the section of the thing you changed, in the same commit as the change, and leave the rest. Do not reorganize the file while another desk is working.
- **The tests decide.** `node --test` must end with `fail 0` before every push; the repository runs them again on every push and pull request (`.github/workflows/tests.yml`), and nothing is published when they fail. Test 152 fails if "Code layout" names a function that is not in the code.
- **One question at a time to the user, per desk, and only the one that blocks.** He is one person answering every desk.
- **Say who you are in the commit message** when it helps the next desk (for example "Screen desk: ..."); the attribution lines at the end are added as usual.

What this cannot guarantee (said plainly, because the user asked what can be guaranteed): an agent can ignore this file, misread it, or lose part of a long conversation when it is summarized. The tests catch a broken rule and a stale "Code layout"; they do not catch a decision that was made in a conversation and never written down. When a decision is made, write it here before the reply that announces it.

## Publishing (2026-11-12, written by one agent for the next)

The user wants the game **online, to play anywhere (PC and phone) without a terminal**. **It is online and public** (checked 2026-11-16: `gh api repos/dupuqub/varpg` says `private: false`, and the runs of the `Pages` workflow end in success, with the step `deploy-pages` done). What is ready and what is left:

- **Ready:** `README.md` (a public face: early prototype, what exists, what does not, controls, how it is made, no license yet) and `.github/workflows/pages.yml`, which runs the tests and publishes `index.html`, `style.css` and `src/` to GitHub Pages on every push to `main`. **While the repository is private the job is skipped** (the free plan publishes only public repositories), so nothing fails; the repository is public now.
- **Done, the user's clicks (checked 2026-11-16):** (1) Settings, General, Danger Zone, Change visibility, public. (2) Settings, Pages, Source: **GitHub Actions**. (3) A first publication. The address is `https://dupuqub.github.io/varpg/`, and every push to `main` publishes it again. If a run fails, read its log before anything else (the usual cause is that the source of Pages is not **GitHub Actions**).
- **After it is public, check once:** open the address, Chamber 0, SIMULATION CHECK, and compare the final position with `tests/agent/README.md` ("Known answers in the browser"); on a phone it is the first real test of reproducibility on another processor. Touch controls exist (see "Movement and input" in docs/rules/movement.md), built on 2026-11-12 and not yet played on a real phone: ask him how they feel.
- **The history was rewritten (2026-11-12) to protect the user's personal email address**, before the repository was made public: every commit now has the author `34659544+dupuqub@users.noreply.github.com` instead of the user's personal address; the files of every commit are the same, the commit ids all changed (ids written in old conversations no longer exist). The old commits may still be stored at GitHub, unreferenced, until its own cleanup; the user was told and decided **it is not a concern** ("it is not terrible to have the email too"). Do not rewrite the history again without him asking. The agent's commits must keep the noreply address (`git config user.email` in the clone).
- **The user's own clone on his PC is stale** (it has the old history). He does not want to deal with it now. When he wants to work from the PC again: delete the folder and clone again (do not pull or merge the old clone into the new history), and set `git config --global user.email` to the noreply address before committing. The `varpg.bat` for Windows is still owed, once he says where the clone lives.
- **No license was chosen** (so nobody may reuse the code). The code and the content that will be sold (weapons, blueprints, as data) are two separate choices; raise it when he talks about opening the project to others, not before.
- **What is public is everything in the repository**, this file included (the business reasoning, the mistakes of the agents, the relic screenshot). The user was told and accepted it; write here knowing strangers can read it.

## How to run

Online: `https://dupuqub.github.io/varpg/` (the last push to `main` that passed the tests). Locally: open `index.html` in the browser. The scripts are plain (no modules), so no server is needed.

### Tests

From the root of the repository: `node --test` (no path; Node finds the `*.test.js` files). A good run shows `# fail 0` in the summary at its end. The user can paste the whole output to the agent. The tests load the browser scripts into a `vm` context, so they do not need to become modules; the test file passes the starter blueprint to `step` by default. Whenever a rule or a value changes on purpose, update the numbers in the tests and in `tests/agent/README.md`.

## How to work on this project

- **The title of a test claims only what the test checks (2026-11-13).** The user cannot read code: the titles and the rows of `tests/agent/README.md` are his window to what is guaranteed, so a title that promises more than the test verifies gives him a false guarantee (it happened twice in one day, tests 153 and 122). When a test is changed, change its title and its row in the same commit.
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
- **When he sends a message after something that needed testing, he tested it, unless he says otherwise** (his rule, 2026-11-12). Do not ask whether he played, and do not hold a doubt about "not played yet" over work he has already replied about.
- One open question per reply: the one that blocks. Park the others in "Open" and bring them when their turn comes. A list of questions reads to him as obstacles thrown in his path.
- When he will be away, list the choices you will make alone **before** starting, with your default for each, so he can overrule in one line. Mark them in this file as the agent's, for him to confirm.
- When he asks for the "effect" of something, he wants a before and an after with numbers, measured, in a small table, and one sentence of what it means.
- After a mistake: say what happened in one sentence, fix it, go on. No promises about the future and no swing to the opposite excess; he named both as failures.
- He cannot read the tests. The README table is how he reads them: one row per test, in plain words, with the worked numbers.

**Writing the rules**

- **A rule of the game is one small function with the user's sentence above it** (`bodyHurts`, `pushShare`, `crushObject`, `birthOffset`). A new rule is a new named function that the other code asks; never the same condition written in two places. When the user changes his mind, one function changes.
- **A reference to content that does not exist never breaks the game (the user, 2026-11-15, issue 61, his answer in the comments): it is skipped, and the journal says where.** His example: a monster or an item whose name is not found, like "banan" for "banana"; his reason: a player must not lose a run to a small thing like that. **What poisons the arithmetic still stops the game, as today** (a formula value that gives `NaN`, a negative damage, a broken limit): those checks stay. Only the spawn type uses this rule for now (an unknown `type` in a map's spawn events: `spawnEvents` skips that event and writes an error line, and the other events still spawn; it is not refused when the data loads); the other references (parts, weapons, the kinds of a layer) keep their refusal at load until the user asks to change them.
- **What must not exist cannot be made.** A limit is checked when the definitions load (`assertValidDefinitions`) or by a test on the definitions (101, 102), not by an `if` during play. The user asked for this twice.
- **A mechanism that has no content yet is proven with patched data in the tests** (`patchOnce`: the huge layer, the weightless Dummy), never with placeholder content in `src/data.js`. What is not used does not live in the data.
- **A faster way must give the same state as the plain way**, and the plain way stays in the tests as the reference (`EVERY_PAIR`). An optimization that changes a result is a change of rule and needs the user.
- **Before a refactor, say what must stay bit for bit the same and which test shows it** (the known answers of seed 1, the whole-state comparisons, the Chromium position). Keep the operations in the same order: floating point is not associative.
- **Name things for what they are today.** `collideActors` handles every actor that moves (the Dummies and the Biters), so it is not called `collideDummies`. An honest narrow name is a note to the future; a wide name over narrow code is a trap.
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
