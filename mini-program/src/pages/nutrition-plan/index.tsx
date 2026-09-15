import { Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { BottomActionLayout } from "../../components/bottom-action-layout";
import { CircularProgress } from "../../components/circular-progress";
import { EmptyState } from "../../components/empty-state";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { OnboardingHeader } from "../../components/onboarding-header";
import { PlanSaveTransitionOverlay } from "../../components/plan-save-transition-overlay";
import {
  calculateNutritionPlan,
  getLocalDateString,
  macroEnergyPercents,
  validateBodyProfile,
} from "../../features/onboarding/domain";
import { formulaPlanInsight } from "../../features/onboarding/diet-preference-labels";
import {
  isSettingsEditMode,
  settingsQuery,
} from "../../features/onboarding/hydrate-draft-from-account";
import { PageLayout } from "../../layouts/page-layout";
import { navigateBackOrHome } from "../../utils/navigation";
import {
  completeProductOnboarding,
  previewProductNutritionPlan,
  saveProductBodyProfile,
  saveProductGoal,
  saveProductNutritionPlan,
  saveProductSettings,
} from "../../api/product-data-api";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useOnboardingDraftStore } from "../../stores/onboarding-draft-store";
import { useProfileStore } from "../../stores/profile-store";
import { useMealStore } from "../../stores/meal-store";
import { usePlanRegenerationStore } from "../../stores/plan-regeneration-store";
import { usePlanSaveTransitionStore } from "../../stores/plan-save-transition-store";
import { planReadyMotion } from "../../features/onboarding/plan-regeneration-motion";
import { markOnboardingCompleted } from "../../utils/local-experience";
import { clearQueuedOnboardingDraftSync } from "../../features/onboarding/onboarding-draft-cloud-sync";

const today = getLocalDateString();
const planSaveSuccessDurationMs = 200;
const planSaveCoverDurationMs = 200;
const goalLabels = {
  muscle_gain: "增益增肌",
  fat_loss: "轻盈减脂",
  maintenance: "保持状态",
  performance: "健康饮食",
};

type PlanView = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  insight: string;
  source: string;
};

export default function NutritionPlanPage() {
  const router = useRouter();
  const fromSettings = isSettingsEditMode(router.params);
  const { draft } = useOnboardingDraftStore();
  const feedback = useFeedbackStore();
  const saveTransitionPhase = usePlanSaveTransitionStore((state) => state.phase);
  const saveTransitionActive = usePlanSaveTransitionStore((state) => state.handoffActive);
  const beginSaveSuccess = usePlanSaveTransitionStore((state) => state.succeed);
  const coverSaveTransition = usePlanSaveTransitionStore((state) => state.cover);
  const [isSaving, setIsSaving] = useState(false);
  const regenerated = router.params.regenerated === "1";
  const initialTransition = router.params.initial === "1";
  const planReadyTransition = regenerated || initialTransition;
  const regenerationPreview = usePlanRegenerationStore((state) => state.preview);
  // The regeneration store deliberately clears its preview once entrance finishes.
  // Keep this route's copy stable so that cleanup cannot trigger a second plan request.
  const [transitionPreview] = useState(() => planReadyTransition ? regenerationPreview : null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(() => !(planReadyTransition && transitionPreview));
  const revealRegeneration = usePlanRegenerationStore((state) => state.reveal);
  const finishRegeneration = usePlanRegenerationStore((state) => state.finish);
  const [plan, setPlan] = useState<PlanView | null>(() => planReadyTransition && transitionPreview ? {
    calories: transitionPreview.calories, proteinG: transitionPreview.proteinG,
    carbsG: transitionPreview.carbsG, fatG: transitionPreview.fatG,
    insight: transitionPreview.insight?.trim() || "", source: transitionPreview.source || "deepseek",
  } : null);
  const [initialRevealStarted, setInitialRevealStarted] = useState(false);
  const [animatedCalories, setAnimatedCalories] = useState(0);
  const initialPlanEntry = initialTransition;
  const initialRevealRequested = initialPlanEntry && Boolean(plan) && !isLoadingPlan;
  const shouldAnimatePlanReady = regenerated || initialRevealStarted;
  const shouldPreparePlanReady = regenerated || initialRevealRequested;
  const validation = validateBodyProfile(draft, today);

  useEffect(() => {
    if (!initialRevealRequested) {
      setInitialRevealStarted(false);
      return;
    }
    const revealTimer = setTimeout(() => setInitialRevealStarted(true), 80);
    return () => clearTimeout(revealTimer);
  }, [initialRevealRequested]);

  useEffect(() => {
    if (!initialPlanEntry || !initialRevealStarted || !plan) {
      if (!initialPlanEntry && plan) setAnimatedCalories(plan.calories);
      return;
    }
    let frame = 0;
    const target = plan.calories;
    const startedAt = Date.now() + planReadyMotion.calorieDelayMs;
    const easeOutQuart = (value: number) => 1 - Math.pow(1 - value, 4);
    const animate = () => {
      const progress = Math.min(1, Math.max(0, (Date.now() - startedAt) / planReadyMotion.calorieDurationMs));
      setAnimatedCalories(Math.round(target * easeOutQuart(progress)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [initialPlanEntry, initialRevealStarted, plan]);

  useEffect(() => {
    if (planReadyTransition && transitionPreview) {
      setIsLoadingPlan(false);
      revealRegeneration();
      const finishTimer = setTimeout(finishRegeneration, planReadyMotion.enterDurationMs);
      return () => {
        clearTimeout(finishTimer);
      };
    }
    if (!validation.valid || !validation.profile) {
      setIsLoadingPlan(false);
      return;
    }
    const profile = validation.profile;
    const dietPrefs = {
      dietaryPattern: draft.dietaryPattern,
      foodAvoidances: draft.foodAvoidances,
      mealsPerDay: draft.mealsPerDay,
    };
    const localFallback = (): PlanView => {
      const formula = calculateNutritionPlan(profile, dietPrefs);
      return {
        calories: formula.calories,
        proteinG: formula.proteinG,
        carbsG: formula.carbsG,
        fatG: formula.fatG,
        insight: formulaPlanInsight(dietPrefs),
        source: "formula",
      };
    };

    let cancelled = false;
    setIsLoadingPlan(true);
    void (async () => {
      try {
        const preview = await previewProductNutritionPlan({
          age: profile.age,
          sex: profile.gender,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          activityLevel: profile.activityLevel,
          trainingDays: profile.trainingDays,
          goalType: profile.goalType,
          dietaryPattern: draft.dietaryPattern,
          foodAvoidances: draft.foodAvoidances,
          mealsPerDay: Number(draft.mealsPerDay),
        });
        if (cancelled) return;
        setPlan({
          calories: preview.calories,
          proteinG: preview.proteinG,
          carbsG: preview.carbsG,
          fatG: preview.fatG,
          insight: preview.insight?.trim() || formulaPlanInsight(dietPrefs),
          source: preview.source || "deepseek",
        });
      } catch {
        if (!cancelled) setPlan(localFallback());
      } finally {
        if (!cancelled) setIsLoadingPlan(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    planReadyTransition, transitionPreview, revealRegeneration, finishRegeneration,
    validation.valid,
    draft.nickname,
    draft.age,
    draft.gender,
    draft.heightCm,
    draft.weightKg,
    draft.activityLevel,
    draft.goalType,
    draft.dietaryPattern,
    draft.foodAvoidances.join(","),
    draft.mealsPerDay,
  ]);

  const leaveToBody = () => {
    navigateBackOrHome("/pages/body-profile/index" + settingsQuery(fromSettings));
  };

  const leaveToDiet = () => {
    navigateBackOrHome("/pages/diet-preferences/index" + settingsQuery(fromSettings));
  };

  if (!validation.valid || !validation.profile) {
    return (
      <PageLayout
        title="营养计划"
        subtitle="先完成身体资料，才能生成更贴近你的本地预览。"
        eyebrow="计划预览"
        showTabs={false}
        leading="‹"
        onLeadingClick={leaveToBody}
      >
        <EmptyState title="还差一点资料" description="返回补全身体数据后，就能看到每日营养目标。" />
        <AppButton size="large" onClick={leaveToBody}>
          返回调整资料
        </AppButton>
      </PageLayout>
    );
  }

  const profile = validation.profile;
  const activePlan = plan ?? {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    insight: "正在根据你的身体数据计算营养目标…",
    source: "loading",
  };
  const percents = macroEnergyPercents(activePlan);

  const saveSettingsPlan = async () => {
    if (!plan) return;
    setIsSaving(true);
    try {
      const currentSettings = useProfileStore.getState().settings;
      const goalType = profile.goalType === "maintenance" ? "maintain" : profile.goalType;
      await saveProductBodyProfile({
        age: profile.age,
        birthDate: null,
        sex: profile.gender,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        trainingDays: profile.trainingDays,
      });
      await saveProductGoal({
        goalType,
        targetWeightKg: profile.targetWeightKg,
        targetCaloriesKcal: plan.calories,
        targetDate: profile.targetDate,
      });
      await saveProductSettings({
        dietaryPattern: draft.dietaryPattern,
        foodAvoidances: draft.foodAvoidances,
        mealsPerDay: Number(draft.mealsPerDay),
        theme: currentSettings.theme,
        language: currentSettings.language,
        notification: currentSettings.notification,
        unit: currentSettings.unit,
      });
      await saveProductNutritionPlan({
        calories: plan.calories,
        proteinG: plan.proteinG,
        carbsG: plan.carbsG,
        fatG: plan.fatG,
      });
      clearQueuedOnboardingDraftSync();
      useOnboardingDraftStore.getState().reset();
      useProfileStore.getState().setProfile({
        nickname: profile.nickname,
        weight: profile.weightKg,
        targetCalories: plan.calories,
        goalLabel: goalLabels[profile.goalType],
      });
      useProfileStore.getState().setSetting("dietaryPattern", draft.dietaryPattern);
      useProfileStore.getState().setSetting("foodAvoidances", draft.foodAvoidances);
      useProfileStore.getState().setSetting("mealsPerDay", Number(draft.mealsPerDay));
      await Taro.switchTab({ url: "/pages/profile/index" });
    } catch (error) {
      feedback.showModal({
        variant: "error",
        title: "资料保存失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
        primaryText: "知道了",
        dismissible: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const completeOnboarding = async () => {
    if (!plan) return;
    setIsSaving(true);
    try {
      await completeProductOnboarding({
        nickname: profile.nickname,
        goalType: profile.goalType === "maintenance" ? "maintain" : profile.goalType,
        targetWeightKg: profile.targetWeightKg,
        targetDate: profile.targetDate,
        age: profile.age,
        sex: profile.gender,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        trainingDays: profile.trainingDays,
        dietaryPattern: draft.dietaryPattern,
        foodAvoidances: draft.foodAvoidances,
        mealsPerDay: Number(draft.mealsPerDay),
        calories: plan.calories,
        proteinG: plan.proteinG,
        carbsG: plan.carbsG,
        fatG: plan.fatG,
      });
      useProfileStore.getState().setProfile({
        nickname: profile.nickname,
        weight: profile.weightKg,
        targetCalories: plan.calories,
        goalLabel: goalLabels[profile.goalType],
      });
      useMealStore.getState().setDailyTargets({
        calories: plan.calories,
        protein: plan.proteinG,
        carbs: plan.carbsG,
        fat: plan.fatG,
      });
      markOnboardingCompleted();
      beginSaveSuccess();
      await new Promise<void>((resolve) => setTimeout(resolve, planSaveSuccessDurationMs));
      coverSaveTransition();
      await new Promise<void>((resolve) => setTimeout(resolve, planSaveCoverDurationMs));
      try {
        const { refreshProductAchievements } = await import("../../features/coach/refresh-achievements");
        void refreshProductAchievements();
      } catch (error) {
        console.warn("[achievements] onboarding refresh failed", error);
      }
      await Taro.switchTab({ url: "/pages/home/index" });
    } catch (error) {
      feedback.show({
        message: error instanceof Error ? error.message : "计划保存失败，请稍后重试",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const macros: Array<{
    label: string;
    value: number;
    percent: number;
    icon: NordicIconName;
    tone: "forest" | "sage" | "amber";
  }> = [
    { label: "蛋白质", value: activePlan.proteinG, percent: percents.proteinPct, icon: "protein", tone: "forest" },
    { label: "碳水", value: activePlan.carbsG, percent: percents.carbsPct, icon: "carbs", tone: "sage" },
    { label: "脂肪", value: activePlan.fatG, percent: percents.fatPct, icon: "fat", tone: "amber" },
  ];

  return (
    <PageLayout
      title="NOVA AI"
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      disablePageEnterAnimation={shouldPreparePlanReady}
      className={`page-layout--onboarding page-layout--nutrition-plan ${
        shouldPreparePlanReady ? "page-layout--nutrition-plan-animated" : ""
      }`}
    >
      <View className={`nutrition-plan-page ${process.env.TARO_APP_PLATFORM === "android" ? "nutrition-plan-page--android" : ""} ${
        shouldPreparePlanReady ? "nutrition-plan-page--entering" : ""
      } ${regenerated ? "nutrition-plan-page--regenerated" : ""} ${
        initialPlanEntry && shouldAnimatePlanReady
          ? "nutrition-plan-page--initial-entering"
          : ""
      } ${
        initialRevealRequested && !initialRevealStarted
          ? "nutrition-plan-page--initial-pending"
          : ""
      }`}>
        <View className="nutrition-plan__sticky-header">
          <OnboardingHeader
            brand="Nordic Nutri AI"
            step={fromSettings ? "更新计划" : "第 4 步，共 4 步"}
            progress={1}
            progressAriaLabel={fromSettings ? "确认更新后的营养计划" : "当前为第 4 步，共 4 步"}
            backAriaLabel="返回饮食偏好与限制"
            onBack={leaveToDiet}
          />
        </View>

        <AppCard className={`nutrition-plan__plan-ready ${
          shouldPreparePlanReady ? "nutrition-plan__reveal-item nutrition-plan__reveal-item--ready" : ""
        }`}>
          <View className="nutrition-plan__plan-ready-icon">
            <NordicIcon name="celebration" size={28} ariaLabel="计划已生成" />
          </View>
          <Text className="nutrition-plan__plan-ready-title">
            {fromSettings ? "新的计划已准备好" : "你的计划已准备好"}
          </Text>
          <Text className="nutrition-plan__plan-ready-copy">
            {fromSettings
              ? "确认后将更新你的每日营养目标。"
              : "从今天开始，按自己的节奏稳步前进。"}
          </Text>
        </AppCard>

        <View className={`nutrition-plan__insight ${
          shouldPreparePlanReady ? "nutrition-plan__reveal-item nutrition-plan__reveal-item--insight" : ""
        }`}>
          <Text className="nutrition-plan__insight-label">营养洞察</Text>
          <Text className="nutrition-plan__insight-copy">{activePlan.insight}</Text>
        </View>

        <View className={`nutrition-plan__section ${
          shouldPreparePlanReady ? "nutrition-plan__reveal-item nutrition-plan__reveal-item--targets" : ""
        }`}>
          <Text className="nutrition-plan__section-title">每日目标</Text>
          <AppCard tone="beige" className="nutrition-plan__targets-card">
            <View className="nutrition-plan__calorie-row">
              <View>
                <Text className="nutrition-plan__calorie-label">热量</Text>
                <Text className="nutrition-plan__calorie-value">
                  {isLoadingPlan ? "…" : initialPlanEntry ? animatedCalories : activePlan.calories}
                  <Text className="nutrition-plan__calorie-unit"> kcal</Text>
                </Text>
              </View>
              <View className="nutrition-plan__calorie-icon">
                <NordicIcon name="flame" size={24} ariaLabel="热量" />
              </View>
            </View>
            <View className="nutrition-plan__targets-divider" />
            <View className="nutrition-plan__macro-rings">
              {macros.map((macro) => (
                <View className="nutrition-plan__macro-ring" key={macro.label}>
                  <View className="nutrition-plan__macro-icon">
                    <NordicIcon name={macro.icon} size={16} ariaLabel={macro.label} />
                  </View>
                  <CircularProgress
                    value={macro.percent}
                    total={100}
                    label={macro.label}
                    compact
                    tone={macro.tone}
                    empty
                    detail={`${macro.value}g`}
                  />
                </View>
              ))}
            </View>
          </AppCard>
        </View>

        <View className={`nutrition-plan__section ${
          shouldPreparePlanReady ? "nutrition-plan__reveal-item nutrition-plan__reveal-item--milestones" : ""
        }`}>
          <Text className="nutrition-plan__section-title">第一阶段里程碑</Text>
          <AppCard className="nutrition-plan__milestone-list">
            <View className="nutrition-plan__milestone-row">
              <View className="nutrition-plan__milestone-icon">
                <NordicIcon name="milestone" size={20} ariaLabel="记录里程碑" />
              </View>
              <View className="nutrition-plan__milestone-copy">
                <Text className="nutrition-plan__milestone-title">连续记录 7 天</Text>
                <Text className="nutrition-plan__milestone-description">建立属于你的稳定节奏</Text>
              </View>
            </View>
            <View className="nutrition-plan__milestone-row">
              <View className="nutrition-plan__milestone-icon">
                <NordicIcon name="check" size={20} ariaLabel="营养里程碑" />
              </View>
              <View className="nutrition-plan__milestone-copy">
                <Text className="nutrition-plan__milestone-title">完成每日三项营养目标</Text>
                <Text className="nutrition-plan__milestone-description">
                  先专注蛋白质、碳水和脂肪的均衡摄入
                </Text>
              </View>
            </View>
          </AppCard>
        </View>

        <BottomActionLayout
          className={shouldPreparePlanReady ? "nutrition-plan__regenerated-actions nutrition-plan__reveal-item nutrition-plan__reveal-item--actions" : undefined}
        >
          <AppButton
            size="large"
            loading={isSaving || isLoadingPlan}
            disabled={!plan || isLoadingPlan}
            onClick={() => void (fromSettings ? saveSettingsPlan() : completeOnboarding())}
          >
            {fromSettings ? "保存并更新目标" : "开始我的计划"}
          </AppButton>
          <AppButton variant="outline" size="large" onClick={leaveToDiet}>
            调整计划参数
          </AppButton>
        </BottomActionLayout>
      </View>
      <PlanSaveTransitionOverlay
        visible={saveTransitionActive}
        phase={saveTransitionPhase === "idle" ? "success" : saveTransitionPhase}
      />
    </PageLayout>
  );
}
