import { View } from "@tarojs/components";
export function FloatingActionButton({
  label = "+",
  ariaLabel = "新增",
}: {
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <View className="floating-action-button" ariaLabel={ariaLabel}>
      {label}
    </View>
  );
}
