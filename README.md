# Popular by Date for YouTube

A Chrome and Firefox extension that adds a time-range dropdown to the "Popular" sort chip on YouTube channel pages — similar to Reddit's sort menu.

On a channel's Videos or Shorts tab, next to the "Latest" / "Popular" / "Oldest" chips, this extension adds a small caret to the "Popular" chip. Clicking the caret opens a menu with **This week**, **This month**, **This year**, and **All time**. Picking a range fetches that channel's most-viewed videos for the period via the YouTube Data API and renders them as a grid in place of YouTube's normal results (matching whichever tab — Videos or Shorts — you're on). Picking "All time" just triggers YouTube's native "Popular" (most-viewed) sort. Clicking the chip's body re-applies whichever range you last selected.

## Features

- Adds a dropdown caret to the "Popular" chip on YouTube channel pages
- Time ranges: This week, This month, This year, All time
- Custom ranges render a grid of the channel's most-viewed videos for that period
- Works on both the Videos and Shorts tabs
- "All time" uses YouTube's built-in Popular sort (no API key needed)

## Development

```bash
npm install            # install dependencies
npm run build          # production build to dist/ (Chrome)
npm run watch          # development build for Chrome, rebuilds on file changes
npm run build:firefox  # production build to dist-firefox/ (Firefox/Zen)
npm run watch:firefox  # development build for Firefox, rebuilds on file changes
npm test               # run the test suite (Vitest)
npm run typecheck      # type-check with tsc
```

## Loading the extension in Chrome

1. Run `npm run build` (or `npm run watch` for development) to generate the `dist/` folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.

## Loading the extension in Firefox / Zen

Firefox needs its own build because Manifest V3's background page differs (Chrome uses a
`service_worker`, Firefox uses a background script) and Firefox requires an explicit add-on ID
for `storage.sync`. These differences live in `public/manifest.firefox.json`, which is merged
into `public/manifest.json` for the Firefox build.

1. Run `npm run build:firefox` (or `npm run watch:firefox` for development) to generate the
   `dist-firefox/` folder.
2. Open `about:debugging#/runtime/this-firefox` (in Zen, this is the same `about:debugging` page
   as Firefox).
3. Click **Load Temporary Add-on…** and select `dist-firefox/manifest.json`.

Temporary add-ons are removed when the browser restarts, so you'll need to reload it each
session during development. The rest of the extension's code is shared as-is between Chrome and
Firefox — Firefox implements the `chrome.*` APIs (`storage`, `runtime`, etc.) this extension uses
as a compatibility layer, so no source changes are needed beyond the manifest.

## Setting up a YouTube Data API key

Custom time ranges (This week / This month / This year) call the YouTube Data API v3, which requires your own free API key:

1. Click the extension's icon and choose **Options** (or go to `chrome://extensions`, find "Popular by Date for YouTube", and click **Details → Extension options**).
2. Create an API key in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with the **YouTube Data API v3** enabled.
3. Paste the key into the Options page and click **Save**.

The free tier covers roughly 100 "Popular" lookups per day (each lookup uses about 101 of the default 10,000 daily quota units). "All time" doesn't require an API key.

## Known limitations

**Shorts tab results may include regular short videos.** The YouTube Data API doesn't expose a reliable flag to distinguish YouTube Shorts from regular videos that happen to be short. The extension uses a 3-minute duration threshold to filter Shorts tab results, but channels that post a lot of sub-3-minute content (news clips, highlights, etc.) will see those regular videos mixed into their Shorts tab results.

**Videos tab results are unfiltered by duration.** Because of the same limitation above, the Videos tab shows all results by view count rather than trying to exclude Shorts — filtering by duration would incorrectly drop short regular videos from channels like NYPost. This means the occasional YouTube Short may appear in Videos tab results on channels where Shorts dominate the view count rankings.

## Permissions

- **`storage`** — saves your YouTube Data API key and is the only thing this extension persists.
- **Host permission for `https://www.googleapis.com/youtube/v3/*`** — needed to call the YouTube
  Data API (`search`, `videos`, and `channels` endpoints under `/youtube/v3/`) directly from the
  browser using your API key.
- **Content script on `*://*.youtube.com/*`** — adds the time-range dropdown to the "Popular"
  chip and renders the results grid on channel pages. It only reads page content needed to
  identify the current channel/tab and modifies the page's DOM; it does not read your YouTube
  account, history, or any other personal data.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Development / Contributing

Feel free to make PRs and Issue reports for this repo. 

Be warned -- This project was entirely vibe-coded in a single evening. I can't speak to the quality of the code beyond breifly glancing at it before commiting.

This was created to solve a need of mine. I am publishing it to share with anyone else who has a similar need.

## Tech stack

TypeScript, React, Webpack, and Vitest.

## Template

Based on the [chrome-extension-typescript-starter](https://github.com/chibat/chrome-extension-typescript-starter) template by [chibat](https://github.com/chibat)

## License

MIT — see [LICENSE](LICENSE).
