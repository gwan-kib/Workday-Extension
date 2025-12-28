import { on, debounce } from "./utilities/dom.js"
import { STATE } from "./core/state.js"
import { ensureMount } from "./utilities/shadowMount.js"
import { loadPanel } from "./panel/loadPanel.js"
import { extractAllCourses } from "./extraction/courseExtraction.js"
import { applySearchFilter, sortBy, wireSorting } from "./panel/panelInteractions.js"
import { renderRows } from "./panel/renderRows.js"
import { exportCSV } from "./exporting/cvs.js"

(() => {
  console.log("[WD] content script loaded");
  async function boot() {
    const shadow = ensureMount();
    const ctx = await loadPanel(shadow);

    on(ctx.button, "click", () => {
      ctx.widget.classList.toggle("is-hidden");
    });

    on(ctx.refresh, "click", async () => {
      STATE.courses = await extractAllCourses();
      applySearchFilter(ctx.search.value);
      sortBy(STATE.sort.key || "code");
      renderRows(ctx, STATE.filtered);
    });

    on(ctx.exportBtn, "click", exportCSV);

    on(
      ctx.search,
      "input",
      debounce(() => {
        applySearchFilter(ctx.search.value);
        sortBy(STATE.sort.key || "code");
        renderRows(ctx, STATE.filtered);
      }, 100)
    );

    wireSorting(ctx);

    STATE.courses = await extractAllCourses();
    STATE.filtered = [...STATE.courses];
    sortBy("code");
    renderRows(ctx, STATE.filtered);
  }

  if (document.readyState === "complete") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();