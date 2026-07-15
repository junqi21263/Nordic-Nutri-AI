import { create } from "zustand";
import type { MacroNutrients } from "../types/nutrition";

export interface DailyNutrition {
  calories: number;
  macros: MacroNutrients;
}
const initialNutrition: DailyNutrition = { calories: 0, macros: { protein: 0, carbs: 0, fat: 0 } };
interface DailyNutritionStore {
  dailyNutrition: DailyNutrition;
  setDailyNutrition: (nutrition: DailyNutrition) => void;
  reset: () => void;
}

export const useDailyNutritionStore = create<DailyNutritionStore>((set) => ({
  dailyNutrition: initialNutrition,
  setDailyNutrition: (dailyNutrition) => set({ dailyNutrition }),
  reset: () => set({ dailyNutrition: initialNutrition }),
}));
