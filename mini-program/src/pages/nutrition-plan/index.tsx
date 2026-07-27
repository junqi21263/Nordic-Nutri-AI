import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { BottomActionLayout } from "../../components/bottom-action-layout";
import { CircularProgress } from "../../components/circular-progress";
import { EmptyState } from "../../components/empty-state";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { OnboardingHeader } from "../../components/onboarding-header";
import {
  calculateNutritionPlan,
  getLocalDateString,
  macroEnergyPercents,
  validateBodyProfile,
} from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { navigateBackOrHome } from "../../utils/navigation";
import {
  completeProductOnboarding,
  previewProductNutritionPlan,
} from "../../api/product-data-api";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useOnboardingDraftStore } from "../../stores/onboarding-draft-store";
import { useProfileStore } from "../../stores/profile-store";
import { markOnboardingCompleted } from "../../utils/local-experience";

const today = getLocalDateString();
const goalLabels = {
  muscle_gain: "精益增肌",
  fat_loss: "稳健减脂",
  maintenance: "保持体型",
  performance: "提升运动表现",
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
  const { draft } = useOnboardingDraftStore();
  const feedback = useFeedbackStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const validation = validateBodyProfile(draft, today);

  useEffect(() => {
    if (!validation.valid || !validation.profile) {
      setIsLoadingPlan(false);
      return;
    }
    const profile = validation.profile;
    const localFallback = (): PlanView => {
      const formula = calculateNutritionPlan(profile);
      return {
        calories: formula.calories,
        proteinG: formula.proteinG,
        carbsG: formula.carbsG,
        fatG: formula.fatG,
        insight: "根据你的身体数据、目标和活动水平，这份计划将帮助你更稳定地接近目标。",
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
        });
        if (cancelled) return;
        setPlan({
          calories: preview.calories,
          proteinG: preview.proteinG,
          carbsG: preview.carbsG,
          fatG: preview.fatG,
          insight:
            preview.insight?.trim() ||
            "根据你的身体数据、目标和活动水平，这份计划将帮助你更稳定地接近目标。",
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
    // Recompute when the validated body profile / diet prefs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
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

  if (!validation.valid || !validation.profile) {
    return (
      <PageLayout
        title="营养计划"
        subtitle="先完成身体资料，才能生成更贴近你的本地预览。"
        eyebrow="计划预览"
        showTabs={false}
        leading="‹"
        onLeadingClick={() => navigateBackOrHome("/pages/body-profile/index")}
      >
        <EmptyState title="还差一点资料" description="返回补全身体数据后，就能看到每日营养目标。" />
        <AppButton size="large" onClick={() => navigateBackOrHome("/pages/body-profile/index")}>
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
      markOnboardingCompleted();
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
    tone: "forest" | "sage";
  }> = [
    { label: "蛋白质", value: activePlan.proteinG, percent: percents.proteinPct, icon: "protein", tone: "forest" },
    { label: "碳水", value: activePlan.carbsG, percent: percents.carbsPct, icon: "carbs", tone: "sage" },
    { label: "脂肪", value: activePlan.fatG, percent: percents.fatPct, icon: "fat", tone: "forest" },
  ];

  return (
    <PageLayout
      title="NOVA AI"
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--onboarding page-layout--nutrition-plan"
    >
      <View className="nutrition-plan-page">
        <OnboardingHeader
          brand="Nordic Nutri AI"
          step="第 4 步，共 4 步"
          progress={1}
          progressAriaLabel="当前为第 4 步，共 4 步"
          backAriaLabel="返回饮食偏好与限制"
          onBack={() => navigateBackOrHome("/pages/diet-preferences/index")}
        />

        <AppCard className="nutrition-plan__plan-ready">
          <View className="nutrition-plan__plan-ready-icon">
            <NordicIcon name="celebration" size={28} ariaLabel="计划已生成" />
          </View>
          <Text className="nutrition-plan__plan-ready-title">你的计划已准备好</Text>
          <Text className="nutrition-plan__plan-ready-copy">
            从今天开始，按自己的节奏稳步前进。
          </Text>
          <View className="nutrition-plan__goal-tag">
            <Text>{goalLabels[profile.goalType]}</Text>
          </View>
        </AppCard>

        <View className="nutrition-plan__insight">
          <Text className="nutrition-plan__insight-label">AI INSIGHT</Text>
          <Text className="nutrition-plan__insight-copy">{activePlan.insight}</Text>
        </View>

        <View className="nutrition-plan__section">
          <Text className="nutrition-plan__section-title">每日目标</Text>
          <AppCard tone="beige" className="nutrition-plan__targets-card">
            <View className="nutrition-plan__calorie-row">
              <View>
                <Text className="nutrition-plan__calorie-label">热量</Text>
                <Text className="nutrition-plan__calorie-value">
                  {isLoadingPlan ? "…" : activePlan.calories}
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
                  />
                  <Text className="nutrition-plan__macro-value">
                    {isLoadingPlan ? "…" : `${macro.value}g`}
                  </Text>
                </View>
              ))}
            </View>
          </AppCard>
        </View>

        <View className="nutrition-plan__section">
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

        <BottomActionLayout>
          <AppButton
            size="large"
            loading={isSaving || isLoadingPlan}
            disabled={!plan || isLoadingPlan}
            onClick={() => void completeOnboarding()}
          >
            开始我的计划
          </AppButton>
          <AppButton
            variant="outline"
            size="large"
            onClick={() => navigateBackOrHome("/pages/diet-preferences/index")}
          >
            调整计划参数
          </AppButton>
        </BottomActionLayout>
      </View>
    </PageLayout>
  );
}
