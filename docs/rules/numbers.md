# Where the numbers are

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
