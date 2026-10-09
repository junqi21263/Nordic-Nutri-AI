import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View className="loading">
      <View className="loading__dot" />
      <Text>{label ?? t("sharedUi.loadingContent")}</Text>
    </View>
  );
}
