import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { refreshAndroidSmartReminders } from "../../features/smart-reminders/coordinator";

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

const initialMealType = (value?: string): MealType =>
  value === "breakfast" || value === "lunch" || value === "dinner" || value === "snack"
    ? value
    : inferMealTypeFromTime();

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
  const { t } = useTranslation();
  const { params } = useRouter();
  const meals = useMealStore();
  const feedback = useFeedbackStore();
  const consumeSelectedFood = useFoodSelectionStore((state) => state.consumeSelectedFood);
  const [title, setTitle] = useState("");
  const [recordDate, setRecordDate] = useState(getLocalDateString);
  const [recordTime, setRecordTime] = useState(nowTime);
  const [mealType, setMealType] = useState<MealType>(() => initialMealType(params.mealType));
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [portionG, setPortionG] = useState("100");
  const [selectedFood, setSelectedFood] = useState<ProductFoodCatalogItem | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateStatus, setEstimateStatus] = useState<"prompt" | "estimated" | "failed" | "portion" | "preparing">("prompt");
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
      setEstimateStatus("estimated");
    } catch {
      setEstimateStatus("failed");
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
    setEstimateStatus("portion");
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
    setEstimateStatus(value.trim() ? "preparing" : "prompt");
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
      feedback.show({ message: t("manualMeal.nameRequired"), tone: "error" });
      return;
    }
    if (!nutrition.every((value) => Number.isFinite(value) && value >= 0) || nutrition[0] === 0) {
      feedback.show({ message: t("manualMeal.nutritionRequired"), tone: "error" });
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
      insight: t("manualMeal.localInsight"),
      items: [
        {
          id: `manual-item-${Date.now()}`,
          name: title.trim(),
          amount: t("manualMeal.title"),
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
      void refreshAndroidSmartReminders();
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
      feedback.show({ message: t("manualMeal.saveFailed"), tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title={t("manualMeal.title")}
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
                <Text>{t("manualMeal.selectedFood")}</Text>
                <Text>{selectedFood.description}</Text>
              </View>
            </View>
          ) : null}
          <View className="manual-meal__field">
            <Text>{t("manualMeal.name")}</Text>
            <Input
              value={title}
              maxlength={24}
              placeholder={t("manualMeal.namePlaceholder")}
              nativeProps={{
                style: { boxSizing: "border-box", height: "100%", lineHeight: "normal", padding: 0 },
              }}
              onInput={(event) => updateTitle(event.detail.value)}
            />
          </View>
          <View className="manual-meal__field">
            <Text>{t("manualMeal.time")}</Text>
            <RecordTimeEditor
              date={recordDate}
              time={recordTime}
              onDateChange={setRecordDate}
              onTimeChange={setRecordTime}
            />
          </View>
          <View className="manual-meal__field">
            <Text>{t("manualMeal.type")}</Text>
            <View className="manual-meal__types">
              {mealTypeOptions.map((option) => (
                <View
                  className={`manual-meal__type ${mealType === option.value ? "manual-meal__type--active" : ""}`}
                  key={option.value}
                  onClick={() => setMealType(option.value)}
                >
                  <Text>{t(`meals.${option.value}`)}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="manual-meal__nutrition-title">
            <Text>{t("manualMeal.estimate")}</Text>
            <View className="manual-meal__estimate-copy">
              <Text>{isEstimating ? t("manualMeal.estimating") : t(`manualMeal.estimateStatus.${estimateStatus}`, { title })}</Text>
              {!selectedFood && title.trim() ? (
                <Text className="manual-meal__estimate-action" onClick={() => void estimateFromTitle(true)}>{t("manualMeal.reestimate")}</Text>
              ) : null}
            </View>
          </View>
          {selectedFood ? (
            <View className="manual-meal__portion">
              <Text>{t("manualMeal.portion")}</Text>
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
              [t("nutrition.calories"), "kcal", "calories", calories],
              [t("nutrition.protein"), "g", "protein", protein],
              [t("nutrition.carbs"), "g", "carbs", carbs],
              [t("nutrition.fat"), "g", "fat", fat],
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
          <NordicIcon name="check" size={18} ariaLabel={t("manualMeal.localSave")} />
          <Text>{t("manualMeal.saveHint")}</Text>
        </View>
      </View>
      <View className="manual-meal__action">
        <AppButton size="large" loading={isSaving} onClick={() => void save()}>
          {t("manualMeal.save")}
        </AppButton>
      </View>
    </PageLayout>
  );
}
