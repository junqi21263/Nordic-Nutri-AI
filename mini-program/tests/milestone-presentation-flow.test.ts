import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("milestone presentation flow", () => {
  it("keeps production poster rendering snapshot-driven", () => {
    const posterPage = read("pages/milestone-poster/index.tsx");
    expect(posterPage).toContain("confirmMilestonePresentation");
    expect(posterPage).toContain("getPresentedMilestoneEvent");
    expect(posterPage).not.toContain("getMilestoneStats");
  });

  it("only passes claim token for first presentation routes", () => {
    const flow = read("features/milestones/presentation-flow.ts");
    expect(flow).toContain("getMilestonePosterUrl({ eventId: event.id, claimToken:");
    expect(read("features/milestones/runtime.ts")).toContain("if (claimToken) params.set");
  });

  it("keeps production preview guarded by the build environment", () => {
    const posterPage = read("pages/milestone-poster/index.tsx");
    expect(posterPage).toContain('router.params.demo === "1" && isMilestonePreviewDevelopmentBuild');
  });
});
