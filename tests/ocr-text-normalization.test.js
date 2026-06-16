const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const contentCode = fs.readFileSync(path.join(root, "content.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadHooks() {
  const windowRef = {
    __PAGEPILOT_ENABLE_TEST_HOOKS__: true,
    PagePilotAdapters: {},
    PagePilotEngine: {
      createEngine() {
        return {
          helpers: {
            hashText(value) {
              return String(value || "").replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "hash";
            }
          }
        };
      }
    },
    PagePilotUI: {
      createUI() {
        return { render() {}, update() {}, destroy() {} };
      }
    },
    location: { href: "https://example.test/sample.pdf" },
    scrollY: 0,
    innerHeight: 900,
    setTimeout,
    clearTimeout
  };
  windowRef.top = windowRef;
  windowRef.self = windowRef;

  const documentRef = {
    title: "OCR fixture",
    readyState: "loading",
    body: {},
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

  vm.runInNewContext(contentCode, sandbox, { filename: "content.js" });
  const hooks = sandbox.window.__PAGEPILOT_CONTENT_TESTS__;
  assert(hooks, "content test hooks were not installed");
  return hooks;
}

function line(text, x0, y0, x1, y1, index, confidence = 92, options = {}) {
  return {
    text,
    rawText: text,
    bbox: { x0, y0, x1, y1, pageWidth: 700, pageHeight: 900 },
    pageWidth: 700,
    pageHeight: 900,
    confidence,
    sourceLineId: `line-${index}`,
    sourceLineIds: [`line-${index}`],
    pageNumber: 1,
    order: index,
    ocrVariantName: options.variant || "raw",
    recognitionVariant: options.variant || "raw",
    source: options.source || "ocr"
  };
}

function testReadingOrderAndConservativeCleanup(hooks) {
  const lines = [
    line("explain the reference for the enclosed documents .", 90, 208, 560, 226, 5),
    line("Permit me to intro-", 90, 160, 300, 178, 3),
    line("duce Dr . P . N . Cundall and his work", 90, 184, 520, 202, 4),
    line("Our Ref . 350/PJC/EAC", 90, 112, 300, 130, 2),
    line("Telephone : 01-123 4567", 90, 82, 330, 100, 1),
    line("CREMER AND WARNER LTD .", 90, 52, 380, 70, 0)
  ];

  const result = hooks.reconstructPdfOcrTextFromLines(lines);
  assert(result.text.indexOf("CREMER AND WARNER LTD.") < result.text.indexOf("Our Ref. 350/PJC/EAC"), "letterhead/reference order should follow page geometry");
  assert(result.text.indexOf("Our Ref. 350/PJC/EAC") < result.text.indexOf("Permit me to introduce"), "body should follow reference block");
  assert(/Permit me to introduce Dr\. P\. N\. Cundall/.test(result.text), "wrapped hyphenated word should join without damaging name initials");
  assert(/350\/PJC\/EAC/.test(result.text), "reference code should be preserved");
  assert(/Telephone: 01-123 4567/.test(result.text), "telephone spacing and digits should be preserved");
  assert(result.stats.hyphenatedJoins >= 1, "expected a conservative hyphenated join");
}

function testSameRowFragmentsAndColumnSeparation(hooks) {
  const lines = [
    line("Permit me", 90, 150, 175, 168, 0),
    line("to introduce the project.", 188, 151, 390, 169, 1),
    line("Separate sidebar note", 520, 151, 670, 169, 2)
  ];
  const result = hooks.reconstructPdfOcrTextFromLines(lines);
  assert(/Permit me to introduce the project\./.test(result.text), "adjacent same-row fragments should be joined");
  assert(!/project\. Separate sidebar note/.test(result.text), "distant same-row column text should not be joined into the body");
}

function testQualitySignalsForEarlyStopInputs(hooks) {
  const strongLines = [
    line("CREMER AND WARNER LTD.", 90, 50, 380, 68, 0, 92),
    line("Telephone: 01-123 4567 Our Ref. 350/PJC/EAC", 90, 80, 480, 98, 1, 92),
    line("Dear Pete,", 90, 130, 200, 148, 2, 91),
    line("Permit me to introduce Dr. P. N. Cundall and explain why his research is important for the project request.", 90, 170, 650, 188, 3, 91),
    line("I would like you to review the enclosed information because it describes the action required and the reason for the recommendation.", 90, 200, 650, 218, 4, 91),
    line("Please let me know whether the proposed meeting can proceed, and therefore we can prepare the necessary documents.", 90, 230, 650, 248, 5, 90),
    line("This additional paragraph gives context, evidence, and a clear conclusion so the scanned letter has a complete body.", 90, 260, 650, 278, 6, 90),
    line("The final paragraph preserves readable wording, names, and request details so the candidate is complete enough to stop.", 90, 290, 650, 308, 7, 90),
    line("Yours sincerely, P. J. Cremer", 90, 340, 380, 358, 8, 90)
  ];
  const strongText = hooks.reconstructPdfOcrTextFromLines(strongLines).text;
  const strongCandidate = {
    text: strongText,
    words: strongText.split(/\s+/).length,
    lines: strongLines,
    confidence: 90,
    pageNumber: 1,
    source: "ocr"
  };
  const strongQuality = hooks.evaluatePdfOcrTextQuality(strongCandidate);
  assert(strongQuality.readable, "strong OCR candidate should be readable");
  assert(strongQuality.complete, "strong OCR candidate should be complete enough for early-stop inputs");
  const earlyStop = hooks.getPdfOcrEarlyStopDecision(strongCandidate, [], "https://example.test/sample.pdf", "better");
  assert(earlyStop.stop, "strong readable structured candidate should be allowed to stop early");

  const corruptCandidate = {
    text: "|||| @@@ ### 12345 |||| @@@ ###",
    words: 6,
    lines: [line("|||| @@@ ###", 90, 120, 260, 138, 0, 38), line("12345 |||| @@@ ###", 90, 148, 300, 166, 1, 35)],
    confidence: 36,
    pageNumber: 1,
    source: "ocr"
  };
  const corruptQuality = hooks.evaluatePdfOcrTextQuality(corruptCandidate);
  assert(!corruptQuality.readable, "corrupted OCR candidate should not be readable");
  assert(corruptQuality.corrupted, "corrupted OCR candidate should be flagged");
  const corruptStop = hooks.getPdfOcrEarlyStopDecision(corruptCandidate, [], "https://example.test/sample.pdf", "fast");
  assert(!corruptStop.stop, "corrupted candidate must not stop early");
}

function testSampleLikeVisibleCaptureIsProvisional(hooks) {
  const badLines = [
    line("= Ye We © @ A ea Fake +A a A a ®@ -", 12, 8, 680, 24, 0, 41, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("THE SLEREXE COMPANY LIMITED", 250, 74, 520, 94, 1, 64, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("SAPORS LANE - DOOLE - DORSET - BH AER", 225, 108, 560, 126, 2, 61, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("sone sous (34513) S617 - Tas 12456", 260, 138, 540, 154, 3, 54, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("Our Ret. I50/PIT/EAC 1565 January, 1972.", 88, 220, 640, 240, 4, 58, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("Dr. Pn. Cundail,", 90, 304, 270, 324, 5, 58, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("ining Serveys Led.", 90, 332, 320, 352, 6, 57, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("Holroya Boad,", 90, 360, 250, 380, 7, 57, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("Beating, Berke.", 90, 388, 260, 408, 8, 57, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("bear Tece,", 90, 450, 230, 470, 9, 58, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("bernie me to introduce you to the facility of facsinile Go faceinile a photocell Le caused to pecfom a raster scan over the subject copy.", 90, 505, 660, 525, 10, 59, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }),
    line("The variations of priot density on che documenc cause che photocell to generate an analogous electrical video signal.", 90, 535, 660, 555, 11, 59, { variant: "ultra-fast-crop-threshold", source: "visible-capture" })
  ];
  const reconstructed = hooks.reconstructPdfOcrTextFromLines(badLines);
  const badCandidate = {
    text: reconstructed.text,
    words: reconstructed.text.split(/\s+/).length,
    lines: reconstructed.lines,
    confidence: 59,
    source: "visible-capture",
    recognitionVariant: "ultra-fast-crop-threshold",
    ocrVariantName: "ultra-fast-crop-threshold"
  };
  const badQuality = hooks.evaluatePdfOcrTextQuality(badCandidate);
  assert(badQuality.missedRegionLikely, "sample-like ultra-fast crop should be flagged as missing important regions");
  assert(!badQuality.complete, "sample-like ultra-fast crop must not be complete enough to cache as strong success");
  const decision = hooks.getPdfOcrImmediateReturnDecision({
    pages: [{ pageNumber: 1, text: badCandidate.text, words: badCandidate.words, lines: badCandidate.lines, source: "visible-capture", confidence: 59, recognitionVariant: "ultra-fast-crop-threshold" }],
    text: badCandidate.text,
    words: badCandidate.words,
    confidence: 59,
    source: "ocr",
    adaptiveMode: "ultra-fast",
    ocrTextQuality: badQuality
  }, "https://example.test/scansmpl.pdf", "fast");
  assert(!decision.strong, "sample-like ultra-fast crop must fall through to page-rendered OCR");
}

function testCompleteRawCandidateBeatsCorruptedHighWordVariant(hooks) {
  const badText = [
    "THE SLEREXE COMPANY LIMITED SAPORS LANE - DOOLE - DORSET - BH AER",
    "sone sous (34513) S617 - Tas 12456 Our Ret. I50/PIT/EAC",
    "ining Serveys Led. Holroya Boad, Beating, Berke. bear Tece, bernie me to introduce facsinile priot density che documenc vidso."
  ].join(" ");
  const badLines = badText.split(/(?<=\.)\s+/).map((text, index) => line(text, 90, 80 + index * 26, 650, 100 + index * 26, index, 59, { variant: "ultra-fast-crop-threshold", source: "visible-capture" }));
  const badCandidate = {
    text: badText,
    words: 126,
    lines: badLines,
    confidence: 59,
    source: "visible-capture",
    recognitionVariant: "ultra-fast-crop-threshold",
    ocrVariantName: "ultra-fast-crop-threshold"
  };

  const goodLines = [
    line("THE SLEREXE COMPANY LIMITED", 220, 52, 520, 72, 0, 89),
    line("SAPORS LANE - DOOLE - DORSET - BH 25 8ER", 210, 82, 550, 102, 1, 89),
    line("TELEPHONE BOOLE (94513) 51617 - TELEX 123456", 190, 112, 570, 132, 2, 88),
    line("Our Ref. 350/PJC/EAC", 90, 208, 310, 228, 3, 89),
    line("18th January, 1972", 520, 208, 670, 228, 4, 89),
    line("Dr. P. N. Cundall, Mining Surveys Ltd., Holroyd Road, Reading, Berks.", 90, 300, 570, 320, 5, 88),
    line("Dear Pete,", 90, 390, 220, 410, 6, 90),
    line("Permit me to introduce you to the facility of facsimile transmission.", 140, 452, 660, 472, 7, 90),
    line("In facsimile a photocell is caused to perform a raster scan over the subject copy.", 140, 506, 660, 526, 8, 89),
    line("The variations of print density cause the photocell to generate an analogous electrical video signal.", 90, 536, 660, 556, 9, 89),
    line("At the remote terminal, demodulation reconstructs the signal and produces a copy of the subject document.", 90, 602, 660, 622, 10, 88),
    line("Probably you have uses for this facility in your organisation.", 90, 672, 600, 692, 11, 88),
    line("Yours sincerely, P. J. Cross", 420, 748, 650, 768, 12, 88)
  ];
  const good = hooks.reconstructPdfOcrTextFromLines(goodLines);
  const goodCandidate = {
    text: good.text,
    words: good.text.split(/\s+/).length,
    lines: good.lines,
    confidence: 89,
    source: "ocr",
    recognitionVariant: "raw",
    ocrVariantName: "raw"
  };
  const goodDecision = hooks.getPdfOcrImmediateReturnDecision({
    pages: [{ pageNumber: 1, text: goodCandidate.text, words: goodCandidate.words, lines: goodCandidate.lines, source: "ocr", confidence: 89, recognitionVariant: "raw" }],
    text: goodCandidate.text,
    words: goodCandidate.words,
    confidence: 89,
    source: "ocr",
    adaptiveMode: "fast"
  }, "https://example.test/scansmpl.pdf", "fast");
  assert(goodDecision.strong, "complete raw/page-rendered scan should be strong enough for early return");
  assert(hooks.isBetterPdfOcrVariant(goodCandidate, badCandidate), "complete readable variant should beat corrupted higher-word variant");
  assert(/Dear Pete/.test(good.text), "greeting should be preserved");
  assert(/Yours sincerely/.test(good.text), "closing should be preserved");
  assert(/350\/PJC\/EAC/.test(good.text), "reference code should be preserved");
}

const hooks = loadHooks();
testReadingOrderAndConservativeCleanup(hooks);
testSameRowFragmentsAndColumnSeparation(hooks);
testQualitySignalsForEarlyStopInputs(hooks);
testSampleLikeVisibleCaptureIsProvisional(hooks);
testCompleteRawCandidateBeatsCorruptedHighWordVariant(hooks);

console.log("OCR text normalization fixtures passed");
