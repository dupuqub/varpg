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
- Combat is only the collision with rocks and Shrooms so far (tests 47 to 52). There are no enemies, weapons or shield yet. The Dummies (tests 80 to 95) walk, turn and hurt what they touch, with the same body slam.

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
| 12 | When the player walks, another actor (a marker without a type, only a test fixture) changes cell. | Cells are relative to the player, not fixed to the world. |
| 13 | `isInWindow` for a 3x3, an 11x11 and the 61 x 35 rectangle. | Checks the edges of the window, on each axis separately. |
| 14 | The default window reaches at least 1920 px and 1080 px from the player. | The user's requirement: the window covers at least twice the screen. |
| 15 | Bad grid settings (even size, zero, negative, `NaN`, missing field) are refused with an error. | The settings must fail loudly, not run with nonsense. |

### Definitions and actors

| # | What it checks | Why it matters |
|---|---|---|
| 16 | The definitions are frozen (changes are ignored), the avatar carries its own radius, acceleration, deceleration, dash recharge, weight and bounce (16, 0.25, 0.125, 240, 5000, 0) and no base speed, and the state carries the version of the definitions. | The actor holds its own values; the definitions only hold the base. |
| 17 | Unknown types raise an error (`finalizeObject`, `definitionOf`). A type without `move` (a trap, added by a patched copy of the data) does not move. | A typo in a type must not create a ghost actor. A thing without `move` simply does not walk. |
| 18 | A new avatar (`createAvatar`) is a copy of the initial state of its type plus its final values, and changing it never changes the definitions or another avatar. | If actors shared numbers with the definitions, one change would leak into all. |
| 19 | The run id is in the state, and the blueprint is empty and outside the state. | The blueprint is an input of the run, not a state (a project decision). |

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
| 26 | A dash sets the velocity to the dash speed (12) in the direction held, with the same strength even if the stick is half tilted, and spends the charge (`dash.charges` goes from `{ now: 1, max: 1 }` to `{ now: 0, max: 1 }`). | The basic dash rule. The frame of the dash already moves at 12. |
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
| 39 | **Known answer:** seed 1 gives 10 objects on the first screen, the first a Shroom at 136,-375 (radius 16, health 17, weight 1600, bounce 0.2) and the last a rock at 99,456 (radius 28, health 10, weight 2800, bounce 0); the types in order are shroom, rock, rock, shroom, shroom, rock, shroom, shroom, rock, rock. | A fixed point of comparison. If it fails after a change, every map changed. If it fails on another browser, the hash is not exact there (compare with the OBJECTS lines of DATA in Chamber 2). |
| 40 | The state keeps only the seed and the avatar (no objects). Over 5 seeds the seed rolls the type, the radius and the health of every object inside the ranges of its type, and every value of the ranges shows up (radius 16 to 32, health 10 to 20) for the rock and for the Shroom; `objectMargin()` is the largest radius. | The state stays small, and nothing about an object is a fixed value. |

### Collision with rocks

These tests use the rock of seed 1 at 99,456 (radius 28, 2800 kg, health 10, no bounce, called ROCK in the test file) and Shrooms that the seed made (`findShroom` in the test file takes, from seeds 1 to 300, the first Shroom of the radius asked that has nothing else within 300 px and a health of 11 or more). Nothing is placed by hand. The avatar has radius 16. Only the Shroom has a bounce: 0.2 at radius 16, 0.6 at 24 and 1 at 32.

| # | What it checks | Why it matters |
|---|---|---|
| 41 | Head-on at 3 px/frame: the rock stops you (0); a Shroom sends you back at 0.6 (radius 16), 1.8 (24) or 3 (32). | The bounce rule, in numbers you can check by hand: `-bounce x speed`, with the bounce growing with the radius. |
| 42 | After the hit the avatar is exactly touching the thing (55 = 99 - (28 + 16) for the rock; 32 and 48 above the center of a Shroom of radius 16 and 32). | The push-out puts it just outside, not inside and not far away. |
| 43 | Glancing blow on the rock: the part of the velocity going into the rock is 0, the part along the rock is unchanged, and the speed kept is more than 80%. | The angle matters and bounce 0 slides, it is not friction (the user's definition). |
| 44 | A dash into the rock stops (0). A dash into a Shroom of radius 32 (bounce 1) comes back at -12, the full dash speed. (Every rock is given 50 health here, so the dash does not break it.) | The dash and the collision work together. |
| 45 | In 18000 frames of walking in 8 directions with dashes (3 seeds), the avatar is never inside any rock. | The most important guarantee of collision, tested over a long run. |
| 46 | The cross-check stays clean in a run that really hits the rock. | The collision must replay identically (determinism). |

### Body slam: damage from collisions

Rule: a collision (a pair that was not touching in the last frame, with an impact of at least 1) is a hit; friction is not, and nothing triggers below an impact of 1. A hit costs at least 1, and the attack is weight x 0.001 x impact / 6 (the impact is the speed going into the other thing; provisional formula). `damage = max(1, attack - defense)` when there is an attack (0 without). The avatar weighs 5000 kg, has defense 3 and health 100. These tests use the rock of seed 1 at 99,456 (2800 kg, health 10).

| # | What it checks | Why it matters |
|---|---|---|
| 47 | Walking into the rock at 3 px/frame is a weak hit: the rock loses 2.5 (10 - 7.5), the avatar the minimum damage 1 (its attack, 1.4, is below the defense 3), and it still stops. | Any contact above the minimum impact hits, but weakly. The bounce is a separate rule. |
| 48 | A dash (impact 12) into the rock costs the avatar 2.6 (2800 kg: attack 5.6, minus defense 3) and the rock 10 (it breaks). Into a Shroom of radius 16 (1600 kg, attack 3.2, below the defense) it costs 1, into one of radius 32 (3200 kg, attack 6.4) it costs 3.4; the Shroom loses 10 in both. | A hit hurts both sides, each with its own weight, and at least 1. |
| 49 | A glancing blow (impact about 1.4) hurts the rock, but less than the head-on walk of test 47; the avatar loses 1. | Only the part of the speed going into the rock counts. |
| 50 | The attack at impact 12 is 5.6 for the rock (100 x radius 28 = 2800 kg), 10 for the avatar (5000 kg), 8.7 for a lighter avatar; 2.8 at the reference impact 6, 1.4 at 3, 0 at no impact. The damage on the avatar is 1 from a Shroom of radius 16 (attack 3.2) and 3.4 from one of radius 32 (6.4 - 3). | The formula in numbers you can check by hand. |
| 51 | Health stops at 0. | There is no death yet. |
| 52 | The cross-check stays clean in a run where both avatar and rock are hurt, and the state stays plain numbers. | Damage must replay identically (determinism). |

### Rocks with health, and the weight of a still object

| # | What it checks | Why it matters |
|---|---|---|
| 61 | A hurt rock is stored by its square (`"0,1": 7.5`), keeps its health between frames, and the state is still plain JSON. | Only hurt rocks are in the state; the rest come from the seed. |
| 62 | A rock with 5 left breaks when a dash hits it (the avatar loses 2.6): no bounce and no push, the avatar goes through and takes no more damage. | A broken rock must really be gone. |
| 63 | Every rock rolls a whole health from 10 to 20, the same every time, and over 5 seeds every value from 10 to 20 shows up. | The range is respected and fully used. |
| 64 | The weight of an object, made by `finalizeObject`, is `weightPerRadius` x radius, a whole number: rock of radius 28 is 2800, Shroom 1600 (radius 16), 2400 (24), 3200 (32). Twice the radius is twice the weight. | The weight follows the radius, not the area (the user's decision), is computed at creation and nothing is rounded. |
| 65 | Pressing into the rock hurts it once, at the arrival (7.5 left, the avatar at 99, stopped at 55), and nothing more after 300 frames of pressing (no bounce, so no second collision). | Only real collisions hurt. |
| 66 | After walking away (no contact) and coming back, the second collision hurts again; the contacts list is plain state (`["avatar_1|rock 0,1"]` while touching, empty when apart). | A new collision is a new hit. |
| 67 | The attack comes from the weight alone: a rock with `weightPerRadius` 0 has attack 0 and damage 0 at any impact (not even the minimum damage); the same rock with its weight attacks 5.6 at impact 12 and costs the avatar 2.6. | There is no flag for who hits; weight 0 is harmless (the user removed `doesDamage`). |
| 68 | A hit always costs at least 1: attack 0.8 (Shroom of radius 16 at impact 3) against defense 3 costs 1; attack 6.4 (radius 32 at impact 12) costs 3.4; no impact costs 0. | The defense never makes the target immune. |
| 69 | An impact below 1 (0.75, into a Shroom of radius 32, bounce 1) triggers nothing: no damage, no bounce, the avatar stops. | The collision threshold. |
| 70 | Every weight in the definitions is a whole number, 0 or more: the parts, and the `weightPerRadius`, `size.min` and `size.max` of every object. | The rule holds for the real data. |
| 71 | A `weightPerRadius` of 100.5, a radius of 16.5 or a part weight of -1 makes the game fail when it loads; a `weightPerRadius` of 0 loads and an object made from it has weight 0. | The check is real, and weight 0 is allowed. |
| 72 | A rock with weight 0 and health 1 does no damage to the avatar (not even the minimum), breaks at the first hit, and the dash goes through it at full speed. | Weight 0 works as a breakable, harmless thing with no special case. |
| 73 | The objects are the `rock` and the `shroom`, each a complete entry with its own `size: { min: 16, max: 32 }`, `weightPerRadius` 100 and `healthRange: { min: 10, max: 20 }`, and nothing else unused: the rock has exactly `name`, `size`, `weightPerRadius`, `healthRange`; the Shroom the same plus `bounce` `{ min: 0.2, max: 1 }`. | Each object is complete and unique, with no fixed health, no initial state and no placeholder. |
| 74 | A size with a radius that is not whole, a min above the max, or a weight modifier that is not whole stops the game when it loads, for the rock and for the Shroom, each on its own; weight 0 is allowed. | The check is real, for every object. |
| 75 | `finalizeObject` makes everything: an unknown type is refused, a rock gets the radius and health it was rolled and its own weight (2800) and bounce (0), and the first object of seed 1 comes out of the same function. The avatar is the only actor type, with radius 16. | One function, one shape, for the avatar and for every object. |
| 76 | The Shroom's `bounce`, made by `finalizeObject`, grows in a straight line from 0.2 (radius 16) to 1 (radius 32): 0.6 at 24, +0.05 for each pixel of radius. The rock has 0. | The bounce rule the user chose, in numbers. |
| 77 | A bounce above 1 or not a `{ min, max }`, a bounce minimum above the maximum, a `healthRange` with a 0, a half number or a minimum above the maximum, or an object without a size makes the game fail when it loads. | A bounce never ejects (the user's rule), the ranges are real, and a missing size is a clear error. |
| 78 | Changing the size of the rock in the data leaves the size of the Shroom as it was. | Nothing is shared between objects (the user's rule). |
| 79 | While the avatar steps, the definition of the avatar is never read (`definitionOf` is spied on; an object being made from the seed reads its own recipe, the avatar never does). | The avatar plays only with its own values (the user's rule). |

### The kit of parts

The avatar's final values are the sum of the specs of the parts in its blueprint (starter blueprint: nine parts, 5000 kg). Most of the other tests play with the starter blueprint: the test file passes it to `step` by default.

| # | What it checks | Why it matters |
|---|---|---|
| 53 | The starter blueprint adds up to weight 5000, capacity 6000, speed 3, health 100, defense 3, dash 12, and the avatar starts with full health. | The kit keeps the values the avatar had before parts, so nothing felt changes. |
| 54 | Taking off a 650 kg arm gives back 0.13 px/frame of speed (650 x 0.0002), a 200 kg head 0.04. | The weight effect is direct and easy to see: kg times a constant. |
| 55 | Without the Legs the speed would be negative (0.5 - 3700 x 0.0002), and it is 0. | The controls never reverse. |
| 56 | Without the Torso health is 45 and defense 1; without the Head health is 85 and defense 3. | Each part adds exactly what it gives. |
| 57 | Without the Booster there is no dash charge (`finalDashMaxCharges` is 0, `finalDashRechargeFrames` is 0 and with it 240, and a new avatar starts with `{ now: 0, max: 0 }`) and a dash does nothing; with it the maximum is 1 and a new avatar starts full. | A dash, and its charges, come from a part, not from nowhere. |
| 58 | A blueprint of 7600 kg (capacity 6000) is refused with a clear message, and so is an unknown part. | The capacity is a hard limit, and a typo in a part id must not run. |
| 59 | Another actor of the same type gets nothing from the parts. | Only the avatar has a blueprint. |
| 60 | The cross-check is clean with the blueprint the run was played with, and finds a difference with another. | The blueprint is an input of the replay, as the seed and the inputs are. |

### The Dummies

Tests 80 to 95 (most run in a game without objects, so only the collisions the test sets up happen). The other tests of the file play in a game with no Dummies, because a wandering Dummy also hurts rocks; the Dummy tests use 100 Dummies, not the real count, to stay fast (a patch of the count that stops finding its text fails loudly).

| # | What it checks | Why it matters |
|---|---|---|
| 80 | The seed makes the Dummies (100 in the test game; the real game has more, for the stress test), `dummy_0` onward, each with a radius of 8 to 16, health 100 (`now` and `max`), speed 2, a first angle from 0 to 359, inside the window of the grid, and the same every time for the same seed (another seed gives others). | The Dummies come from the seed and their ranges, and nothing is placed by hand. |
| 81 | In five seeds, no Dummy starts on top of another Dummy, on top of an object, or closer to the avatar than the safe distance. | The 100 do not all start already in collision. |
| 82 | A Dummy with no collision walks 60 frames in a straight line at speed 2, and keeps its angle (37) and its turns (0). | The walk is a straight line. |
| 83 | A Dummy that walks into the rock of seed 1 hurts it and is hurt by it: at impact 2 both attacks are below 1, so the minimum damage of 1 applies to each (the rock goes from 10 to 9, the Dummy from 100 to 99); it is pushed out until it just touches, its turns become 1 and its new angle is `hash(seed, number, 1, 16) % 360`. | The new angle is rolled from the seed, and a Dummy collision is a hit like the avatar's. |
| 84 | The angles of 40 turns are exactly `hash(seed, 3, turns, 16) % 360`, whole degrees from 0 to 359, at least 20 different, and the direction always has length 1. | The `rand(360)` is reproducible and varied. |
| 85 | A pair that was touching in the last frame still pushes the Dummy out to just touching, but does not turn it and does not hurt anyone; a new contact turns it once and is a hit (the avatar hits for 1.667, the Dummy for the minimum of 1 because the avatar's defense is 3). The avatar does not move. | Only a new contact turns and hurts, so a Dummy pressed against something does not turn or lose health at every frame. |
| 86 | Two Dummies that walk into each other (closing at 4) hurt each other with their own weight (`weight x 0.001 x 4 / 6`, at least 1), are pushed half each (their middle does not move), end just touching, and both turn once. | A Dummy against a Dummy is symmetric, and both sides hurt. |
| 87 | A Dummy that bumps into the avatar turns once and is pushed out to just touching; the avatar loses 1 (the minimum, its defense is 3), the Dummy loses 1.667, and the avatar keeps its position (0,0). | The Dummy hurts the avatar and the avatar hurts it, and the avatar is not pushed. |
| 88 | A Dummy 1 pixel past the left edge of the window comes back 1 pixel inside the right edge; the same for the other three edges, exactly on the left edge is still inside, and it follows the avatar when the avatar is somewhere else. Walking left across the edge in `step` keeps its angle (180), its turns (0) and its speed. | The window of the grid is the area of the game, and it wraps. |
| 89 | `sinDegrees` and `cosDegrees` give unit length (error below 1e-10) for 360 whole degrees, the known values (sin 30 = 0.5, cos 180 = -1, ...) and work with negative degrees and more than 360. | An own series, so the result is the same in every browser. |
| 90 | After 600 frames with the avatar walking, every Dummy is still inside the window around the avatar, the Dummies collided (more than 20 turns) and more than 10 of them were hurt, none has a health below 0, and the state is still plain JSON. | The Dummies stay in the game, hurt each other, and the state stays reproducible data. |
| 91 | Two runs of 300 frames with 100 Dummies and the same inputs end with the same state, and the cross-check of the replay is clean. | The reproducibility the project depends on survives the Dummies. |
| 92 | The speed of a Dummy comes from its recipe through `finalSpeed` (a recipe of 3 gives Dummies of 3); a thing without a speed has 0; a Dummy speed of 0 or less stops the game when it loads. | Everything goes through the final functions, and the definitions are checked. |
| 93 | Two Dummies side by side at the same velocity (they do not close in on each other) overlap: both turn once, and nobody is hurt. | Below the minimum impact there is no hit, but the contact still turns the Dummy. |
| 94 | A Dummy that breaks a rock (1 health left) is still hurt by it (100 to 99), but is not pushed and does not turn, and goes through the broken rock. | The same rule as the avatar's: an object that breaks in the hit has no collision. |
| 95 | The collision grid finds the same collisions as testing every pair of Dummies: the same state after 200 frames, for cell sizes of 60, 100 and 300 (with more than 20 turns, so the comparison proves something). | The grid is a faster way to the same result, not a different rule. |

### Benchmark of the grid (not a test)

`node tests/agent/benchmark-grid.js [frames]` plays the same run (the real number of Dummies, the avatar still) with several cell sizes and prints, for each, the ms per step, the pairs tested per step, and the first frame that differs from testing every pair. The window keeps the same size in pixels, so only the cells change. The numbers depend on the machine. A cell below twice the largest radius of a Dummy loses collisions (it shows as "differs at frame 1"); from there up to about 100 px the result is identical and the cost is about the same; at 300 px it is close to testing every pair.


While writing the first 25 the agent changed the acceleration from 0.25 to 0.3 on purpose: 6 of them failed (05, 06, 07, 08, 20 and 24), and everything passed again after reverting it. The same was done for the collision: with the line that calls it switched off, tests 41 to 46 failed. For the damage, with the line that applies it switched off, tests 47, 48, 49 and 52 failed. With the impact threshold removed, 47, 49, 50 and 66 fail; with the rock never hurt, 48, 52, 61, 62 and 65 fail. For the kit, ignoring the weight in `finalSpeed` made 17 tests fail (5 to 8, 16, 28 to 32, 41, 43, 47, 53 to 55 and 60), and removing the guard for a dash strength of 0 made test 57 fail. Tests that never fail would be worthless.

## Adding a test

Add a block `test("NN what it checks", () => { ... })` to `sim.test.js`. Inside, `run(code)` executes code inside the game, and `plain(value)` turns a result into a normal object for `deepStrictEqual`. Keep the numbering, and add a row to the table above.
