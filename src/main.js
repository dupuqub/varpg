// Screen navigation and the Chamber 1 loop.

const screens = document.querySelectorAll(".screen");

function showScreen(id) {
  for (const screen of screens) {
    screen.hidden = screen.id !== id;
  }

  if (id === "screen-chamber-1") {
    startChamber1();
  } else {
    stopChamber1();
  }
}

// Every button with data-goto leads to the screen it names.
for (const button of document.querySelectorAll("[data-goto]")) {
  button.addEventListener("click", () => showScreen(button.dataset.goto));
}

// ---- Chamber 1 ----

const STEP_MS = 1000 / 60; // 60 steps per second
const STEP_TOLERANCE_MS = 0.5; // slack for the jitter of a 60 Hz monitor

const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");
trackMouse(canvas);

let state = null;
let animationId = null;
let lastTimestamp = null;
let accumulatedMs = 0;

function startChamber1() {
  stopChamber1();
  state = createChamber1State();
  lastTimestamp = null;
  accumulatedMs = 0;
  draw(context, state);
  animationId = requestAnimationFrame(loop);
}

function stopChamber1() {
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

  step(state, readInput());
  draw(context, state);
}
