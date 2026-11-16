# Decisions

The history of the rules of `AGENTS.md` (issue 66, approved by the user on 2026-11-16). `AGENTS.md` says only the rule of today; when a rule changes, the older version moves here, so nothing is lost.

One entry per rule that changed, newest first: the date, who decided, his words, what it replaced, the issue or parcel. Under "Moved from AGENTS.md" are the sentences taken out of `AGENTS.md`, word for word, with the section they came from and the parcel of issue 66 that moved them.

---

## 2026-11-15: the Dummy's `wander` carries its pair (event, nth) and turns by it; the crowd maker is gone (section "The Dummy", "Made by the seed" and "How it moves")

- **Who decided:** the user (issue 62; built by the Rules desk, commit 28c00f1, data version 63). The forms (the pair in `wander`, the hash of the hash for the turns, `createChamberState` without `populate`) are the agent's choices, as the issue left them open.
- **His words:** "os dummies tbm deveriam nascer no frame 0, não quero códigos não reutilizados ou reutilizáveis no jogo" (the Dummies too should be born at frame 0; I do not want code in the game that is not reused or reusable).
- **What it replaced:** the Dummies were made with the state by `createCrowd` and `createDummies`, from `DEFINITIONS.terrain.dummies.count`, and `createChamberState(map, populate, runId, seed, blueprint)` called `populate`. `wander` was `{ index, angle, turns }` (its number among the Dummies); the first angle was `hashInts(seed, index, 0, SALTS.dummyAngle) % 360` and a new angle `hashInts(seed, index, turns, SALTS.dummyTurn) % 360`. Today `wander` is `{ event, nth, angle, turns }`, the first angle is rolled in `OWN_ROLLS.dummy` from (seed, event, nth) and a new angle in `turnDummy` as `hashInts(hashInts(seed, event, nth, SALTS.dummyTurn), turns, 0, SALTS.dummyTurn) % 360`. Tests 83, 84, 246 and 247.
- **Moved from AGENTS.md** (section "The Dummy", issue 66 parcel 5):
  - "`createCrowd`, `createDummies` and `DEFINITIONS.terrain.dummies` were removed (nothing else called them)."
  - "the pair replaces the old `index`, which would repeat across two events" (from the agent's choices: "`wander` is `{ event, nth, angle, turns }` (the pair replaces the old `index`, which would repeat across two events)")
  - "`createChamberState` lost its `populate` argument (every chamber now starts with the avatar alone)" (from the agent's choices)
  - "the Dummy's angle and the turns have other numbers than before, as every Dummy has the draws of the pair (0, nth) and not (index, 0)." (from the agent's choices)
  - "`hash(seed, index, turns) % 360`" (from "How it moves": "it gets a new angle, `hash(seed, index, turns) % 360` (the user's `rand(360)`, but from the seed, so the run is reproducible)"; it had stayed after issue 62 and contradicted the agent's choices of the same section)

## 2026-11-15: the Dummies of Chamber 1 are born through the spawn array (section "Spawn", "The spawn events" and the agent's reading 8)

- **Who decided:** the user (issue 62; built by the Rules desk, commit 28c00f1, data version 63).
- **His words:** "os dummies tbm deveriam nascer no frame 0, não quero códigos não reutilizados ou reutilizáveis no jogo" (the Dummies too should be born at frame 0; I do not want code in the game that is not reused or reusable).
- **What it replaced:** the state of issue 61 (commit 8e8e11c): Chamber 1 had an empty array and its Dummies were made with the state (`createCrowd`, `DEFINITIONS.terrain.dummies.count`). Today `maps.chamber1.spawns` has one event (`initialFrame` 0, count 1000, type `"dummy"`), and what the Dummy rolls for itself (its first angle) goes through `OWN_ROLLS` in `src/sim.js`. Tests 245 to 247.
- **Moved from AGENTS.md** (section "Spawn", issue 66 parcel 4):
  - "Chamber 1 has an empty array (its Dummies are made with the state)." (it had stayed in the section after issue 62 and contradicted the reading 8 of the same section and the section "The Dummy")
  - "the Dummy (which rolls its first angle) has been spawned since issue 62, through `OWN_ROLLS`." (from the agent's reading 8)

## 2026-11-15: the spawn events array replaces the Biters made with the state (section "Spawn", "The spawn events" and "The agent's readings")

- **Who decided:** the user (issue 61, 2026-11-15: every map has an array of hand-written spawn events); built by the Rules desk (issue 61, commit 8e8e11c, data version 62). The readings of the Rules desk were written the same day, for the points the issue left to it.
- **What it replaced:** Chamber 2's Biters were made with the state (`terrain.biters`, `createBiters`); there was no `DEFINITIONS.maps`.
- **Moved from AGENTS.md** (section "Spawn", issue 66 parcel 4):
  - "`terrain.biters` and `createBiters` died with it." (from the sentence on Chamber 2's array)
  - "of what issue 61 left to the Rules desk" (from the heading of the agent's readings)
  - "a new entry" (from the agent's reading 5: "The array lives in a new entry `DEFINITIONS.maps`")

## 2026-11-15: a weightless thing breaks with the body of any actor (section "Damage", "Weight 0")

- **Who decided:** the user, after I24 (issue 47; issues plan I27, commit c5d8da9).
- **His words:** "the Branch has to break with anything. It is only a visual mark for entertainment, to see things breaking. Today it is a Branch, but it is a placeholder for the things we want to break to show mechas and huge monsters as machines of destruction".
- **What it replaced:** the I24 reading, the same day: a weightless thing broke only at the first contact with a body that hurts objects (`bodyHurts`: the avatar, or an actor that `crushes`); a Biter stood against it like against a Rock.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "an object with weight 0 (a `weightPerRadius` of 0) is harmless and **breaks at the first contact** with a body that hurts objects (`bodyHurts`: the avatar, or an actor that `crushes`), whatever its health and with no minimum impact (`breakWeightless` in `src/sim.js`, asked in `collideWithObjects` right after `crushObject`)."
  - "(the I24 reading, that a Biter stands against it like against a Rock, is gone)"

## 2026-11-15: the log is the journal in the code too (section "Damage", "The combat journal")

- **Who decided:** the user (issue 59).
- **What it replaced:** the code called the combat journal the audit.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "called the audit in the code until the rename of 2026-11-15, issue 59" (from the heading of the paragraph)
  - "**Renamed (the user, 2026-11-15, issue 59):** the log is the journal in the code too (`createJournal`, the `journal` argument of `recordHit` and the 5th of `step`, `combatJournal*Line`, `combatJournalTotals`, `journal` in `src/main.js` and `src/chamber-0.js`); the Screen files were fixed in the same commit."

## 2026-11-15: a weightless thing breaks at the first contact, whatever its health (section "Damage", "Weight 0" and "The Branch")

- **Who decided:** the user (issue 47; issues plan I24, commit 9ba204b).
- **His words:** "things with no weight break immediately; health is not a parameter for what weighs 0".
- **What it replaced:** the agent's stand-in: a Branch broke only when a hit was at least its health.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "(History: until issue 47 was answered a Branch broke only when a hit was at least its health, so a slow walk could leave it with a little health and stop the avatar; that was the agent's stand-in and is gone.)"

## 2026-11-14 (written 2026-11-15): the keys `repeat` and `scale` removed (section "Damage")

- **Who decided:** the user (issue 45; data version 60; issues plan I18, commit 643db1f).
- **What it replaced:** base plan P4 and P5 put `repeat` (`life` or `contact`) and `scale` (`none` or `impact`) in every attack record.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "**The keys `repeat` and `scale` were removed (the user, 2026-11-14, issue 45; data version 60).**"
  - "Base plan P4 and P5 had put them in every attack record (`repeat`: `life` or `contact`; `scale`: `none` or `impact`)."
  - "Nothing read them to decide: the "once" of a body is `state.contacts`, that of a hitbox is `struck`, and the growth with the impact is written inside `finalAttack`, so each key was a label kept true by a check, and it cost bytes in every snap (measured, in `docs/base-plan.md`)."
  - "The user decided: `repeat` is replaced by the hitbox tag of issue 43 (`hits`, see "Shots and objects") and by the basic rule below; `scale` is replaced by `perWeight`, which each attack already writes."

## 2026-11-14: no minimum damage (section "Damage")

- **Who decided:** the user (commit ccab4ac, data version 58).
- **What it replaced:** a minimum damage, the keys `minDamage` and `minimumApplied`.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "the curve already guarantees it, since it never takes everything off, so `minDamage` and `minimumApplied` were removed (data version 58)."

## 2026-11-14: play on a past frame discards what came after, confirmed (section "Run history (two logs)", "Going back while paused")

- **Who decided:** the user (issue 42, comment of 2026-11-14; written into `src/main.js` and the section "Frame debug" of `AGENTS.md` on 2026-11-15, commit a36dfb9).
- **His words:** "A morte é desfeita, é só um debugger por enquanto. No jogo a morte não será passível de retorno no tempo." (the death is undone, it is only a debugger for now; in the game the death will not be undoable by going back in time).
- **What it replaced:** the agent's default of 2026-11-09 (commit 6ab62cc; the wording of today from 2026-11-10, commit 6761b25), not yet confirmed by the user: pressing play on a past frame discards the snaps and inputs after it (`discardAfter`). The rule is the same; only its status changed. Test 25 keeps `discardAfter`; tests 223 to 225 keep playing on from a snap before the death.
- **Moved from AGENTS.md** (section "Run history (two logs)", issue 66 parcel 3):
  - "Pressing play on a past frame discards the snaps **and inputs** after it (`discardAfter`; the agent's default, not yet confirmed)."

## 2026-11-13: the combat journal built in pieces (section "Damage", "The combat journal")

- **Who:** the Rules desk, on the user's request of 2026-11-13 (commit 247ebac and the ones before it).
- **What it replaced:** nothing; the story of the parcels that built it.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1; the tests stay named in `AGENTS.md`):
  - "Built in pieces, test by test (172 the lines, 173 the totals, 159 and 160 the log written by the rules, 174 the history, 175 the screen lines)."

## 2026-11-13: a weapon's target is data of its attack (section "Movement and input", "There is no manual aim")

- **Who decided:** the user (issue 13, the action model; Rules desk step 1a, commit f4ff920, test 183).
- **What it replaced:** the note of 2026-11-09 (commit 88536c0, when the manual aim was removed) that a weapon's target would be data of the weapon later; today it is the key `target`, `{ pick, tag }`, of the attack, read by `pickTarget`.
- **Moved from AGENTS.md** (section "Movement and input", issue 66 parcel 2):
  - "a weapon's target will be data of the weapon, later."

## 2026-11-12: the touch controls checked in Chromium (section "Movement and input", "Touch")

- **Who:** the agent that built the touch controls, on the user's request of 2026-11-12 (commit 0e6fa94).
- **What it replaced:** nothing; a past measurement. The touch controls still have no Node test, and the numbers are still guesses to tune on a phone (both stay in `AGENTS.md`).
- **Moved from AGENTS.md** (section "Movement and input", issue 66 parcel 2):
  - "it was checked in Chromium with real touch events (half stick = 0.5, beyond the radius = 1, dead zone = 0, a second finger dashes in the movement direction and spends a charge, the top bar still takes taps)."

## 2026-11-12: going back while paused is built (section "Run history (two logs)", "Going back while paused")

- **Who decided:** the user asked for the frame debug buttons (2026-11-12, commit 1ee9b93: pause and play, one frame back, one frame forward).
- **What it replaced:** the plan of 2026-11-09 (commit 192bc6f, when the history was written; marked "(planned)" on 2026-11-10, commit 6761b25): going back while paused was planned, not built. Today `stepBack`, `stepForward` and `playGame` in `src/main.js` walk the snaps with `stateFromSnap` and cut with `discardAfter`.
- **Moved from AGENTS.md** (section "Run history (two logs)", issue 66 parcel 3):
  - "**Going back while paused (planned):** the user can walk back through the saved frames."

## 2026-11-12: the shield's ring is the real collision box (section "Damage", "Shield")

- **Who decided:** the user (commit e34cdaa).
- **What it replaced:** an open question: the ring as the real collision box or only visual.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "The user first asked whether the ring was the real collision box or only visual; his answer was the real one, with the continuous radius."

## 2026-11-11 (the night of 2026-11-10): the Dummy hurts and is hurt only by the avatar, and the push is split by weight (section "The Dummy", "Only the avatar hurts a Dummy")

- **Who decided:** the user (his rule of 2026-11-10, commit 7e79ad8: the body slam hurts only where the avatar is one of the two sides; his decision of 2026-11-11, commit 4efa571: the push between actors is split by weight, the avatar included).
- **What it replaced:** the Dummy's first day (commit a2d4897, 2026-11-10): the Dummy hurt and was hurt by everything it touched, and the avatar was not pushed. Today `bodyHurts` holds who hurts whom (test 90) and `pushShare` the push (tests 85 to 87, 109 and 110).
- **Moved from AGENTS.md** (section "The Dummy", issue 66 parcel 5):
  - "(History: on its first day the Dummy hurt and was hurt by everything it touched, and the avatar was not pushed; the user changed both the same night.)"

## 2026-11-11 (the night of 2026-11-10): the Dummy is born by the birth rule, with no search for a free place (section "The Dummy", "Where")

- **Who decided:** the user (his rule of 2026-11-10; commit f5f21f1, data version 26).
- **What it replaced:** the Dummy's first day (commit a2d4897, 2026-11-10): a taken place was refused and the seed tried another, up to a number of tries (`safeRadius`, `placementTries`, `isPlaceTaken`). Today `birthOffset` places every actor (test 101 keeps the ring with room).
- **Moved from AGENTS.md** (section "The Dummy", issue 66 parcel 5):
  - "(History: on its first day a taken place was refused and the seed tried another, up to a number of tries; the user replaced that with the birth rule the same night, and `safeRadius` and `placementTries` of the Dummies died with it.)"

## 2026-11-11: resistance is a hyperbolic curve, not a fixed percentage (section "Damage")

- **Who decided:** the user, on a ratio the agent proposed (commit 824a3ba).
- **His words:** "a curve, no immortality, no hyper resistance".
- **What it replaced:** his first thought, a fixed percentage.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "The user first thought of a fixed percentage and chose the curve; the numbers are to be seen in play." (the second half, "the numbers are to be seen in play", stays in `AGENTS.md`: it is still a guess today)

## 2026-11-10: the weight of an object follows its radius, not its area (section "Damage", "The list of objects")

- **Who decided:** the user, on his idea (commit 5d48448).
- **What it replaced:** the weight followed the area.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "**Weight follows the radius (the user's decision; first changed from the area to the radius on his idea, because it is easier to read and to balance, and the range of weights is as wide as the range of health):**"

## 2026-11-10: no constant shared between two objects (section "Damage", "The list of objects")

- **Who decided:** the user (commit 57f3c93).
- **What it replaced:** the agent had given the rock and the Shroom a shared size.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "so no value may come from a constant that serves two entries (the agent once did that with a shared size and the user rejected it)."
