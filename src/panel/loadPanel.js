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

    "colors/course-list-colors.css",
    "colors/general-colors.css",
    "colors/schedule-view-colors.css",
    "colors/widget-functionality-colors.css"
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
    search: shadow.querySelector("#widget-search"),
    refresh: shadow.querySelector("#widget-refresh"),
    exportBtn: shadow.querySelector("#widget-export"),
    tableBody: shadow.querySelector("tbody"),
    tableHead: shadow.querySelector("thead"),
    tabButtons: shadow.querySelectorAll(".tab-button"),
    panels: shadow.querySelectorAll(".widget-panel"),
    scheduleGrid: shadow.querySelector("#schedule-grid"),
    termButtons: shadow.querySelectorAll(".term-button"),
  };
}