import { $$ } from "../utilities/dom"
import { normalizeText, getHeaderText } from "./headerMaps.js"

// Find any likely Workday grid/table on the page
export function findingTables() {
    const roots = $$(
      document,
      'table, [role="table"], div[data-automation-id*="grid"], div[role="grid"]'
    );

    for (const root of roots) {
      const headerEls = $$(
        root,
        "thead th, [role='columnheader'], .wd-GridHeaderCell, .grid-column-header"
      );

      const headerText = headerEls.map((h) => normalizeText(getHeaderText(h)));

      // still require "section" + at least one other expected header
      const looksRight =
        headerText.some((t) => t.includes("section")) &&
        (headerText.some((t) => t.includes("instructor")) ||
          headerText.some((t) => t.includes("meeting")) ||
          headerText.some((t) => t.includes("instructional format")) ||
          headerText.some((t) => t.includes("format")) ||
          headerText.some((t) => t.includes("status")));

      if (!looksRight) 
        continue;

      const rows = $$(
        root,
        "tbody tr, [role='rowgroup'] [role='row'], .wd-GridRow, .grid-row"
      );

      if (rows.length)
        return { root, rows };
    }

    return null;
  }