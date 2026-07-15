import { Text, View } from "@tarojs/components";

export interface ActionCardProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  mark: string;
  tone?: "dark" | "beige";
}
export function ActionCard({ eyebrow, title, subtitle, mark, tone = "dark" }: ActionCardProps) {
  return (
    <View className={`action-card action-card--${tone}`}>
      <View className="action-card__content">
        <Text className="action-card__eyebrow">{eyebrow}</Text>
        <Text className="action-card__title">{title}</Text>
        <Text className="action-card__subtitle">{subtitle}</Text>
      </View>
      <View className="action-card__mark">{mark}</View>
    </View>
  );
}
