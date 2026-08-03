import { Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { loginWithWechat } from "../../api/auth-api";
import { saveProductProfile } from "../../api/product-data-api";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { BottomSheet } from "../../components/bottom-sheet";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";

/**
 * Persist a real WeChat nickname when available.
 * Never sync avatar from silent getUserInfo — modern WeChat often returns the grey
 * placeholder silhouette, which would overwrite bootstrap `default:robot-N`.
 * Users change avatars explicitly via chooseAvatar on the profile-edit page.
 */
async function syncWechatNickname(nickname: string | null): Promise<string | null> {
  const trimmed = typeof nickname === "string" ? nickname.trim() : "";
  if (!trimmed || trimmed === "微信用户") return null;
  try {
    const saved = await saveProductProfile({ nickname: trimmed });
    return saved.nickname;
  } catch {
    return trimmed;
  }
}

export default function AuthEntryPage() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const feedback = useFeedbackStore();

  const login = async () => {
    setIsLoggingIn(true);
    try {
      const user = await loginWithWechat();
      if (!user) throw new Error("微信登录未返回用户信息");
      let syncedNickname: string | null = null;
      try {
        const result = await Taro.getUserInfo({ withCredentials: false });
        const nickName =
          typeof result?.userInfo?.nickName === "string" ? result.userInfo.nickName : null;
        syncedNickname = await syncWechatNickname(nickName);
      } catch {
        // Non-fatal: defaults from bootstrap remain.
      }
      // Force a fresh launch so we do not join a pre-login in-flight route to Home.
      await startApplicationAuth({ force: true });
      if (syncedNickname) {
        useProfileStore.getState().setProfile({ nickname: syncedNickname });
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
      showBrandHeader={false}
      className="page-layout--auth-entry"
    >
      <BottomSheet open className="auth-entry-sheet">
        <AppCard className="auth-entry-page__card">
          <Text className="auth-entry-page__eyebrow">NORDIC NUTRI AI</Text>
          <Text className="auth-entry-page__card-title">继续你的营养节奏</Text>
          <Text className="auth-entry-page__card-copy">
            一键登录即可开始记录餐次，默认头像与昵称会自动生成，可在「我的」中随时更换。
          </Text>
          <AppButton size="large" loading={isLoggingIn} onClick={login}>
            微信一键登录
          </AppButton>
          <Text className="auth-entry-page__privacy-note">
            登录即同意微信授权，昵称和头像可在「我的」中随时修改。
          </Text>
        </AppCard>
      </BottomSheet>
    </PageLayout>
  );
}
