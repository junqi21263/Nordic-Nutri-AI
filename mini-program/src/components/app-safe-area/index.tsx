import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

export function AppSafeArea({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <View className={`app-safe-area ${className}`}>{children}</View>;
}
