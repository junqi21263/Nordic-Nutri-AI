export interface NutritionEstimateItem {
  quantityG: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface ManualMealNutrition {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

const format = (value: number, decimals = 1) => {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return String(rounded);
};

export function estimateNutritionFromAnalysis(items: NutritionEstimateItem[]): ManualMealNutrition {
  const totals = items.reduce(
    (sum, item) => {
      const scale = item.quantityG / 100;
      return {
        calories: sum.calories + item.caloriesPer100g * scale,
        protein: sum.protein + item.proteinPer100g * scale,
        carbs: sum.carbs + item.carbsPer100g * scale,
        fat: sum.fat + item.fatPer100g * scale,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    calories: format(totals.calories, 0),
    protein: format(totals.protein),
    carbs: format(totals.carbs),
    fat: format(totals.fat),
  };
}
