# Handoff, open items, ideas, publishing and patterns

## Handoff (rewritten 2026-11-12, by one agent for the next; stale statements fixed 2026-11-16, issue 69)

What to keep in mind when picking the work up. Rewrite this section when it is stale; it is the first thing a new conversation reads after the top of the file.

**State of the work.** The tests pass (243 on 2026-11-16) and the README table matches them (test 112 checks it). The open issues are on GitHub (`gh api "repos/dupuqub/varpg/issues?state=open"`). The last things built, newest first: the tuning of Chamber 2, 48 Biters and a bite 20% stronger (issue 68); the spawn events of the maps, with the Dummies of Chamber 1 born through them (issues 60 to 62); the journal, the name of the combat log (issue 59); the weightless Branch, which breaks with anything (issues 47 and 51); the death of the avatar that stops the world, and the history past it (issues 28 and 42); the sword and the tags of exclusion; the Radar; fullscreen button; touch controls; the repository made public and published; pause, back and forward buttons with a history of two seconds; the shield of the Generator; the body slam as an attack recipe that follows the current weight; the repeater with ammunition that weighs; the Biter with windup and freeze. Each has its section above.

**What the user has tested and what he has not.** His rule (2026-11-12): **when he sends a message after something that needed testing, assume he tested it, unless he says otherwise.** By that rule Chamber 1 and the combat up to the repeater are tested and liked. Built after his last report and waiting for his word: the shield (its numbers are the agent's guesses), the touch controls on a real phone (stick radius, dead zone, whether fingers cover the game), fullscreen with the landscape lock, and the SIMULATION CHECK on his Android (the final position against the Node value in `tests/agent/README.md`; the ENVIRONMENT button already showed 60 callbacks per second there).

**Decided by an agent, for the user to confirm when it comes up (do not ask all at once)**

- Entering fullscreen on a phone also asks for the landscape orientation.
- The numbers of the shield, of the touch stick and of the repeater.
- The older ones: the size of the screen is written once more in the rules (`state.grid`), with a loud check against the canvas; cells are counted in the world; birth keeps the whole body off the screen and only the center inside the window; two actors of weight 0 split a push half each; `crushes` is copied from the `initial` of each actor's recipe.

**What the user said to wait for (do not build, do not push him):** nothing listed now (how enemies arrive, the array of a map, was decided and built in issue 61). **What he wants later and will ask for:** the bot and the small learned model ("Ideas"), options for left-handed players and accessibility, more desks (`docs/desks.md`).

**The agent's suggestion of what comes next, in order (his to choose):** (the record of a hit is stored now, in the journal); the bench of weapons with the simplest bot; then the melee families of `docs/weapon-families.md`.

**Properties to keep (tests guard them)**

- The grid gives exactly the state of testing every pair in list order (95, 98, 99, 110). If a change breaks that, it changed a rule, not only the speed: stop and tell the user.
- `actor.cells` is always right at the end of a step (100, 110), because the collision reads it from the actor.
- Most tests play in a game without Dummies (`withDummies(0)` in `tests/agent/sim.test.js`).
- The final position of the SIMULATION CHECK (README, "Known answers in the browser") changes with any rule; record the new one when it does.

**Open, for the user to decide (raise one at a time, when it comes up)**

The lists are in "Open items" above, in `docs/weapons.md` ("Open items") and in `docs/weapon-families.md` (six questions about melee). The question of the review about final functions (4.1) is answered: every calculated value is stored in its actor, static once and dynamic every frame (see "Actor" (docs/rules/actor.md)).

**Mistakes made in this stretch, so they are not repeated**

- The user said "let's try it, so I can see the feeling" and the agent started to build, when he only wanted the idea considered. When he says "try" or "see", say what would be built and confirm in one line before building; when he says he needs the implementation, build it.
- A patch of the data by `text.replace` stopped matching after the data changed, silently, and every test played with the full number of Dummies. `loadGame` now refuses any patch that changes nothing, and `patchOnce` refuses a text found zero or two times (test 111).
- An edit of `tests/agent/README.md` replaced a heading by accident, and once a commit went in before its docs. Read `git status` and the diff of the docs before committing.
- A claim was made from a random run that never met the worst case ("this cell size holds"). Only a case built on purpose, or a proof, shows a limit. Say which of the two a statement rests on.
- The user said "everything calculated is stored in its actor" and the agent built "everything is recalculated every frame", the weight included. Storing and recalculating are two questions; when a rule of his has two readings, say both in one line and ask which.
- A test said it checked the avatar's cells after a push, and it rewrote the cells before looking, so it could not fail. Breaking the code on purpose showed it. Always break the thing once and see the test fail.

## Open items

- **Agreed order of work (critical review of 2026-11-10):**
  1. The user played Chamber 1 (2026-11-11) and said everything was very good: the swarm, the push by weight, the birth and the damage rules are validated by play. He also tested the combat of Chamber 2 up to the repeater (2026-11-12) and liked the results; the shield and the touch controls were built after that.
  2. ~~Pause and one-frame advance~~ (built, 2026-11-12; see "Simulation" (docs/rules/state.md)).
  3. A **damage trace** of real hits on screen, each hit written as its own arithmetic, coming from the simulation itself. This replaces the idea of printing static arithmetic of the body slam in DATA, which would be one more copy of the numbers.
  4. Only then decide the known weaknesses listed in "Damage" (docs/rules/damage.md), "The kit of parts" (docs/rules/parts.md) and "Collision with still things" (docs/rules/world.md).
- The user has not yet confirmed in his Chrome the final position of the SIMULATION CHECK since inertia was added (the agent's Chromium value is in `tests/agent/README.md`, "Known answers in the browser"). The scripted run has no dash and never releases the keys, so the dash and the deceleration are only tested in Node; changing the script changes the final position.
- Parts still to come in the code: Magnet (nothing uses it yet). The recharge of the dash is built (`finalDashRechargeFrames` and `updateDash`; tests 30 and 57).
- The dash opening space (the push by weight exists; whether a dash pushes more is open); and the window as the universe for every actor (the invariant; the wrap exists for every actor except the avatar).
- **Huge actors (the user wants them: radii several times a cell, or more).** The grid already handles any radius (several cells per actor, tested with huge Dummies). Still open, and the user has not decided them: (1) the search of objects near each actor that moves (`objectsNear`, asked by `collideWithObjects` for every actor that moves, the avatar included) is the largest cost left in a step, and every layer of the ground adds a search (measured in `tests/agent/README.md`, "Cost of the layers"). **Decided by the user (2026-11-10):** the things that live in the **seed** are the scenery, and they too may one day be huge, so the ground is made of **layers** (see "The world: seed and objects" (docs/rules/world.md)); a huge layer has its own large squares and is rare. The rule of where a thing lives: what stays in place and is part of the scenery lives in the seed; what moves, or is summoned during a stage (each map has an array of spawn events, `spawns` in `DEFINITIONS.maps`, that says when, how many and which actors to summon, placed from the seed by `(seed, event, nth)`, with no retry, so the run is reproducible: issues 60 and 61), lives outside the seed, in the state, as the Dummies do. The mechanism is built and tested, and **no huge object exists in the definitions yet**. **Decided by the user (2026-11-10):** a huge actor never shows on both sides of the window. Every actor, whatever its size, wraps only when its **center** leaves the window (what `wrapIntoWindow` already does), and no actor will ever be larger than the space between what is on the screen and the edge of the window, so the jump always happens off screen. That makes the smallest margin between the screen and the edge of the window the limit of the radius of an actor. A test (101) reads every actor recipe in the definitions and fails if one allows a larger radius (the user asked for a test on the definitions, so such an actor cannot be made in the first place). It does not look at the objects, which do not wrap, and nothing stops code from writing a larger radius on an actor during a run. A new actor type, a change of the canvas or of the window must keep that test passing. A consequence to know: an actor that wraps can land on top of another one on the other side; the collision pushes them apart there, off screen, like any other overlap.
- Whether the radius of a hitbox follows the size of its owner. (Whether a hitbox is an actor is decided: see "Hitboxes" under "Actor" (docs/rules/actor.md). A bullet that can be destroyed would be a target, so an actor, when it exists.)
- A minimum time between two hits of the same pair (review 3.8): with a Biter biting every few frames while the avatar stands still it becomes real; to be felt in play.
- More behaviors of the Biter and of hitboxes (keep a distance, stand still, dash; hitbox that follows its owner). Built: the windup and the freeze of the Biter, and the hitbox that travels (the bullet).
- Move `src/data.js` to the library structure.
- Running the cross-check automatically.
- The user's second monitor is stuck near 60 Hz (parked; not a problem of the game).

## Ideas (agent proposals, not decided)

They only become decisions when the user approves.

- **Damage pipeline with recorded stages:** each stage notes what it did. It serves the audit page and testing synergies.
- **Step as a list of named phases**, for example: inputs, spawn, movement, collision, damage, remove the dead. No phase calls another, and the order is written in one place only.
- **Machine learning:** the source is the collection of snaps (the user's decision). Agent proposal: a separate export module that only reads the state and produces numeric data, and that never changes the simulation. Values ML will want (damage dealt in the frame, kills) should be numeric counters in the state. The reward definition and the observation format are left for when ML enters the project.
- **A bot, then a small learned model that tells how to play (the user's idea, 2026-11-12; later, not started; he will say when).** First a **bot**: a function that reads the state and returns the input of each frame, with a few simple policies (stand still, run from the closest enemy, dash when surrounded), played in Node with no screen. A run is `seed + blueprint + inputs`, so every game it plays is reproducible and can be played again by anyone. Then, from the games of the bot, a **small model** (the user knows Python) that gives **real information and weights about how to play**: which signals (enemies close, shield left, ammunition, weight) the choice of moving, dashing or standing depends on, and how much. The agent's reading, to confirm with him when it starts:
  - **Order:** bot and a table of results first (survival time, shield time up, kills, ammunition spent, damage taken per second), then episodes written as plain numbers, then the model. Each step is useful alone, and the table is also the bench of weapons already planned.
  - **What it is for:** to measure whether a number of `src/data.js` meets the target written beside it, and to compare weapons and blueprints on equal terms. It does not replace the user's feel of the game: a bot is a bad player in a specific way, and a model learns to play **for the reward it is given**, so a weak weapon may only mean a weak policy, and a reward that forgets something (the user's axis of the player's time, for example) will be exploited.
  - **A separate module that only reads the state** and writes numeric data (the existing note on machine learning); it never changes the simulation. Values the model will want, such as damage dealt and taken in the frame and kills, should be numeric counters in the state (the combat journal records every hit now, as text outside the state; those counters in the state do not exist yet).
  - **Python and the simulation:** the rules run in JavaScript, so the first bridge is the simplest: Node plays and writes episodes (a file of plain numbers per run), Python reads and trains. Playing inside the training loop needs a process that Python can ask for the next state, a later step.
  - **A side benefit:** a model that tries everything finds the holes in the rules (an input that makes nobody hit it, a build that ignores the weight limit). A hole it finds is a bug report, not a result.
  - Signal: **sound, with a cost**: the cost is the work of choosing the reward and the observation, which are decisions about the game and belong to the user.
- **Practical requirements for determinism:** randomness only from a seed stored in the state; no `Date.now` or `performance.now` inside the simulation; actors always processed in a fixed order; avoid `Math.sin`, `Math.cos` and `Math.pow`; state without `NaN`, `Infinity` or `undefined`.

## Publishing (2026-11-12, written by one agent for the next)

The user wants the game **online, to play anywhere (PC and phone) without a terminal**. **It is online and public** (checked 2026-11-16: `gh api repos/dupuqub/varpg` says `private: false`, and the runs of the `Pages` workflow end in success, with the step `deploy-pages` done). What is ready and what is left:

- **Ready:** `README.md` (a public face: early prototype, what exists, what does not, controls, how it is made, no license yet) and `.github/workflows/pages.yml`, which runs the tests and publishes `index.html`, `style.css` and `src/` to GitHub Pages on every push to `main`. **While the repository is private the job is skipped** (the free plan publishes only public repositories), so nothing fails; the repository is public now.
- **Done, the user's clicks (checked 2026-11-16):** (1) Settings, General, Danger Zone, Change visibility, public. (2) Settings, Pages, Source: **GitHub Actions**. (3) A first publication. The address is `https://dupuqub.github.io/varpg/`, and every push to `main` publishes it again. If a run fails, read its log before anything else (the usual cause is that the source of Pages is not **GitHub Actions**).
- **After it is public, check once:** open the address, Chamber 0, SIMULATION CHECK, and compare the final position with `tests/agent/README.md` ("Known answers in the browser"); on a phone it is the first real test of reproducibility on another processor. Touch controls exist (see "Movement and input" in docs/rules/movement.md), built on 2026-11-12 and not yet played on a real phone: ask him how they feel.
- **The history was rewritten (2026-11-12) to protect the user's personal email address**, before the repository was made public: every commit now has the author `34659544+dupuqub@users.noreply.github.com` instead of the user's personal address; the files of every commit are the same, the commit ids all changed (ids written in old conversations no longer exist). The old commits may still be stored at GitHub, unreferenced, until its own cleanup; the user was told and decided **it is not a concern** ("it is not terrible to have the email too"). Do not rewrite the history again without him asking. The agent's commits must keep the noreply address (`git config user.email` in the clone).
- **The user's own clone on his PC is stale** (it has the old history). He does not want to deal with it now. When he wants to work from the PC again: delete the folder and clone again (do not pull or merge the old clone into the new history), and set `git config --global user.email` to the noreply address before committing. The `varpg.bat` for Windows is still owed, once he says where the clone lives.
- **No license was chosen** (so nobody may reuse the code). The code and the content that will be sold (weapons, blueprints, as data) are two separate choices; raise it when he talks about opening the project to others, not before.
- **What is public is everything in the repository**, this file included (the business reasoning, the mistakes of the agents, the relic screenshot). The user was told and accepted it; write here knowing strangers can read it.

## Patterns that work here (written by one agent for the next, 2026-11-11)

These are not new rules of the user. They are what the agent saw working, and failing, over many sessions. Use judgement; when one of them fights a rule of the user, the user's rule wins.

**Reading the user**

- He thinks while he types: fast, with typos, sometimes cut in the middle. Never remark on the typing. If a message is cut, say what you understood and ask him to finish; do not guess the rest.
- He often answers a question with a principle instead of a yes or no ("all actors are the same box", "everything has a now and a max", "names are useful"). That principle is worth more than the answer: it is a rule of the structure. Write it in this file in his words, and apply it to the cases he did not mention.
- When he decides something, say it back as **one rule in one sentence**, then the consequences he may not have seen, then stop. If the sentence is right he says so, and it becomes the comment above the function.
- **"Let's try", "I want to see", "consider"** are not requests to build. **"I need the implementation", "do it", "you can run it"** are. When in doubt, one line: what you would build, and wait.
- **When he sends a message after something that needed testing, he tested it, unless he says otherwise** (his rule, 2026-11-12). Do not ask whether he played, and do not hold a doubt about "not played yet" over work he has already replied about.
- One open question per reply: the one that blocks. Park the others in "Open" and bring them when their turn comes. A list of questions reads to him as obstacles thrown in his path.
- When he will be away, list the choices you will make alone **before** starting, with your default for each, so he can overrule in one line. Mark them in this file as the agent's, for him to confirm.
- When he asks for the "effect" of something, he wants a before and an after with numbers, measured, in a small table, and one sentence of what it means.
- After a mistake: say what happened in one sentence, fix it, go on. No promises about the future and no swing to the opposite excess; he named both as failures.
- He cannot read the tests. The README table is how he reads them: one row per test, in plain words, with the worked numbers.

**Writing the rules**

- **A rule of the game is one small function with the user's sentence above it** (`bodyHurts`, `pushShare`, `crushObject`, `birthOffset`). A new rule is a new named function that the other code asks; never the same condition written in two places. When the user changes his mind, one function changes.
- **A reference to content that does not exist never breaks the game (the user, 2026-11-15, issue 61, his answer in the comments): it is skipped, and the journal says where.** His example: a monster or an item whose name is not found, like "banan" for "banana"; his reason: a player must not lose a run to a small thing like that. **What poisons the arithmetic still stops the game, as today** (a formula value that gives `NaN`, a negative damage, a broken limit): those checks stay. Only the spawn type uses this rule for now (an unknown `type` in a map's spawn events: `spawnEvents` skips that event and writes an error line, and the other events still spawn; it is not refused when the data loads); the other references (parts, weapons, the kinds of a layer) keep their refusal at load until the user asks to change them.
- **What must not exist cannot be made.** A limit is checked when the definitions load (`assertValidDefinitions`) or by a test on the definitions (101, 102), not by an `if` during play. The user asked for this twice.
- **A mechanism that has no content yet is proven with patched data in the tests** (`patchOnce`: the huge layer, the weightless Dummy), never with placeholder content in `src/data.js`. What is not used does not live in the data.
- **A faster way must give the same state as the plain way**, and the plain way stays in the tests as the reference (`EVERY_PAIR`). An optimization that changes a result is a change of rule and needs the user.
- **Before a refactor, say what must stay bit for bit the same and which test shows it** (the known answers of seed 1, the whole-state comparisons, the Chromium position). Keep the operations in the same order: floating point is not associative.
- **Name things for what they are today.** `collideActors` handles every actor that moves (the Dummies and the Biters), so it is not called `collideDummies`. An honest narrow name is a note to the future; a wide name over narrow code is a trap.
- **When a rule the user asked for forces a change he did not ask for** (the cells stopped being relative to the avatar because the avatar became pushable), make that change its own commit, say why in the message, and record it here as the agent's change.
- The seed answers questions through `hashInts` with a salt per question. A new question takes a new salt. The place of a layer in the list of layers, and the number of an actor, are part of the world: changing them changes every run.
- The result of a step depends on the order of `state.actors`. Never reorder it; add at the end; remove without reordering.

**Proving the work**

- Rule, tests, README row and the note in this file go in **the same commit**. Run `git status` and read the diff of the docs before committing; test 112 fails if a row is missing.
- **Break it once.** For every test that is meant to guard something, break that thing in the code, see the test fail, put it back, and say in the commit message which tests fail without the change. Twice a test was found that could not fail.
- Say what a claim rests on: **read** in the code, **measured** (and how), or **opinion**. A random run is not a worst case.
- Raise `DEFINITIONS_VERSION` when `src/data.js` changes, and update the pair (version and fingerprint) kept in `tests/agent/sim.test.js`; test 129 fails otherwise and prints the new values.
- After a change of the rules, open the game in a real browser (Chamber 0's SIMULATION CHECK: the cross-check must say none, and no error on the page), and record the new final position in the README when it moves.

**Thinking ahead**

- The run is `seed + blueprint + inputs`. Before adding anything to the state, ask whether it can be derived from those; before adding anything to the rules, ask whether it reads a clock, a random number or the order of a set. Test 113 guards the obvious cases only.
- New content will multiply whatever is written in two places. Before the second weapon, the second enemy, the second source of damage, look for the thing that should become one function or one table first (`docs/review-2026-11-11.md`, section 4, names them).
- The user's three axes are the tie-breakers, in order: the player's time, the transparency of the data, reproducibility. A design that hides how a number was made loses to one that shows it, even when it is shorter.
