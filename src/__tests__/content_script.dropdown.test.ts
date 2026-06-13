import { richGridFixtureHtml, standaloneChipBarHtml } from "./content_script_fixtures";

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

document.body.innerHTML = richGridFixtureHtml() + standaloneChipBarHtml();

await import("../content_script");

// The module's MutationObserver fires asynchronously; flush it before the
// jsdom environment is torn down so its callback doesn't run against a
// destroyed `document`.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function popularButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(
    'ytd-rich-grid-renderer button[aria-label="Popular"]'
  )!;
}

function standalonePopularButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(
    '#unrelated-chip-bar button[aria-label="Popular"]'
  )!;
}

describe("content_script: enhancement of the channel Popular chip", () => {
  it("enhances the channel sort chip's Popular button", () => {
    const button = popularButton();

    expect(button.getAttribute("data-ytps-processed")).toBe("true");
    expect(button.getAttribute("aria-haspopup")).toBe("true");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    const rangeSpan = button.querySelector(".ytps-range");
    expect(rangeSpan).not.toBeNull();
    expect(rangeSpan?.textContent).toBe(" · All time");

    const caret = button.querySelector(".ytps-caret");
    expect(caret).not.toBeNull();
    expect(caret?.querySelector("svg")).not.toBeNull();
  });

  it("leaves a standalone 'Popular' chip (without Latest/Oldest siblings) untouched", () => {
    const button = standalonePopularButton();

    expect(button.hasAttribute("data-ytps-processed")).toBe(false);
    expect(button.querySelector(".ytps-range")).toBeNull();
    expect(button.querySelector(".ytps-caret")).toBeNull();
  });
});

describe("content_script: dropdown menu interactions", () => {
  afterEach(() => {
    // Ensure no leftover open menu between tests in this file: close via
    // Escape so module-level state (currentMenu/activeButton) is reset too.
    if (document.querySelector(".ytps-menu")) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }
  });

  it("clicking the Popular button opens a menu with 5 items, 'All time' selected", () => {
    const button = popularButton();
    button.click();

    expect(button.getAttribute("aria-expanded")).toBe("true");

    const menu = document.querySelector(".ytps-menu");
    expect(menu).not.toBeNull();
    expect(menu?.parentElement).toBe(document.body);

    const items = Array.from(menu!.querySelectorAll(".ytps-menu-item"));
    expect(items.map((el) => el.textContent)).toEqual([
      "Today",
      "This week",
      "This month",
      "This year",
      "All time",
    ]);

    items.forEach((item) => {
      const isAllTime = item.textContent === "All time";
      expect(item.classList.contains("is-selected")).toBe(isAllTime);
      expect(item.getAttribute("aria-checked")).toBe(String(isAllTime));
    });
  });

  it("clicking outside the menu closes it", () => {
    const button = popularButton();
    button.click();
    expect(document.querySelector(".ytps-menu")).not.toBeNull();

    document.body.click();

    expect(document.querySelector(".ytps-menu")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("pressing Escape closes the menu", () => {
    const button = popularButton();
    button.click();
    expect(document.querySelector(".ytps-menu")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector(".ytps-menu")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking a menu item closes the menu and updates the chip label", () => {
    const button = popularButton();
    button.click();

    const menu = document.querySelector(".ytps-menu")!;
    const weekItem = Array.from(menu.querySelectorAll<HTMLElement>(".ytps-menu-item")).find(
      (el) => el.textContent === "This week"
    )!;

    weekItem.click();

    expect(document.querySelector(".ytps-menu")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");

    const rangeSpan = button.querySelector(".ytps-range");
    expect(rangeSpan?.textContent).toBe(" · This week");
  });
});
