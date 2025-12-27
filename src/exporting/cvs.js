import { STATE } from "../core/state"

export const csvEscape = (v) => {
    if (v == null)
        return "";

    const s = String(v);
    
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
  
export const toCSV = (rows, headers) => {
    const head = headers.map(csvEscape).join(",");
    const body = rows
      .map((r) => headers.map((h) => csvEscape(r[h] ?? "")).join(","))
      .join("\n");

    return head + "\n" + body;
};

export function exportCSV() {
    const headers = ["code", "title", "section_number", "instructor", "meeting", "instructionalFormat"];
    const csv = toCSV(STATE.filtered, headers);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "captured-courses.csv";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
}