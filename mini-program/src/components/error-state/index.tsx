import { Text, View } from "@tarojs/components";
import { AppButton } from "../app-button";
export function ErrorState({
  title = "暂时无法显示",
  description = "本地内容暂时无法显示，请稍后重试。",
  offline = false,
  retryLabel = "重试",
  onRetry,
}: {
  title?: string;
  description?: string;
  offline?: boolean;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="error-state">
      <View className="error-state__mark">{offline ? "⌁" : "!"}</View>
      <Text className="error-state__title">{title}</Text>
      <Text className="error-state__description">{description}</Text>
      {onRetry ? (
        <AppButton variant="secondary" size="small" onClick={onRetry}>
          {retryLabel}
        </AppButton>
      ) : null}
    </View>
  );
}
