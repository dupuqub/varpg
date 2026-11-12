// Rendering: turns the state into an image. It only reads the state, never changes it.
// The camera is always on the player, who stays at the center of the canvas.

const REFERENCE_GRID_CELL = 64;
const REFERENCE_GRID_COLOR = "#1d232b";
const AVATAR_COLOR = "#ffffff";
const ACTOR_COLORS = { dummy: "#3d8bff", biter: "#e0453a" }; // by actor type (not the avatar): a new actor type needs its color here
const HITBOX_COLOR = "#ffd23f"; // the hitboxes are yellow circles
const OBJECT_COLORS = { rock: "#5a5f66", shroom: "#b5ad7a" }; // by object type: a new object type needs its color here

function draw(context, state, blueprint, fps) {
  const { width, height } = context.canvas;
  const player = state.actors.find((actor) => actor.id === AVATAR_ID);

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  // Without something fixed on the ground you cannot tell that the player is
  // moving, because it is the world that moves on screen. This grid is only
  // a reference for that. It has nothing to do with the collision grid.
  drawReferenceGrid(context, player.position.x, player.position.y);

  drawObjects(context, state, player);
  drawActors(context, state, player);

  // The body is always the same circle; the ring of the shield is the radius the avatar collides with (player.radius), so
  // what is drawn is what is hit. It is drawn only while the shield has something left, a little fainter as it drains.
  context.fillStyle = AVATAR_COLOR;
  context.beginPath();
  context.arc(width / 2, height / 2, player.bodyRadius, 0, Math.PI * 2);
  context.fill();
  if (player.shield.now > 0) {
    context.strokeStyle = `rgba(61, 169, 255, ${0.35 + 0.65 * (player.shield.now / player.shield.max)})`;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(width / 2, height / 2, player.radius, 0, Math.PI * 2);
    context.stroke();
  }

  drawHitboxes(context, state, player);

  drawDashStatus(context, player);
  drawHealth(context, player);
  drawWeapons(context, player);
  drawFps(context, fps);
}

// The frames per second, as plain text in the top-right corner.
function drawFps(context, fps) {
  context.font = "24px monospace";
  context.textAlign = "right";
  context.textBaseline = "top";
  context.fillStyle = AVATAR_COLOR;
  context.fillText(`FPS ${fps}`, context.canvas.width - 24, 24);
  context.textAlign = "left"; // the other texts are drawn from the left
}

// The health as plain text in the bottom-left corner, above the dash: "HEALTH 97/100".
// One decimal, because a hit can be a fraction.
function drawHealth(context, player) {
  context.font = "24px monospace";
  context.textBaseline = "bottom";
  context.fillStyle = AVATAR_COLOR;
  context.fillText(`HEALTH ${player.health.now.toFixed(1)}/${player.health.max}`, 24, context.canvas.height - 56);
  if (player.shield.max > 0) context.fillText(`SHIELD ${player.shield.now.toFixed(1)}/${player.shield.max}`, 24, context.canvas.height - 88);
}

// The weapons as plain text in the bottom-left corner, above the health: the name, the rounds in the magazine and in the
// reserve, and the reload while it lasts; and the weight the mecha carries now (it gets lighter as it fires).
function drawWeapons(context, player) {
  context.font = "24px monospace";
  context.textBaseline = "bottom";
  context.fillStyle = AVATAR_COLOR;
  let y = context.canvas.height - 120; // above the shield, which is above the health
  context.fillText(`WEIGHT ${player.weight} KG`, 24, y);
  for (const weapon of player.weapons) {
    y -= 32;
    const recipe = DEFINITIONS.parts[weapon.part].weapon;
    const reload = weapon.reload > 0 ? `  RELOAD ${recipe.reloadFrames - weapon.reload}/${recipe.reloadFrames}` : "";
    context.fillText(`${DEFINITIONS.parts[weapon.part].name.toUpperCase()} ${weapon.magazine}/${weapon.reserve}${reload}`, 24, y);
  }
}

// The objects that fall on the screen (rocks, Shrooms), as circles of the color of their type.
function drawObjects(context, state, player) {
  const { width, height } = context.canvas;
  const left = player.position.x - width / 2;
  const top = player.position.y - height / 2;
  const objects = objectsReaching(state.seed, left, top, left + width, top + height) // also an object that is only partly on the screen
    .filter((object) => !isObjectBroken(state, object)); // a broken object is gone

  for (const object of objects) {
    const screenX = object.position.x - left;
    const screenY = object.position.y - top;
    const radius = object.radius;

    context.fillStyle = OBJECT_COLORS[object.type];
    context.beginPath();
    context.arc(screenX, screenY, radius, 0, Math.PI * 2);
    context.fill();

    // Only an object that was hurt shows its health (current/maximum).
    if (state.damagedObjects[objectKey(object)] !== undefined) {
      drawHealthLabel(context, screenX, screenY - radius - 8, objectHealth(state, object), object.health.max);
    }
  }
}

// Every actor that is not the avatar (Dummies, Biters), as a circle of the color of its type. The camera is on the avatar,
// which is in the center. An actor that was hurt shows its health (current/maximum). A type without a color stops the game.
function drawActors(context, state, player) {
  const { width, height } = context.canvas;
  for (const actor of state.actors) {
    if (actor.id === AVATAR_ID) continue;
    const color = ACTOR_COLORS[actor.type];
    if (color === undefined) throw new Error("The actor type " + actor.type + " has no color in ACTOR_COLORS");
    const screenX = actor.position.x - player.position.x + width / 2;
    const screenY = actor.position.y - player.position.y + height / 2;
    if (screenX < -actor.radius || screenX > width + actor.radius || screenY < -actor.radius || screenY > height + actor.radius) continue;
    context.fillStyle = color;
    context.beginPath();
    context.arc(screenX, screenY, actor.radius, 0, Math.PI * 2);
    context.fill();
    if (actor.health.now < actor.health.max) {
      drawHealthLabel(context, screenX, screenY - actor.radius - 8, actor.health.now, actor.health.max);
    }
  }
}

// The hitboxes that exist, as yellow circles (only the outline: the bodies stay visible).
function drawHitboxes(context, state, player) {
  const { width, height } = context.canvas;
  context.strokeStyle = HITBOX_COLOR;
  context.lineWidth = 3;
  for (const hitbox of state.hitboxes) {
    context.beginPath();
    context.arc(hitbox.position.x - player.position.x + width / 2, hitbox.position.y - player.position.y + height / 2, hitbox.radius, 0, Math.PI * 2);
    context.stroke();
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
