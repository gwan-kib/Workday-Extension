export async function loadPanel(shadow) {
  const htmlUrl = chrome.runtime.getURL("src/panel.html");
  const cssUrl = chrome.runtime.getURL("src/panel.css");

  const [html, css] = await Promise.all([
    fetch(htmlUrl).then((r) => r.text()),
    fetch(cssUrl).then((r) => r.text()),
  ]);

  shadow.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);

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