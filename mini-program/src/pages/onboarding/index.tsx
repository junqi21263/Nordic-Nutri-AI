import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { AppButton } from "../../components/app-button";
import { BottomActionLayout } from "../../components/bottom-action-layout";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { OnboardingHeader } from "../../components/onboarding-header";
import { getLocaleMessages } from "../../locales";
import { PageLayout } from "../../layouts/page-layout";
import { type GoalType } from "../../features/onboarding/domain";
import { queueOnboardingDraftSync } from "../../features/onboarding/onboarding-draft-cloud-sync";
import { useOnboardingDraftStore } from "../../stores/onboarding-draft-store";
import { useEffect } from "react";
import { navigateBackOrHome } from "../../utils/navigation";

const onboardingCopy = getLocaleMessages().onboarding;
const goals: Array<{ key: GoalType; icon: NordicIconName }> = [
  { key: "muscle_gain", icon: "goal-muscle" },
  { key: "fat_loss", icon: "goal-fat-loss" },
  { key: "maintenance", icon: "goal-maintenance" },
  { key: "performance", icon: "goal-performance" },
];

export default function OnboardingPage() {
  const { draft, setField } = useOnboardingDraftStore();
  const canContinue = Boolean(draft.goalType);

  useEffect(() => {
    queueOnboardingDraftSync(draft);
  }, [draft]);

  const continueToBodyProfile = () => {
    if (!draft.goalType) return;
    Taro.navigateTo({ url: "/pages/body-profile/index" });
  };

  return (
    <PageLayout
      title={onboardingCopy.brand}
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--onboarding"
    >
      <View className="onboarding-page">
        <OnboardingHeader
          brand={onboardingCopy.brand}
          step={onboardingCopy.step}
          progressAriaLabel={onboardingCopy.progressAriaLabel}
          backAriaLabel={onboardingCopy.backAriaLabel}
          onBack={() => navigateBackOrHome("/pages/onboarding/index")}
        />
        <View className="onboarding-heading">
          <Text className="onboarding-heading__title">{onboardingCopy.title}</Text>
          <Text className="onboarding-heading__copy">{onboardingCopy.subtitle}</Text>
        </View>
        <View className="onboarding-goal-list">
          {goals.map((goal) => {
            const selected = draft.goalType === goal.key;
            const goalCopy = onboardingCopy.goals[goal.key];
            return (
              <View
                key={goal.key}
                className={`onboarding-goal-card ${selected ? "onboarding-goal-card--selected" : ""}`}
                ariaLabel={goalCopy.title}
                onClick={() => setField("goalType", goal.key)}
              >
                <View className="onboarding-goal-card__icon-ground">
                  <NordicIcon name={goal.icon} ariaLabel={goalCopy.title} />
                </View>
                <View className="onboarding-goal-card__content">
                  <Text className="onboarding-goal-card__title">{goalCopy.title}</Text>
                  <Text className="onboarding-goal-card__copy">{goalCopy.description}</Text>
                </View>
                <View className="onboarding-goal-card__indicator">
                  {selected ? (
                    <NordicIcon name="check-inverse" size={15} ariaLabel="已选择" />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
        <BottomActionLayout>
          <AppButton
            ariaLabel={onboardingCopy.continue}
            size="large"
            disabled={!canContinue}
            onClick={continueToBodyProfile}
          >
            {onboardingCopy.continue}
          </AppButton>
        </BottomActionLayout>
      </View>
    </PageLayout>
  );
}
