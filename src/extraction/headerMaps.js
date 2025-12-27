import { $$ } from "../utilities/dom"

export const normalizeText = (s) => String(s || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

// Build a map: key -> aria-colindex (preferred), and key -> positional index fallback.
export function buildHeaderMaps(gridRoot) {
    const headerEls = $$(
      gridRoot,
      "thead th, [role='columnheader'], .wd-GridHeaderCell, .grid-column-header"
    );

    const headers = headerEls
      .map((el, pos) => {
        const text = getHeaderText(el);
        const col = getColIndex(el) ?? (pos + 1);

        return { el, pos, col, text, norm: normalizeText(text) };
      })
      .filter((h) => h.text);

    const findByIncludes = (needles) => {
      const ns = needles.map(normalizeText);
      // prefer exact match, then includes
      let hit = headers.find((h) => ns.includes(h.norm));
      if (hit)
        return hit;

      hit = headers.find((h) => ns.some((n) => h.norm.includes(n)));

      return hit || null;
    };

    // IMPORTANT: rename status -> instructionalFormat to match what it actually contains
    const KEYS = {
      instructor: ["instructor", "instructors"],
      meeting: ["meeting", "meeting patterns", "meeting pattern"],
      deliveryMode: ["delivery mode", "mode", "modality"],
      title: ["title", "course listing", "course name", "course"],
      code: ["class code", "code", "course code", "course id"],
      section: ["section", "sect", "sec"],

      // What you were calling "Status" is actually reading Instructional Format
      instructionalFormat: [
        "instructional format",
        "format",
        "component",
        "type",
        // keep these as fallbacks in case Workday labels vary:
        "status",
        "registration status",
      ],
    };

    const colMap = {};
    const posMap = {};

    for (const [k, needles] of Object.entries(KEYS)) {
      const hit = findByIncludes(needles);
      colMap[k] = hit ? hit.col : null;
      posMap[k] = hit ? hit.pos : -1;
    }

    return { colMap, posMap };
}

export function getHeaderText(headerEl) {
    if (!headerEl) 
        return "";

    const h4 = headerEl.querySelector("h4");

    return (
        (headerEl.getAttribute("title") || (h4 && h4.textContent) || headerEl.textContent || "").trim()
    );
}

export function getColIndex(el) {
    if (!el)
        return null;

    const direct = el.getAttribute && el.getAttribute("aria-colindex");

    if (direct && /^\d+$/.test(direct))
        return parseInt(direct, 10);

    // sometimes aria-colindex is on a parent wrapper
    let cur = el;
    for (let i = 0; i < 5 && cur; i++) {
      const v = cur.getAttribute && cur.getAttribute("aria-colindex");

      if (v && /^\d+$/.test(v))
        return parseInt(v, 10);

      cur = cur.parentElement;
    }

    return null;
}