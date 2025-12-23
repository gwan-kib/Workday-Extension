// content.js — paste-ready full file
// Captured Courses panel injected into Workday pages.
// Works with panel.html and panel.css placed in the extension root.
// No background/service worker needed.

(() => {
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
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const csvEscape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCSV = (rows, headers) => {
    const head = headers.map(csvEscape).join(",");
    const body = rows.map(r => headers.map(h => csvEscape(r[h] ?? "")).join(",")).join("\n");
    return head + "\n" + body;
  };

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
    host.style.zIndex = "2147483647"; // above everything
    host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);

    return host.shadowRoot;
  }

  async function loadPanel(shadow) {
  const htmlUrl = chrome.runtime.getURL("src/panel.html");
  const cssUrl  = chrome.runtime.getURL("src/panel.css");

  console.log("Loading panel, urls:", htmlUrl, cssUrl);

  const [html, css] = await Promise.all([
    fetch(htmlUrl).then(r => r.text()),
    fetch(cssUrl).then(r => r.text())
  ]);

  console.log("Fetched html and css, html length:", html.length, "css length:", css.length);

  shadow.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  shadow.appendChild(wrap);

  const logoImg = shadow.querySelector("#wd-logo");
  if (logoImg) {
    logoImg.src = chrome.runtime.getURL("src/W.svg");
  }

  const ctx = {
    button: shadow.querySelector("#floating-button"),
    widget: shadow.querySelector(".widget"),
    search: shadow.querySelector("#widget-search"),
    refresh: shadow.querySelector("#widget-refresh"),
    exportBtn: shadow.querySelector("#widget-export"),
    tableBody: shadow.querySelector("tbody"),
    tableHead: shadow.querySelector("thead"),
    titleEl: shadow.querySelector("#widget-title"),
  };

  console.log("Panel loaded, ctx:", ctx);

  return ctx;
}


  // ---------- Extraction ----------
  // Primary: try to read any existing table with headers that include our fields.
  function sniffExistingTable() {
    // find any table that has at least 4 of our typical headers
    const headerLike = ["Code", "Title", "Sect", "Instructor", "Meeting", "Status"];
    const tables = $$(
      document,
      'table, [role="table"], div[data-automation-id*="grid"], div[role="grid"]'
    );

    for (const t of tables) {
      // collect header texts
      const heads = $$(t, "thead th, [role='columnheader'], .wd-GridHeaderCell, .grid-column-header")
        .map(x => x.textContent.trim());
      const matches = heads.filter(h => headerLike.some(k => h.toLowerCase().includes(k.toLowerCase())));
      if (matches.length >= 3) {
        // assume rows exist:
        const rows = $$(t, "tbody tr, [role='rowgroup'] [role='row'], .wd-GridRow, .grid-row");
        if (rows.length) return { table: t, rows };
      }
    }
    return null;
  }

  function normalizeMeeting(text) {
    const s = text.replace(/\s+/g, " ").trim();
    return s;
  }

  function guessCode(text) {
    // COSC_O 221 → capture
    const m = text.match(/[A-Z][A-Z0-9_]*\s*\d{2,3}[A-Z]?/);
    return m ? m[0].replace(/\s+/g, " ").trim() : "";
    }

  // Try row-by-row flexible scrape
  function extractFromRow(row) {
    const cells = $$(row, "td, [role='gridcell']");
    const raw = cells.map(c => c.innerText.trim());
    // Heuristic mapping: find columns by keyword
    const headers = $$(row.closest("table") || document, "thead th, [role='columnheader']")
      .map(th => th.textContent.trim().toLowerCase());

    const valByHeader = (key) => {
      const idx = headers.findIndex(h => h.includes(key));
      return idx >= 0 && raw[idx] ? raw[idx] : "";
    };

    let code = valByHeader("code") || valByHeader("course") || guessCode(raw[0] || "");
    let title = valByHeader("title") || valByHeader("name") || valByHeader("course") || raw[1] || "";
    let sect = valByHeader("sect") || valByHeader("section") || valByHeader("sec") || "";
    let instructor = valByHeader("instructor") || valByHeader("prof") || valByHeader("instr") || valByHeader("teacher") || valByHeader("faculty") || valByHeader("lecturer") || valByHeader("professor") || "";
    let meeting = valByHeader("meeting") || valByHeader("time") || valByHeader("schedule") || "";

    // If meeting doesn't look like a time, clear it (might be instructor data)
    if (meeting && !/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|am|pm|\d{1,2}:\d{2})\b/i.test(meeting)) {
      meeting = "";
    }
    let status = valByHeader("status") || "";

    // Parse combined code-title if separated by " - "
    if (code && code.includes(" - ")) {
      const parts = code.split(" - ");
      code = parts[0].trim();
      if (!title) title = parts.slice(1).join(" - ").trim();
    }
    if (title && title.includes(" - ")) {
      const parts = title.split(" - ");
      if (!code) code = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }

    // Parse code if it has section number like "COSC_O 222-101"
    if (code && code.includes("-")) {
      const codeParts = code.split("-");
      code = codeParts[0].trim();
      section_number = codeParts.slice(1).join("-").trim(); // in case multiple -
    }

    // Parse sect for section_number and section_type
    let section_number = '';
    let section_type = '';
    if (sect) {
      const match = sect.match(/(\d+)\s*-\s*(\w+)/) || sect.match(/(\d+)\s+(\w+)/);
      if (match) {
        section_number = match[1].trim();
        section_type = match[2].trim();
      } else {
        section_number = sect.trim();
      }
    }

    return { code, title, sect, section_number, section_type, instructor, meeting: normalizeMeeting(meeting), status };
  }

  function robustScan() {
    const found = sniffExistingTable();
    let courses = [];
    if (found) {
      for (const row of found.rows) {
        const c = extractFromRow(row);
        // Consider rows with at least code + title
        if ((c.code || c.title) && Object.values(c).join("").trim()) {
          courses.push(c);
        }
      }
    }

    // Fallback approach: look for card-like items that contain course blocks
    if (!courses.length) {
      const blocks = $$(
        document,
        [
          '[data-automation-id*="course"]',
          ".card, .list-item, .wd-ListItem, .wd-Card",
        ].join(",")
      );
      for (const b of blocks) {
        const text = b.innerText.trim();
        const code = guessCode(text);
        if (!code) continue;
        const title = (text.split("\n").find(x => x && x !== code) || "").trim();
        // Try to find meeting/time
        const meeting = (text.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n]+/i)?.[0] || "").trim();
        // Instructor guess
        const instructor = (text.match(/Instructor:?\s*([^\n]+)/i)?.[1] || "").trim();
        const status = (text.match(/Registered|Waitlisted|Open|Closed/i)?.[0] || "").trim();
        courses.push({ code, title, sect: "", section_number: "", section_type: "", instructor, meeting, status });
      }
    }
    return dedupeCourses(courses);
  }

  function dedupeCourses(list) {
    const key = (c) => [c.code, c.title, c.sect, c.section_number].join("|").toLowerCase();
    const seen = new Set();
    const out = [];
    for (const c of list) {
      const k = key(c);
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }
    return out;
  }

  // ---------- Render ----------
  function renderRows(ctx, rows) {
    ctx.tableBody.innerHTML = "";
    const frag = document.createDocumentFragment();
    rows.forEach((c, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="code">${c.code || ""}</td>
        <td class="title">
          <div class="title-main">${c.title || ""}</div>
          <div class="muted">${c.credits || ""}</div>
        </td>
        <td class="sect">${c.section_number || c.sect || ""} ${c.section_type || ""}</td>
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
    STATE.filtered = STATE.courses.filter(c => {
      return ["code","title","sect","section_number","section_type","instructor","meeting","status"]
        .some(k => (c[k] || "").toLowerCase().includes(q));
    });
  }

  function sortBy(key) {
    const dir = (STATE.sort.key === key) ? -STATE.sort.dir : 1;
    STATE.sort = { key, dir };
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    STATE.filtered.sort((a,b) => dir * collator.compare(a[key] || "", b[key] || ""));
  }

  // ---------- Wire events ----------
  function wireSorting(ctx) {
    const headCells = $$(
      ctx.tableHead,
      "th[data-key]"
    );
    headCells.forEach(th => {
      on(th, "click", () => {
        const key = th.getAttribute("data-key");
        sortBy(key);
        renderRows(ctx, STATE.filtered);
        // visualize sort
        headCells.forEach(h => h.classList.remove("sorted-asc","sorted-desc"));
        th.classList.add(STATE.sort.dir === 1 ? "sorted-asc" : "sorted-desc");
      });
    });
  }

  function exportCSV() {
    const headers = ["code","title","sect","section_number","section_type","instructor","meeting","status"];
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
    console.log("Booting extension");
    const shadow = ensureMount();
    console.log("Shadow mounted");
    const ctx = await loadPanel(shadow);
    console.log("Panel loaded");

    // floating button toggle
    on(ctx.button, "click", () => {
      console.log("Button clicked");
      ctx.widget.classList.toggle("is-hidden");
    });

    // refresh
    on(ctx.refresh, "click", () => {
      STATE.courses = robustScan();
      applySearchFilter(ctx.search.value);
      sortBy(STATE.sort.key || "code");
      renderRows(ctx, STATE.filtered);
    });

    // export
    on(ctx.exportBtn, "click", exportCSV);

    // search
    on(ctx.search, "input", debounce(() => {
      applySearchFilter(ctx.search.value);
      sortBy(STATE.sort.key || "code");
      renderRows(ctx, STATE.filtered);
    }, 100));

    // allow click on header to sort
    wireSorting(ctx);

    // initial scan
    STATE.courses = robustScan();
    STATE.filtered = [...STATE.courses];
    renderRows(ctx, STATE.filtered);
    console.log("Initial scan done, courses:", STATE.courses.length);
  }

  // Delay boot until DOM is ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
