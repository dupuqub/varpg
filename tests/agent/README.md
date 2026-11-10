# Agent tests

These tests were **written and defined by the agent** (Claude), not by the project owner. They check that the simulation keeps behaving the way the decisions in `AGENTS.md` say. The owner decides what the game does; these tests only guard it. If a test fails after a change, either the change broke something, or the decision changed and the test must be updated on purpose.

The file is `tests/agent/sim.test.js`. It uses `node:test`, which comes with Node. There is nothing to install (no npm, no libraries).

## How to run

From the root of the repository:

```
node --test
```

(No path. Node finds every file named `*.test.js` by itself.) A good run ends with `# fail 0`. A failing test prints its name and the difference between the expected and the actual value.

**Giving the output to the agent:** copy the whole terminal output and paste it in the chat. That is enough. For a single failing test the agent needs only the lines that start with `not ok` and the lines below them.

## What the tests do (and do not do)

- They load `src/data.js`, `src/sim.js` and `src/history.js` the way a browser does, as plain scripts, without changing them.
- They test **rules** (numbers and state). They do not test how the game looks or feels: for that, open Chamber 1 and describe what you see.
- Things that only a real browser can show (frame rate, final position in each browser) are in **Chamber 2: Diagnostics**, not here.
- Combat is only the collision with rocks so far (tests 47 to 52). There are no enemies, weapons or shield yet.

## The tests, one by one

### State

| # | What it checks | Why it matters |
|---|---|---|
| 01 | The initial state is plain JSON: writing it as text and reading it back changes nothing, and no `null` appears. | The state must be one plain JSON object (a project decision). `NaN` or `undefined` would break saving and replay. |
| 02 | After a step, changing the input object does not change the state. | The state must never point into the input. Otherwise a later change to the input would silently rewrite the past. |
| 03 | 600 steps with the same inputs, played twice, end identical. | Determinism: the same inputs must always give the same run (a core goal, also for machine learning). |
| 04 | The state has no `aim`, and an `aim` in the input is ignored. | The user decided there is no manual aim (weapons aim by themselves). This keeps it from coming back by accident. |

### Movement

| # | What it checks | Why it matters |
|---|---|---|
| 05 | Walking right for 60 frames ends at exactly 163.5 px with velocity 3: 12 frames of acceleration (19.5 px), then 48 frames at the top speed (144 px). | The main movement check. It fixes the current numbers (top speed 3, acceleration 0.25). If you tune them, this number changes on purpose. |
| 06 | A normalized diagonal (0.707, 0.707) covers the same distance as a straight line. | Diagonals must not be faster. |
| 07 | Speeding up takes 12 frames, stopping takes 24, the velocity never goes above the top speed. | Checks the inertia: acceleration and deceleration, frame by frame. |
| 08 | Reversing direction takes 12 frames to reach zero, with no jump. | Turning around must pass through zero smoothly. |
| 09 | If `finalSpeed` returns another value, the velocity goes up to the new top speed. | The top speed is asked every frame (a project requirement), so parts and buffs can change it later. |

### Collision grid

| # | What it checks | Why it matters |
|---|---|---|
| 10 | The state carries the grid settings (64 / 61 / 35) and the player is always in cell (0, 0). | The grid settings live in the state so a run is reproducible. |
| 11 | Cell boundaries: an offset of 31.9 is still in the center cell, 32 is in the next. | Checks the rounding of `cellIndex`. An error of one pixel here would put actors in the wrong cell. |
| 12 | When the player walks, a still actor changes cell. | Cells are relative to the player, not fixed to the world. |
| 13 | `isInWindow` for a 3x3, an 11x11 and the 61 x 35 rectangle. | Checks the edges of the window, on each axis separately. |
| 14 | The default window reaches at least 1920 px and 1080 px from the player. | The user's requirement: the window covers at least twice the screen. |
| 15 | Bad grid settings (even size, zero, negative, `NaN`, missing field) are refused with an error. | The settings must fail loudly, not run with nonsense. |

### Definitions and actors

| # | What it checks | Why it matters |
|---|---|---|
| 16 | The definitions are frozen (changes are ignored), the state keeps only `type` (no radius or base speed), and it carries the version of the definitions. | The state is only what changes. Fixed values live in the definitions, and nothing may alter them during a run. |
| 17 | Unknown actor types raise an error. A type without `move` (a trap) does not move. | A typo in a type must not create a ghost actor. Static actors are simply actors without `move`. |
| 18 | A new actor is a copy of the initial state of its type, and changing it never changes the definitions or another actor. | If actors shared numbers with the definitions, one actor's damage could change every actor of that type. |
| 19 | The run id is in the state, and the build is empty and outside the state. | The build is an input of the run, not a state (a project decision). |

### Run history

| # | What it checks | Why it matters |
|---|---|---|
| 20 | Two lists (snaps and inputs), index 0 is the oldest, and the saved snaps are copies. | The history must not change when the live state changes. |
| 21 | After 250 steps only the last 100 stay, and the oldest leaves first. | The history has a fixed size (100). |
| 22 | The cross-check finds no difference in a normal run, even after the history has slid. | The cross-check must not accuse a correct run. |
| 23 | If one saved snap is changed on purpose, the cross-check reports the exact frame and field. | A check that can never fail proves nothing. This shows that it can fail. |
| 24 | The cross-check catches a rule that secretly depends on something outside the state (here, a hidden counter). | This is the real purpose of the cross-check: finding non-determinism. |
| 25 | Going back to an earlier snap and playing again drops the later snaps, and the lists stay aligned. | "Going back and pressing play deletes the future" (a project decision). |

### Dash

| # | What it checks | Why it matters |
|---|---|---|
| 26 | A dash sets the velocity to the dash speed (12) in the direction held, with the same strength even if the stick is half tilted, and spends the charge. | The basic dash rule. The frame of the dash already moves at 12. |
| 27 | A dash without a direction does nothing, and the charge is kept. | The user's choice: no wasted charge when there is nowhere to go. |
| 28 | Holding the direction after a dash, the speed falls 0.5 per frame and reaches the top speed in 18 frames. | The decay is linear and exact (12, 11.5, 11, ... 3), easy to show in the audit. |
| 29 | Releasing the keys after a dash, it still falls 0.5 per frame down to 3, then brakes at the normal 0.125. | The two rates take turns correctly. |
| 30 | A charge comes back 240 frames (4 s) after it was spent, and a dash one frame before that does nothing. | The recharge timing, to the exact frame. |
| 31 | If parts made the dash stronger (20 instead of 12), the decay stays 0.5, so the dash lasts 34 frames instead of 18. | The user's decision: parts add to the dash strength, but the decay is a constant. |
| 32 | Running diagonally at the top speed and releasing brakes at 0.125, not 0.5. | Guards against a rounding error (3.0000000000000004) being taken as "faster than the top speed". |
| 33 | The cross-check stays clean in a run that contains dashes. | The dash button is part of the input, so it has to replay identically. |

### Rocks (seed and formula)

| # | What it checks | Why it matters |
|---|---|---|
| 34 | The same seed always gives the same rocks (and there are many of them over a large area). | Determinism of the world: the rocks come from the seed, not from chance. |
| 35 | Different seeds give different rocks. | Shows the seed really matters. |
| 36 | Looking at a small area finds exactly the rocks that a big area has inside that same region. | A rock must not depend on where you look from, or rocks would pop in and out while walking. |
| 37 | No rock is closer than 200 px to the starting point, for 40 different seeds (and rocks do start right after that). | The avatar must never begin inside a rock. |
| 38 | No two rocks overlap, for 5 seeds. | The formula keeps each rock inside its own square, with a margin. |
| 39 | **Known answer:** seed 1 gives 12 rocks on the first screen, the first a boulder at 172,-435 and the last a boulder at 854,418. | A fixed point of comparison. If it fails after a change, every map changed. If it fails on another browser, the hash is not exact there (compare with the ROCKS lines of DATA in Chamber 2). |
| 40 | The state keeps only the seed (not the rocks), and every rock kind is a valid static actor with a bounce from 0 to 1 and a radius that fits the margin. | The state stays small, and the library data cannot break the formula by accident. |

### Collision with rocks

These tests use three rocks of seed 1 (see test 39): a stone at 159,444 (bounce 0), a boulder at 172,-435 (bounce 0.5) and a rubber rock at 711,-63 (bounce 1). The avatar has radius 16.

| # | What it checks | Why it matters |
|---|---|---|
| 41 | Head-on at 3 px/frame: the stone stops you (0), the boulder sends you back at 1.5, the rubber rock at 3. | The bounce rule, in numbers you can check by hand: `-bounce x speed`. |
| 42 | After the hit the avatar is exactly touching the rock (for example 127 = 159 - (16 + 16)). | The push-out puts it just outside, not inside and not far away. |
| 43 | Glancing blow on the stone: the part of the velocity going into the rock is 0, the part along the rock is unchanged, and the speed kept is more than 80%. | The angle matters and bounce 0 slides, it is not friction (the user's definition). |
| 44 | A dash into the stone stops (0). A dash into the rubber rock comes back at -12, the full dash speed. (Both rocks are given 50 health here, so the dash does not break the stone.) | The dash and the collision work together. |
| 45 | In 18000 frames of walking in 8 directions with dashes (3 seeds), the avatar is never inside any rock. | The most important guarantee of collision, tested over a long run. |
| 46 | The cross-check stays clean in a run that really hits the stone. | The collision must replay identically (determinism). |

### Body slam: damage from collisions

Rule: a collision (a pair that was not touching in the last frame, with an impact of at least 1) with something that has `doesDamage` is a hit; friction is not, and nothing triggers below an impact of 1. A hit costs at least 1, and the attack is weight x 0.001 x impact / 6 (the impact is the speed going into the other thing; provisional formula). `damage = max(0, attack - defense)`. The avatar weighs 5000 kg, has defense 3 and health 100. These tests use the rocks of seed 1: the stone at 159,444 (4800 kg, health 10), the boulder at 172,-435 (6000 kg, health 17) and the rubber rock at 711,-63 (3600 kg, health 15).

| # | What it checks | Why it matters |
|---|---|---|
| 47 | Walking into a rock at 3 px/frame is a weak hit: the stone loses 2.5 (10 - 7.5), the avatar the minimum damage 1 (2.5 - 3 is below 1), and it still stops. | Any contact above the minimum impact hits, but weakly. The bounce is a separate rule. |
| 48 | A dash (impact 12) into the stone costs the avatar 6.6 (4800 kg: attack 9.6, minus defense 3) and the stone 10 (the avatar's attack; it breaks); into the boulder 9 (attack 12) and 10; into the rubber rock 4.2 (attack 7.2) and 10. | A hit hurts both sides, each with its own weight. |
| 49 | A glancing blow (impact about 1.7) hurts the stone, but less than the head-on walk of test 47; the avatar loses 1. | Only the part of the speed going into the rock counts. |
| 50 | The attack at impact 12 is 9.6 for the stone (300 x radius 16 = 4800 kg), 10 for the avatar (5000 kg), 8.7 for a lighter avatar; 4.8 at the reference impact 6, 2.4 at 3, 0 at no impact. The damage never goes below 0 (no attack) or below the minimum 1 (any attack). | The formula in numbers you can check by hand. |
| 51 | Health stops at 0. | There is no death yet. |
| 52 | The cross-check stays clean in a run where both avatar and rock are hurt, and the state stays plain numbers. | Damage must replay identically (determinism). |

### Rocks with health, and the training dummy

| # | What it checks | Why it matters |
|---|---|---|
| 61 | A hurt rock is stored by its square (`"2,-1": 5`), keeps its health between frames, and the state is still plain JSON. | Only hurt rocks are in the state; the rest come from the seed. |
| 62 | A rock with 5 left breaks when a dash hits it (the avatar loses 6.6): no bounce and no push, the avatar goes through and takes no more damage. | A broken rock must really be gone. |
| 63 | Every rock rolls a whole health from 10 to 20, the same every time, and over 5 seeds every value from 10 to 20 shows up. | The range is respected and fully used. |
| 64 | The weight of a still actor is `weightPerRadius` x radius, a whole number (stone 4800, boulder 6000, rubber rock 3600, dummy 4800); twice the radius is twice the weight. | The weight follows the radius, not the area (the user's decision), and nothing is rounded. |
| 65 | The first dash up reaches the training dummy (130 px up), takes it from 30 to 24.17 (5000 x 0.001 x 7 / 6 = 5.83) and the avatar from 100 to 97.4 (the dummy, 4800 kg, hits back for 5.6, minus 3). The avatar bounces back and the dummy does not move. | The first combat test works from the very first dash. |
| 66 | Pressing into the dummy: it hits at impact 3 (2.5), the bounce sends the avatar back at 1.5, pressing again hits at impact 1.5 (1.25), and the next return is below 1: nothing more, even after 200 frames of pressing. The avatar loses 1 each time (minimum damage). At 0 health the dummy stays and still collides. | Only real collisions hurt, and the chain ends by itself. |
| 67 | After walking away (no contact) and coming back, the second collision hurts again; the contacts list is plain state (`["player_1|dummy_1"]` while touching, empty when apart). | A new collision is a new hit. |
| 68 | A type without `doesDamage` has attack 0 even with the weight of a stone; the stone at impact 12 has 9.6. | The rule is modular: the flag decides who hits. |
| 69 | A hit always costs at least 1: attack 1.8 against defense 3 costs 1; attack 7.2 costs 4.2; no impact costs 0. | The defense never makes the target immune. |
| 70 | An impact below 1 (0.5, into a bounce-0.5 thing) triggers nothing: no damage, no bounce, the avatar stops. | The collision threshold. |
| 71 | Every weight in the definitions is a whole number, 0 or more: the parts, and the `weightPerRadius` and radius of the still actors. | The rule holds for the real data. |
| 72 | A `weightPerRadius` of 300.5, a radius of 16.5 or a part weight of -1 makes the game fail when it loads; a `weightPerRadius` of 0 loads and gives weight 0. | The check is real, and weight 0 is allowed. |
| 73 | A still actor with weight 0 and health 1 does no damage to the avatar (not even the minimum), breaks at the first hit, and the dash goes through it at full speed. | Weight 0 works as a breakable, harmless thing with no special case. |

### The kit of parts

The avatar's final values are the sum of the specs of the parts in its build (starter build: nine parts, 5000 kg). Most of the other tests play with the starter build: the test file passes it to `step` by default.

| # | What it checks | Why it matters |
|---|---|---|
| 53 | The starter build adds up to weight 5000, capacity 6000, speed 3, health 100, defense 3, dash 12, and the avatar starts with full health. | The kit keeps the values the avatar had before parts, so nothing felt changes. |
| 54 | Taking off a 650 kg arm gives back 0.13 px/frame of speed (650 x 0.0002), a 200 kg head 0.04. | The weight effect is direct and easy to see: kg times a constant. |
| 55 | Without the Legs the speed would be negative (0.5 - 3700 x 0.0002), and it is 0. | The controls never reverse. |
| 56 | Without the Torso health is 45 and defense 1; without the Head health is 85 and defense 3. | Each part adds exactly what it gives. |
| 57 | Without the Booster a dash does nothing and the charge is kept. | A dash comes from a part, not from nowhere. |
| 58 | A build of 7600 kg (capacity 6000) is refused with a clear message, and so is an unknown part. | The capacity is a hard limit, and a typo in a part id must not run. |
| 59 | Another actor of the same type gets nothing from the parts. | Only the avatar has a build. |
| 60 | The cross-check is clean with the build the run was played with, and finds a difference with another. | The build is an input of the replay, as the seed and the inputs are. |

## Proof that the tests can fail

While writing the first 25 the agent changed the acceleration from 0.25 to 0.3 on purpose: 6 of them failed (05, 06, 07, 08, 20 and 24), and everything passed again after reverting it. The same was done for the collision: with the line that calls it switched off, tests 41 to 46 failed. For the damage, with the line that applies it switched off, tests 47, 48, 49 and 52 failed. With the impact threshold removed, 47, 49, 50 and 66 fail; with the rock never hurt, 48, 52, 61, 62 and 65 fail. For the kit, ignoring the weight in `finalSpeed` made 17 tests fail (5 to 8, 16, 28 to 32, 41, 43, 47, 53 to 55 and 60), and removing the guard for a dash strength of 0 made test 57 fail. Tests that never fail would be worthless.

## Adding a test

Add a block `test("NN what it checks", () => { ... })` to `sim.test.js`. Inside, `run(code)` executes code inside the game, and `plain(value)` turns a result into a normal object for `deepStrictEqual`. Keep the numbering, and add a row to the table above.
