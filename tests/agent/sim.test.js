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
  // The rules need the build of the run as the third argument of step. Most tests do not care
  // which one, so here step plays with the starter build unless a test passes another.
  vm.runInContext("const realStep = step; step = (state, input, build = createRun(1).build) => realStep(state, input, build);", context);
  return context;
}

const context = loadGame();

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

test("10 the state has the grid settings, and the player is always in cell (0, 0)", () => {
  const state = run(`
    const s = createChamber1State();
    for (let i = 0; i < 30; i++) step(s, { move: { x: 1, y: 0 } });
    return s;
  `);
  assert.strictEqual(state.grid.cellSize, 64);
  assert.strictEqual(state.grid.windowWidth, 61);
  assert.strictEqual(state.grid.windowHeight, 35);
  assert.strictEqual(state.actors[0].cell.x, 0);
  assert.strictEqual(state.actors[0].cell.y, 0);
});

test("11 cell boundaries: the center cell covers [-32, +32) around the player", () => {
  const cells = run(`
    return [31.9, 32, -32, -32.1, 100, 0].map((dx) => {
      const s = createChamber1State();
      s.actors.push({ id: "dummy", type: "dummy", position: { x: dx, y: -70 }, radius: 16, cell: { x: 0, y: 0 } });
      step(s, { move: { x: 0, y: 0 } });
      const dummy = s.actors.find((actor) => actor.id === "dummy");
      return [dummy.cell.x, dummy.cell.y];
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
    s.actors.push({ id: "dummy", type: "dummy", position: { x: 100, y: 0 }, radius: 16, cell: { x: 0, y: 0 } });
    step(s, { move: { x: 0, y: 0 } });
    const dummy = s.actors.find((actor) => actor.id === "dummy");
    const before = dummy.cell.x;
    const original = finalSpeed;
    finalSpeed = () => 64;
    s.actors[0].move.velocity.x = 64; // already moving at 64 px per frame
    step(s, { move: { x: 1, y: 0 } });
    finalSpeed = original;
    return [before, dummy.cell.x];
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
    const before = DEFINITIONS.actors.player.radius;
    DEFINITIONS.actors.player.radius = 99; // ignored: frozen
    DEFINITIONS.actors.other = { radius: 1 }; // ignored: frozen
    return {
      version: s.definitionsVersion,
      expectedVersion: DEFINITIONS_VERSION,
      frozen: Object.isFrozen(DEFINITIONS) && Object.isFrozen(DEFINITIONS.actors.player),
      unchanged: DEFINITIONS.actors.player.radius === before && !("other" in DEFINITIONS.actors),
      type: player.type,
      hasRadius: "radius" in player,
      hasBaseSpeed: "baseSpeed" in player,
      health: player.health,
      radius: definitionOf(player).radius,
      speed: finalSpeed(player, createRun(1).build),
    };
  `);
  assert.strictEqual(result.version, result.expectedVersion);
  assert.strictEqual(result.frozen, true);
  assert.strictEqual(result.unchanged, true);
  assert.strictEqual(result.type, "player");
  assert.strictEqual(result.hasRadius, false); // fixed values stay in the definitions
  assert.strictEqual(result.hasBaseSpeed, false);
  assert.deepStrictEqual(plain(result.health), { current: 100 });
  assert.strictEqual(result.radius, 16);
  assert.strictEqual(result.speed, 3);
});

test("17 unknown types fail loudly, and a type without 'move' is static", () => {
  const result = run(`
    let createRejected = false;
    try { createActor("x", "nope"); } catch (error) { createRejected = true; }
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
      'const DEFINITIONS = {\n  actors: {\n    trap: { name: "Trap", maxHealth: 1, attack: 5, defense: 0, radius: 10, initial: { health: { current: 1 }, position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } } },'
    );
    assert.notStrictEqual(patched, text, "the patch of data.js should apply");
    return patched;
  });
  const trap = run('return createActor("trap_1", "trap");', withTrap);
  assert.strictEqual("move" in trap, false);
  assert.strictEqual(trap.health.current, 1);

  const walker = run('return createActor("walker_1", "player");', withTrap);
  assert.strictEqual("move" in walker, true);

  const trapPosition = run(
    `
    const s = createChamber1State();
    s.actors.push(createActor("trap_1", "trap"));
    step(s, { move: { x: 1, y: 0 } });
    return JSON.stringify(s.actors.find((actor) => actor.id === "trap_1").position);
  `,
    withTrap
  );
  assert.strictEqual(trapPosition, JSON.stringify({ x: 0, y: 0 }));
});

test("18 a new actor is a copy of the initial state in the definitions, and owns its numbers", () => {
  const result = run(`
    const a = createActor("a", "player");
    const b = createActor("b", "player");
    a.position.x = 50;
    a.health.current = 1;
    a.move.direction.x = 1;
    a.move.velocity.x = 2;
    const initial = DEFINITIONS.actors.player.initial;
    return {
      sameAsInitial: JSON.stringify({ id: "b", type: "player", ...initial }) === JSON.stringify(b),
      definitionsUntouched: initial.position.x === 0 && initial.health.current === 0
        && initial.move.direction.x === 0 && initial.move.velocity.x === 0,
      otherUntouched: b.position.x === 0 && b.health.current === 0
        && b.move.direction.x === 0 && b.move.velocity.x === 0,
      idFirst: Object.keys(a).slice(0, 2).join(","),
    };
  `);
  assert.strictEqual(result.sameAsInitial, true);
  assert.strictEqual(result.definitionsUntouched, true);
  assert.strictEqual(result.otherUntouched, true);
  assert.strictEqual(result.idFirst, "id,type");
});

test("19 the run and the state: the state carries the run id, and the build is the starter build and outside the state", () => {
  const result = run(`
    const r = createRun(7);
    const s = createChamber1State(r.id);
    return { run: r, stateRun: s.run, defaultRun: createChamber1State().run, hasBuild: "build" in s, starterParts: DEFINITIONS.starterBuild.parts };
  `);
  assert.deepStrictEqual(plain(result.run), { id: 7, build: { parts: plain(result.starterParts) } });
  assert.strictEqual(result.stateRun, 7);
  assert.strictEqual(result.defaultRun, 1);
  assert.strictEqual(result.hasBuild, false);
});

// ---- Run history ----

test("20 history: two aligned lists, index 0 is the oldest, and the snaps are copies", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s, createRun(1).build);
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
    const h = createHistory(s, createRun(1).build);
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
    const h = createHistory(s, createRun(1).build);
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
    const h = createHistory(s, createRun(1).build);
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
    const h = createHistory(s, createRun(1).build);
    let counter = 0;
    const original = finalSpeed;
    finalSpeed = (actor, build) => (counter++ >= 60 ? 0.1 : original(actor, build));
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
    const h = createHistory(s, createRun(1).build);
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
      halfVelocity: half.actors[0].move.velocity.x,
    };
  `);
  assert.strictEqual(result.fullVelocity, 12);
  assert.strictEqual(result.fullPosition, 12); // the frame of the dash already moves at full dash speed
  assert.strictEqual(result.fullCharges, 0);
  assert.strictEqual(result.halfVelocity, 12);
});

test("27 a dash without a direction does nothing, and the charge is kept", () => {
  const result = run(`
    const s = createChamber1State();
    step(s, { move: { x: 0, y: 0 }, dash: true });
    return { velocity: s.actors[0].move.velocity.x, charges: s.actors[0].dash.charges };
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
    const early = { charges: player.dash.charges, velocity: player.move.velocity.x };
    step(s, { move: { x: 1, y: 0 }, dash: true }); // 240 frames later: the charge is back, and it is used
    const late = { charges: player.dash.charges, velocity: player.move.velocity.x };
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
    const h = createHistory(s, createRun(1).build);
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
    const a = JSON.stringify(rocksInArea(1, -3000, -3000, 3000, 3000));
    const b = JSON.stringify(rocksInArea(1, -3000, -3000, 3000, 3000));
    return [a, b];
  `);
  assert.strictEqual(first, second);
  assert.ok(JSON.parse(first).length > 50); // and there really are rocks
});

test("35 different seeds give different rocks", () => {
  const [one, two] = run(`
    return [JSON.stringify(rocksInArea(1, -3000, -3000, 3000, 3000)), JSON.stringify(rocksInArea(2, -3000, -3000, 3000, 3000))];
  `);
  assert.notStrictEqual(one, two);
});

test("36 a rock does not depend on where you look from: a small area finds exactly the rocks of a big one that fall inside it", () => {
  const { small, fromBig } = run(`
    const big = rocksInArea(7, -2000, -2000, 2000, 2000);
    const small = rocksInArea(7, -500, -300, 700, 900);
    const fromBig = big.filter((r) => r.position.x >= -500 && r.position.x <= 700 && r.position.y >= -300 && r.position.y <= 900);
    return { small: JSON.stringify(small), fromBig: JSON.stringify(fromBig) };
  `);
  assert.strictEqual(small, fromBig);
});

test("37 there is no rock near the starting point, for any seed", () => {
  const closest = run(`
    let closest = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      for (const rock of rocksInArea(seed, -1000, -1000, 1000, 1000)) {
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
      const rocks = rocksInArea(seed, -3000, -3000, 3000, 3000);
      for (let i = 0; i < rocks.length; i++) {
        for (let j = i + 1; j < rocks.length; j++) {
          const dx = rocks[i].position.x - rocks[j].position.x;
          const dy = rocks[i].position.y - rocks[j].position.y;
          const reach = DEFINITIONS.actors[rocks[i].type].radius + DEFINITIONS.actors[rocks[j].type].radius;
          if (dx * dx + dy * dy < reach * reach) overlaps++;
        }
      }
    }
    return overlaps;
  `);
  assert.strictEqual(overlaps, 0);
});

test("39 known answer: seed 1 gives 12 rocks on the first screen, the first one a boulder at 172,-435 with 17 health", () => {
  // If this fails after a change to the formula or the hash, every map changed.
  // If it fails on another machine or browser, the hash is not exact there.
  const result = run(`
    const rocks = rocksInArea(1, -960, -540, 960, 540);
    return { count: rocks.length, first: rocks[0], last: rocks[rocks.length - 1] };
  `);
  assert.strictEqual(result.count, 12);
  assert.deepStrictEqual(plain(result.first), { type: "boulder", position: { x: 172, y: -435 }, square: { x: 0, y: -2 }, maxHealth: 17 });
  assert.deepStrictEqual(plain(result.last), { type: "boulder", position: { x: 854, y: 418 }, square: { x: 3, y: 1 }, maxHealth: 12 });
});

test("40 the state keeps only the seed, not the rocks, and every rock kind is valid", () => {
  const result = run(`
    const s = createChamber1State(1, 5);
    const rules = DEFINITIONS.terrain.rocks;
    return {
      seed: s.seed,
      defaultSeed: createChamber1State().seed,
      hasRocks: JSON.stringify(s).includes("stone") || "rocks" in s,
      kinds: rules.kinds.map((kind) => ({
        kind,
        exists: kind in DEFINITIONS.actors,
        isStatic: !("move" in DEFINITIONS.actors[kind].initial),
        fits: DEFINITIONS.actors[kind].radius <= rules.margin,
        bounceOk: DEFINITIONS.actors[kind].bounce >= 0 && DEFINITIONS.actors[kind].bounce <= 1,
      })),
    };
  `);
  assert.strictEqual(result.seed, 5);
  assert.strictEqual(result.defaultSeed, 1);
  assert.strictEqual(result.hasRocks, false);
  for (const kind of result.kinds) {
    assert.ok(kind.exists && kind.isStatic && kind.bounceOk, kind.kind);
    assert.ok(kind.fits, kind.kind + ": a radius above the margin could make rocks overlap");
  }
});

// ---- Collision with rocks ----
// These tests use rocks of seed 1 (see test 39 for the list): a stone at 159,444
// (radius 16, bounce 0), a boulder at 172,-435 (radius 20, bounce 0.5) and a rubber
// rock at 711,-63 (radius 12, bounce 1). The avatar has radius 16.

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

test("41 head-on at 3 px/frame: the stone stops you, the boulder sends you back at 1.5, the rubber rock at 3", () => {
  const right = { x: 1, y: 0 };
  const stone = hitOnce(127, 444, 3, 0, right); // would end at 130, 3 px inside the stone
  const boulder = hitOnce(145, -435, 3, 0, right); // would end at 148, 12 px inside the boulder
  const rubber = hitOnce(681, -63, 3, 0, right); // would end at 684, 1 px inside the rubber rock
  assert.strictEqual(stone.vx, 0); // bounce 0: -0 x 3
  assert.strictEqual(boulder.vx, -1.5); // bounce 0.5: -0.5 x 3
  assert.strictEqual(rubber.vx, -3); // bounce 1: -1 x 3
});

test("42 the avatar is pushed out until it just touches the rock", () => {
  const right = { x: 1, y: 0 };
  assert.strictEqual(hitOnce(127, 444, 3, 0, right).x, 127); // 159 - (16 + 16)
  assert.strictEqual(hitOnce(145, -435, 3, 0, right).x, 136); // 172 - (16 + 20)
  assert.strictEqual(hitOnce(681, -63, 3, 0, right).x, 683); // 711 - (16 + 12)
});

test("43 the angle matters: only the part going into the rock is replaced, the part along it is kept", () => {
  const right = { x: 1, y: 0 };
  // A glancing blow on the stone (159,444). The avatar goes right and ends up above-left of it.
  const hit = hitOnce(140, 420, 3, 0, right);
  const result = run(`
    const nx = ${hit.x} - 159;
    const ny = ${hit.y} - 444;
    const length = Math.sqrt(nx * nx + ny * ny);
    const n = { x: nx / length, y: ny / length };
    const before = { x: 3, y: 0 };
    const tangent = { x: -n.y, y: n.x };
    const along = (v) => v.x * tangent.x + v.y * tangent.y;
    const into = (v) => v.x * n.x + v.y * n.y;
    const after = { x: ${hit.vx}, y: ${hit.vy} };
    return {
      touching: length, // must be 32
      intoAfter: into(after),
      alongBefore: along(before),
      alongAfter: along(after),
      speedBefore: 3,
      speedAfter: Math.sqrt(after.x * after.x + after.y * after.y),
    };
  `);
  assert.ok(Math.abs(result.touching - 32) < 1e-9);
  assert.ok(Math.abs(result.intoAfter) < 1e-9); // bounce 0: nothing goes into the rock any more
  assert.ok(Math.abs(result.alongAfter - result.alongBefore) < 1e-9); // the sliding part is kept
  assert.ok(result.speedAfter > 0.8 * result.speedBefore); // a glancing blow loses little (head-on loses everything)
  assert.ok(result.speedAfter < result.speedBefore);
});

test("44 a dash into a stone stops, a dash into a rubber rock comes back at the full dash speed", () => {
  // A dash now hurts the rock by 10, which would break the stone (health 10) and cancel the bounce.
  // So here every rock has 50 health: the test is about the bounce, not about breaking.
  const tough = loadGame((text) => text.replace("healthRange: { min: 10, max: 20 }", "healthRange: { min: 50, max: 50 }").replaceAll("healthRange: { min: 10, max: 20 }", "healthRange: { min: 50, max: 50 }"));
  const dashInto = (x, y) => run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = ${x}; p.position.y = ${y};
    step(s, { move: { x: 1, y: 0 }, dash: true });
    return { x: p.position.x, vx: p.move.velocity.x };
  `, tough);
  const intoStone = dashInto(125, 444); // dash: 12 px, ends 10 px inside
  const intoRubber = dashInto(690, -63);
  assert.strictEqual(intoStone.vx, 0);
  assert.strictEqual(intoStone.x, 127);
  assert.strictEqual(intoRubber.vx, -12);
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
        for (const rock of rocksInArea(seed, p.position.x - 100, p.position.y - 100, p.position.x + 100, p.position.y + 100)) {
          if (isRockBroken(s, rock)) continue; // a broken rock has no collision
          const dx = p.position.x - rock.position.x;
          const dy = p.position.y - rock.position.y;
          const gap = Math.sqrt(dx * dx + dy * dy) - (16 + DEFINITIONS.actors[rock.type].radius);
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
    p.position.x = 100; p.position.y = 444; // next to the stone at 159,444
    const h = createHistory(s, createRun(1).build);
    let touchingFrames = 0;
    for (let i = 0; i < 300; i++) {
      const input = { move: { x: i % 60 < 40 ? 1 : -0.5, y: i % 90 < 30 ? 0.3 : -0.2 }, dash: i % 80 === 10 };
      step(s, input);
      recordFrame(h, s, input);
      const dx = p.position.x - 159;
      const dy = p.position.y - 444;
      if (Math.abs(Math.sqrt(dx * dx + dy * dy) - 32) < 1e-9) touchingFrames++;
    }
    return { check: crossCheck(h), touchingFrames };
  `);
  assert.ok(result.touchingFrames > 0); // the run really hit the stone
  assert.strictEqual(result.check, null);
});

// ---- Body slam: damage from collisions ----
// The rule (src/sim.js): every contact with something that has doesDamage is a hit. The attack is
// weight x 0.001 x impact / 6 (impact = the speed going into the other thing; provisional formula).
// damage = max(0, attack - defense). Avatar: 5000 kg, defense 3, health 100.
// Rocks of seed 1 (see test 39): the stone at 159,444 (5000 kg, health 10, square 0,1), the boulder at
// 172,-435 (7800 kg, health 17, square 0,-2) and the rubber rock at 711,-63 (2800 kg, health 15, square 2,-1).

// Dashes right from (x, y) into a rock, and tells the health of the avatar and of the rock after the hit.
function slamInto(x, y, rockKey, rockMaxHealth) {
  return run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = ${x}; p.position.y = ${y};
    step(s, { move: { x: 1, y: 0 }, dash: true });
    return { avatar: p.health.current, rock: s.damagedRocks["${rockKey}"] ?? ${rockMaxHealth}, vx: p.move.velocity.x };
  `);
}

test("47 walking into a rock at 3 px/frame is a weak hit: the stone loses 2.5, the avatar the minimum damage 1 (2.5 - 3 is below 1)", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 127; p.position.y = 444; // touching the stone at 159,444
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } });
    return { avatar: p.health.current, damagedRocks: s.damagedRocks, vx: p.move.velocity.x };
  `);
  assert.strictEqual(result.avatar, 99); // 2.5 - 3 is below the minimum damage, 1
  assert.deepStrictEqual(plain(result.damagedRocks), { "0,1": 7.5 }); // 10 - 5000 x 0.001 x 3 / 6
  assert.strictEqual(result.vx, 0); // it still stopped (the bounce is a separate rule)
});

test("48 a dash (impact 12) hurts both: each hits with weight x 0.001 x 12 / 6; the avatar loses that minus the defense 3", () => {
  const stone = slamInto(125, 444, "0,1", 10); // 4800 kg: attack 9.6, so 9.6 - 3 = 6.6 to the avatar; the avatar (5000 kg) hits for 10
  assert.ok(Math.abs(stone.avatar - 93.4) < 1e-9, "stone: " + stone.avatar);
  assert.strictEqual(stone.rock, 0); // 10 - 10: it breaks
  const boulder = slamInto(145, -435, "0,-2", 17); // 6000 kg: attack 12, so 12 - 3 = 9
  assert.ok(Math.abs(boulder.avatar - 91) < 1e-9, "boulder: " + boulder.avatar);
  assert.strictEqual(boulder.rock, 7); // 17 - 10
  const rubber = slamInto(690, -63, "2,-1", 15); // 3600 kg: attack 7.2, so 7.2 - 3 = 4.2
  assert.ok(Math.abs(rubber.avatar - 95.8) < 1e-9, "rubber: " + rubber.avatar);
  assert.strictEqual(rubber.rock, 5); // 15 - 10
});

test("49 a graze is a weak hit: only the part of the speed going into the rock counts, so it hurts less than a head-on walk", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 140; p.position.y = 420; // the glancing blow of test 43
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } });
    return { avatar: p.health.current, damagedRocks: s.damagedRocks };
  `);
  assert.strictEqual(result.avatar, 99); // the attack is below the defense, so the minimum damage 1
  const loss = 10 - result.damagedRocks["0,1"];
  assert.ok(loss > 0 && loss < 2.5, "a graze should hurt the stone less than the head-on walk of test 47 (2.5), it lost " + loss);
});

test("50 the attack: weight x 0.001 x impact / 6, 0 without impact; the damage never goes below 0", () => {
  const result = withBuilds(`
    const stone = { type: "stone", position: { x: 0, y: 0 } };
    const boulder = { type: "boulder", position: { x: 0, y: 0 } };
    const rubber = { type: "rubber", position: { x: 0, y: 0 } };
    const lighter = without("arm-r"); // 4350 kg
    return {
      defense: finalDefense(avatar, full),
      stone: finalAttack(stone, { impact: 12 }, full),
      atReference: finalAttack(stone, { impact: 6 }, full),
      walking: finalAttack(stone, { impact: 3 }, full),
      noImpact: finalAttack(stone, { impact: 0 }, full),
      avatar: finalAttack(avatar, { impact: 12 }, full),
      lighterAvatar: finalAttack(avatar, { impact: 12 }, lighter),
      boulderDamage: damageOf(boulder, { impact: 12 }, avatar, full),
      rubberDamage: damageOf(rubber, { impact: 12 }, avatar, full),
      stoneWeight: weightOf(stone, full),
    };
  `);
  assert.strictEqual(result.defense, 3);
  assert.strictEqual(result.stoneWeight, 4800); // 300 x radius 16
  assert.ok(Math.abs(result.stone - 9.6) < 1e-9); // 4800 x 0.001 x 12 / 6
  assert.ok(Math.abs(result.atReference - 4.8) < 1e-9); // at the reference impact the attack is weight x 0.001
  assert.ok(Math.abs(result.walking - 2.4) < 1e-9);
  assert.strictEqual(result.noImpact, 0);
  assert.strictEqual(result.avatar, 10); // the avatar hits with its own weight, 5000 kg
  assert.ok(Math.abs(result.lighterAvatar - 8.7) < 1e-9); // a lighter mecha hits softer: 4350 x 0.001 x 2
  assert.ok(Math.abs(result.boulderDamage - 9) < 1e-9); // 12 - 3
  assert.ok(Math.abs(result.rubberDamage - 4.2) < 1e-9); // 7.2 - 3
});

test("51 health stops at 0 (there is no death yet)", () => {
  const health = run(`
    const p = createChamber1State().actors[0]; // starts with 100
    applyDamage(p, 60);
    applyDamage(p, 60);
    return p.health.current;
  `);
  assert.strictEqual(health, 0);
});

test("52 the cross-check stays clean in a run where both sides are hurt, and the state is plain numbers", () => {
  const result = withBuilds(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 100; p.position.y = 444; // next to the stone at 159,444
    const h = createHistory(s, full);
    for (let i = 0; i < 300; i++) {
      const input = { move: { x: i % 60 < 40 ? 1 : -0.5, y: i % 90 < 30 ? 0.3 : -0.2 }, dash: i % 80 === 10 };
      step(s, input, full);
      recordFrame(h, s, input);
    }
    return { check: crossCheck(h), health: p.health.current, damagedRocks: s.damagedRocks };
  `);
  assert.ok(result.health < 100, "the run never hurt the avatar");
  assert.ok(Number.isFinite(result.health));
  assert.ok(Object.keys(result.damagedRocks).length > 0, "the run never hurt a rock");
  assert.ok(Object.values(result.damagedRocks).every(Number.isFinite));
  assert.strictEqual(result.check, null);
});

// ---- The kit of parts ----
// The final values of the avatar are the SUM of the specs of the parts in its build.
// Starter build: 9 parts, 5000 kg. Top speed 3.5 + 0.5 - 5000 x 0.0002 = 3; health 15 + 55 + 30 = 100;
// defense 2 + 1 = 3; dash 12; capacity 6000.

// Runs code with "avatar", "full" (the starter build) and "without(id)" (the starter build minus one part).
function withBuilds(code) {
  return run(`
    const avatar = createActor(PLAYER_ID, "player");
    const full = createRun(1).build;
    const without = (id) => ({ parts: full.parts.filter((part) => part !== id) });
    ${code}
  `);
}

test("53 the starter build adds up to the values the avatar had before parts: speed 3, health 100, defense 3, dash 12, 5000 kg", () => {
  const result = withBuilds(`
    return {
      weight: totalWeight(full), capacity: sumSpec(full, "capacity"),
      speed: finalSpeed(avatar, full), health: finalMaxHealth(avatar, full),
      defense: finalDefense(avatar, full), dash: finalDashSpeed(avatar, full),
      startsFull: createChamber1State(1, 1, full).actors[0].health.current,
      startsFullWithoutHead: createChamber1State(1, 1, without("head")).actors[0].health.current,
    };
  `);
  assert.deepStrictEqual(plain(result), { weight: 5000, capacity: 6000, speed: 3, health: 100, defense: 3, dash: 12, startsFull: 100, startsFullWithoutHead: 85 });
});

test("54 weight takes speed away directly: taking off a 650 kg arm gives back 650 x 0.0002 = 0.13 px/frame", () => {
  const result = withBuilds(`
    return {
      withoutArm: finalSpeed(avatar, without("arm-r")),
      withoutHead: finalSpeed(avatar, without("head")), // 200 kg: 0.04
    };
  `);
  assert.ok(Math.abs(result.withoutArm - 3.13) < 1e-9, "without an arm: " + result.withoutArm);
  assert.ok(Math.abs(result.withoutHead - 3.04) < 1e-9, "without the head: " + result.withoutHead);
});

test("55 without the legs the speed is the Torso's 0.5 minus the weight, and it never goes below 0", () => {
  const speed = withBuilds("return finalSpeed(avatar, without('legs'));"); // 0.5 - 3700 x 0.0002 = -0.24
  assert.strictEqual(speed, 0);
});

test("56 taking a part off changes health and defense by exactly what it gave", () => {
  const result = withBuilds(`
    return {
      noTorso: { health: finalMaxHealth(avatar, without("torso")), defense: finalDefense(avatar, without("torso")) },
      noHead: { health: finalMaxHealth(avatar, without("head")), defense: finalDefense(avatar, without("head")) },
    };
  `);
  assert.deepStrictEqual(plain(result), { noTorso: { health: 45, defense: 1 }, noHead: { health: 85, defense: 3 } });
});

test("57 without the Booster there is no dash, and the charge is kept", () => {
  const result = withBuilds(`
    const noBooster = without("booster");
    const s = createChamber1State();
    const p = s.actors[0];
    step(s, { move: { x: 1, y: 0 }, dash: true }, noBooster);
    return { dashSpeed: finalDashSpeed(avatar, noBooster), charges: p.dash.charges, vx: p.move.velocity.x };
  `);
  assert.strictEqual(result.dashSpeed, 0);
  assert.strictEqual(result.charges, 1); // nothing spent
  assert.strictEqual(result.vx, 0.25); // only the normal acceleration (a dash would have set 12)
});

test("58 a build over the capacity of the Torso is refused, and so is an unknown part", () => {
  const result = withBuilds(`
    const attempt = (build) => { try { assertValidBuild(build); return "accepted"; } catch (error) { return error.message; } };
    return {
      starter: attempt(full), // 5000 kg of 6000
      tooHeavy: attempt({ parts: [...full.parts, "legs", "legs"] }), // 7600 kg
      unknown: attempt({ parts: [...full.parts, "wings"] }),
    };
  `);
  assert.strictEqual(result.starter, "accepted");
  assert.strictEqual(result.tooHeavy, "The build weighs 7600 kg and can carry only 6000 kg");
  assert.strictEqual(result.unknown, "Unknown part: wings");
});

test("59 only the avatar has a build: another actor of the same type gets nothing from the parts", () => {
  const result = withBuilds(`
    const other = createActor("other_1", "player");
    return { speed: finalSpeed(other, full), health: finalMaxHealth(other, full), defense: finalDefense(other, full) };
  `);
  assert.deepStrictEqual(plain(result), { speed: 0, health: 0, defense: 0 });
});

test("60 the build is an input of the replay: the cross-check is clean with the right build and finds a difference with another", () => {
  const result = withBuilds(`
    const s = createChamber1State();
    const noArm = without("arm-r");
    const h = createHistory(s, noArm);
    for (let i = 0; i < 60; i++) {
      const input = { move: { x: 1, y: 0 } };
      step(s, input, noArm);
      recordFrame(h, s, input);
    }
    const right = crossCheck(h);
    h.build = full; // replay with a build that is not the one the run was played with
    const wrong = crossCheck(h);
    return { right, wrong, top: s.actors[0].move.velocity.x };
  `);
  assert.strictEqual(result.right, null);
  assert.ok(result.wrong !== null, "a different build must change the replay");
  assert.ok(Math.abs(result.top - 3.13) < 1e-9); // the run really used the lighter build
});

// ---- Rocks with health, and the training dummy ----

test("61 a rock that is hurt is stored by its square, and it keeps its health between frames", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 690; p.position.y = -63;
    step(s, { move: { x: 1, y: 0 }, dash: true }); // hits the rubber rock: 15 - 10
    for (let i = 0; i < 10; i++) step(s, { move: { x: 0, y: 0 } });
    return { damagedRocks: s.damagedRocks, json: JSON.stringify(s) };
  `);
  assert.deepStrictEqual(plain(result.damagedRocks), { "2,-1": 5 });
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json); // still plain JSON
});

test("62 a rock that reaches 0 breaks: nothing collides with it and the avatar goes through", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    s.damagedRocks["0,1"] = 5; // the stone at 159,444 has 5 left
    p.position.x = 125; p.position.y = 444;
    step(s, { move: { x: 1, y: 0 }, dash: true }); // 5 - 10: it breaks (health stops at 0)
    const afterHit = { broken: s.damagedRocks["0,1"], vx: p.move.velocity.x, x: p.position.x, health: p.health.current };
    for (let i = 0; i < 40; i++) step(s, { move: { x: 1, y: 0 } });
    return { afterHit, x: p.position.x, health: p.health.current };
  `);
  assert.strictEqual(result.afterHit.broken, 0);
  assert.strictEqual(result.afterHit.vx, 12); // no bounce and no stop
  assert.strictEqual(result.afterHit.x, 137); // not pushed out
  assert.ok(Math.abs(result.afterHit.health - 93.4) < 1e-9); // the breaking hit still hurt the avatar (9.6 - 3)
  assert.ok(result.x > 159 + 32, "the avatar did not go through the broken rock: x=" + result.x);
  assert.ok(Math.abs(result.health - 93.4) < 1e-9); // and the broken rock hurts no more
});

test("63 every rock rolls its own health from the seed: whole numbers from 10 to 20, the same every time, and all values show up", () => {
  const result = run(`
    const seen = new Set();
    let outOfRange = 0, notWhole = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const rock of rocksInArea(seed, -3000, -3000, 3000, 3000)) {
        seen.add(rock.maxHealth);
        if (rock.maxHealth < 10 || rock.maxHealth > 20) outOfRange++;
        if (!Number.isInteger(rock.maxHealth)) notWhole++;
      }
    }
    const again = JSON.stringify(rocksInArea(3, -2000, -2000, 2000, 2000)) === JSON.stringify(rocksInArea(3, -2000, -2000, 2000, 2000));
    return { outOfRange, notWhole, values: [...seen].sort((a, b) => a - b), again };
  `);
  assert.strictEqual(result.outOfRange, 0);
  assert.strictEqual(result.notWhole, 0);
  assert.strictEqual(result.again, true);
  assert.deepStrictEqual(plain(result.values), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test("64 the weight of a still actor is weightPerRadius x radius, a whole number: twice the radius, twice the weight", () => {
  const result = run(`
    return ["stone", "boulder", "rubber", "dummy"].map((kind) => {
      const definition = DEFINITIONS.actors[kind];
      return { kind, radius: definition.radius, weightPerRadius: definition.weightPerRadius, weight: weightOfType(definition) };
    });
  `);
  for (const actor of result) {
    assert.strictEqual(actor.weight, actor.weightPerRadius * actor.radius, actor.kind);
    assert.ok(Number.isInteger(actor.weight), actor.kind);
  }
  assert.deepStrictEqual(plain(result).map((actor) => actor.weight), [4800, 6000, 3600, 4800]);
  const [stone, boulder] = result;
  assert.strictEqual(boulder.weight / stone.weight, boulder.radius / stone.radius); // linear in the radius, not the area
});

test("65 the training dummy: the first dash up hits it with an impact of 7, and it hits back with its own weight", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    const dummy = s.actors.find((actor) => actor.id === "dummy_1");
    const start = { x: dummy.position.x, y: dummy.position.y };
    step(s, { move: { x: 0, y: -1 }, dash: true });
    let hitFrame = null;
    let velocityBefore = null;
    for (let i = 1; i < 30 && hitFrame === null; i++) {
      velocityBefore = player.move.velocity.y;
      step(s, { move: { x: 0, y: -1 } });
      if (dummy.health.current < 30) hitFrame = i;
    }
    return { start, hitFrame, velocityBefore, dummy: dummy.health.current, avatar: player.health.current,
      velocityAfter: player.move.velocity.y, dummyMoved: dummy.position.x !== start.x || dummy.position.y !== start.y };
  `);
  assert.deepStrictEqual(plain(result.start), { x: 0, y: -130 });
  assert.ok(result.hitFrame !== null, "the first dash did not reach the dummy");
  assert.ok(Math.abs(result.dummy - (30 - 35 / 6)) < 1e-9); // 5000 x 0.001 x 7 / 6 = 5.83, defense 0
  assert.ok(Math.abs(result.avatar - 97.4) < 1e-9); // the dummy (4800 kg) hits back: 4800 x 0.001 x 7 / 6 = 5.6, minus 3 = 2.6
  assert.ok(result.velocityAfter > 0, "bounce 0.5: the avatar comes back"); // moving up is negative y
  assert.strictEqual(result.dummyMoved, false);
});

test("66 pressing into the dummy: it bounces back and hits again while the impact is at least 1 (3, then 1.5), then nothing more; at 0 it stays", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    const dummy = s.actors.find((actor) => actor.id === "dummy_1");
    for (let i = 0; i < 100; i++) step(s, { move: { x: 0, y: -1 } }); // walks up into the dummy and keeps pressing
    const settled = { dummy: dummy.health.current, avatar: player.health.current };
    for (let i = 0; i < 200; i++) step(s, { move: { x: 0, y: -1 } }); // keeps pressing
    const afterPressing = { dummy: dummy.health.current, avatar: player.health.current };
    applyDamage(dummy, 100);
    for (let i = 0; i < 10; i++) step(s, { move: { x: 0, y: -1 } });
    return { settled, afterPressing, dummyAtZero: dummy.health.current, stillThere: s.actors.includes(dummy), y: player.position.y };
  `);
  // First collision at impact 3: the dummy loses 5000 x 0.001 x 3 / 6 = 2.5. The bounce sends the avatar back at
  // 1.5 (bounce 0.5); pressing again hits at impact 1.5: 1.25. The next return is below 1: nothing triggers.
  // The avatar loses the minimum damage 1 each time (the attack is below its defense 3).
  assert.deepStrictEqual(plain(result.settled), { dummy: 26.25, avatar: 98 });
  assert.deepStrictEqual(plain(result.afterPressing), plain(result.settled)); // pressing for 3 s more changed nothing
  assert.strictEqual(result.dummyAtZero, 0);
  assert.strictEqual(result.stillThere, true);
  assert.ok(result.y >= -130 + 32 - 1e-9, "the avatar went into the dummy: y=" + result.y); // still collides at 0 health
});

test("67 touching again after separating is a new collision and hurts again; the contacts are plain state", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    const dummy = s.actors.find((actor) => actor.id === "dummy_1");
    for (let i = 0; i < 60; i++) step(s, { move: { x: 0, y: -1 } });
    const first = dummy.health.current;
    const whileTouching = JSON.stringify(s.contacts);
    for (let i = 0; i < 20; i++) step(s, { move: { x: 0, y: 1 } }); // walks away: no contact
    const apart = JSON.stringify(s.contacts);
    for (let i = 0; i < 60; i++) step(s, { move: { x: 0, y: -1 } }); // comes back: a new collision
    return { first, second: dummy.health.current, whileTouching, apart, json: JSON.stringify(s) };
  `);
  assert.strictEqual(result.whileTouching, JSON.stringify(["player_1" + "|dummy_1"]));
  assert.strictEqual(result.apart, "[]");
  assert.ok(result.second < result.first, "the second collision did not hurt: " + result.first + " -> " + result.second);
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json);
});

test("68 only something with doesDamage hits: a type without it never hurts what touches it", () => {
  const patched = loadGame((text) => text.replace(
    "const DEFINITIONS = {\n  actors: {",
    'const DEFINITIONS = {\n  actors: {\n    soft: { name: "Soft", weightPerRadius: 300, radius: 16, bounce: 0, healthRange: { min: 10, max: 20 }, initial: { position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } } },'
  ));
  const result = run(`
    const soft = { type: "soft", position: { x: 0, y: 0 } };
    const stone = { type: "stone", position: { x: 0, y: 0 } };
    const full = createRun(1).build;
    return { soft: finalAttack(soft, { impact: 12 }, full), stone: finalAttack(stone, { impact: 12 }, full) };
  `, patched);
  assert.strictEqual(result.soft, 0); // same weight as the stone, but no doesDamage
  assert.ok(Math.abs(result.stone - 9.6) < 1e-9);
});

test("69 a hit always costs at least 1 (the defense never makes the target immune), but no attack means no damage", () => {
  const result = withBuilds(`
    const rubber = { type: "rubber", position: { x: 0, y: 0 } };
    return {
      weak: damageOf(rubber, { impact: 3 }, avatar, full), // attack 1.8, defense 3
      strong: damageOf(rubber, { impact: 12 }, avatar, full), // attack 7.2, defense 3
      noImpact: damageOf(rubber, { impact: 0 }, avatar, full),
    };
  `);
  assert.strictEqual(result.weak, 1);
  assert.ok(Math.abs(result.strong - 4.2) < 1e-9);
  assert.strictEqual(result.noImpact, 0);
});

test("70 below the minimum impact (1) nothing triggers: no damage, no bounce; the avatar just stops against the thing", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 145; p.position.y = -435; // inside the boulder at 172,-435 (bounce 0.5), pushed out by the collision
    p.move.velocity.x = 0.5; // impact 0.5, below 1
    step(s, { move: { x: 1, y: 0 } }); // accelerates to 0.75 into it
    return { avatar: p.health.current, damagedRocks: s.damagedRocks, vx: p.move.velocity.x, contacts: s.contacts };
  `);
  assert.strictEqual(result.avatar, 100);
  assert.deepStrictEqual(plain(result.damagedRocks), {});
  assert.strictEqual(result.vx, 0); // not sent back (a bounce of 0.5 x 0.75 would give -0.375)
});

test("71 every weight in the definitions is a whole number: the parts, and the weightPerRadius and radius of the still actors", () => {
  const weights = run(`
    return [
      ...Object.entries(DEFINITIONS.actors).filter(([, d]) => d.weightPerRadius !== undefined).flatMap(([id, d]) => [[id + " weightPerRadius", d.weightPerRadius], [id + " radius", d.radius]]),
      ...Object.entries(DEFINITIONS.parts).map(([id, p]) => [id, p.weight]),
    ];
  `);
  assert.ok(weights.length >= 17);
  for (const [id, weight] of weights) assert.ok(Number.isInteger(weight) && weight >= 0, id + ": " + weight);
});

test("72 a weight that is not a whole number (or is negative) stops the game when it loads; 0 is allowed", () => {
  const brokenMultiplier = (text) => text.replace("weightPerRadius: 300,\n      healthRange", "weightPerRadius: 300.5,\n      healthRange");
  const brokenRadius = (text) => text.replace("radius: 16,\n      weightPerRadius", "radius: 16.5,\n      weightPerRadius");
  const brokenPart = (text) => text.replace('head: { name: "Head", weight: 200,', 'head: { name: "Head", weight: -1,');
  assert.throws(() => loadGame(brokenMultiplier), /actor type stone.*300.5/);
  assert.throws(() => loadGame(brokenRadius), /radius of the actor type stone.*16.5/);
  assert.throws(() => loadGame(brokenPart), /part head.*-1/);
  const box = loadGame((text) => text.replace("weightPerRadius: 300,\n      healthRange", "weightPerRadius: 0,\n      healthRange"));
  assert.strictEqual(run("return weightOfType(DEFINITIONS.actors.stone);", box), 0);
});

test("73 a still actor with weight 0 and health 1 is harmless and breaks at the first hit, and the avatar goes through it", () => {
  const box = loadGame((text) => text
    .replace("weightPerRadius: 300,\n      healthRange: { min: 10, max: 20 }", "weightPerRadius: 0,\n      healthRange: { min: 1, max: 1 }"));
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 125; p.position.y = 444; // touching the stone at 159,444, which is now the box
    step(s, { move: { x: 1, y: 0 }, dash: true });
    return { avatar: p.health.current, box: s.damagedRocks["0,1"], vx: p.move.velocity.x };
  `, box);
  assert.strictEqual(result.avatar, 100); // attack 0: no damage, not even the minimum
  assert.strictEqual(result.box, 0); // the avatar hit it for 10 (minimum damage 1 would be enough)
  assert.strictEqual(result.vx, 12); // broken: no stop, no bounce
});

test("74 the list of still objects has the rock: radius from 16 to 32, weight modifier 100, so 1600 to 3200 kg", () => {
  const rock = plain(run("return DEFINITIONS.objects.rock;"));
  assert.deepStrictEqual(rock.size, { minRadius: 16, maxRadius: 32, weightPerRadius: 100 });
  assert.strictEqual(rock.size.weightPerRadius * rock.size.minRadius, 1600);
  assert.strictEqual(rock.size.weightPerRadius * rock.size.maxRadius, 3200);
});

test("75 a size that is not whole, or has a minimum above the maximum, stops the game when it loads", () => {
  const patch = (from, to) => (text) => text.replace(from, to);
  const size = "size: { minRadius: 16, maxRadius: 32, weightPerRadius: 100 }";
  assert.throws(() => loadGame(patch(size, "size: { minRadius: 16.5, maxRadius: 32, weightPerRadius: 100 }")), /object rock/);
  assert.throws(() => loadGame(patch(size, "size: { minRadius: 40, maxRadius: 32, weightPerRadius: 100 }")), /object rock/);
  assert.throws(() => loadGame(patch(size, "size: { minRadius: 16, maxRadius: 32, weightPerRadius: 99.5 }")), /object rock/);
  loadGame(patch(size, "size: { minRadius: 16, maxRadius: 16, weightPerRadius: 0 }")); // a fixed size and weight 0 are allowed
});
