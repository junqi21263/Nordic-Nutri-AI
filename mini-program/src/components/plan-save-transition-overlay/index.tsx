import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <View className={`plan-save-transition-overlay plan-save-transition-overlay--${phase} ${
      instant ? "plan-save-transition-overlay--instant" : ""
    }`} ariaLabel={t("sharedUi.goalUpdated")}>
      <View className="plan-save-transition-overlay__veil" />
      <View className="plan-save-transition-overlay__center">
        <Text className="plan-save-transition-overlay__mark">✓</Text>
        <Text className="plan-save-transition-overlay__label">{t("sharedUi.updated")}</Text>
      </View>
    </View>
  );
}
