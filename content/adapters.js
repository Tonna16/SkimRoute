(function () {
  "use strict";

  if (window.PagePilotAdapters) {
    return;
  }

  const AI_PLATFORMS = [
    {
      name: "chatgpt",
      label: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      selectors: [
        "[data-message-author-role]",
        "[data-testid*='conversation-turn']",
        "article[data-testid*='conversation']"
      ]
    },
    {
      name: "claude",
      label: "Claude",
      hosts: ["claude.ai"],
      selectors: [
        "[data-testid*='user-message']",
        "[data-testid*='assistant-message']",
        "[data-testid*='chat-message']",
        "[class*='font-claude-message']"
      ]
    },
    {
      name: "gemini",
      label: "Gemini",
      hosts: ["gemini.google.com"],
      selectors: [
        "user-query",
        "model-response",
        "[data-test-id*='response']",
        "[class*='conversation-turn']"
      ]
    },
    {
      name: "perplexity",
      label: "Perplexity",
      hosts: ["perplexity.ai"],
      selectors: [
        "[data-testid*='answer']",
        "[data-testid*='query']",
        "[class*='answer']",
        "[class*='prose']"
      ]
    },
    {
      name: "microsoft-copilot",
      label: "Copilot",
      hosts: ["copilot.microsoft.com", "copilot.com", "bing.com"],
      selectors: [
        "[data-content='user-message']",
        "[data-content='ai-message']",
        "[class*='chat-turn']",
        "[class*='message']"
      ]
    },
    {
      name: "grok",
      label: "Grok",
      hosts: ["grok.com", "x.com", "twitter.com"],
      selectors: [
        "[data-testid*='grok']",
        "[class*='message']",
        "article"
      ]
    },
    {
      name: "github-copilot",
      label: "GitHub Copilot",
      hosts: ["github.com"],
      path: /\/copilot|copilot-chat|\/features\/copilot/i,
      selectors: [
        "[data-testid*='copilot']",
        "[class*='copilot'] [class*='message']",
        "[class*='chat'] [class*='message']"
      ]
    }
  ];

  const COMMON_CHAT_SELECTORS = [
    "[data-message-author-role]",
    "[data-testid*='conversation-turn']",
    "[data-testid*='conversation']",
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
    "[class*='conversation' i] [class*='message' i]",
    "[class*='chat' i] [class*='message' i]"
  ];
  const MAX_CONVERSATION_MESSAGES = 220;
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

  function createRegistry(context, helpers) {
    const adapters = [
      makePdfAdapter(),
      makeSearchAdapter(),
      ...AI_PLATFORMS.map((platform) => makeAiAdapter(platform)),
      makeProductAdapter(),
      makeDashboardAdapter(),
      makeRecipeAdapter(),
      makeResearchAdapter(),
      makeDocsAdapter(),
      makeDiscussionAdapter(),
      makeTutorialAdapter(),
      makeArticleAdapter(),
      makeGenericChatAdapter(),
      makeMixedAdapter()
    ];

    return {
      all: adapters,
      pick() {
        const winner = adapters.find((adapter) => safeCall(() => adapter.matches(context, helpers), false));
        return winner || adapters[adapters.length - 1];
      }
    };
  }

  function makePdfAdapter() {
    return {
      name: "pdf",
      family: "pdf",
      label: "PDF",
      matches(context) {
        return isPdfUrl(context.location.href)
          || Boolean(context.document.querySelector(".textLayer, [data-page-number], pdf-viewer, embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf'], iframe[src*='.pdf' i]"));
      },
      getRoot(context) {
        return context.document.querySelector("#viewer, #viewerContainer, pdf-viewer, main, [role='main']")
          || context.document.body;
      },
      collectUnits(root, context, helpers) {
        return collectPdfUnits(root, context, helpers);
      },
      classifyUnit(unit) {
        return unit.meta || {};
      },
      routeKey(context) {
        return getPdfDocumentRouteKey(context);
      },
      profile(context, helpers, root) {
        const units = collectPdfUnits(root, context, helpers);
        const words = units.reduce((sum, unit) => sum + helpers.countWords(unit.text || unit.anchor.textContent || ""), 0);
        const likelyPdf = isPdfUrl(context.location.href);
        const reason = words >= 24
          ? "Selectable PDF text found"
          : likelyPdf
            ? "PDF text is still loading, or this PDF has no selectable text"
            : "PDF text layer found";
        return {
          type: "pdf",
          label: "PDF",
          readingConfidence: words >= 24 ? 78 : 36,
          quietMode: words < 24,
          reason,
          quietReason: words >= 24 ? "" : reason,
          adapterName: "pdf"
        };
      },
      scoreAdjustments(section) {
        const meta = section.unitMeta || {};
        const text = `${section.title} ${section.text}`.toLowerCase();
        const pdfType = meta.pdfSectionType || classifyPdfSectionType(text, meta.pageNumber || section.pageNumber || 0, section.index || 0, section.wordCount || 0);
        const semanticSignal = /\b(abstract|summary|findings|conclusion|recommendation|key takeaways?|answer|results?|definition|defined as|steps?|procedure|methodology|methods?|main argument|central claim|key evidence|we argue|we found|findings show|results show)\b/.test(text);
        const citationHits = (text.match(/(\[[0-9,\s-]{1,18}\]|\([a-z][a-z-]+(?:\s+et\s+al\.)?,?\s+\d{4}[a-z]?\)|\bdoi:\s*\S+|https?:\/\/\S+|\bretrieved from\b|\bissn\b|\bisbn\b)/gi) || []).length;
        let score = 0;
        if (meta.pageNumber && meta.pageNumber <= 2 && !/\b(summary|abstract|conclusion|answer|recommendation|introduction|thesis|claim)\b/.test(text)) score -= 8;
        if (semanticSignal) score += 34;
        if (pdfType === "abstract") score += 28;
        if (pdfType === "results") score += 36;
        if (pdfType === "discussion") score += 22;
        if (pdfType === "conclusion") score += 34;
        if (pdfType === "methods") score += 24;
        if (pdfType === "form") score += 24;
        if (pdfType === "table") score += 18;
        if (pdfType === "signature") score += 12;
        if (pdfType === "introduction") score += 6;
        if (section.metrics && (section.metrics.codeBlocks > 0 || section.metrics.tables > 0)) score += 16;
        if (/\b(main argument|central claim|key evidence|we argue|we found|findings show|results show|definition|defined as|step by step|procedure|algorithm)\b/.test(text)) score += 24;
        if (pdfType === "works_cited" || /\b(references|bibliography|works cited|acknowledg(e)?ments)\b/.test(text)) score -= 58;
        if (pdfType === "appendix") score -= 36;
        if (pdfType === "toc") score -= 48;
        if (pdfType === "title_page") score -= 34;
        if (pdfType === "boilerplate") score -= 66;
        if (citationHits >= 3 && !semanticSignal && (section.wordCount || 0) < 220) score -= 46;
        if (/\b(copyright|all rights reserved|page \d+\s+of\s+\d+|footer|header|privacy policy|terms of service|downloaded from)\b/.test(text)) score -= 62;
        return score;
      }
    };
  }

  function makeAiAdapter(platform) {
    return {
      name: platform.name,
      family: "chat",
      label: platform.label,
      matches(context, helpers) {
        const host = context.location.hostname.toLowerCase();
        const path = `${context.location.pathname}${context.location.search}${context.location.hash}`;
        const hostMatch = platform.hosts.some((item) => host === item || host.endsWith(`.${item}`));
        const pathMatch = !platform.path || platform.path.test(path);

        if (hostMatch && pathMatch) {
          return true;
        }

        const selectors = platform.selectors.concat(COMMON_CHAT_SELECTORS);
        const hits = uniqueElements(selectors.flatMap((selector) => helpers.querySelectorAllDeep(context.document, selector))).slice(0, 18);
        const roleHits = hits.filter((node) => inferChatRole(node, platform, -1));
        return hostMatch && roleHits.length >= 2;
      },
      getRoot(context) {
        return context.document.querySelector("main, [role='main'], #__next, [data-testid*='conversation']")
          || context.document.body;
      },
      collectUnits(root, context, helpers) {
        return collectConversationUnits(root, context, helpers, platform);
      },
      classifyUnit(unit) {
        return unit.meta || {};
      },
      routeKey(context) {
        const hash = /^(#\/|#!|#chat|#conversation)/i.test(context.location.hash) ? context.location.hash : "";
        return `${context.location.origin}${context.location.pathname}${context.location.search}${hash}`;
      },
      profile() {
        return {
          type: "chat",
          label: platform.label,
          readingConfidence: 88,
          quietMode: false,
          reason: "Conversation structure found",
          adapterName: platform.name
        };
      },
      scoreAdjustments(section) {
        const meta = section.unitMeta || {};
        let score = 0;
        if (meta.role === "assistant") score += 44;
        if (meta.role === "user") score -= 64;
        if (meta.isLatestAssistant) score += 22;
        if (meta.answersLatestUser) score += 26;
        if (meta.isAfterUserCorrection) score += 30;
        if (meta.hasFinalAnswer) score += 32;
        if (meta.hasRevision) score += 24;
        if (meta.hasSummary) score += 18;
        if (meta.hasCompleteCode) score += 26;
        if (meta.hasRecommendation && (meta.hasFinalAnswer || meta.isLatestAssistant)) score += 24;
        if (meta.hasStepByStep) score += 18;
        if (meta.hasKeyExplanation) score += 12;
        if (meta.responsePriority) score += Math.round(Math.min(88, meta.responsePriority) * 0.55);
        if (meta.isSuperseded) score -= 62;
        if (meta.hasHedgedDraft) score -= 24;
        if (meta.hasFailedAnswer) score -= 64;
        if (meta.isShortConfirmation) score -= 54;
        if (meta.finalCode) score += 34;
        if (meta.kind === "code") score += 18;
        if (meta.topicShift) score += 10;
        if (meta.role === "assistant" && section.metrics && section.metrics.codeBlocks > 0) score += 20;
        return score;
      }
    };
  }

  function makeGenericChatAdapter() {
    return {
      name: "generic-chat",
      family: "chat",
      label: "AI chat",
      matches(context, helpers) {
        const host = context.location.hostname.toLowerCase();
        const path = `${context.location.pathname}${context.location.search}${context.location.hash}`;
        if (host === "github.com" && !/\/copilot|copilot-chat/i.test(path)) {
          return false;
        }
        const root = context.document.querySelector("main, [role='main'], article") || context.document.body;
        const articleLike = hasReadableArticleEvidence(context, helpers) || hasReadableLongformEvidence(context, helpers);
        const hits = uniqueElements(COMMON_CHAT_SELECTORS.flatMap((selector) => helpers.querySelectorAllDeep(root, selector))).slice(0, 40);
        const roleHits = hits.filter((node, index) => inferChatRole(node, null, index));
        const assistantish = roleHits.filter((node, index) => inferChatRole(node, null, index) === "assistant").length;
        const userish = roleHits.filter((node, index) => inferChatRole(node, null, index) === "user").length;
        const evidence = getConversationEvidence(context, helpers);
        const transcriptStyle = hasTranscriptStyleConversation(context, helpers);
        const hasGeneratedAnswerWords = /\b(regenerate|copy code|copy text|model|assistant|prompt|response|final answer|latest answer|corrected|correction|working version|conversation|chat|thread|reply|summary|final code)\b/i.test(
          helpers.cleanText((root.innerText || root.textContent || "").slice(0, 12000))
        );
        if (articleLike) {
          return false;
        }
        return (roleHits.length >= 3 && assistantish >= 1 && userish >= 1 && (hasGeneratedAnswerWords || evidence.score >= 3))
          || (evidence.score >= 4 && assistantish >= 1 && userish >= 1)
          || (evidence.score >= 3 && evidence.assistantCount >= 1 && evidence.userCount >= 1 && (evidence.codeBlocks > 0 || evidence.prefixCount >= 1 || evidence.fallbackCount >= 4))
          || (transcriptStyle && !articleLike);
      },
      getRoot(context) {
        return context.document.querySelector("main, [role='main']") || context.document.body;
      },
      collectUnits(root, context, helpers) {
        return collectConversationUnits(root, context, helpers, { name: "generic-chat", label: "AI chat", selectors: COMMON_CHAT_SELECTORS, hosts: ["generic"] });
      },
      classifyUnit(unit) {
        return unit.meta || {};
      },
      routeKey(context) {
        return `${context.location.origin}${context.location.pathname}${context.location.search}${context.location.hash}`;
      },
      profile() {
        return {
          type: "chat",
          label: "AI chat",
          readingConfidence: 82,
          quietMode: false,
          reason: "Conversation-like structure found",
          adapterName: "generic-chat"
        };
      },
      scoreAdjustments(section) {
        const meta = section.unitMeta || {};
        if (meta.role === "user") return -58;
        return (meta.role === "assistant" ? 32 : 0)
          + (meta.isLatestAssistant ? 18 : 0)
          + (meta.answersLatestUser ? 22 : 0)
          + (meta.isAfterUserCorrection ? 26 : 0)
          + (meta.hasRevision ? 18 : 0)
          + (meta.hasFinalAnswer ? 20 : 0)
          + (meta.hasSummary ? 14 : 0)
          + (meta.hasCompleteCode ? 20 : 0)
          + (meta.hasRecommendation && (meta.hasFinalAnswer || meta.isLatestAssistant) ? 18 : 0)
          + (meta.hasStepByStep ? 14 : 0)
          + (meta.hasKeyExplanation ? 10 : 0)
          + (meta.responsePriority ? Math.round(Math.min(88, meta.responsePriority) * 0.42) : 0)
          + (meta.isSuperseded ? -54 : 0)
          + (meta.hasFailedAnswer ? -56 : 0)
          + (meta.isShortConfirmation ? -46 : 0)
          + (meta.finalCode ? 30 : 0);
      }
    };
  }

  function collectPdfUnits(root, context, helpers) {
    const pages = getPdfPageContainers(root, helpers);
    const pageUnits = pages
      .map((page, index) => createPdfUnit(page, index, helpers))
      .filter(Boolean);
    const cachedPageUnits = getPdfCachedPageUnits(context, root, helpers);

    if (cachedPageUnits.length) {
      const pageWords = sumPdfUnitWords(pageUnits, helpers);
      const cachedWords = sumPdfUnitWords(cachedPageUnits, helpers);
      if (!pageUnits.length || cachedWords >= Math.max(80, pageWords * 1.2)) {
        return cachedPageUnits;
      }
    }

    if (pageUnits.length) {
      return pageUnits;
    }

    const ocrText = getPdfOcrText(context);
    if (ocrText) {
      const ocrUnits = synthesizePdfOcrUnits(ocrText, root, helpers);
      if (ocrUnits.length) {
        return ocrUnits;
      }
    }

    const text = helpers.cleanText(helpers.getReadableText(root));
    if (!isPdfUrl(context.location.href) || helpers.countWords(text) < 80) {
      return [];
    }

    const blocks = helpers.querySelectorAllDeep(root, "p, div, span")
      .filter((node) => helpers.isVisible(node))
      .filter((node) => !helpers.isLowValueElement(node))
      .filter((node) => helpers.countWords(helpers.cleanText(node.innerText || node.textContent || "")) >= 8)
      .slice(0, 120);

    if (!blocks.length) {
      return [{
        title: pdfTitleForPage(1, text),
        anchor: root,
        blocks: [root],
        level: 2,
        source: "pdf",
        text,
        meta: {
          kind: "pdf-page",
          pageNumber: 1,
          navigationTarget: "#page=1"
        }
      }];
    }

    const units = [];
    let bucket = [];
    let bucketWords = 0;

    blocks.forEach((block) => {
      const words = helpers.countWords(helpers.cleanText(block.innerText || block.textContent || ""));
      bucket.push(block);
      bucketWords += words;
      if (bucketWords >= 220) {
        units.push(createPdfBucketUnit(bucket, units.length, helpers));
        bucket = [];
        bucketWords = 0;
      }
    });

    if (bucket.length) {
      units.push(createPdfBucketUnit(bucket, units.length, helpers));
    }

    return units.filter(Boolean);
  }

  function getPdfOcrText(context) {
    const key = getPdfOcrRouteKey(context);
    const store = window.__PAGEPILOT_PDF_OCR_CACHE__;
    if (!store || !key) return "";
    const entry = store[key];
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    return String(entry.text || "");
  }

  function getPdfCachedPageUnits(context, root, helpers) {
    const key = getPdfOcrRouteKey(context);
    const store = window.__PAGEPILOT_PDF_OCR_CACHE__;
    const entry = store && key ? store[key] : null;
    const pages = entry && Array.isArray(entry.pages) ? entry.pages : [];
    return pages
      .flatMap((page, index) => createPdfCachedPageUnits(page, index, root, helpers, entry.source || "pdfjs"))
      .filter(Boolean);
  }

  function createPdfCachedPageUnit(page, index, root, helpers, source) {
    const units = createPdfCachedPageUnits(page, index, root, helpers, source);
    return units[0] || null;
  }

  function createPdfCachedPageUnits(page, index, root, helpers, source) {
    const text = helpers.cleanText(page && page.text || "");
    if (helpers.countWords(text) < 14) return [];
    const pageNumber = Number(page && page.pageNumber) || index + 1;
    const lineChunks = chunkPdfPageLines(page && page.lines, helpers);
    const chunks = lineChunks.length ? lineChunks : chunkPdfPageText(text, helpers);
    const usableChunks = (chunks.length ? chunks : [{ text, relativeY: 0.12 }])
      .map((chunk, chunkIndex) => createPdfCachedChunkUnit({
        pageNumber,
        chunkIndex,
        chunkCount: chunks.length || 1,
        chunk,
        root,
        helpers,
        source
      }))
      .filter(Boolean);
    return usableChunks;
  }

  function createPdfCachedChunkUnit(details) {
    const helpers = details.helpers;
    const text = helpers.cleanText(details.chunk && details.chunk.text || "");
    const words = helpers.countWords(text);
    if (words < 14) return null;
    const pageNumber = details.pageNumber;
    const chunkIndex = Number(details.chunkIndex) || 0;
    const relativeY = Number(details.chunk && details.chunk.relativeY);
    const relativeYStart = Number(details.chunk && details.chunk.relativeYStart);
    const relativeYEnd = Number(details.chunk && details.chunk.relativeYEnd);
    const safeRelativeY = Number.isFinite(relativeY)
      ? Math.max(0, Math.min(1, relativeY))
      : Math.max(0, Math.min(1, (chunkIndex + 0.2) / Math.max(1, details.chunkCount)));
    const safeRelativeYStart = Number.isFinite(relativeYStart)
      ? Math.max(0, Math.min(1, relativeYStart))
      : Math.max(0.02, safeRelativeY - 0.025);
    const safeRelativeYEnd = Number.isFinite(relativeYEnd)
      ? Math.max(0, Math.min(1, relativeYEnd))
      : Math.min(0.98, safeRelativeY + 0.09);
    const pdfSectionType = classifyPdfSectionType(text, pageNumber, chunkIndex, words);
    return {
      title: pdfTitleForPage(pageNumber, text),
      anchor: details.root,
      blocks: [details.root],
      level: 2,
      source: "pdf",
      text,
      meta: {
        kind: details.source === "ocr" ? "pdf-ocr" : "pdfjs-page",
        pageNumber,
        pdfSectionType,
        chunkIndex,
        chunkCount: Number(details.chunkCount) || 1,
        relativeY: safeRelativeY,
        relativeYStart: safeRelativeYStart,
        relativeYEnd: Math.max(safeRelativeYStart + 0.035, safeRelativeYEnd),
        lineStart: Number(details.chunk && details.chunk.lineStart) || 0,
        lineEnd: Number(details.chunk && details.chunk.lineEnd) || 0,
        excerpt: text.slice(0, 240),
        navigationTarget: `#page=${pageNumber}`,
        synthetic: true,
        pdfjs: details.source !== "ocr",
        ocr: details.source === "ocr",
        syntheticTop: pageNumber * 100000 + chunkIndex * 1000,
        words
      }
    };
  }

  function chunkPdfPageLines(lines, helpers) {
    const sourceLines = Array.isArray(lines)
      ? lines
          .map((line, index) => {
            const text = helpers.cleanText(line && line.text || "");
            if (!text) return null;
            const relativeY = Number(line && line.relativeY);
            const relativeYStart = Number(line && line.relativeYStart);
            const relativeYEnd = Number(line && line.relativeYEnd);
            const safeRelativeY = Number.isFinite(relativeY) ? Math.max(0, Math.min(1, relativeY)) : null;
            return {
              text,
              words: Number(line && line.words) || helpers.countWords(text),
              relativeY: safeRelativeY,
              relativeYStart: Number.isFinite(relativeYStart) ? Math.max(0, Math.min(1, relativeYStart)) : safeRelativeY,
              relativeYEnd: Number.isFinite(relativeYEnd) ? Math.max(0, Math.min(1, relativeYEnd)) : safeRelativeY,
              lineIndex: Number.isFinite(line && line.order) ? Number(line.order) : index
            };
          })
          .filter(Boolean)
      : [];
    if (!sourceLines.length) return [];

    const chunks = [];
    let bucket = [];
    let bucketWords = 0;
    const flush = () => {
      if (!bucket.length) return;
      const text = helpers.cleanText(bucket.map((line) => line.text).join(" "));
      const words = helpers.countWords(text);
      if (words >= 14) {
        const first = bucket[0];
        const last = bucket[bucket.length - 1];
        const relativeYValues = bucket
          .map((line) => line.relativeY)
          .filter((value) => Number.isFinite(value));
        const starts = bucket
          .map((line) => line.relativeYStart)
          .filter((value) => Number.isFinite(value));
        const ends = bucket
          .map((line) => line.relativeYEnd)
          .filter((value) => Number.isFinite(value));
        const center = relativeYValues.length
          ? relativeYValues.reduce((sum, value) => sum + value, 0) / relativeYValues.length
          : null;
        chunks.push({
          text,
          words,
          relativeY: center,
          relativeYStart: starts.length ? Math.min(...starts) : Number.isFinite(center) ? Math.max(0, center - 0.025) : null,
          relativeYEnd: ends.length ? Math.max(...ends) : Number.isFinite(center) ? Math.min(1, center + 0.09) : null,
          lineStart: first.lineIndex,
          lineEnd: last.lineIndex
        });
      }
      bucket = [];
      bucketWords = 0;
    };

    sourceLines.forEach((line) => {
      if (looksLikePdfSemanticBoundary(line.text) && bucket.length && bucketWords >= 24) {
        flush();
      }
      bucket.push(line);
      bucketWords += line.words;
      const endsThought = /[.!?:;)]$/.test(line.text);
      if (bucketWords >= 190 && (endsThought || bucketWords >= 260)) {
        flush();
      }
    });
    flush();
    return chunks;
  }

  function chunkPdfPageText(text, helpers) {
    const cleaned = helpers.cleanText(text);
    if (!cleaned) return [];
    const paragraphs = cleaned
      .split(/(?:\n\s*){2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((part) => helpers.cleanText(part))
      .filter(Boolean);
    const sourceParts = paragraphs.length ? paragraphs : cleaned.split(/\s+/).reduce((parts, word, index) => {
      const partIndex = Math.floor(index / 180);
      if (!parts[partIndex]) parts[partIndex] = [];
      parts[partIndex].push(word);
      return parts;
    }, []).map((words) => words.join(" "));
    const chunks = [];
    let bucket = [];
    let bucketWords = 0;
    const flush = () => {
      if (!bucket.length) return;
      const chunkText = helpers.cleanText(bucket.join(" "));
      if (helpers.countWords(chunkText) >= 14) {
        const center = Math.max(0.04, Math.min(0.96, (chunks.length + 0.2) / Math.max(1, sourceParts.length)));
        const span = Math.max(0.08, Math.min(0.22, 0.72 / Math.max(1, sourceParts.length)));
        chunks.push({
          text: chunkText,
          relativeY: center,
          relativeYStart: Math.max(0.02, center - span * 0.35),
          relativeYEnd: Math.min(0.98, center + span)
        });
      }
      bucket = [];
      bucketWords = 0;
    };
    sourceParts.forEach((part) => {
      const words = helpers.countWords(part);
      bucket.push(part);
      bucketWords += words;
      if (bucketWords >= 190) {
        flush();
      }
    });
    flush();
    return chunks;
  }

  function sumPdfUnitWords(units, helpers) {
    return (units || []).reduce((sum, unit) => {
      const meta = unit.meta || {};
      return sum + (Number(meta.words) || helpers.countWords(unit.text || ""));
    }, 0);
  }

  function getPdfOcrRouteKey(context) {
    return getPdfDocumentRouteKey(context);
  }

  function getPdfDocumentRouteKey(context) {
    return `${context.location.origin}${context.location.pathname}${context.location.search}`;
  }

  function synthesizePdfOcrUnits(text, root, helpers) {
    const cleaned = helpers.cleanText(text);
    if (!root || helpers.countWords(cleaned) < 24) {
      return [];
    }

    const paragraphs = cleaned
      .split(/(?:\n\s*){2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((line) => helpers.cleanText(line))
      .filter(Boolean);

    const chunks = [];
    let bucket = [];
    let bucketWords = 0;

    const flush = () => {
      if (!bucket.length) return;
      const chunkText = helpers.cleanText(bucket.join(" "));
      if (helpers.countWords(chunkText) >= 14) {
        chunks.push(chunkText);
      }
      bucket = [];
      bucketWords = 0;
    };

    paragraphs.forEach((paragraph) => {
      const words = helpers.countWords(paragraph);
      bucket.push(paragraph);
      bucketWords += words;
      if (bucketWords >= 180) {
        flush();
      }
    });
    flush();

    const sourceChunks = chunks.length ? chunks : [cleaned];
    return sourceChunks.map((chunkText, index) => {
      const pageNumber = index + 1;
      const words = helpers.countWords(chunkText);
      const relativeY = Math.max(0.04, Math.min(0.96, (index + 0.2) / Math.max(1, sourceChunks.length)));
      return {
        title: pdfTitleForPage(pageNumber, chunkText),
        anchor: root,
        blocks: [root],
        level: 2,
        source: "pdf",
        text: chunkText,
        meta: {
          kind: "pdf-ocr",
          pageNumber,
          pdfSectionType: classifyPdfSectionType(chunkText, pageNumber, index, words),
          navigationTarget: `#page=${pageNumber}`,
          ocr: true,
          synthetic: true,
          relativeY,
          relativeYStart: Math.max(0.02, relativeY - 0.025),
          relativeYEnd: Math.min(0.98, relativeY + 0.12),
          excerpt: chunkText.slice(0, 240),
          chunkIndex: index,
          chunkCount: sourceChunks.length,
          words
        }
      };
    });
  }

  function getPdfPageContainers(root, helpers) {
    const pageSelector = "[data-page-number], .page, [aria-label^='Page ' i], [id^='pageContainer'], [id^='page-']";
    const textLayerSelector = ".textLayer, [class*='textLayer' i], [data-page-number] .text";
    const pageCandidates = helpers.querySelectorAllDeep(root, `${pageSelector}, ${textLayerSelector}`)
      .map((node) => node.closest && (node.closest(pageSelector) || node.closest("[data-page-number]")) || node);

    return uniqueElements(pageCandidates)
      .filter((node) => node && !helpers.isLowValueElement(node))
      .filter((node) => helpers.countWords(helpers.cleanText(node.innerText || node.textContent || "")) >= 10)
      .sort((a, b) => helpers.getPageTop(a) - helpers.getPageTop(b))
      .slice(0, 220);
  }

  function createPdfUnit(page, index, helpers) {
    const text = helpers.cleanText(page.innerText || page.textContent || "");
    if (helpers.countWords(text) < 10) return null;
    const pageNumber = getPdfPageNumber(page, index);
    const words = helpers.countWords(text);
    const blocks = helpers.querySelectorAllDeep(page, "p, span, div, table, pre")
      .filter((node) => node === page || !node.contains(page))
      .filter((node) => helpers.countWords(helpers.cleanText(node.innerText || node.textContent || "")) >= 3 || node.matches && node.matches("table, pre"))
      .slice(0, 120);

    return {
      title: pdfTitleForPage(pageNumber, text),
      anchor: page,
      blocks: blocks.length ? blocks : [page],
      level: 2,
      source: "pdf",
      text,
      meta: {
        kind: "pdf-page",
        pageNumber,
        pdfSectionType: classifyPdfSectionType(text, pageNumber, index, words),
        navigationTarget: `#page=${pageNumber}`
      }
    };
  }

  function createPdfBucketUnit(bucket, index, helpers) {
    const text = helpers.cleanText(bucket.map((node) => node.innerText || node.textContent || "").join(" "));
    const words = helpers.countWords(text);
    if (words < 14) return null;
    const pageNumber = index + 1;
    return {
      title: pdfTitleForPage(pageNumber, text),
      anchor: bucket[0],
      blocks: bucket,
      level: 2,
      source: "pdf",
      text,
      meta: {
        kind: "pdf-page",
        pageNumber,
        pdfSectionType: classifyPdfSectionType(text, pageNumber, index, words),
        navigationTarget: `#page=${pageNumber}`
      }
    };
  }

  function getPdfPageNumber(page, index) {
    const candidates = [
      page.getAttribute && page.getAttribute("data-page-number"),
      page.getAttribute && page.getAttribute("data-page"),
      page.getAttribute && page.getAttribute("aria-label"),
      page.id || ""
    ].filter(Boolean).join(" ");
    const match = candidates.match(/\bpage(?:Container|-|\s+)?(\d+)\b/i) || candidates.match(/\b(\d{1,5})\b/);
    return match ? Number(match[1]) : index + 1;
  }

  function classifyPdfSectionType(text, pageNumber, index, wordCount) {
    const value = String(text || "").toLowerCase();
    const words = Number(wordCount) || countPdfWordsLocal(value);
    if (PDF_SECTION_PATTERNS.toc.test(value) || looksLikePdfTableOfContents(value)) return "toc";
    if (looksLikePdfFurniture(value, words)) return "boilerplate";
    if (isPdfCitationOnly(value, words)) return "works_cited";
    if (PDF_SECTION_PATTERNS.works_cited.test(value)) return "works_cited";
    if (PDF_SECTION_PATTERNS.appendix.test(value)) return "appendix";
    if (/\b(signature|signed|sincerely|respectfully submitted|authorized representative)\b/i.test(value)) return "signature";
    if (/\b(form|notice|application|claim number|case number|account number|date of birth|address|phone|email)\b/i.test(value)) return "form";
    if (/\b(table|figure|chart|column|row|total|subtotal)\b/i.test(value)) return "table";
    if (PDF_SECTION_PATTERNS.abstract.test(value)) return "abstract";
    if (PDF_SECTION_PATTERNS.results.test(value)) return "results";
    if (PDF_SECTION_PATTERNS.discussion.test(value)) return "discussion";
    if (PDF_SECTION_PATTERNS.conclusion.test(value)) return "conclusion";
    if (PDF_SECTION_PATTERNS.methods.test(value)) return "methods";
    if (PDF_SECTION_PATTERNS.introduction.test(value)) return "introduction";
    if ((Number(pageNumber) <= 1 || index === 0) && words < 150 && !/[.!?]\s+\w/.test(value)) return "title_page";
    return "";
  }

  function looksLikePdfTableOfContents(text) {
    const value = String(text || "");
    const dottedLines = (value.match(/\.{2,}\s*\d{1,4}\b/g) || []).length;
    const sectionLines = (value.match(/\b(chapter|section|figure|table)\s+\d+(?:\.\d+)?/gi) || []).length;
    return dottedLines >= 3 || sectionLines >= 5;
  }

  function looksLikePdfSemanticBoundary(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value || value.length > 90) return false;
    if (/^(abstract|summary|introduction|background|methods?|methodology|materials and methods|results?|findings?|discussion|conclusions?|recommendations?|limitations?|notice|signature|appendix|references|bibliography)\b[:.\s-]*$/i.test(value)) return true;
    if (/^\d+(?:\.\d+)*\s+(abstract|summary|introduction|methods?|results?|discussion|conclusions?|recommendations?|limitations?|notice)\b/i.test(value)) return true;
    const words = countPdfWordsLocal(value);
    return words >= 2 && words <= 9 && value === value.toUpperCase() && /[A-Z]/.test(value);
  }

  function looksLikePdfFurniture(text, words) {
    const value = String(text || "");
    return /\b(copyright|all rights reserved|page \d+\s+of\s+\d+|privacy policy|terms of service|downloaded from|journal homepage|licensed under|issn|isbn)\b/i.test(value)
      || /^\s*(page\s*)?\d{1,4}\s*(of\s*\d{1,4})?\s*$/i.test(value)
      || (words <= 18 && /\b(page|vol\.?|volume|issue|doi|journal|proceedings)\b/i.test(value));
  }

  function isPdfCitationOnly(text, words) {
    const value = String(text || "");
    const citationHits = (value.match(/(\[[0-9,\s-]{1,18}\]|\([a-z][a-z-]+(?:\s+et\s+al\.)?,?\s+\d{4}[a-z]?\)|\bdoi:\s*\S+|https?:\/\/\S+|\bretrieved from\b|\bissn\b|\bisbn\b)/gi) || []).length;
    const semanticSignal = /\b(abstract|summary|results?|findings?|methods?|discussion|conclusions?|recommendations?|definition|key evidence|main argument)\b/i.test(value);
    return citationHits >= 3 && words < 220 && !semanticSignal;
  }

  function countPdfWordsLocal(text) {
    const matches = String(text || "").match(/\b[\w'-]+\b/g);
    return matches ? matches.length : 0;
  }

  function pdfTitleForPage(pageNumber, text) {
    const firstSentence = helpersCleanPdfTitle(text);
    return firstSentence ? `Page ${pageNumber}: ${firstSentence}` : `Page ${pageNumber}`;
  }

  function helpersCleanPdfTitle(text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const sentence = cleaned.split(/[.!?]\s/)[0] || cleaned;
    return sentence.length <= 70 ? sentence : `${sentence.slice(0, 67).trim()}...`;
  }

  function collectConversationUnits(root, context, helpers, platform) {
    const selectors = uniqueStrings((platform.selectors || []).concat(COMMON_CHAT_SELECTORS));
    const selectorCandidates = uniqueElements(selectors.flatMap((selector) => helpers.querySelectorAllDeep(root, selector)))
      .map((node) => normalizeMessageElement(node, root, platform))
      .filter(Boolean);
    const fallbackCandidates = selectorCandidates.length >= 5
      ? []
      : getConversationFallbackNodes(root, helpers);
    const candidates = uniqueElements(selectorCandidates.concat(fallbackCandidates));
    const containers = uniqueElements(candidates)
      .filter((node) => helpers.isVisible(node))
      .filter((node) => !helpers.isLowValueElement(node))
      .filter((node) => helpers.countWords(helpers.cleanText(node.innerText || node.textContent)) >= 3)
      .sort((a, b) => helpers.getPageTop(a) - helpers.getPageTop(b));
    const originalOrder = new WeakMap();
    containers.forEach((node, index) => originalOrder.set(node, index));
    const messages = selectConversationMessages(removeNestedConversationDuplicates(containers, helpers), helpers, platform, originalOrder);
    const groups = groupConversationMessages(messages, helpers, platform, originalOrder);
    const assistantIndexes = groups
      .map((group, index) => ({ index, role: group.role || inferChatRole(group.anchor, platform, index) }))
      .filter((item) => item.role === "assistant")
      .map((item) => item.index);
    const lastAssistantIndex = assistantIndexes.length ? assistantIndexes[assistantIndexes.length - 1] : -1;

    const units = groups.map((group, index) => {
      const role = group.role || inferChatRole(group.anchor, platform, index);
      const text = group.text;
      const codeBlocks = group.codeBlocks;
      const hasFinalAnswer = /\b(final answer|final version|bottom line|in short|short answer|use this|here'?s the answer|the answer is)\b/i.test(text);
      const hasRevision = /\b(updated|correction|corrected|revised|instead|actually|replace that|use this version|latest)\b/i.test(text);
      const hasSummary = /\b(summary|recap|tl;dr|tldr|key takeaways?|bottom line|in short|what matters)\b/i.test(text);
      const hasCompleteCode = codeBlocks.length > 0 && /\b(final|complete|full|working version|copy and paste|paste this|drop-in)\b/i.test(text);
      const hasRecommendation = /\b(recommend|recommended|best option|best choice|go with|choose|use this|my recommendation)\b/i.test(text);
      const hasStepByStep = /\b(step-by-step|step by step|first,|second,|next,|then,|finally,|\d+\.\s+\S)\b/i.test(text);
      const hasKeyExplanation = /\b(here'?s why|why this works|the reason|because|key point|what matters|explanation)\b/i.test(text);
      const hasHedgedDraft = /\b(one possible|might|may not|rough|draft|first attempt|initial answer|not sure|probably)\b/i.test(text);
      const hasFailedAnswer = /\b(something went wrong|network error|failed to generate|try again|regenerate response|error occurred|generating response|thinking\.\.\.|loading response|still loading)\b/i.test(text)
        || /^(loading|thinking|generating)\.?\s*$/i.test(text.trim());
      const isShortConfirmation = role === "assistant" && helpers.countWords(text) <= 18 && /^(yes|no|ok|okay|sure|done|got it|sounds good|correct|thanks|you'?re welcome)[.! ]*$/i.test(text);
      const topicShift = role === "user" && /\b(new question|different topic|separate issue|also|another question|follow up)\b/i.test(text);
      const isLatestAssistant = index === lastAssistantIndex;

      return {
        title: getConversationTitle({ role, text, codeBlocks, hasFinalAnswer, hasRevision, hasSummary, isLatestAssistant, index }),
        anchor: group.anchor,
        blocks: group.blocks,
        level: role === "user" ? 2 : 3,
        source: "conversation",
        meta: {
          role,
          platform: platform.name,
          kind: "message",
          turnIndex: index,
          turnGroupId: group.id,
          hasFinalAnswer,
          hasRevision,
          hasSummary,
          hasCompleteCode,
          hasRecommendation,
          hasStepByStep,
          hasKeyExplanation,
          hasHedgedDraft,
          hasFailedAnswer,
          isShortConfirmation,
          topicShift,
          isLatestAssistant,
          codeBlockCount: codeBlocks.length
        }
      };
    });

    annotateConversationPriority(units);
    const finalCodeUnit = getFinalCodeUnit(units, helpers);
    if (finalCodeUnit) {
      units.push(finalCodeUnit);
    }

    return units.sort((a, b) => helpers.getPageTop(a.anchor) - helpers.getPageTop(b.anchor));
  }

  function normalizeMessageElement(node, root, platform) {
    if (!node || !node.closest) {
      return null;
    }

    const selector = [
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
      "[class*='conversation' i] [class*='message' i]",
      "[class*='chat' i] [class*='message' i]"
    ].join(",");
    const nearest = node.closest(selector) || node;

    if (root && !isWithinRoot(root, nearest)) {
      return null;
    }

    if (platform && platform.name === "perplexity") {
      return nearest.closest("article, section, [class*='answer' i], [class*='query' i]") || nearest;
    }

    return nearest;
  }

  function removeNestedConversationDuplicates(nodes, helpers) {
    const result = [];
    nodes.forEach((node) => {
      const textWords = helpers.countWords(helpers.cleanText(node.innerText || node.textContent || ""));
      const parentDuplicate = result.find((existing) => existing.contains(node));

      if (parentDuplicate) {
        const parentWords = helpers.countWords(helpers.cleanText(parentDuplicate.innerText || parentDuplicate.textContent || ""));
        if (textWords > parentWords * 0.74 && inferChatRole(node, null, -1)) {
          const index = result.indexOf(parentDuplicate);
          result.splice(index, 1, node);
        }
        return;
      }

      if (result.some((existing) => node.contains(existing))) {
        return;
      }

      result.push(node);
    });
    return result;
  }

  function selectConversationMessages(nodes, helpers, platform, originalOrder) {
    const sorted = nodes.slice().sort((a, b) => helpers.getPageTop(a) - helpers.getPageTop(b));
    if (sorted.length <= MAX_CONVERSATION_MESSAGES) {
      return sorted;
    }

    const head = sorted.slice(0, 24);
    const tail = sorted.slice(-170);
    const middle = sorted.slice(24, -170);
    const strongMiddle = middle
      .filter((node, index) => {
        const text = helpers.cleanText(node.innerText || node.textContent || "");
        const role = inferChatRole(node, platform, originalOrder && originalOrder.has(node) ? originalOrder.get(node) : index + 24);
        if (role !== "assistant") return false;
        return /\b(final answer|final version|correction|corrected|revised|summary|tl;dr|tldr|bottom line|use this|working version|copy(?: and paste)?|complete code)\b/i.test(text)
          || getCodeBlocks(node, helpers).length > 0;
      })
      .slice(-26);

    return uniqueElements(head.concat(strongMiddle, tail))
      .sort((a, b) => helpers.getPageTop(a) - helpers.getPageTop(b))
      .slice(-MAX_CONVERSATION_MESSAGES);
  }

  function groupConversationMessages(messages, helpers, platform, originalOrder) {
    const groups = [];
    messages.forEach((node, index) => {
      const role = inferChatRole(node, platform, originalOrder && originalOrder.has(node) ? originalOrder.get(node) : index);
      const text = helpers.cleanText(node.innerText || node.textContent || "");
      const top = helpers.getPageTop(node);
      const blocks = getConversationBlocks(node, helpers);
      const codeBlocks = getCodeBlocks(node, helpers);
      const wordCount = helpers.countWords(text);
      const last = groups[groups.length - 1];

      if (last && shouldMergeConversationFragment(last, { role, text, top, wordCount })) {
        last.nodes.push(node);
        last.text = helpers.cleanText(`${last.text} ${text}`);
        last.blocks = uniqueElements(last.blocks.concat(blocks));
        last.codeBlocks = uniqueElements(last.codeBlocks.concat(codeBlocks));
        last.lastTop = top;
        last.wordCount += wordCount;
        last.id = `turn-${groups.length - 1}-${helpers.hashText(last.text.slice(0, 280))}`;
        return;
      }

      groups.push({
        id: `turn-${groups.length}-${helpers.hashText(text.slice(0, 280))}`,
        role,
        anchor: node,
        nodes: [node],
        text,
        blocks,
        codeBlocks,
        firstTop: top,
        lastTop: top,
        wordCount
      });
    });
    return groups;
  }

  function shouldMergeConversationFragment(previous, next) {
    if (!previous || !next.role || previous.role !== next.role) {
      return false;
    }

    const distance = next.top - previous.lastTop;
    if (distance < 0 || distance > 900) {
      return false;
    }

    if (previous.wordCount > 260 && next.wordCount > 220) {
      return false;
    }

    return distance <= 360 || previous.wordCount < 80 || next.wordCount < 80;
  }

  function annotateConversationPriority(units) {
    const assistantUnits = units.filter((unit) => unit.meta && unit.meta.role === "assistant" && unit.meta.kind === "message");
    const userUnits = units.filter((unit) => unit.meta && unit.meta.role === "user" && unit.meta.kind === "message");
    const latestUser = userUnits.length ? userUnits[userUnits.length - 1] : null;
    const latestUserIndex = latestUser && latestUser.meta ? Number(latestUser.meta.turnIndex) : -1;
    const latestUserText = latestUser ? String(latestUser.text || "") : "";
    const latestUserIsCorrection = /\b(actually|correction|correct|wrong|not what i meant|instead|fix that|revise|update|change|use this|make it)\b/i.test(latestUserText);
    const authoritativeTurn = assistantUnits.reduce((latest, unit) => {
      const meta = unit.meta || {};
      if (meta.hasRevision || meta.hasFinalAnswer || meta.hasCompleteCode) {
        return Math.max(latest, meta.turnIndex);
      }
      return latest;
    }, -1);

    assistantUnits.forEach((unit) => {
      const meta = unit.meta;
      meta.isSuperseded = authoritativeTurn > -1 && meta.turnIndex < authoritativeTurn;
      let priority = 18;

      if (meta.isLatestAssistant) priority += 28;
      if (latestUserIndex > -1 && meta.turnIndex > latestUserIndex) {
        meta.answersLatestUser = true;
        priority += 30;
        if (latestUserIsCorrection) {
          meta.isAfterUserCorrection = true;
          meta.hasRevision = true;
          priority += 26;
        }
      } else if (latestUserIndex > meta.turnIndex && !meta.isLatestAssistant) {
        priority -= 18;
      }
      if (meta.hasRevision) priority += 34;
      if (meta.hasFinalAnswer) priority += 32;
      if (meta.hasCompleteCode) priority += 26;
      if (meta.hasSummary) priority += 18;
      if (meta.hasRecommendation && (meta.hasFinalAnswer || meta.isLatestAssistant)) priority += 22;
      if (meta.hasStepByStep) priority += 18;
      if (meta.hasKeyExplanation) priority += 12;
      if (meta.codeBlockCount > 0) priority += 14;
      if (meta.hasHedgedDraft) priority -= 24;
      if (meta.hasFailedAnswer) priority -= 56;
      if (meta.isShortConfirmation) priority -= 44;
      if (meta.isSuperseded) priority -= 42;

      meta.responsePriority = Math.max(0, Math.min(88, priority));
    });
  }

  function inferChatRole(element, platform, index) {
    if (!element) return "";
    const attrNames = ["data-message-author-role", "data-author", "data-role", "data-content", "role"];
    const attrText = attrNames.map((name) => element.getAttribute && element.getAttribute(name)).filter(Boolean).join(" ");
    const text = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    const firstLine = text.split(/\n+/)[0] || "";
    const trail = `${attrText} ${element.getAttribute && element.getAttribute("aria-label") || ""} ${element.id || ""} ${element.className || ""} ${firstLine}`.toLowerCase();

    if (/^\s*(user|human|you|prompt|question|q)\s*[:\-]/i.test(firstLine)) return "user";
    if (/^\s*(assistant|model|answer|response|reply|bot|a)\s*[:\-]/i.test(firstLine)) return "assistant";
    if (/\b(user|human|you|prompt|question)\b/.test(trail)) return "user";
    if (/\b(assistant|model|answer|response|reply|chatgpt|claude|gemini|copilot|grok|perplexity|bot)\b/.test(trail)) return "assistant";
    if (/\b(model-response|generated-answer)\b/.test(trail)) return "assistant";
    if (platform && /\b(markdown|prose|message-content)\b/.test(trail)) return "assistant";
    if (platform && platform.name === "gemini" && element.tagName && /MODEL-RESPONSE/i.test(element.tagName)) return "assistant";
    if (platform && platform.name === "gemini" && element.tagName && /USER-QUERY/i.test(element.tagName)) return "user";
    if (Number.isFinite(index) && index >= 0 && platform && platform.hosts) {
      return index % 2 === 0 ? "user" : "assistant";
    }
    return "";
  }

  function getConversationBlocks(node, helpers) {
    const blocks = helpers.querySelectorAllDeep(node, "h1, h2, h3, p, li, pre, blockquote, table, [role='listitem']")
      .filter((block) => helpers.isVisible(block))
      .filter((block) => helpers.countWords(helpers.cleanText(block.innerText || block.textContent)) >= 3 || block.matches("pre, table"))
      .slice(0, 80);
    return blocks.length ? blocks : [node];
  }

  function getCodeBlocks(node, helpers) {
    return helpers.querySelectorAllDeep(node, "pre, code")
      .filter((block) => helpers.isVisible(block))
      .filter((block) => block.matches("pre") || !block.closest("pre"))
      .filter((block) => helpers.cleanText(block.innerText || block.textContent).length >= 12)
      .slice(0, 20);
  }

  function getFinalCodeUnit(units, helpers) {
    const assistantUnits = units.filter((unit) => unit.meta && unit.meta.role === "assistant");
    const codeCandidates = assistantUnits
      .flatMap((unit) => getCodeBlocks(unit.anchor, helpers).map((code) => ({ code, unit })))
      .sort((a, b) => helpers.getPageTop(a.code) - helpers.getPageTop(b.code));

    if (!codeCandidates.length) {
      return null;
    }

    const last = codeCandidates[codeCandidates.length - 1];
    return {
      title: "Final code block",
      anchor: last.code,
      blocks: [last.code],
      level: 4,
      source: "conversation-code",
      meta: {
        role: "assistant",
        platform: last.unit.meta.platform,
        kind: "code",
        finalCode: true,
        isLatestAssistant: last.unit.meta.isLatestAssistant,
        answersLatestUser: Boolean(last.unit.meta.answersLatestUser),
        isAfterUserCorrection: Boolean(last.unit.meta.isAfterUserCorrection),
        turnIndex: last.unit.meta.turnIndex,
        turnGroupId: `${last.unit.meta.turnGroupId || last.unit.meta.turnIndex}-code`,
        isSuperseded: Boolean(last.unit.meta.isSuperseded),
        responsePriority: Math.max(34, Math.min(72, (last.unit.meta.responsePriority || 48) - 12))
      }
    };
  }

  function getConversationTitle(details) {
    const prefix = details.role === "user" ? "Question" : "Answer";
    const compact = summarize(details.text, details.role === "user" ? 72 : 76);

    if (details.hasRevision && details.isLatestAssistant) return "Latest corrected answer";
    if (details.hasFinalAnswer && /\b(recommend|recommended|best option|best choice|go with|choose)\b/i.test(details.text)) return "Final recommendation";
    if (details.hasFinalAnswer && details.isLatestAssistant) return "Final answer";
    if (details.hasSummary && details.isLatestAssistant) return "Latest summary";
    if (/\b(step-by-step|step by step|first,|second,|next,|then,|finally,|\d+\.\s+\S)\b/i.test(details.text) && details.isLatestAssistant) return "Step-by-step answer";
    if (details.codeBlocks.length && details.isLatestAssistant) return "Latest answer with code";
    if (details.isLatestAssistant) return "Latest answer";
    if (details.hasRevision) return "Revised answer";
    if (details.hasFinalAnswer) return "Final answer";
    if (details.hasSummary) return "Summary";
    return `${prefix}: ${compact}`;
  }

  function summarize(text, limit) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return "Untitled";
    return value.length <= limit ? value : `${value.slice(0, limit - 3).trim()}...`;
  }

  function makeSearchAdapter() {
    return {
      name: "search-results",
      family: "search_results",
      label: "Search Results",
      type: "search_results",
      matches(context, helpers) {
        const host = context.location.hostname.toLowerCase();
        const path = context.location.pathname.toLowerCase();
        const sample = getSample(context, helpers);
        const searchHost = /\b(google|bing|duckduckgo|yahoo|ecosia|kagi|brave)\b/.test(host);
        return searchHost && (path.includes("search") || path.includes("results") || context.location.search.includes("q="))
          || Boolean(context.document.querySelector("[role='search'], input[type='search']"))
            && /\b(search results|results for|all results|filters|sort by)\b/i.test(sample);
      },
      getRoot(context) {
        return context.document.querySelector("#search, #rso, main, [role='main'], #b_results, #web, [data-testid*='results' i]")
          || context.document.body;
      },
      collectUnits(root, context, helpers) {
        return collectSearchUnits(root, context, helpers);
      },
      classifyUnit(unit) {
        return unit.meta || {};
      },
      routeKey(context) {
        return `${context.location.origin}${context.location.pathname}${context.location.search}`;
      },
      profile(context, helpers, root) {
        const units = collectSearchUnits(root, context, helpers);
        const subtype = inferSearchSubtype(context, helpers, units);
        return {
          type: "search_results",
          label: "Search Results",
          readingConfidence: units.length ? 72 : 42,
          quietMode: !units.length,
          reason: units.length
            ? "Search results found. SkimRoute works best after you open a result, but it can still help you focus the AI Overview or top result areas."
            : "This page is mostly search results, so there is not enough long-form content to map. Open a result for a full Page Map.",
          quietReason: units.length
            ? ""
            : "This page is mostly search results, so there is not enough long-form content to map. Open a result for a full Page Map.",
          searchSubtype: subtype,
          adapterName: "search-results"
        };
      },
      scoreAdjustments(section) {
        const meta = section.unitMeta || {};
        const text = `${section.title} ${section.text}`.toLowerCase();
        let score = 0;
        if (meta.searchBlockType === "ai_overview") score += 96;
        if (meta.searchBlockType === "answer") score += 88;
        if (meta.searchBlockType === "top_results") score += 70;
        if (meta.searchBlockType === "people_also_ask") score += 58;
        if (meta.searchBlockType === "sources") score += 54;
        if (meta.searchBlockType === "videos") score += 42;
        if (meta.searchBlockType === "shopping") score += 34;
        if (meta.searchBlockType === "maps") score += 34;
        if (/\b(ai overview|overview from ai|generative ai|answer|featured snippet|people also ask|top result|sources?)\b/.test(text)) score += 18;
        if (/\b(sponsored|advertisement|ad\s*·|shop now|buy now|checkout|sign in|privacy|settings)\b/.test(text)) score -= 60;
        if ((section.wordCount || 0) < 12 && !/ai overview|people also ask|videos|shopping|maps/i.test(section.title || "")) score -= 24;
        return score;
      }
    };
  }

  function collectSearchUnits(root, context, helpers) {
    const doc = context.document;
    const candidates = [];
    const addCandidate = (element, type, title) => {
      const block = normalizeSearchBlock(element, root, helpers);
      if (!block) return;
      const text = helpers.cleanText(block.innerText || block.textContent || "");
      const words = helpers.countWords(text);
      if (words < 8 && !["people_also_ask", "videos", "shopping", "maps"].includes(type)) return;
      candidates.push({
        element: block,
        type,
        title,
        text,
        words,
        top: helpers.getPageTop(block)
      });
    };

    [
      "[aria-label*='AI Overview' i]",
      "[data-attrid*='SGE' i]",
      "[data-attrid*='ai-overview' i]",
      "[class*='ai-overview' i]",
      "[data-testid*='ai-overview' i]"
    ].forEach((selector) => {
      helpers.querySelectorAllDeep(doc, selector).forEach((node) => addCandidate(node, "ai_overview", "AI Overview"));
    });

    helpers.querySelectorAllDeep(root, "h1, h2, h3, [role='heading'], div, section, article")
      .slice(0, 420)
      .forEach((node) => {
        if (!helpers.isVisible(node) || helpers.isLowValueElement(node)) return;
        const text = helpers.cleanText(node.innerText || node.textContent || "");
        const head = text.slice(0, 180);
        if (/^(ai overview|overview from ai|generative ai)\b/i.test(head)) addCandidate(node, "ai_overview", "AI Overview");
        else if (/^(sources?|source links?|web sources?)\b/i.test(head)) addCandidate(node, "sources", "Sources");
        else if (/^(people also ask|related questions)\b/i.test(head)) addCandidate(node, "people_also_ask", "People also ask");
        else if (/^(videos?|video results?)\b/i.test(head)) addCandidate(node, "videos", "Videos");
        else if (/^(shopping|products?|popular products?)\b/i.test(head)) addCandidate(node, "shopping", "Shopping");
        else if (/^(maps?|local results?|places)\b/i.test(head)) addCandidate(node, "maps", "Maps");
      });

    [
      "#rso > div",
      "#search .g",
      "#search .MjjYud",
      "#b_results > li.b_algo",
      "#b_results > li",
      "[data-testid*='result' i]",
      "[class*='result' i] article",
      "article"
    ].forEach((selector) => {
      helpers.querySelectorAllDeep(root, selector).slice(0, 30).forEach((node) => {
        if (!helpers.isVisible(node) || helpers.isLowValueElement(node)) return;
        const text = helpers.cleanText(node.innerText || node.textContent || "");
        const words = helpers.countWords(text);
        if (words < 10) return;
        const type = classifySearchBlockType(node, text);
        addCandidate(node, type || "top_results", searchTitleForType(type || "top_results"));
      });
    });

    const unique = [];
    const seen = new Set();
    candidates
      .filter((item) => item.element && helpers.isVisible(item.element))
      .sort((a, b) => searchTypePriority(a.type) - searchTypePriority(b.type) || a.top - b.top)
      .forEach((item) => {
        const key = `${item.type}:${Math.round(item.top / 60)}:${helpers.hashText(item.text.slice(0, 160))}`;
        if (seen.has(key)) return;
        if (unique.some((existing) => existing.element === item.element || existing.element.contains(item.element))) return;
        seen.add(key);
        unique.push(item);
      });

    return unique.slice(0, 18).map((item, index) => ({
      title: item.title || searchTitleForType(item.type),
      anchor: item.element,
      blocks: getSearchBlocks(item.element, helpers),
      level: item.type === "top_results" ? 3 : 2,
      source: "search",
      text: item.text,
      meta: {
        kind: "search-block",
        searchBlockType: item.type,
        searchPriority: searchTypePriority(item.type),
        searchSubtype: inferSearchSubtype(context, helpers, unique),
        resultIndex: index,
        diagnosticReason: searchDiagnosticReason(item.type)
      }
    }));
  }

  function normalizeSearchBlock(element, root, helpers) {
    if (!element || !element.closest || !root) return null;
    const block = element.closest([
      "[data-attrid*='SGE' i]",
      "[aria-label*='AI Overview' i]",
      "#rso > div",
      "#search .g",
      "#search .MjjYud",
      "#b_results > li",
      "article",
      "section",
      "[role='region']",
      "[role='listitem']",
      "div"
    ].join(", ")) || element;
    if (!isWithinRoot(root, block) && root !== block) return null;
    if (helpers.isLowValueElement(block)) return null;
    return block;
  }

  function getSearchBlocks(element, helpers) {
    const blocks = helpers.querySelectorAllDeep(element, "h1, h2, h3, p, li, a, div[role='heading'], [role='listitem']")
      .filter((node) => helpers.isVisible(node))
      .filter((node) => helpers.countWords(helpers.cleanText(node.innerText || node.textContent || "")) >= 3)
      .filter((node, index, list) => !list.some((other, otherIndex) => otherIndex < index && other.contains(node)))
      .slice(0, 40);
    return blocks.length ? blocks : [element];
  }

  function classifySearchBlockType(element, text) {
    const value = `${element && (element.id || "") || ""} ${element && (element.className || "") || ""} ${text || ""}`.toLowerCase();
    if (/\b(ai overview|overview from ai|generative ai|search labs)\b/.test(value)) return "ai_overview";
    if (/^(sources?|source links?)\b/i.test(text || "") || /\b(source|sources)\b.{0,80}\b(ai overview|overview)\b/i.test(text || "")) return "sources";
    if (/\b(people also ask|related questions)\b/.test(value)) return "people_also_ask";
    if (/\b(videos?|youtube|watch)\b/.test(value)) return "videos";
    if (/\b(shopping|products?|price|\$\d+|buy now|add to cart)\b/.test(value)) return "shopping";
    if (/\b(maps?|local results?|directions|near me|places)\b/.test(value)) return "maps";
    if (/\b(featured snippet|answer box|quick answer)\b/.test(value)) return "answer";
    return "top_results";
  }

  function searchTitleForType(type) {
    const labels = {
      ai_overview: "AI Overview",
      answer: "Search answer",
      sources: "Sources",
      people_also_ask: "People also ask",
      top_results: "Top results",
      videos: "Videos",
      shopping: "Shopping",
      maps: "Maps"
    };
    return labels[type] || "Search results";
  }

  function searchTypePriority(type) {
    const priorities = {
      ai_overview: 0,
      answer: 1,
      sources: 2,
      top_results: 3,
      people_also_ask: 4,
      videos: 5,
      shopping: 6,
      maps: 7
    };
    return Number.isFinite(priorities[type]) ? priorities[type] : 9;
  }

  function inferSearchSubtype(context, helpers, units) {
    const sample = getSample(context, helpers).slice(0, 6000);
    const unitTypes = Array.isArray(units) ? units.map((unit) => unit.type || unit.meta && unit.meta.searchBlockType || "") : [];
    if (unitTypes.includes("ai_overview") || /\b(ai overview|overview from ai|generative ai)\b/i.test(sample)) return "ai_overview";
    if (/\b(featured snippet|answer box|quick answer|people also ask)\b/i.test(sample)) return "answer_page";
    if (unitTypes.length <= 1) return "low_map_search";
    return "standard_results";
  }

  function searchDiagnosticReason(type) {
    const reasons = {
      ai_overview: "AI Overview is the highest-value search block",
      answer: "Search answer block gives a direct answer",
      sources: "Sources support the AI Overview or answer block",
      people_also_ask: "People also ask contains follow-up questions",
      top_results: "Top organic result area is useful after search summaries",
      videos: "Video result block may be useful for this query",
      shopping: "Shopping block is a specialized result area",
      maps: "Map/local block is a specialized result area"
    };
    return reasons[type] || "Search result block";
  }

  function makeProductAdapter() {
    return makeProfileAdapter({
      name: "product",
      type: "shopping_product",
      label: "Product",
      confidence: 24,
      quiet: true,
      reason: "Product pages are better left quiet",
      matches(context, helpers) {
        const sample = getSample(context, helpers);
        const schema = getSchemaText(context.document);
        const hostPath = `${context.location.hostname} ${context.location.pathname}`.toLowerCase();
        const articleEvidence = hasReadableArticleEvidence(context, helpers) || hasReadableLongformEvidence(context, helpers);
        const conversationEvidence = hasReadableConversationEvidence(context, helpers);
        const commerceNodes = context.document.querySelectorAll("[itemtype*='Product' i], [class*='product' i], [class*='price' i], [class*='cart' i], [data-testid*='price' i], [data-testid*='cart' i]").length;
        const commercialHits = countPatternHits(sample.toLowerCase(), /\b(add to cart|buy now|out of stock|in stock|shipping|returns?|sku|checkout|customers also bought|recommended products?|\$\d+)\b/g);
        const commercePath = /\b(product|products|shop|store|cart|checkout|sku)\b/i.test(hostPath);
        const schemaLooksProduct = /\b@type\b[^\n]{0,80}\bproduct\b/i.test(schema);
        const strongCommerce = commerceNodes >= 4 || commercialHits >= 4 || (commercePath && commercialHits >= 3);
        if (articleEvidence || conversationEvidence) {
          return false;
        }
        return (schemaLooksProduct && commercialHits >= 1)
          || commerceNodes >= 3
          || strongCommerce;
      }
    });
  }

  function makeDashboardAdapter() {
    return makeProfileAdapter({
      name: "app-dashboard",
      type: "app_dashboard",
      label: "App",
      confidence: 22,
      quiet: true,
      reason: "App screens are better left quiet",
      matches(context, helpers) {
        const doc = context.document;
        const hostPath = `${context.location.hostname} ${context.location.pathname}`.toLowerCase();
        const controls = doc.querySelectorAll("input, textarea, select, button, [role='button'], [role='tab']").length;
        const navs = doc.querySelectorAll("nav, aside, [role='navigation'], [class*='sidebar' i]").length;
        const paragraphs = doc.querySelectorAll("article p, main p, p").length;
        const sampleWords = helpers.countWords(getSample(context, helpers));
        const appShell = Boolean(doc.querySelector("[class*='dashboard' i], [class*='settings' i], [class*='app-shell' i], [data-testid*='dashboard' i], [role='tablist'], [role='toolbar']"));
        const appPath = /\b(dashboard|admin|account|settings|billing|profile|reports?|analytics|console|workspace)\b/i.test(hostPath);
        const readableArticle = hasReadableArticleEvidence(context, helpers) || hasReadableLongformEvidence(context, helpers);
        const conversationEvidence = hasReadableConversationEvidence(context, helpers);
        return ((appShell && !readableArticle && !conversationEvidence)
          || (appPath && controls >= 8 && paragraphs < 20 && !conversationEvidence)
          || (controls >= 28 && navs >= 1 && paragraphs < 14 && sampleWords < 1400 && !conversationEvidence))
          && !readableArticle
          && !conversationEvidence;
      }
    });
  }

  function makeRecipeAdapter() {
    return makeProfileAdapter({
      name: "recipe",
      type: "recipe",
      label: "Recipe",
      confidence: 86,
      quiet: false,
      reason: "Recipe structure found",
      matches(context, helpers) {
        const sample = getSample(context, helpers);
        const schema = getSchemaText(context.document);
        return schema.includes("recipe")
          || /\b(recipe|ingredients|instructions|prep time|cook time|servings|nutrition)\b/i.test(`${context.location.pathname} ${sample}`);
      },
      scoreAdjustments(section) {
        const text = `${section.title} ${section.text}`.toLowerCase();
        if (/\b(instructions|directions|method|steps|ingredients|recipe card|cook time|prep time|tips|servings)\b/.test(text)) return 58;
        if (section.index <= 1 && !/\b(instructions|ingredients|recipe card)\b/.test(text)) return -48;
        if (/\b(nutrition|comments?|reviews?|related recipes?|subscribe|newsletter)\b/.test(text)) return -34;
        return 0;
      }
    });
  }

  function makeResearchAdapter() {
    return makeProfileAdapter({
      name: "research",
      type: "research",
      label: "Research",
      confidence: 84,
      quiet: false,
      reason: "Research structure found",
      matches(context, helpers) {
        const host = context.location.hostname.toLowerCase();
        const sample = getSample(context, helpers);
        return host.includes("arxiv.org")
          || host.includes("doi.org")
          || Boolean(context.document.querySelector("meta[name='citation_title'], meta[name='dc.Title']"))
          || (/\babstract\b/i.test(sample.slice(0, 2200)) && /\b(references|methodology|results|discussion|doi)\b/i.test(sample));
      },
      scoreAdjustments(section) {
        const text = `${section.title} ${section.text}`.toLowerCase();
        if (/\b(abstract|summary|findings|results|conclusion|discussion|limitations|key evidence|main claim|central claim|we found|we argue)\b/.test(text)) return 48;
        if (/\b(methods?|methodology|data and methods|materials and methods)\b/.test(text)) return 24;
        if (/\b(references|bibliography|acknowledg(e)?ments|appendix)\b/.test(text)) return -70;
        return 0;
      }
    });
  }

  function makeDocsAdapter() {
    return makeProfileAdapter({
      name: "docs",
      type: "docs",
      label: "Docs",
      confidence: 86,
      quiet: false,
      reason: "Documentation structure found",
      matches(context, helpers) {
        const hostPath = `${context.location.hostname} ${context.location.pathname}`.toLowerCase();
        const sample = getSample(context, helpers);
        return /\b(docs?|documentation|developer|reference|api|sdk)\b/i.test(hostPath)
          || Boolean(context.document.querySelector("[class*='docs' i], [class*='api-reference' i], [class*='docsearch' i], [data-theme='docs']"))
          || /\b(api reference|quickstart|installation|parameters|examples|usage)\b/i.test(sample.slice(0, 3200));
      },
      scoreAdjustments(section) {
        const text = `${section.title} ${section.text}`.toLowerCase();
        let score = 0;
        if (/\b(quickstart|getting started|usage|example|examples|installation|install|parameters|request|response|api reference|troubleshooting|common errors?|authentication|configuration)\b/.test(text)) score += 46;
        if (section.metrics && section.metrics.codeBlocks > 0) score += 26;
        if (/\b(changelog|release notes|community|support|pricing|blog|newsletter|case studies)\b/.test(text)) score -= 36;
        return score;
      }
    });
  }

  function makeDiscussionAdapter() {
    return makeProfileAdapter({
      name: "discussion",
      type: "discussion",
      label: "Discussion",
      confidence: 66,
      quiet: false,
      reason: "Discussion structure found",
      matches(context) {
        const host = context.location.hostname.toLowerCase();
        return host.includes("reddit.com")
          || host.includes("stackoverflow.com")
          || Boolean(context.document.querySelector("[data-testid='post-container'], shreddit-comment, faceplate-tracker[source='post'], .answercell, .js-post-body"));
      },
      scoreAdjustments(section) {
        const text = `${section.title} ${section.text}`.toLowerCase();
        if (/\b(solution|solved|answer|edit:|update:|top comment|accepted answer|works for me|fixed)\b/.test(text)) return 46;
        if (/\b(automoderator|rules|removed|deleted|sort by|log in|sign up)\b/.test(text)) return -74;
        return 0;
      }
    });
  }

  function makeTutorialAdapter() {
    return makeProfileAdapter({
      name: "tutorial",
      type: "tutorial",
      label: "Tutorial",
      confidence: 82,
      quiet: false,
      reason: "Tutorial structure found",
      matches(context, helpers) {
        const sample = getSample(context, helpers);
        return /\b(how to|tutorial|walkthrough|guide|step by step|learn how|setup|install)\b/i.test(
          `${context.document.title} ${context.location.pathname} ${sample.slice(0, 3200)}`
        );
      },
      scoreAdjustments(section) {
        const text = `${section.title} ${section.text}`.toLowerCase();
        let score = 0;
        if (/\b(step by step|how to|example|setup|install|fix|solution|troubleshooting|copy and paste|run this|configure)\b/.test(text)) score += 42;
        if (section.metrics && section.metrics.codeBlocks > 0) score += 24;
        if (section.index <= 1 && section.wordCount > 260 && !section.metrics.matched.conciseAnswer) return -24;
        if (/\b(comments?|related posts?|newsletter|subscribe|author bio|about the author)\b/.test(text)) score -= 48;
        return score;
      }
    });
  }

  function makeArticleAdapter() {
    return makeProfileAdapter({
      name: "article",
      type: "article",
      label: "Article",
      confidence: 74,
      quiet: false,
      reason: "Readable article structure found",
      matches(context, helpers) {
        const meta = getMeta(context.document, "og:type").toLowerCase();
        const root = context.document.querySelector("article") || context.document.querySelector("main") || context.document.body;
        const words = helpers.countWords(helpers.getReadableText(root).slice(0, 12000));
        const headings = helpers.querySelectorAllDeep(root, "h1, h2, h3").length;
        const paragraphs = root.querySelectorAll ? root.querySelectorAll("p").length : 0;
        const linkWords = helpers.countWords(Array.from(root.querySelectorAll ? root.querySelectorAll("a") : []).map((link) => link.innerText || "").join(" "));
        const linkDensity = words ? linkWords / words : 0;
        return meta.includes("article")
          || Boolean(context.document.querySelector("article"))
          || (words >= 520 && headings >= 3)
          || (words >= 420 && paragraphs >= 4 && linkDensity < 0.34)
          || (words >= 620 && headings >= 2 && paragraphs >= 4 && linkDensity < 0.42);
      },
      scoreAdjustments(section) {
        const text = `${section.title} ${section.text}`.toLowerCase();
        let score = 0;
        if (/\b(takeaway|summary|conclusion|answer|what matters|bottom line|main claim|key evidence|results?|findings?|recommended)\b/.test(text)) score += 34;
        if (section.index <= 1 && section.wordCount > 260 && !section.metrics.matched.conciseAnswer) score -= 22;
        if (/\b(related posts?|recommended articles?|comments?|newsletter|subscribe|author bio|about the author|advertisement|sponsored)\b/.test(text)) score -= 50;
        return score;
      }
    });
  }




function makeMixedAdapter() {
  return {
    name: "mixed",
    family: "generic",
    label: "Page",
    matches() {
      return true;
    },
    getRoot(context) {
      return context.document.querySelector("main, [role='main'], article") || context.document.body;
    },
    collectUnits(root, context, helpers) {
      const conversationEvidence = getConversationEvidence(context, helpers);
      const chatLike = hasReadableConversationEvidence(context, helpers)
        || conversationEvidence.score >= 3
        || (conversationEvidence.score >= 2 && (conversationEvidence.codeBlocks > 0 || conversationEvidence.prefixCount >= 1 || conversationEvidence.fallbackCount >= 4));
      if (!chatLike) {
        return null;
      }
      return collectConversationUnits(root, context, helpers, { name: "mixed", label: "AI chat", selectors: COMMON_CHAT_SELECTORS, hosts: ["generic"] });
    },
    classifyUnit(unit) {
      return unit.meta || {};
    },
    routeKey(context) {
      return `${context.location.origin}${context.location.pathname}${context.location.search}`;
    },
    profile(context, helpers, root) {
      const words = helpers.countWords(helpers.getReadableText(root).slice(0, 12000));
      const headings = helpers.querySelectorAllDeep(root, "h1, h2, h3").length;
      const controls = context.document.querySelectorAll("input, textarea, select, button").length;
      const links = root.querySelectorAll ? root.querySelectorAll("a").length : 0;
      const articleEvidence = hasReadableArticleEvidence(context, helpers) || hasReadableLongformEvidence(context, helpers);
      const conversationEvidence = getConversationEvidence(context, helpers);
      const chatLike = hasReadableConversationEvidence(context, helpers)
        || conversationEvidence.score >= 3
        || (conversationEvidence.score >= 2 && (conversationEvidence.codeBlocks > 0 || conversationEvidence.prefixCount >= 1 || conversationEvidence.fallbackCount >= 4));
      const quietEvidence = getMixedQuietEvidence(context, helpers, root, { words, headings, controls, links });
      const articleLike = (articleEvidence && quietEvidence <= 4)
        || (words >= 520 && headings >= 1 && controls <= 32 && links < Math.max(36, headings * 14) && quietEvidence <= 5);
      const readableLongform = words >= 420 && headings >= 1 && controls <= 32 && links < 42 && quietEvidence <= 5;
      const quiet = (!articleLike && !chatLike && (
        words < 320
        || (headings < 2 && !readableLongform)
        || controls > 34
        || links > Math.max(34, headings * 12)
      ));

      if (chatLike && !quiet) {
        return {
          type: "chat",
          label: "AI chat",
          readingConfidence: Math.min(94, 58 + conversationEvidence.score * 8 + (conversationEvidence.prefixCount >= 2 ? 6 : 0) + (conversationEvidence.codeBlocks > 0 ? 4 : 0)),
          quietMode: false,
          reason: "Conversation structure found",
          adapterName: "mixed"
        };
      }

      if ((articleLike || readableLongform) && !quiet) {
        return {
          type: "article",
          label: "Page",
          readingConfidence: Math.min(90, articleEvidence ? 70 : 58),
          quietMode: false,
          reason: "Readable sections found",
          adapterName: "mixed"
        };
      }

      return {
        type: quiet ? "low_structure" : "article",
        label: "Page",
        readingConfidence: quiet ? 32 : 52,
        quietMode: quiet,
        reason: quiet ? "Nothing strong to map here" : "Readable sections found",
        adapterName: "mixed"
      };
    },
    scoreAdjustments() {
      return 0;
    }
  };
}

function getMixedQuietEvidence(context, helpers, root, details) {
  const sample = helpers.cleanText(helpers.getReadableText(root).slice(0, 9000)).toLowerCase();
  const paragraphs = root.querySelectorAll ? root.querySelectorAll("article p, main p, p").length : 0;
  const linkDensity = details.words ? details.links / Math.max(1, details.words) : 0;
  const resultItems = root.querySelectorAll
    ? root.querySelectorAll("[role='listitem'], article h3 a, [data-testid*='result' i], [class*='result' i], [class*='listing' i]").length
    : 0;
  const appShellNodes = context.document.querySelectorAll
    ? context.document.querySelectorAll("[class*='dashboard' i], [class*='settings' i], [class*='app-shell' i], [class*='workspace' i], [role='tablist'], [role='toolbar'], [aria-label*='sidebar' i]").length
    : 0;
  const commerceNodes = context.document.querySelectorAll
    ? context.document.querySelectorAll("[itemtype*='Product' i], [class*='product' i], [class*='price' i], [class*='cart' i], [data-testid*='price' i], [data-testid*='cart' i]").length
    : 0;
  const commercialHits = countPatternHits(sample, /\b(add to cart|buy now|checkout|shipping|returns?|in stock|out of stock|sku|price|\$\d+|customers also bought|recommended products?)\b/g);
  const resultHits = countPatternHits(sample, /\b(search results|results for|all results|filters|sort by|sponsored result|people also ask)\b/g);
  const appHits = countPatternHits(sample, /\b(dashboard|settings|billing|workspace|analytics|reports?|saved views?|export|permissions|account)\b/g);

  return (linkDensity > 0.34 ? 2 : 0)
    + (linkDensity > 0.52 ? 2 : 0)
    + (details.controls > 28 ? 2 : 0)
    + (details.controls > 48 ? 2 : 0)
    + (resultItems > 18 && linkDensity > 0.22 ? 2 : 0)
    + (commerceNodes >= 3 || commercialHits >= 2 ? 2 : 0)
    + (appShellNodes >= 2 || (appHits >= 5 && details.controls > 14) ? 2 : 0)
    + (resultHits >= 1 && resultItems > 10 ? 2 : 0)
    + (details.links > Math.max(42, details.headings * 14) && paragraphs < 12 ? 1 : 0);
}


  function makeProfileAdapter(config) {
    return {
      name: config.name,
      family: config.type,
      label: config.label,
      matches: config.matches,
      getRoot(context) {
        return context.document.querySelector("article, main, [role='main'], .post-content, .entry-content, .article-content, .content, #content")
          || context.document.body;
      },
      collectUnits() {
        return null;
      },
      classifyUnit(unit) {
        return unit.meta || {};
      },
      routeKey(context) {
        return `${context.location.origin}${context.location.pathname}${context.location.search}`;
      },
      profile() {
        return {
          type: config.type,
          label: config.label,
          readingConfidence: config.confidence,
          quietMode: config.quiet,
          reason: config.reason,
          adapterName: config.name
        };
      },
      scoreAdjustments: config.scoreAdjustments || function () {
        return 0;
      }
    };
  }

  function getSample(context, helpers) {
    const root = context.document.querySelector("main, article, [role='main']") || context.document.body;
    return helpers.cleanText(`${context.document.title || ""} ${helpers.getReadableText(root).slice(0, 7000)}`);
  }

  function getSchemaText(documentRef) {
    return Array.from(documentRef.querySelectorAll("[type='application/ld+json']"))
      .map((node) => node.textContent || "")
      .join(" ")
      .toLowerCase();
  }

  function getMeta(documentRef, property) {
    const element = documentRef.querySelector(`meta[property='${property}'], meta[name='${property}']`);
    return element ? String(element.getAttribute("content") || "") : "";
  }

  function hasReadableArticleEvidence(context, helpers) {
    const root = context.document.querySelector("article") || context.document.querySelector("main, [role='main']") || context.document.body;
    const words = helpers.countWords(helpers.getReadableText(root).slice(0, 12000));
    const headings = helpers.querySelectorAllDeep(root, "h1, h2, h3").length;
    const paragraphs = root.querySelectorAll ? root.querySelectorAll("p").length : 0;
    const controls = context.document.querySelectorAll("input, textarea, select, button, [role='button'], [role='tab']").length;
    const linkWords = helpers.countWords(Array.from(root.querySelectorAll ? root.querySelectorAll("a") : []).map((link) => link.innerText || "").join(" "));
    const linkDensity = words ? linkWords / words : 0;
    const articleTag = Boolean(context.document.querySelector("article"));
    const articleMeta = getMeta(context.document, "og:type").toLowerCase().includes("article");
    const longformStructure = words >= 640 && headings >= 2 && paragraphs >= 4;
    const readableStructure = words >= 420 && paragraphs >= 4 && linkDensity < 0.34;
    const structuredReadablePage = words >= 520 && headings >= 1 && paragraphs >= 5 && linkDensity < 0.36;
    return (articleTag || articleMeta || longformStructure || readableStructure || structuredReadablePage)
      && controls <= 32
      && linkDensity < 0.42;
  }


function hasReadableLongformEvidence(context, helpers) {
  const root = context.document.querySelector("article") || context.document.querySelector("main, [role='main']") || context.document.body;
  const words = helpers.countWords(helpers.getReadableText(root).slice(0, 12000));
  const headings = helpers.querySelectorAllDeep(root, "h1, h2, h3").length;
  const paragraphs = root.querySelectorAll ? root.querySelectorAll("p").length : 0;
  const controls = context.document.querySelectorAll("input, textarea, select, button, [role='button'], [role='tab']").length;
  const linkWords = helpers.countWords(Array.from(root.querySelectorAll ? root.querySelectorAll("a") : []).map((link) => link.innerText || "").join(" "));
  const linkDensity = words ? linkWords / words : 0;
  return words >= 620
    && headings >= 2
    && paragraphs >= 4
    && controls <= 30
    && linkDensity < 0.42;
}


function hasTranscriptStyleConversation(context, helpers) {
  const sample = helpers.cleanText(getSample(context, helpers).slice(0, 12000));
  const prefixLines = countPatternHits(sample, /(?:^|\n)\s*(user|assistant|human|model|bot|you|me|question|answer|response|reply|prompt|q|a)\s*[:\-]/gim);
  const cueHits = countPatternHits(sample, /\b(final answer|latest answer|corrected|correction|working version|summary|final code|copy code|copy and paste|reply|response|revised)\b/g);
  const turnWords = countPatternHits(sample, /\b(question|answer|follow up|next|then|finally|reply|response)\b/g);
  return prefixLines >= 2
    || (prefixLines >= 1 && cueHits >= 2)
    || (cueHits >= 3 && turnWords >= 2);
}

function getConversationEvidence(context, helpers) {
    const root = context.document.querySelector("[data-testid*='conversation'], [data-testid*='chat'], main, [role='main'], article") || context.document.body;
    const selectors = [
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
      "[class*='conversation' i] [class*='message' i]",
      "[class*='chat' i] [class*='message' i]"
    ];
    const selectorCandidates = uniqueElements(selectors.flatMap((selector) => helpers.querySelectorAllDeep(root, selector)))
      .map((node) => normalizeConversationNode(node, root, helpers))
      .filter(Boolean);

    const fallbackCandidates = selectorCandidates.length >= 4
      ? []
      : getConversationFallbackNodes(root, helpers);

    const candidates = uniqueElements(selectorCandidates.concat(fallbackCandidates))
      .filter((node) => helpers.isVisible(node))
      .filter((node) => !helpers.isLowValueElement(node))
      .filter((node) => helpers.countWords(helpers.cleanText(node.innerText || node.textContent)) >= 3)
      .slice(0, 64);

    const assistantCount = candidates.filter((node, index) => inferChatRole(node, null, index) === "assistant").length;
    const userCount = candidates.filter((node, index) => inferChatRole(node, null, index) === "user").length;
    const prefixCount = candidates.filter((node) => {
      const text = helpers.cleanText(node.innerText || node.textContent || "");
      return /^\s*(user|assistant|model|bot|answer|response|reply|question|prompt|q|a)\s*[:\-]/i.test(text.split(/\n+/)[0] || "");
    }).length;
    const codeBlocks = uniqueElements(candidates.flatMap((node) => helpers.querySelectorAllDeep(node, "pre, code")))
      .filter((node) => helpers.isVisible(node))
      .filter((node) => node.matches("pre") || !node.closest("pre"))
      .slice(0, 20);
    const sample = helpers.cleanText(getSample(context, helpers).slice(0, 12000));
    const cueHits = countPatternHits(sample, /\b(final answer|corrected|correction|latest answer|latest version|working version|copy code|copy and paste|response|assistant|prompt|question|conversation|chat|regenerate|reply|latest corrected|final code|summary|revised)\b/g);

    let alternatingRuns = 0;
    let previousRole = "";
    candidates.forEach((node, index) => {
      const role = inferChatRole(node, null, index);
      if (role && previousRole && role !== previousRole) {
        alternatingRuns += 1;
      }
      if (role) {
        previousRole = role;
      }
    });

    let score = 0;
    if (candidates.length >= 3 && assistantCount >= 1 && userCount >= 1) score += 2;
    if (candidates.length >= 8) score += 1;
    if (assistantCount >= 1 && userCount >= 1) score += 2;
    if (codeBlocks.length > 0) score += 1;
    if (cueHits >= 2 && (assistantCount >= 1 || userCount >= 1 || prefixCount >= 1)) score += 1;
    if (candidates.length >= 3 && assistantCount + userCount >= 3) score += 1;
    if (prefixCount >= 1) score += 2;
    if (alternatingRuns >= 1) score += 1;
    if (fallbackCandidates.length >= 4 && (prefixCount >= 1 || codeBlocks.length > 0 || cueHits >= 2)) score += 1;

    return {
      score,
      candidates,
      assistantCount,
      userCount,
      codeBlocks: codeBlocks.length,
      cueHits,
      prefixCount,
      alternatingRuns,
      fallbackCount: fallbackCandidates.length,
      root
    };
  }

  function normalizeConversationNode(node, root, helpers) {
    if (!node || !node.closest) {
      return null;
    }
    const normalized = node.closest("[data-message-author-role], [data-testid*='conversation-turn'], [data-testid*='conversation'], [data-testid*='user-message'], [data-testid*='assistant-message'], [data-testid*='chat-message'], [data-testid*='message'], [data-testid*='prompt'], [data-testid*='response'], [data-author], [data-role], [data-content*='message' i], [aria-label*='assistant' i], [aria-label*='user' i], [class*='assistant' i], [class*='conversation' i] [class*='message' i], [class*='chat' i] [class*='message' i]") || node;
    if (root && !isWithinRoot(root, normalized)) {
      return null;
    }
    if (helpers.isLowValueElement(normalized)) {
      return null;
    }
    return normalized;
  }

  function getConversationFallbackNodes(root, helpers) {
    const candidates = uniqueElements(helpers.querySelectorAllDeep(root, "main, article, section, div, p, li, blockquote, pre, [data-message-author-role], [data-testid*='conversation' i], [data-testid*='chat' i], [class*='message' i]"))
      .filter((node) => helpers.isVisible(node))
      .filter((node) => !helpers.isLowValueElement(node))
      .filter((node) => helpers.countWords(helpers.cleanText(node.innerText || node.textContent)) >= 3)
      .filter((node) => {
        const text = helpers.cleanText(node.innerText || node.textContent || "");
        const firstLine = text.split(/\n+/)[0] || "";
        return /(^|\b)(user|assistant|model|bot|answer|response|reply|question|prompt|q|a)\s*[:\-]/i.test(firstLine)
          || /\b(final answer|latest answer|corrected|correction|working version|copy code|copy and paste|regenerate|reply|chat|conversation|summary|final code)\b/i.test(text)
          || node.matches && node.matches("pre, code")
          || (text.includes("?") && /\b(you|we|I|can|should|could|what|why|how)\b/i.test(text.slice(0, 240)))
          || (helpers.querySelectorAllDeep(node, "pre, code").length > 0);
      })
      .slice(0, 72);
    return candidates;
  }

function hasReadableConversationEvidence(context, helpers) {
    const evidence = getConversationEvidence(context, helpers);
    return (evidence.score >= 3 && evidence.assistantCount >= 1 && evidence.userCount >= 1)
      || (evidence.score >= 2 && evidence.assistantCount >= 1 && evidence.userCount >= 1 && (evidence.codeBlocks > 0 || evidence.prefixCount >= 1 || evidence.fallbackCount >= 4))
      || hasTranscriptStyleConversation(context, helpers);
  }

  function countPatternHits(text, pattern) {
    const matches = String(text || "").match(pattern);
    return matches ? matches.length : 0;
  }

  function uniqueElements(elements) {
    const seen = new Set();
    return elements.filter((element) => {
      if (!element || seen.has(element)) return false;
      seen.add(element);
      return true;
    });
  }

  function uniqueStrings(strings) {
    return Array.from(new Set(strings.filter(Boolean)));
  }

  function isWithinRoot(root, node) {
    if (!root || !node) return true;
    if (root === node) return true;

    let current = node;
    let guard = 0;

    while (current && guard < 1500) {
      if (current === root) return true;
      if (current.host) {
        current = current.host;
      } else if (current.parentNode) {
        current = current.parentNode;
      } else if (current.ownerDocument && current.ownerDocument.defaultView && current.ownerDocument.defaultView.frameElement) {
        current = current.ownerDocument.defaultView.frameElement;
      } else if (current.nodeType === 9 && current.defaultView && current.defaultView.frameElement) {
        current = current.defaultView.frameElement;
      } else {
        break;
      }
      guard += 1;
    }

    return false;
  }

  function isPdfUrl(url) {
    return /\.pdf(?:$|[?#])/i.test(String(url || ""));
  }

  function safeCall(fn, fallback) {
    try {
      return fn();
    } catch (error) {
      return fallback;
    }
  }

  window.PagePilotAdapters = {
    createRegistry
  };
})();
