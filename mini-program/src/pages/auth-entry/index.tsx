import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { loginWithWechat } from "../../api/auth-api";
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
      await Taro.switchTab({ url: "/pages/home/index" });
    } catch {
      feedback.show({ message: "登录未完成，请稍后重试", tone: "error" });
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <PageLayout title="Nordic Nutri AI" showTabs={false} hideNavigation className="page-layout--auth-entry">
      <View className="auth-entry-page">
        <View className="auth-entry-page__heading">
          <Text className="auth-entry-page__eyebrow">Nordic Nutri AI</Text>
          <Text className="auth-entry-page__title">继续你的营养节奏</Text>
          <Text className="auth-entry-page__copy">登录后即可安全保存餐次、身体数据和目标设置。</Text>
        </View>
        <Text className="auth-entry-page__copy">请登录以继续保存你的健康数据。</Text>
      </View>
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
