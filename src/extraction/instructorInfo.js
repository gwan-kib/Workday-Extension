export function extractInstructorNamesFromCell(instructorEl) {
    if (!instructorEl) {
      console.log("failed extracting instuctor name:", instructorEl);
      return "";
    }
    
    const prompt = instructorEl.querySelector('[data-automation-id="promptOption"]');
    const txt = (
      (prompt && (prompt.getAttribute("data-automation-label") || prompt.getAttribute("title") || prompt.textContent)) ||
      instructorEl.textContent || "").trim();
      console.log("sucsessfully extracted instuctor name:", instructorEl, txt);
    return txt;
}