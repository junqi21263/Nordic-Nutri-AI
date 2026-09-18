import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  feedbackTypeForReason,
  mealItemFromAnalyzedFood,
  snapshotForRecognition,
  withCorrectedItems,
} from "../src/features/recognition-feedback/domain";
import { createRecognitionFeedbackStore } from "../src/stores/recognition-feedback-store";

describe("recognition feedback", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../src/pages/analysis-result/index.tsx"),
    "utf8",
  );
  const detailSource = readFileSync(
    resolve(import.meta.dirname, "../src/pages/food-detail/index.tsx"),
    "utf8",
  );
  const sheetSource = readFileSync(
    resolve(import.meta.dirname, "../src/components/recognition-feedback-sheet/index.tsx"),
    "utf8",
  );

  it("maps every visible reason to a stable backend type", () => {
    expect(feedbackTypeForReason("食物识别错了")).toBe("wrong_food");
    expect(feedbackTypeForReason("少识别了食物")).toBe("missing_food");
    expect(feedbackTypeForReason("多识别了食物")).toBe("extra_food");
    expect(feedbackTypeForReason("份量不准确")).toBe("portion_inaccurate");
    expect(feedbackTypeForReason("营养数据看起来不对")).toBeNull();
    expect(feedbackTypeForReason("其他")).toBe("other");
  });

  it("updates the meal title and drops stale advice after an item correction", () => {
    const corrected = withCorrectedItems({
      id: "meal-1", title: "单贯鱼握寿司", mealType: "dinner", imageKey: "bowl",
      confidence: 95, insight: "原食物建议", items: [],
    }, [{ id: "fish-1", name: "鲷鱼寿司", amount: "75g", calories: 113, protein: 6, carbs: 17, fat: 1 }]);
    expect(corrected.title).toBe("鲷鱼寿司");
    expect(corrected.items[0].calories).toBe(113);
    expect(corrected.insight).not.toContain("原食物建议");
  });

  it("keeps the original snapshot bounded and free of image or token data", () => {
    const snapshot = snapshotForRecognition({
      id: "analysis-local",
      analysisId: "analysis-1",
      title: "鸡胸肉沙拉",
      mealType: "lunch",
      imageKey: "bowl",
      confidence: 92,
      insight: "insight should not be sent",
      imagePath: "wxfile://private-image",
      items: [
        {
          id: "item-1",
          name: "鸡胸肉",
          amount: "120g",
          aiQuantityG: 120,
          calories: 198,
          protein: 37,
          carbs: 0,
          fat: 4,
        },
      ],
    });

    expect(snapshot).toEqual({
      mealType: "lunch",
      title: "鸡胸肉沙拉",
      items: [
        {
          id: "item-1",
          name: "鸡胸肉",
          quantityG: 120,
          amount: "120g",
          calories: 198,
          protein: 37,
          carbs: 0,
          fat: 4,
          foodId: null,
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("wxfile");
    expect(JSON.stringify(snapshot)).not.toContain("insight");
  });

  it("stores a correction context independently from the analysis store", () => {
    const store = createRecognitionFeedbackStore();
    store.getState().start({
      feedbackId: "feedback-1",
      analysisId: "analysis-1",
      feedbackType: "wrong_food",
      originalResult: { mealType: "lunch", title: "原始餐食", items: [] },
    });
    store.getState().setReplacementItemId("item-1");
    store.getState().setSelectedQuantityG(180);
    store.getState().setCorrectedResult({ mealType: "lunch", title: "修正餐食", items: [] });

    expect(store.getState()).toMatchObject({
      feedbackId: "feedback-1",
      analysisId: "analysis-1",
      feedbackType: "wrong_food",
      replacementItemId: "item-1",
      selectedQuantityG: 180,
      correctedResult: { title: "修正餐食" },
    });
  });

  it("keeps the result page feedback sidecar next to the existing save flow", () => {
    expect(source).toContain("<RecognitionFeedbackSheet");
    expect(source).toContain('onClick={() => setRecognitionFeedbackSheetMode("reasons")}');
    expect(source).toContain("createProductMeal");
    expect(source).toContain("createRecognitionFeedback");
    expect(source).toContain("updateRecognitionFeedback");
    expect(source).toContain(
      'Taro.navigateTo({ url: "/pages/portion-adjustment/index?recognitionFeedback=1" })',
    );
  });

  it("replaces a recognized food in-place using the entered name and grams", () => {
    expect(source).toContain('setRecognitionFeedbackSheetMode("replace")');
    expect(source).toContain("analyzeProductMeal([{ name, quantityG }])");
    expect(source).toContain("targetId ? nextItem : item");
    expect(source).not.toContain("selection.selectedQuantityG");
    expect(sheetSource).toContain('mode === "replace" ? onSubmitReplace(name, quantityG)');
  });

  it("keeps Android food-detail portion controls on explicit compact typography", () => {
    expect(detailSource).toContain('className="food-detail-page__portion-chip-label"');
    expect(detailSource).toContain('className="food-detail-page__portion-custom-label"');
    expect(detailSource).toContain('className="food-detail-page__portion-value"');
    expect(detailSource).toContain('className="food-detail-page__portion-unit"');
  });

  it("adds a manually named food from analyzed nutrition without opening the catalog", () => {
    expect(source).toContain('setRecognitionFeedbackSheetMode("missing")');
    expect(source).not.toContain('mode=recognition-add');
    expect(source).toContain("analyzeProductMeal([{ name, quantityG }])");
    expect(mealItemFromAnalyzedFood({
      name: "西兰花",
      quantityG: 100,
      caloriesPer100g: 35,
      proteinPer100g: 2.4,
      carbsPer100g: 7.2,
      fatPer100g: 0.4,
    }, "manual-1")).toMatchObject({
      id: "manual-1",
      name: "西兰花",
      amount: "100g",
      calories: 35,
      protein: 2.4,
      carbs: 7.2,
      fat: 0.4,
    });
  });

  it("does not allow removing the only recognized food", () => {
    expect(source).toContain("meal.items.length <= 1");
    expect(source).toContain("至少需要保留一种食物");
  });

  it("shows the missing-food success motion only after the add request succeeds", () => {
    expect(sheetSource).toContain('setMissingSuccess(true)');
    expect(sheetSource).toContain('if (added)');
    expect(sheetSource).toContain('recognition-feedback-sheet__submit-success');
    expect(source).not.toContain('已补充「${nextItem.name}」并更新营养估算');
  });

  it("waits for other feedback to persist before showing the Stitch success modal", () => {
    expect(source).toContain('await recognitionFeedbackCreateRef.current');
    expect(source).toContain('await updateRecognitionFeedback(feedbackId, { note })');
    expect(source).toContain('presentation: "recognition"');
    expect(source).toContain('title: "反馈已提交"');
    expect(sheetSource).toContain('otherLoading');
  });
});
