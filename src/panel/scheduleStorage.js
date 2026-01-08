import { debugFor } from "../utilities/debugTool";
const debug = debugFor("scheduleStorage");

const STORAGE_KEY = "wdSavedSchedules";
const MAX_SCHEDULES = 6;

const cloneCourses = (courses) => {
  if (typeof structuredClone === "function") {
    return structuredClone(courses);
  }
  return JSON.parse(JSON.stringify(courses || []));
};

const sanitizeSchedules = (schedules) => {
  if (!Array.isArray(schedules)) return [];
  return schedules
    .filter((schedule) => schedule && Array.isArray(schedule.courses))
    .map((schedule) => ({
      id: schedule.id,
      name: schedule.name || "Untitled",
      savedAt: schedule.savedAt || new Date().toISOString(),
      courses: schedule.courses,
    }));
};

const useChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

export async function loadSavedSchedules() {
  debug.log("Loading saved schedules...");
  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const sanitized = sanitizeSchedules(result?.[STORAGE_KEY] || []);
        debug.log("Schedules loaded from Chrome Storage:", sanitized);
        resolve(sanitized);
      });
    });
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      debug.log("No schedules found in localStorage.");
      return [];
    }
    const sanitized = sanitizeSchedules(JSON.parse(raw));
    debug.log("Schedules loaded from localStorage:", sanitized);
    return sanitized;
  } catch (error) {
    console.warn("[WD] Failed to load saved schedules", error);
    debug.error("Error loading schedules from localStorage:", error);
    return [];
  }
}

export async function persistSavedSchedules(schedules) {
  const sanitized = sanitizeSchedules(schedules);
  debug.log("Persisting saved schedules:", sanitized);
  if (useChromeStorage) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: sanitized }, () => {
        debug.log("Schedules saved to Chrome Storage.");
        resolve();
      });
    });
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    debug.log("Schedules saved to localStorage.");
  } catch (error) {
    console.warn("[WD] Failed to save schedules", error);
    debug.error("Error saving schedules to localStorage:", error);
  }
}

export function createScheduleSnapshot(name, courses) {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const snapshot = {
    id,
    name: name || "Untitled",
    savedAt: new Date().toISOString(),
    courses: cloneCourses(courses || []),
  };
  debug.log("Created schedule snapshot:", snapshot);
  return snapshot;
}

export function formatScheduleMeta(schedule) {
  const count = schedule.courses?.length || 0;
  const savedDate = new Date(schedule.savedAt);
  const dateLabel = Number.isNaN(savedDate.getTime())
    ? schedule.savedAt
    : savedDate.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
  return `${count} courses · Saved ${dateLabel}`;
}

export function renderSavedSchedules(ctx, schedules) {
  debug.log("Rendering saved schedules:", schedules);
  if (!ctx.savedMenu) return;
  ctx.savedMenu.innerHTML = "";

  if (!schedules.length) {
    const empty = document.createElement("div");
    empty.className = "schedule-saved-empty";
    empty.textContent = "No saved schedules yet.";
    ctx.savedMenu.appendChild(empty);
    debug.log("No saved schedules to render.");
    return;
  }

  schedules.forEach((schedule) => {
    const card = document.createElement("div");
    card.className = "schedule-saved-card";
    card.dataset.id = schedule.id;

    const header = document.createElement("div");
    header.className = "schedule-saved-card-header";

    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "schedule-saved-title";
    title.textContent = schedule.name;

    const meta = document.createElement("div");
    meta.className = "schedule-saved-meta";
    meta.textContent = formatScheduleMeta(schedule);

    info.appendChild(title);
    info.appendChild(meta);
    header.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "schedule-saved-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "schedule-saved-action";
    loadButton.dataset.action = "load";
    loadButton.textContent = "Load";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "schedule-saved-action delete";
    deleteButton.dataset.action = "delete";
    deleteButton.textContent = "Delete";

    actions.appendChild(loadButton);
    actions.appendChild(deleteButton);

    card.appendChild(header);
    card.appendChild(actions);
    ctx.savedMenu.appendChild(card);
    debug.log("Rendered schedule card:", schedule);
  });
}

export function canSaveMoreSchedules(schedules) {
  debug.log("Checking if more schedules can be saved. Current count:", schedules.length);
  return schedules.length < MAX_SCHEDULES;
}

export function getMaxScheduleCount() {
  return MAX_SCHEDULES;
}
