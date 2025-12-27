export function onlineClassCheck(deliveryModeCellEl) {
    if (!deliveryModeCellEl) return false;

    const txt = (deliveryModeCellEl.innerText || deliveryModeCellEl.textContent || "").trim();
    if (/online learning/i.test(txt)) return true;

    const prompts = Array.from(deliveryModeCellEl.querySelectorAll('[data-automation-id="promptOption"]'));
    return prompts.some((el) => {
      const label = (el.getAttribute("data-automation-label") || el.getAttribute("title") || el.textContent || "").trim();
      return /online learning/i.test(label);
    });
  }