import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("餐食详情交互", () => {
  it("不再展示这餐包含卡片，也不跳转食材详情", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const config = read("app.config.ts");

    expect(detail).not.toContain("这餐包含");
    expect(detail).not.toContain("openIngredient");
    expect(detail).not.toContain("ingredient-detail");
    expect(detail).not.toContain('className="meal-detail-page__ingredients"');
    expect(config).not.toContain('"pages/ingredient-detail/index"');
  });

  it("将详情页底部操作改为图标与文字横向排列", () => {
    const styles = read("styles/page.scss");
    const actionRule = styles.slice(
      styles.indexOf(".meal-detail-page__action {"),
      styles.indexOf(".meal-detail-page__action--delete"),
    );

    expect(actionRule).toContain("flex-direction: row");
    expect(actionRule).toContain("min-height: 64px");
  });

  it("让手动保存、列表编辑和删除都通过服务端餐食接口确认", () => {
    const manual = read("pages/manual-meal/index.tsx");
    const records = read("pages/meal-records/index.tsx");
    const detail = read("pages/meal-detail/index.tsx");
    const portion = read("pages/portion-adjustment/index.tsx");

    expect(manual).toContain("createProductMeal");
    expect(manual).toContain("getProductMeals");
    expect(manual).toContain("loading={isSaving}");
    expect(records).toContain("getProductDailySummary(store.selectedDate)");
    expect(records).toContain("getProductMeals(store.selectedDate)");
    expect(records).toContain("dailySummary.meals");
    expect(detail).toContain("deleteProductMeal(meal.id)");
    expect(portion).toContain("updateProductMeal(editingId");
  });

  it("更新收藏后同步详情态，并给出可发现的反馈", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const styles = read("styles/page.scss");

    expect(detail).toContain("setRemoteMeal(saved)");
    expect(detail).toContain('name={meal.favorite ? "heart-filled" : "heart"}');
    expect(detail).toContain("可在「记录」筛选里查看");
    expect(detail).toContain("meal-detail-page__action--favorite");
    expect(styles).toContain(".meal-detail-page__action--favorite");
    expect(styles).not.toContain(
      ".meal-detail-page__action--favorite {\n  background: $color-forest-green;",
    );
  });
});

