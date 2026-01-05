import { STATE } from "../core/state";

const DAY_CODES = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
};

const DATE_RANGE_REGEX = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const TIME_RANGE_REGEX = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i;
const DAY_REGEX = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g;

const pad = (value) => String(value).padStart(2, "0");

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}${month}${day}`;
};

const formatDateTime = (date) => {
  const datePart = formatDate(date);
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${datePart}T${hours}${minutes}00`;
};

const parseTime = (hoursToken, minutesToken, periodToken) => {
  let hours = Number.parseInt(hoursToken, 10);
  const minutes = Number.parseInt(minutesToken, 10);
  const period = periodToken.toLowerCase();

  if (period === "p" && hours !== 12) hours += 12;
  if (period === "a" && hours === 12) hours = 0;

  return { hours, minutes };
};

const parseMeetingLine = (line) => {
  const dateMatch = String(line || "").match(DATE_RANGE_REGEX);
  const timeMatch = String(line || "").match(TIME_RANGE_REGEX);
  const days = String(line || "").match(DAY_REGEX) || [];

  if (!dateMatch || !timeMatch || !days.length) return null;

  const startDate = dateMatch[1];
  const endDate = dateMatch[2];

  const startTime = parseTime(timeMatch[1], timeMatch[2], timeMatch[3]);
  const endTime = parseTime(timeMatch[4], timeMatch[5], timeMatch[6]);

  const uniqueDays = [...new Set(days.map((day) => DAY_CODES[day]).filter(Boolean))];

  return {
    startDate,
    endDate,
    days: uniqueDays,
    startTime,
    endTime,
  };
};

const extractLocation = (line) => {
  const parts = String(line || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const locationPart = parts.find((part) => /\([A-Z]{2,}\)/.test(part));
  if (locationPart) return locationPart;

  const onlinePart = parts.find((part) => /online/i.test(part));
  if (onlinePart) return onlinePart;

  return "";
};

const findFirstOccurrence = (startDate, dayCodes) => {
  const start = new Date(`${startDate}T00:00:00`);
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const code = Object.values(DAY_CODES)[date.getDay() === 0 ? 6 : date.getDay() - 1];
    if (dayCodes.includes(code)) return date;
  }
  return start;
};

const buildEvent = (course, line) => {
  const parsed = parseMeetingLine(line);
  if (!parsed) return null;

  const firstDate = findFirstOccurrence(parsed.startDate, parsed.days);
  const startDate = new Date(firstDate);
  startDate.setHours(parsed.startTime.hours, parsed.startTime.minutes, 0, 0);

  const endDate = new Date(firstDate);
  endDate.setHours(parsed.endTime.hours, parsed.endTime.minutes, 0, 0);

  const summaryParts = [course.code, course.title].filter(Boolean);
  const descriptionLines = [
    course.title ? `Title: ${course.title}` : null,
    course.code ? `Code: ${course.code}` : null,
    course.section_number ? `Section: ${course.section_number}` : null,
    course.instructor ? `Instructor: ${course.instructor}` : null,
    course.instructionalFormat ? `Format: ${course.instructionalFormat}` : null,
    course.meeting ? `Meeting: ${course.meeting}` : null,
  ].filter(Boolean);

  const untilDate = `${parsed.endDate.replace(/-/g, "")}T235959`;

  return {
    uid: `${course.code || "course"}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    summary: summaryParts.join(" - ") || "Scheduled Course",
    description: descriptionLines.join("\\n"),
    location: extractLocation(line),
    dtstart: formatDateTime(startDate),
    dtend: formatDateTime(endDate),
    rrule: `FREQ=WEEKLY;BYDAY=${parsed.days.join(",")};UNTIL=${untilDate}`,
  };
};

const buildICS = (courses) => {
  const events = [];

  courses.forEach((course) => {
    const lines = course.meetingLines?.length ? course.meetingLines : [];
    lines.forEach((line) => {
      const event = buildEvent(course, line);
      if (event) events.push(event);
    });
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Workday Extension//Schedule Export//EN",
    "CALSCALE:GREGORIAN",
  ];

  events.forEach((event) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`SUMMARY:${event.summary}`);
    if (event.description) lines.push(`DESCRIPTION:${event.description}`);
    if (event.location) lines.push(`LOCATION:${event.location}`);
    lines.push(`DTSTART:${event.dtstart}`);
    lines.push(`DTEND:${event.dtend}`);
    lines.push(`RRULE:${event.rrule}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};

export function exportICS() {
  const ics = buildICS(STATE.filtered || []);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "workday-schedule.ics";
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}