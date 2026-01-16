// src/extraction/courseExtraction.js
import { $$ } from "../utilities/dom.js";
import { debugFor } from "../utilities/debugTool.js";
import { buildHeaderMaps, findWorkdayGrid } from "./grid.js";
import { parseSectionLinkString } from "./parsers/sectionLinkInfo.js";
import {
  extractMeetingLinesFromCell,
  formatMeetingLineForPanel,
  normalizeMeetingPatternsText,
  extractStartDate,
  isOnlineDelivery,
} from "./parsers/meetingPatternsInfo.js";
import { createRowCellReader } from "./rowCellReader.js";

const debug = debugFor("courseExtraction");

// extracts course data from the table rows
export async function extractCoursesData() {
  debug.log({ id: "extractCoursesData.start" }, "Starting course extraction");

  const found = findWorkdayGrid();
  let courses = [];

  debug.log(
    { id: "extractCoursesData.tables" },
    "findWorkdayGrid() result:",
    found
      ? {
          hasRoot: !!found.root,
          rowCount: found.rows?.length || 0,
        }
      : null
  );

  // if tables exist, build position based header maps
  if (found) {
    const headerMaps = buildHeaderMaps(found.root);

    debug.log({ id: "extractCoursesData.headerMaps" }, "Built header maps:", headerMaps);

    for (const row of found.rows) {
      const c = extractFromRow(row, headerMaps);
      if (c && (c.code || c.title) && Object.values(c).join("").trim()) courses.push(c);
    }
  }

  // removes duplcicate courses
  const unique = removeDuplicateCourses(courses);

  debug.log({ id: "extractCoursesData.done" }, "Extraction complete:", {
    total: courses.length,
    unique: unique.length,
  });

  return unique; // returns a list of all unique course objects
}

function removeDuplicateCourses(allCourses) {
  const key = (course) => [course.code, course.title, course.section_number].join("|").toLowerCase();
  const seen = new Set();
  const uniqueCourses = [];

  // only add course to seen list if its not already there
  for (const course of allCourses) {
    const courseKey = key(course);
    if (!seen.has(courseKey)) {
      seen.add(courseKey);
      uniqueCourses.push(course);
    }
  }

  debug.log({ id: "removeDuplicateCourses" }, "Deduped courses:", {
    allCourses: allCourses,
    UniqueCourses: uniqueCourses,
    removed: allCourses.length - uniqueCourses.length,
  });

  return uniqueCourses; // returns a list of all unique course objects
}

// takes table row and turns it into a single course object
export function extractFromRow(row, headerMaps) {
  const { getCellByHeader, readCellTextByHeader } = createRowCellReader(row, headerMaps);

  debug.log({ id: "extractFromRow.start" }, "Extracting row");

  // a list of all the links in the row
  const allLinksInRow = $$(row, '[data-automation-id="promptOption"]');

  // returns first link to match expected section link format
  const sectionLinkEl = allLinksInRow.find((el) => {
    const text =
      el.getAttribute("data-automation-label") ||
      el.getAttribute("title") ||
      el.getAttribute("aria-label") ||
      el.textContent ||
      "";
    return /^[A-Z][A-Z0-9_]*\s*\d{2,3}-/.test(text);
  });

  // finds text in the section link element
  const sectionLinkText =
    (sectionLinkEl &&
      (sectionLinkEl.getAttribute("data-automation-label") ||
        sectionLinkEl.getAttribute("title") ||
        sectionLinkEl.getAttribute("aria-label") ||
        sectionLinkEl.textContent)) ||
    "";

  // if there are no links in the row, skip that row
  const sectionDetails = parseSectionLinkString(sectionLinkText);
  if (!sectionDetails) {
    debug.warn({ id: "extractFromRow.skip" }, "Skipping row: no parsable promptOption", {
      promptOptions: allLinksInRow.length,
      sectionLinkString: sectionLinkText,
    });
    return null;
  }

  debug.log({ id: "extractFromRow.sectionLink" }, "Section link:", {
    promptOptions: allLinksInRow.length,
    hasMatch: !!sectionLinkEl,
    sectionLinkString: sectionLinkText,
  });

  const instructionalFormatText = readCellTextByHeader("instructionalFormat");
  const startDateText = readCellTextByHeader("startDate");

  // extracting infomation from the section link text
  const code = sectionDetails.code;
  const title = sectionDetails.title;
  const section_number = sectionDetails.section_number;

  debug.log({ id: "extractFromRow.coreParse" }, "Core parse result:", {
    code,
    title,
    section_number,
  });

  // determine whether this row is for a course, lab, seminar, or discussion
  const labLike = (s) => /\b(laboratory)\b/i.test(String(s || ""));
  const seminarLike = (s) => /\bseminar\b/i.test(String(s || ""));
  const discussionLike = (s) => /\bdiscussion\b/i.test(String(s || ""));

  const isLab = labLike(instructionalFormatText);
  const isSeminar = seminarLike(instructionalFormatText);
  const isDiscussion = discussionLike(instructionalFormatText);

  // if row is a lab or seminar, do not set instructor
  let instructor = "N/A";

  if (!isLab && !isSeminar) {
    instructor = readCellTextByHeader("instructor");

    if (!instructor) {
      debug.warn({ id: "extractFromRow.skip" }, "Skipping row: missing instructor cell", {
        code,
        section_number,
      });
      return null;
    }
  }

  // find meeting cell
  const meetingEl = getCellByHeader("meeting");
  if (!meetingEl) {
    debug.warn({ id: "extractFromRow.skip" }, "Skipping row: missing meeting cell", {
      code,
      section_number,
    });
    return null;
  }

  // extract meeting lines from the meeting cell
  const meetingLines = extractMeetingLinesFromCell(meetingEl) || [];
  if (!meetingLines.length) {
    debug.warn({ id: "extractFromRow.skip" }, "Skipping row: no meeting lines found in meeting cell", {
      code,
      section_number,
    });
    return null;
  }

  const meetingObj = formatMeetingLineForPanel(meetingLines[0]);

  // delivery mode is OPTIONAL (some grids don't have it)
  const deliveryModeEl = getCellByHeader("deliveryMode");

  // ✅ fix: only treat as online if we can actually detect it
  const isOnline = deliveryModeEl ? isOnlineDelivery(deliveryModeEl) : false;

  if (isOnline) meetingObj.location = "Online";

  let meeting = [meetingObj.days, meetingObj.time].filter(Boolean).join(" | ");
  meeting += `\n${meetingObj.location || (isOnline ? "Online" : "")}`;

  const startDate = extractStartDate(meetingLines[0]) || extractStartDate(startDateText);

  const result = {
    code,
    title,
    section_number,
    instructor,
    meeting: normalizeMeetingPatternsText(meeting),
    instructionalFormat: (instructionalFormatText || "").trim(),
    startDate,
    meetingLines: meetingLines,
    isLab,
    isSeminar,
    isDiscussion,
  };

  debug.log({ id: "extractFromRow.result" }, "Extracted course:", {
    code: result.code,
    title: result.title,
    section_number: result.section_number,
    isLab: result.isLab,
    isSeminar: result.isSeminar,
    isDiscussion: result.isDiscussion,
    isOnline,
  });

  return result;
}
