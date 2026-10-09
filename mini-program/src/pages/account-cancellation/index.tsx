import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cancelProductAccount } from "../../api/product-data-api";
import { signOut } from "../../auth/session-manager";
import { AppButton } from "../../components/app-button";
import { clearProductLocalState } from "../../features/account-cancellation/clear-local-state";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";

export default function AccountCancellationPage() {
  const { t } = useTranslation();
  const feedback = useFeedbackStore();
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cancel = async () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setIsSubmitting(true);
    try {
      await cancelProductAccount();
      clearProductLocalState();
      await signOut();
      feedback.show({ message: t("accountCancellation.success"), tone: "success" });
      await Taro.reLaunch({ url: "/pages/auth-entry/index" });
    } catch (error) {
      feedback.show({
        message: error instanceof Error ? error.message : t("accountCancellation.failed"),
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageLayout
      title={t("accountCancellation.title")}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => navigateBackOrHome("/pages/profile/index")}
      className="page-layout--account-cancellation"
    >
      <View className="account-cancellation">
        <View className="account-cancellation__warning">
          <Text>{t("accountCancellation.warning")}</Text>
          <Text>{t("accountCancellation.deleteScope")}</Text>
          <Text>{t("accountCancellation.wechat")}</Text>
        </View>

        <View className="account-cancellation__steps">
          <View className="account-cancellation__step">
            <Text>1</Text>
            <View><Text>{t("accountCancellation.stepOne")}</Text><Text>{t("accountCancellation.stepOneCopy")}</Text></View>
          </View>
          <View className="account-cancellation__step">
            <Text>2</Text>
            <View><Text>{t("accountCancellation.stepTwo")}</Text><Text>{t("accountCancellation.stepTwoCopy")}</Text></View>
          </View>
        </View>

        <View className="account-cancellation__action">
          <AppButton
            variant={confirmed ? "primary" : "outline"}
            loading={isSubmitting}
            ariaLabel={t(confirmed ? "accountCancellation.confirmAria" : "accountCancellation.continueAria")}
            onClick={() => void cancel()}
          >
            {t(confirmed ? "accountCancellation.confirm" : "accountCancellation.continue")}
          </AppButton>
        </View>
      </View>
    </PageLayout>
  );
}
