import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { AppButton } from "../app-button";

export function EmptyState({
  title,
  description,
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
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("sharedUi.emptyTitle");
  const resolvedDescription = description === undefined ? t("sharedUi.emptyDescription") : description;
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
      <Text className="empty-state__title">{resolvedTitle}</Text>
      {resolvedDescription ? <Text className="empty-state__description">{resolvedDescription}</Text> : null}
      {showMark ? action : null}
    </View>
  );
}
