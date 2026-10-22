import { Switch, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../layouts/page-layout";
import { NordicIcon } from "../../components/nordic-icon";
import { navigateBackOrHome } from "../../utils/navigation";
import { getAnalyticsPreference, setAnalyticsPreference, subscribeAnalyticsPreference } from "../../features/analytics/runtime";
import "../privacy-data/index.scss";

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();
  const [preference, setPreference] = useState(getAnalyticsPreference);
  useEffect(() => subscribeAnalyticsPreference(() => setPreference(getAnalyticsPreference())), []);
  const sections = t("privacyPolicy.sections", { returnObjects: true }) as Array<{ title: string; content: string }>;
  return (
    <PageLayout
      title={t("privacyPolicy.title")}
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--privacy-policy"
    >
      <View className="privacy-policy-page">
        <View
          className="privacy-policy-page__back"
          ariaLabel="返回"
          onClick={() => navigateBackOrHome("/pages/profile/index")}
        >
          <NordicIcon name="back" size={24} ariaLabel="返回" />
        </View>
        <Text className="privacy-policy-page__title">{t("privacyPolicy.title")}</Text>
        <Text className="privacy-policy-page__lead">{t("privacyPolicy.lead")}</Text>
        <View className="analytics-privacy">
          <Text className="analytics-privacy__heading">{t("analyticsPrivacy.title")}</Text>
          <Text className="analytics-privacy__subtitle">{t("analyticsPrivacy.subtitle")}</Text>
          {(['analytics', 'diagnostics'] as const).map(key => (
            <View className="analytics-privacy__setting" key={key}>
              <View className="analytics-privacy__copy">
                <Text className="analytics-privacy__title">{t(`analyticsPrivacy.${key}`)}</Text>
                <Text className="analytics-privacy__description">{t(`analyticsPrivacy.${key}Description`)}</Text>
              </View>
              <Switch checked={preference[key]} color="#153f2b" ariaLabel={t(`analyticsPrivacy.${key}`)} onChange={event => setAnalyticsPreference({ ...preference, [key]: event.detail.value })} />
            </View>
          ))}
          <View className="analytics-privacy__notice">
            <Text>{t("analyticsPrivacy.collection")}</Text>
            <Text>{t("analyticsPrivacy.exclusions")}</Text>
            <Text>{t("analyticsPrivacy.retention")}</Text>
            <Text>{t("analyticsPrivacy.withdraw")}</Text>
          </View>
          <View className="analytics-privacy__link" onClick={() => void Taro.navigateTo({ url: "/pages/account-cancellation/index" })}><Text>{t("analyticsPrivacy.rights")} ›</Text></View>
        </View>
        <Text className="privacy-policy-page__contact">{t("privacyPolicy.contact")}</Text>

        {sections.map((section) => (
          <View key={section.title} className="privacy-policy-page__section">
            <Text className="privacy-policy-page__section-title">{section.title}</Text>
            <Text className="privacy-policy-page__section-content">{section.content}</Text>
          </View>
        ))}

        <View className="privacy-policy-page__section">
          <Text className="privacy-policy-page__section-title">{t("privacyPolicy.metadata")}</Text>
          <Text className="privacy-policy-page__section-content">
            {t("privacyPolicy.operator")}{ "\n" }
            {t("privacyPolicy.version")}{ "\n" }
            {t("privacyPolicy.effective")}{ "\n" }
            {t("privacyPolicy.lastUpdated")}
          </Text>
        </View>

        <View
          className="privacy-policy-page__cancellation"
          ariaLabel={t("privacyPolicy.cancelTitle")}
          onClick={() => void Taro.navigateTo({ url: "/pages/account-cancellation/index" })}
        >
          <View className="privacy-policy-page__cancellation-copy">
            <Text className="privacy-policy-page__cancellation-title">{t("privacyPolicy.cancelTitle")}</Text>
            <Text className="privacy-policy-page__cancellation-description">{t("privacyPolicy.cancelDescription")}</Text>
          </View>
          <Text className="privacy-policy-page__cancellation-chevron">›</Text>
        </View>
      </View>
    </PageLayout>
  );
}
