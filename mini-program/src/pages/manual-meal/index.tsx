import { Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import { AppButton } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import { type MealType } from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
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

export default function ManualMealPage() {
  const meals = useMealStore();
  const feedback = useFeedbackStore();
  const [title, setTitle] = useState("");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const save = () => {
    const nutrition = [calories, protein, carbs, fat].map(readNumber);
    if (!title.trim()) {
      feedback.show({ message: "请填写这一餐的名称", tone: "error" });
      return;
    }
    if (!nutrition.every((value) => Number.isFinite(value) && value >= 0) || nutrition[0] === 0) {
      feedback.show({ message: "请填写有效的热量与营养数据", tone: "error" });
      return;
    }
    const id = meals.addMeal({
      date: getLocalDateString(),
      time: nowTime(),
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
    });
    feedback.show({ message: "已添加到今日饮食记录", tone: "success" });
    navigateBackOrHome(`/pages/meal-detail/index?id=${id}`);
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
            <Text>可按包装或常见份量填写</Text>
          </View>
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
        <AppButton size="large" onClick={save}>
          保存这餐
        </AppButton>
      </View>
    </PageLayout>
  );
}
