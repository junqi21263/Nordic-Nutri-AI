import { Text, View } from "@tarojs/components";
import { AppButton } from "../app-button";

export function EmptyState({
  title = "还没有内容",
  description = "完成下一步后，这里会出现你的记录。",
  actionLabel,
  onAction,
  showMark = true,
}: {
  title?: string;
  /** Pass empty string or null to hide the subtitle. */
  description?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  /** When false, the action button (if any) takes the mark's place. */
  showMark?: boolean;
}) {
  const action =
    actionLabel && onAction ? (
      <AppButton variant="secondary" size="small" onClick={onAction}>
        {actionLabel}
      </AppButton>
    ) : null;

  return (
    <View className="empty-state">
      {showMark ? <View className="empty-state__mark">◇</View> : null}
      {!showMark ? action : null}
      <Text className="empty-state__title">{title}</Text>
      {description ? <Text className="empty-state__description">{description}</Text> : null}
      {showMark ? action : null}
    </View>
  );
}
