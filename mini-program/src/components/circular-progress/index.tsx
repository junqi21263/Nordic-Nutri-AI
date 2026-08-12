import { Text, View } from "@tarojs/components";
import { useAnimatedProgress } from "../../hooks/useAnimatedProgress";
import { ProgressFallback } from "../progress-fallback";
import { calculateCircularProgressPercent } from "../../features/meals/nutrition-progress";

export { calculateCircularProgressPercent } from "../../features/meals/nutrition-progress";

export interface CircularProgressProps {
  value: number;
  total: number;
  label: string;
  compact?: boolean;
  tone?: "forest" | "sage" | "amber" | "score";
  fallback?: boolean;
  reveal?: boolean;
  revealDurationMs?: number;
  animateValue?: boolean;
  empty?: boolean;
  detail?: string;
}

export function CircularProgress({
  value,
  total,
  label,
  compact = false,
  tone = "forest",
  fallback = false,
  reveal = true,
  revealDurationMs,
  animateValue = false,
  empty = false,
  detail,
}: CircularProgressProps) {
  const progress = calculateCircularProgressPercent(value, total);
  const animatedProgress = useAnimatedProgress(progress, revealDurationMs, reveal);
  if (fallback) return <ProgressFallback value={progress} label={label} />;
  return (
    <View
      className={`circular-progress circular-progress--${tone} ${compact ? "circular-progress--compact" : ""} ${empty ? "circular-progress--empty" : ""}`}
      style={{ "--progress": `${animatedProgress}%` } as Record<string, string>}
    >
      <View className="circular-progress__content">
        {!empty ? <Text className="circular-progress__value">{`${animateValue ? animatedProgress : progress}%`}</Text> : null}
        <Text className="circular-progress__label">{label}</Text>
        {detail ? <Text className="circular-progress__detail">{detail}</Text> : null}
      </View>
    </View>
  );
}
