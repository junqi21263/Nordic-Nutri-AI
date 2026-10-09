import { View } from "@tarojs/components";
import type { CSSProperties, PropsWithChildren } from "react";

export function AppSafeArea({
  children,
  className = "",
  style,
}: PropsWithChildren<{ className?: string; style?: CSSProperties }>) {
  return <View className={`app-safe-area ${className}`} style={style}>{children}</View>;
}
