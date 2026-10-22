import { trackAnalytics } from "../../features/analytics/runtime";
import { Image, Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { AIInsightCard } from "../../components/ai-insight-card";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { CircularProgress } from "../../components/circular-progress";
import { ConfirmDialog } from "../../components/confirm-dialog";
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
import { toMealSavedCelebration } from "../../features/meals/meal-saved-celebration-data";
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
import { useMealSavedCelebrationStore } from "../../stores/meal-saved-celebration-store";
import { tryPresentPendingMilestone } from "../../features/milestones/presentation-flow";
import { useScannerStore } from "../../stores/scanner-store";
import { navigateBackOrHome } from "../../utils/navigation";
import { useCountUp } from "../../hooks/useCountUp";
import { useBottomActionReveal } from "../../hooks/useBottomActionReveal";
import { useMealRecognitionMotion, type MealRecognitionMotionPhase } from "../../hooks/useMealRecognitionMotion";
import { refreshAndroidSmartReminders } from "../../features/smart-reminders/coordinator";
import { RecognitionFeedbackSheet, type RecognitionFeedbackSheetMode } from "../../components/recognition-feedback-sheet";
import { createRecognitionFeedback, updateRecognitionFeedback } from "../../api/recognition-feedback-api";
import {
  mealItemFromAnalyzedFood,
  snapshotForRecognition,
  withCorrectedItems,
  type RecognitionFeedbackReason,
} from "../../features/recognition-feedback/domain";
import { useRecognitionFeedbackStore } from "../../stores/recognition-feedback-store";

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
  useTranslation();
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
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [ingredientsExpanded, setIngredientsExpanded] = useState(false);
  const [recognitionFeedbackSheetMode, setRecognitionFeedbackSheetMode] =
    useState<RecognitionFeedbackSheetMode | null>(null);
  const [recognitionFeedbackItemAction, setRecognitionFeedbackItemAction] =
    useState<"replace" | "remove" | null>(null);
  const recognitionFeedbackCreateRef = useRef<Promise<string> | null>(null);
  const isDev = process.env.NODE_ENV !== "production";
  const motion = useMealRecognitionMotion(revealOnMount || replayKey > 0, replayKey);
  const bottomAction = useBottomActionReveal(revealOnMount || replayKey > 0, replayKey, motion.phase);
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
    trackAnalytics("vision_result_edited", { edited_fields: ["meal_type"] }, { page_key: "analysis-result" });
    analysisStore.setAnalysis({ ...analysisStore.analysis, mealType });
  };
  const syncRecognitionCorrection = (correctedMeal: typeof meal) => {
    if (!correctedMeal) return;
    trackAnalytics("vision_result_edited", { edited_fields: ["ingredients"] }, { page_key: "analysis-result" });
    if (portion.meal?.id === correctedMeal.id && portion.editingMealId === null) {
      const multiplier = portion.multiplier;
      portion.reset();
      portion.start(correctedMeal);
      portion.setMultiplier(multiplier);
    }
    const state = useRecognitionFeedbackStore.getState();
    const correctedResult = snapshotForRecognition(correctedMeal);
    state.setCorrectedResult(correctedResult);
    if (!state.feedbackId) return;
    void updateRecognitionFeedback(state.feedbackId, {
      mealId: state.mealId,
      correctedResult,
    }).catch(() => undefined);
  };

  const recordRecognitionReason = (reason: RecognitionFeedbackReason, note?: string) => {
    const currentMeal = useAnalysisStore.getState().analysis;
    if (!currentMeal) return;
    const originalResult = snapshotForRecognition(currentMeal);
    useRecognitionFeedbackStore.getState().start({
      analysisId: currentMeal.analysisId ?? null,
      feedbackType: reason.type,
      originalResult,
    });
    const creation = createRecognitionFeedback({
      analysisId: currentMeal.analysisId ?? null,
      feedbackType: reason.type,
      originalResult,
      note: note || null,
    }).then(({ feedbackId }) => {
      const state = useRecognitionFeedbackStore.getState();
      state.setFeedbackId(feedbackId);
      if (state.correctedResult || state.mealId || state.pendingNote) {
        void updateRecognitionFeedback(feedbackId, {
          mealId: state.mealId,
          correctedResult: state.correctedResult,
          note: state.pendingNote,
        }).catch(() => undefined);
      }
      return feedbackId;
    });
    recognitionFeedbackCreateRef.current = creation;
    void creation.catch(() => undefined);
  };

  if (!meal)
    return (
      <PageLayout
        title={t("analysisResult.title")}
        subtitle={t("analysisResult.missingSubtitle")}
        eyebrow={t("analysisResult.eyebrow")}
        showTabs={false}
        leading="‹"
        onLeadingClick={() => navigateBackOrHome("/pages/food-scanner/index")}
      >
        <ErrorState title={t("analysisResult.missingTitle")} description={t("analysisResult.missingDescription")} />
        <AppButton size="large" onClick={() => navigateBackOrHome("/pages/food-scanner/index")}>
          {t("analysisResult.backToScan")}
        </AppButton>
      </PageLayout>
    );
  const portionMultiplier = portion.meal?.id === meal.id && portion.editingMealId === null ? portion.multiplier : 1;
  const adjusted = getAdjustedAnalysis(meal, portionMultiplier);
  const motionSchedule = getMealRecognitionMotionSchedule(adjusted.items.length);
  const isRecognitionMotion = revealOnMount || replayKey > 0;
  const isBaseVisible = !isRecognitionMotion || hasReachedPhase(motion.phase, "baseReveal");
  const isNutritionVisible = !isRecognitionMotion || hasReachedPhase(motion.phase, "nutritionReveal");
  const isMetricsCounting = !isRecognitionMotion || hasReachedPhase(motion.phase, "metricsCount");
  const isContentVisible = !isRecognitionMotion || hasReachedPhase(motion.phase, "contentReveal");
  const shouldAnimateMetrics = isRecognitionMotion && isMetricsCounting;
  const shouldAnimateContentMetrics = isRecognitionMotion && isContentVisible;
  const handleRecognitionReason = (reason: RecognitionFeedbackReason) => {
    if (reason.type === "extra_food" && meal.items.length <= 1) {
      feedback.show({ message: t("analysisResult.keepFood"), tone: "error" });
      return;
    }
    recordRecognitionReason(reason);
    if (reason.type === "wrong_food") {
      setRecognitionFeedbackItemAction("replace");
      setRecognitionFeedbackSheetMode("items");
      return;
    }
    if (reason.type === "missing_food") {
      setRecognitionFeedbackSheetMode("missing");
      return;
    }
    if (reason.type === "extra_food") {
      setRecognitionFeedbackItemAction("remove");
      setRecognitionFeedbackSheetMode("items");
      return;
    }
    if (reason.type === "portion_inaccurate") {
      setRecognitionFeedbackSheetMode(null);
      if (portion.meal?.id !== meal.id || portion.editingMealId !== null) portion.start(meal);
      void Taro.navigateTo({ url: "/pages/portion-adjustment/index?recognitionFeedback=1" });
      return;
    }
    setRecognitionFeedbackSheetMode("other");
  };

  const handleRecognitionItem = (item: (typeof adjusted.items)[number]) => {
    const state = useRecognitionFeedbackStore.getState();
    if (recognitionFeedbackItemAction === "remove") {
      if (meal.items.length <= 1) {
        feedback.show({ message: t("analysisResult.keepFood"), tone: "error" });
        setRecognitionFeedbackSheetMode(null);
        return;
      }
      const nextMeal = withCorrectedItems(meal, meal.items.filter((entry) => entry.id !== item.id));
      analysisStore.setAnalysis(nextMeal);
      setRecognitionFeedbackSheetMode(null);
      state.setSelectionMode(null);
      syncRecognitionCorrection(nextMeal);
      return;
    }
    state.setReplacementItemId(item.id);
    setRecognitionFeedbackSheetMode("replace");
  };

  const handleReplaceFood = async (name: string, quantityG: number) => {
    const currentMeal = useAnalysisStore.getState().analysis;
    const targetId = useRecognitionFeedbackStore.getState().replacementItemId;
    if (!currentMeal || !targetId || !currentMeal.items.some((item) => item.id === targetId)) return false;
    try {
      const result = await analyzeProductMeal([{ name, quantityG }]);
      const analyzedFood = result.items[0];
      const nextItem = analyzedFood
        ? mealItemFromAnalyzedFood({ ...analyzedFood, quantityG }, targetId)
        : null;
      if (!nextItem) return false;
      const nextMeal = withCorrectedItems(currentMeal, currentMeal.items.map((item) => item.id === targetId ? nextItem : item));
      analysisStore.setAnalysis(nextMeal);
      syncRecognitionCorrection(nextMeal);
      return true;
    } catch {
      return false;
    }
  };

  const handleMissingFood = async (name: string, quantityG: number) => {
    try {
      const result = await analyzeProductMeal([{ name, quantityG }]);
      const analyzedFood = result.items[0];
      const nextItem = analyzedFood
        ? mealItemFromAnalyzedFood({ ...analyzedFood, quantityG }, `recognition-manual-${Date.now()}`)
        : null;
      if (!nextItem) return false;
      const currentMeal = useAnalysisStore.getState().analysis;
      if (!currentMeal) return false;
      const nextMeal = withCorrectedItems(currentMeal, [...currentMeal.items, nextItem]);
      analysisStore.setAnalysis(nextMeal);
      syncRecognitionCorrection(nextMeal);
      return true;
    } catch {
      return false;
    }
  };

  const handleMissingSuccess = (name: string, quantityG: number) => {
    setRecognitionFeedbackSheetMode(null);
    feedback.showModal({
      variant: "success",
      presentation: "recognition",
      title: t("analysisResult.addedTitle"),
      description: t("analysisResult.addedDescription", { name, grams: quantityG }),
      primaryText: t("analysisResult.gotIt"),
    });
  };

  const handleReplacementSuccess = (name: string, quantityG: number) => {
    setRecognitionFeedbackSheetMode(null);
    useRecognitionFeedbackStore.getState().setReplacementItemId(null);
    feedback.showModal({
      variant: "success",
      presentation: "recognition",
      title: t("analysisResult.replacedTitle"),
      description: t("analysisResult.replacedDescription", { name, grams: quantityG }),
      primaryText: t("analysisResult.gotIt"),
    });
  };

  const handleNutritionAction = (action: "portion" | "food") => {
    setRecognitionFeedbackSheetMode(null);
    if (action === "portion") {
      if (portion.meal?.id !== meal.id || portion.editingMealId !== null) portion.start(meal);
      void Taro.navigateTo({ url: "/pages/portion-adjustment/index?recognitionFeedback=1" });
      return;
    }
    const firstItem = adjusted.items[0];
    if (firstItem) {
      useRecognitionFeedbackStore.getState().setReplacementItemId(firstItem.id);
      setRecognitionFeedbackSheetMode("replace");
    }
  };

  const handleOtherNote = async (note: string) => {
    const state = useRecognitionFeedbackStore.getState();
    try {
      const feedbackId = state.feedbackId ?? await recognitionFeedbackCreateRef.current;
      if (!feedbackId) return false;
      if (note) await updateRecognitionFeedback(feedbackId, { note });
    } catch {
      return false;
    }
    setRecognitionFeedbackSheetMode(null);
    feedback.showModal({
      variant: "success",
      presentation: "recognition",
      title: t("analysisResult.feedbackSubmitted"),
      description: note
        ? t("analysisResult.feedbackNote", { note })
        : t("analysisResult.feedbackOther"),
      primaryText: t("analysisResult.gotIt"),
    });
    return true;
  };

  const save = async () => {
    const localMeal = {
      date: getLocalDateString(),
      time: nowTime(),
      title: meal.title,
      mealType: meal.mealType,
      portionMultiplier,
      favorite: false,
      imageKey: meal.imageKey,
      // Only durable refs — local wxfile preview is not restorable after save.
      imageUrl: meal.imagePath || meal.imageUrl || null,
      items: adjusted.items,
      insight: meal.insight,
    };
    const previousCalories = meals.getDailySummary(localMeal.date).consumed.calories;
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
      const recognitionState = useRecognitionFeedbackStore.getState();
      const correctedResult = snapshotForRecognition(saved);
      recognitionState.setMealId(saved.id);
      recognitionState.setCorrectedResult(correctedResult);
      if (recognitionState.feedbackId) {
        void updateRecognitionFeedback(recognitionState.feedbackId, {
          mealId: saved.id,
          correctedResult,
        }).catch(() => undefined);
      }
      const syncedMeals = await getProductMeals(localMeal.date);
      meals.replaceRemoteMeals(syncedMeals, localMeal.date);
      void refreshAndroidSmartReminders();
      useMealSavedCelebrationStore.getState().show(
        toMealSavedCelebration({
          savedMeal: saved,
          previousCalories,
          syncedMeals,
          targetCalories: meals.dailyTargets.calories,
          afterContinue: async () => Boolean(await tryPresentPendingMilestone("normal_record_success")),
        }),
      );
      try {
        const { evaluateProductAchievements } = await import("../../features/coach/refresh-achievements");
        await evaluateProductAchievements(localMeal.date);
      } catch {
        // The saved meal remains valid if achievement refresh is temporarily unavailable.
      }
    } catch {
      feedback.show({ message: t("analysisResult.saveFailed"), tone: "error" });
    }
  };
  const evaluation = meal.evaluation || t("analysisResult.defaultEvaluation");
  const heroImage = scanner.previewPath ?? imageByKey[meal.imageKey];
  const previewImage = () => Taro.previewImage({ current: heroImage, urls: [heroImage] });
  const exitConfirmDialog = (
    <ConfirmDialog
      open={exitConfirmOpen}
      title={t("analysisResult.discardQuestion")}
      description={t("analysisResult.discardDescription")}
      confirmLabel={t("analysisResult.discard")}
      cancelLabel={t("analysisResult.continueAnalysis")}
      onCancel={() => setExitConfirmOpen(false)}
      onConfirm={() => {
        setExitConfirmOpen(false);
        Taro.navigateBack();
      }}
    />
  );
  return (
    <PageLayout
      title={evaluation}
      showTabs={false}
      hideNavigation
      showBack
      scrollLocked={exitConfirmOpen}
      onTopBarBack={() => setExitConfirmOpen(true)}
      overlay={exitConfirmDialog}
      className="page-layout--analysis-result"
    >
      <View
        className="analysis-result-page"
        data-recognition-reveal={isRecognitionMotion ? "true" : undefined}
        data-motion-phase={motion.isRevealing ? motion.phase : undefined}
        data-base-revealed={isBaseVisible ? "true" : undefined}
        data-nutrition-revealed={isNutritionVisible ? "true" : undefined}
        data-content-revealed={isContentVisible ? "true" : undefined}
        data-bottom-revealed={bottomAction.phase === "complete" ? "true" : undefined}
      >
        <View className="analysis-result-page__header" data-motion-layer="base">
          <View className="analysis-result-page__heading">
            <Text className="analysis-result-page__title">{evaluation}</Text>
            <Text className="analysis-result-page__subtitle">
              {t("analysisResult.completedSubtitle")}
            </Text>
          </View>
          <View className="analysis-result-page__ai-status">
            <NordicIcon name="check" size={22} ariaLabel={t("analysisResult.completed")} />
            <Text>{t("analysisResult.completed")}</Text>
          </View>
        </View>

        <AppCard tone="beige" className="analysis-result-page__summary" motionLayer="base">
          <View
            className="analysis-result-page__summary-visual"
            ariaLabel={t("analysisResult.viewOriginal")}
            onClick={previewImage}
          >
            <Image className="analysis-result-page__summary-image" src={heroImage} mode="aspectFill" />
            <View className="analysis-result-page__summary-scrim" />
            <View className="analysis-result-page__summary-hero-copy">
              <Text className="analysis-result-page__summary-title">{meal.title}</Text>
              <Text className="analysis-result-page__summary-caption">{t("analysisResult.photoCaption")}</Text>
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
                  <NordicIcon name="check" size={14} ariaLabel={t("analysisResult.confidence")} />
                </View>
                <View className="analysis-result-page__confidence-copy">
                  <Text className="analysis-result-page__confidence-value">{meal.confidence}%</Text>
                  <Text className="analysis-result-page__confidence-label">{t("analysisResult.confidence")}</Text>
                </View>
              </View>
              {(meal.nutritionSource === "usda" || meal.nutritionSource === "mixed") && (
                <>
                  <View className="analysis-result-page__confidence-divider" />
                  <View className="analysis-result-page__confidence-source">
                    <Text className="analysis-result-page__confidence-source-label">{t("analysisResult.nutritionData")}</Text>
                    <Text className="analysis-result-page__confidence-source-value">
                      {meal.nutritionSource === "usda" ? "USDA" : t("analysisResult.partialUsda")}
                    </Text>
                  </View>
                </>
              )}
              <View
                className="analysis-result-page__recognition-feedback-link"
                ariaLabel={t("analysisResult.correctRecognition")}
                onClick={() => setRecognitionFeedbackSheetMode("reasons")}
              >
                <NordicIcon name="pencil" size={16} ariaLabel={t("analysisResult.correct")} />
                <Text>{t("analysisResult.notAccurate")}</Text>
              </View>
            </View>
            <View className="analysis-result-page__meal-type-block">
              <Text className="analysis-result-page__meal-type-label">{t("analysisResult.mealTypeQuestion")}</Text>
              <View className="analysis-result-page__meal-types" ariaLabel={t("analysisResult.chooseMealType")}>
                {mealTypeOptions.map((option) => (
                  <View
                    key={option.value}
                    className={`analysis-result-page__meal-type ${
                      meal.mealType === option.value ? "analysis-result-page__meal-type--active" : ""
                    }`}
                    ariaLabel={t(`meals.${option.value}`)}
                    onClick={() => setMealType(option.value)}
                  >
                    <Text>{t(`meals.${option.value}`)}</Text>
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
            label={t("analysisResult.mealScore")}
            tone="score"
            reveal={isRecognitionMotion ? isMetricsCounting : true}
            revealDurationMs={mealRecognitionMotionConfig.countDurationMs}
            animateValue={isRecognitionMotion}
          />
          <View className="analysis-result-page__score-copy">
            <Text className="analysis-result-page__score-grade">{t("analysisResult.scoreGrade", { grade: adjusted.score })}</Text>
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
                suffix={`g ${t("nutrition.protein")}`}
                enabled={shouldAnimateMetrics}
                holdAtZero={isRecognitionMotion}
              />
              <RecognitionCountedText
                className="nutrition-tag nutrition-tag--carbs"
                target={adjusted.carbs}
                suffix={`g ${t("nutrition.carbs")}`}
                enabled={shouldAnimateMetrics}
                holdAtZero={isRecognitionMotion}
                delayMs={mealRecognitionMotionConfig.macroStaggerMs}
              />
              <RecognitionCountedText
                className="nutrition-tag nutrition-tag--fat"
                target={adjusted.fat}
                suffix={`g ${t("nutrition.fat")}`}
                enabled={shouldAnimateMetrics}
                holdAtZero={isRecognitionMotion}
                delayMs={mealRecognitionMotionConfig.macroStaggerMs * 2}
              />
            </View>
          </View>
        </AppCard>

        <AppCard className="analysis-result-page__ingredients" motionLayer="content">
          <View
            className="analysis-result-page__ingredients-heading"
            ariaLabel={t(ingredientsExpanded ? "analysisResult.collapseIngredients" : "analysisResult.expandIngredients")}
            onClick={() => setIngredientsExpanded((current) => !current)}
          >
            <Text className="analysis-result-page__section-title">{t("analysisResult.ingredients")}</Text>
            <View className="analysis-result-page__ingredients-toggle">
              <Text>{t(ingredientsExpanded ? "analysisResult.collapse" : "analysisResult.expand")}</Text>
              <View
                className={
                  ingredientsExpanded
                    ? "analysis-result-page__ingredients-toggle-icon analysis-result-page__ingredients-toggle-icon--expanded"
                    : "analysis-result-page__ingredients-toggle-icon"
                }
              >
                <NordicIcon
                  name="chevron-right"
                  size={14}
                  ariaLabel={t(ingredientsExpanded ? "analysisResult.collapse" : "analysisResult.expand")}
                />
              </View>
            </View>
          </View>
          {ingredientsExpanded
            ? adjusted.items.map((item, index) => (
                <View
                  className={
                    isContentVisible
                      ? "analysis-ingredient analysis-ingredient--revealed"
                      : "analysis-ingredient"
                  }
                  key={item.id}
                  style={{
                    transitionDelay: `${motionSchedule.ingredientDelaysMs[index] ?? 0}ms`,
                  }}
                >
                  <Text>{item.name}</Text>
                  <Text>
                    {item.amount} · {item.calories} kcal
                  </Text>
                </View>
              ))
            : null}
          <View className="analysis-result-page__macro-list">
            <RecognitionMacroProgress
              label={t("nutrition.protein")}
              value={adjusted.protein}
              target={60}
              enabled={shouldAnimateContentMetrics}
              holdAtZero={isRecognitionMotion}
              delayMs={motionSchedule.macroDelaysMs[0] ?? 0}
            />
            <RecognitionMacroProgress
              label={t("nutrition.carbs")}
              value={adjusted.carbs}
              target={90}
              tone="carbs"
              enabled={shouldAnimateContentMetrics}
              holdAtZero={isRecognitionMotion}
              delayMs={motionSchedule.macroDelaysMs[1] ?? 0}
            />
            <RecognitionMacroProgress
              label={t("nutrition.fat")}
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
          actionLabel={t("analysisResult.viewRecords")}
          onActionClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
        />
        <View
          id="meal-bottom-action"
          className="analysis-result-page__bottom-bar"
          data-motion-layer="bottom"
          animation={bottomAction.animation}
        >
          <View animation={bottomAction.disclaimerAnimation}>
            <Text className="nutrition-disclaimer">
              {t("analysisResult.disclaimer")}
            </Text>
          </View>
          <View className="analysis-result-page__actions">
            <View className="analysis-result-page__action-motion" animation={bottomAction.adjustButtonAnimation}>
              <AppButton
                variant="outline"
                size="large"
                disabled={!bottomAction.isAdjustInteractive}
                onClick={() => {
                  if (portion.meal?.id !== meal.id || portion.editingMealId !== null) portion.start(meal);
                  Taro.navigateTo({ url: "/pages/portion-adjustment/index" });
                }}
              >
                {t("analysisResult.adjustPortion")}
              </AppButton>
            </View>
            <View className="analysis-result-page__action-motion" animation={bottomAction.saveButtonAnimation}>
              <AppButton size="large" disabled={!bottomAction.isSaveInteractive} onClick={() => void save()}>
                {t("analysisResult.saveMeal")}
              </AppButton>
            </View>
          </View>
        </View>
      </View>
      <RecognitionFeedbackSheet
        open={recognitionFeedbackSheetMode !== null}
        mode={recognitionFeedbackSheetMode ?? "reasons"}
        items={adjusted.items}
        itemAction={recognitionFeedbackItemAction}
        canRemoveItems={adjusted.items.length > 1}
        onDismiss={() => setRecognitionFeedbackSheetMode(null)}
        onSelectReason={handleRecognitionReason}
        onSelectItem={handleRecognitionItem}
        onSelectNutrition={handleNutritionAction}
        onSubmitMissing={handleMissingFood}
        onMissingSuccess={handleMissingSuccess}
        onSubmitReplace={handleReplaceFood}
        onReplacementSuccess={handleReplacementSuccess}
        onSubmitOther={handleOtherNote}
      />
    </PageLayout>
  );
}
