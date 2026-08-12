import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import {
  getProductAccount,
  previewProductNutritionPlan,
  saveProductBodyProfile,
  saveProductGoal,
  saveProductNutritionPlan,
  saveProductProfile,
} from "../../api/product-data-api";
import { randomizeDefaultAvatar, uploadProfileAvatar } from "../../api/profile-avatar-api";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { NordicIcon } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";
import { navigateBackOrHome } from "../../utils/navigation";
import { resolveAvatarUrl, isDefaultAvatarSentinel } from "../../features/profile/avatar-defaults";
import { nicknameModerationError } from "../../features/profile/nickname-moderation";

const goalOptions = ["增益增肌", "轻盈减脂", "保持状态", "健康饮食"];
const goalTypeByLabel: Record<string, "muscle_gain" | "fat_loss" | "maintain" | "performance"> = {
  增益增肌: "muscle_gain",
  轻盈减脂: "fat_loss",
  保持状态: "maintain",
  健康饮食: "performance",
};

/** Achievement refresh is non-critical; it must not delay the save result. */
async function refreshAchievementsInBackground() {
  try {
    const { evaluateProductAchievements } = await import("../../features/coach/refresh-achievements");
    await evaluateProductAchievements();
  } catch (error) {
    // Never roll back a saved profile if the optional celebration refresh fails.
    console.warn("[achievements] profile edit evaluation failed", error);
  }
}

export default function ProfileEditPage() {
  const profile = useProfileStore();
  const feedback = useFeedbackStore();
  const [nickname, setNickname] = useState(profile.profile.nickname);
  const [weight, setWeight] = useState(String(profile.profile.weight));
  const [goalLabel, setGoalLabel] = useState(profile.profile.goalLabel);
  const [pendingGoalLabel, setPendingGoalLabel] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRandomizingAvatar, setIsRandomizingAvatar] = useState(false);

  const requestGoalChange = (nextGoalLabel: string) => {
    if (nextGoalLabel === goalLabel || isSaving) return;
    setPendingGoalLabel(nextGoalLabel);
  };

  const confirmGoalChange = () => {
    if (pendingGoalLabel) setGoalLabel(pendingGoalLabel);
    setPendingGoalLabel(null);
  };

  const onChooseAvatar = async (event: { detail?: { avatarUrl?: string } }) => {
    if (isUploadingAvatar || isSaving || isRandomizingAvatar) return;
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

  const onRandomizeAvatar = async () => {
    if (isUploadingAvatar || isSaving || isRandomizingAvatar) return;
    try {
      setIsRandomizingAvatar(true);
      const updated = await randomizeDefaultAvatar(profile.profile.avatarUrl);
      profile.setProfile({ avatarUrl: updated.avatarUrl });
      feedback.show({ message: "已换一张默认头像", tone: "success" });
    } catch (error) {
      feedback.show({
        message: error instanceof Error ? error.message : "随机头像失败，请稍后重试",
        tone: "error",
      });
    } finally {
      setIsRandomizingAvatar(false);
    }
  };

  const save = async () => {
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      feedback.show({ message: "请输入昵称", tone: "error" });
      return;
    }
    const nicknameError = nicknameModerationError(nextNickname);
    if (nicknameError) {
      feedback.show({ message: nicknameError, tone: "error" });
      return;
    }
    const nextWeight = Number(weight);
    if (!Number.isFinite(nextWeight) || nextWeight < 30 || nextWeight > 300) {
      feedback.show({ message: "请输入 30–300 kg 的体重", tone: "error" });
      return;
    }
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
      const nextGoalType = goalTypeByLabel[goalLabel] ?? "muscle_gain";
      const settings = account.settings;
      const preview = await previewProductNutritionPlan({
        age: account.age,
        sex: account.sex,
        heightCm: account.heightCm,
        weightKg: nextWeight,
        activityLevel: account.activityLevel,
        trainingDays: account.trainingDays,
        goalType: nextGoalType,
        dietaryPattern: settings?.dietaryPattern ?? "none",
        foodAvoidances: settings?.foodAvoidances ?? [],
        mealsPerDay: settings?.mealsPerDay ?? 3,
      });
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
        goalType: nextGoalType,
        targetWeightKg: account.targetWeightKg,
        targetCaloriesKcal: preview.calories,
        targetDate: null,
      });
      await saveProductNutritionPlan(preview);
      const savedNickname = saved.nickname || nextNickname;
      profile.setProfile({
        nickname: savedNickname,
        weight: nextWeight,
        goalLabel,
        targetCalories: preview.calories,
      });
      const goalChanged = goalLabel !== profile.profile.goalLabel;
      feedback.showModal({
        variant: "success",
        title: goalChanged ? "目标方向已更新" : "资料已保存",
        description: goalChanged ? "营养目标已重新生成。" : "营养目标已同步更新。",
        primaryText: "返回个人中心",
        dismissible: true,
        onPrimary: () => navigateBackOrHome("/pages/profile/index"),
        onClose: () => navigateBackOrHome("/pages/profile/index"),
      });
      void refreshAchievementsInBackground();
    } catch (error) {
      feedback.showModal({
        variant: "error",
        title: "资料保存失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
        primaryText: "知道了",
        dismissible: true,
      });
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
      disablePageEnterAnimation
      className="page-layout--profile-edit"
    >
      <View className="profile-flow">
        <View className="profile-edit__avatar-block">
          <Button
            className={`profile-edit__avatar${isDefaultAvatarSentinel(profile.profile.avatarUrl) || !profile.profile.avatarUrl ? " profile-edit__avatar--bundled" : ""}`}
            openType="chooseAvatar"
            onChooseAvatar={(event) => void onChooseAvatar(event)}
          >
            {resolveAvatarUrl(profile.profile.avatarUrl) ? (
              <Image
                className={
                  isDefaultAvatarSentinel(profile.profile.avatarUrl) || !profile.profile.avatarUrl
                    ? "profile-edit__avatar-image profile-edit__avatar-image--zoom"
                    : "profile-edit__avatar-image"
                }
                src={resolveAvatarUrl(profile.profile.avatarUrl)!}
                mode="aspectFill"
              />
            ) : (
              <Text>{profile.profile.nickname.slice(0, 1).toUpperCase()}</Text>
            )}
            <View className="profile-edit__avatar-action">
              <Text>{isUploadingAvatar ? "上传中" : "更换头像"}</Text>
            </View>
          </Button>
          <View
            className={`profile-edit__randomize ${isRandomizingAvatar ? "profile-edit__randomize--busy" : ""}`}
            onClick={() => void onRandomizeAvatar()}
          >
            <NordicIcon name="refresh-cw" size={18} ariaLabel="随机头像" />
            <Text>{isRandomizingAvatar ? "更换中…" : "随机换一张"}</Text>
          </View>
        </View>
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
             <View className="profile-choice-group profile-choice-group--single-line">
              {goalOptions.map((option) => (
                <View
                  className={`profile-choice ${goalLabel === option ? "profile-choice--active" : ""}`}
                  key={option}
                  onClick={() => requestGoalChange(option)}
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
      <ConfirmDialog
        open={Boolean(pendingGoalLabel)}
        title="确认更新目标方向？"
        description={`将切换为“${pendingGoalLabel ?? ""}”，并重新生成每日热量和营养目标。已记录的饮食数据不会改变。`}
        confirmLabel="确认更新"
        onConfirm={confirmGoalChange}
        onCancel={() => setPendingGoalLabel(null)}
      />
    </PageLayout>
  );
}
