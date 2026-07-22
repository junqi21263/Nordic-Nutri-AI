import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutStyles = readFileSync(
  resolve(import.meta.dirname, "../src/styles/layout.scss"),
  "utf8",
);

describe("goal adjustment layout", () => {
  it("reserves the custom-navigation safe area above the goal form", () => {
    expect(layoutStyles).toContain(".page-layout--goal-adjust .page-layout__content");
    expect(layoutStyles).toContain("env(safe-area-inset-top) + $space-48 + $space-12");
  });
});
