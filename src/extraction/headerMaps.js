import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("headerMaps");

export const normalizeText = (s) =>
  String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function getHeaderKey(el) {
  const a = el?.getAttribute?.("data-automation-id") || "";
  const m = a.match(/^columnHeader(\d+\.\d+)$/);
  return m ? m[1] : null; // "252.9"
}

export function buildHeaderMaps(gridRoot) {
  const headerEls = Array.from(gridRoot.querySelectorAll('th[data-automation-id^="columnHeader"]'));

  debug.log({ id: "buildHeaderMaps.headers" }, "Header elements found:", headerEls.length);

  const headers = headerEls
    .map((el, pos) => {
      const text = getHeaderText(el);
      const key = getHeaderKey(el); // <-- "252.9"
      return { el, pos, key, text, norm: normalizeText(text) };
    })
    .filter((h) => h.text);

  debug.log(
    { id: "buildHeaderMaps.parsedHeaders" },
    "Parsed headers:",
    headers.map((h) => ({ pos: h.pos, key: h.key, text: h.text, norm: h.norm }))
  );

  function findHeader(needles) {
    const ns = needles.map(normalizeText);
    let hit = headers.find((h) => ns.includes(h.norm));
    if (hit) return hit;
    hit = headers.find((h) => ns.some((n) => h.norm.includes(n)));
    return hit || null;
  }

  const KEYS = {
    instructor: ["instructor", "instructors"],
    meeting: ["meeting patterns", "meeting pattern"],
    deliveryMode: ["delivery mode"],
    title: ["title", "course listing"],
    section: ["section"],
    instructionalFormat: ["instructional format"],
    startDate: ["start date", "start"],
  };

  const colMap = {};
  const posMap = {};

  for (const [key, needles] of Object.entries(KEYS)) {
    const hit = findHeader(needles);
    colMap[key] = hit ? hit.key : null; // <-- store "252.9"
    posMap[key] = hit ? hit.pos : -1;

    debug.log({ id: "buildHeaderMaps.map" }, "Mapped header:", {
      key,
      needles,
      hit: hit ? { pos: hit.pos, colKey: hit.key, text: hit.text } : null,
    });
  }

  return { colMap, posMap };
}

export function getHeaderText(headerEl) {
  if (!headerEl) return "";

  const btn = headerEl.querySelector("button[title]");
  if (btn) return (btn.getAttribute("title") || "").trim();

  return (headerEl.textContent || "").trim();
}
