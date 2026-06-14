import {
  ensureResultsPanel,
  removeResultsPanel,
  renderStatus,
  renderMissingApiKeyStatus,
  renderVideos,
  appendVideos,
  renderLoadMoreButton,
  removeLoadMoreButton,
  setLoadMoreButtonState,
  formatViewCount,
  formatRelativeDate,
} from "../results_panel";
import { PopularVideo } from "../youtube_api";

const DAY_MS = 1000 * 60 * 60 * 24;
const NOW = new Date("2024-01-01T00:00:00.000Z");

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function makeVideo(overrides: Partial<PopularVideo> = {}): PopularVideo {
  return {
    videoId: "abc123",
    title: "Some Video Title",
    thumbnailUrl: "https://example.com/thumb.jpg",
    viewCount: 1234,
    publishedAt: isoDaysAgo(5),
    ...overrides,
  };
}

describe("formatViewCount", () => {
  it("formats 0 views", () => {
    expect(formatViewCount(0)).toBe("0 views");
  });

  it("formats 1 view (singular)", () => {
    expect(formatViewCount(1)).toBe("1 view");
  });

  it("formats 2 views (plural)", () => {
    expect(formatViewCount(2)).toBe("2 views");
  });

  it("formats 999 views (no suffix)", () => {
    expect(formatViewCount(999)).toBe("999 views");
  });

  it("formats 1000 as 1K views", () => {
    expect(formatViewCount(1000)).toBe("1K views");
  });

  it("formats 1500 as 1.5K views (decimal kept)", () => {
    expect(formatViewCount(1500)).toBe("1.5K views");
  });

  it("formats 2000 as 2K views (.0 trimmed)", () => {
    expect(formatViewCount(2000)).toBe("2K views");
  });

  it("formats 1_000_000 as 1M views", () => {
    expect(formatViewCount(1_000_000)).toBe("1M views");
  });

  it("formats 2_500_000 as 2.5M views", () => {
    expect(formatViewCount(2_500_000)).toBe("2.5M views");
  });

  it("formats 1_000_000_000 as 1B views", () => {
    expect(formatViewCount(1_000_000_000)).toBe("1B views");
  });
});

describe("formatRelativeDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for empty input", () => {
    expect(formatRelativeDate("")).toBe("");
  });

  it("returns 'Today' for a timestamp in the future", () => {
    const future = new Date(NOW.getTime() + DAY_MS).toISOString();
    expect(formatRelativeDate(future)).toBe("Today");
  });

  it("returns 'Today' for exactly now", () => {
    expect(formatRelativeDate(NOW.toISOString())).toBe("Today");
  });

  it("returns '1 day ago' (singular) for 1 day ago", () => {
    expect(formatRelativeDate(isoDaysAgo(1))).toBe("1 day ago");
  });

  it("returns '5 days ago' for 5 days ago", () => {
    expect(formatRelativeDate(isoDaysAgo(5))).toBe("5 days ago");
  });

  it("returns '29 days ago' for 29 days ago (still in days branch)", () => {
    expect(formatRelativeDate(isoDaysAgo(29))).toBe("29 days ago");
  });

  it("returns '1 month ago' (singular) for ~30 days ago", () => {
    expect(formatRelativeDate(isoDaysAgo(30))).toBe("1 month ago");
  });

  it("returns '6 months ago' (plural) for ~180 days ago", () => {
    expect(formatRelativeDate(isoDaysAgo(180))).toBe("6 months ago");
  });

  it("regression: 362 days ago returns '1 year ago', not '0 years ago'", () => {
    expect(formatRelativeDate(isoDaysAgo(362))).toBe("1 year ago");
  });

  it("regression: 364 days ago returns '1 year ago', not '0 years ago'", () => {
    expect(formatRelativeDate(isoDaysAgo(364))).toBe("1 year ago");
  });

  it("returns '1 year ago' for exactly/just over 365 days ago", () => {
    expect(formatRelativeDate(isoDaysAgo(365))).toBe("1 year ago");
  });

  it("returns '2 years ago' for ~730 days ago", () => {
    expect(formatRelativeDate(isoDaysAgo(730))).toBe("2 years ago");
  });
});

describe("ensureResultsPanel / removeResultsPanel", () => {
  function buildRichGrid(withHeader = true): HTMLElement {
    const richGrid = document.createElement("ytd-rich-grid-renderer");
    richGrid.innerHTML = withHeader
      ? '<div id="header"></div><div id="contents"></div>'
      : '<div id="contents"></div>';
    return richGrid;
  }

  it("creates a .ytps-results panel inserted immediately after #header", () => {
    const richGrid = buildRichGrid();
    const panel = ensureResultsPanel(richGrid);

    expect(panel.className).toBe("ytps-results");
    const header = richGrid.querySelector("#header");
    expect(header?.nextElementSibling).toBe(panel);
  });

  it("returns the same element on a second call without creating a duplicate", () => {
    const richGrid = buildRichGrid();
    const first = ensureResultsPanel(richGrid);
    const second = ensureResultsPanel(richGrid);

    expect(second).toBe(first);
    expect(richGrid.querySelectorAll(".ytps-results").length).toBe(1);
  });

  it("appends the panel as a child of richGrid when there is no #header", () => {
    const richGrid = buildRichGrid(false);
    const panel = ensureResultsPanel(richGrid);

    expect(panel.parentElement).toBe(richGrid);
    expect(richGrid.querySelector("#header")).toBeNull();
    expect(richGrid.lastElementChild).toBe(panel);
  });

  it("removes the .ytps-results element from the DOM", () => {
    const richGrid = buildRichGrid();
    ensureResultsPanel(richGrid);
    expect(richGrid.querySelector(".ytps-results")).not.toBeNull();

    removeResultsPanel(richGrid);
    expect(richGrid.querySelector(".ytps-results")).toBeNull();
  });

  it("is a harmless no-op when no panel exists", () => {
    const richGrid = buildRichGrid();
    expect(() => removeResultsPanel(richGrid)).not.toThrow();
    expect(richGrid.querySelector(".ytps-results")).toBeNull();
  });
});

describe("renderStatus", () => {
  it("clears prior content and inserts a single status div with the message", () => {
    const panel = document.createElement("div");
    panel.innerHTML = "<span>old content</span>";

    renderStatus(panel, "Loading…");

    expect(panel.children.length).toBe(1);
    const status = panel.querySelector(".ytps-results-status");
    expect(status).not.toBeNull();
    expect(status?.textContent).toBe("Loading…");
  });

  it("replaces the previous status when called again with a different message", () => {
    const panel = document.createElement("div");

    renderStatus(panel, "Loading…");
    renderStatus(panel, "No results found");

    expect(panel.children.length).toBe(1);
    const status = panel.querySelector(".ytps-results-status");
    expect(status?.textContent).toBe("No results found");
  });
});

describe("renderMissingApiKeyStatus", () => {
  beforeEach(() => {
    (globalThis as any).chrome = { runtime: { sendMessage: vi.fn() } };
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it("clears prior content and renders the message with an 'Open extension settings' button", () => {
    const panel = document.createElement("div");
    panel.innerHTML = "<span>old content</span>";

    renderMissingApiKeyStatus(panel, "Add a YouTube Data API key in the extension's options page.");

    expect(panel.children.length).toBe(1);
    const status = panel.querySelector(".ytps-results-status");
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain("Add a YouTube Data API key in the extension's options page.");

    const button = panel.querySelector<HTMLButtonElement>(".ytps-open-options-button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("Open extension settings");
  });

  it("sends an OPEN_OPTIONS_PAGE message to the background script when the button is clicked", () => {
    const panel = document.createElement("div");

    renderMissingApiKeyStatus(panel, "Add a YouTube Data API key in the extension's options page.");

    const button = panel.querySelector<HTMLButtonElement>(".ytps-open-options-button")!;
    button.click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "OPEN_OPTIONS_PAGE" });
  });
});

describe("renderVideos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("populates the panel with one .ytps-video-card per video, in order", () => {
    const panel = document.createElement("div");
    const videos: PopularVideo[] = [
      makeVideo({ videoId: "vid1", title: "First Video", viewCount: 1500, publishedAt: isoDaysAgo(1) }),
      makeVideo({ videoId: "vid2", title: "Second Video", viewCount: 2_500_000, publishedAt: isoDaysAgo(30) }),
    ];

    renderVideos(panel, videos);

    const cards = panel.querySelectorAll(".ytps-video-card");
    expect(cards.length).toBe(2);

    const first = cards[0] as HTMLAnchorElement;
    expect(first.getAttribute("href")).toBe("/watch?v=vid1");

    const firstThumb = first.querySelector<HTMLImageElement>(".ytps-video-thumb");
    expect(firstThumb).not.toBeNull();
    expect(firstThumb?.src).toBe(videos[0].thumbnailUrl);

    const firstTitle = first.querySelector(".ytps-video-title");
    expect(firstTitle?.textContent).toBe("First Video");
    expect(firstTitle?.getAttribute("title")).toBe("First Video");

    const firstMeta = first.querySelector(".ytps-video-meta");
    expect(firstMeta?.textContent).toBe("1.5K views · 1 day ago");

    const second = cards[1] as HTMLAnchorElement;
    expect(second.getAttribute("href")).toBe("/watch?v=vid2");

    const secondMeta = second.querySelector(".ytps-video-meta");
    expect(secondMeta?.textContent).toBe("2.5M views · 1 month ago");
  });

  it("clears the panel when given an empty array", () => {
    const panel = document.createElement("div");
    panel.innerHTML = "<span>existing content</span>";

    renderVideos(panel, []);

    expect(panel.children.length).toBe(0);
    expect(panel.innerHTML).toBe("");
  });

  it("replaces a prior status message with video cards", () => {
    const panel = document.createElement("div");
    renderStatus(panel, "Loading…");
    expect(panel.querySelector(".ytps-results-status")).not.toBeNull();

    renderVideos(panel, [makeVideo()]);

    expect(panel.querySelector(".ytps-results-status")).toBeNull();
    expect(panel.querySelectorAll(".ytps-video-card").length).toBe(1);
  });
});

describe("appendVideos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds more cards after the existing ones without clearing them", () => {
    const panel = document.createElement("div");
    renderVideos(panel, [makeVideo({ videoId: "vid1" })]);

    appendVideos(panel, [makeVideo({ videoId: "vid2" }), makeVideo({ videoId: "vid3" })]);

    const cards = panel.querySelectorAll<HTMLAnchorElement>(".ytps-video-card");
    expect(cards.length).toBe(3);
    expect(Array.from(cards).map((card) => card.getAttribute("href"))).toEqual([
      "/watch?v=vid1",
      "/watch?v=vid2",
      "/watch?v=vid3",
    ]);
  });

  it("inserts new cards before an existing Load more button", () => {
    const panel = document.createElement("div");
    renderVideos(panel, [makeVideo({ videoId: "vid1" })]);
    renderLoadMoreButton(panel, () => {});

    appendVideos(panel, [makeVideo({ videoId: "vid2" })]);

    const children = Array.from(panel.children);
    const loadMoreIndex = children.findIndex((el) => el.classList.contains("ytps-load-more"));
    const newCardIndex = children.findIndex(
      (el) => el.classList.contains("ytps-video-card") && el.getAttribute("href") === "/watch?v=vid2"
    );

    expect(newCardIndex).toBeGreaterThanOrEqual(0);
    expect(loadMoreIndex).toBeGreaterThan(newCardIndex);
  });
});

describe("renderLoadMoreButton / removeLoadMoreButton / setLoadMoreButtonState", () => {
  it("renders a button that invokes the given callback when clicked", () => {
    const panel = document.createElement("div");
    const onClick = vi.fn();

    renderLoadMoreButton(panel, onClick);

    const button = panel.querySelector<HTMLButtonElement>(".ytps-load-more-button")!;
    expect(button).not.toBeNull();
    expect(button.textContent).toBe("Load more");

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("replaces a previously rendered Load more button rather than stacking them", () => {
    const panel = document.createElement("div");

    renderLoadMoreButton(panel, () => {});
    renderLoadMoreButton(panel, () => {});

    expect(panel.querySelectorAll(".ytps-load-more").length).toBe(1);
  });

  it("removeLoadMoreButton removes the button from the panel", () => {
    const panel = document.createElement("div");
    renderLoadMoreButton(panel, () => {});

    removeLoadMoreButton(panel);

    expect(panel.querySelector(".ytps-load-more")).toBeNull();
  });

  it("removeLoadMoreButton is a no-op when there is no button", () => {
    const panel = document.createElement("div");

    expect(() => removeLoadMoreButton(panel)).not.toThrow();
  });

  it("setLoadMoreButtonState('loading') disables the button and updates its text", () => {
    const panel = document.createElement("div");
    renderLoadMoreButton(panel, () => {});

    setLoadMoreButtonState(panel, "loading");

    const button = panel.querySelector<HTMLButtonElement>(".ytps-load-more-button")!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Loading…");
  });

  it("setLoadMoreButtonState('error') re-enables the button and shows a retry message", () => {
    const panel = document.createElement("div");
    renderLoadMoreButton(panel, () => {});

    setLoadMoreButtonState(panel, "loading");
    setLoadMoreButtonState(panel, "error");

    const button = panel.querySelector<HTMLButtonElement>(".ytps-load-more-button")!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toMatch(/try again/i);
  });

  it("setLoadMoreButtonState is a no-op when there is no button", () => {
    const panel = document.createElement("div");

    expect(() => setLoadMoreButtonState(panel, "loading")).not.toThrow();
  });
});
