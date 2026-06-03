"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadEngine() {
  const context = vm.createContext({
    window: {},
    console
  });
  vm.runInContext(read("content/engine.js"), context, { filename: "content/engine.js" });
  assert(context.window.PagePilotEngine, "PagePilotEngine did not load");
  return context.window.PagePilotEngine;
}

function checkEngineFixtures(engine) {
  const article = engine.analyzeTextFixture({
    type: "article",
    label: "Article",
    readingConfidence: 84,
    sections: [
      {
        title: "Introduction",
        text: "This opening gives background and context before the practical details. It is useful but not the place readers should jump first."
      },
      {
        title: "Key takeaways",
        text: "Summary: the bottom line is to use this recommended workflow. Do this first, then check the result, then update the configuration. This section gives direct next actions, a concise answer, and concrete steps for the reader."
      }
    ]
  });
  assert(article.recommendation.hasStrongTarget, "Article fixture should produce a strong target");
  assert(/takeaway|answer|steps|useful/i.test(article.recommendation.bestKind), "Article best kind should be useful");

  const quietSearch = engine.analyzeTextFixture({
    type: "search_results",
    label: "Results",
    readingConfidence: 20,
    quietMode: true,
    reason: "Search results are already built for scanning",
    sections: []
  });
  assert(quietSearch.pageProfile.quietMode, "Search/results fixture should stay quiet");
  assert(!quietSearch.recommendation.hasStrongTarget, "Quiet fixture should not recommend a jump");

  const chat = engine.analyzeTextFixture({
    type: "chat",
    label: "AI chat",
    readingConfidence: 88,
    sections: [
      {
        title: "Question",
        text: "User: Can you fix the PDF mapper and make the popup stop saying unavailable while it loads?",
        unitMeta: { role: "user" }
      },
      {
        title: "Final answer",
        text: "Final answer: use this corrected working version. Summary: the fix is to keep one PDF cache key, expose pending state, and run OCR only after the user chooses it. Copy and paste this complete code pattern.",
        codeBlocks: 1,
        unitMeta: {
          role: "assistant",
          isLatestAssistant: true,
          hasFinalAnswer: true,
          hasRevision: true,
          hasSummary: true,
          hasCompleteCode: true,
          responsePriority: 86
        }
      }
    ]
  });
  assert(!chat.pageProfile.quietMode, "Chat fixture should not stay quiet");
  assert(chat.recommendation.hasStrongTarget, "Chat fixture should promote the assistant answer");
  assert(chat.recommendation.bestKind === "corrected_answer", "Chat fixture should identify the corrected answer");

  const pdf = engine.analyzeTextFixture({
    type: "pdf",
    label: "PDF",
    readingConfidence: 78,
    sections: [
      {
        title: "Page 1: Background",
        text: "This page introduces the research context and gives background information before the useful findings."
      },
      {
        title: "Page 2: Findings and conclusion",
        text: "Findings summary: the results show the main recommendation and conclusion. The bottom line is clear, with concrete evidence and the most useful details for a reader."
      }
    ],
    finalizeProfile: true,
    words: 240,
    pageEvidence: { articleEvidence: 3, quietEvidence: 0, paragraphs: 4 }
  });
  assert(!pdf.pageProfile.quietMode, "Selectable PDF fixture should not stay quiet");
  assert(pdf.recommendation.hasStrongTarget, "Selectable PDF fixture should produce a target");

  const recoveredPdf = engine.analyzeTextFixture({
    type: "pdf",
    label: "PDF",
    readingConfidence: 36,
    quietMode: true,
    reason: "PDF text is still loading, or this PDF has no selectable text",
    sections: [
      {
        title: "Page 1",
        text: "Anthropology fieldwork context describes participant observation, interviews, local practice, classroom discussion, research planning, and ordinary evidence gathered across the project.",
        unitMeta: { kind: "pdf-ocr", pageNumber: 1 }
      },
      {
        title: "Page 2",
        text: "The investigation explains methods, observations, cultural interpretation, ethics, reflection, comparison, notes, and evidence in plain academic paragraphs without a standout takeaway.",
        unitMeta: { kind: "pdf-ocr", pageNumber: 2 }
      }
    ],
    finalizeProfile: true,
    words: 0,
    pageEvidence: { articleEvidence: 0, quietEvidence: 0, paragraphs: 0 }
  });
  assert(!recoveredPdf.pageProfile.quietMode, "Recovered PDF sections should count even when root DOM words are zero");
  assert(recoveredPdf.pageProfile.reason === "Selectable PDF text found", "Recovered PDF text should report a ready PDF state");
}

function checkSourceContracts() {
  const content = read("content.js");
  const adapters = read("content/adapters.js");
  const popup = read("popup.js");
  const background = read("background.js");
  const styles = read("styles.css");

  [
    "pdfPending",
    "pdfState",
    "pdfProgress",
    "needsPdfOcr",
    "pdfError",
    "pdfErrorKind",
    "pdfSource",
    "pdfReady",
    "pdfJumpReady",
    "pdfJumpMode",
    "pdfAccessAllowed",
    "pdfRetrying",
    "pdfActivePage",
    "pdfActiveSectionId",
    "pdfRecoveredWords",
    "pdfRecoveredPages",
    "pdfPartial"
  ].forEach((field) => {
    assert(content.includes(field), `content status is missing ${field}`);
  });

  assert(content.includes("hasUsablePdfMap"), "PDF loading gate must stop once recovered sections exist");
  assert(content.includes("isPdfRouteLocked"), "PDF URLs must stay locked to PDF handling even when DOM scans are empty");
  assert(content.includes("enforcePdfRouteModel"), "PDF route scans must be coerced back to PDF instead of quiet low-structure");
  assert(content.includes("pdf:route:forced"), "PDF route coercion should emit a debug diagnostic");
  assert(content.includes("PDF_TEXT_FAST_EXTRACTION_TIMEOUT_MS"), "PDF extraction should have a bounded fast-first pass");
  assert(content.includes("PDF_SESSION_CACHE_STORAGE_KEY"), "Recovered PDF text should survive page-anchor reloads in session storage");
  assert(content.includes("hydratePdfSessionCache"), "PDF cache should hydrate before first scan after reload");
  assert(content.includes("PAGEPILOT_FILE_ACCESS_STATUS"), "Content script should query real Chrome file access state");
  assert(content.includes("queuePdfRecoveryRetry"), "Local PDF fetch failures should retry before showing access errors");
  assert(content.includes("pdf:extract:complete"), "PDF extraction should log completion diagnostics");
  assert(content.includes("pdf:fetch:content:success"), "Content PDF fetches should log successful byte reads");
  assert(content.includes("pdf:fetch:background:success"), "Background PDF fetches should log successful byte reads");
  assert(content.includes("buildPdfTextLines"), "PDF.js extraction should preserve line order and approximate position");
  assert(content.includes("normalizePdfRecoveryPages"), "PDF recovery should preserve page-level text cache data");
  assert(content.includes("pages: recoveredPages"), "PDF cache writes should include recovered pages");
  assert(content.includes("schedulePdfFullTextRefresh"), "Partial PDF maps should continue full extraction in the background");
  assert(content.includes("resolvePdfScrollAnchor"), "PDF jumps should resolve real scroll anchors");
  assert(content.includes("performPdfSyntheticJump"), "PDF jumps need a page-number fallback when Chrome hides page DOM");
  assert(content.includes("navigateChromePdfViewerPage"), "PDF jump fallback should try Chrome PDF viewer page APIs");
  assert(content.includes("scrollPdfViewerApproximately"), "PDF jump fallback should try scrolling viewer containers");
  assert(content.includes("navigatePdfPageHard"), "PDF jump fallback should hard-navigate the PDF tab when soft paths fail");
  assert(content.includes("isPdfViewerAtPage"), "PDF soft jumps should be verified before claiming success");
  assert(content.includes("getNextPdfImportantSection"), "PDF Next should use page/chunk order instead of DOM top");
  assert(content.includes("refreshActivePdfSection"), "PDF active section tracking should use PDF page/chunk state");
  assert(content.includes("PAGEPILOT_NAVIGATE_PDF_PAGE"), "PDF hard navigation must use the background tab-update contract");
  assert(content.includes("PDF_PENDING_JUMP_STORAGE_KEY"), "Hard PDF jumps should restore a visible marker after reload");
  assert(content.includes("restored-hard-page"), "Hard PDF jumps should restore state after page-anchor navigation");
  assert(content.includes("PDF_CONTROLLED_VIEWER_CONSENT_STORAGE_KEY"), "PagePilot PDF Mode consent should be stored per PDF route");
  assert(content.includes("requestPagePilotControlledPdfJump"), "PDF jump entrypoints should route through one controlled PDF jump request helper");
  assert(content.includes("requestPagePilotPdfModeConsent"), "Controlled PDF jumps must ask before opening PagePilot PDF Mode");
  assert(content.includes("pagepilot-pdf-mode-consent"), "The PDF Mode consent prompt must use in-page PagePilot dialog markup");
  assert(content.includes("data-pp-pdf-mode-accept"), "The PDF Mode consent prompt must offer an accept action");
  assert(content.includes("data-pp-pdf-mode-decline"), "The PDF Mode consent prompt must offer a decline action");
  assert(content.includes("pdf-mode-declined"), "Declining PDF Mode should cancel the jump instead of falling through silently");
  assert(content.includes("reopenPagePilotControlledPdfViewer"), "Closed PagePilot PDF Mode must reopen for later accepted jumps");
  assert(content.includes("element.closest && element.closest(\"#pagepilot-pdf-controlled-viewer\")"), "Native PDF page lookup must not treat hidden PagePilot-rendered pages as safe anchors");
  assert(content.includes("Current section - Page"), "Controlled PDF highlight labels should describe the commanded current section");
  assert(content.includes("activeHighlightSectionId = section && section.id"), "Controlled PDF highlights must track the currently highlighted section id");
  assert(!content.includes("function navigatePdfHash"), "PDF jumps must not fake success with content-script hash navigation");
  assert(content.includes("showPdfJumpMarker"), "Synthetic PDF jumps should show a visible marker");
  assert(content.includes("pagepilot-pdf-section-overlay"), "Synthetic PDF jumps should show a persistent section overlay");
  assert(styles.includes("pagepilot-pdf-jump-marker"), "PDF jump marker styles must be present");
  assert(styles.includes("pagepilot-pdf-section-overlay"), "PDF section overlay styles must be present");
  assert(content.includes("readPdfResponseBuffer"), "PDF fetches must accept readable local file status-zero responses");
  assert(content.includes("fetch-error"), "PDF fetch failures need a distinct non-OCR state");
  assert(content.includes("isSafeJumpEffectElement"), "Jump effects must filter unsafe targets");
  assert(content.includes("element === document.body || element === document.documentElement"), "Jump effects must skip body/html");
  assert(read("content/engine.js").includes("text: unit.text || \"\""), "Adapter unit text must be passed into engine sections");
  assert(read("content/engine.js").includes("const sourceText = options.helpers.cleanText(options.text || \"\")"), "Engine sections must preserve adapter-provided text");
  assert(adapters.includes("getPdfCachedPageUnits"), "PDF adapter should rebuild units from cached PDF.js pages");
  assert(adapters.includes("createPdfCachedPageUnit"), "PDF adapter should preserve cached page numbers and text");
  assert(adapters.includes("createPdfCachedPageUnits"), "PDF adapter should split cached pages into chunk sections");
  assert(adapters.includes("relativeY"), "PDF chunk sections should preserve approximate vertical position");
  assert(adapters.includes("chunkIndex"), "PDF chunk sections should preserve page-local order");
  assert(adapters.includes("synthesizePdfOcrUnits(ocrText, root, helpers)"), "PDF OCR units must receive the root anchor");
  assert(adapters.includes("getPdfDocumentRouteKey"), "PDF adapter must use a document-level route key");
  assert(popup.includes("PAGEPILOT_RUN_PDF_OCR"), "Popup must send the OCR command");
  assert(popup.includes("pdfRetrying"), "Popup must poll while PDF local recovery retries");
  assert(popup.includes("pdfAccessAllowed"), "Popup should only mention file access when Chrome reports it disabled");
  assert(popup.includes("PDF map ready"), "Popup must show a ready state for mapped PDFs without a strong jump");
  assert(popup.includes("PDF access issue"), "Popup must distinguish local PDF access errors from OCR prompts");
  assert(popup.includes("Retry PDF"), "Popup fetch errors should offer a PDF-specific retry action");
  assert(read("popup.html").includes("overflow-wrap: anywhere"), "Popup must wrap long PDF errors instead of widening");
  assert(background.includes("PAGEPILOT_FETCH_PDF_BYTES"), "Background must handle PDF byte fetches");
  assert(background.includes("byteLength"), "Background PDF byte fetches should report byte length diagnostics");
  assert(background.includes("PAGEPILOT_FILE_ACCESS_STATUS"), "Background must report Chrome file-scheme access state");
  assert(background.includes("PAGEPILOT_NAVIGATE_PDF_PAGE"), "Background must hard-navigate PDF page anchors");
  assert(background.includes("chrome.tabs.update"), "PDF hard navigation must update the active tab URL");
  assert(!background.includes("chrome.tabs.reload"), "PDF hard navigation must not force same-URL reloads");
}

async function checkLocalAnthropologyPdf() {
  const file = "C:\\Users\\tonna\\Downloads\\The Anthropology IA (1).pdf";
  if (!fs.existsSync(file)) {
    return;
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  let words = 0;
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    const text = content.items
      .map((item) => String(item && item.str ? item.str : "").trim())
      .filter(Boolean)
      .join(" ");
    words += text.split(/\s+/).filter(Boolean).length;
  }
  assert(doc.numPages === 12, "Anthropology PDF sanity fixture should have 12 pages");
  assert(words >= 3000, "Anthropology PDF sanity fixture should expose selectable text");
}

async function main() {
  const engine = loadEngine();
  checkEngineFixtures(engine);
  checkSourceContracts();
  await checkLocalAnthropologyPdf();
  console.log("PagePilot checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
