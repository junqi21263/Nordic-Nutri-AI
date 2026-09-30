import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { NordicIcon } from "../nordic-icon";

export interface AIInsightCardProps {
  className?: string;
  motionLayer?: "content";
  label?: string;
  headline?: string;
  content: string;
  loading?: boolean;
  actionLabel?: string;
  onActionClick?: () => void;
}

export function AIInsightCard({
  className = "",
  motionLayer,
  label,
  headline,
  content,
  loading = false,
  actionLabel,
  onActionClick,
}: AIInsightCardProps) {
  const { t } = useTranslation();
  return (
    <View className={`ai-insight ${className}`} data-motion-layer={motionLayer}>
      <View className="ai-insight__top">
        <View className="ai-insight__orb">
          <NordicIcon name="nova" size={18} ariaLabel={t("sharedUi.novaInsight")} />
        </View>
        <Text className="ai-insight__label">{label ?? t("sharedUi.novaInsight")}</Text>
      </View>
      {headline ? <Text className="ai-insight__headline">{headline}</Text> : null}
      <Text className="ai-insight__content">{loading ? t("coachPage.tipLoading") : content}</Text>
      {actionLabel ? (
        <View className="ai-insight__action" onClick={onActionClick} ariaLabel={actionLabel}>
          <Text>{actionLabel} ›</Text>
        </View>
      ) : null}
    </View>
  );
}
