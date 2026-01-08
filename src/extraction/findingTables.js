import { $$ } from "../utilities/dom";
import { debugFor } from "../utilities/debugTool.js";
import { normalizeText, getHeaderText } from "./headerMaps.js";

const debug = debugFor("findingTables");

// Find any likely Workday grid/table on the page
export function findingTables() {
  const roots = $$(document, 'table, [role="table"], div[data-automation-id*="grid"], div[role="grid"]');

  debug.log({ id: "findingTables.roots" }, "Candidate roots found:", roots.length);

  for (const root of roots) {
    const headerEls = $$(root, "thead th, [role='columnheader'], .wd-GridHeaderCell, .grid-column-header");

    const headerText = headerEls.map((h) => normalizeText(getHeaderText(h)));

    // still require "section" + at least one other expected header
    const looksRight =
      headerText.some((t) => t.includes("section")) &&
      (headerText.some((t) => t.includes("instructor")) ||
        headerText.some((t) => t.includes("meeting")) ||
        headerText.some((t) => t.includes("instructional format")) ||
        headerText.some((t) => t.includes("format")) ||
        headerText.some((t) => t.includes("status")));

    debug.log({ id: "findingTables.scanRoot" }, "Scanning root:", {
      headerCount: headerEls.length,
      looksRight,
      headerText,
    });

    if (!looksRight) continue;

    const rows = $$(root, "tbody tr, [role='rowgroup'] [role='row'], .wd-GridRow, .grid-row");

    debug.log({ id: "findingTables.rows" }, "Rows found for matching root:", rows.length);

    if (rows.length) return { root, rows };
  }

  debug.log({ id: "findingTables.none" }, "No matching table/grid found");
  return null;
}
