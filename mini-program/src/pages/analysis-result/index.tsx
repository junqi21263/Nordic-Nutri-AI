import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { AIInsightCard } from "../../components/ai-insight-card";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { CircularProgress } from "../../components/circular-progress";
import { ErrorState } from "../../components/error-state";
import { MacroProgress } from "../../components/macro-progress";
import { NordicIcon } from "../../components/nordic-icon";
import { NutritionTag } from "../../components/nutrition-tag";
import bowlImage from "../../assets/meal-bowl.svg";
import oatsImage from "../../assets/meal-oats.svg";
import salmonImage from "../../assets/meal-salmon.svg";
import { PageLayout } from "../../layouts/page-layout";
import type { MealType } from "../../features/meals/domain";
import { mealTypeOptions } from "../../features/meals/meal-type";
import { getAdjustedAnalysis } from "../../features/scanner/domain";
import { analyzeProductMeal, createProductMeal, getProductMeals } from "../../api/meal-data-api";
import { toProductMealInput } from "../../features/meals/product-meal-input";
import { useAnalysisStore } from "../../stores/analysis-store";
import { useMealStore } from "../../stores/meal-store";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import { getLocalDateString } from "../../features/onboarding/domain";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useScannerStore } from "../../stores/scanner-store";
import { navigateBackOrHome } from "../../utils/navigation";

const nowTime = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const imageByKey = { bowl: bowlImage, oats: oatsImage, salmon: salmonImage };

export default function AnalysisResultPage() {
  const analysisStore = useAnalysisStore();
  const portion = usePortionDraftStore();
  const meals = useMealStore();
  const feedback = useFeedbackStore();
  const scanner = useScannerStore();
  const meal = analysisStore.analysis;
  const setMealType = (mealType: MealType) => {
    if (!analysisStore.analysis) return;
    analysisStore.setAnalysis({ ...analysisStore.analysis, mealType });
  };
  if (!meal)
    return (
      <PageLayout
        title="营养分析"
        subtitle="还没有本地分析结果。"
        eyebrow="分析结果"
        showTabs={false}
        leading="‹"
        onLeadingClick={() => navigateBackOrHome("/pages/food-scanner/index")}
      >
        <ErrorState title="分析结果不存在" description="请返回扫描页重新拍摄餐盘。" />
        <AppButton size="large" onClick={() => navigateBackOrHome("/pages/food-scanner/index")}>
          返回扫描
        </AppButton>
      </PageLayout>
    );
  const adjusted = getAdjustedAnalysis(meal, 1);
  const save = async () => {
    const localMeal = {
      date: getLocalDateString(),
      time: nowTime(),
      title: meal.title,
      mealType: meal.mealType,
      favorite: false,
      imageKey: meal.imageKey,
      imageUrl: meal.imagePath || meal.imageUrl || scanner.previewPath || null,
      items: adjusted.items,
      insight: meal.insight,
    };
    try {
      const textAnalysis = meal.analysisId
        ? null
        : await analyzeProductMeal(
            adjusted.items.map((item) => ({ name: item.name, quantityG: 100 })),
          );
      const request = toProductMealInput(localMeal, meal.analysisId ?? textAnalysis?.id);
      const saved = await createProductMeal(
        textAnalysis
          ? { ...request, name: textAnalysis.mealName, items: textAnalysis.items }
          : request,
      );
      meals.replaceRemoteMeals(await getProductMeals(localMeal.date), localMeal.date);
      setTimeout(() => {
        void import("../../features/coach/refresh-achievements")
          .then(({ refreshProductAchievements }) => refreshProductAchievements(localMeal.date))
          .catch(() => undefined);
      }, 2800);
      feedback.show({ message: "AI 分析已保存到饮食记录", tone: "success" });
      Taro.redirectTo({ url: `/pages/meal-detail/index?id=${saved.id}` });
    } catch {
      feedback.show({ message: "分析或保存失败，请检查网络后重试", tone: "error" });
    }
  };
  const evaluation = meal.evaluation || "这餐吃得不错";
  const heroImage = scanner.previewPath ?? imageByKey[meal.imageKey];
  const previewImage = () => Taro.previewImage({ current: heroImage, urls: [heroImage] });
  return (
    <PageLayout
      title={evaluation}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--analysis-result"
    >
      <View className="analysis-result-page">
        <View className="analysis-result-page__header">
          <View className="analysis-result-page__heading">
            <Text className="analysis-result-page__title">{evaluation}</Text>
            <Text className="analysis-result-page__subtitle">
              本地分析已完成，保存前可微调份量。
            </Text>
          </View>
          <View className="analysis-result-page__ai-status">
            <NordicIcon name="check" size={22} ariaLabel="分析完成" />
            <Text>AI 完成</Text>
          </View>
        </View>

        <AppCard tone="beige" className="analysis-result-page__summary">
          <View
            className="analysis-result-page__summary-visual"
            ariaLabel="查看原始餐食照片"
            onClick={previewImage}
          >
            <Image className="analysis-result-page__summary-image" src={heroImage} mode="aspectFill" />
            <View className="analysis-result-page__summary-scrim" />
            <View className="analysis-result-page__summary-hero-copy">
              <Text className="analysis-result-page__summary-title">{meal.title}</Text>
              <Text className="analysis-result-page__summary-caption">点按查看原图 · 云端视觉识别</Text>
            </View>
          </View>
          <View className="analysis-result-page__summary-body">
            <View
              className={`analysis-result-page__confidence ${
                meal.confidence >= 90
                  ? "analysis-result-page__confidence--high"
                  : meal.confidence >= 70
                    ? "analysis-result-page__confidence--mid"
                    : "analysis-result-page__confidence--low"
              }`}
            >
              <View className="analysis-result-page__confidence-main">
                <View className="analysis-result-page__confidence-icon">
                  <NordicIcon name="check" size={14} ariaLabel="识别可信度" />
                </View>
                <View className="analysis-result-page__confidence-copy">
                  <Text className="analysis-result-page__confidence-value">{meal.confidence}%</Text>
                  <Text className="analysis-result-page__confidence-label">识别可信度</Text>
                </View>
              </View>
              {(meal.nutritionSource === "usda" || meal.nutritionSource === "mixed") && (
                <>
                  <View className="analysis-result-page__confidence-divider" />
                  <View className="analysis-result-page__confidence-source">
                    <Text className="analysis-result-page__confidence-source-label">营养数据</Text>
                    <Text className="analysis-result-page__confidence-source-value">
                      {meal.nutritionSource === "usda" ? "USDA" : "部分 USDA"}
                    </Text>
                  </View>
                </>
              )}
            </View>
            <View className="analysis-result-page__meal-type-block">
              <Text className="analysis-result-page__meal-type-label">这是哪一餐？</Text>
              <View className="analysis-result-page__meal-types" ariaLabel="选择餐次类型">
                {mealTypeOptions.map((option) => (
                  <View
                    key={option.value}
                    className={`analysis-result-page__meal-type ${
                      meal.mealType === option.value ? "analysis-result-page__meal-type--active" : ""
                    }`}
                    ariaLabel={option.label}
                    onClick={() => setMealType(option.value)}
                  >
                    <Text>{option.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </AppCard>

        <AppCard className="analysis-result-page__score">
          <CircularProgress
            value={adjusted.score === "A" ? 92 : adjusted.score === "B" ? 76 : 58}
            total={100}
            label="餐点评分"
            tone="sage"
          />
          <View className="analysis-result-page__score-copy">
            <Text className="analysis-result-page__score-grade">{adjusted.score} · 餐点评分</Text>
            <Text className="analysis-result-page__score-kcal">{adjusted.calories} kcal</Text>
            <View className="analysis-result-page__macro-tags">
              <NutritionTag>{adjusted.protein}g 蛋白质</NutritionTag>
              <NutritionTag tone="carbs">{adjusted.carbs}g 碳水</NutritionTag>
              <NutritionTag tone="fat">{adjusted.fat}g 脂肪</NutritionTag>
            </View>
          </View>
        </AppCard>

        <AppCard className="analysis-result-page__ingredients">
          <Text className="analysis-result-page__section-title">识别食材</Text>
          {adjusted.items.map((item) => (
            <View className="analysis-ingredient" key={item.id}>
              <Text>{item.name}</Text>
              <Text>
                {item.amount} · {item.calories} kcal
              </Text>
            </View>
          ))}
          <View className="analysis-result-page__macro-list">
            <MacroProgress label="蛋白质" value={adjusted.protein} target={60} />
            <MacroProgress label="碳水" value={adjusted.carbs} target={90} tone="carbs" />
            <MacroProgress label="脂肪" value={adjusted.fat} target={25} tone="fat" />
          </View>
        </AppCard>

        <AIInsightCard
          content={meal.insight}
          actionLabel="查看饮食记录"
          onActionClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
        />

        <View className="analysis-result-page__actions">
          <AppButton
            variant="outline"
            size="large"
            onClick={() => {
              portion.start(meal);
              Taro.navigateTo({ url: "/pages/portion-adjustment/index" });
            }}
          >
            调整份量
          </AppButton>
          <AppButton size="large" onClick={() => void save()}>
            保存本餐
          </AppButton>
        </View>
      </View>
    </PageLayout>
  );
}
