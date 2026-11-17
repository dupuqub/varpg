# How to run

Online: `https://dupuqub.github.io/varpg/` (the last push to `main` that passed the tests). Locally: open `index.html` in the browser. The scripts are plain (no modules), so no server is needed.

## Tests

From the root of the repository: `node --test` (no path; Node finds the `*.test.js` files). A good run shows `# fail 0` in the summary at its end. The user can paste the whole output to the agent. The tests load the browser scripts into a `vm` context, so they do not need to become modules; the test file passes the starter blueprint to `step` by default. Whenever a rule or a value changes on purpose, update the numbers in the tests and in `tests/agent/README.md`.
