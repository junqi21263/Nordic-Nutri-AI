import { Image, Text, View } from "@tarojs/components";
import { useState } from "react";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { markWelcomeSeen } from "../../features/welcome/welcome-seen";
import welcomeHero from "../../assets/images/welcome-hero.jpg";

const EXIT_MS = 420;

export default function WelcomePage() {
  const [exiting, setExiting] = useState(false);
  const [busy, setBusy] = useState(false);

  const continueJourney = async () => {
    if (busy) return;
    setBusy(true);
    setExiting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, EXIT_MS));
      markWelcomeSeen();
      // Routes: authenticated → onboarding/home; otherwise → login.
      await startApplicationAuth();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className={`welcome-page ${exiting ? "welcome-page--exiting" : ""}`}>
      <Image className="welcome-page__hero" src={welcomeHero} mode="aspectFill" />
      <View className="welcome-page__veil" />
      <View className="welcome-page__safe" />
      <View className="welcome-page__body">
        <View className="welcome-page__copy">
          <Text className="welcome-page__brand">Nordic Nutri</Text>
          <Text className="welcome-page__title">拍一餐，营养心中有数</Text>
          <Text className="welcome-page__subtitle">
            AI 读懂餐盘里的食材与热量，{"\n"}陪你慢慢养成好习惯
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
