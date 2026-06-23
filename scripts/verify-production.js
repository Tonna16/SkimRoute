const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const requiredDependencies = {
  "@tesseract.js-data/eng": "1.0.0",
  "pdfjs-dist": "6.0.227",
  "tesseract.js": "7.0.0",
  "tesseract.js-core": "7.0.0"
};

const requiredRuntimeFiles = [
  "node_modules/pdfjs-dist/build/pdf.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "node_modules/tesseract.js/dist/tesseract.esm.min.js",
  "node_modules/tesseract.js/dist/worker.min.js",
  "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
  "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"
];

const generatedCopies = [
  ["content/adapters.js", "assets/adapters.js"],
  ["content/engine.js", "assets/engine.js"],
  ["content/ui.js", "assets/ui.js"],
  ["content-core.js", "assets/content-core.js"],
  ["pdf-runtime.js", "assets/pdf-runtime.js"],
  ["ocr-runtime.js", "assets/ocr-runtime.js"],
  ["popup.js", "assets/popup.js"],
  ["background.js", "assets/background.js"]
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertVersionConsistency() {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const manifest = readJson("manifest.json");
  assert(pkg.version === manifest.version, `package.json version ${pkg.version} does not match manifest.json version ${manifest.version}.`);
  assert(lock.version === pkg.version, `package-lock.json root version ${lock.version} does not match package.json version ${pkg.version}.`);
  assert(lock.packages && lock.packages[""] && lock.packages[""].version === pkg.version, "package-lock.json packages[\"\"] version is out of sync.");
  const contentVersion = readText("content-core.js").match(/SKIMROUTE_CONTENT_VERSION\s*=\s*"([^"]+)"/);
  assert(contentVersion && contentVersion[1] === `${pkg.version}-core`, `content-core.js runtime version must be ${pkg.version}-core.`);
  const legacyContentVersion = exists("content.js") && readText("content.js").match(/SKIMROUTE_CONTENT_VERSION\s*=\s*"([^"]+)"/);
  assert(!legacyContentVersion || legacyContentVersion[1] === `${pkg.version}-core`, `content.js runtime version must be ${pkg.version}-core.`);
}

function assertDependencies() {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  assert(pkg.engines && pkg.engines.node === ">=22.13.0 || >=24", "package.json must declare the Node engine required by packaged PDF.js.");
  Object.entries(requiredDependencies).forEach(([name, version]) => {
    assert(pkg.dependencies && pkg.dependencies[name] === version, `package.json must declare ${name}@${version}.`);
    const lockEntry = lock.packages && lock.packages[`node_modules/${name}`];
    assert(lockEntry && lockEntry.version === version, `package-lock.json must lock ${name}@${version}.`);
  });
  assert(pkg.devDependencies && pkg.devDependencies["@playwright/test"] === "1.60.0", "Playwright browser tests must stay pinned to @playwright/test@1.60.0.");
}

function assertRuntimeFiles() {
  requiredRuntimeFiles.forEach((relativePath) => {
    assert(exists(relativePath), `${relativePath} is missing. Run npm ci before building or packaging.`);
  });
}

function assertGeneratedAssets() {
  generatedCopies.forEach(([source, destination]) => {
    assert(exists(destination), `${destination} is missing. Run npm run build.`);
    assert(readText(source) === readText(destination), `${destination} is out of sync with ${source}. Run npm run build.`);
  });
}

function assertManifestPackageShape() {
  const manifest = readJson("manifest.json");
  const contentScript = manifest.content_scripts && manifest.content_scripts[0] || {};
  assert(contentScript.all_frames !== true, "Manifest content script must not use all_frames: true.");
  assert(contentScript.match_about_blank !== true, "Manifest content script must not use match_about_blank.");
  const contentFiles = new Set((contentScript.js || []).map(String));
  ["assets/pdf-runtime.js", "assets/ocr-runtime.js"].forEach((file) => {
    assert(!contentFiles.has(file), `${file} must remain web-accessible only, not a manifest content script.`);
  });
}

function assertProductionDebugDisabled() {
  const debugConfig = readText("debug-config.js");
  assert(!/SKIMROUTE_DEV_MODE\s*=\s*true\b/.test(debugConfig), "debug-config.js must not enable SKIMROUTE_DEV_MODE for production builds.");
  assert(/SKIMROUTE_DEV_MODE\s*=\s*false\b/.test(debugConfig), "debug-config.js must explicitly set SKIMROUTE_DEV_MODE = false for production builds.");
}

function assertStoreAssets() {
  ["16", "32", "48", "128"].forEach((size) => {
    assert(exists(`assets/icons/icon${size}.png`), `assets/icons/icon${size}.png is missing.`);
  });
}

function assertNoStaleArtifacts() {
  [
    "assets/content.js-BzKMfaWY.js",
    "assets/popup.html-C-AIiryS.js",
    "assets/background.js-DHppkjD5.js",
    "playwright-report",
    ".playwright"
  ].forEach((relativePath) => {
    assert(!exists(relativePath), `${relativePath} must not be present in a production checkout/package source.`);
  });
}

assertVersionConsistency();
assertDependencies();
assertRuntimeFiles();
assertGeneratedAssets();
assertManifestPackageShape();
assertProductionDebugDisabled();
assertStoreAssets();
assertNoStaleArtifacts();
console.log("Production package checks passed.");
