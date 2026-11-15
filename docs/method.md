# The method: small parcels, a coordinator, helpers on the right model

Written on 2026-11-14 by the Rules desk, at the user's request, to make the way this project is built public and repeatable. It describes what was done in the base plan (`docs/base-plan.md`) and what is still unproven.

## The idea

A big change is cut into **parcels**: small pieces, each one closed on its own (tests green, one commit, one push, one note). The work is done by a **coordinator** that follows a written checklist, and the parcels are written by **helpers**, each on the model that fits the parcel's difficulty. A stronger model reviews each block afterwards, and the user reviews the rest.

## The roles

| Role | Who | What it does |
|---|---|---|
| The user | a person | decides what the game is; answers the questions that only he can answer; calls the Review desk |
| Coordinator | a conversation (any model; it was Haiku in the base plan) | runs the checklist of `docs/base-plan.md`: tests, parcel, helper, checks, commit, push, note |
| Helper | a sub-agent, on the model the parcel asks for | builds one parcel from its written recipe, changes only the files of the parcel, breaks the new rule once to prove the test |
| Reviewer | the Review desk, or a stronger helper | reads each block after it is closed; it did not see the work being made |

## The rules that make it work

1. **A parcel has a recipe written before it starts**: the files it may touch, what changes, the tests it adds, the note it leaves. A helper that gets a vague task produces a vague result.
2. **Tests decide, not the helper.** The coordinator runs `node --test` before and after each parcel. It must end with `fail 0`, and the number of passing tests must grow by the number of new tests. The coordinator also lists the old tests whose body or title changed (`git diff` on `tests/agent/sim.test.js`), and each must be named in the helper's report with its reason. This is a mechanical check any model can run (issue 40).
3. **Break it once.** A new test must be seen failing with the new rule broken, and passing again when it is put back. Without this, a test can be green for the wrong reason. The coordinator now does it mechanically: `git stash push -- src`, run the suite, `git stash pop`; the new tests must fail on the old `src/`, and the commit says so in a line `Fails without the change: tests <n> (<what was broken>)` (also in the issue comment). Any model can run this check (issue 39). Judging a new test that passes on the old code (a structural parcel can have such tests) stays with a stronger model.
4. **One parcel at a time.** Helpers share the working tree, so nothing runs in parallel.
5. **Nothing is lost on failure.** A parcel that fails twice is stashed (`git stash -u`), and the coordinator stops and calls the user. The helper is never allowed to commit or push.
6. **A helper that is interrupted leaves the tree dirty.** The coordinator checks `git status` and the diff before it does anything else. Here the one interruption (a server stop during parcel P6) left a half-made change; it was checked and the tests passed before the commit.
7. **The coordinator checks the work it did not do.** It reads the diff, runs the suite, and confirms that only the files of the parcel changed.
8. **Blocked parcels stay blocked.** A parcel that waits for the user's decision is written as blocked and is never built by a helper on its own.
9. **Each parcel leaves a note.** The commit message says what the parcel is and which tests it adds; the issue for the desk that owns the work gets a one-line comment. Both carry the line `Fails without the change: tests <n> (<what was broken>)`, or `No src change.` (issue 35). Writing the line is a mechanical check any model can run; judging a reason given for a new test that passes on the old code stays with a stronger model.
10. **A stale file outside the Files line is carried forward.** When the report or the commit names a file that the parcel did not list (R7.5, the base plan's P1 left out `docs/step-order.md`), the coordinator adds a line under the parcel, or a new parcel, before going on.
11. **Every recipe is read against the code before the loop starts.** A model of the band of the recipe's writer reads it against the code, and leaves one line per recipe: "read against the code at commit X". Reading the recipe is the part a weaker coordinator cannot do alone (R7.8, opinion).

## The models

The base plan chose the model per parcel, by a weight from 0 to 10, and the bands were:

| Weight | Model |
|---|---|
| 0 to 2 | Haiku 5.5 |
| 3 to 5 | Sonnet 5.5 |
| 6 to 7 | Opus 5.5 |
| 8 to 10 | Fable 5.2 |

The weights are the coordinator's estimate, not a measurement. A parcel that a model cannot finish twice moves up one band.

## What is proven and what is not

**Proven in the base plan (2026-11-14):**
- Five parcels with tests (P1, P2, P4, P5, P6) went in one at a time, each with its tests green. P3 was an issue for the Screen desk, not a parcel with code.
- The commits show the model of the conversation that committed: P1 and P2 Haiku 5.5, P4, P5 and P6 Sonnet 5.5. All of them were in the session of the plan. Whether each helper was the same model is not recorded: the helpers' reports are not kept.
- One helper was interrupted by the server stop, and the coordinator recovered from the half-made change.
- **The user's word (2026-11-14):** Haiku has coordinated helpers many times in this project, so the Haiku coordinator is not new.

**Not proven yet:**
- A Haiku **coordinator** running a whole list of parcels on its own, with the checks of step 3 written in the loop. The first run of the issues plan (`docs/issues-plan.md`) is the test of that.
- The **Review** of the blocks. The rule was that a stronger helper reviews each block; in the base plan that review was left to the Review desk, which the user calls himself.
- Measured cost and time per parcel. The durations in the helpers' reports were recorded but not compared.

## Where the parts live in the repository

- `docs/base-plan.md`: the plan of the base, its parcels, their recipes and their models, and the loop the coordinator follows.
- `docs/desks.md`: which conversations (desks) exist, what each may change, and how they talk through GitHub issues.
- `AGENTS.md`: the rules of the project, with a pointer to this file.

## Measured afterwards, 2026-11-14

The break-once was not done mechanically in the base plan (issue 35). Afterwards, in a copy at `00dcce4`, for each parcel commit C: `git checkout C && git checkout C~1 -- src && node --test`, which runs the tests of C against the `src/` of the commit before it. This shows that the new tests **can fail**. It does not show that the break-once was done at the time, and it is not a break of the specific rule: the whole `src/` went back.

| Parcel | Commit | New tests that fail on the old `src/` | New tests that pass there | Old tests that also fail |
|---|---|---|---|---|
| P1 | `28f6420` | 190, 191, 193 | 192 | none |
| P2 | `802b2d0` | 194 | none | none |
| P4 | `2111d09` | 195, 196 | none | 39, 75, 119, 129, 133, 163, 186 |
| P5 | `27fdf52` | 197, 198 | none | 39, 75, 119, 129, 133, 163, 186, 195 |
| P6 | `69114da` | 199, 200 | none | 152 |

- Test 192 (P1) passes on the old code: it tests the removal of the parameter `living` of `pickTarget` (its row says so), a structural change; the old default already gave the same answers. Opinion, not checked further: judging it stays with a stronger model.
- The old tests that fail in P4 and P5 are consequences of putting the older `src/` back (the data, the version and fingerprint of test 129, the attack records); the reasons were not investigated one by one. Test 195 (from P4) fails in P5 for the same cause.
- In P6, test 152 fails because the "Code layout" of `AGENTS.md` names `landHit`, which the older `src/` does not have (read from the test's title, not checked in the code).

## Which changes go through a parcel

A parcel is the way for a change to the rules that a helper can build from a written recipe. Some changes are decided in conversation with the user and are made directly by a stronger model, without a helper: examples are `568d40d` ("closest" by the edge, test 201), `6bdcb12` (a hit that breaks the shield, test 202) and `ccab4ac` (no minimum damage). A direct change still writes its break-once in the commit message, as those three did ("Fails without the change"). Everything else goes through a parcel.
