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
- Things that only a real browser can show (frame rate, final position in each browser) are in **Chamber 0: Diagnostics**, not here.
- Combat is the body slam (tests 47 to 52), damage by type with resistance (116, 117) and the Biters with their hitboxes and the destruction of actors (119 to 127). The avatar's weapons came later: the repeater (133 to 143, 153), the Radar (154) and the sword (161 to 167); so did the shield of the Generator (144 to 151). The Dummies (tests 80 to 101) walk, turn and hurt what they touch, with the same body slam.

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
| 10 | The state carries the grid settings (64 / 61 / 35) and the player, at the origin, covers only the cell (0, 0) (`cells` from 0,0 to 0,0: a radius of 16 inside a cell of 64). | The grid settings live in the state so a run is reproducible. |
| 11 | Cell boundaries: a point (radius 0, which covers one cell) at 31.9 is still in cell 0, at 32 it is in the next. | Checks the rounding of `cellIndex`. An error of one pixel here would put actors in the wrong cell. |
| 12 | When the player walks, a still thing (a test fixture) keeps its cells and the player changes its own. | Cells are counted in the world, not around the player: an actor's cells change only when it moves, so pushing the avatar does not move everyone's cells. |
| 13 | Two actors of radius 16 that touch (31 px apart) share a cell at the origin, at (10000, -10000) and at (-7777, 3333); 200 px apart they never do. | The grid works the same everywhere in the world. |
| 14 | The default window reaches at least 1920 px and 1080 px from the player. | The user's requirement: the window covers at least twice the screen. |
| 15 | Bad grid settings (even size, zero, negative, `NaN`, missing field, a missing or broken screen size) are refused with an error. | The settings must fail loudly, not run with nonsense. |

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
| 21 | After 250 steps only the last 120 stay, and the oldest leaves first. | The history has a fixed size (120: two seconds at 60 steps per second, the user's round number). |
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
| 39 | **Known answer:** seed 1 gives 10 objects on the first screen, the first a Shroom at 136,-375 (radius 16, health 17, weight 1600, bounce 0.2, body slam base 1.6 blunt) and the last a rock at 99,456 (radius 28, health 10, weight 2800, bounce 0, body slam base 2.8 blunt); the types in order are shroom, rock, rock, shroom, shroom, rock, shroom, shroom, rock, rock. | A fixed point of comparison. If it fails after a change, every map changed. If it fails on another browser, the hash is not exact there (compare with the OBJECTS lines of DATA in Chamber 0). |
| 40 | The state keeps only the seed and the avatar (no objects). Over 5 seeds the seed rolls the type, the radius and the health of every object inside the ranges of its type, and every value of the ranges shows up (radius 16 to 32, health 10 to 20) for the rock and for the Shroom; `objectMargin(layer)` is the largest radius of the layer. | The state stays small, and nothing about an object is a fixed value. |

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
| 47 | Walking into the rock at 3 px/frame is a weak hit: the rock loses 2.5 (10 - 7.5), the avatar loses 1.08 (the rock's blunt packet, 1.4, goes through the avatar's 30 points of blunt resistance: 1.4 x 100 / 130), and it still stops. | Any contact above the minimum impact hits, but weakly. The bounce is a separate rule. |
| 48 | A dash (impact 12) into the rock costs the avatar 4.31 (2800 kg: blunt packet 5.6, resisted by 30 points) and the rock 10 (it breaks). Into a Shroom of radius 16 (1600 kg, packet 3.2) it costs 2.46, into one of radius 32 (3200 kg, packet 6.4) it costs 4.92; the Shroom loses 10 in both. | A hit hurts both sides, each with its own weight. |
| 49 | A glancing blow (impact about 1.4) hurts the rock, but less than the head-on walk of test 47; the avatar loses 1. | Only the part of the speed going into the rock counts. |
| 50 | The body slam packet at impact 12 is 5.6 blunt for the rock (100 x radius 28 = 2800 kg), 10 for the avatar (5000 kg), 8.7 for a lighter avatar; 2.8 at the reference impact 6, 1.4 at 3, an empty packet at no impact. The damage on the avatar (30 points of blunt resistance) is 2.46 from a Shroom of radius 16 (packet 3.2) and 4.92 from one of radius 32 (6.4). | The formula in numbers you can check by hand. |
| 51 | Health stops at 0. | There is no death yet. |
| 52 | The cross-check stays clean in a run where both avatar and rock are hurt, and the state stays plain numbers. | Damage must replay identically (determinism). |

### Rocks with health, and the weight of a still object

| # | What it checks | Why it matters |
|---|---|---|
| 61 | A hurt rock is stored by its square (`"0,1": 7.5`), keeps its health between frames, and the state is still plain JSON. | Only hurt rocks are in the state; the rest come from the seed. |
| 62 | A rock with 5 left breaks when a dash hits it (the avatar loses 4.31): no bounce and no push, the avatar goes through and takes no more damage. | A broken rock must really be gone. |
| 63 | Every rock rolls a whole health from 10 to 20, the same every time, and over 5 seeds every value from 10 to 20 shows up. | The range is respected and fully used. |
| 64 | The weight of an object, made by `finalizeObject`, is `weightPerRadius` x radius, a whole number: rock of radius 28 is 2800, Shroom 1600 (radius 16), 2400 (24), 3200 (32). Twice the radius is twice the weight. | The weight follows the radius, not the area (the user's decision), is computed at creation and nothing is rounded. |
| 65 | Pressing into the rock hurts it once, at the arrival (7.5 left, the avatar at 99, stopped at 55), and nothing more after 300 frames of pressing (no bounce, so no second collision). | Only real collisions hurt. |
| 66 | After walking away (no contact) and coming back, the second collision hurts again; the contacts list is plain state (`["avatar_1|rock 0,1"]` while touching, empty when apart). | A new collision is a new hit. |
| 67 | The attack comes from the weight alone: a rock with `weightPerRadius` 0 has an empty body slam packet and damage 0 at any impact (not even the minimum damage); the same rock with its weight hits with 5.6 blunt at impact 12 and costs the avatar 4.31. | There is no flag for who hits; weight 0 is harmless (the user removed `doesDamage`). |
| 68 | A hit with something in it always costs at least 1: a packet of 0.8 (Shroom of radius 16 at impact 3) against 30 points of blunt resistance costs 1; 6.4 (radius 32 at impact 12) costs 4.92; no impact costs 0. | Resistance never makes the target immune. |
| 69 | An impact below 1 (0.75, into a Shroom of radius 32, bounce 1) triggers nothing: no damage, no bounce, the avatar stops. | The collision threshold. |
| 70 | Every weight in the definitions is a whole number, 0 or more: the parts, and the `weightPerRadius`, `size.min` and `size.max` of every object. | The rule holds for the real data. |
| 71 | A `weightPerRadius` of 100.5, a radius of 16.5 or a part weight of -1 makes the game fail when it loads; a `weightPerRadius` of 0 loads and an object made from it has weight 0. | The check is real, and weight 0 is allowed. |
| 72 | A rock with weight 0 and health 1 does no damage to the avatar (not even the minimum), breaks at the first hit, and the dash goes through it at full speed. | Weight 0 works as a breakable, harmless thing with no special case. |
| 73 | The objects are the `rock` and the `shroom`, each a complete entry with its own `size: { min: 16, max: 32 }`, `weightPerRadius` 100 and `healthRange: { min: 10, max: 20 }`, and nothing else unused: the rock has exactly `name`, `size`, `weightPerRadius`, `healthRange`; the Shroom the same plus `bounce` `{ min: 0.2, max: 1 }`. | Each object is complete and unique, with no fixed health, no initial state and no placeholder. |
| 74 | A size with a radius that is not whole, a min above the max, or a weight modifier that is not whole stops the game when it loads, for the rock and for the Shroom, each on its own; weight 0 is allowed. | The check is real, for every object. |
| 75 | `finalizeObject` makes everything: an unknown type is refused, a rock gets the radius and health it was rolled and its own weight (2800), bounce (0) and body slam, and the first object of seed 1 comes out of the same function. The actor types are the avatar, the Dummy and the Biter; the avatar has radius 16. | One function, one shape, for the avatar and for every object. |
| 76 | The Shroom's `bounce`, made by `finalizeObject`, grows in a straight line from 0.2 (radius 16) to 1 (radius 32): 0.6 at 24, +0.05 for each pixel of radius. The rock has 0. | The bounce rule the user chose, in numbers. |
| 77 | A bounce above 1 or not a `{ min, max }`, a bounce minimum above the maximum, a `healthRange` with a 0, a half number or a minimum above the maximum, or an object without a size makes the game fail when it loads. | A bounce never ejects (the user's rule), the ranges are real, and a missing size is a clear error. |
| 78 | Changing the size of the rock in the data leaves the size of the Shroom as it was. | Nothing is shared between objects (the user's rule). |
| 79 | The avatar carries every final value. Static, calculated once when it is made: radius 16, bounce 0, acceleration 0.25, deceleration 0.125, health 100/100, recharge 240 frames, 1/1 charge. Dynamic, calculated again every frame: weight 5000, speed 3, resistance 30 blunt and 10 puncture, dash speed 12. When the run goes on with a blueprint without the Legs and the Booster, the next step writes weight 3500, speed 0 (0.5 - 3500 x 0.0002 is below zero), resistance 20 blunt and 10 puncture and dash speed 0, and the static values stay as they were made. | The user's rules: everything calculated is stored in its actor; what is dynamic is calculated every frame, what is static at the start of the run. The avatar's weight is dynamic because ammunition weighs. |

### The kit of parts

The avatar's final values are the sum of the specs of the parts in its blueprint (starter blueprint: nine parts, 5000 kg). Most of the other tests play with the starter blueprint: the test file passes it to `step` by default.

| # | What it checks | Why it matters |
|---|---|---|
| 53 | The starter blueprint adds up to weight 5000, capacity 8000, speed 3, health 100, resistance 30 points of blunt and 10 of puncture, dash 12, and the avatar starts with full health. | The kit keeps what the avatar had before parts, now with resistance by type. The capacity is the user's 8 t (room for ammunition and parts). |
| 54 | Taking off a 650 kg arm gives back 0.13 px/frame of speed (650 x 0.0002), a 200 kg head 0.04. | The weight effect is direct and easy to see: kg times a constant. |
| 55 | Without the Legs the speed would be negative (0.5 - 3700 x 0.0002), and it is 0. | The controls never reverse. |
| 56 | Without the Torso health is 45 and the resistance is 10 blunt and no puncture; without the Head health is 85 and the resistance is still 30 blunt and 10 puncture. | Each part adds exactly what it gives, by type. |
| 57 | Without the Booster there is no dash charge (`finalDashMaxCharges` is 0, `finalDashRechargeFrames` is 0 and with it 240, and a new avatar starts with `{ now: 0, max: 0 }`) and a dash does nothing; with it the maximum is 1 and a new avatar starts full. | A dash, and its charges, come from a part, not from nowhere. |
| 58 | A blueprint over the capacity of the Torso is refused (8900 kg of 8000), and so is an unknown part. | The capacity is a hard limit. |
| 59 | Another actor of the same type, with another id, gets nothing from the parts: speed 0, no resistance, and its maximum health is its own (7 here), not the blueprint's. | Only the avatar has a blueprint. |
| 60 | The cross-check is clean with the blueprint the run was played with, and finds a difference with another. | The blueprint is an input of the replay, as the seed and the inputs are. |

### The Dummies

Tests 80 to 101 (most run in a game without objects, so only the collisions the test sets up happen). The other tests of the file play in a game with no Dummies, because a wandering Dummy also hurts rocks; the Dummy tests use 100 Dummies, not the real count, to stay fast (a patch of the count that stops finding its text fails loudly).

| # | What it checks | Why it matters |
|---|---|---|
| 80 | The seed makes the Dummies (100 in the test game; the real game has more, for the stress test), `dummy_0` onward, each with a radius of 8 to 16, health 100, speed 2, acceleration 0.125 and deceleration 0.0625 from its recipe, a whole angle from 0 to 359, born still, wanting to walk at its angle, with its whole body off the screen and its center inside the window of the grid; radii and angles are varied; the same seed gives the same Dummies and another seed gives others. | Every value of a Dummy comes from its ranges and the seed, like an object's, and the birth follows the rule of every actor. |
| 81 | Birth: over 20 seeds the Dummies use all four strips of the ring between the screen and the edge of the window (left, right, above, below), none is born on the screen, some pairs are born overlapping (no free place is searched), and after 30 steps every one of those pairs is apart. | The user's rule: an actor is born anywhere off the screen, inside the window, and the push of the collision resolves what it lands on. |
| 82 | A Dummy with no collision walks 60 frames in a straight line at speed 2, and keeps its angle (37) and its turns (0). | The walk is a straight line. |
| 83 | A Dummy that walks into the rock of seed 1 is pushed out to just touching, turns (its new angle is `hashInts(seed, number, turns, 16) % 360`), and nobody is hurt: the rock keeps its health and the Dummy its 100, although the impact (2) is enough for a collision. | The user's rule (2026-11-10): the body slam hurts only where the avatar is one of the two sides. A Dummy against an object is a collision without a hit. |
| 84 | The angles of 40 turns are exactly `hash(seed, 3, turns, 16) % 360`, whole degrees from 0 to 359, at least 20 different, and the direction always has length 1. | The `rand(360)` is reproducible and varied. |
| 85 | A pair that was touching in the last frame still pushes the two apart to just touching (the avatar moves its share, `weight of the Dummy / (both weights)` of the 5 px overlap, to the left), but the Dummy keeps its angle and nobody is hurt; a new contact of the same pair turns it and hits both ways (the avatar hits for 5000 x 0.001 x 2 / 6 = 1.667, the Dummy for the minimum 1). | Friction is not a hit, but it still separates. |
| 86 | Two Dummies of different weights that walk into each other (closing at 4) are pushed apart to just touching, split by weight (what each moved back is in the proportion of the other's weight), both turn, and neither is hurt. | Two actors never hurt each other; the push follows the weights. |
| 87 | A Dummy that bumps into the avatar turns once and the two are pushed apart to just touching; the avatar (5000 kg) moves only `weight of the Dummy / (weight + 5000)` of the 1 px overlap, less than a quarter; the Dummy loses 1.667, the avatar the minimum 1 (the Dummy's attack is below the defense). | The heavy mecha barely moves for a light enemy, and both hurt each other. |
| 88 | A Dummy 1 pixel past the left edge of the window comes back 1 pixel inside the right edge; the same for the other three edges, exactly on the left edge is still inside, and it follows the avatar when the avatar is somewhere else. Walking left across the edge in `step` keeps its angle (180), its turns (0) and its speed. | The window of the grid is the area of the game, and it wraps. |
| 89 | `sinDegrees` and `cosDegrees` give unit length (error below 1e-10) for 360 whole degrees, the known values (sin 30 = 0.5, cos 180 = -1, ...) and work with negative degrees and more than 360. | An own series, so the result is the same in every browser. |
| 90 | After 600 frames with the avatar walking, every Dummy is still inside the window around the avatar, the Dummies collided (more than 20 turns), something was hurt, and every hurt Dummy and every hurt object was at some frame in contact with the avatar; no health below 0; the state is still plain JSON. | A long run exercises the rule of who hurts whom: nothing is hurt without the avatar. |
| 91 | Two runs of 300 frames with 100 Dummies and the same inputs end with the same state, and the cross-check of the replay is clean. | The reproducibility the project depends on survives the Dummies. |
| 92 | With the Dummy's `speed` patched to 3 in the data, a Dummy carries 3 and, alone, is walking at 3 after 24 frames (3 / 0.125); `finalSpeed` of a thing without a speed is 0; a speed of 0 or below stops the game when it loads. | The speed is a value of the recipe that goes through a final function into the actor. |
| 93 | Two Dummies side by side at the same velocity (they do not close in on each other) overlap: both turn once, and nobody is hurt. | Below the minimum impact there is no hit, but the contact still turns the Dummy. |
| 94 | A Dummy that walks into a rock with 1 health left does not break it: the rock keeps its 1, the Dummy keeps its 100, is pushed out and turns like at any contact. | A Dummy cannot break an object (only the avatar hurts objects). The old behavior, an object broken in a hit having no collision, is kept in the code for the day another actor hurts objects. |
| 95 | The collision grid finds the same collisions as testing every pair of Dummies: the same whole state after 200 frames, for cells of 12, 20, 60, 100 and 300 (with more than 20 turns, so the comparison proves something). | The grid is a faster way to the same result, not a different rule, and no cell size loses a collision. |
| 96 | The cells of an actor are the rectangle its circle reaches: radius 16 at the center covers one cell; at 20 px to the right it covers two; over a corner, four; a point covers one; a radius of 256 covers 9 x 9; and they are relative to the avatar. | `setCells` in numbers, borders included. |
| 97 | In 20000 pairs of circles for each of three cell sizes (16, 64 and 300; radii 1 to 300), every pair that overlaps shares a cell. | The reason the grid cannot lose a collision, whatever the sizes. |
| 98 | With Dummies of radius 256 and 128 among the others, the state after 200 frames is the same as testing every pair; the radius of 256 covers 8 or 9 cells each way, and the huge Dummy collided. | Huge actors need nothing special (the user's decision: several cells for any actor). |
| 99 | Three Dummies in a row: the first overlaps the second, which is pushed over the border of a cell into the third, with which it shared no cell before. Both collisions happen in the same step. | The cells are written again at once when a Dummy is pushed. (Without that, this test and 100 fail; it was tried.) |
| 100 | At the start and after each of 300 steps, the cells stored in every actor are the ones computed from its position and radius, with Dummies over borders, pushed and wrapped. | The stored cells are the truth the collision reads (the user's rule: read from the object). |
| 101 | No actor recipe in the definitions (the avatar's `radius`, the Dummy's `size.max`) allows a radius above the smallest space between the screen (the canvas in `index.html`, 1920 x 1080) and the edge of the window of the grid: 580 px up and down (992 across). A Dummy recipe that goes up to 581 is caught; up to exactly 580 is not. | The user's rule: an actor wraps when its center leaves the window, and that jump must never be seen, so an actor that large cannot be made in the first place. |
| 102 | A layer of the ground that cannot be made is refused when the definitions load: a square of 64 with a radius of 32 (no room for the center) is refused and 65 is accepted; an unknown kind, an empty list of kinds, a chance of 101 and two layers with the same square (256) are refused; a valid second layer loads. | The user's rule: the thing that cannot exist must not be creatable, so the mistake shows when the game loads and not as a wrong map. |
| 103 | In a patched copy with a layer "huge" (an object "giant" of radius 200 to 256, a square of 2048, every square has one), over 5 seeds: every giant stays inside its square; the small objects that remain are exactly the ones of the real game, minus only those that overlap a giant (the layer with the larger square wins); more than 100 giants and at least one small object removed, so the rule really ran. | Preparing for huge things in the seed does not change the small ones except where a huge one sits on top. |
| 104 | A giant whose center is far from an actor (the actor 3 px inside its edge) is found by `objectsReaching` and `objectsNear` but not by `objectsInArea` (its center is not in the area), and one step pushes the actor out until it just touches. | The collision and the drawing need the objects that touch, not only the ones whose center is near. |
| 105 | The damage of an object is stored under `"layer:squareX,squareY"`; the same square in two layers gives two different keys. | Two layers never share the damage of an object. |
| 106 | Every actor in the state (the avatar and every Dummy, 101 in the test game) carries `crushes`, a plain boolean, off. | The user's decision: crushing is a potential behavior of every actor, the same box for all; it lives in the state, where a buff will switch it on. |
| 107 | An avatar with `crushes` on walks into the rock of seed 1 (10 health) and into a Shroom: each is broken at once (health 0 in `damagedObjects`), the avatar keeps its 100, moves its full 3 px, keeps its velocity (no push, no bounce), records no contact, and walks on through; the Shroom is crushed while pressing at 0.5 px/frame, below the minimum impact. | Crushing is a rule, not a big damage: no formula, no threshold, no collision response. |
| 108 | A Dummy with `crushes` on walks through the rock without turning, in a straight line (it walked exactly speed x frames), and the rock is gone; when another Dummy stands in its way the two collide as always (both turn, pushed to just touching). | Crushing is about objects only; a crusher meets actors like anyone. |
| 109 | The push between actors is split by weight: a giant Dummy of radius 256 (25600 kg) against the avatar (5000 kg) moves 5000 / 30600 = 16% of a 10 px overlap and the avatar 84%; two Dummies of the same weight move 5 each; two of weight 0 (a patched Dummy with `weightPerRadius` 0) also move 5 each, with no division by zero. | The user's decision: the heavy mecha pushes light enemies and heavy enemies push it. The proportion is the other's weight over the sum. |
| 110 | An avatar at x = 15.9 (its cells end in column 0) pushed over the border at 16 by a giant has its stored cells written again in the same step (column 1), and three heavy Dummies walking into the avatar for 200 frames give, with the grid, exactly the state of testing every pair, the avatar having moved. | The avatar is now pushed, so its cells must follow at once, like a Dummy's; the grid stays a faster way to the same result. |
| 111 | The test helpers refuse a patch of the data that changes nothing (`loadGame`), and `patchOnce` refuses a text found zero or two times. | A patch that no longer matches must fail loudly, or the test silently plays the real game (it happened once with the count of Dummies). |
| 112 | Every test of `sim.test.js` has exactly one row in this table and every row has its test; no number is used twice. | The table is how the user reads the tests; a test without a row, or a row whose test is gone, is a silent drift. |
| 113 | `src/sim.js` and `src/history.js` contain no `Math.random`, no trigonometry, powers, exponentials or logarithms of the browser, no `**`, no `Date` and no `performance` (comments aside). | Reproducibility: those can differ between browsers or between runs. The rules use only + - x / and `Math.sqrt`, `Math.imul`, `Math.floor`, and our own sine series. |
| 114 | A Dummy born still and pointed to the right gains 0.125 px/frame every frame, is at 1 after 8 frames and at its speed of 2 after 16, with no sideways drift. Turned around, it does not jump: one frame later it is at 1.875, after 16 frames it is stopped, after 32 it walks at 2 the other way. | The user's decision: every actor that moves has an acceleration and a deceleration in its recipe, and its velocity is calculated like anyone's. A turn is a curve. |
| 115 | A Dummy walking down at 2 head on into the Shroom of seed 1 (bounce 0.2) leaves it at 0.4 upward, just touching; off center into the rock (no bounce) the part of its velocity going into the rock is gone and the part along the surface is unchanged, so it slides. In both the Dummy keeps its 100, the object is not hurt, and the Dummy turns once. | The user's rule: a Shroom bounces everyone, it only does not hurt everyone. One routine, `collideWithObjects`, for every actor that meets an object. |
| 116 | Resistance is a curve: a 10 blunt hit costs 10 with no points, 8.85 with 13, 5 with 100, 3.33 with 200, 2.5 with 300 and 1 with 900; it never reaches 100%, every 100 points add the same amount of life, and 9900 points still cost the minimum 1. | The user's rule: more armor always counts, with no immunity. |
| 117 | Each type of a packet is resisted on its own (6 puncture + 3 blunt against 100 puncture points is 3 + 3), the record lists the terms in the order of the types, an empty packet costs 0, a tiny one costs 1, and no resistance takes everything. | The user's sword-of-fire example: the blade still hits. |
| 118 | Bad definitions stop the game when it loads: an unknown spec name in a part, resistance to a type that does not exist or below zero, a negative health spec, an attack with an unknown type, negative numbers, a fractional reach, a hitbox with 0 frames, and an attack named `bodySlam`. | A typo in `data.js` must be loud. |
| 119 | An attack is `{ base, now }`: the base is made once when the actor is made (Biter: flat 3 + 0.002 x weight, 5.4 for radius 12 and 7 for radius 20; body slam: weight x 0.001), the rest of the attack is copied as it is, and `now` is calculated every frame from the weight the actor has then (the same as the base while the weight does not change; with a weight of 1 kg the bite is 3.002). The avatar has only the body slam (5 blunt). | The user's rule: static base, dynamic part that something can change. |
| 120 | A Biter walks straight at the avatar: unit direction (also on a 3-4-5 diagonal), speed up by 0.125 per frame to 2.5 (full speed at frame 20, distance as expected), and the distance only shrinks. | The Biter's first behavior. |
| 121 | Within its reach the Biter holds still for 15 frames (the windup, no hitbox yet), then strikes: one hitbox is born one body ahead of it with the packet the bite has now, hurts in that same step and is gone (it lives one frame; its trace is in the visual state), the Biter stays still for 10 frames more (the freeze) and then chases again. | The user's idea: a short pause before the bite and one after it, to prove both can exist. |
| 122 | A hitbox hurts the avatar once, in the frame it is born, with the packet it was born with resisted by the avatar's puncture points; the bite lives one frame and is gone; a hitbox that lives 3 frames and keeps touching the avatar still hurts it only once, with the packet it was born with even if the bite changed afterwards. | The hitbox keeps the final value, frozen at birth. |
| 123 | The side rule: the avatar's hitboxes hurt everyone but the avatar, anyone else's hurt the avatar; a hitbox that misses hurts nobody and keeps losing frames. | One rule for who hurts whom. |
| 124 | An actor with no health left leaves the scene at the end of the step and the others keep their order; the avatar at 0 stays (no death for it yet); a dash kills a weak Biter; a Dummy in Chamber 1 goes too. | The user's destruction function: it only removes the actor from the scene. |
| 125 | Two Biters that overlap are pushed apart by weight until they just touch, nobody is hurt, and the pair is in the list of contacts. | One collision routine for every mover. |
| 126 | Chamber 2 has 40 Biters (`biter_0` to `biter_39`), no Dummies, born off the screen inside the window with radius 12 to 20 and 30 health, the same for the same seed and different for another, as plain JSON. | The world of Chamber 2. |
| 127 | A run of Chamber 2 is reproducible: 900 frames with the avatar standing among 40 Biters give the same state twice and a clean cross-check, and the Biters do reach it and bite (seen by the traces of the one-frame bites). | Combat must be deterministic like everything else. |
| 128 | Every salt of the seed is named in one frozen table (`SALTS` in `src/sim.js`), all the numbers are different, and no call of `hashInts` or `rollInRange` writes a bare number as its salt. | A repeated salt would tie two rolls together with no sign of it. |
| 129 | `src/data.js` and `DEFINITIONS_VERSION` change together: the test keeps the version and a fingerprint of the data (comments and spaces aside). A change of the data with the same version fails; a change of both asks to update the pair in the test. | The version is raised by hand, and forgetting it would replay old runs under new rules. |
| 130 | A snap of another definitions version is refused by `stateFromSnap` with a clear message. | A snap is only valid under the rules it was played with. |
| 131 | Every screen that is played (`CHAMBERS` in `src/main.js`) is in `GAME_SCREENS` of `src/input.js`. | Space only dashes in the screens of that list: Chamber 2 was missing from it at first and the dash did nothing there. |
| 132 | With `windupFrames` 0 the Biter strikes in the same step it gets within reach; and if the avatar leaves during the windup the hitbox is born anyway (its trace shows it) and lands on nothing. | The windup is data, not a rule written into the AI; leaving is what the pause is for. |
| 133 | The combat blueprint has a repeater arm in place of the plain Arm L: 5150 kg of parts plus 400 rounds of 6 kg is 7550 loaded (under the 8000), the avatar starts with the weapon full (30 + 370), weight 7550 and the speed that gives; its attack is { base, now } of 10 puncture with the bullet numbers; the starter blueprint has no weapon (no weapons, weight 5000, only the body slam). | The first weapon is a part, one per slot, and its ammunition weighs. |
| 134 | The auto-aim picks the closest actor in range (the first in the list on a tie), ignores what is out of range and what has no health; the bullet is born at the center of the avatar and moves 8 px per frame toward it (a 3-4-5 triangle checks the direction). | Auto-aim with a rule that is the same everywhere. |
| 135 | The repeater fires at steps 1, 11, 21 and 31 (every 10 frames) while it has a target and a round, and not at all with nothing in range. | The cadence. |
| 136 | Every round fired makes the mecha 6 kg lighter (the weight follows one step later) and its top speed higher (4 - weight x 0.0002); a reload starts when the magazine is empty and there is a reserve, lasts 90 frames, moves min(30, reserve) rounds from the reserve to the magazine and changes no weight; with nothing left it does not fire or reload. | The user's idea: the mecha gets lighter and faster as the ammunition is spent. |
| 137 | A bullet travels 8 px per frame, hurts the first thing it touches with the packet it was born with (10 puncture; changing the attack afterwards changes nothing in the bullet) and, with pierce 0, ends there: the second thing in line is untouched. | Pierce 0: nothing is crossed. |
| 138 | Pierce is how many times a bullet crosses: pierce 1 hurts two of three in line and ends on the second, pierce 3 hurts all three, and nobody is hurt twice by the same bullet. | The user's decision: the name says the effect, not the number of targets. |
| 139 | A bullet that kills spends no pierce on the corpse and the dead actor is gone at the end of the step; the avatar's bullets never hurt the avatar. | Destruction meets the weapons. |
| 140 | A weapon must be sound when the data loads: only the closest rule, whole numbers, known types of damage above zero, rounds with a whole weight, a bullet that lives long enough to reach its range and is slower than the smallest radius (so it cannot skip over an actor). | A bad weapon in the data (or one sold from outside) stops the game loudly. |
| 141 | A Chamber 2 run with the repeater is reproducible: 900 frames among 40 Biters give the same state twice and a clean cross-check; rounds are spent, the weight is lower by 6 kg per round, and Biters die. | Weapons must be deterministic like everything else. |
| 142 | The body slam follows the weight the avatar has now: made once at the loaded weight (7.55 with the repeater full), 0.006 lighter for every round fired, and a hit by body slam takes that value. | The user's rule: the body slam follows the weight, so a mecha that fires its ammunition hits lighter and is pushed more. |
| 143 | The avatar's weight is the parts of the blueprint plus the rounds in its own weapon state: made armed and stepped with a plain blueprint it still carries its ammunition (7400), made plain and stepped with an armed one it carries none (5150). | The weight and the weapons come from one place, so they cannot disagree (a finding of the Fable's review). |
| 144 | The Generator gives the avatar its shield: 40, a wait of 180 frames, 0.25 back per frame and 11 points of resistance to each type while it lasts; born full and not waiting, and its radius is the ring, 16 x 1.8 = 28.8. Without a Generator there is no shield and the radius is the body. | The user's shield (2026-11-12): from the Generator, with the ring a little bigger than the body. |
| 145 | The shield absorbs first and the rest goes to health: a hit of 20 blunt costs 20 x 100 / 141 from the shield (30 points of the parts plus 11 of the shield), and a bigger hit empties the shield and the rest hurts the health. | The user's order (decided 2026-11-11): the damage is calculated, the shield takes it first, what is left goes to health. |
| 146 | The resistance of the shield counts only while it has something left: 41 points of blunt and 21 of puncture with it, 30 and 10 without, and the record of the hit says how many came from the shield. | The user: "when it dies it just leaves the total". |
| 147 | The shield waits 180 quiet frames after any damage, then gives back 0.25 per frame up to the maximum (30 at frame 179, 30.25 at 180, 40 at 219); damage during the regeneration starts the wait again. | The user's refresh time before recovering after a while without damage. |
| 148 | The radius of the avatar follows the shield in a straight line, from the body (16, empty) to the ring (28.8, full), half a shield is 22.4; it is calculated again every frame and stored in the avatar, and the body radius never changes. | The user's ring that grows as the shield regenerates; the collision reads the actor's radius. |
| 149 | The ring growing over a Biter hurts nobody (a hit needs an impact): the Biter is pushed out and nothing is absorbed; walking into a Biter with the shield up is a real hit and the shield takes it. | The user: no body slam when the ring grows, and no step of collision added for it. |
| 150 | The cross-check stays clean in a shielded run of 900 frames where the Biters drain the shield, and the shield is plain numbers. | Reproducibility: the new state is part of the snaps. |
| 151 | The shield specs are checked when the data loads: resistance only to known types of damage, the wait a whole number of frames 1 or more, the maximum 0 or more. | What must not exist cannot be made. |
| 152 | Every function or constant that the "Code layout" section of `AGENTS.md` names exists in `src/`. | Several agents read that map first; it must not point to something that is gone (it once named `createHitbox` after it was merged away). |
| 153 | A bullet has no life in frames: it flies past the old range of 520 px and goes only when its center leaves the window of the grid around the avatar (the spent pierce and the bite's frames are tests 122 and 138). | The user's decision, 2026-11-12: projectiles die only when they leave the grid. |
| 154 | The Radar is the only truth about what can be aimed at: the Head gives the avatar a radius (312 px), the repeater has no range, an actor beyond the Radar is not shot at and one inside is, and a blueprint with no Head sees nothing. | The user's rule, 2026-11-13: the Radar, not the weapon, decides what can be targeted. |
| 155 | The visual state holds no truth: 600 frames of Chamber 2 with it and without it give exactly the same state, and the cross-check is clean. | The user's rule, 2026-11-13: the rules write the visual state and never read it; erasing it changes no decision. |
| 156 | A trace is born at age 0 where a one-frame hitbox was born, ages one frame per step and goes at 12; a bullet leaves none; the history keeps the visual state per snap and going back shows that frame's traces. | The user's decision: the eye sees what the rules no longer need (a one-frame bite), and stepping back must show it too. |
| 157 | Things are born after everyone has moved: a bullet fired in a step where the avatar dashes is born at the avatar's final position (its center), toward the target as seen from there, and the bite of a Biter is born toward the avatar's final position. | The user's decision, 2026-11-13: the actor moves and only then the hitbox is born, so it is where the bodies really are. |
| 158 | A Biter that died in the step does not strike: its decision triggers nothing (only the living Biter leaves a trace) and the flag goes down anyway. | The user's decision, 2026-11-13: the Biter dies and does not attack; the flag triggers nothing. |
| 159 | The audit writes every hit with its numbers: a bite on the avatar (puncture against 10 points of resistance: reduction 10/110, total, shield and health lost), with the frame the screen shows when it is seen (the bite of the step from frame 0 is written as frame 1, the state after that step), a bullet on a Biter, and the totals by kind of hit. | The user's axis of transparency: who hurt whom, with what, for how much, and what the resistance took off. |
| 160 | The audit holds no truth and is bounded: the same state with it and without it, only the last hits kept (10 in the test; the totals count all), a copy per snap in the history and going back shows that frame's audit. | Same rule as the visual state; the states stay cheap and a replay does not count a hit twice. |
| 161 | A circle touches a cone when it overlaps it at all (exact test, no trigonometry in the rules): center inside, only the arc, only a straight edge, only the tip; and the misses (behind, beyond, to the side, touching exactly). | The user's decision: hit = any overlap, as in the bite; step A of the sword. |
| 162 | A cone is a hitbox shape: its tip is the center of the avatar, it points where it was born to point, hurts a target that overlaps it by any part (even half), not one behind or beyond, lives one frame, and its trace carries the shape. | The user's decision: fixed cone, one frame, any overlap hits; step B of the sword. |
| 163 | The sword arm is data: the recipe `melee` is read as written and checked; a bad reach, angle, frames, aim correction, type or amount of damage, or a part with both `weapon` and `melee`, stops the game with a message that names it. | The user's decision: the sword is the second arm; step C of the sword (numbers are guesses, written with reasons in `src/data.js`). |
| 164 | The sword swings: a target inside the reach starts the windup (12 frames), the cone is born at the last one and hurts for one frame (30 of slash), then 18 frames of recovery and the next windup (blows at steps 13 and 43); a target outside the reach starts nothing; an avatar without a sword has no melee state. | The user's decisions: the swing starts when a target is within the reach, one frame of damage; step D of the sword. |
| 165 | The aim of the sword is locked when the windup starts but may be corrected: each frame of the windup it moves aimCorrection of the way toward where the target is now (length stays 1, no trigonometry); with 0 it never turns; with the target still it stays. | The user's decision: aim locked at the start of the windup with room to correct; step E of the sword. |
| 166 | The blow comes even if the target is gone during the windup: it lands on nothing and the recovery begins at the same step. | Same rule as the Biter's strike (test 158 and the windup test); step F of the sword. |
| 167 | The combat blueprint has the sword arm (right) and the repeater arm (left): 7750 kg loaded, one sword and one weapon in the avatar of Chamber 2. | The user's decision: the sword is the second arm, the right one; step G of the sword (the tests of the repeater keep their own blueprint, without the sword). |
| 168 | AGENTS.md opens with the two foundations (go slowly; break big tasks into small closed steps), before any other section. | The user: these two are "the base of everything". |
| 169 | The first dash cannot touch an object, for every blueprint in the data, with the shield full. The dash is played, not computed, in an empty world: the starter blueprint dashes 142.5 px in 19 frames, the combat blueprint 147.45 px in 21 (heavier, so slower to fall back to its top speed), both born with the radius of the ring (16 x 1.8 = 28.8). With the largest object of the layer (32): 147.45 + 28.8 + 32 = 208.25, below the safe radius of 220. With the old safe radius of 200 both blueprints break the promise (203.3 and 208.25). | Review of 2026-11-13, point 1 (issue 4): the ring of the shield and the heavier blueprint had made the old 200 too small. |
| 170 | The reach of the sword is counted from the center of the avatar, so the shield does not change it: with the real shield full (radius 28.8, the ring) or empty (16, the body), a Biter whose edge is 90 px from the center starts the windup and one at 90.5 px does not. The cone is born at the center of the avatar, hurts the Biter and leaves the avatar's health and shield untouched. | The user's decision (2026-11-13, review point 2, issue 2): every hitbox of the avatar is born at its center and the sword's reach keeps its number. |
| 171 | Calling the static and the dynamic lists again on a living avatar changes nothing: with the real shield and the combat blueprint, the body stays 16 and the ring 28.8 after a second and a third call, and the whole avatar is the same as after the first. Before, the body grew 16 → 28.8 → 51.84, because the static list read the ring as the body. | Review of 2026-11-13, point 3 (issue 5): the first thing that changes the avatar during a run (a part swapped, a transformation) will call the static list again. |

### Benchmark of the grid (not a test)

`node tests/agent/benchmark-grid.js still|giants [frames]`. The same run (the real number of Dummies, the avatar still) is played with several cell sizes in a window of the same size in pixels, and compared frame by frame, as the whole state, with the same run played by testing every pair of Dummies. It prints ms per step, pairs tested per step, the cells a Dummy covers on average, and "identical" (it must always be: no cell size can lose a collision). The times depend on the machine.

- **still:** the Dummies of the game. On the agent's machine the cost was lowest around 60 to 100 px, and rose for much smaller cells (each Dummy covers many) and much larger ones (many Dummies per cell).
- **giants:** the same, with the first eight Dummies made huge (radii 256 and 128). Small cells become expensive, because a huge Dummy covers thousands of them; 60 to 100 px stayed the cheapest.

## The games the tests play

The tests written before the shield play in a game whose Generator has no shield (`loadGame` takes it out unless a test asks for `{ shield: true }`), because they count every point the avatar takes and use its radius of 16. The tests 144 to 151, and test 129 (which reads the real file), use the real Generator.

## Known answers in the browser

The SIMULATION CHECK of Chamber 0 plays a scripted run of the real game (the Dummies included) twice and prints the final position of the avatar. In Node, with the real data, it is `x=95.11790371750584, y=207.97893168210936` (the last Chromium value, before the shield, was `x=94.85277763889981, y=201.26268181996477`; not measured again in the browser), with the cross-check `none`. It changes whenever a rule or a value changes (the last change: the shield, whose ring makes the avatar wider), so compare it with the value of the commit being checked, not with an old one.

## Cost of the layers

`node tests/agent/benchmark-layers.js` plays 300 steps with the real number of Dummies and counts the objects the seed makes in 20 seeds; with `huge` as an argument it adds, in memory only, a layer of huge objects (radius 128 to 256, a square of 2048, a chance of 50%, about one giant every four screens). Nothing in `src/data.js` has a huge object. Measured on the agent's machine, in Node:

| | small objects in 20 seeds | huge objects | ms per step |
|---|---|---|---|
| before the layers (the last commit) | 15548 | 0 | 7.3 and 8.7 |
| the layers, with the real definitions (one layer) | 15548, **exactly the same objects** | 0 | 7.0 to 8.7 (the same, within the noise of the machine) |
| the layers, plus the huge layer | 15268 (280 removed, 1.8%: the ones under a giant) | 342 | 16.8 to 17.7 (about 2.2 times) |

So **preparing for huge objects costs nothing while no huge layer exists**, and the small objects do not change (the same objects, found at the same cost). Once a huge layer exists, every search for the objects near a thing asks one more layer, and every small object that exists also asks the bigger layers whether it is under one, so a step costs about twice as much with 1000 Dummies. The search is the largest cost left in a step (it is the same lookup by formula as before, only repeated per layer), so the first thing to try, if it hurts, is to make a lookup cheaper (for example, to roll the position and the radius of a square without building the whole object, which copies the recipe) before asking the huge layer.

## Proof that the tests can fail

While writing the first 25 the agent changed the acceleration from 0.25 to 0.3 on purpose: 6 of them failed (05, 06, 07, 08, 20 and 24), and everything passed again after reverting it. The same was done for the collision: with the line that calls it switched off, tests 41 to 46 failed. For the damage, with the line that applies it switched off, tests 47, 48, 49 and 52 failed. With the impact threshold removed, 47, 49, 50 and 66 fail; with the rock never hurt, 48, 52, 61, 62 and 65 fail. For the kit, ignoring the weight in `finalSpeed` made 17 tests fail (5 to 8, 16, 28 to 32, 41, 43, 47, 53 to 55 and 60), and removing the guard for a dash strength of 0 made test 57 fail. Tests that never fail would be worthless.

## Adding a test

Add a block `test("NN what it checks", () => { ... })` to `sim.test.js`. Inside, `run(code)` executes code inside the game, and `plain(value)` turns a result into a normal object for `deepStrictEqual`. Keep the numbering, and add a row to the table above.
