// src/mainPanel/loadMainPanel.js
import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("loadMainPanel");

export async function loadMainPanel(shadowRoot) {
  const htmlUrl = chrome.runtime.getURL("src/panel.html");

  const cssFiles = [
    "formatting/general.css",
    "formatting/widget-shell.css",
    "formatting/widget-buttons.css",
    "formatting/floating-button.css",
    "formatting/course-list.css",
    "formatting/schedule-view.css",
    "formatting/schedule-view-events.css",
    "formatting/settings.css",
    
    "colors/course-list-colors.css",
    "colors/general-colors.css",
    "colors/schedule-view-colors.css",
    "colors/widget-functionality-colors.css",
    "colors/settings-colors.css",
  ];

  const [html, ...cssParts] = await Promise.all([
    fetch(htmlUrl).then((r) => r.text()),
    ...cssFiles.map((file) => fetch(chrome.runtime.getURL(`src/css/${file}`)).then((r) => r.text())),
  ]);

  const css = cssParts.join("\n");

  shadowRoot.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = css;
  shadowRoot.appendChild(style);

  // Material Symbols font (only once on the page)
  if (!document.querySelector('link[href*="Material+Symbols"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
    document.head.appendChild(link);
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  shadowRoot.appendChild(wrap);

  const ui = {
    // Whole extension UI (this used to be ctx.widget)
    mainPanel: shadowRoot.querySelector(".widget"),

    // Core roots
    root: shadowRoot,
    floatingButton: shadowRoot.querySelector("#floating-button"),

    // Course table
    tableBody: shadowRoot.querySelector("tbody"),
    tableHead: shadowRoot.querySelector("thead"),

    // Search + controls
    searchInput: shadowRoot.querySelector("#widget-search"),
    refreshButton: shadowRoot.querySelector("#widget-refresh"),
    saveScheduleButton: shadowRoot.querySelector("#widget-save-schedule"),

    // Export dropdown
    exportDropdown: shadowRoot.querySelector("#widget-export"),
    exportButton: shadowRoot.querySelector("#widget-export-button"),
    exportMenu: shadowRoot.querySelector("#widget-export-menu"),

    // Tabs / views
    viewTabs: shadowRoot.querySelectorAll(".tab-button"),
    views: shadowRoot.querySelectorAll(".widget-panel"),

    // Schedule view
    scheduleGrid: shadowRoot.querySelector("#schedule-grid"),
    semesterButtons: shadowRoot.querySelectorAll(".semester-button"),
    footerConflicts: shadowRoot.querySelector("#widget-conflicts"),

    // Saved schedules dropdown
    savedDropdown: shadowRoot.querySelector("#schedule-saved-dropdown"),
    savedMenu: shadowRoot.querySelector("#schedule-saved-menu"),

    // Modal
    saveModal: shadowRoot.querySelector("#schedule-save-modal"),
    saveModalTitle: shadowRoot.querySelector("#schedule-modal-title"),
    saveModalMessage: shadowRoot.querySelector("#schedule-modal-message"),
    saveModalField: shadowRoot.querySelector("#schedule-modal-field"),
    saveModalInput: shadowRoot.querySelector("#schedule-modal-input"),
    saveModalCancel: shadowRoot.querySelector(".schedule-modal-cancel"),
    saveModalConfirm: shadowRoot.querySelector(".schedule-modal-confirm"),

    // Shortcuts
    helpButton: shadowRoot.querySelector(".help"),
    settingsButton: shadowRoot.querySelector(".settings"),
  };

  debug.log({ id: "loadMainPanel.ui" }, "Loaded mainPanel UI refs", {
    hasMainPanel: !!ui.mainPanel,
    hasFloatingButton: !!ui.floatingButton,
    hasTable: !!ui.tableBody && !!ui.tableHead,
  });

  return ui;
}
