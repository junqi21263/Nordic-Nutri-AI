import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

export function AppLayout({ children }: PropsWithChildren) {
  return <View className="app-layout">{children}</View>;
}
