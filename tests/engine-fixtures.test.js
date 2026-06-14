const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const engineCode = fs.readFileSync(path.join(root, "content", "engine.js"), "utf8");
const sandbox = {
  window: {
    scrollY: 0,
    innerHeight: 900
  },
  console,
  document: {},
  setTimeout,
  clearTimeout
};

vm.runInNewContext(engineCode, sandbox, { filename: "content/engine.js" });

const engine = sandbox.window.PagePilotEngine;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function analyze(fixture) {
  return engine.analyzeTextFixture({
    finalizeProfile: true,
    ...fixture
  });
}

function best(result) {
  return result.sections.find((section) => section.id === result.recommendation.bestSectionId) || null;
}

function sectionByTitle(result, pattern) {
  return result.sections.find((section) => pattern.test(section.title || "")) || null;
}

function sectionById(result, id) {
  return result.sections.find((section) => section.id === id) || null;
}

function repeated(words, count) {
  return Array.from({ length: count }, () => words).join(" ");
}

function whyText(result, section) {
  return [
    section && section.intelligence && Array.isArray(section.intelligence.whyReasons) && section.intelligence.whyReasons.join(" "),
    result.recommendation.targetConfidenceReason,
    section && section.unitMeta && section.unitMeta.diagnosticReason,
    section && section.metrics && section.metrics.selectionReason
  ].filter(Boolean).join(" ");
}

function assertCompleteIntelligence(section, expectation, requireSignals) {
  const intelligence = section && section.intelligence;
  assert(intelligence && typeof intelligence === "object", `${expectation.name}: ${section && section.title} missing intelligence metadata`);
  assert(typeof intelligence.role === "string" && intelligence.role.length > 0, `${expectation.name}: ${section.title} missing intelligence.role`);
  assert(typeof intelligence.roleLabel === "string" && intelligence.roleLabel.length > 0, `${expectation.name}: ${section.title} missing intelligence.roleLabel`);
  assert(intelligence.pageType === expectation.pageType, `${expectation.name}: ${section.title} unexpected intelligence.pageType ${intelligence.pageType}`);
  assert(Number.isFinite(Number(intelligence.roleConfidence)), `${expectation.name}: ${section.title} missing intelligence.roleConfidence`);
  assert(intelligence.roleConfidence >= 0 && intelligence.roleConfidence <= 100, `${expectation.name}: ${section.title} roleConfidence out of range`);
  assert(Array.isArray(intelligence.whyReasons) && intelligence.whyReasons.some((reason) => String(reason || "").trim()), `${expectation.name}: ${section.title} missing intelligence.whyReasons`);
  assert(intelligence.scoreDetails && typeof intelligence.scoreDetails === "object", `${expectation.name}: ${section.title} missing intelligence.scoreDetails`);
  assert(Number.isFinite(Number(intelligence.scoreDetails.score)), `${expectation.name}: ${section.title} missing scoreDetails.score`);
  assert(Number.isFinite(Number(intelligence.scoreDetails.usefulScore)), `${expectation.name}: ${section.title} missing scoreDetails.usefulScore`);
  assert(Number.isFinite(Number(intelligence.scoreDetails.importanceScore)), `${expectation.name}: ${section.title} missing scoreDetails.importanceScore`);
  assert(Number.isFinite(Number(intelligence.scoreDetails.fluffScore)), `${expectation.name}: ${section.title} missing scoreDetails.fluffScore`);
  assert(Array.isArray(intelligence.scoreDetails.signals), `${expectation.name}: ${section.title} missing scoreDetails.signals`);
  if (requireSignals) {
    assert(intelligence.scoreDetails.signals.length > 0, `${expectation.name}: ${section.title} expected scoreDetails signals`);
    intelligence.scoreDetails.signals.forEach((signal) => {
      assert(signal && typeof signal.signal === "string" && signal.signal, `${expectation.name}: ${section.title} signal missing name`);
      assert(Number.isFinite(Number(signal.weight)), `${expectation.name}: ${section.title} signal missing weight`);
      assert(typeof signal.explanation === "string" && signal.explanation, `${expectation.name}: ${section.title} signal missing explanation`);
    });
  }
  assert(typeof intelligence.sourceType === "string" && intelligence.sourceType.length > 0, `${expectation.name}: ${section.title} missing intelligence.sourceType`);
}

function assertIntelligenceMetadata(result, expectation) {
  result.sections.forEach((section) => assertCompleteIntelligence(section, expectation, false));
  result.importantSections.forEach((section) => assertCompleteIntelligence(section, expectation, true));

  if (expectation.quiet) return;
  const bestSection = best(result);
  const intelligence = bestSection && bestSection.intelligence;
  assert(intelligence, `${expectation.name}: best section missing intelligence`);
  if (expectation.bestKind) {
    const existingKind = bestSection.metrics && (bestSection.metrics.sectionKind || bestSection.metrics.pdfSectionType || bestSection.metrics.ocrRole) || "";
    assert(expectation.bestKind.test(intelligence.role) || expectation.bestKind.test(existingKind), `${expectation.name}: unexpected intelligence.role ${intelligence.role}`);
  }
  if (expectation.label) {
    const label = `${intelligence.roleLabel} ${result.recommendation.bestLabel} ${result.recommendation.bestKindLabel}`;
    assert(expectation.label.test(label), `${expectation.name}: unexpected intelligence.roleLabel ${intelligence.roleLabel}`);
  }
  if (expectation.why) {
    assert(expectation.why.test(intelligence.whyReasons.join(" ")), `${expectation.name}: unexpected intelligence whyReasons ${intelligence.whyReasons.join(" ")}`);
  }
}

function assertValidTargets(result, expectation) {
  const bestSection = best(result);
  if (expectation.quiet) {
    assert(result.pageProfile.quietMode, `${expectation.name}: expected quiet mode`);
    assert(!result.recommendation.hasStrongTarget, `${expectation.name}: quiet page should not expose a strong jump target`);
    return;
  }

  assert(!result.pageProfile.quietMode, `${expectation.name}: expected active map`);
  assert(bestSection, `${expectation.name}: expected a valid Jump target`);
  assert(result.recommendation.hasStrongTarget, `${expectation.name}: expected a strong Jump target`);
  assert(result.sections.some((section) => section.id === result.recommendation.bestSectionId), `${expectation.name}: bestSectionId should resolve`);
  const nextTarget = result.importantSections.find((section) => section.id !== result.recommendation.bestSectionId);
  assert(nextTarget, `${expectation.name}: expected a valid Next target; best=${result.recommendation.bestSectionId}; important=${result.importantSections.map((section) => `${section.id}:${section.title}`).join(", ")}`);
}

function assertJunkDownranked(result, expectation) {
  if (!expectation.junkTitle) return;
  const bestSection = best(result);
  assert(bestSection && !expectation.junkTitle.test(bestSection.title || ""), `${expectation.name}: junk section should not be best`);
}

function assertThemeIntentBoost(section, expectation) {
  const themeIntent = section && section.metrics && section.metrics.themeIntent;
  assert(themeIntent && themeIntent.boost > 0, `${expectation.name}: expected theme/intent boost on ${section && section.title}`);
  const signals = section.intelligence && section.intelligence.scoreDetails && section.intelligence.scoreDetails.signals || [];
  assert(signals.some((signal) => /^theme\.|^intent\./.test(signal.signal)), `${expectation.name}: expected theme/intent scoreDetails signal`);
  const why = section.intelligence && section.intelligence.whyReasons && section.intelligence.whyReasons.join(" ") || "";
  assert(/theme|intent|matches/i.test(why), `${expectation.name}: expected theme/intent why reason, got ${why}`);
  if (expectation.themeTerm) {
    assert(themeIntent.matchedTerms.some((term) => expectation.themeTerm.test(term)), `${expectation.name}: expected matched theme term ${expectation.themeTerm}, got ${themeIntent.matchedTerms.join(", ")}`);
  }
}

function assertExpectedResult(result, expectation) {
  expectation.name = expectation.name || "fixture";
  assert(result.pageProfile.type === expectation.pageType, `${expectation.name}: expected page type ${expectation.pageType}, got ${result.pageProfile.type}`);
  assert(result.pageProfile.quietMode === Boolean(expectation.quiet), `${expectation.name}: quiet mode mismatch`);
  assertValidTargets(result, expectation);
  assertIntelligenceMetadata(result, expectation);

  if (!expectation.quiet) {
    const bestSection = best(result);
    assert(bestSection, `${expectation.name}: missing best section`);
    if (expectation.bestTitle) {
      assert(expectation.bestTitle.test(bestSection.title || ""), `${expectation.name}: unexpected best title ${bestSection.title}`);
    }
    if (expectation.bestKind) {
      const kind = bestSection.metrics && (bestSection.metrics.sectionKind || bestSection.metrics.pdfSectionType || bestSection.metrics.ocrRole) || "";
      assert(expectation.bestKind.test(kind), `${expectation.name}: unexpected best role/kind ${kind}`);
    }
    if (expectation.bestMeta) {
      const metaValue = expectation.bestMeta.path.reduce((value, key) => value && value[key], bestSection);
      assert(expectation.bestMeta.match.test(String(metaValue || "")), `${expectation.name}: unexpected best metadata ${metaValue}`);
    }
    if (expectation.nextMeta) {
      const nextId = result.recommendation.nextImportantId
        || (result.importantSections.find((section) => section.id !== result.recommendation.bestSectionId) || {}).id;
      const nextSection = sectionById(result, nextId);
      assert(nextSection, `${expectation.name}: expected a Next target`);
      const metaValue = expectation.nextMeta.path.reduce((value, key) => value && value[key], nextSection);
      assert(expectation.nextMeta.match.test(String(metaValue || "")), `${expectation.name}: unexpected next metadata ${metaValue}`);
    }
    if (expectation.label) {
      const label = `${result.recommendation.bestLabel} ${result.recommendation.bestKindLabel}`;
      assert(expectation.label.test(label), `${expectation.name}: unexpected best label ${label}`);
    }
    if (expectation.why) {
      const why = whyText(result, bestSection);
      assert(expectation.why.test(why), `${expectation.name}: unexpected why text ${why}`);
    }
    if (expectation.expectThemeIntent) {
      assertThemeIntentBoost(bestSection, expectation);
    }
  } else if (expectation.expectNoThemeIntent) {
    result.sections.forEach((section) => {
      const boost = section.metrics && section.metrics.themeIntent && section.metrics.themeIntent.boost || 0;
      assert(boost === 0, `${expectation.name}: quiet/junk section received theme/intent boost`);
    });
  }

  assertJunkDownranked(result, expectation);
}

function runFixture(name, fixture, expectation) {
  return {
    name,
    run() {
      const result = analyze(fixture);
      assertExpectedResult(result, { ...expectation, name });
    }
  };
}

const cases = [
  {
    name: "Search adapter is registered before chat adapters",
    run() {
      const adaptersCode = fs.readFileSync(path.join(root, "content", "adapters.js"), "utf8");
      const registryStart = adaptersCode.indexOf("function createRegistry");
      const registryEnd = adaptersCode.indexOf("function makePdfAdapter");
      const registry = adaptersCode.slice(registryStart, registryEnd);
      assert(registry.includes("makeSearchAdapter()"), "registry should include search adapter");
      assert(registry.indexOf("makeSearchAdapter()") < registry.indexOf("...AI_PLATFORMS.map"), "search adapter must run before AI chat adapters");
      assert(registry.indexOf("makeSearchAdapter()") < registry.indexOf("makeGenericChatAdapter()"), "search adapter must run before generic chat adapter");
    }
  },
  runFixture(
    "Google search with AI Overview targets AI Overview",
    {
      type: "search_results",
      label: "Search Results",
      quietMode: false,
      readingConfidence: 72,
      words: 320,
      pageEvidence: { quietEvidence: 4, articleEvidence: 0, paragraphs: 1, resultItems: 12, searchNodes: 3 },
      sections: [
        {
          title: "AI Overview",
          text: `AI Overview ${repeated("The concise answer explains the topic and cites source material.", 14)}`,
          adapterScore: 96,
          unitMeta: { kind: "search-block", searchBlockType: "ai_overview", diagnosticReason: "AI Overview is the highest-value search block" }
        },
        {
          title: "Top results",
          text: repeated("A normal organic result with link text and snippets.", 12),
          adapterScore: 82,
          unitMeta: { kind: "search-block", searchBlockType: "top_results", diagnosticReason: "Top organic results are the best next area" }
        },
        {
          title: "Sources",
          text: repeated("Sources support the AI Overview answer with source links and context.", 10),
          adapterScore: 70,
          unitMeta: { kind: "search-block", searchBlockType: "sources", diagnosticReason: "Sources support the AI Overview or answer block" }
        },
        {
          title: "Related searches",
          text: repeated("Related searches shopping videos images people also ask sidebar.", 10),
          adapterScore: -30,
          unitMeta: { kind: "search-block", searchBlockType: "related_searches", diagnosticReason: "Related searches can help refine the query" }
        }
      ]
    },
    {
      pageType: "search_results",
      quiet: false,
      bestTitle: /AI Overview/i,
      bestMeta: { path: ["unitMeta", "searchBlockType"], match: /ai_overview/ },
      nextMeta: { path: ["unitMeta", "searchBlockType"], match: /sources/ },
      label: /AI Overview/i,
      why: /AI Overview|highest-value/i,
      junkTitle: /Related searches/i
    }
  ),
  runFixture(
    "Google featured snippet targets direct answer before organic results",
    {
      type: "search_results",
      label: "Search Results",
      quietMode: false,
      readingConfidence: 72,
      words: 330,
      pageEvidence: { quietEvidence: 4, articleEvidence: 0, paragraphs: 1, resultItems: 12, searchNodes: 3 },
      sections: [
        {
          title: "Featured snippet",
          text: repeated("Featured snippet direct answer: the answer is explained in a concise paragraph with a definition and useful context.", 12),
          adapterScore: 88,
          unitMeta: { kind: "search-block", searchBlockType: "answer", searchPriority: 1, diagnosticReason: "Search answer block gives a direct answer" }
        },
        {
          title: "Top results",
          text: repeated("Top organic result snippet provides source context and the next place to read.", 14),
          adapterScore: 74,
          unitMeta: { kind: "search-block", searchBlockType: "top_results", searchPriority: 3, diagnosticReason: "Top organic results are the best next area" }
        },
        {
          title: "Shopping ads",
          text: repeated("Sponsored shopping ad buy now checkout product price deal.", 12),
          adapterScore: -18,
          unitMeta: { kind: "search-block", searchBlockType: "shopping", searchPriority: 8, diagnosticReason: "Shopping block is a specialized result area" }
        }
      ]
    },
    {
      pageType: "search_results",
      quiet: false,
      bestTitle: /Featured snippet/i,
      bestMeta: { path: ["unitMeta", "searchBlockType"], match: /answer/ },
      nextMeta: { path: ["unitMeta", "searchBlockType"], match: /top_results/ },
      label: /Search answer/i,
      why: /direct answer|Search answer/i,
      junkTitle: /Shopping ads/i
    }
  ),
  runFixture(
    "Search videos shopping maps and related searches do not outrank organic results",
    {
      type: "search_results",
      label: "Search Results",
      quietMode: false,
      readingConfidence: 70,
      words: 360,
      pageEvidence: { quietEvidence: 4, articleEvidence: 0, paragraphs: 1, resultItems: 16, searchNodes: 4 },
      sections: [
        {
          title: "Top results",
          text: repeated("Top organic result snippet provides useful answer context and source details.", 14),
          adapterScore: 74,
          unitMeta: { kind: "search-block", searchBlockType: "top_results", searchPriority: 3, diagnosticReason: "Top organic results are the best next area" }
        },
        {
          title: "Videos",
          text: repeated("Videos video result watch tutorial clip preview YouTube.", 9),
          adapterScore: 40,
          unitMeta: { kind: "search-block", searchBlockType: "videos", searchPriority: 5, diagnosticReason: "Video result block may be useful for this query" }
        },
        {
          title: "Maps",
          text: repeated("Maps local results directions near me places open now.", 9),
          adapterScore: 34,
          unitMeta: { kind: "search-block", searchBlockType: "maps", searchPriority: 6, diagnosticReason: "Map/local block is a specialized result area" }
        },
        {
          title: "Related searches",
          text: repeated("Related searches similar query refine search related topics.", 8),
          adapterScore: 24,
          unitMeta: { kind: "search-block", searchBlockType: "related_searches", searchPriority: 7, diagnosticReason: "Related searches can help refine the query" }
        },
        {
          title: "Shopping",
          text: repeated("Sponsored shopping buy now add to cart price product deal checkout.", 10),
          adapterScore: -18,
          unitMeta: { kind: "search-block", searchBlockType: "shopping", searchPriority: 8, diagnosticReason: "Shopping block is a specialized result area" }
        }
      ]
    },
    {
      pageType: "search_results",
      quiet: false,
      bestTitle: /Top results/i,
      bestMeta: { path: ["unitMeta", "searchBlockType"], match: /top_results/ },
      nextMeta: { path: ["unitMeta", "searchBlockType"], match: /videos/ },
      label: /Top results/i,
      why: /Top organic|best next area|search/i,
      junkTitle: /Shopping/i
    }
  ),
  runFixture(
    "Bing direct answer targets answer before results",
    {
      type: "search_results",
      label: "Search Results",
      quietMode: false,
      readingConfidence: 72,
      words: 340,
      pageEvidence: { quietEvidence: 4, articleEvidence: 0, paragraphs: 1, resultItems: 12, searchNodes: 3 },
      sections: [
        {
          title: "Bing answer",
          text: repeated("Search answer direct answer gives the definition, explanation, and source-backed context.", 13),
          adapterScore: 88,
          unitMeta: { kind: "search-block", searchBlockType: "answer", searchPriority: 1, diagnosticReason: "Search answer block gives a direct answer" }
        },
        {
          title: "Web results",
          text: repeated("Top organic web result snippet gives source title URL and useful preview.", 13),
          adapterScore: 72,
          unitMeta: { kind: "search-block", searchBlockType: "top_results", searchPriority: 3, diagnosticReason: "Top organic results are the best next area" }
        },
        {
          title: "Related searches",
          text: repeated("Related searches similar topic refine query follow up.", 8),
          adapterScore: 20,
          unitMeta: { kind: "search-block", searchBlockType: "related_searches", searchPriority: 7, diagnosticReason: "Related searches can help refine the query" }
        }
      ]
    },
    {
      pageType: "search_results",
      quiet: false,
      bestTitle: /Bing answer/i,
      bestMeta: { path: ["unitMeta", "searchBlockType"], match: /answer/ },
      nextMeta: { path: ["unitMeta", "searchBlockType"], match: /top_results/ },
      label: /Search answer/i,
      why: /direct answer|Search answer/i,
      junkTitle: /Related searches/i
    }
  ),
  runFixture(
    "Google search without AI Overview targets top results",
    {
      type: "search_results",
      label: "Search Results",
      quietMode: false,
      readingConfidence: 70,
      words: 290,
      pageEvidence: { quietEvidence: 4, articleEvidence: 0, paragraphs: 1, resultItems: 14, searchNodes: 3 },
      sections: [
        {
          title: "Top results",
          text: repeated("Top organic result snippet gives a useful answer and source context.", 14),
          adapterScore: 72,
          unitMeta: { kind: "search-block", searchBlockType: "top_results", diagnosticReason: "Top organic results are the best next area" }
        },
        {
          title: "People also ask",
          text: repeated("People also ask related questions and answer previews.", 10),
          adapterScore: 58,
          unitMeta: { kind: "search-block", searchBlockType: "people_also_ask", diagnosticReason: "Related questions help refine the search" }
        },
        {
          title: "Footer links",
          text: repeated("Settings privacy terms advertising business about search help.", 8),
          adapterScore: -35,
          unitMeta: { kind: "search-block", searchBlockType: "footer" }
        }
      ]
    },
    {
      pageType: "search_results",
      quiet: false,
      bestTitle: /Top results/i,
      bestMeta: { path: ["unitMeta", "searchBlockType"], match: /top_results/ },
      nextMeta: { path: ["unitMeta", "searchBlockType"], match: /people_also_ask/ },
      label: /Top results/i,
      why: /Top organic|best next area|search/i,
      junkTitle: /Footer/i
    }
  ),
  runFixture(
    "Bing search with AI Overview targets AI answer",
    {
      type: "search_results",
      label: "Search Results",
      quietMode: false,
      readingConfidence: 73,
      words: 310,
      pageEvidence: { quietEvidence: 4, articleEvidence: 0, paragraphs: 1, resultItems: 10, searchNodes: 3 },
      sections: [
        {
          title: "Copilot answer",
          text: repeated("AI Overview answer summarizes the query, gives source-backed explanation, and identifies the key takeaway.", 13),
          adapterScore: 92,
          unitMeta: { kind: "search-block", searchBlockType: "ai_overview", diagnosticReason: "AI Overview is the highest-value search block" }
        },
        {
          title: "Web results",
          text: repeated("Web result snippet with source title URL and short preview.", 12),
          adapterScore: 68,
          unitMeta: { kind: "search-block", searchBlockType: "top_results" }
        }
      ]
    },
    {
      pageType: "search_results",
      quiet: false,
      bestTitle: /Copilot answer/i,
      bestMeta: { path: ["unitMeta", "searchBlockType"], match: /ai_overview/ },
      nextMeta: { path: ["unitMeta", "searchBlockType"], match: /top_results/ },
      label: /AI Overview/i,
      why: /AI Overview|highest-value/i
    }
  ),
  runFixture(
    "Bing search without AI Overview targets web results",
    {
      type: "search_results",
      label: "Search Results",
      quietMode: false,
      readingConfidence: 70,
      words: 280,
      pageEvidence: { quietEvidence: 4, articleEvidence: 0, paragraphs: 1, resultItems: 13, searchNodes: 3 },
      sections: [
        {
          title: "Web results",
          text: repeated("Top organic result snippet provides a useful answer, source context, and next place to read.", 14),
          adapterScore: 74,
          unitMeta: { kind: "search-block", searchBlockType: "top_results", diagnosticReason: "Top organic results are the best next area" }
        },
        {
          title: "People also ask",
          text: repeated("Common follow-up question with a direct answer, context, and citation snippet.", 12),
          adapterScore: 62,
          unitMeta: { kind: "search-block", searchBlockType: "people_also_ask", diagnosticReason: "Follow-up questions are a useful next search target" }
        },
        {
          title: "Related searches",
          text: repeated("Related searches map videos ads news carousel.", 10),
          adapterScore: -20,
          unitMeta: { kind: "search-block", searchBlockType: "related_searches", diagnosticReason: "Related searches can help refine the query" }
        }
      ]
    },
    {
      pageType: "search_results",
      quiet: false,
      bestTitle: /Web results/i,
      bestMeta: { path: ["unitMeta", "searchBlockType"], match: /top_results/ },
      nextMeta: { path: ["unitMeta", "searchBlockType"], match: /people_also_ask/ },
      label: /Top results/i,
      why: /Top organic|best next area|search/i,
      junkTitle: /Related searches/i
    }
  ),
  runFixture(
    "Long chatbot conversation with corrected final answer",
    {
      type: "chat",
      label: "ChatGPT",
      quietMode: false,
      readingConfidence: 90,
      words: 1100,
      pageEvidence: { conversationEvidence: 8, conversationNodes: 9, assistantHits: 4, userHits: 4, codeBlocks: 0, paragraphs: 7 },
      sections: [
        { title: "Original question", text: repeated("Recommend the implementation strategy for this browser extension release.", 8), unitMeta: { role: "user", turnIndex: 0 } },
        { title: "Draft answer", text: repeated("Final answer: rewrite the whole flow and migrate every feature at once despite compatibility risk.", 18), unitMeta: { role: "assistant", turnIndex: 1, hasFinalAnswer: true, isSuperseded: true } },
        { title: "Follow-up detail", text: repeated("Include constraints about OCR, PDF navigation, action routing, and existing tests.", 12), unitMeta: { role: "user", turnIndex: 2 } },
        { title: "Middle answer", text: repeated("A balanced plan could work but still changes too many modules and leaves unclear test coverage.", 18), unitMeta: { role: "assistant", turnIndex: 3, isSuperseded: true } },
        { title: "Correction", text: repeated("Actually do not rewrite it. Fix the smallest release blockers and preserve working behavior.", 10), unitMeta: { role: "user", turnIndex: 4 } },
        {
          title: "Corrected final answer",
          text: repeated("Corrected answer: use targeted fixes for OCR lifecycle, PDF action routing, status sync, and regression tests. This preserves existing behavior and addresses the launch blockers.", 18),
          unitMeta: { role: "assistant", turnIndex: 5, isLatestAssistant: true, answersLatestUser: true, isAfterUserCorrection: true, hasRevision: true, hasFinalAnswer: true }
        }
      ]
    },
    {
      pageType: "chat",
      quiet: false,
      bestTitle: /Corrected final answer/i,
      bestKind: /corrected_answer/,
      label: /corrected|final answer/i,
      why: /correction|latest user|corrected/i,
      junkTitle: /Draft answer|Original question/i
    }
  ),
  runFixture(
    "Chat latest complete answer beats older drafts",
    {
      type: "chat",
      label: "ChatGPT",
      quietMode: false,
      readingConfidence: 90,
      words: 980,
      pageEvidence: { conversationEvidence: 8, conversationNodes: 8, assistantHits: 4, userHits: 4, codeBlocks: 0, paragraphs: 8 },
      sections: [
        { title: "Initial prompt", text: repeated("Explain how to migrate the settings panel without changing the public API.", 8), unitMeta: { role: "user", turnIndex: 0 } },
        { title: "Old draft", text: repeated("One possible draft is to move every setting into a new store, but this may not handle older saved values.", 14), unitMeta: { role: "assistant", turnIndex: 1, hasHedgedDraft: true, isSuperseded: true } },
        { title: "More constraints", text: repeated("Keep storage compatible, include rollback notes, and keep the visible labels unchanged.", 9), unitMeta: { role: "user", turnIndex: 2 } },
        {
          title: "Latest complete answer",
          text: repeated("Final answer: migrate the settings panel by reading existing storage before mapping old keys to the current schema, preserving labels, and writing only after validation succeeds. Include a rollback check and verify the panel opens with both old and new saved values.", 12),
          adapterScore: 10,
          unitMeta: { role: "assistant", turnIndex: 3, isLatestAssistant: true, answersLatestUser: true, hasFinalAnswer: true, isCompleteAssistantAnswer: true }
        },
        {
          title: "Useful earlier note",
          text: repeated("Summary: the safest part is keeping the DOM labels stable while changing only the storage compatibility layer.", 10),
          unitMeta: { role: "assistant", turnIndex: 4, hasSummary: true, isSuperseded: true }
        }
      ]
    },
    {
      pageType: "chat",
      quiet: false,
      bestTitle: /Latest complete answer/i,
      bestKind: /latest_answer|final_answer/,
      label: /Latest answer|Final answer/i,
      why: /Newest complete|latest user|Final answer/i,
      junkTitle: /Old draft|Initial prompt/i
    }
  ),
  runFixture(
    "Chat user correction selects corrected answer",
    {
      type: "chat",
      label: "Claude",
      quietMode: false,
      readingConfidence: 91,
      words: 1020,
      pageEvidence: { conversationEvidence: 8, conversationNodes: 7, assistantHits: 3, userHits: 4, codeBlocks: 0, paragraphs: 7 },
      sections: [
        { title: "Request", text: repeated("Give me the correct database migration order for the release.", 8), unitMeta: { role: "user", turnIndex: 0 } },
        { title: "Incorrect answer", text: repeated("Final answer: run the destructive cleanup first, then backfill data later. This is the simplest route.", 14), unitMeta: { role: "assistant", turnIndex: 1, hasFinalAnswer: true, isSuperseded: true, hasFailedAnswer: true } },
        { title: "User correction", text: repeated("That is wrong because cleanup before backfill drops data. Correct it and give the safe order.", 9), unitMeta: { role: "user", turnIndex: 2 } },
        {
          title: "Corrected answer",
          text: repeated("Corrected answer: first create the new nullable columns, then backfill in batches, then verify counts, then switch reads, and only finally remove the old columns after a rollback window. This fixes the earlier mistake.", 13),
          adapterScore: 8,
          unitMeta: { role: "assistant", turnIndex: 3, isLatestAssistant: true, answersLatestUser: true, isAfterUserCorrection: true, hasRevision: true, hasFinalAnswer: true, isCompleteAssistantAnswer: true }
        },
        {
          title: "Rollback summary",
          text: repeated("Summary: the rollback point is before removing the old columns, because both schemas are available until then.", 10),
          unitMeta: { role: "assistant", turnIndex: 4, hasSummary: true }
        }
      ]
    },
    {
      pageType: "chat",
      quiet: false,
      bestTitle: /Corrected answer/i,
      bestKind: /corrected_answer/,
      label: /Corrected answer/i,
      why: /Updated answer after user correction|correction|Corrected/i,
      junkTitle: /Incorrect answer|Request/i
    }
  ),
  runFixture(
    "Chat complete code beats partial snippets",
    {
      type: "chat",
      label: "Copilot",
      quietMode: false,
      readingConfidence: 88,
      words: 940,
      pageEvidence: { conversationEvidence: 7, conversationNodes: 7, assistantHits: 3, userHits: 3, codeBlocks: 3, paragraphs: 7 },
      sections: [
        { title: "Code request", text: repeated("Write the function and include the complete code, tests, and usage.", 7), unitMeta: { role: "user", turnIndex: 0 } },
        {
          title: "Partial snippet",
          text: "Here is a rough first attempt.\nfunction normalize(input) { return input; }\nIt may not handle null values or arrays yet.",
          codeBlocks: 1,
          unitMeta: { role: "assistant", turnIndex: 1, hasHedgedDraft: true, isSuperseded: true }
        },
        { title: "User asks for final", text: repeated("Please provide the full working version and tests.", 8), unitMeta: { role: "user", turnIndex: 2 } },
        {
          title: "Complete code answer",
          text: "Complete code: copy and paste this working version. It validates null values, arrays, and objects, and includes a small usage example.\nfunction normalize(input) {\n  if (input == null) return [];\n  if (Array.isArray(input)) return input.filter(Boolean);\n  return Object.entries(input).map(([key, value]) => ({ key, value }));\n}\nconst result = normalize({ a: 1 });\nThis final version handles the requested cases and can be tested directly.",
          adapterScore: 12,
          codeBlocks: 1,
          unitMeta: { role: "assistant", turnIndex: 3, isLatestAssistant: true, answersLatestUser: true, hasCompleteCode: true, hasFinalAnswer: true, isCompleteAssistantAnswer: true }
        },
        {
          title: "Testing note",
          text: repeated("Summary: test null values, arrays with empty entries, and object entries to confirm the output shape.", 10),
          unitMeta: { role: "assistant", turnIndex: 4, hasSummary: true }
        }
      ]
    },
    {
      pageType: "chat",
      quiet: false,
      bestTitle: /Complete code answer/i,
      bestKind: /complete_code|final_code|code_block/,
      label: /Complete code|Final code/i,
      why: /Complete code answer|Complete code|code/i,
      junkTitle: /Partial snippet|Code request/i
    }
  ),
  runFixture(
    "Chat incomplete latest response keeps earlier complete answer",
    {
      type: "chat",
      label: "ChatGPT",
      quietMode: false,
      readingConfidence: 88,
      words: 900,
      pageEvidence: { conversationEvidence: 7, conversationNodes: 6, assistantHits: 3, userHits: 3, codeBlocks: 0, paragraphs: 6 },
      sections: [
        { title: "Planning prompt", text: repeated("Explain the rollout plan and include the operational checklist.", 8), unitMeta: { role: "user", turnIndex: 0 } },
        {
          title: "Earlier complete answer",
          text: repeated("Final answer: roll out behind a flag, verify metrics, watch error rate, communicate the change, and keep the rollback command ready. The checklist is deploy, verify logs, compare conversion, and disable the flag if the error budget moves.", 12),
          adapterScore: 8,
          unitMeta: { role: "assistant", turnIndex: 1, hasFinalAnswer: true, isCompleteAssistantAnswer: true }
        },
        { title: "Follow-up prompt", text: repeated("Can you make it shorter and mention metrics?", 8), unitMeta: { role: "user", turnIndex: 2 } },
        {
          title: "Latest incomplete response",
          text: "Generating response...",
          unitMeta: { role: "assistant", turnIndex: 3, isLatestAssistant: true, hasFailedAnswer: true }
        },
        {
          title: "Metrics recap",
          text: repeated("Summary: error rate, latency, and conversion are the three metrics to watch during the release window.", 10),
          unitMeta: { role: "assistant", turnIndex: 4, hasSummary: true }
        }
      ]
    },
    {
      pageType: "chat",
      quiet: false,
      bestTitle: /Earlier complete answer/i,
      bestKind: /final_answer|latest_answer|summary/,
      label: /Final answer|Latest answer|Summary/i,
      why: /Final answer|complete|strongest signal/i,
      junkTitle: /Latest incomplete response|Planning prompt/i
    }
  ),
  runFixture(
    "Chat short assistant confirmation is down-ranked",
    {
      type: "chat",
      label: "Gemini",
      quietMode: false,
      readingConfidence: 87,
      words: 860,
      pageEvidence: { conversationEvidence: 7, conversationNodes: 6, assistantHits: 3, userHits: 3, codeBlocks: 0, paragraphs: 6 },
      sections: [
        { title: "Analysis request", text: repeated("Summarize the decision and the tradeoffs for the team.", 8), unitMeta: { role: "user", turnIndex: 0 } },
        {
          title: "Complete recommendation",
          text: repeated("Final recommendation: choose the incremental migration because it preserves compatibility, lowers release risk, and lets the team verify telemetry before removing the old path. The tradeoff is a little temporary duplication, but rollback remains simple.", 12),
          adapterScore: 8,
          unitMeta: { role: "assistant", turnIndex: 1, hasFinalAnswer: true, hasRecommendation: true, isCompleteAssistantAnswer: true }
        },
        { title: "User acknowledgement", text: repeated("That makes sense, keep it concise.", 8), unitMeta: { role: "user", turnIndex: 2 } },
        { title: "Latest short confirmation", text: "Done.", unitMeta: { role: "assistant", turnIndex: 3, isLatestAssistant: true, isShortConfirmation: true } },
        {
          title: "Decision recap",
          text: repeated("Summary: the chosen path is incremental migration, telemetry verification, and a clear rollback window.", 10),
          unitMeta: { role: "assistant", turnIndex: 4, hasSummary: true }
        }
      ]
    },
    {
      pageType: "chat",
      quiet: false,
      bestTitle: /Complete recommendation/i,
      bestKind: /final_recommendation|final_answer/,
      label: /Final recommendation|Final answer/i,
      why: /Final recommendation|recommendation|strongest signal/i,
      junkTitle: /Latest short confirmation|Analysis request/i
    }
  ),
  runFixture(
    "Chat revised answer replaces failed attempt",
    {
      type: "chat",
      label: "ChatGPT",
      quietMode: false,
      readingConfidence: 90,
      words: 960,
      pageEvidence: { conversationEvidence: 8, conversationNodes: 7, assistantHits: 3, userHits: 4, codeBlocks: 1, paragraphs: 7 },
      sections: [
        { title: "Debug prompt", text: repeated("The command failed. Explain the root cause and provide a working version.", 8), unitMeta: { role: "user", turnIndex: 0 } },
        { title: "Failed attempt", text: repeated("Something went wrong while generating response. Try again later.", 8), unitMeta: { role: "assistant", turnIndex: 1, hasFailedAnswer: true, isSuperseded: true } },
        { title: "User retry", text: repeated("Try again and fix the failed attempt with a working answer.", 8), unitMeta: { role: "user", turnIndex: 2 } },
        {
          title: "Revised working answer",
          text: "Corrected answer: the previous attempt failed because the command used the wrong environment variable. Use this instead and verify the output before committing.\nconst envName = process.env.APP_ENV || 'development';\nif (!envName) throw new Error('Missing APP_ENV');\nThis working version replaces the failed attempt and includes the check that prevents silent misconfiguration.",
          adapterScore: 12,
          codeBlocks: 1,
          unitMeta: { role: "assistant", turnIndex: 3, isLatestAssistant: true, answersLatestUser: true, hasRevision: true, replacesFailedAttempt: true, hasCompleteCode: true, hasFinalAnswer: true, isCompleteAssistantAnswer: true }
        },
        {
          title: "Verification recap",
          text: repeated("Summary: run the command, confirm the environment name, and check the error path before release.", 10),
          unitMeta: { role: "assistant", turnIndex: 4, hasSummary: true }
        }
      ]
    },
    {
      pageType: "chat",
      quiet: false,
      bestTitle: /Revised working answer/i,
      bestKind: /corrected_answer|complete_code/,
      label: /Corrected answer|Complete code/i,
      why: /replaces an earlier failed attempt|correction|Complete code/i,
      junkTitle: /Failed attempt|Debug prompt/i
    }
  ),
  runFixture(
    "Article main claim beats author bio newsletter and related links",
    {
      type: "article",
      label: "Article",
      quietMode: false,
      readingConfidence: 82,
      words: 760,
      pageEvidence: { articleEvidence: 6, quietEvidence: 2, paragraphs: 6 },
      sections: [
        { title: "Author bio", text: repeated("The author is a senior editor. Follow on social media and subscribe for weekly updates.", 10), adapterScore: -28, lowValue: true },
        {
          title: "Main claim",
          text: "The main claim is that local-first OCR reduces privacy risk while improving responsiveness because processing stays on the device. The article explains that private documents should not be uploaded merely to create navigation targets. It compares browser-side extraction with server workflows, notes that cached structure is smaller than raw documents, and argues that the most important design choice is keeping user text under local control. Therefore the recommended approach is to extract, rank, and navigate locally whenever the browser has enough information to do so.",
          adapterScore: 108,
          unitMeta: { diagnosticReason: "Main claim section has the strongest useful article signal" }
        },
        {
          title: "Evidence and implications",
          text: "The evidence section describes performance measurements, privacy tradeoffs, and failure modes. It reports that local extraction responds quickly for selectable documents, while scanned documents need explicit user consent because OCR is slower. The author also explains how section maps can improve reading without sending document contents to a remote service.",
          adapterScore: 78,
          unitMeta: { diagnosticReason: "Evidence section is a useful next article target" }
        },
        { title: "Newsletter signup", text: repeated("Subscribe to our newsletter for offers updates and partner messages.", 9), adapterScore: -36, lowValue: true },
        { title: "Related links", text: repeated("Related stories recommended links sponsored articles more from this publisher.", 9), adapterScore: -34, lowValue: true }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Main claim/i,
      label: /Best|Steps|Main argument|useful/i,
      why: /Main claim|Strong useful signal/i,
      junkTitle: /Author bio|Newsletter|Related links/i
    }
  ),
  runFixture(
    "Documentation quick start and usage beat navigation and changelog",
    {
      type: "docs",
      label: "Docs",
      quietMode: false,
      readingConfidence: 86,
      words: 680,
      pageEvidence: { articleEvidence: 3, quietEvidence: 2, paragraphs: 4 },
      sections: [
        { title: "Navigation", text: repeated("Overview API reference examples community pricing sidebar next previous.", 14), adapterScore: -24, lowValue: true },
        {
          title: "Quick start and usage",
          text: "Install the package with npm, create a client, provide the API key, and make a first request. The quick start then shows how to handle validation errors, retry a failed call, inspect the response object, and confirm that the returned status is ready for production use.\nconst client = createClient({ apiKey });\nconst response = await client.run({ input });",
          adapterScore: 104,
          codeBlocks: 1,
          unitMeta: { diagnosticReason: "Usage section has install, configuration, example, and error handling signals" }
        },
        {
          title: "Configuration options",
          text: "The configuration section explains required environment variables, retry behavior, timeout settings, and how to enable local development logging. It includes a short example and describes what each option changes in production.",
          adapterScore: 58,
          codeBlocks: 1,
          unitMeta: { diagnosticReason: "Configuration details are a useful next documentation target" }
        },
        { title: "Changelog", text: repeated("Release notes version patch dependency maintenance migration deprecation community support.", 14), adapterScore: -36 }
      ]
    },
    {
      pageType: "docs",
      quiet: false,
      bestTitle: /Quick start and usage/i,
      bestKind: /quick_start|usage|code_block|code_example|steps|useful_section/,
      label: /Quick start|Usage|Working example|Action steps|Code block|useful/i,
      why: /Quick start|Usage section|example|Strong useful signal/i,
      junkTitle: /Navigation|Changelog/i
    }
  ),
  runFixture(
    "Tutorial steps and code beat intro story and troubleshooting",
    {
      type: "tutorial",
      label: "Tutorial",
      quietMode: false,
      readingConfidence: 84,
      words: 760,
      pageEvidence: { articleEvidence: 4, quietEvidence: 1, paragraphs: 6 },
      sections: [
        { title: "Intro story", text: repeated("Last summer I learned this lesson while debugging a weekend side project and talking with friends.", 12), adapterScore: -12 },
        { title: "Setup", text: repeated("Install dependencies, create a config file, set environment variables, and confirm the development server starts.", 12), adapterScore: 42 },
        {
          title: "Step-by-step implementation",
          text: `${repeated("Step 1 create the route. Step 2 wire the parser. Step 3 add tests. Finally run the command and verify the result.", 14)}\nfunction buildFeature() { return true; }`,
          adapterScore: 74,
          codeBlocks: 1,
          numberedItems: 5,
          unitMeta: { diagnosticReason: "Step-by-step implementation combines procedure and code example signals" }
        },
        { title: "Troubleshooting", text: repeated("If the server fails, check the port, environment variables, and package install.", 10), adapterScore: 28 }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Step-by-step implementation/i,
      bestKind: /final_result|code_block|step_by_step|steps|code_example/,
      label: /Final result|Step|Action steps|Working example|Code block/i,
      why: /Step-by-step|procedure|Strong useful signal/i,
      junkTitle: /Intro story/i
    }
  ),
  runFixture(
    "Recipe instructions beat reviews and unrelated text",
    {
      type: "article",
      label: "Recipe",
      quietMode: false,
      readingConfidence: 78,
      words: 640,
      pageEvidence: { articleEvidence: 5, quietEvidence: 2, paragraphs: 5 },
      sections: [
        { title: "Personal note", text: repeated("This soup reminds me of winter evenings, family visits, and the old kitchen table.", 12), adapterScore: -16 },
        {
          title: "Ingredients",
          text: repeated("Ingredients include tomatoes onion garlic broth beans olive oil salt pepper and basil.", 12),
          adapterScore: 82,
          listItems: 8,
          unitMeta: { diagnosticReason: "Ingredients are a useful secondary recipe target" }
        },
        {
          title: "Instructions",
          text: repeated("Step 1 heat oil. Step 2 cook onion and garlic. Step 3 add tomatoes and broth. Step 4 simmer until thick. Step 5 season and serve.", 16),
          adapterScore: 78,
          numberedItems: 6,
          unitMeta: { diagnosticReason: "Recipe instructions provide the actionable procedure" }
        },
        { title: "Reviews", text: repeated("Five stars delicious family loved it will make again comments ratings ads sponsored cookware.", 12), adapterScore: -24, lowValue: true },
        { title: "Unrelated text", text: repeated("Privacy policy affiliate disclosure recommended articles newsletter signup.", 10), adapterScore: -38, lowValue: true }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Instructions/i,
      bestKind: /instructions|steps|useful_section/,
      label: /Instructions|Action steps|Steps|This looks useful|Best place/i,
      why: /Recipe instructions|procedure|Strong useful signal/i,
      junkTitle: /Reviews|Unrelated/i
    }
  ),
  runFixture(
    "Research page results beat methods and references",
    {
      type: "article",
      label: "Research",
      quietMode: false,
      readingConfidence: 84,
      words: 900,
      pageEvidence: { articleEvidence: 6, quietEvidence: 1, paragraphs: 7 },
      sections: [
        { title: "Abstract", text: repeated("Abstract. This study evaluates local OCR accuracy and summarizes the central claim and evidence.", 12), adapterScore: 70, unitMeta: { pdfSectionType: "abstract" } },
        { title: "Methods", text: repeated("Methods. We sampled documents, controlled device class, measured latency, and compared OCR variants.", 12), adapterScore: 42, unitMeta: { pdfSectionType: "methods" } },
        {
          title: "Results",
          text: "Results. The treatment improved accuracy by 18 percent and reduced time by 32 percent across the sampled scanned documents. The strongest finding is that early stopping preserved quality while lowering latency on slower devices. Error analysis showed fewer blank-page failures, better section recovery, and more stable confidence when the parser compared structured candidates instead of accepting the first long result.",
          adapterScore: 118,
          unitMeta: { pdfSectionType: "results", diagnosticReason: "Results section contains the main findings and measured evidence" }
        },
        { title: "Conclusion", text: repeated("Conclusion. These findings support local processing and careful fallback behavior.", 10), adapterScore: 24, unitMeta: { pdfSectionType: "conclusion" } },
        { title: "References", text: repeated("Journal reference volume page doi bibliography citation appendix.", 14), adapterScore: -30, lowValue: true }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Results/i,
      bestKind: /results|useful_section/,
      label: /Results|Best place|useful/i,
      why: /Results section|Strong useful signal/i,
      junkTitle: /References/i
    }
  ),
  runFixture(
    "Article summary and conclusion beat comments ads and related links",
    {
      type: "article",
      label: "Article",
      quietMode: false,
      readingConfidence: 84,
      words: 820,
      pageEvidence: { articleEvidence: 6, quietEvidence: 3, paragraphs: 6 },
      sections: [
        { title: "Sponsored module", text: repeated("Sponsored advertisement limited offer newsletter signup related posts recommended articles.", 10), adapterScore: -30, lowValue: true },
        {
          title: "Key evidence",
          text: "Key evidence shows that readers complete the workflow faster when the useful summary is placed before the long background section. The article compares completion rate, scroll depth, and return visits, and it explains why the measured evidence supports the main claim.",
          adapterScore: 64,
          unitMeta: { diagnosticReason: "Key evidence supports the article's main point" }
        },
        {
          title: "Summary and conclusion",
          text: "Summary: the main takeaway is that teams should expose the short useful path first, then keep deeper context available for readers who want it. Conclusion: the strongest claim is that reducing clutter improves comprehension without hiding the evidence that supports the decision.",
          adapterScore: 82,
          unitMeta: { diagnosticReason: "Summary and conclusion capture the article's useful takeaway" }
        },
        { title: "Comments", text: repeated("Comments reply share report profile avatar login account cookie preferences.", 12), adapterScore: -36, lowValue: true },
        { title: "Related links", text: repeated("Related links also read recommended articles from our partners newsletter signup.", 10), adapterScore: -34, lowValue: true }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Summary and conclusion/i,
      bestKind: /summary|conclusion/,
      label: /Summary|Conclusion/i,
      why: /Summary|Conclusion|article/i,
      junkTitle: /Sponsored|Comments|Related links/i
    }
  ),
  runFixture(
    "Documentation parameters and troubleshooting beat account UI and changelog",
    {
      type: "docs",
      label: "Docs",
      quietMode: false,
      readingConfidence: 86,
      words: 760,
      pageEvidence: { articleEvidence: 3, quietEvidence: 3, paragraphs: 5 },
      sections: [
        { title: "Account navigation", text: repeated("Login account dashboard billing team settings profile cookie preferences menu navigation.", 10), adapterScore: -30, lowValue: true },
        {
          title: "Parameters and options",
          text: "Parameters define timeoutMs, retryCount, mode, outputFormat, and headers. Each option explains the default value, accepted values, validation behavior, and what changes in the returned response object.",
          adapterScore: 68,
          listItems: 6,
          unitMeta: { diagnosticReason: "Parameter and option details are useful implementation guidance" }
        },
        {
          title: "Troubleshooting failed requests",
          text: "Troubleshooting: if the request fails, inspect the status code, verify the API key, retry idempotent calls, and log the response body. This section explains the common error messages and the exact fix for each issue.",
          adapterScore: 76,
          unitMeta: { diagnosticReason: "Troubleshooting section helps resolve likely issues" }
        },
        { title: "Changelog", text: repeated("Release notes version history deprecated dependency patch maintenance breaking changes.", 12), adapterScore: -20, lowValue: true }
      ]
    },
    {
      pageType: "docs",
      quiet: false,
      bestTitle: /Troubleshooting failed requests/i,
      bestKind: /troubleshooting/,
      label: /Troubleshooting/i,
      why: /Troubleshooting|resolve likely issues/i,
      junkTitle: /Account navigation|Changelog/i
    }
  ),
  runFixture(
    "Tutorial actionable steps beat related links and sidebar clutter",
    {
      type: "tutorial",
      label: "Tutorial",
      quietMode: false,
      readingConfidence: 84,
      words: 820,
      pageEvidence: { articleEvidence: 4, quietEvidence: 3, paragraphs: 6 },
      sections: [
        { title: "Sidebar links", text: repeated("Previous next related tutorials newsletter popular courses account login sidebar navigation.", 10), adapterScore: -30, lowValue: true },
        {
          title: "Prerequisites",
          text: repeated("Prerequisites include Node installed, a terminal, an editor, and access to the sample repository before starting.", 10),
          adapterScore: 34,
          unitMeta: { diagnosticReason: "Prerequisites clarify what is needed before starting" }
        },
        {
          title: "Actionable build steps",
          text: `${repeated("Step 1 create the project. Step 2 install dependencies. Step 3 configure the environment. Step 4 run the command. Step 5 verify the final result.", 12)}\nconst server = createServer(config);`,
          adapterScore: 72,
          codeBlocks: 1,
          numberedItems: 5,
          unitMeta: { diagnosticReason: "Actionable tutorial steps are the main path through the page" }
        },
        {
          title: "Troubleshooting and final result",
          text: repeated("If the output fails, check the port and environment variable. The final result should show a passing status and a rendered preview.", 10),
          adapterScore: 44,
          unitMeta: { diagnosticReason: "Final result shows what the tutorial should produce" }
        },
        { title: "Related articles", text: repeated("Related links recommended tutorials sponsored bootcamp newsletter signup.", 12), adapterScore: -32, lowValue: true }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Actionable build steps/i,
      bestKind: /steps|code_block|final_result/,
      label: /Steps|Action steps|Code block/i,
      why: /Actionable tutorial steps|main path|procedure/i,
      junkTitle: /Sidebar links|Related articles/i
    }
  ),
  runFixture(
    "Recipe timing and useful tips beat reviews affiliate clutter",
    {
      type: "article",
      label: "Recipe",
      quietMode: false,
      readingConfidence: 80,
      words: 700,
      pageEvidence: { articleEvidence: 5, quietEvidence: 3, paragraphs: 5 },
      sections: [
        { title: "Affiliate cookware", text: repeated("Sponsored cookware affiliate disclosure buy now limited offer recommended products newsletter.", 10), adapterScore: -34, lowValue: true },
        {
          title: "Ingredients",
          text: repeated("Ingredients include flour sugar butter eggs milk vanilla baking powder salt and berries.", 10),
          adapterScore: 56,
          listItems: 9,
          unitMeta: { diagnosticReason: "Ingredients are core recipe content" }
        },
        {
          title: "Instructions and timing",
          text: repeated("Instructions: mix the dry ingredients, whisk the wet ingredients, fold gently, bake for 22 minutes, rest for 10 minutes, and serve warm.", 13),
          adapterScore: 78,
          numberedItems: 5,
          unitMeta: { diagnosticReason: "Recipe instructions provide the actionable method" }
        },
        {
          title: "Useful tips",
          text: repeated("Tips: use cold butter, do not overmix, substitute frozen berries without thawing, and store leftovers covered overnight.", 9),
          adapterScore: 46,
          unitMeta: { diagnosticReason: "Useful tips improve the recipe outcome" }
        },
        { title: "Reviews", text: repeated("Five stars comments ratings family loved it profile account login.", 12), adapterScore: -26, lowValue: true }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Instructions and timing/i,
      bestKind: /instructions|steps|timing/,
      label: /Instructions|Steps|Timing/i,
      why: /Recipe instructions|actionable method/i,
      junkTitle: /Affiliate|Reviews/i
    }
  ),
  runFixture(
    "Research discussion and results beat repeated headers and references",
    {
      type: "article",
      label: "Research",
      quietMode: false,
      readingConfidence: 86,
      words: 980,
      pageEvidence: { articleEvidence: 6, quietEvidence: 2, paragraphs: 7 },
      sections: [
        { title: "Running header", text: repeated("Journal of Example Studies page 4 of 16 downloaded from journal homepage.", 12), adapterScore: -32, lowValue: true },
        { title: "Methods", text: repeated("Methods. We recruited participants, randomized conditions, recorded observations, and specified the analysis plan.", 12), adapterScore: 42, unitMeta: { diagnosticReason: "Methods explain how the research was done" } },
        {
          title: "Results and findings",
          text: "Results. The intervention improved completion by 21 percent, reduced repeated errors, and increased retention after one week. Findings show the effect remained significant after controlling for baseline familiarity and device class.",
          adapterScore: 86,
          unitMeta: { diagnosticReason: "Results section contains the main findings" }
        },
        {
          title: "Discussion",
          text: "Discussion. The results suggest that clearer structure reduces cognitive load, but the study is limited by sample size. The implication is that navigation aids should emphasize findings and conclusions before references.",
          adapterScore: 62,
          unitMeta: { diagnosticReason: "Discussion interprets the research findings" }
        },
        { title: "References", text: repeated("References bibliography citation doi volume issue journal retrieved from.", 14), adapterScore: -34, lowValue: true }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Results and findings/i,
      bestKind: /results/,
      label: /Results/i,
      why: /Results section|main findings/i,
      junkTitle: /Running header|References/i
    }
  ),
  runFixture(
    "Selectable-text PDF abstract beats footer and references",
    {
      type: "pdf",
      label: "PDF",
      quietMode: false,
      readingConfidence: 82,
      words: 720,
      pageEvidence: { articleEvidence: 2, quietEvidence: 0, paragraphs: 0 },
      sections: [
        { title: "Page footer", text: repeated("Page 1 copyright downloaded from journal homepage.", 8), adapterScore: -28, unitMeta: { pageNumber: 1, pdfSectionType: "boilerplate" } },
        { title: "Abstract", text: repeated("Abstract. This selectable PDF states the main claim, key evidence, measured results, and conclusion.", 16), adapterScore: 56, unitMeta: { pageNumber: 1, pdfSectionType: "abstract" } },
        { title: "Results", text: repeated("Results. The experiment reports measured improvement, error analysis, and comparison against the baseline method.", 12), adapterScore: 50, unitMeta: { pageNumber: 4, pdfSectionType: "results" } },
        { title: "References", text: repeated("References citation doi volume issue bibliography.", 12), adapterScore: -24, unitMeta: { pageNumber: 7, pdfSectionType: "boilerplate" } }
      ]
    },
    {
      pageType: "pdf",
      quiet: false,
      bestTitle: /Abstract/i,
      bestKind: /abstract/,
      label: /Abstract/i,
      why: /Summary|Abstract|Strong useful signal/i,
      junkTitle: /footer|References/i
    }
  ),
  runFixture(
    "OCR letter body beats letterhead reference recipient and signature",
    {
      type: "pdf",
      label: "PDF",
      quietMode: false,
      readingConfidence: 82,
      words: 260,
      pageEvidence: { articleEvidence: 2, quietEvidence: 0, paragraphs: 0 },
      sections: [
        { title: "Letterhead", text: "THE SLEREXE COMPANY LIMITED SAPORS LANE BOOLE DORSET TELEPHONE BOOLE 51617 TELEX 123456", adapterScore: -20, unitMeta: { pageNumber: 1, pdfSectionType: "title_page", ocrRole: "letterhead" } },
        { title: "Our Ref. 350/PJC/EAC", text: "Our Ref. 350/PJC/EAC 18th January 1972", adapterScore: -14, unitMeta: { pageNumber: 1, ocrRole: "date_reference" } },
        { title: "Dr. P.N. Cundall", text: "Dr. P.N. Cundall Mining Surveys Ltd Holy Road Reading Berks", adapterScore: -12, unitMeta: { pageNumber: 1, ocrRole: "recipient" } },
        { title: "Dear Pete", text: "Dear Pete,", adapterScore: -8, unitMeta: { pageNumber: 1, ocrRole: "greeting" } },
        {
          title: "Permit me to introduce",
          text: repeated("Permit me to introduce you to the facility of facsimile transmission. In facsimile a photocell performs a raster scan over the copy. Please review this explanation because it describes how the signal is transmitted to a remote destination.", 2),
          adapterScore: 64,
          unitMeta: { pageNumber: 1, ocrRole: "body", diagnosticReason: "this paragraph is the main body of the scanned letter, not the letterhead or signature" }
        },
        {
          title: "Facsimile explanation",
          text: "The document then explains that the receiving equipment reconstructs the scan line by line and prints a copy for the recipient. It asks the reader to consider how the equipment could support faster exchange of technical drawings and written correspondence.",
          adapterScore: 52,
          unitMeta: { pageNumber: 1, ocrRole: "body", diagnosticReason: "secondary body paragraph is useful letter content" }
        },
        { title: "Yours sincerely", text: "Yours sincerely P.J. Cross Group Leader Facsimile Research", adapterScore: -16, unitMeta: { pageNumber: 1, pdfSectionType: "signature", ocrRole: "signature" } }
      ]
    },
    {
      pageType: "pdf",
      quiet: false,
      bestTitle: /Permit me/i,
      bestKind: /body/,
      label: /Main body/i,
      why: /main body|letterhead|signature/i,
      junkTitle: /Letterhead|Our Ref|Dr\. P\.N\. Cundall|Yours sincerely/i
    }
  ),
  runFixture(
    "OCR research page results beat footer noise",
    {
      type: "pdf",
      label: "PDF",
      quietMode: false,
      readingConfidence: 78,
      words: 620,
      pageEvidence: { articleEvidence: 2, quietEvidence: 0, paragraphs: 0 },
      sections: [
        { title: "OCR footer", text: repeated("Page 1 of 12 copyright all rights reserved downloaded from journal homepage.", 8), adapterScore: -28, unitMeta: { pageNumber: 1, pdfSectionType: "boilerplate", ocrRole: "footer" } },
        { title: "Abstract", text: repeated("Abstract. This scanned research page presents the main claim, key evidence, dates, named entities, results, and conclusion.", 16), adapterScore: 58, unitMeta: { pageNumber: 1, pdfSectionType: "abstract", ocrRole: "body" } },
        { title: "Results", text: "Results. OCR recovered the measured outcome, comparison table summary, and conclusion language clearly enough to support a second navigation target on the scanned page.", adapterScore: 50, unitMeta: { pageNumber: 3, pdfSectionType: "results", ocrRole: "body", diagnosticReason: "Results section contains recovered OCR findings" } },
        { title: "References", text: repeated("References bibliography citation doi OCR smudge scan footer.", 9), adapterScore: -26, unitMeta: { pageNumber: 6, pdfSectionType: "boilerplate", ocrRole: "footer" } }
      ]
    },
    {
      pageType: "pdf",
      quiet: false,
      bestTitle: /Results/i,
      bestKind: /results|body/,
      label: /Results|Main body/i,
      why: /Results section|main body|Strong useful signal/i,
      junkTitle: /footer|References/i
    }
  ),
  runFixture(
    "OCR form notice beats scan fragments",
    {
      type: "pdf",
      label: "PDF",
      quietMode: false,
      readingConfidence: 72,
      words: 380,
      pageEvidence: { articleEvidence: 1, quietEvidence: 0, paragraphs: 0 },
      sections: [
        { title: "Scan fragments", text: repeated("_ _ | | 003 Page 2 fax copy confidential", 8), adapterScore: -34, unitMeta: { pageNumber: 2, pdfSectionType: "boilerplate", ocrRole: "footer" } },
        { title: "Notice of determination", text: "Notice date March 12 2026. Claim number AB-1234. Jane Smith must respond by April 15 2026. The determination explains the approved amount, required documents, mailing address, and authorized representative signature line.", adapterScore: 92, unitMeta: { pageNumber: 1, pdfSectionType: "form", diagnosticReason: "Form or notice with dates names and identifiers" } },
        { title: "Required response", text: "Required response. Submit the signed appeal form, include the claim number on every page, and mail the documents before the deadline shown in the notice immediately.", adapterScore: 52, unitMeta: { pageNumber: 1, pdfSectionType: "form", diagnosticReason: "Required response instructions are a useful next form target" } },
        { title: "Routing barcode", text: repeated("barcode batch page scan office use only duplicate copy.", 8), adapterScore: -26, unitMeta: { pageNumber: 1, pdfSectionType: "boilerplate" } }
      ]
    },
    {
      pageType: "pdf",
      quiet: false,
      bestTitle: /Notice of determination/i,
      bestKind: /form/,
      label: /Form|notice/i,
      why: /Form or notice|Strong useful signal/i,
      junkTitle: /Scan fragments|Routing barcode/i
    }
  ),
  runFixture(
    "Theme intent nudges article evidence while newsletter stays down-ranked",
    {
      type: "article",
      label: "Article",
      title: "Battery recycling policy cuts mineral waste",
      url: "https://example.test/analysis/battery-recycling-policy-mineral-waste",
      quietMode: false,
      readingConfidence: 76,
      words: 720,
      pageEvidence: { articleEvidence: 6, quietEvidence: 1, paragraphs: 8 },
      sections: [
        {
          title: "Main claim: battery recycling cuts mineral waste",
          text: repeated("The main claim is that battery recycling policy can reduce mineral waste while preserving supply resilience. Key evidence from pilot programs shows lower disposal costs, less extraction pressure, and measurable recovery of lithium and nickel.", 9),
          adapterScore: 14
        },
        {
          title: "Key evidence from city programs",
          text: repeated("Evidence from city recycling programs shows measured collection gains, clearer producer responsibility, and practical implementation details for battery recovery.", 10),
          adapterScore: 8
        },
        {
          title: "Newsletter: battery recycling policy updates",
          text: repeated("Subscribe to the battery recycling policy newsletter, get related links, author updates, comments, privacy settings, and recommended posts.", 10),
          adapterScore: -22,
          classTrail: "newsletter subscribe related"
        },
        {
          title: "Author bio",
          text: repeated("The author writes about technology policy and invites readers to follow social links and related posts.", 8),
          adapterScore: -20,
          classTrail: "author-bio related"
        }
      ]
    },
    {
      pageType: "article",
      quiet: false,
      bestTitle: /Key evidence/i,
      bestKind: /steps|key_evidence|main_argument/,
      label: /Steps|Key evidence|Main argument/i,
      why: /Key evidence|theme|article/i,
      junkTitle: /Newsletter|Author bio/i,
      expectThemeIntent: true,
      themeTerm: /battery|recycling|evidence/
    }
  ),
  runFixture(
    "Theme intent nudges docs quick start over changelog",
    {
      type: "docs",
      label: "Documentation",
      title: "Vector cache SDK documentation",
      url: "https://docs.example.test/vector-cache/sdk/quick-start",
      quietMode: false,
      readingConfidence: 78,
      words: 680,
      pageEvidence: { articleEvidence: 2, quietEvidence: 1, paragraphs: 7 },
      sections: [
        {
          title: "Quick start for the vector cache SDK",
          text: repeated("Quick start: install the vector cache SDK, create a client, configure the cache namespace, run the example request, and verify the response object.", 11),
          adapterScore: 10,
          codeBlocks: 1
        },
        {
          title: "Usage examples",
          text: repeated("Usage examples show how to read, write, and invalidate vector cache entries with parameters and expected responses.", 10),
          adapterScore: 8,
          codeBlocks: 1
        },
        {
          title: "Changelog for vector cache SDK",
          text: repeated("Changelog version history deprecated changes old releases breaking changes and migration notes.", 11),
          adapterScore: -16
        },
        {
          title: "Navigation",
          text: repeated("Docs navigation overview account settings login cookies sidebar table of contents.", 10),
          adapterScore: -24,
          classTrail: "navigation sidebar"
        }
      ]
    },
    {
      pageType: "docs",
      quiet: false,
      bestTitle: /Quick start/i,
      bestKind: /quick_start/,
      label: /Quick start/i,
      why: /Quick start|theme|documentation intent/i,
      junkTitle: /Changelog|Navigation/i,
      expectThemeIntent: true,
      themeTerm: /vector|cache/
    }
  ),
  runFixture(
    "Theme intent nudges tutorial setup over intro story",
    {
      type: "tutorial",
      label: "Tutorial",
      title: "Deploy an edge function with logs",
      url: "https://learn.example.test/tutorials/deploy-edge-function-logs",
      quietMode: false,
      readingConfidence: 76,
      words: 760,
      pageEvidence: { articleEvidence: 2, quietEvidence: 1, paragraphs: 8 },
      sections: [
        {
          title: "Intro story",
          text: repeated("When I first learned about edge functions I tried many tools and read many related tutorials before finding a smooth workflow.", 13),
          adapterScore: -8
        },
        {
          title: "Setup the edge function project",
          text: repeated("Setup: create the edge function project, install the CLI, configure environment variables, run the local development command, and verify the logs before deployment.", 10),
          adapterScore: 12,
          codeBlocks: 1
        },
        {
          title: "Step 1 deploy and inspect logs",
          text: repeated("Step 1 deploy the edge function, then open the logs stream, compare the request output, and confirm the final result.", 10),
          adapterScore: 8,
          numberedItems: 3
        },
        {
          title: "Related tutorials",
          text: repeated("Related links newsletter comments social share recommended tutorial sidebar advertisement.", 10),
          adapterScore: -22,
          classTrail: "related newsletter sidebar"
        }
      ]
    },
    {
      pageType: "tutorial",
      quiet: false,
      bestTitle: /Setup/i,
      bestKind: /setup|steps|installation/,
      label: /Setup|Steps|Installation/i,
      why: /Setup|tutorial intent|theme/i,
      junkTitle: /Intro story|Related tutorials/i,
      expectThemeIntent: true,
      themeTerm: /edge|function|logs/
    }
  ),
  runFixture(
    "Theme intent nudges recipe instructions while reviews stay down-ranked",
    {
      type: "recipe",
      label: "Recipe",
      title: "Lemon herb salmon recipe",
      url: "https://recipes.example.test/lemon-herb-salmon",
      quietMode: false,
      readingConfidence: 76,
      words: 680,
      pageEvidence: { articleEvidence: 2, quietEvidence: 1, paragraphs: 7 },
      sections: [
        {
          title: "Ingredients for lemon herb salmon",
          text: repeated("Ingredients include salmon fillets, lemon zest, parsley, dill, olive oil, garlic, salt, pepper, and a small amount of butter.", 9),
          adapterScore: 8
        },
        {
          title: "Instructions for lemon herb salmon",
          text: repeated("Instructions: season the salmon, brush with lemon herb oil, bake for twelve minutes, rest briefly, and serve with the pan juices.", 11),
          adapterScore: 12,
          numberedItems: 3
        },
        {
          title: "Reader reviews",
          text: repeated("Five stars affiliate links recommended pans sponsored products comments reviews subscribe related recipes.", 11),
          adapterScore: -22,
          classTrail: "reviews affiliate related"
        },
        {
          title: "Cooking tips",
          text: repeated("Tips: check the thickest part, avoid overcooking, and add extra lemon after baking for a brighter flavor.", 8),
          adapterScore: 6
        }
      ]
    },
    {
      pageType: "recipe",
      quiet: false,
      bestTitle: /Instructions/i,
      bestKind: /instructions|steps/,
      label: /Instructions|Steps/i,
      why: /Recipe instructions|recipe intent|theme/i,
      junkTitle: /Reader reviews/i,
      expectThemeIntent: true,
      themeTerm: /lemon|salmon/
    }
  ),
  runFixture(
    "Theme intent nudges research results over references",
    {
      type: "research",
      label: "Research",
      title: "Urban heat island mitigation results",
      url: "https://journal.example.test/urban-heat-island-mitigation-results",
      quietMode: false,
      readingConfidence: 80,
      words: 820,
      pageEvidence: { articleEvidence: 2, quietEvidence: 1, paragraphs: 8 },
      sections: [
        {
          title: "Abstract",
          text: repeated("Abstract. This research studies urban heat island mitigation and summarizes methods, measured temperature changes, and conclusions.", 11),
          adapterScore: 8
        },
        {
          title: "Results: urban heat island mitigation",
          text: repeated("Results show that urban heat island mitigation reduced afternoon surface temperatures, improved nighttime cooling, and produced measurable differences across shaded streets and reflective roofs.", 10),
          adapterScore: 14
        },
        {
          title: "Conclusion",
          text: repeated("Conclusion: the mitigation program was most effective where shade trees and reflective surfaces were combined, and the finding supports targeted neighborhood investment.", 9),
          adapterScore: 10
        },
        {
          title: "References",
          text: repeated("References DOI journal citation bibliography retrieved from volume issue page number.", 14),
          adapterScore: -20
        }
      ]
    },
    {
      pageType: "research",
      quiet: false,
      bestTitle: /Results|Conclusion/i,
      bestKind: /results|conclusion/,
      label: /Results|Conclusion/i,
      why: /Results|Conclusion|research intent|theme/i,
      junkTitle: /References/i,
      expectThemeIntent: true,
      themeTerm: /urban|heat|mitigation/
    }
  ),
  runFixture(
    "Theme terms do not create a target on quiet dashboard",
    {
      type: "app_dashboard",
      label: "Dashboard",
      title: "Revenue dashboard export dashboard",
      url: "https://app.example.test/revenue-dashboard/export",
      quietMode: true,
      readingConfidence: 24,
      words: 100,
      pageEvidence: { quietEvidence: 10, articleEvidence: 0, paragraphs: 0, controls: 30 },
      sections: [
        { title: "Revenue dashboard export", text: repeated("Revenue dashboard export filters settings account billing profile save cancel", 10), adapterScore: -20 }
      ]
    },
    {
      pageType: "app_dashboard",
      quiet: true,
      expectNoThemeIntent: true
    }
  ),
  runFixture(
    "Short page stays quiet",
    {
      type: "low_structure",
      label: "Page",
      quietMode: true,
      readingConfidence: 24,
      words: 45,
      pageEvidence: { quietEvidence: 8, articleEvidence: 0, paragraphs: 0 },
      sections: [
        { title: "Tiny page", text: "Welcome sign in profile settings help links", adapterScore: -12 }
      ]
    },
    {
      pageType: "low_structure",
      quiet: true
    }
  ),
  runFixture(
    "Dashboard stays quiet",
    {
      type: "app_dashboard",
      label: "App",
      quietMode: true,
      readingConfidence: 24,
      words: 90,
      pageEvidence: { quietEvidence: 10, articleEvidence: 0, paragraphs: 0, controls: 30 },
      sections: [
        { title: "Settings", text: "Billing export profile permissions account settings save cancel", adapterScore: -20 }
      ]
    },
    {
      pageType: "app_dashboard",
      quiet: true
    }
  ),
  runFixture(
    "Product page stays quiet",
    {
      type: "shopping_product",
      label: "Product page",
      quietMode: true,
      readingConfidence: 30,
      words: 160,
      pageEvidence: { quietEvidence: 9, articleEvidence: 0, commerceNodes: 10, paragraphs: 0 },
      sections: [
        { title: "Product card", text: repeated("Buy now cart price sale color size shipping reviews sponsored recommended products.", 12), adapterScore: -40 }
      ]
    },
    {
      pageType: "shopping_product",
      quiet: true
    }
  )
];

for (const testCase of cases) {
  testCase.run();
  console.log(`ok - ${testCase.name}`);
}
