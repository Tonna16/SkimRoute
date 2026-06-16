const els = {
  sections: document.getElementById("sections"),
  important: document.getElementById("important"),
  words: document.getElementById("words"),
  bestLabel: document.getElementById("bestLabel"),
  bestTitle: document.getElementById("bestTitle"),
  bestReason: document.getElementById("bestReason"),
  message: document.getElementById("message"),
  onboarding: document.getElementById("onboarding"),
  dismissOnboarding: document.getElementById("dismissOnboarding"),
  statusPanel: document.getElementById("statusPanel"),
  fileAccessSetup: document.getElementById("fileAccessSetup"),
  fileAccessStatus: document.getElementById("fileAccessStatus")
};

const buttons = {
  jumpUseful: document.getElementById("jumpUseful"),
  nextImportant: document.getElementById("nextImportant"),
  openSidebar: document.getElementById("openSidebar"),
  rescanPage: document.getElementById("rescanPage"),
  openExtensionSettings: document.getElementById("openExtensionSettings"),
  checkFileAccess: document.getElementById("checkFileAccess")
};

const CONTENT_FILES = [
  "debug-config.js",
  "assets/adapters.js-BxVfMoxi.js",
  "assets/engine.js-BJkAhsDZ.js",
  "assets/ui.js-DPUnGKsp.js",
  "assets/content.js-BzKMfaWY.js"
];
const POLL_MS = 700;
const MAX_POLLS = 52;
const MAX_STARTUP_POLLS = 12;
const PDF_MODE_OPENING_COPY = "Opening PDF Mode so SkimRoute can scroll and highlight sections reliably.";
const PDF_OCR_UNREADABLE_MESSAGE = "OCR finished, but this scan could not be read clearly. Try another PDF or a higher-resolution scan.";
const PDF_OCR_DETECTION_MESSAGE = "Checking whether this PDF needs OCR...";
const PDF_OCR_IMAGE_PROMPT_MESSAGE = "This PDF is image-based. Run OCR to extract its text locally.";
const PDF_OCR_FAST_EXPECTATION_MESSAGE = "Fast OCR runs locally and may take up to a minute on some devices.";
const PDF_OCR_BETTER_EXPECTATION_MESSAGE = "Better OCR runs locally and may take 1-2 minutes on scanned PDFs.";
const PDF_OCR_RUNNING_MESSAGE = "Reading scanned text locally. This may take a minute.";
const PDF_OCR_LONG_RUNNING_MESSAGE = "Still reading the scan locally. Complex scans can take longer on slower devices.";
const ONBOARDING_KEY = "pagepilot.onboardingSeen";

let lastStats = null;
let pollTimer = null;
let pollCount = 0;
let currentTab = null;
let fileAccessCheckInFlight = false;

buttons.jumpUseful.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  renderStats(await ensureAndSend(tab.id, { type: "PAGEPILOT_JUMP_USEFUL" }));
});

buttons.nextImportant.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  renderStats(await ensureAndSend(tab.id, { type: "PAGEPILOT_NEXT_IMPORTANT" }));
});

buttons.openSidebar.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  renderStats(await ensureAndSend(tab.id, { type: "PAGEPILOT_TOGGLE", open: true }));
});

buttons.rescanPage.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  pollCount = 0;
  const message = lastStats && lastStats.pdfOcrActive && lastStats.pdfOcrCanCancel
    ? { type: "PAGEPILOT_CANCEL_PDF_OCR" }
    : lastStats && (lastStats.needsPdfOcr || lastStats.pdfOcrCanRunFast || lastStats.pdfOcrCanRunBetter)
    ? { type: "PAGEPILOT_RUN_PDF_OCR", mode: lastStats.pdfOcrCanRunBetter ? "better" : "fast" }
    : { type: "PAGEPILOT_SCAN" };
  renderStats(await ensureAndSend(tab.id, message));
});

if (els.dismissOnboarding) {
  els.dismissOnboarding.addEventListener("click", async () => {
    if (els.onboarding) els.onboarding.dataset.visible = "false";
    await storageSet(ONBOARDING_KEY, true);
  });
}

if (buttons.openExtensionSettings) {
  buttons.openExtensionSettings.addEventListener("click", () => {
    const settingsUrl = `chrome://extensions/?id=${encodeURIComponent(chrome.runtime.id)}`;
    chrome.tabs.create({ url: settingsUrl });
  });
}

if (buttons.checkFileAccess) {
  buttons.checkFileAccess.addEventListener("click", async () => {
    await refreshLocalFileAccessState({ force: true });
  });
}

window.addEventListener("focus", () => {
  void refreshLocalFileAccessState();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshLocalFileAccessState();
});

initPopup();

async function initPopup() {
  const tab = await getActiveTab();
  if (!tab) return;
  currentTab = tab;
  renderOnboarding();
  if (await maybeShowLocalFileAccessSetup(tab)) return;
  hideLocalFileAccessSetup();
  await loadTabStatus(tab);
}

async function loadTabStatus(tab) {
  if (!tab || !tab.id) return;
  currentTab = tab;
  showStarting("Checking this page", "SkimRoute is loading its local page reader.");
  pollCount = 0;
  const cached = await getCachedPdfStatus(tab);
  let renderedStable = false;
  if (isReadyPdfStats(cached)) {
    debugPopup("popup:pdf-status-from-stable-cache", {
      tabId: tab.id,
      url: tab.url || "",
      sections: cached.sections,
      words: cached.words,
      pdfState: cached.pdfState || "",
      pdfReady: Boolean(cached.pdfReady)
    });
    renderStats(cached);
    renderedStable = true;
  }
  const fresh = await ensureAndSend(tab.id, { type: "PAGEPILOT_STATUS" });
  if (isReadyPdfStats(fresh)) {
    debugPopup("popup:pdf-status-from-content-script", {
      tabId: tab.id,
      url: tab.url || "",
      sections: fresh.sections,
      words: fresh.words,
      pdfState: fresh.pdfState || "",
      pdfReady: Boolean(fresh.pdfReady)
    });
    renderStats(fresh);
    return;
  }
  if (!renderedStable) {
    renderStats(fresh);
  } else if (fresh && fresh.ok) {
    debugPopup("popup:pdf-status-from-stable-cache", {
      tabId: tab.id,
      url: tab.url || "",
      ignoredFreshPdfState: fresh.pdfState || "",
      ignoredFreshLoading: Boolean(fresh.loading || fresh.pdfPending || fresh.pdfRetrying),
      exactIssue: "Content script returned a non-ready PDF status after the popup already rendered a stable ready OCR map, so the popup kept the stable map."
    });
  }
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}

function isLocalPdfUrl(url) {
  const value = String(url || "");
  return /^file:\/\//i.test(value) && /\.pdf(?:$|[?#])/i.test(value);
}

async function getFileAccessStatus() {
  const response = await sendRuntimeMessage({ type: "PAGEPILOT_FILE_ACCESS_STATUS" });
  if (!response || !response.ok) return null;
  return typeof response.allowed === "boolean" ? response.allowed : null;
}

async function maybeShowLocalFileAccessSetup(tab) {
  if (!tab || !isLocalPdfUrl(tab.url)) return false;
  const allowed = await getFileAccessStatus();
  if (allowed !== false) return false;
  showLocalFileAccessSetup();
  debugPopup("popup:local-pdf-file-access-required", {
    tabId: tab.id,
    url: tab.url || "",
    allowed: false
  });
  return true;
}

function showLocalFileAccessSetup(statusMessage = "") {
  stopPolling();
  lastStats = null;
  if (els.fileAccessSetup) els.fileAccessSetup.dataset.visible = "true";
  if (els.statusPanel) els.statusPanel.hidden = true;
  if (els.onboarding) els.onboarding.dataset.visible = "false";
  if (els.fileAccessStatus) els.fileAccessStatus.textContent = statusMessage;
}

function hideLocalFileAccessSetup() {
  if (els.fileAccessSetup) els.fileAccessSetup.dataset.visible = "false";
  if (els.statusPanel) els.statusPanel.hidden = false;
  if (els.fileAccessStatus) els.fileAccessStatus.textContent = "";
}

async function refreshLocalFileAccessState({ force = false } = {}) {
  if (fileAccessCheckInFlight) return;
  const panelVisible = Boolean(els.fileAccessSetup && els.fileAccessSetup.dataset.visible === "true");
  if (!force && !panelVisible) return;
  fileAccessCheckInFlight = true;
  try {
    const tab = await getActiveTab();
    if (!tab || !isLocalPdfUrl(tab.url)) {
      hideLocalFileAccessSetup();
      return;
    }
    currentTab = tab;
    if (els.fileAccessStatus) els.fileAccessStatus.textContent = "Checking Chrome file access...";
    if (buttons.checkFileAccess) buttons.checkFileAccess.disabled = true;
    const allowed = await getFileAccessStatus();
    if (allowed === true) {
      hideLocalFileAccessSetup();
      showStarting("Local PDF access enabled", "SkimRoute is reconnecting to this PDF.");
      await loadTabStatus(tab);
      return;
    }
    showLocalFileAccessSetup(
      allowed === false
        ? "File access is still off. Turn on Allow access to file URLs, then check again."
        : "Chrome did not report the setting yet. Reopen this popup after enabling file access."
    );
  } finally {
    if (buttons.checkFileAccess) buttons.checkFileAccess.disabled = false;
    fileAccessCheckInFlight = false;
  }
}

async function ensureAndSend(tabId, message) {
  let response = await sendMessage(tabId, message);
  if (response && response.ok) return response;

  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["styles.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    response = await waitForContentScript(tabId, message);
    return response;
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "SkimRoute cannot run on this page."
    };
  }
}

function waitForContentScript(tabId, message) {
  return new Promise((resolve) => {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const response = await sendMessage(tabId, message);
      if (response && response.ok) {
        resolve(response);
        return;
      }
      if (attempts >= 8) {
        resolve(response || { ok: false, error: "SkimRoute is still loading on this page. Try again in a moment." });
        return;
      }
      window.setTimeout(tick, 90 + attempts * 40);
    };
    tick();
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
    } catch {
      resolve(null);
    }
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function getCachedPdfStatus(tab) {
  if (!tab || !tab.id) return null;
  return sendRuntimeMessage({
    type: "PAGEPILOT_GET_CACHED_STATUS",
    tabId: tab.id,
    url: tab.url || ""
  });
}

function debugPopup(event, payload = {}) {
  if (globalThis.SKIMROUTE_DEV_MODE !== true) return;
  sendRuntimeMessage({
    type: "PAGEPILOT_DEBUG_EVENT",
    payload: {
      event,
      url: payload.url || "",
      title: "SkimRoute popup",
      time: new Date().toISOString(),
      ...payload
    }
  });
}

function isReadyPdfStats(stats) {
  if (!stats || !stats.ok) return false;
  if (stats.pageType !== "pdf" && stats.pageLabel !== "PDF") return false;
  const sections = Number(stats.sections || 0);
  const words = Number(stats.words || 0);
  return Boolean(
    stats.pdfReady
    || stats.usableSnapshot
    || stats.pdfState === "ready" && sections >= 1
    || sections >= 1 && words >= 24 && !stats.pdfPending && !stats.pdfRetrying && !stats.needsPdfOcr
  );
}

function renderStats(stats) {
  if (!stats || !stats.ok) {
    lastStats = null;
    if (isRestricted(stats)) {
      showUnavailable(stats);
    } else {
      showStarting("Checking this page", stats && stats.error ? stats.error : "SkimRoute is loading its local page reader.");
      scheduleInjectionPoll();
    }
    return;
  }

  lastStats = stats;
  hideLocalFileAccessSetup();
  const isPdf = stats.pageType === "pdf";
  const isSearch = stats.pageType === "search_results";
  const pdfReady = isReadyPdfStats(stats);
  const loading = Boolean((stats.loading || stats.pdfPending || stats.pdfRetrying) && !pdfReady);
  if (pdfReady && isPdf && String(stats.pdfSource || "").toLowerCase() === "ocr") {
    debugPopup("pdf:ocr:popup-state-synced", {
      sections: stats.sections,
      words: stats.words,
      pdfState: stats.pdfState || "",
      canJump: Boolean(stats.canJump),
      canJumpNext: Boolean(stats.canJumpNext),
      exactIssue: "Popup rendered the ready OCR PDF status instead of a stale running/loading state."
    });
  }
  const pdfAccessIssue = Boolean(isPdf && isPdfAccessIssue(stats) && !loading && !pdfReady && !stats.pdfRetrying);
  const ocrUnreadable = Boolean(isPdf && stats.ocrUnreadable && !loading);
  const ocrFailed = Boolean(isPdf && stats.pdfState === "ocr-failed" && !loading);
  const ocrTerminal = ocrUnreadable || ocrFailed;
  const needsOcr = Boolean(isPdf && stats.needsPdfOcr && !loading && !pdfAccessIssue);
  const canCancelOcr = Boolean(isPdf && stats.pdfOcrActive && stats.pdfOcrCanCancel);
  const canRunBetterOcr = Boolean(isPdf && !stats.pdfOcrActive && stats.pdfOcrCanRunBetter);
  const canRunFastOcr = Boolean(isPdf && !stats.pdfOcrActive && stats.pdfOcrCanRunFast);

  els.sections.textContent = loading ? "--" : String(stats.sections);
  els.important.textContent = loading ? "--" : String(stats.important);
  els.words.textContent = loading ? "--" : formatWords(stats.words);

  buttons.jumpUseful.disabled = loading || !stats.canJump;
  buttons.nextImportant.disabled = loading || !stats.canJumpNext;
  buttons.rescanPage.textContent = canCancelOcr ? "Cancel OCR" : canRunBetterOcr ? "Better OCR" : canRunFastOcr || needsOcr ? "Run OCR" : loading ? "Scanning" : pdfAccessIssue ? "Retry PDF" : "Rescan";
  buttons.rescanPage.disabled = loading && !needsOcr && !canCancelOcr && !canRunBetterOcr && !canRunFastOcr;

  if (loading) {
    const copy = isPdf ? pdfLoadingCopy(stats) : null;
    const chatWaiting = stats.pageType === "chat";
    els.bestLabel.textContent = chatWaiting ? "Waiting" : "Checking";
    els.bestTitle.textContent = copy ? copy.title : chatWaiting ? "Waiting for conversation..." : isSearch ? "Reading search results..." : "Checking this page...";
    els.bestReason.textContent = copy ? copy.reason : chatWaiting ? "SkimRoute is waiting for the conversation to finish loading." : "SkimRoute is checking this page locally.";
    els.message.textContent = copy ? copy.message : chatWaiting ? "Keep SkimRoute open; it will update when the answer loads." : isSearch ? "SkimRoute is finding the AI Overview, People also ask, and top result areas." : "SkimRoute is checking this page locally.";
    scheduleStatusPoll(stats);
    return;
  }

  if (ocrTerminal) {
    els.bestLabel.textContent = ocrUnreadable ? "OCR finished" : "OCR failed";
    els.bestTitle.textContent = ocrUnreadable ? "Scan could not be read clearly" : "OCR could not finish";
    els.bestReason.textContent = pdfErrorCopy(stats) || stats.pdfError || PDF_OCR_UNREADABLE_MESSAGE;
    els.message.textContent = "Try another PDF or a higher-resolution scan. OCR runs locally if you try again.";
    stopPolling();
    return;
  }

  if (needsOcr) {
    els.bestLabel.textContent = "PDF needs OCR";
    els.bestTitle.textContent = "Run OCR to map this PDF";
    els.bestReason.textContent = pdfErrorCopy(stats) || stats.bestReason || PDF_OCR_IMAGE_PROMPT_MESSAGE;
    els.message.textContent = stats.pdfOcrCanRunBetter ? PDF_OCR_BETTER_EXPECTATION_MESSAGE : PDF_OCR_FAST_EXPECTATION_MESSAGE;
    scheduleStatusPoll(stats);
    return;
  }

  if (pdfAccessIssue) {
    const fileAccessDisabled = stats.pdfAccessAllowed === false;
    if (fileAccessDisabled && currentTab && isLocalPdfUrl(currentTab.url)) {
      showLocalFileAccessSetup("File access is off. Open extension settings and enable Allow access to file URLs.");
      return;
    }
    els.bestLabel.textContent = fileAccessDisabled ? "File access disabled" : "PDF access issue";
    els.bestTitle.textContent = fileAccessDisabled ? "Enable file access" : "Cannot read this PDF";
    els.bestReason.textContent = pdfErrorCopy(stats);
    els.message.textContent = fileAccessDisabled
      ? "Chrome says SkimRoute cannot read local files yet. Enable file URL access for the extension, then refresh this PDF."
      : "SkimRoute will keep this graceful: refresh or reopen the PDF and it will retry before OCR.";
    stopPolling();
    return;
  }

  if (pdfReady && !stats.canJump) {
    els.bestLabel.textContent = "PDF map ready";
    els.bestTitle.textContent = stats.bestTitle || `${stats.sections} PDF sections mapped`;
    els.bestReason.textContent = stats.qualityMessage || stats.bestReason || "Selectable PDF text found.";
    els.message.textContent = stats.qualityMessage || (stats.pdfPartial
      ? "SkimRoute mapped the first readable part of this PDF. Use the sidebar page map to move around."
      : "SkimRoute mapped this PDF. Use the sidebar page map to move around.");
    stopPolling();
    return;
  }

  els.bestLabel.textContent = stats.quietMode ? "Quiet here" : stats.bestLabel || stats.bestKindLabel || "Best place to start";
  els.bestTitle.textContent = stats.bestTitle || (isPdf ? "PDF map ready" : isSearch ? "Search results found" : "Nothing strong to map here");
  els.bestReason.textContent = stats.quietMode
    ? stats.quietReason || stats.bestReason || "SkimRoute will stay out of the way here."
    : formatReason([stats.bestReason, stats.confidenceLabel, stats.targetConfidenceReason].filter(Boolean).join(" - ")) || "Use the sidebar page map to move around this page.";
  els.message.textContent = messageForReadyState(stats);
  stopPolling();
}

function showStarting(title, reason) {
  els.sections.textContent = "--";
  els.important.textContent = "--";
  els.words.textContent = "--";
  els.bestLabel.textContent = "Checking";
  els.bestTitle.textContent = title;
  els.bestReason.textContent = reason || "SkimRoute is starting on this page.";
  els.message.textContent = "SkimRoute is checking this page locally.";
  buttons.jumpUseful.disabled = true;
  buttons.nextImportant.disabled = true;
  buttons.rescanPage.textContent = "Rescan";
  buttons.rescanPage.disabled = true;
}

function showUnavailable(stats) {
  els.sections.textContent = "--";
  els.important.textContent = "--";
  els.words.textContent = "--";
  els.bestLabel.textContent = "Best start";
  els.bestTitle.textContent = "Unavailable here";
  els.bestReason.textContent = "Chrome does not allow SkimRoute to run on this page.";
  els.message.textContent = stats && stats.error ? stats.error : "Try SkimRoute on a normal web page, AI conversation, or PDF.";
  buttons.jumpUseful.disabled = true;
  buttons.nextImportant.disabled = true;
  buttons.rescanPage.textContent = "Rescan";
  buttons.rescanPage.disabled = true;
  stopPolling();
}

function isRestricted(stats) {
  const error = String(stats && stats.error ? stats.error : "");
  return /\b(cannot run|cannot access|restricted|extensions gallery|chrome:\/\/|edge:\/\/|about:|missing host permission|no tab with id)\b/i.test(error);
}

function pdfLoadingCopy(stats) {
  const progress = Number.isFinite(stats.pdfProgress) && stats.pdfProgress > 0 ? ` ${stats.pdfProgress}%` : "";
  if (stats.pdfState === "ocr" && stats.pdfOcrActive && stats.pdfOcrWorkerActive) {
    const longRunning = String(stats.loadingReason || stats.bestReason || stats.pdfOcrMessage || "").includes(PDF_OCR_LONG_RUNNING_MESSAGE);
    return {
      title: `${longRunning ? PDF_OCR_LONG_RUNNING_MESSAGE : PDF_OCR_RUNNING_MESSAGE}${progress}`,
      reason: "SkimRoute is reading the scanned text locally.",
      message: "OCR can take a moment. No page content leaves your browser."
    };
  }
  if (stats.pdfState === "ocr") {
    return {
      title: stats.pdfOcrRecommendedMode === "better" || stats.pdfOcrMode === "better" ? PDF_OCR_BETTER_EXPECTATION_MESSAGE : PDF_OCR_FAST_EXPECTATION_MESSAGE,
      reason: PDF_OCR_IMAGE_PROMPT_MESSAGE,
      message: "OCR starts only after you choose it, and it runs locally in this browser."
    };
  }
  if (/pdf mode|opening/i.test(String(stats.loadingReason || stats.bestReason || ""))) {
    return {
      title: "Opening PDF Mode",
      reason: PDF_MODE_OPENING_COPY,
      message: "SkimRoute is rendering this PDF locally for reliable section jumps."
    };
  }
  return {
    title: `${PDF_OCR_DETECTION_MESSAGE}${progress}`,
    reason: "SkimRoute is checking whether selectable text is available before offering OCR.",
    message: "If this is a scanned PDF, SkimRoute will ask before running OCR."
  };
}

function pdfErrorCopy(stats) {
  if (!stats) return "";
  if (stats.pdfErrorKind === "protected") return "This PDF is protected, so SkimRoute cannot read it.";
  if (stats.pdfErrorKind === "too-large") return "This PDF is too large for SkimRoute to read locally.";
  if (stats.pdfErrorKind === "local-file") {
    return stats.pdfAccessAllowed === false
      ? "Chrome says file access is disabled for SkimRoute."
      : "SkimRoute could not read this local PDF yet.";
  }
  if (stats.pdfErrorKind === "fetch") return "SkimRoute could not read this PDF file yet.";
  if (stats.pdfErrorKind === "ocr-low-text" || stats.pdfErrorKind === "ocr-unreadable" || stats.ocrUnreadable) return PDF_OCR_UNREADABLE_MESSAGE;
  const error = String(stats.pdfError || "");
  return error ? error.length > 140 ? `${error.slice(0, 137).trim()}...` : error : "";
}

function isPdfAccessIssue(stats) {
  return /^(fetch|local-file|protected|too-large|unsupported)$/i.test(String(stats.pdfErrorKind || ""));
}

function messageForReadyState(stats) {
  if (stats.pageType === "search_results") {
    return stats.quietMode
      ? "This page is mostly search results. Open a result for a full Page Map."
      : "Search results found. SkimRoute works best after you open a result, but it can still help you focus the AI Overview or top result areas.";
  }
  if (stats.qualityMessage) return stats.qualityMessage;
  if (stats.quietMode) return "Not much to organize here. SkimRoute is staying quiet.";
  if (stats.shortPage) {
    return stats.pageType === "pdf"
      ? "SkimRoute mapped this PDF. Use the sidebar page map to move around."
      : "This page is brief, so SkimRoute will stay out of the way and track your place.";
  }
  if (stats.canJump) {
    if (stats.savedMinutes >= 2) return `Ready. SkimRoute can skip about ${stats.savedMinutes} minutes of scrolling.`;
    if (stats.bestKindLabel) return `Ready. SkimRoute found a useful ${stats.bestKindLabel.toLowerCase()}.`;
    if (stats.bestLabel && /answer/i.test(stats.bestLabel)) return "Ready. SkimRoute can jump straight to the answer.";
    return "Ready. SkimRoute found a useful place to start.";
  }
  return stats.pageType === "pdf"
    ? "SkimRoute mapped this PDF. Use the sidebar page map to move around."
    : "SkimRoute found structure, but no section clearly stands out.";
}

function formatReason(reason) {
  const value = String(reason || "").trim();
  if (!value) return "";
  return /^why:/i.test(value) ? value : `Why: ${value}`;
}

async function renderOnboarding() {
  if (!els.onboarding) return;
  const seen = await storageGet(ONBOARDING_KEY);
  els.onboarding.dataset.visible = seen ? "false" : "true";
}

function storageGet(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (result) => {
        resolve(result ? result[key] : null);
      });
    } catch {
      resolve(null);
    }
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

function formatWords(words) {
  return words > 999 ? `${Math.round(words / 100) / 10}k` : String(words);
}

function scheduleStatusPoll(stats) {
  const pdfReady = isReadyPdfStats(stats);
  if (!stats || !stats.ok || !((stats.loading || stats.pdfPending || stats.pdfRetrying) && !pdfReady)) {
    stopPolling();
    return;
  }
  if (pollTimer || pollCount >= MAX_POLLS) return;
  pollTimer = window.setTimeout(async () => {
    pollTimer = null;
    pollCount += 1;
    const tab = await getActiveTab();
    if (!tab) return;
    const response = await sendMessage(tab.id, { type: "PAGEPILOT_STATUS" });
    if (isReadyPdfStats(response)) {
      debugPopup("popup:pdf-status-from-content-script", {
        tabId: tab.id,
        url: tab.url || "",
        sections: response.sections,
        words: response.words,
        pdfState: response.pdfState || "",
        pdfReady: Boolean(response.pdfReady)
      });
    }
    renderStats(response);
  }, POLL_MS);
}

function scheduleInjectionPoll() {
  if (pollTimer) return;
  if (pollCount >= MAX_STARTUP_POLLS) {
    getActiveTab().then((tab) => showStartupFallback(tab));
    return;
  }
  pollTimer = window.setTimeout(async () => {
    pollTimer = null;
    pollCount += 1;
    const tab = await getActiveTab();
    if (!tab) return;
    renderStats(await ensureAndSend(tab.id, { type: "PAGEPILOT_STATUS" }));
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) window.clearTimeout(pollTimer);
  pollTimer = null;
  pollCount = 0;
}

function showStartupFallback(tab) {
  const url = String(tab && tab.url || "");
  const copy = startupFallbackCopy(url);
  els.sections.textContent = "--";
  els.important.textContent = "--";
  els.words.textContent = "--";
  els.bestLabel.textContent = copy.label;
  els.bestTitle.textContent = copy.title;
  els.bestReason.textContent = copy.reason;
  els.message.textContent = copy.message;
  buttons.jumpUseful.disabled = true;
  buttons.nextImportant.disabled = true;
  buttons.rescanPage.textContent = "Try again";
  buttons.rescanPage.disabled = false;
  stopPolling();
}

function startupFallbackCopy(url) {
  if (/\.pdf(?:$|[?#])/i.test(url) || /^file:\/\//i.test(url)) {
    return {
      label: "PDF check",
      title: "PDF reader is still loading",
      reason: "SkimRoute needs the PDF text layer or OCR files before it can build a map.",
      message: "If this is a local or scanned PDF, enable file URL access or run OCR once the PDF finishes opening."
    };
  }
  if (/\b(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|perplexity\.ai|copilot\.microsoft\.com|copilot\.com|grok\.com)\b/i.test(url)) {
    return {
      label: "Conversation",
      title: "Conversation is still loading",
      reason: "SkimRoute is waiting for a complete assistant answer before choosing a jump target.",
      message: "Open the conversation or wait for the latest answer to finish, then try again."
    };
  }
  return {
    label: "Quiet here",
    title: "No stable map yet",
    reason: "SkimRoute could not find enough long-form structure on this page yet.",
    message: "This can happen on dashboards, code pages, settings pages, or very short pages."
  };
}
