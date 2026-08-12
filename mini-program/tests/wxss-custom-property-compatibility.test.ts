import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "..", "src", "styles", "miniprogram-ui.scss"),
  "utf8",
);

describe("WXSS compatibility", () => {
  it("does not emit CSS custom properties unsupported by the configured base library", () => {
    expect(source).not.toMatch(/^\s*--[\w-]+\s*:/m);
  });

  it("does not use unsupported :not selectors in the global WXSS bundle", () => {
    const pageStyles = readFileSync(
      resolve(import.meta.dirname, "..", "src", "styles", "page.scss"),
      "utf8",
    );

    expect(pageStyles).not.toContain(":not(");
  });

  it("does not leave CSS variable references in WXSS source", () => {
    const styleFiles = ["components.scss", "layout.scss", "page.scss"];

    for (const file of styleFiles) {
      const styles = readFileSync(resolve(import.meta.dirname, "..", "src", "styles", file), "utf8");
      expect(styles).not.toContain("var(--");
    }
  });
});
