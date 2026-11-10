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
// Every weight (actor types and parts) is a whole number of kg, 0 or more: src/sim.js checks it when it loads.
// A weight of 0 means harmless and easy to break (a branch, a box), see AGENTS.md ("Weight 0").

// Raise this number whenever any definition changes. Every state carries the
// version it was made with, so a state from another version can be refused.
const DEFINITIONS_VERSION = 11;

const DEFINITIONS = {
  actors: {
    player: {
      name: "Player",
      doesDamage: true, // rule: touching it hurts (the body slam). A type without this never hurts what touches it
      // The maximum health, the defense, the top speed and the dash strength of the
      // avatar are not here: they are the sum of what its parts give (see "parts" below).
      radius: 16, // guess: the avatar is 32 px wide, 1/60 of the screen width. Every rock radius is measured against it.
      acceleration: 0.25, // target: top speed in 0.2 s = 3 / 0.25 = 12 frames. A power of two, so the sums are exact
      deceleration: 0.125, // target: stops in 0.4 s (twice the time of speeding up, so it slides) = 3 / 0.125 = 24 frames. Also exact
      dash: {
        // The dash strength comes from the parts (the Booster: dashSpeed 12, see "parts" below).
        maxCharges: 1, // anchor: the user's old project (1 charge)
        rechargeFrames: 240, // anchor: the user's old project (4 s) = 240 frames at 60 steps per second
      },

      initial: {
        health: { current: 0 }, // set to the maximum health of the build when the state is created (createChamber1State)
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
    // radius (guess, measured against the avatar's 16): stone = the same size, boulder = 1.25 x, rubber = 0.75 x.
    //   rule: no radius above terrain.rocks.margin (20), or rocks of neighbor squares could overlap.
    // bounce: the three reference points of the range (none, half, all), so the feel of each can be compared.
    // weight (kg): anchor, proportional to the area (radius squared). The stone has the avatar's radius (16), so it
    //   weighs the same as the starter build, 5000 kg (the user's first number); boulder 5000 x (20/16)^2 = 7800,
    //   rubber 5000 x (12/16)^2 = 2800 (rounded to hundreds). A heavier rock hits harder (body slam: attack = weight x 0.001).
    // healthRange: the user's first numbers, "between 10 and 20" for a rock of the first map. Each rock rolls its
    //   own whole number inside the range from the seed (see rockInSquare), and it breaks at 0. Same range for all kinds for now.
    stone: {
      name: "Stone",
      doesDamage: true, // rule: touching it hurts (the body slam). A type without this never hurts what touches it
      radius: 16,
      weight: 5000,
      healthRange: { min: 10, max: 20 },
      bounce: 0,
      initial: { position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } },
    },
    boulder: {
      name: "Boulder",
      doesDamage: true, // rule: touching it hurts (the body slam). A type without this never hurts what touches it
      radius: 20,
      weight: 7800,
      healthRange: { min: 10, max: 20 },
      bounce: 0.5,
      initial: { position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } },
    },
    rubber: {
      name: "Rubber rock",
      doesDamage: true, // rule: touching it hurts (the body slam). A type without this never hurts what touches it
      radius: 12,
      weight: 2800,
      healthRange: { min: 10, max: 20 },
      bounce: 1,
      initial: { position: { x: 0, y: 0 }, cell: { x: 0, y: 0 } },
    },

    // The training dummy: a still actor (no "move") that receives the avatar's body slam and hits back with its
    // own weight, to test the attack. Like a rock it does not move, but it is a real actor in the state.
    // weight: guess, the same as the starter build and the stone, so a hit on it is as strong as a hit on a stone.
    // maxHealth: guess, 30 = six hits of 5, so a few dashes (one every 4 s) are needed to see it fall to 0. It stays at 0.
    // defense 0: nothing is taken off the hits. radius: the avatar's. bounce 0.5: the boulder's, half of the speed comes back.
    dummy: {
      name: "Training dummy",
      doesDamage: true, // rule: touching it hurts (the body slam). A type without this never hurts what touches it
      maxHealth: 30,
      weight: 5000,
      defense: 0,
      radius: 16,
      bounce: 0.5,
      initial: {
        health: { current: 30 },
        position: { x: 0, y: 0 },
        cell: { x: 0, y: 0 },
      },
    },
  },

  // Values that are the same for every actor, and that parts and buffs do not change.
  constants: {
    // Pixels per frame lost, every frame, while an actor is faster than its top
    // speed (for example right after a dash). Parts can make a dash stronger, but
    // not decay slower, so a stronger dash is also a longer dash.
    // target: a dash of 12 lasts 0.3 s: (12 - 3) / 0.5 = 18 frames. A power of two, so the speed lands exactly on the top speed.
    overspeedDecay: 0.5,

    // A collision only happens when the speed going INTO the other thing (the impact, px/frame) is at least
    // minImpact. Below it nothing triggers: no hit, no bounce (the actor just stops against the thing).
    // minImpact 1: the user's decision, "for now", to be found by playing. Its job is to avoid several contacts
    // in a row: pressing (acceleration 0.25 per frame) never reaches it, so it cannot hit again and again.
    collision: { minImpact: 1 },

    // The body slam: what a collision does. Every contact with something that doesDamage is a hit; the attack is
    // the weight of whoever hits (kg) x attackPerKg x impact / referenceImpact, where the impact is the part of the
    // speed going into the other thing, in px/frame. Provisional formula (agent's proposal, to be discussed):
    //   attackPerKg 0.001: the user's first number, a weight of 5000 kg hits for 5 at the reference impact.
    //   referenceImpact 6: the user's first number (the old "minimum impact"), now the impact where the attack is exactly weight x attackPerKg.
    //     Walking (3) hits for half of it, a dash (12) for double.
    //   minDamage 1: the user's decision, a hit by something that doesDamage always costs at least 1,
    //     so a defense never makes the target immune.
    bodySlam: { attackPerKg: 0.001, referenceImpact: 6, minDamage: 1 },

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

  // What Chamber 1 has besides the avatar and the rocks.
  chamber1: {
    // The training dummy, straight up from the start.
    // position: rule, 130 px. At 130 px the dummy is touched after 98 px of a dash (130 minus the two
    //   radii), with an impact of 7, so the first dash reaches it. It is also inside the rocks' safe zone
    //   (200 px minus the largest rock radius 20 and the dummy radius 16 = 164), so no rock can overlap it.
    actors: [{ id: "dummy_1", type: "dummy", position: { x: 0, y: -130 } }],
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
