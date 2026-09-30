import { describe, expect, it } from "vitest";
import type { MilestonePosterProps } from "../../components/milestone-poster";
import { getLocalizedMilestoneMetrics, getLocalizedMilestoneStage } from "./localized-presentation";

const translate = (key: string, options?: { count?: number }) => `${key}:${options?.count ?? ""}`;

describe("localized milestone poster copy", () => {
  it("uses stable milestone IDs for stage copy", () => {
    expect(getLocalizedMilestoneStage(7, "eyebrow", translate)).toBe("milestonePoster.stages.7.eyebrow:");
  });

  it("localizes labels and units without changing the frozen stats", () => {
    const poster = { milestone: 3, mealsLogged: 4 } as MilestonePosterProps;
    const metrics = getLocalizedMilestoneMetrics(poster, translate);
    expect(metrics.map(({ label, value }) => [label, value])).toEqual([
      ["milestonePoster.metrics.meals:", "milestonePoster.metrics.mealValue:4"],
      ["milestonePoster.metrics.streak:", "milestonePoster.metrics.dayValue:3"],
    ]);
  });

  it("does not add a locale-specific meal unit when the count is unavailable", () => {
    const poster = { milestone: 3, mealsLogged: 0 } as MilestonePosterProps;
    expect(getLocalizedMilestoneMetrics(poster, translate)[0]?.value).toBe("—");
  });
});
