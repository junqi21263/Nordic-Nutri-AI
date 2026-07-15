import { View } from "@tarojs/components";
import type { PropsWithChildren } from "react";
export function Chip({
  children,
  active = false,
  disabled = false,
  onClick,
}: PropsWithChildren<{ active?: boolean; disabled?: boolean; onClick?: () => void }>) {
  return (
    <View
      className={`chip ${active ? "chip--active" : ""} ${disabled ? "chip--disabled" : ""}`}
      ariaLabel={typeof children === "string" ? children : undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </View>
  );
}
