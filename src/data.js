// Definitions: the values that never change during a run (the "db").
// The state only points here by id (actor.type), so it stays small.
// Read-only: it is frozen below, so nothing can change it by accident.

// Raise this number whenever any definition changes. Every state carries the
// version it was made with, so a state from another version can be refused.
const DEFINITIONS_VERSION = 1;

const DEFINITIONS = {
  actors: {
    player: {
      name: "Player",
      maxHealth: 100,
      attack: 10, // loose numbers: ATTACK and DEFENSE are not defined yet
      defense: 3,
      radius: 16,
      baseSpeed: 3, // pixels per frame (3 x 60 = 180 pixels per second)
      // An actor type without baseSpeed is static (it has no "move"), like a trap.
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
