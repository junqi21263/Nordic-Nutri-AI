import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

export function PlanTransitionOverlay({
  visible,
  phase,
  variant,
}: PlanTransitionOverlayProps) {
  const { t } = useTranslation();
  const android = process.env.TARO_APP_PLATFORM === "android";
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!android || !visible || phase !== "processing") return;
    setElapsed(0);
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [android, visible, phase]);
  if (!visible) return null;
  const label = t(variant === "initial" ? "nutritionPlan.generating" : "nutritionPlan.regenerating");
  if (android) {
    return (
      <View className="plan-transition-overlay plan-transition-overlay--android" ariaLabel={label}>
        <View className="plan-transition-overlay__center">
          {phase === "completing" ? (
            <View className="plan-transition-overlay__initial-completion-mark">
              <NordicIcon name="check-inverse" size={28} ariaLabel={t("nutritionPlan.generationComplete")} />
            </View>
          ) : <View className="plan-transition-overlay__android-spinner" />}
          <Text className="plan-transition-overlay__android-title">
            {phase === "completing" ? t("nutritionPlan.generationComplete") : label}
          </Text>
          <Text className="plan-transition-overlay__android-copy">
            {phase === "completing" ? t("nutritionPlan.openingPlan") : elapsed >= 10
              ? t("nutritionPlan.waiting", { seconds: elapsed })
              : t("nutritionPlan.generatingDescription")}
          </Text>
        </View>
      </View>
    );
  }
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
              <NordicIcon name="check-inverse" size={48} ariaLabel={t("nutritionPlan.generationComplete")} />
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
              <NordicIcon name="check-inverse" size={48} ariaLabel={t("nutritionPlan.generationComplete")} />
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
