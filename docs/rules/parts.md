# Parts and the library

## In short

- The avatar's values are the sums of the specs of the parts of its blueprint: health, resistance by type of damage (in points, may be negative), dash strength, charges and recharge, capacity, the Radar of the Head and the shield; a spec no rule reads, or a resistance that would make damage grow without end, is refused (docs/rules/parts.md).
- Top speed is the sum of the parts' speed minus a fixed amount per unit of weight carried, never below zero, so the effect of weight is direct and shown in the audit (docs/rules/parts.md).
- Capacity, from the torso, is a hard limit on what the blueprint weighs, not a speed penalty: a blueprint above it is refused (docs/rules/parts.md).
- The avatar starts with full health and full dash charges; with no part giving a dash there is none (docs/rules/parts.md).
- The values of the parts copy the avatar from before parts, not a goal of play, and are the first to redo (docs/rules/parts.md).
- A creature (the Dummy, the Biter) is made of parts too: an actor recipe may have a `parts` list of ids of `DEFINITIONS.creatureParts`, and its health, speed, acceleration, deceleration, weight, attacks and tags come from them; the avatar has none of these, it keeps its blueprint (docs/rules/parts.md).
- A creature part may give `resistance` or `bodySlamMultiplier` and may say, with `while: "dashing"`, that its specs count only while its actor's key of the jump is on (only on a part whose specs are these two, for now): the Jumper's Carapace, 250 blunt during the jump, and its Spring legs' slam, its body slam x8 during the jump (docs/rules/parts.md).
- Not built: a part would be an instance rolled by seed inside the ranges of its model, deterministic, and kept as rolled (with its seed and library version), never derived again; today the blueprint names part models (docs/rules/parts.md).
- Not built: content would live in a library of shelves (one per pack), books (one per kind of content) and entries, addressed shelf:book:entry, versioned per shelf, frozen once, with pack effects as data, not code; today the definitions are one flat object with one version (docs/rules/parts.md).

## The kit of parts

The user asked for the kit with **only what is used now**: weight, speed, health, resistance (by type of damage), the dash strength and the capacity. The Radar is in the code (the Head); the Magnet is not (the shield and the weapons are).

- Each part in `DEFINITIONS.parts` has a `weight` and `specs`. The avatar's final values are the **sum of the specs of the parts of its blueprint** (`sumSpec`):
  - top speed (`finalSpeed`) = sum of `speed` - total weight x `weightSpeedPenalty`, never below zero (the agent's floor, so the controls never reverse; whether there is a real minimum speed is open);
  - maximum health (`finalMaxHealth`) = sum of `health`;
  - resistance to each type of damage (`finalResistance(actor, blueprint, type)`) = sum of the `resistance` spec of that type, in **points** (see "Damage" (docs/rules/damage.md)); the part specs are checked against a list of names when the file loads, so a typo stops the game; points of `resistance` and `shieldResistance` must be finite (test 203: `Infinity` gave `NaN`) and **may be below 0 (the user, 2026-11-15: "negative resistance amplifies damage"; issue 34, tests 228 to 231)**, but above minus `resistanceScale`: a part at or below it is refused when the file loads, and `assertValidBlueprint` refuses a blueprint whose summed resistance of a type is at or below it, counted twice (the parts alone, and the parts with the shield's points, because the shield comes and goes);
  - dash speed (`finalDashSpeed`) = sum of `dashSpeed`; without any part giving it there is no dash and the charge is kept;
  - maximum dash charges (`finalDashMaxCharges`) = sum of `dashCharges`; the state holds `dash.charges: { now, max }` (the user's structure), filled when the state is created, like the health; without any part giving it there is no charge and no dash;
  - frames to recharge a charge (`finalDashRechargeFrames`) = sum of `rechargeFrames` (the user's decision, 2026-11-10: at first every number of the dash comes from the Booster);
  - capacity = sum of `capacity`.
- **Weight (the user's decisions):** its effect on speed must be **direct and easy to perceive**: a fixed amount of speed per unit of weight, shown as such in the audit. The unit label is only flavor for the player.
- **Capacity (the user's decision):** it belongs to the **torso** and is a **hard limit** on the blueprint, not a speed penalty: the part is not technologically able to carry more (wiring, structure), and weight cannot be stacked without limit. The agent's reading: it works as a **blueprint budget**, so every upgrade has to fit, which creates real choices. Static builds (standing still on auto attack) are **welcome**: the user finds them fun and still challenging to make work.
- The avatar's starting health is not written by hand: `createChamber1State(runId, seed, blueprint)` sets it to `finalMaxHealth`.
- **Known weakness:** the values of the parts were chosen by the agent to reproduce what the avatar had before parts existed. They are not wrong, but they did not come from a goal of play, which is the opposite of the user's "no normalization". They are the first candidates to be redone.
- From the user's old project, for reference: each part had `Specs` that add up, `Mods` that look like multipliers (not used here yet), and `Weight`, which was simply subtracted from the speed.
- Open: whether other parts (the generator) add to the capacity.

## Parts of creatures (issue 75)

A creature part lives in `DEFINITIONS.creatureParts` in `src/data.js`, apart from the avatar's `DEFINITIONS.parts`. It has a `name` (flavor only) and, each optional:

- `specs`: `health` (a range, `{ min, max }`), `speed`, `acceleration`, `deceleration` and `weightPerRadius` (whole kg per pixel of radius, like the objects').
- `attacks`: written like the attacks of a recipe (the Biter's `bite`); the same attack name in two parts of one recipe is refused when the file loads.
- `tags`: words added to the actor's tags.
- `specs.resistance` (issue 81, parcel B): points per damage type, as the avatar's parts (a known type, finite, above minus the resistance scale). The resistance of a creature is the sum over its parts whose condition holds (`creatureResistance` in `src/sim.js`), **computed when a hit needs it** (`resolveDamage`) from the key and the frozen data, so nothing new goes in the state; the avatar's stays written each frame from its blueprint (`finalizeDynamic`).
- `specs.bodySlamMultiplier` (issue 88): a finite number above 0 (no upper bound) that multiplies its actor's body slam. The packet of a body slam made for an attacker (`finalAttack`) is multiplied by the product of the multipliers of its parts whose condition holds (`creatureBodySlamMultiplier` in `src/sim.js`), **computed at the hit**, nothing new in the state; 1 for the avatar, the objects and any creature whose parts give none, so their slams are bit for bit as before. It is the attacker's: the target's parts never change the slam it takes. No minimum damage.
- `while` (issue 81, parcel B; issue 88): the condition under which the part's specs count. The only one is `"dashing"`: while the actor's key of the jump (`dash.active`, see docs/rules/movement.md) is on. **For now allowed only on a part whose specs are `resistance` or `bodySlamMultiplier` (one or both) and nothing else** (`CONDITIONAL_PART_SPECS`: no other spec, attack, jump or tag, which would count always); anything else is refused when the file loads. A part has one `while` for all its specs, so a spec that must count always goes on another part.

An actor recipe (`DEFINITIONS.actors`) may have an optional `parts` list. The list plays for it the role the blueprint plays for the avatar, with no slots and no limit. Its values are the sum of what its parts give (`recipeValue` in `src/sim.js`; the health ranges add their mins and their maxes); a value no part gives is none (a creature without Legs stands still). The tags of the actor are its own plus its parts', the same tag once, written once when it is made. A recipe with `parts` does not also write the old fields (`healthRange`, `speed`, `acceleration`, `deceleration`, `weightPerRadius`, `attacks`): the load refuses it, so each value has one source. The parts are checked when the file loads, like the avatar's.

- The Dummy: `dummy-body` (Body: health) and `dummy-legs` (Legs: speed, acceleration, deceleration).
- The Biter: `biter-shell` (Shell: health, the tag `vermin`), `biter-legs` (Legs: speed, acceleration, deceleration) and `biter-mouth` (Mouth: the bite, whole). Its own tag, `enemy`, stays in its recipe.
- **The split of the weight is a guess.** Each `weightPerRadius` is marked `guess` in the data: Dummy Body 70 and Legs 30; Biter Shell 60, Legs 20 and Mouth 20. Only the sums are fixed (100 for each), because they are the weight the recipes had before parts.
- The numbers of the parts are the ones the recipes had (the Dummy and the Biter are the same, bit for bit); their reasons are in the comments of the data.
- The Jumper: `jumper-shell` (Shell: health, the tag `vermin`), `jumper-springlegs` (Spring legs: the dash and the jump), `jumper-springlegs-slam` (Spring legs' slam, issue 88: `bodySlamMultiplier: 8` with `while: "dashing"`; the user: "Tudo vem de uma peça", the Spring legs multiply the damage the Jumper's body does only while the jump key is on, and "concordo com o x8 dinâmico, sem dano mínimo"; its own part because the Spring legs' dash must count always and a part has one `while`; weight 0, the same guess as the Carapace's) and `jumper-carapace` (Carapace, issue 81: `resistance: { blunt: 250 }` with `while: "dashing"`, "71% of blunt off: 250 / (250 + 100)"; it gives no weight, a guess marked in the data, so the Jumper's weight and its slam stay as they were). A push during the jump keeps the key on, so the Carapace too (the user: "o bicho apanhando igual uma piñata [...] ainda é um pulo em atividade, pelo menos para o Jumper").
- Not built: taking a part off or putting one on an actor during a run.

## Parts made by seed (the user's idea, not implemented)

Parts are not all identical: a part is **generated by a seed, with slightly randomized values**. In the library a part model gives a **range** for a value, and each part the player gets rolls its own values inside the ranges. So the player can have several parts of the same model, all slightly different. This is the same idea as the rocks (seed and formula, with the integer hash `hashInts`), and it must stay deterministic.

- A part the player owns is an **instance**: the address of its model and its rolled values. The blueprint points to instances, not to models.
- **Decided by the user: once a part is generated, it stays as generated.** The instance stores its rolled values, plus the seed and the version of the library it was created with. He prefers an item that stays unchanged over an update that silently changes a weapon the player owns. The difference with the rocks is on purpose: the **terrain** is derived again from the seed every time, while **what the player owns** is a stored record.
- Agent's notes: rolled values should be whole numbers or exact fractions, so they add exactly in floating point; the audit page should show both the rolled value and its range; whether weight can be rolled (it changes the blueprint budget) is not decided.

## The library (names agreed with the user)

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
