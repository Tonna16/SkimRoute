const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

const assetCopies = [
  ["content/adapters.js", "assets/adapters.js"],
  ["content/engine.js", "assets/engine.js"],
  ["content/ui.js", "assets/ui.js"],
  ["content-core.js", "assets/content-core.js"],
  ["pdf-runtime.js", "assets/pdf-runtime.js"],
  ["ocr-runtime.js", "assets/ocr-runtime.js"],
  ["popup.js", "assets/popup.js"],
  ["background.js", "assets/background.js"]
];

const staleAssets = [
  "assets/adapters.js-BxVfMoxi.js",
  "assets/engine.js-BJkAhsDZ.js",
  "assets/ui.js-DPUnGKsp.js",
  "assets/content.js-BzKMfaWY.js",
  "assets/popup.html-C-AIiryS.js",
  "assets/background.js-DHppkjD5.js"
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function writeText(relativePath, text) {
  fs.writeFileSync(path.join(root, relativePath), text);
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function normalizeList(values) {
  return values.map((value) => String(value || "").replace(/\\/g, "/"));
}

function parsePopupContentFiles() {
  const popupScript = readText("popup.js");
  const match = popupScript.match(/const\s+CONTENT_FILES\s*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    throw new Error("Could not find popup CONTENT_FILES list.");
  }
  return normalizeList(
    Array.from(match[1].matchAll(/"([^"]+)"/g), (entry) => entry[1])
  );
}

function assertSameContentFiles() {
  const manifest = readJson("manifest.json");
  const manifestFiles = normalizeList(
    manifest.content_scripts && manifest.content_scripts[0] && manifest.content_scripts[0].js || []
  );
  const popupFiles = parsePopupContentFiles();
  const manifestKey = JSON.stringify(manifestFiles);
  const popupKey = JSON.stringify(popupFiles);
  if (manifestKey !== popupKey) {
    throw new Error(`Popup fallback CONTENT_FILES must match manifest content scripts.\nmanifest: ${manifestKey}\npopup:    ${popupKey}`);
  }
}

function assertTopFrameOnly() {
  const manifest = readJson("manifest.json");
  const contentScript = manifest.content_scripts && manifest.content_scripts[0] || {};
  if (contentScript.all_frames === true) {
    throw new Error("Manifest content script must not use all_frames: true.");
  }
  if (contentScript.match_about_blank === true) {
    throw new Error("Manifest content script must not use match_about_blank without a scoped frame script.");
  }
}

function assertOptionalRuntimesNotContentScripts() {
  const manifest = readJson("manifest.json");
  const manifestFiles = normalizeList(
    manifest.content_scripts && manifest.content_scripts[0] && manifest.content_scripts[0].js || []
  );
  const forbidden = ["assets/pdf-runtime.js", "assets/ocr-runtime.js"];
  const loaded = forbidden.filter((file) => manifestFiles.includes(file));
  if (loaded.length) {
    throw new Error(`Optional runtimes must not be manifest content scripts: ${loaded.join(", ")}`);
  }
}

function assertNoHeavyRuntimeInCore() {
  const corePaths = ["content-core.js", "content.js", "assets/content-core.js"].filter(fileExists);
  const forbiddenPatterns = [
    /pdfjs-dist\/build\/pdf\.min\.mjs/i,
    /tesseract\.esm\.min\.js/i,
    /createWorker\(/,
    /loadTesseractModule/,
    /extractPdfTextWithAdaptiveOcr/,
    /getDocument\(\{/
  ];
  for (const relativePath of corePaths) {
    const text = readText(relativePath);
    const hit = forbiddenPatterns.find((pattern) => pattern.test(text));
    if (hit) {
      throw new Error(`${relativePath} still contains heavy PDF/OCR implementation token: ${hit}`);
    }
  }
}

function assertNoStaleAssetsPresent() {
  const present = staleAssets.filter(fileExists);
  if (present.length) {
    throw new Error(`Stale generated JS assets are still present: ${present.join(", ")}`);
  }
}

function assertAssetSynced(source, destination) {
  const sourceText = readText(source);
  if (!fileExists(destination)) {
    throw new Error(`${destination} is missing.`);
  }
  const destinationText = readText(destination);
  if (sourceText !== destinationText) {
    throw new Error(`${destination} is out of sync with ${source}. Run npm run build.`);
  }
}

function syncAssets() {
  for (const [source, destination] of assetCopies) {
    if (checkOnly) {
      assertAssetSynced(source, destination);
      console.log(`checked ${source} -> ${destination}`);
    } else {
      writeText(destination, readText(source));
      console.log(`${source} -> ${destination}`);
    }
  }
}

syncAssets();
assertSameContentFiles();
assertTopFrameOnly();
assertOptionalRuntimesNotContentScripts();
assertNoHeavyRuntimeInCore();
assertNoStaleAssetsPresent();
console.log(checkOnly ? "Asset check complete." : "Asset sync complete.");
