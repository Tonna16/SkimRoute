# PagePilot

Navigate long web pages, AI chats, and PDFs. PagePilot finds the useful parts and stays out of the way.

PagePilot is a local-only Chrome MV3 extension: no signup, no backend, no analytics, and no remote AI calls. It adds a lightweight navigation layer for articles, docs, tutorials, research pages, recipes, discussions, long AI conversations, and PDFs.

## What It Does

* Finds a useful starting point only when confidence is strong enough.
* Stays quiet on dashboards, admin panels, search results, product pages, short pages, and low-structure pages.
* Creates structure for long AI chats on ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, GitHub Copilot web, and generic browser chat surfaces.
* Detects assistant/user turns, final answers, revised answers, summaries, topic changes, and substantial code blocks locally.
* Provides a nested Page Map with collapsible subsections and current-section tracking.
* Supports **Alt+J / Option+J** for the best useful jump and **Alt+N / Option+N** for the next important section.
* Supports PDFs with selectable text by extracting page text locally and mapping important sections by page.
* Supports scanned/image-based PDFs with an OCR fallback when selectable text is not available.
* Provides a PagePilot PDF Mode for more reliable PDF section navigation, scrolling, and highlighting.
* Highlights the current important section when jumping through PDF sections, page-map entries, or keyboard shortcuts.
* Uses a small edge tab when minimized or quiet so PagePilot can be dismissed without feeling lost.

## PDF Support

PagePilot can analyze PDFs locally and find important sections across the document.

For PDFs with selectable text, PagePilot extracts the text using local PDF parsing and creates page-aware sections.

For scanned or image-based PDFs, PagePilot can use local OCR fallback to recover readable text when possible.

Because Chrome’s built-in PDF viewer does not always expose real page elements to extensions, PagePilot includes a controlled PDF Mode. This mode renders the PDF in a PagePilot-owned viewer so section navigation, smooth scrolling, and highlighting are more reliable.

PDF support includes:

* Local PDF text extraction
* OCR fallback for scanned PDFs
* Page-aware important sections
* PDF Page Map support
* Best-section and next-section navigation
* Current-section highlighting
* Controlled PDF Mode for reliable scrolling/highlighting

Some PDFs may still be limited, such as encrypted, password-protected, corrupted, extremely large, or low-quality scanned PDFs.

## Install Locally

1. Open Chrome and visit `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the local folder that contains `manifest.json`.
5. Open a long web page, AI conversation, article, or PDF.

If testing local PDF files from your computer, enable file access:

1. Go to `chrome://extensions`.
2. Open PagePilot’s **Details** page.
3. Turn on **Allow access to file URLs**.

## Keyboard Shortcuts

* **Alt+J / Option+J**: Jump to the most useful section.
* **Alt+N / Option+N**: Jump to the next important section.

On PDFs, these shortcuts open or reuse PagePilot PDF Mode when needed, scroll to the selected important section, and highlight the current target.


## Privacy

PagePilot analyzes page structure locally in the content script. Page content is never sent to a server.

PDF text extraction and OCR fallback also run locally in the browser. PagePilot does not upload PDFs, page text, or OCR results to any backend.

## Permissions

* **activeTab**: lets the popup talk to the current tab.
* **scripting**: lets the popup recover PagePilot on tabs where the automatic content script has not finished loading.
* **storage**: remembers lightweight local UI state, such as first-use tips, minimized state, PDF mode state, and temporary per-page snooze state.

Stored page state is local to the browser and expires for snoozed pages. PagePilot does not collect analytics or transmit browsing data.
