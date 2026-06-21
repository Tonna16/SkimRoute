const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const testDir = path.join(root, "tests");
const tests = fs.readdirSync(testDir)
  .filter((name) => name.endsWith(".test.js") && !name.endsWith(".browser.test.js"))
  .sort();

let failed = false;
for (const test of tests) {
  const relative = path.join("tests", test);
  console.log(`Running ${relative}`);
  const result = spawnSync(process.execPath, [path.join(testDir, test)], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    failed = true;
    break;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Node test suite passed.");
}
