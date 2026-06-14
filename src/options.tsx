import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { API_KEY_STORAGE_KEY } from "./youtube_api";

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    fontFamily: '"Roboto", "Segoe UI", Arial, sans-serif',
    maxWidth: 560,
    margin: "40px auto",
    padding: "32px 40px",
    color: "#202124",
    lineHeight: 1.5,
    boxSizing: "border-box",
  },
  heading: {
    fontSize: 22,
    fontWeight: 600,
    margin: "0 0 12px",
  },
  intro: {
    fontSize: 14,
    color: "#3c4043",
    margin: "0 0 24px",
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    fontSize: 14,
    padding: "10px 12px",
    border: "1px solid #dadce0",
    borderRadius: 6,
    outline: "none",
    fontFamily: "inherit",
    minWidth: 0,
  },
  toggleButton: {
    padding: "10px 14px",
    fontSize: 13,
    border: "1px solid #dadce0",
    borderRadius: 6,
    background: "#fff",
    color: "#3c4043",
    cursor: "pointer",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "16px 0 28px",
  },
  saveButton: {
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 500,
    color: "#fff",
    background: "#1a73e8",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  status: {
    fontSize: 13,
    fontWeight: 500,
    color: "#188038",
  },
  section: {
    background: "#f8f9fa",
    border: "1px solid #e8eaed",
    borderRadius: 8,
    padding: "16px 20px",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    margin: "0 0 8px",
  },
  sectionList: {
    fontSize: 13,
    color: "#3c4043",
    margin: "0 0 12px",
    paddingLeft: 20,
  },
  sectionListItem: {
    marginBottom: 4,
  },
  quotaNote: {
    fontSize: 12.5,
    color: "#5f6368",
    margin: 0,
  },
  link: {
    color: "#1a73e8",
    textDecoration: "none",
  },
  footer: {
    marginTop: 24,
    fontSize: 12.5,
    color: "#5f6368",
  },
};

const Options = () => {
  const [apiKey, setApiKey] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);

  useEffect(() => {
    chrome.storage.sync.get([API_KEY_STORAGE_KEY], (items) => {
      setApiKey((items[API_KEY_STORAGE_KEY] as string) ?? "");
    });
  }, []);

  const saveOptions = () => {
    chrome.storage.sync.set({ [API_KEY_STORAGE_KEY]: apiKey.trim() }, () => {
      setStatus("Saved");
      const id = setTimeout(() => setStatus(""), 1500);
      return () => clearTimeout(id);
    });
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Popular by Date for YouTube</h1>
      <p style={styles.intro}>
        Sorting a channel's videos by "Popular" for a specific time range (this week, this month,
        this year, or all time) requires a YouTube Data API v3 key. You can create one for free in
        the Google Cloud Console — see "How to get an API key" below. Paste your key here and save
        to enable the time-range filter.
      </p>

      <label style={styles.label} htmlFor="api-key">
        YouTube Data API key
      </label>
      <div style={styles.inputRow}>
        <input
          id="api-key"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Paste your API key"
          autoComplete="off"
          spellCheck={false}
          style={styles.input}
        />
        <button type="button" onClick={() => setShowKey((value) => !value)} style={styles.toggleButton}>
          {showKey ? "Hide" : "Show"}
        </button>
      </div>

      <div style={styles.actions}>
        <button onClick={saveOptions} style={styles.saveButton}>
          Save
        </button>
        {status && <span style={styles.status}>✓ {status}</span>}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>How to get an API key</h2>
        <ol style={styles.sectionList}>
          <li style={styles.sectionListItem}>
            Open the{" "}
            <a
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noreferrer"
              style={styles.link}
            >
              YouTube Data API v3
            </a>{" "}
            page in the Google Cloud Console (create a project first if you don't have one).
          </li>
          <li style={styles.sectionListItem}>Click "Enable" to turn on the API for that project.</li>
          <li style={styles.sectionListItem}>
            Go to{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              style={styles.link}
            >
              Credentials
            </a>{" "}
            and create an API key.
          </li>
          <li style={styles.sectionListItem}>Copy the key, paste it above, and click Save.</li>
        </ol>
        <p style={styles.quotaNote}>
          The free tier includes 10,000 quota units per day, and each "Popular" lookup uses about
          101 units — roughly 100 lookups per day.
        </p>
      </div>

      <p style={styles.footer}>
        Your API key is stored locally in your browser (via Chrome sync storage) and is sent
        directly to Google's YouTube Data API — never to any server run by this extension's
        developer. See the{" "}
        <a
          href="https://github.com/Tom-Caz/youtube-popular-search/blob/main/PRIVACY.md"
          target="_blank"
          rel="noreferrer"
          style={styles.link}
        >
          privacy policy
        </a>{" "}
        for details.
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
