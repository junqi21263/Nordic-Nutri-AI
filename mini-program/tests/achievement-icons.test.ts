import { describe, expect, it } from "vitest";
import { getAchievementIcon } from "../src/features/coach/achievement-icons";

describe("achievement icons", () => {
  it("maps each catalog achievement to a distinct icon", () => {
    const titles = [
      "第一餐记录",
      "早餐节奏",
      "午餐专注",
      "晚餐平衡",
      "加餐有度",
      "蛋白达人",
      "连续七天",
      "连续十四天",
      "累计三十餐",
      "累计五十餐",
      "累计一百餐",
      "蔬菜优先",
      "碳水平衡",
      "低脂选择",
      "收藏灵感",
      "连续达标",
    ];
    const icons = titles.map((title, index) => getAchievementIcon({
      id: `achievement-${index}`,
      title,
    }));
    expect(new Set(icons).size).toBeGreaterThanOrEqual(12);
    expect(icons[0]).toBe("utensils");
    expect(icons[5]).toBe("protein");
    expect(icons[6]).toBe("flame");
  });

  it("falls back for unknown achievements", () => {
    expect(getAchievementIcon({ id: "x", title: "未知" })).toBe("milestone");
  });
});
