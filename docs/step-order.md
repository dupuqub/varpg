# The order of a step

One frame of the game is one call of `step(state, input, blueprint, visual)` in `src/sim.js`. **The order below is a contract:** many rules depend on it, and changing it changes what a run is. This file says what each stage does and why it sits where it sits. It has no game values (those are in `src/data.js`).

The code carries the same numbers in the comments of `step`. If one of the two changes, change the other in the same commit. Test 157 proves the one rule below that is easiest to break (things are born after everyone has moved).

## The stages

| # | Stage | What it does | Why here |
|---|---|---|---|
| 0 | Dynamic values (`finalizeDynamic`) | Every actor recalculates what changes during a run: weight (the avatar's ammunition), top speed, resistance, the radius of the shield, what each attack is now. | Everything after reads the values of this frame. |
| 1 | Input | The avatar's wanted direction is copied from the input. | The input is an argument, never read again later in the step. |
| 1b | The minds (`think`) | Each actor with `ai` decides where to go and whether to strike. A strike only raises `ai.strike`; nothing is born yet. | Movement uses the direction the mind chose, so the mind must decide first. |
| 2 | Movement | Each actor that moves walks, in list order, and collides with the still things (objects). | |
| 3 | Cells | The grid cells each actor covers are written. | The actor collision reads them. |
| 4 | Collision between actors | Actors push each other by weight and hurt each other with the body slam; each reacts to a new contact. | After everyone moved. |
| 4b | Things are born | Every hitbox is born here, through `spawnHitbox`: the strikes the minds decided in 1b (`emitStrikes`) and the shots of the avatar's weapons (`fireWeapons`). | The user's rule (2026-11-13): the actor moves and only then the hitbox is born, so it is where the bodies really are. |
| 5 | Hitboxes hurt (`resolveHitboxes`) | Each hitbox moves by its velocity, hurts what it touches (each thing once), loses a frame, and goes when its frames or its pierce are spent, or (a bullet) when it leaves the window of the grid. | After birth, so a one-frame hitbox is born and tested in the same step. |
| 6 | Destruction (`removeDestroyed`) | Whoever has no health left leaves the scene, in one place. | At the end, so nothing is removed while a loop walks the list. |
| 7 | The shield | The quiet frames count and the shield regenerates when the wait is over. | After the damage of this step. |

The frame counter goes up at the very end.

## Rules that follow from the order

- **A hitbox is born after everyone has moved** (4b), where the bodies are in that frame. A bullet fired in a dash starts at the avatar's final position.
- **A hitbox lives its frames** (the bite and the sword: one, so it is born, hurts and is gone in one step); a bullet has no frames (`framesLeft` null).
- **Whoever died in this step does not strike** (4b skips an actor with no health, and still lowers the flag).
- **The visual state is written, never read, by the rules.** `step` ages its traces at the very start (so a trace born in this step is drawn at age 0), and `spawnHitbox` writes a trace when a hitbox that lives its frames is born. A run with it and a run without it give the same state (test 155).
- **The audit is written, never read, by the rules** (`recordHit`, called wherever damage is applied: the body slams in stages 2 and 4, the hitboxes in stage 5). A run with it and a run without it give the same state (test 160).
- **Simultaneous hits are decided by the order of the list** (deterministic, but arbitrary): two things that kill each other in the same step resolve in list order.

## Room left on purpose

Hitboxes that follow their owner (an aura, an orbiting blade, a beam, a sweeping sword, a hit during a dash) do not exist yet, and nothing was built for them. A step that places them again can go right after 4b, before the hitboxes hurt (5), without touching the other stages.

## When you add a stage or move one

1. Change the comments of `step` and this file together.
2. Say here what the stage needs from the ones before it.
3. Expect the known answer of the simulation check and some tests to change; say which and why in the commit.
4. Add a test for the rule that the new order makes true, as test 157 does.
