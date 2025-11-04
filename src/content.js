/************ Config ************/

const DEBUG = true;
const START_DELAY = 1200;
const REARM_DELAY = 800;

/************ Column labels (for real headered grids only) ************/

const LABELS = {
  courseListing: ['course listing', 'course', 'course title', 'course id', 'course name'],
  section: ['section'],
  credits: ['credits'],
  gradingBasis: ['grading basis'],
  registrationStatus: ['registration status', 'status'],
  instructionalFormat: ['instructional format'],
  deliveryMode: ['delivery mode'],
  meetingPatterns: ['meeting patterns', 'meetings', 'schedule'],
  instructor: ['instructor'],
  startDate: ['start date'],
  endDate: ['end date'],
};

/************ Selectors ************/
const SEL = {
  tableLike: [
    '[data-automation-id="table"]',
    '[data-automation-id="grid"]',
    '[role="grid"]',
    '[role="table"]',
    'table'
  ].join(','),
  headerCell: [
    '[data-automation-id^="columnHeader"]',
    '[role="columnheader"]',
    'thead th', 'th'
  ].join(','),
  row: [
    '[data-automation-id="row"]',    
    'div[role="row"]',
    'tbody tr'
  ].join(','),
  cell: [
    '[data-automation-id="cell"]',
    '[role="gridcell"]',
    'td'
  ].join(','),
  textish: [
    '[data-automation-id="promptOption"]',
    '[data-automation-id="numericText"]',
    '[data-automation-id="textView"]',
    'a, span, div, button'
  ].join(','),
};

/************ Shadow-DOM helpers ************/

/** Query all matching elements in light + shadow DOMs under `root`. */
function deepQuerySearchAll(root, selector) {
  const allElements = [...root.querySelectorAll(selector)];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const currElement = walker.currentNode;

    if (currElement.shadowRoot) {
      allElements.push(...currElement.shadowRoot.querySelectorAll(selector));
    }
  }

  return allElements;
}

/** Query the first matching element in light + shadow DOMs under `root`. */
function deepQuerySearchFirst(root, selector) {
  const direct = root.querySelector(selector);
  
  if (direct) {
    return direct;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const currElement = walker.currentNode;

    if (currElement.shadowRoot) {
      const hit = currElement.shadowRoot.querySelector(selector);

      if (hit) {
        return hit;
      }
    }
  }

  return null;
}

/************ Utilities ************/

const consoleLog  = (...a) => DEBUG && console.log('[Workday Course Extractor]\n', ...a);
const consoleWarn = (...a) => console.warn('[Workday Course Extractor]\n', ...a);

/** Return meaningful text for a cell-like element (prefers data-automation-label). */
function textFrom(element) {
  const lab = element?.getAttribute?.('data-automation-label');

  if (lab && lab.trim()) {
    return lab.trim();
  }
  
  return (element?.innerText ?? element?.textContent ?? '').trim();
}

/** Lowercase + collapse whitespace for stable matching. */
function normalizeText(s) { 
  return (s||'').replace(/\s+/g,' ').trim().toLowerCase(); 
}

/** Grab header strings from a table/grid element. */
function headersFrom(element) {
  const headerEls = deepQuerySearchAll(element, SEL.headerCell);

  return headerEls
    .map(h => (deepQuerySearchFirst(h, 'span,div,button')?.innerText || h.innerText || '').trim())
    .map(s => s.replace(/\u00a0/g,' ').trim())
    .filter(Boolean);
}

/** Map label keys to column indices based on detected headers. */
function mapHeadersToIndexes(headers) {
  const headerIndexMap = {};
  for (const [key, variants] of Object.entries(LABELS)) {
    headerIndexMap[key] = headers.findIndex(header => variants.includes(normalizeText(header)));
  }

  return headerIndexMap;
}

/** 24h time converter (e.g., "1:30 p.m." -> "13:30"). */
function timeIn24Hours(time) {
  if (!time) {
    return '';
  }

  const timeCleaned = time.toLowerCase().replace(/\s+/g,'').replace(/\./g,'');
  const match = /(\d{1,2}):(\d{2})(am|pm)/.exec(timeCleaned);

  if (!match) {
    return time.trim();
  }

  let [_, hh, mm, ap] = match; 
  let hours = parseInt(hh,10);

  if (ap === 'pm' && hours !== 12) {
    hours += 12;
  }

  if (ap === 'am' && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2,'0')}:${mm}`;
}

/** Parse a meeting line into {startDate,endDate,days[],start,end,location,raw}. */
function parseMeetingLine(rawLine) {
  const cleanLine = rawLine.trim();
  const dates = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/.exec(cleanLine);
  const times = /(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s*-\s*(\d{1,2}:\d{2}\s*[ap]\.?m\.?)/i.exec(cleanLine);
  const days = []; 
  let m, DAY=/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi;

  while ((m = DAY.exec(cleanLine))) {
    days.push(m[1]);
  }

  let location = '';

  if (times) {
    location = cleanLine.slice(times.index + times[0].length).replace(/^[\s|]+/,'').trim();
  }

  return {
    startDate: dates?.[1] || '',
    endDate: dates?.[2] || '',
    days,
    start: times ? timeIn24Hours(times[1]) : '',
    end: times ? timeIn24Hours(times[2]) : '',
    location,
    raw: cleanLine
  };
}

/************ Core: headered grid path ************/

/** Find candidate table `rootElement`. */
function findCourseTable(rootElement) {
  return deepQuerySearchFirst(rootElement, SEL.tableLike);
}

/** Parse rows from a table/grid with headers. */
function extractFromTable(table) {
  const headers = headersFrom(table);

  if (!headers.length) {
    return { rows: [], diagnostics: { reason: 'could not find any headers' } };
  }

  const headerIndexMap = mapHeadersToIndexes(headers);
  const rows = [];
  const rowElements = deepQuerySearchAll(table, SEL.row);

  consoleLog('headers:', headers, 'mapped:', headerIndexMap, 'rowEls:', rowElements.length);

  for (const row of rowElements) {
    const cells = deepQuerySearchAll(row, SEL.cell);

    if (!cells.length) {
      continue;
    }

    const getCellElement = (key) => {
      const header = headerIndexMap[key];

      return (header == null || header < 0 || header >= cells.length) ? null : cells[header];
    };

    const readCell = (cell) => !cell ? '' : (textFrom(deepQuerySearchFirst(cell, SEL.textish)) || textFrom(cell));

    const listing = readCell(getCellElement('courseListing'));
    if (!listing) {
      continue;
    }

    const parts = listing.split(/\s*-\s*/);
    const code  = parts[0] || '';
    const title = parts.slice(1).join(' - ') || '';

    const mpCell  = getCellElement('meetingPatterns');
    const mpLines = mpCell 
    ? deepQuerySearchAll(mpCell, SEL.textish)
    .map(textFrom)
    .map(text => text.trim())
    .filter(Boolean) 
    : [];
    const meetings = mpLines.map(parseMeetingLine);

    rows.push({
      code,
      title,
      section: readCell(getCellElement('section')),
      credits: readCell(getCellElement('credits')),
      gradingBasis: readCell(getCellElement('gradingBasis')),
      registrationStatus: readCell(getCellElement('registrationStatus')),
      instructionalFormat: readCell(getCellElement('instructionalFormat')),
      deliveryMode: readCell(getCellElement('deliveryMode')),
      instructor: readCell(getCellElement('instructor')),
      startDate: readCell(getCellElement('startDate')),
      endDate: readCell(getCellElement('endDate')),
      meetings
    });
  }

  return { rows, diagnostics: { headers, mapped: headerIndexMap, rowsFound: rows.length } };
}

/************ Core: loose row fallback (no header/table wrapper) ************/

/** Parse course rows by scanning `[data-automation-id="row"]` directly and inferring fields. */
function extractByLooseRows(rootElement) {
  const rows = [];
  const rowElements = deepQuerySearchAll(rootElement, '[data-automation-id="row"]');

  consoleLog('loose rows found:', rowElements.length);

  for (const row of rowElements) {
    const cells = deepQuerySearchAll(row, '[data-automation-id="cell"], td, div[role="gridcell"]');
    
    if (!cells.length) {
      continue;
    }

    let listing = '', code = '', title = '';
    let credits = '', gradingBasis = '', registrationStatus = '';
    let instructionalFormat = '', deliveryMode = '';
    let instructor = '', startDate = '', endDate = '';
    const meetings = [];

    const promptTexts = [];
    const numericTexts = [];
    const textViews = [];

    for (const cell of cells) {
      deepQuerySearchAll(cell, '[data-automation-id="promptOption"]').forEach(p => promptTexts.push(textFrom(p)));
      deepQuerySearchAll(cell, '[data-automation-id="numericText"]').forEach(n => numericTexts.push(textFrom(n)));
      deepQuerySearchAll(cell, '[data-automation-id="textView"]').forEach(t => textViews.push(textFrom(t)));
    }

    // Course listing like "COSC_O 211 - Machine Architecture"
    listing = promptTexts.find(t => / - /.test(t)) || '';
    if (listing) {
      const parts = listing.split(/\s*-\s*/);
      code  = parts[0] || '';
      title = parts.slice(1).join(' - ') || '';
    }

    // Credits: small integer numericText
    credits = (numericTexts.find(t => /^\d{1,2}$/.test(t)) || '').trim();

    // Basis / status / format / delivery (simple keyword checks)
    gradingBasis        = promptTexts.find(t => /graded|pass|audit/i.test(t)) || '';
    registrationStatus  = promptTexts.find(t => /registered|waitlist|dropped|enrolled/i.test(t)) || '';
    instructionalFormat = promptTexts.find(t => /lecture|lab|seminar|tutorial/i.test(t)) || '';
    deliveryMode        = promptTexts.find(t => /in person|online|hybrid/i.test(t)) || '';

    // Meeting lines: have a "YYYY-MM-DD - YYYY-MM-DD" range
    promptTexts
      .filter(t => /\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}/.test(t))
      .forEach(ml => meetings.push(parseMeetingLine(ml)));

    // Instructor: often a first+last (very light heuristic)
    instructor = promptTexts.find(t => /^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/.test(t)) || '';

    // Dates: textView cells that are pure YYYY-MM-DD
    const dateVals = textViews.filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t));
    if (dateVals[0]) {
      startDate = dateVals[0];
    }

    if (dateVals[1]) {
      endDate   = dateVals[1];
    }

    // Require at least some identity (listing/code/title)
    if (!(listing || code || title)) {
      continue;
    }

    rows.push({
      code, title, section: '', credits, gradingBasis, registrationStatus,
      instructionalFormat, deliveryMode, instructor, startDate, endDate, meetings
    });
  }

  return rows;
}

/************ Orchestration ************/

/** Extract rows from top doc and same-origin iframes (grid path -> loose path). */
function extractCourseDataFromDoc(doc, where='top-doc') {
  const out = [];
  const diagnostics = [];

  // Try headered tables/grids first
  const { rows, diagnostics: diag } = extractFromTable(findCourseTable(doc));
  
  diagnostics.push({ where, diag });
  
  if (rows.length) {
    out.push(...rows);
  }

  // Fallback: loose rows
  if (!out.length) {
    const loose = extractByLooseRows(doc);

    if (loose.length) {
      diagnostics.push({ where, diagnostics: { looseRows: true, rowsFound: loose.length } });
      out.push(...loose);
    }
  }

  return { out, diagnostics };
}

/** Run extraction across document + any same-origin iframes. */
function extractAll() {
  const all = [];
  const diagnostics = [];

  const top = extractCourseDataFromDoc(document, 'top-doc');
  all.push(...top.out);
  diagnostics.push(...top.diagnostics);

  const frames = [...document.querySelectorAll('iframe')];

  consoleLog('frames detected (same-origin only):', frames.length);

  for (const frame of frames) {
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;

      if (!doc) {
        continue;
      }

      const tag = `iframe[src*="${frame.getAttribute('src')||''}"]`;
      const res = extractCourseDataFromDoc(doc, tag);

      all.push(...res.out);
      diagnostics.push(...res.diagnostics);
    } catch {/* cross-origin -> ignore */}
  }

  return { courses: all, diagnostics };
}

/************ Kickoff + observer ************/

/** Schedule extraction, store results, and emit an in-page event. */
function runExtraction(delay = START_DELAY) {
  setTimeout(() => {
    const { courses, diagnostics } = extractAll();

    consoleLog('diagnostics:', diagnostics);

    console.log(`[Workday Course Extractor]\n parsed ${courses.length} course rows\n`, courses);

    if (courses.length) {
      chrome?.storage?.local?.set?.({ courses, capturedAt: Date.now(), diagnostics });
      
      document.dispatchEvent(new CustomEvent('workday-courses-captured', { detail: { count: courses.length } }));
      
    } else {
      consoleWarn('No rows parsed. Ensure the enrolled courses are visible, then run window.__wdDump().');
      chrome?.storage?.local?.set?.({ lastDiagnostics: diagnostics, lastUrl: location.href });
    }

  }, delay);
}

/************ Panel ************/

// 1) Call the panel initializer
(function init() {
  console.log('Workday Course Extractor — minimal build');

  // run extraction like before
  window.addEventListener('load', () => runExtraction(START_DELAY));

  const mo = new MutationObserver(() => runExtraction(REARM_DELAY));
  mo.observe(document.documentElement, { childList: true, subtree: true });

  window.__wdDump = () => runExtraction(0);

  // ✅ actually mount the panel (and its button)
  initCoursePanel();
})();

async function initCoursePanel() {
  // Container for the floating panel (outside shadow so we can show/hide it)
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'fixed',
    right: '16px',
    bottom: '70px',
    zIndex: 2147483646,
    width: '540px',
    maxHeight: '60vh',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    color: '#111',
    display: 'block' // start hidden; toggle button will show/hide
  });
  document.body.appendChild(host);

  // Shadow DOM isolates the panel’s CSS/HTML from Workday styles
  const shadow = host.attachShadow({ mode: 'open' });

  // Load panel assets
  const cssURL  = chrome.runtime.getURL('src/panel.css');
  const htmlURL = chrome.runtime.getURL('src/panel.html');

  let css = '', html = '';
  try {
    const [cssRes, htmlRes] = await Promise.all([fetch(cssURL), fetch(htmlURL)]);
    css  = await cssRes.text();
    html = await htmlRes.text();
  } catch (e) {
    console.error('[Workday Course Extractor] Failed to load panel assets:', e);
    return;
  }

  // Inject CSS + HTML into the shadow root
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  shadow.appendChild(styleEl);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  shadow.appendChild(wrapper);

  // --- Toggle button lives INSIDE panel.html as #wd-toggle ---
  const toggleBtn = shadow.getElementById('wd-toggle');
  const panelCard = shadow.querySelector('.card');

  // Start with the panel hidden; button remains visible
  panelCard.classList.add('is-hidden');

  if (toggleBtn && panelCard) {
    toggleBtn.addEventListener('click', () => {
      panelCard.classList.toggle('is-hidden');
    });
  } else {
    console.warn('[Workday Course Extractor] toggle or card not found in panel.html');
  }


  // ===== Panel controller: storage → table =====
  const $ = (id) => shadow.getElementById(id);

  const tbody      = $('wd-tbody');
  const searchEl   = $('wd-search');
  const countEl    = $('wd-count');
  const btnRefresh = $('wd-refresh');
  const btnExport  = $('wd-export');

  let allRows = [];
  let viewRows = [];
  let sortKey = 'code';
  let sortDir = 1; // 1 asc, -1 desc

  const norm = (s) => String(s ?? '').toLowerCase();
  const esc  = (s) => String(s ?? '').replace(/[&<>"']/g, m => (
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])
  ));

  function resolveKey(r, key) {
    if (key === 'meeting') {
      const m = r.meetings?.[0] || {};
      const days = Array.isArray(m.days) ? m.days.join('') : (m.days || '');
      return days + (m.start || '');
    }
    if (key === 'status') return r.registrationStatus || '';
    return r[key] ?? '';
  }

  function toMeeting(r) {
    const m = r.meetings?.[0] || {};
    const days = Array.isArray(m.days) ? m.days.join('') : (m.days || '');
    const time = [m.start, m.end].filter(Boolean).join('–');
    const loc  = m.location || '';
    return `<span class="pill">${esc(days || '-')}</span> <span class="muted">${esc(time)}</span><br><span class="muted">${esc(loc)}</span>`;
  }

  function render() {
    const sorted = [...viewRows].sort((a,b) => {
      const av = norm(resolveKey(a, sortKey));
      const bv = norm(resolveKey(b, sortKey));
      if (av < bv) return -sortDir;
      if (av > bv) return  sortDir;
      return 0;
    });

    const html = sorted.map(r => `
      <tr>
        <td>${esc(r.code)}</td>
        <td>
          <div>${esc(r.title)}</div>
          <div class="muted">${[r.credits && `${r.credits} cr`, r.gradingBasis, r.deliveryMode].filter(Boolean).join(' · ')}</div>
        </td>
        <td>${esc(r.section)}</td>
        <td>${esc(r.instructor)}</td>
        <td>${toMeeting(r)}</td>
        <td>${esc(r.registrationStatus || '')}</td>
      </tr>
    `).join('');

    tbody.innerHTML = html || `<tr><td colspan="6" class="muted">No data yet</td></tr>`;
    countEl.textContent = `${viewRows.length} course${viewRows.length === 1 ? '' : 's'}`;
  }

  function applyFilter(q) {
    const needle = norm(q);
    viewRows = !needle ? [...allRows] : allRows.filter(r => {
      const hay = [
        r.code, r.title, r.section, r.instructor, r.registrationStatus,
        r.instructionalFormat, r.deliveryMode, r.meetings?.[0]?.location
      ].map(x => norm(x)).join(' ');
      return hay.includes(needle);
    });
    render();
  }

  async function loadFromStorage() {
    try {
      const { courses = [] } = await chrome.storage.local.get('courses');
      allRows = Array.isArray(courses) ? courses : [];
      viewRows = [...allRows];
      applyFilter(searchEl?.value || '');
    } catch (e) {
      console.error('[Workday Course Extractor] read storage failed:', e);
    }
  }

  function toCSV(rows) {
    if (!rows?.length) return '';
    const headers = [
      'code','title','section','credits','gradingBasis','registrationStatus',
      'instructionalFormat','deliveryMode','instructor','startDate','endDate',
      'meeting_days','meeting_start','meeting_end','meeting_location'
    ];
    const q = (v) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const lines = [headers.map(q).join(',')];
    for (const r of rows) {
      const m = r.meetings?.[0] || {};
      lines.push([
        r.code, r.title, r.section, r.credits, r.gradingBasis, r.registrationStatus,
        r.instructionalFormat, r.deliveryMode, r.instructor, r.startDate, r.endDate,
        (m.days || []).join(' '), m.start || '', m.end || '', m.location || ''
      ].map(q).join(','));
    }
    return lines.join('\r\n');
  }

  // UI events
  if (searchEl)   searchEl.addEventListener('input', (e) => applyFilter(e.target.value));
  if (btnRefresh) btnRefresh.addEventListener('click', loadFromStorage);
  if (btnExport)  btnExport.addEventListener('click', () => {
    const csv = toCSV(viewRows);
    if (!csv) return alert('No rows to export.');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `workday-courses-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  // Sort on header click
  shadow.querySelectorAll('th[data-k]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.getAttribute('data-k');
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; }
      render();
    });
  });

  // React to extractor updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.courses) {
      allRows = Array.isArray(changes.courses.newValue) ? changes.courses.newValue : [];
      applyFilter(searchEl?.value || '');
    }
  });

  // Initial paint
  loadFromStorage();
}
