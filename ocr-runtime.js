(function () {
  "use strict";

  if (window.PagePilotOcrRuntime && window.PagePilotOcrRuntime.ready) {
    return;
  }

  window.PagePilotOcrRuntime = {
    ready: true,
    initializedAt: Date.now(),
    source: "ocr-runtime-marker"
  };
  window.__PAGEPILOT_OCR_RUNTIME_READY__ = true;
})();
