const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const assetCopies = [
  ["content/adapters.js", "assets/adapters.js-BxVfMoxi.js"],
  ["content/engine.js", "assets/engine.js-BJkAhsDZ.js"],
  ["content/ui.js", "assets/ui.js-DPUnGKsp.js"],
  ["content.js", "assets/content.js-BzKMfaWY.js"]
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

function normalizeList(values) {
  return values.map((value) => String(value || "").replace(/\\/g, "/"));
}

function parsePopupContentFiles() {
  const popupScript = readText("assets/popup.html-C-AIiryS.js");
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

function assertNoUndefinedPdfHelper() {
  for (const relativePath of ["content.js", "assets/content.js-BzKMfaWY.js"]) {
    if (readText(relativePath).includes("isCurrentDocumentPdf")) {
      throw new Error(`${relativePath} still references isCurrentDocumentPdf.`);
    }
  }
}

function assertNoAutoHeavyOcr() {
  const content = readText("content.js");
  if (!/function\s+shouldAutoRunPdfOcr\s*\([^)]*\)\s*\{\s*void\s+routeKey;\s*return\s+false;\s*\}/.test(content)) {
    throw new Error("shouldAutoRunPdfOcr must stay disabled for image-based PDFs.");
  }
}

for (const [source, destination] of assetCopies) {
  writeText(destination, readText(source));
  console.log(`${source} -> ${destination}`);
}

assertSameContentFiles();
assertNoUndefinedPdfHelper();
assertNoAutoHeavyOcr();
console.log("Asset sync complete.");
