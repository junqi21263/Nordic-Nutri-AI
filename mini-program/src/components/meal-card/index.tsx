import { Text, View } from "@tarojs/components";
import { AppCard } from "../app-card";
import type { MealFixture } from "../../types/nutrition";

export interface MealCardProps {
  meal: MealFixture;
  visualTone?: "default" | "green" | "dark";
}

export function MealCard({ meal, visualTone = "green" }: MealCardProps) {
  return (
    <AppCard className="meal-card" flat>
      <View className={`meal-card__visual meal-card__visual--${visualTone}`}>◌</View>
      <View className="meal-card__content">
        <Text className="meal-card__meta">{meal.mealType}</Text>
        <Text className="meal-card__title">{meal.title}</Text>
        <Text className="meal-card__meta">{meal.protein}g 蛋白质</Text>
      </View>
      <Text className="meal-card__kcal">{meal.calories} kcal</Text>
      <Text className="meal-card__chevron">›</Text>
    </AppCard>
  );
}
