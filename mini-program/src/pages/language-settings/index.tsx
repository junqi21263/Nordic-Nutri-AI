import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppButton } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import { useAuthStore } from "../../auth/auth-store";
import { syncSmartReminderSchedule } from "../../api/push-api";
import { refreshAndroidSmartReminders } from "../../features/smart-reminders/coordinator";
import { smartReminderStorage } from "../../features/smart-reminders/storage";
import {
  getLocale,
  getLanguagePreference,
  getSystemLocale,
  setLanguagePreference,
} from "../../i18n";
import type { AppLocale, LanguagePreference } from "../../i18n/locale";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useSystemLayout } from "../../hooks/useSystemLayout";
import { PageLayout } from "../../layouts/page-layout";
import "./index.scss";

const localeNameKeys: Record<AppLocale, string> = {
  "zh-CN": "zhCN",
  "zh-TW": "zhTW",
  en: "en",
};

export default function LanguageSettingsPage() {
  const { t } = useTranslation();
  const layout = useSystemLayout();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const showFeedback = useFeedbackStore((state) => state.show);
  const [preference, setPreference] = useState<LanguagePreference>(getLanguagePreference);
  const [isApplying, setIsApplying] = useState(false);
  const systemLanguage = t(`languageSettings.localeNames.${localeNameKeys[getSystemLocale()]}`);

  useDidShow(() => setPreference(getLanguagePreference()));

  const apply = async () => {
    if (isApplying) return;
    setIsApplying(true);
    try {
      if (preference !== getLanguagePreference()) {
        await setLanguagePreference(preference);
        void refreshAndroidSmartReminders();
        if (userId) {
          void syncSmartReminderSchedule(smartReminderStorage.load(userId), getLocale()).catch(
            () => {
              showFeedback({
                message: t("smartReminders.scheduleSyncFailed"),
                tone: "error",
                presentation: "status",
              });
            },
          );
        }
      }
      await Taro.navigateBack();
    } catch {
      setIsApplying(false);
      showFeedback({
        message: t("languageSettings.applyFailed"),
        tone: "error",
        presentation: "status",
      });
    }
  };

  const choices: Array<{ key: LanguagePreference; label: string; description?: string }> = [
    {
      key: "system",
      label: t("settings.followSystem"),
      description: t("languageSettings.systemDescription", { language: systemLanguage }),
    },
    { key: "zh-CN", label: t("languageSettings.localeNames.zhCN") },
    { key: "zh-TW", label: t("languageSettings.localeNames.zhTW") },
    { key: "en", label: t("languageSettings.localeNames.en") },
  ];

  return (
    <PageLayout
      className="page-layout--language-settings"
      title="Nordic Nutri AI"
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
    >
      <View className="language-settings__screen">
        <View
          className="language-settings__header"
          style={{
            height: `${layout.statusBarHeight + 52}px`,
            paddingTop: `${layout.statusBarHeight}px`,
          }}
        >
          <Button
            className="language-settings__icon-button"
            ariaLabel={t("languageSettings.back")}
            onClick={() => {
              void Taro.navigateBack();
            }}
          >
            <NordicIcon name="back" size={20} ariaLabel={t("languageSettings.back")} />
          </Button>
          <Text className="language-settings__brand">Nordic Nutri AI</Text>
          <Button
            className="language-settings__icon-button"
            ariaLabel={t("languageSettings.reset")}
            onClick={() => setPreference("system")}
          >
            <NordicIcon name="refresh-cw" size={18} ariaLabel={t("languageSettings.reset")} />
          </Button>
        </View>

        <View className="language-settings__content">
          <View className="language-settings__intro">
            <Text className="language-settings__title">{t("languageSettings.introTitle")}</Text>
            <Text className="language-settings__subtitle">{t("languageSettings.introBody")}</Text>
          </View>

          <View
            className="language-settings__options"
            role="radiogroup"
            ariaLabel={t("languageSettings.availableLanguages")}
          >
            {choices.map(({ key, label, description }) => {
              const selected = preference === key;
              return (
                <Button
                  key={key}
                  className={`language-settings__option${selected ? " language-settings__option--selected" : ""}`}
                  ariaLabel={`${label}${selected ? `, ${t("languageSettings.selected")}` : ""}`}
                  onClick={() => setPreference(key)}
                >
                  <View className="language-settings__option-copy">
                    <Text className="language-settings__option-label">{label}</Text>
                    {description ? (
                      <Text className="language-settings__option-description">{description}</Text>
                    ) : null}
                  </View>
                  <View
                    className={`language-settings__radio${selected ? " language-settings__radio--selected" : ""}`}
                  >
                    {selected ? (
                      <NordicIcon
                        name="check"
                        size={15}
                        ariaLabel={t("languageSettings.selected")}
                      />
                    ) : null}
                  </View>
                </Button>
              );
            })}
          </View>

          <View className="language-settings__note">
            <View className="language-settings__note-icon">
              <NordicIcon name="info" size={18} ariaLabel={t("languageSettings.infoTitle")} />
            </View>
            <View className="language-settings__note-copy">
              <Text className="language-settings__note-title">
                {t("languageSettings.infoTitle")}
              </Text>
              <Text className="language-settings__note-body">{t("languageSettings.info")}</Text>
            </View>
          </View>
        </View>

        <View className="language-settings__footer">
          <AppButton loading={isApplying} onClick={apply}>
            {t("languageSettings.apply")}
          </AppButton>
          <Text className="language-settings__footer-note">{t("languageSettings.footer")}</Text>
        </View>
      </View>
    </PageLayout>
  );
}
