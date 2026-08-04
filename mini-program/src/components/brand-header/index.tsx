import { Text, View } from "@tarojs/components";
import { useMenuButtonMetrics } from "../../utils/use-menu-button-metrics";

export function BrandHeader() {
  const metrics = useMenuButtonMetrics();
  return (
    <View
      className="brand-header"
      style={{ paddingRight: `${metrics.rightInset}px`, height: `${metrics.totalHeaderHeight}px` }}
    >
      <View className="brand-header__content">
        <Text className="brand-header__name">Nordic Nutri AI</Text>
      </View>
    </View>
  );
}
