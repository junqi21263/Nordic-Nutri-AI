import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import {
  getProductNutritionPlan,
  saveProductGoal,
  saveProductNutritionPlan,
} from "../../api/product-data-api";
import { AppButton } from "../../components/app-button";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealStore } from "../../stores/meal-store";
import { useProfileStore } from "../../stores/profile-store";
import { navigateBackOrHome } from "../../utils/navigation";

const goalTypeByLabel: Record<string, "muscle_gain" | "fat_loss" | "maintain"> = {
  增益增肌: "muscle_gain",
  轻盈减脂: "fat_loss",
  保持状态: "maintain",
};

function parsePositiveInt(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next) : NaN;
}

export default function GoalAdjustPage() {
  const profile = useProfileStore();
  const feedback = useFeedbackStore();
  const [targetWeight, setTargetWeight] = useState(String(profile.profile.targetWeight || ""));
  const [targetCalories, setTargetCalories] = useState(String(profile.profile.targetCalories || ""));
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useDidShow(() => {
    setLoadingPlan(true);
    void getProductNutritionPlan()
      .then((plan) => {
        if (!plan) return;
        setTargetCalories(String(plan.calories));
        setProteinG(String(plan.proteinG));
        setCarbsG(String(plan.carbsG));
        setFatG(String(plan.fatG));
      })
      .catch(() => undefined)
      .finally(() => setLoadingPlan(false));
  });

  const macroCalories =
    (parsePositiveInt(proteinG) || 0) * 4 +
    (parsePositiveInt(carbsG) || 0) * 4 +
    (parsePositiveInt(fatG) || 0) * 9;
  const calorieGap = Math.abs(macroCalories - (parsePositiveInt(targetCalories) || 0));

  const save = async () => {
    const nextTargetWeight = Number(targetWeight);
    const nextCalories = parsePositiveInt(targetCalories);
    const nextProtein = parsePositiveInt(proteinG);
    const nextCarbs = parsePositiveInt(carbsG);
    const nextFat = parsePositiveInt(fatG);

    if (!Number.isFinite(nextTargetWeight) || nextTargetWeight < 30 || nextTargetWeight > 300) {
      feedback.show({ message: "请输入 30–300 kg 的目标体重", tone: "error" });
      return;
    }
    if (!Number.isFinite(nextCalories) || nextCalories < 800 || nextCalories > 10000) {
      feedback.show({ message: "请输入 800–10000 kcal 的目标热量", tone: "error" });
      return;
    }
    if (!Number.isFinite(nextProtein) || nextProtein < 1 || nextProtein > 1000) {
      feedback.show({ message: "请输入 1–1000 g 的蛋白质目标", tone: "error" });
      return;
    }
    if (!Number.isFinite(nextCarbs) || nextCarbs < 0 || nextCarbs > 1500) {
      feedback.show({ message: "请输入 0–1500 g 的碳水目标", tone: "error" });
      return;
    }
    if (!Number.isFinite(nextFat) || nextFat < 1 || nextFat > 500) {
      feedback.show({ message: "请输入 1–500 g 的脂肪目标", tone: "error" });
      return;
    }

    setIsSaving(true);
    try {
      await saveProductGoal({
        goalType: goalTypeByLabel[profile.profile.goalLabel] ?? "muscle_gain",
        targetWeightKg: nextTargetWeight,
        targetCaloriesKcal: nextCalories,
        targetDate: null,
      });
      await saveProductNutritionPlan({
        calories: nextCalories,
        proteinG: nextProtein,
        carbsG: nextCarbs,
        fatG: nextFat,
      });
      try {
        const { evaluateProductAchievements } = await import("../../features/coach/refresh-achievements");
        await evaluateProductAchievements();
      } catch (error) {
        // A saved target must remain usable even if the optional celebration refresh fails.
        console.warn("[achievements] goal adjustment evaluation failed", error);
      }
      profile.setProfile({ targetWeight: nextTargetWeight, targetCalories: nextCalories });
      useMealStore.getState().setDailyTargets({
        calories: nextCalories,
        protein: nextProtein,
        carbs: nextCarbs,
        fat: nextFat,
      });
      feedback.show({ message: "今日目标已更新", tone: "success" });
      navigateBackOrHome("/pages/home/index");
    } catch {
      feedback.show({ message: "目标保存失败，请稍后重试", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title="调整今日目标"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--goal-adjust"
    >
      <View className="profile-subpage__page-title">
        <Text>调整今日目标</Text>
      </View>
      <View className="profile-flow profile-goal-adjust">
        <View className="profile-goal-adjust__intro">
          <Text>可按自己的训练和饮食节奏，手动设定每日热量与三大营养素目标。</Text>
        </View>

        <View className="profile-form">
          <View className="profile-form__field">
            <Text>每日目标热量</Text>
            <View className="profile-form__input-row">
              <Input
                type="number"
                value={targetCalories}
                disabled={loadingPlan}
                placeholder="2450"
                onInput={(event) => setTargetCalories(event.detail.value)}
              />
              <Text>kcal</Text>
            </View>
          </View>
          <View className="profile-form__field">
            <Text>蛋白质</Text>
            <View className="profile-form__input-row">
              <Input
                type="number"
                value={proteinG}
                disabled={loadingPlan}
                placeholder="150"
                onInput={(event) => setProteinG(event.detail.value)}
              />
              <Text>g</Text>
            </View>
          </View>
          <View className="profile-form__field">
            <Text>碳水</Text>
            <View className="profile-form__input-row">
              <Input
                type="number"
                value={carbsG}
                disabled={loadingPlan}
                placeholder="280"
                onInput={(event) => setCarbsG(event.detail.value)}
              />
              <Text>g</Text>
            </View>
          </View>
          <View className="profile-form__field">
            <Text>脂肪</Text>
            <View className="profile-form__input-row">
              <Input
                type="number"
                value={fatG}
                disabled={loadingPlan}
                placeholder="80"
                onInput={(event) => setFatG(event.detail.value)}
              />
              <Text>g</Text>
            </View>
            <Text className="profile-form__hint">
              宏量合计约 {macroCalories || 0} kcal
              {calorieGap > 150 ? "，与热量目标差距较大，可再微调" : "，保存后同步到首页今日目标"}
            </Text>
          </View>
          <View className="profile-form__field">
            <Text>目标体重</Text>
            <View className="profile-form__input-row">
              <Input
                type="digit"
                value={targetWeight}
                placeholder="74"
                onInput={(event) => setTargetWeight(event.detail.value)}
              />
              <Text>kg</Text>
            </View>
            <Text className="profile-form__hint">
              当前 {profile.profile.weight} kg，建议设定可持续的阶段目标。
            </Text>
          </View>
        </View>
      </View>
      <View className="profile-edit__action">
        <AppButton size="large" loading={isSaving || loadingPlan} onClick={() => void save()}>
          保存今日目标
        </AppButton>
      </View>
    </PageLayout>
  );
}
