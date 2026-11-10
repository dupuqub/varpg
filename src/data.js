// Definitions: what the game is. The "db". Nothing in here changes during a run.
// For each actor type it has:
// - the fixed values (radius, base speed, ...);
// - "initial": the state of a new actor of that type. createActor copies it.
// The state only points here by id (actor.type), so it stays small.
// Read-only: it is frozen below, so nothing can change it by accident.

// Why each number is what it is. Every value below says how it was chosen:
//   target  = computed from a feel we want, written in plain units (the formula is shown)
//   anchor  = tied to something in the real world
//   rule    = forced by another number or by a rule of the game
//   guess   = a placeholder, to be tuned by playing
// The relations between numbers are collected in AGENTS.md ("Numbers and why").

// Raise this number whenever any definition changes. Every state carries the
// version it was made with, so a state from another version can be refused.
const DEFINITIONS_VERSION = 5;

const DEFINITIONS = {
  actors: {
    player: {
      name: "Player",
      maxHealth: 100, // guess (health and damage are not defined yet)
      attack: 10, // guess: loose numbers, ATTACK and DEFENSE are not defined yet
      defense: 3, // guess
      radius: 16, // guess: the avatar is 32 px wide, 1/60 of the screen width. Every rock radius is measured against it.
      baseSpeed: 3, // target: top speed in pixels per frame. 3 x 60 = 180 px per second, so the 1920 px screen is crossed in about 10.7 s
      acceleration: 0.25, // target: top speed in 0.2 s = 3 / 0.25 = 12 frames. A power of two, so the sums are exact
      deceleration: 0.125, // target: stops in 0.4 s (twice the time of speeding up, so it slides) = 3 / 0.125 = 24 frames. Also exact
      dash: {
        speed: 12, // target: 4 x the top speed. With overspeedDecay it lasts (12 - 3) / 0.5 = 18 frames (0.3 s) and covers about 142 px, 4.4 avatar widths.
        //            rule: must stay below 28 (the avatar radius + the smallest rock radius), or it could cross a rock in one frame
        maxCharges: 1, // anchor: the user's old project (1 charge)
        rechargeFrames: 240, // anchor: the user's old project (4 s) = 240 frames at 60 steps per second
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

    // Rocks: static actors (no "move"). They are not stored in the state: the
    // seed and the formula in "terrain" below say where they are (see rocksInArea).
    // bounce: how much of the speed of whoever hits it comes back (0 = none, 1 = all).
    // The bounce is not used yet, because there is no collision yet.
    // radius (guess, measured against the avatar's 16): stone = the same size, boulder = 1.25 x, rubber = 0.75 x.
    //   rule: no radius above terrain.rocks.margin (20), or rocks of neighbor squares could overlap.
    // bounce: the three reference points of the range (none, half, all), so the feel of each can be compared.
    stone: {
      name: "Stone",
      radius: 16,
      bounce: 0,
      initial: { position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } },
    },
    boulder: {
      name: "Boulder",
      radius: 20,
      bounce: 0.5,
      initial: { position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } },
    },
    rubber: {
      name: "Rubber rock",
      radius: 12,
      bounce: 1,
      initial: { position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } },
    },
  },

  // Values that are the same for every actor, and that parts and buffs do not change.
  constants: {
    // Pixels per frame lost, every frame, while an actor is faster than its top
    // speed (for example right after a dash). Parts can make a dash stronger, but
    // not decay slower, so a stronger dash is also a longer dash.
    // target: a dash of 12 lasts 0.3 s: (12 - 3) / 0.5 = 18 frames. A power of two, so the speed lands exactly on the top speed.
    overspeedDecay: 0.5,
  },

  // How the ground is filled (provisional values, to be tuned).
  terrain: {
    rocks: {
      cellSize: 256, // guess: the world is cut into squares of this size (4 cells of the collision grid), with at most one rock in each
      chancePercent: 35, // target: about 11 rocks on a 1920 x 1080 screen = (1920 x 1080 / 256 / 256) squares x 0.35 (enough to dodge, too few to wall you in). Seed 1 gives 12
      margin: 20, // rule: the largest rock radius, so rocks of neighbor squares never overlap
      safeRadius: 200, // guess: bigger than the first dash (142 px), so the very first dash cannot hit a rock. No rock closer than this to the start (0, 0)
      kinds: ["stone", "boulder", "rubber"], // which actor types a rock can be (the formula picks one)
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
