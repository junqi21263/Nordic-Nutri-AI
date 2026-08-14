import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/milestone-journey/index.tsx"), "utf8");

describe("Milestone Journey pending unlock state", () => {
  it("does not render a pending milestone as locked", () => {
    expect(source).toContain("getJourneyStageState({ milestone, event, nextMilestone })");
    expect(source).toContain("<MilestoneStageSheet");
    expect(source).not.toContain('streakDays >= milestone ? "已解锁"');
  });
});
