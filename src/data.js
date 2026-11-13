// Definitions: what the game is. The "db". Nothing in here changes during a run.
// There are five things in it: three actors, the avatar, the Dummy and the Biter, and two objects, the Rock and the Shroom.
// The avatar is the only thing that is created by hand: its numbers are fixed here, or come from its parts.
// The Dummy and the Biter are actors made by the seed from the ranges of their entries, like an object (see "terrain" below).
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
// The relations between numbers are collected in AGENTS.md ("Where the numbers are", "Relations").
// Every weight is a whole number of kg, 0 or more: the weight of a part, and for an object its "size"
// ({ min, max }: the range of its radius) and its "weightPerRadius", all whole: weight = weightPerRadius x radius,
// so it is whole by construction. src/sim.js checks it when it loads. A weight of 0 means harmless and easy to
// break (a branch, a box), see AGENTS.md ("Weight 0").

// Raise this number whenever any definition changes. Every state carries the
// version it was made with, so a state from another version can be refused.
const DEFINITIONS_VERSION = 37;

const DEFINITIONS = {
  // The types of damage (the user's idea, 2026-11-11: a hit is a packet with one amount per type, and the target resists
  // each type on its own). Only the types something uses today: blunt is the body slam, puncture is the Biter's bite.
  // The order here is the order the terms of a hit are calculated and shown. Fire, ice... come when something uses them.
  damageTypes: ["blunt", "puncture"],

  actors: {
    avatar: {
      name: "Avatar",
      // The maximum health, the resistance, the top speed and the dash strength of the
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
        cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }, // the grid cells it covers, written every frame
        crushes: false, // the user's decision: a potential behavior of every actor (see crushObject in src/sim.js), off until a buff switches it on
        resistance: {}, // points per type of damage, written from the parts every frame (see "parts" below); an actor without it has none
        // The shield (the user's decision, 2026-11-12): a health that regenerates, from the Generator (see "parts" below). now/max is the
        // user's mold; quiet counts the frames since the avatar last took damage; the rest is written at the start of the run from the parts.
        shield: { now: 0, max: 0, quiet: 0, delayFrames: 0, regenPerFrame: 0, resistance: {} },
        move: {
          direction: { x: 0, y: 0 }, // what the actor wants: vector with length 0 to 1
          velocity: { x: 0, y: 0 }, // how it is really moving, in pixels per frame
        },
        dash: { recharge: 0 }, // recharge = frames since the last charge started coming back
      },
    },

    // The Dummy (the user's idea, a test actor): it does not attack, it only walks toward an angle and, at every
    // collision, picks a new random angle (see createDummies and collideActors in src/sim.js). Like an object, it is
    // only ranges and recipes: the seed rolls its radius, health and first angle, and nothing is placed by hand.
    // size: the user's decision for the stress test, 50% smaller than the objects (8 to 16), so more fit.
    // weightPerRadius: guess, the same number as the objects', written here on their own. The weight is the attack of
    //   its body slam (see bodySlam below), so a Dummy hits with 800 to 1600 kg.
    // healthRange: the user's number, 100 "just to see them colliding a lot" (a guess about what is best to see).
    // speed: guess, 2 px/frame (120 px per second), slower than the avatar (3), so the avatar can catch one.
    //   Like the others, it goes through a final function (finalSpeed) into the Dummy, which carries it.
    // acceleration, deceleration (the user's decision, 2026-11-11: every actor that moves has them in its recipe, and
    //   its speed is calculated like anyone's): guess, written here on their own. 0.125: the top speed in 2 / 0.125 =
    //   16 frames (0.27 s). 0.0625: a stop in 32 frames (0.53 s), twice the time of speeding up, so it slides. Powers
    //   of two, like the avatar's. A Dummy always wants to walk, so its deceleration waits for the day one stops.
    dummy: {
      name: "Dummy",
      size: { min: 8, max: 16 },
      weightPerRadius: 100,
      healthRange: { min: 100, max: 100 },
      speed: 2,
      acceleration: 0.125,
      deceleration: 0.0625,
      initial: {
        position: { x: 0, y: 0 }, // set by the seed
        cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }, // the grid cells it covers, written every frame
        crushes: false, // the user's decision: the same potential behavior as every actor's (see the avatar), off; the Dummy does not crush
        move: {
          direction: { x: 0, y: 0 }, // what it wants: the unit vector of the angle it is walking at
          velocity: { x: 0, y: 0 }, // how it is really moving, in pixels per frame: it is born still and speeds up
        },
      },
    },

    // The Biter (the user's idea, 2026-11-11, the first enemy that decides what to do; the worm of his screenshot): it
    // chases the avatar and, when close enough, strikes with a hitbox and stays still for a moment (see think in src/sim.js).
    // Like the Dummy it is only ranges and a recipe: the seed rolls its radius and health, and it is born like any actor.
    // size: guess, 12 to 20, a little smaller than the avatar (16) on average, so a crowd of them is a swarm and not a wall.
    // weightPerRadius: guess, the same number as the objects' and the Dummy's, written here on its own: 1200 to 2000 kg.
    //   The weight is its body slam (blunt, see constants.bodySlam) and part of its bite (see attacks below).
    // healthRange: guess, 30: the avatar's body slam at a walk (impact 3) hurts for 2.5 and a dash (impact 12) for 10, so a
    //   Biter takes about 3 dashes or a dozen bumps. To be tuned by playing.
    // speed: guess, 2.5 px/frame (150 px per second): below the avatar's 3, so the avatar can outrun it, above the Dummy's 2.
    // acceleration, deceleration: guess, written here on their own. 0.125: the top speed in 2.5 / 0.125 = 20 frames.
    //   0.25: a stop in 2.5 / 0.25 = 10 frames, the length of the freeze after a bite (target), so it is still when it ends.
    //   Powers of two, so the sums are exact.
    // attacks.bite (the user's idea: when it gets close it sends a hitbox that holds it still for about 10 frames; later also a pause before):
    //   damage: puncture = flat + perWeight x weight (the user's idea: bigger Biters bite harder, and the weight counts for
    //     this attack, not for every attack). guess: flat 3, perWeight 0.002, so 3 + 0.002 x 1200 = 5.4 for the smallest
    //     and 3 + 0.002 x 2000 = 7 for the largest. The avatar has 100 health, so about 15 bites.
    //   reach: guess, 8 px of space between the two bodies, about a quarter of the avatar's width, "close enough to bite".
    //   windupFrames: the user's idea (2026-11-11): a short pause before the bite and one after it, to prove that both can
    //     exist (the style is crowds, so seeing the attack is not a priority). guess 15 (a quarter of a second): enough to
    //     see it and to dash out, short enough for a crowd to stay a threat. 0 would bite at once.
    //   freezeFrames: the user's number, "about 10 frames", now the pause after the bite.
    //   hitbox: radius guess 20 (a little more than the avatar's radius, so a bite at the reach always lands: the hitbox is
    //     born one body ahead of the Biter, and with the reach above it covers the avatar); frames guess 4 (0.07 s: a bite is
    //     a snap, not a zone). A hitbox hurts once.
    biter: {
      name: "Biter",
      size: { min: 12, max: 20 },
      weightPerRadius: 100,
      healthRange: { min: 30, max: 30 },
      speed: 2.5,
      acceleration: 0.125,
      deceleration: 0.25,
      attacks: {
        bite: {
          damage: { puncture: { flat: 3, perWeight: 0.002 } },
          reach: 8,
          windupFrames: 15,
          freezeFrames: 10,
          hitbox: { radius: 20, frames: 4 },
        },
      },
      initial: {
        position: { x: 0, y: 0 }, // set by the seed
        cells: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }, // the grid cells it covers, written every frame
        crushes: false, // the same potential behavior as every actor's, off
        ai: { attack: "bite", phase: "chase", frames: 0 }, // which attack it uses, what it is doing (chase, windup, freeze), and the frames left of the windup or the freeze
        move: {
          direction: { x: 0, y: 0 }, // what it wants: toward the avatar, or still while it holds the freeze
          velocity: { x: 0, y: 0 }, // how it is really moving: it is born still and speeds up
        },
      },
    },
  },

  // The objects (the user's idea): Rocks, Shrooms, and later boxes, logs, houses... Each entry is a complete
  // configuration of that object, with its own numbers (nothing is shared between entries). An entry is a set of
  // ranges: the seed rolls one value inside each range for every object it places (see objectInSquare in
  // src/sim.js), so no object has a fixed number. An object is not stored in the state until it is hurt.
  // size ({ min, max }, the radius range in pixels) and weightPerRadius: weight = weightPerRadius x radius, the
  //   radius and not the area, all whole numbers, so nothing is rounded. The weight is computed from the radius when
  //   the object is made, and the object carries it. A heavier thing hits harder (body slam: attack = weight x 0.001 x impact / 6).
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

    // The collision grid and the window of the game (they were in sim.js; they moved here by the user's request, 2026-11-12).
    // The state keeps a copy of it (state.grid).
    // - screenWidth, screenHeight: what the player sees, in pixels: the size of the canvas (index.html; src/main.js
    //   checks that the two agree). The rules need it to know what is off the screen (birthOffset) and the window is
    //   counted from it. rule: the canvas is 1920 x 1080 (the user's requirement).
    // - cellSize: side of a cell, in pixels. It does not limit the size of an actor: an actor covers every cell
    //   its circle reaches (actor.cells), so two actors that touch always share a cell. It only decides how much
    //   work the grid saves: a cell much smaller than the actors makes each one cover many cells, a cell much larger
    //   puts many actors in the same cell. Measure with `node tests/agent/benchmark-grid.js`.
    // - windowWidth, windowHeight: the window around the player, measured in cells (its size in pixels is
    //   windowWidth x cellSize by windowHeight x cellSize, centered on the player). Each is odd, 3 or more.
    //   It is the real area of the game: an actor that leaves it comes back on the opposite side (wrapIntoWindow),
    //   so it must cover all the ground where an actor can be, and some actors are off screen. The
    //   window is twice the screen (1920 x 1080), so 3840 x 2160 pixels: half
    //   of it is 1920 x 1080, and the center cell already covers 32. So 30 cells
    //   on each side across (61 columns) and 17 up and down (35 rows).
    //   How far outside the screen actors can be is not decided yet (it depends
    //   on where they spawn). A bigger window costs almost nothing: what costs
    //   is the number of actors tested, not the area.
    // cellSize 64: guess, "an imaginary number that looks reasonable" (the user's words). The benchmark found the cost
    //   about the same from 60 to 100 with the Dummies of today; it is to be measured again when the actors change.
    // windowWidth x windowHeight = rule: twice the screen (see above).
    grid: { screenWidth: 1920, screenHeight: 1080, cellSize: 64, windowWidth: 61, windowHeight: 35 },

    // The body slam: what a collision does, and the first attack of every thing (the user's decision, 2026-11-11: it is a
    // packet like any other attack, of blunt damage). Every collision is a hit; the blunt damage is the weight of whoever hits
    // (kg) x perWeight x impact / referenceImpact, where the impact is the part of the speed going into the other thing,
    // in px/frame. Provisional formula (agent's proposal, to be discussed):
    //   attack.damage.blunt.perWeight 0.001 (flat 0): the user's first number, a weight of 5000 kg (the avatar's) hits for 5 at the reference impact.
    //   referenceImpact 6: the user's first number (the old "minimum impact"), now the impact where the attack is exactly flat + perWeight x weight, the same form as every other attack (the body slam is written like the bite of a Biter).
    //     Walking (3) hits for half of it, a dash (12) for double.
    bodySlam: { attack: { damage: { blunt: { flat: 0, perWeight: 0.001 } } }, referenceImpact: 6 },

    // How a packet of damage hurts (see resolveDamage in src/sim.js), the same for every hit and every type.
    //   resistanceScale 100: the user's wish (2026-11-11): nobody is immortal, and there is always something to gain by adding
    //     resistance. The share taken off a type is points / (points + resistanceScale), a curve that never reaches 100%. At 100
    //     points it is half (the number is the scale), at 300 it is 75%, at 900 90%, and for small amounts a point is about
    //     1%, so the user's "13% of resistance" is 13 points, a little less than 13%. The life the target is worth ("effective
    //     health") grows in a straight line with the points: every 100 points add the life it has without any. guess: the
    //     scale, to be tuned by playing with real items.
    //   minDamage 1: the user's decision, a hit with something in its packet always costs at least 1 (the defense never
    //     makes the target immune); an empty packet (a weight of 0) costs nothing.
    damage: { resistanceScale: 100, minDamage: 1 },

    // The ring of the shield (the user's idea, 2026-11-12): the avatar's body for collision and for being hit is a circle that goes
    // from the body (shield empty) to the ring (shield full) in a straight line with the share of the shield that is left, so
    // nothing jumps when it fills or drains gradually, and the avatar does not hurt anyone because the ring grew (a hit needs an impact).
    // ringScale 1.8: the user's number (2026-11-12): the ring, shield full, is at least 180% of the size of the avatar, so that
    //   the shield is seen to be what is hit and not the avatar. (An earlier 1.3 came from the screenshot of the old project, a
    //   relic, and the user found it too close to the body.) A guess to tune by playing; the ring must stay below the margin
    //   between the screen and the edge of the window (test 101 checks the actors; the avatar's ring is far under it).
    shield: { ringScale: 1.8 },

    // Pixels per frame taken off the top speed for each kg the avatar carries.
    // target: a 5000 kg mecha loses 5000 x 0.0002 = 1 px/frame; anchor: the user's example, a part that
    // takes 0.1 px/frame is a 500 kg arm (500 x 0.0002 = 0.1). Direct and easy to see in the audit.
    weightSpeedPenalty: 0.0002,
  },

  // The mecha parts. A part has a weight (kg) and specs, and the avatar's final values are the SUM
  // of the specs of the parts in its blueprint (src/sim.js: sumSpec). Specs used so far:
  //   speed     px/frame added to the top speed        health    added to the maximum health
  //   resistance points of resistance per type of damage ({ blunt: 20, puncture: 10 }, see constants.damage)
  //                                                    dashSpeed px/frame of the dash (the Booster)
  //   dashCharges how many charges of dash the blueprint has at most (the Booster)
  //   rechargeFrames frames a spent dash charge takes to come back (the Booster)
  //   capacity  kg the blueprint can carry (the Torso)
  // Radar, Magnet, the shield (Generator) and the weapons are not here: nothing uses them yet.
  // weight: anchor, the proportions of the user's old project (0.2 / 0.3 / 0.1 / 0.4 / 0.6 / 0.1 / 0.1,
  //   total 2.3) scaled to a total of 5000 kg (two large cars), rounded to tens.
  // health: target, the old proportions (Head 20, Torso 80, Legs 40 = 1 : 4 : 2) scaled to a total of 100,
  //   the health the avatar already had.
  // resistance: guess, the old project had none (the user's decision, 2026-11-11: the flat defense was replaced by resistance
  //   per type, with a curve). With constants.damage.resistanceScale 100: blunt 30 points (Torso 20, Legs 10) take off
  //   30 / 130 = 23% of a body slam; puncture 10 points (Torso) take off 10 / 110 = 9% of a bite. Enough to see the difference
  //   in play, small enough to leave room to grow. The Torso is the tough case, the Legs a little.
  // speed: target, 3.5 + 0.5 - 5000 x 0.0002 = 3 px/frame (180 px per second, the 1920 px screen in about 10.7 s),
  //   the speed the avatar already had. The Legs are the primary source, the Torso a small part (the user's decision).
  // dashSpeed: target, 4 x the top speed. With overspeedDecay it lasts (12 - 3) / 0.5 = 18 frames (0.3 s) and
  //   covers about 142 px, 4.4 avatar widths. rule: must stay below 32 (the avatar radius + the smallest radius
  //   of an object), or it could cross an object in one frame.
  // dashCharges: anchor, the user's old project (1 charge). The user's decision: the charges come from the parts that
  //   have them, primarily the Booster. Without one there is no charge, so no dash.
  // rechargeFrames: anchor, the user's old project (4 s) = 240 frames at 60 steps per second. The user's decision: all
  //   the numbers of the dash come from the Booster at first.
  // capacity: the user's decision (2026-11-11): 8 t, from his "10 t, or maybe 8", so the starter's 5 t leaves 3 t of room for
  //   heavy ammunition and for changing parts, early, because small changes and ammunition must make a difference to the feel
  //   of the speed. (It was 6 t, the starter's 5 t plus 20%.)
  parts: {
    "shoulder-r": { name: "Shoulder R", weight: 450, specs: {} },
    "shoulder-l": { name: "Shoulder L", weight: 450, specs: {} },
    "arm-r": { name: "Arm R", weight: 650, specs: {} },
    "arm-l": { name: "Arm L", weight: 650, specs: {} },
    head: { name: "Head", weight: 200, specs: { health: 15 } },
    torso: { name: "Torso", weight: 900, specs: { health: 55, resistance: { blunt: 20, puncture: 10 }, speed: 0.5, capacity: 8000 } },
    // The repeater arm (the user, 2026-11-11): the weapon is the arm itself and takes the place of the plain Arm L. A
    // machine gun, slow at first, with limited ammunition that weighs: the mecha gets lighter and faster as it fires.
    // weight 800: the plain arm's 650 plus 150 for the gun (guess).
    // weapon.target: "closest", the only rule of auto-aim for now.
    // The user (2026-11-11): "err upward first, better to look overpowered than a rubber duck"; the numbers are tuned later.
    // weapon.range 520: guess, a bit under half the height of the screen, so it only fires at what is near.
    // weapon.intervalFrames 10: guess, 6 shots a second (the old project's 0.3 s was 18 frames; raised on purpose).
    // weapon.reloadFrames 90: guess, 1.5 s.
    // weapon.rounds: weight 6 kg each and 400 of them (magazine 30, reserve 370), guess: 2400 kg of ammunition, so firing
    //   it all makes the mecha lighter by a fifth of its loaded weight, a speed gain the player can feel, and there is plenty
    //   of ammunition to fire. The loaded mecha is 7550 kg, under the 8000 of the Torso.
    // weapon.projectile: damage puncture 10 (guess: a Biter has 30 health, so 3 hits), speed 8 px per frame (guess: faster
    //   than the avatar's 3 and the Biter's 2.5), radius 6 (a small bullet), no life in frames (the user, 2026-11-12: it dies only when it leaves the window of the grid, or when its pierce is spent), pierce 0
    //   (the user: nothing crosses by default; each crossing is a +1 from the weapon or the skill tree).
    "repeater-arm": {
      name: "Repeater arm",
      weight: 800,
      specs: {},
      weapon: {
        target: "closest",
        range: 520,
        intervalFrames: 10,
        reloadFrames: 90,
        rounds: { weight: 6, magazine: 30, reserve: 370 },
        projectile: { damage: { puncture: 10 }, speed: 8, radius: 6, pierce: 0 },
      },
    },
    legs: { name: "Legs", weight: 1300, specs: { health: 30, resistance: { blunt: 10 }, speed: 3.5 } },
    // The Generator is the primary source of the shield (the user's decision). The shield absorbs first, and what is left goes to health.
    //   shieldMax 40: anchor, the screenshot of the old project (a relic) shows 40 next to 154 of health; here with 100 of health it is
    //     a bit under half of it, about six to eight bites of a Biter, so it is felt and does not replace the health. A guess to tune by playing.
    //   shieldDelayFrames 180 (3 s): guess, long enough that a crowd on top of the avatar keeps it down, short enough that stepping out of the fight pays.
    //   shieldRegenPerFrame 0.25 (15 per second): target, a full shield in 40 / 0.25 = 160 frames (2.7 s) once it starts. A power of two, so the sums are exact.
    //   shieldResistance 11 points per type: the user's example "10% while active", and 11 points are 11 / 111 = 9.9% by the curve of
    //     constants.damage. Counted only while the shield has something left.
    generator: { name: "Generator", weight: 200, specs: { shieldMax: 40, shieldDelayFrames: 180, shieldRegenPerFrame: 0.25, shieldResistance: { blunt: 11, puncture: 11 } } },
    booster: { name: "Booster", weight: 200, specs: { dashSpeed: 12, dashCharges: 1, rechargeFrames: 240 } },
  },

  // The blueprint a new run starts with: the nine parts of the old project (the "knight", 5000 kg).
  starterBlueprint: {
    parts: ["shoulder-r", "shoulder-l", "arm-r", "arm-l", "head", "torso", "legs", "generator", "booster"],
  },
  // The blueprint of Chamber 2 (combat): the starter with the repeater arm in place of the plain Arm L.
  combatBlueprint: {
    parts: ["shoulder-r", "shoulder-l", "arm-r", "repeater-arm", "head", "torso", "legs", "generator", "booster"],
  },

  // How the ground is filled (provisional values, to be tuned). The seed places the objects, every one of them.
  // The seed places them in layers (the user's idea: a thing that lives in the seed may one day be huge and rare, and
  //   it cannot share the squares of the small ones). Each layer is complete and has its own numbers, nothing is shared.
  //   The world is cut into squares of the size of the layer, with at most one object in each square. Every object of
  //   a layer stays inside its own square, so the largest radius of its kinds must fit in it (the game refuses a layer
  //   where it does not). When objects of two layers overlap, the layer with the larger square wins and the other
  //   object is not placed. Only the layer "small" exists for now.
  terrain: {
    objects: {
      layers: {
        small: {
          cellSize: 256, // guess: the world is cut into squares of this size (4 cells of the collision grid), with at most one object in each
          chancePercent: 35, // target: about 11 objects on a 1920 x 1080 screen = (1920 x 1080 / 256 / 256) squares x 0.35 (enough to dodge, too few to wall you in)
          safeRadius: 200, // guess: bigger than the first dash (142 px) plus the avatar radius (16) and the largest radius of an object (32) = 190, so the very first dash cannot hit an object. No object closer than this to the start (0, 0)
          kinds: ["rock", "shroom"], // which objects the seed places: each square that has an object picks one of these with the same chance (guess: no reason yet for one to be rarer; the user's decision: 50/50 for now, a correction for later)
        },
      },
    },

    // The Dummies of Chamber 1: the seed makes them, and they are born like any actor (see birthOffset in src/sim.js):
    // anywhere off the screen and inside the window of the collision grid around the avatar (state.grid), with no
    // search for a free place, and they wrap around the edges of the window (see wrapIntoWindow).
    // count: the user's number for the stress test, 1000 (it was 100, "to see them colliding a lot").
    dummies: { count: 1000 },

    // The Biters of Chamber 2 (COMBAT), made by the seed and born like the Dummies.
    // count: guess, 40: enough to be chased from every side, few enough to count the hits and to see each one.
    biters: { count: 40 },
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
