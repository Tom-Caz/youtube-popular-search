import React from "react";
import { createRoot } from "react-dom/client";

const Popup = () => {
  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div style={{ fontFamily: "Roboto, Arial, sans-serif", width: 260, padding: 16 }}>
      <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Popular by Date for YouTube</h2>
      <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: "#606060" }}>
        Adds a time-range dropdown (This week/This month/This year/All time) to YouTube's
        "Popular" sort on channel pages. Add a YouTube Data API key in settings to enable it.
      </p>
      <button onClick={openOptions} style={{ width: "100%", padding: 8 }}>
        Open Settings
      </button>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
