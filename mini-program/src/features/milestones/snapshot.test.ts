import { describe, expect, it } from "vitest";
import { toMilestonePosterPresentation } from "./snapshot";

describe("milestone snapshot presentation", () => {
  it("uses frozen snapshot fields instead of live milestone stats", () => {
    const result = toMilestonePosterPresentation({
      cycleId: "cycle-1",
      milestone: 7,
      milestoneIndex: "02",
      personalizedMessage: "这是一份冻结文案。",
      illustrationId: "7-1",
      highlights: [{ type: "mealsLogged", label: "记录餐数", value: "21" }],
      progressState: [{ milestone: 3, active: true }, { milestone: 7, active: true }, { milestone: 14, active: false }, { milestone: 30, active: false }],
    });
    expect(result.personalizedMessage).toBe("这是一份冻结文案。");
    expect(result.frozenHighlights).toEqual([{ key: "mealsLogged", label: "记录餐数", value: "21" }]);
    expect(result.progressState?.map((item) => item.active)).toEqual([true, true, false, false]);
  });

  it("propagates the frozen illustration version into the asset cache identity", () => {
    const result = toMilestonePosterPresentation({
      cycleId: "cycle-1",
      milestone: 14,
      milestoneIndex: "03",
      personalizedMessage: "冻结内容。",
      illustrationId: "14-1",
      illustrationVersion: 2,
      highlights: [],
      progressState: [],
    });
    expect(result.illustrationAsset).toMatchObject({ id: "balance-b", version: "v2" });
  });

  it("interprets legacy snapshots without illustrationVersion as v1", () => {
    const result = toMilestonePosterPresentation({
      cycleId: "legacy-cycle",
      milestone: 3,
      milestoneIndex: "01",
      personalizedMessage: "历史冻结内容。",
      illustrationId: "3-0",
      highlights: [],
      progressState: [],
    });
    expect(result.illustrationAsset).toMatchObject({ id: "start-wellness", version: "v1" });
  });
});
