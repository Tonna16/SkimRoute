(function () {
  "use strict";

  const ROOT_ID = "pagepilot-root";
  const SKIMROUTE_CONTENT_VERSION = "1.4.2-core";
  const MUTATION_SCAN_DELAY_MS = 520;
  const FAST_RESCAN_INTERVAL_MS = 360;
  const URL_WATCH_INTERVAL_MS = 1200;
  const WARMUP_SCAN_DELAYS_MS = [700, 1800, 3600, 7200, 12000];
  const CHAT_WARMUP_SCAN_DELAYS_MS = [120, 320, 700, 1400, 2800, 5200, 8200];
  const JUMP_EFFECT_DURATION_MS = 4200;
  const JUMP_EFFECT_SCROLL_LOCK_MS = 1200;
  const SNOOZE_TTL_MS = 2 * 60 * 60 * 1000;
  const VIEW_MODES = new Set(["open", "minimized", "quiet", "snoozed"]);
  const STORAGE_KEYS = {
    onboardingSeen: "pagepilot.onboardingSeen",
    pagePrefix: "pagepilot.page."
  };
  const DEBUG_PREFIX = "[SkimRoute]";
  const DEBUG_ENABLED = globalThis.SKIMROUTE_DEV_MODE === true;

  if (window.top !== window.self) {
    return;
  }

  if (!window.PagePilotAdapters || !window.PagePilotEngine || !window.PagePilotUI) {
    return;
  }

  const runtime = {
    engine: null,
    ui: null,
    model: null,
    view: {
      mode: "minimized",
      activeId: null,
      showOnboarding: false,
      collapsedSectionIds: new Set(),
      sectionQuery: createEmptySectionQuery()
    },
    navigationHistory: createEmptyNavigationHistory(),
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
    chatQueryPassages: new Map(),
    queryRequestSeq: 0,
    lastAction: null,
    listeners: [],
    optionalRuntimes: {
      pdf: {
        promise: null,
        ready: false,
        error: "",
        initializedAt: 0,
        reasons: []
      },
      ocr: {
        promise: null,
        ready: false,
        error: "",
        initializedAt: 0,
        reasons: []
      }
    }
  };

  exposeRuntimeLoader();

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

  cleanupStaleSkimRouteDom("boot-current-version");
  window.__PAGEPILOT_LOADED__ = true;
  window.__SKIMROUTE_CONTENT_VERSION__ = SKIMROUTE_CONTENT_VERSION;

  onReady(init);

  function exposeRuntimeLoader() {
    const existing = window.PagePilotRuntimeLoader || {};
    window.PagePilotRuntimeLoader = {
      ...existing,
      ensurePdfRuntime,
      ensureOcrRuntime,
      getRuntimeState() {
        return {
          pdf: summarizeRuntimeState(runtime.optionalRuntimes.pdf),
          ocr: summarizeRuntimeState(runtime.optionalRuntimes.ocr)
        };
      }
    };
  }

  function summarizeRuntimeState(state) {
    return {
      ready: Boolean(state && state.ready),
      loading: Boolean(state && state.promise && !state.ready),
      error: state && state.error || "",
      initializedAt: state && state.initializedAt || 0,
      reasons: state && Array.isArray(state.reasons) ? state.reasons.slice() : []
    };
  }

  function createEmptyNavigationHistory(routeKey = "") {
    return {
      routeKey,
      lastSelectedSectionId: "",
      lastSelectedPassageId: "",
      lastSelectedPageNumber: 0,
      lastSelectedRole: "",
      recentSectionIds: [],
      lastActionSource: "",
      lastSelectedAt: 0
    };
  }

  function createEmptySectionQuery(text = "") {
    return {
      text: String(text || ""),
      status: "idle",
      sectionId: "",
      passageId: "",
      surface: "",
      pageNumber: 0,
      title: "",
      label: "",
      roleLabel: "",
      snippet: "",
      confidenceLabel: "",
      score: 0,
      reason: "",
      canNavigate: false,
      weakRequiresConfirm: false,
      hasNavigated: false,
      isCurrentTarget: false,
      canReturnToMatch: false,
      targetSectionId: "",
      targetPassageId: "",
      targetSurface: "",
      targetPageNumber: 0,
      targetNavigation: createEmptyQueryNavigationResult(),
      targetFingerprint: "",
      targetRouteKey: "",
      navigation: createEmptyQueryNavigationResult(),
      alternatives: [],
      requestId: 0,
      updatedAt: 0
    };
  }

  function createEmptyQueryNavigationResult() {
    return {
      found: false,
      navigated: false,
      verified: false,
      exact: false,
      surface: "",
      sectionId: "",
      passageId: "",
      pageNumber: 0,
      reason: "",
      strategy: ""
    };
  }

  function nextSectionQueryRequestId() {
    runtime.queryRequestSeq = (Number(runtime.queryRequestSeq) || 0) + 1;
    return runtime.queryRequestSeq;
  }

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
            // Best-effort cleanup only.
          }
        });
      });
      if (DEBUG_ENABLED && reason && typeof console !== "undefined" && console.info) {
        console.info(`${DEBUG_PREFIX} stale-ui-cleanup`, { reason, version: SKIMROUTE_CONTENT_VERSION });
      }
    } catch (error) {
      // Cleanup is best-effort.
    }
  }

  function emitDebug(event, extra) {
    if (!DEBUG_ENABLED) return;
    const debugState = {
      event,
      url: getCurrentUrl(),
      title: document.title || "",
      time: new Date().toISOString(),
      ...extra,
      stats: getPublicStatsSafely(),
      diagnostics: runtime.model && runtime.model.diagnostics ? runtime.model.diagnostics : null
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
      // Messaging is unavailable in tests and on restricted pages.
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
    if (!document.body) return;
    runtime.currentUrl = getCurrentUrl();
    if (isPdfLikePage()) {
      attachGlobalEvents();
      await ensurePdfRuntime("initial-pdf-surface");
      return;
    }

    runtime.engine = window.PagePilotEngine.createEngine({ window, document });
    runtime.view.showOnboarding = !(await storageGet(STORAGE_KEYS.onboardingSeen));
    runtime.ui = window.PagePilotUI.createUI({
      helpers: runtime.engine.helpers,
      callbacks: {
        onOpen: () => setMode("open", { focus: true, persist: true }),
        onMinimize: () => setMode(modeForClosedState(), { focusTab: true, persist: true }),
        onSnooze: () => setMode("snoozed", { focusTab: true, persist: true }),
        onJump: () => {
          const section = getSectionForAction("jump");
          const ok = jumpToUsefulPart({ source: "sidebar" });
          setActionResult("jump", ok, { section });
          return ok;
        },
        onNext: () => {
          const selection = selectNextTarget("sidebar-next");
          const section = selection.section || null;
          const ok = jumpToNextImportant(selection, { source: "sidebar" });
          setActionResult("next", ok, { section });
          return ok;
        },
        onRunPdfOcr: () => ensurePdfRuntime("sidebar-ocr-action"),
        onCancelPdfOcr: () => ensurePdfRuntime("sidebar-cancel-ocr"),
        onSection: (id, options) => {
          const section = runtime.model && runtime.model.sections.find((item) => item.id === id) || null;
          const ok = scrollToSection(id, { ...(options || {}), actionType: "section", source: "sidebar-section" });
          setActionResult("section", ok, { section });
          return ok;
        },
        onQuery: (query) => runSectionQuery(query, { source: "sidebar", allowWeakNavigation: false }),
        onClearQuery: () => clearSectionQuery("sidebar-clear"),
        onRunQueryBetterOcr: () => ensurePdfRuntime("sidebar-query-better-ocr"),
        onNavigateQueryResult: (target) => navigateCurrentQueryResult(target && target.returnToMatch ? "sidebar-return" : "sidebar-weak-confirm", target || {}),
        onToggleCollapse: (id) => toggleSectionCollapse(id),
        onDismissTip: () => dismissOnboarding()
      }
    });
    runtime.ui.mount();
    scanPage("initial");
    await restorePageMode();
    markRootVersion();
    render();
    attachGlobalEvents();
    window.__PAGEPILOT_DESTROY__ = destroy;
    watchPageChanges();
    watchRouteChanges();
    refreshActiveSection();
    scheduleWarmupScans("initial");
    emitDebug("core-runtime-ready", {
      reason: "initial",
      currentUrl: runtime.currentUrl,
      exactIssue: "none"
    });
  }

  function scanPage(reason) {
    if (!runtime.engine) return;
    if (isPdfLikePage()) {
      void ensurePdfRuntime(`scan:${reason}:pdf-surface`);
      return;
    }
    const previousSignature = runtime.model ? runtime.model.structureSignature : "";
    const previousQuiet = runtime.model ? runtime.model.pageProfile.quietMode : null;
    try {
      runtime.model = runtime.engine.scan({
        collapsedSectionIds: runtime.view.collapsedSectionIds,
        reason
      });
      runtime.model = reconcileGoogleDocsLiveModel(runtime.model, reason);
      reconcileNavigationStateAfterScan(reason);
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
        render();
        return;
      }
      render();
    } catch (error) {
      runtime.model = buildFallbackModel(reason, String(error && error.message ? error.message : error));
      emitDebug(`scan:error:${reason}`, {
        reason,
        error: runtime.model.pageProfile.reason,
        fallbackApplied: true
      });
      render();
    }
  }

  function reconcileGoogleDocsLiveModel(model, reason = "scan") {
    if (!isGoogleDocsModel(model)) return model;
    emitDebug("google-docs:extraction:usable-map", {
      reason,
      routeKey: getRouteCacheKey(),
      usable: Boolean(model && model.sections && model.sections.length),
      sections: model && model.sections ? model.sections.length : 0,
      important: model && model.importantSections ? model.importantSections.length : 0,
      words: model && model.totalReadableWords || 0,
      quietMode: model && model.pageProfile ? model.pageProfile.quietMode : null,
      exactIssue: "Google Docs extraction is handled by the existing adapter in the core runtime."
    });
    return model;
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

  function buildFallbackModel(reason, errorMessage) {
    return {
      pageProfile: {
        type: isKnownAiHost() ? "chat" : "low_structure",
        label: isKnownAiHost() ? "AI chat" : "Page",
        readingConfidence: 12,
        quietMode: true,
        reason: errorMessage || "SkimRoute could not scan this page yet.",
        quietReason: errorMessage || "SkimRoute could not scan this page yet.",
        state: "error"
      },
      sections: [],
      importantSections: [],
      bestSectionId: null,
      nextImportantId: null,
      confidence: 0,
      confidenceTier: "none",
      confidenceLabel: "No target",
      hasStrongTarget: false,
      bestLabel: "No clear standout",
      savedMinutes: 0,
      totalReadableWords: 0,
      readingMinutes: 1,
      routeKey: getRouteCacheKey(),
      diagnostics: { reason }
    };
  }

  function render() {
    if (!runtime.ui || !runtime.model) return;
    window.__PAGEPILOT_CURRENT_SECTIONS__ = runtime.model.sections || [];
    runtime.ui.render(runtime.model, runtime.view);
  }

  function setMode(mode, options = {}) {
    const nextMode = resolveMode(mode);
    runtime.view.mode = nextMode;
    if (options.persist) persistPageMode(nextMode);
    render();
    if (options.focus && runtime.ui && runtime.ui.focusPanel) runtime.ui.focusPanel();
    if (options.focusTab && runtime.ui && runtime.ui.focusTab) runtime.ui.focusTab();
    emitDebug("mode", { mode: nextMode });
  }

  function modeForClosedState() {
    return runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.quietMode ? "quiet" : "minimized";
  }

  function resolveMode(mode) {
    const value = VIEW_MODES.has(mode) ? mode : "minimized";
    if (value === "open" || value === "snoozed") return value;
    if (runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.quietMode) return "quiet";
    return value === "quiet" ? "minimized" : value;
  }

  async function restorePageMode() {
    const saved = await storageGet(pageStorageKey());
    if (!saved || typeof saved !== "object") return;
    if (saved.snoozedUntil && Date.now() > saved.snoozedUntil) {
      await clearPageMode();
      return;
    }
    if (VIEW_MODES.has(saved.mode)) runtime.view.mode = resolveMode(saved.mode);
  }

  function persistPageMode(mode) {
    const value = {
      mode,
      updatedAt: Date.now()
    };
    if (mode === "snoozed") value.snoozedUntil = Date.now() + SNOOZE_TTL_MS;
    return storageSet(pageStorageKey(), value);
  }

  function clearPageMode() {
    return storageRemove(pageStorageKey());
  }

  function pageStorageKey() {
    return `${STORAGE_KEYS.pagePrefix}${getRouteCacheKey()}`;
  }

  function getRouteCacheKey() {
    const modelRoute = runtime.model && runtime.model.routeKey;
    if (modelRoute) return modelRoute;
    return getCurrentUrl().replace(/#.*$/, "");
  }

  function sendFreshPublicStats(sendResponse, options = {}) {
    try {
      if (isPdfLikePage()) {
        ensurePdfRuntime(options.reason || "message-pdf-surface")
          .then(() => sendResponse({ ok: false, loading: true, pageType: "pdf", error: "PDF runtime is loading." }))
          .catch((error) => sendResponse({ ok: false, pageType: "pdf", error: String(error && error.message ? error.message : error) }));
        return true;
      }
      if (options.scan) scanPage(options.scanReason || options.reason || "status");
      sendResponse(getPublicStats());
      return true;
    } catch (error) {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      return true;
    }
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message || typeof message !== "object") return false;

    if (isSectionQueryMessage(message) && isPdfLikePage()) {
      return handlePdfQueryMessage(message, sendResponse);
    }

    if (isPdfMessage(message) || isPdfLikePage()) {
      return handlePdfRuntimeMessage(message, sendResponse, `message:${message.type || "unknown"}`);
    }

    if (message.type === "PAGEPILOT_TOGGLE") {
      setMode(typeof message.open === "boolean" && message.open ? "open" : modeForClosedState(), { focus: Boolean(message.open), persist: true });
      return sendFreshPublicStats(sendResponse, {
        reason: "open-recheck",
        scan: true,
        scanReason: "open-recheck"
      });
    }

    if (message.type === "PAGEPILOT_SCAN") {
      return sendFreshPublicStats(sendResponse, {
        reason: "popup",
        scan: true,
        scanReason: "popup"
      });
    }

    if (message.type === "PAGEPILOT_JUMP_USEFUL") {
      setMode("open", { focus: true, persist: true });
      const section = getSectionForAction("jump");
      const ok = jumpToUsefulPart({ source: "popup" });
      setActionResult("jump", ok, { section });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_NEXT_IMPORTANT") {
      setMode("open", { focus: true, persist: true });
      const selection = selectNextTarget("message-next");
      const section = selection.section || null;
      const ok = jumpToNextImportant(selection, { source: "popup" });
      setActionResult("next", ok, { section });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_QUERY_SECTION") {
      setMode("open", { focus: true, persist: true });
      runSectionQuery(message.query || "", {
        source: "popup",
        allowWeakNavigation: Boolean(message.allowWeakNavigation)
      });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_NAVIGATE_QUERY_RESULT") {
      setMode("open", { focus: true, persist: true });
      navigateCurrentQueryResult(message.returnToMatch ? "popup-return" : "popup-weak-confirm", {
        sectionId: message.sectionId || "",
        passageId: message.passageId || "",
        returnToMatch: Boolean(message.returnToMatch)
      });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_CLEAR_QUERY") {
      clearSectionQuery("popup");
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_STATUS") {
      return sendFreshPublicStats(sendResponse, { reason: "status" });
    }

    return false;
  }

  function isSectionQueryMessage(message) {
    const type = String(message && message.type || "");
    return type === "PAGEPILOT_QUERY_SECTION"
      || type === "PAGEPILOT_NAVIGATE_QUERY_RESULT"
      || type === "PAGEPILOT_CLEAR_QUERY";
  }

  function handlePdfQueryMessage(message, sendResponse) {
    ensurePdfRuntime(`query:${message.type || "unknown"}`)
      .then(() => {
        const pdfApi = window.PagePilotPdfRuntime;
        if (!pdfApi || typeof pdfApi.handleQueryAction !== "function") {
          sendResponse({ ok: false, pageType: "pdf", error: "PDF runtime did not expose query navigation." });
          return;
        }
        emitDebug("section-query:owner-selected", {
          owner: "pdf-runtime",
          type: message.type,
          exactIssue: "none"
        });
        try {
          Promise.resolve(pdfApi.handleQueryAction(message, { source: "core-delegate" }))
            .then((stats) => sendResponse(stats || { ok: false, pageType: "pdf", error: "PDF query handler returned no status." }))
            .catch((error) => sendResponse({ ok: false, pageType: "pdf", error: String(error && error.message ? error.message : error) }));
        } catch (error) {
          sendResponse({ ok: false, pageType: "pdf", error: String(error && error.message ? error.message : error) });
        }
      })
      .catch((error) => sendResponse({
        ok: false,
        pageType: "pdf",
        error: String(error && error.message ? error.message : error)
      }));
    return true;
  }

  function handlePdfRuntimeMessage(message, sendResponse, reason = "pdf-message") {
    ensurePdfRuntime(reason)
      .then(() => {
        const pdfApi = window.PagePilotPdfRuntime;
        if (!pdfApi || typeof pdfApi.handleExternalMessage !== "function") {
          sendResponse({ ok: false, loading: true, pageType: "pdf", error: "PDF runtime is loading." });
          return;
        }
        try {
          Promise.resolve(pdfApi.handleExternalMessage(message, { source: "core-delegate" }))
            .then((stats) => sendResponse(stats || { ok: false, pageType: "pdf", error: "PDF runtime returned no status." }))
            .catch((error) => sendResponse({ ok: false, pageType: "pdf", error: String(error && error.message ? error.message : error) }));
        } catch (error) {
          sendResponse({ ok: false, pageType: "pdf", error: String(error && error.message ? error.message : error) });
        }
      })
      .catch((error) => sendResponse({
        ok: false,
        pageType: "pdf",
        error: String(error && error.message ? error.message : error)
      }));
    return true;
  }

  function isPdfMessage(message) {
    return /^PAGEPILOT_(RUN_PDF_OCR|CANCEL_PDF_OCR|DEBUG_PDF_CACHE)$/i.test(String(message && message.type || ""));
  }

  function attachGlobalEvents() {
    addWindowListener("scroll", requestScrollUpdate, { passive: true });
    addDocumentListener("scroll", requestScrollUpdate, { passive: true, capture: true });
    addWindowListener("resize", requestResizeUpdate, { passive: true });
    addWindowListener("keydown", handleShortcut, true);
    addWindowListener("wheel", clearJumpEffectFromUser, { passive: true });
    addWindowListener("touchstart", clearJumpEffectFromUser, { passive: true });
    addWindowListener("pagehide", (event) => {
      if (!event.persisted) destroy();
    }, { once: true });

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(handleMessage);
      }
    } catch (error) {
      // Restricted pages can reject extension messaging.
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
      if (nextUrl !== runtime.currentUrl) handleRouteChange(nextUrl);
    }, URL_WATCH_INTERVAL_MS);

    addWindowListener("popstate", () => queueRouteCheck(), { passive: true });
    addWindowListener("hashchange", () => queueRouteCheck(), { passive: true });
    addWindowListener("pagepilot:routechange", () => queueRouteCheck(), { passive: true });
  }

  function patchHistory() {
    if (window.__PAGEPILOT_HISTORY_PATCHED__) return;
    window.__PAGEPILOT_HISTORY_PATCHED__ = true;
    ["pushState", "replaceState"].forEach((method) => {
      const original = history[method];
      if (typeof original !== "function") return;
      history[method] = function patchedHistoryMethod() {
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
      if (nextUrl !== runtime.currentUrl) handleRouteChange(nextUrl);
    }, 60);
  }

  function handleRouteChange(nextUrl) {
    runtime.currentUrl = nextUrl;
    runtime.view.activeId = null;
    runtime.view.collapsedSectionIds = new Set();
    runtime.navigationHistory = createEmptyNavigationHistory();
    runtime.view.sectionQuery = createEmptySectionQuery();
    clearJumpEffect();
    if (isPdfLikePage()) {
      void ensurePdfRuntime("route-pdf-surface");
      return;
    }
    scanPage("route");
    scheduleWarmupScans("route");
  }

  function getCurrentUrl() {
    return String(window.location && window.location.href || "");
  }

  function mutationLooksMeaningful(mutation) {
    if (!mutation) return false;
    const target = mutation.target;
    if (target && target.closest && target.closest(`#${ROOT_ID}, .pagepilot-google-docs-highlight, .pagepilot-google-docs-notice`)) return false;
    if (mutation.type === "characterData") return true;
    if (mutation.type === "attributes") return true;
    if (mutation.addedNodes && mutation.addedNodes.length) return Array.from(mutation.addedNodes).some((node) => {
      if (!node || node.nodeType !== 1) return false;
      if (node.matches && node.matches("script, style, link, svg, path")) return false;
      if (node.closest && node.closest(`#${ROOT_ID}`)) return false;
      return true;
    });
    return false;
  }

  function scheduleScan(reason) {
    const now = Date.now();
    const delay = now - runtime.lastScanAt < FAST_RESCAN_INTERVAL_MS ? MUTATION_SCAN_DELAY_MS : 120;
    window.clearTimeout(runtime.scanTimer);
    runtime.scanTimer = window.setTimeout(() => scanPage(reason), delay);
  }

  function scheduleWarmupScans(reason) {
    clearWarmupScans();
    const delays = isKnownAiHost() ? CHAT_WARMUP_SCAN_DELAYS_MS : WARMUP_SCAN_DELAYS_MS;
    runtime.warmupTimers = delays.map((delay, index) => window.setTimeout(() => {
      if (!shouldWarmupScan()) return;
      scanPage(`${reason || "warmup"}-warmup-${index + 1}`);
    }, delay));
  }

  function clearWarmupScans() {
    runtime.warmupTimers.forEach((timer) => window.clearTimeout(timer));
    runtime.warmupTimers = [];
  }

  function shouldWarmupScan() {
    if (!runtime.model) return true;
    const profile = runtime.model.pageProfile || {};
    if (profile.type === "chat") return true;
    return Boolean(!runtime.model.sections || runtime.model.sections.length < 2 || profile.quietMode);
  }

  function isKnownAiHost() {
    const host = String(window.location && window.location.hostname || "").toLowerCase();
    return /\b(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|perplexity\.ai|copilot\.microsoft\.com|copilot\.com|grok\.com)\b/i.test(host);
  }

  function isPdfLikePage() {
    if (isPdfUrl(getCurrentUrl())) return true;
    try {
      return Boolean(document.querySelector(".textLayer, [data-page-number], pdf-viewer, embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf'], iframe[src*='.pdf' i]"));
    } catch (error) {
      return false;
    }
  }

  function isPdfUrl(url) {
    return /\.pdf(?:$|[?#])/i.test(String(url || ""));
  }

  function reconcileNavigationStateAfterScan(reason) {
    if (!runtime.model) return;
    const routeKey = getRouteCacheKey();
    const ids = new Set((runtime.model.sections || []).map((section) => section.id));
    if (runtime.navigationHistory.routeKey && runtime.navigationHistory.routeKey !== routeKey) {
      runtime.navigationHistory = createEmptyNavigationHistory(routeKey);
      runtime.view.sectionQuery = createEmptySectionQuery();
    } else {
      runtime.navigationHistory.routeKey = routeKey;
      runtime.navigationHistory.recentSectionIds = runtime.navigationHistory.recentSectionIds.filter((id) => ids.has(id)).slice(-6);
      if (!ids.has(runtime.navigationHistory.lastSelectedSectionId)) {
        runtime.navigationHistory.lastSelectedSectionId = "";
        runtime.navigationHistory.lastSelectedRole = "";
        runtime.navigationHistory.lastSelectedAt = 0;
      }
    }
    if (runtime.view.activeId && !ids.has(runtime.view.activeId)) runtime.view.activeId = null;
    if (runtime.view.sectionQuery && runtime.view.sectionQuery.text) {
      runSectionQuery(runtime.view.sectionQuery.text, {
        source: `rescan:${reason || "scan"}`,
        preserveOnly: true
      });
    }
    refreshNextPreview("scan");
  }

  function refreshNextPreview(source) {
    const selection = selectNextTarget(source || "preview", { preview: true });
    if (runtime.model) {
      runtime.model.nextImportantId = selection.sectionId || "";
      runtime.model.nextReason = selection.reason || "";
    }
    return selection;
  }

  function selectNextTarget(source = "next", options = {}) {
    if (!runtime.model || !window.PagePilotEngine || !window.PagePilotEngine.navigation) {
      return { sectionId: "", section: null, reason: "No next useful section", diagnostics: null };
    }
    refreshSectionPositions();
    const marker = window.scrollY + Math.min(window.innerHeight * 0.42, 380);
    const currentId = runtime.view.activeId || "";
    const history = runtime.navigationHistory || createEmptyNavigationHistory();
    const freshHistoryCurrent = history.lastSelectedSectionId && Date.now() - Number(history.lastSelectedAt || 0) < 3500;
    const selection = window.PagePilotEngine.navigation.selectNextSection(runtime.model, {
      currentSectionId: freshHistoryCurrent ? history.lastSelectedSectionId : currentId,
      currentTop: marker,
      lastSelectedSectionId: history.lastSelectedSectionId,
      lastSelectedRole: history.lastSelectedRole,
      recentSectionIds: history.recentSectionIds,
      source,
      isNavigable: canJumpToSection
    });
    const section = runtime.model.sections.find((item) => item.id === selection.sectionId) || null;
    if (!options.preview && runtime.model.diagnostics) {
      runtime.model.diagnostics.nextSelection = selection.diagnostics;
    }
    return {
      sectionId: selection.sectionId || "",
      section,
      reason: selection.reason || "No next useful section",
      diagnostics: selection.diagnostics || null
    };
  }

  function recordNavigationSelection(section, source, target = {}) {
    if (!section || !runtime.model) return;
    const routeKey = getRouteCacheKey();
    if (runtime.navigationHistory.routeKey && runtime.navigationHistory.routeKey !== routeKey) {
      runtime.navigationHistory = createEmptyNavigationHistory(routeKey);
    }
    const role = section.intelligence && section.intelligence.role
      || section.metrics && section.metrics.sectionKind
      || section.label
      || "";
    const previousActive = {
      sectionId: runtime.navigationHistory.lastSelectedSectionId || "",
      passageId: runtime.navigationHistory.lastSelectedPassageId || "",
      pageNumber: runtime.navigationHistory.lastSelectedPageNumber || 0
    };
    runtime.navigationHistory.routeKey = routeKey;
    runtime.navigationHistory.lastSelectedSectionId = section.id;
    runtime.navigationHistory.lastSelectedPassageId = String(target.passageId || "");
    runtime.navigationHistory.lastSelectedPageNumber = Number(target.pageNumber) || getSectionPageNumber(section);
    runtime.navigationHistory.lastSelectedRole = role;
    runtime.navigationHistory.lastActionSource = source || "";
    runtime.navigationHistory.lastSelectedAt = Date.now();
    runtime.navigationHistory.recentSectionIds = runtime.navigationHistory.recentSectionIds
      .filter((id) => id && id !== section.id)
      .concat(section.id)
      .slice(-6);
    updateSectionQueryReturnState("navigation", { previousActive, source: source || "" });
  }

  function getSectionPageNumber(section) {
    return Number(section && (section.pageNumber || section.unitMeta && section.unitMeta.pageNumber)) || 0;
  }

  function buildSectionQueryTargetFingerprint(query, section) {
    return hashLocal([
      query && (query.passageId || query.sectionId || ""),
      query && (query.pageNumber || ""),
      query && (query.title || ""),
      query && (query.snippet || ""),
      section && (section.title || ""),
      section && String(section.text || "").slice(0, 220)
    ].join("|")).slice(0, 14);
  }

  function applySavedSectionQueryTarget(query, selected, navigation, section, source = "query") {
    if (!query || !selected || !navigation) return query;
    const navigated = Boolean(navigation.navigated && navigation.verified);
    const targetSectionId = String(navigation.sectionId || selected.sectionId || section && section.id || "");
    const targetPassageId = String(navigation.passageId || selected.passageId || "");
    const targetSurface = String(navigation.surface || selected.surface || "");
    const targetPageNumber = Number(navigation.pageNumber || selected.pageNumber || getSectionPageNumber(section)) || 0;
    const next = {
      ...query,
      ...selected,
      navigation,
      weakRequiresConfirm: false,
      hasNavigated: navigated,
      targetSectionId,
      targetPassageId,
      targetSurface,
      targetPageNumber,
      targetNavigation: navigation,
      targetFingerprint: buildSectionQueryTargetFingerprint(selected, section),
      targetRouteKey: getRouteCacheKey(),
      updatedAt: Date.now()
    };
    runtime.view.sectionQuery = next;
    if (navigated && section) {
      runtime.view.activeId = section.id;
      recordNavigationSelection(section, source || "query", {
        passageId: targetPassageId,
        pageNumber: targetPageNumber
      });
    } else {
      updateSectionQueryReturnState("query-navigation-failed", { source: source || "" });
    }
    return runtime.view.sectionQuery;
  }

  function carrySavedSectionQueryTarget(previous, next, reason = "rescan") {
    if (!previous || !previous.hasNavigated) return next;
    const targetSectionId = String(previous.targetSectionId || previous.sectionId || "");
    const targetPassageId = String(previous.targetPassageId || previous.passageId || "");
    const ids = new Set(runtime.model && Array.isArray(runtime.model.sections) ? runtime.model.sections.map((section) => section.id) : []);
    let strategy = "";
    if (targetPassageId && targetPassageId === String(next.passageId || "")) {
      strategy = "passage-id";
    } else if (targetSectionId && ids.has(targetSectionId)) {
      strategy = "section-id";
    } else if (
      Number(previous.targetPageNumber || 0)
      && Number(previous.targetPageNumber || 0) === Number(next.pageNumber || 0)
      && previous.targetFingerprint
      && previous.targetFingerprint === buildSectionQueryTargetFingerprint(next, runtime.model && runtime.model.sections.find((section) => section.id === next.sectionId))
    ) {
      strategy = "page-fingerprint";
    }
    if (!strategy) {
      emitDebug("section-query:saved-target-invalidated", {
        reason,
        sectionId: targetSectionId,
        passageId: targetPassageId,
        surface: previous.targetSurface || previous.surface || "",
        pageNumber: Number(previous.targetPageNumber || previous.pageNumber) || 0,
        exactIssue: "The saved FPA target could not be reconciled after the page map changed."
      });
      return next;
    }
    const carried = {
      ...next,
      hasNavigated: true,
      targetSectionId,
      targetPassageId,
      targetSurface: previous.targetSurface || previous.surface || next.surface || "",
      targetPageNumber: Number(previous.targetPageNumber || previous.pageNumber) || Number(next.pageNumber) || 0,
      targetNavigation: previous.targetNavigation || previous.navigation || createEmptyQueryNavigationResult(),
      targetFingerprint: previous.targetFingerprint || buildSectionQueryTargetFingerprint(next, runtime.model && runtime.model.sections.find((section) => section.id === next.sectionId)),
      targetRouteKey: previous.targetRouteKey || getRouteCacheKey()
    };
    emitDebug("section-query:saved-target-reconciled", {
      reason,
      strategy,
      sectionId: carried.targetSectionId,
      passageId: carried.targetPassageId,
      surface: carried.targetSurface,
      pageNumber: carried.targetPageNumber,
      exactIssue: "A saved FPA target survived a same-document section remap."
    });
    runtime.view.sectionQuery = carried;
    updateSectionQueryReturnState("reconciled", { strategy });
    return runtime.view.sectionQuery;
  }

  function queryTargetMatchesCurrent(query) {
    if (!query || !query.hasNavigated) return false;
    const sectionId = String(query.targetSectionId || query.sectionId || "");
    const passageId = String(query.targetPassageId || query.passageId || "");
    const pageNumber = Number(query.targetPageNumber || query.pageNumber) || 0;
    const history = runtime.navigationHistory || createEmptyNavigationHistory();
    if (!sectionId || String(history.lastSelectedSectionId || "") !== sectionId) return false;
    if (passageId && String(history.lastSelectedPassageId || "") !== passageId) return false;
    if (pageNumber && Number(history.lastSelectedPageNumber || 0) && Number(history.lastSelectedPageNumber || 0) !== pageNumber) return false;
    return true;
  }

  function updateSectionQueryReturnState(reason = "state", details = {}) {
    const query = runtime.view.sectionQuery;
    if (!query || !query.text || !query.hasNavigated) return false;
    const sectionId = String(query.targetSectionId || query.sectionId || "");
    const ids = new Set(runtime.model && Array.isArray(runtime.model.sections) ? runtime.model.sections.map((section) => section.id) : []);
    if (!sectionId || !ids.has(sectionId)) {
      runtime.view.sectionQuery = {
        ...query,
        hasNavigated: false,
        isCurrentTarget: false,
        canReturnToMatch: false
      };
      emitDebug("section-query:saved-target-invalidated", {
        reason,
        sectionId,
        passageId: query.targetPassageId || query.passageId || "",
        surface: query.targetSurface || query.surface || "",
        pageNumber: Number(query.targetPageNumber || query.pageNumber) || 0,
        exactIssue: "The saved FPA target section is no longer present."
      });
      return false;
    }
    const current = queryTargetMatchesCurrent(query);
    const navigation = query.targetNavigation || query.navigation || {};
    const canReturn = Boolean(!current && query.canNavigate && navigation.navigated);
    runtime.view.sectionQuery = {
      ...query,
      isCurrentTarget: current,
      canReturnToMatch: canReturn
    };
    if (canReturn) {
      emitDebug("section-query:return-available", {
        reason,
        sectionId,
        passageId: query.targetPassageId || query.passageId || "",
        surface: query.targetSurface || query.surface || "",
        pageNumber: Number(query.targetPageNumber || query.pageNumber) || 0,
        previousActive: details.previousActive || null,
        currentActive: {
          sectionId: runtime.navigationHistory.lastSelectedSectionId || "",
          passageId: runtime.navigationHistory.lastSelectedPassageId || "",
          pageNumber: runtime.navigationHistory.lastSelectedPageNumber || 0
        },
        exactIssue: "The saved FPA match is navigable and the active target is elsewhere."
      });
    }
    return canReturn;
  }

  function runSectionQuery(query, options = {}) {
    const text = String(query || "").slice(0, 120).trim();
    const requestId = Number(options.requestId) || nextSectionQueryRequestId();
    const previousQuery = runtime.view.sectionQuery || createEmptySectionQuery();
    if (!text) {
      clearSectionQuery(options.source || "empty-query");
      return runtime.view.sectionQuery;
    }
    emitDebug("section-query:submitted", {
      owner: "core",
      source: options.source || "query",
      requestId,
      queryLength: text.length,
      routeKey: getRouteCacheKey(),
      exactIssue: "Raw query text is not logged."
    });
    if (!runtime.model || !window.PagePilotEngine || !window.PagePilotEngine.navigation) {
      runtime.view.sectionQuery = {
        ...createEmptySectionQuery(text),
        requestId,
        status: "none",
        reason: "No strong section match found on this page.",
        updatedAt: Date.now()
      };
      render();
      return runtime.view.sectionQuery;
    }
    const isChatSurface = runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type === "chat";
    if (isChatSurface) runtime.chatQueryPassages = new Map();
    emitDebug("section-query:owner-selected", {
      owner: isChatSurface ? "core-chat" : "core",
      source: options.source || "query",
      exactIssue: "none"
    });
    const search = window.PagePilotEngine.navigation.searchSections(runtime.model, text, {
      source: options.source || "query",
      surface: isChatSurface ? "chat" : "",
      getQueryPassages: isChatSurface ? getChatQueryPassages : null,
      isNavigable: canJumpToSection
    });
    runtime.model.diagnostics = runtime.model.diagnostics || {};
    runtime.model.diagnostics.sectionQuery = search.diagnostics;
    if (!search.result) {
      runtime.view.sectionQuery = {
        ...createEmptySectionQuery(text),
        requestId,
        status: "none",
        reason: "No strong section match found on this page.",
        updatedAt: Date.now()
      };
      render();
      return runtime.view.sectionQuery;
    }

    runtime.view.sectionQuery = {
      ...createEmptySectionQuery(text),
      ...search.result,
      text,
      requestId,
      navigation: createEmptyQueryNavigationResult(),
      updatedAt: Date.now()
    };
    if (options.preserveOnly) {
      carrySavedSectionQueryTarget(previousQuery, runtime.view.sectionQuery, options.source || "preserve");
    }
    const shouldNavigate = !options.preserveOnly
      && runtime.view.sectionQuery.canNavigate
      && runtime.view.sectionQuery.status !== "weak";
    if (shouldNavigate) {
      const section = runtime.model.sections.find((item) => item.id === runtime.view.sectionQuery.sectionId) || null;
      const navigation = navigateQueryResult(runtime.view.sectionQuery, options.source || "query");
      applySavedSectionQueryTarget(runtime.view.sectionQuery, runtime.view.sectionQuery, navigation, section, options.source || "query");
      const ok = Boolean(navigation.navigated);
      setActionResult("query", ok, {
        section,
        message: queryNavigationMessage(navigation, runtime.view.sectionQuery.title)
      });
    }
    render();
    return runtime.view.sectionQuery;
  }

  function clearSectionQuery(source) {
    runtime.view.sectionQuery = createEmptySectionQuery();
    runtime.view.sectionQuery.requestId = nextSectionQueryRequestId();
    emitDebug("section-query:clear", {
      source: source || "clear",
      exactIssue: "none"
    });
    render();
    return runtime.view.sectionQuery;
  }

  function navigateCurrentQueryResult(source, target = {}) {
    const query = runtime.view.sectionQuery || createEmptySectionQuery();
    const returnToMatch = Boolean(target && target.returnToMatch);
    const selected = returnToMatch
      ? {
        ...query,
        sectionId: query.targetSectionId || query.sectionId || "",
        passageId: query.targetPassageId || query.passageId || "",
        surface: query.targetSurface || query.surface || "",
        pageNumber: Number(query.targetPageNumber || query.pageNumber) || 0
      }
      : target && (target.sectionId || target.passageId)
      ? resolveQueryAlternative(query, target) || query
      : query;
    if (!selected.sectionId || !runtime.model) return false;
    const section = runtime.model.sections.find((item) => item.id === selected.sectionId) || null;
    if (returnToMatch) {
      emitDebug("section-query:return-requested", {
        sectionId: selected.sectionId || "",
        passageId: selected.passageId || "",
        surface: selected.surface || "",
        pageNumber: Number(selected.pageNumber) || 0,
        previousActiveSection: runtime.navigationHistory.lastSelectedSectionId || "",
        currentActiveSection: runtime.view.activeId || "",
        exactIssue: "Return to match uses the existing FPA navigation route."
      });
    }
    const navigation = navigateQueryResult(selected, source || "query-confirm");
    applySavedSectionQueryTarget(runtime.view.sectionQuery, selected, navigation, section, source || (returnToMatch ? "query-return" : "query-confirm"));
    if (returnToMatch) {
      emitDebug(navigation.navigated ? navigation.exact ? "section-query:return-verified" : "section-query:return-approximate" : "section-query:return-failed", {
        sectionId: selected.sectionId || "",
        passageId: selected.passageId || "",
        surface: selected.surface || "",
        pageNumber: Number(selected.pageNumber) || 0,
        navigation,
        exactIssue: navigation.navigated && navigation.exact ? "none" : navigation.reason || "Return navigation was not exact."
      });
    }
    const ok = Boolean(navigation.navigated);
    setActionResult("query", ok, {
      section,
      message: queryNavigationMessage(navigation, selected.title || section && section.title || "matched section")
    });
    render();
    return ok;
  }

  function resolveQueryAlternative(query, target = {}) {
    const alternatives = Array.isArray(query && query.alternatives) ? query.alternatives : [];
    const wantedSection = String(target.sectionId || "");
    const wantedPassage = String(target.passageId || "");
    return alternatives.find((item) => {
      if (wantedPassage && String(item.passageId || "") === wantedPassage) return true;
      return wantedSection && String(item.sectionId || "") === wantedSection && (!wantedPassage || String(item.passageId || "") === wantedPassage);
    }) || null;
  }

  function navigateQueryResult(query, source) {
    const section = runtime.model && runtime.model.sections.find((item) => item.id === query.sectionId) || null;
    const base = {
      ...createEmptyQueryNavigationResult(),
      found: Boolean(section),
      surface: query.surface || (section && isGoogleDocsSection(section) ? "docs" : runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.type || "page"),
      sectionId: query.sectionId || "",
      passageId: query.passageId || "",
      pageNumber: Number(query.pageNumber) || Number(section && (section.pageNumber || section.unitMeta && section.unitMeta.pageNumber)) || 0
    };
    if (!section) {
      return { ...base, reason: "Matched section is no longer available.", strategy: "missing-section" };
    }
    emitDebug("section-query:navigation-requested", {
      surface: base.surface,
      sectionId: base.sectionId,
      passageId: base.passageId,
      pageNumber: base.pageNumber,
      source: source || "query",
      exactIssue: "none"
    });
    if (base.surface === "chat" && query.passageId) {
      return scrollToChatQueryPassage(section, query, base, source);
    }
    const googleDocsExact = isGoogleDocsSection(section) ? isGoogleDocsExactTarget(resolveGoogleDocsTarget(section)) : true;
    const ok = scrollToSection(section.id, { highlight: true, actionType: "query", source: source || "query" });
    const result = {
      ...base,
      navigated: ok,
      verified: ok,
      exact: Boolean(ok && googleDocsExact),
      reason: ok ? googleDocsExact ? "Moved to the matching passage." : "Moved to the matching page; exact passage highlighting was unavailable." : "Found a match, but SkimRoute did not confirm navigation.",
      strategy: isGoogleDocsSection(section) ? googleDocsExact ? "google-docs-exact" : "google-docs-approximate" : "section-scroll"
    };
    emitQueryNavigationDebug(result);
    return result;
  }

  function queryNavigationMessage(navigation, title) {
    if (!navigation || !navigation.navigated) return navigation && navigation.reason || "Found a match, but SkimRoute did not confirm navigation.";
    if (!navigation.exact) return "Moved to the matching page; exact passage highlighting was unavailable.";
    return "Moved to the matching passage.";
  }

  function isChatSection(section) {
    if (!section) return false;
    const profile = runtime.model && runtime.model.pageProfile || {};
    const meta = section.unitMeta || {};
    const metrics = section.metrics || {};
    if (profile.type === "chat") return true;
    const source = `${profile.adapterName || ""} ${meta.adapterName || ""} ${meta.source || ""} ${meta.platform || ""} ${meta.kind || ""}`.toLowerCase();
    return Boolean(
      meta.role === "assistant"
      || meta.role === "user"
      || metrics.chatRole
      || /\b(chat|generic-chat|chatgpt|gemini|claude|copilot|perplexity|grok)\b/.test(source)
    );
  }

  function navigateChatSection(section, options = {}) {
    const actionType = options.actionType || "section";
    const source = options.source || actionType;
    const meta = section && section.unitMeta || {};
    emitDebug("chat-navigation:requested", {
      actionType,
      actionSource: source,
      sectionId: section && section.id || "",
      role: meta.role || "",
      turnIndex: Number.isFinite(Number(meta.turnIndex)) ? Number(meta.turnIndex) : null,
      platform: meta.platform || "",
      adapter: runtime.model && runtime.model.pageProfile && runtime.model.pageProfile.adapterName || ""
    });

    expandAncestors(section.id);
    let resolved = resolveChatSectionTarget(section);
    if (!resolved || !resolved.element) {
      emitDebug("chat-navigation:failed", {
        actionType,
        actionSource: source,
        sectionId: section.id,
        role: meta.role || "",
        turnIndex: Number.isFinite(Number(meta.turnIndex)) ? Number(meta.turnIndex) : null,
        reason: "target-not-resolved"
      });
      return false;
    }

    emitDebug("chat-navigation:target-resolved", {
      actionType,
      actionSource: source,
      sectionId: section.id,
      role: resolved.role || meta.role || "",
      turnIndex: resolved.turnIndex,
      platform: resolved.platform || meta.platform || "",
      anchorStale: Boolean(resolved.anchorStale),
      target: describeElement(resolved.element),
      matchScore: resolved.matchScore
    });

    let container = findChatScrollContainer(resolved.element);
    let before = captureScrollPosition(container);
    let beforeRect = rectSummary(resolved.element.getBoundingClientRect());
    emitDebug("chat-navigation:scroll-container-resolved", {
      actionType,
      actionSource: source,
      sectionId: section.id,
      scrollContainer: container === window ? "window" : describeElement(container),
      before,
      targetRect: beforeRect
    });

    let visible = isElementVisibleInScrollContainer(resolved.element, container);
    let scrollInfo = { requested: false, calculatedTop: before.top, actualTop: before.top };
    if (!visible) {
      scrollInfo = scrollChatTargetIntoView(resolved.element, container);
      emitDebug("chat-navigation:scroll-requested", {
        actionType,
        actionSource: source,
        sectionId: section.id,
        scrollContainer: container === window ? "window" : describeElement(container),
        before,
        calculatedScrollTop: scrollInfo.calculatedTop,
        actualScrollTop: scrollInfo.actualTop,
        targetRect: beforeRect
      });
      visible = isElementVisibleInScrollContainer(resolved.element, container);
    }

    if (!visible) {
      emitDebug("chat-navigation:retry", {
        actionType,
        actionSource: source,
        sectionId: section.id,
        reason: "post-scroll-target-not-visible",
        scrollContainer: container === window ? "window" : describeElement(container),
        scrollTop: captureScrollPosition(container).top
      });
      const retry = resolveChatSectionTarget(section, { preferFresh: true });
      if (retry && retry.element) {
        resolved = retry;
        container = findChatScrollContainer(resolved.element);
        before = captureScrollPosition(container);
        beforeRect = rectSummary(resolved.element.getBoundingClientRect());
        scrollInfo = scrollChatTargetIntoView(resolved.element, container);
        visible = isElementVisibleInScrollContainer(resolved.element, container);
      }
    }

    const after = captureScrollPosition(container);
    const afterRect = rectSummary(resolved.element.getBoundingClientRect());
    if (!visible) {
      emitDebug("chat-navigation:failed", {
        actionType,
        actionSource: source,
        sectionId: section.id,
        role: resolved.role || meta.role || "",
        turnIndex: resolved.turnIndex,
        scrollContainer: container === window ? "window" : describeElement(container),
        before,
        after,
        targetRectBefore: beforeRect,
        targetRectAfter: afterRect,
        reason: "target-not-visible-after-scroll"
      });
      return false;
    }

    runtime.view.activeId = section.id;
    recordNavigationSelection(section, source);
    if (runtime.ui) runtime.ui.updateActiveClasses(runtime.view.activeId);
    if (options.highlight) {
      activateJumpEffect({ ...section, anchor: resolved.element, blocks: [resolved.element] });
    }
    emitDebug("chat-navigation:verified", {
      actionType,
      actionSource: source,
      sectionId: section.id,
      role: resolved.role || meta.role || "",
      turnIndex: resolved.turnIndex,
      platform: resolved.platform || meta.platform || "",
      anchorStale: Boolean(resolved.anchorStale),
      scrollContainer: container === window ? "window" : describeElement(container),
      before,
      after,
      targetRectBefore: beforeRect,
      targetRectAfter: afterRect,
      calculatedScrollTop: scrollInfo.calculatedTop,
      actualScrollTop: after.top,
      verification: "visible"
    });
    emitDebug("jump", {
      type: actionType,
      sectionId: section.id,
      title: section.title,
      exactIssue: "none",
      strategy: "chat-section-scroll"
    });
    return true;
  }

  function resolveChatSectionTarget(section, options = {}) {
    if (!section) return null;
    const meta = section.unitMeta || {};
    const anchor = section.anchor || null;
    if (!options.preferFresh && isValidChatSectionAnchor(anchor, section)) {
      return {
        element: chooseChatTargetElement(anchor, section),
        role: getChatElementRole(anchor) || meta.role || "",
        turnIndex: Number.isFinite(Number(meta.turnIndex)) ? Number(meta.turnIndex) : null,
        platform: meta.platform || "",
        anchorStale: false,
        matchScore: 100
      };
    }

    const candidates = getLiveChatTurnCandidates();
    const expectedRole = String(meta.role || "").toLowerCase();
    const expectedTurnIndex = Number.isFinite(Number(meta.turnIndex)) ? Number(meta.turnIndex) : null;
    const reference = getChatSectionReferenceText(section);
    const rows = candidates.map((candidate, index) => {
      const role = getChatElementRole(candidate);
      if (expectedRole && role && role !== expectedRole) {
        return null;
      }
      const text = normalizeText(candidate.innerText || candidate.textContent || "");
      const score = scoreChatCandidate(section, candidate, {
        index,
        role,
        expectedRole,
        expectedTurnIndex,
        reference,
        text
      });
      return { candidate, index, role, score, text };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index);

    const best = rows[0] || null;
    if (!best || best.score < 34) return null;
    return {
      element: chooseChatTargetElement(best.candidate, section),
      role: best.role || expectedRole || "",
      turnIndex: best.index,
      platform: meta.platform || "",
      anchorStale: true,
      matchScore: best.score
    };
  }

  function isValidChatSectionAnchor(anchor, section) {
    if (!anchor || typeof anchor.getBoundingClientRect !== "function") return false;
    if (!document.documentElement.contains(anchor)) return false;
    if (anchor.closest && anchor.closest(`#${ROOT_ID}`)) return false;
    const meta = section && section.unitMeta || {};
    const expectedRole = String(meta.role || "").toLowerCase();
    const role = getChatElementRole(anchor);
    if (expectedRole && role && role !== expectedRole) return false;
    const text = normalizeText(anchor.innerText || anchor.textContent || "");
    const reference = getChatSectionReferenceText(section);
    if (reference && text && getTokenOverlapScore(reference, text) < 0.08 && !text.includes(normalizeText(section.title || "").slice(0, 48))) {
      return false;
    }
    return true;
  }

  function getLiveChatTurnCandidates() {
    const selectors = [
      "[data-testid='conversation-turn']",
      "[data-message-author-role]",
      "model-response",
      "user-query",
      "[role='article']",
      "article",
      "[class*='message' i]",
      "[class*='turn' i]",
      "[class*='response' i]"
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")))
      .filter((node) => node && node instanceof Element)
      .filter((node) => !(node.closest && node.closest(`#${ROOT_ID}`)))
      .filter((node) => !isComposerLikeElement(node))
      .filter((node) => {
        const text = normalizeText(node.innerText || node.textContent || "");
        return text && countWordsLocal(text) >= 3;
      });
    const unique = [];
    nodes.forEach((node) => {
      if (unique.includes(node)) return;
      if (unique.some((existing) => existing.contains(node) && getChatElementRole(existing))) return;
      for (let index = unique.length - 1; index >= 0; index -= 1) {
        if (node.contains(unique[index]) && getChatElementRole(node)) unique.splice(index, 1);
      }
      unique.push(node);
    });
    return unique.filter((node) => {
      try {
        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      } catch (error) {
        return true;
      }
    });
  }

  function scoreChatCandidate(section, candidate, details) {
    const meta = section && section.unitMeta || {};
    let score = 0;
    if (details.expectedRole && details.role === details.expectedRole) score += 46;
    if (!details.expectedRole && details.role) score += 10;
    if (details.expectedTurnIndex !== null) {
      if (details.index === details.expectedTurnIndex) score += 72;
      else {
        const distance = Math.abs(details.index - details.expectedTurnIndex);
        if (distance === 1) score += 24;
        else if (distance === 2) score += 10;
      }
    }
    if (meta.platform && hasAttributeText(candidate, meta.platform)) score += 8;
    const title = normalizeText(section && section.title || "");
    if (title && details.text.includes(title)) score += 28;
    if (details.reference && details.text) score += Math.round(getTokenOverlapScore(details.reference, details.text) * 80);
    if (section && section.anchor && section.anchor !== candidate) {
      const staleText = normalizeText(section.anchor.innerText || section.anchor.textContent || "");
      if (staleText && details.text.includes(staleText.slice(0, 80))) score += 18;
    }
    return score;
  }

  function getChatSectionReferenceText(section) {
    if (!section) return "";
    const parts = [
      section.title,
      section.text,
      section.summary,
      section.label,
      section.anchor && (section.anchor.innerText || section.anchor.textContent)
    ];
    return normalizeText(parts.filter(Boolean).join(" ").slice(0, 1400));
  }

  function getTokenOverlapScore(left, right) {
    const leftTokens = new Set(String(left || "").split(/\s+/).filter((token) => token.length > 2));
    const rightTokens = new Set(String(right || "").split(/\s+/).filter((token) => token.length > 2));
    if (!leftTokens.size || !rightTokens.size) return 0;
    let overlap = 0;
    leftTokens.forEach((token) => {
      if (rightTokens.has(token)) overlap += 1;
    });
    return overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  }

  function hasAttributeText(element, value) {
    if (!element || !value) return false;
    const expected = String(value).toLowerCase();
    return Array.from(element.attributes || []).some((attribute) => String(attribute.value || "").toLowerCase().includes(expected));
  }

  function chooseChatTargetElement(element, section) {
    if (!element || !(element instanceof Element)) return element;
    const meta = section && section.unitMeta || {};
    const root = findChatTurnRoot(element) || element;
    const expectedRole = String(meta.role || "").toLowerCase();
    if (expectedRole) {
      const rootRole = getChatElementRole(root);
      if (rootRole && rootRole !== expectedRole) return element;
    }
    return root;
  }

  function findChatTurnRoot(element) {
    if (!element || !(element instanceof Element)) return null;
    return element.closest("[data-testid='conversation-turn'], [data-message-author-role], model-response, user-query, [role='article'], article, [class*='message' i], [class*='turn' i], [class*='response' i]");
  }

  function getChatElementRole(element) {
    if (!element || !(element instanceof Element)) return "";
    const roleNode = element.closest("[data-message-author-role]");
    const attrRole = roleNode && roleNode.getAttribute("data-message-author-role") || element.getAttribute("data-message-author-role") || "";
    const tag = element.tagName ? element.tagName.toLowerCase() : "";
    const aria = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-testid") || ""} ${element.className || ""}`.toLowerCase();
    if (/assistant|model|bot|response|answer/.test(String(attrRole || "").toLowerCase()) || tag === "model-response" || /\b(assistant|model|bot|response)\b/.test(aria)) return "assistant";
    if (/user|human|prompt|query/.test(String(attrRole || "").toLowerCase()) || tag === "user-query" || /\b(user|human|prompt|query)\b/.test(aria)) return "user";
    return "";
  }

  function isComposerLikeElement(element) {
    if (!element || !(element instanceof Element)) return false;
    if (element.matches("textarea, input, [contenteditable='true'], form")) return true;
    const label = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-testid") || ""} ${element.className || ""}`.toLowerCase();
    return /\b(composer|prompt-textarea|chat-input|message-input|send-button|editor)\b/.test(label);
  }

  function findChatScrollContainer(element) {
    const direct = findScrollContainer(element);
    if (direct !== window) return direct;
    const candidates = Array.from(document.querySelectorAll([
      "[data-testid='conversation']",
      "[data-testid*='conversation' i]",
      "[role='main']",
      "main",
      "[class*='conversation' i]",
      "[class*='chat' i]",
      "[class*='thread' i]",
      "[class*='messages' i]"
    ].join(","))).filter((node) => node && node instanceof Element && node.contains(element));
    const scrollable = candidates.find((node) => {
      try {
        const style = window.getComputedStyle(node);
        const overflow = `${style.overflowY || ""} ${style.overflow || ""}`;
        return /(auto|scroll|overlay)/i.test(overflow) && node.scrollHeight > node.clientHeight + 24;
      } catch (error) {
        return false;
      }
    });
    return scrollable || window;
  }

  function scrollChatTargetIntoView(element, container) {
    const before = captureScrollPosition(container);
    const rect = element.getBoundingClientRect();
    let calculatedTop = before.top;
    if (container === window) {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
      calculatedTop = Math.max(0, Math.min(maxScroll, window.scrollY + rect.top - Math.max(24, (viewportHeight - Math.min(rect.height, viewportHeight * 0.75)) / 2)));
      window.scrollTo({ top: calculatedTop, behavior: "auto" });
    } else {
      const containerRect = container.getBoundingClientRect();
      const visibleHeight = container.clientHeight || containerRect.height || 0;
      const maxScroll = Math.max(0, container.scrollHeight - visibleHeight);
      calculatedTop = Math.max(0, Math.min(maxScroll, container.scrollTop + (rect.top - containerRect.top) - Math.max(20, (visibleHeight - Math.min(rect.height, visibleHeight * 0.75)) / 2)));
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: calculatedTop, behavior: "auto" });
      } else {
        container.scrollTop = calculatedTop;
      }
    }
    const after = captureScrollPosition(container);
    return {
      requested: true,
      calculatedTop: Math.round(calculatedTop),
      actualTop: after.top
    };
  }

  function isElementVisibleInScrollContainer(element, container) {
    if (!element || !element.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    const viewport = getSafeChatViewportRect(container);
    const vertical = Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top);
    const horizontal = Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left);
    const minVisible = Math.max(18, Math.min(rect.height || 0, viewport.height || 0) * 0.25);
    return vertical >= minVisible && horizontal > 8;
  }

  function getSafeChatViewportRect(container) {
    const base = container === window
      ? { top: 0, left: 0, right: window.innerWidth || document.documentElement.clientWidth || 0, bottom: window.innerHeight || document.documentElement.clientHeight || 0 }
      : container.getBoundingClientRect();
    const height = Math.max(0, base.bottom - base.top);
    const topMargin = Math.min(72, Math.max(16, height * 0.14));
    const bottomMargin = Math.min(96, Math.max(20, height * 0.18));
    return {
      top: base.top + topMargin,
      left: base.left,
      right: base.right,
      bottom: Math.max(base.top + topMargin, base.bottom - bottomMargin),
      width: Math.max(0, base.right - base.left),
      height: Math.max(0, height - topMargin - bottomMargin)
    };
  }

  function rectSummary(rect) {
    if (!rect) return null;
    return {
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function getChatQueryPassages(section) {
    if (!section || !section.anchor) return [];
    const helpers = runtime.engine && runtime.engine.helpers || {};
    const nodes = Array.from(section.anchor.querySelectorAll ? section.anchor.querySelectorAll("h1,h2,h3,[role='heading'],p,li,pre,code,blockquote,table") : []);
    const candidates = nodes.length ? nodes : [section.anchor];
    const meta = section.unitMeta || {};
    const passages = [];
    candidates.forEach((node, index) => {
      if (!node || node.closest && node.closest(`#${ROOT_ID}`)) return;
      if (node.tagName && node.tagName.toLowerCase() === "code" && node.closest("pre")) return;
      if (helpers.isVisible && !helpers.isVisible(node)) return;
      const rawText = node.innerText || node.textContent || "";
      const text = normalizeText(rawText);
      if (!text || countWordsLocal(text) < 4) return;
      const passageType = getChatPassageType(node);
      const passageId = `${section.id}:chat:${index}:${hashLocal(`${passageType}:${text.slice(0, 160)}`).slice(0, 10)}`;
      const role = String(meta.role || node.getAttribute && node.getAttribute("data-message-author-role") || "").toLowerCase();
      const passage = {
        id: passageId,
        surface: "chat",
        passageType,
        title: getChatPassageTitle(node, section, passageType),
        text,
        roleLabel: role === "assistant" ? "Assistant answer" : role === "user" ? "User prompt" : "",
        metadata: {
          ...meta,
          role,
          passageType,
          turnIndex: meta.turnIndex,
          platform: meta.platform || "",
          finalAnswer: Boolean(meta.hasFinalAnswer || meta.hasRevision || meta.isCompleteAssistantAnswer || /corrected final answer|final response|final answer/i.test(text.slice(0, 180))),
          superseded: Boolean(meta.isSuperseded || meta.hasFailedAnswer || /older draft|initial draft|incomplete|superseded|replaces older/i.test(text.slice(0, 260)))
        }
      };
      runtime.chatQueryPassages.set(passageId, { sectionId: section.id, element: node, passage });
      passages.push(passage);
    });
    return passages.slice(0, 80);
  }

  function getChatPassageType(node) {
    const tag = node && node.tagName ? node.tagName.toLowerCase() : "";
    if (/^h[1-6]$/.test(tag) || node && node.getAttribute && node.getAttribute("role") === "heading") return "heading";
    if (tag === "pre" || tag === "code") return "code";
    if (tag === "li") return "list";
    if (tag === "blockquote") return "quote";
    if (tag === "table") return "table";
    return "paragraph";
  }

  function getChatPassageTitle(node, section, passageType) {
    if (passageType === "heading") return normalizeText(node.innerText || node.textContent || "").slice(0, 120);
    return section && section.title || "Chat answer";
  }

  function scrollToChatQueryPassage(section, query, base, source) {
    let ref = runtime.chatQueryPassages && runtime.chatQueryPassages.get(query.passageId);
    if (!ref || !ref.element || !document.documentElement.contains(ref.element)) {
      getChatQueryPassages(section);
      ref = runtime.chatQueryPassages && runtime.chatQueryPassages.get(query.passageId);
    }
    const element = ref && ref.element || null;
    if (!element || !element.getBoundingClientRect) {
      const ok = scrollToSection(section.id, { highlight: true, actionType: "query", source: source || "query" });
      const result = {
        ...base,
        navigated: ok,
        verified: ok,
        exact: false,
        reason: ok ? "Moved to the matching page; exact passage highlighting was unavailable." : "Found a match, but SkimRoute did not confirm navigation.",
        strategy: "chat-turn-fallback"
      };
      emitQueryNavigationDebug(result);
      return result;
    }
    const container = findScrollContainer(element);
    const before = captureScrollPosition(container);
    try {
      element.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    } catch (error) {
      // Fallback to the parent section below.
    }
    runtime.view.activeId = section.id;
    recordNavigationSelection(section, source || "query");
    if (runtime.ui) runtime.ui.updateActiveClasses(runtime.view.activeId);
    activateJumpEffect({ ...section, anchor: element, blocks: [element] });
    const after = captureScrollPosition(container);
    const rect = element.getBoundingClientRect();
    const visible = Boolean(rect.bottom > 48 && rect.top < window.innerHeight - 48);
    const result = {
      ...base,
      navigated: true,
      verified: visible,
      exact: visible,
      reason: visible ? "Moved to the matching passage." : "Moved to the matching page; exact passage highlighting was unavailable.",
      strategy: visible ? "chat-passage-scroll" : "chat-passage-unverified"
    };
    emitDebug(visible ? "section-query:navigation-verified" : "section-query:navigation-approximate", {
      surface: "chat",
      sectionId: section.id,
      passageId: query.passageId || "",
      role: section.unitMeta && section.unitMeta.role || "",
      passageType: ref && ref.passage && ref.passage.passageType || "",
      scrollContainer: container === window ? "window" : describeElement(container),
      before,
      after,
      rect: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) } : null,
      exactIssue: visible ? "none" : "The chat passage exists, but the post-scroll rectangle was not fully visible."
    });
    return result;
  }

  function emitQueryNavigationDebug(result) {
    emitDebug(result && result.navigated
      ? result.exact ? "section-query:navigation-verified" : "section-query:navigation-approximate"
      : "section-query:navigation-failed", {
      surface: result && result.surface || "",
      sectionId: result && result.sectionId || "",
      passageId: result && result.passageId || "",
      pageNumber: result && result.pageNumber || 0,
      strategy: result && result.strategy || "",
      reason: result && result.reason || "",
      exactIssue: result && result.exact ? "none" : result && result.reason || "Navigation was not exact."
    });
  }

  function captureScrollPosition(container) {
    if (!container || container === window) return { type: "window", top: Math.round(window.scrollY || 0) };
    return { type: describeElement(container), top: Math.round(container.scrollTop || 0) };
  }

  function describeElement(element) {
    if (!element) return "";
    const tag = element.tagName ? element.tagName.toLowerCase() : "element";
    const id = element.id ? `#${element.id}` : "";
    const cls = typeof element.className === "string" && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";
    return `${tag}${id}${cls}`.slice(0, 80);
  }

  function countWordsLocal(text) {
    const matches = String(text || "").match(/\b[\w'-]+\b/g);
    return matches ? matches.length : 0;
  }

  function hashLocal(text) {
    if (runtime.engine && runtime.engine.helpers && typeof runtime.engine.helpers.hashText === "function") {
      return runtime.engine.helpers.hashText(text);
    }
    let hash = 2166136261;
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0).toString(36);
  }

  function jumpToUsefulPart(options = {}) {
    if (!runtime.model || runtime.model.pageProfile.quietMode) return false;
    const targetId = runtime.model.bestSectionId || runtime.model.skipTargetId;
    return scrollToSection(targetId, { highlight: true, actionType: "jump", source: options.source || "jump" });
  }

  function jumpToNextImportant(existingSelection, options = {}) {
    refreshActiveSection();
    if (!runtime.model || runtime.model.pageProfile.quietMode) return false;
    const selection = existingSelection && existingSelection.sectionId ? existingSelection : selectNextTarget("next");
    const targetId = selection.sectionId || runtime.model.nextImportantId
      || runtime.model.importantSections.find((section) => section.id !== runtime.view.activeId)?.id;
    runtime.model.nextImportantId = targetId || "";
    runtime.model.nextReason = selection.reason || runtime.model.nextReason || "";
    return scrollToSection(targetId, { highlight: true, actionType: "next", source: options.source || "next" });
  }

  function getSectionForAction(type) {
    if (!runtime.model || !Array.isArray(runtime.model.sections)) return null;
    const id = type === "next"
      ? selectNextTarget("action-peek", { preview: true }).sectionId || runtime.model.nextImportantId || runtime.model.importantSections.find((section) => section.id !== runtime.view.activeId)?.id
      : runtime.model.bestSectionId || runtime.model.skipTargetId;
    return runtime.model.sections.find((section) => section.id === id) || null;
  }

  function scrollToSection(id, options = {}) {
    if (!id || !runtime.model) return false;
    const section = runtime.model.sections.find((item) => item.id === id);
    if (!section) return false;
    if (isGoogleDocsSection(section)) {
      return performGoogleDocsSectionNavigation(section, options);
    }
    if (isChatSection(section)) {
      return navigateChatSection(section, options);
    }
    const anchor = section.anchor;
    if (!anchor || typeof anchor.getBoundingClientRect !== "function") return false;
    expandAncestors(section.id);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = getScrollOffset();
    const top = Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - offset);
    window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
    runtime.view.activeId = section.id;
    recordNavigationSelection(section, options.source || options.actionType || "section");
    if (runtime.ui) runtime.ui.updateActiveClasses(runtime.view.activeId);
    if (options.highlight) {
      window.clearTimeout(runtime.jumpEffectTimer);
      runtime.jumpEffectTimer = window.setTimeout(() => activateJumpEffect(section), prefersReducedMotion ? 60 : 480);
    }
    emitDebug("jump", {
      type: options.actionType || "section",
      sectionId: section.id,
      title: section.title,
      exactIssue: "none"
    });
    return true;
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

  function performGoogleDocsSectionNavigation(section, options = {}) {
    const target = resolveGoogleDocsTarget(section);
    if (!target) {
      showGoogleDocsNotice("Google Docs location is approximate because the exact editor block is not mounted.");
      return false;
    }
    const scrollContainer = findScrollContainer(target);
    const targetTop = target.getBoundingClientRect().top + (scrollContainer === window ? window.scrollY : scrollContainer.scrollTop) - 110;
    if (scrollContainer === window) {
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    } else {
      scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
    runtime.view.activeId = section.id;
    recordNavigationSelection(section, options.source || options.actionType || "section");
    if (runtime.ui) runtime.ui.updateActiveClasses(runtime.view.activeId);
    if (options.highlight && isGoogleDocsExactTarget(target)) {
      showGoogleDocsHighlight(target, section);
    } else {
      clearGoogleDocsHighlight();
      showGoogleDocsNotice("Google Docs location is approximate because the exact editor block is not mounted.");
    }
    emitDebug("google-docs:action:completed", {
      sectionId: section.id,
      exact: isGoogleDocsExactTarget(target),
      approximate: !isGoogleDocsExactTarget(target),
      exactIssue: isGoogleDocsExactTarget(target) ? "none" : "Google Docs exposed text without exact canvas coordinates."
    });
    return true;
  }

  function resolveGoogleDocsTarget(section) {
    const meta = section && section.unitMeta || {};
    const ref = String(meta.googleDocsNavigationRef || meta.navigationTarget || "").trim();
    if (ref) {
      const escaped = cssEscape(ref);
      const byRef = document.querySelector(`[data-pagepilot-google-docs-ref='${escaped}'], [data-google-docs-navigation-ref='${escaped}'], [data-navigation-ref='${escaped}']`);
      if (byRef) return byRef;
    }
    if (section.anchor && section.anchor.getBoundingClientRect) return section.anchor;
    const titles = [section.title, meta.googleDocsHeadingTitle, meta.heading].filter(Boolean);
    const candidates = Array.from(document.querySelectorAll("[role='heading'], h1, h2, h3, .kix-lineview, .kix-wordhtmlgenerator-word-node, [role='document'] *")).slice(0, 800);
    return candidates.find((node) => {
      const text = normalizeText(node.innerText || node.textContent || "");
      return text && titles.some((title) => text.includes(normalizeText(title).slice(0, 80)));
    }) || null;
  }

  function isGoogleDocsExactTarget(element) {
    if (!element || !element.getAttribute) return false;
    const value = `${element.getAttribute("data-pagepilot-exact") || ""} ${element.getAttribute("data-exact") || ""} ${element.className || ""}`;
    return /true|exact|kix-lineview|kix-wordhtmlgenerator-word-node/i.test(value);
  }

  function showGoogleDocsHighlight(target, section) {
    clearGoogleDocsHighlight();
    const rect = target.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "pagepilot-google-docs-highlight";
    overlay.textContent = String(section && section.title || "Current section").slice(0, 96);
    Object.assign(overlay.style, {
      position: "fixed",
      left: `${Math.max(12, rect.left - 8)}px`,
      top: `${Math.max(12, rect.top - 8)}px`,
      width: `${Math.max(120, Math.min(window.innerWidth - 24, rect.width + 16))}px`,
      height: `${Math.max(44, Math.min(window.innerHeight - 24, rect.height + 16))}px`,
      pointerEvents: "none"
    });
    document.documentElement.appendChild(overlay);
    runtime.googleDocsHighlightOverlay = overlay;
    window.setTimeout(clearGoogleDocsHighlight, JUMP_EFFECT_DURATION_MS);
  }

  function clearGoogleDocsHighlight() {
    if (runtime.googleDocsHighlightOverlay) {
      try {
        runtime.googleDocsHighlightOverlay.remove();
      } catch (error) {
        // Ignore stale highlight cleanup.
      }
    }
    runtime.googleDocsHighlightOverlay = null;
  }

  function showGoogleDocsNotice(message) {
    clearGoogleDocsNotice();
    const notice = document.createElement("div");
    notice.className = "pagepilot-google-docs-notice";
    notice.textContent = message;
    document.documentElement.appendChild(notice);
    runtime.googleDocsNotice = notice;
    runtime.googleDocsNoticeTimer = window.setTimeout(clearGoogleDocsNotice, 4200);
  }

  function clearGoogleDocsNotice() {
    if (runtime.googleDocsNoticeTimer) window.clearTimeout(runtime.googleDocsNoticeTimer);
    runtime.googleDocsNoticeTimer = null;
    if (runtime.googleDocsNotice) {
      try {
        runtime.googleDocsNotice.remove();
      } catch (error) {
        // Ignore stale notice cleanup.
      }
    }
    runtime.googleDocsNotice = null;
  }

  function getScrollOffset() {
    const candidates = Array.from(document.querySelectorAll("header, nav, [role='banner'], [class*='sticky' i], [class*='fixed' i]")).slice(0, 80);
    let fixedBottom = 0;
    candidates.forEach((element) => {
      try {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const pinned = (style.position === "fixed" || style.position === "sticky") && rect.top <= 12 && rect.bottom > 0;
        const usefulSize = rect.height >= 28 && rect.height <= 220 && rect.width >= window.innerWidth * 0.42;
        if (pinned && usefulSize) fixedBottom = Math.max(fixedBottom, rect.bottom);
      } catch (error) {
        // Ignore traversal issues.
      }
    });
    return fixedBottom ? Math.min(240, Math.ceil(fixedBottom + 16)) : 72;
  }

  function toggleSectionCollapse(id) {
    if (!id) return;
    if (runtime.view.collapsedSectionIds.has(id)) {
      runtime.view.collapsedSectionIds.delete(id);
    } else {
      runtime.view.collapsedSectionIds.add(id);
    }
    if (runtime.model && Array.isArray(runtime.model.sections)) {
      runtime.model.sections.forEach((section) => {
        if (section.id === id) section.isCollapsed = runtime.view.collapsedSectionIds.has(id);
      });
    }
    render();
  }

  function expandAncestors(id) {
    if (!runtime.model || !id) return false;
    let changed = false;
    const byId = new Map(runtime.model.sections.map((section) => [section.id, section]));
    let current = byId.get(id);
    while (current && current.parentId) {
      if (runtime.view.collapsedSectionIds.delete(current.parentId)) changed = true;
      current = byId.get(current.parentId);
    }
    if (changed) {
      runtime.model.sections.forEach((section) => {
        section.isCollapsed = runtime.view.collapsedSectionIds.has(section.id);
      });
      render();
    }
    return changed;
  }

  function requestScrollUpdate() {
    if (runtime.scrollTicking) return;
    runtime.scrollTicking = true;
    window.requestAnimationFrame(() => {
      runtime.scrollTicking = false;
      refreshActiveSection();
      if (runtime.ui && runtime.ui.updateProgress && runtime.model) runtime.ui.updateProgress(runtime.model);
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
    if (!runtime.model || !Array.isArray(runtime.model.sections)) return;
    runtime.model.sections.forEach((section) => {
      if (section.anchor && section.anchor.getBoundingClientRect) {
        section.top = section.anchor.getBoundingClientRect().top + window.scrollY;
      }
    });
  }

  function refreshActiveSection() {
    if (!runtime.model || !Array.isArray(runtime.model.sections) || !runtime.model.sections.length) return;
    refreshSectionPositions();
    const marker = window.scrollY + Math.min(window.innerHeight * 0.42, 380);
    let active = runtime.model.sections[0];
    runtime.model.sections.forEach((section) => {
      if (section.top <= marker) active = section;
    });
    if (active && active.id !== runtime.view.activeId) {
      runtime.view.activeId = active.id;
      if (runtime.ui) runtime.ui.updateActiveClasses(runtime.view.activeId);
    }
  }

  function activateJumpEffect(section) {
    clearJumpEffect();
    if (!section || !section.anchor) return;
    runtime.jumpEffectActive = true;
    runtime.jumpEffectLockedUntil = Date.now() + JUMP_EFFECT_SCROLL_LOCK_MS;
    const anchor = section.anchor;
    if (isSafeJumpEffectElement(anchor)) {
      anchor.classList.add("pagepilot-answer-target");
      runtime.highlightedElements.push(anchor);
    }
    runtime.jumpEffectTimer = window.setTimeout(clearJumpEffect, JUMP_EFFECT_DURATION_MS);
  }

  function isSafeJumpEffectElement(element) {
    if (!element || !element.classList) return false;
    if (element.closest && element.closest(`#${ROOT_ID}`)) return false;
    return true;
  }

  function clearJumpEffectFromUser() {
    if (runtime.jumpEffectActive && Date.now() > runtime.jumpEffectLockedUntil) clearJumpEffect();
  }

  function clearJumpEffect() {
    window.clearTimeout(runtime.jumpEffectTimer);
    runtime.jumpEffectTimer = null;
    runtime.jumpEffectActive = false;
    runtime.jumpEffectLockedUntil = 0;
    runtime.highlightedElements.forEach((element) => element.classList.remove("pagepilot-answer-target"));
    runtime.dimmedElements.forEach((element) => element.classList.remove("pagepilot-fluff-dim"));
    runtime.highlightedElements = [];
    runtime.dimmedElements = [];
  }

  function handleShortcut(event) {
    if (isTypingTarget(event.target)) return;
    const key = String(event.key || "").toLowerCase();
    const isMac = /\b(mac|iphone|ipad|ipod)\b/i.test(navigator.platform || "");
    const modifier = isMac ? event.altKey || event.metaKey : event.altKey;
    if (!modifier || event.ctrlKey || event.shiftKey) return;
    if (key === "j") {
      event.preventDefault();
      const section = getSectionForAction("jump");
      const ok = jumpToUsefulPart({ source: "keyboard" });
      setActionResult("jump", ok, { section });
    } else if (key === "n") {
      event.preventDefault();
      const section = getSectionForAction("next");
      const ok = jumpToNextImportant(null, { source: "keyboard" });
      setActionResult("next", ok, { section });
    }
  }

  function isTypingTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
  }

  function setActionResult(type, ok, details = {}) {
    const section = details.section || null;
    runtime.lastAction = {
      ok: Boolean(ok),
      type,
      message: details.message || (ok
        ? type === "next"
          ? (runtime.model && runtime.model.nextReason || "Moved to the next useful section.")
          : type === "query"
            ? "Found the matching section."
            : "Jumped to the useful section."
        : type === "query"
          ? "No strong section match found on this page."
          : "SkimRoute could not find a jump target on this page yet."),
      at: Date.now(),
      phase: details.phase || (ok ? "completed" : "blocked"),
      pageNumber: 0,
      sectionId: section && section.id || ""
    };
    emitDebug("action-result", {
      type,
      ok: Boolean(ok),
      sectionId: section && section.id || "",
      exactIssue: ok ? "none" : "The action command returned without a confirmed jump target."
    });
    return runtime.lastAction;
  }

  function getPublicStats() {
    const model = runtime.model;
    if (!model) return { ok: false, error: "SkimRoute is still checking this page locally." };
    const sections = Array.isArray(model.sections) ? model.sections : [];
    const importantSections = Array.isArray(model.importantSections) ? model.importantSections : [];
    const words = Number(model.totalReadableWords || model.totalWords || 0);
    const bestSection = sections.find((section) => section.id === model.bestSectionId) || null;
    refreshNextPreview("stats");
    const nextImportant = sections.find((section) => section.id === model.nextImportantId)
      || importantSections.find((section) => !bestSection || section.id !== bestSection.id)
      || null;
    const quietMode = Boolean(model.pageProfile && model.pageProfile.quietMode);
    const action = runtime.lastAction && Date.now() - Number(runtime.lastAction.at || 0) < 12000 ? runtime.lastAction : null;
    const shortPage = words < window.PagePilotEngine.constants.MIN_USEFUL_WORDS || (sections.length < 2 && !model.hasStrongTarget);
    const bestReason = bestSection ? reasonForPublicSection(bestSection) : model.pageProfile.reason || "";
    return {
      ok: true,
      open: runtime.view.mode === "open",
      mode: runtime.view.mode,
      hiddenOnPage: runtime.view.mode === "snoozed",
      snoozed: runtime.view.mode === "snoozed",
      sections: sections.length,
      important: importantSections.length,
      words,
      shortPage,
      quietMode,
      pageType: model.pageProfile.type,
      pageLabel: model.pageProfile.label,
      pageSubtype: model.pageProfile.searchSubtype || "",
      qualityMessage: model.pageProfile.qualityMessage || "",
      chatReady: model.pageProfile.type === "chat" && sections.length >= 1,
      snapshotSource: "core-runtime",
      usableSnapshot: false,
      recoveryPending: false,
      pdfTerminal: false,
      readingConfidence: model.pageProfile.readingConfidence,
      reason: model.pageProfile.reason || "",
      confidence: Number(model.confidence) || 0,
      confidenceTier: model.confidenceTier,
      confidenceLabel: model.confidenceLabel || "",
      hasStrongTarget: Boolean(model.hasStrongTarget),
      loading: false,
      loadingReason: model.pageProfile.diagnosticHint || model.pageProfile.reason || "",
      canJump: Boolean(bestSection && model.hasStrongTarget && !quietMode && canJumpToSection(bestSection)),
      canJumpNext: Boolean(nextImportant && !quietMode && canJumpToSection(nextImportant)),
      nextImportantId: nextImportant ? nextImportant.id : "",
      nextImportantTitle: nextImportant ? nextImportant.title : "",
      nextReason: model.nextReason || (nextImportant ? "Next useful section" : ""),
      bestTitle: bestSection && model.hasStrongTarget ? bestSection.title : "",
      bestReason,
      whyReason: bestReason,
      quietReason: model.pageProfile.quietReason || model.pageProfile.reason || "",
      archetype: model.pageProfile.type,
      bestLabel: model.bestLabel || "",
      bestKind: model.bestKind || bestSection && bestSection.intelligence && bestSection.intelligence.role || "",
      bestKindLabel: model.bestKindLabel || bestSection && bestSection.intelligence && bestSection.intelligence.roleLabel || bestSection && bestSection.metrics && bestSection.metrics.sectionKindLabel || "",
      targetConfidenceReason: model.targetConfidenceReason || "",
      savedMinutes: model.savedMinutes || 0,
      lastActionOk: action ? Boolean(action.ok) : null,
      lastActionType: action ? action.type || "" : "",
      lastActionMessage: action ? action.message || "" : "",
      lastActionPhase: action ? action.phase || "" : "",
      lastActionTargetPage: 0,
      lastActionAt: action ? action.at || 0 : 0,
      sectionQuery: normalizePublicSectionQuery(runtime.view.sectionQuery),
      runtimeState: window.PagePilotRuntimeLoader && window.PagePilotRuntimeLoader.getRuntimeState
        ? window.PagePilotRuntimeLoader.getRuntimeState()
        : null
    };
  }

  function normalizePublicSectionQuery(query) {
    const state = query || createEmptySectionQuery();
    return {
      text: String(state.text || ""),
      status: String(state.status || "idle"),
      sectionId: String(state.sectionId || ""),
      passageId: String(state.passageId || ""),
      surface: String(state.surface || ""),
      pageNumber: Number(state.pageNumber) || 0,
      title: String(state.title || ""),
      label: String(state.label || ""),
      roleLabel: String(state.roleLabel || ""),
      snippet: String(state.snippet || ""),
      confidenceLabel: String(state.confidenceLabel || ""),
      score: Number(state.score) || 0,
      ocrExactMatches: Number(state.ocrExactMatches) || 0,
      ocrFuzzyMatches: Number(state.ocrFuzzyMatches) || 0,
      ocrFuzzyTerms: Array.isArray(state.ocrFuzzyTerms) ? state.ocrFuzzyTerms.slice(0, 4).map(String) : [],
      ocrPhraseAcrossLines: Boolean(state.ocrPhraseAcrossLines),
      ocrConfidenceAdjustment: Number(state.ocrConfidenceAdjustment) || 0,
      reason: String(state.reason || ""),
      canNavigate: Boolean(state.canNavigate),
      weakRequiresConfirm: Boolean(state.weakRequiresConfirm),
      hasNavigated: Boolean(state.hasNavigated),
      isCurrentTarget: Boolean(state.isCurrentTarget),
      canReturnToMatch: Boolean(state.canReturnToMatch),
      targetSectionId: String(state.targetSectionId || ""),
      targetPassageId: String(state.targetPassageId || ""),
      targetSurface: String(state.targetSurface || ""),
      targetPageNumber: Number(state.targetPageNumber) || 0,
      targetNavigation: normalizePublicQueryNavigation(state.targetNavigation),
      navigation: normalizePublicQueryNavigation(state.navigation),
      alternatives: Array.isArray(state.alternatives) ? state.alternatives.slice(0, 2).map(normalizePublicSectionQueryAlternative) : [],
      requestId: Number(state.requestId) || 0,
      updatedAt: Number(state.updatedAt) || 0
    };
  }

  function normalizePublicSectionQueryAlternative(item) {
    return {
      sectionId: String(item && item.sectionId || ""),
      passageId: String(item && item.passageId || ""),
      surface: String(item && item.surface || ""),
      pageNumber: Number(item && item.pageNumber) || 0,
      title: String(item && item.title || ""),
      label: String(item && item.label || ""),
      roleLabel: String(item && item.roleLabel || ""),
      snippet: String(item && item.snippet || ""),
      confidenceLabel: String(item && item.confidenceLabel || "Weak"),
      score: Number(item && item.score) || 0,
      ocrExactMatches: Number(item && item.ocrExactMatches) || 0,
      ocrFuzzyMatches: Number(item && item.ocrFuzzyMatches) || 0,
      ocrFuzzyTerms: Array.isArray(item && item.ocrFuzzyTerms) ? item.ocrFuzzyTerms.slice(0, 4).map(String) : [],
      ocrPhraseAcrossLines: Boolean(item && item.ocrPhraseAcrossLines),
      ocrConfidenceAdjustment: Number(item && item.ocrConfidenceAdjustment) || 0,
      status: String(item && item.status || "weak"),
      reason: String(item && item.reason || ""),
      canNavigate: Boolean(item && item.canNavigate),
      weakRequiresConfirm: true,
      navigation: normalizePublicQueryNavigation(item && item.navigation)
    };
  }

  function normalizePublicQueryNavigation(navigation) {
    const state = navigation || createEmptyQueryNavigationResult();
    return {
      found: Boolean(state.found),
      navigated: Boolean(state.navigated),
      verified: Boolean(state.verified),
      exact: Boolean(state.exact),
      surface: String(state.surface || ""),
      sectionId: String(state.sectionId || ""),
      passageId: String(state.passageId || ""),
      pageNumber: Number(state.pageNumber) || 0,
      reason: String(state.reason || ""),
      strategy: String(state.strategy || "")
    };
  }

  function reasonForPublicSection(section) {
    if (!section || !section.metrics) return "Useful section";
    if (section.intelligence && Array.isArray(section.intelligence.whyReasons) && section.intelligence.whyReasons[0]) {
      return section.intelligence.whyReasons[0];
    }
    if (section.unitMeta && section.unitMeta.diagnosticReason) return section.unitMeta.diagnosticReason;
    if (section.metrics.selectionReason) return section.metrics.selectionReason;
    if (section.metrics.matched && section.metrics.matched.summary) return "Summarizes the useful parts";
    if (section.metrics.matched && (section.metrics.matched.conciseAnswer || section.metrics.matched.answer)) return "Has a direct answer signal";
    if (section.metrics.matched && section.metrics.matched.procedure) return "Contains step-by-step guidance";
    if (section.metrics.codeBlocks > 0) return "Includes a practical example";
    return `${section.wordCount || 0} focused words`;
  }

  function canJumpToSection(section) {
    return Boolean(section && section.anchor && typeof section.anchor.getBoundingClientRect === "function");
  }

  function findScrollContainer(element) {
    let current = element && element.parentElement ? element.parentElement : null;
    while (current && current !== document.body && current !== document.documentElement) {
      try {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY || style.overflow;
        if (/(auto|scroll|overlay)/i.test(overflowY) && current.scrollHeight > current.clientHeight + 24) return current;
      } catch (error) {
        // Ignore traversal issues.
      }
      current = current.parentElement;
    }
    return window;
  }

  function markRootVersion() {
    try {
      const root = document.getElementById(ROOT_ID);
      if (root) root.dataset.skimrouteVersion = SKIMROUTE_CONTENT_VERSION;
    } catch (error) {
      // Ignore marker failures.
    }
  }

  function dismissOnboarding() {
    runtime.view.showOnboarding = false;
    storageSet(STORAGE_KEYS.onboardingSeen, true);
    render();
  }

  function hasChromeLocalStorage() {
    return Boolean(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      if (!hasChromeLocalStorage()) {
        resolve(null);
        return;
      }
      try {
        chrome.storage.local.get(key, (result) => {
          resolve(result ? result[key] : null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      if (!hasChromeLocalStorage()) {
        resolve(false);
        return;
      }
      try {
        chrome.storage.local.set({ [key]: value }, () => resolve(true));
      } catch (error) {
        resolve(false);
      }
    });
  }

  function storageRemove(key) {
    return new Promise((resolve) => {
      if (!hasChromeLocalStorage()) {
        resolve(false);
        return;
      }
      try {
        chrome.storage.local.remove(key, () => resolve(true));
      } catch (error) {
        resolve(false);
      }
    });
  }

  function ensurePdfRuntime(reason = "unknown") {
    return ensureOptionalRuntime("pdf", "assets/pdf-runtime.js", reason);
  }

  function ensureOcrRuntime(reason = "unknown") {
    return ensureOptionalRuntime("ocr", "assets/ocr-runtime.js", reason);
  }

  function ensureOptionalRuntime(name, assetPath, reason) {
    const state = runtime.optionalRuntimes[name];
    if (!state) return Promise.reject(new Error(`Unknown runtime: ${name}`));
    const loadReason = String(reason || "unknown");
    if (!state.reasons.includes(loadReason)) state.reasons.push(loadReason);
    if (state.ready) return Promise.resolve(window[`PagePilot${capitalizeRuntimeName(name)}Runtime`] || true);
    if (state.promise) return state.promise;

    state.error = "";
    const eventPrefix = `${name}-runtime`;
    emitDebug(`${eventPrefix}-loading`, {
      reason: loadReason,
      assetPath,
      exactIssue: "none"
    });

    state.promise = import(chrome.runtime.getURL(assetPath))
      .then((module) => {
        state.ready = true;
        state.initializedAt = Date.now();
        window[`__PAGEPILOT_${name.toUpperCase()}_RUNTIME_READY__`] = true;
        emitDebug(`${eventPrefix}-ready`, {
          reason: loadReason,
          assetPath,
          exactIssue: "none"
        });
        return module;
      })
      .catch((error) => {
        state.promise = null;
        state.ready = false;
        state.error = String(error && error.message ? error.message : error);
        emitDebug("runtime load failure", {
          runtime: name,
          reason: loadReason,
          assetPath,
          error: state.error,
          exactIssue: "The optional runtime could not be imported from the packaged extension asset."
        });
        throw error;
      });
    return state.promise;
  }

  function capitalizeRuntimeName(name) {
    return String(name || "").replace(/^[a-z]/, (value) => value.toUpperCase());
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function destroy(reason = "destroy") {
    emitDebug("destroy", {
      reason,
      activeMode: runtime.view.mode,
      lastUrl: runtime.currentUrl
    });
    window.clearTimeout(runtime.scanTimer);
    clearWarmupScans();
    window.clearInterval(runtime.urlWatchTimer);
    clearJumpEffect();
    clearGoogleDocsHighlight();
    clearGoogleDocsNotice();
    if (runtime.mutationObserver) runtime.mutationObserver.disconnect();
    runtime.listeners.forEach((entry) => {
      const target = entry.target || window;
      target.removeEventListener(entry.type, entry.listener, entry.options);
    });
    runtime.listeners = [];
    if (runtime.ui) runtime.ui.destroy();
    cleanupStaleSkimRouteDom(reason);
    window.__PAGEPILOT_LOADED__ = false;
    window.__SKIMROUTE_CONTENT_VERSION__ = "";
    if (window.__PAGEPILOT_DESTROY__ === destroy) window.__PAGEPILOT_DESTROY__ = null;
  }
})();
