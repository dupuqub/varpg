# The issues plan

Written on 2026-11-14 by the Rules desk (Opus 5.5), at the user's request: every open issue, cut into parcels, each with the model that should do it. A coordinator on a small model (Haiku) follows the loop below and calls helpers. Fable is not available: the models are **haiku, sonnet and opus**. The method is `docs/method.md`.

The issues were read at commit `00dcce4` (after the review of 2026-11-14, `docs/review-2026-11-14.md`). Each parcel names its issue: the helper reads the issue itself (`gh api repos/dupuqub/varpg/issues/<n> --jq .body`) and does its "To do", limited by what the parcel says.

## The coordinator's loop

The loop of `docs/base-plan.md`, with three checks the review asked for (issues 35, 39, 40). One parcel at a time, in the order of the list. Never two helpers at once.

1. `git pull --rebase`, then `node --test 2>&1 | grep -E "^not ok|^# (pass|fail)"`. It must say `# fail 0`. Write down the `# pass` number. If it fails, stop and call the user.
2. Take the first parcel not marked `[x]` in this file. If it says **coordinator**, do it yourself. Otherwise call one helper (the Agent tool, `subagent_type: "general-purpose"`, `model`: the model of the parcel, `run_in_background: false`) with the text of "What to tell every helper" in `docs/base-plan.md` (read "this file" there as `docs/issues-plan.md`), followed by the whole text of the parcel.
3. When the helper comes back, check, in this order:
   - `node --test 2>&1 | grep -E "^not ok|^# (pass|fail)"` says `# fail 0`, and `# pass` grew by the number of new tests the helper named.
   - `git status --short` shows only files in the parcel's **Files** line.
   - **Old tests changed (issue 40):** `git diff -U0 tests/agent/sim.test.js | grep '^@@.*test("'` and `git diff tests/agent/sim.test.js | grep '^[-+]test("'` list the old tests whose body or title changed. Each must be named in the helper's report with its reason.
   - **Break-once, mechanically (issue 39):** if the parcel changed anything under `src/`, run `git stash push -- src`, then `node --test 2>&1 | grep -E "^not ok|^# (pass|fail)"`, then `git stash pop`. The new tests must fail on the old `src/`. A new test that passes there must be named in the helper's report with its reason (a structural parcel can have such tests); if it is not named, it is a failed check. Run the suite once more after `git stash pop`: `# fail 0`.
4. If a check fails: call a helper one model up (haiku, then sonnet, then opus) with the same text plus the error. If opus also fails, or the parcel was already opus: `git stash -u` (nothing is lost), stop and call the user.
5. If all checks pass: mark the parcel `[x]` in this file, `git add -A`, commit with the message `Rules desk: issues plan, <parcel id> <title> (issue <n>, test <numbers>)`, a body that has one line `Fails without the change: tests <n> (<what was broken>)` (issue 35; for a parcel with no `src/` change write `No src change.`) and one line per old test changed with its reason, ending with the attribution lines your session was given. Then `git pull --rebase`, the tests once more, `git push origin HEAD:main`.
6. Comment on the parcel's issue in one line: the parcel, the commit, the tests, the "Fails without the change" line (`gh api repos/dupuqub/varpg/issues/<n>/comments -f body="..."`). If the parcel finishes the issue, close it (`gh api -X PATCH repos/dupuqub/varpg/issues/<n> -f state=closed`). Never close an issue that is only partly done.
7. Tell the user in one or two lines, in Brazilian Portuguese, and go to the next parcel.

**Stop and call the user** in the cases of `docs/base-plan.md` ("When to stop and call the user"), and when the next parcel is under "Waiting for the user".

## The parcels (Rules desk)

### [x] I1. Mark the base plan's parcels done (coordinator; issue 31)

In `docs/base-plan.md` change `### [ ] P1.` to `### [x] P1.`, and the same for P2, P3, P4, P5, P6. No tests. Commit, comment on issue 31, close it.

### [x] I2. The loop's checks, written in the method (model: sonnet; issues 35, 39, 40)

**Files:** `docs/base-plan.md`, `docs/method.md`.

1. Put into the loop of `docs/base-plan.md` the three checks of steps 3 and 5 of this file (old tests changed, break-once mechanically, the "Fails without the change" line in the commit and in the issue comment). Say in `docs/method.md` (rules 2, 3 and 9) that these are now mechanical checks any model can run, and that judging a new test that passes on the old code stays with a stronger model.
2. Issue 35, "for the past": in a copy (`git worktree add /tmp/rebuild 00dcce4`), for each parcel commit C of P1, P2, P4, P5, P6 (`28f6420`, `802b2d0`, `2111d09`, `27fdf52`, `69114da`): `git checkout C && git checkout C~1 -- src && node --test`, and write which new tests fail. Write the result in `docs/method.md` as "measured afterwards, 2026-11-14", saying it shows the tests can fail, not that the break-once was done. Remove the worktree.

No new tests (docs only). Closes issues 35, 39, 40.

### [x] I3. What the method has proven, and who makes direct changes (model: haiku; issues 36, 38)

**Files:** `docs/method.md`.

Issue 36: move to "Not proven yet" the lines about which model each helper was and about the recovered interruption; write what the commits do show: the `Co-Authored-By` line of P1 and P2 is Haiku 5.5, of P4, P5 and P6 Sonnet 5.5, all in the session of the plan; write "five parcels with tests" (P3 was an issue); fix "The roles" where it says the coordinator was Haiku. **The user's word (2026-11-14):** Haiku has coordinated helpers many times in this project. Write that in "What is proven" as his statement, with the date; what the repository cannot show is only which model each single helper was, because the helpers' reports are not kept. Read the commits with `git log --format='%h %s%n%b' 28f6420 802b2d0 2111d09 27fdf52 69114da -5` to check before writing.

Issue 38, one paragraph: a change of a formula the user decides in conversation (examples: `568d40d`, `6bdcb12`, `ccab4ac`) can be made directly by a stronger model, without a parcel; it still writes its break-once in the commit message, as those three did. Everything else goes through a parcel.

No new tests. Closes issues 36 and 38.

### [x] I4. The order of a step says how the mission ends (model: haiku; issue 30, in part)

**Files:** `docs/step-order.md`.

Add stage 8 to the table (`if (player.health.now <= 0) state.mission = "aborted"`, after the frame is counted; the next `step` returns at its first line); add to the rules that follow from the order that an aborted state does not advance (test 191); fix row 6: the avatar stays in the scene and ends the mission. **Do not touch** the line "whoever died in this step does not strike": it waits for the user's answer to issue 28. Comment on issue 30 that this part is done and the rest waits for 28; do not close it.

### [x] I5. Comments of `src/sim.js` that say more than the code (model: haiku; issue 48, part 1)

**Files:** `src/sim.js`.

From issue 48, only: R1.2 (`think`), R1.8 (split the comment above `pickTarget` and `tagIndex`, and write "closest is measured to the edge of the body", the user, 2026-11-14), R5.6 for `landHit` and R5.3 for `combatAuditHitLine` (name `overflow` and each of its fields). **Not** the `finalAttack` comment (it waits for issue 46). Comments only: no line of code changes; the suite must be the same. No new tests. Comment on issue 48 which findings are done.

### [x] I6. AGENTS.md and the docs against the code (model: haiku; issue 48, part 2)

**Files:** `AGENTS.md`, `docs/weapons.md`, `docs/review-2026-11-13.md`, `docs/method.md`.

From issue 48, only: R2.5; R3.5 for the docs (objects have no resistance; "objects that block a bullet" is built; add the Biter to the actors in "The world: seed and objects"; close the open item about bullets and objects in `docs/weapons.md` with the user's answer of 2026-11-14); R5.6 the sentence in "Shield"; R5.5 delete points 8, 9, 10, 11 of `docs/review-2026-11-13.md`; R7.5 and R7.8 in `docs/method.md`. **Not** the mentions of `damageOf` (parcel I10) and **not** R4.5 (waits for issue 45). No new tests. Comment on issue 48.

### [x] I7. Test titles that claim more than the test checks (model: sonnet; issue 48, part 3)

**Files:** `tests/agent/sim.test.js`, `tests/agent/README.md`.

From issue 48, only R1.1 (test 200), R1.5 (test 189), R1.6 (test 192: prefer asserting the claims, one `think` and one `fireWeapons`, over narrowing the title), R2.3 (test 160). Change each title and its row in the same commit. No new tests; the four changed tests are the "old tests changed" of the check. Comment on issue 48.

### [ ] I8. Test 192 covers the indexed path of `pickTarget` (model: sonnet; issue 37)

**Files:** `tests/agent/sim.test.js`, `tests/agent/README.md`.

Do issue 37's "To do". Break-once by hand (the mechanical check does not apply: no `src/` change): apply the mutation the issue gives, see the test fail, put it back; write it in the report. Closes issue 37.

### [ ] I9. Resistance points must be finite (model: haiku; issue 34, the part "to do now")

**Files:** `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

In `assertValidDefinitions`, refuse `resistance` and `shieldResistance` points that are not finite (`Number.isFinite`), with a message like the one for negative points. One new test with `loadError` (see test 181 for the pattern): a part with `Infinity` blunt resistance is refused. One line in `AGENTS.md`, "The kit of parts", beside the resistance. The parked question of the issue stays parked: comment on issue 34 that the check is done and the question waits; do not close it.

### [ ] I10. `damageOf` goes away (model: sonnet; issue 48, part 4)

**Files:** `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

From issue 48, R3.5 for the code: move the tests that call `damageOf` to `resolveDamage(finalAttack(...), target).total` (the same numbers, so the same assertions), delete `damageOf`, fix the comments above `collideWithObjects` and `touchActors` and the mentions in `AGENTS.md` ("Damage", "The Dummy", "Code layout"). The whole-state tests must not move. Comment on issue 48; if parts 1 to 4 are all done and only the parts waiting for issues 45 and 46 remain, say so and leave it open.

### [ ] I11. The audit says what an object really lost (model: sonnet; issue 29)

**Files:** `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

Do issue 29's "To do". The damage does not change, only the record: the whole-state tests must not move; the combat audit tests may (name them). Closes issue 29.

### [ ] I12. One rule for "a target with no health takes no hit" (model: opus; issue 32)

**Files:** `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

Do issue 32's "To do". The hard part: `resolveHitboxes` filters before it marks `struck` and spends a pierce, so moving the guard into `landHit` alone would change when a pierce is spent. Choose where the one function is asked so every whole-state test stays bit for bit the same, and say in the report why that place. New test: `landHit` twice on the same Rock with an overkill writes one line and says `broken` once (or the equivalent for the place chosen). Closes issue 32.

### [ ] I13. One function builds an attack record (model: opus; issue 33)

**Files:** `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

Do issue 33's "To do". Structure only: every whole-state test bit for bit the same; keep the order of the keys in the records (the JSON of a snap must not change, or test 129's neighbours and the snap tests move). New test: a recipe that misses a shared key is refused in each of the four places by the one check. Closes issue 33. Do it before any answer to issue 45 is built.

### [ ] I14. Weightless Branches, 10% of the objects (model: opus; issue 51)

**Files:** `src/data.js`, `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

Do issue 51's recipe. The hard part: a weight per kind changes which kind every square gets, so Rocks the tests rely on (seed 1, `small:0,1` and the others in `tests/agent/README.md`, "Known answers") may become Shrooms or Branches. Prefer a pick that keeps every square that does not become a Branch exactly as today (for example: a separate roll with its own salt in `SALTS` decides the 10%, and the rest keeps today's roll), and say in the report which known answers moved and why. Raise `DEFINITIONS_VERSION` and the fingerprint of test 129. The drawing is the Screen desk's: the helper does not touch `src/render.js`; the coordinator opens the issue of parcel S3 after the commit. Comment on issue 51 and close it.

### [ ] I15. Tell the user the plan is done (coordinator)

One message in Brazilian Portuguese: the parcels done, the issues closed, and that the parcels below wait for his answers. The Review desk reviews afterwards (the user calls it).

## Waiting for the user (do not start)

One question at a time, the one that unblocks most first. The model is the one that builds the answer.

| Issue | Question | Unblocks | Model after the answer |
|---|---|---|---|
| 28 | The avatar killed by a body slam: does it still act in the rest of that step? | The rest of issue 30 (I4) | opus (the order of a step) |
| 45 | `repeat` and `scale`: obey them, take them out, or keep them as labels? | Step 4 of issue 13; R4.5 of issue 48 | (a) opus, (b) sonnet, (c) haiku |
| 46 | Is a hit with no damage still a hit? | The `finalAttack` comment of issue 48 | sonnet |
| 43 | A shot touching several things in one frame: which takes the hit? | — | (a) opus, (b) haiku, (c) sonnet |
| 44 | Does the sword's blow hurt Rocks and Shrooms? | — | haiku (a test, or one tag in the data) |
| 47 | Does a weightless thing always break at the first collision? | Best answered after playing I14 | (a) haiku (docs), (b) sonnet |
| 42 | After the death, can the history go back past it? | S2 (Screen desk) | Screen desk, sonnet |

## The Screen desk's parcels (for a Screen desk conversation, not this coordinator)

The coordinator of the Rules desk does not touch these files. The user opens a Screen desk conversation and gives it this list; the same loop applies, with the Screen desk's files.

| Parcel | Issues | Model | What |
|---|---|---|---|
| S1 | 26, 41 | sonnet | The COMBAT REPORT drops "the minimum counted in" and prints both calculations of a hit with `overflow`. |
| S2 | 25, 49 | sonnet | The ABORT MISSION screen in Chamber 2 (stop calling `step` and `recordFrame`), with no `resume` line on an aborted state. Whether the history can go back past the death waits for issue 42; build it so the buttons are hidden behind the abort screen, the simplest reading to change later. |
| S3 | the issue opened after I14 | haiku | A color for `branch` in `OBJECT_COLORS` of `src/render.js`. |

## Not a parcel

Issue 13 (the action model) is the direction, not work: it stays open. Its next step, the body's object as a hitbox, waits for the answer to issue 45.
