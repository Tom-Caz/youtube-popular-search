import { richGridFixtureHtml } from "./content_script_fixtures";
import type { PopularVideo } from "../youtube_api";

vi.mock("../youtube_api", () => ({
  getApiKey: vi.fn(),
  getPublishedAfter: vi.fn(),
  getVideoKindFromUrl: vi.fn(),
  resolveChannelId: vi.fn(),
  fetchPopularVideos: vi.fn(),
  YouTubeApiError: class YouTubeApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "YouTubeApiError";
      this.status = status;
    }
  },
}));

vi.mock("../results_panel", () => ({
  ensureResultsPanel: vi.fn((richGrid: Element) => {
    let panel = richGrid.querySelector(".ytps-results") as HTMLElement | null;
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "ytps-results";
      richGrid.appendChild(panel);
    }
    return panel;
  }),
  removeResultsPanel: vi.fn((richGrid: Element) => {
    richGrid.querySelector(".ytps-results")?.remove();
  }),
  renderStatus: vi.fn(),
  renderVideos: vi.fn(),
}));

import {
  getApiKey,
  getPublishedAfter,
  getVideoKindFromUrl,
  resolveChannelId,
  fetchPopularVideos,
} from "../youtube_api";
import { renderVideos } from "../results_panel";

window.history.pushState({}, "", "/@SomeChannel/videos");

document.body.innerHTML = richGridFixtureHtml();

await import("../content_script");

// The module's MutationObserver fires asynchronously; flush it before the
// jsdom environment is torn down so its callback doesn't run against a
// destroyed `document`.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function popularButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('button[aria-label="Popular"]')!;
}

function richGrid(): HTMLElement {
  return document.querySelector("ytd-rich-grid-renderer")!;
}

const FAKE_VIDEO: PopularVideo = {
  videoId: "vid1",
  title: "Fake Video",
  thumbnailUrl: "https://example.com/thumb.jpg",
  viewCount: 1234,
  publishedAt: "2024-01-15T00:00:00.000Z",
};

vi.mocked(getApiKey).mockResolvedValue("FAKE_KEY");
vi.mocked(resolveChannelId).mockResolvedValue("UCabc123");
vi.mocked(getPublishedAfter).mockReturnValue("2024-01-01T00:00:00.000Z");
vi.mocked(fetchPopularVideos).mockResolvedValue([FAKE_VIDEO]);
vi.mocked(getVideoKindFromUrl).mockImplementation(() =>
  /\/shorts(\/|$)/.test(window.location.pathname) ? "shorts" : "videos"
);

describe("content_script: stale results panel across Videos<->Shorts navigation", () => {
  it("refetches with the new videoKind and refreshes the panel in place on tab navigation", async () => {
    // Select "This week" while on the Videos tab.
    popularButton().click();
    const menu = document.querySelector(".ytps-menu")!;
    const weekItem = Array.from(menu.querySelectorAll<HTMLElement>(".ytps-menu-item")).find(
      (el) => el.textContent === "This week"
    )!;
    weekItem.click();

    await vi.waitFor(() => expect(fetchPopularVideos).toHaveBeenCalledTimes(1));
    expect(fetchPopularVideos).toHaveBeenNthCalledWith(
      1,
      "UCabc123",
      "FAKE_KEY",
      "2024-01-01T00:00:00.000Z",
      "videos"
    );

    const panelBefore = richGrid().querySelector(".ytps-results");
    expect(panelBefore).not.toBeNull();

    // Navigate to the Shorts tab.
    window.history.pushState({}, "", "/@SomeChannel/shorts");
    document.dispatchEvent(new Event("yt-navigate-finish"));

    await vi.waitFor(() => expect(fetchPopularVideos).toHaveBeenCalledTimes(2));
    expect(fetchPopularVideos).toHaveBeenNthCalledWith(
      2,
      "UCabc123",
      "FAKE_KEY",
      "2024-01-01T00:00:00.000Z",
      "shorts"
    );

    await vi.waitFor(() => expect(richGrid().querySelector(".ytps-results")).not.toBeNull());

    // Dispatch yt-navigate-finish again without changing the path: no redundant refetch.
    document.dispatchEvent(new Event("yt-navigate-finish"));

    // Give any potential (incorrect) async refetch a chance to occur.
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchPopularVideos).toHaveBeenCalledTimes(2);
  });
});
