// Rendering: turns the state into an image. It only reads the state, never changes it.
// The camera is always on the player, who stays at the center of the canvas.

const REFERENCE_GRID_CELL = 64;
const REFERENCE_GRID_COLOR = "#1d232b";
const AVATAR_COLOR = "#ffffff";
const OBJECT_COLORS = { rock: "#5a5f66", shroom: "#a8445c" }; // by object type: a new object type needs its color here

function draw(context, state, blueprint) {
  const { width, height } = context.canvas;
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  // Without something fixed on the ground you cannot tell that the player is
  // moving, because it is the world that moves on screen. This grid is only
  // a reference for that. It has nothing to do with the collision grid.
  drawReferenceGrid(context, player.position.x, player.position.y);

  drawObjects(context, state, player);

  const radius = radiusOf(player);

  context.fillStyle = AVATAR_COLOR;
  context.beginPath();
  context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  context.fill();

  drawDashStatus(context, player);
  drawHealth(context, player, blueprint);
}

// The health as plain text in the bottom-left corner, above the dash: "HEALTH 97/100".
// One decimal, because a hit can be a fraction.
function drawHealth(context, player, blueprint) {
  const maxHealth = finalMaxHealth(player, blueprint);
  context.font = "24px monospace";
  context.textBaseline = "bottom";
  context.fillStyle = AVATAR_COLOR;
  context.fillText(`HEALTH ${player.health.current.toFixed(1)}/${maxHealth}`, 24, context.canvas.height - 56);
}

// The objects that fall on the screen (rocks, Shrooms), as circles of the color of their type.
function drawObjects(context, state, player) {
  const { width, height } = context.canvas;
  const left = player.position.x - width / 2;
  const top = player.position.y - height / 2;
  const padding = 64; // so an object that is only partly on the screen is also drawn
  const objects = objectsInArea(state.seed, left - padding, top - padding, left + width + padding, top + height + padding)
    .filter((object) => !isObjectBroken(state, object)); // a broken object is gone

  for (const object of objects) {
    const screenX = object.position.x - left;
    const screenY = object.position.y - top;
    const radius = radiusOf(object);

    context.fillStyle = OBJECT_COLORS[object.type];
    context.beginPath();
    context.arc(screenX, screenY, radius, 0, Math.PI * 2);
    context.fill();

    // Only an object that was hurt shows its health (current/maximum).
    if (state.damagedObjects[objectKey(object)] !== undefined) {
      drawHealthLabel(context, screenX, screenY - radius - 8, objectHealth(state, object), object.maxHealth);
    }
  }
}

// "current/maximum" as plain text, centered above a point. One decimal, because a hit can be a fraction.
function drawHealthLabel(context, x, y, current, maximum) {
  context.font = "16px monospace";
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillStyle = AVATAR_COLOR;
  context.fillText(`${current.toFixed(1)}/${maximum}`, x, y);
  context.textAlign = "left"; // the other texts are drawn from the left
}

// The numbers of the dash, as plain text in the bottom-left corner:
// "DASH 1/1  READY", or "DASH 0/1  57/240" while a charge is coming back
// (frames since it started, out of the frames it needs).
function drawDashStatus(context, player) {
  const { charges, recharge } = player.dash;
  const status = charges.now < charges.max ? `${recharge}/${player.dash.rechargeFrames}` : "";
  const ready = charges.now > 0 ? "READY" : "";

  context.font = "24px monospace";
  context.textBaseline = "bottom";
  context.fillStyle = charges.now > 0 ? AVATAR_COLOR : "#888888";
  context.fillText(`DASH ${charges.now}/${charges.max}  ${ready}${status}`, 24, context.canvas.height - 24);
}

// Lines every REFERENCE_GRID_CELL world pixels, shifted by the camera position.
function drawReferenceGrid(context, cameraX, cameraY) {
  const { width, height } = context.canvas;
  const left = cameraX - width / 2; // world x at the left edge of the screen
  const top = cameraY - height / 2; // world y at the top edge of the screen

  context.strokeStyle = REFERENCE_GRID_COLOR;
  context.lineWidth = 1;
  context.beginPath();

  const firstX = Math.floor(left / REFERENCE_GRID_CELL) * REFERENCE_GRID_CELL;
  for (let worldX = firstX; worldX <= left + width; worldX += REFERENCE_GRID_CELL) {
    const screenX = Math.round(worldX - left) + 0.5; // +0.5 keeps the line crisp
    context.moveTo(screenX, 0);
    context.lineTo(screenX, height);
  }

  const firstY = Math.floor(top / REFERENCE_GRID_CELL) * REFERENCE_GRID_CELL;
  for (let worldY = firstY; worldY <= top + height; worldY += REFERENCE_GRID_CELL) {
    const screenY = Math.round(worldY - top) + 0.5;
    context.moveTo(0, screenY);
    context.lineTo(width, screenY);
  }

  context.stroke();
}
