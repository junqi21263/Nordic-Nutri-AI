const { formulaPlanInsight } = require("./diet-preference-labels.cjs");

function applyDietMacroAdjustments(calories, proteinG, fatG, dietaryPattern) {
  const pattern = dietaryPattern || "none";
  if (pattern === "keto") {
    const fat = Math.round((calories * 0.65) / 9);
    const carbs = Math.max(50, Math.round((calories * 0.1) / 4));
    const protein = Math.max(40, Math.round((calories - fat * 9 - carbs * 4) / 4));
    return { proteinG: protein, fatG: fat, carbsG: carbs };
  }
  if (pattern === "low_carb") {
    const fat = Math.round((calories * 0.4) / 9);
    const carbs = Math.max(50, Math.round((calories * 0.25) / 4));
    const protein = Math.max(40, Math.round((calories - fat * 9 - carbs * 4) / 4));
    return { proteinG: protein, fatG: fat, carbsG: carbs };
  }
  if (pattern === "vegan" || pattern === "vegetarian" || pattern === "pescatarian") {
    const protein = Math.round(proteinG * 1.05);
    const fat = fatG;
    const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
    return { proteinG: protein, fatG: fat, carbsG: carbs };
  }
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  return { proteinG, fatG, carbsG };
}

function formulaNutritionPlanFallback(input) {
  const weightKg = Number(input?.weightKg);
  const heightCm = Number(input?.heightCm);
  const age = Number(input?.age);
  const sex = input?.sex === "female" ? "female" : "male";
  const activityLevel = input?.activityLevel || "moderate";
  const goalType = input?.goalType === "maintain" ? "maintenance" : input?.goalType || "maintenance";
  const dietaryPattern = input?.dietaryPattern || "none";
  const foodAvoidances = Array.isArray(input?.foodAvoidances) ? input.foodAvoidances : [];
  const mealsPerDay = Number(input?.mealsPerDay);
  const activityMultiplier = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
    very_high: 1.9,
  };
  const proteinPerKg = { muscle_gain: 2, fat_loss: 2, maintenance: 1.6, performance: 1.8 };
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const tdee = bmr * (activityMultiplier[activityLevel] || 1.55);
  const rawCalories =
    goalType === "muscle_gain"
      ? tdee + 300
      : goalType === "fat_loss"
        ? tdee - 400
      : goalType === "performance"
        ? tdee * 1.08
          : tdee;
  const calories = Math.round(rawCalories / 10) * 10;
  const baseProteinG = Math.round(weightKg * (proteinPerKg[goalType] || 1.6));
  const baseFatG = Math.round(weightKg * 0.9);
  const macros = applyDietMacroAdjustments(calories, baseProteinG, baseFatG, dietaryPattern);
  return {
    calories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    insight: formulaPlanInsight({
      dietaryPattern,
      foodAvoidances,
      mealsPerDay: Number.isFinite(mealsPerDay) ? mealsPerDay : 3,
    }),
    source: "formula",
  };
}

module.exports = {
  applyDietMacroAdjustments,
  formulaNutritionPlanFallback,
};
