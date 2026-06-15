(function () {
  "use strict";

  const ROOT_ID = "pagepilot-root";
  const SKIMROUTE_CONTENT_VERSION = "1.2.8";
  const MUTATION_SCAN_DELAY_MS = 520;
  const FAST_MUTATION_SCAN_DELAY_MS = 220;
  const MIN_RESCAN_INTERVAL_MS = 1250;
  const FAST_RESCAN_INTERVAL_MS = 360;
  const URL_WATCH_INTERVAL_MS = 1200;
  const WARMUP_SCAN_DELAYS_MS = [700, 1800, 3600, 7200, 12000];
  const CHAT_WARMUP_SCAN_DELAYS_MS = [120, 320, 700, 1400, 2800, 5200, 8200];
  const CHAT_LOADING_MAX_ATTEMPTS = 4;
  const CHAT_LOADING_EXPLAIN_AFTER_MS = 4200;
  const PDF_MODE_OPENING_COPY = "Opening PDF Mode so SkimRoute can scroll and highlight sections reliably.";
  const PDF_OCR_UNREADABLE_MESSAGE = "OCR finished, but this scan could not be read clearly. Try another PDF or a higher-resolution scan.";
  const PDF_OCR_WORKER_START_MESSAGE = "OCR worker could not start in this browser context.";
  const PDF_OCR_DETECTION_MESSAGE = "Checking whether this PDF needs OCR...";
  const PDF_OCR_IMAGE_PROMPT_MESSAGE = "This PDF is image-based. Run OCR to extract its text locally.";
  const PDF_OCR_FAST_EXPECTATION_MESSAGE = "Fast OCR runs locally and may take up to a minute on some devices.";
  const PDF_OCR_BETTER_EXPECTATION_MESSAGE = "Better OCR runs locally and may take 1-2 minutes on scanned PDFs.";
  const PDF_OCR_RUNNING_MESSAGE = "Reading scanned text locally. This may take a minute.";
  const PDF_OCR_LONG_RUNNING_MESSAGE = "Still reading the scan locally. Complex scans can take longer on slower devices.";
  const PDF_OCR_APPROXIMATE_MESSAGE = "OCR finished. Highlights and section labels may be approximate because this is a scanned PDF.";
  const PDF_TEXT_EXTRACTION_TIMEOUT_MS = 12000;
  const PDF_TEXT_FAST_EXTRACTION_TIMEOUT_MS = 7000;
  const PDF_TEXT_PAGE_TIMEOUT_MS = 1200;
  const PDF_TEXT_FAST_PAGE_TIMEOUT_MS = 750;
  const PDF_FETCH_TIMEOUT_MS = 9000;
  const PDF_MAX_BYTES = 54 * 1024 * 1024;
  const PDF_MAX_BACKGROUND_BYTES = 14 * 1024 * 1024;
  const PDF_MAX_TEXT_PAGES = 96;
  const PDF_FAST_TEXT_PAGES = 40;
  const PDF_FAST_READY_WORDS = 180;
  const PDF_FAST_READY_PAGES = 4;
  const PDF_OCR_TIMEOUT_MS = 45000;
  const PDF_OCR_FAST_TIMEOUT_MS = 45000;
  const PDF_OCR_BETTER_TIMEOUT_MS = 120000;
  const PDF_OCR_PAGE_TIMEOUT_MS = 3600;
  const PDF_OCR_MAX_PAGES = 4;
  const PDF_OCR_RENDER_SCALE = 0.82;
  const PDF_RECOVERY_MIN_WORDS = 24;
  const PDF_OCR_SHORT_MEANINGFUL_WORDS = 6;
  const PDF_OCR_CACHE_MIN_WORDS = 10;
  const PDF_OCR_WEAK_TEXT_WORDS = 30;
  const JUMP_EFFECT_DURATION_MS = 4200;
  const JUMP_EFFECT_SCROLL_LOCK_MS = 1200;
  const SNOOZE_TTL_MS = 2 * 60 * 60 * 1000;
  const VIEW_MODES = new Set(["open", "minimized", "quiet", "snoozed"]);
  const STORAGE_KEYS = {
    onboardingSeen: "pagepilot.onboardingSeen",
    pagePrefix: "pagepilot.page."
  };
  const PDF_PENDING_JUMP_STORAGE_KEY = "pagepilot.pendingPdfJump";
  const PDF_SESSION_CACHE_STORAGE_KEY = "pagepilot.pdfRecoveryCache";
  const PDF_PERSISTENT_CACHE_STORAGE_KEY = "pagepilot.pdfRecoveryCache.persistent";
  const PDF_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const PDF_CACHE_MAX_ENTRIES = 8;
  const PDF_FETCH_RETRY_WINDOW_MS = 12000;
  const PDF_FETCH_RETRY_DELAY_MS = 950;
  const PDF_FETCH_MAX_RETRIES = 6;
  const PDF_ANALYSIS_HARD_TIMEOUT_MS = 90000;
  const PDF_OCR_TIMEOUT_MESSAGE = "OCR took too long on this device. Try Better OCR, a clearer scan, or a PDF with selectable text.";
  const PDF_AUTO_OCR_AFTER_MS = 1200;
  const PDF_CONTROLLED_VIEWER_CONSENT_STORAGE_KEY = "pagepilot.pdfModeConsent";
  const PDF_ACTION_TIMEOUT_MS = 8000;
  const PDF_ACTION_RENDER_TIMEOUT_MS = 5000;
  const PDF_ACTION_VERIFY_TIMEOUT_MS = 1500;
  const PDF_ACTION_DEBOUNCE_MS = 350;
  const GOOGLE_DOCS_ACTION_TIMEOUT_MS = 4500;
  const GOOGLE_DOCS_ACTION_OUTLINE_WAIT_MS = 2200;
  const GOOGLE_DOCS_ACTION_DEBOUNCE_MS = 350;
  const GOOGLE_DOCS_LIVE_FAST_DELAY_MS = 180;
  const GOOGLE_DOCS_LIVE_READY_DELAY_MS = 900;
  const GOOGLE_DOCS_LIVE_MIN_INTERVAL_MS = 650;
  const GOOGLE_DOCS_LIVE_READY_MIN_INTERVAL_MS = 1600;
  const GOOGLE_DOCS_APPROXIMATE_MESSAGE = "Google Docs location is approximate because the exact editor block is not mounted.";
  const GOOGLE_DOCS_CONTENT_SELECTOR = [
    ".kix-appview-editor",
    ".docs-editor-container",
    ".docs-pageless-content",
    ".kix-page-content",
    ".kix-page",
    "[aria-label*='Document content' i]",
    "[role='document']"
  ].join(",");
  const GOOGLE_DOCS_OUTLINE_SELECTOR = [
    "#docs-outline-pane [role='link']",
    "#docs-outline-pane [role='treeitem']",
    ".docs-outline-items .docs-outline-item",
    "[aria-label*='Document outline' i] [role='link']",
    "[aria-label*='Document outline' i] [role='treeitem']",
    "[guidedhelpid*='outline' i]"
  ].join(",");
  const GOOGLE_DOCS_CHROME_SELECTOR = [
    `#${ROOT_ID}`,
    "[role='toolbar']",
    "[role='menubar']",
    ".docs-toolbar",
    ".docs-titlebar",
    ".docs-title-input",
    ".docs-menubar",
    ".docs-comments",
    ".docs-comment",
    ".docs-sidebar",
    ".docs-sidebars",
    ".docs-share-button",
    ".docs-material-menu",
    ".kix-commentoverlayrenderer",
    ".pagepilot-google-docs-highlight",
    ".pagepilot-google-docs-notice"
  ].join(",");

  if (window.top !== window.self) {
    return;
  }

  try {
    const previousVersion = String(window.__SKIMROUTE_CONTENT_VERSION__ || "");
    if (window.__PAGEPILOT_LOADED__ && previousVersion && previousVersion !== SKIMROUTE_CONTENT_VERSION && typeof window.__PAGEPILOT_DESTROY__ === "function") {
      window.__PAGEPILOT_DESTROY__("version-mismatch");
    }
    if (window.__PAGEPILOT_LOADED__ && (!previousVersion || previousVersion !== SKIMROUTE_CONTENT_VERSION)) {
      cleanupStaleSkimRouteDom("boot-version-mismatch");
      window.__PAGEPILOT_LOADED__ = false;
    }
  } catch (error) {
    cleanupStaleSkimRouteDom("boot-cleanup-error");
    window.__PAGEPILOT_LOADED__ = false;
  }

  if (window.__PAGEPILOT_LOADED__ && window.__SKIMROUTE_CONTENT_VERSION__ === SKIMROUTE_CONTENT_VERSION) {
    return;
  }

  if (!window.PagePilotAdapters || !window.PagePilotEngine || !window.PagePilotUI) {
    return;
  }

  cleanupStaleSkimRouteDom("boot-current-version");
  window.__PAGEPILOT_LOADED__ = true;
  window.__SKIMROUTE_CONTENT_VERSION__ = SKIMROUTE_CONTENT_VERSION;

  const runtime = {
    engine: null,
    ui: null,
    model: null,
    view: {
      mode: "minimized",
      activeId: null,
      showOnboarding: false,
      collapsedSectionIds: new Set()
    },
    currentUrl: "",
    scanTimer: null,
    warmupTimers: [],
    urlWatchTimer: null,
    mutationObserver: null,
    lastScanAt: 0,
    scrollTicking: false,
    resizeTicking: false,
    routeQueued: false,
    chatReadinessTimer: null,
    chatReadinessStartedAt: 0,
    jumpEffectTimer: null,
    jumpEffectLockedUntil: 0,
    jumpEffectActive: false,
    highlightedElements: [],
    dimmedElements: [],
    pdfJumpMarker: null,
    pdfJumpMarkerTimer: null,
    pdfJumpMode: "",
    pdfAccessAllowed: null,
    lastPdfJumpTarget: null,
    pdfActivePage: 0,
    stablePdfModel: null,
    stablePdfRouteKey: "",
    recoveredPdfModelCache: {
      routeKey: "",
      signature: "",
      model: null
    },
    normalizedPdfModelCache: {
      routeKey: "",
      signature: "",
      model: null
    },
    pdfResourceCache: {
      routeKey: "",
      fingerprint: null,
      bytes: null,
      pdfDocument: null,
      pageCount: 0,
      sourceUrl: "",
      updatedAt: 0
    },
    stableChatModel: null,
    stableChatRouteKey: "",
    pdfOwnedFocusOverlay: null,
    pdfModeConsentCache: null,
    pdfModeConsentDialog: null,
    pdfModeNotice: null,
    pendingPdfControlledJump: null,
    pdfAction: {
      token: "",
      actionId: "",
      activeActionId: "",
      type: "",
      phase: "",
      targetPage: 0,
      targetSectionId: "",
      targetKey: "",
      startedAt: 0,
      updatedAt: 0,
      completedAt: 0,
      timeoutTimer: null,
      timing: null,
      cancelled: false,
      completed: false
    },
    googleDocsAction: {
      actionId: "",
      activeActionId: "",
      type: "",
      targetSectionId: "",
      targetKey: "",
      startedAt: 0,
      updatedAt: 0,
      completedAt: 0,
      timeoutTimer: null,
      cancelled: false,
      completed: false
    },
    googleDocsHighlightOverlay: null,
    googleDocsHighlightTimer: null,
    googleDocsNotice: null,
    googleDocsNoticeTimer: null,
    googleDocsLive: {
      routeKey: "",
      activeTab: "",
      lastSignature: "",
      lastUsableModel: null,
      lastUsableSignature: "",
      lastScanAt: 0,
      pendingTimer: null,
      scheduledCount: 0,
      skippedCount: 0,
      appliedCount: 0
    },
    debugStatsSuppressed: 0,
    pdfControlledViewer: {
      root: null,
      scroll: null,
      pages: new Map(),
      highlights: [],
      rendering: false,
      ready: false,
      routeKey: "",
      sourceUrl: "",
      doc: null,
      pageCount: 0,
      renderPromise: null,
      backgroundRenderToken: "",
      lastError: "",
      visible: false,
      closedByUser: false,
      pendingTarget: null,
      activeHighlightSectionId: "",
      activeLoadingTask: null,
      activeRenderTask: null
    },
    loadingAttempts: 0,
    pdfOcr: {
      pending: false,
      retrying: false,
      retryStartedAt: 0,
      retryCount: 0,
      retryTimer: null,
      activePromise: null,
      activeAttemptId: 0,
      activeOcrRunId: 0,
      finishedOcrRunIds: new Set(),
      finalized: false,
      timedOut: false,
      startedAt: 0,
      attemptedForRoute: "",
      completedForRoute: "",
      lastAttemptAt: 0,
      lastError: "",
      errorKind: "",
      supported: false,
      needsPrompt: false,
      state: "idle",
      progress: 0,
      source: "",
      words: 0,
      pages: 0,
      partial: false,
      qualityScore: 0,
      qualityState: "",
      qualityMessage: "",
      progressMessage: "",
      mode: "",
      slowDevice: false,
      lastDiagnostic: "",
      deepPending: false,
      deepForRoute: "",
      deepCompletedForRoute: "",
      analysisStartedAt: 0,
      watchdogTimer: null,
      autoOcrAttemptedForRoute: "",
      lastGoalSignature: "",
      lastRecoveredEntry: null,
      lastDiagnostics: [],
      lastRawOcrText: "",
      lastRawOcrPages: [],
      lastRawOcrStats: null,
      lastParserError: null,
      cacheHit: false,
      cacheSource: "",
      cacheUpdatedAt: 0,
      cachePersistPromise: null,
      cancelRequested: false,
      cancelAttemptId: 0,
      lastCancelledAt: 0,
      lastLongRunningNoticeAt: 0,
      recommendedMode: "",
      betterAvailableForRoute: "",
      activeWorker: null,
      activeWorkerRunId: 0,
      activeWorkerTerminated: false,
      activeWorkerOptions: null,
      activeWorkerContext: null,
      activeRenderTask: null,
      activePdfLoadingTask: null,
      activePdfDocument: null,
      finalDiagnostic: null,
      stableStatusSnapshot: null,
      currentStep: "",
      workerTerminated: false,
      lastOcrProgressLogAt: 0
    },
    lastAction: null,
    listeners: []
  };

  const DEBUG_PREFIX = "[SkimRoute]";

  function cleanupStaleSkimRouteDom(reason) {
    try {
      const selectors = [
        `#${ROOT_ID}`,
        "#pagepilot-pdf-controlled-viewer",
        ".pagepilot-pdf-mode-consent",
        ".pagepilot-pdf-mode-notice",
        ".pagepilot-pdf-focus-overlay",
        ".pagepilot-pdf-jump-marker",
        ".pagepilot-google-docs-highlight",
        ".pagepilot-google-docs-notice"
      ];
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          try {
            node.remove();
          } catch (error) {
            // Ignore stale DOM cleanup failures.
          }
        });
      });
      if (reason && typeof console !== "undefined" && console.info) {
        console.info(`${DEBUG_PREFIX} stale-ui-cleanup`, { reason, version: SKIMROUTE_CONTENT_VERSION });
      }
    } catch (error) {
      // Cleanup is best-effort.
    }
  }

  if (window.__PAGEPILOT_ENABLE_TEST_HOOKS__) {
    window.__PAGEPILOT_CONTENT_TESTS__ = {
      normalizeTesseractResult,
      isMeaningfulShortOcrText,
      isPdfRecoveryResultUsable,
      isPdfCacheEntryUsable,
      normalizePdfCacheEntry,
      normalizePdfCacheStore,
      isPdfCacheEntryExpired,
      shouldPreserveExistingPdfCacheEntry,
      getPdfTerminalPublicCopy,
      shouldShowPublicLoadingState,
      shouldAutoRunPdfOcr,
      isCacheableShortOcrText,
      isPdfRecoveryResultCacheable,
      getManualPdfOcrMode,
      getCanonicalPdfRouteKey,
      getPdfCacheRouteKeys,
      getPdfCacheEntrySignature,
      normalizePdfMapSnapshot,
      createPdfMapSnapshotFromModel,
      isUsableChatModel,
      isUsablePdfStatsModel,
      selectAuthoritativeModelSnapshot,
      normalizeRecoveredPdfModelForPublicStatus,
      finalizePdfPublicStatus,
      verifyPdfPublicStatusTopLevelFields,
      getPdfOcrPlan,
      shouldRunBetterPdfOcrAfterFast,
      normalizePdfOcrLineTextSpacing,
      sortPdfOcrLinesByReadingOrder,
      reconstructPdfOcrTextFromLines,
      evaluatePdfOcrTextQuality,
      isBetterPdfOcrVariant,
      getPdfOcrImmediateReturnDecision,
      evaluatePdfOcrCandidateUsability,
      getPdfOcrEarlyStopDecision,
      mapPdfOcrBBoxToFullPage,
      rotatePdfOcrBBoxForDisplay,
      normalizePdfOcrSourceLine,
      normalizePdfOcrSourceLines,
      mergePdfOcrLineBackedGeometry,
      buildRecoveredPdfOcrLineBackedChunk,
      buildRecoveredPdfOcrLetterChunks,
      classifyRecoveredPdfOcrRole,
      classifyRecoveredPdfOcrLineRole,
      getPdfOcrStructureCompleteness,
      scoreRecoveredPdfChunk,
      compareRecoveredPdfSections,
      isPdfOcrExactGeometryUsable,
      getVerifiedPdfOcrHighlightGeometry,
      isGoogleDocsSection,
      isGoogleDocsActionContext,
      getGoogleDocsSectionNavigationRef,
      buildGoogleDocsActionTargetKey,
      shouldIgnoreDuplicateGoogleDocsAction,
      resolveGoogleDocsExactTarget,
      resolveGoogleDocsOutlineEntry,
      resolveGoogleDocsApproximateTarget,
      isGoogleDocsChromeElement,
      isGoogleDocsDocumentContentElement,
      isGoogleDocsCandidateExact,
      isGoogleDocsLikePage,
      getGoogleDocsLiveSignature,
      isGoogleDocsLiveMutation,
      shouldScheduleGoogleDocsLiveScan,
      isUsableGoogleDocsModel,
      shouldPreserveGoogleDocsLiveModel
    };
  }

  onReady(init);

  function emitDebug(event, extra) {
    const model = runtime.model;
    const ocrDebugRunId = /^pdf:ocr:/i.test(String(event || "")) && !(extra && Object.prototype.hasOwnProperty.call(extra, "ocrRunId"))
      ? getActivePdfOcrRunId()
      : 0;
    const debugState = {
      event,
      url: getCurrentUrl(),
      title: document.title || "",
      time: new Date().toISOString(),
      ...(ocrDebugRunId ? { ocrRunId: ocrDebugRunId } : {}),
      ...extra,
      stats: runtime.debugStatsSuppressed ? null : getPublicStatsSafely(),
      diagnostics: model && model.diagnostics ? model.diagnostics : null
    };

    try {
      if (typeof console !== "undefined" && console.info) {
        console.info(`${DEBUG_PREFIX} ${event}`, debugState);
      }
    } catch (error) {
      // Logging should never break the page.
    }

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "PAGEPILOT_DEBUG_EVENT", payload: debugState }, () => {
          void (chrome.runtime && chrome.runtime.lastError);
        });
      }
    } catch (error) {
      // Ignore environments where messaging is unavailable.
    }
  }

  function emitDebugNoStats(event, extra) {
    runtime.debugStatsSuppressed = (runtime.debugStatsSuppressed || 0) + 1;
    try {
      emitDebug(event, extra);
    } finally {
      runtime.debugStatsSuppressed = Math.max(0, (runtime.debugStatsSuppressed || 1) - 1);
    }
  }

  function emitDebugWithStats(event, extra, stats) {
    const model = runtime.model;
    const debugState = {
      event,
      url: getCurrentUrl(),
      title: document.title || "",
      time: new Date().toISOString(),
      ...extra,
      stats,
      diagnostics: model && model.diagnostics ? model.diagnostics : null
    };

    try {
      if (typeof console !== "undefined" && console.info) {
        console.info(`${DEBUG_PREFIX} ${event}`, debugState);
      }
    } catch (error) {
      // Logging should never break the page.
    }

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "PAGEPILOT_DEBUG_EVENT", payload: debugState }, () => {
          void (chrome.runtime && chrome.runtime.lastError);
        });
      }
    } catch (error) {
      // Ignore environments where messaging is unavailable.
    }
  }

  function getPublicStatsSafely() {
    try {
      return getPublicStats();
    } catch (error) {
      return { ok: false, error: String(error && error.message ? error.message : error) };
    }
  }

  function getPdfActionResponseStats() {
    try {
      const stableOcrStatus = getStablePdfOcrStatusSnapshot(getPdfDocumentRouteKey());
      const action = runtime.lastAction && Date.now() - Number(runtime.lastAction.at || 0) < 12000
        ? runtime.lastAction
        : null;
      if (stableOcrStatus) {
        return {
          ...stableOcrStatus,
          lastActionOk: action ? Boolean(action.ok) : stableOcrStatus.lastActionOk ?? null,
          lastActionType: action ? action.type || "" : stableOcrStatus.lastActionType || "",
          lastActionMessage: action ? action.message || "" : stableOcrStatus.lastActionMessage || "",
          lastActionPhase: action ? action.phase || "" : stableOcrStatus.lastActionPhase || "",
          lastActionTargetPage: action ? action.pageNumber || 0 : stableOcrStatus.lastActionTargetPage || 0,
          lastActionAt: action ? action.at || 0 : stableOcrStatus.lastActionAt || 0
        };
      }
      const routeKey = getPdfDocumentRouteKey();
      const model = runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf"
        ? runtime.model
        : runtime.stablePdfModel && runtime.stablePdfRouteKey === routeKey
          ? runtime.stablePdfModel
          : runtime.recoveredPdfModelCache && runtime.recoveredPdfModelCache.routeKey === routeKey
            ? runtime.recoveredPdfModelCache.model
            : null;
      const sections = Array.isArray(model && model.sections) ? model.sections : [];
      const importantSections = Array.isArray(model && model.importantSections) ? model.importantSections : [];
      const bestSection = sections.find((section) => section && section.id === model.bestSectionId)
        || sections.find((section) => section && section.isBest)
        || importantSections[0]
        || sections[0]
        || null;
      const nextImportant = sections.find((section) => section && section.id === model.nextImportantId)
        || importantSections.find((section) => section && bestSection && section.id !== bestSection.id)
        || sections.find((section) => section && bestSection && section.id !== bestSection.id)
        || null;
      const words = Number(model && (model.totalReadableWords || model.totalWords)) || sections.reduce((sum, section) => sum + (Number(section && section.wordCount) || countPdfWords(section && section.text || "")), 0);
      const pdfReady = Boolean(model && isUsablePdfStatsModel(model, true));
      const pdfOcrActive = Boolean(isPdfOcrActive());
      return {
        ok: true,
        open: runtime.view.mode === "open",
        mode: runtime.view.mode,
        hiddenOnPage: runtime.view.mode === "snoozed",
        snoozed: runtime.view.mode === "snoozed",
        pageType: "pdf",
        pageLabel: "PDF",
        sections: sections.length,
        important: importantSections.length,
        words,
        quietMode: false,
        loading: false,
        recoveryPending: Boolean(runtime.pdfOcr && (runtime.pdfOcr.pending || runtime.pdfOcr.retrying)),
        pdfReady,
        pdfState: pdfReady ? "ready" : runtime.pdfOcr && runtime.pdfOcr.state || "",
        pdfPending: Boolean(runtime.pdfOcr && runtime.pdfOcr.pending),
        pdfRetrying: Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying),
        pdfProgress: runtime.pdfOcr && Number.isFinite(runtime.pdfOcr.progress) ? runtime.pdfOcr.progress : 0,
        pdfOcrActive,
        pdfOcrWorkerActive: Boolean(pdfOcrActive && isPdfOcrWorkerActiveForRun(getActivePdfOcrRunId())),
        pdfOcrCanCancel: Boolean(pdfOcrActive && shouldExposePdfOcrCancel()),
        pdfOcrCanRunFast: false,
        pdfOcrCanRunBetter: false,
        pdfJumpReady: Boolean(bestSection && canJumpToSection(bestSection)),
        canJump: Boolean(bestSection && canJumpToSection(bestSection)),
        canJumpNext: Boolean(nextImportant && canJumpToSection(nextImportant)),
        bestTitle: bestSection && bestSection.title || "",
        bestLabel: model && model.bestLabel || (bestSection ? bestSection.title : ""),
        bestReason: bestSection ? reasonForPublicSection(bestSection) : "",
        whyReason: bestSection ? reasonForPublicSection(bestSection) : "",
        nextImportantTitle: nextImportant && nextImportant.title || "",
        pdfActivePage: runtime.pdfActivePage || getCurrentPdfPageFromUrl() || 0,
        pdfActiveSectionId: runtime.view.activeId || "",
        lastActionOk: action ? Boolean(action.ok) : null,
        lastActionType: action ? action.type || "" : "",
        lastActionMessage: action ? action.message || "" : "",
        lastActionPhase: action ? action.phase || "" : "",
        lastActionTargetPage: action ? action.pageNumber || 0 : 0,
        lastActionAt: action ? action.at || 0 : 0,
        pdfJumpBlockedReason: action ? action.pdfJumpBlockedReason || "" : "",
        snapshotSource: "pdf-action-memory",
        usableSnapshot: pdfReady
      };
    } catch (error) {
      return { ok: false, error: String(error && error.message ? error.message : error) };
    }
  }

  function publishStatusUpdate(source) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;
      const stats = isPdfActionContext() && /^action-result|pdf-action/i.test(String(source || ""))
        ? getPdfActionResponseStats()
        : getPublicStatsSafely();
      if (!stats || !stats.ok) return;
      chrome.runtime.sendMessage({
        type: "PAGEPILOT_STATUS_PUSH",
        source: source || "stable-model",
        url: getCurrentUrl(),
        routeKey: runtime.model && runtime.model.routeKey || getCurrentUrl(),
        payload: stats
      }, () => {
        void (chrome.runtime && chrome.runtime.lastError);
      });
    } catch (error) {
      // Status pushes are best-effort and must never break scanning.
    }
  }

  function getImmediateStableStats(reason) {
    try {
      const stats = getPublicStats();
      if (!stats || !stats.ok) return null;
      const ready = Boolean(
        stats.usableSnapshot
        || stats.pdfReady
        || stats.chatReady
        || stats.pdfTerminal
        || (stats.pageType === "pdf" && stats.sections >= 1 && stats.words >= PDF_RECOVERY_MIN_WORDS)
        || (stats.pageType === "chat" && (stats.sections >= 1 || stats.words >= 35))
      );
      if (!ready) return null;
      emitDebug("status:stable-returned", {
        reason: reason || "status",
        snapshotSource: stats.snapshotSource || "runtime",
        sections: stats.sections,
        words: stats.words,
        pageType: stats.pageType,
        exactIssue: "Popup/sidebar synchronization: returning the latest stable model instead of a stale loading/checking state."
      });
      return stats;
    } catch (error) {
      return null;
    }
  }


  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  async function init() {
    if (!document.body || document.getElementById(ROOT_ID)) {
      return;
    }

    runtime.currentUrl = getCurrentUrl();
    runtime.engine = window.PagePilotEngine.createEngine({ window, document });
    emitDebug("init", {
      engineReady: Boolean(runtime.engine),
      currentUrl: runtime.currentUrl
    });
    runtime.view.showOnboarding = !(await storageGet(STORAGE_KEYS.onboardingSeen));
    runtime.ui = window.PagePilotUI.createUI({
      helpers: runtime.engine.helpers,
      callbacks: {
        onOpen: () => isPdfActionContext()
          ? runPdfAction("toggle", { open: true, focus: true, source: "sidebar" })
          : setMode("open", { focus: true, persist: true }),
        onMinimize: () => setMode(modeForClosedState(), { focusTab: true, persist: true }),
        onSnooze: () => setMode("snoozed", { focusTab: true, persist: true }),
        onJump: () => {
          if (isPdfActionContext()) {
            return runPdfAction("jump", { focus: true, source: "sidebar" });
          }
          adoptAuthoritativePdfModel("sidebar-jump");
          const section = getSectionForAction("jump");
          const ok = jumpToUsefulPart();
          setActionResult("jump", ok, { section });
          return ok;
        },
        onNext: () => {
          if (isPdfActionContext()) {
            return runPdfAction("next", { focus: true, source: "sidebar" });
          }
          adoptAuthoritativePdfModel("sidebar-next");
          const section = getSectionForAction("next");
          const ok = jumpToNextImportant();
          setActionResult("next", ok, { section });
          return ok;
        },
        onRunPdfOcr: (mode) => {
          emitPdfActionCommandReceived("run-pdf-ocr", { source: "sidebar", mode: getManualPdfOcrMode(mode || "fast") }, { command: "manual-ocr" });
          return runManualPdfOcr(mode);
        },
        onCancelPdfOcr: () => {
          emitPdfActionCommandReceived("cancel-ocr", { source: "sidebar" }, { command: "cancel-ocr" });
          return cancelPdfOcr("sidebar");
        },
        onSection: (id, options) => {
          if (isPdfActionContext()) {
            return runPdfAction("section", { ...(options || {}), sectionId: id, focus: true, source: "sidebar-section" });
          }
          adoptAuthoritativePdfModel("sidebar-section");
          const section = runtime.model && runtime.model.sections.find((item) => item.id === id) || null;
          const ok = scrollToSection(id, { ...(options || {}), actionType: "section", source: "sidebar-section" });
          setActionResult("section", ok, { section });
          return ok;
        },
        onToggleCollapse: (id) => toggleSectionCollapse(id),
        onDismissTip: () => dismissOnboarding()
      }
    });
    runtime.ui.mount();
    if (isPdfRouteLocked() || isPdfLikePage()) {
      emitPdfCachePreflight("init-before-hydrate", getPdfDocumentRouteKey());
      await hydratePdfCache(getPdfDocumentRouteKey(), { source: "init" });
      requestPdfFileAccessStatus();
    }
    scanPage("initial");
    await restorePageMode();
    try {
      const root = document.getElementById(ROOT_ID);
      if (root) root.dataset.skimrouteVersion = SKIMROUTE_CONTENT_VERSION;
    } catch (error) {
      // Ignore version marker failures.
    }
    render();
    attachGlobalEvents();
    window.__PAGEPILOT_DESTROY__ = destroy;
    watchPageChanges();
    watchRouteChanges();
    refreshActiveSection();
    scheduleWarmupScans("initial");
    restorePendingPdfJumpMarker();
  }

  function scanPage(reason) {
    if (!runtime.engine) return;
    if (shouldSuppressPdfScan(reason)) {
      emitDebug("pdf:scan:suppressed", {
        reason,
        routeKey: getPdfDocumentRouteKey(),
        sections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
        words: runtime.model && runtime.model.totalReadableWords || 0,
        cacheHit: Boolean(runtime.pdfOcr && runtime.pdfOcr.cacheHit),
        exactIssue: "A usable PDF map is already ready for this route, so SkimRoute skipped a passive warmup/mutation/status rescan."
      });
      return;
    }
    const previousSignature = runtime.model ? runtime.model.structureSignature : "";
    const previousQuiet = runtime.model ? runtime.model.pageProfile.quietMode : null;

    try {
      runtime.model = runtime.engine.scan({
        collapsedSectionIds: runtime.view.collapsedSectionIds,
        reason
      });
      runtime.model = enforcePdfRouteModel(runtime.model, reason);
      const recoveredPdfModel = buildRecoveredPdfModelFromCache(getRouteCacheKey(), reason, runtime.model);
      if (recoveredPdfModel) {
        runtime.model = recoveredPdfModel;
        rememberStablePdfModel(recoveredPdfModel, `scan:${reason}:recovered`);
      } else if (shouldPreserveStablePdfModel(runtime.model, reason)) {
        runtime.model = reuseStablePdfModel(reason, runtime.model);
      }
      if (rememberStableChatModel(runtime.model, `scan:${reason}`)) {
        // Saved for popup/status races on dynamic chat surfaces.
      } else if (shouldPreserveStableChatModel(runtime.model, reason)) {
        runtime.model = reuseStableChatModel(reason, runtime.model);
      }
    } catch (error) {
      if (isPdfOcrCancellationError(error) || isPdfOcrTimeoutError(error)) {
        throw error;
      }
      const message = String(error && error.message ? error.message : error);
      runtime.model = buildFallbackModel(reason, message);
      runtime.model = enforcePdfRouteModel(runtime.model, reason);
      const recoveredPdfModelAfterError = buildRecoveredPdfModelFromCache(getRouteCacheKey(), reason, runtime.model);
      if (recoveredPdfModelAfterError) {
        runtime.model = recoveredPdfModelAfterError;
        rememberStablePdfModel(recoveredPdfModelAfterError, `scan:${reason}:error-recovered`);
      } else if (shouldPreserveStablePdfModel(runtime.model, reason)) {
        runtime.model = reuseStablePdfModel(reason, runtime.model);
      }
      if (shouldPreserveStableChatModel(runtime.model, reason)) {
        runtime.model = reuseStableChatModel(reason, runtime.model);
      }
      emitDebug(`scan:error:${reason}`, {
        reason,
        error: message,
        fallbackApplied: true
      });
    }

    runtime.model = reconcileGoogleDocsLiveModel(runtime.model, reason);

    if (shouldHoldLoadingState(reason, runtime.model)) {
      runtime.loadingAttempts = (runtime.loadingAttempts || 0) + 1;
      const maxLoadingAttempts = runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf"
        ? 8
        : runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "chat"
          ? CHAT_LOADING_MAX_ATTEMPTS
          : 4;
      if (runtime.loadingAttempts <= maxLoadingAttempts) {
        runtime.model = buildLoadingModel(reason, runtime.model);
        emitDebug(`scan:${reason}:loading`, {
          reason,
          loading: true,
          loadingReason: runtime.model.pageProfile.diagnosticHint || runtime.model.pageProfile.reason || ""
        });
      } else {
        runtime.loadingAttempts = 0;
      }
    } else {
      runtime.loadingAttempts = 0;
    }

    if (
      isPdfRouteLocked()
      && runtime.pdfOcr
      && runtime.pdfOcr.finalDiagnostic
      && runtime.pdfOcr.finalDiagnostic.bestRawTextLength > 0
      && isPdfOcrStatusOverwrittenByScan(runtime.model)
    ) {
      const overwrittenDiagnostic = runtime.pdfOcr.finalDiagnostic;
      const restored = getUsablePdfSnapshotForRoute(getPdfDocumentRouteKey(), `status-overwritten:${reason}`, runtime.model);
      if (restored && restored.model) {
        runtime.model = restored.model;
        rememberStablePdfModel(runtime.model, `status-overwritten:${reason}:${restored.source}`);
      }
      emitDebug("pdf:ocr:status-overwritten", {
        ocrRunId: overwrittenDiagnostic.ocrRunId || getActivePdfOcrRunId(),
        finalStatus: overwrittenDiagnostic.finalStatus || "",
        restored: Boolean(restored && restored.model),
        exactIssue: "A later scan tried to show PDF loading after OCR had already finished; SkimRoute restored the recovered map without emitting a second final diagnostic."
      });
    }

    clearStalePdfErrorIfReady(runtime.model);
    scheduleChatReadinessPolling(reason, runtime.model);

    if (isPdfRouteLocked() && runtime.model && (runtime.model.totalReadableWords || 0) < 80) {
      if (hydratePdfSessionCache(getRouteCacheKey()) && reason !== "pdf-cache") {
        scanPage("pdf-cache");
        return;
      }
      schedulePdfRecoveryAttempt(reason, runtime.pdfOcr && runtime.pdfOcr.errorKind === "fetch" ? { force: true } : {});
    }

    if (isPdfRouteLocked() || (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf")) {
      emitPdfGoalCheck(`scan:${reason}`);
    }

    runtime.lastScanAt = Date.now();

    runtime.view.mode = resolveMode(runtime.view.mode);

    emitDebug(`scan:${reason}`, {
      reason,
      changed: !(previousSignature && previousSignature === runtime.model.structureSignature && previousQuiet === runtime.model.pageProfile.quietMode)
    });
    emitGoogleDocsExtractionDiagnostics(reason, runtime.model);

    if (
      previousSignature
      && previousSignature === runtime.model.structureSignature
      && previousQuiet === runtime.model.pageProfile.quietMode
    ) {
      refreshActiveSection();
      return;
    }

    render();
  }

  function reconcileGoogleDocsLiveModel(model, reason = "scan") {
    if (!isGoogleDocsModel(model) && !isGoogleDocsLikePage()) return model;
    const signature = getGoogleDocsLiveSignature(document);
    const routeKey = getRouteCacheKey();
    const live = runtime.googleDocsLive;
    live.routeKey = routeKey;
    live.activeTab = getGoogleDocsActiveTabFromUrl();
    if (signature.value) {
      live.lastSignature = signature.value;
    }
    if (isUsableGoogleDocsModel(model)) {
      live.lastUsableModel = model;
      live.lastUsableSignature = signature.value || model.structureSignature || "";
      live.lastScanAt = Date.now();
      live.appliedCount += 1;
      emitDebug("google-docs:live-update:applied", {
        reason,
        routeKey,
        sections: model.sections ? model.sections.length : 0,
        words: model.totalReadableWords || 0,
        signature: signature.value || "",
        exactIssue: "A usable Google Docs model was saved as the stable live map for this route."
      });
      return model;
    }
    if (shouldPreserveGoogleDocsLiveModel(model, live.lastUsableModel, routeKey)) {
      emitDebug("google-docs:live-update:skipped", {
        reason,
        routeKey,
        sections: model && model.sections ? model.sections.length : 0,
        words: model && model.totalReadableWords || 0,
        preservedSections: live.lastUsableModel && live.lastUsableModel.sections ? live.lastUsableModel.sections.length : 0,
        preservedWords: live.lastUsableModel && live.lastUsableModel.totalReadableWords || 0,
        signature: signature.value || "",
        exactIssue: "Google Docs temporarily exposed too little mounted text, so SkimRoute preserved the last usable map instead of falling back to quiet."
      });
      return live.lastUsableModel;
    }
    return model;
  }

  function emitGoogleDocsExtractionDiagnostics(reason, model) {
    if (!isGoogleDocsModel(model) && !isGoogleDocsLikePage()) return;
    const diagnostics = model && model.diagnostics || {};
    const signature = getGoogleDocsLiveSignature(document);
    emitDebug("google-docs:extraction:roots", {
      reason,
      routeKey: getRouteCacheKey(),
      roots: signature.rootCount,
      outlineCount: signature.outlineCount,
      activeTab: getGoogleDocsActiveTabFromUrl(),
      mode: diagnostics.googleDocsMode || model && model.pageProfile && model.pageProfile.googleDocsMode || "",
      exactIssue: "Google Docs extraction inspected mounted document/editor roots only."
    });
    emitDebug("google-docs:extraction:lines", {
      reason,
      routeKey: getRouteCacheKey(),
      lineCount: signature.lineCount,
      textSampleWords: signature.sampleWords,
      renderedLineUnits: diagnostics.googleDocsRenderedLineUnits || 0,
      renderedLineCount: diagnostics.googleDocsRenderedLineCount || 0,
      visibleBlockUnits: diagnostics.googleDocsVisibleBlockUnits || 0,
      sourceMix: diagnostics.googleDocsSourceMix || "",
      exactIssue: "Google Docs extraction counted mounted document lines and readable text samples."
    });
    emitDebug("google-docs:extraction:usable-map", {
      reason,
      routeKey: getRouteCacheKey(),
      usable: isUsableGoogleDocsModel(model),
      sections: model && model.sections ? model.sections.length : 0,
      important: model && model.importantSections ? model.importantSections.length : 0,
      words: model && model.totalReadableWords || 0,
      quietMode: model && model.pageProfile ? model.pageProfile.quietMode : null,
      failureReason: diagnostics.googleDocsExtractionFailureReason || "",
      exactIssue: isUsableGoogleDocsModel(model)
        ? "Google Docs has a usable mapped model."
        : "Google Docs matched, but mounted readable document text was still insufficient for a useful map."
    });
  }

  function isGoogleDocsModel(model) {
    const profile = model && model.pageProfile || {};
    const diagnostics = model && model.diagnostics || {};
    return Boolean(
      profile.adapterName === "google-docs"
      || diagnostics.adapterName === "google-docs"
      || diagnostics.pageProfileBefore && diagnostics.pageProfileBefore.adapterName === "google-docs"
      || diagnostics.pageProfileAfter && diagnostics.pageProfileAfter.adapterName === "google-docs"
    );
  }

  function isUsableGoogleDocsModel(model) {
    if (!isGoogleDocsModel(model) || !Array.isArray(model.sections)) return false;
    const sections = model.sections.filter((section) => section && isGoogleDocsSection(section));
    const words = sections.reduce((sum, section) => sum + (Number(section.wordCount) || 0), 0);
    const important = Array.isArray(model.importantSections) ? model.importantSections.length : 0;
    return Boolean(sections.length >= 1 && words >= 40 && (!model.pageProfile || model.pageProfile.quietMode === false || important >= 1));
  }

  function shouldPreserveGoogleDocsLiveModel(nextModel, lastUsableModel, routeKey = getRouteCacheKey()) {
    if (!lastUsableModel || !isUsableGoogleDocsModel(lastUsableModel)) return false;
    if (!isGoogleDocsModel(nextModel) && !isGoogleDocsLikePage()) return false;
    const liveRoute = runtime.googleDocsLive && runtime.googleDocsLive.routeKey || routeKey;
    if (liveRoute && routeKey && liveRoute !== routeKey) return false;
    if (isUsableGoogleDocsModel(nextModel)) return false;
    const nextWords = Number(nextModel && nextModel.totalReadableWords || 0);
    const nextSections = nextModel && Array.isArray(nextModel.sections) ? nextModel.sections.length : 0;
    return nextSections === 0 || nextWords < Math.max(60, Number(lastUsableModel.totalReadableWords || 0) * 0.45);
  }

  function shouldSuppressPdfScan(reason) {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return false;
    const raw = String(reason || "");
    if (/^(initial|route|popup|manual|manual-ocr-preflight|pdf-text|pdf-ocr|pdf-full-text)$/i.test(raw)) return false;
    if (/ocr|full-text|cache$/i.test(raw) && !/warmup|mutation|status|open-recheck/i.test(raw)) return false;
    if (!/warmup|mutation|status|open-recheck|chat-ready|pdf-cache/i.test(raw)) return false;
    const routeKey = getPdfDocumentRouteKey();
    const currentReady = runtime.model && runtime.model.routeKey === routeKey && isUsablePdfStatsModel(runtime.model, true);
    const stableReady = runtime.stablePdfModel && runtime.stablePdfRouteKey === routeKey && isUsablePdfStatsModel(runtime.stablePdfModel, true);
    return Boolean(currentReady || stableReady);
  }


  function rememberStablePdfModel(model, source) {
    if (!model || !model.pageProfile || model.pageProfile.type !== "pdf") return false;
    const shortOcrReady = Array.isArray(model.sections) && model.sections.some((section) => section && section.unitMeta && section.unitMeta.ocr && isCacheableShortOcrText(section.text || ""));
    if (((model.totalReadableWords || 0) < PDF_RECOVERY_MIN_WORDS && !shortOcrReady) || !Array.isArray(model.sections) || !model.sections.length) return false;
    runtime.stablePdfModel = model;
    runtime.stablePdfRouteKey = getPdfDocumentRouteKey();
    rememberNormalizedPdfModel(model, runtime.stablePdfRouteKey);
    emitDebug("pdf:model:stable-saved", {
      source: source || "unknown",
      routeKey: runtime.stablePdfRouteKey,
      sections: model.sections.length,
      words: model.totalReadableWords || 0,
      exactIssue: "none"
    });
    return true;
  }

  function isOcrBackedPdfModel(model) {
    if (!model || !model.pageProfile || model.pageProfile.type !== "pdf" || !Array.isArray(model.sections)) return false;
    if (model.sections.some((section) => section && section.unitMeta && section.unitMeta.ocr)) return true;
    const diagnostics = model.diagnostics || {};
    return String(diagnostics.recoveredPdfSource || diagnostics.source || "").toLowerCase() === "ocr";
  }

  function getReadyPdfOcrModelCandidate(details = {}) {
    const routeKey = details.routeKey || getPdfDocumentRouteKey();
    const candidates = [
      details.model || null,
      details.parserModel || null,
      runtime.model || null,
      runtime.stablePdfModel && runtime.stablePdfRouteKey === routeKey ? runtime.stablePdfModel : null
    ];
    const direct = candidates.find((model) => isUsablePdfStatsModel(model, true) && isOcrBackedPdfModel(model));
    if (direct) return direct;
    const rebuilt = buildRecoveredPdfModelFromCache(routeKey, details.reason || "ocr-ready-state", runtime.model, { remember: false });
    return isUsablePdfStatsModel(rebuilt, true) && isOcrBackedPdfModel(rebuilt) ? rebuilt : null;
  }

  function saveReadyPdfOcrState(reason = "ocr-ready", details = {}) {
    if (!runtime || !runtime.pdfOcr) return false;
    const routeKey = details.routeKey || getPdfDocumentRouteKey();
    const model = getReadyPdfOcrModelCandidate({ ...details, routeKey, reason });
    if (!isUsablePdfStatsModel(model, true)) return false;
    const normalizedModel = normalizeRecoveredPdfModelForPublicStatus(
      model,
      routeKey,
      details.entry || details.cacheEntry || runtime.pdfOcr.lastRecoveredEntry || null,
      runtime.model,
      `ocr-ready:${reason}`
    );
    const entry = normalizePdfCacheEntry(details.entry || details.cacheEntry || runtime.pdfOcr.lastRecoveredEntry || null);
    runtime.model = normalizedModel;
    runtime.pdfOcr.completedForRoute = routeKey;
    runtime.pdfOcr.pending = false;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.progress = 100;
    runtime.pdfOcr.state = "ready";
    runtime.pdfOcr.source = "ocr";
    runtime.pdfOcr.words = Number(normalizedModel.totalReadableWords || normalizedModel.totalWords || runtime.pdfOcr.words || 0);
    runtime.pdfOcr.pages = Number(runtime.pdfOcr.pages || entry && (entry.pagesRead || entry.pages && entry.pages.length) || normalizedModel.diagnostics && normalizedModel.diagnostics.recoveredPages || 0);
    runtime.pdfOcr.partial = Boolean(entry && entry.partial || runtime.pdfOcr.partial);
    runtime.pdfOcr.qualityState = String(entry && entry.ocrQuality || normalizedModel.pageProfile && normalizedModel.pageProfile.ocrQuality || runtime.pdfOcr.qualityState || "");
    runtime.pdfOcr.qualityScore = Number(entry && entry.qualityScore || normalizedModel.pageProfile && normalizedModel.pageProfile.qualityScore || runtime.pdfOcr.qualityScore || 0);
    runtime.pdfOcr.qualityMessage = String(entry && entry.qualityMessage || normalizedModel.pageProfile && normalizedModel.pageProfile.qualityMessage || runtime.pdfOcr.qualityMessage || "");
    runtime.pdfOcr.cacheHit = Boolean(entry && entry.cacheHit || runtime.pdfOcr.cacheHit);
    runtime.pdfOcr.cacheSource = String(entry && entry.cacheSource || runtime.pdfOcr.cacheSource || "ocr-ready");
    runtime.pdfOcr.cacheUpdatedAt = Number(entry && entry.updatedAt || runtime.pdfOcr.cacheUpdatedAt || Date.now());
    if (entry) runtime.pdfOcr.lastRecoveredEntry = entry;
    stopPdfAnalysisWatchdog();
    if (entry && !entry.mapSnapshot) {
      savePdfMapSnapshotForEntry(routeKey, entry, normalizedModel);
    }
    rememberStablePdfModel(normalizedModel, `ocr-ready:${reason}`);
    const stableStatusSnapshot = rememberStablePdfOcrStatusSnapshot(normalizedModel, routeKey, reason, {
      ...details,
      entry
    });
    emitDebug("pdf:ocr:ready-state-saved", {
      reason,
      routeKey,
      finalStatus: details.finalStatus || "",
      sections: normalizedModel.sections.length,
      words: normalizedModel.totalReadableWords || 0,
      source: runtime.pdfOcr.source || "",
      stableStatusSnapshot: Boolean(stableStatusSnapshot),
      exactIssue: "none"
    });
    render();
    emitDebug("pdf:ocr:sidebar-state-synced", {
      reason,
      routeKey,
      sections: normalizedModel.sections.length,
      words: normalizedModel.totalReadableWords || 0,
      bestSectionId: normalizedModel.bestSectionId || "",
      exactIssue: "none"
    });
    publishStatusUpdate("pdf:ocr:ready");
    emitDebug("pdf:ocr:popup-state-synced", {
      reason,
      routeKey,
      sections: normalizedModel.sections.length,
      words: normalizedModel.totalReadableWords || 0,
      exactIssue: "A ready OCR PDF status was pushed so popup startup/polling can use the same recovered map as the sidebar."
    });
    return true;
  }

  function rememberStablePdfOcrStatusSnapshot(model, routeKey, reason = "ocr-ready", details = {}) {
    if (!runtime || !runtime.pdfOcr || !isOcrBackedPdfModel(model) || !isUsablePdfStatsModel(model, true)) return null;
    const snapshot = buildStablePdfOcrStatusSnapshot(model, routeKey || getPdfDocumentRouteKey(), {
      ...details,
      reason
    });
    if (!snapshot || !snapshot.pdfReady) return null;
    runtime.pdfOcr.stableStatusSnapshot = snapshot;
    return snapshot;
  }

  function getStablePdfOcrStatusSnapshot(routeKey = getPdfDocumentRouteKey()) {
    const snapshot = runtime.pdfOcr && runtime.pdfOcr.stableStatusSnapshot;
    if (!snapshot || snapshot.pdfState !== "ready") return null;
    const snapshotRoute = getCanonicalPdfRouteKey(snapshot.routeKey || "");
    const currentRoute = getCanonicalPdfRouteKey(routeKey || getPdfDocumentRouteKey());
    if (snapshotRoute && currentRoute && snapshotRoute !== currentRoute) return null;
    return {
      ...snapshot,
      open: runtime.view.mode === "open",
      mode: runtime.view.mode,
      hiddenOnPage: runtime.view.mode === "snoozed",
      snoozed: runtime.view.mode === "snoozed",
      pdfActivePage: runtime.pdfActivePage || snapshot.pdfActivePage || getCurrentPdfPageFromUrl() || 0,
      pdfActiveSectionId: runtime.view.activeId || snapshot.pdfActiveSectionId || "",
      pdfOcrFinalDiagnostic: runtime.pdfOcr.finalDiagnostic || snapshot.pdfOcrFinalDiagnostic || null,
      finalDiagnostic: runtime.pdfOcr.finalDiagnostic || snapshot.finalDiagnostic || null,
      pdfOcrCanCancel: false,
      pdfPending: false,
      pdfRetrying: false,
      loading: false,
      pdfState: "ready",
      pdfProgress: 100
    };
  }

  function normalizeSectionIntelligenceForPublic(section, pageType = "pdf") {
    if (!section) return null;
    const existing = section.intelligence && typeof section.intelligence === "object" ? section.intelligence : {};
    const role = String(existing.role || getPublicSectionRole(section)).slice(0, 100);
    const roleLabel = String(existing.roleLabel || getPublicSectionRoleLabel(section, role)).slice(0, 140);
    const whyReasons = uniquePublicStrings(Array.isArray(existing.whyReasons) ? existing.whyReasons : [])
      .concat(uniquePublicStrings(getPublicSectionWhyReasons(section, role)))
      .slice(0, 5);
    const scoreDetails = normalizePublicScoreDetails(existing.scoreDetails, section, role);
    return {
      role,
      roleLabel,
      pageType: String(existing.pageType || pageType || "pdf").slice(0, 80),
      roleConfidence: Number.isFinite(Number(existing.roleConfidence))
        ? Math.max(0, Math.min(100, Math.round(Number(existing.roleConfidence))))
        : getPublicSectionRoleConfidence(section),
      whyReasons: whyReasons.length ? whyReasons : ["Looks like a useful section"],
      scoreDetails,
      sourceType: String(existing.sourceType || getPublicSectionSourceType(section)).slice(0, 80)
    };
  }

  function normalizePublicScoreDetails(scoreDetails, section, role) {
    const source = scoreDetails && typeof scoreDetails === "object" ? scoreDetails : {};
    let signals = Array.isArray(source.signals)
      ? source.signals.map((signal) => ({
        signal: String(signal && signal.signal || "").slice(0, 120),
        weight: Number.isFinite(Number(signal && signal.weight)) ? Number(signal.weight) : 0,
        explanation: String(signal && signal.explanation || "").slice(0, 240)
      })).filter((signal) => signal.signal && signal.explanation).slice(0, 7)
      : [];
    if (!signals.length) {
      signals = getPublicSectionSignals(section, role);
    }
    return {
      score: Number.isFinite(Number(source.score)) ? Number(source.score) : Number(section && section.score) || 0,
      usefulScore: Number.isFinite(Number(source.usefulScore)) ? Number(source.usefulScore) : Number(section && section.usefulScore) || 0,
      importanceScore: Number.isFinite(Number(source.importanceScore)) ? Number(source.importanceScore) : Number(section && section.importanceScore) || 0,
      fluffScore: Number.isFinite(Number(source.fluffScore)) ? Number(source.fluffScore) : Number(section && section.metrics && section.metrics.fluffScore) || 0,
      signals
    };
  }

  function getPublicSectionRole(section) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    const ocrRole = normalizeRecoveredPdfOcrRole(metrics.ocrRole || unitMeta.ocrRole || "");
    if (ocrRole) {
      if (ocrRole === "body") return "ocr_letter_body";
      if (ocrRole === "date_reference") return "ocr_date_reference";
      if (ocrRole === "signature") return "ocr_signature";
      return `ocr_${ocrRole}`;
    }
    if (unitMeta.searchBlockType) return `search_${String(unitMeta.searchBlockType).replace(/[^a-z0-9_]+/gi, "_").toLowerCase()}`;
    if (metrics.pdfSectionType || unitMeta.pdfSectionType) return String(metrics.pdfSectionType || unitMeta.pdfSectionType);
    if (metrics.sectionKind) return String(metrics.sectionKind);
    if (unitMeta.kind) return String(unitMeta.kind);
    return "useful_section";
  }

  function getPublicSectionRoleLabel(section, role) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    return metrics.ocrRoleLabel
      || unitMeta.ocrRoleLabel
      || metrics.sectionKindLabel
      || recoveredPdfKindLabel(role)
      || "Useful section";
  }

  function getPublicSectionRoleConfidence(section) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    const explicit = Number(metrics.ocrRoleConfidence || unitMeta.ocrRoleConfidence);
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(0, Math.min(100, Math.round(explicit)));
    const score = Number(section && section.score) || 0;
    const usefulScore = Number(section && section.usefulScore) || 0;
    const importanceScore = Number(section && section.importanceScore) || 0;
    let confidence = Math.round(Math.max(0, Math.min(100, (score + 24) * 0.55 + usefulScore * 0.18 + importanceScore * 0.08)));
    if (section && section.isBest) confidence += 6;
    else if (section && section.isImportant) confidence += 3;
    return Math.max(0, Math.min(100, confidence));
  }

  function getPublicSectionWhyReasons(section, role) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    const reasons = [];
    if (Array.isArray(unitMeta.ocrRoleReasons)) reasons.push(...unitMeta.ocrRoleReasons);
    if (Array.isArray(metrics.ocrRoleReasons)) reasons.push(...metrics.ocrRoleReasons);
    if (unitMeta.diagnosticReason) reasons.push(unitMeta.diagnosticReason);
    if (metrics.selectionReason) reasons.push(metrics.selectionReason);
    const kindReason = reasonForPublicSectionKind(section);
    if (kindReason) reasons.push(kindReason);
    if (!reasons.length && role) reasons.push(`${getPublicSectionRoleLabel(section, role)} signal from existing section metadata`);
    return reasons;
  }

  function getPublicSectionSignals(section, role) {
    const metrics = section && section.metrics || {};
    const matched = metrics.matched || {};
    const unitMeta = section && section.unitMeta || {};
    const signals = [];
    const add = (signal, weight, explanation) => signals.push({ signal, weight, explanation });
    if (matched.finalRecommendation) add("finalRecommendation", 104, "Contains final recommendation language.");
    if (matched.finalAnswer) add("finalAnswer", 92, "Looks like the final answer.");
    if (matched.correctedAnswer || unitMeta.hasRevision || unitMeta.isAfterUserCorrection) add("correctedAnswer", 96, "Updated answer after a correction.");
    if (matched.results) add("results", 66, "Shows results or findings.");
    if (matched.mainArgument) add("mainArgument", 74, "States a main argument or claim.");
    if (matched.procedure || matched.action || matched.directAction) add("action", 42, "Contains actionable guidance.");
    if (matched.summary) add("summary", 52, "Summarizes useful content.");
    if (matched.answer || matched.conciseAnswer) add("answer", 46, "Has a direct answer signal.");
    if (metrics.codeBlocks > 0) add("structure.codeBlocks", 52, "Includes code or a practical example.");
    if (metrics.hasNumbers) add("structure.numbers", 12, "Contains concrete numbers or dates.");
    if (unitMeta.ocr || /^ocr_/i.test(String(role || ""))) add(`role.${role || "ocr"}`, Number(section && section.score) || 0, "OCR role from existing section metadata.");
    if (unitMeta.pdfSectionType || metrics.pdfSectionType) add(`pdfSectionType.${unitMeta.pdfSectionType || metrics.pdfSectionType}`, Number(section && section.score) || 0, "PDF section type from existing metadata.");
    if (matched.boilerplate) add("boilerplate", -114, "Looks like boilerplate or page chrome.");
    if (matched.references) add("references", -112, "Looks like references or citations.");
    if (metrics.fluffScore >= 82) add("fluff.high", -metrics.fluffScore, "High boilerplate or fluff score.");
    if (!signals.length) add(`role.${role || "useful_section"}`, Number(section && section.score) || 0, "Role from existing section metadata.");
    return signals.slice(0, 7);
  }

  function getPublicSectionSourceType(section) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    if (unitMeta.ocr) return "ocr";
    if (section && section.source === "pdf" || unitMeta.pdfjs || unitMeta.pageNumber || metrics.pdfSectionType) return "pdf";
    if (unitMeta.searchBlockType || unitMeta.kind === "search-block") return "search";
    if (unitMeta.role === "assistant" || unitMeta.role === "user" || metrics.chatRole) return "chat";
    return unitMeta.kind || section && section.source || "dom";
  }

  function uniquePublicStrings(values) {
    const seen = new Set();
    return (values || []).map((value) => String(value || "").replace(/\s+/g, " ").trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function normalizePublicPdfOcrSection(section, index = 0) {
    if (!section) return null;
    normalizePdfActionTargetSection(section);
    const pageNumber = getPdfSectionPageNumber(section);
    const range = getPdfSectionRelativeYRange(section);
    const geometry = getPdfSectionOcrGeometry(section);
    const metrics = section.metrics && typeof section.metrics === "object" ? section.metrics : {};
    const unitMeta = section.unitMeta && typeof section.unitMeta === "object" ? section.unitMeta : {};
    return {
      id: String(section.id || `ocr-section-${pageNumber || 1}-${index}`).slice(0, 160),
      title: String(section.title || section.label || `Page ${pageNumber || 1}`).slice(0, 240),
      label: String(section.label || "").slice(0, 160),
      text: String(section.text || "").replace(/\s+/g, " ").trim().slice(0, 1200),
      pageNumber,
      wordCount: Number(section.wordCount) || countPdfWords(section.text || ""),
      isBest: Boolean(section.isBest || runtime.model && section.id === runtime.model.bestSectionId),
      isImportant: Boolean(section.isImportant),
      navigationTarget: String(section.navigationTarget || unitMeta.navigationTarget || `#page=${pageNumber || 1}`).slice(0, 120),
      relativeY: range.center,
      relativeYStart: range.start,
      relativeYEnd: range.end,
      ocr: true,
      ocrRole: String(unitMeta.ocrRole || metrics.ocrRole || "").slice(0, 80),
      ocrRoleLabel: String(unitMeta.ocrRoleLabel || metrics.ocrRoleLabel || "").slice(0, 120),
      sectionKind: String(metrics.sectionKind || unitMeta.kind || "").slice(0, 80),
      sectionKindLabel: String(metrics.sectionKindLabel || unitMeta.ocrRoleLabel || "").slice(0, 120),
      ocrGeometry: geometry || null,
      ocrBoundingBox: geometry && geometry.bbox || null,
      ocrExactGeometry: Boolean(geometry && geometry.exact && unitMeta.ocrExactGeometry !== false),
      ocrVariantName: String(unitMeta.ocrVariantName || geometry && geometry.ocrVariantName || "").slice(0, 80),
      sourceLineIds: Array.isArray(unitMeta.sourceLineIds) ? unitMeta.sourceLineIds.slice(0, 120) : [],
      sourceLineTextSample: String(unitMeta.sourceLineTextSample || geometry && geometry.sourceLineTextSample || "").replace(/\s+/g, " ").trim().slice(0, 260),
      sectionTextSample: String(unitMeta.sectionTextSample || section.text || "").replace(/\s+/g, " ").trim().slice(0, 260),
      intelligence: normalizeSectionIntelligenceForPublic(section, "pdf")
    };
  }

  function buildStablePdfOcrStatusSnapshot(model, routeKey, details = {}) {
    if (!model || !Array.isArray(model.sections)) return null;
    const sections = model.sections;
    const importantSections = Array.isArray(model.importantSections) ? model.importantSections : sections.filter((section) => section && section.isImportant);
    const bestSection = sections.find((section) => section && section.id === model.bestSectionId)
      || sections.find((section) => section && section.isBest)
      || importantSections[0]
      || sections[0]
      || null;
    const nextImportant = sections.find((section) => section && section.id === model.nextImportantId)
      || importantSections.find((section) => section && bestSection && section.id !== bestSection.id)
      || sections.find((section) => section && bestSection && section.id !== bestSection.id)
      || null;
    const words = Number(model.totalReadableWords || model.totalWords || sections.reduce((sum, section) => sum + (Number(section && section.wordCount) || countPdfWords(section && section.text || "")), 0));
    const normalizedSections = sections
      .filter((section) => isOcrPdfSection(section))
      .map((section, index) => normalizePublicPdfOcrSection(section, index))
      .filter(Boolean);
    const diagnostic = details.finalDiagnostic || runtime.pdfOcr.finalDiagnostic || null;
    const weakTextCanRunBetter = Boolean(
      runtime.pdfOcr
      && runtime.pdfOcr.betterAvailableForRoute === routeKey
      && /weak_text/i.test(String(details.finalStatus || diagnostic && diagnostic.finalStatus || ""))
    );
    const status = {
      ok: true,
      stableStatusSnapshot: true,
      snapshotSource: "stable-ocr",
      usableSnapshot: true,
      routeKey,
      pageType: "pdf",
      pageLabel: "PDF",
      pageSubtype: model.pageProfile && (model.pageProfile.ocrQuality || model.pageProfile.searchSubtype) || runtime.pdfOcr.qualityState || "",
      qualityMessage: model.pageProfile && model.pageProfile.qualityMessage || runtime.pdfOcr.qualityMessage || "",
      pdfState: "ready",
      loading: false,
      loadingReason: "",
      recoveryPending: false,
      pdfPending: false,
      pdfRetrying: false,
      pdfProgress: 100,
      progress: 100,
      pdfReady: true,
      pdfJumpReady: Boolean(bestSection && canJumpToSection(bestSection)),
      pdfOcrActive: false,
      pdfOcrWorkerActive: false,
      pdfOcrCanCancel: false,
      pdfOcrCanRunFast: false,
      pdfOcrCanRunBetter: weakTextCanRunBetter,
      pdfOcrRecommendedMode: weakTextCanRunBetter ? "better" : "fast",
      pdfOcrTakingLong: false,
      pdfOcrCancelled: false,
      sections: sections.length,
      important: importantSections.length,
      words,
      shortPage: false,
      quietMode: false,
      chatReady: false,
      readingConfidence: model.pageProfile && model.pageProfile.readingConfidence || model.confidence || 88,
      reason: "OCR finished. SkimRoute found readable text and built a page map.",
      confidence: Number(model.confidence) || 88,
      confidenceTier: model.confidenceTier || "high",
      confidenceLabel: model.confidenceLabel || "PDF mapped",
      hasStrongTarget: true,
      pdfSource: "ocr",
      pdfRecoveredWords: words,
      pdfRecoveredPages: runtime.pdfOcr.pages || model.diagnostics && model.diagnostics.recoveredPages || 0,
      pdfPartial: Boolean(runtime.pdfOcr.partial),
      pdfError: "",
      pdfErrorKind: "",
      pdfCacheHit: Boolean(runtime.pdfOcr.cacheHit),
      pdfCacheSource: runtime.pdfOcr.cacheSource || model.diagnostics && model.diagnostics.recoveredPdfCacheSource || "ocr-ready",
      canJump: Boolean(bestSection && canJumpToSection(bestSection)),
      canJumpNext: Boolean(nextImportant && canJumpToSection(nextImportant)),
      bestSectionId: bestSection && bestSection.id || "",
      nextImportantId: nextImportant && nextImportant.id || "",
      bestTitle: bestSection && bestSection.title || "",
      nextImportantTitle: nextImportant && nextImportant.title || "",
      bestReason: bestSection ? reasonForPublicSection(bestSection) : "OCR text was recovered from the scanned PDF.",
      whyReason: bestSection ? reasonForPublicSection(bestSection) : "OCR text was recovered from the scanned PDF.",
      quietReason: "",
      archetype: "pdf",
      bestLabel: model.bestLabel || bestSection && bestSection.label || "PDF map ready",
      bestKind: model.bestKind || bestSection && bestSection.metrics && bestSection.metrics.sectionKind || "",
      bestKindLabel: model.bestKindLabel || bestSection && bestSection.metrics && bestSection.metrics.sectionKindLabel || "",
      savedMinutes: model.savedMinutes || 1,
      pdfActivePage: runtime.pdfActivePage || getPdfSectionPageNumber(bestSection) || 0,
      pdfActiveSectionId: runtime.view.activeId || "",
      pdfOcrSections: normalizedSections,
      ocrSections: normalizedSections,
      normalizedOcrSections: normalizedSections,
      pdfOcrFinalDiagnostic: diagnostic,
      finalDiagnostic: diagnostic,
      ocrRunId: details.ocrRunId || diagnostic && diagnostic.ocrRunId || runtime.pdfOcr.activeOcrRunId || 0,
      finalStatus: details.finalStatus || diagnostic && diagnostic.finalStatus || "success",
      pdfDiagnosticSummary: {
        routeKey,
        source: "stable-ocr",
        pending: false,
        retrying: false,
        canJumpBest: Boolean(bestSection && canJumpToSection(bestSection)),
        canJumpNext: Boolean(nextImportant && canJumpToSection(nextImportant)),
        bestPage: getPdfSectionPageNumber(bestSection),
        nextPage: getPdfSectionPageNumber(nextImportant),
        sections: sections.length,
        words,
        note: "Authoritative finalized OCR PDF status snapshot."
      }
    };
    return finalizePdfPublicStatus(status, model, { emit: false, reason: `stable-ocr:${details.reason || "ready"}` });
  }

  function isUsablePdfStatsModel(model, pdfRouteLocked = false) {
    if (!model || !model.pageProfile || !Array.isArray(model.sections)) return false;
    const isPdf = model.pageProfile.type === "pdf" || Boolean(pdfRouteLocked);
    if (!isPdf || model.sections.length < 1) return false;
    const words = Number(model.totalReadableWords || 0);
    const shortOcrReady = model.sections.some((section) => section && section.unitMeta && section.unitMeta.ocr && isCacheableShortOcrText(section.text || ""));
    return words >= PDF_RECOVERY_MIN_WORDS || shortOcrReady;
  }

  function isTransientPdfStatsModel(model) {
    if (!model || !model.pageProfile) return true;
    const state = String(model.pageProfile.state || "");
    const reason = String(model.pageProfile.reason || model.pageProfile.diagnosticHint || "");
    return /^(loading|needs-ocr|ocr|extracting|ocr-prompt|ocr-cancelled|ocr-unreadable|pdf-error)$/i.test(state)
      || /\b(still loading|no selectable text|could not be read|scan unreadable|run ocr|checking|reading pdf|running ocr)\b/i.test(reason);
  }

  function shouldPreferPdfSnapshot(candidate, current, pdfRouteLocked = false) {
    if (!isUsablePdfStatsModel(candidate, pdfRouteLocked)) return false;
    if (!isUsablePdfStatsModel(current, pdfRouteLocked)) return true;
    const candidateWords = Number(candidate && candidate.totalReadableWords || 0);
    const currentWords = Number(current && current.totalReadableWords || 0);
    if (isTransientPdfStatsModel(current)) return true;
    return candidateWords > currentWords + 24;
  }

  function isPdfRecoveryFailureRuntimeState() {
    const state = runtime.pdfOcr && String(runtime.pdfOcr.state || "");
    const errorKind = runtime.pdfOcr && String(runtime.pdfOcr.errorKind || "");
    return /^(fetch-error|needs-ocr|ocr-failed|ocr-cancelled|ocr-unreadable)$/i.test(state)
      || /^(fetch|local-file|protected|too-large|unsupported|extract-timeout|ocr-timeout|ocr-cancelled|ocr-low-text|ocr-unreadable|ocr|ocr-unavailable|ocr-worker|ocr-blank-canvas)$/i.test(errorKind);
  }

  function selectAuthoritativeModelSnapshot(currentModel, options = {}) {
    let model = currentModel || null;
    let snapshotSource = model ? "runtime" : "";
    const pdfRouteLocked = Boolean(options.pdfRouteLocked);
    const currentType = model && model.pageProfile && model.pageProfile.type || "";
    const pdfLike = pdfRouteLocked || currentType === "pdf";
    if (pdfLike) {
      const candidates = [
        { model: options.recoveredPdfModel || null, source: "pdf-cache" },
        { model: options.stablePdfModel || null, source: "stable-pdf" }
      ];
      candidates.forEach((candidate) => {
        if (candidate.model && shouldPreferPdfSnapshot(candidate.model, model, pdfRouteLocked)) {
          model = candidate.model;
          snapshotSource = candidate.source;
        }
      });
      return {
        model,
        snapshotSource,
        usableSnapshot: isUsablePdfStatsModel(model, pdfRouteLocked)
      };
    }

    const stableChatModel = options.stableChatModel || null;
    const shouldUseStableChat = Boolean(
      stableChatModel
      && isUsableChatModel(stableChatModel)
      && (
        !isUsableChatModel(model)
        || !model
        || !model.pageProfile
        || model.pageProfile.state === "loading"
        || Number(model.totalReadableWords || 0) < Math.min(80, Number(stableChatModel.totalReadableWords || 0) * 0.35)
      )
    );
    if (shouldUseStableChat) {
      model = stableChatModel;
      snapshotSource = "stable-chat";
    }
    return {
      model,
      snapshotSource,
      usableSnapshot: Boolean(model && (isUsableChatModel(model) || isUsablePdfStatsModel(model, pdfRouteLocked)))
    };
  }

  function getAuthoritativeModelForStats() {
    const pdfRouteLocked = isPdfRouteLocked();
    const routeKey = getPdfDocumentRouteKey();
    const readyPdfModel = pdfRouteLocked ? getReadyPdfModelForStatus(routeKey) : null;
    if (readyPdfModel && readyPdfModel.model) {
      return {
        model: readyPdfModel.model,
        snapshotSource: readyPdfModel.source,
        usableSnapshot: true
      };
    }
    const recoveredPdfModel = pdfRouteLocked
      && runtime.recoveredPdfModelCache
      && getCanonicalPdfRouteKey(runtime.recoveredPdfModelCache.routeKey) === getCanonicalPdfRouteKey(routeKey)
        ? runtime.recoveredPdfModelCache.model
        : null;
    const stablePdfModel = runtime.stablePdfModel && runtime.stablePdfRouteKey === routeKey
      ? runtime.stablePdfModel
      : null;
    const chatRouteKey = getChatStableRouteKey();
    const stableChatModel = runtime.stableChatModel
      && runtime.stableChatRouteKey === chatRouteKey
      && isKnownAiHost()
        ? runtime.stableChatModel
        : null;
    const selected = selectAuthoritativeModelSnapshot(runtime.model, {
      pdfRouteLocked,
      recoveredPdfModel,
      stablePdfModel,
      stableChatModel
    });
    return selected;
  }

  function getUsablePdfSnapshotForRoute(routeKey, reason, baseModel) {
    const recoveredPdfModel = buildRecoveredPdfModelFromCache(routeKey, reason, baseModel, { remember: false });
    if (isUsablePdfStatsModel(recoveredPdfModel, true)) {
      return { model: recoveredPdfModel, source: "pdf-cache" };
    }
    if (runtime.stablePdfModel && runtime.stablePdfRouteKey === getPdfDocumentRouteKey() && isUsablePdfStatsModel(runtime.stablePdfModel, true)) {
      return { model: runtime.stablePdfModel, source: "stable-pdf" };
    }
    if (isUsablePdfStatsModel(baseModel, true)) {
      return { model: baseModel, source: "runtime" };
    }
    return null;
  }

  function adoptAuthoritativePdfModel(reason = "action") {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return false;
    const snapshot = getAuthoritativeModelForStats();
    if (snapshot && snapshot.model && isUsablePdfStatsModel(snapshot.model, true)) {
      runtime.model = normalizeRecoveredPdfModelForPublicStatus(snapshot.model, getPdfDocumentRouteKey(), runtime.pdfOcr && runtime.pdfOcr.lastRecoveredEntry || null, runtime.model, `adopt:${reason}:${snapshot.snapshotSource || "runtime"}`);
      rememberStablePdfModel(runtime.model, `adopt:${reason}:${snapshot.snapshotSource || "runtime"}`);
      render();
      return true;
    }
    return false;
  }

  function shouldPreserveStablePdfModel(candidateModel, reason) {
    if (!isPdfRouteLocked()) return false;
    if (!runtime.stablePdfModel || runtime.stablePdfRouteKey !== getPdfDocumentRouteKey()) return false;
    const stableWords = Number(runtime.stablePdfModel.totalReadableWords || 0);
    const candidateWords = Number(candidateModel && candidateModel.totalReadableWords || 0);
    const candidateType = candidateModel && candidateModel.pageProfile && candidateModel.pageProfile.type || "";
    const stableShortOcrReady = Array.isArray(runtime.stablePdfModel.sections) && runtime.stablePdfModel.sections.some((section) => section && section.unitMeta && section.unitMeta.ocr && isCacheableShortOcrText(section.text || ""));
    if (stableWords < PDF_RECOVERY_MIN_WORDS && !stableShortOcrReady) return false;
    return candidateType !== "pdf" || candidateWords < Math.min(160, stableWords * 0.25) || /^(mutation|route|url|pdf-route|pdf-cache)$/i.test(String(reason || "")) && candidateWords < stableWords;
  }

  function reuseStablePdfModel(reason, overwrittenModel = null) {
    const model = runtime.stablePdfModel;
    if (!model) return overwrittenModel;
    emitDebug("pdf:model:stable-preserved", {
      reason,
      routeKey: runtime.stablePdfRouteKey,
      preservedSections: model.sections ? model.sections.length : 0,
      preservedWords: model.totalReadableWords || 0,
      blockedOverwrite: overwrittenModel && overwrittenModel.pageProfile ? {
        type: overwrittenModel.pageProfile.type,
        reason: overwrittenModel.pageProfile.reason || "",
        words: overwrittenModel.totalReadableWords || 0,
        sections: overwrittenModel.sections ? overwrittenModel.sections.length : 0
      } : null,
      exactIssue: "A PDF viewer mutation/route scan produced a thin Chrome viewer shell model. SkimRoute kept the recovered PDF model instead of overwriting it."
    });
    return model;
  }

  function isUsableChatModel(model) {
    if (!model || !model.pageProfile || model.pageProfile.type !== "chat") return false;
    const sections = Array.isArray(model.sections) ? model.sections : [];
    const words = Number(model.totalReadableWords || 0);
    const assistantSections = sections.filter((section) => {
      const meta = section.unitMeta || {};
      return meta.role === "assistant" && Number(section.wordCount || 0) >= 8;
    });
    return assistantSections.length >= 1
      || (sections.length >= 1 && words >= 35)
      || words >= 80;
  }

  function rememberStableChatModel(model, source) {
    if (!isUsableChatModel(model)) return false;
    runtime.stableChatModel = model;
    runtime.stableChatRouteKey = getChatStableRouteKey();
    emitDebug("chat:model:stable-saved", {
      source: source || "unknown",
      routeKey: runtime.stableChatRouteKey,
      sections: model.sections ? model.sections.length : 0,
      words: model.totalReadableWords || 0,
      exactIssue: "none"
    });
    publishStatusUpdate("chat:model:stable-saved");
    return true;
  }

  function shouldPreserveStableChatModel(candidateModel, reason) {
    if (!runtime.stableChatModel || !isKnownAiHost()) return false;
    const routeKey = getChatStableRouteKey();
    if (runtime.stableChatRouteKey !== routeKey) return false;
    if (!isUsableChatModel(runtime.stableChatModel)) return false;
    if (isUsableChatModel(candidateModel)) return false;
    const candidateSections = Array.isArray(candidateModel && candidateModel.sections) ? candidateModel.sections.length : 0;
    const candidateWords = Number(candidateModel && candidateModel.totalReadableWords || 0);
    const candidateState = candidateModel && candidateModel.pageProfile && candidateModel.pageProfile.state || "";
    return candidateState === "loading"
      || candidateSections < 1
      || candidateWords < Math.min(80, Number(runtime.stableChatModel.totalReadableWords || 0) * 0.35)
      || /^(initial|mutation|route|popup|open-recheck|.*-warmup|.*-chat-ready)$/i.test(String(reason || ""));
  }

  function reuseStableChatModel(reason, overwrittenModel = null) {
    const model = runtime.stableChatModel;
    if (!model) return overwrittenModel;
    emitDebug("chat:model:stable-preserved", {
      reason,
      routeKey: runtime.stableChatRouteKey,
      preservedSections: model.sections ? model.sections.length : 0,
      preservedWords: model.totalReadableWords || 0,
      blockedOverwrite: overwrittenModel && overwrittenModel.pageProfile ? {
        type: overwrittenModel.pageProfile.type,
        reason: overwrittenModel.pageProfile.reason || "",
        state: overwrittenModel.pageProfile.state || "",
        words: overwrittenModel.totalReadableWords || 0,
        sections: overwrittenModel.sections ? overwrittenModel.sections.length : 0
      } : null,
      exactIssue: "A chat startup or mutation scan produced an empty/waiting model. SkimRoute kept the last usable conversation map instead."
    });
    return model;
  }


  function buildFallbackModel(reason, errorMessage) {
    const quietReason = errorMessage
      ? `SkimRoute hit an internal error while scanning: ${errorMessage}`
      : "SkimRoute is not ready yet.";
    return {
      adapterName: "error",
      articleRoot: document.body,
      pageProfile: {
        type: "low_structure",
        label: "Page",
        readingConfidence: 0,
        quietMode: true,
        reason: quietReason,
        quietReason,
        adapterName: "error",
        diagnosticHint: errorMessage ? `Internal scan error: ${errorMessage}` : ""
      },
      sections: [],
      importantSections: [],
      bestSectionId: null,
      nextImportantId: null,
      skipTargetId: null,
      confidence: 0,
      confidenceTier: "low",
      confidenceLabel: "Unavailable",
      hasStrongTarget: false,
      bestLabel: "Best start",
      savedMinutes: 0,
      totalWords: 0,
      totalReadableWords: 0,
      readingMinutes: 0,
      routeKey: getCurrentUrl(),
      routeHash: "error",
      diagnostics: {
        adapterName: "error",
        adapterFamily: "error",
        rootTag: document.body && document.body.tagName ? document.body.tagName.toLowerCase() : "",
        rootId: document.body && document.body.id ? document.body.id : "",
        rootClass: document.body && document.body.className ? String(document.body.className).slice(0, 120) : "",
        rootWords: 0,
        adapterUnitsCount: 0,
        useAdapterUnits: false,
        headingSectionsCount: 0,
        fallbackSectionsCount: 0,
        unitSectionsCount: 0,
        rawSectionCount: 0,
        pageProfileBefore: null,
        pageProfileAfter: {
          type: "low_structure",
          label: "Page",
          quietMode: true,
          reason: quietReason,
          diagnosticHint: errorMessage ? `Internal scan error: ${errorMessage}` : ""
        }
      },
      structureSignature: `error:${errorMessage || reason || "unknown"}`
    };
  }

  function buildLoadingModel(reason, baseModel) {
    const current = baseModel || {};
    const verifiedChat = isVerifiedChatSurface(current);
    const inferredType = current.pageProfile && current.pageProfile.type
      ? current.pageProfile.type
      : isPdfLikePage()
        ? "pdf"
        : verifiedChat
          ? "chat"
          : "low_structure";
    const inferredLabel = current.pageProfile && current.pageProfile.label
      ? current.pageProfile.label
      : inferredType === "pdf"
        ? "PDF"
        : inferredType === "chat"
          ? "AI chat"
          : "Page";
    const diagnostics = current.diagnostics || null;
    const loadingStartedAt = current.pageProfile && Number(current.pageProfile.loadingStartedAt) || Date.now();
    const loadingElapsed = Date.now() - loadingStartedAt;
    const note = inferredType === "pdf"
      ? "PDF text is still loading, or the browser has not exposed a selectable text layer yet."
      : inferredType === "chat"
        ? (loadingElapsed > CHAT_LOADING_EXPLAIN_AFTER_MS
          ? "The conversation is taking longer than usual to expose a complete assistant answer."
          : "Conversation structure is still loading.")
        : "SkimRoute is checking this page locally.";
    const loadingReason = inferredType === "chat"
      ? (loadingElapsed > CHAT_LOADING_EXPLAIN_AFTER_MS
        ? "Still waiting for a complete assistant answer."
        : "Waiting for the conversation to finish loading.")
      : "Checking this page locally.";
    return {
      adapterName: current.adapterName || "loading",
      articleRoot: current.articleRoot || document.body,
      pageProfile: {
        type: inferredType,
        label: inferredLabel,
        readingConfidence: Math.min(26, Math.max(10, current.pageProfile && Number.isFinite(current.pageProfile.readingConfidence) ? current.pageProfile.readingConfidence : 16)),
        quietMode: false,
        reason: loadingReason,
        quietReason: "",
        adapterName: current.adapterName || "loading",
        state: "loading",
        loadingStartedAt,
        diagnosticHint: note
      },
      sections: [],
      importantSections: [],
      bestSectionId: null,
      nextImportantId: null,
      skipTargetId: null,
      confidence: 0,
      confidenceTier: "low",
      confidenceLabel: "Scanning",
      hasStrongTarget: false,
      bestLabel: inferredType === "chat" ? "Waiting" : "Checking",
      bestKind: "",
      savedMinutes: 0,
      totalWords: current.totalWords || 0,
      totalReadableWords: current.totalReadableWords || 0,
      readingMinutes: current.readingMinutes || 0,
      routeKey: current.routeKey || getCurrentUrl(),
      routeHash: current.routeHash || "loading",
      diagnostics,
      structureSignature: `loading:${current.routeHash || reason || "scan"}`
    };
  }

  function buildPdfProcessingModel(baseModel, message, pdfState) {
    const current = baseModel || {};
    const prompt = message || "Reading PDF text...";
    const profile = current.pageProfile || {};
    return {
      ...current,
      articleRoot: current.articleRoot || document.body,
      pageProfile: {
        ...profile,
        type: "pdf",
        label: "PDF",
        readingConfidence: Math.max(18, Math.min(42, profile.readingConfidence || 24)),
        quietMode: false,
        reason: prompt,
        quietReason: "",
        adapterName: profile.adapterName || current.adapterName || "pdf",
        state: "loading",
        pdfState: pdfState || "extracting",
        diagnosticHint: prompt
      },
      sections: [],
      importantSections: [],
      bestSectionId: null,
      nextImportantId: null,
      skipTargetId: null,
      confidence: 0,
      confidenceTier: "low",
      confidenceLabel: "Scanning",
      hasStrongTarget: false,
      bestLabel: "Scanning",
      bestKind: "",
      savedMinutes: 0,
      totalWords: current.totalWords || 0,
      totalReadableWords: current.totalReadableWords || 0,
      readingMinutes: current.readingMinutes || 0,
      routeKey: current.routeKey || getCurrentUrl(),
      routeHash: current.routeHash || "pdf-processing",
      diagnostics: current.diagnostics || null,
      structureSignature: `pdf-processing:${current.routeHash || current.routeKey || getCurrentUrl()}:${pdfState || "extracting"}`
    };
  }

  function buildPdfPromptModel(baseModel, message, options = {}) {
    const current = baseModel || {};
    const prompt = message || PDF_OCR_IMAGE_PROMPT_MESSAGE;
    const profile = current.pageProfile || {};
    const diagnostics = current.diagnostics || {};
    const state = options.state || "ocr-prompt";
    const bestLabel = options.bestLabel || "Run OCR";
    const confidenceLabel = options.confidenceLabel || (state === "ocr-prompt" ? "Needs OCR" : "PDF issue");
    return {
      ...current,
      pageProfile: {
        ...profile,
        type: "pdf",
        label: "PDF",
        readingConfidence: 0,
        quietMode: false,
        reason: prompt,
        quietReason: "",
        adapterName: profile.adapterName || current.adapterName || "pdf",
        state,
        diagnosticHint: prompt
      },
      sections: [],
      importantSections: [],
      bestSectionId: null,
      nextImportantId: null,
      skipTargetId: null,
      confidence: 0,
      confidenceTier: "low",
      confidenceLabel,
      hasStrongTarget: false,
      bestLabel,
      bestKind: "",
      savedMinutes: 0,
      totalWords: current.totalWords || 0,
      totalReadableWords: current.totalReadableWords || 0,
      readingMinutes: current.readingMinutes || 0,
      diagnostics: {
        ...diagnostics,
        pageProfileAfter: {
          type: "pdf",
          label: "PDF",
          quietMode: false,
          reason: prompt,
          diagnosticHint: prompt
        }
      },
      structureSignature: `ocr-prompt:${current.routeHash || current.routeKey || "pdf"}:${prompt}`
    };
  }

  function enforcePdfRouteModel(model, reason) {
    if (!isPdfRouteLocked() || !model || !model.pageProfile) {
      return model;
    }

    const profile = model.pageProfile || {};
    const pdfRouteKey = getPdfDocumentRouteKey();
    const words = Number(model.totalReadableWords || 0);
    const sections = Array.isArray(model.sections) ? model.sections.length : 0;
    const hasUsableMap = sections >= 1 && words >= PDF_RECOVERY_MIN_WORDS;
    const pdfTerminal = runtime.pdfOcr && isPdfRecoveryFailureRuntimeState();
    const alreadyPdf = profile.type === "pdf" && profile.label === "PDF" && !profile.quietMode;

    if (hasUsableMap) {
      return {
        ...model,
        pageProfile: {
          ...profile,
          type: "pdf",
          label: "PDF",
          quietMode: false,
          quietReason: "",
          reason: profile.reason || "Selectable PDF text found",
          adapterName: profile.adapterName || model.adapterName || "pdf"
        },
        routeKey: pdfRouteKey,
        routeHash: model.routeHash || pdfRouteKey,
        structureSignature: `pdf-route-ready:${model.structureSignature || pdfRouteKey}`
      };
    }

    if (profile.type !== "pdf" || profile.quietMode || profile.label !== "PDF") {
      emitDebug("pdf:route:forced", {
        reason,
        previousType: profile.type || "",
        previousLabel: profile.label || "",
        previousQuietMode: Boolean(profile.quietMode),
        previousReason: profile.reason || "",
        pdfState: runtime.pdfOcr && runtime.pdfOcr.state || "",
        pdfPending: Boolean(runtime.pdfOcr && runtime.pdfOcr.pending),
        pdfRetrying: Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying),
        words,
        sections
      });
    }

    if (pdfTerminal) {
      return buildPdfPromptModel(model, runtime.pdfOcr.lastError || publicPdfErrorMessage(runtime.pdfOcr.errorKind, false), runtime.pdfOcr.errorKind === "fetch"
        ? { state: "pdf-error", bestLabel: "PDF access issue", confidenceLabel: "PDF issue" }
        : runtime.pdfOcr.state === "ocr-unreadable" || runtime.pdfOcr.errorKind === "ocr-low-text"
          ? { state: "ocr-unreadable", bestLabel: "OCR finished", confidenceLabel: "Scan unreadable" }
          : runtime.pdfOcr.state === "ocr-failed"
            ? { state: "ocr-failed", bestLabel: "OCR failed", confidenceLabel: "OCR issue" }
          : { state: "ocr-prompt", bestLabel: "Run OCR", confidenceLabel: "Needs OCR" });
    }

    if (alreadyPdf && (runtime.pdfOcr.pending || runtime.pdfOcr.retrying || profile.state === "loading")) {
      return model;
    }

    return buildPdfProcessingModel(model, PDF_OCR_DETECTION_MESSAGE, "extracting");
  }


  function shouldHoldLoadingState(reason, model) {
    if (!model || !reason) return false;
    if (!/^(initial|mutation|route|popup|scan:.*|.*-warmup|.*-chat-ready)$/i.test(String(reason))) return false;

    const pageType = model.pageProfile && model.pageProfile.type;
    const verifiedChat = isVerifiedChatSurface(model);
    const dynamicSurface = verifiedChat || isPdfRouteLocked() || isPdfLikePage() || pageType === "pdf";
    if (!dynamicSurface) return false;

    const sections = Array.isArray(model.sections) ? model.sections.length : 0;
    const words = Number(model.totalReadableWords || 0);
    const hasStrongTarget = Boolean(model.hasStrongTarget);
    const type = model.pageProfile && model.pageProfile.type;
    if (type === "pdf" || isPdfRouteLocked()) {
      const hasUsablePdfMap = sections >= 1 && words >= PDF_RECOVERY_MIN_WORDS;
      if (hasUsablePdfMap) return false;
      if (
        model.pageProfile
        && /^(ocr-prompt|pdf-error|ocr-unreadable|ocr-failed)$/i.test(String(model.pageProfile.state || ""))
      ) return false;
      if (runtime.pdfOcr && !runtime.pdfOcr.pending && !runtime.pdfOcr.retrying && isPdfRecoveryFailureRuntimeState()) return false;
      if (runtime.pdfOcr && runtime.pdfOcr.pending && !isPdfAnalysisExpired()) return true;
    }
    if (type === "chat" && !verifiedChat) {
      emitDebug("chat:loading:rejected", {
        reason,
        pageType: type,
        exactIssue: "The page model looked chat-like, but the DOM did not have known AI-host or assistant/user evidence. SkimRoute will avoid chatbot waiting copy."
      });
      return false;
    }

    if (type === "chat") {
      // Launch-friendly behavior: on AI chat pages, never keep the popup stuck on
      // a vague waiting state once any meaningful conversation text is present.
      // The sidebar can still improve the ranking later through mutation scans,
      // but first impression should show the best available local map immediately.
      if (sections >= 1 || words >= 35) {
        return false;
      }
      return false;
    }

    const wordThreshold = type === "pdf"
      ? 24
      : 320;
    const sectionThreshold = type === "pdf"
      ? 1
      : 4;
    return !hasStrongTarget && (sections < sectionThreshold || words < wordThreshold || (model.pageProfile && model.pageProfile.quietMode));
  }

  function render() {
    if (!runtime.ui || !runtime.model) return;
    const snapshot = getAuthoritativeModelForStats();
    if (snapshot && snapshot.usableSnapshot && snapshot.model && snapshot.model !== runtime.model) {
      runtime.model = snapshot.model;
      if (runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf") {
        rememberStablePdfModel(runtime.model, `render:${snapshot.snapshotSource || "authoritative"}`);
      }
    }
    decorateModelWithPdfRuntimeState(runtime.model);
    window.__PAGEPILOT_CURRENT_SECTIONS__ = runtime.model.sections;
    runtime.ui.render(runtime.model, runtime.view);
  }

  function decorateModelWithPdfRuntimeState(model) {
    if (!model || !model.pageProfile || !(model.pageProfile.type === "pdf" || isPdfRouteLocked())) return model;
    const profile = model.pageProfile;
    const state = runtime.pdfOcr && runtime.pdfOcr.state || profile.pdfState || profile.state || "";
    const pending = Boolean(runtime.pdfOcr && runtime.pdfOcr.pending);
    const retrying = Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying);
    const elapsed = runtime.pdfOcr && runtime.pdfOcr.analysisStartedAt ? Date.now() - runtime.pdfOcr.analysisStartedAt : 0;
    const pdfOcrActive = isPdfOcrActive();
    const pdfOcrWorkerActive = isPdfOcrWorkerActiveForRun(getActivePdfOcrRunId());
    profile.pdfState = state;
    profile.pdfOcrMode = runtime.pdfOcr && runtime.pdfOcr.mode || "";
    profile.pdfOcrMessage = runtime.pdfOcr && runtime.pdfOcr.progressMessage || "";
    profile.pdfOcrProgress = runtime.pdfOcr && Number.isFinite(runtime.pdfOcr.progress) ? runtime.pdfOcr.progress : 0;
    profile.pdfOcrActive = pdfOcrActive;
    profile.pdfOcrWorkerActive = pdfOcrWorkerActive;
    profile.pdfOcrCanCancel = shouldExposePdfOcrCancel();
    profile.pdfOcrCanRunFast = Boolean(!pdfOcrActive && !pending && !retrying && /^(ocr-prompt|needs-ocr)$/i.test(String(state || profile.state || "")));
    profile.pdfOcrCanRunBetter = shouldExposePdfOcrBetter(getRouteCacheKey());
    profile.pdfOcrTakingLong = Boolean(pdfOcrActive && (elapsed > 7000 || runtime.pdfOcr && runtime.pdfOcr.slowDevice));
    profile.pdfOcrCancelled = state === "ocr-cancelled";
    profile.pdfOcrRecommendedMode = runtime.pdfOcr && runtime.pdfOcr.recommendedMode || "fast";
    profile.ocrFinalDiagnostic = runtime.pdfOcr && runtime.pdfOcr.finalDiagnostic || null;
    model.pdfOcrFinalDiagnostic = runtime.pdfOcr && runtime.pdfOcr.finalDiagnostic || null;
    return model;
  }

  function setMode(mode, options) {
    if (!runtime.model) return;
    const nextMode = resolveMode(mode);
    runtime.view.mode = nextMode;

    if (nextMode === "open") {
      clearPageMode();
      refreshSectionPositions();
      refreshActiveSection();
      if (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type !== "pdf" && (runtime.model.totalReadableWords || 0) < 120) {
        window.setTimeout(() => {
          if (runtime.view.mode === "open") {
            scanPage("open-recheck");
          }
        }, 180);
      }
    }

    if (options && options.persist) {
      persistPageMode(nextMode);
    }

    render();

    if (nextMode === "open" && options && options.focus) {
      runtime.ui.focusPanel();
    } else if (options && options.focusTab) {
      runtime.ui.focusTab();
    }
  }

  function modeForClosedState() {
    return resolveMode("minimized");
  }

  function resolveMode(mode) {
    const normalized = VIEW_MODES.has(mode) ? mode : "minimized";
    if (normalized === "open" || normalized === "snoozed") {
      return normalized;
    }
    if (isPdfRouteLocked()) {
      return "minimized";
    }
    return runtime.model && runtime.model.pageProfile.quietMode ? "quiet" : "minimized";
  }

  async function restorePageMode() {
    if (!runtime.model) return;
    const state = await storageGet(pageStorageKey());
    const expired = !state || !state.expiresAt || state.expiresAt <= Date.now();

    if (expired) {
      clearPageMode();
      runtime.view.mode = resolveMode("minimized");
      return;
    }

    runtime.view.mode = state.mode === "snoozed" ? "snoozed" : resolveMode(state.mode);
  }

  function persistPageMode(mode) {
    if (!runtime.model) return;
    if (mode === "snoozed") {
      storageSet(pageStorageKey(), {
        mode,
        expiresAt: Date.now() + SNOOZE_TTL_MS
      });
      return;
    }
    clearPageMode();
  }

  function clearPageMode() {
    if (!runtime.model) return;
    storageRemove(pageStorageKey());
  }

  function pageStorageKey() {
    return `${STORAGE_KEYS.pagePrefix}${runtime.model ? runtime.model.routeHash : "unknown"}`;
  }

  async function dismissOnboarding() {
    runtime.view.showOnboarding = false;
    await storageSet(STORAGE_KEYS.onboardingSeen, true);
    render();
  }


  function getRouteCacheKey() {
    if (isPdfRouteLocked() || isPdfLikePage()) {
      return getPdfDocumentRouteKey();
    }
    return runtime.model && runtime.model.routeHash ? runtime.model.routeHash : runtime.currentUrl || getCurrentUrl();
  }

  function getPdfDocumentRouteKey() {
    const location = window && window.location ? window.location : null;
    if (!location) return "";
    return `${location.origin || ""}${location.pathname || ""}${location.search || ""}`;
  }

  function getCanonicalPdfRouteKey(routeKey = getPdfDocumentRouteKey()) {
    const value = String(routeKey || "");
    try {
      const url = new URL(value, window.location.href);
      Array.from(url.searchParams.keys()).forEach((key) => {
        if (/^(utm_|fbclid$|gclid$|msclkid$|mc_cid$|mc_eid$|igshid$|ref$|ref_src$|source$)/i.test(key)) {
          url.searchParams.delete(key);
        }
      });
      const search = url.searchParams.toString();
      return `${url.origin}${url.pathname}${search ? `?${search}` : ""}`;
    } catch (error) {
      return value
        .split("#")[0]
        .replace(/([?&])(?:utm_[^=&]+|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|source)=[^&#]*/gi, "$1")
        .replace(/\?&/g, "?")
        .replace(/&&+/g, "&")
        .replace(/[?&]+$/, "");
    }
  }

  function getPdfCacheRouteKeys(routeKey = getPdfDocumentRouteKey()) {
    const exact = String(routeKey || "");
    const canonical = getCanonicalPdfRouteKey(exact);
    return [exact, canonical].filter((key, index, list) => key && list.indexOf(key) === index);
  }

  function getChatStableRouteKey() {
    try {
      const url = new URL(window.location.href);
      // Chat apps are single-page apps. Their engine routeKey can change as titles,
      // app shells, or conversation state hydrate. The popup/sidebar sync should be
      // keyed to the actual conversation URL, not a transient scan signature.
      return `${url.origin}${url.pathname}`;
    } catch (error) {
      return getCurrentUrl().split("#")[0].split("?")[0];
    }
  }

  function isPdfUrl(url) {
    return /\.pdf(?:$|[?#])/i.test(String(url || ""));
  }

  function isPdfRouteLocked() {
    return isPdfUrl(window.location.href)
      || Boolean(document.querySelector("pdf-viewer, embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf'], iframe[src*='.pdf' i], .textLayer, [data-page-number]"));
  }

  function isCurrentPdfRouteForOcrControls() {
    return isPdfRouteLocked();
  }


  function getPdfOcrStore() {
    if (!window.__PAGEPILOT_PDF_OCR_CACHE__) {
      window.__PAGEPILOT_PDF_OCR_CACHE__ = Object.create(null);
    }
    return window.__PAGEPILOT_PDF_OCR_CACHE__;
  }

  function readPdfSessionCacheStore() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(PDF_SESSION_CACHE_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writePdfSessionCacheStore(store) {
    try {
      sessionStorage.setItem(PDF_SESSION_CACHE_STORAGE_KEY, JSON.stringify(store || {}));
      return true;
    } catch (error) {
      return false;
    }
  }

  function clampPdfRelativeValue(value, fallback = null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
  }

  function normalizePdfOcrBBox(box, fallbackPageWidth = 0, fallbackPageHeight = 0) {
    if (!box || typeof box !== "object") return null;
    const x0 = Number(box.x0 ?? box.left ?? box.x ?? 0);
    const y0 = Number(box.y0 ?? box.top ?? box.y ?? 0);
    const x1 = Number(box.x1 ?? (Number.isFinite(Number(box.width)) ? x0 + Number(box.width) : 0));
    const y1 = Number(box.y1 ?? (Number.isFinite(Number(box.height)) ? y0 + Number(box.height) : 0));
    const pageWidth = Number(box.pageWidth || fallbackPageWidth || 0);
    const pageHeight = Number(box.pageHeight || fallbackPageHeight || 0);
    if (!Number.isFinite(y0) || !Number.isFinite(y1) || y1 <= y0) return null;
    return {
      x0: Number.isFinite(x0) ? Math.max(0, x0) : 0,
      y0: Math.max(0, y0),
      x1: Number.isFinite(x1) && x1 > x0 ? x1 : Number.isFinite(x0) ? x0 : 0,
      y1,
      pageWidth,
      pageHeight
    };
  }

  function hashPdfOcrTextForId(text) {
    const value = String(text || "");
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function getPdfOcrContextSourcePageSize(context = {}, fallbackWidth = 0, fallbackHeight = 0) {
    const cropBox = context.cropBox && typeof context.cropBox === "object" ? context.cropBox : null;
    const cropOffsetX = Number(context.cropOffsetX ?? (cropBox && cropBox.x) ?? (cropBox && cropBox.left) ?? 0) || 0;
    const cropOffsetY = Number(context.cropOffsetY ?? (cropBox && cropBox.y) ?? (cropBox && cropBox.top) ?? 0) || 0;
    const cropWidth = Number(context.cropWidth ?? (cropBox && cropBox.width) ?? 0) || 0;
    const cropHeight = Number(context.cropHeight ?? (cropBox && cropBox.height) ?? 0) || 0;
    const pageWidth = Number(context.fullPageWidth || context.sourcePageWidth || context.pageWidth || 0)
      || (cropWidth ? cropOffsetX + cropWidth : 0)
      || Number(fallbackWidth || 0);
    const pageHeight = Number(context.fullPageHeight || context.sourcePageHeight || context.pageHeight || 0)
      || (cropHeight ? cropOffsetY + cropHeight : 0)
      || Number(fallbackHeight || 0);
    return {
      pageWidth,
      pageHeight,
      cropOffsetX,
      cropOffsetY,
      cropWidth,
      cropHeight
    };
  }

  function normalizePdfOcrRotation(rotation) {
    const value = Number(rotation) || 0;
    const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
    return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
  }

  function rotatePdfOcrBBoxForDisplay(box, rotation = 0) {
    const source = normalizePdfOcrBBox(box, box && box.pageWidth, box && box.pageHeight);
    if (!source) return null;
    const pageWidth = Number(source.pageWidth) || 0;
    const pageHeight = Number(source.pageHeight) || 0;
    const normalizedRotation = normalizePdfOcrRotation(rotation);
    if (!normalizedRotation || !pageWidth || !pageHeight) return source;
    if (normalizedRotation === 90) {
      return normalizePdfOcrBBox({
        x0: pageHeight - source.y1,
        y0: source.x0,
        x1: pageHeight - source.y0,
        y1: source.x1,
        pageWidth: pageHeight,
        pageHeight: pageWidth
      }, pageHeight, pageWidth);
    }
    if (normalizedRotation === 180) {
      return normalizePdfOcrBBox({
        x0: pageWidth - source.x1,
        y0: pageHeight - source.y1,
        x1: pageWidth - source.x0,
        y1: pageHeight - source.y0,
        pageWidth,
        pageHeight
      }, pageWidth, pageHeight);
    }
    if (normalizedRotation === 270) {
      return normalizePdfOcrBBox({
        x0: source.y0,
        y0: pageWidth - source.x1,
        x1: source.y1,
        y1: pageWidth - source.x0,
        pageWidth: pageHeight,
        pageHeight: pageWidth
      }, pageHeight, pageWidth);
    }
    return source;
  }

  function mapPdfOcrBBoxToFullPage(box, context = {}, fallbackPageWidth = 0, fallbackPageHeight = 0) {
    const raw = normalizePdfOcrBBox(box, fallbackPageWidth, fallbackPageHeight);
    if (!raw) return null;
    const size = getPdfOcrContextSourcePageSize(context, raw.pageWidth || fallbackPageWidth, raw.pageHeight || fallbackPageHeight);
    const canvasWidth = Number(context.canvasWidth || context.outputWidth || raw.pageWidth || fallbackPageWidth || 0);
    const canvasHeight = Number(context.canvasHeight || context.outputHeight || raw.pageHeight || fallbackPageHeight || 0);
    const cropWidth = Number(context.cropWidth || size.cropWidth || size.pageWidth || raw.pageWidth || canvasWidth || 0);
    const cropHeight = Number(context.cropHeight || size.cropHeight || size.pageHeight || raw.pageHeight || canvasHeight || 0);
    const scaleX = Number(context.outputScaleX || context.scaleX || 0) || (canvasWidth && cropWidth ? canvasWidth / cropWidth : 1);
    const scaleY = Number(context.outputScaleY || context.scaleY || 0) || (canvasHeight && cropHeight ? canvasHeight / cropHeight : 1);
    const safeScaleX = scaleX > 0 ? scaleX : 1;
    const safeScaleY = scaleY > 0 ? scaleY : 1;
    const pageWidth = size.pageWidth || cropWidth || raw.pageWidth || fallbackPageWidth || 0;
    const pageHeight = size.pageHeight || cropHeight || raw.pageHeight || fallbackPageHeight || 0;
    const mapped = normalizePdfOcrBBox({
      x0: raw.x0 / safeScaleX + size.cropOffsetX,
      y0: raw.y0 / safeScaleY + size.cropOffsetY,
      x1: raw.x1 / safeScaleX + size.cropOffsetX,
      y1: raw.y1 / safeScaleY + size.cropOffsetY,
      pageWidth,
      pageHeight
    }, pageWidth, pageHeight);
    if (!mapped) return null;
    if (context.applyRotationToOcrCoordinates === true || context.rotationAppliedToCanvas === false) {
      return rotatePdfOcrBBoxForDisplay(mapped, context.rotation);
    }
    return mapped;
  }

  function mapPdfOcrWordsToFullPage(words, context = {}, fallbackPageWidth = 0, fallbackPageHeight = 0) {
    if (!Array.isArray(words)) return [];
    return words
      .map((word, index) => {
        const text = String(word && (word.text || word.rawValue) || "").replace(/\s+/g, " ").trim();
        const bbox = mapPdfOcrBBoxToFullPage(word && (word.bbox || word.boundingBox || word.box), context, fallbackPageWidth, fallbackPageHeight);
        if (!text && !bbox) return null;
        return {
          text: text.slice(0, 80),
          bbox,
          confidence: Number.isFinite(Number(word && word.confidence)) ? Math.round(Number(word.confidence)) : 0,
          order: Number.isFinite(Number(word && word.order)) ? Number(word.order) : index
        };
      })
      .filter(Boolean)
      .slice(0, 180);
  }

  function makePdfOcrSourceLineId(context = {}, lineIndex = 0, text = "") {
    const pageNumber = Number(context.pageNumber) || 1;
    const variantName = String(context.ocrVariantName || context.recognitionVariant || context.variantName || "ocr").replace(/[^a-z0-9_-]+/gi, "-");
    return `ocr-line-${pageNumber}-${variantName}-${Math.max(0, Number(lineIndex) || 0)}-${hashPdfOcrTextForId(text).slice(0, 10)}`;
  }

  function normalizePdfOcrWordBoxes(words, pageWidth = 0, pageHeight = 0) {
    if (!Array.isArray(words)) return [];
    return words
      .map((word, index) => {
        const text = String(word && (word.text || word.rawValue) || "").replace(/\s+/g, " ").trim();
        const bbox = normalizePdfOcrBBox(word && (word.bbox || word.boundingBox || word.box), pageWidth, pageHeight);
        if (!text && !bbox) return null;
        return {
          text: text.slice(0, 80),
          bbox,
          confidence: Number.isFinite(Number(word && word.confidence)) ? Math.round(Number(word.confidence)) : 0,
          order: Number.isFinite(Number(word && word.order)) ? Number(word.order) : index
        };
      })
      .filter(Boolean)
      .slice(0, 180);
  }

  function normalizePdfOcrGeometry(value, fallback = {}) {
    const source = value && value.ocrGeometry && typeof value.ocrGeometry === "object" ? value.ocrGeometry : value;
    if (!source || typeof source !== "object") return null;
    const pageWidth = Number(source.pageWidth || fallback.pageWidth || 0);
    const pageHeight = Number(source.pageHeight || fallback.pageHeight || 0);
    const bbox = normalizePdfOcrBBox(source.bbox || source.ocrBoundingBox || source.boundingBox || source.box, pageWidth, pageHeight);
    const wordBoxes = normalizePdfOcrWordBoxes(source.wordBoxes || source.words, bbox && bbox.pageWidth || pageWidth, bbox && bbox.pageHeight || pageHeight);
    const start = bbox && bbox.pageHeight > 0
      ? clampPdfRelativeValue(bbox.y0 / bbox.pageHeight, null)
      : clampPdfRelativeValue(source.relativeYStart, null);
    const end = bbox && bbox.pageHeight > 0
      ? clampPdfRelativeValue(bbox.y1 / bbox.pageHeight, null)
      : clampPdfRelativeValue(source.relativeYEnd, null);
    const center = Number.isFinite(Number(source.relativeY))
      ? clampPdfRelativeValue(source.relativeY, null)
      : start !== null && end !== null
        ? clampPdfRelativeValue((start + end) / 2, null)
        : null;
    if (!bbox && center === null && start === null && end === null && !wordBoxes.length) return null;
    const safeStart = start !== null ? start : center !== null ? Math.max(0.02, center - 0.025) : null;
    const safeEnd = end !== null ? end : center !== null ? Math.min(0.98, center + 0.09) : null;
    const exact = Boolean(bbox && (source.exact || source.exactGeometry || source.ocrExactGeometry || ((bbox.pageHeight || pageHeight) && source.approximate !== true)));
    return {
      bbox,
      pageWidth: bbox && bbox.pageWidth || pageWidth || 0,
      pageHeight: bbox && bbox.pageHeight || pageHeight || 0,
      relativeY: center !== null ? center : safeStart !== null && safeEnd !== null ? clampPdfRelativeValue((safeStart + safeEnd) / 2, 0.14) : 0.14,
      relativeYStart: safeStart,
      relativeYEnd: safeEnd,
      wordBoxes,
      exact,
      approximate: !exact,
      ocrVariantName: String(source.ocrVariantName || source.recognitionVariant || source.variantName || fallback.ocrVariantName || "").slice(0, 80),
      sourceLineIds: Array.isArray(source.sourceLineIds) ? source.sourceLineIds.map((id) => String(id).slice(0, 140)).filter(Boolean).slice(0, 80) : [],
      sourceLineTextSample: String(source.sourceLineTextSample || source.rawText || "").replace(/\s+/g, " ").trim().slice(0, 260),
      cropOffset: source.cropOffset || fallback.cropOffset || null,
      renderScale: Number.isFinite(Number(source.renderScale || fallback.renderScale)) ? Number(source.renderScale || fallback.renderScale) : 0,
      rotation: Number.isFinite(Number(source.rotation || fallback.rotation)) ? Number(source.rotation || fallback.rotation) : 0
    };
  }

  function getPdfOcrLineGeometry(line) {
    if (!line || typeof line !== "object") return null;
    const pageWidth = Number(line.pageWidth || line.width || line.canvasWidth || 0);
    const pageHeight = Number(line.pageHeight || line.height || line.canvasHeight || 0);
    return normalizePdfOcrGeometry(line.ocrGeometry || {
      bbox: line.bbox || line.boundingBox || line.ocrBoundingBox,
      pageWidth,
      pageHeight,
      wordBoxes: line.wordBoxes || line.words,
      relativeY: line.relativeY,
      relativeYStart: line.relativeYStart,
      relativeYEnd: line.relativeYEnd,
      ocrVariantName: line.ocrVariantName || line.recognitionVariant,
      sourceLineIds: line.sourceLineId ? [line.sourceLineId] : line.sourceLineIds,
      sourceLineTextSample: line.text || line.rawText || "",
      cropOffset: line.cropOffset || null,
      renderScale: line.renderScale,
      rotation: line.rotation
    });
  }

  function mergePdfOcrGeometries(items) {
    const geometries = (items || []).map((item) => normalizePdfOcrGeometry(item && (item.ocrGeometry || item))).filter(Boolean);
    if (!geometries.length) return null;
    const starts = geometries.map((geometry) => geometry.relativeYStart).filter((value) => Number.isFinite(value));
    const ends = geometries.map((geometry) => geometry.relativeYEnd).filter((value) => Number.isFinite(value));
    const centers = geometries.map((geometry) => geometry.relativeY).filter((value) => Number.isFinite(value));
    const boxes = geometries.map((geometry) => geometry.bbox).filter(Boolean);
    const sourceLineIds = Array.from(new Set(geometries.flatMap((geometry) => Array.isArray(geometry.sourceLineIds) ? geometry.sourceLineIds : []))).slice(0, 120);
    const variantNames = Array.from(new Set(geometries.map((geometry) => String(geometry.ocrVariantName || "")).filter(Boolean)));
    const pageHeight = boxes.find((box) => Number(box.pageHeight) > 0)?.pageHeight || geometries.find((geometry) => Number(geometry.pageHeight) > 0)?.pageHeight || 0;
    const pageWidth = boxes.find((box) => Number(box.pageWidth) > 0)?.pageWidth || geometries.find((geometry) => Number(geometry.pageWidth) > 0)?.pageWidth || 0;
    const bbox = boxes.length ? {
      x0: Math.min(...boxes.map((box) => box.x0)),
      y0: Math.min(...boxes.map((box) => box.y0)),
      x1: Math.max(...boxes.map((box) => box.x1)),
      y1: Math.max(...boxes.map((box) => box.y1)),
      pageWidth,
      pageHeight
    } : null;
    const start = starts.length ? Math.min(...starts) : bbox && pageHeight ? clampPdfRelativeValue(bbox.y0 / pageHeight, null) : null;
    const end = ends.length ? Math.max(...ends) : bbox && pageHeight ? clampPdfRelativeValue(bbox.y1 / pageHeight, null) : null;
    const center = start !== null && end !== null ? clampPdfRelativeValue((start + end) / 2, 0.14) : centers.length ? centers.reduce((sum, value) => sum + value, 0) / centers.length : 0.14;
    return {
      bbox,
      pageWidth,
      pageHeight,
      relativeY: clampPdfRelativeValue(center, 0.14),
      relativeYStart: start,
      relativeYEnd: end,
      wordBoxes: geometries.flatMap((geometry) => geometry.wordBoxes || []).slice(0, 180),
      exact: Boolean(bbox && pageHeight && variantNames.length <= 1),
      approximate: !Boolean(bbox && pageHeight && variantNames.length <= 1),
      ocrVariantName: variantNames.length === 1 ? variantNames[0] : "",
      sourceLineIds,
      sourceLineTextSample: geometries.map((geometry) => geometry.sourceLineTextSample || "").filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 260),
      cropOffset: geometries.find((geometry) => geometry.cropOffset)?.cropOffset || null,
      renderScale: Number(geometries.find((geometry) => Number(geometry.renderScale) > 0)?.renderScale || 0),
      rotation: Number(geometries.find((geometry) => Number.isFinite(Number(geometry.rotation)))?.rotation || 0)
    };
  }

  function isPdfOcrExactGeometryUsable(geometry, options = {}) {
    const normalized = normalizePdfOcrGeometry(geometry);
    const bbox = normalized && normalized.bbox;
    if (!bbox) return false;
    const pageWidth = Number(bbox.pageWidth || normalized.pageWidth || 0);
    const pageHeight = Number(bbox.pageHeight || normalized.pageHeight || 0);
    if (!pageWidth || !pageHeight) return false;
    const width = Number(bbox.x1) - Number(bbox.x0);
    const height = Number(bbox.y1) - Number(bbox.y0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 1 || height <= 1) return false;
    const areaRatio = (width * height) / Math.max(1, pageWidth * pageHeight);
    const heightRatio = height / pageHeight;
    const widthRatio = width / pageWidth;
    const maxAreaRatio = Number.isFinite(Number(options.maxAreaRatio)) ? Number(options.maxAreaRatio) : 0.48;
    const maxHeightRatio = Number.isFinite(Number(options.maxHeightRatio)) ? Number(options.maxHeightRatio) : 0.46;
    if (areaRatio < 0.00002 || areaRatio > maxAreaRatio) return false;
    if (heightRatio > maxHeightRatio || widthRatio > 0.98) return false;
    if (bbox.x0 < -1 || bbox.y0 < -1 || bbox.x1 > pageWidth + 1 || bbox.y1 > pageHeight + 1) return false;
    const wordBoxes = Array.isArray(normalized.wordBoxes) ? normalized.wordBoxes.filter((word) => word && word.bbox) : [];
    const requireWords = options.requireWords === true;
    if (requireWords && !wordBoxes.length) return false;
    if (wordBoxes.length) {
      const wordArea = wordBoxes.reduce((sum, word) => {
        const box = normalizePdfOcrBBox(word && word.bbox, pageWidth, pageHeight);
        if (!box) return sum;
        return sum + Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
      }, 0);
      const fillRatio = wordArea / Math.max(1, width * height);
      if (fillRatio < 0.002) return false;
    }
    return true;
  }

  function normalizePdfOcrSourceLine(line, index = 0) {
    if (!line || typeof line !== "object") return null;
    const text = normalizePdfOcrLineTextSpacing(line.text || line.rawText || "");
    if (!text) return null;
    const geometry = getPdfOcrLineGeometry(line);
    const sourceLineIds = Array.isArray(line.sourceLineIds) && line.sourceLineIds.length
      ? line.sourceLineIds.map((id) => String(id).slice(0, 140)).filter(Boolean)
      : geometry && Array.isArray(geometry.sourceLineIds) && geometry.sourceLineIds.length
        ? geometry.sourceLineIds.map((id) => String(id).slice(0, 140)).filter(Boolean)
        : line.id ? [String(line.id).slice(0, 140)] 
        : [];
    const id = String(line.sourceLineId || line.id || sourceLineIds[0] || `ocr-source-line-${index}`).slice(0, 140);
    const lineIndex = Number.isFinite(Number(line.lineIndex)) ? Number(line.lineIndex) : Number.isFinite(Number(line.order)) ? Number(line.order) : index;
    return {
      id,
      text,
      rawText: String(line.rawText || line.text || text).slice(0, 500),
      lineIndex,
      pageNumber: Number(line.pageNumber) || 1,
      confidence: Number.isFinite(Number(line.confidence)) ? Math.round(Number(line.confidence)) : 0,
      bbox: geometry && geometry.bbox || null,
      pageWidth: geometry && geometry.pageWidth || Number(line.pageWidth) || 0,
      pageHeight: geometry && geometry.pageHeight || Number(line.pageHeight) || 0,
      wordBoxes: geometry && geometry.wordBoxes || [],
      ocrGeometry: geometry,
      ocrVariantName: String(line.ocrVariantName || line.recognitionVariant || geometry && geometry.ocrVariantName || "").slice(0, 80),
      sourceLineIds: sourceLineIds.length ? sourceLineIds : [id],
      sourceBBox: line.sourceBBox || null,
      cropOffset: line.cropOffset || geometry && geometry.cropOffset || null,
      renderScale: Number.isFinite(Number(line.renderScale || geometry && geometry.renderScale)) ? Number(line.renderScale || geometry && geometry.renderScale) : 0,
      rotation: Number.isFinite(Number(line.rotation || geometry && geometry.rotation)) ? Number(line.rotation || geometry && geometry.rotation) : 0
    };
  }

  function normalizePdfOcrSourceLines(lines, limit = 120) {
    if (!Array.isArray(lines)) return [];
    const seen = new Set();
    return lines
      .map((line, index) => normalizePdfOcrSourceLine(line, index))
      .filter((line) => {
        if (!line || seen.has(line.id)) return false;
        seen.add(line.id);
        return true;
      })
      .sort((a, b) => (a.pageNumber - b.pageNumber) || (a.lineIndex - b.lineIndex))
      .slice(0, Math.max(1, Number(limit) || 120));
  }

  function mergePdfOcrLineBackedGeometry(lines) {
    const sourceLines = normalizePdfOcrSourceLines(lines);
    if (!sourceLines.length) return null;
    const geometry = mergePdfOcrGeometries(sourceLines);
    if (!geometry) return null;
    const sourceLineIds = Array.from(new Set(sourceLines.flatMap((line) => line.sourceLineIds && line.sourceLineIds.length ? line.sourceLineIds : [line.id]).filter(Boolean))).slice(0, 120);
    const variantNames = Array.from(new Set(sourceLines.map((line) => String(line.ocrVariantName || "")).filter(Boolean)));
    return {
      ...geometry,
      exact: Boolean(geometry.exact && sourceLineIds.length && variantNames.length <= 1 && isPdfOcrExactGeometryUsable(geometry)),
      approximate: !Boolean(geometry.exact && sourceLineIds.length && variantNames.length <= 1 && isPdfOcrExactGeometryUsable(geometry)),
      ocrVariantName: variantNames.length === 1 ? variantNames[0] : geometry.ocrVariantName || "",
      sourceLineIds,
      sourceLineTextSample: sourceLines.map((line) => line.text || "").join(" ").replace(/\s+/g, " ").trim().slice(0, 260),
      ocrSourceLines: sourceLines
    };
  }

  function buildRecoveredPdfOcrLineBackedChunk(lines, role, cleanText, countWords, extra = {}) {
    const sourceLines = normalizePdfOcrSourceLines(lines);
    if (!sourceLines.length) return null;
    const text = cleanText(sourceLines.map((line) => line.text).join(" "));
    const words = countWords(text);
    if (!text || words < 1) return null;
    const ocrGeometry = mergePdfOcrLineBackedGeometry(sourceLines);
    const sourceLineIds = Array.from(new Set(sourceLines.flatMap((line) => line.sourceLineIds && line.sourceLineIds.length ? line.sourceLineIds : [line.id]).filter(Boolean))).slice(0, 120);
    const variantNames = Array.from(new Set(sourceLines.map((line) => line.ocrVariantName).filter(Boolean)));
    const normalizedRole = normalizeRecoveredPdfOcrRole(role) || "unknown";
    const roleEvidence = getRecoveredPdfOcrRoleEvidence(normalizedRole, text, {
      sourceLines,
      words
    });
    const starts = sourceLines.map((line) => Number(line.ocrGeometry && line.ocrGeometry.relativeYStart)).filter((value) => Number.isFinite(value));
    const ends = sourceLines.map((line) => Number(line.ocrGeometry && line.ocrGeometry.relativeYEnd)).filter((value) => Number.isFinite(value));
    const centers = sourceLines.map((line) => Number(line.ocrGeometry && line.ocrGeometry.relativeY)).filter((value) => Number.isFinite(value));
    const center = ocrGeometry && Number.isFinite(ocrGeometry.relativeY)
      ? ocrGeometry.relativeY
      : centers.length ? centers.reduce((sum, value) => sum + value, 0) / centers.length : null;
    const exact = Boolean(ocrGeometry && ocrGeometry.exact && sourceLineIds.length && variantNames.length <= 1 && isPdfOcrExactGeometryUsable(ocrGeometry));
    return {
      ...extra,
      pageNumber: Number(extra.pageNumber) || sourceLines.find((line) => Number(line.pageNumber) > 0)?.pageNumber || 1,
      text,
      sectionText: text,
      words,
      ocrRole: normalizedRole,
      ocrRoleLabel: recoveredPdfOcrRoleLabel(normalizedRole),
      ocrRoleConfidence: roleEvidence.confidence,
      ocrRoleReasons: roleEvidence.reasons,
      relativeY: Number.isFinite(center) ? center : 0.12,
      relativeYStart: ocrGeometry && Number.isFinite(ocrGeometry.relativeYStart) ? ocrGeometry.relativeYStart : starts.length ? Math.min(...starts) : Number.isFinite(center) ? Math.max(0, center - 0.025) : null,
      relativeYEnd: ocrGeometry && Number.isFinite(ocrGeometry.relativeYEnd) ? ocrGeometry.relativeYEnd : ends.length ? Math.max(...ends) : Number.isFinite(center) ? Math.min(1, center + 0.09) : null,
      ocrGeometry,
      bbox: ocrGeometry && ocrGeometry.bbox || null,
      wordBoxes: ocrGeometry && ocrGeometry.wordBoxes || [],
      pageWidth: ocrGeometry && ocrGeometry.pageWidth || sourceLines.find((line) => Number(line.pageWidth) > 0)?.pageWidth || 0,
      pageHeight: ocrGeometry && ocrGeometry.pageHeight || sourceLines.find((line) => Number(line.pageHeight) > 0)?.pageHeight || 0,
      ocrVariantName: variantNames.length === 1 ? variantNames[0] : "",
      sourceLineIds,
      ocrSourceLines: sourceLines,
      sourceLineTextSample: sourceLines.map((line) => line.text || "").join(" ").replace(/\s+/g, " ").trim().slice(0, 260),
      ocrGeometryExact: exact,
      ocrHighlightApproximate: !exact,
      cropOffset: ocrGeometry && ocrGeometry.cropOffset || sourceLines.find((line) => line.cropOffset)?.cropOffset || null,
      renderScale: Number(ocrGeometry && ocrGeometry.renderScale || sourceLines.find((line) => Number(line.renderScale) > 0)?.renderScale || 0),
      rotation: Number(ocrGeometry && ocrGeometry.rotation || sourceLines.find((line) => Number.isFinite(Number(line.rotation)))?.rotation || 0),
      lineStart: Math.min(...sourceLines.map((line) => Number(line.lineIndex)).filter((value) => Number.isFinite(value))),
      lineEnd: Math.max(...sourceLines.map((line) => Number(line.lineIndex)).filter((value) => Number.isFinite(value)))
    };
  }

  function normalizePdfOcrLineTextSpacing(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[^\S\n]+/g, " ")
      .replace(/\s+([,.;:!?%])/g, "$1")
      .replace(/([([{])\s+/g, "$1")
      .replace(/\s+([)\]}])/g, "$1")
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Rev|St|Ref|No|Ltd|Limited|Co)\s*\./gi, "$1.")
      .replace(/\b([A-Z])\s*\.\s*(?=[A-Z]\s*\.|\b)/g, "$1. ")
      .replace(/([,;:!?])([A-Za-z0-9])/g, "$1 $2")
      .replace(/\.([A-Z][a-z])/g, ". $1")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function getPdfOcrLineSortMetrics(line, index = 0) {
    const geometry = getPdfOcrLineGeometry(line);
    const bbox = geometry && geometry.bbox || line && line.bbox || null;
    const pageHeight = Number(bbox && bbox.pageHeight || geometry && geometry.pageHeight || line && line.pageHeight || 0);
    const pageWidth = Number(bbox && bbox.pageWidth || geometry && geometry.pageWidth || line && line.pageWidth || 0);
    const y0 = Number.isFinite(Number(bbox && bbox.y0)) ? Number(bbox.y0) : Number.isFinite(Number(line && line.relativeYStart)) && pageHeight ? Number(line.relativeYStart) * pageHeight : null;
    const y1 = Number.isFinite(Number(bbox && bbox.y1)) ? Number(bbox.y1) : Number.isFinite(Number(line && line.relativeYEnd)) && pageHeight ? Number(line.relativeYEnd) * pageHeight : y0;
    const x0 = Number.isFinite(Number(bbox && bbox.x0)) ? Number(bbox.x0) : 0;
    const x1 = Number.isFinite(Number(bbox && bbox.x1)) ? Number(bbox.x1) : x0;
    const relativeY = Number.isFinite(Number(line && line.relativeY)) ? Number(line.relativeY) : geometry && Number.isFinite(Number(geometry.relativeY)) ? Number(geometry.relativeY) : null;
    const centerY = y0 !== null && y1 !== null ? (y0 + y1) / 2 : relativeY !== null && pageHeight ? relativeY * pageHeight : index * 1000;
    const height = y0 !== null && y1 !== null ? Math.max(1, y1 - y0) : pageHeight ? Math.max(1, pageHeight * 0.018) : 12;
    return {
      index,
      pageNumber: Number(line && line.pageNumber) || 1,
      x0,
      x1,
      y0: y0 !== null ? y0 : centerY,
      y1: y1 !== null ? y1 : centerY + height,
      centerY,
      height,
      pageWidth,
      pageHeight,
      hasGeometry: Boolean(bbox || relativeY !== null)
    };
  }

  function getMedianPdfOcrLineHeight(lines) {
    const heights = (Array.isArray(lines) ? lines : [])
      .map((line, index) => getPdfOcrLineSortMetrics(line, index).height)
      .filter((height) => Number.isFinite(height) && height > 0)
      .sort((a, b) => a - b);
    if (!heights.length) return 12;
    return heights[Math.floor(heights.length / 2)] || 12;
  }

  function sortPdfOcrLinesByReadingOrder(lines) {
    if (!Array.isArray(lines) || lines.length < 2) return Array.isArray(lines) ? lines.slice() : [];
    const medianHeight = getMedianPdfOcrLineHeight(lines);
    const rowTolerance = Math.max(6, medianHeight * 0.72);
    const items = lines.map((line, index) => ({
      line,
      metrics: getPdfOcrLineSortMetrics(line, index)
    }));
    items.sort((a, b) => {
      if (a.metrics.pageNumber !== b.metrics.pageNumber) return a.metrics.pageNumber - b.metrics.pageNumber;
      const sameRow = Math.abs(a.metrics.centerY - b.metrics.centerY) <= rowTolerance;
      if (!sameRow) return a.metrics.centerY - b.metrics.centerY;
      if (Math.abs(a.metrics.x0 - b.metrics.x0) > 2) return a.metrics.x0 - b.metrics.x0;
      return a.metrics.index - b.metrics.index;
    });
    const rows = [];
    items.forEach((item) => {
      const current = rows[rows.length - 1];
      if (!current || current.pageNumber !== item.metrics.pageNumber || Math.abs(current.centerY - item.metrics.centerY) > rowTolerance) {
        rows.push({
          pageNumber: item.metrics.pageNumber,
          centerY: item.metrics.centerY,
          items: [item]
        });
        return;
      }
      current.items.push(item);
      current.centerY = (current.centerY * (current.items.length - 1) + item.metrics.centerY) / current.items.length;
    });
    return rows.flatMap((row) => row.items.sort((a, b) => a.metrics.x0 - b.metrics.x0 || a.metrics.index - b.metrics.index).map((item) => item.line));
  }

  function isPdfOcrProtectedHyphenJoin(leftText, rightText) {
    const leftToken = String(leftText || "").trim().split(/\s+/).pop() || "";
    const rightToken = String(rightText || "").trim().split(/\s+/)[0] || "";
    const combined = `${leftToken}${rightToken}`.replace(/^-|-$/g, "");
    if (!leftToken || !rightToken) return true;
    if (/\d/.test(leftToken) || /\d/.test(rightToken)) return true;
    if (/[A-Z]{2,}/.test(leftToken) || /^[A-Z]{2,}/.test(rightToken)) return true;
    if (/[/.]/.test(leftToken) || /[/.]/.test(rightToken)) return true;
    if (/^[A-Z][a-z]+-$/.test(leftToken) && /^[A-Z][a-z]+/.test(rightToken)) return true;
    if (combined.length < 5) return true;
    return false;
  }

  function joinPdfOcrLineTexts(leftText, rightText) {
    const left = normalizePdfOcrLineTextSpacing(leftText);
    const right = normalizePdfOcrLineTextSpacing(rightText);
    if (!left) return right;
    if (!right) return left;
    if (/-$/.test(left) && /^[A-Za-z]/.test(right) && !isPdfOcrProtectedHyphenJoin(left, right)) {
      return normalizePdfOcrLineTextSpacing(`${left.slice(0, -1)}${right}`);
    }
    return normalizePdfOcrLineTextSpacing(`${left} ${right}`);
  }

  function shouldJoinPdfOcrWrappedLine(previousLine, nextLine, context = {}) {
    if (!previousLine || !nextLine) return false;
    const previous = normalizePdfOcrLineTextSpacing(previousLine.text || previousLine.rawText || "");
    const next = normalizePdfOcrLineTextSpacing(nextLine.text || nextLine.rawText || "");
    if (!previous || !next) return false;
    if (isRecoveredPdfOcrGreetingLine(previous) || isRecoveredPdfOcrClosingLine(previous) || isRecoveredPdfOcrClosingLine(next)) return false;
    if (/^(?:our\s+ref|your\s+ref|ref(?:erence)?\.?|date|telephone|telex|fax)\b/i.test(previous)) return false;
    if (!/-$/.test(previous) && (startsWithRecoveredPdfOcrAdministrativeText(previous) || startsWithRecoveredPdfOcrAdministrativeText(next))) return false;
    const previousMetrics = getPdfOcrLineSortMetrics(previousLine, Number(context.previousIndex) || 0);
    const nextMetrics = getPdfOcrLineSortMetrics(nextLine, Number(context.nextIndex) || previousMetrics.index + 1);
    if (previousMetrics.pageNumber !== nextMetrics.pageNumber) return false;
    const medianHeight = Number(context.medianHeight) || Math.max(previousMetrics.height, nextMetrics.height, 12);
    const verticalGap = Math.max(0, nextMetrics.y0 - previousMetrics.y1);
    if (verticalGap > Math.max(18, medianHeight * 1.7)) return false;
    const sameRowFragment = Math.abs(previousMetrics.centerY - nextMetrics.centerY) <= Math.max(4, medianHeight * 0.45)
      && nextMetrics.x0 >= previousMetrics.x1
      && (nextMetrics.x0 - previousMetrics.x1) <= Math.max(28, Math.min(160, (previousMetrics.pageWidth || nextMetrics.pageWidth || 800) * 0.2));
    if (sameRowFragment && !/[.!?;:]$/.test(previous)) return true;
    const leftDelta = Math.abs(nextMetrics.x0 - previousMetrics.x0);
    const indentForward = nextMetrics.x0 > previousMetrics.x0 + Math.max(18, medianHeight * 1.4);
    const sameColumn = leftDelta <= Math.max(32, medianHeight * 3.4) || indentForward;
    if (!sameColumn && !/-$/.test(previous)) return false;
    if (/-$/.test(previous) && /^[A-Za-z]/.test(next)) return !isPdfOcrProtectedHyphenJoin(previous, next);
    if (/[.!?;:]$/.test(previous)) return false;
    if (/^[a-z,;:)]/.test(next)) return true;
    if (/\b(?:and|or|but|that|which|with|for|to|of|in|on|from|because|therefore|please|regarding)\b/i.test(next.split(/\s+/).slice(0, 2).join(" "))) return true;
    const previousWords = countPdfWords(previous);
    const nextWords = countPdfWords(next);
    return previousWords >= 5 && nextWords >= 3 && nextWords <= 22 && verticalGap <= Math.max(10, medianHeight * 1.05);
  }

  function getPdfOcrReadableWordRatio(text) {
    const tokens = String(text || "").match(/[A-Za-z0-9][A-Za-z0-9'./-]*/g) || [];
    if (!tokens.length) return 0;
    let readable = 0;
    tokens.forEach((token) => {
      const value = String(token || "");
      if (/[A-Za-z]{2,}/.test(value)) {
        const letters = (value.match(/[A-Za-z]/g) || []).length;
        const noisy = (value.match(/[^A-Za-z0-9'./-]/g) || []).length;
        if (letters >= 2 && noisy === 0) readable += 1;
        return;
      }
      if (/^\d{1,4}(?:[./-]\d{1,4})*$/.test(value)) readable += 1;
      else if (/^[A-Z]{1,6}\d{1,6}[A-Z0-9/-]*$/i.test(value)) readable += 1;
    });
    return Math.max(0, Math.min(1, readable / tokens.length));
  }

  function getPdfOcrLineCoverage(lines) {
    const source = Array.isArray(lines) ? lines : [];
    const nonEmpty = source.filter((line) => String(line && (line.text || line.rawText) || "").trim());
    if (!nonEmpty.length) return 0;
    const withGeometry = nonEmpty.filter((line, index) => getPdfOcrLineSortMetrics(line, index).hasGeometry);
    const confidences = nonEmpty.map((line) => Number(line && line.confidence)).filter((value) => Number.isFinite(value) && value > 0);
    const confidenceFactor = confidences.length
      ? Math.max(0.35, Math.min(1, (confidences.reduce((sum, value) => sum + value, 0) / confidences.length) / 85))
      : 0.55;
    const geometryFactor = withGeometry.length / nonEmpty.length;
    const lineFactor = Math.min(1, nonEmpty.length / 8);
    return Math.max(0, Math.min(1, lineFactor * 0.35 + geometryFactor * 0.35 + confidenceFactor * 0.3));
  }

  function getPdfOcrPageCoverage(lines) {
    const source = Array.isArray(lines) ? lines : [];
    const metrics = source
      .map((line, index) => getPdfOcrLineSortMetrics(line, index))
      .filter((metric) => metric && metric.hasGeometry && metric.pageHeight > 0);
    if (!metrics.length) {
      return {
        score: 0,
        verticalSpan: 0,
        hasUpper: false,
        hasMiddle: false,
        hasLower: false,
        top: null,
        bottom: null
      };
    }
    const relativeStarts = metrics.map((metric) => Math.max(0, Math.min(1, metric.y0 / Math.max(1, metric.pageHeight))));
    const relativeEnds = metrics.map((metric) => Math.max(0, Math.min(1, metric.y1 / Math.max(1, metric.pageHeight))));
    const top = Math.min(...relativeStarts);
    const bottom = Math.max(...relativeEnds);
    const verticalSpan = Math.max(0, bottom - top);
    const hasUpper = relativeStarts.some((value) => value <= 0.28);
    const hasMiddle = metrics.some((metric) => {
      const center = Math.max(0, Math.min(1, metric.centerY / Math.max(1, metric.pageHeight)));
      return center >= 0.32 && center <= 0.68;
    });
    const hasLower = relativeEnds.some((value) => value >= 0.72);
    const regionScore = (hasUpper ? 0.24 : 0) + (hasMiddle ? 0.34 : 0) + (hasLower ? 0.24 : 0);
    const spanScore = Math.min(0.18, verticalSpan * 0.24);
    return {
      score: Math.max(0, Math.min(1, regionScore + spanScore)),
      verticalSpan: Math.round(verticalSpan * 1000) / 1000,
      hasUpper,
      hasMiddle,
      hasLower,
      top: Math.round(top * 1000) / 1000,
      bottom: Math.round(bottom * 1000) / 1000
    };
  }

  function getPdfOcrParagraphContinuity(text, lines = []) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    const words = countPdfWords(value);
    if (!words) return 0;
    const lineTexts = (Array.isArray(lines) ? lines : []).map((line) => String(line && (line.text || line.rawText) || "").trim()).filter(Boolean);
    const substantiveLines = lineTexts.filter((line) => countPdfWords(line) >= 5).length;
    const sentenceCount = (value.match(/[.!?](?:\s|$)/g) || []).length;
    const continuationHits = countPatternHits(value, /\b(?:because|therefore|which|that|please|regarding|enclosed|permit me|i would like|as a result|this signal|in facsimile|at the|remote terminal)\b/gi);
    const lineScore = Math.min(0.36, substantiveLines / 10);
    const sentenceScore = Math.min(0.28, sentenceCount / 8);
    const continuationScore = Math.min(0.26, continuationHits / 8);
    const lengthScore = Math.min(0.1, words / 180);
    return Math.max(0, Math.min(1, lineScore + sentenceScore + continuationScore + lengthScore));
  }

  function getPdfOcrTextCompletenessScore(text, lines, structure, pageCoverage, paragraphContinuity, confidence) {
    const words = countPdfWords(text);
    let score = 0;
    score += Math.min(0.22, words / 460);
    score += Math.min(0.18, (Array.isArray(lines) ? lines.length : 0) / 80);
    score += Math.max(0, Math.min(1, pageCoverage && pageCoverage.score || 0)) * 0.22;
    score += Math.max(0, Math.min(1, paragraphContinuity || 0)) * 0.18;
    score += Math.max(0, Math.min(1, (Number(confidence) || 0) / 100)) * 0.1;
    if (structure && structure.complete) score += 0.1;
    return Math.max(0, Math.min(1, score));
  }

  function hasPdfOcrLikelyAdministrativeBodyPrefix(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return false;
    const words = value.split(/\s+/).slice(0, 18).join(" ");
    return startsWithRecoveredPdfOcrAdministrativeText(words)
      || /\b(?:mining surveys|surveys ltd|holroyd|holy\s+road|reading|berks|telephone|telex|our\s+ref|your\s+ref)\b/i.test(words);
  }

  function getPdfOcrMissedRegionLikely(candidate, structure, pageCoverage, paragraphContinuity, confidence) {
    const text = String(candidate && candidate.text || "");
    const source = String(candidate && candidate.source || "");
    const variant = String(candidate && (candidate.recognitionVariant || candidate.ocrVariantName) || "");
    const words = Number(candidate && candidate.words) || countPdfWords(text);
    const isVisibleOrUltra = /visible|ultra-fast/i.test(`${source} ${variant}`);
    const letterLike = Boolean(structure && structure.letterLike)
      || /\b(?:dear|our\s+ref|your\s+ref|telephone|telex|yours sincerely|yours faithfully|permit me to introduce)\b/i.test(text);
    const hasGreeting = /\bdear\b/i.test(text);
    const hasClosing = /\b(?:yours sincerely|yours faithfully|sincerely|faithfully)\b/i.test(text);
    const lowConfidence = Number(confidence) > 0 && Number(confidence) < 68;
    const weakCoverage = !pageCoverage || pageCoverage.score < 0.62 || !pageCoverage.hasMiddle || (letterLike && !pageCoverage.hasLower);
    const weakContinuity = paragraphContinuity < 0.38 && words >= PDF_RECOVERY_MIN_WORDS;
    const adminBody = Boolean(structure && structure.administrativePrefix);
    return Boolean(
      words >= PDF_RECOVERY_MIN_WORDS
      && (
        (isVisibleOrUltra && (lowConfidence || weakCoverage || weakContinuity))
        || (letterLike && hasGreeting && !hasClosing && isVisibleOrUltra && words < 180)
        || (letterLike && adminBody)
      )
    );
  }

  function evaluatePdfOcrTextQuality(candidate, structure = null) {
    const text = String(candidate && candidate.text || "");
    const lines = Array.isArray(candidate && candidate.lines) ? candidate.lines : [];
    const words = Number(candidate && candidate.words) || countPdfWords(text);
    const confidence = Number(candidate && candidate.confidence) || averageLineConfidence(lines);
    const readableWordRatio = getPdfOcrReadableWordRatio(text);
    const lineCoverage = getPdfOcrLineCoverage(lines);
    const pageCoverageDetails = getPdfOcrPageCoverage(lines);
    const pageCoverage = pageCoverageDetails.score;
    const paragraphContinuity = getPdfOcrParagraphContinuity(text, lines);
    const textCompleteness = getPdfOcrTextCompletenessScore(text, lines, structure, pageCoverageDetails, paragraphContinuity, confidence);
    const lineTexts = lines.map((line) => String(line && line.text || "").trim()).filter(Boolean);
    const repeated = getRepeatedPdfLineCount(lineTexts);
    const shortLines = lineTexts.filter((line) => countPdfWords(line) <= 2).length;
    const noisyLines = lineTexts.filter((line) => {
      const clean = line.replace(/\s+/g, "");
      if (!clean) return false;
      const symbolCount = (clean.match(/[^A-Za-z0-9.,;:'"()/&-]/g) || []).length;
      const letterCount = (clean.match(/[A-Za-z]/g) || []).length;
      return symbolCount >= Math.max(2, clean.length * 0.18) || (clean.length >= 8 && letterCount > 0 && letterCount < clean.length * 0.34);
    }).length;
    const fragmentRatio = lineTexts.length ? shortLines / lineTexts.length : words ? 0.35 : 1;
    const noiseRatio = lineTexts.length ? noisyLines / lineTexts.length : 0;
    const missedRegionLikely = getPdfOcrMissedRegionLikely(candidate, structure, pageCoverageDetails, paragraphContinuity, confidence);
    const corrupted = Boolean(
      words > 0
      && (
        readableWordRatio < 0.55
        || fragmentRatio > 0.7
        || noiseRatio > 0.36
        || repeated >= Math.max(3, Math.ceil(lineTexts.length * 0.34))
      )
    );
    const completeStructure = structure
      ? Boolean(structure.complete)
      : words >= PDF_RECOVERY_MIN_WORDS;
    const readable = Boolean(words >= PDF_OCR_SHORT_MEANINGFUL_WORDS && readableWordRatio >= 0.62 && lineCoverage >= 0.42 && confidence >= 54 && !corrupted);
    let score = 0;
    score += Math.min(30, words / 5);
    score += Math.min(25, confidence / 4);
    score += readableWordRatio * 25;
    score += lineCoverage * 15;
    score += pageCoverage * 12;
    score += paragraphContinuity * 10;
    score += textCompleteness * 12;
    if (structure && structure.complete) score += 18;
    if (structure && structure.oneLargeSection) score -= 18;
    if (structure && structure.administrativePrefix) score -= 18;
    if (structure && (structure.researchLike || structure.reportLike || structure.formLike) && structure.complete) score += 10;
    if (missedRegionLikely) score -= 26;
    if (corrupted) score -= 28;
    const complete = Boolean(readable && completeStructure && !missedRegionLikely && textCompleteness >= 0.48);
    const selectedVariantReason = corrupted
      ? "OCR text contains too much noise or fragmented output."
      : missedRegionLikely
        ? "OCR text appears incomplete or misses important page regions."
        : complete
          ? "OCR text is readable, structurally complete, and covers the page."
          : "OCR text is usable but not complete enough for an early stop.";
    return {
      readable,
      structurallyComplete: completeStructure,
      complete,
      corrupted,
      missedRegionLikely,
      readableWordRatio: Math.round(readableWordRatio * 1000) / 1000,
      lineCoverage: Math.round(lineCoverage * 1000) / 1000,
      pageCoverage: Math.round(pageCoverage * 1000) / 1000,
      pageCoverageDetails,
      paragraphContinuity: Math.round(paragraphContinuity * 1000) / 1000,
      textCompleteness: Math.round(textCompleteness * 1000) / 1000,
      fragmentRatio: Math.round(fragmentRatio * 1000) / 1000,
      noiseRatio: Math.round(noiseRatio * 1000) / 1000,
      repeatedLines: repeated,
      confidence: Math.round(confidence || 0),
      words,
      selectedVariantReason,
      score: Math.max(0, Math.min(100, Math.round(score)))
    };
  }

  function reconstructPdfOcrTextFromLines(lines, options = {}) {
    const normalized = normalizePdfRecoveryLines(lines);
    const ordered = sortPdfOcrLinesByReadingOrder(normalized).map((line, index) => ({ ...line, readingOrder: index }));
    if (!ordered.length) {
      const fallbackText = normalizePdfOcrLineTextSpacing(options.fallbackText || "");
      const quality = evaluatePdfOcrTextQuality({ text: fallbackText, lines: [], words: countPdfWords(fallbackText), confidence: 0 });
      return {
        text: fallbackText,
        reconstructedText: fallbackText,
        rawText: String(options.fallbackText || ""),
        lines: [],
        paragraphs: fallbackText ? [fallbackText] : [],
        stats: {
          lineCount: 0,
          paragraphCount: fallbackText ? 1 : 0,
          joinedLines: 0,
          hyphenatedJoins: 0,
          ...quality
        }
      };
    }
    const medianHeight = getMedianPdfOcrLineHeight(ordered);
    const paragraphs = [];
    const paragraphLineIds = [];
    let current = "";
    let currentIds = [];
    let joinedLines = 0;
    let hyphenatedJoins = 0;
    ordered.forEach((line, index) => {
      const clean = normalizePdfOcrLineTextSpacing(line.text || line.rawText || "");
      if (!clean) return;
      const previous = index > 0 ? ordered[index - 1] : null;
      const join = current && previous && shouldJoinPdfOcrWrappedLine(previous, line, {
        medianHeight,
        previousIndex: index - 1,
        nextIndex: index
      });
      if (join) {
        if (/-$/.test(current)) hyphenatedJoins += 1;
        current = joinPdfOcrLineTexts(current, clean);
        currentIds = currentIds.concat(line.sourceLineIds && line.sourceLineIds.length ? line.sourceLineIds : line.sourceLineId ? [line.sourceLineId] : []);
        joinedLines += 1;
        return;
      }
      if (current) {
        paragraphs.push(current);
        paragraphLineIds.push(currentIds);
      }
      current = clean;
      currentIds = line.sourceLineIds && line.sourceLineIds.length ? line.sourceLineIds.slice() : line.sourceLineId ? [line.sourceLineId] : [];
    });
    if (current) {
      paragraphs.push(current);
      paragraphLineIds.push(currentIds);
    }
    const text = paragraphs.join("\n\n").trim();
    const confidence = averageLineConfidence(ordered);
    const quality = evaluatePdfOcrTextQuality({
      text,
      lines: ordered,
      words: countPdfWords(text),
      confidence
    });
    return {
      text,
      reconstructedText: text,
      rawText: String(options.fallbackText || ordered.map((line) => line.rawText || line.text || "").join("\n")).trim(),
      lines: ordered,
      paragraphs,
      paragraphLineIds,
      stats: {
        lineCount: ordered.length,
        paragraphCount: paragraphs.length,
        joinedLines,
        hyphenatedJoins,
        ...quality
      }
    };
  }

  function normalizePdfRecoveryLines(lines) {
    if (!Array.isArray(lines)) return [];
    return lines
      .map((line, index) => {
        const rawText = String(line && (line.rawText || line.text) || "");
        const text = normalizePdfOcrLineTextSpacing(line && line.text ? line.text : rawText);
        if (!text) return null;
        const geometry = getPdfOcrLineGeometry(line);
        const relativeY = Number(line && line.relativeY);
        const relativeYStart = Number(line && line.relativeYStart);
        const relativeYEnd = Number(line && line.relativeYEnd);
        const safeRelativeY = Number.isFinite(relativeY) ? Math.max(0, Math.min(1, relativeY)) : geometry && Number.isFinite(geometry.relativeY) ? geometry.relativeY : null;
        const safeStart = Number.isFinite(relativeYStart) ? Math.max(0, Math.min(1, relativeYStart)) : geometry && Number.isFinite(geometry.relativeYStart) ? geometry.relativeYStart : null;
        const safeEnd = Number.isFinite(relativeYEnd) ? Math.max(0, Math.min(1, relativeYEnd)) : geometry && Number.isFinite(geometry.relativeYEnd) ? geometry.relativeYEnd : null;
        return {
          text,
          words: Number(line && line.words) || countPdfWords(text),
          relativeY: safeRelativeY,
          relativeYStart: safeStart !== null ? safeStart : safeRelativeY,
          relativeYEnd: safeEnd !== null ? safeEnd : safeRelativeY,
          confidence: Number.isFinite(Number(line && line.confidence)) ? Math.round(Number(line.confidence)) : 0,
          pageNumber: Number(line && line.pageNumber) || 1,
          bbox: geometry && geometry.bbox || null,
          pageWidth: geometry && geometry.pageWidth || 0,
          pageHeight: geometry && geometry.pageHeight || 0,
          wordBoxes: geometry && geometry.wordBoxes || [],
          ocrGeometry: geometry,
          ocrVariantName: String(line && (line.ocrVariantName || line.recognitionVariant) || geometry && geometry.ocrVariantName || "").slice(0, 80),
          sourceLineId: String(line && line.sourceLineId || geometry && geometry.sourceLineIds && geometry.sourceLineIds[0] || "").slice(0, 140),
          sourceLineIds: Array.isArray(line && line.sourceLineIds)
            ? line.sourceLineIds.map((id) => String(id).slice(0, 140)).filter(Boolean).slice(0, 12)
            : geometry && Array.isArray(geometry.sourceLineIds) ? geometry.sourceLineIds : [],
          rawText: rawText.slice(0, 500),
          sourceBBox: line && line.sourceBBox || null,
          cropOffset: line && line.cropOffset || geometry && geometry.cropOffset || null,
          renderScale: Number.isFinite(Number(line && line.renderScale || geometry && geometry.renderScale)) ? Number(line && line.renderScale || geometry && geometry.renderScale) : 0,
          rotation: Number.isFinite(Number(line && line.rotation || geometry && geometry.rotation)) ? Number(line && line.rotation || geometry && geometry.rotation) : 0,
          order: Number.isFinite(line && line.order) ? Number(line.order) : index
        };
      })
      .filter(Boolean);
  }

  function normalizePdfCacheEntry(entry) {
    if (!entry) return null;
    const source = entry.source || "pdfjs";
    const pages = normalizePdfRecoveryPages(entry.pages);
    const text = String(entry.text || pages.map((page) => page.text).join("\n\n")).trim();
    const words = Number(entry.words) || countPdfWords(text);
    if (words < 1 && !pages.length) return null;
    const quality = source === "ocr"
      ? getPdfOcrQuality({
          text,
          pages,
          words,
          ocrQuality: entry.ocrQuality,
          qualityMessage: entry.qualityMessage,
          qualityScore: entry.qualityScore,
          confidence: entry.confidence,
          pageDiagnostics: entry.pageDiagnostics
        })
      : { quality: "", message: "", score: 0 };
    const ocrStructure = source === "ocr"
      ? getPdfOcrStructureCompleteness({ text, pages, words, source: "ocr" })
      : null;
    return {
      text,
      pages,
      updatedAt: Number(entry.updatedAt) || Date.now(),
      source,
      partial: Boolean(entry.partial),
      pagesRead: Number(entry.pagesRead) || pages.length,
      words,
      rawText: String(entry.rawText || pages.map((page) => page.rawText || "").filter(Boolean).join("\n\n")).slice(0, 120000),
      reconstructedText: String(entry.reconstructedText || (isPdfOcrSourceType(source) ? text : "")).slice(0, 120000),
      ocrTextQuality: entry.ocrTextQuality && typeof entry.ocrTextQuality === "object"
        ? { ...entry.ocrTextQuality }
        : isPdfOcrSourceType(source) ? evaluatePdfOcrTextQuality({ text, lines: pages.flatMap((page) => page.lines || []), words, confidence: entry.confidence }) : null,
      numPages: Number(entry.numPages) || 0,
      ocrQuality: quality.quality,
      qualityMessage: quality.message,
      qualityScore: quality.score,
      confidence: Number.isFinite(Number(entry.confidence)) ? Math.round(Number(entry.confidence)) : 0,
      pageDiagnostics: Array.isArray(entry.pageDiagnostics) ? entry.pageDiagnostics.slice(0, 80) : [],
      fingerprint: normalizePdfFingerprint(entry.fingerprint),
      fileName: String(entry.fileName || getPdfFileNameFromRoute()).slice(0, 180),
      ocrMode: String(entry.ocrMode || entry.adaptiveMode || "").slice(0, 24),
      ocrStructure: ocrStructure ? {
        complete: Boolean(ocrStructure.complete),
        letterLike: Boolean(ocrStructure.letterLike),
        score: Number(ocrStructure.score) || 0,
        sections: Number(ocrStructure.sections) || 0,
        roleCounts: ocrStructure.roleCounts || {},
        bodyAfterGreeting: Boolean(ocrStructure.bodyAfterGreeting),
        administrativePrefix: Boolean(ocrStructure.administrativePrefix),
        oneLargeSection: Boolean(ocrStructure.oneLargeSection),
        bodyWords: Number(ocrStructure.bodyWords) || 0
      } : null,
      mapSnapshot: normalizePdfMapSnapshot(entry.mapSnapshot),
      cacheSource: String(entry.cacheSource || ""),
      cacheHit: Boolean(entry.cacheHit)
    };
  }

  function getPdfFileNameFromRoute(routeKey = "") {
    const value = String(routeKey || "");
    try {
      const url = new URL(value);
      const raw = url.pathname.split("/").filter(Boolean).pop() || "";
      return decodeURIComponent(raw).slice(0, 180);
    } catch (error) {
      const raw = value.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop() || "";
      try {
        return decodeURIComponent(raw).slice(0, 180);
      } catch (decodeError) {
        return raw.slice(0, 180);
      }
    }
  }

  function normalizePdfMapSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.sections)) return null;
    const sections = snapshot.sections
      .slice(0, 96)
      .map((section, index) => {
        const text = String(section && section.text || "").replace(/\s+/g, " ").trim();
        const title = String(section && section.title || "").replace(/\s+/g, " ").trim();
        const id = String(section && section.id || "").slice(0, 160);
        if (!text || !title || !id) return null;
        const pageNumber = Math.max(1, Math.round(Number(section.pageNumber || section.unitMeta && section.unitMeta.pageNumber || 1) || 1));
        const metrics = section.metrics && typeof section.metrics === "object" ? section.metrics : {};
        const unitMeta = section.unitMeta && typeof section.unitMeta === "object" ? section.unitMeta : {};
        return {
          id,
          title: title.slice(0, 240),
          text: text.slice(0, 7000),
          pageNumber,
          navigationTarget: String(section.navigationTarget || unitMeta.navigationTarget || `#page=${pageNumber}`).slice(0, 80),
          index: Number.isFinite(Number(section.index)) ? Number(section.index) : index,
          level: Number.isFinite(Number(section.level)) ? Number(section.level) : 2,
          wordCount: Number(section.wordCount) || countPdfWords(text),
          top: Number.isFinite(Number(section.top)) ? Number(section.top) : pageNumber * 100000 + index * 1000,
          score: Number.isFinite(Number(section.score)) ? Number(section.score) : 60,
          usefulScore: Number.isFinite(Number(section.usefulScore)) ? Number(section.usefulScore) : 40,
          importanceScore: Number.isFinite(Number(section.importanceScore)) ? Number(section.importanceScore) : Number(section.score) || 60,
          label: String(section.label || "").slice(0, 120),
          isImportant: Boolean(section.isImportant),
          isBest: Boolean(section.isBest),
          metrics: {
            sectionKind: String(metrics.sectionKind || "").slice(0, 80),
            sectionKindLabel: String(metrics.sectionKindLabel || "").slice(0, 120),
            pdfSectionType: String(metrics.pdfSectionType || unitMeta.pdfSectionType || "").slice(0, 80),
            ocrRole: String(metrics.ocrRole || unitMeta.ocrRole || "").slice(0, 80),
            ocrRoleLabel: String(metrics.ocrRoleLabel || unitMeta.ocrRoleLabel || "").slice(0, 120),
            selectionReason: String(metrics.selectionReason || "").slice(0, 240),
            matched: metrics.matched && typeof metrics.matched === "object" ? { ...metrics.matched } : {},
            intentScores: metrics.intentScores && typeof metrics.intentScores === "object" ? { ...metrics.intentScores } : null
          },
          unitMeta: {
            kind: String(unitMeta.kind || "pdfjs-page").slice(0, 80),
            sectionId: String(unitMeta.sectionId || id).slice(0, 160),
            pageNumber,
            pdfSectionType: String(unitMeta.pdfSectionType || metrics.pdfSectionType || "").slice(0, 80),
            ocrRole: String(unitMeta.ocrRole || metrics.ocrRole || "").slice(0, 80),
            ocrRoleLabel: String(unitMeta.ocrRoleLabel || metrics.ocrRoleLabel || "").slice(0, 120),
            diagnosticReason: String(unitMeta.diagnosticReason || metrics.selectionReason || "").slice(0, 240),
            chunkIndex: Number(unitMeta.chunkIndex) || 0,
            chunkCount: Number(unitMeta.chunkCount) || 1,
            relativeY: Number.isFinite(Number(unitMeta.relativeY)) ? Math.max(0, Math.min(1, Number(unitMeta.relativeY))) : 0.12,
            relativeYStart: Number.isFinite(Number(unitMeta.relativeYStart)) ? Math.max(0, Math.min(1, Number(unitMeta.relativeYStart))) : null,
            relativeYEnd: Number.isFinite(Number(unitMeta.relativeYEnd)) ? Math.max(0, Math.min(1, Number(unitMeta.relativeYEnd))) : null,
            ocrGeometry: normalizePdfOcrGeometry(unitMeta.ocrGeometry || section.ocrGeometry || null),
            ocrBoundingBox: normalizePdfOcrBBox(unitMeta.ocrBoundingBox || section.ocrBoundingBox || null),
            ocrExactGeometry: Boolean(unitMeta.ocrExactGeometry),
            ocrHighlightApproximate: Boolean(unitMeta.ocrHighlightApproximate),
            ocrVariantName: String(unitMeta.ocrVariantName || "").slice(0, 80),
            sourceLineIds: Array.isArray(unitMeta.sourceLineIds) ? unitMeta.sourceLineIds.map((id) => String(id).slice(0, 140)).filter(Boolean).slice(0, 120) : [],
            ocrSourceLines: normalizePdfOcrSourceLines(unitMeta.ocrSourceLines),
            sourceLineTextSample: String(unitMeta.sourceLineTextSample || "").replace(/\s+/g, " ").trim().slice(0, 260),
            sectionText: String(unitMeta.sectionText || text).slice(0, 7000),
            sectionTextSample: String(unitMeta.sectionTextSample || text.slice(0, 260)).replace(/\s+/g, " ").trim().slice(0, 260),
            ocrPageWidth: Number(unitMeta.ocrPageWidth || unitMeta.pageWidth || 0) || 0,
            ocrPageHeight: Number(unitMeta.ocrPageHeight || unitMeta.pageHeight || 0) || 0,
            cropOffset: unitMeta.cropOffset && typeof unitMeta.cropOffset === "object" ? unitMeta.cropOffset : null,
            renderScale: Number.isFinite(Number(unitMeta.renderScale)) ? Number(unitMeta.renderScale) : 0,
            rotation: Number.isFinite(Number(unitMeta.rotation)) ? Number(unitMeta.rotation) : 0,
            lineStart: Number(unitMeta.lineStart) || 0,
            lineEnd: Number(unitMeta.lineEnd) || 0,
            excerpt: String(unitMeta.excerpt || text.slice(0, 240)).slice(0, 300),
            navigationTarget: String(unitMeta.navigationTarget || `#page=${pageNumber}`).slice(0, 80),
            synthetic: true,
            pdfjs: unitMeta.pdfjs !== false && unitMeta.ocr !== true,
            ocr: Boolean(unitMeta.ocr),
            syntheticTop: Number(unitMeta.syntheticTop) || pageNumber * 100000 + index * 1000,
            words: Number(unitMeta.words) || countPdfWords(text)
          },
          intelligence: normalizeSectionIntelligenceForPublic(section, "pdf")
        };
      })
      .filter(Boolean);
    if (!sections.length) return null;
    return {
      version: 1,
      createdAt: Number(snapshot.createdAt) || Date.now(),
      routeKey: String(snapshot.routeKey || "").slice(0, 1000),
      bestSectionId: String(snapshot.bestSectionId || "").slice(0, 160),
      nextImportantId: String(snapshot.nextImportantId || "").slice(0, 160),
      skipTargetId: String(snapshot.skipTargetId || snapshot.bestSectionId || "").slice(0, 160),
      bestLabel: String(snapshot.bestLabel || "").slice(0, 160),
      bestKind: String(snapshot.bestKind || "").slice(0, 80),
      bestKindLabel: String(snapshot.bestKindLabel || "").slice(0, 120),
      confidence: Number.isFinite(Number(snapshot.confidence)) ? Math.round(Number(snapshot.confidence)) : 88,
      confidenceTier: String(snapshot.confidenceTier || "high").slice(0, 40),
      confidenceLabel: String(snapshot.confidenceLabel || "PDF mapped").slice(0, 80),
      savedMinutes: Number.isFinite(Number(snapshot.savedMinutes)) ? Math.max(1, Math.round(Number(snapshot.savedMinutes))) : 1,
      readingMinutes: Number.isFinite(Number(snapshot.readingMinutes)) ? Math.max(1, Math.round(Number(snapshot.readingMinutes))) : 1,
      totalReadableWords: Number(snapshot.totalReadableWords) || sections.reduce((sum, section) => sum + section.wordCount, 0),
      importantSectionIds: Array.isArray(snapshot.importantSectionIds) ? snapshot.importantSectionIds.map((id) => String(id).slice(0, 160)).filter(Boolean).slice(0, 32) : [],
      sections
    };
  }

  function createPdfMapSnapshotFromModel(model, routeKey) {
    if (!isUsablePdfStatsModel(model, true)) return null;
    const sections = (model.sections || []).map((section) => ({
      id: section.id,
      title: section.title,
      text: section.text,
      pageNumber: getPdfSectionPageNumber(section),
      navigationTarget: section.navigationTarget || section.unitMeta && section.unitMeta.navigationTarget || "",
      index: section.index,
      level: section.level,
      wordCount: section.wordCount,
      top: section.top,
      score: section.score,
      usefulScore: section.usefulScore,
      importanceScore: section.importanceScore,
      label: section.label,
      isImportant: section.isImportant,
      isBest: section.isBest,
      metrics: section.metrics,
      unitMeta: section.unitMeta,
      intelligence: section.intelligence
    }));
    return normalizePdfMapSnapshot({
      version: 1,
      createdAt: Date.now(),
      routeKey,
      bestSectionId: model.bestSectionId,
      nextImportantId: model.nextImportantId,
      skipTargetId: model.skipTargetId,
      bestLabel: model.bestLabel,
      bestKind: model.bestKind,
      bestKindLabel: model.bestKindLabel,
      confidence: model.confidence,
      confidenceTier: model.confidenceTier,
      confidenceLabel: model.confidenceLabel,
      savedMinutes: model.savedMinutes,
      readingMinutes: model.readingMinutes,
      totalReadableWords: model.totalReadableWords,
      importantSectionIds: (model.importantSections || []).map((section) => section.id),
      sections
    });
  }

  function getPdfCacheEntrySignature(routeKey, entry) {
    const normalized = normalizePdfCacheEntry(entry);
    if (!routeKey || !normalized) return "";
    const fingerprint = normalized.fingerprint ? `${normalized.fingerprint.byteLength}:${normalized.fingerprint.hashSample}` : "";
    const snapshot = normalized.mapSnapshot ? `${normalized.mapSnapshot.version}:${normalized.mapSnapshot.sections.length}:${normalized.mapSnapshot.totalReadableWords}` : "no-map";
    return [
      getCanonicalPdfRouteKey(routeKey),
      normalized.source || "pdfjs",
      normalized.ocrMode || "",
      normalized.updatedAt || 0,
      normalized.words || 0,
      normalized.pagesRead || normalized.pages.length || 0,
      normalized.numPages || 0,
      fingerprint,
      snapshot
    ].join("|");
  }

  function normalizePdfFingerprint(fingerprint) {
    if (!fingerprint || typeof fingerprint !== "object") return null;
    const byteLength = Number(fingerprint.byteLength);
    const hashSample = String(fingerprint.hashSample || "").replace(/[^a-f0-9]/gi, "").slice(0, 24);
    if (!Number.isFinite(byteLength) || byteLength < 1 || !hashSample) return null;
    return {
      byteLength: Math.round(byteLength),
      hashSample
    };
  }

  function getPdfByteFingerprint(buffer) {
    if (!buffer || !buffer.byteLength) return null;
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const length = bytes.byteLength || 0;
    if (!length) return null;
    let hash = 2166136261;
    const sample = [];
    const pushSample = (start, count) => {
      const safeStart = Math.max(0, Math.min(length, start));
      const end = Math.max(safeStart, Math.min(length, safeStart + count));
      for (let index = safeStart; index < end; index += 1) {
        sample.push(bytes[index]);
      }
    };
    const span = Math.min(512, length);
    pushSample(0, span);
    pushSample(Math.max(0, Math.floor(length / 2) - Math.floor(span / 2)), span);
    pushSample(Math.max(0, length - span), span);
    sample.forEach((value) => {
      hash ^= value;
      hash = Math.imul(hash, 16777619) >>> 0;
    });
    hash ^= length & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
    return {
      byteLength: length,
      hashSample: hash.toString(16).padStart(8, "0")
    };
  }

  function clonePdfBytes(buffer) {
    if (!buffer || !buffer.byteLength) return null;
    if (buffer instanceof ArrayBuffer) return buffer.slice(0);
    if (buffer instanceof Uint8Array) {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    try {
      return new Uint8Array(buffer).buffer.slice(0);
    } catch (error) {
      return null;
    }
  }

  function getPdfModelStructureSignature(model, routeKey = getPdfDocumentRouteKey()) {
    if (!model || typeof model !== "object") return "";
    if (model.structureSignature) return String(model.structureSignature);
    const sections = Array.isArray(model.sections) ? model.sections : [];
    const words = Number(model.totalReadableWords || model.totalWords || 0);
    return [
      "pdf-model",
      getCanonicalPdfRouteKey(routeKey || model.routeKey || getPdfDocumentRouteKey()),
      sections.length,
      words,
      model.bestSectionId || "",
      model.nextImportantId || "",
      model.diagnostics && model.diagnostics.recoveredPdfCacheUpdatedAt || 0
    ].join("|");
  }

  function rememberNormalizedPdfModel(model, routeKey = getPdfDocumentRouteKey()) {
    if (!model || !model.pageProfile || model.pageProfile.type !== "pdf") return model;
    const canonicalRouteKey = getCanonicalPdfRouteKey(routeKey || model.routeKey || getPdfDocumentRouteKey());
    const signature = getPdfModelStructureSignature(model, canonicalRouteKey);
    if (!canonicalRouteKey || !signature) return model;
    runtime.normalizedPdfModelCache = {
      routeKey: canonicalRouteKey,
      signature,
      model
    };
    return model;
  }

  function getCachedNormalizedPdfModel(model, routeKey = getPdfDocumentRouteKey()) {
    if (!model || !runtime.normalizedPdfModelCache) return null;
    const canonicalRouteKey = getCanonicalPdfRouteKey(routeKey || model.routeKey || getPdfDocumentRouteKey());
    const signature = getPdfModelStructureSignature(model, canonicalRouteKey);
    const cached = runtime.normalizedPdfModelCache;
    return canonicalRouteKey
      && signature
      && cached.routeKey === canonicalRouteKey
      && cached.signature === signature
      && cached.model
        ? cached.model
        : null;
  }

  function getReadyPdfModelForStatus(routeKey = getPdfDocumentRouteKey()) {
    const canonicalRouteKey = getCanonicalPdfRouteKey(routeKey || getPdfDocumentRouteKey());
    const candidates = [
      { source: "runtime", model: runtime.model },
      { source: "stable-pdf", model: runtime.stablePdfRouteKey === routeKey || getCanonicalPdfRouteKey(runtime.stablePdfRouteKey) === canonicalRouteKey ? runtime.stablePdfModel : null },
      { source: "recovered-memory", model: runtime.recoveredPdfModelCache && getCanonicalPdfRouteKey(runtime.recoveredPdfModelCache.routeKey) === canonicalRouteKey ? runtime.recoveredPdfModelCache.model : null }
    ];
    for (const candidate of candidates) {
      const model = candidate.model;
      if (
        model
        && model.pageProfile
        && model.pageProfile.type === "pdf"
        && isUsablePdfStatsModel(model, true)
        && (
          !model.routeKey
          || getCanonicalPdfRouteKey(model.routeKey) === canonicalRouteKey
          || candidate.source === "runtime" && (isPdfRouteLocked() || isPdfLikePage())
        )
      ) {
        const cached = getCachedNormalizedPdfModel(model, routeKey);
        return {
          model: cached || model,
          source: candidate.source,
          normalizedCacheHit: Boolean(cached)
        };
      }
    }
    return null;
  }

  function rememberPdfResource(routeKey = getPdfDocumentRouteKey(), details = {}) {
    const canonicalRouteKey = getCanonicalPdfRouteKey(routeKey || getPdfDocumentRouteKey());
    if (!canonicalRouteKey) return null;
    const existing = runtime.pdfResourceCache && runtime.pdfResourceCache.routeKey === canonicalRouteKey
      ? runtime.pdfResourceCache
      : null;
    const bytes = details.bytes
      ? clonePdfBytes(details.bytes)
      : existing && existing.bytes || null;
    const fingerprint = normalizePdfFingerprint(details.fingerprint) || getPdfByteFingerprint(bytes) || existing && existing.fingerprint || null;
    const pdfDocument = details.pdfDocument || existing && existing.pdfDocument || null;
    const pageCount = Number(details.pageCount || pdfDocument && pdfDocument.numPages || existing && existing.pageCount || 0) || 0;
    runtime.pdfResourceCache = {
      routeKey: canonicalRouteKey,
      fingerprint,
      bytes,
      pdfDocument,
      pageCount,
      sourceUrl: String(details.sourceUrl || existing && existing.sourceUrl || getPdfSourceUrl() || ""),
      updatedAt: Date.now()
    };
    emitDebugNoStats("pdf:resource:cached", {
      routeKey: canonicalRouteKey,
      hasBytes: Boolean(bytes && bytes.byteLength),
      hasDocument: Boolean(pdfDocument),
      pageCount,
      source: details.source || "unknown",
      exactIssue: "none"
    });
    return runtime.pdfResourceCache;
  }

  function getCachedPdfResource(routeKey = getPdfDocumentRouteKey()) {
    const canonicalRouteKey = getCanonicalPdfRouteKey(routeKey || getPdfDocumentRouteKey());
    const cache = runtime.pdfResourceCache;
    if (!canonicalRouteKey || !cache || cache.routeKey !== canonicalRouteKey) return null;
    if (!cache.pdfDocument && !(cache.bytes && cache.bytes.byteLength)) return null;
    return cache;
  }

  function isPdfCacheEntryExpired(entry, now = Date.now()) {
    const updatedAt = Number(entry && entry.updatedAt) || 0;
    return !updatedAt || now - updatedAt > PDF_CACHE_TTL_MS;
  }

  function normalizePdfCacheStore(rawStore, options = {}) {
    const source = rawStore && typeof rawStore === "object" ? rawStore : {};
    const keepExpired = Boolean(options.keepExpired);
    const now = Date.now();
    const normalized = {};
    Object.keys(source).forEach((routeKey) => {
      const entry = normalizePdfCacheEntry(source[routeKey]);
      if (!isPdfCacheEntryUsable(entry)) return;
      if (!keepExpired && isPdfCacheEntryExpired(entry, now)) return;
      normalized[routeKey] = entry;
    });
    Object.keys(normalized)
      .sort((a, b) => Number(normalized[b] && normalized[b].updatedAt || 0) - Number(normalized[a] && normalized[a].updatedAt || 0))
      .slice(PDF_CACHE_MAX_ENTRIES * 2)
      .forEach((routeKey) => {
        delete normalized[routeKey];
      });
    return normalized;
  }

  async function readPdfPersistentCacheStore(options = {}) {
    const routeKey = options.routeKey || getPdfDocumentRouteKey();
    if (!hasChromeLocalStorage()) {
      emitDebug("pdf:cache:storage-unavailable", {
        routeKey,
        operation: "read",
        exactIssue: "chrome.storage.local is unavailable in this context, so SkimRoute can only use memory/session PDF cache."
      });
      return {};
    }
    const raw = await storageGet(PDF_PERSISTENT_CACHE_STORAGE_KEY);
    const normalized = normalizePdfCacheStore(raw, options);
    emitDebug("pdf:cache:persistent-read", {
      routeKey,
      keys: Object.keys(normalized).slice(0, PDF_CACHE_MAX_ENTRIES * 2),
      entries: Object.keys(normalized).length,
      keepExpired: Boolean(options.keepExpired),
      exactIssue: "none"
    });
    return normalized;
  }

  async function writePdfPersistentCacheStore(store, options = {}) {
    const routeKey = options.routeKey || getPdfDocumentRouteKey();
    if (!hasChromeLocalStorage()) {
      emitDebug("pdf:cache:storage-unavailable", {
        routeKey,
        operation: "write",
        exactIssue: "chrome.storage.local is unavailable, so the PDF map cannot be saved persistently in this browser context."
      });
      return false;
    }
    return storageSet(PDF_PERSISTENT_CACHE_STORAGE_KEY, normalizePdfCacheStore(store));
  }

  function getPdfOcrQuality(entry) {
    try {
      return computePdfOcrQuality(entry);
    } catch (error) {
      rememberPdfOcrParserError(error, "ocr-quality", {
        entry,
        fallbackUsed: true
      });
      return {
        quality: "weak_structure",
        message: PDF_OCR_APPROXIMATE_MESSAGE,
        score: 48
      };
    }
  }

  function getPdfOcrStructureCompleteness(entry, model = null) {
    const source = String(entry && entry.source || model && model.diagnostics && model.diagnostics.recoveredPdfSource || "").toLowerCase();
    const text = String(entry && entry.text || model && model.sections && model.sections.map((section) => section.text || "").join("\n\n") || "").trim();
    const words = Number(entry && entry.words) || countPdfWords(text);
    if (source && source !== "ocr") {
      return {
        complete: true,
        letterLike: false,
        score: 100,
        sections: model && Array.isArray(model.sections) ? model.sections.length : 0,
        words,
        roleCounts: {},
        bodyAfterGreeting: false,
        administrativePrefix: false,
        oneLargeSection: false
      };
    }
    const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const countWords = (value) => countPdfWords(value);
    const pages = Array.isArray(entry && entry.pages) && entry.pages.length
      ? entry.pages
      : text
        ? normalizePdfRecoveryPages([{ pageNumber: 1, text }])
        : [];
    const chunks = [];
    pages.forEach((page, pageIndex) => {
      const pageNumber = Number(page && page.pageNumber) || pageIndex + 1;
      const pageChunks = buildRecoveredPdfOcrLetterChunks(page, cleanText, countWords);
      if (pageChunks.length) {
        pageChunks.forEach((chunk) => chunks.push({ ...chunk, pageNumber }));
        return;
      }
      const pageText = cleanText(page && page.text);
      splitRecoveredPdfOcrLetterText(pageText, cleanText).forEach((piece, pieceIndex, list) => {
        const derived = buildDerivedRecoveredPdfOcrChunk({
          pageNumber,
          relativeYStart: 0.08,
          relativeYEnd: 0.9,
          lineStart: pieceIndex,
          lineEnd: pieceIndex
        }, piece.text, piece.role, pieceIndex, list.length, cleanText, countWords);
        if (derived) chunks.push(derived);
      });
    });
    if (model && Array.isArray(model.sections)) {
      model.sections.forEach((section, index) => {
        const metrics = section && section.metrics || {};
        const unitMeta = section && section.unitMeta || {};
        const role = normalizeRecoveredPdfOcrRole(metrics.ocrRole || unitMeta.ocrRole);
        if (!role) return;
        chunks.push({
          text: cleanText(section.text || ""),
          words: Number(section.wordCount) || countWords(section.text || ""),
          ocrRole: role,
          pageNumber: getPdfSectionPageNumber(section) || 1,
          lineStart: Number(unitMeta.lineStart) || index,
          lineEnd: Number(unitMeta.lineEnd) || index
        });
      });
    }
    const roleCounts = {};
    chunks.forEach((chunk) => {
      const role = normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole) || "unknown";
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });
    const sectionCount = model && Array.isArray(model.sections) && model.sections.length
      ? model.sections.length
      : chunks.length;
    const letterLike = Boolean(
      roleCounts.letterhead
      || roleCounts.date_reference
      || roleCounts.recipient
      || roleCounts.greeting
      || roleCounts.signature
      || /\b(?:dear|our\s+ref|your\s+ref|telephone|telex|yours sincerely|yours faithfully)\b/i.test(text)
    );
    const bodyChunks = chunks.filter((chunk) => normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole) === "body" && countWords(chunk.text) >= 8);
    const strongContentRoles = ["body", "abstract", "results", "discussion", "conclusion", "report_summary", "recommendations", "form_notice", "table", "invoice_summary", "total_due"];
    const researchRoles = ["title", "abstract", "introduction", "methods", "results", "discussion", "conclusion", "references"];
    const reportRoles = ["report_summary", "results", "recommendations", "conclusion"];
    const formRoles = ["form_notice", "table", "line_items", "total_due", "invoice_summary"];
    const contentChunks = chunks.filter((chunk) => {
      const role = normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole);
      return strongContentRoles.includes(role) && countWords(chunk.text) >= (role === "total_due" ? 3 : 8);
    });
    const researchLike = researchRoles.filter((role) => roleCounts[role]).length >= 2
      || /\b(?:abstract|introduction|methods?|results?|findings?|discussion|conclusions?|references|bibliography)\b/i.test(text);
    const reportLike = reportRoles.filter((role) => roleCounts[role]).length >= 2
      || /\b(?:executive summary|findings?|recommendations?|conclusions?|report)\b/i.test(text);
    const formLike = formRoles.filter((role) => roleCounts[role]).length >= 1
      || /\b(?:notice|form|determination|claim number|case number|respond by|deadline|invoice|receipt|total due|amount due)\b/i.test(text);
    const bodyWords = bodyChunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);
    const greetingLine = chunks.find((chunk) => normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole) === "greeting");
    const greetingOrder = greetingLine ? Number(greetingLine.lineEnd ?? greetingLine.lineStart ?? -1) : -1;
    const bodyAfterGreeting = bodyChunks.some((chunk) => {
      const order = Number(chunk.lineStart);
      return greetingOrder < 0 || !Number.isFinite(order) || order > greetingOrder || /\b(?:permit me to introduce|i would like|please|regarding|enclosed|because|therefore)\b/i.test(chunk.text || "");
    });
    const administrativePrefix = bodyChunks.some((chunk) => startsWithRecoveredPdfOcrAdministrativeText(chunk.text));
    const oneLargeSection = sectionCount <= 1 && words >= PDF_RECOVERY_MIN_WORDS;
    const usefulRoleCount = ["letterhead", "date_reference", "recipient", "greeting", "body", "closing", "signature", "abstract", "results", "conclusion", "report_summary", "recommendations", "form_notice", "table", "invoice_summary", "total_due"].filter((role) => roleCounts[role]).length;
    const meaningfulStructure = contentChunks.length >= 1 && sectionCount >= 2 && !oneLargeSection;
    let score = 35;
    if (words >= PDF_RECOVERY_MIN_WORDS) score += 10;
    if (words >= 100) score += 10;
    if (sectionCount >= 2) score += 14;
    if (sectionCount >= 3) score += 16;
    if (bodyChunks.length) score += 18;
    if (bodyAfterGreeting) score += 14;
    if (contentChunks.length >= 1) score += 14;
    if (contentChunks.length >= 2) score += 10;
    if (roleCounts.results || roleCounts.conclusion || roleCounts.recommendations) score += 12;
    if (roleCounts.form_notice || roleCounts.total_due) score += 10;
    if (usefulRoleCount >= 3) score += 12;
    if (oneLargeSection) score -= 32;
    if (administrativePrefix) score -= 30;
    if (letterLike && !roleCounts.greeting) score -= 12;
    const complete = letterLike
      ? Boolean(sectionCount >= 3 && bodyChunks.length && bodyAfterGreeting && !administrativePrefix && usefulRoleCount >= 3 && (words >= 100 || bodyWords >= 55))
      : researchLike
        ? Boolean(meaningfulStructure && (roleCounts.results || roleCounts.conclusion || roleCounts.abstract) && words >= PDF_RECOVERY_MIN_WORDS)
        : reportLike
          ? Boolean(meaningfulStructure && (roleCounts.results || roleCounts.recommendations || roleCounts.conclusion || roleCounts.report_summary) && words >= PDF_RECOVERY_MIN_WORDS)
          : formLike
            ? Boolean(contentChunks.length >= 1 && sectionCount >= 2 && !oneLargeSection && words >= Math.min(PDF_RECOVERY_MIN_WORDS, 55))
            : Boolean(sectionCount >= 2 && words >= PDF_RECOVERY_MIN_WORDS && !oneLargeSection);
    return {
      complete,
      letterLike,
      researchLike,
      reportLike,
      formLike,
      score: Math.max(0, Math.min(100, Math.round(score))),
      sections: sectionCount,
      words,
      roleCounts,
      bodyAfterGreeting,
      administrativePrefix,
      oneLargeSection,
      bodySections: bodyChunks.length,
      bodyWords,
      contentSections: contentChunks.length,
      usefulRoleCount
    };
  }

  function computePdfOcrQuality(entry) {
    if (entry && entry.ocrQuality && entry.qualityMessage) {
      return {
        quality: entry.ocrQuality,
        message: entry.qualityMessage,
        score: Number(entry.qualityScore) || 0
      };
    }
    const text = String(entry && entry.text || "");
    const pages = Array.isArray(entry && entry.pages) ? entry.pages : [];
    const words = Number(entry && entry.words) || countPdfWords(text);
    const lines = pages.flatMap((page) => Array.isArray(page && page.lines) ? page.lines : []);
    const lineTexts = lines.map((line) => String(line && line.text || "").trim()).filter(Boolean);
    const pageDiagnostics = Array.isArray(entry && entry.pageDiagnostics) ? entry.pageDiagnostics : [];
    const confidenceValues = []
      .concat(Number.isFinite(Number(entry && entry.confidence)) ? [Number(entry.confidence)] : [])
      .concat(pages.map((page) => Number(page && page.confidence)).filter((value) => Number.isFinite(value) && value > 0))
      .concat(lines.map((line) => Number(line && line.confidence)).filter((value) => Number.isFinite(value) && value > 0));
    const averageConfidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;
    const blankPages = pageDiagnostics.filter((page) => page && page.likelyBlank).length;
    const shortLines = lineTexts.filter((line) => countPdfWords(line) <= 2).length;
    const semanticHits = countPatternHits(text, /\b(abstract|introduction|background|summary|results?|findings?|conclusions?|methods?|notice|form|signature|table|date|claim|evidence)\b/gi);
    const repeated = getRepeatedPdfLineCount(lineTexts);
    const fragmentRatio = lineTexts.length ? shortLines / lineTexts.length : 0.5;
    const structure = getPdfOcrStructureCompleteness({ text, pages, words, source: "ocr" });
    let score = 42;
    if (words >= 180) score += 18;
    if (words >= 520) score += 10;
    if (semanticHits >= 2) score += 18;
    if (semanticHits >= 5) score += 10;
    if (fragmentRatio > 0.45) score -= 18;
    if (fragmentRatio > 0.65) score -= 18;
    if (repeated >= 3) score -= 18;
    if (blankPages > 0) score -= Math.min(28, blankPages * 8);
    if (averageConfidence && averageConfidence < 48) score -= 18;
    if (averageConfidence >= 72) score += 8;
    if (words < 80) score -= 22;
    if (structure.letterLike) {
      if (structure.complete) score += 12;
      if (structure.sections >= 3) score += 8;
      if (structure.bodyAfterGreeting) score += 8;
      if (structure.oneLargeSection) score -= 28;
      if (structure.administrativePrefix) score -= 24;
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (score < 38) {
      return {
        quality: "low",
        message: PDF_OCR_APPROXIMATE_MESSAGE,
        score
      };
    }
    if (score < 62) {
      return {
        quality: "weak_structure",
        message: PDF_OCR_APPROXIMATE_MESSAGE,
        score
      };
    }
    return {
      quality: "readable",
      message: "OCR finished. SkimRoute found readable text and built a page map.",
      score
    };
  }

  function getRepeatedPdfLineCount(lines) {
    const seen = new Map();
    let repeated = 0;
    (lines || []).forEach((line) => {
      const key = String(line || "").replace(/\d+/g, "#").toLowerCase().slice(0, 80);
      if (key.length < 8) return;
      const count = seen.get(key) || 0;
      if (count > 0) repeated += 1;
      seen.set(key, count + 1);
    });
    return repeated;
  }

  function persistPdfSessionCacheEntry(routeKey, entry) {
    const normalized = normalizePdfCacheEntry(entry);
    if (!routeKey || !normalized || normalized.words < 1) return false;
    const store = normalizePdfCacheStore(readPdfSessionCacheStore());
    getPdfCacheRouteKeys(routeKey).forEach((key) => {
      store[key] = normalized;
    });
    return writePdfSessionCacheStore(normalizePdfCacheStore(store));
  }

  function getPdfCacheLayerSummary(routeKey = getPdfDocumentRouteKey()) {
    const keys = getPdfCacheRouteKeys(routeKey);
    const memoryStore = getPdfOcrStore();
    const sessionStore = readPdfSessionCacheStore();
    const summarize = (store, label) => keys.map((key) => {
      const entry = normalizePdfCacheEntry(store && store[key]);
      return {
        layer: label,
        key,
        exists: Boolean(store && store[key]),
        usable: isPdfCacheEntryUsable(entry),
        expired: entry ? isPdfCacheEntryExpired(entry) : false,
        words: entry && entry.words || 0,
        source: entry && entry.source || "",
        cacheSource: entry && entry.cacheSource || "",
        updatedAt: entry && entry.updatedAt || 0,
        hasMapSnapshot: Boolean(entry && entry.mapSnapshot),
        fingerprint: entry && entry.fingerprint || null
      };
    });
    return {
      routeKey,
      keys,
      memory: summarize(memoryStore, "memory"),
      session: summarize(sessionStore, "session")
    };
  }

  function emitPdfCachePreflight(reason, routeKey = getPdfDocumentRouteKey(), extra = {}) {
    try {
      const summary = getPdfCacheLayerSummary(routeKey);
      emitDebug("pdf:cache:preflight", {
        reason,
        routeKey,
        isPdfRoute: isPdfRouteLocked(),
        isPdfLike: isPdfLikePage(),
        runtimeReady: Boolean(runtime.model && isUsablePdfStatsModel(runtime.model, true)),
        stableReady: Boolean(runtime.stablePdfModel && runtime.stablePdfRouteKey === routeKey && isUsablePdfStatsModel(runtime.stablePdfModel, true)),
        memory: summary.memory,
        session: summary.session,
        chromeStorageAvailable: Boolean(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local),
        ...extra
      });
    } catch (error) {
      emitDebug("pdf:cache:preflight:error", {
        reason,
        routeKey,
        error: String(error && error.message ? error.message : error)
      });
    }
  }

  async function persistPdfPersistentCacheEntry(routeKey, entry) {
    const normalized = normalizePdfCacheEntry(entry);
    if (!routeKey || !normalized || normalized.words < 1) return false;
    const store = await readPdfPersistentCacheStore({ keepExpired: true, routeKey });
    getPdfCacheRouteKeys(routeKey).forEach((key) => {
      store[key] = normalized;
    });
    const ok = await writePdfPersistentCacheStore(store, { routeKey });
    if (ok) {
      const verifiedStore = await readPdfPersistentCacheStore({ keepExpired: true, routeKey });
      const verified = getPdfCacheRouteKeys(routeKey).some((key) => {
        const candidate = normalizePdfCacheEntry(verifiedStore[key]);
        return isPdfCacheEntryUsable(candidate)
          && candidate.words === normalized.words
          && getPdfCacheEntrySignature(routeKey, candidate) === getPdfCacheEntrySignature(routeKey, normalized);
      });
      getPdfPersistentBytesInUse().then((bytesInUse) => {
        emitDebug("pdf:cache:persistent-bytes", {
          routeKey,
          bytesInUse,
          exactIssue: "none"
        });
      });
      emitDebug("pdf:cache:persistent-write-ok", {
        routeKey,
        words: normalized.words,
        source: normalized.source,
        cacheSource: normalized.cacheSource || "",
        hasMapSnapshot: Boolean(normalized.mapSnapshot),
        exactIssue: "none"
      });
      emitDebug(verified ? "pdf:cache:persistent-verify-ok" : "pdf:cache:persistent-verify-failed", {
        routeKey,
        words: normalized.words,
        source: normalized.source,
        hasMapSnapshot: Boolean(normalized.mapSnapshot),
        exactIssue: verified
          ? "none"
          : "SkimRoute wrote the PDF recovery cache, but an immediate read did not return the same usable map. If reopening the popup rescans, this points to app storage/quota behavior rather than laptop speed."
      });
    } else {
      emitDebug("pdf:cache:persistent-write-failed", {
        routeKey,
        words: normalized.words,
        source: normalized.source,
        exactIssue: "chrome.storage.local did not accept the PDF recovery cache entry. SkimRoute will still use memory/session cache for this tab."
      });
    }
    return ok;
  }

  function getPdfPersistentBytesInUse() {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.local || typeof chrome.storage.local.getBytesInUse !== "function") {
          resolve(null);
          return;
        }
        chrome.storage.local.getBytesInUse(PDF_PERSISTENT_CACHE_STORAGE_KEY, (bytes) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(Number(bytes) || 0);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function applyPdfCacheEntry(routeKey, entry, cacheSource, options = {}) {
    const normalized = normalizePdfCacheEntry(entry);
    if (!routeKey || !isPdfCacheEntryUsable(normalized)) return false;
    const source = cacheSource || normalized.cacheSource || "memory";
    normalized.cacheSource = source;
    normalized.cacheHit = options.cacheHit !== false;
    getPdfCacheRouteKeys(routeKey).forEach((key) => {
      getPdfOcrStore()[key] = normalized;
    });
    runtime.pdfOcr.completedForRoute = routeKey;
    runtime.pdfOcr.pending = false;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.progress = 100;
    runtime.pdfOcr.source = normalized.source || "pdfjs";
    runtime.pdfOcr.words = normalized.words;
    runtime.pdfOcr.pages = normalized.pagesRead || normalized.pages.length;
    runtime.pdfOcr.partial = Boolean(normalized.partial);
    runtime.pdfOcr.qualityState = normalized.ocrQuality || "";
    runtime.pdfOcr.qualityScore = Number(normalized.qualityScore) || 0;
    runtime.pdfOcr.qualityMessage = normalized.qualityMessage || "";
    runtime.pdfOcr.state = "ready";
    runtime.pdfOcr.lastRecoveredEntry = normalized;
    runtime.pdfOcr.cacheHit = normalized.cacheHit;
    runtime.pdfOcr.cacheSource = source;
    runtime.pdfOcr.cacheUpdatedAt = Number(normalized.updatedAt) || Date.now();
    return true;
  }

  function hydratePdfMemoryOrSessionCache(routeKey = getPdfDocumentRouteKey(), options = {}) {
    if (!routeKey) return false;
    const routeKeys = getPdfCacheRouteKeys(routeKey);
    const memoryStore = getPdfOcrStore();
    for (const key of routeKeys) {
      const memoryEntry = normalizePdfCacheEntry(memoryStore[key]);
      if (isPdfCacheEntryUsable(memoryEntry) && !isPdfCacheEntryExpired(memoryEntry)) {
        return applyPdfCacheEntry(routeKey, memoryEntry, memoryEntry.cacheSource || (key === routeKey ? "memory" : "memory-alias"), options);
      }
    }
    const sessionStore = readPdfSessionCacheStore();
    for (const key of routeKeys) {
      const sessionEntry = normalizePdfCacheEntry(sessionStore[key]);
      if (isPdfCacheEntryUsable(sessionEntry) && !isPdfCacheEntryExpired(sessionEntry)) {
        const applied = applyPdfCacheEntry(routeKey, sessionEntry, key === routeKey ? "session" : "session-alias", options);
        if (applied) persistPdfSessionCacheEntry(routeKey, sessionEntry);
        return applied;
      }
    }
    return false;
  }

  function writePdfCacheEntry(routeKey, entry) {
    const normalized = normalizePdfCacheEntry(entry);
    if (!routeKey || !normalized) return null;
    const store = getPdfOcrStore();
    const existing = getPdfCacheRouteKeys(routeKey)
      .map((key) => normalizePdfCacheEntry(store[key]))
      .find((candidate) => isPdfCacheEntryUsable(candidate)) || null;
    if (shouldPreserveExistingPdfCacheEntry(existing, normalized)) {
      emitDebug("pdf:cache:preserved", {
        routeKey,
        existingWords: existing.words,
        attemptedWords: normalized.words,
        attemptedSource: normalized.source,
        exactIssue: "A later OCR/PDF extraction result was not usable, so SkimRoute kept the existing usable cache entry."
      });
      return existing;
    }
    runtime.recoveredPdfModelCache = { routeKey: "", signature: "", model: null };
    normalized.cacheSource = "fresh";
    normalized.cacheHit = false;
    getPdfCacheRouteKeys(routeKey).forEach((key) => {
      getPdfOcrStore()[key] = normalized;
    });
    persistPdfSessionCacheEntry(routeKey, normalized);
    runtime.pdfOcr.cachePersistPromise = persistPdfPersistentCacheEntry(routeKey, normalized);
    runtime.pdfOcr.cacheHit = false;
    runtime.pdfOcr.cacheSource = "fresh";
    runtime.pdfOcr.cacheUpdatedAt = Number(normalized.updatedAt) || Date.now();
    return normalized;
  }

  async function waitForPdfCachePersistence(routeKey, timeoutMs = 650) {
    const promise = runtime.pdfOcr && runtime.pdfOcr.cachePersistPromise;
    if (!promise || typeof promise.then !== "function") return false;
    try {
      return await Promise.race([
        promise,
        new Promise((resolve) => window.setTimeout(() => resolve(false), Math.max(80, timeoutMs)))
      ]);
    } catch (error) {
      emitDebug("pdf:cache:persistent-wait-error", {
        routeKey,
        error: String(error && error.message ? error.message : error)
      });
      return false;
    }
  }

  function shouldPreserveExistingPdfCacheEntry(existingEntry, nextEntry) {
    const existing = normalizePdfCacheEntry(existingEntry);
    const next = normalizePdfCacheEntry(nextEntry);
    if (isPdfCacheEntryUsable(existing) && !isPdfCacheEntryUsable(next)) return true;
    if (
      isPdfCacheEntryUsable(existing)
      && existing.source === "ocr"
      && next
      && next.source === "ocr"
    ) {
      const existingStructure = existing.ocrStructure || getPdfOcrStructureCompleteness(existing);
      const nextStructure = next.ocrStructure || getPdfOcrStructureCompleteness(next);
      if (existingStructure && existingStructure.complete && nextStructure && !nextStructure.complete) return true;
      if (
        existingStructure
        && nextStructure
        && existing.words >= (next.words || 0) + 25
        && Number(existingStructure.score || 0) >= Number(nextStructure.score || 0)
      ) {
        return true;
      }
    }
    return false;
  }

  function hydratePdfSessionCache(routeKey = getPdfDocumentRouteKey()) {
    return hydratePdfMemoryOrSessionCache(routeKey, { cacheHit: true });
  }

  async function hydratePdfCache(routeKey = getPdfDocumentRouteKey(), options = {}) {
    if (!routeKey) return false;
    emitPdfCachePreflight(`hydrate:${options.source || "cache"}:start`, routeKey);
    if (hydratePdfMemoryOrSessionCache(routeKey, { cacheHit: true })) {
      emitDebug("pdf:cache:hit", {
        routeKey,
        source: runtime.pdfOcr.cacheSource || "memory-session",
        reason: options.source || "cache",
        words: runtime.pdfOcr.words || 0,
        exactIssue: "A same-route PDF map was found in memory/session cache, so SkimRoute can skip PDF.js/OCR."
      });
      emitDebug("pdf:cache:hydrated", {
        routeKey,
        source: runtime.pdfOcr.cacheSource || "memory-session",
        reason: options.source || "cache",
        words: runtime.pdfOcr.words || 0
      });
      return true;
    }
    const persistentStore = await readPdfPersistentCacheStore({ routeKey });
    const persistentSummary = getPdfCacheRouteKeys(routeKey).map((key) => {
      const entry = normalizePdfCacheEntry(persistentStore[key]);
      return {
        key,
        exists: Boolean(persistentStore[key]),
        usable: isPdfCacheEntryUsable(entry),
        expired: entry ? isPdfCacheEntryExpired(entry) : false,
        words: entry && entry.words || 0,
        source: entry && entry.source || "",
        cacheSource: entry && entry.cacheSource || "",
        updatedAt: entry && entry.updatedAt || 0,
        hasMapSnapshot: Boolean(entry && entry.mapSnapshot),
        fingerprint: entry && entry.fingerprint || null
      };
    });
    let persistentEntry = null;
    let persistentKey = routeKey;
    for (const key of getPdfCacheRouteKeys(routeKey)) {
      const candidate = normalizePdfCacheEntry(persistentStore[key]);
      if (isPdfCacheEntryUsable(candidate) && !isPdfCacheEntryExpired(candidate)) {
        persistentEntry = candidate;
        persistentKey = key;
        break;
      }
    }
    if (!persistentEntry) {
      emitDebug("pdf:cache:persistent-miss", {
        routeKey,
        reason: options.source || "cache",
        keys: getPdfCacheRouteKeys(routeKey),
        persistent: persistentSummary,
        exactIssue: "No usable same-route PDF map was found in chrome.storage.local."
      });
      emitDebug("pdf:cache:miss", {
        routeKey,
        reason: options.source || "cache",
        keys: getPdfCacheRouteKeys(routeKey),
        persistent: persistentSummary,
        exactIssue: "No usable same-route PDF cache entry was found in memory, sessionStorage, or chrome.storage.local."
      });
      return false;
    }
    const applied = applyPdfCacheEntry(routeKey, persistentEntry, persistentKey === routeKey ? "persistent" : "persistent-alias", { cacheHit: true });
    if (applied) {
      persistPdfSessionCacheEntry(routeKey, persistentEntry);
      emitDebug("pdf:cache:persistent-hit", {
        routeKey,
        source: persistentKey === routeKey ? "persistent" : "persistent-alias",
        reason: options.source || "cache",
        words: persistentEntry.words || 0,
        ageMs: Date.now() - (Number(persistentEntry.updatedAt) || Date.now()),
        exactIssue: "none"
      });
      emitDebug("pdf:cache:hit", {
        routeKey,
        source: persistentKey === routeKey ? "persistent" : "persistent-alias",
        reason: options.source || "cache",
        words: persistentEntry.words || 0,
        ageMs: Date.now() - (Number(persistentEntry.updatedAt) || Date.now()),
        exactIssue: "A same-route PDF map was found in chrome.storage.local, so SkimRoute can skip PDF.js/OCR."
      });
      emitDebug("pdf:cache:hydrated", {
        routeKey,
        source: persistentKey === routeKey ? "persistent" : "persistent-alias",
        reason: options.source || "cache",
        words: persistentEntry.words || 0,
        ageMs: Date.now() - (Number(persistentEntry.updatedAt) || Date.now()),
        exactIssue: "A same-route PDF map was found in chrome.storage.local, so SkimRoute can skip PDF.js/OCR and render immediately."
      });
    }
    return applied;
  }

  function persistCurrentPdfCache(routeKey = getPdfDocumentRouteKey()) {
    const store = getPdfOcrStore();
    const entry = routeKey && getPdfCacheRouteKeys(routeKey).map((key) => store[key]).find(Boolean);
    if (entry) {
      persistPdfSessionCacheEntry(routeKey, entry);
      runtime.pdfOcr.cachePersistPromise = persistPdfPersistentCacheEntry(routeKey, entry);
    }
  }

  function getPdfAnchorRoot() {
    return document.querySelector("#viewer, #viewerContainer, pdf-viewer, main, [role='main']") || document.body;
  }

  function reanchorRecoveredPdfModel(model, anchorRoot, entry = null, baseModel = null, cacheMeta = {}) {
    if (!model || !anchorRoot) return model;
    model.articleRoot = anchorRoot;
    (model.sections || []).forEach((section) => {
      section.anchor = anchorRoot;
      section.blocks = [anchorRoot];
      section.isCollapsed = runtime.view && runtime.view.collapsedSectionIds ? runtime.view.collapsedSectionIds.has(section.id) : false;
    });
    model.importantSections = (model.sections || []).filter((section) => section.isImportant);
    if (model.diagnostics) {
      model.diagnostics.rootTag = anchorRoot && anchorRoot.tagName ? anchorRoot.tagName.toLowerCase() : "body";
      model.diagnostics.rootId = anchorRoot && anchorRoot.id || "";
      model.diagnostics.rootClass = anchorRoot && anchorRoot.className ? String(anchorRoot.className).slice(0, 120) : "";
      model.diagnostics.recoveredPdfCacheSource = cacheMeta.cacheSource || entry && entry.cacheSource || model.diagnostics.recoveredPdfCacheSource || "";
      model.diagnostics.recoveredPdfCacheHit = Boolean(cacheMeta.cacheHit || entry && entry.cacheHit || model.diagnostics.recoveredPdfCacheHit);
      model.diagnostics.recoveredPdfCacheUpdatedAt = Number(entry && entry.updatedAt || model.diagnostics.recoveredPdfCacheUpdatedAt || 0);
      model.diagnostics.pageProfileBefore = baseModel && baseModel.pageProfile || model.diagnostics.pageProfileBefore || null;
      model.diagnostics.pageProfileAfter = model.pageProfile;
    }
    return model;
  }

  function normalizeRecoveredPdfModelForPublicStatus(model, routeKey = getPdfDocumentRouteKey(), entry = null, baseModel = null, reason = "pdf-cache", options = {}) {
    if (!model || typeof model !== "object") return model;
    const cachedNormalized = options.cache !== false ? getCachedNormalizedPdfModel(model, routeKey) : null;
    if (cachedNormalized) return cachedNormalized;
    const sections = Array.isArray(model.sections) ? model.sections.filter(Boolean) : [];
    const entrySource = entry && entry.source || model.diagnostics && model.diagnostics.recoveredPdfSource || runtime.pdfOcr && runtime.pdfOcr.source || "pdfjs";
    const ocrQuality = entrySource === "ocr" && entry ? getPdfOcrQuality(entry) : {
      quality: model.pageProfile && model.pageProfile.ocrQuality || model.diagnostics && model.diagnostics.recoveredPdfQuality || "",
      message: model.pageProfile && (model.pageProfile.qualityMessage || model.pageProfile.reason) || "",
      score: Number(model.pageProfile && model.pageProfile.qualityScore || model.diagnostics && model.diagnostics.recoveredPdfQualityScore || 0)
    };
    const recoveredReason = entrySource === "ocr"
      ? ocrQuality.message || "PDF OCR text recovered"
      : "PDF text recovered with PDF.js";
    const repaired = {
      missingProfile: !model.pageProfile,
      missingSections: !Array.isArray(model.sections),
      missingImportant: !Array.isArray(model.importantSections),
      missingBest: !model.bestSectionId,
      missingWords: !Number(model.totalReadableWords || model.totalWords),
      missingConfidence: !Number(model.confidence),
      missingBestLabel: !model.bestLabel
    };

    model.sections = sections.map((section, index) => {
      const pageNumber = getPdfSectionPageNumber(section) || Number(section.pageNumber || section.unitMeta && section.unitMeta.pageNumber) || 1;
      const text = String(section.text || "").trim();
      const wordCount = Number(section.wordCount || section.unitMeta && section.unitMeta.words) || countPdfWords(text);
      const unitMeta = section.unitMeta && typeof section.unitMeta === "object" ? section.unitMeta : {};
      const metrics = section.metrics && typeof section.metrics === "object" ? section.metrics : {};
      section.id = String(section.id || `pp-pdf-cache-${pageNumber}-${index}`);
      section.title = String(section.title || `Page ${pageNumber}`).trim();
      section.source = section.source || "pdf";
      section.pageNumber = pageNumber;
      section.navigationTarget = section.navigationTarget || unitMeta.navigationTarget || `#page=${pageNumber}`;
      section.index = Number.isFinite(Number(section.index)) ? Number(section.index) : index;
      section.level = Number.isFinite(Number(section.level)) ? Number(section.level) : 2;
      section.parentId = section.parentId || null;
      section.childIds = Array.isArray(section.childIds) ? section.childIds : [];
      section.text = text;
      section.wordCount = wordCount;
      section.top = Number.isFinite(Number(section.top)) ? Number(section.top) : pageNumber * 100000 + index * 1000;
      section.unitMeta = {
        ...unitMeta,
        kind: unitMeta.kind || (entrySource === "ocr" ? "pdf-ocr" : "pdfjs-page"),
        pageNumber,
        navigationTarget: unitMeta.navigationTarget || `#page=${pageNumber}`,
        synthetic: true,
        pdfjs: unitMeta.pdfjs !== false && unitMeta.ocr !== true && entrySource !== "ocr",
        ocr: Boolean(unitMeta.ocr || entrySource === "ocr"),
        chunkIndex: Number(unitMeta.chunkIndex) || index,
        chunkCount: Number(unitMeta.chunkCount) || 1,
        relativeY: Number.isFinite(Number(unitMeta.relativeY)) ? Math.max(0, Math.min(1, Number(unitMeta.relativeY))) : 0.12,
        relativeYStart: Number.isFinite(Number(unitMeta.relativeYStart)) ? Math.max(0, Math.min(1, Number(unitMeta.relativeYStart))) : null,
        relativeYEnd: Number.isFinite(Number(unitMeta.relativeYEnd)) ? Math.max(0, Math.min(1, Number(unitMeta.relativeYEnd))) : null,
        ocrGeometry: normalizePdfOcrGeometry(unitMeta.ocrGeometry || section.ocrGeometry || null),
        ocrBoundingBox: normalizePdfOcrBBox(unitMeta.ocrBoundingBox || section.ocrBoundingBox || null),
        ocrExactGeometry: Boolean(unitMeta.ocrExactGeometry),
        ocrHighlightApproximate: Boolean(unitMeta.ocrHighlightApproximate),
        words: Number(unitMeta.words) || wordCount
      };
      section.metrics = {
        ...metrics,
        matched: metrics.matched && typeof metrics.matched === "object" ? metrics.matched : {},
        sectionKind: metrics.sectionKind || metrics.pdfSectionType || section.unitMeta.pdfSectionType || "",
        sectionKindLabel: metrics.sectionKindLabel || recoveredPdfKindLabel(metrics.sectionKind || metrics.pdfSectionType || section.unitMeta.pdfSectionType || ""),
        pdfSectionType: metrics.pdfSectionType || section.unitMeta.pdfSectionType || ""
      };
      section.score = Number.isFinite(Number(section.score)) ? Number(section.score) : Number(section.importanceScore || section.metrics.score || 72);
      section.usefulScore = Number.isFinite(Number(section.usefulScore)) ? Number(section.usefulScore) : Math.max(30, Math.round(section.score * 0.62));
      section.importanceScore = Number.isFinite(Number(section.importanceScore)) ? Number(section.importanceScore) : section.score;
      section.label = String(section.label || "").trim();
      section.intelligence = normalizeSectionIntelligenceForPublic(section, "pdf");
      return section;
    });

    const totalReadableWords = Number(model.totalReadableWords || model.totalWords)
      || model.sections.reduce((sum, section) => sum + (Number(section.wordCount) || countPdfWords(section.text || "")), 0);
    let importantSections = Array.isArray(model.importantSections)
      ? model.importantSections.map((important) => model.sections.find((section) => section.id === (important && important.id || important))).filter(Boolean)
      : [];
    if (!importantSections.length) {
      importantSections = model.sections.filter((section) => section.isImportant);
    }
    let bestSection = model.sections.find((section) => section.id === model.bestSectionId)
      || model.sections.find((section) => section.isBest)
      || importantSections[0]
      || [...model.sections].sort(compareRecoveredPdfSections)[0]
      || model.sections[0]
      || null;
    if (bestSection) {
      bestSection.isBest = true;
      bestSection.isImportant = true;
      if (!bestSection.label) {
        bestSection.label = formatRecoveredPdfSectionLabel(true, bestSection.metrics && bestSection.metrics.sectionKindLabel || "PDF", getPdfSectionPageNumber(bestSection));
      }
      if (!importantSections.some((section) => section.id === bestSection.id)) {
        importantSections.unshift(bestSection);
      }
    }
    importantSections = importantSections.filter((section, index, list) => section && list.findIndex((candidate) => candidate.id === section.id) === index);
    const nextImportant = model.sections.find((section) => section.id === model.nextImportantId && (!bestSection || section.id !== bestSection.id))
      || importantSections.find((section) => !bestSection || section.id !== bestSection.id)
      || model.sections.find((section) => !bestSection || section.id !== bestSection.id)
      || null;
    const previousDiagnostics = model.diagnostics && typeof model.diagnostics === "object" ? model.diagnostics : {};
    const previousProfile = model.pageProfile && typeof model.pageProfile === "object" ? model.pageProfile : {};
    const confidence = Number.isFinite(Number(model.confidence)) && Number(model.confidence) > 0
      ? Math.round(Number(model.confidence))
      : Math.min(98, Math.max(72, Math.round(bestSection && bestSection.score || 88)));

    model.pageProfile = {
      ...previousProfile,
      type: "pdf",
      label: "PDF",
      readingConfidence: Number(previousProfile.readingConfidence) || confidence,
      quietMode: false,
      reason: previousProfile.reason || recoveredReason,
      quietReason: "",
      diagnosticHint: previousProfile.diagnosticHint || (entrySource === "ocr" ? ocrQuality.message || "PDF OCR text was recovered and converted into page-based SkimRoute sections." : "PDF text was recovered and converted into page-based SkimRoute sections."),
      ocrQuality: previousProfile.ocrQuality || ocrQuality.quality || "",
      qualityMessage: previousProfile.qualityMessage || ocrQuality.message || "",
      qualityScore: Number(previousProfile.qualityScore || ocrQuality.score || 0),
      isAmbiguous: false,
      adapterName: "pdf"
    };
    model.importantSections = importantSections;
    model.bestSectionId = bestSection && bestSection.id || "";
    model.nextImportantId = nextImportant && nextImportant.id || "";
    model.skipTargetId = model.skipTargetId || model.bestSectionId;
    model.confidence = confidence;
    model.confidenceTier = model.confidenceTier || "high";
    model.confidenceLabel = model.confidenceLabel || "PDF mapped";
    model.hasStrongTarget = Boolean(bestSection);
    const bestSectionLabel = bestSection && (bestSection.label || formatRecoveredPdfSectionLabel(true, bestSection.metrics && bestSection.metrics.sectionKindLabel || "PDF", getPdfSectionPageNumber(bestSection))) || "";
    const currentBestLabel = String(model.bestLabel || "").trim();
    model.bestLabel = currentBestLabel && !/^(pdf map ready|pdf mapped|pdf map)$/i.test(currentBestLabel)
      ? currentBestLabel
      : bestSectionLabel || "PDF map ready";
    model.bestKind = model.bestKind || bestSection && bestSection.metrics && bestSection.metrics.sectionKind || "";
    model.bestKindLabel = model.bestKindLabel || bestSection && bestSection.metrics && bestSection.metrics.sectionKindLabel || "";
    model.totalReadableWords = totalReadableWords;
    model.totalWords = totalReadableWords;
    model.readingMinutes = Number(model.readingMinutes) || Math.max(1, Math.ceil(totalReadableWords / 240));
    model.savedMinutes = Number(model.savedMinutes) || Math.max(1, Math.ceil(Math.max(0, totalReadableWords - (bestSection ? bestSection.wordCount || 0 : 0)) / 240));
    model.routeKey = routeKey || model.routeKey || getPdfDocumentRouteKey();
    if (!model.routeHash) {
      model.routeHash = runtime.engine && runtime.engine.helpers && runtime.engine.helpers.hashText
        ? runtime.engine.helpers.hashText(model.routeKey)
        : String(model.routeKey || "").slice(0, 80);
    }
    model.adapterName = model.adapterName || "pdf";
    model.diagnostics = {
      ...previousDiagnostics,
      adapterName: "pdf",
      adapterFamily: "pdf",
      sectionWords: totalReadableWords,
      effectiveWords: totalReadableWords,
      adapterUnitsCount: model.sections.length,
      useAdapterUnits: true,
      unitSectionsCount: model.sections.length,
      rawSectionCount: model.sections.length,
      recoveredPdf: true,
      recoveredPdfSource: entrySource,
      recoveredPdfCacheSource: entry && entry.cacheSource || previousDiagnostics.recoveredPdfCacheSource || runtime.pdfOcr && runtime.pdfOcr.cacheSource || "",
      recoveredPdfCacheHit: Boolean(entry && entry.cacheHit || previousDiagnostics.recoveredPdfCacheHit || runtime.pdfOcr && runtime.pdfOcr.cacheHit),
      recoveredPdfCacheUpdatedAt: Number(entry && entry.updatedAt || previousDiagnostics.recoveredPdfCacheUpdatedAt || runtime.pdfOcr && runtime.pdfOcr.cacheUpdatedAt || 0),
      recoveredPdfQuality: previousDiagnostics.recoveredPdfQuality || ocrQuality.quality || "",
      recoveredPdfQualityScore: Number(previousDiagnostics.recoveredPdfQualityScore || ocrQuality.score || 0),
      recoveredPages: Number(previousDiagnostics.recoveredPages || entry && entry.pages && entry.pages.length || 0),
      recoveredWords: Number(previousDiagnostics.recoveredWords || entry && entry.words || totalReadableWords),
      pageProfileBefore: previousDiagnostics.pageProfileBefore || baseModel && baseModel.pageProfile || null,
      pageProfileAfter: model.pageProfile
    };
    if (!model.structureSignature) {
      model.structureSignature = `pdf-recovered:${model.routeKey}:${model.sections.length}:${totalReadableWords}:${entry && entry.updatedAt || 0}:normalized`;
    }

    const repairedAny = Object.values(repaired).some(Boolean);
    if (options.emit !== false && repairedAny) {
      emitDebugNoStats("pdf:cache:model-repaired-internal", {
        reason,
        routeKey: model.routeKey,
        repaired,
        modelSectionsCount: model.sections.length,
        modelWordsCount: totalReadableWords,
        modelImportantCount: model.importantSections.length,
        modelBestLabelPresent: Boolean(model.bestLabel),
        modelConfidence: model.confidence,
        internalOnly: true,
        exactIssue: "Internal cached PDF model was repaired before verified public status/action use."
      });
    }
    rememberNormalizedPdfModel(model, routeKey);
    return model;
  }

  function getRecoveredPdfPublicReason(model) {
    const diagnostics = model && model.diagnostics || {};
    const profile = model && model.pageProfile || {};
    const source = String(diagnostics.recoveredPdfSource || runtime.pdfOcr && runtime.pdfOcr.source || "pdfjs").toLowerCase();
    if (source === "ocr") {
      return profile.qualityMessage || profile.reason || "PDF OCR text recovered";
    }
    return "PDF text recovered with PDF.js";
  }

  function verifyPdfPublicStatusTopLevelFields(status) {
    const missingFields = [];
    const hasNumber = (value) => Number.isFinite(Number(value));
    const hasPositiveNumber = (value) => hasNumber(value) && Number(value) > 0;
    const hasText = (value) => String(value || "").trim().length > 0;
    if (!status || status.pageType !== "pdf") missingFields.push("pageType");
    if (!status || status.pageLabel !== "PDF") missingFields.push("pageLabel");
    if (!status || status.quietMode !== false) missingFields.push("quietMode");
    if (!status || !hasText(status.reason)) missingFields.push("reason");
    if (!status || !hasPositiveNumber(status.sections)) missingFields.push("sections");
    if (!status || !hasPositiveNumber(status.words)) missingFields.push("words");
    if (!status || !hasNumber(status.important)) missingFields.push("important");
    if (!status || !hasPositiveNumber(status.confidence)) missingFields.push("confidence");
    if (!status || !hasText(status.confidenceLabel)) missingFields.push("confidenceLabel");
    if (!status || !hasText(status.bestLabel)) missingFields.push("bestLabel");
    return {
      hasTopLevelFields: missingFields.length === 0,
      missingFields
    };
  }

  function finalizePdfPublicStatus(status, model, options = {}) {
    if (!status || !model) return status;
    const sections = Array.isArray(model.sections) ? model.sections : [];
    const importantSections = Array.isArray(model.importantSections) ? model.importantSections : [];
    const diagnostics = model.diagnostics || {};
    const bestSection = sections.find((section) => section && section.id === model.bestSectionId)
      || sections.find((section) => section && section.isBest)
      || importantSections[0]
      || sections[0]
      || null;
    const words = Number(status.words || model.totalReadableWords || model.totalWords || diagnostics.recoveredWords || diagnostics.effectiveWords || diagnostics.sectionWords || 0);
    const sectionCount = Number(status.sections || sections.length || diagnostics.unitSectionsCount || diagnostics.adapterUnitsCount || 0);
    const derivedImportantCount = importantSections.length
      || sections.filter((section) => section && section.isImportant).length
      || (sectionCount > 0 && diagnostics.recoveredPdf ? Math.min(4, sectionCount) : 0);
    const importantCount = Number(status.important) > 0
      ? Number(status.important)
      : derivedImportantCount;
    const confidence = Number(status.confidence || model.confidence || model.pageProfile && model.pageProfile.readingConfidence || 0)
      || (sectionCount > 0 && diagnostics.recoveredPdf ? 98 : sectionCount > 0 ? 88 : 0);
    const sectionBestLabel = bestSection && (bestSection.label || formatRecoveredPdfSectionLabel(true, bestSection.metrics && bestSection.metrics.sectionKindLabel || "PDF", getPdfSectionPageNumber(bestSection))) || "";
    const existingBestLabel = String(status.bestLabel || model.bestLabel || "").trim();
    const bestLabel = existingBestLabel && !/^(pdf map ready|pdf mapped|pdf map)$/i.test(existingBestLabel)
      ? existingBestLabel
      : sectionBestLabel || existingBestLabel;
    status.pageType = "pdf";
    status.pageLabel = "PDF";
    status.quietMode = false;
    status.reason = String(status.reason || getRecoveredPdfPublicReason(model)).trim();
    status.sections = sectionCount;
    status.words = words;
    status.important = importantCount;
    status.confidence = Math.round(confidence);
    status.confidenceLabel = String(status.confidenceLabel || model.confidenceLabel || "PDF mapped").trim();
    status.bestLabel = bestLabel || "PDF map ready";

    const verification = verifyPdfPublicStatusTopLevelFields(status);
    status.pdfStatusVerified = verification.hasTopLevelFields;
    status.pdfStatusMissingFields = verification.missingFields;
    if (status.pdfDiagnosticSummary && typeof status.pdfDiagnosticSummary === "object") {
      status.pdfDiagnosticSummary.publicStatusVerified = verification.hasTopLevelFields;
      status.pdfDiagnosticSummary.publicStatusMissingFields = verification.missingFields;
    }
    if (!verification.hasTopLevelFields) {
      status.pdfReady = false;
      status.canJump = false;
      status.canJumpNext = false;
      status.pdfJumpReady = false;
      status.usableSnapshot = false;
    }
    if (options.emit !== false) {
      const payload = {
        reason: options.reason || "public-stats",
        routeKey: model.routeKey || getPdfDocumentRouteKey(),
        hasTopLevelFields: verification.hasTopLevelFields,
        missingFields: verification.missingFields,
        pageType: status.pageType || "",
        pageLabel: status.pageLabel || "",
        quietMode: status.quietMode,
        reasonText: status.reason || "",
        sections: status.sections,
        words: status.words,
        important: status.important,
        confidence: status.confidence,
        confidenceLabel: status.confidenceLabel || "",
        bestLabel: status.bestLabel || "",
        exactIssue: verification.hasTopLevelFields
          ? "Cached PDF public status has all required top-level fields."
          : "Cached PDF public status is missing required top-level fields and will not be treated as action-ready."
      };
      if (verification.hasTopLevelFields) {
        emitDebugWithStats("pdf:cache:status-normalized", payload, status);
        emitDebugWithStats("pdf:cache:status-normalized:verified", payload, status);
      } else {
        emitDebugWithStats("pdf:cache:status-normalize-failed", payload, status);
      }
    }
    return status;
  }

  function getVerifiedPdfActionStatus(type, reason = "action", options = {}) {
    if (!isPdfActionContext()) {
      return { ok: true, stats: null, missingFields: [], section: null, pageNumber: 0 };
    }
    const routeKey = getPdfDocumentRouteKey();
    const modelReady = Boolean(
      runtime.model
      && runtime.model.pageProfile
      && runtime.model.pageProfile.type === "pdf"
      && isUsablePdfStatsModel(runtime.model, true)
    ) || Boolean(
      runtime.stablePdfModel
      && runtime.stablePdfRouteKey === routeKey
      && isUsablePdfStatsModel(runtime.stablePdfModel, true)
    ) || Boolean(
      runtime.recoveredPdfModelCache
      && runtime.recoveredPdfModelCache.routeKey === routeKey
      && isUsablePdfStatsModel(runtime.recoveredPdfModelCache.model, true)
    );
    const section = type === "toggle" ? null : selectPdfActionSection(type, options);
    const pageNumber = getPdfSectionPageNumber(section);
    const hasTarget = type === "toggle" || Boolean(section && pageNumber);
    return {
      ok: Boolean(modelReady && hasTarget),
      stats: {
        ok: true,
        pageType: "pdf",
        pdfStatusVerified: modelReady,
        sections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
        words: runtime.model && runtime.model.totalReadableWords || 0
      },
      section,
      pageNumber,
      missingFields: modelReady ? [] : ["readyPdfModel"],
      blockedReason: modelReady ? "pdf-target-not-ready" : "pdf-action-model-not-ready",
      reason
    };
  }

  function buildRecoveredPdfModelFromSnapshot(entry, routeKey, baseModel = null, options = {}) {
    const snapshot = normalizePdfMapSnapshot(entry && entry.mapSnapshot);
    if (!snapshot) return null;
    const anchorRoot = getPdfAnchorRoot();
    if (!anchorRoot) return null;
    const importantIds = new Set(snapshot.importantSectionIds || []);
    const sections = snapshot.sections.map((section) => {
      const unitMeta = {
        ...section.unitMeta,
        navigationTarget: section.unitMeta.navigationTarget || `#page=${section.pageNumber}`,
        synthetic: true,
        pdfjs: entry.source !== "ocr",
        ocr: entry.source === "ocr"
      };
      const metrics = {
        score: section.score,
        usefulScore: section.usefulScore,
        importanceScore: section.importanceScore,
        densityScore: 0,
        structureScore: 0,
        semanticScore: 0,
        positionScore: 0,
        penalties: 0,
        matched: section.metrics.matched || {},
        sectionKind: section.metrics.sectionKind,
        sectionKindLabel: section.metrics.sectionKindLabel,
        pdfSectionType: section.metrics.pdfSectionType,
        ocrRole: section.metrics.ocrRole || unitMeta.ocrRole || "",
        ocrRoleLabel: section.metrics.ocrRoleLabel || unitMeta.ocrRoleLabel || "",
        selectionReason: section.metrics.selectionReason,
        intentScores: section.metrics.intentScores || null
      };
      return {
        id: section.id,
        title: section.title,
        anchor: anchorRoot,
        blocks: [anchorRoot],
        source: "pdf",
        pageNumber: section.pageNumber,
        navigationTarget: section.navigationTarget || `#page=${section.pageNumber}`,
        index: section.index,
        level: section.level,
        parentId: null,
        childIds: [],
        isCollapsed: runtime.view && runtime.view.collapsedSectionIds ? runtime.view.collapsedSectionIds.has(section.id) : false,
        text: section.text,
        wordCount: section.wordCount,
        top: section.top,
        unitMeta,
        metrics,
        score: section.score,
        usefulScore: section.usefulScore,
        importanceScore: section.importanceScore,
        label: section.label,
        intelligence: normalizeSectionIntelligenceForPublic(section, "pdf"),
        isImportant: section.isImportant || importantIds.has(section.id),
        isBest: section.isBest || section.id === snapshot.bestSectionId
      };
    });
    const importantSections = sections.filter((section) => section.isImportant).sort(compareRecoveredPdfSections);
    const totalReadableWords = Number(snapshot.totalReadableWords) || sections.reduce((sum, section) => sum + section.wordCount, 0);
    const ocrQuality = entry.source === "ocr" ? getPdfOcrQuality(entry) : { quality: "", message: "", score: 0 };
    const model = {
      adapterName: "pdf",
      articleRoot: anchorRoot,
      pageProfile: {
        type: "pdf",
        label: "PDF",
        readingConfidence: entry.source === "ocr" && ocrQuality.quality === "low" ? 62 : entry.source === "ocr" && ocrQuality.quality === "weak_structure" ? 72 : 88,
        quietMode: false,
        reason: entry.source === "ocr" ? ocrQuality.message || "PDF OCR text recovered" : "PDF text recovered with PDF.js",
        quietReason: "",
        diagnosticHint: entry.source === "ocr" ? ocrQuality.message || "PDF text was recovered and converted into page-based SkimRoute sections." : "PDF text was recovered and converted into page-based SkimRoute sections.",
        ocrQuality: ocrQuality.quality,
        qualityMessage: ocrQuality.message,
        qualityScore: ocrQuality.score,
        pageEvidence: {
          articleEvidence: 2,
          quietEvidence: 0,
          paragraphs: 0,
          controls: document.querySelectorAll ? document.querySelectorAll("input, textarea, select, button, [role='button']").length : 0,
          links: document.links ? document.links.length : 0,
          resultItems: 0,
          commerceNodes: 0,
          appShellNodes: 0,
          searchNodes: 0,
          conversationEvidence: 0,
          conversationNodes: 0,
          assistantHits: 0,
          userHits: 0,
          codeBlocks: 0,
          transcriptStyle: "",
          prefixCount: 0,
          reason: "PDF recovered text map found"
        },
        isAmbiguous: false,
        adapterName: "pdf"
      },
      sections,
      importantSections,
      bestSectionId: snapshot.bestSectionId || sections.find((section) => section.isBest)?.id || sections[0] && sections[0].id || "",
      nextImportantId: snapshot.nextImportantId || importantSections.find((section) => section.id !== snapshot.bestSectionId)?.id || "",
      skipTargetId: snapshot.skipTargetId || snapshot.bestSectionId || "",
      confidence: snapshot.confidence || 88,
      confidenceTier: snapshot.confidenceTier || "high",
      confidenceLabel: snapshot.confidenceLabel || "PDF mapped",
      hasStrongTarget: Boolean(snapshot.bestSectionId || sections.length),
      bestLabel: snapshot.bestLabel || "PDF map ready",
      bestKind: snapshot.bestKind || "",
      bestKindLabel: snapshot.bestKindLabel || "",
      savedMinutes: snapshot.savedMinutes || Math.max(1, Math.ceil(totalReadableWords / 240)),
      totalWords: totalReadableWords,
      totalReadableWords,
      readingMinutes: snapshot.readingMinutes || Math.max(1, Math.ceil(totalReadableWords / 240)),
      routeKey,
      routeHash: runtime.engine && runtime.engine.helpers && runtime.engine.helpers.hashText ? runtime.engine.helpers.hashText(routeKey) : String(routeKey || "").slice(0, 80),
      diagnostics: {
        adapterName: "pdf",
        adapterFamily: "pdf",
        rootTag: anchorRoot && anchorRoot.tagName ? anchorRoot.tagName.toLowerCase() : "body",
        rootId: anchorRoot && anchorRoot.id || "",
        rootClass: anchorRoot && anchorRoot.className ? String(anchorRoot.className).slice(0, 120) : "",
        rootWords: 0,
        sectionWords: totalReadableWords,
        effectiveWords: totalReadableWords,
        adapterUnitsCount: sections.length,
        useAdapterUnits: true,
        headingSectionsCount: 0,
        fallbackSectionsCount: 0,
        unitSectionsCount: sections.length,
        rawSectionCount: sections.length,
        recoveredPdf: true,
        recoveredPdfSource: entry.source || "pdfjs",
        recoveredPdfCacheSource: entry.cacheSource || runtime.pdfOcr.cacheSource || "",
        recoveredPdfCacheHit: Boolean(entry.cacheHit || runtime.pdfOcr.cacheHit),
        recoveredPdfCacheUpdatedAt: Number(entry.updatedAt) || 0,
        recoveredPdfQuality: ocrQuality.quality,
        recoveredPdfQualityScore: ocrQuality.score,
        recoveredPages: entry.pages && entry.pages.length || 0,
        recoveredWords: entry.words || totalReadableWords,
        pageProfileBefore: baseModel && baseModel.pageProfile || null,
        pageProfileAfter: null,
        recoveredPdfMapSnapshot: true
      },
      structureSignature: `pdf-recovered:${routeKey}:${sections.length}:${totalReadableWords}:${entry.updatedAt || 0}:map`
    };
    model.diagnostics.pageProfileAfter = model.pageProfile;
    return reanchorRecoveredPdfModel(model, anchorRoot, entry, baseModel, options);
  }

  function savePdfMapSnapshotForEntry(routeKey, entry, model) {
    const snapshot = createPdfMapSnapshotFromModel(model, routeKey);
    if (!routeKey || !snapshot) return false;
    const store = getPdfOcrStore();
    const normalized = normalizePdfCacheEntry({ ...entry, mapSnapshot: snapshot });
    if (!normalized) return false;
    getPdfCacheRouteKeys(routeKey).forEach((key) => {
      store[key] = normalized;
    });
    persistPdfSessionCacheEntry(routeKey, normalized);
    runtime.pdfOcr.cachePersistPromise = persistPdfPersistentCacheEntry(routeKey, normalized);
    runtime.pdfOcr.lastRecoveredEntry = normalized;
    return true;
  }

  function buildSimpleOcrRecoveredPdfModel(entry, routeKey = getPdfDocumentRouteKey(), reason = "ocr-fallback", baseModel = null, options = {}) {
    const sourceEntry = normalizePdfCacheEntry({ ...(entry || {}), source: "ocr" }) || { ...(entry || {}), source: "ocr" };
    const rawText = String(sourceEntry.text || entry && entry.text || runtime.pdfOcr && runtime.pdfOcr.lastRawOcrText || "").trim();
    const pages = sourceEntry.pages && sourceEntry.pages.length
      ? sourceEntry.pages
      : normalizePdfRecoveryPages([{ pageNumber: 1, text: rawText }]);
    const anchorRoot = typeof getPdfAnchorRoot === "function"
      ? getPdfAnchorRoot()
      : document.querySelector("#viewer, #viewerContainer, pdf-viewer, main, [role='main']") || document.body;
    if (!anchorRoot) return null;
    const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const fallbackChunks = [];
    pages.forEach((page, pageIndex) => {
      const pageNumber = Number(page && page.pageNumber) || pageIndex + 1;
      const text = cleanText(page && page.text);
      const words = countPdfWords(text);
      if (!text || words < 1) return;
      const structuredChunks = buildRecoveredPdfOcrLetterChunks(page, cleanText, countPdfWords);
      if (structuredChunks.length) {
        structuredChunks.forEach((chunk, index) => {
          fallbackChunks.push({
            ...chunk,
            pageNumber,
            chunkIndex: fallbackChunks.length,
            chunkCount: structuredChunks.length,
            text: cleanText(chunk.text),
            sectionText: cleanText(chunk.sectionText || chunk.text),
            words: Number(chunk.words) || countPdfWords(chunk.text)
          });
        });
        return;
      }
      const lineBacked = buildRecoveredPdfOcrLineBackedChunk(page && page.lines || [], "unknown", cleanText, countPdfWords, {
        pageNumber,
        chunkIndex: 0,
        chunkCount: 1
      });
      if (lineBacked) {
        fallbackChunks.push({
          ...lineBacked,
          pageNumber,
          chunkIndex: 0,
          chunkCount: 1,
          text,
          sectionText: text,
          words
        });
        return;
      }
      const ocrGeometry = mergePdfOcrGeometries(page && page.lines || []);
      fallbackChunks.push({
        pageNumber,
        chunkIndex: 0,
        chunkCount: 1,
        text,
        sectionText: text,
        words,
        relativeY: ocrGeometry && Number.isFinite(ocrGeometry.relativeY) ? ocrGeometry.relativeY : 0.12,
        relativeYStart: ocrGeometry && Number.isFinite(ocrGeometry.relativeYStart) ? ocrGeometry.relativeYStart : 0.08,
        relativeYEnd: ocrGeometry && Number.isFinite(ocrGeometry.relativeYEnd) ? ocrGeometry.relativeYEnd : 0.9,
        ocrGeometry,
        pageWidth: ocrGeometry && ocrGeometry.pageWidth || 0,
        pageHeight: ocrGeometry && ocrGeometry.pageHeight || 0,
        ocrVariantName: ocrGeometry && ocrGeometry.ocrVariantName || page && page.recognitionVariant || "",
        sourceLineIds: ocrGeometry && ocrGeometry.sourceLineIds || [],
        ocrSourceLines: normalizePdfOcrSourceLines(page && page.lines || []),
        sourceLineTextSample: ocrGeometry && ocrGeometry.sourceLineTextSample || text.slice(0, 260),
        ocrGeometryExact: Boolean(ocrGeometry && ocrGeometry.exact && ocrGeometry.sourceLineIds && ocrGeometry.sourceLineIds.length && isPdfOcrExactGeometryUsable(ocrGeometry)),
        ocrHighlightApproximate: !Boolean(ocrGeometry && ocrGeometry.exact && ocrGeometry.sourceLineIds && ocrGeometry.sourceLineIds.length && isPdfOcrExactGeometryUsable(ocrGeometry))
      });
    });
    if (!fallbackChunks.length) return null;

    const parserError = getPdfOcrParserErrorForDiagnostic(options.parserError || runtime.pdfOcr && runtime.pdfOcr.lastParserError);
    const finalRouteKey = routeKey || getPdfDocumentRouteKey();
    const routeHash = runtime.engine && runtime.engine.helpers && typeof runtime.engine.helpers.hashText === "function"
      ? runtime.engine.helpers.hashText(finalRouteKey)
      : String(finalRouteKey || "").slice(0, 80);
    const sections = fallbackChunks.map((chunk, index) => {
      const ocrRole = classifyRecoveredPdfOcrRole(chunk, index, fallbackChunks.length, "");
      const ocrRoleLabel = recoveredPdfOcrRoleLabel(ocrRole);
      const sectionKind = ocrRole ? recoveredPdfOcrRoleKind(ocrRole) : "ocr_page";
      const sectionKindLabel = ocrRoleLabel || "OCR page";
      const selectionReason = ocrRole ? recoveredPdfOcrSelectionReason(ocrRole, chunk.text) : "simple OCR page fallback after parser/scoring failure";
      const roleEvidence = getRecoveredPdfOcrRoleEvidence(ocrRole, chunk.text, {
        sourceLines: chunk.ocrSourceLines,
        words: chunk.words
      });
      const score = Math.max(24, Math.min(96, scoreRecoveredPdfChunk({ ...chunk, ocrRole }, index, fallbackChunks.length, "ocr_fallback")));
      const syntheticTop = chunk.pageNumber * 100000 + index * 1000;
      const id = `pp-pdf-ocr-fallback-${chunk.pageNumber}-${index}`;
      const unitMeta = {
        kind: "pdf-ocr",
        sectionId: id,
        pageNumber: chunk.pageNumber,
        pdfSectionType: "ocr_fallback",
        ocrRole,
        ocrRoleLabel,
        ocrRoleConfidence: roleEvidence.confidence,
        ocrRoleReasons: roleEvidence.reasons,
        chunkIndex: index,
        chunkCount: 1,
        relativeY: chunk.relativeY,
        relativeYStart: chunk.relativeYStart,
        relativeYEnd: chunk.relativeYEnd,
        ocrGeometry: normalizePdfOcrGeometry(chunk.ocrGeometry || chunk),
        ocrBoundingBox: normalizePdfOcrGeometry(chunk.ocrGeometry || chunk) && normalizePdfOcrGeometry(chunk.ocrGeometry || chunk).bbox || null,
        ocrExactGeometry: Boolean(chunk.ocrGeometryExact && normalizePdfOcrGeometry(chunk.ocrGeometry || chunk) && normalizePdfOcrGeometry(chunk.ocrGeometry || chunk).exact),
        ocrHighlightApproximate: Boolean(chunk.ocrHighlightApproximate) || !Boolean(chunk.ocrGeometryExact && normalizePdfOcrGeometry(chunk.ocrGeometry || chunk) && normalizePdfOcrGeometry(chunk.ocrGeometry || chunk).exact),
        ocrVariantName: chunk.ocrVariantName || "",
        sourceLineIds: Array.isArray(chunk.sourceLineIds) ? chunk.sourceLineIds.slice(0, 120) : [],
        ocrSourceLines: normalizePdfOcrSourceLines(chunk.ocrSourceLines),
        sourceLineTextSample: chunk.sourceLineTextSample || chunk.text.slice(0, 260),
        sectionText: String(chunk.sectionText || chunk.text || "").slice(0, 7000),
        sectionTextSample: String(chunk.sectionText || chunk.text || "").slice(0, 260),
        ocrPageWidth: Number(chunk.pageWidth || chunk.ocrGeometry && chunk.ocrGeometry.pageWidth || 0) || 0,
        ocrPageHeight: Number(chunk.pageHeight || chunk.ocrGeometry && chunk.ocrGeometry.pageHeight || 0) || 0,
        lineStart: Number(chunk.lineStart) || 0,
        lineEnd: Number(chunk.lineEnd) || 0,
        excerpt: chunk.text.slice(0, 240),
        navigationTarget: `#page=${chunk.pageNumber}`,
        synthetic: true,
        pdfjs: false,
        ocr: true,
        syntheticTop,
        words: chunk.words,
        parserFallback: true,
        diagnosticReason: selectionReason
      };
      return {
        id,
        title: `Page ${chunk.pageNumber}`,
        anchor: anchorRoot,
        blocks: [anchorRoot],
        source: "pdf",
        pageNumber: chunk.pageNumber,
        navigationTarget: `#page=${chunk.pageNumber}`,
        index,
        level: 2,
        parentId: null,
        childIds: [],
        isCollapsed: runtime.view && runtime.view.collapsedSectionIds ? runtime.view.collapsedSectionIds.has(id) : false,
        text: chunk.text,
        wordCount: chunk.words,
        top: syntheticTop,
        unitMeta,
        metrics: {
          wordCount: chunk.words,
          linkCount: 0,
          links: 0,
          codeBlocks: 0,
          tables: 0,
          fluffScore: 12,
          usefulScore: Math.max(30, Math.round(score * 0.62)),
          importanceScore: score,
          adapterScore: 0,
          sectionKind,
          sectionKindLabel,
          pdfSectionType: "ocr_fallback",
          ocrRole,
          ocrRoleLabel,
          ocrRoleConfidence: roleEvidence.confidence,
          ocrRoleReasons: roleEvidence.reasons,
          matched: {
            ocrLetterBody: ocrRole === "body",
            ocrResults: ocrRole === "results",
            ocrConclusion: ocrRole === "conclusion",
            ocrRecommendations: ocrRole === "recommendations",
            ocrFormNotice: ocrRole === "form_notice",
            ocrTotalDue: ocrRole === "total_due"
          },
          selectionReason
        },
        score,
        usefulScore: Math.max(30, Math.round(score * 0.62)),
        importanceScore: score,
        label: `Page ${chunk.pageNumber}`,
        isImportant: false,
        isBest: false
      };
    });
    const ranked = [...sections].sort(compareRecoveredPdfSections);
    const best = ranked.find((section) => isRecoveredPdfOcrStrongContentRole(section && section.metrics && section.metrics.ocrRole)) || ranked[0] || sections[0];
    const importantLimit = Math.min(9, Math.max(1, Math.ceil(sections.length * 0.35)));
    const importantIds = new Set(ranked.slice(0, importantLimit).map((section) => section.id));
    sections.forEach((section) => {
      section.isBest = section.id === best.id;
      section.isImportant = section.isBest || importantIds.has(section.id);
      section.label = section.isImportant ? formatRecoveredPdfSectionLabel(section.isBest, section.metrics.sectionKindLabel, section.pageNumber) : "";
    });
    const importantSections = sections.filter((section) => section.isImportant).sort(compareRecoveredPdfSections);
    const nextImportant = importantSections.find((section) => section.id !== best.id) || sections.find((section) => section.id !== best.id) || null;
    const totalReadableWords = sections.reduce((sum, section) => sum + section.wordCount, 0);
    const ocrQuality = {
      quality: "weak_structure",
      message: PDF_OCR_APPROXIMATE_MESSAGE,
      score: 48
    };
    const model = {
      adapterName: "pdf",
      articleRoot: anchorRoot,
      pageProfile: {
        type: "pdf",
        label: "PDF",
        readingConfidence: 72,
        quietMode: false,
        reason: ocrQuality.message,
        quietReason: "",
        diagnosticHint: "Smart OCR section scoring failed, so SkimRoute built a simple OCR page map.",
        ocrQuality: ocrQuality.quality,
        qualityMessage: ocrQuality.message,
        qualityScore: ocrQuality.score,
        pageEvidence: {
          articleEvidence: 2,
          quietEvidence: 0,
          paragraphs: 0,
          controls: document.querySelectorAll ? document.querySelectorAll("input, textarea, select, button, [role='button']").length : 0,
          links: document.links ? document.links.length : 0,
          resultItems: 0,
          commerceNodes: 0,
          appShellNodes: 0,
          searchNodes: 0,
          conversationEvidence: 0,
          conversationNodes: 0,
          assistantHits: 0,
          userHits: 0,
          codeBlocks: 0,
          transcriptStyle: "",
          prefixCount: 0,
          reason: "OCR fallback page map built"
        },
        isAmbiguous: false,
        adapterName: "pdf"
      },
      sections,
      importantSections,
      bestSectionId: best && best.id || "",
      nextImportantId: nextImportant && nextImportant.id || "",
      skipTargetId: best && best.id || "",
      confidence: 72,
      confidenceTier: "medium",
      confidenceLabel: "PDF OCR mapped",
      hasStrongTarget: Boolean(best),
      bestLabel: best ? best.label || `Page ${best.pageNumber}` : "PDF OCR mapped",
      bestKind: best && best.metrics ? best.metrics.sectionKind || "ocr_page" : "ocr_page",
      bestKindLabel: best && best.metrics ? best.metrics.sectionKindLabel || "OCR page" : "OCR page",
      savedMinutes: Math.max(1, Math.ceil(Math.max(0, totalReadableWords - (best ? best.wordCount : 0)) / 240)),
      totalWords: totalReadableWords,
      totalReadableWords,
      readingMinutes: Math.max(1, Math.ceil(totalReadableWords / 240)),
      routeKey: finalRouteKey,
      routeHash,
      diagnostics: {
        adapterName: "pdf",
        adapterFamily: "pdf",
        rootTag: anchorRoot && anchorRoot.tagName ? anchorRoot.tagName.toLowerCase() : "body",
        rootId: anchorRoot && anchorRoot.id || "",
        rootClass: anchorRoot && anchorRoot.className ? String(anchorRoot.className).slice(0, 120) : "",
        rootWords: 0,
        sectionWords: totalReadableWords,
        effectiveWords: totalReadableWords,
        adapterUnitsCount: sections.length,
        useAdapterUnits: true,
        headingSectionsCount: 0,
        fallbackSectionsCount: sections.length,
        unitSectionsCount: sections.length,
        rawSectionCount: sections.length,
        recoveredPdf: true,
        recoveredPdfSource: "ocr",
        recoveredPdfCacheSource: sourceEntry.cacheSource || runtime.pdfOcr.cacheSource || "",
        recoveredPdfCacheHit: Boolean(sourceEntry.cacheHit || runtime.pdfOcr.cacheHit),
        recoveredPdfCacheUpdatedAt: Number(sourceEntry.updatedAt) || 0,
        recoveredPdfQuality: ocrQuality.quality,
        recoveredPdfQualityScore: ocrQuality.score,
        recoveredPages: pages.length,
        recoveredWords: sourceEntry.words || totalReadableWords,
        pageProfileBefore: baseModel && baseModel.pageProfile || null,
        pageProfileAfter: null,
        parserFallbackUsed: true,
        parserFallbackSections: sections.length,
        parserErrorName: parserError && parserError.parserErrorName || "",
        parserErrorMessage: parserError && parserError.parserErrorMessage || "",
        parserErrorStack: parserError && parserError.parserErrorStack || "",
        parserErrorPhase: parserError && parserError.parserErrorPhase || ""
      },
      structureSignature: `pdf-ocr-fallback:${finalRouteKey}:${sections.length}:${totalReadableWords}:${sourceEntry.updatedAt || 0}:${reason}`
    };
    model.diagnostics.pageProfileAfter = model.pageProfile;
    const normalizedModel = typeof normalizeRecoveredPdfModelForPublicStatus === "function"
      ? normalizeRecoveredPdfModelForPublicStatus(model, finalRouteKey, sourceEntry, baseModel, `ocr-fallback:${reason}`)
      : model;
    runtime.recoveredPdfModelCache = { routeKey: finalRouteKey, signature: normalizedModel.structureSignature, model: normalizedModel };
    if (typeof savePdfMapSnapshotForEntry === "function" && !sourceEntry.mapSnapshot) {
      savePdfMapSnapshotForEntry(finalRouteKey, sourceEntry, normalizedModel);
    }
    if (options.remember !== false) {
      rememberStablePdfModel(normalizedModel, `buildSimpleOcrRecoveredPdfModel:${reason}`);
    }
    emitDebug("pdf:model:ocr-fallback", {
      reason,
      routeKey: finalRouteKey,
      sections: normalizedModel.sections.length,
      words: normalizedModel.totalReadableWords || 0,
      parserErrorMessage: parserError && parserError.parserErrorMessage || "",
      exactIssue: "Smart OCR PDF sectioning/scoring failed, so SkimRoute built a simple page-based OCR map."
    });
    return normalizedModel;
  }


  function buildRecoveredPdfModelFromCache(routeKey = getPdfDocumentRouteKey(), reason = "pdf-cache", baseModel = null, options = {}) {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return null;
    const store = getPdfOcrStore();
    const cachedEntry = getPdfCacheRouteKeys(routeKey)
      .map((key) => store && store[key])
      .find(Boolean);
    let entry = normalizePdfCacheEntry(
      cachedEntry
      || (runtime.pdfOcr && runtime.pdfOcr.lastRecoveredEntry)
      || null
    );
    if (!isPdfCacheEntryUsable(entry)) return null;
    const fromCacheStore = Boolean(cachedEntry);
    const freshRecoveryReason = /^(pdf-text|pdf-ocr|pdf-full-text)$/i.test(String(reason || ""));
    if (fromCacheStore && !freshRecoveryReason) {
      entry.cacheHit = true;
      if (!entry.cacheSource || entry.cacheSource === "fresh") entry.cacheSource = "memory";
      runtime.pdfOcr.cacheHit = true;
      runtime.pdfOcr.cacheSource = entry.cacheSource;
      runtime.pdfOcr.cacheUpdatedAt = Number(entry.updatedAt) || runtime.pdfOcr.cacheUpdatedAt || Date.now();
    }
    const signature = getPdfCacheEntrySignature(routeKey, entry);
    const memo = runtime.recoveredPdfModelCache || {};
    const anchorRoot = getPdfAnchorRoot();
    if (
      signature
      && memo.routeKey === routeKey
      && memo.signature === signature
      && memo.model
      && anchorRoot
    ) {
      const model = reanchorRecoveredPdfModel(memo.model, anchorRoot, entry, baseModel, { cacheHit: entry.cacheHit, cacheSource: entry.cacheSource });
      runtime.recoveredPdfModelCache = { routeKey, signature, model };
      rememberNormalizedPdfModel(model, routeKey);
      emitDebug("pdf:cache:model-reused", {
        reason,
        routeKey,
        signature,
        sections: model.sections ? model.sections.length : 0,
        words: model.totalReadableWords || 0,
        cacheHit: Boolean(entry.cacheHit),
        cacheSource: entry.cacheSource || "",
        exactIssue: "A same-route recovered PDF model was already built in this tab, so SkimRoute reused it instead of rebuilding page sections."
      });
      return model;
    }

    const snapshotModel = buildRecoveredPdfModelFromSnapshot(entry, routeKey, baseModel, { cacheHit: entry.cacheHit, cacheSource: entry.cacheSource });
    if (snapshotModel) {
      const normalizedSnapshotModel = normalizeRecoveredPdfModelForPublicStatus(snapshotModel, routeKey, entry, baseModel, `snapshot:${reason}`);
      runtime.recoveredPdfModelCache = { routeKey, signature, model: normalizedSnapshotModel };
      emitDebug("pdf:cache:hit", {
        reason,
        routeKey,
        source: entry.source || "pdfjs",
        cacheSource: entry.cacheSource || "",
        sections: normalizedSnapshotModel.sections.length,
        words: normalizedSnapshotModel.totalReadableWords || 0,
        mapSnapshot: true,
        exactIssue: "A cached PDF map snapshot was used, so SkimRoute skipped PDF.js/OCR and skipped rebuilding the page map from raw text."
      });
      if (options.remember !== false) {
        rememberStablePdfModel(normalizedSnapshotModel, `buildRecoveredPdfModelFromCache:${reason}:snapshot`);
      }
      return normalizedSnapshotModel;
    }

    const helpers = runtime.engine && runtime.engine.helpers;
    const cleanText = helpers && typeof helpers.cleanText === "function"
      ? (value) => helpers.cleanText(value)
      : (value) => String(value || "").replace(/\s+/g, " ").trim();
    const countWords = helpers && typeof helpers.countWords === "function"
      ? (value) => helpers.countWords(value)
      : (value) => countPdfWords(value);
    const hashText = helpers && typeof helpers.hashText === "function"
      ? (value) => helpers.hashText(value)
      : (value) => String(value || "").slice(0, 64).replace(/[^a-z0-9]+/gi, "-").toLowerCase();

    if (!anchorRoot) return null;
    try {
    const pages = entry.pages && entry.pages.length
      ? entry.pages
      : normalizePdfRecoveryPages([{ pageNumber: 1, text: entry.text }]);
    const chunks = [];
    pages.forEach((page, pageIndex) => {
      const pageNumber = Number(page && page.pageNumber) || pageIndex + 1;
      const lineChunks = entry.source === "ocr"
        ? buildRecoveredPdfOcrLetterChunks(page, cleanText, countWords)
        : buildRecoveredPdfLineChunks(page && page.lines, cleanText, countWords);
      const fallbackTextChunks = buildRecoveredPdfTextChunks(page && page.text, cleanText, countWords);
      const textChunks = lineChunks.length
        ? lineChunks
        : entry.source === "ocr"
          ? splitRecoveredPdfOcrAdministrativePrefixChunks(fallbackTextChunks.map((chunk, index) => ({
              ...chunk,
              ocrRole: classifyRecoveredPdfOcrRole(chunk, index, fallbackTextChunks.length || 1)
            })), cleanText, countWords)
          : fallbackTextChunks;
      (textChunks.length ? textChunks : [{ text: cleanText(page && page.text), relativeY: 0.12 }]).forEach((chunk, chunkIndex) => {
        const text = cleanText(chunk && chunk.text);
        const words = countWords(text);
        const ocrRole = entry.source === "ocr" ? classifyRecoveredPdfOcrRole(chunk, chunkIndex, textChunks.length || 1) : "";
        if (
          words < 14
          && !(entry.source === "ocr" && (isCacheableShortOcrText(text, [page]) || isMeaningfulShortRecoveredPdfOcrRole(ocrRole, text, words)))
        ) return;
        chunks.push({
          pageNumber,
          chunkIndex,
          chunkCount: textChunks.length || 1,
          text,
          words,
          ocrRole,
          ocrRoleLabel: ocrRole ? recoveredPdfOcrRoleLabel(ocrRole) : "",
          relativeY: Number.isFinite(Number(chunk && chunk.relativeY)) ? Math.max(0, Math.min(1, Number(chunk.relativeY))) : Math.max(0.04, Math.min(0.96, (chunkIndex + 0.2) / Math.max(1, textChunks.length || 1))),
          relativeYStart: Number.isFinite(Number(chunk && chunk.relativeYStart)) ? Math.max(0, Math.min(1, Number(chunk.relativeYStart))) : null,
          relativeYEnd: Number.isFinite(Number(chunk && chunk.relativeYEnd)) ? Math.max(0, Math.min(1, Number(chunk.relativeYEnd))) : null,
          ocrGeometry: entry.source === "ocr" ? normalizePdfOcrGeometry(chunk && (chunk.ocrGeometry || chunk)) : null,
          ocrVariantName: entry.source === "ocr" ? String(chunk && chunk.ocrVariantName || chunk && chunk.ocrGeometry && chunk.ocrGeometry.ocrVariantName || "").slice(0, 80) : "",
          sourceLineIds: entry.source === "ocr" && Array.isArray(chunk && chunk.sourceLineIds) ? chunk.sourceLineIds.map((id) => String(id).slice(0, 140)).filter(Boolean).slice(0, 120) : [],
          ocrSourceLines: entry.source === "ocr" ? normalizePdfOcrSourceLines(chunk && chunk.ocrSourceLines) : [],
          sourceLineTextSample: entry.source === "ocr" ? String(chunk && (chunk.sourceLineTextSample || chunk.text) || "").replace(/\s+/g, " ").trim().slice(0, 260) : "",
          sectionText: entry.source === "ocr" ? String(chunk && (chunk.sectionText || chunk.text) || "").slice(0, 7000) : "",
          pageWidth: entry.source === "ocr" ? Number(chunk && (chunk.pageWidth || chunk.ocrGeometry && chunk.ocrGeometry.pageWidth) || 0) || 0 : 0,
          pageHeight: entry.source === "ocr" ? Number(chunk && (chunk.pageHeight || chunk.ocrGeometry && chunk.ocrGeometry.pageHeight) || 0) || 0 : 0,
          ocrGeometryExact: entry.source === "ocr" ? Boolean(chunk && chunk.ocrGeometryExact !== false && normalizePdfOcrGeometry(chunk && (chunk.ocrGeometry || chunk)) && normalizePdfOcrGeometry(chunk && (chunk.ocrGeometry || chunk)).exact && Array.isArray(chunk && chunk.sourceLineIds) && chunk.sourceLineIds.length && isPdfOcrExactGeometryUsable(normalizePdfOcrGeometry(chunk && (chunk.ocrGeometry || chunk)))) : false,
          ocrHighlightApproximate: entry.source === "ocr" ? Boolean(chunk && chunk.ocrHighlightApproximate) || !(Array.isArray(chunk && chunk.sourceLineIds) && chunk.sourceLineIds.length) : false,
          cropOffset: entry.source === "ocr" ? chunk && chunk.cropOffset || chunk && chunk.ocrGeometry && chunk.ocrGeometry.cropOffset || null : null,
          renderScale: entry.source === "ocr" ? Number(chunk && chunk.renderScale || chunk && chunk.ocrGeometry && chunk.ocrGeometry.renderScale || 0) || 0 : 0,
          rotation: entry.source === "ocr" ? Number(chunk && chunk.rotation || chunk && chunk.ocrGeometry && chunk.ocrGeometry.rotation || 0) || 0 : 0,
          lineStart: Number(chunk && chunk.lineStart) || 0,
          lineEnd: Number(chunk && chunk.lineEnd) || 0
        });
      });
    });

    if (!chunks.length) {
      if (entry.source === "ocr") {
        const fallbackModel = buildSimpleOcrRecoveredPdfModel(entry, routeKey, `${reason}:empty-chunks`, baseModel, {
          remember: options.remember
        });
        if (fallbackModel) return fallbackModel;
      }
      return null;
    }
    const ocrQuality = entry.source === "ocr"
      ? getPdfOcrQuality(entry)
      : { quality: "", message: "", score: 0 };

    const sections = chunks.map((chunk, index) => {
      const title = inferRecoveredPdfSectionTitle(chunk.pageNumber, chunk.text);
      const id = `pp-pdf-${chunk.pageNumber}-${chunk.chunkIndex}-${hashText(`${title}:${chunk.words}:${chunk.text.slice(0, 120)}`)}`;
      const pdfSectionType = classifyRecoveredPdfSectionType(chunk, index);
      const ocrRole = entry.source === "ocr" ? classifyRecoveredPdfOcrRole(chunk, index, chunks.length, pdfSectionType) : "";
      const ocrRoleLabel = ocrRole ? recoveredPdfOcrRoleLabel(ocrRole) : "";
      const sectionKind = ocrRole ? recoveredPdfOcrRoleKind(ocrRole) : recoveredPdfSectionKind(chunk, pdfSectionType);
      const sectionKindLabel = ocrRoleLabel || recoveredPdfKindLabel(sectionKind);
      const selectionReason = ocrRole ? recoveredPdfOcrSelectionReason(ocrRole, chunk.text) : "";
      const score = scoreRecoveredPdfChunk(chunk, index, chunks.length, pdfSectionType);
      const syntheticTop = chunk.pageNumber * 100000 + chunk.chunkIndex * 1000;
      const ocrGeometry = entry.source === "ocr" ? normalizePdfOcrGeometry(chunk.ocrGeometry || chunk) : null;
      const unitMeta = {
        kind: entry.source === "ocr" ? "pdf-ocr" : "pdfjs-page",
        sectionId: id,
        pageNumber: chunk.pageNumber,
        pdfSectionType,
        ocrRole,
        ocrRoleLabel,
        ocrRoleConfidence: Number(chunk.ocrRoleConfidence) || 0,
        ocrRoleReasons: Array.isArray(chunk.ocrRoleReasons) ? chunk.ocrRoleReasons.slice(0, 4) : [],
        chunkIndex: chunk.chunkIndex,
        chunkCount: chunk.chunkCount,
        relativeY: chunk.relativeY,
        relativeYStart: Number.isFinite(chunk.relativeYStart) ? chunk.relativeYStart : Math.max(0.02, chunk.relativeY - 0.025),
        relativeYEnd: Number.isFinite(chunk.relativeYEnd) ? chunk.relativeYEnd : Math.min(0.98, chunk.relativeY + 0.09),
        ocrGeometry,
        ocrBoundingBox: ocrGeometry && ocrGeometry.bbox || null,
        ocrExactGeometry: entry.source === "ocr" ? Boolean(chunk.ocrGeometryExact !== false && ocrGeometry && ocrGeometry.exact && chunk.sourceLineIds && chunk.sourceLineIds.length) : Boolean(ocrGeometry && ocrGeometry.exact),
        ocrHighlightApproximate: entry.source === "ocr" ? Boolean(chunk.ocrHighlightApproximate) || !Boolean(chunk.ocrGeometryExact !== false && ocrGeometry && ocrGeometry.exact && chunk.sourceLineIds && chunk.sourceLineIds.length) : false,
        ocrVariantName: chunk.ocrVariantName || ocrGeometry && ocrGeometry.ocrVariantName || "",
        sourceLineIds: Array.isArray(chunk.sourceLineIds) ? chunk.sourceLineIds.slice(0, 120) : [],
        ocrSourceLines: normalizePdfOcrSourceLines(chunk.ocrSourceLines),
        sourceLineTextSample: chunk.sourceLineTextSample || chunk.text.slice(0, 260),
        sectionText: String(chunk.sectionText || chunk.text || "").slice(0, 7000),
        sectionTextSample: String(chunk.sectionText || chunk.text || "").slice(0, 260),
        ocrPageWidth: Number(chunk.pageWidth || ocrGeometry && ocrGeometry.pageWidth || 0) || 0,
        ocrPageHeight: Number(chunk.pageHeight || ocrGeometry && ocrGeometry.pageHeight || 0) || 0,
        cropOffset: chunk.cropOffset || ocrGeometry && ocrGeometry.cropOffset || null,
        renderScale: Number(chunk.renderScale || ocrGeometry && ocrGeometry.renderScale || 0) || 0,
        rotation: Number(chunk.rotation || ocrGeometry && ocrGeometry.rotation || 0) || 0,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        excerpt: chunk.text.slice(0, 240),
        navigationTarget: `#page=${chunk.pageNumber}`,
        synthetic: true,
        pdfjs: entry.source !== "ocr",
        ocr: entry.source === "ocr",
        syntheticTop,
        words: chunk.words,
        diagnosticReason: selectionReason
      };
      return {
        id,
        title,
        anchor: anchorRoot,
        blocks: [anchorRoot],
        source: "pdf",
        pageNumber: chunk.pageNumber,
        navigationTarget: `#page=${chunk.pageNumber}`,
        index,
        level: 2,
        parentId: null,
        childIds: [],
        isCollapsed: runtime.view && runtime.view.collapsedSectionIds ? runtime.view.collapsedSectionIds.has(id) : false,
        text: chunk.text,
        wordCount: chunk.words,
        top: syntheticTop,
        unitMeta,
        metrics: buildRecoveredPdfMetrics(chunk, score, pdfSectionType, sectionKind, sectionKindLabel, {
          ocrRole,
          ocrRoleLabel,
          ocrRoleConfidence: Number(chunk.ocrRoleConfidence) || 0,
          ocrRoleReasons: Array.isArray(chunk.ocrRoleReasons) ? chunk.ocrRoleReasons.slice(0, 4) : [],
          selectionReason
        }),
        score,
        usefulScore: Math.max(30, Math.round(score * 0.62)),
        importanceScore: score,
        label: formatRecoveredPdfSectionLabel(false, sectionKindLabel, chunk.pageNumber),
        isImportant: false,
        isBest: false
      };
    });

    const ranked = [...sections].sort(compareRecoveredPdfSections);
    const usableOcrTarget = entry.source === "ocr"
      ? ranked.find((section) => {
          const role = normalizeRecoveredPdfOcrRole(section && section.metrics && section.metrics.ocrRole);
          return isRecoveredPdfOcrStrongContentRole(role)
            && Number(section && section.wordCount || 0) >= (role === "total_due" ? 3 : 14)
            && !startsWithRecoveredPdfOcrAdministrativeText(section && section.text);
        })
      : null;
    const best = usableOcrTarget || ranked.find((section) => !isRecoveredPdfLowValue(section)) || ranked[0] || sections[0];
    const importantLimit = Math.min(9, Math.max(3, Math.ceil(sections.length * 0.35)));
    const importantPool = entry.source === "ocr"
      ? ranked.filter((section) => isRecoveredPdfOcrStrongContentRole(section && section.metrics && section.metrics.ocrRole) || !isRecoveredPdfLowValue(section))
      : ranked.filter((section) => !isRecoveredPdfLowValue(section));
    const importantIds = new Set(importantPool.slice(0, importantLimit).map((section) => section.id));
    sections.forEach((section) => {
      section.isBest = section.id === best.id;
      section.isImportant = section.isBest || importantIds.has(section.id);
      section.label = section.isImportant ? formatRecoveredPdfSectionLabel(section.isBest, section.metrics.sectionKindLabel, section.pageNumber) : "";
    });
    const importantSections = sections.filter((section) => section.isImportant).sort(compareRecoveredPdfSections);
    const nextImportant = importantSections.find((section) => section.id !== best.id) || sections.find((section) => section.id !== best.id) || null;
    const totalReadableWords = sections.reduce((sum, section) => sum + section.wordCount, 0);
    const finalRouteKey = routeKey || getPdfDocumentRouteKey();

    const model = {
      adapterName: "pdf",
      articleRoot: anchorRoot,
      pageProfile: {
        type: "pdf",
        label: "PDF",
        readingConfidence: entry.source === "ocr" && ocrQuality.quality === "low" ? 62 : entry.source === "ocr" && ocrQuality.quality === "weak_structure" ? 72 : 88,
        quietMode: false,
        reason: entry.source === "ocr" ? ocrQuality.message || "PDF OCR text recovered" : "PDF text recovered with PDF.js",
        quietReason: "",
        diagnosticHint: entry.source === "ocr" ? ocrQuality.message || "PDF text was recovered and converted into page-based SkimRoute sections." : "PDF text was recovered and converted into page-based SkimRoute sections.",
        ocrQuality: ocrQuality.quality,
        qualityMessage: ocrQuality.message,
        qualityScore: ocrQuality.score,
        pageEvidence: {
          articleEvidence: 2,
          quietEvidence: 0,
          paragraphs: 0,
          controls: document.querySelectorAll ? document.querySelectorAll("input, textarea, select, button, [role='button']").length : 0,
          links: document.links ? document.links.length : 0,
          resultItems: 0,
          commerceNodes: 0,
          appShellNodes: 0,
          searchNodes: 0,
          conversationEvidence: 0,
          conversationNodes: 0,
          assistantHits: 0,
          userHits: 0,
          codeBlocks: 0,
          transcriptStyle: "",
          prefixCount: 0,
          reason: "PDF recovered text map found"
        },
        isAmbiguous: false,
        adapterName: "pdf"
      },
      sections,
      importantSections,
      bestSectionId: best && best.id || "",
      nextImportantId: nextImportant && nextImportant.id || "",
      skipTargetId: best && best.id || "",
      confidence: Math.min(98, Math.max(72, Math.round(best && best.score || 72))),
      confidenceTier: "high",
      confidenceLabel: "PDF mapped",
      hasStrongTarget: Boolean(best),
      bestLabel: best ? best.label || `Page ${best.pageNumber}` : "PDF mapped",
      bestKind: best && best.metrics ? best.metrics.sectionKind || "" : "",
      bestKindLabel: best && best.metrics ? best.metrics.sectionKindLabel || "" : "",
      savedMinutes: Math.max(1, Math.ceil(Math.max(0, totalReadableWords - (best ? best.wordCount : 0)) / 240)),
      totalWords: totalReadableWords,
      totalReadableWords,
      readingMinutes: Math.max(1, Math.ceil(totalReadableWords / 240)),
      routeKey: finalRouteKey,
      routeHash: hashText(finalRouteKey),
      diagnostics: {
        adapterName: "pdf",
        adapterFamily: "pdf",
        rootTag: anchorRoot && anchorRoot.tagName ? anchorRoot.tagName.toLowerCase() : "body",
        rootId: anchorRoot && anchorRoot.id || "",
        rootClass: anchorRoot && anchorRoot.className ? String(anchorRoot.className).slice(0, 120) : "",
        rootWords: 0,
        sectionWords: totalReadableWords,
        effectiveWords: totalReadableWords,
        adapterUnitsCount: sections.length,
        useAdapterUnits: true,
        headingSectionsCount: 0,
        fallbackSectionsCount: 0,
        unitSectionsCount: sections.length,
        rawSectionCount: sections.length,
        recoveredPdf: true,
        recoveredPdfSource: entry.source || "pdfjs",
        recoveredPdfCacheSource: entry.cacheSource || runtime.pdfOcr.cacheSource || "",
        recoveredPdfCacheHit: Boolean(entry.cacheHit || runtime.pdfOcr.cacheHit),
        recoveredPdfCacheUpdatedAt: Number(entry.updatedAt) || 0,
        recoveredPdfQuality: ocrQuality.quality,
        recoveredPdfQualityScore: ocrQuality.score,
        recoveredPages: pages.length,
        recoveredWords: entry.words || totalReadableWords,
        pageProfileBefore: baseModel && baseModel.pageProfile || null,
        pageProfileAfter: null
      },
      structureSignature: `pdf-recovered:${finalRouteKey}:${sections.length}:${totalReadableWords}:${entry.updatedAt || 0}`
    };
    model.diagnostics.pageProfileAfter = model.pageProfile;
    const normalizedModel = normalizeRecoveredPdfModelForPublicStatus(model, routeKey, entry, baseModel, `raw:${reason}`);
    runtime.recoveredPdfModelCache = { routeKey, signature, model: normalizedModel };
    if (!entry.mapSnapshot) {
      savePdfMapSnapshotForEntry(routeKey, entry, normalizedModel);
    }

    emitDebug("pdf:model:recovered", {
      reason,
      routeKey: finalRouteKey,
      source: entry.source || "pdfjs",
      cacheHit: Boolean(entry.cacheHit),
      cacheSource: entry.cacheSource || "",
      pages: pages.length,
      chunks: chunks.length,
      sections: normalizedModel.sections.length,
      words: normalizedModel.totalReadableWords || 0,
      bestPage: getPdfSectionPageNumber(normalizedModel.sections.find((section) => section.id === normalizedModel.bestSectionId)) || 0,
      ocrQuality: ocrQuality.quality,
      ocrQualityScore: ocrQuality.score,
      selectionReason: normalizedModel.sections.find((section) => section.id === normalizedModel.bestSectionId)?.metrics?.selectionReason || "",
      note: "Recovered PDF text was converted directly into SkimRoute page sections."
    });
    if (options.remember !== false) {
      rememberStablePdfModel(normalizedModel, `buildRecoveredPdfModelFromCache:${reason}`);
    }
    return normalizedModel;
    } catch (error) {
      if (entry.source !== "ocr") throw error;
      const parserError = rememberPdfOcrParserError(error, "recovered-model", {
        entry,
        routeKey,
        fallbackUsed: true
      });
      const fallbackModel = buildSimpleOcrRecoveredPdfModel(entry, routeKey, reason, baseModel, {
        remember: options.remember,
        parserError
      });
      if (fallbackModel) return fallbackModel;
      throw error;
    }
  }

  function buildRecoveredPdfOcrLetterChunks(page, cleanText, countWords) {
    const sourceLines = Array.isArray(page && page.lines)
      ? page.lines.map((line, index) => {
          const text = cleanText(line && line.text);
          if (!text) return null;
          const geometry = getPdfOcrLineGeometry(line);
          const relativeY = Number(line && line.relativeY);
          const relativeYStart = Number(line && line.relativeYStart);
          const relativeYEnd = Number(line && line.relativeYEnd);
          const safeRelativeY = Number.isFinite(relativeY) ? Math.max(0, Math.min(1, relativeY)) : geometry && Number.isFinite(geometry.relativeY) ? geometry.relativeY : null;
          return {
            text,
            words: Number(line && line.words) || countWords(text),
            pageNumber: Number(line && line.pageNumber || page && page.pageNumber) || 1,
            relativeY: safeRelativeY,
            relativeYStart: Number.isFinite(relativeYStart) ? Math.max(0, Math.min(1, relativeYStart)) : geometry && Number.isFinite(geometry.relativeYStart) ? geometry.relativeYStart : safeRelativeY,
            relativeYEnd: Number.isFinite(relativeYEnd) ? Math.max(0, Math.min(1, relativeYEnd)) : geometry && Number.isFinite(geometry.relativeYEnd) ? geometry.relativeYEnd : safeRelativeY,
            ocrGeometry: geometry,
            bbox: geometry && geometry.bbox || null,
            wordBoxes: geometry && geometry.wordBoxes || [],
            pageWidth: geometry && geometry.pageWidth || 0,
            pageHeight: geometry && geometry.pageHeight || 0,
            ocrVariantName: String(line && (line.ocrVariantName || line.recognitionVariant) || geometry && geometry.ocrVariantName || "").slice(0, 80),
            sourceLineId: String(line && line.sourceLineId || geometry && geometry.sourceLineIds && geometry.sourceLineIds[0] || `ocr-line-${page && page.pageNumber || 1}-${index}`).slice(0, 140),
            sourceLineIds: Array.isArray(line && line.sourceLineIds)
              ? line.sourceLineIds.map((id) => String(id).slice(0, 140)).filter(Boolean).slice(0, 12)
              : geometry && Array.isArray(geometry.sourceLineIds) ? geometry.sourceLineIds : [],
            sourceLineTextSample: String(line && (line.rawText || line.text) || text).replace(/\s+/g, " ").trim().slice(0, 260),
            cropOffset: line && line.cropOffset || geometry && geometry.cropOffset || null,
            renderScale: Number(line && line.renderScale || geometry && geometry.renderScale || 0) || 0,
            rotation: Number(line && line.rotation || geometry && geometry.rotation || 0) || 0,
            lineIndex: Number.isFinite(Number(line && line.order)) ? Number(line.order) : index
          };
        }).filter(Boolean)
      : [];
    if (!sourceLines.length) return [];
    const greetingIndex = sourceLines.findIndex((line) => isRecoveredPdfOcrGreetingLine(line.text));
    const closingIndex = sourceLines.findIndex((line, index) => index > Math.max(-1, greetingIndex) && isRecoveredPdfOcrClosingLine(line.text));
    const repeatedLineCounts = getRecoveredPdfOcrRepeatedLineCounts(sourceLines);
    let activeDocumentRole = "";
    const roleLines = sourceLines.map((line, index) => {
      let role = classifyRecoveredPdfOcrLineRole(line, {
        index,
        total: sourceLines.length,
        afterGreeting: greetingIndex >= 0 && index > greetingIndex,
        beforeGreeting: greetingIndex < 0 || index < greetingIndex,
        afterClosing: closingIndex >= 0 && index > closingIndex,
        closingIndex,
        repeatedLine: repeatedLineCounts.get(getRecoveredPdfOcrRepeatedLineKey(line.text)) >= 2
      });
      const normalizedRole = normalizeRecoveredPdfOcrRole(role) || "unknown";
      if (isRecoveredPdfOcrDocumentHeadingRole(normalizedRole)) {
        activeDocumentRole = normalizedRole === "title" ? "" : normalizedRole;
      } else if (
        activeDocumentRole
        && !["letterhead", "recipient", "date_reference", "greeting", "closing", "signature", "footer", "repeated_header", "repeated_footer", "noise"].includes(normalizedRole)
        && !(greetingIndex >= 0 && index > greetingIndex && (closingIndex < 0 || index < closingIndex))
      ) {
        role = activeDocumentRole;
      }
      return { ...line, ocrRole: role };
    });
    const chunks = [];
    let bucket = [];
    let bucketWords = 0;
    const flush = () => {
      if (!bucket.length) return;
      const text = cleanText(bucket.map((line) => line.text).join(" "));
      const words = countWords(text);
      const role = getDominantRecoveredPdfOcrRole(bucket, text, words);
      if (words >= 14 || isMeaningfulShortRecoveredPdfOcrRole(role, text, words)) {
        const chunk = buildRecoveredPdfOcrLineBackedChunk(bucket, role, cleanText, countWords);
        if (chunk) chunks.push(chunk);
      }
      bucket = [];
      bucketWords = 0;
    };
    roleLines.forEach((line) => {
      const currentRole = bucket.length ? getDominantRecoveredPdfOcrRole(bucket) : "";
      const nextRole = normalizeRecoveredPdfOcrRole(line.ocrRole);
      const forceBoundary = Boolean(
        bucket.length
        && nextRole
        && currentRole
        && nextRole !== currentRole
        && (
          isRecoveredPdfOcrBoundaryRole(nextRole)
          || isRecoveredPdfOcrBoundaryRole(currentRole)
        )
      );
      if (forceBoundary || (looksLikeRecoveredPdfSemanticBoundary(line.text) && bucket.length && bucketWords >= 18)) {
        flush();
      }
      bucket.push(line);
      bucketWords += line.words;
      if (bucketWords >= 190 && (/[.!?:;)]$/.test(line.text) || bucketWords >= 260)) {
        flush();
      }
    });
    flush();
    return splitRecoveredPdfOcrAdministrativePrefixChunks(mergeRecoveredPdfTinyOcrChunks(chunks, cleanText, countWords), cleanText, countWords);
  }

  function mergeRecoveredPdfTinyOcrChunks(chunks, cleanText, countWords) {
    if (!Array.isArray(chunks) || chunks.length < 2) return chunks || [];
    const merged = [];
    chunks.forEach((chunk) => {
      const role = normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole);
      const words = Number(chunk && chunk.words) || countWords(chunk && chunk.text);
      const shouldMerge = words < 14 && !isMeaningfulShortRecoveredPdfOcrRole(role, chunk && chunk.text, words);
      const previous = merged[merged.length - 1];
      if (shouldMerge && previous && (role === "signature" || role === "closing") && ["closing", "signature"].includes(previous.ocrRole)) {
        mergeRecoveredPdfOcrChunkInto(previous, chunk, cleanText, countWords);
        return;
      }
      if (shouldMerge && previous && role === "unknown") {
        mergeRecoveredPdfOcrChunkInto(previous, chunk, cleanText, countWords);
        return;
      }
      merged.push({ ...chunk });
    });
    return merged.map((chunk, index) => ({
      ...chunk,
      chunkIndex: Number.isFinite(Number(chunk.chunkIndex)) ? Number(chunk.chunkIndex) : index
    }));
  }

  function mergeRecoveredPdfOcrChunkInto(target, addition, cleanText, countWords) {
    target.text = cleanText([target.text, addition && addition.text].filter(Boolean).join(" "));
    target.sectionText = target.text;
    target.words = countWords(target.text);
    target.relativeYStart = Math.min(
      Number.isFinite(Number(target.relativeYStart)) ? Number(target.relativeYStart) : Number(target.relativeY) || 0.12,
      Number.isFinite(Number(addition && addition.relativeYStart)) ? Number(addition.relativeYStart) : Number(addition && addition.relativeY) || 0.12
    );
    target.relativeYEnd = Math.max(
      Number.isFinite(Number(target.relativeYEnd)) ? Number(target.relativeYEnd) : Number(target.relativeY) || 0.12,
      Number.isFinite(Number(addition && addition.relativeYEnd)) ? Number(addition.relativeYEnd) : Number(addition && addition.relativeY) || 0.12
    );
    target.ocrSourceLines = normalizePdfOcrSourceLines([].concat(target.ocrSourceLines || [], addition && addition.ocrSourceLines || []));
    target.ocrGeometry = target.ocrSourceLines.length
      ? mergePdfOcrLineBackedGeometry(target.ocrSourceLines)
      : mergePdfOcrGeometries([target, addition]);
    target.bbox = target.ocrGeometry && target.ocrGeometry.bbox || null;
    target.wordBoxes = target.ocrGeometry && target.ocrGeometry.wordBoxes || [];
    target.sourceLineIds = Array.from(new Set([].concat(target.sourceLineIds || [], addition && addition.sourceLineIds || []).filter(Boolean))).slice(0, 120);
    target.sourceLineTextSample = [target.sourceLineTextSample || target.text, addition && (addition.sourceLineTextSample || addition.text)]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 260);
    target.ocrVariantName = target.ocrVariantName && addition && addition.ocrVariantName && target.ocrVariantName === addition.ocrVariantName
      ? target.ocrVariantName
      : target.ocrGeometry && target.ocrGeometry.ocrVariantName || target.ocrVariantName || "";
    target.pageWidth = target.ocrGeometry && target.ocrGeometry.pageWidth || target.pageWidth || addition && addition.pageWidth || 0;
    target.pageHeight = target.ocrGeometry && target.ocrGeometry.pageHeight || target.pageHeight || addition && addition.pageHeight || 0;
    target.ocrGeometryExact = Boolean(target.ocrGeometry && target.ocrGeometry.exact && target.sourceLineIds && target.sourceLineIds.length && isPdfOcrExactGeometryUsable(target.ocrGeometry));
    target.ocrHighlightApproximate = !target.ocrGeometryExact;
    target.lineStart = Math.min(Number(target.lineStart) || 0, Number(addition && addition.lineStart) || Number(target.lineStart) || 0);
    target.lineEnd = Math.max(Number(target.lineEnd) || 0, Number(addition && addition.lineEnd) || 0);
  }

  function splitRecoveredPdfOcrAdministrativePrefixChunks(chunks, cleanText, countWords) {
    if (!Array.isArray(chunks) || !chunks.length) return chunks || [];
    const result = [];
    chunks.forEach((chunk) => {
      const role = normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole);
      const text = cleanText(chunk && chunk.text);
      if (role !== "body" || !text || !startsWithRecoveredPdfOcrAdministrativeText(text)) {
        result.push({ ...chunk });
        return;
      }
      const linePieces = splitRecoveredPdfOcrAdministrativePrefixChunkByLines(chunk, cleanText, countWords);
      if (linePieces && linePieces.length >= 2) {
        linePieces.forEach((piece) => result.push(piece));
        return;
      }
      const pieces = splitRecoveredPdfOcrLetterText(text, cleanText);
      if (pieces.length < 2) {
        result.push({ ...chunk });
        return;
      }
      pieces.forEach((piece, pieceIndex) => {
        const derived = buildDerivedRecoveredPdfOcrChunk(chunk, piece.text, piece.role, pieceIndex, pieces.length, cleanText, countWords);
        if (derived) result.push(derived);
      });
    });
    return result.map((chunk, index) => ({
      ...chunk,
      chunkIndex: index,
      ocrRoleLabel: recoveredPdfOcrRoleLabel(chunk.ocrRole)
    }));
  }

  function splitRecoveredPdfOcrAdministrativePrefixChunkByLines(chunk, cleanText, countWords) {
    const sourceLines = normalizePdfOcrSourceLines(chunk && chunk.ocrSourceLines);
    if (sourceLines.length < 2) return null;
    const groups = [];
    let bucket = [];
    let bucketRole = "";
    const flush = () => {
      if (!bucket.length) return;
      const built = buildRecoveredPdfOcrLineBackedChunk(bucket, bucketRole || "unknown", cleanText, countWords, {
        parentChunkIndex: Number(chunk && chunk.chunkIndex) || 0
      });
      if (built) groups.push(built);
      bucket = [];
      bucketRole = "";
    };
    sourceLines.forEach((line, index) => {
      const text = cleanText(line && line.text);
      const role = normalizeRecoveredPdfOcrRole(
        isRecoveredPdfOcrGreetingLine(text) ? "greeting"
          : isRecoveredPdfOcrClosingLine(text) ? "signature"
            : startsWithRecoveredPdfOcrAdministrativeText(text)
              ? classifyRecoveredPdfOcrLineRole({ ...line, text }, { index, total: sourceLines.length, beforeGreeting: true })
              : "body"
      ) || "unknown";
      if (bucket.length && role !== bucketRole) flush();
      bucket.push(line);
      bucketRole = role;
    });
    flush();
    if (groups.length < 2 || !groups.some((group) => normalizeRecoveredPdfOcrRole(group.ocrRole) === "body")) return null;
    return groups.map((group, index) => ({
      ...group,
      chunkIndex: index,
      chunkCount: groups.length,
      ocrRoleLabel: recoveredPdfOcrRoleLabel(group.ocrRole)
    }));
  }

  function splitRecoveredPdfOcrLetterText(text, cleanText) {
    const value = cleanText(text);
    if (!value) return [];
    const pieces = [];
    const push = (pieceText, role) => {
      const cleaned = cleanText(pieceText);
      if (!cleaned || countPdfWords(cleaned) < 1) return;
      pieces.push({ text: cleaned, role: normalizeRecoveredPdfOcrRole(role) || classifyRecoveredPdfOcrRole({ text: cleaned }, pieces.length, 8) || "unknown" });
    };
    const closingMatch = /\b(?:Yours sincerely|Yours faithfully|Yours truly|Respectfully|Kind regards|Best regards|Regards|Very truly yours)\b/i.exec(value);
    const beforeClosing = closingMatch ? value.slice(0, closingMatch.index).trim() : value;
    const closingText = closingMatch ? value.slice(closingMatch.index).trim() : "";
    const greetingMatch = /\bDear\b[\s\S]{0,80}?(?:,|\s{2,}|$)/i.exec(beforeClosing);
    if (greetingMatch) {
      const beforeGreeting = beforeClosing.slice(0, greetingMatch.index).trim();
      const greetingText = greetingMatch[0].trim();
      const afterGreeting = beforeClosing.slice(greetingMatch.index + greetingMatch[0].length).trim();
      splitRecoveredPdfOcrAdministrativeText(beforeGreeting, push);
      push(greetingText, "greeting");
      push(afterGreeting, "body");
      push(closingText, "signature");
      return pieces;
    }
    const bodyMatch = /\b(?:Permit me to introduce|I would like|Please|Enclosed|Regarding|Because|Therefore|This is to|In response|As discussed)\b/i.exec(beforeClosing);
    if (bodyMatch && bodyMatch.index > 0) {
      splitRecoveredPdfOcrAdministrativeText(beforeClosing.slice(0, bodyMatch.index).trim(), push);
      push(beforeClosing.slice(bodyMatch.index).trim(), "body");
      push(closingText, "signature");
      return pieces;
    }
    return [{ text: value, role: classifyRecoveredPdfOcrRole({ text: value }, 0, 1) || "unknown" }];
  }

  function splitRecoveredPdfOcrAdministrativeText(text, push) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return;
    const recipientMatch = /\b(?:Dr|Mr|Mrs|Ms|Miss|Prof)\.?\s+[A-Z][A-Za-z.\s-]{1,80}(?:,|\b)/.exec(value);
    const refMatch = /\b(?:Our\s+Ref\.?|Your\s+Ref\.?|Ref(?:erence)?\.?|Date)\b/i.exec(value);
    if (refMatch) {
      const beforeRef = value.slice(0, refMatch.index).trim();
      const refAndRest = value.slice(refMatch.index).trim();
      const recipientInRest = recipientMatch && recipientMatch.index > refMatch.index
        ? recipientMatch.index - refMatch.index
        : -1;
      push(beforeRef, "letterhead");
      if (recipientInRest >= 0) {
        push(refAndRest.slice(0, recipientInRest).trim(), "date_reference");
        push(refAndRest.slice(recipientInRest).trim(), "recipient");
      } else {
        push(refAndRest, "date_reference");
      }
      return;
    }
    if (recipientMatch && recipientMatch.index > 0) {
      push(value.slice(0, recipientMatch.index).trim(), "letterhead");
      push(value.slice(recipientMatch.index).trim(), "recipient");
      return;
    }
    push(value, classifyRecoveredPdfOcrRole({ text: value }, 0, 1) || "letterhead");
  }

  function buildDerivedRecoveredPdfOcrChunk(source, text, role, index, total, cleanText, countWords) {
    const cleaned = cleanText(text);
    const words = countWords(cleaned);
    if (!cleaned || words < 1) return null;
    const startBase = Number.isFinite(Number(source && source.relativeYStart))
      ? Number(source.relativeYStart)
      : Number.isFinite(Number(source && source.relativeY))
        ? Math.max(0.02, Number(source.relativeY) - 0.035)
        : 0.08;
    const endBase = Number.isFinite(Number(source && source.relativeYEnd))
      ? Number(source.relativeYEnd)
      : Number.isFinite(Number(source && source.relativeY))
        ? Math.min(0.98, Number(source.relativeY) + 0.12)
        : 0.9;
    const safeTotal = Math.max(1, Number(total) || 1);
    const span = Math.max(0.04, endBase - startBase);
    const relativeYStart = Math.max(0.02, Math.min(0.96, startBase + span * (index / safeTotal)));
    const relativeYEnd = Math.max(relativeYStart + 0.035, Math.min(0.98, startBase + span * ((index + 1) / safeTotal)));
    return {
      ...source,
      text: cleaned,
      sectionText: cleaned,
      words,
      ocrRole: normalizeRecoveredPdfOcrRole(role) || "unknown",
      ocrRoleLabel: recoveredPdfOcrRoleLabel(role),
      ocrRoleConfidence: getRecoveredPdfOcrRoleEvidence(role, cleaned, { sourceLines: [], words }).confidence,
      ocrRoleReasons: getRecoveredPdfOcrRoleEvidence(role, cleaned, { sourceLines: [], words }).reasons,
      relativeY: Math.max(0, Math.min(1, (relativeYStart + relativeYEnd) / 2)),
      relativeYStart,
      relativeYEnd,
      ocrGeometry: null,
      bbox: null,
      wordBoxes: [],
      sourceLineIds: [],
      ocrSourceLines: [],
      sourceLineTextSample: String(source && (source.sourceLineTextSample || source.text) || "").replace(/\s+/g, " ").trim().slice(0, 260),
      ocrVariantName: String(source && source.ocrVariantName || "").slice(0, 80),
      ocrGeometryExact: false,
      ocrHighlightApproximate: true,
      pageWidth: Number(source && source.pageWidth || 0) || 0,
      pageHeight: Number(source && source.pageHeight || 0) || 0,
      cropOffset: source && source.cropOffset || null,
      renderScale: Number(source && source.renderScale || 0) || 0,
      rotation: Number(source && source.rotation || 0) || 0,
      lineStart: Number(source && source.lineStart) || 0,
      lineEnd: Number(source && source.lineEnd) || 0,
      chunkIndex: index,
      chunkCount: safeTotal
    };
  }

  function startsWithRecoveredPdfOcrAdministrativeText(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return false;
    const firstWords = value.split(/\s+/).slice(0, 36).join(" ");
    const signals = getRecoveredPdfOcrLetterSignals(firstWords, { index: 0, total: 8, beforeGreeting: true });
    return Boolean(
      signals.letterhead
      || signals.recipient
      || signals.dateReference
      || /\b(?:telephone|telex|fax|our\s+ref|your\s+ref|ref(?:erence)?\.?)\b/i.test(firstWords)
    );
  }

  function normalizeRecoveredPdfOcrRole(role) {
    const value = String(role || "").toLowerCase().replace(/[^a-z_]+/g, "_").replace(/^ocr_/, "");
    const aliases = {
      reference: "date_reference",
      references_list: "references",
      bibliography: "references",
      works_cited: "references",
      finding: "results",
      findings: "results",
      recommendation: "recommendations",
      recommended_action: "recommendations",
      form: "form_notice",
      notice: "form_notice",
      invoice: "invoice_summary",
      receipt: "invoice_summary",
      total: "total_due",
      header: "repeated_header",
      repeated: "repeated_header",
      boilerplate: "noise"
    };
    const normalized = aliases[value] || value;
    return /^(letterhead|recipient|date_reference|greeting|body|closing|signature|footer|title|abstract|introduction|methods|results|discussion|conclusion|references|report_summary|recommendations|form_notice|table|invoice_summary|line_items|total_due|repeated_header|repeated_footer|noise|unknown)$/.test(normalized) ? normalized : "";
  }

  function recoveredPdfOcrRoleLabel(role) {
    const labels = {
      letterhead: "Letterhead",
      recipient: "Recipient",
      date_reference: "Reference/date",
      greeting: "Greeting",
      body: "Main body",
      closing: "Closing",
      signature: "Signature block",
      footer: "Footer",
      title: "Title",
      abstract: "Abstract",
      introduction: "Introduction",
      methods: "Methods",
      results: "Results",
      discussion: "Discussion",
      conclusion: "Conclusion",
      references: "Reference list",
      report_summary: "Report summary",
      recommendations: "Recommendations",
      form_notice: "Form or notice",
      table: "Table",
      invoice_summary: "Invoice or receipt",
      line_items: "Line items",
      total_due: "Total due",
      repeated_header: "Repeated header",
      repeated_footer: "Repeated footer",
      noise: "OCR noise",
      unknown: "OCR section"
    };
    return labels[normalizeRecoveredPdfOcrRole(role)] || "";
  }

  function recoveredPdfOcrRoleKind(role) {
    const normalized = normalizeRecoveredPdfOcrRole(role);
    if (normalized === "body") return "ocr_letter_body";
    if (normalized === "date_reference") return "ocr_date_reference";
    if (normalized === "signature") return "ocr_signature";
    return normalized ? `ocr_${normalized}` : "";
  }

  function isRecoveredPdfOcrBoundaryRole(role) {
    const normalized = normalizeRecoveredPdfOcrRole(role);
    return Boolean(normalized && normalized !== "unknown");
  }

  function isRecoveredPdfOcrDocumentHeadingRole(role) {
    const normalized = normalizeRecoveredPdfOcrRole(role);
    return /^(title|abstract|introduction|methods|results|discussion|conclusion|references|report_summary|recommendations|form_notice|table|invoice_summary|line_items|total_due)$/.test(normalized);
  }

  function isRecoveredPdfOcrStrongContentRole(role) {
    const normalized = normalizeRecoveredPdfOcrRole(role);
    return /^(body|abstract|results|discussion|conclusion|report_summary|recommendations|form_notice|invoice_summary|total_due|table)$/.test(normalized);
  }

  function isRecoveredPdfOcrLowValueRole(role) {
    const normalized = normalizeRecoveredPdfOcrRole(role);
    return /^(letterhead|recipient|date_reference|greeting|closing|signature|footer|title|references|repeated_header|repeated_footer|noise)$/.test(normalized);
  }

  function classifyRecoveredPdfOcrRole(chunk, index = 0, total = 1, pdfSectionType = "") {
    const existing = normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole);
    if (existing && existing !== "unknown") return existing;
    const signals = getRecoveredPdfOcrDocumentSignals(String(chunk && chunk.text || ""), {
      index,
      total,
      relativeY: chunk && chunk.relativeY,
      pdfSectionType
    });
    if (signals.noise) return "noise";
    if (signals.repeatedFooter) return "repeated_footer";
    if (signals.repeatedHeader) return "repeated_header";
    if (signals.footer) return "footer";
    if (signals.greeting) return "greeting";
    if (signals.closing) return "closing";
    if (signals.signatureOnly) return "signature";
    if (signals.dateReference) return "date_reference";
    if (signals.headingRole) return signals.headingRole;
    if (signals.totalDue) return "total_due";
    if (signals.lineItems) return "line_items";
    if (signals.invoiceSummary) return "invoice_summary";
    if (signals.formNotice) return "form_notice";
    if (signals.table) return "table";
    if (signals.body) return "body";
    if (signals.letterhead) return "letterhead";
    if (signals.recipient) return "recipient";
    if (signals.title) return "title";
    return existing === "unknown" ? "unknown" : "";
  }

  function classifyRecoveredPdfOcrLineRole(line, context = {}) {
    const signals = getRecoveredPdfOcrDocumentSignals(String(line && line.text || ""), {
      index: context.index,
      total: context.total,
      relativeY: line && line.relativeY,
      afterGreeting: context.afterGreeting,
      beforeGreeting: context.beforeGreeting,
      afterClosing: context.afterClosing,
      repeatedLine: context.repeatedLine
    });
    if (signals.noise) return "noise";
    if (signals.repeatedFooter) return "repeated_footer";
    if (signals.repeatedHeader) return "repeated_header";
    if (signals.footer) return "footer";
    if (signals.greeting) return "greeting";
    if (signals.closing) return "closing";
    if (signals.signatureOnly || context.afterClosing && signals.words <= 12) return "signature";
    if (signals.dateReference) return "date_reference";
    if (signals.headingRole) return signals.headingRole;
    if (signals.totalDue) return "total_due";
    if (signals.lineItems) return "line_items";
    if (signals.invoiceSummary) return "invoice_summary";
    if (signals.formNotice) return "form_notice";
    if (signals.table) return "table";
    if (signals.body || context.afterGreeting && !context.afterClosing && signals.words >= 4 && !signals.administrative) return "body";
    if (signals.letterhead) return "letterhead";
    if (signals.recipient) return "recipient";
    if (signals.title) return "title";
    return "unknown";
  }

  function getRecoveredPdfOcrLetterSignals(text, options = {}) {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    const words = countPdfWords(compact);
    const index = Number(options.index) || 0;
    const total = Math.max(1, Number(options.total) || 1);
    const relativeY = Number(options.relativeY);
    const early = index <= 4 || Number.isFinite(relativeY) && relativeY < 0.24;
    const late = index >= total - 3 || Number.isFinite(relativeY) && relativeY > 0.86;
    const uppercaseLetters = (compact.match(/[A-Z]/g) || []).length;
    const letters = (compact.match(/[A-Za-z]/g) || []).length;
    const mostlyUpper = letters >= 4 && uppercaseLetters / Math.max(1, letters) > 0.72;
    const contact = /\b(?:phone|tel|telephone|telex|fax|email|e-mail|www\.|street|st\.|road|rd\.|avenue|ave\.|suite|postcode|zip|p\.?\s*o\.?\s*box)\b/i.test(compact);
    const company = /\b(?:ltd|limited|inc|corp|corporation|company|co\.|plc|llc|department|division|office|ministry|authority)\b/i.test(compact);
    const address = /\b\d{1,5}\s+[A-Z][A-Za-z0-9'.-]*(?:\s+[A-Za-z0-9'.-]+){0,5}\s+(?:street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.|way|court|ct\.|boulevard|blvd\.|place|pl\.)\b/i.test(compact);
    const recipientName = /^\s*(?:mr|mrs|ms|miss|dr|prof|sir|madam)\.?\s+[A-Z]/i.test(compact);
    const greeting = isRecoveredPdfOcrGreetingLine(compact);
    const closing = isRecoveredPdfOcrClosingLine(compact);
    const initials = /^\s*(?:[A-Z]\.\s*){2,4}$/.test(compact) || words <= 3 && /^[A-Z](?:\.[A-Z]){1,3}\.?$/.test(compact);
    const dateReference = /\b(?:our ref|your ref|ref(?:erence)?\.?|date|invoice no|account no)\b\s*[:.]?/i.test(compact)
      || words <= 18 && /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4})\b/i.test(compact);
    const bodyPhrase = /\b(?:permit me to introduce|i would like|please|enclosed|regarding|because|therefore|request|recommend|important|we are|we have|i am|i have|you will|this is to|in response|as discussed|can you|should|must)\b/i.test(compact);
    const bodyVerb = /\b(?:introduce|provide|confirm|explain|request|recommend|advise|enclose|attach|include|consider|arrange|agree|believe|understand|expect|require|propose|send|receive|review)\b/i.test(compact);
    const administrative = Boolean(contact || address || company && early || mostlyUpper && early);
    const body = !closing && !greeting && !dateReference && !initials && !administrative && (
      Boolean(options.afterGreeting && !options.afterClosing && words >= 4)
      || words >= 35
      || bodyPhrase
      || bodyVerb && words >= 16
    );
    const footer = late && words <= 24 && /\b(?:page\s+\d+|copyright|all rights reserved|continued|confidential|fax)\b/i.test(compact);
    const signatureOnly = !body && (initials || /\b(?:signature|signed|authorized representative)\b/i.test(compact) || closing && words <= 16);
    const letterhead = !body && early && words <= 60 && (contact || company || address || mostlyUpper);
    const recipient = !body && !letterhead && !greeting && Boolean(options.beforeGreeting) && words <= 36 && (recipientName || address || /\b(?:attn|attention|c\/o)\b/i.test(compact));
    return {
      words,
      contact,
      company,
      address,
      greeting,
      closing,
      dateReference,
      bodyPhrase,
      bodyVerb,
      body,
      footer,
      signatureOnly,
      letterhead,
      recipient,
      initials,
      administrative
    };
  }

  function getRecoveredPdfOcrDocumentSignals(text, options = {}) {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    const words = countPdfWords(compact);
    const index = Number(options.index) || 0;
    const total = Math.max(1, Number(options.total) || 1);
    const relativeY = Number(options.relativeY);
    const early = index <= 4 || Number.isFinite(relativeY) && relativeY < 0.24;
    const late = index >= total - 3 || Number.isFinite(relativeY) && relativeY > 0.86;
    const lower = compact.toLowerCase();
    const letter = getRecoveredPdfOcrLetterSignals(compact, options);
    const headingRole = getRecoveredPdfOcrHeadingRole(compact);
    const title = early
      && words >= 3
      && words <= 22
      && !letter.administrative
      && !letter.dateReference
      && !/[.!?]\s+\w/.test(compact)
      && !/\b(?:abstract|introduction|methods?|results?|discussion|conclusion|references|notice|invoice|receipt|telephone|fax|email|ref)\b/i.test(compact);
    const research = Boolean(headingRole && /^(abstract|introduction|methods|results|discussion|conclusion|references)$/.test(headingRole))
      || /\b(?:abstract|methods?|methodology|results?|findings?|discussion|conclusions?|references|bibliography|doi|journal)\b/i.test(compact);
    const report = Boolean(headingRole && /^(report_summary|recommendations)$/.test(headingRole))
      || /\b(?:executive summary|findings?|recommendations?|action items?|management response|risk assessment|report)\b/i.test(compact);
    const formNotice = /\b(?:notice|form|application|determination|claim number|case number|account number|respond by|reply by|deadline|due date|appeal|approved|denied|required response)\b/i.test(compact)
      && !letter.signatureOnly;
    const invoiceSummary = /\b(?:invoice|receipt|statement|bill to|sold to|remit to|account no|invoice no|receipt no)\b/i.test(compact);
    const totalDue = /\b(?:total due|amount due|balance due|grand total|subtotal|tax|paid|payment due|amount payable)\b/i.test(compact)
      && /\$?\d+(?:,\d{3})*(?:\.\d{2})?\b/.test(compact);
    const lineItems = /\b(?:qty|quantity|item|description|unit price|amount|price|sku|hours?|rate)\b/i.test(compact)
      && /\$?\d+(?:,\d{3})*(?:\.\d{2})?\b/.test(compact)
      && words <= 90;
    const table = /\b(?:table|figure|chart|column|row)\b/i.test(compact)
      || lineItems
      || ((compact.match(/\$?\d+(?:,\d{3})*(?:\.\d{2})?/g) || []).length >= 4 && words <= 100);
    const repeatedHeader = Boolean(options.repeatedLine && early && words <= 18);
    const repeatedFooter = Boolean(options.repeatedLine && late && words <= 20);
    const noise = looksLikeRecoveredPdfNoise(compact, words)
      || words <= 5 && /^(?:[|_~\-\s\d]+|page\s+\d+(?:\s+of\s+\d+)?)$/i.test(compact)
      || /\b(?:scanned by|fax copy|duplicate copy)\b/i.test(compact) && words <= 12;
    return {
      ...letter,
      words,
      headingRole,
      title,
      research,
      report,
      formNotice,
      invoiceSummary,
      totalDue,
      lineItems,
      table,
      repeatedHeader,
      repeatedFooter,
      noise,
      administrative: Boolean(letter.administrative || letter.contact || letter.address || letter.dateReference || letter.recipient),
      lower
    };
  }

  function getRecoveredPdfOcrHeadingRole(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    const leading = /^(abstract|introduction|background|methods?|methodology|materials and methods|results?|findings?|outcomes?|discussion|conclusions?|references|bibliography|works cited|executive summary|summary|overview|recommendations?|recommended actions?|next steps|action items?|notice of determination|notice|required response|instructions|invoice|receipt|statement|line items?|charges|transactions?|total due|amount due|balance due)\b\s*[:.\-–—]/i.exec(value);
    if (leading) {
      const lead = leading[1].toLowerCase();
      if (/^abstract$/.test(lead)) return "abstract";
      if (/^(introduction|background)$/.test(lead)) return "introduction";
      if (/^(methods?|methodology|materials and methods)$/.test(lead)) return "methods";
      if (/^(results?|findings?|outcomes?)$/.test(lead)) return "results";
      if (/^discussion$/.test(lead)) return "discussion";
      if (/^conclusions?$/.test(lead)) return "conclusion";
      if (/^(references|bibliography|works cited)$/.test(lead)) return "references";
      if (/^(executive summary|summary|overview)$/.test(lead)) return "report_summary";
      if (/^(recommendations?|recommended actions?|next steps|action items?)$/.test(lead)) return "recommendations";
      if (/^(notice of determination|notice|required response|instructions)$/.test(lead)) return "form_notice";
      if (/^(invoice|receipt|statement)$/.test(lead)) return "invoice_summary";
      if (/^(line items?|charges|transactions?)$/.test(lead)) return "line_items";
      if (/^(total due|amount due|balance due)$/.test(lead)) return "total_due";
    }
    const normalized = value.replace(/^\d+(?:\.\d+)*\s+/, "").replace(/[:.\-–—\s]+$/g, "").toLowerCase();
    if (!normalized || normalized.length > 120) return "";
    if (/^abstract$/.test(normalized)) return "abstract";
    if (/^(introduction|background)$/.test(normalized)) return "introduction";
    if (/^(methods?|methodology|materials and methods|experimental setup|procedure)$/.test(normalized)) return "methods";
    if (/^(results?|findings?|outcomes?|analysis)$/.test(normalized)) return "results";
    if (/^discussion$/.test(normalized)) return "discussion";
    if (/^(conclusions?|summary and conclusions?|final remarks)$/.test(normalized)) return "conclusion";
    if (/^(references|bibliography|works cited|literature cited)$/.test(normalized)) return "references";
    if (/^(executive summary|summary|overview)$/.test(normalized)) return "report_summary";
    if (/^(recommendations?|recommended actions?|next steps|action items?)$/.test(normalized)) return "recommendations";
    if (/^(notice|notice of determination|required response|instructions|form instructions)$/.test(normalized)) return "form_notice";
    if (/^(invoice|receipt|statement|bill|invoice summary|receipt summary)$/.test(normalized)) return "invoice_summary";
    if (/^(table|line items?|items?|charges|transactions?)$/.test(normalized)) return "line_items";
    if (/^(total|total due|amount due|balance due|grand total)$/.test(normalized)) return "total_due";
    return "";
  }

  function getRecoveredPdfOcrRepeatedLineKey(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\b\d{1,4}\b/g, "#")
      .replace(/[^a-z#]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getRecoveredPdfOcrRepeatedLineCounts(lines) {
    const counts = new Map();
    (Array.isArray(lines) ? lines : []).forEach((line) => {
      const key = getRecoveredPdfOcrRepeatedLineKey(line && line.text);
      if (!key || key.length < 4) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function isRecoveredPdfOcrGreetingLine(text) {
    return /^\s*(?:dear|to whom it may concern)\b/i.test(String(text || "").trim());
  }

  function isRecoveredPdfOcrClosingLine(text) {
    return /^\s*(?:sincerely|yours sincerely|yours faithfully|yours truly|respectfully|kind regards|best regards|regards|thank you|very truly yours)\b/i.test(String(text || "").trim());
  }

  function getDominantRecoveredPdfOcrRole(lines, text = "", words = 0) {
    const counts = new Map();
    (lines || []).forEach((line) => {
      const role = normalizeRecoveredPdfOcrRole(line && line.ocrRole) || "unknown";
      counts.set(role, (counts.get(role) || 0) + (Number(line && line.words) || 1));
    });
    const strongRoles = ["results", "conclusion", "recommendations", "form_notice", "total_due", "abstract", "report_summary", "discussion", "methods", "table", "invoice_summary"];
    const strong = strongRoles
      .map((role) => [role, counts.get(role) || 0])
      .sort((a, b) => b[1] - a[1])[0];
    if (strong && strong[1] > 0 && strong[1] >= (counts.get("body") || 0)) return strong[0];
    if (counts.get("body")) return "body";
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const role = sorted[0] && sorted[0][0] || "unknown";
    if (role !== "unknown") return role;
    return classifyRecoveredPdfOcrRole({ text, words }, 0, 1) || "unknown";
  }

  function isMeaningfulShortRecoveredPdfOcrRole(role, text, words) {
    const normalized = normalizeRecoveredPdfOcrRole(role);
    if (!normalized) return false;
    if (normalized === "date_reference") return words >= 3;
    if (normalized === "greeting") return words >= 2;
    if (normalized === "body") return words >= 8 || /\b(?:please|request|regarding|enclosed|important)\b/i.test(text);
    if (normalized === "letterhead") return words >= 3 && /\b(?:phone|tel|telephone|telex|fax|ltd|limited|inc|corp|company|lane|road|street|avenue|office)\b/i.test(text);
    if (normalized === "recipient") return words >= 3;
    if (normalized === "signature" || normalized === "closing") return words >= 2;
    if (/^(title|abstract|introduction|methods|results|discussion|conclusion|references|report_summary|recommendations|form_notice|table|invoice_summary|line_items|total_due)$/.test(normalized)) return words >= 1;
    return false;
  }

  function getRecoveredPdfOcrRoleEvidence(role, text, options = {}) {
    const normalized = normalizeRecoveredPdfOcrRole(role) || "unknown";
    const sourceLines = normalizePdfOcrSourceLines(options.sourceLines || []);
    const lineBacked = sourceLines.length > 0;
    const words = Number(options.words) || countPdfWords(text);
    const signals = getRecoveredPdfOcrDocumentSignals(text, {
      index: 0,
      total: Math.max(1, sourceLines.length || 1),
      relativeY: sourceLines[0] && sourceLines[0].relativeY
    });
    const reasons = [];
    if (lineBacked) reasons.push("role is based on OCR source-line evidence");
    if (normalized === "body" && signals.body) reasons.push("body text appears after the greeting or contains action/explanation language");
    if (normalized === "letterhead" && (signals.contact || signals.company || signals.address)) reasons.push("letterhead/contact/address signals appear in the source lines");
    if (normalized === "recipient" && signals.recipient) reasons.push("recipient/address block appears before the body");
    if (normalized === "date_reference" && signals.dateReference) reasons.push("date or reference-code signal appears in the source lines");
    if (normalized === "signature" && signals.signatureOnly) reasons.push("signature or initials pattern appears near the end");
    if (normalized === "footer" || normalized === "repeated_footer") reasons.push("footer or page-number pattern appears near the page bottom");
    if (normalized === "repeated_header") reasons.push("same short header text repeats near the page top");
    if (normalized === "noise" && signals.noise) reasons.push("scan fragments or OCR-noise pattern detected");
    if (normalized === signals.headingRole) reasons.push(`${recoveredPdfOcrRoleLabel(normalized)} heading appears in the source lines`);
    if (normalized === "form_notice" && signals.formNotice) reasons.push("form or notice identifiers, deadlines, or instructions appear in the source lines");
    if (normalized === "invoice_summary" && signals.invoiceSummary) reasons.push("invoice or receipt terms appear in the source lines");
    if (normalized === "line_items" && signals.lineItems) reasons.push("line-item columns or amounts appear in the source lines");
    if (normalized === "total_due" && signals.totalDue) reasons.push("total or amount-due value appears in the source lines");
    if (normalized === "table" && signals.table) reasons.push("table-like rows, columns, or repeated values appear in the source lines");
    if (normalized === "report_summary" || normalized === "recommendations") reasons.push(`${recoveredPdfOcrRoleLabel(normalized)} signal appears in the source lines`);
    let confidence = lineBacked ? 68 : 42;
    if (reasons.length > (lineBacked ? 1 : 0)) confidence += 16;
    if (isRecoveredPdfOcrStrongContentRole(normalized) && words >= 25) confidence += 8;
    if (isRecoveredPdfOcrLowValueRole(normalized)) confidence -= 6;
    if (normalized === "unknown") confidence = lineBacked ? 35 : 24;
    return {
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      reasons: uniquePublicStrings(reasons.length ? reasons : [recoveredPdfOcrSelectionReason(normalized, text)]).slice(0, 4)
    };
  }

  function recoveredPdfOcrSelectionReason(role, text) {
    const normalized = normalizeRecoveredPdfOcrRole(role);
    if (normalized === "body") return "this paragraph is the main body of the scanned letter, not the letterhead or signature";
    if (normalized === "date_reference") return "reference or date details from the scanned letter";
    if (normalized === "letterhead") return "letterhead or company contact block, usually less important than the body";
    if (normalized === "recipient") return "recipient address block before the letter body";
    if (normalized === "greeting") return "greeting line that starts the scanned letter";
    if (normalized === "closing") return "closing line near the end of the scanned letter";
    if (normalized === "signature") return "signature or initials block, usually less important than the body";
    if (normalized === "footer") return "footer or repeated page noise";
    if (normalized === "title") return "title or cover text, useful for context but usually not the best section";
    if (normalized === "abstract") return "abstract section identified from OCR source lines";
    if (normalized === "introduction") return "introduction or background section identified from OCR source lines";
    if (normalized === "methods") return "methods or procedure section identified from OCR source lines";
    if (normalized === "results") return "results or findings section identified from OCR source lines";
    if (normalized === "discussion") return "discussion section identified from OCR source lines";
    if (normalized === "conclusion") return "conclusion section identified from OCR source lines";
    if (normalized === "references") return "reference list or citations, usually less important than findings";
    if (normalized === "report_summary") return "summary or overview section identified from OCR source lines";
    if (normalized === "recommendations") return "recommendations or action items identified from OCR source lines";
    if (normalized === "form_notice") return "form or notice instructions with dates, names, or identifiers";
    if (normalized === "table") return "table-like OCR section with structured details";
    if (normalized === "invoice_summary") return "invoice or receipt summary identified from OCR source lines";
    if (normalized === "line_items") return "invoice, receipt, or table line items from OCR source lines";
    if (normalized === "total_due") return "total, amount due, or payment amount from OCR source lines";
    if (normalized === "repeated_header") return "repeated page header, usually less important than document content";
    if (normalized === "repeated_footer") return "repeated page footer or page-number noise";
    if (normalized === "noise") return "OCR noise or scan fragments, down-ranked before selecting useful content";
    return recoveredPdfSelectionReason("", "", text);
  }

  function buildRecoveredPdfLineChunks(lines, cleanText, countWords) {
    const sourceLines = Array.isArray(lines)
      ? lines.map((line, index) => {
          const text = cleanText(line && line.text);
          if (!text) return null;
          const relativeY = Number(line && line.relativeY);
          const relativeYStart = Number(line && line.relativeYStart);
          const relativeYEnd = Number(line && line.relativeYEnd);
          const safeRelativeY = Number.isFinite(relativeY) ? Math.max(0, Math.min(1, relativeY)) : null;
          return {
            text,
            words: Number(line && line.words) || countWords(text),
            relativeY: safeRelativeY,
            relativeYStart: Number.isFinite(relativeYStart) ? Math.max(0, Math.min(1, relativeYStart)) : safeRelativeY,
            relativeYEnd: Number.isFinite(relativeYEnd) ? Math.max(0, Math.min(1, relativeYEnd)) : safeRelativeY,
            lineIndex: Number.isFinite(Number(line && line.order)) ? Number(line.order) : index
          };
        }).filter(Boolean)
      : [];
    if (!sourceLines.length) return [];
    const chunks = [];
    let bucket = [];
    let bucketWords = 0;
    const flush = () => {
      if (!bucket.length) return;
      const text = cleanText(bucket.map((line) => line.text).join(" "));
      const words = countWords(text);
      if (words >= 14) {
        const ys = bucket.map((line) => line.relativeY).filter((value) => Number.isFinite(value));
        const starts = bucket.map((line) => line.relativeYStart).filter((value) => Number.isFinite(value));
        const ends = bucket.map((line) => line.relativeYEnd).filter((value) => Number.isFinite(value));
        const center = ys.length ? ys.reduce((sum, value) => sum + value, 0) / ys.length : null;
        chunks.push({
          text,
          words,
          relativeY: center,
          relativeYStart: starts.length ? Math.min(...starts) : Number.isFinite(center) ? Math.max(0, center - 0.025) : null,
          relativeYEnd: ends.length ? Math.max(...ends) : Number.isFinite(center) ? Math.min(1, center + 0.09) : null,
          lineStart: bucket[0].lineIndex,
          lineEnd: bucket[bucket.length - 1].lineIndex
        });
      }
      bucket = [];
      bucketWords = 0;
    };
    sourceLines.forEach((line) => {
      if (looksLikeRecoveredPdfSemanticBoundary(line.text) && bucket.length && bucketWords >= 18) {
        flush();
      }
      bucket.push(line);
      bucketWords += line.words;
      if (bucketWords >= 190 && (/[.!?:;)]$/.test(line.text) || bucketWords >= 260)) {
        flush();
      }
    });
    flush();
    return chunks;
  }

  function buildRecoveredPdfTextChunks(text, cleanText, countWords) {
    const cleaned = cleanText(text);
    if (!cleaned) return [];
    const parts = cleaned
      .split(/(?:\n\s*){2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((part) => cleanText(part))
      .filter(Boolean);
    const sourceParts = parts.length ? parts : cleaned.split(/\s+/).reduce((list, word, index) => {
      const partIndex = Math.floor(index / 180);
      if (!list[partIndex]) list[partIndex] = [];
      list[partIndex].push(word);
      return list;
    }, []).map((words) => words.join(" "));
    const chunks = [];
    let bucket = [];
    let bucketWords = 0;
    const flush = () => {
      if (!bucket.length) return;
      const chunkText = cleanText(bucket.join(" "));
      const words = countWords(chunkText);
      if (words >= 14) {
        const center = Math.max(0.04, Math.min(0.96, (chunks.length + 0.2) / Math.max(1, sourceParts.length)));
        const span = Math.max(0.08, Math.min(0.22, 0.72 / Math.max(1, sourceParts.length)));
        chunks.push({
          text: chunkText,
          words,
          relativeY: center,
          relativeYStart: Math.max(0.02, center - span * 0.35),
          relativeYEnd: Math.min(0.98, center + span)
        });
      }
      bucket = [];
      bucketWords = 0;
    };
    sourceParts.forEach((part) => {
      const words = countWords(part);
      bucket.push(part);
      bucketWords += words;
      if (bucketWords >= 190) flush();
    });
    flush();
    return chunks;
  }

  function inferRecoveredPdfSectionTitle(pageNumber, text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    const heading = cleaned.split(/(?<=[.!?])\s+/)[0] || "";
    const shortHeading = heading.length > 78 ? `${heading.slice(0, 75).trim()}...` : heading;
    return shortHeading ? `Page ${pageNumber}: ${shortHeading}` : `Page ${pageNumber}`;
  }

  function classifyRecoveredPdfSectionType(chunk, index) {
    const text = String(chunk && chunk.text || "").toLowerCase();
    const words = Number(chunk && chunk.words) || countPdfWords(text);
    if (/\b(table of contents|contents)\b/i.test(text) || looksLikeRecoveredPdfToc(text)) return "toc";
    if (looksLikeRecoveredPdfNoise(text, words)) return "boilerplate";
    if (/\b(references|bibliography|works cited|literature cited|citations)\b/i.test(text)) return "works_cited";
    if (/\b(appendix|appendices|supplementary|supplemental materials?)\b/i.test(text)) return "appendix";
    if (/\babstract\b/i.test(text)) return "abstract";
    if (/\b(copyright|all rights reserved|page \d+\s+of\s+\d+|privacy policy|terms of service|downloaded from)\b/i.test(text)) return "boilerplate";
    if (/\b(form|notice|application|claim number|case number|account number|determination|deadline|respond by|due date|date of birth|address|phone|email)\b/i.test(text)) return "form";
    if (/\b(signature|signed|sincerely|respectfully submitted|authorized representative)\b/i.test(text)) return "signature";
    if (/\b(table|figure|chart|column|row|total|subtotal)\b/i.test(text)) return "table";
    if (/\b(results?|findings?|evaluation|experiments?|observations?|analysis)\b/i.test(text)) return "results";
    if (/\bdiscussion\b/i.test(text)) return "discussion";
    if (/\b(conclusions?|summary|final remarks|closing remarks)\b/i.test(text)) return "conclusion";
    if (/\b(methods?|methodology|materials and methods|experimental setup|approach|procedure|data and methods)\b/i.test(text)) return "methods";
    if (/\b(introduction|background|overview)\b/i.test(text)) return "introduction";
    if ((Number(chunk && chunk.pageNumber) <= 1 || index === 0) && words < 150 && !/[.!?]\s+\w/.test(text)) return "title_page";
    return "";
  }

  function recoveredPdfSectionKind(chunk, pdfSectionType) {
    const text = String(chunk && chunk.text || "").toLowerCase();
    if (pdfSectionType && !["title_page", "toc", "works_cited", "appendix", "introduction"].includes(pdfSectionType)) return pdfSectionType;
    if (/\b(notice|form|application|claim number|case number|account number|determination|deadline|respond by|due date|date of birth)\b/i.test(text)) return "form";
    if (/\b(table|figure|chart|total|subtotal|row|column)\b/i.test(text)) return "table";
    if (/\b(main argument|central argument|key argument|thesis|claim|we argue|this paper argues|main point|central claim)\b/i.test(text)) return "main_argument";
    if (/\b(key evidence|evidence|data show|results show|findings show|analysis shows|supports the claim|we found|we find|indicates?|demonstrates?|significant)\b/i.test(text)) return "key_evidence";
    if (/\b(definition|defined as|refers to|means)\b/i.test(text)) return "definition";
    if (/\b(methods?|methodology|approach|procedure|data and methods|materials and methods|experimental setup)\b/i.test(text)) return "methods";
    if (/\b(summary|abstract|key takeaway|bottom line|in short)\b/i.test(text)) return "summary";
    if (/\b(conclusion|therefore|overall|finally)\b/i.test(text)) return "conclusion";
    if (/\b(results?|findings?|outcomes?)\b/i.test(text)) return "results";
    return pdfSectionType || "useful_section";
  }

  function recoveredPdfKindLabel(kind) {
    const labels = {
      abstract: "Abstract",
      introduction: "Introduction",
      methods: "Methods",
      results: "Results",
      discussion: "Discussion",
      conclusion: "Conclusion",
      main_argument: "Main argument",
      key_evidence: "Key evidence",
      definition: "Definition",
      boilerplate: "Boilerplate",
      form: "Form or notice",
      table: "Table",
      signature: "Signature",
      works_cited: "Works cited",
      appendix: "Appendix",
      title_page: "Title page",
      toc: "Contents",
      summary: "Summary",
      ocr_letter_body: "Main body",
      ocr_date_reference: "Reference/date",
      ocr_signature: "Signature block",
      ocr_letterhead: "Letterhead",
      ocr_recipient: "Recipient",
      ocr_greeting: "Greeting",
      ocr_closing: "Closing",
      ocr_footer: "Footer",
      ocr_title: "Title",
      ocr_abstract: "Abstract",
      ocr_introduction: "Introduction",
      ocr_methods: "Methods",
      ocr_results: "Results",
      ocr_discussion: "Discussion",
      ocr_conclusion: "Conclusion",
      ocr_references: "Reference list",
      ocr_report_summary: "Report summary",
      ocr_recommendations: "Recommendations",
      ocr_form_notice: "Form or notice",
      ocr_table: "Table",
      ocr_invoice_summary: "Invoice or receipt",
      ocr_line_items: "Line items",
      ocr_total_due: "Total due",
      ocr_repeated_header: "Repeated header",
      ocr_repeated_footer: "Repeated footer",
      ocr_noise: "OCR noise",
      useful_section: "Useful section"
    };
    return labels[kind] || labels.useful_section;
  }

  function formatRecoveredPdfSectionLabel(isBest, kindLabel, pageNumber) {
    const parts = [];
    if (isBest) parts.push("Best");
    const label = kindLabel && kindLabel !== "Useful section" ? kindLabel : "";
    if (label) parts.push(label);
    if (pageNumber) parts.push(`Page ${pageNumber}`);
    return parts.join(" \u00b7 ") || (pageNumber ? `Page ${pageNumber}` : "Useful section");
  }

  function isRecoveredPdfLowValue(section) {
    const type = section && section.metrics ? section.metrics.pdfSectionType : "";
    const ocrRole = section && section.metrics ? normalizeRecoveredPdfOcrRole(section.metrics.ocrRole) : "";
    if (isRecoveredPdfOcrLowValueRole(ocrRole)) return true;
    return /^(works_cited|appendix|toc|title_page|boilerplate|signature)$/i.test(String(type || ""));
  }

  function looksLikeRecoveredPdfToc(text) {
    const dottedLines = (String(text || "").match(/\.{2,}\s*\d{1,4}\b/g) || []).length;
    const sectionLines = (String(text || "").match(/\b(chapter|section|figure|table)\s+\d+(?:\.\d+)?/gi) || []).length;
    return dottedLines >= 3 || sectionLines >= 5;
  }

  function looksLikeRecoveredPdfSemanticBoundary(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value || value.length > 100) return false;
    if (/^(abstract|summary|introduction|background|methods?|methodology|results?|findings?|discussion|conclusions?|recommendations?|limitations?|notice|signature|appendix|references|bibliography)\b[:.\s-]*$/i.test(value)) return true;
    if (/^\d+(?:\.\d+)*\s+[A-Z][A-Za-z ,/-]{3,80}$/.test(value)) return true;
    const words = countPdfWords(value);
    return words >= 2 && words <= 10 && value === value.toUpperCase() && /[A-Z]/.test(value);
  }

  function looksLikeRecoveredPdfNoise(text, words) {
    const value = String(text || "");
    if (/^\s*(page\s*)?\d{1,4}\s*(of\s*\d{1,4})?\s*$/i.test(value)) return true;
    if (words <= 3 && /^[^a-zA-Z]{2,}$/.test(value)) return true;
    if (words <= 5 && /\b(scanned|fax|copy|confidential)\b/i.test(value)) return true;
    if ((value.match(/[|_~]{2,}/g) || []).length >= 2) return true;
    return false;
  }

  function scoreRecoveredPdfChunk(chunk, index, total, pdfSectionType) {
    const text = String(chunk && chunk.text || "").toLowerCase();
    const signals = getRecoveredPdfChunkSignals(chunk, pdfSectionType);
    const ocrRole = normalizeRecoveredPdfOcrRole(chunk && chunk.ocrRole);
    let score = 48 + Math.min(24, Math.round((chunk.words || 0) / 12));
    if (ocrRole === "body") {
      score += 42;
      if ((chunk.words || 0) >= 40) score += 18;
      if (/\b(permit me to introduce|i would like|please|enclosed|regarding|because|therefore|request|recommend|important)\b/i.test(text)) score += 18;
    }
    if (ocrRole === "abstract") score += 30;
    if (ocrRole === "results") score += 54;
    if (ocrRole === "discussion") score += 26;
    if (ocrRole === "conclusion") score += 48;
    if (ocrRole === "report_summary") score += 34;
    if (ocrRole === "recommendations") score += 52;
    if (ocrRole === "form_notice") score += 40;
    if (ocrRole === "table") score += 18;
    if (ocrRole === "invoice_summary") score += 24;
    if (ocrRole === "total_due") score += 36;
    if (ocrRole === "line_items") score += 8;
    if (ocrRole === "introduction") score += 6;
    if (ocrRole === "methods") score += 10;
    if (ocrRole === "letterhead") score -= 72;
    if (ocrRole === "recipient") score -= 58;
    if (ocrRole === "date_reference") score -= 34;
    if (ocrRole === "greeting") score -= 38;
    if (ocrRole === "closing") score -= 58;
    if (ocrRole === "signature") score -= 86;
    if (ocrRole === "footer") score -= 78;
    if (ocrRole === "title") score -= 26;
    if (ocrRole === "references") score -= 70;
    if (ocrRole === "repeated_header") score -= 82;
    if (ocrRole === "repeated_footer") score -= 90;
    if (ocrRole === "noise") score -= 96;
    if (signals.semantic) score += 28;
    if (signals.semanticBody) score += 24;
    if (signals.deadline || signals.identifier) score += 18;
    if (signals.heading) score += 20;
    if (signals.numberedHeading) score += 16;
    if (signals.dates || signals.names) score += 10;
    if (signals.claims) score += 22;
    if (signals.forms) score += signals.signatureOnly ? 0 : 18;
    if (signals.tables) score += 14;
    if (pdfSectionType === "abstract") score += 28;
    if (pdfSectionType === "results") score += 36;
    if (pdfSectionType === "discussion") score += 22;
    if (pdfSectionType === "conclusion") score += 34;
    if (pdfSectionType === "methods") score += 24;
    if (pdfSectionType === "form" && /\b(notice|determination|deadline|respond by|due date|claim number|case number)\b/i.test(text)) score += 22;
    if (/\b(main argument|central claim|key evidence|we argue|we found|findings show|results show)\b/i.test(text)) score += 24;
    if (/\b(references|bibliography|works cited|appendix|acknowledg(e)?ments|table of contents|copyright|all rights reserved|page \d+\s+of\s+\d+|privacy policy|terms of service|downloaded from)\b/i.test(text)) score -= 42;
    if (signals.noise) score -= 54;
    if (signals.footer) score -= 38;
    if (signals.fragments) score -= 28;
    if (signals.repeated) score -= 28;
    if (pdfSectionType === "works_cited") score -= 58;
    if (pdfSectionType === "appendix") score -= 36;
    if (pdfSectionType === "toc") score -= 48;
    if (pdfSectionType === "title_page") score -= 34;
    if (pdfSectionType === "boilerplate") score -= 66;
    if (pdfSectionType === "signature" || signals.signatureOnly) score -= 72;
    if (signals.contactOnly) score -= 56;
    if ((chunk.words || 0) < 25 && ocrRole && !isRecoveredPdfOcrStrongContentRole(ocrRole)) score -= 24;
    if (chunk.pageNumber <= 2 && !/\b(abstract|summary|introduction|thesis|claim)\b/i.test(text)) score -= 8;
    if (index === 0 && total > 2) score -= 4;
    return Math.max(12, Math.min(99, score));
  }

  function getRecoveredPdfChunkSignals(chunk, pdfSectionType) {
    const text = String(chunk && chunk.text || "");
    const compact = text.replace(/\s+/g, " ").trim();
    const lines = compact.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean);
    const first = lines[0] || compact;
    const words = countPdfWords(compact);
    const uppercaseLetters = (first.match(/[A-Z]/g) || []).length;
    const letters = (first.match(/[A-Za-z]/g) || []).length;
    const semanticBody = words >= 24
      && lines.length >= 2
      && /\b(notice|determination|deadline|respond by|due date|summary|conclusion|findings?|results?|claim number|case number|main point|evidence)\b/i.test(compact);
    const signatureOnly = /\b(signature|signed|authorized representative|sincerely|respectfully submitted)\b/i.test(compact)
      && !/\b(notice|determination|deadline|respond by|due date|claim number|case number|findings?|results?|conclusion|summary)\b/i.test(compact);
    const contactOnly = words <= 45
      && /\b(address|phone|email|fax|street|avenue|road|suite|zip)\b/i.test(compact)
      && !/\b(notice|determination|deadline|respond by|due date|claim number|case number)\b/i.test(compact);
    return {
      semantic: /\b(abstract|summary|overview|introduction|thesis|claim|method|methodology|definition|defined as|steps?|procedure|evidence|analysis|results?|findings|discussion|conclusion|recommendation|key takeaways?)\b/i.test(compact),
      semanticBody,
      heading: words <= 80 && first.length <= 120 && (looksLikeRecoveredPdfSemanticBoundary(first) || letters >= 4 && uppercaseLetters / Math.max(1, letters) > 0.72),
      numberedHeading: /^\s*\d+(?:\.\d+)*\s+[A-Za-z]/.test(first),
      dates: /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i.test(compact),
      deadline: /\b(deadline|due date|respond by|reply by|must respond|no later than)\b/i.test(compact),
      identifier: /\b(claim number|case number|account number|invoice number|application number|reference number|[A-Z]{1,5}-\d{2,})\b/i.test(compact),
      names: /\b[A-Z][a-z]+,\s+[A-Z][a-z]+|\b(?:Mr|Mrs|Ms|Dr)\.\s+[A-Z][a-z]+\b/.test(text),
      claims: /\b(claim|argue|found|shows?|demonstrates?|indicates?|evidence|therefore|conclude|finding|significant)\b/i.test(compact),
      forms: /\b(form|notice|application|claim number|case number|account number|address|phone|email|signature)\b/i.test(compact),
      tables: pdfSectionType === "table" || /\b(table|figure|chart|total|subtotal|row|column)\b/i.test(compact),
      footer: /\b(page\s+\d+|copyright|all rights reserved|downloaded from|journal homepage|doi:|issn|isbn)\b/i.test(compact) && words < 80,
      fragments: words < 18 && !/\b(abstract|introduction|conclusion|results?|notice|signature)\b/i.test(compact),
      repeated: getRepeatedPdfLineCount(lines) >= 2,
      signatureOnly,
      contactOnly,
      noise: looksLikeRecoveredPdfNoise(compact, words)
    };
  }

  function getRecoveredPdfSemanticSortScore(section) {
    const matched = section && section.metrics && section.metrics.matched || {};
    const type = section && section.metrics && section.metrics.pdfSectionType || "";
    const ocrRole = normalizeRecoveredPdfOcrRole(section && section.metrics && section.metrics.ocrRole);
    let score = 0;
    if (ocrRole === "body") score += 110;
    if (ocrRole === "body" && Number(section && section.wordCount || 0) >= 40) score += 24;
    if (ocrRole === "results") score += 118;
    if (ocrRole === "conclusion") score += 112;
    if (ocrRole === "recommendations") score += 116;
    if (ocrRole === "form_notice") score += 94;
    if (ocrRole === "total_due") score += 88;
    if (ocrRole === "abstract") score += 72;
    if (ocrRole === "report_summary") score += 76;
    if (ocrRole === "discussion") score += 62;
    if (ocrRole === "table") score += 38;
    if (ocrRole === "invoice_summary") score += 34;
    if (ocrRole === "letterhead") score -= 120;
    if (ocrRole === "recipient") score -= 86;
    if (ocrRole === "date_reference") score -= 40;
    if (ocrRole === "greeting") score -= 52;
    if (ocrRole === "closing") score -= 78;
    if (ocrRole === "signature") score -= 124;
    if (ocrRole === "footer") score -= 104;
    if (ocrRole === "title") score -= 28;
    if (ocrRole === "references") score -= 112;
    if (ocrRole === "repeated_header") score -= 122;
    if (ocrRole === "repeated_footer") score -= 128;
    if (ocrRole === "noise") score -= 140;
    if (matched.conclusion || type === "conclusion") score += 42;
    if (matched.results || type === "results") score += 38;
    if (matched.summary || type === "abstract") score += 36;
    if (matched.mainArgument) score += 34;
    if (matched.keyEvidence) score += 30;
    if (type === "form" && /\b(notice|determination|deadline|respond by|due date|claim number|case number)\b/i.test(section && section.text || "")) score += 34;
    if (matched.directAction || matched.action || matched.recommendation) score += 18;
    if (type === "signature") score -= 70;
    if (/^(boilerplate|toc|title_page|works_cited|appendix)$/i.test(type)) score -= 60;
    return score;
  }

  function compareRecoveredPdfSections(a, b) {
    return (getRecoveredPdfSemanticSortScore(b) - getRecoveredPdfSemanticSortScore(a))
      || (b.score - a.score)
      || (Math.min(Number(b.wordCount || 0), 180) - Math.min(Number(a.wordCount || 0), 180))
      || (Number(a.pageNumber || 0) - Number(b.pageNumber || 0))
      || (Number(a.index || 0) - Number(b.index || 0));
  }

  function buildRecoveredPdfMetrics(chunk, score, pdfSectionType, sectionKind, sectionKindLabel, options = {}) {
    const text = String(chunk && chunk.text || "");
    const ocrRole = normalizeRecoveredPdfOcrRole(options.ocrRole || chunk && chunk.ocrRole);
    const ocrRoleLabel = options.ocrRoleLabel || recoveredPdfOcrRoleLabel(ocrRole);
    const roleEvidence = options.ocrRoleConfidence || options.ocrRoleReasons
      ? {
          confidence: Number(options.ocrRoleConfidence) || 0,
          reasons: Array.isArray(options.ocrRoleReasons) ? options.ocrRoleReasons : []
        }
      : getRecoveredPdfOcrRoleEvidence(ocrRole, text, {
          sourceLines: chunk && chunk.ocrSourceLines,
          words: chunk && chunk.words
        });
    return {
      wordCount: chunk.words || countPdfWords(text),
      linkCount: 0,
      links: 0,
      codeBlocks: 0,
      tables: /\b(table|figure|chart)\b/i.test(text) ? 1 : 0,
      fluffScore: /^(works_cited|appendix|toc|title_page|boilerplate|signature)$/i.test(pdfSectionType) || isRecoveredPdfOcrLowValueRole(ocrRole) || /\b(references|bibliography|appendix|works cited|copyright|all rights reserved)\b/i.test(text) ? 88 : 8,
      usefulScore: Math.max(30, Math.round(score * 0.62)),
      importanceScore: score,
      adapterScore: 0,
      sectionKind,
      sectionKindLabel,
      pdfSectionType,
      ocrRole,
      ocrRoleLabel,
      ocrRoleConfidence: roleEvidence.confidence,
      ocrRoleReasons: roleEvidence.reasons,
      matched: {
        conciseAnswer: /\b(summary|abstract|conclusion|finding|result)\b/i.test(text),
        summary: /\b(summary|abstract|overview|key takeaway)\b/i.test(text),
        directAction: /\b(should|must|need to|recommend)\b/i.test(text),
        completeCode: false,
        finalCode: false,
        finality: /\b(conclusion|therefore|finally|overall)\b/i.test(text),
        useful: /\b(important|key|main|evidence|analysis|result|finding)\b/i.test(text),
        warning: /\b(warning|risk|limitation|problem)\b/i.test(text),
        recommendation: /\b(recommend|suggest|should)\b/i.test(text),
        procedure: /\b(step|method|process|procedure)\b/i.test(text),
        action: /\b(action|do|make|create)\b/i.test(text),
        answer: /\b(answer|solution|claim|argument)\b/i.test(text),
        definition: /\b(definition|defined as|refers to|means)\b/i.test(text),
        conclusion: sectionKind === "conclusion",
        results: sectionKind === "results",
        mainArgument: sectionKind === "main_argument",
        keyEvidence: sectionKind === "key_evidence",
        methods: sectionKind === "methods",
        references: pdfSectionType === "works_cited",
        appendix: pdfSectionType === "appendix",
        tableOfContents: pdfSectionType === "toc",
        boilerplate: pdfSectionType === "boilerplate",
        ocrLetterBody: ocrRole === "body",
        ocrLetterhead: ocrRole === "letterhead",
        ocrRecipient: ocrRole === "recipient",
        ocrDateReference: ocrRole === "date_reference",
        ocrSignature: ocrRole === "signature",
        ocrResults: ocrRole === "results",
        ocrConclusion: ocrRole === "conclusion",
        ocrRecommendations: ocrRole === "recommendations",
        ocrFormNotice: ocrRole === "form_notice",
        ocrTotalDue: ocrRole === "total_due",
        ocrNoise: ocrRole === "noise" || ocrRole === "repeated_header" || ocrRole === "repeated_footer",
        codeExplanation: false,
        acceptedAnswer: false
      },
      selectionReason: options.selectionReason || (ocrRole ? recoveredPdfOcrSelectionReason(ocrRole, text) : recoveredPdfSelectionReason(sectionKind, pdfSectionType, text))
    };
  }

  function recoveredPdfSelectionReason(sectionKind, pdfSectionType, text) {
    if (pdfSectionType === "abstract") return "abstract-style section near the front";
    if (sectionKind === "conclusion") return "summary-style section near the end";
    if (sectionKind === "results") return "results or findings section";
    if (sectionKind === "key_evidence") return "dense section with claims, evidence, or named details";
    if (sectionKind === "form") return "form or notice with dates, names, or identifiers";
    if (sectionKind === "table") return "table-like section with structured details";
    if (/\b(deadline|respond by|due date|determination|notice|claim|case number|evidence|significant)\b/i.test(text)) return "contains dates, identifiers, deadlines, claims, or important document labels";
    return "readable OCR text with useful section signals";
  }

  function getRuntimeResourceUrl(path) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function") {
        return chrome.runtime.getURL(path);
      }
    } catch (error) {
      // Restricted pages can throw while still allowing TextDetector OCR.
    }
    return "";
  }

  function getPdfOcrPreflightSnapshot() {
    const assetPaths = [
      "node_modules/tesseract.js/dist/tesseract.esm.min.js",
      "node_modules/tesseract.js/dist/worker.min.js",
      "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
      "node_modules/tesseract.js-core/tesseract-core.wasm.js",
      "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"
    ];
    const assetUrls = assetPaths.map((path) => ({ path, url: getRuntimeResourceUrl(path) }));
    const hasRuntimeUrls = assetUrls.every((asset) => Boolean(asset.url));
    const hasTextDetector = typeof window.TextDetector === "function";
    const hasTesseractApi = Boolean(window.__PAGEPILOT_TESSERACT_MODULE__ || window.__PAGEPILOT_TESSERACT_PROMISE__ || window.Tesseract);
    return {
      supported: Boolean(hasTextDetector || hasTesseractApi || hasRuntimeUrls),
      hasTextDetector,
      hasTesseractApi,
      hasRuntimeUrls,
      missingAssets: assetUrls.filter((asset) => !asset.url).map((asset) => asset.path),
      assetUrls
    };
  }

  async function runPdfOcrPreflight(options = {}) {
    const snapshot = getPdfOcrPreflightSnapshot();
    const result = {
      ...snapshot,
      moduleLoaded: Boolean(window.__PAGEPILOT_TESSERACT_MODULE__ || window.Tesseract),
      moduleError: "",
      exactIssue: ""
    };
    if (!snapshot.supported) {
      result.exactIssue = "No browser TextDetector or bundled Tesseract runtime URL is available.";
      emitDebug("pdf:ocr:preflight", result);
      return result;
    }
    if (options.loadModule && !snapshot.hasTextDetector) {
      try {
        await loadTesseractModule();
        result.moduleLoaded = true;
      } catch (error) {
        result.moduleError = String(error && error.message ? error.message : error);
        result.exactIssue = "Bundled Tesseract assets were detected, but the OCR module could not be imported.";
      }
    }
    emitDebug("pdf:ocr:preflight", result);
    return result;
  }

  function supportsPdfOcr() {
    return getPdfOcrPreflightSnapshot().supported;
  }

  function countPdfWords(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function countPatternHits(text, pattern) {
    const matches = String(text || "").match(pattern);
    return matches ? matches.length : 0;
  }

  function isPdfOcrSourceType(source) {
    return /^(ocr|tesseract|tesseract-direct|tesseract-direct-fallback|textdetector)$/i.test(String(source || ""));
  }

  function rememberRawPdfOcrText(options = {}) {
    const text = String(options.text || "");
    const pages = normalizePdfRecoveryPages(options.pages);
    const wordCount = Number.isFinite(Number(options.wordCount)) ? Number(options.wordCount) : countPdfWords(text);
    const stats = {
      ocrRunId: Number(options.ocrRunId) || getActivePdfOcrRunId(),
      routeKey: String(options.routeKey || getPdfDocumentRouteKey()),
      source: String(options.source || "ocr"),
      rawTextLength: text.length,
      wordCount,
      confidence: Number.isFinite(Number(options.confidence)) ? Math.round(Number(options.confidence)) : 0,
      firstTextSample: text.slice(0, 240)
    };
    if (runtime.pdfOcr) {
      runtime.pdfOcr.lastRawOcrText = text;
      runtime.pdfOcr.lastRawOcrPages = pages;
      runtime.pdfOcr.lastRawOcrStats = stats;
      runtime.pdfOcr.lastParserError = null;
    }
    emitDebug("pdf:ocr:raw-text-ready", stats);
    return stats;
  }

  function normalizePdfOcrParserErrorDetails(error, phase = "", extra = {}) {
    const direct = error && typeof error === "object" ? error : {};
    const logDetails = getErrorLogDetails(error);
    const parserErrorName = String(direct.parserErrorName || direct.errorName || direct.name || logDetails.errorName || "");
    const parserErrorMessage = String(direct.parserErrorMessage || direct.errorMessage || direct.message || logDetails.errorMessage || error || "");
    const parserErrorStack = String(direct.parserErrorStack || direct.errorStack || direct.stack || logDetails.errorStack || "");
    return {
      parserErrorName,
      parserErrorMessage,
      parserErrorStack,
      parserErrorPhase: String(direct.parserErrorPhase || phase || ""),
      parserFallbackUsed: Boolean(extra.fallbackUsed || direct.parserFallbackUsed),
      parserFallbackSections: Number(direct.parserFallbackSections || extra.fallbackSections || 0) || 0
    };
  }

  function rememberPdfOcrParserError(error, phase, extra = {}) {
    const entry = extra.entry || {};
    const rawText = String(extra.rawText !== undefined ? extra.rawText : entry.text || runtime.pdfOcr && runtime.pdfOcr.lastRawOcrText || "");
    const pages = Array.isArray(extra.pages) ? extra.pages : Array.isArray(entry.pages) ? entry.pages : runtime.pdfOcr && runtime.pdfOcr.lastRawOcrPages || [];
    const parserError = {
      ...normalizePdfOcrParserErrorDetails(error, phase, extra),
      routeKey: String(extra.routeKey || getPdfDocumentRouteKey()),
      rawTextLength: rawText.length,
      wordCount: Number.isFinite(Number(extra.wordCount)) ? Number(extra.wordCount) : Number(entry.words) || countPdfWords(rawText),
      firstTextSample: rawText.slice(0, 240),
      pages: pages.length
    };
    if (runtime.pdfOcr) {
      runtime.pdfOcr.lastParserError = parserError;
    }
    emitDebug("pdf:ocr:parser:error", {
      ...parserError,
      ...getErrorLogDetails(error)
    });
    return parserError;
  }

  function getPdfOcrParserErrorForDiagnostic(value) {
    if (!value) return null;
    const details = normalizePdfOcrParserErrorDetails(value);
    if (!details.parserErrorMessage && !details.parserErrorName) return null;
    return details;
  }

  function isMeaningfulShortOcrText(text, pages = []) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    const words = countPdfWords(value);
    if (words >= PDF_RECOVERY_MIN_WORDS) return true;
    if (words < PDF_OCR_SHORT_MEANINGFUL_WORDS) return false;
    const pageLines = (Array.isArray(pages) ? pages : [])
      .flatMap((page) => Array.isArray(page && page.lines) ? page.lines : [])
      .map((line) => String(line && line.text || "").trim())
      .filter(Boolean);
    const semanticHits = countPatternHits(value, /\b(abstract|summary|notice|form|signature|table|date|claim|case|number|invoice|receipt|amount|total|address|name|respond|deadline|approved|denied|determination|evidence|results?|findings?|conclusions?)\b/gi);
    const hasDateOrIdentifier = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z]{1,4}-?\d{2,}|(?:19|20)\d{2})\b/.test(value);
    const hasSentence = /[.!?:;]/.test(value) && words >= PDF_OCR_SHORT_MEANINGFUL_WORDS + 2;
    return semanticHits >= 1 || (hasDateOrIdentifier && (pageLines.length >= 1 || words >= 14)) || hasSentence;
  }

  function isCacheableShortOcrText(text, pages = []) {
    const words = countPdfWords(text);
    return words >= PDF_OCR_CACHE_MIN_WORDS && isMeaningfulShortOcrText(text, pages);
  }

  function isPdfRecoveryResultUsable(result, text, words) {
    const recoveredWords = Number.isFinite(Number(words)) ? Number(words) : countPdfWords(text);
    if (result && result.source === "ocr" && !isPdfOcrStructurallyCompleteForCache({ ...result, text, words: recoveredWords })) return false;
    if (recoveredWords >= PDF_RECOVERY_MIN_WORDS) return true;
    return Boolean(result && result.source === "ocr" && isMeaningfulShortOcrText(text, result.pages));
  }

  function isPdfRecoveryResultCacheable(result, text, words) {
    const recoveredWords = Number.isFinite(Number(words)) ? Number(words) : countPdfWords(text);
    if (result && result.source === "ocr" && !isPdfOcrStructurallyCompleteForCache({ ...result, text, words: recoveredWords })) return false;
    if (recoveredWords >= PDF_RECOVERY_MIN_WORDS) return true;
    return Boolean(result && result.source === "ocr" && isCacheableShortOcrText(text, result.pages));
  }

  function isPdfOcrStructurallyCompleteForCache(entry) {
    if (!entry || String(entry.source || "").toLowerCase() !== "ocr") return true;
    const structure = entry.ocrStructure && typeof entry.ocrStructure === "object"
      ? entry.ocrStructure
      : getPdfOcrStructureCompleteness(entry);
    const pages = Array.isArray(entry.pages) ? entry.pages : [];
    const text = String(entry.text || pages.map((page) => page && page.text || "").filter(Boolean).join("\n\n"));
    const lines = pages.flatMap((page) => Array.isArray(page && page.lines) ? page.lines : []);
    const textQuality = entry.ocrTextQuality && typeof entry.ocrTextQuality === "object"
      ? entry.ocrTextQuality
      : evaluatePdfOcrTextQuality({
        text,
        lines,
        words: Number(entry.words) || countPdfWords(text),
        confidence: Number(entry.confidence) || averageLineConfidence(lines),
        source: entry.source || "ocr",
        recognitionVariant: entry.ocrMode || entry.adaptiveMode || ""
      }, structure);
    if (textQuality && (textQuality.corrupted || textQuality.missedRegionLikely)) return false;
    return !(structure && !structure.complete);
  }

  function normalizePdfOcrDiagnosticMode(mode) {
    return String(mode || "").toLowerCase() === "better" ? "better" : "fast";
  }

  function sanitizePdfOcrVariantResult(variant) {
    const errorMessage = String(variant && (variant.errorMessage || variant.error) || "");
    const result = {
      variantName: String(variant && (variant.variantName || variant.recognitionVariant || variant.label) || ""),
      pageNumber: Number(variant && variant.pageNumber) || 0,
      canvasWidth: Number(variant && variant.canvasWidth) || 0,
      canvasHeight: Number(variant && variant.canvasHeight) || 0,
      inkRatio: Number.isFinite(Number(variant && variant.inkRatio)) ? Number(variant.inkRatio) : 0,
      rawTextLength: Number(variant && variant.rawTextLength) || 0,
      wordCount: Number(variant && (variant.wordCount || variant.words)) || 0,
      confidence: Number(variant && variant.confidence) || 0,
      firstTextSample: String(variant && variant.firstTextSample || "").slice(0, 240)
    };
    if (errorMessage) result.errorMessage = errorMessage;
    return result;
  }

  function collectPdfOcrVariantResults(pageDiagnostics) {
    return (Array.isArray(pageDiagnostics) ? pageDiagnostics : [])
      .flatMap((diagnostic) => Array.isArray(diagnostic && diagnostic.variantResults) ? diagnostic.variantResults : [])
      .map(sanitizePdfOcrVariantResult);
  }

  function selectBestPdfOcrDiagnosticVariant(variantResults) {
    return (Array.isArray(variantResults) ? variantResults : []).reduce((best, variant) => {
      if (!best) return variant;
      if ((variant.wordCount || 0) !== (best.wordCount || 0)) return (variant.wordCount || 0) > (best.wordCount || 0) ? variant : best;
      if ((variant.rawTextLength || 0) !== (best.rawTextLength || 0)) return (variant.rawTextLength || 0) > (best.rawTextLength || 0) ? variant : best;
      return (variant.confidence || 0) > (best.confidence || 0) ? variant : best;
    }, null);
  }

  function selectPdfOcrDiagnosticPage(pageDiagnostics, bestVariant) {
    const diagnostics = Array.isArray(pageDiagnostics) ? pageDiagnostics.filter(Boolean) : [];
    if (!diagnostics.length) return null;
    const bestPageNumber = Number(bestVariant && bestVariant.pageNumber) || 0;
    return diagnostics.find((diagnostic) => Number(diagnostic && diagnostic.pageNumber) === bestPageNumber)
      || diagnostics.reduce((best, diagnostic) => {
        const bestScore = Math.max(Number(best && best.words) || 0, ...(Array.isArray(best && best.variantResults) ? best.variantResults.map((variant) => Number(variant && (variant.wordCount || variant.words || variant.rawTextLength)) || 0) : [0]));
        const score = Math.max(Number(diagnostic && diagnostic.words) || 0, ...(Array.isArray(diagnostic && diagnostic.variantResults) ? diagnostic.variantResults.map((variant) => Number(variant && (variant.wordCount || variant.words || variant.rawTextLength)) || 0) : [0]));
        return score > bestScore ? diagnostic : best;
      }, diagnostics[0]);
  }

  function getPdfOcrRootCause(finalStatus, details = {}) {
    if (details.parserFallbackUsed && /^(success|weak_text)$/i.test(String(finalStatus || ""))) {
      return details.parserErrorMessage
        ? `OCR produced usable text; smart PDF section scoring failed (${details.parserErrorMessage}), so SkimRoute built a simple OCR page map.`
        : "OCR produced usable text; smart PDF section scoring failed, so SkimRoute built a simple OCR page map.";
    }
    switch (finalStatus) {
      case "success":
        return "OCR produced usable text and SkimRoute built a PDF map.";
      case "weak_text":
        return "Fast OCR returned fewer than 30 parser words; Better OCR should remain available.";
      case "blank_canvas":
        return "PDF.js rendered a blank or nearly blank page canvas, so OCR did not receive visible page text.";
      case "ocr_no_text":
        return "OCR recognition completed, but every successful variant returned zero raw text.";
      case "ocr_error":
        return details.errorMessage || "OCR ended with an error before a usable map could be built.";
      case "parser_discarded_text":
        return "OCR returned raw text, but SkimRoute's PDF parser produced zero sections and zero parser words.";
      case "parser_error":
        return details.parserErrorMessage || details.errorMessage || "OCR returned raw text, but PDF section parsing/scoring crashed before a map could be built.";
      case "cancelled":
        return "OCR was cancelled before it produced a final PDF map.";
      case "timeout":
        return "OCR exceeded the time limit for this device and SkimRoute stopped the worker.";
      default:
        return "OCR ended without a classified result.";
    }
  }

  function isPdfOcrStatusOverwrittenByScan(model) {
    const profile = model && model.pageProfile || {};
    return Boolean(
      profile.type === "pdf"
      && profile.state === "loading"
      && /still loading|checking|reading pdf|running ocr/i.test(String(profile.reason || profile.diagnosticHint || ""))
    );
  }

  function buildPdfOcrFinalDiagnostic(options = {}) {
    const result = options.result || {};
    const ocrRunId = Number(options.ocrRunId || options.attemptId || runtime.pdfOcr && (runtime.pdfOcr.activeOcrRunId || runtime.pdfOcr.activeAttemptId) || 0) || 0;
    const pageDiagnostics = Array.isArray(result.pageDiagnostics) ? result.pageDiagnostics : Array.isArray(options.pageDiagnostics) ? options.pageDiagnostics : [];
    const variantResults = Array.isArray(options.variantResults)
      ? options.variantResults.map(sanitizePdfOcrVariantResult)
      : collectPdfOcrVariantResults(pageDiagnostics);
    const bestVariant = selectBestPdfOcrDiagnosticVariant(variantResults);
    const pageDiagnostic = selectPdfOcrDiagnosticPage(pageDiagnostics, bestVariant) || {};
    const canvasStats = pageDiagnostic.canvasStats || {};
    const parserModel = options.parserModel || null;
    const parserInputText = String(options.parserInputText !== undefined ? options.parserInputText : result.text || "");
    const parserOutputSections = Number.isFinite(Number(options.parserOutputSections))
      ? Number(options.parserOutputSections)
      : parserModel && Array.isArray(parserModel.sections)
        ? parserModel.sections.length
        : 0;
    const parserOutputWords = Number.isFinite(Number(options.parserOutputWords))
      ? Number(options.parserOutputWords)
      : parserModel
        ? Number(parserModel.totalReadableWords || parserModel.totalWords || 0)
        : 0;
    const modelDiagnostics = parserModel && parserModel.diagnostics || {};
    const parserError = getPdfOcrParserErrorForDiagnostic(
      options.parserError
      || options.parserErrorDetails
      || runtime.pdfOcr && runtime.pdfOcr.lastParserError
      || (modelDiagnostics.parserErrorMessage ? modelDiagnostics : null)
    );
    const parserFallbackUsed = Boolean(options.parserFallbackUsed || modelDiagnostics.parserFallbackUsed);
    const parserFallbackSections = Number(options.parserFallbackSections || modelDiagnostics.parserFallbackSections || (parserFallbackUsed ? parserOutputSections : 0)) || 0;
    const mode = normalizePdfOcrDiagnosticMode(options.mode || result.adaptiveMode || result.ocrMode || runtime.pdfOcr && runtime.pdfOcr.mode || "");
    const bestRawTextLength = Number(bestVariant && bestVariant.rawTextLength) || 0;
    const bestWordCount = Number(bestVariant && bestVariant.wordCount) || 0;
    const bestConfidence = Number(bestVariant && bestVariant.confidence) || 0;
    const blankPageLikely = Boolean(
      options.blankPageLikely
      || result.errorKind === "ocr-blank-canvas"
      || canvasStats.blankPageLikely
      || pageDiagnostic.blankOrUnreadableCanvas && canvasStats.blankPageLikely
      || pageDiagnostic.likelyBlank
    );
    const anyVariantSucceeded = variantResults.some((variant) => !variant.errorMessage);
    const overwrittenByScanState = Boolean(options.overwrittenByScanState);
    let finalStatus = options.finalStatus || "";
    if (!finalStatus) {
      if (blankPageLikely) {
        finalStatus = "blank_canvas";
      } else if (bestRawTextLength === 0 && variantResults.length && anyVariantSucceeded) {
        finalStatus = "ocr_no_text";
      } else if (parserError && parserInputText.length > 0 && parserOutputSections <= 0 && parserOutputWords <= 0) {
        finalStatus = "parser_error";
      } else if (bestRawTextLength > 0 && parserOutputSections <= 0 && parserOutputWords <= 0) {
        finalStatus = "parser_discarded_text";
      } else if (mode === "fast" && parserOutputWords > 0 && parserOutputWords < PDF_OCR_WEAK_TEXT_WORDS) {
        finalStatus = "weak_text";
      } else if (parserOutputSections > 0 && parserOutputWords > 0) {
        finalStatus = "success";
      } else if (!finalStatus) {
        finalStatus = "ocr_error";
      }
    }
    const canRunBetter = Boolean(
      options.canRunBetter
      || finalStatus === "weak_text"
      || mode === "fast" && parserOutputWords < PDF_OCR_WEAK_TEXT_WORDS
      || runtime.pdfOcr && runtime.pdfOcr.betterAvailableForRoute === getRouteCacheKey()
    );
    const cancelled = Boolean(options.cancelled || finalStatus === "cancelled" || runtime.pdfOcr && runtime.pdfOcr.cancelRequested && (!ocrRunId || runtime.pdfOcr.cancelAttemptId === ocrRunId));
    const timedOut = Boolean(options.timedOut || finalStatus === "timeout" || runtime.pdfOcr && runtime.pdfOcr.timedOut);
    return {
      finalStatus,
      rootCause: getPdfOcrRootCause(finalStatus, {
        errorMessage: options.errorMessage || result.error || "",
        parserFallbackUsed,
        parserErrorMessage: parserError && parserError.parserErrorMessage || ""
      }),
      ocrRunId,
      pdfState: finalStatus === "timeout" ? "ocr_failed" : runtime.pdfOcr && runtime.pdfOcr.state || "",
      mode,
      elapsedMs: Number(options.elapsedMs) || (runtime.pdfOcr && runtime.pdfOcr.analysisStartedAt ? Date.now() - runtime.pdfOcr.analysisStartedAt : 0),
      currentStep: String(options.currentStep || runtime.pdfOcr && runtime.pdfOcr.currentStep || ""),
      cancelled,
      timedOut,
      workerTerminated: Boolean(options.workerTerminated || runtime.pdfOcr && runtime.pdfOcr.workerTerminated),
      pageNumber: Number(pageDiagnostic.pageNumber || bestVariant && bestVariant.pageNumber) || 0,
      canvasWidth: Number(canvasStats.width || bestVariant && bestVariant.canvasWidth) || 0,
      canvasHeight: Number(canvasStats.height || bestVariant && bestVariant.canvasHeight) || 0,
      renderScale: Number(canvasStats.renderScale || pageDiagnostic.renderScale) || 0,
      inkRatio: Number.isFinite(Number(canvasStats.inkRatio)) ? Number(canvasStats.inkRatio) : Number(bestVariant && bestVariant.inkRatio) || 0,
      darkPixelRatio: Number.isFinite(Number(canvasStats.darkPixelRatio)) ? Number(canvasStats.darkPixelRatio) : 0,
      blankPageLikely,
      variantResults,
      bestVariantName: String(bestVariant && bestVariant.variantName || ""),
      bestRawTextLength,
      bestWordCount,
      bestConfidence,
      parserInputTextLength: parserInputText.length,
      parserOutputSections,
      parserOutputWords,
      parserErrorName: parserError && parserError.parserErrorName || "",
      parserErrorMessage: parserError && parserError.parserErrorMessage || "",
      parserErrorStack: parserError && parserError.parserErrorStack || "",
      parserErrorPhase: parserError && parserError.parserErrorPhase || "",
      parserFallbackUsed,
      parserFallbackSections,
      canRunBetter,
      cachedAsSuccess: Boolean(options.cachedAsSuccess),
      overwrittenByScanState
    };
  }

  function getPdfOcrFinishedRunSet() {
    if (!runtime.pdfOcr.finishedOcrRunIds || typeof runtime.pdfOcr.finishedOcrRunIds.has !== "function") {
      runtime.pdfOcr.finishedOcrRunIds = new Set();
    }
    return runtime.pdfOcr.finishedOcrRunIds;
  }

  function getActivePdfOcrRunId() {
    return Number(runtime.pdfOcr && (runtime.pdfOcr.activeOcrRunId || runtime.pdfOcr.activeAttemptId) || 0) || 0;
  }

  function isActiveOcrRun(ocrRunId) {
    const runId = Number(ocrRunId) || 0;
    const activeRunId = getActivePdfOcrRunId();
    if (!runtime.pdfOcr) return false;
    if (!runId || !activeRunId || runId !== activeRunId) return false;
    if (runId && activeRunId && runId !== activeRunId) return false;
    if (runId && getPdfOcrFinishedRunSet().has(runId)) return false;
    if (runtime.pdfOcr.finalized || runtime.pdfOcr.cancelRequested || runtime.pdfOcr.timedOut) return false;
    return true;
  }

  function assertActiveOcrRun(ocrRunId) {
    if (!isActiveOcrRun(ocrRunId)) {
      throw makePdfOcrCancelledError("PDF OCR run is no longer active.");
    }
  }

  function isPdfOcrActive() {
    const ocrRunId = getActivePdfOcrRunId();
    return Boolean(
      runtime.pdfOcr
      && ocrRunId
      && isActiveOcrRun(ocrRunId)
      && runtime.pdfOcr.state === "ocr"
      && runtime.pdfOcr.pending
    );
  }

  function isPdfOcrWorkerActiveForRun(ocrRunId) {
    const runId = Number(ocrRunId) || 0;
    return Boolean(
      runId
      && isActiveOcrRun(runId)
      && runtime.pdfOcr
      && runtime.pdfOcr.activeWorker
      && runtime.pdfOcr.activeWorkerRunId === runId
      && !runtime.pdfOcr.activeWorkerTerminated
    );
  }

  function setActivePdfOcrWorker(worker, ocrRunId, options = null) {
    if (!runtime.pdfOcr || !worker || !ocrRunId) return;
    runtime.pdfOcr.activeWorker = worker;
    runtime.pdfOcr.activeWorkerRunId = Number(ocrRunId) || 0;
    runtime.pdfOcr.activeWorkerTerminated = false;
    runtime.pdfOcr.workerTerminated = false;
    runtime.pdfOcr.activeWorkerOptions = options || null;
    runtime.pdfOcr.activeWorkerContext = options ? getTesseractRuntimeContext(options) : null;
  }

  function clearActivePdfOcrWorker(worker, ocrRunId, terminated = false) {
    if (!runtime.pdfOcr) return;
    const runMatches = !ocrRunId || !runtime.pdfOcr.activeWorkerRunId || runtime.pdfOcr.activeWorkerRunId === Number(ocrRunId);
    const workerMatches = !worker || runtime.pdfOcr.activeWorker === worker;
    if (!runMatches || !workerMatches) return;
    runtime.pdfOcr.activeWorker = null;
    runtime.pdfOcr.activeWorkerRunId = 0;
    runtime.pdfOcr.activeWorkerTerminated = Boolean(terminated);
    runtime.pdfOcr.activeWorkerOptions = null;
    runtime.pdfOcr.activeWorkerContext = null;
    runtime.pdfOcr.workerTerminated = Boolean(terminated || runtime.pdfOcr.workerTerminated);
  }

  function assertPdfOcrWorkerReady(worker, ocrRunId) {
    assertActiveOcrRun(ocrRunId);
    if (!worker || !isPdfOcrWorkerActiveForRun(ocrRunId)) {
      throw makePdfOcrCancelledError("PDF OCR worker is no longer active for this run.");
    }
  }

  function isStalePdfOcrPostMessageError(error, ocrRunId) {
    const message = String(error && (error.message || error) || "");
    return /postMessage/i.test(message) && (!isActiveOcrRun(ocrRunId) || !isPdfOcrWorkerActiveForRun(ocrRunId));
  }

  function shouldExposePdfOcrCancel() {
    const ocrRunId = getActivePdfOcrRunId();
    return Boolean(
      isCurrentPdfRouteForOcrControls()
      && runtime.pdfOcr
      && ocrRunId
      && isPdfOcrActive()
      && runtime.pdfOcr.pending
      && runtime.pdfOcr.state === "ocr"
      && !runtime.pdfOcr.finalized
      && !runtime.pdfOcr.cancelRequested
      && !runtime.pdfOcr.timedOut
    );
  }

  function shouldExposePdfOcrBetter(routeKey = getRouteCacheKey()) {
    const state = String(runtime.pdfOcr && runtime.pdfOcr.state || "").toLowerCase();
    const errorKind = String(runtime.pdfOcr && runtime.pdfOcr.errorKind || "").toLowerCase();
    const betterEligibleState = Boolean(
      /^(needs-ocr|ocr-prompt|ocr-unreadable)$/i.test(state)
      || /^(ocr-low-text|ocr-unreadable)$/i.test(errorKind)
      || runtime.pdfOcr && runtime.pdfOcr.needsPrompt && !/^(ocr-failed|ocr-cancelled|fetch-error|ready)$/i.test(state)
    );
    return Boolean(
      isCurrentPdfRouteForOcrControls()
      && runtime.pdfOcr
      && !isPdfOcrActive()
      && !runtime.pdfOcr.pending
      && !runtime.pdfOcr.retrying
      && !runtime.pdfOcr.cancelRequested
      && !runtime.pdfOcr.timedOut
      && state !== "ready"
      && state !== "ocr-failed"
      && state !== "ocr-cancelled"
      && errorKind !== "ocr-timeout"
      && runtime.pdfOcr.betterAvailableForRoute
      && runtime.pdfOcr.betterAvailableForRoute === routeKey
      && betterEligibleState
    );
  }

  function safeOcrProgress(ocrRunId, event, allowOcr) {
    if (allowOcr && !isActiveOcrRun(ocrRunId)) {
      emitDebug("pdf:ocr:stale-progress-ignored", {
        ocrRunId: Number(ocrRunId) || 0,
        activeOcrRunId: getActivePdfOcrRunId(),
        state: runtime.pdfOcr && runtime.pdfOcr.state || "",
        finalized: Boolean(runtime.pdfOcr && runtime.pdfOcr.finalized),
        message: event && event.message || "",
        exactIssue: "A stale OCR progress callback arrived after this run was no longer active, so SkimRoute ignored it."
      });
      return false;
    }
    updatePdfRecoveryProgress({ ...(event || {}), ocrRunId }, allowOcr);
    return true;
  }

  function beginOcrRun(options = {}) {
    if (!runtime || !runtime.pdfOcr) return 0;
    const previousRunId = getActivePdfOcrRunId();
    if (previousRunId && isActiveOcrRun(previousRunId)) {
      finishOcrRun("cancelled", {
        ocrRunId: previousRunId,
        routeKey: runtime.pdfOcr.attemptedForRoute || getRouteCacheKey(),
        mode: runtime.pdfOcr.mode || "",
        pageDiagnostics: runtime.pdfOcr.lastDiagnostics || [],
        parserInputText: "",
        parserOutputSections: 0,
        parserOutputWords: 0,
        cachedAsSuccess: false,
        canRunBetter: false,
        errorMessage: "A new OCR run started before the previous run finished.",
        currentStep: runtime.pdfOcr.currentStep || "replaced-by-new-run",
        cancelled: true,
        terminateWorker: true
      });
    }

    const ocrRunId = (Number(runtime.pdfOcr.activeAttemptId || runtime.pdfOcr.activeOcrRunId) || 0) + 1;
    const startedAt = Date.now();
    runtime.pdfOcr.activeAttemptId = ocrRunId;
    runtime.pdfOcr.activeOcrRunId = ocrRunId;
    runtime.pdfOcr.pending = true;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.finishedOcrRunIds = new Set();
    runtime.pdfOcr.finalized = false;
    runtime.pdfOcr.timedOut = false;
    runtime.pdfOcr.cancelRequested = false;
    runtime.pdfOcr.cancelAttemptId = 0;
    runtime.pdfOcr.workerTerminated = false;
    runtime.pdfOcr.activeWorker = null;
    runtime.pdfOcr.activeWorkerRunId = 0;
    runtime.pdfOcr.activeWorkerTerminated = false;
    runtime.pdfOcr.activeWorkerOptions = null;
    runtime.pdfOcr.activeWorkerContext = null;
    runtime.pdfOcr.finalDiagnostic = null;
    runtime.pdfOcr.currentStep = "starting-ocr";
    runtime.pdfOcr.startedAt = startedAt;
    runtime.pdfOcr.analysisStartedAt = startedAt;
    runtime.pdfOcr.mode = getManualPdfOcrMode(options.mode || runtime.pdfOcr.recommendedMode || "fast");
    runtime.pdfOcr.attemptedForRoute = options.routeKey || getRouteCacheKey();
    runtime.pdfOcr.lastOcrProgressLogAt = 0;
    runtime.pdfOcr.lastProgressRenderedAt = 0;
    startPdfAnalysisWatchdog(options.reason || "ocr", runtime.pdfOcr.attemptedForRoute, true, ocrRunId);
    return ocrRunId;
  }

  function inferPdfOcrFinalStatus(fallbackStatus, details = {}) {
    const diagnostic = buildPdfOcrFinalDiagnostic({
      ...details,
      finalStatus: /^(cancelled|timeout)$/i.test(String(fallbackStatus || "")) ? fallbackStatus : ""
    });
    return diagnostic.finalStatus || fallbackStatus || "ocr_error";
  }

  function finishOcrRun(finalStatus, details = {}) {
    if (!runtime || !runtime.pdfOcr) return null;
    const ocrRunId = Number(details.ocrRunId || details.attemptId || getActivePdfOcrRunId()) || 0;
    const activeRunId = getActivePdfOcrRunId();
    const finishedRuns = getPdfOcrFinishedRunSet();
    if (ocrRunId && activeRunId && ocrRunId !== activeRunId) {
      emitDebug("pdf:ocr:finish-stale", {
        finalStatus,
        ocrRunId,
        activeOcrRunId: activeRunId,
        exactIssue: "A stale OCR run tried to finish after a newer run became active; no final diagnostic was emitted for the stale run."
      });
      return runtime.pdfOcr.finalDiagnostic || null;
    }
    if (ocrRunId && finishedRuns.has(ocrRunId)) {
      return runtime.pdfOcr.finalDiagnostic || null;
    }

    const resolvedStatus = String(finalStatus || "ocr_error");
    const elapsedMs = Number(details.elapsedMs) || (runtime.pdfOcr.analysisStartedAt ? Date.now() - runtime.pdfOcr.analysisStartedAt : 0);
    const timedOut = Boolean(details.timedOut || resolvedStatus === "timeout");
    const cancelled = Boolean(details.cancelled || resolvedStatus === "cancelled" || runtime.pdfOcr.cancelRequested);
    const readyOcrModel = /^(success|weak_text)$/i.test(resolvedStatus)
      ? getReadyPdfOcrModelCandidate({ ...details, reason: "finishOcrRun" })
      : null;
    const hasReadyOcrModel = Boolean(readyOcrModel && isUsablePdfStatsModel(readyOcrModel, true));
    let workerTerminated = Boolean(details.workerTerminated || runtime.pdfOcr.workerTerminated);
    if (ocrRunId) finishedRuns.add(ocrRunId);
    runtime.pdfOcr.finalized = true;
    runtime.pdfOcr.timedOut = timedOut;
    runtime.pdfOcr.cancelRequested = cancelled;
    const cleanup = cancelActivePdfOcrWork(resolvedStatus, { terminateWorker: true });
    workerTerminated = Boolean(workerTerminated || cleanup.workerTerminated);

    runtime.pdfOcr.workerTerminated = Boolean(workerTerminated || runtime.pdfOcr.workerTerminated);
    runtime.pdfOcr.pending = false;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.activePromise = null;
    window.clearTimeout(runtime.pdfOcr.retryTimer);
    runtime.pdfOcr.retryTimer = null;
    stopPdfAnalysisWatchdog();

    if (hasReadyOcrModel) {
      runtime.pdfOcr.progress = 100;
      runtime.pdfOcr.lastError = "";
      runtime.pdfOcr.errorKind = "";
      runtime.pdfOcr.needsPrompt = false;
      runtime.pdfOcr.state = "ready";
      runtime.pdfOcr.completedForRoute = details.routeKey || getPdfDocumentRouteKey();
      runtime.pdfOcr.betterAvailableForRoute = resolvedStatus === "weak_text" && details.canRunBetter
        ? details.routeKey || getRouteCacheKey()
        : runtime.pdfOcr.betterAvailableForRoute;
    } else if (resolvedStatus === "success") {
      runtime.pdfOcr.progress = 100;
      runtime.pdfOcr.lastError = "";
      runtime.pdfOcr.errorKind = "";
      runtime.pdfOcr.needsPrompt = false;
      runtime.pdfOcr.state = details.state || "ready";
    } else if (resolvedStatus === "weak_text") {
      runtime.pdfOcr.progress = 0;
      runtime.pdfOcr.errorKind = details.errorKind || "ocr-low-text";
      runtime.pdfOcr.lastError = details.errorMessage || PDF_OCR_UNREADABLE_MESSAGE;
      runtime.pdfOcr.state = details.state || "ocr-unreadable";
    } else if (resolvedStatus === "cancelled") {
      runtime.pdfOcr.progress = 0;
      runtime.pdfOcr.errorKind = "ocr-cancelled";
      runtime.pdfOcr.lastError = details.errorMessage || "OCR cancelled. You can run Fast OCR again when ready.";
      runtime.pdfOcr.state = "ocr-cancelled";
      runtime.pdfOcr.lastCancelledAt = Date.now();
    } else if (resolvedStatus === "timeout") {
      runtime.pdfOcr.progress = 0;
      runtime.pdfOcr.errorKind = "ocr-timeout";
      runtime.pdfOcr.lastError = details.errorMessage || PDF_OCR_TIMEOUT_MESSAGE;
      runtime.pdfOcr.state = "ocr-failed";
      runtime.pdfOcr.betterAvailableForRoute = details.routeKey || getRouteCacheKey();
    } else {
      runtime.pdfOcr.progress = 0;
      runtime.pdfOcr.errorKind = details.errorKind || runtime.pdfOcr.errorKind || "ocr";
      runtime.pdfOcr.lastError = details.errorMessage || runtime.pdfOcr.lastError || publicPdfErrorMessage(runtime.pdfOcr.errorKind, true);
      runtime.pdfOcr.state = details.state || (/^(blank_canvas|ocr_error|parser_error)$/i.test(resolvedStatus) ? "ocr-failed" : "ocr-unreadable");
    }

    const diagnostic = {
      event: "pdf:ocr:final-diagnostic",
      ...buildPdfOcrFinalDiagnostic({
        ...details,
        finalStatus: resolvedStatus,
        ocrRunId,
        elapsedMs,
        cancelled,
        timedOut,
        workerTerminated
      })
    };
    runtime.pdfOcr.finalDiagnostic = diagnostic;
    emitDebug("pdf:ocr:final-diagnostic", diagnostic);
    if (hasReadyOcrModel) {
      saveReadyPdfOcrState("finishOcrRun", {
        ...details,
        model: readyOcrModel,
        finalStatus: resolvedStatus
      });
    }
    render();
    return diagnostic;
  }

  async function copyLatestPdfOcrDebugInfo() {
    const diagnostic = runtime.pdfOcr && runtime.pdfOcr.finalDiagnostic;
    if (!diagnostic) {
      emitDebug("pdf:ocr:debug-copy-unavailable", {
        exactIssue: "No finalized OCR diagnostic is available to copy yet."
      });
      return false;
    }
    const payload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      url: getCurrentUrl(),
      ...diagnostic
    }, null, 2);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(payload);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = payload;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      emitDebug("pdf:ocr:debug-copied", {
        bytes: payload.length,
        finalStatus: diagnostic.finalStatus || "",
        bestVariantName: diagnostic.bestVariantName || ""
      });
      return true;
    } catch (error) {
      emitDebug("pdf:ocr:debug-copy-error", {
        error: String(error && error.message ? error.message : error),
        finalStatus: diagnostic.finalStatus || ""
      });
      return false;
    }
  }

  function isPdfCacheEntryUsable(entry) {
    if (!entry) return false;
    const text = String(entry.text || "").trim();
    const words = Number(entry.words) || countPdfWords(text);
    if (entry.source === "ocr" && !isPdfOcrStructurallyCompleteForCache(entry)) return false;
    if (words >= PDF_RECOVERY_MIN_WORDS) return true;
    return Boolean(entry.source === "ocr" && isCacheableShortOcrText(text, entry.pages));
  }

  function isLocalFileUrl(url) {
    return /^file:\/\//i.test(String(url || ""));
  }

  function getPdfErrorKind(error, allowOcr) {
    const text = String(error && error.message ? error.message : error || "");
    if (allowOcr && /\b(worker creation timed out|worker failed|worker could not start|failed to construct.*worker|script error|importscripts|failed to load tesseractcore|tesseract worker)\b/i.test(text)) {
      return "ocr-worker";
    }
    if (allowOcr && /\b(ocr|tesseract|capture visible tab|capture|textdetector)\b/i.test(text)) {
      return "ocr";
    }
    if (/\b(password|encrypted|protected|invalid password|no password)\b/i.test(text)) {
      return "protected";
    }
    if (/\b(too large|exceeds|maximum|over size|oversized)\b/i.test(text)) {
      return "too-large";
    }
    if (/\b(unsupported pdf url|unsupported url|unsupported protocol)\b/i.test(text)) {
      return "unsupported";
    }
    if (/\b(unexpected server response\s*\(0\)|local pdf file|local file|file access|unable to read bytes from this local PDF file)\b/i.test(text)) {
      return "local-file";
    }
    if (/\b(fetch failed|failed to fetch|pdf byte fetch failed|unable to read|missing host permission|not allowed|network)\b/i.test(text)) {
      return "fetch";
    }
    return allowOcr ? "ocr" : "";
  }

  function publicPdfErrorMessage(errorKind, allowOcr) {
    if (errorKind === "protected") {
      return "This PDF is protected, so SkimRoute cannot read it.";
    }
    if (errorKind === "too-large") {
      return "This PDF is too large for SkimRoute to read locally.";
    }
    if (errorKind === "unsupported") {
      return "SkimRoute cannot read this kind of PDF URL.";
    }
    if (errorKind === "local-file") {
      if (runtime.pdfAccessAllowed === false) {
        return "Chrome says file access is disabled for SkimRoute. Enable file access for the extension, then refresh the PDF.";
      }
      return "SkimRoute could not read this local PDF yet. Enable file URL access if Chrome asks, then refresh the PDF.";
    }
    if (errorKind === "fetch") {
      return "SkimRoute could not read this PDF file yet. Refresh or reopen the PDF and SkimRoute will try again.";
    }
    if (errorKind === "ocr-timeout") {
      return PDF_OCR_TIMEOUT_MESSAGE;
    }
    if (errorKind === "ocr-cancelled") {
      return "OCR was cancelled. Run Fast OCR when you are ready.";
    }
    if (errorKind === "ocr-worker") {
      return PDF_OCR_WORKER_START_MESSAGE;
    }
    if (errorKind === "ocr-blank-canvas") {
      return "OCR rendered the PDF page, but the canvas appears blank or unreadable in this browser context.";
    }
    if (errorKind === "ocr-unavailable") {
      return "OCR could not start because the local OCR files are unavailable in this browser package.";
    }
    if (errorKind === "extract-timeout") {
      return "PDF text extraction is taking too long, so SkimRoute can try OCR if this PDF is image-based.";
    }
    if (errorKind === "ocr-low-text" || errorKind === "ocr-unreadable" || errorKind === "ocr" || allowOcr) {
      return PDF_OCR_UNREADABLE_MESSAGE;
    }
    return PDF_OCR_IMAGE_PROMPT_MESSAGE;
  }

  function getPdfTerminalPublicCopy(details = {}) {
    const errorKind = String(details.errorKind || "");
    const state = String(details.state || "");
    const rawError = String(details.error || "");
    const reason = rawError || publicPdfErrorMessage(errorKind, Boolean(details.allowOcr));
    if (isPdfAccessErrorKind(errorKind) || state === "fetch-error") {
      return {
        bestLabel: errorKind === "local-file" ? "File access needed" : "PDF access issue",
        bestTitle: errorKind === "local-file" ? "Enable file access" : "Cannot read this PDF",
        bestReason: reason,
        confidenceLabel: "PDF issue"
      };
    }
    if (state === "ocr-cancelled" || errorKind === "ocr-cancelled") {
      return {
        bestLabel: "OCR cancelled",
        bestTitle: "Image-based PDF detected",
        bestReason: rawError || "OCR was cancelled. Run Fast OCR when you are ready.",
        confidenceLabel: "Needs OCR"
      };
    }
    if (state === "ocr-failed" || errorKind === "ocr-timeout") {
      return {
        bestLabel: "OCR failed",
        bestTitle: errorKind === "ocr-worker" ? "OCR worker could not start" : "OCR could not finish",
        bestReason: reason,
        confidenceLabel: "OCR issue"
      };
    }
    if (details.ocrUnreadable || state === "ocr-unreadable" || errorKind === "ocr-low-text" || errorKind === "ocr-unreadable" || errorKind === "ocr") {
      return {
        bestLabel: "OCR finished",
        bestTitle: "Scan could not be read clearly",
        bestReason: reason || PDF_OCR_UNREADABLE_MESSAGE,
        confidenceLabel: "Scan unreadable"
      };
    }
    return {
      bestLabel: "Needs OCR",
      bestTitle: "Run OCR to map this PDF",
      bestReason: reason,
      confidenceLabel: "Needs OCR"
    };
  }

  function isPdfAccessErrorKind(errorKind) {
    return /^(fetch|local-file|protected|too-large|unsupported)$/i.test(String(errorKind || ""));
  }

  function isPdfOcrRuntimeErrorKind(errorKind) {
    return /^(ocr-worker|ocr-unavailable|ocr-timeout|ocr-cancelled|ocr-blank-canvas)$/i.test(String(errorKind || ""));
  }

  async function readPdfResponseBuffer(response, url, maxBytes) {
    const localFileStatusZero = isLocalFileUrl(url) && response && response.status === 0;
    if (!response || (!response.ok && !localFileStatusZero)) {
      throw new Error(`Fetch failed with status ${response ? response.status : "unknown"}.`);
    }
    const contentLength = Number(response.headers && response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && maxBytes && contentLength > maxBytes) {
      throw new Error(`PDF is too large for local recovery (${Math.round(contentLength / 1024 / 1024)} MB).`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer || !buffer.byteLength) {
      throw new Error(localFileStatusZero ? "Unable to read bytes from this local PDF file." : "PDF byte response was empty.");
    }
    if (maxBytes && buffer.byteLength > maxBytes) {
      throw new Error(`PDF is too large for local recovery (${Math.round(buffer.byteLength / 1024 / 1024)} MB).`);
    }
    return buffer;
  }

  function normalizePdfRecoveryPages(pages) {
    if (!Array.isArray(pages)) return [];
    return pages
      .map((page, index) => {
        const source = page && page.source || "";
        const initialText = String(page && page.text ? page.text : "")
          .replace(/[^\S\n]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        const lines = normalizePdfRecoveryLines(page && page.lines);
        const reconstructed = isPdfOcrSourceType(source) && lines.length
          ? reconstructPdfOcrTextFromLines(lines, { fallbackText: initialText })
          : null;
        const text = reconstructed && reconstructed.text ? reconstructed.text : initialText;
        if (!text) return null;
        return {
          pageNumber: Number(page && page.pageNumber) || index + 1,
          text,
          rawText: String(page && page.rawText || reconstructed && reconstructed.rawText || initialText).slice(0, 60000),
          reconstructedText: String(page && page.reconstructedText || reconstructed && reconstructed.reconstructedText || (isPdfOcrSourceType(source) ? text : "")).slice(0, 60000),
          words: Number(page && page.words) || countPdfWords(text),
          lines,
          source,
          recognitionVariant: String(page && (page.recognitionVariant || page.ocrVariantName) || "").slice(0, 80),
          confidence: Number.isFinite(Number(page && page.confidence)) ? Math.round(Number(page.confidence)) : averageLineConfidence(lines),
          ocrTextQuality: page && page.ocrTextQuality && typeof page.ocrTextQuality === "object"
            ? { ...page.ocrTextQuality }
            : reconstructed && reconstructed.stats || null
        };
      })
      .filter(Boolean);
  }

  function getPdfSourceUrl() {
    if (isPdfRouteLocked() || isPdfLikePage()) {
      return getPdfDocumentRouteKey();
    }
    return runtime.currentUrl || getCurrentUrl();
  }

  function clearStalePdfErrorIfReady(model) {
    const shortOcrReady = Array.isArray(model && model.sections) && model.sections.some((section) => section && section.unitMeta && section.unitMeta.ocr && isCacheableShortOcrText(section.text || ""));
    if (
      !model
      || !model.pageProfile
      || model.pageProfile.type !== "pdf"
      || runtime.pdfOcr.pending
      || (Number(model.totalReadableWords || 0) < PDF_RECOVERY_MIN_WORDS && !shortOcrReady)
      || !Array.isArray(model.sections)
      || model.sections.length < 1
    ) {
      return;
    }
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.needsPrompt = false;
    if (!runtime.pdfOcr.state || /^(needs-ocr|ocr-failed|fetch-error|idle)$/i.test(runtime.pdfOcr.state)) {
      runtime.pdfOcr.state = "ready";
    }
  }

  function getTesseractOptions(logger, overrides = {}) {
    return {
      workerPath: chrome.runtime.getURL("node_modules/tesseract.js/dist/worker.min.js"),
      // Use an explicit core .wasm.js file first. Directory-only corePath can silently fail
      // in some MV3/content-script contexts because the worker cannot resolve the right file.
      corePath: chrome.runtime.getURL("node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js"),
      langPath: chrome.runtime.getURL("node_modules/@tesseract.js-data/eng/4.0.0_best_int"),
      gzip: true,
      cacheMethod: "none",
      workerBlobURL: true,
      logger,
      ...overrides
    };
  }

  function getTesseractRuntimeContext(options = {}) {
    return {
      ocrRunId: getActivePdfOcrRunId(),
      workerPath: options.workerPath || "",
      corePath: options.corePath || "",
      langPath: options.langPath || "",
      workerBlobURL: Boolean(options.workerBlobURL),
      extensionUrl: getRuntimeResourceUrl(""),
      currentUrl: String(window.location && window.location.href || "")
    };
  }

  function getErrorLogDetails(error) {
    const message = String(error && error.message ? error.message : error || "");
    const name = String(error && error.name ? error.name : "");
    const stack = String(error && error.stack ? error.stack : "");
    return {
      error: message,
      errorName: name,
      errorMessage: message,
      errorStack: stack,
      "error.name": name,
      "error.message": message,
      "error.stack": stack
    };
  }

  function getOcrRecognitionStats(result, fallbackConfidence = 0) {
    const rawText = String(result && result.rawText !== undefined ? result.rawText : result && result.text !== undefined ? result.text : result || "");
    const confidence = Number.isFinite(Number(result && result.confidence))
      ? Math.round(Number(result.confidence))
      : Number.isFinite(Number(fallbackConfidence))
        ? Math.round(Number(fallbackConfidence))
        : 0;
    return {
      rawTextLength: rawText.length,
      wordCount: countPdfWords(rawText),
      confidence,
      firstTextSample: rawText.slice(0, 240)
    };
  }

  function markPdfOcrWorkerError(error, fallbackMessage) {
    const workerError = error instanceof Error
      ? error
      : new Error(String(error || fallbackMessage || PDF_OCR_WORKER_START_MESSAGE));
    workerError.pdfErrorKind = "ocr-worker";
    if (!workerError.message) {
      workerError.message = fallbackMessage || PDF_OCR_WORKER_START_MESSAGE;
    }
    return workerError;
  }

  async function verifyTesseractLanguageAsset() {
    if (window.__PAGEPILOT_TESSERACT_LANG_CHECK__) {
      return window.__PAGEPILOT_TESSERACT_LANG_CHECK__;
    }

    const trainedDataPath = "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";
    const langPath = getRuntimeResourceUrl("node_modules/@tesseract.js-data/eng/4.0.0_best_int");
    const trainedDataUrl = getRuntimeResourceUrl(trainedDataPath);
    window.__PAGEPILOT_TESSERACT_LANG_CHECK__ = (async () => {
      const result = {
        trainedDataPath,
        trainedDataUrl,
        langPath,
        ok: false,
        status: null,
        bytes: 0,
        exactIssue: ""
      };
      if (!trainedDataUrl) {
        result.exactIssue = "The packaged Tesseract English traineddata URL could not be resolved from this extension context.";
        emitDebug("pdf:ocr:tesseract:lang-check", result);
        const error = new Error(result.exactIssue);
        error.pdfErrorKind = "ocr-unavailable";
        throw error;
      }
      try {
        const response = await fetch(trainedDataUrl, { cache: "no-store" });
        result.status = response && Number.isFinite(response.status) ? response.status : null;
        const buffer = await response.arrayBuffer();
        result.bytes = buffer && buffer.byteLength || 0;
        result.ok = Boolean((response.ok || result.status === 0) && result.bytes > 0);
        result.exactIssue = result.ok
          ? "Tesseract English traineddata is packaged and fetchable from the expected MV3 web-accessible resource path."
          : "Tesseract English traineddata resolved, but did not return readable bytes.";
        emitDebug("pdf:ocr:tesseract:lang-check", result);
        if (!result.ok) {
          const error = new Error(result.exactIssue);
          error.pdfErrorKind = "ocr-unavailable";
          throw error;
        }
        return result;
      } catch (error) {
        if (error && error.pdfErrorKind) {
          throw error;
        }
        const message = String(error && error.message ? error.message : error);
        emitDebug("pdf:ocr:tesseract:lang-check:error", {
          ...result,
          ...getErrorLogDetails(error),
          exactIssue: "The packaged Tesseract English traineddata file could not be fetched before OCR worker startup."
        });
        const wrapped = new Error(message || "Tesseract English traineddata could not be fetched.");
        wrapped.pdfErrorKind = "ocr-unavailable";
        throw wrapped;
      }
    })().catch((error) => {
      window.__PAGEPILOT_TESSERACT_LANG_CHECK__ = null;
      throw error;
    });

    return window.__PAGEPILOT_TESSERACT_LANG_CHECK__;
  }

  async function loadPdfJsModule() {
    if (window.__PAGEPILOT_PDFJS_MODULE__) {
      return window.__PAGEPILOT_PDFJS_MODULE__;
    }

    if (!window.__PAGEPILOT_PDFJS_PROMISE__) {
      const moduleUrl = chrome.runtime.getURL("node_modules/pdfjs-dist/build/pdf.min.mjs");
      const workerUrl = chrome.runtime.getURL("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
      window.__PAGEPILOT_PDFJS_PROMISE__ = import(moduleUrl)
        .then((module) => {
          if (module && module.GlobalWorkerOptions) {
            module.GlobalWorkerOptions.workerSrc = workerUrl;
            if ("workerPort" in module.GlobalWorkerOptions) {
              module.GlobalWorkerOptions.workerPort = null;
            }
            emitDebug("pdf:worker:configured", { workerUrl });
          }
          window.__PAGEPILOT_PDFJS_MODULE__ = module;
          return module;
        })
        .catch((error) => {
          window.__PAGEPILOT_PDFJS_PROMISE__ = null;
          throw error;
        });
    }

    return window.__PAGEPILOT_PDFJS_PROMISE__;
  }

  async function fetchArrayBufferWithTimeout(url, timeoutMs, maxBytes) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = window.setTimeout(() => {
      if (controller) controller.abort();
    }, Math.max(1000, timeoutMs || 0));

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      const buffer = await readPdfResponseBuffer(response, url, maxBytes);
      emitDebug("pdf:fetch:content:success", {
        url,
        status: response && Number.isFinite(response.status) ? response.status : null,
        bytes: buffer.byteLength || 0
      });
      return buffer;
    } catch (error) {
      emitDebug("pdf:fetch:content:error", {
        url,
        error: String(error && error.message ? error.message : error)
      });
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchPdfBytesFromBackground(url) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
          reject(new Error("Extension messaging is unavailable."));
          return;
        }
        chrome.runtime.sendMessage({
          type: "PAGEPILOT_FETCH_PDF_BYTES",
          url,
          maxBytes: PDF_MAX_BACKGROUND_BYTES
        }, (response) => {
          if (chrome.runtime.lastError) {
            emitDebug("pdf:fetch:background:error", {
              url,
              error: chrome.runtime.lastError.message || "PDF byte fetch failed."
            });
            reject(new Error(chrome.runtime.lastError.message || "PDF byte fetch failed."));
            return;
          }
          if (!response || !response.ok || !response.data) {
            emitDebug("pdf:fetch:background:error", {
              url,
              error: (response && response.error) || "PDF byte fetch failed."
            });
            reject(new Error((response && response.error) || "PDF byte fetch failed."));
            return;
          }
          const buffer = base64ToArrayBuffer(response.data);
          if (!buffer.byteLength) {
            reject(new Error("PDF byte fetch returned an empty response."));
            return;
          }
          emitDebug("pdf:fetch:background:success", {
            url,
            bytes: buffer.byteLength || 0
          });
          resolve(buffer);
        });
      } catch (error) {
        emitDebug("pdf:fetch:background:error", {
          url,
          error: String(error && error.message ? error.message : error)
        });
        reject(error);
      }
    });
  }

  async function requestPdfFileAccessStatus() {
    if (!isLocalFileUrl(getPdfDocumentRouteKey())) {
      runtime.pdfAccessAllowed = null;
      return null;
    }
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
          runtime.pdfAccessAllowed = null;
          resolve(null);
          return;
        }
        chrome.runtime.sendMessage({ type: "PAGEPILOT_FILE_ACCESS_STATUS" }, (response) => {
          const allowed = response && response.ok && typeof response.allowed === "boolean"
            ? response.allowed
            : null;
          runtime.pdfAccessAllowed = allowed;
          resolve(allowed);
          if (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf") {
            render();
          }
        });
      } catch (error) {
        runtime.pdfAccessAllowed = null;
        resolve(null);
      }
    });
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  async function loadTesseractModule() {
    if (window.__PAGEPILOT_TESSERACT_MODULE__) {
      return window.__PAGEPILOT_TESSERACT_MODULE__;
    }

    if (!window.__PAGEPILOT_TESSERACT_PROMISE__) {
      const moduleUrl = chrome.runtime.getURL("node_modules/tesseract.js/dist/tesseract.esm.min.js");
      emitDebug("pdf:ocr:tesseract:load-start", { moduleUrl });
      window.__PAGEPILOT_TESSERACT_PROMISE__ = Promise.race([
        import(moduleUrl),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("Tesseract module import timed out.")), 12000))
      ])
        .then((module) => {
          window.__PAGEPILOT_TESSERACT_MODULE__ = module;
          window.Tesseract = module && module.default ? module.default : module;
          emitDebug("pdf:ocr:tesseract:load-success", {
            hasDefault: Boolean(module && module.default),
            hasCreateWorker: Boolean((module && module.createWorker) || (module && module.default && module.default.createWorker)),
            hasRecognize: Boolean((module && module.recognize) || (module && module.default && module.default.recognize))
          });
          return module;
        })
        .catch((error) => {
          window.__PAGEPILOT_TESSERACT_PROMISE__ = null;
          emitDebug("pdf:ocr:tesseract:load-error", {
            moduleUrl,
            error: String(error && error.message ? error.message : error),
            exactIssue: "The Tesseract ESM file could not be imported from the packaged extension. Check web_accessible_resources and packaged node_modules/tesseract.js/dist."
          });
          throw error;
        });
    }

    return window.__PAGEPILOT_TESSERACT_PROMISE__;
  }

  function buildPdfTextLines(pageContent, page) {
    const items = pageContent && Array.isArray(pageContent.items) ? pageContent.items : [];
    let viewportHeight = 1;
    try {
      const viewport = page && page.getViewport ? page.getViewport({ scale: 1 }) : null;
      viewportHeight = Math.max(1, Number(viewport && viewport.height) || 1);
    } catch (error) {
      viewportHeight = 1;
    }

    const fragments = items
      .map((item) => {
        const text = String(item && item.str ? item.str : "").trim();
        if (!text) return null;
        const transform = item && Array.isArray(item.transform) ? item.transform : [];
        const x = Number(transform[4]) || 0;
        const y = Number(transform[5]) || 0;
        const height = Math.max(4, Math.abs(Number(item && item.height) || Number(transform[3]) || 0));
        const relativeY = Math.max(0, Math.min(1, 1 - (y / viewportHeight)));
        const relativeHeight = Math.max(0.006, Math.min(0.04, height / viewportHeight));
        return {
          text,
          x,
          y,
          relativeY,
          relativeYStart: Math.max(0, relativeY - relativeHeight),
          relativeYEnd: Math.min(1, relativeY + relativeHeight * 0.45),
          words: countPdfWords(text)
        };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(a.relativeY - b.relativeY) > 0.006
        ? a.relativeY - b.relativeY
        : a.x - b.x);

    const grouped = [];
    fragments.forEach((fragment) => {
      const current = grouped[grouped.length - 1];
      if (!current || Math.abs(current.relativeY - fragment.relativeY) > 0.008) {
        grouped.push({
          relativeY: fragment.relativeY,
          relativeYStart: fragment.relativeYStart,
          relativeYEnd: fragment.relativeYEnd,
          y: fragment.y,
          parts: [fragment.text],
          words: fragment.words
        });
        return;
      }
      current.parts.push(fragment.text);
      current.words += fragment.words;
      current.relativeY = (current.relativeY + fragment.relativeY) / 2;
      current.relativeYStart = Math.min(current.relativeYStart, fragment.relativeYStart);
      current.relativeYEnd = Math.max(current.relativeYEnd, fragment.relativeYEnd);
    });

    return grouped
      .map((group, index) => {
        const text = group.parts.join(" ").replace(/\s+/g, " ").trim();
        if (!text) return null;
        return {
          text,
          words: group.words || countPdfWords(text),
          relativeY: Math.max(0, Math.min(1, group.relativeY)),
          relativeYStart: Math.max(0, Math.min(1, group.relativeYStart)),
          relativeYEnd: Math.max(0, Math.min(1, group.relativeYEnd)),
          order: index
        };
      })
      .filter(Boolean);
  }

  async function extractPdfTextWithPdfJs(sourceUrl, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : PDF_TEXT_EXTRACTION_TIMEOUT_MS;
    const pageTimeoutMs = Number.isFinite(options.pageTimeoutMs) ? options.pageTimeoutMs : PDF_TEXT_PAGE_TIMEOUT_MS;
    const maxPages = Number.isFinite(options.maxPages) ? options.maxPages : PDF_MAX_TEXT_PAGES;
    const stopAfterReady = Boolean(options.stopAfterReady);
    const readyWords = Number.isFinite(options.readyWords) ? options.readyWords : PDF_FAST_READY_WORDS;
    const readyPages = Number.isFinite(options.readyPages) ? options.readyPages : PDF_FAST_READY_PAGES;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const startedAt = Date.now();
    const attemptId = Number(options.attemptId) || 0;
    const routeKey = options.routeKey || getPdfDocumentRouteKey();
    const cachedResource = getCachedPdfResource(routeKey);

    let data = cachedResource && cachedResource.bytes ? clonePdfBytes(cachedResource.bytes) : null;
    let pdf = cachedResource && cachedResource.pdfDocument || null;
    let fingerprint = cachedResource && cachedResource.fingerprint || null;
    let fetchError = null;
    if (!data && !pdf) {
      try {
        data = await fetchArrayBufferWithTimeout(sourceUrl, Math.min(timeoutMs, PDF_FETCH_TIMEOUT_MS), PDF_MAX_BYTES);
      } catch (error) {
        fetchError = error;
        try {
          data = await fetchPdfBytesFromBackground(sourceUrl);
        } catch (fallbackError) {
          fetchError = fallbackError || fetchError;
          data = null;
        }
      }
    }

    if (!data && !pdf && isLocalFileUrl(sourceUrl)) {
      const error = new Error(
        fetchError && fetchError.message
          ? fetchError.message
          : "Unable to read this local PDF file."
      );
      error.pdfErrorKind = "fetch";
      throw error;
    }

    fingerprint = normalizePdfFingerprint(fingerprint) || getPdfByteFingerprint(data);
    let timedOut = false;
    let task = null;

    try {
      if (!pdf) {
        const pdfjs = await loadPdfJsModule();
        const pdfOptions = {
          isEvalSupported: false,
          useWorkerFetch: false,
          stopAtErrors: false,
          disableFontFace: true,
          disableStream: true,
          disableAutoFetch: true,
          cMapUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/cmaps/"),
          cMapPacked: true,
          // Required for scanned PDFs that use JBIG2/OpenJPEG image streams.
          // Without wasmUrl, PDF.js can fetch the PDF bytes but render blank/undecodable pages,
          // which makes OCR return zero words.
          wasmUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/wasm/"),
          standardFontDataUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/standard_fonts/"),
          iccUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/iccs/"),
          useWasm: true
        };

        task = pdfjs.getDocument(
          data
            ? {
                ...pdfOptions,
                data: clonePdfBytes(data) || data
              }
            : {
                ...pdfOptions,
                url: sourceUrl
              }
        );
        const timeoutPromise = new Promise((_, reject) => {
          const timer = window.setTimeout(() => {
            timedOut = true;
            reject(new Error("PDF text extraction timed out."));
          }, timeoutMs);
          task.promise.finally(() => window.clearTimeout(timer)).catch(() => {});
        });
        pdf = await Promise.race([task.promise, timeoutPromise]);
      }
      rememberPdfResource(routeKey, {
        source: "pdfjs-text-extract",
        sourceUrl,
        bytes: data,
        fingerprint,
        pdfDocument: pdf,
        pageCount: Number(pdf && pdf.numPages || 0)
      });
      const pageLimit = Math.min(Number(pdf.numPages || 0), maxPages);
      const pages = [];
      let totalWords = 0;
      let pagesRead = 0;
      onProgress({ loaded: 0, total: pageLimit, percent: 6 });

      for (let pageIndex = 1; pageIndex <= pageLimit; pageIndex += 1) {
        if (attemptId) {
          assertPdfOcrNotCancelled(attemptId);
          await waitForPdfOcrIdle(`pdfjs-text:${pageIndex}`, attemptId, 8);
        }
        pagesRead = pageIndex;
        try {
          const page = await pdf.getPage(pageIndex);
          const pageContent = await Promise.race([
            page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false }),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error(`Page ${pageIndex} text extraction timed out.`)), pageTimeoutMs))
          ]);
          const lines = buildPdfTextLines(pageContent, page);
          const text = (lines.length
            ? lines.map((line) => line.text).join("\n")
            : pageContent.items
              .map((item) => String(item && item.str ? item.str : "").trim())
              .filter(Boolean)
              .join(" "))
            .replace(/[^\S\n]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          const pageWords = countPdfWords(text);
          emitDebug("pdf:page:extract", {
            pageNumber: pageIndex,
            textItems: pageContent && Array.isArray(pageContent.items) ? pageContent.items.length : 0,
            lines: lines.length,
            words: pageWords,
            sample: text.slice(0, 300)
          });
          if (text) {
            pages.push({ pageNumber: pageIndex, text, words: pageWords, lines });
            totalWords += pageWords;
          }
        } catch (pageError) {
          emitDebug("pdf:page:extract:error", {
            pageNumber: pageIndex,
            error: String(pageError && pageError.message ? pageError.message : pageError)
          });
        }
        onProgress({
          loaded: pageIndex,
          total: pageLimit,
          percent: Math.min(96, Math.max(6, Math.round((pageIndex / Math.max(1, pageLimit)) * 94)))
        });

        if (
          stopAfterReady
          && totalWords >= readyWords
          && (pages.length >= readyPages || pageIndex >= Math.min(pageLimit, readyPages * 2))
        ) {
          break;
        }
      }

      const text = pages.map((page) => page.text).join("\n\n").trim();
      const partial = Number(pdf.numPages || 0) > pagesRead;
      return {
        pages,
        text,
        numPages: Number(pdf.numPages || 0),
        pagesRead,
        words: totalWords,
        partial,
        durationMs: Date.now() - startedAt,
        source: "pdfjs",
        fingerprint
      };
    } finally {
      if (timedOut && pdf && typeof pdf.destroy === "function") {
        try {
          pdf.destroy();
        } catch (error) {
          // Ignore destroy issues.
        }
      }
    }
  }

  async function recognizeImageWithTesseract(dataUrl, recognitionContext = {}) {
    const module = await loadTesseractModule();
    await verifyTesseractLanguageAsset();
    const api = module && module.default ? module.default : module;
    const createWorker = api && typeof api.createWorker === "function" ? api.createWorker.bind(api) : null;
    const recognize = api && typeof api.recognize === "function" ? api.recognize.bind(api) : null;
    const ocrRunId = getActivePdfOcrRunId();
    assertActiveOcrRun(ocrRunId);
    const logger = (event) => {
      if (event && event.status) {
        if (!isActiveOcrRun(ocrRunId)) {
          return;
        }
        const now = Date.now();
        if (runtime.pdfOcr && runtime.pdfOcr.lastOcrProgressLogAt && now - runtime.pdfOcr.lastOcrProgressLogAt < 1500) {
          return;
        }
        if (runtime.pdfOcr) runtime.pdfOcr.lastOcrProgressLogAt = now;
        markPdfOcrStep(`tesseract:${event.status}`);
        emitDebug("pdf:ocr:progress", {
          ocrRunId,
          status: event.status,
          progress: Number.isFinite(event.progress) ? Math.round(event.progress * 100) : undefined
        });
      }
    };

    const coreCandidates = [
      // Prefer the plain LSTM core first. It is a little larger/slower than SIMD,
      // but it is more reliable in MV3 content-script/worker contexts.
      "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
      "node_modules/tesseract.js-core/tesseract-core.wasm.js",
      "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
      "node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js",
      "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
      "node_modules/tesseract.js-core/tesseract-core-simd.wasm.js",
      "node_modules/tesseract.js-core"
    ];
    const workerBlobModes = [true, false];

    async function recognizeWithCurrentWorker(worker, options) {
      assertPdfOcrWorkerReady(worker, ocrRunId);
      let result = null;
      try {
        markPdfOcrStep("tesseract-recognize:structured");
        assertPdfOcrWorkerReady(worker, ocrRunId);
        result = await racePdfOcrTimeout(
          worker.recognize(dataUrl, {}, { text: true, blocks: true, hocr: false, tsv: false }),
          { timeoutMs: getPdfOcrAttemptTimeoutMs(runtime.pdfOcr && runtime.pdfOcr.mode || "fast"), mode: runtime.pdfOcr && runtime.pdfOcr.mode || "", currentStep: "tesseract-recognize:structured" }
        );
      } catch (outputError) {
        if (isStalePdfOcrPostMessageError(outputError, ocrRunId)) {
          emitDebug("pdf:ocr:stale-worker-callback-ignored", {
            ocrRunId,
            ...getErrorLogDetails(outputError),
            phase: "structured-output",
            exactIssue: "A Tesseract callback tried to use a worker after this OCR run was cancelled, timed out, or replaced."
          });
          throw makePdfOcrCancelledError("Stale Tesseract worker callback ignored.");
        }
        if (isPdfOcrTimeoutError(outputError) || isPdfOcrCancellationError(outputError)) {
          throw outputError;
        }
        emitDebug("pdf:ocr:recognize:error", {
          ...getTesseractRuntimeContext(options),
          ...getErrorLogDetails(outputError),
          phase: "structured-output"
        });
        emitDebug("pdf:ocr:tesseract:recognize-output-fallback", {
          ...getTesseractRuntimeContext(options),
          ...getErrorLogDetails(outputError),
          note: "Structured OCR output failed, so SkimRoute is retrying with the default text output."
        });
        try {
          markPdfOcrStep("tesseract-recognize:default");
          assertPdfOcrWorkerReady(worker, ocrRunId);
          result = await racePdfOcrTimeout(
            worker.recognize(dataUrl),
            { timeoutMs: getPdfOcrAttemptTimeoutMs(runtime.pdfOcr && runtime.pdfOcr.mode || "fast"), mode: runtime.pdfOcr && runtime.pdfOcr.mode || "", currentStep: "tesseract-recognize:default" }
          );
        } catch (defaultOutputError) {
          if (isStalePdfOcrPostMessageError(defaultOutputError, ocrRunId)) {
            emitDebug("pdf:ocr:stale-worker-callback-ignored", {
              ocrRunId,
              ...getErrorLogDetails(defaultOutputError),
              phase: "default-output",
              exactIssue: "A Tesseract default-output callback arrived after this run no longer owned the worker."
            });
            throw makePdfOcrCancelledError("Stale Tesseract worker callback ignored.");
          }
          emitDebug("pdf:ocr:recognize:error", {
            ...getTesseractRuntimeContext(options),
            ...getErrorLogDetails(defaultOutputError),
            phase: "default-output"
          });
          throw defaultOutputError;
        }
      }
      assertActiveOcrRun(ocrRunId);
      const details = normalizeTesseractResult(result, { ...recognitionContext, source: "tesseract" });
      emitDebug("pdf:ocr:recognize:success", {
        ...getTesseractRuntimeContext(options),
        source: "tesseract",
        ...getOcrRecognitionStats(details, details.confidence)
      });
      emitDebug("pdf:ocr:tesseract:recognize-success", {
        ...getTesseractRuntimeContext(options),
        words: countPdfWords(details.text),
        confidence: details.confidence,
        lines: details.lines.length,
        sample: details.text.slice(0, 200)
      });
      return details;
    }

    if (createWorker) {
      const oem = api.OEM && api.OEM.LSTM_ONLY ? api.OEM.LSTM_ONLY : 1;
      let lastError = null;
      if (isPdfOcrWorkerActiveForRun(ocrRunId)) {
        const worker = runtime.pdfOcr.activeWorker;
        const options = runtime.pdfOcr.activeWorkerOptions || getTesseractOptions(logger);
        try {
          emitDebug("pdf:ocr:tesseract:worker-reuse", {
            ...getTesseractRuntimeContext(options),
            ocrRunId,
            exactIssue: "Reusing the active Tesseract worker for another OCR variant in the same run."
          });
          return await recognizeWithCurrentWorker(worker, options);
        } catch (error) {
          if (isPdfOcrCancellationError(error) || isPdfOcrTimeoutError(error)) {
            throw error;
          }
          lastError = error;
          terminateActivePdfOcrWorker("worker-reuse-error");
        }
      }
      for (const workerBlobURL of workerBlobModes) {
        for (const coreCandidate of coreCandidates) {
          const options = getTesseractOptions(logger, {
            corePath: chrome.runtime.getURL(coreCandidate),
            workerBlobURL
          });
          let worker = null;
          try {
            markPdfOcrStep(`worker-start:${coreCandidate}`);
            emitDebug("pdf:ocr:worker-config", getTesseractRuntimeContext(options));
            emitDebug("pdf:ocr:tesseract:worker-start", getTesseractRuntimeContext(options));
            worker = await Promise.race([
              createWorker("eng", oem, options),
              new Promise((_, reject) => window.setTimeout(() => reject(new Error("Tesseract worker creation timed out.")), 18000))
            ]);
            setActivePdfOcrWorker(worker, ocrRunId, options);
            assertPdfOcrWorkerReady(worker, ocrRunId);
            emitDebug("pdf:ocr:tesseract:worker-ready", getTesseractRuntimeContext(options));
            return await recognizeWithCurrentWorker(worker, options);
          } catch (error) {
            if (isPdfOcrCancellationError(error) || isPdfOcrTimeoutError(error)) {
              throw error;
            }
            if (isStalePdfOcrPostMessageError(error, ocrRunId)) {
              emitDebug("pdf:ocr:stale-worker-callback-ignored", {
                ocrRunId,
                ...getErrorLogDetails(error),
                phase: "worker-recognition",
                exactIssue: "A Tesseract worker error came from a stale or terminated OCR run and was ignored as cancellation."
              });
              throw makePdfOcrCancelledError("Stale Tesseract worker callback ignored.");
            }
            if (worker) {
              emitDebug("pdf:ocr:recognize:error", {
                ...getTesseractRuntimeContext(options),
                ...getErrorLogDetails(error),
                phase: "worker-recognition"
              });
            }
            lastError = markPdfOcrWorkerError(error, "Tesseract worker failed for a bundled core path.");
            emitDebug("pdf:ocr:tesseract:worker-error", {
              ...getTesseractRuntimeContext(options),
              ...getErrorLogDetails(error),
              exactIssue: "Tesseract loaded, but worker creation or recognition failed for this corePath/workerBlobURL combination. SkimRoute will try remaining bundled combinations, then the direct recognize() fallback."
            });
            if (worker && runtime.pdfOcr.activeWorker === worker) {
              terminateActivePdfOcrWorker("worker-config-failed");
            }
          }
        }
      }
      if (recognize) {
        try {
          emitDebug("pdf:ocr:tesseract:worker-direct-fallback-start", {
            error: String(lastError && lastError.message ? lastError.message : lastError || "unknown"),
            exactIssue: "Tesseract worker creation/recognition failed for bundled worker cores, so SkimRoute is trying the direct recognize() API before marking OCR failed."
          });
          for (const workerBlobURL of workerBlobModes) {
            const directOptions = getTesseractOptions(logger, {
              corePath: chrome.runtime.getURL("node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js"),
              workerBlobURL
            });
            try {
              emitDebug("pdf:ocr:worker-config", getTesseractRuntimeContext(directOptions));
              emitDebug("pdf:ocr:tesseract:worker-direct-fallback-attempt", getTesseractRuntimeContext(directOptions));
              markPdfOcrStep("tesseract-direct-fallback");
              assertActiveOcrRun(ocrRunId);
              const result = await racePdfOcrTimeout(
                recognize(dataUrl, "eng", directOptions),
                { timeoutMs: getPdfOcrAttemptTimeoutMs(runtime.pdfOcr && runtime.pdfOcr.mode || "fast"), mode: runtime.pdfOcr && runtime.pdfOcr.mode || "", currentStep: "tesseract-direct-fallback" }
              );
              const details = normalizeTesseractResult(result, { ...recognitionContext, source: "tesseract-direct-fallback" });
              emitDebug("pdf:ocr:recognize:success", {
                ...getTesseractRuntimeContext(directOptions),
                source: "tesseract-direct-fallback",
                ...getOcrRecognitionStats(details, details.confidence)
              });
              emitDebug("pdf:ocr:tesseract:worker-direct-fallback-success", {
                ...getTesseractRuntimeContext(directOptions),
                words: countPdfWords(details.text),
                confidence: details.confidence,
                lines: details.lines.length,
                sample: details.text.slice(0, 200)
              });
              return details;
            } catch (directAttemptError) {
              if (isPdfOcrCancellationError(directAttemptError) || isPdfOcrTimeoutError(directAttemptError)) {
                throw directAttemptError;
              }
              lastError = markPdfOcrWorkerError(directAttemptError, "Tesseract direct recognition failed.");
              emitDebug("pdf:ocr:recognize:error", {
                ...getTesseractRuntimeContext(directOptions),
                ...getErrorLogDetails(directAttemptError),
                phase: "direct-fallback"
              });
              emitDebug("pdf:ocr:tesseract:worker-direct-fallback-error", {
                ...getTesseractRuntimeContext(directOptions),
                ...getErrorLogDetails(directAttemptError),
                exactIssue: "Tesseract direct recognize() failed for this workerBlobURL setting."
              });
            }
          }
        } catch (directError) {
          if (isPdfOcrCancellationError(directError)) {
            throw directError;
          }
          emitDebug("pdf:ocr:tesseract:worker-direct-fallback-error", {
            ...getErrorLogDetails(directError),
            exactIssue: "Both Tesseract worker mode and direct recognize() failed. This is a bundled OCR runtime/core issue, not a PDF section-ranking issue."
          });
        }
      }
      throw markPdfOcrWorkerError(lastError, "Tesseract worker failed for every bundled core path.");
    }

    if (!recognize) {
      throw new Error("Tesseract recognition is unavailable after module import.");
    }

    const directOptions = getTesseractOptions(logger);
    emitDebug("pdf:ocr:worker-config", getTesseractRuntimeContext(directOptions));
    emitDebug("pdf:ocr:tesseract:recognize-direct-start", getTesseractRuntimeContext(directOptions));
    try {
      markPdfOcrStep("tesseract-direct");
      assertActiveOcrRun(ocrRunId);
      const result = await racePdfOcrTimeout(
        recognize(dataUrl, "eng", directOptions),
        { timeoutMs: getPdfOcrAttemptTimeoutMs(runtime.pdfOcr && runtime.pdfOcr.mode || "fast"), mode: runtime.pdfOcr && runtime.pdfOcr.mode || "", currentStep: "tesseract-direct" }
      );
      const details = normalizeTesseractResult(result, { ...recognitionContext, source: "tesseract-direct" });
      emitDebug("pdf:ocr:recognize:success", {
        ...getTesseractRuntimeContext(directOptions),
        source: "tesseract-direct",
        ...getOcrRecognitionStats(details, details.confidence)
      });
      emitDebug("pdf:ocr:tesseract:recognize-direct-success", {
        ...getTesseractRuntimeContext(directOptions),
        words: countPdfWords(details.text),
        confidence: details.confidence,
        lines: details.lines.length,
        sample: details.text.slice(0, 200)
      });
      return details;
    } catch (error) {
      if (isPdfOcrCancellationError(error) || isPdfOcrTimeoutError(error)) {
        throw error;
      }
      emitDebug("pdf:ocr:recognize:error", {
        ...getTesseractRuntimeContext(directOptions),
        ...getErrorLogDetails(error),
        phase: "direct"
      });
      throw error;
    }
  }

  async function extractTextFromImageDataUrl(dataUrl, recognitionContext = {}) {
    const Detector = window.TextDetector;
    if (typeof Detector === "function") {
      try {
        emitDebug("pdf:ocr:textdetector:start", {
          currentUrl: String(window.location && window.location.href || ""),
          dataUrlBytes: String(dataUrl || "").length,
          exactIssue: "Browser TextDetector is available, so SkimRoute is trying it before bundled Tesseract OCR."
        });
        const image = new Image();
        image.decoding = "async";
        image.src = dataUrl;
        if (typeof image.decode === "function") {
          await image.decode();
        } else {
          await new Promise((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
          });
        }

        const detector = new Detector();
        const results = await detector.detect(image);
        if (Array.isArray(results) && results.length) {
          const imageWidth = Math.max(1, image.naturalWidth || image.width || 1);
          const imageHeight = Math.max(1, image.naturalHeight || image.height || 1);
          const lines = results
            .map((item) => {
              const box = item && item.boundingBox ? item.boundingBox : null;
              const text = String(item.rawValue || item.text || "").trim();
              const y = box ? Number(box.y) || 0 : 0;
              const height = box ? Math.max(8, Number(box.height) || 0) : Math.max(12, imageHeight / Math.max(1, results.length));
              const rawBox = box ? { x0: Number(box.x) || 0, y0: y, x1: (Number(box.x) || 0) + (Number(box.width) || 0), y1: y + height, pageWidth: imageWidth, pageHeight: imageHeight } : null;
              const mappedBox = mapPdfOcrBBoxToFullPage(rawBox, recognitionContext, imageWidth, imageHeight);
              const pageHeight = Number(mappedBox && mappedBox.pageHeight || imageHeight);
              const relativeY = mappedBox && pageHeight > 0
                ? Math.max(0, Math.min(1, ((mappedBox.y0 + mappedBox.y1) / 2) / pageHeight))
                : Math.max(0, Math.min(1, (y + height * 0.5) / imageHeight));
              const sourceLineId = makePdfOcrSourceLineId({ ...recognitionContext, source: "textdetector" }, results.indexOf(item), text);
              return {
                text,
                x: box ? Number(box.x) || 0 : 0,
                y,
                words: countPdfWords(text),
                confidence: 82,
                bbox: mappedBox,
                pageWidth: mappedBox && mappedBox.pageWidth || imageWidth,
                pageHeight: mappedBox && mappedBox.pageHeight || imageHeight,
                wordBoxes: [],
                ocrGeometry: normalizePdfOcrGeometry({
                  bbox: mappedBox,
                  pageWidth: mappedBox && mappedBox.pageWidth || imageWidth,
                  pageHeight: mappedBox && mappedBox.pageHeight || imageHeight,
                  relativeY,
                  relativeYStart: mappedBox && pageHeight > 0 ? Math.max(0, Math.min(1, mappedBox.y0 / pageHeight)) : Math.max(0, Math.min(1, y / imageHeight)),
                  relativeYEnd: mappedBox && pageHeight > 0 ? Math.max(0, Math.min(1, mappedBox.y1 / pageHeight)) : Math.max(0, Math.min(1, (y + height) / imageHeight)),
                  exact: Boolean(box && recognitionContext.exactGeometry !== false),
                  ocrVariantName: recognitionContext.ocrVariantName || recognitionContext.recognitionVariant || "textdetector",
                  sourceLineIds: [sourceLineId],
                  sourceLineTextSample: text,
                  cropOffset: { x: Number(recognitionContext.cropOffsetX || 0) || 0, y: Number(recognitionContext.cropOffsetY || 0) || 0 },
                  renderScale: recognitionContext.renderScale,
                  rotation: recognitionContext.rotation
                }),
                relativeY,
                relativeYStart: mappedBox && pageHeight > 0 ? Math.max(0, Math.min(1, mappedBox.y0 / pageHeight)) : Math.max(0, Math.min(1, y / imageHeight)),
                relativeYEnd: mappedBox && pageHeight > 0 ? Math.max(0, Math.min(1, mappedBox.y1 / pageHeight)) : Math.max(0, Math.min(1, (y + height) / imageHeight)),
                ocrVariantName: recognitionContext.ocrVariantName || recognitionContext.recognitionVariant || "textdetector",
                sourceLineId,
                sourceLineIds: [sourceLineId],
                rawText: text,
                sourceBBox: rawBox,
                cropOffset: { x: Number(recognitionContext.cropOffsetX || 0) || 0, y: Number(recognitionContext.cropOffsetY || 0) || 0 },
                renderScale: Number(recognitionContext.renderScale || 0) || 0,
                rotation: Number(recognitionContext.rotation || 0) || 0
              };
            })
            .filter((item) => item.text)
            .sort((a, b) => (a.y - b.y) || (a.x - b.x));

          const grouped = [];
          const Y_TOLERANCE = Math.max(14, Math.round(imageHeight * 0.012));
          lines.forEach((line) => {
            const group = grouped[grouped.length - 1];
            if (!group || Math.abs(group.y - line.y) > Y_TOLERANCE) {
              grouped.push({ y: line.y, parts: [line], relativeY: line.relativeY });
            } else {
              group.parts.push(line);
              group.relativeY = (group.relativeY + line.relativeY) / 2;
            }
          });

          const normalizedLines = grouped.map((group, index) => {
            const text = group.parts.map((line) => line.text).join(" ").replace(/\s+/g, " ").trim();
            const starts = group.parts.map((line) => line.relativeYStart).filter((value) => Number.isFinite(value));
            const ends = group.parts.map((line) => line.relativeYEnd).filter((value) => Number.isFinite(value));
            const geometry = mergePdfOcrGeometries(group.parts);
            const sourceLineIds = Array.from(new Set(group.parts.flatMap((line) => line.sourceLineIds || [line.sourceLineId]).filter(Boolean))).slice(0, 24);
            return {
              text,
              words: countPdfWords(text),
              confidence: 82,
              relativeY: geometry && Number.isFinite(geometry.relativeY) ? geometry.relativeY : Math.max(0, Math.min(1, group.relativeY)),
              relativeYStart: geometry && Number.isFinite(geometry.relativeYStart) ? geometry.relativeYStart : starts.length ? Math.min(...starts) : Math.max(0, group.relativeY - 0.015),
              relativeYEnd: geometry && Number.isFinite(geometry.relativeYEnd) ? geometry.relativeYEnd : ends.length ? Math.max(...ends) : Math.min(1, group.relativeY + 0.04),
              bbox: geometry && geometry.bbox || null,
              pageWidth: geometry && geometry.pageWidth || 0,
              pageHeight: geometry && geometry.pageHeight || 0,
              wordBoxes: geometry && geometry.wordBoxes || [],
              ocrGeometry: geometry,
              ocrVariantName: recognitionContext.ocrVariantName || recognitionContext.recognitionVariant || "textdetector",
              sourceLineId: sourceLineIds[0] || makePdfOcrSourceLineId({ ...recognitionContext, source: "textdetector" }, index, text),
              sourceLineIds,
              rawText: text,
              cropOffset: geometry && geometry.cropOffset || group.parts.find((part) => part.cropOffset)?.cropOffset || null,
              renderScale: Number(geometry && geometry.renderScale || group.parts.find((part) => Number(part.renderScale) > 0)?.renderScale || 0),
              rotation: Number(geometry && geometry.rotation || group.parts.find((part) => Number.isFinite(Number(part.rotation)))?.rotation || 0),
              pageNumber: Number(recognitionContext.pageNumber) || 1,
              order: index
            };
          }).filter((line) => line.text);

          const text = normalizedLines.map((line) => line.text).join("\n").trim();
          if (text) {
            emitDebug("pdf:ocr:recognize:success", {
              source: "textdetector",
              rawTextLength: text.length,
              wordCount: countPdfWords(text),
              confidence: 82,
              firstTextSample: text.slice(0, 240)
            });
            emitDebug("pdf:ocr:textdetector:success", {
              words: countPdfWords(text),
              lines: normalizedLines.length,
              sample: text.slice(0, 200)
            });
            return {
              text,
              lines: normalizedLines,
              confidence: 82,
              source: "textdetector",
              warnings: []
            };
          }
        }
        emitDebug("pdf:ocr:textdetector:no-text", {
          exactIssue: "Browser TextDetector ran but did not return readable text. SkimRoute will fall back to bundled Tesseract OCR."
        });
      } catch (error) {
        emitDebug("pdf:ocr:recognize:error", {
          source: "textdetector",
          ...getErrorLogDetails(error),
          phase: "textdetector"
        });
        emitDebug("pdf:ocr:textdetector:error", {
          error: String(error && error.message ? error.message : error),
          exactIssue: "Browser TextDetector failed on the rendered PDF page. SkimRoute will fall back to bundled Tesseract OCR."
        });
      }
    }

    return recognizeImageWithTesseract(dataUrl, recognitionContext);
  }

  function normalizeTesseractResult(result, source) {
    const context = source && typeof source === "object" ? source : { source };
    const sourceName = String(context.source || source || "tesseract");
    const data = result && result.data ? result.data : {};
    const rawLines = getTesseractRawLines(data);
    const lineBoxes = rawLines.map((line) => line && (line.bbox || line.boundingBox)).filter(Boolean);
    const inferredPageWidth = Number(data.pageWidth || data.imageWidth || data.width || 0)
      || Math.max(0, ...lineBoxes.map((box) => Number(box.x1 || (Number(box.x || 0) + Number(box.width || 0)) || 0)).filter((value) => Number.isFinite(value)));
    const inferredPageHeight = Number(data.pageHeight || data.imageHeight || data.height || 0)
      || Math.max(0, ...lineBoxes.map((box) => Number(box.y1 || (Number(box.y || 0) + Number(box.height || 0)) || 0)).filter((value) => Number.isFinite(value)));
    const pageGeometryExact = Boolean(context.exactGeometry !== false && (Number(context.fullPageHeight || context.sourcePageHeight || 0) || Number(data.pageHeight || data.imageHeight || data.height || 0)));
    const lines = rawLines
      .map((line, index) => {
        const rawLineText = getTesseractLineText(line).replace(/\s+/g, " ").trim();
        const lineText = normalizePdfOcrLineTextSpacing(rawLineText);
        if (!lineText) return null;
        const box = line && (line.bbox || line.boundingBox) || {};
        const mappedBox = mapPdfOcrBBoxToFullPage(box, context, inferredPageWidth, inferredPageHeight);
        const pageHeight = Number(mappedBox && mappedBox.pageHeight || context.fullPageHeight || context.sourcePageHeight || inferredPageHeight || 0);
        const pageWidth = Number(mappedBox && mappedBox.pageWidth || context.fullPageWidth || context.sourcePageWidth || inferredPageWidth || 0);
        const y0 = Number(mappedBox && mappedBox.y0 || 0);
        const y1 = Number(mappedBox && mappedBox.y1 || y0);
        const relativeY = pageHeight > 0 ? Math.max(0, Math.min(1, ((y0 + y1) / 2) / pageHeight)) : null;
        const sourceLineId = makePdfOcrSourceLineId(context, index, lineText);
        const mappedWords = mapPdfOcrWordsToFullPage(line && line.words, context, inferredPageWidth, inferredPageHeight);
        const cropOffset = {
          x: Number(context.cropOffsetX || 0) || 0,
          y: Number(context.cropOffsetY || 0) || 0
        };
        const ocrGeometry = normalizePdfOcrGeometry({
          bbox: mappedBox,
          pageWidth,
          pageHeight,
          wordBoxes: mappedWords,
          relativeY,
          relativeYStart: pageHeight > 0 ? Math.max(0, Math.min(1, y0 / pageHeight)) : relativeY,
          relativeYEnd: pageHeight > 0 ? Math.max(0, Math.min(1, y1 / pageHeight)) : relativeY,
          approximate: !pageGeometryExact,
          ocrVariantName: context.ocrVariantName || context.recognitionVariant || "",
          sourceLineIds: [sourceLineId],
          sourceLineTextSample: lineText,
          cropOffset,
          renderScale: context.renderScale,
          rotation: context.rotation
        });
        return {
          text: lineText,
          words: countPdfWords(lineText),
          confidence: Number.isFinite(Number(line && line.confidence)) ? Math.round(Number(line.confidence)) : 0,
          relativeY,
          relativeYStart: pageHeight > 0 ? Math.max(0, Math.min(1, y0 / pageHeight)) : relativeY,
          relativeYEnd: pageHeight > 0 ? Math.max(0, Math.min(1, y1 / pageHeight)) : relativeY,
          bbox: ocrGeometry && ocrGeometry.bbox || null,
          pageWidth,
          pageHeight,
          wordBoxes: ocrGeometry && ocrGeometry.wordBoxes || [],
          ocrGeometry,
          ocrVariantName: String(context.ocrVariantName || context.recognitionVariant || "").slice(0, 80),
          sourceLineId,
          sourceLineIds: [sourceLineId],
          rawText: rawLineText || lineText,
          sourceBBox: normalizePdfOcrBBox(box, inferredPageWidth, inferredPageHeight),
          cropOffset,
          renderScale: Number(context.renderScale || 0) || 0,
          rotation: Number(context.rotation || 0) || 0,
          pageNumber: Number(context.pageNumber) || 1,
          order: index
        };
      })
      .filter(Boolean);
    const flattenedRawText = String(data.text || "").trim()
      || lines.map((line) => line.rawText || line.text).join("\n").trim()
      || getTesseractWordsText(data.words);
    const reconstructed = reconstructPdfOcrTextFromLines(lines, { fallbackText: flattenedRawText });
    const text = reconstructed.text || normalizePdfOcrLineTextSpacing(flattenedRawText);
    return {
      text,
      rawText: flattenedRawText,
      reconstructedText: text,
      lines: reconstructed.lines && reconstructed.lines.length ? reconstructed.lines : lines,
      confidence: Number.isFinite(Number(data.confidence)) ? Math.round(Number(data.confidence)) : averageLineConfidence(lines),
      source: sourceName,
      recognitionVariant: String(context.recognitionVariant || context.ocrVariantName || "").slice(0, 80),
      ocrVariantName: String(context.ocrVariantName || context.recognitionVariant || "").slice(0, 80),
      ocrTextQuality: reconstructed.stats || null,
      warnings: []
    };
  }

  function getTesseractRawLines(data) {
    if (Array.isArray(data && data.lines) && data.lines.length) {
      return data.lines;
    }
    if (Array.isArray(data && data.blocks) && data.blocks.length) {
      const lines = data.blocks.flatMap((block) => Array.isArray(block && block.paragraphs)
        ? block.paragraphs.flatMap((paragraph) => Array.isArray(paragraph && paragraph.lines) ? paragraph.lines : [])
        : Array.isArray(block && block.lines) ? block.lines : []);
      if (lines.length) return lines;
    }
    if (Array.isArray(data && data.paragraphs) && data.paragraphs.length) {
      const lines = data.paragraphs.flatMap((paragraph) => Array.isArray(paragraph && paragraph.lines) ? paragraph.lines : []);
      if (lines.length) return lines;
    }
    if (Array.isArray(data && data.words) && data.words.length) {
      return groupTesseractWordsIntoLines(data.words);
    }
    return [];
  }

  function getTesseractLineText(line) {
    const direct = String(line && (line.text || line.rawValue) || "").trim();
    if (direct) return direct;
    if (Array.isArray(line && line.words)) {
      return line.words.map((word) => String(word && (word.text || word.rawValue) || "").trim()).filter(Boolean).join(" ");
    }
    return "";
  }

  function getTesseractWordsText(words) {
    if (!Array.isArray(words)) return "";
    return words.map((word) => String(word && (word.text || word.rawValue) || "").trim()).filter(Boolean).join(" ").trim();
  }

  function groupTesseractWordsIntoLines(words) {
    const normalized = words
      .map((word, index) => {
        const text = String(word && (word.text || word.rawValue) || "").trim();
        if (!text) return null;
        const box = word && (word.bbox || word.boundingBox) || {};
        const y0 = Number(box.y0 || box.y || 0);
        const y1 = Number(box.y1 || (box.y + box.height) || y0);
        const x0 = Number(box.x0 || box.x || 0);
        const x1 = Number(box.x1 || (box.x + box.width) || x0);
        return { text, bbox: { x0, x1, y0, y1 }, confidence: Number(word && word.confidence) || 0, order: index };
      })
      .filter(Boolean)
      .sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2) || a.bbox.x0 - b.bbox.x0);
    const groups = [];
    normalized.forEach((word) => {
      const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
      const current = groups[groups.length - 1];
      const tolerance = Math.max(8, Math.abs(word.bbox.y1 - word.bbox.y0) * 0.7);
      if (!current || Math.abs(current.centerY - centerY) > tolerance) {
        groups.push({ centerY, words: [word] });
        return;
      }
      current.words.push(word);
      current.centerY = (current.centerY + centerY) / 2;
    });
    return groups.map((group, index) => {
      const sortedWords = group.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const confidenceValues = sortedWords.map((word) => Number(word.confidence)).filter((value) => Number.isFinite(value) && value > 0);
      return {
        text: sortedWords.map((word) => word.text).join(" "),
        bbox: {
          x0: Math.min(...sortedWords.map((word) => word.bbox.x0)),
          x1: Math.max(...sortedWords.map((word) => word.bbox.x1)),
          y0: Math.min(...sortedWords.map((word) => word.bbox.y0)),
          y1: Math.max(...sortedWords.map((word) => word.bbox.y1))
        },
        words: sortedWords,
        confidence: confidenceValues.length ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) : 0,
        order: index
      };
    });
  }

  function averageLineConfidence(lines) {
    const values = (lines || [])
      .map((line) => Number(line && line.confidence))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }


  function pdfOcrLinesFromText(text) {
    const rawLines = String(text || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const total = Math.max(1, rawLines.length);
    const lineSpan = Math.max(0.018, Math.min(0.075, 0.84 / total));
    return rawLines.map((line, index) => {
      const relativeY = Math.max(0.04, Math.min(0.96, (index + 0.5) / total));
      return {
        text: line,
        words: countPdfWords(line),
        relativeY,
        relativeYStart: Math.max(0.02, relativeY - lineSpan * 0.45),
        relativeYEnd: Math.min(0.98, relativeY + lineSpan * 0.7),
        order: index
      };
    });
  }

  async function fetchPdfBytesForRecovery(sourceUrl, timeoutMs) {
    let data = null;
    let fetchError = null;
    try {
      data = await fetchArrayBufferWithTimeout(sourceUrl, Math.min(timeoutMs || PDF_FETCH_TIMEOUT_MS, PDF_FETCH_TIMEOUT_MS), PDF_MAX_BYTES);
    } catch (error) {
      fetchError = error;
      try {
        data = await fetchPdfBytesFromBackground(sourceUrl);
      } catch (fallbackError) {
        fetchError = fallbackError || fetchError;
        data = null;
      }
    }
    if (!data) {
      const error = new Error(fetchError && fetchError.message ? fetchError.message : "Unable to read PDF bytes for OCR.");
      error.pdfErrorKind = "fetch";
      throw error;
    }
    return data;
  }

  function estimateCanvasInkForOcr(canvas, pageNumber) {
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      const width = Math.max(1, canvas.width || 1);
      const height = Math.max(1, canvas.height || 1);
      const sampleWidth = Math.min(width, 120);
      const sampleHeight = Math.min(height, 160);
      const stepX = Math.max(1, Math.floor(width / sampleWidth));
      const stepY = Math.max(1, Math.floor(height / sampleHeight));
      let checked = 0;
      let ink = 0;
      let darkPixels = 0;
      for (let y = 0; y < height; y += stepY) {
        for (let x = 0; x < width; x += stepX) {
          const pixel = context.getImageData(x, y, 1, 1).data;
          const gray = pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114;
          checked += 1;
          if (pixel[0] < 245 || pixel[1] < 245 || pixel[2] < 245) ink += 1;
          if (gray < 210) darkPixels += 1;
        }
      }
      const inkRatio = checked ? ink / checked : 0;
      const darkPixelRatio = checked ? darkPixels / checked : 0;
      const cropBox = getInkBoundsForOcr(canvas);
      const blankPageLikely = inkRatio < 0.002 || darkPixelRatio < 0.001;
      const result = {
        checked,
        ink,
        darkPixels,
        inkRatio: Math.round(inkRatio * 10000) / 10000,
        darkPixelRatio: Math.round(darkPixelRatio * 10000) / 10000,
        cropBox,
        likelyBlank: blankPageLikely,
        blankPageLikely
      };
      emitDebug("pdf:ocr:render:ink-check", {
        pageNumber,
        ...result,
        exactIssue: result.blankPageLikely
          ? "The rendered OCR canvas is almost blank. This usually means PDF.js could not decode the scanned page image, often because PDF.js wasm assets such as jbig2.wasm/openjpeg.wasm are missing or not web-accessible."
          : "Rendered OCR canvas contains visible non-white pixels."
      });
      return result;
    } catch (error) {
      emitDebug("pdf:ocr:render:ink-check:error", {
        pageNumber,
        error: String(error && error.message ? error.message : error)
      });
      return null;
    }
  }

  function canvasToOcrDataUrl(canvas) {
    try {
      return canvas.toDataURL("image/png");
    } catch (error) {
      emitDebug("pdf:ocr:canvas:dataurl:error", {
        error: String(error && error.message ? error.message : error)
      });
      throw error;
    }
  }

  function getPdfOcrDeviceProfile() {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const memory = Number(nav && nav.deviceMemory) || 0;
    const cores = Number(nav && nav.hardwareConcurrency) || 0;
    const lowMemory = memory > 0 && memory <= 4;
    const lowCore = cores > 0 && cores <= 2;
    const reduced = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const slow = lowMemory || lowCore;
    return {
      memoryGb: memory || null,
      cores: cores || null,
      slow,
      reduced,
      label: slow ? "low-end" : "standard"
    };
  }

  function getPdfOcrPlan(mode = "smart") {
    const device = getPdfOcrDeviceProfile();
    const forcedFast = mode === "fast" || (mode === "smart" && device.slow);
    const forcedBetter = mode === "better";
    if (forcedBetter) {
      return {
        mode: "better",
        device,
        maxPages: Math.min(PDF_OCR_MAX_PAGES, 4),
        renderScaleMultiplier: 1.18,
        pageTimeoutMs: Math.max(PDF_OCR_PAGE_TIMEOUT_MS, 5200),
        variantBudget: 5,
        allowVisibleCapture: true,
        message: PDF_OCR_BETTER_EXPECTATION_MESSAGE
      };
    }
    if (forcedFast) {
      return {
        mode: "fast",
        device,
        maxPages: 1,
        renderScaleMultiplier: 0.45,
        pageTimeoutMs: Math.min(PDF_OCR_PAGE_TIMEOUT_MS, 1700),
        variantBudget: 0,
        allowVisibleCapture: true,
        viewportFirst: true,
        message: PDF_OCR_FAST_EXPECTATION_MESSAGE
      };
    }
    return {
      mode: "smart",
      device,
      maxPages: Math.min(PDF_OCR_MAX_PAGES, 3),
      renderScaleMultiplier: 0.9,
      pageTimeoutMs: PDF_OCR_PAGE_TIMEOUT_MS,
      variantBudget: 3,
      allowVisibleCapture: true,
      message: PDF_OCR_RUNNING_MESSAGE
    };
  }

  function shouldRunBetterPdfOcrAfterFast(fastResult) {
    const device = getPdfOcrDeviceProfile();
    if (device.slow) return false;
    const words = Number(fastResult && fastResult.words) || countPdfWords(fastResult && fastResult.text || "");
    const qualityScore = Number(fastResult && fastResult.qualityScore) || 0;
    const structure = fastResult && fastResult.source === "ocr"
      ? getPdfOcrStructureCompleteness(fastResult)
      : null;
    const primaryCandidate = getPdfOcrResultPrimaryCandidate(fastResult);
    const textQuality = fastResult && fastResult.ocrTextQuality && typeof fastResult.ocrTextQuality === "object"
      ? fastResult.ocrTextQuality
      : evaluatePdfOcrTextQuality(primaryCandidate, structure);
    return words > 0 && (
      words < 90
      || qualityScore < 62
      || structure && !structure.complete
      || textQuality.corrupted
      || textQuality.missedRegionLikely
      || !textQuality.complete
    );
  }

  function getAdaptivePdfOcrRenderScale(page, options = {}) {
    try {
      const viewport = page && page.getViewport ? page.getViewport({ scale: 1 }) : null;
      const longEdge = Math.max(Number(viewport && viewport.width) || 0, Number(viewport && viewport.height) || 0);
      const multiplier = Number.isFinite(options.renderScaleMultiplier) ? options.renderScaleMultiplier : 1;
      if (!longEdge) return Math.max(0.55, PDF_OCR_RENDER_SCALE * multiplier);
      const targetLongEdge = 1250;
      const scale = Math.max(PDF_OCR_RENDER_SCALE, targetLongEdge / longEdge) * multiplier;
      return Math.max(0.55, Math.min(1.65, scale));
    } catch (error) {
      return Math.max(0.55, PDF_OCR_RENDER_SCALE * (Number.isFinite(options.renderScaleMultiplier) ? options.renderScaleMultiplier : 1));
    }
  }

  function getInkBoundsForOcr(canvas, threshold = 238) {
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      const width = Math.max(1, canvas.width || 1);
      const height = Math.max(1, canvas.height || 1);
      const data = context.getImageData(0, 0, width, height).data;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let ink = 0;
      const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 420000)));
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const index = (y * width + x) * 4;
          const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
          if (gray < threshold) {
            ink += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (!ink || minX >= maxX || minY >= maxY) return null;
      const padX = Math.round(width * 0.035);
      const padY = Math.round(height * 0.035);
      return {
        x: Math.max(0, minX - padX),
        y: Math.max(0, minY - padY),
        width: Math.min(width, maxX + padX) - Math.max(0, minX - padX),
        height: Math.min(height, maxY + padY) - Math.max(0, minY - padY),
        ink
      };
    } catch (error) {
      return null;
    }
  }

  function makeCanvasOcrVariant(canvas, pageNumber, mode) {
    try {
      const sourceContext = canvas.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) return null;
      const sourceWidth = Math.max(1, canvas.width || 1);
      const sourceHeight = Math.max(1, canvas.height || 1);
      const bounds = /crop/i.test(mode) ? getInkBoundsForOcr(canvas) : null;
      const sx = bounds ? bounds.x : 0;
      const sy = bounds ? bounds.y : 0;
      const sw = bounds ? Math.max(1, bounds.width) : sourceWidth;
      const sh = bounds ? Math.max(1, bounds.height) : sourceHeight;
      const output = document.createElement("canvas");
      const maxLongEdge = /fast|ultra/i.test(mode) ? 950 : 1650;
      const scale = Math.min(1.15, maxLongEdge / Math.max(sw, sh));
      output.width = Math.max(1, Math.round(sw * scale));
      output.height = Math.max(1, Math.round(sh * scale));
      const ctx = output.getContext("2d", { alpha: false, willReadFrequently: true });
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, output.width, output.height);
      const image = ctx.getImageData(0, 0, output.width, output.height);
      const data = image.data;
      let brightnessTotal = 0;
      let checked = 0;
      const step = Math.max(4, Math.floor(Math.sqrt((output.width * output.height) / 18000)));
      for (let y = 0; y < output.height; y += step) {
        for (let x = 0; x < output.width; x += step) {
          const index = (y * output.width + x) * 4;
          brightnessTotal += data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
          checked += 1;
        }
      }
      const averageBrightness = checked ? brightnessTotal / checked : 230;
      const useThreshold = /threshold|binary/i.test(mode);
      const useContrast = /contrast/i.test(mode);
      const invert = /invert/i.test(mode);
      const threshold = Math.max(118, Math.min(215, averageBrightness - 24));
      for (let index = 0; index < data.length; index += 4) {
        const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        let value = gray;
        if (useContrast) {
          value = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
        }
        if (useThreshold) {
          value = gray < threshold ? 0 : 255;
        }
        if (invert) value = 255 - value;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      const dataUrl = canvasToOcrDataUrl(output);
      emitDebug("pdf:ocr:variant-canvas:created", {
        pageNumber,
        mode,
        cropped: Boolean(bounds),
        width: output.width,
        height: output.height,
        bytes: dataUrl.length
      });
      return {
        dataUrl,
        bounds,
        width: output.width,
        height: output.height,
        mode,
        sourceWidth,
        sourceHeight,
        cropOffsetX: sx,
        cropOffsetY: sy,
        cropWidth: sw,
        cropHeight: sh,
        outputScaleX: output.width / Math.max(1, sw),
        outputScaleY: output.height / Math.max(1, sh),
        fullPageWidth: sourceWidth,
        fullPageHeight: sourceHeight
      };
    } catch (error) {
      emitDebug("pdf:ocr:variant-canvas:error", { pageNumber, mode, error: String(error && error.message ? error.message : error) });
      return null;
    }
  }

  function preprocessCanvasForOcr(canvas, pageNumber, inkCheck) {
    if (inkCheck && inkCheck.likelyBlank) {
      return null;
    }
    try {
      const sourceContext = canvas.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) return null;
      const width = Math.max(1, canvas.width || 1);
      const height = Math.max(1, canvas.height || 1);
      const image = sourceContext.getImageData(0, 0, width, height);
      const data = image.data;
      let darkPixels = 0;
      let checked = 0;
      let brightnessTotal = 0;
      const sampleStep = Math.max(4, Math.floor(Math.sqrt((width * height) / 18000)));
      for (let y = 0; y < height; y += sampleStep) {
        for (let x = 0; x < width; x += sampleStep) {
          const index = (y * width + x) * 4;
          const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
          brightnessTotal += gray;
          if (gray < 210) darkPixels += 1;
          checked += 1;
        }
      }
      const averageBrightness = checked ? brightnessTotal / checked : 255;
      const darkRatio = checked ? darkPixels / checked : 0;
      if (darkRatio < 0.0015) return null;
      const threshold = Math.max(132, Math.min(214, averageBrightness - (darkRatio < 0.05 ? 28 : 18)));
      for (let index = 0; index < data.length; index += 4) {
        const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.42 + 128));
        const value = contrasted < threshold ? 0 : 255;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      }
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const outputContext = output.getContext("2d", { alpha: false });
      if (!outputContext) return null;
      outputContext.putImageData(image, 0, 0);
      const dataUrl = canvasToOcrDataUrl(output);
      emitDebug("pdf:ocr:preprocess:success", {
        pageNumber,
        width,
        height,
        darkRatio: Math.round(darkRatio * 10000) / 10000,
        averageBrightness: Math.round(averageBrightness),
        threshold: Math.round(threshold),
        dataUrlBytes: dataUrl.length
      });
      return {
        dataUrl,
        darkRatio: Math.round(darkRatio * 10000) / 10000,
        averageBrightness: Math.round(averageBrightness),
        threshold: Math.round(threshold),
        width,
        height,
        bounds: null,
        sourceWidth: width,
        sourceHeight: height,
        cropOffsetX: 0,
        cropOffsetY: 0,
        cropWidth: width,
        cropHeight: height,
        outputScaleX: 1,
        outputScaleY: 1,
        fullPageWidth: width,
        fullPageHeight: height
      };
    } catch (error) {
      emitDebug("pdf:ocr:preprocess:error", {
        pageNumber,
        error: String(error && error.message ? error.message : error)
      });
      return null;
    }
  }

  async function renderPdfPageToOcrDataUrl(page, pageNumber, options = {}) {
    const attemptId = Number(options.attemptId) || runtime.pdfOcr && runtime.pdfOcr.activeAttemptId || 0;
    assertPdfOcrNotCancelled(attemptId);
    await waitForPdfOcrIdle(`render:${pageNumber}:start`, attemptId, 12);
    const scaleMultiplier = Number.isFinite(Number(options.scaleMultiplier)) ? Math.max(0.45, Math.min(1.25, Number(options.scaleMultiplier))) : 1;
    const planScaleMultiplier = Number.isFinite(options.renderScaleMultiplier) ? options.renderScaleMultiplier : 1;
    const renderScale = getAdaptivePdfOcrRenderScale(page, { renderScaleMultiplier: planScaleMultiplier }) * scaleMultiplier;
    const viewport = page.getViewport({ scale: renderScale });
    const maxPixels = 3600 * 3600;
    const rawPixels = Math.max(1, Math.round((viewport.width || 1) * (viewport.height || 1)));
    const scaleDown = rawPixels > maxPixels ? Math.sqrt(maxPixels / rawPixels) : 1;
    const finalScale = renderScale * scaleDown;
    const finalViewport = scaleDown < 1 ? page.getViewport({ scale: finalScale }) : viewport;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) {
      throw new Error("Canvas 2D context is unavailable for PDF OCR rendering.");
    }
    canvas.width = Math.max(1, Math.floor(finalViewport.width));
    canvas.height = Math.max(1, Math.floor(finalViewport.height));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    emitDebug("pdf:ocr:render:start", {
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      scale: Math.round(finalScale * 100) / 100,
      targetScale: Math.round(renderScale * 100) / 100,
      scaleDown: Math.round(scaleDown * 100) / 100
    });
    const renderTask = page.render({ canvasContext: context, viewport: finalViewport });
    if (runtime.pdfOcr) runtime.pdfOcr.activeRenderTask = renderTask;
    try {
      await Promise.race([
        renderTask.promise,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error(`Page ${pageNumber} OCR render timed out.`)), Number.isFinite(options.pageTimeoutMs) ? options.pageTimeoutMs : PDF_OCR_PAGE_TIMEOUT_MS))
      ]);
    } finally {
      if (runtime.pdfOcr && runtime.pdfOcr.activeRenderTask === renderTask) {
        runtime.pdfOcr.activeRenderTask = null;
      }
    }
    assertPdfOcrNotCancelled(attemptId);
    await waitForPdfOcrIdle(`render:${pageNumber}:after-pdfjs`, attemptId, 14);
    const inkCheck = estimateCanvasInkForOcr(canvas, pageNumber);
    const canvasStats = {
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      inkRatio: inkCheck && inkCheck.inkRatio,
      darkPixelRatio: inkCheck && inkCheck.darkPixelRatio,
      blankPageLikely: Boolean(inkCheck && inkCheck.blankPageLikely),
      cropBox: inkCheck && inkCheck.cropBox || null,
      renderScale: Math.round(finalScale * 100) / 100,
      sourceCanvas: "pdfjs-page-render",
      actualPdfPage: true,
      viewerUiLikely: false
    };
    emitDebug("pdf:ocr:canvas-stats", {
      ...canvasStats
    });
    const rawDataUrl = canvasToOcrDataUrl(canvas);
    await waitForPdfOcrIdle(`render:${pageNumber}:before-preprocess`, attemptId, 14);
    const preprocessed = options.skipPreprocess ? null : preprocessCanvasForOcr(canvas, pageNumber, inkCheck);
    assertPdfOcrNotCancelled(attemptId);
    await waitForPdfOcrIdle(`render:${pageNumber}:before-variants`, attemptId, 14);
    const dataUrl = preprocessed && preprocessed.dataUrl ? preprocessed.dataUrl : rawDataUrl;
    emitDebug("pdf:ocr:render:success", {
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      dataUrlBytes: dataUrl.length,
      inkRatio: inkCheck && inkCheck.inkRatio,
      likelyBlank: Boolean(inkCheck && inkCheck.likelyBlank),
      preprocessed: Boolean(preprocessed),
      scale: Math.round(finalScale * 100) / 100
    });
    const grayscale = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "grayscale");
    await waitForPdfOcrIdle(`render:${pageNumber}:variant-grayscale`, attemptId, 8);
    const contrast = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "contrast");
    await waitForPdfOcrIdle(`render:${pageNumber}:variant-contrast`, attemptId, 8);
    const threshold = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "threshold");
    await waitForPdfOcrIdle(`render:${pageNumber}:variant-threshold`, attemptId, 8);
    const inverted = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "inverted");
    await waitForPdfOcrIdle(`render:${pageNumber}:variant-invert`, attemptId, 8);
    const cropThreshold = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "crop-threshold");
    await waitForPdfOcrIdle(`render:${pageNumber}:variant-1`, attemptId, 8);
    const cropContrast = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "crop-contrast");
    await waitForPdfOcrIdle(`render:${pageNumber}:variant-2`, attemptId, 8);
    const cropInvert = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "crop-invert-threshold");
    await waitForPdfOcrIdle(`render:${pageNumber}:variant-3`, attemptId, 8);
    const fastCrop = options.skipPreprocess ? null : makeCanvasOcrVariant(canvas, pageNumber, "fast-crop-threshold");
    return {
      dataUrl,
      rawDataUrl,
      inkCheck,
      canvasStats,
      preprocessed,
      grayscale,
      contrast,
      threshold,
      inverted,
      cropThreshold,
      cropContrast,
      cropInvert,
      fastCrop,
      scale: finalScale,
      width: canvas.width,
      height: canvas.height
    };
  }

  function buildPdfOcrRecognitionContext(variant = {}, pageNumber = 1, recognitionVariant = "") {
    const rendered = variant.rendered || {};
    const canvasStats = rendered.canvasStats || {};
    const cropBox = variant.cropBox || variant.bounds || variant.cropBox || null;
    const sourcePageWidth = Number(variant.fullPageWidth || variant.sourceWidth || rendered.width || canvasStats.width || variant.canvasWidth || variant.width || 0);
    const sourcePageHeight = Number(variant.fullPageHeight || variant.sourceHeight || rendered.height || canvasStats.height || variant.canvasHeight || variant.height || 0);
    const cropOffsetX = Number(variant.cropOffsetX ?? (cropBox && (cropBox.x ?? cropBox.left)) ?? 0) || 0;
    const cropOffsetY = Number(variant.cropOffsetY ?? (cropBox && (cropBox.y ?? cropBox.top)) ?? 0) || 0;
    const cropWidth = Number(variant.cropWidth || (cropBox && cropBox.width) || sourcePageWidth || variant.canvasWidth || variant.width || 0);
    const cropHeight = Number(variant.cropHeight || (cropBox && cropBox.height) || sourcePageHeight || variant.canvasHeight || variant.height || 0);
    const canvasWidth = Number(variant.canvasWidth || variant.width || 0) || cropWidth || sourcePageWidth;
    const canvasHeight = Number(variant.canvasHeight || variant.height || 0) || cropHeight || sourcePageHeight;
    return {
      pageNumber: Number(pageNumber) || 1,
      recognitionVariant: String(recognitionVariant || variant.label || variant.mode || "ocr"),
      ocrVariantName: String(recognitionVariant || variant.label || variant.mode || "ocr"),
      canvasWidth,
      canvasHeight,
      sourcePageWidth,
      sourcePageHeight,
      fullPageWidth: sourcePageWidth,
      fullPageHeight: sourcePageHeight,
      cropBox,
      cropOffsetX,
      cropOffsetY,
      cropWidth,
      cropHeight,
      outputScaleX: Number(variant.outputScaleX) || (canvasWidth && cropWidth ? canvasWidth / Math.max(1, cropWidth) : 1),
      outputScaleY: Number(variant.outputScaleY) || (canvasHeight && cropHeight ? canvasHeight / Math.max(1, cropHeight) : 1),
      renderScale: Number(rendered.scale || canvasStats.renderScale || 0) || 0,
      rotation: Number(rendered.rotation || canvasStats.rotation || 0) || 0,
      exactGeometry: !rendered.visibleCapture && Boolean(sourcePageWidth && sourcePageHeight)
    };
  }

  async function recognizePdfOcrVariant(dataUrl, pageNumber, recognitionVariant, recognitionContext = {}) {
    const ocrRunId = getActivePdfOcrRunId();
    assertActiveOcrRun(ocrRunId);
    markPdfOcrStep(`variant:${recognitionVariant}`);
    await waitForPdfOcrIdle(`before-recognize:${recognitionVariant}`, ocrRunId, 8);
    const ocrResult = await racePdfOcrTimeout(
      extractTextFromImageDataUrl(dataUrl, recognitionContext),
      { timeoutMs: getPdfOcrAttemptTimeoutMs(runtime.pdfOcr && runtime.pdfOcr.mode || "fast"), mode: runtime.pdfOcr && runtime.pdfOcr.mode || "", currentStep: `variant:${recognitionVariant}`, ocrRunId }
    );
    assertActiveOcrRun(ocrRunId);
    return normalizePdfPageOcrVariantResult(ocrResult, recognitionVariant, recognitionContext);
  }

  function normalizePdfPageOcrVariantResult(ocrResult, recognitionVariant, recognitionContext = {}) {
    const rawText = String(ocrResult && ocrResult.rawText !== undefined
      ? ocrResult.rawText
      : ocrResult && ocrResult.text !== undefined ? ocrResult.text : ocrResult || "");
    const cleanText = String(ocrResult && (ocrResult.reconstructedText || ocrResult.text) || ocrResult || "")
      .replace(/[^\S\n]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const words = countPdfWords(cleanText);
    const normalizedLines = normalizePdfRecoveryLines(ocrResult && Array.isArray(ocrResult.lines) ? ocrResult.lines : []);
    const lines = normalizedLines.length ? normalizedLines : pdfOcrLinesFromText(cleanText);
    const confidence = Number.isFinite(Number(ocrResult && ocrResult.confidence)) ? Math.round(Number(ocrResult.confidence)) : averageLineConfidence(lines);
    const ocrTextQuality = evaluatePdfOcrTextQuality({
      text: cleanText,
      lines,
      words,
      confidence,
      source: ocrResult && ocrResult.source ? ocrResult.source : "ocr",
      recognitionVariant,
      ocrVariantName: String(recognitionContext.ocrVariantName || recognitionVariant || "").slice(0, 80)
    });
    return {
      raw: ocrResult,
      text: cleanText,
      rawText,
      reconstructedText: cleanText,
      words,
      lines,
      confidence,
      source: ocrResult && ocrResult.source ? ocrResult.source : "ocr",
      recognitionVariant,
      ocrVariantName: String(recognitionContext.ocrVariantName || recognitionVariant || "").slice(0, 80),
      recognitionContext,
      ocrTextQuality,
      rawTextLength: rawText.length,
      firstTextSample: rawText.slice(0, 240)
    };
  }

  function isBetterPdfOcrVariant(candidate, current) {
    if (!candidate) return false;
    if (!current) return true;
    const candidateQuality = candidate.ocrTextQuality && typeof candidate.ocrTextQuality === "object"
      ? candidate.ocrTextQuality
      : evaluatePdfOcrTextQuality(candidate);
    const currentQuality = current.ocrTextQuality && typeof current.ocrTextQuality === "object"
      ? current.ocrTextQuality
      : evaluatePdfOcrTextQuality(current);
    if (Boolean(candidateQuality.corrupted) !== Boolean(currentQuality.corrupted)) return !candidateQuality.corrupted;
    if (Boolean(candidateQuality.missedRegionLikely) !== Boolean(currentQuality.missedRegionLikely)) return !candidateQuality.missedRegionLikely;
    if (Math.abs((candidateQuality.score || 0) - (currentQuality.score || 0)) >= 12) return (candidateQuality.score || 0) > (currentQuality.score || 0);
    if (Boolean(candidateQuality.complete) !== Boolean(currentQuality.complete)) return Boolean(candidateQuality.complete);
    if (Math.abs((candidateQuality.textCompleteness || 0) - (currentQuality.textCompleteness || 0)) >= 0.14) return (candidateQuality.textCompleteness || 0) > (currentQuality.textCompleteness || 0);
    if (Math.abs((candidateQuality.pageCoverage || 0) - (currentQuality.pageCoverage || 0)) >= 0.18) return (candidateQuality.pageCoverage || 0) > (currentQuality.pageCoverage || 0);
    if (Math.abs((candidateQuality.paragraphContinuity || 0) - (currentQuality.paragraphContinuity || 0)) >= 0.16) return (candidateQuality.paragraphContinuity || 0) > (currentQuality.paragraphContinuity || 0);
    if (candidate.words !== current.words) return candidate.words > current.words;
    if ((candidate.rawTextLength || 0) !== (current.rawTextLength || 0)) return (candidate.rawTextLength || 0) > (current.rawTextLength || 0);
    if (candidate.lines.length !== current.lines.length) return candidate.lines.length > current.lines.length;
    return Number(candidate.confidence || 0) > Number(current.confidence || 0);
  }

  function getFastPdfOcrFallbackVariants(rendered) {
    if (!rendered) return [];
    return [
      rendered.contrast ? { label: "contrast", dataUrl: rendered.contrast.dataUrl, rendered, canvasWidth: rendered.contrast.width, canvasHeight: rendered.contrast.height, cropBox: rendered.contrast.bounds || null } : null,
      rendered.grayscale ? { label: "grayscale", dataUrl: rendered.grayscale.dataUrl, rendered, canvasWidth: rendered.grayscale.width, canvasHeight: rendered.grayscale.height, cropBox: rendered.grayscale.bounds || null } : null,
      rendered.threshold ? { label: "threshold", dataUrl: rendered.threshold.dataUrl, rendered, canvasWidth: rendered.threshold.width, canvasHeight: rendered.threshold.height, cropBox: rendered.threshold.bounds || null } : null,
      rendered.preprocessed ? { label: "preprocessed-threshold", dataUrl: rendered.preprocessed.dataUrl, rendered, canvasWidth: rendered.preprocessed.width || rendered.width, canvasHeight: rendered.preprocessed.height || rendered.height, cropBox: rendered.preprocessed.bounds || null } : null
    ].filter(Boolean).slice(0, 1);
  }

  function evaluatePdfOcrCandidateUsability(candidate, pagesSoFar = [], routeKey = getPdfDocumentRouteKey(), mode = "fast") {
    if (!candidate || !String(candidate.text || "").trim()) return { usable: false, sections: 0, words: 0, model: null };
    const nextPages = pagesSoFar.concat([{
      pageNumber: Number(candidate.pageNumber) || Math.max(1, pagesSoFar.length + 1),
      text: String(candidate.text || ""),
      words: Number(candidate.words) || countPdfWords(candidate.text || ""),
      lines: Array.isArray(candidate.lines) ? candidate.lines : [],
      source: candidate.source || "ocr",
      confidence: Number(candidate.confidence) || 0
    }]);
    const entry = normalizePdfCacheEntry({
      text: nextPages.map((page) => page.text).join("\n\n"),
      pages: nextPages,
      words: nextPages.reduce((sum, page) => sum + (Number(page.words) || countPdfWords(page.text || "")), 0),
      source: "ocr",
      ocrMode: normalizePdfOcrDiagnosticMode(mode),
      confidence: Number(candidate.confidence) || 0,
      updatedAt: Date.now()
    });
    let model = null;
    try {
      model = buildSimpleOcrRecoveredPdfModel(entry, routeKey, "ocr-candidate-eval", runtime.model, { remember: false });
    } catch (error) {
      emitDebug("pdf:ocr:candidate-eval:error", {
        routeKey,
        mode,
        error: String(error && error.message ? error.message : error)
      });
    }
    const pageStructure = getPdfOcrStructureCompleteness(entry, null);
    const modelStructure = model ? getPdfOcrStructureCompleteness(entry, model) : null;
    const structure = modelStructure && modelStructure.complete && Number(modelStructure.score || 0) >= Number(pageStructure && pageStructure.score || 0)
      ? modelStructure
      : pageStructure;
    const sections = Math.max(model && Array.isArray(model.sections) ? model.sections.length : 0, Number(structure && structure.sections) || 0);
    const words = model ? Number(model.totalReadableWords || model.totalWords || entry.words || 0) : Number(entry && entry.words) || 0;
    const ocrTextQuality = evaluatePdfOcrTextQuality({
      text: candidate.text,
      lines: Array.isArray(candidate.lines) ? candidate.lines : [],
      words: Number(candidate.words) || words,
      confidence: Number(candidate.confidence) || 0
    }, structure);
    const usable = sections >= 1
      && words >= PDF_RECOVERY_MIN_WORDS
      && (!structure || structure.complete)
      && ocrTextQuality.readable
      && !ocrTextQuality.corrupted;
    return { usable, sections, words, model, structure, ocrTextQuality };
  }

  function getPdfOcrEarlyStopDecision(candidate, pagesSoFar, routeKey, mode) {
    const normalizedMode = normalizePdfOcrDiagnosticMode(mode);
    const evaluation = evaluatePdfOcrCandidateUsability(candidate, pagesSoFar, routeKey, normalizedMode);
    const words = Number(candidate && candidate.words) || 0;
    const confidence = Number(candidate && candidate.confidence) || 0;
    const textQuality = evaluation.ocrTextQuality || evaluatePdfOcrTextQuality(candidate, evaluation.structure);
    const strong = normalizedMode === "better"
      ? words >= 100 && confidence >= 85 && evaluation.usable && textQuality.complete && !textQuality.missedRegionLikely
      : words >= PDF_OCR_WEAK_TEXT_WORDS && confidence >= 70 && evaluation.usable && textQuality.complete && !textQuality.missedRegionLikely;
    return { stop: Boolean(strong), ...evaluation, ocrTextQuality: textQuality };
  }

  function getPdfOcrResultPrimaryCandidate(result) {
    const pages = Array.isArray(result && result.pages) ? result.pages : [];
    const text = String(result && result.text || pages.map((page) => page && page.text || "").filter(Boolean).join("\n\n")).trim();
    const lines = pages.flatMap((page) => Array.isArray(page && page.lines) ? page.lines : []);
    const firstPage = pages.find((page) => page && String(page.text || "").trim()) || pages[0] || {};
    return {
      text,
      rawText: String(result && result.rawText || pages.map((page) => page && page.rawText || "").filter(Boolean).join("\n\n") || text),
      words: Number(result && result.words) || countPdfWords(text),
      lines,
      confidence: Number(result && result.confidence) || averageLineConfidence(lines),
      source: String(result && result.source || firstPage.source || "ocr"),
      recognitionVariant: String(result && (result.bestVariantName || result.recognitionVariant || result.adaptiveMode) || firstPage.recognitionVariant || firstPage.ocrVariantName || ""),
      ocrVariantName: String(result && (result.bestVariantName || result.ocrVariantName || result.adaptiveMode) || firstPage.ocrVariantName || firstPage.recognitionVariant || ""),
      pageNumber: Number(firstPage.pageNumber) || 1,
      rawTextLength: String(result && result.rawText || text).length
    };
  }

  function getPdfOcrImmediateReturnDecision(result, routeKey = getPdfDocumentRouteKey(), mode = "fast") {
    const candidate = getPdfOcrResultPrimaryCandidate(result);
    if (!candidate.text) {
      return {
        strong: false,
        provisional: false,
        words: 0,
        confidence: 0,
        ocrTextQuality: evaluatePdfOcrTextQuality(candidate),
        reason: "OCR did not return text."
      };
    }
    const pages = Array.isArray(result && result.pages) ? result.pages : [{
      pageNumber: candidate.pageNumber,
      text: candidate.text,
      words: candidate.words,
      lines: candidate.lines,
      source: candidate.source,
      confidence: candidate.confidence
    }];
    const structure = getPdfOcrStructureCompleteness({
      text: candidate.text,
      pages,
      words: candidate.words,
      source: "ocr"
    });
    const ocrTextQuality = result && result.ocrTextQuality && typeof result.ocrTextQuality === "object"
      ? result.ocrTextQuality
      : evaluatePdfOcrTextQuality(candidate, structure);
    const normalizedMode = normalizePdfOcrDiagnosticMode(mode);
    const minConfidence = normalizedMode === "better" ? 85 : 70;
    const minWords = normalizedMode === "better" ? 100 : PDF_OCR_WEAK_TEXT_WORDS;
    const strong = Boolean(
      candidate.words >= minWords
      && candidate.confidence >= minConfidence
      && ocrTextQuality.readable
      && ocrTextQuality.complete
      && !ocrTextQuality.corrupted
      && !ocrTextQuality.missedRegionLikely
      && (!structure || structure.complete)
    );
    const provisional = Boolean(candidate.words > 0 && !strong);
    return {
      strong,
      provisional,
      words: candidate.words,
      confidence: candidate.confidence,
      lineCount: candidate.lines.length,
      structure,
      ocrTextQuality,
      reason: strong ? "OCR result is complete enough to return immediately." : ocrTextQuality.selectedVariantReason || "OCR result needs comparison before returning.",
      routeKey
    };
  }

  function emitPdfOcrSelectedVariant(pageNumber, variant, details = {}) {
    if (!variant) return;
    const quality = variant.ocrTextQuality && typeof variant.ocrTextQuality === "object"
      ? variant.ocrTextQuality
      : evaluatePdfOcrTextQuality(variant);
    emitDebug("pdf:ocr:selected-variant", {
      pageNumber,
      variantName: String(variant.recognitionVariant || variant.ocrVariantName || details.variantName || "unknown"),
      mode: details.mode || runtime.pdfOcr && runtime.pdfOcr.mode || "",
      source: variant.source || "ocr",
      wordCount: Number(variant.words) || countPdfWords(variant.text || ""),
      confidence: Number(variant.confidence) || 0,
      lineCount: Array.isArray(variant.lines) ? variant.lines.length : 0,
      readableWordRatio: quality.readableWordRatio || 0,
      lineCoverage: quality.lineCoverage || 0,
      pageCoverage: quality.pageCoverage || 0,
      paragraphContinuity: quality.paragraphContinuity || 0,
      textCompleteness: quality.textCompleteness || 0,
      missedRegionLikely: Boolean(quality.missedRegionLikely),
      corrupted: Boolean(quality.corrupted),
      selectedVariantReason: quality.selectedVariantReason || "",
      firstTextSample: String(variant.text || variant.rawText || "").slice(0, 240)
    });
  }

  async function tryPdfOcrVariant(pageNumber, variant, currentBest, errors, resultsLog = null) {
    try {
      assertPdfOcrNotCancelled();
      await waitForPdfOcrIdle(`variant:${variant.label}:start`, runtime.pdfOcr && runtime.pdfOcr.activeAttemptId || 0, 12);
      emitDebug("pdf:ocr:page:variant:start", {
        pageNumber,
        recognitionVariant: variant.label,
        renderScale: variant.rendered && variant.rendered.scale ? Math.round(variant.rendered.scale * 100) / 100 : 0
      });
      const recognitionContext = buildPdfOcrRecognitionContext(variant, pageNumber, variant.label);
      const result = await recognizePdfOcrVariant(variant.dataUrl, pageNumber, variant.label, recognitionContext);
      await waitForPdfOcrIdle(`variant:${variant.label}:end`, runtime.pdfOcr && runtime.pdfOcr.activeAttemptId || 0, 12);
      const selected = isBetterPdfOcrVariant(result, currentBest);
      const variantPayload = {
        pageNumber,
        variantName: variant.label,
        canvasWidth: Number(variant.canvasWidth || variant.width || variant.rendered && variant.rendered.width || 0),
        canvasHeight: Number(variant.canvasHeight || variant.height || variant.rendered && variant.rendered.height || 0),
        inkRatio: variant.inkRatio !== undefined ? variant.inkRatio : variant.rendered && variant.rendered.inkCheck && variant.rendered.inkCheck.inkRatio,
        renderScale: variant.rendered && variant.rendered.scale ? Math.round(variant.rendered.scale * 100) / 100 : 0,
        cropBox: variant.cropBox || variant.bounds || null,
        cropOffset: { x: recognitionContext.cropOffsetX || 0, y: recognitionContext.cropOffsetY || 0 },
        rawTextLength: result && result.rawTextLength || 0,
        wordCount: result && result.words || 0,
        confidence: result && result.confidence || 0,
        firstTextSample: result && result.firstTextSample || "",
        ocrTextQuality: result && result.ocrTextQuality || null,
        source: result && result.source || "ocr",
        selected
      };
      if (Array.isArray(resultsLog)) resultsLog.push(variantPayload);
      emitDebug("pdf:ocr:variant-result", variantPayload);
      emitDebug("pdf:ocr:page:variant:complete", {
        pageNumber,
        recognitionVariant: variant.label,
        selected,
        words: result.words,
        lines: result.lines.length,
        confidence: result.confidence
      });
      return result;
    } catch (error) {
      if (isPdfOcrCancellationError(error) || isPdfOcrTimeoutError(error)) {
        throw error;
      }
      const message = String(error && error.message ? error.message : error);
      errors.push({
        variant: variant.label,
        error: message,
        renderScale: variant.rendered && variant.rendered.scale ? Math.round(variant.rendered.scale * 100) / 100 : 0
      });
      emitDebug("pdf:ocr:page:variant:error", {
        pageNumber,
        recognitionVariant: variant.label,
        error: message,
        renderScale: variant.rendered && variant.rendered.scale ? Math.round(variant.rendered.scale * 100) / 100 : 0
      });
      const variantPayload = {
        pageNumber,
        variantName: variant.label,
        canvasWidth: Number(variant.canvasWidth || variant.width || variant.rendered && variant.rendered.width || 0),
        canvasHeight: Number(variant.canvasHeight || variant.height || variant.rendered && variant.rendered.height || 0),
        inkRatio: variant.inkRatio !== undefined ? variant.inkRatio : variant.rendered && variant.rendered.inkCheck && variant.rendered.inkCheck.inkRatio,
        renderScale: variant.rendered && variant.rendered.scale ? Math.round(variant.rendered.scale * 100) / 100 : 0,
        cropBox: variant.cropBox || variant.bounds || null,
        rawTextLength: 0,
        wordCount: 0,
        confidence: 0,
        firstTextSample: "",
        error: message
      };
      if (Array.isArray(resultsLog)) resultsLog.push(variantPayload);
      emitDebug("pdf:ocr:variant-result", variantPayload);
      return null;
    }
  }

  async function extractPdfTextWithPageOcr(sourceUrl, options = {}) {
    const pdfjs = await loadPdfJsModule();
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const startedAt = Date.now();
    const plan = options.plan || getPdfOcrPlan(options.mode || "smart");
    const attemptId = Number(options.attemptId) || runtime.pdfOcr && runtime.pdfOcr.activeAttemptId || 0;
    assertPdfOcrNotCancelled(attemptId);
    emitDebug("pdf:ocr:adaptive-plan", {
      mode: plan.mode,
      maxPages: plan.maxPages,
      renderScaleMultiplier: plan.renderScaleMultiplier,
      pageTimeoutMs: plan.pageTimeoutMs,
      variantBudget: plan.variantBudget,
      device: plan.device,
      message: plan.message
    });
    const preflight = await runPdfOcrPreflight({ loadModule: false });
    if (!preflight.supported) {
      const error = new Error(preflight.exactIssue || "OCR support is unavailable.");
      error.pdfErrorKind = "ocr-unavailable";
      throw error;
    }
    const routeKey = options.routeKey || getPdfDocumentRouteKey();
    const cachedResource = getCachedPdfResource(routeKey);
    let data = cachedResource && cachedResource.bytes ? clonePdfBytes(cachedResource.bytes) : null;
    let fingerprint = cachedResource && cachedResource.fingerprint || null;
    let pdf = cachedResource && cachedResource.pdfDocument || null;
    let task = null;
    if (!data && !pdf) {
      data = await fetchPdfBytesForRecovery(sourceUrl, PDF_FETCH_TIMEOUT_MS);
    }
    fingerprint = normalizePdfFingerprint(fingerprint) || getPdfByteFingerprint(data);
    if (!pdf) {
      task = pdfjs.getDocument({
        data: clonePdfBytes(data) || data,
        isEvalSupported: false,
        useWorkerFetch: false,
        stopAtErrors: false,
        disableFontFace: true,
        disableStream: true,
        disableAutoFetch: true,
        cMapUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/cmaps/"),
        cMapPacked: true,
        // Required for scanned PDFs that use JBIG2/OpenJPEG image streams.
        // Without wasmUrl, PDF.js can fetch the PDF bytes but render blank/undecodable pages,
        // which makes OCR return zero words.
        wasmUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/wasm/"),
        standardFontDataUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/standard_fonts/"),
        iccUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/iccs/"),
        useWasm: true
      });
      if (runtime.pdfOcr) runtime.pdfOcr.activePdfLoadingTask = task;
      pdf = await Promise.race([
        task.promise,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("PDF OCR document load timed out.")), PDF_FETCH_TIMEOUT_MS + 4000))
      ]);
      if (runtime.pdfOcr && runtime.pdfOcr.activePdfLoadingTask === task) {
        runtime.pdfOcr.activePdfLoadingTask = null;
      }
    }
    rememberPdfResource(routeKey, {
      source: "pdfjs-ocr",
      sourceUrl,
      bytes: data,
      fingerprint,
      pdfDocument: pdf,
      pageCount: Number(pdf && pdf.numPages || 0)
    });
    if (runtime.pdfOcr) runtime.pdfOcr.activePdfDocument = pdf;
    const numPages = Number(pdf && pdf.numPages || 0);
    const pageLimit = Math.min(numPages, Number.isFinite(plan.maxPages) ? plan.maxPages : PDF_OCR_MAX_PAGES);
    const pages = [];
    const pageDiagnostics = [];
    let totalWords = 0;
    let confidenceTotal = 0;
    let confidencePages = 0;
    let pagesRead = 0;
    emitDebug("pdf:ocr:document:loaded", {
      numPages,
      pageLimit,
      mode: plan.mode,
      device: plan.device,
      note: pageLimit < numPages ? "OCR is capped for speed. Better OCR can process more pages on faster devices." : "OCR will attempt every page in this pass."
    });
    onProgress({ loaded: 0, total: pageLimit, percent: 10, phase: "ocr", mode: plan.mode, message: plan.message });

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      assertPdfOcrNotCancelled(attemptId);
      await waitForPdfOcrIdle(`page:${pageNumber}:loop`, attemptId, 18);
      pagesRead = pageNumber;
      try {
        await waitForPdfOcrIdle(`page:${pageNumber}:before-get`, attemptId, 12);
        const page = await pdf.getPage(pageNumber);
        onProgress({
          loaded: Math.max(0, pageNumber - 1),
          total: pageLimit,
          percent: Math.min(92, Math.max(12, Math.round(12 + ((pageNumber - 1) / Math.max(1, pageLimit)) * 72))),
          phase: "ocr",
          mode: plan.mode,
          message: PDF_OCR_RUNNING_MESSAGE
        });
        assertPdfOcrNotCancelled(attemptId);
        await waitForPdfOcrIdle(`page:${pageNumber}:before-render`, attemptId, 18);
        const rendered = await renderPdfPageToOcrDataUrl(page, pageNumber, { renderScaleMultiplier: plan.renderScaleMultiplier, pageTimeoutMs: plan.pageTimeoutMs, skipPreprocess: false, attemptId });
        assertPdfOcrNotCancelled(attemptId);
        await waitForPdfOcrIdle(`page:${pageNumber}:after-render`, attemptId, 18);
        const variantErrors = [];
        const variantResults = [];
        emitDebug("pdf:ocr:page:start", {
          pageNumber,
          renderScale: rendered && rendered.scale ? Math.round(rendered.scale * 100) / 100 : 0,
          inkRatio: rendered && rendered.inkCheck && rendered.inkCheck.inkRatio,
          likelyBlank: Boolean(rendered && rendered.inkCheck && rendered.inkCheck.likelyBlank)
        });
        let bestVariant = null;
        const firstVariant = {
          label: "raw",
          dataUrl: rendered && rendered.rawDataUrl || rendered && rendered.dataUrl || rendered,
          rendered,
          canvasWidth: rendered && rendered.width || 0,
          canvasHeight: rendered && rendered.height || 0,
          inkRatio: rendered && rendered.inkCheck && rendered.inkCheck.inkRatio,
          cropBox: null
        };
        onProgress({
          loaded: Math.max(0, pageNumber - 1),
          total: pageLimit,
          percent: Math.min(94, Math.max(18, Math.round(18 + ((pageNumber - 1) / Math.max(1, pageLimit)) * 70))),
          phase: "ocr",
          mode: plan.mode,
          message: PDF_OCR_RUNNING_MESSAGE
        });
        const firstResult = await tryPdfOcrVariant(pageNumber, firstVariant, bestVariant, variantErrors, variantResults);
        if (firstResult) firstResult.pageNumber = pageNumber;
        if (isBetterPdfOcrVariant(firstResult, bestVariant)) bestVariant = firstResult;
        let earlyStop = getPdfOcrEarlyStopDecision(bestVariant, pages, routeKey, plan.mode);
        if (rendered && !earlyStop.stop) {
          const allExtraVariants = [
            rendered.grayscale ? { label: "grayscale", dataUrl: rendered.grayscale.dataUrl, rendered, canvasWidth: rendered.grayscale.width, canvasHeight: rendered.grayscale.height, cropBox: rendered.grayscale.bounds || null } : null,
            rendered.contrast ? { label: "contrast", dataUrl: rendered.contrast.dataUrl, rendered, canvasWidth: rendered.contrast.width, canvasHeight: rendered.contrast.height, cropBox: rendered.contrast.bounds || null } : null,
            rendered.threshold ? { label: "threshold", dataUrl: rendered.threshold.dataUrl, rendered, canvasWidth: rendered.threshold.width, canvasHeight: rendered.threshold.height, cropBox: rendered.threshold.bounds || null } : null,
            rendered.inverted ? { label: "inverted", dataUrl: rendered.inverted.dataUrl, rendered, canvasWidth: rendered.inverted.width, canvasHeight: rendered.inverted.height, cropBox: rendered.inverted.bounds || null } : null,
            rendered.preprocessed ? { label: "preprocessed-threshold", dataUrl: rendered.preprocessed.dataUrl, rendered, canvasWidth: rendered.preprocessed.width || rendered.width, canvasHeight: rendered.preprocessed.height || rendered.height, cropBox: rendered.preprocessed.bounds || null } : null,
            rendered.fastCrop ? { label: "fast-crop-threshold", dataUrl: rendered.fastCrop.dataUrl, rendered, canvasWidth: rendered.fastCrop.width, canvasHeight: rendered.fastCrop.height, cropBox: rendered.fastCrop.bounds || null } : null,
            rendered.cropThreshold ? { label: "crop-threshold", dataUrl: rendered.cropThreshold.dataUrl, rendered, canvasWidth: rendered.cropThreshold.width, canvasHeight: rendered.cropThreshold.height, cropBox: rendered.cropThreshold.bounds || null } : null,
            rendered.cropContrast ? { label: "crop-contrast", dataUrl: rendered.cropContrast.dataUrl, rendered, canvasWidth: rendered.cropContrast.width, canvasHeight: rendered.cropContrast.height, cropBox: rendered.cropContrast.bounds || null } : null,
            rendered.cropInvert ? { label: "crop-invert-threshold", dataUrl: rendered.cropInvert.dataUrl, rendered, canvasWidth: rendered.cropInvert.width, canvasHeight: rendered.cropInvert.height, cropBox: rendered.cropInvert.bounds || null } : null
          ].filter(Boolean);
          const extraVariants = normalizePdfOcrDiagnosticMode(plan.mode) === "fast"
            ? getFastPdfOcrFallbackVariants(rendered)
            : allExtraVariants;
          for (const variant of extraVariants) {
            assertPdfOcrNotCancelled(attemptId);
            if (earlyStop.stop) break;
            const variantResult = await tryPdfOcrVariant(pageNumber, variant, bestVariant, variantErrors, variantResults);
            if (variantResult) variantResult.pageNumber = pageNumber;
            if (isBetterPdfOcrVariant(variantResult, bestVariant)) bestVariant = variantResult;
            earlyStop = getPdfOcrEarlyStopDecision(bestVariant, pages, routeKey, plan.mode);
          }
        }
        if (
          normalizePdfOcrDiagnosticMode(plan.mode) !== "fast"
          && !earlyStop.stop
          &&
          rendered
          && (Number.isFinite(plan.variantBudget) ? plan.variantBudget : 3) >= 3
          && !(rendered.inkCheck && rendered.inkCheck.likelyBlank)
          && (!bestVariant || bestVariant.words < 1)
        ) {
          assertPdfOcrNotCancelled(attemptId);
          const lowerRendered = await renderPdfPageToOcrDataUrl(page, pageNumber, { scaleMultiplier: 0.72, attemptId });
          const lowerResult = await tryPdfOcrVariant(pageNumber, {
            label: "lower-scale",
            dataUrl: lowerRendered && lowerRendered.dataUrl,
            rendered: lowerRendered,
            canvasWidth: lowerRendered && lowerRendered.width || 0,
            canvasHeight: lowerRendered && lowerRendered.height || 0,
            inkRatio: lowerRendered && lowerRendered.inkCheck && lowerRendered.inkCheck.inkRatio,
            cropBox: lowerRendered && lowerRendered.canvasStats && lowerRendered.canvasStats.cropBox || null
          }, bestVariant, variantErrors, variantResults);
          if (lowerResult) lowerResult.pageNumber = pageNumber;
          if (isBetterPdfOcrVariant(lowerResult, bestVariant)) bestVariant = lowerResult;
          earlyStop = getPdfOcrEarlyStopDecision(bestVariant, pages, routeKey, plan.mode);
          if (
            !earlyStop.stop
            &&
            lowerRendered
            && lowerRendered.rawDataUrl
            && lowerRendered.rawDataUrl !== lowerRendered.dataUrl
            && (!bestVariant || bestVariant.words < PDF_OCR_SHORT_MEANINGFUL_WORDS)
          ) {
            const lowerRawResult = await tryPdfOcrVariant(pageNumber, {
              label: "lower-scale-raw",
              dataUrl: lowerRendered.rawDataUrl,
              rendered: lowerRendered,
              canvasWidth: lowerRendered.width,
              canvasHeight: lowerRendered.height,
              inkRatio: lowerRendered && lowerRendered.inkCheck && lowerRendered.inkCheck.inkRatio,
              cropBox: null
            }, bestVariant, variantErrors, variantResults);
            if (lowerRawResult) lowerRawResult.pageNumber = pageNumber;
            if (isBetterPdfOcrVariant(lowerRawResult, bestVariant)) bestVariant = lowerRawResult;
            earlyStop = getPdfOcrEarlyStopDecision(bestVariant, pages, routeKey, plan.mode);
          }
        }
        if (
          normalizePdfOcrDiagnosticMode(plan.mode) !== "fast"
          && !earlyStop.stop
          &&
          pageNumber === 1
          && plan.allowVisibleCapture
          && rendered
          && !(rendered.inkCheck && rendered.inkCheck.likelyBlank)
          && (!bestVariant || bestVariant.words < PDF_OCR_SHORT_MEANINGFUL_WORDS)
        ) {
          try {
            assertPdfOcrNotCancelled(attemptId);
            await waitForPdfOcrIdle(`page:${pageNumber}:before-visible-capture`, attemptId, 18);
            const captureDataUrl = await requestVisibleTabCapture();
            const captureResult = await tryPdfOcrVariant(pageNumber, {
              label: "visible-capture",
              dataUrl: captureDataUrl,
              rendered: { scale: 0, visibleCapture: true, sourceCanvas: "visible-tab-capture", viewerUiLikely: true }
            }, bestVariant, variantErrors, variantResults);
            if (captureResult) captureResult.pageNumber = pageNumber;
            if (isBetterPdfOcrVariant(captureResult, bestVariant)) bestVariant = captureResult;
            earlyStop = getPdfOcrEarlyStopDecision(bestVariant, pages, routeKey, plan.mode);
          } catch (captureError) {
            if (isPdfOcrCancellationError(captureError) || isPdfOcrTimeoutError(captureError)) {
              throw captureError;
            }
            const message = String(captureError && captureError.message ? captureError.message : captureError);
            variantErrors.push({ variant: "visible-capture", error: message, renderScale: 0 });
            emitDebug("pdf:ocr:page:visible-capture:error", {
              pageNumber,
              error: message
            });
          }
        }
        const cleanText = bestVariant ? bestVariant.text : "";
        const rawText = bestVariant ? bestVariant.rawText || bestVariant.text || "" : "";
        const words = bestVariant ? bestVariant.words : 0;
        const lines = bestVariant ? bestVariant.lines : [];
        const confidence = bestVariant ? bestVariant.confidence : 0;
        const source = bestVariant ? bestVariant.source : "ocr";
        const recognitionVariant = bestVariant ? bestVariant.recognitionVariant : "none";
        const ocrTextQuality = bestVariant ? bestVariant.ocrTextQuality || evaluatePdfOcrTextQuality(bestVariant) : null;
        emitPdfOcrSelectedVariant(pageNumber, bestVariant, { mode: plan.mode, variantName: recognitionVariant });
        const everyVariantEmpty = variantResults.length > 0 && variantResults.every((variant) => Number(variant.rawTextLength || 0) === 0);
        if (everyVariantEmpty) {
          emitDebug("pdf:ocr:blank-or-unreadable-canvas", {
            pageNumber,
            canvasStats: rendered && rendered.canvasStats || null,
            variantResults,
            exactIssue: rendered && rendered.canvasStats && rendered.canvasStats.blankPageLikely
              ? "PDF.js rendered a canvas with little or no ink, so OCR is receiving a blank/unreadable page image."
              : "PDF.js rendered visible ink, but every OCR/preprocessing variant returned zero raw text."
          });
        }
        if (confidence > 0) {
          confidenceTotal += confidence;
          confidencePages += 1;
        }
        pageDiagnostics.push({
          pageNumber,
          words,
          source,
          confidence,
          inkRatio: rendered && rendered.inkCheck && rendered.inkCheck.inkRatio,
          likelyBlank: Boolean(rendered && rendered.inkCheck && rendered.inkCheck.likelyBlank),
          preprocessed: Boolean(rendered && rendered.preprocessed),
          recognitionVariant,
          renderScale: rendered && rendered.scale ? Math.round(rendered.scale * 100) / 100 : 0,
          lines: lines.length,
          ocrTextQuality,
          canvasStats: rendered && rendered.canvasStats || null,
          variantResults,
          variantErrors,
          blankOrUnreadableCanvas: everyVariantEmpty
        });
        emitDebug("pdf:ocr:page:extract", {
          pageNumber,
          words,
          source,
          confidence,
          lines: lines.length,
          sample: cleanText.slice(0, 300),
          inkRatio: rendered && rendered.inkCheck && rendered.inkCheck.inkRatio,
          likelyBlank: Boolean(rendered && rendered.inkCheck && rendered.inkCheck.likelyBlank),
          preprocessed: Boolean(rendered && rendered.preprocessed),
          recognitionVariant,
          renderScale: rendered && rendered.scale ? Math.round(rendered.scale * 100) / 100 : 0,
          canvasStats: rendered && rendered.canvasStats || null,
          variantResults,
          variantErrors,
          ocrTextQuality,
          success: words > 0
        });
        if (cleanText) {
          pages.push({
            pageNumber,
            text: cleanText,
            rawText,
            reconstructedText: cleanText,
            words,
            lines,
            source,
            confidence,
            recognitionVariant,
            ocrVariantName: recognitionVariant,
            ocrTextQuality
          });
          totalWords += words;
        }
        if (earlyStop.stop) {
          emitDebug("pdf:ocr:early-stop", {
            pageNumber,
            mode: normalizePdfOcrDiagnosticMode(plan.mode),
            variantName: recognitionVariant,
            words,
            confidence,
            parserOutputSections: earlyStop.sections,
            parserOutputWords: earlyStop.words,
            ocrStructureComplete: Boolean(earlyStop.structure && earlyStop.structure.complete),
            ocrCompletenessScore: Number(earlyStop.structure && earlyStop.structure.score) || 0,
            ocrRoleCounts: earlyStop.structure && earlyStop.structure.roleCounts || {},
            ocrBodyWords: Number(earlyStop.structure && earlyStop.structure.bodyWords) || 0,
            ocrTextQuality: earlyStop.ocrTextQuality || null,
            exactIssue: "OCR stopped remaining variants/pages because the current candidate already produced usable OCR sections with strong text."
          });
          onProgress({
            loaded: pageNumber,
            total: pageLimit,
            percent: 96,
            phase: "ocr",
            mode: plan.mode,
            message: PDF_OCR_RUNNING_MESSAGE
          });
          break;
        }
      } catch (pageError) {
        if (isPdfOcrCancellationError(pageError) || isPdfOcrTimeoutError(pageError)) {
          throw pageError;
        }
        let recoveredByVisibleCapture = false;
        if (pageNumber === 1) {
          const captureErrors = [{
            variant: "pdfjs-render",
            error: String(pageError && pageError.message ? pageError.message : pageError),
            renderScale: 0
          }];
          try {
            emitDebug("pdf:ocr:page:render-fallback-capture:start", {
              pageNumber,
              reason: "PDF.js page rendering timed out or failed, so SkimRoute is trying OCR on the visible PDF viewport instead of making the user wait.",
              originalError: String(pageError && pageError.message ? pageError.message : pageError)
            });
            assertPdfOcrNotCancelled(attemptId);
            await waitForPdfOcrIdle(`page:${pageNumber}:render-fallback-capture`, attemptId, 18);
            const captureDataUrl = await requestVisibleTabCapture();
            const captureResult = await tryPdfOcrVariant(pageNumber, {
              label: "visible-capture-after-render-timeout",
              dataUrl: captureDataUrl,
              rendered: { scale: 0 }
            }, null, captureErrors);
            if (captureResult && captureResult.text && captureResult.words > 0) {
              const cleanText = captureResult.text;
              const rawText = captureResult.rawText || captureResult.text || "";
              const words = captureResult.words;
              const lines = captureResult.lines || [];
              const confidence = captureResult.confidence || 0;
              const ocrTextQuality = captureResult.ocrTextQuality || evaluatePdfOcrTextQuality(captureResult);
              if (confidence > 0) {
                confidenceTotal += confidence;
                confidencePages += 1;
              }
              pages.push({ pageNumber, text: cleanText, rawText, reconstructedText: cleanText, words, lines, source: captureResult.source || "ocr", confidence, recognitionVariant: captureResult.recognitionVariant || "visible-capture-after-render-timeout", ocrVariantName: captureResult.ocrVariantName || captureResult.recognitionVariant || "visible-capture-after-render-timeout", ocrTextQuality });
              totalWords += words;
              pageDiagnostics.push({
                pageNumber,
                words,
                source: captureResult.source || "ocr",
                confidence,
                recognitionVariant: captureResult.recognitionVariant || "visible-capture-after-render-timeout",
                renderScale: 0,
                lines: lines.length,
                ocrTextQuality,
                variantErrors: captureErrors,
                fallbackFromRenderTimeout: true
              });
              emitDebug("pdf:ocr:page:render-fallback-capture:success", {
                pageNumber,
                words,
                lines: lines.length,
                confidence,
                sample: cleanText.slice(0, 220)
              });
              recoveredByVisibleCapture = true;
            } else {
              emitDebug("pdf:ocr:page:render-fallback-capture:low-text", {
                pageNumber,
                words: captureResult && captureResult.words || 0,
                lines: captureResult && captureResult.lines ? captureResult.lines.length : 0,
                errors: captureErrors
              });
            }
          } catch (captureError) {
            if (isPdfOcrCancellationError(captureError) || isPdfOcrTimeoutError(captureError)) {
              throw captureError;
            }
            captureErrors.push({
              variant: "visible-capture-after-render-timeout",
              error: String(captureError && captureError.message ? captureError.message : captureError),
              renderScale: 0
            });
            emitDebug("pdf:ocr:page:render-fallback-capture:error", {
              pageNumber,
              error: String(captureError && captureError.message ? captureError.message : captureError),
              originalError: String(pageError && pageError.message ? pageError.message : pageError)
            });
          }
        }
        if (recoveredByVisibleCapture) {
          onProgress({
            loaded: pageNumber,
            total: pageLimit,
            percent: Math.min(96, Math.max(12, Math.round(12 + (pageNumber / Math.max(1, pageLimit)) * 84))),
            phase: "ocr",
            mode: plan.mode,
            source: "visible-capture"
          });
          continue;
        }
        pageDiagnostics.push({
          pageNumber,
          words: 0,
          lines: 0,
          source: "ocr",
          confidence: 0,
          recognitionVariant: "page-error",
          renderScale: 0,
          error: String(pageError && pageError.message ? pageError.message : pageError)
        });
        emitDebug("pdf:ocr:page:error", {
          pageNumber,
          error: String(pageError && pageError.message ? pageError.message : pageError),
          diagnosis: "This page could not be rendered or recognized. Check canvas rendering, Tesseract/TextDetector loading, page size, or image quality."
        });
      }
      assertPdfOcrNotCancelled(attemptId);
      onProgress({
        loaded: pageNumber,
        total: pageLimit,
        percent: Math.min(96, Math.max(12, Math.round(12 + (pageNumber / Math.max(1, pageLimit)) * 84))),
        phase: "ocr",
        mode: plan.mode,
        message: plan.message
      });
    }

    const text = pages.map((page) => page.text).join("\n\n").trim();
    const quality = getPdfOcrQuality({
      text,
      pages,
      words: totalWords,
      confidence: confidencePages ? Math.round(confidenceTotal / confidencePages) : 0,
      pageDiagnostics
    });
    const blankCanvasFailure = totalWords === 0 && pageDiagnostics.some((diagnostic) => diagnostic && diagnostic.blankOrUnreadableCanvas && diagnostic.canvasStats && diagnostic.canvasStats.blankPageLikely);
    emitDebug("pdf:ocr:complete", {
      numPages,
      pagesRead,
      pagesWithText: pages.length,
      words: totalWords,
      quality: quality.quality,
      qualityScore: quality.score,
      qualityMessage: quality.message,
      pageDiagnostics,
      durationMs: Date.now() - startedAt,
      partial: numPages > pagesRead,
      errorKind: blankCanvasFailure ? "ocr-blank-canvas" : ""
    });
    runtime.pdfOcr.lastDiagnostics = pageDiagnostics.slice(0, 12);
    return {
      pages,
      text,
      rawText: pages.map((page) => page.rawText || page.text || "").join("\n\n").trim(),
      reconstructedText: text,
      ocrTextQuality: evaluatePdfOcrTextQuality({
        text,
        lines: pages.flatMap((page) => page.lines || []),
        words: totalWords,
        confidence: confidencePages ? Math.round(confidenceTotal / confidencePages) : 0
      }, getPdfOcrStructureCompleteness({ text, pages, words: totalWords, source: "ocr" })),
      numPages,
      pagesRead,
      words: totalWords,
      partial: numPages > pagesRead,
      durationMs: Date.now() - startedAt,
      source: "ocr",
      ocrQuality: quality.quality,
      qualityScore: quality.score,
      qualityMessage: blankCanvasFailure ? publicPdfErrorMessage("ocr-blank-canvas", true) : quality.message,
      confidence: confidencePages ? Math.round(confidenceTotal / confidencePages) : 0,
      pageDiagnostics,
      adaptiveMode: plan.mode,
      adaptiveDevice: plan.device,
      fingerprint,
      errorKind: blankCanvasFailure ? "ocr-blank-canvas" : ""
    };
  }


  async function canvasFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      try {
        const image = new Image();
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, image.naturalWidth || image.width || 1);
            canvas.height = Math.max(1, image.naturalHeight || image.height || 1);
            const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
            if (!context) {
              reject(new Error("Canvas context unavailable for visible OCR capture."));
              return;
            }
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0);
            resolve(canvas);
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error("Visible OCR capture image could not be loaded."));
        image.src = dataUrl;
      } catch (error) {
        reject(error);
      }
    });
  }

  async function extractPdfTextWithVisibleViewportOcr(sourceUrl, options = {}) {
    const startedAt = Date.now();
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const device = getPdfOcrDeviceProfile();
    const attemptId = Number(options.attemptId) || runtime.pdfOcr && runtime.pdfOcr.activeAttemptId || 0;
    assertPdfOcrNotCancelled(attemptId);
    await waitForPdfOcrIdle("ultra-fast:start", attemptId, 18);
    const pageDiagnostics = [];
    onProgress({
      loaded: 0,
      total: 1,
      percent: 12,
      phase: "ocr",
      mode: "ultra-fast",
      source: "visible-capture",
      device,
      message: PDF_OCR_RUNNING_MESSAGE
    });
    emitDebug("pdf:ocr:ultra-fast:start", {
      sourceUrl,
      device,
      exactIssue: "On low-power devices, SkimRoute tries the visible PDF viewport before heavier PDF.js page rendering. This is faster and avoids leaving users stuck on Checking this page."
    });
    try {
      assertPdfOcrNotCancelled(attemptId);
      await waitForPdfOcrIdle("ultra-fast:before-capture", attemptId, 22);
      const captureDataUrl = await requestVisibleTabCapture();
      assertPdfOcrNotCancelled(attemptId);
      await waitForPdfOcrIdle("ultra-fast:after-capture", attemptId, 18);
      emitDebug("pdf:ocr:ultra-fast:capture", {
        bytes: captureDataUrl.length,
        device
      });
      const variants = [];
      try {
        const canvas = await canvasFromDataUrl(captureDataUrl);
        await waitForPdfOcrIdle("ultra-fast:before-preprocess", attemptId, 18);
        const fastCrop = makeCanvasOcrVariant(canvas, 1, "ultra-fast-crop-threshold");
        await waitForPdfOcrIdle("ultra-fast:preprocess-gap", attemptId, 12);
        const fastContrast = makeCanvasOcrVariant(canvas, 1, "ultra-fast-crop-contrast");
        if (fastCrop && fastCrop.dataUrl) variants.push({ label: "ultra-fast-crop-threshold", dataUrl: fastCrop.dataUrl, rendered: { scale: 0, visibleCapture: true } });
        if (fastContrast && fastContrast.dataUrl) variants.push({ label: "ultra-fast-crop-contrast", dataUrl: fastContrast.dataUrl, rendered: { scale: 0, visibleCapture: true } });
      } catch (variantError) {
        emitDebug("pdf:ocr:ultra-fast:preprocess-error", {
          error: String(variantError && variantError.message ? variantError.message : variantError)
        });
      }
      variants.push({ label: "ultra-fast-visible-raw", dataUrl: captureDataUrl, rendered: { scale: 0, visibleCapture: true } });
      let bestVariant = null;
      const variantErrors = [];
      const variantResults = [];
      for (const variant of variants.slice(0, device.slow ? 2 : 3)) {
        assertPdfOcrNotCancelled(attemptId);
        await waitForPdfOcrIdle(`ultra-fast:variant:${variant.label}`, attemptId, 16);
        onProgress({
          loaded: 0,
          total: 1,
          percent: 42,
          phase: "ocr",
          mode: "ultra-fast",
          source: "visible-capture",
          message: PDF_OCR_RUNNING_MESSAGE
        });
        const result = await tryPdfOcrVariant(1, variant, bestVariant, variantErrors, variantResults);
        if (isBetterPdfOcrVariant(result, bestVariant)) bestVariant = result;
        if (bestVariant) {
          const interimDecision = getPdfOcrImmediateReturnDecision({
            pages: [{ pageNumber: 1, text: bestVariant.text, words: bestVariant.words, lines: bestVariant.lines || [], source: "visible-capture", confidence: bestVariant.confidence, recognitionVariant: bestVariant.recognitionVariant, ocrVariantName: bestVariant.ocrVariantName }],
            text: bestVariant.text,
            words: bestVariant.words,
            confidence: bestVariant.confidence,
            source: "ocr",
            adaptiveMode: "ultra-fast",
            ocrTextQuality: bestVariant.ocrTextQuality
          }, getPdfDocumentRouteKey(), "fast");
          if (interimDecision.strong) break;
        }
      }
      const cleanText = String(bestVariant && bestVariant.text || "").trim();
      const words = countPdfWords(cleanText);
      const lines = bestVariant && bestVariant.lines || pdfOcrLinesFromText(cleanText);
      const confidence = bestVariant && bestVariant.confidence || 0;
      const immediateDecision = getPdfOcrImmediateReturnDecision({
        pages: cleanText ? [{ pageNumber: 1, text: cleanText, words, lines, source: "visible-capture", confidence, recognitionVariant: bestVariant && bestVariant.recognitionVariant || "visible-capture", ocrVariantName: bestVariant && bestVariant.ocrVariantName || bestVariant && bestVariant.recognitionVariant || "visible-capture" }] : [],
        text: cleanText,
        words,
        confidence,
        source: "ocr",
        adaptiveMode: "ultra-fast",
        ocrTextQuality: bestVariant && bestVariant.ocrTextQuality || null
      }, getPdfDocumentRouteKey(), "fast");
      if (bestVariant) emitPdfOcrSelectedVariant(1, bestVariant, { mode: "ultra-fast" });
      pageDiagnostics.push({
        pageNumber: 1,
        words,
        lines: lines.length,
        source: "visible-capture",
        confidence,
        recognitionVariant: bestVariant && bestVariant.recognitionVariant || "none",
        ocrTextQuality: immediateDecision.ocrTextQuality || bestVariant && bestVariant.ocrTextQuality || null,
        immediateReturn: Boolean(immediateDecision.strong),
        provisional: Boolean(immediateDecision.provisional),
        variantResults,
        variantErrors
      });
      const pages = cleanText ? [{ pageNumber: 1, text: cleanText, words, lines, source: "visible-capture", confidence, recognitionVariant: bestVariant && bestVariant.recognitionVariant || "visible-capture", ocrVariantName: bestVariant && bestVariant.ocrVariantName || bestVariant && bestVariant.recognitionVariant || "visible-capture" }] : [];
      const quality = getPdfOcrQuality({ text: cleanText, pages, words, confidence, pageDiagnostics });
      emitDebug("pdf:ocr:ultra-fast:complete", {
        words,
        lines: lines.length,
        confidence,
        quality: quality.quality,
        qualityScore: quality.score,
        ocrTextQuality: immediateDecision.ocrTextQuality || null,
        immediateReturn: Boolean(immediateDecision.strong),
        provisional: Boolean(immediateDecision.provisional),
        sample: cleanText.slice(0, 260),
        pageDiagnostics,
        exactIssue: words > 0
          ? "Ultra Fast OCR recovered at least partial text from the visible PDF viewport."
          : "Ultra Fast OCR ran, but the visible viewport still did not produce readable text."
      });
      onProgress({
        loaded: 1,
        total: 1,
        percent: 96,
        phase: "ocr",
        mode: "ultra-fast",
        source: "visible-capture",
        message: words > 0 ? "OCR finished. SkimRoute found readable text and built a page map." : PDF_OCR_UNREADABLE_MESSAGE
      });
      return {
        pages,
        text: cleanText,
        numPages: 1,
        pagesRead: 1,
        words,
        partial: true,
        durationMs: Date.now() - startedAt,
        source: "ocr",
        ocrQuality: quality.quality,
        qualityScore: quality.score,
        qualityMessage: quality.message,
        confidence,
        ocrTextQuality: immediateDecision.ocrTextQuality || null,
        pageDiagnostics,
        adaptiveMode: "ultra-fast",
        adaptiveDevice: device,
        visibleCapture: true
      };
    } catch (error) {
      if (isPdfOcrCancellationError(error)) {
        throw error;
      }
      const message = String(error && error.message ? error.message : error);
      emitDebug("pdf:ocr:ultra-fast:error", {
        error: message,
        exactIssue: "Visible viewport OCR could not run. SkimRoute will fall back to PDF.js page rendering."
      });
      return {
        pages: [],
        text: "",
        numPages: 1,
        pagesRead: 0,
        words: 0,
        partial: true,
        durationMs: Date.now() - startedAt,
        source: "ocr",
        ocrQuality: "unreadable",
        qualityScore: 0,
        qualityMessage: PDF_OCR_UNREADABLE_MESSAGE,
        confidence: 0,
        pageDiagnostics: [{ pageNumber: 1, words: 0, lines: 0, source: "visible-capture", error: message }],
        adaptiveMode: "ultra-fast",
        adaptiveDevice: device,
        visibleCapture: true,
        error: message
      };
    }
  }

  async function extractPdfTextWithAdaptiveOcr(sourceUrl, options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const device = getPdfOcrDeviceProfile();
    const requestedMode = getManualPdfOcrMode(options.mode || "fast");
    const attemptId = Number(options.attemptId) || runtime.pdfOcr && runtime.pdfOcr.activeAttemptId || 0;
    const routeKey = options.routeKey || getPdfDocumentRouteKey();
    assertPdfOcrNotCancelled(attemptId);
    if (requestedMode === "better") {
      const betterPlan = getPdfOcrPlan("better");
      onProgress({ loaded: 0, total: betterPlan.maxPages, percent: 8, phase: "ocr", mode: "better", device, message: PDF_OCR_BETTER_EXPECTATION_MESSAGE });
      emitDebug("pdf:ocr:adaptive:manual-better-start", {
        device,
        betterPlan,
        exactIssue: "User explicitly requested Better OCR. SkimRoute will run the slower OCR pass, but cancellation remains available."
      });
      return extractPdfTextWithPageOcr(sourceUrl, { onProgress, mode: "better", plan: betterPlan, routeKey, attemptId });
    }
    const fastPlan = getPdfOcrPlan(requestedMode === "smart" && !device.slow ? "smart" : "fast");
    onProgress({
      loaded: 0,
      total: fastPlan.maxPages,
      percent: 8,
      phase: "ocr",
      mode: fastPlan.mode,
      device,
      message: PDF_OCR_FAST_EXPECTATION_MESSAGE
    });
    emitDebug("pdf:ocr:adaptive:start", {
      device,
      firstMode: fastPlan.mode,
      requestedMode,
      exactIssue: "SkimRoute runs a bounded OCR pass only after user action. Better OCR is explicit so low-end devices do not get stuck on Checking this page."
    });
    let ultraFastResult = null;
    if (device.slow || fastPlan.viewportFirst) {
      ultraFastResult = await extractPdfTextWithVisibleViewportOcr(sourceUrl, { onProgress, attemptId });
      const ultraWords = Number(ultraFastResult && ultraFastResult.words) || countPdfWords(ultraFastResult && ultraFastResult.text || "");
      const ultraDecision = getPdfOcrImmediateReturnDecision(ultraFastResult, routeKey, fastPlan.mode);
      if (ultraDecision.strong) {
        emitDebug("pdf:ocr:adaptive:ultra-fast-selected", {
          words: ultraWords,
          quality: ultraFastResult.ocrQuality || "",
          qualityScore: ultraFastResult.qualityScore || 0,
          confidence: ultraDecision.confidence,
          lineCount: ultraDecision.lineCount,
          ocrTextQuality: ultraDecision.ocrTextQuality || null,
          device,
          note: "Ultra Fast visible-page OCR produced complete readable text, so SkimRoute returns it instead of forcing heavier OCR on a low-power device."
        });
        return ultraFastResult;
      }
      emitDebug("pdf:ocr:adaptive:ultra-fast-low-text", {
        words: ultraWords,
        quality: ultraFastResult && ultraFastResult.ocrQuality || "",
        qualityScore: ultraFastResult && ultraFastResult.qualityScore || 0,
        confidence: ultraDecision.confidence,
        lineCount: ultraDecision.lineCount,
        ocrTextQuality: ultraDecision.ocrTextQuality || null,
        device,
        note: "Ultra Fast OCR was incomplete or suspicious, so SkimRoute is falling back to lightweight PDF page OCR."
      });
    }
    assertPdfOcrNotCancelled(attemptId);
    const fastResult = await extractPdfTextWithPageOcr(sourceUrl, { onProgress, mode: fastPlan.mode, plan: fastPlan, routeKey, attemptId });
    const fastWords = Number(fastResult && fastResult.words) || countPdfWords(fastResult && fastResult.text || "");
    if (fastWords >= PDF_RECOVERY_MIN_WORDS && !shouldRunBetterPdfOcrAfterFast(fastResult)) {
      emitDebug("pdf:ocr:adaptive:fast-complete", {
        words: fastWords,
        quality: fastResult.ocrQuality || "",
        qualityScore: fastResult.qualityScore || 0,
        device,
        note: "Fast/Smart OCR produced enough text, so SkimRoute is returning a map immediately."
      });
      return fastResult;
    }
    if (!shouldRunBetterPdfOcrAfterFast(fastResult)) {
      if (requestedMode !== "better" && fastWords < PDF_RECOVERY_MIN_WORDS) {
        runtime.pdfOcr.betterAvailableForRoute = getRouteCacheKey();
        emitDebug("pdf:ocr:adaptive:better-available", {
          fastWords,
          fastQuality: fastResult && fastResult.ocrQuality || "",
          device,
          exactIssue: "Fast OCR was weak or failed. Better OCR is available as an explicit user action, but SkimRoute will not run it automatically."
        });
      }
      emitDebug("pdf:ocr:adaptive:better-skipped", {
        words: fastWords,
        quality: fastResult && fastResult.ocrQuality || "",
        qualityScore: fastResult && fastResult.qualityScore || 0,
        device,
        exactIssue: device.slow
          ? "This device looks low-powered, so SkimRoute skipped Better OCR to avoid long hangs."
          : "Fast OCR did not produce enough usable text to justify a slower Better OCR pass."
      });
      if (fastResult) {
        fastResult.qualityMessage = fastResult.qualityMessage || (device.slow
          ? "Fast OCR finished, but this scan needs a clearer image or a faster device for Better OCR."
          : PDF_OCR_UNREADABLE_MESSAGE);
      }
      const fastResultWords = Number(fastResult && fastResult.words) || countPdfWords(fastResult && fastResult.text || "");
      const ultraResultWords = Number(ultraFastResult && ultraFastResult.words) || countPdfWords(ultraFastResult && ultraFastResult.text || "");
      const ultraKeepDecision = getPdfOcrImmediateReturnDecision(ultraFastResult, routeKey, fastPlan.mode);
      const fastKeepDecision = getPdfOcrImmediateReturnDecision(fastResult, routeKey, fastPlan.mode);
      const ultraCandidate = getPdfOcrResultPrimaryCandidate(ultraFastResult);
      const fastCandidate = getPdfOcrResultPrimaryCandidate(fastResult);
      if (ultraFastResult && ultraResultWords > fastResultWords && ultraKeepDecision.strong && isBetterPdfOcrVariant(ultraCandidate, fastCandidate)) {
        emitDebug("pdf:ocr:adaptive:ultra-fast-kept-after-fast", {
          ultraResultWords,
          fastResultWords,
          ultraTextQuality: ultraKeepDecision.ocrTextQuality || null,
          fastTextQuality: fastKeepDecision.ocrTextQuality || null,
          device,
          note: "The lightweight visible-page OCR result was better than the heavier PDF.js OCR result, so SkimRoute kept the visible-page result."
        });
        return ultraFastResult;
      }
      return fastResult;
    }
    runtime.pdfOcr.betterAvailableForRoute = getRouteCacheKey();
    emitDebug("pdf:ocr:adaptive:better-available", {
      fastWords,
      fastQuality: fastResult && fastResult.ocrQuality || "",
      device,
      exactIssue: "Fast OCR was weak. SkimRoute will offer Better OCR as an explicit user action instead of running it automatically."
    });
    if (fastResult) {
      fastResult.qualityMessage = fastResult.qualityMessage || PDF_OCR_BETTER_EXPECTATION_MESSAGE;
    }
    return fastResult;
  }

  async function extractPdfTextRecovery(reason, routeKey, options = {}) {
    const sourceUrl = getPdfSourceUrl();
    const allowOcr = Boolean(options.allowOcr);
    const fullText = Boolean(options.fullText);
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const attemptId = Number(options.attemptId) || runtime.pdfOcr && runtime.pdfOcr.activeAttemptId || 0;
    const ocrMode = allowOcr ? getManualPdfOcrMode(options.mode || "fast") : "";
    let extraction = { pages: [], text: "", source: "pdfjs" };
    let extractionError = "";
    let extractionErrorKind = "";

    try {
      assertPdfOcrNotCancelled(attemptId);
      await waitForPdfOcrIdle("pdfjs-extract:start", attemptId, 12);
      const fastPass = !allowOcr && !fullText;
      extraction = await extractPdfTextWithPdfJs(sourceUrl, {
        timeoutMs: allowOcr ? Math.max(8000, PDF_TEXT_EXTRACTION_TIMEOUT_MS / 2) : fullText ? PDF_TEXT_EXTRACTION_TIMEOUT_MS : PDF_TEXT_FAST_EXTRACTION_TIMEOUT_MS,
        pageTimeoutMs: allowOcr || fullText ? PDF_TEXT_PAGE_TIMEOUT_MS : PDF_TEXT_FAST_PAGE_TIMEOUT_MS,
        maxPages: allowOcr ? Math.min(PDF_MAX_TEXT_PAGES, PDF_FAST_TEXT_PAGES) : fullText ? PDF_MAX_TEXT_PAGES : PDF_FAST_TEXT_PAGES,
        stopAfterReady: fastPass,
        readyWords: PDF_FAST_READY_WORDS,
        readyPages: PDF_FAST_READY_PAGES,
        routeKey,
        attemptId,
        onProgress
      });
      emitDebug("pdf:extract:complete", {
        reason,
        routeKey,
        allowOcr,
        source: extraction.source || "pdfjs",
        pagesRead: extraction.pagesRead || (Array.isArray(extraction.pages) ? extraction.pages.length : 0),
        numPages: extraction.numPages || 0,
        words: extraction.words || countPdfWords(extraction.text || ""),
        partial: Boolean(extraction.partial),
        durationMs: extraction.durationMs || 0
      });
    } catch (error) {
      if (isPdfOcrCancellationError(error)) {
        throw error;
      }
      extractionError = String(error && error.message ? error.message : error);
      extractionErrorKind = error && error.pdfErrorKind ? error.pdfErrorKind : getPdfErrorKind(error, allowOcr);
      emitDebug("pdf:extract:error", {
        reason,
        routeKey,
        error: extractionError,
        errorKind: extractionErrorKind,
        allowOcr
      });
    }

    const extracted = String(extraction && extraction.text ? extraction.text : "").trim();
    const extractedWords = countPdfWords(extracted);
    if (extractedWords >= PDF_RECOVERY_MIN_WORDS) {
      return {
        text: extracted,
        pages: Array.isArray(extraction.pages) ? extraction.pages : [],
        source: "pdfjs",
        words: extractedWords,
        pagesRead: extraction.pagesRead || (Array.isArray(extraction.pages) ? extraction.pages.length : 0),
        partial: Boolean(extraction.partial),
        numPages: extraction.numPages || 0,
        durationMs: extraction.durationMs || 0,
        fingerprint: extraction.fingerprint || null,
        errorKind: ""
      };
    }

    if (!allowOcr) {
      const errorKind = extractionErrorKind || "scanned";
      return {
        text: extracted,
        pages: Array.isArray(extraction.pages) ? extraction.pages : [],
        source: "pdfjs",
        words: extractedWords,
        pagesRead: extraction.pagesRead || (Array.isArray(extraction.pages) ? extraction.pages.length : 0),
        partial: Boolean(extraction.partial),
        numPages: extraction.numPages || 0,
        durationMs: extraction.durationMs || 0,
        fingerprint: extraction.fingerprint || null,
        error: extractionError || publicPdfErrorMessage(errorKind, false),
        errorKind
      };
    }

    if (!supportsPdfOcr()) {
      return {
        text: extracted,
        pages: Array.isArray(extraction.pages) ? extraction.pages : [],
        source: "pdfjs",
        words: extractedWords,
        pagesRead: extraction.pagesRead || (Array.isArray(extraction.pages) ? extraction.pages.length : 0),
        partial: Boolean(extraction.partial),
        numPages: extraction.numPages || 0,
        durationMs: extraction.durationMs || 0,
        fingerprint: extraction.fingerprint || null,
        error: extractionError || "OCR support is unavailable.",
        errorKind: extractionErrorKind || "ocr"
      };
    }

    try {
      assertPdfOcrNotCancelled(attemptId);
      await waitForPdfOcrIdle("ocr-fallback:start", attemptId, 18);
      onProgress({ loaded: 0, total: PDF_OCR_MAX_PAGES, percent: 8, phase: "ocr" });
      const ocrPreflight = await runPdfOcrPreflight({ loadModule: !getPdfOcrPreflightSnapshot().hasTextDetector });
      if (!ocrPreflight.supported || (ocrPreflight.moduleError && !ocrPreflight.hasTextDetector)) {
        const preflightError = new Error(ocrPreflight.exactIssue || ocrPreflight.moduleError || "OCR support is unavailable.");
        preflightError.pdfErrorKind = "ocr-unavailable";
        throw preflightError;
      }
      emitDebug("pdf:ocr:fallback:start", {
        reason,
        routeKey,
        extractedWords,
        priorErrorKind: extractionErrorKind || "",
        preflight: {
          hasTextDetector: ocrPreflight.hasTextDetector,
          hasRuntimeUrls: ocrPreflight.hasRuntimeUrls,
          moduleLoaded: ocrPreflight.moduleLoaded,
          moduleError: ocrPreflight.moduleError || ""
        },
        note: "Selectable PDF text was insufficient, so SkimRoute is rendering PDF pages and running OCR."
      });
      const ocrTimeoutMs = getPdfOcrAttemptTimeoutMs(ocrMode);
      const ocrExtraction = await racePdfOcrTimeout(
        extractPdfTextWithAdaptiveOcr(sourceUrl, { onProgress, mode: ocrMode, routeKey, attemptId }),
        { timeoutMs: ocrTimeoutMs, mode: ocrMode, currentStep: "ocr-fallback", startedAt: runtime.pdfOcr && runtime.pdfOcr.analysisStartedAt || Date.now(), ocrRunId: attemptId }
      );
      const ocrText = String(ocrExtraction && ocrExtraction.text || "").trim();
      const merged = mergeOcrText(extracted, ocrText);
      const mergedWords = countPdfWords(merged);
      emitDebug("pdf:ocr:fallback:complete", {
        reason,
        routeKey,
        words: mergedWords,
        ocrWords: countPdfWords(ocrText),
        pagesRead: ocrExtraction && ocrExtraction.pagesRead || 0,
        pagesWithText: Array.isArray(ocrExtraction && ocrExtraction.pages) ? ocrExtraction.pages.length : 0,
        partial: Boolean(ocrExtraction && ocrExtraction.partial),
        ocrQuality: ocrExtraction && ocrExtraction.ocrQuality || "",
        qualityScore: ocrExtraction && ocrExtraction.qualityScore || 0
      });
      return {
        text: merged,
        pages: ocrText
          ? (Array.isArray(ocrExtraction.pages) ? ocrExtraction.pages : [{ pageNumber: 1, text: merged, lines: pdfOcrLinesFromText(merged), source: "ocr" }])
          : Array.isArray(extraction.pages) ? extraction.pages : [],
        source: ocrText ? "ocr" : "pdfjs",
        words: mergedWords,
        pagesRead: ocrExtraction && ocrExtraction.pagesRead || (ocrText ? 1 : extraction.pagesRead || 0),
        partial: Boolean(ocrExtraction && ocrExtraction.partial) || (!ocrText && Boolean(extraction.partial)),
        numPages: ocrExtraction && ocrExtraction.numPages || extraction.numPages || 0,
        durationMs: ocrExtraction && ocrExtraction.durationMs || 0,
        error: extractionError || "",
        errorKind: ocrText ? "" : (ocrExtraction && ocrExtraction.errorKind || extractionErrorKind || "ocr"),
        ocrQuality: ocrExtraction && ocrExtraction.ocrQuality || "",
        qualityScore: ocrExtraction && ocrExtraction.qualityScore || 0,
        qualityMessage: ocrExtraction && ocrExtraction.qualityMessage || "",
        confidence: ocrExtraction && ocrExtraction.confidence || 0,
        pageDiagnostics: ocrExtraction && ocrExtraction.pageDiagnostics || [],
        fingerprint: extraction.fingerprint || ocrExtraction && ocrExtraction.fingerprint || null
      };
    } catch (ocrError) {
      if (isPdfOcrCancellationError(ocrError) || isPdfOcrTimeoutError(ocrError)) {
        throw ocrError;
      }
      const errorText = String(ocrError && ocrError.message ? ocrError.message : ocrError);
      const ocrErrorKind = ocrError && ocrError.pdfErrorKind
        ? ocrError.pdfErrorKind
        : getPdfErrorKind(ocrError, true) || "ocr";
      emitDebug("pdf:ocr:fallback:error", {
        reason,
        routeKey,
        error: errorText,
        errorKind: ocrErrorKind,
        priorError: extractionError || "",
        diagnosis: "PDF page OCR failed before enough text was recovered. Check Tesseract files, canvas rendering, capture permissions, huge pages, or image quality."
      });
      return {
        text: extracted,
        pages: Array.isArray(extraction.pages) ? extraction.pages : [],
        source: "pdfjs",
        words: extractedWords,
        pagesRead: extraction.pagesRead || (Array.isArray(extraction.pages) ? extraction.pages.length : 0),
        partial: Boolean(extraction.partial),
        numPages: extraction.numPages || 0,
        durationMs: extraction.durationMs || 0,
        error: errorText,
        errorKind: ocrErrorKind,
        fingerprint: extraction.fingerprint || null
      };
    }
  }

  function runManualPdfOcr(mode = "fast") {
    const routeKey = getRouteCacheKey();
    const ocrMode = getManualPdfOcrMode(mode);
    emitDebug("pdf:ocr:manual-click", {
      routeKey,
      mode: ocrMode,
      isPdfRoute: isPdfRouteLocked(),
      isPdfLike: isPdfLikePage(),
      hasModel: Boolean(runtime.model),
      currentState: runtime.pdfOcr && runtime.pdfOcr.state || "",
      supported: supportsPdfOcr(),
      note: "User clicked Run OCR. SkimRoute should immediately enter OCR mode or log why it cannot."
    });
    emitDebug("pdf:ocr:manual-start", {
      routeKey,
      mode: ocrMode,
      isPdfRoute: isPdfRouteLocked(),
      isPdfLike: isPdfLikePage(),
      pending: Boolean(runtime.pdfOcr && runtime.pdfOcr.pending),
      retrying: Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying),
      exactIssue: "none"
    });

    if (!(isPdfRouteLocked() || isPdfLikePage())) {
      emitDebug("pdf:ocr:manual-blocked", {
        routeKey,
        exactIssue: "The current tab is not recognized as a PDF route/page, so OCR was not started."
      });
      return false;
    }

    if (!runtime.model) {
      emitDebug("pdf:ocr:manual-no-model", {
        routeKey,
        mode: ocrMode,
        exactIssue: "The OCR button was clicked before SkimRoute had a model. Running a scan first, then OCR will be retried."
      });
      scanPage("manual-ocr-preflight");
      window.setTimeout(() => runManualPdfOcr(ocrMode), 450);
      return true;
    }

    if (!supportsPdfOcr()) {
      runtime.pdfOcr.lastError = "OCR support is unavailable in this browser/package.";
      runtime.pdfOcr.errorKind = "ocr-unavailable";
      runtime.pdfOcr.needsPrompt = true;
      runtime.pdfOcr.state = "ocr-failed";
      runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, {
        state: "ocr-prompt",
        bestLabel: "OCR unavailable",
        confidenceLabel: "OCR issue"
      });
      render();
      emitDebug("pdf:ocr:manual-blocked", {
        routeKey,
        exactIssue: "supportsPdfOcr() returned false. TextDetector/Tesseract/runtime URLs are not available."
      });
      return false;
    }

    runtime.pdfOcr.recommendedMode = ocrMode;
    schedulePdfRecoveryAttempt("manual", { allowOcr: true, force: true, mode: ocrMode });
    return true;
  }

  function useCachedPdfSnapshotBeforeRecovery(routeKey, reason, baseModel) {
    const snapshot = getUsablePdfSnapshotForRoute(routeKey, `recovery-preflight:${reason}`, baseModel || runtime.model);
    if (!snapshot || !snapshot.model) return false;
    window.clearTimeout(runtime.pdfOcr.retryTimer);
    runtime.pdfOcr.pending = false;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.retryTimer = null;
    runtime.pdfOcr.completedForRoute = routeKey;
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.progress = 100;
    runtime.pdfOcr.source = snapshot.source;
    runtime.pdfOcr.words = Number(snapshot.model.totalReadableWords || 0);
    runtime.pdfOcr.pages = runtime.pdfOcr.pages || 0;
    runtime.pdfOcr.state = "ready";
    runtime.pdfOcr.cacheHit = Boolean(runtime.pdfOcr.cacheHit || snapshot.model.diagnostics && snapshot.model.diagnostics.recoveredPdfCacheHit);
    runtime.pdfOcr.cacheSource = runtime.pdfOcr.cacheSource || snapshot.model.diagnostics && snapshot.model.diagnostics.recoveredPdfCacheSource || snapshot.source;
    runtime.pdfOcr.cacheUpdatedAt = runtime.pdfOcr.cacheUpdatedAt || snapshot.model.diagnostics && snapshot.model.diagnostics.recoveredPdfCacheUpdatedAt || Date.now();
    stopPdfAnalysisWatchdog();
    runtime.model = snapshot.model;
    if (runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf") {
      rememberStablePdfModel(runtime.model, `recovery-preflight:${reason}:${snapshot.source}`);
    }
    emitDebug("pdf:analysis:cache-skip", {
      reason,
      routeKey,
      source: snapshot.source,
      words: runtime.pdfOcr.words,
      exactIssue: "SkimRoute found a usable same-route PDF map before starting PDF.js/OCR, so it reused the map immediately."
    });
    render();
    publishStatusUpdate("pdf:analysis:cache-skip");
    return true;
  }

  function schedulePdfRecoveryAttempt(reason, options = {}) {
    if (!(isPdfRouteLocked() || isPdfLikePage()) || !runtime.model) return;
    const routeKey = getRouteCacheKey();
    emitPdfCachePreflight(`recovery:${reason}:preflight`, routeKey, {
      allowOcr: Boolean(options.allowOcr),
      force: Boolean(options.force),
      attemptedForRoute: runtime.pdfOcr && runtime.pdfOcr.attemptedForRoute || "",
      completedForRoute: runtime.pdfOcr && runtime.pdfOcr.completedForRoute || ""
    });
    const words = Number(runtime.model.totalReadableWords || 0);
    const pageType = runtime.model.pageProfile && runtime.model.pageProfile.type;
    const allowOcr = Boolean(options.allowOcr);
    const force = Boolean(options.force || allowOcr || reason === "manual");
    if (useCachedPdfSnapshotBeforeRecovery(routeKey, reason, runtime.model)) {
      emitDebug("pdf:analysis:skipped-cache", {
        reason,
        routeKey,
        exactIssue: "A usable cached/stable PDF map existed before recovery, so SkimRoute did not start PDF.js extraction or OCR."
      });
      return true;
    }
    const alreadyDone = runtime.pdfOcr.completedForRoute === routeKey;
    const alreadyPending = runtime.pdfOcr.pending && runtime.pdfOcr.attemptedForRoute === routeKey;
    const tooSoon = runtime.pdfOcr.lastAttemptAt && Date.now() - runtime.pdfOcr.lastAttemptAt < 3500;
    if (alreadyPending) {
      emitDebug("pdf:analysis:dedupe", {
        reason,
        routeKey,
        attemptId: runtime.pdfOcr.activeAttemptId,
        exactIssue: "A PDF recovery/OCR job is already running for this route. Popup and sidebar will share the same in-flight result."
      });
      return runtime.pdfOcr.activePromise || true;
    }
    if (alreadyDone && !force) return;
    if (tooSoon && !force) return;
    if (pageType !== "pdf" && !isPdfRouteLocked()) return;
    if (words >= PDF_RECOVERY_MIN_WORDS && !allowOcr) return;

    if (isLocalFileUrl(routeKey)) {
      requestPdfFileAccessStatus();
    }
    if (!options.retry) {
      window.clearTimeout(runtime.pdfOcr.retryTimer);
      runtime.pdfOcr.retryTimer = null;
      runtime.pdfOcr.retrying = false;
      runtime.pdfOcr.retryStartedAt = Date.now();
      runtime.pdfOcr.retryCount = 0;
    }

    runtime.pdfOcr.pending = true;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.attemptedForRoute = routeKey;
    runtime.pdfOcr.completedForRoute = "";
    runtime.pdfOcr.lastAttemptAt = Date.now();
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.lastDiagnostics = [];
    runtime.pdfOcr.cancelRequested = false;
    runtime.pdfOcr.cancelAttemptId = 0;
    runtime.pdfOcr.lastLongRunningNoticeAt = 0;
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.progress = 0;
    runtime.pdfOcr.source = "";
    runtime.pdfOcr.cacheHit = false;
    runtime.pdfOcr.cacheSource = "";
    runtime.pdfOcr.cacheUpdatedAt = 0;
    const requestedMode = allowOcr ? getManualPdfOcrMode(options.mode || runtime.pdfOcr.recommendedMode || "fast") : "";
    runtime.pdfOcr.progressMessage = allowOcr
      ? requestedMode === "better"
        ? PDF_OCR_BETTER_EXPECTATION_MESSAGE
        : PDF_OCR_FAST_EXPECTATION_MESSAGE
      : PDF_OCR_DETECTION_MESSAGE;
    runtime.pdfOcr.mode = requestedMode;
    runtime.pdfOcr.slowDevice = false;
    runtime.pdfOcr.analysisStartedAt = Date.now();
    runtime.pdfOcr.words = 0;
    runtime.pdfOcr.pages = 0;
    runtime.pdfOcr.partial = false;
    runtime.pdfOcr.state = allowOcr ? "ocr" : "extracting";
    runtime.pdfOcr.supported = supportsPdfOcr();
    runtime.pdfOcr.currentStep = allowOcr ? "starting-ocr" : "extracting-text";
    runtime.pdfOcr.workerTerminated = false;
    runtime.pdfOcr.activeWorkerTerminated = false;
    runtime.pdfOcr.activeWorkerRunId = 0;
    runtime.pdfOcr.lastOcrProgressLogAt = 0;
    runtime.pdfOcr.finalDiagnostic = null;
    runtime.pdfOcr.finalized = false;
    runtime.pdfOcr.timedOut = false;
    runtime.pdfOcr.startedAt = runtime.pdfOcr.analysisStartedAt;
    let attemptId = 0;
    if (allowOcr) {
      attemptId = beginOcrRun({ mode: requestedMode, routeKey, reason });
    } else {
      attemptId = (runtime.pdfOcr.activeAttemptId || 0) + 1;
      runtime.pdfOcr.activeAttemptId = attemptId;
      runtime.pdfOcr.activeOcrRunId = 0;
    }
    runtime.pdfOcr.recommendedMode = requestedMode || runtime.pdfOcr.recommendedMode || "fast";
    runtime.model = buildPdfProcessingModel(
      runtime.model,
      allowOcr
        ? requestedMode === "better"
          ? PDF_OCR_BETTER_EXPECTATION_MESSAGE
          : PDF_OCR_FAST_EXPECTATION_MESSAGE
        : PDF_OCR_DETECTION_MESSAGE,
      runtime.pdfOcr.state
    );
    render();
    if (!allowOcr) {
      startPdfAnalysisWatchdog(reason, routeKey, allowOcr, attemptId);
    }

    emitDebug("pdf:analysis:start", {
      reason,
      routeKey,
      supported: runtime.pdfOcr.supported,
      words,
      allowOcr,
      quietReason: runtime.model.pageProfile.quietReason || runtime.model.pageProfile.reason || ""
    });

    const analysisPromise = extractPdfTextRecovery(reason, routeKey, {
      ...options,
      mode: requestedMode || options.mode,
      attemptId,
      onProgress: (event) => safeOcrProgress(attemptId, event, allowOcr)
    })
      .then(async (result) => {
        if (runtime.pdfOcr.cancelRequested && runtime.pdfOcr.cancelAttemptId === attemptId) {
          settlePdfOcrCancelled(routeKey, "late-result");
          return;
        }
        if (runtime.pdfOcr.activeAttemptId !== attemptId || runtime.pdfOcr.attemptedForRoute !== routeKey) {
          emitDebug("pdf:analysis:stale-result", {
            reason,
            routeKey,
            attemptId,
            activeAttemptId: runtime.pdfOcr.activeAttemptId
          });
          return;
        }
        const text = String(result && result.text ? result.text : "").trim();
        const textWords = countPdfWords(text);
        const source = result && result.source ? result.source : "pdfjs";
        const recoveredPages = normalizePdfRecoveryPages(result && result.pages);
        runtime.pdfOcr.lastDiagnostics = Array.isArray(result && result.pageDiagnostics) ? result.pageDiagnostics.slice(0, 12) : [];
        if (allowOcr || source === "ocr") {
          const rawOcrText = String(result && result.rawText || text);
          rememberRawPdfOcrText({
            ocrRunId: attemptId,
            routeKey,
            source,
            text: rawOcrText,
            pages: recoveredPages,
            wordCount: countPdfWords(rawOcrText),
            confidence: result && result.confidence || 0
          });
        }
        const recoveryUsable = isPdfRecoveryResultUsable(result, text, textWords);
        const recoveryCacheable = isPdfRecoveryResultCacheable(result, text, textWords);

        if (recoveryUsable && recoveryCacheable) {
          const cacheEntry = writePdfCacheEntry(routeKey, {
            text,
            pages: recoveredPages,
            updatedAt: Date.now(),
            source,
            partial: Boolean(result && result.partial),
            pagesRead: result && result.pagesRead || 0,
            words: textWords,
            numPages: result && result.numPages || 0,
            ocrQuality: result && result.ocrQuality || "",
            qualityScore: result && result.qualityScore || 0,
            qualityMessage: result && result.qualityMessage || "",
            confidence: result && result.confidence || 0,
            pageDiagnostics: result && result.pageDiagnostics || [],
            rawText: result && result.rawText || text,
            reconstructedText: result && result.reconstructedText || text,
            ocrTextQuality: result && result.ocrTextQuality || null,
            fingerprint: result && result.fingerprint || null,
            fileName: getPdfFileNameFromRoute(routeKey),
            ocrMode: result && (result.adaptiveMode || result.ocrMode) || runtime.pdfOcr.mode || ""
          });
          runtime.pdfOcr.lastRecoveredEntry = cacheEntry;
          window.clearTimeout(runtime.pdfOcr.retryTimer);
          runtime.pdfOcr.pending = false;
          runtime.pdfOcr.retrying = false;
          runtime.pdfOcr.retryTimer = null;
          runtime.pdfOcr.completedForRoute = routeKey;
          runtime.pdfOcr.lastError = "";
          runtime.pdfOcr.errorKind = "";
          runtime.pdfOcr.needsPrompt = false;
          runtime.pdfOcr.progress = 100;
          runtime.pdfOcr.source = cacheEntry && cacheEntry.source || source;
          runtime.pdfOcr.words = textWords;
          runtime.pdfOcr.pages = cacheEntry && (cacheEntry.pagesRead || cacheEntry.pages.length) || result && result.pagesRead || (Array.isArray(result && result.pages) ? result.pages.length : 0);
          runtime.pdfOcr.partial = Boolean(result && result.partial);
          runtime.pdfOcr.qualityState = cacheEntry && cacheEntry.ocrQuality || result && result.ocrQuality || "";
          runtime.pdfOcr.qualityScore = Number(cacheEntry && cacheEntry.qualityScore || result && result.qualityScore || 0);
          runtime.pdfOcr.qualityMessage = cacheEntry && cacheEntry.qualityMessage || result && result.qualityMessage || "";
          runtime.pdfOcr.state = "ready";
          stopPdfAnalysisWatchdog();
          emitDebug("pdf:analysis:success", {
            reason,
            routeKey,
            source,
            textWords,
            pagesRead: runtime.pdfOcr.pages,
            partial: runtime.pdfOcr.partial,
            qualityState: runtime.pdfOcr.qualityState,
            qualityScore: runtime.pdfOcr.qualityScore,
            selectionReason: cacheEntry && cacheEntry.qualityMessage || ""
          });
          if (allowOcr || source === "ocr") {
            emitDebug("pdf:ocr:terminal", {
              reason,
              routeKey,
              state: "ready",
              source,
              words: textWords,
              pagesRead: runtime.pdfOcr.pages,
              exactIssue: "none"
            });
          }
          await waitForPdfCachePersistence(routeKey);
          scanPage(source === "ocr" ? "pdf-ocr" : "pdf-text");
          const overwrittenByScanState = allowOcr && source === "ocr" && isPdfOcrStatusOverwrittenByScan(runtime.model);
          if (overwrittenByScanState) {
            const restored = getUsablePdfSnapshotForRoute(routeKey, `final-diagnostic-overwrite:${reason}`, runtime.model);
            if (restored && restored.model) {
              runtime.model = restored.model;
              rememberStablePdfModel(runtime.model, `final-diagnostic-overwrite:${reason}:${restored.source}`);
              render();
              publishStatusUpdate("pdf:ocr:status-overwrite-restored");
            }
          }
          if (allowOcr || source === "ocr") {
            const parserModel = runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf" ? runtime.model : null;
            const canRunBetter = normalizePdfOcrDiagnosticMode(runtime.pdfOcr.mode || result && result.adaptiveMode || "") === "fast" && textWords < PDF_OCR_WEAK_TEXT_WORDS;
            if (canRunBetter) runtime.pdfOcr.betterAvailableForRoute = routeKey;
            const finishDetails = {
              result,
              ocrRunId: attemptId,
              routeKey,
              mode: runtime.pdfOcr.mode || result && result.adaptiveMode || "",
              parserInputText: text,
              parserModel,
              parserOutputSections: parserModel && Array.isArray(parserModel.sections) ? parserModel.sections.length : 0,
              parserOutputWords: parserModel ? Number(parserModel.totalReadableWords || parserModel.totalWords || 0) : 0,
              cachedAsSuccess: true,
              canRunBetter,
              overwrittenByScanState
            };
            saveReadyPdfOcrState("analysis-success", {
              ...finishDetails,
              model: parserModel,
              cacheEntry,
              finalStatus: canRunBetter ? "weak_text" : "success"
            });
            finishOcrRun(inferPdfOcrFinalStatus(canRunBetter ? "weak_text" : "success", finishDetails), finishDetails);
            render();
          }
          await waitForPdfCachePersistence(routeKey);
          window.setTimeout(() => emitPdfGoalCheck("pdf:analysis:success"), 120);
          if (!allowOcr && source === "pdfjs" && runtime.pdfOcr.partial) {
            schedulePdfFullTextRefresh(routeKey, reason);
          }
          return;
        }

        if (text && recoveryCacheable) {
          writePdfCacheEntry(routeKey, {
            text,
            pages: recoveredPages,
            updatedAt: Date.now(),
            source,
            partial: Boolean(result && result.partial),
            pagesRead: result && result.pagesRead || 0,
            words: textWords,
            numPages: result && result.numPages || 0,
            ocrQuality: result && result.ocrQuality || "",
            qualityScore: result && result.qualityScore || 0,
            qualityMessage: result && result.qualityMessage || "",
            confidence: result && result.confidence || 0,
            pageDiagnostics: result && result.pageDiagnostics || [],
            fingerprint: result && result.fingerprint || null,
            fileName: getPdfFileNameFromRoute(routeKey),
            ocrMode: result && (result.adaptiveMode || result.ocrMode) || runtime.pdfOcr.mode || ""
          });
        } else if (allowOcr && text) {
          runtime.pdfOcr.betterAvailableForRoute = routeKey;
          emitDebug("pdf:ocr:weak-text-not-cached", {
            reason,
            routeKey,
            source,
            textWords,
            cacheMinWords: PDF_OCR_CACHE_MIN_WORDS,
            exactIssue: "OCR returned weak/partial text, so SkimRoute did not save it as a reusable ready PDF map. Better OCR remains available as a manual option."
          });
        }

        const rawErrorKind = result && result.errorKind
          ? result.errorKind
          : allowOcr
            ? "ocr"
            : "scanned";
        const errorKind = allowOcr && !isPdfAccessErrorKind(rawErrorKind) && !isPdfOcrRuntimeErrorKind(rawErrorKind) && !isPdfRecoveryResultUsable(result, text, textWords)
          ? "ocr-low-text"
          : rawErrorKind;
        if (allowOcr && getManualPdfOcrMode(runtime.pdfOcr && runtime.pdfOcr.mode || "") !== "better" && !recoveryCacheable && !isPdfAccessErrorKind(errorKind)) {
          runtime.pdfOcr.betterAvailableForRoute = routeKey;
        }
        if (queuePdfRecoveryRetry(reason, routeKey, options, errorKind, result && result.error)) {
          return;
        }
        const preserved = allowOcr ? getUsablePdfSnapshotForRoute(routeKey, `ocr-failed:${reason}`, runtime.model) : null;
        if (preserved && preserved.model) {
          runtime.model = preserved.model;
          saveReadyPdfOcrState("preserved-after-failure", {
            routeKey,
            model: preserved.model,
            result,
            finalStatus: "success"
          });
          emitDebug("pdf:analysis:preserved-after-failure", {
            reason,
            routeKey,
            preservedSource: preserved.source,
            textWords,
            errorKind,
            exactIssue: "OCR returned no usable new text, but SkimRoute already had a usable same-route PDF map, so it preserved that map instead of showing failure."
          });
          finishOcrRun("success", {
            result,
            ocrRunId: attemptId,
            routeKey,
            mode: runtime.pdfOcr.mode || result && result.adaptiveMode || "",
            parserInputText: text,
            parserModel: preserved.model,
            parserOutputSections: preserved.model && Array.isArray(preserved.model.sections) ? preserved.model.sections.length : 0,
            parserOutputWords: preserved.model ? Number(preserved.model.totalReadableWords || preserved.model.totalWords || 0) : 0,
            cachedAsSuccess: true,
            canRunBetter: runtime.pdfOcr.betterAvailableForRoute === routeKey,
            errorMessage: result && result.error || ""
          });
          render();
          publishStatusUpdate("pdf:analysis:preserved-after-failure");
          return;
        }
        const visibleError = publicPdfErrorMessage(errorKind, allowOcr);

        window.clearTimeout(runtime.pdfOcr.retryTimer);
        runtime.pdfOcr.pending = false;
        runtime.pdfOcr.retrying = false;
        runtime.pdfOcr.retryTimer = null;
        runtime.pdfOcr.completedForRoute = routeKey;
        runtime.pdfOcr.lastError = visibleError;
        runtime.pdfOcr.errorKind = errorKind;
        runtime.pdfOcr.needsPrompt = errorKind !== "fetch";
        runtime.pdfOcr.progress = 0;
        runtime.pdfOcr.source = source;
        runtime.pdfOcr.words = textWords;
        runtime.pdfOcr.pages = result && result.pagesRead || (Array.isArray(result && result.pages) ? result.pages.length : 0);
        runtime.pdfOcr.partial = Boolean(result && result.partial);
        runtime.pdfOcr.qualityState = result && result.ocrQuality || "";
        runtime.pdfOcr.qualityScore = Number(result && result.qualityScore || 0);
        runtime.pdfOcr.qualityMessage = result && result.qualityMessage || "";
        runtime.pdfOcr.state = allowOcr
          ? (errorKind === "ocr-low-text" ? "ocr-unreadable" : "ocr-failed")
          : isPdfAccessErrorKind(errorKind)
            ? "fetch-error"
            : "needs-ocr";
        stopPdfAnalysisWatchdog();
        emitDebug(isPdfAccessErrorKind(errorKind) ? "pdf:analysis:fetch-error" : allowOcr ? "pdf:analysis:ocr-failed" : "pdf:analysis:needs-ocr", {
          reason,
          routeKey,
          source,
          textWords,
          errorKind,
          rawError: result && result.error ? result.error : "",
          allowOcr
        });
        if (allowOcr) {
          emitDebug("pdf:ocr:terminal", {
            reason,
            routeKey,
            state: runtime.pdfOcr.state,
            errorKind,
            words: textWords,
            exactIssue: "OCR finished without a usable map; SkimRoute should show a terminal OCR message instead of Checking."
          });
          const finishDetails = {
            result,
            ocrRunId: attemptId,
            routeKey,
            mode: runtime.pdfOcr.mode || result && result.adaptiveMode || "",
            parserInputText: text,
            parserOutputSections: 0,
            parserOutputWords: 0,
            cachedAsSuccess: false,
            canRunBetter: runtime.pdfOcr.betterAvailableForRoute === routeKey,
            errorMessage: result && result.error || visibleError || ""
          };
          const finalStatus = text && errorKind === "ocr-low-text"
            ? "weak_text"
            : inferPdfOcrFinalStatus("ocr_error", finishDetails);
          finishOcrRun(finalStatus, finishDetails);
        }

        runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, isPdfAccessErrorKind(errorKind)
          ? { state: "pdf-error", bestLabel: "PDF access issue", confidenceLabel: "PDF issue" }
          : errorKind === "ocr-low-text"
            ? { state: "ocr-unreadable", bestLabel: "OCR finished", confidenceLabel: "Scan unreadable" }
            : errorKind === "ocr-worker" || errorKind === "ocr-blank-canvas"
              ? { state: "ocr-failed", bestLabel: "OCR failed", confidenceLabel: "OCR issue" }
            : undefined);
        render();
        publishStatusUpdate("pdf:analysis:terminal");
        window.setTimeout(() => emitPdfGoalCheck("pdf:analysis:terminal"), 120);
      })
      .catch((error) => {
        if (isPdfOcrCancellationError(error) || (runtime.pdfOcr.cancelRequested && runtime.pdfOcr.cancelAttemptId === attemptId)) {
          settlePdfOcrCancelled(routeKey, "cancelled-error");
          return;
        }
        if (runtime.pdfOcr.activeAttemptId !== attemptId || runtime.pdfOcr.attemptedForRoute !== routeKey) {
          emitDebug("pdf:analysis:stale-error", {
            reason,
            routeKey,
            attemptId,
            activeAttemptId: runtime.pdfOcr.activeAttemptId,
            error: String(error && error.message ? error.message : error)
          });
          return;
        }
        const message = String(error && error.message ? error.message : error);
        const errorKind = error && error.pdfErrorKind ? error.pdfErrorKind : getPdfErrorKind(error, allowOcr) || (allowOcr ? "ocr" : "fetch");
        const timedOut = allowOcr && isPdfOcrTimeoutError(error);
        if (timedOut) {
          runtime.pdfOcr.betterAvailableForRoute = routeKey;
        }
        if (allowOcr && getManualPdfOcrMode(runtime.pdfOcr && runtime.pdfOcr.mode || "") !== "better" && !isPdfAccessErrorKind(errorKind)) {
          runtime.pdfOcr.betterAvailableForRoute = routeKey;
          emitDebug("pdf:ocr:adaptive:better-available", {
            reason,
            routeKey,
            errorKind,
            exactIssue: "Fast OCR failed or timed out. Better OCR is available as an explicit user action, but SkimRoute will not run it automatically."
          });
        }
        if (queuePdfRecoveryRetry(reason, routeKey, options, errorKind, message)) {
          return;
        }
        const preserved = allowOcr ? getUsablePdfSnapshotForRoute(routeKey, `ocr-error:${reason}`, runtime.model) : null;
        if (preserved && preserved.model) {
          runtime.model = preserved.model;
          saveReadyPdfOcrState("preserved-after-error", {
            routeKey,
            model: preserved.model,
            finalStatus: "success"
          });
          emitDebug("pdf:analysis:preserved-after-error", {
            reason,
            routeKey,
            preservedSource: preserved.source,
            errorKind,
            rawError: message,
            exactIssue: "OCR errored, but a usable same-route PDF map already existed, so SkimRoute preserved the map instead of showing failure."
          });
          finishOcrRun("success", {
            ocrRunId: attemptId,
            routeKey,
            mode: runtime.pdfOcr.mode || "",
            pageDiagnostics: runtime.pdfOcr.lastDiagnostics || [],
            parserInputText: "",
            parserModel: preserved.model,
            parserOutputSections: preserved.model && Array.isArray(preserved.model.sections) ? preserved.model.sections.length : 0,
            parserOutputWords: preserved.model ? Number(preserved.model.totalReadableWords || preserved.model.totalWords || 0) : 0,
            cachedAsSuccess: true,
            canRunBetter: runtime.pdfOcr.betterAvailableForRoute === routeKey,
            errorMessage: message
          });
          render();
          publishStatusUpdate("pdf:analysis:preserved-after-error");
          return;
        }
        window.clearTimeout(runtime.pdfOcr.retryTimer);
        runtime.pdfOcr.pending = false;
        runtime.pdfOcr.retrying = false;
        runtime.pdfOcr.retryTimer = null;
        runtime.pdfOcr.lastError = timedOut ? PDF_OCR_TIMEOUT_MESSAGE : publicPdfErrorMessage(errorKind, allowOcr);
        runtime.pdfOcr.errorKind = errorKind;
        runtime.pdfOcr.needsPrompt = errorKind !== "fetch";
        runtime.pdfOcr.progress = 0;
        runtime.pdfOcr.words = 0;
        runtime.pdfOcr.pages = 0;
        runtime.pdfOcr.partial = false;
        runtime.pdfOcr.state = allowOcr
          ? (/^(ocr-low-text|ocr-unreadable|ocr)$/i.test(errorKind) ? "ocr-unreadable" : "ocr-failed")
          : isPdfAccessErrorKind(errorKind)
            ? "fetch-error"
            : "needs-ocr";
        stopPdfAnalysisWatchdog();
        if (timedOut) {
          emitDebug("pdf:ocr:timeout", {
            reason,
            routeKey,
            mode: normalizePdfOcrDiagnosticMode(runtime.pdfOcr.mode || ""),
            elapsedMs: Number(error && error.elapsedMs) || (runtime.pdfOcr.analysisStartedAt ? Date.now() - runtime.pdfOcr.analysisStartedAt : 0),
            currentStep: String(error && error.currentStep || runtime.pdfOcr.currentStep || ""),
            workerTerminated: Boolean(error && error.workerTerminated || runtime.pdfOcr.workerTerminated)
          });
        }
        emitDebug("pdf:analysis:error", {
          reason,
          routeKey,
          error: message,
          errorKind,
          allowOcr
        });
        if (allowOcr) {
          emitDebug("pdf:ocr:terminal", {
            reason,
            routeKey,
            state: runtime.pdfOcr.state,
            errorKind,
            error: message,
            exactIssue: "OCR ended with an error and should leave a clear terminal prompt."
          });
          const parserError = runtime.pdfOcr && runtime.pdfOcr.lastParserError;
          const rawOcrText = String(runtime.pdfOcr && runtime.pdfOcr.lastRawOcrText || "");
          finishOcrRun(timedOut ? "timeout" : parserError && rawOcrText ? "parser_error" : "ocr_error", {
            ocrRunId: attemptId,
            routeKey,
            mode: runtime.pdfOcr.mode || "",
            pageDiagnostics: runtime.pdfOcr.lastDiagnostics || [],
            parserInputText: rawOcrText,
            parserOutputSections: 0,
            parserOutputWords: 0,
            parserError,
            cachedAsSuccess: false,
            canRunBetter: true,
            errorMessage: timedOut ? PDF_OCR_TIMEOUT_MESSAGE : parserError && parserError.parserErrorMessage || message,
            elapsedMs: Number(error && error.elapsedMs) || (runtime.pdfOcr.analysisStartedAt ? Date.now() - runtime.pdfOcr.analysisStartedAt : 0),
            currentStep: String(error && error.currentStep || runtime.pdfOcr.currentStep || ""),
            workerTerminated: Boolean(error && error.workerTerminated || runtime.pdfOcr.workerTerminated),
            timedOut
          });
        }
        runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, isPdfAccessErrorKind(errorKind)
          ? { state: "pdf-error", bestLabel: "PDF access issue", confidenceLabel: "PDF issue" }
          : allowOcr
            ? (/^(ocr-low-text|ocr-unreadable|ocr)$/i.test(errorKind)
              ? { state: "ocr-unreadable", bestLabel: "OCR finished", confidenceLabel: "Scan unreadable" }
              : { state: "ocr-failed", bestLabel: "OCR failed", confidenceLabel: "OCR issue" })
            : undefined);
        render();
        publishStatusUpdate("pdf:analysis:error");
        window.setTimeout(() => emitPdfGoalCheck("pdf:analysis:error"), 120);
      })
      .finally(() => {
        if (runtime.pdfOcr.activeAttemptId === attemptId) {
          if (allowOcr && !getPdfOcrFinishedRunSet().has(attemptId)) {
            finishOcrRun("ocr_error", {
              ocrRunId: attemptId,
              routeKey,
              mode: runtime.pdfOcr.mode || requestedMode || "",
              pageDiagnostics: runtime.pdfOcr.lastDiagnostics || [],
              parserInputText: "",
              parserOutputSections: 0,
              parserOutputWords: 0,
              cachedAsSuccess: false,
              canRunBetter: runtime.pdfOcr.betterAvailableForRoute === routeKey,
              errorMessage: "OCR ended before a terminal result was recorded.",
              currentStep: runtime.pdfOcr.currentStep || "finally"
            });
          }
          runtime.pdfOcr.activePromise = null;
        } else {
          return;
        }
        if (runtime.pdfOcr.pending && !runtime.pdfOcr.retrying) {
          runtime.pdfOcr.pending = false;
          render();
        } else if (runtime.pdfOcr.retrying) {
          render();
        }
      });
    runtime.pdfOcr.activePromise = analysisPromise;
    return analysisPromise;
  }


  function startPdfAnalysisWatchdog(reason, routeKey, allowOcr, ocrRunId = 0) {
    stopPdfAnalysisWatchdog();
    runtime.pdfOcr.analysisStartedAt = runtime.pdfOcr.analysisStartedAt || Date.now();
    const watchdogTimeoutMs = allowOcr
      ? getPdfOcrAttemptTimeoutMs(runtime.pdfOcr && runtime.pdfOcr.mode || "fast")
      : PDF_ANALYSIS_HARD_TIMEOUT_MS;
    runtime.pdfOcr.watchdogTimer = window.setTimeout(() => {
      runtime.pdfOcr.watchdogTimer = null;
      if (allowOcr && !isActiveOcrRun(ocrRunId || getActivePdfOcrRunId())) return;
      if (!runtime.pdfOcr.pending || getRouteCacheKey() !== routeKey) return;
      const elapsedMs = Date.now() - (runtime.pdfOcr.analysisStartedAt || Date.now());
      const preserved = allowOcr ? getUsablePdfSnapshotForRoute(routeKey, `watchdog:${reason}`, runtime.model) : null;
      if (preserved && preserved.model) {
        runtime.pdfOcr.pending = false;
        runtime.pdfOcr.retrying = false;
        runtime.pdfOcr.retryTimer = null;
        runtime.pdfOcr.completedForRoute = routeKey;
        runtime.pdfOcr.lastError = "";
        runtime.pdfOcr.errorKind = "";
        runtime.pdfOcr.needsPrompt = false;
        runtime.pdfOcr.progress = 100;
        runtime.pdfOcr.source = preserved.source;
        runtime.pdfOcr.words = Number(preserved.model.totalReadableWords || 0);
        runtime.pdfOcr.state = "ready";
        runtime.model = preserved.model;
        emitDebug("pdf:analysis:watchdog-preserved", {
          reason,
          routeKey,
          allowOcr,
          elapsedMs,
          preservedSource: preserved.source,
          exactIssue: "The OCR watchdog fired, but SkimRoute preserved an existing usable same-route PDF map instead of replacing it with a timeout."
        });
        if (allowOcr) {
          finishOcrRun("timeout", {
            ocrRunId: ocrRunId || getActivePdfOcrRunId(),
            routeKey,
            mode: runtime.pdfOcr.mode || "",
            pageDiagnostics: runtime.pdfOcr.lastDiagnostics || [],
            parserInputText: "",
            parserModel: preserved.model,
            parserOutputSections: preserved.model && Array.isArray(preserved.model.sections) ? preserved.model.sections.length : 0,
            parserOutputWords: preserved.model ? Number(preserved.model.totalReadableWords || preserved.model.totalWords || 0) : 0,
            cachedAsSuccess: true,
            canRunBetter: runtime.pdfOcr.betterAvailableForRoute === routeKey,
            errorMessage: PDF_OCR_TIMEOUT_MESSAGE,
            elapsedMs,
            currentStep: runtime.pdfOcr.currentStep || "",
            timedOut: true,
            terminateWorker: true
          });
        }
        render();
        publishStatusUpdate("pdf:analysis:watchdog-preserved");
        return;
      }
      runtime.pdfOcr.pending = false;
      runtime.pdfOcr.retrying = false;
      runtime.pdfOcr.retryTimer = null;
      runtime.pdfOcr.lastError = allowOcr
        ? PDF_OCR_TIMEOUT_MESSAGE
        : "PDF text extraction timed out before it could build a usable map.";
      runtime.pdfOcr.errorKind = allowOcr ? "ocr-timeout" : "extract-timeout";
      if (allowOcr) runtime.pdfOcr.timedOut = true;
      runtime.pdfOcr.needsPrompt = !allowOcr;
      runtime.pdfOcr.state = allowOcr ? "ocr-failed" : "needs-ocr";
      let workerTerminated = false;
      if (allowOcr) runtime.pdfOcr.betterAvailableForRoute = routeKey;
      emitDebug("pdf:analysis:watchdog-timeout", {
        reason,
        routeKey,
        allowOcr,
        elapsedMs,
        hardTimeoutMs: watchdogTimeoutMs,
        diagnosis: allowOcr
          ? "OCR did not finish. Check capture permission, Tesseract loading, image quality, or very large PDF pages."
          : "PDF.js text extraction did not finish. Check file access, PDF.js worker/module loading, damaged/encrypted PDFs, or extremely slow pages."
      });
      if (allowOcr) {
        emitDebug("pdf:ocr:timeout", {
          ocrRunId: ocrRunId || getActivePdfOcrRunId(),
          reason,
          routeKey,
          mode: normalizePdfOcrDiagnosticMode(runtime.pdfOcr.mode || ""),
          elapsedMs,
          currentStep: runtime.pdfOcr.currentStep || "",
          workerTerminated
        });
        emitDebug("pdf:ocr:terminal", {
          reason,
          routeKey,
          state: runtime.pdfOcr.state,
          errorKind: runtime.pdfOcr.errorKind,
          elapsedMs,
          exactIssue: "OCR timed out and was converted into a terminal prompt so the UI does not stay in Checking."
        });
        const diagnostic = finishOcrRun("timeout", {
          ocrRunId: ocrRunId || getActivePdfOcrRunId(),
          routeKey,
          mode: runtime.pdfOcr.mode || "",
          pageDiagnostics: runtime.pdfOcr.lastDiagnostics || [],
          parserInputText: "",
          parserOutputSections: 0,
          parserOutputWords: 0,
          cachedAsSuccess: false,
          canRunBetter: true,
          errorMessage: runtime.pdfOcr.lastError,
          elapsedMs,
          currentStep: runtime.pdfOcr.currentStep || "",
          workerTerminated,
          timedOut: true,
          terminateWorker: true
        });
        workerTerminated = Boolean(diagnostic && diagnostic.workerTerminated || runtime.pdfOcr.workerTerminated);
      }
      if (runtime.model) {
        runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, allowOcr
          ? { state: "ocr-prompt", bestLabel: "OCR failed", confidenceLabel: "OCR issue" }
          : { state: "ocr-prompt", bestLabel: "Run OCR", confidenceLabel: "Needs OCR" });
        render();
        publishStatusUpdate("pdf:analysis:watchdog-timeout");
      }
      emitPdfGoalCheck("pdf:analysis:watchdog-timeout", { force: true });
    }, watchdogTimeoutMs);
  }

  function stopPdfAnalysisWatchdog() {
    if (runtime && runtime.pdfOcr && runtime.pdfOcr.watchdogTimer) {
      window.clearTimeout(runtime.pdfOcr.watchdogTimer);
      runtime.pdfOcr.watchdogTimer = null;
    }
  }

  function isPdfAnalysisExpired() {
    return Boolean(
      runtime.pdfOcr
      && runtime.pdfOcr.pending
      && runtime.pdfOcr.analysisStartedAt
      && Date.now() - runtime.pdfOcr.analysisStartedAt > (runtime.pdfOcr.state === "ocr" ? getPdfOcrAttemptTimeoutMs(runtime.pdfOcr.mode || "fast") : PDF_ANALYSIS_HARD_TIMEOUT_MS)
    );
  }

  function shouldAutoRunPdfOcr(routeKey) {
    void routeKey;
    return false;
  }

  function getManualPdfOcrMode(mode) {
    const requested = String(mode || "").toLowerCase();
    if (requested === "better") return "better";
    if (requested === "smart") return "smart";
    return "fast";
  }

  function getPdfOcrAttemptTimeoutMs(mode) {
    return getManualPdfOcrMode(mode) === "better" ? PDF_OCR_BETTER_TIMEOUT_MS : PDF_OCR_FAST_TIMEOUT_MS;
  }

  function markPdfOcrStep(step) {
    if (runtime && runtime.pdfOcr) {
      runtime.pdfOcr.currentStep = String(step || "");
    }
  }

  function terminateActivePdfOcrWorker(reason = "timeout") {
    const worker = runtime.pdfOcr && runtime.pdfOcr.activeWorker;
    const ocrRunId = runtime.pdfOcr && runtime.pdfOcr.activeWorkerRunId || getActivePdfOcrRunId();
    if (!worker || typeof worker.terminate !== "function") return false;
    runtime.pdfOcr.activeWorkerTerminated = true;
    runtime.pdfOcr.workerTerminated = true;
    runtime.pdfOcr.activeWorker = null;
    runtime.pdfOcr.activeWorkerRunId = 0;
    runtime.pdfOcr.activeWorkerOptions = null;
    runtime.pdfOcr.activeWorkerContext = null;
    try {
      const result = worker.terminate();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          emitDebug("pdf:ocr:worker-terminate-error", {
            reason,
            ocrRunId,
            error: String(error && error.message ? error.message : error)
          });
        });
      }
      return true;
    } catch (error) {
      emitDebug("pdf:ocr:worker-terminate-error", {
        reason,
        ocrRunId,
        error: String(error && error.message ? error.message : error)
      });
      return false;
    }
  }

  function cancelActivePdfOcrWork(reason = "finish", options = {}) {
    const result = {
      workerTerminated: false,
      renderCancelled: false,
      loadingCancelled: false,
      documentDestroyed: false
    };
    if (!runtime || !runtime.pdfOcr) return result;
    if (options.terminateWorker) {
      result.workerTerminated = terminateActivePdfOcrWorker(reason);
    }
    const renderTask = runtime.pdfOcr.activeRenderTask;
    if (renderTask && typeof renderTask.cancel === "function") {
      try {
        renderTask.cancel();
        result.renderCancelled = true;
      } catch (error) {
        emitDebug("pdf:ocr:render-cancel-error", {
          reason,
          error: String(error && error.message ? error.message : error)
        });
      }
    }
    runtime.pdfOcr.activeRenderTask = null;

    const loadingTask = runtime.pdfOcr.activePdfLoadingTask;
    if (loadingTask && typeof loadingTask.destroy === "function") {
      try {
        const destroyed = loadingTask.destroy();
        if (destroyed && typeof destroyed.catch === "function") {
          destroyed.catch((error) => {
            emitDebug("pdf:ocr:loading-destroy-error", {
              reason,
              error: String(error && error.message ? error.message : error)
            });
          });
        }
        result.loadingCancelled = true;
      } catch (error) {
        emitDebug("pdf:ocr:loading-destroy-error", {
          reason,
          error: String(error && error.message ? error.message : error)
        });
      }
    }
    runtime.pdfOcr.activePdfLoadingTask = null;

    const pdf = runtime.pdfOcr.activePdfDocument;
    if (pdf && typeof pdf.destroy === "function") {
      try {
        const destroyed = pdf.destroy();
        if (destroyed && typeof destroyed.catch === "function") {
          destroyed.catch((error) => {
            emitDebug("pdf:ocr:document-destroy-error", {
              reason,
              error: String(error && error.message ? error.message : error)
            });
          });
        }
        result.documentDestroyed = true;
      } catch (error) {
        emitDebug("pdf:ocr:document-destroy-error", {
          reason,
          error: String(error && error.message ? error.message : error)
        });
      }
    }
    runtime.pdfOcr.activePdfDocument = null;
    return result;
  }

  function makePdfOcrTimeoutError(options = {}) {
    const error = new Error(options.message || PDF_OCR_TIMEOUT_MESSAGE);
    error.pdfErrorKind = "ocr-timeout";
    error.pdfOcrTimeout = true;
    error.elapsedMs = Number(options.elapsedMs) || 0;
    error.ocrRunId = Number(options.ocrRunId) || getActivePdfOcrRunId();
    error.mode = normalizePdfOcrDiagnosticMode(options.mode || runtime.pdfOcr && runtime.pdfOcr.mode || "");
    error.currentStep = String(options.currentStep || runtime.pdfOcr && runtime.pdfOcr.currentStep || "");
    error.workerTerminated = Boolean(options.workerTerminated);
    return error;
  }

  function isPdfOcrTimeoutError(error) {
    return Boolean(error && (error.pdfOcrTimeout || error.pdfErrorKind === "ocr-timeout" || /ocr.*timed out|timed out.*ocr|took too long/i.test(String(error.message || error))));
  }

  function racePdfOcrTimeout(promise, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || getPdfOcrAttemptTimeoutMs(options.mode);
    const startedAt = Number(options.startedAt) || runtime.pdfOcr && runtime.pdfOcr.analysisStartedAt || Date.now();
    const mode = normalizePdfOcrDiagnosticMode(options.mode || runtime.pdfOcr && runtime.pdfOcr.mode || "");
    const currentStep = String(options.currentStep || runtime.pdfOcr && runtime.pdfOcr.currentStep || "");
    const ocrRunId = Number(options.ocrRunId || getActivePdfOcrRunId()) || 0;
    let timer = null;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => {
          if (!isActiveOcrRun(ocrRunId)) {
            reject(makePdfOcrCancelledError("PDF OCR run is no longer active."));
            return;
          }
          const elapsedMs = Date.now() - startedAt;
          let workerTerminated = Boolean(runtime.pdfOcr && runtime.pdfOcr.workerTerminated);
          const diagnostic = finishOcrRun("timeout", {
            ocrRunId,
            mode,
            pageDiagnostics: runtime.pdfOcr && runtime.pdfOcr.lastDiagnostics || [],
            parserInputText: "",
            parserOutputSections: 0,
            parserOutputWords: 0,
            cachedAsSuccess: false,
            canRunBetter: true,
            errorMessage: PDF_OCR_TIMEOUT_MESSAGE,
            elapsedMs,
            currentStep: runtime.pdfOcr && runtime.pdfOcr.currentStep || currentStep,
            workerTerminated,
            timedOut: true,
            terminateWorker: true
          });
          workerTerminated = Boolean(diagnostic && diagnostic.workerTerminated || runtime.pdfOcr && runtime.pdfOcr.workerTerminated);
          emitDebug("pdf:ocr:timeout", {
            ocrRunId,
            mode,
            elapsedMs,
            timeoutMs,
            currentStep: runtime.pdfOcr && runtime.pdfOcr.currentStep || currentStep,
            workerTerminated
          });
          reject(makePdfOcrTimeoutError({
            mode,
            elapsedMs,
            ocrRunId,
            currentStep: runtime.pdfOcr && runtime.pdfOcr.currentStep || currentStep,
            workerTerminated
          }));
        }, timeoutMs);
      })
    ]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  function makePdfOcrCancelledError(message = "PDF OCR cancelled.") {
    const error = new Error(message);
    error.pdfErrorKind = "ocr-cancelled";
    error.pdfOcrCancelled = true;
    return error;
  }

  function isPdfOcrCancellationError(error) {
    return Boolean(error && (error.pdfOcrCancelled || error.pdfErrorKind === "ocr-cancelled" || /cancelled|canceled/i.test(String(error.message || error))));
  }

  function assertPdfOcrNotCancelled(attemptId) {
    if (!runtime.pdfOcr) return;
    if (attemptId && runtime.pdfOcr.activeOcrRunId === attemptId && !isActiveOcrRun(attemptId)) {
      emitDebug("pdf:ocr:inactive-run-observed", {
        ocrRunId: attemptId,
        activeOcrRunId: runtime.pdfOcr.activeOcrRunId || 0,
        finalized: Boolean(runtime.pdfOcr.finalized),
        cancelled: Boolean(runtime.pdfOcr.cancelRequested),
        timedOut: Boolean(runtime.pdfOcr.timedOut),
        exactIssue: "An OCR step observed that its run is no longer active and stopped before doing more work."
      });
      throw makePdfOcrCancelledError("PDF OCR run is no longer active.");
    }
    if (runtime.pdfOcr.cancelRequested && (!attemptId || runtime.pdfOcr.cancelAttemptId === attemptId || runtime.pdfOcr.activeAttemptId === attemptId)) {
      emitDebug("pdf:ocr:cancel-observed", {
        attemptId,
        activeAttemptId: runtime.pdfOcr.activeAttemptId || 0,
        cancelAttemptId: runtime.pdfOcr.cancelAttemptId || 0,
        exactIssue: "OCR cancellation was observed at a cooperative checkpoint before more heavy work continued."
      });
      throw makePdfOcrCancelledError();
    }
  }

  function waitForPdfOcrIdle(label = "yield", attemptId = 0, timeoutMs = 18) {
    return new Promise((resolve, reject) => {
      const finish = () => {
        try {
          assertPdfOcrNotCancelled(attemptId);
          if (runtime.pdfOcr && (runtime.pdfOcr.pending || runtime.pdfOcr.retrying)) {
            const now = Date.now();
            if (!runtime.pdfOcr.lastYieldDebugAt || now - runtime.pdfOcr.lastYieldDebugAt > 900) {
              runtime.pdfOcr.lastYieldDebugAt = now;
              emitDebug("pdf:ocr:yield", {
                label,
                attemptId,
                timeoutMs,
                elapsedMs: runtime.pdfOcr.analysisStartedAt ? now - runtime.pdfOcr.analysisStartedAt : 0,
                exactIssue: "none"
              });
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      try {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(finish, { timeout: Math.max(12, timeoutMs) });
        } else {
          window.setTimeout(finish, Math.max(0, Math.min(35, timeoutMs)));
        }
      } catch (error) {
        emitDebug("pdf:ocr:yield:error", {
          label,
          error: String(error && error.message ? error.message : error)
        });
        window.setTimeout(finish, 0);
      }
    });
  }

  function settlePdfOcrCancelled(routeKey = getRouteCacheKey(), reason = "manual-cancel") {
    window.clearTimeout(runtime.pdfOcr.retryTimer);
    runtime.pdfOcr.retryTimer = null;
    runtime.pdfOcr.pending = false;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.activePromise = null;
    runtime.pdfOcr.completedForRoute = "";
    runtime.pdfOcr.lastError = "OCR cancelled. You can run Fast OCR again when ready.";
    runtime.pdfOcr.errorKind = "ocr-cancelled";
    runtime.pdfOcr.needsPrompt = true;
    runtime.pdfOcr.lastLongRunningNoticeAt = 0;
    runtime.pdfOcr.progress = 0;
    runtime.pdfOcr.state = "ocr-cancelled";
    runtime.pdfOcr.lastCancelledAt = Date.now();
    runtime.pdfOcr.recommendedMode = "fast";
    runtime.pdfOcr.betterAvailableForRoute = "";
    stopPdfAnalysisWatchdog();
    if (runtime.model) {
      const preserved = getUsablePdfSnapshotForRoute(routeKey, `ocr-cancelled:${reason}`, runtime.model);
      if (preserved && preserved.model) {
        runtime.model = preserved.model;
        rememberStablePdfModel(runtime.model, `ocr-cancelled:${reason}:${preserved.source}`);
      } else {
        runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, {
          state: "ocr-cancelled",
          bestLabel: "OCR cancelled",
          confidenceLabel: "Needs OCR"
        });
      }
      render();
      publishStatusUpdate("pdf:ocr:cancelled");
    }
    emitDebug("pdf:ocr:cancelled", {
      reason,
      routeKey,
      attemptId: runtime.pdfOcr.cancelAttemptId,
      exactIssue: "User cancelled OCR. SkimRoute cleared pending/retrying state and kept any usable cached or stable PDF map."
    });
    emitDebug("pdf:ocr:terminal", {
      reason,
      routeKey,
      state: runtime.pdfOcr.state,
      errorKind: runtime.pdfOcr.errorKind,
      exactIssue: "OCR reached a terminal cancelled state and should not leave the popup/sidebar in Checking or Scanning."
    });
    finishOcrRun("cancelled", {
      ocrRunId: runtime.pdfOcr.cancelAttemptId || getActivePdfOcrRunId(),
      mode: runtime.pdfOcr.mode || runtime.pdfOcr.recommendedMode || "fast",
      pageDiagnostics: runtime.pdfOcr.lastDiagnostics || [],
      parserInputText: "",
      parserOutputSections: 0,
      parserOutputWords: 0,
      cachedAsSuccess: false,
      canRunBetter: false,
      errorMessage: runtime.pdfOcr.lastError,
      workerTerminated: Boolean(runtime.pdfOcr.workerTerminated),
      cancelled: true,
      terminateWorker: true
    });
  }

  function cancelPdfOcr(reason = "manual") {
    if (runtime.pdfOcr) {
      runtime.pdfOcr.cancelRequested = true;
      runtime.pdfOcr.cancelAttemptId = getActivePdfOcrRunId() || runtime.pdfOcr.cancelAttemptId || 0;
    }
    emitDebug("pdf:ocr:cancel-requested", {
      reason,
      routeKey: getRouteCacheKey(),
      pending: Boolean(runtime.pdfOcr && runtime.pdfOcr.pending),
      retrying: Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying),
      state: runtime.pdfOcr && runtime.pdfOcr.state || "",
      ocrRunId: runtime.pdfOcr && (runtime.pdfOcr.cancelAttemptId || runtime.pdfOcr.activeOcrRunId || runtime.pdfOcr.activeAttemptId) || 0,
      exactIssue: "User requested OCR cancellation; SkimRoute will clear pending/retrying state and preserve any usable cached PDF map."
    });
    if (!runtime.pdfOcr || (!runtime.pdfOcr.pending && !runtime.pdfOcr.retrying && runtime.pdfOcr.state !== "ocr")) {
      settlePdfOcrCancelled(getRouteCacheKey(), reason);
      return true;
    }
    settlePdfOcrCancelled(getRouteCacheKey(), reason);
    return true;
  }

  function emitPdfGoalCheck(event, options = {}) {
    if (!(isPdfRouteLocked() || (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf"))) {
      return;
    }
    const diagnostics = buildPdfGoalDiagnostics();
    const signature = JSON.stringify({
      event,
      status: diagnostics.status,
      failingGoals: diagnostics.failingGoals,
      state: diagnostics.pdfState,
      words: diagnostics.words,
      sections: diagnostics.sections,
      errorKind: diagnostics.errorKind,
      pending: diagnostics.pending,
      retrying: diagnostics.retrying
    });
    if (!options.force && runtime.pdfOcr.lastGoalSignature === signature) return;
    runtime.pdfOcr.lastGoalSignature = signature;
    emitDebug("pdf:goal-check", {
      from: event,
      ...diagnostics
    });
  }

  function buildPdfGoalDiagnostics() {
    const model = runtime.model || {};
    const profile = model.pageProfile || {};
    const sections = Array.isArray(model.sections) ? model.sections : [];
    const important = Array.isArray(model.importantSections) ? model.importantSections : [];
    const bestSection = sections.find((section) => section.id === model.bestSectionId) || important[0] || sections[0] || null;
    const words = Number(model.totalReadableWords || 0);
    const routeKey = getPdfDocumentRouteKey();
    const sourceUrl = getPdfSourceUrl();
    const pending = Boolean(runtime.pdfOcr && runtime.pdfOcr.pending);
    const retrying = Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying);
    const pdfState = runtime.pdfOcr && runtime.pdfOcr.state || profile.state || "idle";
    const errorKind = runtime.pdfOcr && runtime.pdfOcr.errorKind || "";
    const shortOcrGoal = sections.some((section) => section && section.unitMeta && section.unitMeta.ocr && isCacheableShortOcrText(section.text || ""));
    const pdfReady = sections.length >= 1 && (words >= PDF_RECOVERY_MIN_WORDS || shortOcrGoal) && !pending && !retrying;
    const textGoal = words >= PDF_RECOVERY_MIN_WORDS || shortOcrGoal;
    const sectionGoal = sections.length >= 1;
    const importantGoal = important.length >= 1 && Boolean(model.bestSectionId || bestSection);
    const pageMapGoal = sections.some((section) => getPdfSectionPageNumber(section) > 0);
    const jumpGoal = Boolean(bestSection && canJumpToSection(bestSection));
    const highlightGoal = Boolean(bestSection && (isSafePdfJumpAnchor(resolvePdfScrollAnchor(bestSection)) || getPdfSectionPageNumber(bestSection)));
    const keyboardGoal = true;
    const fileAccessGoal = !isLocalFileUrl(routeKey) || runtime.pdfAccessAllowed !== false;
    const ocrAvailable = supportsPdfOcr();
    const goals = {
      textExtracted: textGoal,
      sectionMapBuilt: sectionGoal,
      importantSectionsRanked: importantGoal,
      pageNumbersKnown: pageMapGoal,
      jumpTargetAvailable: jumpGoal,
      highlightTargetAvailable: highlightGoal,
      keyboardShortcutsAttached: keyboardGoal,
      fileAccessAllowed: fileAccessGoal,
      ocrAvailable
    };
    const explanations = {
      textExtracted: textGoal ? "OK" : pending || retrying ? "Still extracting text." : errorKind === "fetch" ? "Could not read PDF bytes. Check file access, URL permission, size, or blocked fetch." : errorKind ? `Extraction stopped with ${errorKind}.` : "No usable selectable text or OCR text has been recovered yet.",
      sectionMapBuilt: sectionGoal ? "OK" : "No SkimRoute sections exist yet, so the sidebar/page map and navigation targets cannot be built.",
      importantSectionsRanked: importantGoal ? "OK" : "No important section was ranked. This normally happens when sectionMapBuilt is false or all sections are too short/low-signal.",
      pageNumbersKnown: pageMapGoal ? "OK" : "Sections do not have pageNumber metadata, so PDF page jumping cannot be precise.",
      jumpTargetAvailable: jumpGoal ? "OK" : "No safe DOM anchor or page-number fallback is available for the best section.",
      highlightTargetAvailable: highlightGoal ? "OK" : "SkimRoute can only highlight PDFs using a text-layer/page anchor or its own page marker fallback.",
      keyboardShortcutsAttached: keyboardGoal ? "OK" : "Keyboard listener did not attach.",
      fileAccessAllowed: fileAccessGoal ? "OK" : "Chrome reports file access is disabled for SkimRoute. Enable Allow access to file URLs on chrome://extensions.",
      ocrAvailable: ocrAvailable ? "OK" : "OCR dependencies or browser capture support are unavailable. Check web_accessible_resources, activeTab permission, and tesseract files."
    };
    const failingGoals = Object.keys(goals).filter((key) => !goals[key]);
    const blockers = failingGoals.map((key) => ({ goal: key, reason: explanations[key] }));
    const canUsePdf = textGoal && sectionGoal && importantGoal && pageMapGoal && jumpGoal && highlightGoal && fileAccessGoal;
    return {
      status: canUsePdf ? "ready" : pending || retrying ? "working" : "blocked",
      routeKey,
      sourceUrl,
      pdfState,
      pending,
      retrying,
      progress: runtime.pdfOcr && runtime.pdfOcr.progress || 0,
      elapsedMs: runtime.pdfOcr && runtime.pdfOcr.analysisStartedAt ? Date.now() - runtime.pdfOcr.analysisStartedAt : 0,
      errorKind,
      error: runtime.pdfOcr && runtime.pdfOcr.lastError || "",
      fileAccessAllowed: runtime.pdfAccessAllowed,
      words,
      recoveredWords: runtime.pdfOcr && runtime.pdfOcr.words || 0,
      sections: sections.length,
      importantSections: important.length,
      pagesRecovered: runtime.pdfOcr && runtime.pdfOcr.pages || 0,
      partial: Boolean(runtime.pdfOcr && runtime.pdfOcr.partial),
      bestSection: bestSection ? {
        id: bestSection.id,
        title: bestSection.title || "",
        pageNumber: getPdfSectionPageNumber(bestSection),
        chunkIndex: getPdfSectionChunkIndex(bestSection),
        canJump: jumpGoal,
        excerpt: getPdfSectionExcerpt(bestSection)
      } : null,
      goals,
      failingGoals,
      blockers,
      jumpStrategy: bestSection ? describePdfJumpStrategy(bestSection) : "none",
      note: canUsePdf
        ? "PDF goals are ready: words, important sections, keyboard shortcuts, page map, jump, and highlight fallback are available."
        : "The blockers list shows exactly what is preventing PDF navigation/highlighting right now."
    };
  }

  function describePdfJumpStrategy(section) {
    if (!section) return "none";
    const anchor = resolvePdfScrollAnchor(section);
    if (isSafePdfJumpAnchor(anchor)) return "pdf-text-layer-or-page-dom-anchor";
    if (getPdfSectionPageNumber(section)) return "page-number-marker-fallback";
    return "none";
  }

  function queuePdfRecoveryRetry(reason, routeKey, options, errorKind, rawError) {
    const allowOcr = Boolean(options && options.allowOcr);
    if (
      allowOcr
      || !/^(fetch|local-file)$/i.test(String(errorKind || ""))
      || !isLocalFileUrl(routeKey)
      || runtime.pdfAccessAllowed === false
    ) {
      return false;
    }

    const now = Date.now();
    if (!runtime.pdfOcr.retryStartedAt || runtime.pdfOcr.attemptedForRoute !== routeKey) {
      runtime.pdfOcr.retryStartedAt = now;
      runtime.pdfOcr.retryCount = 0;
    }
    if (
      runtime.pdfOcr.retryCount >= PDF_FETCH_MAX_RETRIES
      || now - runtime.pdfOcr.retryStartedAt > PDF_FETCH_RETRY_WINDOW_MS
    ) {
      return false;
    }

    runtime.pdfOcr.retryCount += 1;
    runtime.pdfOcr.retrying = true;
    runtime.pdfOcr.pending = true;
    runtime.pdfOcr.completedForRoute = "";
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.progress = Math.max(4, runtime.pdfOcr.progress || 0);
    runtime.pdfOcr.state = "extracting";
    runtime.model = buildPdfProcessingModel(runtime.model, `Still reading PDF text... retry ${runtime.pdfOcr.retryCount}`, "extracting");
    render();

    emitDebug("pdf:analysis:retry", {
      reason,
      routeKey,
      retryCount: runtime.pdfOcr.retryCount,
      retryWindowMs: now - runtime.pdfOcr.retryStartedAt,
      rawError: String(rawError || "")
    });

    window.clearTimeout(runtime.pdfOcr.retryTimer);
    runtime.pdfOcr.retryTimer = window.setTimeout(() => {
      runtime.pdfOcr.retryTimer = null;
      if (getRouteCacheKey() !== routeKey) {
        runtime.pdfOcr.pending = false;
        runtime.pdfOcr.retrying = false;
        return;
      }
      runtime.pdfOcr.pending = false;
      runtime.pdfOcr.retrying = false;
      schedulePdfRecoveryAttempt(`${reason || "pdf"}-retry`, {
        ...options,
        force: true,
        retry: true
      });
    }, PDF_FETCH_RETRY_DELAY_MS);

    return true;
  }

  function schedulePdfFullTextRefresh(routeKey, reason) {
    if (!routeKey || !(isPdfRouteLocked() || isPdfLikePage())) return;
    if (runtime.pdfOcr.deepPending && runtime.pdfOcr.deepForRoute === routeKey) return;
    if (runtime.pdfOcr.deepCompletedForRoute === routeKey) return;

    runtime.pdfOcr.deepPending = true;
    runtime.pdfOcr.deepForRoute = routeKey;
    emitDebug("pdf:full-text:start", {
      reason,
      routeKey,
      existingWords: runtime.pdfOcr.words || 0
    });

    extractPdfTextRecovery("pdf-full-text", routeKey, {
      fullText: true,
      onProgress: () => {}
    })
      .then((result) => {
        if (getRouteCacheKey() !== routeKey) return;
        const text = String(result && result.text ? result.text : "").trim();
        const textWords = countPdfWords(text);
        const existingWords = runtime.pdfOcr.words || 0;
        if (textWords < Math.max(PDF_RECOVERY_MIN_WORDS, existingWords + 20)) {
          emitDebug("pdf:full-text:skip", {
            routeKey,
            textWords,
            existingWords
          });
          return;
        }

        const cacheEntry = writePdfCacheEntry(routeKey, {
          text,
          pages: normalizePdfRecoveryPages(result && result.pages),
          updatedAt: Date.now(),
          source: result && result.source ? result.source : "pdfjs",
          partial: Boolean(result && result.partial),
          pagesRead: result && result.pagesRead || 0,
          words: textWords,
          numPages: result && result.numPages || 0,
          ocrQuality: result && result.ocrQuality || "",
          qualityScore: result && result.qualityScore || 0,
          qualityMessage: result && result.qualityMessage || "",
          confidence: result && result.confidence || 0,
          pageDiagnostics: result && result.pageDiagnostics || [],
          rawText: result && result.rawText || text,
          reconstructedText: result && result.reconstructedText || text,
          ocrTextQuality: result && result.ocrTextQuality || null,
          fingerprint: result && result.fingerprint || null,
          fileName: getPdfFileNameFromRoute(routeKey),
          ocrMode: result && (result.adaptiveMode || result.ocrMode) || runtime.pdfOcr.mode || ""
        });
        runtime.pdfOcr.lastRecoveredEntry = cacheEntry;
        runtime.pdfOcr.lastError = "";
        runtime.pdfOcr.errorKind = "";
        runtime.pdfOcr.needsPrompt = false;
        runtime.pdfOcr.progress = 100;
        runtime.pdfOcr.source = cacheEntry && cacheEntry.source || "pdfjs";
        runtime.pdfOcr.words = textWords;
        runtime.pdfOcr.pages = cacheEntry && (cacheEntry.pagesRead || cacheEntry.pages.length) || 0;
        runtime.pdfOcr.partial = Boolean(result && result.partial);
        runtime.pdfOcr.qualityState = cacheEntry && cacheEntry.ocrQuality || result && result.ocrQuality || "";
        runtime.pdfOcr.qualityScore = Number(cacheEntry && cacheEntry.qualityScore || result && result.qualityScore || 0);
        runtime.pdfOcr.qualityMessage = cacheEntry && cacheEntry.qualityMessage || result && result.qualityMessage || "";
        runtime.pdfOcr.state = "ready";
        emitDebug("pdf:full-text:success", {
          routeKey,
          textWords,
          pagesRead: runtime.pdfOcr.pages,
          partial: runtime.pdfOcr.partial,
          qualityState: runtime.pdfOcr.qualityState,
          qualityScore: runtime.pdfOcr.qualityScore
        });
        scanPage("pdf-full-text");
      })
      .catch((error) => {
        emitDebug("pdf:full-text:error", {
          routeKey,
          error: String(error && error.message ? error.message : error)
        });
      })
      .finally(() => {
        runtime.pdfOcr.deepPending = false;
        runtime.pdfOcr.deepCompletedForRoute = routeKey;
      });
  }

  function isPdfRecoveryTerminalRuntimeState() {
    const state = runtime.pdfOcr && String(runtime.pdfOcr.state || "");
    return /^ready$/i.test(state) || isPdfRecoveryFailureRuntimeState();
  }

  function updatePdfRecoveryProgress(event, allowOcr) {
    const ocrRunId = Number(event && event.ocrRunId) || getActivePdfOcrRunId();
    const stableSnapshot = allowOcr ? getStablePdfOcrStatusSnapshot(event && event.routeKey || getPdfDocumentRouteKey()) : null;
    const finishedRuns = getPdfOcrFinishedRunSet();
    if (
      stableSnapshot
      && (
        !ocrRunId
        || stableSnapshot.ocrRunId === ocrRunId
        || finishedRuns.has(ocrRunId)
        || (!runtime.pdfOcr.pending && !runtime.pdfOcr.retrying && runtime.pdfOcr.completedForRoute === stableSnapshot.routeKey)
      )
    ) {
      emitDebug("pdf:ocr:stale-progress-ignored", {
        ocrRunId,
        activeOcrRunId: getActivePdfOcrRunId(),
        state: runtime.pdfOcr && runtime.pdfOcr.state || "",
        finalized: Boolean(runtime.pdfOcr && runtime.pdfOcr.finalized),
        stableStatusSnapshot: true,
        message: event && event.message || "",
        exactIssue: "OCR already saved a ready stable PDF snapshot, so a late progress update could not overwrite the popup/sidebar ready state."
      });
      return;
    }
    if (allowOcr && !isActiveOcrRun(ocrRunId)) {
      emitDebug("pdf:ocr:stale-progress-ignored", {
        ocrRunId,
        activeOcrRunId: getActivePdfOcrRunId(),
        state: runtime.pdfOcr && runtime.pdfOcr.state || "",
        finalized: Boolean(runtime.pdfOcr && runtime.pdfOcr.finalized),
        cancelled: Boolean(runtime.pdfOcr && runtime.pdfOcr.cancelRequested),
        timedOut: Boolean(runtime.pdfOcr && runtime.pdfOcr.timedOut),
        message: event && event.message || "",
        exactIssue: "An OCR progress update belonged to a cancelled, timed-out, finalized, or stale run, so it could not overwrite the current PDF status."
      });
      return;
    }
    if (
      runtime.pdfOcr
      && !runtime.pdfOcr.pending
      && !runtime.pdfOcr.retrying
      && isPdfRecoveryTerminalRuntimeState()
    ) {
      emitDebug("pdf:ocr:late-progress-ignored", {
        ocrRunId,
        state: runtime.pdfOcr.state || "",
        errorKind: runtime.pdfOcr.errorKind || "",
        message: event && event.message || "",
        exactIssue: "A late OCR progress callback arrived after SkimRoute had already reached a ready/failure state. The app ignored it so the UI does not revert to Scanning."
      });
      emitDebug("pdf:ocr:stale-progress-ignored", {
        ocrRunId,
        activeOcrRunId: getActivePdfOcrRunId(),
        state: runtime.pdfOcr.state || "",
        errorKind: runtime.pdfOcr.errorKind || "",
        message: event && event.message || "",
        exactIssue: "A late OCR progress callback arrived after a terminal PDF status, so SkimRoute preserved the ready/terminal state."
      });
      return;
    }
    if (
      runtime.pdfOcr
      && /^ready$/i.test(String(runtime.pdfOcr.state || ""))
      && getReadyPdfOcrModelCandidate({ reason: "progress-ready-guard" })
    ) {
      emitDebug("pdf:ocr:stale-progress-ignored", {
        ocrRunId,
        activeOcrRunId: getActivePdfOcrRunId(),
        state: runtime.pdfOcr.state || "",
        message: event && event.message || "",
        exactIssue: "A progress update tried to run after OCR had already saved a ready map; SkimRoute kept the authoritative ready state."
      });
      return;
    }
    const progress = event && Number.isFinite(event.percent)
      ? Math.max(0, Math.min(100, Math.round(event.percent)))
      : runtime.pdfOcr.progress || 0;
    const phase = event && event.phase === "ocr" || allowOcr ? "ocr" : "extracting";
    runtime.pdfOcr.progress = progress;
    runtime.pdfOcr.state = phase;
    runtime.pdfOcr.mode = event && event.mode ? String(event.mode) : runtime.pdfOcr.mode || (phase === "ocr" ? "smart" : "");
    runtime.pdfOcr.slowDevice = Boolean(event && event.device && event.device.slow) || runtime.pdfOcr.slowDevice;
    const liveOcrCopy = isPdfOcrWorkerActiveForRun(ocrRunId)
      ? PDF_OCR_RUNNING_MESSAGE
      : runtime.pdfOcr.mode === "better"
        ? PDF_OCR_BETTER_EXPECTATION_MESSAGE
        : PDF_OCR_FAST_EXPECTATION_MESSAGE;
    const eventMessage = event && event.message ? String(event.message) : "";
    const safeEventMessage = phase === "ocr" && !isPdfOcrWorkerActiveForRun(ocrRunId) && /\b(running ocr|reading scanned text|reading the scanned text)\b/i.test(eventMessage)
      ? ""
      : eventMessage;
    runtime.pdfOcr.progressMessage = safeEventMessage
      ? safeEventMessage
      : phase === "ocr" && isPdfOcrWorkerActiveForRun(ocrRunId)
        ? liveOcrCopy
        : runtime.pdfOcr.progressMessage || (phase === "ocr" ? liveOcrCopy : PDF_OCR_DETECTION_MESSAGE);

    const now = Date.now();
    if (
      phase === "ocr"
      && runtime.pdfOcr.analysisStartedAt
      && now - runtime.pdfOcr.analysisStartedAt > 30000
      && now - (runtime.pdfOcr.lastLongRunningNoticeAt || 0) > 15000
    ) {
      runtime.pdfOcr.lastLongRunningNoticeAt = now;
      runtime.pdfOcr.progressMessage = PDF_OCR_LONG_RUNNING_MESSAGE;
      emitDebug("pdf:ocr:long-running", {
        ocrRunId,
        mode: runtime.pdfOcr.mode || "",
        elapsedMs: now - runtime.pdfOcr.analysisStartedAt,
        progress,
        exactIssue: "OCR is taking longer on this device, so SkimRoute is keeping controls responsive and exposing Cancel OCR."
      });
      publishStatusUpdate("pdf:ocr:long-running");
    }
    if (progress < 100 && now - (runtime.pdfOcr.lastProgressRenderedAt || 0) < 250) {
      return;
    }
    runtime.pdfOcr.lastProgressRenderedAt = now;
    if (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf") {
      const mode = event && event.mode ? String(event.mode) : runtime.pdfOcr.mode || "";
      const explicitMessage = safeEventMessage || runtime.pdfOcr.progressMessage || "";
      const ocrBase = runtime.pdfOcr.lastLongRunningNoticeAt && now - runtime.pdfOcr.analysisStartedAt > 30000
        ? PDF_OCR_LONG_RUNNING_MESSAGE
        : explicitMessage || liveOcrCopy;
      const prompt = phase === "ocr"
        ? progress ? `${ocrBase} ${progress}%` : ocrBase
        : progress ? `${PDF_OCR_DETECTION_MESSAGE} ${progress}%` : PDF_OCR_DETECTION_MESSAGE;
      runtime.model = buildPdfProcessingModel(runtime.model, prompt, phase);
      render();
    }
  }

  function mergeOcrText(existing, next) {
    const current = String(existing || "").trim();
    const addition = String(next || "").trim();
    if (!current) return addition;
    if (!addition) return current;
    if (current.includes(addition)) return current;
    if (addition.includes(current)) return addition;
    return `${current}\n${addition}`;
  }

  async function requestVisibleTabCapture() {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
          reject(new Error("Extension messaging is unavailable."));
          return;
        }
        chrome.runtime.sendMessage({ type: "PAGEPILOT_CAPTURE_VISIBLE_TAB" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "Capture failed."));
            return;
          }
          if (!response || !response.ok || !response.dataUrl) {
            reject(new Error((response && response.error) || "Capture failed."));
            return;
          }
          resolve(response.dataUrl);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function detectTextFromImageDataUrl(dataUrl) {
    const Detector = window.TextDetector;
    if (typeof Detector !== "function") {
      throw new Error("TextDetector is not available.");
    }

    const image = new Image();
    image.decoding = "async";
    image.src = dataUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
      });
    }

    const detector = new Detector();
    const results = await detector.detect(image);
    if (!Array.isArray(results) || !results.length) return "";

    const lines = results
      .map((item) => ({
        text: String(item.rawValue || item.text || "").trim(),
        x: item.boundingBox ? item.boundingBox.x : 0,
        y: item.boundingBox ? item.boundingBox.y : 0
      }))
      .filter((item) => item.text)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));

    const grouped = [];
    const Y_TOLERANCE = 20;
    lines.forEach((line) => {
      const group = grouped[grouped.length - 1];
      if (!group || Math.abs(group.y - line.y) > Y_TOLERANCE) {
        grouped.push({ y: line.y, parts: [line.text] });
      } else {
        group.parts.push(line.text);
      }
    });

    return grouped.map((group) => group.parts.join(" ")).join("\n");
  }


  function attachGlobalEvents() {
    addWindowListener("scroll", requestScrollUpdate, { passive: true });
    addDocumentListener("scroll", requestScrollUpdate, { passive: true, capture: true });
    addWindowListener("resize", requestResizeUpdate, { passive: true });
    addWindowListener("keydown", handleShortcut, true);
    addWindowListener("wheel", clearJumpEffectFromUser, { passive: true });
    addWindowListener("touchstart", clearJumpEffectFromUser, { passive: true });
    addWindowListener("pagehide", (event) => {
      if (!event.persisted) {
        destroy();
      }
    }, { once: true });

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(handleMessage);
      }
    } catch (error) {
      // Restricted pages can reject extension messaging while the injected UI remains usable.
    }
  }

  function addWindowListener(type, listener, options) {
    addTrackedListener(window, type, listener, options);
  }

  function addDocumentListener(type, listener, options) {
    addTrackedListener(document, type, listener, options);
  }

  function addTrackedListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    runtime.listeners.push({ target, type, listener, options });
  }

  function sendFreshPublicStats(sendResponse, options = {}) {
    const reason = options.reason || "status";
    const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 0;
    const scanReason = options.scanReason || reason;
    const scanAgainReason = options.scanAgainReason || "";
    const maxWaitMs = Number.isFinite(Number(options.maxWaitMs))
      ? Math.max(0, Number(options.maxWaitMs))
      : isPdfRouteLocked()
        ? 4200
        : isKnownAiHost()
          ? 2200
          : delayMs;
    const pollMs = Math.max(120, Math.min(420, delayMs || 220));

    const shouldWaitForStable = (stats) => {
      if (!maxWaitMs || !stats || !stats.ok) return false;
      if (stats.usableSnapshot || stats.pdfReady || stats.chatReady || stats.pdfTerminal) return false;
      if (stats.pageType === "chat") return Boolean(stats.loading || stats.sections < 1 || stats.words < 35);
      if (stats.pageType === "pdf") return false;
      return false;
    };

    const sendBest = () => {
      const stableStats = getImmediateStableStats(reason);
      sendResponse(stableStats || getPublicStats());
    };

    try {
      const immediateStable = getImmediateStableStats(reason);
      if (immediateStable && !options.forceScan) {
        sendResponse(immediateStable);
        return true;
      }

      if (options.scan) {
        scanPage(scanReason);
      }

      const firstStats = getPublicStats();
      if (!shouldWaitForStable(firstStats)) {
        sendResponse(firstStats);
        return true;
      }

      const startedAt = Date.now();
      let attempts = 0;
      const tick = () => {
        try {
          attempts += 1;
          const stableStats = getImmediateStableStats(`${reason}:wait`);
          if (stableStats) {
            sendResponse(stableStats);
            return;
          }
          if (scanAgainReason && attempts === 1) {
            scanPage(scanAgainReason);
          }
          const stats = getPublicStats();
          if (!shouldWaitForStable(stats) || Date.now() - startedAt >= maxWaitMs) {
            sendResponse(stats);
            return;
          }
          window.setTimeout(tick, pollMs);
        } catch (error) {
          sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
        }
      };
      window.setTimeout(tick, pollMs);
      return true;
    } catch (error) {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      return true;
    }
  }

  function handleStatusMessage(sendResponse) {
    (async () => {
      const stableStatus = getImmediateStableStats("status");
      if (stableStatus) {
        sendResponse(stableStatus);
        return;
      }

      if (isPdfRouteLocked() || isPdfLikePage()) {
        const readyPdfModel = getReadyPdfModelForStatus(getPdfDocumentRouteKey());
        if (readyPdfModel && readyPdfModel.model) {
          sendResponse(getPublicStats());
          return;
        }
        const routeKey = getRouteCacheKey();
        const hydrated = await hydratePdfCache(routeKey, { source: "status" });
        if (hydrated) {
          const recovered = buildRecoveredPdfModelFromCache(routeKey, "status-cache", runtime.model);
          if (recovered) {
            runtime.model = recovered;
            rememberStablePdfModel(recovered, "status-cache");
            render();
            publishStatusUpdate("status-cache");
          }
          sendResponse(getImmediateStableStats("status-cache") || getPublicStats());
          return;
        }
      }

      if (
        runtime.model
        && runtime.model.pageProfile
        && isPdfRouteLocked()
        && Number(runtime.model.totalReadableWords || 0) < 80
      ) {
        if (hydratePdfSessionCache(getRouteCacheKey())) {
          scanPage("pdf-cache");
        } else {
          schedulePdfRecoveryAttempt("status");
        }
      }

      if (!isPdfRouteLocked() && (isKnownAiHost() || (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "chat"))) {
        try {
          scanPage("popup");
        } catch (error) {
          emitDebug("popup:rescan:error", {
            error: String(error && error.message ? error.message : error),
            exactIssue: "SkimRoute tried to refresh the chat model for the popup but the foreground scan failed."
          });
        }
        sendFreshPublicStats(sendResponse, {
          reason: "popup-ready",
          scanAgainReason: "popup-ready",
          delayMs: 220,
          maxWaitMs: 2400
        });
        return;
      }

      sendFreshPublicStats(sendResponse, {
        reason: "status",
        delayMs: isPdfRouteLocked() ? 260 : 0,
        maxWaitMs: isPdfRouteLocked() ? 4500 : 0
      });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    });
    return true;
  }

  function emitPdfActionCommandRouted(type, options = {}, details = {}) {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return;
    const routeKey = details.routeKey || getRouteCacheKey();
    emitDebug("pdf:action:command-routed", {
      type,
      routeKey,
      source: options.source || details.source || "",
      command: details.command || type,
      messageType: details.messageType || "",
      mode: options.mode || details.mode || "",
      stage: details.stage || "content",
      exactIssue: "none"
    });
  }

  function emitPdfActionCommandReceived(type, options = {}, details = {}) {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return;
    const routeKey = details.routeKey || getRouteCacheKey();
    emitDebug("pdf:action:received", {
      type,
      routeKey,
      source: options.source || details.source || "",
      command: details.command || type,
      messageType: details.messageType || "",
      mode: options.mode || details.mode || "",
      commandOnly: true,
      exactIssue: "none"
    });
    emitPdfActionCommandRouted(type, options, { ...details, routeKey });
  }

  function handlePdfActionMessage(sendResponse, type, options = {}) {
    emitPdfActionCommandReceived(type, options, { stage: "popup-message", command: "pdf-navigation" });
    try {
      runPdfAction(type, options);
      sendResponse(getPdfActionResponseStats());
    } catch (error) {
      emitDebug("pdf:action:blocked", {
        type,
        actionId: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        blockedReason: "pdf-action-message-error",
        error: String(error && error.message ? error.message : error),
        exactIssue: "SkimRoute could not start the PDF action from the popup/sidebar message."
      });
      sendResponse(getPdfActionResponseStats());
    }
    return true;
  }

  function handlePdfRescanMessage(sendResponse, options = {}) {
    emitPdfActionCommandReceived("rescan", options, { stage: "popup-message", command: "rescan" });
    (async () => {
      const routeKey = getRouteCacheKey();
      await hydratePdfCache(routeKey, { source: "message:rescan" });
      adoptAuthoritativePdfModel("message:rescan:cache");
      const cachedStats = getPublicStats();
      if (
        cachedStats
        && cachedStats.ok
        && cachedStats.pageType === "pdf"
        && cachedStats.pdfStatusVerified !== false
        && (cachedStats.pdfReady || cachedStats.usableSnapshot)
      ) {
        setActionResult("rescan", true, {
          phase: "completed",
          message: cachedStats.pdfCacheHit ? "Loaded saved PDF map." : "PDF map ready."
        });
        emitDebug("pdf:action:completed", {
          type: "rescan",
          routeKey,
          cacheHit: Boolean(cachedStats.pdfCacheHit),
          exactIssue: "Verified PDF status already exists; SkimRoute skipped a redundant rescan."
        });
        sendResponse(getPublicStats());
        return;
      }
      sendFreshPublicStats(sendResponse, {
        reason: "popup",
        scan: true,
        scanReason: "popup",
        scanAgainReason: "",
        delayMs: 0,
        maxWaitMs: isPdfRouteLocked() ? 4500 : 0
      });
    })().catch((error) => {
      emitDebug("pdf:action:blocked", {
        type: "rescan",
        error: String(error && error.message ? error.message : error),
        blockedReason: "pdf-rescan-command-error",
        exactIssue: "SkimRoute received the PDF rescan command, but could not hydrate/adopt status before responding."
      });
      sendResponse(getPublicStatsSafely());
    });
    return true;
  }

  function handlePdfOcrMessage(sendResponse, mode, options = {}) {
    const ocrMode = getManualPdfOcrMode(mode || "fast");
    emitPdfActionCommandReceived("run-pdf-ocr", { ...options, mode: ocrMode }, { stage: "popup-message", command: "manual-ocr" });
    (async () => {
      const routeKey = getRouteCacheKey();
      await hydratePdfCache(routeKey, { source: "manual-ocr" });
      if (runtime.pdfOcr && runtime.pdfOcr.attemptedForRoute === routeKey) {
        runtime.pdfOcr.completedForRoute = "";
      }
      runManualPdfOcr(ocrMode);
      sendFreshPublicStats(sendResponse, {
        reason: "manual-ocr-status",
        delayMs: 0,
        maxWaitMs: 0
      });
    })().catch((error) => {
      emitDebug("pdf:action:blocked", {
        type: "run-pdf-ocr",
        mode: ocrMode,
        error: String(error && error.message ? error.message : error),
        blockedReason: "pdf-ocr-command-error",
        exactIssue: "SkimRoute received the OCR command, but could not start OCR."
      });
      sendResponse(getPublicStatsSafely());
    });
    return true;
  }

  function handlePdfCancelOcrMessage(sendResponse, options = {}) {
    emitPdfActionCommandReceived("cancel-ocr", options, { stage: "popup-message", command: "cancel-ocr" });
    cancelPdfOcr(options.source || "popup");
    sendResponse(getPublicStats());
    return true;
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message || typeof message !== "object") {
      return false;
    }

    if (message.type === "PAGEPILOT_TOGGLE") {
      if (isPdfRouteLocked() || isPdfLikePage()) {
        return handlePdfActionMessage(sendResponse, "toggle", {
          open: typeof message.open === "boolean" ? message.open : true,
          focus: Boolean(message.open),
          source: "popup"
        });
      }
      setMode(typeof message.open === "boolean" && message.open ? "open" : modeForClosedState(), { focus: Boolean(message.open), persist: true });
      return sendFreshPublicStats(sendResponse, {
        reason: "open-recheck",
        scan: true,
        scanReason: "open-recheck",
        scanAgainReason: isKnownAiHost() ? "open-recheck-chat-ready" : "",
        delayMs: isPdfRouteLocked() || isKnownAiHost() ? 260 : 0
      });
    }

    if (message.type === "PAGEPILOT_SCAN") {
      if (isPdfRouteLocked() || isPdfLikePage()) {
        return handlePdfRescanMessage(sendResponse, { source: "popup" });
      }
      return sendFreshPublicStats(sendResponse, {
        reason: "popup",
        scan: true,
        scanReason: "popup",
        scanAgainReason: isKnownAiHost() ? "popup-ready" : "",
        delayMs: isPdfRouteLocked() || isKnownAiHost() ? 260 : 0
      });
    }

    if (message.type === "PAGEPILOT_JUMP_USEFUL") {
      if (isPdfRouteLocked() || isPdfLikePage()) {
        return handlePdfActionMessage(sendResponse, "jump", { focus: true, source: "popup" });
      }
      setMode("open", { focus: true, persist: true });
      const section = getSectionForAction("jump");
      const ok = jumpToUsefulPart();
      setActionResult("jump", ok, { section });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_NEXT_IMPORTANT") {
      if (isPdfRouteLocked() || isPdfLikePage()) {
        return handlePdfActionMessage(sendResponse, "next", { focus: true, source: "popup" });
      }
      setMode("open", { focus: true, persist: true });
      const section = getSectionForAction("next");
      const ok = jumpToNextImportant();
      setActionResult("next", ok, { section });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_STATUS") {
      return handleStatusMessage(sendResponse);
    }

    if (message.type === "PAGEPILOT_DEBUG_PDF_CACHE") {
      (async () => {
        const routeKey = getPdfDocumentRouteKey();
        emitPdfCachePreflight("debug-message", routeKey);
        const persistentStore = await readPdfPersistentCacheStore({ keepExpired: true, routeKey });
        const persistent = getPdfCacheRouteKeys(routeKey).map((key) => {
          const entry = normalizePdfCacheEntry(persistentStore[key]);
          return {
            key,
            exists: Boolean(persistentStore[key]),
            usable: isPdfCacheEntryUsable(entry),
            expired: entry ? isPdfCacheEntryExpired(entry) : false,
            words: entry && entry.words || 0,
            source: entry && entry.source || "",
            cacheSource: entry && entry.cacheSource || "",
            updatedAt: entry && entry.updatedAt || 0,
            hasMapSnapshot: Boolean(entry && entry.mapSnapshot),
            fingerprint: entry && entry.fingerprint || null
          };
        });
        sendResponse({
          ok: true,
          routeKey,
          keys: getPdfCacheRouteKeys(routeKey),
          persistent,
          bytesInUse: await getPdfPersistentBytesInUse(),
          stats: getPublicStats()
        });
      })().catch((error) => {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      });
      return true;
    }

    if (message.type === "PAGEPILOT_RUN_PDF_OCR") {
      return handlePdfOcrMessage(sendResponse, message.mode || "fast", { source: "popup" });
    }

    if (message.type === "PAGEPILOT_CANCEL_PDF_OCR") {
      return handlePdfCancelOcrMessage(sendResponse, { source: "popup" });
    }

    return false;
  }

  function watchPageChanges() {
    runtime.mutationObserver = new MutationObserver((mutations) => {
      if (isGoogleDocsLikePage() && mutations.some(isGoogleDocsLiveMutation)) {
        scheduleGoogleDocsLiveScan("mutation");
        return;
      }
      if (mutations.some(mutationLooksMeaningful)) {
        scheduleScan("mutation");
      }
    });

    runtime.mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-label", "class", "data-message-author-role", "data-role", "data-testid", "role"],
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  function watchRouteChanges() {
    patchHistory();
    runtime.urlWatchTimer = window.setInterval(() => {
      const nextUrl = getCurrentUrl();
      if (nextUrl !== runtime.currentUrl) {
        handleRouteChange(nextUrl);
      }
    }, URL_WATCH_INTERVAL_MS);

    addWindowListener("popstate", () => queueRouteCheck(), { passive: true });
    addWindowListener("hashchange", () => queueRouteCheck(), { passive: true });
    addWindowListener("pagepilot:routechange", () => queueRouteCheck(), { passive: true });
  }

  function patchHistory() {
    if (window.__PAGEPILOT_HISTORY_PATCHED__) return;
    window.__PAGEPILOT_HISTORY_PATCHED__ = true;
    ["pushState", "replaceState"].forEach((name) => {
      const original = history[name];
      history[name] = function patchedHistoryMethod() {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event("pagepilot:routechange"));
        return result;
      };
    });
  }

  function queueRouteCheck() {
    if (runtime.routeQueued) return;
    runtime.routeQueued = true;
    window.setTimeout(() => {
      runtime.routeQueued = false;
      const nextUrl = getCurrentUrl();
      if (nextUrl !== runtime.currentUrl) {
        handleRouteChange(nextUrl);
      }
    }, 80);
  }

  async function handleRouteChange(nextUrl) {
    runtime.currentUrl = nextUrl;
    runtime.view.mode = "minimized";
    runtime.view.activeId = null;
    runtime.view.collapsedSectionIds.clear();
    clearChatReadinessPolling();
    window.clearTimeout(runtime.pdfOcr.retryTimer);
    runtime.pdfOcr.pending = false;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.retryStartedAt = 0;
    runtime.pdfOcr.retryCount = 0;
    runtime.pdfOcr.retryTimer = null;
    runtime.pdfOcr.attemptedForRoute = "";
    runtime.pdfOcr.completedForRoute = "";
    runtime.pdfOcr.deepPending = false;
    runtime.pdfOcr.deepForRoute = "";
    runtime.pdfOcr.deepCompletedForRoute = "";
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.analysisStartedAt = 0;
    runtime.pdfOcr.autoOcrAttemptedForRoute = "";
    runtime.pdfOcr.cacheHit = false;
    runtime.pdfOcr.cacheSource = "";
    runtime.pdfOcr.cacheUpdatedAt = 0;
    runtime.stableChatModel = null;
    runtime.stableChatRouteKey = "";
    resetGoogleDocsLiveState();
    stopPdfAnalysisWatchdog();
    runtime.pdfJumpMode = "";
    runtime.pendingPdfControlledJump = null;
    if (runtime.pdfAction && runtime.pdfAction.timeoutTimer) {
      window.clearTimeout(runtime.pdfAction.timeoutTimer);
    }
    runtime.pdfAction = {
      token: "",
      actionId: "",
      activeActionId: "",
      type: "",
      phase: "",
      targetPage: 0,
      targetSectionId: "",
      targetKey: "",
      startedAt: 0,
      updatedAt: 0,
      completedAt: 0,
      timeoutTimer: null,
      cancelled: false,
      completed: false
    };
    runtime.lastAction = null;
    closePagePilotPdfModeConsentDialog(false);
    clearPagePilotPdfModeNotice();
    if (window.__PAGEPILOT_PDF_OCR_CACHE__) {
      window.__PAGEPILOT_PDF_OCR_CACHE__ = Object.create(null);
    }
    if (isPdfRouteLocked() || isPdfLikePage()) {
      emitPdfCachePreflight("route-before-hydrate", getPdfDocumentRouteKey());
      await hydratePdfCache(getPdfDocumentRouteKey(), { source: "route" });
      requestPdfFileAccessStatus();
    }
    clearJumpEffect();
    scanPage("route");
    await restorePageMode();
    render();
    scheduleWarmupScans("route");
  }

  function getCurrentUrl() {
    const pdfPageHash = /^#page=\d+/i.test(window.location.hash);
    const routeHash = !pdfPageHash && /^(#\/|#!|#chat|#conversation)/i.test(window.location.hash) ? window.location.hash : "";
    return `${window.location.origin}${window.location.pathname}${window.location.search}${routeHash}`;
  }

  function mutationLooksMeaningful(mutation) {
    const root = runtime.ui && runtime.ui.getRoot ? runtime.ui.getRoot() : document.getElementById(ROOT_ID);

    if (root && mutation.target && root.contains(mutation.target)) {
      return false;
    }

    if (
      mutation.target
      && mutation.target.closest
      && mutation.target.closest("#pagepilot-pdf-controlled-viewer, .pagepilot-pdf-mode-consent, .pagepilot-pdf-mode-notice, .pagepilot-pdf-page-section-highlight, .pagepilot-pdf-owned-focus, .pagepilot-pdf-focus-overlay, .pagepilot-pdf-jump-marker, .pagepilot-google-docs-highlight, .pagepilot-google-docs-notice")
    ) {
      return false;
    }

    const targetElement = mutation.target && mutation.target.nodeType === Node.TEXT_NODE
      ? mutation.target.parentElement
      : mutation.target;
    if (targetElement && targetElement.classList && targetElement.classList.contains("pagepilot-pdf-page-highlight-host")) {
      return false;
    }
    if (root && targetElement && root.contains(targetElement)) {
      return false;
    }

    if (mutation.type === "characterData") {
      const text = runtime.engine.helpers.cleanText(mutation.target.textContent || "");
      if (runtime.engine.helpers.countWords(text) < 3) return false;
      return isChatLikePage() || isPdfLikePage() || elementLooksConversationLike(targetElement) || elementLooksPdfLike(targetElement);
    }

    if (mutation.type === "attributes") {
      return elementLooksConversationLike(targetElement) || elementLooksPdfLike(targetElement);
    }

    return Array.from(mutation.addedNodes).some((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const element = node;
      if (root && (element === root || root.contains(element) || element.contains(root))) return false;
      if (element.matches && element.matches("#pagepilot-pdf-controlled-viewer, .pagepilot-pdf-mode-consent, .pagepilot-pdf-mode-notice, .pagepilot-pdf-page-section-highlight, .pagepilot-pdf-owned-focus, .pagepilot-pdf-focus-overlay, .pagepilot-pdf-jump-marker, .pagepilot-google-docs-highlight, .pagepilot-google-docs-notice")) return false;
      if (element.closest && element.closest("#pagepilot-pdf-controlled-viewer, .pagepilot-pdf-mode-consent, .pagepilot-pdf-mode-notice, .pagepilot-pdf-page-section-highlight, .pagepilot-pdf-owned-focus, .pagepilot-pdf-focus-overlay, .pagepilot-pdf-jump-marker, .pagepilot-google-docs-highlight, .pagepilot-google-docs-notice")) return false;
      if (runtime.engine.helpers.isLowValueElement(element)) return false;
      const text = runtime.engine.helpers.cleanText(element.innerText || element.textContent || "");
      const words = runtime.engine.helpers.countWords(text);
      if ((isChatLikePage() || elementLooksConversationLike(element)) && words >= 3) {
        return true;
      }
      if ((isPdfLikePage() || elementLooksPdfLike(element)) && words >= 4) {
        return true;
      }
      if (isGoogleDocsLikePage() && isGoogleDocsDocumentContentElement(element) && words >= 2) {
        return true;
      }
      if (words < 32) return false;
      return !/\b(cookie|subscribe|newsletter|advertisement|sponsored|sign up)\b/i.test(text.slice(0, 1200));
    });
  }

  function isGoogleDocsLikePage() {
    try {
      const url = new URL(window.location.href);
      return url.hostname === "docs.google.com" && /^\/document\/d\/[^/?#]+/i.test(url.pathname);
    } catch (error) {
      return /:\/\/docs\.google\.com\/document\/d\//i.test(String(window.location && window.location.href || ""));
    }
  }

  function getGoogleDocsActiveTabFromUrl() {
    try {
      const url = new URL(window.location.href);
      return (url.searchParams.get("tab") || "default").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "default";
    } catch (error) {
      return "default";
    }
  }

  function isGoogleDocsLiveMutation(mutation) {
    if (!mutation || !isGoogleDocsLikePage()) return false;
    const target = mutation.target && mutation.target.nodeType === Node.TEXT_NODE
      ? mutation.target.parentElement
      : mutation.target;
    if (target && isGoogleDocsChromeElement(target)) return false;
    if (target && isGoogleDocsDocumentContentElement(target)) {
      if (mutation.type === "characterData") {
        const text = runtime.engine && runtime.engine.helpers ? runtime.engine.helpers.cleanText(target.textContent || "") : String(target.textContent || "").trim();
        return countGoogleDocsWords(text) >= 1;
      }
      if (mutation.type === "attributes") {
        return /^(class|aria-label|role|data-text|data-content|data-value)$/i.test(String(mutation.attributeName || ""));
      }
    }
    return Array.from(mutation.addedNodes || []).some((node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      const element = node;
      if (isGoogleDocsChromeElement(element)) return false;
      if (isGoogleDocsDocumentContentElement(element)) return true;
      if (element.querySelector && element.querySelector(".kix-lineview, .kix-paragraphrenderer, .kix-wordhtmlgenerator-word-node, .kix-page-content, .docs-pageless-content, [aria-label*='Document content' i]")) {
        return true;
      }
      return false;
    });
  }

  function scheduleGoogleDocsLiveScan(reason = "google-docs-live") {
    if (!isGoogleDocsLikePage()) return false;
    const signature = getGoogleDocsLiveSignature(document);
    const live = runtime.googleDocsLive;
    const ready = isUsableGoogleDocsModel(runtime.model) || isUsableGoogleDocsModel(live.lastUsableModel);
    const decision = shouldScheduleGoogleDocsLiveScan({
      previousSignature: live.lastSignature,
      nextSignature: signature.value,
      now: Date.now(),
      lastScanAt: Number(live.lastScanAt || runtime.lastScanAt || 0),
      ready
    });
    if (!decision.schedule) {
      live.skippedCount += 1;
      emitDebug("google-docs:live-update:skipped", {
        reason,
        routeKey: getRouteCacheKey(),
        skippedReason: decision.reason,
        signature: signature.value || "",
        lineCount: signature.lineCount,
        exactIssue: "Google Docs live update skipped because mounted document content did not materially change or the throttle is active."
      });
      return false;
    }
    live.lastSignature = signature.value;
    live.routeKey = getRouteCacheKey();
    live.activeTab = getGoogleDocsActiveTabFromUrl();
    live.scheduledCount += 1;
    window.clearTimeout(live.pendingTimer);
    const delay = ready ? GOOGLE_DOCS_LIVE_READY_DELAY_MS : GOOGLE_DOCS_LIVE_FAST_DELAY_MS;
    live.pendingTimer = window.setTimeout(() => {
      live.pendingTimer = null;
      const run = () => {
        live.lastScanAt = Date.now();
        scanPage("google-docs-live");
      };
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: ready ? 1500 : 700 });
      } else {
        run();
      }
    }, Math.max(delay, decision.waitMs || 0));
    emitDebug("google-docs:live-update:scheduled", {
      reason,
      routeKey: live.routeKey,
      activeTab: live.activeTab,
      delayMs: Math.max(delay, decision.waitMs || 0),
      ready,
      signature: signature.value || "",
      lineCount: signature.lineCount,
      rootCount: signature.rootCount,
      exactIssue: "A Google Docs document/content mutation scheduled a bounded local rescan."
    });
    return true;
  }

  function shouldScheduleGoogleDocsLiveScan(details = {}) {
    const previousSignature = String(details.previousSignature || "");
    const nextSignature = String(details.nextSignature || "");
    if (!nextSignature) return { schedule: false, reason: "empty-signature", waitMs: 0 };
    if (previousSignature && previousSignature === nextSignature) return { schedule: false, reason: "unchanged-signature", waitMs: 0 };
    const now = Number(details.now || Date.now());
    const lastScanAt = Number(details.lastScanAt || 0);
    const minInterval = details.ready ? GOOGLE_DOCS_LIVE_READY_MIN_INTERVAL_MS : GOOGLE_DOCS_LIVE_MIN_INTERVAL_MS;
    const elapsed = lastScanAt ? now - lastScanAt : minInterval;
    return {
      schedule: true,
      reason: elapsed >= minInterval ? "changed" : "throttled-change",
      waitMs: Math.max(0, minInterval - elapsed)
    };
  }

  function getGoogleDocsLiveSignature(doc = document) {
    const roots = getGoogleDocsLiveContentRoots(doc);
    const lineNodes = uniqueElements(roots.flatMap((root) => {
      if (!root || !root.querySelectorAll) return [];
      return Array.from(root.querySelectorAll(".kix-lineview, .kix-paragraphrenderer, .kix-wordhtmlgenerator-word-node, h1, h2, h3, p, li, [role='heading'], [role='paragraph'], [aria-label], [data-text], [data-content], [data-value]"));
    }))
      .filter((node) => node && !isGoogleDocsChromeElement(node));
    const textParts = lineNodes
      .slice(0, 80)
      .map((node) => getGoogleDocsLiveNodeText(node))
      .filter(Boolean)
      .slice(0, 40);
    const outlineCount = doc && doc.querySelectorAll ? doc.querySelectorAll(GOOGLE_DOCS_OUTLINE_SELECTOR).length : 0;
    const sample = textParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 1400);
    const sampleWords = countGoogleDocsWords(sample);
    const value = [
      getRouteCacheKey(),
      getGoogleDocsActiveTabFromUrl(),
      roots.length,
      lineNodes.length,
      outlineCount,
      hashString(sample)
    ].join("|");
    return {
      value,
      rootCount: roots.length,
      lineCount: lineNodes.length,
      outlineCount,
      sampleWords,
      sample
    };
  }

  function getGoogleDocsLiveContentRoots(doc = document) {
    if (!doc || !doc.querySelectorAll) return [];
    return uniqueElements(Array.from(doc.querySelectorAll(GOOGLE_DOCS_CONTENT_SELECTOR)))
      .filter((node) => node && !isGoogleDocsChromeElement(node));
  }

  function getGoogleDocsLiveNodeText(node) {
    if (!node) return "";
    const values = [
      node.innerText,
      node.textContent,
      node.getAttribute && node.getAttribute("aria-label"),
      node.getAttribute && node.getAttribute("data-text"),
      node.getAttribute && node.getAttribute("data-content"),
      node.getAttribute && node.getAttribute("data-value"),
      node.getAttribute && node.getAttribute("title")
    ];
    return values.map((value) => String(value || "").replace(/\s+/g, " ").trim())
      .find((value) => value && !/\b(file|edit|view|insert|format|tools|extensions|help|share|toolbar|menu)\b/i.test(value.slice(0, 140))) || "";
  }

  function hashString(text) {
    let hash = 0;
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }

  function resetGoogleDocsLiveState() {
    if (runtime.googleDocsLive && runtime.googleDocsLive.pendingTimer) {
      window.clearTimeout(runtime.googleDocsLive.pendingTimer);
    }
    runtime.googleDocsLive = {
      routeKey: "",
      activeTab: "",
      lastSignature: "",
      lastUsableModel: null,
      lastUsableSignature: "",
      lastScanAt: 0,
      pendingTimer: null,
      scheduledCount: 0,
      skippedCount: 0,
      appliedCount: 0
    };
  }

  function scheduleScan(reason) {
    window.clearTimeout(runtime.scanTimer);
    const elapsed = Date.now() - runtime.lastScanAt;
    const fastScan = isChatLikePage()
      || isPdfLikePage()
      || isGoogleDocsLikePage()
      || /\b(chat|conversation|stream|pdf|warmup)\b/i.test(String(reason || ""));
    const delay = Math.max(
      fastScan ? FAST_MUTATION_SCAN_DELAY_MS : MUTATION_SCAN_DELAY_MS,
      (fastScan ? FAST_RESCAN_INTERVAL_MS : MIN_RESCAN_INTERVAL_MS) - elapsed
    );

    runtime.scanTimer = window.setTimeout(() => {
      const run = () => scanPage(reason);
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 1000 });
      } else {
        run();
      }
    }, delay);
  }

  function scheduleWarmupScans(reason) {
    clearWarmupScans();
    if (!shouldWarmupScan()) return;
    const delays = isChatLikePage()
      ? CHAT_WARMUP_SCAN_DELAYS_MS
      : isGoogleDocsLikePage()
        ? [220, 700, 1600, 3200, 6500, 12000]
      : isPdfLikePage()
        ? [180, 500, 1100, 2200]
        : WARMUP_SCAN_DELAYS_MS;
    runtime.warmupTimers = delays.map((delay) => window.setTimeout(() => {
      scanPage(`${reason}-warmup`);
    }, delay));
  }

  function clearWarmupScans() {
    runtime.warmupTimers.forEach((timer) => window.clearTimeout(timer));
    runtime.warmupTimers = [];
  }

  function shouldWarmupScan() {
    if ((isPdfLikePage() || isPdfRouteLocked()) && isUsablePdfStatsModel(runtime.model, true)) {
      return false;
    }
    return isKnownAiHost()
      || isPdfLikePage()
      || isGoogleDocsLikePage()
      || (runtime.model && ["chat", "pdf"].includes(runtime.model.pageProfile.type))
      || Boolean(document.querySelector(".textLayer, [data-page-number], pdf-viewer, embed[type='application/pdf'], iframe[src*='.pdf']"));
  }

  function scheduleChatReadinessPolling(reason, model) {
    if (!shouldKeepChatReadinessPolling(model)) {
      clearChatReadinessPolling();
      return;
    }
    if (runtime.chatReadinessTimer) return;
    if (!runtime.chatReadinessStartedAt) {
      runtime.chatReadinessStartedAt = Date.now();
    }
    const elapsed = Date.now() - runtime.chatReadinessStartedAt;
    if (elapsed > 9000) {
      emitDebug("chat:readiness:stopped", {
        reason,
        elapsed,
        exactIssue: "Chat readiness polling reached the launch-friendly cap. SkimRoute will rely on mutation scans and popup foreground scans from here instead of showing a long first-load wait."
      });
      clearChatReadinessPolling();
      return;
    }
    const delay = elapsed < 2500 ? 420 : elapsed < 6000 ? 850 : 1600;
    const baseReason = normalizeChatReadinessReason(reason || "chat");
    runtime.chatReadinessTimer = window.setTimeout(() => {
      runtime.chatReadinessTimer = null;
      if (shouldKeepChatReadinessPolling(runtime.model)) {
        scanPage(`${baseReason}-chat-ready`);
      }
    }, delay);
  }

  function clearChatReadinessPolling() {
    if (runtime.chatReadinessTimer) {
      window.clearTimeout(runtime.chatReadinessTimer);
    }
    runtime.chatReadinessTimer = null;
    runtime.chatReadinessStartedAt = 0;
  }

  function normalizeChatReadinessReason(reason) {
    const raw = String(reason || "chat");
    const compact = raw
      .replace(/(?::loading)+$/gi, "")
      .replace(/(?:-(?:chat-ready|warmup|loading))+$/gi, "")
      .replace(/(?:-chat-ready){2,}/gi, "-chat-ready");
    return compact || "chat";
  }

  function shouldKeepChatReadinessPolling(model) {
    const knownChat = isVerifiedChatSurface(model);
    if (!knownChat || !model || (model.pageProfile && model.pageProfile.type === "pdf")) return false;
    const sections = Array.isArray(model.sections) ? model.sections.length : 0;
    const words = Number(model.totalReadableWords || 0);
    const hasAssistantSection = Array.isArray(model.sections) && model.sections.some((section) => {
      const meta = section.unitMeta || {};
      return meta.role === "assistant" && section.wordCount >= 12;
    });
    // Stop aggressive chat polling as soon as the conversation has any useful
    // assistant content. Continuous polling was causing first-load popup states
    // like "waiting for assistant answer" even though the sidebar could map text.
    return sections < 1 && words < 35 && !hasAssistantSection;
  }

  function isChatLikePage() {
    return isVerifiedChatSurface(runtime.model);
  }

  function isVerifiedChatSurface(model) {
    if (isKnownAiHost()) return true;
    const evidence = getChatDomEvidence();
    if (evidence.strong) return true;
    if (!model || !model.pageProfile || model.pageProfile.type !== "chat") return false;
    const sections = Array.isArray(model.sections) ? model.sections : [];
    const assistantSections = sections.filter((section) => {
      const meta = section.unitMeta || {};
      return meta.role === "assistant" && Number(section.wordCount || 0) >= 12;
    }).length;
    const userSections = sections.filter((section) => {
      const meta = section.unitMeta || {};
      return meta.role === "user" && Number(section.wordCount || 0) >= 3;
    }).length;
    const modelEvidence = assistantSections >= 1 && userSections >= 1;
    if (!modelEvidence) {
      emitDebug("chat:evidence:weak", {
        pageType: model.pageProfile.type,
        assistantSections,
        userSections,
        domEvidence: evidence,
        exactIssue: "Chat classification requires known AI host evidence, explicit DOM roles, or both assistant and user sections."
      });
    }
    return modelEvidence;
  }

  function getChatDomEvidence(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    const roleNodes = queryChatEvidence(scope, "[data-message-author-role], [data-author], [data-role], [data-content]");
    const assistantNodes = uniqueElementsLocal([
      ...queryChatEvidence(scope, "[data-message-author-role='assistant'], [data-author='assistant'], [data-role='assistant'], [data-content='ai-message'], [data-testid*='assistant-message' i], [aria-label*='assistant' i], model-response"),
      ...roleNodes.filter((node) => /\b(assistant|model|bot|ai-message)\b/i.test(chatEvidenceTrail(node)))
    ]);
    const userNodes = uniqueElementsLocal([
      ...queryChatEvidence(scope, "[data-message-author-role='user'], [data-author='user'], [data-role='user'], [data-content='user-message'], [data-testid*='user-message' i], [aria-label*='user' i], user-query"),
      ...roleNodes.filter((node) => /\b(user|human|prompt|question|user-message)\b/i.test(chatEvidenceTrail(node)))
    ]);
    const explicitTurns = queryChatEvidence(scope, "[data-testid*='conversation-turn' i], [data-testid*='chat-message' i], [class*='conversation-turn' i]");
    const genericPairs = queryChatEvidence(scope, "[class*='conversation' i] [class*='message' i], [class*='chat' i] [class*='message' i]")
      .filter((node) => /\b(assistant|user|human|model|bot)\b/i.test(chatEvidenceTrail(node)));
    const score = (assistantNodes.length ? 2 : 0)
      + (userNodes.length ? 2 : 0)
      + (roleNodes.length >= 2 ? 2 : 0)
      + (explicitTurns.length >= 2 ? 1 : 0)
      + (genericPairs.length >= 2 ? 1 : 0);
    return {
      assistant: assistantNodes.length,
      user: userNodes.length,
      roleNodes: roleNodes.length,
      explicitTurns: explicitTurns.length,
      genericPairs: genericPairs.length,
      score,
      strong: assistantNodes.length >= 1 && userNodes.length >= 1 && score >= 4
    };
  }

  function queryChatEvidence(scope, selector) {
    try {
      return Array.from(scope.querySelectorAll(selector))
        .filter((node) => node instanceof Element)
        .filter((node) => localWordCount(node.innerText || node.textContent || "") >= 2)
        .slice(0, 80);
    } catch (error) {
      return [];
    }
  }

  function chatEvidenceTrail(element) {
    if (!element || !(element instanceof Element)) return "";
    return [
      element.id || "",
      element.className || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("data-message-author-role") || "",
      element.getAttribute("data-author") || "",
      element.getAttribute("data-role") || "",
      element.getAttribute("data-content") || ""
    ].join(" ");
  }

  function localWordCount(text) {
    const matches = String(text || "").replace(/\s+/g, " ").trim().match(/\b[\w'-]+\b/g);
    return matches ? matches.length : 0;
  }

  function uniqueElementsLocal(elements) {
    return Array.from(new Set((elements || []).filter(Boolean)));
  }

  function isKnownAiHost() {
    const host = window.location.hostname.toLowerCase();
    return /(^|\.)((chatgpt|claude|perplexity|grok)\.(com|ai)|chat\.openai\.com|gemini\.google\.com|copilot\.microsoft\.com|copilot\.com)$/i.test(host)
      || (host === "github.com" && /\/copilot|copilot-chat/i.test(window.location.pathname));
  }

  function isPdfLikePage() {
    return Boolean(runtime.model && runtime.model.pageProfile.type === "pdf")
      || isPdfRouteLocked();
  }

  function elementLooksConversationLike(element) {
    if (!element || !(element instanceof Element)) return false;
    const trail = `${element.id || ""} ${element.className || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-testid") || ""} ${element.getAttribute("data-message-author-role") || ""} ${element.getAttribute("data-role") || ""}`;
    if (isKnownAiHost()) {
      return /\b(conversation|chat|message|assistant|user|prompt|response|answer|reply|markdown|prose|model-response|user-query)\b/i.test(trail)
        || Boolean(element.closest("[data-message-author-role], [data-testid*='conversation'], [data-testid*='chat-message'], [data-testid*='message'], [aria-label*='assistant' i], [aria-label*='user' i], model-response, user-query"));
    }
    if (element.closest("[data-message-author-role='assistant'], [data-message-author-role='user'], [data-author='assistant'], [data-author='user'], [data-role='assistant'], [data-role='user'], [data-testid*='assistant-message' i], [data-testid*='user-message' i], [aria-label*='assistant' i], [aria-label*='user' i], model-response, user-query")) {
      return true;
    }
    const evidence = getChatDomEvidence(element.ownerDocument || document);
    return evidence.strong && /\b(conversation|chat|message|assistant|user|model-response|user-query)\b/i.test(trail);
  }

  function elementLooksPdfLike(element) {
    if (!element || !(element instanceof Element)) return false;
    return Boolean(element.closest(".textLayer, [data-page-number], .page, #viewer, pdf-viewer"))
      || /\b(textLayer|page|pdf|viewer)\b/i.test(`${element.id || ""} ${element.className || ""}`);
  }

  function jumpToUsefulPart() {
    if (!runtime.model || !runtime.model.hasStrongTarget) {
      if (isGoogleDocsActionContext(runtime.model)) {
        return blockGoogleDocsActionWithoutTarget("jump", "no-google-docs-target");
      }
      return false;
    }

    const targetId = runtime.model.bestSectionId || runtime.model.skipTargetId || runtime.model.nextImportantId;
    return scrollToSection(targetId, { highlight: true, actionType: "jump" });
  }

  function getSectionForAction(type) {
    if (!runtime.model || !Array.isArray(runtime.model.sections)) return null;
    if (type === "next") {
      if (hasSyntheticPdfSections()) {
        return getNextPdfImportantSection()
          || getFirstPdfImportantSection()
          || runtime.model.importantSections.find((section) => (isSyntheticPdfSection(section) || isOcrPdfSection(section)) && section.id !== runtime.view.activeId)
          || null;
      }
      return runtime.model.sections.find((section) => section.id === runtime.model.nextImportantId)
        || runtime.model.importantSections.find((section) => section.id !== runtime.view.activeId)
        || null;
    }
    const targetId = runtime.model.bestSectionId || runtime.model.skipTargetId || runtime.model.nextImportantId;
    return runtime.model.sections.find((section) => section.id === targetId) || null;
  }

  function isPdfActionContext() {
    return Boolean(isPdfRouteLocked() || isPdfLikePage());
  }

  function selectPdfActionSection(type, options = {}) {
    if (options.section) return normalizePdfActionTargetSection(options.section);
    if (options.sectionId && runtime.model && Array.isArray(runtime.model.sections)) {
      return normalizePdfActionTargetSection(runtime.model.sections.find((section) => section.id === options.sectionId) || null);
    }
    return normalizePdfActionTargetSection(getSectionForAction(type === "next" ? "next" : "jump"));
  }

  function getPdfActionSection(type, options = {}) {
    if (isPdfActionContext()) {
      adoptExistingPdfActionModel(`pdf-action-target:${type}`);
    }
    const section = selectPdfActionSection(type, options);
    if (section && isPdfActionContext()) {
      const ocrTarget = isOcrPdfSection(section);
      emitDebug("pdf:action:target-selected", {
        type,
        sectionId: section.id,
        pageNumber: getPdfSectionPageNumber(section),
        ocrTarget,
        ocrRole: section.metrics && section.metrics.ocrRole || section.unitMeta && section.unitMeta.ocrRole || "",
        fromCache: Boolean(runtime.model && runtime.model.diagnostics && runtime.model.diagnostics.recoveredPdf),
        cacheHit: Boolean(runtime.model && runtime.model.diagnostics && runtime.model.diagnostics.recoveredPdfCacheHit || runtime.pdfOcr && runtime.pdfOcr.cacheHit),
        exactIssue: "none"
      });
      if (ocrTarget) {
        emitDebug("pdf:action:ocr-target", {
          type,
          sectionId: section.id,
          pageNumber: getPdfSectionPageNumber(section),
          title: section.title || "",
          ocrRole: section.metrics && section.metrics.ocrRole || section.unitMeta && section.unitMeta.ocrRole || "",
          sectionKind: section.metrics && section.metrics.sectionKind || section.unitMeta && section.unitMeta.sectionKind || "",
          relativeYStart: getPdfSectionRelativeYRange(section).start,
          relativeYEnd: getPdfSectionRelativeYRange(section).end,
          exactIssue: "OCR PDF sections do not expose a reliable native text-layer anchor, so this target will use SkimRoute PDF Mode with an approximate page highlight."
        });
      }
    }
    return section;
  }

  function makePdfActionId(type) {
    return `pdf-action-${String(type || "action").replace(/[^a-z0-9_-]+/gi, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getPdfActionTargetKey(type, section, pageNumber, options = {}) {
    const sectionId = section && section.id || options.sectionId || "";
    return [
      getPdfDocumentRouteKey() || getRouteCacheKey(),
      type || "",
      sectionId,
      Number(pageNumber) || 0
    ].join("|");
  }

  function getPdfActionDuration(action = runtime.pdfAction) {
    const startedAt = Number(action && action.startedAt) || 0;
    return startedAt ? Math.max(0, Date.now() - startedAt) : 0;
  }

  function isPdfActionActive(actionId) {
    const action = runtime.pdfAction || {};
    const id = String(actionId || action.activeActionId || action.actionId || action.token || "");
    return Boolean(
      id
      && action.activeActionId === id
      && !action.cancelled
      && !action.completed
    );
  }

  function markPdfActionFinished(actionId, finalPhase, details = {}) {
    const action = runtime.pdfAction || {};
    const id = String(actionId || "");
    if (!id || action.actionId !== id && action.activeActionId !== id && action.token !== id) return false;
    if (action.timeoutTimer) {
      window.clearTimeout(action.timeoutTimer);
    }
    if (action.timing && action.timing.softTimer) {
      window.clearTimeout(action.timing.softTimer);
    }
    runtime.pdfAction = {
      ...action,
      token: id,
      actionId: id,
      activeActionId: "",
      phase: finalPhase || action.phase || "completed",
      targetPage: Number(details.pageNumber || action.targetPage || 0) || 0,
      targetSectionId: String(details.sectionId || action.targetSectionId || ""),
      updatedAt: Date.now(),
      completedAt: Date.now(),
      timeoutTimer: null,
      timing: action.timing ? { ...action.timing, softTimer: null } : null,
      cancelled: finalPhase === "cancelled" || Boolean(action.cancelled),
      completed: true
    };
    return true;
  }

  function finishPdfActionLog(actionId, status, details = {}) {
    const action = runtime.pdfAction || {};
    const id = String(actionId || action.actionId || action.token || "");
    const payload = {
      actionId: id,
      token: id,
      type: details.type || action.type || "",
      routeKey: details.routeKey || getRouteCacheKey(),
      targetSectionId: details.sectionId || action.targetSectionId || "",
      sectionId: details.sectionId || action.targetSectionId || "",
      pageNumber: Number(details.pageNumber || action.targetPage || 0) || 0,
      durationMs: Number(details.durationMs) || getPdfActionDuration(action),
      blockedReason: details.blockedReason || "",
      cancelledReason: details.cancelledReason || "",
      exactIssue: details.exactIssue || (status === "completed" ? "none" : "")
    };
    if (status === "completed") {
      emitDebug("pdf:action:completed", payload);
    } else if (status === "timeout") {
      emitDebug("pdf:action:timeout", {
        ...payload,
        blockedReason: payload.blockedReason || "pdf-action-timeout",
        exactIssue: payload.exactIssue || "The PDF action exceeded its bounded navigation timeout and was stopped."
      });
    } else if (status === "cancelled") {
      emitDebug("pdf:action:cancelled", {
        ...payload,
        cancelledReason: payload.cancelledReason || "superseded",
        exactIssue: payload.exactIssue || "A newer PDF action replaced this pending action."
      });
    } else {
      emitDebug("pdf:action:blocked", {
        ...payload,
        blockedReason: payload.blockedReason || "pdf-action-blocked",
        exactIssue: payload.exactIssue || "The PDF action stopped before a target could be scrolled or highlighted."
      });
    }
  }

  function getPdfActionTiming(actionId = "") {
    const action = runtime.pdfAction || {};
    const id = String(actionId || action.activeActionId || action.actionId || action.token || "");
    if (!id || action.actionId !== id && action.activeActionId !== id && action.token !== id) return null;
    if (!action.timing || typeof action.timing !== "object") {
      action.timing = {};
    }
    return action.timing;
  }

  function addPdfActionTiming(actionId, fields = {}) {
    const timing = getPdfActionTiming(actionId);
    if (!timing) return null;
    Object.keys(fields).forEach((key) => {
      const value = fields[key];
      if (Number.isFinite(Number(value))) {
        timing[key] = Math.max(0, Math.round(Number(value)));
      } else {
        timing[key] = value;
      }
    });
    return timing;
  }

  function finishPdfActionConsentWait(actionId) {
    const timing = getPdfActionTiming(actionId);
    if (!timing || !timing.consentStartedAt) return;
    timing.consentWaitMs = Math.max(0, Date.now() - Number(timing.consentStartedAt));
    timing.consentStartedAt = 0;
  }

  function emitPdfActionTiming(actionId, status, details = {}) {
    const action = runtime.pdfAction || {};
    const timing = action.timing || {};
    const startedAt = Number(action.startedAt) || Date.now();
    const processingStartedAt = Number(timing.processingStartedAt) || 0;
    const activeProcessingMs = processingStartedAt
      ? Math.max(0, Date.now() - processingStartedAt)
      : Number(timing.activeProcessingMs) || 0;
    emitDebug("pdf:action:timing", {
      actionId,
      token: actionId,
      type: details.type || action.type || "",
      routeKey: details.routeKey || getPdfDocumentRouteKey(),
      targetSectionId: details.sectionId || action.targetSectionId || "",
      sectionId: details.sectionId || action.targetSectionId || "",
      pageNumber: Number(details.pageNumber || action.targetPage || 0) || 0,
      status,
      targetSelectionMs: Number(timing.targetSelectionMs || 0),
      consentWaitMs: Number(timing.consentWaitMs || 0),
      resourceLookupMs: Number(timing.resourceLookupMs || 0),
      fetchMs: Number(timing.fetchMs || 0),
      parseMs: Number(timing.parseMs || 0),
      pageRenderMs: Number(timing.pageRenderMs || 0),
      scrollHighlightMs: Number(timing.scrollHighlightMs || 0),
      activeProcessingMs,
      totalElapsedMs: Math.max(0, Date.now() - startedAt),
      exactIssue: "none"
    });
  }

  function cancelPdfControlledRenderForAction(actionId, reason = "cancelled") {
    const viewer = runtime.pdfControlledViewer;
    const loading = viewer && viewer.activeLoadingTask;
    if (loading && (!actionId || !loading.actionToken || loading.actionToken === actionId)) {
      viewer.activeLoadingTask = null;
      try {
        if (loading.task && typeof loading.task.destroy === "function") {
          loading.task.destroy();
        }
      } catch (error) {
        // PDF.js loading cancellation is best-effort.
      }
      emitDebug("pdf:controlled-viewer:load-cancelled", {
        actionId: actionId || loading.actionToken || "",
        token: actionId || loading.actionToken || "",
        reason,
        exactIssue: "An active PDF.js document loading task was cancelled because the PDF action ended or was superseded."
      });
    }
    const active = viewer && viewer.activeRenderTask;
    if (!active || actionId && active.actionToken && active.actionToken !== actionId) return false;
    viewer.activeRenderTask = null;
    try {
      if (active.task && typeof active.task.cancel === "function") {
        active.task.cancel();
      }
    } catch (error) {
      // PDF.js render cancellation is best-effort.
    }
    emitDebug("pdf:controlled-viewer:render-cancelled", {
      actionId: actionId || active.actionToken || "",
      token: actionId || active.actionToken || "",
      pageNumber: active.pageNumber || 0,
      reason,
      exactIssue: "An active PDF.js render task was cancelled because the PDF action ended or was superseded."
    });
    return true;
  }

  function startPdfActionProcessingTimer(actionId) {
    const action = runtime.pdfAction || {};
    if (!actionId || !isPdfActionActive(actionId) || action.processingStartedAt) return false;
    if (action.timeoutTimer) window.clearTimeout(action.timeoutTimer);
    const timing = getPdfActionTiming(actionId) || {};
    timing.processingStartedAt = Date.now();
    if (timing.softTimer) window.clearTimeout(timing.softTimer);
    timing.softTimer = window.setTimeout(() => {
      if (!isPdfActionActive(actionId)) return;
      updatePagePilotControlledPdfStatus("Still opening PDF Mode...");
      emitDebug("pdf:controlled-viewer:soft-timeout", {
        actionId,
        token: actionId,
        pageNumber: action.targetPage || 0,
        elapsedMs: getPdfActionDuration(action),
        exactIssue: "PDF Mode rendering is taking longer than expected, but SkimRoute is keeping the same render task alive instead of starting fallback navigation."
      });
    }, PDF_ACTION_RENDER_TIMEOUT_MS);
    action.processingStartedAt = timing.processingStartedAt;
    action.timing = timing;
    action.timeoutTimer = window.setTimeout(() => {
      if (!isPdfActionActive(actionId)) return;
      if (runtime.pendingPdfControlledJump && runtime.pendingPdfControlledJump.actionToken === actionId) {
        runtime.pendingPdfControlledJump = null;
      }
      cancelPdfControlledRenderForAction(actionId, "pdf-action-timeout");
      if (runtime.pdfControlledViewer && runtime.pdfControlledViewer.pendingTarget && runtime.pdfControlledViewer.pendingTarget.actionToken === actionId) {
        runtime.pdfControlledViewer.pendingTarget = null;
      }
      completePdfAction(actionId, "timeout", {
        type: action.type,
        routeKey: getPdfDocumentRouteKey(),
        sectionId: action.targetSectionId || "",
        pageNumber: action.targetPage || 0,
        blockedReason: "pdf-action-processing-timeout",
        exactIssue: "PDF Mode processing exceeded the bounded active-processing timeout after consent."
      });
      setActionResult(action.type || "jump", false, {
        pageNumber: action.targetPage || 0,
        actionToken: actionId,
        phase: "timeout",
        blockedReason: "pdf-action-processing-timeout",
        message: "PDF Mode is still rendering this page. Try again in a moment."
      });
    }, PDF_ACTION_TIMEOUT_MS);
    runtime.pdfAction = action;
    return true;
  }

  function completePdfAction(actionId, status = "completed", details = {}) {
    const action = runtime.pdfAction || {};
    const id = String(actionId || action.actionId || action.token || "");
    if (!id || action.completed && action.completedAt) return false;
    if (action.timing && action.timing.softTimer) {
      window.clearTimeout(action.timing.softTimer);
      action.timing.softTimer = null;
    }
    emitPdfActionTiming(id, status, details);
    const durationMs = getPdfActionDuration(action);
    finishPdfActionLog(id, status, { ...details, durationMs });
    return markPdfActionFinished(id, status === "blocked" ? "blocked" : status, details);
  }

  function cancelActivePdfAction(reason = "superseded", details = {}) {
    const action = runtime.pdfAction || {};
    const actionId = action.activeActionId || action.actionId || action.token || "";
    if (!actionId || action.completed || action.cancelled) return false;
    if (action.timeoutTimer) window.clearTimeout(action.timeoutTimer);
    if (action.timing && action.timing.softTimer) window.clearTimeout(action.timing.softTimer);
    runtime.pendingPdfControlledJump = null;
    if (runtime.pdfModeConsentDialog && runtime.pdfModeConsentDialog.actionToken === actionId) {
      closePagePilotPdfModeConsentDialog(false);
    }
    cancelPdfControlledRenderForAction(actionId, reason);
    if (runtime.pdfControlledViewer) {
      const viewer = runtime.pdfControlledViewer;
      if (viewer.pendingTarget && (!viewer.pendingTarget.actionToken || viewer.pendingTarget.actionToken === actionId)) {
        viewer.pendingTarget = null;
      }
      viewer.backgroundRenderToken = "";
    }
    runtime.pdfAction = {
      ...action,
      activeActionId: "",
      phase: "cancelled",
      updatedAt: Date.now(),
      completedAt: Date.now(),
      timeoutTimer: null,
      timing: action.timing ? { ...action.timing, softTimer: null } : null,
      cancelled: true,
      completed: true
    };
    emitPdfActionTiming(actionId, "cancelled", {
      ...details,
      type: action.type,
      sectionId: action.targetSectionId,
      pageNumber: action.targetPage
    });
    finishPdfActionLog(actionId, "cancelled", {
      ...details,
      type: action.type,
      sectionId: action.targetSectionId,
      pageNumber: action.targetPage,
      cancelledReason: reason,
      durationMs: getPdfActionDuration(action)
    });
    return true;
  }

  function beginPdfAction(type, details = {}) {
    const now = Date.now();
    const routeKey = details.routeKey || getRouteCacheKey();
    const section = details.section || null;
    const pageNumber = Number(details.pageNumber) || getPdfSectionPageNumber(section) || 0;
    const targetKey = getPdfActionTargetKey(type, section, pageNumber, details);
    const current = runtime.pdfAction || {};
    if (
      current.activeActionId
      && !current.completed
      && !current.cancelled
      && current.targetKey === targetKey
      && now - (Number(current.startedAt) || 0) < PDF_ACTION_DEBOUNCE_MS
    ) {
      emitDebug("pdf:action:duplicate-ignored", {
        actionId: current.activeActionId,
        token: current.activeActionId,
        type,
        routeKey,
        targetSectionId: section && section.id || details.sectionId || "",
        sectionId: section && section.id || details.sectionId || "",
        pageNumber,
        durationMs: now - (Number(current.startedAt) || now),
        exactIssue: "A duplicate PDF action for the same target arrived inside the debounce window and was ignored."
      });
      return { duplicate: true, actionId: current.activeActionId };
    }
    cancelActivePdfAction("superseded", {
      routeKey,
      nextType: type,
      sectionId: section && section.id || details.sectionId || "",
      pageNumber
    });
    const actionId = makePdfActionId(type);
    runtime.pdfAction = {
      token: actionId,
      actionId,
      activeActionId: actionId,
      type,
      phase: "starting",
      targetPage: pageNumber,
      targetSectionId: section && section.id || details.sectionId || "",
      targetKey,
      startedAt: now,
      updatedAt: now,
      completedAt: 0,
      timeoutTimer: null,
      timing: {
        targetSelectionMs: Number(details.targetSelectionMs || 0),
        consentStartedAt: 0,
        consentWaitMs: 0,
        resourceLookupMs: 0,
        fetchMs: 0,
        parseMs: 0,
        pageRenderMs: 0,
        scrollHighlightMs: 0,
        processingStartedAt: 0,
        softTimer: null
      },
      cancelled: false,
      completed: false
    };
    emitDebug("pdf:action:start", {
      actionId,
      token: actionId,
      type,
      routeKey,
      targetSectionId: section && section.id || details.sectionId || "",
      sectionId: section && section.id || details.sectionId || "",
      pageNumber,
      timeoutMs: PDF_ACTION_TIMEOUT_MS,
      timeoutStartsAfterConsent: true,
      targetSelectionMs: Number(details.targetSelectionMs || 0),
      exactIssue: "none"
    });
    return { duplicate: false, actionId };
  }

  function queuePdfActionStep(actionId, callback) {
    window.setTimeout(() => {
      if (!isPdfActionActive(actionId)) return;
      Promise.resolve()
        .then(callback)
        .catch((error) => {
          const action = runtime.pdfAction || {};
          emitDebug("pdf:action:blocked", {
            actionId,
            token: actionId,
            type: action.type || "",
            routeKey: getRouteCacheKey(),
            targetSectionId: action.targetSectionId || "",
            sectionId: action.targetSectionId || "",
            pageNumber: action.targetPage || 0,
            durationMs: getPdfActionDuration(action),
            blockedReason: "pdf-action-continuation-error",
            error: String(error && error.message ? error.message : error),
            exactIssue: "The PDF action continuation failed after the click returned control to the browser."
          });
          setActionResult(action.type || "jump", false, {
            phase: "blocked",
            actionToken: actionId,
            blockedReason: "pdf-action-continuation-error",
            message: "SkimRoute received the click, but PDF Mode could not finish this action yet."
          });
          completePdfAction(actionId, "blocked", { blockedReason: "pdf-action-continuation-error" });
        });
    }, 0);
  }

  function adoptExistingPdfActionModel(reason = "pdf-action") {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return false;
    const routeKey = getPdfDocumentRouteKey();
    const candidates = [
      runtime.model,
      runtime.stablePdfModel && runtime.stablePdfRouteKey === routeKey ? runtime.stablePdfModel : null,
      runtime.recoveredPdfModelCache && runtime.recoveredPdfModelCache.routeKey === routeKey ? runtime.recoveredPdfModelCache.model : null
    ].filter(Boolean);
    const best = candidates.find((model) => isUsablePdfStatsModel(model, true)) || null;
    if (!best) return false;
    if (runtime.model !== best) {
      runtime.model = best;
      emitDebug("pdf:action:model-ready-from-cache", {
        type: reason,
        routeKey,
        sections: best.sections ? best.sections.length : 0,
        words: best.totalReadableWords || 0,
        exactIssue: "The PDF action reused an already available in-memory/stable PDF model without rebuilding or rerunning OCR."
      });
    }
    if (isOcrBackedPdfModel(best)) {
      emitDebug("pdf:action:model-ready-from-ocr", {
        type: reason,
        routeKey,
        sections: best.sections ? best.sections.length : 0,
        words: best.totalReadableWords || 0,
        exactIssue: "The PDF action reused the completed OCR-backed PDF model as its target source."
      });
    }
    return true;
  }

  function runPdfAction(type, options = {}) {
    if (!isPdfActionContext()) return false;
    const routeKey = getRouteCacheKey();
    emitPdfActionCommandRouted(type, options, { routeKey, stage: "action-controller", command: "pdf-navigation" });
    const wantsOpen = options.open !== false;
    if (wantsOpen) {
      setMode("open", { focus: Boolean(options.focus), persist: true });
    } else if (type === "toggle") {
      setMode(modeForClosedState(), { focusTab: true, persist: true });
    }

    if (type === "toggle") {
      const token = makePdfActionId("toggle");
      runtime.pdfAction = {
        token,
        actionId: token,
        activeActionId: "",
        type,
        phase: "completed",
        targetPage: 0,
        targetSectionId: "",
        targetKey: getPdfActionTargetKey(type, null, 0, options),
        startedAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
        timeoutTimer: null,
        cancelled: false,
        completed: true
      };
      emitDebug("pdf:action:received", {
        type,
        routeKey,
        actionId: token,
        token,
        source: options.source || "",
        hasModel: Boolean(runtime.model),
        modelWords: runtime.model && runtime.model.totalReadableWords || 0,
        modelSections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
        pdfPending: Boolean(runtime.pdfOcr && runtime.pdfOcr.pending),
        pdfRetrying: Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying),
        exactIssue: "PDF sidebar toggle does not require PDF status verification, cache hydration, OCR geometry, or a ready target section."
      });
      setActionResult("toggle", true, {
        phase: "completed",
        actionToken: token,
        message: wantsOpen ? "Sidebar opened." : "Sidebar minimized."
      });
      emitDebug("pdf:action:completed", {
        type,
        routeKey,
        actionId: token,
        token,
        source: options.source || "",
        open: wantsOpen,
        durationMs: 0,
        blockedReason: "",
        exactIssue: "PDF sidebar toggle completed without waiting for map readiness."
      });
      return true;
    }

    const targetSelectionStartedAt = Date.now();
    adoptExistingPdfActionModel(`pdf-action:${type}:immediate`);
    const statusGate = getVerifiedPdfActionStatus(type, `pdf-action:${type}:immediate`, options);
    const section = statusGate.section || getPdfActionSection(type, options);
    const pageNumber = getPdfSectionPageNumber(section) || statusGate.pageNumber || 0;
    const targetSelectionMs = Math.max(0, Date.now() - targetSelectionStartedAt);
    const begin = beginPdfAction(type, { ...options, routeKey, section, pageNumber, targetSelectionMs });
    const token = begin.actionId || runtime.pdfAction && runtime.pdfAction.token || "";
    if (begin.duplicate) {
      setActionResult(type, Boolean(section), {
        section,
        pageNumber,
        actionToken: token,
        phase: "duplicate",
        message: pageNumber ? `Opening PDF Mode to Page ${pageNumber}.` : "PDF action already queued."
      });
      return Boolean(section);
    }
    if (runtime.pdfAction) {
      runtime.pdfAction.phase = section ? "received" : "preparing";
      runtime.pdfAction.updatedAt = Date.now();
    }

    emitDebug("pdf:action:received", {
      type,
      routeKey,
      actionId: token,
      token,
      sectionId: section && section.id || "",
      targetSectionId: section && section.id || "",
      pageNumber: pageNumber || 0,
      hasModel: Boolean(runtime.model),
      modelWords: runtime.model && runtime.model.totalReadableWords || 0,
      modelSections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
      publicStatusVerified: statusGate.stats ? Boolean(statusGate.stats.pdfStatusVerified) : null,
      publicStatusMissingFields: statusGate.missingFields,
      pdfPending: Boolean(runtime.pdfOcr && runtime.pdfOcr.pending),
      pdfRetrying: Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying),
      exactIssue: "none"
    });

    if (!statusGate.ok && statusGate.blockedReason === "pdf-status-normalization-failed") {
      emitDebug("pdf:action:status-warning", {
        type,
        routeKey,
        actionId: token,
        token,
        blockedReason: statusGate.blockedReason,
        missingFields: statusGate.missingFields,
        sectionId: section && section.id || "",
        pageNumber,
        modelSections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
        exactIssue: "Public PDF status verification failed, but SkimRoute will still use a valid page-number-backed target if one is available."
      });
    }

    setActionResult(type, Boolean(section), {
      section,
      pageNumber,
      actionToken: token,
      phase: section ? "received" : "preparing",
      message: section && pageNumber
        ? `Opening PDF Mode to Page ${pageNumber}.`
        : "PDF map still preparing. SkimRoute will use the saved map as soon as it is ready."
    });

    if (!section || !pageNumber) {
      completePdfAction(token, "blocked", {
        type,
        routeKey,
        sectionId: section && section.id || "",
        pageNumber,
        blockedReason: "pdf-target-not-ready",
        exactIssue: "No page-number-backed PDF target was available from the current in-memory model."
      });
      return false;
    }

    queuePdfActionStep(token, () => {
      finishPdfAction(type, { ...options, routeKey, token }).catch((error) => {
        emitDebug("pdf:action:blocked", {
          type,
          routeKey,
          actionId: token,
          token,
          blockedReason: "pdf-action-continuation-error",
          error: String(error && error.message ? error.message : error),
          exactIssue: "The PDF action continuation failed after the popup/sidebar had already received an immediate response."
        });
        setActionResult(type, false, {
          phase: "blocked",
          actionToken: token,
          message: "SkimRoute received the click, but PDF Mode could not finish this action yet.",
          blockedReason: "pdf-action-continuation-error"
        });
        completePdfAction(token, "blocked", { type, routeKey, blockedReason: "pdf-action-continuation-error" });
      });
    });

    return Boolean(section);
  }

  async function finishPdfAction(type, options = {}) {
    const routeKey = options.routeKey || getRouteCacheKey();
    const token = options.token || "";
    if (token && !isPdfActionActive(token)) {
      emitDebug("pdf:action:cancelled", {
        type,
        routeKey,
        actionId: token,
        token,
        cancelledReason: "stale-continuation",
        durationMs: 0,
        exactIssue: "A PDF action continuation resolved after that action was cancelled or completed."
      });
      return false;
    }
    const hydrated = false;
    const adopted = adoptExistingPdfActionModel(`pdf-action:${type}:continue`);
    const statusGate = getVerifiedPdfActionStatus(type, `pdf-action:${type}:continue`, options);
    if (!statusGate.ok && statusGate.blockedReason === "pdf-status-normalization-failed") {
      emitDebug("pdf:action:status-warning", {
        type,
        routeKey,
        actionId: token,
        token,
        hydrated,
        adopted,
        blockedReason: statusGate.blockedReason,
        missingFields: statusGate.missingFields,
        modelSections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
        exactIssue: "Cached PDF public status verification failed, but action continuation will proceed if a page-number-backed target exists."
      });
    }
    const section = statusGate.section || getPdfActionSection(type, options);
    const pageNumber = getPdfSectionPageNumber(section) || statusGate.pageNumber || 0;
    const modelReadyFromCache = Boolean(
      runtime.model
      && runtime.model.pageProfile
      && runtime.model.pageProfile.type === "pdf"
      && isUsablePdfStatsModel(runtime.model, true)
      && (
        hydrated
        || runtime.pdfOcr && runtime.pdfOcr.cacheHit
        || runtime.model.diagnostics && (
          runtime.model.diagnostics.recoveredPdf
          || runtime.model.diagnostics.recoveredPdfCacheHit
          || runtime.model.diagnostics.recoveredPdfCacheSource
        )
      )
    );
    if (modelReadyFromCache) {
      emitDebug("pdf:action:model-ready-from-cache", {
        type,
        routeKey,
        actionId: token,
        token,
        hydrated,
        adopted,
        sectionId: section && section.id || "",
        pageNumber: pageNumber || 0,
        sections: runtime.model.sections ? runtime.model.sections.length : 0,
        words: runtime.model.totalReadableWords || 0,
        cacheSource: runtime.pdfOcr && runtime.pdfOcr.cacheSource || runtime.model.diagnostics && runtime.model.diagnostics.recoveredPdfCacheSource || "",
        exactIssue: "none"
      });
      if (isOcrBackedPdfModel(runtime.model)) {
        emitDebug("pdf:action:model-ready-from-ocr", {
          type,
          routeKey,
          actionId: token,
          token,
          hydrated,
          adopted,
          sectionId: section && section.id || "",
          pageNumber: pageNumber || 0,
          sections: runtime.model.sections ? runtime.model.sections.length : 0,
          words: runtime.model.totalReadableWords || 0,
          exactIssue: "The PDF action adopted an OCR-backed recovered PDF model, so OCR sections are available as page-number targets."
        });
      }
    }

    const pdfModeTargetReady = Boolean(
      section
      && pageNumber
      && runtime.model
      && runtime.model.pageProfile
      && runtime.model.pageProfile.type === "pdf"
    );
    if (!section || !pageNumber || (!pdfModeTargetReady && !canJumpToSection(section))) {
      emitDebug("pdf:action:blocked", {
        type,
        routeKey,
        actionId: token,
        token,
        hydrated,
        adopted,
        blockedReason: "pdf-target-not-ready",
        sectionId: section && section.id || "",
        pageNumber: pageNumber || 0,
        hasModel: Boolean(runtime.model),
        modelWords: runtime.model && runtime.model.totalReadableWords || 0,
        modelSections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
        exactIssue: "SkimRoute received the action, but no page-number-backed PDF target is ready yet."
      });
      setActionResult(type, false, {
        section,
        pageNumber,
        phase: "preparing",
        actionToken: token,
        blockedReason: "pdf-target-not-ready",
        message: "PDF map still preparing. Try again when SkimRoute shows PDF map ready."
      });
      completePdfAction(token, "blocked", {
        type,
        routeKey,
        sectionId: section && section.id || "",
        pageNumber,
        blockedReason: "pdf-target-not-ready"
      });
      return false;
    }

    emitDebug("pdf:action:model-ready", {
      type,
      routeKey,
      actionId: token,
      token,
      hydrated,
      adopted,
      sectionId: section.id,
      pageNumber,
      cacheHit: Boolean(runtime.pdfOcr && runtime.pdfOcr.cacheHit),
      cacheSource: runtime.pdfOcr && runtime.pdfOcr.cacheSource || "",
      exactIssue: "none"
    });
    setActionResult(type, true, {
      section,
      pageNumber,
      phase: "pdf-mode-open",
      actionToken: token,
      pdfJumpMode: "pagepilot-pdf-viewer-opening",
      message: `Opening PDF Mode to Page ${pageNumber}.`
    });

    const ok = scrollToSection(section.id, {
      highlight: true,
      actionType: type,
      actionToken: token
    });
    if (ok) {
      setActionResult(type, true, {
        section,
        pageNumber,
        phase: "target-queued",
        actionToken: token,
        pdfJumpMode: runtime.pdfJumpMode || "pagepilot-pdf-viewer-opening",
        message: `Opening PDF Mode to Page ${pageNumber}.`
      });
      return true;
    }

    emitDebug("pdf:action:blocked", {
      type,
      routeKey,
      actionId: token,
      token,
      blockedReason: "scroll-command-failed",
      sectionId: section.id,
      pageNumber,
      exactIssue: "A PDF model and section existed, but scrollToSection returned false."
    });
    setActionResult(type, false, {
      section,
      pageNumber,
      phase: "blocked",
      actionToken: token,
      blockedReason: "scroll-command-failed",
      message: "SkimRoute found the PDF target, but PDF Mode could not start the jump."
    });
    completePdfAction(token, "blocked", {
      type,
      routeKey,
      sectionId: section.id,
      pageNumber,
      blockedReason: "scroll-command-failed"
    });
    return false;
  }

  function setActionResult(type, ok, details = {}) {
    const section = details.section || null;
    const pageNumber = details.pageNumber || getPdfSectionPageNumber(section);
    const pdfMode = details.pdfJumpMode || runtime.pdfJumpMode || "";
    const isPdf = Boolean(runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf");
    const phase = String(details.phase || runtime.pdfAction && runtime.pdfAction.phase || "").slice(0, 80);
    let message = details.message || "";
    if (!message) {
      if (type === "toggle") {
        message = ok ? "Sidebar opened." : "Sidebar could not open yet.";
      } else if (isPdf && ok) {
        if (/pagepilot-pdf-viewer|pdf-mode|awaiting/i.test(pdfMode)) {
          message = `Opening PDF Mode${pageNumber ? ` to Page ${pageNumber}` : ""}.`;
        } else if (/blocked/i.test(pdfMode)) {
          message = "Chrome PDF viewer blocked native scrolling; SkimRoute showed its PDF focus overlay.";
        } else {
          message = `Jumped${pageNumber ? ` to Page ${pageNumber}` : ""}.`;
        }
      } else if (ok) {
        message = type === "next" ? "Moved to the next important section." : "Jumped to the useful section.";
      } else {
        message = isPdf
          ? "SkimRoute found a PDF map, but Chrome did not expose a reliable jump target yet."
          : "SkimRoute could not find a jump target on this page yet.";
      }
    }
    runtime.lastAction = {
      ok: Boolean(ok),
      type,
      message,
      at: Date.now(),
      phase,
      pdfJumpMode: pdfMode,
      pdfJumpBlockedReason: details.blockedReason || (pdfMode === "blocked" ? "native-pdf-scroll-blocked" : ""),
      pageNumber: pageNumber || 0,
      sectionId: section && section.id || ""
    };
    if (isPdf || isPdfRouteLocked()) {
      const previousAction = runtime.pdfAction || {};
      const actionToken = details.actionToken || previousAction.token || previousAction.actionId || "";
      runtime.pdfAction = {
        ...previousAction,
        token: actionToken,
        actionId: previousAction.actionId || actionToken,
        activeActionId: previousAction.activeActionId || (/^(completed|blocked|timeout|cancelled)$/i.test(phase) ? "" : actionToken),
        type,
        phase,
        targetPage: pageNumber || 0,
        targetSectionId: section && section.id || "",
        targetKey: previousAction.targetKey || getPdfActionTargetKey(type, section, pageNumber, details),
        updatedAt: runtime.lastAction.at
      };
      if (/^(completed|blocked|timeout|cancelled)$/i.test(phase) && actionToken) {
        markPdfActionFinished(actionToken, phase, {
          pageNumber,
          sectionId: section && section.id || ""
        });
      }
    }
    emitDebug("pdf:jump:action-result", {
      type,
      ok: Boolean(ok),
      actionId: details.actionToken || runtime.pdfAction && (runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
      message,
      phase,
      pageNumber: pageNumber || 0,
      pdfJumpMode: pdfMode,
      blockedReason: runtime.lastAction.pdfJumpBlockedReason || "",
      sectionId: section && section.id || "",
      isPdfRoute: isPdfRouteLocked(),
      isPdfLike: isPdfLikePage(),
      hasModel: Boolean(runtime.model),
      modelWords: runtime.model && runtime.model.totalReadableWords || 0,
      modelSections: runtime.model && runtime.model.sections ? runtime.model.sections.length : 0,
      bestSectionId: runtime.model && runtime.model.bestSectionId || "",
      canJumpSection: Boolean(section && canJumpToSection(section)),
      exactIssue: ok ? "none" : "The action command returned without a confirmed jump target."
    });
    publishStatusUpdate("action-result");
    return runtime.lastAction;
  }

  function jumpToNextImportant() {
    if (hasSyntheticPdfSections()) {
      refreshActivePdfSection();
      if (!runtime.model || runtime.model.pageProfile.quietMode) return false;
      const pdfTarget = getNextPdfImportantSection()
        || getFirstPdfImportantSection()
        || runtime.model.importantSections.find((section) => (isSyntheticPdfSection(section) || isOcrPdfSection(section)) && section.id !== runtime.view.activeId);
      return scrollToSection(pdfTarget && pdfTarget.id, { highlight: true });
    }
    refreshActiveSection();
    if (!runtime.model || runtime.model.pageProfile.quietMode) {
      if (isGoogleDocsActionContext(runtime.model)) {
        return blockGoogleDocsActionWithoutTarget("next", "no-google-docs-target");
      }
      return false;
    }
    const targetId = runtime.model.nextImportantId
      || runtime.model.importantSections.find((section) => section.id !== runtime.view.activeId)?.id;
    return scrollToSection(targetId, { highlight: true, actionType: "next" });
  }

  function isGoogleDocsSection(section) {
    const meta = section && section.unitMeta || {};
    return Boolean(
      section
      && (
        meta.kind === "google-docs"
        || meta.source === "google-docs"
        || meta.googleDocsUnitId
        || meta.googleDocsNavigationRef
        || section.source === "google-docs"
      )
    );
  }

  function isGoogleDocsActionContext(model = runtime.model, section = null) {
    const profile = model && model.pageProfile || {};
    const diagnostics = model && model.diagnostics || {};
    return Boolean(
      isGoogleDocsSection(section)
      || profile.adapterName === "google-docs"
      || diagnostics.adapterName === "google-docs"
      || diagnostics.pageProfileBefore && diagnostics.pageProfileBefore.adapterName === "google-docs"
      || diagnostics.pageProfileAfter && diagnostics.pageProfileAfter.adapterName === "google-docs"
    );
  }

  function getGoogleDocsSectionNavigationRef(section) {
    const meta = section && section.unitMeta || {};
    return String(
      meta.googleDocsNavigationRef
      || meta.navigationTarget
      || section && section.navigationTarget
      || ""
    ).trim();
  }

  function buildGoogleDocsActionTargetKey(type, section, options = {}) {
    return [
      getRouteCacheKey(),
      type || "section",
      section && section.id || options.sectionId || "",
      getGoogleDocsSectionNavigationRef(section),
      section && section.unitMeta && section.unitMeta.googleDocsDocumentOrder || section && section.index || 0
    ].join("|");
  }

  function shouldIgnoreDuplicateGoogleDocsAction(current, targetKey, now = Date.now(), debounceMs = GOOGLE_DOCS_ACTION_DEBOUNCE_MS) {
    return Boolean(
      current
      && current.activeActionId
      && !current.completed
      && !current.cancelled
      && current.targetKey === targetKey
      && now - (Number(current.startedAt) || 0) < debounceMs
    );
  }

  function makeGoogleDocsActionId(type) {
    return `google-docs-action-${String(type || "section").replace(/[^a-z0-9_-]+/gi, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getGoogleDocsActionElapsed(action = runtime.googleDocsAction) {
    const startedAt = Number(action && action.startedAt) || 0;
    return startedAt ? Math.max(0, Date.now() - startedAt) : 0;
  }

  function isGoogleDocsActionActive(actionId) {
    const action = runtime.googleDocsAction || {};
    const id = String(actionId || action.activeActionId || action.actionId || "");
    return Boolean(id && action.activeActionId === id && !action.cancelled && !action.completed);
  }

  function emitGoogleDocsActionLog(event, actionId, details = {}) {
    const action = runtime.googleDocsAction || {};
    emitDebug(event, {
      actionId: actionId || action.actionId || action.activeActionId || "",
      type: details.type || action.type || "",
      sectionId: details.sectionId || action.targetSectionId || "",
      targetSectionId: details.sectionId || action.targetSectionId || "",
      source: details.source || "",
      navigationRef: details.navigationRef || "",
      elapsedMs: Number(details.elapsedMs) || getGoogleDocsActionElapsed(action),
      blockedReason: details.blockedReason || "",
      exact: Boolean(details.exact),
      approximate: Boolean(details.approximate),
      targetKind: details.targetKind || "",
      exactIssue: details.exactIssue || ""
    });
  }

  function finishGoogleDocsAction(actionId, status, details = {}) {
    const action = runtime.googleDocsAction || {};
    const id = String(actionId || action.actionId || action.activeActionId || "");
    if (!id || action.actionId !== id && action.activeActionId !== id) return false;
    if (action.timeoutTimer) window.clearTimeout(action.timeoutTimer);
    runtime.googleDocsAction = {
      ...action,
      activeActionId: "",
      completed: true,
      cancelled: status === "cancelled" || Boolean(action.cancelled),
      completedAt: Date.now(),
      updatedAt: Date.now(),
      timeoutTimer: null
    };
    if (status === "blocked") {
      emitGoogleDocsActionLog("google-docs:action:blocked", id, details);
    }
    return true;
  }

  function cancelActiveGoogleDocsAction(reason = "superseded", details = {}) {
    const action = runtime.googleDocsAction || {};
    const actionId = action.activeActionId || action.actionId || "";
    if (!actionId || action.completed || action.cancelled) return false;
    if (action.timeoutTimer) window.clearTimeout(action.timeoutTimer);
    runtime.googleDocsAction = {
      ...action,
      activeActionId: "",
      cancelled: true,
      completed: true,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      timeoutTimer: null
    };
    emitGoogleDocsActionLog("google-docs:action:blocked", actionId, {
      ...details,
      blockedReason: reason,
      exactIssue: "A newer Google Docs action replaced this pending target."
    });
    return true;
  }

  function beginGoogleDocsAction(type, section, options = {}) {
    const now = Date.now();
    const targetKey = buildGoogleDocsActionTargetKey(type, section, options);
    const current = runtime.googleDocsAction || {};
    if (shouldIgnoreDuplicateGoogleDocsAction(current, targetKey, now)) {
      emitGoogleDocsActionLog("google-docs:action:blocked", current.activeActionId, {
        type,
        sectionId: section && section.id || options.sectionId || "",
        navigationRef: getGoogleDocsSectionNavigationRef(section),
        blockedReason: "duplicate-action",
        exactIssue: "A duplicate Google Docs action for the same target arrived inside the debounce window."
      });
      return { duplicate: true, actionId: current.activeActionId };
    }
    cancelActiveGoogleDocsAction("superseded", {
      type,
      sectionId: section && section.id || "",
      navigationRef: getGoogleDocsSectionNavigationRef(section)
    });
    const actionId = makeGoogleDocsActionId(type);
    const timeoutTimer = window.setTimeout(() => {
      if (!isGoogleDocsActionActive(actionId)) return;
      finishGoogleDocsAction(actionId, "blocked", {
        type,
        sectionId: section && section.id || "",
        navigationRef: getGoogleDocsSectionNavigationRef(section),
        blockedReason: "google-docs-action-timeout",
        exactIssue: "Google Docs navigation exceeded its bounded action timeout."
      });
      setActionResult(type, false, {
        section,
        phase: "blocked",
        blockedReason: "google-docs-action-timeout",
        message: "Google Docs did not expose that section quickly enough to jump there."
      });
    }, GOOGLE_DOCS_ACTION_TIMEOUT_MS);
    runtime.googleDocsAction = {
      actionId,
      activeActionId: actionId,
      type,
      targetSectionId: section && section.id || options.sectionId || "",
      targetKey,
      startedAt: now,
      updatedAt: now,
      completedAt: 0,
      timeoutTimer,
      cancelled: false,
      completed: false
    };
    emitGoogleDocsActionLog("google-docs:action:received", actionId, {
      type,
      sectionId: section && section.id || "",
      source: options.source || "",
      navigationRef: getGoogleDocsSectionNavigationRef(section),
      exactIssue: "Google Docs navigation is handled by a bounded SkimRoute-owned action branch."
    });
    return { duplicate: false, actionId };
  }

  function blockGoogleDocsActionWithoutTarget(type, blockedReason = "no-google-docs-target") {
    cancelActiveGoogleDocsAction("superseded", { type, blockedReason });
    const actionId = makeGoogleDocsActionId(type);
    runtime.googleDocsAction = {
      actionId,
      activeActionId: "",
      type,
      targetSectionId: "",
      targetKey: `${getRouteCacheKey()}|${type}|no-target`,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
      timeoutTimer: null,
      cancelled: false,
      completed: true
    };
    emitGoogleDocsActionLog("google-docs:action:received", actionId, {
      type,
      blockedReason,
      exactIssue: "Google Docs action was requested, but no current mapped section target exists."
    });
    emitGoogleDocsActionLog("google-docs:action:blocked", actionId, {
      type,
      blockedReason,
      exactIssue: "SkimRoute will not invent a Google Docs navigation target when the document text is not mapped strongly enough."
    });
    setActionResult(type, false, {
      phase: "blocked",
      blockedReason,
      message: "Google Docs has no mapped target to jump to yet."
    });
    return false;
  }

  function performGoogleDocsSectionNavigation(section, options = {}) {
    const type = options.actionType || options.source || "section";
    if (!section || !isGoogleDocsActionContext(runtime.model, section)) return false;
    const begin = beginGoogleDocsAction(type, section, options);
    if (begin.duplicate) return true;
    const actionId = begin.actionId;
    window.setTimeout(() => {
      runGoogleDocsNavigationStep(actionId, section, { ...options, actionType: type })
        .catch((error) => {
          if (!isGoogleDocsActionActive(actionId)) return;
          finishGoogleDocsAction(actionId, "blocked", {
            type,
            sectionId: section.id,
            navigationRef: getGoogleDocsSectionNavigationRef(section),
            blockedReason: "google-docs-action-error",
            exactIssue: String(error && error.message ? error.message : error)
          });
        });
    }, 0);
    return true;
  }

  async function runGoogleDocsNavigationStep(actionId, section, options = {}) {
    const type = options.actionType || "section";
    if (!isGoogleDocsActionActive(actionId)) return false;
    const navigationRef = getGoogleDocsSectionNavigationRef(section);
    emitGoogleDocsActionLog("google-docs:action:section-resolved", actionId, {
      type,
      sectionId: section.id,
      source: section.unitMeta && section.unitMeta.googleDocsSource || section.source || "",
      navigationRef,
      exactIssue: "The selected Google Docs section came from the current in-memory SkimRoute model."
    });

    let target = resolveGoogleDocsExactTarget(section);
    if (target && isGoogleDocsCandidateExact(section, target.element, target)) {
      emitGoogleDocsActionLog("google-docs:action:target-exact", actionId, {
        type,
        sectionId: section.id,
        source: target.source,
        navigationRef,
        exact: true,
        targetKind: target.kind || "editor"
      });
      return completeGoogleDocsNavigation(actionId, section, target, { ...options, approximate: false });
    }

    const outline = resolveGoogleDocsOutlineEntry(section);
    if (outline && outline.element) {
      emitGoogleDocsActionLog("google-docs:action:outline-fallback-used", actionId, {
        type,
        sectionId: section.id,
        source: outline.source || "outline",
        navigationRef,
        targetKind: "outline",
        exactIssue: "The exact Google Docs editor block was not mounted, so SkimRoute activated the matching document outline entry."
      });
      activateGoogleDocsOutlineEntry(outline.element);
      target = await waitForGoogleDocsExactTarget(section, actionId);
      if (target && isGoogleDocsCandidateExact(section, target.element, target)) {
        emitGoogleDocsActionLog("google-docs:action:target-exact", actionId, {
          type,
          sectionId: section.id,
          source: target.source,
          navigationRef,
          exact: true,
          targetKind: target.kind || "editor"
        });
        return completeGoogleDocsNavigation(actionId, section, target, { ...options, approximate: false });
      }
      const approximateOutlineTarget = resolveGoogleDocsApproximateTarget(section, { preferredElement: outline.element, reason: "outline-target-not-mounted" });
      if (approximateOutlineTarget) {
        emitGoogleDocsActionLog("google-docs:action:target-approximate", actionId, {
          type,
          sectionId: section.id,
          source: approximateOutlineTarget.source,
          navigationRef,
          approximate: true,
          targetKind: approximateOutlineTarget.kind || "outline",
          exactIssue: "Google Docs did not mount the exact editor block after outline activation, so SkimRoute will show an approximate location."
        });
        return completeGoogleDocsNavigation(actionId, section, approximateOutlineTarget, { ...options, approximate: true });
      }
    }

    const approximateTarget = resolveGoogleDocsApproximateTarget(section);
    if (approximateTarget) {
      emitGoogleDocsActionLog("google-docs:action:target-approximate", actionId, {
        type,
        sectionId: section.id,
        source: approximateTarget.source,
        navigationRef,
        approximate: true,
        targetKind: approximateTarget.kind || "approximate",
        exactIssue: "The exact Google Docs block is virtualized or approximate, so SkimRoute will use the nearest safe document area."
      });
      return completeGoogleDocsNavigation(actionId, section, approximateTarget, { ...options, approximate: true });
    }

    finishGoogleDocsAction(actionId, "blocked", {
      type,
      sectionId: section.id,
      navigationRef,
      blockedReason: target ? "chrome-candidate-rejected" : "no-google-docs-target",
      exactIssue: "No mounted Google Docs document block or safe outline fallback could be verified for this section."
    });
    setActionResult(type, false, {
      section,
      phase: "blocked",
      blockedReason: "no-google-docs-target",
      message: "Google Docs did not expose that section for navigation yet."
    });
    return false;
  }

  async function completeGoogleDocsNavigation(actionId, section, target, options = {}) {
    if (!isGoogleDocsActionActive(actionId)) return false;
    const type = options.actionType || runtime.googleDocsAction && runtime.googleDocsAction.type || "section";
    const scrolled = await scrollGoogleDocsTargetIntoView(target, section, Boolean(options.approximate));
    if (!isGoogleDocsActionActive(actionId)) return false;
    if (!scrolled) {
      finishGoogleDocsAction(actionId, "blocked", {
        type,
        sectionId: section && section.id || "",
        navigationRef: getGoogleDocsSectionNavigationRef(section),
        blockedReason: "target-not-mounted",
        exactIssue: "A Google Docs target was selected but could not be scrolled into view."
      });
      return false;
    }
    runtime.view.activeId = section.id;
    if (expandAncestors(section.id)) {
      render();
    } else if (runtime.ui) {
      runtime.ui.updateActiveClasses(runtime.view.activeId);
    }
    const highlighted = showGoogleDocsHighlight(target, section, { approximate: Boolean(options.approximate) });
    if (options.approximate) {
      showGoogleDocsActionNotice(GOOGLE_DOCS_APPROXIMATE_MESSAGE);
    }
    if (highlighted) {
      emitGoogleDocsActionLog("google-docs:action:highlight-applied", actionId, {
        type,
        sectionId: section.id,
        source: target.source,
        navigationRef: getGoogleDocsSectionNavigationRef(section),
        exact: !options.approximate,
        approximate: Boolean(options.approximate),
        targetKind: target.kind || ""
      });
    }
    finishGoogleDocsAction(actionId, "completed", {
      type,
      sectionId: section.id,
      navigationRef: getGoogleDocsSectionNavigationRef(section)
    });
    setActionResult(type, true, {
      section,
      phase: "completed",
      message: options.approximate ? GOOGLE_DOCS_APPROXIMATE_MESSAGE : "Google Docs section highlighted."
    });
    return true;
  }

  function resolveGoogleDocsExactTarget(section, details = {}) {
    const doc = details.document || document;
    const candidates = [];
    const addCandidate = (element, source, kind) => {
      if (!element || !isElementNode(element)) return;
      candidates.push({ element, source, kind });
    };
    addCandidate(section && section.anchor, "section-anchor", "editor");
    (section && section.blocks || []).forEach((block) => addCandidate(block, "section-block", "editor"));
    queryGoogleDocsElementsByNavigationRef(section, doc).forEach((element) => addCandidate(element, "navigation-ref", "editor"));
    return candidates.find((candidate) => {
      if (!isGoogleDocsDocumentContentElement(candidate.element)) return false;
      if (!isVisibleGoogleDocsElement(candidate.element)) return false;
      return isGoogleDocsCandidateExact(section, candidate.element, candidate);
    }) || null;
  }

  function resolveGoogleDocsOutlineEntry(section, details = {}) {
    const doc = details.document || document;
    if (!doc || typeof doc.querySelectorAll !== "function") return null;
    const navigationRef = getGoogleDocsSectionNavigationRef(section);
    const headingTitles = getGoogleDocsSectionHeadingTitles(section);
    const entries = Array.from(doc.querySelectorAll(GOOGLE_DOCS_OUTLINE_SELECTOR))
      .filter((entry) => isElementNode(entry) && isVisibleGoogleDocsElement(entry));
    const byRef = entries.find((entry) => googleDocsElementMatchesNavigationRef(entry, navigationRef));
    if (byRef) return { element: byRef, source: "outline-ref", kind: "outline" };
    const byTitle = entries.find((entry) => {
      const text = normalizeGoogleDocsText(entry.innerText || entry.textContent || "");
      return headingTitles.some((title) => title && normalizeGoogleDocsText(title) === text);
    });
    if (byTitle) return { element: byTitle, source: "outline-title", kind: "outline" };
    return null;
  }

  function resolveGoogleDocsApproximateTarget(section, details = {}) {
    const preferred = details.preferredElement;
    if (preferred && isGoogleDocsDocumentContentElement(preferred) && isVisibleGoogleDocsElement(preferred)) {
      return {
        element: preferred,
        source: details.reason || "outline",
        kind: "approximate-outline",
        approximate: true,
        approximateOffset: 0
      };
    }
    const exactCandidate = [section && section.anchor].concat(section && section.blocks || [])
      .find((element) => isElementNode(element) && isGoogleDocsDocumentContentElement(element) && isVisibleGoogleDocsElement(element));
    if (exactCandidate) {
      return {
        element: exactCandidate,
        source: section && section.unitMeta && section.unitMeta.googleDocsSource || "section",
        kind: "approximate-section",
        approximate: true,
        approximateOffset: getGoogleDocsApproximateOffset(section, exactCandidate)
      };
    }
    const doc = details.document || document;
    const root = findGoogleDocsContentRoot(doc);
    if (root) {
      return {
        element: root,
        source: "content-root",
        kind: "approximate-root",
        approximate: true,
        approximateOffset: getGoogleDocsApproximateOffset(section, root)
      };
    }
    return null;
  }

  function queryGoogleDocsElementsByNavigationRef(section, doc = document) {
    const navigationRef = getGoogleDocsSectionNavigationRef(section);
    if (!navigationRef || !doc || typeof doc.querySelectorAll !== "function") return [];
    const escaped = cssEscape(navigationRef.replace(/^#/, ""));
    const selectors = [
      `#${escaped}`,
      `[data-target-id="${cssEscape(navigationRef)}"]`,
      `[data-id="${cssEscape(navigationRef)}"]`,
      `[data-pagepilot-section="${cssEscape(section && section.id || "")}"]`,
      `[href="#${escaped}"]`
    ].filter((selector) => !/""/.test(selector));
    const found = [];
    selectors.forEach((selector) => {
      try {
        found.push(...Array.from(doc.querySelectorAll(selector)));
      } catch (error) {
        // Ignore selector support gaps on Google Docs internals.
      }
    });
    return uniqueElements(found);
  }

  function getGoogleDocsSectionHeadingTitles(section) {
    const meta = section && section.unitMeta || {};
    const titles = [section && section.title, meta.googleDocsParentHeadingTitle];
    if (Array.isArray(meta.googleDocsHeadingPath)) {
      meta.googleDocsHeadingPath.forEach((entry) => titles.push(entry && entry.title || ""));
    }
    return titles.map((title) => String(title || "").trim()).filter(Boolean);
  }

  function isGoogleDocsCandidateExact(section, element, details = {}) {
    if (!isElementNode(element) || !section || !isVisibleGoogleDocsElement(element)) return false;
    if (isGoogleDocsChromeElement(element) || !isGoogleDocsDocumentContentElement(element)) return false;
    const meta = section.unitMeta || {};
    const source = String(details.source || meta.googleDocsSource || "");
    const elementText = getElementTextSample(element, 1800);
    const elementWords = countGoogleDocsWords(elementText);
    const sectionWords = Math.max(1, countGoogleDocsWords(section.text || section.title || ""));
    const oversizedVisibleRoot = source !== "navigation-ref"
      && meta.navigationExact !== true
      && meta.googleDocsSource === "visible-block"
      && elementWords > Math.max(90, sectionWords * 3);
    if (oversizedVisibleRoot) return false;
    if (googleDocsElementMatchesNavigationRef(element, getGoogleDocsSectionNavigationRef(section)) && meta.navigationExact) return true;
    if (section.blocks && section.blocks.includes && section.blocks.includes(element) && !oversizedVisibleRoot) {
      return hasGoogleDocsTextOverlap(section, elementText);
    }
    if (section.anchor === element && !oversizedVisibleRoot) {
      return hasGoogleDocsTextOverlap(section, elementText);
    }
    return hasGoogleDocsTextOverlap(section, elementText);
  }

  function isGoogleDocsChromeElement(element) {
    if (!isElementNode(element)) return false;
    try {
      return Boolean(element.closest && element.closest(GOOGLE_DOCS_CHROME_SELECTOR));
    } catch (error) {
      return false;
    }
  }

  function isGoogleDocsDocumentContentElement(element) {
    if (!isElementNode(element)) return false;
    if (isGoogleDocsChromeElement(element)) return false;
    try {
      return Boolean(
        element.closest && element.closest(GOOGLE_DOCS_CONTENT_SELECTOR)
        || element.matches && element.matches(GOOGLE_DOCS_CONTENT_SELECTOR)
      );
    } catch (error) {
      return false;
    }
  }

  function isVisibleGoogleDocsElement(element) {
    if (!isElementNode(element)) return false;
    try {
      const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
      if (rect && rect.width <= 0 && rect.height <= 0) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
      if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return false;
      return true;
    } catch (error) {
      return true;
    }
  }

  function findGoogleDocsContentRoot(doc = document) {
    if (!doc || typeof doc.querySelector !== "function") return null;
    try {
      return doc.querySelector(GOOGLE_DOCS_CONTENT_SELECTOR);
    } catch (error) {
      return null;
    }
  }

  function findGoogleDocsScrollContainer(element) {
    const contentRoot = element && element.closest && element.closest(".kix-appview-editor, .docs-editor-container, .docs-pageless-content, [aria-label*='Document content' i]") || null;
    let current = contentRoot || element && element.parentElement || null;
    while (current && current !== document.body && current !== document.documentElement) {
      try {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY || style.overflow;
        if (/(auto|scroll|overlay)/i.test(overflowY) && current.scrollHeight > current.clientHeight + 24) {
          return current;
        }
      } catch (error) {
        // Ignore traversal issues.
      }
      current = current.parentElement;
    }
    return document.scrollingElement || document.documentElement || document.body;
  }

  async function scrollGoogleDocsTargetIntoView(target, section, approximate) {
    const element = target && target.element;
    if (!isElementNode(element)) return false;
    const container = findGoogleDocsScrollContainer(element);
    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = prefersReducedMotion ? "auto" : "smooth";
    try {
      const offset = Number(target.approximateOffset || 0);
      if (container && container !== document.body && container !== document.documentElement) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = element.getBoundingClientRect();
        const top = Math.max(0, Number(container.scrollTop || 0) + (targetRect.top - containerRect.top) + offset - Math.max(80, Number(container.clientHeight || 0) * 0.32));
        if (typeof container.scrollTo === "function") {
          container.scrollTo({ top, behavior });
        } else {
          container.scrollTop = top;
        }
      } else if (typeof element.scrollIntoView === "function" && !approximate) {
        element.scrollIntoView({ behavior, block: "center", inline: "nearest" });
      } else {
        const rect = element.getBoundingClientRect();
        const top = Math.max(0, Number(window.scrollY || 0) + rect.top + offset - Math.max(80, Number(window.innerHeight || 0) * 0.32));
        window.scrollTo({ top, behavior });
      }
      await delayGoogleDocsAction(prefersReducedMotion ? 30 : 160);
      emitGoogleDocsActionLog("google-docs:action:editor-scroll-completed", runtime.googleDocsAction && runtime.googleDocsAction.activeActionId, {
        sectionId: section && section.id || "",
        source: target.source || "",
        navigationRef: getGoogleDocsSectionNavigationRef(section),
        approximate: Boolean(approximate),
        targetKind: target.kind || ""
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  function showGoogleDocsHighlight(target, section, options = {}) {
    const rect = getGoogleDocsHighlightRect(target, section, options);
    if (!rect || rect.width < 8 || rect.height < 8) return false;
    clearGoogleDocsHighlight();
    const overlay = document.createElement("div");
    overlay.className = "pagepilot-google-docs-highlight";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.position = "fixed";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483646";
    overlay.style.left = `${Math.round(rect.left)}px`;
    overlay.style.top = `${Math.round(rect.top)}px`;
    overlay.style.width = `${Math.round(rect.width)}px`;
    overlay.style.height = `${Math.round(rect.height)}px`;
    overlay.style.border = "3px solid #2563eb";
    overlay.style.borderRadius = "10px";
    overlay.style.background = "rgba(37, 99, 235, 0.14)";
    overlay.style.boxShadow = "0 0 0 9999px rgba(15, 23, 42, 0.04), 0 14px 38px rgba(37, 99, 235, 0.22)";
    overlay.style.transition = "opacity 180ms ease";
    const label = document.createElement("div");
    label.textContent = `${options.approximate ? "Approximate Google Docs location" : "Google Docs highlight"} - ${section && section.title || "section"}`;
    label.style.position = "absolute";
    label.style.left = "12px";
    label.style.top = "-34px";
    label.style.maxWidth = "min(640px, 80vw)";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    label.style.whiteSpace = "nowrap";
    label.style.padding = "6px 12px";
    label.style.borderRadius = "999px";
    label.style.background = "#2563eb";
    label.style.color = "#ffffff";
    label.style.font = "700 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    label.style.boxShadow = "0 10px 24px rgba(37, 99, 235, 0.24)";
    overlay.appendChild(label);
    document.documentElement.appendChild(overlay);
    runtime.googleDocsHighlightOverlay = overlay;
    runtime.googleDocsHighlightTimer = window.setTimeout(clearGoogleDocsHighlight, JUMP_EFFECT_DURATION_MS);
    runtime.jumpEffectActive = true;
    runtime.jumpEffectLockedUntil = Date.now() + JUMP_EFFECT_SCROLL_LOCK_MS;
    return true;
  }

  function getGoogleDocsHighlightRect(target, section, options = {}) {
    const element = target && target.element;
    if (!isElementNode(element) || !element.getBoundingClientRect) return null;
    const base = element.getBoundingClientRect();
    const approximate = Boolean(options.approximate || target.approximate);
    const offset = Number(target.approximateOffset || 0);
    if (approximate) {
      const width = Math.max(180, Math.min(Number(base.width || window.innerWidth || 0) - 32, Number(base.width || window.innerWidth || 0) * 0.92));
      const left = Math.max(12, Number(base.left || 0) + Math.min(24, Math.max(0, Number(base.width || 0) * 0.04)));
      const top = Math.max(72, Math.min((Number(window.innerHeight || 900) - 120), Number(base.top || 0) + offset));
      return {
        left,
        top,
        width,
        height: Math.max(72, Math.min(150, Number(base.height || 96)))
      };
    }
    const top = Math.max(48, Number(base.top || 0) - 8);
    const left = Math.max(8, Number(base.left || 0) - 10);
    const width = Math.max(80, Math.min(Number(window.innerWidth || 1600) - left - 8, Number(base.width || 0) + 20));
    const height = Math.max(38, Math.min(Number(window.innerHeight || 900) - top - 8, Number(base.height || 0) + 16));
    return { left, top, width, height };
  }

  function showGoogleDocsActionNotice(message) {
    clearGoogleDocsActionNotice();
    const notice = document.createElement("div");
    notice.className = "pagepilot-google-docs-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.textContent = String(message || "");
    notice.style.position = "fixed";
    notice.style.left = "50%";
    notice.style.bottom = "32px";
    notice.style.transform = "translateX(-50%)";
    notice.style.zIndex = "2147483647";
    notice.style.maxWidth = "min(720px, calc(100vw - 32px))";
    notice.style.padding = "12px 18px";
    notice.style.borderRadius = "10px";
    notice.style.background = "#0f172a";
    notice.style.color = "#ffffff";
    notice.style.font = "500 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    notice.style.boxShadow = "0 18px 50px rgba(15, 23, 42, 0.28)";
    document.documentElement.appendChild(notice);
    runtime.googleDocsNotice = notice;
    runtime.googleDocsNoticeTimer = window.setTimeout(clearGoogleDocsActionNotice, 4200);
  }

  function clearGoogleDocsHighlight() {
    window.clearTimeout(runtime.googleDocsHighlightTimer);
    runtime.googleDocsHighlightTimer = null;
    if (runtime.googleDocsHighlightOverlay && runtime.googleDocsHighlightOverlay.parentNode) {
      runtime.googleDocsHighlightOverlay.parentNode.removeChild(runtime.googleDocsHighlightOverlay);
    }
    runtime.googleDocsHighlightOverlay = null;
  }

  function clearGoogleDocsActionNotice() {
    window.clearTimeout(runtime.googleDocsNoticeTimer);
    runtime.googleDocsNoticeTimer = null;
    if (runtime.googleDocsNotice && runtime.googleDocsNotice.parentNode) {
      runtime.googleDocsNotice.parentNode.removeChild(runtime.googleDocsNotice);
    }
    runtime.googleDocsNotice = null;
  }

  function activateGoogleDocsOutlineEntry(element) {
    if (!isElementNode(element)) return false;
    try {
      if (typeof element.click === "function") {
        element.click();
        return true;
      }
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      element.dispatchEvent(event);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function waitForGoogleDocsExactTarget(section, actionId) {
    const deadline = Date.now() + GOOGLE_DOCS_ACTION_OUTLINE_WAIT_MS;
    while (Date.now() < deadline) {
      if (!isGoogleDocsActionActive(actionId)) return null;
      const target = resolveGoogleDocsExactTarget(section);
      if (target && isGoogleDocsCandidateExact(section, target.element, target)) return target;
      await delayGoogleDocsAction(140);
    }
    return null;
  }

  function getGoogleDocsApproximateOffset(section, element) {
    const ref = getGoogleDocsSectionNavigationRef(section);
    const segmentMatch = ref.match(/segment-(\d+)/i);
    if (segmentMatch) return Math.max(0, (Number(segmentMatch[1]) - 1) * 96);
    const order = Number(section && section.unitMeta && section.unitMeta.googleDocsDocumentOrder);
    if (Number.isFinite(order) && order > 0 && order < 1000) return Math.min(520, order * 64);
    const top = Number(section && section.unitMeta && section.unitMeta.syntheticTop);
    if (Number.isFinite(top) && element && element.getBoundingClientRect) {
      const rect = element.getBoundingClientRect();
      return Math.max(0, Math.min(520, top - Number(rect.top || 0)));
    }
    return 0;
  }

  function hasGoogleDocsTextOverlap(section, elementText) {
    const sectionTokens = getGoogleDocsMeaningfulTokens(`${section && section.title || ""} ${section && section.text || ""}`);
    const elementTokens = new Set(getGoogleDocsMeaningfulTokens(elementText));
    if (!sectionTokens.length || !elementTokens.size) return false;
    const matches = sectionTokens.filter((token) => elementTokens.has(token));
    return matches.length >= Math.min(4, Math.max(2, Math.ceil(sectionTokens.length * 0.18)));
  }

  function getGoogleDocsMeaningfulTokens(text) {
    const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "you", "are", "was", "were", "not", "but", "have", "has", "had", "will", "can", "section", "google", "docs"]);
    return Array.from(new Set(String(text || "").toLowerCase().match(/\b[a-z][a-z0-9'-]{2,}\b/g) || []))
      .filter((token) => !stop.has(token))
      .slice(0, 60);
  }

  function googleDocsElementMatchesNavigationRef(element, navigationRef) {
    if (!isElementNode(element) || !navigationRef) return false;
    const ref = String(navigationRef || "").replace(/^#/, "");
    const candidates = [
      element.id,
      element.getAttribute && element.getAttribute("data-target-id"),
      element.getAttribute && element.getAttribute("data-id"),
      element.getAttribute && element.getAttribute("href"),
      element.getAttribute && element.getAttribute("data-pagepilot-section")
    ].filter(Boolean).map((value) => String(value || "").replace(/^#/, ""));
    return candidates.some((value) => value === ref || value.endsWith(`#${ref}`));
  }

  function getElementTextSample(element, maxLength = 1200) {
    const text = normalizeGoogleDocsText(element && (element.innerText || element.textContent) || "");
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  function normalizeGoogleDocsText(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function countGoogleDocsWords(text) {
    const matches = String(text || "").match(/\b[\w'-]+\b/g);
    return matches ? matches.length : 0;
  }

  function isElementNode(node) {
    return Boolean(node && node.nodeType === 1);
  }

  function delayGoogleDocsAction(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value || ""));
    return String(value || "").replace(/["\\]/g, "\\$&").replace(/[^\w-]/g, "\\$&");
  }

  function scrollToSection(id, options) {
    const section = runtime.model && runtime.model.sections.find((item) => item.id === id);
    if (!section) {
      if (isGoogleDocsActionContext(runtime.model)) {
        return blockGoogleDocsActionWithoutTarget(options && options.actionType || "section", "no-google-docs-target");
      }
      return false;
    }

    clearJumpEffect();
    const isPdf = Boolean(runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf");
    if (isPdf && isOcrPdfSection(section) && getPdfSectionPageNumber(section)) {
      return performPdfSyntheticJump(section, options);
    }
    if (!isPdf && isGoogleDocsActionContext(runtime.model, section)) {
      return performGoogleDocsSectionNavigation(section, options || {});
    }
    if (!section.anchor) {
      return false;
    }
    if (isPdf && isSyntheticPdfSection(section)) {
      return performPdfSyntheticJump(section, options);
    }
    const scrollAnchor = isPdf ? resolvePdfScrollAnchor(section) : section.anchor;
    if (isPdf && !isSafePdfJumpAnchor(scrollAnchor)) {
      return performPdfSyntheticJump(section, options);
    }
    const scrollSection = scrollAnchor && scrollAnchor !== section.anchor
      ? { ...section, anchor: scrollAnchor, blocks: [scrollAnchor] }
      : section;
    const navigatedToExternalTarget = navigateToSectionTarget(scrollSection);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollOffset = runtime.engine.getScrollOffset();
    const scrollContainer = findScrollContainer(scrollSection.anchor);
    const scrollTarget = scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement
      ? scrollContainer
      : null;
    const isChat = Boolean(runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "chat");

    if (scrollTarget) {
      if (typeof scrollSection.anchor.scrollIntoView === "function") {
        scrollSection.anchor.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: isChat ? "center" : "start",
          inline: "nearest"
        });
      }
      if (!isChat) {
        const containerRect = scrollTarget.getBoundingClientRect();
        const targetRect = scrollSection.anchor.getBoundingClientRect();
        const top = Math.max(0, scrollTarget.scrollTop + (targetRect.top - containerRect.top) - scrollOffset);
        scrollTarget.scrollTo({
          top,
          behavior: prefersReducedMotion ? "auto" : "smooth"
        });
      }
    } else if (!navigatedToExternalTarget || scrollSection.anchor !== document.body) {
      if (typeof scrollSection.anchor.scrollIntoView === "function") {
        scrollSection.anchor.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: isChat ? "center" : "start",
          inline: "nearest"
        });
      }
      if (!isChat) {
        const target = Math.max(0, scrollSection.anchor.getBoundingClientRect().top + window.scrollY - scrollOffset);
        window.scrollTo({
          top: target,
          behavior: prefersReducedMotion ? "auto" : "smooth"
        });
      }
    }

    runtime.view.activeId = section.id;
    if (expandAncestors(section.id)) {
      render();
    } else {
      runtime.ui.updateActiveClasses(runtime.view.activeId);
    }

    if (options && options.highlight) {
      runtime.jumpEffectTimer = window.setTimeout(() => activateJumpEffect(scrollSection), prefersReducedMotion ? 60 : 480);
    }

    if (isPdf) {
      setPdfActiveTarget(section, getPdfSectionPageNumber(section), "dom");
    }

    return true;
  }

  function scrollPdfPageElementToSection(section, pageNumber, prefersReducedMotion) {
    const page = findPdfPageElement(pageNumber);
    if (!page || typeof page.scrollIntoView !== "function") return false;
    const relativeY = getPdfSectionRelativeYRange(section).start;
    try {
      page.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
        inline: "nearest"
      });
      const container = findScrollContainer(page);
      const pageRect = page.getBoundingClientRect();
      const offset = Math.max(0, Math.round(pageRect.height * Math.max(0.02, Math.min(0.92, relativeY))));
      if (container && container !== document.body && container !== document.documentElement) {
        const containerRect = container.getBoundingClientRect();
        const targetTop = Math.max(0, container.scrollTop + (pageRect.top - containerRect.top) + offset - Math.min(180, container.clientHeight * 0.22));
        if (typeof container.scrollTo === "function") {
          container.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? "auto" : "smooth" });
        } else {
          container.scrollTop = targetTop;
        }
      } else {
        const targetTop = Math.max(0, window.scrollY + pageRect.top + offset - Math.min(180, window.innerHeight * 0.22));
        window.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
      emitDebug("pdf:jump:page-element", {
        sectionId: section && section.id,
        pageNumber,
        relativeY,
        pageTag: page.tagName ? page.tagName.toLowerCase() : ""
      });
      return true;
    } catch (error) {
      emitDebug("pdf:jump:page-element-error", {
        sectionId: section && section.id,
        pageNumber,
        error: String(error && error.message ? error.message : error)
      });
      return false;
    }
  }

  function navigatePdfPageByHash(pageNumber) {
    const target = Number(pageNumber);
    if (!Number.isFinite(target) || target < 1) return false;
    const hash = `#page=${target}`;
    try {
      if (String(window.location.hash || "").toLowerCase() === hash.toLowerCase()) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        emitDebug("pdf:jump:hash-same", {
          pageNumber: target,
          note: "Hash alone is not treated as proof of PDF movement; Chrome's PDF viewer often ignores same-document hash changes after load."
        });
        return readChromePdfViewerPageNumber() === target || Boolean(findPdfPageElement(target));
      }
      window.location.hash = hash;
      emitDebug("pdf:jump:hash", {
        pageNumber: target,
        hash,
        note: "Hash was requested only as a last-resort soft jump; SkimRoute no longer treats this as success unless the viewer exposes the target page."
      });
      return readChromePdfViewerPageNumber() === target || Boolean(findPdfPageElement(target));
    } catch (error) {
      emitDebug("pdf:jump:hash-error", {
        pageNumber: target,
        error: String(error && error.message ? error.message : error)
      });
      return false;
    }
  }

  function showPdfSectionHighlight(section, pageNumber, options = {}) {
    clearPdfJumpMarker();
    const page = findPdfPageElement(pageNumber);
    const mode = options.mode || runtime.pdfJumpMode || "pdf";
    if (page && attachPdfPageOverlay(page, section, pageNumber, mode)) {
      return;
    }
    const delay = options.immediate ? 0 : 650;
    window.setTimeout(() => {
      const delayedPage = findPdfPageElement(pageNumber);
      if (delayedPage && attachPdfPageOverlay(delayedPage, section, pageNumber, mode)) return;
      showPdfJumpMarker(section, pageNumber, { persist: true, mode });
      emitDebug("pdf:highlight:fixed-overlay", {
        sectionId: section && section.id,
        pageNumber,
        mode,
        reason: "No visible PDF page element was available for an in-page overlay."
      });
    }, delay);
  }

  function attachPdfPageOverlay(page, section, pageNumber, mode) {
    if (!page || !(page instanceof Element)) return false;
    try {
      const previous = page.querySelector && page.querySelector(".pagepilot-pdf-page-section-highlight");
      if (previous && previous.parentNode) previous.parentNode.removeChild(previous);
      page.classList.add("pagepilot-pdf-page-highlight-host");
      const style = window.getComputedStyle(page);
      if (style.position === "static") {
        page.style.position = "relative";
      }
      const overlay = document.createElement("div");
      overlay.className = "pagepilot-pdf-page-section-highlight";
      overlay.setAttribute("aria-hidden", "true");
      const relativeRange = getPdfSectionRelativeYRange(section);
      overlay.style.setProperty("--pagepilot-pdf-highlight-top", `${Math.round(relativeRange.start * 100)}%`);
      overlay.style.setProperty("--pagepilot-pdf-highlight-height", `${Math.round(Math.max(7, Math.min(24, (relativeRange.end - relativeRange.start) * 100)))}%`);
      const title = runtime.engine.helpers.cleanText(section && section.title ? section.title : "PDF section");
      const excerpt = getPdfSectionExcerpt(section);
      overlay.innerHTML = `
        <span>${runtime.engine.helpers.escapeHtml(title || `Page ${pageNumber}`)}</span>
        ${excerpt ? `<em>${runtime.engine.helpers.escapeHtml(excerpt)}</em>` : ""}
      `;
      page.appendChild(overlay);
      runtime.pdfJumpMarker = overlay;
      runtime.jumpEffectActive = true;
      runtime.jumpEffectLockedUntil = Date.now() + JUMP_EFFECT_SCROLL_LOCK_MS;
      runtime.pdfJumpMarkerTimer = window.setTimeout(clearPdfJumpMarker, JUMP_EFFECT_DURATION_MS);
      emitDebug("pdf:highlight:page-overlay", {
        sectionId: section && section.id,
        pageNumber,
        mode,
        relativeY: relativeRange.center,
        relativeYStart: relativeRange.start,
        relativeYEnd: relativeRange.end
      });
      emitDebug("pdf:jump:highlight-applied", {
        sectionId: section && section.id,
        pageNumber,
        mode,
        relativeY: relativeRange.center,
        exactIssue: "none"
      });
      return true;
    } catch (error) {
      emitDebug("pdf:highlight:page-overlay-error", {
        sectionId: section && section.id,
        pageNumber,
        mode,
        error: String(error && error.message ? error.message : error)
      });
      return false;
    }
  }

  function verifyPdfJumpResult(section, pageNumber, mode) {
    const viewerPage = readChromePdfViewerPageNumber();
    const hashPage = getCurrentPdfPageFromUrl();
    const currentPage = viewerPage || hashPage;
    const visiblePage = findPdfPageElement(pageNumber);
    const visibleRect = visiblePage && visiblePage.getBoundingClientRect ? visiblePage.getBoundingClientRect() : null;
    const pageVisible = Boolean(visibleRect && visibleRect.bottom > 0 && visibleRect.top < window.innerHeight);
    const likelyArrived = viewerPage === pageNumber || pageVisible || mode === "hard-page";
    emitDebug(likelyArrived ? "pdf:jump:verified" : "pdf:jump:not-verified", {
      sectionId: section && section.id,
      targetPage: pageNumber,
      currentPage: currentPage || 0,
      viewerPage: viewerPage || 0,
      hashPage: hashPage || 0,
      pageElementVisible: pageVisible,
      mode: mode || runtime.pdfJumpMode || "",
      note: likelyArrived
        ? "PDF jump command was accepted; highlight should be visible on/near the target page."
        : "The PDF viewer did not expose proof that it moved to the requested page. Chrome's PDF viewer may be blocking direct scrolling; hard page navigation may be needed."
    });
  }

  function resolvePdfScrollAnchor(section) {
    if (!section) return null;
    if (isSafePdfJumpAnchor(section.anchor)) return section.anchor;
    const pageNumber = getPdfSectionPageNumber(section);
    return findPdfPageElement(pageNumber);
  }

  function getPdfSectionPageNumber(section) {
    const value = section && (section.pageNumber || section.unitMeta && section.unitMeta.pageNumber);
    const pageNumber = Number(value);
    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 0;
  }

  function getPdfSectionChunkIndex(section) {
    const value = section && section.unitMeta && Number(section.unitMeta.chunkIndex);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function getPdfSectionOcrGeometry(section) {
    if (!section) return null;
    const unitMeta = section.unitMeta && typeof section.unitMeta === "object" ? section.unitMeta : {};
    const sourceLineGeometry = mergePdfOcrLineBackedGeometry(unitMeta.ocrSourceLines);
    if (sourceLineGeometry) {
      const sourceLineIds = Array.isArray(unitMeta.sourceLineIds) && unitMeta.sourceLineIds.length
        ? unitMeta.sourceLineIds
        : sourceLineGeometry.sourceLineIds || [];
      const exact = Boolean(sourceLineGeometry.exact && unitMeta.ocrExactGeometry !== false && !unitMeta.ocrHighlightApproximate && sourceLineIds.length && isPdfOcrExactGeometryUsable(sourceLineGeometry));
      return {
        ...sourceLineGeometry,
        exact,
        approximate: !exact,
        ocrVariantName: unitMeta.ocrVariantName || sourceLineGeometry.ocrVariantName || "",
        sourceLineIds,
        sourceLineTextSample: unitMeta.sourceLineTextSample || sourceLineGeometry.sourceLineTextSample || "",
        cropOffset: unitMeta.cropOffset || sourceLineGeometry.cropOffset || null,
        renderScale: Number(unitMeta.renderScale || sourceLineGeometry.renderScale || 0) || 0,
        rotation: Number(unitMeta.rotation || sourceLineGeometry.rotation || 0) || 0
      };
    }
    const direct = normalizePdfOcrGeometry(unitMeta.ocrGeometry || section.ocrGeometry || null);
    if (direct) {
      const sourceLineObjects = normalizePdfOcrSourceLines(unitMeta.ocrSourceLines);
      const sourceLineIds = Array.isArray(unitMeta.sourceLineIds) && unitMeta.sourceLineIds.length
        ? unitMeta.sourceLineIds
        : direct.sourceLineIds || [];
      const exact = Boolean(direct.exact && unitMeta.ocrExactGeometry !== false && !unitMeta.ocrHighlightApproximate && sourceLineIds.length && sourceLineObjects.length && isPdfOcrExactGeometryUsable(direct));
      return {
        ...direct,
        exact,
        approximate: !exact,
        ocrVariantName: unitMeta.ocrVariantName || direct.ocrVariantName || "",
        sourceLineIds,
        sourceLineTextSample: unitMeta.sourceLineTextSample || direct.sourceLineTextSample || "",
        ocrSourceLines: sourceLineObjects,
        cropOffset: unitMeta.cropOffset || direct.cropOffset || null,
        renderScale: Number(unitMeta.renderScale || direct.renderScale || 0) || 0,
        rotation: Number(unitMeta.rotation || direct.rotation || 0) || 0
      };
    }
    const bbox = normalizePdfOcrGeometry({
      bbox: unitMeta.ocrBoundingBox || section.ocrBoundingBox || null,
      pageWidth: unitMeta.ocrPageWidth || unitMeta.pageWidth || 0,
      pageHeight: unitMeta.ocrPageHeight || unitMeta.pageHeight || 0,
      wordBoxes: unitMeta.ocrWordBoxes || section.wordBoxes || null,
      relativeY: unitMeta.relativeY,
      relativeYStart: unitMeta.relativeYStart,
      relativeYEnd: unitMeta.relativeYEnd,
      ocrVariantName: unitMeta.ocrVariantName || "",
      sourceLineIds: unitMeta.sourceLineIds || [],
      sourceLineTextSample: unitMeta.sourceLineTextSample || "",
      cropOffset: unitMeta.cropOffset || null,
      renderScale: unitMeta.renderScale,
      rotation: unitMeta.rotation
    });
    if (bbox) {
      const sourceLineObjects = normalizePdfOcrSourceLines(unitMeta.ocrSourceLines);
      const sourceLineIds = Array.isArray(unitMeta.sourceLineIds) ? unitMeta.sourceLineIds : [];
      const exact = Boolean(bbox.exact && unitMeta.ocrExactGeometry !== false && !unitMeta.ocrHighlightApproximate && sourceLineIds.length && sourceLineObjects.length && isPdfOcrExactGeometryUsable(bbox));
      return { ...bbox, exact, approximate: !exact, sourceLineIds, ocrSourceLines: sourceLineObjects };
    }
    if (!isOcrPdfSection(section)) return null;
    const center = clampPdfRelativeValue(unitMeta.relativeY, 0.14);
    const start = clampPdfRelativeValue(unitMeta.relativeYStart, Math.max(0.02, center - 0.035));
    const end = clampPdfRelativeValue(unitMeta.relativeYEnd, Math.min(0.98, center + 0.105));
    return {
      bbox: null,
      pageWidth: 0,
      pageHeight: 0,
      relativeY: center,
      relativeYStart: start,
      relativeYEnd: Math.max(start + 0.035, end),
      wordBoxes: [],
      exact: false
    };
  }

  function getPdfSectionRelativeY(section) {
    const geometry = getPdfSectionOcrGeometry(section);
    if (geometry && Number.isFinite(Number(geometry.relativeY))) {
      return Math.max(0, Math.min(1, Number(geometry.relativeY)));
    }
    const value = section && section.unitMeta && Number(section.unitMeta.relativeY);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.14;
  }

  function getPdfSectionRelativeYRange(section) {
    const geometry = getPdfSectionOcrGeometry(section);
    if (geometry && Number.isFinite(Number(geometry.relativeYStart)) && Number.isFinite(Number(geometry.relativeYEnd))) {
      const start = Math.max(0, Math.min(1, Number(geometry.relativeYStart)));
      const end = Math.max(start + 0.035, Math.min(0.98, Number(geometry.relativeYEnd)));
      return {
        start,
        end,
        center: Math.max(0, Math.min(1, Number(geometry.relativeY) || (start + end) / 2))
      };
    }
    const center = getPdfSectionRelativeY(section);
    const rawStart = section && section.unitMeta && Number(section.unitMeta.relativeYStart);
    const rawEnd = section && section.unitMeta && Number(section.unitMeta.relativeYEnd);
    const start = Number.isFinite(rawStart) ? Math.max(0, Math.min(1, rawStart)) : Math.max(0.02, center - 0.025);
    const end = Number.isFinite(rawEnd) ? Math.max(0, Math.min(1, rawEnd)) : Math.min(0.98, center + 0.09);
    const safeEnd = Math.max(start + 0.035, end);
    return {
      start,
      end: Math.min(0.98, safeEnd),
      center: Math.max(0, Math.min(1, (start + safeEnd) / 2))
    };
  }

  function isSyntheticPdfSection(section) {
    return Boolean(
      section
      && runtime.model
      && runtime.model.pageProfile
      && runtime.model.pageProfile.type === "pdf"
      && section.unitMeta
      && section.unitMeta.synthetic
      && getPdfSectionPageNumber(section)
    );
  }

  function isOcrPdfSection(section) {
    const unitMeta = section && section.unitMeta || {};
    const metrics = section && section.metrics || {};
    return Boolean(
      section
      && getPdfSectionPageNumber(section)
      && (
        unitMeta.ocr
        || unitMeta.kind === "pdf-ocr"
        || metrics.ocrRole
        || unitMeta.ocrRole
        || metrics.sectionKind === "pdf-ocr"
      )
    );
  }

  function normalizePdfActionTargetSection(section) {
    if (!section || !isOcrPdfSection(section)) return section || null;
    section.unitMeta = section.unitMeta && typeof section.unitMeta === "object" ? section.unitMeta : {};
    if (!section.anchor) section.anchor = document.body || document.documentElement;
    if (!Array.isArray(section.blocks) || !section.blocks.length) {
      section.blocks = [section.anchor].filter(Boolean);
    }
    const range = getPdfSectionRelativeYRange(section);
    if (!Number.isFinite(Number(section.unitMeta.relativeYStart))) section.unitMeta.relativeYStart = range.start;
    if (!Number.isFinite(Number(section.unitMeta.relativeYEnd))) section.unitMeta.relativeYEnd = range.end;
    if (!Number.isFinite(Number(section.unitMeta.relativeY))) section.unitMeta.relativeY = range.center;
    const geometry = getPdfSectionOcrGeometry(section);
    if (geometry) {
      section.unitMeta.ocrGeometry = geometry;
      section.unitMeta.ocrBoundingBox = geometry.bbox || null;
      section.unitMeta.ocrExactGeometry = Boolean(geometry.exact);
      section.unitMeta.ocrHighlightApproximate = !geometry.exact;
      if (!section.unitMeta.ocrVariantName && geometry.ocrVariantName) section.unitMeta.ocrVariantName = geometry.ocrVariantName;
      if ((!Array.isArray(section.unitMeta.sourceLineIds) || !section.unitMeta.sourceLineIds.length) && Array.isArray(geometry.sourceLineIds)) {
        section.unitMeta.sourceLineIds = geometry.sourceLineIds.slice(0, 120);
      }
      if ((!Array.isArray(section.unitMeta.ocrSourceLines) || !section.unitMeta.ocrSourceLines.length) && Array.isArray(geometry.ocrSourceLines)) {
        section.unitMeta.ocrSourceLines = normalizePdfOcrSourceLines(geometry.ocrSourceLines);
      }
      if (!section.unitMeta.sourceLineTextSample && geometry.sourceLineTextSample) section.unitMeta.sourceLineTextSample = geometry.sourceLineTextSample;
    }
    if (!section.unitMeta.sectionText) section.unitMeta.sectionText = String(section.text || "").slice(0, 7000);
    if (!section.unitMeta.sectionTextSample) section.unitMeta.sectionTextSample = String(section.text || "").replace(/\s+/g, " ").trim().slice(0, 260);
    section.unitMeta.synthetic = section.unitMeta.synthetic !== false;
    return section;
  }

  function hasSyntheticPdfSections() {
    return Boolean(
      runtime.model
      && runtime.model.pageProfile
      && runtime.model.pageProfile.type === "pdf"
      && Array.isArray(runtime.model.sections)
      && runtime.model.sections.some((section) => isSyntheticPdfSection(section) || isOcrPdfSection(section))
    );
  }

  function getPdfSectionOrder(section) {
    const pageNumber = getPdfSectionPageNumber(section);
    if (!pageNumber) return Number.POSITIVE_INFINITY;
    return pageNumber * 1000 + getPdfSectionChunkIndex(section);
  }

  function getCurrentPdfPageFromUrl() {
    const match = String(window.location.hash || "").match(/#page=(\d+)/i);
    const pageNumber = match ? Number(match[1]) : 0;
    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 0;
  }

  function findPdfSectionFromTarget(target) {
    if (!target || !runtime.model || !Array.isArray(runtime.model.sections)) return null;
    if (target.sectionId) {
      const byId = runtime.model.sections.find((section) => section.id === target.sectionId);
      if (byId) return byId;
    }
    const targetPage = Number(target.pageNumber);
    const targetChunk = Number(target.chunkIndex);
    return runtime.model.sections.find((section) => {
      if (getPdfSectionPageNumber(section) !== targetPage) return false;
      if (Number.isFinite(targetChunk)) {
        return getPdfSectionChunkIndex(section) === targetChunk;
      }
      return true;
    }) || null;
  }

  function setPdfActiveTarget(section, pageNumber, mode) {
    if (!section) return;
    runtime.view.activeId = section.id;
    runtime.lastPdfJumpTarget = {
      routeKey: getPdfDocumentRouteKey(),
      sectionId: section.id,
      pageNumber: pageNumber || getPdfSectionPageNumber(section),
      chunkIndex: getPdfSectionChunkIndex(section),
      relativeY: getPdfSectionRelativeY(section),
      relativeYStart: getPdfSectionRelativeYRange(section).start,
      relativeYEnd: getPdfSectionRelativeYRange(section).end,
      title: section.title || "",
      excerpt: getPdfSectionExcerpt(section),
      updatedAt: Date.now()
    };
    runtime.pdfActivePage = runtime.lastPdfJumpTarget.pageNumber || 0;
    if (mode) runtime.pdfJumpMode = mode;
  }

  function getPdfCurrentOrder() {
    const target = runtime.lastPdfJumpTarget;
    if (target && target.routeKey === getPdfDocumentRouteKey()) {
      const section = findPdfSectionFromTarget(target);
      if (section) return getPdfSectionOrder(section);
      if (Number(target.pageNumber) > 0) {
        return Number(target.pageNumber) * 1000 + (Number(target.chunkIndex) || 0);
      }
    }

    const active = runtime.view.activeId && runtime.model && runtime.model.sections
      ? runtime.model.sections.find((section) => section.id === runtime.view.activeId)
      : null;
    if (active && isSyntheticPdfSection(active)) {
      return getPdfSectionOrder(active);
    }

    const activePage = getCurrentPdfPageFromUrl();
    if (activePage) {
      return activePage * 1000 - 1;
    }

    return null;
  }

  function getNextPdfImportantSection() {
    if (!runtime.model || !hasSyntheticPdfSections()) return null;
    const important = runtime.model.importantSections
      .filter((section) => isSyntheticPdfSection(section) || isOcrPdfSection(section))
      .sort((a, b) => getPdfSectionOrder(a) - getPdfSectionOrder(b));
    if (!important.length) return null;

    const currentOrder = getPdfCurrentOrder();
    if (currentOrder === null) {
      return important.find((section) => section.id !== runtime.view.activeId) || important[0];
    }

    return important.find((section) => getPdfSectionOrder(section) > currentOrder && section.id !== runtime.view.activeId)
      || important.find((section) => section.id !== runtime.view.activeId)
      || important[0]
      || null;
  }

  function getFirstPdfImportantSection() {
    if (!runtime.model || !hasSyntheticPdfSections()) return null;
    return runtime.model.importantSections
      .filter((section) => isSyntheticPdfSection(section) || isOcrPdfSection(section))
      .sort((a, b) => getPdfSectionOrder(a) - getPdfSectionOrder(b))[0] || null;
  }

  function refreshActivePdfSection() {
    if (!runtime.model || !hasSyntheticPdfSections()) return false;
    const sections = runtime.model.sections
      .filter((section) => isSyntheticPdfSection(section) || isOcrPdfSection(section))
      .sort((a, b) => getPdfSectionOrder(a) - getPdfSectionOrder(b));
    if (!sections.length) return false;

    let active = findPdfSectionFromTarget(runtime.lastPdfJumpTarget);
    const currentPage = getCurrentPdfPageFromUrl();
    if (!active && currentPage) {
      active = sections.filter((section) => getPdfSectionPageNumber(section) <= currentPage).pop() || sections[0];
    }
    if (!active && runtime.view.activeId) {
      active = sections.find((section) => section.id === runtime.view.activeId) || null;
    }
    if (!active) {
      active = sections[0];
    }

    runtime.pdfActivePage = currentPage || getPdfSectionPageNumber(active);
    const nextImportant = getNextPdfImportantSection();
    runtime.model.nextImportantId = nextImportant ? nextImportant.id : null;

    if (active && active.id !== runtime.view.activeId) {
      runtime.view.activeId = active.id;
      if (expandAncestors(active.id)) {
        render();
      } else if (runtime.ui) {
        runtime.ui.updateActiveClasses(runtime.view.activeId);
      }
    }

    if (runtime.ui) runtime.ui.updateProgress(runtime.model);
    return true;
  }

  function isSafePdfJumpAnchor(element) {
    if (!element || !(element instanceof Element)) return false;
    if (element === document.body || element === document.documentElement) return false;
    if (element.id === ROOT_ID || element.closest && element.closest(`#${ROOT_ID}`)) return false;
    if (element.id === "pagepilot-pdf-controlled-viewer" || element.closest && element.closest("#pagepilot-pdf-controlled-viewer")) return false;
    if (element.matches && element.matches("#viewer, #viewerContainer, pdf-viewer")) return false;
    return elementLooksPdfLike(element);
  }

  function findPdfPageElement(pageNumber) {
    const targetPage = Number(pageNumber);
    if (!Number.isFinite(targetPage) || targetPage < 1) return null;
    const helpers = runtime.engine && runtime.engine.helpers;
    if (!helpers || !helpers.querySelectorAllDeep) return null;
    const candidates = helpers.querySelectorAllDeep(document, "[data-page-number], .page, [aria-label^='Page ' i], [id^='pageContainer'], [id^='page-']")
      .filter((element) => getPdfPageNumberFromElement(element) === targetPage)
      .filter((element) => isSafePdfJumpAnchor(element));
    return candidates[0] || null;
  }

  function navigateChromePdfViewerPage(pageNumber) {
    const pageIndex = Number(pageNumber) - 1;
    if (!Number.isFinite(pageIndex) || pageIndex < 0) return false;
    if (isPdfViewerAtPage(pageNumber)) return true;
    const viewers = queryPdfDeep("pdf-viewer");

    for (const viewer of viewers) {
      try {
        if (viewer && viewer.viewport && typeof viewer.viewport.goToPage === "function") {
          viewer.viewport.goToPage(pageIndex);
          if (isPdfViewerAtPage(pageNumber)) return true;
        }
      } catch (error) {
        emitDebug("pdf:jump:viewer-api-error", {
          pageNumber,
          error: String(error && error.message ? error.message : error)
        });
      }
    }

    const selectorCommitted = commitPdfPageSelector(pageNumber);
    if (selectorCommitted && isPdfViewerAtPage(pageNumber)) return true;

    const eventTargets = uniqueElements(viewers.concat(queryPdfDeep("viewer-page-selector, viewer-toolbar, viewer-pdf-toolbar")));
    for (const target of eventTargets) {
      try {
        target.dispatchEvent(new CustomEvent("change-page", {
          bubbles: true,
          composed: true,
          detail: { page: pageIndex }
        }));
        emitDebug("pdf:jump:change-page-dispatched", { pageNumber });
        if (isPdfViewerAtPage(pageNumber)) return true;
      } catch (error) {
        emitDebug("pdf:jump:change-page-error", {
          pageNumber,
          error: String(error && error.message ? error.message : error)
        });
      }
    }

    return false;
  }

  function isPdfViewerAtPage(pageNumber) {
    const target = Number(pageNumber);
    if (!Number.isFinite(target) || target < 1) return false;
    if (getCurrentPdfPageFromUrl() === target) return true;
    return readChromePdfViewerPageNumber() === target;
  }

  function readChromePdfViewerPageNumber() {
    const selectorInputs = queryPdfDeep("viewer-page-selector input");
    for (const input of selectorInputs) {
      const value = Number(input && input.value);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const selectors = queryPdfDeep("viewer-page-selector");
    for (const selector of selectors) {
      try {
        const input = selector.shadowRoot && selector.shadowRoot.querySelector
          ? selector.shadowRoot.querySelector("input")
          : selector.querySelector && selector.querySelector("input");
        const value = Number(input && input.value);
        if (Number.isFinite(value) && value > 0) return value;
      } catch (error) {
        // Ignore closed or unavailable viewer internals.
      }
    }
    const viewers = queryPdfDeep("pdf-viewer");
    for (const viewer of viewers) {
      const candidates = [
        viewer && viewer.pageNo,
        viewer && viewer.pageNumber,
        viewer && viewer.viewport && viewer.viewport.page,
        viewer && viewer.viewport && viewer.viewport.pageNumber
      ];
      const value = candidates.map(Number).find((candidate) => Number.isFinite(candidate) && candidate > 0);
      if (value) return value;
    }
    return 0;
  }

  function commitPdfPageSelector(pageNumber) {
    const selectors = queryPdfDeep("viewer-page-selector");
    for (const selector of selectors) {
      try {
        const input = selector.shadowRoot && selector.shadowRoot.querySelector
          ? selector.shadowRoot.querySelector("input")
          : selector.querySelector && selector.querySelector("input");
        if (!input) continue;
        input.value = String(pageNumber);
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        selector.dispatchEvent(new CustomEvent("change-page", {
          bubbles: true,
          composed: true,
          detail: { page: Number(pageNumber) - 1 }
        }));
        return true;
      } catch (error) {
        emitDebug("pdf:jump:page-selector-error", {
          pageNumber,
          error: String(error && error.message ? error.message : error)
        });
      }
    }
    return false;
  }

  function queryPdfDeep(selector) {
    const helpers = runtime.engine && runtime.engine.helpers;
    if (helpers && helpers.querySelectorAllDeep) {
      return helpers.querySelectorAllDeep(document, selector);
    }
    return Array.from(document.querySelectorAll(selector));
  }

  function scrollPdfViewerApproximately(pageNumber, prefersReducedMotion) {
    const totalPages = getPdfTotalPages();
    const ratio = totalPages > 1
      ? Math.max(0, Math.min(1, (pageNumber - 1) / (totalPages - 1)))
      : 0;
    const candidates = getPdfScrollCandidates();
    const behavior = "auto";

    for (const candidate of candidates) {
      const maxScroll = candidate === window
        ? Math.max(0, (document.scrollingElement || document.documentElement).scrollHeight - window.innerHeight)
        : Math.max(0, candidate.scrollHeight - candidate.clientHeight);
      if (maxScroll < 24) continue;
      const top = Math.round(maxScroll * ratio);
      const before = getPdfScrollPosition(candidate);
      if (candidate === window) {
        window.scrollTo({ top, behavior });
      } else if (typeof candidate.scrollTo === "function") {
        candidate.scrollTo({ top, behavior });
      } else {
        candidate.scrollTop = top;
      }
      const after = getPdfScrollPosition(candidate);
      if (Math.abs(after - before) >= 8 || Math.abs(after - top) <= 12) {
        return true;
      }
    }

    return false;
  }

  function getPdfScrollPosition(candidate) {
    if (candidate === window) {
      return Number(window.scrollY || (document.scrollingElement && document.scrollingElement.scrollTop) || 0);
    }
    return Number(candidate && candidate.scrollTop || 0);
  }

  function getPdfScrollCandidates() {
    const helpers = runtime.engine && runtime.engine.helpers;
    const deepCandidates = helpers && helpers.querySelectorAllDeep
      ? helpers.querySelectorAllDeep(document, "#viewerContainer, #viewer, pdf-viewer, embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf'], iframe[src*='.pdf' i], [class*='viewer' i], [class*='pdf' i]")
      : [];
    return uniqueElements(deepCandidates.concat([
      document.scrollingElement,
      document.documentElement,
      document.body
    ]))
      .filter((element) => element && element !== document.body)
      .filter((element) => {
        if (element === document.documentElement || element === document.scrollingElement) {
          return (document.scrollingElement || document.documentElement).scrollHeight > window.innerHeight + 24;
        }
        return element.scrollHeight > element.clientHeight + 24;
      })
      .concat(window);
  }

  function getPdfTotalPages() {
    const fromModel = runtime.model && Array.isArray(runtime.model.sections)
      ? runtime.model.sections.reduce((max, section) => Math.max(max, getPdfSectionPageNumber(section)), 0)
      : 0;
    const fromRuntime = runtime.pdfOcr && Number(runtime.pdfOcr.pages) || 0;
    return Math.max(1, fromRuntime, fromModel);
  }

  function navigatePdfPageHard(section, pageNumber) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      return false;
    }
    const baseUrl = `${getPdfDocumentRouteKey()}#page=${pageNumber}`;
    let url = baseUrl;
    persistCurrentPdfCache(getPdfDocumentRouteKey());
    const sameTargetUrl = String(window.location.href || "") === baseUrl;
    if (sameTargetUrl) {
      url = `${baseUrl}&pagepilotJump=${Date.now()}`;
    }
    storePendingPdfJumpMarker(section, pageNumber);
    try {
      chrome.runtime.sendMessage({
        type: "PAGEPILOT_NAVIGATE_PDF_PAGE",
        url,
        pageNumber
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          emitDebug("pdf:jump:hard-error", {
            pageNumber,
            url,
            error: chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : response && response.error ? response.error : "Unable to navigate PDF page."
          });
        } else if (response && response.sameUrl) {
          clearPendingPdfJumpMarker();
        }
      });
      return true;
    } catch (error) {
      emitDebug("pdf:jump:hard-exception", {
        pageNumber,
        url,
        error: String(error && error.message ? error.message : error)
      });
      return false;
    }
  }

  function getPdfPageNumberFromElement(element) {
    if (!element) return 0;
    const candidates = [
      element.getAttribute && element.getAttribute("data-page-number"),
      element.getAttribute && element.getAttribute("data-page"),
      element.getAttribute && element.getAttribute("aria-label"),
      element.id || ""
    ].filter(Boolean).join(" ");
    const match = candidates.match(/\bpage(?:Container|-|\s+)?(\d+)\b/i) || candidates.match(/\b(\d{1,5})\b/);
    return match ? Number(match[1]) : 0;
  }

  function findScrollContainer(element) {
    let current = element && element.parentElement ? element.parentElement : null;
    while (current && current !== document.body && current !== document.documentElement) {
      try {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY || style.overflow;
        const scrollable = /(auto|scroll|overlay)/i.test(overflowY) && current.scrollHeight > current.clientHeight + 24;
        if (scrollable) {
          return current;
        }
      } catch (error) {
        // Ignore traversal issues.
      }
      current = current.parentElement;
    }

    if (document.scrollingElement && document.scrollingElement.scrollHeight > window.innerHeight + 24) {
      return document.scrollingElement;
    }

    return document.body;
  }

  function navigateToSectionTarget(section) {
    const target = section.navigationTarget || section.unitMeta && section.unitMeta.navigationTarget;
    if (!target || typeof target !== "string") return false;
    if (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf") return false;
    if (target.charAt(0) === "#") {
      if (window.location.hash !== target) {
        window.location.hash = target;
      }
      return true;
    }
    return false;
  }

  function toggleSectionCollapse(id) {
    const section = runtime.model && runtime.model.sections.find((item) => item.id === id);
    if (!section || !section.childIds || !section.childIds.length) return;

    if (runtime.view.collapsedSectionIds.has(id)) {
      runtime.view.collapsedSectionIds.delete(id);
      section.isCollapsed = false;
    } else {
      if (runtime.view.activeId && isSectionDescendantOf(runtime.view.activeId, id)) return;
      runtime.view.collapsedSectionIds.add(id);
      section.isCollapsed = true;
    }

    render();
  }

  function isSectionDescendantOf(childId, parentId) {
    let current = runtime.model.sections.find((section) => section.id === childId);
    while (current && current.parentId) {
      if (current.parentId === parentId) return true;
      current = runtime.model.sections.find((section) => section.id === current.parentId);
    }
    return false;
  }

  function expandAncestors(sectionId) {
    let changed = false;
    let current = runtime.model.sections.find((section) => section.id === sectionId);
    while (current && current.parentId) {
      const parent = runtime.model.sections.find((section) => section.id === current.parentId);
      if (!parent) break;
      if (runtime.view.collapsedSectionIds.has(parent.id)) {
        runtime.view.collapsedSectionIds.delete(parent.id);
        parent.isCollapsed = false;
        changed = true;
      }
      current = parent;
    }
    return changed;
  }

  function requestScrollUpdate() {
    if (runtime.scrollTicking) return;
    runtime.scrollTicking = true;
    window.requestAnimationFrame(() => {
      runtime.scrollTicking = false;
      clearJumpEffectFromUser();
      refreshActiveSection();
      runtime.ui.updateProgress(runtime.model);
    });
  }

  function requestResizeUpdate() {
    if (runtime.resizeTicking) return;
    runtime.resizeTicking = true;
    window.requestAnimationFrame(() => {
      runtime.resizeTicking = false;
      refreshSectionPositions();
      refreshActiveSection();
    });
  }

  function refreshSectionPositions() {
    if (!runtime.model) return;
    runtime.engine.refreshSectionPositions(runtime.model.sections);
  }

  function refreshActiveSection() {
    if (!runtime.model || !runtime.model.sections.length) {
      if (runtime.ui && runtime.model) runtime.ui.updateProgress(runtime.model);
      return;
    }

    if (hasSyntheticPdfSections()) {
      refreshActivePdfSection();
      return;
    }

    refreshSectionPositions();
    const scrollContainer = findScrollContainer((runtime.model.sections[0] && runtime.model.sections[0].anchor) || runtime.model.articleRoot || document.body);
    const scroller = scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement
      ? scrollContainer
      : null;
    const viewportTop = scroller ? scroller.getBoundingClientRect().top + window.scrollY : 0;
    const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
    const viewportSize = scroller ? scroller.clientHeight : window.innerHeight;
    const marker = scrollTop + Math.min(viewportSize * 0.36, 300);
    let active = runtime.model.sections[0];

    runtime.model.sections.forEach((section) => {
      const sectionPosition = scroller ? section.top - viewportTop + scrollTop : section.top;
      if (sectionPosition <= marker) active = section;
    });

    const nextImportant = runtime.model.importantSections.find((section) => {
      const sectionPosition = scroller ? section.top - viewportTop + scrollTop : section.top;
      return sectionPosition > marker + 80 && section.id !== active.id;
    });
    runtime.model.nextImportantId = nextImportant ? nextImportant.id : null;

    if (active && active.id !== runtime.view.activeId) {
      runtime.view.activeId = active.id;
      if (expandAncestors(active.id)) {
        render();
      } else if (runtime.ui) {
        runtime.ui.updateActiveClasses(runtime.view.activeId);
      }
    }

    if (runtime.ui) runtime.ui.updateProgress(runtime.model);
  }

  function activateJumpEffect(section) {
    if (!section || !section.anchor) return;
    clearJumpEffect();
    const targetElements = uniqueElements([section.anchor].concat(section.blocks || []))
      .filter((element) => isSafeJumpEffectElement(element, section));

    if (!targetElements.length) {
      return;
    }

    runtime.jumpEffectActive = true;
    runtime.jumpEffectLockedUntil = Date.now() + JUMP_EFFECT_SCROLL_LOCK_MS;

    targetElements.slice(0, 8).forEach((element) => {
      element.classList.add("pagepilot-answer-target");
      runtime.highlightedElements.push(element);
    });

    const dimCandidates = runtime.model.sections
      .filter((item) => item.id !== section.id)
      .filter((item) => {
        const beforeTarget = item.top < section.top && item.score < section.score - 24;
        const clearFluff = item.metrics.fluffScore >= 44 || item.metrics.isDenseLinks || item.metrics.negativePatternHit;
        const lowSignal = item.score < 20 && item.wordCount < 220;
        return clearFluff || beforeTarget || lowSignal;
      })
      .flatMap((item) => [item.anchor].concat(item.blocks || []));

    uniqueElements(dimCandidates)
      .filter((element) => isSafeJumpEffectElement(element, section))
      .filter((element) => !targetElements.some((target) => target === element || target.contains(element) || element.contains(target)))
      .slice(0, 70)
      .forEach((element) => {
        element.classList.add("pagepilot-fluff-dim");
        runtime.dimmedElements.push(element);
      });

    runtime.jumpEffectTimer = window.setTimeout(clearJumpEffect, JUMP_EFFECT_DURATION_MS);
  }

  function getPdfSectionExcerpt(section) {
    const metaExcerpt = section && section.unitMeta && section.unitMeta.excerpt;
    const text = String(metaExcerpt || section && section.text || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
  }

  function showPdfJumpMarker(section, pageNumber, options = {}) {
    clearPdfJumpMarker();
    const wrapper = document.createElement("div");
    wrapper.className = "pagepilot-pdf-owned-focus";
    wrapper.setAttribute("role", "status");
    wrapper.setAttribute("aria-live", "polite");
    const title = runtime.engine.helpers.cleanText(section && section.title ? section.title : "");
    const excerpt = getPdfSectionExcerpt(section);
    const relativeY = getPdfSectionRelativeYRange(section).start;
    const markerTop = Math.round(72 + relativeY * Math.max(180, window.innerHeight - 220));
    wrapper.style.setProperty("--pagepilot-pdf-marker-top", `${markerTop}px`);
    wrapper.style.setProperty("--pagepilot-pdf-band-top", `${Math.max(72, Math.min(window.innerHeight - 94, markerTop))}px`);
    wrapper.innerHTML = `
      <div class="pagepilot-pdf-focus-band" aria-hidden="true"></div>
      <div class="pagepilot-pdf-jump-marker pagepilot-pdf-section-overlay">
        <span>Page ${pageNumber} - target section</span>
        <strong>${runtime.engine.helpers.escapeHtml(title || "PDF section")}</strong>
        ${excerpt ? `<em>${runtime.engine.helpers.escapeHtml(excerpt)}</em>` : ""}
      </div>
    `;
    document.body.appendChild(wrapper);
    runtime.pdfJumpMarker = wrapper;
    runtime.pdfOwnedFocusOverlay = wrapper;
    runtime.jumpEffectActive = true;
    runtime.jumpEffectLockedUntil = Date.now() + JUMP_EFFECT_SCROLL_LOCK_MS;
    if (!options.persist) {
      runtime.pdfJumpMarkerTimer = window.setTimeout(clearPdfJumpMarker, Math.min(8200, Math.max(5200, JUMP_EFFECT_DURATION_MS)));
    }
    emitDebug("pdf:focus-overlay:shown", {
      sectionId: section && section.id,
      pageNumber,
      relativeY,
      persisted: Boolean(options.persist),
      mode: options.mode || runtime.pdfJumpMode || "owned-overlay",
      exactIssue: "SkimRoute showed its own highlight/focus overlay because Chrome may not expose the PDF page DOM. This is the reliable fallback highlight surface."
    });
  }

  function clearPdfJumpMarker() {
    window.clearTimeout(runtime.pdfJumpMarkerTimer);
    runtime.pdfJumpMarkerTimer = null;
    if (runtime.pdfJumpMarker && runtime.pdfJumpMarker.parentNode) {
      runtime.pdfJumpMarker.parentNode.removeChild(runtime.pdfJumpMarker);
    }
    runtime.pdfJumpMarker = null;
    runtime.pdfOwnedFocusOverlay = null;
  }

  function storePendingPdfJumpMarker(section, pageNumber) {
    try {
      const title = runtime.engine && runtime.engine.helpers
        ? runtime.engine.helpers.cleanText(section && section.title ? section.title : "")
        : String(section && section.title || "").trim();
      sessionStorage.setItem(PDF_PENDING_JUMP_STORAGE_KEY, JSON.stringify({
        routeKey: getPdfDocumentRouteKey(),
        sectionId: section && section.id || "",
        pageNumber,
        chunkIndex: getPdfSectionChunkIndex(section),
        relativeY: getPdfSectionRelativeY(section),
        relativeYStart: getPdfSectionRelativeYRange(section).start,
        relativeYEnd: getPdfSectionRelativeYRange(section).end,
        title,
        excerpt: getPdfSectionExcerpt(section),
        expiresAt: Date.now() + 18000
      }));
    } catch (error) {
      // Session storage can be unavailable on some restricted surfaces.
    }
  }

  function clearPendingPdfJumpMarker() {
    try {
      sessionStorage.removeItem(PDF_PENDING_JUMP_STORAGE_KEY);
    } catch (error) {
      // Ignore cleanup failures.
    }
  }

  function restorePendingPdfJumpMarker() {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return;
    hydratePdfCache(getPdfDocumentRouteKey(), { source: "pending-jump" }).then((hydrated) => {
      if (!hydrated) return;
      const recovered = buildRecoveredPdfModelFromCache(getPdfDocumentRouteKey(), "pending-jump-cache", runtime.model);
      if (!recovered) return;
      runtime.model = recovered;
      rememberStablePdfModel(recovered, "pending-jump-cache");
      render();
    }).catch(() => {});
    window.setTimeout(() => {
      let pending = null;
      try {
        pending = JSON.parse(sessionStorage.getItem(PDF_PENDING_JUMP_STORAGE_KEY) || "null");
      } catch (error) {
        pending = null;
      }
      if (!pending) return;
      clearPendingPdfJumpMarker();
      const pageNumber = Number(pending.pageNumber);
      if (
        !Number.isFinite(pageNumber)
        || pageNumber < 1
        || pending.expiresAt < Date.now()
        || pending.routeKey !== getPdfDocumentRouteKey()
      ) {
        return;
      }

      const title = runtime.engine && runtime.engine.helpers
        ? runtime.engine.helpers.cleanText(pending.title || "")
        : String(pending.title || "").trim();
      const restoredSection = findPdfSectionFromTarget(pending);
      const pageElement = findPdfPageElement(pageNumber);
      const markerSection = restoredSection || {
        id: `pdf-page-${pageNumber}`,
        title,
        anchor: pageElement || document.body,
        blocks: pageElement ? [pageElement] : [],
        pageNumber,
        text: String(pending.excerpt || ""),
        unitMeta: {
          synthetic: true,
          pageNumber,
          chunkIndex: Number(pending.chunkIndex) || 0,
          relativeY: Number(pending.relativeY) || 0.14,
          excerpt: String(pending.excerpt || "")
        },
        top: pageElement && runtime.engine && runtime.engine.helpers ? runtime.engine.helpers.getPageTop(pageElement) : 0,
        score: 100,
        metrics: {}
      };
      setPdfActiveTarget(markerSection, pageNumber, "restored-hard-page");
      if (markerSection.id && runtime.model && runtime.model.sections.some((section) => section.id === markerSection.id)) {
        if (expandAncestors(markerSection.id)) {
          render();
        } else if (runtime.ui) {
          runtime.ui.updateActiveClasses(runtime.view.activeId);
        }
      }
      if (pageElement) {
        activateJumpEffect({ ...markerSection, anchor: pageElement, blocks: [pageElement], pageNumber });
      }
      showPdfJumpMarker(markerSection, pageNumber, { persist: true });
    }, 700);
  }

  function isSafeJumpEffectElement(element, section) {
    if (!element || !(element instanceof Element)) return false;
    if (element === document.body || element === document.documentElement) return false;
    if (element.id === ROOT_ID || element.closest && element.closest(`#${ROOT_ID}`)) return false;
    const isPdf = Boolean(runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf");
    if (!isPdf) return true;
    return isSafePdfJumpAnchor(element)
      && (!section || !section.pageNumber || getPdfPageNumberFromElement(element) === Number(section.pageNumber));
  }

  function clearJumpEffectFromUser() {
    if (runtime.jumpEffectActive && Date.now() > runtime.jumpEffectLockedUntil) {
      clearJumpEffect();
    }
  }

  function clearJumpEffect() {
    window.clearTimeout(runtime.jumpEffectTimer);
    runtime.jumpEffectTimer = null;
    runtime.jumpEffectActive = false;
    runtime.jumpEffectLockedUntil = 0;
    clearPdfJumpMarker();
    clearGoogleDocsHighlight();
    clearGoogleDocsActionNotice();
    runtime.highlightedElements.forEach((element) => element.classList.remove("pagepilot-answer-target"));
    runtime.dimmedElements.forEach((element) => element.classList.remove("pagepilot-fluff-dim"));
    runtime.highlightedElements = [];
    runtime.dimmedElements = [];
  }

  function handleShortcut(event) {
    const key = String(event.key || "").toLowerCase();
    if (isTypingTarget(event.target) && !(runtime.ui && runtime.ui.getRoot() && runtime.ui.getRoot().contains(event.target))) {
      return;
    }

    if (key === "escape" && runtime.view.mode === "open") {
      event.preventDefault();
      setMode(modeForClosedState(), { focusTab: true, persist: true });
      return;
    }

    const isMac = /mac|iphone|ipad|ipod/i.test(String(navigator.platform || navigator.userAgent || navigator.vendor || ""));
    const shortcutHeld = event.altKey || (isMac && event.metaKey && !event.ctrlKey && !event.shiftKey);
    if (!shortcutHeld || event.ctrlKey || event.shiftKey || !["j", "n"].includes(key)) {
      return;
    }

    event.preventDefault();
    if (isPdfActionContext()) {
      runPdfAction(key === "n" ? "next" : "jump", { focus: true, source: "shortcut" });
      return;
    }
    setMode("open", { focus: true, persist: true });
    if (key === "n") {
      jumpToNextImportant();
    } else {
      jumpToUsefulPart();
    }
  }

  function isTypingTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
  }

  function shouldShowPublicLoadingState(details = {}) {
    if (details.pdfTerminalState) return false;
    if (details.snapshotUsable) return false;
    if (details.recoveryPending) return true;
    if (details.pageState === "loading" && !details.pdfReady && !details.chatReady) return true;
    return Boolean(details.pdfRouteLocked && !details.pdfReady);
  }

  function getPublicStats() {
    const stableOcrStatus = getStablePdfOcrStatusSnapshot(getPdfDocumentRouteKey());
    if (stableOcrStatus) return stableOcrStatus;
    const snapshot = getAuthoritativeModelForStats();
    let model = snapshot && snapshot.model;
    if (!model) {
      return { ok: false, error: "SkimRoute is still checking this page locally." };
    }
    const pdfRouteLocked = isPdfRouteLocked();
    if (pdfRouteLocked || model.pageProfile && model.pageProfile.type === "pdf") {
      const readyPdfModel = getReadyPdfModelForStatus(getPdfDocumentRouteKey());
      if (readyPdfModel && readyPdfModel.model) {
        model = readyPdfModel.model;
        if (snapshot) {
          snapshot.model = model;
          snapshot.snapshotSource = readyPdfModel.source;
          snapshot.usableSnapshot = true;
        }
      } else {
        model = normalizeRecoveredPdfModelForPublicStatus(model, getPdfDocumentRouteKey(), runtime.pdfOcr && runtime.pdfOcr.lastRecoveredEntry || null, runtime.model, `public-stats:${snapshot.snapshotSource || "runtime"}`);
      }
      if (snapshot) snapshot.model = model;
    }
    model.pageProfile = model.pageProfile && typeof model.pageProfile === "object" ? model.pageProfile : {};
    model.sections = Array.isArray(model.sections) ? model.sections : [];
    model.importantSections = Array.isArray(model.importantSections) ? model.importantSections : [];
    const publicSections = model.sections;
    const publicImportantSections = model.importantSections;
    const publicWords = Number(model.totalReadableWords || model.totalWords || 0);
    const pdfLike = Boolean(model.pageProfile.type === "pdf" || pdfRouteLocked);
    const bestSection = publicSections.find((section) => section.id === model.bestSectionId) || null;
    if (hasSyntheticPdfSections()) {
      refreshActivePdfSection();
    }
    const pdfNextImportant = hasSyntheticPdfSections() ? getNextPdfImportantSection() : null;
    const nextImportant = pdfNextImportant || publicSections.find((section) => section.id === model.nextImportantId) || null;
    const stableOcrReady = Boolean(pdfLike && isOcrBackedPdfModel(model) && isUsablePdfStatsModel(model, true));
    const rawPdfPending = Boolean(runtime.pdfOcr && runtime.pdfOcr.pending);
    const rawPdfRetrying = Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying);
    const rawPdfState = runtime.pdfOcr && runtime.pdfOcr.state ? runtime.pdfOcr.state : "";
    const pdfPending = stableOcrReady ? false : rawPdfPending;
    const pdfRetrying = stableOcrReady ? false : rawPdfRetrying;
    const pdfState = stableOcrReady ? "ready" : rawPdfState;
    const pdfProgress = stableOcrReady ? 100 : runtime.pdfOcr && Number.isFinite(runtime.pdfOcr.progress) ? runtime.pdfOcr.progress : 0;
    const pdfErrorKind = stableOcrReady ? "" : runtime.pdfOcr && runtime.pdfOcr.errorKind ? runtime.pdfOcr.errorKind : "";
    const pdfOcrElapsedMs = runtime.pdfOcr && runtime.pdfOcr.analysisStartedAt ? Date.now() - runtime.pdfOcr.analysisStartedAt : 0;
    const pdfOcrActive = stableOcrReady ? false : Boolean(pdfLike && isPdfOcrActive());
    const pdfOcrWorkerActive = stableOcrReady ? false : Boolean(pdfOcrActive && isPdfOcrWorkerActiveForRun(getActivePdfOcrRunId()));
    const pdfOcrCanCancel = stableOcrReady ? false : Boolean(pdfOcrActive && shouldExposePdfOcrCancel());
    const pdfOcrCancelled = Boolean(pdfState === "ocr-cancelled" || pdfErrorKind === "ocr-cancelled");
    const pdfOcrTakingLong = Boolean(pdfOcrCanCancel && (pdfOcrElapsedMs > 7000 || runtime.pdfOcr && runtime.pdfOcr.slowDevice));
    const ocrUnreadable = stableOcrReady ? false : Boolean(!snapshot.usableSnapshot && (pdfState === "ocr-unreadable" || pdfErrorKind === "ocr-low-text" || pdfErrorKind === "ocr-unreadable"));
    const chatReady = isUsableChatModel(model);
    const pdfHasUsableShortOcrMap = Boolean(
      (model.pageProfile.type === "pdf" || pdfRouteLocked)
      && publicSections.some((section) => section && section.unitMeta && section.unitMeta.ocr && isCacheableShortOcrText(section.text || ""))
    );
    const pdfReady = Boolean(
      (model.pageProfile.type === "pdf" || pdfRouteLocked)
      && publicSections.length >= 1
      && (publicWords >= PDF_RECOVERY_MIN_WORDS || pdfHasUsableShortOcrMap)
      && (!pdfPending || snapshot.usableSnapshot || stableOcrReady || isUsablePdfStatsModel(model, true))
    );
    const pdfCacheUpdatedAt = Number(runtime.pdfOcr && runtime.pdfOcr.cacheUpdatedAt || model.diagnostics && model.diagnostics.recoveredPdfCacheUpdatedAt || 0);
    const modelCacheHit = Boolean(model.diagnostics && model.diagnostics.recoveredPdfCacheHit);
    const pdfCacheHit = Boolean(
      pdfReady
      && (
        runtime.pdfOcr && runtime.pdfOcr.cacheHit
        || modelCacheHit
      )
    );
    const pdfCacheSource = pdfCacheHit
      ? runtime.pdfOcr && runtime.pdfOcr.cacheSource || model.diagnostics && model.diagnostics.recoveredPdfCacheSource || "cache"
      : snapshot.snapshotSource === "stable-pdf"
        ? "stable"
        : "";
    const quietMode = pdfRouteLocked || pdfReady ? false : model.pageProfile.quietMode;
    const needsPdfOcr = Boolean(
      (model.pageProfile.type === "pdf" || pdfRouteLocked)
      && !pdfReady
      && (
        model.pageProfile.state === "ocr-prompt"
        || runtime.pdfOcr && runtime.pdfOcr.needsPrompt
        || pdfState === "needs-ocr"
      )
      && !pdfPending
      && !pdfRetrying
      && pdfErrorKind !== "fetch"
      && pdfState !== "ocr-failed"
      && pdfState !== "ocr-cancelled"
      && pdfErrorKind !== "ocr-timeout"
      && pdfErrorKind !== "ocr-cancelled"
    );
    const pdfTerminalState = Boolean(
      pdfRouteLocked
      && !pdfReady
      && !snapshot.usableSnapshot
      && (
        pdfErrorKind === "fetch"
        || pdfErrorKind === "extract-timeout"
        || pdfErrorKind === "ocr-timeout"
        || pdfErrorKind === "ocr-cancelled"
        || ocrUnreadable
        || needsPdfOcr
        || model.pageProfile.state === "pdf-error"
        || model.pageProfile.state === "ocr-prompt"
        || model.pageProfile.state === "ocr-cancelled"
      )
    );
    const pdfTerminalCopy = pdfTerminalState
      ? getPdfTerminalPublicCopy({
          errorKind: pdfErrorKind,
          state: pdfState || model.pageProfile.state || "",
          error: runtime.pdfOcr && runtime.pdfOcr.lastError || "",
          ocrUnreadable,
          allowOcr: /ocr/i.test(String(pdfState || pdfErrorKind || ""))
        })
      : null;
    const pdfOcrBlockedByAccess = isPdfAccessErrorKind(pdfErrorKind);
    const pdfOcrCanRunFast = Boolean(
      pdfLike
      && !pdfOcrActive
      && !pdfPending
      && !pdfRetrying
      && !pdfReady
      && !pdfOcrBlockedByAccess
      && (
        needsPdfOcr
        || /^(ocr-prompt|needs-ocr)$/i.test(String(pdfState || model.pageProfile.state || ""))
      )
    );
    const pdfOcrCanRunBetter = Boolean(
      pdfLike
      && !pdfOcrActive
      && !pdfPending
      && !pdfRetrying
      && !pdfOcrBlockedByAccess
      && runtime.pdfOcr
      && shouldExposePdfOcrBetter(getRouteCacheKey())
    );
    const recoveryPending = stableOcrReady ? false : Boolean(
      pdfPending
      || pdfRetrying
      || (!pdfTerminalState && pdfRouteLocked && !pdfReady && /^(ocr|extracting)$/i.test(String(pdfState || "")))
    );
    const loading = shouldShowPublicLoadingState({
      pdfTerminalState,
      snapshotUsable: Boolean(snapshot.usableSnapshot),
      recoveryPending,
      pageState: model.pageProfile.state || "",
      pdfReady,
      chatReady,
      pdfRouteLocked
    });
    const pdfJumpReady = model.pageProfile.type === "pdf" || pdfRouteLocked ? canJumpToSection(bestSection) : true;
    const publicBestReason = pdfTerminalCopy
      ? pdfTerminalCopy.bestReason
      : bestSection && (model.hasStrongTarget || stableOcrReady)
        ? reasonForPublicSection(bestSection)
        : model.pageProfile.reason;

    const shortPage = !pdfReady && (
      publicWords < window.PagePilotEngine.constants.MIN_USEFUL_WORDS
      || (publicSections.length < 2 && !model.hasStrongTarget)
    );
    const action = runtime.lastAction && Date.now() - Number(runtime.lastAction.at || 0) < 12000
      ? runtime.lastAction
      : null;
    const viewer = runtime.pdfControlledViewer || {};
    const pdfModeReady = Boolean(pdfLike && viewer.ready && viewer.routeKey === getPdfDocumentRouteKey());
    const pdfModeRendering = Boolean(pdfLike && viewer.rendering);
    const pdfModeTargetQueued = Boolean(pdfLike && viewer.pendingTarget);
    const pdfActionable = Boolean(pdfLike && pdfReady && bestSection && (model.hasStrongTarget || stableOcrReady) && canJumpToSection(bestSection));
    const pdfNextActionable = Boolean(pdfLike && pdfReady && nextImportant && canJumpToSection(nextImportant));
    const pdfDiagnosticSummary = pdfLike ? {
      routeKey: getPdfDocumentRouteKey(),
      cacheHit: pdfCacheHit,
      cacheSource: pdfCacheSource,
      cacheAgeMs: pdfCacheHit && pdfCacheUpdatedAt ? Math.max(0, Date.now() - pdfCacheUpdatedAt) : 0,
      actionPhase: runtime.pdfAction && runtime.pdfAction.phase || "",
      actionType: runtime.pdfAction && runtime.pdfAction.type || "",
      actionTargetPage: runtime.pdfAction && runtime.pdfAction.targetPage || 0,
      pdfModeReady,
      pdfModeRendering,
      pdfModeTargetQueued,
      pending: pdfPending,
      retrying: pdfRetrying,
      canJumpBest: Boolean(bestSection && canJumpToSection(bestSection)),
      canJumpNext: Boolean(nextImportant && canJumpToSection(nextImportant)),
      bestPage: getPdfSectionPageNumber(bestSection),
      nextPage: getPdfSectionPageNumber(nextImportant),
      note: "Use pdf:action:* logs for clicks, pdf:cache:persistent-* logs for saved maps, and pdf:ocr:* logs for local OCR responsiveness."
    } : null;

    const publicStats = {
      ok: true,
      open: runtime.view.mode === "open",
      mode: runtime.view.mode,
      hiddenOnPage: runtime.view.mode === "snoozed",
      snoozed: runtime.view.mode === "snoozed",
      sections: publicSections.length,
      important: publicImportantSections.length,
      words: publicWords,
      shortPage,
      quietMode: Boolean(quietMode),
      pageType: pdfRouteLocked ? "pdf" : model.pageProfile.type,
      pageLabel: pdfRouteLocked ? "PDF" : model.pageProfile.label,
      pageSubtype: model.pageProfile.searchSubtype || model.pageProfile.ocrQuality || runtime.pdfOcr && runtime.pdfOcr.qualityState || "",
      qualityMessage: model.pageProfile.qualityMessage || runtime.pdfOcr && runtime.pdfOcr.qualityMessage || "",
      chatReady,
      snapshotSource: snapshot.snapshotSource || "runtime",
      usableSnapshot: Boolean(snapshot.usableSnapshot),
      recoveryPending,
      pdfTerminal: pdfTerminalState,
      pdfLastDiagnostics: runtime.pdfOcr && Array.isArray(runtime.pdfOcr.lastDiagnostics) ? runtime.pdfOcr.lastDiagnostics.slice(0, 6) : [],
      readingConfidence: model.pageProfile.readingConfidence,
      reason: pdfTerminalCopy ? pdfTerminalCopy.bestReason : model.pageProfile.reason || model.pageProfile.diagnosticHint || "",
      confidence: Number(model.confidence) || (pdfLike && publicSections.length ? 88 : 0),
      confidenceTier: model.confidenceTier,
      confidenceLabel: pdfTerminalCopy ? pdfTerminalCopy.confidenceLabel : model.confidenceLabel || (pdfLike && publicSections.length ? "PDF mapped" : ""),
      hasStrongTarget: model.hasStrongTarget,
      loading,
      loadingReason: pdfTerminalCopy ? pdfTerminalCopy.bestReason : model.pageProfile.diagnosticHint || model.pageProfile.reason || "",
      pdfPending,
      pdfRetrying,
      pdfState,
      pdfProgress,
      pdfOcrMode: runtime.pdfOcr && runtime.pdfOcr.mode ? runtime.pdfOcr.mode : "",
      pdfOcrMessage: runtime.pdfOcr && runtime.pdfOcr.progressMessage ? runtime.pdfOcr.progressMessage : "",
      pdfOcrElapsedMs,
      pdfOcrActive,
      pdfOcrWorkerActive,
      pdfOcrSlowDevice: Boolean(runtime.pdfOcr && runtime.pdfOcr.slowDevice),
      pdfOcrCanCancel,
      pdfOcrCanRunFast,
      pdfOcrCanRunBetter,
      pdfOcrTakingLong,
      pdfOcrCancelled,
      pdfOcrRecommendedMode: runtime.pdfOcr && runtime.pdfOcr.recommendedMode ? runtime.pdfOcr.recommendedMode : "fast",
      needsPdfOcr,
      ocrUnreadable,
      pdfError: stableOcrReady ? "" : runtime.pdfOcr && runtime.pdfOcr.lastError ? runtime.pdfOcr.lastError : "",
      pdfErrorKind,
      pdfAccessAllowed: runtime.pdfAccessAllowed,
      pdfSource: runtime.pdfOcr && runtime.pdfOcr.source ? runtime.pdfOcr.source : "",
      pdfCacheHit,
      pdfCacheSource,
      pdfCacheAgeMs: pdfCacheHit && pdfCacheUpdatedAt ? Math.max(0, Date.now() - pdfCacheUpdatedAt) : 0,
      pdfReady,
      pdfJumpReady,
      pdfJumpMode: runtime.pdfJumpMode || "",
      pdfModeReady,
      pdfModeRendering,
      pdfModeTargetQueued,
      pdfDiagnosticSummary,
      lastActionOk: action ? Boolean(action.ok) : null,
      lastActionType: action ? action.type || "" : "",
      lastActionMessage: action ? action.message || "" : "",
      lastActionPhase: action ? action.phase || "" : "",
      lastActionTargetPage: action ? action.pageNumber || 0 : 0,
      lastActionAt: action ? action.at || 0 : 0,
      pdfJumpBlockedReason: action ? action.pdfJumpBlockedReason || "" : "",
      pdfActivePage: runtime.pdfActivePage || getCurrentPdfPageFromUrl() || 0,
      pdfActiveSectionId: runtime.view.activeId || "",
      pdfRecoveredWords: runtime.pdfOcr && runtime.pdfOcr.words ? runtime.pdfOcr.words : pdfReady ? publicWords : 0,
      pdfRecoveredPages: runtime.pdfOcr && runtime.pdfOcr.pages ? runtime.pdfOcr.pages : 0,
      pdfPartial: Boolean(runtime.pdfOcr && runtime.pdfOcr.partial),
      canJump: Boolean(bestSection && (model.hasStrongTarget || stableOcrReady) && !quietMode && (!loading || pdfActionable) && canJumpToSection(bestSection)),
      canJumpNext: Boolean(nextImportant && !quietMode && (!loading || pdfNextActionable) && canJumpToSection(nextImportant)),
      nextImportantTitle: nextImportant ? nextImportant.title : "",
      bestTitle: pdfTerminalCopy ? pdfTerminalCopy.bestTitle : bestSection && (model.hasStrongTarget || stableOcrReady) ? bestSection.title : "",
      bestReason: publicBestReason,
      whyReason: publicBestReason,
      quietReason: pdfTerminalCopy ? pdfTerminalCopy.bestReason : model.pageProfile.quietReason || model.pageProfile.reason || "",
      archetype: model.pageProfile.type,
      bestLabel: pdfTerminalCopy ? pdfTerminalCopy.bestLabel : loading ? "Scanning" : pdfRouteLocked && quietMode ? "PDF map" : model.bestLabel || (pdfLike && publicSections.length ? "PDF map ready" : ""),
      bestKind: model.bestKind || bestSection && bestSection.intelligence && bestSection.intelligence.role || "",
      bestKindLabel: model.bestKindLabel || bestSection && bestSection.intelligence && bestSection.intelligence.roleLabel || bestSection && bestSection.metrics && bestSection.metrics.sectionKindLabel || "",
      targetConfidenceReason: model.targetConfidenceReason || "",
      savedMinutes: model.savedMinutes
    };
    return pdfLike
      ? finalizePdfPublicStatus(publicStats, model, { emit: false, reason: `public-stats:${snapshot.snapshotSource || "runtime"}` })
      : publicStats;
  }

  function reasonForPublicSection(section) {
    const intelligenceReason = section
      && section.intelligence
      && Array.isArray(section.intelligence.whyReasons)
      && section.intelligence.whyReasons[0];
    if (intelligenceReason) return intelligenceReason;
    const kindReason = reasonForPublicSectionKind(section);
    if (kindReason) return kindReason;
    if (section.unitMeta && section.unitMeta.diagnosticReason) return section.unitMeta.diagnosticReason;
    if (section.metrics.matched.finalCode) return "Last substantial code block";
    if (section.metrics.matched.finalRecommendation) return "Final recommendation with enough detail";
    if (section.unitMeta && section.unitMeta.isAfterUserCorrection) return "Answers the latest user correction";
    if (section.unitMeta && section.unitMeta.hasRevision) return "Looks like the latest corrected answer";
    if (section.unitMeta && section.unitMeta.answersLatestUser) return "Answers the latest user request";
    if (section.metrics.matched.completeCode) return "Looks like complete, usable code";
    if (section.metrics.matched.conciseAnswer) return "Opens with a concise answer";
    if (section.metrics.matched.summary) return "Summarizes the useful parts";
    if (section.metrics.matched.stepByStepAnswer) return "Breaks the answer into clear steps";
    if (section.metrics.matched.keyExplanation) return "Explains the key reasoning";
    if (section.metrics.matched.procedure) return "Contains step-by-step guidance";
    if (section.metrics.matched.directAction) return "Gives direct next actions";
    if (section.metrics.matched.codeExplanation || section.metrics.codeBlocks > 0) return "Includes a practical example";
    if (section.metrics.matched.answer) return "Has a direct answer signal";
    if (section.metrics.matched.recommendation) return "Uses recommendation language";
    return "Looks like the most useful section";
  }

  function reasonForPublicSectionKind(section) {
    if (!section || !section.metrics) return "";
    const kind = section.metrics.sectionKind || "";
    const pdfType = section.metrics.pdfSectionType || section.unitMeta && section.unitMeta.pdfSectionType || "";
    if (kind === "main_argument") return "States the main argument";
    if (kind === "key_evidence") return "Supports the main point with evidence";
    if (kind === "results" || pdfType === "results") return "Shows results or findings";
    if (kind === "conclusion" || pdfType === "conclusion") return "Wraps up the useful takeaway";
    if (kind === "definition") return "Defines a key term";
    if (kind === "code_block" || kind === "complete_code") return "Includes usable code";
    if (kind === "latest_answer") return "Newest complete assistant response";
    if (kind === "corrected_answer") return "Updated answer after a correction";
    if (kind === "root_cause") return "Explains the root cause";
    if (kind === "warning") return "Flags a caveat or risk";
    if (kind === "final_recommendation") return "Gives the final recommendation";
    if (kind === "step_by_step") return "Breaks the answer into clear steps";
    if (kind === "key_explanation") return "Explains the key reasoning";
    if (kind === "search_ai_overview") return "AI Overview is the highest-value search block";
    if (kind === "search_answer") return "Search answer block gives a direct answer";
    if (kind === "search_sources") return "Sources support the search answer";
    if (kind === "search_people_also_ask") return "Related questions help refine the search";
    if (kind === "search_top_results") return "Top organic results are the best next area";
    if (kind === "search_videos") return "Video results may be useful for this query";
    if (kind === "search_shopping") return "Shopping results are a specialized result area";
    if (kind === "search_maps") return "Map results are a specialized result area";
    if (kind === "form") return "Form or notice with dates, names, or identifiers";
    if (kind === "table") return "Table-like section with structured details";
    if (pdfType === "abstract") return "Summarizes the PDF upfront";
    if (kind === "methods" || pdfType === "methods") return "Explains the method or procedure";
    if (pdfType === "discussion") return "Interprets the results";
    return "";
  }

  function canJumpToSection(section) {
    if (!section) return false;
    if (!(runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf")) {
      return Boolean(section.anchor);
    }
    if (isOcrPdfSection(section) && getPdfSectionPageNumber(section)) return true;
    if (!section.anchor) return false;
    return Boolean(isSafePdfJumpAnchor(resolvePdfScrollAnchor(section)) || getPdfSectionPageNumber(section));
  }

  function uniqueElements(elements) {
    return elements.filter((element, index, list) => element && element.classList && list.indexOf(element) === index);
  }

  function hasChromeLocalStorage() {
    return Boolean(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        if (!hasChromeLocalStorage()) {
          resolve(null);
          return;
        }
        chrome.storage.local.get(key, (result) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(result ? result[key] : null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      try {
        if (!hasChromeLocalStorage()) {
          resolve(false);
          return;
        }
        chrome.storage.local.set({ [key]: value }, () => resolve(!chrome.runtime.lastError));
      } catch (error) {
        resolve(false);
      }
    });
  }

  function storageRemove(key) {
    return new Promise((resolve) => {
      try {
        if (!hasChromeLocalStorage()) {
          resolve(false);
          return;
        }
        chrome.storage.local.remove(key, () => resolve(!chrome.runtime.lastError));
      } catch (error) {
        resolve(false);
      }
    });
  }

  function normalizePdfModeConsentStore(value) {
    const source = value && typeof value === "object" ? value : {};
    const normalized = {};
    Object.keys(source).forEach((routeKey) => {
      const entry = source[routeKey];
      if (entry === true) {
        normalized[routeKey] = { allowed: true, updatedAt: 0 };
        return;
      }
      if (entry && typeof entry === "object" && entry.allowed === true) {
        normalized[routeKey] = {
          allowed: true,
          updatedAt: Number(entry.updatedAt) || 0,
          sourceUrl: String(entry.sourceUrl || "")
        };
      }
    });
    return normalized;
  }

  async function getPdfModeConsentStore() {
    if (runtime.pdfModeConsentCache) {
      return runtime.pdfModeConsentCache;
    }
    runtime.pdfModeConsentCache = normalizePdfModeConsentStore(await storageGet(PDF_CONTROLLED_VIEWER_CONSENT_STORAGE_KEY));
    return runtime.pdfModeConsentCache;
  }

  async function hasPagePilotPdfModeConsent(routeKey) {
    if (!routeKey) return false;
    const store = await getPdfModeConsentStore();
    return Boolean(store[routeKey] && store[routeKey].allowed === true);
  }

  async function rememberPagePilotPdfModeConsent(routeKey) {
    if (!routeKey) return false;
    const store = { ...(await getPdfModeConsentStore()) };
    store[routeKey] = {
      allowed: true,
      updatedAt: Date.now(),
      sourceUrl: getPdfSourceUrl()
    };
    Object.keys(store)
      .sort((a, b) => Number(store[b] && store[b].updatedAt || 0) - Number(store[a] && store[a].updatedAt || 0))
      .slice(24)
      .forEach((key) => {
        delete store[key];
      });
    runtime.pdfModeConsentCache = store;
    return storageSet(PDF_CONTROLLED_VIEWER_CONSENT_STORAGE_KEY, store);
  }

  function requestPagePilotPdfModeConsent(section, pageNumber, routeKey, options = {}) {
    const actionToken = options.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
    const actionType = options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump";
    if (
      runtime.pdfModeConsentDialog
      && actionToken
      && runtime.pdfModeConsentDialog.actionToken === actionToken
      && runtime.pdfModeConsentDialog.promise
    ) {
      return runtime.pdfModeConsentDialog.promise;
    }
    const dialogState = {
      element: null,
      resolve: null,
      actionToken,
      promise: null
    };
    const promise = new Promise((resolve) => {
      closePagePilotPdfModeConsentDialog(false);
      injectPagePilotControlledPdfStyles();
      const title = runtime.engine && runtime.engine.helpers
        ? runtime.engine.helpers.cleanText(section && section.title ? section.title : "")
        : String(section && section.title || "").trim();
      const escapedTitle = runtime.engine && runtime.engine.helpers
        ? runtime.engine.helpers.escapeHtml(title || `Page ${pageNumber}`)
        : String(title || `Page ${pageNumber}`);
      const dialog = document.createElement("div");
      dialog.className = "pagepilot-pdf-mode-consent";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "pagepilot-pdf-mode-consent-title");
      dialog.innerHTML = `
        <div class="pagepilot-pdf-mode-consent-panel">
          <div class="pagepilot-pdf-mode-consent-copy">
            <strong id="pagepilot-pdf-mode-consent-title">Open SkimRoute PDF Mode?</strong>
            <p>${PDF_MODE_OPENING_COPY}</p>
            <span>Target: Page ${Number(pageNumber) || ""}${escapedTitle ? `, ${escapedTitle}` : ""}</span>
          </div>
          <div class="pagepilot-pdf-mode-consent-actions">
            <button type="button" data-pp-pdf-mode-accept>Open for this PDF</button>
            <button type="button" data-pp-pdf-mode-decline>Not now</button>
          </div>
        </div>
      `;

      const finish = (allowed) => {
        closePagePilotPdfModeConsentDialog(Boolean(allowed));
      };
      const accept = dialog.querySelector("[data-pp-pdf-mode-accept]");
      const decline = dialog.querySelector("[data-pp-pdf-mode-decline]");
      if (accept) {
        accept.addEventListener("click", () => {
          rememberPagePilotPdfModeConsent(routeKey)
            .then(() => {
              emitDebug("pdf:controlled-viewer:consent-accepted", {
                routeKey,
                actionId: actionToken,
                token: actionToken,
                type: actionType,
                sectionId: section && section.id,
                targetSectionId: section && section.id,
                pageNumber,
                elapsedMs: getPdfActionDuration(runtime.pdfAction),
                exactIssue: "PDF Mode consent was stored after the user clicked Open for this PDF."
              });
              finish(true);
            })
            .catch((error) => {
              emitDebug("pdf:controlled-viewer:consent-error", {
                routeKey,
                actionId: actionToken,
                token: actionToken,
                type: actionType,
                sectionId: section && section.id,
                pageNumber,
                error: String(error && error.message ? error.message : error),
                exactIssue: "The user accepted PDF Mode, but SkimRoute could not store consent."
              });
              finish(false);
            });
        });
      }
      if (decline) {
        decline.addEventListener("click", () => {
          emitDebug("pdf:controlled-viewer:consent-declined", {
            routeKey,
            actionId: actionToken,
            token: actionToken,
            type: actionType,
            sectionId: section && section.id,
            targetSectionId: section && section.id,
            pageNumber,
            elapsedMs: getPdfActionDuration(runtime.pdfAction),
            exactIssue: "The user declined PDF Mode for this action."
          });
          finish(false);
        });
      }
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          emitDebug("pdf:controlled-viewer:consent-declined", {
            routeKey,
            actionId: actionToken,
            token: actionToken,
            type: actionType,
            sectionId: section && section.id,
            targetSectionId: section && section.id,
            pageNumber,
            elapsedMs: getPdfActionDuration(runtime.pdfAction),
            exactIssue: "The user dismissed PDF Mode consent with Escape."
          });
          finish(false);
        }
      });
      document.documentElement.appendChild(dialog);
      dialogState.element = dialog;
      dialogState.resolve = resolve;
      runtime.pdfModeConsentDialog = dialogState;
      runtime.pdfJumpMode = "awaiting-pdf-mode-consent";
      emitDebug("pdf:controlled-viewer:consent-shown", {
        routeKey,
        actionId: actionToken,
        token: actionToken,
        type: actionType,
        sectionId: section && section.id,
        targetSectionId: section && section.id,
        pageNumber,
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        exactIssue: "none"
      });
      window.setTimeout(() => {
        if (accept && accept.focus) accept.focus({ preventScroll: true });
      }, 0);
    });
    dialogState.promise = promise;
    return promise;
  }

  function closePagePilotPdfModeConsentDialog(result) {
    const dialog = runtime.pdfModeConsentDialog;
    if (!dialog) return;
    runtime.pdfModeConsentDialog = null;
    if (dialog.element && dialog.element.parentNode) {
      dialog.element.parentNode.removeChild(dialog.element);
    }
    if (typeof dialog.resolve === "function") {
      dialog.resolve(Boolean(result));
    }
  }

  function showPagePilotPdfModeNotice(message) {
    clearPagePilotPdfModeNotice();
    injectPagePilotControlledPdfStyles();
    const notice = document.createElement("div");
    notice.className = "pagepilot-pdf-mode-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.textContent = message;
    document.documentElement.appendChild(notice);
    runtime.pdfModeNotice = notice;
    window.setTimeout(clearPagePilotPdfModeNotice, 5200);
  }

  function clearPagePilotPdfModeNotice() {
    if (runtime.pdfModeNotice && runtime.pdfModeNotice.parentNode) {
      runtime.pdfModeNotice.parentNode.removeChild(runtime.pdfModeNotice);
    }
    runtime.pdfModeNotice = null;
  }


  /* SkimRoute-owned PDF viewer mode.
     Chrome's built-in PDF viewer often hides its real scroll/page DOM from extensions.
     This viewer renders the PDF with PDF.js inside SkimRoute's own DOM so section jumps
     can use a real smooth-scroll container and a real page-attached highlight layer. */
  function isPagePilotControlledPdfViewerReadyForRoute(routeKey) {
    const viewer = runtime.pdfControlledViewer;
    return Boolean(
      routeKey
      && viewer
      && viewer.root
      && viewer.root.isConnected
      && viewer.ready
      && viewer.routeKey === routeKey
      && viewer.doc
      && viewer.pages
    );
  }

  function requestPagePilotControlledPdfJump(section, pageNumber, options = {}, fallbackContext = {}) {
    const routeKey = getPdfDocumentRouteKey();
    if (!section || !pageNumber || !routeKey || !isPdfRouteLocked()) {
      return false;
    }
    const ocrTarget = isOcrPdfSection(section);
    const actionToken = options.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
    if (actionToken && !isPdfActionActive(actionToken)) {
      emitDebug("pdf:action:cancelled", {
        actionId: actionToken,
        token: actionToken,
        type: options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump",
        routeKey,
        sectionId: section && section.id,
        targetSectionId: section && section.id,
        pageNumber,
        cancelledReason: "stale-before-pdf-mode",
        exactIssue: "PDF Mode was not opened because this action is no longer active."
      });
      return false;
    }

    const request = {
      token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sectionId: section.id,
      pageNumber,
      routeKey,
      actionType: options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump",
      actionToken
    };
    runtime.pendingPdfControlledJump = request;
    if (ocrTarget) {
      emitDebug("pdf:action:ocr-target", {
        type: request.actionType,
        routeKey,
        actionId: request.actionToken,
        token: request.actionToken,
        sectionId: section && section.id,
        pageNumber,
        relativeYStart: getPdfSectionRelativeYRange(section).start,
        relativeYEnd: getPdfSectionRelativeYRange(section).end,
        exactIssue: "Opening SkimRoute PDF Mode because OCR-backed scanned PDF targets use approximate page/section highlights."
      });
    }

    const continueWithConsent = (consentSource, notice = true) => {
      if (runtime.pendingPdfControlledJump !== request) return;
      if (request.actionToken && !isPdfActionActive(request.actionToken)) return;
      finishPdfActionConsentWait(request.actionToken);
      startPdfActionProcessingTimer(request.actionToken);
      runtime.pdfJumpMode = "pagepilot-pdf-viewer-opening";
      if (notice) {
        showPagePilotPdfModeNotice("Opening PDF Mode...");
      }
      emitDebug("pdf:action:pdf-mode-open", {
        type: request.actionType,
        routeKey,
        actionId: request.actionToken,
        token: request.actionToken,
        sectionId: section && section.id,
        pageNumber,
        consentSource,
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        exactIssue: "none"
      });
      emitDebug("pdf:controlled-viewer:auto-open", {
        routeKey,
        actionId: request.actionToken,
        token: request.actionToken,
        sectionId: section && section.id,
        targetSectionId: section && section.id,
        pageNumber,
        reason: ocrTarget ? "ocr-target" : "explicit-user-jump",
        consentSource,
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        exactIssue: "Chrome's native PDF viewer is not assumed reliable for extension scrolling; SkimRoute is opening its owned PDF Mode for this user click after consent."
      });
      emitDebug("pdf:mode:auto-open", {
        routeKey,
        actionId: request.actionToken,
        token: request.actionToken,
        sectionId: section && section.id,
        targetSectionId: section && section.id,
        pageNumber,
        reason: ocrTarget ? "ocr-target" : "explicit-user-jump",
        consentSource,
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        exactIssue: "none"
      });
      continuePagePilotControlledPdfJump(section, pageNumber, options, fallbackContext, consentSource);
    };

    const declineConsent = (blockedReason = "pdf-mode-consent-declined") => {
      if (runtime.pendingPdfControlledJump === request) {
        runtime.pendingPdfControlledJump = null;
      }
      finishPdfActionConsentWait(request.actionToken);
      runtime.pdfJumpMode = "";
      showPagePilotPdfModeNotice("PDF Mode was not opened.");
      completePdfAction(request.actionToken, "blocked", {
        type: request.actionType,
        routeKey,
        sectionId: section && section.id,
        pageNumber,
        blockedReason,
        exactIssue: "The user declined PDF Mode consent; SkimRoute did not navigate or open PDF Mode."
      });
      setActionResult(request.actionType, false, {
        section,
        pageNumber,
        actionToken: request.actionToken,
        phase: "blocked",
        pdfJumpMode: "pdf-mode-consent-declined",
        blockedReason,
        message: "PDF Mode was not opened."
      });
    };

    const askForConsent = () => {
      if (runtime.pendingPdfControlledJump !== request) return;
      if (request.actionToken && !isPdfActionActive(request.actionToken)) return;
      const timing = getPdfActionTiming(request.actionToken);
      if (timing && !timing.consentStartedAt) {
        timing.consentStartedAt = Date.now();
      }
      requestPagePilotPdfModeConsent(section, pageNumber, routeKey, {
        actionToken: request.actionToken,
        actionType: request.actionType
      }).then((approved) => {
        if (runtime.pendingPdfControlledJump !== request) return;
        if (request.actionToken && !isPdfActionActive(request.actionToken)) return;
        if (approved) {
          continueWithConsent("user-consent", true);
        } else {
          declineConsent("pdf-mode-consent-declined");
        }
      }).catch((error) => {
        if (runtime.pendingPdfControlledJump !== request) return;
        if (request.actionToken && !isPdfActionActive(request.actionToken)) return;
        emitDebug("pdf:controlled-viewer:consent-error", {
          routeKey,
          actionId: request.actionToken,
          token: request.actionToken,
          sectionId: section && section.id,
          targetSectionId: section && section.id,
          pageNumber,
          error: String(error && error.message ? error.message : error),
          elapsedMs: getPdfActionDuration(runtime.pdfAction),
          exactIssue: "SkimRoute could not complete the PDF Mode consent prompt."
        });
        declineConsent("pdf-mode-consent-error");
      });
    };

    if (isPagePilotControlledPdfViewerReadyForRoute(routeKey)) {
      emitDebug("pdf:controlled-viewer:document-reused", {
        routeKey,
        actionId: request.actionToken,
        token: request.actionToken,
        sectionId: section && section.id,
        targetSectionId: section && section.id,
        pageNumber,
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        pagesRendered: runtime.pdfControlledViewer && runtime.pdfControlledViewer.pages ? runtime.pdfControlledViewer.pages.size : 0,
        exactIssue: "PDF Mode is already ready for this PDF, so SkimRoute can scroll without another consent prompt or document load."
      });
      continueWithConsent("viewer-already-open", false);
      return true;
    }

    hasPagePilotPdfModeConsent(routeKey)
      .then((allowed) => {
        if (runtime.pendingPdfControlledJump !== request) return;
        if (request.actionToken && !isPdfActionActive(request.actionToken)) return;
        if (allowed) {
          emitDebug("pdf:controlled-viewer:consent-accepted", {
            routeKey,
            actionId: request.actionToken,
            token: request.actionToken,
            type: request.actionType,
            sectionId: section && section.id,
            targetSectionId: section && section.id,
            pageNumber,
            stored: true,
            elapsedMs: getPdfActionDuration(runtime.pdfAction),
            exactIssue: "PDF Mode consent was already stored for this PDF."
          });
          continueWithConsent("stored-consent", true);
          return;
        }
        askForConsent();
      })
      .catch((error) => {
        if (runtime.pendingPdfControlledJump !== request) return;
        if (request.actionToken && !isPdfActionActive(request.actionToken)) return;
        emitDebug("pdf:controlled-viewer:consent-error", {
          routeKey,
          actionId: request.actionToken,
          token: request.actionToken,
          sectionId: section && section.id,
          targetSectionId: section && section.id,
          pageNumber,
          error: String(error && error.message ? error.message : error),
          elapsedMs: getPdfActionDuration(runtime.pdfAction),
          exactIssue: "SkimRoute could not read stored PDF Mode consent, so it will ask instead of opening PDF Mode automatically."
        });
        askForConsent();
      });

    return true;
  }

  function continuePagePilotControlledPdfJump(section, pageNumber, options, fallbackContext, consentSource) {
    runtime.pendingPdfControlledJump = null;
    const actionToken = options && options.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
    if (actionToken && !isPdfActionActive(actionToken)) {
      return false;
    }
    if (startPagePilotControlledPdfJump(section, pageNumber, { ...(options || {}), consentSource })) {
      return true;
    }
    return performNativePdfJumpFallback(section, pageNumber, options || {}, fallbackContext || {});
  }

  function reopenPagePilotControlledPdfViewer(viewer) {
    if (!viewer || !viewer.root) return false;
    viewer.root.classList.add("pagepilot-pdf-controlled-visible");
    viewer.root.setAttribute("aria-hidden", "false");
    viewer.visible = true;
    viewer.closedByUser = false;
    return true;
  }

  function startPagePilotControlledPdfJump(section, pageNumber, options = {}) {
    const routeKey = getPdfDocumentRouteKey();
    if (!section || !pageNumber || !routeKey || !isPdfRouteLocked()) {
      return false;
    }
    const actionToken = options.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
    if (actionToken && !isPdfActionActive(actionToken)) {
      return false;
    }

    setPdfActiveTarget(section, pageNumber, "pagepilot-pdf-viewer-starting");
    if (expandAncestors(section.id)) {
      render();
    } else if (runtime.ui) {
      runtime.ui.updateActiveClasses(runtime.view.activeId);
    }

    const viewer = ensurePagePilotControlledPdfViewer();
    if (!viewer || !viewer.root || !viewer.scroll) {
      emitDebug("pdf:controlled-viewer:blocked", {
        sectionId: section && section.id,
        pageNumber,
        routeKey,
        exactIssue: "SkimRoute could not create its owned PDF viewer DOM. This should be rare; check for CSP/DOM insertion errors."
      });
      return false;
    }

    reopenPagePilotControlledPdfViewer(viewer);
    const jumpToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    viewer.pendingTarget = {
      token: jumpToken,
      sectionId: section.id,
      pageNumber,
      chunkIndex: getPdfSectionChunkIndex(section),
      relativeY: getPdfSectionRelativeYRange(section).start,
      highlight: true,
      requestedAt: Date.now(),
      actionType: options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump",
      actionToken
    };
    updatePagePilotControlledPdfStatus(isOcrPdfSection(section) ? `OCR highlight is approximate. Target page ${pageNumber}.` : `${PDF_MODE_OPENING_COPY} Target page ${pageNumber}.`);
    showPagePilotControlledPdfLoading(pageNumber);
    emitDebug("pdf:action:target-queued", {
      type: viewer.pendingTarget.actionType,
      routeKey,
      token: viewer.pendingTarget.actionToken,
      sectionId: section && section.id,
      pageNumber,
      renderReady: Boolean(viewer.ready && viewer.routeKey === routeKey),
      exactIssue: "none"
    });

    const renderPromise = ensurePagePilotControlledPdfRendered(routeKey, pageNumber);
    renderPromise
      .then(() => {
        if (actionToken && !isPdfActionActive(actionToken)) return;
        const latest = viewer.pendingTarget && viewer.pendingTarget.token === jumpToken
          ? viewer.pendingTarget
          : viewer.pendingTarget || { sectionId: section.id, pageNumber, chunkIndex: getPdfSectionChunkIndex(section) };
        const latestSection = findPdfSectionFromTarget(latest) || section;
        const latestPage = Number(latest && latest.pageNumber) || pageNumber;
        scrollPagePilotControlledPdfToSection(latestSection, latestPage, {
          highlight: true,
          reason: latestSection.id === section.id ? "jump-command" : "latest-command-after-render",
          actionToken
        });
      })
      .catch((error) => {
        const message = String(error && error.message ? error.message : error);
        runtime.pdfControlledViewer.lastError = message;
        if (actionToken && !isPdfActionActive(actionToken)) return;
        updatePagePilotControlledPdfStatus("SkimRoute PDF Mode could not render this PDF.");
        emitDebug("pdf:controlled-viewer:error", {
          sectionId: section && section.id,
          pageNumber,
          routeKey,
          error: message,
          exactIssue: "SkimRoute could not render the PDF in its owned viewer. It did not start hard page navigation from this slow/failing render path."
        });
        completePdfAction(actionToken, "blocked", {
          type: options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump",
          routeKey,
          sectionId: section && section.id,
          pageNumber,
          blockedReason: "controlled-viewer-render-failed",
          exactIssue: "PDF Mode rendering failed; SkimRoute left the browser on the current PDF instead of hard-navigating."
        });
      });

    emitDebug("pdf:controlled-viewer:start", {
      sectionId: section && section.id,
      pageNumber,
      routeKey,
      actionId: actionToken,
      token: actionToken,
      sourceUrl: getPdfSourceUrl(),
      existingReady: Boolean(runtime.pdfControlledViewer.ready && runtime.pdfControlledViewer.routeKey === routeKey),
      goal: "render-pdf-in-pagepilot-owned-dom-then-smooth-scroll-and-highlight",
      exactIssue: "none"
    });
    return true;
  }

  function ensurePagePilotControlledPdfViewer() {
    if (runtime.pdfControlledViewer && runtime.pdfControlledViewer.root && runtime.pdfControlledViewer.root.isConnected) {
      return runtime.pdfControlledViewer;
    }

    injectPagePilotControlledPdfStyles();
    const root = document.createElement("div");
    root.id = "pagepilot-pdf-controlled-viewer";
    root.className = "pagepilot-pdf-controlled-viewer";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="pagepilot-pdf-controlled-toolbar">
        <div class="pagepilot-pdf-controlled-title">
          <strong>SkimRoute PDF Mode</strong>
          <span data-pp-pdf-status>Preparing PDF…</span>
        </div>
        <div class="pagepilot-pdf-controlled-actions">
          <button type="button" data-pp-pdf-open-native title="Use Chrome's native PDF view">Native PDF</button>
          <button type="button" data-pp-pdf-close title="Hide SkimRoute PDF mode">Close</button>
        </div>
      </div>
      <div class="pagepilot-pdf-controlled-scroll" data-pp-pdf-scroll tabindex="0" role="document" aria-label="SkimRoute rendered PDF pages"></div>
    `;
    document.documentElement.appendChild(root);

    const scroll = root.querySelector("[data-pp-pdf-scroll]");
    const close = root.querySelector("[data-pp-pdf-close]");
    const native = root.querySelector("[data-pp-pdf-open-native]");
    if (close) {
      close.addEventListener("click", () => {
        root.classList.remove("pagepilot-pdf-controlled-visible");
        root.setAttribute("aria-hidden", "true");
        if (runtime.pdfControlledViewer) {
          runtime.pdfControlledViewer.visible = false;
          runtime.pdfControlledViewer.closedByUser = true;
        }
        emitDebug("pdf:controlled-viewer:closed", {
          routeKey: runtime.pdfControlledViewer.routeKey || getPdfDocumentRouteKey(),
          lastTarget: runtime.lastPdfJumpTarget || null,
          exactIssue: "none; the next PDF jump command will reopen SkimRoute PDF Mode and focus the requested section"
        });
      });
    }
    if (native) {
      native.addEventListener("click", () => {
        root.classList.remove("pagepilot-pdf-controlled-visible");
        root.setAttribute("aria-hidden", "true");
        if (runtime.pdfControlledViewer) {
          runtime.pdfControlledViewer.visible = false;
          runtime.pdfControlledViewer.closedByUser = true;
        }
        const target = runtime.lastPdfJumpTarget;
        if (target && target.pageNumber) {
          navigatePdfPageHard(findPdfSectionFromTarget(target) || null, target.pageNumber);
        }
      });
    }

    runtime.pdfControlledViewer = {
      root,
      scroll,
      pages: new Map(),
      highlights: [],
      rendering: false,
      ready: false,
      routeKey: "",
      sourceUrl: "",
      doc: null,
      renderPromise: null,
      backgroundRenderToken: "",
      lastError: "",
      visible: false,
      closedByUser: false,
      pendingTarget: null,
      activeHighlightSectionId: "",
      activeLoadingTask: null,
      activeRenderTask: null
    };
    emitDebug("pdf:controlled-viewer:created", {
      routeKey: getPdfDocumentRouteKey(),
      exactIssue: "none"
    });
    return runtime.pdfControlledViewer;
  }

  function injectPagePilotControlledPdfStyles() {
    if (document.getElementById("pagepilot-pdf-controlled-styles")) return;
    const style = document.createElement("style");
    style.id = "pagepilot-pdf-controlled-styles";
    style.textContent = `
      #pagepilot-pdf-controlled-viewer,
      #pagepilot-pdf-controlled-viewer * { box-sizing: border-box; }
      #pagepilot-pdf-controlled-viewer {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: none;
        background: #111827;
        color: #111827;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #pagepilot-pdf-controlled-viewer.pagepilot-pdf-controlled-visible { display: block; }
      .pagepilot-pdf-controlled-toolbar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 18px;
        background: rgba(255,255,255,0.96);
        border-bottom: 1px solid rgba(17,24,39,0.16);
        box-shadow: 0 4px 20px rgba(0,0,0,0.18);
      }
      .pagepilot-pdf-controlled-title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
      .pagepilot-pdf-controlled-title strong { font-size: 14px; white-space: nowrap; }
      .pagepilot-pdf-controlled-title span { color: #4b5563; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pagepilot-pdf-controlled-actions { display: flex; align-items: center; gap: 8px; }
      .pagepilot-pdf-controlled-actions button {
        appearance: none;
        border: 1px solid rgba(17,24,39,0.16);
        background: white;
        color: #111827;
        border-radius: 999px;
        padding: 7px 11px;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
      }
      .pagepilot-pdf-controlled-actions button:hover { background: #f3f4f6; }
      .pagepilot-pdf-controlled-scroll {
        position: absolute;
        top: 56px;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: auto;
        padding: 28px min(6vw, 72px) 88px;
        scroll-behavior: smooth;
        background: #374151;
      }
      .pagepilot-controlled-pdf-page {
        position: relative;
        width: fit-content;
        max-width: 100%;
        margin: 0 auto 28px;
        background: white;
        border-radius: 6px;
        box-shadow: 0 16px 42px rgba(0,0,0,0.35);
        overflow: hidden;
        min-height: 360px;
      }
      .pagepilot-controlled-pdf-page canvas { display: block; max-width: 100%; height: auto; }
      .pagepilot-controlled-pdf-page-label {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 2;
        background: rgba(17,24,39,0.76);
        color: white;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        pointer-events: none;
      }
      .pagepilot-controlled-pdf-loading {
        width: min(720px, 90vw);
        margin: 80px auto;
        padding: 22px;
        border-radius: 18px;
        background: white;
        color: #111827;
        box-shadow: 0 16px 42px rgba(0,0,0,0.28);
      }
      .pagepilot-controlled-pdf-highlight {
        position: absolute;
        left: 7%;
        right: 7%;
        min-height: 86px;
        border: 3px solid rgba(59,130,246,0.98);
        background: rgba(59,130,246,0.18);
        box-shadow: 0 0 0 9999px rgba(17,24,39,0.06), 0 0 34px rgba(59,130,246,0.55);
        border-radius: 14px;
        z-index: 3;
        pointer-events: none;
      }
      .pagepilot-controlled-pdf-highlight-label {
        position: absolute;
        left: 10px;
        top: -34px;
        max-width: min(680px, 76vw);
        background: #2563eb;
        color: white;
        padding: 7px 10px;
        border-radius: 999px;
        font-weight: 800;
        font-size: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.24);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pagepilot-controlled-pdf-page.pagepilot-controlled-pdf-active-page {
        outline: 4px solid rgba(59,130,246,0.82);
        outline-offset: 6px;
      }
      .pagepilot-pdf-mode-consent,
      .pagepilot-pdf-mode-consent *,
      .pagepilot-pdf-mode-notice,
      .pagepilot-pdf-mode-notice * { box-sizing: border-box; }
      .pagepilot-pdf-mode-consent {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(17,24,39,0.46);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .pagepilot-pdf-mode-consent-panel {
        width: min(440px, 100%);
        border: 1px solid rgba(17,24,39,0.14);
        border-radius: 8px;
        background: #ffffff;
        color: #111827;
        box-shadow: 0 22px 70px rgba(0,0,0,0.28);
        padding: 18px;
      }
      .pagepilot-pdf-mode-consent-copy {
        display: grid;
        gap: 8px;
      }
      .pagepilot-pdf-mode-consent-copy strong {
        font-size: 18px;
        line-height: 1.25;
      }
      .pagepilot-pdf-mode-consent-copy p {
        margin: 0;
        color: #374151;
        font-size: 14px;
        line-height: 1.45;
      }
      .pagepilot-pdf-mode-consent-copy span {
        display: block;
        color: #4b5563;
        font-size: 12px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      .pagepilot-pdf-mode-consent-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
        flex-wrap: wrap;
      }
      .pagepilot-pdf-mode-consent-actions button {
        appearance: none;
        border: 1px solid rgba(17,24,39,0.16);
        border-radius: 6px;
        padding: 8px 11px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .pagepilot-pdf-mode-consent-actions [data-pp-pdf-mode-accept] {
        background: #2563eb;
        border-color: #2563eb;
        color: #ffffff;
      }
      .pagepilot-pdf-mode-consent-actions [data-pp-pdf-mode-decline] {
        background: #ffffff;
        color: #111827;
      }
      .pagepilot-pdf-mode-notice {
        position: fixed;
        left: 50%;
        bottom: 24px;
        z-index: 2147483647;
        width: min(460px, calc(100vw - 28px));
        transform: translateX(-50%);
        border: 1px solid rgba(17,24,39,0.14);
        border-radius: 8px;
        background: #111827;
        color: #ffffff;
        box-shadow: 0 16px 42px rgba(0,0,0,0.28);
        padding: 11px 13px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.4;
      }
      @media (max-width: 720px) {
        .pagepilot-pdf-controlled-title { flex-direction: column; gap: 1px; align-items: flex-start; }
        .pagepilot-pdf-controlled-scroll { padding-left: 12px; padding-right: 12px; }
        .pagepilot-pdf-mode-consent-actions { justify-content: stretch; }
        .pagepilot-pdf-mode-consent-actions button { flex: 1 1 150px; }
      }
    `;
    document.head.appendChild(style);
  }

  function updatePagePilotControlledPdfStatus(text) {
    const root = runtime.pdfControlledViewer && runtime.pdfControlledViewer.root;
    const status = root && root.querySelector ? root.querySelector("[data-pp-pdf-status]") : null;
    if (status) status.textContent = String(text || "");
  }

  function showPagePilotControlledPdfLoading(pageNumber) {
    const viewer = runtime.pdfControlledViewer;
    if (!viewer || !viewer.scroll || viewer.ready) return;
    viewer.scroll.innerHTML = `<div class="pagepilot-controlled-pdf-loading"><strong>Opening PDF Mode</strong><p>${PDF_MODE_OPENING_COPY}</p><p>Target page ${Number(pageNumber) || ""}</p></div>`;
  }

  function ensurePagePilotControlledPdfPageHost(viewer, pageNumber) {
    if (!viewer || !viewer.scroll || !viewer.pages) return null;
    const normalizedPage = Math.max(1, Math.min(Number(viewer.pageCount || pageNumber) || 1, Number(pageNumber) || 1));
    const existing = viewer.pages.get(normalizedPage);
    if (existing && existing.isConnected) return existing;
    const pageHost = document.createElement("section");
    pageHost.className = "pagepilot-controlled-pdf-page";
    pageHost.dataset.pageNumber = String(normalizedPage);
    pageHost.id = `pagepilot-controlled-pdf-page-${normalizedPage}`;
    pageHost.innerHTML = `<div class="pagepilot-controlled-pdf-page-label">Page ${normalizedPage}</div>`;
    const nextPage = Array.from(viewer.pages.entries())
      .filter(([candidatePage, host]) => candidatePage > normalizedPage && host && host.parentNode === viewer.scroll)
      .sort((a, b) => a[0] - b[0])[0];
    if (nextPage && nextPage[1]) {
      viewer.scroll.insertBefore(pageHost, nextPage[1]);
    } else {
      viewer.scroll.appendChild(pageHost);
    }
    viewer.pages.set(normalizedPage, pageHost);
    return pageHost;
  }

  function ensurePagePilotControlledPdfRendered(routeKey, targetPageNumber = 1) {
    const viewer = runtime.pdfControlledViewer || ensurePagePilotControlledPdfViewer();
    if (viewer.ready && viewer.routeKey === routeKey && viewer.doc && viewer.pages) {
      const targetNumber = Math.max(1, Math.min(Number(viewer.pageCount || targetPageNumber) || 1, Number(targetPageNumber) || 1));
      const existingTarget = ensurePagePilotControlledPdfPageHost(viewer, targetNumber);
      emitDebug("pdf:controlled-viewer:document-reused", {
        routeKey,
        actionId: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        token: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        pageNumber: targetNumber,
        pagesRendered: Array.from(viewer.pages.values()).filter((host) => host && host.dataset.rendered === "true").length,
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        exactIssue: "SkimRoute reused the already-loaded PDF.js document for this action."
      });
      if (existingTarget && existingTarget.dataset.rendered === "true") {
        return Promise.resolve(viewer);
      }
      return renderPagePilotControlledPdfPage(viewer.doc, viewer, targetNumber).then(() => viewer);
    }
    if (viewer.rendering && viewer.renderPromise && viewer.routeKey === routeKey) {
      return viewer.renderPromise.then(() => ensurePagePilotControlledPdfRendered(routeKey, targetPageNumber));
    }
    viewer.rendering = true;
    viewer.ready = false;
    viewer.routeKey = routeKey;
    viewer.sourceUrl = getPdfSourceUrl();
    viewer.pages = new Map();
    viewer.highlights = [];
    viewer.activeHighlightSectionId = "";
    viewer.lastError = "";
    viewer.doc = null;
    viewer.pageCount = 0;
    viewer.backgroundRenderToken = "";
    viewer.renderPromise = renderPagePilotControlledPdf(routeKey, viewer, targetPageNumber)
      .then(() => {
        viewer.rendering = false;
        viewer.ready = true;
        updatePagePilotControlledPdfStatus(`Ready · ${viewer.pages.size} page${viewer.pages.size === 1 ? "" : "s"} rendered`);
        emitDebug("pdf:controlled-viewer:ready", {
          routeKey,
          pagesRendered: viewer.pages.size,
          exactIssue: "none"
        });
        return viewer;
      })
      .catch((error) => {
        viewer.rendering = false;
        viewer.ready = false;
        viewer.lastError = String(error && error.message ? error.message : error);
        throw error;
      });
    return viewer.renderPromise;
  }

  async function renderPagePilotControlledPdf(routeKey, viewer, targetPageNumber = 1) {
    const renderStartedAt = Date.now();
    const actionToken = runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
    const sourceUrl = getPdfSourceUrl();
    updatePagePilotControlledPdfStatus(`${PDF_MODE_OPENING_COPY} Looking for the loaded PDF.`);
    const resourceLookupStartedAt = Date.now();
    const cachedResource = getCachedPdfResource(routeKey);
    addPdfActionTiming(actionToken, { resourceLookupMs: Date.now() - resourceLookupStartedAt });
    let data = cachedResource && cachedResource.bytes ? clonePdfBytes(cachedResource.bytes) : null;
    let pdf = cachedResource && cachedResource.pdfDocument || null;
    let fingerprint = cachedResource && cachedResource.fingerprint || null;
    if (pdf) {
      emitDebug("pdf:controlled-viewer:document-reused", {
        routeKey,
        sourceUrl,
        actionId: actionToken,
        token: actionToken,
        pageNumber: targetPageNumber,
        pages: Number(pdf.numPages || cachedResource.pageCount || 0),
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        exactIssue: "SkimRoute reused the PDF.js document loaded during PDF text extraction/OCR instead of fetching and parsing it again."
      });
    }
    if (!pdf && data && data.byteLength) {
      emitDebug("pdf:controlled-viewer:bytes-reused", {
        routeKey,
        sourceUrl,
        actionId: actionToken,
        token: actionToken,
        bytes: data.byteLength,
        exactIssue: "SkimRoute reused cached PDF bytes and only needed to parse them for PDF Mode."
      });
    }
    if (!pdf && !data) {
      const fetchStartedAt = Date.now();
      try {
        updatePagePilotControlledPdfStatus(`${PDF_MODE_OPENING_COPY} Reading PDF bytes.`);
        data = await fetchArrayBufferWithTimeout(sourceUrl, PDF_FETCH_TIMEOUT_MS, PDF_MAX_BYTES);
      } catch (contentError) {
        updatePagePilotControlledPdfStatus(`${PDF_MODE_OPENING_COPY} Retrying PDF access.`);
        emitDebug("pdf:controlled-viewer:fetch-content-error", {
          routeKey,
          sourceUrl,
          error: String(contentError && contentError.message ? contentError.message : contentError),
          exactIssue: "Content-script PDF fetch failed; SkimRoute is trying the background service worker fetch fallback."
        });
        data = await fetchPdfBytesFromBackground(sourceUrl);
      } finally {
        addPdfActionTiming(actionToken, { fetchMs: Date.now() - fetchStartedAt });
      }
    }
    if (!pdf) {
      if (!data || !data.byteLength) {
        throw new Error("PDF bytes were empty, so SkimRoute PDF mode cannot render pages.");
      }
      fingerprint = normalizePdfFingerprint(fingerprint) || getPdfByteFingerprint(data);
      updatePagePilotControlledPdfStatus(`${PDF_MODE_OPENING_COPY} Loading PDF tools.`);
      const pdfjs = await loadPdfJsModule();
      const parseStartedAt = Date.now();
      const task = pdfjs.getDocument({
        data: clonePdfBytes(data) || data,
        isEvalSupported: false,
        useWorkerFetch: false,
        stopAtErrors: false,
        disableFontFace: true,
        disableStream: true,
        disableAutoFetch: true,
        cMapUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/cmaps/"),
        cMapPacked: true,
        // Required for scanned PDFs that use JBIG2/OpenJPEG image streams.
        // Without wasmUrl, PDF.js can fetch the PDF bytes but render blank/undecodable pages,
        // which makes OCR return zero words.
        wasmUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/wasm/"),
        standardFontDataUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/standard_fonts/"),
        iccUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/iccs/"),
        useWasm: true
      });
      if (viewer) {
        viewer.activeLoadingTask = {
          task,
          actionToken
        };
      }
      try {
        pdf = await task.promise;
      } finally {
        if (viewer && viewer.activeLoadingTask && viewer.activeLoadingTask.task === task) {
          viewer.activeLoadingTask = null;
        }
        addPdfActionTiming(actionToken, { parseMs: Date.now() - parseStartedAt });
      }
    }
    viewer.doc = pdf;
    const pageCount = Number(pdf.numPages || 0);
    if (!pageCount) throw new Error("PDF.js loaded the document but reported zero pages.");
    rememberPdfResource(routeKey, {
      source: "controlled-viewer",
      sourceUrl,
      bytes: data,
      fingerprint,
      pdfDocument: pdf,
      pageCount
    });

    viewer.scroll.innerHTML = "";
    viewer.pages = new Map();
    viewer.pageCount = pageCount;
    const firstPage = Math.max(1, Math.min(pageCount, Number(targetPageNumber) || 1));
    updatePagePilotControlledPdfStatus(`${PDF_MODE_OPENING_COPY} Rendering target page ${firstPage}.`);
    emitDebug("pdf:controlled-viewer:document-loaded", {
      routeKey,
      sourceUrl,
      bytes: data && data.byteLength || cachedResource && cachedResource.bytes && cachedResource.bytes.byteLength || 0,
      pages: pageCount,
      targetPage: firstPage,
      elapsedMs: getPdfActionDuration(runtime.pdfAction),
      durationMs: Math.max(0, Date.now() - renderStartedAt),
      exactIssue: "none"
    });

    await renderPagePilotControlledPdfPage(pdf, viewer, firstPage);
    updatePagePilotControlledPdfStatus(`Ready. Target page ${firstPage} rendered.`);
  }

  async function renderPagePilotControlledPdfPage(pdf, viewer, pageNumber) {
    const targetPage = Math.max(1, Math.min(Number(viewer && viewer.pageCount || pageNumber) || 1, Number(pageNumber) || 1));
    const pageHost = ensurePagePilotControlledPdfPageHost(viewer, targetPage);
    if (!pageHost) return;
    if (pageHost.dataset.rendered === "true") {
      addPdfActionTiming(runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "", { pageRenderMs: 0 });
      emitDebug("pdf:controlled-viewer:target-page-render-complete", {
        pageNumber: targetPage,
        actionId: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        token: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        reused: true,
        exactIssue: "The target page was already rendered, so no PDF.js render was needed."
      });
      return;
    }
    const renderStartedAt = Date.now();
    emitDebug("pdf:controlled-viewer:target-page-render-start", {
      pageNumber: targetPage,
      actionId: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
      token: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
      routeKey: viewer && viewer.routeKey || getPdfDocumentRouteKey(),
      elapsedMs: getPdfActionDuration(runtime.pdfAction),
      exactIssue: "none"
    });
    try {
      const page = await pdf.getPage(targetPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(420, Math.min(1100, Number(viewer.scroll && viewer.scroll.clientWidth || window.innerWidth) - 90));
      let scale = Math.max(0.72, Math.min(1.72, availableWidth / Math.max(1, baseViewport.width)));
      const viewport = page.getViewport({ scale });
      const maxPixels = 4200000;
      if (viewport.width * viewport.height > maxPixels) {
        scale *= Math.sqrt(maxPixels / (viewport.width * viewport.height));
      }
      const finalViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.max(1, Math.floor(finalViewport.width));
      canvas.height = Math.max(1, Math.floor(finalViewport.height));
      canvas.style.width = `${Math.floor(finalViewport.width)}px`;
      canvas.style.height = `${Math.floor(finalViewport.height)}px`;
      pageHost.style.width = `${Math.floor(finalViewport.width)}px`;
      pageHost.style.minHeight = `${Math.floor(finalViewport.height)}px`;
      pageHost.querySelectorAll("canvas").forEach((node) => node.remove());
      pageHost.appendChild(canvas);
      const actionToken = runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
      const renderTask = page.render({ canvasContext: context, viewport: finalViewport });
      if (viewer) {
        viewer.activeRenderTask = {
          task: renderTask,
          actionToken,
          pageNumber: targetPage
        };
      }
      try {
        await renderTask.promise;
      } finally {
        if (viewer && viewer.activeRenderTask && viewer.activeRenderTask.task === renderTask) {
          viewer.activeRenderTask = null;
        }
      }
      pageHost.dataset.rendered = "true";
      addPdfActionTiming(actionToken, { pageRenderMs: Date.now() - renderStartedAt });
      emitDebug("pdf:controlled-viewer:page-rendered", {
        pageNumber: targetPage,
        width: canvas.width,
        height: canvas.height,
        exactIssue: "none"
      });
      emitDebug("pdf:controlled-viewer:target-page-render-complete", {
        pageNumber: targetPage,
        actionId: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        token: runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        routeKey: viewer && viewer.routeKey || getPdfDocumentRouteKey(),
        width: canvas.width,
        height: canvas.height,
        elapsedMs: getPdfActionDuration(runtime.pdfAction),
        durationMs: Math.max(0, Date.now() - renderStartedAt),
        exactIssue: "none"
      });
    } catch (error) {
      pageHost.dataset.renderError = String(error && error.message ? error.message : error);
      emitDebug("pdf:controlled-viewer:page-render-error", {
        pageNumber: targetPage,
        error: String(error && error.message ? error.message : error),
        exactIssue: "PDF.js could not render this page into SkimRoute's controlled viewer."
      });
      throw error;
    }
  }

  function scrollPagePilotControlledPdfToSection(section, pageNumber, options = {}) {
    const viewer = runtime.pdfControlledViewer;
    const pageHost = viewer && viewer.pages && viewer.pages.get(Number(pageNumber));
    const actionToken = options.actionToken || viewer && viewer.pendingTarget && viewer.pendingTarget.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
    const actionType = viewer && viewer.pendingTarget && viewer.pendingTarget.actionType || options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump";
    if (actionToken && !isPdfActionActive(actionToken)) {
      emitDebug("pdf:action:cancelled", {
        actionId: actionToken,
        token: actionToken,
        type: actionType,
        sectionId: section && section.id,
        targetSectionId: section && section.id,
        pageNumber,
        cancelledReason: "stale-before-scroll",
        exactIssue: "The PDF scroll step was ignored because a newer action replaced this target."
      });
      return false;
    }
    if (!viewer || !viewer.root || !viewer.scroll || !pageHost) {
      emitDebug("pdf:controlled-viewer:scroll-blocked", {
        sectionId: section && section.id,
        pageNumber,
        actionId: actionToken,
        token: actionToken,
        exactIssue: "The SkimRoute PDF viewer exists, but the target page has not been rendered/found in its owned DOM."
      });
      return false;
    }
    reopenPagePilotControlledPdfViewer(viewer);
    if (pageHost.dataset.rendered !== "true" && viewer.doc) {
      if (options.renderRetry) {
        emitDebug("pdf:action:blocked", {
          actionId: actionToken,
          token: actionToken,
          type: actionType,
          sectionId: section && section.id,
          targetSectionId: section && section.id,
          pageNumber,
          blockedReason: "target-page-render-retry-failed",
          exactIssue: "The target page was still not rendered after one bounded render retry."
        });
        completePdfAction(actionToken, "blocked", {
          type: actionType,
          sectionId: section && section.id,
          pageNumber,
          blockedReason: "target-page-render-retry-failed"
        });
        return false;
      }
      updatePagePilotControlledPdfStatus(`Rendering target page ${pageNumber}…`);
      renderPagePilotControlledPdfPage(viewer.doc, viewer, Number(pageNumber)).then(() => {
        if (actionToken && !isPdfActionActive(actionToken)) return;
        scrollPagePilotControlledPdfToSection(section, pageNumber, { ...options, highlight: true, reason: "target-page-rendered", renderRetry: true, actionToken });
      }).catch((error) => {
        emitDebug("pdf:action:blocked", {
          actionId: actionToken,
          token: actionToken,
          type: actionType,
          sectionId: section && section.id,
          targetSectionId: section && section.id,
          pageNumber,
          blockedReason: "target-page-render-failed",
          error: String(error && error.message ? error.message : error),
          exactIssue: "The bounded target-page render retry failed, so SkimRoute stopped the PDF action without fallback navigation."
        });
        completePdfAction(actionToken, "blocked", {
          type: actionType,
          sectionId: section && section.id,
          pageNumber,
          blockedReason: "target-page-render-failed"
        });
      });
      emitDebug("pdf:controlled-viewer:target-page-rendering", {
        sectionId: section && section.id,
        pageNumber,
        actionId: actionToken,
        token: actionToken,
        exactIssue: "Target page existed but was not rendered yet; SkimRoute is rendering it before scrolling/highlighting."
      });
      return true;
    }

    viewer.pendingTarget = {
      token: viewer.pendingTarget && viewer.pendingTarget.token || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sectionId: section.id,
      pageNumber: Number(pageNumber),
      chunkIndex: getPdfSectionChunkIndex(section),
      relativeY: getPdfSectionRelativeY(section),
      relativeYStart: getPdfSectionRelativeYRange(section).start,
      relativeYEnd: getPdfSectionRelativeYRange(section).end,
      highlight: true,
      requestedAt: Date.now(),
      actionType,
      actionToken
    };
    const scrollHighlightStartedAt = Date.now();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const relativeRange = getPdfSectionRelativeYRange(section);
    const relativeY = relativeRange.start;
    const scrollRect = viewer.scroll.getBoundingClientRect();
    const pageRect = pageHost.getBoundingClientRect();
    const topPadding = Math.min(160, Math.round(scrollRect.height * 0.22));
    const sectionOffset = Math.max(0, Math.round(pageHost.offsetHeight * Math.max(0.02, Math.min(0.94, relativeY))));
    const targetTop = Math.max(0, viewer.scroll.scrollTop + (pageRect.top - scrollRect.top) + sectionOffset - topPadding);
    viewer.scroll.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? "auto" : "smooth" });
    setPdfActiveTarget(section, pageNumber, "pagepilot-controlled-viewer");
    if (runtime.ui) runtime.ui.updateActiveClasses(runtime.view.activeId);
    highlightPagePilotControlledPdfSection(section, pageHost, pageNumber, relativeRange);
    addPdfActionTiming(actionToken, { scrollHighlightMs: Date.now() - scrollHighlightStartedAt });
    updatePagePilotControlledPdfStatus(`Focused Page ${pageNumber} · ${String(section.title || "Important section").slice(0, 90)}`);
    emitDebug("pdf:controlled-viewer:scroll", {
      sectionId: section && section.id,
      pageNumber,
      actionId: actionToken,
      token: actionToken,
      relativeY: relativeRange.center,
      relativeYStart: relativeRange.start,
      relativeYEnd: relativeRange.end,
      targetTop,
      currentScrollTop: viewer.scroll.scrollTop,
      reason: options.reason || "jump",
      exactIssue: "none"
    });
    emitDebug("pdf:action:scroll-complete", {
      type: viewer.pendingTarget.actionType,
      actionId: viewer.pendingTarget.actionToken,
      token: viewer.pendingTarget.actionToken,
      sectionId: section && section.id,
      pageNumber,
      pdfJumpMode: "pagepilot-controlled-viewer",
      exactIssue: "none"
    });
    setActionResult(viewer.pendingTarget.actionType || "jump", true, {
      section,
      pageNumber,
      phase: "scrolled",
      actionToken: viewer.pendingTarget.actionToken || "",
      pdfJumpMode: "pagepilot-controlled-viewer",
      message: `Focused Page ${pageNumber}.`
    });
    window.setTimeout(() => {
      if (actionToken && !isPdfActionActive(actionToken)) return;
      const rect = pageHost.getBoundingClientRect();
      const visible = rect.bottom > 72 && rect.top < window.innerHeight;
      const latestActionType = viewer.pendingTarget && viewer.pendingTarget.actionType || options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump";
      const latestActionToken = viewer.pendingTarget && viewer.pendingTarget.actionToken || options.actionToken || runtime.pdfAction && runtime.pdfAction.token || "";
      emitDebug(visible ? "pdf:controlled-viewer:scroll-verified" : "pdf:controlled-viewer:scroll-not-verified", {
        sectionId: section && section.id,
        pageNumber,
        actionId: latestActionToken,
        token: latestActionToken,
        pageTop: Math.round(rect.top),
        pageBottom: Math.round(rect.bottom),
        viewerScrollTop: viewer.scroll.scrollTop,
        exactIssue: visible ? "none" : "SkimRoute rendered the PDF, but the target page is still not visible after scrolling the owned container."
      });
      if (visible) {
        completePdfAction(latestActionToken, "completed", {
          type: latestActionType,
          sectionId: section && section.id,
          pageNumber,
          pdfJumpMode: "pagepilot-controlled-viewer",
          exactIssue: "none"
        });
        emitDebug("pdf:action:completed", {
          type: latestActionType,
          actionId: latestActionToken,
          token: latestActionToken,
          sectionId: section && section.id,
          targetSectionId: section && section.id,
          pageNumber,
          durationMs: getPdfActionDuration(runtime.pdfAction),
          pdfJumpMode: "pagepilot-controlled-viewer",
          completionSource: "controlled-viewer-scroll-verified",
          exactIssue: "none"
        });
        setActionResult(latestActionType, true, {
          section,
          pageNumber,
          phase: "completed",
          actionToken: latestActionToken,
          pdfJumpMode: "pagepilot-controlled-viewer",
          message: `Focused Page ${pageNumber}.`
        });
      } else {
        completePdfAction(latestActionToken, "blocked", {
          type: latestActionType,
          sectionId: section && section.id,
          pageNumber,
          blockedReason: "scroll-not-verified",
          exactIssue: "The controlled viewer scrolled once, but the target page was not visible in the bounded verification window."
        });
        setActionResult(latestActionType, false, {
          section,
          pageNumber,
          phase: "blocked",
          actionToken: latestActionToken,
          pdfJumpMode: "pagepilot-controlled-viewer",
          blockedReason: "scroll-not-verified",
          message: "SkimRoute opened PDF Mode, but could not verify the target page."
        });
      }
    }, Math.min(PDF_ACTION_VERIFY_TIMEOUT_MS, prefersReducedMotion ? 100 : 750));
    return true;
  }

  function normalizePdfOcrTextSampleForCompare(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function pdfOcrTextSamplesOverlap(sectionText, sourceText) {
    const sectionTokens = normalizePdfOcrTextSampleForCompare(sectionText).split(/\s+/).filter((word) => word.length >= 3).slice(0, 48);
    const sourceTokens = new Set(normalizePdfOcrTextSampleForCompare(sourceText).split(/\s+/).filter((word) => word.length >= 3).slice(0, 80));
    if (!sectionTokens.length || !sourceTokens.size) return false;
    let hits = 0;
    sectionTokens.forEach((token) => {
      if (sourceTokens.has(token)) hits += 1;
    });
    return hits >= Math.min(5, Math.max(2, Math.ceil(sectionTokens.length * 0.32)));
  }

  function getVerifiedPdfOcrHighlightGeometry(section) {
    if (!isOcrPdfSection(section)) return { geometry: null, exact: false, reason: "not-ocr" };
    const unitMeta = section && section.unitMeta || {};
    const geometry = getPdfSectionOcrGeometry(section);
    const sourceLines = normalizePdfOcrSourceLines(unitMeta.ocrSourceLines || geometry && geometry.ocrSourceLines || []);
    const sourceLineIds = Array.isArray(unitMeta.sourceLineIds) && unitMeta.sourceLineIds.length
      ? unitMeta.sourceLineIds.filter(Boolean)
      : geometry && Array.isArray(geometry.sourceLineIds) ? geometry.sourceLineIds.filter(Boolean) : [];
    const sourceLineIdSet = new Set(sourceLines.flatMap((line) => line.sourceLineIds && line.sourceLineIds.length ? line.sourceLineIds : [line.id]).filter(Boolean));
    const sectionSample = String(unitMeta.sectionText || unitMeta.sectionTextSample || section && section.text || "").replace(/\s+/g, " ").trim().slice(0, 360);
    const sourceSample = String(sourceLines.length ? sourceLines.map((line) => line.text).join(" ") : unitMeta.sourceLineTextSample || geometry && geometry.sourceLineTextSample || "").replace(/\s+/g, " ").trim().slice(0, 360);
    const lineGeometry = sourceLines.length ? mergePdfOcrLineBackedGeometry(sourceLines) : null;
    const verifiedGeometry = lineGeometry && lineGeometry.exact ? lineGeometry : geometry;
    const unitVariant = String(unitMeta.ocrVariantName || "").trim();
    const geometryVariant = String(verifiedGeometry && verifiedGeometry.ocrVariantName || "").trim();
    const lineVariants = Array.from(new Set(sourceLines.map((line) => String(line.ocrVariantName || "").trim()).filter(Boolean)));
    const idsMatch = Boolean(sourceLineIds.length && sourceLineIds.every((id) => sourceLineIdSet.has(id)));
    const variantMatches = Boolean(
      lineVariants.length <= 1
      && (!unitVariant || !geometryVariant || unitVariant === geometryVariant)
      && (!unitVariant || !lineVariants.length || lineVariants[0] === unitVariant)
    );
    const textMatches = pdfOcrTextSamplesOverlap(sectionSample, sourceSample);
    const saneGeometry = isPdfOcrExactGeometryUsable(verifiedGeometry, { requireWords: sourceLines.some((line) => Array.isArray(line.wordBoxes) && line.wordBoxes.length) });
    const exact = Boolean(
      sourceLines.length
      &&
      geometry
      && verifiedGeometry
      && verifiedGeometry.exact
      && unitMeta.ocrExactGeometry !== false
      && !unitMeta.ocrHighlightApproximate
      && sourceLineIds.length
      && idsMatch
      && variantMatches
      && textMatches
      && saneGeometry
    );
    if (!exact) {
      const mismatchReason = !geometry ? "missing-geometry"
        : !sourceLines.length ? "missing-source-line-objects"
          : !sourceLineIds.length ? "missing-source-lines"
            : !idsMatch ? "source-line-id-mismatch"
              : !variantMatches ? "variant-mismatch"
                : !textMatches ? "text-sample-mismatch"
                  : !saneGeometry ? "invalid-or-blank-rectangle"
                    : "geometry-marked-approximate";
      emitDebug("pdf:ocr:geometry-mismatch", {
        sectionId: section && section.id,
        pageNumber: getPdfSectionPageNumber(section),
        variantName: unitMeta.ocrVariantName || verifiedGeometry && verifiedGeometry.ocrVariantName || "",
        sourceLineIds,
        verifiedSourceLineIds: Array.from(sourceLineIdSet),
        sectionTextSample: sectionSample,
        sourceLineTextSample: sourceSample,
        rectangle: verifiedGeometry && verifiedGeometry.bbox || null,
        renderScale: Number(unitMeta.renderScale || verifiedGeometry && verifiedGeometry.renderScale || 0) || 0,
        cropOffset: unitMeta.cropOffset || verifiedGeometry && verifiedGeometry.cropOffset || null,
        rotation: Number(unitMeta.rotation || verifiedGeometry && verifiedGeometry.rotation || 0) || 0,
        mismatchReason,
        exactIssue: "Exact OCR geometry could not be verified against the section text, so SkimRoute will use an approximate page highlight instead."
      });
    }
    return {
      geometry: exact ? verifiedGeometry : geometry,
      exact,
      sourceLineIds,
      sectionTextSample: sectionSample,
      sourceLineTextSample: sourceSample,
      variantName: unitMeta.ocrVariantName || verifiedGeometry && verifiedGeometry.ocrVariantName || "",
      ocrSourceLines: sourceLines
    };
  }

  function highlightPagePilotControlledPdfSection(section, pageHost, pageNumber, range) {
    if (!pageHost) return false;
    clearPagePilotControlledPdfHighlights();
    const highlight = document.createElement("div");
    highlight.className = "pagepilot-controlled-pdf-highlight";
    const relativeRange = range && Number.isFinite(range.start) ? range : getPdfSectionRelativeYRange(section);
    const ocrTarget = isOcrPdfSection(section);
    const verifiedOcrGeometry = ocrTarget ? getVerifiedPdfOcrHighlightGeometry(section) : { geometry: null, exact: false };
    const exactBox = verifiedOcrGeometry.exact && verifiedOcrGeometry.geometry && verifiedOcrGeometry.geometry.bbox ? verifiedOcrGeometry.geometry.bbox : null;
    const pageWidth = Number(exactBox && exactBox.pageWidth || 0);
    const pageHeight = Number(exactBox && exactBox.pageHeight || 0);
    const exactStart = exactBox && pageHeight > 0 ? exactBox.y0 / pageHeight : null;
    const exactEnd = exactBox && pageHeight > 0 ? exactBox.y1 / pageHeight : null;
    const start = Math.max(0.02, Math.min(0.94, Number.isFinite(exactStart) ? exactStart : relativeRange.start));
    const end = Math.max(start + 0.035, Math.min(0.98, Number.isFinite(exactEnd) ? exactEnd : relativeRange.end));
    const sectionHeight = Math.max(76, Math.min(280, Math.round(pageHost.offsetHeight * Math.min(0.22, Math.max(0.07, end - start)))));
    const top = Math.max(42, Math.min(Math.max(42, pageHost.offsetHeight - sectionHeight - 24), Math.round(pageHost.offsetHeight * start) - 12));
    highlight.style.top = `${top}px`;
    highlight.style.height = `${sectionHeight}px`;
    if (exactBox && pageWidth > 0) {
      const leftPct = Math.max(4, Math.min(88, (exactBox.x0 / pageWidth) * 100));
      const rightPct = Math.max(4, Math.min(88, 100 - (exactBox.x1 / pageWidth) * 100));
      highlight.style.left = `${leftPct}%`;
      highlight.style.right = `${rightPct}%`;
    }
    const label = document.createElement("div");
    label.className = "pagepilot-controlled-pdf-highlight-label";
    const ocrGeometry = verifiedOcrGeometry.geometry || (ocrTarget ? getPdfSectionOcrGeometry(section) : null);
    const ocrApproximate = Boolean(ocrTarget && !verifiedOcrGeometry.exact);
    label.textContent = `${ocrTarget ? ocrApproximate ? "Approximate OCR highlight" : "OCR highlight" : "Current section"} - Page ${pageNumber} - ${String(section && section.title || "").slice(0, 96)}`;
    highlight.appendChild(label);
    pageHost.classList.add("pagepilot-controlled-pdf-active-page");
    pageHost.appendChild(highlight);
    runtime.pdfControlledViewer.highlights = [highlight];
    runtime.pdfControlledViewer.activeHighlightSectionId = section && section.id || "";
    try {
      highlight.animate([
        { transform: "scale(0.992)", opacity: 0.72 },
        { transform: "scale(1)", opacity: 1 }
      ], { duration: 260, easing: "ease-out" });
    } catch (error) { /* ignore animation failures */ }
    emitDebug("pdf:controlled-viewer:highlight", {
      sectionId: section && section.id,
      pageNumber,
      relativeY: relativeRange.center,
      relativeYStart: start,
      relativeYEnd: end,
      top,
      height: sectionHeight,
      ocrTarget,
      ocrApproximate,
      ocrExactGeometry: Boolean(verifiedOcrGeometry.exact),
      variantName: verifiedOcrGeometry.variantName || ocrGeometry && ocrGeometry.ocrVariantName || "",
      sourceLineIds: verifiedOcrGeometry.sourceLineIds || ocrGeometry && ocrGeometry.sourceLineIds || [],
      sectionTextSample: verifiedOcrGeometry.sectionTextSample || String(section && section.text || "").slice(0, 220),
      sourceLineTextSample: verifiedOcrGeometry.sourceLineTextSample || ocrGeometry && ocrGeometry.sourceLineTextSample || "",
      rectangle: ocrGeometry && ocrGeometry.bbox || null,
      cropOffset: ocrGeometry && ocrGeometry.cropOffset || null,
      renderScale: Number(ocrGeometry && ocrGeometry.renderScale || 0) || 0,
      rotation: Number(ocrGeometry && ocrGeometry.rotation || 0) || 0,
      excerpt: getPdfSectionExcerpt(section).slice(0, 220),
      exactIssue: "none"
    });
    if (ocrApproximate) {
      showPagePilotPdfModeNotice("OCR highlight is approximate on scanned PDFs.");
    }
    emitDebug("pdf:jump:highlight-applied", {
      sectionId: section && section.id,
      pageNumber,
      mode: "pagepilot-controlled-viewer",
      relativeY: relativeRange.center,
      exactIssue: "none"
    });
    return true;
  }

  function clearPagePilotControlledPdfHighlights() {
    const viewer = runtime.pdfControlledViewer;
    if (!viewer) return;
    if (viewer.highlights && viewer.highlights.length) {
      viewer.highlights.forEach((element) => {
        try { element.remove(); } catch (error) { /* ignore */ }
      });
    }
    viewer.highlights = [];
    viewer.activeHighlightSectionId = "";
    if (viewer.pages && viewer.pages.size) {
      viewer.pages.forEach((page) => page.classList.remove("pagepilot-controlled-pdf-active-page"));
    }
  }


  /* SkimRoute PDF smooth-scroll + diagnostic override.
     Keep normal website navigation untouched; only overrides synthetic PDF jumps. */
  function performPdfSyntheticJump(section, options) {
    const pageNumber = getPdfSectionPageNumber(section);
    if (!pageNumber) {
      emitDebug("pdf:jump:blocked", {
        stage: "metadata",
        blocker: "missing-page-number",
        sectionId: section && section.id,
        exactIssue: "The chosen PDF section has no pageNumber metadata, so SkimRoute cannot map it back to a PDF page."
      });
      emitDebug("pdf:action:blocked", {
        type: options && options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump",
        actionId: options && options.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
        sectionId: section && section.id,
        pageNumber: 0,
        blockedReason: "missing-page-number",
        exactIssue: "The chosen PDF section has no pageNumber metadata, so SkimRoute cannot scroll or highlight it."
      });
      return false;
    }

    const before = capturePdfNavigationState(pageNumber);

    emitDebug("pdf:jump:start", {
      sectionId: section && section.id,
      pageNumber,
      actionId: options && options.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "",
      targetRelativeY: getPdfSectionRelativeYRange(section).center,
      before,
      goal: "smooth-scroll-to-pdf-page-and-highlight-section"
    });

    return requestPagePilotControlledPdfJump(section, pageNumber, options || {}, { before });
  }

  function performNativePdfJumpFallback(section, pageNumber, options = {}, context = {}) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const before = context.before || capturePdfNavigationState(pageNumber);
    setPdfActiveTarget(section, pageNumber, "native-fallback-starting");

    // Always show a SkimRoute-owned focus overlay first. Chrome's PDF viewer often hides
    // the real page DOM, so this prevents the user from seeing only a toast/no-op.
    showPdfJumpMarker(section, pageNumber, { persist: true, mode: "owned-overlay-preflight" });
    storePendingPdfJumpMarker(section, pageNumber);

    const pageElementScrolled = scrollPdfPageElementToSection(section, pageNumber, prefersReducedMotion);
    const scrollRatioResult = pageElementScrolled ? null : smoothScrollPdfViewerApproximately(pageNumber, section, prefersReducedMotion);
    const selectorNavigated = pageElementScrolled || scrollRatioResult && scrollRatioResult.ok ? false : commitPdfPageSelector(pageNumber);
    const chromeViewerNavigated = pageElementScrolled || scrollRatioResult && scrollRatioResult.ok || selectorNavigated ? false : navigateChromePdfViewerPage(pageNumber);
    const hardNavigated = pageElementScrolled || scrollRatioResult && scrollRatioResult.ok || selectorNavigated || chromeViewerNavigated
      ? false
      : navigatePdfPageHard(section, pageNumber);
    const hashNavigated = pageElementScrolled || scrollRatioResult && scrollRatioResult.ok || selectorNavigated || chromeViewerNavigated || hardNavigated
      ? false
      : navigatePdfPageByHash(pageNumber);

    const pdfJumpMode = pageElementScrolled
      ? "page-element-smooth"
      : scrollRatioResult && scrollRatioResult.ok
        ? "scroll-container-smooth"
        : selectorNavigated
          ? "page-selector"
          : chromeViewerNavigated
            ? "chrome-viewer-api"
            : hardNavigated
              ? "hard-page-navigation"
              : hashNavigated
                ? "hash-page"
                : "";

    if (!pdfJumpMode) {
      const diagnostics = buildPdfNavigationDiagnostics(pageNumber, before, scrollRatioResult);
      emitDebug("pdf:jump:blocked", {
        stage: "navigation",
        blocker: diagnostics.primaryBlocker,
        exactIssue: diagnostics.exactIssue,
        sectionId: section && section.id,
        pageNumber,
        diagnostics,
        attempted: {
          pageElementScrolled,
          scrollRatio: scrollRatioResult,
          selectorNavigated,
          chromeViewerNavigated,
          hardNavigated,
          hashNavigated
        }
      });
      showPdfSectionHighlight(section, pageNumber, { mode: "blocked", immediate: true, diagnostics });
      runtime.pdfJumpMode = "blocked";
      return true;
    }

    setPdfActiveTarget(section, pageNumber, pdfJumpMode);
    if (expandAncestors(section.id)) {
      render();
    } else if (runtime.ui) {
      runtime.ui.updateActiveClasses(runtime.view.activeId);
    }

    if (options && options.highlight) {
      if (pageElementScrolled || Boolean(scrollRatioResult && scrollRatioResult.ok)) {
        showPdfSectionHighlight(section, pageNumber, { mode: pdfJumpMode, immediate: true });
      } else {
        emitDebug("pdf:highlight:owned-overlay-kept", {
          sectionId: section && section.id,
          pageNumber,
          mode: pdfJumpMode,
          exactIssue: "Native page highlight was not attempted because no accessible PDF page element was proven. The SkimRoute-owned overlay remains visible."
        });
      }
    }

    window.setTimeout(() => verifyPdfJumpResult(section, pageNumber, pdfJumpMode, before, scrollRatioResult, options), Math.min(PDF_ACTION_VERIFY_TIMEOUT_MS, prefersReducedMotion ? 180 : 1150));

    emitDebug("pdf:jump:attempted", {
      sectionId: section && section.id,
      pageNumber,
      pdfJumpMode,
      pageElementScrolled,
      scrollRatio: scrollRatioResult,
      selectorNavigated,
      chromeViewerNavigated,
      hardNavigated,
      hashNavigated,
      note: "If this still does not visibly move, check the following pdf:jump:verified or pdf:jump:not-verified event for the exact blocker."
    });
    return true;
  }

  function scrollPdfPageElementToSection(section, pageNumber, prefersReducedMotion) {
    const page = findPdfPageElement(pageNumber);
    const container = page ? findPdfScrollableContainer(page) : null;
    if (!page || typeof page.getBoundingClientRect !== "function") {
      emitDebug("pdf:jump:page-element-missing", {
        pageNumber,
        exactIssue: "No accessible PDF page element exists in the DOM. This usually means Chrome is rendering the PDF inside an opaque built-in PDF plugin/shadow tree."
      });
      return false;
    }
    const relativeY = getPdfSectionRelativeYRange(section).start;
    try {
      const pageRect = page.getBoundingClientRect();
      const offset = Math.max(0, Math.round(pageRect.height * Math.max(0.02, Math.min(0.92, relativeY))));
      const topPadding = Math.min(180, Math.round(window.innerHeight * 0.22));
      let targetTop = 0;
      if (container && container !== window) {
        const containerRect = container.getBoundingClientRect();
        targetTop = Math.max(0, container.scrollTop + (pageRect.top - containerRect.top) + offset - topPadding);
        smoothScrollElementTo(container, targetTop, prefersReducedMotion);
      } else {
        targetTop = Math.max(0, window.scrollY + pageRect.top + offset - topPadding);
        smoothScrollElementTo(window, targetTop, prefersReducedMotion);
      }
      emitDebug("pdf:jump:page-element-smooth", {
        sectionId: section && section.id,
        pageNumber,
        relativeY,
        pageTag: page.tagName ? page.tagName.toLowerCase() : "",
        container: describePdfElement(container === window ? document.scrollingElement : container),
        targetTop,
        exactIssue: "none"
      });
      return true;
    } catch (error) {
      emitDebug("pdf:jump:page-element-error", {
        sectionId: section && section.id,
        pageNumber,
        error: String(error && error.message ? error.message : error),
        exactIssue: "An accessible page element was found, but scrolling it threw an exception."
      });
      return false;
    }
  }

  function smoothScrollPdfViewerApproximately(pageNumber, section, prefersReducedMotion) {
    const totalPages = getPdfTotalPages();
    const pageRatio = totalPages > 1
      ? Math.max(0, Math.min(1, (Number(pageNumber) - 1) / (totalPages - 1)))
      : 0;
    const sectionOffset = Math.max(0, Math.min(0.85, getPdfSectionRelativeYRange(section).start / Math.max(1, totalPages)));
    const ratio = Math.max(0, Math.min(1, pageRatio + sectionOffset));
    const candidates = getPdfScrollCandidatesDetailed();
    const attempts = [];

    for (const info of candidates) {
      const candidate = info.element;
      const maxScroll = getMaxPdfScroll(candidate);
      const before = getPdfScrollPosition(candidate);
      if (maxScroll < 24) {
        attempts.push({ ...info.meta, maxScroll, before, skipped: "not-scrollable" });
        continue;
      }
      const top = Math.round(maxScroll * ratio);
      smoothScrollElementTo(candidate, top, prefersReducedMotion);
      const after = getPdfScrollPosition(candidate);
      const changed = Math.abs(after - before) >= 4 || Math.abs(after - top) <= 16;
      attempts.push({ ...info.meta, maxScroll, before, targetTop: top, after, changed });
      if (changed) {
        emitDebug("pdf:jump:scroll-container-smooth", {
          pageNumber,
          totalPages,
          ratio,
          container: info.meta,
          before,
          after,
          targetTop: top,
          exactIssue: "none"
        });
        return { ok: true, container: info.meta, before, after, targetTop: top, ratio, attempts };
      }
    }

    emitDebug("pdf:jump:scroll-container-unavailable", {
      pageNumber,
      totalPages,
      ratio,
      attempts,
      exactIssue: attempts.length
        ? "Potential PDF containers were found, but none accepted a scrollTop/window scroll change."
        : "No accessible scrollable PDF container was found in the page DOM."
    });
    return { ok: false, reason: attempts.length ? "no-scroll-change" : "no-scroll-container", attempts, ratio };
  }

  function showPdfSectionHighlight(section, pageNumber, options = {}) {
    clearPdfJumpMarker();
    const page = findPdfPageElement(pageNumber);
    const mode = options.mode || runtime.pdfJumpMode || "pdf";
    if (page && attachPdfPageOverlay(page, section, pageNumber, mode)) {
      return;
    }
    const delay = options.immediate ? 0 : 850;
    window.setTimeout(() => {
      const delayedPage = findPdfPageElement(pageNumber);
      if (delayedPage && attachPdfPageOverlay(delayedPage, section, pageNumber, mode)) return;
      showPdfJumpMarker(section, pageNumber, { persist: true, mode });
      emitDebug("pdf:highlight:fixed-overlay", {
        sectionId: section && section.id,
        pageNumber,
        mode,
        blocker: "no-accessible-page-element",
        exactIssue: "SkimRoute could not attach the highlight to the PDF page because Chrome did not expose a page DOM element. A fixed overlay was shown instead.",
        diagnostics: options.diagnostics || buildPdfNavigationDiagnostics(pageNumber, null, null)
      });
    }, delay);
  }

  function verifyPdfJumpResult(section, pageNumber, mode, beforeState = null, scrollResult = null, options = {}) {
    const actionToken = options && options.actionToken || runtime.pdfAction && (runtime.pdfAction.activeActionId || runtime.pdfAction.actionId || runtime.pdfAction.token) || "";
    const actionType = options && options.actionType || runtime.pdfAction && runtime.pdfAction.type || "jump";
    if (actionToken && !isPdfActionActive(actionToken)) return;
    const after = capturePdfNavigationState(pageNumber);
    const visiblePage = findPdfPageElement(pageNumber);
    const visibleRect = visiblePage && visiblePage.getBoundingClientRect ? visiblePage.getBoundingClientRect() : null;
    const pageVisible = Boolean(visibleRect && visibleRect.bottom > 0 && visibleRect.top < window.innerHeight);
    const scrollMoved = beforeState ? Math.abs(Number(after.windowScrollY || 0) - Number(beforeState.windowScrollY || 0)) >= 4 : false;
    const viewerAtTarget = after.viewerPage === pageNumber || after.hashPage === pageNumber;
    const nativeSmoothConfirmed = pageVisible || scrollMoved || mode === "page-element-smooth" || mode === "scroll-container-smooth";
    const pageNavigationConfirmed = viewerAtTarget || mode === "hard-page-navigation";
    const likelyArrived = nativeSmoothConfirmed || pageNavigationConfirmed;
    const diagnostics = buildPdfNavigationDiagnostics(pageNumber, beforeState, scrollResult, after);

    emitDebug(likelyArrived ? "pdf:jump:verified" : "pdf:jump:not-verified", {
      sectionId: section && section.id,
      targetPage: pageNumber,
      actionId: actionToken,
      token: actionToken,
      mode: mode || runtime.pdfJumpMode || "",
      before: beforeState,
      after,
      pageElementVisible: pageVisible,
      scrollMoved,
      viewerAtTarget,
      nativeSmoothConfirmed,
      pageNavigationConfirmed,
      ownedOverlayVisible: Boolean(runtime.pdfOwnedFocusOverlay && runtime.pdfOwnedFocusOverlay.parentNode),
      diagnostics,
      exactIssue: nativeSmoothConfirmed
        ? "none"
        : pageNavigationConfirmed
          ? "Chrome accepted page navigation/hash, but did not expose a controllable page DOM for true smooth in-view scrolling or page-attached highlighting. SkimRoute used its owned overlay highlight instead."
          : diagnostics.exactIssue
    });
    if (likelyArrived) {
      completePdfAction(actionToken, "completed", {
        type: actionType,
        sectionId: section && section.id,
        pageNumber,
        pdfJumpMode: mode || runtime.pdfJumpMode || "",
        exactIssue: "none"
      });
      setActionResult(actionType, true, {
        section,
        pageNumber,
        phase: "completed",
        actionToken,
        pdfJumpMode: mode || runtime.pdfJumpMode || "",
        message: `Focused Page ${pageNumber}.`
      });
    } else {
      completePdfAction(actionToken, "blocked", {
        type: actionType,
        sectionId: section && section.id,
        pageNumber,
        blockedReason: diagnostics.primaryBlocker || "pdf-jump-not-verified",
        exactIssue: diagnostics.exactIssue
      });
      setActionResult(actionType, false, {
        section,
        pageNumber,
        phase: "blocked",
        actionToken,
        pdfJumpMode: mode || runtime.pdfJumpMode || "",
        blockedReason: diagnostics.primaryBlocker || "pdf-jump-not-verified",
        message: "SkimRoute could not verify the PDF jump."
      });
    }
  }

  function getPdfScrollCandidatesDetailed() {
    const helpers = runtime.engine && runtime.engine.helpers;
    const selector = "#viewerContainer, #viewer, pdf-viewer, embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf'], iframe[src*='.pdf' i], [class*='viewer' i], [class*='pdf' i], [part*='viewer' i]";
    const deepCandidates = helpers && helpers.querySelectorAllDeep
      ? helpers.querySelectorAllDeep(document, selector)
      : Array.from(document.querySelectorAll(selector));
    const base = uniqueElements(deepCandidates.concat([
      document.scrollingElement,
      document.documentElement,
      document.body,
      window
    ]));
    return base
      .filter(Boolean)
      .map((element) => ({ element, meta: describePdfElement(element === window ? document.scrollingElement : element) }))
      .filter((info, index, arr) => arr.findIndex((item) => item.meta.key === info.meta.key) === index);
  }

  function getPdfScrollCandidates() {
    return getPdfScrollCandidatesDetailed().map((item) => item.element);
  }

  function findPdfScrollableContainer(element) {
    let current = element && element.parentElement ? element.parentElement : null;
    while (current && current !== document.body && current !== document.documentElement) {
      if (getMaxPdfScroll(current) > 24) return current;
      current = current.parentElement;
    }
    if (document.scrollingElement && getMaxPdfScroll(document.scrollingElement) > 24) return document.scrollingElement;
    return window;
  }

  function getMaxPdfScroll(target) {
    if (target === window) {
      const scrolling = document.scrollingElement || document.documentElement;
      return Math.max(0, scrolling.scrollHeight - window.innerHeight);
    }
    if (!target) return 0;
    return Math.max(0, Number(target.scrollHeight || 0) - Number(target.clientHeight || 0));
  }

  function smoothScrollElementTo(target, top, prefersReducedMotion) {
    const behavior = prefersReducedMotion ? "auto" : "smooth";
    if (target === window) {
      window.scrollTo({ top, behavior });
      return;
    }
    if (target && typeof target.scrollTo === "function") {
      target.scrollTo({ top, behavior });
      return;
    }
    if (target) target.scrollTop = top;
  }

  function capturePdfNavigationState(targetPage) {
    const scrolling = document.scrollingElement || document.documentElement;
    const candidates = getPdfScrollCandidatesDetailed().slice(0, 8).map((info) => ({
      ...info.meta,
      scrollTop: getPdfScrollPosition(info.element),
      maxScroll: getMaxPdfScroll(info.element)
    }));
    return {
      targetPage,
      url: String(window.location.href || ""),
      hashPage: getCurrentPdfPageFromUrl(),
      viewerPage: readChromePdfViewerPageNumber(),
      hasPageElement: Boolean(findPdfPageElement(targetPage)),
      windowScrollY: Number(window.scrollY || 0),
      documentScrollHeight: Number(scrolling && scrolling.scrollHeight || 0),
      viewportHeight: Number(window.innerHeight || 0),
      pdfViewers: queryPdfDeep("pdf-viewer").length,
      embeds: queryPdfDeep("embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf']").length,
      iframes: queryPdfDeep("iframe[src*='.pdf' i]").length,
      scrollCandidates: candidates
    };
  }

  function buildPdfNavigationDiagnostics(pageNumber, beforeState = null, scrollResult = null, afterState = null) {
    const current = afterState || capturePdfNavigationState(pageNumber);
    const hasScrollable = current.scrollCandidates.some((item) => Number(item.maxScroll || 0) > 24);
    const hasOpaquePlugin = current.embeds > 0 && !current.hasPageElement && !hasScrollable;
    const primaryBlocker = current.hasPageElement
      ? "page-element-present-but-not-verified"
      : hasScrollable
        ? "scroll-container-present-but-not-verified"
        : hasOpaquePlugin
          ? "chrome-pdf-viewer-opaque-plugin"
          : "no-accessible-pdf-scroll-surface";
    const exactIssue = hasOpaquePlugin
      ? "Chrome is rendering this PDF inside its built-in opaque PDF plugin. The extension can extract text from bytes, but the actual PDF page scroller/page elements are not exposed to content scripts, so smooth in-view scrolling and page-attached highlighting cannot be guaranteed."
      : hasScrollable
        ? "SkimRoute found at least one scrollable container, but the post-jump verification did not prove the PDF reached the target page. Inspect scrollCandidates to see which element accepted or rejected scrollTop."
        : current.hasPageElement
          ? "A target page element exists, but SkimRoute could not verify that it became visible after scrolling."
          : "No accessible page element or scrollable PDF container was visible to the extension. This viewer is likely hiding the PDF rendering surface.";
    return {
      primaryBlocker,
      exactIssue,
      targetPage: pageNumber,
      before: beforeState,
      current,
      scrollResult,
      canSmoothScroll: current.hasPageElement || hasScrollable,
      canAttachPageHighlight: current.hasPageElement,
      fallbackHighlight: "fixed-overlay"
    };
  }

  function describePdfElement(element) {
    if (element === window) {
      return { key: "window", tag: "window", id: "", className: "", scrollHeight: 0, clientHeight: 0 };
    }
    if (!element) {
      return { key: "none", tag: "", id: "", className: "", scrollHeight: 0, clientHeight: 0 };
    }
    const tag = element.tagName ? element.tagName.toLowerCase() : "node";
    const id = String(element.id || "").slice(0, 80);
    const className = String(element.className || "").slice(0, 120);
    return {
      key: `${tag}#${id}.${className}`,
      tag,
      id,
      className,
      scrollHeight: Number(element.scrollHeight || 0),
      clientHeight: Number(element.clientHeight || 0),
      rect: element.getBoundingClientRect ? (() => {
        const rect = element.getBoundingClientRect();
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), width: Math.round(rect.width) };
      })() : null
    };
  }

  function destroy() {
    emitDebug("destroy", {
      activeMode: runtime.view.mode,
      lastUrl: runtime.currentUrl
    });
    window.clearTimeout(runtime.scanTimer);
    clearWarmupScans();
    clearChatReadinessPolling();
    window.clearInterval(runtime.urlWatchTimer);
    clearJumpEffect();
    cancelActiveGoogleDocsAction("destroy", { exactIssue: "The content script was destroyed while a Google Docs action was pending." });
    runtime.pendingPdfControlledJump = null;
    closePagePilotPdfModeConsentDialog(false);
    clearPagePilotPdfModeNotice();
    if (runtime.mutationObserver) runtime.mutationObserver.disconnect();
    runtime.listeners.forEach((entry) => {
      const target = entry.target || window;
      target.removeEventListener(entry.type, entry.listener, entry.options);
    });
    runtime.listeners = [];
    runtime.loadingAttempts = 0;
    if (runtime.ui) runtime.ui.destroy();
    cleanupStaleSkimRouteDom("destroy");
    window.__PAGEPILOT_LOADED__ = false;
    window.__SKIMROUTE_CONTENT_VERSION__ = "";
    if (window.__PAGEPILOT_DESTROY__ === destroy) window.__PAGEPILOT_DESTROY__ = null;
  }
})();
