chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_WIDGET" }, () => {
    void chrome.runtime.lastError;
  });
});