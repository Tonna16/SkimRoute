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
              return String(value || "hash").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
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
    location: { href: "https://example.test/scan.pdf" },
    scrollY: 0,
    innerHeight: 900,
    setTimeout,
    clearTimeout
  };
  windowRef.top = windowRef;
  windowRef.self = windowRef;

  const documentRef = {
    title: "OCR structure fixture",
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

  vm.runInNewContext(contentCode, sandbox, { filename: "content.js" });
  const hooks = sandbox.window.__PAGEPILOT_CONTENT_TESTS__;
  assert(hooks, "content test hooks were not installed");
  return hooks;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function countWords(value) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function line(text, index, y, options = {}) {
  const height = options.height || 18;
  return {
    text,
    rawText: text,
    pageNumber: options.pageNumber || 1,
    order: index,
    confidence: options.confidence || 91,
    ocrVariantName: options.variant || "raw",
    sourceLineId: options.id || `line-${options.pageNumber || 1}-${index}`,
    sourceLineIds: [options.id || `line-${options.pageNumber || 1}-${index}`],
    bbox: {
      x0: options.x0 || 80,
      y0: y,
      x1: options.x1 || 620,
      y1: y + height,
      pageWidth: 700,
      pageHeight: 900
    },
    pageWidth: 700,
    pageHeight: 900
  };
}

function chunksFor(hooks, lines, pageNumber = 1) {
  return hooks.buildRecoveredPdfOcrLetterChunks({ pageNumber, lines }, clean, countWords);
}

function roleList(chunks) {
  return chunks.map((chunk) => chunk.ocrRole);
}

function scoreSectionLike(hooks, chunk, index, total) {
  const section = {
    metrics: { ocrRole: chunk.ocrRole, pdfSectionType: "" },
    wordCount: chunk.words,
    score: hooks.scoreRecoveredPdfChunk(chunk, index, total, ""),
    pageNumber: chunk.pageNumber || 1,
    index,
    text: chunk.text
  };
  section.usefulScore = Math.max(30, Math.round(section.score * 0.62));
  section.importanceScore = section.score;
  return section;
}

function testScannedLetter(hooks) {
  const lines = [
    line("THE SLEREXE COMPANY LIMITED", 0, 48),
    line("SAPORS LANE BOOLE DORSET", 1, 72),
    line("Telephone Boole 51617 Telex 123456", 2, 96),
    line("Our Ref. 350/PJC/EAC", 3, 142),
    line("18th January 1972", 4, 166),
    line("Dr. P.N. Cundall Mining Surveys Ltd", 5, 214),
    line("Holy Road Reading Berks", 6, 238),
    line("Dear Pete,", 7, 292),
    line("Permit me to introduce you to the facility of facsimile transmission and explain why the scan line carries useful correspondence details.", 8, 336),
    line("I would like you to review the enclosed information because it describes the request, the equipment, and the action needed next.", 9, 364),
    line("Please let me know whether this recommendation is suitable for the proposed technical exchange and therefore can be arranged promptly.", 10, 392),
    line("Yours sincerely,", 11, 470),
    line("P.J. Cross Group Leader Facsimile Research", 12, 496)
  ];
  const chunks = chunksFor(hooks, lines);
  const roles = roleList(chunks);
  assert(roles.includes("letterhead"), "letter should identify letterhead/address block");
  assert(roles.includes("date_reference"), "letter should identify date/reference block");
  assert(roles.includes("recipient"), "letter should identify recipient block");
  assert(roles.includes("greeting"), "letter should identify greeting line");
  assert(roles.includes("body"), "letter should identify body after greeting");
  assert(roles.includes("signature"), "letter should identify signature block");
  const body = chunks.find((chunk) => chunk.ocrRole === "body");
  const letterhead = chunks.find((chunk) => chunk.ocrRole === "letterhead");
  assert(body && /^Permit me/i.test(body.text), "letter body should start after Dear Pete");
  assert(letterhead && /Telephone/.test(letterhead.text), "telephone line should stay in letterhead, not body");
  assert(body.ocrRoleConfidence >= 80, "line-backed body should have strong role confidence");
  assert(body.ocrRoleReasons.join(" ").includes("source-line"), "body should explain source-line role evidence");
  const structure = hooks.getPdfOcrStructureCompleteness({ source: "ocr", pages: [{ pageNumber: 1, text: clean(lines.map((entry) => entry.text).join(" ")), lines }], words: countWords(lines.map((entry) => entry.text).join(" ")) });
  assert(structure.complete, "scanned letter structure should be complete");
  assert(structure.bodyAfterGreeting, "letter structure should record body after greeting");
  const ranked = chunks.map((chunk, index) => scoreSectionLike(hooks, chunk, index, chunks.length)).sort(hooks.compareRecoveredPdfSections);
  assert(ranked[0].metrics.ocrRole === "body", `letter best role should be body, got ${ranked[0].metrics.ocrRole}`);
}

function testResearchScan(hooks) {
  const lines = [
    line("Journal of Sample Research Page 1", 0, 38),
    line("A Practical Study of OCR Structure", 1, 70),
    line("Abstract", 2, 120),
    line("This abstract summarizes the claim, evidence, and measured results from a scanned research page.", 3, 146),
    line("Methods", 4, 210),
    line("The method uses a controlled comparison and records the measurement procedure for each sample.", 5, 236),
    line("Results", 6, 306),
    line("The results show a significant improvement, with findings that demonstrate the main outcome and evidence.", 7, 332),
    line("Conclusion", 8, 402),
    line("The conclusion recommends adopting the tested workflow because the observed result was stable.", 9, 428),
    line("References", 10, 510),
    line("Smith 2020 Journal citation doi bibliography reference list.", 11, 536),
    line("Journal of Sample Research Page 1", 12, 850)
  ];
  const chunks = chunksFor(hooks, lines);
  const roles = roleList(chunks);
  assert(roles.includes("abstract"), "research scan should identify abstract");
  assert(roles.includes("methods"), "research scan should identify methods");
  assert(roles.includes("results"), "research scan should identify results");
  assert(roles.includes("conclusion"), "research scan should identify conclusion");
  assert(roles.includes("references"), "research scan should identify references");
  const ranked = chunks.map((chunk, index) => scoreSectionLike(hooks, chunk, index, chunks.length)).sort(hooks.compareRecoveredPdfSections);
  assert(/^(results|conclusion)$/.test(ranked[0].metrics.ocrRole), `research best role should be results/conclusion, got ${ranked[0].metrics.ocrRole}`);
  assert(!/references|repeated_header|repeated_footer/.test(ranked[0].metrics.ocrRole), "references and repeated headers should not be best");
}

function testReportFormAndNoisyScan(hooks) {
  const reportLines = [
    line("Quarterly Risk Report", 0, 52),
    line("Executive Summary", 1, 110),
    line("The report summary explains the current risk, evidence, and operational context for management.", 2, 138),
    line("Findings", 3, 210),
    line("The findings show that delayed review increased cost and created a significant compliance gap.", 4, 238),
    line("Recommendations", 5, 310),
    line("We recommend assigning an owner, tracking the deadline, and reviewing the control every month.", 6, 338),
    line("Appendix", 7, 520),
    line("Page 1 confidential duplicate copy", 8, 850)
  ];
  const reportChunks = chunksFor(hooks, reportLines);
  const reportRanked = reportChunks.map((chunk, index) => scoreSectionLike(hooks, chunk, index, reportChunks.length)).sort(hooks.compareRecoveredPdfSections);
  assert(/^(recommendations|results|report_summary)$/.test(reportRanked[0].metrics.ocrRole), `report best should be recommendations/findings/summary, got ${reportRanked[0].metrics.ocrRole}`);

  const formLines = [
    line("County Benefits Office", 0, 42),
    line("Notice of Determination", 1, 104),
    line("Claim number AB-1234. Jane Smith must respond by April 15 2026 or the appeal may be denied.", 2, 132),
    line("Required Response", 3, 210),
    line("Submit the signed appeal form with the case number on every page before the deadline.", 4, 238),
    line("Signature of authorized representative", 5, 520),
    line("Page 2 fax copy", 6, 850)
  ];
  const formChunks = chunksFor(hooks, formLines);
  const formRanked = formChunks.map((chunk, index) => scoreSectionLike(hooks, chunk, index, formChunks.length)).sort(hooks.compareRecoveredPdfSections);
  assert(formRanked[0].metrics.ocrRole === "form_notice", `form best should be notice/instructions, got ${formRanked[0].metrics.ocrRole}`);

  const noisyLines = [
    line("FAX COPY CONFIDENTIAL Page 1", 0, 40),
    line("FAX COPY CONFIDENTIAL Page 1", 1, 62),
    line("|||| ____ ---- 003", 2, 110),
    line("Results", 3, 220),
    line("The findings show the recovered scan contains one useful paragraph despite repeated headers and noisy marks.", 4, 248),
    line("FAX COPY CONFIDENTIAL Page 1", 5, 852)
  ];
  const noisyChunks = chunksFor(hooks, noisyLines);
  const noisyRanked = noisyChunks.map((chunk, index) => scoreSectionLike(hooks, chunk, index, noisyChunks.length)).sort(hooks.compareRecoveredPdfSections);
  assert(noisyRanked[0].metrics.ocrRole === "results", `noisy scan best should be results, got ${noisyRanked[0].metrics.ocrRole}`);
  assert(noisyChunks.some((chunk) => /repeated_|noise/.test(chunk.ocrRole)), "noisy scan should identify repeated/noise roles");
}

const hooks = loadHooks();
testScannedLetter(hooks);
testResearchScan(hooks);
testReportFormAndNoisyScan(hooks);

console.log("OCR structure ranking fixtures passed");
