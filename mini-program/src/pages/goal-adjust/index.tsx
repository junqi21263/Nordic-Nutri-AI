import { Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import {
  getProductNutritionPlan,
  saveProductGoal,
  saveProductNutritionPlan,
} from "../../api/product-data-api";
import { AppButton } from "../../components/app-button";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";
import { navigateBackOrHome } from "../../utils/navigation";

const goalTypeByLabel: Record<string, "muscle_gain" | "fat_loss" | "maintain"> = {
  精益增肌: "muscle_gain",
  轻盈减脂: "fat_loss",
  保持状态: "maintain",
};

export default function GoalAdjustPage() {
  const profile = useProfileStore();
  const feedback = useFeedbackStore();
  const [targetWeight, setTargetWeight] = useState(String(profile.profile.targetWeight));
  const [targetCalories, setTargetCalories] = useState(String(profile.profile.targetCalories));
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    const nextTargetWeight = Number(targetWeight);
    const nextCalories = Number(targetCalories);
    if (!Number.isFinite(nextTargetWeight) || nextTargetWeight < 30 || nextTargetWeight > 300) {
      feedback.show({ message: "请输入 30–300 kg 的目标体重", tone: "error" });
      return;
    }
    if (!Number.isFinite(nextCalories) || nextCalories < 1000 || nextCalories > 6000) {
      feedback.show({ message: "请输入 1000–6000 kcal 的目标热量", tone: "error" });
      return;
    }
    setIsSaving(true);
    try {
      const currentPlan = await getProductNutritionPlan();
      if (!currentPlan) throw new Error("当前营养计划不存在");
      await saveProductGoal({
        goalType: goalTypeByLabel[profile.profile.goalLabel] ?? "muscle_gain",
        targetWeightKg: nextTargetWeight,
        targetCaloriesKcal: nextCalories,
        targetDate: null,
      });
      await saveProductNutritionPlan({
        calories: nextCalories,
        proteinG: currentPlan.proteinG,
        carbsG: currentPlan.carbsG,
        fatG: currentPlan.fatG,
      });
      profile.setProfile({ targetWeight: nextTargetWeight, targetCalories: nextCalories });
      feedback.show({ message: "目标已更新，继续保持节奏", tone: "success" });
      navigateBackOrHome("/pages/profile/index");
    } catch {
      feedback.show({ message: "目标保存失败，请稍后重试", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title="调整目标"
      showTabs={false}
      hideNavigation
      className="page-layout--goal-adjust"
    >
      <View className="profile-subpage__page-title">
        <View
          className="profile-subpage__back"
          ariaLabel="返回编辑资料"
          onClick={() => navigateBackOrHome("/pages/profile-edit/index")}
        >
          ‹
        </View>
        <Text>调整目标</Text>
      </View>
      <View className="profile-flow profile-goal-adjust">
        <View className="profile-goal-adjust__intro">
          <Text>给目标留一点余地，才能更稳定地靠近它。</Text>
        </View>

        <View className="profile-form">
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
          <View className="profile-form__field">
            <Text>每日目标热量</Text>
            <View className="profile-form__input-row">
              <Input
                type="number"
                value={targetCalories}
                placeholder="2600"
                onInput={(event) => setTargetCalories(event.detail.value)}
              />
              <Text>kcal</Text>
            </View>
            <Text className="profile-form__hint">保存后会同步到你的账号，用于进度展示。</Text>
          </View>
        </View>
      </View>
      <View className="profile-edit__action">
        <AppButton size="large" loading={isSaving} onClick={() => void save()}>
          保存目标
        </AppButton>
      </View>
    </PageLayout>
  );
}
