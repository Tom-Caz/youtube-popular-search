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
