// Tests written by the agent (not by the user). See tests/agent/README.md.
// Run from the root of the repository:  node --test tests/agent/
//
// The browser scripts (src/data.js, src/sim.js, src/history.js) are plain
// scripts that share globals. Here each one is loaded into a vm context, the
// way a browser loads them, so no change to the source is needed for testing.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = path.join(__dirname, "..", "..", "src");
const FILES = ["data.js", "sim.js", "history.js"];

function readSource(name) {
  return fs.readFileSync(path.join(SRC, name), "utf8");
}

// A fresh context with the game scripts loaded. "patchData" can change the text of src/data.js before it loads (a game
// with other numbers). A patch that changes nothing fails loudly: the text it looked for is no longer in the data, and
// the test would silently play the real game instead of the one it meant (it happened once, and every test played with
// the full count of Dummies).
// The games of the tests play without a shield unless they ask for it (shield: true): the tests written before the shield count
// every point of damage the avatar takes and use its radius of 16, and the shield would absorb the first hits and widen the
// avatar. The Generator keeps its weight, so nothing else changes. The tests of the shield (and test 129, which reads the real
// file) use the real Generator.
const GENERATOR_WITH_SHIELD = /generator: \{ name: "Generator", weight: 200, specs: \{[^\n]*\} \},/;
function loadGame(patchData = null, { shield = false, patchSim = null } = {}) {
  const context = vm.createContext({});
  for (const name of FILES) {
    let text = readSource(name);
    if (name === "data.js" && !shield) {
      const without = text.replace(GENERATOR_WITH_SHIELD, 'generator: { name: "Generator", weight: 200, specs: {} },');
      if (without === text) throw new Error("The Generator with a shield is no longer in src/data.js: the tests cannot play without it");
      text = without;
    }
    if (name === "data.js" && patchData !== null) {
      const patched = patchData(text);
      if (patched === text) throw new Error("A patch of src/data.js changed nothing: the text it looks for is no longer there");
      text = patched;
    }
    if (name === "sim.js" && patchSim !== null) {
      const patched = patchSim(text);
      if (patched === text) throw new Error("A patch of src/sim.js changed nothing: the text it looks for is no longer there");
      text = patched;
    }
    vm.runInContext(text, context);
  }
  // The rules need the blueprint of the run as the third argument of step. Most tests do not care
  // which one, so here step plays with the starter blueprint unless a test passes another.
  vm.runInContext("const realStep = step; step = (state, input, blueprint = createRun(1).blueprint, ...rest) => realStep(state, input, blueprint, ...rest);", context);
  return context;
}

// How many Dummies a game has (the data says how many for the stress test). If the count is no longer written that way,
// loadGame fails loudly (the patch would change nothing).
function withDummies(count) {
  return loadGame((text) => text.replace(/dummies: \{ count: \d+ \}/, "dummies: { count: " + count + " }"));
}

// The game most tests play in has no Dummies (the rock and avatar tests count every hit on a rock, and a wandering
// Dummy would add its own). The tests of the Dummies, and the ones that need them, use WITH_DUMMIES, with 100 Dummies
// and not the real count (the stress test), to stay fast. Ranges, speed and the rest are the real ones.
const context = withDummies(0);
const WITH_DUMMIES = withDummies(100);

// Runs code inside the game context, in its own function so names do not clash.
// Objects made inside the context have another prototype than ours, so a result
// that is compared with deepStrictEqual goes through plain(...) first.
function run(code, where = context) {
  return vm.runInContext(`(() => { ${code} })()`, where);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// What is left of an amount of damage after a resistance of "points" to its type (constants.damage.resistanceScale is 100):
// the share taken off is points / (points + 100). The avatar of the starter blueprint has 30 points of blunt resistance
// and 10 of puncture (Torso 20 + Legs 10, and Torso 10).
const resisted = (amount, points) => amount * (1 - points / (points + 100));

// ---- State ----

test("01 the initial state is plain JSON (writing it and reading it back changes nothing)", () => {
  const text = JSON.stringify(run("return createChamber1State();"));
  assert.strictEqual(JSON.stringify(JSON.parse(text)), text);
  assert.strictEqual(text.includes("null"), false);
});

test("02 the state does not keep a reference to the input", () => {
  const state = run(`
    const s = createChamber1State();
    const input = { move: { x: 1, y: 0 } };
    step(s, input);
    input.move.x = 99;
    return s;
  `);
  assert.strictEqual(state.actors[0].move.direction.x, 1);
});

test("03 the same inputs give exactly the same state (determinism)", () => {
  const [first, second] = run(`
    const inputs = [];
    for (let i = 0; i < 600; i++) {
      const angle = i * 0.37;
      inputs.push({ move: { x: Math.cos(angle), y: Math.sin(angle) } });
    }
    function play() {
      const s = createChamber1State();
      for (const input of inputs) step(s, input);
      return JSON.stringify(s);
    }
    return [play(), play()];
  `);
  assert.strictEqual(first, second);
});

test("04 there is no manual aim: the state has no aim, and an aim in the input is ignored", () => {
  const result = run(`
    const s = createChamber1State();
    const withAim = createChamber1State();
    step(s, { move: { x: 1, y: 0 } });
    step(withAim, { move: { x: 1, y: 0 }, aim: { x: 0, y: 1 } });
    return { has: "aim" in s.actors[0], same: JSON.stringify(s) === JSON.stringify(withAim) };
  `);
  assert.strictEqual(result.has, false);
  assert.strictEqual(result.same, true);
});

// ---- Movement ----

test("05 moving right: 12 frames of acceleration, then the top speed (60 frames = 163.5 px)", () => {
  // 12 frames speeding up by 0.25 each: 0.25 + 0.5 + ... + 3 = 19.5 px.
  // Then 48 frames at the top speed 3 = 144 px. Total 163.5 px.
  const state = run(`
    const s = createChamber1State();
    for (let i = 0; i < 60; i++) step(s, { move: { x: 1, y: 0 } });
    return s;
  `);
  assert.strictEqual(state.frame, 60);
  assert.strictEqual(state.actors[0].position.x, 163.5);
  assert.strictEqual(state.actors[0].position.y, 0);
  assert.strictEqual(state.actors[0].move.velocity.x, 3);
});

test("06 a normalized diagonal reaches the same top speed as a straight line", () => {
  const state = run(`
    const s = createChamber1State();
    const c = Math.SQRT1_2;
    for (let i = 0; i < 60; i++) step(s, { move: { x: c, y: c } });
    return s;
  `);
  const { x, y } = state.actors[0].position;
  assert.ok(Math.abs(Math.sqrt(x * x + y * y) - 163.5) < 1e-9);
});

test("07 speeding up takes 12 frames, stopping takes 24, and the speed never goes above the top", () => {
  const { up, down } = run(`
    const s = createChamber1State();
    const v = s.actors[0].move.velocity;
    const up = [];
    for (let i = 0; i < 14; i++) { step(s, { move: { x: 1, y: 0 } }); up.push(v.x); }
    const down = [];
    for (let i = 0; i < 26; i++) { step(s, { move: { x: 0, y: 0 } }); down.push(v.x); }
    return { up, down };
  `);
  assert.strictEqual(up[11], 3); // reached at frame 12
  assert.ok(up[10] < 3); // and not before
  assert.ok(up.every((value) => value <= 3));
  assert.strictEqual(down[23], 0); // stopped at frame 24
  assert.ok(down[22] > 0); // and not before
});

test("08 turning around: the velocity goes through zero in a straight line, without a jump", () => {
  const { frames, x } = run(`
    const s = createChamber1State();
    const v = s.actors[0].move.velocity;
    for (let i = 0; i < 20; i++) step(s, { move: { x: 1, y: 0 } });
    let frames = 0;
    while (v.x > 0 && frames < 100) { step(s, { move: { x: -1, y: 0 } }); frames++; }
    return { frames, x: v.x };
  `);
  assert.strictEqual(frames, 12); // 3 / 0.25 = 12 frames to reach zero
  assert.strictEqual(x, 0);
});

test("09 the top speed is asked every frame (finalSpeed can change from one frame to the next)", () => {
  const { top, last } = run(`
    const original = finalSpeed;
    const s = createChamber1State();
    const input = { move: { x: 1, y: 0 } };
    step(s, input); // top speed 3 (baseSpeed)
    finalSpeed = () => 10;
    let top = 0;
    for (let i = 0; i < 60; i++) { step(s, input); top = Math.max(top, s.actors[0].move.velocity.x); }
    finalSpeed = original;
    return { top, last: s.actors[0].move.velocity.x };
  `);
  assert.strictEqual(top, 10);
  assert.strictEqual(last, 10);
});

// ---- Collision grid ----

test("10 the state has the grid settings, and the player at the origin covers only the cell (0, 0)", () => {
  const state = run(`
    const s = createChamber1State();
    step(s, { move: { x: 0, y: 0 } });
    return s;
  `);
  assert.strictEqual(state.grid.cellSize, 64);
  assert.strictEqual(state.grid.windowWidth, 61);
  assert.strictEqual(state.grid.windowHeight, 35);
  assert.deepStrictEqual(plain(state.actors[0].cells), { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }); // radius 16 inside a cell of 64
});

test("11 cell boundaries: cell 0 covers [-32, +32) around the origin of the world (a point, radius 0, covers one cell)", () => {
  const cells = run(`
    const grid = createChamber1State().grid;
    return [31.9, 32, -32, -32.1, 100, 0].map((dx) => {
      const marker = { radius: 0, position: { x: dx, y: -70 }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } };
      setCells(marker, grid);
      if (JSON.stringify(marker.cells.from) !== JSON.stringify(marker.cells.to)) throw new Error("a point must cover one cell");
      return [marker.cells.from.x, marker.cells.from.y];
    });
  `);
  assert.deepStrictEqual(plain(cells), [
    [0, -1], // 31.9: still the center column
    [1, -1], // 32: next column
    [0, -1], // -32: still the center column
    [-1, -1], // -32.1: previous column
    [2, -1], // 100
    [0, -1], // 0
  ]);
});

test("12 cells are counted in the world, not around the player: when the player walks, a still actor keeps its cells and the player changes its own", () => {
  const cells = run(`
    const s = createChamber1State();
    const marker = { radius: 0, position: { x: 100, y: 0 }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } }; // a still thing, only a test fixture
    step(s, { move: { x: 0, y: 0 } });
    setCells(marker, s.grid);
    const before = [marker.cells.from.x, s.actors[0].cells.from.x];
    const original = finalSpeed;
    finalSpeed = () => 64;
    s.actors[0].move.velocity.x = 64; // already moving at 64 px per frame
    step(s, { move: { x: 1, y: 0 } });
    finalSpeed = original;
    setCells(marker, s.grid);
    return [before, [marker.cells.from.x, s.actors[0].cells.from.x]];
  `);
  assert.deepStrictEqual(plain(cells), [[2, 0], [2, 1]]);
});

test("13 two actors that touch share a cell wherever they are in the world, and two that are a cell apart never do (the same pair moved by 10000 px)", () => {
  const result = run(`
    const grid = createChamber1State().grid;
    const pair = (x, y, apart) => {
      const a = { radius: 16, position: { x, y }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } };
      const b = { radius: 16, position: { x: x + apart, y }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } };
      setCells(a, grid); setCells(b, grid);
      return shareCell(a.cells, b.cells);
    };
    return [pair(0, 0, 31), pair(10000, -10000, 31), pair(-7777, 3333, 31), pair(0, 0, 200), pair(10000, -10000, 200)];
  `);
  assert.deepStrictEqual(plain(result), [true, true, true, false, false]);
});

test("14 the default window is at least twice the 1920 x 1080 screen", () => {
  const [coversWidth, coversHeight, halfWidth, halfHeight] = run(`
    const g = createChamber1State().grid;
    const halfWidth = (g.windowWidth - 1) / 2 * g.cellSize + g.cellSize / 2; // pixels from the player to the edge
    const halfHeight = (g.windowHeight - 1) / 2 * g.cellSize + g.cellSize / 2;
    return [halfWidth >= 1920, halfHeight >= 1080, halfWidth, halfHeight];
  `);
  assert.strictEqual(coversWidth, true);
  assert.strictEqual(coversHeight, true);
  assert.strictEqual(halfWidth, 1952);
  assert.strictEqual(halfHeight, 1120);
});

test("15 bad grid settings fail loudly (each axis is checked on its own)", () => {
  const rejected = run(`
    const screen = { screenWidth: 1920, screenHeight: 1080 };
    const bad = [
      { ...screen, cellSize: 64, windowWidth: 4, windowHeight: 3 },
      { ...screen, cellSize: 64, windowWidth: 3, windowHeight: 4 },
      { ...screen, cellSize: 64, windowWidth: 2, windowHeight: 3 },
      { ...screen, cellSize: 64, windowWidth: 3, windowHeight: 3.5 },
      { ...screen, cellSize: 0, windowWidth: 3, windowHeight: 3 },
      { ...screen, cellSize: -1, windowWidth: 3, windowHeight: 3 },
      { ...screen, cellSize: NaN, windowWidth: 3, windowHeight: 3 },
      { ...screen, cellSize: 64, windowWidth: 3 },
      { ...screen, cellSize: 64, windowSize: 3 },
      { screenWidth: 1920, cellSize: 64, windowWidth: 3, windowHeight: 3 },
      { screenWidth: 1920, screenHeight: 0, cellSize: 64, windowWidth: 3, windowHeight: 3 },
      { screenWidth: 1920.5, screenHeight: 1080, cellSize: 64, windowWidth: 3, windowHeight: 3 },
    ];
    return bad.map((grid) => {
      try { assertValidGrid(grid); return false; } catch (error) { return true; }
    });
  `);
  assert.ok(plain(rejected).every((value) => value === true));
  assert.doesNotThrow(() => run("assertValidGrid({ screenWidth: 1920, screenHeight: 1080, cellSize: 64, windowWidth: 61, windowHeight: 35 });"));
});

// ---- Definitions and actors ----

test("16 the definitions are frozen, the state only points to them, and it carries their version", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    const before = DEFINITIONS.actors.avatar.radius;
    DEFINITIONS.actors.avatar.radius = 99; // ignored: frozen
    DEFINITIONS.actors.other = { radius: 1 }; // ignored: frozen
    return {
      version: s.definitionsVersion,
      expectedVersion: DEFINITIONS_VERSION,
      frozen: Object.isFrozen(DEFINITIONS) && Object.isFrozen(DEFINITIONS.actors.avatar),
      unchanged: DEFINITIONS.actors.avatar.radius === before && !("other" in DEFINITIONS.actors),
      type: player.type,
      radius: player.radius,
      acceleration: player.acceleration,
      deceleration: player.deceleration,
      rechargeFrames: player.dash.rechargeFrames,
      weight: player.weight,
      bounce: player.bounce,
      hasBaseSpeed: "baseSpeed" in player,
      health: player.health,
      speed: finalSpeed(player, createRun(1).blueprint),
    };
  `);
  assert.strictEqual(result.version, result.expectedVersion);
  assert.strictEqual(result.frozen, true);
  assert.strictEqual(result.unchanged, true);
  assert.strictEqual(result.type, "avatar");
  // The avatar carries its own copy of each value, made by the final functions: it does not read the definitions while it plays.
  assert.deepStrictEqual([result.radius, result.acceleration, result.deceleration, result.rechargeFrames, result.weight, result.bounce], [16, 0.25, 0.125, 240, 5000, 0]);
  assert.strictEqual(result.hasBaseSpeed, false);
  assert.deepStrictEqual(plain(result.health), { now: 100, max: 100 });
  assert.strictEqual(result.speed, 3);
});

test("17 unknown types fail loudly, and a type without 'move' is static", () => {
  const result = run(`
    let createRejected = false;
    try { finalizeObject("nope", {}); } catch (error) { createRejected = true; }
    let definitionRejected = false;
    try { definitionOf({ type: "nope" }); } catch (error) { definitionRejected = true; }
    return { createRejected, definitionRejected };
  `);
  assert.strictEqual(result.createRejected, true);
  assert.strictEqual(result.definitionRejected, true);

  // The definitions are frozen, so build a second context from a patched copy
  // of data.js that adds a "trap" type without "move".
  const withTrap = loadGame((text) => {
    const patched = text.replace(
      "  actors: {\n    avatar: {",
      '  actors: {\n    trap: { tags: ["object"], bodyIgnores: [], name: "Trap", health: { now: 1, max: 1 }, radius: 10, initial: { health: { now: 1, max: 1 }, position: { x: 0, y: 0 }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } } },\n    avatar: {'
    );
    assert.notStrictEqual(patched, text, "the patch of data.js should apply");
    return patched;
  });
  const trap = run('return finalizeObject("trap", {}, undefined, "trap_1");', withTrap);
  assert.strictEqual("move" in trap, false);
  assert.strictEqual(trap.health.now, 1);

  const walker = run('return createAvatar(createRun(1).blueprint);', withTrap);
  assert.strictEqual("move" in walker, true);

  const trapPosition = run(
    `
    const s = createChamber1State();
    s.actors.push(finalizeObject("trap", {}, undefined, "trap_1"));
    step(s, { move: { x: 1, y: 0 } });
    return JSON.stringify(s.actors.find((actor) => actor.id === "trap_1").position);
  `,
    withTrap
  );
  assert.strictEqual(trapPosition, JSON.stringify({ x: 0, y: 0 }));
});

test("18 a new avatar is a copy of the initial state in the definitions plus its final values, and owns its numbers", () => {
  const result = run(`
    const blueprint = createRun(1).blueprint;
    const a = createAvatar(blueprint);
    const b = createAvatar(blueprint);
    a.position.x = 50;
    a.move.direction.x = 1;
    a.move.velocity.x = 2;
    a.dash.charges.now = 0;
    a.health.now = 1;
    const initial = DEFINITIONS.actors.avatar.initial;
    const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    return {
      copiesInitial: same(b.position, initial.position) && same(b.cells, initial.cells) && same(b.move, initial.move) && b.dash.recharge === initial.dash.recharge,
      definitionsUntouched: initial.position.x === 0 && initial.move.direction.x === 0 && initial.move.velocity.x === 0 && !("charges" in initial.dash),
      otherUntouched: b.position.x === 0 && b.move.direction.x === 0 && b.move.velocity.x === 0 && b.dash.charges.now === 1 && b.health.now === 100,
      idFirst: Object.keys(a).slice(0, 2).join(","),
    };
  `);
  assert.strictEqual(result.copiesInitial, true);
  assert.strictEqual(result.definitionsUntouched, true);
  assert.strictEqual(result.otherUntouched, true);
  assert.strictEqual(result.idFirst, "id,type");
});

test("19 the run and the state: the state carries the run id, and the blueprint is the starter blueprint and outside the state", () => {
  const result = run(`
    const r = createRun(7);
    const s = createChamber1State(r.id);
    return { run: r, stateRun: s.run, defaultRun: createChamber1State().run, hasBlueprint: "blueprint" in s, starterParts: DEFINITIONS.starterBlueprint.parts };
  `);
  assert.deepStrictEqual(plain(result.run), { id: 7, blueprint: { parts: plain(result.starterParts) } });
  assert.strictEqual(result.stateRun, 7);
  assert.strictEqual(result.defaultRun, 1);
  assert.strictEqual(result.hasBlueprint, false);
});

// ---- Run history ----

test("20 history: two aligned lists, index 0 is the oldest, and the snaps are copies", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).blueprint);
    const first = { snaps: h.snaps.length, inputs: h.inputs.length, firstInput: h.inputs[0] };
    for (let i = 0; i < 5; i++) {
      const input = { move: { x: 1, y: 0 } };
      step(s, input);
      recordFrame(h, s, input);
    }
    const frames = h.snaps.map((snap) => snap.frame);
    const x = h.snaps[5].actors[0].position.x; // 0.25 + 0.5 + 0.75 + 1 + 1.25 = 3.75
    s.actors[0].position.x = 999; // changing the live state...
    const unchanged = h.snaps[5].actors[0].position.x === x; // ...must not change the history
    const inputCopy = { move: { x: 1, y: 0 } };
    step(s, inputCopy); // a state that did not advance is not recorded (test 193), so it advances first
    recordFrame(h, s, inputCopy);
    inputCopy.move.x = 42; // changing the input afterwards...
    const inputUnchanged = h.inputs[h.inputs.length - 1].move.x === 1;
    return { first, frames, x, unchanged, inputUnchanged };
  `);
  assert.strictEqual(result.first.snaps, 1);
  assert.strictEqual(result.first.inputs, 1);
  assert.strictEqual(result.first.firstInput, null);
  assert.deepStrictEqual(plain(result.frames), [0, 1, 2, 3, 4, 5]);
  assert.strictEqual(result.x, 3.75);
  assert.strictEqual(result.unchanged, true);
  assert.strictEqual(result.inputUnchanged, true);
});

test("21 history keeps only the last 120, and the oldest (index 0) leaves first", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).blueprint);
    for (let i = 0; i < 250; i++) {
      const input = { move: { x: 1, y: 0 } };
      step(s, input);
      recordFrame(h, s, input);
    }
    return {
      snaps: h.snaps.length,
      inputs: h.inputs.length,
      oldest: h.snaps[0].frame,
      newest: h.snaps[h.snaps.length - 1].frame,
      aligned: h.snaps.every((snap, i) => snap.frame === 131 + i),
      historySize: HISTORY_SIZE,
    };
  `);
  assert.strictEqual(result.historySize, 120);
  assert.strictEqual(result.snaps, 120);
  assert.strictEqual(result.inputs, 120);
  assert.strictEqual(result.oldest, 131);
  assert.strictEqual(result.newest, 250);
  assert.strictEqual(result.aligned, true);
});

test("22 cross-check: a normal run matches, even after the window has slid", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).blueprint);
    for (let i = 0; i < 300; i++) {
      const angle = i * 0.37;
      const input = { move: { x: Math.cos(angle), y: Math.sin(angle) } };
      step(s, input);
      recordFrame(h, s, input);
    }
    return crossCheck(h);
  `);
  assert.strictEqual(result, null);
});

test("23 cross-check: a changed snap is found, with the exact frame and field", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).blueprint);
    for (let i = 0; i < 120; i++) {
      const input = { move: { x: 1, y: 0 } };
      step(s, input);
      recordFrame(h, s, input);
    }
    const changedFrame = h.snaps[50].frame;
    h.snaps[50].actors[0].position.x += 0.1;
    return { found: crossCheck(h), changedFrame };
  `);
  assert.strictEqual(result.found.frame, result.changedFrame);
  assert.strictEqual(result.found.path, "actors[0].position.x");
  assert.ok(Math.abs(result.found.actual - result.found.expected + 0.1) < 1e-9);
});

test("24 cross-check also catches a rule that is not repeatable (hidden state outside the snaps)", () => {
  // Here finalSpeed secretly counts its calls. The recording and the replay see different counters.
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).blueprint);
    let counter = 0;
    const original = finalSpeed;
    finalSpeed = (actor, blueprint) => (counter++ >= 60 ? 0.1 : original(actor, blueprint));
    for (let i = 0; i < 90; i++) {
      const input = { move: { x: 1, y: 0 } };
      step(s, input);
      recordFrame(h, s, input);
    }
    const found = crossCheck(h); // the counter is at 90 already: the replay is slower from frame 1
    finalSpeed = original;
    return found;
  `);
  assert.strictEqual(result.frame, 1);
  assert.strictEqual(result.path, "actors[0].position.x");
  assert.strictEqual(result.expected, 0.25);
  assert.strictEqual(result.actual, 0.1);
});

test("25 discardAfter: going back and playing again drops what came after, and the lists stay aligned", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).blueprint);
    for (let i = 0; i < 30; i++) {
      const input = { move: { x: 1, y: 0 } };
      step(s, input);
      recordFrame(h, s, input);
    }
    const back = stateFromSnap(h, 10); // go back to frame 10 (a copy)
    discardAfter(h, 10);
    const afterDiscard = { snaps: h.snaps.length, inputs: h.inputs.length };
    for (let i = 0; i < 5; i++) {
      const input = { move: { x: 0, y: 1 } }; // a different future
      step(back, input);
      recordFrame(h, back, input);
    }
    return {
      afterDiscard,
      framesNow: h.snaps.map((snap) => snap.frame),
      lastY: h.snaps[h.snaps.length - 1].actors[0].position.y,
      historyIsCopy: h.snaps[10] !== back,
      check: crossCheck(h),
    };
  `);
  assert.strictEqual(result.afterDiscard.snaps, 11);
  assert.strictEqual(result.afterDiscard.inputs, 11);
  assert.deepStrictEqual(plain(result.framesNow), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.ok(result.lastY > 0 && result.lastY < 15); // moved down, with inertia (less than 5 x 3)
  assert.strictEqual(result.historyIsCopy, true);
  assert.strictEqual(result.check, null);
});

// ---- Dash ----

test("26 a dash makes the velocity the dash speed in the direction held (always at full strength) and spends the charge", () => {
  const result = run(`
    const full = createChamber1State();
    step(full, { move: { x: 1, y: 0 }, dash: true });
    const half = createChamber1State(); // a half-tilted analog stick
    step(half, { move: { x: 0.5, y: 0 }, dash: true });
    return {
      fullVelocity: full.actors[0].move.velocity.x,
      fullPosition: full.actors[0].position.x,
      fullCharges: full.actors[0].dash.charges,
      fullMax: full.actors[0].dash.charges.max,
      halfVelocity: half.actors[0].move.velocity.x,
    };
  `);
  assert.strictEqual(result.fullVelocity, 12);
  assert.strictEqual(result.fullPosition, 12); // the frame of the dash already moves at full dash speed
  assert.deepStrictEqual(plain(result.fullCharges), { now: 0, max: 1 }); // spent one, the maximum stays
  assert.strictEqual(result.fullMax, 1);
  assert.strictEqual(result.halfVelocity, 12);
});

test("27 a dash without a direction does nothing, and the charge is kept", () => {
  const result = run(`
    const s = createChamber1State();
    step(s, { move: { x: 0, y: 0 }, dash: true });
    return { velocity: s.actors[0].move.velocity.x, charges: s.actors[0].dash.charges.now };
  `);
  assert.strictEqual(result.velocity, 0);
  assert.strictEqual(result.charges, 1);
});

test("28 after a dash, holding the direction: the speed falls 0.5 per frame down to the top speed (18 frames)", () => {
  const log = run(`
    const s = createChamber1State();
    const v = s.actors[0].move.velocity;
    const log = [];
    step(s, { move: { x: 1, y: 0 }, dash: true });
    log.push(v.x);
    for (let i = 0; i < 25; i++) { step(s, { move: { x: 1, y: 0 } }); log.push(v.x); }
    return log;
  `);
  assert.strictEqual(log[0], 12);
  assert.strictEqual(log[1], 11.5);
  assert.strictEqual(log[17], 3.5);
  assert.strictEqual(log[18], 3); // reached the top speed 18 frames after the dash
  assert.ok(log.slice(18).every((value) => value === 3)); // and stays there
});

test("29 after a dash, releasing the keys: it still falls 0.5 per frame down to the top speed, then brakes normally (0.125)", () => {
  const log = run(`
    const s = createChamber1State();
    const v = s.actors[0].move.velocity;
    const log = [];
    step(s, { move: { x: 1, y: 0 }, dash: true });
    log.push(v.x);
    for (let i = 0; i < 60; i++) { step(s, { move: { x: 0, y: 0 } }); log.push(v.x); }
    return log;
  `);
  assert.strictEqual(log[18], 3); // 0.5 per frame down to the top speed
  assert.strictEqual(log[19], 2.875); // then the normal deceleration (0.125)
  assert.strictEqual(log.indexOf(0), 18 + 24); // 24 more frames to stop
});

test("30 a charge comes back 240 frames after it was spent, and a dash before that does nothing", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    const hold = { move: { x: 1, y: 0 } };
    step(s, { move: { x: 1, y: 0 }, dash: true }); // spends the only charge
    for (let i = 0; i < 238; i++) step(s, hold);
    step(s, { move: { x: 1, y: 0 }, dash: true }); // 239 frames later: no charge yet
    const early = { charges: player.dash.charges.now, velocity: player.move.velocity.x };
    step(s, { move: { x: 1, y: 0 }, dash: true }); // 240 frames later: the charge is back, and it is used
    const late = { charges: player.dash.charges.now, velocity: player.move.velocity.x };
    return { early, late };
  `);
  assert.strictEqual(result.early.charges, 0);
  assert.strictEqual(result.early.velocity, 3); // nothing happened
  assert.strictEqual(result.late.charges, 0); // it came back and was spent in the same frame
  assert.strictEqual(result.late.velocity, 12);
});

test("31 a stronger dash is a longer dash: the decay is a constant, parts cannot change it", () => {
  const log = run(`
    const original = finalDashSpeed;
    finalDashSpeed = () => 20; // as if parts added to the dash strength
    const s = createChamber1State();
    const v = s.actors[0].move.velocity;
    const log = [];
    step(s, { move: { x: 1, y: 0 }, dash: true });
    log.push(v.x);
    for (let i = 0; i < 40; i++) { step(s, { move: { x: 1, y: 0 } }); log.push(v.x); }
    finalDashSpeed = original;
    return log;
  `);
  assert.strictEqual(log[0], 20);
  assert.strictEqual(log[1], 19.5); // the same 0.5 per frame
  assert.strictEqual(log[33], 3.5);
  assert.strictEqual(log[34], 3); // (20 - 3) / 0.5 = 34 frames, against 18 for the dash of 12
});

test("32 running diagonally at the top speed and then releasing brakes at 0.125 (rounding is not overspeed)", () => {
  const { before, after } = run(`
    const s = createChamber1State();
    const v = s.actors[0].move.velocity;
    const c = Math.SQRT1_2;
    for (let i = 0; i < 60; i++) step(s, { move: { x: c, y: c } });
    const before = Math.sqrt(v.x * v.x + v.y * v.y);
    step(s, { move: { x: 0, y: 0 } });
    const after = Math.sqrt(v.x * v.x + v.y * v.y);
    return { before, after };
  `);
  assert.ok(Math.abs(before - 3) < 1e-9);
  assert.ok(Math.abs(before - after - 0.125) < 1e-9); // not 0.5
});

test("33 the cross-check stays clean in a run with dashes", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).blueprint);
    for (let i = 0; i < 400; i++) {
      const angle = i * 0.21;
      const input = { move: { x: Math.cos(angle), y: Math.sin(angle) }, dash: i % 70 === 5 };
      step(s, input);
      recordFrame(h, s, input);
    }
    return { check: crossCheck(h), dashes: h.inputs.filter((input) => input && input.dash).length };
  `);
  assert.strictEqual(result.check, null);
  assert.ok(result.dashes >= 1); // the run really had dashes
});

// ---- Rocks (seed and formula) ----

test("34 the same seed always gives the same rocks", () => {
  const [first, second] = run(`
    const a = JSON.stringify(objectsInArea(1, -3000, -3000, 3000, 3000));
    const b = JSON.stringify(objectsInArea(1, -3000, -3000, 3000, 3000));
    return [a, b];
  `);
  assert.strictEqual(first, second);
  assert.ok(JSON.parse(first).length > 50); // and there really are rocks
});

test("35 different seeds give different rocks", () => {
  const [one, two] = run(`
    return [JSON.stringify(objectsInArea(1, -3000, -3000, 3000, 3000)), JSON.stringify(objectsInArea(2, -3000, -3000, 3000, 3000))];
  `);
  assert.notStrictEqual(one, two);
});

test("36 a rock does not depend on where you look from: a small area finds exactly the rocks of a big one that fall inside it", () => {
  const { small, fromBig } = run(`
    const big = objectsInArea(7, -2000, -2000, 2000, 2000);
    const small = objectsInArea(7, -500, -300, 700, 900);
    const fromBig = big.filter((r) => r.position.x >= -500 && r.position.x <= 700 && r.position.y >= -300 && r.position.y <= 900);
    return { small: JSON.stringify(small), fromBig: JSON.stringify(fromBig) };
  `);
  assert.strictEqual(small, fromBig);
});

test("37 there is no rock near the starting point, for any seed", () => {
  const closest = run(`
    let closest = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      for (const rock of objectsInArea(seed, -1000, -1000, 1000, 1000)) {
        closest = Math.min(closest, Math.sqrt(rock.position.x * rock.position.x + rock.position.y * rock.position.y));
      }
    }
    return closest;
  `);
  assert.ok(closest >= 200); // safeRadius
  assert.ok(closest < 260); // and rocks do come right after it (the zone is not larger than it should be)
});

test("38 rocks never overlap each other", () => {
  const overlaps = run(`
    let overlaps = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const rocks = objectsInArea(seed, -3000, -3000, 3000, 3000);
      for (let i = 0; i < rocks.length; i++) {
        for (let j = i + 1; j < rocks.length; j++) {
          const dx = rocks[i].position.x - rocks[j].position.x;
          const dy = rocks[i].position.y - rocks[j].position.y;
          const reach = rocks[i].radius + rocks[j].radius;
          if (dx * dx + dy * dy < reach * reach) overlaps++;
        }
      }
    }
    return overlaps;
  `);
  assert.strictEqual(overlaps, 0);
});

test("39 known answer: seed 1 gives 10 objects on the first screen, the first a Shroom of radius 16 at 136,-375 with 17 health, weight 1600 and bounce 0.2, the last a rock of radius 28 at 99,456, weight 2800 and bounce 0", () => {
  // If this fails after a change to the formula or the hash, every map changed.
  // If it fails on another machine or browser, the hash is not exact there.
  const result = run(`
    const objects = objectsInArea(1, -960, -540, 960, 540);
    return { count: objects.length, first: objects[0], last: objects[objects.length - 1], types: objects.map((object) => object.type) };
  `);
  assert.strictEqual(result.count, 10);
  assert.deepStrictEqual(plain(result.first), { type: "shroom", layer: "small", position: { x: 136, y: -375 }, square: { x: 0, y: -2 }, radius: 16, health: { now: 17, max: 17 }, weight: 1600, bounce: 0.2, attacks: { bodySlam: { base: { blunt: 1600 * 0.001 }, now: { blunt: 1600 * 0.001 }, repeat: "contact", scale: "impact", ignores: ["enemy", "object"] } }, tags: ["object"] });
  assert.deepStrictEqual(plain(result.last), { type: "rock", layer: "small", position: { x: 99, y: 456 }, square: { x: 0, y: 1 }, radius: 28, health: { now: 10, max: 10 }, weight: 2800, bounce: 0, attacks: { bodySlam: { base: { blunt: 2800 * 0.001 }, now: { blunt: 2800 * 0.001 }, repeat: "contact", scale: "impact", ignores: ["enemy", "object"] } }, tags: ["object"] });
  assert.deepStrictEqual(plain(result.types), ["shroom", "rock", "rock", "shroom", "shroom", "rock", "shroom", "shroom", "rock", "rock"]);
});

test("40 the state keeps only the seed, not the objects; the seed rolls the type, the radius and the health of every object inside its ranges", () => {
  const result = run(`
    const s = createChamber1State(1, 5);
    const rules = DEFINITIONS.terrain.objects.layers.small;
    const seen = {};
    let outOfRange = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const object of objectsInArea(seed, -3000, -3000, 3000, 3000)) {
        const definition = DEFINITIONS.objects[object.type];
        seen[object.type] ??= { radii: new Set(), healths: new Set() };
        seen[object.type].radii.add(object.radius);
        seen[object.type].healths.add(object.health.max);
        const { size, healthRange } = definition;
        if (object.radius < size.min || object.radius > size.max) outOfRange++;
        if (object.health.max < healthRange.min || object.health.max > healthRange.max) outOfRange++;
        if (!Number.isInteger(object.radius) || !Number.isInteger(object.health.max)) outOfRange++;
      }
    }
    const spread = (type) => ({ radii: [...seen[type].radii].sort((a, b) => a - b), healths: [...seen[type].healths].sort((a, b) => a - b) });
    return {
      seed: s.seed,
      defaultSeed: createChamber1State().seed,
      actors: s.actors.map((actor) => actor.type),
      keys: Object.keys(s),
      outOfRange,
      rock: spread("rock"),
      shroom: spread("shroom"),
      margin: objectMargin(rules),
      kinds: rules.kinds,
      dummyCount: DEFINITIONS.terrain.dummies.count,
    };
  `, WITH_DUMMIES);
  assert.strictEqual(result.seed, 5);
  assert.strictEqual(result.defaultSeed, 1);
  assert.deepStrictEqual(plain(result.actors), ["avatar", ...Array(result.dummyCount).fill("dummy")]); // the avatar and the Dummies are the only things in the state
  assert.strictEqual(result.dummyCount, 100); // (this game has 100, see WITH_DUMMIES)
  assert.ok(!result.keys.includes("objects") && !result.keys.includes("rocks"));
  assert.strictEqual(result.outOfRange, 0);
  const radii = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  const healths = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  for (const type of ["rock", "shroom"]) {
    assert.deepStrictEqual(plain(result[type].radii), radii, type + ": every radius of 16 to 32 shows up");
    assert.deepStrictEqual(plain(result[type].healths), healths, type + ": every health of 10 to 20 shows up");
  }
  assert.strictEqual(result.margin, 32); // the largest radius of the kinds the seed places
  assert.deepStrictEqual(plain(result.kinds), ["rock", "shroom"]);
});

// ---- Collision with rocks ----
// These tests use the rock of seed 1 at 99,456 (radius 28, weight 2800 kg, health 10, square 0,1, no bounce), and
// Shrooms that the seed made (see findShroom). The avatar has radius 16.
// Only the Shroom has a bounce: 0.2 at radius 16, 0.6 at 24 and 1 at 32 (0.2 + 0.8 x (radius - 16) / 16).

// The rock of seed 1 used by these tests (see test 39).
const ROCK = { x: 99, y: 456, radius: 28, key: "small:0,1", health: 10 };

// Puts the avatar at (x, y) with the velocity (vx, vy), holds the direction, and runs one step.
function hitOnce(x, y, vx, vy, direction, input = {}) {
  return run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = ${x}; p.position.y = ${y};
    p.move.velocity.x = ${vx}; p.move.velocity.y = ${vy};
    step(s, { move: { x: ${direction.x}, y: ${direction.y} }, dash: ${input.dash === true} });
    return { x: p.position.x, y: p.position.y, vx: p.move.velocity.x, vy: p.move.velocity.y };
  `);
}

// A Shroom of the given radius, taken from the worlds of seeds 1 to 300: the first one with nothing else within
// 300 px and a health of 11 or more (so a hit of 10 does not break it, and the bounce is not cancelled).
// Returns { seed, x, y, maxHealth, key }. Nothing is placed by hand: it is the Shroom the seed made.
const shroomCache = {};
function findShroom(radius) {
  shroomCache[radius] ??= run(`
    for (let seed = 1; seed <= 300; seed++) {
      const objects = objectsInArea(seed, -3000, -3000, 3000, 3000);
      for (const object of objects) {
        if (object.type !== "shroom" || object.radius !== ${radius} || object.health.max < 11) continue;
        const alone = objects.every((other) => other === object || Math.hypot(other.position.x - object.position.x, other.position.y - object.position.y) > 300);
        if (alone) return { seed, x: object.position.x, y: object.position.y, maxHealth: object.health.max, key: objectKey(object) };
      }
    }
    throw new Error("no isolated Shroom of radius ${radius} in seeds 1 to 300");
  `);
  return shroomCache[radius];
}

// Puts the avatar just above a Shroom of the given radius (a gap of "gap" px), going down at "speed" (or from
// rest with a dash), and runs one step. "dy" is where the avatar ends, relative to the Shroom's center.
function hitShroom(radius, { speed = 3, dash = false, gap = 1 } = {}) {
  const shroom = findShroom(radius);
  return run(`
    const s = createChamber1State(1, ${shroom.seed});
    const p = s.actors[0];
    p.position.x = ${shroom.x}; p.position.y = ${shroom.y} - (16 + ${radius}) - ${gap};
    p.move.velocity.y = ${dash ? 0 : speed};
    step(s, { move: { x: 0, y: 1 }, dash: ${dash} });
    const health = s.damagedObjects["${shroom.key}"] ?? ${shroom.maxHealth};
    return { dy: p.position.y - ${shroom.y}, vy: p.move.velocity.y, avatar: p.health.now, shroomLoss: ${shroom.maxHealth} - health };
  `);
}

test("41 head-on at 3 px/frame: the rock stops you, a Shroom sends you back at 0.6 (radius 16), 1.8 (24) or 3 (32)", () => {
  const right = { x: 1, y: 0 };
  const rock = hitOnce(ROCK.x - ROCK.radius - 16, ROCK.y, 3, 0, right); // would end 3 px inside the rock
  assert.strictEqual(rock.vx, 0); // no bounce: -0 x 3
  for (const [radius, back] of [[16, 0.6], [24, 1.8], [32, 3]]) {
    const result = hitShroom(radius);
    assert.ok(Math.abs(result.vy + back) < 1e-9, "radius " + radius + ": " + result.vy + ", expected " + -back); // bounce x 3, going up
  }
});

test("42 the avatar is pushed out until it just touches the thing", () => {
  const right = { x: 1, y: 0 };
  assert.strictEqual(hitOnce(ROCK.x - ROCK.radius - 16, ROCK.y, 3, 0, right).x, 55); // 99 - (28 + 16)
  assert.strictEqual(hitShroom(16).dy, -32); // -(16 + 16)
  assert.strictEqual(hitShroom(32).dy, -48); // -(16 + 32)
});

test("43 the angle matters: only the part going into the rock is replaced, the part along it is kept", () => {
  const right = { x: 1, y: 0 };
  // A glancing blow on the rock. The avatar goes right and ends up above-left of it.
  const hit = hitOnce(76, 418, 3, 0, right);
  const result = run(`
    const nx = ${hit.x} - ${ROCK.x};
    const ny = ${hit.y} - ${ROCK.y};
    const length = Math.sqrt(nx * nx + ny * ny);
    const n = { x: nx / length, y: ny / length };
    const before = { x: 3, y: 0 };
    const tangent = { x: -n.y, y: n.x };
    const along = (v) => v.x * tangent.x + v.y * tangent.y;
    const into = (v) => v.x * n.x + v.y * n.y;
    const after = { x: ${hit.vx}, y: ${hit.vy} };
    return {
      touching: length, // must be 44
      intoAfter: into(after),
      alongBefore: along(before),
      alongAfter: along(after),
      speedBefore: 3,
      speedAfter: Math.sqrt(after.x * after.x + after.y * after.y),
    };
  `);
  assert.ok(Math.abs(result.touching - 44) < 1e-9);
  assert.ok(Math.abs(result.intoAfter) < 1e-9); // bounce 0: nothing goes into the rock any more
  assert.ok(Math.abs(result.alongAfter - result.alongBefore) < 1e-9); // the sliding part is kept
  assert.ok(result.speedAfter > 0.8 * result.speedBefore); // a glancing blow loses little (head-on loses everything)
  assert.ok(result.speedAfter < result.speedBefore);
});

test("44 a dash into a rock stops, a dash into a Shroom of radius 32 (bounce 1) comes back at the full dash speed", () => {
  // A dash hurts the thing by 10, which would break the rock (health 10) and cancel the bounce.
  // So here every rock has 50 health: the test is about the bounce, not about breaking.
  const tough = loadGame((text) => text.replace("healthRange: { min: 10, max: 20 }", "healthRange: { min: 50, max: 50 }"));
  const intoRock = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = ${ROCK.x - ROCK.radius - 16 - 2}; p.position.y = ${ROCK.y};
    step(s, { move: { x: 1, y: 0 }, dash: true }); // dash: 12 px, ends 10 px inside
    return { x: p.position.x, vx: p.move.velocity.x };
  `, tough);
  assert.strictEqual(intoRock.vx, 0);
  assert.strictEqual(intoRock.x, 55);
  const intoShroom = hitShroom(32, { dash: true, gap: 2 });
  assert.ok(Math.abs(intoShroom.vy + 12) < 1e-9, "the dash came back at " + intoShroom.vy);
});

test("45 over a long run with dashes the avatar is never inside a rock", () => {
  const worst = run(`
    let worst = Infinity; // the smallest (distance - touching distance) seen
    for (const seed of [1, 2, 3]) {
      const s = createChamber1State(1, seed);
      const p = s.actors[0];
      const directions = [[1, 0], [0.7071067811865476, 0.7071067811865476], [0, 1], [-0.7071067811865476, 0.7071067811865476], [-1, 0], [-0.7071067811865476, -0.7071067811865476], [0, -1], [0.7071067811865476, -0.7071067811865476]];
      for (let i = 0; i < 6000; i++) {
        const d = directions[Math.floor(i / 45) % 8];
        step(s, { move: { x: d[0], y: d[1] }, dash: i % 100 === 50 });
        for (const rock of objectsInArea(seed, p.position.x - 100, p.position.y - 100, p.position.x + 100, p.position.y + 100)) {
          if (isObjectBroken(s, rock)) continue; // a broken rock has no collision
          const dx = p.position.x - rock.position.x;
          const dy = p.position.y - rock.position.y;
          const gap = Math.sqrt(dx * dx + dy * dy) - (16 + rock.radius);
          if (gap < worst) worst = gap;
        }
      }
    }
    return worst;
  `);
  assert.ok(worst > -1e-9, "the avatar went inside a rock by " + -worst + " px");
});

test("46 the cross-check stays clean in a run that hits rocks", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 20; p.position.y = ${ROCK.y}; // next to the rock at ${ROCK.x},${ROCK.y}
    const h = createHistory(s, createRun(1).blueprint);
    let touchingFrames = 0;
    for (let i = 0; i < 300; i++) {
      const input = { move: { x: i % 60 < 40 ? 1 : -0.5, y: i % 90 < 30 ? 0.3 : -0.2 }, dash: i % 80 === 10 };
      step(s, input);
      recordFrame(h, s, input);
      const dx = p.position.x - ${ROCK.x};
      const dy = p.position.y - ${ROCK.y};
      if (Math.abs(Math.sqrt(dx * dx + dy * dy) - ${ROCK.radius + 16}) < 1e-9) touchingFrames++;
    }
    return { check: crossCheck(h), touchingFrames };
  `);
  assert.ok(result.touchingFrames > 0); // the run really hit the rock
  assert.strictEqual(result.check, null);
});

// ---- Body slam: damage from collisions ----
// The rule (src/sim.js): every collision is a hit. Its packet is blunt damage of
// weight x 0.001 x impact / 6 (impact = the speed going into the other thing; provisional formula).
// The target resists each type: the share taken off is points / (points + 100), and a hit costs at least 1.
// Avatar: 5000 kg, 30 points of blunt resistance (23% off), health 100.
// The rock of seed 1 used here (ROCK): 2800 kg, health 10.

// Dashes right from (x, y) into the rock, and tells the health of the avatar and of the rock after the hit.
function slamInto(x, y) {
  return run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = ${x}; p.position.y = ${y};
    step(s, { move: { x: 1, y: 0 }, dash: true });
    return { avatar: p.health.now, rock: s.damagedObjects["${ROCK.key}"] ?? ${ROCK.health}, vx: p.move.velocity.x };
  `);
}

test("47 walking into a rock at 3 px/frame is a weak hit: the rock loses 2.5, the avatar loses the rock's 1.4 less the 23% its blunt resistance takes off (1.08)", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 55; p.position.y = ${ROCK.y}; // touching the rock
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } });
    return { avatar: p.health.now, damagedObjects: s.damagedObjects, vx: p.move.velocity.x };
  `);
  assert.ok(Math.abs(result.avatar - (100 - resisted(1.4, 30))) < 1e-9, "avatar: " + result.avatar); // 2800 x 0.001 x 3 / 6 = 1.4, times 100 / 130 = 1.077
  assert.deepStrictEqual(plain(result.damagedObjects), { "small:0,1": 7.5 }); // 10 - 5000 x 0.001 x 3 / 6
  assert.strictEqual(result.vx, 0); // it still stopped (the bounce is a separate rule)
});

test("48 a dash (impact 12) hurts both: each hits with weight x 0.001 x 12 / 6; the avatar loses that times 100 / 130 (its blunt resistance), and at least 1", () => {
  const rock = slamInto(53, ROCK.y); // 2800 kg: attack 5.6, so 5.6 x 100 / 130 = 4.31 to the avatar; the avatar (5000 kg) hits for 10
  assert.ok(Math.abs(rock.avatar - (100 - resisted(5.6, 30))) < 1e-9, "rock: " + rock.avatar);
  assert.strictEqual(rock.rock, 0); // 10 - 10: it breaks
  const small = hitShroom(16, { dash: true, gap: 2 }); // 1600 kg: attack 3.2, so 3.2 x 100 / 130 = 2.46
  assert.ok(Math.abs(small.avatar - (100 - resisted(3.2, 30))) < 1e-9, "small shroom: " + small.avatar);
  assert.strictEqual(small.shroomLoss, 10); // the avatar hits for 10
  const large = hitShroom(32, { dash: true, gap: 2 }); // 3200 kg: attack 6.4, so 6.4 x 100 / 130 = 4.92
  assert.ok(Math.abs(large.avatar - (100 - resisted(6.4, 30))) < 1e-9, "large shroom: " + large.avatar);
  assert.strictEqual(large.shroomLoss, 10);
});

test("49 a graze is a weak hit: only the part of the speed going into the rock counts, so it hurts less than a head-on walk", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 76; p.position.y = 418; // the glancing blow of test 43
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } });
    return { avatar: p.health.now, damagedObjects: s.damagedObjects };
  `);
  assert.strictEqual(result.avatar, 99); // the graze, after the resistance, is below the minimum damage, so 1
  const loss = 10 - result.damagedObjects["small:0,1"];
  assert.ok(loss > 0 && loss < 2.5, "a graze should hurt the rock less than the head-on walk of test 47 (2.5), it lost " + loss);
});

test("50 the attack of a hit is a packet of blunt damage: weight x 0.001 x impact / 6, empty without impact; the damage never goes below 0", () => {
  const result = withBlueprints(`
    const rock = finalizeObject("rock", { radius: 28 });
    const small = finalizeObject("shroom", { radius: 16 }); // 1600 kg
    const large = finalizeObject("shroom", { radius: 32 }); // 3200 kg
    const lighterAvatar = createAvatar(without("arm-r")); // 4350 kg
    return {
      resistance: { blunt: finalResistance(avatar, full, "blunt"), puncture: finalResistance(avatar, full, "puncture") },
      rockWeight: rock.weight,
      rock: finalAttack(rock, { impact: 12 }),
      atReference: finalAttack(rock, { impact: 6 }),
      walking: finalAttack(rock, { impact: 3 }),
      noImpact: finalAttack(rock, { impact: 0 }),
      avatar: finalAttack(avatar, { impact: 12 }),
      lighterAvatar: finalAttack(lighterAvatar, { impact: 12 }),
      smallDamage: damageOf(small, { impact: 12 }, avatar, full),
      largeDamage: damageOf(large, { impact: 12 }, avatar, full),
    };
  `);
  assert.deepStrictEqual(plain(result.resistance), { blunt: 30, puncture: 10 });
  assert.strictEqual(result.rockWeight, 2800); // 100 x radius 28
  assert.deepStrictEqual(Object.keys(result.rock), ["blunt"]); // the body slam is only blunt
  assert.ok(Math.abs(result.rock.blunt - 5.6) < 1e-9); // 2800 x 0.001 x 12 / 6
  assert.ok(Math.abs(result.atReference.blunt - 2.8) < 1e-9); // at the reference impact the attack is weight x 0.001
  assert.ok(Math.abs(result.walking.blunt - 1.4) < 1e-9);
  assert.deepStrictEqual(plain(result.noImpact), {}); // no impact, no packet
  assert.strictEqual(result.avatar.blunt, 10); // the avatar hits with its own weight, 5000 kg
  assert.ok(Math.abs(result.lighterAvatar.blunt - 8.7) < 1e-9); // a lighter mecha hits softer: 4350 x 0.001 x 2
  assert.ok(Math.abs(result.smallDamage - resisted(3.2, 30)) < 1e-9); // 3.2 x 100 / 130 = 2.46, above the minimum damage 1
  assert.ok(Math.abs(result.largeDamage - resisted(6.4, 30)) < 1e-9); // 4.92
});

test("51 health stops at 0 (there is no death yet)", () => {
  const health = run(`
    const p = createChamber1State().actors[0]; // starts with 100
    applyDamage(p, 60);
    applyDamage(p, 60);
    return p.health.now;
  `);
  assert.strictEqual(health, 0);
});

test("52 the cross-check stays clean in a run where both sides are hurt, and the state is plain numbers", () => {
  const result = withBlueprints(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 20; p.position.y = ${ROCK.y}; // next to the rock at ${ROCK.x},${ROCK.y}
    const h = createHistory(s, full);
    for (let i = 0; i < 300; i++) {
      const input = { move: { x: i % 60 < 40 ? 1 : -0.5, y: i % 90 < 30 ? 0.3 : -0.2 }, dash: i % 80 === 10 };
      step(s, input, full);
      recordFrame(h, s, input);
    }
    return { check: crossCheck(h), health: p.health.now, damagedObjects: s.damagedObjects };
  `);
  assert.ok(result.health < 100, "the run never hurt the avatar");
  assert.ok(Number.isFinite(result.health));
  assert.ok(Object.keys(result.damagedObjects).length > 0, "the run never hurt a rock");
  assert.ok(Object.values(result.damagedObjects).every(Number.isFinite));
  assert.strictEqual(result.check, null);
});

// ---- The kit of parts ----
// The final values of the avatar are the SUM of the specs of the parts in its blueprint.
// Starter blueprint: 9 parts, 5000 kg. Top speed 3.5 + 0.5 - 5000 x 0.0002 = 3; health 15 + 55 + 30 = 100;
// resistance: blunt 20 + 10 = 30, puncture 10; dash 12; capacity 8000.

// Runs code with "avatar", "full" (the starter blueprint) and "without(id)" (the starter blueprint minus one part).
function withBlueprints(code) {
  return run(`
    const full = createRun(1).blueprint;
    const avatar = createAvatar(full);
    const without = (id) => ({ parts: full.parts.filter((part) => part !== id) });
    ${code}
  `);
}

test("53 the starter blueprint adds up to the values the avatar had before parts (speed 3, health 100, dash 12, 5000 kg) and to a resistance of 30 blunt and 10 puncture", () => {
  const result = withBlueprints(`
    return {
      weight: totalWeight(full), capacity: sumSpec(full, "capacity"),
      speed: finalSpeed(avatar, full), health: finalMaxHealth(avatar, full),
      resistance: { blunt: finalResistance(avatar, full, "blunt"), puncture: finalResistance(avatar, full, "puncture") }, dash: finalDashSpeed(avatar, full),
      startsFull: createChamber1State(1, 1, full).actors[0].health.now,
      startsFullWithoutHead: createChamber1State(1, 1, without("head")).actors[0].health.now,
    };
  `);
  assert.deepStrictEqual(plain(result), { weight: 5000, capacity: 8000, speed: 3, health: 100, resistance: { blunt: 30, puncture: 10 }, dash: 12, startsFull: 100, startsFullWithoutHead: 85 });
});

test("54 weight takes speed away directly: taking off a 650 kg arm gives back 650 x 0.0002 = 0.13 px/frame", () => {
  const result = withBlueprints(`
    return {
      withoutArm: finalSpeed(avatar, without("arm-r")),
      withoutHead: finalSpeed(avatar, without("head")), // 200 kg: 0.04
    };
  `);
  assert.ok(Math.abs(result.withoutArm - 3.13) < 1e-9, "without an arm: " + result.withoutArm);
  assert.ok(Math.abs(result.withoutHead - 3.04) < 1e-9, "without the head: " + result.withoutHead);
});

test("55 without the legs the speed is the Torso's 0.5 minus the weight, and it never goes below 0", () => {
  const speed = withBlueprints("return finalSpeed(avatar, without('legs'));"); // 0.5 - 3700 x 0.0002 = -0.24
  assert.strictEqual(speed, 0);
});

test("56 taking a part off changes health and resistance by exactly what it gave", () => {
  const result = withBlueprints(`
    const resistance = (blueprint) => ({ blunt: finalResistance(avatar, blueprint, "blunt"), puncture: finalResistance(avatar, blueprint, "puncture") });
    return {
      noTorso: { health: finalMaxHealth(avatar, without("torso")), resistance: resistance(without("torso")) },
      noHead: { health: finalMaxHealth(avatar, without("head")), resistance: resistance(without("head")) },
    };
  `);
  assert.deepStrictEqual(plain(result), { noTorso: { health: 45, resistance: { blunt: 10, puncture: 0 } }, noHead: { health: 85, resistance: { blunt: 30, puncture: 10 } } });
});

test("57 without the Booster there is no dash charge and no dash: the maximum comes from the parts (finalDashMaxCharges)", () => {
  const result = withBlueprints(`
    const noBooster = without("booster");
    const s = createChamber1State(1, 1, noBooster);
    const p = s.actors[0];
    step(s, { move: { x: 1, y: 0 }, dash: true }, noBooster);
    return {
      withBooster: finalDashMaxCharges(avatar, full),
      withoutBooster: finalDashMaxCharges(avatar, noBooster),
      rechargeWith: finalDashRechargeFrames(avatar, full),
      rechargeWithout: finalDashRechargeFrames(avatar, noBooster),
      dashSpeed: finalDashSpeed(avatar, noBooster),
      charges: p.dash.charges,
      vx: p.move.velocity.x,
      startsWith: createChamber1State(1, 1, full).actors[0].dash.charges,
    };
  `);
  assert.strictEqual(result.withBooster, 1);
  assert.strictEqual(result.withoutBooster, 0);
  assert.deepStrictEqual([result.rechargeWith, result.rechargeWithout], [240, 0]); // the recharge time is the Booster's too
  assert.strictEqual(result.dashSpeed, 0);
  assert.deepStrictEqual(plain(result.charges), { now: 0, max: 0 }); // nothing to spend, nothing to recharge
  assert.strictEqual(result.vx, 0.25); // only the normal acceleration (a dash would have set 12)
  assert.deepStrictEqual(plain(result.startsWith), { now: 1, max: 1 }); // a new avatar starts full
});

test("58 a blueprint over the capacity of the Torso is refused, and so is an unknown part", () => {
  const result = withBlueprints(`
    const attempt = (blueprint) => { try { assertValidBlueprint(blueprint); return "accepted"; } catch (error) { return error.message; } };
    return {
      starter: attempt(full), // 5000 kg of 8000
      tooHeavy: attempt({ parts: [...full.parts, "legs", "legs", "legs"] }), // 8900 kg
      unknown: attempt({ parts: [...full.parts, "wings"] }),
    };
  `);
  assert.strictEqual(result.starter, "accepted");
  assert.strictEqual(result.tooHeavy, "The blueprint weighs 8900 kg and can carry only 8000 kg");
  assert.strictEqual(result.unknown, "Unknown part: wings");
});

test("59 only the avatar has a blueprint: another actor of the same type gets nothing from the parts (its maximum health is its own)", () => {
  const result = withBlueprints(`
    const other = finalizeObject("avatar", { health: { now: 7, max: 7 } }, undefined, "other_1");
    return { speed: finalSpeed(other, full), health: finalMaxHealth(other, full), resistance: finalResistance(other, full, "blunt") };
  `);
  assert.deepStrictEqual(plain(result), { speed: 0, health: 7, resistance: 0 });
});

test("60 the blueprint is an input of the replay: the cross-check is clean with the right blueprint and finds a difference with another", () => {
  const result = withBlueprints(`
    const s = createChamber1State();
    const noArm = without("arm-r");
    const h = createHistory(s, noArm);
    for (let i = 0; i < 60; i++) {
      const input = { move: { x: 1, y: 0 } };
      step(s, input, noArm);
      recordFrame(h, s, input);
    }
    const right = crossCheck(h);
    h.blueprint = full; // replay with a blueprint that is not the one the run was played with
    const wrong = crossCheck(h);
    return { right, wrong, top: s.actors[0].move.velocity.x };
  `);
  assert.strictEqual(result.right, null);
  assert.ok(result.wrong !== null, "a different blueprint must change the replay");
  assert.ok(Math.abs(result.top - 3.13) < 1e-9); // the run really used the lighter blueprint
});

// ---- Rocks with health, and the weight of a still object ----

test("61 a rock that is hurt is stored by its square, and it keeps its health between frames", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 55; p.position.y = ${ROCK.y};
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } }); // hits the rock: 10 - 2.5
    for (let i = 0; i < 10; i++) step(s, { move: { x: 0, y: 0 } });
    return { damagedObjects: s.damagedObjects, json: JSON.stringify(s) };
  `);
  assert.deepStrictEqual(plain(result.damagedObjects), { "small:0,1": 7.5 });
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json); // still plain JSON
});

test("62 a rock that reaches 0 breaks: nothing collides with it and the avatar goes through", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    s.damagedObjects["small:0,1"] = 5; // the rock at 99,456 has 5 left
    p.position.x = 53; p.position.y = ${ROCK.y};
    step(s, { move: { x: 1, y: 0 }, dash: true }); // 5 - 10: it breaks (health stops at 0)
    const afterHit = { broken: s.damagedObjects["small:0,1"], vx: p.move.velocity.x, x: p.position.x, health: p.health.now };
    for (let i = 0; i < 40; i++) step(s, { move: { x: 1, y: 0 } });
    return { afterHit, x: p.position.x, health: p.health.now };
  `);
  assert.strictEqual(result.afterHit.broken, 0);
  assert.strictEqual(result.afterHit.vx, 12); // no bounce and no stop
  assert.strictEqual(result.afterHit.x, 65); // not pushed out
  assert.ok(Math.abs(result.afterHit.health - (100 - resisted(5.6, 30))) < 1e-9); // the breaking hit still hurt the avatar (5.6 x 100 / 130)
  assert.ok(result.x > 99 + 44, "the avatar did not go through the broken rock: x=" + result.x);
  assert.ok(Math.abs(result.health - (100 - resisted(5.6, 30))) < 1e-9); // and the broken rock hurts no more
});

test("63 every rock rolls its own health from the seed: whole numbers from 10 to 20, the same every time, and all values show up", () => {
  const result = run(`
    const seen = new Set();
    let outOfRange = 0, notWhole = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const rock of objectsInArea(seed, -3000, -3000, 3000, 3000)) {
        seen.add(rock.health.max);
        if (rock.health.max < 10 || rock.health.max > 20) outOfRange++;
        if (!Number.isInteger(rock.health.max)) notWhole++;
      }
    }
    const again = JSON.stringify(objectsInArea(3, -2000, -2000, 2000, 2000)) === JSON.stringify(objectsInArea(3, -2000, -2000, 2000, 2000));
    return { outOfRange, notWhole, values: [...seen].sort((a, b) => a - b), again };
  `);
  assert.strictEqual(result.outOfRange, 0);
  assert.strictEqual(result.notWhole, 0);
  assert.strictEqual(result.again, true);
  assert.deepStrictEqual(plain(result.values), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test("64 the weight of an object is weightPerRadius x radius, a whole number: twice the radius, twice the weight", () => {
  const result = run(`
    return {
      rock: finalizeObject("rock", { radius: 28 }).weight,
      small: finalizeObject("shroom", { radius: 16 }).weight,
      middle: finalizeObject("shroom", { radius: 24 }).weight,
      large: finalizeObject("shroom", { radius: 32 }).weight,
    };
  `);
  assert.deepStrictEqual(plain(result), { rock: 2800, small: 1600, middle: 2400, large: 3200 });
  assert.strictEqual(result.large / result.small, 2); // linear in the radius (twice as wide, twice as heavy), not the area
});


test("65 pressing into a rock hurts it once, at the arrival (no bounce, so no second collision); a broken rock lets the avatar through", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    player.position.x = 0; player.position.y = ${ROCK.y};
    for (let i = 0; i < 100; i++) step(s, { move: { x: 1, y: 0 } }); // walks right into the rock and keeps pressing
    const settled = { rock: s.damagedObjects["small:0,1"], avatar: player.health.now, x: player.position.x };
    for (let i = 0; i < 200; i++) step(s, { move: { x: 1, y: 0 } }); // keeps pressing
    return { settled, afterPressing: { rock: s.damagedObjects["small:0,1"], avatar: player.health.now, x: player.position.x } };
  `);
  // The collision at impact 3: the rock loses 5000 x 0.001 x 3 / 6 = 2.5. The avatar loses the rock's 2800 x 0.001 x 3 / 6 = 1.4
  // less 23% (its 30 points of blunt resistance): 1.077. Without a bounce nothing else triggers.
  assert.strictEqual(result.settled.rock, 7.5);
  assert.strictEqual(result.settled.x, 55);
  assert.ok(Math.abs(result.settled.avatar - (100 - resisted(1.4, 30))) < 1e-9, "avatar: " + result.settled.avatar);
  assert.deepStrictEqual(plain(result.afterPressing), plain(result.settled)); // pressing for 3 s more changed nothing
});

test("66 touching again after separating is a new collision and hurts again; the contacts are plain state", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    player.position.x = 0; player.position.y = ${ROCK.y};
    for (let i = 0; i < 60; i++) step(s, { move: { x: 1, y: 0 } });
    const first = s.damagedObjects["small:0,1"];
    const ofAvatar = () => JSON.stringify(s.contacts.filter((contact) => contact.startsWith("avatar_1|"))); // the Dummies have contacts of their own
    const whileTouching = ofAvatar();
    for (let i = 0; i < 20; i++) step(s, { move: { x: -1, y: 0 } }); // walks away: no contact
    const apart = ofAvatar();
    for (let i = 0; i < 60; i++) step(s, { move: { x: 1, y: 0 } }); // comes back: a new collision
    return { first, second: s.damagedObjects["small:0,1"], whileTouching, apart, json: JSON.stringify(s) };
  `);
  assert.strictEqual(result.whileTouching, JSON.stringify(["avatar_1|rock small:0,1"]));
  assert.strictEqual(result.apart, "[]");
  assert.ok(result.second < result.first, "the second collision did not hurt: " + result.first + " -> " + result.second);
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json);
});

test("67 the body slam comes from the weight alone: a thing with weightPerRadius 0 has an empty packet and damage 0 at any impact, the same thing with weight does hit", () => {
  const weightless = loadGame((text) => text.replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,', 'name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 0,'));
  const probe = `
    const rock = finalizeObject("rock", { radius: 28 });
    const full = createRun(1).blueprint;
    const avatar = createAvatar(full);
    return { attack: finalAttack(rock, { impact: 12 }), damage: damageOf(rock, { impact: 12 }, avatar, full) };
  `;
  assert.deepStrictEqual(plain(run(probe, weightless)), { attack: {}, damage: 0 }); // no minimum damage either: there is no attack
  const normal = run(probe);
  assert.ok(Math.abs(normal.attack.blunt - 5.6) < 1e-9); // 2800 x 0.001 x 12 / 6
  assert.ok(Math.abs(normal.damage - resisted(5.6, 30)) < 1e-9); // 5.6 x 100 / 130
});

test("68 a hit always costs at least 1 (the resistance never makes the target immune), but no attack means no damage", () => {
  const result = withBlueprints(`
    const small = finalizeObject("shroom", { radius: 16 }); // 1600 kg
    const large = finalizeObject("shroom", { radius: 32 }); // 3200 kg
    return {
      weak: damageOf(small, { impact: 3 }, avatar, full), // attack 0.8, 0.62 after the resistance
      strong: damageOf(large, { impact: 12 }, avatar, full), // attack 6.4, 4.92 after the resistance
      noImpact: damageOf(large, { impact: 0 }, avatar, full),
    };
  `);
  assert.strictEqual(result.weak, 1);
  assert.ok(Math.abs(result.strong - resisted(6.4, 30)) < 1e-9);
  assert.strictEqual(result.noImpact, 0);
});

test("69 below the minimum impact (1) nothing triggers: no damage, no bounce; the avatar just stops against the thing", () => {
  const result = hitShroom(32, { speed: 0.5, gap: 0.3 }); // a Shroom of radius 32 has bounce 1: a bounce would send it back at 0.75
  assert.strictEqual(result.avatar, 100);
  assert.strictEqual(result.shroomLoss, 0);
  assert.strictEqual(result.vy, 0); // stopped, not sent back
});

test("70 every weight in the definitions is a whole number: the parts, and the size and weightPerRadius of every object", () => {
  const weights = run(`
    return [
      ...Object.entries(DEFINITIONS.objects).flatMap(([id, d]) => [[id + " weightPerRadius", d.weightPerRadius], [id + " size.min", d.size.min], [id + " size.max", d.size.max]]),
      ...Object.entries(DEFINITIONS.parts).map(([id, p]) => [id, p.weight]),
    ];
  `);
  assert.ok(weights.length >= 15);
  for (const [id, weight] of weights) assert.ok(Number.isInteger(weight) && weight >= 0, id + ": " + weight);
});

test("71 a weight that is not a whole number (or is negative) stops the game when it loads; 0 is allowed", () => {
  const original = 'name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,';
  const patch = (size, weight) => (text) => text.replace(original, 'name: "Rock",\n      size: ' + size + ',\n      weightPerRadius: ' + weight + ',');
  assert.throws(() => loadGame(patch("{ min: 16, max: 32 }", 100.5)), /object rock.*100.5/);
  assert.throws(() => loadGame(patch("{ min: 16.5, max: 32 }", 100)), /object rock/);
  assert.throws(() => loadGame((text) => text.replace('head: { name: "Head", weight: 200,', 'head: { name: "Head", weight: -1,')), /part head.*-1/);
  const box = loadGame(patch("{ min: 16, max: 32 }", 0));
  assert.strictEqual(run("return finalizeObject('rock', { radius: 28 }).weight;", box), 0);
});

test("72 a rock with weight 0 and health 1 is harmless and breaks at the first hit, and the avatar goes through it", () => {
  const box = loadGame((text) => text
    .replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,\n      healthRange: { min: 10, max: 20 }', 'name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 0,\n      healthRange: { min: 1, max: 1 }'));
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 53; p.position.y = ${ROCK.y}; // touching the rock at 99,456, which is now a box
    step(s, { move: { x: 1, y: 0 }, dash: true });
    return { avatar: p.health.now, box: s.damagedObjects["small:0,1"], vx: p.move.velocity.x };
  `, box);
  assert.strictEqual(result.avatar, 100); // attack 0: no damage, not even the minimum
  assert.strictEqual(result.box, 0); // the avatar hit it for 10 (minimum damage 1 would be enough)
  assert.strictEqual(result.vx, 12); // broken: no stop, no bounce
});

test("73 the objects are the rock and the Shroom, each complete and with its own numbers: size 16 to 32, weight modifier 100, health 10 to 20", () => {
  const objects = plain(run("return DEFINITIONS.objects;"));
  assert.deepStrictEqual(Object.keys(objects), ["rock", "shroom"]);
  for (const id of ["rock", "shroom"]) {
    const object = objects[id];
    assert.ok(object.name, id + " has a name");
    assert.deepStrictEqual(object.size, { min: 16, max: 32 }, id);
    assert.strictEqual(object.weightPerRadius, 100, id);
    assert.deepStrictEqual(object.healthRange, { min: 10, max: 20 }, id);
    assert.strictEqual(object.weightPerRadius * object.size.min, 1600, id);
    assert.strictEqual(object.weightPerRadius * object.size.max, 3200, id);
  }
  // Nothing is in an entry without being used: no fixed health, no initial state, no placeholder.
  assert.deepStrictEqual(Object.keys(objects.rock), ["tags", "bodyIgnores", "name", "size", "weightPerRadius", "healthRange"]);
  assert.deepStrictEqual(Object.keys(objects.shroom), ["tags", "bodyIgnores", "name", "size", "weightPerRadius", "healthRange", "bounce"]); // only the Shroom bounces
  assert.deepStrictEqual(objects.shroom.bounce, { min: 0.2, max: 1 });
});

test("74 a size that is not whole, or has a min above the max, stops the game when it loads (for the rock and for the Shroom, each on its own)", () => {
  const rockSize = 'name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,';
  const shroomSize = 'name: "Shroom",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,';
  const patch = (original, name, size, weight) => (text) => text.replace(original, 'name: "' + name + '",\n      size: ' + size + ',\n      weightPerRadius: ' + weight + ',');
  for (const [original, name, id] of [[rockSize, "Rock", /object rock/], [shroomSize, "Shroom", /object shroom/]]) {
    assert.throws(() => loadGame(patch(original, name, "{ min: 16.5, max: 32 }", 100)), id);
    assert.throws(() => loadGame(patch(original, name, "{ min: 40, max: 32 }", 100)), id);
    assert.throws(() => loadGame(patch(original, name, "{ min: 16, max: 32 }", 99.5)), id);
    loadGame(patch(original, name, "{ min: 16, max: 32 }", 0)); // weight 0 is allowed
  }
});

test("75 everything is made by finalizeObject: an unknown type is refused, an object gets the radius the seed rolled, and the actor types are the avatar, the Dummy and the Biter", () => {
  const result = run(`
    const attempt = (type) => { try { finalizeObject(type, {}); return "ok"; } catch (error) { return error.message; } };
    const rock = finalizeObject("rock", { radius: 28, health: { now: 12, max: 12 }, position: { x: 1, y: 2 }, square: { x: 0, y: 0 } });
    return {
      actors: Object.keys(DEFINITIONS.actors),
      unknown: attempt("nope"),
      rock,
      avatar: createAvatar(createRun(1).blueprint).radius,
      fromSeed: JSON.stringify(objectsInArea(1, -960, -540, 960, 540)[0]),
    };
  `);
  assert.deepStrictEqual(plain(result.actors), ["avatar", "dummy", "biter"]);
  assert.match(result.unknown, /Unknown type: nope/);
  assert.deepStrictEqual(plain(result.rock), { type: "rock", position: { x: 1, y: 2 }, square: { x: 0, y: 0 }, radius: 28, health: { now: 12, max: 12 }, weight: 2800, bounce: 0, attacks: { bodySlam: { base: { blunt: 2800 * 0.001 }, now: { blunt: 2800 * 0.001 }, repeat: "contact", scale: "impact", ignores: ["enemy", "object"] } }, tags: ["object"] });
  assert.strictEqual(result.avatar, 16); // the avatar's radius is its recipe's base, through finalRadius
  assert.deepStrictEqual(JSON.parse(result.fromSeed), { type: "shroom", layer: "small", position: { x: 136, y: -375 }, square: { x: 0, y: -2 }, radius: 16, health: { now: 17, max: 17 }, weight: 1600, bounce: 0.2, attacks: { bodySlam: { base: { blunt: 1600 * 0.001 }, now: { blunt: 1600 * 0.001 }, repeat: "contact", scale: "impact", ignores: ["enemy", "object"] } }, tags: ["object"] }); // the seed's objects come out of the same function
});

test("76 the bounce of the Shroom grows in a straight line from 0.2 at radius 16 to 1 at radius 32; the rock has none", () => {
  const result = run(`
    const bounces = [];
    for (let radius = 16; radius <= 32; radius++) bounces.push(finalizeObject("shroom", { radius }).bounce);
    return { bounces, rock: finalizeObject("rock", { radius: 28 }).bounce };
  `);
  assert.ok(Math.abs(result.bounces[0] - 0.2) < 1e-9);
  assert.ok(Math.abs(result.bounces[8] - 0.6) < 1e-9); // radius 24
  assert.ok(Math.abs(result.bounces[16] - 1) < 1e-9);
  for (let i = 1; i < result.bounces.length; i++) {
    assert.ok(Math.abs(result.bounces[i] - result.bounces[i - 1] - 0.05) < 1e-9, "each pixel of radius adds 0.05"); // 0.8 / 16
  }
  assert.ok(Math.max(...result.bounces) <= 1 + 1e-9 && Math.min(...result.bounces) >= 0.2 - 1e-9);
  assert.strictEqual(result.rock, 0);
});

test("77 a bounce above 1 (it would eject, like a spring), a health range that is not whole or empty, or an object without a size, stops the game when it loads", () => {
  const shroomBounce = "bounce: { min: 0.2, max: 1 }";
  assert.throws(() => loadGame((text) => text.replace(shroomBounce, "bounce: { min: 0.2, max: 1.5 }")), /bounce of the object shroom/);
  assert.throws(() => loadGame((text) => text.replace(shroomBounce, "bounce: 2")), /bounce of the object shroom/);
  assert.throws(() => loadGame((text) => text.replace(shroomBounce, "bounce: { min: 0.8, max: 0.5 }")), /bounce of the object shroom/);
  const rockHealth = "healthRange: { min: 10, max: 20 }";
  assert.throws(() => loadGame((text) => text.replace(rockHealth, "healthRange: { min: 0, max: 20 }")), /healthRange of the object rock/);
  assert.throws(() => loadGame((text) => text.replace(rockHealth, "healthRange: { min: 10.5, max: 20 }")), /healthRange of the object rock/);
  assert.throws(() => loadGame((text) => text.replace(rockHealth, "healthRange: { min: 30, max: 20 }")), /healthRange of the object rock/);
  assert.throws(() => loadGame((text) => text.replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,', 'name: "Rock",\n      weightPerRadius: 100,')), /size of the object rock is missing/);
});


test("78 the rock and the Shroom share nothing: changing the size of one in the data leaves the other as it was", () => {
  const rockOnly = loadGame((text) => text.replace(
    'name: "Rock",\n      size: { min: 16, max: 32 },',
    'name: "Rock",\n      size: { min: 20, max: 40 },'));
  const sizes = plain(run("return { rock: DEFINITIONS.objects.rock.size, shroom: DEFINITIONS.objects.shroom.size };", rockOnly));
  assert.deepStrictEqual(sizes, { rock: { min: 20, max: 40 }, shroom: { min: 16, max: 32 } });
});

test("79 every final value is stored in the actor; the static ones are calculated once, when the actor is made, and the dynamic ones (the avatar's weight, top speed, resistance, dash speed) again every frame: a blueprint that changes in the middle of a run reaches only the dynamic ones", () => {
  const result = withBlueprints(`
    const s = createChamber1State(1, 1, full);
    const player = s.actors[0];
    const carried = () => ({ radius: player.radius, weight: player.weight, bounce: player.bounce, acceleration: player.acceleration, deceleration: player.deceleration,
      health: { ...player.health }, rechargeFrames: player.dash.rechargeFrames, charges: { ...player.dash.charges },
      speed: player.speed, resistance: { ...player.resistance }, dashSpeed: player.dash.speed });
    const atBirth = carried();
    step(s, { move: { x: 0, y: 0 } }, full);
    const afterStep = carried();
    // The run goes on with another blueprint: no Legs (they gave speed 3.5 and 10 blunt resistance, and weighed 1300 kg) and no Booster.
    const light = { parts: full.parts.filter((id) => id !== "legs" && id !== "booster") };
    step(s, { move: { x: 0, y: 0 } }, light);
    return { atBirth, afterStep, changed: carried() };
  `);
  const staticValues = { radius: 16, bounce: 0, acceleration: 0.25, deceleration: 0.125, health: { now: 100, max: 100 }, rechargeFrames: 240, charges: { now: 1, max: 1 } };
  assert.deepStrictEqual(plain(result.atBirth), { ...staticValues, weight: 5000, speed: 3, resistance: { blunt: 30, puncture: 10, slash: 0 }, dashSpeed: 12 });
  assert.deepStrictEqual(plain(result.afterStep), { ...staticValues, weight: 5000, speed: 3, resistance: { blunt: 30, puncture: 10, slash: 0 }, dashSpeed: 12 });
  // The dynamic ones follow: weight 5000 - 1300 - 200 = 3500 (the avatar's weight is dynamic since the ammunition weighs); speed 0.5 - 3500 x 0.0002 = -0.2, so 0; blunt resistance 20; no dash speed. The static ones stay as they were made.
  assert.deepStrictEqual(plain(result.changed), { ...staticValues, weight: 3500, speed: 0, resistance: { blunt: 20, puncture: 10, slash: 0 }, dashSpeed: 0 });
});

// ---- The Dummies ----
// Most of these tests use a game without objects (chancePercent 0), so the only collisions are the ones the test sets up.

const EMPTY = loadGame((text) => text.replace("chancePercent: 35", "chancePercent: 0"));

// A state with the avatar and only the Dummies of the given numbers, in the game without objects.
const ALONE = `
  function alone(...numbers) {
    const s = createChamber1State(1, 1);
    s.actors = [s.actors[0], ...numbers.map((n) => s.actors.find((actor) => actor.id === "dummy_" + n))];
    return s;
  }
  // Points a Dummy at an angle, already walking at its full speed (a Dummy is born still and speeds up; most tests want it cruising).
  function face(dummy, angle) { dummy.wander.angle = angle; setHeading(dummy); dummy.move.velocity.x = dummy.move.direction.x * dummy.speed; dummy.move.velocity.y = dummy.move.direction.y * dummy.speed; }
`;

test("80 the seed makes the Dummies (100 here), each inside its ranges (radius 8 to 16, health 100, speed from the recipe), born off the screen with the center inside the window, the same every time", () => {
  const result = run(`
    const s = createChamber1State(1, 7);
    const again = createChamber1State(1, 7);
    const other = createChamber1State(1, 8);
    const dummies = s.actors.filter((actor) => actor.wander);
    const width = s.grid.windowWidth * s.grid.cellSize;
    const height = s.grid.windowHeight * s.grid.cellSize;
    const avatar = s.actors[0].position;
    let bad = 0;
    const angles = new Set();
    const radii = new Set();
    for (const d of dummies) {
      if (!Number.isInteger(d.radius) || d.radius < 8 || d.radius > 16) bad++;
      if (d.health.now !== 100 || d.health.max !== 100) bad++;
      if (!Number.isInteger(d.wander.angle) || d.wander.angle < 0 || d.wander.angle > 359 || d.wander.turns !== 0) bad++;
      if (d.speed !== 2) bad++;
      if (d.move.velocity.x !== 0 || d.move.velocity.y !== 0) bad++; // born still
      if (Math.abs(Math.hypot(d.move.direction.x, d.move.direction.y) - 1) > 1e-9) bad++; // and wanting to walk at its angle
      if (d.acceleration !== 0.125 || d.deceleration !== 0.0625) bad++;
      const dx = Math.abs(d.position.x - avatar.x);
      const dy = Math.abs(d.position.y - avatar.y);
      if (dx >= width / 2 || dy >= height / 2) bad++; // the center inside the window (the wrap rule)
      if (dx < s.grid.screenWidth / 2 + d.radius && dy < s.grid.screenHeight / 2 + d.radius) bad++; // the whole body off the screen
      angles.add(d.wander.angle);
      radii.add(d.radius);
    }
    return {
      count: dummies.length,
      first: dummies[0].id,
      last: dummies[dummies.length - 1].id,
      bad,
      angles: angles.size,
      radii: radii.size,
      same: JSON.stringify(s) === JSON.stringify(again),
      differs: JSON.stringify(s.actors) !== JSON.stringify(other.actors),
    };
  `, WITH_DUMMIES);
  assert.strictEqual(result.count, 100);
  assert.deepStrictEqual([result.first, result.last], ["dummy_0", "dummy_99"]);
  assert.strictEqual(result.bad, 0);
  assert.ok(result.angles > 50, "the angles are not varied: " + result.angles);
  assert.ok(result.radii >= 8, "the radii are not varied: " + result.radii); // 8 to 16 has 9 values
  assert.ok(result.same, "the same seed must give the same Dummies");
  assert.ok(result.differs, "another seed must give other Dummies");
});

test("81 birth: every point of the ring between the screen and the edge of the window is used (all four strips, over 20 seeds), nothing is born on the screen, no free place is searched (overlaps at birth happen) and the push separates them", () => {
  const result = run(`
    const strips = { left: 0, right: 0, above: 0, below: 0 };
    let onScreen = 0;
    let bornOverlapping = 0;
    let stillOverlapping = 0;
    const overlapping = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < a.radius + b.radius - 1e-9;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createChamber1State(1, seed);
      const dummies = s.actors.filter((actor) => actor.wander);
      for (const d of dummies) {
        const dx = d.position.x - s.actors[0].position.x;
        const dy = d.position.y - s.actors[0].position.y;
        if (Math.abs(dx) < s.grid.screenWidth / 2 + d.radius && Math.abs(dy) < s.grid.screenHeight / 2 + d.radius) onScreen++;
        else if (dx <= -s.grid.screenWidth / 2 - d.radius) strips.left++;
        else if (dx >= s.grid.screenWidth / 2 + d.radius) strips.right++;
        else if (dy < 0) strips.above++;
        else strips.below++;
      }
      const pairs = [];
      for (let i = 0; i < dummies.length; i++) for (let j = i + 1; j < dummies.length; j++) if (overlapping(dummies[i], dummies[j])) pairs.push([dummies[i], dummies[j]]);
      bornOverlapping += pairs.length;
      for (let frame = 0; frame < 30; frame++) step(s, { move: { x: 0, y: 0 } });
      stillOverlapping += pairs.filter(([a, b]) => overlapping(a, b)).length;
    }
    return { strips, onScreen, bornOverlapping, stillOverlapping };
  `, WITH_DUMMIES);
  assert.strictEqual(result.onScreen, 0);
  for (const strip of ["left", "right", "above", "below"]) assert.ok(result.strips[strip] > 0, "nobody was born " + strip + ": " + JSON.stringify(result.strips));
  assert.ok(result.bornOverlapping > 0, "no pair was born overlapping, so the rule (no search for a free place) was not exercised");
  assert.strictEqual(result.stillOverlapping, 0); // the push of the collision separated every pair born on top of each other
});

test("82 without a collision a Dummy walks in a straight line at its own speed, and keeps its angle", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const d = s.actors[1];
    face(d, 37);
    d.position.x = 600; d.position.y = 100;
    const start = { x: d.position.x, y: d.position.y };
    const velocity = { x: d.move.velocity.x, y: d.move.velocity.y };
    for (let i = 0; i < 60; i++) step(s, { move: { x: 0, y: 0 } });
    return { dx: d.position.x - start.x, dy: d.position.y - start.y, expectedX: 60 * velocity.x, expectedY: 60 * velocity.y, angle: d.wander.angle, turns: d.wander.turns, speed: Math.hypot(d.move.velocity.x, d.move.velocity.y) };
  `, EMPTY);
  assert.ok(Math.abs(result.dx - result.expectedX) < 1e-9 && Math.abs(result.dy - result.expectedY) < 1e-9);
  assert.deepStrictEqual([result.angle, result.turns], [37, 0]);
  assert.ok(Math.abs(result.speed - 2) < 1e-9);
});

test("83 at a collision with an object the Dummy is pushed out and picks a new angle from the seed, hash(seed, number, turns) % 360, and nobody is hurt (the body slam only hurts against the avatar)", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const d = s.actors[1];
    face(d, 90); // walking down (y grows downward), toward the rock at ${ROCK.x},${ROCK.y}
    d.position.x = ${ROCK.x}; d.position.y = ${ROCK.y} - ${ROCK.radius} - d.radius - 30;
    let frames = 0;
    while (d.wander.turns === 0 && frames < 60) { step(s, { move: { x: 0, y: 0 } }); frames++; }
    const hitRock = s.contacts.includes("dummy_0|rock ${ROCK.key}");
    const distance = Math.hypot(d.position.x - ${ROCK.x}, d.position.y - ${ROCK.y});
    return {
      frames, hitRock, turns: d.wander.turns, angle: d.wander.angle, expected: hashInts(1, 0, 1, 16) % 360,
      gap: distance - (d.radius + ${ROCK.radius}), damaged: JSON.stringify(s.damagedObjects), health: d.health.now, weight: d.weight,
      length: Math.hypot(d.move.direction.x, d.move.direction.y),
    };
  `, WITH_DUMMIES);
  assert.ok(result.hitRock, "the first collision was not with the rock");
  assert.strictEqual(result.turns, 1);
  assert.strictEqual(result.angle, result.expected);
  assert.ok(result.gap > -1e-9, "the Dummy is still inside the rock: " + result.gap);
  // The impact is the speed of the Dummy toward the rock (2), enough for a collision, but a Dummy against an object is not
  // a pair that hurts (the user's rule: only against the avatar), so the rock keeps its health and so does the Dummy.
  assert.strictEqual(result.damaged, "{}");
  assert.strictEqual(result.health, 100);
  assert.ok(Math.abs(result.length - 1) < 1e-9);
});

test("84 every new angle is rolled from hash(seed, number, turns): the same sequence for the same Dummy, whole degrees from 0 to 359, and varied", () => {
  const result = run(`
    const s = createChamber1State(1, 1);
    const d = s.actors.find((actor) => actor.id === "dummy_3");
    const angles = [];
    for (let i = 0; i < 40; i++) { turnDummy(s, d); angles.push(d.wander.angle); }
    const expected = [];
    for (let turns = 1; turns <= 40; turns++) expected.push(hashInts(1, 3, turns, 16) % 360);
    return { angles, expected, turns: d.wander.turns, length: Math.hypot(d.move.direction.x, d.move.direction.y), distinct: new Set(angles).size };
  `, WITH_DUMMIES);
  assert.deepStrictEqual(result.angles, result.expected);
  assert.strictEqual(result.turns, 40);
  assert.ok(result.angles.every((angle) => Number.isInteger(angle) && angle >= 0 && angle <= 359));
  assert.ok(result.distinct > 20, "the angles are not varied: " + result.distinct);
  assert.ok(Math.abs(result.length - 1) < 1e-9);
});

test("85 only a NEW contact turns and hurts: a pair that was touching in the last frame still pushes the two apart (by weight), but the angle stays and nobody is hurt", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const d = s.actors[1];
    const avatar = s.actors[0];
    const key = "dummy_0|" + AVATAR_ID;
    const overlap = () => { d.position.x = avatar.position.x + 16 + d.radius - 5; d.position.y = avatar.position.y; };
    overlap();
    face(d, 180); // walking toward the avatar
    const blueprint = createRun(1).blueprint;
    touchActors(s, [key], d, avatar, key); // was touching: no new angle, no hit
    const kept = d.wander.turns;
    const healthKept = [d.health.now, avatar.health.now];
    const gap = Math.hypot(d.position.x - avatar.position.x, d.position.y - avatar.position.y) - (16 + d.radius);
    const avatarPushed = avatar.position.x; // the avatar's share of the 5 px overlap: the Dummy's weight over the sum
    overlap();
    touchActors(s, [], d, avatar, key); // new contact: a new angle, and a hit
    return { kept, healthKept, health: [d.health.now, avatar.health.now], turned: d.wander.turns, gap, avatarPushed, expectedPush: -5 * d.weight / (d.weight + avatar.weight), contacts: s.contacts };
  `, EMPTY);
  assert.strictEqual(result.kept, 0);
  assert.deepStrictEqual(plain(result.healthKept), [100, 100]); // no hit while the pair was already touching
  assert.strictEqual(result.turned, 1);
  // The new contact is a hit at impact 2: the avatar (5000 kg) hits for 5000 x 0.001 x 2 / 6 = 1.667, the Dummy for less than the
  // avatar's defense (3), so the minimum of 1.
  assert.ok(Math.abs(result.health[0] - (100 - 5000 * 0.001 * 2 / 6)) < 1e-9 && result.health[1] === 99);
  assert.ok(Math.abs(result.gap) < 1e-9, "the pair was not pushed to just touching: " + result.gap);
  assert.ok(Math.abs(result.avatarPushed - result.expectedPush) < 1e-9, "the avatar moved " + result.avatarPushed + ", not its share " + result.expectedPush);
  assert.deepStrictEqual(plain(result.contacts), ["dummy_0|avatar_1", "dummy_0|avatar_1"]);
});

test("86 two Dummies that collide are pushed apart by weight (the lighter moves more), both pick a new angle, and neither is hurt", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0, 1);
    const [, a, b] = s.actors;
    face(a, 0); face(b, 180); // toward each other
    a.position.x = 600; a.position.y = 0;
    b.position.x = 600 + a.radius + b.radius - 10; b.position.y = 0;
    const before = { a: a.position.x, b: b.position.x };
    step(s, { move: { x: 0, y: 0 } });
    // In the step each walked 2 px toward the other, then the push split the overlap (10 + 4) by weight.
    const movedA = a.position.x - (before.a + 2);
    const movedB = b.position.x - (before.b - 2);
    return {
      turns: [a.wander.turns, b.wander.turns],
      gap: Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) - (a.radius + b.radius),
      movedA, movedB, weights: [a.weight, b.weight],
      contacts: s.contacts,
      health: [a.health.now, b.health.now],
    };
  `, EMPTY);
  assert.deepStrictEqual(plain(result.turns), [1, 1]);
  assert.deepStrictEqual(plain(result.health), [100, 100]); // they close in at 2 + 2 = 4, a collision, but two Dummies never hurt each other
  assert.ok(Math.abs(result.gap) < 1e-9, "not just touching: " + result.gap);
  const [wa, wb] = result.weights;
  assert.ok(wa !== wb, "the two Dummies of seed 1 should weigh differently for this test to prove the split");
  assert.ok(Math.abs(result.movedA / result.movedB + wb / wa) < 1e-9, "the push was not split by weight: " + result.movedA + " and " + result.movedB + " for weights " + wa + " and " + wb); // a moves back by wb/(wa+wb), b by wa/(wa+wb)
  assert.deepStrictEqual(plain(result.contacts), ["dummy_0|dummy_1"]);
});

test("87 a Dummy that bumps into the avatar hurts it and is hurt by it, turns, and the two are pushed apart by weight: the heavy avatar barely moves", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const [avatar, d] = s.actors;
    face(d, 180);
    d.position.x = avatar.position.x + 16 + d.radius + 1; d.position.y = avatar.position.y;
    step(s, { move: { x: 0, y: 0 } });
    // The Dummy walked 2 px into the avatar (1 px gap, so an overlap of 1): the avatar takes weight / (weight + 5000) of it, to the left.
    return { turns: d.wander.turns, gap: Math.hypot(d.position.x - avatar.position.x, d.position.y - avatar.position.y) - (16 + d.radius), avatarX: avatar.position.x, expectedX: -1 * d.weight / (d.weight + 5000), health: avatar.health.now, dummyHealth: d.health.now };
  `, EMPTY);
  assert.strictEqual(result.turns, 1);
  assert.ok(Math.abs(result.dummyHealth - (100 - 5000 * 0.001 * 2 / 6)) < 1e-9, "the Dummy health is " + result.dummyHealth); // the avatar hits for 1.667
  assert.ok(Math.abs(result.gap) < 1e-9);
  assert.ok(Math.abs(result.avatarX - result.expectedX) < 1e-9, "the avatar moved " + result.avatarX + " and its share is " + result.expectedX);
  assert.ok(result.avatarX < 0 && result.avatarX > -0.25, "a Dummy of 800 to 1600 kg moves a 5000 kg mecha by less than a quarter of the overlap: " + result.avatarX);
  assert.strictEqual(result.health, 99); // the Dummy's attack is below the defense (3), so the minimum damage of 1
});

test("88 leaving the window of the grid on one side brings a Dummy back on the opposite side, in both axes, around the avatar wherever it is", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const [avatar, d] = s.actors;
    const width = s.grid.windowWidth * s.grid.cellSize;
    const height = s.grid.windowHeight * s.grid.cellSize;
    const after = (dx, dy, px = 0, py = 0) => {
      avatar.position.x = px; avatar.position.y = py;
      d.position.x = px + dx; d.position.y = py + dy;
      wrapIntoWindow(d, avatar, s.grid);
      return { x: d.position.x - px, y: d.position.y - py };
    };
    const cases = {
      left: after(-width / 2 - 1, 0),
      right: after(width / 2, 0),
      up: after(0, -height / 2 - 1),
      down: after(0, height / 2),
      insideLeft: after(-width / 2, 0), // exactly on the edge: still inside
      awayFromStart: after(-width / 2 - 1, 10, 1000, -500),
    };
    // Through step: walking left across the edge keeps the angle and the speed.
    face(d, 180);
    avatar.position.x = 0; avatar.position.y = 0;
    d.position.x = -width / 2 + 1; d.position.y = 0;
    step(s, { move: { x: 0, y: 0 } });
    return { width, height, cases, throughStep: { x: d.position.x, angle: d.wander.angle, turns: d.wander.turns, vx: d.move.velocity.x } };
  `, EMPTY);
  const { width, height, cases } = result;
  assert.deepStrictEqual(plain(cases.left), { x: width / 2 - 1, y: 0 });
  assert.deepStrictEqual(plain(cases.right), { x: -width / 2, y: 0 });
  assert.deepStrictEqual(plain(cases.up), { x: 0, y: height / 2 - 1 });
  assert.deepStrictEqual(plain(cases.down), { x: 0, y: -height / 2 });
  assert.deepStrictEqual(plain(cases.insideLeft), { x: -width / 2, y: 0 });
  assert.deepStrictEqual(plain(cases.awayFromStart), { x: width / 2 - 1, y: 10 });
  assert.ok(Math.abs(result.throughStep.x - (width / 2 - 1)) < 1e-9, "x after the step: " + result.throughStep.x);
  assert.deepStrictEqual([result.throughStep.angle, result.throughStep.turns], [180, 0]);
  assert.ok(Math.abs(result.throughStep.vx + 2) < 1e-9);
});

test("89 the sine and cosine of whole degrees (own series, no Math.sin): unit length, the known values, and negative degrees", () => {
  const result = run(`
    let worst = 0;
    for (let degrees = 0; degrees < 360; degrees++) {
      worst = Math.max(worst, Math.abs(Math.hypot(cosDegrees(degrees), sinDegrees(degrees)) - 1));
    }
    return {
      worst,
      sin: [0, 30, 90, 180, 270, -30, 390].map(sinDegrees),
      cos: [0, 60, 90, 180, 270].map(cosDegrees),
    };
  `);
  assert.ok(result.worst < 1e-10, "length error " + result.worst);
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, actual + " is not " + expected);
  [0, 0.5, 1, 0, -1, -0.5, 0.5].forEach((expected, i) => near(result.sin[i], expected));
  [1, 0.5, 0, -1, 0].forEach((expected, i) => near(result.cos[i], expected));
});

test("90 after 600 frames of play every Dummy is still inside the window around the avatar, the Dummies did collide, only what touched the avatar was hurt, nobody has less than 0, and the state is still plain JSON", () => {
  const result = run(`
    const s = createChamber1State(1, 1);
    let outside = 0;
    const touchedAvatar = new Set(); // the ids of the Dummies and the keys of the objects that were ever in contact with the avatar
    for (let frame = 0; frame < 600; frame++) {
      step(s, { move: { x: 1, y: 0 } });
      for (const contact of s.contacts) {
        const [a, b] = contact.split("|");
        if (a === AVATAR_ID) touchedAvatar.add(b.split(" ")[1]);
        if (b === AVATAR_ID) touchedAvatar.add(a);
      }
      if (frame % 100 === 99) {
        const width = s.grid.windowWidth * s.grid.cellSize;
        const height = s.grid.windowHeight * s.grid.cellSize;
        for (const d of s.actors.filter((actor) => actor.wander)) {
          const dx = d.position.x - s.actors[0].position.x;
          const dy = d.position.y - s.actors[0].position.y;
          if (!(dx >= -width / 2 && dx < width / 2 && dy >= -height / 2 && dy < height / 2)) outside++;
          if (!Number.isFinite(d.position.x) || !Number.isFinite(d.position.y)) outside++;
        }
      }
    }
    const dummies = s.actors.filter((actor) => actor.wander);
    const hurtDummies = dummies.filter((d) => d.health.now < 100).map((d) => d.id);
    const hurtObjects = Object.keys(s.damagedObjects);
    return {
      outside,
      turns: dummies.reduce((sum, d) => sum + d.wander.turns, 0),
      hurt: hurtDummies.length + hurtObjects.length,
      hurtWithoutAvatar: [...hurtDummies, ...hurtObjects].filter((id) => !touchedAvatar.has(id)),
      fine: dummies.every((d) => d.health.now >= 0 && Number.isFinite(d.health.now)),
      json: JSON.stringify(s),
    };
  `, WITH_DUMMIES);
  assert.strictEqual(result.outside, 0);
  assert.ok(result.turns > 20, "the Dummies hardly collided: " + result.turns);
  assert.ok(result.hurt > 0, "nothing was hurt, so the rule was not exercised");
  assert.deepStrictEqual(plain(result.hurtWithoutAvatar), []); // the body slam hurts only against the avatar
  assert.ok(result.fine);
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json);
});

test("91 a run with 100 Dummies is reproducible: the same inputs give the same state, and the cross-check of the replay is clean", () => {
  const result = run(`
    const play = () => {
      const s = createChamber1State(1, 3);
      const h = createHistory(s, createRun(1).blueprint);
      for (let frame = 0; frame < 300; frame++) {
        const input = { move: { x: frame % 120 < 60 ? 1 : 0, y: frame % 90 < 45 ? 1 : -1 } };
        step(s, input);
        recordFrame(h, s, input);
      }
      return { json: JSON.stringify(s), check: crossCheck(h) };
    };
    const first = play();
    const second = play();
    return { same: first.json === second.json, check: first.check };
  `, WITH_DUMMIES);
  assert.ok(result.same, "two runs with the same inputs ended differently");
  assert.strictEqual(result.check, null);
});

test("92 the speed of a Dummy comes from its recipe through finalSpeed (and a thing without a speed has 0); a speed that is not above 0 stops the game when it loads", () => {
  const patch = (speed) => (text) => text.replace("      speed: 2,\n", "      speed: " + speed + ",\n");
  assert.throws(() => loadGame(patch(0)), /speed of the actor dummy.*0/);
  assert.throws(() => loadGame(patch(-1)), /speed of the actor dummy/);
  const fast = loadGame(patch(3));
  const result = run(`
    const s = createChamber1State(1, 1);
    const d = s.actors[1];
    s.actors = [s.actors[0], d];
    for (let frame = 0; frame < 24; frame++) step(s, { move: { x: 0, y: 0 } }); // 3 / 0.125 = 24 frames to its top speed
    return { speed: d.speed, length: Math.hypot(d.move.velocity.x, d.move.velocity.y), final: finalSpeed(d), none: finalSpeed({ id: "x_1", type: "rock" }) };
  `, fast);
  assert.strictEqual(result.speed, 3);
  assert.ok(Math.abs(result.length - 3) < 1e-9);
  assert.strictEqual(result.final, 3);
  assert.strictEqual(result.none, 0);
});

test("93 a contact below the minimum impact (two Dummies side by side at the same velocity) still turns both Dummies, but hurts no one", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0, 1);
    const [, a, b] = s.actors;
    face(a, 0); face(b, 0); // the same velocity: they do not close in on each other
    a.position.x = 600; a.position.y = 0;
    b.position.x = 600 + a.radius + b.radius - 0.5; b.position.y = 0;
    step(s, { move: { x: 0, y: 0 } });
    return { turns: [a.wander.turns, b.wander.turns], health: [a.health.now, b.health.now] };
  `, EMPTY);
  assert.deepStrictEqual(plain(result.turns), [1, 1]);
  assert.deepStrictEqual(plain(result.health), [100, 100]);
});

test("94 a Dummy cannot break an object: a rock with 1 health left keeps it, and the Dummy is pushed out and turns like at any contact", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const d = s.actors[1];
    face(d, 90); // down, toward the rock at ${ROCK.x},${ROCK.y}
    d.position.x = ${ROCK.x}; d.position.y = ${ROCK.y} - ${ROCK.radius} - d.radius - 30;
    s.damagedObjects["${ROCK.key}"] = 1; // one hit of the avatar would break it
    let frames = 0;
    while (d.wander.turns === 0 && frames < 60) { step(s, { move: { x: 0, y: 0 } }); frames++; }
    const gap = Math.hypot(d.position.x - ${ROCK.x}, d.position.y - ${ROCK.y}) - (d.radius + ${ROCK.radius});
    return { turns: d.wander.turns, health: d.health.now, rock: s.damagedObjects["${ROCK.key}"], gap, hitRock: s.contacts.includes("dummy_0|rock ${ROCK.key}") };
  `, WITH_DUMMIES);
  assert.ok(result.hitRock, "the first collision was not with the rock");
  assert.strictEqual(result.rock, 1); // still 1: a Dummy does not hurt an object
  assert.strictEqual(result.health, 100); // and the object does not hurt a Dummy
  assert.strictEqual(result.turns, 1);
  assert.ok(result.gap > -1e-9, "the Dummy is still inside the rock: " + result.gap);
});

// The old way, kept here as the reference: every Dummy against every object near it, the avatar, and every Dummy after
// it in the list, in that order. The grid of the game must give exactly the same state.
const EVERY_PAIR = `
  const everyPair = (state, lastContacts, blueprint) => {
    const player = state.actors.find((actor) => actor.id === AVATAR_ID);
    const dummies = state.actors.filter((actor) => actor.wander);
    for (let i = 0; i < dummies.length; i++) {
      const dummy = dummies[i];
      touchActors(state, lastContacts, dummy, player, dummy.id + "|" + AVATAR_ID, blueprint);
      for (let j = i + 1; j < dummies.length; j++) touchActors(state, lastContacts, dummy, dummies[j], dummy.id + "|" + dummies[j].id, blueprint);
    }
  };
  // Plays "frames" steps of a state made by "make", with the grid or with every pair, and returns the state as text.
  // The cells are left out of the comparison of every pair only when it does not write them (it never pushes through
  // refreshCells), so both sides write all the cells again before the text is made.
  const playWith = (make, frames, useEveryPair, input = () => ({ move: { x: 0, y: 0 } })) => {
    const real = collideActors;
    if (useEveryPair) collideActors = everyPair;
    try {
      const s = make();
      for (let frame = 0; frame < frames; frame++) step(s, input(frame));
      for (const actor of s.actors) setCells(actor, s.grid);
      return JSON.stringify(s);
    } finally {
      collideActors = real;
    }
  };
  const turnsIn = (json) => JSON.parse(json).actors.reduce((sum, actor) => sum + (actor.wander ? actor.wander.turns : 0), 0);
`;

test("95 the collision grid finds the same collisions as testing every pair of Dummies: the same state after 200 frames, for cells much smaller and much larger than a Dummy", () => {
  const result = run(`
    ${EVERY_PAIR}
    const make = (cellSize) => () => {
      const s = createChamber1State(1, 2);
      s.grid = { cellSize, windowWidth: 3900 / cellSize, windowHeight: 2100 / cellSize };
      for (const actor of s.actors) setCells(actor, s.grid);
      return s;
    };
    const reference = playWith(make(60), 200, true);
    return { same: [12, 20, 60, 100, 300].map((size) => playWith(make(size), 200, false) === playWith(make(size), 200, true)), turns: turnsIn(reference) };
  `, WITH_DUMMIES);
  assert.deepStrictEqual(plain(result.same), [true, true, true, true, true]); // no cell size loses a collision
  assert.ok(result.turns > 20, "the Dummies hardly collided, so the comparison proves little: " + result.turns);
});

test("96 an actor covers the rectangle of cells its circle reaches: one cell when it fits, two or four over a border, many when it is huge; a point covers one", () => {
  const result = run(`
    const s = createChamber1State();
    const cellsAt = (x, y, radius) => {
      const actor = { radius, position: { x, y }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } };
      setCells(actor, s.grid);
      return actor.cells;
    };
    return {
      fits: cellsAt(0, 0, 16),
      overRight: cellsAt(20, 0, 16), // reaches 36, past the border at 32
      overCorner: cellsAt(20, 20, 16),
      justInside: cellsAt(15.9, 0, 16), // reaches 31.9
      point: cellsAt(100, -70, 0),
      huge: cellsAt(0, 0, 256), // from -256 to 256
      hugeAway: cellsAt(1000, -500, 256), // the same size, elsewhere in the world
    };
  `);
  assert.deepStrictEqual(plain(result.fits), { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
  assert.deepStrictEqual(plain(result.overRight), { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } });
  assert.deepStrictEqual(plain(result.overCorner), { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } });
  assert.deepStrictEqual(plain(result.justInside), { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
  assert.deepStrictEqual(plain(result.point), { from: { x: 2, y: -1 }, to: { x: 2, y: -1 } });
  assert.deepStrictEqual(plain(result.huge), { from: { x: -4, y: -4 }, to: { x: 4, y: 4 } }); // 9 x 9 = 81 cells
  assert.deepStrictEqual(plain(result.hugeAway), { from: { x: 12, y: -12 }, to: { x: 20, y: -4 } }); // also 9 x 9
});

test("97 two circles that overlap always share a cell, whatever their sizes and the size of the cell (20000 pairs, radii 1 to 300)", () => {
  const result = run(`
    let overlapping = 0;
    let missed = 0;
    for (const cellSize of [16, 64, 300]) {
      const grid = { cellSize };
      for (let n = 0; n < 20000; n++) {
        const make = (salt) => {
          const actor = {
            radius: 1 + (hashInts(n, cellSize, 1, salt) % 300),
            position: { x: (hashInts(n, cellSize, 2, salt) % 1200) - 600, y: (hashInts(n, cellSize, 3, salt) % 1200) - 600 },
            cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
          };
          setCells(actor, grid);
          return actor;
        };
        const a = make(1);
        const b = make(2);
        const reach = a.radius + b.radius;
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        if (dx * dx + dy * dy >= reach * reach) continue;
        overlapping++;
        if (!shareCell(a.cells, b.cells)) missed++;
      }
    }
    return { overlapping, missed };
  `);
  assert.ok(result.overlapping > 5000, "too few overlapping pairs to prove anything: " + result.overlapping);
  assert.strictEqual(result.missed, 0);
});

test("98 huge Dummies (radius 128 and 256) among the others collide like everything else: the same state as testing every pair, with the cell of the game", () => {
  const result = run(`
    ${EVERY_PAIR}
    const make = () => {
      const s = createChamber1State(1, 2);
      const dummies = s.actors.filter((actor) => actor.wander);
      dummies[0].radius = 256; // the code reads the radius from the actor
      dummies[1].radius = 128;
      dummies[2].radius = 128;
      for (const actor of s.actors) setCells(actor, s.grid);
      return s;
    };
    const grid = playWith(make, 200, false);
    const every = playWith(make, 200, true);
    const start = make().actors[1].cells;
    const giant = JSON.parse(grid).actors[1];
    return { same: grid === every, cellsAcross: start.to.x - start.from.x + 1, cellsDown: start.to.y - start.from.y + 1, giantTurns: giant.wander.turns, turns: turnsIn(grid) };
  `, WITH_DUMMIES);
  assert.ok(result.same, "the grid lost a collision of a huge Dummy");
  assert.ok(result.cellsAcross >= 8 && result.cellsAcross <= 9 && result.cellsDown >= 8 && result.cellsDown <= 9, "a radius of 256 covers 8 or 9 cells each way: " + result.cellsAcross + " x " + result.cellsDown);
  assert.ok(result.giantTurns > 3, "the huge Dummy hardly collided: " + result.giantTurns);
});

test("99 a Dummy pushed into a third one in the same step still finds it (its cells are written again at once)", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0, 1, 2);
    const [avatar, a, b, c] = s.actors;
    // All three walk down at the same velocity, so only the places matter. The border between two cells is at x = 608.
    // b ends half a pixel before the border and c starts half a pixel after it: they do not touch and share no cell.
    // a overlaps b by 10 from the left, so b is pushed 5 to the right, over the border and into c.
    for (const d of [a, b, c]) { d.radius = 16; face(d, 90); d.position.y = 0; }
    a.position.x = 569.5; b.position.x = 591.5; c.position.x = 624.5;
    for (const actor of s.actors) setCells(actor, s.grid);
    const sharedBefore = shareCell(b.cells, c.cells);
    step(s, { move: { x: 0, y: 0 } });
    return { sharedBefore, contacts: s.contacts, turns: [a.wander.turns, b.wander.turns, c.wander.turns], bCells: b.cells };
  `, EMPTY);
  assert.strictEqual(result.sharedBefore, false);
  assert.deepStrictEqual(plain(result.contacts), ["dummy_0|dummy_1", "dummy_1|dummy_2"]);
  assert.deepStrictEqual(plain(result.turns), [1, 2, 1]); // b turned twice: once for each collision
});

test("100 the cells stored in the actors are right at the start and after every step, pushes and wraps included", () => {
  const result = run(`
    const s = createChamber1State(1, 4);
    const wrong = () => {
      let count = 0;
      for (const actor of s.actors) {
        const expected = {
          from: { x: cellIndex(actor.position.x - actor.radius, 64), y: cellIndex(actor.position.y - actor.radius, 64) },
          to: { x: cellIndex(actor.position.x + actor.radius, 64), y: cellIndex(actor.position.y + actor.radius, 64) },
        };
        if (JSON.stringify(actor.cells) !== JSON.stringify(expected)) count++;
      }
      return count;
    };
    const atStart = wrong();
    let later = 0;
    for (let frame = 0; frame < 300; frame++) {
      step(s, { move: { x: 1, y: frame % 2 ? 1 : 0 } });
      later += wrong();
    }
    const turns = s.actors.reduce((sum, actor) => sum + (actor.wander ? actor.wander.turns : 0), 0);
    const spread = s.actors.filter((actor) => actor.wander && (actor.cells.from.x !== actor.cells.to.x || actor.cells.from.y !== actor.cells.to.y)).length;
    return { atStart, later, turns, spread };
  `, WITH_DUMMIES);
  assert.strictEqual(result.atStart, 0);
  assert.strictEqual(result.later, 0);
  assert.ok(result.turns > 20 && result.spread > 5, "too little happened to prove it: " + result.turns + " turns, " + result.spread + " Dummies over a border");
});

// ---- The largest actor ----
// The user's rule: an actor wraps when its center leaves the window of the grid, and that jump must never be seen. So
// no recipe may allow an actor with a radius above the smallest space between the screen and the edge of the window.

// The size of the screen as the page has it: the canvas written in index.html. The rules carry their own copy in
// state.grid (screenWidth, screenHeight); test 101 checks that the two agree.
function screenSize() {
  const html = fs.readFileSync(path.join(SRC, "..", "index.html"), "utf8");
  const canvas = html.match(/<canvas id="canvas" width="(\d+)" height="(\d+)"/);
  assert.ok(canvas, "the canvas and its size were not found in index.html");
  return { width: Number(canvas[1]), height: Number(canvas[2]) };
}

// The actor recipes of a game that allow a radius above the margin, as text ("dummy: 600 > 580"). Empty if none.
function actorsTooLarge(game) {
  return run(`
    const grid = createChamber1State().grid;
    const margin = Math.min((grid.windowWidth * grid.cellSize - grid.screenWidth) / 2, (grid.windowHeight * grid.cellSize - grid.screenHeight) / 2);
    const tooLarge = [];
    for (const [id, recipe] of Object.entries(DEFINITIONS.actors)) {
      const largest = recipe.size ? recipe.size.max : recipe.radius;
      if (!(largest <= margin)) tooLarge.push(id + ": " + largest + " > " + margin);
    }
    return { margin, tooLarge, actors: Object.keys(DEFINITIONS.actors).length };
  `, game);
}

test("101 no recipe in the definitions allows an actor larger than the space between the screen and the edge of the window (580), so a wrap is never seen", () => {
  const page = screenSize();
  const rules = run("const grid = createChamber1State().grid; return { width: grid.screenWidth, height: grid.screenHeight };");
  assert.deepStrictEqual(plain(rules), page); // the rules and the page agree on the size of the screen
  const real = actorsTooLarge(context);
  assert.strictEqual(real.margin, 580); // (35 x 64 - 1080) / 2 up and down; across it is (61 x 64 - 1920) / 2 = 992
  assert.ok(real.actors >= 2, "the avatar and the Dummy must both be looked at");
  assert.deepStrictEqual(plain(real.tooLarge), []);

  // The check can fail: a Dummy recipe that goes up to 581 is caught, and one that goes up to exactly 580 is not.
  const withSize = (max) => loadGame((text) => {
    const patched = text.replace(/dummies: \{ count: \d+ \}/, "dummies: { count: 0 }").replace("size: { min: 8, max: 16 },", "size: { min: 8, max: " + max + " },");
    assert.ok(patched.includes("max: " + max + " }"), "the patch of the Dummy size should apply");
    return patched;
  });
  assert.deepStrictEqual(plain(actorsTooLarge(withSize(581)).tooLarge), ["dummy: 581 > 580"]);
  assert.deepStrictEqual(plain(actorsTooLarge(withSize(580)).tooLarge), []);
});

// ---- Layers of the ground ----
// The real definitions have only the layer "small". These tests build other layers in a patched copy of the data, to prove that
// the game is ready for huge things that live in the seed (the user's idea): the patch adds an object "giant" (radius 200 to 256)
// and a layer "huge" with a square of 2048 where every square has one.

// Replaces text in the data and fails loudly if it is not found exactly once (a patch that does not apply proves nothing).
function patchOnce(text, from, to) {
  assert.strictEqual(text.split(from).length - 1, 1, "the patch should apply once: " + from);
  return text.replace(from, to);
}

const AFTER_SMALL = "        },\n      },\n    },\n\n    // The Dummies of Chamber 1";
const HUGE_LAYER = (square, kind = "giant") => `        },\n        huge: { cellSize: ${square}, chancePercent: 100, safeRadius: 0, kinds: ["${kind}"] },\n      },\n    },\n\n    // The Dummies of Chamber 1`;
const GIANT = '    giant: { tags: ["object"], bodyIgnores: ["enemy", "object"], name: "Giant", size: { min: 200, max: 256 }, weightPerRadius: 100, healthRange: { min: 10, max: 20 } },\n    rock: {';

function withHugeLayer(square = 2048) {
  return loadGame((text) => {
    let patched = patchOnce(text, "    rock: {", GIANT);
    patched = patchOnce(patched, AFTER_SMALL, HUGE_LAYER(square));
    return patchOnce(patched, "dummies: { count: 1000 }", "dummies: { count: 0 }");
  });
}

function loadError(patch) {
  try {
    loadGame(patch);
  } catch (error) {
    return error.message;
  }
  return null;
}

test("102 a layer that cannot be made is refused when the definitions load: an object that does not fit in its square, an unknown kind, no kinds, a chance above 100, two layers with the same square", () => {
  const small = (change) => (text) => patchOnce(text, change.from, change.to);
  const fit = (size) => small({ from: "cellSize: 256, // guess: the world", to: "cellSize: " + size + ", // guess: the world" });
  assert.match(loadError(fit(64)), /above twice its largest radius, 64/); // radius 32 x 2 = 64: no room left for the center
  assert.strictEqual(loadError(fit(65)), null); // one pixel of room is enough
  assert.match(loadError(small({ from: 'kinds: ["rock", "shroom"]', to: 'kinds: ["rock", "nothing"]' })), /nothing, which is not an object/);
  assert.match(loadError(small({ from: 'kinds: ["rock", "shroom"]', to: "kinds: []" })), /at least one object/);
  assert.match(loadError(small({ from: "chancePercent: 35", to: "chancePercent: 101" })), /from 0 to 100/);
  assert.match(loadError((text) => patchOnce(text, AFTER_SMALL, HUGE_LAYER(256, "rock"))), /square of 256/); // a layer of rocks with the same square as "small"
  assert.strictEqual(loadError((text) => patchOnce(patchOnce(text, "    rock: {", GIANT), AFTER_SMALL, HUGE_LAYER(2048))), null); // the huge layer itself is valid
});

test("103 with a layer of huge objects: each one stays in its square, and the small ones that overlap one are the only small ones that go (all the others are exactly as before)", () => {
  const list = (game) => plain(run(`
    const out = {};
    for (let seed = 1; seed <= 5; seed++) out[seed] = objectsInArea(seed, -6000, -6000, 6000, 6000);
    return out;
  `, game));
  const before = list(context); // the real game: only the layer "small"
  const after = list(withHugeLayer());
  const inner = (object) => Math.abs(object.position.x) <= 5000 && Math.abs(object.position.y) <= 5000; // far from the edge of the area, where a huge center could be outside it
  let giants = 0;
  let removed = 0;
  for (const seed of Object.keys(before)) {
    const huge = after[seed].filter((object) => object.layer === "huge");
    giants += huge.length;
    for (const giant of huge) {
      const { x, y } = giant.position;
      assert.ok(giant.radius >= 200 && giant.radius <= 256, "radius " + giant.radius);
      assert.ok(x - giant.radius >= giant.square.x * 2048 && x + giant.radius <= (giant.square.x + 1) * 2048, "the giant leaves its square in x");
      assert.ok(y - giant.radius >= giant.square.y * 2048 && y + giant.radius <= (giant.square.y + 1) * 2048, "the giant leaves its square in y");
    }
    const touchesGiant = (object) => huge.some((giant) => {
      const reach = object.radius + giant.radius;
      return (object.position.x - giant.position.x) ** 2 + (object.position.y - giant.position.y) ** 2 < reach * reach;
    });
    const expected = before[seed].filter(inner).filter((object) => !touchesGiant(object));
    assert.deepStrictEqual(after[seed].filter((object) => object.layer === "small").filter(inner), expected);
    removed += before[seed].filter(inner).length - expected.length;
  }
  assert.ok(giants > 100, "too few giants to prove anything: " + giants);
  assert.ok(removed > 0, "no small object overlapped a giant, so the rule was not exercised");
});

test("104 a huge object whose center is far from an actor is still found when its body reaches the actor, and it pushes the actor out", () => {
  const game = withHugeLayer();
  const result = run(`
    const giant = objectsInArea(1, 0, 0, 2048, 2048).find((object) => object.layer === "huge");
    const { x, y } = giant.position;
    const area = [x + giant.radius - 5, y - 10, x + giant.radius + 15, y + 10]; // a small area on the edge of the giant, its center far away
    const inArea = objectsInArea(1, ...area).some((object) => object.layer === "huge");
    const reaching = objectsReaching(1, ...area).some((object) => object.layer === "huge");

    const s = createChamber1State(1, 1);
    const player = s.actors.find((actor) => actor.id === AVATAR_ID);
    player.position.x = x + giant.radius + player.radius - 3; // 3 px inside the giant
    player.position.y = y;
    const near = objectsNear(s, player).some((object) => object.layer === "huge");
    step(s, { move: { x: 0, y: 0 } });
    const distance = Math.hypot(player.position.x - x, player.position.y - y);
    return { inArea, reaching, near, gap: distance - (giant.radius + player.radius) };
  `, game);
  assert.strictEqual(result.inArea, false); // its center is not in the area
  assert.strictEqual(result.reaching, true); // but its body is
  assert.strictEqual(result.near, true);
  assert.ok(result.gap >= -1e-9, "the avatar is still inside the giant by " + result.gap);
});

test("105 the damage of an object is kept by its layer and its square, so two layers never share a key", () => {
  const result = run(`
    const s = createChamber1State(1, 1);
    const rock = objectsInArea(1, -960, -540, 960, 540)[0];
    const sameSquare = (layer) => objectKey({ layer, square: { x: 0, y: 0 } });
    damageObject(s, rock, 3);
    return { key: objectKey(rock), stored: s.damagedObjects, health: rock.health.now, smallZero: sameSquare("small"), hugeZero: sameSquare("huge") };
  `);
  assert.ok(/^small:-?\d+,-?\d+$/.test(result.key), result.key);
  assert.deepStrictEqual(plain(result.stored), { [result.key]: result.health - 3 });
  assert.notStrictEqual(result.smallZero, result.hugeZero);
});

// ---- Crushing ----
// The user's decision (2026-11-11): a potential behavior of every actor, on or off. Nobody crushes in the definitions; the
// tests switch it on in the state, which is where a buff will switch it on later.

test("106 every actor in the state carries crushes, off: the avatar and every Dummy, a plain boolean, from their recipes", () => {
  const result = run(`
    const s = createChamber1State(1, 1);
    return { values: s.actors.map((actor) => actor.crushes), count: s.actors.length };
  `, WITH_DUMMIES);
  assert.strictEqual(result.count, 101);
  assert.ok(plain(result.values).every((value) => value === false));
});

test("107 an avatar that crushes walks through a rock and a Shroom: each breaks at once whatever its health, nobody is hurt, no push, no bounce, no contact, and it still needs no minimum impact (pressing slowly also crushes)", () => {
  const result = run(`
    const s = createChamber1State(1, 1);
    const avatar = s.actors[0];
    avatar.crushes = true;
    // Walking down into the rock at ${ROCK.x},${ROCK.y} (radius ${ROCK.radius}), at the top speed.
    avatar.position.x = ${ROCK.x}; avatar.position.y = ${ROCK.y} - ${ROCK.radius} - 16 - 1;
    avatar.move.velocity.y = 3;
    const before = { y: avatar.position.y, health: avatar.health.now };
    step(s, { move: { x: 0, y: 1 } });
    const rock = { broken: s.damagedObjects["${ROCK.key}"], moved: avatar.position.y - before.y, vy: avatar.move.velocity.y, health: avatar.health.now, contacts: s.contacts.slice() };
    for (let i = 0; i < 30; i++) step(s, { move: { x: 0, y: 1 } });
    rock.through = avatar.position.y - before.y;

    // The Shroom at 136,-375 (radius 16, bounce 0.2) is crushed while pressing slowly: speed 0.5, below the minimum impact (1).
    const t = createChamber1State(1, 1);
    const slow = t.actors[0];
    slow.crushes = true;
    slow.position.x = 136; slow.position.y = -375 - 16 - 16 - 0.25;
    slow.move.velocity.y = 0.5;
    step(t, { move: { x: 0, y: 0.5 / 3 } });
    const shroom = { broken: t.damagedObjects["small:0,-2"], vy: slow.move.velocity.y, health: slow.health.now, contacts: t.contacts.slice() };
    return { rock, shroom };
  `);
  assert.strictEqual(result.rock.broken, 0); // the rock had 10 health: gone in one touch
  assert.ok(Math.abs(result.rock.moved - 3) < 1e-9, "the avatar was pushed: it moved " + result.rock.moved);
  assert.strictEqual(result.rock.vy, 3);
  assert.strictEqual(result.rock.health, 100);
  assert.deepStrictEqual(plain(result.rock.contacts), []);
  assert.ok(result.rock.through > 60, "the avatar did not walk through: " + result.rock.through);
  assert.strictEqual(result.shroom.broken, 0);
  assert.ok(Math.abs(result.shroom.vy - 0.5) < 1e-9, "the Shroom bounced the avatar: " + result.shroom.vy); // no bounce
  assert.strictEqual(result.shroom.health, 100);
  assert.deepStrictEqual(plain(result.shroom.contacts), []);
});

test("108 a Dummy that crushes goes through a rock without turning, and the rock is gone; against another Dummy it collides as always", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0, 1);
    const [, d, other] = s.actors;
    d.crushes = true;
    face(d, 90); // down, toward the rock at ${ROCK.x},${ROCK.y}
    d.position.x = ${ROCK.x}; d.position.y = ${ROCK.y} - ${ROCK.radius} - d.radius - 30;
    other.position.x = 5000; other.position.y = 5000; // far away for now
    const startY = d.position.y;
    let frames = 0;
    while (s.damagedObjects["${ROCK.key}"] === undefined && frames < 60) { step(s, { move: { x: 0, y: 0 } }); frames++; }
    const atCrush = { rock: s.damagedObjects["${ROCK.key}"], turns: d.wander.turns, angle: d.wander.angle, health: d.health.now };
    for (let i = 0; i < 40; i++) step(s, { move: { x: 0, y: 0 } });
    const later = { turns: d.wander.turns, walked: d.position.y - startY, expected: (frames + 40) * 2 };

    // Now the other Dummy stands in its way: an ordinary collision, the crusher turns and is pushed.
    other.position.x = d.position.x; other.position.y = d.position.y + d.radius + other.radius + 1;
    face(other, 270); // up, toward the crusher
    step(s, { move: { x: 0, y: 0 } });
    const gap = Math.hypot(d.position.x - other.position.x, d.position.y - other.position.y) - (d.radius + other.radius);
    return { atCrush, later, meeting: { turns: [d.wander.turns, other.wander.turns], gap, contacts: s.contacts } };
  `, WITH_DUMMIES);
  assert.deepStrictEqual(plain(result.atCrush), { rock: 0, turns: 0, angle: 90, health: 100 });
  assert.strictEqual(result.later.turns, 0);
  assert.ok(Math.abs(result.later.walked - result.later.expected) < 1e-9, "the crusher did not keep its straight line: " + result.later.walked + " vs " + result.later.expected);
  assert.deepStrictEqual(plain(result.meeting.turns), [1, 1]);
  assert.ok(Math.abs(result.meeting.gap) < 1e-9, "the two Dummies were not pushed to just touching: " + result.meeting.gap);
  assert.deepStrictEqual(plain(result.meeting.contacts), ["dummy_0|dummy_1"]);
});

// ---- The push between actors ----
// The user's decision (2026-11-11): the push between two actors is split by weight, the avatar included. The heavy mecha
// pushes light enemies, and heavy enemies push it.

test("109 the push between actors is split by weight: a giant Dummy (25600 kg) moves the avatar (5000 kg) by 84% of the overlap; two of the same weight move half each; two of weight 0 also move half each", () => {
  const result = run(`
    ${ALONE}
    const blueprint = createRun(1).blueprint;
    const pushed = (s, a, b) => {
      a.position.x = 1000; a.position.y = 0; b.position.x = 1000 + a.radius + b.radius - 10; b.position.y = 0; // overlap 10
      touchActors(s, ["x"], a, b, "x", blueprint); // an old contact: only the push (no hit, no turn)
      return { a: a.position.x - 1000, b: b.position.x - (1000 + a.radius + b.radius - 10), gap: (b.position.x - a.position.x) - (a.radius + b.radius) };
    };
    const s = alone(0, 1);
    const [avatar, d, e] = s.actors;
    d.radius = 256; d.weight = finalWeight(d); // a giant: 100 x 256 = 25600 kg
    const giant = pushed(s, d, avatar);
    e.radius = d.radius; e.weight = d.weight; // the same weight as the giant
    const equal = pushed(s, d, e);
    return { giant: { ...giant, share: 5000 / (25600 + 5000), giantWeight: d.weight, avatarWeight: avatar.weight }, equal };
  `, EMPTY);
  assert.strictEqual(result.giant.giantWeight, 25600);
  assert.strictEqual(result.giant.avatarWeight, 5000);
  assert.ok(Math.abs(result.giant.a - (-10 * result.giant.share)) < 1e-9, "the giant moved " + result.giant.a); // the giant takes 5000 / 30600 = 16%
  assert.ok(Math.abs(result.giant.b - 10 * (1 - result.giant.share)) < 1e-9, "the avatar moved " + result.giant.b); // the avatar takes 84%
  assert.ok(Math.abs(result.giant.gap) < 1e-9);
  assert.ok(Math.abs(result.equal.a + 5) < 1e-9 && Math.abs(result.equal.b - 5) < 1e-9, "equal weights are not half each: " + result.equal.a + ", " + result.equal.b);

  // Weight 0 on both sides (a patched Dummy with weightPerRadius 0): half each, no division by zero.
  const weightless = loadGame((text) => {
    const patched = text.replace("chancePercent: 35", "chancePercent: 0").replace(/dummies: \{ count: \d+ \}/, "dummies: { count: 2 }").replace("      weightPerRadius: 100,\n      healthRange: { min: 100, max: 100 },", "      weightPerRadius: 0,\n      healthRange: { min: 100, max: 100 },");
    assert.ok(patched.includes("weightPerRadius: 0,\n      healthRange: { min: 100, max: 100 }"), "the patch of the Dummy weight should apply");
    return patched;
  });
  const zero = run(`
    const s = createChamber1State(1, 1);
    const [, a, b] = s.actors;
    a.position.x = 1000; a.position.y = 0; b.position.x = 1000 + a.radius + b.radius - 10; b.position.y = 0;
    touchActors(s, ["x"], a, b, "x", createRun(1).blueprint);
    return { weights: [a.weight, b.weight], a: a.position.x - 1000, b: b.position.x - (1000 + a.radius + b.radius - 10) };
  `, weightless);
  assert.deepStrictEqual(plain(zero.weights), [0, 0]);
  assert.ok(Math.abs(zero.a + 5) < 1e-9 && Math.abs(zero.b - 5) < 1e-9, "weightless pair: " + zero.a + ", " + zero.b);
});

test("110 the avatar pushed by a Dummy has its cells written again at once (pushed over a cell border, the stored cells follow), and the grid still gives the state of every pair (three heavy Dummies walking into the avatar, 200 frames)", () => {
  const border = run(`
    ${ALONE}
    // A giant on the left overlaps the avatar by 10 px: the avatar (5000 kg) takes 84% of it and crosses the border at 16
    // (an avatar at x < 16 reaches less than 32, cell 0; at 16 or more it reaches cell 1).
    const s = alone(0);
    const [avatar, d] = s.actors;
    d.radius = 256; d.weight = finalWeight(d);
    avatar.position.x = 15.9; avatar.position.y = 0;
    d.position.x = 15.9 - (256 + 16) + 10; d.position.y = 0; face(d, 0); // walking right, into the avatar
    for (const actor of s.actors) setCells(actor, s.grid);
    const before = JSON.stringify(avatar.cells);
    step(s, { move: { x: 0, y: 0 } });
    const expected = { from: { x: cellIndex(avatar.position.x - 16, 64), y: cellIndex(avatar.position.y - 16, 64) }, to: { x: cellIndex(avatar.position.x + 16, 64), y: cellIndex(avatar.position.y + 16, 64) } };
    return { before, after: JSON.stringify(avatar.cells), expected: JSON.stringify(expected), x: avatar.position.x };
  `, EMPTY); // no objects: the giant touches nothing but the avatar

  const result = run(`
    ${EVERY_PAIR}
    const make = () => {
      const s = createChamber1State(1, 5);
      const dummies = s.actors.filter((actor) => actor.wander);
      const [a, b, c] = dummies; // three heavy Dummies walk straight at the avatar from three sides
      for (const d of [a, b, c]) { d.radius = 64; d.weight = finalWeight(d); }
      a.position.x = 300; a.position.y = 0; a.wander.angle = 180; setHeading(a);
      b.position.x = -300; b.position.y = 50; b.wander.angle = 0; setHeading(b);
      c.position.x = 20; c.position.y = -300; c.wander.angle = 90; setHeading(c);
      for (const actor of s.actors) setCells(actor, s.grid);
      return s;
    };
    const grid = playWith(make, 200, false); // they reach the avatar after about 110 frames
    const every = playWith(make, 200, true);
    const moved = Math.hypot(JSON.parse(grid).actors[0].position.x, JSON.parse(grid).actors[0].position.y);
    return { same: grid === every, moved };
  `, WITH_DUMMIES);
  assert.strictEqual(border.before, JSON.stringify({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }));
  assert.ok(border.x >= 16, "the avatar was not pushed over the border: " + border.x);
  assert.strictEqual(border.after, border.expected);
  assert.strictEqual(border.after, JSON.stringify({ from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }));
  assert.ok(result.same, "the grid and every pair disagree once the avatar is pushed");
  assert.ok(result.moved > 1, "the avatar was not pushed at all: " + result.moved);
});

// ---- The test helpers ----

test("111 the helpers refuse a patch of the data that changes nothing, so a test cannot silently play the real game", () => {
  assert.throws(() => loadGame((text) => text.replace("this text is not in the data", "x")), /changed nothing/);
  assert.throws(() => patchOnce("abc", "z", "y"), /should apply once/);
  assert.throws(() => patchOnce("abab", "ab", "y"), /should apply once/);
  assert.strictEqual(patchOnce("abc", "b", "y"), "ayc");
  assert.doesNotThrow(() => loadGame()); // no patch: the real game
});

test("112 every test has one row in tests/agent/README.md and every row has its test (the numbers are unique)", () => {
  const here = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
  const tests = [...here("sim.test.js").matchAll(/^test\("(\d+) /gm)].map((match) => Number(match[1]));
  const rows = [...here("README.md").matchAll(/^\| (\d+) \|/gm)].map((match) => Number(match[1]));
  assert.deepStrictEqual(tests.filter((number, index) => tests.indexOf(number) !== index), [], "two tests with the same number");
  assert.deepStrictEqual(rows.filter((number, index) => rows.indexOf(number) !== index), [], "two rows with the same number");
  assert.deepStrictEqual(tests.filter((number) => !rows.includes(number)), [], "tests without a row in the README");
  assert.deepStrictEqual(rows.filter((number) => !tests.includes(number)), [], "rows of the README without a test");
});

test("113 the rules use nothing that can differ between machines or runs: no Math.random, no trigonometry or powers of the browser, no clock (src/sim.js and src/history.js, comments aside)", () => {
  const forbidden = /Math\.(random|sin|cos|tan|asin|acos|atan|atan2|pow|exp|log|log2|log10|sinh|cosh|tanh|cbrt|hypot)\b|\bDate\b|\bperformance\b|\*\*/;
  for (const name of ["sim.js", "history.js"]) {
    const code = readSource(name).split("\n").map((line) => line.replace(/\/\/.*$/, "")); // the comments may name them
    const found = code.map((line, index) => (forbidden.test(line) ? name + ":" + (index + 1) + " " + line.trim() : null)).filter(Boolean);
    assert.deepStrictEqual(found, []);
  }
  assert.ok(forbidden.test("x = Math.sin(1)") && forbidden.test("Date.now()") && forbidden.test("a ** 2") && !forbidden.test("Math.sqrt(2) + Math.imul(3, 4) + Math.floor(1.5)"));
});

test("114 a Dummy moves like any actor: born still, it reaches its speed of 2 in 16 frames (2 / 0.125) in a straight line toward its angle, and a turn is a curve, not a jump: turned around, it slows to a stop in 16 frames and is at full speed the other way after 32", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const d = s.actors[1];
    d.wander.angle = 0; setHeading(d); // to the right, from rest
    d.position.x = 1000; d.position.y = 0;
    const speeds = [];
    for (let frame = 0; frame < 20; frame++) { step(s, { move: { x: 0, y: 0 } }); speeds.push(d.move.velocity.x); }
    const sideways = d.move.velocity.y;
    d.wander.angle = 180; setHeading(d); // turn around
    const turning = [];
    for (let frame = 0; frame < 36; frame++) { step(s, { move: { x: 0, y: 0 } }); turning.push(d.move.velocity.x); }
    return { speeds, sideways, turning, carried: [d.speed, d.acceleration, d.deceleration] };
  `, EMPTY);
  assert.deepStrictEqual(plain(result.carried), [2, 0.125, 0.0625]);
  assert.ok(Math.abs(result.speeds[0] - 0.125) < 1e-9 && Math.abs(result.speeds[7] - 1) < 1e-9, "it does not speed up by 0.125 per frame: " + result.speeds.slice(0, 8));
  assert.ok(Math.abs(result.speeds[15] - 2) < 1e-9 && Math.abs(result.speeds[19] - 2) < 1e-9, "it is not at 2 after 16 frames: " + result.speeds[15]);
  assert.ok(Math.abs(result.sideways) < 1e-9);
  assert.ok(Math.abs(result.turning[0] - 1.875) < 1e-9, "the turn jumped: " + result.turning[0]); // one frame after turning it has only lost 0.125
  assert.ok(Math.abs(result.turning[15]) < 1e-9, "not stopped after 16 frames: " + result.turning[15]);
  assert.ok(Math.abs(result.turning[31] + 2) < 1e-9 && Math.abs(result.turning[35] + 2) < 1e-9, "not at full speed the other way after 32 frames: " + result.turning[31]);
});

test("115 one routine for every actor that meets an object: a Shroom bounces a Dummy like it bounces the avatar (0.2 of the speed going in comes back) and a rock makes it slide (the part going in is removed, the part along is kept); nobody is hurt and the Dummy turns", () => {
  const result = run(`
    ${ALONE}
    // Head on into the Shroom of seed 1 at 136,-375 (radius 16, bounce 0.2), walking down at 2.
    const s = alone(0);
    const d = s.actors[1];
    face(d, 90);
    d.position.x = 136; d.position.y = -375 - 16 - d.radius - 1;
    step(s, { move: { x: 0, y: 0 } });
    const shroom = { vx: d.move.velocity.x, vy: d.move.velocity.y, turns: d.wander.turns, health: d.health.now, damaged: JSON.stringify(s.damagedObjects),
      gap: Math.hypot(d.position.x - 136, d.position.y + 375) - (16 + d.radius), contacts: s.contacts.slice() };

    // Off center into the rock at ${ROCK.x},${ROCK.y} (radius ${ROCK.radius}, no bounce), walking down at 2.
    const t = alone(0);
    const e = t.actors[1];
    face(e, 90);
    e.position.x = ${ROCK.x} + 20;
    e.position.y = ${ROCK.y} - Math.sqrt((${ROCK.radius} + e.radius) ** 2 - 20 * 20) - 1; // 1 px above the point where it touches
    step(t, { move: { x: 0, y: 0 } });
    const nx = (e.position.x - ${ROCK.x}) / (${ROCK.radius} + e.radius);
    const ny = (e.position.y - ${ROCK.y}) / (${ROCK.radius} + e.radius);
    const into = e.move.velocity.x * nx + e.move.velocity.y * ny; // what is left of the speed going into the rock
    const along = Math.hypot(e.move.velocity.x - into * nx, e.move.velocity.y - into * ny);
    const alongBefore = Math.abs(2 * nx); // a velocity of (0, 2): its part along the surface is 2 x |nx|
    return { shroom, rock: { into, along, alongBefore, turns: e.wander.turns, health: e.health.now, damaged: JSON.stringify(t.damagedObjects) } };
  `, WITH_DUMMIES);
  assert.ok(Math.abs(result.shroom.vx) < 1e-9 && Math.abs(result.shroom.vy + 0.4) < 1e-9, "the Shroom did not bounce the Dummy back at 0.2 x 2: " + result.shroom.vx + ", " + result.shroom.vy);
  assert.ok(Math.abs(result.shroom.gap) < 1e-9);
  assert.deepStrictEqual([result.shroom.turns, result.shroom.health, result.shroom.damaged], [1, 100, "{}"]);
  assert.deepStrictEqual(plain(result.shroom.contacts), ["dummy_0|shroom small:0,-2"]);
  assert.ok(Math.abs(result.rock.into) < 1e-9, "the rock left a speed going in, or bounced: " + result.rock.into);
  assert.ok(Math.abs(result.rock.along - result.rock.alongBefore) < 1e-9, "the part along the rock changed: " + result.rock.along + " vs " + result.rock.alongBefore);
  assert.deepStrictEqual([result.rock.turns, result.rock.health, result.rock.damaged], [1, 100, "{}"]);
});

// ---- Damage packets and resistance (the user's rules, 2026-11-11) ----
// A hit is a packet with one amount per type of damage; the target resists each type on its own, by points that become a
// share through the curve points / (points + 100); a hit with something in it costs at least 1.

test("116 resistance is a curve: a hit of 10 blunt is 10 with no points, 8.85 with 13, 5 with 100, 3.33 with 200, 2.5 with 300 and 1 with 900; it never reaches 100% and every 100 points add the same life", () => {
  const result = run(`
    const rows = {};
    for (const points of [0, 13, 100, 200, 300, 900, 9900]) {
      const record = resolveDamage({ blunt: 10 }, { resistance: { blunt: points } });
      rows[points] = { total: record.total, reduction: record.parts[0].reduction, minimumApplied: record.minimumApplied };
    }
    return rows;
  `);
  const expected = { 0: 10, 13: 10 * (1 - 13 / 113), 100: 5, 200: 10 / 3, 300: 2.5, 900: 1 };
  for (const [points, total] of Object.entries(expected)) assert.ok(Math.abs(result[points].total - total) < 1e-9, points + " points: " + result[points].total);
  assert.ok(Math.abs(result[13].total - 8.8496) < 1e-4); // the user's "13%" is 13 points: a little less than 13% off
  for (const points of [100, 200, 300, 900]) {
    const life = 10 / result[points].total; // how much life the target is worth
    assert.ok(Math.abs(life - (1 + points / 100)) < 1e-9, "the life is not a straight line at " + points + " points: " + life);
  }
  for (const points of [0, 13, 100, 200, 300, 900, 9900]) assert.ok(result[points].reduction < 1, "the curve reached 100%");
  assert.deepStrictEqual([result[9900].total, result[9900].minimumApplied], [1, true]); // 0.1 left, but a hit costs at least 1
});

test("117 each type of a packet is resisted on its own (a fire sword against a creature resistant to fire still hits with its blade), the record lists the terms in the order of the types, an empty packet costs nothing and a tiny one costs 1", () => {
  const result = run(`
    const target = { resistance: { puncture: 100, blunt: 0 } };
    const both = resolveDamage({ puncture: 6, blunt: 3 }, target);
    const onlyBlunt = resolveDamage({ blunt: 3 }, target);
    const empty = resolveDamage({}, target);
    const tiny = resolveDamage({ blunt: 0.25 }, target);
    const noResistance = resolveDamage({ puncture: 6, blunt: 3 }, {});
    return { both, onlyBlunt, empty, tiny, noResistance, types: DEFINITIONS.damageTypes };
  `);
  assert.deepStrictEqual(plain(result.types), ["blunt", "puncture", "slash"]);
  assert.deepStrictEqual(plain(result.both.parts.map((part) => [part.type, part.amount, part.points, part.reduction, part.after])), [["blunt", 3, 0, 0, 3], ["puncture", 6, 100, 0.5, 3]]);
  assert.strictEqual(result.both.total, 6); // 3 + 3: half of the puncture is gone, the blunt goes through whole
  assert.strictEqual(result.onlyBlunt.total, 3); // a resistance to puncture does nothing to blunt
  assert.deepStrictEqual(plain(result.empty), { parts: [], total: 0, minimumApplied: false });
  assert.deepStrictEqual([result.tiny.total, result.tiny.minimumApplied], [1, true]);
  assert.strictEqual(result.noResistance.total, 9); // a target with no resistance at all takes everything
});

test("118 a part can only have the specs the rules read, and resistance only to types of damage; an attack needs known types, numbers, a whole reach and freeze and a hitbox: anything else stops the game when it loads", () => {
  const legs = "specs: { health: 30, resistance: { blunt: 10 }, speed: 3.5 }";
  assert.throws(() => loadGame((text) => text.replace(legs, "specs: { health: 30, resistance: { blunt: 10 }, speed: 3.5, dashspeed: 1 }")), /The part legs has the spec dashspeed/);
  assert.throws(() => loadGame((text) => text.replace(legs, "specs: { health: 30, resistance: { fire: 10 }, speed: 3.5 }")), /resistance of the part legs is to fire/);
  assert.throws(() => loadGame((text) => text.replace(legs, "specs: { health: 30, resistance: { blunt: -1 }, speed: 3.5 }")), /resistance of the part legs to blunt/);
  assert.throws(() => loadGame((text) => text.replace(legs, "specs: { health: -30, resistance: { blunt: 10 }, speed: 3.5 }")), /spec health of the part legs/);
  const bite = "damage: { puncture: { flat: 3, perWeight: 0.002 } }";
  assert.throws(() => loadGame((text) => text.replace(bite, "damage: { fire: { flat: 3, perWeight: 0.002 } }")), /attack bite of the actor biter has fire/);
  assert.throws(() => loadGame((text) => text.replace(bite, "damage: { puncture: { flat: -3, perWeight: 0.002 } }")), /attack bite of the actor biter needs flat and perWeight/);
  assert.throws(() => loadGame((text) => text.replace("reach: 8,", "reach: 8.5,")), /reach of the attack bite of the actor biter/);
  assert.throws(() => loadGame((text) => text.replace("windupFrames: 15,", "windupFrames: -1,")), /windupFrames of the attack bite of the actor biter/);
  assert.throws(() => loadGame((text) => text.replace("hitbox: { radius: 20, frames: 1 }", "hitbox: { radius: 20, frames: 0 }")), /hitbox of the attack bite of the actor biter/);
  assert.throws(() => loadGame((text) => text.replace("attacks: {\n        bite: {", "attacks: {\n        bodySlam: {")), /name bodySlam of the attack bodySlam/);
});

// ---- The Biter (Chamber 2: COMBAT) ----
// The Biter chases the avatar and, when the space between the two bodies is within its reach, strikes with a hitbox and holds
// still. A game with 6 Biters and no objects, so the only things that happen are the ones a test sets up.

const QUIET = loadGame((text) => text.replace("chancePercent: 35", "chancePercent: 0").replace("biters: { count: 40 }", "biters: { count: 6 }"));

// A state with the avatar and only the Biters of the given numbers.
const ALONE_BITERS = `
  function aloneBiters(...numbers) {
    const s = createChamber2State(1, 1);
    s.actors = [s.actors[0], ...numbers.map((n) => s.actors.find((actor) => actor.id === "biter_" + n))];
    return s;
  }
`;

test("119 an attack is { base, now }: the base is calculated once, when the actor is made (flat + perWeight x weight, 5.4 for the smallest Biter and 7 for the largest, and weight x 0.001 for the body slam of everyone), and now is calculated every frame from the weight the actor has then (the same as the base while the weight does not change)", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const b = s.actors[1];
    const made = JSON.stringify(b.attacks);
    const small = finalizeObject("biter", { radius: 12, health: { now: 30, max: 30 } }, undefined, "x");
    const large = finalizeObject("biter", { radius: 20, health: { now: 30, max: 30 } }, undefined, "y");
    b.attacks.bite.now.puncture = 99; // something changed it for a moment
    b.weight = 1; // and the weight changed in the middle of the run: the base is static, it was made once, and now follows the weight
    step(s, { move: { x: 0, y: 0 } });
    return { made: JSON.parse(made), radius: b.radius, small: small.attacks.bite.base, large: large.attacks.bite.base, now: b.attacks.bite.now, base: b.attacks.bite.base, avatar: s.actors[0].attacks };
  `, QUIET);
  assert.ok(Math.abs(result.small.puncture - 5.4) < 1e-9 && Math.abs(result.large.puncture - 7) < 1e-9); // 3 + 0.002 x 1200, 3 + 0.002 x 2000
  const weight = 100 * result.radius;
  assert.ok(Math.abs(result.made.bite.base.puncture - (3 + 0.002 * weight)) < 1e-9);
  assert.ok(Math.abs(result.made.bodySlam.base.blunt - weight * 0.001) < 1e-9);
  assert.deepStrictEqual(plain(result.made.bite.now), plain(result.made.bite.base)); // a new actor: now is the base
  assert.deepStrictEqual([result.made.bite.reach, result.made.bite.windupFrames, result.made.bite.freezeFrames, plain(result.made.bite.hitbox)], [8, 15, 10, { radius: 20, frames: 1 }]); // what is not damage is copied as it is
  assert.ok(Math.abs(result.now.puncture - (3 + 0.002 * 1)) < 1e-12, "now: " + result.now.puncture); // the 99 is gone: now is calculated again every frame, with the weight of now (1 kg)
  assert.ok(Math.abs(result.base.puncture - (3 + 0.002 * weight)) < 1e-9, "the base followed the weight: " + result.base.puncture); // and the base stays as it was made
  assert.deepStrictEqual(plain(result.avatar), { bodySlam: { base: { blunt: 5 }, now: { blunt: 5 }, repeat: "contact", scale: "impact", ignores: ["ally"] } }); // the avatar has only the body slam: 5000 kg x 0.001
});

test("120 a Biter walks straight at the avatar: its wanted direction is the unit vector toward it, its velocity speeds up by 0.125 per frame to its top speed of 2.5, and the distance only shrinks", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const b = s.actors[1];
    b.position.x = 500; b.position.y = 0;
    const speeds = [], distances = [];
    for (let i = 0; i < 24; i++) {
      step(s, { move: { x: 0, y: 0 } });
      speeds.push(b.move.velocity.x);
      distances.push(b.position.x);
    }
    const first = { x: b.move.direction.x, y: b.move.direction.y };

    const t = aloneBiters(1);
    const c = t.actors[1];
    c.position.x = 300; c.position.y = 400; // 500 px away, the 3-4-5 triangle
    step(t, { move: { x: 0, y: 0 } });
    return { speeds, distances, first, diagonal: { x: c.move.direction.x, y: c.move.direction.y }, y: b.position.y, top: b.speed };
  `, QUIET);
  assert.deepStrictEqual(plain(result.first), { x: -1, y: 0 });
  assert.deepStrictEqual(plain(result.diagonal), { x: -300 / 500, y: -400 / 500 });
  assert.ok(Math.abs(result.speeds[0] + 0.125) < 1e-12 && Math.abs(result.speeds[7] + 1) < 1e-12 && Math.abs(result.speeds[19] + 2.5) < 1e-12, "the speeding up is wrong: " + result.speeds.slice(0, 8));
  assert.ok(Math.abs(result.speeds[23] + 2.5) < 1e-12); // it stays at the top speed
  assert.ok(Math.abs(result.distances[19] - (500 - 0.125 * 210)) < 1e-9); // 20 frames of speeding up: 0.125 x (1 + 2 + ... + 20)
  for (let i = 1; i < result.distances.length; i++) assert.ok(result.distances[i] < result.distances[i - 1]);
  assert.strictEqual(result.y, 0);
  assert.strictEqual(result.top, 2.5);
});

test("121 within its reach the Biter holds still for 15 frames (the windup), then strikes: one hitbox is born one body ahead of it with the damage the bite has now, hurts in that same step and is gone (it lives one frame), leaving a trace in the visual state, and it stays still for 10 frames more (the freeze) and then chases again", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const avatar = s.actors[0];
    const b = s.actors[1];
    b.position.x = 16 + b.radius + 5; b.position.y = 0; // 5 px of space between the bodies: within the reach of 8
    const rows = [];
    const visual = createVisual();
    let born = null;
    for (let i = 1; i <= 27; i++) {
      if (i === 17) avatar.position.x = -1000; // after the strike the avatar goes away: the Biter has nothing to bite when the freeze ends
      step(s, { move: { x: 0, y: 0 } }, undefined, visual);
      rows.push([i, b.ai.phase, b.ai.frames, b.move.direction.x === 0 && b.move.direction.y === 0, visual.traces.length]);
      if (i === 16) born = { hitboxes: s.hitboxes.length, traces: JSON.parse(JSON.stringify(visual.traces)), health: avatar.health.now, radius: b.radius, bite: b.attacks.bite.now.puncture, direction: { ...b.move.direction } };
    }
    return { rows, born };
  `, QUIET);
  const { born, rows } = result;
  // Step 1 it enters the windup with 15 frames; at steps 2 to 15 it counts down 14 to 1 and no hitbox exists yet.
  assert.deepStrictEqual(plain(rows[0].slice(1)), ["windup", 15, true, 0]);
  for (const [step, phase, frames, still, hitboxes] of plain(rows.slice(1, 15))) assert.deepStrictEqual([phase, frames, still, hitboxes], ["windup", 16 - step, true, 0], "step " + step);
  // Step 16 the windup is over: the hitbox is born (toward the avatar, with the packet of the bite now), hurts in that same step and
  // is gone (it lives one frame); the trace it leaves in the visual state is where it was born; the freeze begins.
  assert.strictEqual(born.hitboxes, 0);
  assert.deepStrictEqual(plain(born.traces), [{ position: { x: 21, y: 0 }, radius: 20, cone: null, age: 0, frames: 12 }]);
  assert.ok(Math.abs(born.health - (100 - resisted(born.bite, 10))) < 1e-9, "the bite hurt the avatar once: " + born.health);
  assert.deepStrictEqual([rows[15][1], rows[15][2], plain(born.direction)], ["freeze", 10, { x: 0, y: 0 }]);
  // Steps 17 to 25 it is frozen (frames 9 down to 1) and wants no movement; at step 26 the freeze is over and it chases.
  for (const [step, phase, frames, still] of plain(rows.slice(16))) {
    if (step <= 25) assert.deepStrictEqual([phase, frames, still], ["freeze", 26 - step, true], "step " + step);
    else assert.deepStrictEqual([phase, still], ["chase", false], "step " + step);
  }
});

test("122 a hitbox hurts the avatar once, with the packet as it was born (resisted by the avatar's 10 points of puncture); the bite lives one frame, so it is gone at the end of the step it hurt in; a hitbox that lives 3 frames and keeps touching the avatar still hurts it only once, with the packet it was born with even if the bite changed afterwards", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const avatar = s.actors[0];
    const b = s.actors[1];
    b.position.x = 16 + b.radius + 5; b.position.y = 0;
    b.attacks.bite.windupFrames = 0; // this test is about the hitbox, not the windup
    const bite = b.attacks.bite.base.puncture;
    step(s, { move: { x: 0, y: 0 } });
    const bitten = { health: avatar.health.now, alive: s.hitboxes.length };

    // A hitbox that lives 3 frames, made by the same function and touching the avatar all the time: it hurts once.
    const t = aloneBiters(0);
    const c = t.actors[1];
    c.position.x = 16 + c.radius + 5; c.position.y = 0;
    c.ai.phase = "freeze"; c.ai.frames = 1000000; // a frozen mind: it will not strike by itself
    spawnHitbox(t, c, "bite", -1, 0, { radius: 20, frames: 3, speed: 0, pierce: null });
    c.attacks.bite.now.puncture = 50; // the bite changes after the hitbox was born
    const longer = [];
    for (let i = 0; i < 3; i++) { step(t, { move: { x: 0, y: 0 } }); longer.push([t.actors[0].health.now, t.hitboxes.length]); }
    return { bite, bitten, longer };
  `, QUIET);
  const damage = 100 - resisted(result.bite, 10); // 10 points of puncture: 10 / 110 = 9% off
  assert.ok(Math.abs(result.bitten.health - damage) < 1e-9, "the bite: " + result.bitten.health);
  assert.strictEqual(result.bitten.alive, 0); // it lived one frame
  for (const [health] of plain(result.longer)) assert.ok(Math.abs(health - damage) < 1e-9, "hurt once, with the packet it was born with: " + health);
  assert.deepStrictEqual(plain(result.longer).map(([, alive]) => alive), [1, 1, 0]); // 3 frames, and then it is gone
});

test("123 who a hitbox hurts: the avatar's hitbox hurts what is not the avatar, anything else's hurts the avatar; a hitbox that does not touch the avatar hurts nobody", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const avatar = s.actors[0];
    const b = s.actors[1];
    b.position.x = 900; b.position.y = 0; // far from the avatar: it will not strike
    s.hitboxes.push({ owner: "biter_0", attack: "bite", position: { x: 100, y: 0 }, radius: 20, framesLeft: 3, damage: { puncture: 9 }, velocity: { x: 0, y: 0 }, struck: [], pierceLeft: null, ignores: ["enemy", "object"] }); // 100 px away: a miss
    step(s, { move: { x: 0, y: 0 } });
    return { rule: [hitboxHurts({ ignores: avatar.attacks.bodySlam.ignores }, avatar), hitboxHurts({ ignores: avatar.attacks.bodySlam.ignores }, b), hitboxHurts({ ignores: b.attacks.bodySlam.ignores }, avatar), hitboxHurts({ ignores: b.attacks.bodySlam.ignores }, b)], health: avatar.health.now, left: s.hitboxes.map((hitbox) => hitbox.framesLeft) };
  `, QUIET);
  assert.deepStrictEqual(plain(result.rule), [false, true, true, false]);
  assert.strictEqual(result.health, 100);
  assert.deepStrictEqual(plain(result.left), [2]); // it keeps losing frames even when it misses
});

// ---- Destruction ----

test("124 an actor with no health left leaves the scene at the end of the step, the others keep their order, and the avatar is never destroyed; a dash kills a weak Biter and a Dummy in Chamber 1 goes too", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1, 2, 3);
    s.actors[2].health.now = 0; // biter_1
    step(s, { move: { x: 0, y: 0 } });
    const order = s.actors.map((actor) => actor.id);

    const t = aloneBiters(0);
    t.actors[0].health.now = 0;
    step(t, { move: { x: 0, y: 0 } });
    const avatarStays = t.actors.map((actor) => actor.id);

    const u = aloneBiters(0);
    const b = u.actors[1];
    b.position.x = 16 + b.radius + 6; b.position.y = 0; b.health.now = 5; // 6 px away, 5 health: a dash hits for about 10
    step(u, { move: { x: 1, y: 0 }, dash: true });
    const afterDash = u.actors.map((actor) => actor.id);

    const d = createChamber1State(1, 1);
    d.actors = [d.actors[0], d.actors.find((actor) => actor.id === "dummy_0"), d.actors.find((actor) => actor.id === "dummy_1")];
    d.actors[1].health.now = 0;
    step(d, { move: { x: 0, y: 0 } });
    return { order, avatarStays, afterDash, avatarHurt: u.actors[0].health.now < 100, dummies: d.actors.map((actor) => actor.id) };
  `, QUIET);
  assert.deepStrictEqual(plain(result.order), ["avatar_1", "biter_0", "biter_2", "biter_3"]);
  assert.deepStrictEqual(plain(result.avatarStays), ["avatar_1", "biter_0"]); // the avatar at 0 stays: there is no death for it yet
  assert.deepStrictEqual(plain(result.afterDash), ["avatar_1"]);
  assert.deepStrictEqual(plain(result.dummies), ["avatar_1", "dummy_1"]);
});

test("125 two Biters that overlap are pushed apart by weight until they touch, nobody is hurt, and the contact is in the list like any other pair", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1);
    const [avatar, a, b] = s.actors;
    a.position.x = 600; a.position.y = 0;
    b.position.x = 600 + a.radius + b.radius - 4; b.position.y = 0; // overlapping by 4 px
    const before = { a: a.position.x, b: b.position.x, weights: [a.weight, b.weight] };
    step(s, { move: { x: 0, y: 0 } });
    return { before, a: a.position.x, b: b.position.x, gap: Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) - (a.radius + b.radius), health: [a.health.now, b.health.now], contacts: s.contacts.filter((c) => c.startsWith("biter")) };
  `, QUIET);
  assert.ok(Math.abs(result.gap) < 1e-6, "they were not pushed to just touching: " + result.gap);
  assert.deepStrictEqual(plain(result.health), [30, 30]);
  assert.deepStrictEqual(plain(result.contacts), ["biter_0|biter_1"]);
  const [weightA, weightB] = result.before.weights;
  const pushA = (result.before.a - result.a); // a (on the left, pushed left) took b's share of the 4 px
  assert.ok(Math.abs(Math.abs(pushA) - 4 * weightB / (weightA + weightB)) < 0.3, "the heavier one did not move less: " + pushA); // the two also walk 0.125 toward the avatar
});

test("126 Chamber 2 has 40 Biters (ids biter_0 to biter_39), no Dummies, born off the screen inside the window with a radius from 12 to 20 and 30 health, the same for the same seed and not for another, and the state is plain JSON", () => {
  const result = run(`
    const s = createChamber2State(1, 7);
    const again = createChamber2State(1, 7);
    const other = createChamber2State(1, 8);
    const biters = s.actors.filter((actor) => actor.ai);
    const width = s.grid.windowWidth * s.grid.cellSize;
    const height = s.grid.windowHeight * s.grid.cellSize;
    const avatar = s.actors[0].position;
    let bad = 0;
    for (const b of biters) {
      const dx = b.position.x - avatar.x, dy = b.position.y - avatar.y;
      if (!Number.isInteger(b.radius) || b.radius < 12 || b.radius > 20) bad++;
      if (b.health.now !== 30 || b.health.max !== 30) bad++;
      if (Math.abs(dx) < s.grid.screenWidth / 2 + b.radius && Math.abs(dy) < s.grid.screenHeight / 2 + b.radius) bad++; // inside the screen
      if (Math.abs(dx) > width / 2 || Math.abs(dy) > height / 2) bad++; // outside the window
      if (b.ai.phase !== "chase" || b.ai.frames !== 0 || b.ai.attack !== "bite" || b.crushes !== false) bad++;
    }
    return { count: biters.length, others: s.actors.length - biters.length - 1, ids: biters.map((b) => b.id), bad, hitboxes: s.hitboxes,
      same: JSON.stringify(s) === JSON.stringify(again), different: JSON.stringify(s) !== JSON.stringify(other), json: JSON.stringify(s) };
  `);
  assert.strictEqual(result.count, 40);
  assert.strictEqual(result.others, 0);
  assert.deepStrictEqual(plain(result.ids), Array.from({ length: 40 }, (_, i) => "biter_" + i));
  assert.strictEqual(result.bad, 0);
  assert.deepStrictEqual(plain(result.hitboxes), []);
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.different, true);
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json);
});

test("127 a Chamber 2 run is reproducible: 900 frames with the avatar standing among 40 Biters give the same state twice and a clean cross-check, and the Biters really reach it and bite", () => {
  const result = run(`
    const play = () => {
      const run = createRun(1);
      const s = createChamber2State(1, 1, run.blueprint);
      const visual = createVisual();
      const history = createHistory(s, run.blueprint, visual);
      let mostHitboxes = 0;
      for (let i = 0; i < 900; i++) {
        const input = { move: { x: 0, y: 0 } };
        step(s, input, run.blueprint, visual);
        recordFrame(history, s, input, visual);
        mostHitboxes = Math.max(mostHitboxes, visual.traces.length); // a bite lives one frame: its trace says it happened
      }
      return { s, check: crossCheck(history), mostHitboxes };
    };
    const a = play();
    const b = play();
    return { same: JSON.stringify(a.s) === JSON.stringify(b.s), check: a.check, health: a.s.actors[0].health.now, mostHitboxes: a.mostHitboxes, alive: a.s.actors.length - 1 };
  `);
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.check, null);
  assert.ok(result.health < 100, "no Biter bit the avatar in 15 seconds: health " + result.health);
  assert.ok(result.mostHitboxes >= 1);
  assert.ok(result.alive > 0 && result.alive <= 40);
});

// ---- Guards of the review of 2026-11-11 (salts, fingerprint of the data, snap of another version) ----

// The pair kept here must change together with src/data.js: when the data changes, raise DEFINITIONS_VERSION and write the
// new version and fingerprint below (the failure message prints the new fingerprint).
const DATA_FINGERPRINT = { version: 57, hash: "ba91428802fc4f83" };

test("128 every salt of the seed has a name in one table and the numbers are all different; no call of the hash or of the roll uses a bare number as its salt", () => {
  const result = run(`return { salts: SALTS, frozen: Object.isFrozen(SALTS) };`);
  const values = Object.values(plain(result.salts));
  assert.strictEqual(result.frozen, true);
  assert.strictEqual(new Set(values).size, values.length, "two salts have the same number: " + JSON.stringify(result.salts));
  // The object salts are added to 100 x the place of the layer, so they must stay under 100 and the others must not look like one.
  for (const [name, value] of Object.entries(plain(result.salts))) assert.ok(Number.isInteger(value) && value > 0 && value < 100, name + " is not a whole number from 1 to 99");
  // The crowd salts must not be reachable from a layer: layer index x 100 + 1..6 never equals a salt from 11 up.
  const objectSalts = values.slice(0, 6);
  assert.ok(Math.max(...objectSalts) < 11, "an object salt reaches the crowd salts");
  const code = readSource("sim.js").replace(/\/\/.*$/gm, "");
  const calls = [...code.matchAll(/\b(?:hashInts|rollInRange)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((match) => match[1]);
  const bare = calls.filter((args) => /^[^,]+,[^,]+,[^,]+,\s*\d+\s*(,|$)/.test(args.replace(/\([^()]*\)/g, "()")));
  assert.deepStrictEqual(bare, [], "a salt written as a number: " + bare.join(" | "));
});

test("129 src/data.js and DEFINITIONS_VERSION change together: the fingerprint of the data (comments and spaces aside) is kept in this file next to the version", () => {
  const crypto = require("node:crypto");
  const text = readSource("data.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
  const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  const version = run(`return DEFINITIONS_VERSION;`);
  const message = "data.js is now version " + version + " with fingerprint " + hash + " and the test keeps version " + DATA_FINGERPRINT.version + " with " + DATA_FINGERPRINT.hash;
  if (hash !== DATA_FINGERPRINT.hash) assert.notStrictEqual(version, DATA_FINGERPRINT.version, "data.js changed and DEFINITIONS_VERSION did not: raise it. " + message);
  assert.deepStrictEqual([version, hash], [DATA_FINGERPRINT.version, DATA_FINGERPRINT.hash], "update DATA_FINGERPRINT in the test. " + message);
});

test("130 a snap of another definitions version is refused with a clear message instead of being replayed under other rules", () => {
  const result = run(`
    const s = createChamber1State();
    const history = createHistory(s, DEFINITIONS.starterBlueprint);
    const fine = stateFromSnap(history, 0).definitionsVersion;
    history.snaps[0].definitionsVersion = DEFINITIONS_VERSION - 1;
    let error = null;
    try { stateFromSnap(history, 0); } catch (e) { error = e.message; }
    return { fine, version: DEFINITIONS_VERSION, error };
  `);
  assert.strictEqual(result.fine, result.version);
  assert.match(result.error, /definitions version \d+ and the game has version \d+/);
});

test("131 every screen that is played (the table CHAMBERS of src/main.js) is also in the list of the input (GAME_SCREENS of src/input.js), so Space dashes in all of them", () => {
  const main = readSource("main.js");
  const input = readSource("input.js");
  const played = [...main.match(/const CHAMBERS = \{([\s\S]*?)\n\};/)[1].matchAll(/"(screen-chamber-\d+)":/g)].map((match) => match[1]);
  const listed = [...input.match(/const GAME_SCREENS = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(played.length >= 2, "the chambers were not found in main.js");
  assert.deepStrictEqual(listed.slice().sort(), played.slice().sort());
});

test("132 with no windup (windupFrames 0) the Biter strikes in the same step it gets within reach, and if the avatar leaves during the windup the hitbox is born anyway and lands on nothing", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const b = s.actors[1];
    b.position.x = 16 + b.radius + 5; b.position.y = 0;
    b.attacks.bite.windupFrames = 0;
    const visual = createVisual();
    step(s, { move: { x: 0, y: 0 } }, undefined, visual);
    const immediately = { traces: visual.traces.length, phase: b.ai.phase };

    const t = aloneBiters(0);
    const c = t.actors[1];
    c.position.x = 16 + c.radius + 5; c.position.y = 0;
    const seen = createVisual();
    step(t, { move: { x: 0, y: 0 } }, undefined, seen); // windup begins
    t.actors[0].position.x = -1000; // the avatar leaves
    for (let i = 0; i < 15; i++) step(t, { move: { x: 0, y: 0 } }, undefined, seen); // the windup lasts 15 steps after the one that began it
    return { immediately, afterWindup: { traces: seen.traces.length, health: t.actors[0].health.now, phase: c.ai.phase } };
  `, QUIET);
  assert.deepStrictEqual(plain(result.immediately), { traces: 1, phase: "freeze" });
  assert.deepStrictEqual(plain(result.afterWindup), { traces: 1, health: 100, phase: "freeze" });
});

// ---- The repeater (the user, 2026-11-11): ammunition with weight, cadence, reload, auto-aim, a bullet that travels and pierces ----

// A game with 6 Biters, none of them able to bite, and the pierce 1 variant (a weapon whose bullet crosses one thing).
const PIERCE_ONE = loadGame((text) => text.replace("chancePercent: 35", "chancePercent: 0").replace("biters: { count: 40 }", "biters: { count: 6 }").replace("radius: 6, pierce: 0", "radius: 6, pierce: 1"));
const PIERCE_THREE = loadGame((text) => text.replace("chancePercent: 35", "chancePercent: 0").replace("biters: { count: 40 }", "biters: { count: 6 }").replace("radius: 6, pierce: 0", "radius: 6, pierce: 3"));

// The avatar with the combat blueprint, and the Biters of the given numbers held still (the freeze is made very long, so
// they stay where the test puts them and do not bite). `bp` is the blueprint to give to step.
const ARMED = `
  function armed(...numbers) {
    const run = createRun(1, { parts: ["shoulder-r", "shoulder-l", "arm-r", "repeater-arm", "head", "torso", "legs", "generator", "booster"] });
    const bp = run.blueprint;
    const s = createChamber2State(1, 1, bp);
    s.actors = [s.actors[0], ...numbers.map((n) => s.actors.find((actor) => actor.id === "biter_" + n))];
    for (const b of s.actors.slice(1)) { b.ai.phase = "freeze"; b.ai.frames = 1000000; b.health.now = 30; b.health.max = 30; }
    return { s, bp };
  }
  const idle = { move: { x: 0, y: 0 } };
`;

test("133 a blueprint with a repeater arm in place of the plain Arm L (the tests of the repeater play with this one, without the sword): it weighs 5150 kg plus 400 rounds of 6 kg (7550 loaded, under the 8000 of the Torso), the avatar starts with the weapon full and the speed that weight gives; the starter blueprint has no weapon at all", () => {
  const result = run(`
    ${ARMED}
    const { s, bp } = armed();
    const avatar = s.actors[0];
    const starter = createChamber1State(1, 1, createRun(1).blueprint).actors[0];
    return {
      loaded: totalWeight(bp), parts: bp.parts, weapons: avatar.weapons, weight: avatar.weight, speed: avatar.speed,
      attack: avatar.attacks["repeater-arm"], starterWeapons: starter.weapons, starterWeight: starter.weight, starterAttacks: Object.keys(starter.attacks),
    };
  `);
  assert.strictEqual(result.loaded, 7550); // 5000 - 650 + 800 = 5150, and 400 x 6 = 2400
  assert.strictEqual(result.parts[3], "repeater-arm");
  assert.deepStrictEqual(plain(result.weapons), [{ part: "repeater-arm", magazine: 30, reserve: 370, interval: 0, reload: 0 }]);
  assert.strictEqual(result.weight, 7550);
  assert.ok(Math.abs(result.speed - (4 - 7550 * 0.0002)) < 1e-12); // 0.5 + 3.5 - 1.51
  assert.deepStrictEqual(plain(result.attack), { base: { puncture: 10 }, now: { puncture: 10 }, projectile: { speed: 8, radius: 6, pierce: 0 }, target: { pick: "closest", tag: "enemy" }, exit: "center", repeat: "life", scale: "none", ignores: ["self", "ally"] });
  assert.deepStrictEqual(plain(result.starterWeapons), []);
  assert.strictEqual(result.starterWeight, 5000);
  assert.deepStrictEqual(plain(result.starterAttacks), ["bodySlam"]);
});

test("134 the auto-aim picks the closest actor in range (the first in the list on a tie), ignores what is out of range and what has no health, and the bullet is born at the center of the avatar moving at 8 toward it", () => {
  const result = run(`
    ${ARMED}
    const t = armed(0, 1, 2);
    const [a, b, c] = t.s.actors.slice(1);
    a.position.x = 400; a.position.y = 0;      // 400 away
    b.position.x = 0;   b.position.y = -200;   // 200 away: the closest
    c.position.x = 900; c.position.y = 0;      // out of range (520 + its radius)
    const first = pickTarget(t.s, t.s.actors[0], { pick: "closest", tag: "enemy" }, 520).id;
    b.health.now = 0;                          // the closest has no health: the next one
    const second = pickTarget(t.s, t.s.actors[0], { pick: "closest", tag: "enemy" }, 520).id;
    a.health.now = 0;
    const third = pickTarget(t.s, t.s.actors[0], { pick: "closest", tag: "enemy" }, 520);
    b.health.now = 30; a.health.now = 30;
    a.position.x = 0; a.position.y = -200;     // the same distance as b: a is first in the list, so it is the target
    const tie = pickTarget(t.s, t.s.actors[0], { pick: "closest", tag: "enemy" }, 520).id;

    const u = armed(0);
    u.s.actors[1].position.x = 180; u.s.actors[1].position.y = 240; // 300 away: the 3-4-5 triangle, inside the Radar (312)
    step(u.s, idle, u.bp);
    return { first, second, third, tie, bullet: JSON.parse(JSON.stringify(u.s.hitboxes)), avatarRadius: u.s.actors[0].radius, avatar: u.s.actors[0].position };
  `);
  assert.strictEqual(result.first, "biter_1");
  assert.strictEqual(result.second, "biter_0");
  assert.strictEqual(result.third, null);
  assert.strictEqual(result.tie, "biter_0");
  assert.strictEqual(result.bullet.length, 1);
  const [bullet] = plain(result.bullet);
  // Born at the center of the avatar (0, 0) (the user, 2026-11-13), then moved by its velocity in the same step: 8 x (0.6, 0.8).
  assert.ok(Math.abs(bullet.position.x - 4.8) < 1e-9 && Math.abs(bullet.position.y - 6.4) < 1e-9, JSON.stringify(bullet.position));
  assert.ok(Math.abs(bullet.velocity.x - 4.8) < 1e-9 && Math.abs(bullet.velocity.y - 6.4) < 1e-9);
  assert.deepStrictEqual([bullet.owner, bullet.attack, bullet.radius, bullet.framesLeft, bullet.damage, bullet.struck, bullet.pierceLeft], ["avatar_1", "repeater-arm", 6, null, { puncture: 10 }, [], 0]);
});

test("135 the repeater fires every 10 frames while it has a target and a round, and not at all without a target", () => {
  const result = run(`
    ${ARMED}
    const t = armed(0);
    const b = t.s.actors[1];
    b.position.x = 250; b.position.y = 0;
    const shots = [];
    let rounds = t.s.actors[0].weapons[0].magazine;
    for (let i = 1; i <= 31; i++) {
      step(t.s, idle, t.bp);
      const now = t.s.actors[0].weapons[0].magazine;
      if (now < rounds) shots.push(i);
      rounds = now;
    }
    b.position.x = 5000; // out of range: nothing to shoot at
    const before = t.s.actors[0].weapons[0].magazine;
    for (let i = 0; i < 30; i++) step(t.s, idle, t.bp);
    return { shots, quiet: t.s.actors[0].weapons[0].magazine === before };
  `, QUIET);
  assert.deepStrictEqual(plain(result.shots), [1, 11, 21, 31]);
  assert.strictEqual(result.quiet, true);
});

test("136 every round fired makes the mecha 6 kg lighter and its top speed a little higher (the weight is calculated at the start of each step, so it follows a shot one step later); reloading moves rounds from the reserve to the magazine and changes no weight; with nothing left it stops", () => {
  const result = run(`
    ${ARMED}
    const t = armed(0);
    const avatar = t.s.actors[0];
    const w = avatar.weapons[0];
    t.s.actors[1].position.x = 250; t.s.actors[1].position.y = 0;
    t.s.actors[1].health.now = 1000000; t.s.actors[1].health.max = 1000000; // a target that lasts: it is shot all the time
    const samples = [];
    for (let i = 1; i <= 21; i++) { step(t.s, idle, t.bp); if (i === 1 || i === 11 || i === 21) samples.push([w.magazine + w.reserve, avatar.weight, avatar.speed]); }
    // One round in the magazine and 40 in the reserve: the shot empties the magazine, the next step starts the reload.
    w.magazine = 1; w.reserve = 40; w.interval = 0; w.reload = 0;
    step(t.s, idle, t.bp); // the shot
    const afterShot = { magazine: w.magazine, reload: w.reload };
    step(t.s, idle, t.bp); // the reload starts
    const weightWhenReloadStarted = avatar.weight;
    const reloading = { magazine: w.magazine, reserve: w.reserve, reload: w.reload };
    const magazines = [];
    for (let i = 0; i < 89; i++) { step(t.s, idle, t.bp); magazines.push(w.magazine); }
    const lastFrame = { magazine: w.magazine, reserve: w.reserve, reload: w.reload };
    step(t.s, idle, t.bp); // the reload ends: the magazine is filled from the reserve
    const filled = { magazine: w.magazine, reserve: w.reserve, reload: w.reload, weight: avatar.weight };
    step(t.s, idle, t.bp); // and in the next step it fires again
    const firing = { magazine: w.magazine, interval: w.interval };
    // Nothing left in the magazine or in the reserve: nothing happens any more.
    t.s.hitboxes = [];
    w.magazine = 0; w.reserve = 0; w.interval = 0; w.reload = 0;
    for (let i = 0; i < 200; i++) step(t.s, idle, t.bp);
    return { samples, afterShot, reloading, weightWhenReloadStarted, stillEmpty: magazines.every((n) => n === 0), lastFrame, filled, firing, dry: { magazine: w.magazine, reload: w.reload, bullets: t.s.hitboxes.length } };
  `, QUIET);
  const [s1, s11, s21] = plain(result.samples);
  assert.deepStrictEqual([s1[0], s1[1]], [399, 7550]); // one round fired, and the weight still the loaded one: it follows next step
  assert.deepStrictEqual([s11[0], s11[1]], [398, 7550 - 6]);
  assert.deepStrictEqual([s21[0], s21[1]], [397, 7550 - 12]);
  for (const sample of [s1, s11, s21]) assert.ok(Math.abs(sample[2] - (4 - sample[1] * 0.0002)) < 1e-9); // the top speed follows the weight
  assert.ok(s21[2] > s11[2] && s11[2] > s1[2]);
  assert.deepStrictEqual(plain(result.afterShot), { magazine: 0, reload: 0 });
  assert.deepStrictEqual(plain(result.reloading), { magazine: 0, reserve: 40, reload: 90 });
  assert.strictEqual(result.stillEmpty, true); // 89 more frames: still empty
  assert.deepStrictEqual(plain(result.lastFrame), { magazine: 0, reserve: 40, reload: 1 });
  assert.deepStrictEqual(plain(result.filled), { magazine: 30, reserve: 10, reload: 0, weight: result.weightWhenReloadStarted }); // min(30, 40) rounds moved, no weight changed
  assert.strictEqual(result.firing.magazine, 29);
  assert.deepStrictEqual(plain(result.dry), { magazine: 0, reload: 0, bullets: 0 });
});

test("137 a bullet travels 8 px per frame, hurts the first thing it touches with its packet frozen at birth and, with pierce 0, ends there; the second thing in line is not touched", () => {
  const result = run(`
    ${ARMED}
    const t = armed(0, 1);
    const [near, far] = t.s.actors.slice(1);
    near.position.x = 200; near.position.y = 0;
    far.position.x = 300; far.position.y = 0;
    const w = t.s.actors[0].weapons[0];
    w.magazine = 1; w.reserve = 0; // one round only
    const positions = [];
    step(t.s, idle, t.bp);
    const born = JSON.parse(JSON.stringify(t.s.hitboxes[0]));
    t.s.actors[0].attacks["repeater-arm"].now.puncture = 99; // changed after it was born: the bullet keeps its own packet
    let frames = 0;
    while (t.s.hitboxes.length > 0 && frames < 100) { step(t.s, idle, t.bp); frames += 1; positions.push(t.s.hitboxes.length ? t.s.hitboxes[0].position.x : null); }
    return { born, frames, health: [near.health.now, far.health.now], positions: positions.slice(0, 3), ended: t.s.hitboxes.length };
  `, QUIET);
  assert.deepStrictEqual(plain(result.health), [20, 30]); // 10 puncture, no resistance; the bullet ended on the first
  assert.strictEqual(result.born.damage.puncture, 10);
  assert.deepStrictEqual(plain(result.born.struck), []);
  assert.ok(result.frames < 30, "the bullet did not end at the first hit: " + result.frames);
  assert.ok(Math.abs(result.positions[1] - result.positions[0] - 8) < 1e-9); // 8 px per frame along x
  assert.strictEqual(result.ended, 0);
});

test("138 pierce is how many times a bullet crosses: pierce 1 hurts two of three in line and ends on the second; pierce 3 hurts all three; each thing is hurt once", () => {
  const body = `
    ${ARMED}
    const t = armed(0, 1, 2);
    const list = t.s.actors.slice(1);
    list.forEach((b, i) => { b.position.x = 150 + i * 90; b.position.y = 0; });
    const w = t.s.actors[0].weapons[0];
    w.magazine = 1; w.reserve = 0;
    let most = 0;
    for (let i = 0; i < 80; i++) { step(t.s, idle, t.bp); most = Math.max(most, t.s.hitboxes.length ? t.s.hitboxes[0].struck.length : 0); }
    return { health: list.map((b) => b.health.now), most, left: t.s.hitboxes.length };
  `;
  const one = run(body, PIERCE_ONE);
  const three = run(body, PIERCE_THREE);
  assert.deepStrictEqual(plain(one.health), [20, 20, 30]); // crossed the first, ended on the second
  assert.strictEqual(one.left, 0);
  assert.deepStrictEqual(plain(three.health), [20, 20, 20]);
  assert.strictEqual(three.most, 3);
});

test("139 a bullet that kills leaves a corpse that the bullet does not spend a pierce on, and the dead actor is gone at the end of the step; the avatar's bullets never hurt the avatar", () => {
  const result = run(`
    ${ARMED}
    const t = armed(0, 1);
    const [weak, behind] = t.s.actors.slice(1);
    weak.position.x = 150; weak.position.y = 0; weak.health.now = 10; // one bullet kills it
    behind.position.x = 240; behind.position.y = 0;
    const w = t.s.actors[0].weapons[0];
    w.magazine = 1; w.reserve = 0;
    for (let i = 0; i < 40; i++) step(t.s, idle, t.bp);
    const avatar = t.s.actors[0];
    return { ids: t.s.actors.map((a) => a.id), behind: behind.health.now, avatarHealth: avatar.health.now, rule: hitboxHurts({ ignores: avatar.attacks.bodySlam.ignores }, avatar) };
  `, PIERCE_ONE);
  assert.deepStrictEqual(plain(result.ids), ["avatar_1", "biter_1"]); // the weak one is gone
  assert.strictEqual(result.behind, 20); // the bullet had a pierce left because the dead one did not spend it... and hurt this one
  assert.strictEqual(result.avatarHealth, 100);
  assert.strictEqual(result.rule, false);
});

test("140 a weapon must be sound when the data loads: only the closest rule, whole numbers, known types of damage, a bullet that is slower than the smallest radius it must not skip over", () => {
  const bad = (from, to) => assert.throws(() => loadGame((text) => text.replace(from, to)), /weapon of the part repeater-arm|projectile of the weapon|bullet of the weapon|rounds of the weapon/);
  bad('target: { pick: "closest", tag: "enemy" },\n        intervalFrames', 'target: { pick: "farthest", tag: "enemy" },\n        intervalFrames');
  bad('target: { pick: "closest", tag: "enemy" },\n        intervalFrames', 'target: { pick: "closest", tag: "" },\n        intervalFrames');
  bad('target: { pick: "closest", tag: "enemy" },\n        intervalFrames', 'target: "closest",\n        intervalFrames');
  bad("reloadFrames: 90", "reloadFrames: 0");
  bad("intervalFrames: 10", "intervalFrames: 1.5");
  bad("rounds: { weight: 6, magazine: 30, reserve: 370 }", "rounds: { weight: 1.5, magazine: 30, reserve: 370 }");
  bad("rounds: { weight: 6, magazine: 30, reserve: 370 }", "rounds: { weight: 6, magazine: 0, reserve: 370 }");
  bad("damage: { puncture: 10 }, speed", "damage: { fire: 10 }, speed");
  bad("damage: { puncture: 10 }, speed", "damage: { puncture: 0 }, speed");
  bad("radius: 6, pierce: 0", "radius: 6, pierce: -1");
  bad("radius: 6, pierce: 0", "radius: 6, pierce: 0.5");
  bad("speed: 8, radius: 6", "speed: 20, radius: 6"); // 20 >= 6 + 12: it could skip over a Biter of radius 12
});

test("141 a run of Chamber 2 with the repeater is reproducible: 900 frames with the avatar standing among 40 Biters give the same state twice and a clean cross-check, rounds are spent, the mecha is lighter, and Biters die", () => {
  const result = run(`
    const play = () => {
      const r = createRun(1, { parts: ["shoulder-r", "shoulder-l", "arm-r", "repeater-arm", "head", "torso", "legs", "generator", "booster"] });
      const s = createChamber2State(1, 1, r.blueprint);
      const h = createHistory(s, r.blueprint);
      for (let i = 0; i < 900; i++) {
        const input = { move: { x: 0, y: 0 } };
        step(s, input, r.blueprint);
        recordFrame(h, s, input);
      }
      return { s, check: crossCheck(h) };
    };
    const a = play();
    const b = play();
    const w = a.s.actors[0].weapons[0];
    return { same: JSON.stringify(a.s) === JSON.stringify(b.s), check: a.check, rounds: 400 - (w.magazine + w.reserve), weight: a.s.actors[0].weight, left: a.s.actors.length - 1 };
  `);
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.check, null);
  // The weight is calculated at the start of the step, so it can be one round behind the shots of the last step.
  assert.ok(result.rounds > 0 && [7550 - 6 * result.rounds, 7550 - 6 * (result.rounds - 1)].includes(result.weight), "rounds " + result.rounds + ", weight " + result.weight);
  assert.ok(result.left < 40, "no Biter died in 15 seconds of firing");
});

test("142 the body slam follows the weight the avatar has now: it is made once at the loaded weight (7.55 with the repeater full) and every round fired makes it 0.006 lighter; a hit by body slam takes that value", () => {
  const result = run(`
    ${ARMED}
    const t = armed(0);
    const avatar = t.s.actors[0];
    const w = avatar.weapons[0];
    const atBirth = { base: avatar.attacks.bodySlam.base.blunt, now: avatar.attacks.bodySlam.now.blunt, weight: avatar.weight };
    t.s.actors[1].position.x = 5000; // nothing to shoot: the rounds are spent by hand
    w.magazine = 10; w.reserve = 0;
    step(t.s, idle, t.bp);
    const spent = { base: avatar.attacks.bodySlam.base.blunt, now: avatar.attacks.bodySlam.now.blunt, weight: avatar.weight, wouldBe: avatar.weight * 0.001 };
    const packet = finalAttack(avatar, { impact: 6 });
    return { atBirth, spent, packet };
  `, QUIET);
  assert.ok(Math.abs(result.atBirth.base - 7.55) < 1e-12 && result.atBirth.now === result.atBirth.base);
  assert.strictEqual(result.spent.weight, 5150 + 6 * 10); // 10 rounds left, 6 kg each, on top of the parts
  assert.strictEqual(result.spent.base, result.atBirth.base); // the base stays as it was made
  assert.ok(Math.abs(result.spent.now - result.spent.wouldBe) < 1e-12 && result.spent.now < result.atBirth.now);
  assert.ok(Math.abs(result.packet.blunt - result.spent.now) < 1e-12); // at the reference impact the hit is exactly now
});

test("143 the weight of the avatar comes from the parts of the blueprint and the rounds in its own weapon state, so the two cannot disagree: an avatar made armed and stepped with a plain blueprint still carries its ammunition, and one made plain carries none", () => {
  const result = run(`
    const armed = createRun(1, { parts: ["shoulder-r", "shoulder-l", "arm-r", "repeater-arm", "head", "torso", "legs", "generator", "booster"] }).blueprint;
    const plain = createRun(1).blueprint;
    const a = createChamber2State(1, 1, armed); step(a, { move: { x: 0, y: 0 } }, plain);
    const b = createChamber2State(1, 1, plain); step(b, { move: { x: 0, y: 0 } }, armed);
    return { madeArmedSteppedPlain: a.actors[0].weight, madePlainSteppedArmed: b.actors[0].weight, weapons: [a.actors[0].weapons.length, b.actors[0].weapons.length] };
  `, QUIET);
  assert.strictEqual(result.madeArmedSteppedPlain, 5000 + 6 * 400); // the plain parts, and the 400 rounds it holds
  assert.strictEqual(result.madePlainSteppedArmed, 5150); // the armed parts, and no rounds: it has no weapon state
  assert.deepStrictEqual(plain(result.weapons), [1, 0]);
});

// ---- The shield (the user, 2026-11-12) ----
// The real Generator (shield: true), the world as QUIET (no objects, six Biters). The shield: a health that regenerates, from the
// Generator; it absorbs first; it adds resistance while it has something left; the ring (the radius of the avatar for collision
// and for being hit) goes from the body to 1.8 times the body in a straight line with the shield that is left.
const SHIELDED = loadGame((text) => text.replace("chancePercent: 35", "chancePercent: 0").replace("biters: { count: 40 }", "biters: { count: 6 }"), { shield: true });
const IDLE = "const idle = { move: { x: 0, y: 0 }, dash: false };";

test("144 the Generator gives the avatar its shield: 40, a wait of 180 frames, 0.25 back per frame, and 11 points of resistance to each type while it lasts; it is born full and not waiting, and its radius is the ring, 16 x 1.8", () => {
  const result = run(`
    const avatar = createAvatar(createRun(1).blueprint);
    const without = createAvatar({ parts: createRun(1).blueprint.parts.filter((id) => id !== "generator") });
    return { shield: avatar.shield, radius: avatar.radius, bodyRadius: avatar.bodyRadius, without: { shield: without.shield, radius: without.radius } };
  `, SHIELDED);
  assert.deepStrictEqual(plain(result.shield), { now: 40, max: 40, quiet: 180, delayFrames: 180, regenPerFrame: 0.25, resistance: { blunt: 11, puncture: 11, slash: 0 } });
  assert.strictEqual(result.bodyRadius, 16);
  assert.ok(Math.abs(result.radius - 16 * 1.8) < 1e-12);
  assert.strictEqual(result.without.shield.max, 0); // no Generator, no shield: and the radius is the body
  assert.strictEqual(result.without.radius, 16);
});

test("145 the shield absorbs first and what is left goes to health: a hit of 20 blunt costs 20 x 100 / 141 from the shield (30 points of the parts and 11 of the shield), and a bigger one empties the shield and the rest hurts the health", () => {
  const result = run(`
    const avatar = createAvatar(createRun(1).blueprint);
    const first = resolveDamage({ blunt: 20 }, avatar).total;
    applyDamage(avatar, first);
    const afterFirst = { shield: avatar.shield.now, health: avatar.health.now };
    const second = resolveDamage({ blunt: 100 }, avatar).total;
    applyDamage(avatar, second);
    return { first, afterFirst, second, shield: avatar.shield.now, health: avatar.health.now };
  `, SHIELDED);
  const first = 20 * (1 - 41 / 141);
  const second = 100 * (1 - 41 / 141);
  assert.ok(Math.abs(result.first - first) < 1e-12);
  assert.ok(Math.abs(result.afterFirst.shield - (40 - first)) < 1e-12 && result.afterFirst.health === 100); // health untouched while the shield lasts
  assert.ok(Math.abs(result.second - second) < 1e-12);
  assert.strictEqual(result.shield, 0);
  assert.ok(Math.abs(result.health - (100 - (second - (40 - first)))) < 1e-9); // what the shield could not take
});

test("146 the resistance of the shield counts only while it has something left: 41 points of blunt with it (30 + 11) and 30 without, and the record of the hit says how many came from the shield", () => {
  const result = run(`
    const avatar = createAvatar(createRun(1).blueprint);
    const alive = resolveDamage({ blunt: 50, puncture: 50 }, avatar);
    avatar.shield.now = 0;
    const dead = resolveDamage({ blunt: 50, puncture: 50 }, avatar);
    return { alive, dead };
  `, SHIELDED);
  assert.deepStrictEqual(plain(result.alive.parts.map((part) => [part.type, part.points, part.fromShield])), [["blunt", 41, 11], ["puncture", 21, 11]]);
  assert.deepStrictEqual(plain(result.dead.parts.map((part) => [part.type, part.points, part.fromShield])), [["blunt", 30, 0], ["puncture", 10, 0]]);
  assert.ok(result.alive.total < result.dead.total);
});

test("147 the shield waits 180 quiet frames after any damage and then gives back 0.25 per frame up to its maximum; damage during the regeneration starts the wait again", () => {
  const result = run(`
    ${IDLE}
    const s = createChamber2State(1, 1);
    s.actors = [s.actors[0]];
    const avatar = s.actors[0];
    applyDamage(avatar, 10); // 30 left, the wait starts
    const at = {};
    for (let i = 1; i <= 219; i++) {
      step(s, idle);
      if (i === 179 || i === 180 || i === 181 || i === 219) at[i] = avatar.shield.now;
    }
    applyDamage(avatar, 1); // damage again, when it is full: the wait starts again
    const hit = avatar.shield.now;
    for (let i = 1; i <= 179; i++) step(s, idle);
    const stillWaiting = avatar.shield.now;
    step(s, idle);
    return { at, hit, stillWaiting, back: avatar.shield.now };
  `, SHIELDED);
  assert.deepStrictEqual(plain(result.at), { 179: 30, 180: 30.25, 181: 30.5, 219: 40 }); // 39.75 at frame 218 and the maximum at 219: 30 + 40 x 0.25 = 40, and it stops there
  assert.strictEqual(result.hit, 39);
  assert.strictEqual(result.stillWaiting, 39); // 179 quiet frames: nothing yet
  assert.strictEqual(result.back, 39.25);
});

test("148 the radius of the avatar follows the shield in a straight line, from the body (16, empty) to the ring (28.8, full): half a shield is 22.4, and it is calculated again every frame and stored in the avatar", () => {
  const result = run(`
    ${IDLE}
    const s = createChamber2State(1, 1);
    s.actors = [s.actors[0]];
    const avatar = s.actors[0];
    const radii = [];
    for (const now of [40, 20, 0]) {
      avatar.shield.now = now; avatar.shield.quiet = 0; // quiet 0: nothing regenerates in this frame
      step(s, idle);
      radii.push(avatar.radius);
    }
    return { radii, body: avatar.bodyRadius };
  `, SHIELDED);
  assert.ok(Math.abs(result.radii[0] - 28.8) < 1e-12);
  assert.ok(Math.abs(result.radii[1] - 22.4) < 1e-12);
  assert.strictEqual(result.radii[2], 16);
  assert.strictEqual(result.body, 16); // the body itself never changes
});

test("149 the ring growing over a Biter hurts nobody (a hit needs an impact, and growing is not one): the Biter is only pushed out and nothing is absorbed; but walking into it with the shield up is a real hit that the shield takes", () => {
  const result = run(`
    ${IDLE}
    function scene(biterX) {
      const s = createChamber2State(1, 1);
      const biter = s.actors.find((actor) => actor.id === "biter_0");
      s.actors = [s.actors[0], biter];
      biter.ai.phase = "freeze"; biter.ai.frames = 1000000; // it stays where it is put and does not bite
      biter.position.x = biterX; biter.position.y = 0;
      return { s, avatar: s.actors[0], biter };
    }
    // growing: the shield is empty and the Biter is 2 px off the body; then the shield comes back all at once
    const grow = scene(0);
    grow.biter.position.x = 16 + grow.biter.radius + 2;
    grow.avatar.shield.now = 0; grow.avatar.shield.quiet = 0;
    step(grow.s, idle);
    const gap = grow.biter.position.x - grow.avatar.position.x - 16 - grow.biter.radius;
    grow.avatar.shield.now = 40;
    step(grow.s, idle);
    const grown = { shield: grow.avatar.shield.now, health: grow.avatar.health.now, biter: grow.biter.health.now, biterMax: grow.biter.health.max, apart: grow.biter.position.x - grow.avatar.position.x - grow.avatar.radius - grow.biter.radius };
    // walking: the same, but the avatar walks into the Biter
    const walk = scene(100);
    for (let i = 0; i < 60; i++) step(walk.s, { move: { x: 1, y: 0 }, dash: false });
    return { gap, grown, walked: { shield: walk.avatar.shield.now, health: walk.avatar.health.now, healthMax: walk.avatar.health.max, biter: walk.biter.health.now, biterMax: walk.biter.health.max } };
  `, SHIELDED);
  assert.ok(Math.abs(result.gap - 2) < 1e-9); // before: not touching
  assert.strictEqual(result.grown.shield, 40); // nothing was absorbed (the shield is full)
  assert.strictEqual(result.grown.health, 100);
  assert.strictEqual(result.grown.biter, result.grown.biterMax); // the Biter was not hurt either
  assert.ok(result.grown.apart > -1e-9); // and the ring pushed it out until it just touches
  assert.ok(result.walked.shield < 40 && result.walked.health === result.walked.healthMax); // a real hit: the shield takes it
  assert.ok(result.walked.biter < result.walked.biterMax);
});

test("150 the cross-check stays clean in a shielded run where Biters hit the avatar and the shield drains and comes back, and the state is plain numbers", () => {
  const result = run(`
    const s = createChamber2State(1, 1);
    const avatar = s.actors[0];
    const h = createHistory(s, createRun(1).blueprint);
    let lowest = avatar.shield.now;
    let lowestHealth = avatar.health.now;
    for (let i = 0; i < 900; i++) {
      const input = { move: { x: i % 120 < 80 ? 0.6 : -0.6, y: i % 200 < 100 ? 0.3 : -0.3 }, dash: i % 150 === 10 };
      step(s, input);
      recordFrame(h, s, input);
      lowest = Math.min(lowest, avatar.shield.now);
      lowestHealth = Math.min(lowestHealth, avatar.health.now);
    }
    return { check: crossCheck(h), lowest, lowestHealth, shield: avatar.shield, finite: JSON.stringify(avatar.shield).includes("null") === false };
  `, SHIELDED);
  assert.strictEqual(result.check, null);
  assert.ok(result.lowest < 40, "the Biters took some of the shield: " + result.lowest);
  assert.ok(result.finite);
});

test("151 the shield specs are checked when the data loads: resistance only to known types of damage, and the wait a whole number of frames, 1 or more", () => {
  assert.throws(() => loadGame((text) => text.replace("shieldResistance: { blunt: 11, puncture: 11 }", "shieldResistance: { fire: 11 }"), { shield: true }), /not a type of damage/);
  assert.throws(() => loadGame((text) => text.replace("shieldDelayFrames: 180", "shieldDelayFrames: 1.5"), { shield: true }), /whole number of frames/);
  assert.throws(() => loadGame((text) => text.replace("shieldMax: 40", "shieldMax: -1"), { shield: true }), /0 or more/);
});

// ---- The docs and the code ----

test("152 every function or constant that the \"Code layout\" of AGENTS.md names exists in src/ (so the map that every agent reads first cannot point to something that is gone)", () => {
  const agents = fs.readFileSync(path.join(__dirname, "..", "..", "AGENTS.md"), "utf8");
  const layout = agents.slice(agents.indexOf("## Code layout"), agents.indexOf("## Ideas"));
  assert.ok(layout.length > 1000, "the Code layout section was not found in AGENTS.md");
  const names = new Set([...layout.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((match) => match[1]));
  const code = fs.readdirSync(SRC).map((name) => fs.readFileSync(path.join(SRC, name), "utf8")).join("\n");
  const missing = [...names].filter((name) => !new RegExp("(function|const|let)\\s+" + name + "\\b").test(code));
  assert.ok(names.size > 50, "too few names were read from the Code layout: " + names.size);
  assert.deepStrictEqual(missing, []);
});

test("153 a bullet has no life in frames: it flies past the old range (520 px) and goes only when its center leaves the window of the grid around the avatar (the pierce and the bite are checked by tests 122 and 138)", () => {
  const result = run(`
    ${ARMED}
    const { s, bp } = armed();
    const bullet = (x) => ({ owner: "avatar_1", attack: "repeater-arm", position: { x, y: 0 }, radius: 6, framesLeft: null, damage: { puncture: 10 }, velocity: { x: 8, y: 0 }, struck: [], pierceLeft: 0, ignores: ["ally"] });
    s.hitboxes = [bullet(s.actors[0].position.x)];
    const edge = s.grid.windowWidth * s.grid.cellSize / 2;
    s.actors[0].position.y = 0;
    s.hitboxes[0].position.x = s.actors[0].position.x;
    let alive = 0;
    while (s.hitboxes.length > 0 && alive < 5000) { step(s, idle, bp); if (s.hitboxes.length > 0) alive += 1; }
    return { alive, edge };
  `);
  assert.ok(result.alive * 8 > 520, "it lived " + result.alive + " frames");
  assert.ok(Math.abs(result.alive * 8 - result.edge) <= 8, "it left at " + result.alive * 8 + " px, the edge is " + result.edge);
});

test("154 the Radar is the only truth about what can be aimed at: the Head gives the avatar a radius (312 px), the weapon has no range of its own, an actor beyond the Radar is not shot at and one inside is, and a blueprint with no Head sees nothing", () => {
  const result = run(`
    ${ARMED}
    const shotsAt = (x, makeBlueprint) => {
      const t = armed(0);
      if (makeBlueprint) { t.bp = makeBlueprint(t.bp); t.s = createChamber2State(1, 1, t.bp); t.s.actors = [t.s.actors[0], t.s.actors.find((a) => a.id === "biter_0")]; t.s.actors[1].ai.phase = "freeze"; t.s.actors[1].ai.frames = 1000000; }
      t.s.actors[1].position.x = x; t.s.actors[1].position.y = 0;
      step(t.s, idle, t.bp);
      return t.s.hitboxes.filter((h) => h.attack === "repeater-arm").length;
    };
    const base = armed(0);
    const noHead = (bp) => ({ ...bp, parts: bp.parts.filter((id) => id !== "head") });
    return { radar: base.s.actors[0].radar, inside: shotsAt(300), outside: shotsAt(340), none: shotsAt(100, noHead), recipeHasRange: "range" in DEFINITIONS.parts["repeater-arm"].weapon, starter: createRun(1).blueprint && createChamber1State(1, 1, createRun(1).blueprint).actors[0].radar };
  `);
  assert.strictEqual(result.radar, 312);
  assert.strictEqual(result.inside, 1);
  assert.strictEqual(result.outside, 0); // 340 is beyond 312 plus the radius of a Biter
  assert.strictEqual(result.none, 0);
  assert.strictEqual(result.recipeHasRange, false);
  assert.strictEqual(result.starter, 312);
});

test("155 the visual state holds no truth: 600 frames of Chamber 2 with it and without it give exactly the same state, and the cross-check is clean", () => {
  const result = run(`
    const play = (withVisual) => {
      const run = createRun(1, { parts: ["shoulder-r", "shoulder-l", "arm-r", "repeater-arm", "head", "torso", "legs", "generator", "booster"] });
      const s = createChamber2State(1, 1, run.blueprint);
      const visual = withVisual ? createVisual() : null;
      const history = createHistory(s, run.blueprint, visual);
      let traces = 0;
      for (let i = 0; i < 600; i++) {
        const input = { move: { x: 0, y: 0 } };
        step(s, input, run.blueprint, visual);
        recordFrame(history, s, input, visual);
        if (visual) traces = Math.max(traces, visual.traces.length);
      }
      return { state: JSON.stringify(s), check: crossCheck(history), traces };
    };
    const a = play(true);
    const b = play(false);
    return { same: a.state === b.state, check: a.check, traces: a.traces };
  `);
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.check, null);
  assert.ok(result.traces >= 1, "no trace was ever made");
});

test("156 a trace is born at age 0 where a one-frame hitbox was born, gets one frame older every step and goes when its age reaches traceFrames (12); a bullet, which flies, leaves none; the history keeps the visual state of every snap, and going back to a snap shows that frame's traces", () => {
  const result = run(`
    ${ARMED}
    const visual = createVisual();
    const t = armed(0);
    t.s.actors[1].position.x = 250; t.s.actors[1].position.y = 0;
    step(t.s, idle, t.bp, visual); // the repeater fires: a bullet flies
    const afterShot = visual.traces.length;
    const bite = createVisual();
    const u = armed(0);
    spawnHitbox(u.s, u.s.actors[1], "bite", 1, 0, { radius: 20, frames: 1, speed: 0, pierce: null }, bite);
    const born = JSON.parse(JSON.stringify(bite.traces));
    const ages = [];
    for (let i = 0; i < 13; i++) { step(u.s, idle, u.bp, bite); ages.push(bite.traces.length === 0 ? null : bite.traces[0].age); }
    const history = createHistory(u.s, u.bp, bite);
    step(u.s, idle, u.bp, bite); // one more step: a state that did not advance is not recorded (test 193)
    bite.traces.push({ position: { x: 1, y: 2 }, radius: 3, age: 4, frames: 12 });
    recordFrame(history, u.s, idle, bite);
    const back = visualFromSnap(history, 0);
    const forward = visualFromSnap(history, 1);
    return { afterShot, born, ages, backTraces: back.traces.length, forwardTraces: forward.traces.length, copy: back !== history.visuals[0] };
  `);
  assert.strictEqual(result.afterShot, 0);
  assert.deepStrictEqual(plain(result.born), [{ position: plain(result.born)[0].position, radius: 20, cone: null, age: 0, frames: 12 }]);
  assert.deepStrictEqual(plain(result.ages), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null, null]);
  assert.strictEqual(result.backTraces, 0);
  assert.strictEqual(result.forwardTraces, 1);
  assert.strictEqual(result.copy, true);
});

test("157 things are born after everyone has moved: a bullet fired in a step where the avatar dashes is born at the avatar's final position, toward the target as seen from there, and the bite of a Biter is born toward the avatar's final position", () => {
  const result = run(`
    ${ARMED}
    ${ALONE_BITERS}
    const t = armed(0);
    const target = t.s.actors[1];
    target.position.x = 0; target.position.y = -250;
    const avatar = t.s.actors[0];
    step(t.s, { move: { x: 1, y: 0 }, dash: true }, t.bp);
    const bullet = t.s.hitboxes.find((h) => h.attack === "repeater-arm");
    const dx = target.position.x - avatar.position.x, dy = target.position.y - avatar.position.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const expected = { x: avatar.position.x + (dx / d) * 8, y: avatar.position.y + (dy / d) * 8 }; // born at the center, then one move of 8

    const s = aloneBiters(0);
    const b = s.actors[1];
    b.position.x = 16 + b.radius + 5; b.position.y = 0;
    b.attacks.bite.windupFrames = 0;
    const visual = createVisual();
    s.actors[0].position.x = 0;
    step(s, { move: { x: 0, y: -1 }, dash: true }, undefined, visual); // the avatar leaves upward while the Biter strikes
    const ax = s.actors[0].position.x, ay = s.actors[0].position.y;
    const bx = ax - b.position.x, by = ay - b.position.y;
    const bd = Math.sqrt(bx * bx + by * by);
    return { bullet: bullet.position, expected, trace: visual.traces[0].position, biteExpected: { x: b.position.x + (bx / bd) * b.radius, y: b.position.y + (by / bd) * b.radius }, moved: avatar.position.x };
  `, QUIET);
  assert.ok(result.moved > 5, "the avatar did not dash: " + result.moved);
  assert.ok(Math.abs(result.bullet.x - result.expected.x) < 1e-9 && Math.abs(result.bullet.y - result.expected.y) < 1e-9, JSON.stringify([result.bullet, result.expected]));
  assert.ok(Math.abs(result.trace.x - result.biteExpected.x) < 1e-9 && Math.abs(result.trace.y - result.biteExpected.y) < 1e-9, JSON.stringify([result.trace, result.biteExpected]));
});

test("158 a Biter that died in the step does not strike: its decision to strike triggers nothing, and the flag goes down anyway", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1);
    const [avatar, a, b] = s.actors;
    for (const biter of [a, b]) { biter.position.x = 16 + biter.radius + 5; biter.position.y = biter.id === "biter_0" ? 0 : 60; biter.attacks.bite.windupFrames = 0; }
    b.position.x = -(16 + b.radius + 5); b.position.y = 0;
    a.health.now = 0; // died before the hitboxes are born (killed earlier in the step)
    const visual = createVisual();
    step(s, { move: { x: 0, y: 0 } }, undefined, visual);
    return { traces: visual.traces.length, flags: [a.ai.strike, b.ai.strike], phases: [a.ai.phase, b.ai.phase] };
  `, QUIET);
  assert.strictEqual(result.traces, 1); // only the living Biter struck
  assert.deepStrictEqual(plain(result.flags), [false, false]);
});

test("159 the combat audit writes every hit as a line with its numbers: a bite on the avatar (puncture 10 against 10 points of resistance), with the frame the screen shows when it is seen (the state after its step), and a bullet on a Biter, and the totals read from the lines add them up by kind of hit", () => {
  const result = run(`
    ${ALONE_BITERS}
    ${ARMED}
    const audit = createAudit();
    const s = aloneBiters(0);
    const avatar = s.actors[0];
    const b = s.actors[1];
    b.position.x = 16 + b.radius + 5; b.position.y = 0;
    b.attacks.bite.windupFrames = 0;
    const frameBefore = s.frame;
    step(s, { move: { x: 0, y: 0 } }, undefined, null, audit);
    const bite = JSON.parse(audit[0]);
    const frames = { before: frameBefore, after: s.frame };

    const t = armed(0);
    const target = t.s.actors[1];
    target.position.x = 250; target.position.y = 0;
    const shots = createAudit();
    for (let i = 0; i < 60 && shots.length === 0; i++) step(t.s, { move: { x: 0, y: 0 } }, t.bp, null, shots);
    const bullet = JSON.parse(shots[0]);
    return { bite, frames, bullet, biteTotals: combatAuditTotals(audit), bulletTotals: combatAuditTotals(shots), health: avatar.health.now };
  `, QUIET);
  const bite = plain(result.bite);
  assert.deepStrictEqual([bite.source, bite.attack, bite.target], ["biter_0", "bite", "avatar_1"]);
  // The frame of a hit is the frame the screen shows when it is seen: the state after the step it happened in (0 before, 1 after).
  assert.deepStrictEqual(plain(result.frames), { before: 0, after: 1 });
  assert.strictEqual(bite.frame, result.frames.after);
  assert.strictEqual(bite.parts.length, 1);
  const part = bite.parts[0];
  assert.deepStrictEqual([part.type, part.points, part.fromShield], ["puncture", 10, 0]);
  assert.ok(Math.abs(part.reduction - 10 / 110) < 1e-12);
  assert.ok(Math.abs(part.after - part.amount * (1 - 10 / 110)) < 1e-12);
  assert.ok(Math.abs(bite.total - part.after) < 1e-12 && bite.minimumApplied === false);
  assert.strictEqual(bite.shield, 0);
  assert.ok(Math.abs(bite.health - bite.total) < 1e-9, "health lost " + bite.health);
  assert.ok(Math.abs(result.health - (100 - bite.total)) < 1e-9);
  const totals = plain(result.biteTotals)["biter:bite"];
  assert.deepStrictEqual([Object.keys(plain(result.biteTotals)), totals.hits, totals.minimumApplied, totals.shield], [["biter:bite"], 1, 0, 0]);
  assert.ok(Math.abs(totals.total - bite.total) < 1e-12 && Math.abs(totals.health - bite.total) < 1e-9);
  const bullet = plain(result.bullet);
  assert.deepStrictEqual([bullet.source, bullet.attack, bullet.target, bullet.total, bullet.parts[0].points], ["avatar_1", "repeater-arm", "biter_0", 10, 0]);
  assert.deepStrictEqual(Object.keys(plain(result.bulletTotals)), ["avatar:repeater-arm"]);
});

test("160 the audit holds no truth and has no limit: 3000 frames of Chamber 2 with it and without it give the same state; the log keeps every hit (here far more than the old 100), each line a hit in frame order, and the totals read from it count the same number of hits", () => {
  const result = run(`
    const play = (withAudit) => {
      const run = createRun(1, { parts: ["shoulder-r", "shoulder-l", "arm-r", "repeater-arm", "head", "torso", "legs", "generator", "booster"] });
      const s = createChamber2State(1, 1, run.blueprint);
      const audit = withAudit ? createAudit() : null;
      s.actors[0].health.now = 1e9; // the fight must go on for 3000 frames: at zero health the mission would be aborted (test 190)
      for (let i = 0; i < 3000; i++) step(s, { move: { x: 0, y: 0 } }, run.blueprint, null, audit);
      return { state: JSON.stringify(s), audit };
    };
    const a = play(true);
    const b = play(false);
    const entries = a.audit.map((line) => JSON.parse(line));
    const counted = Object.values(combatAuditTotals(a.audit)).reduce((sum, t) => sum + t.hits, 0);
    let ordered = true;
    for (let i = 1; i < entries.length; i++) if (entries[i].frame < entries[i - 1].frame) ordered = false;
    return { same: a.state === b.state, lines: a.audit.length, allHits: entries.every((e) => e.event === "hit"), ordered, counted, none: b.audit };
  `);
  assert.strictEqual(result.same, true);
  assert.ok(result.lines > 100, "the log must keep more than the old limit of 100: " + result.lines);
  assert.strictEqual(result.allHits, true);
  assert.strictEqual(result.ordered, true);
  assert.strictEqual(result.counted, result.lines);
  assert.strictEqual(result.none, null);
});

test("161 a circle touches a cone when it overlaps it at all: center inside, only the arc, only a straight edge, only the tip, and the misses (behind, beyond, to the side, touching exactly)", () => {
  const result = run(`
    // a cone at the origin pointing right, reach 100, half angle 45 degrees (cos and sin of 45 = 0.7071067811865476)
    const c = 0.7071067811865476;
    const hit = (x, y, radius) => circleTouchesCone(0, 0, 1, 0, 100, c, c, x, y, radius);
    return {
      centerInside: hit(50, 0, 1),
      centerInsideNearEdge: hit(50, 49, 1),
      onlyArc: hit(104, 0, 5),
      arcMissJustOut: hit(110, 0, 5),
      arcTouchingExactly: hit(105, 0, 5),
      onlyEdge: hit(50, 56, 5),
      edgeMiss: hit(50, 62, 5),
      onlyTip: hit(-4, 0, 5),
      tipMiss: hit(-6, 0, 5),
      behind: hit(-50, 0, 5),
      beyondTheEdgeLength: hit(100, 100, 5),
      lowerEdge: hit(50, -56, 5),
      lowerEdgeMiss: hit(50, -62, 5),
      pointedUp: circleTouchesCone(0, 0, 0, -1, 100, c, c, 0, -50, 1),
      pointedUpSideMiss: circleTouchesCone(0, 0, 0, -1, 100, c, c, 50, -10, 1),
    };
  `);
  assert.deepStrictEqual(plain(result), {
    centerInside: true, centerInsideNearEdge: true, onlyArc: true, arcMissJustOut: false, arcTouchingExactly: false,
    onlyEdge: true, edgeMiss: false, onlyTip: true, tipMiss: false, behind: false, beyondTheEdgeLength: false,
    lowerEdge: true, lowerEdgeMiss: false, pointedUp: true, pointedUpSideMiss: false,
  });
});

test("162 a cone is a hitbox shape: born pointing where it was told (and staying so), it hurts a target that overlaps it by any part, once, and not one outside; its trace carries the shape", () => {
  const result = run(`
    ${ARMED}
    ${ALONE_BITERS}
    const c = 0.7071067811865476;
    const cone = { reach: 100, cosHalf: c, sinHalf: c };
    const swing = (x, y) => {
      const visual = createVisual();
      const t = armed(0);
      const avatar = t.s.actors[0];
      avatar.position.x = 0; avatar.position.y = 0;
      const target = t.s.actors[1];
      target.position.x = x; target.position.y = y;
      const before = target.health.now;
      t.s.hitboxes = [];
      spawnHitbox(t.s, avatar, "repeater-arm", 1, 0, { radius: 0, frames: 1, speed: 0, pierce: null, cone }, visual);
      const born = JSON.parse(JSON.stringify(t.s.hitboxes[0]));
      resolveHitboxes(t.s);
      return { hurt: target.health.now < before, struck: born.struck, cone: born.cone, tip: born.position, traceCone: visual.traces[0].cone, left: t.s.hitboxes.length };
    };
    return { inside: swing(60, 0), halfInside: swing(60, 60), outside: swing(-60, 0), beyond: swing(160, 0) };
  `);
  const r = plain(result);
  assert.strictEqual(r.inside.hurt, true);
  assert.strictEqual(r.halfInside.hurt, true, "a target half inside is hit");
  assert.strictEqual(r.outside.hurt, false);
  assert.strictEqual(r.beyond.hurt, false);
  assert.deepStrictEqual(r.inside.cone, { dirX: 1, dirY: 0, reach: 100, cosHalf: 0.7071067811865476, sinHalf: 0.7071067811865476 });
  assert.deepStrictEqual(r.inside.traceCone, r.inside.cone);
  assert.deepStrictEqual(r.inside.tip, { x: 0, y: 0 }); // the avatar's hitboxes are born at its center (the user, 2026-11-13)
  assert.strictEqual(r.inside.left, 0); // one frame: gone
});

test("163 the sword arm is data: its recipe (melee, not weapon) is read and checked; a bad reach, angle, frames, aim correction, type of damage, or a part with both weapon and melee stops the game with a message that names it", () => {
  const sword = plain(run("return DEFINITIONS.parts['sword-arm']"));
  assert.deepStrictEqual(sword.melee, { ignores: ["self", "ally"], exit: "center", repeat: "life", scale: "none", target: { pick: "closest", tag: "enemy" }, reach: 90, angleDegrees: 90, windupFrames: 12, recoveryFrames: 18, aimCorrection: 0.1, damage: { slash: { flat: 30, perWeight: 0 } } });
  assert.strictEqual(sword.weapon, undefined);
  const bad = (from, to, message) => assert.throws(() => loadGame((text) => text.replace(from, to)), message);
  bad("reach: 90,", "reach: 0,", /reach of the melee/);
  bad("angleDegrees: 90,", "angleDegrees: 200,", /angleDegrees of the melee/);
  bad("windupFrames: 12,", "windupFrames: 0,", /windupFrames of the melee/);
  bad("recoveryFrames: 18,", "recoveryFrames: 1.5,", /recoveryFrames of the melee/);
  bad("aimCorrection: 0.1,", "aimCorrection: 2,", /aimCorrection of the melee/);
  bad("damage: { slash: { flat: 30, perWeight: 0 } },", "damage: { cut: { flat: 30, perWeight: 0 } },", /not a type of damage/);
  bad("damage: { slash: { flat: 30, perWeight: 0 } },", "damage: { slash: { flat: 30, perWeight: -1 } },", /flat and perWeight/);
  bad("      melee: {", "      weapon: { exit: \"center\", repeat: \"life\", scale: \"none\", target: { pick: \"closest\", tag: \"enemy\" }, intervalFrames: 10, reloadFrames: 90, rounds: { weight: 6, magazine: 30, reserve: 370 }, projectile: { damage: { puncture: 10 }, speed: 8, radius: 6, pierce: 0 } },\n      melee: {", /weapon and melee/);
});

test("164 the sword swings: a target inside the reach starts the windup (12 frames), the cone is born at the last one and hurts for one frame (30 of slash), then 18 frames of recovery and the next windup; a target outside the reach starts nothing", () => {
  const result = run(`
    const swordParts = ["shoulder-r", "shoulder-l", "sword-arm", "arm-l", "head", "torso", "legs", "generator", "booster"];
    function swordGame(x, y) {
      const run = createRun(1, { parts: swordParts });
      const s = createChamber2State(1, 1, run.blueprint);
      s.actors = [s.actors[0], s.actors.find((actor) => actor.id === "biter_0")];
      const biter = s.actors[1];
      biter.ai.phase = "freeze"; biter.ai.frames = 1000000; biter.health.now = 90; biter.health.max = 90;
      biter.position.x = x; biter.position.y = y;
      s.actors[0].position.x = 0; s.actors[0].position.y = 0;
      return { s, bp: run.blueprint, biter };
    }
    const idle = { move: { x: 0, y: 0 } };
    const near = swordGame(60, 0);
    const sword = near.s.actors[0].melees[0];
    const start = JSON.parse(JSON.stringify(sword));
    const blows = [];
    const phases = [];
    let last = 90;
    for (let i = 1; i <= 44; i++) {
      step(near.s, idle, near.bp);
      phases.push(sword.phase + ":" + sword.frames);
      if (near.biter.health.now < last) { blows.push([i, last - near.biter.health.now]); last = near.biter.health.now; }
    }
    const far = swordGame(300, 0);
    for (let i = 0; i < 40; i++) step(far.s, idle, far.bp);
    return { start, blows, phases: phases.slice(0, 2).concat(phases.slice(11, 14)).concat(phases.slice(29, 32)), farPhase: far.s.actors[0].melees[0].phase, farHealth: far.biter.health.now, attack: near.s.actors[0].attacks["sword-arm"], starterMelees: createChamber1State(1, 1, createRun(1).blueprint).actors[0].melees };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.start, { part: "sword-arm", phase: "idle", frames: 0, dirX: 1, dirY: 0 });
  assert.deepStrictEqual(r.blows, [[13, 30], [43, 30]]);
  assert.deepStrictEqual(r.phases, ["windup:12", "windup:11", "windup:1", "recovery:18", "recovery:17", "recovery:1", "windup:12", "windup:11"]);
  assert.strictEqual(r.farPhase, "idle");
  assert.strictEqual(r.farHealth, 90);
  assert.deepStrictEqual(r.attack.base, { slash: 30 });
  assert.strictEqual(r.attack.reach, 90);
  assert.deepStrictEqual(r.starterMelees, []);
});

test("165 the aim of the sword is locked when the windup starts but may be corrected: each frame it moves aimCorrection of the way toward where the target is now (length stays 1); with 0 it never turns; with the target still it stays", () => {
  const code = `
    const swordParts = ["shoulder-r", "shoulder-l", "sword-arm", "arm-l", "head", "torso", "legs", "generator", "booster"];
    function swordGame(x, y) {
      const run = createRun(1, { parts: swordParts });
      const s = createChamber2State(1, 1, run.blueprint);
      s.actors = [s.actors[0], s.actors.find((actor) => actor.id === "biter_0")];
      const biter = s.actors[1];
      biter.ai.phase = "freeze"; biter.ai.frames = 1000000; biter.health.now = 90; biter.health.max = 90;
      biter.position.x = x; biter.position.y = y;
      s.actors[0].position.x = 0; s.actors[0].position.y = 0;
      return { s, bp: run.blueprint, biter };
    }
    const idle = { move: { x: 0, y: 0 } };
    function aimAfter(moveTo) {
      const g = swordGame(60, 0);
      const sword = g.s.actors[0].melees[0];
      step(g.s, idle, g.bp); // the windup starts: locked toward (1, 0)
      const locked = [sword.dirX, sword.dirY];
      if (moveTo) { g.biter.position.x = moveTo[0]; g.biter.position.y = moveTo[1]; }
      for (let i = 0; i < 5; i++) step(g.s, idle, g.bp);
      return { locked, aim: [sword.dirX, sword.dirY], length: Math.sqrt(sword.dirX * sword.dirX + sword.dirY * sword.dirY) };
    }
    return { still: aimAfter(null), moved: aimAfter([0, 60]) };
  `;
  const turning = plain(run(code));
  const fixed = plain(run(code, loadGame((text) => text.replace("aimCorrection: 0.1,", "aimCorrection: 0,"))));
  assert.deepStrictEqual(turning.still.aim, [1, 0]);
  assert.deepStrictEqual(turning.moved.locked, [1, 0]);
  assert.ok(turning.moved.aim[0] > 0 && turning.moved.aim[1] > 0.1, "it turned toward the target, below it: " + turning.moved.aim);
  assert.ok(turning.moved.aim[1] < 0.9, "but not all the way: " + turning.moved.aim);
  assert.ok(Math.abs(turning.moved.length - 1) < 1e-12);
  assert.deepStrictEqual(fixed.moved.aim, [1, 0]);
});

test("166 the blow comes even if the target is gone during the windup (as the Biter's does): it lands on nothing and the recovery begins at the same step", () => {
  const result = run(`
    const run = createRun(1, { parts: ["shoulder-r", "shoulder-l", "sword-arm", "arm-l", "head", "torso", "legs", "generator", "booster"] });
    const s = createChamber2State(1, 1, run.blueprint);
    s.actors = [s.actors[0], s.actors.find((actor) => actor.id === "biter_0")];
    s.actors[1].ai.phase = "freeze"; s.actors[1].ai.frames = 1000000;
    s.actors[1].position.x = 60; s.actors[1].position.y = 0;
    s.actors[0].position.x = 0; s.actors[0].position.y = 0;
    const idle = { move: { x: 0, y: 0 } };
    const sword = s.actors[0].melees[0];
    for (let i = 1; i <= 13; i++) {
      step(s, idle, run.blueprint);
      if (i === 3) s.actors[1].health.now = 0; // dies in the middle of the windup, and leaves at the end of the next step
    }
    return { phase: sword.phase, frames: sword.frames, actors: s.actors.length, hitboxes: s.hitboxes.length };
  `);
  assert.deepStrictEqual(plain(result), { phase: "recovery", frames: 18, actors: 1, hitboxes: 0 });
});

test("167 the combat blueprint has the sword arm (the right arm) and the repeater arm (the left): 5350 kg plus 2400 of ammunition is 7750, under the 8000 of the Torso, and the avatar of Chamber 2 starts with one sword and one weapon", () => {
  const result = run(`
    const run = createRun(1, DEFINITIONS.combatBlueprint);
    const s = createChamber2State(1, 1, run.blueprint);
    const avatar = s.actors[0];
    return { parts: run.blueprint.parts, loaded: totalWeight(run.blueprint), capacity: avatar.capacity ?? null, melees: avatar.melees.map((m) => m.part), weapons: avatar.weapons.map((w) => w.part), attacks: Object.keys(avatar.attacks) };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.parts, ["shoulder-r", "shoulder-l", "sword-arm", "repeater-arm", "head", "torso", "legs", "generator", "booster"]);
  assert.strictEqual(r.loaded, 7750);
  assert.deepStrictEqual(r.melees, ["sword-arm"]);
  assert.deepStrictEqual(r.weapons, ["repeater-arm"]);
  assert.ok(r.attacks.includes("sword-arm") && r.attacks.includes("repeater-arm"));
});

test("168 AGENTS.md opens with the two foundations (go slowly; break big tasks into small closed steps), before any other section, so no agent can miss them", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "..", "AGENTS.md"), "utf8");
  const first = text.indexOf("\n## ");
  assert.ok(text.slice(first).startsWith("\n## The two foundations"), "the first section must be the two foundations");
  const section = text.slice(first, text.indexOf("\n## ", first + 5));
  assert.ok(/Go slowly and deliberately/.test(section) && /Break every big task into small steps/.test(section));
});

// ---- The first dash and the safe ground around the start (review 2026-11-13, point 1; issue 4) ----
// The promise of safeRadius: the very first dash, straight from the start, cannot touch an object. The avatar is born with a
// full shield, so its radius at that moment is the ring, not the body; and the blueprint decides the top speed, so a heavier
// mecha dashes farther before it is back at its top speed. So the dash is not computed by a formula here: it is played, for
// every blueprint in the data, in a world with no objects and nobody else, with the real shield.
function firstDash(where) {
  return plain(run(`
    const result = {};
    for (const name of Object.keys(DEFINITIONS).filter((key) => key.endsWith("Blueprint"))) {
      const blueprint = DEFINITIONS[name];
      const s = createChamber2State(1, 1, blueprint);
      const avatar = s.actors.find((actor) => actor.id === AVATAR_ID);
      const radius = avatar.radius; // at birth: the ring, when the blueprint has a shield
      step(s, { move: { x: 1, y: 0 }, dash: true }, blueprint);
      let frames = 1;
      while (Math.abs(avatar.move.velocity.x) > avatar.speed && frames < 600) {
        step(s, { move: { x: 1, y: 0 }, dash: false }, blueprint);
        frames += 1;
      }
      result[name] = { radius, distance: avatar.position.x, frames };
    }
    const layers = DEFINITIONS.terrain.objects.layers;
    const safe = Object.keys(layers).map((id) => ({ id, safeRadius: layers[id].safeRadius, largest: objectMargin(layers[id]) }));
    return { dashes: result, safe };
  `, where));
}
// Every pair of a blueprint and a layer whose promise is broken: dash + radius at birth + largest object of the layer >= safeRadius.
function brokenPromises(measured) {
  const broken = [];
  for (const [name, dash] of Object.entries(measured.dashes)) {
    for (const layer of measured.safe) {
      const needed = dash.distance + dash.radius + layer.largest;
      if (!(needed < layer.safeRadius)) broken.push(name + " in " + layer.id + ": " + needed + " >= " + layer.safeRadius);
    }
  }
  return broken;
}
const EMPTY_SHIELDED = (patch = (text) => text) => loadGame((text) => patch(text.replace("chancePercent: 35", "chancePercent: 0").replace(/dummies: \{ count: \d+ \}/, "dummies: { count: 0 }").replace(/biters: \{ count: \d+ \}/, "biters: { count: 0 }")), { shield: true });

test("169 the first dash cannot touch an object, for every blueprint in the data, with the shield full: the starter dashes 142.5 px and the combat 147.45 px, born at the ring (28.8), so with the largest object (32) the safe radius must be above 208.25", () => {
  const measured = firstDash(EMPTY_SHIELDED());
  assert.deepStrictEqual(measured.dashes.starterBlueprint, { radius: 28.8, distance: 142.5, frames: 19 });
  assert.deepStrictEqual(measured.dashes.combatBlueprint, { radius: 28.8, distance: 147.45, frames: 21 });
  assert.deepStrictEqual(measured.safe.map((layer) => layer.largest), [32]);
  assert.deepStrictEqual(brokenPromises(measured), []);

  // The check can fail: with the old safe radius of 200 both blueprints break it (203.3 and 208.25).
  const old = firstDash(EMPTY_SHIELDED((text) => patchOnce(text, "safeRadius: 220,", "safeRadius: 200,")));
  assert.strictEqual(brokenPromises(old).length, 2);
});

// ---- Hitboxes of the avatar are born at its center (the user, 2026-11-13; review of that day, point 2; issue 2) ----
// "The reach of the sword stays untouched; the point of origin is the center of the avatar/actor." The sword tests above play
// without a shield, where the body is the only radius; this one plays with the real shield, full (the ring) and empty (the body).
const SWORD_SHIELDED = loadGame((text) => text.replace("chancePercent: 35", "chancePercent: 0").replace(/biters: \{ count: \d+ \}/, "biters: { count: 1 }"), { shield: true });

test("170 the reach of the sword is counted from the center of the avatar, so the shield does not change it: with the shield full (radius 28.8) or empty (16) a Biter whose edge is 90 px from the center starts the windup and one at 90.5 does not; the cone is born at the center and never hurts the avatar or its shield", () => {
  const result = run(`
    const swordParts = ["shoulder-r", "shoulder-l", "sword-arm", "arm-l", "head", "torso", "legs", "generator", "booster"];
    function swordGame(gap, shieldFull) {
      const run = createRun(1, { parts: swordParts });
      const s = createChamber2State(1, 1, run.blueprint);
      const avatar = s.actors[0];
      const biter = s.actors[1];
      biter.ai.phase = "freeze"; biter.ai.frames = 1000000;
      avatar.position.x = 0; avatar.position.y = 0;
      if (!shieldFull) avatar.shield.now = 0;
      biter.position.x = gap + biter.radius; biter.position.y = 0; // its edge is "gap" px from the center of the avatar
      return { s, bp: run.blueprint, avatar, biter };
    }
    const idle = { move: { x: 0, y: 0 } };
    const phaseAfterOneStep = (gap, shieldFull) => {
      const g = swordGame(gap, shieldFull);
      step(g.s, idle, g.bp);
      return { phase: g.avatar.melees[0].phase, radius: g.avatar.radius };
    };
    const blow = swordGame(60, true);
    const before = { health: blow.avatar.health.now, shield: blow.avatar.shield.now };
    // The cone lives one frame and is gone by the end of its step, so where it was born is read from its trace (visual state).
    const visual = createVisual();
    let tip = null;
    for (let i = 0; i < 13; i++) {
      step(blow.s, idle, blow.bp, visual);
      const trace = visual.traces.find((t) => t.cone && t.age === 0);
      if (trace) tip = { x: trace.position.x, y: trace.position.y, avatar: { x: blow.avatar.position.x, y: blow.avatar.position.y } };
    }
    return {
      fullAt: phaseAfterOneStep(90, true), fullPast: phaseAfterOneStep(90.5, true),
      emptyAt: phaseAfterOneStep(90, false), emptyPast: phaseAfterOneStep(90.5, false),
      tip, before, after: { health: blow.avatar.health.now, shield: blow.avatar.shield.now }, biterHurt: blow.biter.health.now < blow.biter.health.max,
    };
  `, SWORD_SHIELDED);
  const r = plain(result);
  assert.deepStrictEqual(r.fullAt, { phase: "windup", radius: 28.8 });
  assert.deepStrictEqual(r.fullPast, { phase: "idle", radius: 28.8 });
  assert.deepStrictEqual(r.emptyAt, { phase: "windup", radius: 16 });
  assert.deepStrictEqual(r.emptyPast, { phase: "idle", radius: 16 });
  assert.ok(r.tip !== null, "the cone was never born");
  assert.deepStrictEqual({ x: r.tip.x, y: r.tip.y }, r.tip.avatar); // the tip of the cone is the center of the avatar
  assert.strictEqual(r.biterHurt, true);
  assert.deepStrictEqual(r.after, r.before); // the avatar's own cone hurts neither it nor its shield
});

// ---- The static list can be called again (review 2026-11-13, point 3; issue 5) ----
// The radius of an actor with a shield is in both lists: static (the body) and dynamic (the ring follows the shield). When the
// static list read the body from actor.radius, calling it again on a living avatar took the ring for the body, and each call
// made a ring of the ring. Nothing calls it twice today; the first thing that changes the avatar during a run will.
test("171 calling the static and dynamic lists again on a living avatar changes nothing: with the real shield the body stays 16 and the ring 28.8, twice over, and the whole avatar is the same as after one call", () => {
  const result = run(`
    const blueprint = DEFINITIONS.combatBlueprint;
    const avatar = createAvatar(blueprint);
    const once = JSON.parse(JSON.stringify(avatar));
    const radii = [];
    for (let i = 0; i < 2; i++) {
      finalizeStatic(avatar, blueprint);
      finalizeDynamic(avatar, blueprint);
      radii.push([avatar.bodyRadius, avatar.radius]);
    }
    return { once, again: JSON.parse(JSON.stringify(avatar)), radii };
  `, SWORD_SHIELDED);
  const r = plain(result);
  assert.deepStrictEqual(r.radii, [[16, 28.8], [16, 28.8]]);
  assert.deepStrictEqual(r.again, r.once);
});

// ---- The combat audit, "caudit": the lines (the user, 2026-11-13; build step 1) ----
test("172 the combat audit writes one line per event, each a single JSON object that starts with the frame and the kind of event: a hit carries the ids of both sides and what came into effect in its damage calculation; a resume says the simulation resumed from frame X; a start names the run and the chamber", () => {
  const result = run(`
    const resolved = { parts: [{ type: "puncture", amount: 10, points: 10, fromShield: 0, reduction: 10 / 110, after: 10 * (1 - 10 / 110) }], total: 10 * (1 - 10 / 110), minimumApplied: false };
    const taken = { shield: 0, health: resolved.total };
    return {
      hit: combatAuditHitLine(42, "biter_3", "bite", "avatar_1", resolved, taken),
      resume: combatAuditResumeLine(450),
      start: combatAuditStartLine(0, 1, "chamber-2"),
      resolved, taken,
    };
  `);
  const r = plain(result);
  for (const line of [r.hit, r.resume, r.start]) {
    assert.ok(!line.includes("\n"), "one line: " + line);
    assert.deepStrictEqual(Object.keys(JSON.parse(line)).slice(0, 2), ["frame", "event"]);
  }
  const hit = JSON.parse(r.hit);
  assert.deepStrictEqual(Object.keys(hit), ["frame", "event", "source", "attack", "target", "parts", "total", "minimumApplied", "shield", "health"]);
  assert.deepStrictEqual([hit.frame, hit.event, hit.source, hit.attack, hit.target], [42, "hit", "biter_3", "bite", "avatar_1"]);
  assert.deepStrictEqual(hit.parts, r.resolved.parts); // the numbers come out exactly as they went in
  assert.deepStrictEqual([hit.total, hit.minimumApplied, hit.shield, hit.health], [r.resolved.total, false, 0, r.taken.health]);
  assert.deepStrictEqual(JSON.parse(r.resume), { frame: 450, event: "resume" });
  assert.deepStrictEqual(JSON.parse(r.start), { frame: 0, event: "start", run: 1, chamber: "chamber-2" });
});

test("173 the combat audit totals are read from the lines: two bites and a bullet and a start and a resume give two kinds (\"biter:bite\" with 2 hits, \"avatar:repeater-arm\" with 1), summing total, shield and health and counting the minimum; the start and resume lines count for nothing, and an empty log gives no totals", () => {
  const result = run(`
    const part = { type: "puncture", amount: 10, points: 0, fromShield: 0, reduction: 0, after: 10 };
    const hit = (frame, source, attack, target, total, shield, health, minimumApplied) =>
      combatAuditHitLine(frame, source, attack, target, { parts: [part], total, minimumApplied }, { shield, health });
    const lines = [
      combatAuditStartLine(0, 1, "chamber-2"),
      hit(10, "biter_3", "bite", "avatar_1", 8, 3, 5, false),
      hit(11, "avatar_1", "repeater-arm", "biter_7", 4, 0, 4, true),
      combatAuditResumeLine(5),
      hit(6, "biter_12", "bite", "avatar_1", 2, 0, 2, true),
    ];
    return { totals: combatAuditTotals(lines), empty: combatAuditTotals([]) };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.totals, {
    "biter:bite": { hits: 2, total: 10, shield: 3, health: 7, minimumApplied: 1 },
    "avatar:repeater-arm": { hits: 1, total: 4, shield: 0, health: 4, minimumApplied: 1 },
  });
  assert.deepStrictEqual(r.empty, {});
});

test("174 the history keeps no copy of the combat audit: its record has only the snaps, the inputs, the visual copies and the blueprint, and stepping a run on writes lines only into the log, which is never rewound by the history (discarding after a snap leaves it whole)", () => {
  const result = run(`
    const run = createRun(1, DEFINITIONS.combatBlueprint);
    const s = createChamber2State(1, 1, run.blueprint);
    const audit = createAudit();
    const history = createHistory(s, run.blueprint, null);
    for (let i = 0; i < 1500; i++) {
      const input = { move: { x: 0, y: 0 } };
      step(s, input, run.blueprint, null, audit);
      recordFrame(history, s, input, null);
    }
    const written = audit.length;
    discardAfter(history, 10);
    return { keys: Object.keys(history), written, after: audit.length, snaps: history.snaps.length, hasFromSnap: typeof auditFromSnap };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.keys, ["snaps", "inputs", "visuals", "blueprint"]);
  assert.ok(r.written > 0, "the run must have written some lines");
  assert.strictEqual(r.after, r.written);
  assert.strictEqual(r.snaps, 11);
  assert.strictEqual(r.hasFromSnap, "undefined");
});

test("175 the screen writes the two descriptive lines of the combat audit: startChamber writes the start line (the frame, the run and the chamber) right after creating the log, playGame writes the resume line with the frame it resumes from, and stepBack and stepForward write nothing themselves (walking through saved states leaves the log alone)", () => {
  const main = readSource("main.js");
  const body = (name) => {
    const at = main.indexOf("function " + name + "(");
    assert.ok(at >= 0, name + " not found in main.js");
    return main.slice(at, main.indexOf("\n}\n", at));
  };
  const start = body("startChamber");
  assert.ok(start.indexOf("audit = createAudit();") >= 0 && start.indexOf("audit.push(combatAuditStartLine(state.frame, run.id, id))") > start.indexOf("audit = createAudit();"), "startChamber must write the start line after creating the log");
  assert.ok(body("playGame").includes("audit.push(combatAuditResumeLine(state.frame))"), "playGame must write the resume line");
  assert.ok(!body("stepBack").includes("audit"), "stepBack must not touch the log");
  assert.ok(!body("stepForward").includes("audit"), "stepForward must not touch the log itself (a new step goes through stepLive, which the rules write from)");
});

// ---- Tags of exclusion (the user, 2026-11-13; step B) ----
test("176 every type has tags and a list of ignored tags for its body (bodyIgnores, written into the thing as the list of its bodySlam attack) in its recipe, and the tags are written into the thing when it is made: the avatar is ally and ignores ally; the Biter and the Dummy are enemy and ignore enemy and object; the rock and the Shroom are object and ignore enemy and object; a thing made by finalizeObject carries its tags (and a copy, not the recipe's own array), tagsOf reads the thing and so a Biter given the tag ally is not an enemy any more", () => {
  const result = run(`
    const types = ["avatar", "dummy", "biter", "rock", "shroom"];
    const table = {};
    for (const type of types) table[type] = { tags: tagsOf(finalizeObject(type, {}, undefined, "x")), ignores: finalizeObject(type, {}, undefined, "x").attacks.bodySlam.ignores };
    const made = finalizeObject("biter", {}, undefined, "x");
    const copy = made.tags !== definitionOf(made).tags;
    const summoned = finalizeObject("biter", {}, undefined, "y");
    summoned.tags = ["ally"];
    return { table, copy, enemyHurtsBiter: !ignoresTarget(made.attacks.bodySlam.ignores, tagsOf(made)), enemyHurtsSummoned: !ignoresTarget(made.attacks.bodySlam.ignores, tagsOf(summoned)) };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.table, {
    avatar: { tags: ["ally"], ignores: ["ally"] },
    dummy: { tags: ["enemy"], ignores: ["enemy", "object"] },
    biter: { tags: ["enemy", "vermin"], ignores: ["enemy", "object"] },
    rock: { tags: ["object"], ignores: ["enemy", "object"] },
    shroom: { tags: ["object"], ignores: ["enemy", "object"] },
  });
  assert.strictEqual(r.copy, true);
  assert.strictEqual(r.enemyHurtsBiter, false);
  assert.strictEqual(r.enemyHurtsSummoned, true);
});

test("177 a list of ignored tags covers a target when the target has any of them: an empty list covers nothing, one tag covers what has it, a list covers what has any of its tags, and the tags of the target that are not in the list do not matter; the lists of the five types give today's table of who hurts whom (the avatar and the enemies and the objects, each pair in each direction)", () => {
  const result = run(`
    const cases = [
      ignoresTarget([], ["enemy"]),
      ignoresTarget(["enemy"], ["enemy"]),
      ignoresTarget(["enemy"], ["ally"]),
      ignoresTarget(["enemy", "object"], ["object"]),
      ignoresTarget(["enemy"], ["ally", "enemy"]),
      ignoresTarget(["enemy"], []),
    ];
    const types = ["avatar", "dummy", "biter", "rock", "shroom"];
    const hurts = {};
    for (const a of types) for (const b of types) hurts[a + ">" + b] = !ignoresTarget(finalizeObject(a, {}, undefined, "x").attacks.bodySlam.ignores, tagsOf(finalizeObject(b, {}, undefined, "x")));
    return { cases, hurts };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.cases, [false, true, false, true, true, false]);
  const trues = Object.keys(r.hurts).filter((key) => r.hurts[key]).sort();
  // Today: the avatar hurts every other type and every other type hurts the avatar, and nothing else (not even itself).
  const expected = [];
  for (const type of ["dummy", "biter", "rock", "shroom"]) expected.push("avatar>" + type, type + ">avatar");
  assert.deepStrictEqual(trues, expected.sort());
});

// ---- Tags of exclusion: the hitboxes (step D) ----
test("178 a hitbox carries a copy of its owner's ignored tags from its birth and hurts only what has none of them: a bite born over a neighbor Biter hurts nobody (enemies ignore enemy), the same hitbox with the tag taken out of its list hurts that Biter (so the tag is what protected it), and the copy is its own list, not the recipe's", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1);
    const [avatar, a, b] = s.actors;
    avatar.position.x = 900; avatar.position.y = 900;
    a.position.x = 0; a.position.y = 0;
    b.position.x = 30; b.position.y = 0;
    step(s, { move: { x: 0, y: 0 } });
    s.hitboxes = [];
    spawnHitbox(s, a, "bite", 1, 0, { radius: 40, frames: 3, speed: 0, pierce: null });
    const born = s.hitboxes[0];
    const copy = { ignores: [...born.ignores], same: born.ignores === definitionOf(a).ignores };
    const before = b.health.now;
    step(s, { move: { x: 0, y: 0 } });
    const protectedHealth = b.health.now;
    born.ignores = [];
    born.struck = [];
    step(s, { move: { x: 0, y: 0 } });
    return { copy, before, protectedHealth, afterExceptions: b.health.now };
  `, QUIET);
  const r = plain(result);
  assert.deepStrictEqual(r.copy, { ignores: ["self", "enemy", "object"], same: false });
  assert.strictEqual(r.protectedHealth, r.before);
  assert.ok(r.afterExceptions < r.before, "without the tag in its list the bite hurts the neighbor: " + r.afterExceptions);
});

// ---- Tags of exclusion: the body (step E) ----
// A game where the Biter ignores only "object": the "enemy" tag is taken out of its list, so Biters hurt each other by contact.
const BITERS_HURT_BITERS = loadGame((text) => text.replace('bodyIgnores: ["enemy", "object"],\n      name: "Biter",', 'bodyIgnores: ["object"],\n      name: "Biter",'));

test("179 the body slam hurts unless the target has a tag that the body ignores, each direction on its own: two Biters meeting head on at speed hurt nobody (enemies ignore enemy), and with the tag taken out of the Biter's list the same meeting hurts both", () => {
  const code = `
    ${ALONE_BITERS}
    const meet = () => {
      const s = aloneBiters(0, 1);
      const [avatar, a, b] = s.actors;
      avatar.position.x = 900; avatar.position.y = 900;
      a.radius = 16; b.radius = 16;
      a.position.x = 0; a.position.y = 0; b.position.x = 31; b.position.y = 0;
      a.move.velocity.x = 3; b.move.velocity.x = -3;
      a.ai.phase = "freeze"; b.ai.phase = "freeze";
      a.ai.frames = 100; b.ai.frames = 100;
      step(s, { move: { x: 0, y: 0 } });
      return [a.health.now, b.health.now];
    };
    return meet();
  `;
  const normal = plain(run(code, QUIET));
  const open = plain(run(code, BITERS_HURT_BITERS));
  assert.deepStrictEqual(normal, [30, 30]);
  assert.ok(open[0] < 30 && open[1] < 30, "with the tag out of the list both are hurt: " + open);
});

// ---- Tags of exclusion: a list per attack (issue 20, step 20b) ----
test("180 each attack has its own list of ignored tags, and a hitbox copies the list of its attack when it is born: the bite ignores enemy and object, the repeater and the sword ignore ally; a bite whose attack list was changed to object only (the body list untouched) hurts the neighbor Biter, and one born with the default list does not", () => {
  const result = run(`
    ${ALONE_BITERS}
    const lists = (blueprint) => {
      const avatar = createAvatar(blueprint);
      return { repeater: avatar.attacks["repeater-arm"]?.ignores, sword: avatar.attacks["sword-arm"]?.ignores };
    };
    const armed = lists(createRun(1, DEFINITIONS.combatBlueprint).blueprint);
    const bite = (attackList) => {
      const s = aloneBiters(0, 1);
      const [avatar, a, b] = s.actors;
      avatar.position.x = 900; avatar.position.y = 900;
      a.position.x = 0; a.position.y = 0; b.position.x = 30; b.position.y = 0;
      step(s, { move: { x: 0, y: 0 } });
      s.hitboxes = [];
      if (attackList) a.attacks.bite.ignores = attackList;
      spawnHitbox(s, a, "bite", 1, 0, { radius: 40, frames: 3, speed: 0, pierce: null });
      const born = [...s.hitboxes[0].ignores];
      const before = b.health.now;
      step(s, { move: { x: 0, y: 0 } });
      return { born, hurt: b.health.now < before, bodyList: a.attacks.bodySlam.ignores };
    };
    return { bite: aloneBiters(0).actors[1].attacks.bite.ignores, armed, byDefault: bite(null), changed: bite(["object"]) };
  `, QUIET);
  const r = plain(result);
  assert.deepStrictEqual(r.bite, ["self", "enemy", "object"]);
  assert.deepStrictEqual(r.armed, { repeater: ["self", "ally"], sword: ["self", "ally"] });
  assert.deepStrictEqual(r.byDefault, { born: ["self", "enemy", "object"], hurt: false, bodyList: ["enemy", "object"] });
  assert.deepStrictEqual(r.changed, { born: ["object"], hurt: true, bodyList: ["enemy", "object"] });
});

// ---- The tag "self" (issue 19): step 19a, a list that is missing is refused ----
test("181 a list of tags that is missing is refused when the definitions load, with a message that names it: the tags of a thing, its bodyIgnores, the ignores of an attack (the bite), of a weapon and of a melee; an empty list is accepted (it is a choice)", () => {
  const bad = (from, to, message) => assert.throws(() => loadGame((text) => { const patched = text.replace(from, to); assert.notStrictEqual(patched, text, "the patch must apply"); return patched; }), message);
  bad('      tags: ["enemy", "vermin"], // its faction is "vermin" (the user, 2026-11-13); nothing reads it yet\n', '', /tags of biter/);
  bad('      bodyIgnores: ["enemy", "object"],\n      name: "Biter",', '      name: "Biter",', /bodyIgnores of biter/);
  bad('          ignores: ["self", "enemy", "object"], // the tags this attack', '          // the tags this attack', /ignores of the attack bite of biter/);
  bad('        ignores: ["self", "ally"], // the tags its bullets do not hurt', '        // the tags its bullets do not hurt', /ignores of the weapon of the part repeater-arm/);
  bad('        ignores: ["self", "ally"], // the tags its blows do not hurt', '        // the tags its blows do not hurt', /ignores of the melee of the part sword-arm/);
  bad('          ignores: ["self", "enemy", "object"], // the tags this attack', '          ignores: "enemy", // the tags this attack', /ignores of the attack bite of biter/);
  assert.doesNotThrow(() => loadGame((text) => text.replace('          ignores: ["self", "enemy", "object"], // the tags this attack', '          ignores: [], // the tags this attack')));
});

// ---- The tag "self" (issue 19), step 19b ----
test("182 the word self in the list of an attack means the actor that made the hitbox: with enemy out of the list and self in, a bite born one body ahead hurts the neighbor Biter and never its maker (which it overlaps); with self out too it hurts its maker; with the default list (self, enemy, object) it hurts neither", () => {
  const result = run(`
    ${ALONE_BITERS}
    const bite = (list) => {
      const s = aloneBiters(0, 1);
      const [avatar, a, b] = s.actors;
      avatar.position.x = 900; avatar.position.y = 900;
      a.position.x = 0; a.position.y = 0; b.position.x = 30; b.position.y = 0;
      step(s, { move: { x: 0, y: 0 } });
      s.hitboxes = [];
      if (list) a.attacks.bite.ignores = list;
      const makerBefore = a.health.now;
      const neighborBefore = b.health.now;
      spawnHitbox(s, a, "bite", 1, 0, { radius: 40, frames: 3, speed: 0, pierce: null });
      step(s, { move: { x: 0, y: 0 } });
      return { maker: a.health.now < makerBefore, neighbor: b.health.now < neighborBefore };
    };
    return { byDefault: bite(null), selfOnly: bite(["self", "object"]), nothing: bite(["object"]) };
  `, QUIET);
  const r = plain(result);
  assert.deepStrictEqual(r.byDefault, { maker: false, neighbor: false });
  assert.deepStrictEqual(r.selfOnly, { maker: false, neighbor: true });
  assert.deepStrictEqual(r.nothing, { maker: true, neighbor: true });
});

// ---- The target of an action (issue 13, step 1a) ----
test("183 the target of an attack is a record { pick, tag } written into the attack: the bite aims at the closest ally, the repeater and the sword at the closest enemy; it is a copy, not the recipe's own object; a target that is not { pick, tag } with a known pick and a word for the tag stops the game on load (the bite's too)", () => {
  const result = run(`
    ${ALONE_BITERS}
    const bite = aloneBiters(0).actors[1].attacks.bite.target;
    const avatar = createAvatar(createRun(1, DEFINITIONS.combatBlueprint).blueprint);
    return { bite, repeater: avatar.attacks["repeater-arm"].target, sword: avatar.attacks["sword-arm"].target, copy: bite !== definitionOf({ type: "biter" }).attacks.bite.target };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.bite, { pick: "closest", tag: "ally" });
  assert.deepStrictEqual(r.repeater, { pick: "closest", tag: "enemy" });
  assert.deepStrictEqual(r.sword, { pick: "closest", tag: "enemy" });
  assert.strictEqual(r.copy, true);
  const bad = (from, to, message) => assert.throws(() => loadGame((text) => { const patched = text.replace(from, to); assert.notStrictEqual(patched, text, "the patch must apply"); return patched; }), message);
  bad('          target: { pick: "closest", tag: "ally" },', '          target: { pick: "closest" },', /target of the attack bite of the actor biter/);
  bad('          target: { pick: "closest", tag: "ally" },', '          target: { pick: "random", tag: "ally" },', /target of the attack bite of the actor biter/);
  bad('          target: { pick: "closest", tag: "ally" },', '          // no target', /target of the attack bite of the actor biter/);
});

test("184 pickTarget picks among the things that carry the tag, whoever asks: from the avatar the closest enemy (a Biter), from a Biter the closest ally (the avatar, never another Biter, however close), nothing for a tag that nobody carries, and the dead are skipped", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1);
    const [avatar, a, b] = s.actors;
    avatar.position.x = 0; avatar.position.y = 0;
    a.position.x = 100; a.position.y = 0;
    b.position.x = 110; b.position.y = 0;
    const pick = (from, tag) => pickTarget(s, from, { pick: "closest", tag }, 1000)?.id ?? null;
    const out = { fromAvatar: pick(avatar, "enemy"), fromBiter: pick(b, "ally"), nobody: pick(avatar, "ghost") };
    avatar.health.now = 0;
    out.deadAvatarSkipped = pick(b, "ally");
    return { out, ids: [avatar.id, a.id, b.id] };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.out, { fromAvatar: r.ids[1], fromBiter: r.ids[0], nobody: null, deadAvatarSkipped: null });
});

test("185 a Biter aims at the closest thing with the tag of its attack's target, not at the avatar by name: with a second Biter made ally and nearer than the avatar, the first Biter walks toward it, and after one step its bite (born later) points at it; with nothing tagged ally in the scene it stands still; the Biter is enemy and vermin", () => {
  const result = run(`
    ${ALONE_BITERS}
    const setup = () => {
      const s = aloneBiters(0, 1);
      const [avatar, a, b] = s.actors;
      avatar.position.x = 0; avatar.position.y = -500;
      a.position.x = 0; a.position.y = 0;
      b.position.x = 200; b.position.y = 0;
      return { s, avatar, a, b };
    };
    const first = setup();
    step(first.s, { move: { x: 0, y: 0 } });
    const toAvatar = { x: first.a.move.direction.x, y: first.a.move.direction.y };
    const second = setup();
    second.b.tags = ["ally"];
    step(second.s, { move: { x: 0, y: 0 } });
    const toNeighbor = { x: second.a.move.direction.x, y: second.a.move.direction.y };
    const third = setup();
    third.avatar.tags = [];
    step(third.s, { move: { x: 0, y: 0 } });
    return { toAvatar, toNeighbor, alone: { x: third.a.move.direction.x, y: third.a.move.direction.y }, tags: tagsOf(first.a) };
  `, QUIET);
  const r = plain(result);
  assert.ok(r.toAvatar.y < -0.99 && Math.abs(r.toAvatar.x) < 0.01, "toward the avatar, which is above: " + JSON.stringify(r.toAvatar));
  assert.ok(r.toNeighbor.x > 0.99 && Math.abs(r.toNeighbor.y) < 0.01, "toward the neighbor made ally, to the right: " + JSON.stringify(r.toNeighbor));
  assert.deepStrictEqual(r.alone, { x: 0, y: 0 });
  assert.deepStrictEqual(r.tags, ["enemy", "vermin"]);
});

// ---- The place of exit (issue 13, step 2a) ----
test("186 the place of exit is a key of the attack, not a rule about the avatar: the bite leaves from the front, the repeater and the sword from the center; a hitbox is born where its attack's exit says (a bite whose exit is center is born on the Biter, a bullet whose exit is front is born one body ahead of the avatar); an exit that is not center or front stops the game on load, the bite's included", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1);
    const [avatar, a] = s.actors;
    const blueprint = createRun(1, DEFINITIONS.combatBlueprint).blueprint;
    const armed = createAvatar(blueprint);
    a.position.x = 100; a.position.y = 50; a.radius = 16;
    armed.position.x = 0; armed.position.y = 0; armed.radius = 24;
    const born = (owner, name, exit) => {
      if (exit) owner.attacks[name].exit = exit;
      s.hitboxes = [];
      spawnHitbox(s, owner, name, 1, 0, { radius: 5, frames: 1, speed: 0, pierce: null });
      return { x: s.hitboxes[0].position.x - owner.position.x, y: s.hitboxes[0].position.y - owner.position.y };
    };
    return {
      exits: { bite: a.attacks.bite.exit, repeater: armed.attacks["repeater-arm"].exit, sword: armed.attacks["sword-arm"].exit },
      biteByDefault: born(a, "bite", null),
      biteFromCenter: born(a, "bite", "center"),
      bulletByDefault: born(armed, "repeater-arm", null),
      bulletFromFront: born(armed, "repeater-arm", "front"),
    };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.exits, { bite: "front", repeater: "center", sword: "center" });
  assert.deepStrictEqual(r.biteByDefault, { x: 16, y: 0 });
  assert.deepStrictEqual(r.biteFromCenter, { x: 0, y: 0 });
  assert.deepStrictEqual(r.bulletByDefault, { x: 0, y: 0 });
  assert.deepStrictEqual(r.bulletFromFront, { x: 24, y: 0 });
  const bad = (from, to, message) => assert.throws(() => loadGame((text) => { const patched = text.replace(from, to); assert.notStrictEqual(patched, text, "the patch must apply"); return patched; }), message);
  bad('exit: "front",', 'exit: "behind",', /exit of the attack bite of the actor biter/);
  bad('exit: "front",', '// no exit', /exit of the attack bite of the actor biter/);
  bad('        exit: "center", // where its hitbox is born (the user, 2026-11-13, issues 2 and 13): at the center of the avatar\n        repeat: "life", // when it may hurt the same target again (docs/base-plan.md, "The design of step 4"): "life", each target once in the hitbox\'s life\n        scale: "none", // how its damage grows at the hit (docs/base-plan.md, "The design of step 4"): "none", the packet as it is\n        target: { pick: "closest", tag: "enemy" },\n        intervalFrames', '        repeat: "life", // when it may hurt the same target again (docs/base-plan.md, "The design of step 4"): "life", each target once in the hitbox\'s life\n        scale: "none", // how its damage grows at the hit (docs/base-plan.md, "The design of step 4"): "none", the packet as it is\n        target: { pick: "closest", tag: "enemy" },\n        intervalFrames', /exit of the weapon of the part repeater-arm/);
});

test("187 the gap that the reach is compared with is counted from the exit of the attack, in one function: from the center the owner's radius does not come off, from the front it does; a Biter at exactly its reach from the avatar starts its windup, and with the exit of its bite changed to center the same position is out of reach by one body (no windup)", () => {
  const result = run(`
    ${ALONE_BITERS}
    const numbers = { center: exitGap({ radius: 16 }, "center", 100, { radius: 10 }), front: exitGap({ radius: 16 }, "front", 100, { radius: 10 }) };
    const bite = (exit) => {
      const s = aloneBiters(0, 1);
      const [avatar, a] = s.actors;
      if (exit) a.attacks.bite.exit = exit;
      avatar.position.x = 0; avatar.position.y = 0;
      a.position.x = a.attacks.bite.reach + a.radius + avatar.radius; a.position.y = 0;
      step(s, { move: { x: 0, y: 0 } });
      return a.ai.phase;
    };
    return { numbers, byDefault: bite(null), fromCenter: bite("center") };
  `, QUIET);
  const r = plain(result);
  assert.deepStrictEqual(r.numbers, { center: 90, front: 74 });
  assert.strictEqual(r.byDefault, "windup");
  assert.strictEqual(r.fromCenter, "chase");
});

// ---- The index by tag (issue 22) ----
// The same game with the plain walk over every actor instead of the index: the reference that the index must equal.
const PLAIN_WALK = loadGame(null, { patchSim: (text) => text.replace("const byTag = tagIndex(state.actors);", "const byTag = null;") });

test("188 the index by tag gives the same answer as the plain walk, tie included, and the same whole run: the same pick for every asker and tag in a crowd (a tie goes to the first in the list), and 900 frames of Chamber 2 with the combat blueprint end in the same state and the same combat audit with the index and with the plain walk", () => {
  const code = `
    const run = createRun(1, DEFINITIONS.combatBlueprint);
    const s = createChamber2State(1, 1, run.blueprint);
    const audit = createAudit();
    for (let i = 0; i < 900; i++) step(s, { move: { x: 0, y: 0 } }, run.blueprint, null, audit);
    const crowd = createChamber2State(1, 1, run.blueprint);
    const index = tagIndex(crowd.actors);
    const picks = [];
    for (const from of crowd.actors.slice(0, 12)) {
      for (const tag of ["ally", "enemy", "vermin", "object", "ghost"]) {
        const plain = pickTarget(crowd, from, { pick: "closest", tag }, 600)?.id ?? null;
        const indexed = pickTarget(crowd, from, { pick: "closest", tag }, 600, index)?.id ?? null;
        picks.push(plain === indexed);
      }
    }
    const twins = createChamber2State(1, 1, run.blueprint);
    twins.actors[2].position = { ...twins.actors[3].position };
    twins.actors[2].radius = twins.actors[3].radius;
    const tie = [pickTarget(twins, twins.actors[0], { pick: "closest", tag: "enemy" }, 100000)?.id, pickTarget(twins, twins.actors[0], { pick: "closest", tag: "enemy" }, 100000, tagIndex(twins.actors))?.id];
    return { state: JSON.stringify(s), audit: audit.join("\\n"), picks, tie };
  `;
  const indexed = run(code);
  const plain = run(code, PLAIN_WALK);
  assert.ok(indexed.picks.length === 60 && indexed.picks.every(Boolean), "the index must pick what the plain walk picks");
  assert.strictEqual(indexed.tie[0], indexed.tie[1]);
  assert.strictEqual(indexed.state, plain.state);
  assert.strictEqual(indexed.audit, plain.audit);
  assert.ok(indexed.audit.length > 0, "the run must have fought, or the comparison proves little");
});

// ---- Hitboxes and objects ----
test("189 a hitbox hurts a Rock as the body slam does: a shot born on the rock of seed 1 takes its damage off the rock (resolved against the rock's resistances, written in damagedObjects, one line in the combat audit with the rock's name), hurts it once however many frames it stays, does nothing to a rock far from it, does nothing when its list ignores object (the same shot, the tag is what protected the rock), and a rock that broke is no longer hit; a pierce of 0 ends the hitbox on the rock", () => {
  const code = (ignores, pierce, damage) => `
    const s = createChamber1State();
    const audit = createAudit();
    const avatar = s.actors[0];
    avatar.position.x = 900; avatar.position.y = 900; // out of the way
    const name = "shot"; // Chamber 1 has no weapon: the avatar is given one by hand
    avatar.attacks.shot = { base: { puncture: 6 }, now: { puncture: 6 }, projectile: null, target: { pick: "closest", tag: "enemy" }, exit: "center", ignores: ["self", "ally"] };
    ${ignores ? "avatar.attacks[name].ignores = " + JSON.stringify(ignores) + ";" : ""}
    spawnHitbox(s, avatar, name, 1, 0, { radius: 10, frames: 3, speed: 0, pierce: ${pierce} });
    Object.assign(s.hitboxes[0].damage, ${JSON.stringify(damage ?? null)} ?? {});
    s.hitboxes[0].position.x = ${ROCK.x}; s.hitboxes[0].position.y = ${ROCK.y};
    for (let i = 0; i < 3; i++) step(s, { move: { x: 0, y: 0 } }, undefined, null, audit);
    return { rock: s.damagedObjects["${ROCK.key}"] ?? ${ROCK.health}, audit: audit.slice(), hitboxes: s.hitboxes.length, struck: s.hitboxes[0]?.struck ?? null };
  `;
  const hit = run(code(null, "null"));
  assert.ok(hit.rock < ROCK.health, "the shot must hurt the rock: " + hit.rock);
  const lines = hit.audit.map((line) => JSON.parse(line)).filter((line) => line.event === "hit");
  assert.strictEqual(lines.length, 1, "the shot hurts the rock once, however many frames it stays");
  assert.strictEqual(lines[0].target, "rock small:0,1");
  assert.ok(Math.abs(lines[0].health - (ROCK.health - hit.rock)) < 1e-9);
  const far = run(code(null, "null").replace("s.hitboxes[0].position.x = " + ROCK.x, "s.hitboxes[0].position.x = " + (ROCK.x + 500)));
  assert.strictEqual(far.rock, ROCK.health);
  const protectedRock = run(code(["self", "object"], "null"));
  assert.strictEqual(protectedRock.rock, ROCK.health, "with object in the list the rock is not hurt");
  const huge = run(code(null, "null", { puncture: 1000 }));
  assert.strictEqual(huge.rock, 0, "a rock that breaks stays at 0");
  assert.strictEqual(huge.audit.map((line) => JSON.parse(line)).filter((line) => line.event === "hit").length, 1, "a broken rock is not hit again");
  const pierced = run(code(null, "0"));
  assert.strictEqual(pierced.hitboxes, 0, "a pierce of 0 ends the hitbox on the first thing it hurts, the rock");
});

// ---- The avatar's death: the mission is aborted (the user, 2026-11-14) ----

test("190 a step that ends with the avatar at zero health says the mission is aborted, and a step that does not says it is running: a new state is running; with the avatar at 1 health and no one near it, the step leaves it running; with the avatar at 0 it says aborted, and the frame still counted", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const fresh = s.mission;
    s.actors[0].health.now = 1;
    step(s, { move: { x: 0, y: 0 } });
    const alive = s.mission;
    s.actors[0].health.now = 0;
    step(s, { move: { x: 0, y: 0 } });
    return { fresh, alive, dead: s.mission, frame: s.frame };
  `, QUIET);
  assert.strictEqual(result.fresh, "running");
  assert.strictEqual(result.alive, "running");
  assert.strictEqual(result.dead, "aborted");
  assert.strictEqual(result.frame, 2);
});

test("191 a step on an aborted state changes nothing: the JSON of the state is the same, the visual state has no new trace and does not age, and the audit has no new line, even with the avatar's input and a Biter on top of it", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    s.actors[1].position.x = s.actors[0].position.x + 20; s.actors[1].position.y = s.actors[0].position.y;
    s.actors[0].health.now = 0;
    const visual = createVisual();
    visual.traces.push({ position: { x: 1, y: 2 }, radius: 3, age: 4, frames: 12 });
    const audit = createAudit();
    step(s, { move: { x: 0, y: 0 } }, undefined, visual, audit);
    const state = JSON.stringify(s), traces = JSON.stringify(visual), lines = audit.length;
    for (let i = 0; i < 5; i++) step(s, { move: { x: 1, y: 0 }, dash: true }, undefined, visual, audit);
    return { aborted: s.mission, same: JSON.stringify(s) === state, visualSame: JSON.stringify(visual) === traces, lines, linesAfter: audit.length };
  `, QUIET);
  assert.strictEqual(result.aborted, "aborted");
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.visualSame, true);
  assert.strictEqual(result.linesAfter, result.lines);
});

test("192 an actor with no health is never a target, whoever it is: a Biter does not chase the avatar at zero health (it stands still), and the avatar's weapons skip a Biter at zero health", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const avatar = s.actors[0], biter = s.actors[1];
    const target = { pick: "closest", tag: "ally" };
    avatar.health.now = 0;
    const deadAvatar = pickTarget(s, biter, target, Infinity)?.id ?? null;
    avatar.health.now = 10; biter.health.now = 0;
    const deadBiter = pickTarget(s, avatar, { pick: "closest", tag: "enemy" }, Infinity)?.id ?? null;
    biter.health.now = 10;
    const alive = pickTarget(s, biter, target, Infinity)?.id ?? null;
    return { deadAvatar, deadBiter, alive, avatar: avatar.id };
  `, QUIET);
  assert.strictEqual(result.deadAvatar, null);
  assert.strictEqual(result.deadBiter, null);
  assert.strictEqual(result.alive, result.avatar);
});

test("193 recordFrame does not record a state that did not advance: recording the same frame again, or an aborted state that step no longer advances, leaves snaps, inputs and visuals as they were; a state that advanced is recorded", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0);
    const h = createHistory(s, createRun(1).blueprint);
    const idle = { move: { x: 0, y: 0 } };
    recordFrame(h, s, idle); // frame 0 again: nothing advanced
    const afterSame = h.snaps.length;
    step(s, idle);
    recordFrame(h, s, idle);
    const afterStep = h.snaps.length;
    s.actors[0].health.now = 0;
    step(s, idle); // the step in which the avatar dies still advances
    recordFrame(h, s, idle);
    const afterDeath = h.snaps.length;
    const before = JSON.stringify(h);
    for (let i = 0; i < 3; i++) { step(s, idle); recordFrame(h, s, idle); }
    return { afterSame, afterStep, afterDeath, unchanged: JSON.stringify(h) === before, lastMission: h.snaps[h.snaps.length - 1].mission };
  `, QUIET);
  assert.strictEqual(result.afterSame, 1);
  assert.strictEqual(result.afterStep, 2);
  assert.strictEqual(result.afterDeath, 3);
  assert.strictEqual(result.unchanged, true);
  assert.strictEqual(result.lastMission, "aborted");
});
test("194 a body slam does not hurt an actor with no health, as a hitbox does: the avatar dashes into a Biter at 0 health and the audit has no line with that Biter as target; the same scene with 1 health has one such line", () => {
  const result = run(`
    ${ALONE_BITERS}
    ${ARMED}
    const dashInto = (health) => {
      const audit = createAudit();
      const s = aloneBiters(0);
      const b = s.actors[1];
      b.position.x = 16 + b.radius + 2; b.position.y = 0;
      b.attacks.bite.windupFrames = 0;
      b.health.now = health;
      s.actors[0].position.x = 0; s.actors[0].position.y = 0;
      step(s, { move: { x: 1, y: 0 }, dash: true }, undefined, null, audit);
      return audit.map((line) => JSON.parse(line)).filter((entry) => entry.target === b.id);
    };
    return { dead: dashInto(0), alive: dashInto(1) };
  `, QUIET);
  assert.strictEqual(result.dead.length, 0, JSON.stringify(result.dead));
  assert.strictEqual(result.alive.length, 1, JSON.stringify(result.alive));
});

// ---- repeat in every attack (base plan P4, step 4) ----
test("195 the key repeat of every attack is checked on load: a missing or unknown value is refused with a message that names the attack (the bite, the weapon, the melee), and until another case is built the body slam must be contact and every other attack life", () => {
  const bad = (from, to, message) => assert.throws(() => loadGame((text) => { const patched = text.replace(from, to); assert.notStrictEqual(patched, text, "the patch must apply"); return patched; }), message);
  const biteRepeat = 'repeat: "life", // when it may hurt the same target again (docs/base-plan.md, "The design of step 4"): "life", each target once in the hitbox\'s life\n          scale: "none", // how its damage grows at the hit (docs/base-plan.md, "The design of step 4"): "none", the packet as it is\n          target:';
  const biteRepeatTo = (value) => biteRepeat.replace('repeat: "life", //', value + ", //");
  assert.doesNotThrow(() => loadGame());
  bad(biteRepeat, biteRepeatTo('repeat: "forever"'), /repeat of the attack bite of the actor biter must be one of life, contact, and it is "forever"/);
  bad(biteRepeat, biteRepeatTo("// none"), /repeat of the attack bite of the actor biter must be one of life, contact, and it is undefined/);
  bad(biteRepeat, biteRepeatTo('repeat: "contact"'), /repeat of the attack bite of the actor biter must be life until another case is built, and it is contact/);
  const weaponRepeat = '        repeat: "life", // when it may hurt the same target again (docs/base-plan.md, "The design of step 4"): "life", each target once in the hitbox\'s life\n        scale: "none", // how its damage grows at the hit (docs/base-plan.md, "The design of step 4"): "none", the packet as it is\n        target: { pick: "closest", tag: "enemy" },\n        intervalFrames';
  bad(weaponRepeat, weaponRepeat.replace('"life", //', '"forever", //'), /repeat of the weapon of the part repeater-arm must be one of life, contact, and it is "forever"/);
  bad(weaponRepeat, weaponRepeat.replace('repeat: "life", //', "// none"), /repeat of the weapon of the part repeater-arm .* undefined/);
  bad(weaponRepeat, weaponRepeat.replace('"life", //', '"contact", //'), /repeat of the weapon of the part repeater-arm must be life/);
  const meleeRepeat = 'repeat: "life", // when it may hurt the same target again (docs/base-plan.md, "The design of step 4"): "life", each target once in the hitbox\'s life\n        scale: "none", // how its damage grows at the hit (docs/base-plan.md, "The design of step 4"): "none", the packet as it is\n        target: { pick: "closest", tag: "enemy" },\n        reach: 90';
  bad(meleeRepeat, meleeRepeat.replace('"life", //', '"forever", //'), /repeat of the melee of the part sword-arm must be one of life, contact, and it is "forever"/);
  bad(meleeRepeat, meleeRepeat.replace('repeat: "life", //', "// none"), /repeat of the melee of the part sword-arm .* undefined/);
  bad(meleeRepeat, meleeRepeat.replace('"life", //', '"contact", //'), /repeat of the melee of the part sword-arm must be life/);
  // the body slam: it must be contact (another value is refused, and so is a missing one)
  bad('{ damage: { blunt: { flat: 0, perWeight: 0.001 } }, repeat: "contact", scale: "impact" }', '{ damage: { blunt: { flat: 0, perWeight: 0.001 } }, repeat: "life", scale: "impact" }', /repeat of the attack bodySlam .* must be contact until another case is built, and it is life/);
  bad('{ damage: { blunt: { flat: 0, perWeight: 0.001 } }, repeat: "contact", scale: "impact" }', '{ damage: { blunt: { flat: 0, perWeight: 0.001 } }, scale: "impact" }', /repeat of the attack bodySlam .* and it is undefined/);
});
test("196 every attack record carries its repeat, and so does a hitbox: the body slam of the avatar, of a Biter and of a Rock is contact; the bite, the repeater and the sword are life; a hitbox born from the bite, from a bullet and from a sword copies life from its attack (and one born from an attack changed to contact copies contact)", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1);
    const biter = s.actors[1];
    const armed = createAvatar(createRun(1, DEFINITIONS.combatBlueprint).blueprint);
    const rock = finalizeObject("rock", { radius: 28 });
    const born = (owner, name) => {
      s.hitboxes = [];
      spawnHitbox(s, owner, name, 1, 0, { radius: 5, frames: 1, speed: 0, pierce: null });
      return s.hitboxes[0].repeat;
    };
    const hitboxes = { bite: born(biter, "bite"), bullet: born(armed, "repeater-arm"), sword: born(armed, "sword-arm") };
    const repeats = (thing) => Object.fromEntries(Object.entries(thing.attacks).map(([name, attack]) => [name, attack.repeat]));
    const records = { avatar: repeats(armed), biter: repeats(biter), rock: repeats(rock) };
    biter.attacks.bite.repeat = "contact";
    return { ...records, hitboxes, changed: born(biter, "bite") };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.avatar, { bodySlam: "contact", "repeater-arm": "life", "sword-arm": "life" });
  assert.deepStrictEqual(r.biter, { bodySlam: "contact", bite: "life" });
  assert.deepStrictEqual(r.rock, { bodySlam: "contact" });
  assert.deepStrictEqual(r.hitboxes, { bite: "life", bullet: "life", sword: "life" });
  assert.strictEqual(r.changed, "contact");
});

// ---- scale in every attack (base plan P5, step 4) ----
test("197 the key scale of every attack is checked on load: a missing or unknown value is refused with a message that names the attack (the bite, the weapon, the melee, the body slam), and until another case is built the body slam must be impact and every other attack none", () => {
  const bad = (from, to, message) => assert.throws(() => loadGame((text) => { const patched = text.replace(from, to); assert.notStrictEqual(patched, text, "the patch must apply"); return patched; }), message);
  const scaleLine = (indent) => indent + 'scale: "none", // how its damage grows at the hit (docs/base-plan.md, "The design of step 4"): "none", the packet as it is\n';
  const biteScale = scaleLine("          ");
  const weaponScale = scaleLine("        ") + "        target: { pick: \"closest\", tag: \"enemy\" },\n        intervalFrames";
  const meleeScale = scaleLine("        ") + "        target: { pick: \"closest\", tag: \"enemy\" },\n        reach: 90";
  assert.doesNotThrow(() => loadGame());
  bad(biteScale, biteScale.replace('"none", //', '"squared", //'), /scale of the attack bite of the actor biter must be one of none, impact, and it is "squared"/);
  bad(biteScale, biteScale.replace('scale: "none", //', "// none"), /scale of the attack bite of the actor biter must be one of none, impact, and it is undefined/);
  bad(biteScale, biteScale.replace('"none", //', '"impact", //'), /scale of the attack bite of the actor biter must be none until another case is built, and it is impact/);
  bad(weaponScale, weaponScale.replace('"none", //', '"squared", //'), /scale of the weapon of the part repeater-arm must be one of none, impact, and it is "squared"/);
  bad(weaponScale, weaponScale.replace('scale: "none", //', "// none"), /scale of the weapon of the part repeater-arm .* undefined/);
  bad(weaponScale, weaponScale.replace('"none", //', '"impact", //'), /scale of the weapon of the part repeater-arm must be none/);
  bad(meleeScale, meleeScale.replace('"none", //', '"squared", //'), /scale of the melee of the part sword-arm must be one of none, impact, and it is "squared"/);
  bad(meleeScale, meleeScale.replace('scale: "none", //', "// none"), /scale of the melee of the part sword-arm .* undefined/);
  bad(meleeScale, meleeScale.replace('"none", //', '"impact", //'), /scale of the melee of the part sword-arm must be none/);
  // the body slam: it must be impact (another value is refused, and so is a missing one)
  const slam = 'repeat: "contact", scale: "impact" }, referenceImpact';
  bad(slam, 'repeat: "contact", scale: "none" }, referenceImpact', /scale of the attack bodySlam .* must be impact until another case is built, and it is none/);
  bad(slam, 'repeat: "contact" }, referenceImpact', /scale of the attack bodySlam .* and it is undefined/);
  bad(slam, 'repeat: "contact", scale: "squared" }, referenceImpact', /scale of the attack bodySlam .* must be one of none, impact, and it is "squared"/);
});
test("198 every attack record carries its scale: the body slam of the avatar, of a Biter and of a Rock is impact; the bite, the repeater and the sword are none; a hitbox does not carry it (its damage is frozen at its birth)", () => {
  const result = run(`
    ${ALONE_BITERS}
    const s = aloneBiters(0, 1);
    const biter = s.actors[1];
    const armed = createAvatar(createRun(1, DEFINITIONS.combatBlueprint).blueprint);
    const rock = finalizeObject("rock", { radius: 28 });
    spawnHitbox(s, biter, "bite", 1, 0, { radius: 5, frames: 1, speed: 0, pierce: null });
    const scales = (thing) => Object.fromEntries(Object.entries(thing.attacks).map(([name, attack]) => [name, attack.scale]));
    return { avatar: scales(armed), biter: scales(biter), rock: scales(rock), hitboxHasScale: "scale" in s.hitboxes[0] };
  `);
  const r = plain(result);
  assert.deepStrictEqual(r.avatar, { bodySlam: "impact", "repeater-arm": "none", "sword-arm": "none" });
  assert.deepStrictEqual(r.biter, { bodySlam: "impact", bite: "none" });
  assert.deepStrictEqual(r.rock, { bodySlam: "impact" });
  assert.strictEqual(r.hitboxHasScale, false);
});
