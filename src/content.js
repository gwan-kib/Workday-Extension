import { on, debounce } from "./utilities/dom.js";
import { STATE } from "./core/state.js";
import { ensureMount } from "./utilities/shadowMount.js";
import { loadPanel } from "./panel/loadPanel.js";
import { extractAllCourses } from "./extraction/courseExtraction.js";
import {
  applySearchFilter,
  sortBy,
  wireSorting,
} from "./panel/panelInteractions.js";
import { renderRows } from "./panel/renderRows.js";
import { renderSchedule } from "./panel/scheduleView.js";
import { exportCSV } from "./exporting/cvs.js";

(() => {
  console.log("[WD] content script loaded");
  async function boot() {
    const shadow = ensureMount();
    const ctx = await loadPanel(shadow);
    ctx.button.classList.toggle(
      "is-collapsed",
      ctx.widget.classList.contains("is-hidden")
    );
    const updateSchedule = () => {
      renderSchedule(ctx, STATE.filtered, STATE.view.term);
    };

    const setActivePanel = (panel) => {
      STATE.view.panel = panel;
      ctx.panels.forEach((el) => {
        el.classList.toggle("is-active", el.dataset.panel === panel);
      });
      ctx.tabButtons.forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.panel === panel);
      });
      ctx.widget.classList.toggle("is-schedule-view", panel === "schedule");
    };

    ctx.tabButtons.forEach((btn) => {
      on(btn, "click", () => {
        setActivePanel(btn.dataset.panel);
        if (btn.dataset.panel === "schedule") updateSchedule();
      });
    });

    ctx.termButtons.forEach((btn) => {
      on(btn, "click", () => {
        STATE.view.term = btn.dataset.term;
        ctx.termButtons.forEach((termBtn) => {
          termBtn.classList.toggle(
            "is-active",
            termBtn.dataset.term === STATE.view.term
          );
        });
        updateSchedule();
      });
    });

    on(ctx.button, "click", () => {
      ctx.widget.classList.toggle("is-hidden");
      ctx.button.classList.toggle("is-collapsed", ctx.widget.classList.contains("is-hidden"));
    });

    on(ctx.refresh, "click", async () => {
      STATE.courses = await extractAllCourses();
      applySearchFilter(ctx.search.value);
      sortBy(STATE.sort.key || "code");
      renderRows(ctx, STATE.filtered);
      updateSchedule();
    });

    on(ctx.exportBtn, "click", exportCSV);

    on(
      ctx.search,
      "input",
      debounce(() => {
        applySearchFilter(ctx.search.value);
        sortBy(STATE.sort.key || "code");
        renderRows(ctx, STATE.filtered);
        updateSchedule();
      }, 100)
    );

    wireSorting(ctx);

    STATE.courses = await extractAllCourses();
    STATE.filtered = [...STATE.courses];
    sortBy("code");
    renderRows(ctx, STATE.filtered);
    updateSchedule();
    setActivePanel(STATE.view.panel);
  }

  if (document.readyState === "complete") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
