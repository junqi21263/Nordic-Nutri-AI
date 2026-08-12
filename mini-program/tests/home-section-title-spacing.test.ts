import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("home meal section title spacing", () => {
  it("keeps the meal title readable beside the action", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");
    const block = styles.match(/\.home-page__meal-list \.section-title__title \{([\s\S]*?)\}/)?.[1] ?? "";
    expect(block).toContain("letter-spacing: 1px");
  });
});
