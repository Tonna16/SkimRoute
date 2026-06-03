(function(){(function(){if(window.PagePilotUI)return;const w="pagepilot-root";function N(t){const e=t.callbacks||{},o=t.helpers;let a=null,p=null,d=null,y=null;function X(){if(document.getElementById(w)){a=document.getElementById(w),p=a.querySelector(".pp-sidebar"),d=a.querySelector(".pp-edge-tab");return}a=document.createElement("div"),a.id=w,a.innerHTML=D(),document.documentElement.appendChild(a),p=a.querySelector(".pp-sidebar"),d=a.querySelector(".pp-edge-tab"),et()}function tt(n,i){if(!a||!n)return;const s=i.mode||"minimized",l=n.pageProfile||{},r=l.state==="loading",u=!r&&!!l.quietMode,g=s==="open"?"open":s==="snoozed"?"snoozed":u?"quiet":"minimized",m=x(n,n.bestSectionId),$=x(n,n.nextImportantId),v=n.sections.length,M=n.importantSections.length,h=l.type==="pdf"&&l.state==="ocr-prompt",f=!!(m&&n.hasStrongTarget&&!u&&!r),L=!!($&&!u&&!r),q=!!(l.type==="pdf"&&!r&&(h||l.state!=="pdf-error"&&!u&&!f&&!v));a.dataset.mode=r?"loading":g,a.classList.toggle("pp-open",g==="open"),a.classList.toggle("pp-minimized",g==="minimized"),a.classList.toggle("pp-snoozed",g==="snoozed"),a.classList.toggle("pp-quiet",g==="quiet"),a.classList.toggle("pp-quiet-page",u),a.classList.toggle("pp-loading-page",r),a.classList.toggle("pp-show-tip",!!(i.showOnboarding&&g==="open")),d.setAttribute("aria-expanded",String(g==="open")),d.setAttribute("aria-label",U(n,g)),c(".pp-tab-title",_(n,g)),c(".pp-tab-meta",Y(n,g)),c(".pp-brand-subtitle",r?"Scanning…":h?"PDF needs OCR":u?"Quiet here":"Navigation layer"),c(".pp-kicker",r?`${l.label||"Page"} • scanning`:h?`${l.label||"PDF"} • OCR needed`:u?`${l.label||"Page"} • quiet`:`${l.label||"Page"} guide`),c(".pp-hero-title",r?"Reading page structure…":h?"This PDF appears scanned.":H(n,m,u)),c(".pp-summary-line",r?"PagePilot is still looking for a stable structure.":h?"Run OCR to read the text layer and build a useful map.":B(n,m,u)),c(".pp-meter-value",r?"…":`${E()}%`),c("[data-pp-stat='time']",r?"Scanning":h?"OCR needed":G(n)),c("[data-pp-stat='sections']",r?"Scanning":h?"OCR":u?"Quiet":String(v)),c("[data-pp-stat='important']",r||h?"…":u?"Low":String(M)),c(".pp-important-count",r?"…":String(M)),c(".pp-section-count",r?"…":String(v));const T=a.querySelector(".pp-start-card");T.dataset.sectionId=f?m.id:"",T.disabled=r||!f,T.setAttribute("aria-disabled",String(r||!f)),c(".pp-start-label",r?"Scanning":J(n,f)),c(".pp-start-title",r?"Reading page structure…":f?m.title:F(n)),c(".pp-start-reason",r?"PagePilot will show the best jump once the page settles.":f?S(m):j(n));const A=a.querySelector(".pp-skip"),I=a.querySelector(".pp-next"),C=a.querySelector(".pp-pdf-ocr");A.disabled=r||!f,I.disabled=r||!L,C.hidden=!q,C.disabled=r||!q,A.setAttribute("aria-disabled",String(r||!f)),I.setAttribute("aria-disabled",String(r||!L)),C.setAttribute("aria-disabled",String(r||!q)),c(".pp-next-label",r?"Scanning":L?"Next important":"No next jump"),a.querySelector(".pp-overview").classList.toggle("pp-low-signal",r||u||!n.hasStrongTarget),a.querySelector(".pp-important-panel").hidden=r||u||!M,a.querySelector(".pp-jump-panel").hidden=u||!r&&!v,ot(n),pt(n),z(i.activeId);const ct=a.querySelector(".pp-live");ct.textContent=r?"PagePilot is still scanning this page.":Q(n,u)}function et(){d.addEventListener("click",()=>e.onOpen&&e.onOpen()),a.querySelector(".pp-minimize").addEventListener("click",()=>e.onMinimize&&e.onMinimize()),a.querySelector(".pp-snooze").addEventListener("click",()=>e.onSnooze&&e.onSnooze()),a.querySelector(".pp-skip").addEventListener("click",()=>e.onJump&&e.onJump()),a.querySelector(".pp-next").addEventListener("click",()=>e.onNext&&e.onNext()),a.querySelector(".pp-pdf-ocr").addEventListener("click",()=>e.onRunPdfOcr&&e.onRunPdfOcr()),a.querySelector(".pp-tip-dismiss").addEventListener("click",()=>e.onDismissTip&&e.onDismissTip()),a.addEventListener("click",n=>{const i=n.target.closest("[data-toggle-section]");if(i){n.preventDefault(),n.stopPropagation(),e.onToggleCollapse&&e.onToggleCollapse(i.dataset.toggleSection);return}const s=n.target.closest("[data-section-id]");s&&s.dataset.sectionId&&e.onSection&&e.onSection(s.dataset.sectionId,{highlight:!0})}),a.addEventListener("keydown",n=>{if(n.key==="Escape"){n.preventDefault(),e.onMinimize&&e.onMinimize();return}if(!["ArrowDown","ArrowUp","Home","End"].includes(n.key))return;const i=n.target.closest&&n.target.closest(".pp-section-item, .pp-collapse-toggle, .pp-start-card, .pp-skip, .pp-next, .pp-pdf-ocr");if(!i)return;const s=st(),l=s.indexOf(i);if(l===-1)return;n.preventDefault();const r=n.key==="Home"?0:n.key==="End"?s.length-1:n.key==="ArrowDown"?Math.min(s.length-1,l+1):Math.max(0,l-1);s[r].focus()})}function nt(){p&&(y=document.activeElement&&document.activeElement!==document.body?document.activeElement:y,p.focus({preventScroll:!0}))}function at(){d?d.focus({preventScroll:!0}):y&&y.focus&&y.focus({preventScroll:!0})}function z(n){a&&a.querySelectorAll("[data-section-id]").forEach(i=>{i.classList.toggle("pp-active",!!(n&&i.dataset.sectionId===n)),i.classList.contains("pp-active")?i.setAttribute("aria-current","true"):i.removeAttribute("aria-current")})}function it(n){if(!a||!n)return;const i=E();a.style.setProperty("--pp-progress",`${i}%`),c(".pp-meter-value",`${i}%`);const s=Math.max(0,1-i/100),l=Math.ceil(n.totalReadableWords*s),r=Math.max(1,Math.ceil(l/235));c("[data-pp-stat='time']",i>=99?"Done":`${r}m`)}function rt(){a&&a.remove(),a=null,p=null,d=null}function st(){return Array.from(a.querySelectorAll(".pp-start-card:not(:disabled), .pp-skip:not(:disabled), .pp-next:not(:disabled), .pp-pdf-ocr:not(:disabled), .pp-collapse-toggle, .pp-section-item")).filter(n=>!n.closest("[hidden]")&&n.offsetParent!==null)}function c(n,i){const s=a.querySelector(n);s&&(s.textContent=i)}function ot(n){const i=a.querySelector(".pp-important-list");if(!n.importantSections.length){i.innerHTML=k("No clear standout",n.pageProfile.reason||"PagePilot is staying quiet here.");return}i.innerHTML=n.importantSections.map(s=>O(s,{showReason:!0,showTree:!1})).join("")}function pt(n){const i=a.querySelector(".pp-jump-list"),s=lt(n.sections);if(!s.length){n.pageProfile&&n.pageProfile.state==="loading"?i.innerHTML=k("Scanning","PagePilot is still reading the page structure."):i.innerHTML=k("Nothing to organize","Try PagePilot on a longer page or conversation.");return}i.innerHTML=s.map(l=>O(l,{showReason:!1,showTree:!0})).join("")}function lt(n){const i=new Set;return n.filter(s=>s.parentId&&i.has(s.parentId)?(i.add(s.id),!1):(s.isCollapsed&&i.add(s.id),!0))}function O(n,i){const s=Math.max(0,Z(n)),l=n.childIds&&n.childIds.length>0,r=n.label?`<span class="pp-badge">${b(n.label)}</span>`:"",u=i.showReason?`<span class="pp-reason">${b(S(n))}</span>`:"",g=i.showReason?"":`<span class="pp-preview">${b(W(n))}</span>`,m=n.isImportant?" pp-item-important":"",$=i.showTree?l?`<button class="pp-collapse-toggle" type="button" data-toggle-section="${b(n.id)}" aria-label="${b(n.isCollapsed?"Expand section":"Collapse section")}" aria-expanded="${String(!n.isCollapsed)}">${P(n.isCollapsed?"chevronRight":"chevronDown")}</button>`:'<span class="pp-collapse-spacer" aria-hidden="true"></span>':"",v=`
        <button class="pp-section-item${m}" type="button" data-section-id="${b(n.id)}">
          <span class="pp-item-main">
            <span class="pp-item-title">${b(n.title)}</span>
            ${u}
            ${g}
          </span>
          ${r}
        </button>
      `;return i.showTree?`
        <div class="pp-section-row" role="listitem" style="--pp-depth:${s}">
          ${$}
          ${v}
        </div>
      `:v}function b(n){return o.escapeHtml(n)}return{mount:X,render:tt,updateActiveClasses:z,updateProgress:it,focusPanel:nt,focusTab:at,destroy:rt,getRoot(){return a}}}function D(){return`
      <button class="pp-edge-tab" type="button" aria-label="Open PagePilot" aria-expanded="false">
        <span class="pp-tab-mark" aria-hidden="true"></span>
        <span class="pp-tab-copy">
          <span class="pp-tab-title">PagePilot</span>
          <span class="pp-tab-meta">Ready</span>
        </span>
      </button>

      <aside class="pp-sidebar" aria-label="PagePilot navigation layer" tabindex="-1">
        <div class="pp-topbar">
          <div class="pp-brand">
            <span class="pp-brand-mark" aria-hidden="true"></span>
            <div>
              <div class="pp-brand-title">PagePilot</div>
              <div class="pp-brand-subtitle">Navigation layer</div>
            </div>
          </div>
          <div class="pp-window-actions">
            <button class="pp-icon-button pp-minimize" type="button" aria-label="Minimize PagePilot" title="Minimize">
              ${P("minus")}
            </button>
            <button class="pp-icon-button pp-snooze" type="button" aria-label="Snooze PagePilot on this page" title="Snooze on this page">
              ${P("moon")}
            </button>
          </div>
        </div>

        <div class="pp-scroll">
          <section class="pp-overview" aria-label="Page overview">
            <div class="pp-meter" aria-hidden="true">
              <div class="pp-meter-value">0%</div>
            </div>
            <div class="pp-overview-copy">
              <div class="pp-kicker">Page guide</div>
              <h2 class="pp-hero-title">Find the useful part.</h2>
              <p class="pp-summary-line">PagePilot is reading the structure of this page.</p>
            </div>

            <button class="pp-start-card" type="button" data-section-id="">
              <span class="pp-start-label">Best place to start</span>
              <strong class="pp-start-title">Finding the strongest section...</strong>
              <span class="pp-start-reason">Ranking this page locally.</span>
            </button>

            <div class="pp-stats" aria-label="Page stats">
              <div>
                <strong data-pp-stat="time">--</strong>
                <span>left</span>
              </div>
              <div>
                <strong data-pp-stat="sections">0</strong>
                <span>sections</span>
              </div>
              <div>
                <strong data-pp-stat="important">0</strong>
                <span>useful</span>
              </div>
            </div>

            <div class="pp-actions">
              <button class="pp-skip" type="button" title="Jump to useful part (Alt+J / Option+J)">
                ${P("arrowDown")}
                <span>Jump to useful part</span>
              </button>
              <button class="pp-next" type="button" title="Next important section (Alt+N / Option+N)">
                ${P("arrowDown")}
                <span class="pp-next-label">Next important</span>
              </button>
              <button class="pp-pdf-ocr" type="button" hidden title="Run OCR for scanned PDFs">
                ${P("chevronDown")}
                <span>Run OCR</span>
              </button>
            </div>
          </section>

          <section class="pp-list-panel pp-important-panel">
            <div class="pp-section-heading">
              <h2>Best Path</h2>
              <span class="pp-count pp-important-count">0</span>
            </div>
            <div class="pp-important-list" role="list"></div>
          </section>

          <section class="pp-list-panel pp-jump-panel">
            <div class="pp-section-heading">
              <h2>Page Map</h2>
              <span class="pp-count pp-section-count">0</span>
            </div>
            <div class="pp-jump-list" role="list"></div>
          </section>
        </div>

        <div class="pp-onboarding" role="status" aria-live="polite">
          <strong>Start with the useful part</strong>
          <span>Use Alt+J / Option+J to jump. Use Alt+N / Option+N for the next important section. Minimize anytime; the tab stays on the edge.</span>
          <button class="pp-tip-dismiss" type="button">Got it</button>
        </div>

        <div class="pp-live" aria-live="polite" aria-atomic="true"></div>
      </aside>
    `}function H(t,e,o){return o?"Staying quiet here.":!t.hasStrongTarget||!e?t.confidenceTier==="low"?"No clear standout yet.":"Find the useful part.":t.savedMinutes>=2?`Skip ${t.savedMinutes} minutes of scrolling.`:t.pageProfile.type==="chat"?e.unitMeta&&e.unitMeta.hasRevision?"Jump to the corrected answer.":e.metrics.matched.finalCode?"Jump to the final code.":e.metrics.matched.summary?"Jump to the summary.":"Jump to the latest answer.":e.metrics.matched.summary?"Jump to the summary.":e.metrics.matched.completeCode?"Find the complete code.":e.metrics.matched.conciseAnswer||e.metrics.matched.answer?"Jump straight to the answer.":t.pageProfile.type==="docs"&&(e.metrics.codeBlocks>0||e.metrics.matched.example)?"Find the working example.":t.pageProfile.type==="recipe"?"Skip to the steps.":"Jump to the useful part."}function B(t,e,o){if(o)return t.pageProfile.reason||"Not much to organize on this page.";if(!e||!t.hasStrongTarget)return t.confidenceTier==="low"?"PagePilot found structure, but no section clearly wins.":"No clear standout section found.";const a=t.importantSections.length||1,p=`${a} useful ${a===1?"section":"sections"}`,d=t.savedMinutes>=1?` About ${t.savedMinutes}m saved.`:"";return`${t.confidenceLabel}. ${p}.${d}`}function J(t,e){return t.pageProfile&&t.pageProfile.state==="loading"?"Scanning":e?`${t.bestLabel} • ${t.confidenceLabel}`:"No clear standout"}function F(t){return t.pageProfile&&t.pageProfile.state==="loading"?"Reading page structure…":t.pageProfile.quietMode?"Not much to organize here":t.confidenceTier==="low"?"No clear best section":"No strong jump target yet"}function j(t){return t.pageProfile&&t.pageProfile.state==="loading"?"PagePilot is still reading the page.":t.pageProfile.quietMode?t.pageProfile.reason||"PagePilot will stay out of the way.":t.confidenceTier==="low"?"The page has structure, but nothing stands out enough to recommend.":"Use the page map, or rescan after more content loads."}function U(t,e){return t.pageProfile&&t.pageProfile.state==="loading"?"Open PagePilot, scanning this page":e==="snoozed"?"Open PagePilot, snoozed on this page":e==="quiet"?"Open PagePilot, quiet on this page":t.hasStrongTarget?`Open PagePilot, ${t.bestLabel}`:"Open PagePilot"}function _(t,e){return t.pageProfile&&t.pageProfile.state==="loading"?"Scanning":e==="snoozed"?"Snoozed":e==="quiet"?"Quiet":t.hasStrongTarget?"Ready":"PagePilot"}function Y(t,e){return t.pageProfile&&t.pageProfile.state==="loading"?"Scanning page structure":e==="snoozed"?"Click to reopen":e==="quiet"?t.pageProfile.quietReason||t.pageProfile.reason||"Staying out of the way":t.hasStrongTarget?t.bestLabel:`${t.sections.length} sections`}function G(t){return t.pageProfile&&t.pageProfile.state==="loading"?"Scanning":t.pageProfile.quietMode?"--":`${Math.max(1,t.readingMinutes||1)}m`}function Q(t,e){return t.pageProfile&&t.pageProfile.state==="loading"?"PagePilot is still scanning this page.":e?t.pageProfile.reason||"PagePilot is quiet on this page.":t.hasStrongTarget?`${t.bestLabel}: ${x(t,t.bestSectionId).title}`:"No clear standout section found."}function S(t){return!t||!t.metrics?"Useful section":t.metrics.matched.finalCode?"Last substantial code block in the conversation":t.unitMeta&&t.unitMeta.hasRevision&&t.unitMeta.isLatestAssistant?"Looks like the latest corrected answer":t.metrics.matched.completeCode?"Looks like complete, usable code":t.metrics.matched.conciseAnswer?"Opens with a concise answer":t.metrics.matched.summary?"Summarizes the useful parts":t.metrics.matched.acceptedAnswer?"Looks like the confirmed answer":t.metrics.matched.procedure?"Contains step-by-step guidance":t.metrics.matched.directAction?"Gives direct next actions":t.metrics.matched.troubleshooting?"Points to a fix":t.metrics.matched.recommendation?"Uses recommendation language":t.metrics.matched.answer?"Has a direct answer signal":t.metrics.matched.action?"Looks actionable":t.metrics.matched.codeExplanation?"Explains a working code example":t.metrics.codeBlocks>0?"Includes a practical example":t.metrics.tables>0?"Summarizes details in a table":t.metrics.matched.comparison?"Compares options clearly":t.metrics.matched.example?"Shows an example or comparison":t.metrics.matched.warning?"Flags a caveat":t.metrics.listItems>=3?"Structured for quick scanning":t.metrics.hasNumbers?"Contains concrete details":`${t.wordCount} focused words`}function W(t){const o=String(t.text||"").replace(t.title,"").trim()||S(t);return o.length>126?`${o.slice(0,123).trim()}...`:o}function Z(t){let e=0,o=t;const a=window.__PAGEPILOT_CURRENT_SECTIONS__||[];for(;o&&o.parentId&&e<5;)e+=1,o=a.find(p=>p.id===o.parentId);return e}function x(t,e){return t.sections.find(o=>o.id===e)||null}function k(t,e){return`
      <div class="pp-empty">
        <strong>${R(t)}</strong>
        <span>${R(e)}</span>
      </div>
    `}function E(){const t=K(document.body),e=t&&t!==document.body&&t!==document.documentElement?t:null,o=e?e.scrollTop:window.scrollY,a=e?e.clientHeight:window.innerHeight,p=e?e.scrollHeight:document.documentElement.scrollHeight,d=Math.max(1,p-a);return Math.max(0,Math.min(100,Math.round(o/d*100)))}function K(t){let e=t&&t.parentElement?t.parentElement:null;for(;e&&e!==document.body&&e!==document.documentElement;){try{const a=window.getComputedStyle(e),p=a.overflowY||a.overflow;if(/(auto|scroll|overlay)/i.test(p)&&e.scrollHeight>e.clientHeight+24)return e}catch{}e=e.parentElement}const o=document.querySelectorAll(["main","article","[role='main']","[data-message-author-role]","[data-testid*='conversation']","[data-testid*='chat-message']","[class*='conversation' i]","[class*='chat' i]",".textLayer","[data-page-number]"].join(", "));for(const a of o)try{const p=V(a);if(p&&p!==document.body&&p!==document.documentElement)return p}catch{}return document.scrollingElement||document.documentElement||document.body}function V(t){let e=t;for(;e&&e!==document.body&&e!==document.documentElement;){try{const o=window.getComputedStyle(e),a=o.overflowY||o.overflow;if(/(auto|scroll|overlay)/i.test(a)&&e.scrollHeight>e.clientHeight+24)return e}catch{}e=e.parentElement}return null}function R(t){return String(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function P(t){return`<svg class="pp-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${{minus:"<path d='M5 12h14'/>",moon:"<path d='M20 15.2A8 8 0 0 1 8.8 4 7 7 0 1 0 20 15.2Z'/>",arrowDown:"<path d='M12 5v14'/><path d='m19 12-7 7-7-7'/>",chevronRight:"<path d='m9 18 6-6-6-6'/>",chevronDown:"<path d='m6 9 6 6 6-6'/>"}[t]||""}</svg>`}window.PagePilotUI={createUI:N}})();
})()
