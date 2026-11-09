// Rendering: turns the state into an image. It only reads the state, never changes it.
// The camera is always on the player, who stays at the center of the canvas.

const REFERENCE_GRID_CELL = 64;
const REFERENCE_GRID_COLOR = "#1d232b";
const PLAYER_COLOR = "#ffffff";
const WINDOW_LINE_COLOR = "rgba(201, 162, 74, 0.5)";
const WINDOW_CENTER_COLOR = "rgba(201, 162, 74, 0.15)";

function draw(context, state) {
  const { width, height } = context.canvas;
  const player = state.actors.find((actor) => actor.id === PLAYER_ID);

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  // Without something fixed on the ground you cannot tell that the player is
  // moving, because it is the world that moves on screen. This grid is only
  // a reference for that. It has nothing to do with the collision grid.
  drawReferenceGrid(context, player.position.x, player.position.y);

  drawCollisionWindow(context, state.grid);

  const radius = definitionOf(player).radius;

  context.fillStyle = PLAYER_COLOR;
  context.beginPath();
  context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  context.fill();

  drawAimArrow(context, radius, player.aim);
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

// The collision window: the cells around the player where collision is tested.
// The player is at the center of the center cell, so the window stays fixed on
// screen while the world moves under it.
function drawCollisionWindow(context, grid) {
  const centerX = context.canvas.width / 2;
  const centerY = context.canvas.height / 2;
  const half = grid.cellSize / 2;
  const reachX = (grid.windowWidth - 1) / 2;
  const reachY = (grid.windowHeight - 1) / 2;

  const left = Math.round(centerX - half - reachX * grid.cellSize);
  const top = Math.round(centerY - half - reachY * grid.cellSize);
  const width = grid.windowWidth * grid.cellSize;
  const height = grid.windowHeight * grid.cellSize;

  // Tint the center cell (the one the player is in).
  context.fillStyle = WINDOW_CENTER_COLOR;
  context.fillRect(centerX - half, centerY - half, grid.cellSize, grid.cellSize);

  context.strokeStyle = WINDOW_LINE_COLOR;
  context.lineWidth = 1;
  context.beginPath();
  for (let i = 0; i <= grid.windowWidth; i++) {
    const offset = Math.round(i * grid.cellSize) + 0.5;
    context.moveTo(left + offset, top);
    context.lineTo(left + offset, top + height);
  }
  for (let i = 0; i <= grid.windowHeight; i++) {
    const offset = Math.round(i * grid.cellSize) + 0.5;
    context.moveTo(left, top + offset);
    context.lineTo(left + width, top + offset);
  }
  context.stroke();
}

// Small triangle outside the circle, pointing where the player is looking.
function drawAimArrow(context, radius, aim) {
  const centerX = context.canvas.width / 2;
  const centerY = context.canvas.height / 2;

  const baseDistance = radius + 4;
  const tipDistance = radius + 16;
  const halfWidth = 6;

  // Vector perpendicular to the aim, to open the base of the triangle.
  const sideX = -aim.y;
  const sideY = aim.x;

  context.fillStyle = PLAYER_COLOR;
  context.beginPath();
  context.moveTo(centerX + aim.x * tipDistance, centerY + aim.y * tipDistance);
  context.lineTo(
    centerX + aim.x * baseDistance + sideX * halfWidth,
    centerY + aim.y * baseDistance + sideY * halfWidth
  );
  context.lineTo(
    centerX + aim.x * baseDistance - sideX * halfWidth,
    centerY + aim.y * baseDistance - sideY * halfWidth
  );
  context.closePath();
  context.fill();
}
