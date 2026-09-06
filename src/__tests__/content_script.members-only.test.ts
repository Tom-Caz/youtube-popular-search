import {
  dropdownChipBarFixtureHtml,
  standaloneDropdownChipBarHtml,
  sortSheetHtml,
  mockCaretBoundingClientRect,
  clickCaret,
  hoverSheetArrow,
  hoverSheetLabel,
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

document.body.innerHTML = dropdownChipBarFixtureHtml("Latest") + standaloneDropdownChipBarHtml();
mockCaretBoundingClientRect();

await import("../content_script");

// The module's MutationObserver fires asynchronously; flush it before the
// jsdom environment is torn down so its callback doesn't run against a
// destroyed `document`.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function sortChip(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>("ytd-rich-grid-renderer button[role=combobox]")!;
}

function labelContainer(): HTMLElement {
  return sortChip().querySelector<HTMLElement>(".ytChipShapeChip > div")!;
}

function rangeSpan(): HTMLElement {
  return sortChip().querySelector<HTMLElement>(".ytps-range")!;
}

function chevron(): HTMLElement {
  return sortChip().querySelector<HTMLElement>(".ytChipShapeIconEnd")!;
}

function popupContainer(): HTMLElement {
  return document.querySelector<HTMLElement>("ytd-popup-container")!;
}

function sheetRow(label: string): HTMLElement {
  return Array.from(document.querySelectorAll<HTMLElement>("yt-list-item-view-model")).find((row) =>
    (row.textContent ?? "").trim().startsWith(label)
  )!;
}

function menuItem(label: string): HTMLElement {
  return Array.from(document.querySelectorAll<HTMLElement>(".ytps-menu-item")).find(
    (el) => el.textContent === label
  )!;
}

function membersOnlyTab(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('button[aria-label="Members only"]')!;
}

function richGrid(): HTMLElement {
  return document.querySelector("ytd-rich-grid-renderer")!;
}

function contentsHidden(): boolean {
  return richGrid().querySelector("#contents")!.classList.contains("ytps-contents-hidden");
}

function resultsPanel(): Element | null {
  return richGrid().querySelector(".ytps-results");
}

function currentSort(): string {
  return labelContainer().firstChild!.textContent!.trim();
}

// YouTube rewrites the dropdown chip's label in place when the sort changes,
// leaving the button (and our decorations) alone.
async function setNativeSort(sort: string): Promise<void> {
  labelContainer().firstChild!.textContent = sort;
  await vi.waitFor(() => expect(rangeSpan().textContent).toBe(sort === "Popular" ? " · All time" : ""));
}

// Stands in for YouTube: the chip opens a sheet, and tapping one of its rows
// switches the sort and closes the sheet again.
async function openSortSheet(): Promise<HTMLElement> {
  sortChip().click();
  popupContainer().innerHTML = sortSheetHtml(currentSort());

  document.querySelectorAll<HTMLElement>("yt-list-item-view-model").forEach((row) => {
    row.addEventListener("click", () => {
      labelContainer().firstChild!.textContent = (row.textContent ?? "").replace("✓", "").trim();
      popupContainer().innerHTML = "";
    });
  });

  await vi.waitFor(() => expect(sheetRow("Popular").querySelector(".ytps-submenu-arrow")).not.toBeNull());
  return sheetRow("Popular");
}

async function hoverPopularRow(): Promise<void> {
  hoverSheetArrow(sheetRow("Popular"));
  await vi.waitFor(() => expect(document.querySelector(".ytps-menu")).not.toBeNull());
}

function clickChipAt(clientX: number): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY: 9 });
  sortChip().dispatchEvent(event);
  return event;
}

// The whole flow the submenu exists for: open the sheet, hover Popular, pick a
// range — settled, so a fetch from this pick can't land in a later assertion.
async function pickRangeFromSheet(label: string): Promise<void> {
  const renders = vi.mocked(renderVideos).mock.calls.length;

  await openSortSheet();
  await hoverPopularRow();
  menuItem(label).click();

  if (label === "All time") return;
  await vi.waitFor(() => expect(vi.mocked(renderVideos).mock.calls.length).toBe(renders + 1));
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

afterEach(async () => {
  // Leave no open menu, no open sheet and no custom range between tests.
  if (document.querySelector(".ytps-menu")) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }
  popupContainer().innerHTML = "";
  await setNativeSort("Latest");
});

describe("content_script: the range submenu in YouTube's sort sheet", () => {
  it("decorates the dropdown chip but leaves it to YouTube while another sort is active", () => {
    const chip = sortChip();

    expect(chip.getAttribute("data-ytps-dropdown")).toBe("true");
    expect(rangeSpan()).not.toBeNull();
    expect(rangeSpan().textContent).toBe("");
    // No caret of ours: the chip has YouTube's own chevron.
    expect(chip.querySelector(".ytps-caret")).toBeNull();

    const event = clickChipAt(109);

    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector(".ytps-menu")).toBeNull();
  });

  it("opens the range menu straight from the chevron once Popular is the active sort", async () => {
    await setNativeSort("Popular");

    clickCaret(chevron());

    expect(document.querySelector(".ytps-menu")).not.toBeNull();
    expect(Array.from(document.querySelectorAll(".ytps-menu-item")).map((el) => el.textContent)).toEqual([
      "This week",
      "This month",
      "This year",
      "All time",
    ]);

    menuItem("This week").click();

    await vi.waitFor(() => expect(rangeSpan().textContent).toBe(" · This week"));
    expect(resultsPanel()).not.toBeNull();
    expect(contentsHidden()).toBe(true);

    // ...and again, without going through the sheet: one click to the ranges.
    clickCaret(chevron());
    expect(document.querySelector(".ytps-menu")).not.toBeNull();
    menuItem("All time").click();

    await vi.waitFor(() => expect(rangeSpan().textContent).toBe(" · All time"));
    expect(resultsPanel()).toBeNull();
  });

  it("keeps the rest of the chip — the range text included — on YouTube's sort sheet", async () => {
    await setNativeSort("Popular");
    clickCaret(chevron());
    menuItem("This week").click();
    await vi.waitFor(() => expect(rangeSpan().textContent).toBe(" · This week"));

    // The range text sits between the label and the chevron; clicking it is
    // still a click on the chip, not on our menu's trigger.
    expect(clickChipAt(69).defaultPrevented).toBe(false);
    expect(document.querySelector(".ytps-menu")).toBeNull();

    expect(clickChipAt(10).defaultPrevented).toBe(false);
    expect(document.querySelector(".ytps-menu")).toBeNull();
  });

  it("gets out of the way when the click belongs to YouTube's sheet", async () => {
    await setNativeSort("Popular");

    clickCaret(chevron());
    expect(document.querySelector(".ytps-menu")).not.toBeNull();

    // With our menu open, clicking the chip's label has to hand over to
    // YouTube rather than leave two menus fighting over the chip.
    expect(clickChipAt(10).defaultPrevented).toBe(false);
    expect(document.querySelector(".ytps-menu")).toBeNull();
  });

  it("leaves a lookalike dropdown chip outside a video grid untouched", () => {
    const chip = document.querySelector<HTMLButtonElement>("#unrelated-dropdown-chip-bar button")!;

    expect(chip.hasAttribute("data-ytps-processed")).toBe(false);
    expect(chip.querySelector(".ytps-range")).toBeNull();
  });

  it("adds the submenu arrow to the sheet's Popular row only", async () => {
    await openSortSheet();

    expect(sheetRow("Popular").querySelector(".ytps-submenu-arrow")).not.toBeNull();
    expect(sheetRow("Latest").querySelector(".ytps-submenu-arrow")).toBeNull();
    expect(sheetRow("Oldest").querySelector(".ytps-submenu-arrow")).toBeNull();
  });

  it("opens the range menu only from the arrow end of the row", async () => {
    const row = await openSortSheet();

    hoverSheetLabel(row);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.querySelector(".ytps-menu")).toBeNull();

    await hoverPopularRow();

    // Moving back over the label closes it again.
    hoverSheetLabel(row);
    await vi.waitFor(() => expect(document.querySelector(".ytps-menu")).toBeNull());
  });

  it("opens the range menu on hover and closes it when the pointer leaves", async () => {
    const row = await openSortSheet();
    await hoverPopularRow();

    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(Array.from(document.querySelectorAll(".ytps-menu-item")).map((el) => el.textContent)).toEqual([
      "This week",
      "This month",
      "This year",
      "All time",
    ]);

    row.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.waitFor(() => expect(document.querySelector(".ytps-menu")).toBeNull());
  });

  it("keeps the menu open while the pointer is inside it", async () => {
    const row = await openSortSheet();
    await hoverPopularRow();

    const menu = document.querySelector<HTMLElement>(".ytps-menu")!;
    row.dispatchEvent(new MouseEvent("mouseleave"));
    menu.dispatchEvent(new MouseEvent("mouseenter"));

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.querySelector(".ytps-menu")).toBe(menu);
  });

  it("picks a range in one pass: YouTube sorts by Popular and we layer the range on top", async () => {
    await openSortSheet();
    await hoverPopularRow();

    menuItem("This week").click();


    // Our synthetic tap ran YouTube's own sort, which closed the sheet.
    expect(currentSort()).toBe("Popular");
    expect(popupContainer().querySelector("yt-list-item-view-model")).toBeNull();
    expect(document.querySelector(".ytps-menu")).toBeNull();

    await vi.waitFor(() => expect(renderVideos).toHaveBeenCalledWith(expect.anything(), [FAKE_VIDEO]));

    expect(resultsPanel()).not.toBeNull();
    expect(contentsHidden()).toBe(true);
    await vi.waitFor(() => expect(rangeSpan().textContent).toBe(" · This week"));
    // The chips beside it are content filters, not sorts, so their selection
    // is left alone.
    expect(membersOnlyTab().getAttribute("aria-selected")).toBe("false");
  });

  it("hands 'All time' straight back to YouTube's own Popular sort", async () => {
    await pickRangeFromSheet("This week");
    const fetchCountBefore = vi.mocked(fetchPopularVideos).mock.calls.length;

    await pickRangeFromSheet("All time");

    expect(currentSort()).toBe("Popular");
    expect(resultsPanel()).toBeNull();
    expect(contentsHidden()).toBe(false);
    expect(vi.mocked(fetchPopularVideos).mock.calls.length).toBe(fetchCountBefore);
    await vi.waitFor(() => expect(rangeSpan().textContent).toBe(" · All time"));
  });

  it("treats a plain tap on the Popular row as YouTube's all-time sort", async () => {
    await pickRangeFromSheet("This week");

    const row = await openSortSheet();
    row.click();

    expect(resultsPanel()).toBeNull();
    expect(contentsHidden()).toBe(false);
    expect(document.querySelector(".ytps-menu")).toBeNull();
    await vi.waitFor(() => expect(rangeSpan().textContent).toBe(" · All time"));
  });

  it("closes the submenu when YouTube closes the sheet under it", async () => {
    await openSortSheet();
    await hoverPopularRow();

    popupContainer().innerHTML = "";

    await vi.waitFor(() => expect(document.querySelector(".ytps-menu")).toBeNull());
  });

  it("drops a custom range when YouTube switches the sort away from Popular", async () => {
    await pickRangeFromSheet("This week");
    expect(resultsPanel()).not.toBeNull();

    const row = await openSortSheet();
    sheetRow("Latest").click();
    expect(row.isConnected).toBe(false);

    await vi.waitFor(() => expect(rangeSpan().textContent).toBe(""));
    expect(resultsPanel()).toBeNull();
    expect(contentsHidden()).toBe(false);
  });

  it("drops a custom range when a 'Members only'/'Public' filter tab is clicked", async () => {
    await pickRangeFromSheet("This week");

    const fetchCountBefore = vi.mocked(fetchPopularVideos).mock.calls.length;
    membersOnlyTab().click();

    expect(resultsPanel()).toBeNull();
    expect(contentsHidden()).toBe(false);
    // The sort is still Popular, so the chip falls back to YouTube's own
    // all-time results.
    expect(rangeSpan().textContent).toBe(" · All time");
    // Switching filters must not re-trigger our custom fetch.
    expect(vi.mocked(fetchPopularVideos).mock.calls.length).toBe(fetchCountBefore);
  });
});
