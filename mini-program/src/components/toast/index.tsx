import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return visible ? (
    <View className={`toast toast--${tone} toast--${presentation}`}>
      {presentation === "status" ? <NordicIcon name={tone === "error" ? "x" : "check"} size={24} ariaLabel={tone === "error" ? t("sharedUi.failure") : t("sharedUi.complete")} /> : presentation === "prominent" ? null : <Text>●</Text>}
      <Text>{message}</Text>
    </View>
  ) : null;
}
