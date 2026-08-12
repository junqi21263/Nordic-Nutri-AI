import { create } from "zustand";

export type PlanSaveTransitionPhase = "idle" | "success" | "covering" | "revealing";

interface PlanSaveTransitionStore {
  phase: PlanSaveTransitionPhase;
  handoffActive: boolean;
  succeed: () => void;
  cover: () => void;
  reveal: () => void;
  finish: () => void;
  reset: () => void;
}

export const usePlanSaveTransitionStore = create<PlanSaveTransitionStore>((set) => ({
  phase: "idle",
  handoffActive: false,
  succeed: () => set({ phase: "success", handoffActive: true }),
  cover: () => set({ phase: "covering", handoffActive: true }),
  reveal: () => set({ phase: "revealing", handoffActive: true }),
  finish: () => set({ phase: "idle", handoffActive: false }),
  reset: () => set({ phase: "idle", handoffActive: false }),
}));
