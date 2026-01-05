export async function loadPanel(shadow) {
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
    ...cssFiles.map((file) =>
      fetch(chrome.runtime.getURL(`src/css/${file}`)).then((r) => r.text())
    ),
  ]);
  const css = cssParts.join("\n");

  shadow.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);

  if (!document.querySelector('link[href*="Material+Symbols"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
    document.head.appendChild(link);
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  shadow.appendChild(wrap);

  return {
    button: shadow.querySelector("#floating-button"),
    widget: shadow.querySelector(".widget"),
    root: shadow,
    search: shadow.querySelector("#widget-search"),
    saveScheduleBtn: shadow.querySelector("#widget-save-schedule"),
    refresh: shadow.querySelector("#widget-refresh"),
    exportDropdown: shadow.querySelector("#widget-export"),
    exportMenu: shadow.querySelector("#widget-export-menu"),
    settingsBtn: shadow.querySelector(".settings"),
    tableBody: shadow.querySelector("tbody"),
    tableHead: shadow.querySelector("thead"),
    tabButtons: shadow.querySelectorAll(".tab-button"),
    panels: shadow.querySelectorAll(".widget-panel"),
    scheduleGrid: shadow.querySelector("#schedule-grid"),
    semesterButtons: shadow.querySelectorAll(".semester-button"),
    savedDropdown: shadow.querySelector("#schedule-saved-dropdown"),
    savedMenu: shadow.querySelector("#schedule-saved-menu"),
    footerConflicts: shadow.querySelector("#widget-conflicts"),
    saveModal: shadow.querySelector("#schedule-save-modal"),
    saveModalTitle: shadow.querySelector("#schedule-modal-title"),
    saveModalMessage: shadow.querySelector("#schedule-modal-message"),
    saveModalField: shadow.querySelector("#schedule-modal-field"),
    saveModalInput: shadow.querySelector("#schedule-modal-input"),
    saveModalCancel: shadow.querySelector(".schedule-modal-cancel"),
    saveModalConfirm: shadow.querySelector(".schedule-modal-confirm"),
  };
}
