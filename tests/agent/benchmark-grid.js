// Benchmark of the collision grid (written by the agent; see tests/agent/README.md). It is not a test: the times
// depend on the machine. Run from the root of the repository:
//
//   node tests/agent/benchmark-grid.js still [frames]    the Dummies of the game, several cell sizes
//   node tests/agent/benchmark-grid.js giants [frames]   the same, with a few huge Dummies among them
//
// The same run (seed 1, the real number of Dummies, an avatar that does not move) is played with several cell sizes.
// The window keeps the same size in pixels (3900 x 2100, an odd number of cells each way for all the sizes), so only
// the cells change. For each cell size it prints:
// - ms per step (the mean of the frames after a short warm-up);
// - pairs: how many Dummy-Dummy pairs are tested per step (every pair would be N x (N - 1) / 2);
// - cells: how many cells a Dummy covers, on average (a huge one covers many when the cell is small);
// - whether the whole state is the same, frame by frame, as the same run played by testing every pair. It must
//   always be "identical": an actor covers every cell its circle reaches, so no cell size can lose a collision.
//
// "giants" makes the first Dummies huge (see GIANTS below) by writing their radius, which the code reads from the
// actor. Their weight is left as it was made.

const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "src");
const source = ["data.js", "sim.js"].map((name) => fs.readFileSync(path.join(SRC, name), "utf8")).join("\n");

// The game, with extra handles: a counter of tested pairs, and the old way of testing every pair.
const makeGame = () => new Function(source + `
  let pairs = 0;
  const realTouch = touchActors;
  touchActors = function (state, lastContacts, dummy, other, key, blueprint) {
    if (other.wander) pairs++;
    return realTouch(state, lastContacts, dummy, other, key, blueprint);
  };
  const withGrid = collideActors;

  function everyPair(state, lastContacts, blueprint) {
    const player = state.actors.find((actor) => actor.id === AVATAR_ID);
    const dummies = state.actors.filter((actor) => actor.wander);
    for (let i = 0; i < dummies.length; i++) {
      const dummy = dummies[i];
      touchActors(state, lastContacts, dummy, player, dummy.id + "|" + AVATAR_ID, blueprint);
      for (let j = i + 1; j < dummies.length; j++) {
        touchActors(state, lastContacts, dummy, dummies[j], dummy.id + "|" + dummies[j].id, blueprint);
      }
    }
  }

  return {
    createChamber1State, createRun, step,
    writeCells(state) { for (const actor of state.actors) setCells(actor, state.grid); },
    useGrid() { collideActors = withGrid; },
    useEveryPair() { collideActors = everyPair; },
    pairs: () => pairs,
    resetPairs() { pairs = 0; },
  };
`)();

const FRAMES = Number(process.argv[3] ?? 300);
const WARM_UP = 30;
const WINDOW = { width: 3900, height: 2100 };
const CELL_SIZES = [12, 20, 60, 100, 300];
const GIANTS = [256, 256, 128, 128, 128, 128, 128, 128]; // the radii written on the first Dummies in "giants"
const input = { move: { x: 0, y: 0 } };

const name = process.argv[2];
if (name !== "still" && name !== "giants") {
  console.log("Usage: node tests/agent/benchmark-grid.js still|giants [frames]");
  process.exit(1);
}

function newState(game, cellSize) {
  const state = game.createChamber1State(1, 1);
  state.grid = { cellSize, windowWidth: WINDOW.width / cellSize, windowHeight: WINDOW.height / cellSize };
  if (name === "giants") {
    const dummies = state.actors.filter((actor) => actor.wander);
    GIANTS.forEach((radius, number) => { dummies[number].radius = radius; });
  }
  game.writeCells(state);
  return state;
}

// Plays the run; returns the ms per step, the pairs per step and the cells a Dummy covers (after the warm-up).
function measure(useEveryPair, cellSize) {
  const game = makeGame();
  const blueprint = game.createRun(1).blueprint;
  const state = newState(game, cellSize);
  useEveryPair ? game.useEveryPair() : game.useGrid();
  for (let i = 0; i < WARM_UP; i++) game.step(state, input, blueprint);
  game.resetPairs();
  const start = process.hrtime.bigint();
  for (let i = 0; i < FRAMES; i++) game.step(state, input, blueprint);
  const ms = Number(process.hrtime.bigint() - start) / 1e6 / FRAMES;
  const dummies = state.actors.filter((actor) => actor.wander);
  const cells = dummies.reduce((sum, d) => sum + (d.cells.to.x - d.cells.from.x + 1) * (d.cells.to.y - d.cells.from.y + 1), 0) / dummies.length;
  return { ms, pairs: game.pairs() / FRAMES, cells };
}

// Plays the run with the grid and with every pair, frame by frame, and returns the first frame that differs.
function firstDifference(cellSize) {
  const a = makeGame();
  const b = makeGame();
  const blueprint = a.createRun(1).blueprint;
  const stateA = newState(a, cellSize);
  const stateB = newState(b, cellSize);
  for (let frame = 1; frame <= WARM_UP + FRAMES; frame++) {
    a.useGrid();
    a.step(stateA, input, blueprint);
    b.useEveryPair();
    b.step(stateB, input, blueprint);
    b.writeCells(stateB); // testing every pair pushes without writing the cells again
    if (JSON.stringify(stateA) !== JSON.stringify(stateB)) return frame;
  }
  return null;
}

const dummies = newState(makeGame(), CELL_SIZES[0]).actors.length - 1;
console.log(`${name}: ${dummies} Dummies` + (name === "giants" ? ` (${GIANTS.length} of them huge: radii ${GIANTS.join(", ")})` : "") + `, ${FRAMES} frames after ${WARM_UP} of warm-up, window ${WINDOW.width} x ${WINDOW.height} px`);
console.log("cell size  | ms per step | pairs per step | cells per Dummy | against every pair");
const every = measure(true, 60);
console.log(`every pair |  ${every.ms.toFixed(2).padStart(9)}  | ${String(Math.round(every.pairs)).padStart(13)}  |                 | (the reference)`);
for (const cellSize of CELL_SIZES) {
  const result = measure(false, cellSize);
  const difference = firstDifference(cellSize);
  console.log(
    `${String(cellSize).padStart(10)} |  ${result.ms.toFixed(2).padStart(9)}  | ${String(Math.round(result.pairs)).padStart(13)}  | ${result.cells.toFixed(1).padStart(14)}  | ` +
      (difference === null ? "identical" : "DIFFERS at frame " + difference)
  );
}
