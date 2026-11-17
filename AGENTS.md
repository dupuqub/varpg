# AGENTS.md

Guide for any agent continuing this project. Everything needed to continue should be here, not in conversations.

Each paragraph here says the rule of today; how a rule changed (older versions, dates, parcels, the user's words at the time) is in `docs/decisions.md` (issue 66).

## The two foundations (read these first; the user: "the base of everything")

> **1. Go slowly and deliberately.** The goal is the calm making of a model project, not reaching the end. Clarity wins over speed.
> **2. Break every big task into small steps, each one closed before the next.** Tests green, committed, pushed and noted here, so the work can stop after any step.

The full text of each, with its reason:

- **1. The aim and the pace of the project (the user, 2026-11-13; it comes before the other rules of this section).** The problem here is often contemplative, not one of speed. The aim is not the end of the project but the calm making of it, pruning each branch without hurry: a project that can be a **model of how a game like this can be organized**, inclusive, so that people can take it apart and learn from every decision and every difficulty, and so that anyone who comes to work with him can walk in it knowing the ground is safe. The user may need to earn money from it someday, but that is not the measure. So: the agent does not optimize for a fast and efficient answer (it was trained to be rewarded for that, and it is not the goal here); it goes slowly, one thing at a time, says what each change is for, leaves no change half explained, and keeps the files, the tests, the reasons beside the numbers and the history readable by someone who was not there. When speed and clarity pull apart, clarity wins.

- **2. How to break a big feature into steps (the method that built the sword, 2026-11-13).** Split it into small steps, each one finished on its own: the smallest pure piece first (a helper with tests), then the data, then the rules, then the drawing, then the docs. Each step ends with the tests at `fail 0`, a row per test in the README, a commit, a push, and a line in `AGENTS.md` saying what is done and what comes next, so the work can stop after any step and anyone can resume. The user's usage can end at any moment, and a half-finished step is what makes work hard to resume. Do one step, close it, then the next; do not carry two open at once.

**This file has no game values (the user's rule).** It says what was decided, why, and **where each number lives**. The values, each with its reason and who chose it, are in `src/data.js` (and in the few named constants listed in "Where the numbers are" (docs/rules/numbers.md)). Do not copy a value into this file: write the rule with the **name** of the number (for example `weight = weightPerRadius x radius`). The only numbers allowed here are the fixed decisions of the concept (steps per second, the canvas size, the length of a map). Worked examples with numbers belong in `tests/agent/README.md`, where a test fails if they drift.

## What this is

A 2D top-down action RPG in the vein of Diablo and Path of Exile, running in the browser. The theme is **mechas** (see Decisions).

Repository state (2026-11-12): the game is **public and online** (`https://dupuqub.github.io/varpg/`, published from `main` by a workflow that runs the tests first; see "Publishing" in docs/notes/handoff.md). Screen navigation (main menu, test chambers list, Chamber 0 diagnostics and the played Chambers 1 and 2), with pause, one frame back and forward, fullscreen, and keyboard, gamepad and touch controls. In Chamber 1 the avatar is always at the center of the screen, moves with inertia, dashes, collides with the objects of the seed (rocks and Shrooms, all placed by seed and formula, in layers, none by hand) and with the Dummies (test actors made by the seed, born from the map's spawn events off the screen, wandering and wrapping around the window of the grid), and collisions with the avatar hurt (the body slam); actors push each other by weight. The avatar's values are sums over the mecha parts of its blueprint. The collision grid (several cells per actor) is used between actors. In Chamber 2 the Dummies are replaced by Biters, born from the map's spawn events (a crowd after the first step, then waves), enemies that chase the avatar and bite with a hitbox; damage is a packet by type that the target resists by points; the avatar has an auto-aiming repeater whose ammunition weighs, and a shield from the Generator whose ring is its radius. See "Code layout" (docs/rules/code-layout.md). **More than one agent may work here: read "Working with several agents" and `docs/desks.md` before the first change.**

## Where things are

| Topic | File | What is there |
|---|---|---|
| Actors | `docs/rules/actor.md` | The Dummy and the other actors: how they are made and behave. |
| Code layout | `docs/rules/code-layout.md` | Which file of the code holds what. |
| Damage | `docs/rules/damage.md` | Damage packets, resistance and how a hit lands. |
| Movement | `docs/rules/movement.md` | Canvas, camera, movement, dash and input. |
| Numbers | `docs/rules/numbers.md` | Where each kind of number lives in the code. |
| Parts | `docs/rules/parts.md` | The kit of mecha parts and how their specs add up. |
| Screens | `docs/rules/screens.md` | The mecha theme, the screens and the stack. |
| Spawn | `docs/rules/spawn.md` | The spawn events of each map. |
| State | `docs/rules/state.md` | Simulation, the state, the definitions and the run history. |
| Weapons (rules) | `docs/rules/weapons.md` | The decided rules of weapons, shots and objects. |
| World | `docs/rules/world.md` | The seed, the objects, collision and the grid. |
| Handoff | `docs/notes/handoff.md` | State of the work, open items, ideas, publishing and patterns. |
| Desks | `docs/desks.md` | Which conversations to open and what each one does. |
| Step order | `docs/step-order.md` | The stages of one step and why each sits where it does. |
| Weapons (vision) | `docs/weapons.md` | The user's vision of weapons, the old model and open questions. |
| Decisions | `docs/decisions.md` | The history of the rules: older versions and who changed them. |
| Method | `docs/method.md` | How work is cut into parcels, with a coordinator and helpers. |
| Tests | `tests/agent/README.md` | How to run the tests and what each one checks. |

## Concept

The game is a constructive critique of the methods of some games. Axes, in priority order:

1. **Respect for the player's time.**
2. **Data transparency** (against data obfuscation).
3. **Reproducibility:** a run must be repeatable identically, including for machine learning.

The game is about **builds**: a massive skill tree, but also testing one thing at a time. The structure of the project and its process must let new skills appear without major problems, with automated tests that guarantee the synergies work.

### Game loop

Enter a map (Vampire Survivors style), run the build, collect resources, leave the map, improve the build, next map.

### Respect for time (design rules)

- 10-minute maps.
- Skill tree respec is always free and unlimited.
- The player must always be able to pivot builds between runs.

### Transparency (design rules)

- There must be a page that shows in detail how each hit of damage was calculated: an annotated formula that says where and when each buff is applied, and in what order.
- It is not didactic. It is an audit: the player needs full awareness of the build's real performance, to improve it effectively and to give feedback on the game's logic.

## How to run

Online: `https://dupuqub.github.io/varpg/` (the last push to `main` that passed the tests). Locally: open `index.html` in the browser. The scripts are plain (no modules), so no server is needed.

### Tests

From the root of the repository: `node --test` (no path; Node finds the `*.test.js` files). A good run shows `# fail 0` in the summary at its end. The user can paste the whole output to the agent. The tests load the browser scripts into a `vm` context, so they do not need to become modules; the test file passes the starter blueprint to `step` by default. Whenever a rule or a value changes on purpose, update the numbers in the tests and in `tests/agent/README.md`.

## How to work on this project

- **The title of a test claims only what the test checks (2026-11-13).** The user cannot read code: the titles and the rows of `tests/agent/README.md` are his window to what is guaranteed, so a title that promises more than the test verifies gives him a false guarantee (it happened twice in one day, tests 153 and 122). When a test is changed, change its title and its row in the same commit.
- Solve one problem at a time. Short replies. Do not over-explain.
- Do not start work the user has not asked for. The user explains the concept and sets the decisions; the agent proposes and confirms.
- Do not assume the obvious: if a question already has an evident answer, decide and move on, and keep questions for real design decisions.
- Code prioritizes readability and transparency: clear names, no unnecessary cleverness.
- Language: chat with the user in Brazilian Portuguese (he is fluent in English). Everything else is en-US: code, identifiers, comments, docs and commit messages.
- Record in this file every new decision that affects the direction of the project, **without values** (see the top of this file).
- **Every issue and parcel names the topic files its helper must read**, besides this guide (the files under `docs/rules/` and `docs/notes/handoff.md`). A helper reads this guide and only those topics.
- **A change of a rule edits its topic file.** The sentence in this guide changes only if the rule itself changes, and `docs/decisions.md` gets what it replaced.
- **No detail goes back into this file**: functions, tests, the reasons of the numbers and the user's words live in the topic files. A test guards the size of this file and its pointers.
- **Gameplay formulas are the user's.** He cannot verify code or tests, but he needs full control of the formulas of the game. Present them as plain arithmetic with example numbers (in the chat, not in this file), and ask before choosing one for him.
- Always say briefly whether something the user proposes, or something the agent did, looks sound (sound / sound with a cost / fragile or premature / not sure), with the reason and what would change the agent's mind. No agreement for its own sake. The agent can judge the soundness of a design, but not the feel of the game: the user describes what he sees.
- **Every number that is chosen needs a reason, and the agent suggests one** (see "Where the numbers are" in docs/rules/numbers.md).
- **Say when a decision rests mostly on the user's preference**, briefly and plainly, and keep going: the game is his, so a preference is a valid reason, but he wants to know which decisions are preference and which are need. The same goes for the agent's own preferences. **Filter (the user's rule):** do not raise a suggestion unless it has the potential for a positive change to the game. Do not challenge a choice of taste only to offer alternatives (the user's example: "you chose cats, but what about dogs, or squirrels?"). A taste choice is worth a remark only when it carries a concrete cost or risk into the structure. The same applies to numbers: suggest a different value only if it would measurably change the experience.
- Small corrections, not over-corrections: the user said the agent rushes, and then brakes too much when corrected.
- After changing something visual, ask the user to open it and describe what he sees and feels. For anything that can be printed as text, add a button to Chamber 0 and ask the user to paste its output.
