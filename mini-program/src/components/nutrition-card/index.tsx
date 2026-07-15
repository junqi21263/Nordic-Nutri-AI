import { Text, View } from "@tarojs/components";
import { AppCard } from "../app-card";
import { MacroProgress } from "../macro-progress";
import { CircularProgress } from "../circular-progress";
import type { MacroNutrients } from "../../types/nutrition";

export interface NutritionCardProps {
  calories: number;
  calorieTarget: number;
  macros: MacroNutrients;
  targets: MacroNutrients;
}

export function NutritionCard({ calories, calorieTarget, macros, targets }: NutritionCardProps) {
  return (
    <AppCard tone="beige" className="nutrition-card">
      <View className="nutrition-card__top">
        <View>
          <Text className="nutrition-card__label">今日能量</Text>
          <Text className="nutrition-card__kcal">
            {calories}
            <Text className="nutrition-card__unit"> / {calorieTarget} kcal</Text>
          </Text>
        </View>
        <CircularProgress value={calories} total={calorieTarget} label="已完成" compact />
      </View>
      <View className="nutrition-card__macros">
        <View className="nutrition-card__macro">
          <Text className="nutrition-card__macro-label">蛋白质</Text>
          <Text className="nutrition-card__macro-value">
            {macros.protein}/{targets.protein}g
          </Text>
        </View>
        <View className="nutrition-card__macro">
          <Text className="nutrition-card__macro-label">碳水</Text>
          <Text className="nutrition-card__macro-value">
            {macros.carbs}/{targets.carbs}g
          </Text>
        </View>
        <View className="nutrition-card__macro">
          <Text className="nutrition-card__macro-label">脂肪</Text>
          <Text className="nutrition-card__macro-value">
            {macros.fat}/{targets.fat}g
          </Text>
        </View>
      </View>
      <MacroProgress label="蛋白质进度" value={macros.protein} target={targets.protein} />
    </AppCard>
  );
}
