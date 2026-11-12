// Simulation: the rules of the game.
// It knows nothing about the screen, keyboard, mouse or browser, only numbers.
// That way it runs the same in the browser and in Node.

const AVATAR_ID = "avatar_1";

// The recipe of a thing (an actor or an object) lives in DEFINITIONS (src/data.js). A thing points to it by type;
// its own values are made from the recipe when it is created (finalizeObject), and the code reads them from the thing.
function definitionOf(thing) {
  const definition = findDefinition(thing.type);
  if (!definition) throw new Error("Unknown type: " + thing.type);
  return definition;
}

// A type is an actor (DEFINITIONS.actors: the avatar and the Dummy) or an object (DEFINITIONS.objects: the rock and the Shroom).
function findDefinition(type) {
  return DEFINITIONS.actors[type] ?? DEFINITIONS.objects[type];
}

// The complete object of a type: the one function that makes anything that exists in a run. It takes
// - the type (the recipe in src/data.js),
// - the rolls: what the seed decided for this one (position, radius, health...), or nothing,
// - the blueprint of the run, when the thing has one (only the avatar does),
// - the id, when it has one (the avatar).
// Every value of the object is final here: it comes from a final function, and from here on the code reads it
// from the object, never from the definitions. The copy of "initial" through JSON makes the object own its
// numbers, so changing one object never changes the definitions or another object.
function finalizeObject(type, rolls, blueprint, id) {
  const recipe = findDefinition(type);
  if (!recipe) throw new Error("Unknown type: " + type);

  const object = id === undefined ? { type } : { id, type };
  Object.assign(object, JSON.parse(JSON.stringify(recipe.initial ?? {})), JSON.parse(JSON.stringify(rolls)));
  object.radius = finalRadius(object, blueprint);
  object.weight = finalWeight(object, blueprint);
  object.bounce = finalBounce(object, blueprint);
  if (object.resistance) writeResistance(object, blueprint); // only a thing whose recipe starts with a resistance has one (the avatar)
  object.attacks = finalAttacks(object);
  return object;
}

// The final values of an actor are calculated and written into the actor, and the rest of the code reads the actor
// (the user's rule, 2026-11-11: everything that is calculated is stored in its actor). When each one is calculated
// depends on what it is (his rule too):
// - what is STATIC is calculated once, when the actor is made, at the start of the run (finalizeStatic);
// - what is DYNAMIC is calculated again every frame (finalizeDynamic), at the start of step.
// Which is which is a list, here. A value moves from one list to the other the day something makes it change during
// a run.

// The static values: radius, weight (at the start; the avatar's weight is recalculated every frame, it follows its ammunition), bounce, the base of every attack, acceleration, deceleration, the maximum health,
// and for an actor with a dash its recharge time and its maximum of charges.
function finalizeStatic(actor, blueprint) {
  actor.radius = finalRadius(actor, blueprint);
  actor.weight = finalWeight(actor, blueprint);
  actor.bounce = finalBounce(actor, blueprint);
  actor.attacks = finalAttacks(actor);
  addWeaponAttacks(actor);
  actor.acceleration = finalAcceleration(actor, blueprint);
  actor.deceleration = finalDeceleration(actor, blueprint);
  actor.health.max = finalMaxHealth(actor, blueprint);
  if (actor.shield) writeShield(actor, blueprint);
  if (actor.dash) {
    actor.dash.rechargeFrames = finalDashRechargeFrames(actor, blueprint);
    actor.dash.charges.max = finalDashMaxCharges(actor, blueprint);
  }
}

// The dynamic values: the top speed, the resistance, the radius of an actor with a shield (it follows the shield that is left),
// what every attack is now (its base plus whatever other things add: nothing yet), and for an actor with a dash its speed.
function finalizeDynamic(actor, blueprint) {
  if (isAvatar(actor)) actor.weight = finalWeight(actor, blueprint); // the ammunition it still carries (before the speed, which depends on it)
  actor.speed = finalSpeed(actor, blueprint);
  if (actor.resistance) writeResistance(actor, blueprint);
  if (actor.shield) actor.radius = finalShieldRadius(actor);
  for (const name in actor.attacks) {
    const attack = actor.attacks[name];
    for (const type of Object.keys(attack.base)) attack.now[type] = finalAttackNow(actor, name, attack, type);
  }
  if (actor.dash) actor.dash.speed = finalDashSpeed(actor, blueprint);
}

// The avatar of a new run: the object of its type, with every value final, and its health and its dash charges full.
function createAvatar(blueprint) {
  const avatar = finalizeObject("avatar", {}, blueprint, AVATAR_ID);
  avatar.health = { now: 0, max: 0 };
  avatar.dash.charges = { now: 0, max: 0 };
  avatar.weapons = weaponStates(blueprint);
  finalizeStatic(avatar, blueprint); // writes the maximums
  finalizeDynamic(avatar, blueprint);
  avatar.health.now = avatar.health.max;
  avatar.shield.now = avatar.shield.max; // born with the shield full and not waiting to regenerate
  avatar.shield.quiet = avatar.shield.delayFrames;
  finalizeDynamic(avatar, blueprint); // the radius follows the shield
  avatar.dash.charges.now = avatar.dash.charges.max;
  return avatar;
}

// ---- Parts and the blueprint ----
// The blueprint is what the player chose before the run: for now, the ids of the parts
// the avatar wears (blueprint.parts). It is an input of the run, not part of the state,
// so every function that needs it takes it as an argument.
// Only the avatar has a blueprint: an object only has its definition and what the seed rolled for it.

function isAvatar(actor) {
  return actor.id === AVATAR_ID;
}

// The definitions of the parts of a blueprint. An unknown id fails loudly.
function partsOf(blueprint) {
  return blueprint.parts.map((id) => {
    const part = DEFINITIONS.parts[id];
    if (!part) throw new Error("Unknown part: " + id);
    return part;
  });
}

// Total weight of the blueprint, in kg, as it leaves the workshop: the parts and all the ammunition loaded (every round
// weighs, see the weapon of a part). This is the weight the capacity must carry.
function totalWeight(blueprint) {
  return partsOf(blueprint).reduce((sum, part) => sum + part.weight + loadedAmmoWeight(part), 0);
}

// The weight of all the rounds a weapon part carries when full, magazine and reserve (0 for a part without a weapon).
function loadedAmmoWeight(part) {
  return part.weapon ? part.weapon.rounds.weight * (part.weapon.rounds.magazine + part.weapon.rounds.reserve) : 0;
}

// What the avatar weighs now (the user's rule, 2026-11-11: the ammunition costs weight, so the mecha gets lighter and
// faster as it fights): the parts of the blueprint plus the rounds it still holds, magazine and reserve, which are read
// from the avatar's own weapon state (so the weight and the weapons never disagree, whatever blueprint step is given).
// Reloading only moves rounds from the reserve to the magazine, so it changes nothing. Dynamic: calculated again every
// frame (finalizeDynamic).
function carriedWeight(actor, blueprint) {
  let weight = partsOf(blueprint).reduce((sum, part) => sum + part.weight, 0);
  for (const weapon of actor.weapons ?? []) {
    weight += DEFINITIONS.parts[weapon.part].weapon.rounds.weight * (weapon.magazine + weapon.reserve);
  }
  return weight;
}

// ---- The shield ----

// The shield (the user's decision, 2026-11-12): a health that regenerates, from the Generator. The maximum, the wait and the
// rate are the sum of the parts; the resistance it adds is a table by type, counted only while the shield is alive. All of it is
// static and written at the start of the run; the shield that is left (now) and the frames of quiet are the state.
function writeShield(actor, blueprint) {
  const shield = actor.shield;
  shield.max = fromParts(actor, blueprint, "shieldMax");
  shield.delayFrames = fromParts(actor, blueprint, "shieldDelayFrames");
  shield.regenPerFrame = fromParts(actor, blueprint, "shieldRegenPerFrame");
  for (const type of DEFINITIONS.damageTypes) {
    shield.resistance[type] = isAvatar(actor) ? partsOf(blueprint).reduce((sum, part) => sum + (part.specs.shieldResistance?.[type] || 0), 0) : 0;
  }
  actor.bodyRadius = actor.radius; // the radius of the body itself; actor.radius is the one that collides, and follows the shield
}

// Whether the shield still has something left (and so is felt: it adds resistance and the ring is out).
function shieldAlive(actor) {
  return actor.shield !== undefined && actor.shield.now > 0;
}

// The radius of an actor with a shield, for collision and for being hit: from the body (shield empty) to the ring
// (body x constants.shield.ringScale, shield full), in a straight line with the share of the shield that is left. An actor
// whose shield has a maximum of 0 is its body. Dynamic: calculated again every frame.
function finalShieldRadius(actor) {
  if (!(actor.shield.max > 0)) return actor.bodyRadius;
  const ring = actor.bodyRadius * DEFINITIONS.constants.shield.ringScale;
  return actor.bodyRadius + ((ring - actor.bodyRadius) * actor.shield.now) / actor.shield.max;
}

// One frame of the shield: count a quiet frame (never past the wait), and once the wait is over give back the rate per frame
// up to the maximum. Damage sets the count to 0 (applyDamage).
function regenerateShield(actor) {
  const shield = actor.shield;
  shield.quiet = Math.min(shield.quiet + 1, shield.delayFrames);
  if (shield.quiet >= shield.delayFrames && shield.now < shield.max) {
    shield.now = Math.min(shield.max, shield.now + shield.regenPerFrame);
  }
}

// The sum of one spec over all the parts (a part without it adds 0).
function sumSpec(blueprint, name) {
  return partsOf(blueprint).reduce((sum, part) => sum + (part.specs[name] || 0), 0);
}

// The sum of the resistance of the parts to one type of damage (a part without it adds 0).
function sumResistance(blueprint, type) {
  return partsOf(blueprint).reduce((sum, part) => sum + (part.specs.resistance?.[type] || 0), 0);
}

// What the parts add to a value, for the avatar. Objects get nothing from the blueprint.
function fromParts(actor, blueprint, name) {
  return isAvatar(actor) ? sumSpec(blueprint, name) : 0;
}

// Fails loudly if the blueprint is not allowed: an unknown part, or more weight than the
// blueprint can carry (the capacity of the Torso). A hard limit, not a speed penalty.
function assertValidBlueprint(blueprint) {
  const weight = totalWeight(blueprint);
  const capacity = sumSpec(blueprint, "capacity");
  if (weight > capacity) {
    throw new Error("The blueprint weighs " + weight + " kg and can carry only " + capacity + " kg");
  }
}

// The specs a part can have: the ones the rules read (see "parts" in src/data.js). Anything else is refused when the
// definitions load.
const PART_SPECS = ["speed", "health", "resistance", "dashSpeed", "dashCharges", "rechargeFrames", "capacity", "shieldMax", "shieldDelayFrames", "shieldRegenPerFrame", "shieldResistance"];

// Fails loudly if a definition breaks a rule of the library. It runs once, when this file is loaded, so a
// bad definition stops the game before the first frame.
// - Every weight is a whole number of kg, zero or more (the user's rule): the weight of a part, and for an
//   object the weightPerRadius and the radii of its size (so weightPerRadius x radius is whole). Zero is
//   allowed and has a meaning: the thing is harmless and breaks at the first hit (see AGENTS.md, "Weight 0").
// - A size is { min, max }: whole radii, 1 or more, with min not above max.
// - A healthRange is { min, max }: whole numbers, 1 or more, with min not above max.
// - A bounce is { min, max }, never above 1 (the user's rule: more would eject whoever hits it, like a spring).
//   It grows with the radius, so it works because every object has a size.
// - Every layer of the ground (terrain.objects.layers) has kinds that exist, a chance from 0 to 100, and a square large
//   enough for its largest radius (see objectMargin): a layer where an object would not fit in its square cannot be
//   made in the first place. Two layers cannot have the same square size, because the larger one wins an overlap.
function assertValidDefinitions() {
  // The things made by the seed from ranges: every object, and the actors of the crowds (the Dummy and the Biter).
  for (const [id, object] of Object.entries({ ...DEFINITIONS.objects, dummy: DEFINITIONS.actors.dummy, biter: DEFINITIONS.actors.biter })) {
    const where = (DEFINITIONS.objects[id] ? "the object " : "the actor ") + id;
    if (!object.size) throw new Error("The size of " + where + " is missing: { min, max }, the range of its radius");
    const { min, max } = object.size;
    if (!(Number.isInteger(object.weightPerRadius) && object.weightPerRadius >= 0)) {
      throw new Error("The weight of " + where + " (weightPerRadius) must be a whole number of kg, 0 or more, and it is " + object.weightPerRadius);
    }
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) {
      throw new Error("The size of " + where + " needs whole radii, 1 or more, with min not above max: " + min + " to " + max);
    }
    const health = object.healthRange;
    if (!health || !Number.isInteger(health.min) || !Number.isInteger(health.max) || health.min < 1 || health.min > health.max) {
      throw new Error("The healthRange of " + where + " needs whole numbers, 1 or more, with min not above max: " + JSON.stringify(health));
    }
    if (object.speed !== undefined && !(object.speed > 0)) {
      throw new Error("The speed of " + where + " must be above 0, and it is " + object.speed);
    }
    if (object.bounce !== undefined) {
      const bounce = object.bounce;
      if (!(bounce.min >= 0 && bounce.max <= 1 && bounce.min <= bounce.max)) {
        throw new Error("The bounce of " + where + " must be { min, max } going from 0 to 1, with min not above max: " + JSON.stringify(bounce));
      }
    }
  }
  for (const [id, part] of Object.entries(DEFINITIONS.parts)) {
    if (!(Number.isInteger(part.weight) && part.weight >= 0)) {
      throw new Error("The weight of the part " + id + " must be a whole number of kg, 0 or more, and it is " + part.weight);
    }
    // A spec the rules do not read adds nothing and says nothing (a typo like "dashspeed" would silently remove a dash),
    // so a part can only have the specs listed in PART_SPECS.
    for (const [name, value] of Object.entries(part.specs)) {
      if (!PART_SPECS.includes(name)) throw new Error("The part " + id + " has the spec " + name + ", which no rule reads. The specs are: " + PART_SPECS.join(", "));
      if (name === "resistance" || name === "shieldResistance") {
        for (const [type, points] of Object.entries(value)) {
          if (!DEFINITIONS.damageTypes.includes(type)) throw new Error("The " + name + " of the part " + id + " is to " + type + ", which is not a type of damage: " + DEFINITIONS.damageTypes.join(", "));
          if (!(points >= 0)) throw new Error("The " + name + " of the part " + id + " to " + type + " must be 0 or more, and it is " + points);
        }
      } else if (name === "shieldDelayFrames" && !(Number.isInteger(value) && value >= 1)) {
        throw new Error("The spec shieldDelayFrames of the part " + id + " must be a whole number of frames, 1 or more, and it is " + value);
      } else if (!(typeof value === "number" && value >= 0)) {
        throw new Error("The spec " + name + " of the part " + id + " must be a number, 0 or more, and it is " + value);
      }
    }
  }
  // The weapon of a part: whole numbers where the rules count, known types of damage, and a bullet that lives long enough to
  // reach the range and is slower than the smallest radius it must not skip over (so it cannot jump a target in one frame).
  for (const [id, part] of Object.entries(DEFINITIONS.parts)) {
    const weapon = part.weapon;
    if (!weapon) continue;
    const where = "the weapon of the part " + id;
    if (weapon.target !== "closest") throw new Error("The target of " + where + " is " + weapon.target + ", and the only rule is closest");
    const whole = (value, least) => Number.isInteger(value) && value >= least;
    if (!whole(weapon.range, 1) || !whole(weapon.intervalFrames, 1) || !whole(weapon.reloadFrames, 1)) throw new Error("The range, intervalFrames and reloadFrames of " + where + " must be whole numbers, 1 or more");
    const rounds = weapon.rounds;
    if (!rounds || !whole(rounds.weight, 0) || !whole(rounds.magazine, 1) || !whole(rounds.reserve, 0)) throw new Error("The rounds of " + where + " need a whole weight (0 or more), a magazine (1 or more) and a reserve (0 or more)");
    const bullet = weapon.projectile;
    if (!bullet || !whole(bullet.radius, 1) || !whole(bullet.lifeFrames, 1) || !whole(bullet.pierce, 0) || !(bullet.speed > 0)) throw new Error("The projectile of " + where + " needs a whole radius and lifeFrames (1 or more), a whole pierce (0 or more) and a speed above 0");
    const types = Object.keys(bullet.damage ?? {});
    if (types.length === 0) throw new Error("The damage of the projectile of " + where + " is missing");
    for (const type of types) {
      if (!DEFINITIONS.damageTypes.includes(type)) throw new Error("The damage of the projectile of " + where + " has " + type + ", which is not a type of damage");
      if (!(bullet.damage[type] > 0)) throw new Error("The damage " + type + " of the projectile of " + where + " must be above 0");
    }
    if (bullet.speed * bullet.lifeFrames < weapon.range) throw new Error("The bullet of " + where + " lives " + bullet.lifeFrames + " frames at " + bullet.speed + " and never reaches the range " + weapon.range);
    const smallest = Math.min(...Object.values(DEFINITIONS.actors).filter((actor) => actor.size).map((actor) => actor.size.min));
    if (bullet.speed >= bullet.radius + smallest) throw new Error("The bullet of " + where + " moves " + bullet.speed + " px per frame and could skip over an actor of radius " + smallest);
  }
  // The attacks of a recipe: each type of damage is known, with a flat part and a part per kg that are numbers, 0 or more.
  for (const [id, actor] of Object.entries(DEFINITIONS.actors)) {
    for (const [name, attack] of Object.entries(actor.attacks ?? {})) {
      const where = "the attack " + name + " of the actor " + id;
      if (name === "bodySlam") throw new Error("The name bodySlam of " + where + " is taken: every thing has the body slam");
      const types = Object.keys(attack.damage ?? {});
      if (types.length === 0) throw new Error("The damage of " + where + " is missing: { type: { flat, perWeight } }");
      for (const type of types) {
        const part = attack.damage[type];
        if (!DEFINITIONS.damageTypes.includes(type)) throw new Error("The damage of " + where + " has " + type + ", which is not a type of damage: " + DEFINITIONS.damageTypes.join(", "));
        if (!(part.flat >= 0 && part.perWeight >= 0)) throw new Error("The damage " + type + " of " + where + " needs flat and perWeight, both 0 or more: " + JSON.stringify(part));
      }
      for (const field of ["reach", "windupFrames", "freezeFrames"]) {
        if (!Number.isInteger(attack[field]) || attack[field] < 0) throw new Error("The " + field + " of " + where + " must be a whole number, 0 or more, and it is " + attack[field]);
      }
      const hitbox = attack.hitbox;
      if (!hitbox || !Number.isInteger(hitbox.radius) || hitbox.radius < 1 || !Number.isInteger(hitbox.frames) || hitbox.frames < 1) {
        throw new Error("The hitbox of " + where + " needs a whole radius and whole frames, 1 or more: " + JSON.stringify(hitbox));
      }
    }
  }
  const squareSizes = [];
  for (const [id, layer] of Object.entries(DEFINITIONS.terrain.objects.layers)) {
    const where = "the layer " + id + " of terrain.objects";
    if (!Array.isArray(layer.kinds) || layer.kinds.length === 0) throw new Error("The kinds of " + where + " must be a list with at least one object");
    for (const kind of layer.kinds) {
      if (!DEFINITIONS.objects[kind]) throw new Error("The kinds of " + where + " has " + kind + ", which is not an object");
    }
    if (!(layer.chancePercent >= 0 && layer.chancePercent <= 100)) {
      throw new Error("The chancePercent of " + where + " must go from 0 to 100, and it is " + layer.chancePercent);
    }
    if (!Number.isInteger(layer.cellSize) || layer.cellSize - 2 * objectMargin(layer) < 1) {
      throw new Error("The square of " + where + " (cellSize " + layer.cellSize + ") must be a whole number above twice its largest radius, " + 2 * objectMargin(layer));
    }
    if (squareSizes.includes(layer.cellSize)) {
      throw new Error("Two layers of terrain.objects have a square of " + layer.cellSize + ": the larger square wins an overlap, so the sizes must differ");
    }
    squareSizes.push(layer.cellSize);
  }
}

// The top speed of an actor in the current frame, in pixels per frame.
// For the avatar: the sum of the speed of its parts, minus the weight it carries
// (weight x weightSpeedPenalty). It never goes below 0 (a negative top speed would
// reverse the controls; whether there is a minimum speed is not decided).
// It is a function, not a stored value, so buffs can be applied here, in order, later.
// It must stay pure: the result depends only on the arguments and the definitions.
function finalSpeed(actor, blueprint) {
  if (!isAvatar(actor)) return definitionOf(actor).speed ?? 0; // not the avatar: its recipe (a Dummy), or none (no parts, no weight penalty)
  const weightPenalty = carriedWeight(actor, blueprint) * DEFINITIONS.constants.weightSpeedPenalty;
  return Math.max(0, fromParts(actor, blueprint, "speed") - weightPenalty);
}

// The speed an actor gets right after a dash, in pixels per frame: the sum of the
// dashSpeed of the parts (the Booster is the primary source, any part may add to it).
// Without any, there is no dash. Pure, like finalSpeed.
function finalDashSpeed(actor, blueprint) {
  return fromParts(actor, blueprint, "dashSpeed");
}

// The most charges of dash the avatar can have: the sum of the dashCharges of the parts (the Booster is the
// primary source). Without any, there is no charge and no dash. Pure, like finalSpeed.
function finalDashMaxCharges(actor, blueprint) {
  return fromParts(actor, blueprint, "dashCharges");
}

// The maximum health of the avatar: the sum of the health of its parts (nothing else gives it health).
// (The player shows it as "armor", but the code calls it health.)
// Any other actor: the maximum the seed rolled for it when it was made.
function finalMaxHealth(actor, blueprint) {
  return isAvatar(actor) ? fromParts(actor, blueprint, "health") : actor.health.max;
}

// The radius of an object, in pixels: what the seed rolled for it, or the base radius of its recipe (the
// avatar). The size is a final value like the others, so a part or an effect can change it later.
function finalRadius(object, blueprint) {
  return object.radius ?? definitionOf(object).radius;
}

// How fast the avatar speeds up toward its wanted speed, in pixels per frame, every frame. Base from the recipe.
function finalAcceleration(actor, blueprint) {
  return definitionOf(actor).acceleration ?? 0;
}

// How fast the avatar slows down toward a stop, in pixels per frame, every frame. Base from the recipe.
function finalDeceleration(actor, blueprint) {
  return definitionOf(actor).deceleration ?? 0;
}

// The frames a dash charge takes to come back: the sum of the rechargeFrames of the parts (the Booster is
// the primary source). Pure, like finalSpeed.
function finalDashRechargeFrames(actor, blueprint) {
  return fromParts(actor, blueprint, "rechargeFrames");
}

// The weight of a thing, in kg: for the avatar the total weight of its blueprint, for an object
// weightPerRadius x radius (the user's decision: the radius, not the area). Both are whole numbers
// (assertValidDefinitions), so the weight is whole and nothing is rounded.
function finalWeight(thing, blueprint) {
  return isAvatar(thing) ? carriedWeight(thing, blueprint) : definitionOf(thing).weightPerRadius * thing.radius;
}

// How much of the speed of whoever hits it comes back (0 = none, 1 = all). A type without "bounce" has none.
// The bounce { min, max } grows in a straight line with the radius: min at the smallest
// radius of the size, max at the largest (the Shroom: 0.2 at 16 and 1 at 32).
function finalBounce(thing, blueprint) {
  const definition = definitionOf(thing);
  const bounce = definition.bounce;
  if (bounce === undefined) return 0;
  const { min, max } = definition.size;
  return bounce.min + ((bounce.max - bounce.min) * (thing.radius - min)) / (max - min);
}

// ---- Damage: packets, resistance and attacks ----
// The damage of a hit is a PACKET: one amount per type of damage ({ blunt: 3, puncture: 2 }, only the types above
// zero; the types are DEFINITIONS.damageTypes). The parts of a packet are independent (the user's rule, 2026-11-11: a
// fire sword against a creature resistant to fire still hits with its blade): the target's resistance works on each
// type alone. A hit that already happened keeps its packet as it was calculated.

// The resistance of an actor to one type of damage, in points: for the avatar the sum of the resistance of its parts
// (the user's decision: the resistance is a number of points, and the points become a share of the damage taken off by
// a curve, see resolveDamage). Nothing else has any: no recipe gives it. Pure, like finalSpeed.
function finalResistance(actor, blueprint, type) {
  return isAvatar(actor) ? sumResistance(blueprint, type) : 0;
}

// Writes the resistance of every type into the actor (an actor that carries one starts with { } in its recipe).
function writeResistance(actor, blueprint) {
  for (const type of DEFINITIONS.damageTypes) actor.resistance[type] = finalResistance(actor, blueprint, type);
}

// The packet of an attack from its recipe: for each type, flat + perWeight x weight (the user's idea: the weight
// helps some attacks and not others, so each attack says in its own recipe how much it counts, and an attack that does
// not scale with weight has a perWeight of 0). Types at zero are left out.
function packetOf(parts, weight) {
  const packet = {};
  for (const type of DEFINITIONS.damageTypes) {
    const part = parts[type];
    if (part === undefined) continue;
    const amount = part.flat + part.perWeight * weight;
    if (amount > 0) packet[type] = amount;
  }
  return packet;
}

// The attacks of a thing, by name, each { base, now, ...what is its own }. The BASE is calculated once, when the thing is
// made (the user's rule: static values at the start); NOW is the base plus whatever other things add, calculated again
// every frame (finalAttackNow); a hit takes the NOW of the moment. Every thing has the body slam, whose base is the
// weight times bodySlam.attack.damage (the hit itself scales it by the impact, see finalAttack); a recipe can have more
// (DEFINITIONS.actors.biter.attacks), and what is not about damage (reach, windupFrames, freezeFrames, the hitbox) is copied as it is.
function attackRecipes(thing) {
  return { bodySlam: DEFINITIONS.constants.bodySlam.attack, ...definitionOf(thing).attacks };
}

function finalAttacks(thing) {
  const attacks = {};
  for (const [name, recipe] of Object.entries(attackRecipes(thing))) {
    const base = packetOf(recipe.damage, thing.weight);
    const { damage, ...own } = recipe;
    attacks[name] = { base, now: { ...base }, ...JSON.parse(JSON.stringify(own)) };
  }
  return attacks;
}

// What an attack is now for one type. The BASE was made once, at the weight the actor had then; NOW is calculated again every
// frame from the weight the actor has now (the user's rule, 2026-11-11: the body slam follows the weight, so a mecha that
// fires its ammunition hits lighter). The terms are the same as when the base was made, and one rule for every attack, the body
// slam included (the user's rule: no special cases): flat + perWeight x weight; an attack with no weight term (the bullet of
// a weapon) is its base. For an actor whose weight never changes, now is the base, bit for bit. The day an aura gives its neighbors more
// attack, its term goes here too (the base stays as it was made, so the bonus can leave without losing it).
function finalAttackNow(actor, name, attack, type) {
  const term = attackRecipes(actor)[name]?.damage?.[type];
  return term === undefined ? attack.base[type] : term.flat + term.perWeight * actor.weight;
}

// The packet of a hit by body slam. "hit" says what happened: for a collision it is { impact }, the part of the velocity
// that went into the other thing, in px/frame. The body slam is the user's first attack: every type of it grows with
// the impact, now x impact / referenceImpact (provisional formula, the agent's proposal, to be discussed). A weight of 0
// gives an empty packet, so nothing happens, and so does an impact of 0 or less.
// Nothing here is about the dash: any hit counts, whatever gave the speed. Whether a contact is a hit at all (the
// minimum impact) is decided where the collision is. Pure.
function finalAttack(attacker, hit) {
  const packet = {};
  if (hit.impact <= 0) return packet;
  const { now } = attacker.attacks.bodySlam;
  for (const type of DEFINITIONS.damageTypes) {
    if (now[type] > 0) packet[type] = (now[type] * hit.impact) / DEFINITIONS.constants.bodySlam.referenceImpact;
  }
  return packet;
}

// How a packet hurts a target, in the order the terms are applied, so the damage can be explained (the damage trace
// the user wants will read this record; nothing keeps it yet). For each type with an amount:
//   reduction = points / (points + resistanceScale), points = the resistance of the target to that type;
//   after = amount x (1 - reduction).
// The curve never reaches 100% and never stops paying (the user's wish: nobody immortal, and always something to gain
// by adding more). The total is the sum of the parts, and a packet with something in it always costs at least
// damage.minDamage (the defense never makes the target immune). An empty packet costs nothing.
// Returns { parts: [{ type, amount, points, reduction, after }], total, minimumApplied }.
function resolveDamage(packet, target) {
  const scale = DEFINITIONS.constants.damage.resistanceScale;
  const parts = [];
  let sum = 0;
  for (const type of DEFINITIONS.damageTypes) {
    const amount = packet[type];
    if (!(amount > 0)) continue;
    const fromShield = shieldAlive(target) ? target.shield.resistance[type] ?? 0 : 0; // counted only while the shield has something left
    const points = (target.resistance?.[type] ?? 0) + fromShield;
    const reduction = points / (points + scale);
    const after = amount * (1 - reduction);
    parts.push({ type, amount, points, fromShield, reduction, after });
    sum += after;
  }
  if (parts.length === 0) return { parts, total: 0, minimumApplied: false };
  const minimum = DEFINITIONS.constants.damage.minDamage;
  return { parts, total: Math.max(minimum, sum), minimumApplied: sum < minimum };
}

// The damage of a body slam on a target, as one number: the packet of the hit (finalAttack) resolved against the target.
function damageOf(attacker, hit, target) {
  return resolveDamage(finalAttack(attacker, hit), target).total;
}

// Whether a collision between two things is a hit at all (the user's rule, 2026-11-10): the body slam hurts only where
// the avatar is one of the two sides, in both directions. The avatar hurts actors and objects, and actors and objects
// hurt the avatar; an actor against an object, an object against an actor, or two actors, hurt nobody. The weight of
// the mecha is the center of the damage of contact, and nothing else fights by itself (the weapons will, later).
function bodySlamHurts(a, b) {
  return isAvatar(a) || isAvatar(b);
}

// Takes damage off an actor: the shield absorbs first, and what is left goes to health (the user's decision, 2026-11-11).
// Health stops at 0. Any damage, absorbed or not, restarts the wait for the shield to regenerate.
function applyDamage(actor, damage) {
  let left = damage;
  if (actor.shield) {
    const absorbed = Math.min(actor.shield.now, left);
    actor.shield.now -= absorbed;
    left -= absorbed;
    if (damage > 0) actor.shield.quiet = 0;
  }
  actor.health.now = Math.max(0, actor.health.now - left);
}

// An actor counts as faster than its top speed only above this margin, so the
// tiny rounding error of a diagonal (for example 3.0000000000000004) does not.
const OVERSPEED_TOLERANCE = 1e-9;

// Charges and dash. Called every frame for an actor that has "dash".
// 1. Recharge: while below the maximum, count frames; when enough have passed, one charge comes back.
// 2. Dash: if wanted, there is a charge and the actor has a direction, the velocity
//    becomes the direction (always at full length) times the dash speed, and a charge is spent.
//    Without a direction (or without a dash strength) nothing happens and the charge is kept.
// Returns true if the actor dashed in this frame.
function updateDash(actor, wantsDash) {
  const dash = actor.dash;

  if (dash.charges.now < dash.charges.max) {
    dash.recharge += 1;
    if (dash.recharge >= dash.rechargeFrames) {
      dash.charges.now += 1;
      dash.recharge = 0;
    }
  }

  if (!wantsDash || dash.charges.now === 0) return false;

  const { direction, velocity } = actor.move;
  const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  if (length === 0) return false;

  const strength = dash.speed;
  if (strength <= 0) return false; // no part gives a dash
  velocity.x = (direction.x / length) * strength;
  velocity.y = (direction.y / length) * strength;
  dash.charges.now -= 1;
  return true;
}

// Moves a velocity toward a target velocity by at most "rate" (pixels per frame),
// in a straight line, and changes the velocity in place. If the target is
// within reach, it lands exactly on it. Only arithmetic and a square root
// (which is exact in every browser), so the result is the same everywhere.
function approach(velocity, target, rate) {
  const deltaX = target.x - velocity.x;
  const deltaY = target.y - velocity.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (distance <= rate) {
    velocity.x = target.x;
    velocity.y = target.y;
    return;
  }
  velocity.x += (deltaX / distance) * rate;
  velocity.y += (deltaY / distance) * rate;
}

// ---- Objects (rocks, Shrooms) ----
// Objects are not stored in the state. The seed (state.seed) and a formula say which
// object is where, so the same seed always gives the same objects, in any browser.

// A number from 0 to 4294967295 made from four integers. Only integer
// arithmetic (Math.imul, xor, shifts), so it is exact in every browser. The
// Every question asked of the seed has its own salt, so the answers do not follow each other. The numbers are written
// here and nowhere else (a test fails if a number is used twice or if a call of the hash uses a bare number). The first
// six are added to 100 x the place of the layer in the list, so two layers never roll the same numbers.
const SALTS = Object.freeze({
  objectChance: 1,
  objectX: 2,
  objectY: 3,
  objectKind: 4,
  objectHealth: 5,
  objectRadius: 6,
  crowdRadius: 11,
  crowdHealth: 14,
  dummyAngle: 15,
  dummyTurn: 16,
  birthPick: 17,
  birthAlong: 18,
});

// "salt" gives a different number to each question asked about the same square.
function hashInts(seed, x, y, salt) {
  let h = Math.imul(seed, 0x9e3779b1) ^ Math.imul(x, 0x85ebca6b) ^ Math.imul(y, 0xc2b2ae35) ^ Math.imul(salt, 0x27d4eb2f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

// The layers of the ground (terrain.objects.layers) as a list, in the order of the definitions, each one with its id and
// its place in the list (index: it goes into the salts, so two layers never roll the same numbers). Frozen definitions
// never change, so the list is made once.
let cachedLayers = null;
function objectLayers() {
  cachedLayers ??= Object.entries(DEFINITIONS.terrain.objects.layers).map(([id, rules], index) => ({ id, index, ...rules }));
  return cachedLayers;
}

// How far from the center of its square an object of the layer must stay, so objects of neighbor squares of the same
// layer never overlap: the largest radius an object of the layer can have. Computed from the kinds of the layer, never stored.
function objectMargin(layer) {
  return Math.max(...layer.kinds.map((kind) => DEFINITIONS.objects[kind].size.max));
}

// Rolls a whole number from min to max (both included) from the seed, for one square and one "salt".
// Each thing rolled in a square has its own salt, so the rolls do not follow each other.
function rollInRange(seed, squareX, squareY, salt, min, max) {
  return min + (hashInts(seed, squareX, squareY, salt) % (max - min + 1));
}

// The object in one square of a layer of the world, or null if that square has none.
// An object is { type, layer, position: { x, y }, square: { x, y }, radius, health: { now, max } }. Everything in it is a
// whole number rolled from the seed inside a range of its type (size, healthRange); the layer and the square say which
// object it is (see damageObject). The salts, added to 100 x the place of the layer in the list: 1 chance, 2 and 3
// position, 4 type, 5 health, 6 radius. An object that overlaps an object of a layer with a larger square is not placed.
function objectInSquare(seed, layer, squareX, squareY) {
  const salt = (kind) => layer.index * 100 + kind; // kind: one of the object salts of SALTS

  if (hashInts(seed, squareX, squareY, salt(SALTS.objectChance)) % 100 >= layer.chancePercent) return null;

  const margin = objectMargin(layer);
  const room = layer.cellSize - 2 * margin;
  const x = squareX * layer.cellSize + margin + (hashInts(seed, squareX, squareY, salt(SALTS.objectX)) % room);
  const y = squareY * layer.cellSize + margin + (hashInts(seed, squareX, squareY, salt(SALTS.objectY)) % room);
  if (x * x + y * y < layer.safeRadius * layer.safeRadius) return null;

  const type = layer.kinds[hashInts(seed, squareX, squareY, salt(SALTS.objectKind)) % layer.kinds.length];
  const definition = DEFINITIONS.objects[type];
  const health = rollInRange(seed, squareX, squareY, salt(SALTS.objectHealth), definition.healthRange.min, definition.healthRange.max);
  const radius = rollInRange(seed, squareX, squareY, salt(SALTS.objectRadius), definition.size.min, definition.size.max);
  const object = finalizeObject(type, { layer: layer.id, position: { x, y }, square: { x: squareX, y: squareY }, radius, health: { now: health, max: health } });
  return isUnderBiggerLayer(seed, layer, object) ? null : object;
}

// True if the object overlaps an object of a layer with a larger square (that layer wins). Only those layers are asked.
function isUnderBiggerLayer(seed, layer, object) {
  const { x, y } = object.position;
  for (const bigger of objectLayers()) {
    if (bigger.cellSize <= layer.cellSize) continue;
    const reach = object.radius + objectMargin(bigger);
    for (const other of objectsInLayer(seed, bigger, x - reach, y - reach, x + reach, y + reach)) {
      const touching = object.radius + other.radius;
      const dx = x - other.position.x;
      const dy = y - other.position.y;
      if (dx * dx + dy * dy < touching * touching) return true;
    }
  }
  return false;
}

// Every object of one layer whose center is inside the area (world coordinates), in a fixed order (row by row).
function objectsInLayer(seed, layer, left, top, right, bottom) {
  const size = layer.cellSize;
  const objects = [];
  for (let squareY = Math.floor(top / size); squareY <= Math.floor(bottom / size); squareY++) {
    for (let squareX = Math.floor(left / size); squareX <= Math.floor(right / size); squareX++) {
      const object = objectInSquare(seed, layer, squareX, squareY);
      if (!object) continue;
      const { x, y } = object.position;
      if (x >= left && x <= right && y >= top && y <= bottom) objects.push(object);
    }
  }
  return objects;
}

// Every object whose center is inside the area (world coordinates), in a fixed order (layer by layer, in the order of
// the definitions, and row by row inside each). Looking at a bigger area never changes an object, it only finds more.
function objectsInArea(seed, left, top, right, bottom) {
  const objects = [];
  for (const layer of objectLayers()) objects.push(...objectsInLayer(seed, layer, left, top, right, bottom));
  return objects;
}

// Every object that may touch the area: its center can be outside, as far as the largest radius of its layer.
// Same order as objectsInArea.
function objectsReaching(seed, left, top, right, bottom) {
  const objects = [];
  for (const layer of objectLayers()) {
    const margin = objectMargin(layer);
    objects.push(...objectsInLayer(seed, layer, left - margin, top - margin, right + margin, bottom + margin));
  }
  return objects;
}

// ---- Objects that are hurt ----
// An object comes from the formula with its full health (object.health: now and max, equal). Only an object that
// was hurt is in the state: state.damagedObjects maps "layer:squareX,squareY" to its current health.
// An object at 0 is broken: it is not drawn and nothing collides with it any more.

function objectKey(object) {
  return object.layer + ":" + object.square.x + "," + object.square.y;
}

function objectHealth(state, object) {
  return state.damagedObjects[objectKey(object)] ?? object.health.now;
}

function isObjectBroken(state, object) {
  return objectHealth(state, object) <= 0;
}

// Takes damage off an object. Returns true if the object broke in this hit.
function damageObject(state, object, damage) {
  if (damage <= 0) return false;
  const current = Math.max(0, objectHealth(state, object) - damage);
  state.damagedObjects[objectKey(object)] = current;
  return current === 0;
}

// Breaks an object at once, whatever its health: it is gone, like an object that reached 0.
function breakObject(state, object) {
  state.damagedObjects[objectKey(object)] = 0;
}

// Crushing (the user's decision, 2026-11-11): a potential behavior of EVERY actor, on or off (actor.crushes; today it
// is off for everyone, a buff will switch it on and off later and the time is the buff's, not this field's). An actor
// that crushes breaks every object it touches: the object vanishes (breakObject: no new state, the user chose this
// over flinging it), no damage goes either way, the actor is not pushed, not bounced, not turned, and keeps going.
// It is a rule, not a huge damage in disguise, so a damage trace must show it as such. Objects only: what a crusher
// does to another actor is the ordinary collision. Returns true if the object was crushed (so there is no collision).
function crushObject(state, actor, object) {
  if (!actor.crushes) return false;
  breakObject(state, object);
  return true;
}

// ---- Collision with objects ----

// How two circles touch, or null if they do not overlap: the normal (the unit vector from b to a), the distance
// between the centers and the overlap (how far a must move along the normal to just touch b). Same centers cannot
// happen in practice; if they did, the normal points to the right, so the result is still the same everywhere.
function contactBetween(a, b) {
  const touching = a.radius + b.radius;
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  if (dx * dx + dy * dy >= touching * touching) return null;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return {
    normalX: distance === 0 ? 1 : dx / distance,
    normalY: distance === 0 ? 0 : dy / distance,
    overlap: touching - distance,
  };
}

// The objects near the actor that it may touch (the broken ones are gone), in the fixed order of
// objectsInArea. Only objects close enough to touch are looked at (objectsReaching).
function objectsNear(state, actor) {
  const { x, y } = actor.position;
  return objectsReaching(state.seed, x - actor.radius, y - actor.radius, x + actor.radius, y + actor.radius)
    .filter((object) => !isObjectBroken(state, object));
}

// What happens when an actor meets the objects (the one routine for every actor that moves: the avatar and the
// Dummies; the user's rule, 2026-11-11: a Shroom bounces everyone, it only does not hurt everyone).
// For each object the actor overlaps (circle against circle):
// 1. The "normal" is the direction from the object to the actor (a unit vector).
// 2. An actor that crushes (crushObject) breaks the object and goes on: nothing below happens.
// 3. If the actor is going toward the object fast enough (collision.minImpact) and was not already touching it in the
//    last frame, that is a collision, and its impact is the speed going INTO the object (along the normal). When the
//    pair is one that hurts (bodySlamHurts: the avatar is one side), each side hurts the other with its own weight
//    (damageOf, the body slam): the actor takes the damage of the object, and the object takes the damage of the
//    actor. An object keeps its health in state.damagedObjects. An object that breaks has no collision: nothing is
//    pushed, and the actor keeps its speed and goes on.
// 4. The actor is moved along the normal until it just touches the object.
// 5. The velocity is split in two: the part that goes INTO the object (along the
//    normal) and the part that goes ALONG it. The part going in is replaced by
//    the bounce of the object: -bounce x (what was going in); below the minimum impact there is no
//    bounce, the part going in is just removed. The part along the
//    object is not changed, so with bounce 0 the actor slides (it is not friction).
//    How hard the actor hits depends on the angle: a glancing blow loses little.
// Returns true if the actor met an object it was not touching in the last frame (and the object is still there),
// so an actor that reacts to a new contact can (the Dummy turns).
function collideWithObjects(state, actor, lastContacts) {
  let metSomethingNew = false;
  for (const object of objectsNear(state, actor)) {
    const contact = contactBetween(actor, object);
    if (contact === null) continue;
    if (crushObject(state, actor, object)) continue;
    const { normalX, normalY, overlap } = contact;

    // Only the MOMENT of the collision hurts. A pair that was already touching in the last frame is
    // friction (pressing, sliding): it still pushes and bounces, but it is not a new hit.
    const key = actor.id + "|" + object.type + " " + objectKey(object);
    const isNewContact = !lastContacts.includes(key);
    state.contacts.push(key);

    // Negative when the actor is going toward the object.
    const velocity = actor.move.velocity;
    const goingIn = velocity.x * normalX + velocity.y * normalY;

    // A collision needs an impact of at least collision.minImpact; below it nothing triggers.
    const collides = goingIn < 0 && -goingIn >= DEFINITIONS.constants.collision.minImpact;

    if (collides && isNewContact && bodySlamHurts(actor, object)) {
      const hit = { impact: -goingIn };
      applyDamage(actor, damageOf(object, hit, actor));
      if (damageObject(state, object, damageOf(actor, hit, object))) continue; // the object broke: no collision
    }
    if (isNewContact) metSomethingNew = true;

    actor.position.x += normalX * overlap;
    actor.position.y += normalY * overlap;

    // The part going in is removed; a collision also adds the bounce, anything below the minimum does not.
    if (goingIn < 0) {
      const factor = collides ? 1 + object.bounce : 1;
      velocity.x -= factor * goingIn * normalX;
      velocity.y -= factor * goingIn * normalY;
    }
  }
  return metSomethingNew;
}

// ---- Dummies ----
// A Dummy is an actor made by the seed (like an object, from the ranges of its entry), but it lives in the
// state, because it moves. It has `wander: { index, angle, turns }`: its number among the Dummies, the angle it
// wants to walk at (whole degrees, 0 to 359) and how many times it has turned. It moves like any actor (its
// velocity goes to its wanted direction times its speed, by its acceleration), and at every new collision it picks
// another angle: hash(seed, index, turns), so the same run always turns the same way (nothing here is Math.random).

// The sine of a whole number of degrees, from additions and multiplications only (a series), so it is the same in
// every browser (Math.sin is allowed to differ in the last digits). The error is below 1e-11.
function sinDegrees(degrees) {
  let d = ((degrees % 360) + 360) % 360;
  if (d > 180) d -= 360;
  if (d > 90) d = 180 - d;
  if (d < -90) d = -180 - d;
  const radians = (d * Math.PI) / 180;
  const square = radians * radians;
  let term = radians;
  let sum = radians;
  for (let n = 1; n <= 8; n++) {
    term *= -square / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

function cosDegrees(degrees) {
  return sinDegrees(90 - degrees);
}

// Points the Dummy at its angle: the direction it wants is the unit vector of the angle. Its velocity goes there
// by its acceleration, like any actor's (step), so a Dummy that turns makes a curve instead of jumping.
function setHeading(dummy) {
  dummy.move.direction.x = cosDegrees(dummy.wander.angle);
  dummy.move.direction.y = sinDegrees(dummy.wander.angle);
}

// A new random angle, from 0 to 359, for the next stretch of the walk.
function turnDummy(state, dummy) {
  dummy.wander.turns += 1;
  dummy.wander.angle = hashInts(state.seed, dummy.wander.index, dummy.wander.turns, SALTS.dummyTurn) % 360;
  setHeading(dummy);
}

// The real area of the game is the window of the grid around the avatar: windowWidth x windowHeight cells.
// An actor that leaves it on one side comes back on the opposite side (and the same for up and down).
function wrapIntoWindow(actor, player, grid) {
  const width = grid.windowWidth * grid.cellSize;
  const height = grid.windowHeight * grid.cellSize;
  const dx = actor.position.x - player.position.x;
  const dy = actor.position.y - player.position.y;
  if (dx < -width / 2) actor.position.x += width;
  else if (dx >= width / 2) actor.position.x -= width;
  if (dy < -height / 2) actor.position.y += height;
  else if (dy >= height / 2) actor.position.y -= height;
}

// Where an actor is born (the user's rule, 2026-11-10): anywhere off the screen and inside the window of the grid, with
// no search for a free place. The ring between the screen and the edge of the window is the birth ground: the whole
// body of the actor is off the screen (its center at least its radius beyond the edge of the screen), and its center
// is inside the window (the same rule as the wrap: the body may stick out, the center may not). Every point of the
// ring is equally likely: the ring is four strips (left, right, above, below the screen), one is picked with a chance
// equal to its area, then a point in it. If it lands on something, the push of the collision separates them in the
// next steps (like an actor that wraps onto another). The numbers come from the seed, so a run is reproducible.
// Returns the offset from the avatar, in whole pixels. Fails loudly if the ring has no room (it cannot, see test 101).
function birthOffset(seed, index, radius, grid) {
  const halfWidth = (grid.windowWidth * grid.cellSize) / 2;
  const halfHeight = (grid.windowHeight * grid.cellSize) / 2;
  const innerX = grid.screenWidth / 2 + radius; // the first offset at which the body is off the screen
  const innerY = grid.screenHeight / 2 + radius;
  const sideWidth = Math.max(0, Math.floor(halfWidth - innerX)); // the strips on the left and on the right: full height
  const capHeight = Math.max(0, Math.floor(halfHeight - innerY)); // the strips above and below: between the side strips
  const sideArea = sideWidth * Math.floor(2 * halfHeight);
  const capArea = Math.floor(2 * innerX) * capHeight;
  const total = 2 * sideArea + 2 * capArea;
  if (total === 0) throw new Error("No room off the screen and inside the window for an actor of radius " + radius);

  let pick = hashInts(seed, index, 0, SALTS.birthPick) % total;
  const along = hashInts(seed, index, 0, SALTS.birthAlong);
  if (pick < sideArea) return { x: -halfWidth + (pick % sideWidth), y: -halfHeight + (along % Math.floor(2 * halfHeight)) }; // left
  pick -= sideArea;
  if (pick < sideArea) return { x: innerX + (pick % sideWidth), y: -halfHeight + (along % Math.floor(2 * halfHeight)) }; // right
  pick -= sideArea;
  if (pick < capArea) return { x: -innerX + (pick % Math.floor(2 * innerX)), y: -halfHeight + (along % capHeight) }; // above
  pick -= capArea;
  return { x: -innerX + (pick % Math.floor(2 * innerX)), y: innerY + (along % capHeight) }; // below
}

// Makes the actors of one crowd of a new state, by the seed: `count` actors of one type, numbered from 0. For each one
// the seed rolls (SALTS.crowdRadius and SALTS.crowdHealth, with the number of the actor) radius and health, and birthOffset says where it is born
// (the user's birth rule, see "Birth" in AGENTS.md). `rollsFor(index)` gives what is its own to the type (the Dummy's first
// angle). Ids are the type and the number ("dummy_0", "biter_0"). Returns the new actors, in order.
function createCrowd(state, type, count, rollsFor) {
  const recipe = DEFINITIONS.actors[type];
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);
  const made = [];

  for (let index = 0; index < count; index++) {
    const radius = rollInRange(state.seed, index, 0, SALTS.crowdRadius, recipe.size.min, recipe.size.max);
    const offset = birthOffset(state.seed, index, radius, state.grid);
    const position = { x: player.position.x + offset.x, y: player.position.y + offset.y };
    const health = rollInRange(state.seed, index, 0, SALTS.crowdHealth, recipe.healthRange.min, recipe.healthRange.max);
    const actor = finalizeObject(type, { position, radius, health: { now: health, max: health }, ...rollsFor(index) }, undefined, type + "_" + index);
    finalizeStatic(actor);
    finalizeDynamic(actor);
    state.actors.push(actor);
    made.push(actor);
  }
  return made;
}

// The Dummies of Chamber 1: each also rolls its first angle (SALTS.dummyAngle) and is pointed at it.
function createDummies(state) {
  const dummies = createCrowd(state, "dummy", DEFINITIONS.terrain.dummies.count, (index) => ({ wander: { index, angle: hashInts(state.seed, index, 0, SALTS.dummyAngle) % 360, turns: 0 } }));
  for (const dummy of dummies) setHeading(dummy);
}

// The Biters of Chamber 2: they have nothing to roll besides what every actor of a crowd rolls.
function createBiters(state) {
  createCrowd(state, "biter", DEFINITIONS.terrain.biters.count, () => ({}));
}

// The part of the overlap that "a" takes when the actors a and b are pushed apart (the user's decision, 2026-11-11:
// the push between actors is split by weight, so the heavy mecha pushes light enemies and heavy enemies push it):
// the weight of b over the sum of the two, so the heavier one moves less, and b takes the rest. When both weigh 0
// there is nothing to compare, and each takes half.
function pushShare(a, b) {
  const total = a.weight + b.weight;
  return total === 0 ? 0.5 : b.weight / total;
}

// What happens when an actor that moves (not the avatar) touches another actor (the avatar or another that moves). If they overlap:
// 1. If this is a NEW contact (the pair was not touching in the last frame), the pair is one that hurts (bodySlamHurts:
//    only against the avatar) and the speed at which they close in on each other (the impact: the part of the
//    difference of their velocities along the line between the centers) is at least collision.minImpact, it is a hit:
//    the same body slam as the avatar's (damageOf), and BOTH sides hurt the other with their own weight.
// 2. The two are pushed apart along the line until they just touch, the push split by weight (pushShare): the
//    heavier moves less. Nobody's velocity changes.
// 3. If the contact is new, each of the two reacts in its own way (reactToNewContact: a Dummy picks a new angle, a Biter
//    does nothing), hit or not. A pair that was already touching still pushes, but does not hurt and does not react.
// Returns true if they touched (so the cells of both must be written again).
function touchActors(state, lastContacts, dummy, other, key) {
  const contact = contactBetween(dummy, other);
  if (contact === null) return false;
  const { normalX, normalY, overlap } = contact;

  const isNewContact = !lastContacts.includes(key);
  state.contacts.push(key);

  if (isNewContact && bodySlamHurts(dummy, other)) {
    const closing = -((dummy.move.velocity.x - other.move.velocity.x) * normalX + (dummy.move.velocity.y - other.move.velocity.y) * normalY);
    if (closing >= DEFINITIONS.constants.collision.minImpact) {
      const hit = { impact: closing };
      applyDamage(dummy, damageOf(other, hit, dummy));
      applyDamage(other, damageOf(dummy, hit, other));
    }
  }

  const share = pushShare(dummy, other);
  dummy.position.x += normalX * overlap * share;
  dummy.position.y += normalY * overlap * share;
  other.position.x -= normalX * overlap * (1 - share);
  other.position.y -= normalY * overlap * (1 - share);

  if (isNewContact) {
    reactToNewContact(state, dummy);
    reactToNewContact(state, other);
  }
  return true;
}

// What an actor does when it meets something new: a Dummy picks a new angle. The other actors have no reaction of their own.
function reactToNewContact(state, actor) {
  if (actor.wander) turnDummy(state, actor);
}

// ---- The cells of an actor ----
// Every actor holds the cells it covers, in actor.cells: { from: { x, y }, to: { x, y } }, a rectangle of cells with
// both corners included (the user's decision: any actor can have several cells). It is the rectangle of cells that
// the square around its circle touches (position -/+ radius), counted in the world (cellIndex: cell 0 is around the
// origin of the world, not around the avatar), so the cells of an actor change only when IT moves, and pushing the
// avatar does not move everyone's cells. A small actor covers one cell, or up to four when it is over a border; a huge
// one covers many. Two circles that overlap always share at least one cell, whatever their sizes, so nothing has to
// look at neighbor cells and the size of a cell does not limit the size of an actor: it only changes how much work
// the grid saves.

// Writes the cells an actor covers now.
function setCells(actor, grid) {
  actor.cells.from.x = cellIndex(actor.position.x - actor.radius, grid.cellSize);
  actor.cells.from.y = cellIndex(actor.position.y - actor.radius, grid.cellSize);
  actor.cells.to.x = cellIndex(actor.position.x + actor.radius, grid.cellSize);
  actor.cells.to.y = cellIndex(actor.position.y + actor.radius, grid.cellSize);
}

// True if two rectangles of cells have at least one cell in common.
function shareCell(a, b) {
  return a.from.x <= b.to.x && b.from.x <= a.to.x && a.from.y <= b.to.y && b.from.y <= a.to.y;
}

// The index of the grid: for each cell ("x,y"), the numbers of the actors that move (not the avatar) that cover it. It is made again in every
// step from actor.cells (it is not part of the state), and kept right while the collisions push the Dummies.
function addToCells(inCell, number, cells) {
  for (let y = cells.from.y; y <= cells.to.y; y++) {
    for (let x = cells.from.x; x <= cells.to.x; x++) {
      const key = x + "," + y;
      if (!inCell.has(key)) inCell.set(key, []);
      inCell.get(key).push(number);
    }
  }
}

function removeFromCells(inCell, number, cells) {
  for (let y = cells.from.y; y <= cells.to.y; y++) {
    for (let x = cells.from.x; x <= cells.to.x; x++) {
      const list = inCell.get(x + "," + y);
      list.splice(list.indexOf(number), 1);
    }
  }
}

// The smallest number above "after" among the actors that cover any of these cells, or -1 if there is none.
function nextInCells(inCell, cells, after) {
  let next = -1;
  for (let y = cells.from.y; y <= cells.to.y; y++) {
    for (let x = cells.from.x; x <= cells.to.x; x++) {
      const list = inCell.get(x + "," + y);
      if (!list) continue;
      for (const number of list) {
        if (number > after && (next === -1 || number < next)) next = number;
      }
    }
  }
  return next;
}

// The collisions of every actor that moves (not the avatar) with the other actors, in list order: with the avatar, and
// with the actors that move after it in the list (so each pair is looked at once). (The objects were met in the movement, by collideWithObjects, like
// the avatar's.) The result is exactly the one of testing every
// pair in that order; the grid only skips the pairs that cannot touch:
// - a Dummy is tested against the avatar only if they share a cell, and against the Dummies that share a cell with it;
//   the avatar is pushed too, so its cells are written again after a push (it is not in the index, only read);
// - the cells are read from the actors (actor.cells, written by step after the movement), and whenever a collision
//   pushes a Dummy its cells are written again at once, so a Dummy pushed into a third one in the same step still
//   finds it. That is why the next Dummy to test is asked again after every test (nextInCells), instead of from a
//   list made before.
function collideActors(state, lastContacts) {
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);
  const dummies = state.actors.filter((actor) => actor.move && !isAvatar(actor));

  const inCell = new Map();
  dummies.forEach((dummy, number) => addToCells(inCell, number, dummy.cells));

  // A Dummy moved: its cells are written again, in the actor and in the index.
  const refreshCells = (number) => {
    removeFromCells(inCell, number, dummies[number].cells);
    setCells(dummies[number], state.grid);
    addToCells(inCell, number, dummies[number].cells);
  };

  for (let i = 0; i < dummies.length; i++) {
    const dummy = dummies[i];

    if (shareCell(dummy.cells, player.cells)) {
      if (touchActors(state, lastContacts, dummy, player, dummy.id + "|" + AVATAR_ID)) {
        refreshCells(i);
        setCells(player, state.grid); // the avatar was pushed too (it is not in the index, only its cells are read)
      }
    }

    let j = nextInCells(inCell, dummy.cells, i);
    while (j !== -1) {
      if (touchActors(state, lastContacts, dummy, dummies[j], dummy.id + "|" + dummies[j].id)) {
        refreshCells(i);
        refreshCells(j);
      }
      j = nextInCells(inCell, dummy.cells, j);
    }
  }
}

// ---- The Biter: chase, then strike ----
// The first actor that decides what to do (the user's start of the AI, 2026-11-11). Its mind is data that lives in the
// actor, small: actor.ai = { attack, phase, frames }: which of its attacks it uses, "chase", "windup" or "freeze", and the
// frames left of the windup or of the freeze. The numbers of the attack (how close it must be, how long it stays still
// before and after, the hitbox) are in actor.attacks[ai.attack], copied from the recipe when the actor was made.
// Chase: it wants to walk straight at the avatar. When the space between the two bodies is within the reach of the
// attack, it holds still for windupFrames frames (the windup: the avatar can leave), then strikes: a hitbox is born
// (spawnHitbox) and the actor stays still for freezeFrames frames (its wanted direction is zero, so it slows down by its
// deceleration), and then chases again. With windupFrames 0 it strikes at once.
// Called by step for every actor that has `ai`, before anyone moves. It only changes the actor and the hitboxes.
function think(state, actor, player) {
  const ai = actor.ai;
  const attack = actor.attacks[ai.attack];
  const direction = actor.move.direction;

  const dx = player.position.x - actor.position.x;
  const dy = player.position.y - actor.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // Toward the avatar (if the centers are the same there is no direction: it faces right, so the result is the same everywhere).
  const towardX = distance === 0 ? 1 : dx / distance;
  const towardY = distance === 0 ? 0 : dy / distance;

  // The strike: the hitbox is born toward where the avatar is now, and the freeze after it begins.
  const strike = () => {
    spawnHitbox(state, actor, ai.attack, towardX, towardY, { radius: attack.hitbox.radius, frames: attack.hitbox.frames, speed: 0, pierce: null });
    ai.phase = "freeze";
    ai.frames = attack.freezeFrames;
    direction.x = 0;
    direction.y = 0;
  };

  if (ai.phase === "windup") {
    ai.frames -= 1;
    if (ai.frames > 0) {
      direction.x = 0;
      direction.y = 0;
      return;
    }
    strike(); // the windup is over: it strikes even if the avatar left (the hitbox then lands on nothing)
    return;
  }

  if (ai.phase === "freeze") {
    ai.frames -= 1;
    if (ai.frames > 0) {
      direction.x = 0;
      direction.y = 0;
      return;
    }
    ai.phase = "chase"; // the freeze is over: this frame it already chases
  }

  if (distance - actor.radius - player.radius <= attack.reach) {
    if (attack.windupFrames > 0) {
      ai.phase = "windup";
      ai.frames = attack.windupFrames;
      direction.x = 0;
      direction.y = 0;
      return;
    }
    strike();
    return;
  }
  direction.x = towardX;
  direction.y = towardY;
}

// ---- Weapons ----
// A part can have a weapon (DEFINITIONS.parts, the "weapon" of a part: the user's decision, 2026-11-11, one part per slot,
// and the weapon is the arm or shoulder itself). The avatar carries the state of each weapon it has (avatar.weapons):
// { part, magazine, reserve, interval, reload }: the rounds in the magazine and in the reserve, the frames left until it can
// fire again (interval) and until the reload ends (reload, 0 when not reloading). Everything is whole numbers.
// The weapons aim by themselves: the target is the closest actor in range (the first in the list on a tie, so it is the
// same everywhere). Every round weighs (see carriedWeight). The damage of a weapon is an attack of the avatar like any
// other ({ base, now }), so what changes it later (mods, the skill tree) has the same place to enter.

// The state of the weapons of a blueprint, full: one entry per part that has a weapon.
function weaponStates(blueprint) {
  const states = [];
  for (const id of blueprint.parts) {
    const weapon = DEFINITIONS.parts[id].weapon;
    if (weapon) states.push({ part: id, magazine: weapon.rounds.magazine, reserve: weapon.rounds.reserve, interval: 0, reload: 0 });
  }
  return states;
}

// The attack of each weapon of an actor, by the id of its part: { base, now, projectile } (the projectile numbers, among
// them pierce, are copied so each can change in a run).
function addWeaponAttacks(actor) {
  for (const weapon of actor.weapons ?? []) {
    const { damage, ...projectile } = DEFINITIONS.parts[weapon.part].weapon.projectile;
    actor.attacks[weapon.part] = { base: { ...damage }, now: { ...damage }, projectile };
  }
}

// The closest actor (not the avatar, still with health) whose body is within range of the avatar, or null.
function closestTarget(state, player, range) {
  let best = null;
  let bestDistance = Infinity;
  for (const actor of state.actors) {
    if (isAvatar(actor) || actor.health.now <= 0) continue;
    const dx = actor.position.x - player.position.x;
    const dy = actor.position.y - player.position.y;
    const distance = dx * dx + dy * dy;
    const reach = range + actor.radius;
    if (distance <= reach * reach && distance < bestDistance) {
      best = actor;
      bestDistance = distance;
    }
  }
  return best;
}

// One frame of every weapon of the avatar: the interval and the reload count down; an empty magazine starts a reload if
// there is a reserve, and the reload ends by filling the magazine from the reserve; a weapon that is ready, has a round
// and has a target fires one bullet at it (born one body ahead of the avatar, moving at the speed of the weapon).
function fireWeapons(state, player) {
  for (const weapon of player.weapons) {
    const recipe = DEFINITIONS.parts[weapon.part].weapon;
    if (weapon.interval > 0) weapon.interval -= 1;
    if (weapon.reload > 0) {
      weapon.reload -= 1;
      if (weapon.reload === 0) {
        const taken = Math.min(recipe.rounds.magazine - weapon.magazine, weapon.reserve);
        weapon.magazine += taken;
        weapon.reserve -= taken;
      }
      continue; // a frame spent reloading is not a frame of firing
    }
    if (weapon.magazine === 0) {
      if (weapon.reserve > 0) weapon.reload = recipe.reloadFrames;
      continue;
    }
    if (weapon.interval > 0) continue;
    const target = closestTarget(state, player, recipe.range);
    if (target === null) continue;
    const dx = target.position.x - player.position.x;
    const dy = target.position.y - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const towardX = distance === 0 ? 1 : dx / distance; // same centers: faces right, the same everywhere
    const towardY = distance === 0 ? 0 : dy / distance;
    const attack = player.attacks[weapon.part];
    spawnHitbox(state, player, weapon.part, towardX, towardY, { radius: attack.projectile.radius, frames: attack.projectile.lifeFrames, speed: attack.projectile.speed, pierce: attack.projectile.pierce });
    weapon.magazine -= 1;
    weapon.interval = recipe.intervalFrames;
  }
}

// ---- Hitboxes ----
// A hitbox is the first thing in the game that is neither an actor nor an object: a circle that exists for a few frames
// and hurts (the user's idea: an attack is a hitbox of size X). It carries the damage as it was calculated in the frame it
// was born (the user's decision: it keeps the final value, as a packet), and it stays where it was born. state.hitboxes
// is the list of the living ones, in the order they were born. Whether a hitbox is an actor, like a projectile, is open.
// { owner: id of whoever made it, attack: its name, position, radius, framesLeft, damage: packet,
//   velocity: { x, y } (zero for a bite, the speed of a bullet), struck: ids already hurt (each is hurt once),
//   pierceLeft: how many more things it can cross, or null for a hitbox that does not end when it hits (a bite lives its frames) }
// A projectile is a hitbox with a velocity and a pierceLeft (the user's decision: a bullet is just a hitbox that moves).
// pierce 0 crosses nothing: it ends at the first thing it hits; pierce 1 crosses one thing and ends at the second.

// The one function that makes a hitbox, for every attack (a bite, a bullet, later a slash). Born one body ahead of the
// owner, toward (towardX, towardY) (a unit vector), with the damage the attack has right now. `shape` says what it is:
// { radius, frames (how long it lives), speed (0 stays where it was born), pierce (how many things it crosses, or null for a
// hitbox that does not end when it hits) }.
function spawnHitbox(state, owner, attackName, towardX, towardY, shape) {
  const attack = owner.attacks[attackName];
  state.hitboxes.push({
    owner: owner.id,
    attack: attackName,
    position: { x: owner.position.x + towardX * owner.radius, y: owner.position.y + towardY * owner.radius },
    radius: shape.radius,
    framesLeft: shape.frames,
    damage: { ...attack.now },
    velocity: { x: towardX * shape.speed, y: towardY * shape.speed },
    struck: [],
    pierceLeft: shape.pierce,
  });
}

// Whether the hitbox of an owner hurts a target (the same side rule as the body slam, in the same words: the avatar is one
// side and everything else the other, and nobody hurts their own side): the hitbox of the avatar hurts what is not the
// avatar, the hitbox of anything else hurts the avatar.
function hitboxHurts(ownerId, target) {
  return (ownerId === AVATAR_ID) !== isAvatar(target);
}

// Every living hitbox moves by its velocity, hurts what it touches (each thing once: struck), and loses a frame; the ones
// with no frames left, or that crossed all they could, are gone. The side rule is hitboxHurts: the avatar's hitboxes hurt
// every other actor, anyone else's hurt only the avatar (so those look only at the avatar). Things with no health left
// are not hit (a corpse does not spend a pierce). A bullet is slower than the radii it must not skip over (see the
// validation of weapons), so it cannot jump a target between two frames.
function resolveHitboxes(state) {
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);
  for (const hitbox of state.hitboxes) {
    hitbox.position.x += hitbox.velocity.x;
    hitbox.position.y += hitbox.velocity.y;
    const targets = hitbox.owner === AVATAR_ID ? state.actors : [player];
    for (const target of targets) {
      if (!hitboxHurts(hitbox.owner, target) || target.health.now <= 0 || hitbox.struck.includes(target.id)) continue;
      if (contactBetween(hitbox, target) === null) continue;
      applyDamage(target, resolveDamage(hitbox.damage, target).total);
      hitbox.struck.push(target.id);
      if (hitbox.pierceLeft === 0) {
        hitbox.framesLeft = 0; // it crossed all it could: it ends here
        break;
      }
      if (hitbox.pierceLeft !== null) hitbox.pierceLeft -= 1;
    }
    hitbox.framesLeft -= 1;
  }
  state.hitboxes = state.hitboxes.filter((hitbox) => hitbox.framesLeft > 0);
}

// ---- Destruction ----
// The one place where an actor leaves the scene (the user's decision, 2026-11-11: for now it only removes the actor, so it
// is not drawn and is not in the state any more; a drop, an explosion or a sound will be written here). The others keep
// their order. The avatar is not destroyed yet: nothing has been decided about what its end does to the run.
function destroyActor(state, actor) {
  state.actors.splice(state.actors.indexOf(actor), 1);
}

// Destroys every actor, but the avatar, that has no health left. Called once, at the end of the step, in list order, so
// nothing is removed while a loop walks the list.
function removeDestroyed(state) {
  for (const actor of [...state.actors]) {
    if (!isAvatar(actor) && actor.health.now <= 0) destroyActor(state, actor);
  }
}

// What a run has besides its state: an id, and the blueprint (what the player
// chose before the run). The blueprint is an input of the run, not a state, so it
// is not inside the snaps. It starts as the starter blueprint (DEFINITIONS.starterBlueprint),
// copied, and it must be a valid one.
function createRun(id, source = DEFINITIONS.starterBlueprint) {
  const blueprint = { parts: [...source.parts] };
  assertValidBlueprint(blueprint);
  return { id, blueprint };
}

// Initial state of a chamber: the avatar at the center of the world, with the full health of its blueprint, and the crowd
// of the chamber born around it (`populate` makes it). The objects come from the seed and are not in the state.
// The state is a single plain JSON object (no functions, Map, NaN, etc.).
// runId: the id of the run this state belongs to. The rules never read it; it
// only identifies the snap (two runs both have a "frame 300").
// blueprint: the blueprint of the run, used only to make the avatar (createAvatar).
function createChamberState(populate, runId, seed, blueprint) {
  const avatar = createAvatar(blueprint);

  const state = {
    run: runId,
    frame: 0,

    // The seed of the world (it decides every object: where it is, which type, its size and its health). It is in the state
    // so a snap alone is enough to replay: the rules read it from here.
    // It must be a whole number.
    seed,

    // The objects that were hurt: "layer:squareX,squareY" -> current health (see "Objects that are hurt").
    // Empty at the start: every object has its full health, which comes from the seed.
    damagedObjects: {},

    // The pairs that were touching in the last frame ("actor id|thing"), to tell a new collision (a hit)
    // from friction (still touching, no new hit). Rebuilt every frame by step.
    contacts: [],

    // Version of the definitions this state was made with (see src/data.js).
    definitionsVersion: DEFINITIONS_VERSION,

    // Collision grid. These are dev settings. They live in the state so a run
    // can be reproduced exactly, and so they can be changed in one place.
    // - screenWidth, screenHeight: what the player sees, in pixels: the size of the canvas (index.html; src/main.js
    //   checks that the two agree). The rules need it to know what is off the screen (birthOffset) and the window is
    //   counted from it. rule: the canvas is 1920 x 1080 (the user's requirement).
    // - cellSize: side of a cell, in pixels. It does not limit the size of an actor: an actor covers every cell
    //   its circle reaches (actor.cells), so two actors that touch always share a cell. It only decides how much
    //   work the grid saves: a cell much smaller than the actors makes each one cover many cells, a cell much larger
    //   puts many actors in the same cell. Measure with `node tests/agent/benchmark-grid.js`.
    // - windowWidth, windowHeight: the window around the player, measured in cells (its size in pixels is
    //   windowWidth x cellSize by windowHeight x cellSize, centered on the player). Each is odd, 3 or more.
    //   It is the real area of the game: an actor that leaves it comes back on the opposite side (wrapIntoWindow),
    //   so it must cover all the ground where an actor can be, and some actors are off screen. The
    //   window is twice the screen (1920 x 1080), so 3840 x 2160 pixels: half
    //   of it is 1920 x 1080, and the center cell already covers 32. So 30 cells
    //   on each side across (61 columns) and 17 up and down (35 rows).
    //   How far outside the screen actors can be is not decided yet (it depends
    //   on where they spawn). A bigger window costs almost nothing: what costs
    //   is the number of actors tested, not the area.
    // cellSize 64: guess, "an imaginary number that looks reasonable" (the user's words). The benchmark found the cost
    //   about the same from 60 to 100 with the Dummies of today; it is to be measured again when the actors change.
    // windowWidth x windowHeight = rule: twice the screen (see above).
    grid: { screenWidth: 1920, screenHeight: 1080, cellSize: 64, windowWidth: 61, windowHeight: 35 },

    // The hitboxes alive now (see "Hitboxes"). Empty until something strikes.
    hitboxes: [],

    actors: [avatar],
  };

  assertValidGrid(state.grid);
  populate(state);
  for (const actor of state.actors) setCells(actor, state.grid);
  return state;
}

// Chamber 1: the Dummies, which only walk and collide.
function createChamber1State(runId = 1, seed = 1, blueprint = DEFINITIONS.starterBlueprint) {
  return createChamberState(createDummies, runId, seed, blueprint);
}

// Chamber 2 (COMBAT): the same world, with the Biters, which chase the avatar and strike.
function createChamber2State(runId = 1, seed = 1, blueprint = DEFINITIONS.starterBlueprint) {
  return createChamberState(createBiters, runId, seed, blueprint);
}

// Fails loudly if the grid settings make no sense.
function assertValidGrid(grid) {
  if (!(grid.cellSize > 0)) {
    throw new Error("grid.cellSize must be greater than 0");
  }
  for (const name of ["screenWidth", "screenHeight"]) {
    if (!(Number.isInteger(grid[name]) && grid[name] > 0)) throw new Error("grid." + name + " must be a whole number of pixels above 0");
  }
  for (const name of ["windowWidth", "windowHeight"]) {
    const cells = grid[name];
    if (!Number.isInteger(cells) || cells < 3 || cells % 2 === 0) {
      throw new Error("grid." + name + " must be an odd integer, 3 or more");
    }
  }
}

// Index of the cell that contains a coordinate of the world, on one axis. The origin of the world is at the center
// of cell 0, so cell 0 covers from -cellSize / 2 up to (not including) +cellSize / 2.
function cellIndex(coordinate, cellSize) {
  return Math.floor((coordinate + cellSize / 2) / cellSize);
}

// Advances the state by one frame. Changes the state in place.
// input = { move: { x, y }, dash: true or false }  (dash is optional, and means "pressed in this frame")
// blueprint = the blueprint of the run (see createRun). It is not in the state, so it is an argument.
function step(state, input, blueprint) {
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);

  // 0. The dynamic values: every actor calculates them again and carries them for this frame (finalizeDynamic).
  // The static ones were calculated when the actor was made.
  for (const actor of state.actors) finalizeDynamic(actor, blueprint);

  // 1. Player input (values are copied, so the state never points into the input).
  player.move.direction.x = input.move.x;
  player.move.direction.y = input.move.y;

  // 1b. The minds: every actor that has `ai` decides where to go and whether to strike (think), before anyone moves.
  for (const actor of state.actors) {
    if (actor.ai) think(state, actor, player);
  }

  // 1c. The weapons of the avatar count down, reload, and fire at the closest target (fireWeapons).
  fireWeapons(state, player);

  // 2. Movement: every actor that has "move" walks, in list order.
  // The velocity does not jump to the wanted value: it speeds up toward it
  // while the actor wants to move, and slows down toward zero when it does not.
  // Above the top speed (after a dash) it slows down by the fixed overspeedDecay instead.
  // The top speed was calculated for this frame (step 0), because it can change from one frame to the next.
  // The contacts of the last frame are kept to tell a new collision from friction (see collideWithObjects).
  const lastContacts = state.contacts;
  state.contacts = [];
  for (const actor of state.actors) {
    if (!actor.move) continue;
    const { direction, velocity } = actor.move;
    const speed = actor.speed;

    // In the frame of a dash the actor moves at the full dash speed, and the
    // slowing down starts in the next frame.
    let dashed = false;
    if (actor.dash) {
      const wantsDash = isAvatar(actor) && input.dash === true;
      dashed = updateDash(actor, wantsDash);
    }

    const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    const wantsToMove = direction.x !== 0 || direction.y !== 0;
    let rate;
    if (currentSpeed > speed + OVERSPEED_TOLERANCE) {
      rate = DEFINITIONS.constants.overspeedDecay;
    } else {
      rate = wantsToMove ? actor.acceleration : actor.deceleration;
    }

    const target = { x: direction.x * speed, y: direction.y * speed };
    if (!dashed) approach(velocity, target, rate);

    actor.position.x += velocity.x;
    actor.position.y += velocity.y;

    // The window around the avatar is the real area of the game: any other actor that leaves it comes back on the
    // opposite side. (The avatar is first in the list, so it has already moved.)
    if (!isAvatar(actor)) wrapIntoWindow(actor, player, state.grid);

    // The objects: pushed out, bounced, hurt if the pair hurts. A Dummy picks a new angle when it meets a new one.
    const metSomethingNew = collideWithObjects(state, actor, lastContacts);
    if (metSomethingNew) reactToNewContact(state, actor);
  }

  // 3. Cells: the cells every actor covers now (see "The cells of an actor").
  // Every actor must already have "cells" and a radius (it fails loudly if one does not).
  for (const actor of state.actors) setCells(actor, state.grid);

  // 4. The actors collide with each other (the ones that move with the avatar, and among themselves) and each one reacts to
  // a new contact in its own way. The collision reads the cells from the actors, and writes them again for everyone it
  // pushes, so at the end of the step they are still right.
  collideActors(state, lastContacts);

  // 5. The hitboxes hurt, once each, and lose a frame.
  resolveHitboxes(state);

  // 6. Whoever has no health left leaves the scene, in one place, at the end (see destroyActor).
  removeDestroyed(state);

  // 7. The shield counts the quiet frames and regenerates once the wait is over (regenerateShield).
  for (const actor of state.actors) if (actor.shield) regenerateShield(actor);

  state.frame += 1;
}

assertValidDefinitions();
