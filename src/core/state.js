export const STATE = {
  // list of courses extracted from workday
  courses: [],

  // list of filtered courses, used for seaching and sorting
  filtered: [],

  // list of user saved schedules
  savedSchedules: [],

  // tracks current sorting state, key: field name, dir: 1 ascending, -1 descending eg. STATE.sort = { key: "startTime", dir: -1 };
  sort: { key: null, dir: 1 },

  // tracks viewing state, panel: current extension page, semester: current semester tab
  view: {
    panel: "list",
    semester: "first",
  },
};
