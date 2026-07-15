import type { GoalType } from "../features/onboarding/domain";

export type AppLocale = "zh-CN" | "zh-TW" | "en-US";

export interface GoalCopy {
  title: string;
  description: string;
}

export interface OnboardingCopy {
  brand: string;
  step: string;
  progressAriaLabel: string;
  backAriaLabel: string;
  title: string;
  subtitle: string;
  continue: string;
  goals: Record<GoalType, GoalCopy>;
}

export interface LocaleMessages {
  onboarding: OnboardingCopy;
}

export interface LocaleOverrides {
  onboarding?: Partial<Omit<OnboardingCopy, "goals">> & {
    goals?: Partial<Record<GoalType, GoalCopy>>;
  };
}
