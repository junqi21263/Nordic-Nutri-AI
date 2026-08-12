import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMealFixtures } from "../src/features/meals/domain";
import { createMealStore } from "../src/stores/meal-store";
import { createProfileStore } from "../src/stores/profile-store";

const sourceRoot = resolve(import.meta.dirname, "..", "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("P0 / P1 本地体验补全", () => {
  it("将餐次与资料的修改写入可注入的本地存储", () => {
    const mealWrite = vi.fn();
    const profileWrite = vi.fn();
    const mealStore = createMealStore(createMealFixtures("2026-07-15"), "2026-07-15", {
      read: () => null,
      write: mealWrite,
      clear: vi.fn(),
    });
    const profileStore = createProfileStore({
      read: () => null,
      write: profileWrite,
      clear: vi.fn(),
    });

    mealStore.getState().toggleFavorite("meal-lunch-today");
    profileStore.getState().setProfile({ nickname: "Mia" });

    expect(mealWrite).toHaveBeenCalled();
    expect(profileWrite).toHaveBeenCalledWith(expect.objectContaining({ nickname: "Mia" }));
  });

  it("为首次完成、手动记录和原生图片识别提供可到达的真实路径", () => {
    const config = read("app.config.ts");
    const app = read("app.tsx");
    const plan = read("pages/nutrition-plan/index.tsx");
    const scanner = read("pages/food-scanner/index.tsx");
    const manualMeal = read("pages/manual-meal/index.tsx");

    expect(config).toContain('"pages/manual-meal/index"');
    expect(app).toContain("startApplicationAuth");
    expect(plan).toContain("markOnboardingCompleted");
    expect(scanner).toContain("Taro.chooseMedia");
    expect(scanner).toContain("sourceType: [source]");
    expect(scanner).toContain('chooseImage("camera")');
    expect(scanner).toContain('chooseImage("album")');
    expect(scanner).toContain("analyzeProductImage");
    expect(scanner).toContain("图片识别服务尚未配置，可先手动记录");
    expect(scanner).toContain("手动记录");
    expect(manualMeal).toContain("手动记录");
    expect(manualMeal).toContain("createProductMeal");
    expect(manualMeal).toContain("getProductMeals");
  });

  it("让记录页支持搜索、底部筛选与清除筛选", () => {
    const records = read("pages/meal-records/index.tsx");

    expect(records).toContain("SearchBar");
    expect(records).toContain("BottomSheet");
    expect(records).toContain("mealTypeFilter");
    expect(records).toContain("清除筛选");
    expect(records).toContain("筛选记录");
  });

  it("从记录页新增餐次时同步激活扫描底部标签", () => {
    const records = read("pages/meal-records/index.tsx");
    const addMealStart = records.indexOf("const addMeal");
    const addMealEnd = records.indexOf("const openManualMeal");

    expect(records.slice(addMealStart, addMealEnd)).toContain('setActiveKey("food-scanner")');
    expect(records.slice(addMealStart, addMealEnd)).toContain(
      'Taro.navigateTo({ url: "/pages/food-scanner/index" })',
    );
  });

  it("补齐首页、教练和资料目标的可执行操作", () => {
    const home = read("pages/home/index.tsx");
    const sectionTitle = read("components/section-title/index.tsx");
    const coach = read("pages/coach/index.tsx");
    const profileEdit = read("pages/profile-edit/index.tsx");
    const goalAdjust = read("pages/goal-adjust/index.tsx");

    expect(sectionTitle).toContain("onActionClick?: () => void");
    expect(home).toContain("onActionClick={openRecords}");
    expect(coach).not.toContain("addSuggestedSnack");
    expect(coach).not.toContain('mealType: "snack"');
    expect(coach).toContain("营养建议仅供日常饮食参考");
    expect(profileEdit).toContain("/pages/goal-adjust/index");
    expect(home).toContain("/pages/goal-adjust/index");
    expect(home).toContain("调整");
    expect(goalAdjust).toContain('className="page-layout--goal-adjust"');
    expect(goalAdjust).toContain('className="profile-subpage__page-title"');
    expect(goalAdjust).toContain("saveProductNutritionPlan");
    expect(goalAdjust).toContain("proteinG");
    expect(goalAdjust).toContain("carbsG");
    expect(goalAdjust).toContain("fatG");
    expect(goalAdjust).toContain("调整今日目标");
  });

  it("保持手动记录页面简洁并保留表单布局", () => {
    const manualMeal = read("pages/manual-meal/index.tsx");
    const styles = read("styles/page.scss");
    const layoutStyles = read("styles/layout.scss");

    expect(manualMeal).not.toContain("补充这一餐");
    expect(manualMeal).not.toContain("manual-meal__catalog-link");
    expect(manualMeal).toContain('className="manual-meal__form"');
    expect(manualMeal).not.toContain('className="manual-meal__intro"');
    expect(styles).not.toContain(".manual-meal__page-title");
    expect(layoutStyles).toContain(".page-layout--manual-meal .page-layout__content");
    expect(layoutStyles).toContain("page-layout__content");
  });

  it("只在远端餐食同步完成后触发手动和拍照保存庆祝", () => {
    const manualMeal = read("pages/manual-meal/index.tsx");
    const analysis = read("pages/analysis-result/index.tsx");

    expect(manualMeal).toContain("const previousCalories = meals.getDailySummary(date).consumed.calories");
    expect(manualMeal).toContain("const syncedMeals = await getProductMeals(date)");
    expect(manualMeal).toContain("useMealSavedCelebrationStore.getState().show");
    expect(manualMeal).not.toContain("navigateBackOrHome(");
    expect(analysis).toContain("const previousCalories = meals.getDailySummary(localMeal.date).consumed.calories");
    expect(analysis).toContain("const syncedMeals = await getProductMeals(localMeal.date)");
    expect(analysis).toContain("useMealSavedCelebrationStore.getState().show");
    expect(analysis).not.toContain("Taro.redirectTo(");
    expect(manualMeal).not.toContain('feedback.show({ message: "已保存并同步到饮食记录", tone: "success" })');
    expect(analysis).not.toContain('feedback.show({ message: "AI 分析已保存到饮食记录", tone: "success" })');
  });
});
