import { debugFor } from "../utilities/debugTool.js";
const debug = debugFor("renderRows");

export const escHTML = (s) => {
  const result = String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  debug.log("Escaped HTML:", { input: s, output: result });
  return result;
};

function cleanLines(text) {
  const cleaned = String(text || "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, " ") // kill nbsp/zero-width
    .replace(/[ \t]+\n/g, "\n") // trailing spaces before newline
    .replace(/\n[ \t]+/g, "\n") // leading spaces after newline
    .replace(/\n{2,}/g, "\n") // collapse multiple newlines
    .trim();
  debug.log("Cleaned text lines:", { input: text, output: cleaned });
  return cleaned;
}

export function renderRows(ctx, rows) {
  debug.log("Rendering rows:", rows);
  ctx.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  rows.forEach((c) => {
    const tr = document.createElement("tr");

    const badge = c.isLab ? "[Laboratory]" : c.isSeminar ? "[Seminar]" : c.isDiscussion ? "[Discussion]" : "";

    tr.innerHTML = `
      <td class="title">
        <div class="title-main">${c.title || ""}</div>
        ${badge ? `<div class="muted">${badge}</div>` : ""}
      </td>
      <td class="code">${c.code || ""}</td>
      <td class="sect">${(c.section_number || "").trim()}</td>
      <td class="instructor">${c.instructor || ""}</td>
      <td class="meeting">
        ${(() => {
          const parts = cleanLines(c.meeting).split("\n");
          const main = (parts[0] || "").trim();
          const sub = parts
            .slice(1)
            .map((s) => s.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "").trim())
            .filter(Boolean)
            .join("\n");
          debug.log("Processed meeting details:", { main, sub });
          return `
            ${main ? `<span class="meeting-pill">${escHTML(main).trim()}</span>` : ""}
            ${sub ? `<div class="meeting-sub">${escHTML(sub).trim()}</div>` : ""}
          `;
        })()}
      </td>
      <td class="instructionalFormat">${c.instructionalFormat || ""}</td>
    `;

    frag.appendChild(tr);
  });

  ctx.tableBody.appendChild(frag);
  debug.log("Rows rendered and added to table body.");
}
