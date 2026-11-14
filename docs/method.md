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
2. **Tests decide, not the helper.** The coordinator runs `node --test` before and after each parcel. It must end with `fail 0`, and the number of passing tests must grow by the number of new tests.
3. **Break it once.** A new test must be seen failing with the new rule broken, and passing again when it is put back. Without this, a test can be green for the wrong reason.
4. **One parcel at a time.** Helpers share the working tree, so nothing runs in parallel.
5. **Nothing is lost on failure.** A parcel that fails twice is stashed (`git stash -u`), and the coordinator stops and calls the user. The helper is never allowed to commit or push.
6. **A helper that is interrupted leaves the tree dirty.** The coordinator checks `git status` and the diff before it does anything else. Here the one interruption (a server stop during parcel P6) left a half-made change; it was checked and the tests passed before the commit.
7. **The coordinator checks the work it did not do.** It reads the diff, runs the suite, and confirms that only the files of the parcel changed.
8. **Blocked parcels stay blocked.** A parcel that waits for the user's decision is written as blocked and is never built by a helper on its own.
9. **Each parcel leaves a note.** The commit message says what the parcel is and which tests it adds; the issue for the desk that owns the work gets a one-line comment.

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
- Six parcels (P1 to P6) went in one at a time, each closed with its tests green and a break-once proof.
- Sonnet helpers did P1, P4, P5 and P6. A Haiku helper did P2. One Screen issue (P3) was opened by the coordinator.
- One helper was interrupted by the server stop, and the coordinator recovered from the half-made change.

**Not proven yet:**
- A Haiku **coordinator** running the checklist on its own. The base plan was driven by the Haiku model for the checks, but the design work (the recipes) was written by a stronger model. The first real test of a Haiku coordinator on a parcel that needs judgement has not happened.
- The **Review** of the blocks. The rule was that a stronger helper reviews each block; in the base plan that review was left to the Review desk, which the user calls himself.
- Measured cost and time per parcel. The durations in the helpers' reports were recorded but not compared.

## Where the parts live in the repository

- `docs/base-plan.md`: the plan of the base, its parcels, their recipes and their models, and the loop the coordinator follows.
- `docs/desks.md`: which conversations (desks) exist, what each may change, and how they talk through GitHub issues.
- `AGENTS.md`: the rules of the project, with a pointer to this file.
