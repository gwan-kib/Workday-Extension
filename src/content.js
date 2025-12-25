// content.js — paste-ready full file
// Captured Courses panel injected into Workday pages.
// Works with panel.html and panel.css placed in the extension root.

(() => {
  console.log("✓ Content script loaded");
  const EXT_ID = "wd-courses-capture";
  const STATE = {
    courses: [],
    filtered: [],
    sort: { key: null, dir: 1 }, // 1 asc, -1 desc
  };

  // ---------- small utils ----------
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const debounce = (fn, ms = 300) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const csvEscape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCSV = (rows, headers) => {
    const head = headers.map(csvEscape).join(",");
    const body = rows
      .map((r) => headers.map((h) => csvEscape(r[h] ?? "")).join(","))
      .join("\n");
    return head + "\n" + body;
  };

  const normalizeText = (s) =>
    String(s || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  // ---------- Shadow DOM mount ----------
  function ensureMount() {
    let host = document.getElementById(EXT_ID);
    if (host) return host.shadowRoot;

    host = document.createElement("div");
    host.id = EXT_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.bottom = "16px";
    host.style.right = "16px";
    host.style.zIndex = "2147483647";
    host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);

    return host.shadowRoot;
  }

  async function loadPanel(shadow) {
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

    const logoImg = shadow.querySelector("#wd-logo");
    if (logoImg) logoImg.src = chrome.runtime.getURL("src/W.svg");

    return {
      button: shadow.querySelector("#floating-button"),
      widget: shadow.querySelector(".widget"),
      search: shadow.querySelector("#widget-search"),
      refresh: shadow.querySelector("#widget-refresh"),
      exportBtn: shadow.querySelector("#widget-export"),
      tableBody: shadow.querySelector("tbody"),
      tableHead: shadow.querySelector("thead"),
      titleEl: shadow.querySelector("#widget-title"),
    };
  }

  // ---------- Extraction helpers ----------
  function guessCode(text) {
    const m = String(text || "").match(/[A-Z][A-Z0-9_]*\s*\d{2,3}[A-Z]?/);
    return m ? m[0].replace(/\s+/g, " ").trim() : "";
  }

  function normalizeMeeting(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function getHeaderText(headerEl) {
    if (!headerEl) return "";
    const h4 = headerEl.querySelector("h4");
    return (
      (headerEl.getAttribute("title") ||
        (h4 && h4.textContent) ||
        headerEl.textContent ||
        "")
        .trim()
    );
  }

  function getColIndex(el) {
    if (!el) return null;
    const direct = el.getAttribute && el.getAttribute("aria-colindex");
    if (direct && /^\d+$/.test(direct)) return parseInt(direct, 10);

    // sometimes aria-colindex is on a parent wrapper
    let cur = el;
    for (let i = 0; i < 5 && cur; i++) {
      const v = cur.getAttribute && cur.getAttribute("aria-colindex");
      if (v && /^\d+$/.test(v)) return parseInt(v, 10);
      cur = cur.parentElement;
    }
    return null;
  }

  // Build a map: key -> aria-colindex (preferred), and key -> positional index fallback.
  function buildHeaderMaps(gridRoot) {
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
      if (hit) return hit;
      hit = headers.find((h) => ns.some((n) => h.norm.includes(n)));
      return hit || null;
    };

    // IMPORTANT: include Instructor explicitly (your request)
    const KEYS = {
      instructor: ["instructor", "instructors"],
      meeting: ["meeting", "meeting patterns", "meeting pattern"],
      status: ["status", "registration status"],
      title: ["title", "course listing", "course name", "course"],
      code: ["class code", "code", "course code", "course id"],
      section: ["section", "sect", "sec"],
      type: ["instructional format", "type", "component", "format"],
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

  // Find any likely Workday grid/table on the page
  function sniffExistingTable() {
    const roots = $$(
      document,
      'table, [role="table"], div[data-automation-id*="grid"], div[role="grid"]'
    );

    for (const root of roots) {
      const headerEls = $$(
        root,
        "thead th, [role='columnheader'], .wd-GridHeaderCell, .grid-column-header"
      );

      // require at least *some* known headers
      const headerText = headerEls.map((h) => normalizeText(getHeaderText(h)));
      const looksRight =
        headerText.some((t) => t.includes("section")) &&
        (headerText.some((t) => t.includes("instructor")) ||
          headerText.some((t) => t.includes("meeting")) ||
          headerText.some((t) => t.includes("registration status")) ||
          headerText.some((t) => t.includes("status")));

      if (!looksRight) continue;

      const rows = $$(
        root,
        "tbody tr, [role='rowgroup'] [role='row'], .wd-GridRow, .grid-row"
      );

      if (rows.length) return { root, rows };
    }

    return null;
  }

  /**
   * Parse the Workday "promptOption" section link string.
   * REQUIRED first step regex:
   *   m = str.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{2,3}[A-Z]?)-(.+?)\s*$/);
   *
   * Example:
   *   "COSC_O 222-L2D - Data Structures"
   *   baseCode = "COSC_O 222"
   *   rest = "L2D - Data Structures"
   *   section_number = "L2D"
   *   title = "Data Structures"
   */
  function parseSectionLinkString(input) {
    let str = String(input || "").replace(/\u00A0/g, " ").trim();
    if (!str) return null;

    // keep ALL lines; Workday wraps titles with \n
    str = str.replace(/\s*\n\s*/g, " ").trim();

    // REQUIRED pattern:
    const m = str.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?)\s*-\s*(.+?)\s*$/);
    if (!m) return null;

    const baseCode = m[1].trim(); // "COSC_O 222"
    const rest = m[2].trim();     // "L2D - Data Structures" or "101 - Data Structures"

    
    // Split rest into section token + title (ONLY if first part looks like a section)
const parts = rest.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);

console.log(rest);
console.log(rest);
console.log(parts);

const looksLikeSection = (s) =>
  /^\d{3}$/.test(s) ||            // 001, 101
  /^[A-Z]\d{1,2}[A-Z]?$/.test(s); // L2B, L2D, L02

let sectionToken = "";
let parsedTitle = "";

if (parts.length >= 2 && looksLikeSection(parts[0])) {
  sectionToken = parts[0];
  parsedTitle = parts.slice(1).join(" - ").trim();
} else {
  parsedTitle = rest.trim();
}

parsedTitle = parsedTitle.replace(/\s*:\s*/g, ":\n");


    return {
      code: baseCode,
      section_number: sectionToken,
      title: parsedTitle,
      full: str,
    };
  }

  function extractMeetingLinesFromCell(meetingEl) {
  if (!meetingEl) return [];

  // BEST SOURCE: menu items expose full meeting strings in aria-label
  const menuItems = Array.from(
    meetingEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]')
  );

  let lines = menuItems
    .map((el) => (el.getAttribute("aria-label") || "").trim())
    .filter(Boolean);

  // fallback: promptOption text (sometimes present)
  if (!lines.length) {
    const prompts = Array.from(
      meetingEl.querySelectorAll('[data-automation-id="promptOption"]')
    );
    lines = prompts
      .map((el) =>
        (
          el.getAttribute("data-automation-label") ||
          el.getAttribute("title") ||
          el.textContent ||
          ""
        ).trim()
      )
      .filter(Boolean);
  }

  // final fallback: innerText split
  if (!lines.length) {
    lines = String(meetingEl.innerText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // only keep real meeting sentences
  const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
  const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
  const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

  return lines.filter((s) => DATE_RE.test(s) && TIME_RE.test(s) && DAY_RE.test(s));
}

function formatMeetingLineForPanel(line) {
  const parts = String(line || "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  // Example parts:
  // [0] date range
  // [1] "Wed Fri"
  // [2] "12:30 p.m. - 2:00 p.m."
  // [3] "UBCO"
  // [4] "Library (LIB)"
  // [5] "Floor: 3"
  // [6] "Room: 317"

  const dayPart = parts.find((p) => /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(p)) || "";
  const timePart = parts.find((p) => /\d{1,2}:\d{2}/.test(p) && /-/.test(p)) || "";
  const buildingPart = parts.find((p) => /\([A-Z]{2,}\)/.test(p)) || ""; // "Library (LIB)"
  const floorPart = parts.find((p) => /^Floor:/i.test(p)) || "";
  const roomPart = parts.find((p) => /^Room:/i.test(p)) || "";

  // Keep it “meeting-pattern-ish” (days + time + location)
  return [dayPart, timePart, buildingPart, floorPart, roomPart].filter(Boolean).join(" | ");
}

function extractMeetingLinesFromRow(rowEl) {
  if (!rowEl) return [];
  // look anywhere in the row for the "menuItem" aria-label pattern
  const items = Array.from(rowEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'));
  const lines = items
    .map((el) => (el.getAttribute("aria-label") || "").trim())
    .filter(Boolean);

  // reuse the same strict filter you already use
  const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
  const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
  const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

  return lines.filter((s) => DATE_RE.test(s) && TIME_RE.test(s) && DAY_RE.test(s));
}

function cellHasPanelHeading(cell, heading) {
  if (!cell) return false;
  const want = normalizeText(heading);

  // Workday often has <div title="Instructor"><h4>Instructor</h4>
  const titled = Array.from(cell.querySelectorAll('[data-automation-id="panel"] [title], [data-automation-id="panel"] h4'));
  for (const el of titled) {
    const t = el.getAttribute && el.getAttribute("title");
    if (t && normalizeText(t) === want) return true;
    if (el.tagName === "H4" && normalizeText(el.textContent) === want) return true;
  }
  return false;
}

function findCellByPanelHeading(cells, heading) {
  for (const cell of cells) {
    if (cellHasPanelHeading(cell, heading)) return cell;
  }
  return null;
}

function extractInstructorNamesFromCell(instructorEl) {
  if (!instructorEl) return "";

  // Same structure as meetings: selected menu items with aria-label
  const items = Array.from(instructorEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'))
    .map((el) => (el.getAttribute("aria-label") || "").trim())
    .filter(Boolean);

  // Filter out junk (dates / meeting-like strings)
  const looksLikeDateOrMeeting = (s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) ||
    /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/.test(s) ||
    /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(s) ||
    /\b\d{1,2}:\d{2}\b/.test(s);

  const names = items.filter((s) => !looksLikeDateOrMeeting(s));
  if (names.length) return names.join(", ");

  // fallback: promptOption
  const prompt = instructorEl.querySelector('[data-automation-id="promptOption"]');
  const txt = (
    (prompt && (prompt.getAttribute("data-automation-label") || prompt.getAttribute("title") || prompt.textContent)) ||
    instructorEl.textContent ||
    ""
  ).trim();

  return looksLikeDateOrMeeting(txt) ? "" : txt;
}


  function extractFromRow(row, headerMaps) {
    console.log("✓ extractFromRow loaded");
    const { colMap, posMap } = headerMaps;

    const cells = $$(row, "td, [role='gridcell']");
    const raw = cells.map((c) => (c.innerText || "").trim());

    // map row cells by aria-colindex (preferred)
    const cellByCol = new Map();
    cells.forEach((cell, i) => {
      const col = getColIndex(cell) ?? (i + 1);
      if (!cellByCol.has(col)) cellByCol.set(col, cell);
    });

    const readByKey = (key) => {
      const col = colMap[key];
      if (col != null && cellByCol.has(col)) {
        return (cellByCol.get(col).innerText || "").trim();
      }
      // fallback to positional index
      const pos = posMap[key];
      if (pos != null && pos >= 0 && pos < raw.length) return raw[pos] || "";
      return "";
    };

    // Workday section link element (best single source for code+section+title)
    const sectionLinkEl =
      $(row, '[data-automation-id="promptOption"][role="link"]') ||
      $(row, '.gwt-Label.WFMO.WOKO[data-automation-id="promptOption"][role="link"]');

    const sectionLinkString =
      (sectionLinkEl &&
        (sectionLinkEl.getAttribute("data-automation-label") ||
          sectionLinkEl.getAttribute("title") ||
          sectionLinkEl.textContent)) ||
      "";

    // Read columns (now Instructor comes from Instructor column properly)
    const titleCell = readByKey("title");
    const codeCell = readByKey("code");
    const sectCell = readByKey("section");
    const typeCell = readByKey("type");
    const statusCell = readByKey("status");
    const meetingCell = readByKey("meeting");
    const instructorCell = readByKey("instructor"); // <-- FIXED SOURCE

    // ---------- Core parse: (code + section + title) from the same string ----------
    let code = "";
    let title = titleCell || "";
    let sect = sectCell || "";
    let section_number = "";
    let section_type = "";

    // 1) Parse the Section link string first (most reliable)
    const parsed = parseSectionLinkString(sectionLinkString);
    if (parsed) {
      code = parsed.code;
      section_number = parsed.section_number;
      title = parsed.title;
      console.log("found section link for:", title);
    } else {
      console.log("did not find section link for", title);
    }
    

    // 3) Fallback guesses
    if (!code) code = guessCode(codeCell) || guessCode(titleCell) || guessCode(raw.join(" ")) || "";

    // ---------- Lab / Seminar detection ----------
    const labLike = (s) => /\b(lab|laboratory|labratory)\b/i.test(String(s || ""));
    const seminarLike = (s) => /\bseminar\b/i.test(String(s || ""));

    const isLab =
      labLike(typeCell) ||
      labLike(sectCell) ||
      labLike(title) ||
      labLike(sectionLinkString) ||
      labLike(raw.join(" "));

    const isSeminar =
      seminarLike(typeCell) ||
      seminarLike(sectCell) ||
      seminarLike(title) ||
      seminarLike(sectionLinkString) ||
      seminarLike(raw.join(" "));

    // ---------- Instructor (robust: find the cell by its internal "Instructor" panel header) ----------
let instructor = "";

let instructorEl =
  findCellByPanelHeading(cells, "Instructor") || // ✅ best: matches your pasted element
  (() => {
    const instructorCol = colMap.instructor;
    if (instructorCol != null && cellByCol.has(instructorCol)) return cellByCol.get(instructorCol);
    if (posMap.instructor != null && posMap.instructor >= 0 && posMap.instructor < cells.length) return cells[posMap.instructor];
    return null;
  })();

if (isLab || isSeminar) {
  instructor = "N/A";
} else {
  instructor = extractInstructorNamesFromCell(instructorEl) || (instructorCell || "").trim();
}



    // ---------- Meeting (improved: responsiveMonikerInput list items) ----------
let meeting = "";

// pick the actual meeting cell element (by aria-colindex if possible)
const meetingCol = colMap.meeting;
let meetingEl = null;

if (meetingCol != null && cellByCol.has(meetingCol)) {
  meetingEl = cellByCol.get(meetingCol);
} else if (posMap.meeting != null && posMap.meeting >= 0 && posMap.meeting < cells.length) {
  meetingEl = cells[posMap.meeting];
}

// 1) try the mapped meeting cell first
let lines = meetingEl ? extractMeetingLinesFromCell(meetingEl) : [];

// 2) if mapping failed (common), search the whole row for those menuItem aria-labels
if (!lines.length) {
  lines = extractMeetingLinesFromRow(row);
}

if (lines.length) {
  meeting = lines.map(formatMeetingLineForPanel).filter(Boolean).join(" / ");
} else {
  // last fallback
  meeting = (meetingCell || "").trim();
}



    // ---------- Status ----------
    const status = (statusCell || "").trim();

    // Final title fallback: if still empty, try after " - " in sectionLinkString
    if (!title && sectionLinkString) {
      const idx = sectionLinkString.indexOf(" - ");
      if (idx >= 0) title = sectionLinkString.slice(idx + 3).trim();
    }

// ---------- Sanity swap: fix common mis-maps (instructor ends up as date, meeting as name) ----------
const looksLikeDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
const looksLikeName = (s) => /^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/.test(String(s || "").trim());

if (looksLikeDate(instructor) && looksLikeName(meeting)) {
  const tmp = instructor;
  instructor = meeting;
  meeting = tmp;
}


    return {
      code,
      title,
      sect,
      section_number,
      section_type,
      instructor,
      meeting: normalizeMeeting(meeting),
      status,
      isLab,
      isSeminar,
    };
  }

  function dedupeCourses(list) {
    const key = (c) => [c.code, c.title, c.section_number].join("|").toLowerCase();
    const seen = new Set();
    const out = [];
    for (const c of list) {
      const k = key(c);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(c);
      }
    }
    return out;
  }

  async function robustScan() {
    const found = sniffExistingTable();
    let courses = [];

    if (found) {
      const headerMaps = buildHeaderMaps(found.root);

      for (const row of found.rows) {
        const c = extractFromRow(row, headerMaps);
        if ((c.code || c.title) && Object.values(c).join("").trim()) courses.push(c);
      }
    }

    return dedupeCourses(courses);
  }

  // ---------- Render ----------
  function renderRows(ctx, rows) {
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
        <td class="sect">${(c.section_number || c.sect || "").trim()} ${(c.section_type || "").trim()}</td>
        <td class="instructor">${c.instructor || ""}</td>
        <td class="meeting">${c.meeting || ""}</td>
        <td class="status">${c.status || ""}</td>
      `;

      frag.appendChild(tr);
    });

    ctx.tableBody.appendChild(frag);
  }

  function applySearchFilter(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) {
      STATE.filtered = [...STATE.courses];
      return;
    }
    STATE.filtered = STATE.courses.filter((c) => {
      return ["code", "title", "section_number", "instructor", "meeting", "status"].some(
        (k) => (c[k] || "").toLowerCase().includes(q)
      );
    });
  }

  function sortBy(key) {
    if (!key) return;
    const dir = STATE.sort.key === key ? -STATE.sort.dir : 1;
    STATE.sort = { key, dir };

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    STATE.filtered.sort((a, b) => dir * collator.compare(a[key] || "", b[key] || ""));
  }

  function wireSorting(ctx) {
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

  function exportCSV() {
    const headers = ["code", "title", "section_number", "instructor", "meeting", "status"];
    const csv = toCSV(STATE.filtered, headers);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "captured-courses.csv";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  }

  // ---------- Boot ----------
  async function boot() {
    const shadow = ensureMount();
    const ctx = await loadPanel(shadow);

    on(ctx.button, "click", () => {
      ctx.widget.classList.toggle("is-hidden");
    });

    on(ctx.refresh, "click", async () => {
      STATE.courses = await robustScan(); // ✅ refresh works
      applySearchFilter(ctx.search.value);
      sortBy(STATE.sort.key || "code");
      renderRows(ctx, STATE.filtered);
    });

    on(ctx.exportBtn, "click", exportCSV);

    on(
      ctx.search,
      "input",
      debounce(() => {
        applySearchFilter(ctx.search.value);
        sortBy(STATE.sort.key || "code");
        renderRows(ctx, STATE.filtered);
      }, 100)
    );

    wireSorting(ctx);

    STATE.courses = await robustScan(); // ✅ initial scan stable
    STATE.filtered = [...STATE.courses];
    sortBy("code");
    renderRows(ctx, STATE.filtered);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
