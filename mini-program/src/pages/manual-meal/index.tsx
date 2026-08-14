import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppButton } from "../../components/app-button";
import { FoodThumbnail } from "../../components/food-thumbnail";
import { NordicIcon } from "../../components/nordic-icon";
import { RecordTimeEditor } from "../../components/record-time-editor";
import { analyzeProductMeal, createProductMeal, getProductMeals } from "../../api/meal-data-api";
import { type MealType } from "../../features/meals/domain";
import { toMealSavedCelebration } from "../../features/meals/meal-saved-celebration-data";
import { estimateNutritionFromAnalysis, type ManualMealNutrition } from "../../features/meals/manual-meal-estimate";
import { inferMealTypeFromTime, mealTypeOptions } from "../../features/meals/meal-type";
import { getLocalDateString } from "../../features/onboarding/domain";
import { recordedAtFromLocal } from "../../features/meals/product-meal-input";
import { tryPresentPendingMilestone } from "../../features/milestones/presentation-flow";
import { shouldClaimAfterMealSave } from "../../features/milestones/runtime";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import { useMealSavedCelebrationStore } from "../../stores/meal-saved-celebration-store";
import type { ProductFoodCatalogItem } from "../../api/food-catalog-api";

const nowTime = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const readNumber = (value: string) => Number(value || 0);
type NutritionField = "calories" | "protein" | "carbs" | "fat";
const displayNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? String(Math.round(number * 10) / 10) : "";
};

function scaleNutrition(food: ProductFoodCatalogItem, grams: number) {
  const scale = grams / 100;
  return {
    calories: displayNumber(Number(food.caloriesKcalPer100g) * scale),
    protein: displayNumber(Number(food.proteinGPer100g) * scale),
    carbs: displayNumber(Number(food.carbsGPer100g) * scale),
    fat: displayNumber(Number(food.fatGPer100g) * scale),
  };
}

export default function ManualMealPage() {
  const meals = useMealStore();
  const feedback = useFeedbackStore();
  const consumeSelectedFood = useFoodSelectionStore((state) => state.consumeSelectedFood);
  const [title, setTitle] = useState("");
  const [recordDate, setRecordDate] = useState(getLocalDateString);
  const [recordTime, setRecordTime] = useState(nowTime);
  const [mealType, setMealType] = useState<MealType>(() => inferMealTypeFromTime());
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [portionG, setPortionG] = useState("100");
  const [selectedFood, setSelectedFood] = useState<ProductFoodCatalogItem | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateCopy, setEstimateCopy] = useState("填写餐食名称后可自动估算，也可手动修改");
  const [isSaving, setIsSaving] = useState(false);
  const manuallyEdited = useRef<Record<NutritionField, boolean>>({
    calories: false,
    protein: false,
    carbs: false,
    fat: false,
  });

  const setNutrition = (nutrition: ManualMealNutrition, force = false) => {
    if (force || !manuallyEdited.current.calories) setCalories(nutrition.calories);
    if (force || !manuallyEdited.current.protein) setProtein(nutrition.protein);
    if (force || !manuallyEdited.current.carbs) setCarbs(nutrition.carbs);
    if (force || !manuallyEdited.current.fat) setFat(nutrition.fat);
  };

  const estimateFromTitle = useCallback(async (force = false) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || selectedFood) return;
    setIsEstimating(true);
    try {
      const analysis = await analyzeProductMeal([{ name: normalizedTitle, quantityG: 100 }]);
      setNutrition(estimateNutritionFromAnalysis(analysis.items), force);
      setEstimateCopy(`已按“${normalizedTitle}”自动估算，可继续手动修改`);
    } catch {
      setEstimateCopy("暂未获得自动估算，请按包装或常见份量手动填写");
    } finally {
      setIsEstimating(false);
    }
  }, [selectedFood, title]);

  useEffect(() => {
    if (selectedFood || !title.trim()) return;
    const timer = setTimeout(() => void estimateFromTitle(), 600);
    return () => clearTimeout(timer);
  }, [estimateFromTitle, selectedFood, title]);

  useDidShow(() => {
    const food = consumeSelectedFood();
    if (!food) return;
    setTitle(food.description);
    setSelectedFood(food);
    setPortionG("100");
    const nutrition = scaleNutrition(food, 100);
    setCalories(nutrition.calories);
    setProtein(nutrition.protein);
    setCarbs(nutrition.carbs);
    setFat(nutrition.fat);
    manuallyEdited.current = { calories: false, protein: false, carbs: false, fat: false };
    setEstimateCopy("已按当前份量自动计算，可继续手动修改");
  });

  const updatePortion = (value: string) => {
    setPortionG(value);
    const grams = Number(value);
    if (!selectedFood || !Number.isFinite(grams) || grams <= 0) return;
    const nutrition = scaleNutrition(selectedFood, grams);
    setCalories(nutrition.calories);
    setProtein(nutrition.protein);
    setCarbs(nutrition.carbs);
    setFat(nutrition.fat);
  };

  const updateTitle = (value: string) => {
    setTitle(value);
    setSelectedFood(null);
    manuallyEdited.current = { calories: false, protein: false, carbs: false, fat: false };
    setEstimateCopy(value.trim() ? "正在根据餐食名称准备估算…" : "填写餐食名称后可自动估算，也可手动修改");
  };

  const updateManualNutrition = (field: NutritionField, value: string) => {
    manuallyEdited.current[field] = true;
    if (field === "calories") setCalories(value);
    if (field === "protein") setProtein(value);
    if (field === "carbs") setCarbs(value);
    if (field === "fat") setFat(value);
  };

  const save = async () => {
    const nutrition = [calories, protein, carbs, fat].map(readNumber);
    if (!title.trim()) {
      feedback.show({ message: "请填写这一餐的名称", tone: "error" });
      return;
    }
    if (!nutrition.every((value) => Number.isFinite(value) && value >= 0) || nutrition[0] === 0) {
      feedback.show({ message: "请填写有效的热量与营养数据", tone: "error" });
      return;
    }
    const date = recordDate;
    const time = recordTime;
    const localMeal = {
      date,
      time,
      title: title.trim(),
      mealType,
      favorite: false,
      imageKey: null,
      insight: "这是一条手动补充的本地饮食记录。",
      items: [
        {
          id: `manual-item-${Date.now()}`,
          name: title.trim(),
          amount: "手动记录",
          calories: nutrition[0]!,
          protein: nutrition[1]!,
          carbs: nutrition[2]!,
          fat: nutrition[3]!,
        },
      ],
    };
    const previousCalories = meals.getDailySummary(date).consumed.calories;
    setIsSaving(true);
    try {
      const quantityG = Number(portionG);
      const normalization = Number.isFinite(quantityG) && quantityG > 0 ? 100 / quantityG : 1;
      const recordedAt = recordedAtFromLocal(recordDate, recordTime);
      const saved = await createProductMeal({
        mealType: localMeal.mealType,
        name: localMeal.title,
        recordedAt: recordedAtFromLocal(recordDate, recordTime),
        items: [
          {
            name: localMeal.title,
            quantityG: Number.isFinite(quantityG) && quantityG > 0 ? quantityG : 100,
            caloriesPer100g: nutrition[0]! * normalization,
            proteinPer100g: nutrition[1]! * normalization,
            carbsPer100g: nutrition[2]! * normalization,
            fatPer100g: nutrition[3]! * normalization,
          },
        ],
      });
      const syncedMeals = await getProductMeals(date);
      meals.replaceRemoteMeals(syncedMeals, date);
      useMealSavedCelebrationStore.getState().show(
        toMealSavedCelebration({
          savedMeal: saved,
          previousCalories,
          syncedMeals,
          targetCalories: meals.dailyTargets.calories,
          afterContinue: shouldClaimAfterMealSave(recordedAt)
            ? async () => Boolean(await tryPresentPendingMilestone("normal_record_success"))
            : undefined,
        }),
      );
      try {
        const { evaluateProductAchievements } = await import("../../features/coach/refresh-achievements");
        await evaluateProductAchievements(date);
      } catch {
        // The saved meal remains valid if achievement refresh is temporarily unavailable.
      }
    } catch {
      feedback.show({ message: "保存失败，请检查网络后重试", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title="手动记录"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--manual-meal"
    >
      <View className="manual-meal-page">
        <View className="manual-meal__form">
          {selectedFood ? (
            <View className="manual-meal__selected-food">
              <FoodThumbnail className="manual-meal__selected-food-image" food={selectedFood} />
              <View>
                <Text>已从食物库选中</Text>
                <Text>{selectedFood.description}</Text>
              </View>
            </View>
          ) : null}
          <View className="manual-meal__field">
            <Text>餐食名称</Text>
            <Input
              value={title}
              maxlength={24}
              placeholder="例如：鸡胸肉沙拉"
              onInput={(event) => updateTitle(event.detail.value)}
            />
          </View>
          <View className="manual-meal__field">
            <Text>记录时间</Text>
            <RecordTimeEditor
              date={recordDate}
              time={recordTime}
              onDateChange={setRecordDate}
              onTimeChange={setRecordTime}
            />
          </View>
          <View className="manual-meal__field">
            <Text>餐次类型</Text>
            <View className="manual-meal__types">
              {mealTypeOptions.map((option) => (
                <View
                  className={`manual-meal__type ${mealType === option.value ? "manual-meal__type--active" : ""}`}
                  key={option.value}
                  onClick={() => setMealType(option.value)}
                >
                  <Text>{option.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="manual-meal__nutrition-title">
            <Text>营养估算</Text>
            <View className="manual-meal__estimate-copy">
              <Text>{isEstimating ? "正在自动估算…" : estimateCopy}</Text>
              {!selectedFood && title.trim() ? (
                <Text className="manual-meal__estimate-action" onClick={() => void estimateFromTitle(true)}>重新估算</Text>
              ) : null}
            </View>
          </View>
          {selectedFood ? (
            <View className="manual-meal__portion">
              <Text>食用份量</Text>
              <View>
                <Input
                  type="digit"
                  value={portionG}
                  placeholder="100"
                  onInput={(event) => updatePortion(event.detail.value)}
                />
                <Text>g</Text>
              </View>
            </View>
          ) : null}
          <View className="manual-meal__nutrition-grid">
            {[
              ["热量", "kcal", "calories", calories],
              ["蛋白质", "g", "protein", protein],
              ["碳水", "g", "carbs", carbs],
              ["脂肪", "g", "fat", fat],
            ].map(([label, unit, value, setter]) => (
              <View className="manual-meal__nutrition-field" key={label as string}>
                <Text>{label as string}</Text>
                <View>
                  <Input
                    type="digit"
                    value={setter as string}
                    placeholder="0"
                    onInput={(event) => updateManualNutrition(value as NutritionField, event.detail.value)}
                  />
                  <Text>{unit as string}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View className="manual-meal__notice">
          <NordicIcon name="check" size={18} ariaLabel="本地保存" />
          <Text>记录会保存在当前设备，并同步到今日汇总。</Text>
        </View>
      </View>
      <View className="manual-meal__action">
        <AppButton size="large" loading={isSaving} onClick={() => void save()}>
          保存这餐
        </AppButton>
      </View>
    </PageLayout>
  );
}
