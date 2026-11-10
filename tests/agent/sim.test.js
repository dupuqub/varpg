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
      s.actors.push({ id: "dummy", position: { x: dx, y: -70 }, radius: 16, cell: { x: 0, y: 0 } });
      step(s, { move: { x: 0, y: 0 } });
      return [s.actors[1].cell.x, s.actors[1].cell.y];
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
    s.actors.push({ id: "dummy", position: { x: 100, y: 0 }, radius: 16, cell: { x: 0, y: 0 } });
    step(s, { move: { x: 0, y: 0 } });
    const before = s.actors[1].cell.x;
    const original = finalSpeed;
    finalSpeed = () => 64;
    s.actors[0].move.velocity.x = 64; // already moving at 64 px per frame
    step(s, { move: { x: 1, y: 0 } });
    finalSpeed = original;
    return [before, s.actors[1].cell.x];
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
    const before = DEFINITIONS.actors.player.baseSpeed;
    DEFINITIONS.actors.player.baseSpeed = 99; // ignored: frozen
    DEFINITIONS.actors.other = { baseSpeed: 1 }; // ignored: frozen
    return {
      version: s.definitionsVersion,
      expectedVersion: DEFINITIONS_VERSION,
      frozen: Object.isFrozen(DEFINITIONS) && Object.isFrozen(DEFINITIONS.actors.player),
      unchanged: DEFINITIONS.actors.player.baseSpeed === before && !("other" in DEFINITIONS.actors),
      type: player.type,
      hasRadius: "radius" in player,
      hasBaseSpeed: "baseSpeed" in player,
      health: player.health,
      radius: definitionOf(player).radius,
      speed: finalSpeed(player),
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
    return JSON.stringify(s.actors[1].position);
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
      definitionsUntouched: initial.position.x === 0 && initial.health.current === 100
        && initial.move.direction.x === 0 && initial.move.velocity.x === 0,
      otherUntouched: b.position.x === 0 && b.health.current === 100
        && b.move.direction.x === 0 && b.move.velocity.x === 0,
      idFirst: Object.keys(a).slice(0, 2).join(","),
    };
  `);
  assert.strictEqual(result.sameAsInitial, true);
  assert.strictEqual(result.definitionsUntouched, true);
  assert.strictEqual(result.otherUntouched, true);
  assert.strictEqual(result.idFirst, "id,type");
});

test("19 the run and the state: the state carries the run id, and the build is empty and outside the state", () => {
  const result = run(`
    const r = createRun(7);
    const s = createChamber1State(r.id);
    return { run: r, stateRun: s.run, defaultRun: createChamber1State().run, hasBuild: "build" in s };
  `);
  assert.deepStrictEqual(plain(result.run), { id: 7, build: {} });
  assert.strictEqual(result.stateRun, 7);
  assert.strictEqual(result.defaultRun, 1);
  assert.strictEqual(result.hasBuild, false);
});

// ---- Run history ----

test("20 history: two aligned lists, index 0 is the oldest, and the snaps are copies", () => {
  const result = run(`
    const s = createChamber1State();
    const h = createHistory(s);
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
    const h = createHistory(s);
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
    const h = createHistory(s);
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
    const h = createHistory(s);
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
    const h = createHistory(s);
    let counter = 0;
    const original = finalSpeed;
    finalSpeed = (actor) => (counter++ >= 60 ? 0.1 : original(actor));
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
    const h = createHistory(s);
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
    const h = createHistory(s);
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

test("39 known answer: seed 1 gives 12 rocks on the first screen, the first one a boulder at 172,-435", () => {
  // If this fails after a change to the formula or the hash, every map changed.
  // If it fails on another machine or browser, the hash is not exact there.
  const result = run(`
    const rocks = rocksInArea(1, -960, -540, 960, 540);
    return { count: rocks.length, first: rocks[0], last: rocks[rocks.length - 1] };
  `);
  assert.strictEqual(result.count, 12);
  assert.deepStrictEqual(plain(result.first), { type: "boulder", position: { x: 172, y: -435 } });
  assert.deepStrictEqual(plain(result.last), { type: "boulder", position: { x: 854, y: 418 } });
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
  const right = { x: 1, y: 0 };
  const intoStone = hitOnce(125, 444, 0, 0, right, { dash: true }); // dash: 12 px, ends 10 px inside
  const intoRubber = hitOnce(690, -63, 0, 0, right, { dash: true });
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
    const h = createHistory(s);
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

// ---- Damage from rocks ----
// The rule (src/sim.js): damage = max(0, finalAttack - finalDefense), where the attack of a
// collision is impact x impactAttack (2) and the defense of the avatar is 3.
// Health of the avatar at the start: 100.

function healthAfterHit(x, y, vx, vy, direction, input = {}) {
  return run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = ${x}; p.position.y = ${y};
    p.move.velocity.x = ${vx}; p.move.velocity.y = ${vy};
    step(s, { move: { x: ${direction.x}, y: ${direction.y} }, dash: ${input.dash === true} });
    return p.health.current;
  `);
}

test("47 walking head-on into a rock at 3 px/frame costs 3 health: 3 x 2 - 3 = 3 (the bounce does not change the damage)", () => {
  const right = { x: 1, y: 0 };
  assert.strictEqual(healthAfterHit(127, 444, 3, 0, right), 97); // stone
  assert.strictEqual(healthAfterHit(145, -435, 3, 0, right), 97); // boulder
  assert.strictEqual(healthAfterHit(681, -63, 3, 0, right), 97); // rubber rock
});

test("48 a dash head-on into a rock costs 21 health: 12 x 2 - 3 = 21", () => {
  const right = { x: 1, y: 0 };
  assert.strictEqual(healthAfterHit(125, 444, 0, 0, right, { dash: true }), 79); // stone
  assert.strictEqual(healthAfterHit(690, -63, 0, 0, right, { dash: true }), 79); // rubber rock
});

test("49 pressing against a still rock does no damage, and a graze does almost none", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 127; p.position.y = 444; // touching the stone at 159,444
    for (let i = 0; i < 120; i++) step(s, { move: { x: 1, y: 0 } });
    return p.health.current;
  `);
  assert.strictEqual(result, 100); // impact 0.25 x 2 = 0.5, below the defense 3
  const graze = healthAfterHit(140, 420, 3, 0, { x: 1, y: 0 }); // the glancing blow of test 43
  assert.ok(graze > 99 && graze < 100, "graze: " + graze); // impact about 1.66: 3.33 - 3 = 0.33
});

test("50 the damage function: attack minus defense, never below 0 (it never heals)", () => {
  const result = run(`
    const p = createActor("p", "player");
    const rock = { type: "stone", position: { x: 0, y: 0 } };
    return {
      defense: finalDefense(p),
      attack: finalAttack(rock, { impact: 5 }),
      damage: damageOf(rock, { impact: 5 }, p),
      weak: damageOf(rock, { impact: 1 }, p),
    };
  `);
  assert.deepStrictEqual(plain(result), { defense: 3, attack: 10, damage: 7, weak: 0 });
});

test("51 health stops at 0 (there is no death yet)", () => {
  const health = run(`
    const p = createActor("p", "player");
    applyDamage(p, 60);
    applyDamage(p, 60);
    return p.health.current;
  `);
  assert.strictEqual(health, 0);
});

test("52 the cross-check stays clean in a run where the avatar is hurt, and the health is plain numbers", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 100; p.position.y = 444; // next to the stone at 159,444
    const h = createHistory(s);
    for (let i = 0; i < 300; i++) {
      const input = { move: { x: i % 60 < 40 ? 1 : -0.5, y: i % 90 < 30 ? 0.3 : -0.2 }, dash: i % 80 === 10 };
      step(s, input);
      recordFrame(h, s, input);
    }
    return { check: crossCheck(h), health: p.health.current };
  `);
  assert.ok(result.health < 100, "the run never hurt the avatar");
  assert.ok(Number.isFinite(result.health));
  assert.strictEqual(result.check, null);
});
