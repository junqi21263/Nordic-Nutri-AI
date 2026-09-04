import { Image, Text, View } from "@tarojs/components";
import Taro, { useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { useState } from "react";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { clearInvalidSession } from "../../auth/session-manager";
import { markWelcomeSeen } from "../../features/welcome/welcome-seen";
import { WELCOME_HERO_IMAGE } from "../../features/share/brand-cdn";
import { buildAppShareMessage, buildAppTimelineShare } from "../../features/share/app-share";
import { useAppShare } from "../../hooks/use-app-share";

const EXIT_MS = 420;

function isStillOnWelcome() {
  const pages = Taro.getCurrentPages();
  const route = pages[pages.length - 1]?.route || "";
  return route.includes("pages/welcome/index");
}

export default function WelcomePage() {
  useShareAppMessage(() => buildAppShareMessage());
  useShareTimeline(() => buildAppTimelineShare());
  useAppShare();
  const [exiting, setExiting] = useState(false);
  const [busy, setBusy] = useState(false);

  const continueJourney = async () => {
    if (busy) return;
    setBusy(true);
    setExiting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, EXIT_MS));
      // Drop any persisted JWT whose app_users row is gone before silent login.
      await clearInvalidSession();
      markWelcomeSeen();
      await startApplicationAuth({ force: true, allowSilentLogin: true });
    } finally {
      setBusy(false);
      // Auth may fail and leave us on welcome (openWelcome is a no-op if already here).
      if (isStillOnWelcome()) setExiting(false);
    }
  };

  return (
    <View className={`welcome-page ${exiting ? "welcome-page--exiting" : ""}`}>
      <Image className="welcome-page__hero" src={WELCOME_HERO_IMAGE} mode="aspectFill" />
      <View className="welcome-page__veil" />
      <View className="welcome-page__safe" />
      <View className="welcome-page__body">
        <View className="welcome-page__copy">
          <Text className="welcome-page__brand">Nordic Nutri</Text>
          <Text className="welcome-page__title">拍一餐，营养心中有数</Text>
          <Text className="welcome-page__subtitle">
            读懂餐盘里的食材与热量，{"\n"}陪你慢慢养成好习惯
          </Text>
        </View>
        <View className="welcome-page__actions">
          <View
            className={`welcome-page__cta ${busy ? "welcome-page__cta--busy" : ""}`}
            onClick={() => void continueJourney()}
          >
            <Text className="welcome-page__cta-label">开启健康之旅</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
