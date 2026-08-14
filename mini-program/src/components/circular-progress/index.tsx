import { Text, View } from "@tarojs/components";
import { useAnimatedProgress } from "../../hooks/useAnimatedProgress";
import { ProgressFallback } from "../progress-fallback";
import { calculateCircularProgressPercent } from "../../features/meals/nutrition-progress";

export { calculateCircularProgressPercent } from "../../features/meals/nutrition-progress";

const CIRCULAR_PROGRESS_COLORS = {
  forest: ["#163422", "rgba(22, 52, 34, 0.14)"],
  sage: ["#2f6b45", "rgba(47, 107, 69, 0.18)"],
  amber: ["#9a6700", "rgba(154, 103, 0, 0.18)"],
  score: ["#c9795d", "rgba(201, 121, 93, 0.16)"],
} as const;

const circularProgressBackground = (tone: CircularProgressProps["tone"], progress: number) => {
  const [foreground, track] = CIRCULAR_PROGRESS_COLORS[tone ?? "forest"];
  return `conic-gradient(from -90deg, ${foreground} 0 ${progress}%, ${track} ${progress}% 100%)`;
};

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
      style={{ background: circularProgressBackground(tone, animatedProgress) }}
    >
      <View className="circular-progress__content">
        {!empty ? <Text className="circular-progress__value">{`${animateValue ? animatedProgress : progress}%`}</Text> : null}
        <Text className="circular-progress__label">{label}</Text>
        {detail ? <Text className="circular-progress__detail">{detail}</Text> : null}
      </View>
    </View>
  );
}
