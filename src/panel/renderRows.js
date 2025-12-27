export const escHTML = (s) => {
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


export function renderRows(ctx, rows) {
  ctx.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  rows.forEach((c) => {
    const tr = document.createElement("tr");

    const badge =
      c.isLab ? "[Laboratory]" :
      c.isSeminar ? "[Seminar]" :
      "";

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
          const parts = String(c.meeting || "").split("\n");
          const main = (parts[0] || "").trim();   // "Wed / Fri | 12:30 p.m. - 2:00 p.m."
          const sub  = (parts[1] || "").trim();   // "Online" OR "Library (LIB) | Floor: 3 | Room: 317"

          return `
            ${main ? `<span class="meeting-pill">${escHTML(main)}</span>` : ""}
            ${sub  ? `<div class="meeting-sub">${escHTML(sub)}</div>` : ""}
          `;
        })()}
      </td>
      <td class="instructionalFormat">${c.instructionalFormat || ""}</td>
    `;

    frag.appendChild(tr);
  });

  ctx.tableBody.appendChild(frag);
}