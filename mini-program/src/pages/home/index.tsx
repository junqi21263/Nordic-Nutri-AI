import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AIInsightCard } from "../../components/ai-insight-card";
import { DailyNutritionSummary } from "../../components/daily-nutrition-summary";
import { EmptyState } from "../../components/empty-state";
import { Loading } from "../../components/loading";
import { MealGroup } from "../../components/meal-group";
import { SectionTitle } from "../../components/section-title";
import { Avatar } from "../../components/avatar";
import { NordicIcon } from "../../components/nordic-icon";
import { clampProgress, type MealType } from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import { getProductMeals } from "../../api/meal-data-api";
import { getProductDailySummary, type ProductDailySummary } from "../../api/insight-api";
import { useProfileStore } from "../../stores/profile-store";

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function createInsight(
  summary: ReturnType<typeof useMealStore.getState>["getDailySummary"] extends (
    ...args: never[]
  ) => infer Result
    ? Result
    : never,
) {
  const protein = clampProgress(summary.consumed.protein, summary.protein);
  const fat = clampProgress(summary.consumed.fat, summary.fat);
  const calories = clampProgress(summary.consumed.calories, summary.calories);
  if (fat.exceeded) return "脂肪已超出目标，下一餐优先选择瘦肉、蔬菜和清淡烹饪方式。";
  if (protein.remaining > 25)
    return `今天还差 ${protein.remaining}g 蛋白质。鸡胸肉、Skyr 或豆腐都是轻松的选择。`;
  if (calories.percent >= 90) return "热量已接近目标，晚餐保持蔬菜与优质蛋白质即可。";
  if (summary.consumed.carbs < summary.carbs * 0.6)
    return "碳水进度偏低，训练前可加入土豆、米饭或全麦面包。";
  return "今天的能量与三大营养素节奏很稳定，继续保持这份从容。";
}

export default function HomePage() {
  const store = useMealStore();
  const profile = useProfileStore();
  const today = getLocalDateString();
  const [remoteSummary, setRemoteSummary] = useState<ProductDailySummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const localSummary = store.getDailySummary(today);
  const summary = remoteSummary
    ? {
        ...remoteSummary.targets,
        consumed: remoteSummary.consumed,
        completion: remoteSummary.completion,
      }
    : localSummary;
  const meals = store.getMealsByDate(today);
  useEffect(() => {
    store.setLoadingState("loading");
    setSyncError(null);
    void Promise.all([getProductMeals(today), getProductDailySummary(today)])
      .then(([remoteMeals, dailySummary]) => {
        store.replaceRemoteMeals(remoteMeals, today);
        setRemoteSummary(dailySummary);
      })
      .catch(() => {
        setRemoteSummary(null);
        setSyncError("云端同步暂时不可用，已保留本地记录。");
        store.setLoadingState(store.getMealsByDate(today).length ? "normal" : "empty");
      });
  }, [refreshVersion, store.replaceRemoteMeals, today]);
  const openDetail = (id: string) => Taro.navigateTo({ url: `/pages/meal-detail/index?id=${id}` });
  // Both destinations are native tabBar pages. navigateTo cannot open them.
  const openScanner = () => Taro.navigateTo({ url: "/pages/food-scanner/index" });
  const openRecords = () => Taro.switchTab({ url: "/pages/meal-records/index" });

  if (store.loadingState === "loading")
    return (
      <PageLayout
        title="今天的营养"
        subtitle="正在整理你的云端记录。"
        eyebrow="Nordic Nutri"
        activeTab="home"
      >
        <Loading label="正在加载今日餐次" />
      </PageLayout>
    );
  return (
    <PageLayout activeTab="home" hideNavigation title="首页" className="page-layout--home">
      <View className="home-page">
        <View className="home-page__header">
          <Avatar
            label={profile.profile.nickname.slice(0, 1).toUpperCase()}
            src={profile.profile.avatarUrl}
            size="home"
          />
          <View className="home-page__greeting-copy">
            <Text className="home-page__greeting">早上好，{profile.profile.nickname}</Text>
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
          <View className="home-page__section-head">
            <Text>今日目标</Text>
          </View>
          <DailyNutritionSummary summary={summary} dashboard />
        </View>
        <View onClick={openRecords}>
          <AIInsightCard content={createInsight(summary)} actionLabel="查看饮食记录" />
        </View>
        <View className="home-page__actions">
          <View className="home-page__action home-page__action--primary" onClick={openScanner}>
            <NordicIcon name="scan-line" size={20} ariaLabel="拍照识别" />
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
            <EmptyState title="今天还没有记录" description="从一餐开始，建立属于你的营养节奏。" />
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
