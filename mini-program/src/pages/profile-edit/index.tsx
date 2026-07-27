import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import {
  getProductAccount,
  saveProductBodyProfile,
  saveProductGoal,
  saveProductNutritionPlan,
  saveProductProfile,
} from "../../api/product-data-api";
import { uploadProfileAvatar } from "../../api/profile-avatar-api";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { NordicIcon } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";
import { navigateBackOrHome } from "../../utils/navigation";
import { resolveAvatarUrl } from "../../features/profile/avatar-defaults";

const goalOptions = ["精益增肌", "轻盈减脂", "保持状态"];
const goalTypeByLabel: Record<string, "muscle_gain" | "fat_loss" | "maintain"> = {
  精益增肌: "muscle_gain",
  轻盈减脂: "fat_loss",
  保持状态: "maintain",
};

export default function ProfileEditPage() {
  const profile = useProfileStore();
  const feedback = useFeedbackStore();
  const [nickname, setNickname] = useState(profile.profile.nickname);
  const [weight, setWeight] = useState(String(profile.profile.weight));
  const [goalLabel, setGoalLabel] = useState(profile.profile.goalLabel);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const onChooseAvatar = async (event: { detail?: { avatarUrl?: string } }) => {
    if (isUploadingAvatar || isSaving) return;
    const filePath = typeof event.detail?.avatarUrl === "string" ? event.detail.avatarUrl.trim() : "";
    if (!filePath) return;
    try {
      setIsUploadingAvatar(true);
      const uploaded = await uploadProfileAvatar(filePath);
      profile.setProfile({ avatarUrl: uploaded.avatarUrl });
      feedback.show({ message: "头像已更新", tone: "success" });
    } catch (error) {
      if (!String(error).includes("cancel")) {
        feedback.show({
          message: error instanceof Error ? error.message : "头像上传失败，请稍后重试",
          tone: "error",
        });
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const save = async () => {
    const nextWeight = Number(weight);
    if (!Number.isFinite(nextWeight) || nextWeight < 30 || nextWeight > 300) {
      feedback.show({ message: "请输入 30–300 kg 的体重", tone: "error" });
      return;
    }
    const nextNickname = nickname.trim() || profile.profile.nickname;
    setIsSaving(true);
    try {
      const account = await getProductAccount();
      if (
        account.age === null ||
        account.sex === null ||
        account.heightCm === null ||
        account.activityLevel === null ||
        account.trainingDays === null
      ) {
        throw new Error("请先补全身体资料");
      }
      const saved = await saveProductProfile({ nickname: nextNickname });
      await saveProductBodyProfile({
        age: account.age,
        birthDate: null,
        sex: account.sex,
        heightCm: account.heightCm,
        weightKg: nextWeight,
        activityLevel: account.activityLevel,
        trainingDays: account.trainingDays,
      });
      await saveProductGoal({
        goalType: goalTypeByLabel[goalLabel] ?? "muscle_gain",
        targetWeightKg: account.targetWeightKg,
        targetCaloriesKcal: account.targetCaloriesKcal,
        targetDate: null,
      });
      if (account.nutritionPlan) {
        await saveProductNutritionPlan({
          calories: account.nutritionPlan.calories,
          proteinG: account.nutritionPlan.proteinG,
          carbsG: account.nutritionPlan.carbsG,
          fatG: account.nutritionPlan.fatG,
        });
      }
      const savedNickname = saved.nickname || nextNickname;
      profile.setProfile({ nickname: savedNickname, weight: nextWeight, goalLabel });
      feedback.show({ message: "个人资料已保存", tone: "success" });
      navigateBackOrHome("/pages/profile/index");
    } catch {
      feedback.show({ message: "个人资料保存失败，请稍后重试", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title="编辑资料"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--profile-edit"
    >
      <View className="profile-flow">
        <Button
          className="profile-edit__avatar"
          openType="chooseAvatar"
          onChooseAvatar={(event) => void onChooseAvatar(event)}
        >
          {resolveAvatarUrl(profile.profile.avatarUrl) ? (
            <Image src={resolveAvatarUrl(profile.profile.avatarUrl)!} mode="aspectFill" />
          ) : (
            <Text>{profile.profile.nickname.slice(0, 1).toUpperCase()}</Text>
          )}
          <View className="profile-edit__avatar-action"><Text>{isUploadingAvatar ? "上传中" : "更换头像"}</Text></View>
        </Button>
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
              type="nickname"
              value={nickname}
              maxlength={16}
              placeholder="输入你的昵称"
              onInput={(event) => setNickname(event.detail.value)}
              onBlur={(event) => setNickname(event.detail.value)}
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
            <NordicIcon name="check" size={20} ariaLabel="账号保存" />
          </View>
          <View>
            <Text>资料保存说明</Text>
            <Text>昵称会保存到你的账号，并更新个人中心展示。</Text>
          </View>
        </View>
      </View>
      <View className="profile-edit__action">
        <AppButton size="large" loading={isSaving} onClick={() => void save()}>
          保存资料
        </AppButton>
      </View>
    </PageLayout>
  );
}
