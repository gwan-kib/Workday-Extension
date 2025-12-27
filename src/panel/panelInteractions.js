import { $$, on } from "../utilities/dom.js"
import { STATE } from "../core/state.js"
import { renderRows } from "./renderRows.js"

export function applySearchFilter(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) {
      STATE.filtered = [...STATE.courses];

      return;
    }
    STATE.filtered = STATE.courses.filter((c) => {
      return ["code", "title", "section_number", "instructor", "meeting", "instructionalFormat"].some(
        (k) => (c[k] || "").toLowerCase().includes(q)
      );
    });
}

export function sortBy(key) {
    if (!key)
        return;
    
    const dir = STATE.sort.key === key ? -STATE.sort.dir : 1;
    STATE.sort = { key, dir };

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    STATE.filtered.sort((a, b) => dir * collator.compare(a[key] || "", b[key] || ""));
}

export function wireSorting(ctx) {
    const headCells = $$(ctx.tableHead, "th[data-key]");
    headCells.forEach((th) => {
      on(th, "click", () => {
        const key = th.getAttribute("data-key");
        sortBy(key);
        renderRows(ctx, STATE.filtered);

        headCells.forEach((h) => h.classList.remove("sorted-asc", "sorted-desc"));
        th.classList.add(STATE.sort.dir === 1 ? "sorted-asc" : "sorted-desc");
      });
    });
}