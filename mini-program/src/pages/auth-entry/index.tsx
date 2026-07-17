import { Text } from "@tarojs/components";
import { useState } from "react";
import { loginWithWechat } from "../../api/auth-api";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { BottomSheet } from "../../components/bottom-sheet";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";

export default function AuthEntryPage() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const feedback = useFeedbackStore();

  const login = async () => {
    setIsLoggingIn(true);
    try {
      const user = await loginWithWechat();
      if (!user) throw new Error("微信登录未返回用户信息");
      await startApplicationAuth();
    } catch {
      feedback.show({ message: "登录未完成，请稍后重试", tone: "error" });
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <PageLayout title="Nordic Nutri AI" showTabs={false} hideNavigation className="page-layout--auth-entry">
      <BottomSheet open className="auth-entry-sheet">
        <AppCard className="auth-entry-page__card">
          <Text className="auth-entry-page__eyebrow">NORDIC NUTRI AI</Text>
          <Text className="auth-entry-page__card-title">继续你的营养节奏</Text>
          <Text className="auth-entry-page__card-copy">登录后即可安全保存餐次、身体数据和目标设置。</Text>
          <AppButton size="large" loading={isLoggingIn} onClick={login}>登录并开始使用</AppButton>
        </AppCard>
      </BottomSheet>
    </PageLayout>
  );
}
