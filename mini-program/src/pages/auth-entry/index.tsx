import { Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { loginWithWechat } from "../../api/auth-api";
import { saveProductProfile } from "../../api/product-data-api";
import { uploadProfileAvatar } from "../../api/profile-avatar-api";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { BottomSheet } from "../../components/bottom-sheet";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";

type WechatProfile = {
  nickname: string;
  avatarUrl: string | null;
};

async function requestWechatProfile(): Promise<WechatProfile | null> {
  try {
    const result = await Taro.getUserProfile({ desc: "用于同步你的微信昵称和头像到个人资料" });
    const nickname = result.userInfo?.nickName?.trim();
    if (!nickname) return null;
    return { nickname, avatarUrl: result.userInfo.avatarUrl || null };
  } catch {
    // Declining profile authorization never blocks the actual WeChat login.
    return null;
  }
}

async function syncWechatProfile(profile: WechatProfile | null): Promise<WechatProfile | null> {
  if (!profile) return null;
  const saved = await saveProductProfile({ nickname: profile.nickname });
  // Keep the just-authorized avatar in the local session even if the optional
  // CloudBase copy fails; a successful upload replaces it with a signed URL.
  let avatarUrl: string | null = profile.avatarUrl;
  if (!profile.avatarUrl) return { nickname: saved.nickname, avatarUrl };
  try {
    const downloaded = await Taro.downloadFile({ url: profile.avatarUrl });
    if (downloaded.statusCode === 200 && downloaded.tempFilePath) {
      avatarUrl = (await uploadProfileAvatar(downloaded.tempFilePath)).avatarUrl;
    }
  } catch {
    // A nickname update is still valuable if the remote avatar is unavailable.
  }
  return { nickname: saved.nickname, avatarUrl };
}

export default function AuthEntryPage() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const feedback = useFeedbackStore();

  const login = async () => {
    setIsLoggingIn(true);
    try {
      const wechatProfile = await requestWechatProfile();
      const user = await loginWithWechat();
      if (!user) throw new Error("微信登录未返回用户信息");
      const syncedProfile = await syncWechatProfile(wechatProfile).catch(() => null);
      await startApplicationAuth();
      if (syncedProfile) {
        useProfileStore.getState().setProfile({
          nickname: syncedProfile.nickname,
          avatarUrl: syncedProfile.avatarUrl,
        });
      }
    } catch (error) {
      feedback.show({
        message: error instanceof Error ? error.message : "登录未完成，请稍后重试",
        tone: "error",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <PageLayout
      title="Nordic Nutri AI"
      showTabs={false}
      hideNavigation
      className="page-layout--auth-entry"
    >
      <BottomSheet open className="auth-entry-sheet">
        <AppCard className="auth-entry-page__card">
          <Text className="auth-entry-page__eyebrow">NORDIC NUTRI AI</Text>
          <Text className="auth-entry-page__card-title">继续你的营养节奏</Text>
          <Text className="auth-entry-page__card-copy">
            登录后即可安全保存餐次、身体数据和目标设置。
          </Text>
          <AppButton size="large" loading={isLoggingIn} onClick={login}>
            登录并开始使用
          </AppButton>
        </AppCard>
      </BottomSheet>
    </PageLayout>
  );
}
