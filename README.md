# SkimRoute

SkimRoute is a privacy-first Chrome extension for navigating long pages, AI conversations, and PDFs without losing your place.

It maps useful sections, lets you jump to the best starting point, moves forward through important sections, and can find a local passage from a short query like "scholarship requirements" or "installation steps".

## What It Does

- Finds useful sections on articles, documentation, tutorials, research pages, recipes, discussions, AI chats, and PDFs.
- Builds a Page Map for quick navigation through the current page or document.
- Provides Jump and Next actions for moving to the best section or the next important section.
- Adds "Find the part about..." search over already-mapped local sections.
- Supports long AI conversations, including ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, and compatible chat layouts.
- Supports selectable-text PDFs and scanned/image PDFs with local OCR.
- Keeps PDF and OCR runtimes lazy-loaded so normal web pages stay lightweight.

## Privacy

SkimRoute processes page text, PDF text, OCR output, and section queries locally in the browser.

SkimRoute does not:

- Upload page content.
- Upload PDFs.
- Upload OCR results.
- Send "Find the part about..." queries to a server.
- Use remote AI services.
- Collect analytics.
- Track browsing activity.
- Require an account.

PDF extraction, OCR, Page Map generation, ranking, Jump, Next, and local query matching run inside the browser.

## PDF Support

SkimRoute can read selectable-text PDFs locally and build page-aware navigation.

For scanned or image-based PDFs, SkimRoute can run browser-based OCR. OCR accuracy depends on scan quality, resolution, layout, handwriting, and clarity.

When Chrome's built-in PDF viewer does not expose reliable page or text geometry, SkimRoute can use its controlled PDF Mode. PDF Mode renders the document in a SkimRoute-owned viewer so section navigation, highlighting, and local passage search can be verified more honestly.

Some PDFs may still be limited, including encrypted, password-protected, corrupted, very large, very low-resolution, handwritten, or unusually structured files.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| Alt+J on Windows/Linux | Jump to the best useful section |
| Option+J on macOS | Jump to the best useful section |
| Alt+N on Windows/Linux | Jump to the next important section |
| Option+N on macOS | Jump to the next important section |

Chrome lets users review or change extension shortcuts at:

```text
chrome://extensions/shortcuts
```

## Permissions

SkimRoute uses Chrome extension permissions for local page navigation:

- `activeTab`: lets the popup communicate with the current tab when the user opens SkimRoute.
- `scripting`: lets the popup initialize or restore SkimRoute on supported tabs when the content script is not ready yet.
- `storage`: stores lightweight local interface state such as minimized mode, onboarding, temporary snoozes, and PDF Mode state.
- `tabs`: lets the popup identify and message the active tab.
- `http://*/*` and `https://*/*`: lets SkimRoute map and navigate supported web pages and browser-based chat apps.
- `file:///*`: supports local PDF files when the user explicitly enables "Allow access to file URLs" in Chrome.

Stored state remains local to the browser.

## Install Locally

1. Install Node.js 22.13.0 or newer, or Node.js 24+.
2. Install dependencies:

```bash
npm ci
```

3. Build generated extension assets:

```bash
npm run build
```

4. Open Chrome and visit:

```text
chrome://extensions
```

5. Enable Developer mode.
6. Click "Load unpacked".
7. Select this project folder, the folder containing `manifest.json`.

## Local PDF Files

To use SkimRoute with PDFs stored on your computer:

1. Open `chrome://extensions`.
2. Find SkimRoute.
3. Open Details.
4. Enable "Allow access to file URLs".
5. Reopen the local PDF.

## Limitations

SkimRoute depends on the structure and accessibility of the current page or PDF.

Navigation may be less precise on:

- Pages with heavily customized scrolling.
- Rapidly changing web applications.
- Content rendered inside inaccessible frames.
- Encrypted, corrupted, or extremely large PDFs.
- Low-resolution or handwritten scans.
- Unusual multi-column PDF layouts.
- Pages that frequently replace their own content.

When SkimRoute cannot confirm exact passage navigation, it preserves the result and reports the limitation instead of claiming unverified success.
