import { create } from "zustand";
import type { Achievement } from "../features/coach/domain";
export interface AchievementStore {
  achievements: Achievement[];
  setAchievements: (achievements: Achievement[]) => void;
  reset: () => void;
}
export const createAchievementStore = () =>
  create<AchievementStore>((set) => ({
    achievements: [],
    setAchievements: (achievements) => set({ achievements }),
    reset: () => set({ achievements: [] }),
  }));
export const useAchievementStore = createAchievementStore();
