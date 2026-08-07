import { Text, View } from "@tarojs/components";

export interface PullDownRefreshIndicatorProps {
  refreshing?: boolean;
}

export function PullDownRefreshIndicator({ refreshing = false }: PullDownRefreshIndicatorProps) {
  if (!refreshing) return null;

  return (
    <View className="pull-down-refresh" ariaLabel="正在刷新">
      <Text className="pull-down-refresh__dot">·</Text>
      <Text className="pull-down-refresh__dot">·</Text>
      <Text className="pull-down-refresh__dot">·</Text>
    </View>
  );
}
