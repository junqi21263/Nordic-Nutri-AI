import { create } from "zustand";
import type { CoachAdvice } from "../features/coach/domain";
export interface CoachStore {
  advice: CoachAdvice[];
  setAdvice: (advice: CoachAdvice[]) => void;
  toggleFavorite: (id: string) => void;
  dismiss: (id: string) => void;
  reset: () => void;
}
export const createCoachStore = () =>
  create<CoachStore>((set) => ({
    advice: [],
    setAdvice: (advice) => set({ advice }),
    toggleFavorite: (id) =>
      set((s) => ({
        advice: s.advice.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a)),
      })),
    dismiss: (id) =>
      set((s) => ({ advice: s.advice.map((a) => (a.id === id ? { ...a, dismissed: true } : a)) })),
    reset: () => set({ advice: [] }),
  }));
export const useCoachStore = createCoachStore();
