import { Text, View } from "@tarojs/components";

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
  return (
    <View
      className={`macro-progress macro-progress--${tone === "sage" ? "protein" : tone === "warning" ? "carbs" : tone}`}
    >
      <View className="macro-progress__row">
        <Text>{label}</Text>
        <Text className="macro-progress__value">
          {value}/{target}
          {unit}
        </Text>
      </View>
      <View className="macro-progress__track">
        <View className="macro-progress__bar" style={{ width: `${progress}%` }} />
      </View>
    </View>
  );
}
