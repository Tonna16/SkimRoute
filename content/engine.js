(function () {
  "use strict";

  if (window.PagePilotEngine) {
    return;
  }

  const MIN_USEFUL_WORDS = 160;
  const READING_SPEED_WPM = 235;
  const STRONG_TARGET_CONFIDENCE = 62;
  const HIGH_CONFIDENCE = 78;
  const LOW_CONFIDENCE = 46;
  const MAX_CONTENT_BLOCKS = 850;
  const MAX_HEADINGS = 260;
  const MAX_SECTIONS = 180;
  const LOW_CONFIDENCE_PAGE_TYPES = new Set(["search_results", "shopping_product", "app_dashboard", "low_structure"]);
  const QUIET_PAGE_TYPES = new Set(["search_results", "shopping_product", "app_dashboard", "low_structure"]);
  const AMBIGUOUS_PAGE_TYPES = new Set(["search_results", "shopping_product", "app_dashboard", "low_structure"]);
  const GOOGLE_DOCS_CANVAS_RENDERING_REASON = "Google Docs is using canvas rendering. Turn on screen-reader support in Google Docs, then select Rescan. Windows: Ctrl+Alt+Z. Mac: Command+Option+Z. Or use Tools → Accessibility settings.";

  const LOW_VALUE_SELECTOR = [
    "nav",
    "footer",
    "form",
    "aside",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    "[aria-modal='true']",
    "[class*='cookie' i]",
    "[id*='cookie' i]",
    "[class*='banner' i]",
    "[id*='banner' i]",
    "[class*='advert' i]",
    "[id*='advert' i]",
    "[class*='sponsor' i]",
    "[id*='sponsor' i]",
    "[class*='newsletter' i]",
    "[id*='newsletter' i]",
    "[class*='subscribe' i]",
    "[id*='subscribe' i]",
    "[class*='promo' i]",
    "[id*='promo' i]",
    "[class*='upsell' i]",
    "[id*='upsell' i]",
    "[class*='author-bio' i]",
    "[class*='author-box' i]",
    "[id*='author-bio' i]",
    "[id*='author-box' i]",
    "[class*='byline' i]",
    "[class*='disclosure' i]",
    "[class*='affiliate' i]",
    "[class*='comment' i]",
    "[id*='comment' i]",
    "[class*='share' i]",
    "[class*='social' i]",
    "[class*='related' i]",
    "[class*='recommend' i]",
    "[class*='also-read' i]",
    "[class*='read-more' i]",
    "[class*='more-stories' i]",
    "[class*='trending' i]",
    "[class*='outbrain' i]",
    "[class*='taboola' i]",
    "[class*='paywall' i]",
    "[aria-label*='breadcrumb' i]"
  ].join(",");

  const POSITIVE_PATTERNS = {
    useful: /\b(summary|conclusion|key takeaway|takeaways|tl;dr|tldr|bottom line|verdict|results?|findings?|recommendation|what matters|in short|final thoughts?|recap|wrap-up|at a glance|quick answer|the gist|executive summary)\b/i,
    answer: /\b(answer|solution|solved|fix|explained|why it matters|what to do|the point|in practice|best option|short answer|the takeaway|here'?s why|start here|actual answer|final answer)\b/i,
    action: /\b(steps?|how to|guide|checklist|instructions?|recipe|playbook|setup|install|configure|use this|do this|workflow|process|quick start|getting started|implementation|walkthrough|tutorial|copy and paste|replace|run this|change this)\b/i,
    definition: /\b(what is|definition|means|refers to|defined as|is a|are a|concept|overview)\b/i,
    warning: /\b(warning|caution|important|avoid|risk|mistake|pitfall|note|before you|watch out|do not|limitation|gotcha|breaking change|security|deprecated)\b/i,
    example: /\b(example|for example|case study|sample|snippet|code|demo|template|numbers?|data|benchmark|comparison|compare|versus|vs\.?|pros and cons|trade-?offs?)\b/i,
    recommendation: /\b(best|recommended|recommend|top pick|our pick|use this|prefer|should use|worth it|winner|ranked|must-have)\b/i,
    finality: /\b(final|finally|complete|done|result|outcome|finished|end state|working version|production-ready|latest answer|corrected answer|final version|use this version)\b/i
  };

  const NEGATIVE_PATTERNS = /\b(advertisement|sponsored|sponsor|affiliate|subscribe|newsletter|sign up|cookie|privacy preferences|accept all|related posts?|recommended articles?|share this|follow us|comments?|leave a reply|table of contents|also read|read more|author bio|about the author|disclosure|partners?|promotion|limited offer|promo code|buy now|shop now|deal|giveaway|webinar|download our|join our|privacy policy|terms of service|copyright|all rights reserved|powered by|site map|sitemap|skip to content|back to top)\b/i;
  const FLUFF_PATTERNS = /\b(in this article|in this post|before we dive in|let'?s dive in|when i first|i remember|back in|my journey|ever wondered|you'?re not alone|without further ado|it depends on your needs|as you may know|these days|nowadays|in today'?s world|ultimate guide|comprehensive guide|everything you need to know|we may earn|our editorial process|why you should trust us)\b/i;
  const INTRO_PATTERNS = /\b(welcome to|introduction|intro|overview|background|what we'?ll cover|table of contents|prerequisites|before you start)\b/i;
  const CONCLUSION_PATTERNS = /\b(conclusion|summary|recap|bottom line|key takeaway|final answer|final thoughts|what to do next|in short)\b/i;
  const PROCEDURE_PATTERN = /(^|\n)\s*(step\s+\d+|\d+\.|[a-z]\))\s+\S|\b(first|second|third|next|then|finally)[:,]\s/i;
  const PDF_SECTION_PATTERNS = {
    abstract: /\babstract\b/i,
    introduction: /\b(introduction|background|overview)\b/i,
    methods: /\b(methods?|methodology|materials and methods|experimental setup|approach|procedure|data and methods)\b/i,
    results: /\b(results?|findings?|evaluation|experiments?|observations?|analysis)\b/i,
    discussion: /\bdiscussion\b/i,
    conclusion: /\b(conclusions?|summary|final remarks|closing remarks)\b/i,
    works_cited: /\b(references|bibliography|works cited|literature cited|citations)\b/i,
    appendix: /\b(appendix|appendices|supplementary|supplemental materials?)\b/i,
    toc: /\b(table of contents|contents)\b/i
  };
  const SECTION_KIND_LABELS = {
    answer: "Answer",
    final_answer: "Final answer",
    latest_answer: "Latest answer",
    corrected_answer: "Corrected answer",
    summary: "Summary",
    conclusion: "Conclusion",
    steps: "Steps",
    quick_start: "Quick start",
    installation: "Installation",
    usage: "Usage",
    parameters: "Parameters",
    troubleshooting: "Troubleshooting",
    prerequisites: "Prerequisites",
    setup: "Setup",
    final_result: "Final result",
    ingredients: "Ingredients",
    instructions: "Instructions",
    timing: "Timing",
    tips: "Useful tips",
    definition: "Definition",
    code_block: "Code block",
    complete_code: "Complete code",
    final_code: "Final code",
    final_recommendation: "Final recommendation",
    step_by_step: "Step-by-step answer",
    key_explanation: "Key explanation",
    document_title: "Document title",
    heading: "Heading",
    main_argument: "Main argument",
    key_evidence: "Key evidence",
    abstract: "Abstract",
    results: "Results",
    introduction: "Introduction",
    methods: "Methods",
    discussion: "Discussion",
    form: "Form or notice",
    table: "Table",
    signature: "Signature",
    recommendation: "Recommendation",
    warning: "Caveat",
    comparison: "Comparison",
    example: "Example",
    boilerplate: "Boilerplate",
    works_cited: "Works cited",
    appendix: "Appendix",
    changelog: "Changelog",
    title_page: "Title page",
    prompt_echo: "Prompt",
    toc: "Contents",
    ocr_letter_body: "Main body",
    ocr_date_reference: "Reference/date",
    ocr_signature: "Signature block",
    ocr_letterhead: "Letterhead",
    ocr_recipient: "Recipient",
    ocr_greeting: "Greeting",
    ocr_closing: "Closing",
    ocr_footer: "Footer",
    search_ai_overview: "AI Overview",
    search_answer: "Search answer",
    search_sources: "Sources",
    search_people_also_ask: "People also ask",
    search_top_results: "Top results",
    search_videos: "Videos",
    search_shopping: "Shopping",
    search_maps: "Maps",
    search_related_searches: "Related searches",
    unknown: "Unknown",
    useful_section: "Useful section"
  };

  function normalizePdfOcrRole(role) {
    const value = String(role || "").toLowerCase().replace(/[^a-z_]+/g, "_");
    return /^(letterhead|recipient|date_reference|greeting|body|closing|signature|footer|unknown)$/.test(value) ? value : "";
  }

  function pdfOcrRoleKind(role) {
    const normalized = normalizePdfOcrRole(role);
    if (normalized === "body") return "ocr_letter_body";
    if (normalized === "date_reference") return "ocr_date_reference";
    if (normalized === "signature") return "ocr_signature";
    return normalized ? `ocr_${normalized}` : "";
  }

  const GOOGLE_DOCS_ROLE_LABELS = {
    document_title: "Document title",
    introduction: "Introduction",
    summary: "Summary",
    main_claim: "Main argument",
    heading: "Heading",
    steps: "Steps",
    evidence: "Key evidence",
    results: "Results",
    conclusion: "Conclusion",
    references: "References",
    appendix: "Appendix",
    unknown: "Useful section"
  };

  function isGoogleDocsSection(unitMeta, profile) {
    return Boolean(unitMeta && (
      unitMeta.kind === "google-docs"
      || unitMeta.source === "google-docs"
      || unitMeta.googleDocsUnitId
    )) || Boolean(profile && profile.adapterName === "google-docs");
  }

  function googleDocsRoleToSectionKind(role) {
    const map = {
      document_title: "document_title",
      introduction: "introduction",
      summary: "summary",
      main_claim: "main_argument",
      heading: "heading",
      steps: "steps",
      evidence: "key_evidence",
      results: "results",
      conclusion: "conclusion",
      references: "works_cited",
      appendix: "appendix",
      unknown: "useful_section"
    };
    return map[role] || "";
  }

  const INTELLIGENCE_POSITIVE_SIGNALS = [
    { key: "correctedAnswer", weight: 96, explanation: "Updated answer after a user correction." },
    { key: "replacesFailedAttempt", weight: 88, explanation: "Newer answer replaces an earlier failed attempt." },
    { key: "latestCompleteAssistantAnswer", weight: 84, explanation: "Newest complete assistant response." },
    { key: "finalRecommendation", weight: 104, explanation: "Contains final recommendation language." },
    { key: "finalAnswer", weight: 92, explanation: "Looks like the final answer." },
    { key: "finalCode", weight: 90, explanation: "Marked as final usable code." },
    { key: "completeAssistantAnswer", weight: 74, explanation: "Complete assistant response." },
    { key: "completeCode", weight: 70, explanation: "Contains complete usable code." },
    { key: "stepByStepAnswer", weight: 80, explanation: "Breaks the answer into steps." },
    { key: "keyExplanation", weight: 66, explanation: "Explains the key reasoning." },
    { key: "conciseAnswer", weight: 62, explanation: "Opens with a concise answer." },
    { key: "answer", weight: 46, explanation: "Has a direct answer signal." },
    { key: "procedure", weight: 42, explanation: "Contains procedural guidance." },
    { key: "action", weight: 38, explanation: "Looks actionable." },
    { key: "directAction", weight: 52, explanation: "Gives direct next actions." },
    { key: "summary", weight: 52, explanation: "Summarizes useful content." },
    { key: "quickStart", weight: 86, explanation: "Quick start section for getting oriented." },
    { key: "installation", weight: 72, explanation: "Installation or setup instructions." },
    { key: "usage", weight: 76, explanation: "Usage guidance with practical details." },
    { key: "parameters", weight: 62, explanation: "Explains options, parameters, or API fields." },
    { key: "troubleshooting", weight: 64, explanation: "Helps diagnose or fix issues." },
    { key: "prerequisites", weight: 54, explanation: "Prerequisites or requirements before starting." },
    { key: "setup", weight: 68, explanation: "Setup guidance before the main steps." },
    { key: "finalResult", weight: 60, explanation: "Shows the final result or expected outcome." },
    { key: "ingredients", weight: 66, explanation: "Lists required ingredients." },
    { key: "instructions", weight: 82, explanation: "Recipe instructions or method steps." },
    { key: "timing", weight: 48, explanation: "Contains timing details." },
    { key: "tips", weight: 44, explanation: "Useful tips, notes, or substitutions." },
    { key: "abstract", weight: 70, explanation: "Research abstract summarizes the paper." },
    { key: "results", weight: 66, explanation: "Shows results or findings." },
    { key: "mainArgument", weight: 74, explanation: "States a main argument or claim." },
    { key: "keyEvidence", weight: 60, explanation: "Supports the main point with evidence." },
    { key: "methods", weight: 40, explanation: "Explains a method or procedure." },
    { key: "discussion", weight: 52, explanation: "Interprets findings or implications." },
    { key: "conclusion", weight: 64, explanation: "Wraps up the useful takeaway." },
    { key: "definition", weight: 52, explanation: "Defines a key term." },
    { key: "recommendation", weight: 30, explanation: "Uses recommendation language." },
    { key: "example", weight: 24, explanation: "Shows an example or comparison." },
    { key: "acceptedAnswer", weight: 46, explanation: "Looks like a confirmed answer." },
    { key: "latestAssistantAnswer", weight: 46, explanation: "Newest substantial assistant response." },
    { key: "answersLatestUser", weight: 60, explanation: "Answers the latest user request." }
  ];

  const INTELLIGENCE_NEGATIVE_SIGNALS = [
    { key: "incompleteAssistantAnswer", weight: -148, explanation: "Latest assistant turn is incomplete or not substantive." },
    { key: "loadingOrFailedAnswer", weight: -138, explanation: "Looks like loading or failed-answer text." },
    { key: "promptEcho", weight: -116, explanation: "Looks like the user prompt rather than the answer." },
    { key: "boilerplate", weight: -114, explanation: "Looks like boilerplate or page chrome." },
    { key: "references", weight: -112, explanation: "Looks like references or citations." },
    { key: "citationOnly", weight: -92, explanation: "Mostly citation text." },
    { key: "tableOfContents", weight: -80, explanation: "Looks like a table of contents." },
    { key: "appendix", weight: -68, explanation: "Looks like appendix material." },
    { key: "supersededDraft", weight: -66, explanation: "Looks like an older or superseded draft." },
    { key: "shortConfirmation", weight: -54, explanation: "Too short to be a useful target." },
    { key: "repeatedNoise", weight: -34, explanation: "Contains repeated OCR or page noise." },
    { key: "headerOnly", weight: -26, explanation: "Looks like a header without enough body text." },
    { key: "pageTypeClutter", weight: -96, explanation: "Looks like navigation, promotion, comments, or account UI." },
    { key: "changelog", weight: -70, explanation: "Changelog or release-note material is usually secondary." }
  ];

  const INTELLIGENCE_ROLE_REASONS = {
    ocr_letter_body: "This paragraph is the main body of the scanned letter, not the letterhead or signature.",
    ocr_date_reference: "Reference or date details from the scanned letter.",
    ocr_letterhead: "Letterhead or company contact block, usually less important than the body.",
    ocr_recipient: "Recipient address block before the letter body.",
    ocr_signature: "Signature or initials block, usually less important than the body.",
    ocr_footer: "Footer or repeated page noise.",
    search_ai_overview: "AI Overview is the highest-value search block.",
    search_answer: "Search answer block gives a direct answer.",
    search_sources: "Sources support the search answer.",
    search_people_also_ask: "Related questions help refine the search.",
    search_top_results: "Top organic results are the best next area.",
    search_videos: "Video results may be useful for this query.",
    search_maps: "Map or local results are useful for location-oriented queries.",
    search_related_searches: "Related searches help refine the query.",
    search_shopping: "Shopping results are specialized and usually secondary to answers or organic results.",
    main_argument: "States the main argument.",
    key_evidence: "Supports the main point with evidence.",
    quick_start: "Quick start gets users to a working path quickly.",
    installation: "Installation details are high-value documentation content.",
    usage: "Usage guidance explains how to apply the feature.",
    parameters: "Parameter or option details support implementation.",
    troubleshooting: "Troubleshooting content helps resolve likely issues.",
    prerequisites: "Prerequisites clarify what is needed before starting.",
    setup: "Setup content prepares the tutorial workflow.",
    final_result: "Final result shows the expected outcome.",
    ingredients: "Ingredients are core recipe content.",
    instructions: "Instructions are the actionable recipe method.",
    timing: "Timing details help execute the recipe.",
    tips: "Useful tips improve the recipe outcome.",
    abstract: "Abstract summarizes the research page.",
    results: "Shows results or findings.",
    conclusion: "Wraps up the useful takeaway.",
    definition: "Defines a key term.",
    code_block: "Includes usable code.",
    complete_code: "Includes usable code.",
    latest_answer: "Newest complete assistant response.",
    corrected_answer: "Updated answer after a correction.",
    final_recommendation: "Gives the final recommendation.",
    step_by_step: "Breaks the answer into clear steps.",
    key_explanation: "Explains the key reasoning.",
    form: "Form or notice with dates, names, or identifiers.",
    table: "Table-like section with structured details.",
    abstract: "Summarizes the PDF upfront.",
    methods: "Explains the method or procedure.",
    discussion: "Interprets the results."
  };

  const THEME_INTENT_STOPWORDS = new Set([
    "about", "above", "after", "again", "against", "also", "because", "before", "being", "below",
    "between", "both", "cannot", "could", "does", "doing", "down", "during", "each", "from",
    "further", "have", "having", "here", "into", "just", "more", "most", "only", "other",
    "over", "same", "should", "some", "such", "than", "that", "their", "then", "there",
    "these", "they", "this", "through", "under", "very", "what", "when", "where", "which",
    "while", "with", "would", "your", "page", "section", "article", "guide", "click",
    "home", "menu", "navigation", "subscribe", "newsletter", "comment", "comments", "related"
  ]);

  function createEngine(options) {
    const context = createContext(options);
    const helpers = createHelpers(context);
    const registry = window.PagePilotAdapters.createRegistry(context, helpers);

    function scan(scanOptions) {
      helpers.resetScanCaches();
      const collapsedSectionIds = scanOptions && scanOptions.collapsedSectionIds
        ? scanOptions.collapsedSectionIds
        : new Set();
      const adapter = registry.pick();
      const root = pickRoot(adapter);
      root.__pagePilotHelpers = helpers;
      window.__PAGEPILOT_ACTIVE_HELPERS__ = helpers;
      const rootText = helpers.getReadableText(root);
      const rootWords = helpers.countWords(rootText);
      const rawProfile = safeCall(() => adapter.profile(context, helpers, root), {
        type: "low_structure",
        label: "Page",
        readingConfidence: 30,
        quietMode: true,
        reason: "Nothing strong to map here",
        adapterName: adapter.name
      });
      let pageProfile = normalizeProfile(rawProfile, adapter);
      const adapterUnits = safeCall(() => adapter.collectUnits(root, context, helpers), null);
      const adapterDiagnostics = safeCall(() => adapter.diagnostics ? adapter.diagnostics(context, helpers, root) : null, null);
      const useAdapterUnits = adapterUnits && (adapter.authoritativeUnits || adapterUnits.length >= 2 || ((pageProfile.type === "chat" || pageProfile.type === "pdf") && adapterUnits.length >= 1));
      const headingSections = useAdapterUnits
        ? []
        : collectHeadingSections(root, adapter, pageProfile).slice(0, MAX_SECTIONS);
      const fallbackSections = useAdapterUnits
        ? []
        : collectBlockSections(root, adapter, pageProfile).slice(0, MAX_SECTIONS);
      const unitSections = useAdapterUnits
        ? adapterUnitsToSections(adapterUnits, adapter, pageProfile)
        : [];
      const rawSections = unitSections.length
        ? unitSections
        : headingSections.length >= 3
          ? headingSections
          : mergeSections(headingSections, fallbackSections);

      applyAdapterScores(rawSections, adapter, pageProfile);
      let rankedSections = rankSections(rawSections, pageProfile);
      pageProfile = finalizePageProfile(pageProfile, rankedSections, headingSections, fallbackSections, root);
      rankedSections = rankSections(rankedSections, pageProfile);
      rankedSections = applyThemeIntentBoosts(
        rankedSections,
        pageProfile,
        buildThemeIntentContext(rankedSections, pageProfile, {
          title: context.document && context.document.title || "",
          url: context.location && context.location.href || ""
        })
      );
      rankedSections = rankSections(rankedSections, pageProfile);
      const sections = buildSectionHierarchy(rankedSections, collapsedSectionIds);
      refreshSectionPositions(sections);
      const importantSections = pickImportantSections(sections, pageProfile);
      const recommendation = buildRecommendation(sections, importantSections, pageProfile);
      attachSectionIntelligence(sections, pageProfile, recommendation);
      const targets = pickNavigationTargets(sections, importantSections, recommendation.bestSectionId, pageProfile);
      const sectionWordTotal = sections.reduce((sum, section) => sum + section.wordCount, 0);
      const totalWords = adapter.name === "google-docs" ? sectionWordTotal : helpers.countWords(rootText);
      const totalReadableWords = adapter.name === "google-docs" ? sectionWordTotal : Math.max(totalWords, sectionWordTotal);
      const routeKey = safeCall(() => adapter.routeKey(context), `${context.location.origin}${context.location.pathname}${context.location.search}`);

      return {
        adapterName: adapter.name,
        articleRoot: root,
        pageProfile,
        sections,
        importantSections,
        bestSectionId: recommendation.bestSectionId,
        nextImportantId: targets.nextImportantId,
        skipTargetId: targets.skipTargetId,
        confidence: recommendation.confidence,
        confidenceTier: recommendation.confidenceTier,
        confidenceLabel: recommendation.confidenceLabel,
        hasStrongTarget: recommendation.hasStrongTarget,
        bestLabel: recommendation.bestLabel,
        savedMinutes: recommendation.savedMinutes,
        totalWords,
        totalReadableWords,
        readingMinutes: Math.max(1, Math.ceil(totalReadableWords / READING_SPEED_WPM)),
        routeKey,
        routeHash: helpers.hashText(routeKey),
        diagnostics: {
          adapterName: adapter.name,
          adapterFamily: adapter.family || "",
          rootTag: root && root.tagName ? root.tagName.toLowerCase() : "",
          rootId: root && root.id ? root.id : "",
          rootClass: root && root.className ? String(root.className).slice(0, 120) : "",
          rootWords,
          sectionWords: sections.reduce((sum, section) => sum + (Number(section.wordCount) || 0), 0),
          effectiveWords: totalReadableWords,
          adapterUnitsCount: adapterUnits ? adapterUnits.length : 0,
          useAdapterUnits,
          headingSectionsCount: headingSections.length,
          fallbackSectionsCount: fallbackSections.length,
          unitSectionsCount: unitSections.length,
          rawSectionCount: rawSections.length,
          pageProfileBefore: rawProfile,
          pageProfileAfter: pageProfile,
          ...(adapterDiagnostics || {})
        },
        structureSignature: getStructureSignature(pageProfile, sections)
      };
    }

    function pickRoot(adapter) {
      const root = safeCall(() => adapter.getRoot(context, helpers), null);
      if (adapter && adapter.name === "google-docs") {
        return root || context.document.documentElement || context.document.body;
      }
      const fallback = pickArticleRoot(context, helpers);

      if (root && root !== context.document.documentElement && helpers.isVisible(root)) {
        const rootWords = helpers.countWords(helpers.getReadableText(root).slice(0, 12000));
        const fallbackWords = fallback && fallback !== root
          ? helpers.countWords(helpers.getReadableText(fallback).slice(0, 12000))
          : 0;
        const shouldUseFallback = fallback && fallback !== root && (
          rootWords < 20 && fallbackWords >= 60
          || ((adapter.family === "chat" || adapter.family === "pdf") && rootWords < 64 && fallbackWords >= 80)
          || (fallbackWords > rootWords * 1.45 && fallbackWords >= 100)
        );

        if (shouldUseFallback) {
          return fallback;
        }

        return root;
      }

      return fallback || context.document.body;
    }

    return {
      scan,
      helpers,
      refreshSectionPositions,
      getScrollOffset() {
        return getScrollOffset(context, helpers);
      },
      constants: {
        MIN_USEFUL_WORDS,
        READING_SPEED_WPM,
        STRONG_TARGET_CONFIDENCE,
        HIGH_CONFIDENCE,
        LOW_CONFIDENCE
      }
    };
  }

  function createContext(options) {
    const win = options && options.window ? options.window : window;
    const doc = options && options.document ? options.document : win.document;
    return {
      window: win,
      document: doc,
      location: win.location
    };
  }

  function createHelpers(context) {
    let textCache = new WeakMap();
    let rectCache = new WeakMap();
    let visibleCache = new WeakMap();

    function resetScanCaches() {
      textCache = new WeakMap();
      rectCache = new WeakMap();
      visibleCache = new WeakMap();
    }

    function cleanText(text) {
      return String(text || "")
        .replace(/\s+/g, " ")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();
    }

    function countWords(text) {
      const matches = cleanText(text).match(/\b[\w'-]+\b/g);
      return matches ? matches.length : 0;
    }

    function getReadableText(element) {
      if (!element) {
        return "";
      }
      if (textCache.has(element)) {
        return textCache.get(element);
      }

      const parts = [];
      const seen = new Set();

      function visit(node) {
        if (!node || seen.has(node)) {
          return;
        }
        seen.add(node);

        try {
          if (node.nodeType === 3) {
            const text = cleanText(node.nodeValue || "");
            if (text) parts.push(text);
            return;
          }

          if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) {
            return;
          }

          if (node.nodeType === 1 && node !== element && isLowValueElement(node)) {
            return;
          }

          if (node.nodeType === 1) {
            const tagName = String(node.tagName || "").toLowerCase();
            if (["script", "style", "noscript", "svg", "canvas", "template", "meta", "link"].includes(tagName)) {
              return;
            }
          }

          if (typeof node.assignedNodes === "function") {
            try {
              node.assignedNodes({ flatten: true }).forEach(visit);
            } catch (error) {
              try {
                node.assignedNodes().forEach(visit);
              } catch (innerError) {
                void innerError;
              }
            }
          }

          if (node.shadowRoot) {
            visit(node.shadowRoot);
          }

          if (node.tagName === "IFRAME") {
            try {
              if (node.contentDocument && node.contentDocument.body) {
                visit(node.contentDocument.body);
              }
            } catch (error) {
              // Ignore cross-origin frames.
            }
          }

          const children = node.childNodes ? Array.from(node.childNodes) : [];
          children.forEach((child) => {
            if (child && child.nodeType === 1) {
              const tagName = String(child.tagName || "").toLowerCase();
              if (["script", "style", "noscript", "svg", "canvas", "template", "meta", "link"].includes(tagName)) {
                return;
              }
              if (child !== element && isLowValueElement(child)) {
                return;
              }
            }
            visit(child);
          });
        } catch (error) {
          // Ignore traversal errors and keep collecting the rest.
        }
      }

      visit(element);
      const value = cleanText(parts.join(" "));
      textCache.set(element, value);
      return value;
    }

    function isVisible(element) {
      if (!element || !(element instanceof context.window.Element)) {
        return false;
      }
      if (visibleCache.has(element)) {
        return visibleCache.get(element);
      }
      const style = context.window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
      visibleCache.set(element, visible);
      rectCache.set(element, rect);
      return visible;
    }

    function getPageTop(element) {
      if (!element || !element.getBoundingClientRect) {
        return 0;
      }
      const rect = rectCache.get(element) || element.getBoundingClientRect();
      rectCache.set(element, rect);
      return rect.top + context.window.scrollY;
    }

    function isLowValueElement(element) {
      if (!element || !(element instanceof context.window.Element)) {
        return false;
      }
      return Boolean(element.closest(LOW_VALUE_SELECTOR));
    }

    function querySelectorAllDeep(root, selector) {
      const results = [];
      const seen = new Set();

      function visit(scope) {
        if (!scope || !scope.querySelectorAll) return;

        Array.from(scope.querySelectorAll(selector)).forEach((element) => {
          if (!seen.has(element)) {
            seen.add(element);
            results.push(element);
          }
        });

        Array.from(scope.querySelectorAll("*")).slice(0, 1300).forEach((element) => {
          if (element.shadowRoot) {
            visit(element.shadowRoot);
          }

          if (element.tagName === "IFRAME") {
            try {
              if (element.contentDocument && element.contentDocument.body) {
                visit(element.contentDocument.body);
              }
            } catch (error) {
              // Ignore cross-origin frames.
            }
          }
        });
      }

      visit(root);
      return results;
    }

    function hashText(text) {
      let hash = 0;
      const value = String(text || "");
      for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index);
        hash |= 0;
      }
      return Math.abs(hash).toString(36);
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    return {
      resetScanCaches,
      cleanText,
      countWords,
      getReadableText,
      isVisible,
      getPageTop,
      isLowValueElement,
      querySelectorAllDeep,
      hashText,
      escapeHtml
    };
  }

  function pickArticleRoot(context, helpers) {
    const selectors = [
      "article",
      "main",
      "[role='main']",
      ".post-content",
      ".entry-content",
      ".article-content",
      ".article-body",
      ".story-body",
      ".content",
      "#content"
    ];

    const candidates = selectors
      .flatMap((selector) => Array.from(context.document.querySelectorAll(selector)))
      .filter((element, index, list) => list.indexOf(element) === index)
      .filter((element) => isUsableContainer(element, helpers));

    candidates.push(context.document.body);
    let best = context.document.body;
    let bestScore = 0;

    candidates.forEach((candidate) => {
      const text = helpers.getReadableText(candidate);
      const words = helpers.countWords(text);
      const linkWords = helpers.countWords(Array.from(candidate.querySelectorAll("a")).map((link) => link.innerText || "").join(" "));
      const linkDensity = words ? linkWords / words : 1;
      const rect = candidate.getBoundingClientRect();
      const sizeBonus = Math.min(90, Math.max(0, rect.width * rect.height / 30000));
      const score = words - linkDensity * 560 + sizeBonus;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });

    return best || context.document.body;
  }

  function isUsableContainer(element, helpers) {
    if (!element || helpers.isLowValueElement(element)) {
      return false;
    }
    return helpers.countWords(helpers.getReadableText(element)) >= MIN_USEFUL_WORDS && helpers.isVisible(element);
  }

  function normalizeProfile(profile, adapter) {
    const normalized = {
      type: profile.type || "low_structure",
      label: profile.label || "Page",
      readingConfidence: Number.isFinite(profile.readingConfidence) ? profile.readingConfidence : 34,
      quietMode: Boolean(profile.quietMode),
      reason: profile.reason || "Nothing strong to map here",
      quietReason: profile.quietReason || "",
      searchSubtype: profile.searchSubtype || "",
      ocrQuality: profile.ocrQuality || "",
      qualityMessage: profile.qualityMessage || "",
      adapterName: profile.adapterName || adapter.name
    };
    if ((profile.adapterName || adapter.name) === "google-docs") {
      normalized.googleDocsPartial = Boolean(profile.googleDocsPartial);
      normalized.googleDocsMode = profile.googleDocsMode || "";
      normalized.googleDocsActiveTab = profile.googleDocsActiveTab || "";
      normalized.googleDocsFailureReason = profile.googleDocsFailureReason || "";
      normalized.googleDocsRenderingCapability = profile.googleDocsRenderingCapability || "";
    }
    return normalized;
  }

  function collectHeadingSections(root, adapter, profile) {
    const helpers = getHelpersFromRoot(root);
    const headings = helpers.querySelectorAllDeep(root, "h1, h2, h3, h4")
      .filter((heading) => helpers.isVisible(heading) && !helpers.isLowValueElement(heading))
      .filter((heading) => helpers.cleanText(heading.innerText || heading.textContent).length >= 3)
      .map((heading, index) => ({
        heading,
        index,
        level: Number(heading.tagName.slice(1)),
        top: helpers.getPageTop(heading),
        title: cleanTitle(helpers.cleanText(heading.innerText || heading.textContent))
      }))
      .filter((item, index, list) => {
        const previous = list[index - 1];
        return !previous || previous.title.toLowerCase() !== item.title.toLowerCase() || Math.abs(previous.top - item.top) > 80;
      })
      .sort((a, b) => a.top - b.top)
      .slice(0, MAX_HEADINGS);
    const blocks = getContentBlocks(root, helpers);

    return headings
      .map((item, index) => {
        const next = headings.slice(index + 1).find((candidate) => candidate.level <= item.level) || headings[index + 1];
        const end = next ? next.top : Number.POSITIVE_INFINITY;
        const sectionBlocks = blocks.filter((block) => {
          const top = helpers.getPageTop(block);
          return top >= item.top - 4 && top < end - 4;
        });

        return makeSection({
          title: item.title,
          anchor: item.heading,
          blocks: sectionBlocks,
          source: "heading",
          index,
          level: item.level,
          adapter,
          profile,
          helpers,
          unitMeta: {}
        });
      })
      .filter(Boolean);
  }

  function collectBlockSections(root, adapter, profile) {
    const helpers = getHelpersFromRoot(root);
    const blocks = getContentBlocks(root, helpers);
    const sections = [];
    let bucket = [];
    let bucketWords = 0;

    blocks.forEach((block) => {
      const text = helpers.cleanText(block.innerText || block.textContent);
      const words = helpers.countWords(text);
      const isStandalone = block.matches("pre, table, blockquote, ul, ol") || words > 190;

      if (isStandalone && bucket.length) {
        sections.push(makeSectionFromBucket(bucket, sections.length, adapter, profile, helpers));
        bucket = [];
        bucketWords = 0;
      }

      bucket.push(block);
      bucketWords += words;

      if (isStandalone || bucketWords >= 165) {
        sections.push(makeSectionFromBucket(bucket, sections.length, adapter, profile, helpers));
        bucket = [];
        bucketWords = 0;
      }
    });

    if (bucket.length) {
      sections.push(makeSectionFromBucket(bucket, sections.length, adapter, profile, helpers));
    }

    return sections.filter(Boolean);
  }

  function adapterUnitsToSections(units, adapter, profile) {
    if (!units.length) return [];
    const helpers = getHelpersFromRoot(units[0].anchor);
    return units.map((unit, index) => makeSection({
      title: unit.title,
      anchor: unit.anchor,
      blocks: unit.blocks || [unit.anchor],
      source: unit.source || "adapter",
      index,
      level: Number.isFinite(unit.level) ? unit.level : 2,
      pageNumber: unit.pageNumber || unit.meta && unit.meta.pageNumber,
      navigationTarget: unit.navigationTarget || unit.meta && unit.meta.navigationTarget,
      text: unit.text || "",
      adapter,
      profile,
      helpers,
      unitMeta: safeCall(() => adapter.classifyUnit(unit), unit.meta || {})
    })).filter(Boolean);
  }

  function getHelpersFromRoot(root) {
    let current = root;
    while (current && !current.__pagePilotHelpers) {
      current = current.parentNode || current.host;
    }
    if (current && current.__pagePilotHelpers) {
      return current.__pagePilotHelpers;
    }
    return window.__PAGEPILOT_ACTIVE_HELPERS__;
  }

  function getContentBlocks(root, helpers) {
    if (!root || !helpers) return [];
    root.__pagePilotHelpers = helpers;
    window.__PAGEPILOT_ACTIVE_HELPERS__ = helpers;
    const selector = [
      "p",
      "li",
      "pre",
      "blockquote",
      "table",
      "figure",
      "[role='note']"
    ].join(",");

    return helpers.querySelectorAllDeep(root, selector)
      .filter((element) => helpers.isVisible(element) && !helpers.isLowValueElement(element))
      .filter((element) => {
        const text = helpers.cleanText(element.innerText || element.textContent);
        if (element.matches("figure")) return text.length >= 45;
        return helpers.countWords(text) >= 8 || element.matches("pre, table");
      })
      .filter((element, index, list) => {
        const previous = list[index - 1];
        return !previous || !previous.contains(element);
      })
      .slice(0, MAX_CONTENT_BLOCKS);
  }

  function makeSectionFromBucket(bucket, index, adapter, profile, helpers) {
    return makeSection({
      title: inferTitle(bucket, helpers),
      anchor: bucket[0],
      blocks: bucket,
      source: "block",
      index,
      level: inferSectionLevel(bucket, helpers),
      adapter,
      profile,
      helpers,
      unitMeta: {}
    });
  }

  function makeSection(options) {
    const sourceText = options.helpers.cleanText(options.text || "");
    const domText = options.helpers.cleanText(
      [options.title].concat((options.blocks || []).map((block) => block.innerText || block.textContent || "")).join(" ")
    );
    const text = sourceText
      ? options.helpers.cleanText([options.title, sourceText].filter(Boolean).join(" "))
      : domText;
    const wordCount = options.helpers.countWords(text);

    if (!options.anchor || wordCount < 14) {
      return null;
    }

    const id = `pp-section-${options.index}-${options.helpers.hashText(`${options.title}:${wordCount}:${options.source}:${options.level}`)}`;
    options.anchor.dataset.pagepilotSection = id;
    const metrics = getSectionMetrics({
      anchor: options.anchor,
      blocks: options.blocks || [],
      title: options.title,
      text,
      index: options.index,
      helpers: options.helpers,
      profile: options.profile,
      unitMeta: options.unitMeta || {}
    });

    return {
      id,
      title: cleanTitle(options.title || "Useful section"),
      anchor: options.anchor,
      blocks: options.blocks || [],
      source: options.source,
      pageNumber: options.pageNumber || options.unitMeta && options.unitMeta.pageNumber || null,
      navigationTarget: options.navigationTarget || options.unitMeta && options.unitMeta.navigationTarget || "",
      index: options.index,
      level: Number.isFinite(options.level) ? options.level : 2,
      parentId: null,
      childIds: [],
      isCollapsed: false,
      text,
      wordCount,
      top: Number.isFinite(options.unitMeta && options.unitMeta.syntheticTop)
        ? Number(options.unitMeta.syntheticTop)
        : options.helpers.getPageTop(options.anchor),
      unitMeta: options.unitMeta || {},
      metrics,
      score: metrics.score,
      usefulScore: metrics.usefulScore,
      importanceScore: metrics.importanceScore,
      label: "",
      isImportant: false,
      isBest: false
    };
  }

  function getSectionMetrics(details) {
    const blockStats = getBlockStats(details);
    const textSignals = scoreTextSignals({
      title: details.title,
      text: details.text,
      index: details.index,
      profile: details.profile,
      unitMeta: details.unitMeta,
      blockStats,
      classTrail: getClassTrail(details.anchor, details.helpers),
      isElementLowValue: details.helpers.isLowValueElement(details.anchor)
    });

    return Object.assign({}, blockStats, textSignals);
  }

  function getBlockStats(details) {
    const helpers = details.helpers;
    const blocks = details.blocks || [];
    const wordCount = helpers.countWords(details.text);
    const paragraphs = blocks.filter((block) => block.matches && block.matches("p, blockquote")).length;
    const listItems = blocks.filter((block) => block.matches && block.matches("li, [role='listitem']")).length;
    const numberedItems = blocks.filter((block) => /^\s*(\d+\.|step\s+\d+|first|second|third|next|finally)\b/i.test(block.innerText || block.textContent || "")).length;
    const codeBlocks = blocks.filter((block) => block.matches && block.matches("pre, code")).length
      + (details.anchor.matches && details.anchor.matches("pre, code") ? 1 : 0);
    const tables = blocks.filter((block) => block.matches && block.matches("table")).length;
    const boldCount = blocks.reduce((sum, block) => sum + (block.querySelectorAll ? block.querySelectorAll("strong, b").length : 0), 0);
    const links = blocks.reduce((sum, block) => sum + (block.querySelectorAll ? block.querySelectorAll("a").length : 0), 0);
    const linkWords = blocks.reduce((sum, block) => {
      if (!block.querySelectorAll) return sum;
      return sum + Array.from(block.querySelectorAll("a")).reduce((linkSum, link) => linkSum + helpers.countWords(link.innerText || link.textContent), 0);
    }, 0);

    return {
      wordCount,
      paragraphs,
      listItems,
      numberedItems,
      codeBlocks,
      tables,
      boldCount,
      links,
      linkDensity: wordCount ? linkWords / wordCount : 0,
      hasNumbers: /\b\d+([.,]\d+)?%?\b/.test(details.text),
      hasReadableParagraphs: paragraphs > 0 && wordCount / Math.max(1, paragraphs) <= 145
    };
  }

  function scoreTextSignals(input) {
    const title = cleanText(input.title);
    const headingText = title.toLowerCase();
    const fullText = cleanText(input.text);
    const lower = fullText.toLowerCase();
    const headingAndText = `${headingText} ${lower}`;
    const stats = input.blockStats || {};
    const wordCount = stats.wordCount || countWords(fullText);
    const startsWithQuestion = /^(what|why|how|when|where|which|should|can)\b/.test(headingText);
    const isCompact = wordCount >= 45 && wordCount <= 280;
    const hasNumberedProcedure = (stats.numberedItems || 0) >= 2 || PROCEDURE_PATTERN.test(fullText);
    const hasConciseAnswer = /\b(tl;dr|tldr|short answer|quick answer|bottom line|the answer is|in short)\b/i.test(fullText.slice(0, 800));
    const hasSummary = /\b(summary|recap|key takeaways?|tl;dr|tldr|bottom line|in short|executive summary|what matters)\b/i.test(headingAndText);
    const hasDirectAction = /\b(use this|do this|copy(?: and paste)?|paste this|run this|replace(?: that| it)?|change(?: that| it)?|set this|configure|install|deploy|ship|update|remove|add|create|select this option)\b/i.test(fullText);
    const hasComparison = /\b(vs\.?|versus|compared with|compared to|comparison|pros and cons|trade-?offs?|difference between|better than)\b/i.test(fullText);
    const hasAcceptedAnswer = /\b(accepted answer|top answer|top comment|marked as solution|solved|worked for me|this fixed it|confirmed fix)\b/i.test(fullText);
    const hasTroubleshooting = /\b(error|bug|issue|problem|fix|fixed|workaround|troubleshoot|root cause|resolved|solution)\b/i.test(fullText);
    const hasNegatedAnswer = /\b(?:not|isn'?t|is not|wasn'?t|was not|never|isn’t|wasn’t)\s+(?:the\s+)?(?:actual\s+)?(?:answer|solution|fix|final answer|recommended option)\b/i.test(fullText);
    const hasRecommendationSignal = !hasNegatedAnswer && (POSITIVE_PATTERNS.recommendation.test(headingText) || POSITIVE_PATTERNS.recommendation.test(lower));
    const codeHasExplanation = (stats.codeBlocks || 0) > 0 && ((stats.paragraphs || 0) > 0 || /\b(example|usage|run|returns?|outputs?|copy|paste|configure|install)\b/i.test(fullText));
    const hasCompleteCode = (stats.codeBlocks || 0) > 0
      && /\b(final|complete|full|working version|copy and paste|paste this|production-ready|drop-in)\b/i.test(fullText);
    const hasMainArgument = /\b(main argument|central argument|key argument|thesis|claim|we argue|this paper argues|the argument is|main point|central claim)\b/i.test(headingAndText);
    const hasKeyEvidence = /\b(key evidence|evidence|data show|results show|findings show|analysis shows|supports the claim|we found|we find|indicates?|demonstrates?|significant)\b/i.test(headingAndText);
    const hasMethods = PDF_SECTION_PATTERNS.methods.test(headingAndText) || /\b(methods?|methodology|approach|procedure|process|implementation details|experimental setup|data and methods|materials and methods)\b/i.test(headingText);
    const hasResults = PDF_SECTION_PATTERNS.results.test(headingAndText) || /\b(results?|findings?|outcomes?|benchmarks?|measurements?)\b/i.test(headingText);
    const hasConclusion = CONCLUSION_PATTERNS.test(headingAndText) || PDF_SECTION_PATTERNS.conclusion.test(headingText);
    const unitMeta = input.unitMeta || {};
    const hasReferences = unitMeta.pdfSectionType === "works_cited" || PDF_SECTION_PATTERNS.works_cited.test(headingAndText);
    const hasAppendix = unitMeta.pdfSectionType === "appendix" || PDF_SECTION_PATTERNS.appendix.test(headingAndText);
    const hasTableOfContents = unitMeta.pdfSectionType === "toc" || PDF_SECTION_PATTERNS.toc.test(headingAndText) || looksLikeTableOfContents(fullText);
    const citationHits = countPatternHits(fullText, /(\[[0-9,\s-]{1,18}\]|\([A-Z][A-Za-z-]+(?:\s+et\s+al\.)?,?\s+\d{4}[a-z]?\)|\bdoi:\s*\S+|https?:\/\/\S+|\bRetrieved from\b|\bISBN\b)/gi);
    const hasCitationOnly = citationHits >= 3
      && wordCount < 220
      && !hasSummary
      && !hasConclusion
      && !hasResults
      && !hasMethods
      && !hasMainArgument
      && !hasKeyEvidence;
    const hasBoilerplate = unitMeta.pdfSectionType === "boilerplate" || /\b(copyright|all rights reserved|privacy policy|terms of service|cookie preferences|powered by|site map|sitemap|skip to content|back to top|page \d+\s+of\s+\d+|downloaded from|licensed under|journal homepage|issn|doi:)\b/i.test(headingAndText);
    const titleRemainderWords = countWords(fullText.replace(title, ""));
    const isHeaderOnly = wordCount < 32 && title && titleRemainderWords < 9 && !(stats.codeBlocks || 0) && !(stats.tables || 0);
    const repeatedTextScore = getRepeatedTextScore(fullText);
    const hasRepeatedNoise = repeatedTextScore >= 3;
    const hasSupersededDraft = Boolean(input.unitMeta && input.unitMeta.isSuperseded)
      || /\b(earlier answer|previous answer|ignore that|not quite|that was wrong|may not handle|first attempt|one possible fix|draft)\b/i.test(fullText);
    const negativePatternHit = NEGATIVE_PATTERNS.test(headingAndText);
    const fluffPatternHit = FLUFF_PATTERNS.test(headingAndText);
    const introPatternHit = INTRO_PATTERNS.test(headingText) || (input.index <= 1 && INTRO_PATTERNS.test(headingAndText));
    const conclusionHit = CONCLUSION_PATTERNS.test(headingAndText);
    const isDenseLinks = (stats.linkDensity || 0) > 0.34 || ((stats.links || 0) > 12 && wordCount < 180);
    const isLongSoftIntro = input.index <= 1 && wordCount > 240 && !hasConciseAnswer && !hasNumberedProcedure && !(stats.codeBlocks || 0) && !(stats.tables || 0);
    const profile = input.profile || {};
    const contentRankType = getContentRankingType(profile, headingAndText);
    const targetContentPage = Boolean(contentRankType);
    const hasQuickStart = targetContentPage && /\b(quick start|getting started|get started|start here|first steps?)\b/i.test(headingAndText);
    const hasInstallation = targetContentPage && /\b(install(?:ation)?|npm install|pip install|setup package|requirements?|dependencies)\b/i.test(headingAndText);
    const hasUsage = targetContentPage && /\b(usage|how to use|using the|example request|api call|request body|response object|run this|copy(?: and paste)?)\b/i.test(headingAndText);
    const hasParameters = targetContentPage && /\b(parameters?|options?|arguments?|props?|configuration|settings|schema|fields?|endpoint|api reference|return values?)\b/i.test(headingAndText);
    const hasPrerequisites = targetContentPage && /\b(prerequisites?|requirements?|before you start|before starting|you'?ll need|what you need)\b/i.test(headingAndText);
    const hasSetup = targetContentPage && /\b(setup|set up|configure|configuration|initialize|create the project|environment variables?)\b/i.test(headingAndText);
    const hasFinalResult = targetContentPage && /\b(final result|result|expected output|finished|success|verify|what you should see|outcome)\b/i.test(headingAndText);
    const hasIngredients = targetContentPage && /\b(ingredients?|what you need|for the recipe)\b/i.test(headingAndText);
    const hasInstructions = targetContentPage && /\b(instructions?|directions?|method|preparation|steps?|how to make|cook|bake|simmer|stir|serve)\b/i.test(headingAndText);
    const hasTiming = targetContentPage && /\b(prep time|cook time|total time|ready in|minutes?|hours?|bake for|simmer for|chill for)\b/i.test(headingAndText);
    const hasTips = targetContentPage && /\b(tips?|notes?|variations?|substitutions?|storage|make ahead|serving suggestions?)\b/i.test(headingAndText);
    const hasAbstract = targetContentPage && PDF_SECTION_PATTERNS.abstract.test(headingAndText);
    const hasDiscussion = targetContentPage && PDF_SECTION_PATTERNS.discussion.test(headingAndText);
    const hasChangelog = targetContentPage && /\b(changelog|release notes?|version history|what'?s new|breaking changes?|deprecated)\b/i.test(headingAndText);
    const hasPageTypeClutter = targetContentPage && (
      /\b(navigation|menu|breadcrumb|sidebar|footer|advertisement|sponsored|sponsor|newsletter|subscribe|sign up|author bio|about the author|comments?|reviews?|related links?|related posts?|recommended articles?|cookie|account|login|create account|privacy policy|terms of service)\b/i.test(headingAndText)
      || /\b(nav|menu|breadcrumb|footer|sidebar|share|social|related|comment|promo|newsletter|subscribe|advert|sponsor|affiliate|cookie|consent|byline|author|account|login)\b/i.test(input.classTrail || "")
    );
    const searchBlockType = unitMeta.searchBlockType || "";
    const isAssistantResponse = unitMeta.role === "assistant";
    const answersLatestUser = Boolean(isAssistantResponse && unitMeta.answersLatestUser);
    const isShortConfirmation = Boolean(isAssistantResponse && wordCount <= 18 && /^(yes|no|ok|okay|sure|done|got it|sounds good|correct|thanks|you'?re welcome)[.! ]*$/i.test(fullText));
    const isLoadingOrFailedAnswer = Boolean(isAssistantResponse && (
      /\b(generating response|thinking\.\.\.|loading response|still loading|something went wrong|network error|failed to generate|try again|regenerate response|error occurred)\b/i.test(fullText)
      || /^(loading|thinking|generating)\.?\s*$/i.test(fullText.trim())
    ));
    const hasRawFinalAnswer = Boolean(isAssistantResponse && (unitMeta.hasFinalAnswer || hasConciseAnswer || /\b(final answer|final version|bottom line|in short|short answer|here'?s the answer|the answer is)\b/i.test(fullText.slice(0, 900))));
    const hasStepByStepAnswer = Boolean(isAssistantResponse && !isLoadingOrFailedAnswer && (unitMeta.hasStepByStep || hasNumberedProcedure || /\b(step-by-step|step by step|first,|next,|then,|finally,)\b/i.test(fullText)) && wordCount >= 24);
    const hasKeyExplanation = Boolean(isAssistantResponse && !isLoadingOrFailedAnswer && (unitMeta.hasKeyExplanation || /\b(here'?s why|why this works|the reason|because|key point|important part|what matters|explanation)\b/i.test(fullText)) && wordCount >= 40);
    const hasSummarySignal = Boolean(isAssistantResponse && hasSummary && !isLoadingOrFailedAnswer && wordCount >= 24);
    const completeCodeUsable = Boolean(isAssistantResponse && !isLoadingOrFailedAnswer && hasCompleteCode);
    const completeAssistantAnswer = Boolean(isAssistantResponse
      && !isLoadingOrFailedAnswer
      && !isShortConfirmation
      && !hasCitationOnly
      && wordCount >= 24
      && (
        unitMeta.isCompleteAssistantAnswer
        || hasRawFinalAnswer
        || hasSummarySignal
        || completeCodeUsable
        || unitMeta.hasRecommendation
        || hasRecommendationSignal
        || hasStepByStepAnswer
        || hasKeyExplanation
        || codeHasExplanation
        || wordCount >= 45
      ));
    const hasLatestAssistantAnswer = Boolean(isAssistantResponse && unitMeta.isLatestAssistant && completeAssistantAnswer);
    const hasLatestCompleteAssistantAnswer = Boolean(isAssistantResponse && completeAssistantAnswer && (unitMeta.isLatestCompleteAssistant || unitMeta.isLatestAssistant));
    const replacesFailedAttempt = Boolean(isAssistantResponse && completeAssistantAnswer && (
      unitMeta.replacesFailedAttempt
      || /\b(previous(?: answer| attempt)? (?:failed|was wrong|didn'?t work)|that failed|failed attempt|fix(?:ed)? (?:the|that|previous) attempt|try this instead|use this instead)\b/i.test(fullText)
    ));
    const hasCorrectedAnswer = Boolean(isAssistantResponse && completeAssistantAnswer && (unitMeta.isAfterUserCorrection || unitMeta.hasRevision || (hasLatestCompleteAssistantAnswer && unitMeta.hasRevision)));
    const hasFinalAnswer = Boolean(hasRawFinalAnswer && completeAssistantAnswer);
    const hasFinalRecommendation = Boolean(isAssistantResponse && completeAssistantAnswer && (hasFinalAnswer || conclusionHit || unitMeta.hasFinalAnswer) && /\b(recommend|recommended|best option|best choice|use this|choose|go with|my recommendation)\b/i.test(fullText));
    const incompleteAssistantAnswer = Boolean(isAssistantResponse && unitMeta.isLatestAssistant && !completeAssistantAnswer && (isLoadingOrFailedAnswer || isShortConfirmation || hasCitationOnly || wordCount < 24));
    const hasPromptEcho = Boolean(unitMeta.role === "user" || unitMeta.isPromptEcho)
      || (profile.type === "chat" && /^(user|you|human|prompt|question|q)\s*[:\-]/i.test(fullText.slice(0, 180)));

    const matched = {
      useful: POSITIVE_PATTERNS.useful.test(headingText) || POSITIVE_PATTERNS.useful.test(lower),
      answer: !hasNegatedAnswer && (POSITIVE_PATTERNS.answer.test(headingText) || POSITIVE_PATTERNS.answer.test(lower)),
      action: POSITIVE_PATTERNS.action.test(headingText) || POSITIVE_PATTERNS.action.test(lower),
      definition: POSITIVE_PATTERNS.definition.test(headingText) || POSITIVE_PATTERNS.definition.test(lower),
      warning: POSITIVE_PATTERNS.warning.test(headingText) || POSITIVE_PATTERNS.warning.test(lower),
      example: POSITIVE_PATTERNS.example.test(headingText) || POSITIVE_PATTERNS.example.test(lower),
      recommendation: hasRecommendationSignal,
      finality: !hasNegatedAnswer && (POSITIVE_PATTERNS.finality.test(headingText) || POSITIVE_PATTERNS.finality.test(lower) || conclusionHit),
      procedure: hasNumberedProcedure,
      conciseAnswer: hasConciseAnswer,
      summary: hasSummary,
      directAction: hasDirectAction,
      comparison: hasComparison,
      codeExplanation: codeHasExplanation,
      completeCode: completeCodeUsable,
      acceptedAnswer: hasAcceptedAnswer,
      troubleshooting: hasTroubleshooting,
      revision: Boolean(unitMeta.hasRevision),
      finalCode: Boolean(unitMeta.finalCode),
      finalAnswer: hasFinalAnswer,
      finalRecommendation: hasFinalRecommendation,
      stepByStepAnswer: hasStepByStepAnswer,
      keyExplanation: hasKeyExplanation,
      completeAssistantAnswer,
      shortConfirmation: isShortConfirmation,
      loadingOrFailedAnswer: isLoadingOrFailedAnswer,
      incompleteAssistantAnswer,
      latestAssistantAnswer: hasLatestAssistantAnswer,
      latestCompleteAssistantAnswer: hasLatestCompleteAssistantAnswer,
      correctedAnswer: hasCorrectedAnswer,
      replacesFailedAttempt,
      answersLatestUser,
      supersededDraft: hasSupersededDraft,
      mainArgument: hasMainArgument,
      keyEvidence: hasKeyEvidence,
      quickStart: hasQuickStart,
      installation: hasInstallation,
      usage: hasUsage,
      parameters: hasParameters,
      prerequisites: hasPrerequisites,
      setup: hasSetup,
      finalResult: hasFinalResult,
      ingredients: hasIngredients,
      instructions: hasInstructions,
      timing: hasTiming,
      tips: hasTips,
      abstract: hasAbstract,
      methods: hasMethods,
      results: hasResults,
      discussion: hasDiscussion,
      conclusion: hasConclusion,
      changelog: hasChangelog,
      pageTypeClutter: hasPageTypeClutter,
      references: hasReferences,
      appendix: hasAppendix,
      tableOfContents: hasTableOfContents,
      citationOnly: hasCitationOnly,
      boilerplate: hasBoilerplate,
      promptEcho: hasPromptEcho,
      headerOnly: isHeaderOnly,
      repeatedNoise: hasRepeatedNoise
    };

    const googleDocsRole = isGoogleDocsSection(unitMeta, profile)
      ? classifyGoogleDocsRole({
        title,
        headingText,
        lower,
        headingAndText,
        wordCount,
        index: input.index,
        profile,
        stats,
        unitMeta,
        matched,
        level: unitMeta.headingLevel
      })
      : null;
    if (googleDocsRole) {
      matched.googleDocsMainClaim = googleDocsRole.role === "main_claim";
      matched.googleDocsSummary = googleDocsRole.role === "summary";
      matched.googleDocsSteps = googleDocsRole.role === "steps";
      matched.googleDocsEvidence = googleDocsRole.role === "evidence";
      matched.googleDocsResults = googleDocsRole.role === "results";
      matched.googleDocsConclusion = googleDocsRole.role === "conclusion";
      matched.googleDocsReferences = googleDocsRole.role === "references";
      matched.googleDocsAppendix = googleDocsRole.role === "appendix";
      matched.googleDocsDocumentTitle = googleDocsRole.role === "document_title";
      matched.googleDocsEditorInstruction = Boolean(googleDocsRole.chromeOrInstruction);
    }

    const pdfOcrRole = profile.type === "pdf"
      ? normalizePdfOcrRole(unitMeta.ocrRole || input.ocrRole || input.metrics && input.metrics.ocrRole)
      : "";
    const sectionKind = classifySectionKind({
      title,
      headingText,
      lower,
      headingAndText,
      wordCount,
      index: input.index,
      profile,
      stats,
      unitMeta,
      matched: pdfOcrRole ? {
        ...matched,
        ocrLetterBody: pdfOcrRole === "body",
        ocrLetterhead: pdfOcrRole === "letterhead",
        ocrRecipient: pdfOcrRole === "recipient",
        ocrDateReference: pdfOcrRole === "date_reference",
        ocrSignature: pdfOcrRole === "signature"
      } : matched,
      isHeaderOnly,
      repeatedTextScore,
      googleDocsRole
    });

    let usefulScore = 0;
    let importanceScore = 0;
    let structureScore = 0;
    const responsePriority = Number.isFinite(unitMeta.responsePriority) ? unitMeta.responsePriority : 0;

    if (matched.conciseAnswer) usefulScore += 52;
    if (matched.answer) usefulScore += 46;
    if (matched.procedure) usefulScore += 42;
    if (matched.action) usefulScore += 38;
    if (matched.directAction) usefulScore += 34;
    if (matched.codeExplanation) usefulScore += 34;
    if (matched.completeCode) usefulScore += 48;
    if (matched.acceptedAnswer) usefulScore += 46;
    if (matched.recommendation) usefulScore += 30;
    if (matched.finality) usefulScore += 30;
    if (matched.summary) usefulScore += matched.conciseAnswer || matched.answer ? 18 : 36;
    if (matched.example) usefulScore += 24;
    if (matched.definition) usefulScore += 28;
    if (matched.conclusion) usefulScore += 34;
    if (matched.results) usefulScore += 38;
    if (matched.mainArgument) usefulScore += 42;
    if (matched.keyEvidence) usefulScore += 34;
    if (matched.methods) usefulScore += 22;
    if (contentRankType === "article") {
      if (matched.mainArgument) usefulScore += 30;
      if (matched.keyEvidence) usefulScore += 24;
      if (matched.summary) usefulScore += 18;
      if (matched.conclusion) usefulScore += 26;
    }
    if (contentRankType === "docs") {
      if (matched.quickStart) usefulScore += 58;
      if (matched.installation) usefulScore += 42;
      if (matched.usage) usefulScore += 48;
      if (matched.example || matched.codeExplanation || (stats.codeBlocks || 0) > 0) usefulScore += 34;
      if (matched.parameters) usefulScore += 34;
      if (matched.troubleshooting) usefulScore += 34;
    }
    if (contentRankType === "tutorial") {
      if (matched.prerequisites) usefulScore += 28;
      if (matched.setup || matched.installation) usefulScore += 42;
      if (matched.procedure || matched.directAction || matched.action) usefulScore += 46;
      if (matched.codeExplanation || (stats.codeBlocks || 0) > 0) usefulScore += 34;
      if (matched.finalResult) usefulScore += 34;
    }
    if (contentRankType === "recipe") {
      if (matched.ingredients) usefulScore += 42;
      if (matched.instructions || matched.procedure) usefulScore += 82;
      if (matched.timing) usefulScore += 24;
      if (matched.tips) usefulScore += 20;
    }
    if (contentRankType === "research") {
      if (matched.abstract) usefulScore += 42;
      if (matched.methods) usefulScore += 24;
      if (matched.results) usefulScore += 54;
      if (matched.discussion) usefulScore += 36;
      if (matched.conclusion) usefulScore += 50;
    }
    if (googleDocsRole) {
      if (googleDocsRole.role === "summary") usefulScore += 58;
      if (googleDocsRole.role === "main_claim") usefulScore += 62;
      if (googleDocsRole.role === "steps") usefulScore += 86;
      if (googleDocsRole.role === "evidence") usefulScore += 44;
      if (googleDocsRole.role === "results") usefulScore += 96;
      if (googleDocsRole.role === "conclusion") usefulScore += 62;
      if (googleDocsRole.role === "introduction") usefulScore += 16;
      if (googleDocsRole.role === "heading") usefulScore -= 28;
      if (googleDocsRole.role === "document_title") usefulScore -= 34;
      if (googleDocsRole.role === "references") usefulScore -= 72;
      if (googleDocsRole.role === "appendix") usefulScore -= 46;
      if (googleDocsRole.shortFragment) usefulScore -= 26;
      if (googleDocsRole.chromeOrInstruction) usefulScore -= 82;
    }
    if (matched.revision) usefulScore += 28;
    if (matched.finalAnswer) usefulScore += 58;
    if (matched.finalRecommendation) usefulScore += 66;
    if (matched.stepByStepAnswer) usefulScore += 52;
    if (matched.keyExplanation) usefulScore += 42;
    if (matched.completeAssistantAnswer) usefulScore += 30;
    if (matched.latestAssistantAnswer) usefulScore += 28;
    if (matched.latestCompleteAssistantAnswer) usefulScore += 44;
    if (matched.correctedAnswer) usefulScore += 62;
    if (matched.replacesFailedAttempt) usefulScore += 58;
    if (matched.answersLatestUser) usefulScore += 38;
    if (matched.finalCode) usefulScore += 54;
    if ((stats.codeBlocks || 0) > 0) usefulScore += 24;
    if (responsePriority > 0) usefulScore += Math.min(52, responsePriority);
    if (unitMeta.pdfSectionType === "form") usefulScore += 42;
    if (unitMeta.pdfSectionType === "table") usefulScore += 30;
    if (unitMeta.pdfSectionType === "signature") usefulScore += 14;
    if (pdfOcrRole === "body") usefulScore += 72;
    if (pdfOcrRole === "body" && wordCount >= 40) usefulScore += 24;
    if (pdfOcrRole === "letterhead") usefulScore -= 74;
    if (pdfOcrRole === "recipient") usefulScore -= 46;
    if (pdfOcrRole === "date_reference") usefulScore -= 18;
    if (pdfOcrRole === "greeting") usefulScore -= 28;
    if (pdfOcrRole === "closing") usefulScore -= 46;
    if (pdfOcrRole === "signature") usefulScore -= 78;
    if (pdfOcrRole === "footer") usefulScore -= 68;
    if (searchBlockType === "ai_overview") usefulScore += 58;
    if (searchBlockType === "answer") usefulScore += 50;
    if (searchBlockType === "top_results") usefulScore += 30;
    if (searchBlockType === "people_also_ask" || searchBlockType === "sources") usefulScore += 24;
    if (searchBlockType === "videos" || searchBlockType === "maps") usefulScore += 16;
    if (searchBlockType === "related_searches") usefulScore += 10;
    if (searchBlockType === "shopping") usefulScore += 6;
    if (matched.shortConfirmation) usefulScore -= 54;
    if (matched.loadingOrFailedAnswer) usefulScore -= 82;
    if (matched.incompleteAssistantAnswer) usefulScore -= 76;
    if (matched.supersededDraft) usefulScore -= 38;
    if (matched.promptEcho) usefulScore -= 72;
    if (matched.citationOnly) usefulScore -= 56;
    if (matched.references) usefulScore -= 62;
    if (matched.appendix) usefulScore -= 36;
    if (matched.tableOfContents) usefulScore -= 48;
    if (matched.boilerplate) usefulScore -= 70;
    if (matched.changelog) usefulScore -= 58;
    if (matched.pageTypeClutter) usefulScore -= 82;
    if (sectionKind.kind === "title_page") usefulScore -= 42;
    if (isHeaderOnly) usefulScore -= 26;
    if (hasRepeatedNoise) usefulScore -= 34;

    if (matched.useful) importanceScore += 38;
    if (matched.definition) importanceScore += 24;
    if (matched.warning) importanceScore += 24;
    if (matched.comparison) importanceScore += 22;
    if (matched.conclusion) importanceScore += 30;
    if (matched.results) importanceScore += 28;
    if (matched.mainArgument) importanceScore += 32;
    if (matched.keyEvidence) importanceScore += 26;
    if (matched.methods) importanceScore += 18;
    if (contentRankType === "article") {
      if (matched.mainArgument) importanceScore += 24;
      if (matched.keyEvidence) importanceScore += 20;
      if (matched.summary) importanceScore += 12;
      if (matched.conclusion) importanceScore += 20;
    }
    if (contentRankType === "docs") {
      if (matched.quickStart) importanceScore += 36;
      if (matched.installation) importanceScore += 24;
      if (matched.usage) importanceScore += 30;
      if (matched.example || matched.codeExplanation || (stats.codeBlocks || 0) > 0) importanceScore += 22;
      if (matched.parameters) importanceScore += 22;
      if (matched.troubleshooting) importanceScore += 24;
    }
    if (contentRankType === "tutorial") {
      if (matched.prerequisites) importanceScore += 18;
      if (matched.setup || matched.installation) importanceScore += 24;
      if (matched.procedure || matched.directAction || matched.action) importanceScore += 32;
      if (matched.codeExplanation || (stats.codeBlocks || 0) > 0) importanceScore += 22;
      if (matched.finalResult) importanceScore += 24;
    }
    if (contentRankType === "recipe") {
      if (matched.ingredients) importanceScore += 28;
      if (matched.instructions || matched.procedure) importanceScore += 54;
      if (matched.timing) importanceScore += 16;
      if (matched.tips) importanceScore += 14;
    }
    if (contentRankType === "research") {
      if (matched.abstract) importanceScore += 30;
      if (matched.methods) importanceScore += 18;
      if (matched.results) importanceScore += 42;
      if (matched.discussion) importanceScore += 26;
      if (matched.conclusion) importanceScore += 38;
    }
    if (googleDocsRole) {
      if (googleDocsRole.role === "summary") importanceScore += 38;
      if (googleDocsRole.role === "main_claim") importanceScore += 42;
      if (googleDocsRole.role === "steps") importanceScore += 48;
      if (googleDocsRole.role === "evidence") importanceScore += 34;
      if (googleDocsRole.role === "results") importanceScore += 58;
      if (googleDocsRole.role === "conclusion") importanceScore += 44;
      if (googleDocsRole.role === "introduction") importanceScore += 12;
      if (googleDocsRole.role === "heading") importanceScore -= 18;
      if (googleDocsRole.role === "document_title") importanceScore -= 22;
      if (googleDocsRole.role === "references") importanceScore -= 58;
      if (googleDocsRole.role === "appendix") importanceScore -= 34;
      if (googleDocsRole.shortFragment) importanceScore -= 18;
      if (googleDocsRole.chromeOrInstruction) importanceScore -= 58;
    }
    if (matched.directAction) importanceScore += 18;
    if (matched.completeCode) importanceScore += 22;
    if (matched.troubleshooting && (matched.answer || matched.action || matched.procedure)) importanceScore += 18;
    if (matched.summary && !matched.conciseAnswer) importanceScore += 16;
    if (matched.finalAnswer) importanceScore += 34;
    if (matched.finalRecommendation) importanceScore += 38;
    if (matched.stepByStepAnswer) importanceScore += 28;
    if (matched.keyExplanation) importanceScore += 24;
    if (matched.completeAssistantAnswer) importanceScore += 18;
    if (matched.latestAssistantAnswer) importanceScore += 18;
    if (matched.latestCompleteAssistantAnswer) importanceScore += 28;
    if (matched.correctedAnswer) importanceScore += 34;
    if (matched.replacesFailedAttempt) importanceScore += 30;
    if (matched.answersLatestUser) importanceScore += 22;
    if (unitMeta.pdfSectionType === "form") importanceScore += 28;
    if (unitMeta.pdfSectionType === "table") importanceScore += 20;
    if (unitMeta.pdfSectionType === "signature") importanceScore += 10;
    if (pdfOcrRole === "body") importanceScore += 64;
    if (pdfOcrRole === "body" && wordCount >= 40) importanceScore += 18;
    if (pdfOcrRole === "letterhead") importanceScore -= 62;
    if (pdfOcrRole === "recipient") importanceScore -= 36;
    if (pdfOcrRole === "date_reference") importanceScore -= 14;
    if (pdfOcrRole === "greeting") importanceScore -= 24;
    if (pdfOcrRole === "closing") importanceScore -= 38;
    if (pdfOcrRole === "signature") importanceScore -= 66;
    if (pdfOcrRole === "footer") importanceScore -= 54;
    if (searchBlockType === "ai_overview") importanceScore += 34;
    if (searchBlockType === "answer") importanceScore += 30;
    if (searchBlockType === "top_results") importanceScore += 20;
    if (searchBlockType === "people_also_ask" || searchBlockType === "sources") importanceScore += 18;
    if (searchBlockType === "videos" || searchBlockType === "maps") importanceScore += 10;
    if (searchBlockType === "related_searches") importanceScore += 6;
    if (searchBlockType === "shopping") importanceScore += 2;
    if (matched.shortConfirmation) importanceScore -= 34;
    if (matched.loadingOrFailedAnswer) importanceScore -= 56;
    if (matched.incompleteAssistantAnswer) importanceScore -= 46;
    if (matched.supersededDraft) importanceScore -= 28;
    if (matched.promptEcho) importanceScore -= 44;
    if (matched.citationOnly) importanceScore -= 36;
    if (matched.references) importanceScore -= 50;
    if (matched.appendix || matched.tableOfContents) importanceScore -= 32;
    if (matched.boilerplate) importanceScore -= 44;
    if (matched.changelog) importanceScore -= 36;
    if (matched.pageTypeClutter) importanceScore -= 54;
    if (startsWithQuestion) importanceScore += 10;
    if ((stats.listItems || 0) >= 3) structureScore += Math.min(34, 12 + stats.listItems * 2);
    if ((stats.codeBlocks || 0) > 0) structureScore += 28;
    if ((stats.tables || 0) > 0) structureScore += 18;
    if ((stats.boldCount || 0) > 0) structureScore += Math.min(18, 5 + stats.boldCount * 2);
    if (stats.hasNumbers) structureScore += 12;
    if (stats.hasReadableParagraphs) structureScore += 10;
    if (isCompact) structureScore += 12;

    const fluffScore = getFluffScore({
      lower,
      headingAndText,
      classTrail: input.classTrail || "",
      index: input.index,
      wordCount,
      linkDensity: stats.linkDensity || 0,
      links: stats.links || 0,
      negativePatternHit,
      fluffPatternHit,
      introPatternHit,
      isDenseLinks,
      isLongSoftIntro,
      isHeaderOnly,
      repeatedTextScore,
      isElementLowValue: Boolean(input.isElementLowValue),
      matched
    });

    if (wordCount > 620 && !matched.procedure && !matched.codeExplanation) usefulScore -= 14;
    if (input.index === 0 && wordCount > 220 && !matched.answer && !matched.useful && !matched.action) usefulScore -= 24;

    const score = Math.round(usefulScore * 0.86 + importanceScore * 0.48 + structureScore * 0.58 - fluffScore);

    return {
      score,
      usefulScore: Math.max(0, usefulScore),
      importanceScore: Math.max(0, importanceScore + structureScore),
      matched,
      startsWithQuestion,
      isCompact,
      fluffScore,
      negativePatternHit,
      fluffPatternHit,
      introPatternHit,
      isDenseLinks,
      sectionKind: sectionKind.kind,
      sectionKindLabel: sectionKind.label,
      selectionReason: getSelectionReason(matched, unitMeta, profile, contentRankType, googleDocsRole),
      pdfSectionType: sectionKind.pdfSectionType,
      ocrRole: pdfOcrRole,
      ocrRoleLabel: pdfOcrRole ? SECTION_KIND_LABELS[pdfOcrRoleKind(pdfOcrRole)] || "" : "",
      googleDocsRole: googleDocsRole && googleDocsRole.role || "",
      googleDocsRoleLabel: googleDocsRole && googleDocsRole.label || "",
      googleDocsRoleConfidence: googleDocsRole && googleDocsRole.confidence || 0,
      isHeaderOnly,
      repeatedTextScore,
      chatRole: unitMeta.role || ""
    };
  }

  function getContentRankingType(profile, text) {
    const type = String(profile && profile.type || "").toLowerCase();
    const label = String(profile && profile.label || "").toLowerCase();
    const haystack = `${label} ${String(text || "").toLowerCase()}`;
    if (type === "chat" || type === "pdf" || type === "search_results" || LOW_CONFIDENCE_PAGE_TYPES.has(type)) return "";
    if (type === "docs" || /\b(docs?|documentation|api reference|developer guide)\b/.test(label)) return "docs";
    if (type === "tutorial" || /\b(tutorial|walkthrough|lesson)\b/.test(label)) return "tutorial";
    if (type === "recipe" || /\b(recipe|ingredients|cook time|prep time|directions)\b/.test(haystack)) return "recipe";
    if (type === "research" || /\b(research|paper|abstract|methods|results|discussion|references)\b/.test(haystack)) return "research";
    if (type === "article" || /\b(article|story|essay|post)\b/.test(label)) return "article";
    return "";
  }

  function getSelectionReason(matched, unitMeta, profile, contentRankType, googleDocsRole) {
    if (!matched) return "";
    if (profile && profile.type === "chat") return getChatSelectionReason(matched, unitMeta, profile);
    if (googleDocsRole && isGoogleDocsSection(unitMeta, profile)) return getGoogleDocsSelectionReason(googleDocsRole);
    return getContentSelectionReason(matched, contentRankType);
  }

  function getChatSelectionReason(matched, unitMeta, profile) {
    if (!matched || !profile || profile.type !== "chat") return "";
    const meta = unitMeta || {};
    if (meta.role === "user" || matched.promptEcho) return "User prompt is down-ranked before assistant answers";
    if (matched.loadingOrFailedAnswer) return "Loading or failed assistant response is down-ranked";
    if (matched.incompleteAssistantAnswer) return "Latest assistant turn is incomplete, so a complete answer is preferred";
    if (matched.shortConfirmation) return "Short assistant confirmation is down-ranked";
    if (matched.citationOnly) return "Citation-only block is down-ranked";
    if (matched.finalCode) return "Final usable code block from the assistant";
    if (matched.completeCode) return "Complete code answer after the latest request";
    if (matched.finalRecommendation) return "Final recommendation from the assistant";
    if (matched.correctedAnswer) return "Updated answer after user correction";
    if (matched.replacesFailedAttempt) return "Newer assistant answer replaces an earlier failed attempt";
    if (matched.stepByStepAnswer) return "Step-by-step assistant answer";
    if (matched.summary) return "Summary or recap from the assistant";
    if (matched.latestCompleteAssistantAnswer || matched.latestAssistantAnswer) return "Newest complete assistant response";
    if (matched.answersLatestUser) return "Answers the latest user request";
    if (matched.completeAssistantAnswer) return "Complete assistant response with enough substance";
    return "";
  }

  function getGoogleDocsSelectionReason(roleInfo) {
    if (!roleInfo) return "";
    return roleInfo.reason || "";
  }

  function classifyGoogleDocsRole(details) {
    const unitMeta = details.unitMeta || {};
    const headingText = String(details.headingText || "").toLowerCase();
    const lower = String(details.lower || "").toLowerCase();
    const text = String(details.headingAndText || `${headingText} ${lower}`).toLowerCase();
    const wordCount = Number(details.wordCount) || 0;
    const headingLevel = Number(unitMeta.headingLevel || details.level || 0);
    const index = Number(details.index) || 0;
    const matched = details.matched || {};
    const shortFragment = wordCount < 28;
    const chromeOrInstruction = /\b(type\s+@|press\s+enter|editing mode|suggesting mode|accept suggestion|reject suggestion|resolve comment|add comment|toolbar|share|request edit access|last edit was|saving\.?|saved to drive)\b/i.test(text);
    let role = "unknown";
    let confidence = 42;
    let reason = "Readable Google Docs document section.";

    if (matched.tableOfContents || /\b(table of contents|contents)\b/i.test(headingText)) {
      role = "heading";
      confidence = 42;
      reason = "Table of contents is document navigation, not the main content.";
    } else if (matched.references || /\b(references|bibliography|works cited|citations)\b/i.test(headingText)) {
      role = "references";
      confidence = 86;
      reason = "References are supporting material and are down-ranked.";
    } else if (matched.appendix || /\b(appendix|appendices|supplemental|supplementary)\b/i.test(headingText)) {
      role = "appendix";
      confidence = 82;
      reason = "Appendix material is secondary to the main document body.";
    } else if (matched.summary || /\b(summary|executive summary|abstract|overview|recap|tl;dr|tldr)\b/i.test(headingText)) {
      role = "summary";
      confidence = 88;
      reason = "Summary section captures the document's key points.";
    } else if (/\b(results?|findings?|outcomes?|what we found)\b/i.test(headingText) && !/\b(expected result|final result|what you should see|result should)\b/i.test(headingText)) {
      role = "results";
      confidence = 90;
      reason = "Results or findings are high-value Google Docs content.";
    } else if (matched.conclusion || /\b(conclusion|final thoughts?|closing|takeaway|so what|what this means)\b/i.test(headingText)) {
      role = "conclusion";
      confidence = 90;
      reason = "Conclusion states the document takeaway.";
    } else if (matched.procedure || matched.directAction || matched.action || /\b(steps?|plan|action items?|next actions?|to do|todo|checklist)\b/i.test(headingText)) {
      role = "steps";
      confidence = 86;
      reason = "Actionable steps are useful Google Docs guidance.";
    } else if ((matched.keyEvidence || /\b(evidence|supporting details?|examples?|proof|data|quote|source analysis|because|shows?|demonstrates?)\b/i.test(text)) && !/\b(introduction|intro|background|context|opening)\b/i.test(headingText)) {
      role = "evidence";
      confidence = 82;
      reason = "Evidence section supports the document's main point.";
    } else if ((matched.mainArgument || /\b(thesis|main claim|central claim|main argument|argument|i argue|we argue|this essay argues|the point is|claim)\b/i.test(text)) && !/\b(introduction|intro|background|context|opening)\b/i.test(headingText)) {
      role = "main_claim";
      confidence = 88;
      reason = "Main argument in the Google Docs document.";
    } else if (/\b(introduction|intro|background|context|opening)\b/i.test(headingText) || (index <= 1 && wordCount >= 45 && !matched.pageTypeClutter)) {
      role = "introduction";
      confidence = 70;
      reason = "Introduction provides opening context for the document.";
    } else if ((headingLevel <= 1 || index === 0) && wordCount < 90 && !/[.!?]\s+\w/.test(lower)) {
      role = "document_title";
      confidence = 64;
      reason = "Document title or title-like heading.";
    } else if (headingLevel <= 2 && shortFragment) {
      role = "heading";
      confidence = 50;
      reason = "Short heading without enough body text.";
    } else if (wordCount >= 55) {
      role = "main_claim";
      confidence = 68;
      reason = "Substantial Google Docs section with enough body text.";
    }

    if (chromeOrInstruction) {
      role = "unknown";
      confidence = Math.min(confidence, 28);
      reason = "Editor instruction or suggestion UI is down-ranked.";
    }

    return {
      role,
      label: GOOGLE_DOCS_ROLE_LABELS[role] || GOOGLE_DOCS_ROLE_LABELS.unknown,
      confidence,
      reason,
      shortFragment,
      chromeOrInstruction
    };
  }

  function getContentSelectionReason(matched, contentRankType) {
    if (!contentRankType) return "";
    if (matched.pageTypeClutter) return "Navigation, promotion, comments, or account UI is down-ranked";
    if (matched.changelog) return "Changelog material is secondary to current usage guidance";
    if (contentRankType === "article") {
      if (matched.mainArgument) return "Main claim section has the strongest article signal";
      if (matched.keyEvidence) return "Key evidence supports the article's main point";
      if (matched.summary) return "Summary section captures the article's useful takeaway";
      if (matched.conclusion) return "Conclusion wraps up the article's useful takeaway";
    }
    if (contentRankType === "docs") {
      if (matched.quickStart) return "Quick start helps readers get working fastest";
      if (matched.usage) return "Usage section explains how to apply the documentation";
      if (matched.installation) return "Installation details are a core documentation target";
      if (matched.parameters) return "Parameter and option details are useful implementation guidance";
      if (matched.troubleshooting) return "Troubleshooting section helps resolve likely issues";
      if (matched.example || matched.codeExplanation) return "Example code makes the documentation actionable";
    }
    if (contentRankType === "tutorial") {
      if (matched.procedure || matched.directAction || matched.action) return "Actionable tutorial steps are the main path through the page";
      if (matched.setup || matched.installation) return "Setup section prepares the tutorial workflow";
      if (matched.prerequisites) return "Prerequisites clarify what is needed before starting";
      if (matched.finalResult) return "Final result shows what the tutorial should produce";
      if (matched.codeExplanation) return "Code section makes the tutorial actionable";
    }
    if (contentRankType === "recipe") {
      if (matched.instructions || matched.procedure) return "Recipe instructions provide the actionable method";
      if (matched.ingredients) return "Ingredients are core recipe content";
      if (matched.timing) return "Timing details help execute the recipe";
      if (matched.tips) return "Useful tips improve the recipe outcome";
    }
    if (contentRankType === "research") {
      if (matched.results) return "Results section contains the main findings";
      if (matched.conclusion) return "Conclusion states the research takeaway";
      if (matched.abstract) return "Abstract summarizes the research page";
      if (matched.methods) return "Methods explain how the research was done";
      if (matched.discussion) return "Discussion interprets the research findings";
    }
    return "";
  }

  function classifySectionKind(details) {
    const matched = details.matched || {};
    const stats = details.stats || {};
    const unitMeta = details.unitMeta || {};
    const profile = details.profile || {};
    const pdfSectionType = unitMeta.pdfSectionType || (profile.type === "pdf" ? inferPdfSectionType(details) : "");
    const pdfOcrRole = profile.type === "pdf" ? normalizePdfOcrRole(unitMeta.ocrRole || details.ocrRole) : "";
    const contentRankType = getContentRankingType(profile, details.headingAndText || details.lower || details.headingText || "");
    const pdfOcrKind = pdfOcrRole && !["abstract", "methods", "results", "discussion", "conclusion", "form", "table"].includes(pdfSectionType)
      ? pdfOcrRoleKind(pdfOcrRole)
      : "";
    const searchKind = searchSectionKind(unitMeta.searchBlockType || "");
    const googleDocsRole = details.googleDocsRole && details.googleDocsRole.role || "";
    const googleDocsKind = googleDocsRoleToSectionKind(googleDocsRole);
    let kind = "";

    if (searchKind) kind = searchKind;
    else if (googleDocsKind && !["unknown", "useful_section"].includes(googleDocsKind)) kind = googleDocsKind;
    else if (matched.boilerplate) kind = "boilerplate";
    else if (matched.promptEcho) kind = "prompt_echo";
    else if (matched.citationOnly) kind = "works_cited";
    else if (contentRankType && matched.changelog) kind = "changelog";
    else if (matched.finalCode) kind = "final_code";
    else if (matched.correctedAnswer) kind = "corrected_answer";
    else if (matched.replacesFailedAttempt) kind = "corrected_answer";
    else if (matched.finalRecommendation) kind = "final_recommendation";
    else if (matched.completeCode) kind = "complete_code";
    else if (contentRankType && matched.quickStart) kind = "quick_start";
    else if (contentRankType === "tutorial" && (matched.procedure || matched.directAction || matched.action)) kind = "steps";
    else if (contentRankType && matched.installation) kind = "installation";
    else if (contentRankType && matched.usage) kind = "usage";
    else if (contentRankType && matched.parameters) kind = "parameters";
    else if (contentRankType && matched.troubleshooting) kind = "troubleshooting";
    else if (contentRankType && matched.prerequisites) kind = "prerequisites";
    else if (contentRankType && matched.setup) kind = "setup";
    else if (contentRankType && matched.finalResult) kind = "final_result";
    else if (contentRankType && matched.instructions) kind = "instructions";
    else if (contentRankType && matched.ingredients) kind = "ingredients";
    else if (contentRankType && matched.timing) kind = "timing";
    else if (contentRankType && matched.tips) kind = "tips";
    else if (contentRankType && matched.abstract) kind = "abstract";
    else if (contentRankType === "research" && matched.results) kind = "results";
    else if (contentRankType === "research" && matched.conclusion) kind = "conclusion";
    else if (contentRankType === "research" && matched.methods) kind = "methods";
    else if (contentRankType && matched.discussion) kind = "discussion";
    else if ((stats.codeBlocks || 0) > 0) kind = "code_block";
    else if (matched.stepByStepAnswer) kind = "step_by_step";
    else if (matched.finalAnswer) kind = "final_answer";
    else if (matched.summary) kind = "summary";
    else if ((matched.latestCompleteAssistantAnswer || matched.latestAssistantAnswer) && !matched.conclusion && !matched.results) kind = "latest_answer";
    else if (matched.keyExplanation) kind = "key_explanation";
    else if (matched.conciseAnswer || matched.answer || matched.acceptedAnswer) kind = "answer";
    else if (matched.conclusion || matched.finality) kind = "conclusion";
    else if (matched.procedure || matched.directAction || matched.action) kind = "steps";
    else if (matched.definition) kind = "definition";
    else if (matched.mainArgument) kind = "main_argument";
    else if (matched.keyEvidence) kind = "key_evidence";
    else if (matched.methods) kind = "methods";
    else if (matched.results) kind = "results";
    else if (matched.recommendation) kind = "recommendation";
    else if (matched.warning) kind = "warning";
    else if (matched.comparison) kind = "comparison";
    else if (matched.example) kind = "example";

    if (pdfOcrKind) {
      kind = pdfOcrKind;
    } else if (pdfSectionType && ["abstract", "results", "discussion", "conclusion", "methods", "form", "table", "signature"].includes(pdfSectionType)) {
      kind = pdfSectionType;
    } else if (pdfSectionType && ["works_cited", "appendix", "title_page", "toc", "introduction", "boilerplate"].includes(pdfSectionType)) {
      kind = pdfSectionType;
    }

    if (!kind && details.isHeaderOnly) kind = "toc";
    if (!kind) kind = "useful_section";

    return {
      kind,
      label: SECTION_KIND_LABELS[kind] || SECTION_KIND_LABELS.useful_section,
      pdfSectionType
    };
  }

  function searchSectionKind(type) {
    const map = {
      ai_overview: "search_ai_overview",
      answer: "search_answer",
      sources: "search_sources",
      people_also_ask: "search_people_also_ask",
      top_results: "search_top_results",
      videos: "search_videos",
      shopping: "search_shopping",
      maps: "search_maps",
      related_searches: "search_related_searches"
    };
    return map[type] || "";
  }

  function searchPriorityForType(type) {
    const priorities = {
      ai_overview: 0,
      answer: 1,
      sources: 2,
      top_results: 3,
      people_also_ask: 4,
      videos: 5,
      maps: 6,
      related_searches: 7,
      shopping: 8
    };
    return Number.isFinite(priorities[type]) ? priorities[type] : 99;
  }

  function inferPdfSectionType(details) {
    const text = `${details.headingText || ""} ${details.lower || ""}`;
    const pageNumber = Number(details.unitMeta && details.unitMeta.pageNumber) || 0;
    const wordCount = Number(details.wordCount) || 0;
    if (PDF_SECTION_PATTERNS.toc.test(text) || looksLikeTableOfContents(text)) return "toc";
    if (/\b(copyright|all rights reserved|page \d+\s+of\s+\d+|privacy policy|terms of service|downloaded from)\b/i.test(text)) return "boilerplate";
    if (PDF_SECTION_PATTERNS.works_cited.test(text)) return "works_cited";
    if (PDF_SECTION_PATTERNS.appendix.test(text)) return "appendix";
    if (/\b(signature|signed|sincerely|respectfully submitted|authorized representative)\b/i.test(text)) return "signature";
    if (/\b(form|notice|application|claim number|case number|account number|date of birth|address|phone|email)\b/i.test(text)) return "form";
    if (/\b(table|figure|chart|column|row|total|subtotal)\b/i.test(text)) return "table";
    if (PDF_SECTION_PATTERNS.abstract.test(text)) return "abstract";
    if (PDF_SECTION_PATTERNS.results.test(text)) return "results";
    if (PDF_SECTION_PATTERNS.discussion.test(text)) return "discussion";
    if (PDF_SECTION_PATTERNS.conclusion.test(text)) return "conclusion";
    if (PDF_SECTION_PATTERNS.methods.test(text)) return "methods";
    if (PDF_SECTION_PATTERNS.introduction.test(text)) return "introduction";
    if ((pageNumber <= 1 || details.index === 0) && wordCount < 150 && !/[.!?]\s+\w/.test(details.lower || "")) return "title_page";
    return "";
  }

  function looksLikeTableOfContents(text) {
    const value = String(text || "");
    const dottedLines = (value.match(/\.{2,}\s*\d{1,4}\b/g) || []).length;
    const sectionLines = (value.match(/\b(chapter|section|figure|table)\s+\d+(?:\.\d+)?/gi) || []).length;
    return dottedLines >= 3 || sectionLines >= 5;
  }

  function getRepeatedTextScore(text) {
    const parts = String(text || "")
      .split(/(?:[.!?]\s+|\n+)/)
      .map((part) => cleanText(part).toLowerCase())
      .filter((part) => part.length >= 18 && part.length <= 180);
    if (parts.length < 4) return 0;
    const seen = new Map();
    let repeats = 0;
    parts.forEach((part) => {
      const key = part.slice(0, 90);
      const count = seen.get(key) || 0;
      if (count > 0) repeats += 1;
      seen.set(key, count + 1);
    });
    return repeats;
  }

  function getFluffScore(metrics) {
    let fluffScore = 0;
    if (metrics.negativePatternHit) fluffScore += 58;
    if (metrics.fluffPatternHit) fluffScore += 26;
    if (metrics.introPatternHit && metrics.index <= 1 && !metrics.matched.conciseAnswer) fluffScore += 26;
    if (metrics.isDenseLinks) fluffScore += metrics.linkDensity > 0.55 ? 76 : 50;
    if (metrics.links > 18 && metrics.wordCount < 260) fluffScore += 30;
    if (metrics.isLongSoftIntro) fluffScore += 38;
    if (metrics.isHeaderOnly && !metrics.matched.finalCode) fluffScore += 34;
    if (metrics.repeatedTextScore >= 3) fluffScore += 38;
    if (metrics.matched.promptEcho) fluffScore += 74;
    if (metrics.matched.citationOnly) fluffScore += 78;
    if (metrics.matched.references) fluffScore += 86;
    if (metrics.matched.tableOfContents) fluffScore += 70;
    if (metrics.matched.appendix) fluffScore += 48;
    if (metrics.matched.boilerplate) fluffScore += 92;
    if (metrics.matched.changelog) fluffScore += 46;
    if (metrics.matched.pageTypeClutter) fluffScore += 76;
    if (metrics.isElementLowValue) fluffScore += 66;
    if (/\b(nav|menu|breadcrumb|toc|footer|sidebar|share|social|related|comment|promo|newsletter|subscribe|advert|sponsor|affiliate|cookie|consent|byline|author)\b/i.test(metrics.classTrail)) {
      fluffScore += 40;
    }
    if (/\b(disclosure|this post may contain affiliate|as an amazon associate|reader-supported|commission)\b/i.test(metrics.headingAndText)) {
      fluffScore += 76;
    }
    if (/^\s*(home|about|contact|privacy|terms|login|sign up|subscribe)\b/i.test(metrics.lower) && metrics.wordCount < 80) {
      fluffScore += 44;
    }
    return fluffScore;
  }

  function applyAdapterScores(sections, adapter, profile) {
    sections.forEach((section) => {
      const adapterScore = safeCall(() => adapter.scoreAdjustments(section, profile), 0);
      section.metrics.adapterScore = adapterScore;
      section.score += adapterScore;
      section.usefulScore += Math.max(0, adapterScore * 0.5);
    });
  }

  function buildThemeIntentContext(sections, pageProfile, source) {
    const title = source && source.title || "";
    const url = source && source.url || "";
    return {
      themeTerms: extractThemeTerms(sections, title, url),
      intent: inferIntent(pageProfile, sections)
    };
  }

  function extractThemeTerms(sections, title, url) {
    const terms = new Map();
    const addTerm = (value, source, weight) => {
      const normalized = normalizeThemeTerm(value);
      if (!normalized) return;
      const current = terms.get(normalized);
      if (current) {
        current.weight = Math.max(current.weight, weight);
        if (!current.sources.includes(source)) current.sources.push(source);
      } else {
        terms.set(normalized, { term: normalized, source, sources: [source], weight });
      }
    };
    const addTokenTerms = (text, source, weight) => {
      getThemeTokens(text).forEach((token) => addTerm(token, source, weight));
      getThemePhrases(text, 2).slice(0, 12).forEach((phrase) => addTerm(phrase, source, weight + 1));
    };

    addTokenTerms(title, "title", 4);
    getUrlThemeTerms(url).forEach((term) => addTerm(term, "url", 2));

    const phraseCounts = new Map();
    const technicalCandidates = [];
    (sections || []).forEach((section) => {
      addTokenTerms(section && section.title || "", "heading", 3);
      getThemePhrases(`${section && section.title || ""} ${String(section && section.text || "").slice(0, 900)}`, 2)
        .concat(getThemePhrases(`${section && section.title || ""} ${String(section && section.text || "").slice(0, 900)}`, 3))
        .forEach((phrase) => phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1));
      technicalCandidates.push(...getTechnicalThemeTerms(`${section && section.title || ""} ${String(section && section.text || "").slice(0, 700)}`));
    });

    Array.from(phraseCounts.entries())
      .filter((entry) => entry[1] >= 2)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, 10)
      .forEach(([phrase, count]) => addTerm(phrase, "repeated_phrase", Math.min(5, 2 + count)));

    uniqueStrings(technicalCandidates)
      .slice(0, 12)
      .forEach((term) => addTerm(term, "technical", 3));

    const latestUserSections = (sections || [])
      .filter((section) => section && section.unitMeta && section.unitMeta.role === "user")
      .sort((a, b) => (Number(b.unitMeta.turnIndex) || b.index || 0) - (Number(a.unitMeta.turnIndex) || a.index || 0))
      .slice(0, 2);
    latestUserSections.forEach((section) => addTokenTerms(section.text || section.title || "", "latest_question", 4));

    return Array.from(terms.values())
      .sort((a, b) => b.weight - a.weight || b.term.length - a.term.length)
      .slice(0, 18);
  }

  function normalizeThemeTerm(value) {
    const normalized = String(value || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9./+#\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    const parts = normalized.split(" ").filter((part) => part && !THEME_INTENT_STOPWORDS.has(part));
    if (!parts.length) return "";
    if (parts.length === 1) {
      const term = parts[0];
      if (term.length < 3 || THEME_INTENT_STOPWORDS.has(term)) return "";
      return term;
    }
    const phrase = parts.join(" ");
    return phrase.length >= 7 ? phrase : "";
  }

  function getThemeTokens(text) {
    const matches = String(text || "").match(/[A-Za-z][A-Za-z0-9_./+#-]{2,}/g) || [];
    return uniqueStrings(matches.map((token) => normalizeThemeTerm(token))).filter(Boolean).slice(0, 24);
  }

  function getThemePhrases(text, size) {
    const tokens = getThemeTokens(text).filter((token) => !token.includes(" "));
    const phrases = [];
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phraseTokens = tokens.slice(index, index + size);
      if (phraseTokens.some((token) => THEME_INTENT_STOPWORDS.has(token))) continue;
      phrases.push(phraseTokens.join(" "));
    }
    return uniqueStrings(phrases).slice(0, 40);
  }

  function getTechnicalThemeTerms(text) {
    const raw = String(text || "");
    const matches = raw.match(/\b(?:[A-Z]{2,}(?:-[A-Z0-9]{2,})*|[A-Za-z]+[A-Z][A-Za-z0-9]*|[A-Za-z]+[-_][A-Za-z0-9_-]+|[A-Za-z]+[0-9][A-Za-z0-9./-]*|[A-Za-z]+\.[A-Za-z0-9.]+)\b/g) || [];
    return matches.map((match) => normalizeThemeTerm(match)).filter(Boolean);
  }

  function getUrlThemeTerms(url) {
    const text = String(url || "")
      .replace(/^https?:\/\//i, " ")
      .replace(/[?#].*$/, " ")
      .replace(/\.[a-z]{2,}(?:\/|$)/gi, " ")
      .replace(/[\/_-]+/g, " ");
    return getThemeTokens(text).concat(getThemePhrases(text, 2)).slice(0, 16);
  }

  function inferIntent(pageProfile, sections) {
    const type = String(pageProfile && pageProfile.type || "").toLowerCase();
    if (type === "search_results") {
      const blockTypes = (sections || []).map((section) => section && section.unitMeta && section.unitMeta.searchBlockType || "");
      const preferredSearchBlocks = blockTypes.includes("ai_overview")
        ? ["ai_overview"]
        : blockTypes.includes("answer")
          ? ["answer"]
          : ["top_results"];
      return {
        intent: "ai_overview_or_best_result",
        preferredKinds: preferredSearchBlocks.map((blockType) => searchSectionKind(blockType)).filter(Boolean),
        preferredSignals: [],
        preferredSearchBlocks,
        reason: "Matches the search intent: AI Overview, direct answer, or best result.",
        sectionCount: (sections || []).length
      };
    }
    const byType = {
      chat: {
        intent: "latest_useful_answer",
        preferredKinds: ["latest_answer", "corrected_answer", "complete_code", "final_code", "step_by_step", "final_recommendation", "summary", "final_answer"],
        preferredSignals: ["latestCompleteAssistantAnswer", "correctedAnswer", "replacesFailedAttempt", "finalRecommendation", "completeCode", "finalCode", "stepByStepAnswer", "summary", "answersLatestUser"],
        reason: "Matches the chat intent: latest useful answer."
      },
      docs: {
        intent: "quick_start_or_usage",
        preferredKinds: ["quick_start", "usage", "installation", "parameters", "troubleshooting", "code_block"],
        preferredSignals: ["quickStart", "usage", "installation", "parameters", "troubleshooting", "codeExplanation"],
        reason: "Matches the documentation intent: quick start or usage guidance."
      },
      tutorial: {
        intent: "first_actionable_step",
        preferredKinds: ["setup", "steps", "installation", "prerequisites", "code_block", "final_result"],
        preferredSignals: ["setup", "procedure", "directAction", "action", "installation", "prerequisites", "codeExplanation", "finalResult"],
        reason: "Matches the tutorial intent: first actionable step."
      },
      article: {
        intent: "main_claim_or_summary",
        preferredKinds: ["main_argument", "summary", "conclusion", "key_evidence"],
        preferredSignals: ["mainArgument", "summary", "conclusion", "keyEvidence"],
        reason: "Matches the article intent: main claim or summary."
      },
      research: {
        intent: "abstract_results_or_conclusion",
        preferredKinds: ["abstract", "results", "conclusion", "discussion", "methods"],
        preferredSignals: ["abstract", "results", "conclusion", "discussion", "methods"],
        reason: "Matches the research intent: abstract, results, or conclusion."
      },
      pdf: {
        intent: "abstract_results_or_conclusion",
        preferredKinds: ["abstract", "results", "conclusion", "discussion", "methods", "ocr_letter_body"],
        preferredSignals: ["abstract", "results", "conclusion", "discussion", "methods"],
        preferredOcrRoles: ["body"],
        reason: "Matches the PDF intent: abstract, results, conclusion, or useful body text."
      },
      recipe: {
        intent: "ingredients_or_instructions",
        preferredKinds: ["ingredients", "instructions", "timing", "tips", "steps"],
        preferredSignals: ["ingredients", "instructions", "timing", "tips", "procedure"],
        reason: "Matches the recipe intent: ingredients or instructions."
      },
    };
    const intent = byType[type] || {
      intent: "useful_section",
      preferredKinds: [],
      preferredSignals: [],
      reason: "Matches the local page intent."
    };
    return {
      ...intent,
      sectionCount: (sections || []).length
    };
  }

  function applyThemeIntentBoosts(sections, pageProfile, context) {
    if (!sections || !sections.length || !context) return sections || [];
    const themeTerms = Array.isArray(context.themeTerms) ? context.themeTerms : [];
    const intent = context.intent || inferIntent(pageProfile, sections);
    if (pageProfile && pageProfile.quietMode) {
      sections.forEach((section) => {
        if (section && section.metrics) section.metrics.themeIntent = buildEmptyThemeIntent(intent, themeTerms);
      });
      return sections;
    }

    sections.forEach((section) => {
      if (!section || !section.metrics) return;
      const empty = buildEmptyThemeIntent(intent, themeTerms);
      if (shouldSkipThemeIntentBoost(section, pageProfile)) {
        section.metrics.themeIntent = empty;
        return;
      }

      const matchedTerms = getMatchedThemeTerms(section, themeTerms);
      const intentMatch = getIntentMatch(section, pageProfile, intent);
      if (!matchedTerms.length && !intentMatch) {
        section.metrics.themeIntent = empty;
        return;
      }

      const baseEvidence = section.score >= 30
        || section.usefulScore >= 24
        || section.importanceScore >= 20
        || getSignalCount(section.metrics) > 0
        || Boolean(section.unitMeta && section.unitMeta.searchBlockType);
      const themeBoost = matchedTerms.length
        ? Math.min(8, matchedTerms.reduce((sum, item) => sum + Math.max(1, Number(item.weight) || 1), 0) * 0.7)
        : 0;
      const intentBoost = intentMatch ? Math.min(10, intentMatch.weight) : 0;
      let boost = Math.min(18, Math.round(themeBoost + intentBoost));
      if (!baseEvidence) boost = Math.min(boost, 4);
      if (boost <= 0) {
        section.metrics.themeIntent = empty;
        return;
      }

      const reasons = [];
      if (intentMatch) reasons.push(intentMatch.reason || intent.reason);
      if (matchedTerms.length) {
        reasons.push(`Matches local theme terms: ${matchedTerms.slice(0, 3).map((term) => term.term).join(", ")}.`);
      }

      section.score += boost;
      section.usefulScore += Math.min(10, Math.ceil(boost * 0.56));
      section.importanceScore += Math.min(8, Math.ceil(boost * 0.44));
      section.metrics.themeIntent = {
        intent: intent.intent,
        themeTerms: themeTerms.map((term) => term.term).slice(0, 12),
        matchedTerms: matchedTerms.map((term) => term.term).slice(0, 8),
        intentMatch: Boolean(intentMatch),
        boost,
        usefulBoost: Math.min(10, Math.ceil(boost * 0.56)),
        importanceBoost: Math.min(8, Math.ceil(boost * 0.44)),
        reasons: uniqueStrings(reasons)
      };
    });

    return sections;
  }

  function buildEmptyThemeIntent(intent, themeTerms) {
    return {
      intent: intent && intent.intent || "",
      themeTerms: (themeTerms || []).map((term) => term.term).slice(0, 12),
      matchedTerms: [],
      intentMatch: false,
      boost: 0,
      reasons: []
    };
  }

  function shouldSkipThemeIntentBoost(section, pageProfile) {
    const metrics = section && section.metrics || {};
    const matched = metrics.matched || {};
    const unitMeta = section && section.unitMeta || {};
    const searchBlockType = String(unitMeta.searchBlockType || "").toLowerCase();
    const negativeKeys = [
      "boilerplate", "references", "citationOnly", "tableOfContents", "appendix", "supersededDraft",
      "shortConfirmation", "loadingOrFailedAnswer", "incompleteAssistantAnswer", "promptEcho",
      "headerOnly", "pageTypeClutter", "changelog"
    ];
    if (negativeKeys.some((key) => matched[key])) return true;
    if (matched.repeatedNoise
      && !["ai_overview", "answer"].includes(searchBlockType)
      && (normalizePdfOcrRole(metrics.ocrRole || unitMeta.ocrRole || "") === "footer" || section.score < 20)) {
      return true;
    }
    if (metrics.fluffScore >= 82 || metrics.negativePatternHit) return true;
    if (metrics.isDenseLinks && section.wordCount < 140) return true;
    if (isLowValueSectionKind(section)) return true;
    const ocrRole = normalizePdfOcrRole(metrics.ocrRole || unitMeta.ocrRole || "");
    if (["letterhead", "recipient", "date_reference", "greeting", "closing", "signature", "footer"].includes(ocrRole)) return true;
    if (searchBlockType === "shopping" || searchBlockType === "ads" || searchBlockType === "sponsored") return true;
    const sourceType = getSectionSourceType(section, unitMeta, metrics);
    if (sourceType === "chat" && unitMeta.role === "user") return true;
    if (pageProfile && pageProfile.type === "shopping_product") return true;
    return false;
  }

  function getMatchedThemeTerms(section, themeTerms) {
    if (!themeTerms || !themeTerms.length) return [];
    const haystack = ` ${normalizeThemeTerm(`${section.title || ""} ${section.text || ""}`)} `;
    return themeTerms.filter((item) => {
      const term = item && item.term || "";
      if (!term || term.length < 3) return false;
      return term.includes(" ")
        ? haystack.includes(` ${term} `)
        : new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(haystack);
    }).slice(0, 8);
  }

  function getIntentMatch(section, pageProfile, intent) {
    if (!intent || !intent.intent) return null;
    const metrics = section && section.metrics || {};
    const matched = metrics.matched || {};
    const unitMeta = section && section.unitMeta || {};
    const role = getSectionIntelligenceRole(section, pageProfile);
    const kind = metrics.sectionKind || "";
    const sectionKindMatches = (intent.preferredKinds || []).includes(kind) || (intent.preferredKinds || []).includes(role);
    const signalMatches = (intent.preferredSignals || []).some((signal) => matched[signal]);
    const searchMatches = (intent.preferredSearchBlocks || []).includes(unitMeta.searchBlockType || "");
    const ocrMatches = (intent.preferredOcrRoles || []).includes(normalizePdfOcrRole(metrics.ocrRole || unitMeta.ocrRole || ""));
    if (!sectionKindMatches && !signalMatches && !searchMatches && !ocrMatches) return null;
    const weight = searchMatches ? 10 : sectionKindMatches ? 9 : signalMatches ? 8 : 7;
    return {
      weight,
      reason: intent.reason || "Matches the local page intent."
    };
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function rankSections(sections, profile) {
    const minimumWords = profile.type === "chat" || profile.type === "pdf" || profile.type === "low_structure" ? 8 : 18;
    const maxSections = profile.type === "chat" || profile.type === "pdf" ? 260 : MAX_SECTIONS;
    const filtered = sections
      .filter((section) => section.wordCount >= minimumWords)
      .sort((a, b) => a.top - b.top)
      .slice(0, maxSections);
    const weakPage = Boolean(profile.quietMode) || LOW_CONFIDENCE_PAGE_TYPES.has(profile.type);
    const bestThreshold = profile.type === "search_results" ? 66 : weakPage ? 92 : profile.type === "chat" ? 58 : 42;
    const ranked = filtered
      .filter((section) => section.metrics.fluffScore < 82 || section.score >= 96 || section.metrics.matched.finalCode)
      .sort((a, b) => b.score - a.score);
    const topSection = ranked.find((section) => {
      const usefulEnough = section.usefulScore >= (profile.type === "chat" ? 34 : 26) || section.metrics.matched.finalCode;
      return section.score >= bestThreshold && usefulEnough && !isLowValueSectionKind(section);
    }) || null;
    const importantLimit = Math.min(9, Math.max(3, Math.ceil(filtered.length * 0.28)));
    const cutoffIndex = Math.min(importantLimit - 1, ranked.length - 1);
    const cutoffFloor = profile.type === "search_results" ? 46 : weakPage ? 78 : 34;
    const cutoff = Math.max(cutoffFloor, ranked[cutoffIndex] ? ranked[cutoffIndex].score : cutoffFloor);

    filtered.forEach((section) => {
      section.isBest = section === topSection;
      const usefulEnough = section.usefulScore >= 20
        || section.metrics.matched.conciseAnswer
        || section.metrics.matched.summary
        || section.metrics.matched.directAction
        || section.metrics.matched.completeCode
        || section.metrics.matched.completeAssistantAnswer
        || section.metrics.matched.latestCompleteAssistantAnswer
        || section.metrics.matched.correctedAnswer
        || section.metrics.matched.replacesFailedAttempt
        || section.metrics.matched.definition
        || section.metrics.matched.methods
        || section.metrics.matched.conclusion
        || section.metrics.matched.results
        || section.metrics.matched.mainArgument
        || section.metrics.matched.keyEvidence
        || section.metrics.matched.quickStart
        || section.metrics.matched.installation
        || section.metrics.matched.usage
        || section.metrics.matched.parameters
        || section.metrics.matched.troubleshooting
        || section.metrics.matched.prerequisites
        || section.metrics.matched.setup
        || section.metrics.matched.finalResult
        || section.metrics.matched.ingredients
        || section.metrics.matched.instructions
        || section.metrics.matched.timing
        || section.metrics.matched.tips
        || section.metrics.matched.abstract
        || section.metrics.matched.discussion
        || section.metrics.matched.finalCode
        || profile.type === "search_results"
        || (section.metrics.codeBlocks > 0 && profile.type !== "search_results");
      const isImportant = section.score >= cutoff || section.isBest || (section.score >= 42 && section.metrics.codeBlocks > 0);
      const enoughSubstance = section.wordCount >= 28
        || (section.isBest && section.wordCount >= 16)
        || (section.metrics.matched.conciseAnswer && section.wordCount >= 14)
        || (section.metrics.codeBlocks > 0 && section.wordCount >= 10);
      section.isImportant = Boolean(isImportant && enoughSubstance && usefulEnough && !isLowValueSectionKind(section) && (section.metrics.fluffScore < 82 || section.isBest));
      section.label = getSectionLabel(section);
    });

    return filtered;
  }

  function getSectionLabel(section) {
    if (!section.isImportant && !section.isBest) return "";
    const parts = [];
    const detectedLabel = labelForSectionBySignals(section) || section.metrics.sectionKindLabel || "";
    const kindLabel = detectedLabel && detectedLabel !== "Useful section" && detectedLabel !== "Boilerplate" ? detectedLabel : "";
    if (section.isBest) parts.push("Best");
    if (kindLabel && !parts.includes(kindLabel)) parts.push(kindLabel);
    if (section.source === "pdf" && section.pageNumber) parts.push(`Page ${section.pageNumber}`);
    return parts.join(" \u00b7 ") || (section.source === "pdf" && section.pageNumber ? `Page ${section.pageNumber}` : "Useful");
  }

  function labelForSectionBySignals(section) {
    if (!section || !section.metrics) return "";
    if (section.metrics.googleDocsRoleLabel && section.metrics.googleDocsRoleLabel !== "Useful section") {
      return section.metrics.googleDocsRoleLabel;
    }
    if (section.unitMeta && section.unitMeta.searchBlockType) {
      return SECTION_KIND_LABELS[searchSectionKind(section.unitMeta.searchBlockType)] || "";
    }
    if (section.metrics.sectionKind && [
      "quick_start",
      "installation",
      "usage",
      "parameters",
      "troubleshooting",
      "prerequisites",
      "setup",
      "final_result",
      "ingredients",
      "instructions",
      "timing",
      "tips",
      "abstract",
      "discussion"
    ].includes(section.metrics.sectionKind)) {
      return SECTION_KIND_LABELS[section.metrics.sectionKind] || "";
    }
    if (section.metrics.matched.finalCode) return "Final code";
    if (section.metrics.matched.correctedAnswer || section.metrics.matched.replacesFailedAttempt) return "Corrected answer";
    if (section.metrics.matched.finalRecommendation) return "Final recommendation";
    if (section.metrics.matched.completeCode) return "Complete code";
    if (section.metrics.matched.stepByStepAnswer) return "Step-by-step answer";
    if (section.metrics.matched.finalAnswer) return "Final answer";
    if (section.metrics.matched.summary) return "Summary";
    if (section.metrics.matched.latestCompleteAssistantAnswer || section.metrics.matched.latestAssistantAnswer) return "Latest answer";
    if (section.metrics.matched.keyExplanation) return "Key explanation";
    if (section.metrics.matched.conciseAnswer || section.metrics.matched.acceptedAnswer) return "Answer";
    if (section.metrics.matched.conclusion || section.metrics.matched.finality) return "Conclusion";
    if (section.metrics.matched.procedure || section.metrics.matched.action || section.metrics.matched.directAction) return "Steps";
    if (section.metrics.matched.definition) return "Definition";
    if (section.metrics.matched.methods) return "Methods";
    if (section.metrics.matched.mainArgument) return "Main argument";
    if (section.metrics.matched.keyEvidence) return "Key evidence";
    if (section.metrics.matched.results) return "Results";
    if (section.metrics.matched.codeExplanation || section.metrics.codeBlocks > 0) return "Code block";
    if (section.metrics.matched.recommendation) return "Recommendation";
    if (section.metrics.matched.warning) return "Caveat";
    return "";
  }

  function attachSectionIntelligence(sections, pageProfile, recommendation) {
    (sections || []).forEach((section) => {
      if (!section) return;
      section.intelligence = buildSectionIntelligence(section, pageProfile, recommendation);
    });
    return sections;
  }

  function buildSectionIntelligence(section, pageProfile, recommendation) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    const role = getSectionIntelligenceRole(section, pageProfile);
    const roleLabel = getSectionIntelligenceRoleLabel(section, role);
    return {
      role,
      roleLabel,
      pageType: pageProfile && pageProfile.type || "",
      roleConfidence: getSectionRoleConfidence(section),
      whyReasons: getSectionWhyReasons(section, role, recommendation),
      scoreDetails: getSectionScoreDetails(section, role),
      themeIntent: metrics.themeIntent || null,
      sourceType: getSectionSourceType(section, unitMeta, metrics)
    };
  }

  function getSectionIntelligenceRole(section, pageProfile) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    const ocrRole = normalizePdfOcrRole(metrics.ocrRole || unitMeta.ocrRole || "");
    if (ocrRole) return pdfOcrRoleKind(ocrRole);
    if (metrics.googleDocsRole) return String(metrics.googleDocsRole);
    if (unitMeta.searchBlockType) return searchSectionKind(unitMeta.searchBlockType) || "search_result";
    if (metrics.pdfSectionType || unitMeta.pdfSectionType) return String(metrics.pdfSectionType || unitMeta.pdfSectionType);
    if (metrics.sectionKind) return String(metrics.sectionKind);
    if (pageProfile && pageProfile.type === "chat" && unitMeta.role === "assistant") return "latest_answer";
    if (unitMeta.kind) return String(unitMeta.kind);
    return "useful_section";
  }

  function getSectionIntelligenceRoleLabel(section, role) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    const ocrRole = normalizePdfOcrRole(metrics.ocrRole || unitMeta.ocrRole || "");
    if (ocrRole) return metrics.ocrRoleLabel || unitMeta.ocrRoleLabel || SECTION_KIND_LABELS[pdfOcrRoleKind(ocrRole)] || SECTION_KIND_LABELS.useful_section;
    if (metrics.googleDocsRoleLabel) return metrics.googleDocsRoleLabel;
    if (metrics.sectionKindLabel && metrics.sectionKindLabel !== "Useful section") return metrics.sectionKindLabel;
    const signalLabel = labelForSectionBySignals(section);
    if (signalLabel) return signalLabel;
    if (role && SECTION_KIND_LABELS[role]) return SECTION_KIND_LABELS[role];
    return metrics.sectionKindLabel || SECTION_KIND_LABELS.useful_section;
  }

  function getSectionRoleConfidence(section) {
    const score = Number(section && section.score) || 0;
    const usefulScore = Number(section && section.usefulScore) || 0;
    const importanceScore = Number(section && section.importanceScore) || 0;
    let confidence = Math.round(Math.max(0, Math.min(100, (score + 24) * 0.55 + usefulScore * 0.18 + importanceScore * 0.08)));
    if (section && section.isBest) confidence += 6;
    else if (section && section.isImportant) confidence += 3;
    return Math.max(0, Math.min(100, confidence));
  }

  function getSectionWhyReasons(section, role, recommendation) {
    const metrics = section && section.metrics || {};
    const unitMeta = section && section.unitMeta || {};
    const reasons = [];
    if (recommendation && recommendation.bestSectionId === section.id && recommendation.targetConfidenceReason) {
      reasons.push(recommendation.targetConfidenceReason);
    }
    if (isGoogleDocsSection(unitMeta, { adapterName: unitMeta.kind === "google-docs" ? "google-docs" : "" }) && metrics.selectionReason) {
      reasons.push(metrics.selectionReason);
    }
    if (unitMeta.diagnosticReason) reasons.push(unitMeta.diagnosticReason);
    if (!isGoogleDocsSection(unitMeta, { adapterName: unitMeta.kind === "google-docs" ? "google-docs" : "" }) && metrics.selectionReason) {
      reasons.push(metrics.selectionReason);
    }
    if (metrics.themeIntent && Array.isArray(metrics.themeIntent.reasons)) {
      metrics.themeIntent.reasons.slice(0, 2).forEach((reason) => reasons.push(reason));
    }
    if (INTELLIGENCE_ROLE_REASONS[role]) reasons.push(INTELLIGENCE_ROLE_REASONS[role]);
    getSectionSignalReasons(section).forEach((reason) => reasons.push(reason));
    if (!reasons.length && metrics.sectionKindLabel) reasons.push(`${metrics.sectionKindLabel} signal with enough confidence`);
    if (!reasons.length) reasons.push("Looks like a useful section");
    return uniqueStrings(reasons).slice(0, 5);
  }

  function getSectionSignalReasons(section) {
    const metrics = section && section.metrics || {};
    const matched = metrics.matched || {};
    const reasons = [];
    INTELLIGENCE_POSITIVE_SIGNALS.forEach((signal) => {
      if (matched[signal.key]) reasons.push(signal.explanation);
    });
    if (metrics.codeBlocks > 0) reasons.push("Includes a practical example.");
    if (metrics.tables > 0) reasons.push("Table-like section with structured details.");
    if (metrics.listItems >= 3) reasons.push("Structured for quick scanning.");
    if (metrics.hasNumbers) reasons.push("Contains concrete details.");
    return reasons;
  }

  function getSectionScoreDetails(section, role) {
    const metrics = section && section.metrics || {};
    const matched = metrics.matched || {};
    const unitMeta = section && section.unitMeta || {};
    const positive = [];
    const negative = [];
    const addPositive = (signal, weight, explanation) => {
      positive.push({ signal, weight, explanation });
    };
    const addNegative = (signal, weight, explanation) => {
      negative.push({ signal, weight, explanation });
    };

    INTELLIGENCE_POSITIVE_SIGNALS.forEach((signal) => {
      if (matched[signal.key]) addPositive(signal.key, signal.weight, signal.explanation);
    });
    INTELLIGENCE_NEGATIVE_SIGNALS.forEach((signal) => {
      if (matched[signal.key]) addNegative(signal.key, signal.weight, signal.explanation);
    });

    const ocrRole = normalizePdfOcrRole(metrics.ocrRole || unitMeta.ocrRole || "");
    if (ocrRole === "body") addPositive("ocrRole.body", 136, "OCR role identifies this as scanned letter body text.");
    if (ocrRole === "letterhead") addNegative("ocrRole.letterhead", -136, "Letterhead is usually less useful than the body.");
    if (ocrRole === "recipient") addNegative("ocrRole.recipient", -82, "Recipient address block is usually not the main content.");
    if (ocrRole === "date_reference") addNegative("ocrRole.date_reference", -32, "Reference or date block is usually supporting context.");
    if (ocrRole === "signature") addNegative("ocrRole.signature", -144, "Signature blocks are usually less useful than the body.");
    if (ocrRole === "footer") addNegative("ocrRole.footer", -122, "Footer or repeated page noise.");

    const pdfSectionType = metrics.pdfSectionType || unitMeta.pdfSectionType || "";
    if (pdfSectionType === "form") addPositive("pdfSectionType.form", 70, "Form or notice with structured identifiers.");
    if (pdfSectionType === "table") addPositive("pdfSectionType.table", 50, "Table-like PDF section.");
    if (pdfSectionType === "signature") addPositive("pdfSectionType.signature", 24, "Signature area was identified.");

    if (metrics.googleDocsRole) {
      const label = metrics.googleDocsRoleLabel || GOOGLE_DOCS_ROLE_LABELS[metrics.googleDocsRole] || "Google Docs section";
      const confidence = Number(metrics.googleDocsRoleConfidence) || 0;
      if (["summary", "main_claim", "steps", "evidence", "results", "conclusion"].includes(metrics.googleDocsRole)) {
        addPositive(`googleDocsRole.${metrics.googleDocsRole}`, confidence || 70, `${label} role from Google Docs document structure.`);
      }
      if (["document_title", "heading", "references", "appendix", "unknown"].includes(metrics.googleDocsRole)) {
        addNegative(`googleDocsRole.${metrics.googleDocsRole}`, -Math.max(20, confidence || 30), `${label} is secondary to substantive document content.`);
      }
    }

    const searchBlockType = unitMeta.searchBlockType || "";
    if (searchBlockType === "ai_overview") addPositive("searchBlock.ai_overview", 92, "AI Overview is the highest-value search block.");
    if (searchBlockType === "answer") addPositive("searchBlock.answer", 80, "Search answer block gives a direct answer.");
    if (searchBlockType === "top_results") addPositive("searchBlock.top_results", 50, "Top organic results are useful search targets.");
    if (searchBlockType === "people_also_ask" || searchBlockType === "sources") addPositive(`searchBlock.${searchBlockType}`, 42, "Search supporting block is useful context.");
    if (searchBlockType === "videos") addPositive("searchBlock.videos", 28, "Video results may be useful for this query.");
    if (searchBlockType === "maps") addPositive("searchBlock.maps", 28, "Map or local results are useful for location-oriented queries.");
    if (searchBlockType === "related_searches") addPositive("searchBlock.related_searches", 20, "Related searches help refine the query.");
    if (searchBlockType === "shopping") addPositive("searchBlock.shopping", 12, "Shopping results are specialized and secondary to answer blocks.");

    if (metrics.codeBlocks > 0) addPositive("structure.codeBlocks", 52, "Includes code or a practical example.");
    if (metrics.tables > 0) addPositive("structure.tables", 38, "Contains table-like structured details.");
    if (metrics.listItems >= 3) addPositive("structure.listItems", Math.min(34, 12 + metrics.listItems * 2), "Structured list is easy to scan.");
    if (metrics.hasNumbers) addPositive("structure.numbers", 12, "Contains concrete numbers or dates.");
    if (metrics.themeIntent && metrics.themeIntent.boost > 0) {
      if (metrics.themeIntent.intentMatch) {
        addPositive(`intent.${metrics.themeIntent.intent}`, Math.min(12, metrics.themeIntent.boost), (metrics.themeIntent.reasons || [])[0] || "Matches the local page intent.");
      }
      if (Array.isArray(metrics.themeIntent.matchedTerms) && metrics.themeIntent.matchedTerms.length) {
        addPositive("theme.match", Math.min(8, metrics.themeIntent.boost), `Matches local theme terms: ${metrics.themeIntent.matchedTerms.slice(0, 3).join(", ")}.`);
      }
    }
    if (metrics.fluffScore >= 82) addNegative("fluff.high", -metrics.fluffScore, "High boilerplate or fluff score.");
    if (metrics.negativePatternHit) addNegative("pattern.negative", -34, "Matches low-value page text.");
    if (metrics.fluffPatternHit) addNegative("pattern.fluff", -22, "Matches soft intro or filler text.");

    const themeIntentSignals = positive
      .filter((signal) => /^theme\.|^intent\./.test(signal.signal))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2);
    const primaryPositiveSignals = positive
      .filter((signal) => !/^theme\.|^intent\./.test(signal.signal))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(3, 5 - themeIntentSignals.length));
    let signals = primaryPositiveSignals
      .concat(themeIntentSignals)
      .concat(negative.sort((a, b) => a.weight - b.weight).slice(0, 2));
    if (!signals.length && role) {
      signals = [{
        signal: `role.${role}`,
        weight: Number(section && section.score) || 0,
        explanation: `${getSectionIntelligenceRoleLabel(section, role)} role from existing section metadata.`
      }];
    }

    return {
      score: Number(section && section.score) || 0,
      usefulScore: Number(section && section.usefulScore) || 0,
      importanceScore: Number(section && section.importanceScore) || 0,
      fluffScore: Number(metrics.fluffScore) || 0,
      signals
    };
  }

  function getSectionSourceType(section, unitMeta, metrics) {
    if (unitMeta.ocr) return "ocr";
    if (section && section.source === "pdf" || unitMeta.pdfjs || unitMeta.pageNumber || metrics.pdfSectionType) return "pdf";
    if (unitMeta.searchBlockType || unitMeta.kind === "search-block") return "search";
    if (unitMeta.role === "assistant" || unitMeta.role === "user" || metrics.chatRole) return "chat";
    if (unitMeta.kind) return String(unitMeta.kind);
    return section && section.source || "dom";
  }

  function uniqueStrings(values) {
    const seen = new Set();
    return values.map((value) => String(value || "").replace(/\s+/g, " ").trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function isLowValueSectionKind(section) {
    const kind = section && section.metrics ? section.metrics.sectionKind : "";
    return kind === "works_cited" || kind === "appendix" || kind === "title_page" || kind === "toc" || kind === "boilerplate" || kind === "prompt_echo" || kind === "changelog";
  }

  function finalizePageProfile(profile, sections, headingSections, fallbackSections, root) {
    const helpers = getHelpersFromRoot(root);
    const text = helpers.getReadableText(root);
    const rootWords = helpers.countWords(text);
    const sectionWords = sections.reduce((sum, section) => sum + (Number(section.wordCount) || 0), 0);
    if (profile.adapterName === "google-docs") {
      const strongSignals = sections.filter((section) => section.score >= 58 && section.metrics.fluffScore < 58 && section.usefulScore >= 24).length;
      return resolvePageProfile(profile, sections, {
        words: sectionWords,
        sectionCount: sections.length,
        strongSignals,
        linkDensity: 0,
        formControls: 0,
        headings: headingSections.length,
        fallbackOnly: false,
        readableBlocks: sections.length,
        cardLikeCount: 0,
        pageEvidence: {
          articleEvidence: 0,
          conversationEvidence: 0,
          conversationNodes: 0,
          assistantHits: 0,
          userHits: 0,
          codeBlocks: 0,
          quietEvidence: sectionWords >= 40 ? 0 : 1,
          paragraphs: sections.length,
          controls: 0,
          links: 0,
          resultItems: 0,
          commerceNodes: 0,
          appShellNodes: 0,
          searchNodes: 0,
          prefixCount: 0,
          reason: profile.reason || "Google Docs adapter controls document readability"
        }
      });
    }
    const hasRecoveredPdfSections = profile.type === "pdf" && sections.some((section) => {
      const meta = section.unitMeta || {};
      return section.source === "pdf"
        || Boolean(section.pageNumber)
        || /^pdf-/i.test(String(meta.kind || ""));
    });
    const words = hasRecoveredPdfSections ? Math.max(rootWords, sectionWords) : rootWords;
    const sectionCount = sections.length;
    const strongSignals = sections.filter((section) => section.score >= 58 && section.metrics.fluffScore < 58 && section.usefulScore >= 24).length;
    const linkWords = helpers.countWords(Array.from(root.querySelectorAll ? root.querySelectorAll("a") : []).map((link) => link.innerText || "").join(" "));
    const linkDensity = words ? linkWords / words : 0;
    const formControls = root.ownerDocument.querySelectorAll("input, textarea, select, button, [role='button'], [role='tab']").length;
    const headings = headingSections.length;
    const fallbackOnly = headings < 2 && fallbackSections.length < 3 && profile.type !== "chat" && profile.type !== "pdf";
    const readableBlocks = fallbackSections.length || headingSections.length;
    const cardLikeCount = root.querySelectorAll ? root.querySelectorAll("[class*='card' i], [class*='tile' i], [class*='grid' i], [role='listitem']").length : 0;
    const pageEvidence = getPageEvidence({
      root,
      profile,
      sections,
      headingSections,
      fallbackSections,
      words,
      linkDensity,
      formControls,
      headings,
      cardLikeCount,
      helpers
    });
    return resolvePageProfile(profile, sections, {
      words,
      sectionCount,
      strongSignals,
      linkDensity,
      formControls,
      headings,
      fallbackOnly,
      readableBlocks,
      cardLikeCount,
      pageEvidence
    });
  }


function resolvePageProfile(profile, sections, details) {
  const words = details.words || 0;
  const sectionCount = Number.isFinite(details.sectionCount) ? details.sectionCount : sections.length;
  const strongSignals = Number.isFinite(details.strongSignals)
    ? details.strongSignals
    : sections.filter((section) => section.score >= 58 && section.metrics.fluffScore < 58 && section.usefulScore >= 24).length;
  const linkDensity = details.linkDensity || 0;
  const formControls = details.formControls || 0;
  const fallbackOnly = Boolean(details.fallbackOnly);
  const readableBlocks = details.readableBlocks || sectionCount;
  const cardLikeCount = details.cardLikeCount || 0;
  const pageEvidence = details.pageEvidence || {
    articleEvidence: 0,
    conversationEvidence: 0,
    conversationNodes: 0,
    assistantHits: 0,
    userHits: 0,
    codeBlocks: 0,
    quietEvidence: 0,
    paragraphs: 0,
    reason: "This page is better left quiet"
  };
  let readingConfidence = profile.readingConfidence;

  const initialIsChat = profile.type === "chat";
  const initialIsPdf = profile.type === "pdf";
  const initialIsGoogleDocs = profile.adapterName === "google-docs";
  if (initialIsGoogleDocs) {
    const sectionWords = sections.reduce((sum, section) => sum + (Number(section.wordCount) || 0), 0);
    const readable = sectionCount >= 1 && sectionWords >= 40;
    const partial = Boolean(profile.googleDocsPartial);
    const canvasOnly = profile.googleDocsRenderingCapability === "canvas-only" || profile.googleDocsFailureReason === "canvas-rendering-requires-screen-reader-support";
    const reason = readable
      ? partial
        ? "SkimRoute mapped the Google Docs content currently available in the editor."
        : "Google Docs document text found"
      : canvasOnly
        ? GOOGLE_DOCS_CANVAS_RENDERING_REASON
        : profile.quietReason || profile.reason || "Google Docs is open, but SkimRoute cannot read enough document text yet.";
    return {
      type: "docs",
      label: "Google Docs",
      readingConfidence: Math.max(readable ? 68 : 38, Math.min(90, Number(profile.readingConfidence) || 38)),
      quietMode: !readable,
      reason,
      quietReason: readable ? "" : reason,
      diagnosticHint: readable ? "" : canvasOnly ? "Google Docs appears to be rendering document text to canvas instead of exposing local text nodes." : "Google Docs matched, but readable document text was not exposed clearly enough to build sections.",
      pageEvidence,
      searchSubtype: profile.searchSubtype || "",
      ocrQuality: profile.ocrQuality || "",
      qualityMessage: profile.qualityMessage || "",
      isAmbiguous: !readable,
      adapterName: "google-docs",
      googleDocsPartial: partial,
      googleDocsMode: profile.googleDocsMode || "",
      googleDocsActiveTab: profile.googleDocsActiveTab || "",
      googleDocsFailureReason: profile.googleDocsFailureReason || "",
      googleDocsRenderingCapability: profile.googleDocsRenderingCapability || ""
    };
  }
  const conversationLikeEvidence = (pageEvidence.conversationEvidence || 0) >= 4
    || ((pageEvidence.conversationNodes || 0) >= 4 && (pageEvidence.assistantHits || 0) >= 1 && (pageEvidence.userHits || 0) >= 1)
    || ((pageEvidence.conversationEvidence || 0) >= 3 && (pageEvidence.codeBlocks || 0) > 0)
    || ((pageEvidence.conversationEvidence || 0) >= 3 && (pageEvidence.prefixCount || 0) >= 2);

  const chatHasAssistantResponse = sections.some((section) => {
    const meta = section.unitMeta || {};
    return (initialIsChat || conversationLikeEvidence) && meta.role === "assistant";
  });
  const chatHasTargetSignal = sections.some((section) => {
    if (!initialIsChat && !conversationLikeEvidence) return false;
    if (section.unitMeta && section.unitMeta.role === "user") return false;
    const matched = section.metrics && section.metrics.matched ? section.metrics.matched : {};
    return section.score >= 58
      || section.usefulScore >= 34
      || section.metrics.codeBlocks > 0
      || matched.finalCode
      || matched.completeCode
      || matched.latestCompleteAssistantAnswer
      || matched.correctedAnswer
      || matched.replacesFailedAttempt
      || matched.revision
      || matched.conciseAnswer
      || matched.summary
      || matched.answer
      || matched.directAction;
  });
  const chatHasUsableResponse = (initialIsChat || conversationLikeEvidence)
    && sectionCount >= 1
    && words >= 80
    && (chatHasAssistantResponse || chatHasTargetSignal);
  const pdfReadable = initialIsPdf
    && sectionCount >= 1
    && words >= 24;
  const searchHasUsableMap = profile.type === "search_results"
    && sectionCount >= 1
    && sections.some((section) => {
      const meta = section.unitMeta || {};
      return meta.kind === "search-block" || Boolean(meta.searchBlockType);
    });

  const cleanParagraphLongform = !initialIsChat
    && words >= 900
    && pageEvidence.paragraphs >= 5
    && linkDensity < 0.22
    && formControls <= 18
    && (pageEvidence.quietEvidence || 0) <= 2;
  const veryLongReadableText = !initialIsChat
    && words >= 1400
    && pageEvidence.paragraphs >= 4
    && linkDensity < 0.24
    && formControls <= 18
    && (pageEvidence.quietEvidence || 0) <= 3;
  const articleLikeEvidence = !initialIsChat
    && (
      ((pageEvidence.articleEvidence || 0) >= 4 && (pageEvidence.quietEvidence || 0) <= 5)
      || cleanParagraphLongform
      || veryLongReadableText
      || (words >= 700 && pageEvidence.paragraphs >= 4 && (pageEvidence.articleEvidence || 0) >= 3 && (pageEvidence.quietEvidence || 0) <= 5)
    );

  if ((initialIsChat || conversationLikeEvidence) && sectionCount >= 3) readingConfidence += 10;
  if (chatHasUsableResponse) readingConfidence += 10;
  if (pdfReadable) readingConfidence += 24;
  if (searchHasUsableMap) readingConfidence += 34;
  if (cleanParagraphLongform || veryLongReadableText) readingConfidence += 12;
  if (words >= 520) readingConfidence += 10;
  if (words >= 1200) readingConfidence += 8;
  if (sectionCount >= 4) readingConfidence += 10;
  if (sectionCount >= 8) readingConfidence += 5;
  if (strongSignals >= 1) readingConfidence += 8;
  if (strongSignals >= 3) readingConfidence += 7;
  if (conversationLikeEvidence) readingConfidence += 12;
  if (linkDensity > 0.34) readingConfidence -= 18;
  if (linkDensity > 0.52) readingConfidence -= 22;
  if (formControls > 28 && words < 1000) readingConfidence -= 22;
  if (fallbackOnly) readingConfidence -= 16;
  if (cardLikeCount > 34 && readableBlocks < 8) readingConfidence -= 14;
  if ((pageEvidence.quietEvidence || 0) >= 6 && (pageEvidence.articleEvidence || 0) <= 3) readingConfidence -= 18;
  if ((pageEvidence.quietEvidence || 0) >= 9) readingConfidence -= 14;
  if ((pageEvidence.articleEvidence || 0) >= 6 && (pageEvidence.quietEvidence || 0) <= 4) readingConfidence += 10;
  if (articleLikeEvidence) readingConfidence += 16;
  if (words < MIN_USEFUL_WORDS && !initialIsChat && !initialIsPdf) readingConfidence -= 24;
  if (sectionCount < 2 && !chatHasUsableResponse && !pdfReadable) readingConfidence -= 22;

  readingConfidence = Math.max(0, Math.min(96, Math.round(readingConfidence)));
  let type = profile.type;
  let label = profile.label;
  let reason = profile.reason;
  let quietReason = "";
  const readableLongform = !initialIsChat
    && words >= 780
    && pageEvidence.paragraphs >= 5
    && linkDensity < 0.3
    && formControls <= 24
    && (pageEvidence.quietEvidence || 0) <= 5
    && sectionCount >= 1
    && (
      (pageEvidence.articleEvidence || 0) >= 5
      || cleanParagraphLongform
      || veryLongReadableText
      || strongSignals >= 1
    );
  const articleShield = !initialIsChat
    && ((pageEvidence.articleEvidence || 0) >= 6 || readableLongform)
    && words >= 360
    && (sectionCount >= 2 || pageEvidence.paragraphs >= 5);
  const chatOverride = !initialIsChat
    && conversationLikeEvidence
    && words >= 24
    && (sectionCount >= 1 || strongSignals >= 1)
    && (pageEvidence.quietEvidence || 0) <= 6;
  const articleOverride = !initialIsChat
    && AMBIGUOUS_PAGE_TYPES.has(type)
    && (
      (pageEvidence.articleEvidence || 0) >= 4
      || readableLongform
      || veryLongReadableText
    )
    && (pageEvidence.quietEvidence || 0) <= (type === "low_structure" ? 7 : type === "shopping_product" ? 5 : 4)
    && (strongSignals >= 1 || readableLongform || articleLikeEvidence)
    && readingConfidence >= (type === "low_structure" ? 50 : type === "shopping_product" ? 46 : 52);

  if (chatOverride) {
    type = "chat";
    label = "AI chat";
    reason = "Conversation structure found";
    readingConfidence = Math.max(readingConfidence, 66);
  }

  if (articleOverride && type !== "chat") {
    type = "article";
    label = "Page";
    reason = "Readable sections found";
    readingConfidence = Math.max(readingConfidence, 64);
  }

  if (pdfReadable) {
    type = "pdf";
    label = "PDF";
    reason = "Selectable PDF text found";
    readingConfidence = Math.max(readingConfidence, 66);
  }

  if (searchHasUsableMap && type === "search_results") {
    label = "Search Results";
    reason = "Search results found. SkimRoute works best after you open a result, but it can still help you focus the AI Overview or top result areas.";
    readingConfidence = Math.max(readingConfidence, 68);
  }

  const chatMode = type === "chat";
  const chatShield = chatMode || conversationLikeEvidence || chatHasUsableResponse;
  const strongStructureOverride = articleShield || articleOverride || chatOverride || chatHasUsableResponse || pdfReadable || articleLikeEvidence || searchHasUsableMap;
  const quietByEvidence = !chatMode && (pageEvidence.quietEvidence || 0) >= 8 && (pageEvidence.articleEvidence || 0) <= 4 && !articleShield;

  const quietMode = !strongStructureOverride && (
    QUIET_PAGE_TYPES.has(type)
    || (!chatShield && words < MIN_USEFUL_WORDS && !articleShield)
    || (sectionCount < 2 && !articleShield && !chatHasUsableResponse && !pdfReadable && (pageEvidence.conversationEvidence || 0) < 3)
    || (readingConfidence < 44 && !articleShield && !chatHasUsableResponse && !pdfReadable && (pageEvidence.conversationEvidence || 0) < 3)
    || quietByEvidence
    || (LOW_CONFIDENCE_PAGE_TYPES.has(type) && readingConfidence < 62 && !articleShield && (pageEvidence.conversationEvidence || 0) < 3)
  );

  if (quietByEvidence) {
    reason = quietReason;
  } else if (QUIET_PAGE_TYPES.has(type)) {
    quietReason = type === "search_results"
      ? "This page is mostly search results, so there is not enough long-form content to map. Open a result for a full Page Map."
      : reason || "This page is better left quiet";
  } else if (initialIsPdf && words < 20) {
    quietReason = profile.quietReason || "PDF text is still loading, or this PDF has no selectable text";
  } else if (initialIsChat && !chatHasUsableResponse) {
    quietReason = "Waiting for an assistant answer to map";
  } else if (!chatShield && words < MIN_USEFUL_WORDS && !articleShield && !initialIsPdf) {
    quietReason = type === "search_results"
      ? "This page is mostly search results, so there is not enough long-form content to map. Open a result for a full Page Map."
      : "This page is too short to map reliably";
  } else if (sectionCount < 2 && !articleShield && !chatHasUsableResponse && !pdfReadable) {
    quietReason = "Not enough sections to map";
  } else if (readingConfidence < 44 && !articleShield && !chatHasUsableResponse) {
    quietReason = "No section clearly stands out";
  }

  if (quietMode && quietByEvidence) {
    reason = quietReason;
  }

  if (quietMode && (initialIsChat || initialIsPdf) && quietReason) {
    reason = quietReason;
  }

  if (quietMode && !initialIsChat && !initialIsPdf && !QUIET_PAGE_TYPES.has(type) && readingConfidence < 38) {
    type = "low_structure";
    label = "Page";
    reason = quietReason || "Nothing strong to map here";
  } else if (quietMode && !reason) {
    reason = quietReason || "Nothing strong to map here";
  }

  let diagnosticHint = "";
  if (initialIsPdf && !pdfReadable) {
    diagnosticHint = "PDF text was not exposed clearly enough for SkimRoute to extract sections.";
  } else if ((initialIsChat || conversationLikeEvidence) && sectionCount === 0) {
    diagnosticHint = "Conversation-like content was detected, but no chat turns were converted into sections.";
  } else if (articleLikeEvidence && sectionCount === 0) {
    diagnosticHint = "Readable article-like text was detected, but headings/blocks did not produce sections.";
  } else if (quietByEvidence) {
    diagnosticHint = "The page still looks like a quiet page type (search, shopping, app, or low-structure).";
  } else if (initialIsChat && !chatHasUsableResponse) {
    diagnosticHint = "A chat surface was found, but no assistant answer was strong enough to promote.";
  } else if (!initialIsChat && !initialIsPdf && words < MIN_USEFUL_WORDS) {
    diagnosticHint = "The page is too short or too thin to map reliably.";
  } else if (sectionCount === 0) {
    diagnosticHint = "Text was extracted, but SkimRoute could not build any usable sections from it.";
  }

  return {
    type,
    label,
    readingConfidence,
    quietMode,
    reason,
    quietReason: quietReason || (quietMode ? reason : ""),
    diagnosticHint,
    pageEvidence,
    searchSubtype: profile.searchSubtype || "",
    ocrQuality: profile.ocrQuality || "",
    qualityMessage: profile.qualityMessage || "",
    isAmbiguous: AMBIGUOUS_PAGE_TYPES.has(type) || quietByEvidence,
    adapterName: profile.adapterName
  };
}


function getPageEvidence(details) {
    const root = details.root;
    const doc = root.ownerDocument || document;
    const profile = details.profile || {};
    const evidenceDiagnosticHint = profile.diagnosticHint || "";
    const text = details.helpers.cleanText(details.helpers.getReadableText(root).slice(0, 9000));
    const lower = text.toLowerCase();
    const paragraphs = root.querySelectorAll ? root.querySelectorAll("article p, main p, p").length : 0;
    const controls = details.formControls || 0;
    const links = root.querySelectorAll ? root.querySelectorAll("a").length : 0;
    const resultItems = root.querySelectorAll
      ? root.querySelectorAll("[role='listitem'], article h3 a, [data-testid*='result' i], [class*='result' i], [class*='listing' i]").length
      : 0;
    const commerceNodes = doc.querySelectorAll
      ? doc.querySelectorAll("[itemtype*='Product' i], [class*='product' i], [class*='price' i], [class*='cart' i], [data-testid*='price' i], [data-testid*='cart' i]").length
      : 0;
    const appShellNodes = doc.querySelectorAll
      ? doc.querySelectorAll("[class*='dashboard' i], [class*='settings' i], [class*='app-shell' i], [class*='workspace' i], [role='tablist'], [role='toolbar'], [aria-label*='sidebar' i]").length
      : 0;
    const searchNodes = doc.querySelectorAll
      ? doc.querySelectorAll("[role='search'], input[type='search'], [class*='search' i], [data-testid*='search' i]").length
      : 0;
    const conversationSelector = [
      "[data-message-author-role]",
      "[data-testid*='conversation-turn']",
      "[data-testid*='conversation']",
      "[data-testid*='user-message']",
      "[data-testid*='assistant-message']",
      "[data-testid*='chat-message']",
      "[data-testid*='message']",
      "[data-testid*='prompt']",
      "[data-testid*='response']",
      "[data-author]",
      "[data-role]",
      "[data-content*='message' i]",
      "[aria-label*='assistant' i]",
      "[aria-label*='user' i]",
      "[class*='assistant' i]",
      "[class*='response' i]",
      "[class*='prompt' i]",
      "[class*='conversation' i] [class*='message' i]",
      "[class*='chat' i] [class*='message' i]",
      "[class*='markdown' i]",
      "[class*='prose' i]"
    ].join(", ");
    const conversationNodes = doc.querySelectorAll
      ? doc.querySelectorAll(conversationSelector).length
      : 0;
    const conversationAssistantHits = countPatternHits(lower, /\b(assistant|model|response|reply|bot|generated|copilot|gemini|grok|claude|chatgpt|perplexity)\b/g);
    const conversationUserHits = countPatternHits(lower, /\b(user|human|prompt|question|you|me|ask|asked)\b/g);
    const conversationCueHits = countPatternHits(lower, /\b(final answer|latest answer|corrected|correction|working version|copy code|copy and paste|regenerate|reply|chat|conversation|summary|final code|assistant|response|question|answer|follow up|revision|revised)\b/g);
    const prefixLines = countPatternHits(text, /(?:^|\n)\s*(user|assistant|human|model|bot|you|me|question|answer|response|reply|prompt|q|a)\s*[:\-]/gim);
    const codeBlocks = root.querySelectorAll ? root.querySelectorAll("pre, code").length : 0;
    let conversationEvidence = 0;
    if (conversationNodes >= 4) conversationEvidence += 2;
    if (conversationAssistantHits >= 2 && conversationUserHits >= 2) conversationEvidence += 2;
    if (prefixLines >= 2) conversationEvidence += 2;
    if (codeBlocks > 0) conversationEvidence += 1;
    if (conversationCueHits >= 3) conversationEvidence += 1;
    if ((profile.type === "chat" || profile.adapterName === "generic-chat") && (conversationNodes >= 2 || prefixLines >= 1 || conversationCueHits >= 1)) conversationEvidence += 2;

    const articleSignals = (root.matches && root.matches("article") ? 2 : 0)
      + (root.querySelector && root.querySelector("article") ? 2 : 0)
      + (details.words >= 520 ? 1 : 0)
      + (details.words >= 1200 ? 1 : 0)
      + (details.headings >= 3 ? 1 : 0)
      + (details.sections.filter((section) => section.metrics.fluffScore < 58 && section.usefulScore >= 24).length >= 1 ? 1 : 0)
      + (paragraphs >= 7 ? 1 : 0)
      + (details.linkDensity < 0.24 ? 1 : 0)
      + (controls <= 18 ? 1 : 0);
    let quietSignals = (details.linkDensity > 0.34 ? 2 : 0)
      + (details.linkDensity > 0.52 ? 2 : 0)
      + (controls > 28 ? 2 : 0)
      + (controls > 48 ? 2 : 0)
      + (details.cardLikeCount > 28 && paragraphs < 10 ? 2 : 0)
      + (resultItems > 18 && details.linkDensity > 0.22 ? 2 : 0)
      + (commerceNodes >= 3 ? 2 : 0)
      + (countPatternHits(lower, /\b(add to cart|buy now|checkout|shipping|returns?|in stock|out of stock|sku|price|\$\d+|customers also bought|recommended products?)\b/g) >= 2 ? 2 : 0)
      + (appShellNodes >= 2 ? 2 : 0)
      + (countPatternHits(lower, /\b(dashboard|settings|billing|workspace|analytics|reports?|saved views?|export|permissions|account)\b/g) >= 5 && controls > 14 ? 2 : 0)
      + (searchNodes >= 2 && (countPatternHits(lower, /\b(search results|results for|all results|filters|sort by|sponsored result|people also ask)\b/g) >= 1 || resultItems > 10) ? 2 : 0)
      + (links > Math.max(42, details.headings * 14) && paragraphs < 12 ? 1 : 0);

    if (conversationEvidence >= 3) {
      quietSignals = Math.max(0, quietSignals - 4);
    }

    const transcriptStyle = conversationEvidence >= 5
      ? "conversation"
      : prefixLines >= 2
        ? "dialogue"
        : codeBlocks > 0
          ? "code-rich"
          : conversationEvidence >= 3
            ? "structured-chat"
            : "";

    const reason = conversationEvidence >= 3
      ? "Conversation structure found"
      : resultItems || searchNodes >= 2
        ? "Search and results pages are already built for scanning"
        : commerceNodes || countPatternHits(lower, /\b(add to cart|buy now|checkout|shipping|returns?|in stock|out of stock|sku|price|\$\d+|customers also bought|recommended products?)\b/g) >= 2
          ? "Product and shopping pages are better left quiet"
          : appShellNodes || controls > 28
            ? "App screens are better left quiet"
            : "This page is better left quiet";

    return {
      articleEvidence: articleSignals,
      quietEvidence: quietSignals,
      paragraphs,
      controls,
      links,
      cardLikeCount: details.cardLikeCount,
      resultItems,
      commerceNodes,
      appShellNodes,
      searchNodes,
      conversationEvidence,
      conversationNodes,
      assistantHits: conversationAssistantHits,
      userHits: conversationUserHits,
      prefixCount: prefixLines,
      transcriptStyle,
      codeBlocks,
      diagnosticHint: evidenceDiagnosticHint,
      reason
    };
  }

  function buildSectionHierarchy(sections, collapsedSectionIds) {
    const stack = [];
    const validIds = new Set(sections.map((section) => section.id));
    Array.from(collapsedSectionIds).forEach((id) => {
      if (!validIds.has(id)) collapsedSectionIds.delete(id);
    });

    sections.forEach((section) => {
      section.parentId = null;
      section.childIds = [];
      section.isCollapsed = collapsedSectionIds.has(section.id);

      while (stack.length && stack[stack.length - 1].level >= section.level) {
        stack.pop();
      }

      const parent = stack[stack.length - 1];
      if (parent) {
        section.parentId = parent.id;
        parent.childIds.push(section.id);
      }
      stack.push(section);
    });

    return sections;
  }

  function pickImportantSections(sections, profile) {
    if (profile.quietMode) return [];
    const important = sections.filter((section) => section.isImportant);
    const best = important.find((section) => section.isBest) || sections.find((section) => section.isBest) || null;
    const ranked = important.slice().sort((a, b) => b.score - a.score);
    const selected = [];
    const limit = profile.type === "chat" ? 12 : 9;

    if (best) selected.push(best);
    ranked.forEach((section) => {
      if (selected.length < limit && !selected.some((item) => item.id === section.id)) {
        selected.push(section);
      }
    });

    if (profile.type === "search_results") {
      return selected.sort((a, b) => {
        const aMeta = a.unitMeta || {};
        const bMeta = b.unitMeta || {};
        const aPriority = Number.isFinite(Number(aMeta.searchPriority)) ? Number(aMeta.searchPriority) : searchPriorityForType(aMeta.searchBlockType);
        const bPriority = Number.isFinite(Number(bMeta.searchPriority)) ? Number(bMeta.searchPriority) : searchPriorityForType(bMeta.searchBlockType);
        return aPriority - bPriority || (Number(aMeta.resultIndex) || 0) - (Number(bMeta.resultIndex) || 0) || a.top - b.top;
      });
    }

    return selected.sort((a, b) => a.top - b.top);
  }

  function buildRecommendation(sections, importantSections, pageProfile) {
    const minimumWords = pageProfile.type === "chat" || pageProfile.type === "low_structure" ? 8 : 18;
    const candidates = sections
      .filter((section) => section.wordCount >= minimumWords)
      .filter((section) => section.metrics.fluffScore < 82 || section.isBest || section.score >= 92 || section.metrics.matched.finalCode)
      .sort((a, b) => b.score - a.score);
    const bestSection = sections.find((section) => section.isBest) || candidates[0] || null;
    const second = candidates.find((section) => bestSection && section.id !== bestSection.id) || null;

    if (!bestSection || pageProfile.quietMode) {
      return emptyRecommendation();
    }

    const margin = second ? bestSection.score - second.score : 28;
    const searchPage = pageProfile.type === "search_results";
    const ambiguousPage = !searchPage && (Boolean(pageProfile.isAmbiguous) || AMBIGUOUS_PAGE_TYPES.has(pageProfile.type));
    const scoreStrength = Math.max(0, Math.min(1, (bestSection.score - 30) / 112));
    const marginStrength = Math.max(0, Math.min(1, (margin + 8) / 58));
    const signalStrength = Math.max(0, Math.min(1, getSignalCount(bestSection.metrics) / 7));
    const usefulStrength = Math.max(0, Math.min(1, bestSection.usefulScore / 96));
    const confidence = Math.round((scoreStrength * 0.34 + marginStrength * 0.22 + signalStrength * 0.18 + usefulStrength * 0.26) * 100);
    const pageConfidence = pageProfile.readingConfidence || 50;
    const finalConfidence = Math.max(0, Math.min(96, Math.round(confidence * 0.74 + pageConfidence * 0.26)));
    const tier = getConfidenceTier(finalConfidence);
    const minimumConfidence = ambiguousPage
      ? Math.max(68, STRONG_TARGET_CONFIDENCE)
      : searchPage
        ? 46
      : pageProfile.type === "chat"
        ? 52
        : pageProfile.type === "article"
          ? 44
          : (pageProfile.type === "docs" || pageProfile.type === "tutorial")
            ? 50
            : STRONG_TARGET_CONFIDENCE;
    const minimumScore = ambiguousPage
      ? 76
      : searchPage
        ? 62
      : LOW_CONFIDENCE_PAGE_TYPES.has(pageProfile.type)
        ? 92
        : pageProfile.type === "chat"
          ? 58
          : pageProfile.type === "article"
            ? 66
            : (pageProfile.type === "docs" || pageProfile.type === "tutorial")
              ? 54
              : 42;
    const minimumUseful = ambiguousPage
      ? 36
      : searchPage
        ? 24
      : pageProfile.type === "chat"
        ? 34
        : pageProfile.type === "article"
          ? 30
          : (pageProfile.type === "docs" || pageProfile.type === "tutorial")
            ? 26
            : 24;
    const minimumPageConfidence = ambiguousPage
      ? 58
      : searchPage
        ? 44
      : pageProfile.type === "chat"
        ? 48
        : pageProfile.type === "article"
          ? 50
          : (pageProfile.type === "docs" || pageProfile.type === "tutorial")
            ? 46
            : 44;
    const marginOk = !ambiguousPage || margin >= 8 || bestSection.score >= 104 || bestSection.metrics.matched.finalCode;
    const hasStrongTarget = Boolean(
      finalConfidence >= minimumConfidence
      && bestSection.score >= minimumScore
      && bestSection.usefulScore >= minimumUseful
      && pageConfidence >= minimumPageConfidence
      && marginOk
    );

    if (!hasStrongTarget && tier === "none") {
      return emptyRecommendation(finalConfidence);
    }

    return {
      bestSectionId: bestSection.id,
      confidence: finalConfidence,
      confidenceTier: tier,
      confidenceLabel: confidenceLabelForTier(tier),
      hasStrongTarget,
      bestLabel: hasStrongTarget ? bestLabelForSection(bestSection, tier, pageProfile) : "No clear standout",
      bestKind: bestKindForSection(bestSection),
      bestKindLabel: bestKindLabelForSection(bestSection),
      targetConfidenceReason: targetConfidenceReason({ bestSection, second, finalConfidence, pageConfidence, margin, ambiguousPage, hasStrongTarget }),
      savedMinutes: hasStrongTarget ? estimateSavedMinutes(bestSection, sections) : 0
    };
  }

  function emptyRecommendation(confidence) {
    return {
      bestSectionId: null,
      confidence: confidence || 0,
      confidenceTier: "none",
      confidenceLabel: "No clear standout",
      hasStrongTarget: false,
      bestLabel: "No clear standout",
      bestKind: "",
      bestKindLabel: "",
      targetConfidenceReason: "No section has enough signal yet",
      savedMinutes: 0
    };
  }

  function getConfidenceTier(confidence) {
    if (confidence >= HIGH_CONFIDENCE) return "high";
    if (confidence >= STRONG_TARGET_CONFIDENCE) return "medium";
    if (confidence >= LOW_CONFIDENCE) return "low";
    return "none";
  }

  function confidenceLabelForTier(tier) {
    if (tier === "high") return "High confidence";
    if (tier === "medium") return "Looks useful";
    if (tier === "low") return "Low confidence";
    return "No clear standout";
  }

  function bestLabelForSection(section, tier, pageProfile) {
    if (!section || !section.metrics) return "Best place to start";
    if (section.label) return section.label;
    if (pageProfile.type === "search_results" && section.unitMeta && section.unitMeta.searchBlockType) {
      const blockType = section.unitMeta.searchBlockType;
      if (blockType === "ai_overview") return "AI Overview";
      if (blockType === "answer") return "Search answer";
      if (blockType === "people_also_ask") return "People also ask";
      if (blockType === "top_results") return "Top results";
      if (blockType === "related_searches") return "Related searches";
      return SECTION_KIND_LABELS[searchSectionKind(blockType)] || "Search result";
    }
    if (section.metrics.matched.finalCode) return "Jump to the final code";
    if (isGoogleDocsSection(section.unitMeta, pageProfile) && section.metrics.googleDocsRoleLabel && section.metrics.googleDocsRoleLabel !== "Useful section") return section.metrics.googleDocsRoleLabel;
    if (pageProfile.type === "chat" && (section.metrics.matched.correctedAnswer || section.metrics.matched.replacesFailedAttempt)) return "Jump to the corrected answer";
    if (section.metrics.matched.finalRecommendation) return "Final recommendation";
    if (pageProfile.type === "chat" && section.metrics.matched.completeCode) return "Complete code";
    if (pageProfile.type === "chat" && section.metrics.matched.stepByStepAnswer) return "Step-by-step answer";
    if (pageProfile.type === "chat" && section.metrics.matched.finalAnswer) return "Jump to the final answer";
    if (pageProfile.type === "chat" && (section.metrics.matched.latestCompleteAssistantAnswer || section.metrics.matched.latestAssistantAnswer)) return "Jump to the latest answer";
    if (pageProfile.type === "chat" && section.metrics.matched.keyExplanation) return "Key explanation";
    if (section.metrics.sectionKindLabel && section.metrics.sectionKindLabel !== "Useful section") return section.metrics.sectionKindLabel;
    if (tier === "medium") return "This looks useful";
    if (section.metrics.matched.summary) return "Jump to the summary";
    if (section.metrics.matched.completeCode) return "Complete code";
    if (section.metrics.matched.conciseAnswer || section.metrics.matched.answer) return "Jump straight to the answer";
    if (section.metrics.matched.example || section.metrics.codeBlocks > 0) return "Working example";
    if (section.metrics.matched.procedure || section.metrics.matched.action || section.metrics.matched.directAction) return "Action steps";
    if (section.metrics.matched.recommendation) return "Recommended";
    return "Best place to start";
  }

  function bestKindForSection(section) {
    if (!section || !section.metrics) return "";
    if (section.metrics.sectionKind) return section.metrics.sectionKind;
    if (section.metrics.matched.finalCode) return "final_code";
    if (section.metrics.matched.correctedAnswer || section.metrics.matched.replacesFailedAttempt || section.unitMeta && section.unitMeta.hasRevision) return "corrected_answer";
    if (section.metrics.matched.finalRecommendation) return "final_recommendation";
    if (section.metrics.matched.completeCode) return "complete_code";
    if (section.metrics.matched.stepByStepAnswer) return "step_by_step";
    if (section.metrics.matched.finalAnswer) return "final_answer";
    if (section.metrics.matched.latestCompleteAssistantAnswer || section.metrics.matched.latestAssistantAnswer) return "latest_answer";
    if (section.metrics.matched.conciseAnswer || section.metrics.matched.answer) return "answer";
    if (section.metrics.matched.summary) return "summary";
    if (section.metrics.matched.keyExplanation) return "key_explanation";
    if (section.metrics.matched.procedure || section.metrics.matched.directAction) return "steps";
    if (section.metrics.matched.codeExplanation || section.metrics.codeBlocks > 0) return "code_example";
    if (section.metrics.matched.recommendation) return "recommendation";
    return "useful_section";
  }

  function bestKindLabelForSection(section) {
    if (!section || !section.metrics) return "";
    return section.metrics.sectionKindLabel || labelForSectionBySignals(section) || "";
  }

  function targetConfidenceReason(details) {
    if (!details.hasStrongTarget) {
      if (details.ambiguousPage) return "Ambiguous page, waiting for stronger evidence";
      if (details.pageConfidence < 44) return "Page confidence is low";
      if (details.margin < 8) return "Several sections look similarly useful";
      return "Useful signals are not strong enough yet";
    }
    if (details.bestSection.unitMeta && details.bestSection.unitMeta.searchBlockType) return details.bestSection.unitMeta.diagnosticReason || "Search result block has the strongest signal";
    if (details.bestSection.metrics.ocrRole === "body") return "This paragraph is the main body of the scanned letter, not the letterhead or signature";
    if (isGoogleDocsSection(details.bestSection.unitMeta, { adapterName: "google-docs" }) && details.bestSection.metrics.selectionReason) return details.bestSection.metrics.selectionReason;
    if (details.bestSection.unitMeta && details.bestSection.unitMeta.diagnosticReason) return details.bestSection.unitMeta.diagnosticReason;
    if (details.bestSection.metrics.selectionReason) return details.bestSection.metrics.selectionReason;
    if (details.bestSection.metrics.matched.finalCode) return "Final code signal with enough confidence";
    if (details.bestSection.metrics.matched.correctedAnswer || details.bestSection.unitMeta && details.bestSection.unitMeta.isAfterUserCorrection) return "Updated answer after user correction has the strongest signal";
    if (details.bestSection.metrics.matched.replacesFailedAttempt) return "Newer answer replacing an earlier failed attempt has the strongest signal";
    if (details.bestSection.metrics.matched.finalRecommendation) return "Final recommendation signal with enough confidence";
    if (details.bestSection.metrics.matched.completeCode) return "Complete code answer after the latest request has the strongest signal";
    if (details.bestSection.metrics.matched.stepByStepAnswer) return "Step-by-step assistant answer has the strongest signal";
    if (details.bestSection.metrics.matched.summary) return "Summary or recap has the strongest signal";
    if (details.bestSection.unitMeta && details.bestSection.unitMeta.hasRevision) return "Corrected answer has the strongest signal";
    if (details.bestSection.metrics.matched.latestCompleteAssistantAnswer || details.bestSection.metrics.matched.latestAssistantAnswer) return "Newest complete assistant response has the strongest signal";
    if (details.bestSection.unitMeta && details.bestSection.unitMeta.answersLatestUser) return "Answer after the latest user request has the strongest signal";
    if (details.bestSection.metrics.matched.finalAnswer) return "Final answer signal with enough confidence";
    if (details.bestSection.metrics.matched.conciseAnswer) return "Concise answer signal with enough confidence";
    if (details.bestSection.metrics.matched.keyExplanation) return "Key explanation signal with enough confidence";
    return details.ambiguousPage ? "Strong useful signal on an ambiguous page" : "Strong useful signal";
  }

  function getSignalCount(metrics) {
    if (!metrics || !metrics.matched) return 0;
    const positiveSignals = [
      "useful", "answer", "action", "definition", "warning", "example", "recommendation",
      "finality", "procedure", "conciseAnswer", "summary", "directAction", "comparison",
      "codeExplanation", "completeCode", "acceptedAnswer", "troubleshooting", "revision",
      "finalCode", "finalAnswer", "finalRecommendation", "stepByStepAnswer", "keyExplanation",
      "completeAssistantAnswer", "latestAssistantAnswer", "latestCompleteAssistantAnswer",
      "correctedAnswer", "replacesFailedAttempt", "answersLatestUser",
      "mainArgument", "keyEvidence", "quickStart", "installation", "usage", "parameters",
      "troubleshooting", "prerequisites", "setup", "finalResult", "ingredients",
      "instructions", "timing", "tips", "abstract", "methods", "results",
      "discussion", "conclusion", "googleDocsMainClaim", "googleDocsSummary",
      "googleDocsSteps", "googleDocsEvidence", "googleDocsResults", "googleDocsConclusion"
    ];
    return positiveSignals.reduce((sum, key) => sum + (metrics.matched[key] ? 1 : 0), 0)
      + (metrics.listItems >= 3 ? 1 : 0)
      + (metrics.codeBlocks > 0 ? 1 : 0)
      + (metrics.tables > 0 ? 1 : 0)
      + (metrics.hasNumbers ? 1 : 0);
  }

  function estimateSavedMinutes(section, sections) {
    const wordsBefore = sections.reduce((sum, item) => {
      if (item.top >= section.top || item.id === section.id) return sum;
      return sum + item.wordCount;
    }, 0);
    return Math.max(0, Math.floor(wordsBefore / READING_SPEED_WPM));
  }

  function pickNavigationTargets(sections, importantSections, bestSectionId, pageProfile) {
    if (!sections.length) {
      return { nextImportantId: null, skipTargetId: null };
    }
    if (pageProfile && pageProfile.type === "search_results") {
      const nextImportant = importantSections.find((section) => section.id !== bestSectionId)
        || sections.find((section) => section.id !== bestSectionId && section.isImportant)
        || null;
      return {
        nextImportantId: nextImportant ? nextImportant.id : null,
        skipTargetId: pickSkipTarget(sections, importantSections)
      };
    }
    const currentMarker = window.scrollY + Math.min(window.innerHeight * 0.45, 420);
    const nextImportant = importantSections.find((section) => section.top > currentMarker + 80 && section.id !== bestSectionId)
      || importantSections.find((section) => section.id !== bestSectionId)
      || null;
    return {
      nextImportantId: nextImportant ? nextImportant.id : null,
      skipTargetId: pickSkipTarget(sections, importantSections)
    };
  }

  function pickSkipTarget(sections, importantSections) {
    if (!sections.length) return null;
    const articleTop = sections[0] ? sections[0].top : 0;
    const introFloor = articleTop + Math.max(420, window.innerHeight * 0.72);
    const usefulAfterIntro = importantSections.find((section) => section.top > introFloor);
    const firstNotIntro = importantSections.find((section) => section.index > 0);
    const fallback = sections[Math.min(1, sections.length - 1)];
    return (usefulAfterIntro || firstNotIntro || importantSections[0] || fallback || sections[0]).id;
  }

  function refreshSectionPositions(sections) {
    sections.forEach((section) => {
      if (section.anchor && section.anchor.getBoundingClientRect) {
        section.top = section.anchor.getBoundingClientRect().top + window.scrollY;
      }
    });
  }

  function mergeSections(primary, fallback) {
    const merged = [];
    const seen = new Set();
    primary.concat(fallback).forEach((section) => {
      const key = `${Math.round(section.top / 80)}:${section.title.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(section);
      }
    });
    return merged.sort((a, b) => a.top - b.top);
  }

  function inferTitle(blocks, helpers) {
    const first = blocks[0];
    const nearbyHeading = findNearbyHeading(first);
    if (nearbyHeading) {
      return cleanTitle(nearbyHeading.innerText || nearbyHeading.textContent);
    }
    const text = helpers.cleanText(blocks.map((block) => block.innerText || block.textContent || "").join(" "));
    return cleanTitle(text.split(/[.!?]\s/)[0] || text);
  }

  function inferSectionLevel(blocks) {
    const heading = findNearbyHeading(blocks[0]);
    if (heading && heading.tagName) {
      return Number(heading.tagName.slice(1));
    }
    return 2;
  }

  function findNearbyHeading(element) {
    let current = element;
    let hops = 0;
    while (current && current !== document.body && hops < 4) {
      let sibling = current.previousElementSibling;
      let siblingHops = 0;
      while (sibling && siblingHops < 4) {
        if (sibling.matches && sibling.matches("h1, h2, h3, h4")) {
          return sibling;
        }
        sibling = sibling.previousElementSibling;
        siblingHops += 1;
      }
      current = current.parentElement;
      hops += 1;
    }
    return null;
  }

  function getClassTrail(element, helpers) {
    const parts = [];
    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 4) {
      parts.push(`${current.id || ""} ${current.className || ""} ${current.getAttribute && current.getAttribute("role") || ""}`);
      current = current.parentElement;
      depth += 1;
    }
    return helpers.cleanText(parts.join(" "));
  }

  function getScrollOffset(context, helpers) {
    const selectors = [
      "header",
      "nav",
      "[role='banner']",
      "[class*='sticky' i]",
      "[class*='fixed' i]"
    ].join(",");
    const candidates = Array.from(context.document.querySelectorAll(selectors)).slice(0, 80);
    let fixedBottom = 0;
    candidates.forEach((element) => {
      const style = context.window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const pinned = (style.position === "fixed" || style.position === "sticky") && rect.top <= 12 && rect.bottom > 0;
      const usefulSize = rect.height >= 28 && rect.height <= 220 && rect.width >= context.window.innerWidth * 0.42;
      if (pinned && usefulSize && !helpers.isLowValueElement(element)) {
        fixedBottom = Math.max(fixedBottom, rect.bottom);
      }
    });
    return fixedBottom ? Math.min(240, Math.ceil(fixedBottom + 16)) : 72;
  }

  function getStructureSignature(pageProfile, sections) {
    return [
      pageProfile.type,
      pageProfile.quietMode ? "quiet" : "active",
      pageProfile.readingConfidence,
      sections.length,
      sections.slice(0, 28).map((section) => `${section.id}:${section.level}:${Math.round(section.score)}`).join("|")
    ].join(";");
  }

  function cleanTitle(text) {
    const title = cleanText(text).replace(/^#+\s*/, "");
    if (title.length <= 86) return title || "Useful section";
    return `${title.slice(0, 83).trim()}...`;
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
  }

  function countWords(text) {
    const matches = cleanText(text).match(/\b[\w'-]+\b/g);
    return matches ? matches.length : 0;
  }

  function countPatternHits(text, pattern) {
    const matches = String(text || "").match(pattern);
    return matches ? matches.length : 0;
  }

  function safeCall(fn, fallback) {
    try {
      return fn();
    } catch (error) {
      return fallback;
    }
  }

  function analyzeTextFixture(fixture) {
    const profile = {
      type: fixture.type || "article",
      label: fixture.label || "Fixture",
      readingConfidence: fixture.readingConfidence || (LOW_CONFIDENCE_PAGE_TYPES.has(fixture.type) ? 22 : 78),
      quietMode: typeof fixture.quietMode === "boolean" ? fixture.quietMode : Boolean(QUIET_PAGE_TYPES.has(fixture.type)),
      reason: fixture.reason || "",
      quietReason: fixture.quietReason || "",
      isAmbiguous: Boolean(fixture.isAmbiguous || LOW_CONFIDENCE_PAGE_TYPES.has(fixture.type)),
      adapterName: fixture.adapterName || "fixture",
      googleDocsPartial: Boolean(fixture.googleDocsPartial),
      googleDocsMode: fixture.googleDocsMode || "",
      googleDocsActiveTab: fixture.googleDocsActiveTab || ""
    };
    const sections = (fixture.sections || []).map((section, index) => {
      const text = cleanText(`${section.title || ""} ${section.text || ""}`);
      const blockStats = {
        wordCount: countWords(text),
        paragraphs: Math.max(1, Math.ceil(countWords(text) / 100)),
        listItems: section.listItems || (/\n\s*[-*]/.test(section.text || "") ? 3 : 0),
        numberedItems: section.numberedItems || (PROCEDURE_PATTERN.test(section.text || "") ? 3 : 0),
        codeBlocks: section.codeBlocks || (/```|function |const |class |<code/i.test(section.text || "") ? 1 : 0),
        tables: section.tables || 0,
        boldCount: 0,
        links: section.links || 0,
        linkDensity: section.linkDensity || 0,
        hasNumbers: /\b\d+([.,]\d+)?%?\b/.test(text),
        hasReadableParagraphs: true
      };
      const metrics = scoreTextSignals({
        title: section.title || "",
        text,
        index,
        profile,
        unitMeta: section.unitMeta || {},
        blockStats,
        classTrail: section.classTrail || "",
        isElementLowValue: Boolean(section.lowValue)
      });
      return {
        id: `fixture-${index}`,
        title: section.title || `Section ${index + 1}`,
        text,
        index,
        level: section.level || 2,
        wordCount: blockStats.wordCount,
        top: index * 800,
        metrics,
        score: metrics.score + (section.adapterScore || 0),
        usefulScore: metrics.usefulScore + Math.max(0, (section.adapterScore || 0) * 0.5),
        importanceScore: metrics.importanceScore,
        unitMeta: section.unitMeta || {},
        isImportant: false,
        isBest: false,
        label: ""
      };
    });
    let pageProfile = profile;
    let ranked = rankSections(sections, pageProfile);

    if (fixture.finalizeProfile) {
      const fixtureWords = Number.isFinite(fixture.words)
        ? fixture.words
        : ranked.reduce((sum, section) => sum + section.wordCount, 0);
      const sectionWords = ranked.reduce((sum, section) => sum + section.wordCount, 0);
      const words = profile.type === "pdf" ? Math.max(fixtureWords, sectionWords) : fixtureWords;
      const pageEvidence = Object.assign({
        articleEvidence: 0,
        quietEvidence: 0,
        paragraphs: 0,
        reason: "This page is better left quiet"
      }, fixture.pageEvidence || {});

      pageProfile = resolvePageProfile(pageProfile, ranked, {
        words,
        sectionCount: ranked.length,
        strongSignals: ranked.filter((section) => section.score >= 58 && section.metrics.fluffScore < 58 && section.usefulScore >= 24).length,
        linkDensity: fixture.linkDensity || 0,
        formControls: fixture.formControls || 0,
        headings: fixture.headings || 0,
        fallbackOnly: Boolean(fixture.fallbackOnly),
        readableBlocks: fixture.readableBlocks || ranked.length,
        cardLikeCount: fixture.cardLikeCount || 0,
        pageEvidence
      });

      const hasChatRolePair = (pageEvidence.assistantHits || 0) >= 1 && (pageEvidence.userHits || 0) >= 1;
      if (pageProfile.type !== "chat" && (((pageEvidence.conversationEvidence || 0) >= 4 && hasChatRolePair) || ((pageEvidence.conversationNodes || 0) >= 4 && hasChatRolePair) || ((pageEvidence.conversationEvidence || 0) >= 3 && hasChatRolePair && (pageEvidence.codeBlocks || 0) > 0) || ((pageEvidence.conversationEvidence || 0) >= 3 && (pageEvidence.prefixCount || 0) >= 2))) {
        pageProfile = Object.assign({}, pageProfile, {
          type: "chat",
          label: "AI chat",
          readingConfidence: Math.max(pageProfile.readingConfidence || 0, 66),
          quietMode: false,
          reason: "Conversation structure found",
          quietReason: "",
          isAmbiguous: false
        });
      } else if (pageProfile.type !== "article" && (pageEvidence.articleEvidence || 0) >= 4 && (pageEvidence.quietEvidence || 0) <= 4) {
        pageProfile = Object.assign({}, pageProfile, {
          type: "article",
          label: "Page",
          readingConfidence: Math.max(pageProfile.readingConfidence || 0, 64),
          quietMode: false,
          reason: "Readable sections found",
          quietReason: "",
          isAmbiguous: false
        });
      }

      ranked = rankSections(ranked, pageProfile);
    }

    ranked = applyThemeIntentBoosts(
      ranked,
      pageProfile,
      buildThemeIntentContext(ranked, pageProfile, {
        title: fixture.title || fixture.label || "",
        url: fixture.url || ""
      })
    );
    ranked = rankSections(ranked, pageProfile);

    const importantSections = pickImportantSections(ranked, pageProfile);
    const recommendation = buildRecommendation(ranked, importantSections, pageProfile);
    attachSectionIntelligence(ranked, pageProfile, recommendation);
    return {
      pageProfile,
      sections: ranked,
      importantSections,
      recommendation
    };
  }

  window.PagePilotEngine = {
    createEngine,
    analyzeTextFixture,
    constants: {
      MIN_USEFUL_WORDS,
      READING_SPEED_WPM,
      STRONG_TARGET_CONFIDENCE,
      HIGH_CONFIDENCE,
      LOW_CONFIDENCE
    }
  };
})();
