import { View } from "@tarojs/components";
import { useDeferredProgress } from "../../hooks/useAnimatedProgress";

export function AnimatedProgressBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const progress = useDeferredProgress(percent);
  const scale = Math.min(100, Math.max(0, progress)) / 100;
  return (
    <View
      className={`animated-progress-bar ${className ?? ""}`.trim()}
      style={{ transform: `scaleX(${scale})` }}
    />
  );
}
