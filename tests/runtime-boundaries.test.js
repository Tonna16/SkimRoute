const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function assertNoHeavyTokens(relativePath) {
  const text = read(relativePath);
  const forbidden = [
    /pdfjs-dist\/build\/pdf\.min\.mjs/i,
    /tesseract\.esm\.min\.js/i,
    /createWorker\(/,
    /loadTesseractModule/,
    /extractPdfTextWithAdaptiveOcr/,
    /getDocument\(\{/
  ];
  const hit = forbidden.find((pattern) => pattern.test(text));
  assert(!hit, `${relativePath} contains heavy optional-runtime token ${hit}`);
}

function assertSame(source, generated) {
  assert(read(source) === read(generated), `${generated} is not synchronized with ${source}`);
}

const manifest = json("manifest.json");
const contentScript = manifest.content_scripts[0];
const contentFiles = contentScript.js;

assert(contentScript.all_frames !== true, "content script should not use all_frames: true");
assert(contentScript.match_about_blank !== true, "content script should not use match_about_blank");
assert(!contentFiles.includes("assets/pdf-runtime.js"), "pdf runtime must not be a manifest content script");
assert(!contentFiles.includes("assets/ocr-runtime.js"), "ocr runtime must not be a manifest content script");
assert(contentFiles.includes("assets/content-core.js"), "core content runtime should be the manifest content script");

const webAccessible = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
assert(webAccessible.includes("assets/pdf-runtime.js"), "pdf runtime must be web accessible for dynamic import");
assert(webAccessible.includes("assets/ocr-runtime.js"), "ocr runtime must be web accessible for dynamic import");

["content-core.js", "content.js", "assets/content-core.js"].forEach(assertNoHeavyTokens);

assert(/pdfjs-dist\/build\/pdf\.min\.mjs/i.test(read("pdf-runtime.js")), "pdf runtime should own PDF.js loading");
assert(/tesseract\.esm\.min\.js/i.test(read("pdf-runtime.js")), "pdf runtime should preserve OCR compatibility path");

const pdfRuntime = read("pdf-runtime.js");
assert(/function beginPdfQueryNavigationAction/.test(pdfRuntime), "pdf query navigation should have an owned action lifecycle");
assert(/beginPdfAction\("query"[\s\S]{0,600}forceNew:\s*true/.test(pdfRuntime), "pdf query actions should force a fresh action token");
assert(/pdf-query-action:stale-target-replaced/.test(pdfRuntime), "pdf query actions should replace stale controlled-viewer targets");
assert(/missing-query-action-token/.test(pdfRuntime), "controlled pdf query scrolling should reject missing query tokens");
assert(/isQueryAction\s*\?\s*String\(options\.actionToken/.test(pdfRuntime), "query scrolls must use the explicitly passed query action token");
assert(!/const actionToken = options\.actionToken \|\| viewer && viewer\.pendingTarget && viewer\.pendingTarget\.actionToken \|\| runtime\.pdfAction/.test(pdfRuntime), "query scrolls must not fall back to stale pending/pdf action tokens");
assert(/skipPreflightCacheForForcedOcr/.test(pdfRuntime), "forced Better OCR runs should bypass weak same-route OCR caches");

[
  ["content/adapters.js", "assets/adapters.js"],
  ["content/engine.js", "assets/engine.js"],
  ["content/ui.js", "assets/ui.js"],
  ["content-core.js", "assets/content-core.js"],
  ["pdf-runtime.js", "assets/pdf-runtime.js"],
  ["ocr-runtime.js", "assets/ocr-runtime.js"],
  ["popup.js", "assets/popup.js"],
  ["background.js", "assets/background.js"]
].forEach(([source, generated]) => assertSame(source, generated));

[
  "assets/adapters.js-BxVfMoxi.js",
  "assets/engine.js-BJkAhsDZ.js",
  "assets/ui.js-DPUnGKsp.js",
  "assets/content.js-BzKMfaWY.js",
  "assets/popup.html-C-AIiryS.js",
  "assets/background.js-DHppkjD5.js"
].forEach((relativePath) => assert(!exists(relativePath), `${relativePath} should not remain in the package`));

console.log("runtime boundary checks passed");
