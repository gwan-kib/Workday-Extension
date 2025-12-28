import { $$ } from "../utilities/dom"
import { buildHeaderMaps, getColIndex } from "./headerMaps.js"
import { parseSectionLinkString, guessClassCode } from "./sectionLinkInfo.js"
import { extractMeetingLinesFromCell, extractMeetingLinesFromRow, formatMeetingLineForPanel, normalizeMeetingPatternsText } from "./meetingPatternsInfo.js"
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

    // map row cells by aria-colindex (preferred)
    const cellByCol = new Map();
    cells.forEach((cell, i) => {
      const col = getColIndex(cell) ?? (i + 1);

      if (!cellByCol.has(col))
        cellByCol.set(col, cell);
    });

    const getCellEl = (key) => {
      const col = colMap[key];
      if (col != null && cellByCol.has(col))
        return cellByCol.get(col);

      const pos = posMap[key];
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
    const instructorCell = readByKey("instructor");
    const instructionalFormatCell = readByKey("instructionalFormat"); // ✅ renamed

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
    let instructor = "";

    let instructorEl =
      (() => {
        const instructorCol = colMap.instructor;
        if (instructorCol != null && cellByCol.has(instructorCol))
            return cellByCol.get(instructorCol);

        if (posMap.instructor != null && posMap.instructor >= 0 && posMap.instructor < cells.length)
          return cells[posMap.instructor];

        return null;
      })();

    const looksLikeDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
    const looksLikeName = (s) => /^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/.test(String(s || "").trim());


    if (isLab || isSeminar) {
      instructor = "N/A";
    } else {
      instructor = extractInstructorNamesFromCell(instructorEl) || (instructorCell || "").trim();
      if (!instructor || looksLikeDate(instructor)) {
        for (const cell of cells) {
          const fallback = extractInstructorNamesFromCell(cell) || (cell.innerText || "").trim();
          if (looksLikeName(fallback)) {
            instructor = fallback;
            break;
          }
        }
      }
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

    // Final title fallback
    if (!title && sectionLinkString) {
      const idx = sectionLinkString.indexOf(" - ");
      if (idx >= 0)
        title = sectionLinkString.slice(idx + 3).trim();
    }

    // ---------- Sanity swap ----------
    if (looksLikeDate(instructor) && looksLikeName(meeting)) {
      const tmp = instructor;
      instructor = meeting;
      meeting = tmp;
    }

    return {
      code,
      title,
      section_number,
      instructor,
      meeting: normalizeMeetingPatternsText(meeting),
      instructionalFormat, // ✅ renamed field
      isLab,
      isSeminar,
    };
}