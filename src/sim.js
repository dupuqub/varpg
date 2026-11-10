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
// - The objects the seed places (terrain.objects.kinds) must exist.
function assertValidDefinitions() {
  for (const [id, object] of Object.entries(DEFINITIONS.objects)) {
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
  for (const kind of DEFINITIONS.terrain.objects.kinds) {
    if (!DEFINITIONS.objects[kind]) throw new Error("terrain.objects.kinds has " + kind + ", which is not an object");
  }
}

// The top speed of an actor in the current frame, in pixels per frame.
// For the avatar: the sum of the speed of its parts, minus the weight it carries
// (weight x weightSpeedPenalty). It never goes below 0 (a negative top speed would
// reverse the controls; whether there is a minimum speed is not decided).
// It is a function, not a stored value, so buffs can be applied here, in order, later.
// It must stay pure: the result depends only on the arguments and the definitions.
function finalSpeed(actor, blueprint) {
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

// How far from the center of its square an object must stay, so objects of neighbor squares never overlap: the
// largest radius an object can have. Computed from the objects the seed places, never stored.
function objectMargin() {
  return Math.max(...DEFINITIONS.terrain.objects.kinds.map((kind) => DEFINITIONS.objects[kind].size.max));
}

// Rolls a whole number from min to max (both included) from the seed, for one square and one "salt".
// Each thing rolled in a square has its own salt, so the rolls do not follow each other.
function rollInRange(seed, squareX, squareY, salt, min, max) {
  return min + (hashInts(seed, squareX, squareY, salt) % (max - min + 1));
}

// The object in one square of the world, or null if that square has none.
// An object is { type, position: { x, y }, square: { x, y }, radius, maxHealth }. Everything in it is a whole
// number rolled from the seed inside a range of its type (size, healthRange); the square says which object it is
// (see damageObject). The salts: 1 chance, 2 and 3 position, 4 type, 5 health, 6 radius.
function objectInSquare(seed, squareX, squareY) {
  const rules = DEFINITIONS.terrain.objects;

  if (hashInts(seed, squareX, squareY, 1) % 100 >= rules.chancePercent) return null;

  const margin = objectMargin();
  const room = rules.cellSize - 2 * margin;
  const x = squareX * rules.cellSize + margin + (hashInts(seed, squareX, squareY, 2) % room);
  const y = squareY * rules.cellSize + margin + (hashInts(seed, squareX, squareY, 3) % room);
  if (x * x + y * y < rules.safeRadius * rules.safeRadius) return null;

  const type = rules.kinds[hashInts(seed, squareX, squareY, 4) % rules.kinds.length];
  const definition = DEFINITIONS.objects[type];
  const maxHealth = rollInRange(seed, squareX, squareY, 5, definition.healthRange.min, definition.healthRange.max);
  const radius = rollInRange(seed, squareX, squareY, 6, definition.size.min, definition.size.max);
  return finalizeObject(type, { position: { x, y }, square: { x: squareX, y: squareY }, radius, maxHealth });
}

// Every object whose center is inside the area (world coordinates), in a fixed
// order (row by row). Looking at a bigger area never changes an object, it only finds more.
function objectsInArea(seed, left, top, right, bottom) {
  const size = DEFINITIONS.terrain.objects.cellSize;
  const objects = [];
  for (let squareY = Math.floor(top / size); squareY <= Math.floor(bottom / size); squareY++) {
    for (let squareX = Math.floor(left / size); squareX <= Math.floor(right / size); squareX++) {
      const object = objectInSquare(seed, squareX, squareY);
      if (!object) continue;
      const { x, y } = object.position;
      if (x >= left && x <= right && y >= top && y <= bottom) objects.push(object);
    }
  }
  return objects;
}

// ---- Objects that are hurt ----
// An object comes from the formula with its full health (object.maxHealth). Only an object that
// was hurt is in the state: state.damagedObjects maps "squareX,squareY" to its current health.
// An object at 0 is broken: it is not drawn and nothing collides with it any more.

function objectKey(object) {
  return object.square.x + "," + object.square.y;
}

function objectHealth(state, object) {
  return state.damagedObjects[objectKey(object)] ?? object.maxHealth;
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
// objectsInArea. Only objects close enough to touch are looked at: the largest radius of an object is the margin.
function objectsNear(state, actor) {
  const reach = actor.radius + objectMargin();
  return objectsInArea(
    state.seed,
    actor.position.x - reach,
    actor.position.y - reach,
    actor.position.x + reach,
    actor.position.y + reach
  ).filter((object) => !isObjectBroken(state, object));
}

// Pushes an actor out of the objects it overlaps, hurts both sides, and changes its velocity.
// For each object that overlaps (circle against circle):
// 1. The "normal" is the direction from the object to the actor (a unit vector).
// 2. If the actor is going toward the object fast enough (collision.minImpact) and was not already touching it in the last frame, that is a hit, and its impact is the speed
//    going INTO the object (along the normal). Each side hurts the other with its own
//    weight (damageOf, the body slam): the actor takes the damage of the object, and the
//    object takes the damage of the actor. An object keeps its health in state.damagedObjects.
//    An object that breaks has no collision: nothing is pushed, and the actor keeps its speed and goes on.
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

    if (collides && isNewContact) {
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
    // - cellSize: side of a cell, in pixels. It must be at least
    //   2 x (largest radius + largest speed). Then two actors that can touch
    //   in one frame are always in the same cell or in adjacent cells.
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
    // cellSize 64: the old rule, 2 x (largest radius 20 + largest speed 12), was exactly at the limit. It is NOT met any
    // more: rocks and Shrooms go up to a radius of 32, so the rule asks for 2 x (32 + 12) = 88. Nothing reads the cells
    // for collision yet, so nothing breaks, but the value must change before something does (the user decides).
    // windowWidth x windowHeight = rule: twice the screen (see above).
    grid: { cellSize: 64, windowWidth: 61, windowHeight: 35 },

    actors: [avatar],
  };

  assertValidGrid(state.grid);
  return state;
}

// Fails loudly if the grid settings make no sense.
function assertValidGrid(grid) {
  if (!(grid.cellSize > 0)) {
    throw new Error("grid.cellSize must be greater than 0");
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

  // 3. Cells: where every actor is, relative to the player.
  // Every actor must already have a "cell" (it fails loudly if one does not).
  for (const actor of state.actors) {
    actor.cell.x = cellIndex(actor.position.x - player.position.x, state.grid.cellSize);
    actor.cell.y = cellIndex(actor.position.y - player.position.y, state.grid.cellSize);
  }

  state.frame += 1;
}

assertValidDefinitions();
