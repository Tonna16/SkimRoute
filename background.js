/* eslint-disable no-console */
"use strict";

const PREFIX = "[PagePilot]";
const PDF_FETCH_TIMEOUT_MS = 9000;
const PDF_MAX_BACKGROUND_BYTES = 14 * 1024 * 1024;

function log(message, payload) {
  try {
    if (payload !== undefined) {
      console.info(`${PREFIX} ${message}`, payload);
    } else {
      console.info(`${PREFIX} ${message}`);
    }
  } catch (error) {
    // Ignore logging failures.
  }
}

function manifestVersion() {
  try {
    return chrome.runtime.getManifest().version || "unknown";
  } catch (error) {
    return "unknown";
  }
}

log("service worker loaded", { version: manifestVersion() });

try {
  chrome.runtime.onInstalled.addListener((details) => {
    log("installed", { reason: details && details.reason, version: manifestVersion() });
  });
  chrome.runtime.onStartup.addListener(() => {
    log("startup", { version: manifestVersion() });
  });
} catch (error) {
  log("failed to attach lifecycle listeners", { error: String(error && error.message ? error.message : error) });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "PAGEPILOT_DEBUG_EVENT") {
    const payload = message.payload || {};
    log("debug event", {
      event: payload.event || "unknown",
      url: payload.url || "",
      title: payload.title || "",
      pageType: payload.stats && payload.stats.pageType ? payload.stats.pageType : "",
      pageLabel: payload.stats && payload.stats.pageLabel ? payload.stats.pageLabel : "",
      quietMode: payload.stats ? payload.stats.quietMode : undefined,
      sections: payload.stats ? payload.stats.sections : undefined,
      important: payload.stats ? payload.stats.important : undefined,
      words: payload.stats ? payload.stats.words : undefined,
      confidence: payload.stats ? payload.stats.confidence : undefined,
      confidenceLabel: payload.stats ? payload.stats.confidenceLabel : undefined,
      bestLabel: payload.stats ? payload.stats.bestLabel : undefined,
      reason: payload.stats ? payload.stats.quietReason || payload.stats.bestReason || "" : "",
      diagnosticHint: payload.diagnostics && payload.diagnostics.pageProfileAfter ? payload.diagnostics.pageProfileAfter.diagnosticHint || "" : "",
      profileBefore: payload.diagnostics && payload.diagnostics.pageProfileBefore ? {
        type: payload.diagnostics.pageProfileBefore.type || "",
        label: payload.diagnostics.pageProfileBefore.label || "",
        quietMode: payload.diagnostics.pageProfileBefore.quietMode,
        reason: payload.diagnostics.pageProfileBefore.reason || ""
      } : null,
      profileAfter: payload.diagnostics && payload.diagnostics.pageProfileAfter ? {
        type: payload.diagnostics.pageProfileAfter.type || "",
        label: payload.diagnostics.pageProfileAfter.label || "",
        quietMode: payload.diagnostics.pageProfileAfter.quietMode,
        reason: payload.diagnostics.pageProfileAfter.reason || "",
        diagnosticHint: payload.diagnostics.pageProfileAfter.diagnosticHint || ""
      } : null,
      diagnostics: payload.diagnostics || null,
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
    });
    if (typeof sendResponse === "function") {
      sendResponse({ ok: true });
    }
    return true;
  }

  if (message.type === "PAGEPILOT_DEBUG_PING") {
    log("debug ping", message.payload || {});
    if (typeof sendResponse === "function") {
      sendResponse({ ok: true });
    }
    return true;
  }

  if (message.type === "PAGEPILOT_CAPTURE_VISIBLE_TAB") {
    try {
      const windowId = sender && sender.tab && Number.isFinite(sender.tab.windowId)
        ? sender.tab.windowId
        : undefined;
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Unable to capture visible tab.";
          log("capture visible tab failed", { error });
          if (typeof sendResponse === "function") {
            sendResponse({ ok: false, error });
          }
          return;
        }
        log("capture visible tab ok", { windowId });
        if (typeof sendResponse === "function") {
          sendResponse({ ok: true, dataUrl });
        }
      });
    } catch (error) {
      const messageText = String(error && error.message ? error.message : error);
      log("capture visible tab exception", { error: messageText });
      if (typeof sendResponse === "function") {
        sendResponse({ ok: false, error: messageText });
      }
    }
    return true;
  }

  if (message.type === "PAGEPILOT_FETCH_PDF_BYTES") {
    const url = String(message.url || "");
    const maxBytes = Math.min(
      Number.isFinite(message.maxBytes) && message.maxBytes > 0 ? message.maxBytes : PDF_MAX_BACKGROUND_BYTES,
      PDF_MAX_BACKGROUND_BYTES
    );
    fetchPdfBytes(url, maxBytes)
      .then((result) => {
        log("fetch pdf bytes ok", { url, bytes: result.byteLength });
        if (typeof sendResponse === "function") {
          sendResponse({ ok: true, data: result.data, byteLength: result.byteLength });
        }
      })
      .catch((error) => {
        const errorText = String(error && error.message ? error.message : error);
        log("fetch pdf bytes failed", { url, error: errorText });
        if (typeof sendResponse === "function") {
          sendResponse({ ok: false, error: errorText });
        }
      });
    return true;
  }

  if (message.type === "PAGEPILOT_FILE_ACCESS_STATUS") {
    try {
      if (chrome.extension && typeof chrome.extension.isAllowedFileSchemeAccess === "function") {
        chrome.extension.isAllowedFileSchemeAccess((allowed) => {
          if (typeof sendResponse === "function") {
            sendResponse({ ok: true, allowed: Boolean(allowed) });
          }
        });
        return true;
      }
      if (typeof sendResponse === "function") {
        sendResponse({ ok: true, allowed: null });
      }
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
      if (typeof sendResponse === "function") {
        sendResponse({ ok: false, error: "No active PDF tab was available." });
      }
      return true;
    }
    if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
      if (typeof sendResponse === "function") {
        sendResponse({ ok: false, error: "Unsupported PDF navigation URL." });
      }
      return true;
    }
    const sameUrl = sender && sender.tab && sender.tab.url === url;
    if (sameUrl) {
      log("navigate pdf page skipped same url", { tabId, url });
      if (typeof sendResponse === "function") {
        sendResponse({ ok: true, tabId, sameUrl: true });
      }
      return true;
    }
    chrome.tabs.update(tabId, { url }, (tab) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message || "Unable to navigate PDF page.";
        log("navigate pdf page failed", { url, error });
        if (typeof sendResponse === "function") {
          sendResponse({ ok: false, error });
        }
        return;
      }
      log("navigate pdf page ok", { tabId, url });
      if (typeof sendResponse === "function") {
        sendResponse({ ok: true, tabId: tab && tab.id });
      }
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
  }, PDF_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    });
    const buffer = await readPdfResponseBuffer(response, url, maxBytes);
    return {
      data: arrayBufferToBase64(buffer),
      byteLength: buffer.byteLength || 0
    };
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
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
