import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { NordicIcon } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import { navigateBackOrHome } from "../../utils/navigation";

export default function TermsOfServicePage() {
  const { t } = useTranslation();
  const sections = t("termsOfServicePage.sections", { returnObjects: true }) as Array<{ title: string; content: string }>;

  return (
    <PageLayout
      title={t("termsOfServicePage.title")}
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--privacy-policy"
    >
      <View className="privacy-policy-page">
        <View
          className="privacy-policy-page__back"
          ariaLabel="返回"
          onClick={() => navigateBackOrHome("/pages/android-auth/index")}
        >
          <NordicIcon name="back" size={24} ariaLabel="返回" />
        </View>
        <Text className="privacy-policy-page__title">{t("termsOfServicePage.title")}</Text>
        <Text className="privacy-policy-page__lead">{t("termsOfServicePage.lead")}</Text>
        <Text className="privacy-policy-page__contact">{t("termsOfServicePage.contact")}</Text>
        {sections.map((section) => (
          <View key={section.title} className="privacy-policy-page__section">
            <Text className="privacy-policy-page__section-title">{section.title}</Text>
            <Text className="privacy-policy-page__section-content">{section.content}</Text>
          </View>
        ))}
        <View className="privacy-policy-page__section">
          <Text className="privacy-policy-page__section-title">{t("termsOfServicePage.metadata")}</Text>
          <Text className="privacy-policy-page__section-content">
            {t("termsOfServicePage.operator")}{"\n"}
            {t("termsOfServicePage.version")}{"\n"}
            {t("termsOfServicePage.effective")}{"\n"}
            {t("termsOfServicePage.lastUpdated")}
          </Text>
        </View>
      </View>
    </PageLayout>
  );
}
