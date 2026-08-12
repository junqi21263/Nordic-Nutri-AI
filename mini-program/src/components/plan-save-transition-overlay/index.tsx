import { Text, View } from "@tarojs/components";
import type { PlanSaveTransitionPhase } from "../../stores/plan-save-transition-store";
import "./index.scss";

export interface PlanSaveTransitionOverlayProps {
  visible: boolean;
  phase: Exclude<PlanSaveTransitionPhase, "idle">;
  instant?: boolean;
}

export function PlanSaveTransitionOverlay({
  visible,
  phase,
  instant = false,
}: PlanSaveTransitionOverlayProps) {
  if (!visible) return null;
  return (
    <View className={`plan-save-transition-overlay plan-save-transition-overlay--${phase} ${
      instant ? "plan-save-transition-overlay--instant" : ""
    }`} ariaLabel="目标已更新">
      <View className="plan-save-transition-overlay__veil" />
      <View className="plan-save-transition-overlay__center">
        <Text className="plan-save-transition-overlay__mark">✓</Text>
        <Text className="plan-save-transition-overlay__label">已更新</Text>
      </View>
    </View>
  );
}
