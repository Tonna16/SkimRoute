const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const contentCode = fs.readFileSync(path.join(root, "pdf-runtime.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function near(actual, expected, label, tolerance = 0.001) {
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

function loadHooks() {
  const windowRef = {
    __PAGEPILOT_ENABLE_TEST_HOOKS__: true,
    PagePilotAdapters: {},
    PagePilotEngine: {
      createEngine() {
        return { helpers: { hashText(value) { return String(value || "hash").slice(0, 32); } } };
      }
    },
    PagePilotUI: {
      createUI() {
        return { render() {}, update() {}, destroy() {} };
      }
    },
    location: { href: "https://example.test/scan.pdf" },
    scrollY: 0,
    innerHeight: 900,
    setTimeout,
    clearTimeout
  };
  windowRef.top = windowRef;
  windowRef.self = windowRef;
  const documentRef = {
    title: "OCR geometry fixture",
    readyState: "loading",
    body: {},
    documentElement: {},
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const sandbox = {
    window: windowRef,
    document: documentRef,
    console: { info() {}, warn() {}, error() {} },
    chrome: {
      runtime: {
        getURL(value) { return `chrome-extension://test/${value || ""}`; },
        sendMessage() {}
      }
    },
    URL,
    setTimeout,
    clearTimeout
  };
vm.runInNewContext(contentCode, sandbox, { filename: "pdf-runtime.js" });
  assert(sandbox.window.__PAGEPILOT_CONTENT_TESTS__, "content test hooks were not installed");
  return sandbox.window.__PAGEPILOT_CONTENT_TESTS__;
}

function ocrLine(id, text, bbox, variant = "raw", index = 0) {
  return {
    text,
    rawText: text,
    pageNumber: 1,
    bbox,
    pageWidth: bbox.pageWidth,
    pageHeight: bbox.pageHeight,
    confidence: 91,
    ocrVariantName: variant,
    sourceLineId: id,
    sourceLineIds: [id],
    order: index,
    wordBoxes: [
      { text: text.split(/\s+/)[0] || text, bbox, confidence: 91, order: 0 }
    ]
  };
}

function testCropScaleMapping(hooks) {
  const mapped = hooks.mapPdfOcrBBoxToFullPage(
    { x0: 20, y0: 10, x1: 100, y1: 50, pageWidth: 200, pageHeight: 150 },
    {
      fullPageWidth: 600,
      fullPageHeight: 500,
      cropOffsetX: 100,
      cropOffsetY: 50,
      cropWidth: 400,
      cropHeight: 300,
      canvasWidth: 200,
      canvasHeight: 150
    },
    200,
    150
  );
  near(mapped.x0, 140, "crop x0");
  near(mapped.y0, 70, "crop y0");
  near(mapped.x1, 300, "crop x1");
  near(mapped.y1, 150, "crop y1");
  near(mapped.pageWidth, 600, "crop pageWidth");
  near(mapped.pageHeight, 500, "crop pageHeight");
}

function testRotationMapping(hooks) {
  const rotated = hooks.mapPdfOcrBBoxToFullPage(
    { x0: 20, y0: 30, x1: 120, y1: 80, pageWidth: 400, pageHeight: 300 },
    {
      fullPageWidth: 400,
      fullPageHeight: 300,
      canvasWidth: 400,
      canvasHeight: 300,
      rotation: 90,
      applyRotationToOcrCoordinates: true
    },
    400,
    300
  );
  near(rotated.x0, 220, "rotated x0");
  near(rotated.y0, 20, "rotated y0");
  near(rotated.x1, 270, "rotated x1");
  near(rotated.y1, 120, "rotated y1");
  near(rotated.pageWidth, 300, "rotated pageWidth");
  near(rotated.pageHeight, 400, "rotated pageHeight");
}

function testLineBackedSectionsStayDistinct(hooks) {
  const firstLines = [
    ocrLine("line-a", "Permit me to introduce the project.", { x0: 80, y0: 120, x1: 520, y1: 145, pageWidth: 700, pageHeight: 900 }, "raw", 0),
    ocrLine("line-b", "This paragraph explains the request.", { x0: 80, y0: 150, x1: 560, y1: 176, pageWidth: 700, pageHeight: 900 }, "raw", 1)
  ];
  const secondLines = [
    ocrLine("line-c", "Please review the enclosed details.", { x0: 80, y0: 310, x1: 560, y1: 336, pageWidth: 700, pageHeight: 900 }, "raw", 2),
    ocrLine("line-d", "The next section has its own geometry.", { x0: 80, y0: 340, x1: 580, y1: 366, pageWidth: 700, pageHeight: 900 }, "raw", 3)
  ];
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const count = (value) => clean(value).split(/\s+/).filter(Boolean).length;
  const first = hooks.buildRecoveredPdfOcrLineBackedChunk(firstLines, "body", clean, count);
  const second = hooks.buildRecoveredPdfOcrLineBackedChunk(secondLines, "body", clean, count);
  assert(first.ocrGeometryExact, "first line-backed chunk should have exact geometry");
  assert(second.ocrGeometryExact, "second line-backed chunk should have exact geometry");
  assert(first.sourceLineIds.join(",") === "line-a,line-b", "first section source lines should match text lines");
  assert(second.sourceLineIds.join(",") === "line-c,line-d", "second section source lines should match text lines");
  assert(first.ocrGeometry.bbox.y1 < second.ocrGeometry.bbox.y0, "same-page section rectangles should be distinct");
  assert(/Permit me/.test(first.sectionText) && !/Please review/.test(first.sectionText), "first section text should come from first lines only");
}

function testMixedVariantsAndOversizedRectsAreApproximate(hooks) {
  const mixed = hooks.mergePdfOcrLineBackedGeometry([
    ocrLine("line-a", "Raw variant text.", { x0: 70, y0: 100, x1: 400, y1: 130, pageWidth: 700, pageHeight: 900 }, "raw", 0),
    ocrLine("line-b", "Other variant text.", { x0: 70, y0: 140, x1: 420, y1: 170, pageWidth: 700, pageHeight: 900 }, "contrast", 1)
  ]);
  assert(mixed && !mixed.exact && mixed.approximate, "mixed variants must not be exact");

  const oversized = hooks.mergePdfOcrLineBackedGeometry([
    ocrLine("line-huge", "Huge sparse rectangle.", { x0: 0, y0: 0, x1: 700, y1: 850, pageWidth: 700, pageHeight: 900 }, "raw", 0)
  ]);
  assert(oversized && !oversized.exact, "oversized sparse rectangle must not be exact");
}

function testVerificationRequiresSourceLineObjects(hooks) {
  const exactLine = ocrLine("line-a", "Permit me to introduce the project.", { x0: 80, y0: 120, x1: 520, y1: 145, pageWidth: 700, pageHeight: 900 }, "raw", 0);
  const geometry = hooks.mergePdfOcrLineBackedGeometry([exactLine]);
  const section = {
    id: "section-a",
    text: "Permit me to introduce the project.",
    pageNumber: 1,
    unitMeta: {
      kind: "pdf-ocr",
      ocr: true,
      pageNumber: 1,
      ocrVariantName: "raw",
      sourceLineIds: ["line-a"],
      ocrSourceLines: hooks.normalizePdfOcrSourceLines([exactLine]),
      ocrGeometry: geometry,
      ocrExactGeometry: true,
      ocrHighlightApproximate: false,
      sectionText: "Permit me to introduce the project."
    }
  };
  const verified = hooks.getVerifiedPdfOcrHighlightGeometry(section);
  assert(verified.exact, "matching source line objects should verify exact geometry");

  const stale = {
    ...section,
    unitMeta: {
      ...section.unitMeta,
      ocrSourceLines: [],
      sourceLineTextSample: "Permit me to introduce the project."
    }
  };
  const staleVerified = hooks.getVerifiedPdfOcrHighlightGeometry(stale);
  assert(!staleVerified.exact, "cached geometry without source line objects should fall back to approximate");
}

const hooks = loadHooks();
testCropScaleMapping(hooks);
testRotationMapping(hooks);
testLineBackedSectionsStayDistinct(hooks);
testMixedVariantsAndOversizedRectsAreApproximate(hooks);
testVerificationRequiresSourceLineObjects(hooks);

console.log("OCR geometry provenance fixtures passed");
