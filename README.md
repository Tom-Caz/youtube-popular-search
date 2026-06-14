# YouTube Popular Search

A Chrome extension that adds a time-range dropdown to the "Popular" sort chip on YouTube channel pages — similar to Reddit's sort menu.

On a channel's Videos or Shorts tab, next to the "Latest" / "Popular" / "Oldest" chips, this extension adds a small caret to the "Popular" chip. Clicking the caret opens a menu with **This week**, **This month**, **This year**, and **All time**. Picking a range fetches that channel's most-viewed videos for the period via the YouTube Data API and renders them as a grid in place of YouTube's normal results (matching whichever tab — Videos or Shorts — you're on). Picking "All time" just triggers YouTube's native "Popular" (most-viewed) sort. Clicking the chip's body re-applies whichever range you last selected.

## Features

- Adds a dropdown caret to the "Popular" chip on YouTube channel pages
- Time ranges: This week, This month, This year, All time
- Custom ranges render a grid of the channel's most-viewed videos for that period
- Works on both the Videos and Shorts tabs
- "All time" uses YouTube's built-in Popular sort (no API key needed)

## Development

```bash
npm install        # install dependencies
npm run build       # production build to dist/
npm run watch       # development build, rebuilds on file changes
npm test            # run the test suite (Vitest)
npm run typecheck   # type-check with tsc
```

## Loading the extension in Chrome

1. Run `npm run build` (or `npm run watch` for development) to generate the `dist/` folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.

## Setting up a YouTube Data API key

Custom time ranges (This week / This month / This year) call the YouTube Data API v3, which requires your own free API key:

1. Click the extension's icon and choose **Options** (or go to `chrome://extensions`, find "YouTube Popular Search", and click **Details → Extension options**).
2. Create an API key in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with the **YouTube Data API v3** enabled.
3. Paste the key into the Options page and click **Save**.

The free tier covers roughly 100 "Popular" lookups per day (each lookup uses about 101 of the default 10,000 daily quota units). "All time" doesn't require an API key.

## Tech stack

TypeScript, React, Webpack, and Vitest.

## License

MIT — see [LICENSE](LICENSE).
