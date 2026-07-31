import { Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  getProductAccount,
  saveProductBodyProfile,
  saveProductProfile,
} from "../../api/product-data-api";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { BottomActionLayout } from "../../components/bottom-action-layout";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { OnboardingHeader } from "../../components/onboarding-header";
import {
  type ActivityLevel,
  type Gender,
  getLocalDateString,
  normalizeAgeInput,
  normalizeOneDecimalInput,
  validateBodyProfile,
} from "../../features/onboarding/domain";
import {
  draftPatchFromAccount,
  isSettingsEditMode,
  settingsQuery,
  shouldHydrateFromAccount,
} from "../../features/onboarding/hydrate-draft-from-account";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";
import { useOnboardingDraftStore } from "../../stores/onboarding-draft-store";
import { useProfileStore } from "../../stores/profile-store";
import { generateNickname } from "../../features/profile/nickname-generator";
import { nicknameModerationError } from "../../features/profile/nickname-moderation";

const today = getLocalDateString();
const PLACEHOLDER_NICKNAMES = new Set(["", "Lewis", "微信用户"]);

function isPlaceholderNickname(value: string | null | undefined) {
  return !value || !value.trim() || PLACEHOLDER_NICKNAMES.has(value.trim());
}

async function syncNicknameEverywhere(nickname: string) {
  const trimmed = nickname.trim();
  if (!trimmed) return;
  if (nicknameModerationError(trimmed)) return;
  useProfileStore.getState().setProfile({ nickname: trimmed });
  try {
    await saveProductProfile({ nickname: trimmed });
  } catch {
    // Non-fatal: local profile store already updated for home/profile display.
  }
}
const activityOptions: Array<{
  value: ActivityLevel;
  title: string;
  description: string;
  trainingDays: string;
  icon: NordicIconName;
}> = [
  {
    value: "sedentary",
    title: "低活动",
    description: "久坐为主，日常活动较少。",
    trainingDays: "0",
    icon: "activity-low",
  },
  {
    value: "light",
    title: "轻度活动",
    description: "有少量日常活动或偶尔训练。",
    trainingDays: "2",
    icon: "activity-light",
  },
  {
    value: "moderate",
    title: "中等活动",
    description: "有一定日常活动或每周规律训练。",
    trainingDays: "4",
    icon: "activity-moderate",
  },
  {
    value: "high",
    title: "高活动",
    description: "日常活动较多或训练频率较高。",
    trainingDays: "6",
    icon: "activity-high",
  },
];

function FormError({ message }: { message?: string }) {
  return message ? <Text className="form-field__error">{message}</Text> : null;
}

export default function BodyProfilePage() {
  const router = useRouter();
  const fromSettings = isSettingsEditMode(router.params);
  const hydrateFromAccount = shouldHydrateFromAccount(router.params);
  const { draft, errors, setField, setDraft, setErrors } = useOnboardingDraftStore();
  const feedback = useFeedbackStore();
  const [isSaving, setIsSaving] = useState(false);
  const validation = validateBodyProfile(draft, today);
  const validate = () => setErrors(validation.errors);

  useEffect(() => {
    if (!hydrateFromAccount) return;
    let cancelled = false;
    void getProductAccount()
      .then((account) => {
        if (!cancelled) setDraft(draftPatchFromAccount(account));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hydrateFromAccount, setDraft]);

  // Keep onboarding nickname, home greeting, and profile page on the same value.
  useEffect(() => {
    if (fromSettings) return;

    const accountNickname = useProfileStore.getState().profile.nickname;
    const draftNickname = draft.nickname?.trim() ?? "";

    if (!isPlaceholderNickname(draftNickname)) {
      if (draftNickname !== accountNickname) {
        void syncNicknameEverywhere(draftNickname);
      }
      return;
    }

    if (!isPlaceholderNickname(accountNickname)) {
      setField("nickname", accountNickname);
      return;
    }

    const generated = generateNickname();
    setField("nickname", generated);
    void syncNicknameEverywhere(generated);
    // Only seed / sync on mount for onboarding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSettings]);

  const refreshNickname = () => {
    const next = generateNickname(draft.nickname);
    setField("nickname", next);
    void syncNicknameEverywhere(next);
  };

  const leaveSettings = () => {
    void Taro.switchTab({ url: "/pages/profile/index" });
  };

  const continueToDietPreferences = async () => {
    validate();
    if (!validation.valid || !validation.profile) return;
    setIsSaving(true);
    try {
      await syncNicknameEverywhere(validation.profile.nickname);
      await saveProductBodyProfile({
        age: validation.profile.age,
        birthDate: null,
        sex: validation.profile.gender,
        heightCm: validation.profile.heightCm,
        weightKg: validation.profile.weightKg,
        activityLevel: validation.profile.activityLevel,
        trainingDays: validation.profile.trainingDays,
      });
      useProfileStore.getState().setProfile({ weight: validation.profile.weightKg });
      await Taro.navigateTo({
        url: "/pages/diet-preferences/index" + settingsQuery(fromSettings),
      });
    } catch {
      feedback.show({ message: "身体资料保存失败，请稍后重试", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title="身体资料"
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--onboarding"
    >
      <View className="body-profile-page">
        <OnboardingHeader
          brand="Nordic Nutri AI"
          step={fromSettings ? "调整资料" : "第 2 步，共 4 步"}
          progress={fromSettings ? 1 / 3 : 0.5}
          progressAriaLabel={fromSettings ? "调整身体资料" : "当前为第 2 步，共 4 步"}
          backAriaLabel={fromSettings ? "返回个人中心" : "返回目标选择"}
          onBack={() =>
            fromSettings ? leaveSettings() : navigateBackOrHome("/pages/onboarding/index")
          }
        />
        <View className="onboarding-heading body-profile__heading">
          <Text className="onboarding-heading__title">
            {fromSettings ? "更新你的身体情况" : "告诉我们你的身体情况"}
          </Text>
          <Text className="onboarding-heading__copy">
            {fromSettings
              ? "修改后可继续调整饮食偏好，并重新生成营养目标。"
              : "这些信息将帮助 AI 为你制定更合适的营养计划。"}
          </Text>
        </View>

        <View className="body-profile__content">
          <AppCard className="body-profile__foundation-card">
            <View className="body-profile__foundation-heading">
              <View className="body-profile__foundation-icon-ground">
                <NordicIcon name="user-round" size={20} ariaLabel="基础信息" />
              </View>
              <Text className="body-profile__foundation-title">基础信息与生活方式</Text>
            </View>

            <View className="profile-form">
              <View className="profile-form__field">
                <Text>昵称</Text>
                <View className="profile-form__input-row profile-form__input-row--with-action">
                  <Input
                    className="profile-form__input--with-action"
                    value={draft.nickname}
                    maxlength={16}
                    placeholder="输入你的昵称"
                    onInput={(event) => setField("nickname", event.detail.value)}
                    onBlur={(event) => {
                      const next = event.detail.value?.trim() || draft.nickname;
                      setField("nickname", next);
                      validate();
                      void syncNicknameEverywhere(next);
                    }}
                  />
                  <View
                    className="profile-form__input-action"
                    onClick={refreshNickname}
                    ariaLabel="换一个昵称"
                  >
                    <NordicIcon name="refresh-cw" size={18} ariaLabel="换一个昵称" />
                  </View>
                </View>
                <FormError message={errors.nickname} />
              </View>
            </View>

            <View className="body-profile__metrics body-profile__metrics--three-up">
              <View className="body-profile__metric-card">
                <Text className="body-profile__metric-label">年龄</Text>
                <View className="body-profile__metric-icon-ground">
                  <NordicIcon name="calendar-days" size={18} ariaLabel="年龄" />
                </View>
                <View className="body-profile__metric-input-row">
                  <Input
                    className="body-profile__metric-input"
                    type="number"
                    value={draft.age}
                    placeholder="28"
                    adjustPosition
                    onInput={(event) => setField("age", normalizeAgeInput(event.detail.value))}
                    onBlur={validate}
                  />
                  <Text className="body-profile__metric-unit">岁</Text>
                </View>
                <FormError message={errors.age} />
              </View>
              <View className="body-profile__metric-card">
                <Text className="body-profile__metric-label">身高</Text>
                <View className="body-profile__metric-icon-ground">
                  <NordicIcon name="ruler" size={18} ariaLabel="身高" />
                </View>
                <View className="body-profile__metric-input-row">
                  <Input
                    className="body-profile__metric-input"
                    type="digit"
                    value={draft.heightCm}
                    placeholder="175"
                    adjustPosition
                    onInput={(event) =>
                      setField("heightCm", normalizeOneDecimalInput(event.detail.value))
                    }
                    onBlur={validate}
                  />
                  <Text className="body-profile__metric-unit">cm</Text>
                </View>
                <FormError message={errors.heightCm} />
              </View>
              <View className="body-profile__metric-card">
                <Text className="body-profile__metric-label">体重</Text>
                <View className="body-profile__metric-icon-ground">
                  <NordicIcon name="weight" size={18} ariaLabel="体重" />
                </View>
                <View className="body-profile__metric-input-row">
                  <Input
                    className="body-profile__metric-input"
                    type="digit"
                    value={draft.weightKg}
                    placeholder="72"
                    adjustPosition
                    onInput={(event) =>
                      setField("weightKg", normalizeOneDecimalInput(event.detail.value))
                    }
                    onBlur={validate}
                  />
                  <Text className="body-profile__metric-unit">kg</Text>
                </View>
                <FormError message={errors.weightKg} />
              </View>
            </View>

            <View className="body-profile__foundation-gender">
              <Text className="body-profile__section-label">生理性别</Text>
              <View className="body-profile__segmented-control">
                {(
                  [
                    ["male", "男"],
                    ["female", "女"],
                  ] as Array<[Gender, string]>
                ).map(([value, label]) => (
                  <View
                    key={value}
                    className={`body-profile__segment ${draft.gender === value ? "body-profile__segment--active" : ""}`}
                    onClick={() => setField("gender", value)}
                  >
                    <NordicIcon
                      name={value === "male" ? "mars" : "venus"}
                      size={18}
                      ariaLabel={label}
                    />
                    <Text>{label}</Text>
                  </View>
                ))}
              </View>
              <FormError message={errors.gender} />
            </View>
          </AppCard>

          <View className="body-profile__section">
            <Text className="body-profile__section-label">日常活动量</Text>
            <View className="body-profile__activity-list">
              {activityOptions.map((option) => (
                <View
                  key={option.value}
                  className={`body-profile__activity-card ${draft.activityLevel === option.value ? "body-profile__activity-card--active" : ""}`}
                  onClick={() =>
                    setDraft({ activityLevel: option.value, trainingDays: option.trainingDays })
                  }
                >
                  <View className="body-profile__activity-icon-ground">
                    <NordicIcon name={option.icon} ariaLabel={option.title} />
                  </View>
                  <View className="body-profile__activity-copy">
                    <Text className="body-profile__activity-title">{option.title}</Text>
                    <Text className="body-profile__activity-description">{option.description}</Text>
                  </View>
                  <View className="body-profile__activity-indicator">
                    {draft.activityLevel === option.value ? (
                      <NordicIcon name="check-inverse" size={15} ariaLabel="已选择" />
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
            <FormError message={errors.activityLevel ?? errors.trainingDays} />
          </View>
        </View>

        <BottomActionLayout>
          <AppButton
            size="large"
            disabled={!validation.valid}
            loading={isSaving}
            onClick={() => void continueToDietPreferences()}
          >
            继续
          </AppButton>
        </BottomActionLayout>
      </View>
    </PageLayout>
  );
}
