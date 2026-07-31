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
          <View className="welcome-page__rule" />
          <View className="welcome-page__headline">
            <Text className="welcome-page__kicker">拍一餐</Text>
            <Text className="welcome-page__title">看清今天吃得怎么样</Text>
          </View>
          <Text className="welcome-page__subtitle">
            AI 识别餐食与营养{"\n"}
            把节奏走轻一点，也能慢慢坚持
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
