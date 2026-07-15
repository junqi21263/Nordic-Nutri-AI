import { Text, View } from "@tarojs/components";
export function Loading({ label = "正在准备营养视图" }: { label?: string }) {
  return (
    <View className="loading">
      <View className="loading__dot" />
      <Text>{label}</Text>
    </View>
  );
}
