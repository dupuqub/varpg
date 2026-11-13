# Weapons and equipment: the user's vision, kept so it is not lost

Written 2026-11-11 from the conversation with the user, after several summaries of earlier conversations had lost parts of it. It records what he said and decided, what the old project did, and what the agent proposed. It has **no numbers of the new game** (those live in `src/data.js`, each with its reason). When a point here is decided in code, move it to `AGENTS.md` and leave a short pointer.

A relic of the old project, kept as it was (**a relic, not a truth about this project**; see `docs/reference/README.md`):

- `docs/reference/relic-old-project-hud.jpg`: a screenshot of the old project. Weapon status is shown at each slot (`ShoulderL`, `ShoulderR`, `ArmL`, `ArmR`): type, magazine, storage, interval, reload. The booster and the halo (shield) have their own boxes. Resin (a resource) is at the top left. The worms are the enemies, and the small orange dash near one of them is a bullet in flight.

## Why it matters (the user's business reasoning)

The game has to pay the bills, and weapons are the flagship of what is sold: **the more modular the weapons are, and the more they accept behaviors that recombine, the more different blueprints and mechas can be sold, unique to each player.** So the design goal is not a list of weapons. It is a small set of pieces that combine into many weapons, defined as data.

## What the user decided

- **Four weapon slots: `ShoulderL`, `ShoulderR`, `ArmL`, `ArmR`.** All weapons aim by themselves (auto-aim); the player only moves and dashes.
- **One item per slot (the user's decision, minimalist).** A slot holds one part. There are parts that are **only armor** (no weapon) and cannot take a weapon. A weapon comes as the arm or the shoulder itself (a weapon arm) and **replaces** the armor-only part that was there. There is no second item in a slot. Shoulders and arms need not be weapons: a shoulder part may be wings (mobility at the cost of damage), a shield, and so on; they are the same system of parts and specs the kit already has.
- **Ammunition costs weight (the user, emphatic).** As the mecha fights and spends ammunition, it gets lighter and faster. So the weight of the avatar is **dynamic**, not static.
- The first weapon is the simplest of all: a repeater of hitboxes, like a machine gun, slow at first, with limited ammunition, a reload time and a cadence. "All the basics."
- **The style is crowds** (Diablo and Path of Exile in feel, close to Musou): many enemies, and seeing each attack is not a priority.

## What the old project had that the user wants again (a relic, described only as intent; see the screenshot)

- A part gives specs that are summed into the final values, and may have **mods** (two examples were an offensive one on the head and a defensive one on the torso) that change final values: this is what the new project calls the dynamic part (`now`) of a value.
- A weapon has: a **name of its recipe** (a repeater), a **rule of auto-aim** (the closest target), a **reserve** of ammunition, a **magazine**, a **time between shots**, a **reload time**, and a **damage range** per shot.
- The screen shows the live counters per slot (magazine now/capacity, interval, reload), so a weapon has **state** that changes every frame.
- The shield (a health that regenerates, from the generator) is already in `AGENTS.md`. Drops and collection (a resource, a magnet, a radar) come later.
- Times were in seconds; the new simulation counts whole frames, so they become frames (the seconds can stay on the screen).

## The natures of weapons the user wants to allow

He listed them as examples of how far "weapon" must stretch, not as a list to build now:

- A common shot: the projectile is only **a hitbox that moves**.
- A **grenade**: an object (not a hitbox) that explodes at the target.
- A **mine**: an object triggered by contact or by proximity.
- A **rocket** that, when it explodes, makes **mini-grenades** in a radius around it.

## The agent's decomposition (proposal, sound)

Every weapon above is a combination of the same five pieces, so each weapon is a recipe in data and a new variant needs no new code:

1. **Trigger:** when and against whom the weapon acts (auto-aim rule, cadence, ammunition, reload).
2. **What is born:** a hitbox, a projectile, or an object.
3. **How what was born behaves:** still, attached to its owner, traveling, arcing to a target, or waiting on the ground.
4. **Its own trigger:** contact, proximity, time, end of life.
5. **Effect:** the damage packet by type (the same packets and resistance as everything else), in an area or on one target; at the end of its life it can **emit** other things (the cluster rocket).

Today's hitbox of the Biter is the simplest case of this: no velocity, immediate trigger, a short life, a packet. The plan is to generalize `state.hitboxes` (velocity, life, trigger, a list of emissions) rather than make grenades and mines actors.

## Risks to watch

- **Explosion of counts:** a rocket that emits grenades that emit grenades grows exponentially. Needs limits of depth and of quantity, **checked when the data loads** and also enforced while running.
- **Cost per frame:** every projectile against every enemy, every frame, is expensive in a crowd. The hits must use the collision grid. Measure with hundreds of projectiles before trusting it.
- **Determinism:** the auto-aim needs a tie rule (the closest; on a tie the lowest id). Any roll (a damage range, a spread) uses `hashInts` with a named salt in `SALTS`.
- **Data from outside:** if blueprints and weapons are sold, the loader that validates them is the protection: it refuses absurd combinations and fixes the cost limits.
- **Weight that changes in the fight touches more than speed (decided: the body slam follows the current weight).** The weight of the avatar is also the base of its body slam, of how it is pushed by other actors, and of what it can carry. A lighter mecha hits softer and is pushed more. That follows from the user's rule that weight is the center of contact damage, but it must be a conscious choice, and it contradicts "the base is calculated once" for the avatar's body slam: the body slam would have to follow the current weight.

## Order the agent proposes (not yet agreed in full)

1. Store the record of a hit (`resolveDamage` already makes it; nothing keeps it). Weapons will be the third source of damage.
2. Wire the avatar's side of hitboxes: `hitboxHurts` says the avatar's hitboxes hurt everyone else, but the code only checks the avatar as a target.
3. A **bench of weapons**: one weapon against N targets for T seconds, returning damage and kills. The deterministic engine makes it possible; it is how combinations are balanced and how the ML side will get its data.
4. First weapon: the repeater (targeting, a traveling hitbox, damage on actors, destruction, ammunition and its weight).
5. Then grenade (object with an arc or a timer), mine (proximity trigger), and last the emission at the end of life.

## Built so far (2026-11-11): the repeater

A part `repeater-arm` in the combat blueprint (Chamber 2): auto-aim at the closest actor inside the Radar of the avatar (the Head; the weapon has no range, the user 2026-11-13), a cadence, a magazine and a reserve, a reload, **ammunition that weighs** (the mecha lightens and speeds up as it fires; reloading changes no weight), and a bullet that is a hitbox that travels, with a **pierce** that counts how many times it crosses (0 crosses nothing). The capacity of the Torso is 8 t. Numbers err upward on purpose and are tuned later.

## Decided since

- The bullet **travels**; the other kind (hits the chosen target at once, more precise and a little weaker) is wanted too and not built.
- **Pierce is the number of crossings** (0 = none), a variable of the projectile inherited from the weapon or the skill tree.

Preparation for swords, spears and hammers (an experiment, not decisions): `docs/weapon-families.md`.

## Open items

- **Damage as a range rolled per shot (old project) or a fixed value per weapon?** Asked, not answered; the repeater has a fixed value for now. A range needs a salt per shot and makes the record of a hit store the rolled value.
- Can a slot be truly **empty**? The user said an empty arm "is really empty", then chose one item per slot with armor-only parts; the two are not settled together.
- Two-handed weapons, a bonus for the same sword in both arms, and set bonuses were discussed and **left out on purpose** for now. They can come later as part variants or as mods with a condition.
- Does a bullet stop at a rock or a Shroom? Today it passes over objects.
- A bullet must be slower than the smallest radius it should not skip (the data checks it at load). Fast bullets will need a swept test.
- The avatar at zero health stays and keeps firing; what its death does is still open.
- Order proposed earlier and still ahead: store the record of a hit, a bench of weapons, then grenade, mine and the emission at the end of a life.
