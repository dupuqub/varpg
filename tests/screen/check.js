// The checks of the Screen desk's work order (docs/screen-plan.md), one per parcel:
//
//   node tests/screen/check.js T1      every object type has a color (no browser)
//   node tests/screen/check.js T2      the text of the COMBAT REPORT (no browser)
//   node tests/screen/check.js T3      the death on the screen (a real browser: Chrome, driven by puppeteer-core)
//   node tests/screen/check.js T4      the line of the journal that says the mission was aborted (a real browser too)
//   node tests/screen/check.js T5      Chamber 3 on the menu and in play, and a Jumper drawn as a green square (a real browser too)
//
// It prints one line per thing checked ("ok" or "NOT OK") and ends with CHECK PASSED or CHECK FAILED (exit code 1).
// These are not tests of the rules (those are tests/agent/) and `node --test` does not run this file.
// T3 and T4 need: npm install --prefix /tmp/screencheck puppeteer-core
//           NODE_PATH=/tmp/screencheck/node_modules node tests/screen/check.js T3
// These two checks kill the avatar by writing its health from outside the game. Only a check may do that: the screen never writes the state.

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
    const journal = createJournal();
    for (let i = 0; i < 900; i++) step(state, { move: { x: 0, y: 0 }, dash: false }, run.blueprint, null, journal);
    return JSON.stringify(journal.map((line) => JSON.parse(line)).filter((entry) => entry.event === "hit"));
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

// Opens the game in Chrome and enters Chamber 2 (or the screen it is given). kill() leaves the avatar with no health, so the next step aborts the mission.
async function openGame(screenId = "screen-chamber-2") {
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const kill = () => page.evaluate(() => { state.actors.find((actor) => actor.id === AVATAR_ID).health.now = 0; });
  await page.goto("file://" + path.join(ROOT, "index.html"));
  await page.click('[data-goto="screen-chambers"]');
  await page.click(`[data-goto="${screenId}"]`);
  await wait(700);
  return { browser, page, errors, wait, kill };
}

// T3: after the avatar's death the frames stop, the buttons stay, back and forward still walk the history, there is no resume
// line on an aborted state, and play from an earlier frame goes on (the history is a debugger for now: the user, issue 42).
async function checkT3() {
  const { browser, page, errors, wait, kill } = await openGame();
  // What the screen shows now, read from the page.
  const look = (id) => page.evaluate((id) => {
    const part = (name) => document.querySelector(`#${id} [data-control="${name}"]`);
    const alert = part("aborted");
    return {
      frame: state.frame, mission: state.mission, paused, snaps: runHistory.snaps.length, viewIndex, lines: journal.length, last: journal[journal.length - 1],
      status: part("status").textContent, toggleOff: part("toggle").disabled, backOff: part("back").disabled, forwardOff: part("forward").disabled,
      alert: alert === null ? "none" : alert.hidden ? "hidden" : "shown",
    };
  }, id);

  const two = "screen-chamber-2";
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
  const resumeLines = await page.evaluate(() => journal.map((line) => JSON.parse(line)).filter((entry) => entry.event === "resume").length);
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

// T4: the combat log gets one line when the mission is aborted (the user, 2026-11-15: "it will be useful to debug some moments"),
// with the frame of the death, once per death: a death undone by the history and died again writes it again.
async function checkT4() {
  const { browser, page, errors, wait, kill } = await openGame();
  const log = () => page.evaluate(() => ({ frame: state.frame, mission: state.mission, entries: journal.map((line) => JSON.parse(line)) }));
  const aborted = (entries) => entries.filter((entry) => entry.event === "aborted");

  await kill();
  await wait(400);
  const dead = await log();
  const last = dead.entries[dead.entries.length - 1];
  expect(dead.mission === "aborted", "the avatar with no health aborts the mission");
  expect(last.event === "aborted" && last.frame === dead.frame, "the last line of the log is { frame, event: \"aborted\" } with the frame of the death");
  expect(Object.keys(last).sort().join(",") === "event,frame", "that line has only the frame and the event");
  await wait(400);
  await page.keyboard.press("p");
  await page.keyboard.press(".");
  expect(aborted((await log()).entries).length === 1, "it is written once, however long the frozen state is shown");

  const back = '#screen-chamber-2 [data-control="back"]';
  await page.click(back);
  await page.click('#screen-chamber-2 [data-control="forward"]');
  expect(aborted((await log()).entries).length === 1, "walking back and forward through the saved frames writes nothing");

  await page.click(back);
  await page.click(back);
  await page.click('#screen-chamber-2 [data-control="toggle"]');
  await wait(300);
  await kill();
  await wait(400);
  const again = await log();
  expect(aborted(again.entries).length === 2 && again.entries[again.entries.length - 1].event === "aborted", "a death undone and died again writes the line again");

  expect(errors.length === 0, "no error on the page" + (errors.length ? ": " + errors[0] : ""));
  await browser.close();
}

// T5 (issue 78): Chamber 3 is on the menu, plays like Chamber 2 (pause, history, ABORT MISSION) and its Jumpers are drawn as green squares,
// told from the red circles of the Biters by color and by shape. The colors are read from the pixels of the canvas.
async function checkT5() {
  const { browser, page, errors, wait, kill } = await openGame("screen-chamber-3");
  const three = "screen-chamber-3";
  expect(await page.$eval('[data-goto="screen-chamber-3"]', (button) => button.textContent.includes("CHAMBER 3")), "the menu has the entry of Chamber 3");
  await wait(1500);
  const counts = await page.evaluate(() => ({
    frame: state.frame,
    jumpers: state.actors.filter((actor) => actor.type === "jumper").length,
    biters: state.actors.filter((actor) => actor.type === "biter").length,
  }));
  expect(counts.frame > 0 && counts.jumpers === 4 && counts.biters >= 40, `Chamber 3 has its 4 Jumpers and the Biters of Chamber 2 (jumpers ${counts.jumpers}, biters ${counts.biters})`);

  // Wait for a Jumper to come into the open part of the screen, then pause so the picture holds still and read its pixels.
  let seen = null;
  for (let i = 0; i < 80 && seen === null; i++) {
    await page.keyboard.press("p");
    seen = await page.evaluate(() => {
      const avatar = state.actors.find((actor) => actor.id === AVATAR_ID);
      const canvas = document.getElementById("canvas-3");
      const onScreen = (actor) => ({ x: actor.position.x - avatar.position.x + canvas.width / 2, y: actor.position.y - avatar.position.y + canvas.height / 2 });
      const free = (actor) => state.actors.every((other) => other === actor || Math.hypot(other.position.x - actor.position.x, other.position.y - actor.position.y) > actor.radius * 2 + other.radius + 4);
      const jumper = state.actors.find((actor) => {
        const at = onScreen(actor);
        return actor.type === "jumper" && free(actor) && at.x > 300 && at.x < canvas.width - 300 && at.y > 200 && at.y < canvas.height - 300;
      });
      if (!jumper) return null;
      const at = onScreen(jumper);
      const pixel = (x, y) => Array.from(canvas.getContext("2d").getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(0, 3);
      return { radius: jumper.radius, center: pixel(at.x, at.y), corner: pixel(at.x + jumper.radius - 3, at.y + jumper.radius - 3) };
    });
    if (seen === null) { await page.keyboard.press("p"); await wait(250); }
  }
  expect(seen !== null, "a Jumper came into the open part of the screen to be looked at");
  if (seen !== null) {
    const green = (rgb) => Math.abs(rgb[0] - 79) < 6 && Math.abs(rgb[1] - 209) < 6 && Math.abs(rgb[2] - 122) < 6;
    expect(green(seen.center), "the center of the Jumper is green: " + seen.center.join(","));
    expect(green(seen.corner), "the corner of its square is green too (a circle would be black there): " + seen.corner.join(","));
    expect(seen.radius > 18, "the Jumper is bigger than a Biter (radius " + seen.radius + " against 18 or less)");
  }

  await page.keyboard.press("p"); // play again (the loop above paused it)
  const paused = await page.evaluate(() => paused);
  if (paused) await page.keyboard.press("p");
  await kill();
  await wait(400);
  const dead = await page.evaluate((id) => {
    const alert = document.querySelector(`#${id} [data-control="aborted"]`);
    return { mission: state.mission, alert: alert === null ? "none" : alert.hidden ? "hidden" : "shown", status: document.querySelector(`#${id} [data-control="status"]`).textContent, backOff: document.querySelector(`#${id} [data-control="back"]`).disabled };
  }, three);
  expect(dead.mission === "aborted" && dead.alert === "shown" && dead.status.includes("ABORTED"), "Chamber 3: the death aborts the mission and shows ABORT MISSION");
  await page.click(`#${three} [data-control="back"]`);
  expect(await page.evaluate(() => viewIndex < runHistory.snaps.length - 1), "Chamber 3: back walks the history after the death");
  expect(errors.length === 0, "no error on the page" + (errors.length ? ": " + errors[0] : ""));
  await browser.close();
}

const CHECKS = { T1: checkT1, T2: checkT2, T3: checkT3, T4: checkT4, T5: checkT5 };
const which = process.argv[2];
if (!CHECKS[which]) {
  console.log("usage: node tests/screen/check.js T1|T2|T3|T4|T5");
  process.exit(2);
}
Promise.resolve()
  .then(() => CHECKS[which]())
  .catch((error) => expect(false, "the check itself ran to its end: " + String(error).split("\n")[0]))
  .then(() => {
    console.log(failures.length === 0 ? "CHECK PASSED" : `CHECK FAILED (${failures.length})`);
    process.exit(failures.length === 0 ? 0 : 1);
  });
