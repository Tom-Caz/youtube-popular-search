import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { API_KEY_STORAGE_KEY } from "./youtube_api";

const Options = () => {
  const [apiKey, setApiKey] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    chrome.storage.sync.get([API_KEY_STORAGE_KEY], (items) => {
      setApiKey((items[API_KEY_STORAGE_KEY] as string) ?? "");
    });
  }, []);

  const saveOptions = () => {
    chrome.storage.sync.set({ [API_KEY_STORAGE_KEY]: apiKey.trim() }, () => {
      setStatus("Saved.");
      const id = setTimeout(() => setStatus(""), 1500);
      return () => clearTimeout(id);
    });
  };

  return (
    <div style={{ fontFamily: "Roboto, Arial, sans-serif", maxWidth: 480, padding: 16 }}>
      <h2>YouTube Popular Search</h2>
      <p>
        Sorting a channel's videos by "Popular" for a specific time range (Today, This week,
        etc.) uses the YouTube Data API v3. Create a free API key in the{" "}
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
          Google Cloud Console
        </a>{" "}
        (enable "YouTube Data API v3"), then paste it below.
      </p>
      <label>
        YouTube Data API key
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          style={{ display: "block", width: "100%", marginTop: 4, marginBottom: 8, padding: 6 }}
        />
      </label>
      <button onClick={saveOptions}>Save</button>
      <span style={{ marginLeft: 8 }}>{status}</span>
      <p style={{ marginTop: 16, fontSize: 12, color: "#606060" }}>
        The free tier allows roughly 100 "Popular" lookups per day (each lookup uses about 101 of
        the default 10,000 daily quota units).
      </p>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
