import { findSortSheetPopularRow } from "../sort_sheet";
import { sortSheetHtml, richGridFixtureHtml } from "./content_script_fixtures";

function render(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("sort_sheet: finding the sheet's Popular row", () => {
  it("finds the row in YouTube's view-model markup", () => {
    const host = render(sortSheetHtml("Latest"));

    const found = findSortSheetPopularRow(host)!;
    expect(found).not.toBeNull();
    expect(found.row.tagName.toLowerCase()).toBe("yt-list-item-view-model");
    expect(found.row.textContent?.trim()).toBe("Popular");
    // The label element itself, so a synthetic click reaches every ancestor
    // that might carry YouTube's tap handler.
    expect(found.target.tagName.toLowerCase()).toBe("span");
    expect(found.target.textContent).toBe("Popular");
  });

  it("finds the row when the rows are plain divs", () => {
    const host = render(`
      <div class="list">
        <div class="row">Latest</div>
        <div class="row">Popular</div>
        <div class="row">Oldest</div>
      </div>
    `);

    const found = findSortSheetPopularRow(host)!;
    expect(found.row.className).toBe("row");
    expect(found.row).toBe(found.target);
  });

  it("is unbothered by extra decoration in the rows", () => {
    const host = render(`
      <ul>
        <li><svg></svg><b><i>Latest</i></b><span class="check">✓</span></li>
        <li><svg></svg><b><i>Popular</i></b></li>
        <li><svg></svg><b><i>Oldest</i></b></li>
      </ul>
    `);

    const found = findSortSheetPopularRow(host)!;
    expect(found.row.tagName.toLowerCase()).toBe("li");
    expect(found.target.tagName.toLowerCase()).toBe("i");
  });

  it("ignores the channel's chip bar, which carries the same labels", () => {
    const host = render(richGridFixtureHtml());

    expect(findSortSheetPopularRow(host)).toBeNull();
  });

  it("ignores a lone 'Popular' with no sort siblings", () => {
    const host = render(`
      <div class="list">
        <div class="row">Popular</div>
        <div class="row">Trending</div>
      </div>
    `);

    expect(findSortSheetPopularRow(host)).toBeNull();
  });

  it("ignores a subtree too big to be a sheet", () => {
    const rows = Array.from({ length: 500 }, () => "<div>filler</div>").join("");
    const host = render(`
      <div class="list">
        <div class="row">Latest</div>
        <div class="row">Popular</div>
        <div class="row">Oldest</div>
        ${rows}
      </div>
    `);

    expect(findSortSheetPopularRow(host)).toBeNull();
  });
});
