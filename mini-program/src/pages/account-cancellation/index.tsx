import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { cancelProductAccount } from "../../api/product-data-api";
import { signOut } from "../../auth/session-manager";
import { AppButton } from "../../components/app-button";
import { clearProductLocalState } from "../../features/account-cancellation/clear-local-state";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";

export default function AccountCancellationPage() {
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
      feedback.show({ message: "账号已注销，相关数据已删除", tone: "success" });
      await Taro.reLaunch({ url: "/pages/auth-entry/index" });
    } catch (error) {
      feedback.show({
        message: error instanceof Error ? error.message : "账号注销失败，请稍后重试",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageLayout
      title="注销账号"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => navigateBackOrHome("/pages/profile/index")}
      className="page-layout--account-cancellation"
    >
      <View className="account-cancellation">
        <View className="account-cancellation__warning">
          <Text>注销后无法恢复</Text>
          <Text>将立即删除 Nordic Nutri AI 中的账号资料、身体与目标档案、饮食记录、识别图片及相关数据。</Text>
          <Text>此操作不会注销或影响你的微信账号。</Text>
        </View>

        <View className="account-cancellation__steps">
          <View className="account-cancellation__step">
            <Text>1</Text>
            <View><Text>确认删除范围</Text><Text>请确认你已了解数据将立即物理删除，无法找回。</Text></View>
          </View>
          <View className="account-cancellation__step">
            <Text>2</Text>
            <View><Text>再次确认后注销</Text><Text>第二次点击后即提交注销请求，不需要重复微信登录。</Text></View>
          </View>
        </View>

        <View className="account-cancellation__action">
          <AppButton
            variant={confirmed ? "primary" : "outline"}
            loading={isSubmitting}
            ariaLabel={confirmed ? "确认注销 Nordic Nutri AI 产品账号" : "继续注销 Nordic Nutri AI 产品账号"}
            onClick={() => void cancel()}
          >
            {confirmed ? "确认注销并删除数据" : "我已了解，继续"}
          </AppButton>
        </View>
      </View>
    </PageLayout>
  );
}
