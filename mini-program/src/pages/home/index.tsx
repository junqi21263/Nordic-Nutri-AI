import { Text, View } from "@tarojs/components";
import Taro, {
  useDidShow,
  usePullDownRefresh,
  useShareAppMessage,
  useShareTimeline,
} from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { AIInsightCard } from "../../components/ai-insight-card";
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
import { useTabBarStore } from "../../stores/tab-bar-store";
import { hasSeenWelcome } from "../../features/welcome/welcome-seen";
import { useAppShare } from "../../hooks/use-app-share";
import { isOnboardingCompleted } from "../../utils/local-experience";

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export default function HomePage() {
  // Keep hooks in the page file so Taro enables share, plus useAppShare for real-device binding.
  useShareAppMessage(() => buildAppShareMessage());
  useShareTimeline(() => buildAppTimelineShare());
  useAppShare();
  const store = useMealStore();
  const profile = useProfileStore();
  const today = getLocalDateString();
  const [remoteSummary, setRemoteSummary] = useState<ProductDailySummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
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
    const mealState = useMealStore.getState();
    if (retireFirstRunTipsIfRecordedMeals(mealState.meals, mealState.dataSource)) {
      setGuideFirstMeal(false);
    } else if (hasSeenFirstRunTip("home-first-meal")) {
      setGuideFirstMeal(false);
    }
    setRefreshVersion((version) => version + 1);
  });
  useEffect(() => {
    let cancelled = false;
    if (!remoteSummary && store.getMealsByDate(today).length === 0) {
      store.setLoadingState("loading");
    }
    setSyncError(null);
    const request = getProductDailySummary(today)
      .then(async (dailySummary) => {
        setRemoteSummary(dailySummary);
        store.setDailyTargets(dailySummary.targets);
        if (Array.isArray(dailySummary.meals)) {
          store.replaceRemoteMeals(dailySummary.meals.map(mapProductMeal), today);
          return;
        }
        const remoteMeals = await getProductMeals(today);
        store.replaceRemoteMeals(remoteMeals, today);
      })
      .catch(() => {
        setRemoteSummary(null);
        setSyncError("云端同步暂时不可用，已保留本地记录。");
        store.setLoadingState(store.getMealsByDate(today).length ? "normal" : "empty");
      });
    void request.finally(() => {
      if (!cancelled && pullRefreshPending.current) {
        pullRefreshPending.current = false;
        setRefreshing(false);
        Taro.stopPullDownRefresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion, store.replaceRemoteMeals, today]);
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

  if (store.loadingState === "loading" && !meals.length && !remoteSummary)
    return (
      <PageLayout
        title="今天的营养"
        subtitle="正在整理你的云端记录。"
        eyebrow="Nordic Nutri"
        activeTab="home"
        refreshing={refreshing}
      >
        <Loading label="正在加载今日餐次" />
      </PageLayout>
    );
  return (
    <PageLayout
      activeTab="home"
      hideNavigation
      title="首页"
      refreshing={refreshing}
      className="page-layout--home"
    >
      <View className="home-page">
        <View className="home-page__header">
          <Avatar
            label={profile.profile.nickname.slice(0, 1).toUpperCase()}
            src={profile.profile.avatarUrl}
            size="home"
          />
          <View className="home-page__greeting-copy">
            <Text className="home-page__greeting">
              {greeting}，{profile.profile.nickname}
            </Text>
            <Text className="home-page__goal">目标：{profile.profile.goalLabel}</Text>
          </View>
        </View>
        {syncError ? (
          <View className="home-page__sync-note">
            <Text>{syncError}</Text>
            <Text onClick={() => setRefreshVersion((version) => version + 1)}>重试</Text>
          </View>
        ) : null}
        <View className="home-page__target">
          <View className="home-page__section-head home-page__section-head--row">
            <Text>今日目标</Text>
            <Text
              className="home-page__section-action"
              onClick={() => void Taro.navigateTo({ url: "/pages/goal-adjust/index" })}
            >
              调整
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
            title="先拍下今天的第一餐"
            body="点「去拍照」，对准整盘食物即可。AI 识别后还能改餐次和份量再保存。"
            actionLabel="去拍照"
            onAction={openScanner}
            onClose={() => setGuideFirstMeal(false)}
          />
        ) : null}
        <View onClick={openRecords}>
          <AIInsightCard
            label="NOVA · 营养洞察"
            headline={remoteInsight?.headline ?? undefined}
            content={
              remoteInsight?.content ?? "云端洞察暂不可用；记录下一餐后可获得更贴合当天进度的建议。"
            }
            loading={summary.staleRemote || (!remoteInsight && !syncError)}
            actionLabel="查看饮食记录"
          />
        </View>
        <Text className="nutrition-disclaimer">
          营养识别与建议仅供日常饮食参考，不构成医疗诊断或治疗建议。
        </Text>
        <View
          className={`home-page__actions ${guideFirstMeal && meals.length === 0 ? "home-page__actions--guided" : ""}`}
        >
          <View className="home-page__action home-page__action--primary" onClick={openScanner}>
            <NordicIcon name="camera" size={20} ariaLabel="拍照识别" />
            <Text>拍照识别</Text>
          </View>
          <View className="home-page__action" onClick={openRecords}>
            <NordicIcon name="circle-plus" size={20} ariaLabel="记录饮食" />
            <Text>记录饮食</Text>
          </View>
        </View>
        <View className="home-page__meal-list">
          <SectionTitle
            eyebrow="今日饮食"
            title={meals.length ? "每一餐都算数" : "从第一餐开始"}
            actionLabel="全部记录"
            onActionClick={openRecords}
          />
          {store.loadingState === "empty" ? (
            <EmptyState
              title="今天还没有记录"
              description="从一餐开始，建立属于你的营养节奏。"
              actionLabel="拍第一餐"
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
                  onSelect={(meal) => openDetail(meal.id)}
                  onAdd={openScanner}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </PageLayout>
  );
}
