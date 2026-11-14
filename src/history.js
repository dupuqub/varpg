// Run history: the last HISTORY_SIZE snaps (saved copies of the state) and the
// last HISTORY_SIZE inputs. The pause, back and forward buttons of the game views (src/main.js) walk through it.
//
// Two lists, same length, and index 0 is the oldest. Same index = same frame:
//   snaps[i]  = the state at that frame
//   inputs[i] = the input of the step that produced snaps[i]
// The very first snap has no input (null), because nothing produced it.
// Like the rules, this file knows nothing about the screen.

// 120 snaps: two whole seconds at 60 steps per second (the user's choice, 2026-11-12: a round number to look at; it costs a
// copy of the state per frame, which the history already made, and about 120 copies kept in memory).
const HISTORY_SIZE = 120;

// A deep copy of plain JSON data. The state is JSON, so this is always possible.
function copyOf(value) {
  return JSON.parse(JSON.stringify(value));
}

// Starts a history with the initial state, before any step. It also keeps the blueprint
// of the run (it does not change during a run), because replaying needs it.
// The visual state (src/sim.js, createVisual) is optional: when given, the history keeps a copy of it per snap, in `visuals`
// (the same index), so stepping back can show the traces of that frame. The cross-check never reads `visuals`.
// The combat audit (createAudit) is NOT kept here: it is the observer's notebook, outside the history, and only grows (the user, 2026-11-13).
function createHistory(state, blueprint, visual = null) {
  return { snaps: [copyOf(state)], inputs: [null], visuals: [visual === null ? null : copyOf(visual)], blueprint: copyOf(blueprint) };
}

// Call right after step(): saves the new state and the input that produced it.
// The oldest ones (index 0) leave when there are more than HISTORY_SIZE.
// A state that did not advance (its frame is the last snap's, as with an aborted mission) is not recorded twice.
function recordFrame(history, state, input, visual = null) {
  if (state.frame === history.snaps[history.snaps.length - 1].frame) return;
  history.snaps.push(copyOf(state));
  history.inputs.push(copyOf(input));
  history.visuals.push(visual === null ? null : copyOf(visual));
  while (history.snaps.length > HISTORY_SIZE) {
    history.snaps.shift();
    history.inputs.shift();
    history.visuals.shift();
  }
}

// A copy of the visual state of a snap (or null when none was kept), to show while looking at that frame.
function visualFromSnap(history, index) {
  const visual = history.visuals[index];
  return visual === null || visual === undefined ? null : copyOf(visual);
}

// A copy of a snap, to load as the live state. It must be a copy, because
// step() changes the state in place and would otherwise rewrite the history.
function stateFromSnap(history, index) {
  const snap = history.snaps[index];
  // A snap made under other definitions would replay under rules it was not played with: refuse it, loudly.
  if (snap.definitionsVersion !== DEFINITIONS_VERSION) {
    throw new Error("The snap is of definitions version " + snap.definitionsVersion + " and the game has version " + DEFINITIONS_VERSION);
  }
  return copyOf(snap);
}

// Pressing play on a past frame: everything after it is discarded, snaps and
// inputs together, and the run continues from there with new inputs.
function discardAfter(history, index) {
  history.snaps.length = index + 1;
  history.inputs.length = index + 1;
  history.visuals.length = index + 1;
}

// The cross-check. Takes the oldest snap, applies the saved inputs with step(),
// and compares each result with the saved snap of the same frame.
// Returns null if everything matches, or the first difference:
//   { frame, path, expected, actual }  (for example path "actors[3].position.x")
// It proves the run is repeatable, not that the rules are right.
function crossCheck(history) {
  const state = copyOf(history.snaps[0]);
  for (let i = 1; i < history.snaps.length; i++) {
    step(state, copyOf(history.inputs[i]), history.blueprint);
    const difference = findDifference(history.snaps[i], state, "");
    if (difference !== null) {
      return { frame: history.snaps[i].frame, ...difference };
    }
  }
  return null;
}

// First difference between two plain JSON values, or null if they are equal.
// path = where we are, for example "actors[0].position.x".
function findDifference(expected, actual, path) {
  const bothObjects =
    typeof expected === "object" && expected !== null &&
    typeof actual === "object" && actual !== null;

  if (!bothObjects) {
    return expected === actual ? null : { path, expected, actual };
  }

  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    const childPath = Array.isArray(expected) ? `${path}[${key}]` : path === "" ? key : `${path}.${key}`;
    const difference = findDifference(expected[key], actual[key], childPath);
    if (difference !== null) return difference;
  }
  return null;
}
