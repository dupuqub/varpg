# Decisions

The history of the rules of `AGENTS.md` (issue 66, approved by the user on 2026-11-16). `AGENTS.md` says only the rule of today; when a rule changes, the older version moves here, so nothing is lost.

One entry per rule that changed, newest first: the date, who decided, his words, what it replaced, the issue or parcel. Under "Moved from AGENTS.md" are the sentences taken out of `AGENTS.md`, word for word, with the section they came from and the parcel of issue 66 that moved them.

---

## 2026-11-15: the code says journal too; the name `audit` no longer stays in the code (section "Weapons and equipment", "The words journal and audit")

- **Who decided:** the user (issue 59; Rules 1/4, commit 8ce37d3). See the entry "the log is the journal in the code too" of the same day, section "Damage".
- **What it replaced:** his earlier rule that the code keeps the name `audit` for the combat log. Today the log is the journal in the code and in the docs; `audit` stays only for the damage audit page of the concept and for the history.
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7):
  - "it replaces his earlier rule that the code keeps the name `audit`" (from "(the user, 2026-11-15, issue 59; it replaces his earlier rule that the code keeps the name `audit`):", which is now "(the user, 2026-11-15, issue 59):")

## 2026-11-15: the history past the death needed no code (section "Actor", "Destruction", "After the death")

- **Who decided:** the user (issue 42, comments of 2026-11-14 and 2026-11-15; issues plan I23, commit 86b233d).
- **What it replaced:** nothing; the story of the parcel: the rule was already what the code did, and the parcel only added tests 222 to 225, which stay named in `AGENTS.md`.
- **Moved from AGENTS.md** (section "Actor", issue 66 parcel 6):
  - "No code was needed for this; " (from "No code was needed for this; tests 222 to 225 keep it.", which is now "Tests 222 to 225 keep it.")

## 2026-11-15: the draws of a spawned actor no longer share the slots of the old crowd maker (section "Actor", "Draws and ids of an actor born from a spawn event")

- **Who decided:** the user (issue 62; built by the Rules desk, commit 28c00f1, data version 63; see the entry of the same day for the section "The Dummy").
- **His words:** "os dummies tbm deveriam nascer no frame 0, não quero códigos não reutilizados ou reutilizáveis no jogo" (the Dummies too should be born at frame 0; I do not want code in the game that is not reused or reusable).
- **What it replaced:** `createCrowd` drew its actors with `hashInts(seed, index, 0, salt)`, the same two slots `drawBirth` uses as (event, nth). The crowd maker is gone; today every actor born from a spawn event draws from `hashInts(seed, event, nth, salt)` (`drawBirth`, test 235).
- **Moved from AGENTS.md** (section "Actor", issue 66 parcel 6):
  - "(the two slots the old crowd maker, now gone, used as (index, 0))" (from "all from `hashInts(seed, event, nth, salt)` (the two slots the old crowd maker, now gone, used as (index, 0)), and `birthOffset(seed, event, nth, radius, grid)` takes the pair.")

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

## 2026-11-14 (built 2026-11-15): a hitbox says by a tag how it hits, the first on its path or all it touches (section "Shots and objects", "How a hitbox hits")

- **Who decided:** the user (issues 43 and 44; issues plan I19, commit 92dab86, data version 61, tests 213 to 219). The name of the key, `hits`, is the coordinator's proposal.
- **His words:** "a TAG to say how the hitbox works"; "bullets hit only the first"; "the sword hits everyone in the list" (as the comments of `HITS` in `src/sim.js` and of the attacks in `src/data.js` quote them).
- **What it replaced:** every hitbox hurt everything it touched, each once, in list order (the actors, then the objects), until its pierce was spent; a hitbox kept only its ignored tags. Today the key `hits` of each attack is copied into the hitbox (`HITBOX_ATTACK_KEYS`) and read by `hitsThisFrame`: the bite and the sword are `"all"` (the bite does what every hitbox did before), the bullets of the repeater `"first"` (`firstTouchAt`).
- **Moved from AGENTS.md** (section "Shots and objects", issue 66 parcel 8):
  - "data version 61, " (from "**How a hitbox hits (the user, 2026-11-14, issues 43 and 44; built, data version 61, tests 213 to 219).**", which is now "**How a hitbox hits (the user, 2026-11-14, issues 43 and 44; built, tests 213 to 219).**")
  - ", which keeps what it did" (from "**`"all"`** (the sword, and the bite, which keeps what it did):", which is now "**`"all"`** (the sword, and the bite):")

## 2026-11-14 (built 2026-11-15): the world stops at the test of the avatar's death (section "Weapons and equipment", the action model, "The avatar's death")

- **Who decided:** the user (issue 28; issues plan I17, commit 5d75574, tests 209 to 211).
- **His words:** "if I died, nothing of mine takes effect after the test of my death, and the world stops" (as the section "Actor" quotes them).
- **What it replaced:** the rule of base plan P1 (commit 28f6420): the step ran to its end and the mission became aborted there. Today `worldStops(state)` is asked after each contact and each hit, and the rest of stages 2 to 5 runs for nobody.
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7):
  - "Since issue 28" and ", not at the end of the step" (from "**Since issue 28 (the user, 2026-11-14) the world stops at the test of the death, not at the end of the step:**", which is now "**The world stops at the test of the death (the user, 2026-11-14, issue 28):**")

## 2026-11-14 (written 2026-11-15): the keys `repeat` and `scale` removed, in the action model too (section "Weapons and equipment", the action model, point 7 and "The plan for the base")

- **Who decided:** the user (issue 45; issues plan I18, commit 643db1f). See the entry of the same date for the section "Damage".
- **What it replaced:** base plan P4 and P5 had named the first two differences of the body slam with the keys `repeat` and `scale`. Today the differences stay in the code (`finalAttack`, `bodyHurts`), not as keys of the record (`ATTACK_KEYS`, test 206).
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7):
  - "The keys `repeat` and `scale` that named the first two differences were removed on the user's decision of 2026-11-14 (issue 45): " (from point 7, which now reads "**The differences remain in the code, not as keys of the record (the user, 2026-11-14, issue 45). Not built further.**")
  - "; `repeat` and `scale` were part of it and were removed, issue 45" (from "Its design of step 4 (the "hurting module"; `repeat` and `scale` were part of it and were removed, issue 45) is there.", which is now "The design of step 4 (the "hurting module") is in `docs/base-plan.md`.")

## 2026-11-14 (written 2026-11-15): the keys `repeat` and `scale` removed (section "Damage")

- **Who decided:** the user (issue 45; data version 60; issues plan I18, commit 643db1f).
- **What it replaced:** base plan P4 and P5 put `repeat` (`life` or `contact`) and `scale` (`none` or `impact`) in every attack record.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "**The keys `repeat` and `scale` were removed (the user, 2026-11-14, issue 45; data version 60).**"
  - "Base plan P4 and P5 had put them in every attack record (`repeat`: `life` or `contact`; `scale`: `none` or `impact`)."
  - "Nothing read them to decide: the "once" of a body is `state.contacts`, that of a hitbox is `struck`, and the growth with the impact is written inside `finalAttack`, so each key was a label kept true by a check, and it cost bytes in every snap (measured, in `docs/base-plan.md`)."
  - "The user decided: `repeat` is replaced by the hitbox tag of issue 43 (`hits`, see "Shots and objects") and by the basic rule below; `scale` is replaced by `perWeight`, which each attack already writes."

## 2026-11-14: the avatar's death made the review's point 10 moot (section "Weapons and equipment", the action model, "The avatar's death")

- **Who decided:** the user (base plan P1, commit 28f6420, tests 190 to 193: the avatar's death aborts the mission).
- **What it replaced:** the review's point 10 (hitboxes skipped a zero-health avatar, body slams did not). With the mission aborted at the avatar's death the difference no longer shows.
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7):
  - "The review's point 10 (hitboxes skip a zero-health avatar, body slams do not) no longer matters, since the step stops at the avatar's death."

## 2026-11-14 (written 2026-11-13 and 2026-11-14): steps 1 and 2 of the action model built, piece by piece (section "Weapons and equipment", the action model, "Progress of step 1")

- **Who:** the Rules desk, on the user's direction of 2026-11-13 (issue 13: steps 1a, 1b, 1c, commits from f4ff920; issue 22, commit afac280; steps 2a and 2b, commit f1e4970 and the ones before it).
- **What it replaced:** the story of the pieces (1a, 1b, 1c, 2a, 2b, each with its data version), the measurements of issue 22, the second note of the Review desk (gone with the avatar's death, 2026-11-14), "how far a non-avatar sees is open" (answered by the user on 2026-11-14: no limit; `think` and `emitStrikes` call `pickTarget` with an infinite range) and "the next steps ... both need his word" (steps 4 and 5 were then decided and built by issues 43 to 45: see the status of the steps, which stays in `AGENTS.md`). Today the paragraph keeps the target record (`TARGET_PICKS`, `checkTarget`, test 183), the index by tag (test 188), the Review desk's note on `pickTarget` returning the asker, and the status of the steps.
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7) (the whole paragraph, word for word; its last sentence, the heading of the status, stays in `AGENTS.md`):
  - "**Progress of step 1:** **1a done** (the target is `{ pick: "closest", tag }` in the recipe of the bite (`ally`), of the weapon and of the melee (`enemy`), written into `actor.attacks[name].target`, refused at load when it is not `{ pick, tag }` with a known pick (`TARGET_PICKS`, `checkTarget`); data version 53; test 183; nothing reads it yet); **1b done** (`pickTarget(state, from, target, range)` replaces `closestTarget`, used by `fireWeapons` and `swingMelees` with the `target` of their attack; the whole-state tests are bit for bit the same; test 134 follows and 184 tests the tags); **1c done** (`think` and `emitStrikes` pick with `tagIndex`, `pickTarget`, so they no longer take `player`; the Biter is `enemy` and `vermin`; data version 54; test 185: a Biter made `ally` nearer than the avatar is chased instead; no `ally` in the scene and it stands still). **Step 1 is complete.** **Issue 22 (the cost of `pickTarget` with a crowd):** `tagIndex(actors)` is made at the start of every step (`byTag`, never state, in list order) and passed to `think`, `emitStrikes`, `fireWeapons` and `swingMelees`; `pickTarget` walks only the list of its tag, or every actor when the index is `null` (the plain walk, the reference of test 188). Measured, Chamber 2, 300 steps: 500 Biters 24.6 ms plain, 10.7 ms with the index (before `pickTarget` it was 6.9); 1000 Biters 87.5 and 21.0 (before, 17.8); 40 Biters 0.86 and 0.61. Two notes of the Review desk, for when their content exists: `pickTarget` can return the actor that asks (an enemy healing the closest `enemy` would pick itself: the target will need a word, e.g. `other: true`). The special case of the Biter chasing the avatar at zero health went away with the avatar's death (2026-11-14, tests 190 to 193). Aiming by grid cells: not now (no many-against-many case, and how far a non-avatar sees is open). **Step 2a done** (the exit as a key of the attack, see point 6); **2b done** (`exitGap`). **Step 2 is complete.** The next steps of the order are the body's object as a hitbox (step 4's second half) and what changes the game (step 5): both need his word, see below. **Status of the steps (issue 13, checked against the code and the tests on 2026-11-16; `node --test` pass 243, fail 0; the issue is closed as a direction):**"

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

## 2026-11-14: the Branch is a third kind of object, picked through `rareKinds` (section "The world: seed and objects", the kinds and the layers)

- **Who decided:** the user (issue 51: "weightless branches in combat and in the movement test, 10% of the seed, just to have it running"; commit e189203). See the entry of the same day for the section "State, definitions, blueprint and rules".
- **What it replaced:** the two kinds of 2026-11-10, the rock and the Shroom, both picked from `kinds` of the layer (commit 79843ad, the layers). Today `DEFINITIONS.objects` holds the rock, the Shroom and the Branch (test 73), and `kindInSquare` first rolls `rareKinds` (the Branch, `SALTS.objectRare`) and otherwise picks from `kinds`.
- **Moved from AGENTS.md** (section "The world: seed and objects", issue 66 parcel 23):
  - "(the **rock** and the **Shroom**)" (from "The kinds are entries of `DEFINITIONS.objects` (the **rock** and the **Shroom**), each an independent set of ranges.", which is now "The kinds are entries of `DEFINITIONS.objects` (the **rock**, the **Shroom** and the **Branch**), each an independent set of ranges.")
  - "The type is picked from `kinds` of the layer," (from "The type is picked from `kinds` of the layer, and the radius and the health are rolled inside the `size` and the `healthRange` of that type (`rollInRange`; every roll has its own salt, listed in `objectInSquare`).", which now begins "The type is picked from `rareKinds` and `kinds` of the layer (`kindInSquare`),")

## 2026-11-14: the Branch is a third object of the definitions (section "State, definitions, blueprint and rules", "Definitions")

- **Who decided:** the user (issue 51: "weightless branches in combat and in the movement test, 10% of the seed, just to have it running"; written into `src/data.js` on 2026-11-14, commit e189203).
- **What it replaced:** the count of 2026-11-13 (commit b64ac02), five things with two objects, the rock and the Shroom. Today `DEFINITIONS.objects` holds the rock, the Shroom and the Branch, all placed only by the seed (the Branch through `rareKinds` of the layer); test 73 keeps the three entries.
- **Moved from AGENTS.md** (section "State, definitions, blueprint and rules", issue 66 parcel 19):
  - "There are exactly five things in it today" and "and two objects (`DEFINITIONS.objects`: the rock and the Shroom, created only by the seed, from ranges)" (from "There are exactly five things in it today: three actors (...) and two objects (`DEFINITIONS.objects`: the rock and the Shroom, created only by the seed, from ranges).", which is now "There are exactly six things in it today: three actors (...) and three objects (`DEFINITIONS.objects`: the rock, the Shroom and the Branch, created only by the seed, from ranges; test 73).")

## 2026-11-13: the Radar is read by `pickTarget`, no longer by `closestTarget` (section "Theme: mechas", "Head")

- **Who:** the Rules desk, on the user's direction of 2026-11-13 (issue 13, step 1b, commit 13eb13f). The rule of the Radar is the user's (2026-11-13, commit 8a37a4b) and did not change.
- **What it replaced:** `closestTarget`, the function that picked the closest target within the Radar, was replaced by `pickTarget(state, from, target, range)`, which the avatar's weapons and swords call with `player.radar` as the range (src/sim.js). The section "Theme: mechas" still named the old function.
- **Moved from AGENTS.md** (section "Theme: mechas", issue 66 parcel 15):
  - "`closestTarget` uses it (a Radar of 0 sees nothing)" (from "The spec `radar` (px) is summed from the parts into `avatar.radar` (static), `closestTarget` uses it (a Radar of 0 sees nothing), and the screen draws it as a white circle with no fill.", which is now "The spec `radar` (px) is summed from the parts into `avatar.radar` (static), `pickTarget` uses it as the range of the avatar's weapons (a Radar of 0 sees nothing; test 154), and the screen draws it as a white circle with no fill.")

## 2026-11-13: the visual state, decided in discussion and built the same day (section "Weapons and equipment", "Decided in discussion")

- **Who decided:** the user (commit 33cf014, the discussion; commit bff1cb5, the build; tests 155 and 156).
- **What it replaced:** the paragraph was written before the build as "not built", with two open points. The build answered both: `step` takes the visual state as its 4th argument (today `step(state, input, blueprint, visual, journal)`), and the number of frames a trace stays visible is `constants.visual.traceFrames` (12) in `src/data.js`, a guess with its reason.
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7):
  - "in discussion, not built" (from "**Decided in discussion, not built (the user, 2026-11-13):**", which is now "**Decided (the user, 2026-11-13):**")
  - "Open: the shape of `step` once it receives the visual state, and where the number of frames a trace stays visible lives in `src/data.js` (a guess, with a reason)."

## 2026-11-13: the sword built in steps A to I (section "Weapons and equipment", "Sword, build in progress")

- **Who:** the agent, on the user's request of 2026-11-13 ("slow, small steps, each one finished, tested, pushed"; commits from bc34c99 to 00283e1, and 655e2c8 for slash; the reach counted from the center: the Rules desk, commit 597e59d, review point 2, issue 2).
- **What it replaced:** the line followed the build step by step (A to I, with the data versions 43 to 45), and kept what the sword's reach used to be (the gap between the bodies) and a check in a browser. Today the line keeps what the sword is and the tests that guard it (161 to 167), and says the Biter aims at its target (`emitStrikes` calls `pickTarget` with the `target` of its attack; tests 157 and 185), where the old line said "the avatar".
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7) (the whole line, word for word):
  - "**Sword, build in progress (user's request 2026-11-13: slow, small steps, each one finished, tested, pushed).** Steps: **A done** (`circleTouchesCone` in `src/sim.js`, exact, test 161). **B done** (hitbox field `cone`, null = round; `spawnHitbox` takes `shape.cone = { reach, cosHalf, sinHalf }` and fixes the direction at birth; `hitboxTouches` picks the test; the trace carries `cone`; test 162). **C done** (`sword-arm` in `data.js`, version 43, recipe `melee { target, reach 90, angleDegrees 90, windupFrames 12, recoveryFrames 18, aimCorrection 0.1, damage { slash { flat 30, perWeight 0 } } }`, weight 850, all guesses with reasons; checked in `src/sim.js`; not in any blueprint yet; test 163). **D done** (`avatar.melees` = per sword `{ part, phase idle|windup|recovery, frames, dirX, dirY }`; `swingMelees` at stage 4b after `fireWeapons`; the trigger of F is already in it: closest target in the Radar, within the reach (since 2026-11-13 counted from the center of the avatar to the edge of the target, see "Hitboxes"; it was the gap between the bodies); melee attack in `avatar.attacks[part]` with `terms` so a skill node can raise perWeight; test 164, blows at steps 13 and 43). **E done for the sword** (in `swingMelees`: each frame of the windup the aim moves `aimCorrection` of the way toward the closest target, blend and renormalize; test 165; the BITER still aims at the avatar at the moment of the blow, with no lock: giving it the same rule is a separate small step, with `aimCorrection` in its `bite` data, to do only if the user asks). F is done inside D (test 166: the blow comes even if the target is gone). **G done** (data version 44: `combatBlueprint` = sword-arm + repeater-arm, 7750 kg loaded; the tests of the repeater now play with their own blueprint without the sword; test 167). **H done** (`drawTraces` in `render.js` draws a cone trace as a slice, checked in a browser: no errors, the slice points the right way and fades). **I done** (docs). **Slash (the user, 2026-11-13):** the sword does `slash` damage, a third type in `damageTypes` (data version 45); no part resists slash yet, the resistances are still to be decided. **The sword is finished**; what is left is tuning the numbers by playing, and the open items listed in `docs/weapons.md`. Update this line when a step is done."

## 2026-11-13: the tags of exclusion built in steps A to F, then issues 20 and 19 (section "Weapons and equipment", "Tags of exclusion")

- **Who:** the Rules desk, on the user's decision of 2026-11-13 (issue 16; steps A to F, commits from ee9eca3 to 8f3476f; issue 20, commits to ec5a00f; issue 19, commits to 50229a4).
- **What it replaced:** the paragraph followed the build step by step, with its data versions and the size of the state, and kept two lines the later steps had made old: `hitbox.ignores` "a copy of the owner's list" (since issue 20b it is the list of its attack, test 180) and "when attacks get their own list" (they have it since 20b). Today the paragraph keeps the rule, the functions and the tests (176 to 182).
- **Moved from AGENTS.md** (section "Weapons and equipment", issue 66 parcel 7) (the whole paragraph, word for word):
  - "**Tags of exclusion (the user, 2026-11-13; being built in small steps, answers issue 16 and is the first piece of issue 13):** every actor carries `tags`, an array (the avatar `ally`, the Biter and the Dummy `enemy`, an object `object`; objects ignore `enemy` and `object`), and every body and every attack carries a list of tags it **ignores** (its exclusion tags). A hit or a contact on a target happens unless the target has a tag that the attacker ignores. By default **every enemy ignores `enemy`** (no enemy hurts another enemy, by hitbox or by body, and the Biters' own bodies against each other hurt nobody); only a few exceptions, later and one by one, will take that tag out of the list. The avatar ignores `ally`. This **reproduces today's rules exactly** (nobody hurts their own side; a body slam hurts only where the avatar is one of the two; actors and objects hurt nobody between themselves) and turns them into data. Steps, one commit each: A this decision; B `tags` and `ignores` in the definitions and in the actors; C the pure test of the tags (`ignoresTarget`); D the hitboxes use the tags (`hitbox.ignores` is a copy of the owner's list at the birth); E the body slam uses the tags in both directions; F docs, review, issue. **Step A done** (this decision). **Step B done** (`tags` and `ignores` in the recipe of each of the five types, written before `name`; `tagsOf` and `ignoredTagsOf` in `src/sim.js`; test 176; data version 49; nothing uses them yet). **Step C done** (`ignoresTarget(ignores, targetTags)` in `src/sim.js`; test 177 proves that the five lists give today's table of who hurts whom). **Step D done** (`spawnHitbox` writes `hitbox.ignores`, a copy of the owner's list; `hitboxHurts(hitbox, target)` is `!ignoresTarget(...)`; `resolveHitboxes` looks at every actor and the tags decide; test 178; tests 123, 139 and 153 build their hitboxes with `ignores`). **Step E done** (`bodySlamHurts` is gone; `bodyHurts(attacker, target)` is `!ignoresTarget(ignoredTagsOf(attacker), tagsOf(target))` and `touchActors` and `collideWithObjects` ask it once per direction; test 179, with a game where `enemy` is out of the Biter's list). **Step F done** (docs). **Issue 20 (the user: tags in the actor, and the ignored list per attack), in pieces:** **20a done** (`finalizeObject` writes `thing.tags`, a copy of the recipe's; `tagsOf` reads the thing; the state grew 696 bytes per snap, 24964 to 25660 in Chamber 2 with the combat blueprint, 2.8%; tests 39, 75 and 176); **20b done** (`ignores` in the recipe of the bite, of the weapon and of the melee, written into `actor.attacks[name].ignores`; `spawnHitbox` copies the list of its attack; data version 50; test 180); **20c done** (the recipe's body list is `bodyIgnores` and is written into the thing as the `ignores` of its `bodySlam` attack; `bodyHurts` reads `attacker.attacks.bodySlam.ignores`; `ignoredTagsOf` is gone; data version 51); issue 20 is complete; issue 19 (the tag `self`, the user's answer: `self` in the list of an attack means the actor that made the hitbox; almost every attack writes it), in pieces: **19a done** (`assertValidDefinitions` refuses a missing list of tags: `tags`, `bodyIgnores`, the `ignores` of every attack; an empty list is a choice; test 181); **19b done** (`hitboxHurts` refuses the maker when the hitbox's list has `self`; `self` is first in the lists of the bite, of the weapon and of the melee; data version 52; test 182: a bite with `enemy` out hurts the neighbor and not its maker, and with `self` out too it hurts its maker); the body slam needs no `self` (a body never meets itself); issue 19 is complete (the tag `self`). **To open a hole on purpose later:** take `enemy` out of the `ignores` of that recipe (or of that attack, when attacks get their own list), and write the reason beside it in `src/data.js`; nothing in the code changes. Update this line when a step is done."

## 2026-11-13: the place of exit of a hitbox is a key of the attack (section "Actor", "Hitboxes")

- **Who decided:** the Rules desk, on issue 13 (the action model, step 2a; commit 63c325f, data version 55, test 186). The two exits are the user's words of 2026-11-13, kept in `AGENTS.md`.
- **What it replaced:** `hitboxOrigin` asked who the owner was: the avatar's hitboxes were born at its center and anyone else's one body ahead. Today every attack has `exit` (`"center"` or `"front"`) in its recipe, and `hitboxOrigin(owner, exit, towardX, towardY)` reads it; same behavior with the data of that day.
- **Moved from AGENTS.md** (section "Actor", issue 66 parcel 6):
  - "since issue 13" (from "since issue 13 it is a key of the attack, not a rule about the avatar", which is now "it is a key of the attack, not a rule about the avatar")

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

## 2026-11-12: the push by weight reads the weight the avatar carries now (section "The world: seed and objects", "Push between actors by weight")

- **Who decided:** the user (2026-11-11: "the ammunition costs weight, so the mecha gets lighter and faster as it fights"; built with the repeater on 2026-11-12, commit 120dd45, `carriedWeight` in `src/sim.js`).
- **What it replaced:** the push of 2026-11-11 (commit 4efa571), written when the avatar's weight was the total weight of its blueprint. Today `finalWeight` gives the avatar `carriedWeight` (the parts of the blueprint plus the rounds in its own weapon state), calculated again every frame in `finalizeDynamic`, and `pushShare` reads `actor.weight`; tests 136 and 143 keep it, and the section "Weapons and equipment" already says "the push by weight follows the current weight".
- **Moved from AGENTS.md** (section "The world: seed and objects", issue 66 parcel 23):
  - "(the avatar's weight is the total weight of its blueprint)" (now "(the avatar's weight is what it carries now, `carriedWeight`: the parts of its blueprint and the rounds it still holds)")

## 2026-11-12: the touch controls checked in Chromium (section "Movement and input", "Touch")

- **Who:** the agent that built the touch controls, on the user's request of 2026-11-12 (commit 0e6fa94).
- **What it replaced:** nothing; a past measurement. The touch controls still have no Node test, and the numbers are still guesses to tune on a phone (both stay in `AGENTS.md`).
- **Moved from AGENTS.md** (section "Movement and input", issue 66 parcel 2):
  - "it was checked in Chromium with real touch events (half stick = 0.5, beyond the radius = 1, dead zone = 0, a second finger dashes in the movement direction and spends a charge, the top bar still takes taps)."

## 2026-11-12: the frame debug buttons checked in Chromium (section "Simulation", "Frame debug")

- **Who:** the agent that built the frame debug buttons, on the user's request of 2026-11-12 (commit 1ee9b93).
- **What it replaced:** nothing; a past measurement. The logic is still in `src/main.js` with no Node test (that stays in `AGENTS.md`); the history it walks is tested in Node (tests 222 to 225, named in `AGENTS.md`).
- **Moved from AGENTS.md** (section "Simulation", issue 66 parcel 18):
  - "it was checked in Chromium (back and forward return the same snaps, play from the past keeps the cross-check clean)" (from "The logic is in `src/main.js` (it touches the page), so it has no Node test; it was checked in Chromium (back and forward return the same snaps, play from the past keeps the cross-check clean).", which is now "The logic is in `src/main.js` (it touches the page), so it has no Node test.")

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

## 2026-11-11: the diagnostics bench is Chamber 0, no longer Chamber 2 (section "Screens", "Chamber 0: Diagnostics")

- **Who decided:** the user (commit 4e63e8f, "Chamber 2 becomes Chamber 0").
- **His reason, as the commit gives it:** "The diagnostics bench is the base under the game chambers, so the user numbered it 0 and it comes first in the list."
- **What it replaced:** the bench was **Chamber 2: Diagnostics** (its script was `src/chamber-2.js`); the number 2 went later to the played Chamber 2: Combat.
- **Moved from AGENTS.md** (section "Screens", issue 66 parcel 16):
  - "the user renamed it from 2 on 2026-11-11, and it comes first in the list" (from "(numbered 0 because it is the base under the game chambers; the user renamed it from 2 on 2026-11-11, and it comes first in the list)", which is now "(numbered 0 by the user because it is the base under the game chambers, and it comes first in the list)")

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

## 2026-11-11: the result of an effect is written into the actor, not left unstored (section "State, definitions, blueprint and rules", "Effects: recipe versus result")

- **Who decided:** the user, correcting an agent's reading (commit 9ea6722, "The state is rich and small: the user's rule replaces an agent's reading").
- **His words:** "I do not know how to work another way; leaving things out of the state is not optimal" (kept in `AGENTS.md`, in the rule "The state is rich and small at the same time").
- **What it replaced:** the agent's text "How much it gives *now* is **not stored**: a pure function (like `finalSpeed`) computes it every frame from the recipe, the blueprint and the state. Only something with memory goes into the state, such as a buff that lasts some more time." and the warning "do not store derived values (a final speed, a total damage) in actors for convenience". Today the result is calculated by a final function and written into the actor.
- **Moved from AGENTS.md** (section "State, definitions, blueprint and rules", issue 66 parcel 19):
  - "(History: this file used to say the result is "not stored" and warned against storing derived values. That was an agent's reading, not the user's rule, and he corrected it on 2026-11-11.)"

## 2026-11-11: static values once, at the start of the run; dynamic values every frame (section "Actor", "An actor in the state")

- **Who decided:** the user, correcting an agent's reading of his rule (commit 611e9cc, test 79).
- **His words:** "everything calculated is stored" (his rule, as `AGENTS.md` quotes it); his correction, in the words `AGENTS.md` gave it: dynamic things every frame, static things at the start of the run.
- **What it replaced:** for a few hours `finalizeActor` recalculated every value every step, the weight included. Today `finalizeStatic` runs once, when the actor is made, and `finalizeDynamic` every frame, at the start of `step`.
- **Moved from AGENTS.md** (section "Actor", issue 66 parcel 6):
  - "(History: for a few hours an agent recalculated everything every frame, the weight included, having read "everything calculated is stored" as "everything is recalculated". The user: dynamic things every frame, static things at the start of the run.)"

## 2026-11-11: resistance is a hyperbolic curve, not a fixed percentage (section "Damage")

- **Who decided:** the user, on a ratio the agent proposed (commit 824a3ba).
- **His words:** "a curve, no immortality, no hyper resistance".
- **What it replaced:** his first thought, a fixed percentage.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "The user first thought of a fixed percentage and chose the curve; the numbers are to be seen in play." (the second half, "the numbers are to be seen in play", stays in `AGENTS.md`: it is still a guess today)

## 2026-11-11: the cells are counted in the world, not around the avatar (section "Collision grid", "Cells are counted in the world")

- **Who decided:** the agent, as a change forced by a rule of the user (the avatar became pushable by other actors, 2026-11-11); commit dbdccda.
- **What it replaced:** the cells were counted relative to the avatar (it was always in cell zero), an agent's choice the user never confirmed, and `isInWindow` said whether a cell was inside the window (only the tests called it). Today the cells are counted in the world (`cellIndex`, `setCells`), so the cells of an actor change only when it moves; `isInWindow` was removed.
- **Moved from AGENTS.md** (section "Collision grid", issue 66 parcel 11):
  - "(History: they were first counted relative to the avatar, an agent's choice the user never confirmed; when the avatar became pushable by other actors, 2026-11-11, that choice would have moved everyone's cells at every push, so the agent changed it. `isInWindow`, which read a relative cell, was called by nothing in the game and died with it.)"

## 2026-11-10 (evening): the first layer kept its salts when the layers came (section "The world: seed and objects", the layers)

- **Who decided:** the user's idea of the layers (2026-11-10, commit 79843ad, "Layers of the ground"); keeping the salts of the first layer was how the agent built it, so the objects of the one existing layer did not change.
- **What it replaced:** nothing; the story of the parcel. The rule of today (`100 x place + salt`, `objectInSquare`) stays in `AGENTS.md`; the first layer is at place 0, so its salts are the plain salts, and the known answer of test 39 holds.
- **Moved from AGENTS.md** (section "The world: seed and objects", issue 66 parcel 23):
  - ", and the first layer keeps the salts it always had" (from "The place of the layer in the list goes into the salts (`100 x place + salt`), so layers do not roll the same numbers, and the first layer keeps the salts it always had.", which is now "The place of the layer in the list goes into the salts (`100 x place + salt`), so layers do not roll the same numbers.")

## 2026-11-10: the agent's invented objects removed; no object by hand, no fixed value (section "The world: seed and objects", the kinds)

- **Who decided:** the user (his rule: no leftovers, no placeholders). The stone, the boulder, the rubber rock and the first "training dummy" were the agent's inventions (commits 4c1abca and a225558, 2026-11-09 and 2026-11-10); they were removed on 2026-11-10 (commits 21e6b34, 3564510 and 5ab433f, "Keep only three definitions: avatar, rock and shroom"), with every hand-placed object and every fixed value of an object.
- **What it replaced:** those definitions and the hand-placed objects. Today every object comes from the seed, inside the ranges of its entry (`src/data.js`: "so no object has a fixed number"); the rule stays in `AGENTS.md` as "No object is placed by hand and no value of an object is fixed (the user's rule: no leftovers, no placeholders)."
- **Moved from AGENTS.md** (section "The world: seed and objects", issue 66 parcel 23):
  - "Stone, boulder, rubber rock and a first "training dummy" were the agent's inventions and were **removed**, and so was every hand-placed object and every fixed value of an object (the user's rule: no leftovers, no placeholders)."

## 2026-11-10: the known answer of the seed compared in the user's Chrome (section "The world: seed and objects", `hashInts`)

- **Who:** the user, on 2026-11-10 (before commit 6761b25): he compared the rocks of the first screen in his Chrome with the DATA text of the diagnostics bench (then Chamber 2, today Chamber 0), and they were identical to the known answer of the test (today test 39).
- **What it replaced:** nothing; a past check. The rule of today (only `Math.imul`, xor and shifts; the known answer fixed by a test; DATA prints the same objects) stays in `AGENTS.md`.
- **Moved from AGENTS.md** (section "The world: seed and objects", issue 66 parcel 23):
  - "; the user compared them in his Chrome and they were identical" (from "A **known answer** for one seed is fixed by a test, and DATA in Chamber 0 prints the same objects; the user compared them in his Chrome and they were identical.", which is now "A **known answer** for one seed is fixed by a test, and DATA in Chamber 0 prints the same objects.")

## 2026-11-10: the recharge of the dash comes from the Booster too (section "The kit of parts", "Open")

- **Who decided:** the user (2026-11-10: "at first every number of the dash comes from the Booster", kept in `AGENTS.md` in the line of `finalDashRechargeFrames`; commit 3a75c7b, "Dash recharge time comes from the Booster").
- **What it replaced:** the open question written the same morning (commit d12be0a), when only the maximum of charges came from the parts and `rechargeFrames` was still in the avatar's definition. Today `rechargeFrames` is a spec of the Booster in `src/data.js`, `finalDashRechargeFrames` sums it from the parts, and test 57 keeps it (240 with the Booster, 0 without).
- **Moved from AGENTS.md** (section "The kit of parts", issue 66 parcel 20):
  - "; whether the recharge of the dash also comes from the Booster (the maximum of charges already does)" (from "Open: whether other parts (the generator) add to the capacity; whether the recharge of the dash also comes from the Booster (the maximum of charges already does).", which is now "Open: whether other parts (the generator) add to the capacity.")

## 2026-11-10: Chamber 1 is also the first combat test (section "Screens", "Chamber 1: Movement")

- **Who decided:** the user, on his idea of the first combat test (commit a225558, the body slam; `AGENTS.md` then said "First combat test (the user's idea ...): colliding with rocks while moving, in Chamber 1 (so Chamber 1 is no longer only about movement)").
- **What it replaced:** "**Chamber 1: Movement** is only for testing movement. Nothing else goes in it." (`AGENTS.md` before commit a225558).
- **Moved from AGENTS.md** (section "Screens", issue 66 parcel 16):
  - "started as a movement test only; the user later decided to use it for the first combat test too" (from "**Chamber 1: Movement** started as a movement test only; the user later decided to use it for the first combat test too (colliding with the objects of the seed).", which is now "**Chamber 1: Movement** is a movement test and, by the user's decision, the first combat test too (colliding with the objects of the seed).")

## 2026-11-10 (for every actor but the avatar, 2026-11-12): the wrap is built (section "Collision grid", "Consequences" and the wrap)

- **Who decided:** the user decided that the window is the whole universe and the real area of the game (first bullet of the section); the wrap is point 2 of the agent's reading of that decision. Built for the Dummies with the Dummy (commit a2d4897, 2026-11-10), then for every actor but the avatar (commit f5d7824, 2026-11-12).
- **What it replaced:** the state of 2026-11-09 (commit 5951fd6), when nothing moved actors back. Today `wrapIntoWindow` (called by `step` for every actor that moves except the avatar) brings an actor that leaves the window back on the opposite side; the invariant of point 1 is still not checked.
- **Moved from AGENTS.md** (section "Collision grid", issue 66 parcel 11):
  - "nothing enforces the invariant or moves actors back today." (from "**Not implemented:** nothing enforces the invariant or moves actors back today.", which is now "**Not implemented:** nothing enforces the invariant (point 1) today; point 2 is built (`wrapIntoWindow`, see below)."; it had stayed after the wrap was built and contradicted the last bullet of the same section)

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

## 2026-11-09: the collision window is no longer drawn (section "Collision grid", "Consequences", point 5)

- **Who decided:** the user (he no longer wanted to see the collision boxes); commit 4758557.
- **What it replaced:** Chamber 1 drew the window as an amber overlay fixed on the player (`drawCollisionWindow` in `src/render.js`), which was removed.
- **Moved from AGENTS.md** (section "Collision grid", issue 66 parcel 11):
  - ", and the overlay was removed" (from "(The user no longer wants to see the collision boxes, and the overlay was removed.)", which is now "(The user no longer wants to see the collision boxes.)")

## 2026-11-09: nothing is pre-resolved; the blueprint stays an input (section "State, definitions, blueprint and rules", "Blueprint")

- **Who decided:** the user, on a proposal of the agent (commit 00a3c38, "Put the initial state in the definitions; document the build and effects").
- **What it replaced:** the agent's proposal of a "pre-run state": an avatar "already prepared" with the build (today the blueprint) applied. The user found it confusing and it was dropped. Today the blueprint is an input of the run, the third argument of `step` and of the `final...` functions that need it (that stays in `AGENTS.md`, with "Nothing is pre-resolved (the user, 2026-11-09).").
- **Moved from AGENTS.md** (section "State, definitions, blueprint and rules", issue 66 parcel 19):
  - "(The agent once proposed an avatar "already prepared" with the blueprint applied."
  - "The user found it confusing and it was dropped: nothing is pre-resolved.)" (its rule, "nothing is pre-resolved", stays in `AGENTS.md`)
