import {
  TimeRangeId,
  YouTubeApiError,
  fetchPopularVideos,
  getApiKey,
  getPublishedAfter,
  getVideoKindFromUrl,
  resolveChannelId,
} from "./youtube_api";
import { ensureResultsPanel, removeResultsPanel, renderStatus, renderVideos } from "./results_panel";

interface TimeRange {
  id: TimeRangeId;
  label: string;
}

const TIME_RANGES: TimeRange[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

const DEFAULT_RANGE: TimeRangeId = "all";
const PROCESSED_ATTR = "data-ytps-processed";
const SIBLING_PROCESSED_ATTR = "data-ytps-sibling-processed";

let selectedRange: TimeRangeId = DEFAULT_RANGE;
let currentMenu: HTMLElement | null = null;
let activeButton: HTMLButtonElement | null = null;
let bypassNextClick = false;

function rangeLabel(id: TimeRangeId): string {
  return TIME_RANGES.find((range) => range.id === id)!.label;
}

function isChannelSortChip(button: HTMLElement): boolean {
  const chipBar = button.closest("chip-bar-view-model");
  if (!chipBar) return false;

  const labels = new Set(
    Array.from(chipBar.querySelectorAll<HTMLElement>("button[aria-label]")).map((el) =>
      el.getAttribute("aria-label")
    )
  );

  return labels.has("Latest") && labels.has("Popular") && labels.has("Oldest");
}

function closeMenu(): void {
  if (!currentMenu) return;

  currentMenu.remove();
  currentMenu = null;

  if (activeButton) {
    activeButton.setAttribute("aria-expanded", "false");
    activeButton = null;
  }

  document.removeEventListener("click", handleOutsideClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);
  window.removeEventListener("scroll", closeMenu, true);
  window.removeEventListener("resize", closeMenu, true);
}

function handleOutsideClick(event: MouseEvent): void {
  if (currentMenu && !currentMenu.contains(event.target as Node) && event.target !== activeButton) {
    closeMenu();
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeMenu();
}

function positionMenu(menu: HTMLElement, button: HTMLButtonElement): void {
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
}

// The range suffix (e.g. "· This week") only makes sense while the Popular
// chip is the active sort; otherwise it just reads "Popular" like the other
// chips, with a dropdown to pick a range and activate it.
function updateChipLabel(button: HTMLButtonElement): void {
  const rangeSpan = button.querySelector<HTMLSpanElement>(".ytps-range");
  if (!rangeSpan) return;
  rangeSpan.textContent =
    button.getAttribute("aria-selected") === "true" ? ` · ${rangeLabel(selectedRange)}` : "";
}

function selectRange(button: HTMLButtonElement, rangeId: TimeRangeId): void {
  selectedRange = rangeId;
  closeMenu();
  void applyRange(button, rangeId);
}

// Leaving the current page for any reason (navigating home, to a different
// channel, or switching between a channel's Videos and Shorts tabs) wipes a
// non-default range back to "All time" so it never carries over to wherever
// the user navigates next.
function resetSelectedRange(): void {
  if (selectedRange === DEFAULT_RANGE) return;
  selectedRange = DEFAULT_RANGE;

  document
    .querySelectorAll<HTMLButtonElement>(`button[aria-label="Popular"][${PROCESSED_ATTR}]`)
    .forEach((button) => {
      updateChipLabel(button);

      const richGrid = button.closest("ytd-rich-grid-renderer");
      if (!richGrid) return;

      removeResultsPanel(richGrid);
      const contents = richGrid.querySelector<HTMLElement>("#contents");
      if (contents) contents.style.display = "";
    });
}

function setChipActive(chip: HTMLElement, active: boolean): void {
  chip.setAttribute("aria-selected", String(active));
  const shape = chip.querySelector(".ytChipShapeChip");
  shape?.classList.toggle("ytChipShapeActive", active);
  shape?.classList.toggle("ytChipShapeInactive", !active);
}

function setPopularActive(popularButton: HTMLButtonElement): void {
  const chipBar = popularButton.closest("chip-bar-view-model");
  chipBar?.querySelectorAll<HTMLElement>("button[aria-label]").forEach((chip) => {
    setChipActive(chip, chip === popularButton);
  });
}

function describeFetchError(error: unknown): string {
  if (error instanceof YouTubeApiError) {
    if (error.status === 403) {
      return "YouTube API request was rejected. Check your API key and quota in the extension's options page.";
    }
    return `YouTube API error: ${error.message}`;
  }
  return "Couldn't load popular videos. Please try again later.";
}

async function applyRange(button: HTMLButtonElement, rangeId: TimeRangeId): Promise<void> {
  const richGrid = button.closest("ytd-rich-grid-renderer");
  if (!richGrid) return;

  setPopularActive(button);
  updateChipLabel(button);

  if (rangeId === "all") {
    removeResultsPanel(richGrid);
    const contents = richGrid.querySelector<HTMLElement>("#contents");
    if (contents) contents.style.display = "";

    // Trigger YouTube's native "Popular" sort (its closest equivalent is all-time view count).
    bypassNextClick = true;
    button.click();
    return;
  }

  const contents = richGrid.querySelector<HTMLElement>("#contents");
  if (contents) contents.style.display = "none";

  const panel = ensureResultsPanel(richGrid);
  renderStatus(panel, "Loading popular videos…");

  const apiKey = await getApiKey();
  if (!apiKey) {
    renderStatus(
      panel,
      "Add a YouTube Data API key in the extension's options page to enable time-based Popular sorting."
    );
    return;
  }

  const channelId = await resolveChannelId(apiKey);
  if (!channelId) {
    renderStatus(panel, "Couldn't determine the channel for this page.");
    return;
  }

  try {
    const publishedAfter = getPublishedAfter(rangeId);
    const videos = await fetchPopularVideos(channelId, apiKey, publishedAfter, getVideoKindFromUrl());
    if (videos.length === 0) {
      renderStatus(panel, `No videos found for "${rangeLabel(rangeId)}".`);
    } else {
      renderVideos(panel, videos);
    }
  } catch (error) {
    renderStatus(panel, describeFetchError(error));
  }
}

function buildMenu(button: HTMLButtonElement): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "ytps-menu";
  menu.setAttribute("role", "menu");

  const header = document.createElement("div");
  header.className = "ytps-menu-header";
  header.textContent = "Popular videos from";
  menu.appendChild(header);

  TIME_RANGES.forEach((range) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ytps-menu-item";
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(range.id === selectedRange));
    if (range.id === selectedRange) item.classList.add("is-selected");
    item.textContent = range.label;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectRange(button, range.id);
    });
    menu.appendChild(item);
  });

  return menu;
}

function openMenu(button: HTMLButtonElement): void {
  closeMenu();

  const menu = buildMenu(button);
  document.body.appendChild(menu);
  positionMenu(menu, button);

  currentMenu = menu;
  activeButton = button;
  button.setAttribute("aria-expanded", "true");

  document.addEventListener("click", handleOutsideClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu, true);
}

function toggleMenu(button: HTMLButtonElement): void {
  if (currentMenu && activeButton === button) {
    closeMenu();
  } else {
    openMenu(button);
  }
}

function enhancePopularChip(button: HTMLButtonElement): void {
  button.setAttribute(PROCESSED_ATTR, "true");
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");

  const labelContainer = button.querySelector(".ytChipShapeChip > div");
  if (!labelContainer) return;

  const rangeSpan = document.createElement("span");
  rangeSpan.className = "ytps-range";

  const caret = document.createElement("span");
  caret.className = "ytps-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.setAttribute("title", "Choose a time range");
  caret.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
    '<path d="M18.707 8.793a1 1 0 00-1.414 0L12 14.086 6.707 8.793a1 1 0 10-1.414 1.414L12 16.914l6.707-6.707a1 1 0 000-1.414Z"></path>' +
    "</svg>";

  labelContainer.appendChild(rangeSpan);
  labelContainer.appendChild(caret);

  updateChipLabel(button);

  // The caret opens the range dropdown; the rest of the chip behaves like
  // Latest/Oldest and immediately (re)applies the currently selected range.
  button.addEventListener(
    "click",
    (event) => {
      if (bypassNextClick) {
        bypassNextClick = false;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();

      if (caret.contains(event.target as Node)) {
        toggleMenu(button);
        return;
      }

      closeMenu();
      void applyRange(button, selectedRange);
    },
    true
  );
}

// "Latest"/"Oldest" know nothing about our results panel, so clicking them
// while it's open would leave it (and the hidden native grid) in place.
function enhanceSiblingChips(popularButton: HTMLButtonElement): void {
  const chipBar = popularButton.closest("chip-bar-view-model");
  if (!chipBar) return;

  chipBar
    .querySelectorAll<HTMLButtonElement>('button[aria-label="Latest"], button[aria-label="Oldest"]')
    .forEach((button) => {
      if (button.hasAttribute(SIBLING_PROCESSED_ATTR)) return;
      button.setAttribute(SIBLING_PROCESSED_ATTR, "true");

      button.addEventListener("click", () => {
        const richGrid = button.closest("ytd-rich-grid-renderer");
        if (!richGrid) return;

        removeResultsPanel(richGrid);
        const contents = richGrid.querySelector<HTMLElement>("#contents");
        if (contents) contents.style.display = "";

        const bar = button.closest("chip-bar-view-model");
        bar?.querySelectorAll<HTMLElement>("button[aria-label]").forEach((chip) => {
          setChipActive(chip, chip === button);
        });

        updateChipLabel(popularButton);
      });
    });
}

function scanForPopularChip(): void {
  const candidates = document.querySelectorAll<HTMLButtonElement>(
    `button[aria-label="Popular"]:not([${PROCESSED_ATTR}])`
  );

  candidates.forEach((button) => {
    if (!isChannelSortChip(button)) return;
    enhancePopularChip(button);
    enhanceSiblingChips(button);
  });
}

function init(): void {
  scanForPopularChip();

  const observer = new MutationObserver(() => scanForPopularChip());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("yt-navigate-finish", () => {
    closeMenu();
    resetSelectedRange();
    scanForPopularChip();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
