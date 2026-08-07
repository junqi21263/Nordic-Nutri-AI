import { View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { useEffect, type PropsWithChildren } from "react";
import { AppSafeArea } from "../../components/app-safe-area";
import { AppTopBar } from "../../components/app-top-bar";
import { AchievementUnlockOverlay } from "../../components/achievement-unlock-overlay";
import { acknowledgeProductAchievementCelebration } from "../../api/insight-api";
import { BottomTabBar } from "../../components/bottom-tab-bar";
import { PullDownRefreshIndicator } from "../../components/pull-down-refresh-indicator";
import { TopNavigation } from "../../components/top-navigation";
import { useSystemLayout } from "../../hooks/useSystemLayout";
import { useTabBarStore } from "../../stores/tab-bar-store";
import { useAchievementStore } from "../../stores/achievement-store";
import Taro from "@tarojs/taro";

export interface PageLayoutProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  activeTab?: string;
  showTabs?: boolean;
  leading?: string;
  action?: string;
  onLeadingClick?: () => void;
  onActionClick?: () => void;
  /** Allows a Stitch composition to provide its own compact navigation region. */
  hideNavigation?: boolean;
  /** When true, shows the fixed brand header with the project name and logo. Defaults to true. */
  showBrandHeader?: boolean;
  /** Show a back button in the top bar. Default false (tab pages). */
  showBack?: boolean;
  /** Show a home button in the top bar. */
  showHome?: boolean;
  /** Click handler for the top bar back button. */
  onTopBarBack?: () => void;
  /** Click handler for the top bar home button. */
  onTopBarHome?: () => void;
  topBarAction?: string;
  onTopBarAction?: () => void;
  refreshing?: boolean;
  className?: string;
}

export function PageLayout({
  title,
  subtitle,
  eyebrow,
  activeTab,
  showTabs = true,
  leading,
  action,
  onLeadingClick,
  onActionClick,
  hideNavigation = false,
  showBrandHeader = true,
  showBack = false,
  showHome = false,
  onTopBarBack,
  onTopBarHome,
  topBarAction,
  onTopBarAction,
  refreshing = false,
  className,
  children,
}: PageLayoutProps) {
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);
  const activeKey = useTabBarStore((state) => state.activeKey);
  const tabbarVisible = useTabBarStore((state) => state.visible);
  const achievementUnlocked = useAchievementStore((state) => state.achievementUnlocked);
  const achievements = useAchievementStore((state) => state.achievements);
  const dismissAchievementUnlocked = useAchievementStore((state) => state.dismissAchievementUnlocked);
  const markAchievementCelebrated = useAchievementStore((state) => state.markAchievementCelebrated);
  const layout = useSystemLayout();
  const activeAchievement = achievementUnlocked
    ? achievements.find((item) => item.id === achievementUnlocked.achievementId) ?? null
    : null;
  const dismissAchievementCelebration = async () => {
    if (!activeAchievement) return false;
    try {
      await acknowledgeProductAchievementCelebration(activeAchievement.id);
      markAchievementCelebrated(activeAchievement.id);
      dismissAchievementUnlocked();
      return true;
    } catch {
      Taro.showToast({ title: "庆祝确认失败，请稍后重试", icon: "none" });
      return false;
    }
  };

  // Tab pages stay mounted under switchTab; sync highlight on show, not only mount.
  useDidShow(() => {
    if (showTabs) setActiveKey(activeTab ?? "home");
  });
  useEffect(() => {
    if (showTabs) setActiveKey(activeTab ?? "home");
  }, [activeTab, setActiveKey, showTabs]);

  const cssVars = {
    "--app-status-bar-height": `${layout.statusBarHeight}px`,
    "--app-nav-bar-height": `${layout.navigationBarHeight}px`,
    "--app-header-height": `${layout.totalHeaderHeight}px`,
    "--app-tab-bar-height": `${layout.tabBarHeight}px`,
    "--app-safe-bottom": `${layout.safeBottom}px`,
    "--app-page-bg": "#faf9f6",
  } as Record<string, string>;

  return (
    <AppSafeArea
      className={[
        "page-layout",
        showTabs ? "" : "page-layout--without-tabs",
        hideNavigation ? "page-layout--custom-navigation" : "",
        showBrandHeader ? "page-layout--with-brand" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showBrandHeader ? (
        <AppTopBar
          showBack={showBack}
          showHome={showHome}
          onBack={onTopBarBack}
          onHome={onTopBarHome}
          rightAction={topBarAction}
          onRightAction={onTopBarAction}
        />
      ) : null}
      <View
        className="page-layout__scroll"
        style={{
          ...cssVars,
          paddingTop: showBrandHeader ? `${layout.totalHeaderHeight}px` : "0px",
        }}
      >
        <View className="page-layout__content">
          {!hideNavigation ? (
            <TopNavigation
              title={title}
              subtitle={subtitle}
              eyebrow={eyebrow}
              leading={leading}
              action={action}
              onLeadingClick={onLeadingClick}
              onActionClick={onActionClick}
            />
          ) : null}
          <PullDownRefreshIndicator refreshing={refreshing} />
          <View className="content-stack">{children}</View>
        </View>
      </View>
      {showTabs && tabbarVisible ? <BottomTabBar activeKey={activeKey} /> : null}
      <AchievementUnlockOverlay
        achievement={activeAchievement}
        onDismiss={dismissAchievementCelebration}
      />
    </AppSafeArea>
  );
}
