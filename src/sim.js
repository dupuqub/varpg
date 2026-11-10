// Simulation: the rules of the game.
// It knows nothing about the screen, keyboard, mouse or browser, only numbers.
// That way it runs the same in the browser and in Node.

const PLAYER_ID = "player_1";

// The fixed values of an actor (radius, base speed, ...) live in DEFINITIONS
// (src/data.js). The actor only keeps its type, and what changes.
function definitionOf(actor) {
  const definition = DEFINITIONS.actors[actor.type];
  if (!definition) throw new Error("Unknown actor type: " + actor.type);
  return definition;
}

// A new actor: a copy of the "initial" state of its type (src/data.js).
// It only holds what changes during a run. A type without "move" in its
// initial state is static.
// A type with a "size" (a still actor) also gets its own "radius", a whole number inside the range of its size.
// A type with a range of radius (min below max) needs the radius to be given; a fixed size gives it by itself.
function createActor(id, type, radius) {
  const definition = DEFINITIONS.actors[type];
  if (!definition) throw new Error("Unknown actor type: " + type);

  // The copy through JSON makes every actor own its numbers, so changing one
  // actor never changes the definitions (or another actor).
  const initial = JSON.parse(JSON.stringify(definition.initial));
  const actor = { id, type, ...initial };

  if (definition.size) {
    const { minRadius, maxRadius } = definition.size;
    const given = radius ?? (minRadius === maxRadius ? minRadius : undefined);
    if (given === undefined) {
      throw new Error("The actor type " + type + " has a radius from " + minRadius + " to " + maxRadius + ": a radius must be given");
    }
    if (!Number.isInteger(given) || given < minRadius || given > maxRadius) {
      throw new Error("The radius of a " + type + " must be a whole number from " + minRadius + " to " + maxRadius + ", and it is " + given);
    }
    actor.radius = given;
  } else if (radius !== undefined) {
    throw new Error("The actor type " + type + " has no size, so it cannot be given a radius");
  }
  return actor;
}

// ---- Parts and the build ----
// The build is what the player chose before the run: for now, the ids of the parts
// the avatar wears (build.parts). It is an input of the run, not part of the state,
// so every function that needs it takes it as an argument.
// Only the avatar has a build: any other actor only has its definition.

function isAvatar(actor) {
  return actor.id === PLAYER_ID;
}

// The definitions of the parts of a build. An unknown id fails loudly.
function partsOf(build) {
  return build.parts.map((id) => {
    const part = DEFINITIONS.parts[id];
    if (!part) throw new Error("Unknown part: " + id);
    return part;
  });
}

// Total weight of the build, in kg.
function totalWeight(build) {
  return partsOf(build).reduce((sum, part) => sum + part.weight, 0);
}

// The sum of one spec over all the parts (a part without it adds 0).
function sumSpec(build, name) {
  return partsOf(build).reduce((sum, part) => sum + (part.specs[name] || 0), 0);
}

// What the parts add to a value, for the avatar. Other actors get nothing from the build.
function fromParts(actor, build, name) {
  return isAvatar(actor) ? sumSpec(build, name) : 0;
}

// Fails loudly if the build is not allowed: an unknown part, or more weight than the
// build can carry (the capacity of the Torso). A hard limit, not a speed penalty.
function assertValidBuild(build) {
  const weight = totalWeight(build);
  const capacity = sumSpec(build, "capacity");
  if (weight > capacity) {
    throw new Error("The build weighs " + weight + " kg and can carry only " + capacity + " kg");
  }
}

// Fails loudly if a definition breaks a rule of the library. It runs once, when this file is loaded, so a
// bad definition stops the game before the first frame.
// - Every weight is a whole number of kg, zero or more (the user's rule): the weight of a part, and for a
//   size the weightPerRadius and the radii (so weightPerRadius x radius is whole). Zero is allowed and has a
//   meaning: the thing is harmless and breaks at the first hit (see AGENTS.md, "Weight 0").
// - A size has whole radii, 1 or more, with minRadius not above maxRadius.
// - A bounce is never above 1 (the user's rule: more would eject whoever hits it, like a spring). A { min, max }
//   needs a size, because it grows with the radius.
// - Rocks (terrain.rocks.kinds) have a fixed size for now (the rolled radius is not implemented), and a radius
//   that fits the margin, or rocks of neighbor squares could overlap.
function assertValidDefinitions() {
  const wholeWeight = (where, value) => {
    if (!(Number.isInteger(value) && value >= 0)) {
      throw new Error("The weight of " + where + " must be a whole number of kg, 0 or more, and it is " + value);
    }
  };
  const validSize = (where, size) => {
    const { minRadius, maxRadius, weightPerRadius } = size;
    wholeWeight(where + " (weightPerRadius)", weightPerRadius);
    if (!Number.isInteger(minRadius) || !Number.isInteger(maxRadius) || minRadius < 1 || minRadius > maxRadius) {
      throw new Error("The size of " + where + " needs whole radii, 1 or more, with minRadius not above maxRadius: " + minRadius + " to " + maxRadius);
    }
  };
  const validBounce = (where, bounce) => {
    const values = typeof bounce === "number" ? [bounce] : [bounce.min, bounce.max];
    if (!values.every((value) => value >= 0 && value <= 1) || (typeof bounce !== "number" && bounce.min > bounce.max)) {
      throw new Error("The bounce of " + where + " must go from 0 to 1, with min not above max: " + JSON.stringify(bounce));
    }
  };

  for (const [id, definition] of Object.entries(DEFINITIONS.actors)) {
    if (definition.size) validSize("the actor type " + id, definition.size);
    if (definition.bounce !== undefined) {
      validBounce("the actor type " + id, definition.bounce);
      if (typeof definition.bounce !== "number" && !definition.size) {
        throw new Error("The bounce of the actor type " + id + " grows with the radius, so it needs a size");
      }
    }
  }
  for (const [id, part] of Object.entries(DEFINITIONS.parts)) wholeWeight("the part " + id, part.weight);
  for (const [id, object] of Object.entries(DEFINITIONS.objects)) validSize("the object " + id, object.size);

  const rules = DEFINITIONS.terrain.rocks;
  for (const kind of rules.kinds) {
    const { minRadius, maxRadius } = DEFINITIONS.actors[kind].size;
    if (minRadius !== maxRadius) throw new Error("The rock kind " + kind + " has a range of radius, and the seed does not roll it yet");
    if (maxRadius > rules.margin) throw new Error("The radius of the rock kind " + kind + " is above terrain.rocks.margin, so rocks could overlap");
  }
}

// The top speed of an actor in the current frame, in pixels per frame.
// For the avatar: the sum of the speed of its parts, minus the weight it carries
// (weight x weightSpeedPenalty). It never goes below 0 (a negative top speed would
// reverse the controls; whether there is a minimum speed is not decided).
// It is a function, not a stored value, so buffs can be applied here, in order, later.
// It must stay pure: the result depends only on the arguments and the definitions.
function finalSpeed(actor, build) {
  const base = definitionOf(actor).baseSpeed ?? 0;
  if (!isAvatar(actor)) return base;
  const weightPenalty = totalWeight(build) * DEFINITIONS.constants.weightSpeedPenalty;
  return Math.max(0, base + sumSpec(build, "speed") - weightPenalty);
}

// The speed an actor gets right after a dash, in pixels per frame: the sum of the
// dashSpeed of the parts (the Booster is the primary source, any part may add to it).
// Without any, there is no dash. Pure, like finalSpeed.
function finalDashSpeed(actor, build) {
  return fromParts(actor, build, "dashSpeed");
}

// The maximum health: what the definition says plus the sum of the health of the parts.
// (The player shows it as "armor", but the code calls it health for every actor.)
function finalMaxHealth(actor, build) {
  return (definitionOf(actor).maxHealth ?? 0) + fromParts(actor, build, "health");
}

// The radius of something, in pixels: its own "radius" (a still actor in the state, or a rock from the
// formula), or the radius of its definition (the avatar).
function radiusOf(thing) {
  return thing.radius ?? definitionOf(thing).radius;
}

// The weight of an actor, in kg: for the avatar the total weight of its build, for any other actor (or rock)
// weightPerRadius x radius (the user's decision: the radius, not the area). Both are whole numbers
// (assertValidDefinitions), so the weight is whole and nothing is rounded.
function weightOf(actor, build) {
  return isAvatar(actor) ? totalWeight(build) : definitionOf(actor).size.weightPerRadius * radiusOf(actor);
}

// The lowest and the highest weight a type can have, computed from its size (never stored).
function weightRangeOf(definition) {
  const { minRadius, maxRadius, weightPerRadius } = definition.size;
  return { min: weightPerRadius * minRadius, max: weightPerRadius * maxRadius };
}

// How much of the speed of whoever hits it comes back (0 = none, 1 = all). A type without "bounce" has none.
// A number is used as it is. { min, max } grows in a straight line with the radius: min at minRadius,
// max at maxRadius (the Shroom: 0.2 at 16 and 1 at 32).
function bounceOf(thing) {
  const definition = definitionOf(thing);
  const bounce = definition.bounce;
  if (bounce === undefined) return 0;
  if (typeof bounce === "number") return bounce;
  const { minRadius, maxRadius } = definition.size;
  return bounce.min + ((bounce.max - bounce.min) * (radiusOf(thing) - minRadius)) / (maxRadius - minRadius);
}

// The attack of a hit (the body slam). "hit" says what happened: for a collision it is
// { impact }, the part of the velocity that went into the other thing, in px/frame.
// Only something whose definition says doesDamage hits at all. The attack grows with the
// weight of the attacker and with the impact: weight x attackPerKg x impact / referenceImpact.
// There is no minimum impact and nothing about the dash here: any contact hits, by any
// speed source. (The formula is a provisional proposal, to be discussed with the user.)
// Like finalSpeed, it is a function so parts and buffs (the modifiers of the body slam)
// can be added later, as terms of the damage trace. Pure: it depends only on its
// arguments and the definitions. The attacker can be an actor or a rock ({ type }).
function finalAttack(attacker, hit, build) {
  const rules = DEFINITIONS.constants.bodySlam;
  if (!definitionOf(attacker).doesDamage || hit.impact <= 0) return 0;
  return (weightOf(attacker, build) * rules.attackPerKg * hit.impact) / rules.referenceImpact;
}

// The defense of an actor: the definition plus the sum of the defense of the parts.
// Pure, like finalSpeed.
function finalDefense(actor, build) {
  return (definitionOf(actor).defense ?? 0) + fromParts(actor, build, "defense");
}

// The damage of a hit on a target: finalAttack - finalDefense, but never below minDamage
// (a hit always costs something). No attack (the attacker does not doDamage) means no damage at all.
// The shield is not here yet.
function damageOf(attacker, hit, target, build) {
  const attack = finalAttack(attacker, hit, build);
  if (attack <= 0) return 0;
  return Math.max(DEFINITIONS.constants.bodySlam.minDamage, attack - finalDefense(target, build));
}

// Takes damage off the health. Health stops at 0 (there is no death yet).
function applyDamage(actor, damage) {
  actor.health.current = Math.max(0, actor.health.current - damage);
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
function updateDash(actor, wantsDash, build) {
  const rules = definitionOf(actor).dash;
  const dash = actor.dash;

  if (dash.charges < rules.maxCharges) {
    dash.recharge += 1;
    if (dash.recharge >= rules.rechargeFrames) {
      dash.charges += 1;
      dash.recharge = 0;
    }
  }

  if (!wantsDash || dash.charges === 0) return false;

  const { direction, velocity } = actor.move;
  const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  if (length === 0) return false;

  const strength = finalDashSpeed(actor, build);
  if (strength <= 0) return false; // no part gives a dash
  velocity.x = (direction.x / length) * strength;
  velocity.y = (direction.y / length) * strength;
  dash.charges -= 1;
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

// ---- Rocks ----
// Rocks are not stored in the state. The seed (state.seed) and a formula say which
// rock is where, so the same seed always gives the same rocks, in any browser.

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

// The rock in one square of the world, or null if that square has none.
// A rock is { type, position: { x, y }, square: { x, y }, radius, maxHealth }. Its position and
// maxHealth are whole numbers; the square says which rock it is (see damageRock), and
// maxHealth is rolled from the seed inside the healthRange of its kind.
function rockInSquare(seed, squareX, squareY) {
  const rules = DEFINITIONS.terrain.rocks;

  if (hashInts(seed, squareX, squareY, 1) % 100 >= rules.chancePercent) return null;

  const room = rules.cellSize - 2 * rules.margin;
  const x = squareX * rules.cellSize + rules.margin + (hashInts(seed, squareX, squareY, 2) % room);
  const y = squareY * rules.cellSize + rules.margin + (hashInts(seed, squareX, squareY, 3) % room);
  if (x * x + y * y < rules.safeRadius * rules.safeRadius) return null;

  const type = rules.kinds[hashInts(seed, squareX, squareY, 4) % rules.kinds.length];
  const { min, max } = DEFINITIONS.actors[type].healthRange;
  const maxHealth = min + (hashInts(seed, squareX, squareY, 5) % (max - min + 1));
  // The radius is not rolled yet: the kinds have a fixed size (assertValidDefinitions), so it is that one.
  const radius = DEFINITIONS.actors[type].size.minRadius;
  return { type, position: { x, y }, square: { x: squareX, y: squareY }, radius, maxHealth };
}

// Every rock whose center is inside the area (world coordinates), in a fixed
// order (row by row). Looking at a bigger area never changes a rock, it only finds more.
function rocksInArea(seed, left, top, right, bottom) {
  const size = DEFINITIONS.terrain.rocks.cellSize;
  const rocks = [];
  for (let squareY = Math.floor(top / size); squareY <= Math.floor(bottom / size); squareY++) {
    for (let squareX = Math.floor(left / size); squareX <= Math.floor(right / size); squareX++) {
      const rock = rockInSquare(seed, squareX, squareY);
      if (!rock) continue;
      const { x, y } = rock.position;
      if (x >= left && x <= right && y >= top && y <= bottom) rocks.push(rock);
    }
  }
  return rocks;
}

// ---- Rocks that are hurt ----
// A rock comes from the formula with its full health (rock.maxHealth). Only a rock that
// was hurt is in the state: state.damagedRocks maps "squareX,squareY" to its current health.
// A rock at 0 is broken: it is not drawn and nothing collides with it any more.

function rockKey(rock) {
  return rock.square.x + "," + rock.square.y;
}

function rockHealth(state, rock) {
  return state.damagedRocks[rockKey(rock)] ?? rock.maxHealth;
}

function isRockBroken(state, rock) {
  return rockHealth(state, rock) <= 0;
}

// Takes damage off a rock. Returns true if the rock broke in this hit.
function damageRock(state, rock, damage) {
  if (damage <= 0) return false;
  const current = Math.max(0, rockHealth(state, rock) - damage);
  state.damagedRocks[rockKey(rock)] = current;
  return current === 0;
}

// ---- Collision with still things (rocks and static actors) ----

// Everything still that the actor may touch: the rocks near it (found by the formula,
// not the broken ones) in the fixed order of rocksInArea, then the static actors of the state.
// Only rocks close enough to touch are looked at: the largest rock radius is the margin.
function staticsNear(state, actor) {
  const reach = radiusOf(actor) + DEFINITIONS.terrain.rocks.margin;
  const rocks = rocksInArea(
    state.seed,
    actor.position.x - reach,
    actor.position.y - reach,
    actor.position.x + reach,
    actor.position.y + reach
  ).filter((rock) => !isRockBroken(state, rock));
  const actors = state.actors.filter((other) => other !== actor && !other.move);
  return [...rocks, ...actors];
}

// Pushes an actor out of the still things it overlaps, hurts both sides, and changes its velocity.
// For each thing that overlaps (circle against circle):
// 1. The "normal" is the direction from the thing to the actor (a unit vector).
// 2. If the actor is going toward the thing fast enough (collision.minImpact) and was not already touching it in the last frame, that is a hit, and its impact is the speed
//    going INTO the thing (along the normal). Each side hurts the other with its own
//    weight (damageOf, the body slam): the actor takes the damage of the thing, and the
//    thing takes the damage of the actor. A rock keeps its health in state.damagedRocks,
//    any other actor in its own health. A rock that breaks has no collision: nothing is
//    pushed, and the actor keeps its speed and goes on.
// 3. The actor is moved along the normal until it just touches the thing.
// 4. The velocity is split in two: the part that goes INTO the thing (along the
//    normal) and the part that goes ALONG it. The part going in is replaced by
//    the bounce of the thing: -bounce x (what was going in); below the minimum impact there is no
//    bounce, the part going in is just removed. The part along the
//    thing is not changed, so with bounce 0 the actor slides (it is not friction).
//    How hard the actor hits depends on the angle: a glancing blow loses little.
function collideWithStatics(state, actor, build, lastContacts) {
  const radius = radiusOf(actor);

  for (const other of staticsNear(state, actor)) {
    const touching = radius + radiusOf(other);
    const dx = actor.position.x - other.position.x;
    const dy = actor.position.y - other.position.y;
    if (dx * dx + dy * dy >= touching * touching) continue;

    // Only the MOMENT of the collision hurts. A pair that was already touching in the last frame is
    // friction (pressing, sliding): it still pushes and bounces, but it is not a new hit.
    const contact = actor.id + "|" + (other.square !== undefined ? "rock " + rockKey(other) : other.id);
    const isNewContact = !lastContacts.includes(contact);
    state.contacts.push(contact);

    // Same centers (cannot happen in practice): push to the right, so the result is still the same everywhere.
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalX = distance === 0 ? 1 : dx / distance;
    const normalY = distance === 0 ? 0 : dy / distance;

    // Negative when the actor is going toward the thing.
    const velocity = actor.move.velocity;
    const goingIn = velocity.x * normalX + velocity.y * normalY;

    // A collision needs an impact of at least collision.minImpact; below it nothing triggers.
    const collides = goingIn < 0 && -goingIn >= DEFINITIONS.constants.collision.minImpact;

    if (collides && isNewContact) {
      const hit = { impact: -goingIn };
      if (actor.health) applyDamage(actor, damageOf(other, hit, actor, build));
      const damage = damageOf(actor, hit, other, build);
      const isRock = other.square !== undefined;
      if (isRock) {
        if (damageRock(state, other, damage)) continue; // the rock broke: no collision
      } else if (other.health) {
        applyDamage(other, damage);
      }
    }

    const overlap = touching - distance;
    actor.position.x += normalX * overlap;
    actor.position.y += normalY * overlap;

    // The part going in is removed; a collision also adds the bounce, anything below the minimum does not.
    if (goingIn < 0) {
      const factor = collides ? 1 + bounceOf(other) : 1;
      velocity.x -= factor * goingIn * normalX;
      velocity.y -= factor * goingIn * normalY;
    }
  }
}

// What a run has besides its state: an id, and the build (what the player
// chose before the run). The build is an input of the run, not a state, so it
// is not inside the snaps. It starts as the starter build (DEFINITIONS.starterBuild),
// copied, and it must be a valid one.
function createRun(id) {
  const build = { parts: [...DEFINITIONS.starterBuild.parts] };
  assertValidBuild(build);
  return { id, build };
}

// Initial state of Chamber 1: the avatar at the center of the world, with the full health of
// its build, and the other actors listed in DEFINITIONS.chamber1.
// The state is a single plain JSON object (no functions, Map, NaN, etc.).
// runId: the id of the run this state belongs to. The rules never read it; it
// only identifies the snap (two runs both have a "frame 300").
// build: the build of the run, used only to give the avatar its starting health.
function createChamber1State(runId = 1, seed = 1, build = DEFINITIONS.starterBuild) {
  const avatar = createActor(PLAYER_ID, "player");
  avatar.health.current = finalMaxHealth(avatar, build);

  const others = DEFINITIONS.chamber1.actors.map((entry) => {
    const actor = createActor(entry.id, entry.type, entry.radius);
    actor.position.x = entry.position.x;
    actor.position.y = entry.position.y;
    return actor;
  });

  const state = {
    run: runId,
    frame: 0,

    // The seed of the world (it decides where the rocks are). It is in the state
    // so a snap alone is enough to replay: the rules read it from here.
    // It must be a whole number.
    seed,

    // The rocks that were hurt: "squareX,squareY" -> current health (see "Rocks that are hurt").
    // Empty at the start: every rock has its full health, which comes from the seed.
    damagedRocks: {},

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
    // cellSize 64 = rule: 2 x (largest radius 20 + largest speed 12), exactly at the limit,
    // so a faster dash or a bigger rock needs a bigger cell. windowWidth x windowHeight = rule: twice the screen (see above).
    grid: { cellSize: 64, windowWidth: 61, windowHeight: 35 },

    actors: [avatar, ...others],
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
// build = the build of the run (see createRun). It is not in the state, so it is an argument.
function step(state, input, build) {
  const player = state.actors.find((actor) => actor.id === PLAYER_ID);

  // 1. Player input (values are copied, so the state never points into the input).
  player.move.direction.x = input.move.x;
  player.move.direction.y = input.move.y;

  // 2. Movement: every actor that has "move" walks, in list order.
  // The velocity does not jump to the wanted value: it speeds up toward it
  // while the actor wants to move, and slows down toward zero when it does not.
  // Above the top speed (after a dash) it slows down by the fixed overspeedDecay instead.
  // The top speed is asked every frame, because it can change from one frame to the next.
  // The contacts of the last frame are kept to tell a new collision from friction (see collideWithStatics).
  const lastContacts = state.contacts;
  state.contacts = [];
  for (const actor of state.actors) {
    if (!actor.move) continue;
    const { direction, velocity } = actor.move;
    const definition = definitionOf(actor);
    const speed = finalSpeed(actor, build);

    // In the frame of a dash the actor moves at the full dash speed, and the
    // slowing down starts in the next frame.
    let dashed = false;
    if (actor.dash) {
      const wantsDash = actor.id === PLAYER_ID && input.dash === true;
      dashed = updateDash(actor, wantsDash, build);
    }

    const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    const wantsToMove = direction.x !== 0 || direction.y !== 0;
    let rate;
    if (currentSpeed > speed + OVERSPEED_TOLERANCE) {
      rate = DEFINITIONS.constants.overspeedDecay;
    } else {
      rate = wantsToMove ? definition.acceleration : definition.deceleration;
    }

    const target = { x: direction.x * speed, y: direction.y * speed };
    if (!dashed) approach(velocity, target, rate);

    actor.position.x += velocity.x;
    actor.position.y += velocity.y;

    collideWithStatics(state, actor, build, lastContacts);
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
