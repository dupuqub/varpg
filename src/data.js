// Definitions: what the game is. The "db". Nothing in here changes during a run.
// For each actor type it has:
// - the fixed values (radius, base speed, ...);
// - "initial": the state of a new actor of that type. createActor copies it.
// The state only points here by id (actor.type), so it stays small.
// Read-only: it is frozen below, so nothing can change it by accident.

// Raise this number whenever any definition changes. Every state carries the
// version it was made with, so a state from another version can be refused.
const DEFINITIONS_VERSION = 2;

const DEFINITIONS = {
  actors: {
    player: {
      name: "Player",
      maxHealth: 100,
      attack: 10, // loose numbers: ATTACK and DEFENSE are not defined yet
      defense: 3,
      radius: 16,
      baseSpeed: 3, // pixels per frame (3 x 60 = 180 pixels per second)

      initial: {
        health: { current: 100 },
        position: { x: 0, y: 0 },
        cell: { x: 0, y: 0 }, // grid cell relative to the player, set every frame
        move: { direction: { x: 0, y: 0 } }, // vector with length 0 to 1
        // A type without "move" here is static, like a trap.
      },
    },
  },
};

// Freezes an object and everything inside it.
function deepFreeze(value) {
  for (const inner of Object.values(value)) {
    if (typeof inner === "object" && inner !== null) deepFreeze(inner);
  }
  return Object.freeze(value);
}

deepFreeze(DEFINITIONS);
