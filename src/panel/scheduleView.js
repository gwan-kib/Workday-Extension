import { extractStartDate } from "../extraction/meetingPatternsInfo.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// 30-min grid so 12:30 fits naturally
const START_HOUR = 8;
const END_HOUR = 22;           // last visible hour (exclusive end)
const SLOT_MINUTES = 30;

// Build slot start times: 7:00, 7:30, 8:00, ...
const SLOTS = [];
for (let h = START_HOUR; h < END_HOUR; h++) {
  SLOTS.push(h * 60);
  SLOTS.push(h * 60 + 30);
}
SLOTS.push(END_HOUR * 60);

const DAY_REGEX = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;
const TIME_REGEX = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/gi;

const SEMESTER_MONTHS = {
  first: "09",
  second: "01",
};

function parseTimeToken(token) {
  if (!token)
    return null;

  const match = token.trim().match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i);
  if (!match)
    return null;

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const period = match[3].toLowerCase();

  if (period === "p" && hours !== 12)
    hours += 12;
  if (period === "a" && hours === 12)
    hours = 0;

  return hours * 60 + minutes;
}

function parseMeetingLine(line) {
  const days = String(line || "").match(DAY_REGEX) || [];
  const timeTokens = String(line || "").match(TIME_REGEX) || [];

  if (days.length === 0 || timeTokens.length < 2)
    return null;

  const startMinutes = parseTimeToken(timeTokens[0]);
  const endMinutes = parseTimeToken(timeTokens[1]);

  if (startMinutes == null || endMinutes == null)
    return null;

  // Handle weird cases where end < start (rare formatting issues)
  if (endMinutes <= startMinutes)
    return null;

  return {
    days: [...new Set(days)],
    startMinutes,
    endMinutes,
    timeLabel: `${timeTokens[0]} - ${timeTokens[1]}`,
  };
}

function getSemester(startDate) {
  if (!startDate)
    return null;

  const month = startDate.split("-")[1];

  if (month === SEMESTER_MONTHS.first)
    return "first";
  if (month === SEMESTER_MONTHS.second)
    return "second";

  return null;
}

function clampToGrid(minutes) {
  const min = START_HOUR * 60;
  const max = END_HOUR * 60;
  return Math.max(min, Math.min(max, minutes));
}

function snapDownToSlot(minutes) {
  return Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function snapUpToSlot(minutes) {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function slotIndexOf(minutes) {
  return SLOTS.indexOf(minutes);
}

function buildDayEvents(courses, term) {
  const eventsByDay = new Map();
  DAYS.forEach((d) => eventsByDay.set(d, []));

  // Used to prevent duplicates when meetingLines contain repeated info
  const seen = new Set();

  courses.forEach((course) => {
    const startDate = course.startDate || extractStartDate(course.meetingLines?.[0]) || "";
    const semester = getSemester(startDate);

    if (semester !== term)
      return;

    const lines = course.meetingLines?.length ? course.meetingLines : [];

    lines.forEach((line) => {
      const parsed = parseMeetingLine(line);
      if (!parsed)
        return;

      // Clamp + snap to our 30-min grid
      let startMin = clampToGrid(parsed.startMinutes);
      let endMin = clampToGrid(parsed.endMinutes);

      startMin = snapDownToSlot(startMin);
      endMin = snapUpToSlot(endMin);

      const startIdx = slotIndexOf(startMin);
      const endIdx = slotIndexOf(endMin);

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx)
        return;

      const rowSpan = endIdx - startIdx;

      parsed.days.forEach((day) => {
        if (!eventsByDay.has(day))
          return;

        const key = [
          day,
          course.code || "",
          course.title || "",
          parsed.timeLabel,
          startIdx,
          rowSpan,
        ].join("|");

        if (seen.has(key))
          return;
        seen.add(key);

        eventsByDay.get(day).push({
          code: course.code || "",
          title: course.title || "",
          timeLabel: parsed.timeLabel,
          rowStart: startIdx,
          rowSpan,
        });
      });
    });
  });

  // Sort each day: earliest first
  DAYS.forEach((day) => {
    eventsByDay.get(day).sort((a, b) => a.rowStart - b.rowStart);
  });

  return eventsByDay;
}

function formatSlotLabel(minutes) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;

  // If you want 12-hour labels, tell me — for now match your style like "12:00"
  const hh = String(h24);
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildScheduleTable(eventsByDay) {
  const table = document.createElement("table");
  table.className = "schedule-table";

  // Track which grid cells are "covered" by a rowspan event so we skip rendering them
  // key = `${day}|${rowIndex}`
  const covered = new Set();

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headRow.innerHTML = `
    <th class="schedule-time">Time</th>
    ${DAYS.map((day) => `<th>${day}</th>`).join("")}
  `;

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let r = 0; r < SLOTS.length; r++) {
    const row = document.createElement("tr");

    // Time label column
    const timeTd = document.createElement("td");
    timeTd.className = "schedule-time";
    timeTd.textContent = formatSlotLabel(SLOTS[r]);
    row.appendChild(timeTd);

    // Day columns
    DAYS.forEach((day) => {
      const coverKey = `${day}|${r}`;

      // If an earlier rowSpan covers this row, skip creating a cell
      if (covered.has(coverKey))
        return;

      const td = document.createElement("td");
      td.className = "schedule-cell";

      // Find events that start at this exact row for this day
      const starters = eventsByDay.get(day).filter((ev) => ev.rowStart === r);

      if (starters.length > 0) {
        // If multiple events start at the same time, we still have to stack them.
        // But this is now a real conflict (same start time), not the old "everything in one hour" bug.
        // We'll render each one as its own block inside the rowspan cell.

        // Use the max span so the cell rowspan covers the full time block.
        // If you want separate columns for overlaps later, that’s a different layout.
        const maxSpan = Math.max(...starters.map((ev) => ev.rowSpan));
        td.rowSpan = maxSpan;

        // Mark covered rows so we don't render duplicate cells underneath
        for (let k = 1; k < maxSpan; k++) {
          covered.add(`${day}|${r + k}`);
        }

        starters.forEach((ev) => {
          const wrap = document.createElement("div");
          wrap.className = "schedule-entry";
          wrap.innerHTML = `
            <div class="schedule-entry-title">${ev.code || ev.title}</div>
            <div class="schedule-entry-time">${ev.timeLabel}</div>
          `;
          td.appendChild(wrap);
        });
      }

      row.appendChild(td);
    });

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  return table;
}

export function renderSchedule(ctx, courses, term) {
  if (!ctx.scheduleGrid)
    return;

  ctx.scheduleGrid.innerHTML = "";

  const eventsByDay = buildDayEvents(courses, term);
  ctx.scheduleGrid.appendChild(buildScheduleTable(eventsByDay));
}
