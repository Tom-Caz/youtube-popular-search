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
}));

import {
  getApiKey,
  getPublishedAfter,
  getVideoKindFromUrl,
  resolveChannelId,
  fetchPopularVideos,
  YouTubeApiError,
} from "../youtube_api";
import { renderStatus, renderMissingApiKeyStatus, renderVideos } from "../results_panel";

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

function openMenuAndClick(label: string): void {
  clickCaret(popularButton().querySelector<HTMLElement>(".ytps-caret")!);
  const menu = document.querySelector(".ytps-menu")!;
  const item = Array.from(menu.querySelectorAll<HTMLElement>(".ytps-menu-item")).find(
    (el) => el.textContent === label
  )!;
  item.click();
}

const FAKE_VIDEO: PopularVideo = {
  videoId: "vid1",
  title: "Fake Video",
  thumbnailUrl: "https://example.com/thumb.jpg",
  viewCount: 1234,
  publishedAt: "2024-01-15T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(getApiKey).mockReset();
  vi.mocked(getPublishedAfter).mockReset();
  vi.mocked(getVideoKindFromUrl).mockReset();
  vi.mocked(resolveChannelId).mockReset();
  vi.mocked(fetchPopularVideos).mockReset();
  vi.mocked(renderStatus).mockClear();
  vi.mocked(renderMissingApiKeyStatus).mockClear();
  vi.mocked(renderVideos).mockClear();

  // Sensible defaults; individual tests override as needed.
  vi.mocked(getApiKey).mockResolvedValue("FAKE_KEY");
  vi.mocked(resolveChannelId).mockResolvedValue("UCabc123");
  vi.mocked(getPublishedAfter).mockReturnValue("2024-01-01T00:00:00.000Z");
  vi.mocked(getVideoKindFromUrl).mockReturnValue("videos");
  vi.mocked(fetchPopularVideos).mockResolvedValue([FAKE_VIDEO]);
});

afterEach(() => {
  // Reset to "All time" so the next test starts from a clean baseline.
  if (document.querySelector(".ytps-menu")) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }
});

describe("content_script: selecting a custom range fetches and renders", () => {
  it("hides #contents, shows loading status, fetches, and renders results", async () => {
    openMenuAndClick("This week");

    expect(contents().style.display).toBe("none");
    expect(renderStatus).toHaveBeenCalledWith(expect.anything(), "Loading popular videos…");

    await vi.waitFor(() => expect(fetchPopularVideos).toHaveBeenCalled());

    expect(fetchPopularVideos).toHaveBeenCalledWith(
      "UCabc123",
      "FAKE_KEY",
      "2024-01-01T00:00:00.000Z",
      "videos"
    );

    await vi.waitFor(() => expect(renderVideos).toHaveBeenCalledWith(expect.anything(), [FAKE_VIDEO]));

    expect(popularButton().getAttribute("aria-selected")).toBe("true");
    expect(latestButton().getAttribute("aria-selected")).toBe("false");
    expect(oldestButton().getAttribute("aria-selected")).toBe("false");

    const popularShape = popularButton().querySelector(".ytChipShapeChip")!;
    expect(popularShape.classList.contains("ytChipShapeActive")).toBe(true);
    expect(popularShape.classList.contains("ytChipShapeInactive")).toBe(false);

    const latestShape = latestButton().querySelector(".ytChipShapeChip")!;
    expect(latestShape.classList.contains("ytChipShapeActive")).toBe(false);
    expect(latestShape.classList.contains("ytChipShapeInactive")).toBe(true);

    const oldestShape = oldestButton().querySelector(".ytChipShapeChip")!;
    expect(oldestShape.classList.contains("ytChipShapeActive")).toBe(false);
    expect(oldestShape.classList.contains("ytChipShapeInactive")).toBe(true);
  });

  it("shows an 'add API key' message and skips fetching when no API key is configured", async () => {
    vi.mocked(getApiKey).mockResolvedValue(undefined);

    openMenuAndClick("This week");

    await vi.waitFor(() => expect(renderMissingApiKeyStatus).toHaveBeenCalled());

    const messages = vi.mocked(renderMissingApiKeyStatus).mock.calls.map((call) => call[1]);
    expect(messages.some((m) => /api key/i.test(m) && /options page/i.test(m))).toBe(true);

    expect(resolveChannelId).not.toHaveBeenCalled();
    expect(fetchPopularVideos).not.toHaveBeenCalled();
  });

  it("shows a 'couldn't determine the channel' message when resolveChannelId returns null", async () => {
    vi.mocked(resolveChannelId).mockResolvedValue(null);

    openMenuAndClick("This week");

    await vi.waitFor(() =>
      expect(renderStatus).toHaveBeenCalledWith(
        expect.anything(),
        "Couldn't determine the channel for this page."
      )
    );

    expect(fetchPopularVideos).not.toHaveBeenCalled();
  });

  it("shows a 'no videos found' message mentioning the range label when results are empty", async () => {
    vi.mocked(fetchPopularVideos).mockResolvedValue([]);

    openMenuAndClick("This week");

    await vi.waitFor(() => expect(fetchPopularVideos).toHaveBeenCalled());

    await vi.waitFor(() => {
      const messages = vi.mocked(renderStatus).mock.calls.map((call) => call[1]);
      expect(messages.some((m) => m.includes("This week"))).toBe(true);
    });

    expect(renderVideos).not.toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([expect.anything()]));
  });

  it("shows an API-key/quota message for a 403 YouTubeApiError", async () => {
    vi.mocked(fetchPopularVideos).mockRejectedValue(new YouTubeApiError(403, "quota exceeded"));

    openMenuAndClick("This week");

    await vi.waitFor(() => {
      const messages = vi.mocked(renderStatus).mock.calls.map((call) => call[1]);
      expect(messages.some((m) => /api key/i.test(m) && /quota/i.test(m))).toBe(true);
    });
  });

  it("shows a generic 'couldn't load' message for a non-YouTubeApiError rejection", async () => {
    vi.mocked(fetchPopularVideos).mockRejectedValue(new Error("network down"));

    openMenuAndClick("This week");

    await vi.waitFor(() => {
      const messages = vi.mocked(renderStatus).mock.calls.map((call) => call[1]);
      expect(messages.some((m) => /couldn't load/i.test(m))).toBe(true);
    });
  });

  it("selecting 'All time' after a custom range removes the panel, restores #contents, and bypasses reopening the menu", async () => {
    // First select "This week" to get into a custom-range state.
    openMenuAndClick("This week");
    await vi.waitFor(() => expect(renderVideos).toHaveBeenCalledWith(expect.anything(), [FAKE_VIDEO]));
    expect(contents().style.display).toBe("none");
    expect(richGrid().querySelector(".ytps-results")).not.toBeNull();

    // Now select "All time" again.
    openMenuAndClick("All time");

    expect(richGrid().querySelector(".ytps-results")).toBeNull();
    expect(contents().style.display).toBe("");

    // The native click should have fired without our menu reopening.
    expect(document.querySelector(".ytps-menu")).toBeNull();
  });
});
