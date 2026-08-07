import { create } from "zustand";
import type { Achievement } from "../features/coach/domain";

export interface AchievementUnlockedEvent {
  achievementId: string;
}

export interface AchievementStore {
  userId: string | null;
  achievements: Achievement[];
  achievementUnlocked: AchievementUnlockedEvent | null;
  pendingAchievementUnlocks: AchievementUnlockedEvent[];
  setAchievements: (achievements: Achievement[]) => void;
  setUserId: (userId: string | null) => void;
  markAchievementCelebrated: (achievementId: string) => void;
  dismissAchievementUnlocked: () => void;
  reset: () => void;
}

/**
 * The server is the source of truth for whether a celebration was delivered.
 * The client only queues achievements explicitly marked celebrationPending.
 */
export const createAchievementStore = () =>
  create<AchievementStore>((set, get) => ({
    userId: null,
    achievements: [],
    achievementUnlocked: null,
    pendingAchievementUnlocks: [],
    setUserId: (userId) => {
      if (get().userId === userId) return;
      set({ userId, achievements: [], achievementUnlocked: null, pendingAchievementUnlocks: [] });
    },
    setAchievements: (achievements) => {
      set({ achievements });
      if (!get().userId) return;
      const active = get().achievementUnlocked;
      const activeIds = new Set([
        ...(active ? [active.achievementId] : []),
        ...get().pendingAchievementUnlocks.map((event) => event.achievementId),
      ]);
      const pendingEvents = achievements
        .filter((item) => item.unlocked && item.celebrationPending && !activeIds.has(item.id))
        .map((item) => ({ achievementId: item.id }));
      if (!pendingEvents.length) return;
      const queued = [...get().pendingAchievementUnlocks, ...pendingEvents];
      const nextActive = active ?? queued[0] ?? null;
      const remaining = active ? queued : queued.slice(1);
      set({ achievementUnlocked: nextActive ?? null, pendingAchievementUnlocks: remaining });
    },
    markAchievementCelebrated: (achievementId) => {
      set({
        achievements: get().achievements.map((item) => (
          item.id === achievementId ? { ...item, celebrationPending: false } : item
        )),
      });
    },
    dismissAchievementUnlocked: () => {
      const [nextActive, ...remaining] = get().pendingAchievementUnlocks;
      set({ achievementUnlocked: nextActive ?? null, pendingAchievementUnlocks: remaining });
    },
    reset: () => set({ userId: null, achievements: [], achievementUnlocked: null, pendingAchievementUnlocks: [] }),
  }));

export const useAchievementStore = createAchievementStore();
