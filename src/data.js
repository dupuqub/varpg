// Definitions: what the game is. The "db". Nothing in here changes during a run.
// There are four things in it: two actors, the avatar and the Dummy, and two objects, the Rock and the Shroom.
// The avatar is the only thing that is created by hand: its numbers are fixed here, or come from its parts.
// The Dummy is an actor made by the seed from the ranges of its entry, like an object (see "terrain" below).
// Every object is created by the seed (see "terrain" below), from the ranges of its entry: nothing about an object
// is a single fixed value, and nothing is placed by hand. A value that is not used by anything does not belong here:
// it is deleted, and it comes back when something uses it.
// The state only points here by id (type), so it stays small.
// Read-only: it is frozen below, so nothing can change it by accident.

// Why each number is what it is. Every value below says how it was chosen:
//   target  = computed from a feel we want, written in plain units (the formula is shown)
//   anchor  = tied to something in the real world
//   rule    = forced by another number or by a rule of the game
//   guess   = a placeholder, to be tuned by playing
// The relations between numbers are collected in AGENTS.md ("Numbers and why").
// Every weight is a whole number of kg, 0 or more: the weight of a part, and for an object its "size"
// ({ min, max }: the range of its radius) and its "weightPerRadius", all whole: weight = weightPerRadius x radius,
// so it is whole by construction. src/sim.js checks it when it loads. A weight of 0 means harmless and easy to
// break (a branch, a box), see AGENTS.md ("Weight 0").

// Raise this number whenever any definition changes. Every state carries the
// version it was made with, so a state from another version can be refused.
const DEFINITIONS_VERSION = 22;

const DEFINITIONS = {
  actors: {
    avatar: {
      name: "Avatar",
      // The maximum health, the defense, the top speed and the dash strength of the
      // avatar are not here: they are the sum of what its parts give (see "parts" below).
      // What is here is the base of each value. The avatar does not read it while it plays: createAvatar
      // (src/sim.js) gives the avatar its own copy of each one, through a final function (finalRadius,
      // finalAcceleration, finalDeceleration), so any of them can change in a run.
      radius: 16, // guess: the avatar is 32 px wide, 1/60 of the screen width. The sizes of the objects are measured against it.
      acceleration: 0.25, // target: top speed in 0.2 s = 3 / 0.25 = 12 frames. A power of two, so the sums are exact
      deceleration: 0.125, // target: stops in 0.4 s (twice the time of speeding up, so it slides) = 3 / 0.125 = 24 frames. Also exact
      // Every number of the dash (strength, maximum of charges, frames to recharge) comes from the parts, the
      // Booster (see "parts" below).

      // The health and the dash charges are not here: a new avatar gets the maximum health and the maximum charges
      // of its blueprint (createChamber1State).
      initial: {
        position: { x: 0, y: 0 },
        cell: { x: 0, y: 0 }, // grid cell relative to the avatar, set every frame
        move: {
          direction: { x: 0, y: 0 }, // what the actor wants: vector with length 0 to 1
          velocity: { x: 0, y: 0 }, // how it is really moving, in pixels per frame
        },
        dash: { recharge: 0 }, // recharge = frames since the last charge started coming back
      },
    },

    // The Dummy (the user's idea, a test actor): it does not attack, it only walks in a straight line and, at every
    // collision, picks a new random angle (see createDummies and collideWanderers in src/sim.js). Like an object, it is
    // only ranges and recipes: the seed rolls its radius, health and first angle, and nothing is placed by hand.
    // size: the user's values, 16 to 32, the same as the objects, written here on their own.
    // weightPerRadius: guess, the same number as the objects', written here on their own. Nothing reads the
    //   weight of a Dummy yet (it does no damage).
    // healthRange: the user's number, 100 "just to see them colliding a lot" (a guess about what is best to see).
    // speed: guess, 2 px/frame (120 px per second), slower than the avatar (3), so the avatar can catch one.
    //   Like the others, it goes through a final function (finalSpeed) into the Dummy, which carries it.
    dummy: {
      name: "Dummy",
      size: { min: 16, max: 32 },
      weightPerRadius: 100,
      healthRange: { min: 100, max: 100 },
      speed: 2,
      initial: {
        position: { x: 0, y: 0 }, // set by the seed
        cell: { x: 0, y: 0 }, // grid cell relative to the avatar, set every frame
        move: {
          direction: { x: 0, y: 0 }, // the unit vector of the angle it is walking at
          velocity: { x: 0, y: 0 }, // direction x speed, in pixels per frame
        },
      },
    },
  },

  // The objects (the user's idea): Rocks, Shrooms, and later boxes, logs, houses... Each entry is a complete
  // configuration of that object, with its own numbers (nothing is shared between entries). An entry is a set of
  // ranges: the seed rolls one value inside each range for every object it places (see objectInSquare in
  // src/sim.js), so no object has a fixed number. An object is not stored in the state until it is hurt.
  // size ({ min, max }, the radius range in pixels) and weightPerRadius: weight = weightPerRadius x radius, the
  //   radius and not the area, all whole numbers, so nothing is rounded. The weight is computed from the radius
  //   (never stored). A heavier thing hits harder (body slam: attack = weight x 0.001 x impact / 6).
  // healthRange ({ min, max }): the health, a whole number rolled from the seed. The object breaks at 0.
  // bounce (how much of the speed of whoever hits it comes back, 0 = none, 1 = all) exists only on the Shroom for
  //   now (the user's decision). It is never above 1, or the thing would eject whoever hits it, like a spring (the
  //   user's rule). It is a { min, max } that grows linearly with the radius, from min at the smallest radius
  //   to max at the largest (see finalBounce in src/sim.js).
  objects: {
    // The Rock.
    // size (the user's values): min 16, max 32, the avatar's radius up to twice it. weightPerRadius 100 (the user's
    //   value): the weight goes from 100 x 16 = 1600 kg to 100 x 32 = 3200 kg.
    // healthRange: the user's first numbers, "between 10 and 20" for a Rock of the first map.
    rock: {
      name: "Rock",
      size: { min: 16, max: 32 },
      weightPerRadius: 100,
      healthRange: { min: 10, max: 20 },
    },

    // The Shroom (the user's idea): a Rock that bounces, and a bigger one bounces more.
    // size and weightPerRadius: the same numbers the user gave for the Rock, written here on their own: min 16, max 32, 100 kg per pixel.
    // healthRange: guess, the same numbers as the Rock's, written here on their own. The user's decision: keep it for now, as a guess; it is a correction for later.
    // bounce (the user's values): 0.2 at the smallest radius and 1 at the largest, in a straight line:
    //   0.2 + (1 - 0.2) x (radius - 16) / (32 - 16), so 0.6 at a radius of 24. The most it gives back is all the speed.
    shroom: {
      name: "Shroom",
      size: { min: 16, max: 32 },
      weightPerRadius: 100,
      healthRange: { min: 10, max: 20 },
      bounce: { min: 0.2, max: 1 },
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

    // The body slam: what a collision does. Every collision is a hit; the attack is
    // the weight of whoever hits (kg) x attackPerKg x impact / referenceImpact, where the impact is the part of the
    // speed going into the other thing, in px/frame. Provisional formula (agent's proposal, to be discussed):
    //   attackPerKg 0.001: the user's first number, a weight of 5000 kg (the avatar's) hits for 5 at the reference impact.
    //   referenceImpact 6: the user's first number (the old "minimum impact"), now the impact where the attack is exactly weight x attackPerKg.
    //     Walking (3) hits for half of it, a dash (12) for double.
    //   minDamage 1: the user's decision, a hit by something with an attack (a weight above 0) always costs at least 1,
    //     so a defense never makes the target immune.
    bodySlam: { attackPerKg: 0.001, referenceImpact: 6, minDamage: 1 },

    // Pixels per frame taken off the top speed for each kg the avatar carries.
    // target: a 5000 kg mecha loses 5000 x 0.0002 = 1 px/frame; anchor: the user's example, a part that
    // takes 0.1 px/frame is a 500 kg arm (500 x 0.0002 = 0.1). Direct and easy to see in the audit.
    weightSpeedPenalty: 0.0002,
  },

  // The mecha parts. A part has a weight (kg) and specs, and the avatar's final values are the SUM
  // of the specs of the parts in its blueprint (src/sim.js: sumSpec). Specs used so far:
  //   speed     px/frame added to the top speed        health    added to the maximum health
  //   defense   taken off every hit                    dashSpeed px/frame of the dash (the Booster)
  //   dashCharges how many charges of dash the blueprint has at most (the Booster)
  //   rechargeFrames frames a spent dash charge takes to come back (the Booster)
  //   capacity  kg the blueprint can carry (the Torso)
  // Radar, Magnet, the shield (Generator) and the weapons are not here: nothing uses them yet.
  // weight: anchor, the proportions of the user's old project (0.2 / 0.3 / 0.1 / 0.4 / 0.6 / 0.1 / 0.1,
  //   total 2.3) scaled to a total of 5000 kg (two large cars), rounded to tens.
  // health: target, the old proportions (Head 20, Torso 80, Legs 40 = 1 : 4 : 2) scaled to a total of 100,
  //   the health the avatar already had.
  // defense: guess, the old project had none; a total of 3 (Torso 2, Legs 1).
  // speed: target, 3.5 + 0.5 - 5000 x 0.0002 = 3 px/frame (180 px per second, the 1920 px screen in about 10.7 s),
  //   the speed the avatar already had. The Legs are the primary source, the Torso a small part (the user's decision).
  // dashSpeed: target, 4 x the top speed. With overspeedDecay it lasts (12 - 3) / 0.5 = 18 frames (0.3 s) and
  //   covers about 142 px, 4.4 avatar widths. rule: must stay below 32 (the avatar radius + the smallest radius
  //   of an object), or it could cross an object in one frame.
  // dashCharges: anchor, the user's old project (1 charge). The user's decision: the charges come from the parts that
  //   have them, primarily the Booster. Without one there is no charge, so no dash.
  // rechargeFrames: anchor, the user's old project (4 s) = 240 frames at 60 steps per second. The user's decision: all
  //   the numbers of the dash come from the Booster at first.
  // capacity: anchor and rule, the user's 6 t, the 5 t of the starter blueprint plus 20%.
  parts: {
    "shoulder-r": { name: "Shoulder R", weight: 450, specs: {} },
    "shoulder-l": { name: "Shoulder L", weight: 450, specs: {} },
    "arm-r": { name: "Arm R", weight: 650, specs: {} },
    "arm-l": { name: "Arm L", weight: 650, specs: {} },
    head: { name: "Head", weight: 200, specs: { health: 15 } },
    torso: { name: "Torso", weight: 900, specs: { health: 55, defense: 2, speed: 0.5, capacity: 6000 } },
    legs: { name: "Legs", weight: 1300, specs: { health: 30, defense: 1, speed: 3.5 } },
    generator: { name: "Generator", weight: 200, specs: {} },
    booster: { name: "Booster", weight: 200, specs: { dashSpeed: 12, dashCharges: 1, rechargeFrames: 240 } },
  },

  // The blueprint a new run starts with: the nine parts of the old project (the "knight", 5000 kg).
  starterBlueprint: {
    parts: ["shoulder-r", "shoulder-l", "arm-r", "arm-l", "head", "torso", "legs", "generator", "booster"],
  },

  // How the ground is filled (provisional values, to be tuned). The seed places the objects, every one of them.
  terrain: {
    objects: {
      cellSize: 256, // guess: the world is cut into squares of this size (4 cells of the collision grid), with at most one object in each
      chancePercent: 35, // target: about 11 objects on a 1920 x 1080 screen = (1920 x 1080 / 256 / 256) squares x 0.35 (enough to dodge, too few to wall you in)
      safeRadius: 200, // guess: bigger than the first dash (142 px) plus the avatar radius (16) and the largest radius of an object (32) = 190, so the very first dash cannot hit an object. No object closer than this to the start (0, 0)
      kinds: ["rock", "shroom"], // which objects the seed places: each square that has an object picks one of these with the same chance (guess: no reason yet for one to be rarer; the user's decision: 50/50 for now, a correction for later)
    },

    // The Dummies of Chamber 1: where the seed puts them is the real area of the game, the window of the
    // collision grid around the avatar (state.grid), and they wrap around its edges (see wrapIntoWindow).
    // count: the user's number, 100 on the screen "to see them colliding a lot".
    // safeRadius: guess, the same reason as the objects' (the first dash cannot hit one): no Dummy starts closer than this to the avatar.
    // placementTries: rule, how many places the seed tries for one Dummy before giving up (the game fails loudly instead
    //   of placing it on top of something). A guess for the number.
    dummies: { count: 100, safeRadius: 200, placementTries: 50 },
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
