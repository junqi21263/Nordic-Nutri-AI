import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("份量调整交互", () => {
  it("提供餐名与热量同级的摘要，以及可直接跳转的份量档位", () => {
    const source = read("pages/portion-adjustment/index.tsx");

    expect(source).toContain('className="portion-summary__meal-title"');
    expect(source).toContain("const portionPresets = [25, 50, 75, 100, 125, 150, 175, 200]");
    expect(source).toContain("portion.adjustBy(-0.25)");
    expect(source).toContain("portion.adjustBy(0.25)");
    expect(source).toContain("portion.setMultiplier(percent / 100)");
    expect(source).toContain("恢复原始份量");
  });

  it("编辑时可重选早午晚加餐次，并在保存时提交 mealType", () => {
    const source = read("pages/portion-adjustment/index.tsx");
    const store = read("stores/portion-draft-store.ts");
    expect(source).toContain("这是哪一餐？");
    expect(source).toContain("mealTypeOptions");
    expect(source).toContain("portion.setMealType");
    expect(source).toContain("mealType: draftMeal.mealType");
    expect(store).toContain("setMealType:");
  });

  it("为新建和重新编辑的餐食均触发保存弹窗而不显示成功 Toast", () => {
    const source = read("pages/portion-adjustment/index.tsx");
    expect(source).toContain("const previousCalories = meals.getDailySummary(mealDate).consumed.calories");
    expect(source).toContain("const savedDate = savedMeal.date");
    expect(source).toContain("const syncedMeals = await getProductMeals(savedDate)");
    expect(source).toContain("useMealSavedCelebrationStore.getState().show");
    expect(source).toContain("if (!savedMeal && editingId)");
    expect(source).toContain('kind: isRepeating ? "reused" : editingId ? "updated" : "created"');
    expect(source).not.toContain('feedback.show({ message: "份量已更新并同步", tone: "success" })');
    const newMealBranch = source.slice(source.indexOf("} else {"), source.indexOf("const syncedMeals"));
    expect(newMealBranch).not.toContain('feedback.show({ message: "已保存并同步到饮食记录", tone: "success" })');
  });

  it("保存后保留草稿到调整页离开，避免庆祝弹窗下方先渲染失效页", () => {
    const source = read("pages/portion-adjustment/index.tsx");

    expect(source).toContain("const clearDraftAfterSuccess = useRef(false)");
    expect(source).toContain("if (clearDraftAfterSuccess.current) usePortionDraftStore.getState().reset()");
    expect(source).toContain("clearDraftAfterSuccess.current = true");
    expect(source).not.toContain("portion.reset();");
  });
});
