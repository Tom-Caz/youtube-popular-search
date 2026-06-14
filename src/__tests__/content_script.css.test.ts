import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const css = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../public/content_script.css"),
  "utf-8"
);

describe("content_script.css: caret hit-testing", () => {
  it("re-enables pointer-events on .ytps-caret so it can be its own click target", () => {
    // The chip label's children are pointer-events: none, which is inherited;
    // without an explicit override here, jsdom-based click tests pass but
    // real browsers never let .ytps-caret (or its descendants) become the
    // event.target, so the caret click zone silently never opens the dropdown.
    const ruleMatch = css.match(/\.ytps-caret\s*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    expect(ruleMatch![1]).toMatch(/pointer-events:\s*auto/);
  });
});
