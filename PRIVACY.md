# Privacy Policy

**Popular by Date for YouTube** does not collect, store, or transmit any personal data to its
developer or any third party. This document explains what local data the extension handles and
why.

## What the extension stores

- **YouTube Data API key.** If you choose to use the "This week / This month / This year" time
  ranges, you provide your own YouTube Data API v3 key on the extension's Options page. This key
  is saved using the browser's `storage.sync` API, which means it is stored locally in your
  browser profile and synced across your own signed-in browser instances (by Google for Chrome,
  by Mozilla for Firefox) — it is never sent to the developer or to any server other than the
  browser vendor's sync service.
- **Selected time range.** The extension keeps track of which time range (e.g. "This week") is
  currently selected, in memory, so it can be reapplied as you navigate between a channel's
  Videos and Shorts tabs. This is not persisted or transmitted anywhere.

## Network requests

- When you select a custom time range, the extension calls the YouTube Data API v3
  (`https://www.googleapis.com/youtube/v3/...`) directly from your browser, using your API key, to
  fetch the channel's most-viewed videos for that period. This request goes straight from your
  browser to Google — the developer's servers are never involved, because the developer doesn't
  operate any servers.
- No analytics, tracking, or advertising scripts are included in this extension.

## Permissions

- `storage` — used only to save your API key and preferences locally, as described above.
- Host permission for `https://www.googleapis.com/youtube/v3/*` — used only to make the API
  request described above.
- The extension's content script runs on `youtube.com` pages to add the time-range dropdown to
  the "Popular" sort chip and to render results in place of YouTube's normal grid. It reads page
  content (to detect the current channel and tab) and modifies the page's DOM, but does not read
  or transmit your browsing history, account information, or any other personal data.

## Changes to this policy

If this policy changes, the updated version will be posted at this same location in the project's
repository.

## Contact

This is an open-source project. Source code, issues, and contact information are available at:
https://github.com/Tom-Caz/youtube-popular-search
