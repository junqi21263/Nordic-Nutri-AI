import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getMilestoneSharePreviewDimensions } from "../src/components/milestone-share-preview/layout";

const pageStyles = readFileSync(resolve(process.cwd(), "src/styles/page.scss"), "utf8");

describe("milestone poster sizing", () => {
  it("uses the near-full-width mobile poster size rather than a half-screen card", () => {
    expect(pageStyles).toContain("max-width: 600px;");
  });

  it("keeps the share preview as a compact floating poster", () => {
    expect(getMilestoneSharePreviewDimensions()).toEqual({ width: 372, height: 595 });
    expect(pageStyles).toContain("flex: 0 0 auto;");
    expect(pageStyles).not.toContain("width: 76vw;");
    expect(pageStyles).not.toContain("aspect-ratio: 5 / 8;");
  });
});
