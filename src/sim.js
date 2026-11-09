// Simulation: the rules of the game.
// It knows nothing about the screen, keyboard, mouse or browser, only numbers.
// That way it runs the same in the browser and in Node.

const PLAYER_ID = "player_1";

// Initial state of Chamber 1: only the player, standing at the center of the world.
// The state is a single plain JSON object (no functions, Map, NaN, etc.).
function createChamber1State() {
  return {
    frame: 0,
    actors: [
      {
        id: PLAYER_ID,
        name: "Player",
        health: { current: 100, max: 100 },
        attack: 10,
        defense: 3,
        position: { x: 0, y: 0 },
        radius: 16,
        move: {
          speed: 3, // pixels per frame (3 x 60 = 180 pixels per second)
          direction: { x: 0, y: 0 }, // vector with length 0 to 1
        },
        aim: { x: 1, y: 0 }, // vector with length 1
      },
    ],
  };
}

// Advances the state by one frame. Changes the state in place.
// input = { move: { x, y }, aim: { x, y } }
function step(state, input) {
  const player = state.actors.find((actor) => actor.id === PLAYER_ID);

  // 1. Player input (values are copied, so the state never points into the input).
  player.move.direction.x = input.move.x;
  player.move.direction.y = input.move.y;
  player.aim.x = input.aim.x;
  player.aim.y = input.aim.y;

  // 2. Movement: every actor that has "move" walks, in list order.
  // Speed is read every frame, because it can change from one frame to the next.
  for (const actor of state.actors) {
    if (!actor.move) continue;
    actor.position.x += actor.move.direction.x * actor.move.speed;
    actor.position.y += actor.move.direction.y * actor.move.speed;
  }

  state.frame += 1;
}
