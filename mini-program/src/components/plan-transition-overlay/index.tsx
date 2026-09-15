import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
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
  const label = copyByVariant[variant];
  if (android) {
    return (
      <View className="plan-transition-overlay plan-transition-overlay--android" ariaLabel={label}>
        <View className="plan-transition-overlay__center">
          {phase === "completing" ? (
            <View className="plan-transition-overlay__initial-completion-mark">
              <NordicIcon name="check-inverse" size={28} ariaLabel="计划生成完成" />
            </View>
          ) : <View className="plan-transition-overlay__android-spinner" />}
          <Text className="plan-transition-overlay__android-title">
            {phase === "completing" ? "计划已生成" : label}
          </Text>
          <Text className="plan-transition-overlay__android-copy">
            {phase === "completing" ? "正在打开你的计划" : elapsed >= 10
              ? `已等待 ${elapsed} 秒，服务仍在处理中，请稍候`
              : "正在根据你的资料与饮食偏好生成，请稍候"}
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
