// Definitions: what the game is. The "db". Nothing in here changes during a run.
// For each actor type it has:
// - the fixed values (radius, acceleration, ...);
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
const DEFINITIONS_VERSION = 7;

const DEFINITIONS = {
  actors: {
    player: {
      name: "Player",
      // The maximum health, the defense, the top speed and the dash strength of the
      // avatar are not here: they are the sum of what its parts give (see "parts" below).
      attack: 10, // guess: a loose number, not used yet (the attack of a body slam will come from the weight)
      radius: 16, // guess: the avatar is 32 px wide, 1/60 of the screen width. Every rock radius is measured against it.
      acceleration: 0.25, // target: top speed in 0.2 s = 3 / 0.25 = 12 frames. A power of two, so the sums are exact
      deceleration: 0.125, // target: stops in 0.4 s (twice the time of speeding up, so it slides) = 3 / 0.125 = 24 frames. Also exact
      dash: {
        // The dash strength comes from the parts (the Booster: dashSpeed 12, see "parts" below).
        maxCharges: 1, // anchor: the user's old project (1 charge)
        rechargeFrames: 240, // anchor: the user's old project (4 s) = 240 frames at 60 steps per second
      },

      initial: {
        health: { current: 100 }, // rule: the maximum health of the starter build (15 + 55 + 30); a test checks it
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

    // The attack of a collision = impact (px/frame going into the rock) x this number.
    // guess: with 2 and a defense of 3, walking head-on (3) hurts 6 - 3 = 3, a dash
    // head-on (12) hurts 24 - 3 = 21 (a fifth of the health), and a graze or pressing
    // against a rock (impact below 1.5) hurts 0.
    impactAttack: 2,

    // Pixels per frame taken off the top speed for each kg the avatar carries.
    // target: a 5000 kg mecha loses 5000 x 0.0002 = 1 px/frame; anchor: the user's example, a part that
    // takes 0.1 px/frame is a 500 kg arm (500 x 0.0002 = 0.1). Direct and easy to see in the audit.
    weightSpeedPenalty: 0.0002,
  },

  // The mecha parts. A part has a weight (kg) and specs, and the avatar's final values are the SUM
  // of the specs of the parts in its build (src/sim.js: sumSpec). Specs used so far:
  //   speed     px/frame added to the top speed        health    added to the maximum health
  //   defense   taken off every hit                    dashSpeed px/frame of the dash (the Booster)
  //   capacity  kg the build can carry (the Torso)
  // Radar, Magnet, the shield (Generator) and the weapons are not here: nothing uses them yet.
  // weight: anchor, the proportions of the user's old project (0.2 / 0.3 / 0.1 / 0.4 / 0.6 / 0.1 / 0.1,
  //   total 2.3) scaled to a total of 5000 kg (two large cars), rounded to tens.
  // health: target, the old proportions (Head 20, Torso 80, Legs 40 = 1 : 4 : 2) scaled to a total of 100,
  //   the health the avatar already had, so the damage numbers of the rocks do not change.
  // defense: guess, the old project had none; a total of 3 keeps the damage numbers of the rocks (Torso 2, Legs 1).
  // speed: target, 3.5 + 0.5 - 5000 x 0.0002 = 3 px/frame (180 px per second, the 1920 px screen in about 10.7 s),
  //   the speed the avatar already had. The Legs are the primary source, the Torso a small part (the user's decision).
  // dashSpeed: target, 4 x the top speed. With overspeedDecay it lasts (12 - 3) / 0.5 = 18 frames (0.3 s) and
  //   covers about 142 px, 4.4 avatar widths. rule: must stay below 28 (the avatar radius + the smallest rock
  //   radius), or it could cross a rock in one frame.
  // capacity: anchor and rule, the user's 6 t, the 5 t of the starter build plus 20%.
  parts: {
    "shoulder-r": { name: "Shoulder R", weight: 450, specs: {} },
    "shoulder-l": { name: "Shoulder L", weight: 450, specs: {} },
    "arm-r": { name: "Arm R", weight: 650, specs: {} },
    "arm-l": { name: "Arm L", weight: 650, specs: {} },
    head: { name: "Head", weight: 200, specs: { health: 15 } },
    torso: { name: "Torso", weight: 900, specs: { health: 55, defense: 2, speed: 0.5, capacity: 6000 } },
    legs: { name: "Legs", weight: 1300, specs: { health: 30, defense: 1, speed: 3.5 } },
    generator: { name: "Generator", weight: 200, specs: {} },
    booster: { name: "Booster", weight: 200, specs: { dashSpeed: 12 } },
  },

  // The build a new run starts with: the nine parts of the old project (the "knight", 5000 kg).
  starterBuild: {
    parts: ["shoulder-r", "shoulder-l", "arm-r", "arm-l", "head", "torso", "legs", "generator", "booster"],
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
