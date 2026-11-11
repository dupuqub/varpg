// Simulation: the rules of the game.
// It knows nothing about the screen, keyboard, mouse or browser, only numbers.
// That way it runs the same in the browser and in Node.

const AVATAR_ID = "avatar_1";

// The fixed values of a thing (an actor or an object) live in DEFINITIONS (src/data.js). The thing only
// keeps its type, and what changes.
function definitionOf(thing) {
  const definition = findDefinition(thing.type);
  if (!definition) throw new Error("Unknown type: " + thing.type);
  return definition;
}

// A type is an actor (DEFINITIONS.actors: the avatar) or an object (DEFINITIONS.objects: the rock and the Shroom).
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
  return object;
}

// The avatar of a new run: the object of its type, with every value final: the movement, the dash (its
// recharge and its charges, full at the start) and the health (full at the start). All of them come from
// final functions, so the blueprint decides them, and they can change during the run.
function createAvatar(blueprint) {
  const avatar = finalizeObject("avatar", {}, blueprint, AVATAR_ID);
  avatar.acceleration = finalAcceleration(avatar, blueprint);
  avatar.deceleration = finalDeceleration(avatar, blueprint);
  avatar.dash.rechargeFrames = finalDashRechargeFrames(avatar, blueprint);
  const maxCharges = finalDashMaxCharges(avatar, blueprint);
  avatar.dash.charges = { now: maxCharges, max: maxCharges };
  const maxHealth = finalMaxHealth(avatar, blueprint);
  avatar.health = { now: maxHealth, max: maxHealth };
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

// Total weight of the blueprint, in kg.
function totalWeight(blueprint) {
  return partsOf(blueprint).reduce((sum, part) => sum + part.weight, 0);
}

// The sum of one spec over all the parts (a part without it adds 0).
function sumSpec(blueprint, name) {
  return partsOf(blueprint).reduce((sum, part) => sum + (part.specs[name] || 0), 0);
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
  for (const [id, object] of Object.entries({ ...DEFINITIONS.objects, dummy: DEFINITIONS.actors.dummy })) {
    const where = "the object " + id;
    if (!object.size) throw new Error("The object " + id + " needs a size: { min, max }, the range of its radius");
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
  const weightPenalty = totalWeight(blueprint) * DEFINITIONS.constants.weightSpeedPenalty;
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
function finalMaxHealth(actor, blueprint) {
  return fromParts(actor, blueprint, "health");
}

// The radius of an object, in pixels: what the seed rolled for it, or the base radius of its recipe (the
// avatar). The size is a final value like the others, so a part or an effect can change it later.
function finalRadius(object, blueprint) {
  return object.radius ?? definitionOf(object).radius;
}

// How fast the avatar speeds up toward its wanted speed, in pixels per frame, every frame. Base from the recipe.
function finalAcceleration(actor, blueprint) {
  return definitionOf(actor).acceleration;
}

// How fast the avatar slows down toward a stop, in pixels per frame, every frame. Base from the recipe.
function finalDeceleration(actor, blueprint) {
  return definitionOf(actor).deceleration;
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
  return isAvatar(thing) ? totalWeight(blueprint) : definitionOf(thing).weightPerRadius * thing.radius;
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

// The attack of a hit (the body slam). "hit" says what happened: for a collision it is
// { impact }, the part of the velocity that went into the other thing, in px/frame.
// There is no flag for who hits: the attack grows with the weight of the attacker (a weight of 0 gives an
// attack of 0, so nothing happens) and with the impact: weight x attackPerKg x impact / referenceImpact.
// Nothing here is about the dash: any hit counts, whatever gave the speed. Whether a contact is a hit at all
// (the minimum impact) is decided in collideWithObjects. (The formula is a provisional proposal, to be
// discussed with the user.)
// Like finalSpeed, it is a function so parts and buffs (the modifiers of the body slam)
// can be added later, as terms of the damage trace. Pure: it depends only on its
// arguments and the definitions. The attacker can be the avatar or an object.
function finalAttack(attacker, hit) {
  const rules = DEFINITIONS.constants.bodySlam;
  if (hit.impact <= 0) return 0;
  return (attacker.weight * rules.attackPerKg * hit.impact) / rules.referenceImpact;
}

// The defense of the avatar: the sum of the defense of its parts. An object has no defense (none was defined).
// Pure, like finalSpeed.
function finalDefense(actor, blueprint) {
  return fromParts(actor, blueprint, "defense");
}

// The damage of a hit on a target: finalAttack - finalDefense, but never below minDamage
// (a hit always costs something). No attack (a weight of 0) means no damage at all.
// The shield is not here yet.
function damageOf(attacker, hit, target, blueprint) {
  const attack = finalAttack(attacker, hit);
  if (attack <= 0) return 0;
  return Math.max(DEFINITIONS.constants.bodySlam.minDamage, attack - finalDefense(target, blueprint));
}

// Whether a collision between two things is a hit at all (the user's rule, 2026-11-10): the body slam hurts only where
// the avatar is one of the two sides, in both directions. The avatar hurts actors and objects, and actors and objects
// hurt the avatar; an actor against an object, an object against an actor, or two actors, hurt nobody. The weight of
// the mecha is the center of the damage of contact, and nothing else fights by itself (the weapons will, later).
function bodySlamHurts(a, b) {
  return isAvatar(a) || isAvatar(b);
}

// Takes damage off the health. Health stops at 0 (there is no death yet).
function applyDamage(actor, damage) {
  actor.health.now = Math.max(0, actor.health.now - damage);
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
function updateDash(actor, wantsDash, blueprint) {
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

  const strength = finalDashSpeed(actor, blueprint);
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
  const salt = (kind) => layer.index * 100 + kind;

  if (hashInts(seed, squareX, squareY, salt(1)) % 100 >= layer.chancePercent) return null;

  const margin = objectMargin(layer);
  const room = layer.cellSize - 2 * margin;
  const x = squareX * layer.cellSize + margin + (hashInts(seed, squareX, squareY, salt(2)) % room);
  const y = squareY * layer.cellSize + margin + (hashInts(seed, squareX, squareY, salt(3)) % room);
  if (x * x + y * y < layer.safeRadius * layer.safeRadius) return null;

  const type = layer.kinds[hashInts(seed, squareX, squareY, salt(4)) % layer.kinds.length];
  const definition = DEFINITIONS.objects[type];
  const health = rollInRange(seed, squareX, squareY, salt(5), definition.healthRange.min, definition.healthRange.max);
  const radius = rollInRange(seed, squareX, squareY, salt(6), definition.size.min, definition.size.max);
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

// ---- Collision with objects ----

// The objects near the actor that it may touch (the broken ones are gone), in the fixed order of
// objectsInArea. Only objects close enough to touch are looked at (objectsReaching).
function objectsNear(state, actor) {
  const { x, y } = actor.position;
  return objectsReaching(state.seed, x - actor.radius, y - actor.radius, x + actor.radius, y + actor.radius)
    .filter((object) => !isObjectBroken(state, object));
}

// Pushes an actor out of the objects it overlaps, hurts both sides, and changes its velocity.
// For each object that overlaps (circle against circle):
// 1. The "normal" is the direction from the object to the actor (a unit vector).
// 2. If the actor is going toward the object fast enough (collision.minImpact) and was not already touching it in the
//    last frame, that is a collision, and its impact is the speed going INTO the object (along the normal). When the
//    pair is one that hurts (bodySlamHurts: the avatar is one side), each side hurts the other with its own weight
//    (damageOf, the body slam): the actor takes the damage of the object, and the object takes the damage of the
//    actor. An object keeps its health in state.damagedObjects. An object that breaks has no collision: nothing is
//    pushed, and the actor keeps its speed and goes on.
// 3. The actor is moved along the normal until it just touches the object.
// 4. The velocity is split in two: the part that goes INTO the object (along the
//    normal) and the part that goes ALONG it. The part going in is replaced by
//    the bounce of the object: -bounce x (what was going in); below the minimum impact there is no
//    bounce, the part going in is just removed. The part along the
//    object is not changed, so with bounce 0 the actor slides (it is not friction).
//    How hard the actor hits depends on the angle: a glancing blow loses little.
function collideWithObjects(state, actor, blueprint, lastContacts) {
  const radius = actor.radius;

  for (const object of objectsNear(state, actor)) {
    const touching = radius + object.radius;
    const dx = actor.position.x - object.position.x;
    const dy = actor.position.y - object.position.y;
    if (dx * dx + dy * dy >= touching * touching) continue;

    // Only the MOMENT of the collision hurts. A pair that was already touching in the last frame is
    // friction (pressing, sliding): it still pushes and bounces, but it is not a new hit.
    const contact = actor.id + "|" + object.type + " " + objectKey(object);
    const isNewContact = !lastContacts.includes(contact);
    state.contacts.push(contact);

    // Same centers (cannot happen in practice): push to the right, so the result is still the same everywhere.
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalX = distance === 0 ? 1 : dx / distance;
    const normalY = distance === 0 ? 0 : dy / distance;

    // Negative when the actor is going toward the object.
    const velocity = actor.move.velocity;
    const goingIn = velocity.x * normalX + velocity.y * normalY;

    // A collision needs an impact of at least collision.minImpact; below it nothing triggers.
    const collides = goingIn < 0 && -goingIn >= DEFINITIONS.constants.collision.minImpact;

    if (collides && isNewContact && bodySlamHurts(actor, object)) {
      const hit = { impact: -goingIn };
      applyDamage(actor, damageOf(object, hit, actor, blueprint));
      if (damageObject(state, object, damageOf(actor, hit, object, blueprint))) continue; // the object broke: no collision
    }

    const overlap = touching - distance;
    actor.position.x += normalX * overlap;
    actor.position.y += normalY * overlap;

    // The part going in is removed; a collision also adds the bounce, anything below the minimum does not.
    if (goingIn < 0) {
      const factor = collides ? 1 + object.bounce : 1;
      velocity.x -= factor * goingIn * normalX;
      velocity.y -= factor * goingIn * normalY;
    }
  }
}

// ---- Dummies ----
// A Dummy is an actor made by the seed (like an object, from the ranges of its entry), but it lives in the
// state, because it moves. It has `wander: { index, angle, turns }`: its number among the Dummies, the angle it
// walks at (whole degrees, 0 to 359) and how many times it has turned. It walks in a straight line at its own
// speed, and at every new collision it picks another angle: hash(seed, index, turns), so the same run always
// turns the same way (nothing here is Math.random).

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

// Points the Dummy at its angle: the direction is the unit vector of the angle, and the velocity is the
// direction times its own speed (a Dummy always walks at its speed, there is no speeding up).
function setHeading(dummy) {
  const { direction, velocity } = dummy.move;
  direction.x = cosDegrees(dummy.wander.angle);
  direction.y = sinDegrees(dummy.wander.angle);
  velocity.x = direction.x * dummy.speed;
  velocity.y = direction.y * dummy.speed;
}

// A new random angle, from 0 to 359, for the next stretch of the walk.
function turnDummy(state, dummy) {
  dummy.wander.turns += 1;
  dummy.wander.angle = hashInts(state.seed, dummy.wander.index, dummy.wander.turns, 16) % 360;
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

  let pick = hashInts(seed, index, 0, 17) % total;
  const along = hashInts(seed, index, 0, 18);
  if (pick < sideArea) return { x: -halfWidth + (pick % sideWidth), y: -halfHeight + (along % Math.floor(2 * halfHeight)) }; // left
  pick -= sideArea;
  if (pick < sideArea) return { x: innerX + (pick % sideWidth), y: -halfHeight + (along % Math.floor(2 * halfHeight)) }; // right
  pick -= sideArea;
  if (pick < capArea) return { x: -innerX + (pick % Math.floor(2 * innerX)), y: -halfHeight + (along % capHeight) }; // above
  pick -= capArea;
  return { x: -innerX + (pick % Math.floor(2 * innerX)), y: innerY + (along % capHeight) }; // below
}

// Makes the Dummies of a new state, by the seed. For each one the seed rolls (salts 11, 14 and 15, with the number of
// the Dummy) radius, health and first angle, and birthOffset says where it is born.
function createDummies(state) {
  const recipe = DEFINITIONS.actors.dummy;
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);

  for (let index = 0; index < DEFINITIONS.terrain.dummies.count; index++) {
    const radius = rollInRange(state.seed, index, 0, 11, recipe.size.min, recipe.size.max);
    const offset = birthOffset(state.seed, index, radius, state.grid);
    const position = { x: player.position.x + offset.x, y: player.position.y + offset.y };
    const health = rollInRange(state.seed, index, 0, 14, recipe.healthRange.min, recipe.healthRange.max);
    const angle = hashInts(state.seed, index, 0, 15) % 360;
    const dummy = finalizeObject("dummy", { position, radius, health: { now: health, max: health }, wander: { index, angle, turns: 0 } }, undefined, "dummy_" + index);
    dummy.speed = finalSpeed(dummy);
    setHeading(dummy);
    state.actors.push(dummy);
  }
}

// Moves a Dummy (it is already pointing at its angle) and wraps it around the window.
function moveDummy(state, dummy, player) {
  dummy.position.x += dummy.move.velocity.x;
  dummy.position.y += dummy.move.velocity.y;
  wrapIntoWindow(dummy, player, state.grid);
}

// What happens when a Dummy touches one thing (an object, the avatar or another Dummy). If they overlap:
// 1. If this is a NEW contact (the pair was not touching in the last frame), the pair is one that hurts (bodySlamHurts:
//    only against the avatar) and the speed at which they close in on each other (the impact: the part of the
//    difference of their velocities along the line between the centers) is at least collision.minImpact, it is a hit:
//    the same body slam as the avatar's (damageOf), and BOTH sides hurt the other with their own weight. Against an
//    object or another Dummy nobody is hurt, so a Dummy never breaks an object (an object that broke in a hit would
//    have no collision: nothing pushed, the Dummy keeping its angle; that is written here for the day an actor other
//    than the avatar hurts objects).
// 2. The Dummy is pushed out along the line until they just touch (two Dummies are pushed half each; the avatar and
//    the objects are not pushed).
// 3. If the contact is new, the Dummy picks a new angle (turnDummy), hit or not. A pair that was already touching
//    still pushes, but does not hurt and does not turn.
// Returns true if something was pushed (so the cells of what moved must be written again).
function touchDummy(state, lastContacts, dummy, other, key, blueprint) {
  const dx = dummy.position.x - other.position.x;
  const dy = dummy.position.y - other.position.y;
  const touching = dummy.radius + other.radius;
  if (dx * dx + dy * dy >= touching * touching) return false;

  const otherIsDummy = other.wander !== undefined;
  const isNewContact = !lastContacts.includes(key);
  state.contacts.push(key);

  // Same centers (cannot happen in practice): push to the right, so the result is still the same everywhere.
  const distance = Math.sqrt(dx * dx + dy * dy);
  const normalX = distance === 0 ? 1 : dx / distance;
  const normalY = distance === 0 ? 0 : dy / distance;

  if (isNewContact && bodySlamHurts(dummy, other)) {
    const otherVelocity = other.move ? other.move.velocity : { x: 0, y: 0 }; // an object does not move
    const closing = -((dummy.move.velocity.x - otherVelocity.x) * normalX + (dummy.move.velocity.y - otherVelocity.y) * normalY);
    if (closing >= DEFINITIONS.constants.collision.minImpact) {
      const hit = { impact: closing };
      applyDamage(dummy, damageOf(other, hit, dummy, blueprint));
      const damage = damageOf(dummy, hit, other, blueprint);
      if (other.square !== undefined) {
        if (damageObject(state, other, damage)) return false; // the object broke: no collision, nothing moved
      } else {
        applyDamage(other, damage);
      }
    }
  }

  const overlap = touching - distance;
  const share = otherIsDummy ? 0.5 : 1;
  dummy.position.x += normalX * overlap * share;
  dummy.position.y += normalY * overlap * share;
  if (otherIsDummy) {
    other.position.x -= normalX * overlap * share;
    other.position.y -= normalY * overlap * share;
  }

  if (isNewContact) {
    turnDummy(state, dummy);
    if (otherIsDummy) turnDummy(state, other);
  }
  return true;
}

// ---- The cells of an actor ----
// Every actor holds the cells it covers, in actor.cells: { from: { x, y }, to: { x, y } }, a rectangle of cells with
// both corners included (the user's decision: any actor can have several cells). It is the rectangle of cells that
// the square around its circle touches (position -/+ radius), relative to the avatar, like cellIndex. A small actor
// covers one cell, or up to four when it is over a border; a huge one covers many. Two circles that overlap always
// share at least one cell, whatever their sizes, so nothing has to look at neighbor cells and the size of a cell
// does not limit the size of an actor: it only changes how much work the grid saves.

// Writes the cells an actor covers now.
function setCells(actor, player, grid) {
  const dx = actor.position.x - player.position.x;
  const dy = actor.position.y - player.position.y;
  actor.cells.from.x = cellIndex(dx - actor.radius, grid.cellSize);
  actor.cells.from.y = cellIndex(dy - actor.radius, grid.cellSize);
  actor.cells.to.x = cellIndex(dx + actor.radius, grid.cellSize);
  actor.cells.to.y = cellIndex(dy + actor.radius, grid.cellSize);
}

// True if two rectangles of cells have at least one cell in common.
function shareCell(a, b) {
  return a.from.x <= b.to.x && b.from.x <= a.to.x && a.from.y <= b.to.y && b.from.y <= a.to.y;
}

// The index of the grid: for each cell ("x,y"), the numbers of the Dummies that cover it. It is made again in every
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

// The smallest number above "after" among the Dummies that cover any of these cells, or -1 if there is none.
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

// The collisions of every Dummy, in list order: with the objects that are still whole, with the avatar, and with
// the Dummies after it in the list (so each pair is looked at once). The result is exactly the one of testing every
// pair in that order; the grid only skips the pairs that cannot touch:
// - a Dummy is tested against the avatar only if they share a cell, and against the Dummies that share a cell with it;
// - the cells are read from the actors (actor.cells, written by step after the movement), and whenever a collision
//   pushes a Dummy its cells are written again at once, so a Dummy pushed into a third one in the same step still
//   finds it. That is why the next Dummy to test is asked again after every test (nextInCells), instead of from a
//   list made before.
function collideDummies(state, lastContacts, blueprint) {
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);
  const dummies = state.actors.filter((actor) => actor.wander);

  const inCell = new Map();
  dummies.forEach((dummy, number) => addToCells(inCell, number, dummy.cells));

  // A Dummy moved: its cells are written again, in the actor and in the index.
  const refreshCells = (number) => {
    removeFromCells(inCell, number, dummies[number].cells);
    setCells(dummies[number], player, state.grid);
    addToCells(inCell, number, dummies[number].cells);
  };

  for (let i = 0; i < dummies.length; i++) {
    const dummy = dummies[i];

    let pushed = false;
    for (const object of objectsNear(state, dummy)) {
      if (touchDummy(state, lastContacts, dummy, object, dummy.id + "|" + object.type + " " + objectKey(object), blueprint)) pushed = true;
    }
    if (pushed) refreshCells(i);

    if (shareCell(dummy.cells, player.cells)) {
      if (touchDummy(state, lastContacts, dummy, player, dummy.id + "|" + AVATAR_ID, blueprint)) refreshCells(i);
    }

    let j = nextInCells(inCell, dummy.cells, i);
    while (j !== -1) {
      if (touchDummy(state, lastContacts, dummy, dummies[j], dummy.id + "|" + dummies[j].id, blueprint)) {
        refreshCells(i);
        refreshCells(j);
      }
      j = nextInCells(inCell, dummy.cells, j);
    }
  }
}

// What a run has besides its state: an id, and the blueprint (what the player
// chose before the run). The blueprint is an input of the run, not a state, so it
// is not inside the snaps. It starts as the starter blueprint (DEFINITIONS.starterBlueprint),
// copied, and it must be a valid one.
function createRun(id) {
  const blueprint = { parts: [...DEFINITIONS.starterBlueprint.parts] };
  assertValidBlueprint(blueprint);
  return { id, blueprint };
}

// Initial state of Chamber 1: the avatar at the center of the world, with the full health of
// its blueprint. Everything else is an object, and objects come from the seed, not from the state.
// The state is a single plain JSON object (no functions, Map, NaN, etc.).
// runId: the id of the run this state belongs to. The rules never read it; it
// only identifies the snap (two runs both have a "frame 300").
// blueprint: the blueprint of the run, used only to make the avatar (createAvatar).
function createChamber1State(runId = 1, seed = 1, blueprint = DEFINITIONS.starterBlueprint) {
  const avatar = createAvatar(blueprint);

  const state = {
    run: runId,
    frame: 0,

    // The seed of the world (it decides every object: where it is, which type, its size and its health). It is in the state
    // so a snap alone is enough to replay: the rules read it from here.
    // It must be a whole number.
    seed,

    // The objects that were hurt: "squareX,squareY" -> current health (see "Objects that are hurt").
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
    // - windowWidth, windowHeight: cells across and down in the window around
    //   the player. Each is odd, 3 or more. The player is in the center cell.
    //   Collision is only tested inside this window, so it must cover all the
    //   ground where an actor can be, and some actors are off screen. The
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

    actors: [avatar],
  };

  assertValidGrid(state.grid);
  createDummies(state);
  for (const actor of state.actors) setCells(actor, avatar, state.grid);
  return state;
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

// Index of the cell that contains a position, on one axis.
// offset = distance from the player. The player is at the center of cell 0,
// so cell 0 covers from -cellSize / 2 up to (not including) +cellSize / 2.
function cellIndex(offset, cellSize) {
  return Math.floor((offset + cellSize / 2) / cellSize);
}

// True if the cell is inside the window around the player.
function isInWindow(grid, cell) {
  const reachX = (grid.windowWidth - 1) / 2;
  const reachY = (grid.windowHeight - 1) / 2;
  return Math.abs(cell.x) <= reachX && Math.abs(cell.y) <= reachY;
}

// Advances the state by one frame. Changes the state in place.
// input = { move: { x, y }, dash: true or false }  (dash is optional, and means "pressed in this frame")
// blueprint = the blueprint of the run (see createRun). It is not in the state, so it is an argument.
function step(state, input, blueprint) {
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);

  // 1. Player input (values are copied, so the state never points into the input).
  player.move.direction.x = input.move.x;
  player.move.direction.y = input.move.y;

  // 2. Movement: every actor that has "move" walks, in list order.
  // The velocity does not jump to the wanted value: it speeds up toward it
  // while the actor wants to move, and slows down toward zero when it does not.
  // Above the top speed (after a dash) it slows down by the fixed overspeedDecay instead.
  // The top speed is asked every frame, because it can change from one frame to the next.
  // The contacts of the last frame are kept to tell a new collision from friction (see collideWithObjects).
  const lastContacts = state.contacts;
  state.contacts = [];
  for (const actor of state.actors) {
    if (!actor.move) continue;
    if (actor.wander) {
      moveDummy(state, actor, player);
      continue;
    }
    const { direction, velocity } = actor.move;
    const speed = finalSpeed(actor, blueprint);

    // In the frame of a dash the actor moves at the full dash speed, and the
    // slowing down starts in the next frame.
    let dashed = false;
    if (actor.dash) {
      const wantsDash = actor.id === AVATAR_ID && input.dash === true;
      dashed = updateDash(actor, wantsDash, blueprint);
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

    collideWithObjects(state, actor, blueprint, lastContacts);
  }

  // 3. Cells: the cells every actor covers now, relative to the player (see "The cells of an actor").
  // Every actor must already have "cells" and a radius (it fails loudly if one does not).
  for (const actor of state.actors) setCells(actor, player, state.grid);

  // 4. The Dummies collide (with objects, the avatar and each other) and turn. The collision reads the cells from
  // the actors, and writes them again for every Dummy it pushes, so at the end of the step they are still right.
  collideDummies(state, lastContacts, blueprint);

  state.frame += 1;
}

assertValidDefinitions();
