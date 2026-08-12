import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  resolve(import.meta.dirname, "../src/components/app-top-bar/index.scss"),
  "utf8",
);

describe("AppTopBar touch isolation", () => {
  it("does not let its fixed shell intercept page actions outside real controls", () => {
    expect(styles).toMatch(/\.app-top-bar \{[^}]*pointer-events: none;/);
    expect(styles).toContain(".app-top-bar__btn,\n.app-top-bar__right-action {\n  pointer-events: auto;");
  });
});
