import { Text, View } from "@tarojs/components";

export interface SectionTitleProps {
  title: string;
  eyebrow?: string;
  actionLabel?: string;
  onActionClick?: () => void;
}
export function SectionTitle({ title, eyebrow, actionLabel, onActionClick }: SectionTitleProps) {
  return (
    <View className="section-title">
      <View>
        {eyebrow ? <Text className="section-title__eyebrow">{eyebrow}</Text> : null}
        <Text className="section-title__title">{title}</Text>
      </View>
      {actionLabel ? (
        <Text className="section-title__action" onClick={onActionClick}>
          {actionLabel} ›
        </Text>
      ) : null}
    </View>
  );
}
