import { richGridFixtureHtml } from "./content_script_fixtures";

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

// Explicitly ensure there's no `chrome` global: this proves the module has
// no chrome.storage dependency for determining the initial selected range.
(globalThis as any).chrome = undefined;

document.body.innerHTML = richGridFixtureHtml();

// The module's MutationObserver fires asynchronously; flush it before the
// jsdom environment is torn down so its callback doesn't run against a
// destroyed `document`.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("content_script: always starts at 'All time' (no cross-reload persistence)", () => {
  it("imports and initializes without throwing even when `chrome` is undefined", async () => {
    await expect(import("../content_script")).resolves.toBeDefined();
  });

  it("the Popular chip's range label is empty immediately after import (Popular isn't active)", () => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Popular"]')!;
    const rangeSpan = button.querySelector(".ytps-range");

    expect(rangeSpan?.textContent).toBe("");
  });
});
