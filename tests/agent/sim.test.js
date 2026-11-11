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

// A fresh context with the game scripts loaded. "extraSource" can replace the text of a file.
function loadGame(patchData = (text) => text) {
  const context = vm.createContext({});
  for (const name of FILES) {
    const text = name === "data.js" ? patchData(readSource(name)) : readSource(name);
    vm.runInContext(text, context);
  }
  // The rules need the blueprint of the run as the third argument of step. Most tests do not care
  // which one, so here step plays with the starter blueprint unless a test passes another.
  vm.runInContext("const realStep = step; step = (state, input, blueprint = createRun(1).blueprint) => realStep(state, input, blueprint);", context);
  return context;
}

// How many Dummies a game has (the data says how many for the stress test). A patch that does not find the text fails
// loudly, so a change in the data cannot silently bring back the full count and make every test slow.
function withDummies(count) {
  return loadGame((text) => {
    const original = /dummies: \{ count: \d+,/;
    if (!original.test(text)) throw new Error("the count of Dummies was not found in src/data.js");
    return text.replace(original, "dummies: { count: " + count + ",");
  });
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

test("10 the state has the grid settings, and the player covers only the cell (0, 0)", () => {
  const state = run(`
    const s = createChamber1State();
    for (let i = 0; i < 30; i++) step(s, { move: { x: 1, y: 0 } });
    return s;
  `);
  assert.strictEqual(state.grid.cellSize, 64);
  assert.strictEqual(state.grid.windowWidth, 61);
  assert.strictEqual(state.grid.windowHeight, 35);
  assert.deepStrictEqual(plain(state.actors[0].cells), { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }); // radius 16 inside a cell of 64
});

test("11 cell boundaries: the center cell covers [-32, +32) around the player (a point, radius 0, covers one cell)", () => {
  const cells = run(`
    return [31.9, 32, -32, -32.1, 100, 0].map((dx) => {
      const s = createChamber1State();
      s.actors.push({ id: "marker", radius: 0, position: { x: dx, y: -70 }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } });
      step(s, { move: { x: 0, y: 0 } });
      const marker = s.actors.find((actor) => actor.id === "marker");
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

test("12 cells are relative to the player: when the player walks, a still actor changes cell", () => {
  const cells = run(`
    const s = createChamber1State();
    s.actors.push({ id: "marker", radius: 0, position: { x: 100, y: 0 }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } });
    step(s, { move: { x: 0, y: 0 } });
    const marker = s.actors.find((actor) => actor.id === "marker");
    const before = marker.cells.from.x;
    const original = finalSpeed;
    finalSpeed = () => 64;
    s.actors[0].move.velocity.x = 64; // already moving at 64 px per frame
    step(s, { move: { x: 1, y: 0 } });
    finalSpeed = original;
    return [before, marker.cells.from.x];
  `);
  assert.deepStrictEqual(plain(cells), [2, 1]);
});

test("13 isInWindow: a 3x3 window reaches 1 cell, 11x11 reaches 5, and it can be a rectangle", () => {
  const answers = run(`
    const small = { cellSize: 64, windowWidth: 3, windowHeight: 3 };
    const large = { cellSize: 64, windowWidth: 11, windowHeight: 11 };
    const screen = { cellSize: 64, windowWidth: 61, windowHeight: 35 };
    return [
      isInWindow(small, { x: 1, y: -1 }),
      isInWindow(small, { x: 2, y: 0 }),
      isInWindow(large, { x: 5, y: 5 }),
      isInWindow(large, { x: 0, y: -6 }),
      isInWindow(screen, { x: 30, y: 17 }),
      isInWindow(screen, { x: -30, y: -17 }),
      isInWindow(screen, { x: 31, y: 0 }),
      isInWindow(screen, { x: 0, y: 18 }),
      isInWindow(screen, { x: 0, y: -18 }),
    ];
  `);
  assert.deepStrictEqual(plain(answers), [true, false, true, false, true, true, false, false, false]);
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
    const bad = [
      { cellSize: 64, windowWidth: 4, windowHeight: 3 },
      { cellSize: 64, windowWidth: 3, windowHeight: 4 },
      { cellSize: 64, windowWidth: 2, windowHeight: 3 },
      { cellSize: 64, windowWidth: 3, windowHeight: 3.5 },
      { cellSize: 0, windowWidth: 3, windowHeight: 3 },
      { cellSize: -1, windowWidth: 3, windowHeight: 3 },
      { cellSize: NaN, windowWidth: 3, windowHeight: 3 },
      { cellSize: 64, windowWidth: 3 },
      { cellSize: 64, windowSize: 3 },
    ];
    return bad.map((grid) => {
      try { assertValidGrid(grid); return false; } catch (error) { return true; }
    });
  `);
  assert.ok(plain(rejected).every((value) => value === true));
  assert.doesNotThrow(() => run("assertValidGrid({ cellSize: 64, windowWidth: 61, windowHeight: 35 });"));
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
      "const DEFINITIONS = {\n  actors: {",
      'const DEFINITIONS = {\n  actors: {\n    trap: { name: "Trap", health: { now: 1, max: 1 }, attack: 5, defense: 0, radius: 10, initial: { health: { now: 1, max: 1 }, position: { x: 0, y: 0 }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } } },'
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

test("21 history keeps only the last 100, and the oldest (index 0) leaves first", () => {
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
      aligned: h.snaps.every((snap, i) => snap.frame === 151 + i),
      historySize: HISTORY_SIZE,
    };
  `);
  assert.strictEqual(result.historySize, 100);
  assert.strictEqual(result.snaps, 100);
  assert.strictEqual(result.inputs, 100);
  assert.strictEqual(result.oldest, 151);
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
  assert.deepStrictEqual(plain(result.first), { type: "shroom", layer: "small", position: { x: 136, y: -375 }, square: { x: 0, y: -2 }, radius: 16, health: { now: 17, max: 17 }, weight: 1600, bounce: 0.2 });
  assert.deepStrictEqual(plain(result.last), { type: "rock", layer: "small", position: { x: 99, y: 456 }, square: { x: 0, y: 1 }, radius: 28, health: { now: 10, max: 10 }, weight: 2800, bounce: 0 });
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
// The rule (src/sim.js): every collision is a hit. The attack is
// weight x 0.001 x impact / 6 (impact = the speed going into the other thing; provisional formula).
// damage = max(1, attack - defense) when there is an attack. Avatar: 5000 kg, defense 3, health 100.
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

test("47 walking into a rock at 3 px/frame is a weak hit: the rock loses 2.5, the avatar the minimum damage 1 (1.4 - 3 is below 1)", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 55; p.position.y = ${ROCK.y}; // touching the rock
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } });
    return { avatar: p.health.now, damagedObjects: s.damagedObjects, vx: p.move.velocity.x };
  `);
  assert.strictEqual(result.avatar, 99); // 2800 x 0.001 x 3 / 6 = 1.4, minus 3 is below the minimum damage, 1
  assert.deepStrictEqual(plain(result.damagedObjects), { "small:0,1": 7.5 }); // 10 - 5000 x 0.001 x 3 / 6
  assert.strictEqual(result.vx, 0); // it still stopped (the bounce is a separate rule)
});

test("48 a dash (impact 12) hurts both: each hits with weight x 0.001 x 12 / 6; the avatar loses that minus the defense 3, and at least 1", () => {
  const rock = slamInto(53, ROCK.y); // 2800 kg: attack 5.6, so 5.6 - 3 = 2.6 to the avatar; the avatar (5000 kg) hits for 10
  assert.ok(Math.abs(rock.avatar - 97.4) < 1e-9, "rock: " + rock.avatar);
  assert.strictEqual(rock.rock, 0); // 10 - 10: it breaks
  const small = hitShroom(16, { dash: true, gap: 2 }); // 1600 kg: attack 3.2, 3.2 - 3 = 0.2 is below 1, so 1
  assert.ok(Math.abs(small.avatar - 99) < 1e-9, "small shroom: " + small.avatar);
  assert.strictEqual(small.shroomLoss, 10); // the avatar hits for 10
  const large = hitShroom(32, { dash: true, gap: 2 }); // 3200 kg: attack 6.4, so 6.4 - 3 = 3.4
  assert.ok(Math.abs(large.avatar - 96.6) < 1e-9, "large shroom: " + large.avatar);
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
  assert.strictEqual(result.avatar, 99); // the attack is below the defense, so the minimum damage 1
  const loss = 10 - result.damagedObjects["small:0,1"];
  assert.ok(loss > 0 && loss < 2.5, "a graze should hurt the rock less than the head-on walk of test 47 (2.5), it lost " + loss);
});

test("50 the attack: weight x 0.001 x impact / 6, 0 without impact; the damage never goes below 0", () => {
  const result = withBlueprints(`
    const rock = finalizeObject("rock", { radius: 28 });
    const small = finalizeObject("shroom", { radius: 16 }); // 1600 kg
    const large = finalizeObject("shroom", { radius: 32 }); // 3200 kg
    const lighterAvatar = createAvatar(without("arm-r")); // 4350 kg
    return {
      defense: finalDefense(avatar, full),
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
  assert.strictEqual(result.defense, 3);
  assert.strictEqual(result.rockWeight, 2800); // 100 x radius 28
  assert.ok(Math.abs(result.rock - 5.6) < 1e-9); // 2800 x 0.001 x 12 / 6
  assert.ok(Math.abs(result.atReference - 2.8) < 1e-9); // at the reference impact the attack is weight x 0.001
  assert.ok(Math.abs(result.walking - 1.4) < 1e-9);
  assert.strictEqual(result.noImpact, 0);
  assert.strictEqual(result.avatar, 10); // the avatar hits with its own weight, 5000 kg
  assert.ok(Math.abs(result.lighterAvatar - 8.7) < 1e-9); // a lighter mecha hits softer: 4350 x 0.001 x 2
  assert.strictEqual(result.smallDamage, 1); // attack 3.2 - 3 is below the minimum damage 1
  assert.ok(Math.abs(result.largeDamage - 3.4) < 1e-9); // 6.4 - 3
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
// defense 2 + 1 = 3; dash 12; capacity 6000.

// Runs code with "avatar", "full" (the starter blueprint) and "without(id)" (the starter blueprint minus one part).
function withBlueprints(code) {
  return run(`
    const full = createRun(1).blueprint;
    const avatar = createAvatar(full);
    const without = (id) => ({ parts: full.parts.filter((part) => part !== id) });
    ${code}
  `);
}

test("53 the starter blueprint adds up to the values the avatar had before parts: speed 3, health 100, defense 3, dash 12, 5000 kg", () => {
  const result = withBlueprints(`
    return {
      weight: totalWeight(full), capacity: sumSpec(full, "capacity"),
      speed: finalSpeed(avatar, full), health: finalMaxHealth(avatar, full),
      defense: finalDefense(avatar, full), dash: finalDashSpeed(avatar, full),
      startsFull: createChamber1State(1, 1, full).actors[0].health.now,
      startsFullWithoutHead: createChamber1State(1, 1, without("head")).actors[0].health.now,
    };
  `);
  assert.deepStrictEqual(plain(result), { weight: 5000, capacity: 6000, speed: 3, health: 100, defense: 3, dash: 12, startsFull: 100, startsFullWithoutHead: 85 });
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

test("56 taking a part off changes health and defense by exactly what it gave", () => {
  const result = withBlueprints(`
    return {
      noTorso: { health: finalMaxHealth(avatar, without("torso")), defense: finalDefense(avatar, without("torso")) },
      noHead: { health: finalMaxHealth(avatar, without("head")), defense: finalDefense(avatar, without("head")) },
    };
  `);
  assert.deepStrictEqual(plain(result), { noTorso: { health: 45, defense: 1 }, noHead: { health: 85, defense: 3 } });
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
      starter: attempt(full), // 5000 kg of 6000
      tooHeavy: attempt({ parts: [...full.parts, "legs", "legs"] }), // 7600 kg
      unknown: attempt({ parts: [...full.parts, "wings"] }),
    };
  `);
  assert.strictEqual(result.starter, "accepted");
  assert.strictEqual(result.tooHeavy, "The blueprint weighs 7600 kg and can carry only 6000 kg");
  assert.strictEqual(result.unknown, "Unknown part: wings");
});

test("59 only the avatar has a blueprint: another actor of the same type gets nothing from the parts", () => {
  const result = withBlueprints(`
    const other = finalizeObject("avatar", {}, undefined, "other_1");
    return { speed: finalSpeed(other, full), health: finalMaxHealth(other, full), defense: finalDefense(other, full) };
  `);
  assert.deepStrictEqual(plain(result), { speed: 0, health: 0, defense: 0 });
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
  assert.ok(Math.abs(result.afterHit.health - 97.4) < 1e-9); // the breaking hit still hurt the avatar (5.6 - 3)
  assert.ok(result.x > 99 + 44, "the avatar did not go through the broken rock: x=" + result.x);
  assert.ok(Math.abs(result.health - 97.4) < 1e-9); // and the broken rock hurts no more
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
  // The collision at impact 3: the rock loses 5000 x 0.001 x 3 / 6 = 2.5. The avatar loses the minimum damage 1
  // (the rock's attack, 2800 x 0.001 x 3 / 6 = 1.4, is below its defense 3). Without a bounce nothing else triggers.
  assert.deepStrictEqual(plain(result.settled), { rock: 7.5, avatar: 99, x: 55 });
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

test("67 the attack comes from the weight alone: a thing with weightPerRadius 0 has attack 0 and damage 0 at any impact, the same thing with weight does hit", () => {
  const weightless = loadGame((text) => text.replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,', 'name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 0,'));
  const probe = `
    const rock = finalizeObject("rock", { radius: 28 });
    const full = createRun(1).blueprint;
    const avatar = createAvatar(full);
    return { attack: finalAttack(rock, { impact: 12 }), damage: damageOf(rock, { impact: 12 }, avatar, full) };
  `;
  assert.deepStrictEqual(plain(run(probe, weightless)), { attack: 0, damage: 0 }); // no minimum damage either: there is no attack
  const normal = run(probe);
  assert.ok(Math.abs(normal.attack - 5.6) < 1e-9); // 2800 x 0.001 x 12 / 6
  assert.ok(Math.abs(normal.damage - 2.6) < 1e-9); // 5.6 - 3
});

test("68 a hit always costs at least 1 (the defense never makes the target immune), but no attack means no damage", () => {
  const result = withBlueprints(`
    const small = finalizeObject("shroom", { radius: 16 }); // 1600 kg
    const large = finalizeObject("shroom", { radius: 32 }); // 3200 kg
    return {
      weak: damageOf(small, { impact: 3 }, avatar, full), // attack 0.8, defense 3
      strong: damageOf(large, { impact: 12 }, avatar, full), // attack 6.4, defense 3
      noImpact: damageOf(large, { impact: 0 }, avatar, full),
    };
  `);
  assert.strictEqual(result.weak, 1);
  assert.ok(Math.abs(result.strong - 3.4) < 1e-9);
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
  assert.deepStrictEqual(Object.keys(objects.rock), ["name", "size", "weightPerRadius", "healthRange"]);
  assert.deepStrictEqual(Object.keys(objects.shroom), ["name", "size", "weightPerRadius", "healthRange", "bounce"]); // only the Shroom bounces
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

test("75 everything is made by finalizeObject: an unknown type is refused, an object gets the radius the seed rolled, and the actor types are the avatar and the Dummy", () => {
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
  assert.deepStrictEqual(plain(result.actors), ["avatar", "dummy"]);
  assert.match(result.unknown, /Unknown type: nope/);
  assert.deepStrictEqual(plain(result.rock), { type: "rock", position: { x: 1, y: 2 }, square: { x: 0, y: 0 }, radius: 28, health: { now: 12, max: 12 }, weight: 2800, bounce: 0 });
  assert.strictEqual(result.avatar, 16); // the avatar's radius is its recipe's base, through finalRadius
  assert.deepStrictEqual(JSON.parse(result.fromSeed), { type: "shroom", layer: "small", position: { x: 136, y: -375 }, square: { x: 0, y: -2 }, radius: 16, health: { now: 17, max: 17 }, weight: 1600, bounce: 0.2 }); // the seed's objects come out of the same function
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
  assert.throws(() => loadGame((text) => text.replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,', 'name: "Rock",\n      weightPerRadius: 100,')), /needs a size/);
});


test("78 the rock and the Shroom share nothing: changing the size of one in the data leaves the other as it was", () => {
  const rockOnly = loadGame((text) => text.replace(
    'name: "Rock",\n      size: { min: 16, max: 32 },',
    'name: "Rock",\n      size: { min: 20, max: 40 },'));
  const sizes = plain(run("return { rock: DEFINITIONS.objects.rock.size, shroom: DEFINITIONS.objects.shroom.size };", rockOnly));
  assert.deepStrictEqual(sizes, { rock: { min: 20, max: 40 }, shroom: { min: 16, max: 32 } });
});

test("79 the avatar plays only with its own values: while stepping, the definition of the avatar is never read", () => {
  const result = run(`
    const s = createChamber1State();
    const reads = [];
    const original = definitionOf;
    definitionOf = (thing) => { reads.push(thing.type); return original(thing); };
    for (let i = 0; i < 60; i++) step(s, { move: { x: 1, y: 0 }, dash: i === 10 });
    definitionOf = original;
    return { reads, x: s.actors[0].position.x };
  `);
  assert.ok(!result.reads.includes("avatar"), "the avatar's definition was read while stepping"); // an object being made from the seed reads its own recipe, the avatar never does
  assert.ok(result.x > 100);
});

// ---- The Dummies ----
// Most of these tests use a game without objects (chancePercent 0), so the only collisions are the ones the test sets up.

const EMPTY = loadGame((text) => text.replace("chancePercent: 35", "chancePercent: 0"));

// A state with the avatar and only the Dummies of the given numbers, in the game without objects.
const ROCK_KEY = "small:0,1";
const ROCK_HEALTH = 10;
const ALONE = `
  function alone(...numbers) {
    const s = createChamber1State(1, 1);
    s.actors = [s.actors[0], ...numbers.map((n) => s.actors.find((actor) => actor.id === "dummy_" + n))];
    return s;
  }
  function face(dummy, angle) { dummy.wander.angle = angle; setHeading(dummy); }
`;

test("80 the seed makes the Dummies (100 here), each inside its ranges (radius 8 to 16, health 100, speed from the recipe), inside the window of the grid, the same every time", () => {
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
      if (Math.abs(Math.hypot(d.move.velocity.x, d.move.velocity.y) - 2) > 1e-9) bad++;
      if (Math.abs(d.position.x - avatar.x) > width / 2 - d.radius || Math.abs(d.position.y - avatar.y) > height / 2 - d.radius) bad++;
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

test("81 no Dummy starts on top of another Dummy, an object, or near the avatar", () => {
  const result = run(`
    let overlaps = 0;
    let tooClose = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = createChamber1State(1, seed);
      const dummies = s.actors.filter((actor) => actor.wander);
      const objects = objectsInArea(seed, -2200, -1300, 2200, 1300);
      for (let i = 0; i < dummies.length; i++) {
        const a = dummies[i];
        const fromAvatar = Math.hypot(a.position.x - s.actors[0].position.x, a.position.y - s.actors[0].position.y);
        if (fromAvatar < DEFINITIONS.terrain.dummies.safeRadius + a.radius) tooClose++;
        for (let j = i + 1; j < dummies.length; j++) {
          if (Math.hypot(a.position.x - dummies[j].position.x, a.position.y - dummies[j].position.y) < a.radius + dummies[j].radius) overlaps++;
        }
        for (const object of objects) {
          if (Math.hypot(a.position.x - object.position.x, a.position.y - object.position.y) < a.radius + object.radius) overlaps++;
        }
      }
    }
    return { overlaps, tooClose };
  `, WITH_DUMMIES);
  assert.deepStrictEqual(plain(result), { overlaps: 0, tooClose: 0 });
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

test("85 only a NEW contact turns and hurts: a pair that was touching in the last frame still pushes the Dummy out, but the angle stays and nobody is hurt", () => {
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
    touchDummy(s, [key], d, avatar, key, blueprint); // was touching: no new angle, no hit
    const kept = d.wander.turns;
    const healthKept = [d.health.now, avatar.health.now];
    const gap = Math.hypot(d.position.x - avatar.position.x, d.position.y - avatar.position.y) - (16 + d.radius);
    overlap();
    touchDummy(s, [], d, avatar, key, blueprint); // new contact: a new angle, and a hit
    return { kept, healthKept, health: [d.health.now, avatar.health.now], turned: d.wander.turns, gap, avatar: JSON.stringify(avatar.position), contacts: s.contacts };
  `, EMPTY);
  assert.strictEqual(result.kept, 0);
  assert.deepStrictEqual(plain(result.healthKept), [100, 100]); // no hit while the pair was already touching
  assert.strictEqual(result.turned, 1);
  // The new contact is a hit at impact 2: the avatar (5000 kg) hits for 5000 x 0.001 x 2 / 6 = 1.667, the Dummy for less than the
  // avatar's defense (3), so the minimum of 1.
  assert.ok(Math.abs(result.health[0] - (100 - 5000 * 0.001 * 2 / 6)) < 1e-9 && result.health[1] === 99);
  assert.ok(Math.abs(result.gap) < 1e-9, "the Dummy was not pushed to just touching: " + result.gap);
  assert.strictEqual(result.avatar, '{"x":0,"y":0}'); // the avatar is never pushed by a Dummy
  assert.deepStrictEqual(plain(result.contacts), ["dummy_0|avatar_1", "dummy_0|avatar_1"]);
});

test("86 two Dummies that collide are pushed half way each and both pick a new angle, and neither is hurt", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0, 1);
    const [, a, b] = s.actors;
    face(a, 0); face(b, 180); // toward each other
    a.position.x = 600; a.position.y = 0;
    b.position.x = 600 + a.radius + b.radius - 10; b.position.y = 0;
    const middle = (a.position.x + b.position.x) / 2;
    step(s, { move: { x: 0, y: 0 } });
    return {
      turns: [a.wander.turns, b.wander.turns],
      gap: Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) - (a.radius + b.radius),
      middle: (a.position.x + b.position.x) / 2 - middle,
      contacts: s.contacts,
      health: [a.health.now, b.health.now],
    };
  `, EMPTY);
  assert.deepStrictEqual(plain(result.turns), [1, 1]);
  assert.deepStrictEqual(plain(result.health), [100, 100]); // they close in at 2 + 2 = 4, a collision, but two Dummies never hurt each other
  assert.ok(Math.abs(result.gap) < 1e-9, "not just touching: " + result.gap);
  assert.ok(Math.abs(result.middle) < 1e-9, "the pair moved as a whole: " + result.middle); // each moved the same amount
  assert.deepStrictEqual(plain(result.contacts), ["dummy_0|dummy_1"]);
});

test("87 a Dummy that bumps into the avatar hurts it and is hurt by it, turns and is pushed out; the avatar is not pushed", () => {
  const result = run(`
    ${ALONE}
    const s = alone(0);
    const [avatar, d] = s.actors;
    face(d, 180);
    d.position.x = avatar.position.x + 16 + d.radius + 1; d.position.y = avatar.position.y;
    step(s, { move: { x: 0, y: 0 } });
    return { turns: d.wander.turns, gap: Math.hypot(d.position.x - avatar.position.x, d.position.y - avatar.position.y) - (16 + d.radius), avatar: JSON.stringify(avatar.position), health: avatar.health.now, dummyHealth: d.health.now };
  `, EMPTY);
  assert.strictEqual(result.turns, 1);
  assert.ok(Math.abs(result.dummyHealth - (100 - 5000 * 0.001 * 2 / 6)) < 1e-9, "the Dummy health is " + result.dummyHealth); // the avatar hits for 1.667
  assert.ok(Math.abs(result.gap) < 1e-9);
  assert.strictEqual(result.avatar, '{"x":0,"y":0}');
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
  assert.throws(() => loadGame(patch(0)), /speed of the object dummy.*0/);
  assert.throws(() => loadGame(patch(-1)), /speed of the object dummy/);
  const fast = loadGame(patch(3));
  const result = run(`
    const s = createChamber1State(1, 1);
    const d = s.actors[1];
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
      for (const object of objectsNear(state, dummy)) {
        touchDummy(state, lastContacts, dummy, object, dummy.id + "|" + object.type + " " + objectKey(object), blueprint);
      }
      touchDummy(state, lastContacts, dummy, player, dummy.id + "|" + AVATAR_ID, blueprint);
      for (let j = i + 1; j < dummies.length; j++) touchDummy(state, lastContacts, dummy, dummies[j], dummy.id + "|" + dummies[j].id, blueprint);
    }
  };
  // Plays "frames" steps of a state made by "make", with the grid or with every pair, and returns the state as text.
  // The cells are left out of the comparison of every pair only when it does not write them (it never pushes through
  // refreshCells), so both sides write all the cells again before the text is made.
  const playWith = (make, frames, useEveryPair, input = () => ({ move: { x: 0, y: 0 } })) => {
    const real = collideDummies;
    if (useEveryPair) collideDummies = everyPair;
    try {
      const s = make();
      for (let frame = 0; frame < frames; frame++) step(s, input(frame));
      for (const actor of s.actors) setCells(actor, s.actors[0], s.grid);
      return JSON.stringify(s);
    } finally {
      collideDummies = real;
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
      for (const actor of s.actors) setCells(actor, s.actors[0], s.grid);
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
    const avatar = s.actors[0];
    const cellsAt = (x, y, radius, avatarX = 0, avatarY = 0) => {
      avatar.position.x = avatarX; avatar.position.y = avatarY;
      const actor = { radius, position: { x: avatarX + x, y: avatarY + y }, cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } };
      setCells(actor, avatar, s.grid);
      return actor.cells;
    };
    return {
      fits: cellsAt(0, 0, 16),
      overRight: cellsAt(20, 0, 16), // reaches 36, past the border at 32
      overCorner: cellsAt(20, 20, 16),
      justInside: cellsAt(15.9, 0, 16), // reaches 31.9
      point: cellsAt(100, -70, 0),
      huge: cellsAt(0, 0, 256), // from -256 to 256
      hugeAway: cellsAt(0, 0, 256, 1000, -500), // the cells are relative to the avatar
    };
  `);
  assert.deepStrictEqual(plain(result.fits), { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
  assert.deepStrictEqual(plain(result.overRight), { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } });
  assert.deepStrictEqual(plain(result.overCorner), { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } });
  assert.deepStrictEqual(plain(result.justInside), { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
  assert.deepStrictEqual(plain(result.point), { from: { x: 2, y: -1 }, to: { x: 2, y: -1 } });
  assert.deepStrictEqual(plain(result.huge), { from: { x: -4, y: -4 }, to: { x: 4, y: 4 } }); // 9 x 9 = 81 cells
  assert.deepStrictEqual(plain(result.hugeAway), plain(result.huge));
});

test("97 two circles that overlap always share a cell, whatever their sizes and the size of the cell (20000 pairs, radii 1 to 300)", () => {
  const result = run(`
    const avatar = { position: { x: 0, y: 0 } };
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
          setCells(actor, avatar, grid);
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
      for (const actor of s.actors) setCells(actor, s.actors[0], s.grid);
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
    for (const actor of s.actors) setCells(actor, avatar, s.grid);
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
      const avatar = s.actors[0];
      for (const actor of s.actors) {
        const expected = {
          from: { x: cellIndex(actor.position.x - actor.radius - avatar.position.x, 64), y: cellIndex(actor.position.y - actor.radius - avatar.position.y, 64) },
          to: { x: cellIndex(actor.position.x + actor.radius - avatar.position.x, 64), y: cellIndex(actor.position.y + actor.radius - avatar.position.y, 64) },
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

// The size of the screen is the size of the canvas, written in index.html.
function screenSize() {
  const html = fs.readFileSync(path.join(SRC, "..", "index.html"), "utf8");
  const canvas = html.match(/<canvas id="canvas" width="(\d+)" height="(\d+)"/);
  assert.ok(canvas, "the canvas and its size were not found in index.html");
  return { width: Number(canvas[1]), height: Number(canvas[2]) };
}

// The actor recipes of a game that allow a radius above the margin, as text ("dummy: 600 > 580"). Empty if none.
function actorsTooLarge(game) {
  const screen = screenSize();
  return run(`
    const grid = createChamber1State().grid;
    const margin = Math.min((grid.windowWidth * grid.cellSize - ${screen.width}) / 2, (grid.windowHeight * grid.cellSize - ${screen.height}) / 2);
    const tooLarge = [];
    for (const [id, recipe] of Object.entries(DEFINITIONS.actors)) {
      const largest = recipe.size ? recipe.size.max : recipe.radius;
      if (!(largest <= margin)) tooLarge.push(id + ": " + largest + " > " + margin);
    }
    return { margin, tooLarge, actors: Object.keys(DEFINITIONS.actors).length };
  `, game);
}

test("101 no recipe in the definitions allows an actor larger than the space between the screen and the edge of the window (580), so a wrap is never seen", () => {
  const real = actorsTooLarge(context);
  assert.strictEqual(real.margin, 580); // (35 x 64 - 1080) / 2 up and down; across it is (61 x 64 - 1920) / 2 = 992
  assert.ok(real.actors >= 2, "the avatar and the Dummy must both be looked at");
  assert.deepStrictEqual(plain(real.tooLarge), []);

  // The check can fail: a Dummy recipe that goes up to 581 is caught, and one that goes up to exactly 580 is not.
  const withSize = (max) => loadGame((text) => {
    const patched = text.replace(/dummies: \{ count: \d+,/, "dummies: { count: 0,").replace("size: { min: 8, max: 16 },", "size: { min: 8, max: " + max + " },");
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
const GIANT = '    giant: { name: "Giant", size: { min: 200, max: 256 }, weightPerRadius: 100, healthRange: { min: 10, max: 20 } },\n    rock: {';

function withHugeLayer(square = 2048) {
  return loadGame((text) => {
    let patched = patchOnce(text, "    rock: {", GIANT);
    patched = patchOnce(patched, AFTER_SMALL, HUGE_LAYER(square));
    return patchOnce(patched, "dummies: { count: 1000,", "dummies: { count: 0,");
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
