import { View } from "@tarojs/components";
import { useDidHide, useDidShow } from "@tarojs/taro";
import { useEffect, useState, type PropsWithChildren } from "react";
import { AppSafeArea } from "../../components/app-safe-area";
import { AppTopBar } from "../../components/app-top-bar";
import { FeedbackHost } from "../../components/feedback-host";
import { AchievementUnlockModal } from "../../components/achievement-unlock-modal";
import { acknowledgeProductAchievementCelebration } from "../../api/insight-api";
import { BottomTabBar } from "../../components/bottom-tab-bar";
import { PullDownRefreshIndicator } from "../../components/pull-down-refresh-indicator";
import { AppHeader } from "../../components/app-header";
import { useSystemLayout } from "../../hooks/useSystemLayout";
import { useTabBarStore } from "../../stores/tab-bar-store";
import { useAchievementStore } from "../../stores/achievement-store";
import { useMealSavedCelebrationStore } from "../../stores/meal-saved-celebration-store";
import { MealSavedCelebration } from "../../components/meal-saved-celebration";
import { getCelebrationOverlayPriority } from "../../features/coach/celebration-overlay-priority";
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
  /** Disables the shared scroll-container entrance when a page owns its own reveal timing. */
  disablePageEnterAnimation?: boolean;
  /** Freezes the page scroll container while a modal or sheet is open. */
  scrollLocked?: boolean;
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
  disablePageEnterAnimation = false,
  scrollLocked = false,
  className,
  children,
}: PageLayoutProps) {
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);
  const activeKey = useTabBarStore((state) => state.activeKey);
  const tabbarVisible = useTabBarStore((state) => state.visible);
  const achievementUnlocked = useAchievementStore((state) => state.achievementUnlocked);
  const manualAchievementCelebration = useAchievementStore((state) => state.manualAchievementCelebration);
  const achievements = useAchievementStore((state) => state.achievements);
  const dismissAchievementUnlocked = useAchievementStore((state) => state.dismissAchievementUnlocked);
  const dismissManualAchievementCelebration = useAchievementStore((state) => state.dismissManualAchievementCelebration);
  const markAchievementCelebrated = useAchievementStore((state) => state.markAchievementCelebrated);
  const savedMeal = useMealSavedCelebrationStore((state) => state.savedMeal);
  const dismissSavedMealCelebration = useMealSavedCelebrationStore((state) => state.dismiss);
  const [pageVisible, setPageVisible] = useState(false);
  const layout = useSystemLayout();
  const activeAchievement = manualAchievementCelebration ?? (achievementUnlocked
    ? achievements.find((item) => item.id === achievementUnlocked.achievementId) ?? null
    : null);
  const celebrationPriority = getCelebrationOverlayPriority({
    hasSavedMeal: Boolean(savedMeal),
    hasAchievement: Boolean(activeAchievement),
  });
  const dismissAchievementCelebration = async () => {
    if (!activeAchievement) return false;
    if (manualAchievementCelebration) {
      dismissManualAchievementCelebration();
      return true;
    }
    try {
      await acknowledgeProductAchievementCelebration(activeAchievement.id);
      markAchievementCelebrated(activeAchievement.id);
      dismissAchievementUnlocked();
      return true;
    } catch {
      return false;
    }
  };
  const finishMealSaveSuccessFlow = () => savedMeal?.afterContinue?.() ?? Promise.resolve(false);

  // Tab pages stay mounted under switchTab; sync highlight on show, not only mount.
  useDidShow(() => {
    setPageVisible(true);
    if (showTabs) setActiveKey(activeTab ?? "home");
  });
  useDidHide(() => setPageVisible(false));
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
        scrollLocked ? "page-layout--scroll-locked" : "",
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
        className={[
          "page-layout__scroll",
          pageVisible && !disablePageEnterAnimation ? "page-layout__scroll--entered" : "",
        ].filter(Boolean).join(" ")}
        style={{
          ...cssVars,
          paddingTop: showBrandHeader ? `${layout.totalHeaderHeight}px` : "0px",
        }}
      >
        <View className="page-layout__content">
          {!hideNavigation ? (
            <AppHeader
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
      {pageVisible && celebrationPriority === "achievement" && activeAchievement ? (
        <AchievementUnlockModal
          achievement={activeAchievement}
          onDismiss={dismissAchievementCelebration}
        />
      ) : null}
      {pageVisible && celebrationPriority === "meal-saved" && savedMeal ? (
        <MealSavedCelebration
          visible
          kind={savedMeal.kind}
          calories={savedMeal.calories}
          protein={savedMeal.protein}
          carbs={savedMeal.carbs}
          fat={savedMeal.fat}
          previousCalories={savedMeal.previousCalories}
          currentCalories={savedMeal.currentCalories}
          targetCalories={savedMeal.targetCalories}
          onViewMeal={() => {
            dismissSavedMealCelebration();
            void finishMealSaveSuccessFlow()
              .then((openedPoster) => {
                if (openedPoster) return undefined;
                const pages = Taro.getCurrentPages();
                const currentPage = pages[pages.length - 1];
                if (currentPage?.route === "pages/portion-adjustment/index") {
                  return Taro.navigateBack({ delta: 1 });
                }
                return Taro.navigateTo({ url: `/pages/meal-detail/index?id=${savedMeal.mealId}` });
              })
              .catch(() => undefined);
          }}
          onContinue={() => {
            dismissSavedMealCelebration();
            void finishMealSaveSuccessFlow()
              .then((openedPoster) => {
                if (!openedPoster) return Taro.switchTab({ url: "/pages/home/index" });
                return undefined;
              })
              .catch(() => Taro.switchTab({ url: "/pages/home/index" }));
          }}
        />
      ) : null}
      <FeedbackHost enabled={pageVisible} />
    </AppSafeArea>
  );
}
