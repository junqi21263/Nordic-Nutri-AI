import { create } from "zustand";
import { getAdjustedAnalysis, type ScannerMealFixture } from "../features/scanner/domain";
import type { Meal } from "../features/meals/domain";

const readQuantityG = (amount: string) => {
  const match = amount.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? Number(match[1]) : null;
};

const normalizeMultiplier = (value: number) => Math.min(2, Math.max(0.25, Math.round(value * 4) / 4));

const getSavedMultiplier = (meal: Meal) => {
  if (Number.isFinite(meal.portionMultiplier) && (meal.portionMultiplier as number) >= 0.25 && (meal.portionMultiplier as number) <= 2) {
    return normalizeMultiplier(meal.portionMultiplier as number);
  }
  const ratios = meal.items.map((item) => {
    const confirmedQuantityG = readQuantityG(item.amount);
    if (!confirmedQuantityG || !item.aiQuantityG || item.aiQuantityG <= 0) return null;
    return confirmedQuantityG / item.aiQuantityG;
  });
  if (!ratios.length || ratios.some((ratio) => ratio == null)) return 1;
  const first = ratios[0] as number;
  if (ratios.some((ratio) => ratio != null && Math.abs(ratio - first) > 0.01)) return 1;
  return normalizeMultiplier(first);
};

const toScannerFixture = (meal: Meal, multiplier = 1): ScannerMealFixture => ({
  id: `edit-${meal.id}`,
  title: meal.title,
  mealType: meal.mealType,
  imageKey: meal.imageKey ?? "bowl",
  imageUrl: meal.imageUrl ?? null,
  confidence: 100,
  items: meal.items.map((item) => {
    if (multiplier === 1 || !item.aiQuantityG) return { ...item };
    return {
      ...item,
      amount: `${item.aiQuantityG}g`,
      calories: Math.round(item.calories / multiplier),
      protein: Math.round(item.protein / multiplier),
      carbs: Math.round(item.carbs / multiplier),
      fat: Math.round(item.fat / multiplier),
    };
  }),
  insight: meal.insight,
});
export interface PortionDraftStore {
  meal: ScannerMealFixture | null;
  editingMealId: string | null;
  multiplier: number;
  start: (meal: ScannerMealFixture) => void;
  startMealEdit: (meal: Meal) => void;
  setMealType: (mealType: Meal["mealType"]) => void;
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
    start: (meal) => {
      const current = get();
      if (current.editingMealId === null && current.meal?.id === meal.id) return;
      const multiplier = Number.isFinite(meal.portionMultiplier)
        ? normalizeMultiplier(meal.portionMultiplier as number)
        : 1;
      set({ meal, editingMealId: null, multiplier });
    },
    startMealEdit: (meal) => {
      const multiplier = getSavedMultiplier(meal);
      set({ meal: toScannerFixture(meal, multiplier), editingMealId: meal.id, multiplier });
    },
    setMealType: (mealType) =>
      set((state) => (state.meal ? { meal: { ...state.meal, mealType } } : state)),
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
