// Measures what the layers of the ground cost (not a test). From the root of the repository:
//   node tests/agent/benchmark-layers.js          the real definitions (one layer)
//   node tests/agent/benchmark-layers.js huge     the same, plus a layer of huge objects added in memory (not in src/data.js)
// It prints how many objects the seed makes in 20 seeds and how long a step takes with the real number of Dummies.
// The times depend on the machine: compare the two runs on the same machine, one after the other.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = path.join(__dirname, "..", "..", "src");
const withHuge = process.argv[2] === "huge";

function dataText() {
  const text = fs.readFileSync(path.join(SRC, "data.js"), "utf8");
  if (!withHuge) return text;
  const giant = '    giant: { name: "Giant", size: { min: 128, max: 256 }, weightPerRadius: 100, healthRange: { min: 10, max: 20 } },\n    rock: {';
  const afterSmall = "        },\n      },\n    },\n\n    // The Dummies of Chamber 1";
  const hugeLayer = '        },\n        huge: { cellSize: 2048, chancePercent: 50, safeRadius: 420, kinds: ["giant"] },\n      },\n    },\n\n    // The Dummies of Chamber 1';
  if (!text.includes("    rock: {") || !text.includes(afterSmall)) throw new Error("the patch for the huge layer does not apply to src/data.js");
  return text.replace("    rock: {", giant).replace(afterSmall, hugeLayer);
}

const game = vm.createContext({});
vm.runInContext(dataText(), game);
vm.runInContext(fs.readFileSync(path.join(SRC, "sim.js"), "utf8"), game);

const result = vm.runInContext(`(() => {
  let small = 0;
  let huge = 0;
  for (let seed = 1; seed <= 20; seed++) {
    for (const object of objectsInArea(seed, -6000, -6000, 6000, 6000)) {
      if (object.layer === "huge") huge++; else small++;
    }
  }
  const state = createChamber1State(1, 1);
  const blueprint = createRun(1).blueprint;
  const input = { move: { x: 0, y: 0 } };
  for (let frame = 0; frame < 30; frame++) step(state, input, blueprint); // warm up
  const start = Date.now();
  for (let frame = 0; frame < 300; frame++) step(state, input, blueprint);
  return { small, huge, dummies: state.actors.length - 1, msPerStep: (Date.now() - start) / 300 };
})()`, game);

console.log((withHuge ? "with a huge layer" : "real definitions") + ": " + result.small + " small objects and " + result.huge + " huge ones in 20 seeds (area 12000 x 12000), "
  + result.dummies + " Dummies, " + result.msPerStep.toFixed(2) + " ms per step");
