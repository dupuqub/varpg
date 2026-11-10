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
function createActor(id, type) {
  const definition = DEFINITIONS.actors[type];
  if (!definition) throw new Error("Unknown actor type: " + type);

  // The copy through JSON makes every actor own its numbers, so changing one
  // actor never changes the definitions (or another actor).
  const initial = JSON.parse(JSON.stringify(definition.initial));
  return { id, type, ...initial };
}

// The top speed of an actor in the current frame, in pixels per frame.
// It is a function, not a stored value, so buffs, mecha parts, etc. can be
// applied here, in order, later. For now it is only the base speed.
// It must stay pure: the result depends only on the actor and the definitions.
function finalSpeed(actor) {
  return definitionOf(actor).baseSpeed;
}

// The speed an actor gets right after a dash, in pixels per frame. Like
// finalSpeed, it is a function so mecha parts can add to it later (any part may
// contribute to the dash strength). Pure: it depends only on the actor and the definitions.
function finalDashSpeed(actor) {
  return definitionOf(actor).dash.speed;
}

// An actor counts as faster than its top speed only above this margin, so the
// tiny rounding error of a diagonal (for example 3.0000000000000004) does not.
const OVERSPEED_TOLERANCE = 1e-9;

// Charges and dash. Called every frame for an actor that has "dash".
// 1. Recharge: while below the maximum, count frames; when enough have passed, one charge comes back.
// 2. Dash: if wanted, there is a charge and the actor has a direction, the velocity
//    becomes the direction (always at full length) times the dash speed, and a charge is spent.
//    Without a direction nothing happens and the charge is kept.
// Returns true if the actor dashed in this frame.
function updateDash(actor, wantsDash) {
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

  const strength = finalDashSpeed(actor);
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
// A rock is { type, position: { x, y } }, and its position is a whole number.
function rockInSquare(seed, squareX, squareY) {
  const rules = DEFINITIONS.terrain.rocks;

  if (hashInts(seed, squareX, squareY, 1) % 100 >= rules.chancePercent) return null;

  const room = rules.cellSize - 2 * rules.margin;
  const x = squareX * rules.cellSize + rules.margin + (hashInts(seed, squareX, squareY, 2) % room);
  const y = squareY * rules.cellSize + rules.margin + (hashInts(seed, squareX, squareY, 3) % room);
  if (x * x + y * y < rules.safeRadius * rules.safeRadius) return null;

  const type = rules.kinds[hashInts(seed, squareX, squareY, 4) % rules.kinds.length];
  return { type, position: { x, y } };
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

// ---- Collision with rocks ----

// Pushes an actor out of the rocks it overlaps, and changes its velocity.
// For each rock that overlaps (circle against circle):
// 1. The "normal" is the direction from the rock to the actor (a unit vector).
// 2. The actor is moved along the normal until it just touches the rock.
// 3. The velocity is split in two: the part that goes INTO the rock (along the
//    normal) and the part that goes ALONG it. The part going in is replaced by
//    the bounce of the rock: -bounce x (what was going in). The part along the
//    rock is not changed, so with bounce 0 the actor slides (it is not friction).
//    How hard the actor hits depends on the angle: a glancing blow loses little.
// The rocks come from the formula (rocksInArea), in a fixed order. Only rocks
// close enough to touch are looked at: the largest rock radius is the margin.
function collideWithRocks(state, actor) {
  const radius = definitionOf(actor).radius;
  const reach = radius + DEFINITIONS.terrain.rocks.margin;
  const rocks = rocksInArea(
    state.seed,
    actor.position.x - reach,
    actor.position.y - reach,
    actor.position.x + reach,
    actor.position.y + reach
  );

  for (const rock of rocks) {
    const rockDefinition = DEFINITIONS.actors[rock.type];
    const touching = radius + rockDefinition.radius;
    const dx = actor.position.x - rock.position.x;
    const dy = actor.position.y - rock.position.y;
    if (dx * dx + dy * dy >= touching * touching) continue;

    // Same centers (cannot happen in practice): push to the right, so the result is still the same everywhere.
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalX = distance === 0 ? 1 : dx / distance;
    const normalY = distance === 0 ? 0 : dy / distance;

    const overlap = touching - distance;
    actor.position.x += normalX * overlap;
    actor.position.y += normalY * overlap;

    // Negative when the actor is going toward the rock.
    const velocity = actor.move.velocity;
    const goingIn = velocity.x * normalX + velocity.y * normalY;
    if (goingIn < 0) {
      velocity.x -= (1 + rockDefinition.bounce) * goingIn * normalX;
      velocity.y -= (1 + rockDefinition.bounce) * goingIn * normalY;
    }
  }
}

// What a run has besides its state: an id, and the build (what the player
// chose before the run). The build is an input of the run, not a state, so it
// is not inside the snaps. It is empty on purpose: nothing reads it yet.
function createRun(id) {
  return { id, build: {} };
}

// Initial state of Chamber 1: only the player, standing at the center of the world.
// The state is a single plain JSON object (no functions, Map, NaN, etc.).
// runId: the id of the run this state belongs to. The rules never read it; it
// only identifies the snap (two runs both have a "frame 300").
function createChamber1State(runId = 1, seed = 1) {
  const state = {
    run: runId,
    frame: 0,

    // The seed of the world (it decides where the rocks are). It is in the state
    // so a snap alone is enough to replay: the rules read it from here.
    // It must be a whole number.
    seed,

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
    grid: { cellSize: 64, windowWidth: 61, windowHeight: 35 },

    actors: [createActor(PLAYER_ID, "player")],
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
function step(state, input) {
  const player = state.actors.find((actor) => actor.id === PLAYER_ID);

  // 1. Player input (values are copied, so the state never points into the input).
  player.move.direction.x = input.move.x;
  player.move.direction.y = input.move.y;

  // 2. Movement: every actor that has "move" walks, in list order.
  // The velocity does not jump to the wanted value: it speeds up toward it
  // while the actor wants to move, and slows down toward zero when it does not.
  // Above the top speed (after a dash) it slows down by the fixed overspeedDecay instead.
  // The top speed is asked every frame, because it can change from one frame to the next.
  for (const actor of state.actors) {
    if (!actor.move) continue;
    const { direction, velocity } = actor.move;
    const definition = definitionOf(actor);
    const speed = finalSpeed(actor);

    // In the frame of a dash the actor moves at the full dash speed, and the
    // slowing down starts in the next frame.
    let dashed = false;
    if (actor.dash) {
      const wantsDash = actor.id === PLAYER_ID && input.dash === true;
      dashed = updateDash(actor, wantsDash);
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

    collideWithRocks(state, actor);
  }

  // 3. Cells: where every actor is, relative to the player.
  // Every actor must already have a "cell" (it fails loudly if one does not).
  for (const actor of state.actors) {
    actor.cell.x = cellIndex(actor.position.x - player.position.x, state.grid.cellSize);
    actor.cell.y = cellIndex(actor.position.y - player.position.y, state.grid.cellSize);
  }

  state.frame += 1;
}
