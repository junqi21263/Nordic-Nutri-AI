import { Text, View } from "@tarojs/components";

export function ProgressFallback({ value, label }: { value: number; label: string }) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <View className="progress-fallback">
      <Text className="progress-fallback__value">{percent}%</Text>
      <Text className="progress-fallback__label">{label}</Text>
      <View className="progress-fallback__track">
        <View className="progress-fallback__bar" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}
