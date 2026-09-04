import { Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getProductAccount, previewProductNutritionPlan } from "../../api/product-data-api";
import { AppButton } from "../../components/app-button";
import { BottomActionLayout } from "../../components/bottom-action-layout";
import { NordicIcon } from "../../components/nordic-icon";
import { OnboardingHeader } from "../../components/onboarding-header";
import { PlanTransitionOverlay, type PlanTransitionOverlayPhase } from "../../components/plan-transition-overlay";
import {
  dietaryPatternOptions,
  foodAvoidanceOptions,
  mealCountOptions,
} from "../../features/onboarding/diet-preferences-config";
import { getLocalDateString, type FoodAvoidance, validateBodyProfile } from "../../features/onboarding/domain";
import { minimumPlanProcessingMs, planReadyMotion, stitchInitialProcessingMotion, withPlanGenerationTimeout } from "../../features/onboarding/plan-regeneration-motion";
import {
  draftPatchFromAccount,
  isSettingsEditMode,
  settingsQuery, shouldHydrateFromAccount,
} from "../../features/onboarding/hydrate-draft-from-account";
import { PageLayout } from "../../layouts/page-layout";
import { useOnboardingDraftStore } from "../../stores/onboarding-draft-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { usePlanRegenerationStore } from "../../stores/plan-regeneration-store";
import { navigateBackOrHome } from "../../utils/navigation";
import { queueOnboardingDraftSync } from "../../features/onboarding/onboarding-draft-cloud-sync";

export default function DietPreferencesPage() {
  const router = useRouter();
  const fromSettings = isSettingsEditMode(router.params);
  const hydrateFromAccount = shouldHydrateFromAccount(router.params);
  const { draft, setField, setDraft } = useOnboardingDraftStore();
  const feedback = useFeedbackStore();
  const regenerationState = usePlanRegenerationStore((state) => state.state);
  const startRegeneration = usePlanRegenerationStore((state) => state.start);
  const completeRegeneration = usePlanRegenerationStore((state) => state.succeed);
  const navigateRegeneration = usePlanRegenerationStore((state) => state.navigate);
  const failRegeneration = usePlanRegenerationStore((state) => state.fail);
  const resetRegeneration = usePlanRegenerationStore((state) => state.reset);
  const [showProcessingOverlay, setShowProcessingOverlay] = useState(false);
  const processing = regenerationState === "processing";
  const initialButtonLoading = !fromSettings && processing && !showProcessingOverlay;
  const overlayVisible = showProcessingOverlay && (regenerationState === "processing" || regenerationState === "completing" || regenerationState === "navigating");
  const overlayPhase: PlanTransitionOverlayPhase = regenerationState === "completing"
    ? "completing"
    : "processing";
  const initialProcessing = !fromSettings && overlayVisible;

  useEffect(() => {
    if (!fromSettings) queueOnboardingDraftSync(draft);
  }, [draft, fromSettings]);

  useEffect(() => {
    // A previous interrupted request must never leave this page's CTA locked.
    if (regenerationState === "processing" || regenerationState === "completing" || regenerationState === "navigating") {
      resetRegeneration();
      setShowProcessingOverlay(false);
    }
  }, [fromSettings]);

  useEffect(() => {
    if (!hydrateFromAccount) return;
    let cancelled = false;
    void getProductAccount()
      .then((account) => {
        if (!cancelled) setDraft(draftPatchFromAccount(account));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hydrateFromAccount, setDraft]);

  const toggleAvoidance = (value: FoodAvoidance) => {
    const selected = draft.foodAvoidances.includes(value);
    setField(
      "foodAvoidances",
      selected
        ? draft.foodAvoidances.filter((item) => item !== value)
        : [...draft.foodAvoidances, value],
    );
  };

  const leaveBack = () => {
    if (fromSettings) {
      void Taro.navigateBack({
        fail: () => {
          void Taro.switchTab({ url: "/pages/profile/index" });
        },
      });
      return;
    }
    navigateBackOrHome("/pages/body-profile/index");
  };

  const regeneratePlan = async () => {
    const validation = validateBodyProfile(draft, getLocalDateString());
    if (!validation.valid || !validation.profile || !startRegeneration()) return;
    const profile = validation.profile;
    try {
      const previewRequest = withPlanGenerationTimeout(previewProductNutritionPlan({
        age: profile.age, sex: profile.gender, heightCm: profile.heightCm, weightKg: profile.weightKg,
        activityLevel: profile.activityLevel, trainingDays: profile.trainingDays, goalType: profile.goalType,
        dietaryPattern: draft.dietaryPattern, foodAvoidances: draft.foodAvoidances, mealsPerDay: Number(draft.mealsPerDay),
      }));
      if (!fromSettings) {
        await new Promise<void>((resolve) => setTimeout(resolve, stitchInitialProcessingMotion.buttonPressMs));
        await new Promise<void>((resolve) => setTimeout(resolve, stitchInitialProcessingMotion.acknowledgementMs));
      }
      setShowProcessingOverlay(true);
      const [preview] = await Promise.all([
        previewRequest,
        new Promise<void>((resolve) => setTimeout(resolve, minimumPlanProcessingMs)),
      ]);
      completeRegeneration(preview);
      await new Promise<void>((resolve) => setTimeout(resolve, planReadyMotion.completingDurationMs));
      navigateRegeneration();
      await Taro.navigateTo({
        url: fromSettings
          ? "/pages/nutrition-plan/index" + settingsQuery(true) + "&regenerated=1"
          : "/pages/nutrition-plan/index?initial=1",
        animationType: "none",
        animationDuration: 0,
      } as Parameters<typeof Taro.navigateTo>[0] & { animationType: "none"; animationDuration: number });
    } catch (error) {
      setShowProcessingOverlay(false);
      failRegeneration();
      feedback.show({ message: error instanceof Error ? error.message : "营养计划计算失败，请稍后重试", tone: "error" });
      await new Promise<void>((resolve) => setTimeout(resolve, 180));
      resetRegeneration();
    }
  };

  return (
    <PageLayout
      title="饮食偏好与限制"
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--onboarding"
    >
      <View className={`diet-preferences-page ${
        initialProcessing ? "diet-preferences-page--initial-processing" : ""
      }`}>
        <View className="diet-preferences-page__source">
          <View className="onboarding-sticky-header">
            <OnboardingHeader
              brand="Nordic Nutri AI"
              step={fromSettings ? "调整偏好" : "第 3 步，共 4 步"}
              progress={fromSettings ? 2 / 3 : 0.75}
              progressAriaLabel={fromSettings ? "调整饮食偏好" : "当前为第 3 步，共 4 步"}
              backAriaLabel={fromSettings ? "返回上一页" : "返回身体资料"}
              onBack={leaveBack}
            />
          </View>

          <View className="onboarding-heading diet-preferences-page__heading">
          <Text className="onboarding-heading__title">
            {fromSettings ? "更新饮食偏好" : "让计划更适合你"}
          </Text>
          <Text className="onboarding-heading__copy">
            {fromSettings
              ? "习惯、忌口与餐次变化后，下一步会按新偏好重算营养目标。"
              : "告诉我们你的饮食习惯与限制，我们会据此调整每日推荐。"}
          </Text>
          </View>

          <View className="diet-preferences-page__content">
          <View className="diet-preferences-page__section">
            <View className="diet-preferences-page__section-heading">
              <View className="diet-preferences-page__icon-ground">
                <NordicIcon name="food-apple" size={20} ariaLabel="饮食偏好" />
              </View>
              <View>
                <Text className="diet-preferences-page__section-title">饮食偏好</Text>
                <Text className="diet-preferences-page__section-copy">
                  选择最接近日常习惯的一项
                </Text>
              </View>
            </View>
            <View className="diet-preferences-page__choice-grid">
              {dietaryPatternOptions.map((option) => {
                const selected = draft.dietaryPattern === option.value;
                return (
                  <View
                    key={option.value}
                    className={`diet-preferences-page__choice ${
                      selected ? "diet-preferences-page__choice--active" : ""
                    }`}
                    onClick={() => setField("dietaryPattern", option.value)}
                  >
                    <Text className="diet-preferences-page__choice-title">{option.label}</Text>
                    <Text className="diet-preferences-page__choice-copy">{option.description}</Text>
                    <View className="diet-preferences-page__choice-indicator">
                      {selected ? (
                        <NordicIcon name="check-inverse" size={14} ariaLabel="已选择" />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View className="diet-preferences-page__section">
            <View className="diet-preferences-page__section-heading">
              <View className="diet-preferences-page__icon-ground">
                <NordicIcon name="check" size={20} ariaLabel="食物限制" />
              </View>
              <View>
                <Text className="diet-preferences-page__section-title">需要避开的食物</Text>
                <Text className="diet-preferences-page__section-copy">可多选；没有可直接继续</Text>
              </View>
            </View>
            <View className="diet-preferences-page__tag-list">
              {foodAvoidanceOptions.map((option) => {
                const selected = draft.foodAvoidances.includes(option.value);
                return (
                  <View
                    key={option.value}
                    className={`diet-preferences-page__tag ${
                      selected ? "diet-preferences-page__tag--active" : ""
                    }`}
                    onClick={() => toggleAvoidance(option.value)}
                  >
                    <Text>{option.label}</Text>
                    {selected ? <NordicIcon name="check" size={15} ariaLabel="已选择" /> : null}
                  </View>
                );
              })}
            </View>
          </View>

          <View className="diet-preferences-page__section">
            <Text className="diet-preferences-page__section-title">每日餐次</Text>
            <View className="diet-preferences-page__meal-count">
              {mealCountOptions.map((option) => (
                <View
                  key={option.value}
                  className={`diet-preferences-page__meal-option ${
                    draft.mealsPerDay === option.value
                      ? "diet-preferences-page__meal-option--active"
                      : ""
                  }`}
                  onClick={() => setField("mealsPerDay", option.value)}
                >
                  <Text className="diet-preferences-page__meal-number">{option.value}</Text>
                  <Text className="diet-preferences-page__meal-label">餐</Text>
                </View>
              ))}
            </View>
          </View>
          </View>

        </View>

        <BottomActionLayout className="diet-preferences-page__action-source">
            <AppButton size="large" disabled={processing} onClick={() => void regeneratePlan()}>
              <View className="diet-preferences-page__generate-label">
                <Text>{initialButtonLoading ? "正在生成计划" : fromSettings ? "重新生成计划" : "生成我的计划"}</Text>
                {initialButtonLoading ? (
                  <View className="diet-preferences-page__generate-spinner">
                    <NordicIcon name="refresh-cw" size={18} ariaLabel="正在生成计划" />
                  </View>
                ) : null}
              </View>
            </AppButton>
        </BottomActionLayout>
        <PlanTransitionOverlay
          visible={overlayVisible}
          phase={overlayPhase}
          variant={fromSettings ? "regenerate" : "initial"}
        />
      </View>
    </PageLayout>
  );
}
