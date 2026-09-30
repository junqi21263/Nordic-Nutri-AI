import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";

export interface PullDownRefreshIndicatorProps {
  refreshing?: boolean;
}

export function PullDownRefreshIndicator({ refreshing = false }: PullDownRefreshIndicatorProps) {
  const { t } = useTranslation();
  if (!refreshing) return null;

  return (
    <View className="pull-down-refresh" ariaLabel={t("sharedUi.refreshing")}>
      <Text className="pull-down-refresh__dot">·</Text>
      <Text className="pull-down-refresh__dot">·</Text>
      <Text className="pull-down-refresh__dot">·</Text>
    </View>
  );
}
