# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

Each paragraph here says the rule of today; how a rule changed (older versions, dates, parcels, the user's words at the time) is in `docs/decisions.md` (issue 66).

## The two foundations (read these first; the user: "the base of everything")

> **1. Go slowly and deliberately.** The goal is the calm making of a model project, not reaching the end. Clarity wins over speed.
> **2. Break every big task into small steps, each one closed before the next.** Tests green, committed, pushed and noted here, so the work can stop after any step.

The full text of each, with its reason:

- **1. The aim and the pace of the project (the user, 2026-11-13; it comes before the other rules of this section).** The problem here is often contemplative, not one of speed. The aim is not the end of the project but the calm making of it, pruning each branch without hurry: a project that can be a **model of how a game like this can be organized**, inclusive, so that people can take it apart and learn from every decision and every difficulty, and so that anyone who comes to work with him can walk in it knowing the ground is safe. The user may need to earn money from it someday, but that is not the measure. So: the agent does not optimize for a fast and efficient answer (it was trained to be rewarded for that, and it is not the goal here); it goes slowly, one thing at a time, says what each change is for, leaves no change half explained, and keeps the files, the tests, the reasons beside the numbers and the history readable by someone who was not there. When speed and clarity pull apart, clarity wins.

- **2. How to break a big feature into steps (the method that built the sword, 2026-11-13).** Split it into small steps, each one finished on its own: the smallest pure piece first (a helper with tests), then the data, then the rules, then the drawing, then the docs. Each step ends with the tests at `fail 0`, a row per test in the README, a commit, a push, and a line in `AGENTS.md` saying what is done and what comes next, so the work can stop after any step and anyone can resume. The user's usage can end at any moment, and a half-finished step is what makes work hard to resume. Do one step, close it, then the next; do not carry two open at once.


**This file has no game values (the user's rule).** It says what was decided, why, and **where each number lives**. The values, each with its reason and who chose it, are in `src/data.js` (and in the few named constants listed in "Where the numbers are" (docs/rules/numbers.md)). Do not copy a value into this file: write the rule with the **name** of the number (for example `weight = weightPerRadius x radius`). The only numbers allowed here are the fixed decisions of the concept (steps per second, the canvas size, the length of a map). Worked examples with numbers belong in `tests/agent/README.md`, where a test fails if they drift.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state (2026-11-12): the game is **public and online** (`https://dupuqub.github.io/varpg/`, published from `main` by a workflow that runs the tests first; see "Publishing" in docs/notes/handoff.md). Screen navigation (main menu, test chambers list, Chamber 0 diagnostics and the played Chambers 1 and 2), with pause, one frame back and forward, fullscreen, and keyboard, gamepad and touch controls. In Chamber 1 the avatar is always at the center of the screen, moves with inertia, dashes, collides with the objects of the seed (rocks and Shrooms, all placed by seed and formula, in layers, none by hand) and with the Dummies (test actors made by the seed, born from the map's spawn events off the screen, wandering and wrapping around the window of the grid), and collisions with the avatar hurt (the body slam); actors push each other by weight. The avatar's values are sums over the mecha parts of its blueprint. The collision grid (several cells per actor) is used between actors. In Chamber 2 the Dummies are replaced by Biters, born from the map's spawn events (a crowd after the first step, then waves), enemies that chase the avatar and bite with a hitbox; damage is a packet by type that the target resists by points; the avatar has an auto-aiming repeater whose ammunition weighs, and a shield from the Generator whose ring is its radius. See "Code layout". **More than one agent may work here: read "Working with several agents" and `docs/desks.md` before the first change.**

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

Moved to docs/rules/numbers.md (summary pending).

## Decisions

### Theme: mechas

Moved to docs/rules/screens.md (summary pending).

### Screens

Moved to docs/rules/screens.md (summary pending).

### Stack

Moved to docs/rules/screens.md (summary pending).

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

Moved to docs/notes/handoff.md (summary pending).

## Open items

Moved to docs/notes/handoff.md (summary pending).

## Handoff (rewritten 2026-11-12, by one agent for the next; stale statements fixed 2026-11-16, issue 69)

Moved to docs/notes/handoff.md (summary pending).

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

Moved to docs/notes/handoff.md (summary pending).

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
- **Every number that is chosen needs a reason, and the agent suggests one** (see "Where the numbers are" in docs/rules/numbers.md).
- **Say when a decision rests mostly on the user's preference**, briefly and plainly, and keep going: the game is his, so a preference is a valid reason, but he wants to know which decisions are preference and which are need. The same goes for the agent's own preferences. **Filter (the user's rule):** do not raise a suggestion unless it has the potential for a positive change to the game. Do not challenge a choice of taste only to offer alternatives (the user's example: "you chose cats, but what about dogs, or squirrels?"). A taste choice is worth a remark only when it carries a concrete cost or risk into the structure. The same applies to numbers: suggest a different value only if it would measurably change the experience.
- Small corrections, not over-corrections: the user said the agent rushes, and then brakes too much when corrected.
- After changing something visual, ask the user to open it and describe what he sees and feels. For anything that can be printed as text, add a button to Chamber 0 and ask the user to paste its output.

### Patterns that work here (written by one agent for the next, 2026-11-11)

Moved to docs/notes/handoff.md (summary pending).
