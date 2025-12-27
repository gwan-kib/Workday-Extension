/* Parse the Workday "promptOption" section link string. */
export function parseSectionLinkString(input) {
    let str = String(input || "").replace(/\u00A0/g, " ").trim();

    if (!str)
        return null;

    // keep ALL lines; Workday wraps titles with \n
    str = str.replace(/\s*\n\s*/g, " ").trim();

    // REQUIRED pattern:
    const m = str.match(/^\s*([A-Z][A-Z0-9_]*\s*\d{3}[A-Z]?)\s*-\s*(.+?)\s*$/);
    if (!m)
        return null;

    const baseCode = m[1].trim(); // "COSC_O 222"
    const rest = m[2].trim();     // "L2D - Data Structures" or "101 - Data Structures"

    // Split rest into section token + title
    const parts = rest.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);

    let sectionToken = "";
    let parsedTitle = "";

    sectionToken = parts[0];
    parsedTitle = parts.slice(1).join(" - ").trim();

    parsedTitle = parsedTitle.replace(/\s*:\s*/g, ":\n");

    return {
      code: baseCode,
      section_number: sectionToken,
      title: parsedTitle,
      full: str,
    };
}

export function guessClassCode(text) {
    const m = String(text || "").match(/[A-Z][A-Z0-9_]*\s*\d{2,3}[A-Z]?/);
    
    return m ? m[0].replace(/\s+/g, " ").trim() : "";
}