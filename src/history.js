// Run history: the last HISTORY_SIZE snaps (saved copies of the state) and the
// last HISTORY_SIZE inputs. There are no buttons for it yet.
//
// Two lists, same length, and index 0 is the oldest. Same index = same frame:
//   snaps[i]  = the state at that frame
//   inputs[i] = the input of the step that produced snaps[i]
// The very first snap has no input (null), because nothing produced it.
// Like the rules, this file knows nothing about the screen.

const HISTORY_SIZE = 100;

// A deep copy of plain JSON data. The state is JSON, so this is always possible.
function copyOf(value) {
  return JSON.parse(JSON.stringify(value));
}

// Starts a history with the initial state, before any step. It also keeps the build
// of the run (it does not change during a run), because replaying needs it.
function createHistory(state, build) {
  return { snaps: [copyOf(state)], inputs: [null], build: copyOf(build) };
}

// Call right after step(): saves the new state and the input that produced it.
// The oldest ones (index 0) leave when there are more than HISTORY_SIZE.
function recordFrame(history, state, input) {
  history.snaps.push(copyOf(state));
  history.inputs.push(copyOf(input));
  while (history.snaps.length > HISTORY_SIZE) {
    history.snaps.shift();
    history.inputs.shift();
  }
}

// A copy of a snap, to load as the live state. It must be a copy, because
// step() changes the state in place and would otherwise rewrite the history.
function stateFromSnap(history, index) {
  return copyOf(history.snaps[index]);
}

// Pressing play on a past frame: everything after it is discarded, snaps and
// inputs together, and the run continues from there with new inputs.
function discardAfter(history, index) {
  history.snaps.length = index + 1;
  history.inputs.length = index + 1;
}

// The cross-check. Takes the oldest snap, applies the saved inputs with step(),
// and compares each result with the saved snap of the same frame.
// Returns null if everything matches, or the first difference:
//   { frame, path, expected, actual }  (for example path "actors[3].position.x")
// It proves the run is repeatable, not that the rules are right.
function crossCheck(history) {
  const state = copyOf(history.snaps[0]);
  for (let i = 1; i < history.snaps.length; i++) {
    step(state, copyOf(history.inputs[i]), history.build);
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
