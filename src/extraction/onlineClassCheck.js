import { debugFor } from "../utilities/debugTool.js";

const debug = debugFor("onlineClassCheck");

export function onlineClassCheck(deliveryModeCellEl) {
  if (!deliveryModeCellEl) {
    debug.log({ id: "onlineClassCheck.missing" }, "No delivery mode cell provided");
    return false;
  }

  const txt = (deliveryModeCellEl.innerText || deliveryModeCellEl.textContent || "").trim();
  if (/online learning/i.test(txt)) {
    debug.log({ id: "onlineClassCheck.match.direct" }, "Matched online learning from cell text", txt);
    return true;
  }

  const prompts = Array.from(deliveryModeCellEl.querySelectorAll('[data-automation-id="promptOption"]'));

  const matched = prompts.some((el) => {
    const label = (el.getAttribute("data-automation-label") || el.getAttribute("title") || el.textContent || "").trim();
    return /online learning/i.test(label);
  });

  debug.log({ id: "onlineClassCheck.match.prompts" }, "Checked prompt options for online learning", {
    promptCount: prompts.length,
    matched,
  });

  return matched;
}
