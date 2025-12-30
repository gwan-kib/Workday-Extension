export function extractMeetingLinesFromCell(meetingEl) {
    if (!meetingEl) {
      console.log("extractMeetingLinesFromCell failed 1");
      return [];
    }

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

export function extractMeetingLinesFromRow(rowEl) {
    if (!rowEl)
        return [];

    const items = Array.from(rowEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'));
    const lines = items
        .map((el) => (el.getAttribute("aria-label") || "").trim())
        .filter(Boolean);

    const DATE_RE = /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/;
    const TIME_RE = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/i;
    const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;

    return lines.filter((s) => DATE_RE.test(s) && TIME_RE.test(s) && DAY_RE.test(s));
}

export function formatMeetingLineForPanel(line) {
    const parts = String(line || "")
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);

    const dayPartRaw = parts.find((p) => /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(p)) || "";
    const dayPart = dayPartRaw.split(/\s+/).join(" / ");

    const timePart = parts.find((p) => /\d{1,2}:\d{2}/.test(p) && /-/.test(p)) || "";
    const buildingPart = parts.find((p) => /\([A-Z]{2,}\)/.test(p)) || ""; // "Library (LIB)"
    const floorPart = parts.find((p) => /^Floor\b/i.test(p)) || "";
const roomPart  = parts.find((p) => /^(Room|Rm)\b/i.test(p)) || "";

    return {
      days: dayPart,
      time: timePart,
      location: [buildingPart, [floorPart, roomPart].join(" | ")].filter(Boolean).join("\n"),
    };
}

export function normalizeMeetingPatternsText(text) {
    // preserve line breaks, normalize each line
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
}

export function extractStartDate(line) {
    const match = String(line || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
    return match ? match[1] : "";
}