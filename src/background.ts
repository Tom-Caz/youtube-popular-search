chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_OPTIONS_PAGE") {
    chrome.runtime.openOptionsPage();
  }
});

export {};
