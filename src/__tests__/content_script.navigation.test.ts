import { richGridFixtureHtml, mockCaretBoundingClientRect, clickCaret } from "./content_script_fixtures";
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
  renderMissingApiKeyStatus: vi.fn(),
  renderVideos: vi.fn(),
  appendVideos: vi.fn(),
  renderLoadMoreButton: vi.fn(),
  removeLoadMoreButton: vi.fn(),
  setLoadMoreButtonState: vi.fn(),
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
mockCaretBoundingClientRect();

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

function popularRangeLabel(): string | null | undefined {
  return popularButton().querySelector(".ytps-range")?.textContent;
}

function richGrid(): HTMLElement {
  return document.querySelector("ytd-rich-grid-renderer")!;
}

function contents(): HTMLElement {
  return richGrid().querySelector<HTMLElement>("#contents")!;
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
vi.mocked(fetchPopularVideos).mockResolvedValue({ videos: [FAKE_VIDEO], nextPageToken: null });
vi.mocked(getVideoKindFromUrl).mockImplementation(() =>
  /\/shorts(\/|$)/.test(window.location.pathname) ? "shorts" : "videos"
);

function selectThisWeek(): void {
  clickCaret(popularButton().querySelector<HTMLElement>(".ytps-caret")!);
  const menu = document.querySelector(".ytps-menu")!;
  const weekItem = Array.from(menu.querySelectorAll<HTMLElement>(".ytps-menu-item")).find(
    (el) => el.textContent === "This week"
  )!;
  weekItem.click();
}

beforeEach(() => {
  vi.mocked(fetchPopularVideos).mockClear();
  vi.mocked(renderVideos).mockClear();
});

describe("content_script: navigating away wipes the selected range", () => {
  it("resets to 'All time' and removes the results panel when switching from Videos to Shorts", async () => {
    selectThisWeek();

    await vi.waitFor(() => expect(fetchPopularVideos).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(renderVideos).toHaveBeenCalledWith(expect.anything(), [FAKE_VIDEO]));

    expect(popularRangeLabel()).toBe(" · This week");
    expect(richGrid().querySelector(".ytps-results")).not.toBeNull();
    expect(contents().style.display).toBe("none");

    // Navigate to the Shorts tab (the chip bar/rich grid are reused).
    window.history.pushState({}, "", "/@SomeChannel/shorts");
    document.dispatchEvent(new Event("yt-navigate-finish"));

    expect(popularRangeLabel()).toBe(" · All time");
    expect(richGrid().querySelector(".ytps-results")).toBeNull();
    expect(contents().style.display).toBe("");

    // Wiping the range on navigation must not trigger a refetch.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchPopularVideos).toHaveBeenCalledTimes(1);
  });

  it("does not carry a custom range over to a different channel", async () => {
    selectThisWeek();

    await vi.waitFor(() => expect(fetchPopularVideos).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(renderVideos).toHaveBeenCalledWith(expect.anything(), [FAKE_VIDEO]));

    expect(popularRangeLabel()).toBe(" · This week");

    // Navigate away to a brand new channel's videos page (fresh chip-bar DOM).
    window.history.pushState({}, "", "/@AnotherChannel/videos");
    document.body.innerHTML = richGridFixtureHtml();
    document.dispatchEvent(new Event("yt-navigate-finish"));

    expect(popularButton().getAttribute("data-ytps-processed")).toBe("true");
    expect(popularRangeLabel()).toBe("");
    expect(richGrid().querySelector(".ytps-results")).toBeNull();

    // No additional fetch triggered by the reset/re-enhancement.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchPopularVideos).toHaveBeenCalledTimes(1);
  });
});
