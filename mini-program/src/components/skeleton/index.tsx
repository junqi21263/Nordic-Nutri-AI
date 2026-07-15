import { View } from "@tarojs/components";
export function Skeleton({ variant = "line" }: { variant?: "line" | "card" }) {
  return <View className={`skeleton skeleton--${variant}`} />;
}
