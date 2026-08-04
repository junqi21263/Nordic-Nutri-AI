import { Image, Text, View } from "@tarojs/components";
import appIcon from "../../assets/brand/app-icon-ui.jpg";
import { useMenuButtonMetrics } from "../../utils/use-menu-button-metrics";

export function BrandHeader() {
  const metrics = useMenuButtonMetrics();
  return (
    <View
      className="brand-header"
      style={{ paddingRight: `${metrics.rightInset}px`, height: `${metrics.totalHeaderHeight}px` }}
    >
      <View className="brand-header__content">
        <Image className="brand-header__logo" src={appIcon} mode="aspectFill" ariaLabel="Nordic Nutri AI" />
        <Text className="brand-header__name">Nordic Nutri AI</Text>
      </View>
    </View>
  );
}
