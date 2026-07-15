import { Text, View } from "@tarojs/components";
import { AppButton } from "../app-button";
export function EmptyState({
  title = "还没有内容",
  description = "完成下一步后，这里会出现你的记录。",
  actionLabel,
  onAction,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="empty-state">
      <View className="empty-state__mark">◇</View>
      <Text className="empty-state__title">{title}</Text>
      <Text className="empty-state__description">{description}</Text>
      {actionLabel && onAction ? (
        <AppButton variant="secondary" size="small" onClick={onAction}>
          {actionLabel}
        </AppButton>
      ) : null}
    </View>
  );
}
