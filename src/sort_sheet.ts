// Channels with a members-only section render their sort as a dropdown chip
// that opens YouTube's own Latest/Popular/Oldest sheet. That sheet is built on
// the client, and nothing in its markup — ids, classes, roles — is documented
// or stable, so its "Popular" row is located by structure instead: the element
// holding the label, and a row holding "Latest" or "Oldest", have to sit in
// the same short list.

const POPULAR_LABEL = "Popular";
const SIBLING_LABELS = ["Latest", "Oldest"];

// A channel's chip bar carries the same labels, and our own menu is built from
// them; neither is the sheet.
const EXCLUDED_ANCESTORS = "chip-bar-view-model, .ytps-menu";

// The sheet is a handful of rows. Anything bigger is some other part of the
// page that happened to be added to the DOM (a reloaded video grid, say), and
// reading all of its text would cost more than it's worth.
const MAX_SCANNED_ELEMENTS = 400;
const MAX_LIST_ITEMS = 8;

export interface SortSheetPopularRow {
  // The row to decorate and hover.
  row: HTMLElement;
  // The element holding the label itself. A click there bubbles through every
  // ancestor, so whichever one YouTube bound its tap handler to will fire.
  target: HTMLElement;
}

export function findSortSheetPopularRow(root: ParentNode): SortSheetPopularRow | null {
  const elements = collectElements(root);
  if (!elements) return null;

  const popular = labelElements(elements, POPULAR_LABEL);
  if (popular.length === 0) return null;

  const others = SIBLING_LABELS.flatMap((label) => labelElements(elements, label));
  if (others.length === 0) return null;

  for (const target of popular) {
    for (const other of others) {
      const list = commonAncestor(target, other);
      if (!list || list.children.length > MAX_LIST_ITEMS) continue;

      const row = childContaining(list, target);
      const otherRow = childContaining(list, other);
      if (!row || !otherRow || row === otherRow) continue;

      return { row, target };
    }
  }

  return null;
}

function collectElements(root: ParentNode): HTMLElement[] | null {
  const all: Element[] = root instanceof Element ? [root] : [];
  all.push(...Array.from(root.querySelectorAll("*")));
  if (all.length > MAX_SCANNED_ELEMENTS) return null;

  return all.filter((el): el is HTMLElement => el instanceof HTMLElement);
}

function labelElements(elements: HTMLElement[], label: string): HTMLElement[] {
  return elements.filter((el) => {
    if (text(el) !== label) return false;
    // Only the innermost element holding the label: its wrappers are reached
    // by climbing from here, and a row may well carry more than the label
    // (a checkmark on the active sort, say).
    if (Array.from(el.children).some((child) => text(child) === label)) return false;

    return !el.closest(EXCLUDED_ANCESTORS);
  });
}

function text(el: Element): string {
  return (el.textContent ?? "").trim();
}

function commonAncestor(a: HTMLElement, b: HTMLElement): HTMLElement | null {
  const ancestors = new Set<HTMLElement>();
  for (let el = a.parentElement; el; el = el.parentElement) ancestors.add(el);

  for (let el = b.parentElement; el; el = el.parentElement) {
    if (ancestors.has(el)) return el;
  }

  return null;
}

function childContaining(parent: HTMLElement, descendant: HTMLElement): HTMLElement | null {
  let child: HTMLElement | null = descendant;
  while (child && child.parentElement !== parent) child = child.parentElement;

  return child;
}
