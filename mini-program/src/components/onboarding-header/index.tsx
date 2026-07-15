import { AppNavbar } from "../app-navbar";

export interface OnboardingHeaderProps {
  brand: string;
  step: string;
  progressAriaLabel: string;
  backAriaLabel: string;
  progress?: number;
  onBack: () => void;
}

export function OnboardingHeader({
  brand,
  step,
  progressAriaLabel,
  backAriaLabel,
  progress = 0.25,
  onBack,
}: OnboardingHeaderProps) {
  return (
    <AppNavbar
      title={brand}
      step={step}
      progress={progress}
      progressAriaLabel={progressAriaLabel}
      backAriaLabel={backAriaLabel}
      onBack={onBack}
      variant="onboarding"
    />
  );
}
