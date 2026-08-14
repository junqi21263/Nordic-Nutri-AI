import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/milestone-journey/index.tsx"), "utf8");

describe("Milestone journey error copy", () => {
  it("does not render a raw backend error to the user", () => {
    expect(source).toContain('setError("我的旅程暂时无法读取，请稍后重试")');
    expect(source).not.toContain("reason instanceof Error ? reason.message");
  });
});
