import { Text, View } from "@tarojs/components";
export function Toast({
  message,
  tone = "default",
  visible = true,
}: {
  message: string;
  tone?: "default" | "success" | "error";
  visible?: boolean;
}) {
  return visible ? (
    <View className={`toast toast--${tone}`}>
      <Text>●</Text>
      <Text>{message}</Text>
    </View>
  ) : null;
}
