// Input: reads keyboard, gamepad and touch and returns the numbers for the current frame.
// It knows nothing about the simulation.
// There is no mouse and no right stick: the weapons aim by themselves, so the
// player only moves, and dashes (Space, the gamepad A button, or a touch on the dash side of the screen).

const STICK_DEADZONE = 0.15;

const pressedKeys = new Set();

// A dash is an event ("pressed now"), not a state ("held"), so it is remembered
// until the next frame reads it.
let dashPressed = false;
let padDashWasDown = false;

// The screens that are played (the same ones as CHAMBERS in main.js, which is loaded after this file).
const GAME_SCREENS = ["screen-chamber-1", "screen-chamber-2"];

function inGameView() {
  return GAME_SCREENS.some((id) => !document.getElementById(id).hidden);
}

// ---- Touch (the user, 2026-11-12) ----
// Move: a floating analog stick on the half of the screen away from the dash. The place where the finger first touches
// is the center of the stick, and the distance of the finger from it sets the speed, as a gamepad stick does: a dead zone
// in the middle, the full speed from TOUCH_STICK_RADIUS on, the direction is the angle from the center to the finger.
// Dash: a touch anywhere on the dash half of the screen. A round button is drawn there (see style.css) but it is only a
// picture: the whole half works, so the player does not have to aim at it. The dash goes in the direction of the movement
// (the same rule as the keyboard and the gamepad); a swipe has no direction of its own (the user decided).
// The side of the dash is a named setting so that a left-handed option, and others for accessibility, can change it later.
const TOUCH_DASH_SIDE = "right";
const TOUCH_STICK_RADIUS = 90; // in screen (CSS) pixels, about a thumb: guess, to be tuned by playing; not scaled by the canvas
const TOUCH_STICK_DEADZONE = 0.08; // of that radius; guess

let stickTouch = null; // { id, startX, startY, x, y } of the finger that moves, or null

function touchSide(clientX) {
  return clientX < window.innerWidth / 2 ? "left" : "right";
}

// The movement the stick finger asks for, or null with no finger or inside the dead zone.
function touchMove() {
  if (stickTouch === null) return null;
  const dx = stickTouch.x - stickTouch.startX;
  const dy = stickTouch.y - stickTouch.startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  const share = length / TOUCH_STICK_RADIUS;
  if (share < TOUCH_STICK_DEADZONE) return null;
  const strength = Math.min(1, share);
  return { x: (dx / length) * strength, y: (dy / length) * strength };
}

// A touch that starts on the bar at the top (the pause, back and forward buttons) belongs to the page, not to the game.
function touchIsForTheGame(touch) {
  return inGameView() && !(touch.target instanceof Element && touch.target.closest(".overlay"));
}

function touchElement(className) {
  let element = document.querySelector("." + className);
  if (element === null) {
    element = document.createElement("div");
    element.className = className;
    document.body.appendChild(element);
  }
  return element;
}

// Draws the dash button (on a touch screen only) and the stick while a finger holds it. Pictures only: nothing here is read by the game.
function updateTouchUi() {
  const touchScreen = window.matchMedia("(pointer: coarse)").matches && inGameView();
  const dash = touchElement("touch-dash");
  dash.hidden = !touchScreen;
  dash.dataset.side = TOUCH_DASH_SIDE;
  const ring = touchElement("touch-ring");
  const dot = touchElement("touch-dot");
  ring.hidden = dot.hidden = stickTouch === null;
  if (stickTouch !== null) {
    ring.style.left = stickTouch.startX + "px";
    ring.style.top = stickTouch.startY + "px";
    const dx = stickTouch.x - stickTouch.startX;
    const dy = stickTouch.y - stickTouch.startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const shown = Math.min(length, TOUCH_STICK_RADIUS); // the dot stays on the ring when the finger goes beyond it
    dot.style.left = stickTouch.startX + (length === 0 ? 0 : (dx / length) * shown) + "px";
    dot.style.top = stickTouch.startY + (length === 0 ? 0 : (dy / length) * shown) + "px";
  }
}

function findTouch(event, id) {
  for (const touch of event.changedTouches) if (touch.identifier === id) return touch;
  return null;
}

document.addEventListener("touchstart", (event) => {
  for (const touch of event.changedTouches) {
    if (!touchIsForTheGame(touch)) continue;
    event.preventDefault(); // no scrolling, zooming or long-press menu while playing
    if (touchSide(touch.clientX) === TOUCH_DASH_SIDE) {
      dashPressed = true;
      const button = touchElement("touch-dash");
      button.classList.add("pressed");
      setTimeout(() => button.classList.remove("pressed"), 120);
    } else if (stickTouch === null) {
      stickTouch = { id: touch.identifier, startX: touch.clientX, startY: touch.clientY, x: touch.clientX, y: touch.clientY };
    }
  }
  updateTouchUi();
}, { passive: false });

document.addEventListener("touchmove", (event) => {
  if (stickTouch === null) return;
  const touch = findTouch(event, stickTouch.id);
  if (touch === null) return;
  event.preventDefault();
  stickTouch.x = touch.clientX;
  stickTouch.y = touch.clientY;
  updateTouchUi();
}, { passive: false });

function endTouch(event) {
  if (stickTouch !== null && findTouch(event, stickTouch.id) !== null) stickTouch = null;
  updateTouchUi();
}
document.addEventListener("touchend", endTouch);
document.addEventListener("touchcancel", endTouch);

window.addEventListener("keydown", (event) => {
  pressedKeys.add(event.code);
  if (event.code === "Space" && inGameView()) {
    event.preventDefault(); // otherwise Space would scroll the page or press a focused button
    if (!event.repeat) dashPressed = true;
  }
});
window.addEventListener("keyup", (event) => pressedKeys.delete(event.code));
window.addEventListener("blur", () => {
  pressedKeys.clear();
  dashPressed = false;
  stickTouch = null;
});

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

// Input for this frame: { move: { x, y }, dash: true or false }
function readInput() {
  const pad = firstGamepad();

  // Move: the left stick wins if it is outside the dead zone; then the finger on the screen; otherwise the keyboard.
  const leftStick = pad ? readStick(pad, 0, 1) : null;
  const move = leftStick || touchMove() || keyboardMove();

  // Dash: Space or a touch (remembered since the last frame) or the A button, only on the frame it goes down.
  updateTouchUi();
  const padDashIsDown = Boolean(pad && pad.buttons[0] && pad.buttons[0].pressed);
  const dash = dashPressed || (padDashIsDown && !padDashWasDown);
  padDashWasDown = padDashIsDown;
  dashPressed = false;

  return { move: { x: move.x, y: move.y }, dash };
}
