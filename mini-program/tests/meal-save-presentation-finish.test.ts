import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(resolve(process.cwd(), "src/layouts/page-layout/index.tsx"), "utf8");

describe("meal save milestone finish handoff", () => {
  it("runs one shared post-feedback handoff for both terminal success actions", () => {
    expect(layout).toContain("const finishMealSaveSuccessFlow = () =>");
    expect(layout.match(/finishMealSaveSuccessFlow\(/g)?.length).toBe(2);
  });
});
