import { Text, View } from "@tarojs/components";
import { AnimatedProgressBar } from "../animated-progress-bar";

export interface MacroProgressProps {
  label: string;
  value: number;
  target: number;
  unit?: string;
  tone?: "forest" | "protein" | "carbs" | "fat" | "sage" | "warning";
}

export function MacroProgress({
  label,
  value,
  target,
  unit = "g",
  tone = "protein",
}: MacroProgressProps) {
  const progress = Math.min(100, Math.max(0, Math.round((value / Math.max(target, 1)) * 100)));
  const exceeded = target > 0 && value > target;
  const toneClass =
    tone === "sage" ? "protein" : tone === "warning" ? "carbs" : tone;
  return (
    <View
      className={`macro-progress macro-progress--${toneClass} ${exceeded ? "macro-progress--exceeded" : ""}`}
    >
      <View className="macro-progress__row">
        <Text>{label}</Text>
        <Text className="macro-progress__value">
          {value}/{target}
          {unit}
        </Text>
      </View>
      <View className="macro-progress__track">
        <AnimatedProgressBar className="macro-progress__bar animated-progress-bar" percent={progress} />
      </View>
    </View>
  );
}
