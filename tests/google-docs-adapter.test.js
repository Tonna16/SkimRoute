const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const adaptersCode = fs.readFileSync(path.join(root, "content", "adapters.js"), "utf8");
const engineCode = fs.readFileSync(path.join(root, "content", "engine.js"), "utf8");
const sandbox = {
  window: {
    scrollY: 0,
    innerHeight: 900,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    }
  },
  console,
  document: {},
  URLSearchParams,
  setTimeout,
  clearTimeout
};

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.nodeValue = text || "";
    this.parentNode = null;
  }
}

class FakeElement {
  constructor(options = {}) {
    this.nodeType = 1;
    this.tagName = String(options.tagName || "div").toUpperCase();
    this.id = options.id || "";
    this.className = options.className || "";
    this.attributes = { ...(options.attrs || {}) };
    this.dataset = { ...(options.dataset || {}) };
    this.parentNode = null;
    this.parentElement = null;
    this.ownerDocument = null;
    this._text = options.text || "";
    this._rectTop = Number(options.top || 0);
    this.childNodes = [];
    this.children = [];
    if (this._text) this.appendChild(new FakeText(this._text));
    (options.children || []).forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    if (child.nodeType === 1) {
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
    }
    this.childNodes.push(child);
    return child;
  }

  get textContent() {
    return this.childNodes.map((child) => child.nodeType === 3 ? child.nodeValue : child.textContent).join(" ");
  }

  get innerText() {
    return this.textContent;
  }

  getAttribute(name) {
    if (name === "id") return this.id;
    if (name === "class") return this.className;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (this.dataset[key]) return this.dataset[key];
    }
    return this.attributes[name] || "";
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  getBoundingClientRect() {
    return { top: this._rectTop, bottom: this._rectTop + 24, width: 800, height: 24 };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      if (!node || node.nodeType !== 1) return;
      if (node !== this && matchesSelectorList(node, selector)) results.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.nodeType === 1 && matchesSelectorList(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  matches(selector) {
    return matchesSelectorList(this, selector);
  }
}

class FakeDocument extends FakeElement {
  constructor(options = {}) {
    super({ tagName: "document" });
    this.nodeType = 9;
    this.title = options.title || "Fixture - Google Docs";
    this.body = options.body || new FakeElement({ tagName: "body" });
    this.body.ownerDocument = this;
    this.appendChild(this.body);
    setOwnerDocument(this.body, this);
  }

  querySelector(selector) {
    if (matchesSelectorList(this.body, selector)) return this.body;
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    const own = matchesSelectorList(this.body, selector) ? [this.body] : [];
    return own.concat(this.body.querySelectorAll(selector));
  }
}

function setOwnerDocument(node, doc) {
  if (!node || node.nodeType !== 1) return;
  node.ownerDocument = doc;
  node.children.forEach((child) => setOwnerDocument(child, doc));
}

function el(tagName, options = {}) {
  return new FakeElement({ ...options, tagName });
}

function textNode(text) {
  return new FakeText(text);
}

function matchesSelectorList(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  return String(selector || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => matchesSimpleSelector(node, part));
}

function matchesSimpleSelector(node, selector) {
  const simple = selector.trim().split(/\s+/).pop();
  if (!simple || simple === "*") return true;
  let rest = simple;
  const tagMatch = rest.match(/^[a-zA-Z][\w-]*/);
  if (tagMatch) {
    const tag = tagMatch[0].toLowerCase();
    if (node.tagName.toLowerCase() !== tag) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  const idMatches = Array.from(rest.matchAll(/#([\w-]+)/g));
  if (idMatches.some((match) => node.id !== match[1])) return false;
  const classMatches = Array.from(rest.matchAll(/\.([\w-]+)/g));
  const classes = String(node.className || "").split(/\s+/);
  if (classMatches.some((match) => !classes.includes(match[1]))) return false;
  const attrMatches = Array.from(rest.matchAll(/\[([^\]=~*^$|\s]+)(?:([*^$|~]?=)['"]?([^'"\]]+)['"]?(?:\s+i)?)?\]/g));
  return attrMatches.every((match) => {
    const name = match[1];
    const operator = match[2] || "";
    const expected = String(match[3] || "");
    const actual = String(node.getAttribute(name) || "");
    if (!operator) return Boolean(actual);
    if (operator === "=") return actual === expected;
    if (operator === "*=") return actual.toLowerCase().includes(expected.toLowerCase());
    if (operator === "^=") return actual.toLowerCase().startsWith(expected.toLowerCase());
    if (operator === "$=") return actual.toLowerCase().endsWith(expected.toLowerCase());
    return actual === expected;
  });
}

function makeContext(url, body, options = {}) {
  const document = new FakeDocument({ body, title: options.title || "college essay - Google Docs" });
  return {
    window: sandbox.window,
    document,
    location: new URL(url)
  };
}

function makeHelpers() {
  return {
    cleanText(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    },
    countWords(text) {
      const matches = String(text || "").trim().match(/\b[\w'-]+\b/g);
      return matches ? matches.length : 0;
    },
    getReadableText(node) {
      return String(node && (node.innerText || node.textContent) || "");
    },
    querySelectorAllDeep(rootNode, selector) {
      return Array.from(rootNode && rootNode.querySelectorAll ? rootNode.querySelectorAll(selector) : []);
    },
    isVisible() {
      return true;
    },
    isLowValueElement(node) {
      return Boolean(node && node.closest && node.closest("[role='toolbar'], [role='menubar'], .docs-toolbar, .docs-titlebar, .docs-comments, .docs-sidebar"));
    },
    hashText(text) {
      let hash = 0;
      const value = String(text || "");
      for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
      return hash.toString(36);
    }
  };
}

vm.runInNewContext(adaptersCode, sandbox, { filename: "content/adapters.js" });
vm.runInNewContext(engineCode, sandbox, { filename: "content/engine.js" });

const adapters = sandbox.window.PagePilotAdapters;
const engine = sandbox.window.PagePilotEngine;
sandbox.window.Element = FakeElement;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function registryFor(url, body = el("body"), options = {}) {
  const context = makeContext(url, body, options);
  const helpers = makeHelpers();
  return {
    context,
    helpers,
    registry: adapters.createRegistry(context, helpers)
  };
}

function googleDocsAdapter(registry) {
  return registry.all.find((adapter) => adapter.name === "google-docs");
}

function repeated(text, count) {
  return Array.from({ length: count }, () => text).join(" ");
}

function googleDocBody(options = {}) {
  const outline = options.outline === false ? null : el("div", {
    id: "docs-outline-pane",
    attrs: { "aria-label": "Document outline" },
    children: (options.outlineItems || [
      el("div", { className: "docs-outline-item", attrs: { role: "treeitem", "aria-level": "1", "data-target-id": "h.intro" }, text: "College essay introduction" }),
      el("div", { className: "docs-outline-item", attrs: { role: "treeitem", "aria-level": "2", "data-target-id": "h.plan" }, text: "Revision plan and conclusion" })
    ])
  });
  const editorAttrs = options.editable === false ? {} : { contenteditable: "true", role: "textbox" };
  const editor = el("div", {
    className: options.pageless ? "docs-pageless-content" : "kix-appview-editor",
    attrs: { ...editorAttrs, "data-tab-id": options.tabId || "t.0", "aria-label": "Document content" },
    children: options.blocks || [
      el("h1", { attrs: { "aria-level": "1", id: "h.intro" }, text: "College essay introduction" }),
      el("p", { text: repeated("This paragraph explains the central experience, the reflective claim, and the reason the essay matters to the reader.", 4) }),
      el("h2", { attrs: { "aria-level": "2", id: "h.plan" }, text: "Revision plan and conclusion" }),
      el("p", { text: repeated("The revision plan clarifies the ending, preserves the student's voice, and adds concrete details for the final conclusion.", 4) })
    ]
  });
  const toolbar = el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Format Tools Extensions Help Share Comments" });
  const children = [toolbar];
  if (outline) children.push(outline);
  children.push(editor);
  if (options.extra) children.push(...options.extra);
  return el("body", { className: "docs-gm docs-material", children });
}

const cases = [
  {
    name: "Google Docs editor URL matches google-docs",
    run() {
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", googleDocBody());
      const adapter = googleDocsAdapter(registry);
      assert(adapter, "google-docs adapter should be registered");
      assert(adapter.matches(context, helpers), "Google Docs editor URL should match");
      assert(registry.pick().name === "google-docs", "registry should pick google-docs for editor URL");
    }
  },
  {
    name: "Google Docs homepage does not match google-docs",
    run() {
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/");
      assert(!googleDocsAdapter(registry).matches(context, helpers), "Docs homepage should not match google-docs");
    }
  },
  {
    name: "Sheets and Slides do not match google-docs",
    run() {
      const sheets = registryFor("https://docs.google.com/spreadsheets/d/sheet123/edit");
      const slides = registryFor("https://docs.google.com/presentation/d/slide123/edit");
      assert(!googleDocsAdapter(sheets.registry).matches(sheets.context, sheets.helpers), "Sheets should not match google-docs");
      assert(!googleDocsAdapter(slides.registry).matches(slides.context, slides.helpers), "Slides should not match google-docs");
    }
  },
  {
    name: "Google Docs adapter is ordered before dashboard generic docs article chat and mixed",
    run() {
      const { registry } = registryFor("https://docs.google.com/document/d/doc123/edit", googleDocBody());
      const names = registry.all.map((adapter) => adapter.name);
      const googleDocsIndex = names.indexOf("google-docs");
      assert(googleDocsIndex >= 0, "google-docs adapter should be present");
      ["product", "app-dashboard", "docs", "article", "generic-chat", "mixed"].forEach((name) => {
        assert(googleDocsIndex < names.indexOf(name), `google-docs should appear before ${name}`);
      });
    }
  },
  {
    name: "Google Docs route key uses document id and URL tab",
    run() {
      const { registry, context } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.9", googleDocBody());
      const adapter = googleDocsAdapter(registry);
      assert(adapter.routeKey(context) === "google-docs:doc_123-ABC:t.9", `unexpected route key ${adapter.routeKey(context)}`);
    }
  },
  {
    name: "Google Docs route key falls back to default tab",
    run() {
      const { registry, context } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit");
      assert(googleDocsAdapter(registry).routeKey(context) === "google-docs:doc_123-ABC:default", "expected default tab route key");
    }
  },
  {
    name: "Google Docs route key uses selected document tab DOM fallback",
    run() {
      const body = googleDocBody({
        extra: [el("div", { attrs: { role: "tab", "aria-selected": "true", "data-tab-id": "t.dom" }, text: "Document tab" })]
      });
      const { registry, context } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", body);
      assert(googleDocsAdapter(registry).routeKey(context) === "google-docs:doc_123-ABC:t.dom", `unexpected route key ${googleDocsAdapter(registry).routeKey(context)}`);
    }
  },
  {
    name: "Editable document extracts outline and editor units",
    run() {
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", googleDocBody());
      const adapter = googleDocsAdapter(registry);
      const units = adapter.collectUnits(context.document.body, context, helpers);
      const sources = units.map((unit) => unit.meta.googleDocsSource);
      assert(units.length >= 3, `expected Google Docs units, got ${units.length}`);
      assert(sources.includes("outline"), "expected outline units");
      assert(sources.includes("editor"), "expected editor units");
      assert(units.every((unit) => unit.meta.googleDocsMode === "editing"), "expected editing mode metadata");
      assert(units.every((unit) => unit.meta.googleDocsActiveTab === "t.0"), "expected active tab metadata");
    }
  },
  {
    name: "Suggesting mode is detected",
    run() {
      const body = googleDocBody({
        extra: [el("button", { attrs: { "aria-label": "Suggesting mode", "aria-pressed": "true" }, text: "Suggesting" })]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", body);
      const adapter = googleDocsAdapter(registry);
      const diagnostics = adapter.diagnostics(context, helpers, context.document.body);
      assert(diagnostics.googleDocsMode === "suggesting", `expected suggesting mode, got ${diagnostics.googleDocsMode}`);
    }
  },
  {
    name: "Shared read-only document extracts viewer text without editable root",
    run() {
      const body = googleDocBody({ editable: false, outline: false });
      const viewer = body.querySelector(".kix-appview-editor");
      viewer.setAttribute("aria-readonly", "true");
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?usp=sharing", body);
      const adapter = googleDocsAdapter(registry);
      const units = adapter.collectUnits(context.document.body, context, helpers);
      assert(units.some((unit) => unit.meta.googleDocsSource === "viewer" || unit.meta.googleDocsMode === "read-only"), "expected read-only/viewer extraction");
    }
  },
  {
    name: "Document with no headings still maps readable document blocks",
    run() {
      const body = googleDocBody({
        outline: false,
        blocks: [
          el("p", { text: repeated("The document has no headings but the opening paragraph explains the topic and gives useful context.", 5) }),
          el("p", { text: repeated("A second paragraph includes the recommendation, supporting details, and the conclusion for readers.", 5) })
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", body);
      const units = googleDocsAdapter(registry).collectUnits(context.document.body, context, helpers);
      assert(units.length >= 1, "expected readable units without headings");
      assert(units.every((unit) => ["editor", "rendered-line"].includes(unit.meta.googleDocsSource)), "expected document-content source for no-heading document");
    }
  },
  {
    name: "Large visible Google Docs text is split into multiple partial units",
    run() {
      const visibleText = [
        "College essay draft",
        "",
        repeated("Introduction context explains why the experience matters and frames the central question for the reader.", 5),
        "",
        repeated("Main claim: the essay argues that responsibility became meaningful through repeated community work, concrete reflection, and revised choices.", 5),
        "",
        repeated("Key evidence includes the tutoring schedule, the conversation with a mentor, and the change in how the student approached planning.", 5),
        "",
        repeated("Conclusion: the final paragraph connects the lesson back to college goals and shows how the student will contribute.", 5)
      ].join("\n");
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [
          el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Share Comments" }),
          el("div", { className: "kix-appview-editor", attrs: { "aria-label": "Document content", "data-tab-id": "t.0" }, text: visibleText })
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      const units = googleDocsAdapter(registry).collectUnits(context.document.body, context, helpers);
      assert(units.length >= 3, `expected multiple split units, got ${units.length}`);
      assert(units.every((unit) => unit.meta.googleDocsPartial), "expected split visible units to remain partial");
      assert(units.every((unit) => unit.meta.googleDocsActiveTab === "t.0"), "expected active tab metadata on split units");
      assert(new Set(units.map((unit) => unit.meta.googleDocsUnitId)).size === units.length, "expected stable unique unit ids");
      assert(units.some((unit) => /Main claim/i.test(unit.title) || /Main claim/i.test(unit.text)), "expected main claim unit");
      assert(units.some((unit) => /Conclusion/i.test(unit.title) || /Conclusion/i.test(unit.text)), "expected conclusion unit");
    }
  },
  {
    name: "Rendered Google Docs line nodes produce multiple document units",
    run() {
      const lines = [
        el("div", { className: "kix-lineview", attrs: { "aria-level": "1", "data-target-id": "h.title", "aria-label": "College essay draft" } }),
        el("div", { className: "kix-lineview", attrs: { "aria-label": repeated("Introduction explains the experience and why the central question matters for the reader.", 3) } }),
        el("div", { className: "kix-lineview", attrs: { "aria-level": "2", "data-target-id": "h.claim", "aria-label": "Main claim" } }),
        el("div", { className: "kix-lineview", attrs: { "aria-label": repeated("Main claim argues that responsibility became meaningful through community work, reflection, and revised choices.", 4) } }),
        el("div", { className: "kix-lineview", attrs: { "aria-level": "2", "data-target-id": "h.evidence", "aria-label": "Key evidence" } }),
        el("div", { className: "kix-lineview", attrs: { "aria-label": repeated("Key evidence includes tutoring, a mentor conversation, and concrete planning changes.", 4) } })
      ];
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [
          el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Share Comments" }),
          el("div", { className: "kix-appview-editor", attrs: { "aria-label": "Document content", "data-tab-id": "t.0" }, children: lines })
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      const adapter = googleDocsAdapter(registry);
      const units = adapter.collectUnits(context.document.body, context, helpers);
      const renderedUnits = units.filter((unit) => unit.meta.googleDocsSource === "rendered-line");
      assert(renderedUnits.length >= 2, `expected rendered-line units, got ${renderedUnits.length}`);
      assert(renderedUnits.every((unit) => unit.meta.googleDocsSourceLineIds.length >= 1), "expected line provenance");
      assert(renderedUnits.some((unit) => /Main claim/i.test(unit.text)), "expected main claim line text");
      const diagnostics = adapter.diagnostics(context, helpers, context.document.body);
      assert(diagnostics.googleDocsRenderedLineUnits >= 2, "expected rendered-line diagnostics");
      assert(diagnostics.googleDocsRenderedLineCount >= 3, "expected rendered-line count diagnostics");
    }
  },
  {
    name: "Rendered word nodes beat coarse visible block fallback",
    run() {
      const wordLine = (target, words) => el("div", {
        className: "kix-lineview",
        attrs: { "data-target-id": target },
        children: words.map((word) => el("span", { className: "kix-wordhtmlgenerator-word-node", attrs: { "data-text": word }, text: word }))
      });
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [
          el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Share Comments" }),
          el("div", {
            className: "kix-appview-editor",
            attrs: { "aria-label": "Document content", "data-tab-id": "t.0" },
            children: [
              wordLine("line-1", "Summary explains the college essay topic and central claim clearly".split(" ")),
              wordLine("line-2", "Evidence describes tutoring service reflection mentor feedback and revision choices".split(" ")),
              wordLine("line-3", "Conclusion connects the lesson to future goals and campus contribution".split(" "))
            ]
          })
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      const units = googleDocsAdapter(registry).collectUnits(context.document.body, context, helpers);
      assert(units.some((unit) => unit.meta.googleDocsSource === "rendered-line"), "expected rendered-line source");
      assert(!units.every((unit) => unit.meta.googleDocsSource === "visible-block"), "expected not only visible-block fallback");
      assert(units.map((unit) => unit.text).join(" ").includes("mentor feedback"), "expected rendered word text");
    }
  },
  {
    name: "Read-only rendered Google Docs lines extract without editable roots",
    run() {
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [
          el("div", { className: "kix-appview-editor", attrs: { "aria-readonly": "true", "aria-label": "Document content", "data-tab-id": "t.0" }, children: [
            el("div", { className: "kix-lineview", attrs: { "aria-label": repeated("Read only introduction text is visible and should be mapped locally.", 4) } }),
            el("div", { className: "kix-lineview", attrs: { "aria-label": repeated("Read only conclusion text gives the useful final point for navigation.", 4) } })
          ] })
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?usp=sharing", body);
      const units = googleDocsAdapter(registry).collectUnits(context.document.body, context, helpers);
      assert(units.some((unit) => unit.meta.googleDocsSource === "rendered-line"), "expected rendered-line extraction in read-only mode");
      assert(units.every((unit) => unit.meta.googleDocsMode === "read-only"), "expected read-only metadata");
    }
  },
  {
    name: "Paged and pageless visible layouts are extracted as partial maps",
    run() {
      const paged = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", googleDocBody({ editable: false, outline: false }));
      const pageless = registryFor("https://docs.google.com/document/d/doc_456/edit", googleDocBody({ editable: false, outline: false, pageless: true }));
      const pagedUnits = googleDocsAdapter(paged.registry).collectUnits(paged.context.document.body, paged.context, paged.helpers);
      const pagelessUnits = googleDocsAdapter(pageless.registry).collectUnits(pageless.context.document.body, pageless.context, pageless.helpers);
      assert(pagedUnits.length >= 1, "expected paged visible units");
      assert(pagelessUnits.length >= 1, "expected pageless visible units");
      assert(pagedUnits.some((unit) => unit.meta.googleDocsPartial), "expected paged partial metadata");
      assert(pagelessUnits.some((unit) => unit.meta.googleDocsPartial), "expected pageless partial metadata");
    }
  },
  {
    name: "Duplicate outline editor and viewer text is removed",
    run() {
      const duplicate = "Duplicate heading for dedupe coverage";
      const body = googleDocBody({
        outlineItems: [el("div", { className: "docs-outline-item", attrs: { role: "treeitem", "data-target-id": "dup" }, text: duplicate })],
        blocks: [
          el("h1", { attrs: { id: "dup" }, text: duplicate }),
          el("p", { text: repeated("Unique paragraph text remains after duplicate headings are removed.", 5) })
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", body);
      const adapter = googleDocsAdapter(registry);
      const diagnostics = adapter.diagnostics(context, helpers, context.document.body);
      assert(diagnostics.googleDocsDuplicatesRemoved >= 1, "expected duplicate removal diagnostic");
    }
  },
  {
    name: "Heading hierarchy is preserved",
    run() {
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", googleDocBody());
      const units = googleDocsAdapter(registry).collectUnits(context.document.body, context, helpers);
      const levels = units.map((unit) => unit.level);
      assert(levels.includes(1), `expected heading level 1, got ${levels.join(",")}`);
      assert(levels.includes(2), `expected heading level 2, got ${levels.join(",")}`);
    }
  },
  {
    name: "Editor chrome is excluded from document units",
    run() {
      const body = googleDocBody();
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", body);
      const text = googleDocsAdapter(registry).collectUnits(context.document.body, context, helpers).map((unit) => unit.text).join(" ");
      assert(!/File Edit View Insert|Share Comments Toolbar/i.test(text), `chrome leaked into units: ${text}`);
    }
  },
  {
    name: "Google Docs root never falls back to body or counts shell words",
    run() {
      const shellText = repeated("File Edit View Insert Format Tools Extensions Help Share Comments Toolbar Menu Suggesting Saved to Drive", 40);
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [
          el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: shellText })
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      const adapter = googleDocsAdapter(registry);
      const root = adapter.getRoot(context, helpers);
      assert(root !== context.document.body, "google-docs root should not be document.body");
      assert(adapter.collectUnits(root, context, helpers).length === 0, "shell words should not become units");
      sandbox.window.location = context.location;
      sandbox.document = context.document;
      const model = engine.createEngine({ window: sandbox.window, document: context.document }).scan();
      assert(model.totalReadableWords === 0, `expected 0 adapter words, got ${model.totalReadableWords}`);
      assert(model.diagnostics.googleDocsRejectedShellWords >= 100, "expected rejected shell word diagnostics");
      assert(model.pageProfile.type === "docs", "Google Docs should remain authoritative");
    }
  },
  {
    name: "Same-origin Google Docs iframe document text is extracted",
    run() {
      const iframeDoc = new FakeDocument({
        body: el("body", {
          children: [
            el("div", { className: "kix-appview-editor", attrs: { "aria-label": "Document content", "data-tab-id": "t.0" }, children: [
              el("div", { className: "kix-lineview", attrs: { "aria-label": repeated("Iframe introduction explains the document argument clearly.", 4) } }),
              el("div", { className: "kix-lineview", attrs: { "aria-label": repeated("Iframe conclusion gives the useful final point for navigation.", 4) } })
            ] })
          ]
        })
      });
      const iframe = el("iframe", { className: "docs-texteventtarget-iframe" });
      iframe.contentDocument = iframeDoc;
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [
          el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Share Comments" }),
          iframe
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      const adapter = googleDocsAdapter(registry);
      const units = adapter.collectUnits(adapter.getRoot(context, helpers), context, helpers);
      const diagnostics = adapter.diagnostics(context, helpers, adapter.getRoot(context, helpers));
      assert(units.some((unit) => /Iframe conclusion/i.test(unit.text)), "expected iframe document text in units");
      assert(diagnostics.googleDocsIframeCount >= 1, "expected iframe count diagnostic");
      assert(diagnostics.googleDocsSameOriginIframeDocuments >= 1, "expected same-origin iframe diagnostic");
      assert(diagnostics.googleDocsIframeTextWords >= 20, "expected iframe text word diagnostics");
    }
  },
  {
    name: "Canvas-only Google Docs shows screen-reader support guidance",
    run() {
      const blockedIframe = el("iframe", { className: "docs-texteventtarget-iframe" });
      Object.defineProperty(blockedIframe, "contentDocument", {
        get() {
          throw new Error("cross-origin");
        }
      });
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [
          el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Share Comments" }),
          el("div", { className: "kix-appview-editor", attrs: { "aria-label": "Document content", "data-tab-id": "t.0" }, children: [
            el("canvas", { attrs: { "aria-label": "Page 1" } })
          ] }),
          blockedIframe
        ]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      const adapter = googleDocsAdapter(registry);
      const root = adapter.getRoot(context, helpers);
      const profile = adapter.profile(context, helpers, root);
      const diagnostics = adapter.diagnostics(context, helpers, root);
      assert(profile.quietMode, "canvas-only docs should stay quiet");
      assert(/screen-reader support/i.test(profile.reason), `expected screen-reader copy, got ${profile.reason}`);
      assert(/Ctrl\+Alt\+Z/.test(profile.reason) && /Command\+Option\+Z/.test(profile.reason), "expected shortcut guidance");
      assert(diagnostics.googleDocsRenderingCapability === "canvas-only", `expected canvas-only, got ${diagnostics.googleDocsRenderingCapability}`);
      assert(diagnostics.googleDocsInaccessibleIframeCount >= 1, "expected inaccessible iframe diagnostic");
      assert(adapter.collectUnits(root, context, helpers).length === 0, "canvas-only shell should not produce fake units");
    }
  },
  {
    name: "Google Docs mode detection ignores broad body Suggesting text",
    run() {
      const body = googleDocBody({
        extra: [el("div", { className: "docs-sidebar", text: "Suggesting mode is mentioned in shell text but not selected." })]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", body);
      const diagnostics = googleDocsAdapter(registry).diagnostics(context, helpers, googleDocsAdapter(registry).getRoot(context, helpers));
      assert(diagnostics.googleDocsMode === "editing", `expected editing mode, got ${diagnostics.googleDocsMode}`);
    }
  },
  {
    name: "Google Docs effective words come from adapter units only",
    run() {
      const shellText = repeated("File Edit View Insert Format Tools Extensions Help Share Comments Toolbar Menu", 50);
      const body = googleDocBody({
        outline: false,
        extra: [el("div", { className: "docs-sidebar", text: shellText })],
        blocks: [
          el("p", { text: "A short genuine document paragraph explains one useful idea." })
        ]
      });
      const context = makeContext("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      sandbox.window.location = context.location;
      sandbox.document = context.document;
      const model = engine.createEngine({ window: sandbox.window, document: context.document }).scan();
      const sectionWords = model.sections.reduce((sum, section) => sum + section.wordCount, 0);
      assert(sectionWords > 0 && sectionWords < 80, `expected short genuine section words, got ${sectionWords}`);
      assert(model.totalReadableWords === sectionWords, `expected effective words ${sectionWords}, got ${model.totalReadableWords}`);
      assert(model.pageProfile.quietMode, "short Google Docs map should remain quiet");
    }
  },
  {
    name: "Google Docs without exposed document text reports honest unreadable state",
    run() {
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Format Tools Extensions Help Share Comments Toolbar Menu" })]
      });
      const { registry, context, helpers } = registryFor("https://docs.google.com/document/d/doc_123-ABC/edit", body);
      const adapter = googleDocsAdapter(registry);
      const profile = adapter.profile(context, helpers, context.document.body);
      assert(profile.type === "docs", `expected docs type, got ${profile.type}`);
      assert(profile.label === "Google Docs", `expected Google Docs label, got ${profile.label}`);
      assert(profile.quietMode === true, "Google Docs with no exposed document text should be quiet");
      assert(/cannot read enough document text/i.test(profile.reason), `unexpected reason ${profile.reason}`);
      assert(adapter.collectUnits(context.document.body, context, helpers).length === 0, "toolbar/body text should not become document units");
    }
  },
  {
    name: "Engine keeps unreadable Google Docs as Google Docs instead of low structure",
    run() {
      const body = el("body", {
        className: "docs-gm docs-material",
        children: [el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Format Tools Extensions Help Share Comments Toolbar Menu" })]
      });
      const context = makeContext("https://docs.google.com/document/d/doc_123-ABC/edit?tab=t.0", body);
      sandbox.window.location = context.location;
      sandbox.document = context.document;
      const model = engine.createEngine({ window: sandbox.window, document: context.document }).scan();
      assert(model.pageProfile.type === "docs", `expected docs profile, got ${model.pageProfile.type}`);
      assert(model.pageProfile.label === "Google Docs", `expected Google Docs label, got ${model.pageProfile.label}`);
      assert(/cannot read enough document text|Google Docs matched/i.test(`${model.pageProfile.reason} ${model.pageProfile.diagnosticHint}`), "expected Google Docs-specific unreadable copy");
    }
  }
];

for (const testCase of cases) {
  testCase.run();
  console.log(`ok - ${testCase.name}`);
}
