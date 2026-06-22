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
          const ok = jumpToUsefulPart();
          setActionResult("jump", ok, { section });
          return ok;
        },
        onNext: () => {
          const section = getSectionForAction("next");
          const ok = jumpToNextImportant();
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

    if (isPdfMessage(message) || isPdfLikePage()) {
      ensurePdfRuntime(`message:${message.type || "unknown"}`)
        .then(() => {
          try {
            chrome.runtime.sendMessage;
            sendResponse({ ok: false, loading: true, pageType: "pdf", error: "PDF runtime is taking over this page." });
          } catch (error) {
            sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        })
        .catch((error) => sendResponse({
          ok: false,
          pageType: "pdf",
          error: String(error && error.message ? error.message : error)
        }));
      return true;
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
      const ok = jumpToUsefulPart();
      setActionResult("jump", ok, { section });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_NEXT_IMPORTANT") {
      setMode("open", { focus: true, persist: true });
      const section = getSectionForAction("next");
      const ok = jumpToNextImportant();
      setActionResult("next", ok, { section });
      sendResponse(getPublicStats());
      return true;
    }

    if (message.type === "PAGEPILOT_STATUS") {
      return sendFreshPublicStats(sendResponse, { reason: "status" });
    }

    return false;
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

  function jumpToUsefulPart() {
    if (!runtime.model || runtime.model.pageProfile.quietMode) return false;
    const targetId = runtime.model.bestSectionId || runtime.model.skipTargetId;
    return scrollToSection(targetId, { highlight: true, actionType: "jump" });
  }

  function jumpToNextImportant() {
    refreshActiveSection();
    if (!runtime.model || runtime.model.pageProfile.quietMode) return false;
    const targetId = runtime.model.nextImportantId
      || runtime.model.importantSections.find((section) => section.id !== runtime.view.activeId)?.id;
    return scrollToSection(targetId, { highlight: true, actionType: "next" });
  }

  function getSectionForAction(type) {
    if (!runtime.model || !Array.isArray(runtime.model.sections)) return null;
    const id = type === "next"
      ? runtime.model.nextImportantId || runtime.model.importantSections.find((section) => section.id !== runtime.view.activeId)?.id
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
    const anchor = section.anchor;
    if (!anchor || typeof anchor.getBoundingClientRect !== "function") return false;
    expandAncestors(section.id);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = getScrollOffset();
    const top = Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - offset);
    window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
    runtime.view.activeId = section.id;
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
      const ok = jumpToUsefulPart();
      setActionResult("jump", ok, { section });
    } else if (key === "n") {
      event.preventDefault();
      const section = getSectionForAction("next");
      const ok = jumpToNextImportant();
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
      message: details.message || (ok ? type === "next" ? "Moved to the next important section." : "Jumped to the useful section." : "SkimRoute could not find a jump target on this page yet."),
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
      nextImportantTitle: nextImportant ? nextImportant.title : "",
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
      runtimeState: window.PagePilotRuntimeLoader && window.PagePilotRuntimeLoader.getRuntimeState
        ? window.PagePilotRuntimeLoader.getRuntimeState()
        : null
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
