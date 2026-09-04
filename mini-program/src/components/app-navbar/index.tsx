import { Text, View } from "@tarojs/components";
import { useDeferredProgress } from "../../hooks/useAnimatedProgress";
import { NordicIcon } from "../nordic-icon";
import { useMenuButtonMetrics } from "../../utils/use-menu-button-metrics";

export interface AppNavbarProps {
  title: string;
  step?: string;
  progress?: number;
  progressAriaLabel?: string;
  backAriaLabel: string;
  onBack?: () => void;
  variant?: "default" | "onboarding" | "nova";
}

export function AppNavbar({
  title,
  step,
  progress,
  progressAriaLabel,
  backAriaLabel,
  onBack,
  variant = "default",
}: AppNavbarProps) {
  const { navigationBarHeight, rightInset, statusBarHeight, titleMaxWidth, totalHeaderHeight } =
    useMenuButtonMetrics();
  const isOnboarding = variant === "onboarding";
  const progressPercent = useDeferredProgress(
    progress === undefined ? 0 : Math.max(0, Math.min(progress, 1)) * 100,
  );

  return (
    <>
      <View
        className={isOnboarding ? "onboarding-brand-row" : `app-navbar app-navbar--${variant}`}
        style={{
          boxSizing: "border-box",
          minHeight: `${totalHeaderHeight}px`,
          paddingRight: `${rightInset}px`,
          paddingTop: `${statusBarHeight}px`,
          position: "relative",
        }}
      >
        <View
          ariaLabel={backAriaLabel}
          className={isOnboarding ? "onboarding-back" : "app-navbar__back"}
          onClick={() => onBack?.()}
          style={{
            alignItems: "center",
            display: "flex",
            height: `${navigationBarHeight}px`,
            justifyContent: "center",
            position: "relative",
            width: `${navigationBarHeight}px`,
            zIndex: 1,
          }}
        >
          <NordicIcon name="back" ariaLabel={backAriaLabel} />
        </View>
        <View
          className={isOnboarding ? "onboarding-brand-copy" : "app-navbar__title-region"}
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            height: `${navigationBarHeight}px`,
            justifyContent: "center",
            left: "50%",
            maxWidth: `${titleMaxWidth}px`,
            pointerEvents: "none",
            position: "absolute",
            top: `${statusBarHeight}px`,
            transform: "translateX(-50%)",
            width: "100%",
          }}
        >
          {isOnboarding ? (
            <Text className="onboarding-brand">{title}</Text>
          ) : (
            <View className="app-navbar__title-line">
              {variant === "nova" ? <NordicIcon name="nova" size={18} ariaLabel="NOVA 洞察" /> : null}
              <Text className="app-navbar__title">{title}</Text>
            </View>
          )}
          {step ? (
            <Text className={isOnboarding ? "onboarding-step" : "app-navbar__step"}>{step}</Text>
          ) : null}
        </View>
      </View>
      {progress === undefined ? null : (
        <View
          ariaLabel={progressAriaLabel}
          className={isOnboarding ? "onboarding-progress" : "app-navbar__progress"}
        >
          <View
            className={`animated-progress-bar ${isOnboarding ? "onboarding-progress__value" : "app-navbar__progress-value"}`}
            style={{ transform: `scaleX(${progressPercent / 100})` }}
          />
        </View>
      )}
    </>
  );
}
