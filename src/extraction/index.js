// src/extraction/index.js
// Purpose: single import entry point for the rest of the app.

export { extractCoursesData } from "./extractCourses.js";
export { extractFromRow } from "./extractCourses.js";

export { findWorkdayGrid, buildHeaderMaps, normalizeText, getHeaderText } from "./grid.js";

export { createRowCellReader } from "./rowCellReader.js";

export {
  extractMeetingLines,
  extractMeetingLinesFromCell,
  extractMeetingLinesFromRow,
  formatMeetingLineForPanel,
  normalizeMeetingPatternsText,
  extractStartDate,
} from "./parsers/meetingPatternsInfo.js";

export { extractInstructorNamesFromCell } from "./parsers/instructorInfo.js";

export { parseSectionLinkString, guessClassCode } from "./parsers/sectionLinkInfo.js";
