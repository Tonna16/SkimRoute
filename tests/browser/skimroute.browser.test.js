const { test, expect, chromium } = require("@playwright/test");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const fixturesDir = path.join(__dirname, "fixtures");
const FIXTURE_PFX_BASE64 = `
MIIJUgIBAzCCCQ4GCSqGSIb3DQEHAaCCCP8Eggj7MIII9zCCBZAGCSqGSIb3DQEHAaCCBYEEggV9MIIFeTCCBXUGCyqGSIb3DQEMCgECoIIE7jCCBOowHAYKKoZIhvcNAQwBAzAOBAgTa/6FPwVC0QICB9AEggTILdZlyDE2Iw/2nmXQ3WMp4doU7ZjixgmRExGTrLoPC/swnqi43t689THwwHNxXRFvtEoaU8MOTK/Hwrnw4CFeGDlXGecPwpBoeLL9l50StnkTZiPZYhCzr+Gp4ErWBBwOYP2g7WhQA7TxHTEN5ADh1Z+GTXffD21+WzK5gxEWCqifBDJEyNSeX+yIaqBNYzn5H+DYcdGfBgr2r0WZtBU2ucuxOwz6xE3gJB/SOJr/e8Ncx0nvPIG58ORmFOT9bMfJx3MIPEuoQyA8A0ofGCmVzfjPN9ue/gCjv67V1f/2Tm6buSL7iLqt4ir9HLbJKIvek4CkSDC28JsW7svl0mGnI7gbfrwXWtzMNUtT63maHA7LT4bm1bJcIymz0oEumhXJdqUg0nTz64/pyJLba5pY2Yi3NUYXD+PtBeJxTtfn0hOGbE7k2jNcSGMaJvtgLt00bkPZp4dPn0B0nQuwsaCZqqMGOS94YJJtX/4pIGgEfjKlNEe0rvNKe46Ojz6Y/0CRHGrLmSloQLxqDX5xi5NadTBWtve/ILlcxjGa+4NWztgkGsotjf4p4JaNAsva+T2UJEpvDqy/+NG0ZgXOF3M2NsM7wQFQ+ZvOL6kQfmQUXOtypKeG6pVLSsC0eTtG1CGeOr2x5ZJXlPHmSNqg/6PB4LioJghnc+uAurohmFbrFqLhaiQu/cVXpFS4LXn0Vx3de4pdFydDG0nv83jjVCLWGvoHmO+tUXQI7tpfCtgahBHHflMwH3J+A+LCuKc+yVvEU4XodwHdlu4hKQRJCGbUzvmfiELgU340WqPrKR1iz77fu5sKjvfW6j3ukY0rwQ7O/d3SbMiAhFEgWfxn6lJo6pP6xw1gSZuiObji9Cb4WHhW/V3hs/6dsJArmnlqd9peY+gJmqYFDtJIqRr1F7TZcMJ/oJxFtsoVlgQC8/3wasm46NxsarklQzhz0NHg3qVUYnjgAPaE3c7r0tjELseQUHaRrjdPHrOCV7Simvhs+bGmFTgAzt1xcPr8U8UAI1fI7ahYqKiJag2aM30lfWMXR+sxCrT8Fv/pEYUCq8/P04kLhKsC7dYZaXOv6CjB/p2jJVy9u7WKthtibWY4MHN5QFTK1uX0vdXhg6DXZ2goAvg52T5pRf6neozg6yLk4b51L5mr7waz3fZ6HqxdhBog8Nc+o7jCt5ndB2SkIOueKcIaluR/hq7IRC6Zx5/WOJhQPjsvJLGWyru9KfgsRUqfQqjqpNZIqxXhEsicdEu696u+TIVNxLXkOEH/QbWMNhuXsGWykFvwPNwy470uXAhTQ/PrY0cWKnLaRPZZvjgJFL2MvD9dJqjH/tDevDdFE5MGxf1MZ8DwE+YnFkGGoftIK3s3Lx0idD+yTRakiHjOZL1S5Pv/6iNmV6Yo2SQ2G5SX2tNlnAWr2HZQHJ0I5rcPjhQry+XLUlOXIaAcOF1WddELaAKbn/EnxGRFZ5+7REdA8Q3kWTlCBMtmZn+3cN0rYczUCaO8b37AlpBfb5cN6FL1wKOMfyfVgX8Eo8Y8Sf9g/EMNE7J3UCYikK86mgbyPxOiGBvpyezOGrAlgn+R7AfsA1jOifequ9ltOCNefP0lIDTmVmgECOxcCMOf2dr4i5i/l/SjskxgMXQwEwYJKoZIhvcNAQkVMQYEBAEAAAAwXQYJKwYBBAGCNxEBMVAeTgBNAGkAYwByAG8AcwBvAGYAdAAgAFMAbwBmAHQAdwBhAHIAZQAgAEsAZQB5ACAAUwB0AG8AcgBhAGcAZQAgAFAAcgBvAHYAaQBkAGUAcjCCA18GCSqGSIb3DQEHBqCCA1AwggNMAgEAMIIDRQYJKoZIhvcNAQcBMBwGCiqGSIb3DQEMAQMwDgQIXfnhNH0rdjICAgfQgIIDGGekxQRIwPtQEZ9maspGG+AKlofLjz2SDw/PdSZ/wqJLwKDF7ZgY35sjx3An1Xgvsf9vxopqmyTbo0u27ujoL3T91VASWW4JAg/csvgsNTsXXuCL05y9+LjUUHOa5OOPGbSfmclLfQ30EZMAesFxeY8cUb3k6Edx+VBHWADEC9zdnfP83KjiAJlinUaH9T0fIqi9JksXEZRzTYXd6hRbs198i+UVAS1MceVh38dEbFubvQAsBJPsVNn5VsCa8dHjJnFBP7e77yAbcYxHq1ACwAy6n2lQLwWPbCS8rggJK3fwBqjyr+r2xlGscyuvrNweQBDSOYXXK5yVobLnM76ojnG1eiporpMNxiebW8nwuqP81Yp9F3DCUrw5wva9bY+syDjrEfPtfXUAb/4NmhP6dsvcUVkhMucGUbjLumBEDQM2HOgO/CAMbpSgYoawJV5/ZXlVOZg+336q1LklnEzBLkEDa5A7fMQrS5Rzh7EURo2M1yU2vPZ6v9G5a+j8TTMYvcsMs3FTiXUE62yMgQAl+QuhDaR5Ppd6+chZDRGZFoO0354EagKb6nYY4uObuGvhe8UJ1Tu6t9VzR+qZAzG8niXrOpKUBZoos3BbHFihdkfjb7eXz9Kd5UIvv36Xv8/PkuGcZzP/QP/MjD4X8a2A2OI+InVhpHuhFN5t+wT0kclQVYmpWYI4CgHmqN1NgsPbiLV18GARV00JyuftTPGwTKMYx11hL0QoNbMITGseK5v61BU0qVHx/00IapQVctCmF03QZO6q8mxcLuHbEtdCH2eOp6H/Qa9ovtdYyD7UPaBpxWLy4059hJpn0/dbuMrVqsRe1YktP9js/vB6xlUP9WH7usgkM8MbXvyCqeoi3H+PCB6J758RumVYG7hUf1HqRn8kXY49aVqHmd8lZYB1npEKgLImDy8mmOL7Lo8FzKZ/9+3w/Svmk6Tn+hv+DMXhnPjfZWaif9mdbMBFrv11ecAzPU67Ryi/sGwaHKTLEkmWhsb6rhvCX/K7G/n62s8ENl0vdabuQE+dPhoT5BQFsdE/aLK3GNfGrjA7MB8wBwYFKw4DAhoEFOigGL8Hmqy1/er/AiwfUYvYDj4SBBT2o31V5yaYilvp+YH0orVv9skj9wICB9A=
`;

let server;
let baseUrl;
let context;
let page;
let serviceWorker;
let extensionId;
let requestedRuntimeAssets;
let requestedUrls;

test.describe.configure({ mode: "serial", timeout: 60000 });

test.beforeAll(async () => {
  server = await startFixtureServer();
  baseUrl = `https://127.0.0.1:${server.address().port}`;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "skimroute-browser-"));
  requestedRuntimeAssets = [];
  requestedUrls = [];
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "";
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executablePath || undefined,
    headless: false,
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP chatgpt.com 127.0.0.1,MAP gemini.google.com 127.0.0.1,MAP docs.google.com 127.0.0.1,MAP www.google.com 127.0.0.1"
    ]
  });
  context.on("request", (request) => {
    const url = request.url();
    requestedUrls.push(url);
    if (/\/assets\/(pdf-runtime|ocr-runtime)\.js\b/.test(url)) {
      requestedRuntimeAssets.push(url);
    }
  });
  serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  extensionId = new URL(serviceWorker.url()).host;
  page = await context.newPage();
});

test.afterAll(async () => {
  if (context) await context.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("article loads core only and Jump scrolls to the useful section", async () => {
  resetRuntimeRequests();
  await gotoFixture("article.html");
  const stats = await waitForStats({ pageType: "article" });
  expect(stats.ok).toBeTruthy();
  expect(stats.quietMode).toBeFalsy();
  expect(stats.bestTitle).toMatch(/Main claim|Evidence and limits/i);
  expect(runtimeRequested("pdf")).toBeFalsy();
  expect(runtimeRequested("ocr")).toBeFalsy();
  expect(stats.runtimeState.pdf.ready).toBeFalsy();
  expect(stats.runtimeState.ocr.ready).toBeFalsy();

  const before = await page.evaluate(() => window.scrollY);
  const action = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  expect(action.ok).toBeTruthy();
  await page.waitForFunction((previous) => window.scrollY > previous + 100, before);
  await expect(page.locator(".pagepilot-answer-target")).toHaveCount(1);
});

test("local section query navigates mapped sections and Next uses progression", async () => {
  resetRuntimeRequests();
  await gotoFixture("article.html");
  let stats = await waitForStats({ pageType: "article" });
  expect(stats.ok).toBeTruthy();
  const networkBeforeQuery = requestedUrls.length;
  const queryStats = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "Main claim"
  });
  expect(["strong", "possible"]).toContain(queryStats.sectionQuery.status);
  expect(queryStats.sectionQuery.title).toMatch(/Main claim/i);
  expect(queryStats.sectionQuery.hasNavigated).toBeTruthy();
  expect(queryStats.sectionQuery.isCurrentTarget).toBeTruthy();
  await expect(page.locator(".pagepilot-answer-target")).toHaveCount(1);
  const queryNetwork = requestedUrls.slice(networkBeforeQuery).filter((url) => !url.startsWith("chrome-extension://"));
  expect(queryNetwork).toEqual([]);

  const returnSource = queryStats.sectionQuery;
  const away = await messageActiveTab({ type: "PAGEPILOT_NEXT_IMPORTANT" });
  expect(away.lastActionOk).toBeTruthy();
  expect(away.sectionQuery.canReturnToMatch).toBeTruthy();
  const returned = await messageActiveTab({ type: "PAGEPILOT_NAVIGATE_QUERY_RESULT", returnToMatch: true });
  expect(returned.sectionQuery.targetSectionId).toBe(returnSource.sectionId);
  expect(returned.sectionQuery.isCurrentTarget).toBeTruthy();
  expect(returned.sectionQuery.canReturnToMatch).toBeFalsy();
  expect(returned.sectionQuery.navigation.verified).toBeTruthy();
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/Main claim/i);

  const noMatch = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "quantum banana"
  });
  expect(noMatch.sectionQuery.status).toBe("none");

  await gotoFixture("tutorial.html");
  stats = await waitForStats({ pageType: "tutorial" });
  expect(stats.ok).toBeTruthy();
  const synonymNetworkBefore = requestedUrls.length;
  const setup = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "installation profile server"
  });
  expect(setup.sectionQuery.title).toMatch(/Setup/i);
  expect(["strong", "possible"]).toContain(setup.sectionQuery.status);
  const synonymNetwork = requestedUrls.slice(synonymNetworkBefore).filter((url) => !url.startsWith("chrome-extension://"));
  expect(synonymNetwork).toEqual([]);
  const next = await messageActiveTab({ type: "PAGEPILOT_NEXT_IMPORTANT" });
  expect(next.lastActionOk).toBeTruthy();
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/Step-by-step implementation/i);
});

test("ChatGPT and Gemini fixtures keep PDF and OCR runtimes unloaded", async () => {
  for (const fixture of [
    { host: "chatgpt.com", path: "/chatgpt.html" },
    { host: "gemini.google.com", path: "/gemini.html" }
  ]) {
    resetRuntimeRequests();
    await gotoHostFixture(fixture.host, fixture.path);
    const stats = await waitForStats({ pageType: "chat" });
    expect(stats.ok).toBeTruthy();
    expect(stats.chatReady || stats.sections > 0).toBeTruthy();
    expect(runtimeRequested("pdf")).toBeFalsy();
    expect(runtimeRequested("ocr")).toBeFalsy();
    expect(stats.runtimeState.pdf.ready).toBeFalsy();
    expect(stats.runtimeState.ocr.ready).toBeFalsy();
  }
});

test("chat query selects and highlights the matched live passage", async () => {
  resetRuntimeRequests();
  await gotoHostFixture("chatgpt.com", "/chatgpt.html");
  const stats = await waitForStats({ pageType: "chat" });
  expect(stats.ok).toBeTruthy();
  const networkBeforeQuery = requestedUrls.length;
  const queryStats = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "stable message contracts browser regression fixtures"
  });
  expect(["strong", "possible"]).toContain(queryStats.sectionQuery.status);
  expect(queryStats.sectionQuery.surface).toBe("chat");
  expect(queryStats.sectionQuery.passageId).toContain(":chat:");
  expect(queryStats.sectionQuery.navigation.exact).toBeTruthy();
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/stable message contracts/i);
  const queryNetwork = requestedUrls.slice(networkBeforeQuery).filter((url) => !url.startsWith("chrome-extension://"));
  expect(queryNetwork).toEqual([]);

  const codeStats = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "handleQueryAction function code"
  });
  expect(codeStats.sectionQuery.passageId).toContain(":chat:");
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/handleQueryAction/i);

  await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  const away = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
  expect(away.sectionQuery.canReturnToMatch).toBeTruthy();
  const returned = await messageActiveTab({ type: "PAGEPILOT_NAVIGATE_QUERY_RESULT", returnToMatch: true });
  expect(returned.sectionQuery.isCurrentTarget).toBeTruthy();
  expect(returned.sectionQuery.targetPassageId).toBe(codeStats.sectionQuery.passageId);
  expect(returned.sectionQuery.navigation.exact).toBeTruthy();
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/handleQueryAction/i);
});

test("chatbot Jump uses the nested conversation scroller from popup, sidebar, and keyboard", async () => {
  resetRuntimeRequests();
  await gotoHostFixture("chatgpt.com", "/fixtures/chatgpt-scroll.html");
  const stats = await waitForStats({ pageType: "chat" });
  expect(stats.ok).toBeTruthy();

  await resetNestedChatScroll("[data-testid='conversation']");
  const beforePopup = await readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']");
  expect(beforePopup.visible).toBeFalsy();
  const popupJump = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  expect(popupJump.lastActionOk).toBeTruthy();
  await expect.poll(() => readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']"), { timeout: 2500 }).toMatchObject({ visible: true });
  let after = await readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']");
  expect(after.scrollTop).toBeGreaterThan(beforePopup.scrollTop + 100);
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/Corrected final answer/i);

  await resetNestedChatScroll("[data-testid='conversation']");
  await messageActiveTab({ type: "PAGEPILOT_TOGGLE", open: true });
  await page.locator("#pagepilot-root .pp-skip").click();
  await expect.poll(() => readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']"), { timeout: 2500 }).toMatchObject({ visible: true });
  after = await readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']");
  expect(after.scrollTop).toBeGreaterThan(100);
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/Corrected final answer/i);

  await resetNestedChatScroll("[data-testid='conversation']");
  await page.keyboard.press("Alt+J");
  await expect.poll(() => readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']"), { timeout: 2500 }).toMatchObject({ visible: true });
  after = await readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']");
  expect(after.scrollTop).toBeGreaterThan(100);
  await expect(page.locator(".pagepilot-answer-target")).toContainText(/Corrected final answer/i);
});

test("chatbot Next uses the same nested scroller from popup, sidebar, and keyboard", async () => {
  for (const source of ["popup", "sidebar", "keyboard"]) {
    resetRuntimeRequests();
    await gotoHostFixture("chatgpt.com", "/fixtures/chatgpt-scroll.html");
    await waitForStats({ pageType: "chat" });
    await resetNestedChatScroll("[data-testid='conversation']");
    const jump = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
    expect(jump.lastActionOk).toBeTruthy();
    await expect.poll(() => readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']"), { timeout: 2500 }).toMatchObject({ visible: true });

    if (source === "popup") {
      const next = await messageActiveTab({ type: "PAGEPILOT_NEXT_IMPORTANT" });
      expect(next.lastActionOk).toBeTruthy();
    } else if (source === "sidebar") {
      await messageActiveTab({ type: "PAGEPILOT_TOGGLE", open: true });
      await page.locator("#pagepilot-root .pp-next").click();
    } else {
      await page.keyboard.press("Alt+N");
    }

    await expect.poll(() => readNestedChatState("[data-testid='conversation']", ".pagepilot-answer-target"), { timeout: 2500 }).toMatchObject({ visible: true });
    const highlighted = await readNestedChatState("[data-testid='conversation']", ".pagepilot-answer-target");
    expect(highlighted.scrollTop).toBeGreaterThan(0);
  }
});

test("chatbot navigation re-resolves stale anchors and fails honestly when unresolved", async () => {
  resetRuntimeRequests();
  await gotoHostFixture("chatgpt.com", "/fixtures/chatgpt-scroll.html");
  await waitForStats({ pageType: "chat" });
  await page.evaluate(() => {
    const target = document.querySelector("[data-chat-target='corrected-final']");
    const clone = target && target.cloneNode(true);
    if (target && clone) target.replaceWith(clone);
  });
  await resetNestedChatScroll("[data-testid='conversation']");
  const staleJump = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  expect(staleJump.lastActionOk).toBeTruthy();
  await expect.poll(() => readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']"), { timeout: 2500 }).toMatchObject({ visible: true });
  await expect(page.locator("[data-chat-target='corrected-final'].pagepilot-answer-target")).toHaveCount(1);

  const visibleBefore = await readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']");
  const alreadyVisible = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  expect(alreadyVisible.lastActionOk).toBeTruthy();
  const visibleAfter = await readNestedChatState("[data-testid='conversation']", "[data-chat-target='corrected-final']");
  expect(Math.abs(visibleAfter.scrollTop - visibleBefore.scrollTop)).toBeLessThan(80);

  await gotoHostFixture("chatgpt.com", "/fixtures/chatgpt-scroll.html");
  await waitForStats({ pageType: "chat" });
  await page.evaluate(() => {
    document.querySelectorAll("[data-message-author-role='assistant']").forEach((node) => node.remove());
  });
  const failed = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  expect(failed.lastActionOk).toBeFalsy();
  await expect(page.locator(".pagepilot-answer-target")).toHaveCount(0);
});

test("Gemini and generic chatbot fixtures keep Jump on the selected live chat target", async () => {
  for (const fixture of [
    {
      host: "gemini.google.com",
      path: "/fixtures/gemini-scroll.html",
      container: "main"
    },
    {
      host: "chatgpt.com",
      path: "/fixtures/generic-chat-scroll.html",
      container: ".generic-chat-log"
    }
  ]) {
    resetRuntimeRequests();
    await gotoHostFixture(fixture.host, fixture.path);
    await waitForStats({ pageType: "chat" });
    await resetNestedChatScroll(fixture.container);
    const jumped = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
    expect(jumped.lastActionOk).toBeTruthy();
    await expect.poll(() => readNestedChatState(fixture.container, ".pagepilot-answer-target"), { timeout: 2500 }).toMatchObject({ visible: true });
    await expect(page.locator(".pagepilot-answer-target")).toHaveCount(1);
  }
});

test("search, quiet page, and SPA route refresh remain handled by top-frame core", async () => {
  resetRuntimeRequests();
  await gotoHostFixture("www.google.com", "/search?q=runtime-split&fixture=ai");
  let stats = await waitForStats({ pageType: "search_results" });
  expect(stats.bestTitle).toMatch(/AI Overview/i);
  expect(runtimeRequested("pdf")).toBeFalsy();

  await gotoHostFixture("www.google.com", "/search?q=runtime-split&fixture=basic");
  stats = await waitForStats({ pageType: "search_results" });
  expect(stats.bestTitle).toMatch(/Top result/i);
  expect(runtimeRequested("pdf")).toBeFalsy();

  await gotoFixture("quiet.html");
  stats = await waitForStats();
  expect(stats.quietMode).toBeTruthy();

  await gotoFixture("spa.html");
  await page.locator("#route").click();
  await expect(page.locator("text=SPA long article")).toBeVisible();
  await page.waitForTimeout(1500);
  stats = await waitForStats({ pageType: "article" });
  expect(stats.bestTitle).toMatch(/Main claim|Summary/i);
});

test("Google Docs ready and accessibility-required fixtures preserve honest navigation", async () => {
  resetRuntimeRequests();
  await gotoHostFixture("docs.google.com", "/document/d/ready/edit");
  let stats = await waitForStats({ pageType: "docs" });
  expect(stats.ok).toBeTruthy();
  expect(stats.quietMode).toBeFalsy();
  await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  await expect(page.locator(".pagepilot-google-docs-highlight")).toHaveCount(1);

  await gotoHostFixture("docs.google.com", "/document/d/required/edit");
  stats = await waitForStats({ pageType: "docs" });
  expect(stats.quietMode).toBeTruthy();
  expect(`${stats.reason} ${stats.quietReason}`).toMatch(/screen-reader support|cannot read enough/i);
  await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  await expect(page.locator(".pagepilot-google-docs-highlight")).toHaveCount(0);
});

test("selectable PDF loads PDF runtime but not OCR runtime", async () => {
  resetRuntimeRequests();
  await gotoFixture("selectable.pdf");
  await page.waitForTimeout(2500);
  expect(runtimeRequested("pdf")).toBeTruthy();
  expect(runtimeRequested("ocr")).toBeFalsy();
  const stats = await waitForStats({ pageType: "pdf" });
  expect(stats.ok).toBeTruthy();
  expect(stats.pageLabel).toBe("PDF");
  const staleAction = await messageActiveTab({ type: "PAGEPILOT_JUMP_USEFUL" });
  expect(staleAction.ok).toBeTruthy();
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const beforeScroll = await getPdfScrollTop();
  const networkBeforeQuery = requestedUrls.length;
  const queryStats = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "benchmark findings latency reduction"
  });
  expect(["strong", "possible"]).toContain(queryStats.sectionQuery.status);
  expect(queryStats.sectionQuery.surface).toBe("pdf");
  expect(queryStats.sectionQuery.pageNumber).toBe(6);
  expect(queryStats.sectionQuery.navigation.navigated).toBeTruthy();
  expect(queryStats.sectionQuery.navigation.verified).toBeTruthy();
  expect(queryStats.sectionQuery.navigation.exact).toBeTruthy();
  expect(await getPdfScrollTop()).toBeGreaterThan(beforeScroll);
  expect(await isPdfPageVisible(6)).toBeTruthy();
  await expect.poll(() => queryHighlightIntersectsPdfPage(6), { timeout: 3000 }).toBeTruthy();
  await expect.poll(async () => page.locator(".pagepilot-pdf-page-section-highlight, .pagepilot-controlled-pdf-highlight, .pagepilot-answer-target").count(), { timeout: 1000 }).toBeGreaterThan(0);
  const queryNetwork = requestedUrls.slice(networkBeforeQuery).filter((url) => !url.startsWith("chrome-extension://"));
  expect(queryNetwork).toEqual([]);
});

test("cached OCR PDF query uses OCR passage metadata", async () => {
  resetRuntimeRequests();
  await gotoFixture("scanned-query.pdf");
  await seedOcrCacheForActiveTab();
  await messageActiveTab({ type: "PAGEPILOT_SCAN" });
  await page.waitForTimeout(2500);
  const stats = await waitForStats({ pageType: "pdf" });
  expect(stats.ok).toBeTruthy();
  expect(stats.sections).toBeGreaterThan(0);
  const queryStats = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "appeal documents mailing address eligibility deadline"
  });
  expect(["strong", "possible"]).toContain(queryStats.sectionQuery.status);
  expect(queryStats.sectionQuery.surface).toBe("pdf");
  expect(queryStats.sectionQuery.pageNumber).toBe(3);
  expect(queryStats.sectionQuery.passageId).toMatch(/ocr/i);
  expect(queryStats.sectionQuery.navigation.navigated).toBeTruthy();
  await expect(page.locator(".pagepilot-pdf-page-section-highlight, .pagepilot-controlled-pdf-highlight, .pagepilot-answer-target")).toHaveCount(1);
});

test("OCR PDF query waits during OCR, preserves state, and verifies passage navigation", async () => {
  resetRuntimeRequests();
  await gotoPdfFixture("scanned-query.pdf", "?lifecycle=ocr");
  await installOcrTestResultForActiveTab({ delayMs: 2200 });
  let stats = await waitForStats({ pageType: "pdf" });
  expect(stats.ok).toBeTruthy();

  await messageActiveTab({ type: "PAGEPILOT_RUN_PDF_OCR", mode: "fast" });
  const waiting = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "appeal documents mailing address eligibility deadline"
  });
  expect(waiting.sectionQuery.text).toBe("appeal documents mailing address eligibility deadline");
  expect(waiting.sectionQuery.status).toBe("waiting");
  expect(waiting.sectionQuery.reason).toMatch(/Waiting for OCR/i);

  await messageActiveTab({ type: "PAGEPILOT_TOGGLE", open: true });
  await expect.poll(async () => {
    const latest = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
    return Boolean(latest.open && latest.sidebarOpenResult && latest.sidebarOpenResult.visible);
  }, { timeout: 20000 }).toBeTruthy();
  const openStats = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
  expect(openStats.sidebarOpenResult).toMatchObject({ requested: true, mounted: true, visible: true, surface: "pdf" });
  await expect(page.locator("#pagepilot-root")).toHaveCount(1);

  await expect.poll(async () => {
    const latest = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
    return latest.sectionQuery && latest.sectionQuery.status;
  }, { timeout: 12000 }).toMatch(/^(strong|possible)$/);

  stats = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
  expect(stats.sectionQuery.text).toBe("appeal documents mailing address eligibility deadline");
  expect(stats.sectionQuery.surface).toBe("pdf");
  expect(stats.sectionQuery.pageNumber).toBe(3);
  expect(stats.sectionQuery.passageId).toMatch(/ocr/i);
  expect(stats.sectionQuery.navigation.verified).toBeTruthy();
  expect(stats.sectionQuery.navigation.reason).toMatch(/matching (page|passage)/i);
  expect(await isPdfPageVisible(3)).toBeTruthy();
  expect(await queryHighlightIntersectsPdfPage(3)).toBeTruthy();

  const fuzzyStats = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "family appeal packet"
  });
  expect(["strong", "possible"]).toContain(fuzzyStats.sectionQuery.status);
  expect(fuzzyStats.sectionQuery.surface).toBe("pdf");
  expect(fuzzyStats.sectionQuery.passageId).toMatch(/ocr/i);
  expect(fuzzyStats.sectionQuery.ocrFuzzyMatches).toBeGreaterThanOrEqual(1);
  expect(fuzzyStats.sectionQuery.navigation.verified).toBeTruthy();

  const ocrNetworkBefore = requestedUrls.length;
  const singleExact = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "eligibility"
  });
  expect(["strong", "possible"]).toContain(singleExact.sectionQuery.status);
  expect(singleExact.sectionQuery.surface).toBe("pdf");
  expect(singleExact.sectionQuery.ocrExactMatches).toBeGreaterThanOrEqual(1);
  expect(singleExact.sectionQuery.navigation.verified).toBeTruthy();

  const singleFuzzy = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "family"
  });
  expect(singleFuzzy.sectionQuery.status).toBe("weak");
  expect(singleFuzzy.sectionQuery.weakRequiresConfirm).toBeTruthy();
  expect(singleFuzzy.sectionQuery.ocrFuzzyMatches).toBeGreaterThanOrEqual(1);
  expect(singleFuzzy.sectionQuery.navigation.navigated).toBeFalsy();

  const confirmedFuzzy = await messageActiveTab({
    type: "PAGEPILOT_NAVIGATE_QUERY_RESULT",
    sectionId: singleFuzzy.sectionQuery.sectionId,
    passageId: singleFuzzy.sectionQuery.passageId
  });
  expect(confirmedFuzzy.sectionQuery.navigation.verified).toBeTruthy();

  const footerOnly = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "copyright footer"
  });
  expect(footerOnly.sectionQuery.status).toBe("none");

  const unrelated = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "xylophone zeppelin"
  });
  expect(unrelated.sectionQuery.status).toBe("none");
  expect(unrelated.sectionQuery.reason).toMatch(/OCR text|No strong/i);
  const ocrQueryNetwork = requestedUrls.slice(ocrNetworkBefore).filter((url) => !url.startsWith("chrome-extension://"));
  expect(ocrQueryNetwork).toEqual([]);
});

test("weak Fast OCR no-match offers Better OCR and reruns the preserved query", async () => {
  resetRuntimeRequests();
  await gotoPdfFixture("scanned-query.pdf", "?weak-ocr-retry=success");
  await installOcrTestResultForActiveTab({ entry: makeWeakUnreadableOcrEntry({ delayMs: 450 }), delayMs: 450 });
  let stats = await waitForStats({ pageType: "pdf" });
  expect(stats.ok).toBeTruthy();

  await messageActiveTab({ type: "PAGEPILOT_RUN_PDF_OCR", mode: "fast" });
  await expect.poll(async () => {
    const latest = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
    return Boolean(latest.pdfOcrCanRunBetter && latest.pdfOcrRecommendedMode === "better");
  }, { timeout: 12000 }).toBeTruthy();

  const weakQuery = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "scholarship requirements"
  });
  expect(weakQuery.sectionQuery.status).toBe("error");
  expect(weakQuery.sectionQuery.text).toBe("scholarship requirements");
  expect(weakQuery.sectionQuery.reason).toBe("Fast OCR could not read this text clearly enough to search it.");
  expect(weakQuery.sectionQuery.canRunBetterOcr).toBeTruthy();
  expect(weakQuery.pdfOcrCanRunBetter).toBeTruthy();
  expect(weakQuery.pdfOcrRecommendedMode).toBe("better");

  const targetTabId = await getTabIdForUrl(page.url());
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${targetTabId}`);
  await expect(popup.locator(".query-better-ocr")).toBeVisible();
  const popupBetter = await popup.locator(".query-better-ocr").evaluate(readButtonVisual);
  expect(popupBetter.text).toContain("Search again with Better OCR");
  expect(popupBetter.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(popupBetter.fill).not.toBe("rgba(0, 0, 0, 0)");
  expect(popupBetter.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(popupBetter.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  await popup.close();

  await messageActiveTab({ type: "PAGEPILOT_TOGGLE", open: true });
  await expect(page.locator("#pagepilot-root .pp-query-better-ocr")).toBeVisible();
  const sidebarBetter = await page.locator("#pagepilot-root .pp-query-better-ocr").evaluate(readButtonVisual);
  expect(sidebarBetter.text).toContain("Search again with Better OCR");
  expect(sidebarBetter.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(sidebarBetter.fill).not.toBe("rgba(0, 0, 0, 0)");
  expect(sidebarBetter.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(sidebarBetter.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  await installOcrTestResultForActiveTab({ entry: makeBetterScholarshipOcrEntry({ delayMs: 500 }), delayMs: 500 });
  await page.locator("#pagepilot-root .pp-query-better-ocr").click();
  await expect(page.locator("#pagepilot-root .pp-query-better-ocr")).toBeDisabled();
  await expect(page.locator("#pagepilot-root .pp-query-better-ocr")).toContainText(/Running Better OCR/i);

  await expect.poll(async () => {
    const latest = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
    return latest.sectionQuery && latest.sectionQuery.status;
  }, { timeout: 15000 }).toMatch(/^(strong|possible)$/);
  stats = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
  expect(stats.sectionQuery.text).toBe("scholarship requirements");
  expect(stats.sectionQuery.title).toMatch(/Scholarship|requirements|award/i);
  expect(stats.sectionQuery.surface).toBe("pdf");
  expect(stats.sectionQuery.pageNumber).toBe(3);
  expect(stats.sectionQuery.navigation.verified).toBeTruthy();
  expect(stats.sectionQuery.canRunBetterOcr).toBeFalsy();
  expect(await isPdfPageVisible(3)).toBeTruthy();
  expect(await queryHighlightIntersectsPdfPage(3)).toBeTruthy();
});

test("Better OCR retry preserves the query and reports an honest final OCR no-match", async () => {
  resetRuntimeRequests();
  await gotoPdfFixture("scanned-query.pdf", "?weak-ocr-retry=fail");
  await installOcrTestResultForActiveTab({ entry: makeWeakUnreadableOcrEntry({ delayMs: 350 }), delayMs: 350 });
  await waitForStats({ pageType: "pdf" });
  await messageActiveTab({ type: "PAGEPILOT_RUN_PDF_OCR", mode: "fast" });
  await expect.poll(async () => {
    const latest = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
    return Boolean(latest.pdfOcrCanRunBetter);
  }, { timeout: 12000 }).toBeTruthy();

  const weakQuery = await messageActiveTab({
    type: "PAGEPILOT_QUERY_SECTION",
    query: "scholarship requirements"
  });
  expect(weakQuery.sectionQuery.status).toBe("error");
  expect(weakQuery.sectionQuery.canRunBetterOcr).toBeTruthy();

  await installOcrTestResultForActiveTab({ entry: makeWeakUnreadableOcrEntry({ delayMs: 450, canRunBetter: false }), delayMs: 450 });
  await messageActiveTab({ type: "PAGEPILOT_RUN_PDF_OCR", mode: "better" });
  await expect.poll(async () => {
    const latest = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
    return latest.sectionQuery && latest.sectionQuery.reason || "";
  }, { timeout: 15000 }).toBe("Better OCR still could not read text resembling this query.");
  const stats = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
  expect(stats.sectionQuery.text).toBe("scholarship requirements");
  expect(stats.sectionQuery.status).toBe("none");
});

test("scanned PDF requests OCR runtime only after OCR starts and loaders dedupe", async () => {
  resetRuntimeRequests();
  await gotoFixture("scanned.pdf");
  await page.waitForTimeout(2500);
  expect(runtimeRequestCount("pdf")).toBe(1);
  expect(runtimeRequested("ocr")).toBeFalsy();

  await messageActiveTab({ type: "PAGEPILOT_RUN_PDF_OCR", mode: "fast" });
  await page.waitForTimeout(250);
  await expect.poll(() => runtimeRequestCount("ocr"), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  await messageActiveTab({ type: "PAGEPILOT_RUN_PDF_OCR", mode: "fast" });
  await page.waitForTimeout(500);
  expect(runtimeRequestCount("ocr")).toBe(1);
});

test("popup/sidebar status stays synchronized and file-access seam is deterministic", async () => {
  resetRuntimeRequests();
  await gotoFixture("sync.html");
  let stats = await waitForStats({ pageType: "article" });
  expect(stats.sections).toBeGreaterThan(0);

  stats = await messageActiveTab({ type: "PAGEPILOT_TOGGLE", open: true });
  expect(stats.open).toBeTruthy();
  const targetTabId = await getTabIdForUrl(page.url());
  expect(targetTabId).toBeGreaterThan(0);
  await expect.poll(() => getTabUrl(targetTabId), { timeout: 5000 }).toContain("/fixtures/sync.html");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${targetTabId}`);
  await expect.poll(() => popup.evaluate(() => window.location.search), { timeout: 5000 }).toContain(`tabId=${targetTabId}`);
  await expect.poll(() => popup.evaluate((id) => new Promise((resolve) => {
    chrome.tabs.get(id, (tab) => resolve(tab && tab.url ? tab.url : ""));
  }), targetTabId), { timeout: 5000 }).toContain("/fixtures/sync.html");
  await expect(popup.locator("#bestTitle")).toContainText(stats.bestTitle || "Nothing strong to map here");
  await serviceWorker.evaluate(() => chrome.storage.local.set({ "pagepilot.test.fileAccessAllowed": false }));
  let fileAccess = await popupRuntimeMessage(popup, { type: "PAGEPILOT_FILE_ACCESS_STATUS" });
  expect(fileAccess).toMatchObject({ ok: true, allowed: false, testOverride: true });
  await serviceWorker.evaluate(() => chrome.storage.local.set({ "pagepilot.test.fileAccessAllowed": true }));
  fileAccess = await popupRuntimeMessage(popup, { type: "PAGEPILOT_FILE_ACCESS_STATUS" });
  expect(fileAccess).toMatchObject({ ok: true, allowed: true, testOverride: true });
  await serviceWorker.evaluate(() => chrome.storage.local.remove("pagepilot.test.fileAccessAllowed"));
  await popup.close();
});

test("sidebar query card remains readable under hostile page CSS", async () => {
  resetRuntimeRequests();
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoFixture("article.html");
  await page.addStyleTag({
    content: `
      #pagepilot-root, #pagepilot-root * {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
        background: transparent !important;
        border-color: transparent !important;
        opacity: 0.5 !important;
        font: 9px serif !important;
      }
    `
  });
  const stats = await messageActiveTab({ type: "PAGEPILOT_TOGGLE", open: true });
  expect(stats.open).toBeTruthy();
  await page.locator("#pagepilot-root .pp-query-input").fill("Main claim");
  await page.keyboard.press("Enter");
  await expect(page.locator("#pagepilot-root .pp-query-result")).toBeVisible();
  await messageActiveTab({ type: "PAGEPILOT_NEXT_IMPORTANT" });
  await expect(page.locator("#pagepilot-root .pp-query-return")).toBeVisible();
  const visual = await page.evaluate(() => {
    const root = document.querySelector("#pagepilot-root");
    const query = root && root.querySelector(".pp-query");
    const input = root && root.querySelector(".pp-query-input");
    const button = root && root.querySelector(".pp-query-submit");
    const returnButton = root && root.querySelector(".pp-query-return");
    const result = root && root.querySelector(".pp-query-result");
    const sidebar = root && root.querySelector(".pp-sidebar");
    const read = (element) => {
      const style = element ? getComputedStyle(element) : null;
      const rect = element ? element.getBoundingClientRect() : null;
      return {
        color: style && style.color || "",
        fill: style && style.webkitTextFillColor || "",
        background: style && style.backgroundColor || "",
        opacity: style && style.opacity || "",
        fontSize: style && style.fontSize || "",
        rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null
      };
    };
    return {
      query: read(query),
      input: read(input),
      button: read(button),
      returnButton: read(returnButton),
      result: read(result),
      sidebar: read(sidebar)
    };
  });
  for (const key of ["query", "input", "button", "returnButton", "result"]) {
    expect(visual[key].fill).not.toBe("rgba(0, 0, 0, 0)");
    expect(visual[key].color).not.toBe("rgba(0, 0, 0, 0)");
    expect(visual[key].background).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number(visual[key].opacity)).toBeGreaterThan(key === "returnButton" ? 0.6 : 0.9);
    expect(parseFloat(visual[key].fontSize)).toBeGreaterThanOrEqual(12);
  }
  expect(visual.query.rect.left).toBeGreaterThanOrEqual(visual.sidebar.rect.left - 1);
  expect(visual.query.rect.right).toBeLessThanOrEqual(visual.sidebar.rect.right + 1);
  await page.emulateMedia({ colorScheme: "light" });
});

test("generated assets are current inside the loaded package", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  expect(manifest.content_scripts[0].js).toEqual([
    "debug-config.js",
    "assets/adapters.js",
    "assets/engine.js",
    "assets/ui.js",
    "assets/content-core.js"
  ]);
  for (const stale of [
    "assets/content.js-BzKMfaWY.js",
    "assets/popup.html-C-AIiryS.js",
    "assets/background.js-DHppkjD5.js"
  ]) {
    expect(fs.existsSync(path.join(root, stale))).toBeFalsy();
  }
});

async function gotoFixture(name) {
  const pathName = name.endsWith(".pdf") ? `/${name}` : `/fixtures/${name}`;
  await page.bringToFront();
  await page.goto(`${baseUrl}${pathName}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
}

async function gotoPdfFixture(name, search = "") {
  await page.bringToFront();
  await page.goto(`${baseUrl}/${name}${search || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
}

async function gotoHostFixture(host, pathName) {
  await page.bringToFront();
  await page.goto(`https://${host}:${server.address().port}${pathName}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
}

async function waitForStats(filter = {}) {
  let latest = null;
  await expect.poll(async () => {
    const stats = await messageActiveTab({ type: "PAGEPILOT_STATUS" });
    if (!stats || !stats.ok) return "waiting";
    if (filter.pageType && stats.pageType !== filter.pageType) return "waiting";
    latest = stats;
    return "ready";
  }, { timeout: 15000 }).toBe("ready");
  return latest;
}

async function messageActiveTab(message) {
  await page.bringToFront();
  return serviceWorker.evaluate((payload) => new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        resolve({ ok: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tab.id, payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || null);
      });
    });
  }), message);
}

async function resetNestedChatScroll(containerSelector) {
  await page.evaluate((selector) => {
    const container = document.querySelector(selector);
    if (container) container.scrollTop = 0;
    document.querySelectorAll(".pagepilot-answer-target").forEach((node) => node.classList.remove("pagepilot-answer-target"));
  }, containerSelector);
}

async function readNestedChatState(containerSelector, targetSelector) {
  return page.evaluate(({ containerSelector: containerSel, targetSelector: targetSel }) => {
    const container = document.querySelector(containerSel);
    const target = document.querySelector(targetSel);
    if (!container || !target) {
      return { exists: Boolean(target), scrollTop: container ? Math.round(container.scrollTop || 0) : 0, visible: false, highlighted: false };
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = containerRect.top + Math.min(72, Math.max(16, containerRect.height * 0.14));
    const bottom = containerRect.bottom - Math.min(96, Math.max(20, containerRect.height * 0.18));
    const visiblePixels = Math.min(targetRect.bottom, bottom) - Math.max(targetRect.top, top);
    return {
      exists: true,
      scrollTop: Math.round(container.scrollTop || 0),
      visible: visiblePixels >= Math.max(18, Math.min(targetRect.height, bottom - top) * 0.25),
      highlighted: target.classList.contains("pagepilot-answer-target"),
      targetTop: Math.round(targetRect.top),
      targetBottom: Math.round(targetRect.bottom),
      containerTop: Math.round(containerRect.top),
      containerBottom: Math.round(containerRect.bottom)
    };
  }, { containerSelector, targetSelector });
}

async function popupRuntimeMessage(popup, message) {
  return popup.evaluate((payload) => new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || null);
    });
  }), message);
}

async function getPdfScrollTop() {
  return page.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement;
    if (doc && doc.scrollHeight > window.innerHeight + 5) {
      return Number(doc.scrollTop) || Number(window.scrollY) || 0;
    }
    const candidates = [
      document.querySelector("#viewerContainer"),
      doc,
      document.documentElement,
      document.body
    ].filter(Boolean);
    const scrollable = candidates.find((element) => element.scrollHeight > element.clientHeight + 5);
    return scrollable ? Number(scrollable.scrollTop) || 0 : Number(window.scrollY) || 0;
  });
}

async function isPdfPageVisible(pageNumber) {
  return page.evaluate((number) => {
    const target = document.querySelector(`[data-page-number="${number}"], .page[data-page-number="${number}"]`);
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }, pageNumber);
}

async function queryHighlightIntersectsPdfPage(pageNumber) {
  return page.evaluate((number) => {
    const pageElement = document.querySelector(`[data-page-number="${number}"], .page[data-page-number="${number}"]`);
    const highlights = Array.from(document.querySelectorAll(".pagepilot-pdf-page-section-highlight, .pagepilot-controlled-pdf-highlight, .pagepilot-answer-target"));
    if (!pageElement || !highlights.length) return false;
    const a = pageElement.getBoundingClientRect();
    return highlights.some((highlight) => {
      const b = highlight.getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    });
  }, pageNumber);
}

function readButtonVisual(element) {
  const style = getComputedStyle(element);
  return {
    text: element.textContent || "",
    color: style.color || "",
    fill: style.webkitTextFillColor || "",
    background: style.backgroundColor || "",
    borderColor: style.borderColor || "",
    cursor: style.cursor || "",
    opacity: style.opacity || ""
  };
}

async function installOcrTestResultForActiveTab(options = {}) {
  const tabId = await getTabIdForUrl(page.url());
  expect(tabId).toBeGreaterThan(0);
  const entry = options.entry || makeOcrQueryEntry({ ...(options.entryOverrides || {}), delayMs: options.delayMs || 700 });
  const delayMs = options.delayMs || entry.delayMs || 700;
  const installed = await serviceWorker.evaluate(({ id, payload, delayMs }) => new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId: id },
      world: "ISOLATED",
      args: [payload, delayMs],
      func: (ocrResult, delay) => {
        window.__PAGEPILOT_TEST_OCR_RESULT__ = ocrResult;
        window.__PAGEPILOT_TEST_OCR_DELAY_MS__ = delay;
        window.__PAGEPILOT_PDF_OCR_CACHE__ = Object.create(null);
        sessionStorage.removeItem("pagepilot.pdfRecoveryCache");
      }
    }, () => resolve(!chrome.runtime.lastError));
  }), { id: tabId, payload: entry, delayMs });
  expect(installed).toBeTruthy();
}

function makeOcrQueryEntry(overrides = {}) {
  const text = [
    "Notice of determination: appeal requirements.",
    "Applicants must include appeal documents, the mailing address, and the eligibility deadline before review can begin.",
    "The eligibility deadline is printed with the appeal documents and must be checked before mailing the packet.",
    "Mail the farnily appeal packet to the benefits review mailing ad- dress listed in the notice before the deadline.",
    "Representative signature instructions appear below the mailing address for authorized appeals.",
    "Page 3 of 8 copyright scanned footer."
  ].join(" ");
  const pageData = {
    pageNumber: 3,
    text,
    lines: [
      {
        id: "ocr-query-heading",
        sourceLineIds: ["ocr-query-heading"],
        pageNumber: 3,
        text: "Notice of determination: appeal requirements.",
        relativeY: 0.22,
        relativeYStart: 0.19,
        relativeYEnd: 0.25,
        confidence: 93
      },
      {
        id: "ocr-query-line-a",
        sourceLineIds: ["ocr-query-line-a"],
        pageNumber: 3,
        text: "Applicants must include appeal documents, the mailing address, and the eligibility deadline before review can begin.",
        relativeY: 0.40,
        relativeYStart: 0.36,
        relativeYEnd: 0.44,
        confidence: 91
      },
      {
        id: "ocr-query-line-b",
        sourceLineIds: ["ocr-query-line-b"],
        pageNumber: 3,
        text: "The eligibility deadline is printed with the appeal documents and must be checked before mailing the packet.",
        relativeY: 0.48,
        relativeYStart: 0.45,
        relativeYEnd: 0.52,
        confidence: 90
      },
      {
        id: "ocr-query-line-c",
        sourceLineIds: ["ocr-query-line-c"],
        pageNumber: 3,
        text: "Mail the farnily appeal packet to the benefits review mailing ad- dress listed in the notice before the deadline.",
        relativeY: 0.56,
        relativeYStart: 0.53,
        relativeYEnd: 0.60,
        confidence: 90
      },
      {
        id: "ocr-query-line-d",
        sourceLineIds: ["ocr-query-line-d"],
        pageNumber: 3,
        text: "Representative signature instructions appear below the mailing address for authorized appeals.",
        relativeY: 0.64,
        relativeYStart: 0.61,
        relativeYEnd: 0.68,
        confidence: 89
      },
      {
        id: "ocr-query-footer",
        sourceLineIds: ["ocr-query-footer"],
        pageNumber: 3,
        text: "Page 3 of 8 copyright scanned footer.",
        relativeY: 0.96,
        relativeYStart: 0.94,
        relativeYEnd: 0.98,
        confidence: 92
      }
    ]
  };
  return {
    source: "ocr",
    text,
    rawText: text,
    reconstructedText: text,
    words: text.split(/\s+/).filter(Boolean).length,
    pages: [pageData],
    pagesRead: 3,
    numPages: 3,
    confidence: 91,
    updatedAt: Date.now(),
    ocrMode: "fixture",
    ocrQuality: "readable",
    qualityScore: 86,
    qualityMessage: "OCR finished. SkimRoute found readable text and built a page map.",
    ocrTextQuality: {
      corrupted: false,
      missedRegionLikely: false,
      readable: true,
      words: text.split(/\s+/).filter(Boolean).length,
      confidence: 91,
      score: 86
    },
    ...overrides
  };
}

function makeWeakUnreadableOcrEntry(overrides = {}) {
  const text = [
    "rnII O0 cIe vvv pqr br0ken scanncd glyplis rnark rnode err0r frarne",
    "I1l mmm ooo rrn cIe cIe 1010 vvvv farnily nurnber garbled locatlon",
    "unreadabIe notice frorn parser faIlback with randorn tokens and rnissing words",
    "cIeared rnarkers rrn rrn rnain docurnent rnisread sections without useful terrns",
    "Page 3 of 8 f00ter nois3"
  ].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  const quality = {
    corrupted: true,
    missedRegionLikely: true,
    readable: false,
    complete: false,
    words,
    readableWordRatio: 0.18,
    textCompleteness: 0.22,
    pageCoverage: 0.28,
    paragraphContinuity: 0.1,
    confidence: 23,
    score: 48
  };
  return makeOcrQueryEntry({
    text,
    rawText: text,
    reconstructedText: text,
    words,
    pages: [{
      pageNumber: 3,
      text,
      lines: [
        {
          id: "weak-ocr-line-a",
          sourceLineIds: ["weak-ocr-line-a"],
          pageNumber: 3,
          text: "rnII O0 cIe vvv pqr br0ken scanncd glyplis rnark rnode err0r frarne",
          relativeY: 0.34,
          relativeYStart: 0.31,
          relativeYEnd: 0.37,
          confidence: 23
        },
        {
          id: "weak-ocr-line-b",
          sourceLineIds: ["weak-ocr-line-b"],
          pageNumber: 3,
          text: "I1l mmm ooo rrn cIe cIe 1010 vvvv farnily nurnber garbled locatlon",
          relativeY: 0.44,
          relativeYStart: 0.41,
          relativeYEnd: 0.47,
          confidence: 21
        },
        {
          id: "weak-ocr-line-c",
          sourceLineIds: ["weak-ocr-line-c"],
          pageNumber: 3,
          text: "unreadabIe notice frorn parser faIlback with randorn tokens and rnissing words",
          relativeY: 0.54,
          relativeYStart: 0.51,
          relativeYEnd: 0.57,
          confidence: 24
        },
        {
          id: "weak-ocr-line-d",
          sourceLineIds: ["weak-ocr-line-d"],
          pageNumber: 3,
          text: "cIeared rnarkers rrn rrn rnain docurnent rnisread sections without useful terrns",
          relativeY: 0.64,
          relativeYStart: 0.61,
          relativeYEnd: 0.67,
          confidence: 22
        },
        {
          id: "weak-ocr-footer",
          sourceLineIds: ["weak-ocr-footer"],
          pageNumber: 3,
          text: "Page 3 of 8 f00ter nois3",
          relativeY: 0.96,
          relativeYStart: 0.94,
          relativeYEnd: 0.98,
          confidence: 28
        }
      ]
    }],
    pagesRead: 3,
    numPages: 3,
    confidence: 23,
    ocrMode: "fixture-fast",
    ocrQuality: "weak_structure",
    qualityScore: 48,
    qualityMessage: "Fast OCR produced weak text. Better OCR can improve this scan.",
    ocrTextQuality: quality,
    parserFallbackUsed: true,
    canRunBetter: true,
    pageDiagnostics: [{
      pageNumber: 3,
      words,
      variantResults: [{
        variantName: "fast-fallback",
        pageNumber: 3,
        wordCount: words,
        rawTextLength: text.length,
        confidence: 23,
        ocrTextQuality: quality
      }]
    }],
    ...overrides
  });
}

function makeBetterScholarshipOcrEntry(overrides = {}) {
  const text = [
    "Notice of award appeal requirements.",
    "Scholarship requirements include family income documents, enrollment status, and the signed eligibility form.",
    "Submit the scholarship packet before the review deadline to keep benefits active.",
    "Page 3 of 8 copyright scanned footer."
  ].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return makeOcrQueryEntry({
    text,
    rawText: text,
    reconstructedText: text,
    words,
    pages: [{
      pageNumber: 3,
      text,
      lines: [
        {
          id: "better-ocr-heading",
          sourceLineIds: ["better-ocr-heading"],
          pageNumber: 3,
          text: "Notice of award appeal requirements.",
          relativeY: 0.22,
          relativeYStart: 0.19,
          relativeYEnd: 0.25,
          confidence: 91
        },
        {
          id: "better-ocr-line-a",
          sourceLineIds: ["better-ocr-line-a"],
          pageNumber: 3,
          text: "Scholarship requirements include family income documents, enrollment status, and the signed eligibility form.",
          relativeY: 0.42,
          relativeYStart: 0.38,
          relativeYEnd: 0.46,
          confidence: 92
        },
        {
          id: "better-ocr-line-b",
          sourceLineIds: ["better-ocr-line-b"],
          pageNumber: 3,
          text: "Submit the scholarship packet before the review deadline to keep benefits active.",
          relativeY: 0.52,
          relativeYStart: 0.49,
          relativeYEnd: 0.55,
          confidence: 90
        },
        {
          id: "better-ocr-footer",
          sourceLineIds: ["better-ocr-footer"],
          pageNumber: 3,
          text: "Page 3 of 8 copyright scanned footer.",
          relativeY: 0.96,
          relativeYStart: 0.94,
          relativeYEnd: 0.98,
          confidence: 88
        }
      ]
    }],
    pagesRead: 3,
    numPages: 3,
    confidence: 91,
    ocrMode: "fixture-better",
    ocrQuality: "readable",
    qualityScore: 88,
    qualityMessage: "Better OCR finished. SkimRoute found readable text and built a page map.",
    ocrTextQuality: {
      corrupted: false,
      missedRegionLikely: false,
      readable: true,
      complete: true,
      words,
      readableWordRatio: 0.9,
      textCompleteness: 0.92,
      pageCoverage: 0.86,
      paragraphContinuity: 0.8,
      confidence: 91,
      score: 88
    },
    canRunBetter: false,
    ...overrides
  });
}

async function seedOcrCacheForActiveTab() {
  const tabId = await getTabIdForUrl(page.url());
  expect(tabId).toBeGreaterThan(0);
  const seeded = await serviceWorker.evaluate((id) => new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId: id },
      world: "ISOLATED",
      func: () => {
        const key = `${location.origin}${location.pathname}${location.search}`;
        const text = [
          "Notice of determination: appeal requirements.",
          "Applicants must include appeal documents, the mailing address, and the eligibility deadline before review can begin.",
          "The eligibility deadline is printed with the appeal documents and must be checked before mailing the packet.",
          "Mail the farnily appeal packet to the benefits review mailing ad- dress listed in the notice before the deadline.",
          "Representative signature instructions appear below the mailing address for authorized appeals.",
          "Page 3 of 8 copyright scanned footer."
        ].join(" ");
        const page = {
          pageNumber: 3,
          text,
          lines: [
            {
              id: "ocr-query-heading",
              sourceLineIds: ["ocr-query-heading"],
              pageNumber: 3,
              text: "Notice of determination: appeal requirements.",
              relativeY: 0.22,
              relativeYStart: 0.19,
              relativeYEnd: 0.25,
              confidence: 93
            },
            {
              id: "ocr-query-line-a",
              sourceLineIds: ["ocr-query-line-a"],
              pageNumber: 3,
              text: "Applicants must include appeal documents, the mailing address, and the eligibility deadline before review can begin.",
              relativeY: 0.40,
              relativeYStart: 0.36,
              relativeYEnd: 0.44,
              confidence: 91
            },
            {
              id: "ocr-query-line-b",
              sourceLineIds: ["ocr-query-line-b"],
              pageNumber: 3,
              text: "The eligibility deadline is printed with the appeal documents and must be checked before mailing the packet.",
              relativeY: 0.48,
              relativeYStart: 0.45,
              relativeYEnd: 0.52,
              confidence: 90
            },
            {
              id: "ocr-query-line-c",
              sourceLineIds: ["ocr-query-line-c"],
              pageNumber: 3,
                text: "Mail the farnily appeal packet to the benefits review mailing ad- dress listed in the notice before the deadline.",
              relativeY: 0.56,
              relativeYStart: 0.53,
              relativeYEnd: 0.60,
              confidence: 90
            },
            {
              id: "ocr-query-line-d",
              sourceLineIds: ["ocr-query-line-d"],
              pageNumber: 3,
              text: "Representative signature instructions appear below the mailing address for authorized appeals.",
              relativeY: 0.64,
              relativeYStart: 0.61,
              relativeYEnd: 0.68,
              confidence: 89
            },
            {
              id: "ocr-query-footer",
              sourceLineIds: ["ocr-query-footer"],
              pageNumber: 3,
              text: "Page 3 of 8 copyright scanned footer.",
              relativeY: 0.96,
              relativeYStart: 0.94,
              relativeYEnd: 0.98,
              confidence: 92
            }
          ]
        };
        const entry = {
          source: "ocr",
          text,
          rawText: text,
          reconstructedText: text,
          words: text.split(/\s+/).filter(Boolean).length,
          pages: [page],
          pagesRead: 3,
          numPages: 3,
          confidence: 91,
          updatedAt: Date.now(),
          ocrMode: "fixture",
          ocrQuality: "readable",
          qualityScore: 86,
          qualityMessage: "OCR finished. SkimRoute found readable text and built a page map.",
          ocrTextQuality: {
            corrupted: false,
            missedRegionLikely: false,
            readable: true,
            words: text.split(/\s+/).filter(Boolean).length,
            confidence: 91,
            score: 86
          }
        };
        window.__PAGEPILOT_PDF_OCR_CACHE__ = Object.create(null);
        window.__PAGEPILOT_PDF_OCR_CACHE__[key] = entry;
        sessionStorage.setItem("pagepilot.pdfRecoveryCache", JSON.stringify({ [key]: entry }));
      }
    }, () => resolve(!chrome.runtime.lastError));
  }), tabId);
  expect(seeded).toBeTruthy();
}

async function getTabIdForUrl(url) {
  return serviceWorker.evaluate((expectedUrl) => new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const expected = String(expectedUrl || "").replace(/#.*$/, "");
      const tab = (tabs || []).find((candidate) => String(candidate.url || "").replace(/#.*$/, "") === expected);
      resolve(tab && tab.id ? tab.id : 0);
    });
  }), url);
}

async function getTabUrl(tabId) {
  return serviceWorker.evaluate((id) => new Promise((resolve) => {
    chrome.tabs.get(id, (tab) => {
      resolve(tab && tab.url ? tab.url : "");
    });
  }), tabId);
}

function resetRuntimeRequests() {
  requestedRuntimeAssets.length = 0;
  requestedUrls.length = 0;
}

function runtimeRequested(name) {
  return runtimeRequestCount(name) > 0;
}

function runtimeRequestCount(name) {
  return requestedRuntimeAssets.filter((url) => url.includes(`/assets/${name}-runtime.js`)).length;
}

function startFixtureServer() {
  const routeMap = {
    "/selectable.pdf": "selectable-pdf.html",
    "/scanned.pdf": "scanned-pdf.html",
    "/scanned-query.pdf": "scanned-query-pdf.html",
    "/fixture.css": "fixture.css",
    "/chatgpt.html": "chatgpt.html",
    "/gemini.html": "gemini.html",
    "/document/d/ready/edit": "google-docs-ready.html",
    "/document/d/required/edit": "google-docs-required.html"
  };
  const instance = https.createServer({
    pfx: Buffer.from(FIXTURE_PFX_BASE64.replace(/\s+/g, ""), "base64"),
    passphrase: "skimroute"
  }, (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let relative = "";
    if (url.pathname === "/search") {
      relative = url.searchParams.get("fixture") === "ai" ? "search-ai.html" : "search-basic.html";
    } else {
      relative = routeMap[url.pathname] || "";
    }
    if (!relative && url.pathname.startsWith("/fixtures/")) {
      relative = url.pathname.replace(/^\/fixtures\//, "");
    }
    if (!relative) relative = "article.html";
    const filePath = path.join(fixturesDir, relative);
    if (!filePath.startsWith(fixturesDir) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const contentType = relative.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, {
      "content-type": `${contentType}; charset=utf-8`,
      "cache-control": "no-store"
    });
    response.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    instance.listen(0, "127.0.0.1", () => resolve(instance));
  });
}
