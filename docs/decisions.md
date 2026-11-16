# Decisions

The history of the rules of `AGENTS.md` (issue 66, approved by the user on 2026-11-16). `AGENTS.md` says only the rule of today; when a rule changes, the older version moves here, so nothing is lost.

One entry per rule that changed, newest first: the date, who decided, his words, what it replaced, the issue or parcel. Under "Moved from AGENTS.md" are the sentences taken out of `AGENTS.md`, word for word, with the section they came from and the parcel of issue 66 that moved them.

---

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

## 2026-11-14 (written 2026-11-15): the keys `repeat` and `scale` removed (section "Damage")

- **Who decided:** the user (issue 45; data version 60; issues plan I18, commit 643db1f).
- **What it replaced:** base plan P4 and P5 put `repeat` (`life` or `contact`) and `scale` (`none` or `impact`) in every attack record.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "**The keys `repeat` and `scale` were removed (the user, 2026-11-14, issue 45; data version 60).**"
  - "Base plan P4 and P5 had put them in every attack record (`repeat`: `life` or `contact`; `scale`: `none` or `impact`)."
  - "Nothing read them to decide: the "once" of a body is `state.contacts`, that of a hitbox is `struck`, and the growth with the impact is written inside `finalAttack`, so each key was a label kept true by a check, and it cost bytes in every snap (measured, in `docs/base-plan.md`)."
  - "The user decided: `repeat` is replaced by the hitbox tag of issue 43 (`hits`, see "Shots and objects") and by the basic rule below; `scale` is replaced by `perWeight`, which each attack already writes."

## 2026-11-14: no minimum damage (section "Damage")

- **Who decided:** the user (commit ccab4ac, data version 58).
- **What it replaced:** a minimum damage, the keys `minDamage` and `minimumApplied`.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "the curve already guarantees it, since it never takes everything off, so `minDamage` and `minimumApplied` were removed (data version 58)."

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

## 2026-11-12: the touch controls checked in Chromium (section "Movement and input", "Touch")

- **Who:** the agent that built the touch controls, on the user's request of 2026-11-12 (commit 0e6fa94).
- **What it replaced:** nothing; a past measurement. The touch controls still have no Node test, and the numbers are still guesses to tune on a phone (both stay in `AGENTS.md`).
- **Moved from AGENTS.md** (section "Movement and input", issue 66 parcel 2):
  - "it was checked in Chromium with real touch events (half stick = 0.5, beyond the radius = 1, dead zone = 0, a second finger dashes in the movement direction and spends a charge, the top bar still takes taps)."

## 2026-11-12: the shield's ring is the real collision box (section "Damage", "Shield")

- **Who decided:** the user (commit e34cdaa).
- **What it replaced:** an open question: the ring as the real collision box or only visual.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "The user first asked whether the ring was the real collision box or only visual; his answer was the real one, with the continuous radius."

## 2026-11-11: resistance is a hyperbolic curve, not a fixed percentage (section "Damage")

- **Who decided:** the user, on a ratio the agent proposed (commit 824a3ba).
- **His words:** "a curve, no immortality, no hyper resistance".
- **What it replaced:** his first thought, a fixed percentage.
- **Moved from AGENTS.md** (section "Damage", issue 66 parcel 1):
  - "The user first thought of a fixed percentage and chose the curve; the numbers are to be seen in play." (the second half, "the numbers are to be seen in play", stays in `AGENTS.md`: it is still a guess today)

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
