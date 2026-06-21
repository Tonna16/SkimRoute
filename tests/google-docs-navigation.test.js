const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const contentCode = fs.readFileSync(path.join(root, "pdf-runtime.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

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
    this.children = [];
    this.childNodes = [];
    this.style = {};
    this.scrollTop = Number(options.scrollTop || 0);
    this.scrollHeight = Number(options.scrollHeight || 1200);
    this.clientHeight = Number(options.clientHeight || 600);
    this._rect = {
      top: Number(options.top || 0),
      left: Number(options.left || 0),
      width: Number(options.width || 800),
      height: Number(options.height || 40)
    };
    if (options.text) this.appendChild(new FakeText(options.text));
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
      return this.dataset[key] || this.attributes[name] || "";
    }
    return this.attributes[name] || "";
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
    if (name === "class") this.className = String(value);
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  getBoundingClientRect() {
    return {
      top: this._rect.top,
      left: this._rect.left,
      bottom: this._rect.top + this._rect.height,
      right: this._rect.left + this._rect.width,
      width: this._rect.width,
      height: this._rect.height
    };
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
  constructor(body) {
    super({ tagName: "document" });
    this.nodeType = 9;
    this.title = "Google Docs navigation fixture";
    this.body = body;
    this.documentElement = body;
    this.appendChild(body);
    setOwnerDocument(body, this);
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

function matchesSelectorList(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  return String(selector || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => matchesSelectorChain(node, part));
}

function matchesSelectorChain(node, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  let current = node;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    while (current && !matchesSimpleSelector(current, part)) {
      current = current.parentElement;
    }
    if (!current) return false;
    current = current.parentElement;
  }
  return true;
}

function matchesSimpleSelector(node, selector) {
  const simple = selector.trim();
  if (!simple || simple === "*") return true;
  let rest = simple;
  const tagMatch = rest.match(/^[a-zA-Z][\w-]*/);
  if (tagMatch) {
    if (node.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  const idMatches = Array.from(rest.matchAll(/#([\w-]+)/g));
  if (idMatches.some((match) => node.id !== match[1])) return false;
  const classMatches = Array.from(rest.matchAll(/\.([\w-]+)/g));
  const classes = String(node.className || "").split(/\s+/).filter(Boolean);
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
    return actual === expected;
  });
}

function loadHooks() {
  const body = el("body");
  const document = new FakeDocument(body);
  const windowRef = {
    __PAGEPILOT_ENABLE_TEST_HOOKS__: true,
    PagePilotAdapters: {},
    PagePilotEngine: { createEngine() { return { helpers: {} }; } },
    PagePilotUI: { createUI() { return { mount() {}, destroy() {} }; } },
    location: { origin: "https://docs.google.com", pathname: "/document/d/doc/edit", search: "", hash: "" },
    top: null,
    self: null,
    scrollY: 0,
    innerHeight: 900,
    innerWidth: 1400,
    setTimeout,
    clearTimeout,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1", overflowY: "auto", overflow: "auto" };
    },
    matchMedia() {
      return { matches: true };
    },
    CSS: { escape(value) { return String(value || "").replace(/[^\w-]/g, "\\$&"); } }
  };
  windowRef.top = windowRef;
  windowRef.self = windowRef;
  windowRef.location.href = "https://docs.google.com/document/d/doc/edit?tab=t.0";
  document.readyState = "loading";
  document.addEventListener = function addEventListener() {};
  document.getElementById = function getElementById() { return null; };
  const sandbox = {
    window: windowRef,
    document,
    console: { info() {}, warn() {}, error() {} },
    chrome: { runtime: { getURL(value) { return `chrome-extension://test/${value || ""}`; }, sendMessage() {} } },
    URL,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(contentCode, sandbox, { filename: "pdf-runtime.js" });
  assert(sandbox.window.__PAGEPILOT_CONTENT_TESTS__, "content test hooks were not installed");
  return sandbox.window.__PAGEPILOT_CONTENT_TESTS__;
}

function makeDoc(children) {
  const body = el("body", { children });
  return new FakeDocument(body);
}

function makeSection(anchor, options = {}) {
  return {
    id: options.id || "section-main",
    title: options.title || "Main argument",
    text: options.text || "Main argument explains the useful point with enough unique supporting detail for navigation.",
    anchor,
    blocks: options.blocks || [anchor],
    source: "google-docs",
    index: options.index || 1,
    unitMeta: {
      kind: "google-docs",
      source: "google-docs",
      googleDocsSource: options.source || "editor",
      googleDocsNavigationRef: options.navigationRef || "main-argument",
      googleDocsUnitId: options.unitId || "google-docs:main",
      googleDocsHeadingPath: options.headingPath || [],
      googleDocsDocumentOrder: options.documentOrder || 1,
      navigationExact: Boolean(options.navigationExact)
    }
  };
}

function testExactMountedBlock(hooks) {
  const block = el("p", {
    attrs: { "data-target-id": "main-argument" },
    className: "kix-lineview",
    text: "Main argument explains the useful point with enough unique supporting detail for navigation.",
    top: 240,
    height: 48
  });
  const editor = el("div", { className: "kix-appview-editor", children: [block] });
  const doc = makeDoc([editor]);
  const section = makeSection(block, { navigationExact: true });
  const target = hooks.resolveGoogleDocsExactTarget(section, { document: doc });
  assert(target && target.element === block, "expected exact mounted block target");
  assert(hooks.isGoogleDocsCandidateExact(section, block, target), "expected exact candidate to verify");
}

function testOutlineFallback(hooks) {
  const outline = el("div", {
    id: "docs-outline-pane",
    children: [el("div", { attrs: { role: "treeitem", "data-target-id": "outline-main" }, text: "Main argument" })]
  });
  const editor = el("div", { className: "kix-appview-editor", children: [] });
  const doc = makeDoc([outline, editor]);
  const section = makeSection(editor, {
    navigationRef: "missing-editor-block",
    headingPath: [{ title: "Main argument", navigationReference: "outline-main" }]
  });
  const target = hooks.resolveGoogleDocsOutlineEntry(section, { document: doc });
  assert(target && target.element.textContent.includes("Main argument"), "expected outline entry fallback");
}

function testVisibleBlockUsesApproximate(hooks) {
  const longText = Array.from({ length: 30 }, (_, index) => `Paragraph ${index + 1} has document content that should not all be treated as one exact target.`).join(" ");
  const root = el("div", { className: "kix-appview-editor", text: longText, top: 100, height: 700 });
  const doc = makeDoc([root]);
  const section = makeSection(root, {
    source: "visible-block",
    navigationRef: "visible:segment-3",
    text: "Paragraph 3 has document content that should navigate approximately.",
    navigationExact: false
  });
  assert(!hooks.resolveGoogleDocsExactTarget(section, { document: doc }), "oversized visible block should not be exact");
  const approximate = hooks.resolveGoogleDocsApproximateTarget(section, { document: doc });
  assert(approximate && approximate.element === root, "expected approximate content root target");
  assert(approximate.approximateOffset === 192, `expected segment offset 192, got ${approximate.approximateOffset}`);
}

function testChromeRejected(hooks) {
  const toolbar = el("div", { className: "docs-toolbar", text: "Main argument explains toolbar text." });
  const doc = makeDoc([toolbar]);
  const section = makeSection(toolbar, { navigationExact: true });
  assert(hooks.isGoogleDocsChromeElement(toolbar), "expected toolbar to be chrome");
  assert(!hooks.resolveGoogleDocsExactTarget(section, { document: doc }), "chrome should not become an exact target");
}

function testDistinctSections(hooks) {
  const first = el("p", { className: "kix-lineview", attrs: { "data-target-id": "first" }, text: "First section has unique planning details and useful content.", top: 160 });
  const second = el("p", { className: "kix-lineview", attrs: { "data-target-id": "second" }, text: "Second section has different conclusion details and useful content.", top: 360 });
  const editor = el("div", { className: "kix-appview-editor", children: [first, second] });
  const doc = makeDoc([editor]);
  const firstTarget = hooks.resolveGoogleDocsExactTarget(makeSection(first, { id: "first", navigationRef: "first", text: first.textContent, navigationExact: true }), { document: doc });
  const secondTarget = hooks.resolveGoogleDocsExactTarget(makeSection(second, { id: "second", navigationRef: "second", text: second.textContent, navigationExact: true }), { document: doc });
  assert(firstTarget && secondTarget && firstTarget.element !== secondTarget.element, "expected distinct section targets");
}

function testDuplicateDebounce(hooks) {
  const current = {
    activeActionId: "a1",
    completed: false,
    cancelled: false,
    targetKey: "doc|jump|section"
  };
  current.startedAt = 1000;
  assert(hooks.shouldIgnoreDuplicateGoogleDocsAction(current, "doc|jump|section", 1200, 350), "expected duplicate inside debounce");
  assert(!hooks.shouldIgnoreDuplicateGoogleDocsAction(current, "doc|jump|section", 1500, 350), "expected old action outside debounce");
}

function testGoogleDocsLiveSignature(hooks) {
  const line = {
    nodeType: 1,
    classList: { contains() { return false; } },
    innerText: "Live document line contains readable essay content.",
    textContent: "Live document line contains readable essay content.",
    getAttribute(name) {
      return name === "aria-label" ? "Live document line contains readable essay content." : "";
    },
    closest() { return null; },
    querySelectorAll() { return []; }
  };
  const editor = {
    nodeType: 1,
    classList: { contains() { return false; } },
    getAttribute() { return ""; },
    closest() { return null; },
    querySelectorAll() { return [line]; }
  };
  const doc = {
    querySelectorAll(selector) {
      if (String(selector).includes("docs-outline")) return [];
      if (String(selector).includes("kix-appview-editor")) return [editor];
      return [];
    }
  };
  const signature = hooks.getGoogleDocsLiveSignature(doc);
  assert(signature.rootCount >= 1, "expected Google Docs content root in signature");
  assert(signature.lineCount >= 1, "expected mounted line count in signature");
  assert(signature.sampleWords >= 5, `expected readable sample words, got ${signature.sampleWords}`);
}

function testGoogleDocsLiveMutationFiltering(hooks) {
  const line = el("div", { className: "kix-lineview", attrs: { "aria-label": "New readable line mounted in the Google Docs editor." } });
  const editor = el("div", { className: "kix-appview-editor", attrs: { "aria-label": "Document content" }, children: [line] });
  const doc = makeDoc([editor]);
  line.ownerDocument = doc;
  editor.ownerDocument = doc;
  assert(hooks.isGoogleDocsLiveMutation({ type: "childList", addedNodes: [line], target: editor }), "expected document line mutation to schedule");
  const toolbar = el("div", { className: "docs-toolbar", attrs: { role: "toolbar" }, text: "File Edit View Insert Share" });
  assert(!hooks.isGoogleDocsLiveMutation({ type: "childList", addedNodes: [toolbar], target: toolbar }), "expected toolbar mutation to be ignored");
}

function testGoogleDocsLiveScheduleDecision(hooks) {
  const unchanged = hooks.shouldScheduleGoogleDocsLiveScan({
    previousSignature: "same",
    nextSignature: "same",
    now: 2000,
    lastScanAt: 1000,
    ready: false
  });
  assert(!unchanged.schedule && unchanged.reason === "unchanged-signature", "expected unchanged signature skip");
  const throttled = hooks.shouldScheduleGoogleDocsLiveScan({
    previousSignature: "a",
    nextSignature: "b",
    now: 1200,
    lastScanAt: 1000,
    ready: false
  });
  assert(throttled.schedule && throttled.waitMs > 0, "expected throttled changed signature");
}

function testGoogleDocsLiveModelPreservation(hooks) {
  const usable = {
    pageProfile: { adapterName: "google-docs", quietMode: false },
    sections: [{ id: "s1", wordCount: 80, unitMeta: { kind: "google-docs", source: "google-docs", googleDocsUnitId: "u1" } }],
    importantSections: [{ id: "s1" }],
    totalReadableWords: 80
  };
  const transient = {
    pageProfile: { adapterName: "google-docs", quietMode: true },
    sections: [],
    importantSections: [],
    totalReadableWords: 0
  };
  assert(hooks.isUsableGoogleDocsModel(usable), "expected usable Google Docs model");
  assert(hooks.shouldPreserveGoogleDocsLiveModel(transient, usable, ""), "expected transient empty scan to preserve usable model");
}

const hooks = loadHooks();
const tests = [
  ["exact mounted editor block resolves", testExactMountedBlock],
  ["outline fallback resolves by heading title", testOutlineFallback],
  ["visible block root uses approximate target", testVisibleBlockUsesApproximate],
  ["editor chrome is rejected", testChromeRejected],
  ["multiple sections resolve distinct targets", testDistinctSections],
  ["duplicate Google Docs actions are debounced", testDuplicateDebounce],
  ["Google Docs live signature counts mounted lines", testGoogleDocsLiveSignature],
  ["Google Docs live mutations are filtered", testGoogleDocsLiveMutationFiltering],
  ["Google Docs live scan scheduling is bounded", testGoogleDocsLiveScheduleDecision],
  ["Google Docs live map preservation keeps usable model", testGoogleDocsLiveModelPreservation]
];

for (const [name, run] of tests) {
  run(hooks);
  console.log(`ok - ${name}`);
}
