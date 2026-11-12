// Screen navigation and the loop of the chambers that are played (1 and 2).

const screens = document.querySelectorAll(".screen");

function showScreen(id) {
  for (const screen of screens) {
    screen.hidden = screen.id !== id;
  }

  stopChamber();
  if (CHAMBERS[id]) startChamber(id);
}

// Every button with data-goto leads to the screen it names.
for (const button of document.querySelectorAll("[data-goto]")) {
  button.addEventListener("click", () => showScreen(button.dataset.goto));
}

// Esc leaves the game view (it has no room for a big BACK button).
document.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && Object.keys(CHAMBERS).some((id) => !document.getElementById(id).hidden)) {
    showScreen("screen-chambers");
  }
});

// ---- The chambers that are played ----

// screen id -> the canvas it draws on and the function that makes its first state.
const CHAMBERS = {
  "screen-chamber-1": { canvasId: "canvas", create: createChamber1State },
  "screen-chamber-2": { canvasId: "canvas-2", create: createChamber2State },
};

const STEP_MS = 1000 / 60; // 60 steps per second
const STEP_TOLERANCE_MS = 0.5; // slack for the jitter of a 60 Hz monitor

let canvas = null;
let context = null;

let run = null;
let state = null;
let runHistory = null; // the last 100 snaps and inputs. In the console: crossCheck(runHistory)
let animationId = null;
let lastTimestamp = null;
let accumulatedMs = 0;
let fps = 0; // frames drawn in the last full second, shown on the screen
let fpsFrames = 0;
let fpsSince = null;

function startChamber(id) {
  stopChamber();
  canvas = document.getElementById(CHAMBERS[id].canvasId);
  context = canvas.getContext("2d");
  run = createRun(1);
  state = CHAMBERS[id].create(run.id, 1, run.blueprint);
  // The rules know the size of the screen (state.grid); the canvas must be that size, or what the rules call "off the
  // screen" would be visible. Fail loudly instead of playing a wrong game.
  if (canvas.width !== state.grid.screenWidth || canvas.height !== state.grid.screenHeight) {
    throw new Error("The canvas is " + canvas.width + " x " + canvas.height + " and the rules expect " + state.grid.screenWidth + " x " + state.grid.screenHeight);
  }
  runHistory = createHistory(state, run.blueprint);
  lastTimestamp = null;
  accumulatedMs = 0;
  fps = 0;
  fpsFrames = 0;
  fpsSince = null;
  draw(context, state, run.blueprint, fps);
  animationId = requestAnimationFrame(loop);
}

function stopChamber() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

// One step per displayed frame, never more than one per browser callback.
// - Monitor above 60 Hz: the extra callbacks are ignored (no step and no drawing).
// - Machine that cannot reach 60 fps: the game runs in slow motion, no step is skipped.
function loop(timestamp) {
  animationId = requestAnimationFrame(loop);

  if (lastTimestamp === null) lastTimestamp = timestamp;
  accumulatedMs += timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  if (accumulatedMs < STEP_MS - STEP_TOLERANCE_MS) return;

  // Keep the leftover time, but never more than one step of delay.
  accumulatedMs = Math.min(accumulatedMs - STEP_MS, STEP_MS);

  const input = readInput();
  step(state, input, run.blueprint);
  recordFrame(runHistory, state, input);
  // The fps counter: frames drawn, counted over one second.
  if (fpsSince === null) fpsSince = timestamp;
  fpsFrames += 1;
  if (timestamp - fpsSince >= 1000) {
    fps = Math.round((fpsFrames * 1000) / (timestamp - fpsSince));
    fpsFrames = 0;
    fpsSince = timestamp;
  }

  draw(context, state, run.blueprint, fps);
}
