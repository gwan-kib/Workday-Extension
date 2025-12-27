export function extractInstructorNamesFromCell(instructorEl) {
    if (!instructorEl)
        return "";

    const items = Array.from(instructorEl.querySelectorAll('[data-automation-id="menuItem"][aria-label]'))
      .map((el) => (el.getAttribute("aria-label") || "").trim())
      .filter(Boolean);

    const looksLikeDateOrMeeting = (s) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) ||
      /\b\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}\b/.test(s) ||
      /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(s) ||
      /\b\d{1,2}:\d{2}\b/.test(s);

    const names = items.filter((s) => !looksLikeDateOrMeeting(s));
    if (names.length)
        return names.join(", ");

    const prompt = instructorEl.querySelector('[data-automation-id="promptOption"]');
    const txt = (
      (prompt && (prompt.getAttribute("data-automation-label") || prompt.getAttribute("title") || prompt.textContent)) ||
      instructorEl.textContent ||
      ""
    ).trim();

    return looksLikeDateOrMeeting(txt) ? "" : txt;
}