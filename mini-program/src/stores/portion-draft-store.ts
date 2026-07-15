import { create } from "zustand";
import { getAdjustedAnalysis, type ScannerMealFixture } from "../features/scanner/domain";
import type { Meal } from "../features/meals/domain";

const toScannerFixture = (meal: Meal): ScannerMealFixture => ({
  id: `edit-${meal.id}`,
  title: meal.title,
  mealType: meal.mealType,
  imageKey: meal.imageKey ?? "bowl",
  confidence: 100,
  items: meal.items.map((item) => ({ ...item })),
  insight: meal.insight,
});
export interface PortionDraftStore {
  meal: ScannerMealFixture | null;
  editingMealId: string | null;
  multiplier: number;
  start: (meal: ScannerMealFixture) => void;
  startMealEdit: (meal: Meal) => void;
  setMultiplier: (multiplier: number) => void;
  adjustBy: (delta: number) => void;
  getAdjusted: () => ReturnType<typeof getAdjustedAnalysis> | null;
  reset: () => void;
}
export const createPortionDraftStore = () =>
  create<PortionDraftStore>((set, get) => ({
    meal: null,
    editingMealId: null,
    multiplier: 1,
    start: (meal) => set({ meal, editingMealId: null, multiplier: 1 }),
    startMealEdit: (meal) =>
      set({ meal: toScannerFixture(meal), editingMealId: meal.id, multiplier: 1 }),
    setMultiplier: (multiplier) => set({ multiplier: Math.min(2, Math.max(0.25, multiplier)) }),
    adjustBy: (delta) =>
      set((state) => ({ multiplier: Math.min(2, Math.max(0.25, state.multiplier + delta)) })),
    getAdjusted: () => {
      const state = get();
      return state.meal ? getAdjustedAnalysis(state.meal, state.multiplier) : null;
    },
    reset: () => set({ meal: null, editingMealId: null, multiplier: 1 }),
  }));
export const usePortionDraftStore = createPortionDraftStore();
