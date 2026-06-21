(function () {
  "use strict";

  if (window.PagePilotUI) {
    return;
  }

  const ROOT_ID = "pagepilot-root";
  const PDF_MODE_OPENING_COPY = "Opening PDF Mode so SkimRoute can scroll and highlight sections reliably.";
  const PDF_OCR_UNREADABLE_MESSAGE = "OCR finished, but this scan could not be read clearly. Try another PDF or a higher-resolution scan.";
  const PDF_OCR_WORKER_START_MESSAGE = "OCR worker could not start in this browser context.";
  const PDF_OCR_DETECTION_MESSAGE = "Checking whether this PDF needs OCR...";
  const PDF_OCR_IMAGE_PROMPT_MESSAGE = "This PDF is image-based. Run OCR to extract its text locally.";
  const PDF_OCR_FAST_EXPECTATION_MESSAGE = "Fast OCR runs locally and may take up to a minute on some devices.";
  const PDF_OCR_BETTER_EXPECTATION_MESSAGE = "Better OCR runs locally and may take 1-2 minutes on scanned PDFs.";
  const PDF_OCR_RUNNING_MESSAGE = "Reading scanned text locally. This may take a minute.";
  const PDF_OCR_LONG_RUNNING_MESSAGE = "Still reading the scan locally. Complex scans can take longer on slower devices.";

  function createUI(options) {
    const callbacks = options.callbacks || {};
    const helpers = options.helpers;
    let root = null;
    let sidebar = null;
    let tab = null;
    let lastFocusedBeforeOpen = null;

    function mount() {
      if (document.getElementById(ROOT_ID)) {
        root = document.getElementById(ROOT_ID);
        sidebar = root.querySelector(".pp-sidebar");
        tab = root.querySelector(".pp-edge-tab");
        return;
      }

      root = document.createElement("div");
      root.id = ROOT_ID;
      root.innerHTML = shellTemplate();
      document.documentElement.appendChild(root);
      sidebar = root.querySelector(".pp-sidebar");
      tab = root.querySelector(".pp-edge-tab");
      attachEvents();
    }

        function render(model, viewState) {
      if (!root || !model) return;
      const mode = viewState.mode || "minimized";
      const profile = model.pageProfile || {};
      const loading = profile.state === "loading";
      const quietMode = !loading && Boolean(profile.quietMode);
      const activeMode = mode === "open"
        ? "open"
        : mode === "snoozed"
          ? "snoozed"
          : quietMode
            ? "quiet"
            : "minimized";
      const bestSection = findSection(model, model.bestSectionId);
      const nextSection = findSection(model, model.nextImportantId);
      const sectionCount = model.sections.length;
      const importantCount = model.importantSections.length;
      const ocrPrompt = profile.type === "pdf" && profile.state === "ocr-prompt";
      const ocrUnreadable = profile.type === "pdf" && profile.state === "ocr-unreadable";
      const ocrFailed = profile.type === "pdf" && profile.state === "ocr-failed";
      const ocrTerminal = ocrUnreadable || ocrFailed;
      const pdfOcrCanCancel = Boolean(profile.type === "pdf" && profile.pdfOcrActive && profile.pdfOcrCanCancel);
      const pdfLoadingMessage = profile.type === "pdf" && loading ? pdfLoadingCopy(profile) : "";
      const canJump = Boolean(bestSection && model.hasStrongTarget && !quietMode && !loading);
      const canNext = Boolean(nextSection && !quietMode && !loading);
      const canRunOcr = Boolean(profile.type === "pdf" && !profile.pdfOcrActive && !loading && (profile.pdfOcrCanRunFast || profile.pdfOcrCanRunBetter));

      root.dataset.mode = loading ? "loading" : activeMode;
      root.classList.toggle("pp-open", activeMode === "open");
      root.classList.toggle("pp-minimized", activeMode === "minimized");
      root.classList.toggle("pp-snoozed", activeMode === "snoozed");
      root.classList.toggle("pp-quiet", activeMode === "quiet");
      root.classList.toggle("pp-quiet-page", quietMode);
      root.classList.toggle("pp-loading-page", loading);
      root.classList.toggle("pp-show-tip", Boolean(viewState.showOnboarding && activeMode === "open"));
      tab.setAttribute("aria-expanded", String(activeMode === "open"));
      tab.setAttribute("aria-label", tabLabel(model, activeMode, loading));
      setText(".pp-tab-title", tabTitle(model, activeMode, loading));
      setText(".pp-tab-meta", tabMeta(model, activeMode, loading));

      setText(".pp-brand-subtitle", loading ? (profile.type === "pdf" ? "PDF working" : profile.type === "chat" ? "Waiting..." : "Scanning...") : ocrTerminal ? (ocrUnreadable ? "OCR finished" : "OCR failed") : ocrPrompt ? "PDF needs OCR" : quietMode ? "Quiet here" : "Navigation layer");
      setText(".pp-kicker", loading ? `${profile.label || "Page"} \u2022 ${profile.type === "pdf" ? "working" : profile.type === "chat" ? "waiting" : "scanning"}` : ocrTerminal ? `${profile.label || "PDF"} \u2022 OCR issue` : ocrPrompt ? `${profile.label || "PDF"} \u2022 OCR needed` : quietMode ? `${profile.label || "Page"} \u2022 quiet` : `${profile.label || "Page"} guide`);
      setText(".pp-hero-title", loading ? (pdfLoadingMessage || loadingTitle(profile)) : ocrTerminal ? (ocrUnreadable ? "This scan could not be read clearly." : profile.reason === PDF_OCR_WORKER_START_MESSAGE ? PDF_OCR_WORKER_START_MESSAGE : "OCR could not finish reading this PDF.") : ocrPrompt ? "This PDF is image-based." : heroTitle(model, bestSection, quietMode));
      setText(".pp-summary-line", loading ? loadingSummaryLine(profile, pdfLoadingMessage) : ocrTerminal ? (ocrUnreadable ? PDF_OCR_UNREADABLE_MESSAGE : profile.reason || PDF_OCR_UNREADABLE_MESSAGE) : ocrPrompt ? pdfOcrPromptCopy(profile) : summaryLine(model, bestSection, quietMode));
      setText(".pp-meter-value", loading ? "..." : `${progressPercent()}%`);
      setText("[data-pp-stat='time']", loading ? loadingStat(profile) : ocrTerminal ? "OCR issue" : ocrPrompt ? "OCR needed" : readingTimeCopy(model));
      setText("[data-pp-stat='sections']", loading ? loadingStat(profile) : ocrTerminal ? "OCR" : ocrPrompt ? "OCR" : quietMode ? "Quiet" : String(sectionCount));
      setText("[data-pp-stat='important']", loading ? "..." : ocrPrompt ? "..." : quietMode ? "Low" : String(importantCount));
      setText(".pp-important-count", loading ? "..." : String(importantCount));
      setText(".pp-section-count", loading ? "..." : String(sectionCount));

      const startCard = root.querySelector(".pp-start-card");
      startCard.dataset.sectionId = canJump ? bestSection.id : "";
      startCard.disabled = loading || !canJump;
      startCard.setAttribute("aria-disabled", String(loading || !canJump));
      setText(".pp-start-label", loading ? loadingStat(profile) : startLabel(model, canJump));
      setText(".pp-start-title", loading ? (pdfLoadingMessage || loadingTitle(profile)) : canJump ? bestSection.title : lowSignalTitle(model));
      setText(".pp-start-reason", loading ? loadingReasonLine(profile) : canJump ? formatWhyReason(reasonForSection(bestSection)) : lowSignalReason(model));

      const skipButton = root.querySelector(".pp-skip");
      const nextButton = root.querySelector(".pp-next");
      const ocrButton = root.querySelector(".pp-pdf-ocr");
      const cancelOcrButton = root.querySelector(".pp-pdf-ocr-cancel");
      skipButton.disabled = loading || !canJump;
      nextButton.disabled = loading || !canNext;
      ocrButton.hidden = !canRunOcr;
      ocrButton.disabled = loading || !canRunOcr;
      cancelOcrButton.hidden = !pdfOcrCanCancel;
      cancelOcrButton.disabled = !pdfOcrCanCancel;
      skipButton.setAttribute("aria-disabled", String(loading || !canJump));
      nextButton.setAttribute("aria-disabled", String(loading || !canNext));
      ocrButton.setAttribute("aria-disabled", String(loading || !canRunOcr));
      cancelOcrButton.setAttribute("aria-disabled", String(!pdfOcrCanCancel));
      setText(".pp-pdf-ocr span", pdfOcrButtonLabel(profile, ocrTerminal));
      ocrButton.title = pdfOcrButtonTitle(profile, ocrTerminal);
      setText(".pp-pdf-ocr-cancel span", "Cancel OCR");
      setText(".pp-next-label", loading ? "Scanning" : canNext ? model.nextReason || "Next important" : "No next jump");

      root.querySelector(".pp-overview").classList.toggle("pp-low-signal", loading || quietMode || !model.hasStrongTarget);
      root.querySelector(".pp-important-panel").hidden = loading || quietMode || !importantCount;
      root.querySelector(".pp-jump-panel").hidden = quietMode || (!loading && !sectionCount);
      renderSectionQuery(viewState.sectionQuery, { loading, quietMode, sectionCount });
      renderImportantList(model);
      renderJumpList(model, viewState);
      updateActiveClasses(viewState.activeId);

      const live = root.querySelector(".pp-live");
      live.textContent = loading ? loadingReasonLine(profile) : liveStatus(model, quietMode);
    }

    function attachEvents() {
      tab.addEventListener("click", () => callbacks.onOpen && callbacks.onOpen());

      root.querySelector(".pp-minimize").addEventListener("click", () => callbacks.onMinimize && callbacks.onMinimize());
      root.querySelector(".pp-snooze").addEventListener("click", () => callbacks.onSnooze && callbacks.onSnooze());
      root.querySelector(".pp-skip").addEventListener("click", () => callbacks.onJump && callbacks.onJump());
      root.querySelector(".pp-next").addEventListener("click", () => callbacks.onNext && callbacks.onNext());
      root.querySelector(".pp-pdf-ocr").addEventListener("click", () => callbacks.onRunPdfOcr && callbacks.onRunPdfOcr());
      root.querySelector(".pp-pdf-ocr-cancel").addEventListener("click", () => callbacks.onCancelPdfOcr && callbacks.onCancelPdfOcr());
      root.querySelector(".pp-tip-dismiss").addEventListener("click", () => callbacks.onDismissTip && callbacks.onDismissTip());

      root.addEventListener("click", (event) => {
        const queryClear = event.target.closest(".pp-query-clear");
        if (queryClear) {
          event.preventDefault();
          callbacks.onClearQuery && callbacks.onClearQuery();
          return;
        }
        const querySubmit = event.target.closest(".pp-query-submit");
        if (querySubmit) {
          event.preventDefault();
          const input = root.querySelector(".pp-query-input");
          callbacks.onQuery && callbacks.onQuery(input && input.value || "");
          return;
        }
        const queryGo = event.target.closest(".pp-query-go");
        if (queryGo) {
          event.preventDefault();
          callbacks.onNavigateQueryResult && callbacks.onNavigateQueryResult();
          return;
        }
        const queryReturn = event.target.closest(".pp-query-return");
        if (queryReturn) {
          event.preventDefault();
          if (queryReturn.disabled) return;
          callbacks.onNavigateQueryResult && callbacks.onNavigateQueryResult({ returnToMatch: true });
          return;
        }
        const queryBetterOcr = event.target.closest(".pp-query-better-ocr");
        if (queryBetterOcr) {
          event.preventDefault();
          if (queryBetterOcr.disabled) return;
          queryBetterOcr.disabled = true;
          queryBetterOcr.textContent = "Running Better OCR...";
          callbacks.onRunQueryBetterOcr && callbacks.onRunQueryBetterOcr();
          return;
        }
        const queryAlt = event.target.closest(".pp-query-alt");
        if (queryAlt) {
          event.preventDefault();
          callbacks.onNavigateQueryResult && callbacks.onNavigateQueryResult({
            sectionId: queryAlt.dataset.sectionId || "",
            passageId: queryAlt.dataset.passageId || ""
          });
          return;
        }
        const toggle = event.target.closest("[data-toggle-section]");
        if (toggle) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onToggleCollapse && callbacks.onToggleCollapse(toggle.dataset.toggleSection);
          return;
        }

        const button = event.target.closest("[data-section-id]");
        if (button && button.dataset.sectionId) {
          callbacks.onSection && callbacks.onSection(button.dataset.sectionId, {
            highlight: true
          });
        }
      });

      root.addEventListener("keydown", (event) => {
        const queryInput = event.target.closest && event.target.closest(".pp-query-input");
        if (queryInput) {
          if (event.key === "Enter") {
            event.preventDefault();
            callbacks.onQuery && callbacks.onQuery(queryInput.value || "");
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            queryInput.value = "";
            callbacks.onClearQuery && callbacks.onClearQuery();
            return;
          }
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          callbacks.onMinimize && callbacks.onMinimize();
          return;
        }

        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          return;
        }

        const current = event.target.closest && event.target.closest(".pp-section-item, .pp-collapse-toggle, .pp-start-card, .pp-skip, .pp-next, .pp-pdf-ocr, .pp-pdf-ocr-cancel, .pp-query-input, .pp-query-submit, .pp-query-clear, .pp-query-go, .pp-query-return, .pp-query-better-ocr, .pp-query-alt");
        if (!current) return;
        const focusables = getFocusableItems();
        const index = focusables.indexOf(current);
        if (index === -1) return;
        event.preventDefault();
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? focusables.length - 1
            : event.key === "ArrowDown"
              ? Math.min(focusables.length - 1, index + 1)
              : Math.max(0, index - 1);
        focusables[nextIndex].focus();
      });
    }

    function focusPanel() {
      if (!sidebar) return;
      lastFocusedBeforeOpen = document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : lastFocusedBeforeOpen;
      sidebar.focus({ preventScroll: true });
    }

    function focusTab() {
      if (tab) {
        tab.focus({ preventScroll: true });
      } else if (lastFocusedBeforeOpen && lastFocusedBeforeOpen.focus) {
        lastFocusedBeforeOpen.focus({ preventScroll: true });
      }
    }

    function updateActiveClasses(activeId) {
      if (!root) return;
      root.querySelectorAll("[data-section-id]").forEach((button) => {
        button.classList.toggle("pp-active", Boolean(activeId && button.dataset.sectionId === activeId));
        if (button.classList.contains("pp-active")) {
          button.setAttribute("aria-current", "true");
        } else {
          button.removeAttribute("aria-current");
        }
      });
    }

    function updateProgress(model) {
      if (!root || !model) return;
      const progress = progressPercent();
      root.style.setProperty("--pp-progress", `${progress}%`);
      setText(".pp-meter-value", `${progress}%`);
      const remainingRatio = Math.max(0, 1 - progress / 100);
      const remainingWords = Math.ceil(model.totalReadableWords * remainingRatio);
      const remainingMinutes = Math.max(1, Math.ceil(remainingWords / 235));
      setText("[data-pp-stat='time']", progress >= 99 ? "Done" : `${remainingMinutes}m`);
    }

    function destroy() {
      if (root) {
        root.remove();
      }
      root = null;
      sidebar = null;
      tab = null;
    }

    function getFocusableItems() {
      return Array.from(root.querySelectorAll(".pp-start-card:not(:disabled), .pp-skip:not(:disabled), .pp-next:not(:disabled), .pp-pdf-ocr:not(:disabled), .pp-pdf-ocr-cancel:not(:disabled), .pp-query-input, .pp-query-submit:not(:disabled), .pp-query-clear:not(:disabled), .pp-query-go:not(:disabled), .pp-query-return:not(:disabled), .pp-query-better-ocr:not(:disabled), .pp-query-alt:not(:disabled), .pp-collapse-toggle, .pp-section-item"))
        .filter((element) => !element.closest("[hidden]") && element.offsetParent !== null);
    }

    function setText(selector, value) {
      const element = root.querySelector(selector);
      if (element) {
        element.textContent = value;
      }
    }

    function renderImportantList(model) {
      const list = root.querySelector(".pp-important-list");
      if (!model.importantSections.length) {
        list.innerHTML = emptyTemplate("No clear standout", model.pageProfile.reason || "SkimRoute is staying quiet here.");
        return;
      }
      list.innerHTML = model.importantSections
        .map((section) => sectionButtonTemplate(section, { showReason: true, showTree: false }))
        .join("");
    }

    function renderJumpList(model) {
      const list = root.querySelector(".pp-jump-list");
      const navSections = visibleSections(model.sections);
      if (!navSections.length) {
        if (model.pageProfile && model.pageProfile.state === "loading") {
          list.innerHTML = emptyTemplate("Scanning", "SkimRoute is still reading the page structure.");
        } else {
          list.innerHTML = emptyTemplate("Nothing to organize", "Try SkimRoute on a longer page or conversation.");
        }
        return;
      }
      list.innerHTML = navSections
        .map((section) => sectionButtonTemplate(section, { showReason: false, showTree: true }))
        .join("");
    }

    function renderSectionQuery(sectionQuery, state) {
      const panel = root.querySelector(".pp-query");
      if (!panel) return;
      const query = sectionQuery || {};
      const input = panel.querySelector(".pp-query-input");
      const result = panel.querySelector(".pp-query-result");
      const clearButton = panel.querySelector(".pp-query-clear");
      const submitButton = panel.querySelector(".pp-query-submit");
      const goButton = panel.querySelector(".pp-query-go");
      const returnButton = panel.querySelector(".pp-query-return");
      const waiting = query.status === "waiting";
      const disabled = Boolean(!waiting && (state.loading || !state.sectionCount));
      panel.hidden = Boolean(state.quietMode && !query.text);
      input.disabled = disabled;
      submitButton.disabled = disabled;
      if (document.activeElement !== input && input.value !== String(query.text || "")) {
        input.value = String(query.text || "");
      }
      clearButton.disabled = !query.text && !query.status || query.status === "idle";
      const hasResult = Boolean(query && query.status && query.status !== "idle");
      result.hidden = !hasResult;
      const showGo = Boolean(query.weakRequiresConfirm && query.canNavigate && query.sectionId && !query.hasNavigated);
      goButton.hidden = !showGo;
      goButton.disabled = !query.weakRequiresConfirm || !query.canNavigate;
      if (returnButton) {
        const showReturn = Boolean(!query.weakRequiresConfirm && query.hasNavigated && query.canNavigate && (query.canReturnToMatch || query.isCurrentTarget));
        returnButton.hidden = !showReturn;
        returnButton.disabled = Boolean(showReturn && query.isCurrentTarget) || !query.canReturnToMatch;
        returnButton.textContent = query.isCurrentTarget ? "At match" : "Return to match";
      }
      if (!hasResult) {
        result.innerHTML = "";
        return;
      }
      if (query.status === "none") {
        result.innerHTML = `<strong>No strong section match found on this page.</strong>`;
        return;
      }
      if (query.status === "waiting" || query.status === "error") {
        const betterOcrRunning = query.status === "waiting" && /Better OCR/i.test(String(query.reason || ""));
        const betterOcrButton = query.canRunBetterOcr || betterOcrRunning
          ? `<button class="pp-query-better-ocr" type="button"${betterOcrRunning ? " disabled" : ""}>${betterOcrRunning ? "Running Better OCR..." : "Search again with Better OCR"}</button>`
          : "";
        result.innerHTML = `
          <strong>${escape(query.status === "waiting" ? "Waiting for OCR" : "Search issue")}</strong>
          <p>${escape(query.reason || (query.status === "waiting" ? "Waiting for OCR to finish..." : "SkimRoute could not search this page."))}</p>
          ${betterOcrButton}
        `;
        return;
      }
      const role = query.roleLabel ? `<span>${escape(query.roleLabel)}</span>` : "";
      const confidence = query.confidenceLabel ? `<span>${escape(query.confidenceLabel)}</span>` : "";
      const navigation = query.navigation && query.navigation.reason ? `<em>${escape(query.navigation.reason)}</em>` : `<em>${escape(query.reason || "")}</em>`;
      const alternatives = Array.isArray(query.alternatives) && query.alternatives.length
        ? `<div class="pp-query-alternatives">${query.alternatives.map((item) => `
          <button class="pp-query-alt" type="button" data-section-id="${escape(item.sectionId || "")}" data-passage-id="${escape(item.passageId || "")}">
            <span>${escape(item.title || "Matched section")}</span>
            <small>${escape(item.snippet || item.reason || "")}</small>
          </button>
        `).join("")}</div>`
        : "";
      result.innerHTML = `
        <strong>${escape(query.title || "Matched section")}</strong>
        <div class="pp-query-meta">${role}${confidence}</div>
        <p>${escape(query.snippet || query.reason || "")}</p>
        ${navigation}
        ${alternatives}
      `;
    }

    function visibleSections(sections) {
      const hiddenParents = new Set();
      return sections.filter((section) => {
        if (section.parentId && hiddenParents.has(section.parentId)) {
          hiddenParents.add(section.id);
          return false;
        }
        if (section.isCollapsed) {
          hiddenParents.add(section.id);
        }
        return true;
      });
    }

    function sectionButtonTemplate(section, settings) {
      const depth = Math.max(0, getSectionDepth(section));
      const hasChildren = section.childIds && section.childIds.length > 0;
      const displayLabel = labelForSection(section);
      const label = displayLabel ? `<span class="pp-badge">${escape(displayLabel)}</span>` : "";
      const reason = settings.showReason ? `<span class="pp-reason">${escape(formatWhyReason(reasonForSection(section)))}</span>` : "";
      const preview = !settings.showReason ? `<span class="pp-preview">${escape(sectionPreview(section))}</span>` : "";
      const importantClass = section.isImportant ? " pp-item-important" : "";
      const collapse = settings.showTree
        ? hasChildren
          ? `<button class="pp-collapse-toggle" type="button" data-toggle-section="${escape(section.id)}" aria-label="${escape(section.isCollapsed ? "Expand section" : "Collapse section")}" aria-expanded="${String(!section.isCollapsed)}">${icon(section.isCollapsed ? "chevronRight" : "chevronDown")}</button>`
          : `<span class="pp-collapse-spacer" aria-hidden="true"></span>`
        : "";
      const button = `
        <button class="pp-section-item${importantClass}" type="button" data-section-id="${escape(section.id)}">
          <span class="pp-item-main">
            <span class="pp-item-title">${escape(section.title)}</span>
            ${reason}
            ${preview}
          </span>
          ${label}
        </button>
      `;

      if (!settings.showTree) {
        return button;
      }

      return `
        <div class="pp-section-row" role="listitem" style="--pp-depth:${depth}">
          ${collapse}
          ${button}
        </div>
      `;
    }

    function escape(value) {
      return helpers.escapeHtml(value);
    }

    return {
      mount,
      render,
      updateActiveClasses,
      updateProgress,
      focusPanel,
      focusTab,
      destroy,
      getRoot() {
        return root;
      }
    };
  }

  function shellTemplate() {
    return `
      <button class="pp-edge-tab" type="button" aria-label="Open SkimRoute" aria-expanded="false">
        <span class="pp-tab-mark" aria-hidden="true"></span>
        <span class="pp-tab-copy">
          <span class="pp-tab-title">SkimRoute</span>
          <span class="pp-tab-meta">Ready</span>
        </span>
      </button>

      <aside class="pp-sidebar" aria-label="SkimRoute navigation layer" tabindex="-1">
        <div class="pp-topbar">
          <div class="pp-brand">
            <span class="pp-brand-mark" aria-hidden="true"></span>
            <div>
              <div class="pp-brand-title">SkimRoute</div>
              <div class="pp-brand-subtitle">Navigation layer</div>
            </div>
          </div>
          <div class="pp-window-actions">
            <button class="pp-icon-button pp-minimize" type="button" aria-label="Minimize SkimRoute" title="Minimize">
              ${icon("minus")}
            </button>
            <button class="pp-icon-button pp-snooze" type="button" aria-label="Snooze SkimRoute on this page" title="Snooze on this page">
              ${icon("moon")}
            </button>
          </div>
        </div>

        <div class="pp-scroll">
          <section class="pp-overview" aria-label="Page overview">
            <div class="pp-meter" aria-hidden="true">
              <div class="pp-meter-value">0%</div>
            </div>
            <div class="pp-overview-copy">
              <div class="pp-kicker">Page guide</div>
              <h2 class="pp-hero-title">Find the useful part.</h2>
              <p class="pp-summary-line">SkimRoute is reading the structure of this page.</p>
            </div>

            <button class="pp-start-card" type="button" data-section-id="">
              <span class="pp-start-label">Best place to start</span>
              <strong class="pp-start-title">Finding the strongest section...</strong>
              <span class="pp-start-reason">Ranking this page locally.</span>
            </button>

            <div class="pp-stats" aria-label="Page stats">
              <div>
                <strong data-pp-stat="time">--</strong>
                <span>left</span>
              </div>
              <div>
                <strong data-pp-stat="sections">0</strong>
                <span>sections</span>
              </div>
              <div>
                <strong data-pp-stat="important">0</strong>
                <span>useful</span>
              </div>
            </div>

            <div class="pp-actions">
              <button class="pp-skip" type="button" title="Jump to useful part (Alt+J / Option+J)">
                ${icon("arrowDown")}
                <span>Jump to useful part</span>
              </button>
              <button class="pp-next" type="button" title="Next important section (Alt+N / Option+N)">
                ${icon("arrowDown")}
                <span class="pp-next-label">Next important</span>
              </button>
              <button class="pp-pdf-ocr" type="button" hidden title="Run OCR for scanned PDFs">
                ${icon("chevronDown")}
                <span>Run OCR</span>
              </button>
              <button class="pp-pdf-ocr-cancel" type="button" hidden title="Cancel OCR">
                ${icon("x")}
                <span>Cancel OCR</span>
              </button>
            </div>

            <div class="pp-query">
              <label class="pp-query-label" for="pagepilot-section-query">Find on this page</label>
              <div class="pp-query-row">
                <input class="pp-query-input" id="pagepilot-section-query" type="search" placeholder="Find the part about..." autocomplete="off" spellcheck="false">
                <button class="pp-query-submit" type="button" title="Find section" aria-label="Find section">${icon("search")}</button>
                <button class="pp-query-clear" type="button" title="Clear search" aria-label="Clear search">${icon("x")}</button>
              </div>
              <div class="pp-query-result" role="status" aria-live="polite" hidden></div>
              <button class="pp-query-go" type="button" hidden>Go anyway</button>
              <button class="pp-query-return" type="button" hidden>Return to match</button>
            </div>
          </section>

          <section class="pp-list-panel pp-important-panel">
            <div class="pp-section-heading">
              <h2>Best Path</h2>
              <span class="pp-count pp-important-count">0</span>
            </div>
            <div class="pp-important-list" role="list"></div>
          </section>

          <section class="pp-list-panel pp-jump-panel">
            <div class="pp-section-heading">
              <h2>Page Map</h2>
              <span class="pp-count pp-section-count">0</span>
            </div>
            <div class="pp-jump-list" role="list"></div>
          </section>
        </div>

        <div class="pp-onboarding" role="status" aria-live="polite">
          <strong>SkimRoute finds useful sections in long pages, AI chats, and PDFs.</strong>
          <span>Use Alt+J to jump to the best part. Use Alt+N to move through important sections. PDF Mode scrolls and highlights PDFs more reliably; local PDFs may need Chrome file URL access, and scanned PDFs can use OCR.</span>
          <button class="pp-tip-dismiss" type="button">Got it</button>
        </div>

        <div class="pp-live" aria-live="polite" aria-atomic="true"></div>
      </aside>
    `;
  }

  function heroTitle(model, bestSection, quietMode) {
    if (quietMode) return "Staying quiet here.";
    if (model.pageProfile.type === "search_results") {
      return bestSection && bestSection.unitMeta && bestSection.unitMeta.searchBlockType === "ai_overview"
        ? "Focus the AI Overview."
        : "Focus the top search results.";
    }
    if (!model.hasStrongTarget || !bestSection) {
      return model.confidenceTier === "low" ? "No clear standout yet." : "Find the useful part.";
    }
    if (model.savedMinutes >= 2) return `Skip ${model.savedMinutes} minutes of scrolling.`;
    if (model.pageProfile.type === "chat") {
      if (bestSection.unitMeta && bestSection.unitMeta.hasRevision) return "Jump to the corrected answer.";
      if (bestSection.metrics.matched.finalCode) return "Jump to the final code.";
      if (bestSection.metrics.matched.summary) return "Jump to the summary.";
      return "Jump to the latest answer.";
    }
    if (bestSection.metrics.matched.summary) return "Jump to the summary.";
    if (bestSection.metrics.matched.completeCode) return "Find the complete code.";
    if (bestSection.metrics.matched.conciseAnswer || bestSection.metrics.matched.answer) return "Jump straight to the answer.";
    if (model.pageProfile.type === "docs" && (bestSection.metrics.codeBlocks > 0 || bestSection.metrics.matched.example)) return "Find the working example.";
    if (model.pageProfile.type === "recipe") return "Skip to the steps.";
    return "Jump to the useful part.";
  }

  function summaryLine(model, bestSection, quietMode) {
    if (quietMode) return model.pageProfile.reason || "Not much to organize on this page.";
    if (model.pageProfile.type === "search_results") {
      return "Search results found. SkimRoute works best after you open a result, but it can still help you focus the AI Overview or top result areas.";
    }
    if (!bestSection || !model.hasStrongTarget) {
      if (model.confidenceTier === "low") return "SkimRoute found structure, but no section clearly wins.";
      return "No clear standout section found.";
    }
    const usefulCount = model.importantSections.length || 1;
    const countCopy = `${usefulCount} useful ${usefulCount === 1 ? "section" : "sections"}`;
    const saveCopy = model.savedMinutes >= 1 ? ` About ${model.savedMinutes}m saved.` : "";
    return `${model.confidenceLabel}. ${countCopy}.${saveCopy}`;
  }

  function startLabel(model, canJump) {
    if (model.pageProfile && model.pageProfile.state === "loading") return loadingStat(model.pageProfile);
    if (!canJump) return "No clear standout";
    return `${model.bestLabel} • ${model.confidenceLabel}`;
  }

  function lowSignalTitle(model) {
    if (model.pageProfile && model.pageProfile.state === "loading") return "Checking page...";
    if (model.pageProfile && model.pageProfile.state === "ocr-unreadable") return "Scan could not be read clearly";
    if (model.pageProfile && model.pageProfile.state === "ocr-failed" && model.pageProfile.reason === PDF_OCR_WORKER_START_MESSAGE) return PDF_OCR_WORKER_START_MESSAGE;
    if (model.pageProfile && model.pageProfile.state === "ocr-failed") return "OCR could not finish";
    if (model.pageProfile.type === "search_results") return "Search results found";
    if (model.pageProfile.quietMode) return "Not much to organize here";
    if (model.confidenceTier === "low") return "No clear best section";
    return "No strong jump target yet";
  }

  function lowSignalReason(model) {
    if (model.pageProfile && model.pageProfile.state === "loading") return "SkimRoute is still reading the page.";
    if (model.pageProfile && model.pageProfile.state === "ocr-unreadable") return PDF_OCR_UNREADABLE_MESSAGE;
    if (model.pageProfile && model.pageProfile.state === "ocr-failed") return model.pageProfile.reason || PDF_OCR_UNREADABLE_MESSAGE;
    if (model.pageProfile.type === "search_results") return model.pageProfile.reason || "Open a result for a full Page Map.";
    if (model.pageProfile.quietMode) return model.pageProfile.reason || "SkimRoute will stay out of the way.";
    if (model.confidenceTier === "low") return "The page has structure, but nothing stands out enough to recommend.";
    return "Use the page map, or rescan after more content loads.";
  }

  function tabLabel(model, mode) {
    if (model.pageProfile && model.pageProfile.state === "loading") return model.pageProfile.type === "chat" ? "Open SkimRoute, waiting for the conversation" : "Open SkimRoute, checking this page";
    if (mode === "snoozed") return "Open SkimRoute, snoozed on this page";
    if (mode === "quiet") return "Open SkimRoute, quiet on this page";
    if (model.hasStrongTarget) return `Open SkimRoute, ${model.bestLabel}`;
    return "Open SkimRoute";
  }

  function tabTitle(model, mode) {
    if (model.pageProfile && model.pageProfile.state === "loading") return loadingStat(model.pageProfile);
    if (mode === "snoozed") return "Snoozed";
    if (mode === "quiet") return "Quiet";
    if (model.hasStrongTarget) return "Ready";
    return "SkimRoute";
  }

  function tabMeta(model, mode) {
    if (model.pageProfile && model.pageProfile.state === "loading") return model.pageProfile.type === "chat" ? "Waiting for conversation" : "Checking page";
    if (mode === "snoozed") return "Click to reopen";
    if (mode === "quiet") return model.pageProfile.quietReason || model.pageProfile.reason || "Staying out of the way";
    if (model.hasStrongTarget) return model.bestLabel;
    return `${model.sections.length} sections`;
  }

  function readingTimeCopy(model) {
    if (model.pageProfile && model.pageProfile.state === "loading") return loadingStat(model.pageProfile);
    if (model.pageProfile.quietMode) return "--";
    return `${Math.max(1, model.readingMinutes || 1)}m`;
  }

  function pdfLoadingCopy(profile) {
    const state = String(profile.pdfState || "");
    const reason = String(profile.reason || profile.diagnosticHint || "");
    if (profile.pdfOcrActive && profile.pdfOcrWorkerActive && state === "ocr") {
      const progress = progressFromText(reason);
      if (/still reading the scan locally|still working locally/i.test(reason)) return progress ? `${PDF_OCR_LONG_RUNNING_MESSAGE} ${progress}%` : PDF_OCR_LONG_RUNNING_MESSAGE;
      if (/better ocr runs locally/i.test(reason)) return progress ? `${PDF_OCR_BETTER_EXPECTATION_MESSAGE} ${progress}%` : PDF_OCR_BETTER_EXPECTATION_MESSAGE;
      return progress ? `${PDF_OCR_RUNNING_MESSAGE} ${progress}%` : PDF_OCR_RUNNING_MESSAGE;
    }
    if (state === "ocr") {
      return String(profile.pdfOcrMessage || reason || "").includes("Better OCR") ? PDF_OCR_BETTER_EXPECTATION_MESSAGE : PDF_OCR_FAST_EXPECTATION_MESSAGE;
    }
    if (/pdf mode|opening/i.test(reason)) return PDF_MODE_OPENING_COPY;
    return PDF_OCR_DETECTION_MESSAGE;
  }

  function pdfOcrPromptCopy(profile) {
    const mode = String(profile.pdfOcrRecommendedMode || profile.pdfOcrMode || "").toLowerCase();
    if (mode === "better" || profile.pdfOcrCanRunBetter) return PDF_OCR_BETTER_EXPECTATION_MESSAGE;
    return PDF_OCR_IMAGE_PROMPT_MESSAGE;
  }

  function pdfOcrButtonLabel(profile, terminal) {
    if (profile.pdfOcrCanRunBetter) return "Better OCR";
    if (terminal) return "Try OCR again";
    const mode = String(profile.pdfOcrRecommendedMode || profile.pdfOcrMode || "").toLowerCase();
    return mode === "better" || profile.pdfOcrCanRunBetter ? "Better OCR" : "Run OCR";
  }

  function pdfOcrButtonTitle(profile, terminal) {
    if (profile.pdfOcrCanRunBetter) return PDF_OCR_BETTER_EXPECTATION_MESSAGE;
    if (terminal) return "Run OCR again for this scanned PDF";
    const mode = String(profile.pdfOcrRecommendedMode || profile.pdfOcrMode || "").toLowerCase();
    return mode === "better" || profile.pdfOcrCanRunBetter ? PDF_OCR_BETTER_EXPECTATION_MESSAGE : "Run OCR for scanned PDFs";
  }

  function loadingSummaryLine(profile, message) {
    if (profile.type === "chat") return "SkimRoute is waiting for the conversation to finish loading.";
    if (profile.type !== "pdf") return "SkimRoute is still looking for a stable structure.";
    if (/OCR|scanned text/i.test(message || "")) return message || PDF_OCR_RUNNING_MESSAGE;
    if (/PDF Mode/i.test(message || "")) return PDF_MODE_OPENING_COPY;
    return PDF_OCR_DETECTION_MESSAGE;
  }

  function loadingReasonLine(profile) {
    if (profile.type === "chat") return "Waiting for the conversation to finish loading so SkimRoute can map the useful answer.";
    if (profile.type !== "pdf") return "SkimRoute will show the best jump once the page settles.";
    if (profile.pdfState === "ocr" && profile.pdfOcrActive && profile.pdfOcrWorkerActive) return String(profile.reason || profile.diagnosticHint || "").includes(PDF_OCR_LONG_RUNNING_MESSAGE) ? PDF_OCR_LONG_RUNNING_MESSAGE : PDF_OCR_RUNNING_MESSAGE;
    if (profile.pdfState === "ocr") return profile.pdfOcrMode === "better" ? PDF_OCR_BETTER_EXPECTATION_MESSAGE : PDF_OCR_FAST_EXPECTATION_MESSAGE;
    if (/pdf mode|opening/i.test(String(profile.reason || profile.diagnosticHint || ""))) {
      return PDF_MODE_OPENING_COPY;
    }
    return PDF_OCR_DETECTION_MESSAGE;
  }

  function loadingTitle(profile) {
    if (profile.type === "chat") return "Waiting for conversation...";
    return "Checking this page...";
  }

  function loadingStat(profile) {
    return profile.type === "chat" ? "Waiting" : "Checking";
  }

  function progressFromText(text) {
    const match = String(text || "").match(/\b(\d{1,3})%\b/);
    if (!match) return "";
    const value = Math.max(0, Math.min(100, Number(match[1]) || 0));
    return String(value);
  }

  function liveStatus(model, quietMode) {
    if (model.pageProfile && model.pageProfile.state === "loading") {
      return model.pageProfile.type === "chat" ? "SkimRoute is waiting for the conversation to finish loading." : "SkimRoute is checking this page locally.";
    }
    if (quietMode) return model.pageProfile.reason || "SkimRoute is quiet on this page.";
    if (model.hasStrongTarget) return `${model.bestLabel}: ${findSection(model, model.bestSectionId).title}`;
    return "No clear standout section found.";
  }

  function reasonForSection(section) {
    if (!section || !section.metrics) return "Useful section";
    const intelligenceReason = section.intelligence
      && Array.isArray(section.intelligence.whyReasons)
      && section.intelligence.whyReasons[0];
    if (intelligenceReason) return intelligenceReason;
    if (section.unitMeta && section.unitMeta.diagnosticReason) return section.unitMeta.diagnosticReason;
    const kindReason = reasonForSectionKind(section);
    if (kindReason) return kindReason;
    if (section.metrics.matched.finalCode) return "Last substantial code block in the conversation";
    if (section.unitMeta && section.unitMeta.isAfterUserCorrection) return "Answers the latest user correction";
    if (section.unitMeta && section.unitMeta.hasRevision && section.unitMeta.isLatestAssistant) return "Looks like the latest corrected answer";
    if (section.unitMeta && section.unitMeta.answersLatestUser) return "Answers the latest user request";
    if (section.metrics.matched.completeCode) return "Looks like complete, usable code";
    if (section.metrics.matched.conciseAnswer) return "Opens with a concise answer";
    if (section.metrics.matched.summary) return "Summarizes the useful parts";
    if (section.metrics.matched.acceptedAnswer) return "Looks like the confirmed answer";
    if (section.metrics.matched.procedure) return "Contains step-by-step guidance";
    if (section.metrics.matched.directAction) return "Gives direct next actions";
    if (section.metrics.matched.troubleshooting) return "Points to a fix";
    if (section.metrics.matched.recommendation) return "Uses recommendation language";
    if (section.metrics.matched.answer) return "Has a direct answer signal";
    if (section.metrics.matched.action) return "Looks actionable";
    if (section.metrics.matched.codeExplanation) return "Explains a working code example";
    if (section.metrics.codeBlocks > 0) return "Includes a practical example";
    if (section.metrics.tables > 0) return "Summarizes details in a table";
    if (section.metrics.matched.comparison) return "Compares options clearly";
    if (section.metrics.matched.example) return "Shows an example or comparison";
    if (section.metrics.matched.warning) return "Flags a caveat";
    if (section.metrics.listItems >= 3) return "Structured for quick scanning";
    if (section.metrics.hasNumbers) return "Contains concrete details";
    return `${section.wordCount} focused words`;
  }

  function labelForSection(section) {
    const intelligenceLabel = section
      && section.intelligence
      && section.intelligence.roleLabel;
    return intelligenceLabel || section && section.label || "";
  }

  function reasonForSectionKind(section) {
    const kind = section.metrics.sectionKind || "";
    const pdfType = section.metrics.pdfSectionType || section.unitMeta && section.unitMeta.pdfSectionType || "";
    const ocrRole = section.metrics.ocrRole || section.unitMeta && section.unitMeta.ocrRole || "";
    if (ocrRole === "body") return "this paragraph is the main body of the scanned letter, not the letterhead or signature";
    if (ocrRole === "date_reference") return "reference or date details from the scanned letter";
    if (ocrRole === "letterhead") return "letterhead or company contact block, usually less important than the body";
    if (ocrRole === "recipient") return "recipient address block before the letter body";
    if (ocrRole === "signature") return "signature or initials block, usually less important than the body";
    if (ocrRole === "footer") return "footer or repeated page noise";
    if (kind === "search_ai_overview") return "AI Overview is the highest-value search block";
    if (kind === "search_answer") return "Search answer block gives a direct answer";
    if (kind === "search_sources") return "Sources support the search answer";
    if (kind === "search_people_also_ask") return "Related questions help refine the search";
    if (kind === "search_top_results") return "Top organic results are the best next area";
    if (kind === "search_videos") return "Video results may be useful for this query";
    if (kind === "search_shopping") return "Shopping results are a specialized result area";
    if (kind === "search_maps") return "Map results are a specialized result area";
    if (kind === "main_argument") return "States the main argument";
    if (kind === "key_evidence") return "Supports the main point with evidence";
    if (kind === "results" || pdfType === "results") return "Shows results or findings";
    if (kind === "conclusion" || pdfType === "conclusion") return "Wraps up the useful takeaway";
    if (kind === "definition") return "Defines a key term";
    if (kind === "code_block" || kind === "complete_code") return "Includes usable code";
    if (kind === "final_recommendation") return "Gives the final recommendation";
    if (kind === "step_by_step") return "Breaks the answer into clear steps";
    if (kind === "key_explanation") return "Explains the key reasoning";
    if (kind === "form" || pdfType === "form") return "Form or notice with dates, names, or identifiers";
    if (kind === "table" || pdfType === "table") return "Table-like section with structured details";
    if (kind === "signature" || pdfType === "signature") return "Signature or sign-off area";
    if (pdfType === "abstract") return "Summarizes the PDF upfront";
    if (kind === "methods" || pdfType === "methods") return "Explains the method or procedure";
    if (pdfType === "discussion") return "Interprets the results";
    return "";
  }

  function formatWhyReason(reason) {
    const value = String(reason || "").trim();
    if (!value) return "Why: useful section";
    return /^why:/i.test(value) ? value : `Why: ${value}`;
  }

  function sectionPreview(section) {
    const text = String(section.text || "").replace(section.title, "").trim();
    const preview = text || reasonForSection(section);
    return preview.length > 126 ? `${preview.slice(0, 123).trim()}...` : preview;
  }

  function getSectionDepth(section) {
    let depth = 0;
    let current = section;
    const all = window.__PAGEPILOT_CURRENT_SECTIONS__ || [];
    while (current && current.parentId && depth < 5) {
      depth += 1;
      current = all.find((item) => item.id === current.parentId);
    }
    return depth;
  }

  function findSection(model, id) {
    return model.sections.find((section) => section.id === id) || null;
  }

  function emptyTemplate(title, copy) {
    return `
      <div class="pp-empty">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(copy)}</span>
      </div>
    `;
  }

  function progressPercent() {
    const scrollContainer = findScrollContainer(document.body);
    const scroller = scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement
      ? scrollContainer
      : null;
    const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
    const viewport = scroller ? scroller.clientHeight : window.innerHeight;
    const total = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
    const scrollable = Math.max(1, total - viewport);
    return Math.max(0, Math.min(100, Math.round((scrollTop / scrollable) * 100)));
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

    const candidates = document.querySelectorAll([
      "main",
      "article",
      "[role='main']",
      "[data-message-author-role]",
      "[data-testid*='conversation']",
      "[data-testid*='chat-message']",
      "[class*='conversation' i]",
      "[class*='chat' i]",
      ".textLayer",
      "[data-page-number]"
    ].join(", "));
    for (const candidate of candidates) {
      try {
        const scrollable = findScrollableAncestor(candidate);
        if (scrollable && scrollable !== document.body && scrollable !== document.documentElement) {
          return scrollable;
        }
      } catch (error) {
        // Ignore and continue.
      }
    }

    return document.scrollingElement || document.documentElement || document.body;
  }

  function findScrollableAncestor(element) {
    let current = element;
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
    return null;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function icon(name) {
    const paths = {
      minus: "<path d='M5 12h14'/>",
      moon: "<path d='M20 15.2A8 8 0 0 1 8.8 4 7 7 0 1 0 20 15.2Z'/>",
      arrowDown: "<path d='M12 5v14'/><path d='m19 12-7 7-7-7'/>",
      chevronRight: "<path d='m9 18 6-6-6-6'/>",
      chevronDown: "<path d='m6 9 6 6 6-6'/>",
      search: "<circle cx='11' cy='11' r='7'/><path d='m21 21-4.3-4.3'/>",
      copy: "<rect x='9' y='9' width='13' height='13' rx='2'/><path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'/>",
      x: "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>"
    };
    return `<svg class="pp-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
  }

  window.PagePilotUI = {
    createUI
  };
})();
