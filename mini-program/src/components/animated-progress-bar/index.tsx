import { View } from "@tarojs/components";
import { useDeferredProgress } from "../../hooks/useAnimatedProgress";

export function AnimatedProgressBar({
  percent,
  className,
  reveal = true,
  delayMs = 16,
  durationMs,
}: {
  percent: number;
  className?: string;
  reveal?: boolean;
  delayMs?: number;
  durationMs?: number;
}) {
  const progress = useDeferredProgress(percent, delayMs, reveal);
  const scale = Math.min(100, Math.max(0, progress)) / 100;
  return (
    <View
      className={`animated-progress-bar ${className ?? ""}`.trim()}
      style={{
        transform: `scaleX(${scale})`,
        ...(durationMs ? { transitionDuration: `${durationMs}ms` } : {}),
      }}
    />
  );
}
