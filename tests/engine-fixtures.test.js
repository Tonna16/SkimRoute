const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const engineCode = fs.readFileSync(path.join(root, "content", "engine.js"), "utf8");
const sandbox = {
  window: {},
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
  return result.sections.find((section) => section.id === result.recommendation.bestSectionId);
}

function repeated(words, count) {
  return Array.from({ length: count }, () => words).join(" ");
}

const cases = [
  {
    name: "Google search with AI Overview targets AI Overview",
    run() {
      const result = analyze({
        type: "search_results",
        label: "Search Results",
        quietMode: false,
        readingConfidence: 72,
        words: 260,
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
            adapterScore: 70,
            unitMeta: { kind: "search-block", searchBlockType: "top_results" }
          }
        ]
      });
      assert(result.pageProfile.type === "search_results", "expected search profile");
      assert(!result.pageProfile.quietMode, "search with AI map should not be quiet");
      assert(best(result).unitMeta.searchBlockType === "ai_overview", "AI Overview should be best");
      assert(/AI Overview/i.test(result.recommendation.bestLabel), "best label should name AI Overview");
    }
  },
  {
    name: "Google search without AI Overview targets top results",
    run() {
      const result = analyze({
        type: "search_results",
        label: "Search Results",
        quietMode: false,
        readingConfidence: 70,
        words: 240,
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
            unitMeta: { kind: "search-block", searchBlockType: "people_also_ask" }
          }
        ]
      });
      assert(!result.pageProfile.quietMode, "search result map should not be quiet");
      assert(best(result).unitMeta.searchBlockType === "top_results", "top results should be best");
    }
  },
  {
    name: "Chat final recommendation beats old draft and user prompt",
    run() {
      const result = analyze({
        type: "chat",
        label: "ChatGPT",
        quietMode: false,
        readingConfidence: 88,
        words: 540,
        pageEvidence: { conversationEvidence: 6, conversationNodes: 6, assistantHits: 3, userHits: 2, codeBlocks: 0, paragraphs: 4 },
        sections: [
          {
            title: "Question",
            text: repeated("Can you recommend the safest implementation approach?", 10),
            unitMeta: { role: "user" }
          },
          {
            title: "Earlier answer",
            text: repeated("One possible draft might work, but it may not handle the edge case.", 18),
            unitMeta: { role: "assistant", isSuperseded: true }
          },
          {
            title: "Final recommendation",
            text: repeated("Final answer: my recommendation is to use the smaller targeted change because it preserves existing behavior and handles the edge case.", 18),
            unitMeta: { role: "assistant", isLatestAssistant: true, hasFinalAnswer: true }
          }
        ]
      });
      assert(best(result).metrics.sectionKind === "final_recommendation", "final recommendation should win");
      assert(/Final recommendation/i.test(result.recommendation.bestKindLabel), "label should name final recommendation");
    }
  },
  {
    name: "Chat complete code beats short confirmation",
    run() {
      const result = analyze({
        type: "chat",
        label: "Claude",
        quietMode: false,
        readingConfidence: 86,
        words: 420,
        pageEvidence: { conversationEvidence: 5, conversationNodes: 5, assistantHits: 2, userHits: 2, codeBlocks: 1, paragraphs: 3 },
        sections: [
          { title: "Assistant", text: "Sure.", unitMeta: { role: "assistant" } },
          {
            title: "Latest answer with code",
            text: `${repeated("Complete working version. Copy and paste this implementation and run the test command.", 12)}\nfunction runTask() { return true; }`,
            codeBlocks: 1,
            unitMeta: { role: "assistant", isLatestAssistant: true, hasCompleteCode: true }
          }
        ]
      });
      assert(/code/i.test(best(result).metrics.sectionKindLabel), "complete code should win");
    }
  },
  {
    name: "Chat answer after latest correction beats earlier final draft",
    run() {
      const result = analyze({
        type: "chat",
        label: "ChatGPT",
        quietMode: false,
        readingConfidence: 88,
        words: 720,
        pageEvidence: { conversationEvidence: 7, conversationNodes: 7, assistantHits: 3, userHits: 3, codeBlocks: 0, paragraphs: 5 },
        sections: [
          {
            title: "Question",
            text: repeated("Recommend the implementation strategy for this extension release.", 8),
            unitMeta: { role: "user", turnIndex: 0 }
          },
          {
            title: "Earlier final answer",
            text: repeated("Final answer: use the broad rewrite because it solves everything at once but carries migration risk.", 18),
            unitMeta: { role: "assistant", turnIndex: 1, hasFinalAnswer: true, isSuperseded: true }
          },
          {
            title: "Correction",
            text: repeated("Actually do not rewrite it. Fix the smallest release blockers and preserve existing behavior.", 8),
            unitMeta: { role: "user", turnIndex: 2 }
          },
          {
            title: "Corrected answer",
            text: repeated("Corrected answer: use targeted fixes for OCR, chat loading, and page detection. This preserves existing behavior and addresses the launch blockers.", 18),
            unitMeta: { role: "assistant", turnIndex: 3, isLatestAssistant: true, answersLatestUser: true, isAfterUserCorrection: true, hasRevision: true }
          }
        ]
      });
      assert(best(result).metrics.sectionKind === "corrected_answer", "corrected answer should win");
      assert(/correct/i.test(result.recommendation.bestKindLabel), "label should name corrected answer");
      assert(/correction|latest user/i.test(result.recommendation.targetConfidenceReason), "why should mention latest correction/request");
    }
  },
  {
    name: "GitHub-like page with prose classes does not become chat",
    run() {
      const result = analyze({
        type: "low_structure",
        label: "Page",
        quietMode: true,
        readingConfidence: 28,
        words: 220,
        pageEvidence: { conversationEvidence: 5, conversationNodes: 6, assistantHits: 0, userHits: 0, codeBlocks: 2, paragraphs: 2, quietEvidence: 8, articleEvidence: 1 },
        sections: [
          {
            title: "README rendered markdown",
            text: repeated("Response parser implementation code issue pull request markdown prose repository actions settings.", 18),
            classTrail: "markdown prose comment-body"
          }
        ]
      });
      assert(result.pageProfile.type !== "chat", "github-like prose should not upgrade to chat");
      assert(result.pageProfile.quietMode, "github-like utility page should stay quiet");
    }
  },
  {
    name: "OCR PDF ranks abstract over footer noise",
    run() {
      const result = analyze({
        type: "pdf",
        label: "PDF",
        quietMode: false,
        readingConfidence: 78,
        words: 620,
        pageEvidence: { articleEvidence: 2, quietEvidence: 0, paragraphs: 0 },
        sections: [
          {
            title: "Page 1 footer",
            text: repeated("Page 1 of 12 copyright all rights reserved downloaded from journal homepage.", 8),
            unitMeta: { pageNumber: 1, pdfSectionType: "boilerplate" }
          },
          {
            title: "Abstract",
            text: repeated("Abstract. This paper presents the main claim, key evidence, dates, named entities, results, and conclusion.", 16),
            unitMeta: { pageNumber: 1, pdfSectionType: "abstract" }
          }
        ]
      });
      assert(best(result).metrics.sectionKind === "abstract", "abstract should beat footer noise");
    }
  },
  {
    name: "OCR PDF form notice beats scan fragments",
    run() {
      const result = analyze({
        type: "pdf",
        label: "PDF",
        quietMode: false,
        readingConfidence: 70,
        words: 360,
        pageEvidence: { articleEvidence: 1, quietEvidence: 0, paragraphs: 0 },
        sections: [
          {
            title: "Scan fragments",
            text: repeated("_ _ | | 003 Page 2 fax copy confidential", 8),
            unitMeta: { pageNumber: 2, pdfSectionType: "boilerplate" }
          },
          {
            title: "Notice of determination",
            text: repeated("Notice date March 12 2026 claim number AB-1234 Jane Smith must respond by April 15 2026 signature authorized representative.", 14),
            unitMeta: { pageNumber: 1, pdfSectionType: "form" }
          }
        ]
      });
      assert(best(result).metrics.sectionKind === "form", "form or notice should beat OCR fragments");
      assert(/Form|notice/i.test(result.recommendation.bestKindLabel), "label should name form/notice");
    }
  },
  {
    name: "OCR PDF scanned letter body beats letterhead and signature",
    run() {
      const result = analyze({
        type: "pdf",
        label: "PDF",
        quietMode: false,
        readingConfidence: 76,
        words: 260,
        pageEvidence: { articleEvidence: 2, quietEvidence: 0, paragraphs: 0 },
        sections: [
          {
            title: "Company letterhead",
            text: "ACME EXPORTS LIMITED 14 Market Street London Telephone 020 5555 Telex 12345 Fax 020 5556",
            unitMeta: { pageNumber: 1, pdfSectionType: "title_page", ocrRole: "letterhead" }
          },
          {
            title: "Letter body",
            text: repeated("Permit me to introduce our request regarding the enclosed materials. Please review the details because they explain the reason for the recommendation and the action needed.", 4),
            unitMeta: { pageNumber: 1, ocrRole: "body", diagnosticReason: "this paragraph is the main body of the scanned letter, not the letterhead or signature" }
          },
          {
            title: "Signature",
            text: "Yours faithfully P.J. Smith Signature",
            unitMeta: { pageNumber: 1, pdfSectionType: "signature", ocrRole: "signature" }
          }
        ]
      });
      assert(best(result).metrics.ocrRole === "body", "letter body should beat letterhead and signature");
      assert(/Main body/i.test(result.recommendation.bestKindLabel), "label should name main body");
      assert(/main body|letterhead|signature/i.test(result.recommendation.targetConfidenceReason), "why should explain body-vs-letterhead choice");
    }
  },
  {
    name: "OCR sample letter targets body after greeting",
    run() {
      const result = analyze({
        type: "pdf",
        label: "PDF",
        quietMode: false,
        readingConfidence: 82,
        words: 190,
        pageEvidence: { articleEvidence: 2, quietEvidence: 0, paragraphs: 0 },
        sections: [
          {
            title: "The Slerexe Company Limited",
            text: "THE SLEREXE COMPANY LIMITED SAPORS LANE BOOLE DORSET BH25 8ER TELEPHONE BOOLE 51617 TELEX 123456",
            unitMeta: { pageNumber: 1, pdfSectionType: "title_page", ocrRole: "letterhead" }
          },
          {
            title: "Our Ref. 350/PJC/EAC",
            text: "Our Ref. 350/PJC/EAC 18th January, 1972.",
            unitMeta: { pageNumber: 1, ocrRole: "date_reference" }
          },
          {
            title: "Dr. P.N. Cundall",
            text: "Dr. P.N. Cundall Mining Surveys Ltd Holy Road Reading Berks",
            unitMeta: { pageNumber: 1, ocrRole: "recipient" }
          },
          {
            title: "Dear Pete",
            text: "Dear Pete,",
            unitMeta: { pageNumber: 1, ocrRole: "greeting" }
          },
          {
            title: "Permit me to introduce",
            text: repeated("Permit me to introduce you to the facility of facsimile transmission. In facsimile a photocell is caused to perform a raster scan over the subject copy. Please review this explanation because it describes how the signal is transmitted to a remote destination.", 2),
            unitMeta: { pageNumber: 1, ocrRole: "body", diagnosticReason: "this paragraph is the main body of the scanned letter, not the letterhead or signature" }
          },
          {
            title: "Yours sincerely",
            text: "Yours sincerely P.J. Cross Group Leader Facsimile Research",
            unitMeta: { pageNumber: 1, pdfSectionType: "signature", ocrRole: "signature" }
          }
        ]
      });
      assert(best(result).metrics.ocrRole === "body", "sample letter body should beat letterhead, ref, recipient, and signature");
      assert(/^Permit me/i.test(best(result).text), "best target should start with the body after the greeting");
      assert(/Main body/i.test(result.recommendation.bestKindLabel), "sample label should name main body");
    }
  },
  {
    name: "Docs usage beats changelog",
    run() {
      const result = analyze({
        type: "docs",
        label: "Docs",
        quietMode: false,
        readingConfidence: 86,
        sections: [
          { title: "Changelog", text: repeated("Release notes community support pricing updates.", 20), adapterScore: -36 },
          { title: "Installation and usage", text: repeated("Install the package, configure authentication, use this API example, and handle common errors.", 18), adapterScore: 72, codeBlocks: 1 }
        ]
      });
      assert(/Installation|usage/i.test(best(result).title), "docs usage should win");
    }
  },
  {
    name: "Short dashboard stays quiet",
    run() {
      const result = analyze({
        type: "app_dashboard",
        label: "App",
        quietMode: true,
        readingConfidence: 24,
        words: 80,
        pageEvidence: { quietEvidence: 10, articleEvidence: 0, paragraphs: 0, controls: 30 },
        sections: [
          { title: "Settings", text: "Billing export profile permissions account settings save cancel" }
        ]
      });
      assert(result.pageProfile.quietMode, "dashboard should stay quiet");
      assert(!result.recommendation.hasStrongTarget, "dashboard should not create a jump target");
    }
  },
  {
    name: "Shopping product page stays quiet",
    run() {
      const result = analyze({
        type: "shopping_product",
        label: "Product page",
        quietMode: true,
        readingConfidence: 30,
        words: 150,
        pageEvidence: { quietEvidence: 9, articleEvidence: 0, commerceNodes: 10, paragraphs: 0 },
        sections: [
          { title: "Product card", text: repeated("Buy now cart price sale color size shipping reviews sponsored recommended products.", 12), adapterScore: -40 }
        ]
      });
      assert(result.pageProfile.quietMode, "shopping page should stay quiet");
      assert(!result.recommendation.hasStrongTarget, "shopping page should not invent a jump target");
    }
  }
];

for (const testCase of cases) {
  testCase.run();
  console.log(`ok - ${testCase.name}`);
}
