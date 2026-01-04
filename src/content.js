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
import { exportCSV } from "./exporting/csv.js";
import {
  canSaveMoreSchedules,
  createScheduleSnapshot,
  getMaxScheduleCount,
  loadSavedSchedules,
  persistSavedSchedules,
  renderSavedSchedules,
} from "./panel/scheduleStorage.js";

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
      renderSchedule(ctx, STATE.filtered, STATE.view.semester);
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

    const toggleWidget = () => {
      ctx.widget.classList.toggle("is-hidden");
      ctx.button.classList.toggle(
        "is-collapsed",
        ctx.widget.classList.contains("is-hidden")
      );
    };

    let resolveScheduleModal = null;
    const closeScheduleModal = (value) => {
      if (!ctx.saveModal) return;
      ctx.saveModal.classList.add("is-hidden");
      ctx.saveModal.setAttribute("aria-hidden", "true");

      if (resolveScheduleModal) {
        resolveScheduleModal(value);
        resolveScheduleModal = null;
      }
    };

    const openScheduleModal = ({
      title,
      message,
      confirmLabel = "Save",
      showInput = true,
      showCancel = true,
    }) => {
      if (!ctx.saveModal) return Promise.resolve(null);
      ctx.saveModalTitle.textContent = title;
      ctx.saveModalMessage.textContent = message;
      ctx.saveModalConfirm.textContent = confirmLabel;
      ctx.saveModalField.classList.toggle("is-hidden", !showInput);
      ctx.saveModalCancel.classList.toggle("is-hidden", !showCancel);
      ctx.saveModalInput.value = "";
      ctx.saveModalInput.classList.remove("is-invalid");
      ctx.saveModal.classList.remove("is-hidden");
      ctx.saveModal.setAttribute("aria-hidden", "false");
      if (showInput) {
        ctx.saveModalInput.focus();
      } else {
        ctx.saveModalConfirm.focus();
      }
      return new Promise((resolve) => {
        resolveScheduleModal = resolve;
      });
    };

    if (ctx.saveModal) {
      on(ctx.saveModal, "click", (event) => {
        if (event.target === ctx.saveModal) {
          closeScheduleModal(null);
          return;
        }
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (!action) return;
        if (action === "close" || action === "cancel") {
          closeScheduleModal(null);
          return;
        }
        if (action === "confirm") {
          if (!ctx.saveModalField.classList.contains("is-hidden")) {
            const value = ctx.saveModalInput.value.trim();
            if (!value) {
              ctx.saveModalInput.classList.add("is-invalid");
              ctx.saveModalInput.focus();
              return;
            }
            closeScheduleModal(value);
            return;
          }
          closeScheduleModal(true);
        }
      });

      on(ctx.saveModalInput, "input", () => {
        ctx.saveModalInput.classList.remove("is-invalid");
      });

      on(ctx.saveModalInput, "keydown", (event) => {
        if (event.key === "Enter") {
          ctx.saveModalConfirm.click();
        }
      });

      on(document, "keydown", (event) => {
        if (
          event.key === "Escape" &&
          ctx.saveModal &&
          !ctx.saveModal.classList.contains("is-hidden")
        ) {
          closeScheduleModal(null);
        }
      });
    }

    ctx.tabButtons.forEach((btn) => {
      on(btn, "click", () => {
        setActivePanel(btn.dataset.panel);
        if (btn.dataset.panel === "schedule") updateSchedule();
      });
    });

    ctx.semesterButtons.forEach((btn) => {
      on(btn, "click", () => {
        STATE.view.semester = btn.dataset.semester;
        ctx.semesterButtons.forEach((semesterBtn) => {
          semesterBtn.classList.toggle(
            "is-active",
            semesterBtn.dataset.semester === STATE.view.semester
          );
        });
        updateSchedule();
      });
    });

    on(ctx.button, "click", toggleWidget);

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "TOGGLE_WIDGET") {
        toggleWidget();
      }
    });

    on(ctx.refresh, "click", async () => {
      STATE.courses = await extractAllCourses();
      applySearchFilter(ctx.search.value);
      sortBy(STATE.sort.key || "code");
      renderRows(ctx, STATE.filtered);
      updateSchedule();
    });

    on(ctx.exportBtn, "click", exportCSV);

    on(ctx.saveScheduleBtn, "click", async () => {
      if (!canSaveMoreSchedules(STATE.savedSchedules)) {
        await openScheduleModal({
          title: "Schedule limit reached",
          message: `You can only save up to ${getMaxScheduleCount()} schedules. Delete one to save another.`,
          confirmLabel: "Got it",
          showInput: false,
          showCancel: false,
        });
        return;
      }

      const name = await openScheduleModal({
        title: "Save schedule",
        message: "Name this schedule so you can find it later.",
        confirmLabel: "Save",
        showInput: true,
        showCancel: true,
      });
      if (!name) return;

      const snapshot = createScheduleSnapshot(name, STATE.filtered);
      STATE.savedSchedules = [snapshot, ...STATE.savedSchedules];
      await persistSavedSchedules(STATE.savedSchedules);
      renderSavedSchedules(ctx, STATE.savedSchedules);
      if (ctx.savedDropdown) ctx.savedDropdown.open = true;
    });

    on(ctx.savedMenu, "click", async (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      const card = actionButton.closest(".schedule-saved-card");
      const scheduleId = card?.dataset.id;
      if (!scheduleId) return;

      if (actionButton.dataset.action === "delete") {
        STATE.savedSchedules = STATE.savedSchedules.filter(
          (schedule) => schedule.id !== scheduleId
        );
        await persistSavedSchedules(STATE.savedSchedules);
        renderSavedSchedules(ctx, STATE.savedSchedules);
        return;
      }

      const selected = STATE.savedSchedules.find(
        (schedule) => schedule.id === scheduleId
      );
      if (!selected) return;

      STATE.courses = [...selected.courses];
      STATE.filtered = [...selected.courses];
      ctx.search.value = "";
      sortBy(STATE.sort.key || "code");
      renderRows(ctx, STATE.filtered);
      updateSchedule();
      setActivePanel("schedule");
      if (ctx.savedDropdown) ctx.savedDropdown.open = false;
    });

    on(ctx.settingsBtn, "click", () => {
      ctx.widget.classList.remove("is-hidden");
      ctx.button.classList.remove("is-collapsed");
      setActivePanel("settings");
    });

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

    STATE.savedSchedules = await loadSavedSchedules();
    renderSavedSchedules(ctx, STATE.savedSchedules);

    STATE.courses = await extractAllCourses();
    STATE.filtered = [...STATE.courses];
    sortBy("code");
    renderRows(ctx, STATE.filtered);
    updateSchedule();
    setActivePanel(STATE.view.panel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
