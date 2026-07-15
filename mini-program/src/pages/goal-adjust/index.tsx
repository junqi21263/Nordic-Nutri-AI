import { Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import { AppButton } from "../../components/app-button";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";
import { navigateBackOrHome } from "../../utils/navigation";

export default function GoalAdjustPage() {
  const profile = useProfileStore();
  const feedback = useFeedbackStore();
  const [targetWeight, setTargetWeight] = useState(String(profile.profile.targetWeight));
  const [targetCalories, setTargetCalories] = useState(String(profile.profile.targetCalories));

  const save = () => {
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
    profile.setProfile({ targetWeight: nextTargetWeight, targetCalories: nextCalories });
    feedback.show({ message: "目标已更新，继续保持节奏", tone: "success" });
    navigateBackOrHome("/pages/profile/index");
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
            <Text className="profile-form__hint">此目标只在本地体验中用于进度展示。</Text>
          </View>
        </View>
      </View>
      <View className="profile-edit__action">
        <AppButton size="large" onClick={save}>
          保存目标
        </AppButton>
      </View>
    </PageLayout>
  );
}
