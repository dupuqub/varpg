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

// screen id -> the canvas it draws on, the blueprint of the mecha, and the function that makes its first state.
const CHAMBERS = {
  "screen-chamber-1": { canvasId: "canvas", blueprint: DEFINITIONS.starterBlueprint, create: createChamber1State },
  "screen-chamber-2": { canvasId: "canvas-2", blueprint: DEFINITIONS.combatBlueprint, create: createChamber2State },
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
// Pause and the history (the user, 2026-11-12). While paused the buttons walk through the saved snaps: viewIndex is the snap
// that is shown (the last one while the game is live). Pressing play on a past frame discards everything after it (discardAfter)
// and the run goes on from there with new inputs (the agent's default, to be confirmed by the user).
let paused = false;
let viewIndex = 0;

function startChamber(id) {
  stopChamber();
  canvas = document.getElementById(CHAMBERS[id].canvasId);
  context = canvas.getContext("2d");
  run = createRun(1, CHAMBERS[id].blueprint);
  state = CHAMBERS[id].create(run.id, 1, run.blueprint);
  // The rules know the size of the screen (state.grid); the canvas must be that size, or what the rules call "off the
  // screen" would be visible. Fail loudly instead of playing a wrong game.
  if (canvas.width !== state.grid.screenWidth || canvas.height !== state.grid.screenHeight) {
    throw new Error("The canvas is " + canvas.width + " x " + canvas.height + " and the rules expect " + state.grid.screenWidth + " x " + state.grid.screenHeight);
  }
  runHistory = createHistory(state, run.blueprint);
  paused = false;
  viewIndex = 0;
  lastTimestamp = null;
  accumulatedMs = 0;
  fps = 0;
  fpsFrames = 0;
  fpsSince = null;
  draw(context, state, run.blueprint, fps);
  updateControls();
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

  if (paused) {
    accumulatedMs = 0; // no time is owed for the pause: playing again does not run a burst of steps
    return;
  }

  if (accumulatedMs < STEP_MS - STEP_TOLERANCE_MS) return;

  // Keep the leftover time, but never more than one step of delay.
  accumulatedMs = Math.min(accumulatedMs - STEP_MS, STEP_MS);

  stepLive();
  // The fps counter: frames drawn, counted over one second.
  if (fpsSince === null) fpsSince = timestamp;
  fpsFrames += 1;
  if (timestamp - fpsSince >= 1000) {
    fps = Math.round((fpsFrames * 1000) / (timestamp - fpsSince));
    fpsFrames = 0;
    fpsSince = timestamp;
  }

  draw(context, state, run.blueprint, fps);
  updateControls();
}

// One step of the live game with the input of now, saved in the history. The shown snap is then the last one.
function stepLive() {
  const input = readInput();
  step(state, input, run.blueprint);
  recordFrame(runHistory, state, input);
  viewIndex = runHistory.snaps.length - 1;
}

// ---- The buttons: pause/play, one frame back, one frame forward ----

function pauseGame() {
  paused = true;
}

function playGame() {
  if (viewIndex < runHistory.snaps.length - 1) discardAfter(runHistory, viewIndex); // playing from a past frame
  paused = false;
  accumulatedMs = 0;
  lastTimestamp = null;
}

// Back goes to the snap before the one shown, and pauses. The oldest snap has nothing before it.
function stepBack() {
  if (viewIndex === 0) return;
  pauseGame();
  viewIndex -= 1;
  state = stateFromSnap(runHistory, viewIndex);
  draw(context, state, run.blueprint, fps);
  updateControls();
}

// Forward goes to the next snap, and pauses. On the newest one there is none yet, so it plays one new step with the input of now.
function stepForward() {
  pauseGame();
  if (viewIndex < runHistory.snaps.length - 1) {
    viewIndex += 1;
    state = stateFromSnap(runHistory, viewIndex);
  } else {
    stepLive();
  }
  draw(context, state, run.blueprint, fps);
  updateControls();
}

function currentScreen() {
  return Object.keys(CHAMBERS).map((id) => document.getElementById(id)).find((screen) => !screen.hidden);
}

// The symbol of the toggle says what pressing it does (|| while playing, a triangle while paused), the status line says the frame
// and, when a past frame is shown, how far behind it is.
function updateControls() {
  const screen = currentScreen();
  if (!screen) return;
  const part = (name) => screen.querySelector(`[data-control="${name}"]`);
  part("toggle").textContent = paused ? "\u25B6" : "||";
  part("back").disabled = viewIndex === 0;
  const behind = runHistory.snaps.length - 1 - viewIndex;
  part("status").textContent = (paused ? "PAUSED " : "") + "FRAME " + state.frame + (behind > 0 ? " (" + behind + " BEHIND)" : "");
}

// A button that keeps the focus would be pressed again by the Space key, which is the dash: so each click gives the focus back.
for (const button of document.querySelectorAll('[data-control="back"]')) {
  button.addEventListener("click", () => { stepBack(); button.blur(); });
}
for (const button of document.querySelectorAll('[data-control="forward"]')) {
  button.addEventListener("click", () => { stepForward(); button.blur(); });
}
for (const button of document.querySelectorAll('[data-control="toggle"]')) {
  button.addEventListener("click", () => {
    if (paused) playGame();
    else pauseGame();
    updateControls();
    button.blur();
  });
}
