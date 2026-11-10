// Rendering: turns the state into an image. It only reads the state, never changes it.
// The camera is always on the player, who stays at the center of the canvas.

const REFERENCE_GRID_CELL = 64;
const REFERENCE_GRID_COLOR = "#1d232b";
const PLAYER_COLOR = "#ffffff";
const ROCK_COLOR = "#5a5f66";
const ROCK_LABEL_COLOR = "#9aa0a8";

function draw(context, state) {
  const { width, height } = context.canvas;
  const player = state.actors.find((actor) => actor.id === PLAYER_ID);

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  // Without something fixed on the ground you cannot tell that the player is
  // moving, because it is the world that moves on screen. This grid is only
  // a reference for that. It has nothing to do with the collision grid.
  drawReferenceGrid(context, player.position.x, player.position.y);

  drawRocks(context, state, player);

  const radius = definitionOf(player).radius;

  context.fillStyle = PLAYER_COLOR;
  context.beginPath();
  context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  context.fill();

  drawDashStatus(context, player);
}

// The rocks that fall on the screen, as gray circles. Above each one, its position in the world (x,y),
// so the user can check with the agent that it is in the right place.
function drawRocks(context, state, player) {
  const { width, height } = context.canvas;
  const left = player.position.x - width / 2;
  const top = player.position.y - height / 2;
  const padding = 64; // so a rock that is only partly on the screen is also drawn
  const rocks = rocksInArea(state.seed, left - padding, top - padding, left + width + padding, top + height + padding);

  context.font = "14px monospace";
  context.textAlign = "center";
  context.textBaseline = "bottom";
  for (const rock of rocks) {
    const screenX = rock.position.x - left;
    const screenY = rock.position.y - top;
    const radius = DEFINITIONS.actors[rock.type].radius;

    context.fillStyle = ROCK_COLOR;
    context.beginPath();
    context.arc(screenX, screenY, radius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = ROCK_LABEL_COLOR;
    context.fillText(`${rock.position.x},${rock.position.y}`, screenX, screenY - radius - 4);
  }
  context.textAlign = "start"; // the dash text, drawn later, expects the default
}

// The numbers of the dash, as plain text in the bottom-left corner:
// "DASH 1/1  READY", or "DASH 0/1  57/240" while a charge is coming back
// (frames since it started, out of the frames it needs).
function drawDashStatus(context, player) {
  const rules = definitionOf(player).dash;
  const { charges, recharge } = player.dash;
  const status = charges < rules.maxCharges ? `${recharge}/${rules.rechargeFrames}` : "";
  const ready = charges > 0 ? "READY" : "";

  context.font = "24px monospace";
  context.textBaseline = "bottom";
  context.fillStyle = charges > 0 ? PLAYER_COLOR : "#888888";
  context.fillText(`DASH ${charges}/${rules.maxCharges}  ${ready}${status}`, 24, context.canvas.height - 24);
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
