// Input: reads keyboard and gamepad and returns the numbers for the current frame.
// It knows nothing about the simulation.
// There is no mouse and no right stick: the weapons aim by themselves, so the
// player only moves.

const STICK_DEADZONE = 0.15;

const pressedKeys = new Set();

window.addEventListener("keydown", (event) => pressedKeys.add(event.code));
window.addEventListener("keyup", (event) => pressedKeys.delete(event.code));
window.addEventListener("blur", () => pressedKeys.clear());

// Returns the vector with length 1, or null if the vector is zero.
function normalized(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length === 0) return null;
  return { x: vector.x / length, y: vector.y / length };
}

function keyboardMove() {
  const x = (pressedKeys.has("KeyD") ? 1 : 0) - (pressedKeys.has("KeyA") ? 1 : 0);
  const y = (pressedKeys.has("KeyS") ? 1 : 0) - (pressedKeys.has("KeyW") ? 1 : 0);
  // On a diagonal, normalize so the player does not walk faster.
  return normalized({ x, y }) || { x: 0, y: 0 };
}

// First connected gamepad, or null.
// The browser only exposes the gamepad after some button is pressed.
function firstGamepad() {
  if (!navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

// Reads one analog stick. Returns null if it is inside the dead zone.
function readStick(pad, xAxis, yAxis) {
  const vector = { x: pad.axes[xAxis] || 0, y: pad.axes[yAxis] || 0 };
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length < STICK_DEADZONE) return null;
  if (length > 1) return { x: vector.x / length, y: vector.y / length };
  return vector;
}

// Input for this frame: { move: { x, y } }
function readInput() {
  const pad = firstGamepad();

  // Move: the left stick wins if it is outside the dead zone; otherwise the keyboard.
  const leftStick = pad ? readStick(pad, 0, 1) : null;
  const move = leftStick || keyboardMove();

  return { move: { x: move.x, y: move.y } };
}
