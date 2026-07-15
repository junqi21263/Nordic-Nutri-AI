import { Text, View } from "@tarojs/components";
export function LoadingState({ label = "正在准备内容…" }: { label?: string }) {
  return (
    <View className="state">
      <View className="state__mark">○</View>
      <Text className="state__title">加载中</Text>
      <Text className="state__description">{label}</Text>
    </View>
  );
}
