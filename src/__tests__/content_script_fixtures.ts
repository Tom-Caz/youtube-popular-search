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

export function mockCaretBoundingClientRect(): void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (this.classList.contains("ytps-caret")) return CARET_RECT;
    if (this.classList.contains("ytps-range")) return RANGE_RECT;
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
