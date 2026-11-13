> **Update 2026-11-13:** the sword is built (see "Built: the sword" in `docs/weapons.md`). What follows was written before it; the spear and the hammer are still preparation only.

# Weapon families: preparing swords, spears and hammers (an experiment, written while the user slept)

Written 2026-11-12 at the user's request ("create information that helps you build these new kinds of weapons later"). It is **preparation, not decisions**: nothing here is built, and nothing here is agreed beyond what the user said in the conversation, which is marked as such. Read `docs/weapons.md` first (vision, decisions, the repeater). This file has **no game numbers**: they belong in `src/data.js`, each with its reason.

## What the user described

- **Sword:** a hitbox that makes an **arc** (a slash).
- **Spear:** keeps **thrusting** at things, with **pierce**, so it balances against the sword's slash damage.
- **Hammer:** **area damage**, like a grenade would do.
- Earlier, in the same conversation: grenades and mines are **objects** (not hitboxes), a rocket can emit mini-grenades, one weapon of each kind must be possible by recombining a few pieces, and the style is crowds.

## What already exists in the code (so the next agent does not rediscover it)

- **Hitbox** (`state.hitboxes`): `{ owner, attack, position, radius, framesLeft, damage (a packet), velocity, struck, pierceLeft }`. A circle. Born with the packet frozen. Hurts each target once (`struck`). `pierceLeft` is a whole number (0 = ends at the first hit) or `null` (does not end on a hit: a bite). `resolveHitboxes` moves it, tests it against the targets and removes it. `hitboxHurts(ownerId, target)` is the side rule.
- **Phases of a mind** (`think`, the Biter): `chase`, `windup` (still), strike (a hitbox is born), `freeze` (still). The frames of each are data in the attack.
- **Weapon of the avatar** (`fireWeapons`): interval, magazine, reserve, reload, auto-aim at the closest actor inside the Radar (the Head, no range of the weapon), one bullet per shot. Damage is an attack `{ base, now, projectile }`; `now` is recalculated every frame (the place where mods and the skill tree enter).
- **Packets and resistance** (`resolveDamage`): damage by type, resisted by points per type, a minimum of 1. Every weapon below should only produce packets.
- **Weight** matters: the avatar's weight is dynamic (ammunition), speed depends on it, and the user's rule is that weight is the center of contact damage.
- **One function makes every hitbox now:** `spawnHitbox` (Biter bite and bullet both use it; the two copies were merged).

## The idea that makes the three families cheap: an attack is a timeline

The Biter's attack is already a tiny timeline: wait, emit a hitbox, wait. A sword swing, a spear thrust and a hammer slam are the same three steps with different numbers and a different hitbox:

| Family | Wait before | What is emitted | Wait after |
|---|---|---|---|
| Biter bite | windup | a circle, still, one frame (the user, 2026-11-13) | freeze |
| Sword | a short windup | an **arc** in front of the owner, alive for the swing | recovery |
| Spear | a very short windup | a **line** (a capsule) that pokes out, with pierce | a very short recovery |
| Hammer | a long windup | a **burst**: a circle at a point, for one or two frames | a long recovery |
| Repeater (today) | the interval | a moving circle | none |

**Proposal (sound, not yet built):** one `attack timeline` per weapon or enemy: a list of phases (`wait N`, `emit hitbox X`), driven by the same small state `{ phase, frames }` the Biter already has. Then Biters, melee weapons and hammers share one mechanism, and "windup before and freeze after" (which the user asked for as a test that both can exist) becomes ordinary data. **Do not generalize before the second user exists**: build the sword on the Biter's phases, then lift the common part. Signal: sound with a cost (a refactor of `think`).

## What each family needs that does not exist yet

**1. Shapes of hitboxes.** Today only a circle. Needed, in order of cost:

- **Circle at a chosen point** (not only one body ahead): needed by the hammer burst and by grenades. Cheap.
- **Arc / cone** (sword): a sector with a radius and an angle, in a direction. A target is hit if it is within `radius + its own radius` and inside the angle. **Without trigonometry** (the simulation may not use it, test 113): keep the direction as a unit vector, compare `dot(direction, toTarget) / distance` against a cosine of the half angle that is computed once from `cosDegrees` when the actor is made; the target's radius widens the angle a little (otherwise a big target half inside the arc is missed). Only `Math.sqrt` is needed, which is exact.
- **Line / capsule** (spear): a segment with a width; a target is hit if the distance from its center to the segment is within `width/2 + its radius`. Same arithmetic, no trigonometry.

**2. Hitboxes that follow their owner.** A slash or a thrust must stay with the avatar while it walks. A hitbox needs an optional `attached: true` (position relative to the owner, recomputed every frame) as opposed to the bullet, which stays where it is or flies.

**3. A swing that sweeps.** The simplest sword is a **static cone alive for one frame** (the user, 2026-11-13: like the bite, it hurts in the frame it is born and is gone; what the eye sees is a trace in the visual state; cheap, and it already hits things in front). A real sweep rotates the cone across its frames; each target is still hit once (`struck`). Start static, sweep later, behind the same data.

**4. Area bursts** (hammer, grenade explosion, later the rocket's mini-grenades): an instant circle at a point, alive for one or two frames, hurting everything inside once. Here the question of **falloff** (damage lower at the edge) appears; start flat.

**5. Knockback.** Spear, hammer and sword all want to shove. The engine already pushes actors apart by weight; a hitbox could carry an `impulse` that writes into the hit actor's velocity, scaled by the **weight** of the target (it fits the user's weight-centered design). It is a new effect and a new place where the record of a hit has a term. Decide before building the hammer.

**6. Aim.** A melee weapon needs a direction at the time of the strike. The Biter aims at the moment of the strike. For a weapon the user may prefer to lock the direction when the windup starts (the enemy can escape: more tactical) or at the strike (never misses). Auto-aim for melee should only trigger within the weapon's **reach**.

## The pierce of the spear versus the damage of the sword (the balance the user wants)

The user's reasoning: the sword slashes for more damage per target; the spear hits several things in a line but each for less. That is a balance **between recipes**, so it should be measured, not guessed. Pierce here has the user's meaning (how many times it crosses): a spear thrust is a line hitbox with `pierce` crossings, struck in order of distance from the owner.

## Before the first melee weapon (a checklist, in order)

1. **Store the record of a hit.** *(Done 2026-11-13: the audit, see `AGENTS.md`.)* It used to be that `resolveDamage` made it and nothing kept it. Without it, balancing sword against spear is blind and the user's transparency axis has nothing to show.
2. **Merge the two "make a hitbox" copies** into one function that takes the owner, the attack and a direction, and reads a hitbox recipe (shape, size, frames, motion, pierce). Rename the weapon's `projectile` field to something that fits all families (it is the hitbox recipe).
3. **A bench of weapons** (see below). It is what turns "I think the spear is balanced" into a number.
4. **Circle at a chosen point** and **attached hitboxes**, since they are small and the sword needs the second one.
5. **Then the sword** (static cone first), built on the Biter's phases; then lift the timeline.
6. **Then the spear** (line, pierce), **then the hammer** (burst; it brings knockback and falloff questions).
7. Grenade, mine and the emission at the end of a life come **after** the burst exists, because they reuse it.

## The bench of weapons (the most useful preparation)

A function that plays a scripted fight and returns numbers. Because the simulation is deterministic, the same script gives the same result everywhere, so it also becomes a regression test and the data source for the user's ML idea.

- **Scenarios:** one target standing still; N targets in a line (tests pierce); a ring of N targets around the avatar (tests arcs and area); a crowd walking at the avatar (the real thing).
- **Outputs:** damage dealt over time, kills over time, ammunition spent, weight lost, the time to kill the first, and the damage taken by the avatar.
- **Where:** a function in the tests first, later a button in Chamber 0 that prints the table to copy, like the other tools there.
- **Why it matters for the business:** if blueprints and weapons are sold as data, the bench is how a new combination is checked before it is accepted, together with the limits validated when the data loads.

## Risks to keep in mind

- **The arc test must not depend on trigonometry or on the order of the actors** (determinism). The tie rule of the closest target already exists and should be the one reused.
- **Cost:** many cones and lines against a crowd, every frame. Use the collision grid to find candidates before testing shapes. Measure with a crowd before trusting it (the current tests only cover a few dozen actors).
- **A fast thing can skip a target between two frames.** The data already refuses bullets that could skip the smallest actor; a thrust that extends a long line in one frame is not a skip (it is a segment test), but a fast projectile needs a swept test one day.
- **Count limits** for anything that emits (a hammer that emits bursts that emit bursts): depth and quantity checked when the data loads, and enforced while running.
- **Feel:** hits that do nothing visible feel weak. A short pause on hit and a visible shape are cheap and matter more than the numbers. Not built.

## Open questions for the user (none asked yet; answer when convenient)

1. **Where does the sword's arc point?** At the target locked when the windup starts, or at the target at the moment of the strike?
2. **Does a swing sweep** (the arc turns while it lasts) or is it a static cone for one frame, at first? (Answered 2026-11-13: static, one frame.)
3. **Knockback:** should hits push the target, and by how much does the target's weight matter?
4. **Falloff** of the hammer: flat damage in the whole circle, or less at the edge?
5. **Do melee weapons also take ammunition** (a durability or a resource) or are they free to swing?
6. **Do the weapons of the four slots share one timeline** (all swing together) or does each slot have its own?
