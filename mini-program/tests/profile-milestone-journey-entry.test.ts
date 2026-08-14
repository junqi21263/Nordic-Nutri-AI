import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/profile/index.tsx"), "utf8");

describe("profile milestone journey entry", () => {
  it("always opens My Journey instead of redirecting a presented event to Poster", () => {
    const entry = source.slice(source.indexOf("const openMilestoneJourney"), source.indexOf("const submitFeedback"));
    expect(entry).toContain('Taro.navigateTo({ url: "/pages/milestone-journey/index" })');
    expect(entry).not.toContain("getHighestPresentedMilestone");
    expect(entry).not.toContain("getMilestonePosterUrl");
  });
});
