type TimeRangeId = "today" | "week" | "month" | "year" | "all";

interface TimeRange {
  id: TimeRangeId;
  label: string;
}

const TIME_RANGES: TimeRange[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

const DEFAULT_RANGE: TimeRangeId = "all";
const STORAGE_KEY = "ytps_selected_range";
const PROCESSED_ATTR = "data-ytps-processed";

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

function persistSelectedRange(rangeId: TimeRangeId): void {
  chrome.storage?.local?.set({ [STORAGE_KEY]: rangeId });
}

function updateChipLabel(button: HTMLButtonElement): void {
  const rangeSpan = button.querySelector<HTMLSpanElement>(".ytps-range");
  if (rangeSpan) rangeSpan.textContent = ` · ${rangeLabel(selectedRange)}`;
}

function selectRange(button: HTMLButtonElement, rangeId: TimeRangeId): void {
  selectedRange = rangeId;
  updateChipLabel(button);
  persistSelectedRange(rangeId);
  closeMenu();

  // Trigger YouTube's native "Popular" sort (closest equivalent today is all-time view count).
  bypassNextClick = true;
  button.click();
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
  rangeSpan.textContent = ` · ${rangeLabel(selectedRange)}`;

  const caret = document.createElement("span");
  caret.className = "ytps-caret";
  caret.textContent = "▾";
  caret.setAttribute("aria-hidden", "true");

  labelContainer.appendChild(rangeSpan);
  labelContainer.appendChild(caret);

  button.addEventListener(
    "click",
    (event) => {
      if (bypassNextClick) {
        bypassNextClick = false;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleMenu(button);
    },
    true
  );
}

function scanForPopularChip(): void {
  const candidates = document.querySelectorAll<HTMLButtonElement>(
    `button[aria-label="Popular"]:not([${PROCESSED_ATTR}])`
  );

  candidates.forEach((button) => {
    if (isChannelSortChip(button)) enhancePopularChip(button);
  });
}

function init(): void {
  chrome.storage?.local?.get([STORAGE_KEY], (result) => {
    const stored = result?.[STORAGE_KEY] as TimeRangeId | undefined;
    if (stored && TIME_RANGES.some((range) => range.id === stored)) {
      selectedRange = stored;
    }

    scanForPopularChip();

    const observer = new MutationObserver(() => scanForPopularChip());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("yt-navigate-finish", () => {
      closeMenu();
      scanForPopularChip();
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
