// Shared DOM fixture builder for content_script.*.test.ts files.
// Mirrors the structure of YouTube's channel-videos chip bar + rich grid.

export function richGridFixtureHtml(): string {
  return `
    <ytd-rich-grid-renderer>
      <div id="header">
        <chip-bar-view-model>
          <chip-view-model>
            <button aria-label="Latest" aria-selected="true">
              <div class="ytChipShapeChip ytChipShapeActive"><div>Latest</div></div>
            </button>
          </chip-view-model>
          <chip-view-model>
            <button aria-label="Popular" aria-selected="false">
              <div class="ytChipShapeChip ytChipShapeInactive"><div>Popular</div></div>
            </button>
          </chip-view-model>
          <chip-view-model>
            <button aria-label="Oldest" aria-selected="false">
              <div class="ytChipShapeChip ytChipShapeInactive"><div>Oldest</div></div>
            </button>
          </chip-view-model>
        </chip-bar-view-model>
      </div>
      <div id="contents">
        <div class="native-video">native grid content</div>
      </div>
    </ytd-rich-grid-renderer>
  `;
}

// In real YouTube, a touch-feedback overlay always becomes event.target for
// clicks anywhere on the chip, so content_script.tsx distinguishes a caret
// click from a chip-body click by comparing the click's coordinates to the
// caret's getBoundingClientRect() rather than event.target. jsdom doesn't
// compute real layout (every element's rect is all zeros), so give
// .ytps-caret a fixed, non-zero rect and dispatch clicks at a point inside
// vs. outside it.
const CARET_RECT: DOMRect = {
  x: 100,
  y: 0,
  left: 100,
  top: 0,
  right: 118,
  bottom: 18,
  width: 18,
  height: 18,
  toJSON() {
    return this;
  },
};

// Positioned left of the caret (e.g. where "· This week" renders) and
// non-overlapping with it.
const RANGE_RECT: DOMRect = {
  x: 40,
  y: 0,
  left: 40,
  top: 0,
  right: 98,
  bottom: 18,
  width: 58,
  height: 18,
  toJSON() {
    return this;
  },
};

// The chip itself, extending past the caret's right edge (118) to cover the
// chip's trailing padding (e.g. where empty space after the caret renders).
const BUTTON_RECT: DOMRect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 140,
  bottom: 18,
  width: 140,
  height: 18,
  toJSON() {
    return this;
  },
};

// A sheet row and the submenu arrow at its right end: only the arrow's end of
// the row opens the range submenu, so hovering has to be positional here too.
const SHEET_ROW_RECT: DOMRect = {
  x: 0,
  y: 40,
  left: 0,
  top: 40,
  right: 226,
  bottom: 76,
  width: 226,
  height: 36,
  toJSON() {
    return this;
  },
};

const SUBMENU_ARROW_RECT: DOMRect = {
  x: 200,
  y: 49,
  left: 200,
  top: 49,
  right: 218,
  bottom: 67,
  width: 18,
  height: 18,
  toJSON() {
    return this;
  },
};

export function mockCaretBoundingClientRect(): void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (this.classList.contains("ytps-caret")) return CARET_RECT;
    // The dropdown chip has no caret of ours: YouTube's own chevron
    // (.ytChipShapeIconEnd) is what opens our menu there.
    if (this.classList.contains("ytChipShapeIconEnd")) return CARET_RECT;
    if (this.classList.contains("ytps-submenu-arrow")) return SUBMENU_ARROW_RECT;
    if (this.classList.contains("ytps-sheet-row")) return SHEET_ROW_RECT;
    if (this.classList.contains("ytps-range")) return RANGE_RECT;
    if (this instanceof HTMLButtonElement) return BUTTON_RECT;
    return original.call(this);
  };
}

// Dispatches a click at a point inside the caret's mocked bounding box.
export function clickCaret(caret: Element): void {
  caret.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 109, clientY: 9 }));
}

// Dispatches a click at a point inside the range text's mocked bounding box.
export function clickRangeText(rangeSpan: Element): void {
  rangeSpan.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 69, clientY: 9 }));
}

// Dispatches a click at a point in the chip's trailing padding, past the
// caret's right edge but still within the chip's mocked bounding box.
export function clickTrailingPadding(button: Element): void {
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 130, clientY: 9 }));
}

// Moves the pointer over the arrow end of a sheet row — the only part of it
// that opens the range submenu.
export function hoverSheetArrow(row: Element): void {
  row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 209, clientY: 58 }));
}

// Moves the pointer over the row's label instead, left of the arrow.
export function hoverSheetLabel(row: Element): void {
  row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 20, clientY: 58 }));
}

// Channels with a members-only section get a different chip bar: the sort is
// a single dropdown chip (a combobox labelled with the active sort, opening
// YouTube's own Latest/Popular/Oldest sheet) followed by "Members only" and
// "Public" filter tabs.
export function dropdownChipBarFixtureHtml(sortLabel = "Latest"): string {
  return `
    <ytd-rich-grid-renderer>
      <div id="header">
        <chip-bar-view-model>
          <chip-view-model>
            <button role="combobox" aria-selected="false">
              <div class="ytChipShapeChip ytChipShapeInactive ytChipShapeEndIconPadding"><div>${sortLabel}</div><yt-touch-feedback-shape aria-hidden="true"><div></div></yt-touch-feedback-shape><span class="ytIconWrapperHost ytChipShapeIconEnd"><svg></svg></span></div>
            </button>
          </chip-view-model>
          <chip-view-model>
            <button role="tab" aria-label="Members only" aria-selected="false">
              <div class="ytChipShapeChip ytChipShapeInactive"><div>Members only</div></div>
            </button>
          </chip-view-model>
          <chip-view-model>
            <button role="tab" aria-label="Public" aria-selected="false">
              <div class="ytChipShapeChip ytChipShapeInactive"><div>Public</div></div>
            </button>
          </chip-view-model>
        </chip-bar-view-model>
      </div>
      <div id="contents">
        <div class="native-video">native grid content</div>
      </div>
    </ytd-rich-grid-renderer>
    <ytd-popup-container></ytd-popup-container>
  `;
}

// YouTube's sort sheet, as opened from the dropdown chip. Its markup is built
// client-side and its class names are undocumented, so this fixture uses
// deliberately meaningless ones: the extension has to find the "Popular" row
// structurally (see src/sort_sheet.ts). The checkmark on the active sort is
// here on purpose — a row carries more than its label.
export function sortSheetHtml(activeSort = "Latest"): string {
  const item = (label: string) =>
    `<yt-list-item-view-model class="Xq3f"><div class="k2P"><span class="a1B">${label}</span></div>` +
    (label === activeSort ? '<span class="c8N">✓</span>' : "") +
    `</yt-list-item-view-model>`;

  return `
    <yt-sheet-view-model class="Zz9">
      <yt-list-view-model class="Q4r">${item("Latest")}${item("Popular")}${item("Oldest")}</yt-list-view-model>
    </yt-sheet-view-model>
  `;
}

// A dropdown chip that looks like the sort chip but isn't inside a channel's
// video grid (e.g. a chip bar elsewhere on YouTube).
export function standaloneDropdownChipBarHtml(): string {
  return `
    <chip-bar-view-model id="unrelated-dropdown-chip-bar">
      <chip-view-model>
        <button role="combobox" aria-selected="false">
          <div class="ytChipShapeChip ytChipShapeInactive ytChipShapeEndIconPadding"><div>Popular</div><span class="ytIconWrapperHost ytChipShapeIconEnd"><svg></svg></span></div>
        </button>
      </chip-view-model>
    </chip-bar-view-model>
  `;
}

export function standaloneChipBarHtml(): string {
  return `
    <chip-bar-view-model id="unrelated-chip-bar">
      <chip-view-model>
        <button aria-label="Popular" aria-selected="false">
          <div class="ytChipShapeChip ytChipShapeInactive"><div>Popular</div></div>
        </button>
      </chip-view-model>
    </chip-bar-view-model>
  `;
}
