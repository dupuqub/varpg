// Definitions: what the game is. The "db". Nothing in here changes during a run.
// For each actor type it has:
// - the fixed values (radius, base speed, ...);
// - "initial": the state of a new actor of that type. createActor copies it.
// The state only points here by id (actor.type), so it stays small.
// Read-only: it is frozen below, so nothing can change it by accident.

// Raise this number whenever any definition changes. Every state carries the
// version it was made with, so a state from another version can be refused.
const DEFINITIONS_VERSION = 4;

const DEFINITIONS = {
  actors: {
    player: {
      name: "Player",
      maxHealth: 100,
      attack: 10, // loose numbers: ATTACK and DEFENSE are not defined yet
      defense: 3,
      radius: 16,
      baseSpeed: 3, // top speed, in pixels per frame (3 x 60 = 180 pixels per second)
      acceleration: 0.25, // speed gained per frame while there is input (provisional, to be tuned)
      deceleration: 0.125, // speed lost per frame while there is no input (provisional, to be tuned)
      dash: {
        speed: 12, // speed right after a dash, in pixels per frame (provisional, to be tuned)
        maxCharges: 1,
        rechargeFrames: 240, // frames to get one charge back (4 s)
      },

      initial: {
        health: { current: 100 },
        position: { x: 0, y: 0 },
        cell: { x: 0, y: 0 }, // grid cell relative to the player, set every frame
        move: {
          direction: { x: 0, y: 0 }, // what the actor wants: vector with length 0 to 1
          velocity: { x: 0, y: 0 }, // how it is really moving, in pixels per frame
        },
        dash: { charges: 1, recharge: 0 }, // recharge = frames since the last charge started coming back
        // A type without "move" here is static, like a trap.
      },
    },
  },

  // Values that are the same for every actor, and that parts and buffs do not change.
  constants: {
    // Pixels per frame lost, every frame, while an actor is faster than its top
    // speed (for example right after a dash). Parts can make a dash stronger, but
    // not decay slower, so a stronger dash is also a longer dash.
    overspeedDecay: 0.5,
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
