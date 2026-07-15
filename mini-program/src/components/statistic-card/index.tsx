import { Text } from "@tarojs/components";
import { AppCard } from "../app-card";

export interface StatisticCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "beige" | "sage";
}
export function StatisticCard({ label, value, hint, tone = "default" }: StatisticCardProps) {
  return (
    <AppCard tone={tone} className="statistic-card">
      <Text className="statistic-card__label">{label}</Text>
      <Text className="statistic-card__value">{value}</Text>
      {hint ? <Text className="statistic-card__hint">{hint}</Text> : null}
    </AppCard>
  );
}
