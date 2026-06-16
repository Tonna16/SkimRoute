const DEBUG_PREFIX = "[SkimRoute]";
const DEBUG_ENABLED = globalThis.SKIMROUTE_DEV_MODE === true;
const PDF_STATUS_CACHE_TTL_MS = 10 * 60 * 1000;
const pdfStatusCache = new Map();

function log(event, payload) {
  if (!DEBUG_ENABLED) return;
  try {
    if (payload !== undefined) {
      console.info(`${DEBUG_PREFIX} ${event}`, payload);
    } else {
      console.info(`${DEBUG_PREFIX} ${event}`);
    }
  } catch {
    // Logging should never break the service worker.
  }
}

function getVersion() {
  try {
    return chrome.runtime.getManifest().version || "unknown";
  } catch {
    return "unknown";
  }
}

function summarizeDebugEvent(payload) {
  const stats = payload.stats || {};
  const diagnostics = payload.diagnostics || null;
  return {
    event: payload.event || "unknown",
    url: payload.url || "",
    title: payload.title || "",
    pageType: stats.pageType || "",
    pageLabel: stats.pageLabel || "",
    quietMode: stats.quietMode,
    sections: stats.sections,
    important: stats.important,
    words: stats.words,
    confidence: stats.confidence,
    confidenceLabel: stats.confidenceLabel,
    bestLabel: stats.bestLabel,
    reason: stats.quietReason || stats.bestReason || "",
    diagnosticHint: diagnostics && diagnostics.pageProfileAfter && diagnostics.pageProfileAfter.diagnosticHint || "",
    profileBefore: diagnostics && diagnostics.pageProfileBefore ? {
      type: diagnostics.pageProfileBefore.type || "",
      label: diagnostics.pageProfileBefore.label || "",
      quietMode: diagnostics.pageProfileBefore.quietMode,
      reason: diagnostics.pageProfileBefore.reason || ""
    } : null,
    profileAfter: diagnostics && diagnostics.pageProfileAfter ? {
      type: diagnostics.pageProfileAfter.type || "",
      label: diagnostics.pageProfileAfter.label || "",
      quietMode: diagnostics.pageProfileAfter.quietMode,
      reason: diagnostics.pageProfileAfter.reason || "",
      diagnosticHint: diagnostics.pageProfileAfter.diagnosticHint || ""
    } : null,
    diagnostics,
    pdfGoalCheck: payload.event === "pdf:goal-check" ? {
      status: payload.status || "",
      failingGoals: payload.failingGoals || [],
      blockers: payload.blockers || [],
      goals: payload.goals || {},
      pdfState: payload.pdfState || "",
      progress: payload.progress,
      elapsedMs: payload.elapsedMs,
      routeKey: payload.routeKey || "",
      sourceUrl: payload.sourceUrl || "",
      words: payload.words,
      recoveredWords: payload.recoveredWords,
      sections: payload.sections,
      importantSections: payload.importantSections,
      pagesRecovered: payload.pagesRecovered,
      bestSection: payload.bestSection || null,
      jumpStrategy: payload.jumpStrategy || "",
      errorKind: payload.errorKind || "",
      error: payload.error || "",
      note: payload.note || ""
    } : null
  };
}

function normalizeStatusCacheKey(tabId, routeKey, url) {
  const tabPart = Number.isFinite(Number(tabId)) ? String(Number(tabId)) : "tab";
  const routePart = String(routeKey || url || "latest").slice(0, 500);
  return `${tabPart}::${routePart}`;
}

function isReadyPdfStatus(payload) {
  if (!payload || payload.ok === false) return false;
  if (payload.pageType !== "pdf" && payload.pageLabel !== "PDF") return false;
  const sections = Number(payload.sections || 0);
  const words = Number(payload.words || 0);
  return Boolean(
    payload.pdfReady
    || payload.usableSnapshot
    || payload.pdfState === "ready" && sections >= 1
    || sections >= 1 && words >= 24 && !payload.pdfPending && !payload.pdfRetrying && !payload.needsPdfOcr
  );
}

function cachePdfStatus(tabId, routeKey, url, payload, source) {
  if (!Number.isFinite(Number(tabId)) || !isReadyPdfStatus(payload)) return false;
  const cachedAt = Date.now();
  const entry = {
    ...payload,
    ok: true,
    cached: true,
    cachedAt,
    cacheSource: source || "status-push",
    tabId: Number(tabId),
    routeKey: routeKey || payload.routeKey || "",
    url: url || payload.url || ""
  };
  const latestKey = normalizeStatusCacheKey(tabId, "", "");
  const routeKeyValue = normalizeStatusCacheKey(tabId, entry.routeKey, entry.url);
  pdfStatusCache.set(latestKey, entry);
  pdfStatusCache.set(routeKeyValue, entry);
  log("pdf status cached", {
    tabId: Number(tabId),
    routeKey: entry.routeKey,
    url: entry.url,
    sections: entry.sections,
    words: entry.words,
    pdfState: entry.pdfState,
    source: entry.cacheSource
  });
  return true;
}

function getCachedPdfStatus(tabId, routeKey, url) {
  if (!Number.isFinite(Number(tabId))) return null;
  const keys = [
    normalizeStatusCacheKey(tabId, routeKey, url),
    normalizeStatusCacheKey(tabId, "", "")
  ];
  for (const key of keys) {
    const entry = pdfStatusCache.get(key);
    if (!entry) continue;
    if (Date.now() - Number(entry.cachedAt || 0) > PDF_STATUS_CACHE_TTL_MS) {
      pdfStatusCache.delete(key);
      continue;
    }
    if (isReadyPdfStatus(entry)) return entry;
  }
  return null;
}

log("service worker loaded", { version: getVersion() });

try {
  chrome.runtime.onInstalled.addListener((details) => {
    log("installed", { reason: details && details.reason, version: getVersion() });
  });
  chrome.runtime.onStartup.addListener(() => {
    log("startup", { version: getVersion() });
  });
} catch (error) {
  log("failed to attach lifecycle listeners", { error: String(error && error.message ? error.message : error) });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "PAGEPILOT_DEBUG_EVENT") {
    const payload = message.payload || {};
    log("debug event", payload.event === "pdf:ocr:final-diagnostic" ? payload : summarizeDebugEvent(payload));
    if (typeof sendResponse === "function") sendResponse({ ok: true });
    return true;
  }

  if (message.type === "PAGEPILOT_STATUS_PUSH") {
    const payload = message.payload || {};
    const tabId = sender && sender.tab && Number.isFinite(sender.tab.id) ? sender.tab.id : Number(message.tabId);
    const routeKey = String(message.routeKey || payload.routeKey || "");
    const url = String(message.url || payload.url || sender && sender.tab && sender.tab.url || "");
    const cached = cachePdfStatus(tabId, routeKey, url, payload, message.source || "status-push");
    if (typeof sendResponse === "function") sendResponse({ ok: true, cached });
    return true;
  }

  if (message.type === "PAGEPILOT_GET_CACHED_STATUS") {
    const tabId = Number(message.tabId);
    const routeKey = String(message.routeKey || "");
    const url = String(message.url || "");
    const cached = getCachedPdfStatus(tabId, routeKey, url);
    if (typeof sendResponse === "function") {
      sendResponse(cached ? { ...cached, ok: true, cached: true } : { ok: false, cacheMiss: true });
    }
    return true;
  }

  if (message.type === "PAGEPILOT_DEBUG_PING") {
    log("debug ping", message.payload || {});
    if (typeof sendResponse === "function") sendResponse({ ok: true });
    return true;
  }

  if (message.type === "PAGEPILOT_CAPTURE_VISIBLE_TAB") {
    try {
      const windowId = sender && sender.tab && Number.isFinite(sender.tab.windowId) ? sender.tab.windowId : undefined;
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Unable to capture visible tab.";
          log("capture visible tab failed", { error });
          if (typeof sendResponse === "function") sendResponse({ ok: false, error });
          return;
        }
        log("capture visible tab ok", { windowId });
        if (typeof sendResponse === "function") sendResponse({ ok: true, dataUrl });
      });
    } catch (error) {
      const messageText = String(error && error.message ? error.message : error);
      log("capture visible tab exception", { error: messageText });
      if (typeof sendResponse === "function") sendResponse({ ok: false, error: messageText });
    }
    return true;
  }

  if (message.type === "PAGEPILOT_FETCH_PDF_BYTES") {
    const url = String(message.url || "");
    const maxBytes = Math.min(Number.isFinite(message.maxBytes) && message.maxBytes > 0 ? message.maxBytes : 14680064, 14680064);
    fetchPdfBytes(url, maxBytes)
      .then((result) => {
        log("fetch pdf bytes ok", { url, bytes: result.byteLength });
        if (typeof sendResponse === "function") sendResponse({ ok: true, data: result.data, byteLength: result.byteLength });
      })
      .catch((error) => {
        const messageText = String(error && error.message ? error.message : error);
        log("fetch pdf bytes failed", { url, error: messageText });
        if (typeof sendResponse === "function") sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === "PAGEPILOT_FILE_ACCESS_STATUS") {
    try {
      if (chrome.extension && typeof chrome.extension.isAllowedFileSchemeAccess === "function") {
        chrome.extension.isAllowedFileSchemeAccess((allowed) => {
          if (typeof sendResponse === "function") sendResponse({ ok: true, allowed: Boolean(allowed) });
        });
        return true;
      }
      if (typeof sendResponse === "function") sendResponse({ ok: true, allowed: null });
    } catch (error) {
      if (typeof sendResponse === "function") {
        sendResponse({ ok: false, allowed: null, error: String(error && error.message ? error.message : error) });
      }
    }
    return true;
  }

  if (message.type === "PAGEPILOT_NAVIGATE_PDF_PAGE") {
    const url = String(message.url || "");
    const tabId = sender && sender.tab && Number.isFinite(sender.tab.id) ? sender.tab.id : null;
    if (tabId === null) {
      if (typeof sendResponse === "function") sendResponse({ ok: false, error: "No active PDF tab was available." });
      return true;
    }
    if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
      if (typeof sendResponse === "function") sendResponse({ ok: false, error: "Unsupported PDF navigation URL." });
      return true;
    }
    if (sender && sender.tab && sender.tab.url === url) {
      log("navigate pdf page skipped same url", { tabId, url });
      if (typeof sendResponse === "function") sendResponse({ ok: true, tabId, sameUrl: true });
      return true;
    }
    chrome.tabs.update(tabId, { url }, (tab) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message || "Unable to navigate PDF page.";
        log("navigate pdf page failed", { url, error });
        if (typeof sendResponse === "function") sendResponse({ ok: false, error });
        return;
      }
      log("navigate pdf page ok", { tabId, url });
      if (typeof sendResponse === "function") sendResponse({ ok: true, tabId: tab && tab.id });
    });
    return true;
  }

  return false;
});

async function fetchPdfBytes(url, maxBytes) {
  if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
    throw new Error("Unsupported PDF URL.");
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, 9000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller ? controller.signal : undefined });
    const buffer = await readPdfResponseBuffer(response, url, maxBytes);
    return { data: arrayBufferToBase64(buffer), byteLength: buffer.byteLength || 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function readPdfResponseBuffer(response, url, maxBytes) {
  const localFileStatusZero = /^file:\/\//i.test(String(url || "")) && response && response.status === 0;
  if (!response || (!response.ok && !localFileStatusZero)) {
    throw new Error(`Fetch failed with status ${response ? response.status : "unknown"}.`);
  }
  const contentLength = Number(response.headers && response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`PDF is too large for local recovery (${Math.round(contentLength / 1024 / 1024)} MB).`);
  }
  const buffer = await response.arrayBuffer();
  if (!buffer || !buffer.byteLength) {
    throw new Error(localFileStatusZero ? "Unable to read bytes from this local PDF file." : "PDF byte response was empty.");
  }
  if (buffer.byteLength > maxBytes) {
    throw new Error(`PDF is too large for local recovery (${Math.round(buffer.byteLength / 1024 / 1024)} MB).`);
  }
  return buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
