import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { AppButton } from "../app-button";
export function ErrorState({
  title,
  description,
  offline = false,
  retryLabel,
  onRetry,
}: {
  title?: string;
  description?: string;
  offline?: boolean;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="error-state">
      <View className="error-state__mark">{offline ? "⌁" : "!"}</View>
      <Text className="error-state__title">{title ?? t("sharedUi.errorTitle")}</Text>
      <Text className="error-state__description">{description ?? t("sharedUi.errorDescription")}</Text>
      {onRetry ? (
        <AppButton variant="secondary" size="small" onClick={onRetry}>
          {retryLabel ?? t("common.retry")}
        </AppButton>
      ) : null}
    </View>
  );
}
