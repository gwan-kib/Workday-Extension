import { $$ } from "../utilities/dom"
import { buildHeaderMaps } from "./headerMaps.js"
import { parseSectionLinkString, guessClassCode } from "./sectionLinkInfo.js"
import { extractMeetingLinesFromCell, extractMeetingLinesFromRow, formatMeetingLineForPanel, normalizeMeetingPatternsText, extractStartDate } from "./meetingPatternsInfo.js"
import { extractInstructorNamesFromCell } from "./instructorInfo.js"
import { onlineClassCheck } from "./onlineClassCheck.js"
import { findingTables } from "./findingTables.js"

export async function extractAllCourses() {
    const found = findingTables();
    let courses = [];

    if (found) {
      const headerMaps = buildHeaderMaps(found.root);

      for (const row of found.rows) {
        const c = extractFromRow(row, headerMaps);
        if ((c.code || c.title)
            && Object.values(c).join("").trim()) courses.push(c);
      }
    }

    return findUniqueCourses(courses);
}

function findUniqueCourses(list) {
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

export function extractFromRow(row, headerMaps) {
    const { colMap, posMap } = headerMaps;

    const cells = $$(row, "td, [role='gridcell']");
    const allText = (row.innerText || "").trim();

   // map row cells by position (1-based)
  function getCellKey(cell) {
  // looks inside the cell for the container with id like "gen-dwr-comp-252.9-640"
  const inner = cell.querySelector('[id^="gen-dwr-comp-"]');
  const id = inner?.id || "";
  const m = id.match(/^gen-dwr-comp-(\d+\.\d+)-/);
  return m ? m[1] : null; // "252.9"
}

// map row cells by Workday key (e.g., "252.9"), not by position
const cellByCol = new Map();
cells.forEach((cell) => {
  const key = getCellKey(cell);
  if (key && !cellByCol.has(key))
    cellByCol.set(key, cell);
});



   const getCellEl = (keyName) => {
  const key = colMap[keyName]; // e.g., "252.9"
  if (key != null && cellByCol.has(key))
    return cellByCol.get(key);

  const pos = posMap[keyName];
  if (pos != null && pos >= 0 && pos < cells.length)
    return cells[pos];

  return null;
};


    const readByKey = (key) => {
      const col = colMap[key];
      if (col != null && cellByCol.has(col)) {
        return (cellByCol.get(col).innerText || "").trim();
      }

      const pos = posMap[key];
      if (pos != null && pos >= 0 && pos < cells.length) {
        return (cells[pos].innerText || "").trim();
      }
      return "";
    };

    // ✅ Search the entire row for the promptOption link (most reliable)
    const allPromptOptions = $$(row, '[data-automation-id="promptOption"]');
    let sectionLinkEl = null;

    for (const el of allPromptOptions) {
      const text =
        el.getAttribute("data-automation-label") ||
        el.getAttribute("title") ||
        el.getAttribute("aria-label") ||
        el.textContent ||
        "";
      if (/^[A-Z][A-Z0-9_]*\s*\d{2,3}-/.test(text)) {
        sectionLinkEl = el;
        break;
      }
    }

    if (!sectionLinkEl && allPromptOptions.length > 0) {
      sectionLinkEl = allPromptOptions[0];
    }

    const sectionLinkString =
      (sectionLinkEl &&
        (sectionLinkEl.getAttribute("data-automation-label") ||
          sectionLinkEl.getAttribute("title") ||
          sectionLinkEl.getAttribute("aria-label") ||
          sectionLinkEl.textContent)) ||
      "";

    const titleCell = readByKey("title");
    const codeCell = readByKey("code");
    const sectCell = readByKey("section");
    const meetingCell = readByKey("meeting");
    const instructionalFormatCell = readByKey("instructionalFormat"); 
         const startDateCell = readByKey("startDate");

    // ---------- Core parse: (code + section + title) from the same string ----------
    let code = "";
    let title = titleCell || "";
    let section_number = "";

    const parsed = parseSectionLinkString(sectionLinkString);
    if (parsed) {
      code = parsed.code;
      section_number = parsed.section_number;
      title = parsed.title;
    }

    if (!code)
        code = guessClassCode(codeCell) || guessClassCode(titleCell) || guessClassCode(allText) || "";

    // ---------- Lab / Seminar detection ----------
    const labLike = (s) => /\b(lab|laboratory|labratory)\b/i.test(String(s || ""));
    const seminarLike = (s) => /\bseminar\b/i.test(String(s || ""));

    const isLab =
      labLike(instructionalFormatCell) ||
      labLike(sectCell) ||
      labLike(title) ||
      labLike(sectionLinkString) ||
      labLike(allText)

    const isSeminar =
      seminarLike(instructionalFormatCell) ||
      seminarLike(sectCell) ||
      seminarLike(title) ||
      seminarLike(sectionLinkString) ||
      seminarLike(allText)

    // ---------- Instructor ----------

    const instructorEl = getCellEl("instructor"); // uses colMap/posMap + cellByCol

    let instructor = "";

    if (isLab || isSeminar) {
      instructor = "N/A";
    } else {
      instructor =
        extractInstructorNamesFromCell(instructorEl) ||
        (readByKey("instructor") || "").trim();
    }


    // ---------- Meeting ----------
    let meeting;

    const meetingCol = colMap.meeting;
    let meetingEl = null;

    if (meetingCol != null && cellByCol.has(meetingCol)) {
      meetingEl = cellByCol.get(meetingCol);
    } else if (posMap.meeting != null && posMap.meeting >= 0 && posMap.meeting < cells.length) {
      meetingEl = cells[posMap.meeting];
    }

    let lines = meetingEl ? extractMeetingLinesFromCell(meetingEl) : [];
    if (!lines.length)
        lines = extractMeetingLinesFromRow(row);

    let meetingObj = { days: "", time: "", location: "" };
    let startDate = extractStartDate(lines[0]) || extractStartDate(startDateCell);

    if (lines.length) {
      const firstLine = lines[0];
      meetingObj = formatMeetingLineForPanel(firstLine);
    } else {
      meeting = (meetingCell || "").trim();
    }

    const deliveryModeCell = getCellEl("deliveryMode");
    const isOnlineDelivery = onlineClassCheck(deliveryModeCell);

    if (isOnlineDelivery) {
      meetingObj.location = "Online";
    }

    if (meetingObj.days || meetingObj.time || meetingObj.location) {
      meeting = [meetingObj.days, meetingObj.time].filter(Boolean).join(" | ");
      if (meetingObj.location)
        meeting += `\n${meetingObj.location}`;
      else meeting += `\nOnline`;
    } else {
      meeting = (meetingCell || "").trim();
    }

    // ---------- Instructional Format (was "status") ----------
    const instructionalFormat = (instructionalFormatCell || "").trim();

    return {
      code,
      title,
      section_number,
      instructor,
      meeting: normalizeMeetingPatternsText(meeting),
      instructionalFormat, // ✅ renamed field
            startDate,
      meetingLines: lines,
      isLab,
      isSeminar,
    };
}