import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

export interface BottomActionLayoutProps extends PropsWithChildren {
  stacked?: boolean;
  className?: string;
}

export function BottomActionLayout({ children, stacked = true, className }: BottomActionLayoutProps) {
  return (
    <View
      className={`bottom-action-layout ${
        stacked ? "bottom-action-layout--stacked" : "bottom-action-layout--inline"
      } ${className ?? ""}`}
    >
      {children}
    </View>
  );
}
