import { Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
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
import { queueOnboardingDraftSync } from "../../features/onboarding/onboarding-draft-cloud-sync";

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
  trainingDays: string;
  icon: NordicIconName;
}> = [
  {
    value: "sedentary",
    trainingDays: "0",
    icon: "activity-low",
  },
  {
    value: "light",
    trainingDays: "2",
    icon: "activity-light",
  },
  {
    value: "moderate",
    trainingDays: "4",
    icon: "activity-moderate",
  },
  {
    value: "high",
    trainingDays: "6",
    icon: "activity-high",
  },
  {
    value: "very_high",
    trainingDays: "7",
    icon: "activity-high",
  },
];

function FormError({ message }: { message?: string }) {
  const translated = Object.entries({
    "请输入昵称": "nickname", "年龄需在 14–80 岁之间": "age", "请选择性别": "gender",
    "身高需在 120–230 cm 之间": "heightCm", "体重需在 30–300 kg 之间": "weightKg",
    "请选择日常活动量": "activityLevel", "训练频率需在 0–7 天之间": "trainingDays",
  }).find(([source]) => source === message)?.[1];
  return message ? <Text className="form-field__error">{translated ? t(`bodyProfile.errors.${translated}`) : message}</Text> : null;
}

export default function BodyProfilePage() {
  useTranslation();
  const router = useRouter();
  const fromSettings = isSettingsEditMode(router.params);
  const hydrateFromAccount = shouldHydrateFromAccount(router.params);
  const { draft, errors, setField, setDraft, setErrors } = useOnboardingDraftStore();
  const feedback = useFeedbackStore();
  const [isSaving, setIsSaving] = useState(false);
  const validation = validateBodyProfile(draft, today);
  const validate = () => setErrors(validation.errors);

  useEffect(() => {
    if (!fromSettings) queueOnboardingDraftSync(draft);
  }, [draft, fromSettings]);

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
      feedback.showModal({
        variant: "error",
        title: t("bodyProfile.saveFailed"),
        description: t("bodyProfile.retryLater"),
        primaryText: t("bodyProfile.okay"),
        dismissible: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      title={t("bodyProfile.title")}
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--onboarding"
    >
      <View className="body-profile-page">
        <View className="onboarding-sticky-header">
          <OnboardingHeader
            brand="Nordic Nutri AI"
            step={t(fromSettings ? "bodyProfile.editStep" : "bodyProfile.step")}
            progress={fromSettings ? 1 / 3 : 0.5}
            progressAriaLabel={t(fromSettings ? "bodyProfile.editProgress" : "bodyProfile.progress")}
            backAriaLabel={t(fromSettings ? "bodyProfile.backProfile" : "bodyProfile.backGoal")}
            onBack={() =>
              fromSettings ? leaveSettings() : navigateBackOrHome("/pages/onboarding/index")
            }
          />
        </View>
        <View className="onboarding-heading body-profile__heading">
          <Text className="onboarding-heading__title">
            {t(fromSettings ? "bodyProfile.editTitle" : "bodyProfile.newTitle")}
          </Text>
          <Text className="onboarding-heading__copy">
            {fromSettings
              ? t("bodyProfile.editCopy")
              : t("bodyProfile.newCopy")}
          </Text>
        </View>

        <View className="body-profile__content">
          <AppCard className="body-profile__foundation-card">
            <View className="body-profile__foundation-heading">
              <View className="body-profile__foundation-icon-ground">
                <NordicIcon name="user-round" size={20} ariaLabel={t("bodyProfile.foundation")} />
              </View>
              <Text className="body-profile__foundation-title">{t("bodyProfile.foundation")}</Text>
            </View>

            <View className="profile-form">
              <View className="profile-form__field">
                <Text className="profile-form__label">{t("bodyProfile.nickname")}</Text>
                <View className="profile-form__input-row profile-form__input-row--with-action">
                  <Input
                    className="profile-form__input--with-action"
                    value={draft.nickname}
                    maxlength={16}
                    placeholder={t("bodyProfile.nicknamePlaceholder")}
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
                    ariaLabel={t("bodyProfile.randomNickname")}
                  >
                    <NordicIcon name="refresh-cw" size={18} ariaLabel={t("bodyProfile.randomNickname")} />
                  </View>
                </View>
                <FormError message={errors.nickname} />
              </View>
            </View>

            <View className="body-profile__metrics body-profile__metrics--three-up">
              <View className="body-profile__metric-card">
                <Text className="body-profile__metric-label">{t("bodyProfile.age")}</Text>
                <View className="body-profile__metric-icon-ground">
                  <NordicIcon name="calendar-days" size={18} ariaLabel={t("bodyProfile.age")} />
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
                  <Text className="body-profile__metric-unit">{t("bodyProfile.years")}</Text>
                </View>
                <FormError message={errors.age} />
              </View>
              <View className="body-profile__metric-card">
                <Text className="body-profile__metric-label">{t("bodyProfile.height")}</Text>
                <View className="body-profile__metric-icon-ground">
                  <NordicIcon name="ruler" size={18} ariaLabel={t("bodyProfile.height")} />
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
                <Text className="body-profile__metric-label">{t("bodyProfile.weight")}</Text>
                <View className="body-profile__metric-icon-ground">
                  <NordicIcon name="weight" size={18} ariaLabel={t("bodyProfile.weight")} />
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
              <Text className="body-profile__section-label">{t("bodyProfile.gender")}</Text>
              <View className="body-profile__segmented-control">
                {(
                  [
                    ["male", t("bodyProfile.male")],
                    ["female", t("bodyProfile.female")],
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
            <Text className="body-profile__section-label">{t("bodyProfile.activity")}</Text>
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
                    <NordicIcon name={option.icon} ariaLabel={t(`bodyProfile.activities.${option.value}.title`)} />
                  </View>
                  <View className="body-profile__activity-copy">
                    <Text className="body-profile__activity-title">{t(`bodyProfile.activities.${option.value}.title`)}</Text>
                    <Text className="body-profile__activity-description">{t(`bodyProfile.activities.${option.value}.description`)}</Text>
                  </View>
                  <View className="body-profile__activity-indicator">
                    {draft.activityLevel === option.value ? (
                      <NordicIcon name="check-inverse" size={15} ariaLabel={t("bodyProfile.selected")} />
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
            {t("bodyProfile.continue")}
          </AppButton>
        </BottomActionLayout>
      </View>
    </PageLayout>
  );
}
