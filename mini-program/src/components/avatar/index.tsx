import { Image, Text } from "@tarojs/components";
export function Avatar({
  label,
  src = null,
  size = "medium",
}: {
  label: string;
  src?: string | null;
  size?: "small" | "medium" | "large";
}) {
  return src
    ? <Image className={`avatar avatar--${size} avatar--image`} src={src} mode="aspectFill" />
    : <Text className={`avatar avatar--${size}`}>{label}</Text>;
}
