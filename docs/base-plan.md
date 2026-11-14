# The base plan

Written on 2026-11-14 by the Rules desk, at the user's request: a mechanical plan that a coordinator on a small model follows by calling helpers on the right model for each parcel. The user passes everything through the Review desk afterwards.

Only parcels that make the base solid are here. No new content (the Vermin Queen, aggro, minions, auras wait).

## The coordinator's loop

Do exactly this, one parcel at a time, in the order of the list. Never two helpers at once.

1. `git pull --rebase`, then `node --test 2>&1 | grep -E "^not ok|^# (pass|fail)"`. It must say `# fail 0`. Write down the `# pass` number. If it fails, stop and call the user.
2. Take the first parcel not marked `[x]`. If it says **coordinator**, do it yourself. Otherwise call one helper (the Agent tool, `subagent_type: "general-purpose"`, `model`: the model of the parcel, `run_in_background: false`) with the text of "What to tell every helper" followed by the whole text of the parcel.
3. When the helper comes back, check, in this order:
   - `node --test 2>&1 | grep -E "^not ok|^# (pass|fail)"` says `# fail 0`, and `# pass` grew by the number of new tests.
   - `git status --short` shows only files in the parcel's **Files** line.
   - The helper's report has a "broke it once" proof: what it changed, which new test failed, and that it put the code back.
4. If a check fails: call a helper one model up (haiku, then sonnet, then opus, then fable) with the same text plus the error. If that also fails: `git stash -u` (nothing is lost), stop and call the user.
5. If all checks pass: mark the parcel `[x]` in this file, `git add -A`, commit with the message `Rules desk: base plan, <the parcel's title> (test <numbers>)` ending with the attribution lines your session was given, then `git pull --rebase`, the tests once more, `git push origin HEAD:main`.
6. Comment on issue 13 in one line: the parcel, the commit, the tests (`gh api repos/dupuqub/varpg/issues/13/comments -f body="..."`).
7. Tell the user in one or two lines, in Brazilian Portuguese, and go to the next parcel.

## When to stop and call the user

- The tests fail before a parcel starts.
- A parcel failed twice (rule 4).
- A helper says it needs a decision, or that the parcel's text does not match the code.
- A file of another desk would have to change (`src/render.js`, `src/input.js`, `src/main.js`, `src/chamber-0.js`, `index.html`, `style.css`, `README.md`).
- A push is refused twice.
- A parcel under "Blocked" is the next one.

## What to tell every helper

> You are a helper of the Rules desk of varpg, working in the repository of this session. Read in `AGENTS.md` the sections "How to work on this project" and "Patterns that work here", then do only the parcel below, from `docs/base-plan.md`.
>
> Rules:
> - Change only the files in the parcel's **Files** line.
> - The game must behave as before, except for what the parcel says.
> - Add each new test at the end of `tests/agent/sim.test.js` with the next free number, and one row per test in the table of `tests/agent/README.md` (test 112 checks this).
> - Break it once: change the new rule, see the new test fail, put the code back.
> - Update `AGENTS.md` where the parcel says, and "Code layout" if you added or renamed a function (test 152 checks the names).
> - Finish only when `node --test` says `# fail 0`.
> - Do not commit, do not push, do not touch issues.
>
> Report at the end: the files you changed, the numbers of the new tests, the break-once proof (what you changed and which test failed), and anything you were not sure of.

## The parcels

### [ ] P1. The avatar's death: the mission is aborted (model: sonnet)

**Files:** `src/sim.js`, `src/history.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

The user's word (2026-11-14): when the avatar has no health, an "abort mission" alert (the pilot ejects). The screen is the Screen desk's (P3). The rule is this parcel:

1. The state gets `mission: "running"` where it is made (`createChamberState`), with a comment.
2. At the end of `step`, after `removeDestroyed`, if the avatar's `health.now <= 0`: `state.mission = "aborted"`.
3. `step` returns at its first line when `state.mission === "aborted"`: the state, the visual and the audit stay as they were.
4. `recordFrame` (`src/history.js`) does not record a state whose `frame` is the same as the last snap's (a state that did not advance is not recorded twice).
5. The parameter `living` of `pickTarget` goes away: it always skips an actor with no health. `think` stops passing `false`. Fix the callers, the comments, and the tests that pass it (184 and 188 at least).

**Tests (new):** a step that ends with the avatar at zero health says `aborted`, and one that does not says `running`; a step on an aborted state changes nothing (the JSON of the state is the same and the audit has no new line); `recordFrame` on a state that did not advance leaves the history as it was.

**Known effect (tried once, 2026-11-14):** with rules 2 and 3 alone, only test 160 fails: it plays 3000 frames of Chamber 2 and the avatar dies on the way, so the fight stops. Do not weaken a test: where a test needs the fight to go on, keep the avatar alive in that test (a very large health set by hand) and say so in its row.

**AGENTS.md:** in the list "Answered by the user (2026-11-14)", say the rule of the avatar's death is built and name the tests; take the mentions of `living` out; fix the lines that say the avatar's death is not decided ("Damage", "Destruction", "Open items").

### [ ] P2. A body slam does not hurt what has no health (model: haiku)

**Files:** `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

The review's point 10 (`docs/review-2026-11-13.md`): hitboxes skip a target with no health, body slams do not. One rule for both: in `slamActor`, return at once (no damage, no audit line) when `target.health.now <= 0`.

**Test (new):** a Biter with its health set to 0 by hand, the avatar dashes into it: the audit has no line with that Biter as the target; the same scene with health 1 has one.

**AGENTS.md:** one line in the section "Damage".

### [ ] P3. The issue for the Screen desk (coordinator, after P1)

Open one issue and mark this parcel done (no tests, no helper):

```
gh api repos/dupuqub/varpg/issues -f title="Screen desk: the abort mission screen" -f "labels[]=desk:screen" -f body="From the Rules desk (the user's word, 2026-11-14). When state.mission is \"aborted\" (the avatar has no health; built in the base plan, parcel P1), show an ABORT MISSION alert with one button back to the menu, and stop calling step and recordFrame. For now it is only that screen, for Chamber 2. Lore: the pilot ejects and leaves the mecha. To know: a scripted run stops at that frame too, so COMBAT REPORT of Chamber 0 shows a shorter fight when the avatar dies."
```

### [ ] P4. `repeat` in every attack record (model: sonnet)

**Files:** `src/data.js`, `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

Read "The design of step 4" below first. Follow the example of commit `63c325f` (the key `exit`): same kind of change.

1. `src/data.js`: `constants.bodySlam.attack` gets `repeat: "contact"`; the bite, the weapon and the melee get `repeat: "life"`. `DEFINITIONS_VERSION` goes up by one.
2. `src/sim.js`: `const REPEATS = ["life", "contact"]` and a `checkRepeat` in the validator: a missing or unknown value is refused with a message that names the attack; and, until another case is built, the body slam must be `contact` and every other attack `life`.
3. The attack records carry `repeat` (the weapon's and the melee's are built by hand), and `spawnHitbox` copies it into the hitbox.
4. Nothing reads it to decide anything yet: the behavior is the same.

**Tests (new):** the validator refuses each bad case with its message; the records of the avatar, of the Biter and of a Rock carry the right value, and so does a hitbox. Update the tests that compare the shape of an attack record or of a hitbox, and the fingerprint of test 129 (version and hash).

**AGENTS.md:** the hitbox's list of fields in "Actor", and one line in "Shots and objects" or "Damage" pointing to this plan's design.

### [ ] P5. `scale` in every attack record (model: sonnet)

**Files:** the same as P4.

The same change as P4 with another key: `constants.bodySlam.attack` gets `scale: "impact"`, the bite, the weapon and the melee get `scale: "none"`; `const SCALES = ["none", "impact"]`, `checkScale`; until another case is built the body slam must be `impact` and every other attack `none`. The records carry it; the hitbox does not need it (its damage is frozen at its birth). `DEFINITIONS_VERSION` goes up by one. The behavior is the same.

**Tests (new):** as P4, for `scale`.

### [ ] P6. One function lands a hit (model: sonnet)

**Files:** `src/sim.js`, `tests/agent/sim.test.js`, `tests/agent/README.md`, `AGENTS.md`.

Today three places resolve, apply and record a hit: `slamActor`, `slamObject` and the loop of `resolveHitboxes`. Make one function, `landHit(state, audit, sourceName, attackName, packet, target)`: `resolveDamage`, then `applyDamage` for an actor or `damageObject` for an object, then `recordHit`; it returns `{ resolved, taken, broken }`. The three places call it. The state and the audit of every run must be exactly the same as before (the suite proves it: do not change any expected value).

**Test (new):** `landHit` on an actor (the shield first, then the health, one audit line) and on a Rock (`damagedObjects`, one audit line, `broken` true when it reaches 0).

**AGENTS.md:** "Code layout" (the new function) and one line in "Damage".

## Blocked: needs the user's answer, do not build

- **B1. "Closest" measured to the edge of the body.** One line in `pickTarget`: order by the distance between the centers minus the radius of the candidate. He asked what it costs (one square root per candidate). **Decided 2026-11-14: "Queria que fosse pela borda"; built, test 201.**
- **B2. The shield's resistance on the part of a hit that goes through to health** (the review's point 9): keep it and write it down, or change it. No answer yet.

## The design of step 4 (for P4, P5 and P6)

The user's words (2026-11-14): what can be a target is an actor, what only hurts is a hitbox; the body of an actor is itself a hitbox, and the object inside the actor only says how that body hurts. It carries no radius: the radius is the actor's.

That object already exists: `actor.attacks.bodySlam`. Step 4 gives it, and every other attack, the same keys, so the body and a hitbox are described by one "hurting module":

| Key | The body (`attacks.bodySlam`) | A hitbox's attack (bite, weapon, melee) |
|---|---|---|
| damage | `now`, per type | `now`, frozen into the hitbox at its birth |
| `ignores` | the tags its body does not hurt | the tags the hitbox does not hurt |
| `repeat` | `contact`: once per new contact (`state.contacts`) | `life`: each target once in the hitbox's life (`struck`) |
| `scale` | `impact`: times the impact, over `referenceImpact` | `none` |

The two paths of the code stay (the contact of bodies, and the hitboxes): the module is what each reads. The validator accepts only the cases that are built, as it does for `target.pick` and `exit`; a new case (a hitbox that hurts again every N frames, for an aura or a puddle) is added when its first content comes.

## After the last parcel

Tell the user the base plan is done and ready for the Review desk, with the list of commits.
