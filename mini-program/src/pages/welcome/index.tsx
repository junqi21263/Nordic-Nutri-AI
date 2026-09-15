import { Image, Text, View } from "@tarojs/components";
import Taro, { useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { clearInvalidSession } from "../../auth/session-manager";
import { NordicIcon } from "../../components/nordic-icon";
import { markWelcomeSeen } from "../../features/welcome/welcome-seen";
import { WELCOME_HERO_IMAGE } from "../../features/share/brand-cdn";
import { buildAppShareMessage, buildAppTimelineShare } from "../../features/share/app-share";
import { useAppShare } from "../../hooks/use-app-share";
import { useAppTransitionStore } from "../../stores/app-transition-store";

const EXIT_MS = 420;
const isAndroidApp = process.env.TARO_APP_PLATFORM === "android";

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
  const [retryNeeded, setRetryNeeded] = useState(false);
  const showWelcomeTransition = useAppTransitionStore((state) => state.showWelcomeTransition);
  const hideWelcomeTransition = useAppTransitionStore((state) => state.hideWelcomeTransition);

  useEffect(() => {
    if (!isAndroidApp) return;
    const insets = (window as Window & {
      NordicWelcomeInsets?: { setVisible(visible: boolean): void };
    }).NordicWelcomeInsets;
    insets?.setVisible(true);
    const exitTimer = setTimeout(() => {
      showWelcomeTransition();
      setExiting(true);
    }, 3000);
    const navigationTimer = setTimeout(() => {
      markWelcomeSeen();
      void startApplicationAuth({ force: true, allowSilentLogin: false }).catch(() => {
        hideWelcomeTransition();
        setExiting(false);
        setRetryNeeded(true);
      });
    }, 3000 + EXIT_MS);
    return () => {
      insets?.setVisible(false);
      clearTimeout(exitTimer);
      clearTimeout(navigationTimer);
    };
  }, [hideWelcomeTransition, showWelcomeTransition]);

  const continueJourney = async () => {
    if (busy) return;
    if (isAndroidApp) {
      setBusy(true);
      showWelcomeTransition();
      try {
        markWelcomeSeen();
        await startApplicationAuth({ force: true, allowSilentLogin: false });
      } catch {
        hideWelcomeTransition();
        setRetryNeeded(true);
      } finally {
        setBusy(false);
      }
      return;
    }
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
    <View
      className={`welcome-page ${isAndroidApp ? "welcome-page--android" : ""} ${exiting ? "welcome-page--exiting" : ""}`}
    >
      {isAndroidApp ? (
        <View
          className="welcome-page__hero welcome-page__hero--android"
          style={{ backgroundImage: `url(${WELCOME_HERO_IMAGE})` }}
        />
      ) : (
        <Image className="welcome-page__hero" src={WELCOME_HERO_IMAGE} mode="aspectFill" />
      )}
      <View className="welcome-page__veil" />
      <View className="welcome-page__safe" />
      <View className="welcome-page__panel">
        <View className="welcome-page__body">
          <View className="welcome-page__copy">
            <View className="welcome-page__brand-lockup">
              <Text className="welcome-page__brand">Nordic Nutri</Text>
              <Text className="welcome-page__brand-caption">营养记录 · 从每一餐开始</Text>
            </View>
            <Text className="welcome-page__title">拍一餐，营养心中有数</Text>
            <Text className="welcome-page__subtitle">
              读懂餐盘里的食材与热量，{"\n"}陪你慢慢养成好习惯
            </Text>
          </View>
          <View className="welcome-page__actions" style={isAndroidApp && !retryNeeded ? { display: "none" } : undefined}>
            <View
              className={`welcome-page__cta ${busy ? "welcome-page__cta--busy" : ""}`}
              onClick={() => void continueJourney()}
            >
              <Text className="welcome-page__cta-label">{retryNeeded ? (busy ? "正在重试…" : "连接暂不可用，点击重试") : "开启健康之旅"}</Text>
              <NordicIcon name="chevron-right" size={18} ariaLabel="继续" />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
