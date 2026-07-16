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

  it("为首次完成、手动记录和原生图片选择提供可到达的本地路径", () => {
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
    expect(scanner).toContain("使用示例餐盘继续");
    expect(scanner).toContain("手动记录");
    expect(manualMeal).toContain("手动记录");
    expect(manualMeal).toContain("meals.addMeal");
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
      'Taro.switchTab({ url: "/pages/food-scanner/index" })',
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
    expect(coach).toContain("addSuggestedSnack");
    expect(coach).toContain('mealType: "snack"');
    expect(coach).toContain("营养建议仅供日常饮食参考");
    expect(profileEdit).toContain("/pages/goal-adjust/index");
    expect(goalAdjust).toContain('className="page-layout--goal-adjust"');
    expect(goalAdjust).toContain('className="profile-subpage__page-title"');
  });

  it("将手动记录的主标题置于教练同级的页面顶部", () => {
    const manualMeal = read("pages/manual-meal/index.tsx");
    const styles = read("styles/page.scss");
    const layoutStyles = read("styles/layout.scss");

    const titleStart = manualMeal.indexOf('className="manual-meal__page-title"');
    const titleEnd = manualMeal.indexOf('className="manual-meal__form"');
    expect(manualMeal.slice(titleStart, titleEnd)).toContain("补充这一餐");
    expect(manualMeal).not.toContain('className="manual-meal__intro"');
    expect(styles).toContain(".manual-meal__page-title");
    expect(styles).toContain("font-size: $font-h2;");
    expect(layoutStyles).toContain(".page-layout--manual-meal .page-layout__content");
    expect(layoutStyles).toContain(
      "padding-top: calc(env(safe-area-inset-top) + $space-48 + $space-12);",
    );
  });
});
