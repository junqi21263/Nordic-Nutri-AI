import { Text, View } from "@tarojs/components";
export function Toast({
  message,
  tone = "default",
  presentation = "native",
  visible = true,
}: {
  message: string;
  tone?: "default" | "success" | "error";
  presentation?: "native" | "prominent";
  visible?: boolean;
}) {
  return visible ? (
    <View className={`toast toast--${tone} toast--${presentation}`}>
      <Text>●</Text>
      <Text>{message}</Text>
    </View>
  ) : null;
}
