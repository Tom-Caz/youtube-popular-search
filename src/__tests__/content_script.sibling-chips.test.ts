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

function latestButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('button[aria-label="Latest"]')!;
}

function oldestButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('button[aria-label="Oldest"]')!;
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
vi.mocked(getVideoKindFromUrl).mockReturnValue("videos");
vi.mocked(fetchPopularVideos).mockResolvedValue([FAKE_VIDEO]);

describe("content_script: clicking Latest/Oldest while a custom range is active", () => {
  it("clears the stale results panel and restores #contents when 'Latest' is clicked", async () => {
    // Select "This week" to get into a custom-range state.
    popularButton().querySelector<HTMLElement>(".ytps-caret")!.click();
    const menu = document.querySelector(".ytps-menu")!;
    const weekItem = Array.from(menu.querySelectorAll<HTMLElement>(".ytps-menu-item")).find(
      (el) => el.textContent === "This week"
    )!;
    weekItem.click();

    await vi.waitFor(() => expect(renderVideos).toHaveBeenCalledWith(expect.anything(), [FAKE_VIDEO]));

    expect(richGrid().querySelector(".ytps-results")).not.toBeNull();
    expect(contents().style.display).toBe("none");
    expect(popularButton().getAttribute("aria-selected")).toBe("true");

    const fetchCountBefore = vi.mocked(fetchPopularVideos).mock.calls.length;

    // Now click "Latest".
    latestButton().click();

    expect(richGrid().querySelector(".ytps-results")).toBeNull();
    expect(contents().style.display).toBe("");

    expect(latestButton().getAttribute("aria-selected")).toBe("true");
    expect(popularButton().getAttribute("aria-selected")).toBe("false");
    expect(oldestButton().getAttribute("aria-selected")).toBe("false");
    expect(popularButton().querySelector(".ytps-range")?.textContent).toBe("");

    // Clicking Latest must not re-trigger our custom fetch.
    expect(vi.mocked(fetchPopularVideos).mock.calls.length).toBe(fetchCountBefore);
  });
});
