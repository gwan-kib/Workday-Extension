import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("meetingPatternsInfo");

export function extractMeetingLinesFromCell(meetingEl) {
  if (!meetingEl) {
    debug.log({ id: "extractMeetingLinesFromCell.missing" }, "No meeting element provided");
    return [];
  }

  // BEST SOURCE: menu items expose full meeting strings in aria-label
  const menuItems = Array.from(meetingEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'));

  let lines = menuItems.map((el) => (el.getAttribute("aria-label") || "").trim()).filter(Boolean);

  debug.log({ id: "extractMeetingLinesFromCell.menuItems" }, "Menu item lines:", { count: lines.length });

  // fallback: promptOption text (sometimes present)
  if (!lines.length) {
    const prompts = Array.from(meetingEl.querySelectorAll('[data-automation-id="promptOption"]'));
    lines = prompts
      .map((el) =>
        (el.getAttribute("data-automation-label") || el.getAttribute("title") || el.textContent || "").trim()
      )
      .filter(Boolean);

    debug.log({ id: "extractMeetingLinesFromCell.prompts" }, "PromptOption lines (fallback):", { count: lines.length });
  }

  // final fallback: innerText split
  if (!lines.length) {
    lines = String(meetingEl.innerText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    debug.log({ id: "extractMeetingLinesFromCell.innerText" }, "InnerText lines (final fallback):", {
      count: lines.length,
    });
  }

  // only keep real meeting sentences
  const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
  const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
  const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

  const filtered = lines.filter((s) => DATE_RE.test(s) && TIME_RE.test(s) && DAY_RE.test(s));

  debug.log({ id: "extractMeetingLinesFromCell.filtered" }, "Filtered meeting lines:", {
    before: lines.length,
    after: filtered.length,
  });

  return filtered;
}

export function extractMeetingLinesFromRow(rowEl) {
  if (!rowEl) return [];

  const items = Array.from(rowEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'));
  const lines = items.map((el) => (el.getAttribute("aria-label") || "").trim()).filter(Boolean);

  debug.log({ id: "extractMeetingLinesFromRow.items" }, "Row menu item lines:", { count: lines.length });

  const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
  const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
  const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

  const filtered = lines.filter((s) => DATE_RE.test(s) && TIME_RE.test(s) && DAY_RE.test(s));

  debug.log({ id: "extractMeetingLinesFromRow.filtered" }, "Filtered row meeting lines:", {
    before: lines.length,
    after: filtered.length,
  });

  return filtered;
}

export function formatMeetingLineForPanel(line) {
  const raw = String(line || "");

  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  const dayPartRaw = parts.find((p) => /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(p)) || "";
  const dayPart = dayPartRaw.split(/\s+/).join(" / ");

  const timePart = parts.find((p) => /\d{1,2}:\d{2}/.test(p) && /-/.test(p)) || "";

  const buildingPart = parts.find((p) => /\([A-Z]{2,}\)/.test(p)) || "";

  // ✅ find Floor/Room anywhere in the full string (handles "Floor 3", "Floor: 3", "Rm 210", etc.)
  const floorMatch = raw.match(/\bfloor\b\s*[:\-]?\s*(-?[A-Za-z0-9]+)/i);
  const roomMatch = raw.match(/\b(room|rm)\b\s*[:\-]?\s*([A-Za-z0-9]+)/i);

  const floorPart = floorMatch ? `Floor: ${floorMatch[1]}` : "";
  const roomPart = roomMatch ? `Room: ${roomMatch[2]}` : "";

  const formatted = {
    days: dayPart,
    time: timePart,
    location: [buildingPart, [floorPart, roomPart].filter(Boolean).join(" | ")].filter(Boolean).join("\n"),
  };

  debug.log({ id: "formatMeetingLineForPanel" }, "Formatted meeting line:", { raw, formatted });

  return formatted;
}

export function normalizeMeetingPatternsText(text) {
  // preserve line breaks, normalize each line
  const normalized = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  debug.log({ id: "normalizeMeetingPatternsText" }, "Normalized meeting patterns text:", {
    beforeLen: String(text || "").length,
    afterLen: normalized.length,
  });

  return normalized;
}

export function extractStartDate(line) {
  const match = String(line || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const out = match ? match[1] : "";

  debug.log({ id: "extractStartDate" }, "Extracted start date:", { line, out });

  return out;
}
