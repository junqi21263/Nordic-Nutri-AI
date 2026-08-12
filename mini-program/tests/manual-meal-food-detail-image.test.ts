import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateNutritionFromAnalysis } from "../src/features/meals/manual-meal-estimate";

const manualMealPage = readFileSync(resolve(import.meta.dirname, "../src/pages/manual-meal/index.tsx"), "utf8");
const recordTimeEditorPath = resolve(import.meta.dirname, "../src/components/record-time-editor/index.tsx");
const foodDetailPage = readFileSync(resolve(import.meta.dirname, "../src/pages/food-detail/index.tsx"), "utf8");
const foodThumbnail = readFileSync(resolve(import.meta.dirname, "../src/components/food-thumbnail/index.tsx"), "utf8");
const pageStyles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");

describe("manual meal and food detail image layout", () => {
  it("removes duplicate manual meal title and catalog entry while preserving selected food", () => {
    expect(manualMealPage).not.toContain("补充这一餐");
    expect(manualMealPage).not.toContain("manual-meal__catalog-link");
    expect(manualMealPage).toContain("manual-meal__selected-food");
    expect(manualMealPage).toContain("consumeSelectedFood");
  });

  it("uses editable record date and time plus automatic name-based nutrition estimates", () => {
    expect(manualMealPage).toContain('import { Input, Text, View }');
    expect(manualMealPage).not.toContain("Picker");
    expect(manualMealPage).toContain("RecordTimeEditor");
    expect(manualMealPage).toContain('const [recordDate, setRecordDate]');
    expect(manualMealPage).toContain('const [recordTime, setRecordTime]');
    expect(manualMealPage).toContain('analyzeProductMeal([{ name: normalizedTitle, quantityG: 100 }])');
    expect(manualMealPage).toContain('recordedAt: recordedAtFromLocal(recordDate, recordTime)');
    expect(manualMealPage).toContain("餐食名称");
    expect(manualMealPage).toContain("记录时间");
    expect(manualMealPage).toContain("重新估算");
  });

  it("uses a custom record-time editor with an explicit editable hint and time controls", () => {
    expect(recordTimeEditorPath).toBeTruthy();
    const recordTimeEditor = readFileSync(recordTimeEditorPath, "utf8");

    expect(recordTimeEditor).toContain("可修改");
    expect(recordTimeEditor).toContain("设置记录时间");
    expect(recordTimeEditor).toContain("调整日期");
    expect(recordTimeEditor).toContain("直接设置时间");
    expect(recordTimeEditor).toContain('type="number"');
    expect(recordTimeEditor).toContain("onBlur");
  });

  it("converts all automatic analysis items into the editable nutrition totals", () => {
    expect(
      estimateNutritionFromAnalysis([
        { name: "鸡胸肉", quantityG: 150, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 },
        { name: "蔬菜", quantityG: 100, caloriesPer100g: 25, proteinPer100g: 2, carbsPer100g: 4, fatPer100g: 0 },
      ]),
    ).toEqual({ calories: "225", protein: "38", carbs: "4", fat: "4.5" });
  });

  it("renders the food detail image after identity and before portion selection", () => {
    const identityIndex = foodDetailPage.indexOf('className="food-detail-page__identity');
    const heroIndex = foodDetailPage.indexOf('className="food-detail-page__hero food-detail-page__hero--square"');
    const portionIndex = foodDetailPage.indexOf('className="food-detail-page__portion"');

    expect(foodDetailPage).toContain('prefer="detail"');
    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeGreaterThan(identityIndex);
    expect(portionIndex).toBeGreaterThan(heroIndex);
  });

  it("uses a compact food identity row without duplicate title, source text, or input underline", () => {
    expect(foodDetailPage).not.toContain('className="food-detail-page__title-row"');
    expect(foodDetailPage).not.toContain('className="food-detail-page__source"');
    expect(foodDetailPage).toContain('className="food-detail-page__name-row"');
    expect(foodDetailPage).toContain('className="food-detail-page__calories-inline"');
    expect(foodDetailPage).toContain("kcal/100g");
    expect(pageStyles).not.toMatch(
      /\.food-detail-page__portion-input input\s*\{[^}]*border-bottom\s*:/s,
    );
  });

  it("keeps the detail image square by default while allowing future source ratios", () => {
    expect(foodDetailPage).toContain('className="food-detail-page__hero food-detail-page__hero--square"');
    expect(foodDetailPage).toContain('prefer="detail"');
    expect(foodDetailPage).toContain("aspectRatio={1}");
    expect(foodThumbnail).toContain("aspectRatio");
    expect(foodThumbnail).toContain('prefer === "detail" ? 1');
    expect(pageStyles).not.toContain("aspect-ratio: 16 / 9");
    expect(pageStyles).toContain("aspect-ratio: 1 / 1");
  });
});
