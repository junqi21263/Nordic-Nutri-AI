import { create } from "zustand";

export interface SavedMealCelebration {
  kind?: "created" | "updated";
  mealId: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  previousCalories: number;
  currentCalories: number;
  targetCalories: number;
  /** Optional, non-blocking handoff after the existing success celebration. */
  afterContinue?: () => Promise<boolean>;
}

interface MealSavedCelebrationStore {
  savedMeal: SavedMealCelebration | null;
  show: (savedMeal: SavedMealCelebration) => void;
  dismiss: () => void;
}

export const createMealSavedCelebrationStore = () =>
  create<MealSavedCelebrationStore>((set) => ({
    savedMeal: null,
    show: (savedMeal) => set({ savedMeal }),
    dismiss: () => set({ savedMeal: null }),
  }));

export const useMealSavedCelebrationStore = createMealSavedCelebrationStore();
