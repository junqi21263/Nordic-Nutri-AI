import { Text, View } from "@tarojs/components";
import { useAnimatedProgress } from "../../hooks/useAnimatedProgress";
import { ProgressFallback } from "../progress-fallback";

export interface CircularProgressProps {
  value: number;
  total: number;
  label: string;
  compact?: boolean;
  tone?: "forest" | "sage";
  fallback?: boolean;
}

export function CircularProgress({
  value,
  total,
  label,
  compact = false,
  tone = "forest",
  fallback = false,
}: CircularProgressProps) {
  const progress = Math.min(100, Math.max(0, Math.round((value / Math.max(total, 1)) * 100)));
  const animatedProgress = useAnimatedProgress(progress);
  if (fallback) return <ProgressFallback value={progress} label={label} />;
  return (
    <View
      className={`circular-progress circular-progress--${tone} ${compact ? "circular-progress--compact" : ""}`}
      style={{ "--progress": `${animatedProgress}%` } as Record<string, string>}
    >
      <View className="circular-progress__content">
        {/* Keep the label on the final target so only the ring eases — fewer layout thrash. */}
        <Text className="circular-progress__value">{progress}%</Text>
        <Text className="circular-progress__label">{label}</Text>
      </View>
    </View>
  );
}
