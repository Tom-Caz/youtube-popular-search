import {
  dropdownChipBarFixtureHtml,
  mockCaretBoundingClientRect,
  clickCaret,
} from "./content_script_fixtures";
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

document.body.innerHTML = dropdownChipBarFixtureHtml("Popular");
mockCaretBoundingClientRect();

await import("../content_script");

afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function sortChip(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>("ytd-rich-grid-renderer button[role=combobox]")!;
}

function chevron(): HTMLElement {
  return sortChip().querySelector<HTMLElement>(".ytChipShapeIconEnd")!;
}

function rangeSpan(): HTMLElement {
  return sortChip().querySelector<HTMLElement>(".ytps-range")!;
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
vi.mocked(fetchPopularVideos).mockResolvedValue({ videos: [FAKE_VIDEO], nextPageToken: null });

describe("content_script: when YouTube's sort sheet can't be read", () => {
  it("hands the chip's chevron back to the range menu", async () => {
    // Fake timers from here so the window the chip's click opens for the
    // sheet can be run out.
    vi.useFakeTimers();

    // The first click always belongs to YouTube: the sheet gets its chance to
    // open and be enhanced.
    const firstClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 109,
      clientY: 9,
    });
    chevron().dispatchEvent(firstClick);
    expect(firstClick.defaultPrevented).toBe(false);
    expect(document.querySelector(".ytps-menu")).toBeNull();

    // No sheet ever shows up.
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    // From here the chevron opens our range menu, as it did before the
    // submenu existed.
    clickCaret(chevron());
    expect(document.querySelector(".ytps-menu")).not.toBeNull();

    const weekItem = Array.from(document.querySelectorAll<HTMLElement>(".ytps-menu-item")).find(
      (el) => el.textContent === "This week"
    )!;
    weekItem.click();

    await vi.waitFor(() => expect(renderVideos).toHaveBeenCalledWith(expect.anything(), [FAKE_VIDEO]));
    expect(rangeSpan().textContent).toBe(" · This week");
  });
});
