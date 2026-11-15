// The checks of the Screen desk's work order (docs/screen-plan.md), one per parcel:
//
//   node tests/screen/check.js T1      every object type has a color (no browser)
//   node tests/screen/check.js T2      the text of the COMBAT REPORT (no browser)
//   node tests/screen/check.js T3      the death on the screen (a real browser: Chrome, driven by puppeteer-core)
//
// It prints one line per thing checked ("ok" or "NOT OK") and ends with CHECK PASSED or CHECK FAILED (exit code 1).
// These are not tests of the rules (those are tests/agent/) and `node --test` does not run this file.
// T3 needs: npm install --prefix /tmp/screencheck puppeteer-core
//           NODE_PATH=/tmp/screencheck/node_modules node tests/screen/check.js T3
// The T3 check kills the avatar by writing its health from outside the game. Only a check may do that: the screen never writes the state.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const failures = [];

function expect(ok, what) {
  console.log((ok ? "ok      " : "NOT OK  ") + what);
  if (!ok) failures.push(what);
}

// Loads the plain scripts of the game into one context, the way tests/agent does, with a page that does nothing.
function loadScripts(names) {
  const element = { addEventListener() {} };
  const page = { getElementById: () => element, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ document: page, window: { addEventListener() {} }, navigator: {}, console });
  for (const name of names) vm.runInContext(fs.readFileSync(path.join(ROOT, "src", name + ".js"), "utf8"), context);
  return context;
}

// T1: an object type with no color is drawn in whatever color was set last.
function checkT1() {
  const game = loadScripts(["version", "data", "sim", "history", "input", "render"]);
  const types = vm.runInContext("Object.keys(DEFINITIONS.objects)", game);
  const colors = vm.runInContext("OBJECT_COLORS", game);
  for (const type of types) expect(/^#[0-9a-f]{6}$/.test(colors[type] || ""), `the object "${type}" has a color in OBJECT_COLORS`);
  const used = types.map((type) => colors[type]);
  expect(new Set(used).size === used.length, "no two object types share a color");
}

// T2: the report has no minimum damage, counts the hits of 0, and prints both calculations of every hit that broke the shield.
// What it expects is read from the same fight the report plays, so a change of the data does not break this check.
function checkT2() {
  const game = loadScripts(["version", "data", "sim", "history", "chamber-0"]);
  const report = vm.runInContext("combatReportText()", game);
  const hits = JSON.parse(vm.runInContext(`(() => {
    const run = createRun(1, DEFINITIONS.combatBlueprint);
    const state = createChamber2State(run.id, 1, run.blueprint);
    const audit = createAudit();
    for (let i = 0; i < 900; i++) step(state, { move: { x: 0, y: 0 }, dash: false }, run.blueprint, null, audit);
    return JSON.stringify(audit.map((line) => JSON.parse(line)).filter((entry) => entry.event === "hit"));
  })()`, game));
  const lines = report.split("\n");
  const number = (value) => value.toFixed(2);

  expect(!report.includes("minimum"), 'the report does not say "minimum"');
  expect(!report.includes("undefined") && !report.includes("NaN"), 'the report has no "undefined" and no "NaN"');
  const zero = hits.filter((hit) => hit.total === 0).length;
  expect(lines.includes(`hits of 0 (a hit that took nothing): ${zero}`), `the report has the line "hits of 0 (a hit that took nothing): ${zero}"`);
  const broke = hits.filter((hit) => hit.overflow);
  expect(broke.length > 0, "this fight has a hit that broke the shield (if not, the data changed: call the user)");
  expect(lines.includes(`hits that broke the shield: ${broke.length}`), `the report has the line "hits that broke the shield: ${broke.length}"`);
  for (const hit of broke) {
    const line = lines.find((text) => text.startsWith(`  frame ${hit.frame}: ${hit.source} ${hit.attack} -> ${hit.target}: with the shield: `)) || "";
    const pieces = [
      `= ${number(hit.overflow.withShield)}`,
      `the shield took ${number(hit.overflow.absorbed)}`,
      `${(hit.overflow.share * 100).toFixed(1)}%`,
      "against the body: ",
      `= ${number(hit.overflow.total)}`,
      `total ${number(hit.total)}`,
    ];
    expect(line !== "", `the hit of frame ${hit.frame} that broke the shield starts "with the shield: "`);
    for (const piece of pieces) expect(line.includes(piece), `the hit of frame ${hit.frame} prints "${piece}"`);
  }
}

// T3: after the avatar's death the frames stop, the buttons stay, back and forward still walk the history, there is no resume
// line on an aborted state, and play from an earlier frame goes on (the history is a debugger for now: the user, issue 42).
async function checkT3() {
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const kill = () => page.evaluate(() => { state.actors.find((actor) => actor.id === AVATAR_ID).health.now = 0; });
  // What the screen shows now, read from the page.
  const look = (id) => page.evaluate((id) => {
    const part = (name) => document.querySelector(`#${id} [data-control="${name}"]`);
    const alert = part("aborted");
    return {
      frame: state.frame, mission: state.mission, paused, snaps: runHistory.snaps.length, viewIndex, lines: audit.length, last: audit[audit.length - 1],
      status: part("status").textContent, toggleOff: part("toggle").disabled, backOff: part("back").disabled, forwardOff: part("forward").disabled,
      alert: alert === null ? "none" : alert.hidden ? "hidden" : "shown",
    };
  }, id);

  await page.goto("file://" + path.join(ROOT, "index.html"));
  await page.click('[data-goto="screen-chambers"]');
  await page.click('[data-goto="screen-chamber-2"]');
  const two = "screen-chamber-2";
  await wait(700);
  expect((await look(two)).alert === "hidden", "Chamber 2, alive: the alert exists and is hidden");
  await kill();
  await wait(400);
  const dead = await look(two);
  expect(dead.mission === "aborted", "Chamber 2: the avatar with no health aborts the mission");
  await wait(500);
  const later = await look(two);
  expect(later.frame === dead.frame && later.snaps === dead.snaps, "after the death no frame runs and no snap is saved");
  expect(later.paused === true, "after the death the game is paused");
  expect(later.alert === "shown", "after the death the alert is shown");
  expect(later.status.includes("ABORTED"), 'after the death the status says "ABORTED"');
  expect(later.toggleOff && later.forwardOff && !later.backOff, "on the frame of the death: play and forward are disabled, back is not");

  await page.keyboard.press("p");
  await page.keyboard.press("p");
  await page.keyboard.press(".");
  const pressed = await look(two);
  expect(pressed.lines === later.lines && pressed.paused && pressed.frame === later.frame, "the keys P (twice) and . on the frame of the death change nothing and write no resume line");

  await page.click(`#${two} [data-control="back"]`);
  const before = await look(two);
  expect(before.mission === "running" && before.alert === "hidden" && !before.toggleOff && !before.status.includes("ABORTED"), "one frame back: the mission is running, the alert is hidden, play is enabled");
  await page.click(`#${two} [data-control="forward"]`);
  const again = await look(two);
  expect(again.mission === "aborted" && again.alert === "shown" && again.snaps === later.snaps, "forward again: the frame of the death, the alert is shown, no new snap");

  // A touch on the alert belongs to the page, like a touch on the top bar (src/input.js), or its button could not be tapped on a phone.
  const prevented = await page.evaluate((id) => {
    const button = document.querySelector(`#${id} [data-control="aborted"] button`);
    const touch = new Touch({ identifier: 9, target: button, clientX: 5, clientY: 5 });
    const event = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] });
    button.dispatchEvent(event);
    const end = new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] });
    button.dispatchEvent(end);
    return event.defaultPrevented;
  }, two);
  expect(prevented === false, "a touch on the button of the alert is not taken by the game");

  await page.click(`#${two} [data-control="back"]`);
  await page.click(`#${two} [data-control="back"]`);
  await page.click(`#${two} [data-control="toggle"]`);
  await wait(400);
  const resumed = await look(two);
  const resumeLines = await page.evaluate(() => audit.map((line) => JSON.parse(line)).filter((entry) => entry.event === "resume").length);
  expect(resumed.mission === "running" && resumed.frame > dead.frame && !resumed.paused, "play from an earlier frame goes on past the frame of the death (the death is undone)");
  expect(resumeLines === 1, "that play wrote the only resume line of the log");
  expect((await page.evaluate(() => crossCheck(runHistory))) === null, "the cross-check of the history says none");

  await kill();
  await wait(400);
  await page.click(`#${two} [data-control="aborted"] button`);
  expect(await page.evaluate(() => !document.getElementById("screen-menu").hidden), "the button of the alert leads to the entry screen");

  // Chamber 1 has no alert, and the same loop: the frames stop and the status says so.
  await page.click('[data-goto="screen-chambers"]');
  await page.click('[data-goto="screen-chamber-1"]');
  const one = "screen-chamber-1";
  await wait(400);
  await kill();
  await wait(400);
  const first = await look(one);
  await wait(400);
  const second = await look(one);
  expect(second.mission === "aborted" && second.frame === first.frame && second.paused && second.status.includes("ABORTED") && second.alert === "none", "Chamber 1: the frames stop and the status says ABORTED, with no alert");

  expect(errors.length === 0, "no error on the page" + (errors.length ? ": " + errors[0] : ""));
  await browser.close();
}

const CHECKS = { T1: checkT1, T2: checkT2, T3: checkT3 };
const which = process.argv[2];
if (!CHECKS[which]) {
  console.log("usage: node tests/screen/check.js T1|T2|T3");
  process.exit(2);
}
Promise.resolve()
  .then(() => CHECKS[which]())
  .catch((error) => expect(false, "the check itself ran to its end: " + String(error).split("\n")[0]))
  .then(() => {
    console.log(failures.length === 0 ? "CHECK PASSED" : `CHECK FAILED (${failures.length})`);
    process.exit(failures.length === 0 ? 0 : 1);
  });
