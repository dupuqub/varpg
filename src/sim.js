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

// The speed an actor uses in the current frame, in pixels per frame.
// It is a function, not a stored value, so buffs, mecha parts, etc. can be
// applied here, in order, later. For now it is only the base speed.
// It must stay pure: the result depends only on the actor and the definitions.
function finalSpeed(actor) {
  return definitionOf(actor).baseSpeed;
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
function createChamber1State(runId = 1) {
  const state = {
    run: runId,
    frame: 0,

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
// input = { move: { x, y }, aim: { x, y } }
function step(state, input) {
  const player = state.actors.find((actor) => actor.id === PLAYER_ID);

  // 1. Player input (values are copied, so the state never points into the input).
  player.move.direction.x = input.move.x;
  player.move.direction.y = input.move.y;
  player.aim.x = input.aim.x;
  player.aim.y = input.aim.y;

  // 2. Movement: every actor that has "move" walks, in list order.
  // The speed is asked every frame, because it can change from one frame to the next.
  for (const actor of state.actors) {
    if (!actor.move) continue;
    const speed = finalSpeed(actor);
    actor.position.x += actor.move.direction.x * speed;
    actor.position.y += actor.move.direction.y * speed;
  }

  // 3. Cells: where every actor is, relative to the player.
  // Every actor must already have a "cell" (it fails loudly if one does not).
  for (const actor of state.actors) {
    actor.cell.x = cellIndex(actor.position.x - player.position.x, state.grid.cellSize);
    actor.cell.y = cellIndex(actor.position.y - player.position.y, state.grid.cellSize);
  }

  state.frame += 1;
}
