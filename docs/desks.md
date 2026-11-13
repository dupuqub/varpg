# Desks: which conversations to open, and what each one does

Written 2026-11-12 at the user's request. A **desk** is one conversation with an agent that has one job in this project, like the desk of one developer. This file says which desks are worth opening, how important each is, what each may touch, and how they stay out of each other's way. It is a recommendation by an agent (the user decides which to open), and it has no game values.

The rules every desk follows are in `AGENTS.md`, "Working with several agents". This file is about who does what.

## The short answer

| Desk | Open it | Importance | One line |
|---|---|---|---|
| **Rules** | now (it is the conversation that already exists) | essential | The only desk that changes the rules of the game, the data and the tests. |
| **Review** | now, when a block of work ends | high, occasional | Reads and criticizes; changes no code. |
| **Screen** | now, if wanted | medium | What the player sees and touches: drawing, HUD, input, the page. Never the rules. |
| **Bench** | later, when the user says "do the bot" | high for balance | Plays the game by itself and measures it; later the small learned model. Never the rules. |
| **Content** | much later, after the library exists | none yet | New weapons, enemies and parts as data only. |

**Start with at most two desks writing at the same time (Rules and Screen).** Every extra desk is one more line of questions to the same person. Opening a new conversation for the same desk when the old one gets long is always fine, and better than one endless conversation: the desk is the job, not the conversation.

## How to open a desk

Start a conversation attached to this repository and paste the opening line of the desk (below). The agent then reads `AGENTS.md` and this file before anything else. Suggested names for the conversations, so they are easy to tell apart: `varpg · Rules`, `varpg · Review`, `varpg · Screen`, `varpg · Bench`.

## Rules desk

- **Job:** the simulation and everything that decides what happens in the game: movement, collision, damage, weapons, enemies, the shield, the seed, the history; the numbers and their reasons; the tests that guard them.
- **Importance:** essential. Nothing else moves without it. It is also the desk that keeps `AGENTS.md` true.
- **May change:** `src/sim.js`, `src/data.js`, `src/history.js`, `tests/agent/`, `AGENTS.md`, `docs/weapons.md`, `docs/weapon-families.md`, `docs/step-order.md`, `.github/`.
- **May not change:** nothing is forbidden to it, but when it renames or removes a field of the state it must fix what reads it in `src/render.js` and `src/chamber-0.js` in the same commit (or the screen breaks), and say so in the commit message.
- **Only one Rules desk at a time.** Two agents changing the rules in parallel collide on the numbers of the tests, on the version of the data and on the order of `step`.
- **Opening line:** `You are the Rules desk of varpg. Read AGENTS.md (start with "What this is", "Handoff" and "Working with several agents") and docs/desks.md, run the tests, and tell me in a few lines what state the project is in before doing anything. Then read the open issues with the label desk:rules (the commands are in docs/desks.md, "How desks talk").`

## Review desk

- **Job:** read the code and the docs as someone who did not write them, and say what is fragile, what is duplicated, what a decision will cost later, and whether the docs match the code. It answers "is this sound?" and "what did the other desk miss?".
- **Importance:** high, but only at moments: after a block of work (the shield and its ring are the newest risky code and were not reviewed), before a change that crosses many files (a dash with its own direction, the attack timeline, the library), and before something is announced to other people.
- **May change:** only `docs/review-YYYY-MM-DD.md` (a new file per review). It writes findings in order of severity, each with the file and the function, and what it would do.
- **May not change:** any code, any test, `AGENTS.md`. If something is wrong in `AGENTS.md`, it says so in the review; the Rules desk fixes it.
- **How its work reaches the others:** the user tells the Rules desk "see the review", and the Rules desk says for each recommendation: done, not done and why, or needs the user's decision. A review that nobody answers is noise; delete from an old review what was solved.
- **Opening line:** `You are the Review desk of varpg. Read AGENTS.md and docs/desks.md. Change no code. Review <what> and write docs/review-<date>.md with findings in order of severity and a recommendation for each. Then read the open issues with the label desk:review (the commands are in docs/desks.md, "How desks talk").`

## Screen desk

- **Job:** everything between the state and the person: drawing (`render.js`), the HUD, input (keyboard, gamepad, touch), the page and its buttons, the look of the menus, Chamber 0's page. Tuning the feel of the touch stick, left-handed and accessibility options, a debug zoom, art when it comes.
- **Importance:** medium now, growing: the game is public and played on phones, and the feel of the controls is judged here. It is the only desk that can safely work in parallel with the Rules desk today.
- **May change:** `src/render.js`, `src/input.js`, `src/main.js`, `src/chamber-0.js` (the page part), `index.html`, `style.css`, `README.md`, and the sections of `AGENTS.md` about screens, input and how to run.
- **May not change:** `src/sim.js`, `src/data.js`, `src/history.js`, the tests of the rules. **The screen reads the state and never writes it.** The input stays `{ move, dash }`: a change of its shape is a change of the rules (it is in every snap) and belongs to the Rules desk.
- **What it needs to know:** the simulation must not learn about the screen (no clock, no size of the window, no touch inside `step`). If the screen needs a value that is not in the state, it does not calculate a rule by itself: it writes a request (below). Its work has no Node tests (it needs the page), so it checks in a real browser and says in the commit what it checked.
- **Opening line:** `You are the Screen desk of varpg. Read AGENTS.md (the top, "Screens", "Movement and input", "Working with several agents") and docs/desks.md. You change only the screen and the input, never the rules. Tell me what you would look at first. Then read the open issues with the label desk:screen (the commands are in docs/desks.md, "How desks talk").`

## Bench desk (later)

- **Job:** play the game without a person and measure it. First a bot (a function from the state to the input of a frame) with a few simple policies, and a table of results per policy, weapon and blueprint; then episodes written as plain numbers; then, in Python, the small model the user wants. See `AGENTS.md`, "Ideas".
- **Importance:** high for balancing and for the user's idea of real information about how to play; it is also how an agent "plays". Not started: the user said later. It needs one thing from the Rules desk first: the record of each hit stored somewhere it can read.
- **May change:** a new folder of its own (`bench/` for Node, `ml/` for Python) and its own docs. It loads the game scripts the way the tests do.
- **May not change:** anything in `src/` or `tests/agent/`. A hole it finds in the rules (an input nobody can be hit with, a build that ignores a limit) is a report to the Rules desk, not something to work around.
- **What it needs to know:** a run is `seed + blueprint + inputs`; a result is only worth something if it says which of the three it used. The reward and what the model observes are decisions about the game: the user's.
- **Opening line:** `You are the Bench desk of varpg. Read AGENTS.md ("Ideas", "Working with several agents") and docs/desks.md. You never change src/. Propose the simplest bot and the table it would print, and wait for my answer. Then read the open issues with the label desk:bench (the commands are in docs/desks.md, "How desks talk").`

## Content desk (much later)

Not worth opening before the library of `AGENTS.md` ("The library") exists and a weapon or an enemy can be added as data with no new code. Then its job is entries of data with their reasons, checked by the loader, and it may not change the rules. Until then, new content is the Rules desk's work.

## What every desk shares, and who owns it

| Thing | Owner | The others |
|---|---|---|
| The shape of the state and of the input | Rules | read it; ask for changes |
| The numbers of the tests, the version of the data and its fingerprint | Rules | do not touch |
| `AGENTS.md` | Rules keeps it whole | each desk edits only the sections of its own job, in the same commit as the change |
| `README.md` and the published page | Screen | Rules updates the lines about what exists |
| Questions to the user | each desk, one at a time | a desk never answers for him: what he did not decide stays open |

## How desks talk: the Issues of GitHub (the user, 2026-11-13)

The Issues of the repository are the place where desks talk and where the tasks live . In these sessions `gh issue ...` does not work (it is refused); use the REST form, checked 2026-11-13:

```
gh api "repos/dupuqub/varpg/issues?labels=desk:rules&state=open" --jq '.[] | "\(.number) \(.title)"'   # list
gh api repos/dupuqub/varpg/issues/N --jq '.title, .body'                                              # read
gh api repos/dupuqub/varpg/issues/N/comments --jq '.[].body'                                          # read the comments
gh api repos/dupuqub/varpg/issues -f title="..." -f body="..." -f "labels[]=desk:screen"              # open
gh api repos/dupuqub/varpg/issues/N/comments -f body="..."                                            # comment
gh api -X PATCH repos/dupuqub/varpg/issues/N -f state=closed                                          # close
```


- **One task, one issue**, with the label of the desk that will do it: `desk:rules`, `desk:review`, `desk:screen`, `desk:bench`. The user points a desk at it ("take issue 3").
- **A request to another desk is an issue** with that desk's label: who asks, what, why. The desk that does it says so in a comment (the commit, and what was left out) and closes it. **The Review desk audits afterwards** (the user, 2026-11-13): when it opens a conversation it reads the issues closed since its last pass and reopens, with a comment, any that does not convince it. So the desk that did the work closes, and nobody waits for a second desk to open a conversation.
- **A question for the user** gets the label `question-for-user`, one question per issue. No desk answers for him.
- **When a desk starts a conversation** it reads the open issues with its label, after `AGENTS.md` and this file.
- **What was decided still goes to `AGENTS.md`**, in the same commit as the change. An issue is the conversation; the files are the memory.
- A desk other than Rules sends its work as a pull request (the tests run on it, and the Review desk reads it there). Rules keeps pushing to `main`.
