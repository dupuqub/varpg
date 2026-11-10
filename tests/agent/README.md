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
- Nothing here tests collision or combat, because they are not implemented yet.

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

## Proof that the tests can fail

While writing the first 25 the agent changed the acceleration from 0.25 to 0.3 on purpose: 6 of them failed (05, 06, 07, 08, 20 and 24), and everything passed again after reverting it. Tests that never fail would be worthless.

## Adding a test

Add a block `test("NN what it checks", () => { ... })` to `sim.test.js`. Inside, `run(code)` executes code inside the game, and `plain(value)` turns a result into a normal object for `deepStrictEqual`. Keep the numbering, and add a row to the table above.
