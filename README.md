# varpg

A 2D top-down action RPG about mechas, in the browser, in **early development**. It is a prototype of the rules, not a game yet.

## Play it

- Online (once published): `https://dupuqub.github.io/varpg/`
- Or open `index.html` in a browser. There is no build and no server: the scripts are plain files.

**Controls:** WASD or the left stick of a gamepad to move, Space or the gamepad A button to dash. The weapons aim by themselves. The `||`, `<<` and `>>` buttons at the top pause the game and walk through the last two seconds, frame by frame. Esc goes back to the menu.

**Phones (landscape):** put a finger on the left half of the screen and drag: it is a floating analog stick (the farther the finger from where it touched, the faster). A touch anywhere on the right half is the dash, in the direction you are moving. A Bluetooth gamepad also works.

## What exists

- **Chamber 1: Movement.** Inertia, a dash, rocks and mushrooms placed from a seed, and wandering test actors that push each other by weight.
- **Chamber 2: Combat.** Enemies that chase and bite, damage by type with resistance, an auto-aiming weapon with ammunition that weighs (the mecha gets lighter and faster as it fires), and a shield from the generator.
- **Chamber 0: Diagnostics.** Buttons that print text to copy: the environment, a scripted run played twice with a cross-check, and the data.

## What the project is about

1. **Respect for the player's time.**
2. **Data transparency:** a page that shows how every hit of damage was calculated (planned).
3. **Reproducibility:** a run is a seed, a blueprint and the inputs, so it can be played again identically, on any machine. The simulation is deterministic and runs at 60 steps per second.

## What it is not (yet)

No art, no progression, no skill tree, no saved games. Every number in `src/data.js` has a reason written next to it, and many are guesses to be tuned by playing. `AGENTS.md` lists the decisions, the known weaknesses and what is still open.

## Tests

`node --test` from the root of the repository (Node only, no packages). `tests/agent/README.md` explains every test in plain words.

## How it is made

The game design and every decision are by the project's author, who works with an AI coding agent (Claude): the agent writes code and tests, and `AGENTS.md` is the shared record of the decisions.

## License

None chosen yet, so no one has the right to reuse the code until one is added.
