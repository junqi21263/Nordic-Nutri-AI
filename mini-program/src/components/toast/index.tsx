import { Text, View } from "@tarojs/components";
import { NordicIcon } from "../nordic-icon";
export function Toast({
  message,
  tone = "default",
  presentation = "native",
  visible = true,
}: {
  message: string;
  tone?: "default" | "success" | "error";
  presentation?: "native" | "prominent" | "status";
  visible?: boolean;
}) {
  return visible ? (
    <View className={`toast toast--${tone} toast--${presentation}`}>
      {presentation === "status" ? <NordicIcon name={tone === "error" ? "x" : "check"} size={24} ariaLabel={tone === "error" ? "失败" : "完成"} /> : presentation === "prominent" ? null : <Text>●</Text>}
      <Text>{message}</Text>
    </View>
  ) : null;
}
