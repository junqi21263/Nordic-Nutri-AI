import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../layouts/page-layout";
import { navigateBackOrHome } from "../../utils/navigation";

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();
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

        {[0, 1, 2, 3, 4, 5].map((index) => (
          <View key={index} className="privacy-policy-page__section">
            <Text className="privacy-policy-page__section-title">{t(`privacyPolicy.sections.${index}.title`)}</Text>
            <Text className="privacy-policy-page__section-content">{t(`privacyPolicy.sections.${index}.content`)}</Text>
          </View>
        ))}

        <View className="privacy-policy-page__section">
          <Text className="privacy-policy-page__section-title">{t("privacyPolicy.metadata")}</Text>
          <Text className="privacy-policy-page__section-content">
            {t("privacyPolicy.operator")}{ "\n" }
            {t("privacyPolicy.version")}{ "\n" }
            {t("privacyPolicy.effective")}
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
