// Benchmark of the collision grid between Dummies (written by the agent; see tests/agent/README.md).
// Run from the root of the repository:  node tests/agent/benchmark-grid.js [frames]
//
// The same run (seed 1, the real number of Dummies, an avatar that does not move) is played with several cell sizes,
// and every frame is compared with the same run played by testing every pair of Dummies. Per cell size it prints:
// - ms per step (the mean of the frames after a short warm-up),
// - pairs: how many Dummy-Dummy pairs are tested per step (every pair would be N x (N - 1) / 2),
// - the first frame in which the result differs from testing every pair ("identical" if none): a difference means
//   a collision was missed, which is what a cell size below the rule does.
// The window is kept the same size in pixels for every cell size (3900 x 2100, an odd number of cells each way for
// all the sizes below), so only the cells change. The numbers depend on the machine; they are not a test.

const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "src");
const source = ["data.js", "sim.js"].map((name) => fs.readFileSync(path.join(SRC, name), "utf8")).join("\n");

// The game, with two extra handles: a counter of tested pairs, and the old way of testing every pair.
const makeGame = () => new Function(source + `
  let pairs = 0;
  const realTouch = touchDummy;
  touchDummy = function (state, lastContacts, dummy, other, key, blueprint) {
    if (other.wander) pairs++;
    return realTouch(state, lastContacts, dummy, other, key, blueprint);
  };
  const withGrid = collideDummies;
  function everyPair(state, lastContacts, blueprint) {
    const player = state.actors.find((actor) => actor.id === AVATAR_ID);
    const dummies = state.actors.filter((actor) => actor.wander);
    for (let i = 0; i < dummies.length; i++) {
      const dummy = dummies[i];
      for (const object of objectsNear(state, dummy)) {
        touchDummy(state, lastContacts, dummy, object, dummy.id + "|" + object.type + " " + objectKey(object), blueprint);
      }
      touchDummy(state, lastContacts, dummy, player, dummy.id + "|" + AVATAR_ID, blueprint);
      for (let j = i + 1; j < dummies.length; j++) {
        touchDummy(state, lastContacts, dummy, dummies[j], dummy.id + "|" + dummies[j].id, blueprint);
      }
    }
  }
  return {
    createChamber1State, createRun, step,
    useGrid() { collideDummies = withGrid; },
    useEveryPair() { collideDummies = everyPair; },
    pairs: () => pairs,
    resetPairs() { pairs = 0; },
  };
`)();

const FRAMES = Number(process.argv[2] ?? 300);
const WARM_UP = 30;
const WINDOW = { width: 3900, height: 2100 };
const CELL_SIZES = [12, 20, 60, 100, 300];
const input = { move: { x: 0, y: 0 } };

function newState(game, cellSize) {
  const state = game.createChamber1State(1, 1);
  if (cellSize !== undefined) state.grid = { cellSize, windowWidth: WINDOW.width / cellSize, windowHeight: WINDOW.height / cellSize };
  return state;
}

// Plays the run and returns the ms per step and the pairs per step (after the warm-up).
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
  return { ms, pairs: game.pairs() / FRAMES };
}

// Plays the run with the grid and with every pair, frame by frame, and returns the first frame that differs.
function firstDifference(cellSize) {
  const grid = makeGame();
  const reference = makeGame();
  const blueprint = grid.createRun(1).blueprint;
  const a = newState(grid, cellSize);
  const b = newState(reference, cellSize);
  for (let frame = 1; frame <= WARM_UP + FRAMES; frame++) {
    grid.useGrid();
    grid.step(a, input, blueprint);
    reference.useEveryPair();
    reference.step(b, input, blueprint);
    if (JSON.stringify(a) !== JSON.stringify(b)) return frame;
  }
  return null;
}

const dummies = newState(makeGame()).actors.length - 1;
console.log(`${dummies} Dummies, ${FRAMES} frames after ${WARM_UP} of warm-up, window ${WINDOW.width} x ${WINDOW.height} px`);
console.log("cell size | ms per step | pairs per step | against every pair");

const every = measure(true);
console.log(`every pair |  ${every.ms.toFixed(2).padStart(9)}  | ${String(Math.round(every.pairs)).padStart(13)}  | (the reference)`);
for (const cellSize of CELL_SIZES) {
  const result = measure(false, cellSize);
  const difference = firstDifference(cellSize);
  console.log(
    `${String(cellSize).padStart(9)} |  ${result.ms.toFixed(2).padStart(9)}  | ${String(Math.round(result.pairs)).padStart(13)}  | ` +
      (difference === null ? "identical" : "differs at frame " + difference)
  );
}
