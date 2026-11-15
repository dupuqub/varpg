# The solid base plan

Written on 2026-11-15 by the Review desk (Fable 5.2), at the user's request: everything that is left before the project enters a new phase, cut into parcels, each with its model. The method is `docs/method.md`; the loop is the one of `docs/issues-plan.md` with one change (below). When this plan is done there is no open issue except the ones that wait for new content.

## Who does what (the user, 2026-11-15)

| Model | Role | Never |
|---|---|---|
| **Haiku** | The checklister: runs the loop, the mechanical checks, marks, commits, comments, closes. Does the parcels marked **coordinator**. | Judges a design, or builds a rule. |
| **Sonnet** | Builds the parcels whose recipe leaves nothing to decide. | |
| **Opus** | Builds the parcels with one hard part, named in the recipe. | |
| **Fable** | Writes the plans and the reviews, and builds the two parcels where a wrong design costs most (F1, F2). | Is spent on anything a recipe can hand to another model: its weekly allowance is small. |

**A Plan desk (proposal, for the user to approve):** planning gets its own conversation, `varpg · Plan`, on Fable. It reads the issues (body and comments), talks with the user one question at a time, and writes plans like this one; it changes no code. Why: the last plan was written by the desk that executes, in the middle of executing, and missed five answers (review finding P2.1). The Review desk keeps reviewing after the fact. Parcel C1 writes the desk into `docs/desks.md` if he approves.

## The one change to the loop

**Reading an issue is its body and its comments** (`gh api repos/dupuqub/varpg/issues/N --jq .body` and `.../issues/N/comments --jq '.[].body'`). The last comment that starts "Answer of the user" or "Summary of the user's answers" wins over the body. Every helper is told this.

## The parcels, in order

### [ ] C1. The loop reads comments; the Plan desk (coordinator; issue 53, part 1)

**Files:** `docs/issues-plan.md`, `docs/base-plan.md`, `docs/desks.md`.
Write the change above into the two loops and into "How desks talk". If the user approved the Plan desk, add it to the table and the sections of `docs/desks.md` (reads and plans, writes only `docs/*-plan.md`, opening line in the pattern of the others). No tests.

### [ ] F1. The avatar's death stops the world (model: fable; issues 28 and 30)

**Files:** `src/sim.js`, `docs/step-order.md`, `AGENTS.md`, the tests and their README.
The user's words are in issue 28: when the avatar's death is tested nothing of the avatar takes effect any more and the world stops; inside the one contact that kills, both sides still hurt each other. The hard part is that a step stops in the middle: decide and write what the frozen state holds (the frame count, so the snap of the death is recorded; the Biters killed earlier in that step; hitboxes that moved and those that did not), so that `crossCheck` still returns null on a history that ends there. Tests: the scene of finding R2.1 (no shot, no blow, no later slam after the killing contact), a death by a Rock in the object stage, and `crossCheck` over a death. Closes 28 and 30.

### [ ] S1. `repeat` and `scale` go away; weight only in melee (model: sonnet; issue 45, and R4.5 of issue 48)

**Files:** `src/data.js`, `src/sim.js`, the tests and their README, `AGENTS.md`, `docs/base-plan.md`.
Remove both keys everywhere: the data, `REPEATS`, `SCALES`, `checkRepeat`, `checkScale`, `CHECK_ATTACK_KEY`, the three key lists, tests 195 to 198 and the assertions that read the keys (name each old test changed). New check in `assertValidDefinitions`: a `perWeight` above 0 only on a melee attack (the body slam, a bite, a `melee`), never on a `weapon`; one test with `loadError`. `DEFINITIONS_VERSION` and the fingerprint. The whole-state tests change only by the two keys leaving the state: say so in the report. Closes 45.

### [ ] F2. How a hitbox hits: the first on its path, or all it touches (model: fable; issues 43 and 44)

**Files:** `src/data.js`, `src/sim.js`, the tests and their README, `AGENTS.md`, `docs/weapons.md`.
The user's rule: a hitbox says how it works; a bullet hits only the first thing its path meets in that frame, actors and objects alike; the sword hits all it touches, Rocks and Shrooms included; nothing is hurt twice by the same hitbox in the same frame. Proposal to confirm with the user before building (one question): the key `hits: "first" | "all"` on the attack, checked like the other shared keys. The hard parts: "first on the path" needs the order along the movement of this frame, not the order of a list; things that cannot be hit (ignored tags, the maker, no health, already struck) are not "first"; pierce above 0 goes on to the next thing in a later frame. Tests: the two mirror scenes of finding R3.1, a cone over two Biters and a Rock (three lines), a pierce 1 bullet over two Biters. Tests 178, 180 and 182 keep passing because the bite gets `hits: "all"` (say so, and ask the user if a bite should be "first"). Closes 43 and 44.

### [ ] S2. A hit of 0 is a hit, written and tested (model: sonnet; issue 46, the rest of issue 48)

**Files:** `AGENTS.md`, `src/sim.js` (comments only), the tests and their README.
"Damage" in `AGENTS.md` says it in the user's words (issue 46); the comment of `finalAttack` is fixed; one test with the three scenes of finding R5.1, as they behave today. Closes 46 and 48.

### [ ] C2. The parked question leaves the issues (coordinator; issue 34)

**Files:** `AGENTS.md`.
Move the parked question of issue 34 (what points below 0 mean, to be asked when the first thing that lowers a resistance is designed) to "Known weaknesses", in one line. Close 34.

### [ ] Q1. The user answers issue 47 (the user; then model: opus)

He has played with the Branches. One question, with the measurements of the comment of 2026-11-14: does a weightless thing break at the first touch, and for every actor or only for what can hurt objects? Then opus builds the answer (a rule of its own beside `crushObject`, or only docs and test 208 kept), and the Branch stays or leaves the data as he says. Closes 47.

### [ ] F3. The action model is closed as a direction (model: fable, as the Plan or Review desk; issue 13)

**Files:** `AGENTS.md`.
After F2: steps 0 to 5 of issue 13 are built or decided (step 4's second half was decided by issue 45: the impact stays in the body slam's own formula). Rewrite the action model's status in `AGENTS.md` (what is built, with the tests), list what waits for its first content (aggro, heal, buff, aura, summon, friendly fire as data), and close 13. From here on each of those is opened as its own issue when its content comes.

## The Screen desk's parcels (a Screen desk conversation, the same loop)

| Parcel | Issues | Model | What |
|---|---|---|---|
| T1 | 52 | haiku | A color for the Branch. |
| T2 | 26, 41 | sonnet | The COMBAT REPORT: no minimum damage; both calculations of a shield-breaking hit with `overflow`; hits of 0 shown apart (finding P2.3). |
| T3 | 25, 42, 49 | sonnet | The death on the screen, by the user's answer in issue 42: the buttons stay, the state freezes, back and forward still work, no more frames run or render, no `resume` line; play from an earlier frame goes on (the history is a debugger for now). After F1. |

The user checks T2 and T3 in the browser; nothing else can.

## The gate: when the base is solid

A last pass of the Review desk (Fable), after everything above:

1. No open issue, except new ones for future content.
2. `node --test`: 0 failing; every test added by this plan was seen failing (the mechanical check).
3. `AGENTS.md`: every "not built" that is left is future content, not a hole (the damage trace, parts by seed, the action model's later effects).
4. The measurements of finding R6.1 run again (40, 500, 1000 Biters) and written with their date, as the baseline of the next phase.
5. The user plays both chambers and says the word.
