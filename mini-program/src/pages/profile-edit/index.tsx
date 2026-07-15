import { Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { NordicIcon } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";
import { navigateBackOrHome } from "../../utils/navigation";

const goalOptions = ["精益增肌", "轻盈减脂", "保持状态"];

export default function ProfileEditPage() {
  const profile = useProfileStore();
  const feedback = useFeedbackStore();
  const [nickname, setNickname] = useState(profile.profile.nickname);
  const [weight, setWeight] = useState(String(profile.profile.weight));
  const [goalLabel, setGoalLabel] = useState(profile.profile.goalLabel);

  const save = () => {
    const nextWeight = Number(weight);
    if (!Number.isFinite(nextWeight) || nextWeight < 30 || nextWeight > 300) {
      feedback.show({ message: "请输入 30–300 kg 的体重", tone: "error" });
      return;
    }
    profile.setProfile({
      nickname: nickname.trim() || profile.profile.nickname,
      weight: nextWeight,
      goalLabel,
    });
    feedback.show({ message: "个人资料已保存", tone: "success" });
    navigateBackOrHome("/pages/profile/index");
  };

  return (
    <PageLayout
      title="编辑资料"
      showTabs={false}
      hideNavigation
      className="page-layout--profile-edit"
    >
      <View className="profile-subpage__page-title">
        <View
          className="profile-subpage__back"
          ariaLabel="返回个人中心"
          onClick={() => navigateBackOrHome("/pages/profile/index")}
        >
          ‹
        </View>
        <Text>编辑资料</Text>
      </View>
      <View className="profile-flow">
        <View onClick={() => void Taro.navigateTo({ url: "/pages/goal-adjust/index" })}>
          <AppCard className="profile-form__summary profile-form__summary--action">
            <View className="profile-form__summary-icon">
              <NordicIcon name="user-round" size={22} ariaLabel="个人资料" />
            </View>
            <View>
              <Text>当前目标</Text>
              <Text>
                {goalLabel} · {profile.profile.targetWeight} kg · 调整 ›
              </Text>
            </View>
          </AppCard>
        </View>

        <View className="profile-form">
          <View className="profile-form__field">
            <Text>昵称</Text>
            <Input
              value={nickname}
              maxlength={16}
              placeholder="输入你的昵称"
              onInput={(event) => setNickname(event.detail.value)}
            />
          </View>
          <View className="profile-form__field">
            <Text>当前体重</Text>
            <View className="profile-form__input-row">
              <Input
                type="digit"
                value={weight}
                placeholder="70"
                onInput={(event) => setWeight(event.detail.value)}
              />
              <Text>kg</Text>
            </View>
          </View>
          <View className="profile-form__field">
            <Text>当前方向</Text>
            <View className="profile-choice-group">
              {goalOptions.map((option) => (
                <View
                  className={`profile-choice ${goalLabel === option ? "profile-choice--active" : ""}`}
                  key={option}
                  onClick={() => setGoalLabel(option)}
                >
                  <Text>{option}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className="profile-edit__notice">
          <View className="profile-edit__notice-icon">
            <NordicIcon name="check" size={20} ariaLabel="本地保存" />
          </View>
          <View>
            <Text>本地资料说明</Text>
            <Text>保存后会更新个人中心展示；数据仅保留在当前设备。</Text>
          </View>
        </View>
      </View>
      <View className="profile-edit__action">
        <AppButton size="large" onClick={save}>
          保存资料
        </AppButton>
      </View>
    </PageLayout>
  );
}
