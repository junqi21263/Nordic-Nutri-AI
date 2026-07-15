import { Text } from "@tarojs/components";
import type { PropsWithChildren } from "react";

export function NutritionTag({
  children,
  tone = "protein",
}: PropsWithChildren<{ tone?: "protein" | "carbs" | "fat" }>) {
  return <Text className={`nutrition-tag nutrition-tag--${tone}`}>{children}</Text>;
}
