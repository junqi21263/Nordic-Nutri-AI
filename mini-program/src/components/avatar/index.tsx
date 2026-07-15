import { Text } from "@tarojs/components";
export function Avatar({
  label,
  size = "medium",
}: {
  label: string;
  size?: "small" | "medium" | "large";
}) {
  return <Text className={`avatar avatar--${size}`}>{label}</Text>;
}
