// Benchmarks of the collision grid (written by the agent; see tests/agent/README.md). They are not tests: the numbers
// depend on the machine. Run from the root of the repository:
//
//   node tests/agent/benchmark-grid.js still [frames]   cell sizes on a run with the avatar still
//   node tests/agent/benchmark-grid.js dash [frames]    cell size 64 against 88 on a run with the avatar dashing
//   node tests/agent/benchmark-grid.js pair             the worst case of the rule, built on purpose (two Dummies, one step)
//
// In both, a run played with the grid is compared frame by frame with the same run played by testing every pair
// (the whole state, as JSON). "identical" means the grid found every collision; a difference means one was lost.
//
// "still": the same run (seed 1, the real number of Dummies) with several cell sizes. The window keeps the same size in
//   pixels (3900 x 2100, an odd number of cells each way for all the sizes), so only the cells change.
//
// "dash": the rule of the cell size says 2 x (largest radius + largest speed) = 88 for the objects and the dash of the
//   avatar, but the Dummy-Dummy collision only needs two radii (64). To find out, the Dummies get radii up to 32 and the
//   avatar dashes all the time (the Booster recharges in 1 frame), crossing the crowd and changing direction. Two ways to
//   find the cells are compared, each with a cell of 64 and of 88:
//   - fresh: the cells are computed after the movement of the frame (what the game does);
//   - stale: the cells are the ones stored at the end of the last frame (actor.cell), which is the case the rule's
//     speed term is about. (In the first frame the cells are not stored yet, so it uses fresh ones.)

const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "src");
const read = (name) => fs.readFileSync(path.join(SRC, name), "utf8");

// The game, with extra handles: a counter of tested pairs, the old way of testing every pair, and the stale cells.
const makeGame = (patchData = (text) => text) => new Function(patchData(read("data.js")) + "\n" + read("sim.js") + `
  let pairs = 0;
  const realTouch = touchDummy;
  touchDummy = function (state, lastContacts, dummy, other, key, blueprint) {
    if (other.wander) pairs++;
    return realTouch(state, lastContacts, dummy, other, key, blueprint);
  };
  const fresh = collideDummies;

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

  // The same as the grid of the game, but with the cells of the end of the last frame (dummy.cell).
  function stale(state, lastContacts, blueprint) {
    if (state.frame === 0) return fresh(state, lastContacts, blueprint);
    const player = state.actors.find((actor) => actor.id === AVATAR_ID);
    const dummies = state.actors.filter((actor) => actor.wander);
    const cellOf = dummies.map((dummy) => ({ x: dummy.cell.x, y: dummy.cell.y }));
    const inCell = new Map();
    cellOf.forEach((cell, number) => {
      const key = cell.x + "," + cell.y;
      if (!inCell.has(key)) inCell.set(key, []);
      inCell.get(key).push(number);
    });
    for (let i = 0; i < dummies.length; i++) {
      const dummy = dummies[i];
      for (const object of objectsNear(state, dummy)) {
        touchDummy(state, lastContacts, dummy, object, dummy.id + "|" + object.type + " " + objectKey(object), blueprint);
      }
      if (Math.abs(cellOf[i].x) <= 1 && Math.abs(cellOf[i].y) <= 1) {
        touchDummy(state, lastContacts, dummy, player, dummy.id + "|" + AVATAR_ID, blueprint);
      }
      const later = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighbors = inCell.get(cellOf[i].x + dx + "," + (cellOf[i].y + dy));
          if (neighbors) for (const j of neighbors) if (j > i) later.push(j);
        }
      }
      later.sort((a, b) => a - b);
      for (const j of later) touchDummy(state, lastContacts, dummy, dummies[j], dummy.id + "|" + dummies[j].id, blueprint);
    }
  }

  return {
    createChamber1State, createRun, step,
    // Puts a Dummy where the test says (cells stored as at the end of a previous frame).
    place(state, number, x, y, angle, radius, speed) {
      const d = state.actors.find((actor) => actor.id === "dummy_" + number);
      d.position.x = x; d.position.y = y; d.radius = radius; d.speed = speed;
      d.wander.angle = angle; setHeading(d);
      const player = state.actors[0].position;
      d.cell.x = cellIndex(d.position.x - player.x, state.grid.cellSize);
      d.cell.y = cellIndex(d.position.y - player.y, state.grid.cellSize);
      state.frame = 1;
    },
    // Leaves only the avatar and the Dummies with these numbers in the state.
    keepOnly(state, numbers) {
      state.actors = [state.actors[0], ...numbers.map((n) => state.actors.find((actor) => actor.id === "dummy_" + n))];
    },
    use(mode) { collideDummies = { fresh, stale, everyPair }[mode]; },
    pairs: () => pairs,
    resetPairs() { pairs = 0; },
  };
`)();

const FRAMES = Number(process.argv[3] ?? 300);
const WARM_UP = 30;

// A scenario says how the game is patched, which grids are tried, and what the avatar does.
const SCENARIOS = {
  still: {
    patch: (text) => text,
    grids: [12, 20, 60, 100, 300].map((cellSize) => ({ label: String(cellSize), mode: "fresh", cellSize, windowWidth: 3900 / cellSize, windowHeight: 2100 / cellSize })),
    input: () => ({ move: { x: 0, y: 0 } }),
  },
  dash: {
    // Dummies up to radius 32, a dash that is ready again after 1 frame.
    patch: (text) => text.replace("size: { min: 8, max: 16 },\n      weightPerRadius: 100,\n      healthRange: { min: 100, max: 100 },", "size: { min: 16, max: 32 },\n      weightPerRadius: 100,\n      healthRange: { min: 100, max: 100 },").replace("rechargeFrames: 240", "rechargeFrames: 1"),
    // Two groups. Without wrap (a window so large that no Dummy reaches its edge in the run): only the speed is tested.
    // With wrap (the real window): a Dummy that wraps jumps across the window, so the cell stored before the jump is wrong.
    grids: [
      { label: "64 fresh", mode: "fresh", cellSize: 64, windowWidth: 301, windowHeight: 201 },
      { label: "64 stale", mode: "stale", cellSize: 64, windowWidth: 301, windowHeight: 201 },
      { label: "88 fresh", mode: "fresh", cellSize: 88, windowWidth: 219, windowHeight: 147 },
      { label: "88 stale", mode: "stale", cellSize: 88, windowWidth: 219, windowHeight: 147 },
      { label: "64 fresh, wrap", mode: "fresh", cellSize: 64, windowWidth: 61, windowHeight: 35 },
      { label: "64 stale, wrap", mode: "stale", cellSize: 64, windowWidth: 61, windowHeight: 35 },
      { label: "88 stale, wrap", mode: "stale", cellSize: 88, windowWidth: 45, windowHeight: 25 },
    ],
    // Dash all the time, in a direction that turns every 40 frames (a different one each time, never straight).
    input: (frame) => {
      const angle = (Math.floor(frame / 40) * 137) % 360;
      return { move: { x: Math.cos((angle * Math.PI) / 180), y: Math.sin((angle * Math.PI) / 180) }, dash: true };
    },
  },
};

// The worst case of the rule, built on purpose: two Dummies of radius 32 that are NOT touching before the step and ARE
// touching after it, placed so that the cells stored before the step are two apart (not neighbors).
// A: speed 2 each (what the Dummies do): they start 66 px apart and end 62 px apart (the radii add up to 64).
// B: speed 12 each (two dashes): they start 87 px apart and end 63 px apart.
if (process.argv[2] === "pair") {
  const cases = [
    { label: "A: two Dummies at speed 2", speed: 2, gap: 66 },
    { label: "B: two Dummies at speed 12", speed: 12, gap: 87 },
  ];
  const grids = [
    { label: "64 fresh", mode: "fresh", cellSize: 64 },
    { label: "64 stale", mode: "stale", cellSize: 64 },
    { label: "88 fresh", mode: "fresh", cellSize: 88 },
    { label: "88 stale", mode: "stale", cellSize: 88 },
  ];
  console.log("Two Dummies of radius 32 walk toward each other; they touch after the step but not before it.");
  console.log("The gap before the step is placed so that, with a cell of 64, the stored cells are two apart (the worst alignment).");
  console.log("grid     | " + cases.map((c) => c.label.padEnd(30)).join(" | "));
  for (const grid of grids) {
    const row = cases.map((c) => {
      const game = makeGame((text) => text.replace("chancePercent: 35", "chancePercent: 0"));
      const blueprint = game.createRun(1).blueprint;
      const state = game.createChamber1State(1, 1);
      state.grid = { cellSize: grid.cellSize, windowWidth: 301, windowHeight: 201 };
      // a is placed so that its cell (of size 64) ends 62 px before the next cell boundary, whatever the cell size.
      const ax = 670;
      game.place(state, 0, ax, 0, 0, 32, c.speed);
      game.place(state, 1, ax + c.gap, 0, 180, 32, c.speed);
      game.keepOnly(state, [0, 1]);
      game.use(grid.mode);
      game.step(state, { move: { x: 0, y: 0 } }, blueprint);
      const found = state.contacts.includes("dummy_0|dummy_1");
      return (found ? "found" : "MISSED").padEnd(30);
    });
    console.log(grid.label.padEnd(8) + " | " + row.join(" | "));
  }
  process.exit(0);
}

const name = process.argv[2];
const scenario = SCENARIOS[name];
if (!scenario) {
  console.log("Usage: node tests/agent/benchmark-grid.js still|dash [frames]   or   pair");
  process.exit(1);
}

function newState(game, grid) {
  const state = game.createChamber1State(1, 1);
  if (grid) state.grid = { cellSize: grid.cellSize, windowWidth: grid.windowWidth, windowHeight: grid.windowHeight };
  return state;
}

// Plays the run; returns the ms per step and the Dummy pairs tested per step (after the warm-up), and what happened.
function measure(mode, grid) {
  const game = makeGame(scenario.patch);
  const blueprint = game.createRun(1).blueprint;
  const state = newState(game, grid);
  game.use(mode);
  let avatarContacts = 0;
  let fastest = 0;
  for (let frame = 0; frame < WARM_UP + FRAMES; frame++) {
    if (frame === WARM_UP) game.resetPairs();
    const started = process.hrtime.bigint();
    game.step(state, scenario.input(frame), blueprint);
    if (frame === WARM_UP) var begin = started;
    if (state.contacts.some((contact) => contact.endsWith("|avatar_1") && contact.startsWith("dummy"))) avatarContacts++;
    fastest = Math.max(fastest, Math.hypot(state.actors[0].move.velocity.x, state.actors[0].move.velocity.y));
  }
  const ms = Number(process.hrtime.bigint() - begin) / 1e6 / FRAMES;
  const turns = state.actors.reduce((sum, actor) => sum + (actor.wander ? actor.wander.turns : 0), 0);
  return { ms, pairs: game.pairs() / FRAMES, avatarContacts, fastest, turns, health: state.actors[0].health.now };
}

// Plays the run with a way of finding the cells and with every pair, frame by frame; returns the first frame that differs.
function firstDifference(mode, grid) {
  const a = makeGame(scenario.patch);
  const b = makeGame(scenario.patch);
  const blueprint = a.createRun(1).blueprint;
  const stateA = newState(a, grid);
  const stateB = newState(b, grid);
  for (let frame = 0; frame < WARM_UP + FRAMES; frame++) {
    const input = scenario.input(frame);
    a.use(mode);
    a.step(stateA, input, blueprint);
    b.use("everyPair");
    b.step(stateB, input, blueprint);
    if (JSON.stringify(stateA) !== JSON.stringify(stateB)) {
      if (process.env.DETAIL) {
        const player = stateB.actors[0].position;
        const width = stateB.grid.windowWidth * stateB.grid.cellSize;
        const height = stateB.grid.windowHeight * stateB.grid.cellSize;
        stateA.actors.forEach((actor, i) => {
          if (JSON.stringify(actor) === JSON.stringify(stateB.actors[i])) return;
          const dx = actor.position.x - player.x;
          const dy = actor.position.y - player.y;
          console.log("  frame " + (frame + 1) + ": " + actor.id + " differs; relative position " + dx.toFixed(1) + "," + dy.toFixed(1) + " (window half-size " + width / 2 + "," + height / 2 + "); the reference has " + (stateB.actors[i].position.x - player.x).toFixed(1) + "," + (stateB.actors[i].position.y - player.y).toFixed(1));
        });
      }
      return frame + 1;
    }
  }
  return null;
}

const dummies = newState(makeGame(scenario.patch), scenario.grids[0]).actors.length - 1;
console.log(`${name}: ${dummies} Dummies, ${FRAMES} frames after ${WARM_UP} of warm-up`);
const every = measure("everyPair", scenario.grids[0]);
console.log(`what happened (every pair): the avatar touched a Dummy in ${every.avatarContacts} frames, the Dummies turned ${every.turns} times, the avatar reached ${every.fastest.toFixed(1)} px/frame, health ${every.health.toFixed(1)}`);
console.log("grid           | ms per step | pairs per step | against every pair");
console.log(`every pair     |  ${every.ms.toFixed(2).padStart(9)}  | ${String(Math.round(every.pairs)).padStart(13)}  | (the reference)`);
for (const grid of scenario.grids) {
  const result = measure(grid.mode, grid);
  const difference = firstDifference(grid.mode, grid);
  console.log(
    `${grid.label.padEnd(14)} |  ${result.ms.toFixed(2).padStart(9)}  | ${String(Math.round(result.pairs)).padStart(13)}  | ` +
      (difference === null ? "identical" : "differs at frame " + difference)
  );
}
