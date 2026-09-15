import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("weekly review responsive layout", () => {
  it("uses stable semantic wrappers instead of renderer-dependent child selectors", () => {
    const page = readSource("../src/pages/weekly-review/index.tsx");
    const styles = readSource("../src/styles/page.scss");

    [
      "weekly-review__hero-score",
      "weekly-review__metric-label",
      "weekly-review__insight-copy",
      "weekly-review__advice-copy",
      "weekly-review__next-goals-copy",
      "weekly-review__next-goal-copy",
    ].forEach((className) => expect(page).toContain(className));

    expect(styles).toContain(".weekly-review__metric {");
    expect(styles).toContain(".weekly-review__insight-copy {");
    expect(styles).toContain(".weekly-review__next-goal-copy {");
    expect(styles).toContain("min-width: 0");
    expect(styles).not.toContain(".weekly-review__metrics Text:nth-child(2)");
  });
});
