# Theme, screens and stack

## In short

- The character is a mecha of parts, not armor; the starter kit (shoulders, arms, head, torso, legs, generator, booster) grows only when the user asks (docs/rules/screens.md).
- Legs give speed, the booster the dash, the generator the shield, arms and shoulders the automatic weapons, the head the Radar (the weapons' only range), the torso the capacity and later the Magnet (docs/rules/screens.md).
- A processor holds the skill tree and is a build; swapping it keeps the parts (not built). A part's old armor is its share of health, the name the code keeps (docs/rules/screens.md).
- One HTML and CSS screen at a time: the entry screen (new game and continue disabled) leads to the test chambers, each named after its number (docs/rules/screens.md).
- The Movement chamber is a full-window view with Dummies and the seed's objects; the Combat chamber is that world with Biters, a plain-text HUD and its own canvas (docs/rules/screens.md).
- On a death the frames stop and play is disabled, but saved frames can be walked and playing an earlier one undoes it; Combat shows an ABORT MISSION alert, Movement only an aborted status (docs/rules/screens.md).
- The Diagnostics chamber's buttons run checks in the browser and print text to copy (docs/rules/screens.md).
- Plain JavaScript, HTML and CSS, the canvas only draws; no engine, library or TypeScript (docs/rules/screens.md).
- Own collision, everything a circle; no walls, and scenery would be still circle actors (docs/rules/screens.md).

## Theme: mechas

- The game is about mechas. Instead of armor, as in Path of Exile and Diablo, the character has parts.
- The parts of the user's old project are the starter kit: shoulder R and L, arm R and L, head, torso, legs, generator and booster. Do not invent others before the user asks.
- **What each part is for (the user's decisions):**
  - **Legs:** the primary source of speed.
  - **Booster:** the dash (the thrusters, like Genos from One Punch Man).
  - **Generator:** the shield.
  - **Arms and shoulders:** the four automatic weapons.
  - **Head:** the primary source of the **Radar**, the circle around the avatar that says who can be targeted by the automatic weapons. **Built (the user, 2026-11-13): the Radar is the only truth about what can be aimed at; a weapon has no range of its own.** The spec `radar` (px) is summed from the parts into `avatar.radar` (static), `pickTarget` uses it as the range of the avatar's weapons (a Radar of 0 sees nothing; test 154), and the screen draws it as a white circle with no fill.
  - **Torso** (the name stays "torso"; "core" was only a nickname): the physical case, **a tough case with a motherboard that holds the processor**. It has the weight capacity, a small contribution to speed, and is the primary source of the **Magnet**: the radius within which things that fall on the ground are pulled to the avatar, as in Vampire Survivors.
  - Any part can add to speed, to the dash strength and to the Magnet.
- **Processor:** it holds the **skill tree**, and the player can own several, a box of processors: **each processor is a build**. The torso is the hardware and the processor is the software. **Swapping the processor does not swap the parts** (the user's rule). Planned, **for the future and not developed**: a dialog on installing a processor that asks which parts the player wants to bring from that processor's last installation, and a check of which of those parts are available.
- **Health (the user's decision):** the `Armor.Max` of the old project was a part's contribution to the maximum health. The code keeps the name **health**, because it is universal (every actor has it), and "armor" is only how it is **presented to the player** (a label in one place in the library). The old project had no defense spec.

## Screens

Keep everything simple. Screens are HTML and CSS, and only one is shown at a time.

- **Entry screen** with three buttons: NEW GAME, CONTINUE and TEST CHAMBERS. NEW GAME and CONTINUE do nothing yet (they are disabled).
- **TEST CHAMBERS** is another screen, where the user picks which test map to run. Every chamber has a name after its number, shown on the list and as its title (the user's rule; give a name to each new chamber).
- **Chamber 1: Movement** is a movement test and, by the user's decision, the first combat test too (colliding with the objects of the seed). It is a full-window game view (see "Movement and input" in docs/rules/movement.md).
- **Chamber 2: Combat** (the user, 2026-11-11): the same world as Chamber 1 (rocks and Shrooms from the seed) with no Dummies and with Biters instead, to test combat. Its HUD is plain text (health, shield, weight, the weapon's rounds, the dash). It has its own canvas (`canvas-2`), the same size as the first, and `src/main.js` runs the chambers that are played from one table (screen id, canvas id, function that makes the state). **The death on the screen (the user, 2026-11-14, issues 25 and 42; built):** the shown state decides (`missionAborted()` in `src/main.js` reads `state.mission`, the same for every chamber). In Chamber 2 an alert, ABORT MISSION with one button back to the menu, appears over the game. The top-bar buttons stay and nothing replaces them: the frames stop (the frame of the death is drawn once), the pause/play toggle is disabled, forward is disabled on the frame of the death, and back and forward through the saved snaps still work. Play from an earlier frame goes on and undoes the death (the history is a debugger for now). Chamber 1 has no alert: its status text in the bar starts with ABORTED, which is enough for a movement test. A touch on the alert belongs to the page, like the bar.
- Chambers are not necessarily places in the game. **Chamber 0: Diagnostics** is a test bench (numbered 0 by the user because it is the base under the game chambers, and it comes first in the list): buttons that run something in the real browser and print plain text into a box, with a COPY button, so the user can paste the output to the agent. Buttons: ENVIRONMENT (browser, screen, gamepads, frame callbacks per second), SIMULATION CHECK (a scripted run played twice, the history and the cross-check, including a snap changed on purpose to see that the check notices it, and the final state), DATA (the definitions, the blueprint with the arithmetic of each final value of the avatar, the rocks of the first screen and the initial state) and COMBAT REPORT (a fight played with the journal on; it prints the totals by kind of hit, how many hits took nothing, every hit that broke the shield with both of its calculations, and the last hits). The scripted run uses no trigonometry, so every browser must print the same final position; compare outputs between machines or against a Node run.

## Stack

- JavaScript, HTML and CSS for the UI; canvas 2D for sprites and tiles. The canvas only draws.
- Maximum simplicity: no game engine or library. Plain JavaScript (the user feared TypeScript would complicate the project).
- Own simple collision: absolutely everything is a circle for collision. There are no walls. If scenery is ever needed, it is made of static circle actors.
