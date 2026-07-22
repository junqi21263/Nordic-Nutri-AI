import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { AppButton } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import { createProductMeal, getProductMeals } from "../../api/meal-data-api";
import { type MealType } from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import type { ProductFoodCatalogItem } from "../../api/food-catalog-api";
import { navigateBackOrHome } from "../../utils/navigation";

const mealTypes: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
  { value: "snack", label: "加餐" },
];

const nowTime = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const readNumber = (value: string) => Number(value || 0);
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
  const [mealType, setMealType] = useState<MealType>("snack");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [portionG, setPortionG] = useState("100");
  const [selectedFood, setSelectedFood] = useState<ProductFoodCatalogItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    const date = getLocalDateString();
    const time = nowTime();
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
    setIsSaving(true);
    try {
      const quantityG = Number(portionG);
      const normalization = Number.isFinite(quantityG) && quantityG > 0 ? 100 / quantityG : 1;
      const saved = await createProductMeal({
        mealType: localMeal.mealType,
        name: localMeal.title,
        recordedAt: new Date(`${date}T${time}:00+08:00`).toISOString(),
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
      meals.replaceRemoteMeals(await getProductMeals(date), date);
      feedback.show({ message: "已保存并同步到饮食记录", tone: "success" });
      navigateBackOrHome(`/pages/meal-detail/index?id=${saved.id}`);
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
      className="page-layout--manual-meal"
    >
      <View className="manual-meal-page">
        <View className="manual-meal__page-title">
          <View
            className="manual-meal__back"
            ariaLabel="返回"
            onClick={() => navigateBackOrHome("/pages/meal-records/index")}
          >
            <NordicIcon name="back" size={22} ariaLabel="返回" />
          </View>
          <Text>补充这一餐</Text>
        </View>
        <Text className="manual-meal__description">不方便拍照时，也能快速把饮食节奏记下来。</Text>
        <View className="manual-meal__catalog-link" onClick={() => void Taro.navigateTo({ url: "/pages/food-catalog/index" })}>
          <View className="manual-meal__catalog-link-copy">
            <NordicIcon name="utensils" size={22} ariaLabel="标准食物库" />
            <View>
              <Text>从标准食物库添加</Text>
              <Text>USDA 标准营养数据会自动回填</Text>
            </View>
          </View>
          <NordicIcon name="chevron-right" size={20} ariaLabel="打开食物库" />
        </View>
        <View className="manual-meal__form">
          <View className="manual-meal__field">
            <Text>餐次名称</Text>
            <Input
              value={title}
              maxlength={24}
              placeholder="例如：鸡胸肉沙拉"
              onInput={(event) => setTitle(event.detail.value)}
            />
          </View>
          <View className="manual-meal__field">
            <Text>餐次时间</Text>
            <Text className="manual-meal__time">今天 · {nowTime()}</Text>
          </View>
          <View className="manual-meal__field">
            <Text>餐次类型</Text>
            <View className="manual-meal__types">
              {mealTypes.map((option) => (
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
            <Text>{selectedFood ? "已按当前份量自动计算" : "可按包装或常见份量填写"}</Text>
          </View>
          {selectedFood ? (
            <View className="manual-meal__portion">
              <Text>食用份量</Text>
              <View>
                <Input type="digit" value={portionG} placeholder="100" onInput={(event) => updatePortion(event.detail.value)} />
                <Text>g</Text>
              </View>
            </View>
          ) : null}
          <View className="manual-meal__nutrition-grid">
            {[
              ["热量", "kcal", calories, setCalories],
              ["蛋白质", "g", protein, setProtein],
              ["碳水", "g", carbs, setCarbs],
              ["脂肪", "g", fat, setFat],
            ].map(([label, unit, value, setter]) => (
              <View className="manual-meal__nutrition-field" key={label as string}>
                <Text>{label as string}</Text>
                <View>
                  <Input
                    type="digit"
                    value={value as string}
                    placeholder="0"
                    onInput={(event) => (setter as (next: string) => void)(event.detail.value)}
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
