"use strict";

const statusEls = {
  sections: document.getElementById("sections"),
  important: document.getElementById("important"),
  words: document.getElementById("words"),
  bestLabel: document.getElementById("bestLabel"),
  bestTitle: document.getElementById("bestTitle"),
  bestReason: document.getElementById("bestReason"),
  message: document.getElementById("message")
};

const actionEls = {
  jumpUseful: document.getElementById("jumpUseful"),
  nextImportant: document.getElementById("nextImportant"),
  openSidebar: document.getElementById("openSidebar"),
  rescanPage: document.getElementById("rescanPage")
};

const CONTENT_FILES = ["content/adapters.js", "content/engine.js", "content/ui.js", "content.js"];
const STATUS_POLL_INTERVAL_MS = 700;
const STATUS_POLL_LIMIT = 52;

let currentStatus = null;
let statusPollTimer = null;
let statusPollAttempts = 0;

actionEls.jumpUseful.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  const result = await sendOrInject(tab.id, { type: "PAGEPILOT_JUMP_USEFUL" });
  updateStatus(result);
});

actionEls.nextImportant.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  const result = await sendOrInject(tab.id, { type: "PAGEPILOT_NEXT_IMPORTANT" });
  updateStatus(result);
});

actionEls.openSidebar.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  const result = await sendOrInject(tab.id, { type: "PAGEPILOT_TOGGLE", open: true });
  updateStatus(result);
});

actionEls.rescanPage.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  statusPollAttempts = 0;
  const message = currentStatus && currentStatus.needsPdfOcr
    ? { type: "PAGEPILOT_RUN_PDF_OCR" }
    : { type: "PAGEPILOT_SCAN" };
  const result = await sendOrInject(tab.id, message);
  updateStatus(result);
});

init();

async function init() {
  const tab = await getActiveTab();
  if (!tab) return;
  setStartingStatus("Starting PagePilot", "Checking this page before showing a map.");
  statusPollAttempts = 0;
  const result = await sendOrInject(tab.id, { type: "PAGEPILOT_STATUS" });
  updateStatus(result);
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}

async function sendOrInject(tabId, message) {
  let response = await sendMessage(tabId, message);

  if (response && response.ok) {
    return response;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["styles.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES
    });
    response = await waitAndSend(tabId, message);
    return response;
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "PagePilot cannot run on this page."
    };
  }
}

function waitAndSend(tabId, message) {
  return new Promise((resolve) => {
    let attempts = 0;
    const trySend = async () => {
      attempts += 1;
      const response = await sendMessage(tabId, message);

      if (response && response.ok) {
        resolve(response);
        return;
      }

      if (attempts >= 8) {
        resolve(response || {
          ok: false,
          error: "PagePilot is still loading on this page. Try again in a moment."
        });
        return;
      }

      window.setTimeout(trySend, 90 + attempts * 40);
    };

    trySend();
  });
}

function sendMessage(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch (error) {
      resolve(null);
    }
  });
}

function updateStatus(result) {
  if (!result || !result.ok) {
    currentStatus = null;
    if (isUnavailableResult(result)) {
      setUnavailableStatus(result);
    } else {
      setStartingStatus("Starting PagePilot", result && result.error ? result.error : "PagePilot is loading on this page.");
      scheduleStartupPoll();
    }
    return;
  }

  currentStatus = result;
  const pdfPage = result.pageType === "pdf";
  const pdfReady = Boolean(
    pdfPage
    && (result.pdfReady || (result.sections >= 1 && result.words >= 24 && !result.pdfPending && !result.pdfRetrying && !result.needsPdfOcr))
  );
  const loading = Boolean((result.loading || result.pdfPending || result.pdfRetrying) && !pdfReady);
  const pdfFetchError = Boolean(pdfPage && result.pdfErrorKind === "fetch" && !loading && !pdfReady && !result.pdfRetrying);
  const pdfNeedsOcr = Boolean(pdfPage && result.needsPdfOcr && !loading && !pdfFetchError);

  statusEls.sections.textContent = loading ? "--" : String(result.sections);
  statusEls.important.textContent = loading ? "--" : String(result.important);
  statusEls.words.textContent = loading
    ? "--"
    : result.words > 999
      ? `${Math.round(result.words / 100) / 10}k`
      : String(result.words);

  actionEls.jumpUseful.disabled = loading || !result.canJump;
  actionEls.nextImportant.disabled = loading || !result.canJumpNext;
  actionEls.rescanPage.textContent = pdfNeedsOcr ? "Run OCR" : loading ? "Scanning" : pdfFetchError ? "Retry PDF" : "Rescan";
  actionEls.rescanPage.disabled = loading && !pdfNeedsOcr;

  if (loading) {
    const pdfCopy = pdfPage ? pdfLoadingCopy(result) : null;
    statusEls.bestLabel.textContent = "Scanning";
    statusEls.bestTitle.textContent = pdfCopy ? pdfCopy.title : "Reading page structure...";
    statusEls.bestReason.textContent = pdfCopy ? pdfCopy.reason : "PagePilot is still scanning this page.";
    statusEls.message.textContent = pdfCopy ? pdfCopy.message : "PagePilot is still scanning this page.";
    scheduleStatusPoll(result);
    return;
  }

  if (pdfNeedsOcr) {
    statusEls.bestLabel.textContent = "PDF needs OCR";
    statusEls.bestTitle.textContent = "Run OCR to map this PDF";
    statusEls.bestReason.textContent = shortPdfError(result) || result.bestReason || "Selectable PDF text was not exposed clearly enough.";
    statusEls.message.textContent = "This looks like a scanned PDF. OCR runs locally only after you start it.";
    scheduleStatusPoll(result);
    return;
  }

  if (pdfFetchError) {
    const fileAccessDisabled = result.pdfAccessAllowed === false;
    statusEls.bestLabel.textContent = fileAccessDisabled ? "File access disabled" : "PDF access issue";
    statusEls.bestTitle.textContent = fileAccessDisabled ? "Enable file access" : "Refresh or reopen PDF";
    statusEls.bestReason.textContent = shortPdfError(result);
    statusEls.message.textContent = fileAccessDisabled
      ? "Chrome says PagePilot cannot read local files yet. Enable file access for the extension, then refresh this PDF."
      : "PagePilot will keep this graceful: refresh or reopen the PDF and it will retry selectable text before OCR.";
    scheduleStatusPoll(result);
    return;
  }

  if (pdfReady && !result.canJump) {
    statusEls.bestLabel.textContent = "PDF map ready";
    statusEls.bestTitle.textContent = result.bestTitle || `${result.sections} PDF sections mapped`;
    statusEls.bestReason.textContent = result.bestReason || "Selectable PDF text found.";
    statusEls.message.textContent = result.pdfPartial
      ? "PagePilot mapped the first readable part of this PDF. Use the sidebar page map to move around."
      : "PagePilot mapped this PDF. Use the sidebar page map to move around.";
    scheduleStatusPoll(result);
    return;
  }

  statusEls.bestLabel.textContent = result.quietMode ? "Quiet here" : result.bestLabel || "Best place to start";
  statusEls.bestTitle.textContent = result.bestTitle || (pdfPage ? "PDF map ready" : "Nothing strong to map here");
  statusEls.bestReason.textContent = result.quietMode
    ? (result.quietReason || result.bestReason || "PagePilot will stay out of the way here.")
    : [result.bestReason, result.confidenceLabel, result.targetConfidenceReason].filter(Boolean).join(" - ")
      || "Use the sidebar page map to move around this page.";
  statusEls.message.textContent = result.quietMode
    ? "Not much to organize here. PagePilot is staying quiet."
    : result.shortPage
      ? pdfPage
        ? "PagePilot mapped this PDF. Use the sidebar page map to move around."
        : "This page is brief, so PagePilot will stay out of the way and track your place."
      : result.canJump
        ? readyMessage(result)
        : pdfPage
          ? "PagePilot mapped this PDF. Use the sidebar page map to move around."
          : "PagePilot found structure, but no section clearly stands out.";
  scheduleStatusPoll(result);
}

function setStartingStatus(title, reason) {
  statusEls.sections.textContent = "--";
  statusEls.important.textContent = "--";
  statusEls.words.textContent = "--";
  statusEls.bestLabel.textContent = "Scanning";
  statusEls.bestTitle.textContent = title;
  statusEls.bestReason.textContent = reason || "PagePilot is starting on this page.";
  statusEls.message.textContent = "PagePilot is checking this page locally.";
  actionEls.jumpUseful.disabled = true;
  actionEls.nextImportant.disabled = true;
  actionEls.rescanPage.textContent = "Rescan";
  actionEls.rescanPage.disabled = true;
}

function setUnavailableStatus(result) {
  statusEls.sections.textContent = "--";
  statusEls.important.textContent = "--";
  statusEls.words.textContent = "--";
  statusEls.bestLabel.textContent = "Best start";
  statusEls.bestTitle.textContent = "Unavailable here";
  statusEls.bestReason.textContent = "Chrome does not allow PagePilot to run on this page.";
  statusEls.message.textContent = result && result.error
    ? result.error
    : "Try PagePilot on a normal web page, AI conversation, or PDF.";
  actionEls.jumpUseful.disabled = true;
  actionEls.nextImportant.disabled = true;
  actionEls.rescanPage.textContent = "Rescan";
  actionEls.rescanPage.disabled = true;
  clearStatusPoll();
}

function isUnavailableResult(result) {
  const error = String(result && result.error ? result.error : "");
  return /\b(cannot run|cannot access|restricted|extensions gallery|chrome:\/\/|edge:\/\/|about:|missing host permission|no tab with id)\b/i.test(error);
}

function pdfLoadingCopy(result) {
  const progress = Number.isFinite(result.pdfProgress) && result.pdfProgress > 0
    ? ` ${result.pdfProgress}%`
    : "";
  if (result.pdfState === "ocr") {
    return {
      title: `Running OCR...${progress}`,
      reason: "PagePilot is trying to read the visible PDF page locally.",
      message: "OCR can take a moment. No page content leaves your browser."
    };
  }
  return {
    title: `Reading PDF text...${progress}`,
    reason: "PagePilot is extracting selectable PDF text locally.",
    message: "PagePilot is building the PDF map as soon as text is available."
  };
}

function shortPdfError(result) {
  if (result && result.pdfErrorKind === "fetch") {
    if (result.pdfAccessAllowed === false) {
      return "Chrome says file access is disabled for PagePilot.";
    }
    return "PagePilot could not read this PDF file yet.";
  }
  const text = String(result && result.pdfError ? result.pdfError : "");
  if (!text) return "";
  if (/unexpected server response\s*\(0\)|file:\/\//i.test(text)) {
    return "PagePilot could not read this local PDF yet.";
  }
  return text.length > 140 ? `${text.slice(0, 137).trim()}...` : text;
}

function scheduleStatusPoll(result) {
  const pdfReady = Boolean(
    result
    && result.pageType === "pdf"
    && (result.pdfReady || (result.sections >= 1 && result.words >= 24 && !result.pdfPending && !result.pdfRetrying && !result.needsPdfOcr))
  );
  if (!result || !result.ok || !((result.loading || result.pdfPending || result.pdfRetrying) && !pdfReady)) {
    clearStatusPoll();
    return;
  }
  if (statusPollTimer || statusPollAttempts >= STATUS_POLL_LIMIT) {
    return;
  }

  statusPollTimer = window.setTimeout(async () => {
    statusPollTimer = null;
    statusPollAttempts += 1;
    const tab = await getActiveTab();
    if (!tab) return;
    const next = await sendMessage(tab.id, { type: "PAGEPILOT_STATUS" });
    updateStatus(next);
  }, STATUS_POLL_INTERVAL_MS);
}

function scheduleStartupPoll() {
  if (statusPollTimer || statusPollAttempts >= STATUS_POLL_LIMIT) {
    return;
  }

  statusPollTimer = window.setTimeout(async () => {
    statusPollTimer = null;
    statusPollAttempts += 1;
    const tab = await getActiveTab();
    if (!tab) return;
    const next = await sendOrInject(tab.id, { type: "PAGEPILOT_STATUS" });
    updateStatus(next);
  }, STATUS_POLL_INTERVAL_MS);
}

function clearStatusPoll() {
  if (statusPollTimer) {
    window.clearTimeout(statusPollTimer);
  }
  statusPollTimer = null;
  statusPollAttempts = 0;
}

function readyMessage(result) {
  if (result.savedMinutes >= 2) {
    return `Ready. PagePilot can skip about ${result.savedMinutes} minutes of scrolling.`;
  }

  if (result.bestLabel && /answer/i.test(result.bestLabel)) {
    return "Ready. PagePilot can jump straight to the answer.";
  }

  return "Ready. PagePilot found a useful place to start.";
}
