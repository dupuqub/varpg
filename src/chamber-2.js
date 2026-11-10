// Chamber 2: not a place in the game, only a test bench.
// Each button runs something in the real browser and writes plain text into
// the output box, so the text can be copied and pasted anywhere.
// The text builders (environmentText, simulationCheckText, dataText) do not
// touch the page. Only the last part of this file does.

// ---- A scripted run, with no trigonometry, so every browser gets the same numbers ----

const TEST_DIAGONAL = Math.SQRT1_2;
const TEST_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: TEST_DIAGONAL, y: TEST_DIAGONAL },
  { x: 0, y: 1 },
  { x: -TEST_DIAGONAL, y: TEST_DIAGONAL },
  { x: -1, y: 0 },
  { x: -TEST_DIAGONAL, y: -TEST_DIAGONAL },
  { x: 0, y: -1 },
  { x: TEST_DIAGONAL, y: -TEST_DIAGONAL },
];

// Walks in one direction for 30 frames, then the next, and so on.
function scriptedInputs(count) {
  const inputs = [];
  for (let i = 0; i < count; i++) {
    inputs.push({ move: TEST_DIRECTIONS[Math.floor(i / 30) % 8] });
  }
  return inputs;
}

// Plays the inputs from a new Chamber 1 state and records the history.
function playScripted(inputs) {
  const run = createRun(1);
  const state = createChamber1State(run.id, 1, run.build);
  const history = createHistory(state, run.build);
  for (const input of inputs) {
    step(state, input, run.build);
    recordFrame(history, state, input);
  }
  return { state, history };
}

// ---- Text builders ----

function describeDifference(difference) {
  if (difference === null) return "none";
  return `frame ${difference.frame}, ${difference.path}: expected ${difference.expected}, got ${difference.actual}`;
}

function simulationCheckText() {
  const frames = 600;
  const inputs = scriptedInputs(frames);

  const first = playScripted(inputs);
  const second = playScripted(inputs);
  const firstText = JSON.stringify(first.state);

  const history = first.history;
  const oldest = history.snaps[0].frame;
  const newest = history.snaps[history.snaps.length - 1].frame;

  // The state must be plain JSON: writing it and reading it back changes nothing.
  const isPlainJson = JSON.stringify(JSON.parse(firstText)) === firstText;

  // A cross-check that cannot fail proves nothing, so also change one snap on
  // purpose and see whether the cross-check notices.
  const tampered = { snaps: history.snaps.map((snap) => JSON.parse(JSON.stringify(snap))), inputs: history.inputs, build: history.build };
  tampered.snaps[50].actors[0].position.x += 0.1;

  const player = first.state.actors[0];
  return [
    "SIMULATION CHECK",
    `frames played: ${frames}`,
    `state is plain JSON: ${isPlainJson ? "yes" : "NO"}`,
    `two plays of the same inputs end identical: ${firstText === JSON.stringify(second.state) ? "yes" : "NO"}`,
    `history: ${history.snaps.length} snaps, ${history.inputs.length} inputs, frames ${oldest} to ${newest}`,
    `cross-check: ${describeDifference(crossCheck(history))} (expected: none)`,
    `cross-check on a snap changed on purpose: ${describeDifference(crossCheck(tampered))} (expected: a difference at frame ${tampered.snaps[50].frame}, actors[0].position.x)`,
    `final player position: x=${player.position.x}, y=${player.position.y}`,
    "final state:",
    JSON.stringify(first.state, null, 2),
  ].join("\n");
}

// The objects on the first screen (960 px each way from the starting point), to
// compare with the numbers drawn above the objects in Chamber 1.
function objectsText(seed) {
  const objects = objectsInArea(seed, -960, -540, 960, 540);
  return [
    `objects on the first screen (seed ${seed}, x from -960 to 960, y from -540 to 540): ${objects.length}`,
    ...objects.map((object) => `  ${object.type} at ${object.position.x},${object.position.y}, radius ${object.radius}, health ${object.maxHealth}`),
  ].join("\n");
}

// The build of a run and the arithmetic of each final value of the avatar, as plain sums.
function buildText(build) {
  const avatar = createActor(AVATAR_ID, "avatar");
  const weight = totalWeight(build);
  const penalty = DEFINITIONS.constants.weightSpeedPenalty;
  return [
    "build (the parts of the avatar):",
    ...partsOf(build).map((part, index) => `  ${build.parts[index]}: ${part.weight} kg, specs ${JSON.stringify(part.specs)}`),
    `total weight: ${weight} kg, capacity: ${sumSpec(build, "capacity")} kg`,
    `top speed: ${sumSpec(build, "speed")} - ${weight} x ${penalty} = ${finalSpeed(avatar, build)}`,
    `maximum health: ${sumSpec(build, "health")} = ${finalMaxHealth(avatar, build)}`,
    `defense: ${sumSpec(build, "defense")} = ${finalDefense(avatar, build)}`,
    `dash speed: ${sumSpec(build, "dashSpeed")} = ${finalDashSpeed(avatar, build)}`,
  ].join("\n");
}

function dataText() {
  return [
    "DATA",
    `definitions version: ${DEFINITIONS_VERSION}`,
    "definitions:",
    JSON.stringify(DEFINITIONS, null, 2),
    buildText(createRun(1).build),
    "initial state of Chamber 1:",
    JSON.stringify(createChamber1State(1, 1, createRun(1).build), null, 2),
    objectsText(createChamber1State().seed),
  ].join("\n");
}

// refreshLine = a line about how fast the browser calls us (it is measured
// over time, so the caller gives it).
function environmentText(refreshLine) {
  const pads = navigator.getGamepads
    ? Array.from(navigator.getGamepads()).filter((pad) => pad && pad.connected)
    : [];
  return [
    "ENVIRONMENT",
    `user agent: ${navigator.userAgent}`,
    `screen: ${screen.width} x ${screen.height}, device pixel ratio ${window.devicePixelRatio}`,
    `window: ${window.innerWidth} x ${window.innerHeight}`,
    `secure context: ${window.isSecureContext}`,
    `gamepads (the browser only shows one after a button press): ${pads.length}` +
      pads.map((pad) => `\n  ${pad.id}`).join(""),
    refreshLine,
  ].join("\n");
}

// Counts how many times per second the browser calls us for a new frame.
// Calls done(callbacksPerSecond, measuredMs) after about durationMs.
function measureFrameRate(durationMs, done) {
  let ticks = 0;
  let firstTimestamp = null;
  function tick(timestamp) {
    if (firstTimestamp === null) firstTimestamp = timestamp;
    ticks += 1;
    const elapsed = timestamp - firstTimestamp;
    if (elapsed >= durationMs) {
      done(((ticks - 1) * 1000) / elapsed, elapsed);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---- The page ----

const outputBox = document.getElementById("output");

function showOutput(text) {
  outputBox.value = text;
  outputBox.scrollTop = 0;
}

document.getElementById("tool-environment").addEventListener("click", () => {
  showOutput("ENVIRONMENT\nmeasuring the frame rate for 1 second...");
  measureFrameRate(1000, (perSecond, measuredMs) => {
    showOutput(
      environmentText(`frame callbacks per second: ${perSecond.toFixed(1)} (measured over ${measuredMs.toFixed(0)} ms)`)
    );
  });
});

document.getElementById("tool-simulation").addEventListener("click", () => {
  showOutput(simulationCheckText());
});

document.getElementById("tool-data").addEventListener("click", () => {
  showOutput(dataText());
});

const copyButton = document.getElementById("tool-copy");
copyButton.addEventListener("click", async () => {
  let label = "COPIED";
  try {
    await navigator.clipboard.writeText(outputBox.value);
  } catch (error) {
    // No clipboard access (for example, not a secure context): select the text instead.
    outputBox.focus();
    outputBox.select();
    label = "PRESS CTRL+C";
  }
  copyButton.textContent = label;
  setTimeout(() => (copyButton.textContent = "COPY"), 1500);
});
