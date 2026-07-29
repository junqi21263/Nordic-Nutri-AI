import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("coach composer shape", () => {
  it("keeps the input as a rounded rectangle in the component stylesheet", () => {
    const componentStyles = read("src/pages/coach/components/CoachComposer/index.scss");

    expect(componentStyles).toContain(".coach-composer__input");
    expect(componentStyles).toContain("border-radius: 12px");
    expect(componentStyles).not.toContain("border-radius: $radius-full");
  });

  it("does not keep the legacy full-pill composer definition in page styles", () => {
    const pageStyles = read("src/styles/page.scss");
    const legacyComposer = pageStyles.match(/\.coach-composer\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(legacyComposer).not.toContain("$radius-full");
    expect(legacyComposer).not.toContain("min-height: 88px");
  });
});
