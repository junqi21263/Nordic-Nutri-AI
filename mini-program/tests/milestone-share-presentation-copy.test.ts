import { describe, expect, it } from "vitest";
import { getMilestoneShareMessage, getMilestoneShareMetrics } from "../src/features/milestones/share-presentation";

describe("milestone share presentation", () => {
  it("gives each milestone a distinct shareable encouragement", () => {
    expect(getMilestoneShareMessage(3)).toBe("连续记录 3 天，原来从认真吃好每一餐开始，饮食节奏真的会慢慢变稳。");
    expect(getMilestoneShareMessage(7)).toBe("连续记录 7 天，你正在把每一餐的选择，慢慢过成自己的饮食节奏。");
    expect(getMilestoneShareMessage(14)).toBe("连续记录 14 天，你已开始看见更平衡的变化，继续把这份照顾留给自己。");
    expect(getMilestoneShareMessage(30)).toBe("连续记录 30 天，健康饮食不再是一时热情，而是你正在拥有的生活方式。");
  });

  it("turns frozen meal evidence into a clear participation-oriented metric pair", () => {
    expect(getMilestoneShareMetrics({
      milestone: 3,
      mealsLogged: 0,
      frozenHighlights: [
        { key: "mealsLogged", label: "记录餐数", value: "4" },
        { key: "recordingConsistency", label: "记录节奏", value: "100%" },
      ],
    })).toEqual([
      { icon: "utensils", label: "已记录餐次", value: "4 餐" },
      { icon: "calendar-days", label: "连续记录", value: "3 天" },
    ]);
  });

  it("changes the metric story as each stage progresses without recalculating frozen values", () => {
    const highlights = [
      { key: "mealsLogged" as const, label: "记录餐数", value: "16" },
      { key: "targetCompletionRate" as const, label: "目标完成", value: "88%" },
      { key: "avgProtein" as const, label: "平均蛋白质", value: "67g" },
      { key: "avgCarbs" as const, label: "平均碳水", value: "112g" },
    ];
    expect(getMilestoneShareMetrics({ milestone: 7, mealsLogged: 0, frozenHighlights: highlights })).toEqual([
      { icon: "goal-performance", label: "饮食目标完成", value: "88%" },
      { icon: "utensils", label: "已记录餐次", value: "16 餐" },
    ]);
    expect(getMilestoneShareMetrics({ milestone: 14, mealsLogged: 0, frozenHighlights: highlights })).toEqual([
      { icon: "protein", label: "平均蛋白质", value: "67g" },
      { icon: "carbs", label: "平均碳水", value: "112g" },
    ]);
    expect(getMilestoneShareMetrics({ milestone: 30, mealsLogged: 0, frozenHighlights: highlights })).toEqual([
      { icon: "calendar-days", label: "连续记录", value: "30 天" },
      { icon: "protein", label: "平均蛋白质", value: "67g" },
    ]);
  });
});
