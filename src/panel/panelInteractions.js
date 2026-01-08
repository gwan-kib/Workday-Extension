import { $$, on } from "../utilities/dom.js";
import { STATE } from "../core/state.js";
import { renderRows } from "./renderRows.js";
import { debugFor } from "../utilities/debugTool";

const debug = debugFor("panelInteractions");

export function applySearchFilter(q) {
  q = (q || "").trim().toLowerCase();
  debug.log("Search query received:", q);

  if (!q) {
    STATE.filtered = [...STATE.courses];
    debug.log("Search filter cleared, resetting filtered courses:", STATE.filtered);
    return;
  }

  STATE.filtered = STATE.courses.filter((c) => {
    return ["code", "title", "section_number", "instructor", "meeting", "instructionalFormat"].some((k) =>
      (c[k] || "").toLowerCase().includes(q)
    );
  });
  debug.log("Search filter applied, filtered courses:", STATE.filtered);
}

export function sortBy(key) {
  if (!key) return;

  const dir = STATE.sort.key === key ? -STATE.sort.dir : 1;
  STATE.sort = { key, dir };
  debug.log("Sorting by key:", key, "Direction:", dir);

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  STATE.filtered.sort((a, b) => dir * collator.compare(a[key] || "", b[key] || ""));
  debug.log("Sorted filtered courses:", STATE.filtered);
}

export function wireSorting(ctx) {
  const headCells = $$(ctx.tableHead, "th[data-key]");
  debug.log("Table header cells with sorting keys:", headCells);

  headCells.forEach((th) => {
    on(th, "click", () => {
      const key = th.getAttribute("data-key");
      debug.log("Sorting header clicked, sorting by:", key);
      sortBy(key);
      renderRows(ctx, STATE.filtered);

      headCells.forEach((h) => h.classList.remove("sorted-asc", "sorted-desc"));
      th.classList.add(STATE.sort.dir === 1 ? "sorted-asc" : "sorted-desc");
      debug.log("Updated sorting classes:", {
        sortedAsc: th.classList.contains("sorted-asc"),
        sortedDesc: th.classList.contains("sorted-desc"),
      });
    });
  });
}
