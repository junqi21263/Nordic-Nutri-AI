import { Text, View } from "@tarojs/components";
import { NordicIcon } from "../nordic-icon";

export interface AIInsightCardProps {
  label?: string;
  headline?: string;
  content: string;
  loading?: boolean;
  actionLabel?: string;
  onActionClick?: () => void;
}

export function AIInsightCard({
  label = "NOVA AI 洞察",
  headline,
  content,
  loading = false,
  actionLabel,
  onActionClick,
}: AIInsightCardProps) {
  return (
    <View className="ai-insight">
      <View className="ai-insight__top">
        <View className="ai-insight__orb">
          <NordicIcon name="sparkles" size={18} ariaLabel="NOVA AI" />
        </View>
        <Text className="ai-insight__label">{label}</Text>
      </View>
      {headline ? <Text className="ai-insight__headline">{headline}</Text> : null}
      <Text className="ai-insight__content">{loading ? "正在整理今日建议…" : content}</Text>
      {actionLabel ? (
        <View className="ai-insight__action" onClick={onActionClick} ariaLabel={actionLabel}>
          <Text>{actionLabel} ›</Text>
        </View>
      ) : null}
    </View>
  );
}
