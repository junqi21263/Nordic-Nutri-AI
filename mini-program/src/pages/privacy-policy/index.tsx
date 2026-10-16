import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../layouts/page-layout";
import { navigateBackOrHome } from "../../utils/navigation";

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();
  const sections = t("privacyPolicy.sections", { returnObjects: true }) as Array<{ title: string; content: string }>;
  return (
    <PageLayout
      title={t("privacyPolicy.title")}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => navigateBackOrHome("/pages/profile/index")}
      className="page-layout--privacy-policy"
    >
      <View className="privacy-policy-page">
        <Text className="privacy-policy-page__title">{t("privacyPolicy.title")}</Text>
        <Text className="privacy-policy-page__lead">{t("privacyPolicy.lead")}</Text>
        <Text className="privacy-policy-page__contact">{t("privacyPolicy.contact")}</Text>

        {sections.map((section, index) => (
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
