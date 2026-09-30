import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { Text, View } from "@tarojs/components";
import Taro, {
  useDidShow,
  usePullDownRefresh,
  useShareAppMessage,
  useShareTimeline,
} from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { AIInsightCard } from "../../components/ai-insight-card";
import { RecentFrequentMeals } from "../../components/recent-frequent-meals";
import { DailyNutritionSummary } from "../../components/daily-nutrition-summary";
import { EmptyState } from "../../components/empty-state";
import { FirstRunTip } from "../../components/first-run-tip";
import { Loading } from "../../components/loading";
import { MealGroup } from "../../components/meal-group";
import { SectionTitle } from "../../components/section-title";
import { Avatar } from "../../components/avatar";
import { NordicIcon } from "../../components/nordic-icon";
import { type MealType } from "../../features/meals/domain";
import { resolveHomeDailySummary } from "../../features/meals/home-daily-summary";
import { getCoachGreeting } from "../../features/coach/server-time";
import { evaluateProductAchievements } from "../../features/coach/refresh-achievements";
import { getLocalDateString } from "../../features/onboarding/domain";
import {
  hasSeenFirstRunTip,
  markFirstRunTipSeen,
  retireFirstRunTipsIfRecordedMeals,
} from "../../features/first-run-tips/first-run-tips";
import { buildAppShareMessage, buildAppTimelineShare } from "../../features/share/app-share";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import { getProductMeals, mapProductMeal } from "../../api/meal-data-api";
import { getProductDailySummary, type ProductDailySummary } from "../../api/insight-api";
import { useProfileStore } from "../../stores/profile-store";
import { useAuthStore } from "../../auth/auth-store";
import { useTabBarStore } from "../../stores/tab-bar-store";
import { usePlanSaveTransitionStore } from "../../stores/plan-save-transition-store";
import { PlanSaveTransitionOverlay } from "../../components/plan-save-transition-overlay";
import { hasSeenWelcome } from "../../features/welcome/welcome-seen";
import { useAppShare } from "../../hooks/use-app-share";
import { isOnboardingCompleted } from "../../utils/local-experience";
import { tryPresentPendingMilestone } from "../../features/milestones/presentation-flow";
import { useAppTransitionStore } from "../../stores/app-transition-store";
import { refreshAndroidSmartReminders } from "../../features/smart-reminders/coordinator";
import { DEFAULT_MEAL_GROUP_EXPANDED, mealGroupStateStorage, type MealGroupExpandedState } from "../../features/meals/meal-group-state";
import { checkAndroidAppUpdate } from "../../features/app-update/runtime";

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const greetingKeys: Record<string, string> = {
  "你好": "hello", "夜色正静": "quietNight", "夜深了": "lateNight", "夜还很静": "beforeDawn",
  "还没休息": "awakeLate", "周末早上好": "weekendMorning", "早上好": "morning",
  "中午好": "noon", "下午好": "afternoon", "晚上好": "evening",
};
const goalKeys: Record<string, string> = {
  "增益增肌": "muscle_gain", "轻盈减脂": "fat_loss", "保持状态": "maintenance", "健康饮食": "performance",
};

export default function HomePage() {
  useTranslation();
  // Keep hooks in the page file so Taro enables share, plus useAppShare for real-device binding.
  useShareAppMessage(() => buildAppShareMessage());
  useShareTimeline(() => buildAppTimelineShare());
  useAppShare();
  const store = useMealStore();
  const profile = useProfileStore();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const today = getLocalDateString();
  const [remoteSummary, setRemoteSummary] = useState<ProductDailySummary | null>(null);
  const [homeDataReady, setHomeDataReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const hideWelcomeTransition = useAppTransitionStore((state) => state.hideWelcomeTransition);
  const planSaveHandoffActive = usePlanSaveTransitionStore((state) => state.handoffActive);
  const planSaveTransitionPhase = usePlanSaveTransitionStore((state) => state.phase);
  const revealPlanSaveTransition = usePlanSaveTransitionStore((state) => state.reveal);
  const finishPlanSaveTransition = usePlanSaveTransitionStore((state) => state.finish);
  const planSaveEntranceStarted = useRef(false);
  const milestoneHomeCheckStarted = useRef(false);
  const [planSaveContentVisible, setPlanSaveContentVisible] = useState(false);
  const [mealGroupExpanded, setMealGroupExpanded] = useState<MealGroupExpandedState>(DEFAULT_MEAL_GROUP_EXPANDED);
  const pullRefreshPending = useRef(false);
  const [guideFirstMeal, setGuideFirstMeal] = useState(
    () => !hasSeenFirstRunTip("home-first-meal"),
  );
  const localSummary = store.getDailySummary(today);
  const summary = resolveHomeDailySummary(
    remoteSummary
      ? {
          ...remoteSummary.targets,
          consumed: remoteSummary.consumed,
          completion: remoteSummary.completion,
        }
      : null,
    localSummary,
  );
  const meals = store.getMealsByDate(today);
  const greeting = getCoachGreeting(remoteSummary?.serverTime ?? null);
  const remoteInsight = summary.staleRemote ? null : (remoteSummary?.insight ?? null);
  useEffect(() => {
    if (userId) setMealGroupExpanded(mealGroupStateStorage.load(userId));
  }, [userId]);
  const toggleMealGroup = (mealType: MealType) => {
    setMealGroupExpanded((current) => {
      const next = { ...current, [mealType]: !current[mealType] };
      if (userId) mealGroupStateStorage.save(userId, next);
      return next;
    });
  };
  usePullDownRefresh(() => {
    pullRefreshPending.current = true;
    setRefreshing(true);
    setRefreshVersion((version) => version + 1);
  });
  useDidShow(() => {
    // Belt-and-suspenders: never stay on Home when server/local say onboarding is open.
    if (!isOnboardingCompleted()) {
      void Taro.reLaunch({
        url: hasSeenWelcome() ? "/pages/onboarding/index" : "/pages/welcome/index",
      });
      return;
    }
    setTimeout(hideWelcomeTransition, 180);
    void checkAndroidAppUpdate();
    const mealState = useMealStore.getState();
    if (retireFirstRunTipsIfRecordedMeals(mealState.meals, mealState.dataSource)) {
      setGuideFirstMeal(false);
    } else if (hasSeenFirstRunTip("home-first-meal")) {
      setGuideFirstMeal(false);
    }
    setRefreshVersion((version) => version + 1);
    // Backfilled records never interrupt their save flow; Home is the next safe
    // opportunity to consume the server-owned pending milestone.
    if (!milestoneHomeCheckStarted.current) {
      milestoneHomeCheckStarted.current = true;
      void tryPresentPendingMilestone("home_did_show").finally(() => {
        milestoneHomeCheckStarted.current = false;
      });
    }
  });
  useEffect(() => {
    let cancelled = false;
    // Home is the final safety net for every onboarding/profile path. The
    // server owns the pending state, so this is safe to run on each show.
    if (isOnboardingCompleted()) {
      void evaluateProductAchievements(today).catch((error) => {
        console.warn("[achievements] home evaluation failed", error);
      });
    }
    if (!planSaveHandoffActive && !remoteSummary && store.getMealsByDate(today).length === 0) {
      store.setLoadingState("loading");
    }
    setSyncError(null);
    const request = getProductDailySummary(today)
      .then(async (dailySummary) => {
        setRemoteSummary(dailySummary);
        store.setDailyTargets(dailySummary.targets);
        if (Array.isArray(dailySummary.meals)) {
          store.replaceRemoteMeals(dailySummary.meals.map(mapProductMeal), today);
          void refreshAndroidSmartReminders();
          return;
        }
        const remoteMeals = await getProductMeals(today);
        store.replaceRemoteMeals(remoteMeals, today);
        void refreshAndroidSmartReminders();
      })
      .catch(() => {
        setRemoteSummary(null);
        setSyncError(t("home.syncError"));
        store.setLoadingState(store.getMealsByDate(today).length ? "normal" : "empty");
      });
    void request.finally(() => {
      if (cancelled) return;
      setHomeDataReady(true);
      if (!cancelled && pullRefreshPending.current) {
        pullRefreshPending.current = false;
        setRefreshing(false);
        Taro.stopPullDownRefresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion, store.replaceRemoteMeals, today, planSaveHandoffActive]);
  useEffect(() => {
    if (!planSaveHandoffActive || planSaveEntranceStarted.current) return;
    planSaveEntranceStarted.current = true;
    const revealTimer = setTimeout(() => {
      setPlanSaveContentVisible(true);
      revealPlanSaveTransition();
    }, 32);
    const finishTimer = setTimeout(finishPlanSaveTransition, 32 + 240);
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(finishTimer);
    };
  }, [planSaveHandoffActive, revealPlanSaveTransition, finishPlanSaveTransition]);
  const openDetail = (id: string) => Taro.navigateTo({ url: `/pages/meal-detail/index?id=${id}` });
  // Both destinations are native tabBar pages. navigateTo cannot open them.
  const openScanner = () => {
    // Primary「拍照识别」bypasses the tip CTA — still mark step 1 done.
    markFirstRunTipSeen("home-first-meal");
    setGuideFirstMeal(false);
    void Taro.navigateTo({ url: "/pages/food-scanner/index" });
  };
  const openRecords = () => {
    useTabBarStore.getState().setActiveKey("meal-records");
    void Taro.switchTab({ url: "/pages/meal-records/index" });
  };
  const openManualMeal = () => Taro.navigateTo({ url: "/pages/manual-meal/index" });
  if (!homeDataReady && !planSaveHandoffActive)
    return (
      <PageLayout
        title={t("home.title")}
        subtitle={t("home.sync")}
        eyebrow="Nordic Nutri"
        activeTab="home"
        refreshing={refreshing}
      >
        <Loading label={t("home.loading")} />
      </PageLayout>
    );
  return (
    <PageLayout
      activeTab="home"
      hideNavigation
      title={t("tabs.home")}
      refreshing={refreshing}
      className={`page-layout--home${process.env.TARO_APP_PLATFORM === "android" ? " page-layout--home-android" : ""}`}
    >
      <View className={`home-page ${planSaveContentVisible ? "home-page--plan-save-entered" : ""}`}>
        <View className="home-page__header">
          <Avatar
            label={profile.profile.nickname.slice(0, 1).toUpperCase()}
            src={profile.profile.avatarUrl}
            size="home"
          />
          <View className="home-page__greeting-copy">
            <Text className="home-page__greeting">
              {t("home.greetingWithName", { greeting: t(`home.greetings.${greetingKeys[greeting] || "hello"}`), name: profile.profile.nickname })}
            </Text>
            <Text className="home-page__goal">{t("home.goalWithLabel", { goal: goalKeys[profile.profile.goalLabel] ? t(`onboarding.goals.${goalKeys[profile.profile.goalLabel]}.title`) : profile.profile.goalLabel })}</Text>
          </View>
        </View>
        {syncError ? (
          <View className="home-page__sync-note">
            <Text>{syncError}</Text>
            <Text onClick={() => setRefreshVersion((version) => version + 1)}>{t("common.retry")}</Text>
          </View>
        ) : null}
        <View className="home-page__target">
          <View className="home-page__section-head home-page__section-head--row">
            <Text>{t("home.dailyTarget")}</Text>
            <Text
              className="home-page__section-action"
              onClick={() => void Taro.navigateTo({ url: "/pages/goal-adjust/index" })}
            >
              {t("home.adjust")}
            </Text>
          </View>
          <View onClick={() => void Taro.navigateTo({ url: "/pages/goal-adjust/index" })}>
            <DailyNutritionSummary summary={summary} dashboard />
          </View>
        </View>
        {guideFirstMeal && meals.length === 0 ? (
          <FirstRunTip
            tipId="home-first-meal"
            step="1/3"
            title={t("home.firstMealTitle")}
            body={t("home.firstMealBody")}
            actionLabel={t("home.takePhoto")}
            onAction={openScanner}
            onClose={() => setGuideFirstMeal(false)}
          />
        ) : null}
        <View onClick={openRecords}>
          <AIInsightCard
            label={t("home.insightTitle")}
            headline={remoteInsight?.headline ?? undefined}
            content={
              remoteInsight?.content ?? t("home.insightUnavailable")
            }
            loading={summary.staleRemote || (!remoteInsight && !syncError)}
            actionLabel={t("home.viewRecords")}
          />
        </View>
        <Text className="nutrition-disclaimer">
          {t("home.disclaimer")}
        </Text>
        <View
          className={`home-page__actions ${guideFirstMeal && meals.length === 0 ? "home-page__actions--guided" : ""}`}
        >
          <View className="home-page__action home-page__action--primary" onClick={openScanner}>
            <NordicIcon name="camera" size={20} ariaLabel={t("home.scanMeal")} />
            <Text>{t("home.scanMeal")}</Text>
          </View>
          <View className="home-page__action" onClick={openManualMeal}>
            <NordicIcon name="circle-plus" size={20} ariaLabel={t("home.logMeal")} />
            <Text>{t("home.logMeal")}</Text>
          </View>
        </View>
        <RecentFrequentMeals refreshVersion={refreshVersion} />
        <View className="home-page__meal-list">
          <SectionTitle
            eyebrow={t("home.todayMeals")}
            title={meals.length ? t("home.eachMealCounts") : t("home.startWithMeal")}
            actionLabel={t("home.allRecords")}
            onActionClick={openRecords}
          />
          {store.loadingState === "empty" ? (
            <EmptyState
              title={t("home.noRecords")}
              description={t("home.noRecordsHint")}
              actionLabel={t("home.scanFirstMeal")}
              onAction={openScanner}
              showMark={false}
            />
          ) : (
            <View className="content-stack content-stack--compact">
              {mealTypes.map((mealType) => (
                <MealGroup
                  key={mealType}
                  mealType={mealType}
                  meals={meals.filter((meal) => meal.mealType === mealType)}
                  expanded={mealGroupExpanded[mealType]}
                  onToggle={() => toggleMealGroup(mealType)}
                  onSelect={(meal) => openDetail(meal.id)}
                  onAdd={openScanner}
                />
              ))}
            </View>
          )}
        </View>
      </View>
      <PlanSaveTransitionOverlay
        visible={planSaveHandoffActive}
        phase={planSaveTransitionPhase === "idle" ? "success" : planSaveTransitionPhase}
        instant={planSaveTransitionPhase === "covering"}
      />
    </PageLayout>
  );
}
