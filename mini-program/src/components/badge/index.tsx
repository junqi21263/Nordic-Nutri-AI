import { Text } from "@tarojs/components";
import type { PropsWithChildren } from "react";
export function Badge({
  children,
  tone = "default",
}: PropsWithChildren<{ tone?: "default" | "success" | "warning" | "error" }>) {
  return <Text className={`badge badge--${tone}`}>{children}</Text>;
}
