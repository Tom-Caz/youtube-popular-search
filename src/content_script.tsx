import {
  TimeRangeId,
  VideoKind,
  YouTubeApiError,
  fetchPopularVideos,
  getApiKey,
  getPublishedAfter,
  getVideoKindFromUrl,
  resolveChannelId,
} from "./youtube_api";
import {
  appendVideos,
  ensureResultsPanel,
  removeLoadMoreButton,
  removeResultsPanel,
  renderLoadMoreButton,
  renderMissingApiKeyStatus,
  renderStatus,
  renderVideos,
  setLoadMoreButtonState,
} from "./results_panel";
import { findSortSheetPopularRow } from "./sort_sheet";

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
// Marks a chip we enhanced in its dropdown form (see isSortDropdownChip).
const DROPDOWN_ATTR = "data-ytps-dropdown";
// Marks the "Popular" row of YouTube's sort sheet once we've hung our range
// submenu off it.
const SHEET_ROW_ATTR = "data-ytps-sheet-row";

const SORT_LABELS = ["Latest", "Popular", "Oldest"];
const POPULAR_LABEL = "Popular";

// Sheets only open in response to a click on the dropdown chip, so the search
// for their "Popular" row runs for a short window after one instead of on
// every mutation the page makes.
const SHEET_SCAN_WINDOW_MS = 2500;
// Popups YouTube might render the sheet into, re-checked during that window in
// case the sheet's DOM was reused rather than freshly inserted.
const SHEET_ROOTS =
  "ytd-popup-container, tp-yt-iron-dropdown, yt-sheet-view-model, [role=dialog], [role=menu], [role=listbox]";

// Long enough not to fire while the pointer merely crosses the row on its way
// to another sort, short enough to feel immediate.
const SUBMENU_OPEN_DELAY_MS = 120;
// Covers the trip from the row to the submenu.
const SUBMENU_CLOSE_DELAY_MS = 220;
// Only the arrow end of the row opens the submenu — the rest of it is
// YouTube's plain "Popular" — with a little slack so the pointer doesn't have
// to land on the icon exactly.
const SUBMENU_HOVER_SLACK = 8;
// How much wider than the row an ancestor can be and still be part of the
// sheet (its padding, border and shadow) rather than the page behind it.
const SHEET_PADDING_ALLOWANCE = 48;

// How long to wait for YouTube to repaint the chip label after we've asked it
// to switch to its Popular sort, before concluding the switch isn't coming.
const POPULAR_SWITCH_GRACE_MS = 3000;

// Hides #contents while our results panel is shown. Uses visibility+position
// rather than `display: none` so YouTube's own visibility/intersection
// checks still see it as live and keep its content up to date for the next
// time the user switches tabs back to it (display: none made YouTube skip
// repopulating it, leaving stale videos behind after a tab switch).
const CONTENTS_HIDDEN_CLASS = "ytps-contents-hidden";

function hideContents(richGrid: Element): void {
  richGrid.querySelector<HTMLElement>("#contents")?.classList.add(CONTENTS_HIDDEN_CLASS);
}

function showContents(richGrid: Element): void {
  richGrid.querySelector<HTMLElement>("#contents")?.classList.remove(CONTENTS_HIDDEN_CLASS);
}

let selectedRange: TimeRangeId = DEFAULT_RANGE;
let currentMenu: HTMLElement | null = null;
let menuAnchor: HTMLElement | null = null;
let bypassNextClick = false;
// Same idea for the sheet row: the tap we synthesise to switch YouTube's sort
// is ours, not the user choosing plain all-time Popular.
let bypassNextSheetTap = false;

// Set while the sort sheet might be opening, so the search for its rows stays
// off the page's normal DOM churn.
let sheetScanDeadline = 0;
let sheetScanTimer: ReturnType<typeof setTimeout> | undefined;
let submenuOpenTimer: ReturnType<typeof setTimeout> | undefined;
let submenuCloseTimer: ReturnType<typeof setTimeout> | undefined;

// Whether the sheet's "Popular" row was ever found. If it never is (YouTube
// changed the sheet's markup), the chip's chevron takes over as the way into
// the range menu — see useChevronFallback.
let sheetEnhanced = false;
let sheetDetectionFailed = false;

// Set when we ask YouTube to switch to its Popular sort; until the chip's
// label catches up, the sort looks "not Popular" and would otherwise trip the
// teardown in syncDropdownChips.
let pendingPopularUntil = 0;

// Bumped whenever the current request is no longer relevant (range changed,
// sort changed, or the user navigated away/switched tabs) so a late-arriving
// fetch response can detect it's stale and avoid rendering into the page.
let requestGeneration = 0;

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

function chipLabelContainer(button: HTMLElement): HTMLElement | null {
  return button.querySelector<HTMLElement>(".ytChipShapeChip > div");
}

// The chip's own label ("Latest"/"Popular"/"Oldest"), ignoring the range
// suffix we inject into the same container.
function sortLabelText(button: HTMLElement): string {
  const label = chipLabelContainer(button);
  if (!label) return "";

  return Array.from(label.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
}

function isDropdownChip(button: HTMLElement): boolean {
  return button.hasAttribute(DROPDOWN_ATTR);
}

// Channels with a members-only section render the sort as a single dropdown
// chip that opens YouTube's own Latest/Popular/Oldest sheet, next to
// "Members only"/"Public" filter tabs, instead of the usual row of
// Latest/Popular/Oldest chips. That chip carries no aria-label, so it's
// identified by its combobox role and the sort it currently displays.
function isSortDropdownChip(button: HTMLElement): boolean {
  if (button.getAttribute("role") !== "combobox") return false;
  if (!button.closest("chip-bar-view-model")) return false;
  if (!button.closest("ytd-rich-grid-renderer")) return false;
  // Its chevron is what opens our menu, so without one there's nothing for us
  // to hang the range picker on.
  if (!button.querySelector(".ytChipShapeIconEnd")) return false;

  return SORT_LABELS.includes(sortLabelText(button));
}

// Whether YouTube is currently sorting by Popular: a plain chip bar marks the
// active sort with aria-selected, while the dropdown chip simply displays it.
function isPopularActive(button: HTMLElement): boolean {
  return isDropdownChip(button)
    ? sortLabelText(button) === POPULAR_LABEL
    : button.getAttribute("aria-selected") === "true";
}

// The element that opens our range menu: our own caret on a plain chip, and
// YouTube's chevron on the dropdown chip, which already has one.
function chipCaret(button: HTMLElement): HTMLElement | null {
  return button.querySelector<HTMLElement>(
    isDropdownChip(button) ? ".ytChipShapeIconEnd" : ".ytps-caret"
  );
}

function closeMenu(): void {
  cancelSubmenuTimers();

  if (!currentMenu) return;

  currentMenu.remove();
  currentMenu = null;

  if (menuAnchor) {
    menuAnchor.setAttribute("aria-expanded", "false");
    menuAnchor = null;
  }

  document.removeEventListener("click", handleOutsideClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);
  window.removeEventListener("scroll", closeMenu, true);
  window.removeEventListener("resize", closeMenu, true);
}

function handleOutsideClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (currentMenu && !currentMenu.contains(target) && !menuAnchor?.contains(target)) {
    closeMenu();
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeMenu();
}

// Below the chip, like YouTube's own chip dropdowns.
function positionMenu(menu: HTMLElement, button: HTMLButtonElement): void {
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
}

// The row sits inside the sheet's padding, so hugging the row's own edge
// would leave a gap between the two menus. Grow the anchor out to the widest
// ancestor that's still sheet-sized.
function submenuAnchor(row: HTMLElement): { left: number; right: number; top: number } {
  const rowRect = row.getBoundingClientRect();
  let left = rowRect.left;
  let right = rowRect.right;

  for (let el = row.parentElement; el; el = el.parentElement) {
    const rect = el.getBoundingClientRect();
    // The first ancestor wider than a menu is the page behind the sheet.
    if (rect.width > rowRect.width + SHEET_PADDING_ALLOWANCE) break;

    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }

  return { left, right, top: rowRect.top };
}

// Flush against the sheet, like a native submenu, flipping to its other side
// (and sliding up) rather than overflowing the viewport.
function positionSubmenu(menu: HTMLElement, row: HTMLElement): void {
  const anchor = submenuAnchor(row);

  const left =
    anchor.right + menu.offsetWidth > window.innerWidth ? anchor.left - menu.offsetWidth : anchor.right;
  const top = Math.min(anchor.top, Math.max(8, window.innerHeight - menu.offsetHeight - 8));

  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(0, left)}px`;
}

// The range suffix (e.g. "· This week") only makes sense while the Popular
// chip is the active sort; otherwise it just reads "Popular" like the other
// chips, with a dropdown to pick a range and activate it.
function updateChipLabel(button: HTMLButtonElement): void {
  const rangeSpan = button.querySelector<HTMLSpanElement>(".ytps-range");
  if (!rangeSpan) return;

  const label = isPopularActive(button) ? ` · ${rangeLabel(selectedRange)}` : "";
  // Guarded so our own no-op writes don't re-trigger the label observer
  // (see watchSortLabel).
  if (rangeSpan.textContent !== label) rangeSpan.textContent = label;
}

function selectRange(button: HTMLButtonElement, rangeId: TimeRangeId): void {
  selectedRange = rangeId;
  closeMenu();
  void applyRange(button, rangeId);
}

// Leaving the current page for any reason (navigating home, to a different
// channel, or switching between a channel's Videos and Shorts tabs) wipes a
// non-default range back to "All time" so it never carries over to wherever
// the user navigates next. Always runs the full cleanup (even if the range
// was already "All time"), since a results panel/hidden #contents can be
// left over from a stale request that hadn't rendered yet.
function resetSelectedRange(): void {
  selectedRange = DEFAULT_RANGE;

  document.querySelectorAll<HTMLButtonElement>(`button[${PROCESSED_ATTR}]`).forEach((button) => {
    updateChipLabel(button);

    const richGrid = button.closest("ytd-rich-grid-renderer");
    if (!richGrid) return;

    removeResultsPanel(richGrid);
    showContents(richGrid);
  });
}

function setChipActive(chip: HTMLElement, active: boolean): void {
  chip.setAttribute("aria-selected", String(active));
  const shape = chip.querySelector(".ytChipShapeChip");
  shape?.classList.toggle("ytChipShapeActive", active);
  shape?.classList.toggle("ytChipShapeInactive", !active);
}

function setPopularActive(popularButton: HTMLButtonElement): void {
  // The dropdown chip is only ours while YouTube already has Popular
  // selected, and its siblings are content filters rather than sorts, so
  // there is no sort selection for us to move.
  if (isDropdownChip(popularButton)) return;

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

  // Invalidate any in-flight request from a previous range/tab so its
  // results can't land here after this one starts (e.g. switching ranges or
  // tabs mid-fetch shouldn't let the stale fetch's videos render).
  const generation = ++requestGeneration;

  setPopularActive(button);
  updateChipLabel(button);

  if (rangeId === "all") {
    removeResultsPanel(richGrid);
    showContents(richGrid);

    // Trigger YouTube's native "Popular" sort (its closest equivalent is
    // all-time view count). The dropdown chip is only enhanced while Popular
    // is already the active sort, so the grid underneath already shows it —
    // clicking there would just open YouTube's sort sheet.
    if (!isDropdownChip(button)) {
      bypassNextClick = true;
      button.click();
    }
    return;
  }

  hideContents(richGrid);

  const panel = ensureResultsPanel(richGrid);
  renderStatus(panel, "Loading popular videos…");

  const apiKey = await getApiKey();
  if (generation !== requestGeneration) return;
  if (!apiKey) {
    renderMissingApiKeyStatus(
      panel,
      "Add a YouTube Data API key in the extension's options page to enable time-based Popular sorting."
    );
    return;
  }

  const channelId = await resolveChannelId(apiKey);
  if (generation !== requestGeneration) return;
  if (!channelId) {
    renderStatus(panel, "Couldn't determine the channel for this page.");
    return;
  }

  try {
    const publishedAfter = getPublishedAfter(rangeId);
    const videoKind = getVideoKindFromUrl();
    const result = await fetchPopularVideos(channelId, apiKey, publishedAfter, videoKind);
    if (generation !== requestGeneration) return;
    if (result.videos.length === 0) {
      renderStatus(panel, `No videos found for "${rangeLabel(rangeId)}".`);
    } else {
      renderVideos(panel, result.videos);
      if (result.nextPageToken) {
        showLoadMore(panel, channelId, apiKey, publishedAfter, videoKind, result.nextPageToken, generation);
      }
    }
  } catch (error) {
    if (generation !== requestGeneration) return;
    renderStatus(panel, describeFetchError(error));
  }
}

function showLoadMore(
  panel: HTMLElement,
  channelId: string,
  apiKey: string,
  publishedAfter: string | null,
  videoKind: VideoKind,
  pageToken: string,
  generation: number
): void {
  renderLoadMoreButton(panel, () => {
    void loadMoreVideos(panel, channelId, apiKey, publishedAfter, videoKind, pageToken, generation);
  });
}

async function loadMoreVideos(
  panel: HTMLElement,
  channelId: string,
  apiKey: string,
  publishedAfter: string | null,
  videoKind: VideoKind,
  pageToken: string,
  generation: number
): Promise<void> {
  setLoadMoreButtonState(panel, "loading");

  try {
    const result = await fetchPopularVideos(channelId, apiKey, publishedAfter, videoKind, pageToken);
    if (generation !== requestGeneration) return;
    appendVideos(panel, result.videos);
    if (result.nextPageToken) {
      showLoadMore(panel, channelId, apiKey, publishedAfter, videoKind, result.nextPageToken, generation);
    } else {
      removeLoadMoreButton(panel);
    }
  } catch {
    if (generation !== requestGeneration) return;
    setLoadMoreButtonState(panel, "error");
  }
}

function buildMenu(onSelect: (rangeId: TimeRangeId) => void): HTMLElement {
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
      onSelect(range.id);
    });
    menu.appendChild(item);
  });

  return menu;
}

function activateMenu(menu: HTMLElement, anchor: HTMLElement): void {
  currentMenu = menu;
  menuAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");

  document.addEventListener("click", handleOutsideClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu, true);
}

function openChipMenu(button: HTMLButtonElement): void {
  closeMenu();

  const menu = buildMenu((rangeId) => selectRange(button, rangeId));
  document.body.appendChild(menu);
  positionMenu(menu, button);

  activateMenu(menu, button);
}

function toggleChipMenu(button: HTMLButtonElement): void {
  if (currentMenu && menuAnchor === button) {
    closeMenu();
  } else {
    openChipMenu(button);
  }
}

// The submenu hanging off the sheet's "Popular" row: picking a range here
// switches YouTube to its Popular sort and layers the range on top, so a
// custom range is one pass through the sheet rather than a sort, a reload and
// a second menu.
function openSheetMenu(row: HTMLElement, target: HTMLElement): void {
  closeMenu();

  const menu = buildMenu((rangeId) => applyRangeFromSheet(target, rangeId));
  menu.addEventListener("mouseenter", cancelSubmenuTimers);
  menu.addEventListener("mouseleave", scheduleSubmenuClose);
  document.body.appendChild(menu);
  positionSubmenu(menu, row);

  activateMenu(menu, row);
}

function toggleSheetMenu(row: HTMLElement, target: HTMLElement): void {
  if (currentMenu && menuAnchor === row) {
    closeMenu();
  } else {
    openSheetMenu(row, target);
  }
}

function cancelSubmenuTimers(): void {
  clearTimeout(submenuOpenTimer);
  clearTimeout(submenuCloseTimer);
  submenuOpenTimer = undefined;
  submenuCloseTimer = undefined;
}

function scheduleSubmenuOpen(row: HTMLElement, target: HTMLElement): void {
  clearTimeout(submenuCloseTimer);
  submenuCloseTimer = undefined;

  // Already open, or already on its way: a pointer moving inside the arrow's
  // zone must not keep restarting the countdown.
  if (currentMenu && menuAnchor === row) return;
  if (submenuOpenTimer !== undefined) return;

  submenuOpenTimer = setTimeout(() => {
    submenuOpenTimer = undefined;
    openSheetMenu(row, target);
  }, SUBMENU_OPEN_DELAY_MS);
}

function scheduleSubmenuClose(): void {
  cancelSubmenuTimers();

  submenuCloseTimer = setTimeout(() => {
    submenuCloseTimer = undefined;
    // Only ever closes a sheet submenu: the chip's menu is click-driven.
    if (menuAnchor?.hasAttribute(SHEET_ROW_ATTR)) closeMenu();
  }, SUBMENU_CLOSE_DELAY_MS);
}

function applyRangeFromSheet(target: HTMLElement, rangeId: TimeRangeId): void {
  const chip = document.querySelector<HTMLButtonElement>(`button[${DROPDOWN_ATTR}]`);
  if (!chip) return;

  selectedRange = rangeId;
  closeMenu();

  // Hand the sort switch to YouTube (which also closes its sheet), then layer
  // our range on top of the grid it loads. "All time" needs nothing more:
  // YouTube's Popular sort is the all-time view count.
  pendingPopularUntil = Date.now() + POPULAR_SWITCH_GRACE_MS;
  bypassNextSheetTap = true;
  target.click();
  bypassNextSheetTap = false;

  void applyRange(chip, rangeId);
}

function buildCaret(className: string): HTMLElement {
  const caret = document.createElement("span");
  caret.className = className;
  caret.setAttribute("aria-hidden", "true");
  caret.setAttribute("title", "Choose a time range");
  caret.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
    '<path d="M18.707 8.793a1 1 0 00-1.414 0L12 14.086 6.707 8.793a1 1 0 10-1.414 1.414L12 16.914l6.707-6.707a1 1 0 000-1.414Z"></path>' +
    "</svg>";
  return caret;
}

// Adds the range text (and, on a plain chip, the caret that opens our menu)
// to the chip's label. Idempotent, so a YouTube re-render that wipes the
// label can be repaired without re-registering the chip's click handler.
function decorateChip(button: HTMLButtonElement): boolean {
  const labelContainer = chipLabelContainer(button);
  if (!labelContainer) return false;

  if (!labelContainer.querySelector(".ytps-range")) {
    const rangeSpan = document.createElement("span");
    rangeSpan.className = "ytps-range";
    labelContainer.appendChild(rangeSpan);

    // The dropdown chip already carries YouTube's own chevron; a plain chip
    // needs one of its own.
    if (!isDropdownChip(button)) labelContainer.appendChild(buildCaret("ytps-caret"));
  }

  if (isDropdownChip(button)) watchSortLabel(labelContainer);

  updateChipLabel(button);
  return true;
}

// YouTube renders a touch-feedback overlay on top of the whole chip, so
// event.target is always that overlay, never our caret/range elements. Detect
// a click on the dropdown trigger by comparing the click position to the
// chip's layout instead. The trigger zone spans from the start of the range
// text/caret to the chip's right edge (covering its trailing padding too), so
// users don't have to hit the small text or icon exactly.
function clickedRangeTrigger(button: HTMLButtonElement, event: MouseEvent): boolean {
  const caret = chipCaret(button);
  const rangeSpan = button.querySelector<HTMLElement>(".ytps-range");
  if (!caret || !rangeSpan) return false;

  const caretRect = caret.getBoundingClientRect();
  const rangeRect = rangeSpan.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  const triggerLeft = rangeRect.width > 0 ? Math.min(rangeRect.left, caretRect.left) : caretRect.left;

  return (
    buttonRect.width > 0 &&
    buttonRect.height > 0 &&
    event.clientX >= triggerLeft &&
    event.clientX <= buttonRect.right &&
    event.clientY >= buttonRect.top &&
    event.clientY <= buttonRect.bottom
  );
}

// The plain chip bar's "Popular" chip: our caret opens the range menu, and the
// rest of the chip behaves like Latest/Oldest, immediately (re)applying the
// currently selected range.
function enhancePopularChip(button: HTMLButtonElement): void {
  button.setAttribute(PROCESSED_ATTR, "true");
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");

  if (!decorateChip(button)) return;

  button.addEventListener(
    "click",
    (event) => {
      if (bypassNextClick) {
        bypassNextClick = false;
        return;
      }

      const clickedTrigger = clickedRangeTrigger(button, event);

      event.preventDefault();
      event.stopImmediatePropagation();

      if (clickedTrigger) {
        toggleChipMenu(button);
        return;
      }

      closeMenu();
      void applyRange(button, selectedRange);
    },
    true
  );
}

// The dropdown sort chip stays YouTube's: clicking it opens YouTube's sort
// sheet, where our range submenu lives (see enhanceSortSheetRow). All we add
// is the range text, and a chevron takeover if the sheet ever proves
// unreadable.
function enhanceDropdownChip(button: HTMLButtonElement): void {
  button.setAttribute(PROCESSED_ATTR, "true");
  button.setAttribute(DROPDOWN_ATTR, "true");

  if (!decorateChip(button)) return;

  button.addEventListener(
    "click",
    (event) => {
      armSheetScan();

      if (!useChevronFallback() || !isPopularActive(button)) return;
      // Without the submenu the chevron is the only way into the range menu;
      // the chip's label still opens YouTube's sheet.
      if (!clickedRangeTrigger(button, event)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      toggleChipMenu(button);
    },
    true
  );
}

// The fallback only engages once a sheet has been given its chance and no
// "Popular" row turned up; a sheet we manage to read later wins for good.
function useChevronFallback(): boolean {
  return sheetDetectionFailed && !sheetEnhanced;
}

function armSheetScan(): void {
  sheetScanDeadline = Date.now() + SHEET_SCAN_WINDOW_MS;

  clearTimeout(sheetScanTimer);
  sheetScanTimer = setTimeout(() => {
    if (!sheetEnhanced) sheetDetectionFailed = true;
  }, SHEET_SCAN_WINDOW_MS);
}

// Hangs the range submenu off the "Popular" row of YouTube's sort sheet.
function enhanceSortSheetRow(root: ParentNode): void {
  const found = findSortSheetPopularRow(root);
  if (!found || found.row.hasAttribute(SHEET_ROW_ATTR)) return;

  const { row, target } = found;
  row.setAttribute(SHEET_ROW_ATTR, "true");
  row.setAttribute("aria-haspopup", "true");
  row.setAttribute("aria-expanded", "false");
  row.classList.add("ytps-sheet-row");

  const arrow = buildCaret("ytps-submenu-arrow");
  row.appendChild(arrow);

  // Hovering the row's label is YouTube's plain "Popular"; only its arrow end
  // opens the range menu.
  row.addEventListener("mousemove", (event) => {
    if (event.clientX >= arrow.getBoundingClientRect().left - SUBMENU_HOVER_SLACK) {
      scheduleSubmenuOpen(row, target);
      return;
    }

    clearTimeout(submenuOpenTimer);
    submenuOpenTimer = undefined;
    if (currentMenu && menuAnchor === row) scheduleSubmenuClose();
  });

  row.addEventListener("mouseleave", scheduleSubmenuClose);

  // Keyboard and touch users get the same menu without the hover.
  arrow.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSheetMenu(row, target);
  });

  // Choosing "Popular" itself is YouTube's own all-time sort, so anything we
  // were showing for a custom range goes away with it.
  row.addEventListener("click", () => {
    if (bypassNextSheetTap) return;

    closeMenu();
    requestGeneration++;
    resetSelectedRange();
  });

  sheetEnhanced = true;
}

// Sheets are only ever opened from the dropdown chip, so this looks at the
// nodes YouTube adds in the window after such a click rather than at every
// mutation the page makes.
function scanSortSheet(records: MutationRecord[]): void {
  if (Date.now() >= sheetScanDeadline) return;
  if (!document.querySelector(`button[${DROPDOWN_ATTR}]`)) return;

  records.forEach((record) => {
    record.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) enhanceSortSheetRow(node);
    });
  });

  // In case the sheet's DOM was reused rather than inserted. Popups are
  // scanned a child at a time as well, since a container that has accumulated
  // several of them is too big to walk in one go.
  document.querySelectorAll(SHEET_ROOTS).forEach((root) => {
    enhanceSortSheetRow(root);
    Array.from(root.children).forEach((child) => enhanceSortSheetRow(child));
  });
}

// "Latest"/"Oldest" — or, in the dropdown chip bar, the "Members only"/
// "Public" filter tabs — know nothing about our results panel, so clicking
// them while it's open would leave it (and the hidden native grid) in place.
function enhanceSiblingChips(popularButton: HTMLButtonElement): void {
  const chipBar = popularButton.closest("chip-bar-view-model");
  if (!chipBar) return;

  const dropdown = isDropdownChip(popularButton);
  const selector = dropdown
    ? 'button[role="tab"]'
    : 'button[aria-label="Latest"], button[aria-label="Oldest"]';

  chipBar.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    if (button.hasAttribute(SIBLING_PROCESSED_ATTR)) return;
    button.setAttribute(SIBLING_PROCESSED_ATTR, "true");

    button.addEventListener("click", () => {
      // Invalidate any in-flight Popular fetch so it can't render its
      // results after the user has switched away.
      requestGeneration++;

      // A filter tab reloads the grid without changing the sort, so the chip
      // still reads "Popular": drop the custom range entirely rather than
      // leave the chip advertising a range the grid isn't showing. (Our
      // results come from the Data API, which can't see members-only videos
      // or apply YouTube's filter.)
      if (dropdown) {
        resetSelectedRange();
        return;
      }

      const richGrid = button.closest("ytd-rich-grid-renderer");
      if (!richGrid) return;

      removeResultsPanel(richGrid);
      showContents(richGrid);

      const bar = button.closest("chip-bar-view-model");
      bar?.querySelectorAll<HTMLElement>("button[aria-label]").forEach((chip) => {
        setChipActive(chip, chip === button);
      });

      updateChipLabel(popularButton);
    });
  });
}

const watchedLabels = new WeakSet<Element>();

// YouTube swaps the dropdown chip's label in place when the sort changes from
// its own sheet, which can be a characterData-only change the page-wide
// (childList) observer never sees. A tiny observer on the label itself keeps
// us in sync with the active sort.
function watchSortLabel(labelContainer: Element): void {
  if (watchedLabels.has(labelContainer)) return;
  watchedLabels.add(labelContainer);

  new MutationObserver(() => syncDropdownChips()).observe(labelContainer, {
    characterData: true,
    childList: true,
    subtree: true,
  });
}

// The dropdown chip is the same element for every sort, so switching sorts in
// YouTube's sheet would otherwise leave our range text — and any results
// panel standing in for the native grid — attached to a sort that is no
// longer Popular.
function syncDropdownChips(): void {
  document.querySelectorAll<HTMLButtonElement>(`button[${DROPDOWN_ATTR}]`).forEach((button) => {
    // Re-runs because a YouTube re-render of the label can drop our range
    // text, and a filter change can replace the chips next to it.
    decorateChip(button);
    enhanceSiblingChips(button);

    if (isPopularActive(button)) {
      pendingPopularUntil = 0;
      return;
    }

    // A sort switch we asked for ourselves: the label just hasn't repainted
    // yet, so the range we're about to show isn't stale.
    if (Date.now() < pendingPopularUntil) return;

    const richGrid = button.closest("ytd-rich-grid-renderer");
    if (selectedRange === DEFAULT_RANGE && !richGrid?.querySelector(".ytps-results")) return;

    requestGeneration++;
    resetSelectedRange();
  });
}

function scanForPopularChip(): void {
  document
    .querySelectorAll<HTMLButtonElement>(`button[aria-label="Popular"]:not([${PROCESSED_ATTR}])`)
    .forEach((button) => {
      if (!isChannelSortChip(button)) return;
      enhancePopularChip(button);
      enhanceSiblingChips(button);
    });

  document
    .querySelectorAll<HTMLButtonElement>(`button[role="combobox"]:not([${PROCESSED_ATTR}])`)
    .forEach((button) => {
      if (!isSortDropdownChip(button)) return;
      enhanceDropdownChip(button);
      enhanceSiblingChips(button);
    });

  syncDropdownChips();
}

function init(): void {
  scanForPopularChip();

  const observer = new MutationObserver((records) => {
    scanForPopularChip();
    scanSortSheet(records);

    // A menu outlives its anchor when YouTube closes the sheet under it.
    if (currentMenu && menuAnchor && !menuAnchor.isConnected) closeMenu();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // YouTube decides whether to (re)populate #contents for the destination
  // tab during the navigation transition itself, not after it finishes — if
  // #contents is still hidden at that point (left over from a custom range),
  // it skips repopulating it even once we un-hide it on yt-navigate-finish.
  // Resetting as early as yt-navigate-start gives it the whole transition
  // window with #contents visible.
  document.addEventListener("yt-navigate-start", () => {
    closeMenu();
    // Invalidate any in-flight fetch so a late response from the previous
    // page/tab can't render its results here.
    requestGeneration++;
    resetSelectedRange();
  });

  document.addEventListener("yt-navigate-finish", () => {
    closeMenu();
    // Invalidate any in-flight fetch so a late response from the previous
    // page/tab can't render its results here.
    requestGeneration++;
    resetSelectedRange();
    scanForPopularChip();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
