(function () {
  "use strict";

  const ROOT_ID = "pagepilot-root";
  const MUTATION_SCAN_DELAY_MS = 520;
  const FAST_MUTATION_SCAN_DELAY_MS = 220;
  const MIN_RESCAN_INTERVAL_MS = 1250;
  const FAST_RESCAN_INTERVAL_MS = 360;
  const URL_WATCH_INTERVAL_MS = 1200;
  const WARMUP_SCAN_DELAYS_MS = [700, 1800, 3600, 7200, 12000];
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
  const PDF_OCR_TIMEOUT_MS = 75000;
  const PDF_OCR_PAGE_TIMEOUT_MS = 24000;
  const PDF_OCR_MAX_PAGES = 18;
  const PDF_OCR_RENDER_SCALE = 1.65;
  const PDF_RECOVERY_MIN_WORDS = 24;
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
  const PDF_FETCH_RETRY_WINDOW_MS = 12000;
  const PDF_FETCH_RETRY_DELAY_MS = 950;
  const PDF_FETCH_MAX_RETRIES = 6;
  const PDF_ANALYSIS_HARD_TIMEOUT_MS = 90000;
  const PDF_AUTO_OCR_AFTER_MS = 1200;
  const PDF_CONTROLLED_VIEWER_CONSENT_STORAGE_KEY = "pagepilot.pdfModeConsent";

  if (window.top !== window.self || window.__PAGEPILOT_LOADED__) {
    return;
  }

  if (!window.PagePilotAdapters || !window.PagePilotEngine || !window.PagePilotUI) {
    return;
  }

  window.__PAGEPILOT_LOADED__ = true;

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
    pdfOwnedFocusOverlay: null,
    pdfModeConsentCache: null,
    pdfModeConsentDialog: null,
    pdfModeNotice: null,
    pendingPdfControlledJump: null,
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
      renderPromise: null,
      lastError: "",
      visible: false,
      closedByUser: false,
      pendingTarget: null,
      activeHighlightSectionId: ""
    },
    loadingAttempts: 0,
    pdfOcr: {
      pending: false,
      retrying: false,
      retryStartedAt: 0,
      retryCount: 0,
      retryTimer: null,
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
      deepPending: false,
      deepForRoute: "",
      deepCompletedForRoute: "",
      analysisStartedAt: 0,
      watchdogTimer: null,
      autoOcrAttemptedForRoute: "",
      lastGoalSignature: "",
      lastRecoveredEntry: null
    },
    listeners: []
  };

  const DEBUG_PREFIX = "[PagePilot]";

  onReady(init);

  function emitDebug(event, extra) {
    const model = runtime.model;
    const debugState = {
      event,
      url: getCurrentUrl(),
      title: document.title || "",
      time: new Date().toISOString(),
      ...extra,
      stats: getPublicStatsSafely(),
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
    if (isPdfLikePage()) {
      hydratePdfSessionCache();
      requestPdfFileAccessStatus();
    }
    scanPage("initial");
    runtime.view.showOnboarding = !(await storageGet(STORAGE_KEYS.onboardingSeen));
    await restorePageMode();
    runtime.ui = window.PagePilotUI.createUI({
      helpers: runtime.engine.helpers,
      callbacks: {
        onOpen: () => setMode("open", { focus: true, persist: true }),
        onMinimize: () => setMode(modeForClosedState(), { focusTab: true, persist: true }),
        onSnooze: () => setMode("snoozed", { focusTab: true, persist: true }),
        onJump: () => jumpToUsefulPart(),
        onNext: () => jumpToNextImportant(),
        onRunPdfOcr: () => schedulePdfRecoveryAttempt("manual", { allowOcr: true }),
        onSection: (id, options) => scrollToSection(id, options),
        onToggleCollapse: (id) => toggleSectionCollapse(id),
        onDismissTip: () => dismissOnboarding()
      }
    });
    runtime.ui.mount();
    render();
    attachGlobalEvents();
    watchPageChanges();
    watchRouteChanges();
    refreshActiveSection();
    scheduleWarmupScans("initial");
    restorePendingPdfJumpMarker();
  }

  function scanPage(reason) {
    if (!runtime.engine) return;
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
    } catch (error) {
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
      emitDebug(`scan:error:${reason}`, {
        reason,
        error: message,
        fallbackApplied: true
      });
    }

    if (shouldHoldLoadingState(reason, runtime.model)) {
      runtime.loadingAttempts = (runtime.loadingAttempts || 0) + 1;
      const maxLoadingAttempts = runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf"
        ? 8
        : runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "chat"
          ? 2
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

    clearStalePdfErrorIfReady(runtime.model);

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


  function rememberStablePdfModel(model, source) {
    if (!model || !model.pageProfile || model.pageProfile.type !== "pdf") return false;
    if ((model.totalReadableWords || 0) < PDF_RECOVERY_MIN_WORDS || !Array.isArray(model.sections) || !model.sections.length) return false;
    runtime.stablePdfModel = model;
    runtime.stablePdfRouteKey = getPdfDocumentRouteKey();
    emitDebug("pdf:model:stable-saved", {
      source: source || "unknown",
      routeKey: runtime.stablePdfRouteKey,
      sections: model.sections.length,
      words: model.totalReadableWords || 0,
      exactIssue: "none"
    });
    return true;
  }

  function shouldPreserveStablePdfModel(candidateModel, reason) {
    if (!isPdfRouteLocked()) return false;
    if (!runtime.stablePdfModel || runtime.stablePdfRouteKey !== getPdfDocumentRouteKey()) return false;
    const stableWords = Number(runtime.stablePdfModel.totalReadableWords || 0);
    const candidateWords = Number(candidateModel && candidateModel.totalReadableWords || 0);
    const candidateType = candidateModel && candidateModel.pageProfile && candidateModel.pageProfile.type || "";
    if (stableWords < PDF_RECOVERY_MIN_WORDS) return false;
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
      exactIssue: "A PDF viewer mutation/route scan produced a thin Chrome viewer shell model. PagePilot kept the recovered PDF model instead of overwriting it."
    });
    return model;
  }


  function buildFallbackModel(reason, errorMessage) {
    const quietReason = errorMessage
      ? `PagePilot hit an internal error while scanning: ${errorMessage}`
      : "PagePilot is not ready yet.";
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
    const inferredType = current.pageProfile && current.pageProfile.type
      ? current.pageProfile.type
      : isPdfLikePage()
        ? "pdf"
        : isChatLikePage()
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
    const note = inferredType === "pdf"
      ? "PDF text is still loading, or the browser has not exposed a selectable text layer yet."
      : inferredType === "chat"
        ? "Conversation structure is still loading."
        : "PagePilot is still reading the page.";
    return {
      adapterName: current.adapterName || "loading",
      articleRoot: current.articleRoot || document.body,
      pageProfile: {
        type: inferredType,
        label: inferredLabel,
        readingConfidence: Math.min(26, Math.max(10, current.pageProfile && Number.isFinite(current.pageProfile.readingConfidence) ? current.pageProfile.readingConfidence : 16)),
        quietMode: false,
        reason: "Scanning page structure...",
        quietReason: "",
        adapterName: current.adapterName || "loading",
        state: "loading",
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
      bestLabel: "Scanning",
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
    const prompt = message || "This PDF appears scanned. Run OCR to continue.";
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
    const pdfTerminal = runtime.pdfOcr && /^(fetch-error|needs-ocr|ocr-failed)$/i.test(runtime.pdfOcr.state || "");
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
        : { state: "ocr-prompt", bestLabel: "Run OCR", confidenceLabel: "Needs OCR" });
    }

    if (alreadyPdf && (runtime.pdfOcr.pending || runtime.pdfOcr.retrying || profile.state === "loading")) {
      return model;
    }

    return buildPdfProcessingModel(model, runtime.pdfOcr && runtime.pdfOcr.retrying ? "Reading PDF text..." : "Reading PDF text...", "extracting");
  }


  function shouldHoldLoadingState(reason, model) {
    if (!model || !reason) return false;
    if (!/^(initial|initial-warmup|mutation|route|popup|scan:.*)$/i.test(String(reason))) return false;

    const pageType = model.pageProfile && model.pageProfile.type;
    const dynamicSurface = isChatLikePage() || isPdfRouteLocked() || isPdfLikePage() || pageType === "chat" || pageType === "pdf";
    if (!dynamicSurface) return false;

    const sections = Array.isArray(model.sections) ? model.sections.length : 0;
    const words = Number(model.totalReadableWords || 0);
    const hasStrongTarget = Boolean(model.hasStrongTarget);
    const type = model.pageProfile && model.pageProfile.type;
    if (type === "pdf" || isPdfRouteLocked()) {
      const hasUsablePdfMap = sections >= 1 && words >= PDF_RECOVERY_MIN_WORDS;
      if (hasUsablePdfMap) return false;
      if (model.pageProfile && (model.pageProfile.state === "ocr-prompt" || model.pageProfile.state === "pdf-error")) return false;
      if (runtime.pdfOcr && runtime.pdfOcr.pending && !isPdfAnalysisExpired()) return true;
    }
    const wordThreshold = type === "pdf"
      ? 24
      : type === "chat"
        ? 40
        : 320;
    const sectionThreshold = type === "pdf"
      ? 1
      : type === "chat"
        ? 2
        : 4;
    return !hasStrongTarget && (sections < sectionThreshold || words < wordThreshold || (model.pageProfile && model.pageProfile.quietMode));
  }

  function render() {
    if (!runtime.ui || !runtime.model) return;
    window.__PAGEPILOT_CURRENT_SECTIONS__ = runtime.model.sections;
    runtime.ui.render(runtime.model, runtime.view);
  }

  function setMode(mode, options) {
    if (!runtime.model) return;
    const nextMode = resolveMode(mode);
    runtime.view.mode = nextMode;

    if (nextMode === "open") {
      clearPageMode();
      refreshSectionPositions();
      refreshActiveSection();
      if (runtime.model && (runtime.model.totalReadableWords || 0) < 120) {
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
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  }

  function isPdfUrl(url) {
    return /\.pdf(?:$|[?#])/i.test(String(url || ""));
  }

  function isPdfRouteLocked() {
    return isPdfUrl(window.location.href)
      || Boolean(document.querySelector("pdf-viewer, embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf'], iframe[src*='.pdf' i], .textLayer, [data-page-number]"));
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

  function normalizePdfRecoveryLines(lines) {
    if (!Array.isArray(lines)) return [];
    return lines
      .map((line, index) => {
        const text = String(line && line.text ? line.text : "").replace(/\s+/g, " ").trim();
        if (!text) return null;
        const relativeY = Number(line && line.relativeY);
        return {
          text,
          words: Number(line && line.words) || countPdfWords(text),
          relativeY: Number.isFinite(relativeY) ? Math.max(0, Math.min(1, relativeY)) : null,
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
    return {
      text,
      pages,
      updatedAt: Number(entry.updatedAt) || Date.now(),
      source,
      partial: Boolean(entry.partial),
      pagesRead: Number(entry.pagesRead) || pages.length,
      words,
      numPages: Number(entry.numPages) || 0
    };
  }

  function persistPdfSessionCacheEntry(routeKey, entry) {
    const normalized = normalizePdfCacheEntry(entry);
    if (!routeKey || !normalized || normalized.words < 1) return false;
    const store = readPdfSessionCacheStore();
    store[routeKey] = normalized;
    const keys = Object.keys(store)
      .sort((a, b) => Number(store[b] && store[b].updatedAt || 0) - Number(store[a] && store[a].updatedAt || 0));
    keys.slice(8).forEach((key) => {
      delete store[key];
    });
    return writePdfSessionCacheStore(store);
  }

  function writePdfCacheEntry(routeKey, entry) {
    const normalized = normalizePdfCacheEntry(entry);
    if (!routeKey || !normalized) return null;
    getPdfOcrStore()[routeKey] = normalized;
    persistPdfSessionCacheEntry(routeKey, normalized);
    return normalized;
  }

  function hydratePdfSessionCache(routeKey = getPdfDocumentRouteKey()) {
    if (!routeKey) return false;
    const entry = normalizePdfCacheEntry(readPdfSessionCacheStore()[routeKey]);
    if (!entry || entry.words < PDF_RECOVERY_MIN_WORDS) return false;
    getPdfOcrStore()[routeKey] = entry;
    runtime.pdfOcr.completedForRoute = routeKey;
    runtime.pdfOcr.pending = false;
    runtime.pdfOcr.retrying = false;
    runtime.pdfOcr.lastError = "";
    runtime.pdfOcr.errorKind = "";
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.progress = 100;
    runtime.pdfOcr.source = entry.source || "pdfjs";
    runtime.pdfOcr.words = entry.words;
    runtime.pdfOcr.pages = entry.pagesRead || entry.pages.length;
    runtime.pdfOcr.partial = Boolean(entry.partial);
    runtime.pdfOcr.state = "ready";
    return true;
  }

  function persistCurrentPdfCache(routeKey = getPdfDocumentRouteKey()) {
    const entry = routeKey && getPdfOcrStore()[routeKey];
    if (entry) {
      persistPdfSessionCacheEntry(routeKey, entry);
    }
  }


  function buildRecoveredPdfModelFromCache(routeKey = getPdfDocumentRouteKey(), reason = "pdf-cache", baseModel = null) {
    if (!(isPdfRouteLocked() || isPdfLikePage())) return null;
    const store = getPdfOcrStore();
    const entry = normalizePdfCacheEntry(
      (routeKey && store && store[routeKey])
      || (runtime.pdfOcr && runtime.pdfOcr.lastRecoveredEntry)
      || null
    );
    if (!entry || entry.words < PDF_RECOVERY_MIN_WORDS) return null;

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

    const anchorRoot = document.querySelector("#viewer, #viewerContainer, pdf-viewer, main, [role='main']") || document.body;
    if (!anchorRoot) return null;
    const pages = entry.pages && entry.pages.length
      ? entry.pages
      : normalizePdfRecoveryPages([{ pageNumber: 1, text: entry.text }]);
    const chunks = [];
    pages.forEach((page, pageIndex) => {
      const pageNumber = Number(page && page.pageNumber) || pageIndex + 1;
      const lineChunks = buildRecoveredPdfLineChunks(page && page.lines, cleanText, countWords);
      const textChunks = lineChunks.length ? lineChunks : buildRecoveredPdfTextChunks(page && page.text, cleanText, countWords);
      (textChunks.length ? textChunks : [{ text: cleanText(page && page.text), relativeY: 0.12 }]).forEach((chunk, chunkIndex) => {
        const text = cleanText(chunk && chunk.text);
        const words = countWords(text);
        if (words < 14) return;
        chunks.push({
          pageNumber,
          chunkIndex,
          chunkCount: textChunks.length || 1,
          text,
          words,
          relativeY: Number.isFinite(Number(chunk && chunk.relativeY)) ? Math.max(0, Math.min(1, Number(chunk.relativeY))) : Math.max(0.04, Math.min(0.96, (chunkIndex + 0.2) / Math.max(1, textChunks.length || 1))),
          lineStart: Number(chunk && chunk.lineStart) || 0,
          lineEnd: Number(chunk && chunk.lineEnd) || 0
        });
      });
    });

    if (!chunks.length) return null;

    const sections = chunks.map((chunk, index) => {
      const title = inferRecoveredPdfSectionTitle(chunk.pageNumber, chunk.text);
      const id = `pp-pdf-${chunk.pageNumber}-${chunk.chunkIndex}-${hashText(`${title}:${chunk.words}:${chunk.text.slice(0, 120)}`)}`;
      const score = scoreRecoveredPdfChunk(chunk, index, chunks.length);
      const syntheticTop = chunk.pageNumber * 100000 + chunk.chunkIndex * 1000;
      const unitMeta = {
        kind: entry.source === "ocr" ? "pdf-ocr" : "pdfjs-page",
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        chunkCount: chunk.chunkCount,
        relativeY: chunk.relativeY,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        excerpt: chunk.text.slice(0, 240),
        navigationTarget: `#page=${chunk.pageNumber}`,
        synthetic: true,
        pdfjs: entry.source !== "ocr",
        ocr: entry.source === "ocr",
        syntheticTop,
        words: chunk.words
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
        metrics: buildRecoveredPdfMetrics(chunk, score),
        score,
        usefulScore: Math.max(30, Math.round(score * 0.62)),
        importanceScore: score,
        label: `Page ${chunk.pageNumber}`,
        isImportant: false,
        isBest: false
      };
    });

    const ranked = [...sections].sort((a, b) => b.score - a.score || a.index - b.index);
    const best = ranked[0] || sections[0];
    const importantLimit = Math.min(9, Math.max(3, Math.ceil(sections.length * 0.35)));
    const importantIds = new Set(ranked.slice(0, importantLimit).map((section) => section.id));
    sections.forEach((section) => {
      section.isBest = section.id === best.id;
      section.isImportant = section.isBest || importantIds.has(section.id);
      section.label = section.isBest ? `Best · Page ${section.pageNumber}` : section.isImportant ? `Page ${section.pageNumber}` : "";
    });
    const importantSections = sections.filter((section) => section.isImportant).sort((a, b) => b.score - a.score || a.index - b.index);
    const nextImportant = importantSections.find((section) => section.id !== best.id) || sections.find((section) => section.id !== best.id) || null;
    const totalReadableWords = sections.reduce((sum, section) => sum + section.wordCount, 0);
    const finalRouteKey = routeKey || getPdfDocumentRouteKey();

    const model = {
      adapterName: "pdf",
      articleRoot: anchorRoot,
      pageProfile: {
        type: "pdf",
        label: "PDF",
        readingConfidence: 88,
        quietMode: false,
        reason: entry.source === "ocr" ? "PDF OCR text recovered" : "PDF text recovered with PDF.js",
        quietReason: "",
        diagnosticHint: "PDF text was recovered and converted into page-based PagePilot sections.",
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
        recoveredPages: pages.length,
        recoveredWords: entry.words || totalReadableWords,
        pageProfileBefore: baseModel && baseModel.pageProfile || null,
        pageProfileAfter: null
      },
      structureSignature: `pdf-recovered:${finalRouteKey}:${sections.length}:${totalReadableWords}:${entry.updatedAt || 0}:${reason}`
    };
    model.diagnostics.pageProfileAfter = model.pageProfile;

    emitDebug("pdf:model:recovered", {
      reason,
      routeKey: finalRouteKey,
      source: entry.source || "pdfjs",
      pages: pages.length,
      chunks: chunks.length,
      sections: sections.length,
      words: totalReadableWords,
      bestPage: best && best.pageNumber || 0,
      note: "Recovered PDF text was converted directly into PagePilot page sections."
    });
    rememberStablePdfModel(model, `buildRecoveredPdfModelFromCache:${reason}`);
    return model;
  }

  function buildRecoveredPdfLineChunks(lines, cleanText, countWords) {
    const sourceLines = Array.isArray(lines)
      ? lines.map((line, index) => {
          const text = cleanText(line && line.text);
          if (!text) return null;
          const relativeY = Number(line && line.relativeY);
          return {
            text,
            words: Number(line && line.words) || countWords(text),
            relativeY: Number.isFinite(relativeY) ? Math.max(0, Math.min(1, relativeY)) : null,
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
        chunks.push({
          text,
          words,
          relativeY: ys.length ? ys.reduce((sum, value) => sum + value, 0) / ys.length : null,
          lineStart: bucket[0].lineIndex,
          lineEnd: bucket[bucket.length - 1].lineIndex
        });
      }
      bucket = [];
      bucketWords = 0;
    };
    sourceLines.forEach((line) => {
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
        chunks.push({
          text: chunkText,
          words,
          relativeY: Math.max(0.04, Math.min(0.96, (chunks.length + 0.2) / Math.max(1, sourceParts.length)))
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

  function scoreRecoveredPdfChunk(chunk, index, total) {
    const text = String(chunk && chunk.text || "").toLowerCase();
    let score = 48 + Math.min(24, Math.round((chunk.words || 0) / 12));
    if (/\b(abstract|summary|overview|introduction|thesis|claim|method|methodology|evidence|analysis|results?|findings|discussion|conclusion|recommendation|key takeaways?)\b/i.test(text)) score += 28;
    if (/\b(references|bibliography|works cited|appendix|acknowledg(e)?ments|table of contents)\b/i.test(text)) score -= 42;
    if (chunk.pageNumber <= 2 && !/\b(abstract|summary|introduction|thesis|claim)\b/i.test(text)) score -= 8;
    if (index === 0 && total > 2) score -= 4;
    return Math.max(12, Math.min(99, score));
  }

  function buildRecoveredPdfMetrics(chunk, score) {
    const text = String(chunk && chunk.text || "");
    return {
      wordCount: chunk.words || countPdfWords(text),
      linkCount: 0,
      links: 0,
      codeBlocks: 0,
      tables: /\b(table|figure|chart)\b/i.test(text) ? 1 : 0,
      fluffScore: /\b(references|bibliography|appendix|works cited)\b/i.test(text) ? 70 : 8,
      usefulScore: Math.max(30, Math.round(score * 0.62)),
      importanceScore: score,
      adapterScore: 0,
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
        codeExplanation: false,
        acceptedAnswer: false
      }
    };
  }

  function supportsPdfOcr() {
    return typeof window.TextDetector === "function"
      || Boolean(window.__PAGEPILOT_TESSERACT_MODULE__)
      || Boolean(window.__PAGEPILOT_TESSERACT_PROMISE__)
      || Boolean(window.Tesseract)
      || Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL);
  }

  function countPdfWords(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function isLocalFileUrl(url) {
    return /^file:\/\//i.test(String(url || ""));
  }

  function getPdfErrorKind(error, allowOcr) {
    const text = String(error && error.message ? error.message : error || "");
    if (allowOcr && /\b(ocr|tesseract|capture visible tab|capture|textdetector)\b/i.test(text)) {
      return "ocr";
    }
    if (/\b(unexpected server response\s*\(0\)|fetch failed|failed to fetch|pdf byte fetch failed|unable to read|local pdf file|missing host permission|not allowed|network|unsupported pdf url|too large)\b/i.test(text)) {
      return "fetch";
    }
    return allowOcr ? "ocr" : "";
  }

  function publicPdfErrorMessage(errorKind, allowOcr) {
    if (errorKind === "fetch") {
      if (runtime.pdfAccessAllowed === false) {
        return "Chrome says file access is disabled for PagePilot. Enable file access for the extension, then refresh the PDF.";
      }
      return "PagePilot could not read this PDF file yet. Refresh or reopen the PDF and PagePilot will try again.";
    }
    if (errorKind === "ocr" || allowOcr) {
      return "OCR could not read enough text from this PDF.";
    }
    return "No selectable PDF text was found. Run OCR to map this PDF.";
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
        const text = String(page && page.text ? page.text : "")
          .replace(/[^\S\n]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        if (!text) return null;
        const lines = normalizePdfRecoveryLines(page && page.lines);
        return {
          pageNumber: Number(page && page.pageNumber) || index + 1,
          text,
          words: Number(page && page.words) || countPdfWords(text),
          lines
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
    if (
      !model
      || !model.pageProfile
      || model.pageProfile.type !== "pdf"
      || runtime.pdfOcr.pending
      || Number(model.totalReadableWords || 0) < PDF_RECOVERY_MIN_WORDS
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

  function getTesseractOptions(logger) {
    return {
      workerPath: chrome.runtime.getURL("node_modules/tesseract.js/dist/worker.min.js"),
      corePath: chrome.runtime.getURL("node_modules/tesseract.js-core"),
      langPath: chrome.runtime.getURL("node_modules/@tesseract.js-data/eng/4.0.0_best_int"),
      gzip: true,
      cacheMethod: "none",
      logger
    };
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
      window.__PAGEPILOT_TESSERACT_PROMISE__ = import(moduleUrl)
        .then((module) => {
          window.__PAGEPILOT_TESSERACT_MODULE__ = module;
          window.Tesseract = module && module.default ? module.default : module;
          return module;
        })
        .catch((error) => {
          window.__PAGEPILOT_TESSERACT_PROMISE__ = null;
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
        const relativeY = Math.max(0, Math.min(1, 1 - (y / viewportHeight)));
        return {
          text,
          x,
          y,
          relativeY,
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
          y: fragment.y,
          parts: [fragment.text],
          words: fragment.words
        });
        return;
      }
      current.parts.push(fragment.text);
      current.words += fragment.words;
      current.relativeY = (current.relativeY + fragment.relativeY) / 2;
    });

    return grouped
      .map((group, index) => {
        const text = group.parts.join(" ").replace(/\s+/g, " ").trim();
        if (!text) return null;
        return {
          text,
          words: group.words || countPdfWords(text),
          relativeY: Math.max(0, Math.min(1, group.relativeY)),
          order: index
        };
      })
      .filter(Boolean);
  }

  async function extractPdfTextWithPdfJs(sourceUrl, options = {}) {
    const pdfjs = await loadPdfJsModule();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : PDF_TEXT_EXTRACTION_TIMEOUT_MS;
    const pageTimeoutMs = Number.isFinite(options.pageTimeoutMs) ? options.pageTimeoutMs : PDF_TEXT_PAGE_TIMEOUT_MS;
    const maxPages = Number.isFinite(options.maxPages) ? options.maxPages : PDF_MAX_TEXT_PAGES;
    const stopAfterReady = Boolean(options.stopAfterReady);
    const readyWords = Number.isFinite(options.readyWords) ? options.readyWords : PDF_FAST_READY_WORDS;
    const readyPages = Number.isFinite(options.readyPages) ? options.readyPages : PDF_FAST_READY_PAGES;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const startedAt = Date.now();

    let data = null;
    let fetchError = null;
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

    if (!data && isLocalFileUrl(sourceUrl)) {
      const error = new Error(
        fetchError && fetchError.message
          ? fetchError.message
          : "Unable to read this local PDF file."
      );
      error.pdfErrorKind = "fetch";
      throw error;
    }

    const pdfOptions = {
      isEvalSupported: false,
      useWorkerFetch: false,
      stopAtErrors: false,
      disableFontFace: true,
      disableStream: true,
      disableAutoFetch: true,
      cMapUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/cmaps/"),
      cMapPacked: true
    };

    const task = pdfjs.getDocument(
      data
        ? {
            ...pdfOptions,
            data
          }
        : {
            ...pdfOptions,
            url: sourceUrl
          }
    );

    let pdf = null;
    let timedOut = false;
    const timeoutPromise = new Promise((_, reject) => {
      const timer = window.setTimeout(() => {
        timedOut = true;
        reject(new Error("PDF text extraction timed out."));
      }, timeoutMs);
      task.promise.finally(() => window.clearTimeout(timer)).catch(() => {});
    });

    try {
      pdf = await Promise.race([task.promise, timeoutPromise]);
      const pageLimit = Math.min(Number(pdf.numPages || 0), maxPages);
      const pages = [];
      let totalWords = 0;
      let pagesRead = 0;
      onProgress({ loaded: 0, total: pageLimit, percent: 6 });

      for (let pageIndex = 1; pageIndex <= pageLimit; pageIndex += 1) {
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
        source: "pdfjs"
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

  async function recognizeImageWithTesseract(dataUrl) {
    const module = await loadTesseractModule();
    const api = module && module.default ? module.default : module;
    const createWorker = api && typeof api.createWorker === "function" ? api.createWorker.bind(api) : null;
    const recognize = api && typeof api.recognize === "function" ? api.recognize.bind(api) : null;
    const logger = (event) => {
      if (event && event.status) {
        emitDebug("pdf:ocr:progress", {
          status: event.status,
          progress: Number.isFinite(event.progress) ? Math.round(event.progress * 100) : undefined
        });
      }
    };

    if (createWorker) {
      const oem = api.OEM && api.OEM.LSTM_ONLY ? api.OEM.LSTM_ONLY : 1;
      const worker = await createWorker("eng", oem, getTesseractOptions(logger));
      try {
        const result = await worker.recognize(dataUrl);
        return String(result && result.data && result.data.text ? result.data.text : "");
      } finally {
        try {
          await worker.terminate();
        } catch (error) {
          // Ignore worker cleanup issues.
        }
      }
    }

    if (!recognize) {
      throw new Error("Tesseract recognition is unavailable.");
    }

    const result = await recognize(dataUrl, "eng", getTesseractOptions(logger));

    return String(result && result.data && result.data.text ? result.data.text : "");
  }

  async function extractTextFromImageDataUrl(dataUrl) {
    const Detector = window.TextDetector;
    if (typeof Detector === "function") {
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

        const text = grouped.map((group) => group.parts.join(" ")).join("\n").trim();
        if (text) {
          return text;
        }
      }
    }

    return recognizeImageWithTesseract(dataUrl);
  }


  function pdfOcrLinesFromText(text) {
    const rawLines = String(text || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const total = Math.max(1, rawLines.length);
    return rawLines.map((line, index) => ({
      text: line,
      words: countPdfWords(line),
      relativeY: Math.max(0.04, Math.min(0.96, (index + 0.5) / total)),
      order: index
    }));
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

  async function renderPdfPageToOcrDataUrl(page, pageNumber) {
    const viewport = page.getViewport({ scale: PDF_OCR_RENDER_SCALE });
    const maxPixels = 3600 * 3600;
    const rawPixels = Math.max(1, Math.round((viewport.width || 1) * (viewport.height || 1)));
    const scaleDown = rawPixels > maxPixels ? Math.sqrt(maxPixels / rawPixels) : 1;
    const finalViewport = scaleDown < 1 ? page.getViewport({ scale: PDF_OCR_RENDER_SCALE * scaleDown }) : viewport;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
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
      scale: PDF_OCR_RENDER_SCALE,
      scaleDown: Math.round(scaleDown * 100) / 100
    });
    const renderTask = page.render({ canvasContext: context, viewport: finalViewport });
    await Promise.race([
      renderTask.promise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error(`Page ${pageNumber} OCR render timed out.`)), PDF_OCR_PAGE_TIMEOUT_MS))
    ]);
    const dataUrl = canvasToOcrDataUrl(canvas);
    emitDebug("pdf:ocr:render:success", {
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      dataUrlBytes: dataUrl.length
    });
    return dataUrl;
  }

  async function extractPdfTextWithPageOcr(sourceUrl, options = {}) {
    const pdfjs = await loadPdfJsModule();
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const startedAt = Date.now();
    const data = await fetchPdfBytesForRecovery(sourceUrl, PDF_FETCH_TIMEOUT_MS);
    const task = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useWorkerFetch: false,
      stopAtErrors: false,
      disableFontFace: true,
      disableStream: true,
      disableAutoFetch: true,
      cMapUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/cmaps/"),
      cMapPacked: true
    });
    const pdf = await Promise.race([
      task.promise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("PDF OCR document load timed out.")), PDF_FETCH_TIMEOUT_MS + 4000))
    ]);
    const numPages = Number(pdf && pdf.numPages || 0);
    const pageLimit = Math.min(numPages, PDF_OCR_MAX_PAGES);
    const pages = [];
    let totalWords = 0;
    let pagesRead = 0;
    emitDebug("pdf:ocr:document:loaded", {
      numPages,
      pageLimit,
      note: pageLimit < numPages ? "OCR is capped for speed. Remaining pages can be added by increasing PDF_OCR_MAX_PAGES." : "OCR will attempt every page."
    });
    onProgress({ loaded: 0, total: pageLimit, percent: 10, phase: "ocr" });

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      pagesRead = pageNumber;
      try {
        const page = await pdf.getPage(pageNumber);
        const dataUrl = await renderPdfPageToOcrDataUrl(page, pageNumber);
        emitDebug("pdf:ocr:page:start", { pageNumber });
        const pageText = await Promise.race([
          extractTextFromImageDataUrl(dataUrl),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error(`Page ${pageNumber} OCR recognition timed out.`)), PDF_OCR_PAGE_TIMEOUT_MS))
        ]);
        const cleanText = String(pageText || "")
          .replace(/[^\S\n]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        const words = countPdfWords(cleanText);
        emitDebug("pdf:ocr:page:extract", {
          pageNumber,
          words,
          sample: cleanText.slice(0, 300),
          success: words > 0
        });
        if (cleanText) {
          const lines = pdfOcrLinesFromText(cleanText);
          pages.push({ pageNumber, text: cleanText, words, lines, source: "ocr" });
          totalWords += words;
        }
      } catch (pageError) {
        emitDebug("pdf:ocr:page:error", {
          pageNumber,
          error: String(pageError && pageError.message ? pageError.message : pageError),
          diagnosis: "This page could not be rendered or recognized. Check canvas rendering, Tesseract/TextDetector loading, page size, or image quality."
        });
      }
      onProgress({
        loaded: pageNumber,
        total: pageLimit,
        percent: Math.min(96, Math.max(12, Math.round(12 + (pageNumber / Math.max(1, pageLimit)) * 84))),
        phase: "ocr"
      });
    }

    const text = pages.map((page) => page.text).join("\n\n").trim();
    emitDebug("pdf:ocr:complete", {
      numPages,
      pagesRead,
      pagesWithText: pages.length,
      words: totalWords,
      durationMs: Date.now() - startedAt,
      partial: numPages > pagesRead
    });
    return {
      pages,
      text,
      numPages,
      pagesRead,
      words: totalWords,
      partial: numPages > pagesRead,
      durationMs: Date.now() - startedAt,
      source: "ocr"
    };
  }

  async function extractPdfTextRecovery(reason, routeKey, options = {}) {
    const sourceUrl = getPdfSourceUrl();
    const allowOcr = Boolean(options.allowOcr);
    const fullText = Boolean(options.fullText);
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    let extraction = { pages: [], text: "", source: "pdfjs" };
    let extractionError = "";
    let extractionErrorKind = "";

    try {
      const fastPass = !allowOcr && !fullText;
      extraction = await extractPdfTextWithPdfJs(sourceUrl, {
        timeoutMs: allowOcr ? Math.max(8000, PDF_TEXT_EXTRACTION_TIMEOUT_MS / 2) : fullText ? PDF_TEXT_EXTRACTION_TIMEOUT_MS : PDF_TEXT_FAST_EXTRACTION_TIMEOUT_MS,
        pageTimeoutMs: allowOcr || fullText ? PDF_TEXT_PAGE_TIMEOUT_MS : PDF_TEXT_FAST_PAGE_TIMEOUT_MS,
        maxPages: allowOcr ? Math.min(PDF_MAX_TEXT_PAGES, PDF_FAST_TEXT_PAGES) : fullText ? PDF_MAX_TEXT_PAGES : PDF_FAST_TEXT_PAGES,
        stopAfterReady: fastPass,
        readyWords: PDF_FAST_READY_WORDS,
        readyPages: PDF_FAST_READY_PAGES,
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
        error: extractionError || "OCR support is unavailable.",
        errorKind: extractionErrorKind || "ocr"
      };
    }

    try {
      onProgress({ loaded: 0, total: PDF_OCR_MAX_PAGES, percent: 8, phase: "ocr" });
      emitDebug("pdf:ocr:fallback:start", {
        reason,
        routeKey,
        extractedWords,
        priorErrorKind: extractionErrorKind || "",
        note: "Selectable PDF text was insufficient, so PagePilot is rendering PDF pages and running OCR."
      });
      const ocrExtraction = await Promise.race([
        extractPdfTextWithPageOcr(sourceUrl, { onProgress }),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("PDF page OCR timed out before producing a section map.")), PDF_OCR_TIMEOUT_MS))
      ]);
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
        partial: Boolean(ocrExtraction && ocrExtraction.partial)
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
        errorKind: ocrText ? "" : (extractionErrorKind || "ocr")
      };
    } catch (ocrError) {
      const errorText = String(ocrError && ocrError.message ? ocrError.message : ocrError);
      emitDebug("pdf:ocr:fallback:error", {
        reason,
        routeKey,
        error: errorText,
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
        errorKind: "ocr"
      };
    }
  }

  function schedulePdfRecoveryAttempt(reason, options = {}) {
    if (!(isPdfRouteLocked() || isPdfLikePage()) || !runtime.model) return;
    const routeKey = getRouteCacheKey();
    const words = Number(runtime.model.totalReadableWords || 0);
    const pageType = runtime.model.pageProfile && runtime.model.pageProfile.type;
    const allowOcr = Boolean(options.allowOcr);
    const force = Boolean(options.force || allowOcr || reason === "manual");
    const alreadyDone = runtime.pdfOcr.completedForRoute === routeKey;
    const alreadyPending = runtime.pdfOcr.pending && runtime.pdfOcr.attemptedForRoute === routeKey;
    const tooSoon = runtime.pdfOcr.lastAttemptAt && Date.now() - runtime.pdfOcr.lastAttemptAt < 3500;
    if (alreadyPending) return;
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
    runtime.pdfOcr.needsPrompt = false;
    runtime.pdfOcr.progress = 0;
    runtime.pdfOcr.source = "";
    runtime.pdfOcr.analysisStartedAt = Date.now();
    runtime.pdfOcr.words = 0;
    runtime.pdfOcr.pages = 0;
    runtime.pdfOcr.partial = false;
    runtime.pdfOcr.state = allowOcr ? "ocr" : "extracting";
    runtime.pdfOcr.supported = supportsPdfOcr();
    runtime.model = buildPdfProcessingModel(
      runtime.model,
      allowOcr ? "Running OCR on the visible PDF page..." : "Reading PDF text...",
      runtime.pdfOcr.state
    );
    render();
    startPdfAnalysisWatchdog(reason, routeKey, allowOcr);

    emitDebug("pdf:analysis:start", {
      reason,
      routeKey,
      supported: runtime.pdfOcr.supported,
      words,
      allowOcr,
      quietReason: runtime.model.pageProfile.quietReason || runtime.model.pageProfile.reason || ""
    });

    extractPdfTextRecovery(reason, routeKey, {
      ...options,
      onProgress: (event) => updatePdfRecoveryProgress(event, allowOcr)
    })
      .then((result) => {
        const text = String(result && result.text ? result.text : "").trim();
        const textWords = countPdfWords(text);
        const source = result && result.source ? result.source : "pdfjs";
        const recoveredPages = normalizePdfRecoveryPages(result && result.pages);

        if (textWords >= PDF_RECOVERY_MIN_WORDS) {
          const cacheEntry = writePdfCacheEntry(routeKey, {
            text,
            pages: recoveredPages,
            updatedAt: Date.now(),
            source,
            partial: Boolean(result && result.partial),
            pagesRead: result && result.pagesRead || 0,
            words: textWords,
            numPages: result && result.numPages || 0
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
          runtime.pdfOcr.state = "ready";
          stopPdfAnalysisWatchdog();
          emitDebug("pdf:analysis:success", {
            reason,
            routeKey,
            source,
            textWords,
            pagesRead: runtime.pdfOcr.pages,
            partial: runtime.pdfOcr.partial
          });
          scanPage(source === "ocr" ? "pdf-ocr" : "pdf-text");
          window.setTimeout(() => emitPdfGoalCheck("pdf:analysis:success"), 120);
          if (!allowOcr && source === "pdfjs" && runtime.pdfOcr.partial) {
            schedulePdfFullTextRefresh(routeKey, reason);
          }
          return;
        }

        if (text) {
          writePdfCacheEntry(routeKey, {
            text,
            pages: recoveredPages,
            updatedAt: Date.now(),
            source,
            partial: Boolean(result && result.partial),
            pagesRead: result && result.pagesRead || 0,
            words: textWords,
            numPages: result && result.numPages || 0
          });
        }

        const errorKind = result && result.errorKind
          ? result.errorKind
          : allowOcr
            ? "ocr"
            : "scanned";
        if (!allowOcr && errorKind !== "fetch" && shouldAutoRunPdfOcr(routeKey)) {
          emitDebug("pdf:auto-ocr:start", {
            reason,
            routeKey,
            errorKind,
            extractedWords: textWords,
            note: "Selectable text was insufficient, so PagePilot is trying OCR automatically."
          });
          runtime.pdfOcr.pending = false;
          runtime.pdfOcr.retrying = false;
          window.setTimeout(() => schedulePdfRecoveryAttempt("auto-ocr", { allowOcr: true, force: true }), PDF_AUTO_OCR_AFTER_MS);
          return;
        }
        if (queuePdfRecoveryRetry(reason, routeKey, options, errorKind, result && result.error)) {
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
        runtime.pdfOcr.state = allowOcr
          ? "ocr-failed"
          : errorKind === "fetch"
            ? "fetch-error"
            : "needs-ocr";
        stopPdfAnalysisWatchdog();
        stopPdfAnalysisWatchdog();
        emitDebug(errorKind === "fetch" ? "pdf:analysis:fetch-error" : allowOcr ? "pdf:analysis:ocr-failed" : "pdf:analysis:needs-ocr", {
          reason,
          routeKey,
          source,
          textWords,
          errorKind,
          rawError: result && result.error ? result.error : "",
          allowOcr
        });

        runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, errorKind === "fetch"
          ? { state: "pdf-error", bestLabel: "PDF access issue", confidenceLabel: "PDF issue" }
          : undefined);
        render();
        window.setTimeout(() => emitPdfGoalCheck("pdf:analysis:terminal"), 120);
      })
      .catch((error) => {
        const message = String(error && error.message ? error.message : error);
        const errorKind = error && error.pdfErrorKind ? error.pdfErrorKind : getPdfErrorKind(error, allowOcr) || (allowOcr ? "ocr" : "fetch");
        if (!allowOcr && errorKind !== "fetch" && shouldAutoRunPdfOcr(routeKey)) {
          emitDebug("pdf:auto-ocr:start", {
            reason,
            routeKey,
            errorKind,
            rawError: message,
            note: "PDF.js text extraction failed or returned too little text, so PagePilot is trying OCR automatically."
          });
          runtime.pdfOcr.pending = false;
          runtime.pdfOcr.retrying = false;
          window.setTimeout(() => schedulePdfRecoveryAttempt("auto-ocr", { allowOcr: true, force: true }), PDF_AUTO_OCR_AFTER_MS);
          return;
        }
        if (queuePdfRecoveryRetry(reason, routeKey, options, errorKind, message)) {
          return;
        }
        window.clearTimeout(runtime.pdfOcr.retryTimer);
        runtime.pdfOcr.pending = false;
        runtime.pdfOcr.retrying = false;
        runtime.pdfOcr.retryTimer = null;
        runtime.pdfOcr.lastError = publicPdfErrorMessage(errorKind, allowOcr);
        runtime.pdfOcr.errorKind = errorKind;
        runtime.pdfOcr.needsPrompt = errorKind !== "fetch";
        runtime.pdfOcr.progress = 0;
        runtime.pdfOcr.words = 0;
        runtime.pdfOcr.pages = 0;
        runtime.pdfOcr.partial = false;
        runtime.pdfOcr.state = allowOcr
          ? "ocr-failed"
          : errorKind === "fetch"
            ? "fetch-error"
            : "needs-ocr";
        stopPdfAnalysisWatchdog();
        stopPdfAnalysisWatchdog();
        emitDebug("pdf:analysis:error", {
          reason,
          routeKey,
          error: message,
          errorKind,
          allowOcr
        });
        runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, errorKind === "fetch"
          ? { state: "pdf-error", bestLabel: "PDF access issue", confidenceLabel: "PDF issue" }
          : undefined);
        render();
        window.setTimeout(() => emitPdfGoalCheck("pdf:analysis:error"), 120);
      })
      .finally(() => {
        if (runtime.pdfOcr.pending && !runtime.pdfOcr.retrying) {
          runtime.pdfOcr.pending = false;
          render();
        } else if (runtime.pdfOcr.retrying) {
          render();
        }
      });
  }


  function startPdfAnalysisWatchdog(reason, routeKey, allowOcr) {
    stopPdfAnalysisWatchdog();
    runtime.pdfOcr.analysisStartedAt = runtime.pdfOcr.analysisStartedAt || Date.now();
    runtime.pdfOcr.watchdogTimer = window.setTimeout(() => {
      if (!runtime.pdfOcr.pending || getRouteCacheKey() !== routeKey) return;
      const elapsedMs = Date.now() - (runtime.pdfOcr.analysisStartedAt || Date.now());
      runtime.pdfOcr.pending = false;
      runtime.pdfOcr.retrying = false;
      runtime.pdfOcr.retryTimer = null;
      runtime.pdfOcr.lastError = allowOcr
        ? "PDF OCR timed out before it could build a usable map."
        : "PDF text extraction timed out before it could build a usable map.";
      runtime.pdfOcr.errorKind = allowOcr ? "ocr-timeout" : "extract-timeout";
      runtime.pdfOcr.needsPrompt = !allowOcr;
      runtime.pdfOcr.state = allowOcr ? "ocr-failed" : "needs-ocr";
      emitDebug("pdf:analysis:watchdog-timeout", {
        reason,
        routeKey,
        allowOcr,
        elapsedMs,
        hardTimeoutMs: PDF_ANALYSIS_HARD_TIMEOUT_MS,
        diagnosis: allowOcr
          ? "OCR did not finish. Check capture permission, Tesseract loading, image quality, or very large PDF pages."
          : "PDF.js text extraction did not finish. Check file access, PDF.js worker/module loading, damaged/encrypted PDFs, or extremely slow pages."
      });
      if (runtime.model) {
        runtime.model = buildPdfPromptModel(runtime.model, runtime.pdfOcr.lastError, allowOcr
          ? { state: "ocr-prompt", bestLabel: "OCR failed", confidenceLabel: "OCR issue" }
          : { state: "ocr-prompt", bestLabel: "Run OCR", confidenceLabel: "Needs OCR" });
        render();
      }
      emitPdfGoalCheck("pdf:analysis:watchdog-timeout", { force: true });
    }, PDF_ANALYSIS_HARD_TIMEOUT_MS);
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
      && Date.now() - runtime.pdfOcr.analysisStartedAt > PDF_ANALYSIS_HARD_TIMEOUT_MS
    );
  }

  function shouldAutoRunPdfOcr(routeKey) {
    if (!routeKey) return false;
    if (runtime.pdfOcr.autoOcrAttemptedForRoute === routeKey) return false;
    if (!supportsPdfOcr()) return false;
    runtime.pdfOcr.autoOcrAttemptedForRoute = routeKey;
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
    const pdfReady = sections.length >= 1 && words >= PDF_RECOVERY_MIN_WORDS && !pending && !retrying;
    const textGoal = words >= PDF_RECOVERY_MIN_WORDS;
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
      sectionMapBuilt: sectionGoal ? "OK" : "No PagePilot sections exist yet, so the sidebar/page map and navigation targets cannot be built.",
      importantSectionsRanked: importantGoal ? "OK" : "No important section was ranked. This normally happens when sectionMapBuilt is false or all sections are too short/low-signal.",
      pageNumbersKnown: pageMapGoal ? "OK" : "Sections do not have pageNumber metadata, so PDF page jumping cannot be precise.",
      jumpTargetAvailable: jumpGoal ? "OK" : "No safe DOM anchor or page-number fallback is available for the best section.",
      highlightTargetAvailable: highlightGoal ? "OK" : "PagePilot can only highlight PDFs using a text-layer/page anchor or its own page marker fallback.",
      keyboardShortcutsAttached: keyboardGoal ? "OK" : "Keyboard listener did not attach.",
      fileAccessAllowed: fileAccessGoal ? "OK" : "Chrome reports file access is disabled for PagePilot. Enable Allow access to file URLs on chrome://extensions.",
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
      || errorKind !== "fetch"
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
    runtime.model = buildPdfProcessingModel(runtime.model, "Reading PDF text...", "extracting");
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
          numPages: result && result.numPages || 0
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
        runtime.pdfOcr.state = "ready";
        emitDebug("pdf:full-text:success", {
          routeKey,
          textWords,
          pagesRead: runtime.pdfOcr.pages,
          partial: runtime.pdfOcr.partial
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

  function updatePdfRecoveryProgress(event, allowOcr) {
    const progress = event && Number.isFinite(event.percent)
      ? Math.max(0, Math.min(100, Math.round(event.percent)))
      : runtime.pdfOcr.progress || 0;
    const phase = event && event.phase === "ocr" || allowOcr ? "ocr" : "extracting";
    runtime.pdfOcr.progress = progress;
    runtime.pdfOcr.state = phase;

    const now = Date.now();
    if (progress < 100 && now - (runtime.pdfOcr.lastProgressRenderedAt || 0) < 250) {
      return;
    }
    runtime.pdfOcr.lastProgressRenderedAt = now;
    if (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf") {
      const prompt = phase === "ocr"
        ? progress ? `Running OCR... ${progress}%` : "Running OCR..."
        : progress ? `Reading PDF text... ${progress}%` : "Reading PDF text...";
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

  function handleMessage(message, sender, sendResponse) {
    if (!message || typeof message !== "object") {
      return false;
    }

    if (message.type === "PAGEPILOT_TOGGLE") {
      setMode(typeof message.open === "boolean" && message.open ? "open" : modeForClosedState(), { focus: Boolean(message.open), persist: true });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_SCAN") {
      scanPage("popup");
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_JUMP_USEFUL") {
      setMode("open", { focus: true, persist: true });
      jumpToUsefulPart();
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_NEXT_IMPORTANT") {
      setMode("open", { focus: true, persist: true });
      jumpToNextImportant();
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_STATUS") {
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
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_RUN_PDF_OCR") {
      if (runtime.pdfOcr && runtime.pdfOcr.attemptedForRoute === getRouteCacheKey()) {
        runtime.pdfOcr.completedForRoute = "";
      }
      schedulePdfRecoveryAttempt("manual", { allowOcr: true, force: true });
      sendResponse(getPublicStats());
      return true;
    }

    return false;
  }

  function watchPageChanges() {
    runtime.mutationObserver = new MutationObserver((mutations) => {
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
    stopPdfAnalysisWatchdog();
    runtime.pdfJumpMode = "";
    runtime.pendingPdfControlledJump = null;
    closePagePilotPdfModeConsentDialog(false);
    clearPagePilotPdfModeNotice();
    if (window.__PAGEPILOT_PDF_OCR_CACHE__) {
      window.__PAGEPILOT_PDF_OCR_CACHE__ = Object.create(null);
    }
    if (isPdfLikePage()) {
      hydratePdfSessionCache();
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
      && mutation.target.closest("#pagepilot-pdf-controlled-viewer, .pagepilot-pdf-mode-consent, .pagepilot-pdf-mode-notice")
    ) {
      return false;
    }

    const targetElement = mutation.target && mutation.target.nodeType === Node.TEXT_NODE
      ? mutation.target.parentElement
      : mutation.target;
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
      if (element.matches && element.matches("#pagepilot-pdf-controlled-viewer, .pagepilot-pdf-mode-consent, .pagepilot-pdf-mode-notice")) return false;
      if (element.closest && element.closest("#pagepilot-pdf-controlled-viewer, .pagepilot-pdf-mode-consent, .pagepilot-pdf-mode-notice")) return false;
      if (runtime.engine.helpers.isLowValueElement(element)) return false;
      const text = runtime.engine.helpers.cleanText(element.innerText || element.textContent || "");
      const words = runtime.engine.helpers.countWords(text);
      if ((isChatLikePage() || elementLooksConversationLike(element)) && words >= 3) {
        return true;
      }
      if ((isPdfLikePage() || elementLooksPdfLike(element)) && words >= 4) {
        return true;
      }
      if (words < 32) return false;
      return !/\b(cookie|subscribe|newsletter|advertisement|sponsored|sign up)\b/i.test(text.slice(0, 1200));
    });
  }

  function scheduleScan(reason) {
    window.clearTimeout(runtime.scanTimer);
    const elapsed = Date.now() - runtime.lastScanAt;
    const fastScan = isChatLikePage()
      || isPdfLikePage()
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
    const delays = isChatLikePage() || isPdfLikePage()
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
    return isKnownAiHost()
      || isPdfLikePage()
      || (runtime.model && ["chat", "pdf"].includes(runtime.model.pageProfile.type))
      || Boolean(document.querySelector(".textLayer, [data-page-number], pdf-viewer, embed[type='application/pdf'], iframe[src*='.pdf']"));
  }

  function isChatLikePage() {
    return isKnownAiHost()
      || Boolean(runtime.model && runtime.model.pageProfile.type === "chat")
      || Boolean(document.querySelector("[data-message-author-role], [data-testid*='conversation'], [data-testid*='chat-message'], [class*='conversation' i] [class*='message' i], [class*='chat' i] [class*='message' i]"));
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
    return /\b(conversation|chat|message|assistant|user|prompt|response|answer|reply|markdown|prose)\b/i.test(trail)
      || Boolean(element.closest("[data-message-author-role], [data-testid*='conversation'], [data-testid*='chat-message'], [data-testid*='message'], [aria-label*='assistant' i], [aria-label*='user' i], [class*='conversation' i], [class*='chat' i]"));
  }

  function elementLooksPdfLike(element) {
    if (!element || !(element instanceof Element)) return false;
    return Boolean(element.closest(".textLayer, [data-page-number], .page, #viewer, pdf-viewer"))
      || /\b(textLayer|page|pdf|viewer)\b/i.test(`${element.id || ""} ${element.className || ""}`);
  }

  function jumpToUsefulPart() {
    if (!runtime.model || !runtime.model.hasStrongTarget) {
      return false;
    }

    const targetId = runtime.model.bestSectionId || runtime.model.skipTargetId || runtime.model.nextImportantId;
    return scrollToSection(targetId, { highlight: true });
  }

  function jumpToNextImportant() {
    if (hasSyntheticPdfSections()) {
      refreshActivePdfSection();
      if (!runtime.model || runtime.model.pageProfile.quietMode) return false;
      const pdfTarget = getNextPdfImportantSection()
        || getFirstPdfImportantSection()
        || runtime.model.importantSections.find((section) => isSyntheticPdfSection(section) && section.id !== runtime.view.activeId);
      return scrollToSection(pdfTarget && pdfTarget.id, { highlight: true });
    }
    refreshActiveSection();
    if (!runtime.model || runtime.model.pageProfile.quietMode) return false;
    const targetId = runtime.model.nextImportantId
      || runtime.model.importantSections.find((section) => section.id !== runtime.view.activeId)?.id;
    return scrollToSection(targetId, { highlight: true });
  }

  function scrollToSection(id, options) {
    const section = runtime.model && runtime.model.sections.find((item) => item.id === id);
    if (!section || !section.anchor) {
      return false;
    }

    clearJumpEffect();
    const isPdf = Boolean(runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf");
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

  function performPdfSyntheticJump(section, options) {
    const pageNumber = getPdfSectionPageNumber(section);
    if (!pageNumber) {
      emitDebug("pdf:jump:unsafe", {
        sectionId: section && section.id,
        anchorTag: section && section.anchor && section.anchor.tagName ? section.anchor.tagName.toLowerCase() : ""
      });
      return false;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPdfActiveTarget(section, pageNumber);

    const pageElementScrolled = scrollPdfPageElementToSection(section, pageNumber, prefersReducedMotion);
    const chromeViewerNavigated = pageElementScrolled ? false : navigateChromePdfViewerPage(pageNumber);
    const selectorNavigated = pageElementScrolled || chromeViewerNavigated ? false : commitPdfPageSelector(pageNumber);
    const scrolled = pageElementScrolled || chromeViewerNavigated || selectorNavigated
      ? false
      : scrollPdfViewerApproximately(pageNumber, prefersReducedMotion);
    const hardNavigated = pageElementScrolled || chromeViewerNavigated || selectorNavigated || scrolled
      ? false
      : navigatePdfPageHard(section, pageNumber);
    const hashNavigated = pageElementScrolled || chromeViewerNavigated || selectorNavigated || scrolled || hardNavigated
      ? false
      : navigatePdfPageByHash(pageNumber);
    const pdfJumpMode = pageElementScrolled
      ? "page-element"
      : chromeViewerNavigated
        ? "chrome-viewer"
        : selectorNavigated
          ? "page-selector"
          : scrolled
            ? "scroll-ratio"
            : hardNavigated
              ? "hard-page"
              : hashNavigated
                ? "hash-page"
                : "";

    if (!pdfJumpMode) {
      emitDebug("pdf:jump:failed", {
        sectionId: section.id,
        pageNumber,
        pageElementScrolled,
        hashNavigated,
        chromeViewerNavigated,
        selectorNavigated,
        scrolled,
        hardNavigated
      });
      runtime.pdfJumpMode = "";
      return false;
    }

    setPdfActiveTarget(section, pageNumber, pdfJumpMode);
    if (expandAncestors(section.id)) {
      render();
    } else if (runtime.ui) {
      runtime.ui.updateActiveClasses(runtime.view.activeId);
    }

    if (options && options.highlight) {
      showPdfSectionHighlight(section, pageNumber, { mode: pdfJumpMode, immediate: pageElementScrolled });
    }

    window.setTimeout(() => verifyPdfJumpResult(section, pageNumber, pdfJumpMode), prefersReducedMotion ? 120 : 720);

    emitDebug("pdf:jump:fallback", {
      sectionId: section.id,
      pageNumber,
      pdfJumpMode,
      pageElementScrolled,
      hashNavigated,
      chromeViewerNavigated,
      selectorNavigated,
      scrolled,
      hardNavigated
    });
    return true;
  }

  function scrollPdfPageElementToSection(section, pageNumber, prefersReducedMotion) {
    const page = findPdfPageElement(pageNumber);
    if (!page || typeof page.scrollIntoView !== "function") return false;
    const relativeY = getPdfSectionRelativeY(section);
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
        note: "Hash was requested only as a last-resort soft jump; PagePilot no longer treats this as success unless the viewer exposes the target page."
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
      overlay.style.setProperty("--pagepilot-pdf-highlight-top", `${Math.round(getPdfSectionRelativeY(section) * 100)}%`);
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
        relativeY: getPdfSectionRelativeY(section)
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

  function getPdfSectionRelativeY(section) {
    const value = section && section.unitMeta && Number(section.unitMeta.relativeY);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.14;
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

  function hasSyntheticPdfSections() {
    return Boolean(
      runtime.model
      && runtime.model.pageProfile
      && runtime.model.pageProfile.type === "pdf"
      && Array.isArray(runtime.model.sections)
      && runtime.model.sections.some((section) => isSyntheticPdfSection(section))
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
      .filter((section) => isSyntheticPdfSection(section))
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
      .filter((section) => isSyntheticPdfSection(section))
      .sort((a, b) => getPdfSectionOrder(a) - getPdfSectionOrder(b))[0] || null;
  }

  function refreshActivePdfSection() {
    if (!runtime.model || !hasSyntheticPdfSections()) return false;
    const sections = runtime.model.sections
      .filter((section) => isSyntheticPdfSection(section))
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
    const relativeY = getPdfSectionRelativeY(section);
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
      exactIssue: "PagePilot showed its own highlight/focus overlay because Chrome may not expose the PDF page DOM. This is the reliable fallback highlight surface."
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
    if (!isPdfLikePage()) return;
    hydratePdfSessionCache();
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

  function getPublicStats() {
    const model = runtime.model;
    if (!model) {
      return { ok: false, error: "PagePilot is still starting." };
    }
    const pdfRouteLocked = isPdfRouteLocked();
    const bestSection = model.sections.find((section) => section.id === model.bestSectionId) || null;
    if (hasSyntheticPdfSections()) {
      refreshActivePdfSection();
    }
    const pdfNextImportant = hasSyntheticPdfSections() ? getNextPdfImportantSection() : null;
    const nextImportant = pdfNextImportant || model.sections.find((section) => section.id === model.nextImportantId) || null;
    const pdfPending = Boolean(runtime.pdfOcr && runtime.pdfOcr.pending);
    const pdfRetrying = Boolean(runtime.pdfOcr && runtime.pdfOcr.retrying);
    const pdfState = runtime.pdfOcr && runtime.pdfOcr.state ? runtime.pdfOcr.state : "";
    const pdfProgress = runtime.pdfOcr && Number.isFinite(runtime.pdfOcr.progress) ? runtime.pdfOcr.progress : 0;
    const pdfErrorKind = runtime.pdfOcr && runtime.pdfOcr.errorKind ? runtime.pdfOcr.errorKind : "";
    const pdfReady = Boolean(
      (model.pageProfile.type === "pdf" || pdfRouteLocked)
      && model.sections.length >= 1
      && Number(model.totalReadableWords || 0) >= PDF_RECOVERY_MIN_WORDS
      && !pdfPending
    );
    const quietMode = pdfRouteLocked || pdfReady ? false : model.pageProfile.quietMode;
    const needsPdfOcr = Boolean(
      (model.pageProfile.type === "pdf" || pdfRouteLocked)
      && !pdfReady
      && (
        model.pageProfile.state === "ocr-prompt"
        || runtime.pdfOcr && runtime.pdfOcr.needsPrompt
        || pdfState === "needs-ocr"
        || pdfState === "ocr-failed"
      )
      && !pdfPending
      && !pdfRetrying
      && pdfErrorKind !== "fetch"
    );
    const pdfTerminalState = Boolean(
      pdfRouteLocked
      && !pdfReady
      && (
        pdfErrorKind === "fetch"
        || pdfErrorKind === "extract-timeout"
        || pdfErrorKind === "ocr-timeout"
        || needsPdfOcr
        || model.pageProfile.state === "pdf-error"
        || model.pageProfile.state === "ocr-prompt"
      )
    );
    const loading = Boolean(
      (model.pageProfile.state === "loading" && !pdfReady)
      || pdfPending
      || pdfRetrying
      || (pdfRouteLocked && !pdfReady && !pdfTerminalState)
    );
    const pdfJumpReady = model.pageProfile.type === "pdf" || pdfRouteLocked ? canJumpToSection(bestSection) : true;

    const shortPage = !pdfReady && (
      model.totalReadableWords < window.PagePilotEngine.constants.MIN_USEFUL_WORDS
      || (model.sections.length < 2 && !model.hasStrongTarget)
    );

    return {
      ok: true,
      open: runtime.view.mode === "open",
      mode: runtime.view.mode,
      hiddenOnPage: runtime.view.mode === "snoozed",
      snoozed: runtime.view.mode === "snoozed",
      sections: model.sections.length,
      important: model.importantSections.length,
      words: model.totalReadableWords,
      shortPage,
      quietMode,
      pageType: pdfRouteLocked ? "pdf" : model.pageProfile.type,
      pageLabel: pdfRouteLocked ? "PDF" : model.pageProfile.label,
      readingConfidence: model.pageProfile.readingConfidence,
      confidence: model.confidence,
      confidenceTier: model.confidenceTier,
      confidenceLabel: model.confidenceLabel,
      hasStrongTarget: model.hasStrongTarget,
      loading,
      pdfPending,
      pdfRetrying,
      pdfState,
      pdfProgress,
      needsPdfOcr,
      pdfError: runtime.pdfOcr && runtime.pdfOcr.lastError ? runtime.pdfOcr.lastError : "",
      pdfErrorKind,
      pdfAccessAllowed: runtime.pdfAccessAllowed,
      pdfSource: runtime.pdfOcr && runtime.pdfOcr.source ? runtime.pdfOcr.source : "",
      pdfReady,
      pdfJumpReady,
      pdfJumpMode: runtime.pdfJumpMode || "",
      pdfActivePage: runtime.pdfActivePage || getCurrentPdfPageFromUrl() || 0,
      pdfActiveSectionId: runtime.view.activeId || "",
      pdfRecoveredWords: runtime.pdfOcr && runtime.pdfOcr.words ? runtime.pdfOcr.words : pdfReady ? model.totalReadableWords : 0,
      pdfRecoveredPages: runtime.pdfOcr && runtime.pdfOcr.pages ? runtime.pdfOcr.pages : 0,
      pdfPartial: Boolean(runtime.pdfOcr && runtime.pdfOcr.partial),
      canJump: Boolean(bestSection && model.hasStrongTarget && !quietMode && !loading && canJumpToSection(bestSection)),
      canJumpNext: Boolean(nextImportant && !quietMode && !loading && canJumpToSection(nextImportant)),
      nextImportantTitle: nextImportant ? nextImportant.title : "",
      bestTitle: bestSection && model.hasStrongTarget ? bestSection.title : "",
      bestReason: bestSection && model.hasStrongTarget ? reasonForPublicSection(bestSection) : model.pageProfile.reason,
      quietReason: model.pageProfile.quietReason || model.pageProfile.reason || "",
      archetype: model.pageProfile.type,
      bestLabel: loading ? "Scanning" : pdfRouteLocked && quietMode ? "PDF map" : model.bestLabel,
      bestKind: model.bestKind || "",
      targetConfidenceReason: model.targetConfidenceReason || "",
      savedMinutes: model.savedMinutes
    };
  }

  function reasonForPublicSection(section) {
    if (section.metrics.matched.finalCode) return "Last substantial code block";
    if (section.unitMeta && section.unitMeta.hasRevision) return "Looks like the latest corrected answer";
    if (section.metrics.matched.completeCode) return "Looks like complete, usable code";
    if (section.metrics.matched.conciseAnswer) return "Opens with a concise answer";
    if (section.metrics.matched.summary) return "Summarizes the useful parts";
    if (section.metrics.matched.procedure) return "Contains step-by-step guidance";
    if (section.metrics.matched.directAction) return "Gives direct next actions";
    if (section.metrics.matched.codeExplanation || section.metrics.codeBlocks > 0) return "Includes a practical example";
    if (section.metrics.matched.answer) return "Has a direct answer signal";
    if (section.metrics.matched.recommendation) return "Uses recommendation language";
    return "Looks like the most useful section";
  }

  function canJumpToSection(section) {
    if (!section || !section.anchor) return false;
    if (!(runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "pdf")) {
      return true;
    }
    return Boolean(isSafePdfJumpAnchor(resolvePdfScrollAnchor(section)) || getPdfSectionPageNumber(section));
  }

  function uniqueElements(elements) {
    return elements.filter((element, index, list) => element && element.classList && list.indexOf(element) === index);
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.local) {
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
        if (!chrome || !chrome.storage || !chrome.storage.local) {
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
        if (!chrome || !chrome.storage || !chrome.storage.local) {
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

  function requestPagePilotPdfModeConsent(section, pageNumber, routeKey) {
    return new Promise((resolve) => {
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
            <strong id="pagepilot-pdf-mode-consent-title">Open PagePilot PDF Mode?</strong>
            <p>PagePilot needs to render this PDF locally so it can scroll to and highlight the section you chose.</p>
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
          rememberPagePilotPdfModeConsent(routeKey).then(() => finish(true));
        });
      }
      if (decline) {
        decline.addEventListener("click", () => finish(false));
      }
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      });
      document.documentElement.appendChild(dialog);
      runtime.pdfModeConsentDialog = { element: dialog, resolve };
      runtime.pdfJumpMode = "awaiting-pdf-mode-consent";
      emitDebug("pdf:controlled-viewer:consent-shown", {
        routeKey,
        sectionId: section && section.id,
        pageNumber,
        exactIssue: "none"
      });
      window.setTimeout(() => {
        if (accept && accept.focus) accept.focus({ preventScroll: true });
      }, 0);
    });
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


  /* PagePilot-owned PDF viewer mode.
     Chrome's built-in PDF viewer often hides its real scroll/page DOM from extensions.
     This viewer renders the PDF with PDF.js inside PagePilot's own DOM so section jumps
     can use a real smooth-scroll container and a real page-attached highlight layer. */
  function requestPagePilotControlledPdfJump(section, pageNumber, options = {}, fallbackContext = {}) {
    const routeKey = getPdfDocumentRouteKey();
    if (!section || !pageNumber || !routeKey || !isPdfRouteLocked()) {
      return false;
    }

    const request = {
      token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sectionId: section.id,
      pageNumber,
      routeKey
    };
    runtime.pendingPdfControlledJump = request;

    hasPagePilotPdfModeConsent(routeKey)
      .then((allowed) => {
        if (runtime.pendingPdfControlledJump !== request) return;
        if (allowed) {
          continuePagePilotControlledPdfJump(section, pageNumber, options, fallbackContext, "stored-consent");
          return;
        }
        requestPagePilotPdfModeConsent(section, pageNumber, routeKey).then((confirmed) => {
          if (runtime.pendingPdfControlledJump !== request) return;
          if (!confirmed) {
            runtime.pendingPdfControlledJump = null;
            runtime.pdfJumpMode = "pdf-mode-declined";
            showPagePilotPdfModeNotice("PagePilot PDF Mode is needed to scroll to and highlight PDF sections precisely.");
            emitDebug("pdf:controlled-viewer:consent-declined", {
              routeKey,
              sectionId: section && section.id,
              pageNumber,
              exactIssue: "User declined PagePilot PDF Mode, so the PDF jump was cancelled without moving the document."
            });
            return;
          }
          continuePagePilotControlledPdfJump(section, pageNumber, options, fallbackContext, "new-consent");
        });
      })
      .catch((error) => {
        if (runtime.pendingPdfControlledJump !== request) return;
        emitDebug("pdf:controlled-viewer:consent-error", {
          routeKey,
          sectionId: section && section.id,
          pageNumber,
          error: String(error && error.message ? error.message : error),
          exactIssue: "PagePilot could not read stored PDF Mode consent, so it asked again."
        });
        requestPagePilotPdfModeConsent(section, pageNumber, routeKey).then((confirmed) => {
          if (runtime.pendingPdfControlledJump !== request) return;
          if (confirmed) {
            continuePagePilotControlledPdfJump(section, pageNumber, options, fallbackContext, "new-consent-after-error");
          } else {
            runtime.pendingPdfControlledJump = null;
            runtime.pdfJumpMode = "pdf-mode-declined";
            showPagePilotPdfModeNotice("PagePilot PDF Mode is needed to scroll to and highlight PDF sections precisely.");
          }
        });
      });

    return true;
  }

  function continuePagePilotControlledPdfJump(section, pageNumber, options, fallbackContext, consentSource) {
    runtime.pendingPdfControlledJump = null;
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
        exactIssue: "PagePilot could not create its owned PDF viewer DOM. This should be rare; check for CSP/DOM insertion errors."
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
      relativeY: getPdfSectionRelativeY(section),
      highlight: true,
      requestedAt: Date.now()
    };
    updatePagePilotControlledPdfStatus(`Opening PagePilot PDF mode · target page ${pageNumber}`);
    showPagePilotControlledPdfLoading(pageNumber);

    const renderPromise = ensurePagePilotControlledPdfRendered(routeKey, pageNumber);
    renderPromise
      .then(() => {
        const latest = viewer.pendingTarget && viewer.pendingTarget.token === jumpToken
          ? viewer.pendingTarget
          : viewer.pendingTarget || { sectionId: section.id, pageNumber, chunkIndex: getPdfSectionChunkIndex(section) };
        const latestSection = findPdfSectionFromTarget(latest) || section;
        const latestPage = Number(latest && latest.pageNumber) || pageNumber;
        scrollPagePilotControlledPdfToSection(latestSection, latestPage, {
          highlight: true,
          reason: latestSection.id === section.id ? "jump-command" : "latest-command-after-render"
        });
      })
      .catch((error) => {
        const message = String(error && error.message ? error.message : error);
        runtime.pdfControlledViewer.lastError = message;
        updatePagePilotControlledPdfStatus("PagePilot PDF mode could not render this PDF.");
        emitDebug("pdf:controlled-viewer:error", {
          sectionId: section && section.id,
          pageNumber,
          routeKey,
          error: message,
          exactIssue: "PagePilot could not render the PDF in its owned viewer. It will fall back to Chrome's page anchor, but smooth scrolling/exact overlay highlighting will be limited."
        });
        try {
          navigatePdfPageHard(section, pageNumber) || navigatePdfPageByHash(pageNumber);
          showPdfJumpMarker(section, pageNumber, { persist: true, mode: "controlled-viewer-render-failed" });
        } catch (fallbackError) {
          emitDebug("pdf:controlled-viewer:fallback-error", {
            sectionId: section && section.id,
            pageNumber,
            error: String(fallbackError && fallbackError.message ? fallbackError.message : fallbackError),
            exactIssue: "Both PagePilot-owned PDF rendering and Chrome page-anchor fallback failed."
          });
        }
      });

    emitDebug("pdf:controlled-viewer:start", {
      sectionId: section && section.id,
      pageNumber,
      routeKey,
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
          <strong>PagePilot PDF Mode</strong>
          <span data-pp-pdf-status>Preparing PDF…</span>
        </div>
        <div class="pagepilot-pdf-controlled-actions">
          <button type="button" data-pp-pdf-open-native title="Use Chrome's native PDF view">Native PDF</button>
          <button type="button" data-pp-pdf-close title="Hide PagePilot PDF mode">Close</button>
        </div>
      </div>
      <div class="pagepilot-pdf-controlled-scroll" data-pp-pdf-scroll tabindex="0" role="document" aria-label="PagePilot rendered PDF pages"></div>
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
          exactIssue: "none; the next PDF jump command will reopen PagePilot PDF Mode and focus the requested section"
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
      lastError: "",
      visible: false,
      closedByUser: false,
      pendingTarget: null,
      activeHighlightSectionId: ""
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
    viewer.scroll.innerHTML = `<div class="pagepilot-controlled-pdf-loading"><strong>Opening PagePilot PDF Mode…</strong><p>Going to page ${Number(pageNumber) || ""}. PagePilot will scroll to the chosen important section and highlight only that current target.</p></div>`;
  }

  function ensurePagePilotControlledPdfRendered(routeKey, targetPageNumber = 1) {
    const viewer = runtime.pdfControlledViewer || ensurePagePilotControlledPdfViewer();
    if (viewer.ready && viewer.routeKey === routeKey && viewer.pages && viewer.pages.size) {
      const targetNumber = Number(targetPageNumber) || 1;
      const existingTarget = viewer.pages.get(targetNumber);
      if (!existingTarget || existingTarget.dataset.rendered === "true") {
        return Promise.resolve(viewer);
      }
      if (viewer.doc) {
        return renderPagePilotControlledPdfPage(viewer.doc, viewer, targetNumber).then(() => viewer);
      }
    }
    if (viewer.rendering && viewer.renderPromise && viewer.routeKey === routeKey) {
      return viewer.renderPromise;
    }
    viewer.rendering = true;
    viewer.ready = false;
    viewer.routeKey = routeKey;
    viewer.sourceUrl = getPdfSourceUrl();
    viewer.pages = new Map();
    viewer.highlights = [];
    viewer.activeHighlightSectionId = "";
    viewer.lastError = "";
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
    const sourceUrl = getPdfSourceUrl();
    const pdfjs = await loadPdfJsModule();
    let data = null;
    try {
      data = await fetchArrayBufferWithTimeout(sourceUrl, PDF_FETCH_TIMEOUT_MS, PDF_MAX_BYTES);
    } catch (contentError) {
      emitDebug("pdf:controlled-viewer:fetch-content-error", {
        routeKey,
        sourceUrl,
        error: String(contentError && contentError.message ? contentError.message : contentError),
        exactIssue: "Content-script PDF fetch failed; PagePilot is trying the background service worker fetch fallback."
      });
      data = await fetchPdfBytesFromBackground(sourceUrl);
    }
    if (!data || !data.byteLength) {
      throw new Error("PDF bytes were empty, so PagePilot PDF mode cannot render pages.");
    }

    const task = pdfjs.getDocument({
      data: data.slice ? data.slice(0) : data,
      isEvalSupported: false,
      useWorkerFetch: false,
      stopAtErrors: false,
      disableFontFace: true,
      disableStream: true,
      disableAutoFetch: true,
      cMapUrl: chrome.runtime.getURL("node_modules/pdfjs-dist/cmaps/"),
      cMapPacked: true
    });
    const pdf = await task.promise;
    viewer.doc = pdf;
    const pageCount = Number(pdf.numPages || 0);
    if (!pageCount) throw new Error("PDF.js loaded the document but reported zero pages.");

    viewer.scroll.innerHTML = "";
    updatePagePilotControlledPdfStatus(`Rendering ${pageCount} page${pageCount === 1 ? "" : "s"}…`);
    emitDebug("pdf:controlled-viewer:document-loaded", {
      routeKey,
      sourceUrl,
      bytes: data.byteLength || 0,
      pages: pageCount,
      exactIssue: "none"
    });

    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pageHost = document.createElement("section");
      pageHost.className = "pagepilot-controlled-pdf-page";
      pageHost.dataset.pageNumber = String(pageNumber);
      pageHost.id = `pagepilot-controlled-pdf-page-${pageNumber}`;
      pageHost.innerHTML = `<div class="pagepilot-controlled-pdf-page-label">Page ${pageNumber}</div>`;
      fragment.appendChild(pageHost);
      viewer.pages.set(pageNumber, pageHost);
    }
    viewer.scroll.appendChild(fragment);

    // Render the requested target page first, then fill in the rest in the background.
    // This makes Alt/Option+J and Alt/Option+N feel immediate even on long PDFs.
    const firstPage = Math.max(1, Math.min(pageCount, Number(targetPageNumber) || 1));
    await renderPagePilotControlledPdfPage(pdf, viewer, firstPage);
    updatePagePilotControlledPdfStatus(`Target page ${firstPage} ready · rendering remaining pages…`);
    window.setTimeout(async () => {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (pageNumber === firstPage) continue;
        const pageHost = viewer.pages && viewer.pages.get(pageNumber);
        if (pageHost && pageHost.dataset.rendered === "true") continue;
        await renderPagePilotControlledPdfPage(pdf, viewer, pageNumber);
        updatePagePilotControlledPdfStatus(`Ready · rendered page ${pageNumber} of ${pageCount}`);
      }
      updatePagePilotControlledPdfStatus(`Ready · ${pageCount} page${pageCount === 1 ? "" : "s"} rendered`);
      emitDebug("pdf:controlled-viewer:background-render-complete", {
        routeKey,
        pagesRendered: viewer.pages ? viewer.pages.size : 0,
        exactIssue: "none"
      });
    }, 0);
  }

  async function renderPagePilotControlledPdfPage(pdf, viewer, pageNumber) {
    const pageHost = viewer.pages && viewer.pages.get(pageNumber);
    if (!pageHost) return;
    try {
      const page = await pdf.getPage(pageNumber);
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
      pageHost.appendChild(canvas);
      await page.render({ canvasContext: context, viewport: finalViewport }).promise;
      pageHost.dataset.rendered = "true";
      emitDebug("pdf:controlled-viewer:page-rendered", {
        pageNumber,
        width: canvas.width,
        height: canvas.height,
        exactIssue: "none"
      });
    } catch (error) {
      pageHost.dataset.renderError = String(error && error.message ? error.message : error);
      emitDebug("pdf:controlled-viewer:page-render-error", {
        pageNumber,
        error: String(error && error.message ? error.message : error),
        exactIssue: "PDF.js could not render this page into PagePilot's controlled viewer."
      });
    }
  }

  function scrollPagePilotControlledPdfToSection(section, pageNumber, options = {}) {
    const viewer = runtime.pdfControlledViewer;
    const pageHost = viewer && viewer.pages && viewer.pages.get(Number(pageNumber));
    if (!viewer || !viewer.root || !viewer.scroll || !pageHost) {
      emitDebug("pdf:controlled-viewer:scroll-blocked", {
        sectionId: section && section.id,
        pageNumber,
        exactIssue: "The PagePilot PDF viewer exists, but the target page has not been rendered/found in its owned DOM."
      });
      return false;
    }
    reopenPagePilotControlledPdfViewer(viewer);
    if (pageHost.dataset.rendered !== "true" && viewer.doc) {
      updatePagePilotControlledPdfStatus(`Rendering target page ${pageNumber}…`);
      renderPagePilotControlledPdfPage(viewer.doc, viewer, Number(pageNumber)).then(() => {
        scrollPagePilotControlledPdfToSection(section, pageNumber, { ...options, highlight: true, reason: "target-page-rendered" });
      });
      emitDebug("pdf:controlled-viewer:target-page-rendering", {
        sectionId: section && section.id,
        pageNumber,
        exactIssue: "Target page existed but was not rendered yet; PagePilot is rendering it before scrolling/highlighting."
      });
      return true;
    }

    viewer.pendingTarget = {
      token: viewer.pendingTarget && viewer.pendingTarget.token || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sectionId: section.id,
      pageNumber: Number(pageNumber),
      chunkIndex: getPdfSectionChunkIndex(section),
      relativeY: getPdfSectionRelativeY(section),
      highlight: true,
      requestedAt: Date.now()
    };
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const relativeY = getPdfSectionRelativeY(section);
    const scrollRect = viewer.scroll.getBoundingClientRect();
    const pageRect = pageHost.getBoundingClientRect();
    const topPadding = Math.min(160, Math.round(scrollRect.height * 0.22));
    const sectionOffset = Math.max(0, Math.round(pageHost.offsetHeight * Math.max(0.02, Math.min(0.94, relativeY))));
    const targetTop = Math.max(0, viewer.scroll.scrollTop + (pageRect.top - scrollRect.top) + sectionOffset - topPadding);
    viewer.scroll.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? "auto" : "smooth" });
    setPdfActiveTarget(section, pageNumber, "pagepilot-controlled-viewer");
    if (runtime.ui) runtime.ui.updateActiveClasses(runtime.view.activeId);
    highlightPagePilotControlledPdfSection(section, pageHost, pageNumber, relativeY);
    updatePagePilotControlledPdfStatus(`Focused Page ${pageNumber} · ${String(section.title || "Important section").slice(0, 90)}`);
    emitDebug("pdf:controlled-viewer:scroll", {
      sectionId: section && section.id,
      pageNumber,
      relativeY,
      targetTop,
      currentScrollTop: viewer.scroll.scrollTop,
      reason: options.reason || "jump",
      exactIssue: "none"
    });
    window.setTimeout(() => {
      const rect = pageHost.getBoundingClientRect();
      const visible = rect.bottom > 72 && rect.top < window.innerHeight;
      emitDebug(visible ? "pdf:controlled-viewer:scroll-verified" : "pdf:controlled-viewer:scroll-not-verified", {
        sectionId: section && section.id,
        pageNumber,
        pageTop: Math.round(rect.top),
        pageBottom: Math.round(rect.bottom),
        viewerScrollTop: viewer.scroll.scrollTop,
        exactIssue: visible ? "none" : "PagePilot rendered the PDF, but the target page is still not visible after scrolling the owned container."
      });
    }, prefersReducedMotion ? 100 : 750);
    return true;
  }

  function highlightPagePilotControlledPdfSection(section, pageHost, pageNumber, relativeY) {
    if (!pageHost) return false;
    clearPagePilotControlledPdfHighlights();
    const highlight = document.createElement("div");
    highlight.className = "pagepilot-controlled-pdf-highlight";
    const sectionHeight = Math.max(86, Math.min(260, Math.round(pageHost.offsetHeight * 0.16)));
    const top = Math.max(42, Math.min(Math.max(42, pageHost.offsetHeight - sectionHeight - 24), Math.round(pageHost.offsetHeight * Math.max(0.02, Math.min(0.92, relativeY))) - 18));
    highlight.style.top = `${top}px`;
    highlight.style.height = `${sectionHeight}px`;
    const label = document.createElement("div");
    label.className = "pagepilot-controlled-pdf-highlight-label";
    label.textContent = `Current section - Page ${pageNumber} - ${String(section && section.title || "").slice(0, 96)}`;
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
      relativeY,
      top,
      height: sectionHeight,
      excerpt: getPdfSectionExcerpt(section).slice(0, 220),
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


  /* PagePilot PDF smooth-scroll + diagnostic override.
     Keep normal website navigation untouched; only overrides synthetic PDF jumps. */
  function performPdfSyntheticJump(section, options) {
    const pageNumber = getPdfSectionPageNumber(section);
    if (!pageNumber) {
      emitDebug("pdf:jump:blocked", {
        stage: "metadata",
        blocker: "missing-page-number",
        sectionId: section && section.id,
        exactIssue: "The chosen PDF section has no pageNumber metadata, so PagePilot cannot map it back to a PDF page."
      });
      return false;
    }

    const before = capturePdfNavigationState(pageNumber);

    emitDebug("pdf:jump:start", {
      sectionId: section && section.id,
      pageNumber,
      targetRelativeY: getPdfSectionRelativeY(section),
      before,
      goal: "smooth-scroll-to-pdf-page-and-highlight-section"
    });

    return requestPagePilotControlledPdfJump(section, pageNumber, options || {}, { before });
  }

  function performNativePdfJumpFallback(section, pageNumber, options = {}, context = {}) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const before = context.before || capturePdfNavigationState(pageNumber);
    setPdfActiveTarget(section, pageNumber, "native-fallback-starting");

    // Always show a PagePilot-owned focus overlay first. Chrome's PDF viewer often hides
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
          exactIssue: "Native page highlight was not attempted because no accessible PDF page element was proven. The PagePilot-owned overlay remains visible."
        });
      }
    }

    window.setTimeout(() => verifyPdfJumpResult(section, pageNumber, pdfJumpMode, before, scrollRatioResult), prefersReducedMotion ? 180 : 1150);

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
    const relativeY = getPdfSectionRelativeY(section);
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
    const sectionOffset = Math.max(0, Math.min(0.85, getPdfSectionRelativeY(section) / Math.max(1, totalPages)));
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
        exactIssue: "PagePilot could not attach the highlight to the PDF page because Chrome did not expose a page DOM element. A fixed overlay was shown instead.",
        diagnostics: options.diagnostics || buildPdfNavigationDiagnostics(pageNumber, null, null)
      });
    }, delay);
  }

  function verifyPdfJumpResult(section, pageNumber, mode, beforeState = null, scrollResult = null) {
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
          ? "Chrome accepted page navigation/hash, but did not expose a controllable page DOM for true smooth in-view scrolling or page-attached highlighting. PagePilot used its owned overlay highlight instead."
          : diagnostics.exactIssue
    });
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
        ? "PagePilot found at least one scrollable container, but the post-jump verification did not prove the PDF reached the target page. Inspect scrollCandidates to see which element accepted or rejected scrollTop."
        : current.hasPageElement
          ? "A target page element exists, but PagePilot could not verify that it became visible after scrolling."
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
    window.clearInterval(runtime.urlWatchTimer);
    clearJumpEffect();
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
    window.__PAGEPILOT_LOADED__ = false;
  }
})();
