# The order of a step

One frame of the game is one call of `step(state, input, blueprint, visual)` in `src/sim.js`. **The order below is a contract:** many rules depend on it, and changing it changes what a run is. This file says what each stage does and why it sits where it sits. It has no game values (those are in `src/data.js`).

The code carries the same numbers in the comments of `step` and of `playStages` (stages 0 to 5, which `step` calls). If one of the two changes, change the other in the same commit. Test 157 proves the one rule below that is easiest to break (things are born after everyone has moved); tests 209 to 211 prove the early end.

## The stages

| # | Stage | What it does | Why here |
|---|---|---|---|
| 0 | Dynamic values (`finalizeDynamic`) | Every actor recalculates what changes during a run: weight (the avatar's ammunition), top speed, resistance, the radius of the shield, what each attack is now. | Everything after reads the values of this frame. |
| 1 | Input | The avatar's wanted direction is copied from the input. | The input is an argument, never read again later in the step. |
| 1b | The minds (`think`) | Each actor with `ai` decides where to go and whether to strike. A strike only raises `ai.strike`; nothing is born yet. | Movement uses the direction the mind chose, so the mind must decide first. |
| 2 | Movement | Each actor that moves walks, in list order, and collides with the still things (objects). **The avatar's death is tested after each contact with an object**; when it is dead the stages end here (the actors after it do not move). | The avatar is first in the list, so a death here stops everyone else's movement. |
| 3 | Cells | The grid cells each actor covers are written. | The actor collision reads them. |
| 4 | Collision between actors | Actors push each other by weight and hurt each other with the body slam; each reacts to a new contact. **The avatar's death is tested after each whole contact** (both sides have hurt each other, both are pushed); when it is dead the stages end here. | After everyone moved. |
| 4b | Things are born | Every hitbox is born here, through `spawnHitbox`: the strikes the minds decided in 1b (`emitStrikes`), the shots of the avatar's weapons (`fireWeapons`) and the blows of its swords (`swingMelees`), in that order. | The user's rule (2026-11-13): the actor moves and only then the hitbox is born, so it is where the bodies really are. |
| 5 | Hitboxes hurt (`resolveHitboxes`) | Each hitbox moves by its velocity, hurts what it touches (each thing once; a hitbox that hits `"first"`, a bullet, hurts only the first thing its path met in this frame, see below), loses a frame, and goes when its frames or its pierce are spent, or (a bullet) when it leaves the window of the grid. **The avatar's death is tested after each hit**: the hitbox that killed hits nothing else and loses its frame, the hitboxes after it in the list do not move, hurt or lose a frame; the spent ones are still cleared. | After birth, so a one-frame hitbox is born and tested in the same step. |
| 6 | Destruction (`removeDestroyed`) | Whoever has no health left leaves the scene, in one place. The avatar is the one exception: it stays in the scene and ends the mission in stage 8. **Runs after an early end too.** | At the end, so nothing is removed while a loop walks the list. After an early end it is the bookkeeping of the hurts that did happen, not an action: a Biter killed in the contact that killed the avatar is gone, as one killed in stage 5 always was. |
| 7 | The shield | The quiet frames count and the shield regenerates when the wait is over. **Runs after an early end too.** | After the damage of this step. After an early end it runs so that a death by a bite gives the state it always gave; the hurt that killed set the count to 0, so it counts one quiet frame and gives nothing back (a wait of exactly one frame would give one frame of regeneration; no part has it). |
| 8 | The mission ends (`state.mission = "aborted"`) | The avatar with no health left ends the mission (`worldStops`, the same function as the tests of stages 2, 4 and 5). The frame is already counted. The next call of `step` returns at its first line. | After the frame counter goes up, so the frame that ended the mission is the last one counted. |

## The avatar's death stops the world (the user, 2026-11-14, issue 28)

"When the avatar's death is tested, the world stops": nothing of the avatar takes effect after it, the rest of that step runs for nobody, the mission is aborted and no more frames run. Inside the one contact that kills, both sides still hurt each other, so the death is tested after a whole contact, never in the middle of it. The rule is one function, `worldStops(state)`, asked after each place a hurt can land on the avatar (each contact with an object in stage 2, each contact between actors in stage 4, each hit of a hitbox in stage 5) and in stage 8.

**The early end.** When it is true, what is left of stages 2 to 5 is skipped (`playStages` returns, or `resolveHitboxes` stops walking its list), and the step goes to its end: stages 6 and 7, the frame counter, stage 8. What that leaves:

- **Skipped:** the movement and object contacts of the actors after the avatar (2), the cells (3) and the rest of the collisions (4) if the death came earlier, every birth (4b: no strike, no shot, no blow), and the hitboxes after the one that killed (5). The Biters' `ai.strike` flags raised in 1b stay raised in the frozen state (nothing reads them again); `state.contacts` holds only the contacts met before the death; hitboxes that did not get their turn stay as they were.
- **Kept, and why:** the frame counter (the frame of the death is the last one counted, so the history records it and the audit's frame is the frame the screen shows, as before); `removeDestroyed` and the shield (the bookkeeping that always closed a step; keeping them gives a death by a bite the state it always gave, except for the hitboxes after the one that killed); the ageing of the visual state (it happens at the very start, before anything can die). The hitbox that killed ends its own turn (it loses its frame, so a bite that killed is gone, as before).

The frame counter goes up at the very end. So everything that happens inside the step from frame n is **seen** in the state of frame n + 1, the one the screen shows after the step; the audit writes a hit with that frame (`recordHit`, review of 2026-11-13, point 6; test 159), so a paused screen and the audit say the same number.

## Rules that follow from the order

- **A hitbox is born after everyone has moved** (4b), where the bodies are in that frame. A bullet fired in a dash starts at the avatar's final position.
- **A hitbox lives its frames** (the bite and the sword: one, so it is born, hurts and is gone in one step); a bullet has no frames (`framesLeft` null).
- **Whoever died before 4b does not strike.** A Biter with no health is skipped by `emitStrikes` (which still lowers its flag); the avatar's death ends the stages before 4b, so its weapons do not fire and its swords do not swing. A death in stage 5 comes after the births of that step: what was born then is left as it was, and a hitbox after the one that killed does not hurt (test 211).
- **A death ends the step, not the contact** (stages 2 and 4): both sides of the contact that killed hurt each other, the death is tested after it, and nothing else happens in that step (tests 209 and 210).
- **The visual state is written, never read, by the rules.** `step` ages its traces at the very start (so a trace born in this step is drawn at age 0), and `spawnHitbox` writes a trace when a hitbox that lives its frames is born. A run with it and a run without it give the same state (test 155).
- **The audit is written, never read, by the rules** (`recordHit`, called wherever damage is applied: the body slams in stages 2 and 4, the hitboxes in stage 5). A run with it and a run without it give the same state (test 160). Since the world stops at the avatar's death, the audit of a run that ended ends on the hit that killed (with the other side of its contact, for a body slam).
- **An aborted state does not advance** (stage 8 sets `state.mission = "aborted"`, and the next `step` returns at its first line): the state, the visual state and the audit stay as they were (tests 191 and 209).
- **Simultaneous hits are decided by the order of the list** (deterministic, but arbitrary): two things that kill each other in the same step resolve in list order. With the avatar it is one exception: whatever comes after the hurt that killed it does not happen at all.
- **A hitbox that hits `"first"` (a bullet) is not decided by the list order** (the user, 2026-11-14, issue 43): of the things it touches in a frame, it hits the one its path met first, measured by how far along its movement of that frame each was first touched (`firstTouchAt`, `hitsThisFrame`). Only a tie (the same moment, which is every candidate for a hitbox that did not move) falls back on the list order: the actors in the order of `state.actors`, then the objects in the order of `objectsReaching`. The hitboxes themselves are still walked in list order, and a hitbox that hits `"all"` (the sword, the bite) hits its candidates in list order.

## Room left on purpose

Hitboxes that follow their owner (an aura, an orbiting blade, a beam, a sweeping sword, a hit during a dash) do not exist yet, and nothing was built for them. A step that places them again can go right after 4b, before the hitboxes hurt (5), without touching the other stages.

## When you add a stage or move one

1. Change the comments of `step` and this file together.
2. Say here what the stage needs from the ones before it.
3. Expect the known answer of the simulation check and some tests to change; say which and why in the commit.
4. Add a test for the rule that the new order makes true, as test 157 does.
