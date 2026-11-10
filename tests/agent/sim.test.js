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
    const before = DEFINITIONS.actors.avatar.radius;
    DEFINITIONS.actors.avatar.radius = 99; // ignored: frozen
    DEFINITIONS.actors.other = { radius: 1 }; // ignored: frozen
    return {
      version: s.definitionsVersion,
      expectedVersion: DEFINITIONS_VERSION,
      frozen: Object.isFrozen(DEFINITIONS) && Object.isFrozen(DEFINITIONS.actors.avatar),
      unchanged: DEFINITIONS.actors.avatar.radius === before && !("other" in DEFINITIONS.actors),
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
  assert.strictEqual(result.type, "avatar");
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

  const walker = run('return createActor("walker_1", "avatar");', withTrap);
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
    const a = createActor("a", "avatar");
    const b = createActor("b", "avatar");
    a.position.x = 50;
    a.health.current = 1;
    a.move.direction.x = 1;
    a.move.velocity.x = 2;
    const initial = DEFINITIONS.actors.avatar.initial;
    return {
      sameAsInitial: JSON.stringify({ id: "b", type: "avatar", ...initial }) === JSON.stringify(b),
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
          const reach = rocks[i].radius + rocks[j].radius;
          if (dx * dx + dy * dy < reach * reach) overlaps++;
        }
      }
    }
    return overlaps;
  `);
  assert.strictEqual(overlaps, 0);
});

test("39 known answer: seed 1 gives 10 rocks on the first screen, the first a rock of radius 16 at 136,-375 with 17 health", () => {
  // If this fails after a change to the formula or the hash, every map changed.
  // If it fails on another machine or browser, the hash is not exact there.
  const result = run(`
    const rocks = rocksInArea(1, -960, -540, 960, 540);
    return { count: rocks.length, first: rocks[0], last: rocks[rocks.length - 1] };
  `);
  assert.strictEqual(result.count, 10);
  assert.deepStrictEqual(plain(result.first), { type: "rock", position: { x: 136, y: -375 }, square: { x: 0, y: -2 }, radius: 16, maxHealth: 17 });
  assert.deepStrictEqual(plain(result.last), { type: "rock", position: { x: 99, y: 456 }, square: { x: 0, y: 1 }, radius: 28, maxHealth: 10 });
});

test("40 the state keeps only the seed, not the rocks; every rock rolls a radius inside its size, and every kind is a valid still object", () => {
  const result = run(`
    const s = createChamber1State(1, 5);
    const rules = DEFINITIONS.terrain.rocks;
    const radii = new Set();
    let outOfRange = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const rock of rocksInArea(seed, -3000, -3000, 3000, 3000)) {
        radii.add(rock.radius);
        const size = DEFINITIONS.objects[rock.type].size;
        if (!Number.isInteger(rock.radius) || rock.radius < size.min || rock.radius > size.max) outOfRange++;
      }
    }
    return {
      seed: s.seed,
      defaultSeed: createChamber1State().seed,
      hasRocks: JSON.stringify(s).includes('"rock"') || "rocks" in s,
      outOfRange,
      radii: [...radii].sort((a, b) => a - b),
      margin: rockMargin(),
      kinds: rules.kinds.map((kind) => ({
        kind,
        exists: kind in DEFINITIONS.objects,
        isStatic: !("move" in DEFINITIONS.objects[kind].initial),
      })),
    };
  `);
  assert.strictEqual(result.seed, 5);
  assert.strictEqual(result.defaultSeed, 1);
  assert.strictEqual(result.hasRocks, false);
  assert.strictEqual(result.outOfRange, 0);
  assert.deepStrictEqual(plain(result.radii), [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]); // all of 16 to 32 show up
  assert.strictEqual(result.margin, 32); // the largest radius of the kinds the seed places
  for (const kind of result.kinds) assert.ok(kind.exists && kind.isStatic, kind.kind);
});

// ---- Collision with rocks ----
// These tests use the rock of seed 1 at 99,456 (radius 28, weight 2800 kg, health 10, square 0,1, no bounce), and a
// Shroom that each test places by hand (createActor("shroom_t", "shroom", radius)), 100 px below the start.
// The avatar has radius 16.
// Only the Shroom has a bounce: 0.2 at radius 16, 0.6 at 24 and 1 at 32 (0.2 + 0.8 x (radius - 16) / 16).

// The rock of seed 1 used by these tests (see test 39).
const ROCK = { x: 99, y: 456, radius: 28, key: "0,1", health: 10 };

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

// Puts a Shroom of the given radius at (0, 100) (Chamber 1's own Shroom is taken away), the avatar just above it
// (a gap of 1 px) going down at "speed" (or from rest with a dash), and runs one step.
function hitShroom(radius, { speed = 3, dash = false, gap = 1 } = {}) {
  return run(`
    const s = createChamber1State();
    s.actors = s.actors.filter((actor) => actor.id !== "shroom_1");
    const shroom = createActor("shroom_t", "shroom", ${radius});
    shroom.position.x = 0; shroom.position.y = 100;
    s.actors.push(shroom);
    const p = s.actors[0];
    p.position.x = 0; p.position.y = 100 - (16 + ${radius}) - ${gap};
    p.move.velocity.y = ${dash ? 0 : speed};
    step(s, { move: { x: 0, y: 1 }, dash: ${dash} });
    return { y: p.position.y, vy: p.move.velocity.y, avatar: p.health.current, shroom: shroom.health.current, shroomY: shroom.position.y };
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
  assert.strictEqual(hitShroom(16).y, 100 - 32); // 100 - (16 + 16)
  assert.strictEqual(hitShroom(32).y, 100 - 48); // 100 - (16 + 32)
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
        for (const rock of rocksInArea(seed, p.position.x - 100, p.position.y - 100, p.position.x + 100, p.position.y + 100)) {
          if (isRockBroken(s, rock)) continue; // a broken rock has no collision
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
    const h = createHistory(s, createRun(1).build);
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
    return { avatar: p.health.current, rock: s.damagedRocks["${ROCK.key}"] ?? ${ROCK.health}, vx: p.move.velocity.x };
  `);
}

test("47 walking into a rock at 3 px/frame is a weak hit: the rock loses 2.5, the avatar the minimum damage 1 (1.4 - 3 is below 1)", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 55; p.position.y = ${ROCK.y}; // touching the rock
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } });
    return { avatar: p.health.current, damagedRocks: s.damagedRocks, vx: p.move.velocity.x };
  `);
  assert.strictEqual(result.avatar, 99); // 2800 x 0.001 x 3 / 6 = 1.4, minus 3 is below the minimum damage, 1
  assert.deepStrictEqual(plain(result.damagedRocks), { "0,1": 7.5 }); // 10 - 5000 x 0.001 x 3 / 6
  assert.strictEqual(result.vx, 0); // it still stopped (the bounce is a separate rule)
});

test("48 a dash (impact 12) hurts both: each hits with weight x 0.001 x 12 / 6; the avatar loses that minus the defense 3, and at least 1", () => {
  const rock = slamInto(53, ROCK.y); // 2800 kg: attack 5.6, so 5.6 - 3 = 2.6 to the avatar; the avatar (5000 kg) hits for 10
  assert.ok(Math.abs(rock.avatar - 97.4) < 1e-9, "rock: " + rock.avatar);
  assert.strictEqual(rock.rock, 0); // 10 - 10: it breaks
  const small = hitShroom(16, { dash: true, gap: 2 }); // 1600 kg: attack 3.2, 3.2 - 3 = 0.2 is below 1, so 1
  assert.ok(Math.abs(small.avatar - 99) < 1e-9, "small shroom: " + small.avatar);
  assert.strictEqual(small.shroom, 10); // 20 - 10
  const large = hitShroom(32, { dash: true, gap: 2 }); // 3200 kg: attack 6.4, so 6.4 - 3 = 3.4
  assert.ok(Math.abs(large.avatar - 96.6) < 1e-9, "large shroom: " + large.avatar);
  assert.strictEqual(large.shroom, 10); // 20 - 10
});

test("49 a graze is a weak hit: only the part of the speed going into the rock counts, so it hurts less than a head-on walk", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 76; p.position.y = 418; // the glancing blow of test 43
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } });
    return { avatar: p.health.current, damagedRocks: s.damagedRocks };
  `);
  assert.strictEqual(result.avatar, 99); // the attack is below the defense, so the minimum damage 1
  const loss = 10 - result.damagedRocks["0,1"];
  assert.ok(loss > 0 && loss < 2.5, "a graze should hurt the rock less than the head-on walk of test 47 (2.5), it lost " + loss);
});

test("50 the attack: weight x 0.001 x impact / 6, 0 without impact; the damage never goes below 0", () => {
  const result = withBuilds(`
    const rock = { type: "rock", radius: 28, position: { x: 0, y: 0 } };
    const small = createActor("shroom_a", "shroom", 16); // 1600 kg
    const large = createActor("shroom_b", "shroom", 32); // 3200 kg
    const lighter = without("arm-r"); // 4350 kg
    return {
      defense: finalDefense(avatar, full),
      rockWeight: weightOf(rock, full),
      rock: finalAttack(rock, { impact: 12 }, full),
      atReference: finalAttack(rock, { impact: 6 }, full),
      walking: finalAttack(rock, { impact: 3 }, full),
      noImpact: finalAttack(rock, { impact: 0 }, full),
      avatar: finalAttack(avatar, { impact: 12 }, full),
      lighterAvatar: finalAttack(avatar, { impact: 12 }, lighter),
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
    return p.health.current;
  `);
  assert.strictEqual(health, 0);
});

test("52 the cross-check stays clean in a run where both sides are hurt, and the state is plain numbers", () => {
  const result = withBuilds(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 20; p.position.y = ${ROCK.y}; // next to the rock at ${ROCK.x},${ROCK.y}
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
    const avatar = createActor(AVATAR_ID, "avatar");
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
    const other = createActor("other_1", "avatar");
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

// ---- Rocks with health, and the weight of a still object ----

test("61 a rock that is hurt is stored by its square, and it keeps its health between frames", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 55; p.position.y = ${ROCK.y};
    p.move.velocity.x = 3;
    step(s, { move: { x: 1, y: 0 } }); // hits the rock: 10 - 2.5
    for (let i = 0; i < 10; i++) step(s, { move: { x: 0, y: 0 } });
    return { damagedRocks: s.damagedRocks, json: JSON.stringify(s) };
  `);
  assert.deepStrictEqual(plain(result.damagedRocks), { "0,1": 7.5 });
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json); // still plain JSON
});

test("62 a rock that reaches 0 breaks: nothing collides with it and the avatar goes through", () => {
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    s.damagedRocks["0,1"] = 5; // the rock at 99,456 has 5 left
    p.position.x = 53; p.position.y = ${ROCK.y};
    step(s, { move: { x: 1, y: 0 }, dash: true }); // 5 - 10: it breaks (health stops at 0)
    const afterHit = { broken: s.damagedRocks["0,1"], vx: p.move.velocity.x, x: p.position.x, health: p.health.current };
    for (let i = 0; i < 40; i++) step(s, { move: { x: 1, y: 0 } });
    return { afterHit, x: p.position.x, health: p.health.current };
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

test("64 the weight of a still object is weightPerRadius x radius, a whole number: twice the radius, twice the weight", () => {
  const result = run(`
    const make = (type, radius) => createActor("x", type, radius);
    const build = createRun(1).build;
    return {
      rock: weightOf(make("rock", 28), build),
      small: weightOf(make("shroom", 16), build),
      middle: weightOf(make("shroom", 24), build),
      large: weightOf(make("shroom", 32), build),
      range: weightRangeOf(DEFINITIONS.objects.shroom),
      rockRange: weightRangeOf(DEFINITIONS.objects.rock),
    };
  `);
  assert.deepStrictEqual(plain(result), { rock: 2800, small: 1600, middle: 2400, large: 3200, range: { min: 1600, max: 3200 }, rockRange: { min: 1600, max: 3200 } });
  assert.strictEqual(result.large / result.small, 2); // linear in the radius (twice as wide, twice as heavy), not the area
});


test("65 pressing into a rock hurts it once, at the arrival (no bounce, so no second collision); a broken rock lets the avatar through", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    player.position.x = 0; player.position.y = ${ROCK.y};
    for (let i = 0; i < 100; i++) step(s, { move: { x: 1, y: 0 } }); // walks right into the rock and keeps pressing
    const settled = { rock: s.damagedRocks["0,1"], avatar: player.health.current, x: player.position.x };
    for (let i = 0; i < 200; i++) step(s, { move: { x: 1, y: 0 } }); // keeps pressing
    return { settled, afterPressing: { rock: s.damagedRocks["0,1"], avatar: player.health.current, x: player.position.x } };
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
    const first = s.damagedRocks["0,1"];
    const whileTouching = JSON.stringify(s.contacts);
    for (let i = 0; i < 20; i++) step(s, { move: { x: -1, y: 0 } }); // walks away: no contact
    const apart = JSON.stringify(s.contacts);
    for (let i = 0; i < 60; i++) step(s, { move: { x: 1, y: 0 } }); // comes back: a new collision
    return { first, second: s.damagedRocks["0,1"], whileTouching, apart, json: JSON.stringify(s) };
  `);
  assert.strictEqual(result.whileTouching, JSON.stringify(["avatar_1|rock 0,1"]));
  assert.strictEqual(result.apart, "[]");
  assert.ok(result.second < result.first, "the second collision did not hurt: " + result.first + " -> " + result.second);
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json);
});

test("67 the attack comes from the weight alone: a thing with weightPerRadius 0 has attack 0 and damage 0 at any impact, the same thing with weight does hit", () => {
  const weightless = loadGame((text) => text.replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,', 'name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 0,'));
  const probe = `
    const rock = { type: "rock", radius: 28, position: { x: 0, y: 0 } };
    const avatar = createActor(AVATAR_ID, "avatar");
    const full = createRun(1).build;
    return { attack: finalAttack(rock, { impact: 12 }, full), damage: damageOf(rock, { impact: 12 }, avatar, full) };
  `;
  assert.deepStrictEqual(plain(run(probe, weightless)), { attack: 0, damage: 0 }); // no minimum damage either: there is no attack
  const normal = run(probe);
  assert.ok(Math.abs(normal.attack - 5.6) < 1e-9); // 2800 x 0.001 x 12 / 6
  assert.ok(Math.abs(normal.damage - 2.6) < 1e-9); // 5.6 - 3
});

test("68 a hit always costs at least 1 (the defense never makes the target immune), but no attack means no damage", () => {
  const result = withBuilds(`
    const small = createActor("shroom_a", "shroom", 16); // 1600 kg
    const large = createActor("shroom_b", "shroom", 32); // 3200 kg
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
  assert.strictEqual(result.shroom, 20);
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
  assert.strictEqual(run("return weightOf({ type: 'rock', radius: 28 }, createRun(1).build);", box), 0);
});

test("72 a rock with weight 0 and health 1 is harmless and breaks at the first hit, and the avatar goes through it", () => {
  const box = loadGame((text) => text
    .replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,\n      healthRange: { min: 10, max: 20 }', 'name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 0,\n      healthRange: { min: 1, max: 1 }'));
  const result = run(`
    const s = createChamber1State();
    const p = s.actors[0];
    p.position.x = 53; p.position.y = ${ROCK.y}; // touching the rock at 99,456, which is now a box
    step(s, { move: { x: 1, y: 0 }, dash: true });
    return { avatar: p.health.current, box: s.damagedRocks["0,1"], vx: p.move.velocity.x };
  `, box);
  assert.strictEqual(result.avatar, 100); // attack 0: no damage, not even the minimum
  assert.strictEqual(result.box, 0); // the avatar hit it for 10 (minimum damage 1 would be enough)
  assert.strictEqual(result.vx, 12); // broken: no stop, no bounce
});

test("73 the objects are the rock and the Shroom, each complete and with its own numbers: size min 16 and max 32, weight modifier 100", () => {
  const objects = plain(run("return DEFINITIONS.objects;"));
  assert.deepStrictEqual(Object.keys(objects), ["rock", "shroom"]);
  for (const id of ["rock", "shroom"]) {
    const object = objects[id];
    assert.deepStrictEqual(object.size, { min: 16, max: 32 }, id);
    assert.strictEqual(object.weightPerRadius, 100, id);
    assert.ok(object.initial && object.name, id + " is a complete entry");
    assert.strictEqual(object.weightPerRadius * object.size.min, 1600, id);
    assert.strictEqual(object.weightPerRadius * object.size.max, 3200, id);
  }
  assert.deepStrictEqual(objects.rock.healthRange, { min: 10, max: 20 });
  assert.deepStrictEqual(objects.shroom.bounce, { min: 0.2, max: 1 });
  assert.strictEqual("bounce" in objects.rock, false); // only the Shroom bounces
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

test("75 a still object gets its own radius: it must be given, and it is checked; the avatar keeps the radius of its definition", () => {
  const result = run(`
    const attempt = (...args) => { try { createActor(...args); return "ok"; } catch (error) { return error.message; } };
    return {
      rock: createActor("a", "rock", 28).radius,
      shroom: createActor("c", "shroom", 24).radius,
      noRadius: attempt("d", "shroom"),
      tooSmall: attempt("e", "shroom", 15),
      tooBig: attempt("f", "shroom", 33),
      notWhole: attempt("g", "shroom", 20.5),
      noSize: attempt("h", "avatar", 16),
      avatarRadius: radiusOf(createActor("avatar_1", "avatar")),
    };
  `);
  assert.strictEqual(result.rock, 28);
  assert.strictEqual(result.shroom, 24);
  assert.match(result.noRadius, /a radius must be given/);
  assert.match(result.tooSmall, /whole number from 16 to 32/);
  assert.match(result.tooBig, /whole number from 16 to 32/);
  assert.match(result.notWhole, /whole number from 16 to 32/);
  assert.match(result.noSize, /no size/);
  assert.strictEqual(result.avatarRadius, 16); // the avatar keeps the radius of its definition
});

test("76 the bounce of the Shroom grows in a straight line from 0.2 at radius 16 to 1 at radius 32; the rock has none", () => {
  const result = run(`
    const bounces = [];
    for (let radius = 16; radius <= 32; radius++) bounces.push(bounceOf(createActor("s", "shroom", radius)));
    return { bounces, rock: bounceOf(createActor("a", "rock", 28)) };
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

test("77 a bounce above 1 (it would eject, like a spring), or an object without a size, stops the game when it loads", () => {
  const shroomBounce = "bounce: { min: 0.2, max: 1 }";
  assert.throws(() => loadGame((text) => text.replace(shroomBounce, "bounce: { min: 0.2, max: 1.5 }")), /bounce of the object shroom/);
  assert.throws(() => loadGame((text) => text.replace(shroomBounce, "bounce: 2")), /bounce of the object shroom/);
  assert.throws(() => loadGame((text) => text.replace(shroomBounce, "bounce: { min: 0.8, max: 0.5 }")), /bounce of the object shroom/);
  assert.throws(() => loadGame((text) => text.replace('name: "Rock",\n      size: { min: 16, max: 32 },\n      weightPerRadius: 100,', 'name: "Rock",\n      weightPerRadius: 100,')), /needs a size/);
});

test("78 Chamber 1 has a Shroom of radius 24 at 130 px to the left; the first dash left hits it and comes back at 0.6 of the speed", () => {
  const result = run(`
    const s = createChamber1State();
    const player = s.actors[0];
    const shroom = s.actors.find((actor) => actor.id === "shroom_1");
    const start = { radius: shroom.radius, x: shroom.position.x, y: shroom.position.y, health: shroom.health.current };
    step(s, { move: { x: -1, y: 0 }, dash: true });
    let speedBefore = null, hitFrame = null;
    for (let i = 1; i < 30 && hitFrame === null; i++) {
      speedBefore = Math.abs(player.move.velocity.x);
      step(s, { move: { x: -1, y: 0 } });
      if (shroom.health.current < start.health) hitFrame = i;
    }
    return { start, hitFrame, speedBefore, vx: player.move.velocity.x, shroom: shroom.health.current, moved: shroom.position.x !== start.x, json: JSON.stringify(s) };
  `);
  assert.deepStrictEqual(plain(result.start), { radius: 24, x: -130, y: 0, health: 20 });
  assert.ok(result.hitFrame !== null, "the first dash did not reach the Shroom");
  assert.ok(result.vx > 0, "it bounced back");
  assert.ok(Math.abs(result.vx / result.speedBefore - 0.6) < 0.05, "it gives back 0.6 of the speed, with the decay of a frame: " + result.vx / result.speedBefore);
  assert.ok(result.shroom < 20);
  assert.strictEqual(result.moved, false);
  assert.strictEqual(JSON.stringify(JSON.parse(result.json)), result.json);
});

test("79 the rock and the Shroom share nothing: changing the size of one in the data leaves the other as it was", () => {
  const rockOnly = loadGame((text) => text.replace(
    'name: "Rock",\n      size: { min: 16, max: 32 },',
    'name: "Rock",\n      size: { min: 20, max: 40 },'));
  const sizes = plain(run("return { rock: DEFINITIONS.objects.rock.size, shroom: DEFINITIONS.objects.shroom.size };", rockOnly));
  assert.deepStrictEqual(sizes, { rock: { min: 20, max: 40 }, shroom: { min: 16, max: 32 } });
});
