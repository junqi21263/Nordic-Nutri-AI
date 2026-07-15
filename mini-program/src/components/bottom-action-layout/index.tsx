import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

export interface BottomActionLayoutProps extends PropsWithChildren {
  stacked?: boolean;
}

export function BottomActionLayout({ children, stacked = true }: BottomActionLayoutProps) {
  return (
    <View
      className={`bottom-action-layout ${
        stacked ? "bottom-action-layout--stacked" : "bottom-action-layout--inline"
      }`}
    >
      {children}
    </View>
  );
}
