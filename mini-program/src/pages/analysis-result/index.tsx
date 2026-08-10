import { Image, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AIInsightCard } from "../../components/ai-insight-card";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { CircularProgress } from "../../components/circular-progress";
import { ErrorState } from "../../components/error-state";
import { MacroProgress } from "../../components/macro-progress";
import { NordicIcon } from "../../components/nordic-icon";
import bowlImage from "../../assets/meal-bowl.svg";
import oatsImage from "../../assets/meal-oats.svg";
import salmonImage from "../../assets/meal-salmon.svg";
import { PageLayout } from "../../layouts/page-layout";
import type { MealType } from "../../features/meals/domain";
import { mealTypeOptions } from "../../features/meals/meal-type";
import { getAdjustedAnalysis } from "../../features/scanner/domain";
import {
  getMealRecognitionMotionSchedule,
  mealRecognitionMotionConfig,
  shouldPlayMealRecognitionReveal,
} from "../../features/scanner/meal-recognition-motion";
import { analyzeProductMeal, createProductMeal, getProductMeals } from "../../api/meal-data-api";
import { toProductMealInput } from "../../features/meals/product-meal-input";
import { useAnalysisStore } from "../../stores/analysis-store";
import { useMealStore } from "../../stores/meal-store";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import { getLocalDateString } from "../../features/onboarding/domain";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useScannerStore } from "../../stores/scanner-store";
import { navigateBackOrHome } from "../../utils/navigation";
import { useCountUp } from "../../hooks/useCountUp";
import { useBottomActionReveal } from "../../hooks/useBottomActionReveal";
import { useMealRecognitionMotion, type MealRecognitionMotionPhase } from "../../hooks/useMealRecognitionMotion";

const nowTime = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const imageByKey = { bowl: bowlImage, oats: oatsImage, salmon: salmonImage };

const phaseOrder: MealRecognitionMotionPhase[] = [
  "idle",
  "baseReveal",
  "nutritionReveal",
  "metricsCount",
  "contentReveal",
  "bottomActionReveal",
  "complete",
];

function hasReachedPhase(current: MealRecognitionMotionPhase, target: MealRecognitionMotionPhase) {
  return phaseOrder.indexOf(current) >= phaseOrder.indexOf(target);
}

function RecognitionCountedText({
  className,
  target,
  suffix,
  enabled,
  holdAtZero,
  delayMs = 0,
}: {
  className: string;
  target: number;
  suffix: string;
  enabled: boolean;
  holdAtZero: boolean;
  delayMs?: number;
}) {
  const value = useCountUp(target, {
    enabled,
    delayMs,
    durationMs: mealRecognitionMotionConfig.countDurationMs,
    initialValue: holdAtZero ? 0 : target,
  });
  return <Text className={className}>{`${value}${suffix}`}</Text>;
}

function RecognitionMacroProgress({
  label,
  value,
  target,
  tone,
  enabled,
  holdAtZero,
  delayMs,
}: {
  label: string;
  value: number;
  target: number;
  tone?: "protein" | "carbs" | "fat";
  enabled: boolean;
  holdAtZero: boolean;
  delayMs: number;
}) {
  const displayValue = useCountUp(value, {
    enabled,
    delayMs,
    durationMs: mealRecognitionMotionConfig.countDurationMs,
    initialValue: holdAtZero ? 0 : value,
  });
  return (
    <MacroProgress
      label={label}
      value={value}
      displayValue={displayValue}
      target={target}
      tone={tone}
      reveal={holdAtZero ? enabled : true}
      revealDelayMs={delayMs}
      revealDurationMs={mealRecognitionMotionConfig.countDurationMs}
    />
  );
}

export default function AnalysisResultPage() {
  const router = useRouter();
  const analysisStore = useAnalysisStore();
  const portion = usePortionDraftStore();
  const meals = useMealStore();
  const feedback = useFeedbackStore();
  const scanner = useScannerStore();
  const [revealOnMount] = useState(() =>
    shouldPlayMealRecognitionReveal(router.params.reveal, scanner.consumeResultRevealPending()),
  );
  const [replayKey, setReplayKey] = useState(0);
  const isDev = process.env.NODE_ENV !== "production";
  const motion = useMealRecognitionMotion(revealOnMount || replayKey > 0, replayKey);
  const bottomAction = useBottomActionReveal(revealOnMount || replayKey > 0, replayKey);
  useEffect(() => {
    if (!isDev) return;
    const debugTarget = globalThis as typeof globalThis & {
      __NORDIC_REPLAY_MEAL_REVEAL__?: () => void;
    };
    debugTarget.__NORDIC_REPLAY_MEAL_REVEAL__ = () => setReplayKey((value) => value + 1);
    return () => {
      delete debugTarget.__NORDIC_REPLAY_MEAL_REVEAL__;
    };
  }, [isDev]);
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
  const motionSchedule = getMealRecognitionMotionSchedule(adjusted.items.length);
  const isRecognitionMotion = revealOnMount || replayKey > 0;
  const isBaseVisible = !isRecognitionMotion || hasReachedPhase(motion.phase, "baseReveal");
  const isNutritionVisible = !isRecognitionMotion || hasReachedPhase(motion.phase, "nutritionReveal");
  const isMetricsCounting = !isRecognitionMotion || hasReachedPhase(motion.phase, "metricsCount");
  const isContentVisible = !isRecognitionMotion || hasReachedPhase(motion.phase, "contentReveal");
  const shouldAnimateMetrics = isRecognitionMotion && isMetricsCounting;
  const shouldAnimateContentMetrics = isRecognitionMotion && isContentVisible;
  const save = async () => {
    const localMeal = {
      date: getLocalDateString(),
      time: nowTime(),
      title: meal.title,
      mealType: meal.mealType,
      favorite: false,
      imageKey: meal.imageKey,
      // Only durable refs — local wxfile preview is not restorable after save.
      imageUrl: meal.imagePath || meal.imageUrl || null,
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
      try {
        const { evaluateProductAchievements } = await import("../../features/coach/refresh-achievements");
        await evaluateProductAchievements(localMeal.date);
      } catch {
        // The saved meal remains valid if achievement refresh is temporarily unavailable.
      }
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
      <View
        className="analysis-result-page"
        data-recognition-reveal={isRecognitionMotion ? "true" : undefined}
        data-motion-phase={motion.isRevealing ? motion.phase : undefined}
        data-base-revealed={motion.isRevealing && isBaseVisible ? "true" : undefined}
        data-nutrition-revealed={motion.isRevealing && isNutritionVisible ? "true" : undefined}
        data-content-revealed={motion.isRevealing && isContentVisible ? "true" : undefined}
        data-bottom-revealed={bottomAction.phase === "entered" ? "true" : undefined}
      >
        <View className="analysis-result-page__header" data-motion-layer="base">
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

        <AppCard tone="beige" className="analysis-result-page__summary" motionLayer="base">
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

        <AppCard className="analysis-result-page__score" motionLayer="nutrition">
          <CircularProgress
            value={adjusted.score === "A" ? 92 : adjusted.score === "B" ? 76 : 58}
            total={100}
            label="餐点评分"
            tone="sage"
            reveal={isRecognitionMotion ? isMetricsCounting : true}
            revealDurationMs={mealRecognitionMotionConfig.countDurationMs}
            animateValue={isRecognitionMotion}
          />
          <View className="analysis-result-page__score-copy">
            <Text className="analysis-result-page__score-grade">{adjusted.score} · 餐点评分</Text>
            <RecognitionCountedText
              className="analysis-result-page__score-kcal"
              target={adjusted.calories}
              suffix=" kcal"
              enabled={shouldAnimateMetrics}
              holdAtZero={isRecognitionMotion}
            />
            <View className="analysis-result-page__macro-tags">
              <RecognitionCountedText
                className="nutrition-tag nutrition-tag--protein"
                target={adjusted.protein}
                suffix="g 蛋白质"
                enabled={shouldAnimateMetrics}
                holdAtZero={isRecognitionMotion}
              />
              <RecognitionCountedText
                className="nutrition-tag nutrition-tag--carbs"
                target={adjusted.carbs}
                suffix="g 碳水"
                enabled={shouldAnimateMetrics}
                holdAtZero={isRecognitionMotion}
                delayMs={mealRecognitionMotionConfig.macroStaggerMs}
              />
              <RecognitionCountedText
                className="nutrition-tag nutrition-tag--fat"
                target={adjusted.fat}
                suffix="g 脂肪"
                enabled={shouldAnimateMetrics}
                holdAtZero={isRecognitionMotion}
                delayMs={mealRecognitionMotionConfig.macroStaggerMs * 2}
              />
            </View>
          </View>
        </AppCard>

        <AppCard className="analysis-result-page__ingredients" motionLayer="content">
          <Text className="analysis-result-page__section-title">识别食材</Text>
          {adjusted.items.map((item, index) => (
            <View
              className={isContentVisible ? "analysis-ingredient analysis-ingredient--revealed" : "analysis-ingredient"}
              key={item.id}
              style={{
                transitionDelay: `${
                  motionSchedule.ingredientDelaysMs[index] ?? 0
                }ms`,
              }}
            >
              <Text>{item.name}</Text>
              <Text>
                {item.amount} · {item.calories} kcal
              </Text>
            </View>
          ))}
          <View className="analysis-result-page__macro-list">
            <RecognitionMacroProgress
              label="蛋白质"
              value={adjusted.protein}
              target={60}
              enabled={shouldAnimateContentMetrics}
              holdAtZero={isRecognitionMotion}
              delayMs={motionSchedule.macroDelaysMs[0] ?? 0}
            />
            <RecognitionMacroProgress
              label="碳水"
              value={adjusted.carbs}
              target={90}
              tone="carbs"
              enabled={shouldAnimateContentMetrics}
              holdAtZero={isRecognitionMotion}
              delayMs={motionSchedule.macroDelaysMs[1] ?? 0}
            />
            <RecognitionMacroProgress
              label="脂肪"
              value={adjusted.fat}
              target={25}
              tone="fat"
              enabled={shouldAnimateContentMetrics}
              holdAtZero={isRecognitionMotion}
              delayMs={motionSchedule.macroDelaysMs[2] ?? 0}
            />
          </View>
        </AppCard>

        <AIInsightCard
          motionLayer="content"
          content={meal.insight}
          actionLabel="查看饮食记录"
          onActionClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
        />
        <View className="analysis-result-page__bottom-bar" data-motion-layer="bottom">
          <Text className="nutrition-disclaimer">
            营养识别与建议仅供日常饮食参考，不构成医疗诊断或治疗建议。
          </Text>
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
      </View>
    </PageLayout>
  );
}
