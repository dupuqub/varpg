# The Screen desk's work order

Written on 2026-11-15 by the Screen desk (Fable 5.2, as the planner), at the user's request: every open task of the Screen desk, cut into parcels, each with its model. A coordinator on Haiku, the checklister, follows the loop below and calls helpers. The method is `docs/method.md`. The parcels are T1, T2 and T3 of `docs/solid-base-plan.md`, with their recipes.

The issues were read, body and comments, at commit `70bc267`, and every recipe was read against the code at that commit.

## Who does what (the user, 2026-11-15)

| Model | Role here | Never |
|---|---|---|
| **Haiku** | The checklister: runs the loop and its checks, marks, commits, pushes, comments. Builds T1. | Judges how something looks, or changes a recipe. |
| **Sonnet** | Builds T2 and T3: their recipes leave nothing to decide. | |
| **Opus** | Only when a Sonnet helper failed a parcel. | |
| **Fable** | Wrote this order and its check. | Is called by the loop. If Opus fails, the loop stops and calls the user. |

## What is different from the Rules desk's loop

- **The Screen desk has no Node tests** (its work needs the page). In their place there is `tests/screen/check.js`, one check per parcel, that prints `CHECK PASSED` or `CHECK FAILED`. T1 and T2 run in Node; T3 and T4 drive a real Chrome. All four were seen failing on the code of `70bc267`, so each can fail.
- **The work goes in one pull request**, not to `main`: the branch `screen/work-order-2026-11-15`, one commit per parcel. The user merges it at the end.
- **A check is not the user's eyes.** It says the page behaves as the recipe says; whether it looks and feels right is his to say, after the merge.

## The coordinator's loop

One parcel at a time, in the order of the list. Never two helpers at once.

**Once, before the first parcel:**

```
git fetch origin && git checkout screen/work-order-2026-11-15 && git pull && git merge origin/main
npm install --prefix /tmp/screencheck puppeteer-core
```

If the merge has a conflict, stop and call the user.

1. `node --test 2>&1 | grep -E "^not ok|^# (pass|fail)"`. It must say `# fail 0`. Write down the `# pass` number. If it fails, stop and call the user.
2. Take the first parcel not marked `[x]` in this file. If it says **coordinator**, do it yourself. Otherwise call one helper (the Agent tool, `subagent_type: "general-purpose"`, `model`: the model of the parcel, `run_in_background: false`) with the text of "What to tell every helper" followed by the whole text of the parcel.
3. When the helper comes back, check, in this order:
   - The tests again: `# fail 0`, and the same `# pass` number (no parcel here adds a test of the rules).
   - `git status --short` shows only files in the parcel's **Files** line.
   - The parcel's check ends with `CHECK PASSED`: `NODE_PATH=/tmp/screencheck/node_modules node tests/screen/check.js <parcel id>`.
   - **Break-once, mechanically:** `git stash push -- src index.html style.css`, the same check must end with `CHECK FAILED` (write down its `NOT OK` lines), `git stash pop`, and the check once more: `CHECK PASSED`.
4. If a check fails: call a helper one model up (haiku, then sonnet, then opus) with the same text plus the lines that failed. If opus also fails: `git stash -u` (nothing is lost), stop and call the user. Never call fable.
5. If all checks pass: mark the parcel `[x]` in this file, `git add -A`, commit with the message `Screen desk: work order, <parcel id> <title> (issue <numbers>)` and a body with one line `Fails without the change: check <parcel id> (<how many lines were NOT OK>)`, ending with the attribution lines your session was given. Then `git push origin screen/work-order-2026-11-15`.
6. Comment on each issue of the parcel in one line: the parcel, the commit, the "Fails without the change" line, and "closes when pull request <number> is merged" (`gh api repos/dupuqub/varpg/issues/<n>/comments -f body="..."`). Do not close the issue.
7. Tell the user in one or two lines, in Brazilian Portuguese, and go to the next parcel.

**Stop and call the user** when: the tests fail before a parcel; a parcel failed on opus; a helper says it needs a decision or that the recipe does not match the code; a file of the Rules desk would have to change (`src/sim.js`, `src/data.js`, `src/history.js`, `tests/agent/`); the T2 check says the fight has no hit that broke the shield; a push is refused twice; T4 is the next parcel and issue 58 is still open.

## What to tell every helper

> You are a helper of the Screen desk of varpg, working in the repository of this session, on the branch that is checked out. Read in `AGENTS.md` the sections "How to work on this project", "Screens" and "Movement and input", then do only the parcel below, from `docs/screen-plan.md`.
>
> Rules:
> - Change only the files in the parcel's **Files** line.
> - **The screen reads the state and never writes it.** Do not touch `src/sim.js`, `src/data.js`, `src/history.js` or `tests/`.
> - Reading an issue is its body and its comments: `gh api repos/dupuqub/varpg/issues/N --jq '.title, .body'` and `gh api repos/dupuqub/varpg/issues/N/comments --jq '.[].body'`. The last comment that says "Answer of the user" or "Summary of the user's answers" wins.
> - Everything written is en-US. Clear names, comments that say why, no cleverness. No game values in `AGENTS.md`.
> - Finish only when `node --test` says `# fail 0` and the check of the parcel says `CHECK PASSED`: `NODE_PATH=/tmp/screencheck/node_modules node tests/screen/check.js <parcel id>`. Do not change `tests/screen/check.js`: if you think it is wrong, say so in the report.
> - Do not commit, do not push, do not touch issues.
>
> Report at the end: the files you changed, the last line of the check, and anything you were not sure of.

## The parcels

### [x] T1. A color for the Branch (model: haiku; issue 52)

**Files:** `src/render.js`.

`OBJECT_COLORS` has no entry for `branch`, so a Branch is drawn in whatever color was set last. Add `branch: "#7a5a3c"` (a wood brown: the rock is gray and the Shroom is beige, so the three read apart on the black ground; the planner's choice). Nothing else changes: it is a circle like the others.

**Check:** `node tests/screen/check.js T1` (every object type of the data has its own color).

### [x] T2. The COMBAT REPORT: no minimum, the hits of 0, both calculations of a broken shield (model: sonnet; issues 26 and 41)

**Files:** `src/chamber-0.js`, `AGENTS.md`.

All of it is inside `combatReportText` and helpers beside it in `src/chamber-0.js`. The report only reads the lines of the audit; it calculates no rule.

1. **No minimum damage** (issue 26; the rules removed it). In the rows of the totals drop `, the minimum counted in ...`; in the line of a hit drop the `(minimum)` part. The word "minimum" leaves the report.
2. **One function writes the line of a hit**, `combatReportHitLine(hit)`, used for every hit the report prints. For a hit without `overflow` the text stays exactly as it is today (minus the minimum).
3. **A hit that broke the shield** (it carries `overflow`; issue 41, the user's rule of 2026-11-14) prints both calculations, one after the other, in this form:
   `  frame F: SOURCE ATTACK -> TARGET: with the shield: <parts of hit.parts> = <overflow.withShield>; the shield took <overflow.absorbed>; the share left, <overflow.share as a percent with one decimal>%, against the body: <parts of overflow.parts> = <overflow.total>; total <hit.total>; shield <hit.shield>, health <hit.health>`
   The parts are written as today (`type amount - reduction% (points points, fromShield from the shield) = after`, joined by `, `); the `= <...>` after them is the total of that calculation. Numbers with two decimals, as today.
4. **Two new lines after the rows of the totals**, in this order:
   - `hits of 0 (a hit that took nothing): N` where N counts the `hit` lines whose `total` is 0 (a weightless Branch hits back with nothing, and a hit of 0 is a hit: the user, issue 46). Always printed, 0 included.
   - `hits that broke the shield: N`, followed by one line per such hit of the whole fight (`combatReportHitLine`), because they are rarely among the last 10.
5. `AGENTS.md`, "Screens", the item about Chamber 0: add COMBAT REPORT to the list of buttons with one sentence of what it prints (the totals by kind, the hits of 0, every hit that broke the shield with both calculations, the last hits). No values.

**Check:** `node tests/screen/check.js T2`. It plays the same fight as the report and looks for these lines with the numbers of that fight.

### [x] T3. The death on the screen (model: sonnet; issues 25, 42 and 49)

**Files:** `src/main.js`, `src/input.js`, `index.html`, `style.css`, `AGENTS.md`.

The user's answers (issue 42, the last comments): after the death **the buttons stay, the state freezes, back and forward still work, only the frames stop running**; "the avatar no longer plays, so there is no reason to render frames". No screen replaces the buttons. Play from a frame before the death goes on and the death is undone: the history is a debugger for now (in the finished game a death will not be undone). The rules are built: `state.mission` is `"aborted"` and `step` does nothing more. This parcel does not wait for parcel F1 of `docs/solid-base-plan.md`: the screen reads only `state.mission` (read in the code).

One rule, the same for every chamber, with no chamber named in the code: **the shown state decides.** Write one small function in `src/main.js`, `missionAborted()`, that returns `state.mission === "aborted"`, and ask it everywhere below.

1. **The frames stop.** In `loop`, right after `stepLive()`: if the mission is aborted, pause the game (`pauseGame()`). The frame of the death is still drawn once by the lines that follow; from then on `loop` returns at `if (paused)` as it already does.
2. **Play does nothing on an aborted state, and writes no resume line** (issue 49): `playGame` returns at its first line when the mission is aborted. Keep the line `audit.push(combatAuditResumeLine(state.frame))` exactly as it is written (test 175 reads it).
3. **Forward does nothing on the frame of the death:** `stepForward` returns at its first line when the mission is aborted and the shown snap is the newest. Do not write the word `audit` inside `stepBack` or `stepForward` (test 175).
4. **`updateControls`:** the toggle is disabled when the mission is aborted; forward is disabled when the mission is aborted and the shown snap is the newest; the status text starts with `ABORTED · ` (before `PAUSED · `); and the alert of the screen, if the screen has one (`[data-control="aborted"]`), is hidden unless the mission is aborted.
5. **The alert, in Chamber 2 only** (issue 25: "for now, for Chamber 2"), in `index.html` inside `#screen-chamber-2`, after the `.overlay`: `<div class="alert" data-control="aborted" hidden>` with the text `ABORT MISSION` (the user's words) and one button `<button data-goto="screen-menu">BACK TO THE MENU</button>` (the existing code wires every `data-goto`). Chamber 1 gets no alert: its top bar says `ABORTED` and that is enough for a movement test. `style.css`: `.alert` in the center of the screen, above the canvas, in the plain style of the menus (same font, a dark background so the text reads over the game); `.alert[hidden] { display: none; }`. No animation, no new colors beyond what `style.css` already uses.
6. **A touch on the alert belongs to the page** (`src/input.js`): where a touch that starts on `.overlay` is left to the page, do the same for `.alert`, or the button cannot be tapped on a phone.
7. **The comment above `let paused`** in `src/main.js`: play on a past frame is no longer "the agent's default, to be confirmed": the user confirmed it on 2026-11-14 for as long as the history is a debugger (issue 42), and said that in the finished game a death will not be undone.
8. `AGENTS.md`: in "Screens", the item about Chamber 2, say what the death looks like (the alert, the buttons stay, the frames stop, back and forward work, play from an earlier frame goes on, Chamber 1 only says it in the bar); in "Simulation", the item "Frame debug", replace "(the agent's default, not confirmed by the user)" by the user's answer; in the item "The avatar's death" replace "(not built)" by "(built: see "Screens")". No values.

**Check:** `NODE_PATH=/tmp/screencheck/node_modules node tests/screen/check.js T3`. It opens the game in Chrome, kills the avatar, and tries every item above, the cross-check of the history included.

### [ ] T4. The combat log says when the mission is aborted (model: haiku; issues 49 and 58)

**Do not start before issue 58 is closed** (`gh api repos/dupuqub/varpg/issues/58 --jq .state` says `closed`): the Rules desk writes the function of the line, `combatAuditAbortedLine(frame)`, in `src/sim.js`. If it is still open when this parcel is the next one, stop and tell the user. Then `git merge origin/main` before starting. After T3.

**Files:** `src/main.js`.

The user (2026-11-15): the log gets a line when the mission ends, like `start` and `resume`: "it will be useful to debug some moments". In `stepLive`, right after the call of `step`: if the mission is aborted (`missionAborted()`, from T3), push the line once: `audit.push(combatAuditAbortedLine(state.frame));`, with a comment that says why it is here (a new state was just calculated, and after T3 nothing calls `stepLive` on a state that is already aborted, so the line is written once per death; a death undone by the history and died again writes it again, like any line of the log). Do not write the word `audit` inside `stepBack` or `stepForward` (test 175).

**Check:** `NODE_PATH=/tmp/screencheck/node_modules node tests/screen/check.js T4`.

### [ ] E1. Close the issues (coordinator; after the user says the pull request is merged)

Close 52, 26, 41, 25, 49 and 42 (49 only if T4 is marked `[x]`), each with a one-line comment naming the merged pull request (`gh api -X PATCH repos/dupuqub/varpg/issues/<n> -f state=closed`). Then run the T3 check once more on `main` if parcel F1 of `docs/solid-base-plan.md` has landed since, and tell the user its last line.

## For the user to see after the merge

Nothing here can be judged by a check:

- Chamber 0, COMBAT REPORT: is the line of a hit that broke the shield readable?
- Chamber 2: die (stand still among the Biters). The alert, the frozen picture, back and forward, play from an earlier frame. On the phone too: the button of the alert.
- The color of the Branch.

## Chosen by the planner (the user overrules any of them in one line)

- The Branch is `#7a5a3c`.
- The alert's button leads to the entry screen (the issue says "back to the menu"); BACK (ESC) in the bar still leads to the list of chambers.
- The freeze is the same for Chamber 1, without the alert.
- T3 does not wait for F1.
- `tests/screen/` is a new folder of the Screen desk: checks, not tests of the rules; `node --test` and the publishing workflow do not run them.

## Not in this order

- Options for left-handed players and accessibility: the user will ask.
- The damage trace on the screen ("Open items" of `AGENTS.md`): it waits for the origin of each number, which waits for buffs and skills.
