import { Text, View } from "@tarojs/components";
import { NordicIcon } from "../nordic-icon";
import { StitchPlanProcessingCanvas } from "../stitch-plan-processing-canvas";
import "./index.scss";

export type PlanTransitionOverlayPhase = "processing" | "completing";
export type PlanTransitionOverlayVariant = "regenerate" | "initial";

export interface PlanTransitionOverlayProps {
  visible: boolean;
  phase: PlanTransitionOverlayPhase;
  variant: PlanTransitionOverlayVariant;
}

const copyByVariant: Record<PlanTransitionOverlayVariant, string> = {
  regenerate: "正在生成营养计划",
  initial: "正在生成营养计划",
};

export function PlanTransitionOverlay({
  visible,
  phase,
  variant,
}: PlanTransitionOverlayProps) {
  if (!visible) return null;
  const label = copyByVariant[variant];
  const initial = variant === "initial";
  return (
    <View
      className={`plan-transition-overlay plan-transition-overlay--${phase} ${
        initial ? "plan-transition-overlay--initial" : "plan-transition-overlay--regenerate"
      }`}
      ariaLabel={label}
    >
      {initial && phase === "processing" ? <StitchPlanProcessingCanvas /> : null}
      <View className="plan-transition-overlay__center">
        {initial ? (
          phase === "completing" ? (
            <View className="plan-transition-overlay__initial-completion-mark">
              <NordicIcon name="check-inverse" size={48} ariaLabel="计划生成完成" />
            </View>
          ) : null
        ) : phase === "completing" ? (
          <>
            <View className="plan-transition-overlay__bars">
              <View className="plan-transition-overlay__bar" />
              <View className="plan-transition-overlay__bar plan-transition-overlay__bar--2" />
              <View className="plan-transition-overlay__bar plan-transition-overlay__bar--3" />
            </View>
            <Text className="plan-transition-overlay__label">{label}</Text>
            <View className="plan-transition-overlay__initial-completion-mark plan-transition-overlay__completion-mark">
              <NordicIcon name="check-inverse" size={48} ariaLabel="计划生成完成" />
            </View>
          </>
        ) : (
          <>
            <View className="plan-transition-overlay__bars">
              <View className="plan-transition-overlay__bar" />
              <View className="plan-transition-overlay__bar plan-transition-overlay__bar--2" />
              <View className="plan-transition-overlay__bar plan-transition-overlay__bar--3" />
            </View>
            <Text className="plan-transition-overlay__label">{label}</Text>
          </>
        )}
      </View>
    </View>
  );
}
