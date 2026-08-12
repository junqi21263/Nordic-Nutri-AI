import { create } from "zustand";
import type { NutritionPlanPreviewResult } from "../api/product-data-api";
import { nextPlanRegenerationState, type PlanRegenerationState } from "../features/onboarding/plan-regeneration-motion";

interface PlanRegenerationStore {
  state: PlanRegenerationState;
  preview: NutritionPlanPreviewResult | null;
  start: () => boolean;
  succeed: (preview: NutritionPlanPreviewResult) => void;
  navigate: () => void;
  reveal: () => void;
  finish: () => void;
  fail: () => void;
  reset: () => void;
}

export const usePlanRegenerationStore = create<PlanRegenerationStore>((set, get) => ({
  state: "idle",
  preview: null,
  start: () => {
    const current = get().state;
    if (current !== "idle" && current !== "error" && current !== "ready") return false;
    set({ state: "processing", preview: null });
    return true;
  },
  succeed: (preview) => set({ preview, state: nextPlanRegenerationState(get().state, "succeed") }),
  navigate: () => set({ state: nextPlanRegenerationState(get().state, "navigate") }),
  reveal: () => set({ state: nextPlanRegenerationState(get().state, "reveal") }),
  finish: () => set({ state: nextPlanRegenerationState(get().state, "finish"), preview: null }),
  fail: () => set({ preview: null, state: nextPlanRegenerationState(get().state, "fail") }),
  reset: () => set({ state: "idle", preview: null }),
}));
