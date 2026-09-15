import { View } from "@tarojs/components";
import { Loading } from "../loading";
export function LoadingState({ label = "正在准备内容…" }: { label?: string }) {
  return (
    <View className="state state--loading">
      <Loading label={label} />
    </View>
  );
}
